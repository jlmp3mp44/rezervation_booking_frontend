import { api } from "./api";
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

      try {
        const { data, error } = await api.bookings.select('');
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
        const { data, error } = await api.logs.select('?order=timestamp&ascending=false&limit=50');
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
        const { data, error } = await api.issues.select('');
        if (!error && data) {
          loadedIssues = data;
          localStorage.setItem('rehearsal_issues_horovod_hub_auth', JSON.stringify(loadedIssues));
        } else if (storedIssues) {
          loadedIssues = JSON.parse(storedIssues);
        }
      } catch (err) {
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

      try {
        const { data } = await api.auth.getSession();
        if (data && data.session && data.session.user) {
          loggedIn = true;
          email = data.session.user.email;
          isAdmin = data.session.user.isAdmin || email === 'horovod.info@gmail.com';
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

      setIsLoggedIn(loggedIn);
      setUserEmail(email);
      setIsAdminUser(isAdmin);
    };

    loadData();
  }, []);

  // Realtime subscription
  useEffect(() => {
    const unsubscribe = api.realtime.subscribe(async (payload) => {
      if (payload.table === 'bookings') {
        try {
          const { data, error } = await api.bookings.select('');
          if (!error && data) {
            setBookings(data);
            localStorage.setItem('rehearsal_bookings_horovod_hub_auth', JSON.stringify(data));
          }
        } catch(err) {}
      } else if (payload.table === 'issues') {
        try {
          const { data, error } = await api.issues.select('');
          if (!error && data) {
            setIssues(data);
            localStorage.setItem('rehearsal_issues_horovod_hub_auth', JSON.stringify(data));
          }
        } catch(err) {}
      } else if (payload.table === 'logs' && payload.eventType === 'INSERT') {
        const newLog = payload.newRecord;
        setLogs(prev => {
            if (newLog && !prev.find(l => l.id === newLog.id)) {
                const next = [newLog, ...prev];
                if (next.length > 50) next.pop();
                localStorage.setItem('rehearsal_logs_horovod_hub_auth', JSON.stringify(next));
                return next;
            }
            return prev;
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

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

      try {
          if (singleBooking) {
              const { error } = await api.bookings.upsert(sanitizeBookingForSupabase(singleBooking));
              if (error) return { success: false, error };
          } else {
              const { error } = await api.bookings.upsert(bookings.map(sanitizeBookingForSupabase));
              if (error) return { success: false, error };
          }
      } catch(err) {
          return { success: false, error: err };
      }
      return { success: true };
  };

  const updateBookingStatusInDB = async (b) => {
      try {
          const { data, error } = await api.bookings.update(sanitizeBookingForSupabase(b), b.id);
          if (error) return { success: false, error };
          if (!data || data.length === 0) {
              await api.bookings.insert(sanitizeBookingForSupabase(b));
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

      api.logs.insert(logEntry).then(({error}) => {
          if (error) console.warn('API log insert failed:', error);
      }).catch(() => {});
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
      isLoggedIn, setIsLoggedIn,
      userEmail, setUserEmail,
      isAdminUser, setIsAdminUser,
      activeView, setActiveView,
      modals, openModal, closeModal, modalData,
      switchView, showToast, saveData, updateBookingStatusInDB, addLog, addNewsItem
    }}>
      {children}
    </AppContext.Provider>
  );
};