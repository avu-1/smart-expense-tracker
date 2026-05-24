// middleware/auth.js (UPGRADED — validates short-lived access tokens)
// The access token now expires in 15m (configurable).
// When it expires, the client calls POST /api/auth/refresh-token to get a new one.

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authorized — no token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Reject refresh tokens accidentally sent as access tokens
    if (decoded.type && decoded.type !== 'access') {
      return res.status(401).json({ message: 'Invalid token type' });
    }

    const user = await User.findById(decoded.id).select('-password -refreshTokens');
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      // Tell the client to use the refresh-token endpoint
      return res.status(401).json({ message: 'Access token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(500).json({ message: 'Auth middleware error' });
  }
};

module.exports = { protect };
