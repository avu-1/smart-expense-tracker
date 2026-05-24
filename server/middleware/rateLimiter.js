// middleware/rateLimiter.js
// Redis-backed sliding-window rate limiter.
// Falls back to a simple in-memory map when Redis is unavailable so the app
// always stays running — in-memory limits are per-process and reset on restart.

const { cacheGet, cacheSet } = require('../config/redis');

// In-memory fallback store  { key: { count, resetAt } }
const memoryStore = new Map();

// ---------------------------------------------------------------------------
// Core limiter factory
// ---------------------------------------------------------------------------

/**
 * Create an Express rate-limiting middleware.
 *
 * @param {Object} options
 * @param {number}  options.windowMs   - Time window in milliseconds
 * @param {number}  options.max        - Max requests per window
 * @param {string}  options.keyPrefix  - Redis key prefix (e.g. 'rl:auth')
 * @param {string}  [options.message]  - Error message when limit exceeded
 * @returns {Function} Express middleware
 */
const createRateLimiter = ({ windowMs, max, keyPrefix, message }) => {
  const windowSec = Math.ceil(windowMs / 1000);
  const defaultMessage = message || `Too many requests. Please try again after ${Math.ceil(windowMs / 60000)} minute(s).`;

  return async (req, res, next) => {
    // Use IP as the identifier; for auth routes you could also use req.body.email
    // BUG-11 FIX: req.connection is deprecated in Node ≥ v13; use req.socket instead
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;

    try {
      // Try Redis path
      let record = await cacheGet(key);

      if (!record) {
        // First request in this window
        record = { count: 1, resetAt: Date.now() + windowMs };
        await cacheSet(key, record, windowSec);
      } else {
        record.count += 1;
        // Preserve remaining TTL (approximate)
        const remainingSec = Math.max(1, Math.ceil((record.resetAt - Date.now()) / 1000));
        await cacheSet(key, record, remainingSec);
      }

      // Set standard rate-limit response headers
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
      res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetAt / 1000));

      if (record.count > max) {
        return res.status(429).json({ success: false, message: defaultMessage });
      }

      return next();
    } catch {
      // Redis unavailable — fall back to in-memory
      const now = Date.now();
      let mem = memoryStore.get(key);

      if (!mem || now > mem.resetAt) {
        mem = { count: 1, resetAt: now + windowMs };
      } else {
        mem.count += 1;
      }
      memoryStore.set(key, mem);

      if (mem.count > max) {
        return res.status(429).json({ success: false, message: defaultMessage });
      }

      return next();
    }
  };
};

// ---------------------------------------------------------------------------
// Pre-configured limiters for common use-cases
// ---------------------------------------------------------------------------

/** Strict limiter for auth endpoints (login, register, refresh-token) */
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  keyPrefix: 'rl:auth',
  message: 'Too many auth attempts. Please wait 15 minutes before trying again.',
});

/** Standard API limiter for all other routes */
const apiLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  keyPrefix: 'rl:api',
  message: 'Rate limit exceeded. Please slow down your requests.',
});

/** Strict limiter for AI insights (expensive operation) */
const insightsLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // Increased from 10: requests are cached anyway, so this just prevents UI spam
  keyPrefix: 'rl:insights',
  message: 'AI insights limit reached. Please try again later.',
});

module.exports = { createRateLimiter, authLimiter, apiLimiter, insightsLimiter };
