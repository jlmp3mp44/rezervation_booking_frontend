import React, { createContext, useState, useEffect, useContext } from 'react';

const AppContext = createContext();

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

// --- CLOUD CONFIGURATION VARIABLES ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(date.setDate(diff));
  mon.setHours(0, 0, 0, 0);
  return mon;
}

export const AppProvider = ({ children }) => {
  const [bookings, setBookings] = useState([]);
  const [logs, setLogs] = useState([]);
  const [issues, setIssues] = useState([]);
  const [news, setNews] = useState([]);
  const [currentWeekStartDate, setCurrentWeekStartDate] = useState(getMonday(new Date()));
  const [activeModalBookingId, setActiveModalBookingId] = useState(null);
  const [cancellationRole, setCancellationRole] = useState('client');
  const [activeView, setActiveView] = useState('calendar'); // 'calendar', 'book', 'admin'
  const [supabaseClient, setSupabaseClient] = useState(null);
  const [isSupabaseEnabled, setIsSupabaseEnabled] = useState(false);

  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState(null);
  const [isAdminUser, setIsAdminUser] = useState(false);

  // Modals state
  const [modals, setModals] = useState({
    login: false,
    event: false,
    conflict: false,
    success: false,
    cancelSuccess: false,
    issue: false,
    resolveIssue: false,
    activityDetail: false,
    booking: false
  });

  // Extra modal data
  const [modalData, setModalData] = useState({});

  useEffect(() => {
    // init cloud services
    if (navigator.webdriver) {
      console.log('Automated test environment detected. Disabling Supabase connectivity.');
    } else if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
      try {
        const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        setSupabaseClient(client);
        setIsSupabaseEnabled(true);
        console.log('Supabase initialized.');
      } catch (err) {
        console.error('Supabase init error:', err);
      }
    }
  }, []);

  useEffect(() => {
    // load data once we know if supabase is enabled
    const loadData = async () => {
      // Wipe old test data once
      if (localStorage.getItem('rehearsal_hub_cleaned_v5') !== 'true') {
        localStorage.removeItem('rehearsal_bookings_horovod_hub_auth');
        localStorage.removeItem('rehearsal_logs_horovod_hub_auth');
        localStorage.removeItem('rehearsal_issues_horovod_hub_auth');
        localStorage.removeItem('rehearsal_news_feed');
        localStorage.removeItem('user_logged_in');
        localStorage.removeItem('admin_logged_in');
        localStorage.removeItem('user_email');
        localStorage.setItem('rehearsal_hub_cleaned_v5', 'true');
      }

      let loadedBookings = [];
      let loadedLogs = [];
      let loadedIssues = [];
      let loadedNews = [];

      const storedBookings = localStorage.getItem('rehearsal_bookings_horovod_hub_auth');
      const storedLogs = localStorage.getItem('rehearsal_logs_horovod_hub_auth');
      const storedIssues = localStorage.getItem('rehearsal_issues_horovod_hub_auth');
      const storedNews = localStorage.getItem('rehearsal_news_feed');

      if (storedNews) loadedNews = JSON.parse(storedNews);

      if (isSupabaseEnabled && supabaseClient) {
        try {
          const { data, error } = await supabaseClient.from('bookings').select('*');
          if (!error && data) {
            loadedBookings = data;
            localStorage.setItem('rehearsal_bookings_horovod_hub_auth', JSON.stringify(loadedBookings));
          } else if (storedBookings) {
            loadedBookings = JSON.parse(storedBookings);
          }
        } catch (err) {
          if (storedBookings) loadedBookings = JSON.parse(storedBookings);
        }

        try {
          const { data, error } = await supabaseClient.from('logs').select('*').order('timestamp', { ascending: false }).limit(50);
          if (!error && data) {
            loadedLogs = data;
            localStorage.setItem('rehearsal_logs_horovod_hub_auth', JSON.stringify(loadedLogs));
          } else if (storedLogs) {
             loadedLogs = JSON.parse(storedLogs);
          }
        } catch (err) {
          if (storedLogs) loadedLogs = JSON.parse(storedLogs);
        }

        try {
          const { data, error } = await supabaseClient.from('issues').select('*');
          if (!error && data) {
            loadedIssues = data;
            localStorage.setItem('rehearsal_issues_horovod_hub_auth', JSON.stringify(loadedIssues));
          } else if (storedIssues) {
            loadedIssues = JSON.parse(storedIssues);
          }
        } catch (err) {
           if (storedIssues) loadedIssues = JSON.parse(storedIssues);
        }

      } else {
         if (storedBookings) loadedBookings = JSON.parse(storedBookings);
         if (storedLogs) loadedLogs = JSON.parse(storedLogs);
         if (storedIssues) loadedIssues = JSON.parse(storedIssues);
      }

      setBookings(loadedBookings);
      setLogs(loadedLogs);
      setIssues(loadedIssues);
      setNews(loadedNews);

      // Auth Session
      let loggedIn = localStorage.getItem('user_logged_in') === 'true';
      let email = localStorage.getItem('user_email');
      let isAdmin = localStorage.getItem('admin_logged_in') === 'true';
      let hasAccessToken = !!localStorage.getItem('access_token');

      if (hasAccessToken) {
          loggedIn = true;
      } else if (isSupabaseEnabled && supabaseClient) {
        try {
          const { data } = await supabaseClient.auth.getSession();
          if (data && data.session && data.session.user) {
            loggedIn = true;
            email = data.session.user.email;
            isAdmin = email === 'horovod.info@gmail.com';
            localStorage.setItem('user_logged_in', 'true');
            localStorage.setItem('user_email', email);
            localStorage.setItem('admin_logged_in', isAdmin ? 'true' : 'false');
          } else {
             const savedAdmin = localStorage.getItem('admin_logged_in') === 'true';
             if (!savedAdmin) {
               loggedIn = false;
               email = null;
               isAdmin = false;
             }
          }
        } catch (err) {}
      }
      setIsLoggedIn(loggedIn);
      setUserEmail(email);
      setIsAdminUser(isAdmin);
    };

    loadData();
  }, [isSupabaseEnabled, supabaseClient]);

  // Realtime subscription
  useEffect(() => {
    if (isSupabaseEnabled && supabaseClient) {
      const channel = supabaseClient
        .channel('realtime-db-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, async (payload) => {
          try {
            const { data, error } = await supabaseClient.from('bookings').select('*');
            if (!error && data) {
              setBookings(data);
              localStorage.setItem('rehearsal_bookings_horovod_hub_auth', JSON.stringify(data));
              // TODO: Unread badge logic if needed
            }
          } catch(err) {}
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'issues' }, async () => {
           try {
            const { data, error } = await supabaseClient.from('issues').select('*');
            if (!error && data) {
              setIssues(data);
              localStorage.setItem('rehearsal_issues_horovod_hub_auth', JSON.stringify(data));
            }
          } catch(err) {}
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs' }, async (payload) => {
            const newLog = payload.new;
            setLogs(prev => {
                if (newLog && !prev.find(l => l.id === newLog.id)) {
                    const next = [newLog, ...prev];
                    if (next.length > 50) next.pop();
                    localStorage.setItem('rehearsal_logs_horovod_hub_auth', JSON.stringify(next));
                    return next;
                }
                return prev;
            });
        })
        .subscribe();

      return () => {
        supabaseClient.removeChannel(channel);
      };
    }
  }, [isSupabaseEnabled, supabaseClient]);

  const openModal = (modalName, data = {}) => {
    setModalData(prev => ({ ...prev, [modalName]: data }));
    setModals(prev => ({ ...prev, [modalName]: true }));
  };

  const closeModal = (modalName) => {
    setModals(prev => ({ ...prev, [modalName]: false }));
  };

  // Utilities
  const switchView = (view) => {
      setActiveView(view);
  };

  const showToast = (message, type = 'info') => {
      // Very basic implementation: could be replaced with react-hot-toast
      console.log(`[TOAST] ${type}: ${message}`);
      // Create a native DOM element if one doesn't exist to simulate toast
      let container = document.getElementById('toast-container');
      if (!container) {
          container = document.createElement('div');
          container.id = 'toast-container';
          container.className = 'toast-container';
          document.body.appendChild(container);
      }
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.textContent = message;
      container.appendChild(toast);
      setTimeout(() => {
          toast.classList.add('fade-out');
          setTimeout(() => toast.remove(), 500);
      }, 4000);
  };

    const apiFetch = async (url, options = {}) => {
    let accessToken = localStorage.getItem('access_token');

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const config = {
      ...options,
      headers
    };

    let response = await fetch(url, config);

    if (response.status === 401) {
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const refreshRes = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refresh_token: refreshToken })
          });

          if (refreshRes.ok) {
            const data = await refreshRes.json();
            if (data.access_token && data.refresh_token) {
              localStorage.setItem('access_token', data.access_token);
              localStorage.setItem('refresh_token', data.refresh_token);

              // Retry original request
              headers['Authorization'] = `Bearer ${data.access_token}`;
              response = await fetch(url, { ...config, headers });
            }
          } else {
             // Refresh failed, logout
             localStorage.removeItem('access_token');
             localStorage.removeItem('refresh_token');
             localStorage.removeItem('user_logged_in');
             localStorage.removeItem('user_email');
             localStorage.removeItem('admin_logged_in');
             setIsLoggedIn(false);
             setUserEmail(null);
             setIsAdminUser(false);
          }
        } catch (e) {
             console.error("Token refresh failed", e);
             localStorage.removeItem('access_token');
             localStorage.removeItem('refresh_token');
             localStorage.removeItem('user_logged_in');
             localStorage.removeItem('user_email');
             localStorage.removeItem('admin_logged_in');
             setIsLoggedIn(false);
             setUserEmail(null);
             setIsAdminUser(false);
        }
      } else {
          setIsLoggedIn(false);
          setUserEmail(null);
          setIsAdminUser(false);
      }
    }

    return response;
  };

  // Shared Actions
  const sanitizeBookingForSupabase = (b) => {
      return {
          id: b.id, userName: b.userName, email: b.email,
          date: b.date, startTime: b.startTime, endTime: b.endTime,
          type: b.type, notes: b.notes || '',
          status: b.status, submittedAt: b.submittedAt,
          cancelReason: b.cancelReason || null, cancelledBy: b.cancelledBy || null
      };
  };

  const saveData = async (singleBooking) => {
      localStorage.setItem('rehearsal_bookings_horovod_hub_auth', JSON.stringify(bookings));
      localStorage.setItem('rehearsal_logs_horovod_hub_auth', JSON.stringify(logs));

      if (singleBooking === 'logs_only') return { success: true };

      if (isSupabaseEnabled && supabaseClient) {
          try {
              if (singleBooking) {
                  const { error } = await supabaseClient.from('bookings').upsert(sanitizeBookingForSupabase(singleBooking));
                  if (error) return { success: false, error };
              } else {
                  const { error } = await supabaseClient.from('bookings').upsert(bookings.map(sanitizeBookingForSupabase));
                  if (error) return { success: false, error };
              }
          } catch(err) {
              return { success: false, error: err };
          }
      }
      return { success: true };
  };

  const updateBookingStatusInDB = async (b) => {
      if (!isSupabaseEnabled || !supabaseClient) return { success: true };
      try {
          const { data, error } = await supabaseClient.from('bookings').update(sanitizeBookingForSupabase(b)).eq('id', b.id).select();
          if (error) return { success: false, error };
          if (!data || data.length === 0) {
              await supabaseClient.from('bookings').insert(sanitizeBookingForSupabase(b));
          }
          return { success: true };
      } catch (err) {
          return { success: false, error: err };
      }
  };

  const addLog = (type, message, status = 'info', title = '', body = '', bookingId = null) => {
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const logEntry = {
          id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          time: timestamp, type, message, status, title, body, bookingId
      };

      setLogs(prev => {
          const next = [logEntry, ...prev];
          if (next.length > 50) next.pop();
          localStorage.setItem('rehearsal_logs_horovod_hub_auth', JSON.stringify(next));
          return next;
      });

      if (isSupabaseEnabled && supabaseClient) {
          supabaseClient.from('logs').insert(logEntry).then(({error}) => {
              if (error) console.warn('Supabase log insert failed:', error);
          }).catch(() => {});
      }
  };

  const addNewsItem = (title, content, type = 'announcement') => {
      const newItem = {
          id: 'news_' + Date.now(),
          title, content, type,
          date: new Date().toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
      };
      setNews(prev => {
          const next = [newItem, ...prev];
          localStorage.setItem('rehearsal_news_feed', JSON.stringify(next));
          return next;
      });
  };

  return (
    <AppContext.Provider value={{
      bookings, setBookings,
      logs, setLogs,
      issues, setIssues,
      news, setNews,
      currentWeekStartDate, setCurrentWeekStartDate,
      activeModalBookingId, setActiveModalBookingId,
      cancellationRole, setCancellationRole,
      supabaseClient,
      isSupabaseEnabled,
      isLoggedIn, setIsLoggedIn,
      userEmail, setUserEmail,
      isAdminUser, setIsAdminUser,
      activeView, setActiveView,
      modals, openModal, closeModal, modalData,
      switchView, showToast, saveData, updateBookingStatusInDB, addLog, addNewsItem, apiFetch
    }}>
      {children}
    </AppContext.Provider>
  );
};