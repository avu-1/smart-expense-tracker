// services/emailService.js
// Centralised email utility.
// Production: uses Resend (HTTP API — works on Railway, no SMTP port issues).
// Development fallback: Nodemailer + Ethereal for previewing emails locally.

const nodemailer = require('nodemailer');

// ---------------------------------------------------------------------------
// Resend (production) send helper
// ---------------------------------------------------------------------------
const sendViaResend = async ({ to, subject, html, from }) => {
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({ from, to, subject, html });
  if (error) throw new Error(error.message || JSON.stringify(error));
  return data;
};

// ---------------------------------------------------------------------------
// Nodemailer Ethereal (dev only) setup
// ---------------------------------------------------------------------------
let devTransporter = null;
const getDevTransporter = async () => {
  if (devTransporter) return devTransporter;
  const testAccount = await nodemailer.createTestAccount();
  devTransporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
  console.log('📧 Email service: using Ethereal test account (dev)');
  console.log(`   Preview: https://ethereal.email/messages`);
  console.log(`   Credentials: ${testAccount.user} / ${testAccount.pass}`);
  return devTransporter;
};

// ---------------------------------------------------------------------------
// Generic send helper
// ---------------------------------------------------------------------------

/**
 * Send a single email.
 * Production: uses Resend HTTP API (works on Railway — no SMTP ports needed).
 * Development: falls back to Ethereal for preview.
 * @param {Object} options - { to, subject, html, text }
 */
const sendEmail = async ({ to, subject, html }) => {
  const FROM = process.env.RESEND_FROM || process.env.SMTP_FROM || 'SpendWise <onboarding@resend.dev>';
  try {
    if (process.env.RESEND_API_KEY) {
      // ── Production: Resend HTTP API ──────────────────────────────────────
      console.log(`📧 Sending via Resend to ${to}...`);
      const data = await sendViaResend({ to, subject, html, from: FROM });
      console.log(`✅ Resend: email sent to ${to}. ID: ${data?.id}`);
      return data;
    } else {
      // ── Development: Ethereal preview ────────────────────────────────────
      const t = await getDevTransporter();
      const info = await t.sendMail({ from: FROM, to, subject, html });
      console.log(`📧 Dev email preview → ${nodemailer.getTestMessageUrl(info)}`);
      return info;
    }
  } catch (err) {
    console.error(`❌ Email send failed to ${to}:`, err.message);
    return null;
  }
};

// ---------------------------------------------------------------------------
// Shared HTML shell
// ---------------------------------------------------------------------------

const emailShell = (bodyHtml) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background:#0a1628; margin:0; padding:0; }
    .wrap { max-width:560px; margin:32px auto; background:#0f2744; border-radius:16px; overflow:hidden; }
    .header { background:#10b981; padding:24px 32px; }
    .header h1 { color:#fff; margin:0; font-size:22px; }
    .body { padding:28px 32px; color:#cbd5e1; font-size:15px; line-height:1.6; }
    .body h2 { color:#f1f5f9; margin-top:0; }
    .amount { font-size:28px; font-weight:700; color:#10b981; }
    .badge { display:inline-block; padding:4px 12px; border-radius:20px; font-size:13px; font-weight:600; }
    .badge-red   { background:#ef444420; color:#ef4444; }
    .badge-amber { background:#f59e0b20; color:#f59e0b; }
    .badge-green { background:#10b98120; color:#10b981; }
    .divider { border:none; border-top:1px solid #1e3a5f; margin:20px 0; }
    .footer { padding:16px 32px; background:#091525; color:#475569; font-size:12px; text-align:center; }
    table { width:100%; border-collapse:collapse; }
    td { padding:8px 0; color:#94a3b8; font-size:14px; }
    td.label { color:#64748b; width:40%; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header"><h1>💰 SpendWise</h1></div>
    <div class="body">${bodyHtml}</div>
    <div class="footer">You're receiving this because you have email alerts enabled in SpendWise.<br/>
      To manage notifications, update your account preferences.</div>
  </div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Specific email templates
// ---------------------------------------------------------------------------

/**
 * Send a "budget exceeded" alert.
 * @param {Object} user   - { name, email }
 * @param {Object} budget - { limit, spent, remaining, percentage, month }
 */
const sendBudgetExceededAlert = async (user, budget) => {
  const html = emailShell(`
    <h2>🚨 Budget Exceeded</h2>
    <p>Hi <strong>${user.name}</strong>,</p>
    <p>Your monthly spending budget has been exceeded for <strong>${budget.month}</strong>.</p>
    <hr class="divider"/>
    <table>
      <tr><td class="label">Budget Limit</td><td>₹${budget.limit.toLocaleString()}</td></tr>
      <tr><td class="label">Amount Spent</td><td class="amount">₹${budget.spent.toLocaleString()}</td></tr>
      <tr><td class="label">Over Budget By</td><td><span class="badge badge-red">₹${Math.abs(budget.remaining).toLocaleString()}</span></td></tr>
    </table>
    <hr class="divider"/>
    <p>Review your recent transactions in SpendWise and identify areas to cut back.</p>
  `);

  return sendEmail({
    to: user.email,
    subject: `🚨 Budget Exceeded — You've overspent by ₹${Math.abs(budget.remaining).toLocaleString()} this month`,
    html,
  });
};

/**
 * Send a "budget warning" alert (80%+ used).
 */
const sendBudgetWarningAlert = async (user, budget) => {
  const html = emailShell(`
    <h2>⚠️ Budget Warning</h2>
    <p>Hi <strong>${user.name}</strong>,</p>
    <p>You've used <strong>${budget.percentage}%</strong> of your monthly budget for <strong>${budget.month}</strong>.</p>
    <hr class="divider"/>
    <table>
      <tr><td class="label">Budget Limit</td><td>₹${budget.limit.toLocaleString()}</td></tr>
      <tr><td class="label">Spent So Far</td><td>₹${budget.spent.toLocaleString()}</td></tr>
      <tr><td class="label">Remaining</td><td><span class="badge badge-amber">₹${budget.remaining.toLocaleString()}</span></td></tr>
    </table>
    <hr class="divider"/>
    <p>You have <strong>₹${budget.remaining.toLocaleString()}</strong> left. Spend wisely for the rest of the month!</p>
  `);

  return sendEmail({
    to: user.email,
    subject: `⚠️ SpendWise: ${budget.percentage}% of your monthly budget used`,
    html,
  });
};

/**
 * Send an upcoming bill reminder.
 * @param {Object} user      - { name, email }
 * @param {Object} recurring - RecurringTransaction document
 * @param {number} daysLeft  - how many days until execution (1 or 2)
 */
const sendBillReminderEmail = async (user, recurring, daysLeft) => {
  const dateStr = new Date(recurring.nextExecutionDate).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const html = emailShell(`
    <h2>🔔 Upcoming Bill Reminder</h2>
    <p>Hi <strong>${user.name}</strong>,</p>
    <p>You have a recurring ${recurring.type} due in <strong>${daysLeft} day${daysLeft > 1 ? 's' : ''}</strong>.</p>
    <hr class="divider"/>
    <table>
      <tr><td class="label">Title</td><td><strong>${recurring.title}</strong></td></tr>
      <tr><td class="label">Amount</td><td class="amount">₹${recurring.amount.toLocaleString()}</td></tr>
      <tr><td class="label">Category</td><td>${recurring.category}</td></tr>
      <tr><td class="label">Due Date</td><td>${dateStr}</td></tr>
      <tr><td class="label">Type</td><td>
        <span class="badge ${recurring.type === 'expense' ? 'badge-red' : 'badge-green'}">
          ${recurring.type === 'expense' ? '↓ Expense' : '↑ Income'}
        </span>
      </td></tr>
    </table>
    <hr class="divider"/>
    <p>This transaction will be automatically recorded on the due date.</p>
  `);

  return sendEmail({
    to: user.email,
    subject: `🔔 Reminder: "${recurring.title}" — ₹${recurring.amount.toLocaleString()} due in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`,
    html,
  });
};

/**
 * Send a transaction confirmation email.
 * @param {Object} user        - { name, email }
 * @param {Object} transaction - Transaction document
 */
const sendTransactionConfirmation = async (user, transaction) => {
  const isIncome = transaction.type === 'income';
  const html = emailShell(`
    <h2>${isIncome ? '✅ Income Recorded' : '💸 Expense Recorded'}</h2>
    <p>Hi <strong>${user.name}</strong>,</p>
    <p>A new transaction has been added to your SpendWise account.</p>
    <hr class="divider"/>
    <table>
      <tr><td class="label">Amount</td>
          <td class="amount" style="color:${isIncome ? '#10b981' : '#ef4444'}">
            ${isIncome ? '+' : '-'}₹${transaction.amount.toLocaleString()}
          </td></tr>
      <tr><td class="label">Category</td><td>${transaction.category}</td></tr>
      <tr><td class="label">Date</td><td>${new Date(transaction.date).toLocaleDateString('en-IN')}</td></tr>
      ${transaction.note ? `<tr><td class="label">Note</td><td>${transaction.note}</td></tr>` : ''}
    </table>
    <hr class="divider"/>
    <p>If this wasn't you, please review your account immediately.</p>
  `);

  return sendEmail({
    to: user.email,
    subject: `${isIncome ? '✅ Income' : '💸 Expense'} of ₹${transaction.amount.toLocaleString()} recorded in SpendWise`,
    html,
  });
};

/**
 * Send a recurring transaction auto-execution notice.
 */
const sendRecurringExecutedEmail = async (user, recurring) => {
  const html = emailShell(`
    <h2>🔄 Recurring Transaction Executed</h2>
    <p>Hi <strong>${user.name}</strong>,</p>
    <p>Your recurring <strong>${recurring.title}</strong> has been automatically recorded today.</p>
    <hr class="divider"/>
    <table>
      <tr><td class="label">Title</td><td>${recurring.title}</td></tr>
      <tr><td class="label">Amount</td><td class="amount">₹${recurring.amount.toLocaleString()}</td></tr>
      <tr><td class="label">Category</td><td>${recurring.category}</td></tr>
      <tr><td class="label">Next Due</td><td>${new Date(recurring.nextExecutionDate).toLocaleDateString('en-IN')}</td></tr>
    </table>
  `);

  return sendEmail({
    to: user.email,
    subject: `🔄 Auto-transaction: "${recurring.title}" — ₹${recurring.amount.toLocaleString()}`,
    html,
  });
};

module.exports = {
  sendEmail,
  sendBudgetExceededAlert,
  sendBudgetWarningAlert,
  sendBillReminderEmail,
  sendTransactionConfirmation,
  sendRecurringExecutedEmail,
};
