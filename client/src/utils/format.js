// utils/format.js - Number, date, and category helpers shared by all pages

// ─── Currency ────────────────────────────────────────────────────────────────
export const formatCurrency = (amount, currency = '₹') => {
  if (amount === null || amount === undefined) return `${currency}0`;
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return amount < 0 ? `-${currency}${formatted}` : `${currency}${formatted}`;
};

// ─── Dates ───────────────────────────────────────────────────────────────────

// Human-readable date: "22 May 2026"
export const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
};

// Format for input[type="date"] — reads the UTC date parts so the value
// shown in the input matches what was stored (avoids day-shift on IST).
export const toInputDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Current month as { year, month } (1-based), using UTC clock
export const getCurrentMonthYear = () => {
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
};

// Current month in YYYY-MM string format (used by BudgetPage)
export const getCurrentMonth = () => {
  const { year, month } = getCurrentMonthYear();
  return `${year}-${String(month).padStart(2, '0')}`;
};

// Human-readable month label: getMonthLabel(2026, 5) → "May 2026"
export const getMonthLabel = (year, month) =>
  new Date(Date.UTC(Number(year), Number(month) - 1, 1))
    .toLocaleString('default', { month: 'long', year: 'numeric' });

// ─── Categories ──────────────────────────────────────────────────────────────
export const CATEGORY_COLORS = {
  Food:          '#10b981',
  Transport:     '#3b82f6',
  Shopping:      '#f59e0b',
  Entertainment: '#8b5cf6',
  Health:        '#ef4444',
  Utilities:     '#06b6d4',
  Education:     '#f97316',
  Salary:        '#10b981',
  Freelance:     '#22d3ee',
  Investment:    '#6366f1',
  Business:      '#84cc16',
  Gift:          '#ec4899',
  Other:         '#64748b',
};

export const getCategoryColor = (category) =>
  CATEGORY_COLORS[category] || '#64748b';

export const EXPENSE_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Health', 'Utilities', 'Education', 'Other'];
export const INCOME_CATEGORIES  = ['Salary', 'Freelance', 'Investment', 'Business', 'Gift', 'Other'];

