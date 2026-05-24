/**
 * seedAndTestAI.js — SpendWise Dummy Data Seeder + Gemini AI Insights Tester
 * ============================================================================
 * Usage:
 *   node server/scripts/seedAndTestAI.js                        ← seeds the first user found in DB
 *   node server/scripts/seedAndTestAI.js your@email.com         ← seeds a specific user
 *
 * What it does:
 *  1. Connects to MongoDB
 *  2. Finds the target user (first registered user, or by email arg)
 *  3. Wipes their existing transactions / budgets / recurring templates
 *  4. Seeds 2 months of realistic dummy transactions
 *  5. Seeds 6 recurring transaction templates (income + expenses)
 *  6. Sets a monthly budget
 *  7. Busts any Redis cache for that user's insights
 *  8. Directly calls generateAIInsights() and prints Gemini's response
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');

const User                 = require('../models/User');
const Transaction          = require('../models/Transaction');
const Budget               = require('../models/Budget');
const RecurringTransaction = require('../models/RecurringTransaction');
const { generateAIInsights } = require('../services/aiService');

// Try to import redis helpers — ok if unavailable
let cacheDelPattern = async () => {};
try {
  const redis = require('../config/redis');
  cacheDelPattern = redis.cacheDelPattern;
} catch (_) {}

// ─── Colour helpers ──────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', blue: '\x1b[34m', magenta: '\x1b[35m', grey: '\x1b[90m',
};
const log  = (msg) => console.log(msg);
const head = (msg) => log(`\n${c.bold}${c.cyan}${'═'.repeat(62)}${c.reset}\n${c.bold}${c.cyan}  ${msg}${c.reset}\n${c.bold}${c.cyan}${'═'.repeat(62)}${c.reset}`);
const ok   = (msg) => log(`  ${c.green}✔${c.reset}  ${msg}`);
const info = (msg) => log(`  ${c.blue}ℹ${c.reset}  ${msg}`);
const sep  = ()    => log(`${c.grey}${'─'.repeat(62)}${c.reset}`);
const INR  = (n)   => `₹${Number(n).toLocaleString('en-IN')}`;

// ─── Date helpers ────────────────────────────────────────────────────────────
const now       = new Date();
const thisYear  = now.getFullYear();
const thisMonth = now.getMonth();   // 0-indexed
const prevMonth = thisMonth === 0 ? 11 : thisMonth - 1;
const prevYear  = thisMonth === 0 ? thisYear - 1 : thisYear;

/** Create a Date at noon UTC for the given year/month/day — safely inside
 *  the UTC month boundary regardless of server/client timezone (e.g. IST +5:30).
 *  Noon UTC = 5:30 PM IST, so IST midnight won't spill into the previous UTC day. */
const d = (year, month, day) => {
  const max = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, max), 12, 0, 0)); // noon UTC
};

// ─── Previous month transactions ─────────────────────────────────────────────
// Scenario: modest month — decent savings, average spending
const prevMonthTxns = [
  // Income
  { amount: 85000, type: 'income',  category: 'Salary',        note: 'Monthly salary',            day: 1  },
  { amount: 12000, type: 'income',  category: 'Freelance',     note: 'Website design project',    day: 8  },

  // Food (moderate)
  { amount: 4200,  type: 'expense', category: 'Food',          note: 'Swiggy orders',             day: 3  },
  { amount: 3100,  type: 'expense', category: 'Food',          note: 'Zomato + restaurant',       day: 10 },
  { amount: 1800,  type: 'expense', category: 'Food',          note: 'Weekend brunch',            day: 14 },
  { amount: 2600,  type: 'expense', category: 'Food',          note: 'Grocery + cafe',            day: 20 },

  // Transport
  { amount: 3500,  type: 'expense', category: 'Transport',     note: 'Ola + Uber cabs',           day: 5  },
  { amount: 1200,  type: 'expense', category: 'Transport',     note: 'Petrol',                    day: 18 },

  // Shopping (reasonable)
  { amount: 8500,  type: 'expense', category: 'Shopping',      note: 'Myntra sale purchases',     day: 7  },
  { amount: 2200,  type: 'expense', category: 'Shopping',      note: 'Amazon essentials',         day: 22 },

  // Entertainment
  { amount: 1500,  type: 'expense', category: 'Entertainment', note: 'Netflix + Spotify',         day: 1  },
  { amount: 2400,  type: 'expense', category: 'Entertainment', note: 'Movie + bowling',           day: 15 },

  // Utilities
  { amount: 2800,  type: 'expense', category: 'Utilities',     note: 'Electricity + internet',    day: 6  },
  { amount: 800,   type: 'expense', category: 'Utilities',     note: 'Mobile recharge',           day: 12 },

  // Health
  { amount: 1500,  type: 'expense', category: 'Health',        note: 'Doctor visit + medicines',  day: 9  },
];

// ─── Current month transactions ───────────────────────────────────────────────
// Scenario: salary hike BUT food+shopping spiked (festival season), savings dropped
const currMonthTxns = [
  // Income (hike + side gig + gift)
  { amount: 95000, type: 'income',  category: 'Salary',        note: 'Monthly salary (post-hike)', day: 1  },
  { amount: 8000,  type: 'income',  category: 'Freelance',     note: 'Logo design client',         day: 12 },
  { amount: 5000,  type: 'income',  category: 'Gift',          note: 'Birthday gift (cash)',        day: 16 },

  // Food — SPIKED (festival eating out)
  { amount: 6800,  type: 'expense', category: 'Food',          note: 'Swiggy Instamart + orders',  day: 3  },
  { amount: 4500,  type: 'expense', category: 'Food',          note: 'Family dinner restaurants',  day: 9  },
  { amount: 3200,  type: 'expense', category: 'Food',          note: 'Zomato weekend binge',       day: 16 },
  { amount: 2100,  type: 'expense', category: 'Food',          note: 'Office team lunch',          day: 20 },

  // Transport
  { amount: 2800,  type: 'expense', category: 'Transport',     note: 'Ola cabs',                   day: 4  },
  { amount: 1900,  type: 'expense', category: 'Transport',     note: 'Petrol',                     day: 19 },

  // Shopping — MASSIVE spike (Amazon + Myntra sale)
  { amount: 15500, type: 'expense', category: 'Shopping',      note: 'Amazon Great Indian Sale',   day: 5  },
  { amount: 6200,  type: 'expense', category: 'Shopping',      note: 'Myntra End of Reason Sale',  day: 11 },
  { amount: 3800,  type: 'expense', category: 'Shopping',      note: 'Electronics accessories',    day: 17 },

  // Entertainment
  { amount: 1500,  type: 'expense', category: 'Entertainment', note: 'Netflix + Spotify',          day: 1  },
  { amount: 3200,  type: 'expense', category: 'Entertainment', note: 'Concert tickets',            day: 14 },

  // Utilities (AC usage in summer)
  { amount: 3100,  type: 'expense', category: 'Utilities',     note: 'Electricity (AC usage up)',  day: 6  },
  { amount: 800,   type: 'expense', category: 'Utilities',     note: 'Mobile recharge',            day: 12 },

  // Health — new dental + gym
  { amount: 4500,  type: 'expense', category: 'Health',        note: 'Dental treatment',           day: 8  },
  { amount: 1200,  type: 'expense', category: 'Health',        note: 'Gym membership',             day: 1  },

  // Education — new this month
  { amount: 5000,  type: 'expense', category: 'Education',     note: 'Udemy + Coursera courses',   day: 10 },
];

// ─── Recurring transaction templates ─────────────────────────────────────────
// Uses noon UTC dates so they fall correctly inside UTC month boundaries (IST-safe)
const utcNoon = (year, month, day) =>
  new Date(Date.UTC(year, month, Math.max(1, day), 12, 0, 0));

const buildRecurring = (userId) => [
  // ── INCOME ────────────────────────────────────────────────────────────────
  { userId, title: 'Monthly Salary',     amount: 95000, type: 'income',  category: 'Salary',        cycle: 'monthly',  interval: 1, startDate: utcNoon(thisYear, thisMonth - 5,  1),  nextExecutionDate: utcNoon(thisYear, thisMonth + 1,  1),  isActive: true, note: 'Auto-deposited monthly salary' },
  { userId, title: 'Freelance Retainer', amount:  8000, type: 'income',  category: 'Freelance',     cycle: 'monthly',  interval: 1, startDate: utcNoon(thisYear, thisMonth - 2, 12),  nextExecutionDate: utcNoon(thisYear, thisMonth + 1, 12),  isActive: true, note: 'Monthly UI design retainer client' },
  { userId, title: 'Investment Dividend',amount:  2500, type: 'income',  category: 'Investment',    cycle: 'monthly',  interval: 3, startDate: utcNoon(thisYear, thisMonth - 3, 15),  nextExecutionDate: utcNoon(thisYear, thisMonth + 3, 15),  isActive: true, note: 'Mutual fund dividend payout (quarterly)' },
  // ── EXPENSES ──────────────────────────────────────────────────────────────
  { userId, title: 'Netflix Subscription',amount:   649, type: 'expense', category: 'Entertainment', cycle: 'monthly',  interval: 1, startDate: utcNoon(thisYear, thisMonth - 8,  1),  nextExecutionDate: utcNoon(thisYear, thisMonth + 1,  1),  isActive: true, note: 'Netflix Premium plan' },
  { userId, title: 'Home Rent EMI',      amount: 18000, type: 'expense', category: 'Utilities',     cycle: 'monthly',  interval: 1, startDate: utcNoon(thisYear, thisMonth - 11, 5),  nextExecutionDate: utcNoon(thisYear, thisMonth + 1,  5),  isActive: true, note: 'Apartment rent — monthly auto-debit' },
  { userId, title: 'Car Loan EMI',       amount: 12500, type: 'expense', category: 'Transport',     cycle: 'monthly',  interval: 1, startDate: utcNoon(thisYear, thisMonth - 18, 10), nextExecutionDate: utcNoon(thisYear, thisMonth + 1, 10), endDate: utcNoon(thisYear + 2, thisMonth, 10), isActive: true, note: 'HDFC car loan EMI' },
  { userId, title: 'Gym Membership',     amount:  1200, type: 'expense', category: 'Health',        cycle: 'monthly',  interval: 1, startDate: utcNoon(thisYear, thisMonth - 1,  1),  nextExecutionDate: utcNoon(thisYear, thisMonth + 1,  1),  isActive: true, note: 'Cult.fit monthly membership' },
  { userId, title: 'SIP Investment',     amount:  5000, type: 'expense', category: 'Other',         cycle: 'monthly',  interval: 1, startDate: utcNoon(thisYear, thisMonth - 6, 20), nextExecutionDate: utcNoon(thisYear, thisMonth + 1, 20), isActive: true, note: 'Nifty 50 index fund SIP' },
];

// ─── Summary helper ───────────────────────────────────────────────────────────
const summarise = (txns) => {
  const income  = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const cats    = {};
  txns.filter(t => t.type === 'expense').forEach(t => {
    cats[t.category] = (cats[t.category] || 0) + t.amount;
  });
  return { income, expense, categories: cats, transactions: txns.length };
};

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  head('SpendWise — Seed + Gemini AI Test');

  // 1. Connect MongoDB
  info('Connecting to MongoDB…');
  await mongoose.connect(process.env.MONGO_URI);
  ok(`Connected → ${process.env.MONGO_URI}`);

  // 2. Find target user
  sep();
  const emailArg = process.argv[2];
  let user;

  if (emailArg) {
    info(`Looking for user: ${emailArg}`);
    user = await User.findOne({ email: emailArg.toLowerCase() });
    if (!user) {
      // Create user if not found
      const hashed = await bcrypt.hash('Test@1234', 12);
      user = await User.create({ name: 'SpendWise Tester', email: emailArg.toLowerCase(), password: hashed });
      ok(`Created new user: ${user.name} <${user.email}>`);
    } else {
      ok(`Found user: ${user.name} <${user.email}> (${user._id})`);
    }
  } else {
    // Pick the first registered user (most recent by default from DB)
    user = await User.findOne().sort({ createdAt: 1 });
    if (!user) {
      const hashed = await bcrypt.hash('Test@1234', 12);
      user = await User.create({ name: 'Arjun Sharma', email: 'demo@spendwise.dev', password: hashed });
      ok(`Created demo user: ${user.name} <${user.email}>`);
    } else {
      ok(`Seeding for first registered user: ${user.name} <${user.email}> (${user._id})`);
    }
  }

  // 3. Clear old data
  sep();
  info('Wiping existing transactions, budgets, and recurring templates for this user…');
  const [delTxn, delBdg, delRec] = await Promise.all([
    Transaction.deleteMany({ userId: user._id }),
    Budget.deleteMany({ userId: user._id }),
    RecurringTransaction.deleteMany({ userId: user._id }),
  ]);
  ok(`Cleared ${delTxn.deletedCount} transactions, ${delBdg.deletedCount} budgets, ${delRec.deletedCount} recurring templates`);

  // 4. Insert transactions
  sep();
  info(`Seeding previous month (${prevYear}-${String(prevMonth + 1).padStart(2, '0')}) — ${prevMonthTxns.length} txns…`);
  await Transaction.insertMany(
    prevMonthTxns.map(t => ({ ...t, userId: user._id, date: d(prevYear, prevMonth, t.day) }))
  );
  ok('Previous month transactions inserted');

  info(`Seeding current month  (${thisYear}-${String(thisMonth + 1).padStart(2, '0')}) — ${currMonthTxns.length} txns…`);
  await Transaction.insertMany(
    currMonthTxns.map(t => ({ ...t, userId: user._id, date: d(thisYear, thisMonth, t.day) }))
  );
  ok('Current month transactions inserted');

  // 5. Insert recurring templates
  sep();
  const recurringTemplates = buildRecurring(user._id);
  info(`Seeding ${recurringTemplates.length} recurring transaction templates…`);
  await RecurringTransaction.insertMany(recurringTemplates);

  const incomeRec = recurringTemplates.filter(r => r.type === 'income');
  const expRec    = recurringTemplates.filter(r => r.type === 'expense');
  ok(`${incomeRec.length} recurring income streams seeded:`);
  incomeRec.forEach(r => log(`     ${c.green}+${c.reset} ${r.title.padEnd(22)} ${INR(r.amount)} / ${r.cycle === 'monthly' && r.interval > 1 ? `${r.interval} months` : r.cycle}`));
  ok(`${expRec.length} recurring expense templates seeded:`);
  expRec.forEach(r => log(`     ${c.red}-${c.reset} ${r.title.padEnd(22)} ${INR(r.amount)} / ${r.cycle === 'monthly' && r.interval > 1 ? `${r.interval} months` : r.cycle}`));

  // 6. Set budget
  sep();
  const monthStr   = `${thisYear}-${String(thisMonth + 1).padStart(2, '0')}`;
  const budgetLimit = 70000;
  await Budget.findOneAndUpdate(
    { userId: user._id, month: monthStr },
    { userId: user._id, month: monthStr, limit: budgetLimit },
    { upsert: true, new: true }
  );
  ok(`Budget set: ${INR(budgetLimit)} for ${monthStr}`);

  // 7. Bust Redis cache so insights are freshly generated
  sep();
  info('Busting Redis insight cache for this user…');
  await cacheDelPattern(`insights:*:${user._id.toString()}:*`);
  ok('Cache cleared (Gemini will be called fresh)');

  // 8. Print summary
  sep();
  const prev = summarise(prevMonthTxns);
  const curr = summarise(currMonthTxns);

  log(`\n${c.bold}  📊 TRANSACTION SUMMARY${c.reset}`);
  log(`\n  ${c.yellow}Previous Month (${prevYear}-${String(prevMonth + 1).padStart(2, '0')})${c.reset}`);
  log(`     Income   : ${c.green}${INR(prev.income)}${c.reset}`);
  log(`     Expenses : ${c.red}${INR(prev.expense)}${c.reset}`);
  log(`     Savings  : ${c.cyan}${INR(prev.income - prev.expense)}${c.reset}`);
  Object.entries(prev.categories).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => log(`       ${k.padEnd(16)} ${INR(v)}`));

  log(`\n  ${c.yellow}Current Month  (${thisYear}-${String(thisMonth + 1).padStart(2, '0')})${c.reset}`);
  log(`     Income   : ${c.green}${INR(curr.income)}${c.reset}`);
  log(`     Expenses : ${c.red}${INR(curr.expense)}${c.reset}`);
  log(`     Savings  : ${c.cyan}${INR(curr.income - curr.expense)}${c.reset}`);
  log(`     Budget   : ${INR(budgetLimit)} — ${Math.round((curr.expense / budgetLimit) * 100)}% used`);
  Object.entries(curr.categories).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => log(`       ${k.padEnd(16)} ${INR(v)}`));

  // 9. Call Gemini
  head('Calling Gemini AI for Insights…');
  info('Sending financial data to Gemini 2.5 Flash…');

  const budgetData = {
    limit: budgetLimit,
    spent: curr.expense,
    percentage: Math.round((curr.expense / budgetLimit) * 100),
  };

  const t0     = Date.now();
  const result = await generateAIInsights(user._id.toString(), curr, prev, budgetData);
  const ms     = Date.now() - t0;

  const sourceLabel = result.source === 'gemini'
    ? `${c.green}GEMINI ✨${c.reset}`
    : `${c.yellow}MOCK (Gemini unavailable)${c.reset}`;
  ok(`Response in ${ms}ms  |  Source: ${c.bold}${sourceLabel}  |  fromCache: ${result.fromCache}`);

  // 10. Print insights
  head('AI Financial Insights');

  const typeColor = { success: c.green, warning: c.yellow, danger: c.red, info: c.blue, tip: c.magenta };

  result.insights.forEach((ins, i) => {
    const col = typeColor[ins.type] || c.reset;
    log(`\n  ${c.bold}[${i + 1}] ${ins.icon}  ${col}${ins.title}${c.reset}  ${c.grey}(${ins.type})${c.reset}`);
    log(`      ${ins.message}`);
  });

  // 11. Done
  head('All Done!');
  ok(`${result.insights.length} Gemini insights generated`);
  ok(`${prevMonthTxns.length + currMonthTxns.length} transactions seeded`);
  ok(`${recurringTemplates.length} recurring templates seeded`);
  log(`\n  ${c.bold}${c.cyan}Now log in to the app as:${c.reset}`);
  log(`     Email   : ${c.bold}${user.email}${c.reset}`);
  log(`     The dashboard will show all the seeded data + Gemini insights\n`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(`\n  ✖  Fatal: ${e.message}`);
  console.error(e);
  mongoose.disconnect().finally(() => process.exit(1));
});
