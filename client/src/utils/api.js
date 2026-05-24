// utils/api.js (UPGRADED — automatic access token refresh on 401)
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000, // 30 s — Gemini AI calls can take 10-15 s on first load
  withCredentials: true, // Send cookies (refresh token) with every request
});

// Track whether we're already refreshing to avoid race conditions
let isRefreshing = false;
let failedQueue = []; // Requests waiting for the new token

const redirectToLogin = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');

  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
};

// --- Request interceptor: attach access token ---
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// --- Response interceptor: auto-refresh on TOKEN_EXPIRED ---
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isExpired = error.response?.data?.code === 'TOKEN_EXPIRED';

    // Only retry once and not for the refresh-token call itself
    if (isExpired && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue this request until the refresh finishes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post('/api/auth/refresh-token', {}, { withCredentials: true });
        const newToken = data.accessToken;
        localStorage.setItem('accessToken', newToken);
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        // Refresh failed — clear everything and switch to the login route once.
        redirectToLogin();
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    // BUG-07 FIX: only redirect to login for 401s on protected API calls.
    // Skip redirect for auth endpoints (refresh-token, me) used during bootstrap
    // to avoid a redirect loop on first load.
    const isAuthEndpoint = originalRequest.url?.includes('/auth/');
    if (error.response?.status === 401 && !isExpired && !isAuthEndpoint) {
      redirectToLogin();
    }

    return Promise.reject(error);
  }
);

export default api;
