// pages/DashboardPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, ArcElement,
  PointElement, LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import toast from 'react-hot-toast';
import api from '../utils/api';
import {
  formatCurrency, formatDate, getCategoryColor,
  getCurrentMonthYear, getMonthLabel,
} from '../utils/format';
import { useAuth } from '../context/AuthContext';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, ArcElement,
  PointElement, LineElement, Title, Tooltip, Legend, Filler,
);

// ─── Chart theme (shared by all charts on this page) ─────────────────────────
const chartTheme = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderWidth: 1,
      titleColor: '#f1f5f9',
      bodyColor: '#94a3b8',
      padding: 12,
      cornerRadius: 10,
      callbacks: { label: (ctx) => ` ${formatCurrency(ctx.parsed.y ?? ctx.parsed)}` },
    },
  },
  scales: {
    x: { grid: { color: '#1e293b' }, ticks: { color: '#64748b' } },
    y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b', callback: (v) => `₹${(v / 1000).toFixed(0)}k` } },
  },
};

// ─── Month navigation helpers ─────────────────────────────────────────────────
const prevMonth = ({ year, month }) =>
  month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
const nextMonth = ({ year, month }) =>
  month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
const isCurrentMonth = ({ year, month }) => {
  const now = getCurrentMonthYear();
  return year === now.year && month === now.month;
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [selected,       setSelected]       = useState(getCurrentMonthYear); // { year, month }
  const [data,           setData]           = useState(null);
  const [insights,       setInsights]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [insightsLoading,setInsightsLoading]= useState(true);  // separate from main load
  const [aiSource,       setAiSource]       = useState('mock');
  const [refreshing,     setRefreshing]     = useState(false);

  // ── Fetch dashboard + analytics data (month-aware, cancellable) ────────────
  const fetchDashboard = useCallback(async (sel, signal, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else           setLoading(true);
    try {
      const dashRes = await api.get(
        `/analytics/dashboard?year=${sel.year}&month=${sel.month}`,
        { signal },
      );
      if (signal.aborted) return;
      setData(dashRes.data);
    } catch (err) {
      if (signal.aborted) return;           // cancelled — not an error
      toast.error('Failed to load dashboard data');
      console.error(err);
    } finally {
      if (!signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // ── Fetch AI insights (independent of month, cancellable) ──────────────────
  // Insights are month-agnostic on the server (always uses current month).
  // Keeping this separate means navigating months never wipes the insights card.
  const fetchInsights = useCallback(async (signal) => {
    setInsightsLoading(true);
    try {
      const aiRes = await api.get('/insights/ai', { signal });
      if (signal.aborted) return;
      setInsights(aiRes.data.insights || []);
      setAiSource(aiRes.data.source || 'gemini');
    } catch {
      if (signal.aborted) return;
      // Gemini failed — fall back to deterministic mock
      try {
        const mockRes = await api.get('/insights', { signal });
        if (signal.aborted) return;
        setInsights(mockRes.data.insights || []);
        setAiSource('mock');
      } catch {
        if (!signal.aborted) setInsights([]);
      }
    } finally {
      if (!signal.aborted) setInsightsLoading(false);
    }
  }, []);

  // Re-fetch dashboard when selected month changes.
  // Cleanup aborts any in-flight request (fixes StrictMode double-invoke race).
  useEffect(() => {
    const controller = new AbortController();
    fetchDashboard(selected, controller.signal);
    return () => controller.abort();
  }, [selected, fetchDashboard]);

  // Fetch insights once on mount (independent of month navigation).
  // Cleanup aborts any in-flight request so only the final mount wins.
  useEffect(() => {
    const controller = new AbortController();
    fetchInsights(controller.signal);
    return () => controller.abort();
  }, [fetchInsights]);

  const handleRefresh = () => {
    const controller = new AbortController();
    fetchDashboard(selected, controller.signal, true);
    // Also re-fetch insights on manual refresh
    const insCtrl = new AbortController();
    fetchInsights(insCtrl.signal);
  };

  // ── Derived chart data (all from one API response) ─────────────────────────
  const { summary, categoryBreakdown, monthlyTrend, budgetInfo, recentTransactions } = data || {};

  const barData = {
    labels: monthlyTrend?.map(m => m.month) || [],
    datasets: [
      {
        label: 'Income',
        data: monthlyTrend?.map(m => m.income) || [],
        backgroundColor: 'rgba(16,185,129,0.8)',
        borderRadius: 6,
      },
      {
        label: 'Expense',
        data: monthlyTrend?.map(m => m.expense) || [],
        backgroundColor: 'rgba(239,68,68,0.7)',
        borderRadius: 6,
      },
    ],
  };

  const doughnutData = {
    labels: categoryBreakdown?.map(c => c.category) || [],
    datasets: [{
      data: categoryBreakdown?.map(c => c.amount) || [],
      backgroundColor: categoryBreakdown?.map(c => getCategoryColor(c.category) || '#808080') || [],
      borderWidth: 0,
      hoverOffset: 6,
    }],
  };

  const lineData = {
    labels: monthlyTrend?.map(m => m.month) || [],
    datasets: [{
      label: 'Savings',
      data: monthlyTrend?.map(m => m.savings) || [],
      borderColor: '#10b981',
      backgroundColor: 'rgba(16,185,129,0.1)',
      fill: true,
      tension: 0.4,
      pointBackgroundColor: '#10b981',
      pointRadius: 4,
    }],
  };

  const insightStyle = {
    success:     'border-emerald-500/30 bg-emerald-500/5',
    warning:     'border-amber-500/30 bg-amber-500/5',
    danger:      'border-red-500/30 bg-red-500/5',
    info:        'border-blue-500/30 bg-blue-500/5',
    tip:         'border-violet-500/30 bg-violet-500/5',
    saving_hack: 'border-teal-500/30 bg-teal-500/5',
  };

  const greeting = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening';

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header row ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-100">
            Good {greeting}, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Showing data for <span className="text-emerald-400 font-medium">{getMonthLabel(selected.year, selected.month)}</span>
          </p>
        </div>

        {/* Month navigator + refresh */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-800 rounded-xl p-1">
            <button
              onClick={() => setSelected(s => prevMonth(s))}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors text-sm"
              title="Previous month"
            >←</button>
            <span className="text-slate-200 text-sm font-medium px-2 min-w-[110px] text-center">
              {getMonthLabel(selected.year, selected.month)}
            </span>
            <button
              onClick={() => setSelected(s => nextMonth(s))}
              disabled={isCurrentMonth(selected)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors text-sm disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next month"
            >→</button>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-colors"
            title="Refresh data"
          >
            <span className={refreshing ? 'animate-spin inline-block' : ''}>↻</span>
          </button>
          <Link to="/transactions" className="btn-primary text-sm hidden sm:block">+ Add Transaction</Link>
        </div>
      </div>

      {/* ── Budget alerts ──────────────────────────────────────────────────── */}
      {budgetInfo?.exceeded && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-2xl">🚨</span>
          <div>
            <p className="font-semibold text-red-400">Budget Exceeded!</p>
            <p className="text-sm text-slate-400">
              You've overspent by {formatCurrency(Math.abs(budgetInfo.remaining))} this month.
            </p>
          </div>
        </div>
      )}
      {budgetInfo && !budgetInfo.exceeded && budgetInfo.percentage >= 80 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-semibold text-amber-400">Budget Warning — {budgetInfo.percentage}% used</p>
            <p className="text-sm text-slate-400">
              Only {formatCurrency(budgetInfo.remaining)} remaining this month.
            </p>
          </div>
        </div>
      )}

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Income',  value: summary?.totalIncome,      color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: '↑' },
          { label: 'Total Expense', value: summary?.totalExpense,     color: 'text-red-400',     bg: 'bg-red-500/10',     icon: '↓' },
          { label: 'Net Savings',   value: summary?.savings,          color: (summary?.savings ?? 0) >= 0 ? 'text-blue-400' : 'text-red-400', bg: 'bg-blue-500/10', icon: '◈' },
          { label: 'Transactions',  value: summary?.transactionCount, color: 'text-violet-400',  bg: 'bg-violet-500/10',  icon: '#', isCount: true },
        ].map(({ label, value, color, bg, icon, isCount }) => (
          <div key={label} className="stat-card">
            <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center ${color} font-bold mb-3`}>
              {icon}
            </div>
            <p className="text-slate-400 text-xs mb-1">{label}</p>
            <p className={`font-display font-bold text-xl count-up ${color}`}>
              {isCount ? (value ?? 0) : formatCurrency(value ?? 0)}
            </p>
          </div>
        ))}
      </div>

      {/* ── Budget progress bar ────────────────────────────────────────────── */}
      {budgetInfo && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold text-slate-200">Monthly Budget</p>
              <p className="text-sm text-slate-400">
                {formatCurrency(budgetInfo.spent)} of {formatCurrency(budgetInfo.limit)} used
              </p>
            </div>
            <span className={`badge ${
              budgetInfo.exceeded        ? 'bg-red-500/20 text-red-400'
              : budgetInfo.percentage >= 80 ? 'bg-amber-500/20 text-amber-400'
              : 'bg-emerald-500/20 text-emerald-400'
            }`}>{budgetInfo.percentage}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                budgetInfo.exceeded        ? 'bg-red-500'
                : budgetInfo.percentage >= 80 ? 'bg-amber-500'
                : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(budgetInfo.percentage, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* ── AI Insights (full width, above charts) ──────────────────────── */}
      <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <p className="font-semibold text-slate-200">AI Insights</p>
            {insightsLoading ? (
              <span className="badge bg-slate-700 text-slate-400 flex items-center gap-1">
                <span className="w-2.5 h-2.5 border border-slate-400 border-t-transparent rounded-full animate-spin inline-block" />
                Analysing…
              </span>
            ) : aiSource === 'gemini' ? (
              <span className="badge bg-violet-500/20 text-violet-400">✦ Gemini AI</span>
            ) : (
              <span className="badge bg-slate-700 text-slate-400">✦ Smart</span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insightsLoading ? (
              // Skeleton placeholders while Gemini is thinking
              [1, 2, 3, 4].map((k) => (
                <div key={k} className="rounded-xl p-3 border border-slate-700 bg-slate-800/40 animate-pulse">
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-700 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-slate-700 rounded w-2/5" />
                      <div className="h-2 bg-slate-700 rounded w-full" />
                      <div className="h-2 bg-slate-700 rounded w-3/4" />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <>
                {insights.slice(0, 8).map((ins, i) => (
                  <div key={i} className={`rounded-xl p-3 border ${insightStyle[ins.type] || insightStyle.info}`}>
                    <div className="flex items-start gap-2">
                      <span className="text-lg flex-shrink-0">{ins.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-200">{ins.title}</p>
                          {ins.type === 'saving_hack' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-500/20 text-teal-400 font-semibold whitespace-nowrap">💡 Money Hack</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{ins.message}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {insights.length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-4 col-span-2">
                    No insights yet — add some transactions first
                  </p>
                )}
              </>
            )}
          </div>
        </div>

      {/* ── Charts row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar: income vs expense */}
        <div className="card lg:col-span-2">
          <p className="font-semibold text-slate-200 mb-1">Income vs Expense</p>
          <p className="text-xs text-slate-500 mb-4">Last 6 months</p>
          <div className="h-56">
            <Bar
              data={barData}
              options={{
                ...chartTheme,
                plugins: {
                  ...chartTheme.plugins,
                  legend: { display: true, labels: { color: '#94a3b8', boxWidth: 12, borderRadius: 3 } },
                },
              }}
            />
          </div>
        </div>

        {/* Doughnut: category breakdown */}
        <div className="card">
          <p className="font-semibold text-slate-200 mb-1">Expense by Category</p>
          <p className="text-xs text-slate-500 mb-4">{getMonthLabel(selected.year, selected.month)}</p>
          {(categoryBreakdown?.length ?? 0) > 0 ? (
            <>
              <div className="h-40">
                <Doughnut
                  data={doughnutData}
                  options={{ ...chartTheme, cutout: '70%', scales: undefined }}
                />
              </div>
              <div className="mt-4 space-y-2">
                {categoryBreakdown.slice(0, 5).map(({ category, amount }) => (
                  <div key={category} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getCategoryColor(category) }} />
                      <span className="text-slate-400">{category}</span>
                    </div>
                    <span className="text-slate-200 font-medium font-mono text-xs">{formatCurrency(amount)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
              No expense data this month
            </div>
          )}
        </div>
      </div>

      {/* ── Savings trend ──────────────────────────────────────────────────── */}
      <div className="card">
        <p className="font-semibold text-slate-200 mb-1">Savings Trend</p>
        <p className="text-xs text-slate-500 mb-4">Last 6 months</p>
        <div className="h-48">
          <Line data={lineData} options={chartTheme} />
        </div>
      </div>

      {/* ── Recent transactions ────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-slate-200">Recent Transactions</p>
          <Link to="/transactions" className="text-sm text-emerald-400 hover:text-emerald-300">
            View all →
          </Link>
        </div>
        <div className="space-y-2">
          {(recentTransactions?.length ?? 0) > 0 ? (
            recentTransactions.map((t) => (
              <div
                key={t._id}
                className="flex items-center justify-between py-2.5 border-b border-slate-800 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-semibold"
                    style={{ backgroundColor: getCategoryColor(t.category) + '20', color: getCategoryColor(t.category) }}
                  >
                    {t.category.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-200">{t.category}</p>
                    <p className="text-xs text-slate-500">{formatDate(t.date)}{t.note ? ` · ${t.note}` : ''}</p>
                  </div>
                </div>
                <span className={`font-mono font-semibold text-sm ${t.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                </span>
              </div>
            ))
          ) : (
            <p className="text-center text-slate-500 text-sm py-4">No transactions yet</p>
          )}
        </div>
      </div>

    </div>
  );
}
