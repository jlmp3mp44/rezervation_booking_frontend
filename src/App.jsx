import React, { useState } from 'react';
import { AppProvider, useAppContext } from './AppContext';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import CalendarView from './components/CalendarView';
import BookingView from './components/BookingView';
import AdminView from './components/AdminView';
import Modals from './components/Modals';
import GoogleCallback from './components/GoogleCallback';
import './index.css';

const MainLayout = () => {
  const { activeView } = useAppContext();
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
  if (window.location.pathname.startsWith('/auth/google')) {
    return <GoogleCallback />;
  }

  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}

export default App;
