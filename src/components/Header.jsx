import React, { useState, useEffect } from 'react';
import { useAppContext } from '../AppContext';

const Header = ({ toggleSidebar, unreadCount }) => {
  const {
    isLoggedIn,
    userEmail,
    isAdminUser,
    setIsLoggedIn,
    setUserEmail,
    setIsAdminUser,
    activeView,
    switchView,
    openModal,
    supabaseClient,
    isSupabaseEnabled,
    bookings,
    showToast
  } = useAppContext();

  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerWidth <= 768) {
        const currentScrollY = window.scrollY;
        if (currentScrollY > lastScrollY && currentScrollY > 50) {
          setIsHeaderHidden(true);
        } else {
          setIsHeaderHidden(false);
        }
        setLastScrollY(currentScrollY);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  const handleLogout = async () => {
    if (isSupabaseEnabled && supabaseClient) {
      try {
        await supabaseClient.auth.signOut();
      } catch (err) {
        console.error('Supabase signOut error:', err);
      }
    }
    localStorage.removeItem('user_logged_in');
    localStorage.removeItem('admin_logged_in');
    localStorage.removeItem('user_email');
    setIsLoggedIn(false);
    setUserEmail(null);
    setIsAdminUser(false);
    showToast('Ви вийшли з кабінету.', 'warning');
    switchView('calendar');
  };

  const pendingCount = bookings.filter(b => b.status === 'pending').length;

  return (
    <header className={isHeaderHidden ? 'header-hidden' : ''}>
      <div className="nav-container">
        <div className="logo" id="logo-btn" onClick={() => switchView('calendar')}>
          <img src="/assets/logo.png" alt="HOROVOD" />
          <span>HOROVOD HUB</span>
        </div>

        <nav className="nav-links" id="header-nav-links" style={{ marginLeft: isAdminUser ? '2rem' : 'auto', marginRight: isAdminUser ? '' : '2rem' }}>
          <button
            className={`nav-btn ${activeView === 'book' ? 'active' : ''}`}
            id="nav-book"
            onClick={() => {
                if (!isLoggedIn) {
                    openModal('login');
                } else {
                    switchView('book');
                }
            }}
          >
            <i className="fa-regular fa-calendar-plus"></i> Забронювати
          </button>
          <button
            className={`nav-btn ${activeView === 'calendar' ? 'active' : ''}`}
            id="nav-calendar"
            onClick={() => switchView('calendar')}
          >
            <i className="fa-regular fa-calendar-days"></i> Календар простору
          </button>

          {isAdminUser && (
            <button
              className={`nav-btn ${activeView === 'admin' ? 'active' : ''}`}
              id="nav-admin"
              onClick={() => switchView('admin')}
            >
              <i className="fa-solid fa-sliders"></i> Панель адміна
              {pendingCount > 0 && (
                <span id="pending-badge" style={{ background: 'var(--primary)', color: '#000', borderRadius: '50%', width: '18px', height: '18px', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', marginLeft: '5px' }}>
                  {pendingCount}
                </span>
              )}
            </button>
          )}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isLoggedIn ? (
            <div id="user-profile-nav" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', borderLeft: '1px solid var(--border-color)', paddingLeft: '0.75rem', marginLeft: '0.25rem' }}>
              <span id="user-email-display" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', fontWeight: '500' }}>
                {userEmail}
              </span>
              <button
                className="btn btn-outline"
                id="toggle-sidebar-btn"
                onClick={toggleSidebar}
                style={{ padding: '0.35rem 0.65rem', position: 'relative', transition: 'var(--transition-smooth)' }}
              >
                <i className="fa-regular fa-bell"></i>
                {unreadCount > 0 && (
                    <span id="feed-unread-badge" style={{ position: 'absolute', top: '-6px', right: '-6px', background: 'var(--brand-red)', color: 'white', borderRadius: '50%', width: '15px', height: '15px', fontSize: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', border: '1px solid white' }}>
                        {unreadCount}
                    </span>
                )}
              </button>
              <button className="btn btn-outline" style={{ padding: '0.35rem 0.65rem', fontSize: '0.7rem', textTransform: 'uppercase' }} onClick={handleLogout}>
                <i className="fa-solid fa-right-from-bracket"></i> Вихід
              </button>
            </div>
          ) : (
            <button className="btn btn-primary" id="nav-login-btn" onClick={() => openModal('login')} style={{ padding: '0.35rem 0.75rem' }}>
              <i className="fa-solid fa-arrow-right-to-bracket"></i> Вхід
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
