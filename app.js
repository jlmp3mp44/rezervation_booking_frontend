// --- CLOUD CONFIGURATION VARIABLES ---
const SUPABASE_URL = 'https://kcelkkfaeysdreukrlqg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-UJ-XhppKqSQZnxNOMKCnQ_s7Y5V1ut';

// State Management
let bookings = [];
let logs = [];
let currentWeekStartDate = null;
let activeModalBookingId = null;
let cancellationRole = 'client';

// Cloud Services
let supabaseClient = null;
let isSupabaseEnabled = false;

function initCloudServices() {
  // If running in automated tests (Selenium/ChromeDriver), disable Cloud Services
  // to avoid polluting the database and sending test emails.
  if (navigator.webdriver) {
    console.log('Automated test environment detected. Disabling Supabase connectivity.');
    return;
  }

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        isSupabaseEnabled = true;
        console.log('Supabase initialized.');
      }
    } catch (err) { console.error('Supabase init error:', err); }
  }
}

// Ukrainian localisation
const monthNamesUk = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const monthNamesShortUk = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'];
const dayNamesUk = ['Нд','Пн','Вт','Ср','Чт','Пт','Сб'];
const dayNamesFullUk = ['Неділя','Понеділок','Вівторок','Середа','Четвер','П\'ятниця','Субота'];

function isExclusiveType(type) {
  return type === 'репетиція' || type === 'заниматися самому';
}

function getConcurrentBookingCount(dayStr, halfHour, ignoreId = null) {
  return bookings.filter(b => {
    if (b.status !== 'approved' && b.status !== 'pending') return false;
    if (b.date !== dayStr) return false;
    if (b.id === ignoreId) return false;
    const startDec = timeToDecimal(b.startTime);
    const endDec = timeToDecimal(b.endTime);
    return halfHour >= startDec && halfHour < endDec;
  }).length;
}

function isSlotUnavailable(dayStr, halfHour, isAdminUser) {
  const todayStr = getLocalDateString(new Date());
  const nowHour = new Date().getHours();
  const nowMinute = new Date().getMinutes();
  const nowDecimal = nowHour + nowMinute / 60;
  
  // Past check
  if (dayStr < todayStr) {
    return true;
  }
  if (dayStr === todayStr) {
    if (isAdminUser) {
      return halfHour < nowDecimal; // admin can book today, but only future/unstarted slots
    } else {
      // Resident: cannot book today at all
      return true;
    }
  }
  
  // A slot is only unavailable if it reaches maximum concurrency limit (>= 2 concurrent bookings)
  return getConcurrentBookingCount(dayStr, halfHour) >= 2;
}

function isSlotPast(dayStr, halfHour, isAdminUser) {
  const todayStr = getLocalDateString(new Date());
  const nowHour = new Date().getHours();
  const nowMinute = new Date().getMinutes();
  const nowDecimal = nowHour + nowMinute / 60;
  
  if (dayStr < todayStr) {
    return true;
  }
  if (dayStr === todayStr) {
    if (isAdminUser) {
      return halfHour < nowDecimal;
    } else {
      return true;
    }
  }
  return false;
}
window.isSlotPast = isSlotPast;

function getLocalDateString(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getOffsetDateString(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return getLocalDateString(d);
}

function timeToDecimal(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h + (m / 60);
}

function formatHumanDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${dayNamesFullUk[d.getDay()]}, ${d.getDate()} ${monthNamesShortUk[d.getMonth()]}`;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconHtml = '<i class="fa-solid fa-circle-info"></i>';
  let iconBg = 'var(--brand-blue-light)';
  if (type === 'success') {
    iconHtml = '<i class="fa-solid fa-check"></i>';
    iconBg = 'var(--brand-green)';
  } else if (type === 'error') {
    iconHtml = '<i class="fa-solid fa-xmark"></i>';
    iconBg = 'var(--brand-red)';
  } else if (type === 'warning') {
    iconHtml = '<i class="fa-solid fa-triangle-exclamation"></i>';
    iconBg = 'var(--brand-orange)';
  }

  const iconContainer = `<div style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 2px solid #222222; background: ${iconBg}; box-shadow: 2px 2px 0px #222222; font-size: 0.9rem; color: #222222; flex-shrink: 0;">${iconHtml}</div>`;
  
  toast.innerHTML = `${iconContainer} <span class="toast-message" style="font-family: var(--font-sans); font-weight: 700;">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove());
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 500);
  }, 4000);
}
window.showToast = showToast;

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(date.setDate(diff));
  mon.setHours(0, 0, 0, 0);
  return mon;
}

// ── App Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => { initApp(); });

async function initApp() {
  initCloudServices();

  // Wipe old test data once to clear previous test state
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

  const storedBookings = localStorage.getItem('rehearsal_bookings_horovod_hub_auth');
  const storedLogs     = localStorage.getItem('rehearsal_logs_horovod_hub_auth');

  if (isSupabaseEnabled) {
    try {
      const { data, error } = await supabaseClient.from('bookings').select('*');
      if (error) throw error;
      if (data) {
        bookings = data;
        localStorage.setItem('rehearsal_bookings_horovod_hub_auth', JSON.stringify(bookings));
      }
    } catch (err) {
      console.error('Supabase load failed, using localStorage:', err);
      if (storedBookings) bookings = JSON.parse(storedBookings);
    }
  } else {
    if (storedBookings) {
      bookings = JSON.parse(storedBookings);
    } else {
      bookings = [];
      localStorage.setItem('rehearsal_bookings_horovod_hub_auth', JSON.stringify(bookings));
    }
  }

  // Load logs from Supabase with LocalStorage fallback
  if (isSupabaseEnabled) {
    try {
      const { data: logData, error: logError } = await supabaseClient.from('logs').select('*').order('timestamp', { ascending: false }).limit(50);
      if (!logError && logData) {
        logs = logData;
        localStorage.setItem('rehearsal_logs_horovod_hub_auth', JSON.stringify(logs));
      } else {
        throw logError || new Error('No log data');
      }
    } catch (err) {
      console.warn('Supabase logs load failed, using localStorage:', err);
      if (storedLogs) logs = JSON.parse(storedLogs);
      else logs = [];
    }
  } else {
    if (storedLogs) logs = JSON.parse(storedLogs);
    else logs = [];
  }

  rebuildLogsFromBookings();

  // Auto-expire pending bookings whose slot has already passed
  const expiredPending = bookings.filter(b => b.status === 'pending' && isBookingInPast(b));
  for (const b of expiredPending) {
    b.status = 'rejected';
    b.cancelReason = 'Термін дії запиту минув — слот вже в минулому.';
    addLog('notify-reject', `[АВТОВІДХИЛЕННЯ]\nЗапит від "${b.userName}" на ${b.date} о ${b.startTime}-${b.endTime} автоматично відхилено — час минув.`, 'rejected', 'Термін минув', `Запит від <strong>${b.userName}</strong> на <strong>${formatHumanDate(b.date)}</strong> о <strong>${b.startTime}-${b.endTime}</strong> автоматично відхилено — час минув.`, b.id);
    saveData(b);
  }

  currentWeekStartDate = getMonday(new Date());

  // Load issues from Supabase with LocalStorage fallback
  if (isSupabaseEnabled) {
    try {
      const { data: issueData, error: issueError } = await supabaseClient.from('issues').select('*');
      if (!issueError && issueData) {
        issues = issueData;
        localStorage.setItem('rehearsal_issues_horovod_hub_auth', JSON.stringify(issues));
      } else {
        throw issueError || new Error('No issue data');
      }
    } catch (err) {
      console.warn('Supabase issues load failed, using localStorage:', err);
      initIssues();
    }
  } else {
    initIssues();
  }
  
  const bDateInput = document.getElementById('booking-date');
  if (bDateInput) {
    bDateInput.addEventListener('change', () => {
      populateTimeDropdowns();
    });
  }

  renderNewsFeed();

  let isLoggedIn = localStorage.getItem('user_logged_in') === 'true';
  let userEmail = localStorage.getItem('user_email');

  if (isSupabaseEnabled) {
    try {
      const { data } = await supabaseClient.auth.getSession();
      if (data && data.session && data.session.user) {
        isLoggedIn = true;
        userEmail = data.session.user.email;
        localStorage.setItem('user_logged_in', 'true');
        localStorage.setItem('user_email', userEmail);
        localStorage.setItem('admin_logged_in', userEmail === 'horovod.info@gmail.com' ? 'true' : 'false');
      } else {
        // No Supabase session — but admin uses hardcoded password (no Supabase session ever).
        // Trust localStorage for admin; clear it only for regular residents whose OTP session expired.
        const savedAdmin = localStorage.getItem('admin_logged_in') === 'true';
        if (!savedAdmin) {
          isLoggedIn = false;
          userEmail = null;
        }
        // If admin: isLoggedIn and userEmail already set from localStorage above — keep them.
      }
    } catch (err) { console.error('Supabase session recovery error:', err); }
  }

  const navLoginBtn = document.getElementById('nav-login-btn');

  if (isLoggedIn && userEmail) {
    onUserLoginSuccess(userEmail);
    if (navLoginBtn) navLoginBtn.style.display = 'none';
  } else {
    localStorage.removeItem('user_logged_in');
    localStorage.removeItem('admin_logged_in');
    localStorage.removeItem('user_email');
    if (navLoginBtn) navLoginBtn.style.display = 'inline-flex';
    renderWeeklyCalendar();
    renderLogs();
    renderIssues();
    openLoginModal();
  }

  updateTimelineMarker();
  setInterval(updateTimelineMarker, 60000);

  const bookingOverlay = document.getElementById('booking-modal-overlay');
  if (bookingOverlay) {
    bookingOverlay.addEventListener('click', (e) => {
      if (e.target.id === 'booking-modal-overlay') {
        if (window.lastModalOpenTime && Date.now() - window.lastModalOpenTime < 150) {
          return;
        }
        closeBookingModal();
      }
    });
  }

  // Setup Supabase Realtime listeners for cross-session sync
  if (isSupabaseEnabled) {
    try {
      supabaseClient
        .channel('realtime-db-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, async (payload) => {
          try {
            const { data, error } = await supabaseClient.from('bookings').select('*');
            if (!error && data) {
              const isAdm = localStorage.getItem('admin_logged_in') === 'true';
              if (payload && payload.eventType === 'INSERT') {
                const newB = payload.new;
                if (newB && newB.status === 'pending') {
                  if (isAdm) {
                    showToast(`Новий запит від "${newB.userName}" (тип: ${newB.type}) на ${formatHumanDate(newB.date)} о ${newB.startTime}-${newB.endTime}!`, 'info');
                    
                    const drawer = document.getElementById('sidebar-drawer');
                    if (drawer && !drawer.classList.contains('open')) {
                      const badge = document.getElementById('feed-unread-badge');
                      if (badge) {
                        const current = parseInt(badge.textContent || '0', 10);
                        badge.textContent = current + 1;
                        badge.style.display = 'flex';
                      }
                      const bellBtn = document.getElementById('toggle-sidebar-btn');
                      if (bellBtn) {
                        bellBtn.classList.remove('wiggle');
                        void bellBtn.offsetWidth;
                        bellBtn.classList.add('wiggle');
                      }
                    }
                  }
                }
              } else if (payload && payload.eventType === 'UPDATE') {
                const oldB = payload.old;
                const newB = payload.new;
                if (oldB && newB && oldB.status !== newB.status) {
                  if (newB.status === 'cancelled') {
                    showToast(`Бронювання для "${newB.userName}" на ${formatHumanDate(newB.date)} скасовано!`, 'warning');
                  }
                }
              }

              bookings = data;
              localStorage.setItem('rehearsal_bookings_horovod_hub_auth', JSON.stringify(bookings));
              rebuildLogsFromBookings();
              renderWeeklyCalendar();
              renderAdminRequests();
              renderUserCabinet();
              updatePendingBadge();
              renderLogs();
            }
          } catch (err) { console.error('Realtime bookings sync error:', err); }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'issues' }, async () => {
          try {
            const { data, error } = await supabaseClient.from('issues').select('*');
            if (!error && data) {
              issues = data;
              localStorage.setItem('rehearsal_issues_horovod_hub_auth', JSON.stringify(issues));
              renderIssues();
            }
          } catch (err) { console.error('Realtime issues sync error:', err); }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs' }, async (payload) => {
          try {
            const newLog = payload.new;
            // Avoid duplicates: check if this log ID is already in the list
            if (newLog && !logs.find(l => l.id === newLog.id)) {
              logs.unshift(newLog);
              if (logs.length > 50) logs.pop();
              localStorage.setItem('rehearsal_logs_horovod_hub_auth', JSON.stringify(logs));
              renderLogs();

              // Increment unread badge if sidebar is closed
              const drawer = document.getElementById('sidebar-drawer');
              if (drawer && !drawer.classList.contains('open')) {
                const badge = document.getElementById('feed-unread-badge');
                if (badge) {
                  const current = parseInt(badge.textContent || '0', 10);
                  badge.textContent = current + 1;
                  badge.style.display = 'flex';
                }
                const bellBtn = document.getElementById('toggle-sidebar-btn');
                if (bellBtn) {
                  bellBtn.classList.remove('wiggle');
                  void bellBtn.offsetWidth;
                  bellBtn.classList.add('wiggle');
                }
              }
            }
          } catch (err) { console.error('Realtime logs sync error:', err); }
        })
        .subscribe();
    } catch (err) { console.error('Realtime channel setup error:', err); }
  }
}

// ── Login ─────────────────────────────────────────────────────────────────────
window.showLoginEmailField = function(ev) {
  if (ev) ev.preventDefault();
  const emailGrp = document.getElementById('login-email-group');
  const otpGrp = document.getElementById('login-otp-group');
  const changeEmailBtn = document.getElementById('login-change-email-container');
  const submitBtn = document.getElementById('login-submit-btn');
  if (emailGrp) emailGrp.style.display = 'block';
  if (otpGrp) otpGrp.style.display = 'none';
  if (changeEmailBtn) changeEmailBtn.style.display = 'none';
  if (submitBtn) submitBtn.textContent = 'Увійти';
  const otpInput = document.getElementById('login-otp');
  if (otpInput) otpInput.value = '';
};

function openLoginModal() {
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const passwordGrp = document.getElementById('login-password-group');
  if (emailInput) emailInput.value = '';
  if (passwordInput) passwordInput.value = '';
  if (passwordGrp) passwordGrp.style.display = 'none';
  showLoginEmailField();
  const loginModal = document.getElementById('login-modal');
  if (loginModal) loginModal.classList.add('active');
}

window.checkEmailForAdmin = function() {
  const emailVal = document.getElementById('login-email').value.trim().toLowerCase();
  const passwordGroup = document.getElementById('login-password-group');
  if (passwordGroup) {
    if (emailVal === 'horovod.info@gmail.com') {
      passwordGroup.style.display = 'block';
    } else {
      passwordGroup.style.display = 'none';
      const passwordInput = document.getElementById('login-password');
      if (passwordInput) passwordInput.value = '';
    }
  }
};

window.submitLogin = async function() {
  const emailVal = document.getElementById('login-email').value.trim();
  if (!emailVal || !emailVal.includes('@')) {
    showToast('Будь ласка, вкажіть коректну email адресу.', 'error');
    return;
  }
  const emailLower = emailVal.toLowerCase();

  // 1. Admin Login
  if (emailLower === 'horovod.info@gmail.com') {
    const pw = document.getElementById('login-password').value;
    let authSuccess = false;
    if (isSupabaseEnabled) {
      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email: emailLower, password: pw });
        if (!error && data.user) {
          authSuccess = true;
        }
      } catch (err) { console.error('Supabase admin login error:', err); }
    }
    // Fallback for offline/local testing
    if (authSuccess || pw === '21admin02') {
      localStorage.setItem('user_logged_in', 'true');
      localStorage.setItem('admin_logged_in', 'true');
      localStorage.setItem('user_email', 'horovod.info@gmail.com');
      document.getElementById('login-modal').classList.remove('active');
      onUserLoginSuccess('horovod.info@gmail.com');
      showToast('Вхід виконано як адміністратор!', 'success');
    } else {
      showToast('Невірний пароль адміністратора!', 'error');
    }
    return;
  }

  // 2. Resident Login
  const otpGroup = document.getElementById('login-otp-group');
  if (otpGroup && otpGroup.style.display === 'block') {
    // Stage 2: Verify OTP code
    const otpVal = document.getElementById('login-otp').value.trim();
    if (otpVal.length < 4) {
      showToast('Будь ласка, вкажіть код підтвердження.', 'error');
      return;
    }
    let authSuccess = false;
    let userEmail = window.loginPendingEmail || emailLower;

    if (isSupabaseEnabled) {
      try {
        const { data, error } = await supabaseClient.auth.verifyOtp({
          email: userEmail,
          token: otpVal,
          type: 'email'
        });
        if (!error && data.session) {
          authSuccess = true;
        } else {
          // Check if using local developer bypass codes
          if (otpVal === '0000' || otpVal === '1234') {
            authSuccess = true;
          } else {
            showToast('Невірний код підтвердження!', 'error');
            return;
          }
        }
      } catch (err) {
        console.error('Supabase OTP verification error:', err);
        if (otpVal === '0000' || otpVal === '1234') {
          authSuccess = true;
        } else {
          showToast('Помилка підтвердження коду.', 'error');
          return;
        }
      }
    } else {
      // Local/offline test mode: auto-accept
      authSuccess = true;
    }

    if (authSuccess) {
      localStorage.setItem('user_logged_in', 'true');
      localStorage.setItem('admin_logged_in', 'false');
      localStorage.setItem('user_email', userEmail);
      document.getElementById('login-modal').classList.remove('active');
      onUserLoginSuccess(userEmail);
      showToast('Вхід виконано успішно!', 'success');
    }
  } else {
    // Stage 1: Send OTP
    if (isSupabaseEnabled) {
      try {
        const submitBtn = document.getElementById('login-submit-btn');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Надсилаємо код...';
        }

        const { error } = await supabaseClient.auth.signInWithOtp({ email: emailLower });
        if (submitBtn) {
          submitBtn.disabled = false;
        }

        if (error) {
          showToast('Помилка відправки коду: ' + error.message, 'error');
          if (submitBtn) submitBtn.textContent = 'Увійти';
          return;
        }

        window.loginPendingEmail = emailLower;
        const emailGrp = document.getElementById('login-email-group');
        const changeEmailBtn = document.getElementById('login-change-email-container');
        if (emailGrp) emailGrp.style.display = 'none';
        if (otpGroup) otpGroup.style.display = 'block';
        if (changeEmailBtn) changeEmailBtn.style.display = 'block';
        if (submitBtn) submitBtn.textContent = 'Підтвердити код';
        showToast('Код підтвердження надіслано на вашу пошту!', 'success');
      } catch (err) {
        console.error('Supabase OTP send error:', err);
        showToast('Помилка відправки коду.', 'error');
        const submitBtn = document.getElementById('login-submit-btn');
        if (submitBtn) submitBtn.textContent = 'Увійти';
      }
    } else {
      // Offline / Test environment: bypass and log in immediately
      localStorage.setItem('user_logged_in', 'true');
      localStorage.setItem('admin_logged_in', 'false');
      localStorage.setItem('user_email', emailVal);
      document.getElementById('login-modal').classList.remove('active');
      onUserLoginSuccess(emailVal);
      showToast('Вхід виконано успішно (Локальний режим)!', 'success');
    }
  }
};

function onUserLoginSuccess(email) {
  document.getElementById('user-profile-nav').style.display = 'flex';
  document.getElementById('user-email-display').textContent = email;
  const navLoginBtn = document.getElementById('nav-login-btn');
  if (navLoginBtn) navLoginBtn.style.display = 'none';

  const isAdmin = localStorage.getItem('admin_logged_in') === 'true';
  document.getElementById('nav-admin').style.display = isAdmin ? 'flex' : 'none';

  // Dynamically shift navigation links in header
  const navLinks = document.getElementById('header-nav-links');
  if (navLinks) {
    navLinks.style.marginLeft = isAdmin ? '2rem' : 'auto';
    navLinks.style.marginRight = isAdmin ? '' : '2rem';
  }
  
  // Show admin issues card vs resident active issues
  const adminIssuesCard = document.getElementById('admin-issues-card');
  if (adminIssuesCard) adminIssuesCard.style.display = isAdmin ? 'block' : 'none';

  document.getElementById('contact-email').value = email;

  // Default date configuration (residents tomorrow, admin today)
  const defaultDate = isAdmin ? getOffsetDateString(0) : getOffsetDateString(1);
  document.getElementById('booking-date').value = defaultDate;
  document.getElementById('booking-date').removeAttribute('min');

  populateTimeDropdowns();

  // Update form subtitle
  const subtitleEl = document.getElementById('booking-form-subtitle');
  if (subtitleEl) {
    if (isAdmin) {
      subtitleEl.className = 'admin-banner';
      subtitleEl.innerHTML = '<i class="fa-solid fa-shield-halved" style="color: var(--brand-orange); font-size: 1.5rem; flex-shrink: 0;"></i> <div><strong>Режим адміністратора:</strong> Можна бронювати сьогодні у будь-який час (крім уже розпочатих слотів) та перевизначати будь-які слоти.</div>';
    } else {
      subtitleEl.className = 'subtitle';
      subtitleEl.textContent = 'Спрощена форма бронювання для спільноти ХОРОВОД. Бронювання доступне лише починаючи з завтрашнього дня.';
    }
  }

  updatePendingBadge();
  renderLogs();
  renderAdminRequests();
  renderWeeklyCalendar();
  renderUserCabinet();
  renderIssues();
}

window.userLogout = async function() {
  if (isSupabaseEnabled) {
    try {
      await supabaseClient.auth.signOut();
    } catch (err) { console.error('Supabase signOut error:', err); }
  }
  localStorage.removeItem('user_logged_in');
  localStorage.removeItem('admin_logged_in');
  localStorage.removeItem('user_email');
  document.getElementById('user-profile-nav').style.display = 'none';
  document.getElementById('nav-admin').style.display = 'none';
  const navLoginBtn = document.getElementById('nav-login-btn');
  if (navLoginBtn) navLoginBtn.style.display = 'inline-flex';

  const navLinks = document.getElementById('header-nav-links');
  if (navLinks) {
    navLinks.style.marginLeft = '2rem';
    navLinks.style.marginRight = '';
  }
  
  const qbCheckbox = document.getElementById('quick-book-enable');
  if (qbCheckbox) qbCheckbox.checked = false;

  renderWeeklyCalendar();
  renderLogs();
  renderIssues();
  showToast('Ви вийшли з кабінету.', 'warning');
  openLoginModal();
};

// ── User Cabinet ──────────────────────────────────────────────────────────────
function renderUserCabinet() {
  const cabinetCard = document.getElementById('user-cabinet-card');
  const container   = document.getElementById('user-bookings-list');
  const userEmail   = localStorage.getItem('user_email');

  if (!userEmail) { cabinetCard.style.display = 'none'; return; }

  cabinetCard.style.display = 'block';
  document.getElementById('cabinet-user-email').textContent = `Логін: ${userEmail}`;
  container.innerHTML = '';

  const userBookings = bookings.filter(b => b.email.toLowerCase().trim() === userEmail.toLowerCase().trim());
  if (userBookings.length === 0) {
    container.innerHTML = '<div class="no-requests">Ви ще не створювали запитів на бронювання.</div>';
    return;
  }

  userBookings.forEach(b => {
    const card = document.createElement('div');
    card.className = 'request-card';

    const info = document.createElement('div');
    info.className = 'request-info';

    const statusMap = { pending: 'очікує', approved: 'підтверджено', rejected: 'відхилено', cancelled: 'скасовано' };
    const badge = document.createElement('span');
    badge.className = `badge ${b.status}`;
    badge.textContent = statusMap[b.status] || b.status;

    const headerDiv = document.createElement('div');
    headerDiv.style.cssText = 'display:flex;align-items:center;gap:0.75rem;';
    const title = document.createElement('div');
    title.className = 'request-band';
    title.textContent = `${b.userName} (${capitalize(b.type)})`;
    headerDiv.appendChild(title);
    headerDiv.appendChild(badge);

    const details = document.createElement('div');
    details.className = 'request-details';
    details.innerHTML = `<span><i class="fa-regular fa-calendar"></i> ${formatHumanDate(b.date)}</span><span><i class="fa-regular fa-clock"></i> ${b.startTime} - ${b.endTime}</span>`;

    info.appendChild(headerDiv);
    info.appendChild(details);
    card.appendChild(info);

    if (b.status === 'pending' || b.status === 'approved') {
      const actions = document.createElement('div');
      actions.className = 'request-actions';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-danger';
      cancelBtn.style.cssText = 'padding:0.4rem 0.8rem;font-size:0.75rem;';
      cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Скасувати';
      cancelBtn.onclick = () => { showModal(b.id); openCancelFlow('client'); };
      actions.appendChild(cancelBtn);
      card.appendChild(actions);
    }

    container.appendChild(card);
  });
}

// ── Time helpers ─────────────────────────────────────────────────────────────
function formatTimeDecimal(dec) {
  if (dec >= 24) return '24:00';
  const h = Math.floor(dec);
  const m = Math.round((dec % 1) * 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function populateTimeDropdowns() {
  const startSelect = document.getElementById('start-time');
  if (!startSelect) return;
  startSelect.innerHTML = '';
  
  const startHour = 8; // Restrict all bookings to start no earlier than 08:00
  
  const dateInput = document.getElementById('booking-date');
  const selectedDate = dateInput ? dateInput.value : '';
  const todayStr = getLocalDateString(new Date());
  
  const now = new Date();
  const nowHour = now.getHours();
  const nowMinute = now.getMinutes();
  const nowDecimal = nowHour + nowMinute / 60;
  
  const isAdmin = localStorage.getItem('admin_logged_in') === 'true';
  
  for (let hour = startHour; hour < 24; hour++) {
    ['00', '30'].forEach(min => {
      const val = `${String(hour).padStart(2,'0')}:${min}`;
      const decimalVal = hour + (min === '30' ? 0.5 : 0);
      
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      
      if (selectedDate < todayStr) {
        opt.disabled = true;
      } else if (selectedDate === todayStr) {
        if (isAdmin) {
          if (decimalVal < nowDecimal) {
            opt.disabled = true;
          }
        } else {
          opt.disabled = true;
        }
      }
      
      startSelect.appendChild(opt);
    });
  }
  
  // Set default start-time: 18:00 if not disabled, otherwise first enabled option
  let defaultVal = '18:00';
  const opt18 = Array.from(startSelect.options).find(o => o.value === '18:00');
  if (opt18 && opt18.disabled) {
    const firstEnabled = Array.from(startSelect.options).find(o => !o.disabled);
    if (firstEnabled) {
      defaultVal = firstEnabled.value;
    } else {
      defaultVal = '';
    }
  } else {
    const isValDisabled = opt18 ? opt18.disabled : true;
    if (isValDisabled) {
      const firstEnabled = Array.from(startSelect.options).find(o => !o.disabled);
      defaultVal = firstEnabled ? firstEnabled.value : '';
    }
  }
  startSelect.value = defaultVal;
  updateEndTimeOptions();

  // Render start time chips
  const startChipsContainer = document.getElementById('start-time-chips');
  if (startChipsContainer) {
    startChipsContainer.innerHTML = '';
    Array.from(startSelect.options).forEach(opt => {
      const chip = document.createElement('div');
      chip.className = 'time-chip';
      if (opt.disabled) {
        chip.classList.add('disabled');
      }
      chip.textContent = opt.textContent;
      chip.dataset.val = opt.value;
      if (!opt.disabled) {
        chip.onclick = () => {
          startSelect.value = opt.value;
          updateEndTimeOptions();
        };
      }
      startChipsContainer.appendChild(chip);
    });
  }
}
window.populateTimeDropdowns = populateTimeDropdowns;

function updateEndTimeOptions() {
  const startSelect = document.getElementById('start-time');
  if (!startSelect) return;
  const startVal  = startSelect.value;
  const endSelect = document.getElementById('end-time');
  endSelect.innerHTML = '';
  const [sh, sm]     = startVal.split(':').map(Number);
  const startDec     = sh + sm / 60;
  // Generate in 30-min steps from startDec+0.5 up to 24.0
  for (let dec = startDec + 0.5; dec <= 24; dec += 0.5) {
    const val   = formatTimeDecimal(dec);
    const label = dec === 24 ? '24:00 (Північ)' : val;
    const opt   = document.createElement('option');
    opt.value   = val;
    opt.textContent = label;
    endSelect.appendChild(opt);
  }
  // Default: +1h from start
  const defaultEnd = formatTimeDecimal(Math.min(startDec + 1, 24));
  endSelect.value = defaultEnd;

  // Render end time chips
  const endChipsContainer = document.getElementById('end-time-chips');
  if (endChipsContainer) {
    endChipsContainer.innerHTML = '';
    Array.from(endSelect.options).forEach(opt => {
      const chip = document.createElement('div');
      chip.className = 'time-chip';
      chip.textContent = opt.textContent;
      chip.dataset.val = opt.value;
      chip.onclick = () => {
        endSelect.value = opt.value;
        syncTimeChips();
      };
      endChipsContainer.appendChild(chip);
    });
  }

  // Synchronize both visible chips blocks
  syncTimeChips();
}
window.updateEndTimeOptions = updateEndTimeOptions;

// ── Supabase helpers ──────────────────────────────────────────────────────────
function sanitizeBookingForSupabase(b) {
  return {
    id: b.id, userName: b.userName, email: b.email,
    date: b.date, startTime: b.startTime, endTime: b.endTime,
    type: b.type, notes: b.notes || '',
    status: b.status, submittedAt: b.submittedAt,
    cancelReason: b.cancelReason || null, cancelledBy: b.cancelledBy || null
  };
}

async function updateBookingStatusInDB(b) {
  if (!isSupabaseEnabled) return { success: true };
  try {
    const { data, error } = await supabaseClient.from('bookings')
      .update(sanitizeBookingForSupabase(b))
      .eq('id', b.id)
      .select();
    if (error) { console.error('Supabase update error:', error); return { success: false, error }; }
    // Row didn't exist in Supabase yet (was only in localStorage) — insert it now
    if (!data || data.length === 0) {
      const { error: insErr } = await supabaseClient.from('bookings').insert(sanitizeBookingForSupabase(b));
      if (insErr) { console.error('Supabase insert error:', insErr); return { success: false, error: insErr }; }
    }
    return { success: true };
  } catch (err) { console.error('Supabase update exception:', err); return { success: false, error: err }; }
}

async function saveData(singleBooking) {
  localStorage.setItem('rehearsal_bookings_horovod_hub_auth', JSON.stringify(bookings));
  localStorage.setItem('rehearsal_logs_horovod_hub_auth',    JSON.stringify(logs));
  updatePendingBadge();

  if (singleBooking === 'logs_only') {
    return { success: true };
  }

  if (isSupabaseEnabled) {
    try {
      if (singleBooking) {
        const { error } = await supabaseClient.from('bookings').upsert(sanitizeBookingForSupabase(singleBooking));
        if (error) { console.error('Supabase upsert error:', error); return { success: false, error }; }
      } else {
        const { error } = await supabaseClient.from('bookings').upsert(bookings.map(sanitizeBookingForSupabase));
        if (error) { console.error('Supabase batch upsert error:', error); return { success: false, error }; }
      }
    } catch (err) { console.error('Supabase save exception:', err); return { success: false, error: err }; }
  }
  return { success: true };
}

function updatePendingBadge() {
  const count = bookings.filter(b => b.status === 'pending').length;
  const badge = document.getElementById('pending-badge');
  if (!badge) return;
  if (count > 0) { badge.textContent = count; badge.style.display = 'flex'; }
  else { badge.style.display = 'none'; }
}

// ── Logs ──────────────────────────────────────────────────────────────────────
function addLog(type, message, status = 'info', title = '', body = '', bookingId = null) {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const logEntry = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    time: timestamp,
    type,
    message,
    status,
    title,
    body,
    bookingId
  };
  logs.unshift(logEntry);
  if (logs.length > 50) logs.pop();
  saveData('logs_only');
  renderLogs();

  // Persist to Supabase logs table (fire-and-forget with fallback)
  if (isSupabaseEnabled) {
    supabaseClient.from('logs').insert(logEntry)
      .then(({ error }) => {
        if (error) console.warn('Supabase log insert failed:', error);
      })
      .catch(err => console.warn('Supabase log insert exception:', err));
  }
  
  // Increment unread badge if sidebar drawer is closed
  const drawer = document.getElementById('sidebar-drawer');
  if (drawer && !drawer.classList.contains('open')) {
    const badge = document.getElementById('feed-unread-badge');
    if (badge) {
      const current = parseInt(badge.textContent || '0', 10);
      badge.textContent = current + 1;
      badge.style.display = 'flex';
    }
    
    // Wiggle the bell button
    const bellBtn = document.getElementById('toggle-sidebar-btn');
    if (bellBtn) {
      bellBtn.classList.remove('wiggle');
      void bellBtn.offsetWidth; // force reflow
      bellBtn.classList.add('wiggle');
    }
  }

  if (isSupabaseEnabled || (window.location.hostname === 'localhost' && !navigator.webdriver)) {
    sendActualEmailNotification(type, message);
  }
}

function sendActualEmailNotification(type, message) {
  // Temporarily disabled to save credits and prevent spam
  console.log(`[EMAILS TEMPORARILY DISABLED] Type: ${type}\nMessage:\n${message}`);
  return;
  const lines = message.split('\n');
  const recipients = [];
  let subject = 'Нове сповіщення від HOROVOD HUB';
  if (type === 'notify-accept') {
    if (message.includes('[ВІДПОВІДЬ НА ЗВЕРНЕННЯ]')) {
      subject = 'Відповідь на звернення — HOROVOD HUB';
    } else {
      subject = 'Бронювання ПІДТВЕРДЖЕНО — HOROVOD HUB';
    }
  }
  else if (type === 'notify-reject') subject = 'Оновлення статусу запиту — HOROVOD HUB';
  else if (type === 'notify-admin') {
    if (message.includes('СКАСОВАНО')) subject = 'Скасування бронювання — HOROVOD HUB';
    else if (message.includes('МАСОВИЙ АНОНС')) subject = 'Анонс від ХОРОВОД';
    else subject = 'Новий запит на бронювання — HOROVOD HUB';
  } else if (type === 'issue-reported') {
    subject = '⚠️ УВАГА: НЕПОЛАДКА ОБЛАДНАННЯ — HOROVOD HUB';
  }

  lines.forEach(line => {
    if (line.toLowerCase().startsWith('кому:')) {
      const email = line.substring(5).trim();
      if (email && email.includes('@') && !recipients.includes(email)) recipients.push(email);
    }
  });

  if (message.includes('[МАСОВИЙ АНОНС]')) {
    const optLine = lines.find(l => l.includes('Отримувачі'));
    if (optLine) {
      optLine.split(':')[1]?.split(',').forEach(e => {
        const em = e.trim();
        if (em && em.includes('@') && !recipients.includes(em)) recipients.push(em);
      });
    }
  }

  [...new Set(recipients)].forEach(async (toEmail) => {
    if (toEmail.endsWith('.art')) { console.log(`Skipping mock address: ${toEmail}`); return; }
    
    let sentViaSupabase = false;
    if (isSupabaseEnabled) {
      try {
        const { data, error } = await supabaseClient.functions.invoke('send-booking-email', {
          body: {
            to: toEmail,
            subject: subject,
            html: message.replace(/\n/g, '<br>')
          }
        });
        if (!error) {
          console.log(`Email sent via Supabase Edge Function to ${toEmail}`);
          sentViaSupabase = true;
        } else {
          console.error(`Supabase function error → ${toEmail}:`, error);
        }
      } catch (err) {
        console.error(`Supabase function invoke exception → ${toEmail}:`, err);
      }
    }
    
    if (!sentViaSupabase) {
      console.log(`[LOCAL DEV FALLBACK] Email would be sent to ${toEmail}:\nSubject: ${subject}\nContent:\n${message}`);
    }
  });
}

function getLogFromBooking(b) {
  const timeStr = b.submittedAt ? new Date(b.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '12:00';
  if (!b.date || !b.startTime || !b.endTime) return null;

  if (b.status === 'pending') {
    return {
      id: 'log_b_' + b.id + '_pending',
      time: timeStr,
      type: 'request',
      message: `[ОТРИМАНО ЗАПИТ]\nКому: ${b.email}\nКому: horovod.info@gmail.com\nНовий запит від "${b.userName}" (тип: ${b.type}) на ${formatHumanDate(b.date)} о ${b.startTime}-${b.endTime}.\nОчікує розгляду в панелі адміна.`,
      status: 'pending',
      title: 'Запит',
      body: `Новий запит від <strong>${b.userName}</strong> (тип: ${b.type}) на <strong>${formatHumanDate(b.date)}</strong> о <strong>${b.startTime}-${b.endTime}</strong>.`,
      timestamp: b.submittedAt ? new Date(b.submittedAt).getTime() : Date.now(),
      bookingId: b.id
    };
  } else if (b.status === 'approved') {
    return {
      id: 'log_b_' + b.id + '_approved',
      time: timeStr,
      type: 'notify-accept',
      message: `[ПІДТВЕРДЖЕННЯ]\nКому: ${b.email}\nКому: horovod.info@gmail.com\nБронювання для "${b.userName}" (тип: ${b.type}) на ${formatHumanDate(b.date)} о ${b.startTime}-${b.endTime} ПІДТВЕРДЖЕНО.`,
      status: 'approved',
      title: 'Підтверджено',
      body: `Запит від <strong>${b.userName}</strong> (тип: ${b.type}) на <strong>${formatHumanDate(b.date)}</strong> о <strong>${b.startTime}-${b.endTime}</strong> підтверджено.`,
      timestamp: b.submittedAt ? new Date(b.submittedAt).getTime() : Date.now(),
      bookingId: b.id
    };
  } else if (b.status === 'rejected') {
    return {
      id: 'log_b_' + b.id + '_rejected',
      time: timeStr,
      type: 'notify-reject',
      message: `[ВІДХИЛЕНО]\nКому: ${b.email}\nКому: horovod.info@gmail.com\nЗапит від "${b.userName}" (тип: ${b.type}) на ${formatHumanDate(b.date)} о ${b.startTime}-${b.endTime} ВІДХИЛЕНО.`,
      status: 'rejected',
      title: 'Відхилено',
      body: `Запит від <strong>${b.userName}</strong> (тип: ${b.type}) на <strong>${formatHumanDate(b.date)}</strong> о <strong>${b.startTime}-${b.endTime}</strong> відхилено.`,
      timestamp: b.submittedAt ? new Date(b.submittedAt).getTime() : Date.now(),
      bookingId: b.id
    };
  } else if (b.status === 'cancelled') {
    const cancelMsg = b.cancelReason ? `Причина: "${b.cancelReason}"` : '';
    const actor = b.cancelledBy === 'admin' ? 'Адміністратор' : `Резидент "${b.userName}"`;
    return {
      id: 'log_b_' + b.id + '_cancelled',
      time: timeStr,
      type: 'notify-cancel',
      message: `[СКАСОВАНО]\nКому: ${b.email}\nКому: horovod.info@gmail.com\n${actor} скасував бронювання на ${formatHumanDate(b.date)} (${b.startTime}-${b.endTime}).\n${cancelMsg}`,
      status: 'cancelled',
      title: 'Скасовано',
      body: `Бронювання для <strong>${b.userName}</strong> (тип: ${b.type}) на <strong>${formatHumanDate(b.date)}</strong> о <strong>${b.startTime}-${b.endTime}</strong> скасовано. ${cancelMsg}`,
      timestamp: b.submittedAt ? new Date(b.submittedAt).getTime() : Date.now(),
      bookingId: b.id
    };
  }
  return null;
}

window.rebuildLogsFromBookings = function() {
  logs = logs.filter(l => l.id && !l.id.startsWith('log_b_') && !l.bookingId);

  const generatedLogs = [];
  bookings.forEach(b => {
    const log = getLogFromBooking(b);
    if (log) generatedLogs.push(log);
  });

  logs = [...logs, ...generatedLogs];

  logs.sort((a, b) => {
    const timeA = a.timestamp || (a.id.startsWith('log_') ? parseInt(a.id.split('_')[1]) : 0);
    const timeB = b.timestamp || (b.id.startsWith('log_') ? parseInt(b.id.split('_')[1]) : 0);
    return timeB - timeA;
  });

  if (logs.length > 50) logs = logs.slice(0, 50);
  localStorage.setItem('rehearsal_logs_horovod_hub_auth', JSON.stringify(logs));
};

function renderLogs() {
  const container = document.getElementById('logs-container');
  container.innerHTML = '';
  
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]/gu;

  logs.forEach((log, idx) => {
    let status = log.status || 'info';
    let title = log.title || '';
    let body = log.body || '';

    // Upgrade/Format legacy log message formats on the fly
    if (!title && log.message) {
      let msg = log.message.replace(emojiRegex, '').trim();

      if (log.type === 'notify-accept' || msg.includes('ПІДТВЕРДЖЕННЯ') || msg.toLowerCase().includes('підтверджено')) {
        status = 'approved';
        title = 'Підтверджено';
      } else if (log.type === 'notify-reject' || msg.includes('ВІДХИЛЕНО') || msg.toLowerCase().includes('відхилено')) {
        status = 'rejected';
        title = 'Відхилено';
      } else if (msg.includes('СКАСОВАНО') || msg.toLowerCase().includes('скасовано')) {
        status = 'cancelled';
        title = 'Скасовано';
      } else if (msg.includes('ЗАПИТ') || msg.toLowerCase().includes('запит')) {
        status = 'pending';
        title = 'Запит';
      } else if (msg.includes('АНОНС') || msg.toLowerCase().includes('анонс')) {
        status = 'announcement';
        title = 'Анонс';
      }

      // Remove redundant prefixes
      msg = msg.replace(/^(Скасовано організатором|Резидент .* скасував|Адміністратор: підтверджено|Отримано запит|Новий запит від|Масовий анонс):\s*/i, '');
      msg = msg.replace(/^\[(?:ПІДТВЕРДЖЕННЯ|ОТРИМАНО ЗАПИТ|МАСОВИЙ АНОНС|СКАСОВАНО РЕЗИДЕНТОМ|СКАСОВАНО ОРГАНІЗАТОРОМ|ВІДХИЛЕНО)\]\s*/i, '');
      msg = msg.trim();

      // Highlights inside fallback messages
      const dateRegex = /(?:Понеділок|Вівторок|Середа|Четвер|П'ятниця|Субота|Неділя|Пн|Вт|Ср|Чт|Пт|Сб|Нд),\s*\d+\s*(?:Січ|Лют|Бер|Кві|Тра|Чер|Лип|Сер|Вер|Жов|Лис|Гру)[а-я]*/gi;
      msg = msg.replace(dateRegex, '<strong>$&</strong>');

      const timeRegex = /\b\d{2}:\d{2}\s*(?:-|до)\s*\d{2}:\d{2}\b/g;
      msg = msg.replace(timeRegex, '<strong>$&</strong>');

      msg = msg.replace(/"([^"]+)"/g, '<strong>"$1"</strong>');

      body = msg;
    }

    // Strip emojis from title and body
    if (title) title = title.replace(emojiRegex, '').trim();
    if (body) body = body.replace(emojiRegex, '').trim();

    const item = document.createElement('div');
    const statusClass = `status-${status}`;
    item.className = `log-item ${log.type} ${statusClass}`;
    item.style.cursor = 'pointer';
    item.onclick = function() { showActivityDetail(idx); };
    
    const contentDiv = document.createElement('div');
    
    // Header with badge and time
    const headerDiv = document.createElement('div');
    headerDiv.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;';
    
    const badge = document.createElement('span');
    badge.className = `log-badge badge-${status}`;
    badge.textContent = title || 'Подія';
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = log.time;
    
    headerDiv.appendChild(badge);
    headerDiv.appendChild(timeSpan);
    item.appendChild(headerDiv);
    
    // Body content
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'log-body-content';
    bodyDiv.innerHTML = body || log.message || '';
    contentDiv.appendChild(bodyDiv);
    
    // Admin action buttons for unresolved issue reports
    const isAdminViewing = localStorage.getItem('admin_logged_in') === 'true';
    if (isAdminViewing && log.type === 'issue-reported' && log.bookingId) {
      const issue = issues.find(i => i.id === log.bookingId);
      if (issue && !issue.resolved) {
        const actionsDiv = document.createElement('div');
        actionsDiv.style.cssText = 'display:flex;gap:0.5rem;margin-top:0.6rem;';

        const resolveBtn = document.createElement('button');
        resolveBtn.className = 'btn btn-outline';
        resolveBtn.style.cssText = 'padding:0.3rem 0.7rem;font-size:0.72rem;border-color:var(--color-green);color:var(--color-green);';
        resolveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Вирішено';
        resolveBtn.onclick = function(ev) { ev.stopPropagation(); resolveIssue(log.bookingId); };

        const dismissBtn = document.createElement('button');
        dismissBtn.className = 'btn btn-outline';
        dismissBtn.style.cssText = 'padding:0.3rem 0.7rem;font-size:0.72rem;border-color:var(--color-red);color:var(--color-red);';
        dismissBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Відхилити';
        dismissBtn.onclick = function(ev) { ev.stopPropagation(); dismissIssue(log.bookingId); };

        actionsDiv.appendChild(resolveBtn);
        actionsDiv.appendChild(dismissBtn);
        contentDiv.appendChild(actionsDiv);
      }
    }

    item.appendChild(contentDiv);
    container.appendChild(item);
  });

  // Update latest activity banner text
  const latestLog = logs[0];
  const banner = document.getElementById('latest-activity-banner');
  const bannerText = document.getElementById('latest-activity-text');
  if (latestLog && banner && bannerText) {
    banner.style.display = 'flex';
    
    let status = latestLog.status || 'info';
    let title = latestLog.title || '';
    let body = latestLog.body || '';

    if (!title && latestLog.message) {
      let msg = latestLog.message.replace(emojiRegex, '').trim();
      if (latestLog.type === 'notify-accept' || msg.includes('ПІДТВЕРДЖЕННЯ') || msg.toLowerCase().includes('підтверджено')) {
        status = 'approved';
        title = 'Підтверджено';
      } else if (latestLog.type === 'notify-reject' || msg.includes('ВІДХИЛЕНО') || msg.toLowerCase().includes('відхилено')) {
        status = 'rejected';
        title = 'Відхилено';
      } else if (msg.includes('СКАСОВАНО') || msg.toLowerCase().includes('скасовано')) {
        status = 'cancelled';
        title = 'Скасовано';
      } else if (msg.includes('ЗАПИТ') || msg.toLowerCase().includes('запит')) {
        status = 'pending';
        title = 'Запит';
      } else if (msg.includes('АНОНС') || msg.toLowerCase().includes('анонс')) {
        status = 'announcement';
        title = 'Анонс';
      }
      msg = msg.replace(/^(Скасовано організатором|Резидент .* скасував|Адміністратор: підтверджено|Отримано запит|Новий запит від|Масовий анонс):\s*/i, '');
      msg = msg.replace(/^\[(?:ПІДТВЕРДЖЕННЯ|ОТРИМАНО ЗАПИТ|МАСОВИЙ АНОНС|СКАСОВАНО РЕЗИДЕНТОМ|СКАСОВАНО ОРГАНІЗАТОРОМ|ВІДХИЛЕНО)\]\s*/i, '');
      body = msg.trim();
    }

    if (title) title = title.replace(emojiRegex, '').trim();
    if (body) body = body.replace(emojiRegex, '').trim();

    const cleanBody = body.replace(/<br\s*\/?>/gi, ' ').trim();
    
    let color = 'var(--brand-blue-dark)';
    if (status === 'pending') color = 'var(--brand-yellow)';
    else if (status === 'approved') color = 'var(--brand-green)';
    else if (status === 'cancelled') color = 'var(--brand-orange)';
    else if (status === 'rejected') color = 'var(--brand-red)';

    const newHtml = `
      <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${color}; margin-right: 0.5rem; vertical-align: middle; transform: translateY(-1px);"></span>
      <span style="font-weight: 700; color: var(--text-primary); margin-right: 0.25rem;">${title}:</span>
      <span style="color: var(--text-secondary); font-weight: 500;">${cleanBody}</span>
    `;

    if (bannerText.innerHTML !== newHtml) {
      bannerText.innerHTML = newHtml;
      banner.classList.remove('banner-flash-active');
      void banner.offsetWidth; // Force CSS animation restart
      banner.classList.add('banner-flash-active');
    }
  } else if (banner) {
    banner.style.display = 'none';
  }
}

// ── View Switcher ─────────────────────────────────────────────────────────────
window.switchView = async function(viewName) {
  const toastContainer = document.getElementById('toast-container');
  if (toastContainer) toastContainer.innerHTML = '';

  const isLoggedIn = localStorage.getItem('user_logged_in') === 'true';
  // Allow guest access to calendar view; require login for booking and admin
  if (!isLoggedIn && viewName !== 'calendar') { openLoginModal(); return; }

  if (viewName === 'admin') {
    const isAdm = localStorage.getItem('admin_logged_in') === 'true';
    if (!isAdm) { showToast('Доступ обмежено. Лише для адміністратора!', 'error'); return; }
  }

  if (isSupabaseEnabled && (viewName === 'calendar' || viewName === 'admin' || viewName === 'book')) {
    try {
      const { data, error } = await supabaseClient.from('bookings').select('*');
      if (error) throw error;
      if (data) {
        bookings = data;
        localStorage.setItem('rehearsal_bookings_horovod_hub_auth', JSON.stringify(bookings));
      }
    } catch (err) { console.error('Supabase sync failed:', err); }
  }

  document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${viewName}`).classList.add('active');
  document.getElementById(`nav-${viewName}`).classList.add('active');

  if (viewName === 'book') {
    const form = document.getElementById('booking-form');
    const mobileWrapper = document.getElementById('mobile-booking-card-wrapper');
    if (form && mobileWrapper && form.parentNode !== mobileWrapper) {
      mobileWrapper.appendChild(form);
    }
  }

  closeBookingModal(true);

  if (viewName === 'calendar') renderWeeklyCalendar();
  else if (viewName === 'admin') renderAdminRequests();
  else if (viewName === 'book') renderUserCabinet();
};

window.openBookingModal = function() {
  const form = document.getElementById('booking-form');
  const modalContent = document.getElementById('booking-modal-content');
  if (form && modalContent && form.parentNode !== modalContent) {
    modalContent.appendChild(form);
  }
  document.getElementById('booking-modal-overlay').classList.add('active');
  window.lastModalOpenTime = Date.now();
  
  // Store the currently active nav button and highlight the Booking button
  const currentActiveBtn = document.querySelector('.nav-btn.active');
  if (currentActiveBtn && currentActiveBtn.id !== 'nav-book') {
    window.preModalActiveNavId = currentActiveBtn.id;
  }
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const btnBook = document.getElementById('nav-book');
  if (btnBook) btnBook.classList.add('active');

  const nameInput = document.getElementById('user-name');
  if (nameInput) nameInput.focus();
};

window.closeBookingModal = function(keepCurrentActive) {
  document.getElementById('booking-modal-overlay').classList.remove('active');
  
  // Restore the active navigation button highlight
  const btnBook = document.getElementById('nav-book');
  if (btnBook) btnBook.classList.remove('active');
  
  if (!keepCurrentActive) {
    const prevBtn = document.getElementById(window.preModalActiveNavId || 'nav-calendar');
    if (prevBtn) prevBtn.classList.add('active');
  }
};

window.handleBookNavClick = function() {
  const isLoggedIn = localStorage.getItem('user_logged_in') === 'true';
  if (!isLoggedIn) { openLoginModal(); return; }
  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    switchView('book');
  } else {
    openBookingModal();
  }
};

window.adminLogout = function() {
  localStorage.removeItem('admin_logged_in');
  localStorage.removeItem('user_logged_in');
  localStorage.removeItem('user_email');
  document.getElementById('user-profile-nav').style.display = 'none';
  document.getElementById('nav-admin').style.display = 'none';
  const navLoginBtn = document.getElementById('nav-login-btn');
  if (navLoginBtn) navLoginBtn.style.display = 'inline-flex';
  const navLinks = document.getElementById('header-nav-links');
  if (navLinks) {
    navLinks.style.marginLeft = '2rem';
    navLinks.style.marginRight = '';
  }
  renderWeeklyCalendar();
  renderLogs();
  renderIssues();
  showToast('Ви вийшли з кабінету адміністратора.', 'warning');
};

// ── Overlap helpers ───────────────────────────────────────────────────────────
function checkExclusiveOverlap(date, start, end, ignoreId) {
  const s = timeToDecimal(start), e = timeToDecimal(end);
  return bookings.find(b => {
    if (b.status !== 'approved' || b.date !== date || b.id === ignoreId) return false;
    if (!isExclusiveType(b.type)) return false;
    return s < timeToDecimal(b.endTime) && e > timeToDecimal(b.startTime);
  });
}

function getAnyOverlap(date, start, end, ignoreId) {
  const s = timeToDecimal(start), e = timeToDecimal(end);
  return bookings.find(b => {
    if (b.status !== 'approved' || b.date !== date || b.id === ignoreId) return false;
    return s < timeToDecimal(b.endTime) && e > timeToDecimal(b.startTime);
  });
}

function findNextFreeDayForSlot(startDateStr, startTime, endTime) {
  const checkDate = new Date(startDateStr + 'T00:00:00');
  for (let i = 1; i <= 14; i++) {
    checkDate.setDate(checkDate.getDate() + 1);
    const ds = getLocalDateString(checkDate);
    if (!checkExclusiveOverlap(ds, startTime, endTime)) return ds;
  }
  return null;
}

// ── Conflict Modal ────────────────────────────────────────────────────────────
window.closeConflictModal = function() {
  document.getElementById('conflict-modal').classList.remove('active');
  const submitBtn = document.querySelector('#booking-form button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Надіслати запит на бронювання'; }
};

function openConflictModal(userName, email, date, type, startTime, endTime, notes, conflict) {
  const conflictTypeStr = conflict.type === 'репетиція' ? 'репетиція' : 'займатися самому';
  document.getElementById('conflict-modal-msg').innerHTML = `
    У цей час (<strong>${startTime} - ${endTime}</strong>) на дату <strong>${formatHumanDate(date)}</strong> вже запланована <strong>${conflictTypeStr}</strong> (користувач: <em>${conflict.userName}</em>).
    <br><br>Оскільки репетиції та індивідуальні заняття не можуть проходити одночасно, оберіть інший час або скористайтеся пропозицією нижче.
  `;
  const actionContainer = document.getElementById('conflict-action-container');
  actionContainer.innerHTML = '';

  // Propose alternative suggestions on the same day
  const suggestions = checkSuggestions(date, type, startTime, endTime);
  if (suggestions.length > 0) {
    const sugDiv = document.createElement('div');
    sugDiv.className = 'conflict-suggestions';
    sugDiv.style.marginBottom = '1.25rem';
    sugDiv.innerHTML = '<div style="font-weight: 800; margin-bottom: 0.5rem; text-transform: uppercase;">Вільні проміжки на цей день:</div>';
    
    suggestions.forEach(slot => {
      const chip = document.createElement('span');
      chip.className = 'suggestion-chip';
      chip.textContent = `${slot.start} - ${slot.end}`;
      chip.onclick = () => {
        const startSelect = document.getElementById('start-time');
        const endSelect = document.getElementById('end-time');
        if (startSelect && endSelect) {
          startSelect.value = slot.start;
          updateEndTimeOptions();
          endSelect.value = slot.end;
          syncTimeChips();
          closeConflictModal();
          showToast(`Вибрано вільний час: ${slot.start} - ${slot.end}`, 'success');
        }
      };
      sugDiv.appendChild(chip);
    });
    actionContainer.appendChild(sugDiv);
  }

  const nextFreeDate = findNextFreeDayForSlot(date, startTime, endTime);
  if (nextFreeDate) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.style.width = '100%';
    btn.style.marginBottom = '0.5rem';
    btn.innerHTML = `<i class="fa-regular fa-calendar-check"></i> Перенести на ${formatHumanDate(nextFreeDate)} о ${startTime}`;
    btn.onclick = async () => {
      document.getElementById('booking-date').value = nextFreeDate;
      closeConflictModal();
      const isAdminB = (email.toLowerCase().trim() === 'horovod.info@gmail.com');
      await submitConfirmedBooking({
        id: 'book_' + Date.now(), userName, email, date: nextFreeDate, type,
        startTime, endTime, notes: notes || 'Немає приміток.',
        status: isAdminB ? 'approved' : 'pending', submittedAt: new Date().toISOString()
      });
    };
    actionContainer.appendChild(btn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-outline';
  closeBtn.style.width = '100%';
  closeBtn.textContent = 'Обрати інший час на сьогодні';
  closeBtn.onclick = closeConflictModal;
  actionContainer.appendChild(closeBtn);

  document.getElementById('conflict-modal').classList.add('active');
}

// ── Booking Submit ────────────────────────────────────────────────────────────
async function submitConfirmedBooking(newBooking) {
  bookings.unshift(newBooking);
  await saveData(newBooking);

  const isAdminB = (newBooking.email.toLowerCase().trim() === 'horovod.info@gmail.com');
  if (isAdminB && newBooking.status === 'approved') {
    addLog('notify-accept', `[ПІДТВЕРДЖЕННЯ]\nКому: horovod.info@gmail.com\nБронювання для "Адміністратор" (тип: ${newBooking.type}) на ${formatHumanDate(newBooking.date)} о ${newBooking.startTime}-${newBooking.endTime} ПІДТВЕРДЖЕНО.`, 'approved', 'Підтверджено', `Бронювання для <strong>Адміністратора</strong> (тип: ${newBooking.type}) на <strong>${formatHumanDate(newBooking.date)}</strong> о <strong>${newBooking.startTime}-${newBooking.endTime}</strong> підтверджено.`, newBooking.id);
    document.getElementById('success-modal-title').textContent = 'Бронювання підтверджено!';
    document.getElementById('success-modal-msg').textContent   = 'Ваше бронювання як адміністратора автоматично підтверджено та додано до календаря.';
  } else {
    addLog('notify-admin', `[ОТРИМАНО ЗАПИТ]\nКому: horovod.info@gmail.com\nНовий запит від "${newBooking.userName}" (тип: ${newBooking.type}) на ${formatHumanDate(newBooking.date)} з ${newBooking.startTime} до ${newBooking.endTime}.\nОчікує розгляду в панелі адміна.`, 'pending', 'Запит', `<strong>${newBooking.userName}</strong> надіслав запит (тип: ${newBooking.type}) на <strong>${formatHumanDate(newBooking.date)}</strong> о <strong>${newBooking.startTime}-${newBooking.endTime}</strong>.`, newBooking.id);
    document.getElementById('success-modal-title').textContent = 'Запит надіслано!';
    document.getElementById('success-modal-msg').textContent   = 'Ваш запит успішно надіслано. Координатор перевірить його найближчим часом.';
  }

  document.getElementById('booking-form').reset();
  document.getElementById('booking-date').value    = getOffsetDateString(1);
  document.getElementById('contact-email').value   = localStorage.getItem('user_email');
  populateTimeDropdowns();
  renderUserCabinet();

  closeBookingModal();
  await switchView('calendar');
  document.getElementById('success-modal').classList.add('active');
}

window.closeSuccessModal = function() {
  document.getElementById('success-modal').classList.remove('active');
  const btn = document.querySelector('#booking-form button[type="submit"]');
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Надіслати запит на бронювання'; }
};

window.handleBookingSubmit = async function(e) {
  e.preventDefault();

  const userName  = document.getElementById('user-name').value.trim();
  const email     = document.getElementById('contact-email').value.trim();
  const date      = document.getElementById('booking-date').value;
  const type      = document.getElementById('booking-type').value;
  const startTime = document.getElementById('start-time').value;
  const endTime   = document.getElementById('end-time').value;
  const notes     = document.getElementById('booking-notes').value.trim();

  const isAdminSubmit = (email.toLowerCase().trim() === 'horovod.info@gmail.com' &&
                          localStorage.getItem('admin_logged_in') === 'true');
  const todayStr = getOffsetDateString(0);

  // Block bookings earlier than 08:00 to prevent calendar layout glitches
  const startHourNum = parseInt(startTime.split(':')[0], 10);
  if (startHourNum < 8) {
    showToast('Бронювання раніше 08:00 не допускається.', 'error');
    return;
  }

  // Nobody can book actual past dates
  if (date < todayStr) {
    showToast('Бронювання в минулому неможливе.', 'error');
    return;
  }

  if (isAdminSubmit) {
    // Admin can book today, but only from future/unstarted slots
    if (date === todayStr) {
      const nowDecimal = new Date().getHours() + new Date().getMinutes() / 60;
      const startHourDecimal = timeToDecimal(startTime);
      if (startHourDecimal < nowDecimal) {
        showToast('Адмін: не можна забронювати час, який уже розпочався або минув.', 'error');
        return;
      }
    }
  } else {
    // Residents can only book from tomorrow
    if (date <= todayStr) {
      showToast('Бронювання на сьогодні неможливе. Тільки з завтрашнього дня.', 'error');
      return;
    }
  }

  if (isExclusiveType(type)) {
    // Concurrency check for both admin and residents: >= 2 bookings is blocked
    let hasConcurrencyConflict = false;
    let firstConflictBooking = null;
    const startDec = timeToDecimal(startTime);
    const endDec = timeToDecimal(endTime);
    for (let h = startDec; h < endDec; h += 0.5) {
      const slotsBookings = bookings.filter(b => {
        if (b.status !== 'approved' && b.status !== 'pending') return false;
        if (b.date !== date) return false;
        if (!isExclusiveType(b.type)) return false;
        const bStart = timeToDecimal(b.startTime);
        const bEnd = timeToDecimal(b.endTime);
        return h >= bStart && h < bEnd;
      });
      if (slotsBookings.length >= 2) {
        hasConcurrencyConflict = true;
        firstConflictBooking = slotsBookings[0];
        break;
      }
    }

    if (hasConcurrencyConflict) {
      openConflictModal(userName, email, date, type, startTime, endTime, notes, firstConflictBooking);
      return;
    }

    // Only residents check for single exclusive overlap
    if (!isAdminSubmit) {
      const conflict = checkExclusiveOverlap(date, startTime, endTime);
      if (conflict) {
        openConflictModal(userName, email, date, type, startTime, endTime, notes, conflict);
        return;
      }
    }
  }

  // Disable submit to prevent double-send
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Надсилається...';
  }

  await submitConfirmedBooking({
    id: 'book_' + Date.now(), userName, email, date, type, startTime, endTime,
    notes: notes || 'Немає приміток.',
    status: isAdminSubmit ? 'approved' : 'pending',
    submittedAt: new Date().toISOString()
  });
};

// ── Contacts & Announcements ──────────────────────────────────────────────────
function getContacts() {
  const map = {};
  bookings.forEach(b => {
    const key = b.email.toLowerCase().trim();
    if (!map[key]) map[key] = { name: b.userName, email: b.email, bookingsCount: 0 };
    map[key].bookingsCount++;
  });
  return Object.values(map);
}

function renderContacts() {
  const tbody = document.getElementById('contacts-table-body');
  tbody.innerHTML = '';
  const list = getContacts();
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:1.5rem;color:var(--text-muted);">База контактів порожня</td></tr>';
    return;
  }
  list.forEach(c => {
    const row = document.createElement('tr');
    row.style.borderBottom = '1px solid rgba(0,0,0,0.02)';
    row.innerHTML = `<td style="padding:0.6rem 0.8rem;font-weight:500;">${c.name}</td><td style="padding:0.6rem 0.8rem;color:var(--text-secondary);">${c.email}</td><td style="padding:0.6rem 0.8rem;text-align:center;font-weight:bold;color:var(--primary);">${c.bookingsCount}</td>`;
    tbody.appendChild(row);
  });
}

window.handleSendAnnouncement = function(e) {
  e.preventDefault();
  const subject = document.getElementById('announcement-subject').value.trim();
  const text    = document.getElementById('announcement-text').value.trim();
  if (!subject || !text) { showToast('Будь ласка, заповніть тему та текст анонсу.', 'error'); return; }

  const list = getContacts();
  if (list.length === 0) { showToast('База контактів порожня.', 'error'); return; }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Надсилається...';
  }

  addLog('notify-admin', `[МАСОВИЙ АНОНС]\nТема: ${subject}\nТекст: ${text}\nОтримувачі (${list.length}): ${list.map(c => c.email).join(', ')}`, 'announcement', 'Анонс', `Тема: <strong>${subject}</strong><br>${text}`);
  addNewsItem(subject, text, 'announcement');
  showToast(`Анонс надіслано до ${list.length} резидентів!`, 'success');
  document.getElementById('announcement-subject').value = '';
  document.getElementById('announcement-text').value    = '';

  if (submitBtn) {
    setTimeout(() => {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Надіслати всім резидентам';
    }, 3000);
  }
};

// ── Cancellation ──────────────────────────────────────────────────────────────
window.openCancelFlow = function(role) {
  const isAdmin = localStorage.getItem('admin_logged_in') === 'true' ||
                  localStorage.getItem('user_email') === 'horovod.info@gmail.com';

  if (role === 'admin' && !isAdmin) { showToast('Помилка доступу: лише для адміністратора!', 'error'); return; }
  if (role === 'client' && isAdmin) { showToast('Помилка доступу: адміністратор скасовує як організатор!', 'error'); return; }

  const b = bookings.find(item => item.id === activeModalBookingId);
  if (!b) return;

  if (!isAdmin && role === 'client') {
    const loggedEmail = (localStorage.getItem('user_email') || '').toLowerCase().trim();
    if (b.email.toLowerCase().trim() !== loggedEmail) {
      showToast('Ви можете скасовувати лише власні бронювання!', 'error');
      return;
    }
  }

  cancellationRole = role;
  document.getElementById('cancel-form-container').style.display = 'block';
  document.getElementById('cancel-reason').value        = '';
  document.getElementById('cancel-confirm-email').value = '';

  const confirmBtn = document.querySelector('#cancel-form-container button.btn-danger');
  if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerHTML = 'Підтвердити'; }

  const emailGroup = document.getElementById('cancel-email-group');
  const titleEl    = document.getElementById('cancel-form-title');

  if (role === 'client') {
    emailGroup.style.display = 'block';
    titleEl.textContent      = 'Скасування (Резидент)';
    titleEl.style.color      = 'var(--secondary-hover)';
    document.getElementById('cancel-confirm-email').value = localStorage.getItem('user_email') || '';
  } else {
    emailGroup.style.display = 'none';
    titleEl.textContent      = 'Скасування (Організатор)';
    titleEl.style.color      = 'var(--danger)';
  }
};

window.closeCancelFlow = function() {
  document.getElementById('cancel-form-container').style.display = 'none';
};

window.submitCancellation = function() {
  const b = bookings.find(item => item.id === activeModalBookingId);
  if (!b || b.status === 'cancelled') return;

  const isAdmin = localStorage.getItem('admin_logged_in') === 'true' ||
                  localStorage.getItem('user_email') === 'horovod.info@gmail.com';

  if (cancellationRole === 'admin' && !isAdmin) { showToast('Помилка доступу!', 'error'); return; }
  if (cancellationRole === 'client' && isAdmin) { showToast('Помилка доступу!', 'error'); return; }
  if (!isAdmin && cancellationRole === 'client') {
    const loggedEmail = (localStorage.getItem('user_email') || '').toLowerCase().trim();
    if (b.email.toLowerCase().trim() !== loggedEmail) { showToast('Помилка доступу!', 'error'); return; }
  }

  const reason = document.getElementById('cancel-reason').value.trim();
  if (!reason) { showToast('Будь ласка, вкажіть причину скасування.', 'error'); return; }

  const confirmBtn = document.querySelector('#cancel-form-container button.btn-danger');

  if (cancellationRole === 'client') {
    const confirmEmail = document.getElementById('cancel-confirm-email').value.trim().toLowerCase();
    if (confirmEmail !== b.email.toLowerCase()) {
      showToast('Введена адреса не збігається з поштою в бронюванні!', 'error');
      return;
    }
    if (confirmBtn) {
      if (confirmBtn.disabled) return;
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Скасування...';
    }
    b.status = 'cancelled';
    addLog('notify-reject', `[СКАСОВАНО РЕЗИДЕНТОМ]\nКому: horovod.info@gmail.com\nРезидент "${b.userName}" скасував бронювання на ${formatHumanDate(b.date)} (${b.startTime}-${b.endTime}).\nПричина: "${reason}"`, 'cancelled', 'Скасовано', `Резидент <strong>${b.userName}</strong> скасував бронювання на <strong>${formatHumanDate(b.date)}</strong> о <strong>${b.startTime}-${b.endTime}</strong>.<br>Причина: <em>"${reason}"</em>`, b.id);
    document.getElementById('cancel-success-msg').textContent = 'Ваше бронювання успішно скасовано. Організаторів сповіщено.';
  } else {
    if (confirmBtn) {
      if (confirmBtn.disabled) return;
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Скасування...';
    }
    b.status = 'cancelled';
    addLog('notify-reject', `[СКАСОВАНО ОРГАНІЗАТОРОМ]\nКому: ${b.email}\nОрганізатори скасували ваше бронювання на ${formatHumanDate(b.date)} (${b.startTime}-${b.endTime}).\nПричина: "${reason}"`, 'cancelled', 'Скасовано', `Організатори скасували бронювання для <strong>${b.userName}</strong> на <strong>${formatHumanDate(b.date)}</strong> о <strong>${b.startTime}-${b.endTime}</strong>.<br>Причина: <em>"${reason}"</em>`, b.id);
    document.getElementById('cancel-success-msg').textContent = 'Бронювання успішно скасовано. Резидента сповіщено.';
  }

  saveData(b);
  closeModal();
  renderWeeklyCalendar();
  renderAdminRequests();
  renderUserCabinet();
  document.getElementById('cancel-success-modal').classList.add('active');
};

window.closeCancelSuccessModal = function() {
  document.getElementById('cancel-success-modal').classList.remove('active');
  const confirmBtn = document.querySelector('#cancel-form-container button.btn-danger');
  if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerHTML = 'Підтвердити'; }
};

// ── Admin Panel ───────────────────────────────────────────────────────────────
function renderAdminRequests() {
  const pendingContainer = document.getElementById('pending-requests-list');
  const allContainer     = document.getElementById('all-requests-list');
  pendingContainer.innerHTML = '';
  allContainer.innerHTML     = '';

  const pendings  = bookings.filter(b => b.status === 'pending');
  const histories = bookings.filter(b => b.status !== 'pending');

  if (pendings.length === 0) {
    pendingContainer.innerHTML = '<div class="no-requests">Немає нових запитів на бронювання.</div>';
  } else {
    pendings.forEach(b => pendingContainer.appendChild(createRequestCard(b, true)));
  }
  if (histories.length === 0) {
    allContainer.innerHTML = '<div class="no-requests">Історія порожня.</div>';
  } else {
    histories.forEach(b => allContainer.appendChild(createRequestCard(b, false)));
  }
  renderContacts();
}

function createRequestCard(b, isPending) {
  const card = document.createElement('div');
  card.className = 'request-card';

  const info = document.createElement('div');
  info.className = 'request-info';

  const statusMap = { pending: 'очікує', approved: 'підтверджено', rejected: 'відхилено', cancelled: 'скасовано' };
  const badge = document.createElement('span');
  badge.className = `badge ${b.status}`;
  badge.textContent = statusMap[b.status] || b.status;

  const headerDiv = document.createElement('div');
  headerDiv.style.cssText = 'display:flex;align-items:center;gap:0.75rem;';
  const band = document.createElement('div');
  band.className = 'request-band';
  band.textContent = `${b.userName} (${capitalize(b.type)})`;
  headerDiv.appendChild(band);
  headerDiv.appendChild(badge);

  const details = document.createElement('div');
  details.className = 'request-details';
  details.innerHTML = `<span><i class="fa-regular fa-calendar"></i> ${formatHumanDate(b.date)}</span><span><i class="fa-regular fa-clock"></i> ${b.startTime} - ${b.endTime}</span><span><i class="fa-regular fa-envelope"></i> ${b.email}</span>`;

  let overlap = null;
  if (b.status === 'approved' || b.status === 'pending') {
    overlap = bookings.find(ob => {
      if (ob.id === b.id || ob.date !== b.date) return false;
      if (ob.status !== 'approved' && ob.status !== 'pending') return false;
      const obs = timeToDecimal(ob.startTime);
      const obe = timeToDecimal(ob.endTime);
      const bs = timeToDecimal(b.startTime);
      const be = timeToDecimal(b.endTime);
      return obs < be && obe > bs;
    });
  }

  if (overlap) {
    const warn = document.createElement('div');
    warn.className = 'overlap-warning';
    warn.style.cssText = 'margin-top:0.75rem;padding:0.5rem 0.75rem;background:rgba(200,150,123,0.08);border:1px solid rgba(200,150,123,0.2);border-radius:var(--radius-sm);font-size:0.8rem;color:var(--secondary-hover);';
    warn.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>Увага:</strong> Перетинається з "${overlap.userName}" (${capitalize(overlap.type)}) о ${overlap.startTime}-${overlap.endTime}.`;
    details.appendChild(warn);
  }

  info.appendChild(headerDiv);
  info.appendChild(details);
  card.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'request-actions';

  if (isPending) {
    const approveBtn = document.createElement('button');
    approveBtn.className = 'btn btn-success';
    approveBtn.innerHTML = overlap
      ? '<i class="fa-solid fa-circle-question"></i> Дозволити все одно?'
      : '<i class="fa-solid fa-check"></i> Підтвердити';
    approveBtn.onclick = () => handleApprove(b.id);

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'btn btn-danger';
    rejectBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Відхилити';
    rejectBtn.onclick = () => handleReject(b.id);

    actions.appendChild(approveBtn);
    actions.appendChild(rejectBtn);
  } else {
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn btn-outline';
    viewBtn.innerHTML = '<i class="fa-solid fa-eye"></i> Деталі';
    viewBtn.onclick = () => showModal(b.id);
    actions.appendChild(viewBtn);
  }

  card.appendChild(actions);
  return card;
}

function isBookingInPast(b) {
  const todayStr = getLocalDateString(new Date());
  if (b.date < todayStr) return true;
  if (b.date === todayStr) {
    const [endH, endM] = b.endTime.split(':').map(Number);
    const endDecimal = endH + endM / 60;
    const nowDecimal = new Date().getHours() + new Date().getMinutes() / 60;
    return endDecimal <= nowDecimal;
  }
  return false;
}

window.handleApprove = async function(id) {
  const b = bookings.find(item => item.id === id);
  if (!b || b.status !== 'pending') return;
  if (isBookingInPast(b)) {
    showToast('Не можна підтвердити бронювання в минулому.', 'error');
    return;
  }
  const prevStatus = b.status;
  b.status = 'approved';
  renderWeeklyCalendar();
  renderAdminRequests();
  renderUserCabinet();
  addLog('notify-accept', `[ПІДТВЕРДЖЕННЯ]\nКому: ${b.email}\nКому: horovod.info@gmail.com\nБронювання для "${b.userName}" (тип: ${b.type}) на ${formatHumanDate(b.date)} о ${b.startTime}-${b.endTime} ПІДТВЕРДЖЕНО.`, 'approved', 'Підтверджено', `Запит від <strong>${b.userName}</strong> (тип: ${b.type}) на <strong>${formatHumanDate(b.date)}</strong> о <strong>${b.startTime}-${b.endTime}</strong> підтверджено.`, b.id);
  saveData('logs_only');
  const { success } = await updateBookingStatusInDB(b);
  if (!success) {
    b.status = prevStatus;
    renderWeeklyCalendar();
    renderAdminRequests();
    showToast('Помилка збереження. Перевірте з\'єднання та спробуйте ще раз.', 'error');
    return;
  }
  localStorage.setItem('rehearsal_bookings_horovod_hub_auth', JSON.stringify(bookings));
  showToast(`Бронювання для ${b.userName} підтверджено!`, 'success');
};

window.handleReject = async function(id) {
  const b = bookings.find(item => item.id === id);
  if (!b || b.status !== 'pending') return;
  const prevStatus = b.status;
  b.status = 'rejected';
  renderWeeklyCalendar();
  renderAdminRequests();
  renderUserCabinet();
  addLog('notify-reject', `[ВІДХИЛЕНО]\nКому: ${b.email}\nКому: horovod.info@gmail.com\nЗапит від "${b.userName}" (тип: ${b.type}) на ${formatHumanDate(b.date)} о ${b.startTime}-${b.endTime} ВІДХИЛЕНО.`, 'rejected', 'Відхилено', `Запит від <strong>${b.userName}</strong> (тип: ${b.type}) на <strong>${formatHumanDate(b.date)}</strong> о <strong>${b.startTime}-${b.endTime}</strong> відхилено.`, b.id);
  saveData('logs_only');
  const { success } = await updateBookingStatusInDB(b);
  if (!success) {
    b.status = prevStatus;
    renderWeeklyCalendar();
    renderAdminRequests();
    showToast('Помилка збереження. Перевірте з\'єднання та спробуйте ще раз.', 'error');
    return;
  }
  localStorage.setItem('rehearsal_bookings_horovod_hub_auth', JSON.stringify(bookings));
  showToast(`Бронювання для ${b.userName} відхилено.`, 'warning');
};

// ── Drag-to-select state ──────────────────────────────────────────────────────
let dragState = {
  active: false,
  dayStr: null,
  startHour: null,
  currentHour: null,
  dayColEl: null,
  previewEl: null,
  cells: []
};

function clearDragState() {
  if (dragState.previewEl) { dragState.previewEl.remove(); dragState.previewEl = null; }
  if (dragState.dayColEl) {
    dragState.dayColEl.querySelectorAll('.calendar-event').forEach(el => {
      el.style.left = el.dataset.origLeft || '';
      el.style.width = el.dataset.origWidth || '';
    });
  }
  dragState.cells.forEach(c => c.classList.remove('drag-selected', 'drag-anchor'));
  dragState.active = dragState.dayStr = dragState.startHour = dragState.currentHour = dragState.dayColEl = null;
  dragState.cells = [];
  document.body.classList.remove('calendar-dragging');
}

function updateDragPreview() {
  if (!dragState.active || dragState.currentHour === null) return;
  
  // Clamp currentHour to prevent dragging over/past fully occupied slots (concurrency >= 2)
  let startHour = dragState.startHour;
  let currentHour = dragState.currentHour;
  
  if (currentHour > startHour) {
    for (let h = startHour; h <= currentHour; h += 0.5) {
      if (getConcurrentBookingCount(dragState.dayStr, h) >= 2) {
        currentHour = h - 0.5;
        break;
      }
    }
  } else if (currentHour < startHour) {
    for (let h = startHour - 0.5; h >= currentHour; h -= 0.5) {
      if (getConcurrentBookingCount(dragState.dayStr, h) >= 2) {
        currentHour = h + 0.5;
        break;
      }
    }
  }
  dragState.currentHour = currentHour;

  let startH, endH;
  if (dragState.currentHour >= dragState.startHour) {
    startH = dragState.startHour;
    endH   = dragState.currentHour + 0.5;
  } else {
    startH = dragState.currentHour;
    endH   = dragState.startHour;
  }

  // Clamp within grid limits (8:00 - 24:00)
  if (startH < 8) {
    startH = 8;
  }
  if (endH > 24) {
    endH = 24;
  }

  dragState.cells.forEach((c, idx) => {
    const h = 8 + idx * 0.5;
    c.classList.remove('drag-selected', 'drag-anchor');
    if (h >= startH && h < endH) {
      c.classList.add(h === startH ? 'drag-anchor' : 'drag-selected');
    }
  });

  // Reset event elements first
  if (dragState.dayColEl) {
    dragState.dayColEl.querySelectorAll('.calendar-event').forEach(el => {
      el.style.left = el.dataset.origLeft || '';
      el.style.width = el.dataset.origWidth || '';
    });
  }

  let overlapsAny = false;
  const dayEvents = bookings.filter(b => (b.status === 'approved' || b.status === 'pending') && b.date === dragState.dayStr);
  const overlappingBookings = dayEvents.filter(b => {
    const bs = timeToDecimal(b.startTime);
    const be = timeToDecimal(b.endTime);
    return bs < endH && be > startH;
  });

  if (overlappingBookings.length > 0) {
    overlapsAny = true;
    overlappingBookings.forEach(b => {
      const eventEl = dragState.dayColEl.querySelector(`[data-booking-id="${b.id}"]`);
      if (eventEl) {
        eventEl.style.left = 'calc(0% + 2px)';
        eventEl.style.width = 'calc(50% - 4px)';
      }
    });
  }

  if (dragState.previewEl) {
    dragState.previewEl.style.top    = `${(startH - 8) * 60}px`;
    dragState.previewEl.style.height = `${(endH - startH) * 60}px`;
    
    if (overlapsAny) {
      dragState.previewEl.style.left = 'calc(50% + 2px)';
      dragState.previewEl.style.width = 'calc(50% - 4px)';
    } else {
      dragState.previewEl.style.left = '3px';
      dragState.previewEl.style.width = 'calc(100% - 6px)';
    }

    const s = formatTimeDecimal(startH);
    const e = formatTimeDecimal(endH);
    
    // Check if the range overlaps with any past/started slots
    let isRangeInvalid = false;
    const isAdmin = localStorage.getItem('admin_logged_in') === 'true';
    for (let h = startH; h < endH; h += 0.5) {
      if (isSlotPast(dragState.dayStr, h, isAdmin)) {
        isRangeInvalid = true;
        break;
      }
    }
    
    const labelEl = dragState.previewEl.querySelector('.calendar-drag-preview-label');
    if (isRangeInvalid) {
      dragState.previewEl.classList.add('invalid-drag');
      labelEl.textContent = `${s} - ${e} (недоступно)`;
    } else {
      dragState.previewEl.classList.remove('invalid-drag');
      labelEl.textContent = `${s} - ${e}`;
    }
  }
}

// Global mouseup — commit the drag selection
document.addEventListener('mouseup', async function(e) {
  if (!dragState.active) return;
  try {
    const currentH = dragState.currentHour !== null ? dragState.currentHour : dragState.startHour;
    const selectedDay = dragState.dayStr;
    let startH, endH;
    if (currentH >= dragState.startHour) {
      startH = dragState.startHour;
      endH   = currentH + 0.5;
    } else {
      startH = currentH;
      endH   = dragState.startHour;
    }

    // Clamp within grid limits
    if (startH < 8) {
      startH = 8;
    }
    if (endH > 24) {
      endH = 24;
    }

    const isAdminUser = localStorage.getItem('admin_logged_in') === 'true';
    const isLoggedIn  = localStorage.getItem('user_logged_in') === 'true';

    // Check if range contains any past slots or slots exceeding concurrency limit
    let isRangeInvalid = false;
    let isConcurrencyExceeded = false;
    for (let h = startH; h < endH; h += 0.5) {
      if (isSlotPast(selectedDay, h, isAdminUser)) {
        isRangeInvalid = true;
        break;
      }
      if (getConcurrentBookingCount(selectedDay, h) >= 2) {
        isConcurrencyExceeded = true;
        break;
      }
    }

    clearDragState();
    if (!selectedDay) return;

    if (isRangeInvalid) {
      showToast('Бронювання неможливе: вибраний час містить вже минулі слоти.', 'warning');
      return;
    }
    if (isConcurrencyExceeded) {
      showToast('Бронювання неможливе: вибраний час повністю зайнятий іншими бронюваннями.', 'warning');
      return;
    }

    if (!isLoggedIn) { openLoginModal(); return; }

    const todayStr = getLocalDateString(new Date());
    const nowHour  = new Date().getHours();

    // Role-based validations
    if (!isAdminUser && selectedDay <= todayStr) {
      showToast('Бронювання неможливе на сьогоднішній або минулі дні. Виберіть майбутній день.', 'warning');
      return;
    }

    document.getElementById('booking-date').value = selectedDay;
    populateTimeDropdowns();

    document.getElementById('start-time').value = formatTimeDecimal(startH);
    updateEndTimeOptions();
    document.getElementById('end-time').value   = formatTimeDecimal(endH);

    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      await switchView('book');
      const nameInput = document.getElementById('user-name');
      if (nameInput) nameInput.focus();
    } else {
      openBookingModal();
    }
  } catch (err) {
    console.error("Error in mouseup event handler:", err);
    clearDragState();
  }
});

// Escape cancels an active drag, or returns to calendar if in booking view/modal
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (dragState.active) {
      clearDragState();
    } else {
      const bookView = document.getElementById('view-book');
      if (bookView && bookView.classList.contains('active')) {
        switchView('calendar');
      }
      const bookingModal = document.getElementById('booking-modal-overlay');
      if (bookingModal && bookingModal.classList.contains('active')) {
        closeBookingModal();
      }
    }
  }
});

// ── Weekly Calendar ───────────────────────────────────────────────────────────
function renderWeeklyCalendar() {
  const grid = document.getElementById('weekly-grid');
  grid.innerHTML = '';

  const weekDays = [];
  const monday   = new Date(currentWeekStartDate);
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    weekDays.push(day);
  }

  // Month header
  const firstDay = weekDays[0], lastDay = weekDays[6];
  let headerText = `${monthNamesUk[firstDay.getMonth()]} ${firstDay.getFullYear()}`;
  if (firstDay.getFullYear() !== lastDay.getFullYear()) {
    headerText = `${monthNamesShortUk[firstDay.getMonth()]} ${firstDay.getFullYear()} - ${monthNamesShortUk[lastDay.getMonth()]} ${lastDay.getFullYear()}`;
  } else if (firstDay.getMonth() !== lastDay.getMonth()) {
    headerText = `${monthNamesShortUk[firstDay.getMonth()]} - ${monthNamesShortUk[lastDay.getMonth()]} ${firstDay.getFullYear()}`;
  }
  document.getElementById('calendar-month-year').textContent = headerText;

  // Corner cell
  const timeHeader = document.createElement('div');
  timeHeader.className = 'calendar-header-cell';
  timeHeader.style.borderLeft = 'none';
  grid.appendChild(timeHeader);

  // Day column headers
  const todayStr = getLocalDateString(new Date());
  weekDays.forEach(day => {
    const cell   = document.createElement('div');
    const isToday = getLocalDateString(day) === todayStr;
    cell.className = `calendar-header-cell ${isToday ? 'today' : ''}`;
    cell.innerHTML = `<div class="calendar-header-dayname">${dayNamesUk[day.getDay()]}</div><div class="calendar-header-daynumber">${day.getDate()}</div>`;
    grid.appendChild(cell);
  });

  // Time labels column
  const timeCol = document.createElement('div');
  timeCol.className = 'calendar-time-col';
  for (let h = 8; h < 24; h++) {
    const label = document.createElement('div');
    label.className = 'calendar-time-label';
    label.textContent = `${String(h).padStart(2,'0')}:00`;
    timeCol.appendChild(label);
  }
  grid.appendChild(timeCol);

  // Day columns
  const isAdminUser  = localStorage.getItem('admin_logged_in') === 'true';
  const nowHour      = new Date().getHours();
  const nowMinute    = new Date().getMinutes();
  const nowDecimal   = nowHour + nowMinute / 60;  // e.g. 14.5 at 14:30
  const nextBookable = nowHour + 1;

  weekDays.forEach(day => {
    const dayStr = getLocalDateString(day);
    const dayCol = document.createElement('div');
    const isToday = dayStr === todayStr;
    dayCol.className = `calendar-day-col ${isToday ? 'today-col' : ''}`;
    if (isToday) {
      dayCol.id = 'today-calendar-col';
    }
    dayCol.dataset.date = dayStr;

    const slotCells = []; // 32 half-div elements per column

    for (let h = 8; h < 24; h++) {
      const cell = document.createElement('div');

      // Whole-cell past check: past date OR today before bookable hours (role-based)
      let isCellPast = false;
      if (dayStr < todayStr) {
        isCellPast = true;
      } else if (dayStr === todayStr) {
        if (isAdminUser) {
          isCellPast = (h + 0.5) < nowDecimal; // past if both halves are past
        } else {
          isCellPast = true; // residents cannot book today at all
        }
      }
      cell.className   = isCellPast ? 'calendar-slot-cell past-slot' : 'calendar-slot-cell bookable';
      cell.dataset.date = dayStr;
      cell.dataset.hour = h;

      // Build two half-divs per cell
      [0, 0.5].forEach((halfOffset, halfIdx) => {
        const halfHour = h + halfOffset;  // e.g. 9 or 9.5
        const halfDiv  = document.createElement('div');
        halfDiv.className = `slot-half ${halfIdx === 0 ? 'top-half' : 'bottom-half'}`;
        halfDiv.dataset.hour = halfHour;
        halfDiv.dataset.date = dayStr;

        const isUnavailable = isSlotUnavailable(dayStr, halfHour, isAdminUser);
        const isPast = (dayStr < todayStr) || (dayStr === todayStr && (isAdminUser ? halfHour < nowDecimal : true));

        if (isUnavailable) {
          halfDiv.classList.add('unavailable-half');
          if (isPast) {
            halfDiv.classList.add('past-half');
            halfDiv.title = 'Минулий час — бронювання недоступне';
          } else {
            if (getConcurrentBookingCount(dayStr, halfHour) >= 2) {
              halfDiv.title = 'Час повністю зайнятий (максимум 2 одночасно)';
            } else {
              halfDiv.title = 'Час вже зайнятий (але можна перетягнути поруч)';
            }
          }
        } else {
          halfDiv.title = `Натисніть або перетягніть з ${formatTimeDecimal(halfHour)}`;
        }

        // Attach mousedown to all future cells (including occupied ones, excluding past)
        if (!isPast) {
          halfDiv.addEventListener('mousedown', function(ev) {
            if (ev.button !== 0) return;
            ev.preventDefault();
            if (localStorage.getItem('user_logged_in') !== 'true') { openLoginModal(); return; }

            if (getConcurrentBookingCount(dayStr, halfHour) >= 2) {
              showToast('Цей час повністю зайнятий іншими бронюваннями (максимум 2 одночасно).', 'warning');
              return;
            }

            clearDragState();

            const preview = document.createElement('div');
            preview.className = 'calendar-drag-preview';
            const lbl = document.createElement('div');
            lbl.className = 'calendar-drag-preview-label';
            preview.appendChild(lbl);
            dayCol.appendChild(preview);

            dragState.active      = true;
            dragState.dayStr      = dayStr;
            dragState.startHour   = halfHour;
            dragState.currentHour = halfHour;
            dragState.dayColEl    = dayCol;
            dragState.previewEl   = preview;
            dragState.cells       = slotCells;

            document.body.classList.add('calendar-dragging');
            updateDragPreview();
          });
        }

        // Touch: long-press (400ms) starts drag, then finger drag extends selection
        if (!isPast) {
          let touchLongPressTimer = null;
          let touchStartX = 0, touchStartY = 0;
          let touchDragActive = false;

          halfDiv.addEventListener('touchstart', function(ev) {
            if (localStorage.getItem('user_logged_in') !== 'true') return;
            const touch = ev.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            touchDragActive = false;

            touchLongPressTimer = setTimeout(function() {
              if (getConcurrentBookingCount(dayStr, halfHour) >= 2) {
                showToast('Цей час повністю зайнятий іншими бронюваннями (максимум 2 одночасно).', 'warning');
                return;
              }
              clearDragState();
              const preview = document.createElement('div');
              preview.className = 'calendar-drag-preview';
              const lbl = document.createElement('div');
              lbl.className = 'calendar-drag-preview-label';
              preview.appendChild(lbl);
              dayCol.appendChild(preview);
              dragState.active      = true;
              dragState.dayStr      = dayStr;
              dragState.startHour   = halfHour;
              dragState.currentHour = halfHour;
              dragState.dayColEl    = dayCol;
              dragState.previewEl   = preview;
              dragState.cells       = slotCells;
              document.body.classList.add('calendar-dragging');
              touchDragActive = true;
              ev.preventDefault();
              updateDragPreview();
            }, 400);
          }, { passive: true });

          halfDiv.addEventListener('touchmove', function(ev) {
            const touch = ev.touches[0];
            const dx = touch.clientX - touchStartX;
            const dy = touch.clientY - touchStartY;
            // Cancel long-press if finger moves significantly before 400ms
            if (!touchDragActive && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
              clearTimeout(touchLongPressTimer);
              touchLongPressTimer = null;
              return;
            }
            if (!touchDragActive || !dragState.active) return;
            ev.preventDefault();
            // Find which slot-half the finger is currently over
            const el = document.elementFromPoint(touch.clientX, touch.clientY);
            if (el) {
              const targetHalf = el.closest('.slot-half');
              if (targetHalf && targetHalf.dataset.date === dragState.dayStr) {
                const h = parseFloat(targetHalf.dataset.hour);
                if (!isNaN(h)) {
                  dragState.currentHour = h;
                  updateDragPreview();
                }
              }
            }
          }, { passive: false });

          halfDiv.addEventListener('touchend', function(ev) {
            clearTimeout(touchLongPressTimer);
            touchLongPressTimer = null;
            if (!touchDragActive || !dragState.active) return;
            touchDragActive = false;
            // Reuse the mouseup commit logic
            document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          });
        }

        // Attach mouseenter to all halves so dragging coordinates update smoothly even over unavailable/past slots
        halfDiv.addEventListener('mouseenter', function() {
          if (!dragState.active || dragState.dayStr !== dayStr) return;
          dragState.currentHour = halfHour;
          updateDragPreview();
        });

        slotCells.push(halfDiv);
        cell.appendChild(halfDiv);
      });

      dayCol.appendChild(cell);
    }

    // Approved & Pending bookings
    const dayBookings = bookings.filter(b => (b.status === 'approved' || b.status === 'pending') && b.date === dayStr);
    dayBookings.sort((a, b) => {
      const sa = timeToDecimal(a.startTime), sb = timeToDecimal(b.startTime);
      if (sa !== sb) return sa - sb;
      return (timeToDecimal(b.endTime) - sb) - (timeToDecimal(a.endTime) - sa);
    });

    // Cluster overlapping events
    const clusters = [];
    dayBookings.forEach(b => {
      const bs = timeToDecimal(b.startTime), be = timeToDecimal(b.endTime);
      let added = false;
      for (const cluster of clusters) {
        if (cluster.some(c => bs < timeToDecimal(c.endTime) && be > timeToDecimal(c.startTime))) {
          cluster.push(b); added = true; break;
        }
      }
      if (!added) clusters.push([b]);
    });

    clusters.forEach(cluster => {
      const columns = [];
      cluster.forEach(b => {
        const bs = timeToDecimal(b.startTime), be = timeToDecimal(b.endTime);
        let col = 0;
        while (true) {
          if (!columns[col]) { columns[col] = [b]; b.col = col; break; }
          if (!columns[col].some(c => bs < timeToDecimal(c.endTime) && be > timeToDecimal(c.startTime))) {
            columns[col].push(b); b.col = col; break;
          }
          col++;
        }
      });
      const numCols = columns.length;
      cluster.forEach(b => { b.totalCols = numCols; });
    });

    dayBookings.forEach(b => {
      const startDec = timeToDecimal(b.startTime);
      const endDec   = timeToDecimal(b.endTime);
      const colWidth = 100 / (b.totalCols || 1);
      const colLeft  = (b.col || 0) * colWidth;

       const eventDiv = document.createElement('div');
      const sType    = b.type.toLowerCase().trim().replace(/[^a-zа-яєіїґ]/gi, '-');
      const isHalfHour = (endDec - startDec) <= 0.5;
      eventDiv.className  = `calendar-event event-type-${sType}`;
      if (b.status === 'pending') {
        eventDiv.classList.add('event-pending');
      }
      if (isHalfHour) {
        eventDiv.classList.add('event-half-hour');
      }
      eventDiv.style.top    = `${(startDec - 8) * 60}px`;
      eventDiv.style.height = `${(endDec - startDec) * 60}px`;
      eventDiv.style.left   = `calc(${colLeft}% + 2px)`;
      eventDiv.style.width  = `calc(${colWidth}% - 4px)`;
      eventDiv.dataset.origLeft = `calc(${colLeft}% + 2px)`;
      eventDiv.dataset.origWidth = `calc(${colWidth}% - 4px)`;
      eventDiv.dataset.bookingId = b.id;
      
      if (isHalfHour) {
        eventDiv.innerHTML = `
          <div class="half-hour-container" style="display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 0.25rem; overflow: hidden; white-space: nowrap; height: 100%;">
            <span class="half-hour-name" style="font-weight: 800; font-size: 0.7rem; font-family: var(--font-display); text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 1; min-width: 0;"><strong>${b.userName}</strong>${b.status === 'pending' ? ' (очікує)' : ''}</span>
            <span class="half-hour-time" style="font-weight: 800; font-size: 0.6rem; font-family: var(--font-display); opacity: 0.95; flex-shrink: 0; margin-left: auto;">${b.startTime}-${b.endTime}</span>
          </div>
        `;
      } else {
        eventDiv.innerHTML = `
          <div class="calendar-event-time">${b.startTime} - ${b.endTime}</div>
          <div class="calendar-event-title"><strong>${b.userName}</strong>${b.status === 'pending' ? ' <span style="font-size:0.65rem;font-weight:normal;opacity:0.85;">(очікує)</span>' : ''}</div>
          <div style="font-size:0.65rem;opacity:0.8;margin-top:2px;">${capitalize(b.type)}</div>
        `;
      }

      let hasDragged = false;
      eventDiv.addEventListener('mousedown', function(ev) {
        if (ev.button !== 0) return;
        hasDragged = false;
        
        if (localStorage.getItem('user_logged_in') !== 'true') { openLoginModal(); return; }

        const startX = ev.clientX;
        const startY = ev.clientY;
        const rect = dayCol.getBoundingClientRect();
        const clickY = ev.clientY - rect.top;
        const clickedHour = Math.floor(clickY / 30) * 0.5 + 8;

        if (isSlotPast(dayStr, clickedHour, isAdminUser)) return;

        function onMouseMove(moveEv) {
          if (Math.hypot(moveEv.clientX - startX, moveEv.clientY - startY) > 5) {
            hasDragged = true;
            document.removeEventListener('mousemove', onMouseMove);
            
            clearDragState();

            const preview = document.createElement('div');
            preview.className = 'calendar-drag-preview';
            const lbl = document.createElement('div');
            lbl.className = 'calendar-drag-preview-label';
            preview.appendChild(lbl);
            dayCol.appendChild(preview);

            dragState.active      = true;
            dragState.dayStr      = dayStr;
            dragState.startHour   = clickedHour;
            dragState.currentHour = clickedHour;
            dragState.dayColEl    = dayCol;
            dragState.previewEl   = preview;
            dragState.cells       = slotCells;

            document.body.classList.add('calendar-dragging');
            updateDragPreview();
          }
        }
        function onMouseUp() {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        }
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });

      eventDiv.addEventListener('click', function(ev) {
        ev.stopPropagation();
        if (hasDragged) return;
        showModal(b.id);
      });

      dayCol.appendChild(eventDiv);
    });

    // Set data-free-side on slot-halves depending on active overlapping bookings
    slotCells.forEach(halfDiv => {
      const halfHour = parseFloat(halfDiv.dataset.hour);
      const overlapping = dayBookings.filter(b => {
        const startDec = timeToDecimal(b.startTime);
        const endDec   = timeToDecimal(b.endTime);
        return halfHour >= startDec && halfHour < endDec;
      });

      if (overlapping.length === 0) {
        halfDiv.dataset.freeSide = 'full';
      } else if (overlapping.length === 1) {
        const b = overlapping[0];
        if (b.totalCols === 2) {
          if (b.col === 1) {
            halfDiv.dataset.freeSide = 'left';
          } else {
            halfDiv.dataset.freeSide = 'right';
          }
        } else {
          halfDiv.dataset.freeSide = 'right';
        }
      } else {
        halfDiv.dataset.freeSide = 'none';
      }
    });

    grid.appendChild(dayCol);
  });

  updateTimelineMarker();

  // Adjust half-hour event labels after attaching them to the DOM
  document.querySelectorAll('.calendar-event.event-half-hour').forEach(eventDiv => {
    const nameEl = eventDiv.querySelector('.half-hour-name');
    const timeEl = eventDiv.querySelector('.half-hour-time');
    if (nameEl && timeEl) {
      const padding = 16;
      if (nameEl.scrollWidth + timeEl.offsetWidth + padding > eventDiv.clientWidth) {
        timeEl.style.display = 'none';
      }
    }
  });
}

window.changeWeek = function(direction) {
  currentWeekStartDate.setDate(currentWeekStartDate.getDate() + (direction * 7));
  renderWeeklyCalendar();
};

window.goToday = function() {
  currentWeekStartDate = getMonday(new Date());
  renderWeeklyCalendar();
};

// ── Event Detail Modal ────────────────────────────────────────────────────────
window.showModal = function(id) {
  const b = bookings.find(item => item.id === id);
  if (!b) return;

  activeModalBookingId = id;

  document.getElementById('cancel-form-container').style.display = 'none';
  document.getElementById('cancel-reason').value        = '';
  document.getElementById('cancel-confirm-email').value = '';

  const confirmBtn = document.querySelector('#cancel-form-container button.btn-danger');
  if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerHTML = 'Підтвердити'; }

  const actionsContainer  = document.getElementById('modal-actions-container');
  const cancelResidentBtn = document.getElementById('btn-cancel-resident');
  const cancelOrganizerBtn = document.getElementById('btn-cancel-organizer');
  const adminReviewContainer = document.getElementById('modal-admin-review-container');
  const withdrawContainer = document.getElementById('modal-withdraw-container');

  // Hide all action containers by default
  if (adminReviewContainer) adminReviewContainer.style.display = 'none';
  if (withdrawContainer) withdrawContainer.style.display = 'none';
  actionsContainer.style.display = 'none';

  const isAdmin = localStorage.getItem('admin_logged_in') === 'true' ||
                  localStorage.getItem('user_email') === 'horovod.info@gmail.com';

  if (b.status === 'pending') {
    if (isAdmin) {
      // Admin sees approve/reject only — no cancel needed for unconfirmed bookings
      if (adminReviewContainer) adminReviewContainer.style.display = 'flex';
    } else {
      // Client sees simple withdraw button (no reason needed)
      const loggedEmail  = (localStorage.getItem('user_email') || '').toLowerCase().trim();
      const bookingEmail = (b.email || '').toLowerCase().trim();
      if (loggedEmail === bookingEmail && withdrawContainer) {
        withdrawContainer.style.display = 'flex';
      }
    }
  } else if (b.status === 'approved') {
    if (isAdmin) {
      // Admin sees cancel (organizer)
      actionsContainer.style.display = 'flex';
      if (cancelResidentBtn)  cancelResidentBtn.style.display  = 'none';
      if (cancelOrganizerBtn) cancelOrganizerBtn.style.display = 'block';
    } else {
      // Client sees cancel (resident) with reason
      const loggedEmail  = (localStorage.getItem('user_email') || '').toLowerCase().trim();
      const bookingEmail = (b.email || '').toLowerCase().trim();
      if (loggedEmail === bookingEmail) {
        actionsContainer.style.display = 'flex';
        if (cancelResidentBtn)  cancelResidentBtn.style.display  = 'block';
        if (cancelOrganizerBtn) cancelOrganizerBtn.style.display = 'none';
      }
    }
  }

  document.getElementById('modal-band-name').textContent = b.userName;

  const statusMap = { pending: 'очікує', approved: 'підтверджено', rejected: 'відхилено', cancelled: 'скасовано' };
  const badge = document.getElementById('modal-status-badge');
  badge.className   = `badge ${b.status}`;
  badge.textContent = statusMap[b.status] || b.status;

  const typeBadgeEl = document.getElementById('modal-type-badge');
  typeBadgeEl.textContent = capitalize(b.type);
  const typeColorMap = {
    'репетиція': 'var(--brand-blue-dark)',
    'чилл': 'var(--brand-pink)',
    'робота': 'var(--brand-green)',
    'заниматися самому': 'var(--brand-red)',
    'заниматься самому': 'var(--brand-red)',
    'інше': 'var(--brand-orange)'
  };
  typeBadgeEl.style.color = typeColorMap[b.type.toLowerCase().trim()] || 'var(--primary)';
  document.getElementById('modal-time').textContent       = `${formatHumanDate(b.date)} з ${b.startTime} до ${b.endTime}`;
  document.getElementById('modal-contact').textContent    = b.email;
  document.getElementById('modal-notes').textContent      = b.notes;

  document.getElementById('event-modal').classList.add('active');
};

window.closeModal = function() {
  document.getElementById('event-modal').classList.remove('active');
};

window.approveFromModal = function() {
  if (!activeModalBookingId) return;
  handleApprove(activeModalBookingId);
  closeModal();
  renderWeeklyCalendar();
};

window.rejectFromModal = function() {
  if (!activeModalBookingId) return;
  handleReject(activeModalBookingId);
  closeModal();
  renderWeeklyCalendar();
};

window.withdrawFromModal = async function() {
  if (!activeModalBookingId) return;
  const b = bookings.find(item => item.id === activeModalBookingId);
  if (!b || b.status !== 'pending') return;
  const prevStatus = b.status;
  const prevCancelReason = b.cancelReason;
  b.status = 'cancelled';
  b.cancelReason = 'Відкликано клієнтом до підтвердження';
  closeModal();
  renderWeeklyCalendar();
  renderAdminRequests();
  renderUserCabinet();
  addLog('cancel', `[ВІДКЛИКАНО]\nКому: ${b.email}\nКому: horovod.info@gmail.com\nЗапит від "${b.userName}" (тип: ${b.type}) на ${formatHumanDate(b.date)} о ${b.startTime}-${b.endTime} відкликано клієнтом.`, 'cancelled', 'Відкликано', `Запит від <strong>${b.userName}</strong> (тип: ${b.type}) на <strong>${formatHumanDate(b.date)}</strong> о <strong>${b.startTime}-${b.endTime}</strong> відкликано.`, b.id);
  saveData('logs_only');
  const { success } = await updateBookingStatusInDB(b);
  if (!success) {
    b.status = prevStatus;
    b.cancelReason = prevCancelReason;
    renderWeeklyCalendar();
    renderAdminRequests();
    renderUserCabinet();
    showToast('Помилка збереження. Перевірте з\'єднання та спробуйте ще раз.', 'error');
    return;
  }
  localStorage.setItem('rehearsal_bookings_horovod_hub_auth', JSON.stringify(bookings));
  showToast(`Запит на бронювання для ${b.userName} відкликано.`, 'success');
};

window.showActivityDetail = function(idx) {
  const log = logs[idx];
  if (!log) return;

  const modal = document.getElementById('activity-detail-modal');
  const titleEl = document.getElementById('activity-detail-title');
  const badgeEl = document.getElementById('activity-detail-badge');
  const timeEl = document.getElementById('activity-detail-time');
  const bodyEl = document.getElementById('activity-detail-body');

  if (!modal || !badgeEl || !timeEl || !bodyEl) return;

  let status = log.status || 'info';
  let title = log.title || 'Подія';

  badgeEl.className = `log-badge badge-${status}`;
  badgeEl.textContent = title;

  // Manual color styling overrides for neobrutalist badge states
  if (status === 'rejected') {
    badgeEl.style.backgroundColor = 'var(--brand-red)';
    badgeEl.style.color = '#ffffff';
  } else if (status === 'cancelled') {
    badgeEl.style.backgroundColor = 'var(--brand-orange)';
    badgeEl.style.color = '#ffffff';
  } else {
    badgeEl.style.backgroundColor = '';
    badgeEl.style.color = '';
  }

  timeEl.textContent = log.time;
  bodyEl.innerHTML = (log.body || log.message || '').replace(/\n/g, '<br>');

  modal.classList.add('active');
};

window.closeActivityDetailModal = function() {
  const modal = document.getElementById('activity-detail-modal');
  if (modal) modal.classList.remove('active');
};

window.toggleSidebar = function() {
  const drawer = document.getElementById('sidebar-drawer');
  const overlay = document.getElementById('drawer-overlay');
  if (!drawer) return;
  
  const isOpen = drawer.classList.contains('open');
  if (isOpen) {
    drawer.classList.remove('open');
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(() => { overlay.style.display = 'none'; }, 300);
    }
    closeActivityDetailModal();
  } else {
    drawer.classList.add('open');
    if (overlay) {
      overlay.style.display = 'block';
      // Force reflow
      overlay.offsetHeight;
      overlay.classList.add('active');
    }
    // Clear unread badge
    const badge = document.getElementById('feed-unread-badge');
    if (badge) {
      badge.textContent = '0';
      badge.style.display = 'none';
    }
  }
};

// ── Time Selector Chips Synchronization ──────────────────────────────────────
function syncTimeChips() {
  const startSelect = document.getElementById('start-time');
  const endSelect = document.getElementById('end-time');
  if (!startSelect || !endSelect) return;

  const startVal = startSelect.value;
  const endVal = endSelect.value;

  document.querySelectorAll('#start-time-chips .time-chip').forEach(chip => {
    if (chip.dataset.val === startVal) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });

  document.querySelectorAll('#end-time-chips .time-chip').forEach(chip => {
    if (chip.dataset.val === endVal) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
}
window.syncTimeChips = syncTimeChips;

// ── Visual Timeline Progress Line ────────────────────────────────────────────
function updateTimelineMarker() {
  const existingLine = document.getElementById('calendar-timeline-line');
  if (existingLine) existingLine.remove();

  const todayCol = document.getElementById('today-calendar-col');
  if (!todayCol) return;

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const decimalTime = currentHour + currentMinute / 60;

  // Only display if within calendar visible range (08:00 - 24:00)
  if (decimalTime >= 8 && decimalTime < 24) {
    const line = document.createElement('div');
    line.id = 'calendar-timeline-line';
    line.className = 'calendar-timeline-line';
    
    // Position offset: 60px per hour from 8:00
    const topOffset = (decimalTime - 8) * 60;
    line.style.top = `${topOffset}px`;
    
    todayCol.appendChild(line);
  }
}
window.updateTimelineMarker = updateTimelineMarker;

// ── Alternative Time Slot Suggestions ─────────────────────────────────────────
function checkSuggestions(date, type, startTime, endTime) {
  const suggestions = [];
  const startDec = timeToDecimal(startTime);
  const endDec = timeToDecimal(endTime);
  const duration = endDec - startDec;
  const targetDuration = duration > 0 ? duration : 1.0; // default to 1h if invalid
  
  const isAdmin = localStorage.getItem('admin_logged_in') === 'true';
  const startHour = 8;
  const endHour = 24;
  const isExclusive = isExclusiveType(type);

  // Scan in 30-min intervals for available slots of matching duration
  for (let h = startHour; h <= endHour - targetDuration; h += 0.5) {
    const startStr = formatTimeDecimal(h);
    const endStr = formatTimeDecimal(h + targetDuration);
    
    let available = true;
    for (let slotHour = h; slotHour < h + targetDuration; slotHour += 0.5) {
      // 1. Check basic slot availability (past or fully occupied >= 2)
      if (isSlotUnavailable(date, slotHour, isAdmin)) {
        available = false;
        break;
      }
      
      // 2. For exclusive booking types, verify there is no exclusive overlap
      if (isExclusive) {
        const hasExclusiveOverlap = bookings.some(b => {
          if (b.status !== 'approved' || b.date !== date) return false;
          if (!isExclusiveType(b.type)) return false;
          const bStart = timeToDecimal(b.startTime);
          const bEnd = timeToDecimal(b.endTime);
          return slotHour >= bStart && slotHour < bEnd;
        });
        if (hasExclusiveOverlap) {
          available = false;
          break;
        }
      }
    }
    
    if (available) {
      suggestions.push({
        start: startStr,
        end: endStr,
        diff: Math.abs(h - startDec)
      });
    }
  }

  // Sort by proximity to requested start time and pick top 3
  suggestions.sort((a, b) => a.diff - b.diff);
  return suggestions.slice(0, 3);
}
window.checkSuggestions = checkSuggestions;

// Quick-Book templates removed

// ── Room Equipment Issues Tracker ────────────────────────────────────────────
let issues = [];

window.openIssueModal = function() {
  document.getElementById('issue-title').value = '';
  document.getElementById('issue-description').value = '';
  document.getElementById('issue-category').value = 'sound';
  document.getElementById('issue-modal').classList.add('active');
};

window.closeIssueModal = function() {
  document.getElementById('issue-modal').classList.remove('active');
};

window.handleIssueSubmit = function(e) {
  e.preventDefault();
  const title = document.getElementById('issue-title').value.trim();
  const category = document.getElementById('issue-category').value;
  const description = document.getElementById('issue-description').value.trim();

  if (!title || !description) {
    showToast('Будь ласка, заповніть всі обов\'язкові поля.', 'error');
    return;
  }

  const userEmail = localStorage.getItem('user_email') || 'Гість';
  const newIssue = {
    id: 'issue_' + Date.now(),
    title,
    category,
    description,
    reportedBy: userEmail,
    reportedAt: new Date().toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }),
    resolved: false
  };

  issues.push(newIssue);
  localStorage.setItem('rehearsal_issues_horovod_hub_auth', JSON.stringify(issues));

  // Persist to Supabase issues table (fire-and-forget with fallback)
  if (isSupabaseEnabled) {
    supabaseClient.from('issues').insert(newIssue)
      .then(({ error }) => {
        if (error) console.warn('Supabase issue insert failed:', error);
      })
      .catch(err => console.warn('Supabase issue insert exception:', err));
  }

  // Duplicate notification to the sidebar log feed
  const categoryLabels = { sound: 'Звук', instruments: 'Апаратура', cables: 'Кабелі', other: 'Інше' };
  const catLabel = categoryLabels[category] || category;
  addLog(
    'issue-reported',
    `Кому: horovod.info@gmail.com\n[НЕПОЛАДКА] ${title}: ${description}`,
    'rejected',
    'Неполадка',
    `Повідомлено про несправність: [${catLabel.toUpperCase()}] <strong>"${title}"</strong> (${description}) від <strong>${userEmail}</strong>.`,
    newIssue.id
  );
  
  closeIssueModal();
  document.getElementById('issue-form').reset();
  renderIssues();
  showToast('Повідомлення про несправність надіслано.', 'success');
};

window.openResolveIssueModal = function(issueId) {
  const issue = issues.find(i => i.id === issueId);
  if (!issue) return;

  document.getElementById('resolve-issue-id').value = issueId;

  const howInput = document.getElementById('resolve-how');
  const whenInput = document.getElementById('resolve-when');
  const msgInput = document.getElementById('resolve-msg');

  howInput.value = '';
  whenInput.value = '';

  const updateDraft = () => {
    const howText = howInput.value.trim() || '[опис робіт]';
    const whenText = whenInput.value.trim() || '[термін]';
    msgInput.value = `Вітаємо! Дякуємо за звіт про проблему з "${issue.title}".\nМи запланували наступні роботи: ${howText}.\nОчікуваний час вирішення: ${whenText}.\nДякуємо за допомогу в покращенні нашого простору!\nЗ повагою, команда HOROVOD HUB.`;
  };

  updateDraft();

  howInput.oninput = updateDraft;
  whenInput.oninput = updateDraft;

  document.getElementById('resolve-issue-modal').classList.add('active');
};

window.closeResolveIssueModal = function() {
  document.getElementById('resolve-issue-modal').classList.remove('active');
};

window.submitResolveIssue = function(e) {
  e.preventDefault();
  const issueId = document.getElementById('resolve-issue-id').value;
  const how = document.getElementById('resolve-how').value.trim();
  const when = document.getElementById('resolve-when').value.trim();
  const msg = document.getElementById('resolve-msg').value.trim();

  const issueIndex = issues.findIndex(i => i.id === issueId);
  if (issueIndex === -1) return;

  const issue = issues[issueIndex];

  // Add message to reporter (activity log)
  addLog(
    'notify-accept',
    `Кому: ${issue.reportedBy}\n[ВІДПОВІДЬ НА ЗВЕРНЕННЯ] ${msg}`,
    'approved',
    'Повідомлено',
    `Звіт від <strong>${issue.reportedBy}</strong> про проблему <strong>"${issue.title}"</strong> прийнято.<br>Відповідь автору звернення:<br><em>${msg.replace(/\n/g, '<br>')}</em>`
  );

  // Add to News Feed
  const newsTitle = `Вирішено проблему: ${issue.title}`;
  const newsContent = `Роботи: ${how}\nТермін: ${when}\nСтатус: Вирішено & прийнято в роботу admin.`;
  addNewsItem(newsTitle, newsContent, 'resolved');

  // Add resolution notice to activity sidebar log feed
  addLog(
    'issue-resolved',
    `[ВИРІШЕНО] ${issue.title} відремонтовано`,
    'approved',
    'Вирішено',
    `Несправність <strong>"${issue.title}"</strong> успішно усунено: <em>${how}</em>.`
  );

  // Remove resolved issue from active list
  issues = issues.filter(i => i.id !== issueId);
  localStorage.setItem('rehearsal_issues_horovod_hub_auth', JSON.stringify(issues));

  // Sync resolution to Supabase (delete resolved issue)
  if (isSupabaseEnabled) {
    supabaseClient.from('issues').delete().eq('id', issueId)
      .then(({ error }) => {
        if (error) console.warn('Supabase issue delete failed:', error);
      })
      .catch(err => console.warn('Supabase issue delete exception:', err));
  }

  closeResolveIssueModal();
  renderIssues();
  showToast('Ремонт зареєстровано, репортера сповіщено, анонс додано в стрічку.', 'success');
};

window.dismissIssue = function(issueId) {
  const isAdmin = localStorage.getItem('admin_logged_in') === 'true';
  if (!isAdmin) { showToast('Доступ обмежено. Тільки для адміністратора!', 'error'); return; }
  const issue = issues.find(i => i.id === issueId);
  if (!issue) return;
  issue.resolved = true;
  issue.resolvedAt = new Date().toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  issue.resolution = 'Відхилено адміністратором.';
  localStorage.setItem('rehearsal_issues_horovod_hub_auth', JSON.stringify(issues));
  if (isSupabaseEnabled) {
    supabaseClient.from('issues').update({ resolved: true, resolvedAt: issue.resolvedAt, resolution: issue.resolution }).eq('id', issueId)
      .then(({ error }) => { if (error) console.warn('Supabase dismiss issue failed:', error); });
  }
  renderIssues();
  renderLogs();
  showToast('Скаргу відхилено.', 'warning');
};

window.resolveIssue = function(issueId) {
  const isAdmin = localStorage.getItem('admin_logged_in') === 'true' ||
                  localStorage.getItem('user_email') === 'horovod.info@gmail.com';
  if (!isAdmin) {
    showToast('Доступ обмежено. Тільки для адміністратора!', 'error');
    return;
  }
  openResolveIssueModal(issueId);
};

window.addNewsItem = function(title, content, type = 'announcement') {
  const news = JSON.parse(localStorage.getItem('rehearsal_news_feed') || '[]');
  const newItem = {
    id: 'news_' + Date.now(),
    title,
    content,
    type,
    date: new Date().toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
  };
  news.unshift(newItem);
  localStorage.setItem('rehearsal_news_feed', JSON.stringify(news));
  renderNewsFeed();
};

window.renderNewsFeed = function() {
  const newsContainer = document.getElementById('news-feed-list');
  if (!newsContainer) return;

  const news = JSON.parse(localStorage.getItem('rehearsal_news_feed') || '[]');
  if (news.length === 0) {
    newsContainer.innerHTML = '<div style="color: var(--text-secondary); font-size: 0.85rem; padding: 1rem; text-align: center; border: 1px dashed var(--border-color);">Немає нових оголошень або новин.</div>';
    return;
  }

  newsContainer.innerHTML = news.map(item => {
    let icon = '<i class="fa-solid fa-bullhorn" style="color: var(--brand-orange);"></i>';
    let borderCol = 'var(--brand-orange)';
    let badgeLabel = 'Анонс';

    if (item.type === 'resolved') {
      icon = '<i class="fa-solid fa-wrench" style="color: var(--brand-green);"></i>';
      borderCol = 'var(--brand-green)';
      badgeLabel = 'Виправлено';
    }

    return `
      <div class="news-item" style="border-left: 5px solid ${borderCol}; padding: 0.75rem 1rem; background: var(--bg-card); border: 1px solid var(--border-color); border-left-width: 5px; border-radius: var(--radius-sm); box-shadow: var(--shadow-hard-sm); margin-bottom: 0.5rem; transition: var(--transition-smooth);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <span style="font-weight: 800; font-size: 0.85rem; text-transform: uppercase; color: ${borderCol}; display: flex; align-items: center; gap: 0.4rem;">
            ${icon} ${badgeLabel}
          </span>
          <span style="font-size: 0.7rem; color: var(--text-secondary); font-family: var(--font-mono);">${item.date}</span>
        </div>
        <h4 style="margin: 0 0 0.5rem 0; font-size: 0.95rem; font-weight: 900; text-transform: uppercase;">${item.title}</h4>
        <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; white-space: pre-wrap;">${item.content}</p>
      </div>
    `;
  }).join('');
};

function initIssues() {
  const storedIssues = localStorage.getItem('rehearsal_issues_horovod_hub_auth');
  if (storedIssues) {
    issues = JSON.parse(storedIssues);
  } else {
    issues = [];
  }
}
window.initIssues = initIssues;

function renderIssues() {
  const activeContainer = document.getElementById('active-issues-list');
  const adminContainer = document.getElementById('admin-issues-list');
  const banner = document.getElementById('active-issues-banner');
  const bannerText = document.getElementById('active-issues-banner-text');

  const activeIssues = issues.filter(i => !i.resolved);

  // Update visual calendar banner
  if (banner && bannerText) {
    if (activeIssues.length === 0) {
      banner.style.display = 'none';
    } else {
      banner.style.display = 'flex';
      let newHtml = '';
      if (activeIssues.length === 1) {
        const issue = activeIssues[0];
        const categoryLabels = { sound: 'Звук', instruments: 'Апаратура', cables: 'Кабелі', other: 'Інше' };
        const cat = categoryLabels[issue.category] || issue.category;
        newHtml = `<strong>[${cat.toUpperCase()}]</strong> ${issue.title} — ${issue.description}`;
      } else {
        const titles = activeIssues.map(i => i.title).join(', ');
        newHtml = `<strong>${activeIssues.length} активні несправності:</strong> ${titles}`;
      }

      if (bannerText.innerHTML !== newHtml) {
        bannerText.innerHTML = newHtml;
        banner.classList.remove('banner-flash-active');
        void banner.offsetWidth; // Force CSS animation restart
        banner.classList.add('banner-flash-active');
      }
    }
  }

  if (activeContainer) {
    activeContainer.innerHTML = '';
    if (activeIssues.length === 0) {
      activeContainer.innerHTML = '<div class="no-requests">Все обладнання справне. Несправностей немає.</div>';
    }
  }

  if (adminContainer) {
    adminContainer.innerHTML = '';
    if (activeIssues.length === 0) {
      adminContainer.innerHTML = '<div class="no-requests">Немає зареєстрованих скарг.</div>';
    }
  }

  if (activeIssues.length === 0) return;

  const categoryLabels = { sound: 'Звук', instruments: 'Апаратура', cables: 'Кабелі', other: 'Інше' };

  activeIssues.forEach(issue => {
    // 1. Render in resident view card
    if (activeContainer) {
      const resItem = document.createElement('div');
      resItem.className = 'issue-item';
      resItem.innerHTML = `
        <div class="issue-details">
          <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
            <span class="issue-badge category-${issue.category}">${categoryLabels[issue.category] || issue.category}</span>
            <span class="issue-title">${issue.title}</span>
          </div>
          <div class="issue-meta" style="margin-top:0.25rem;">Опис: ${issue.description}</div>
          <div class="issue-meta">Повідомив: ${issue.reportedBy} о ${issue.reportedAt}</div>
        </div>
      `;
      activeContainer.appendChild(resItem);
    }

    // 2. Render in admin panel widget
    if (adminContainer) {
      const admItem = document.createElement('div');
      admItem.className = 'issue-item';
      admItem.innerHTML = `
        <div class="issue-details">
          <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
            <span class="issue-badge category-${issue.category}">${categoryLabels[issue.category] || issue.category}</span>
            <span class="issue-title">${issue.title}</span>
          </div>
          <div class="issue-meta" style="margin-top:0.25rem;">Опис: ${issue.description}</div>
          <div class="issue-meta">Повідомив: ${issue.reportedBy} о ${issue.reportedAt}</div>
        </div>
        <div>
          <button class="btn btn-outline" style="padding:0.4rem 0.8rem; font-size:0.75rem; border-color:var(--brand-green); color:var(--brand-green);" onclick="resolveIssue('${issue.id}')">
            <i class="fa-solid fa-check"></i> Вирішено
          </button>
        </div>
      `;
      adminContainer.appendChild(admItem);
    }
  });
}
window.renderIssues = renderIssues;

// Hide/Show header on scroll on mobile devices
let lastScrollY = window.scrollY;
window.addEventListener('scroll', () => {
  if (window.innerWidth <= 768) {
    const header = document.querySelector('header');
    if (!header) return;
    const currentScrollY = window.scrollY;
    
    // Only hide if scrolled down past a threshold (e.g. 50px) to prevent flickering
    if (currentScrollY > lastScrollY && currentScrollY > 50) {
      header.classList.add('header-hidden');
    } else {
      header.classList.remove('header-hidden');
    }
    lastScrollY = currentScrollY;
  }
}, { passive: true });
