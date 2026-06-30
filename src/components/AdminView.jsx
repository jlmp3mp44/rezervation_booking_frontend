import React, { useState } from 'react';
import { useAppContext } from '../AppContext';

const AdminView = () => {
  const {
    bookings, setBookings,
    issues, setIssues,
    openModal,
    showToast,
    updateBookingStatusInDB,
    saveData,
    addLog,
    addNewsItem
  } = useAppContext();

  const pendings = bookings.filter(b => b.status === 'pending');
  const histories = bookings.filter(b => b.status !== 'pending');
  const activeIssues = issues.filter(i => !i.resolved);

  const [announcement, setAnnouncement] = useState({ subject: '', text: '' });

  const getContacts = () => {
    const map = {};
    bookings.forEach(b => {
      const key = b.email.toLowerCase().trim();
      if (!map[key]) map[key] = { name: b.userName, email: b.email, bookingsCount: 0 };
      map[key].bookingsCount++;
    });
    return Object.values(map);
  };

  const contacts = getContacts();

  const handleSendAnnouncement = (e) => {
      e.preventDefault();
      if (!announcement.subject || !announcement.text) {
          showToast('Будь ласка, заповніть тему та текст анонсу.', 'error');
          return;
      }
      if (contacts.length === 0) {
          showToast('База контактів порожня.', 'error');
          return;
      }

      addLog('notify-admin', `[МАСОВИЙ АНОНС]\nТема: ${announcement.subject}\nТекст: ${announcement.text}\nОтримувачі (${contacts.length}): ${contacts.map(c => c.email).join(', ')}`, 'announcement', 'Анонс', `Тема: <strong>${announcement.subject}</strong><br>${announcement.text}`);
      addNewsItem(announcement.subject, announcement.text, 'announcement');

      showToast(`Анонс надіслано до ${contacts.length} резидентів!`, 'success');
      setAnnouncement({ subject: '', text: '' });
  };

  const handleApprove = async (id) => {
      const b = bookings.find(item => item.id === id);
      if (!b || b.status !== 'pending') return;

      const prevStatus = b.status;
      const updatedBooking = { ...b, status: 'approved' };

      setBookings(prev => prev.map(item => item.id === id ? updatedBooking : item));

      addLog('notify-accept', `[ПІДТВЕРДЖЕННЯ]\nКому: ${b.email}\nКому: horovod.info@gmail.com\nБронювання для "${b.userName}" (тип: ${b.type}) на ${b.date} о ${b.startTime}-${b.endTime} ПІДТВЕРДЖЕНО.`, 'approved', 'Підтверджено', `Запит від <strong>${b.userName}</strong> (тип: ${b.type}) на <strong>${b.date}</strong> о <strong>${b.startTime}-${b.endTime}</strong> підтверджено.`, b.id);

      await saveData('logs_only');
      const { success } = await updateBookingStatusInDB(updatedBooking);
      if (!success) {
          setBookings(prev => prev.map(item => item.id === id ? { ...b, status: prevStatus } : item));
          showToast('Помилка збереження. Перевірте з\'єднання та спробуйте ще раз.', 'error');
          return;
      }
      localStorage.setItem('rehearsal_bookings_horovod_hub_auth', JSON.stringify(bookings.map(item => item.id === id ? updatedBooking : item)));
      showToast(`Бронювання для ${b.userName} підтверджено!`, 'success');
  };

  const handleReject = async (id) => {
      const b = bookings.find(item => item.id === id);
      if (!b || b.status !== 'pending') return;

      const prevStatus = b.status;
      const updatedBooking = { ...b, status: 'rejected' };

      setBookings(prev => prev.map(item => item.id === id ? updatedBooking : item));

      addLog('notify-reject', `[ВІДХИЛЕНО]\nКому: ${b.email}\nКому: horovod.info@gmail.com\nЗапит від "${b.userName}" (тип: ${b.type}) на ${b.date} о ${b.startTime}-${b.endTime} ВІДХИЛЕНО.`, 'rejected', 'Відхилено', `Запит від <strong>${b.userName}</strong> (тип: ${b.type}) на <strong>${b.date}</strong> о <strong>${b.startTime}-${b.endTime}</strong> відхилено.`, b.id);

      await saveData('logs_only');
      const { success } = await updateBookingStatusInDB(updatedBooking);
      if (!success) {
          setBookings(prev => prev.map(item => item.id === id ? { ...b, status: prevStatus } : item));
          showToast('Помилка збереження. Перевірте з\'єднання та спробуйте ще раз.', 'error');
          return;
      }
      localStorage.setItem('rehearsal_bookings_horovod_hub_auth', JSON.stringify(bookings.map(item => item.id === id ? updatedBooking : item)));
      showToast(`Бронювання для ${b.userName} відхилено.`, 'warning');
  };

  return (
    <section id="view-admin" className="view-section active">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 className="card-title" style={{ marginBottom: 0 }}>
            <i className="fa-solid fa-user-shield" style={{ color: 'var(--brand-blue-dark)' }}></i>
            Керування запитами
          </h2>
        </div>
        <p className="subtitle">Розгляд заявок від спільноти. Підтвердження додає сесію на календар. Буде надіслано повідомлення обом сторонам у разі підтвердження чи відхилення.</p>

        <div className="requests-list" id="pending-requests-list">
            {pendings.length === 0 ? (
                <div className="no-requests">Немає нових запитів на бронювання.</div>
            ) : (
                pendings.map(b => (
                    <div key={b.id} className="request-card">
                        <div className="request-info">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div className="request-band">{b.userName} ({b.type})</div>
                                <span className="badge pending">Очікує</span>
                            </div>
                            <div className="request-details">
                                <span><i className="fa-regular fa-calendar"></i> {b.date}</span>
                                <span><i className="fa-regular fa-clock"></i> {b.startTime} - {b.endTime}</span>
                                <span><i className="fa-regular fa-envelope"></i> {b.email}</span>
                            </div>
                        </div>
                        <div className="request-actions">
                            <button className="btn btn-success" onClick={() => handleApprove(b.id)}>
                                <i className="fa-solid fa-check"></i> Підтвердити
                            </button>
                            <button className="btn btn-danger" onClick={() => handleReject(b.id)}>
                                <i className="fa-solid fa-xmark"></i> Відхилити
                            </button>
                        </div>
                    </div>
                ))
            )}
        </div>
      </div>

      <div className="card" style={{ marginTop: '2rem' }} id="admin-issues-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 className="card-title" style={{ marginBottom: 0 }}>
            <i className="fa-solid fa-screwdriver-wrench" style={{ color: 'var(--brand-orange)' }}></i>
            Контроль несправностей обладнання
          </h2>
          <button className="btn btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', borderColor: 'var(--brand-orange)', color: 'var(--brand-orange)' }} onClick={() => openModal('issue')}>
            <i className="fa-solid fa-circle-plus"></i> Додати несправність
          </button>
        </div>
        <p className="subtitle" style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>Перелік скарг від резидентів. Вирішені проблеми можна зняти з обліку кнопкою "Вирішено".</p>
        <div className="issues-list" id="admin-issues-list">
            {activeIssues.length === 0 ? (
                <div className="no-requests">Немає зареєстрованих скарг.</div>
            ) : (
                activeIssues.map(issue => (
                    <div key={issue.id} className="issue-item">
                        <div className="issue-details">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <span className={`issue-badge category-${issue.category}`}>{issue.category}</span>
                                <span className="issue-title">{issue.title}</span>
                            </div>
                            <div className="issue-meta" style={{ marginTop: '0.25rem' }}>Опис: {issue.description}</div>
                            <div className="issue-meta">Повідомив: {issue.reportedBy} о {issue.reportedAt}</div>
                        </div>
                        <div>
                            <button className="btn btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', borderColor: 'var(--brand-green)', color: 'var(--brand-green)' }} onClick={() => openModal('resolveIssue', { issueId: issue.id })}>
                                <i className="fa-solid fa-check"></i> Вирішено
                            </button>
                        </div>
                    </div>
                ))
            )}
        </div>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <h2 className="card-title">
          <i className="fa-solid fa-address-book" style={{ color: 'var(--brand-red)' }}></i>
          База резидентів та Анонси
        </h2>
        <p className="subtitle">База накопичується автоматично з усіх бронювань. Ви можете створювати односторонні масові оголошення для всієї спільноти.</p>

        <div className="form-row two-col">
          <div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>
              <i className="fa-solid fa-users"></i> Резиденти у базі
            </h3>
            <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.02)', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase' }}>
                    <th style={{ padding: '0.6rem 0.8rem' }}>Ім'я</th>
                    <th style={{ padding: '0.6rem 0.8rem' }}>Email</th>
                    <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>Бронювань</th>
                  </tr>
                </thead>
                <tbody id="contacts-table-body">
                    {contacts.length === 0 ? (
                        <tr><td colSpan="3" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>База контактів порожня</td></tr>
                    ) : (
                        contacts.map((c, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.02)' }}>
                                <td style={{ padding: '0.6rem 0.8rem', fontWeight: '500' }}>{c.name}</td>
                                <td style={{ padding: '0.6rem 0.8rem', color: 'var(--text-secondary)' }}>{c.email}</td>
                                <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center', fontWeight: 'bold', color: 'var(--primary)' }}>{c.bookingsCount}</td>
                            </tr>
                        ))
                    )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>
              <i className="fa-solid fa-bullhorn"></i> Масова розсилка
            </h3>
            <form id="announcement-form" onSubmit={handleSendAnnouncement}>
              <div className="form-group">
                <label htmlFor="announcement-subject">Тема анонсу</label>
                <input type="text" id="announcement-subject" required placeholder="e.g. Важливі зміни у роботі простору" value={announcement.subject} onChange={e => setAnnouncement(p => ({...p, subject: e.target.value}))} />
              </div>
              <div className="form-group">
                <label htmlFor="announcement-text">Текст оголошення</label>
                <textarea id="announcement-text" rows="4" required placeholder="Напишіть текст анонсу для резидентів..." value={announcement.text} onChange={e => setAnnouncement(p => ({...p, text: e.target.value}))}></textarea>
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                <i className="fa-solid fa-paper-plane"></i> Надіслати всім резидентам
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <h2 className="card-title">
          <i className="fa-solid fa-clock-rotate-left" style={{ color: 'var(--text-secondary)' }}></i>
          Історія запитів спільноти
        </h2>
        <div className="requests-list" id="all-requests-list">
            {histories.length === 0 ? (
                <div className="no-requests">Історія порожня.</div>
            ) : (
                histories.map(b => (
                    <div key={b.id} className="request-card">
                        <div className="request-info">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div className="request-band">{b.userName} ({b.type})</div>
                                <span className={`badge ${b.status}`}>{b.status}</span>
                            </div>
                            <div className="request-details">
                                <span><i className="fa-regular fa-calendar"></i> {b.date}</span>
                                <span><i className="fa-regular fa-clock"></i> {b.startTime} - {b.endTime}</span>
                                <span><i className="fa-regular fa-envelope"></i> {b.email}</span>
                            </div>
                        </div>
                        <div className="request-actions">
                            <button className="btn btn-outline" onClick={() => openModal('event', { bookingId: b.id })}>
                                <i className="fa-solid fa-eye"></i> Деталі
                            </button>
                        </div>
                    </div>
                ))
            )}
        </div>
      </div>
    </section>
  );
};

export default AdminView;
