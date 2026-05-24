// services/aiService.js
// Google Gemini AI integration for SpendWise.
// Sends the user's FULL financial context — individual transactions, recurring
// commitments, savings rate, budget status — so Gemini can give genuinely
// personalised advice rather than enhanced generic observations.
// Falls back to the deterministic mock engine if the API key is absent or the
// call fails — so the endpoint always returns something useful.

const { cacheGet, cacheSet } = require('../config/redis');

// ---------------------------------------------------------------------------
// Gemini REST caller
// ---------------------------------------------------------------------------

const callGemini = async (prompt) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature:      0.3,   // Low = more consistent, data-driven advice
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty Gemini response');
  return text;
};

// ---------------------------------------------------------------------------
// Prompt builder — constructs a detailed, data-rich prompt
// ---------------------------------------------------------------------------

/**
 * Build the full Gemini prompt from all available user data.
 * The goal is to give Gemini ENOUGH SPECIFIC CONTEXT to generate insights that
 * reference actual line items, recurring obligations, and real behaviour — not
 * just restate the totals.
 */
const buildPrompt = (currData, prevData, budgetData, recurringData) => {
  const INR = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

  // ── Current month summary ─────────────────────────────────────────────────
  const currSavings     = currData.income - currData.expense;
  const prevSavings     = prevData.income - prevData.expense;
  const savingsRate     = currData.income > 0
    ? ((currSavings / currData.income) * 100).toFixed(1)
    : '0.0';
  const prevSavingsRate = prevData.income > 0
    ? ((prevSavings / prevData.income) * 100).toFixed(1)
    : '0.0';

  // ── Budget section ────────────────────────────────────────────────────────
  const budgetSection = budgetData
    ? `
BUDGET STATUS:
  Monthly budget limit : ${INR(budgetData.limit)}
  Amount spent         : ${INR(budgetData.spent)} (${budgetData.percentage}% used)
  Remaining            : ${INR(budgetData.remaining)}
  Status               : ${budgetData.exceeded ? '🚨 BUDGET EXCEEDED' : budgetData.percentage >= 90 ? '⚠️ Nearly exhausted' : '✅ Within budget'}`
    : '\nBUDGET STATUS: No monthly budget set by the user.';

  // ── Category breakdown current month ─────────────────────────────────────
  const catLines = Object.entries(currData.categories || {})
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => {
      const pctOfExpense = currData.expense > 0 ? ((amt / currData.expense) * 100).toFixed(1) : '0';
      const prevAmt      = (prevData.categories || {})[cat] || 0;
      const change       = prevAmt > 0 ? (((amt - prevAmt) / prevAmt) * 100).toFixed(0) : 'NEW';
      return `  ${cat.padEnd(16)}: ${INR(amt).padEnd(12)} (${pctOfExpense}% of expenses${change !== 'NEW' ? `, ${change > 0 ? '+' : ''}${change}% vs last month` : ', NEW this month'})`;
    })
    .join('\n');

  // ── Top individual transactions ────────────────────────────────────────────
  const topExpenseLines = (currData.topExpenses || [])
    .map((t, i) => `  ${i + 1}. ${INR(t.amount)} — ${t.category}${t.note ? ` (${t.note})` : ''}`)
    .join('\n');

  // ── Income sources ────────────────────────────────────────────────────────
  const incomeLines = (currData.incomeSources || [])
    .map(t => `  • ${INR(t.amount)} — ${t.category}${t.note ? ` (${t.note})` : ''}`)
    .join('\n');

  // ── Recurring income ──────────────────────────────────────────────────────
  const recIncomeLines = (recurringData?.recurringIncome || []).length > 0
    ? (recurringData.recurringIncome || [])
        .map(r => `  • ${r.title}: ${INR(r.amount)} / ${r.cycle === 'monthly' && r.interval > 1 ? `every ${r.interval} months` : r.cycle}${r.note ? ` (${r.note})` : ''}`)
        .join('\n')
    : '  None configured';

  // ── Recurring expenses ────────────────────────────────────────────────────
  const recExpenseLines = (recurringData?.recurringExpenses || []).length > 0
    ? (recurringData.recurringExpenses || [])
        .map(r => `  • ${r.title}: ${INR(r.amount)} / ${r.cycle === 'monthly' && r.interval > 1 ? `every ${r.interval} months` : r.cycle}${r.endDate ? ` (ends ${new Date(r.endDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })})` : ''}${r.note ? ` — ${r.note}` : ''}`)
        .join('\n')
    : '  None configured';

  const totalCommitted  = recurringData?.totalRecurringExpenseMonthly || 0;
  const discretionary   = currData.expense - totalCommitted;
  const committedPct    = currData.expense > 0 ? ((totalCommitted / currData.expense) * 100).toFixed(1) : '0';
  const disposableAfterCommitted = currData.income - totalCommitted;

  // ── Previous month category summary (brief) ───────────────────────────────
  const prevCatLines = Object.entries(prevData.categories || {})
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => `  ${cat}: ${INR(amt)}`)
    .join('\n');

  // ── Full prompt ───────────────────────────────────────────────────────────
  return `You are a sharp, data-driven personal finance analyst AND a creative money-saving coach for an Indian user. You have access to the user's complete financial data for this month — every transaction with its label, all recurring commitments, budget status, and last month's comparison.

Your job is to generate 8–12 GENUINELY PERSONALISED insights. You MUST:
- Reference specific transaction names, amounts, and percentages from the data below
- Identify real patterns in the data (e.g., if Shopping tripled, say exactly why based on the transaction notes)
- Analyse the recurring commitments and flag risks (e.g. high fixed costs eating into savings)
- Compare savings rates, not just raw savings amounts
- Be direct, frank, and prescriptive — not generic
- MOST IMPORTANTLY: Include 3–4 CREATIVE, UNUSUAL, ACTIONABLE money-saving suggestions specific to the user's TOP spending categories. These should NOT be generic advice like "spend less" — they should be clever, practical hacks the user may not have thought of.

Examples of the kind of CREATIVE cost-cutting suggestions expected (adapt to the user's actual categories):
- Food/Dining: "Your ₹X on Swiggy/Zomato could drop 40% with a Sunday meal-prep habit — batch cook 3 curries, freeze portions, saves ~₹Y/month."
- Transport: "₹X on Uber/Ola — try Rapido bike-taxi for solo trips (50% cheaper) or arrange a carpool via your office Slack."
- Shopping: "Before any purchase over ₹500, use the 48-hour rule — add to cart, wait 2 days. Studies show 70% of impulse buys get abandoned."
- Entertainment: "Family sharing on Spotify/YouTube Premium splits the cost 5 ways — you'd save ₹X/month."
- Bills/Utilities: "Switch to LED bulbs and smart power strips — typical savings of ₹300-500/month on electricity."
- Subscriptions: "Stack your free trials — most services offer 7-30 day trials. Rotate instead of paying for all simultaneously."
- Health: "Generic medicines are 60-80% cheaper than branded ones with identical composition. Ask your pharmacist."

DO NOT produce generic observations like "expenses rose" without citing the specific cause from the data.

════════════════════════════════════════════════
  THIS MONTH'S FINANCIAL DATA
════════════════════════════════════════════════

INCOME & SAVINGS:
  Total income        : ${INR(currData.income)}
  Total expenses      : ${INR(currData.expense)}
  Net savings         : ${INR(currSavings)} ${currSavings < 0 ? '⚠️ DEFICIT' : ''}
  Savings rate        : ${savingsRate}%  (last month: ${prevSavingsRate}%)
  Transaction count   : ${currData.transactions}
${budgetSection}

INCOME SOURCES THIS MONTH:
${incomeLines || '  No income recorded'}

TOP EXPENSE TRANSACTIONS (by amount):
${topExpenseLines || '  No expenses recorded'}

SPENDING BY CATEGORY (vs last month):
${catLines || '  No category data'}

════════════════════════════════════════════════
  RECURRING COMMITMENTS
════════════════════════════════════════════════

RECURRING INCOME STREAMS:
${recIncomeLines}

RECURRING EXPENSE OBLIGATIONS:
${recExpenseLines}

Monthly committed expenses (recurring, interval=1): ${INR(totalCommitted)}
  As % of this month's total expense : ${committedPct}%
  Discretionary spend this month     : ${INR(discretionary)}
  Disposable after all commitments   : ${INR(disposableAfterCommitted)}

════════════════════════════════════════════════
  LAST MONTH COMPARISON
════════════════════════════════════════════════

  Income   : ${INR(prevData.income)}
  Expenses : ${INR(prevData.expense)}
  Savings  : ${INR(prevSavings)} (${prevSavingsRate}% rate)

  Last month by category:
${prevCatLines || '  No data'}

════════════════════════════════════════════════
  YOUR TASK
════════════════════════════════════════════════

Return ONLY a valid JSON array with 8–12 insight objects. Each object must have EXACTLY these fields:
  "type"    — one of: "success", "warning", "danger", "info", "tip", "saving_hack"
  "icon"    — one relevant emoji
  "title"   — max 6 words, specific and catchy (NOT generic like "Expenses rose")
  "message" — 2–4 sentences. MUST cite specific amounts, transaction names, or percentages from the data above. Be prescriptive — tell the user exactly what to do.

Prioritise insights in this order:
1. Any budget breach or near-breach (danger/warning)
2. Savings rate change and what caused it (specific transactions)
3. Recurring obligations analysis — are fixed costs sustainable vs income?
4. Biggest specific spending items and whether they are one-off or recurring
5. Category spikes with named transactions as evidence
6. 3–4 CREATIVE MONEY-SAVING HACKS (type: "saving_hack") — these MUST be specific to the user's top spending categories, with estimated savings amounts. Think unconventional: DIY alternatives, bulk-buying tricks, cashback stacking, timing purchases for sales, switching to cheaper alternatives, habit changes, tech tools that save money, etc.
7. One forward-looking tip based on the actual numbers

Output ONLY the JSON array, no markdown fences, no explanation.`;
};

// ---------------------------------------------------------------------------
// Mock insights engine (deterministic fallback)
// ---------------------------------------------------------------------------

const generateMockInsights = (currData, prevData) => {
  const insights = [];

  const currSavings = currData.income - currData.expense;
  const prevSavings = prevData.income - prevData.expense;

  // Savings rate comparison
  if (prevSavings > 0) {
    const change = ((currSavings - prevSavings) / prevSavings) * 100;
    if (change < -20) {
      insights.push({ type: 'warning', icon: '📉', title: 'Savings Dropped',
        message: `Savings fell ${Math.abs(change).toFixed(0)}% vs last month. Review discretionary spending.` });
    } else if (change > 20) {
      insights.push({ type: 'success', icon: '📈', title: 'Savings Improved',
        message: `Savings up ${change.toFixed(0)}% vs last month. Excellent discipline!` });
    }
  }

  // Overall expense change
  if (prevData.expense > 0) {
    const expChange = ((currData.expense - prevData.expense) / prevData.expense) * 100;
    if (expChange > 15) {
      insights.push({ type: 'warning', icon: '⚠️', title: 'Expenses Rising',
        message: `Total expenses up ${expChange.toFixed(0)}% (₹${currData.expense.toLocaleString()} vs ₹${prevData.expense.toLocaleString()} last month).` });
    } else if (expChange < -15) {
      insights.push({ type: 'success', icon: '✅', title: 'Spending Reduced',
        message: `Expenses down ${Math.abs(expChange).toFixed(0)}% vs last month. Great financial control!` });
    }
  }

  // Category-level spikes
  Object.keys(currData.categories || {}).forEach((cat) => {
    const curr = currData.categories[cat] || 0;
    const prev = (prevData.categories || {})[cat] || 0;
    if (prev > 0) {
      const pct = ((curr - prev) / prev) * 100;
      if (pct > 30 && curr > 1000) {
        insights.push({ type: 'info', icon: '🔍', title: `${cat} Spending Up`,
          message: `${cat} up ${pct.toFixed(0)}% this month (₹${curr.toLocaleString()} vs ₹${prev.toLocaleString()}).` });
      }
    }
  });

  // Top spending category
  const topCat = Object.entries(currData.categories || {}).sort((a, b) => b[1] - a[1])[0];
  if (topCat && currData.expense > 0) {
    const pct = ((topCat[1] / currData.expense) * 100).toFixed(0);
    if (pct > 40) {
      insights.push({ type: 'info', icon: '🏷️', title: `${topCat[0]} Dominates Budget`,
        message: `${topCat[0]} accounts for ${pct}% of expenses. Consider setting a category limit.` });
    }
  }

  if (currData.income === 0) {
    insights.push({ type: 'info', icon: '💡', title: 'No Income Recorded',
      message: 'No income logged this month. Add income for accurate savings tracking.' });
  }

  if (insights.length === 0) {
    insights.push({ type: 'success', icon: '🎉', title: 'Stable Finances',
      message: 'Spending patterns look consistent this month. Keep it up!' });
  }

  // ── Creative, category-specific money-saving hacks ─────────────────────────
  const categoryHacks = {
    Food: [
      { icon: '🍱', title: 'Meal-Prep Sundays Save Big', message: `You spent ₹${((currData.categories || {}).Food || 0).toLocaleString()} on Food. Batch-cooking 3 dishes on Sunday and freezing portions can slash food delivery costs by 40-60%. Try dal, sabzi, and rice — freezes perfectly for 5 days.` },
      { icon: '🛒', title: 'Buy Groceries in Bulk', message: `Your Food spend of ₹${((currData.categories || {}).Food || 0).toLocaleString()} could drop 20-30% by buying staples (rice, dal, oil) in bulk from wholesale markets or BigBasket's monthly subscription packs.` },
    ],
    Transport: [
      { icon: '🛵', title: 'Switch to Rapido Bike-Taxis', message: `Transport costs of ₹${((currData.categories || {}).Transport || 0).toLocaleString()} can be halved for solo trips. Rapido bike-taxis are 50% cheaper than Uber/Ola. For office commutes, try arranging a carpool via your workplace group.` },
      { icon: '🚌', title: 'Metro + Last-Mile Combo', message: `Instead of full cab rides, take the metro for the main stretch and use an e-scooter (Yulu/Bounce) for the last mile. This combo typically saves 60-70% vs door-to-door cabs.` },
    ],
    Shopping: [
      { icon: '⏳', title: 'Use the 48-Hour Rule', message: `Your Shopping spend is ₹${((currData.categories || {}).Shopping || 0).toLocaleString()}. Before any purchase over ₹500, add it to your cart and wait 48 hours. Research shows 70% of impulse buys get abandoned this way — saving you potentially ₹${Math.round(((currData.categories || {}).Shopping || 0) * 0.3).toLocaleString()}/month.` },
      { icon: '🏷️', title: 'Stack Coupons & Cashback', message: `Use browser extensions like CashKaro or Cred Store before any online purchase. Stacking credit card rewards + cashback portals + sale prices can save 15-25% on every order. On your ₹${((currData.categories || {}).Shopping || 0).toLocaleString()} shopping, that's ₹${Math.round(((currData.categories || {}).Shopping || 0) * 0.2).toLocaleString()} back.` },
    ],
    Entertainment: [
      { icon: '👨‍👩‍👧‍👦', title: 'Family-Share Subscriptions', message: `Split Spotify Family (₹179/6), YouTube Premium Family (₹189/5), and Netflix with friends. You could cut your Entertainment spend of ₹${((currData.categories || {}).Entertainment || 0).toLocaleString()} by 60-80% just by sharing plans.` },
      { icon: '🎮', title: 'Rotate Free Trials Smartly', message: `Instead of paying for multiple streaming services simultaneously, subscribe to one at a time and binge-watch, then switch. Most offer 7-30 day free trials you haven't used yet.` },
    ],
    Bills: [
      { icon: '💡', title: 'Switch to LED + Smart Strips', message: `Replace all bulbs with LED and use smart power strips that cut phantom loads. Typical savings: ₹300-500/month on electricity. Also, check if your electricity provider has a time-of-use plan — running heavy appliances at off-peak hours saves 10-20%.` },
      { icon: '📱', title: 'Audit Your Mobile/WiFi Plan', message: `Most people overpay for data they don't use. Check Jio/Airtel's latest plans — a downgrade could save ₹200-400/month without noticing any difference in usage.` },
    ],
    Health: [
      { icon: '💊', title: 'Switch to Generic Medicines', message: `Generic medicines contain the exact same active ingredients as branded ones but cost 60-80% less. Apps like PharmEasy and 1mg show generic alternatives. Ask your doctor to prescribe generics — it's completely safe and hugely cheaper.` },
      { icon: '🏃', title: 'Outdoor Workouts Save Gym Fees', message: `If you're paying for a gym, consider switching to outdoor running + YouTube home workouts 3 days/week. Parks are free, and channels like JEFIT and FitnessBlender replace ₹1,500-3,000/month gym memberships.` },
    ],
    Utilities: [
      { icon: '🔌', title: 'Unplug Phantom Power Drains', message: `Devices on standby (TV, chargers, router) consume 5-10% of your electricity bill. Use a master power strip and flip it off when leaving — saves ₹200-400/month.` },
    ],
    Education: [
      { icon: '📚', title: 'Free Alternatives to Paid Courses', message: `Before paying for courses, check free alternatives: MIT OpenCourseWare, freeCodeCamp, Khan Academy, and YouTube tutorials cover 90% of topics. Your Education spend could drop significantly.` },
    ],
    Rent: [
      { icon: '🏠', title: 'Negotiate or Time Your Renewal', message: `Renegotiate rent 2 months before renewal — landlords prefer keeping tenants over finding new ones. Even a 5% reduction on your rent saves thousands annually. Also check if maintenance charges can be bundled.` },
    ],
  };

  // Pick hacks based on user's actual top spending categories
  const sortedCats = Object.entries(currData.categories || {}).sort((a, b) => b[1] - a[1]);
  const usedHackCategories = new Set();
  let hackCount = 0;

  for (const [cat] of sortedCats) {
    if (hackCount >= 3) break;
    const hacks = categoryHacks[cat];
    if (hacks && !usedHackCategories.has(cat)) {
      // Pick one hack per category (rotate by day of month)
      const hack = hacks[new Date().getDate() % hacks.length];
      insights.push({ type: 'saving_hack', ...hack });
      usedHackCategories.add(cat);
      hackCount++;
    }
  }

  // If we didn't get enough category-specific hacks, add general ones
  const generalHacks = [
    { icon: '🧾', title: 'Track Every ₹100 Spend', message: 'Research shows that simply logging every expense makes people spend 15-20% less. You\'re already using SpendWise — make sure every cash purchase gets logged too. The awareness alone changes behaviour.' },
    { icon: '🏦', title: 'Auto-Transfer on Payday', message: 'Set up an auto-transfer of 20% of your income to a separate savings account ON payday — before you can spend it. What you don\'t see, you don\'t spend. This single habit builds wealth faster than any budgeting trick.' },
    { icon: '📅', title: 'No-Spend Days Challenge', message: 'Try 8-10 "no-spend days" per month where you spend ₹0 on discretionary items. Pack lunch, skip online shopping, use free entertainment. Most people save ₹3,000-5,000/month with this simple challenge.' },
    { icon: '🔄', title: 'The 1-In-1-Out Rule', message: 'For every new item you buy, sell or donate one existing item. This naturally curbs impulse purchases and can even earn money back through OLX or Facebook Marketplace.' },
    { icon: '☕', title: 'The Latte Factor Adds Up', message: 'Small daily purchases (chai, snacks, parking) seem insignificant but ₹100/day = ₹3,000/month = ₹36,000/year. Carry a flask and homemade snacks 3-4 days/week to reclaim half of that.' },
  ];

  while (hackCount < 3) {
    const hack = generalHacks[hackCount % generalHacks.length];
    insights.push({ type: 'saving_hack', ...hack });
    hackCount++;
  }

  // General rotating financial tip
  const tips = [
    { icon: '💰', title: '50/30/20 Rule', message: 'Allocate 50% to needs, 30% to wants, 20% to savings. Based on your income, that means max ₹' + Math.round((currData.income || 0) * 0.3).toLocaleString() + ' on wants and ₹' + Math.round((currData.income || 0) * 0.2).toLocaleString() + ' straight to savings.' },
    { icon: '🎯', title: 'Emergency Fund Goal', message: `Based on your monthly expenses of ₹${(currData.expense || 0).toLocaleString()}, aim for an emergency fund of ₹${(((currData.expense || 0)) * 6).toLocaleString()} (6 months of expenses). Start with ₹${Math.round((currData.income || 0) * 0.1).toLocaleString()}/month.` },
    { icon: '📈', title: 'SIP Beats Savings Account',   message: 'Your savings account gives 3-4% returns. A simple Nifty 50 index fund SIP gives ~12% long-term. Even ₹2,000/month in SIP grows to ~₹20 lakhs in 20 years vs ~₹7 lakhs in a savings account.' },
    { icon: '✂️', title: 'Subscription Audit Month', message: 'List every recurring subscription (OTT, gym, apps, cloud storage). Cancel ones unused in the last 30 days. Average Indian saves ₹1,200-2,500/month from this one-time audit.' },
  ];
  insights.push({ type: 'tip', ...tips[new Date().getDate() % tips.length] });

  return insights;
};

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

/**
 * Generate AI financial insights for a user.
 *
 * @param {string} userId
 * @param {Object} currData       - { income, expense, savings, categories, transactions, topExpenses, incomeSources }
 * @param {Object} prevData       - same shape for previous month
 * @param {Object|null} budgetData
 * @param {Object} recurringData  - { recurringIncome, recurringExpenses, totalRecurringExpenseMonthly }
 * @returns {Promise<{ insights: Array, source: 'gemini'|'mock', fromCache: boolean }>}
 */
const generateAIInsights = async (
  userId,
  currData,
  prevData,
  budgetData     = null,
  recurringData  = { recurringIncome: [], recurringExpenses: [], totalRecurringExpenseMonthly: 0 },
) => {
  const now      = new Date();
  const cacheKey = `insights:ai:${userId}:${now.getUTCFullYear()}:${now.getUTCMonth()}`;

  // Try Redis cache first (30-minute TTL)
  const cached = await cacheGet(cacheKey);
  if (cached) return { ...cached, fromCache: true };

  let insights;
  let source = 'mock';

  try {
    const prompt   = buildPrompt(currData, prevData, budgetData, recurringData);
    const rawText  = await callGemini(prompt);

    // Parse — Gemini may wrap in ```json fences
    const clean  = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(clean);

    if (Array.isArray(parsed) && parsed.length > 0) {
      insights = parsed;
      source   = 'gemini';
    } else {
      throw new Error('Invalid Gemini response format');
    }
  } catch (err) {
    console.warn(`⚠️  Gemini insights failed (${err.message}), using mock engine`);
    insights = generateMockInsights(currData, prevData);
    source   = 'mock';
  }

  const result = { insights, source };
  await cacheSet(cacheKey, result, 1800);   // cache 30 min

  return { ...result, fromCache: false };
};

module.exports = { generateAIInsights, generateMockInsights };
