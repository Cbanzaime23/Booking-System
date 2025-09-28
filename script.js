/* --------------------
  CONFIG - replace the placeholders below with your values
-------------------- */
const CONFIG = {
    SPREADSHEET_ID: '13SROZHNchpiGKpgSc6bpxbuf2Fhw0AMIAcQyC48BKkM',   // e.g. "1aBcD...xyz"
    SHEET_NAME: 'Bookings',                             // tab name (case sensitive)
    GOOGLE_API_KEY: 'AIzaSyBWeYEPI6xBe-J4U2j7UE3hedOqcUXcU0I',       // used for READ (Sheets API)
    APPS_SCRIPT_WEB_APP_URL: 'https://script.google.com/macros/library/d/1kt0NH4oVzpiXQJVIzqQIb9swbWG5Hfi5OtuYrCoVSFsMupTwABOZg3Gq/5' // URL for JSONP writes
  };
  
  /* --------------------
    UI / time settings
  -------------------- */
  const SLOT_MINUTES = 30;
  const DAY_START_HOUR = 8;
  const DAY_END_HOUR = 20;  // exclusive
  
  /* DOM elements */
  const bookDateEl = document.getElementById('bookDate');
  const prevDayBtn = document.getElementById('prevDay');
  const nextDayBtn = document.getElementById('nextDay');
  const startTimeEl = document.getElementById('startTime');
  const endTimeEl = document.getElementById('endTime');
  const nameEl = document.getElementById('name');
  const emailEl = document.getElementById('email');
  const submitBtn = document.getElementById('submitBtn');
  const formMessage = document.getElementById('formMessage');
  const calendarGrid = document.getElementById('calendarGrid');
  const displayDate = document.getElementById('displayDate');
  
  let currentDate = new Date();
  currentDate.setHours(0,0,0,0);
  
  /* ---------- Helpers ---------- */
  function toYYYYMMDD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function parseTimeToMinutes(hhmm) {
    if(!hhmm) return null;
    const [h,m] = hhmm.split(':').map(Number);
    return h*60 + m;
  }
  function minutesToHHMM(min) {
    const h = Math.floor(min/60);
    const m = min%60;
    return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
  }
  function todayISO() { return toYYYYMMDD(new Date()); }
  
  /* overlap check: [a,b) overlaps [c,d) iff a < d && c < b */
  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }
  
  /* ---------- Read bookings via Sheets API (v4) ---------- */
  /* We'll fetch full data range A2:G (Date,Start,End,Name,Room,Email,Status)
     and then filter for requested date on client side. */
  async function fetchAllBookings() {
    if (!CONFIG.SPREADSHEET_ID || !CONFIG.GOOGLE_API_KEY) {
      throw new Error('Missing SPREADSHEET_ID or GOOGLE_API_KEY in CONFIG.');
    }
    const range = encodeURIComponent(`${CONFIG.SHEET_NAME}!A2:G`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${range}?majorDimension=ROWS&key=${CONFIG.GOOGLE_API_KEY}`;
    const r = await fetch(url);
    if (!r.ok) {
      const txt = await r.text();
      throw new Error('Sheets API error: ' + r.status + ' ' + txt);
    }
    const payload = await r.json();
    const rows = payload.values || [];
    return rows.map(row => {
      return {
        date: row[0] ? String(row[0]).trim() : '',
        start: row[1] ? String(row[1]).trim() : '',
        end: row[2] ? String(row[2]).trim() : '',
        name: row[3] || '',
        room: row[4] || '',
        email: row[5] || '',
        status: row[6] || ''
      };
    });
  }
  
  async function fetchBookingsForDate(isoDate) {
    const all = await fetchAllBookings();
    return all
      .filter(r => r.date === isoDate)
      .map(r => {
        return {
          ...r,
          startMin: parseTimeToMinutes(r.start),
          endMin: parseTimeToMinutes(r.end)
        };
      })
      .filter(b => b.startMin != null && b.endMin != null);
  }
  
  /* ---------- Render calendar ---------- */
  function renderCalendar(dateObj, bookings) {
    calendarGrid.innerHTML = '';
    displayDate.textContent = (new Date(dateObj)).toDateString();
    // generate slots
    const slots = [];
    for (let m = DAY_START_HOUR*60; m < DAY_END_HOUR*60; m += SLOT_MINUTES) {
      const slotStart = m;
      const slotEnd = m + SLOT_MINUTES;
      const slotLabel = minutesToHHMM(slotStart) + ' – ' + minutesToHHMM(slotEnd);
      // check if any booking covers this slot (partial or full)
      const bookedBy = bookings.find(b => overlaps(slotStart, slotEnd, b.startMin, b.endMin));
      slots.push({slotStart, slotEnd, slotLabel, bookedBy});
    }
  
    // grid layout: small cards
    for (const s of slots) {
      const el = document.createElement('div');
      el.className = 'slot p-2 rounded flex items-center justify-between shadow-sm';
      el.classList.add('cursor-default');
  
      if (s.bookedBy) {
        el.classList.add('bg-red-400', 'text-white');
        // tooltip
        el.innerHTML = `<div class="tooltip w-full flex items-center justify-between">
          <div>${s.slotLabel}</div>
          <div class="font-semibold">${s.bookedBy.name || 'Booked'}</div>
          <span class="tooltiptext">By: ${escapeHtml(s.bookedBy.name)} • ${escapeHtml(s.bookedBy.email)}<br>${escapeHtml(s.bookedBy.start)} → ${escapeHtml(s.bookedBy.end)}</span>
        </div>`;
      } else {
        el.classList.add('bg-green-200');
        el.innerHTML = `<div class="w-full flex items-center justify-between">
          <div>${s.slotLabel}</div>
          <div class="text-xs text-gray-700">Available</div>
        </div>`;
      }
      calendarGrid.appendChild(el);
    }
  }
  
  /* small html escaper for tooltips */
  function escapeHtml(s = '') {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  
  /* ---------- JSONP writer (write via Apps Script JSONP GET) ---------- */
  /* We'll create a script tag with query params and a callback parameter.
     Apps Script returns JavaScript that calls the callback with JSON.
  */
  function jsonpPostBooking(payload) {
    return new Promise((resolve, reject) => {
      if (!CONFIG.APPS_SCRIPT_WEB_APP_URL) {
        reject(new Error('APPS_SCRIPT_WEB_APP_URL not configured.'));
        return;
      }
      const callbackName = '__booking_cb_' + Date.now() + '_' + Math.floor(Math.random()*10000);
      window[callbackName] = function(response) {
        try {
          resolve(response);
        } finally {
          // cleanup
          delete window[callbackName];
          const s = document.getElementById(callbackName);
          if (s) s.remove();
        }
      };
  
      const params = new URLSearchParams({
        action: 'book',
        date: payload.date,
        start: payload.start,
        end: payload.end,
        name: payload.name,
        email: payload.email,
        room: payload.room || 'Room Booking',
        status: payload.status || 'Confirmed',
        callback: callbackName
      });
  
      const script = document.createElement('script');
      script.src = CONFIG.APPS_SCRIPT_WEB_APP_URL + '?' + params.toString();
      script.id = callbackName;
      script.onerror = function(err) {
        delete window[callbackName];
        script.remove();
        reject(new Error('JSONP load error'));
      };
      document.body.appendChild(script);
      // Note: response will arrive by window[callbackName]
    });
  }
  
  /* ---------- UI events + validation + booking flow ---------- */
  async function refreshAndRender() {
    const iso = toYYYYMMDD(currentDate);
    bookDateEl.value = iso;
    try {
      const bookings = await fetchBookingsForDate(iso);
      renderCalendar(iso, bookings);
    } catch (err) {
      calendarGrid.innerHTML = `<div class="p-4 text-red-600">Error loading bookings: ${err.message}</div>`;
      console.error(err);
    }
  }
  
  function setFormMessage(txt, isError = false) {
    formMessage.textContent = txt;
    formMessage.className = isError ? 'mt-3 text-sm text-red-600' : 'mt-3 text-sm text-green-600';
  }
  
  submitBtn.addEventListener('click', async () => {
    setFormMessage('');
    const date = bookDateEl.value;
    const start = startTimeEl.value;
    const end = endTimeEl.value;
    const name = nameEl.value.trim();
    const email = emailEl.value.trim();
  
    // client validations
    if (!date || !start || !end || !name || !email) {
      setFormMessage('Please fill date, start, end, name and email.', true);
      return;
    }
    if (start >= end) {
      setFormMessage('Start time must be before end time.', true);
      return;
    }
    if (date < todayISO()) {
      setFormMessage('Cannot book past dates.', true);
      return;
    }
  
    // fetch current bookings for date and check overlap again
    let bookings = [];
    try {
      bookings = await fetchBookingsForDate(date);
    } catch (err) {
      setFormMessage('Failed to check availability: ' + err.message, true);
      return;
    }
    const sMin = parseTimeToMinutes(start);
    const eMin = parseTimeToMinutes(end);
    const conflict = bookings.find(b => overlaps(sMin, eMin, b.startMin, b.endMin));
    if (conflict) {
      setFormMessage(`Time overlaps with existing booking by ${conflict.name} (${conflict.start}–${conflict.end}).`, true);
      return;
    }
  
    // send via JSONP write
    submitBtn.disabled = true;
    setFormMessage('Booking...');
  
    try {
      const payload = { date, start, end, name, email, room: 'Room Booking', status: 'Confirmed' };
      const res = await jsonpPostBooking(payload);
      if (res && res.success) {
        setFormMessage('Booking confirmed! 🎉');
        // clear form
        startTimeEl.value = ''; endTimeEl.value = ''; nameEl.value = ''; emailEl.value = '';
        // re-render
        await refreshAndRender();
      } else {
        setFormMessage('Booking failed: ' + (res && res.error ? res.error : 'unknown'), true);
      }
    } catch (err) {
      setFormMessage('Error sending booking: ' + err.message, true);
      console.error(err);
    } finally {
      submitBtn.disabled = false;
    }
  });
  
  /* date nav */
  prevDayBtn.addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() - 1);
    refreshAndRender();
  });
  nextDayBtn.addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() + 1);
    refreshAndRender();
  });
  bookDateEl.addEventListener('change', (e) => {
    currentDate = new Date(e.target.value + 'T00:00:00');
    refreshAndRender();
  });
  
  /* Init */
  (function init() {
    // set default date to today
    bookDateEl.value = toYYYYMMDD(currentDate);
    refreshAndRender();
  })();
  