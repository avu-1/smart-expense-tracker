// controllers/analyticsController.js
// All date boundaries use UTC so they are timezone-neutral and always
// match exactly what the client stored (dates stored at noon UTC are
// always inside the UTC-day they belong to).
const Transaction = require('../models/Transaction');
const Budget      = require('../models/Budget');
const { cacheGet, cacheSet } = require('../config/redis');

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper: build a UTC [start, end) range for a calendar month
// month is 1-based (Jan = 1)
// ─────────────────────────────────────────────────────────────────────────────
const monthRange = (year, month) => {
  const y = Number(year);
  const m = Number(month);
  const start = new Date(Date.UTC(y, m - 1, 1));          // first ms of month (UTC)
  const end   = new Date(Date.UTC(y, m,     1));          // first ms of NEXT month (exclusive)
  return { start, end };
};

// @route   GET /api/analytics/dashboard?year=YYYY&month=M
// @desc    Full dashboard analytics for the requested month (default = current)
// @access  Private
const getDashboard = async (req, res, next) => {
  try {
    const userId    = req.user._id;
    const userIdStr = userId.toString();
    const now       = new Date();
    const year  = req.query.year  || now.getUTCFullYear();
    const month = req.query.month || (now.getUTCMonth() + 1);

    const cacheKey = `analytics:${userIdStr}:dashboard:${year}:${month}`;

    // Try Redis cache (30-second TTL — short enough that stale data is never noticeable)
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json({ success: true, fromCache: true, ...cached });

    const { start, end } = monthRange(year, month);

    // ── Monthly transactions ─────────────────────────────────────────────────
    const monthlyTxns = await Transaction.find({
      userId,
      date: { $gte: start, $lt: end },
    }).lean();

    const monthlyIncome  = monthlyTxns.filter(t => t.type === 'income' ).reduce((s, t) => s + t.amount, 0);
    const monthlyExpense = monthlyTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    // ── Category breakdown (expenses only) ──────────────────────────────────
    const catMap = {};
    monthlyTxns.filter(t => t.type === 'expense').forEach(t => {
      catMap[t.category] = (catMap[t.category] || 0) + t.amount;
    });
    const categoryBreakdown = Object.entries(catMap)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    // ── 6-month trend (current month + 5 previous) ───────────────────────────
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      // Subtract i months from the requested month (handles year wrapping)
      const d     = new Date(Date.UTC(Number(year), Number(month) - 1 - i, 1));
      const tYear = d.getUTCFullYear();
      const tMon  = d.getUTCMonth() + 1;
      const { start: tStart, end: tEnd } = monthRange(tYear, tMon);

      const txns   = await Transaction.find({ userId, date: { $gte: tStart, $lt: tEnd } }).lean();
      const income  = txns.filter(t => t.type === 'income' ).reduce((s, t) => s + t.amount, 0);
      const expense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

      monthlyTrend.push({
        month:   d.toLocaleString('default', { month: 'short', year: '2-digit' }),
        income,
        expense,
        savings: income - expense,
      });
    }

    // ── Budget ───────────────────────────────────────────────────────────────
    const monthStr = `${Number(year)}-${String(Number(month)).padStart(2, '0')}`;
    const budget   = await Budget.findOne({ userId, month: monthStr }).lean();
    const budgetInfo = budget ? {
      limit:      budget.limit,
      spent:      monthlyExpense,
      remaining:  budget.limit - monthlyExpense,
      percentage: Math.round((monthlyExpense / budget.limit) * 100),
      exceeded:   monthlyExpense > budget.limit,
    } : null;

    // ── Recent transactions (last 5 across ALL time, for the feed) ───────────
    const recentTransactions = await Transaction.find({ userId })
      .sort({ date: -1 })
      .limit(5)
      .lean();

    const data = {
      summary: {
        totalIncome:      monthlyIncome,
        totalExpense:     monthlyExpense,
        savings:          monthlyIncome - monthlyExpense,
        transactionCount: monthlyTxns.length,
      },
      categoryBreakdown,
      monthlyTrend,
      budgetInfo,
      recentTransactions,
      meta: { year: Number(year), month: Number(month) },
    };

    // Cache for 30 seconds only
    await cacheSet(cacheKey, data, 30);

    res.json({ success: true, fromCache: false, ...data });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/analytics/yearly?year=YYYY
// @desc    12-month breakdown for the given year
// @access  Private
const getYearlyAnalytics = async (req, res, next) => {
  try {
    const userId    = req.user._id;
    const userIdStr = userId.toString();
    const year      = req.query.year || new Date().getUTCFullYear();

    const cacheKey = `analytics:${userIdStr}:yearly:${year}`;
    const cached   = await cacheGet(cacheKey);
    if (cached) return res.json({ success: true, fromCache: true, data: cached });

    // UTC-safe year boundaries
    const yearStart = new Date(Date.UTC(Number(year),     0, 1));
    const yearEnd   = new Date(Date.UTC(Number(year) + 1, 0, 1));

    const result = await Transaction.aggregate([
      {
        $match: {
          userId,
          date: { $gte: yearStart, $lt: yearEnd },
        },
      },
      {
        $group: {
          _id:   { month: { $month: '$date' }, type: '$type' },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.month': 1 } },
    ]);

    const months = Array.from({ length: 12 }, (_, i) => ({
      month:   new Date(Date.UTC(Number(year), i, 1)).toLocaleString('default', { month: 'short' }),
      income:  0,
      expense: 0,
    }));

    result.forEach(({ _id, total }) => {
      const idx = _id.month - 1;
      if (_id.type === 'income')  months[idx].income  = total;
      else                        months[idx].expense = total;
    });
    months.forEach(m => { m.savings = m.income - m.expense; });

    await cacheSet(cacheKey, months, 30);
    res.json({ success: true, fromCache: false, data: months });
  } catch (error) {
    next(error);
  }
};

module.exports = { getDashboard, getYearlyAnalytics };
