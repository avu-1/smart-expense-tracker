// components/Layout.js - Main app shell with sidebar navigation
import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '⬡' },
  { to: '/transactions', label: 'Transactions', icon: '↕' },
  { to: '/reports', label: 'Reports', icon: '◈' },
  { to: '/budget', label: 'Budget', icon: '◎' },
  { to: '/recurring', label: 'Recurring', icon: '↺' },
];

// Extracted to module level to prevent remounting on every parent render
const SidebarContent = ({ user, onNavClick, onLogout }) => (
  <div className="flex flex-col h-full">
    {/* Logo */}
    <div className="px-6 py-6 border-b border-slate-800">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center text-slate-950 font-bold text-lg">
          ₹
        </div>
        <div>
          <p className="font-display font-bold text-slate-100 leading-none">SpendWise</p>
          <p className="text-xs text-slate-500 mt-0.5">Smart Tracker</p>
        </div>
      </div>
    </div>

    {/* Navigation */}
    <nav className="flex-1 px-3 py-4 space-y-1">
      <p className="text-xs font-medium text-slate-600 px-3 mb-3 uppercase tracking-widest">Menu</p>
      {NAV_ITEMS.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavClick}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              isActive
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`
          }
        >
          <span className="text-lg w-5 text-center">{icon}</span>
          {label}
        </NavLink>
      ))}
    </nav>

    {/* User section */}
    <div className="px-3 pb-4 border-t border-slate-800 pt-4">
      <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-800/50 mb-2">
        <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full flex items-center justify-center text-slate-950 font-bold text-sm flex-shrink-0">
          {user?.name?.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">{user?.name}</p>
          <p className="text-xs text-slate-500 truncate">{user?.email}</p>
        </div>
      </div>
      <button
        onClick={onLogout}
        className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-200"
      >
        <span>⇤</span> Sign out
      </button>
    </div>
  </div>
);

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex-col">
        <SidebarContent user={user} onNavClick={closeSidebar} onLogout={handleLogout} />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60" onClick={closeSidebar} />
          <aside className="relative w-64 bg-slate-900 border-r border-slate-800 flex flex-col z-10">
            <SidebarContent user={user} onNavClick={closeSidebar} onLogout={handleLogout} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center text-slate-950 font-bold text-sm">₹</div>
            <span className="font-display font-bold text-slate-100">SpendWise</span>
          </div>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Open menu"
          >
            ☰
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
