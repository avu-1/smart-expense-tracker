// config/redis.js - Redis client with graceful fallback
// If Redis is not available, the app still works (just without caching)
const { createClient } = require('redis');

let redisClient = null;
let isRedisConnected = false;

const connectRedis = async () => {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    redisClient.on('error', (err) => {
      // Silently handle Redis errors - app works without cache
      isRedisConnected = false;
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis Connected');
      isRedisConnected = true;
    });

    await redisClient.connect();
  } catch (error) {
    console.log('⚠️  Redis not available - running without cache');
    isRedisConnected = false;
  }
};

// Cache GET helper - returns null if Redis is down
const cacheGet = async (key) => {
  if (!isRedisConnected || !redisClient) return null;
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

// Cache SET helper - silently fails if Redis is down
const cacheSet = async (key, value, expirySeconds = 300) => {
  if (!isRedisConnected || !redisClient) return;
  try {
    await redisClient.setEx(key, expirySeconds, JSON.stringify(value));
  } catch {
    // Ignore cache set errors
  }
};

// Cache DELETE helper - for invalidating stale cache
const cacheDel = async (key) => {
  if (!isRedisConnected || !redisClient) return;
  try {
    await redisClient.del(key);
  } catch {
    // Ignore
  }
};

// Delete all cache keys matching a pattern — uses SCAN (safe on all Redis providers)
const cacheDelPattern = async (pattern) => {
  if (!isRedisConnected || !redisClient) return;
  try {
    let cursor = 0;
    const keysToDelete = [];
    do {
      const result = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      keysToDelete.push(...result.keys);
    } while (cursor !== 0);
    if (keysToDelete.length > 0) {
      await redisClient.del(keysToDelete);
    }
  } catch {
    // Ignore
  }
};

module.exports = { connectRedis, cacheGet, cacheSet, cacheDel, cacheDelPattern };
