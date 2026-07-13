const API_BASE = window.HOROVOD_API_URL || 'http://localhost:8080/api';
const SESSION_KEY = 'horovod_backend_session';

function getStoredTokens() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
}

function setStoredTokens(tokens) {
  try {
    if (tokens) localStorage.setItem(SESSION_KEY, JSON.stringify(tokens));
    else localStorage.removeItem(SESSION_KEY);
  } catch (e) {}
}

let isRefreshing = false;
let refreshSubscribers = [];

function onRefreshed(token) {
  refreshSubscribers.forEach(cb => cb(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb) {
  refreshSubscribers.push(cb);
}

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  let tokens = getStoredTokens();
  if (tokens && tokens.access_token) headers['Authorization'] = `Bearer ${tokens.access_token}`;

  try {
    let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    // Handle 401 Unauthorized by trying to refresh the token
    if (res.status === 401 && tokens && tokens.refresh_token && path !== '/auth/refresh') {
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: tokens.refresh_token })
          });

          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            if (refreshData.access_token) {
               tokens = {
                 access_token: refreshData.access_token,
                 refresh_token: refreshData.refresh_token || tokens.refresh_token
               };
               setStoredTokens(tokens);
               onRefreshed(tokens.access_token);

               // Retry the original request
               headers['Authorization'] = `Bearer ${tokens.access_token}`;
               res = await fetch(`${API_BASE}${path}`, { ...options, headers });
            } else {
               setStoredTokens(null);
               onRefreshed(null);
            }
          } else {
            setStoredTokens(null);
            onRefreshed(null);
          }
        } catch (e) {
          setStoredTokens(null);
          onRefreshed(null);
        } finally {
          isRefreshing = false;
        }
      } else {
        // Wait for refresh to complete
        await new Promise(resolve => {
           addRefreshSubscriber(token => {
             if (token) {
               headers['Authorization'] = `Bearer ${token}`;
             }
             resolve();
           });
        });
        res = await fetch(`${API_BASE}${path}`, { ...options, headers });
      }
    }

    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch (e) { data = text; }
    }
    if (!res.ok) {
      return { data: null, error: { message: data?.message || text || res.statusText, status: res.status } };
    }
    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: err.message || 'Network error' } };
  }
}

class QueryBuilder {
  constructor(table) {
    this.table = table;
  }
  async select(query = '') {
    return apiFetch(`/${this.table}${query}`);
  }
  async insert(row) {
    const res = await apiFetch(`/${this.table}`, { method: 'POST', body: JSON.stringify(row) });
    return { ...res, data: Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []) };
  }
  async update(row, id) {
    if (!id && !row.id) return { data: null, error: { message: 'Missing id for update' } };
    return apiFetch(`/${this.table}/${encodeURIComponent(id || row.id)}`, { method: 'PUT', body: JSON.stringify(row) });
  }
  async upsert(row) {
    return apiFetch(`/${this.table}/upsert`, { method: 'POST', body: JSON.stringify(row) });
  }
  async delete(id) {
    if (!id) return { data: null, error: { message: 'Missing id for delete' } };
    return apiFetch(`/${this.table}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
}

export const api = {
  bookings: new QueryBuilder('bookings'),
  issues: new QueryBuilder('issues'),
  logs: new QueryBuilder('logs'),
  auth: {
    getSession: async () => {
      const result = await apiFetch('/auth/session');
      if (result.error || !result.data) return { data: { session: null }, error: null };
      if (result.data.session?.access_token) {
        let tokens = getStoredTokens() || {};
        tokens.access_token = result.data.session.access_token;
        if (result.data.session.refresh_token) tokens.refresh_token = result.data.session.refresh_token;
        setStoredTokens(tokens);
      }
      return { data: { session: result.data.session }, error: null };
    },
    login: async ({ email, password }) => {
      const result = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      if (result.data?.access_token) {
        let tokens = getStoredTokens() || {};
        tokens.access_token = result.data.access_token;
        if (result.data.refresh_token) tokens.refresh_token = result.data.refresh_token;
        setStoredTokens(tokens);
      }
      return result;
    },
    register: async ({ email, password }) => {
      return apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
    },
    getGoogleAuthUrl: async ({ redirectUri }) => {
      const result = await apiFetch(`/auth/google/url?redirect_uri=${encodeURIComponent(redirectUri)}`);
      return result;
    },
    signInWithGoogle: async ({ code, state, redirectUri }) => {
      const result = await apiFetch('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ code, state, redirect_uri: redirectUri })
      });
      if (result.data && result.data.access_token) {
        setStoredTokens({
          access_token: result.data.access_token,
          refresh_token: result.data.refresh_token
        });
      }
      return result;
    },
    refreshToken: async ({ refresh_token }) => {
      return apiFetch('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token })
      });
    },
    signOut: async () => {
      setStoredTokens(null);
      return apiFetch('/auth/logout', { method: 'POST' });
    }
  },
  realtime: {
    subscribe: (onEvent) => {
      let eventSource = null;
      function connect() {
        if (eventSource || typeof EventSource === 'undefined') return;
        eventSource = new EventSource(`${API_BASE}/events/stream`);
        eventSource.addEventListener('postgres_changes', (ev) => {
          try {
            const payload = JSON.parse(ev.data);
            onEvent(payload);
          } catch (e) {}
        });
        eventSource.onerror = () => {
          if (eventSource) { eventSource.close(); eventSource = null; }
          setTimeout(connect, 3000);
        };
      }
      connect();
      return () => { if (eventSource) { eventSource.close(); eventSource = null; } };
    }
  }
};
