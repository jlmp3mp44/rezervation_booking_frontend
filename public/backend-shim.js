/**
 * HOROVOD HUB — Backend shim
 * Drop-in replacement for @supabase/supabase-js.
 * Keeps app.js unchanged — same API surface as Supabase client v2.
 */
(function (global) {
  'use strict';

  const API_BASE = global.HOROVOD_API_URL || 'http://localhost:8080/api';
  const SESSION_KEY = 'horovod_backend_session';

  function getStoredToken() {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch (e) {
      return null;
    }
  }

  function setStoredToken(token) {
    try {
      if (token) localStorage.setItem(SESSION_KEY, token);
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignore */ }
  }

  async function apiFetch(path, options) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options && options.headers || {});
    const token = getStoredToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    try {
      const res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
      let data = null;
      const text = await res.text();
      if (text) {
        try { data = JSON.parse(text); } catch (e) { data = text; }
      }
      if (!res.ok) {
        const message = (data && data.message) ? data.message : (text || res.statusText);
        return { data: null, error: { message: message, status: res.status } };
      }
      return { data: data, error: null };
    } catch (err) {
      return { data: null, error: { message: err.message || 'Network error' } };
    }
  }

  function ok(data) {
    return Promise.resolve({ data: data, error: null });
  }

  function fail(error) {
    return Promise.resolve({ data: null, error: error });
  }

  class QueryBuilder {
    constructor(table) {
      this.table = table;
      this.method = null;
      this.body = null;
      this.filters = [];
      this.orderBy = null;
      this.limitN = null;
    }

    select() {
      if (!this.method) this.method = 'select';
      return this;
    }

    insert(row) {
      this.method = 'insert';
      this.body = row;
      return this;
    }

    update(row) {
      this.method = 'update';
      this.body = row;
      return this;
    }

    upsert(row) {
      this.method = 'upsert';
      this.body = row;
      return this;
    }

    delete() {
      this.method = 'delete';
      return this;
    }

    eq(col, val) {
      this.filters.push({ col: col, val: val });
      return this;
    }

    order(col, opts) {
      this.orderBy = { col: col, asc: !(opts && opts.ascending === false) };
      return this;
    }

    limit(n) {
      this.limitN = n;
      return this;
    }

    then(onFulfilled, onRejected) {
      return this.execute().then(onFulfilled, onRejected);
    }

    async execute() {
      const table = this.table;

      if (this.method === 'select') {
        let path = '/' + table;
        const params = [];
        if (this.orderBy) {
          params.push('order=' + encodeURIComponent(this.orderBy.col));
          params.push('ascending=' + this.orderBy.asc);
        }
        if (this.limitN != null) params.push('limit=' + this.limitN);
        if (params.length) path += '?' + params.join('&');
        const result = await apiFetch(path);
        if (result.error) return result;
        let rows = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : []);
        this.filters.forEach(function (f) {
          rows = rows.filter(function (row) { return row[f.col] === f.val; });
        });
        return ok(rows);
      }

      if (this.method === 'insert') {
        return apiFetch('/' + table, { method: 'POST', body: JSON.stringify(this.body) }).then(function (r) {
          if (r.error) return r;
          return ok(Array.isArray(r.data) ? r.data : [r.data]);
        });
      }

      if (this.method === 'update') {
        const idFilter = this.filters.find(function (f) { return f.col === 'id'; });
        const id = idFilter ? idFilter.val : (this.body && this.body.id);
        if (!id) return fail({ message: 'Missing id for update' });
        return apiFetch('/' + table + '/' + encodeURIComponent(id), {
          method: 'PUT',
          body: JSON.stringify(this.body)
        });
      }

      if (this.method === 'upsert') {
        return apiFetch('/' + table + '/upsert', {
          method: 'POST',
          body: JSON.stringify(this.body)
        }).then(function (r) {
          if (r.error) return r;
          return ok(r.data);
        });
      }

      if (this.method === 'delete') {
        const idFilter = this.filters.find(function (f) { return f.col === 'id'; });
        if (!idFilter) return fail({ message: 'Missing id for delete' });
        return apiFetch('/' + table + '/' + encodeURIComponent(idFilter.val), { method: 'DELETE' });
      }

      return fail({ message: 'Unknown query method' });
    }
  }

  function createAuthClient() {
    return {
      getSession: async function () {
        const result = await apiFetch('/auth/session');
        if (result.error || !result.data) return ok({ session: null });
        const session = result.data.session || null;
        if (session && session.access_token) setStoredToken(session.access_token);
        return ok({ session: session });
      },

      signInWithPassword: async function (_a) {
        const email = _a.email;
        const password = _a.password;
        const result = await apiFetch('/auth/login/password', {
          method: 'POST',
          body: JSON.stringify({ email: email, password: password })
        });
        if (result.error) return result;
        if (result.data && result.data.session && result.data.session.access_token) {
          setStoredToken(result.data.session.access_token);
        }
        return ok({ user: result.data && result.data.user, session: result.data && result.data.session });
      },

      signInWithOtp: async function (_a) {
        return apiFetch('/auth/otp/send', {
          method: 'POST',
          body: JSON.stringify({ email: _a.email })
        });
      },

      verifyOtp: async function (_a) {
        const result = await apiFetch('/auth/otp/verify', {
          method: 'POST',
          body: JSON.stringify({ email: _a.email, token: _a.token, type: _a.type })
        });
        if (result.error) return result;
        if (result.data && result.data.session && result.data.session.access_token) {
          setStoredToken(result.data.session.access_token);
        }
        return ok({ session: result.data && result.data.session, user: result.data && result.data.session && result.data.session.user });
      },

      signOut: async function () {
        setStoredToken(null);
        return apiFetch('/auth/logout', { method: 'POST' });
      }
    };
  }

  function createChannelClient() {
    var handlers = [];
    var eventSource = null;

    function connectSSE() {
      if (eventSource || typeof EventSource === 'undefined') return;
      try {
        eventSource = new EventSource(API_BASE + '/events/stream');
        eventSource.addEventListener('postgres_changes', function (ev) {
          var payload = null;
          try { payload = JSON.parse(ev.data); } catch (e) { return; }
          handlers.forEach(function (h) {
            var tableMatch = !h.filter.table || h.filter.table === payload.table;
            var eventMatch = !h.filter.event || h.filter.event === '*' || h.filter.event === payload.eventType;
            if (tableMatch && eventMatch) {
              h.callback({
                eventType: payload.eventType,
                new: payload.newRecord,
                old: payload.oldRecord
              });
            }
          });
        });
        eventSource.onerror = function () {
          if (eventSource) { eventSource.close(); eventSource = null; }
          setTimeout(connectSSE, 3000);
        };
      } catch (e) {
        console.warn('SSE connection failed:', e);
      }
    }

    return {
      on: function (event, filter, callback) {
        if (typeof filter === 'function') {
          callback = filter;
          filter = {};
        }
        handlers.push({ event: event, filter: filter || {}, callback: callback });
        return this;
      },
      subscribe: function () {
        connectSSE();
        return ok({ subscription: { id: 'horovod-realtime' } });
      }
    };
  }

  function createClient(_url, _key) {
    return {
      from: function (table) {
        return new QueryBuilder(table);
      },
      auth: createAuthClient(),
      channel: function (_name) {
        return createChannelClient();
      },
      functions: {
        invoke: function (name, opts) {
          if (name === 'send-booking-email') {
            return apiFetch('/email/send', {
              method: 'POST',
              body: JSON.stringify(opts && opts.body ? opts.body : {})
            });
          }
          return fail({ message: 'Unknown function: ' + name });
        }
      }
    };
  }

  global.supabase = {
    createClient: createClient
  };

  console.log('[HOROVOD] Backend shim loaded → ' + API_BASE);
})(typeof window !== 'undefined' ? window : globalThis);
