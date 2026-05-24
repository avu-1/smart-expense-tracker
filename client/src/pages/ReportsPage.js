// pages/ReportsPage.js - Yearly analytics and detailed charts
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { formatCurrency } from '../utils/format';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#94a3b8', boxWidth: 12 } },
    tooltip: {
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderWidth: 1,
      titleColor: '#f1f5f9',
      bodyColor: '#94a3b8',
      padding: 12,
      cornerRadius: 10,
      callbacks: { label: (ctx) => ` ${formatCurrency(ctx.parsed.y)}` },
    },
  },
  scales: {
    x: { grid: { color: '#1e293b' }, ticks: { color: '#64748b' } },
    y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b', callback: (v) => `₹${(v / 1000).toFixed(0)}k` } },
  },
};

// Build year options: current year back to 5 years ago
const currentYear = new Date().getUTCFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => currentYear - i);

export default function ReportsPage() {
  const [yearData, setYearData] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [year,     setYear]     = useState(currentYear);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/analytics/yearly?year=${year}`);
      setYearData(data.data || []);
    } catch (err) {
      toast.error('Failed to load yearly report');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Memoize all aggregations so they don't recompute on unrelated renders
  const { totalIncome, totalExpense, totalSavings, savingsRate } = useMemo(() => {
    const inc  = yearData.reduce((s, m) => s + m.income,  0);
    const exp  = yearData.reduce((s, m) => s + m.expense, 0);
    const sav  = inc - exp;
    const rate = inc > 0 ? ((sav / inc) * 100).toFixed(1) : '0.0';
    return { totalIncome: inc, totalExpense: exp, totalSavings: sav, savingsRate: rate };
  }, [yearData]);

  const barData = useMemo(() => ({
    labels: yearData.map(m => m.month),
    datasets: [
      { label: 'Income',  data: yearData.map(m => m.income),  backgroundColor: 'rgba(16,185,129,0.8)', borderRadius: 5 },
      { label: 'Expense', data: yearData.map(m => m.expense), backgroundColor: 'rgba(239,68,68,0.7)',  borderRadius: 5 },
    ],
  }), [yearData]);

  const lineData = useMemo(() => ({
    labels: yearData.map(m => m.month),
    datasets: [{
      label: 'Savings',
      data: yearData.map(m => m.savings),
      borderColor: '#6366f1',
      backgroundColor: 'rgba(99,102,241,0.1)',
      fill: true,
      tension: 0.4,
      pointBackgroundColor: '#6366f1',
      pointRadius: 4,
    }],
  }), [yearData]);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-100">Reports</h1>
          <p className="text-slate-400 text-sm mt-1">Yearly financial analysis</p>
        </div>

        {/* Year selector — ← → navigator matching Dashboard style */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-800 rounded-xl p-1">
            <button
              onClick={() => setYear(y => y - 1)}
              disabled={year <= YEAR_OPTIONS[YEAR_OPTIONS.length - 1]}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors text-sm disabled:opacity-30 disabled:cursor-not-allowed"
            >←</button>
            <span className="text-slate-200 text-sm font-medium px-3 min-w-[60px] text-center">{year}</span>
            <button
              onClick={() => setYear(y => y + 1)}
              disabled={year >= currentYear}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors text-sm disabled:opacity-30 disabled:cursor-not-allowed"
            >→</button>
          </div>
          <button
            onClick={fetchData}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-colors"
            title="Refresh"
          >↻</button>
        </div>
      </div>

      {/* ── Yearly summary cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Annual Income',   value: formatCurrency(totalIncome),   color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Annual Expenses', value: formatCurrency(totalExpense),   color: 'text-red-400',     bg: 'bg-red-500/10'     },
          { label: 'Net Savings',     value: formatCurrency(totalSavings),   color: totalSavings >= 0 ? 'text-blue-400' : 'text-red-400', bg: 'bg-blue-500/10' },
          { label: 'Savings Rate',    value: `${savingsRate}%`,              color: 'text-violet-400',  bg: 'bg-violet-500/10'  },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="card text-center">
            <p className="text-xs text-slate-400 mb-2">{label}</p>
            <p className={`font-display font-bold text-xl ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : yearData.every(m => m.income === 0 && m.expense === 0) ? (
        <div className="card text-center py-16">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-slate-300 font-medium">No data for {year}</p>
          <p className="text-slate-500 text-sm mt-1">Add some transactions to see your yearly report</p>
        </div>
      ) : (
        <>
          {/* Bar chart */}
          <div className="card">
            <p className="font-semibold text-slate-200 mb-1">Monthly Income vs Expense — {year}</p>
            <p className="text-xs text-slate-500 mb-4">Full year comparison</p>
            <div className="h-72">
              <Bar data={barData} options={chartOptions} />
            </div>
          </div>

          {/* Line chart */}
          <div className="card">
            <p className="font-semibold text-slate-200 mb-1">Monthly Savings Trend — {year}</p>
            <p className="text-xs text-slate-500 mb-4">Positive = saving, Negative = overspending</p>
            <div className="h-64">
              <Line data={lineData} options={chartOptions} />
            </div>
          </div>

          {/* Monthly breakdown table */}
          <div className="card overflow-x-auto">
            <p className="font-semibold text-slate-200 mb-4">Monthly Breakdown</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="text-left py-2 font-medium">Month</th>
                  <th className="text-right py-2 font-medium">Income</th>
                  <th className="text-right py-2 font-medium">Expense</th>
                  <th className="text-right py-2 font-medium">Savings</th>
                </tr>
              </thead>
              <tbody>
                {yearData.map((m) => (
                  <tr key={m.month} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 text-slate-300 font-medium">{m.month}</td>
                    <td className="py-2.5 text-right text-emerald-400 font-mono">{formatCurrency(m.income)}</td>
                    <td className="py-2.5 text-right text-red-400 font-mono">{formatCurrency(m.expense)}</td>
                    <td className={`py-2.5 text-right font-mono font-semibold ${m.savings >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                      {m.savings >= 0 ? '+' : ''}{formatCurrency(m.savings)}
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="border-t-2 border-slate-700 font-semibold">
                  <td className="py-3 text-slate-200">Total</td>
                  <td className="py-3 text-right text-emerald-400 font-mono">{formatCurrency(totalIncome)}</td>
                  <td className="py-3 text-right text-red-400 font-mono">{formatCurrency(totalExpense)}</td>
                  <td className={`py-3 text-right font-mono ${totalSavings >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                    {totalSavings >= 0 ? '+' : ''}{formatCurrency(totalSavings)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
