// controllers/authController.js (UPGRADED — Access + Refresh Token flow)
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/** Short-lived access token (15 min default) */
const generateAccessToken = (userId) =>
  jwt.sign({ id: userId, type: 'access' }, process.env.JWT_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES || '15m',
  });

/** Long-lived refresh token — opaque random string stored hashed in DB */
const generateRefreshToken = () => crypto.randomBytes(40).toString('hex');

/** Hash before DB storage so raw tokens never persist */
const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

// ---------------------------------------------------------------------------
// @route   POST /api/auth/register
// ---------------------------------------------------------------------------
const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email: email.toLowerCase(), password: hashedPassword });

    const accessToken  = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken();

    user.refreshTokens = [hashToken(refreshToken)];
    await user.save();

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      accessToken,
      user: { id: user._id, name: user.name, email: user.email, currency: user.currency },
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// @route   POST /api/auth/login
// ---------------------------------------------------------------------------
const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password +refreshTokens');
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid email or password' });

    const accessToken  = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken();

    // Cap stored tokens at 5 (multi-device support)
    user.refreshTokens = [...(user.refreshTokens || []), hashToken(refreshToken)].slice(-5);
    await user.save();

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      message: 'Login successful',
      accessToken,
      user: { id: user._id, name: user.name, email: user.email, currency: user.currency },
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// @route   POST /api/auth/refresh-token
// @desc    Issue new access token via valid refresh token (rotation)
// ---------------------------------------------------------------------------
const refreshToken = async (req, res, next) => {
  try {
    const incoming = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!incoming) return res.status(401).json({ message: 'Refresh token not provided' });

    const hashed = hashToken(incoming);
    const user = await User.findOne({ refreshTokens: hashed }).select('+refreshTokens');
    if (!user) return res.status(401).json({ message: 'Invalid or expired refresh token' });

    // Rotate tokens
    user.refreshTokens = user.refreshTokens.filter((t) => t !== hashed);

    const newAccess  = generateAccessToken(user._id);
    const newRefresh = generateRefreshToken();

    user.refreshTokens = [...user.refreshTokens, hashToken(newRefresh)].slice(-5);
    await user.save();

    res.cookie('refreshToken', newRefresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, accessToken: newAccess });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// @route   POST /api/auth/logout
// ---------------------------------------------------------------------------
// BUG-02 FIX: Logout must work even when the access token is expired.
// We no longer require a valid access token — we only need the refresh cookie
// to remove that specific token from the DB. If there's no cookie, we still
// clear client state and return success.
const logout = async (req, res, next) => {
  try {
    const incoming = req.cookies?.refreshToken || req.body?.refreshToken;
    if (incoming) {
      // Find the user by hashed refresh token and remove it
      await User.findOneAndUpdate(
        { refreshTokens: hashToken(incoming) },
        { $pull: { refreshTokens: hashToken(incoming) } }
      );
    }
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// @route   GET /api/auth/me
// ---------------------------------------------------------------------------
const getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};

module.exports = { register, login, refreshToken, logout, getMe };
