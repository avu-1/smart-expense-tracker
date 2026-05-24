// controllers/recurringController.js
// Full CRUD for recurring transaction templates.
// The cron service reads these; this controller just manages the records.

const { validationResult } = require('express-validator');
const RecurringTransaction = require('../models/RecurringTransaction');
const Transaction = require('../models/Transaction');
const { cacheDelPattern } = require('../config/redis');

// ---------------------------------------------------------------------------
// Helper: compute the first execution date from startDate
// ---------------------------------------------------------------------------

/**
 * Fix: date-only strings like "2026-05-22" are parsed by JS as UTC midnight,
 * which is 05:30 AM IST — making "today" appear as "tomorrow" in IST.
 * We re-parse them as local midnight to get the correct day.
 */
const parseDateAsLocal = (dateInput) => {
  if (!dateInput) return new Date();
  const str = typeof dateInput === 'string' ? dateInput : dateInput.toISOString();
  // If it's a date-only string (YYYY-MM-DD), parse as local midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0); // local midnight
  }
  return new Date(dateInput);
};

const computeFirstExecution = (startDate) => {
  const d = parseDateAsLocal(startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // local midnight
  if (d <= today) return today;
  return d;
};

/**
 * Mirror of cron's computeNextDate — needed here so we can advance the date
 * immediately after an on-creation execution without importing cronService
 * (which would create a circular dependency).
 */
const computeNextDate = (rec) => {
  const base = new Date(rec.nextExecutionDate);
  switch (rec.cycle) {
    case 'monthly': {
      const targetMonth = base.getMonth() + rec.interval;
      base.setMonth(targetMonth);
      if (base.getMonth() !== ((targetMonth % 12) + 12) % 12) base.setDate(0);
      break;
    }
    case 'weekly':
      base.setDate(base.getDate() + rec.interval * 7);
      break;
    case 'customDays':
      base.setDate(base.getDate() + rec.interval);
      break;
    default:
      base.setMonth(base.getMonth() + 1);
  }
  return base;
};

// ---------------------------------------------------------------------------
// @route   GET /api/recurring
// @desc    List all recurring transactions for the logged-in user
// ---------------------------------------------------------------------------
const getRecurring = async (req, res, next) => {
  try {
    const items = await RecurringTransaction.find({ userId: req.user._id })
      .sort({ nextExecutionDate: 1 }); // Show soonest-due first

    res.json({ success: true, count: items.length, recurringTransactions: items });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// @route   POST /api/recurring
// @desc    Create a new recurring transaction
// ---------------------------------------------------------------------------
const createRecurring = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { title, amount, type, category, startDate, cycle, interval, note, endDate } = req.body;

    // Validate endDate is after startDate if provided
    if (endDate && startDate && new Date(endDate) <= parseDateAsLocal(startDate)) {
      return res.status(400).json({ message: 'End date must be after start date' });
    }

    const firstExecDate = computeFirstExecution(startDate || new Date());
    const now = new Date();
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    // Is the first execution date today or in the past?
    const isDueNow = firstExecDate <= todayMidnight;

    // If due now, we execute immediately and advance to the next occurrence.
    // This prevents the user from having to wait until next midnight for the cron.
    const nextExecDate = isDueNow
      ? computeNextDate({ nextExecutionDate: firstExecDate, cycle: cycle || 'monthly', interval: interval || 1 })
      : firstExecDate;

    const recurring = await RecurringTransaction.create({
      userId: req.user._id,
      title,
      amount,
      type,
      category,
      startDate: parseDateAsLocal(startDate) || now,
      cycle,
      interval: interval || 1,
      nextExecutionDate: nextExecDate,
      note,
      endDate: endDate || null,
    });

    // --- Immediate execution if start date is today or overdue ---
    let executedNow = false;
    if (isDueNow) {
      try {
        await Transaction.create({
          userId: req.user._id,
          amount,
          type,
          category,
          date: now,
          note: note ? `[Auto] ${note}` : `[Auto] ${title}`,
        });
        // Bust analytics cache so dashboard reflects the new transaction
        await cacheDelPattern(`analytics:${req.user._id}:*`);
        await cacheDelPattern(`insights:*:${req.user._id}:*`);
        executedNow = true;
      } catch (txnErr) {
        // Non-fatal — recurring template is saved; cron will catch it next midnight
        console.error('[RECURRING] Immediate execution failed:', txnErr.message);
      }
    }

    res.status(201).json({
      success: true,
      message: executedNow
        ? 'Recurring transaction created and first entry recorded immediately'
        : 'Recurring transaction created — first entry will be recorded on the start date',
      recurring,
      executedNow,
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// @route   PUT /api/recurring/:id
// @desc    Update a recurring transaction
// ---------------------------------------------------------------------------
const updateRecurring = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const recurring = await RecurringTransaction.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!recurring) {
      return res.status(404).json({ message: 'Recurring transaction not found' });
    }

    const { title, amount, type, category, cycle, interval, isActive, note, endDate } = req.body;

    if (title    !== undefined) recurring.title    = title;
    if (amount   !== undefined) recurring.amount   = amount;
    if (type     !== undefined) recurring.type     = type;
    if (category !== undefined) recurring.category = category;
    if (note     !== undefined) recurring.note     = note;
    if (isActive !== undefined) recurring.isActive = isActive;
    // Allow clearing endDate by passing null explicitly
    if (endDate !== undefined) recurring.endDate = endDate || null;

    // If schedule changed, recompute next execution date
    if (cycle !== undefined || interval !== undefined) {
      if (cycle    !== undefined) recurring.cycle    = cycle;
      if (interval !== undefined) recurring.interval = interval;
      // Reset next execution from today when schedule changes
      recurring.nextExecutionDate = computeFirstExecution(new Date());
    }

    await recurring.save();

    res.json({ success: true, message: 'Recurring transaction updated', recurring });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// @route   DELETE /api/recurring/:id
// ---------------------------------------------------------------------------
const deleteRecurring = async (req, res, next) => {
  try {
    const recurring = await RecurringTransaction.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!recurring) {
      return res.status(404).json({ message: 'Recurring transaction not found' });
    }

    res.json({ success: true, message: 'Recurring transaction deleted' });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// @route   POST /api/recurring/:id/toggle
// @desc    Quickly pause / resume a recurring transaction
// ---------------------------------------------------------------------------
const toggleRecurring = async (req, res, next) => {
  try {
    const recurring = await RecurringTransaction.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!recurring) {
      return res.status(404).json({ message: 'Recurring transaction not found' });
    }

    recurring.isActive = !recurring.isActive;
    await recurring.save();

    res.json({
      success: true,
      message: `Recurring transaction ${recurring.isActive ? 'resumed' : 'paused'}`,
      isActive: recurring.isActive,
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// @route   POST /api/recurring/:id/execute-now
// @desc    Manually trigger immediate execution of a recurring transaction
// ---------------------------------------------------------------------------
const executeNow = async (req, res, next) => {
  try {
    const recurring = await RecurringTransaction.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!recurring) {
      return res.status(404).json({ message: 'Recurring transaction not found' });
    }
    if (!recurring.isActive) {
      return res.status(400).json({ message: 'Cannot execute a paused recurring transaction' });
    }

    // Create the actual transaction immediately
    const txn = await Transaction.create({
      userId: req.user._id,
      amount: recurring.amount,
      type: recurring.type,
      category: recurring.category,
      date: new Date(),
      note: recurring.note ? `[Manual] ${recurring.note}` : `[Manual] ${recurring.title}`,
    });

    // Advance nextExecutionDate to the next cycle
    recurring.nextExecutionDate = computeNextDate(recurring);
    await recurring.save();

    // Invalidate cache
    await cacheDelPattern(`analytics:${req.user._id}:*`);
    await cacheDelPattern(`insights:*:${req.user._id}:*`);

    res.json({
      success: true,
      message: `"${recurring.title}" has been recorded. Next execution: ${recurring.nextExecutionDate.toLocaleDateString()}`,
      transaction: txn,
      nextExecutionDate: recurring.nextExecutionDate,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getRecurring, createRecurring, updateRecurring, deleteRecurring, toggleRecurring, executeNow };
