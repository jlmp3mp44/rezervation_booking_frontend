import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../AppContext';

// Utils
const monthNamesUk = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const monthNamesShortUk = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'];
const dayNamesUk = ['Нд','Пн','Вт','Ср','Чт','Пт','Сб'];

function getLocalDateString(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timeToDecimal(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h + (m / 60);
}

function formatTimeDecimal(dec) {
  if (dec >= 24) return '24:00';
  const h = Math.floor(dec);
  const m = Math.round((dec % 1) * 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

const CalendarView = () => {
  const {
    bookings,
    currentWeekStartDate,
    setCurrentWeekStartDate,
    isAdminUser,
    isLoggedIn,
    openModal,
    switchView,
    showToast,
    logs
  } = useAppContext();

  const [dragState, setDragState] = useState({
    active: false,
    dayStr: null,
    startHour: null,
    currentHour: null
  });

  const [timelineOffset, setTimelineOffset] = useState(-1);

  const containerRef = useRef(null);

  // Timeline marker
  useEffect(() => {
    const updateMarker = () => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const decimalTime = currentHour + currentMinute / 60;
      if (decimalTime >= 8 && decimalTime < 24) {
        setTimelineOffset((decimalTime - 8) * 60);
      } else {
        setTimelineOffset(-1);
      }
    };
    updateMarker();
    const int = setInterval(updateMarker, 60000);
    return () => clearInterval(int);
  }, []);

  // Drag handling (global mouse up)
  useEffect(() => {
      const handleMouseUp = (e) => {
          if (!dragState.active) return;

          let startH = Math.min(dragState.startHour, dragState.currentHour);
          let endH = Math.max(dragState.startHour, dragState.currentHour) + 0.5;
          if (startH < 8) startH = 8;
          if (endH > 24) endH = 24;

          setDragState({ active: false, dayStr: null, startHour: null, currentHour: null });

          if (!isLoggedIn) {
              openModal('login');
              return;
          }

          // Trigger booking form state population (using DOM or state if we refactor BookingView)
          // For now, we set a global var or just open the form and let it pick up if needed.
          // In a full React app we'd pass this via Context.
          window.__pendingBookingDrag = {
              date: dragState.dayStr,
              start: formatTimeDecimal(startH),
              end: formatTimeDecimal(endH)
          };

          switchView('book');
      };

      document.addEventListener('mouseup', handleMouseUp);
      return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [dragState, isLoggedIn, openModal, switchView]);

  const changeWeek = (direction) => {
    const nextDate = new Date(currentWeekStartDate);
    nextDate.setDate(nextDate.getDate() + (direction * 7));
    setCurrentWeekStartDate(nextDate);
  };

  const goToday = () => {
    const date = new Date();
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(date.setDate(diff));
    mon.setHours(0, 0, 0, 0);
    setCurrentWeekStartDate(mon);
  };

  // Generate week days
  const weekDays = [];
  const monday = new Date(currentWeekStartDate);
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    weekDays.push(day);
  }

  const todayStr = getLocalDateString(new Date());

  const handleMouseDown = (dayStr, hour) => {
      if (hour < 8 || hour > 24) return;
      if (!isLoggedIn) {
          openModal('login');
          return;
      }
      setDragState({
          active: true,
          dayStr,
          startHour: hour,
          currentHour: hour
      });
  };

  const handleMouseEnter = (dayStr, hour) => {
      if (dragState.active && dragState.dayStr === dayStr) {
          setDragState(prev => ({ ...prev, currentHour: hour }));
      }
  };

  const getConcurrentBookingCount = (dayStr, halfHour) => {
      return bookings.filter(b => {
          if (b.status !== 'approved' && b.status !== 'pending') return false;
          if (b.date !== dayStr) return false;
          const startDec = timeToDecimal(b.startTime);
          const endDec = timeToDecimal(b.endTime);
          return halfHour >= startDec && halfHour < endDec;
      }).length;
  };

  const isSlotPast = (dayStr, halfHour) => {
      const now = new Date();
      const todayStr = getLocalDateString(now);
      const nowDecimal = now.getHours() + now.getMinutes() / 60;

      if (dayStr < todayStr) return true;
      if (dayStr === todayStr) {
          if (isAdminUser) return halfHour < nowDecimal;
          return true; // Residents cannot book today
      }
      return false;
  };

  const isSlotUnavailable = (dayStr, halfHour) => {
      if (isSlotPast(dayStr, halfHour)) return true;
      return getConcurrentBookingCount(dayStr, halfHour) >= 2;
  };

  return (
    <section id="view-calendar" className="view-section active">
      <div className="card" style={{ padding: '1.5rem' }}>

        {/* Latest Activity Banner placeholder based on logs */}
        {logs.length > 0 && (
          <div id="latest-activity-banner" style={{ display: 'flex', cursor: 'pointer', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', background: 'var(--bg-card-hover)', border: 'var(--border-thin)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', marginBottom: '1.25rem', boxShadow: 'var(--shadow-hard-sm)' }}>
            <span style={{ fontWeight: 800, color: 'var(--brand-orange)', display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}>
              <i className="fa-solid fa-bullhorn"></i> ОСТАННЯ АКТИВНІСТЬ:
            </span>
            <span id="latest-activity-text" style={{ color: 'var(--text-secondary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
              {logs[0]?.title || 'Оновлення'}: {logs[0]?.body ? logs[0].body.replace(/<[^>]*>?/gm, '') : 'Подія'}
            </span>
          </div>
        )}

        <div className="calendar-controls">
          <h2 className="calendar-title-text" id="calendar-month-year">
            {monthNamesUk[weekDays[0].getMonth()]} {weekDays[0].getFullYear()}
          </h2>
          <div className="calendar-nav-buttons">
            <button className="btn btn-outline" onClick={() => changeWeek(-1)}>
              <i className="fa-solid fa-chevron-left"></i> Минулий тиждень
            </button>
            <button className="btn btn-outline" onClick={goToday}>Сьогодні</button>
            <button className="btn btn-outline" onClick={() => changeWeek(1)}>
              Наступний тиждень <i className="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        </div>

        <div className="weekly-calendar-wrapper" ref={containerRef}>
          <div className="weekly-calendar-grid" id="weekly-grid">
            <div className="calendar-header-cell" style={{ borderLeft: 'none' }}></div>
            {weekDays.map((day, idx) => {
                const isToday = getLocalDateString(day) === todayStr;
                return (
                    <div key={idx} className={`calendar-header-cell ${isToday ? 'today' : ''}`}>
                        <div className="calendar-header-dayname">{dayNamesUk[day.getDay()]}</div>
                        <div className="calendar-header-daynumber">{day.getDate()}</div>
                    </div>
                );
            })}

            <div className="calendar-time-col">
                {Array.from({ length: 16 }).map((_, i) => (
                    <div key={i} className="calendar-time-label">
                        {String(i + 8).padStart(2,'0')}:00
                    </div>
                ))}
            </div>

            {weekDays.map((day, idx) => {
                const dayStr = getLocalDateString(day);
                const isToday = dayStr === todayStr;

                // Bookings for this day
                const dayBookings = bookings.filter(b => (b.status === 'approved' || b.status === 'pending') && b.date === dayStr);

                // Drag preview calc
                let previewStyle = { display: 'none' };
                let previewLabel = "";
                let isInvalid = false;
                if (dragState.active && dragState.dayStr === dayStr) {
                    let startH = Math.min(dragState.startHour, dragState.currentHour);
                    let endH = Math.max(dragState.startHour, dragState.currentHour) + 0.5;
                    if (startH < 8) startH = 8;
                    if (endH > 24) endH = 24;
                    previewStyle = {
                        display: 'flex',
                        top: `${(startH - 8) * 60}px`,
                        height: `${(endH - startH) * 60}px`,
                        left: '3px',
                        width: 'calc(100% - 6px)'
                    };
                    previewLabel = `${formatTimeDecimal(startH)} - ${formatTimeDecimal(endH)}`;
                }

                return (
                    <div key={idx} className={`calendar-day-col ${isToday ? 'today-col' : ''}`}>
                        {isToday && timelineOffset >= 0 && (
                            <div className="calendar-timeline-line" style={{ top: `${timelineOffset}px` }}></div>
                        )}
                        {Array.from({ length: 16 }).map((_, i) => {
                            const h = i + 8;

                            const topPast = isSlotPast(dayStr, h);
                            const topUnavail = isSlotUnavailable(dayStr, h);
                            const bottomPast = isSlotPast(dayStr, h + 0.5);
                            const bottomUnavail = isSlotUnavailable(dayStr, h + 0.5);

                            return (
                                <div key={i} className={`calendar-slot-cell ${topPast && bottomPast ? 'past-slot' : 'bookable'}`}>
                                    <div
                                        className={`slot-half top-half ${topUnavail ? 'unavailable-half' : ''} ${topPast ? 'past-half' : ''}`}
                                        onMouseDown={(e) => { e.preventDefault(); handleMouseDown(dayStr, h); }}
                                        onMouseEnter={() => handleMouseEnter(dayStr, h)}
                                        onTouchStart={(e) => { handleMouseDown(dayStr, h); }}
                                    ></div>
                                    <div
                                        className={`slot-half bottom-half ${bottomUnavail ? 'unavailable-half' : ''} ${bottomPast ? 'past-half' : ''}`}
                                        onMouseDown={(e) => { e.preventDefault(); handleMouseDown(dayStr, h + 0.5); }}
                                        onMouseEnter={() => handleMouseEnter(dayStr, h + 0.5)}
                                        onTouchStart={(e) => { handleMouseDown(dayStr, h + 0.5); }}
                                    ></div>
                                </div>
                            );
                        })}

                        {/* Render Bookings */}
                        {(() => {
                            // Clustering logic
                            dayBookings.sort((a, b) => {
                              const sa = timeToDecimal(a.startTime), sb = timeToDecimal(b.startTime);
                              if (sa !== sb) return sa - sb;
                              return (timeToDecimal(b.endTime) - sb) - (timeToDecimal(a.endTime) - sa);
                            });

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

                            return dayBookings.map(b => {
                                 const startDec = timeToDecimal(b.startTime);
                                 const endDec = timeToDecimal(b.endTime);
                                 const top = (startDec - 8) * 60;
                                 const height = (endDec - startDec) * 60;
                                 const colWidth = 100 / (b.totalCols || 1);
                                 const colLeft = (b.col || 0) * colWidth;
                                 const sType = b.type.toLowerCase().trim().replace(/[^a-zа-яєіїґ]/gi, '-');

                                 return (
                                     <div
                                        key={b.id}
                                        className={`calendar-event event-type-${sType} ${b.status === 'pending' ? 'event-pending' : ''}`}
                                        style={{ top: `${top}px`, height: `${height}px`, left: `calc(${colLeft}% + 2px)`, width: `calc(${colWidth}% - 4px)` }}
                                        onClick={(e) => { e.stopPropagation(); openModal('event', { bookingId: b.id }); }}
                                     >
                                        <div className="calendar-event-time">{b.startTime} - {b.endTime}</div>
                                        <div className="calendar-event-title"><strong>{b.userName}</strong></div>
                                     </div>
                                 );
                            });
                        })()}

                        {/* Drag Preview */}
                        <div className={`calendar-drag-preview ${isInvalid ? 'invalid-drag' : ''}`} style={previewStyle}>
                            <div className="calendar-drag-preview-label">{previewLabel}</div>
                        </div>
                    </div>
                );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CalendarView;
