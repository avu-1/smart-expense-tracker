// pages/LoginPage.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', form);
      login(data.accessToken, data.user);
      toast.success(`Welcome back, ${data.user.name}!`);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // Fill demo credentials
  const fillDemo = () => setForm({ email: 'demo@example.com', password: 'demo123' });

  return (
    <div className="min-h-screen auth-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center text-slate-950 font-bold text-2xl mx-auto mb-4">
            ₹
          </div>
          <h1 className="font-display text-3xl font-bold text-slate-100">Welcome back</h1>
          <p className="text-slate-400 mt-2">Sign in to your SpendWise account</p>
        </div>

        <div className="card">
          {/* Demo credentials banner */}
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-400">Demo Account</p>
              <p className="text-xs text-slate-400">demo@example.com / demo123</p>
            </div>
            <button onClick={fillDemo} className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-lg transition-colors">
              Fill
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                placeholder="••••••••"
                className="input-field"
                required
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-400 mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-emerald-400 hover:text-emerald-300 font-medium">
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
