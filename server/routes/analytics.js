// routes/analytics.js
const express = require('express');
const { getDashboard, getYearlyAnalytics } = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');
const router = express.Router();
router.use(protect);
router.get('/dashboard', getDashboard);
router.get('/yearly', getYearlyAnalytics);
module.exports = router;
