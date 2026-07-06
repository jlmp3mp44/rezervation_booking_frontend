const API_BASE = window.HOROVOD_API_URL || 'http://localhost:8080/api';
const SESSION_KEY = 'horovod_backend_session';

function getStoredToken() {
  try { return localStorage.getItem(SESSION_KEY); } catch (e) { return null; }
}

function setStoredToken(token) {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch (e) {}
}

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getStoredToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
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
      if (result.data.session?.access_token) setStoredToken(result.data.session.access_token);
      return { data: { session: result.data.session }, error: null };
    },
    signInWithPassword: async ({ email, password }) => {
      const result = await apiFetch('/auth/login/password', { method: 'POST', body: JSON.stringify({ email, password }) });
      if (result.data?.session?.access_token) setStoredToken(result.data.session.access_token);
      return result;
    },
    signInWithOtp: async ({ email }) => apiFetch('/auth/otp/send', { method: 'POST', body: JSON.stringify({ email }) }),
    verifyOtp: async ({ email, token, type }) => {
      const result = await apiFetch('/auth/otp/verify', { method: 'POST', body: JSON.stringify({ email, token, type }) });
      if (result.data?.session?.access_token) setStoredToken(result.data.session.access_token);
      return result;
    },
    signOut: async () => {
      setStoredToken(null);
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
