// pages/TransactionsPage.js
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import {
  formatCurrency, formatDate, toInputDate,
  getCategoryColor, EXPENSE_CATEGORIES, INCOME_CATEGORIES,
  getCurrentMonthYear, getMonthLabel,
} from '../utils/format';

// ─── Month navigation helpers (same as DashboardPage) ────────────────────────
const prevMonth = ({ year, month }) =>
  month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
const nextMonth = ({ year, month }) =>
  month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
const isCurrentMonth = ({ year, month }) => {
  const now = getCurrentMonthYear();
  return year === now.year && month === now.month;
};

// Build UTC start/end for a calendar month (mirrors backend monthRange)
const monthRange = (year, month) => {
  const y = Number(year), m = Number(month);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end   = new Date(Date.UTC(y, m,     1));   // exclusive — same as backend
  return { start, end };
};

const emptyForm = {
  amount:   '',
  type:     'expense',
  category: 'Food',
  date:     new Date().toISOString().split('T')[0],
  note:     '',
};

export default function TransactionsPage() {
  const [selected, setSelected]  = useState(getCurrentMonthYear); // { year, month }
  const [transactions, setTxns]  = useState([]);
  const [loading,   setLoading]  = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form,      setForm]     = useState(emptyForm);
  const [saving,    setSaving]   = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [page,      setPage]     = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // ── Fetch: month + optional type filter ────────────────────────────────────
  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = monthRange(selected.year, selected.month);
      const params = new URLSearchParams({
        page,
        limit: 20,
        startDate: start.toISOString(),
        endDate:   end.toISOString(),
      });
      if (typeFilter) params.append('type', typeFilter);

      const { data } = await api.get(`/transactions?${params}`);
      setTxns(data.transactions);
      setTotalPages(data.pagination.pages);
      setTotalCount(data.pagination.total);
    } catch (err) {
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, [selected, page, typeFilter]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  // Reset to page 1 when month or filter changes
  const changeMonth = (fn) => { setSelected(fn); setPage(1); };
  const changeType  = (v)  => { setTypeFilter(v);  setPage(1); };

  // ── Type toggle resets category ────────────────────────────────────────────
  const handleTypeChange = (type) => {
    const cats = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    setForm(f => ({ ...f, type, category: cats[0] }));
  };

  // ── Modal open/close ───────────────────────────────────────────────────────
  const openAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (t) => {
    setForm({
      amount:   t.amount,
      type:     t.type,
      category: t.category,
      date:     toInputDate(t.date),
      note:     t.note || '',
    });
    setEditingId(t._id);
    setShowModal(true);
  };

  const closeModal = () => setShowModal(false);

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/transactions/${editingId}`, form);
        toast.success('Transaction updated');
      } else {
        await api.post('/transactions', form);
        toast.success('Transaction added');
      }
      closeModal();
      fetchTransactions();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this transaction?')) return;
    try {
      await api.delete(`/transactions/${id}`);
      toast.success('Transaction deleted');
      fetchTransactions();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const categories = form.type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-100">Transactions</h1>
          <p className="text-slate-400 text-sm mt-1">
            {getMonthLabel(selected.year, selected.month)}
            {totalCount > 0 && <span className="ml-2 text-slate-500">· {totalCount} entries</span>}
          </p>
        </div>

        {/* Month navigator */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-800 rounded-xl p-1">
            <button
              onClick={() => changeMonth(prevMonth)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors text-sm"
            >←</button>
            <span className="text-slate-200 text-sm font-medium px-2 min-w-[110px] text-center">
              {getMonthLabel(selected.year, selected.month)}
            </span>
            <button
              onClick={() => changeMonth(nextMonth)}
              disabled={isCurrentMonth(selected)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors text-sm disabled:opacity-30 disabled:cursor-not-allowed"
            >→</button>
          </div>
          <button onClick={openAdd} className="btn-primary text-sm">+ Add New</button>
        </div>
      </div>

      {/* ── Type filter ────────────────────────────────────────────────────── */}
      <div className="card py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 mr-1">Filter:</span>
          {['', 'income', 'expense'].map(v => (
            <button
              key={v || 'all'}
              onClick={() => changeType(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                typeFilter === v
                  ? v === 'income'  ? 'bg-emerald-500/20 text-emerald-400'
                    : v === 'expense' ? 'bg-red-500/20 text-red-400'
                    : 'bg-slate-700 text-slate-200'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
              }`}
            >
              {v === '' ? 'All' : v === 'income' ? '↑ Income' : '↓ Expense'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Transaction list ────────────────────────────────────────────────── */}
      <div className="card">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-slate-400">No transactions in {getMonthLabel(selected.year, selected.month)}</p>
            <button onClick={openAdd} className="btn-primary text-sm mt-4">Add one now</button>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              {transactions.map((t) => (
                <div
                  key={t._id}
                  className="flex items-center justify-between py-3 px-2 rounded-xl hover:bg-slate-800/50 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold flex-shrink-0"
                      style={{ backgroundColor: getCategoryColor(t.category) + '20', color: getCategoryColor(t.category) }}
                    >
                      {t.category.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-200">{t.category}</p>
                      <p className="text-xs text-slate-500">{formatDate(t.date)}{t.note ? ` · ${t.note}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-mono font-semibold text-sm ${t.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                    </span>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors text-xs">✏</button>
                      <button onClick={() => handleDelete(t._id)} className="p-1.5 hover:bg-red-500/20 rounded-lg text-slate-400 hover:text-red-400 transition-colors text-xs">✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-slate-800">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm py-1.5 px-3 disabled:opacity-40">← Prev</button>
                <span className="text-slate-400 text-sm">Page {page} of {totalPages}</span>
                <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm py-1.5 px-3 disabled:opacity-40">Next →</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Add / Edit Modal ────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="card w-full max-w-md animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display font-bold text-lg text-slate-100">
                {editingId ? 'Edit Transaction' : 'Add Transaction'}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-200 p-1">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type toggle */}
              <div className="flex bg-slate-800 rounded-xl p-1">
                {['expense', 'income'].map(t => (
                  <button
                    key={t} type="button" onClick={() => handleTypeChange(t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                      form.type === t
                        ? t === 'expense' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t === 'expense' ? '↓ Expense' : '↑ Income'}
                  </button>
                ))}
              </div>

              <div>
                <label className="label">Amount (₹)</label>
                <input
                  type="number" step="0.01" min="0.01"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  className="input-field font-mono"
                  required
                />
              </div>

              <div>
                <label className="label">Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="input-field"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="label">Note <span className="text-slate-600">(optional)</span></label>
                <input
                  type="text"
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="e.g. Grocery shopping"
                  className="input-field"
                  maxLength={200}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Add Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
