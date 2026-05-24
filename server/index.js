// index.js — SpendWise server entry point (UPGRADED)
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const { connectRedis } = require('./config/redis');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const { initCronJobs } = require('./services/cronService');

const app = express();
const PORT = process.env.PORT || 5000;

// --- Connect to databases ---
connectDB().then(() => {
  // Only start cron jobs after DB is ready
  initCronJobs();
});
connectRedis();

// --- Core Middleware ---
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true, // Required for cookies (refresh tokens)
}));
app.use(cookieParser());                       // Parse httpOnly cookies
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// Apply general rate limiting to all /api routes
app.use('/api', apiLimiter);

// --- API Routes ---
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/analytics',    require('./routes/analytics'));
app.use('/api/budget',       require('./routes/budget'));
app.use('/api/insights',     require('./routes/insights'));
app.use('/api/recurring',    require('./routes/recurring'));  // NEW

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', app: 'SpendWise', timestamp: new Date().toISOString() });
});

// Manual cron trigger (dev/admin use — protect in production!)
if (process.env.NODE_ENV !== 'production') {
  const { executeRecurringTransactions, sendUpcomingReminders } = require('./services/cronService');
  app.post('/api/admin/run-recurring', async (req, res) => {
    await executeRecurringTransactions();
    res.json({ success: true, message: 'Recurring transactions processed' });
  });
  app.post('/api/admin/run-reminders', async (req, res) => {
    await sendUpcomingReminders();
    res.json({ success: true, message: 'Reminders sent' });
  });
}

// --- Serve React client in production ---
if (process.env.NODE_ENV === 'production') {
  // Serve static files from the React build
  app.use(express.static(path.join(__dirname, '..', 'client', 'build')));

  // Any non-API route → send React's index.html (for client-side routing)
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'build', 'index.html'));
  });
} else {
  // 404 fallback (dev only — in prod, React handles unknown routes)
  app.use('*', (req, res) => {
    res.status(404).json({ message: `Route ${req.originalUrl} not found` });
  });
}

// Centralised error handler (must be last)
app.use(errorHandler);

// BUG-N2 FIX: capture the server instance so we can attach an error handler.
// Without this, EADDRINUSE (port already in use) throws an unhandled exception
// and crashes nodemon with a confusing stack trace.
const server = app.listen(PORT, () => {
  console.log(`\n🚀 SpendWise server running on http://localhost:${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 API Base:    http://localhost:${PORT}/api\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use. Kill the existing process or change PORT in .env\n`);
    process.exit(1);
  } else {
    throw err;
  }
});

module.exports = app;

