import React, { useState, useEffect } from 'react';
import { AppProvider, useAppContext } from './AppContext';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import CalendarView from './components/CalendarView';
import BookingView from './components/BookingView';
import AdminView from './components/AdminView';
import Modals from './components/Modals';
import './index.css';
import { api } from './api';

const MainLayout = () => {
  const { activeView, setIsLoggedIn, setUserEmail, setIsAdminUser, showToast } = useAppContext();

  useEffect(() => {
    const handleGoogleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');

      if (window.location.pathname === '/auth/google' && code && state) {
        const redirectUri = window.location.origin + '/auth/google';

        try {
          const { data, error } = await api.auth.signInWithGoogle({ code, state, redirectUri });

          if (!error && data && data.user) {
            localStorage.setItem('user_logged_in', 'true');
            localStorage.setItem('user_email', data.user.email);
            localStorage.setItem('admin_logged_in', data.user.isAdmin ? 'true' : 'false');

            setIsLoggedIn(true);
            setUserEmail(data.user.email);
            setIsAdminUser(data.user.isAdmin);

            showToast('Успішний вхід через Google!', 'success');
          } else {
            showToast('Помилка входу через Google: ' + (error?.message || 'Невідома помилка'), 'error');
          }
        } catch (err) {
          showToast('Помилка входу через Google: ' + err.message, 'error');
        } finally {
          // Clear URL parameters
          window.history.replaceState({}, document.title, '/');
        }
      }
    };

    handleGoogleCallback();
  }, [setIsLoggedIn, setUserEmail, setIsAdminUser, showToast]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Mock unread count logic
  const [unreadCount, setUnreadCount] = useState(0);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
    if (!isSidebarOpen) {
        setUnreadCount(0);
    }
  };

  return (
    <>
      <Header toggleSidebar={toggleSidebar} unreadCount={unreadCount} />

      <main className="with-sidebar">
        <div className="content-area">
          {activeView === 'calendar' && <CalendarView />}
          {activeView === 'book' && <BookingView />}
          {activeView === 'admin' && <AdminView />}
        </div>

        <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
      </main>

      <Modals />
    </>
  );
};

function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}

export default App;
