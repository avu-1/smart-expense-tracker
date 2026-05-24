// controllers/insightsController.js
// Collects rich, deeply contextual data — individual transactions, recurring
// obligations, top spends, saving rate — and passes it to the AI service.

const Transaction          = require('../models/Transaction');
const RecurringTransaction = require('../models/RecurringTransaction');
const Budget               = require('../models/Budget');
const { cacheGet, cacheSet } = require('../config/redis');
const { generateAIInsights, generateMockInsights } = require('../services/aiService');

// ---------------------------------------------------------------------------
// UTC-safe month range (consistent with analyticsController)
// ---------------------------------------------------------------------------
const monthRange = (year, month) => {
  // month is 0-based here (matches JS Date)
  const start = new Date(Date.UTC(year, month, 1));
  const end   = new Date(Date.UTC(year, month + 1, 1));
  return { start, end };
};

// ---------------------------------------------------------------------------
// Fetch full month data — rich version with individual transactions
// ---------------------------------------------------------------------------
const getMonthData = async (userId, year, month) => {
  const { start, end } = monthRange(year, month);

  const txns = await Transaction.find({
    userId,
    date: { $gte: start, $lt: end },
  }).sort({ amount: -1 }).lean();  // sorted by amount desc so top spends come first

  const income  = txns.filter(t => t.type === 'income' ).reduce((s, t) => s + t.amount, 0);
  const expense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const categories = {};
  txns.filter(t => t.type === 'expense').forEach(t => {
    categories[t.category] = (categories[t.category] || 0) + t.amount;
  });

  // Top 8 expense transactions with their notes (what money was actually spent on)
  const topExpenses = txns
    .filter(t => t.type === 'expense')
    .slice(0, 8)
    .map(t => ({ amount: t.amount, category: t.category, note: t.note || '' }));

  // All income sources
  const incomeSources = txns
    .filter(t => t.type === 'income')
    .map(t => ({ amount: t.amount, category: t.category, note: t.note || '' }));

  return {
    income,
    expense,
    savings: income - expense,
    savingsRate: income > 0 ? Math.round(((income - expense) / income) * 100) : 0,
    categories,
    transactions: txns.length,
    topExpenses,
    incomeSources,
  };
};

// ---------------------------------------------------------------------------
// @route   GET /api/insights
// @desc    Standard mock insights (fast, no API cost, backward-compatible)
// @access  Private
// ---------------------------------------------------------------------------
const getInsights = async (req, res, next) => {
  try {
    const userId    = req.user._id;
    const userIdStr = userId.toString();
    const now = new Date();
    const cm  = now.getUTCMonth();
    const cy  = now.getUTCFullYear();

    const cacheKey = `insights:mock:${userIdStr}:${cy}:${cm}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json({ success: true, fromCache: true, insights: cached, source: 'mock' });

    const [currData, prevData] = await Promise.all([
      getMonthData(userId, cy, cm),
      getMonthData(userId, cm === 0 ? cy - 1 : cy, cm === 0 ? 11 : cm - 1),
    ]);

    const insights = generateMockInsights(currData, prevData);
    await cacheSet(cacheKey, insights, 1800);
    res.json({ success: true, fromCache: false, insights, source: 'mock' });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// @route   GET /api/insights/ai
// @desc    Gemini-powered insights with full transaction context
// @access  Private
// ---------------------------------------------------------------------------
const getAIInsights = async (req, res, next) => {
  try {
    const userId    = req.user._id;
    const userIdStr = userId.toString();
    const now = new Date();
    const cm  = now.getUTCMonth();
    const cy  = now.getUTCFullYear();

    // ── 1. Month data (rich) ────────────────────────────────────────────────
    const [currData, prevData] = await Promise.all([
      getMonthData(userId, cy, cm),
      getMonthData(userId, cm === 0 ? cy - 1 : cy, cm === 0 ? 11 : cm - 1),
    ]);

    // ── 2. Budget ────────────────────────────────────────────────────────────
    const monthStr = `${cy}-${String(cm + 1).padStart(2, '0')}`;
    const budget   = await Budget.findOne({ userId, month: monthStr }).lean();
    const budgetData = budget
      ? {
          limit:      budget.limit,
          spent:      currData.expense,
          remaining:  budget.limit - currData.expense,
          percentage: Math.round((currData.expense / budget.limit) * 100),
          exceeded:   currData.expense > budget.limit,
        }
      : null;

    // ── 3. Recurring transactions (all active templates) ─────────────────────
    const recurring = await RecurringTransaction.find({ userId, isActive: true })
      .sort({ amount: -1 })
      .lean();

    const recurringIncome   = recurring.filter(r => r.type === 'income');
    const recurringExpenses = recurring.filter(r => r.type === 'expense');
    const totalRecurringExpenseMonthly = recurringExpenses
      .filter(r => r.cycle === 'monthly' && r.interval === 1)
      .reduce((s, r) => s + r.amount, 0);

    // ── 4. Pass everything to AI ─────────────────────────────────────────────
    const result = await generateAIInsights(
      userIdStr,
      currData,
      prevData,
      budgetData,
      { recurringIncome, recurringExpenses, totalRecurringExpenseMonthly },
    );

    res.json({
      success: true,
      ...result,
      meta: {
        currentMonth: { income: currData.income, expense: currData.expense, savings: currData.savings },
        budgetStatus:  budgetData,
        recurringCount: recurring.length,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getInsights, getAIInsights };
