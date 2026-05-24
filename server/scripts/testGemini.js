require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose             = require('mongoose');
const User                 = require('../models/User');
const Transaction          = require('../models/Transaction');
const RecurringTransaction = require('../models/RecurringTransaction');
const Budget               = require('../models/Budget');
const { generateAIInsights } = require('../services/aiService');

const monthRange = (year, month) => ({
  start: new Date(Date.UTC(year, month, 1)),
  end:   new Date(Date.UTC(year, month + 1, 1)),
});

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✔  Connected to MongoDB');

  const user = await User.findOne().sort({ createdAt: 1 });
  console.log(`✔  User: ${user.name} <${user.email}>\n`);

  const now = new Date();
  const cm = now.getUTCMonth();
  const cy = now.getUTCFullYear();
  const pm = cm === 0 ? 11 : cm - 1;
  const py = cm === 0 ? cy - 1 : cy;

  const getData = async (year, month) => {
    const { start, end } = monthRange(year, month);
    const txns = await Transaction.find({ userId: user._id, date: { $gte: start, $lt: end } })
      .sort({ amount: -1 }).lean();
    const income  = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const cats    = {};
    txns.filter(t => t.type === 'expense').forEach(t => { cats[t.category] = (cats[t.category] || 0) + t.amount; });
    return {
      income, expense,
      savings:    income - expense,
      savingsRate: income > 0 ? Math.round(((income - expense) / income) * 100) : 0,
      categories: cats,
      transactions: txns.length,
      topExpenses:  txns.filter(t => t.type === 'expense').slice(0, 8)
                        .map(t => ({ amount: t.amount, category: t.category, note: t.note || '' })),
      incomeSources: txns.filter(t => t.type === 'income')
                         .map(t => ({ amount: t.amount, category: t.category, note: t.note || '' })),
    };
  };

  const [currData, prevData] = await Promise.all([getData(cy, cm), getData(py, pm)]);

  console.log(`📊 Current month (${cy}-${cm + 1}): Income ₹${currData.income.toLocaleString('en-IN')} | Expense ₹${currData.expense.toLocaleString('en-IN')}`);
  console.log(`📊 Previous month (${py}-${pm + 1}): Income ₹${prevData.income.toLocaleString('en-IN')} | Expense ₹${prevData.expense.toLocaleString('en-IN')}\n`);

  const monthStr  = `${cy}-${String(cm + 1).padStart(2, '0')}`;
  const budget    = await Budget.findOne({ userId: user._id, month: monthStr }).lean();
  const budgetData = budget
    ? { limit: budget.limit, spent: currData.expense, remaining: budget.limit - currData.expense,
        percentage: Math.round((currData.expense / budget.limit) * 100), exceeded: currData.expense > budget.limit }
    : null;
  console.log(budgetData ? `💰 Budget: ₹${budget.limit.toLocaleString('en-IN')} | ${budgetData.percentage}% used` : '💰 No budget set');

  const recurring = await RecurringTransaction.find({ userId: user._id, isActive: true })
    .sort({ amount: -1 }).lean();
  const recurringIncome   = recurring.filter(r => r.type === 'income');
  const recurringExpenses = recurring.filter(r => r.type === 'expense');
  const totalRecurringExpenseMonthly = recurringExpenses
    .filter(r => r.cycle === 'monthly' && r.interval === 1)
    .reduce((s, r) => s + r.amount, 0);

  console.log(`🔁 Recurring: ${recurringIncome.length} income streams, ${recurringExpenses.length} expense templates`);
  console.log(`   Monthly committed expenses: ₹${totalRecurringExpenseMonthly.toLocaleString('en-IN')}\n`);

  // Bust cache — skip if Redis not available
  try {
    const { cacheDelPattern } = require('../config/redis');
    await cacheDelPattern(`insights:ai:${user._id}:*`);
    console.log('✔  Redis cache cleared\n');
  } catch (e) {
    console.log('ℹ  Redis cache bust skipped\n');
  }

  console.log('════════════════════════════════════════════════════\n  Calling Gemini with FULL contextual data...\n════════════════════════════════════════════════════\n');
  const t0     = Date.now();
  const result = await generateAIInsights(
    user._id.toString(), currData, prevData, budgetData,
    { recurringIncome, recurringExpenses, totalRecurringExpenseMonthly },
  );
  const ms = Date.now() - t0;

  console.log(`✔  Source: ${result.source.toUpperCase()} | Time: ${ms}ms | fromCache: ${result.fromCache}\n`);
  console.log('════════════════════════════════════════════════════\n  GEMINI INSIGHTS\n════════════════════════════════════════════════════\n');

  result.insights.forEach((ins, i) => {
    console.log(`[${i + 1}] ${ins.icon}  (${ins.type.toUpperCase()})  ${ins.title}`);
    console.log(`    ${ins.message}\n`);
  });

  await mongoose.disconnect();
}

main().catch(e => {
  console.error('\n✖  Fatal:', e.message);
  console.error(e);
  mongoose.disconnect().finally(() => process.exit(1));
});
