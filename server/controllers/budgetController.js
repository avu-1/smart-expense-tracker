// controllers/budgetController.js (UPGRADED — email alerts on budget thresholds)
const { validationResult } = require('express-validator');
const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { sendBudgetExceededAlert, sendBudgetWarningAlert } = require('../services/emailService');

// Helper: get total expense for a month
const getMonthlyExpense = async (userId, month) => {
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(year, mon - 1, 1);
  const end   = new Date(year, mon, 0, 23, 59, 59);

  const result = await Transaction.aggregate([
    // BUG-N6 FIX: userId is already an ObjectId from req.user._id — no need to stringify and re-parse
    { $match: { userId, type: 'expense', date: { $gte: start, $lte: end } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  return result[0]?.total || 0;
};

// @route   GET /api/budget
const getBudget = async (req, res, next) => {
  try {
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const { month = defaultMonth } = req.query;

    const budget = await Budget.findOne({ userId: req.user._id, month });
    if (!budget) return res.json({ success: true, budget: null, message: 'No budget set for this month' });

    const totalSpent = await getMonthlyExpense(req.user._id, month);
    const remaining  = budget.limit - totalSpent;
    const percentage = Math.round((totalSpent / budget.limit) * 100);

    res.json({
      success: true,
      budget: {
        ...budget.toObject(),
        spent: totalSpent,
        remaining,
        percentage,
        exceeded: totalSpent > budget.limit,
        status: percentage >= 100 ? 'exceeded' : percentage >= 80 ? 'warning' : 'safe',
      },
    });
  } catch (err) {
    next(err);
  }
};

// @route   POST /api/budget
const setBudget = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const { limit, month = defaultMonth } = req.body;

    const budget = await Budget.findOneAndUpdate(
      { userId: req.user._id, month },
      { limit },
      { new: true, upsert: true, runValidators: true }
    );

    // Check if already over the new limit and alert
    const totalSpent = await getMonthlyExpense(req.user._id, month);
    const percentage = Math.round((totalSpent / limit) * 100);

    if (percentage >= 80) {
      // Fire-and-forget email — don't block the API response
      const user = await User.findById(req.user._id).select('name email emailNotifications');
      if (user?.emailNotifications?.budgetAlert) {
        const budgetData = { limit, spent: totalSpent, remaining: limit - totalSpent, percentage, month };
        if (percentage >= 100) {
          sendBudgetExceededAlert(user, budgetData).catch(() => {});
        } else {
          sendBudgetWarningAlert(user, budgetData).catch(() => {});
        }
      }
    }

    res.json({ success: true, message: 'Budget saved successfully', budget });
  } catch (err) {
    next(err);
  }
};

// @route   DELETE /api/budget/:month
const deleteBudget = async (req, res, next) => {
  try {
    const budget = await Budget.findOneAndDelete({ userId: req.user._id, month: req.params.month });
    if (!budget) return res.status(404).json({ message: 'Budget not found' });
    res.json({ success: true, message: 'Budget deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getBudget, setBudget, deleteBudget };
