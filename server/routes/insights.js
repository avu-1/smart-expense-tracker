// routes/insights.js (UPGRADED — adds /ai endpoint with rate limiting)
const express = require('express');
const { getInsights, getAIInsights } = require('../controllers/insightsController');
const { protect } = require('../middleware/auth');
const { insightsLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
router.use(protect);

// Standard mock insights (fast, no API cost, no rate limit)
router.get('/', getInsights);

// Gemini-powered insights (rate-limited to 10/hour per IP)
router.get('/ai', insightsLimiter, getAIInsights);

module.exports = router;
