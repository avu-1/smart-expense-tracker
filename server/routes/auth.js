// routes/auth.js (UPGRADED — adds refresh-token, logout, rate limiting)
const express = require('express');
const { body } = require('express-validator');
const { register, login, refreshToken, logout, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Apply strict rate limiting to all auth endpoints
router.use(authLimiter);

router.post(
  '/register',
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  register
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  login
);

// New routes for token rotation
router.post('/refresh-token', refreshToken);
// BUG-02 FIX: logout no longer requires a valid access token (works on expired token too)
router.post('/logout', logout);
router.get('/me', protect, getMe);

module.exports = router;
