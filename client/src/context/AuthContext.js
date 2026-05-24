// context/AuthContext.js (UPGRADED — uses accessToken key, supports logout endpoint)
import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On mount: verify existing access token, or try refresh
    const bootstrap = async () => {
      const token = localStorage.getItem('accessToken');
      const storedUser = localStorage.getItem('user');

      if (token && storedUser) {
        setUser(JSON.parse(storedUser));
        try {
          const res = await api.get('/auth/me');
          setUser(res.data.user);
          localStorage.setItem('user', JSON.stringify(res.data.user));
        } catch {
          // api.js interceptor will attempt refresh automatically;
          // if that fails it redirects to /login — nothing to do here
        }
      } else if (!token) {
        // No access token — try silent refresh via cookie
        try {
          const { data } = await api.post('/auth/refresh-token');
          localStorage.setItem('accessToken', data.accessToken);
          const me = await api.get('/auth/me');
          setUser(me.data.user);
          localStorage.setItem('user', JSON.stringify(me.data.user));
        } catch {
          // No valid session — stay logged out
        }
      }
      setLoading(false);
    };

    bootstrap();
  }, []);

  const login = (accessToken, userData) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (_) {
      // Best-effort server logout
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
