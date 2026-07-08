import { api } from "../api";
import React, { useState } from 'react';
import { useAppContext } from '../AppContext';

const Modals = () => {
  const {
    modals,
    closeModal,
    modalData,
    bookings, setBookings,
    showToast,
    setIsLoggedIn,
    setUserEmail,
    setIsAdminUser,
    isAdminUser,
    userEmail,
    saveData,
    updateBookingStatusInDB,
    addLog,
    setIssues,
    issues,
    addNewsItem
  } = useAppContext();

  // Simple local state for forms inside modals
  const [issueData, setIssueData] = useState({ title: '', category: 'sound', description: '' });
  const [loginData, setLoginData] = useState({ email: '', password: '', step: 1 });

  // 1. Event Modal
  const activeBooking = bookings.find(b => b.id === modalData.event?.bookingId);

  const handleApprove = async () => {
      if (!activeBooking) return;
      const prevStatus = activeBooking.status;
      const updatedBooking = { ...activeBooking, status: 'approved' };
      setBookings(prev => prev.map(item => item.id === activeBooking.id ? updatedBooking : item));
      addLog('notify-accept', `[ПІДТВЕРДЖЕННЯ]\nКому: ${activeBooking.email}\nКому: horovod.info@gmail.com\nБронювання для "${activeBooking.userName}" (тип: ${activeBooking.type}) на ${activeBooking.date} о ${activeBooking.startTime}-${activeBooking.endTime} ПІДТВЕРДЖЕНО.`, 'approved', 'Підтверджено', `Запит від <strong>${activeBooking.userName}</strong> (тип: ${activeBooking.type}) на <strong>${activeBooking.date}</strong> о <strong>${activeBooking.startTime}-${activeBooking.endTime}</strong> підтверджено.`, activeBooking.id);
      await saveData('logs_only');
      const { success } = await updateBookingStatusInDB(updatedBooking);
      if (!success) {
          setBookings(prev => prev.map(item => item.id === activeBooking.id ? { ...activeBooking, status: prevStatus } : item));
          showToast('Помилка збереження. Перевірте з\'єднання та спробуйте ще раз.', 'error');
          return;
      }
      localStorage.setItem('rehearsal_bookings_horovod_hub_auth', JSON.stringify(bookings.map(item => item.id === activeBooking.id ? updatedBooking : item)));
      closeModal('event');
      showToast(`Бронювання для ${activeBooking.userName} підтверджено!`, 'success');
  };

  const handleReject = async () => {
      if (!activeBooking) return;
      const prevStatus = activeBooking.status;
      const updatedBooking = { ...activeBooking, status: 'rejected' };
      setBookings(prev => prev.map(item => item.id === activeBooking.id ? updatedBooking : item));
      addLog('notify-reject', `[ВІДХИЛЕНО]\nКому: ${activeBooking.email}\nКому: horovod.info@gmail.com\nЗапит від "${activeBooking.userName}" (тип: ${activeBooking.type}) на ${activeBooking.date} о ${activeBooking.startTime}-${activeBooking.endTime} ВІДХИЛЕНО.`, 'rejected', 'Відхилено', `Запит від <strong>${activeBooking.userName}</strong> (тип: ${activeBooking.type}) на <strong>${activeBooking.date}</strong> о <strong>${activeBooking.startTime}-${activeBooking.endTime}</strong> відхилено.`, activeBooking.id);
      await saveData('logs_only');
      const { success } = await updateBookingStatusInDB(updatedBooking);
      if (!success) {
          setBookings(prev => prev.map(item => item.id === activeBooking.id ? { ...activeBooking, status: prevStatus } : item));
          showToast('Помилка збереження. Перевірте з\'єднання та спробуйте ще раз.', 'error');
          return;
      }
      localStorage.setItem('rehearsal_bookings_horovod_hub_auth', JSON.stringify(bookings.map(item => item.id === activeBooking.id ? updatedBooking : item)));
      closeModal('event');
      showToast(`Бронювання для ${activeBooking.userName} відхилено.`, 'warning');
  };

  const handleWithdraw = async () => {
      if (!activeBooking) return;
      const prevStatus = activeBooking.status;
      const updatedBooking = { ...activeBooking, status: 'cancelled', cancelReason: 'Відкликано клієнтом до підтвердження' };
      setBookings(prev => prev.map(item => item.id === activeBooking.id ? updatedBooking : item));
      addLog('cancel', `[ВІДКЛИКАНО]\nКому: ${activeBooking.email}\nКому: horovod.info@gmail.com\nЗапит від "${activeBooking.userName}" (тип: ${activeBooking.type}) на ${activeBooking.date} о ${activeBooking.startTime}-${activeBooking.endTime} відкликано клієнтом.`, 'cancelled', 'Відкликано', `Запит від <strong>${activeBooking.userName}</strong> (тип: ${activeBooking.type}) на <strong>${activeBooking.date}</strong> о <strong>${activeBooking.startTime}-${activeBooking.endTime}</strong> відкликано.`, activeBooking.id);
      await saveData('logs_only');
      const { success } = await updateBookingStatusInDB(updatedBooking);
      if (!success) {
          setBookings(prev => prev.map(item => item.id === activeBooking.id ? { ...activeBooking, status: prevStatus } : item));
          showToast('Помилка збереження. Перевірте з\'єднання та спробуйте ще раз.', 'error');
          return;
      }
      localStorage.setItem('rehearsal_bookings_horovod_hub_auth', JSON.stringify(bookings.map(item => item.id === activeBooking.id ? updatedBooking : item)));
      closeModal('event');
      showToast(`Запит на бронювання для ${activeBooking.userName} відкликано.`, 'success');
  };

  const handleCancel = async (role) => {
      if (!activeBooking) return;
      const reason = prompt("Вкажіть причину скасування:");
      if (!reason) return;

      const prevStatus = activeBooking.status;
      const updatedBooking = { ...activeBooking, status: 'cancelled', cancelReason: reason, cancelledBy: role };
      setBookings(prev => prev.map(item => item.id === activeBooking.id ? updatedBooking : item));

      if (role === 'client') {
          addLog('notify-reject', `[СКАСОВАНО РЕЗИДЕНТОМ]\nКому: horovod.info@gmail.com\nРезидент "${activeBooking.userName}" скасував бронювання на ${activeBooking.date} (${activeBooking.startTime}-${activeBooking.endTime}).\nПричина: "${reason}"`, 'cancelled', 'Скасовано', `Резидент <strong>${activeBooking.userName}</strong> скасував бронювання на <strong>${activeBooking.date}</strong> о <strong>${activeBooking.startTime}-${activeBooking.endTime}</strong>.<br>Причина: <em>"${reason}"</em>`, activeBooking.id);
      } else {
          addLog('notify-reject', `[СКАСОВАНО ОРГАНІЗАТОРОМ]\nКому: ${activeBooking.email}\nОрганізатори скасували ваше бронювання на ${activeBooking.date} (${activeBooking.startTime}-${activeBooking.endTime}).\nПричина: "${reason}"`, 'cancelled', 'Скасовано', `Організатори скасували бронювання для <strong>${activeBooking.userName}</strong> на <strong>${activeBooking.date}</strong> о <strong>${activeBooking.startTime}-${activeBooking.endTime}</strong>.<br>Причина: <em>"${reason}"</em>`, activeBooking.id);
      }

      await saveData('logs_only');
      const { success } = await updateBookingStatusInDB(updatedBooking);
      if (!success) {
          setBookings(prev => prev.map(item => item.id === activeBooking.id ? { ...activeBooking, status: prevStatus } : item));
          showToast('Помилка збереження. Перевірте з\'єднання та спробуйте ще раз.', 'error');
          return;
      }
      localStorage.setItem('rehearsal_bookings_horovod_hub_auth', JSON.stringify(bookings.map(item => item.id === activeBooking.id ? updatedBooking : item)));
      closeModal('event');
      showToast('Бронювання успішно скасовано.', 'success');
  };

  // 2. Issue Submit

  const handleIssueSubmit = (e) => {
      e.preventDefault();

      const newIssue = {
          id: 'issue_' + Date.now(),
          title: issueData.title,
          category: issueData.category,
          description: issueData.description,
          reportedBy: userEmail || 'Гість',
          reportedAt: new Date().toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }),
          resolved: false
      };

      setIssues(prev => {
          const next = [...prev, newIssue];
          localStorage.setItem('rehearsal_issues_horovod_hub_auth', JSON.stringify(next));
          return next;
      });

      api.issues.insert(newIssue).then(({ error }) => {
          if (error) console.warn('API issue insert failed:', error);
      }).catch(err => console.warn('API issue insert exception:', err));

      const categoryLabels = { sound: 'Звук', instruments: 'Апаратура', cables: 'Кабелі', other: 'Інше' };
      const catLabel = categoryLabels[issueData.category] || issueData.category;
      addLog(
          'issue-reported',
          `Кому: horovod.info@gmail.com\n[НЕПОЛАДКА] ${issueData.title}: ${issueData.description}`,
          'rejected',
          'Неполадка',
          `Повідомлено про несправність: [${catLabel.toUpperCase()}] <strong>"${issueData.title}"</strong> (${issueData.description}) від <strong>${userEmail || 'Гість'}</strong>.`,
          newIssue.id
      );

      showToast('Повідомлення про несправність надіслано.', 'success');
      setIssueData({ title: '', category: 'sound', description: '' });
      closeModal('issue');
  };

  // 3. Login Flow
  const handleLogin = async (e) => {
      e.preventDefault();
      const em = loginData.email.toLowerCase().trim();

      if (em === 'horovod.info@gmail.com') {
          if (loginData.step === 1) {
              setLoginData(p => ({ ...p, step: 2 }));
          } else {
              // Admin login logic (hardcoded fallback + api check)
              let authSuccess = false;
              try {
                  const { data, error } = await api.auth.signInWithPassword({ email: em, password: loginData.password });
                  if (!error && data.user) authSuccess = true;
              } catch (err) {}

              if (authSuccess || loginData.password === '21admin02') {
                  localStorage.setItem('user_logged_in', 'true');
                  localStorage.setItem('admin_logged_in', 'true');
                  localStorage.setItem('user_email', em);
                  setIsLoggedIn(true);
                  setUserEmail(em);
                  setIsAdminUser(true);
                  closeModal('login');
                  showToast('Вхід виконано як адміністратор!', 'success');
                  setLoginData({ email: '', password: '', step: 1 });
              } else {
                  showToast('Невірний пароль адміністратора!', 'error');
              }
          }
      } else {
          // Resident login flow
          if (loginData.step === 1) {
              // Stage 1: Send OTP
              try {
                  const { error } = await api.auth.signInWithOtp({ email: em });
                  if (error) {
                      showToast('Помилка відправки коду: ' + error.message, 'error');
                      return;
                  }
                  setLoginData(p => ({ ...p, step: 2 }));
                  showToast('Код підтвердження надіслано на вашу пошту!', 'success');
              } catch (err) {
                  showToast('Помилка відправки коду.', 'error');
              }
          } else {
              // Stage 2: Verify OTP
              let authSuccess = false;
              try {
                  const { data, error } = await api.auth.verifyOtp({ email: em, token: loginData.password, type: 'email' });
                  if (!error && data.session) {
                      authSuccess = true;
                  } else if (loginData.password === '0000' || loginData.password === '1234') { // local dev bypass
                      authSuccess = true;
                  } else {
                      showToast('Невірний код підтвердження!', 'error');
                      return;
                  }
              } catch (err) {
                  if (loginData.password === '0000' || loginData.password === '1234') {
                      authSuccess = true;
                  } else {
                      showToast('Помилка підтвердження коду.', 'error');
                      return;
                  }
              }

              if (authSuccess) {
                  localStorage.setItem('user_logged_in', 'true');
                  localStorage.setItem('admin_logged_in', 'false');
                  localStorage.setItem('user_email', em);
                  setIsLoggedIn(true);
                  setUserEmail(em);
                  setIsAdminUser(false);
                  closeModal('login');
                  showToast('Вхід виконано успішно!', 'success');
                  setLoginData({ email: '', password: '', step: 1 });
              }
          }
      }
  };

  return (
    <>
      {/* EVENT MODAL */}
      <div className={`modal-overlay ${modals.event ? 'active' : ''}`} id="event-modal">
        {activeBooking && (
        <div className="modal-content" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
          <button className="modal-close" onClick={() => closeModal('event')}>&times;</button>
          <div className="modal-header">
            <h3 id="modal-band-name" style={{ fontSize: '1.5rem', color: 'var(--text-primary)' }}>{activeBooking.userName}</h3>
            <span className={`badge ${activeBooking.status}`} id="modal-status-badge">{activeBooking.status}</span>
          </div>
          <div className="modal-detail-row">
            <div className="modal-detail-label">Тип активності</div>
            <div className="modal-detail-value" id="modal-type-badge" style={{ fontWeight: 600 }}>{activeBooking.type}</div>
          </div>
          <div className="modal-detail-row">
            <div className="modal-detail-label">Час бронювання</div>
            <div className="modal-detail-value" id="modal-time">{activeBooking.date} @ {activeBooking.startTime} - {activeBooking.endTime}</div>
          </div>
          <div className="modal-detail-row">
            <div className="modal-detail-label">Контакт резидентки(-а)</div>
            <div className="modal-detail-value" id="modal-contact">{activeBooking.email}</div>
          </div>
          <div className="modal-detail-row">
            <div className="modal-detail-label">Примітки та опис</div>
            <div className="modal-detail-value" id="modal-notes" style={{ fontStyle: 'italic' }}>{activeBooking.notes || 'Немає приміток.'}</div>
          </div>

          {activeBooking.status === 'pending' && isAdminUser && (
              <div id="modal-admin-review-container" style={{ display: 'flex', marginTop: '1.5rem', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                  <button className="btn btn-success" style={{ flex: 1 }} onClick={handleApprove}>
                      <i className="fa-solid fa-check"></i> Підтвердити
                  </button>
                  <button className="btn btn-danger" style={{ flex: 1 }} onClick={handleReject}>
                      <i className="fa-solid fa-xmark"></i> Відхилити
                  </button>
              </div>
          )}

          {activeBooking.status === 'pending' && !isAdminUser && activeBooking.email.toLowerCase().trim() === (userEmail || '').toLowerCase().trim() && (
              <div id="modal-withdraw-container" style={{ display: 'flex', marginTop: '1.5rem', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                  <button className="btn btn-outline" style={{ flex: 1 }} onClick={handleWithdraw}>
                      <i className="fa-solid fa-rotate-left"></i> Відкликати запит
                  </button>
              </div>
          )}

          {activeBooking.status === 'approved' && isAdminUser && (
              <div id="modal-actions-container" style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                  <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => handleCancel('admin')}>
                      <i className="fa-solid fa-ban"></i> Скасувати (Організатор)
                  </button>
              </div>
          )}

          {activeBooking.status === 'approved' && !isAdminUser && activeBooking.email.toLowerCase().trim() === (userEmail || '').toLowerCase().trim() && (
              <div id="modal-actions-container" style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                  <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => handleCancel('client')}>
                      <i className="fa-solid fa-user-xmark"></i> Скасувати (Резидент)
                  </button>
              </div>
          )}
        </div>
        )}
      </div>

      {/* RESOLVE ISSUE MODAL */}
      {isAdminUser && (
      <div className={`modal-overlay ${modals.resolveIssue ? 'active' : ''}`} id="resolve-issue-modal">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
              <button className="modal-close" onClick={() => closeModal('resolveIssue')}>&times;</button>
              <div className="modal-header">
                  <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, textTransform: 'uppercase', marginBottom: '1rem' }}>
                      <i className="fa-solid fa-wrench" style={{ color: 'var(--brand-yellow)' }}></i> Вирішення проблеми
                  </h3>
              </div>
              <form onSubmit={async (e) => {
                  e.preventDefault();

                  const targetIssue = issues?.find(i => i.id === modalData.resolveIssue?.issueId);
                  if (!targetIssue) return;

                  const how = e.target.elements[0].value.trim();
                  const when = e.target.elements[1].value.trim();
                  const msg = e.target.elements[2].value.trim();

                  // Add message to reporter (activity log)
                  addLog('notify-accept', `Кому: ${targetIssue.reportedBy}\n[ВІДПОВІДЬ НА ЗВЕРНЕННЯ] ${msg}`, 'approved', 'Повідомлено', `Звіт від <strong>${targetIssue.reportedBy}</strong> про проблему <strong>"${targetIssue.title}"</strong> прийнято.<br>Відповідь автору звернення:<br><em>${msg.replace(/\n/g, '<br>')}</em>`);

                  // Add to News Feed
                  addNewsItem(`Вирішено проблему: ${targetIssue.title}`, `Роботи: ${how}\nТермін: ${when}\nСтатус: Вирішено & прийнято в роботу admin.`, 'resolved');

                  // Add resolution notice to activity sidebar
                  addLog('issue-resolved', `[ВИРІШЕНО] ${targetIssue.title} відремонтовано`, 'approved', 'Вирішено', `Несправність <strong>"${targetIssue.title}"</strong> успішно усунено: <em>${how}</em>.`);

                  // Remove resolved issue
                  setIssues(prev => {
                      const next = prev.filter(i => i.id !== targetIssue.id);
                      localStorage.setItem('rehearsal_issues_horovod_hub_auth', JSON.stringify(next));
                      return next;
                  });

                  try {
                      await api.issues.delete(targetIssue.id);
                  } catch(err) {}

                  showToast('Ремонт зареєстровано, репортера сповіщено, анонс додано в стрічку.', 'success');
                  closeModal('resolveIssue');
              }}>
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label style={{ color: 'var(--secondary-hover)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Як буде вирішено проблему? *</label>
                      <textarea rows="3" required placeholder="Опишіть план ремонту чи заміни..." style={{ width: '100%', padding: '0.5rem', border: 'var(--border-thin)', fontFamily: 'var(--font-sans)', borderRadius: 'var(--radius-sm)', boxSizing: 'border-box' }}></textarea>
                  </div>
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label style={{ color: 'var(--secondary-hover)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Коли буде вирішено? *</label>
                      <input type="text" required placeholder="Наприклад: сьогодні до 18:00, або субота ранок" style={{ width: '100%', padding: '0.5rem', border: 'var(--border-thin)', fontFamily: 'var(--font-sans)', borderRadius: 'var(--radius-sm)', boxSizing: 'border-box' }} />
                  </div>
                  <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                      <label style={{ color: 'var(--secondary-hover)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Повідомлення репортеру (чернетка) *</label>
                      <textarea rows="3" required style={{ width: '100%', padding: '0.5rem', border: 'var(--border-thin)', fontFamily: 'var(--font-sans)', borderRadius: 'var(--radius-sm)', boxSizing: 'border-box' }} defaultValue="Вітаємо! Дякуємо за звіт..."></textarea>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                      <i className="fa-solid fa-check"></i> Підтвердити вирішення
                  </button>
              </form>
          </div>
      </div>
      )}

      {/* ACTIVITY DETAIL MODAL */}
      <div className={`modal-overlay ${modals.activityDetail ? 'active' : ''}`} id="activity-detail-modal">
        <div className="modal-content" style={{ maxHeight: '90vh', overflowY: 'auto', maxWidth: '480px' }}>
          <button className="modal-close" onClick={() => closeModal('activityDetail')}>&times;</button>
          <div className="modal-header">
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, textTransform: 'uppercase', marginBottom: '0.5rem', fontSize: '1.3rem' }}>Деталі активності</h3>
          </div>
          <div className="modal-body" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
             {/* In a real app we'd fetch the active log via modalData */}
             <div style={{ fontSize: '0.85rem', lineHeight: 1.55, color: 'var(--text-primary)', background: 'var(--bg-primary)', padding: '1.25rem', border: 'var(--border-thin)', borderRadius: 'var(--radius-sm)', whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
                Детальна інформація про лог...
             </div>
          </div>
        </div>
      </div>

      {/* ISSUE MODAL */}
      <div className={`modal-overlay ${modals.issue ? 'active' : ''}`} id="issue-modal">
        <div className="modal-content" style={{ maxWidth: '440px' }}>
          <button className="modal-close" onClick={() => closeModal('issue')}>&times;</button>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, textTransform: 'uppercase', marginBottom: '1.25rem' }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ color: 'var(--brand-red)' }}></i> Повідомити про несправність
          </h3>
          <form id="issue-form" onSubmit={handleIssueSubmit}>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor="issue-title">Що зламалося / несправне? *</label>
              <input type="text" id="issue-title" required placeholder="Наприклад: Гітарний комбік Fender" value={issueData.title} onChange={e => setIssueData(p => ({...p, title: e.target.value}))}/>
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label htmlFor="issue-category">Категорія несправності *</label>
              <select id="issue-category" required style={{ width: '100%', height: '42px', padding: '0.5rem', border: 'var(--border-thin)', fontFamily: 'var(--font-sans)', borderRadius: 'var(--radius-sm)' }} value={issueData.category} onChange={e => setIssueData(p => ({...p, category: e.target.value}))}>
                <option value="sound">Звук / Мікрофони</option>
                <option value="instruments">Інструменти / Апаратура</option>
                <option value="cables">Комутація / Кабелі</option>
                <option value="other">Інше</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label htmlFor="issue-description">Детальний опис проблеми *</label>
              <textarea id="issue-description" required rows="3" placeholder="Опишіть несправність детальніше (наприклад: рипить лівий канал, тріщить кабель)..." style={{ width: '100%', padding: '0.5rem', border: 'var(--border-thin)', fontFamily: 'var(--font-sans)', borderRadius: 'var(--radius-sm)', boxSizing: 'border-box' }} value={issueData.description} onChange={e => setIssueData(p => ({...p, description: e.target.value}))}></textarea>
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              <i className="fa-solid fa-paper-plane"></i> Надіслати звіт
            </button>
          </form>
        </div>
      </div>

      {/* LOGIN MODAL (Simplified mock) */}
      <div className={`modal-overlay ${modals.login ? 'active' : ''}`} id="login-modal">
        <div className="modal-content login-modal-content">
            <button className="modal-close" onClick={() => closeModal('login')}>&times;</button>
            <div className="modal-header" style={{ borderBottom: 'none', marginBottom: '1.25rem', paddingBottom: 0, textAlign: 'center' }}>
                <h3 style={{ fontSize: '1.45rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.02em', fontFamily: 'var(--font-display)' }}>Вхід у HOROVOD HUB</h3>
            </div>

            <form onSubmit={handleLogin}>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>Ваш Email *</label>
                    <input type="email" required placeholder="наприклад: resident@gmail.com" value={loginData.email} onChange={e => setLoginData(p => ({...p, email: e.target.value}))} />
                </div>
                {loginData.step === 2 && (
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label>{loginData.email.toLowerCase().trim() === 'horovod.info@gmail.com' ? 'Пароль адміністратора *' : 'Код підтвердження з пошти *'}</label>
                        <input type={loginData.email.toLowerCase().trim() === 'horovod.info@gmail.com' ? 'password' : 'text'} required placeholder={loginData.email.toLowerCase().trim() === 'horovod.info@gmail.com' ? 'Введіть пароль адміна' : 'Введіть код'} value={loginData.password} onChange={e => setLoginData(p => ({...p, password: e.target.value}))} />
                    </div>
                )}
                <button type="submit" className="btn btn-primary btn-login-submit" style={{ width: '100%', marginTop: '0.5rem' }}>{loginData.step === 1 && loginData.email.toLowerCase().trim() !== 'horovod.info@gmail.com' ? 'Надіслати код' : 'Увійти'}</button>
            </form>

            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Або увійдіть за допомогою</p>
                <button
                    type="button"
                    className="btn btn-outline"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                    onClick={async () => {
                        const redirectUri = window.location.origin + '/auth/google';
                        const res = await api.auth.getGoogleAuthUrl({ redirectUri });
                        if (res.data && res.data.url) {
                            window.location.href = res.data.url;
                        } else {
                            showToast('Помилка при отриманні посилання Google.', 'error');
                        }
                    }}
                >
                    <i className="fa-brands fa-google" style={{ color: '#DB4437' }}></i> Login with Google
                </button>
            </div>
        </div>
      </div>

    </>
  );
};

export default Modals;
