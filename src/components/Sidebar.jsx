import React from 'react';
import { useAppContext } from '../AppContext';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const { logs, openModal } = useAppContext();

  const handleLogClick = (idx) => {
      openModal('activityDetail', { logIndex: idx });
  };

  return (
    <>
      <aside className={`sidebar-panel card ${isOpen ? 'open' : ''}`} id="sidebar-drawer">
        <button className="modal-close" onClick={toggleSidebar} style={{ top: '1rem', right: '1rem' }}>&times;</button>
        <h3 className="card-title" style={{ fontSize: '1.2rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <i className="fa-solid fa-clock-rotate-left" style={{ color: 'var(--brand-blue-dark)' }}></i>
          Стрічка активності
        </h3>
        <p className="subtitle" style={{ fontSize: '0.8rem', marginBottom: '1.25rem', color: 'var(--text-secondary)' }}>
          Останні події, запити та зміни статусів бронювання.
        </p>
        <div className="logs-container" id="logs-container">
          {logs.map((log, idx) => {
            const status = log.status || 'info';
            const title = log.title || 'Подія';
            const body = log.body || log.message || '';

            return (
              <div
                key={log.id || idx}
                className={`log-item ${log.type || ''} status-${status}`}
                style={{ cursor: 'pointer' }}
                onClick={() => handleLogClick(idx)}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span className={`log-badge badge-${status}`}>
                      {title}
                    </span>
                    <span className="log-time">
                      {log.time}
                    </span>
                  </div>
                  <div className="log-body-content" dangerouslySetInnerHTML={{ __html: body }}></div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Sidebar Drawer Overlay */}
      <div
        className={`drawer-overlay ${isOpen ? 'active' : ''}`}
        id="drawer-overlay"
        onClick={toggleSidebar}
        style={{ display: isOpen ? 'block' : 'none' }}
      ></div>
    </>
  );
};

export default Sidebar;
