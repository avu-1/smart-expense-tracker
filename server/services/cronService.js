// services/cronService.js
// Daily cron jobs for SpendWise:
//   1. Execute due recurring transactions  (runs at 00:05 every day)
//   2. Send upcoming bill reminders        (runs at 08:00 every day)
//
// Uses node-cron.  The scheduler is initialised once from index.js.

const cron = require('node-cron');
const RecurringTransaction = require('../models/RecurringTransaction');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { cacheDelPattern } = require('../config/redis');
const {
  sendRecurringExecutedEmail,
  sendBillReminderEmail,
} = require('./emailService');

// ---------------------------------------------------------------------------
// Helper: compute the NEXT execution date after a run
// ---------------------------------------------------------------------------

/**
 * Given a recurring transaction that just fired, calculate when it fires next.
 * @param {Object} rec - RecurringTransaction document
 * @returns {Date}
 */
const computeNextDate = (rec) => {
  const base = new Date(rec.nextExecutionDate);

  switch (rec.cycle) {
    case 'monthly': {
      const targetMonth = base.getMonth() + rec.interval;
      base.setMonth(targetMonth);
      // Clamp to last day of target month if overflow occurred
      if (base.getMonth() !== (targetMonth % 12 + 12) % 12) {
        base.setDate(0);
      }
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
// Job 1 — Execute due recurring transactions (00:05 daily)
// ---------------------------------------------------------------------------

const executeRecurringTransactions = async () => {
  console.log('[CRON] 🔄 Checking recurring transactions...');

  // Midnight today (UTC)
  const today = new Date();
  const startOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0));
  
  // End of today (UTC)
  const endOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));

  try {
    // Find all active recurring transactions due today or overdue
    const dueTodayList = await RecurringTransaction.find({
      isActive: true,
      nextExecutionDate: { $lte: endOfDay },
    });

    if (dueTodayList.length === 0) {
      console.log('[CRON] ✅ No recurring transactions due today');
      return;
    }

    console.log(`[CRON] Found ${dueTodayList.length} recurring transaction(s) to execute`);

    for (const rec of dueTodayList) {
      try {
        // Check if this recurring entry has expired
        if (rec.endDate && new Date() > new Date(rec.endDate)) {
          rec.isActive = false;
          await rec.save();
          console.log(`[CRON] ⏹  "${rec.title}" reached its end date — auto-deactivated`);
          continue;
        }

        // 1. Create the actual transaction
        const newTxn = await Transaction.create({
          userId: rec.userId,
          amount: rec.amount,
          type: rec.type,
          category: rec.category,
          date: new Date(),
          note: rec.note ? `[Auto] ${rec.note}` : `[Auto] ${rec.title}`,
        });

        // 2. Advance nextExecutionDate
        rec.nextExecutionDate = computeNextDate(rec);

        // 3. If the NEXT run would exceed the endDate, deactivate now so user can see it's done
        if (rec.endDate && rec.nextExecutionDate > new Date(rec.endDate)) {
          rec.isActive = false;
          console.log(`[CRON] ⏹  "${rec.title}" — last execution done, schedule ended`);
        }

        await rec.save();

        // 4. Invalidate analytics cache for this user
        await cacheDelPattern(`analytics:${rec.userId}:*`);
        await cacheDelPattern(`insights:*:${rec.userId}:*`);

        // 5. Send email notification (non-blocking)
        const user = await User.findById(rec.userId).select('name email emailNotifications');
        if (user?.emailNotifications?.transactionConfirm) {
          sendRecurringExecutedEmail(user, rec).catch(() => {}); // fire-and-forget
        }

        console.log(`[CRON] ✅ Executed "${rec.title}" for user ${rec.userId} → txn ${newTxn._id}`);
      } catch (err) {
        // Log error per-record; continue processing others
        console.error(`[CRON] ❌ Failed to execute recurring "${rec.title}": ${err.message}`);
      }
    }
  } catch (err) {
    console.error('[CRON] ❌ executeRecurringTransactions crashed:', err.message);
  }
};

// ---------------------------------------------------------------------------
// Job 2 — Send upcoming bill reminders (08:00 daily)
// ---------------------------------------------------------------------------

const sendUpcomingReminders = async () => {
  console.log('[CRON] 🔔 Checking upcoming bill reminders...');

  try {
    const now = new Date();

    // Build date windows for "1 day from now" and "2 days from now" using UTC
    const windows = [1, 2].map((daysAhead) => {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead, 0, 0, 0, 0));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead, 23, 59, 59, 999));
      return {
        daysLeft: daysAhead,
        start,
        end,
      };
    });

    for (const window of windows) {
      const upcoming = await RecurringTransaction.find({
        isActive: true,
        type: 'expense', // Only remind for outgoing bills
        nextExecutionDate: { $gte: window.start, $lte: window.end },
      });

      for (const rec of upcoming) {
        try {
          const user = await User.findById(rec.userId).select('name email emailNotifications');
          if (!user?.emailNotifications?.billReminder) continue;

          await sendBillReminderEmail(user, rec, window.daysLeft);
          console.log(`[CRON] 📧 Reminder sent to ${user.email} for "${rec.title}" (${window.daysLeft}d away)`);
        } catch (err) {
          console.error(`[CRON] ❌ Reminder failed for "${rec.title}": ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error('[CRON] ❌ sendUpcomingReminders crashed:', err.message);
  }
};

// ---------------------------------------------------------------------------
// Initialise all cron jobs
// ---------------------------------------------------------------------------

/**
 * Call this once from index.js after DB connection is established.
 */
const initCronJobs = () => {
  // Job 1: Execute recurring transactions at 00:05 every day
  cron.schedule('5 0 * * *', executeRecurringTransactions, {
    timezone: process.env.TZ || 'Asia/Kolkata',
  });

  // Job 2: Send bill reminders at 08:00 every day
  cron.schedule('0 8 * * *', sendUpcomingReminders, {
    timezone: process.env.TZ || 'Asia/Kolkata',
  });

  console.log('⏰ Cron jobs initialised');
  console.log('   • 00:05 — Recurring transaction executor');
  console.log('   • 08:00 — Bill reminder emails');
};

// Expose individual job runners so they can be triggered manually via API
module.exports = {
  initCronJobs,
  executeRecurringTransactions,  // exposed for manual trigger / testing
  sendUpcomingReminders,
};
