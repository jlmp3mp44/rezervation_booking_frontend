import React, { useState, useEffect } from 'react';
import { useAppContext } from '../AppContext';

const BookingView = () => {
  const {
    bookings,
    userEmail,
    isAdminUser,
    openModal,
    showToast,
    switchView
  } = useAppContext();

  const [formData, setFormData] = useState({
    userName: '',
    date: '',
    type: 'репетиція',
    startTime: '18:00',
    endTime: '19:00',
    notes: ''
  });

  // Pre-fill date based on drag selection or defaults
  useEffect(() => {
    if (window.__pendingBookingDrag) {
        const dragData = window.__pendingBookingDrag;
        setFormData(prev => ({
            ...prev,
            date: dragData.date,
            startTime: dragData.start,
            endTime: dragData.end
        }));
        delete window.__pendingBookingDrag;
    } else if (!formData.date) {
        const d = new Date();
        d.setDate(d.getDate() + (isAdminUser ? 0 : 1));
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        setFormData(prev => ({ ...prev, date: `${yyyy}-${mm}-${dd}` }));
    }
  }, [isAdminUser, formData.date]);

  const handleChange = (e) => {
      const { id, value } = e.target;
      // map DOM ids to state keys
      const keyMap = {
          'user-name': 'userName',
          'booking-date': 'date',
          'booking-type': 'type',
          'start-time': 'startTime',
          'end-time': 'endTime',
          'booking-notes': 'notes'
      };
      const key = keyMap[id];
      if (key) {
          setFormData(prev => ({ ...prev, [key]: value }));
      }
  };

  const { setBookings, saveData, addLog } = useAppContext();

  const handleSubmit = async (e) => {
      e.preventDefault();

      const newBooking = {
          id: 'book_' + Date.now(),
          userName: formData.userName,
          email: userEmail || '',
          date: formData.date,
          type: formData.type,
          startTime: formData.startTime,
          endTime: formData.endTime,
          notes: formData.notes || 'Немає приміток.',
          status: isAdminUser ? 'approved' : 'pending',
          submittedAt: new Date().toISOString()
      };

      setBookings(prev => [newBooking, ...prev]);
      await saveData(newBooking);

      if (isAdminUser && newBooking.status === 'approved') {
          addLog('notify-accept', `[ПІДТВЕРДЖЕННЯ]\nКому: julya.newfold@gmail.com\nБронювання для "Адміністратор" (тип: ${newBooking.type}) на ${newBooking.date} о ${newBooking.startTime}-${newBooking.endTime} ПІДТВЕРДЖЕНО.`, 'approved', 'Підтверджено', `Бронювання для <strong>Адміністратора</strong> (тип: ${newBooking.type}) на <strong>${newBooking.date}</strong> о <strong>${newBooking.startTime}-${newBooking.endTime}</strong> підтверджено.`, newBooking.id);
          showToast('Бронювання підтверджено!', 'success');
      } else {
          addLog('notify-admin', `[ОТРИМАНО ЗАПИТ]\nКому: julya.newfold@gmail.com\nНовий запит від "${newBooking.userName}" (тип: ${newBooking.type}) на ${newBooking.date} з ${newBooking.startTime} до ${newBooking.endTime}.\nОчікує розгляду в панелі адміна.`, 'pending', 'Запит', `<strong>${newBooking.userName}</strong> надіслав запит (тип: ${newBooking.type}) на <strong>${newBooking.date}</strong> о <strong>${newBooking.startTime}-${newBooking.endTime}</strong>.`, newBooking.id);
          showToast('Запит успішно надіслано. Координатор перевірить його найближчим часом.', 'success');
      }

      setFormData(prev => ({ ...prev, notes: '' }));
      switchView('calendar');
  };

  const userBookings = bookings.filter(b => b.email && b.email.toLowerCase().trim() === (userEmail || '').toLowerCase().trim());

  return (
    <section id="view-book" className="view-section active">
      <div className="card" id="mobile-booking-card-wrapper">
        <h2 className="card-title">
          <i className="fa-solid fa-music" style={{ color: 'var(--brand-orange)' }}></i>
          Забронювати час у кімнаті
        </h2>

        {isAdminUser ? (
            <div className="admin-banner">
                <i className="fa-solid fa-shield-halved" style={{ color: 'var(--brand-orange)', fontSize: '1.5rem', flexShrink: 0 }}></i>
                <div><strong>Режим адміністратора:</strong> Можна бронювати сьогодні у будь-який час (крім уже розпочатих слотів) та перевизначати будь-які слоти.</div>
            </div>
        ) : (
            <p className="subtitle" id="booking-form-subtitle">Спрощена форма бронювання для спільноти ХОРОВОД. Увага: бронювання на сьогодні неможливі, лише починаючи з завтрашнього дня.</p>
        )}

        <form id="booking-form" onSubmit={handleSubmit}>
          <div className="form-row two-col">
            <div className="form-group">
              <label htmlFor="user-name">Ваше Ім'я *</label>
              <input type="text" id="user-name" required placeholder="e.g. Саша Коваль" value={formData.userName} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="contact-email">Електронна пошта *</label>
              <input type="email" id="contact-email" required readOnly style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--text-secondary)', cursor: 'not-allowed' }} value={userEmail || ''} />
            </div>
          </div>

          <div className="form-row two-col">
            <div className="form-group">
              <label htmlFor="booking-date">Дата *</label>
              <input type="date" id="booking-date" required value={formData.date} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="booking-type">Тип бронювання *</label>
              <select id="booking-type" required value={formData.type} onChange={handleChange}>
                <option value="репетиція">Репетиція</option>
                <option value="чилл">Чилл</option>
                <option value="робота">Робота</option>
                <option value="заниматься самому">Займатися самому</option>
                <option value="інше">Інше</option>
              </select>
            </div>
          </div>

          <div className="form-row two-col">
            <div className="form-group">
              <label htmlFor="start-time">Час початку *</label>
              <select id="start-time" required value={formData.startTime} onChange={(e) => {
                  const newStart = e.target.value;
                  const [sh, sm] = newStart.split(':').map(Number);
                  const startDec = sh + sm / 60;
                  const newEndDec = Math.min(startDec + 1, 24);
                  const newEnd = `${String(Math.floor(newEndDec)).padStart(2,'0')}:${Math.round((newEndDec % 1)*60) === 30 ? '30' : '00'}`;
                  setFormData(p => ({ ...p, startTime: newStart, endTime: newEnd }));
              }}>
                 {Array.from({ length: 32 }).map((_, i) => {
                     const h = Math.floor(8 + i * 0.5);
                     const m = i % 2 === 0 ? '00' : '30';
                     const val = `${String(h).padStart(2,'0')}:${m}`;
                     return <option key={val} value={val}>{val}</option>;
                 })}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="end-time">Час завершення *</label>
              <select id="end-time" required value={formData.endTime} onChange={handleChange}>
                 {Array.from({ length: 33 }).map((_, i) => {
                     const dec = 8.5 + i * 0.5;
                     if (dec > 24) return null;
                     const h = Math.floor(dec);
                     const m = dec % 1 === 0.5 ? '30' : '00';
                     const val = dec === 24 ? '24:00' : `${String(h).padStart(2,'0')}:${m}`;
                     const label = dec === 24 ? '24:00 (Північ)' : val;
                     const [sh, sm] = formData.startTime.split(':').map(Number);
                     const startDec = sh + sm / 60;
                     if (dec <= startDec) return null;
                     return <option key={val} value={val}>{label}</option>;
                 })}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="booking-notes">Опис активності / Примітки</label>
            <textarea id="booking-notes" rows="4" placeholder="Напишіть, що ви плануєте робити чи яке обладнання вам знадобиться..." value={formData.notes} onChange={handleChange}></textarea>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
            <i className="fa-solid fa-check"></i> Надіслати запит на бронювання
          </button>
        </form>
      </div>

      {userEmail && (
        <div className="card" style={{ marginTop: '2rem' }} id="user-cabinet-card">
          <h2 className="card-title">
            <i className="fa-solid fa-headphones" style={{ color: 'var(--brand-blue-dark)' }}></i>
            Ваш кабінет: Мої бронювання
          </h2>
          <p className="subtitle" id="cabinet-user-email" style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', marginTop: '-0.75rem', marginBottom: '1.5rem' }}>
            Логін: {userEmail}
          </p>

          <div className="requests-list" id="user-bookings-list">
            {userBookings.length === 0 ? (
                <div className="no-requests">Ви ще не створювали запитів на бронювання.</div>
            ) : (
                userBookings.map(b => (
                    <div key={b.id} className="request-card">
                        <div className="request-info">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div className="request-band">{b.userName} ({b.type})</div>
                                <span className={`badge ${b.status}`}>{b.status}</span>
                            </div>
                            <div className="request-details">
                                <span><i className="fa-regular fa-calendar"></i> {b.date}</span>
                                <span><i className="fa-regular fa-clock"></i> {b.startTime} - {b.endTime}</span>
                            </div>
                        </div>
                        {(b.status === 'pending' || b.status === 'approved') && (
                            <div className="request-actions">
                                <button className="btn btn-danger" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }} onClick={() => openModal('event', { bookingId: b.id })}>
                                    <i className="fa-solid fa-xmark"></i> Скасувати
                                </button>
                            </div>
                        )}
                    </div>
                ))
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default BookingView;
