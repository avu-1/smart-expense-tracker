// pages/RecurringPage.js — Manage recurring income & expense schedules
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { formatCurrency, formatDate, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../utils/format';

const CYCLE_LABELS = { monthly: 'Monthly', weekly: 'Weekly', customDays: 'Custom Days' };

const emptyForm = {
  title: '',
  amount: '',
  type: 'expense',
  category: 'Food',
  startDate: new Date().toISOString().split('T')[0],
  cycle: 'monthly',
  interval: 1,
  note: '',
  endDate: '',  // optional — leave blank for indefinite
};

export default function RecurringPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchRecurring = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/recurring');
      setItems(data.recurringTransactions || []);
    } catch {
      toast.error('Failed to load recurring transactions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecurring(); }, [fetchRecurring]);

  const handleTypeChange = (type) => {
    const cats = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    setForm(f => ({ ...f, type, category: cats[0] }));
  };

  const openAdd = () => { setForm(emptyForm); setEditingId(null); setShowModal(true); };
  const openEdit = (item) => {
    setForm({
      title: item.title,
      amount: item.amount,
      type: item.type,
      category: item.category,
      startDate: new Date(item.startDate).toISOString().split('T')[0],
      cycle: item.cycle,
      interval: item.interval,
      note: item.note || '',
      endDate: item.endDate ? new Date(item.endDate).toISOString().split('T')[0] : '',
    });
    setEditingId(item._id);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/recurring/${editingId}`, form);
        toast.success('Updated successfully');
      } else {
        const { data } = await api.post('/recurring', form);
        toast.success(data.executedNow
          ? `"${form.title}" created — first entry recorded immediately! ✔`
          : `"${form.title}" created — will run on the start date`);
      }
      setShowModal(false);
      fetchRecurring();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Delete "${title}"?`)) return;
    try {
      await api.delete(`/recurring/${id}`);
      toast.success('Deleted');
      fetchRecurring();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleToggle = async (id, isActive) => {
    try {
      await api.post(`/recurring/${id}/toggle`);
      toast.success(isActive ? 'Paused' : 'Resumed');
      fetchRecurring();
    } catch {
      toast.error('Failed to toggle');
    }
  };

  const handleExecuteNow = async (id, title) => {
    try {
      const { data } = await api.post(`/recurring/${id}/execute-now`);
      toast.success(data.message || `"${title}" recorded!`);
      fetchRecurring();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to execute');
    }
  };

  const categories = form.type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const cycleLabel = (item) => {
    if (item.interval === 1) return CYCLE_LABELS[item.cycle];
    const unit = item.cycle === 'monthly' ? 'months' : item.cycle === 'weekly' ? 'weeks' : 'days';
    return `Every ${item.interval} ${unit}`;
  };

  // Monthly cost estimate per schedule type.
  // All amounts cast to Number() first — API JSON can return numeric strings.
  // monthly:    amount / interval          (e.g. every 3 months → amount÷3 per month)
  // weekly:     amount × (4.345 / interval) (avg weeks in a month / how many weeks between runs)
  // customDays: amount × (30.44 / interval) (avg days in a month / days between runs)
  const toMonthly = (i) => {
    const amt = Number(i.amount);
    if (i.cycle === 'monthly')    return amt / Number(i.interval);
    if (i.cycle === 'weekly')     return amt * (4.345 / Number(i.interval));
    /* customDays */              return amt * (30.44 / Number(i.interval));
  };

  const monthlyCommitment = items
    .filter(i => i.isActive && i.type === 'expense')
    .reduce((s, i) => s + toMonthly(i), 0);

  const monthlyIncome = items
    .filter(i => i.isActive && i.type === 'income')
    .reduce((s, i) => s + toMonthly(i), 0);

  const monthlyNet = monthlyIncome - monthlyCommitment;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-100">Recurring</h1>
          <p className="text-slate-400 text-sm mt-1">Automate bills, EMIs, salaries and subscriptions</p>
        </div>
        <button onClick={openAdd} className="btn-primary text-sm">+ New Recurring</button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card text-center" title="Amortized across all active expense schedules">
          <p className="text-xs text-slate-400 mb-1">Avg. Monthly Expenses</p>
          <p className="font-display font-bold text-xl text-red-400">{formatCurrency(Math.round(monthlyCommitment))}</p>
          <p className="text-xs text-slate-500 mt-1">amortized estimate</p>
        </div>
        <div className="card text-center" title="Amortized across all active income schedules">
          <p className="text-xs text-slate-400 mb-1">Avg. Monthly Income</p>
          <p className="font-display font-bold text-xl text-emerald-400">{formatCurrency(Math.round(monthlyIncome))}</p>
          <p className="text-xs text-slate-500 mt-1">amortized estimate</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-slate-400 mb-1">Monthly Net</p>
          <p className={`font-display font-bold text-xl ${monthlyNet >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
            {monthlyNet >= 0 ? '+' : '-'}{formatCurrency(Math.abs(Math.round(monthlyNet)))}
          </p>
          <p className="text-xs text-slate-500 mt-1">income minus expenses</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-slate-400 mb-1">Active Schedules</p>
          <p className="font-display font-bold text-xl text-violet-400">{items.filter(i => i.isActive).length}</p>
          <p className="text-xs text-slate-500 mt-1">of {items.length} total</p>
        </div>
      </div>

      {/* List */}
      <div className="card">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">🔄</p>
            <p className="text-slate-300 font-medium">No recurring transactions yet</p>
            <p className="text-slate-500 text-sm mt-1 mb-4">Set up your salary, rent, subscriptions and bills</p>
            <button onClick={openAdd} className="btn-primary text-sm">Create first schedule</button>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item._id}
                className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                  item.isActive
                    ? 'bg-slate-800/30 border-slate-700/50'
                    : 'bg-slate-900/30 border-slate-800/30 opacity-60'
                }`}>
                <div className="flex items-center gap-3 min-w-0">
                  {/* Type indicator */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    item.type === 'income' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {item.type === 'income' ? '↑' : '↓'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-200 text-sm">{item.title}</p>
                      {!item.isActive && item.endDate && new Date() > new Date(item.endDate) ? (
                        <span className="badge bg-emerald-500/15 text-emerald-500 text-xs">✓ Ended</span>
                      ) : !item.isActive ? (
                        <span className="badge bg-slate-700 text-slate-400 text-xs">Paused</span>
                      ) : null}
                      <span className="badge bg-slate-800 text-slate-400 text-xs">{item.category}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {/* Frequency label — shows exact cadence so user can quickly verify their setup */}
                      <p className="text-xs text-slate-500">{cycleLabel(item)}</p>
                      <span className="text-slate-700">·</span>
                      {/* Monthly equivalent — so user immediately sees the avg monthly cost */}
                      <p className={`text-xs font-medium ${item.type === 'expense' ? 'text-red-400/70' : 'text-emerald-400/70'}`}>
                        ~{formatCurrency(Math.round(toMonthly(item)))}/mo
                      </p>
                      <span className="text-slate-700">·</span>
                      <p className="text-xs text-slate-500">Next: {formatDate(item.nextExecutionDate)}</p>
                      {item.endDate && (
                        <>
                          <span className="text-slate-700">·</span>
                          <p className="text-xs text-amber-500/80">Ends: {formatDate(item.endDate)}</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`font-mono font-semibold text-sm ${
                    item.type === 'income' ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {item.type === 'income' ? '+' : '-'}{formatCurrency(item.amount)}
                  </span>

                  <div className="flex items-center gap-1">
                    {/* Run Now button — only shown when active */}
                    {item.isActive && (
                      <button
                        onClick={() => handleExecuteNow(item._id, item.title)}
                        title="Record this transaction right now"
                        className="p-1.5 hover:bg-emerald-500/20 rounded-lg text-slate-400 hover:text-emerald-400 transition-colors text-xs"
                      >
                        ⚡
                      </button>
                    )}
                    {/* Pause/Resume toggle */}
                    <button
                      onClick={() => handleToggle(item._id, item.isActive)}
                      title={item.isActive ? 'Pause' : 'Resume'}
                      className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-amber-400 transition-colors text-xs"
                    >
                      {item.isActive ? '⏸' : '▶'}
                    </button>
                    <button
                      onClick={() => openEdit(item)}
                      className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors text-xs"
                    >
                      ✏
                    </button>
                    <button
                      onClick={() => handleDelete(item._id, item.title)}
                      className="p-1.5 hover:bg-red-500/20 rounded-lg text-slate-400 hover:text-red-400 transition-colors text-xs"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4">
        <p className="text-sm font-medium text-blue-400 mb-1">🤖 How automation works</p>
        <p className="text-xs text-slate-400 leading-relaxed">
          SpendWise checks your recurring schedules every day at midnight. When a transaction is due,
          it's automatically added to your transaction history and your analytics are updated.
          You'll also receive email reminders 1–2 days before bills are due.
        </p>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setShowModal(false)}>
          <div className="card w-full max-w-md animate-slide-up max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display font-bold text-lg text-slate-100">
                {editingId ? 'Edit Recurring' : 'New Recurring Transaction'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type toggle */}
              <div className="flex bg-slate-800 rounded-xl p-1">
                {['expense', 'income'].map(t => (
                  <button key={t} type="button" onClick={() => handleTypeChange(t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                      form.type === t
                        ? t === 'expense' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}>
                    {t === 'expense' ? '↓ Expense' : '↑ Income'}
                  </button>
                ))}
              </div>

              <div>
                <label className="label">Title</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Netflix, Home Rent, Salary" className="input-field" required maxLength={100} />
              </div>

              <div>
                <label className="label">Amount (₹)</label>
                <input type="number" step="0.01" min="0.01" value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00" className="input-field font-mono" required />
              </div>

              <div>
                <label className="label">Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="input-field">
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Start Date + End Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start Date</label>
                  <input type="date" value={form.startDate}
                    onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className="input-field" required />
                </div>
                <div>
                  <label className="label">
                    End Date <span className="text-slate-600">(optional)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={form.endDate}
                      min={form.startDate || undefined}
                      onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                      className="input-field pr-8"
                    />
                    {form.endDate && (
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, endDate: '' }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                        title="Clear end date"
                      >✕</button>
                    )}
                  </div>
                </div>
              </div>

              {/* Cycle + Interval — with live frequency preview so users can't misread 'interval' */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Repeats</label>
                  <select value={form.cycle} onChange={e => setForm(f => ({ ...f, cycle: e.target.value }))}
                    className="input-field">
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="customDays">Custom Days</option>
                  </select>
                </div>
                <div>
                  <label className="label">
                    {/* Concrete label: shows exactly what the number means */}
                    Fires every
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min="1" value={form.interval}
                      onChange={e => setForm(f => ({ ...f, interval: parseInt(e.target.value) || 1 }))}
                      className="input-field w-20 text-center"
                    />
                    <span className="text-slate-400 text-sm whitespace-nowrap">
                      {form.cycle === 'monthly' ? 'month(s)' : form.cycle === 'weekly' ? 'week(s)' : 'day(s)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Preview — shows frequency + monthly equivalent so user can't misread the numbers */}
              <div className="bg-slate-800/50 rounded-xl p-3 text-xs space-y-1.5">
                {/* Frequency summary */}
                <p className="text-slate-300 font-medium">
                  📅 Fires every{' '}
                  <span className="text-emerald-400 font-bold">
                    {Number(form.interval) === 1
                      ? (form.cycle === 'monthly' ? '1 month' : form.cycle === 'weekly' ? '1 week' : '1 day')
                      : `${form.interval} ${form.cycle === 'monthly' ? 'months' : form.cycle === 'weekly' ? 'weeks' : 'days'}`
                    }
                  </span>
                  {' '}— records{' '}
                  <span className="font-bold">{formatCurrency(form.amount || 0)}</span>{' '}as {form.type} each time
                </p>
                {/* Monthly equivalent — the key number users need to understand the impact */}
                {(() => {
                  const amt = Number(form.amount) || 0;
                  const iv  = Number(form.interval) || 1;
                  let monthly = 0;
                  if (form.cycle === 'monthly')    monthly = amt / iv;
                  else if (form.cycle === 'weekly') monthly = amt * (4.345 / iv);
                  else                              monthly = amt * (30.44 / iv);
                  return (
                    <p className={`font-semibold ${form.type === 'expense' ? 'text-red-400' : 'text-emerald-400'}`}>
                      💡 Avg monthly impact: <span className="text-base">{formatCurrency(Math.round(monthly))}/month</span>
                      {iv > 1 && form.cycle === 'monthly' && (
                        <span className="text-slate-500 font-normal ml-1">
                          ({formatCurrency(amt)} ÷ {iv} months)
                        </span>
                      )}
                    </p>
                  );
                })()}
                {form.endDate && form.startDate && (() => {
                  // Parse as local midnight so month arithmetic is correct in IST
                  const parseLocal = (s) => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
                  const start = parseLocal(form.startDate);
                  const end   = parseLocal(form.endDate);
                  if (end <= start) return <p className="text-red-400">⚠ End date must be after start date</p>;
                  let count = 0;
                  const iv = Number(form.interval) || 1;
                  if (form.cycle === 'monthly') {
                    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
                    count = Math.floor(months / iv);
                  } else if (form.cycle === 'weekly') {
                    const weeks = Math.floor((end - start) / (7 * 24 * 60 * 60 * 1000));
                    count = Math.floor(weeks / iv);
                  } else {
                    const days = Math.floor((end - start) / (24 * 60 * 60 * 1000));
                    count = Math.floor(days / iv);
                  }
                  return (
                    <p className="text-emerald-400/80">
                      ✓ Will run approx. <strong>{count}</strong> time{count !== 1 ? 's' : ''} — total {formatCurrency(Number(form.amount || 0) * count)}
                    </p>
                  );
                })()}
              </div>

              <div>
                <label className="label">Note <span className="text-slate-600">(optional)</span></label>
                <input type="text" value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Optional note on each generated transaction"
                  className="input-field" maxLength={200} />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Create Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
