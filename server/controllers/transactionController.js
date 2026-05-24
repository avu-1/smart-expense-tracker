// controllers/transactionController.js - CRUD for transactions (UPGRADED)
const { validationResult } = require('express-validator');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { sendTransactionConfirmation } = require('../services/emailService');
const { cacheDelPattern } = require('../config/redis');

// Helper: invalidate all analytics cache for a user after data changes
const invalidateUserCache = async (userId) => {
  await cacheDelPattern(`analytics:${userId}:*`);
  await cacheDelPattern(`insights:*:${userId}:*`);
};

// Helper: parse a date value from the client.
// Date-only strings like "2026-05-22" are parsed as UTC NOON (12:00) so they
// always land safely in the middle of the UTC day — never on a midnight
// boundary where TZ offsets could push them into the wrong month.
const parseUserDate = (value) => {
  if (!value) return new Date();
  const str = String(value);
  // YYYY-MM-DD  →  set to noon UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  }
  return new Date(value);
};

// @route   GET /api/transactions
// @desc    Get all transactions for logged-in user (with filters)
// @access  Private
const getTransactions = async (req, res, next) => {
  try {
    const { type, category, startDate, endDate, limit = 50, page = 1 } = req.query;

    // Build dynamic filter object
    const filter = { userId: req.user._id };
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const safeLimit = parseInt(limit) || 50;
    const safePage = parseInt(page) || 1;
    const skip = (safePage - 1) * safeLimit;

    // Fetch transactions with pagination
    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ date: -1 }) // Most recent first
        .limit(safeLimit)
        .skip(skip),
      Transaction.countDocuments(filter),
    ]);

    res.json({
      success: true,
      transactions,
      pagination: {
        total,
        page: safePage,
        pages: Math.ceil(total / safeLimit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/transactions
// @desc    Add a new transaction
// @access  Private
const addTransaction = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { amount, type, category, date, note } = req.body;

    const transaction = await Transaction.create({
      userId: req.user._id,
      amount,
      type,
      category,
      date: parseUserDate(date),
      note,
    });

    // Invalidate cached analytics since data changed
    await invalidateUserCache(req.user._id);

    // Optionally send confirmation email (fire-and-forget)
    try {
      const user = await User.findById(req.user._id).select('name email emailNotifications');
      if (user?.emailNotifications?.transactionConfirm) {
        sendTransactionConfirmation(user, transaction).catch(() => {});
      }
    } catch (_) {} // Never fail the main response for an email

    res.status(201).json({
      success: true,
      message: 'Transaction added successfully',
      transaction,
    });
  } catch (error) {
    next(error);
  }
};

// @route   PUT /api/transactions/:id
// @desc    Update a transaction
// @access  Private
const updateTransaction = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    // Find transaction and ensure it belongs to the logged-in user
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const { amount, type, category, date, note } = req.body;

    // Update only provided fields
    if (amount   !== undefined) transaction.amount   = amount;
    if (type     !== undefined) transaction.type     = type;
    if (category !== undefined) transaction.category = category;
    if (date     !== undefined) transaction.date     = parseUserDate(date);
    if (note     !== undefined) transaction.note     = note;

    await transaction.save();

    await invalidateUserCache(req.user._id);

    res.json({
      success: true,
      message: 'Transaction updated',
      transaction,
    });
  } catch (error) {
    next(error);
  }
};

// @route   DELETE /api/transactions/:id
// @desc    Delete a transaction
// @access  Private
const deleteTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    await invalidateUserCache(req.user._id);

    res.json({
      success: true,
      message: 'Transaction deleted',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getTransactions, addTransaction, updateTransaction, deleteTransaction };
