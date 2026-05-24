// pages/BudgetPage.js - Monthly budget management
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { formatCurrency, getCurrentMonth, getMonthLabel } from '../utils/format';

export default function BudgetPage() {
  const [budget, setBudget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [limit, setLimit] = useState('');
  const [month, setMonth] = useState(getCurrentMonth); // YYYY-MM

  // BUG-08 FIX: memoize fetchBudget so it can safely appear in useEffect deps
  const fetchBudget = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/budget?month=${month}`);
      setBudget(data.budget);
      if (data.budget) setLimit(data.budget.limit);
    } catch (err) {
      toast.error('Failed to load budget');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { fetchBudget(); }, [fetchBudget]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!limit || Number(limit) <= 0) return toast.error('Enter a valid budget amount');
    setSaving(true);
    try {
      await api.post('/budget', { limit: Number(limit), month });
      toast.success('Budget saved!');
      fetchBudget();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save budget');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Remove this budget?')) return;
    try {
      await api.delete(`/budget/${month}`);
      toast.success('Budget removed');
      setBudget(null);
      setLimit('');
    } catch {
      toast.error('Failed to delete budget');
    }
  };

  const statusConfig = {
    safe: { color: 'text-emerald-400', bar: 'bg-emerald-500', badge: 'bg-emerald-500/20 text-emerald-400' },
    warning: { color: 'text-amber-400', bar: 'bg-amber-500', badge: 'bg-amber-500/20 text-amber-400' },
    exceeded: { color: 'text-red-400', bar: 'bg-red-500', badge: 'bg-red-500/20 text-red-400' },
  };

  const status = budget?.status || 'safe';
  const cfg = statusConfig[status];

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-100">Budget Planner</h1>
        <p className="text-slate-400 text-sm mt-1">Set and track your monthly spending limit</p>
      </div>

      {/* Month selector */}
      <div className="card py-4">
        <label className="label">Select Month</label>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="input-field w-auto"
        />
      </div>

      {/* Budget Form */}
      <div className="card">
        <h2 className="font-semibold text-slate-200 mb-4">
          {budget ? 'Update Budget' : 'Set Budget'} for {getMonthLabel(...month.split('-').map(Number))}
        </h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label">Monthly Budget Limit (₹)</label>
            <input
              type="number"
              min="1"
              step="100"
              value={limit}
              onChange={e => setLimit(e.target.value)}
              placeholder="e.g. 50000"
              className="input-field font-mono text-lg"
              required
            />
            <p className="text-xs text-slate-500 mt-1.5">Set the maximum you plan to spend this month</p>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving...' : budget ? 'Update Budget' : 'Set Budget'}
            </button>
            {budget && (
              <button type="button" onClick={handleDelete} className="btn-danger">
                Remove
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Budget Status */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : budget ? (
        <div className="card space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-200">Budget Status</h2>
            <span className={`badge ${cfg.badge}`}>
              {status === 'exceeded' ? '🚨 Exceeded' : status === 'warning' ? '⚠️ Warning' : '✅ On Track'}
            </span>
          </div>

          {/* Big number display */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-slate-800/50 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">Budget</p>
              <p className="font-display font-bold text-lg text-slate-200">{formatCurrency(budget.limit)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">Spent</p>
              <p className={`font-display font-bold text-lg ${cfg.color}`}>{formatCurrency(budget.spent)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">Remaining</p>
              <p className={`font-display font-bold text-lg ${budget.remaining >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {budget.remaining >= 0 ? formatCurrency(budget.remaining) : `-${formatCurrency(Math.abs(budget.remaining))}`}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-2">
              <span>0%</span>
              <span className={`font-semibold ${cfg.color}`}>{budget.percentage}% used</span>
              <span>100%</span>
            </div>
            <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${cfg.bar}`}
                style={{ width: `${Math.min(budget.percentage, 100)}%` }}
              />
            </div>
          </div>

          {/* Status messages */}
          <div className={`rounded-xl p-4 border ${status === 'exceeded' ? 'bg-red-500/10 border-red-500/30' : status === 'warning' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
            {status === 'exceeded' && (
              <p className="text-sm text-red-400">You've exceeded your budget by <strong>{formatCurrency(Math.abs(budget.remaining))}</strong>. Review your spending to get back on track.</p>
            )}
            {status === 'warning' && (
              <p className="text-sm text-amber-400">You've used <strong>{budget.percentage}%</strong> of your budget. Only <strong>{formatCurrency(budget.remaining)}</strong> left — spend wisely!</p>
            )}
            {status === 'safe' && (
              <p className="text-sm text-emerald-400">Great job! You have <strong>{formatCurrency(budget.remaining)}</strong> left in your budget. Keep it up! 🎉</p>
            )}
          </div>
        </div>
      ) : (
        <div className="card text-center py-10">
          <p className="text-4xl mb-3">🎯</p>
          <p className="text-slate-300 font-medium">No budget set for this month</p>
          <p className="text-slate-500 text-sm mt-1">Set a budget above to start tracking your spending limit</p>
        </div>
      )}
    </div>
  );
}
