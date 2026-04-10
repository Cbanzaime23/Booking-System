
        // Security Check
        if (sessionStorage.getItem('ccf_admin_logged_in') !== 'true') {
            document.body.style.overflow = 'hidden';
            const wrapper = document.createElement('div');
            wrapper.className = 'fixed inset-0 z-[9999] bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4';
            wrapper.innerHTML = `
                <div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full border border-gray-100 p-6 md:p-8 text-center flex flex-col items-center">
                    <div class="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                        <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h3 class="text-xl font-bold font-heading text-gray-900 mb-2">Unauthorized Access</h3>
                    <p class="text-gray-500 text-sm mb-6">Please log in securely via the main reservation page to access the Admin Dashboard.</p>
                    <button onclick="window.location.href='index.html'" class="w-full bg-ccf-blue text-white font-bold py-3 rounded-xl hover:bg-ccf-blue-dark transition-colors shadow-lg shadow-ccf-blue/30 focus:outline-none focus:ring-4 focus:ring-ccf-blue/20">Return to Home</button>
                </div>
            `;
            document.body.appendChild(wrapper);
            throw new Error("Unauthorized action aborted execution."); // Halts all subsequent data fetching logic
        }

        const DateTime = luxon.DateTime; // Define globally

        // --- Modal Toolbar Buttons ---
        document.getElementById('open-blocked-dates-modal').addEventListener('click', () => {
            document.getElementById('blocked-dates-modal').showModal();
        });
        document.getElementById('open-reservation-window-modal').addEventListener('click', () => {
            document.getElementById('reservation-window-modal').showModal();
        });
        document.getElementById('open-housekeeping-modal').addEventListener('click', () => {
            document.getElementById('housekeeping-modal').showModal();
        });

        let allBookings = [];
        let blockedDates = []; // NEW
        let selectedRooms = [];
        let selectedDate = null;

        // ... (Colors kept as is, not re-declaring) ...
        const COLORS = {
            blue: '#004d60',
            red: '#e00000',
            teal: '#0d9488',
            orange: '#f97316',
            gray: '#64748b',
            yellow: '#eab308',
            purple: '#8b5cf6',
            pink: '#ec4899'
        };

        const ROOM_COLORS = {
            'Main Hall': COLORS.blue,
            'Jonah': COLORS.yellow,
            'Joseph': COLORS.orange,
            'Moses': COLORS.teal
        };

        document.addEventListener('DOMContentLoaded', () => {
            // Calculate header height for sticky controls positioning
            function updateControlsTop() {
                const header = document.getElementById('main-header');
                if (header) {
                    const h = header.offsetHeight;
                    document.getElementById('dashboard-controls').style.top = h + 'px';
                }
            }
            updateControlsTop();

            initializeFilters();
            createTableSkeletons();
            initBlockedDates(); // NEW
            fetchData();

            window.addEventListener('resize', () => {
                updateControlsTop();
                if (allBookings.length > 0) applyFilters();
            });
        });

        // ... (parseDate kept as is) ...
        function parseDate(dateInput) {
            if (!dateInput) return DateTime.invalid('missing data');
            if (typeof dateInput === 'string' && dateInput.endsWith('Z')) {
                dateInput = dateInput.slice(0, -1);
            }
            let dt = DateTime.fromISO(dateInput, { zone: APP_CONFIG.TIMEZONE });
            if (dt.isValid) return dt;
            dt = DateTime.fromSQL(dateInput, { zone: APP_CONFIG.TIMEZONE });
            if (dt.isValid) return dt;
            const jsDate = new Date(dateInput);
            if (!isNaN(jsDate)) {
                return DateTime.fromJSDate(jsDate, { zone: APP_CONFIG.TIMEZONE });
            }
            return DateTime.invalid('unsupported format');
        }

        // ... (Filter/UI setup kept as is) ...
        function createTableSkeletons() {
            const container = document.getElementById('room-tables-container');
            const rooms = ['Main Hall', 'Jonah', 'Joseph', 'Moses'];
            const roomColors = { 'Main Hall': 'teal', 'Jonah': 'orange', 'Joseph': 'blue', 'Moses': 'indigo' };

            container.innerHTML = '';

            rooms.forEach(room => {
                const color = roomColors[room] || 'gray';
                const roomId = room.replace(/\s+/g, '-');

                const html = `
                <div id="container-${roomId}" class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div class="p-6 border-b border-gray-100 flex justify-between items-center bg-${color}-50">
                        <h3 class="text-xl font-medium font-body text-ccf-blue">${room}</h3>
                        <span class="text-xs font-semibold text-${color}-700 bg-white px-2 py-1 rounded border border-${color}-200" id="count-${roomId}">0 Bookings</span>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Code</th>
                                    <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Event</th>
                                    <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Date & Time</th>
                                    <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Booked By</th>
                                    <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Pax</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-200" id="tbody-${roomId}">
                                <tr><td colspan="5" class="px-6 py-4 text-center text-sm text-gray-500">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>`;
                container.insertAdjacentHTML('beforeend', html);
            });
        }


        // --- HELPER: ROBUST DATE PARSER (Crucial Fix) ---
        function parseDate(dateInput) {
            if (!dateInput) return DateTime.invalid('missing data');

            // Handle "Fake UTC" strings by stripping 'Z'
            if (typeof dateInput === 'string' && dateInput.endsWith('Z')) {
                dateInput = dateInput.slice(0, -1);
            }

            // 1. Try ISO
            let dt = DateTime.fromISO(dateInput, { zone: APP_CONFIG.TIMEZONE });
            if (dt.isValid) return dt;

            // 2. Try SQL/Sheets
            dt = DateTime.fromSQL(dateInput, { zone: APP_CONFIG.TIMEZONE });
            if (dt.isValid) return dt;

            // 3. Fallback to JS Date
            const jsDate = new Date(dateInput);
            if (!isNaN(jsDate)) {
                return DateTime.fromJSDate(jsDate, { zone: APP_CONFIG.TIMEZONE });
            }

            return DateTime.invalid('unsupported format');
        }

        // --- FILTER & UI SETUP ---
        function createTableSkeletons() {
            const container = document.getElementById('room-tables-container');
            const rooms = ['Main Hall', 'Jonah', 'Joseph', 'Moses'];
            const roomColors = { 'Main Hall': 'teal', 'Jonah': 'orange', 'Joseph': 'blue', 'Moses': 'indigo' };

            container.innerHTML = '';

            rooms.forEach(room => {
                const color = roomColors[room] || 'gray';
                const roomId = room.replace(/\s+/g, '-');

                // NEW: Logic for Top Border Color Mapping
                let borderClass = 'border-t-gray-200'; // Default
                if (room === 'Main Hall') borderClass = 'border-t-teal-600';
                else if (room === 'Jonah') borderClass = 'border-t-orange-500';
                else if (room === 'Joseph') borderClass = 'border-t-blue-600';
                else if (room === 'Moses') borderClass = 'border-t-indigo-600';

                const html = `
                <div id="container-${roomId}" class="bg-white rounded-2xl md:rounded-2xl shadow-sm border border-gray-100 border-t-4 ${borderClass} overflow-hidden">
                    <div class="p-3 md:p-6 border-b border-gray-100 flex justify-between items-center bg-${color}-50">
                        <h3 class="text-base md:text-xl font-medium font-body text-ccf-blue">${room}</h3>
                        <span class="text-xs font-semibold text-${color}-700 bg-white px-2 py-1 rounded border border-${color}-200" id="count-${roomId}">0 Bookings</span>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200 responsive-table">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Code</th>
                                    <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Event</th>
                                    <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Date & Time</th>
                                    <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Booked By</th>
                                    <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Pax</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-200" id="tbody-${roomId}">
                                <tr><td colspan="5" class="px-6 py-4 text-center text-sm text-gray-500">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>`;
                container.insertAdjacentHTML('beforeend', html);
            });
        }

        function initializeFilters() {
            const roomListContainer = document.getElementById('room-list-container');
            const rooms = Object.keys(APP_CONFIG.ROOM_CONFIG);
            selectedRooms = [...rooms];

            rooms.forEach(room => {
                const div = document.createElement('div');
                div.innerHTML = `<label class="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" value="${room}" class="room-checkbox form-checkbox h-4 w-4 text-ccf-blue rounded-xl border-gray-300 focus:ring-ccf-blue" checked>
                        <span class="ml-2 text-sm text-gray-700">${room}</span></label>`;
                roomListContainer.appendChild(div);
            });

            const btn = document.getElementById('room-filter-btn');
            const menu = document.getElementById('room-filter-menu');
            const selectAll = document.getElementById('select-all-rooms');
            const checkboxes = document.querySelectorAll('.room-checkbox');

            btn.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('hidden'); });
            document.addEventListener('click', (e) => { if (!btn.contains(e.target) && !menu.contains(e.target)) menu.classList.add('hidden'); });

            selectAll.addEventListener('change', (e) => {
                checkboxes.forEach(cb => cb.checked = e.target.checked);
                updateRoomFilterState();
            });

            checkboxes.forEach(cb => {
                cb.addEventListener('change', () => {
                    selectAll.checked = Array.from(checkboxes).every(c => c.checked);
                    updateRoomFilterState();
                });
            });

            const dateInput = document.getElementById('date-filter');
            const clearDateBtn = document.getElementById('clear-date-btn');

            const todayISO = DateTime.now().setZone(APP_CONFIG.TIMEZONE).toISODate();
            dateInput.value = todayISO;
            selectedDate = todayISO;
            clearDateBtn.classList.remove('hidden');

            dateInput.addEventListener('change', (e) => {
                selectedDate = e.target.value;
                clearDateBtn.classList.toggle('hidden', !selectedDate);
                applyFilters();
            });
            clearDateBtn.addEventListener('click', () => {
                dateInput.value = '';
                selectedDate = null;
                clearDateBtn.classList.add('hidden');
                applyFilters();
            });
        }

        function updateRoomFilterState() {
            const checkboxes = document.querySelectorAll('.room-checkbox:checked');
            selectedRooms = Array.from(checkboxes).map(cb => cb.value);
            const label = document.getElementById('room-filter-label');
            if (selectedRooms.length === Object.keys(APP_CONFIG.ROOM_CONFIG).length) label.textContent = "All Rooms";
            else if (selectedRooms.length === 0) label.textContent = "No Rooms";
            else if (selectedRooms.length === 1) label.textContent = selectedRooms[0];
            else label.textContent = `${selectedRooms.length} Rooms Selected`;
            applyFilters();
        }

        function updateStatus(text, colorClass) {
            const desktop = document.getElementById('status-indicator');
            const mobile = document.getElementById('status-indicator-mobile');
            [desktop, mobile].forEach(el => {
                if (el) {
                    el.textContent = text;
                    el.className = 'text-xs font-medium ' + colorClass;
                }
            });
        }

        function fetchData() {
            updateStatus('Fetching data...', 'text-orange-600');

            const callbackName = `dashboard_callback_${Date.now()}`;
            const script = document.createElement('script');

            window[callbackName] = (response) => {
                if (response.success) {
                    updateStatus('Last updated: ' + DateTime.now().toFormat('h:mm:ss a'), 'text-green-600');
                    allBookings = response.data;
                    blockedDates = response.blocked_dates || [];
                    applyFilters();
                    renderBlockedDates();

                    if (response.latest_validation_sheet) {
                        const valLink = document.getElementById('validation-sheet-link');
                        if (valLink) {
                            valLink.textContent = response.latest_validation_sheet.name || 'Unknown';
                            valLink.href = response.latest_validation_sheet.url || '#';
                        }
                    }

                    // Reservation window
                    if (response.reservation_window) {
                        populateReservationWindowForm(response.reservation_window);
                        renderHousekeepingReport(allBookings, response.reservation_window);
                    }
                } else {
                    updateStatus('Error fetching data', 'text-red-600');
                    console.error("Fetch error:", response.message);
                }
                delete window[callbackName];
                document.body.removeChild(script);
            };

            script.src = `${APP_CONFIG.APPS_SCRIPT_URL}?action=fetch_all&callback=${callbackName}&payload={}`;
            script.onerror = () => { updateStatus('Connection failed', 'text-red-600'); };
            document.body.appendChild(script);
        }

        // ============================================================
        // RESERVATION WINDOW SETTINGS
        // ============================================================

        function populateReservationWindowForm(rw) {
            const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            document.getElementById('rw-open-day').value = rw.openDay;
            document.getElementById('rw-open-time').value = rw.openTime;
            document.getElementById('rw-close-day').value = rw.closeDay;
            document.getElementById('rw-close-time').value = rw.closeTime;

            const badge = document.getElementById('rw-status-badge');
            if (rw.isOpen) {
                badge.textContent = `Open until ${DAY_NAMES[rw.closeDay]} ${rw.closeTime}`;
                badge.className = 'text-[10px] sm:text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 whitespace-nowrap text-center';
            } else {
                badge.textContent = `Closed — Opens ${DAY_NAMES[rw.openDay]} ${rw.openTime}`;
                badge.className = 'text-[10px] sm:text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap text-center';
            }
        }

        // Save button handler
        document.getElementById('rw-save-btn').addEventListener('click', () => {
            const pin = document.getElementById('rw-admin-pin').value.trim();
            if (!pin) return;

            const payload = {
                openDay: document.getElementById('rw-open-day').value,
                openTime: document.getElementById('rw-open-time').value,
                closeDay: document.getElementById('rw-close-day').value,
                closeTime: document.getElementById('rw-close-time').value,
                admin_pin: pin
            };

            const feedback = document.getElementById('rw-save-feedback');
            const saveBtn = document.getElementById('rw-save-btn');
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';

            const callbackName = `rw_save_callback_${Date.now()}`;
            const script = document.createElement('script');

            window[callbackName] = (response) => {
                delete window[callbackName];
                document.body.removeChild(script);
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<svg class="w-3.5 sm:w-4 h-3.5 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Save Settings';

                if (response.success) {
                    feedback.textContent = '✓ Saved successfully';
                    feedback.className = 'text-sm font-medium text-emerald-600';
                    feedback.classList.remove('hidden');
                    document.getElementById('rw-admin-pin').value = '';
                    setTimeout(() => feedback.classList.add('hidden'), 3000);
                    fetchData(); // Refresh to update status badge
                } else {
                    feedback.textContent = '✕ ' + (response.message || 'Error saving');
                    feedback.className = 'text-sm font-medium text-red-600';
                    feedback.classList.remove('hidden');
                }
            };

            const encodedPayload = encodeURIComponent(JSON.stringify(payload));
            script.src = `${APP_CONFIG.APPS_SCRIPT_URL}?action=update_reservation_window&callback=${callbackName}&payload=${encodedPayload}`;
            script.onerror = () => {
                delete window[callbackName];
                document.body.removeChild(script);
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<svg class="w-3.5 sm:w-4 h-3.5 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Save Settings';
                feedback.textContent = '✕ Connection failed';
                feedback.className = 'text-sm font-medium text-red-600';
                feedback.classList.remove('hidden');
            };
            document.body.appendChild(script);
        });

        // ============================================================
        // HOUSEKEEPING REPORT
        // ============================================================

        function renderHousekeepingReport(bookings, rw) {
            const container = document.getElementById('housekeeping-report-container');
            if (!container) return;

            // Calculate the current week range: Tue to Mon
            const now = DateTime.now().setZone(APP_CONFIG.TIMEZONE);
            // Find the most recent Tuesday (or today if it's Tuesday)
            let weekStart = now;
            while (weekStart.weekday !== 2) { // 2 = Tuesday in Luxon
                weekStart = weekStart.minus({ days: 1 });
            }
            weekStart = weekStart.startOf('day');
            const weekEnd = weekStart.plus({ days: 6 }).endOf('day'); // Monday

            // Filter bookings for this week range
            const weekBookings = bookings.filter(b => {
                const bStart = parseDate(b.start_iso);
                if (!bStart.isValid) return false;
                return bStart >= weekStart && bStart <= weekEnd;
            }).sort((a, b) => parseDate(a.start_iso) - parseDate(b.start_iso));

            if (weekBookings.length === 0) {
                container.innerHTML = '<p class="text-sm text-gray-400 italic text-center py-6">No bookings for this week (Tue ' + weekStart.toFormat('MMM d') + ' — Mon ' + weekEnd.toFormat('MMM d') + ').</p>';
                return;
            }

            // Group by date
            const grouped = {};
            weekBookings.forEach(b => {
                const bStart = parseDate(b.start_iso);
                const dateKey = bStart.toFormat('yyyy-MM-dd');
                const dateLabel = bStart.toFormat('cccc, MMMM d');
                if (!grouped[dateKey]) grouped[dateKey] = { label: dateLabel, bookings: [] };
                grouped[dateKey].bookings.push(b);
            });

            let html = `<p class="text-xs text-gray-500 mb-3">Week: ${weekStart.toFormat('MMM d')} (Tue) — ${weekEnd.toFormat('MMM d')} (Mon) · ${weekBookings.length} total bookings</p>`;

            Object.keys(grouped).sort().forEach(dateKey => {
                const group = grouped[dateKey];
                html += `<div class="border border-gray-200 rounded-lg overflow-hidden mb-3">
                    <div class="bg-gray-100 px-4 py-2 font-bold text-sm text-gray-700">${group.label} <span class="text-gray-400 font-normal">(${group.bookings.length} booking${group.bookings.length > 1 ? 's' : ''})</span></div>
                    <table class="w-full text-sm">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase">Time</th>
                                <th class="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase">Room</th>
                                <th class="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase">Event</th>
                                <th class="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase">Contact</th>
                                <th class="px-4 py-2 text-right text-xs font-bold text-gray-500 uppercase">Pax</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">`;

                group.bookings.forEach(b => {
                    const bStart = parseDate(b.start_iso);
                    const bEnd = parseDate(b.end_iso);
                    const timeStr = bStart.toFormat('h:mm a') + ' – ' + bEnd.toFormat('h:mm a');
                    const name = [b.first_name, b.last_name].filter(Boolean).join(' ') || '—';
                    const tableStr = (b.room === 'Main Hall' && b.table_id) 
                        ? `<br><span class="text-[10px] text-gray-400 font-medium whitespace-nowrap">${b.table_id}</span>` 
                        : '';

                    html += `<tr class="hover:bg-blue-50/50">
                        <td class="px-4 py-2 text-gray-700 whitespace-nowrap">${timeStr}</td>
                        <td class="px-4 py-2 text-gray-700">${b.room}${tableStr}</td>
                        <td class="px-4 py-2 text-gray-700">${b.event || '—'}</td>
                        <td class="px-4 py-2 text-gray-700">${name}</td>
                        <td class="px-4 py-2 text-right text-gray-700">${b.participants || '—'}</td>
                    </tr>`;
                });

                html += '</tbody></table></div>';
            });

            // Append the Main Hall Floor Plan Reference
            html += `
            <div class="mt-12 border-t border-gray-200 pt-8" style="page-break-inside: avoid;">
                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-widest text-center mb-6">Main Hall Floor Plan Reference</h3>
                <div class="floorplan-container bg-white border-[3px] border-gray-800 rounded relative mx-auto w-full max-w-[340px] h-[580px] shadow-sm overflow-hidden rounded-lg">
                    <div class="absolute top-4 left-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Front</div>
                    <div class="absolute border-2 border-gray-800 flex items-center justify-center text-xl font-heading font-bold tracking-widest uppercase bg-gray-50 z-10 shadow-sm" style="top: 24px; right: 24px; width: 140px; height: 50px;">Stage</div>
                    <div class="absolute flex flex-col items-start" style="bottom: 20px; left: 24px;"><span class="text-sm font-semibold text-gray-800 mb-1">Entrance:</span><div class="border-2 border-gray-800 h-3 bg-white" style="width: 100px;"></div></div>
                    
                    <div class="absolute w-20 h-14 bg-white text-gray-800 border-2 border-gray-800 flex items-center justify-center font-bold text-2xl z-10 shadow-sm" style="top: 90px; left: 30px;">
                        <span>A</span>
                        <div class="absolute -top-[12px] left-1/2 -translate-x-1/2 flex gap-[4px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                        <div class="absolute -bottom-[12px] left-1/2 -translate-x-1/2 flex gap-[4px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                        <div class="absolute -left-[12px] top-1/2 -translate-y-1/2 flex flex-col gap-[3px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                        <div class="absolute -right-[12px] top-1/2 -translate-y-1/2 flex flex-col gap-[3px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                    </div>
                    <div class="absolute w-20 h-14 bg-white text-gray-800 border-2 border-gray-800 flex items-center justify-center font-bold text-2xl z-10 shadow-sm" style="top: 156px; right: 30px;">
                        <span>B</span>
                        <div class="absolute -top-[12px] left-1/2 -translate-x-1/2 flex gap-[4px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                        <div class="absolute -bottom-[12px] left-1/2 -translate-x-1/2 flex gap-[4px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                        <div class="absolute -left-[12px] top-1/2 -translate-y-1/2 flex flex-col gap-[3px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                        <div class="absolute -right-[12px] top-1/2 -translate-y-1/2 flex flex-col gap-[3px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                    </div>
                    <div class="absolute w-20 h-14 bg-white text-gray-800 border-2 border-gray-800 flex items-center justify-center font-bold text-2xl z-10 shadow-sm" style="top: 222px; left: 30px;">
                        <span>C</span>
                        <div class="absolute -top-[12px] left-1/2 -translate-x-1/2 flex gap-[4px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                        <div class="absolute -bottom-[12px] left-1/2 -translate-x-1/2 flex gap-[4px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                        <div class="absolute -left-[12px] top-1/2 -translate-y-1/2 flex flex-col gap-[3px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                        <div class="absolute -right-[12px] top-1/2 -translate-y-1/2 flex flex-col gap-[3px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                    </div>
                    <div class="absolute w-20 h-14 bg-white text-gray-800 border-2 border-gray-800 flex items-center justify-center font-bold text-2xl z-10 shadow-sm" style="top: 288px; right: 30px;">
                        <span>D</span>
                        <div class="absolute -top-[12px] left-1/2 -translate-x-1/2 flex gap-[4px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                        <div class="absolute -bottom-[12px] left-1/2 -translate-x-1/2 flex gap-[4px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                        <div class="absolute -left-[12px] top-1/2 -translate-y-1/2 flex flex-col gap-[3px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                        <div class="absolute -right-[12px] top-1/2 -translate-y-1/2 flex flex-col gap-[3px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                    </div>
                    <div class="absolute w-20 h-14 bg-white text-gray-800 border-2 border-gray-800 flex items-center justify-center font-bold text-2xl z-10 shadow-sm" style="top: 354px; left: 30px;">
                        <span>E</span>
                        <div class="absolute -top-[12px] left-1/2 -translate-x-1/2 flex gap-[4px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                        <div class="absolute -bottom-[12px] left-1/2 -translate-x-1/2 flex gap-[4px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                        <div class="absolute -left-[12px] top-1/2 -translate-y-1/2 flex flex-col gap-[3px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                        <div class="absolute -right-[12px] top-1/2 -translate-y-1/2 flex flex-col gap-[3px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                    </div>
                    <div class="absolute w-20 h-14 bg-white text-gray-800 border-2 border-gray-800 flex items-center justify-center font-bold text-2xl z-10 shadow-sm" style="top: 420px; right: 30px;">
                        <span>F</span>
                        <div class="absolute -top-[12px] left-1/2 -translate-x-1/2 flex gap-[4px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                        <div class="absolute -bottom-[12px] left-1/2 -translate-x-1/2 flex gap-[4px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                        <div class="absolute -left-[12px] top-1/2 -translate-y-1/2 flex flex-col gap-[3px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                        <div class="absolute -right-[12px] top-1/2 -translate-y-1/2 flex flex-col gap-[3px]"><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div><div class="w-3 h-3 rounded-full bg-inherit border-2 border-current"></div></div>
                    </div>
                </div>
            </div>`;

            container.innerHTML = html;
        }

        // Shared markup logic logic for identical Print and JPEG styling
        function generateReportHeader() {
            return `
                <h1 class="text-xl font-bold font-body text-gray-800 mb-2">Housekeeping Report — CCF Manila Room Reservation</h1>
                <p class="text-xs text-gray-500 mb-4 font-medium border-b border-gray-100 pb-4 flex items-center justify-between">
                    <span>Generated: ${DateTime.now().setZone(APP_CONFIG.TIMEZONE).toFormat('MMMM d, yyyy h:mm a')}</span>
                    <span class="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded border border-amber-200">CONFIDENTIAL</span>
                </p>
            `;
        }

        // Print handler (Upgraded to Tailwind formatting)
        document.getElementById('housekeeping-print-btn').addEventListener('click', () => {
            const container = document.getElementById('housekeeping-report-container');
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html><head><title>Housekeeping Report</title>
                <script src="https://cdn.tailwindcss.com"><\/script>
                <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Montserrat', Arial, sans-serif; padding: 40px; color: #333; background: #fff; }
                    @media print { body { padding: 0; } }
                </style></head><body>
                <div style="max-width: 800px; margin: 0 auto;">
                    ${generateReportHeader()}
                    ${container.innerHTML}
                </div>
                </body></html>
            `);
            printWindow.document.close();
            // Important delay to allow Tailwind engine to inject CSS on the window before printing
            setTimeout(() => { printWindow.print(); }, 800);
        });

        // Save as JPEG handler 
        document.getElementById('housekeeping-save-btn').addEventListener('click', () => {
            const container = document.getElementById('housekeeping-report-container');
            const btn = document.getElementById('housekeeping-save-btn');
            const originalHTML = btn.innerHTML;
            
            btn.innerHTML = '<span class="animate-pulse">Processing...</span>';
            btn.disabled = true;

            // Create temporary container that perfectly matches the Print layout
            const cloneDiv = document.createElement('div');
            cloneDiv.style.position = 'absolute';
            cloneDiv.style.left = '-9999px';
            cloneDiv.style.top = '0';
            cloneDiv.style.width = '800px'; 
            cloneDiv.style.backgroundColor = 'white';
            cloneDiv.style.padding = '40px';
            cloneDiv.style.fontFamily = "'Montserrat', Arial, sans-serif";
            
            cloneDiv.innerHTML = `
                ${generateReportHeader()}
                ${container.innerHTML}
            `;
            
            document.body.appendChild(cloneDiv);

            // Wait for DOM to register standard styles
            setTimeout(() => {
                html2canvas(cloneDiv, { scale: 2, useCORS: true, backgroundColor: '#ffffff' }).then(canvas => {
                    const link = document.createElement('a');
                    link.download = \`Housekeeping_Report_\${DateTime.now().setZone(APP_CONFIG.TIMEZONE).toFormat('yyyy_MM_dd')}.jpeg\`;
                    link.href = canvas.toDataURL('image/jpeg', 0.9);
                    link.click();
                    
                    document.body.removeChild(cloneDiv);
                    btn.disabled = false;
                    btn.innerHTML = originalHTML;
                }).catch(err => {
                    console.error("Save error:", err);
                    document.body.removeChild(cloneDiv);
                    btn.disabled = false;
                    btn.innerHTML = originalHTML;
                    alert('Error saving image. Check console for details.');
                });
            }, 500); 
        });

        function applyFilters() {
            if (!allBookings) return;

            const filteredBookings = allBookings.filter(b => {
                if (!selectedRooms.includes(b.room)) return false;
                if (selectedDate) {
                    // Use Robust Parser for Filter Logic
                    const bStart = parseDate(b.start_iso);
                    if (!bStart.isValid) return false;

                    const bDate = bStart.toISODate();
                    if (bDate !== selectedDate) return false;
                }
                return true;
            });
            processData(filteredBookings);
        }

        function processData(bookings) {
            const today = DateTime.now().setZone(APP_CONFIG.TIMEZONE).toISODate();

            let totalHeadcount = 0;
            let autoUpgradedCount = 0;
            const roomCounts = {};
            const eventCounts = {};

            bookings.forEach(b => {
                totalHeadcount += parseInt(b.participants || 0, 10);

                // Track auto upgrades
                if (b.original_room && b.original_room !== b.room) {
                    autoUpgradedCount++;
                }

                roomCounts[b.room] = (roomCounts[b.room] || 0) + 1;
                eventCounts[b.event] = (eventCounts[b.event] || 0) + 1;
            });

            // Define Busiest Room
            let busiestRoom = "--";
            let maxCount = 0;
            for (const [room, count] of Object.entries(roomCounts)) {
                if (count > maxCount) {
                    maxCount = count;
                    busiestRoom = `${room} (${count})`;
                }
            }

            // Sync metrics to DOM
            document.getElementById('total-bookings-count').textContent = bookings.length;
            document.getElementById('total-headcount').textContent = totalHeadcount;
            document.getElementById('auto-upgraded-count').textContent = autoUpgradedCount;
            document.getElementById('busiest-room-name').textContent = maxCount === 0 ? "--" : busiestRoom;

            renderD3BarChart(roomCounts);
            renderD3DonutChart(eventCounts);
            renderD3GanttChart(bookings);
            renderAdminWeeklySummary(allBookings); // Pass allBookings to look ahead 7 days regardless of current filter

            bookings.sort((a, b) => {
                const dA = parseDate(a.start_iso);
                const dB = parseDate(b.start_iso);
                return dA - dB;
            });
            renderRoomTables(bookings);
        }

        function renderAdminWeeklySummary(data) {
            const container = document.getElementById('admin-horizon-container');
            const section = document.getElementById('admin-horizon-section');
            if (!container || !section) return;

            const now = DateTime.now().setZone(APP_CONFIG.TIMEZONE);
            const horizonEnd = now.plus({ days: 7 }).endOf('day');

            // Filter: Next 7 days + Admin Bookings (leader_first_name is empty)
            const adminEvents = data.filter(b => {
                const bStart = parseDate(b.start_iso);
                if (!bStart.isValid) return false;

                // Admin check: No leader first name
                const isAdminBooking = !b.leader_first_name || b.leader_first_name.trim() === '';

                return isAdminBooking && bStart >= now.startOf('day') && bStart <= horizonEnd;
            }).sort((a, b) => parseDate(a.start_iso) - parseDate(b.start_iso));

            if (adminEvents.length === 0) {
                section.classList.add('hidden');
                return;
            }

            section.classList.remove('hidden');
            container.innerHTML = '';

            adminEvents.forEach(b => {
                const start = parseDate(b.start_iso);
                const dateStr = start.toFormat('EEE, MMM d');
                const timeStr = `${start.toFormat('h:mm a')} - ${parseDate(b.end_iso).toFormat('h:mm a')}`;

                const card = document.createElement('div');
                card.className = "min-w-[260px] md:min-w-[300px] bg-white border border-gray-100 rounded-xl p-4 shadow-sm border-l-4 border-l-ccf-red snap-start flex flex-col hover:shadow-md transition-shadow cursor-default";

                card.innerHTML = `
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-[10px] font-bold text-ccf-red-dark bg-red-50 px-2 py-0.5 rounded border border-red-100 uppercase">${b.event}</span>
                        <span class="text-[11px] font-bold text-gray-400 capitalize">${b.room}</span>
                    </div>
                    <h4 class="font-bold text-gray-800 text-sm md:text-base mb-1 line-clamp-1">${b.first_name} ${b.last_name || ''}</h4>
                    <div class="mt-auto pt-2 flex flex-col gap-1 border-t border-gray-50">
                        <div class="flex items-center gap-1.5 text-ccf-blue font-bold text-xs">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" stroke-width="2" /></svg>
                            ${dateStr}
                        </div>
                        <div class="flex items-center gap-1.5 text-gray-500 font-medium text-[11px]">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke-width="2" /></svg>
                            ${timeStr}
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });
        }

        // --- D3.JS CHARTS ---

        function showTooltip(html, event) {
            const tooltip = document.getElementById('d3-tooltip');
            tooltip.innerHTML = html;
            tooltip.style.opacity = 1;
            tooltip.style.left = (event.pageX + 10) + 'px';
            tooltip.style.top = (event.pageY + 10) + 'px';
        }

        function hideTooltip() {
            document.getElementById('d3-tooltip').style.opacity = 0;
        }

        function renderD3BarChart(dataObj) {
            const container = document.getElementById('d3-room-bar-chart');
            container.innerHTML = '';
            const width = container.clientWidth;
            const height = container.clientHeight || 300;
            const isMobile = window.innerWidth < 768;
            const margin = isMobile
                ? { top: 20, right: 5, bottom: 25, left: 5 }
                : { top: 25, right: 20, bottom: 30, left: 10 };

            const svg = d3.select(container).append("svg")
                .attr("width", width)
                .attr("height", height)
                .attr("viewBox", [0, 0, width, height]);

            const rooms = Object.keys(APP_CONFIG.ROOM_CONFIG);
            const data = rooms.map(room => ({ room: room, value: dataObj[room] || 0 }));

            const x = d3.scaleBand()
                .domain(rooms)
                .range([margin.left, width - margin.right])
                .padding(isMobile ? 0.3 : 0.4);

            const y = d3.scaleLinear()
                .domain([0, d3.max(data, d => d.value) > 0 ? d3.max(data, d => d.value) + 1 : 5])
                .nice()
                .range([height - margin.bottom, margin.top]);

            // Bars
            svg.append("g")
                .attr("fill", COLORS.blue)
                .selectAll("rect")
                .data(data)
                .join("rect")
                .attr("x", d => x(d.room))
                .attr("y", d => y(d.value))
                .attr("height", d => y(0) - y(d.value))
                .attr("width", x.bandwidth())
                .attr("rx", 3)
                .on("mouseover", (event, d) => showTooltip(`<strong>${d.room}</strong><br>Bookings: ${d.value}`, event))
                .on("mousemove", (event) => showTooltip(null, event))
                .on("mouseout", hideTooltip);

            // Value labels on top of bars
            svg.append("g")
                .selectAll("text")
                .data(data)
                .join("text")
                .attr("x", d => x(d.room) + x.bandwidth() / 2)
                .attr("y", d => y(d.value) - 4)
                .attr("text-anchor", "middle")
                .attr("font-family", "Montserrat")
                .attr("font-size", isMobile ? "10px" : "13px")
                .attr("font-weight", "700")
                .attr("fill", COLORS.blue)
                .text(d => d.value);

            // X axis (room names)
            svg.append("g")
                .attr("transform", `translate(0,${height - margin.bottom})`)
                .call(d3.axisBottom(x).tickSize(0))
                .call(g => g.select(".domain").remove())
                .selectAll("text")
                .attr("font-family", "Montserrat")
                .attr("font-size", isMobile ? "9px" : "11px")
                .attr("transform", isMobile ? "rotate(-30)" : null)
                .style("text-anchor", isMobile ? "end" : "middle");
        }

        function renderD3DonutChart(dataObj) {
            const container = document.getElementById('d3-event-pie-chart');
            container.innerHTML = '';
            
            // Stacked vertical layout: donut on top, legend below
            container.className = "relative w-full flex flex-col items-center gap-3 md:gap-4 py-2";

            const chartWrapper = document.createElement('div');
            chartWrapper.className = "flex-shrink-0 flex justify-center";
            container.appendChild(chartWrapper);

            const isMobile = window.innerWidth < 768;
            const size = isMobile ? 140 : 200;
            const width = size;
            const height = size;
            const radius = Math.min(width, height) / 2;

            const svg = d3.select(chartWrapper).append("svg")
                .attr("width", width)
                .attr("height", height)
                .attr("viewBox", [-width / 2, -height / 2, width, height]);

            const data = Object.entries(dataObj).map(([key, value]) => ({ name: key, value: value }));
            const total = d3.sum(data, d => d.value);

            const color = d3.scaleOrdinal()
                .domain(data.map(d => d.name))
                .range([COLORS.blue, COLORS.red, COLORS.teal, COLORS.orange, COLORS.gray, COLORS.yellow, COLORS.purple]);

            // Sort logic so largest slices appear first
            const pie = d3.pie().value(d => d.value).sort((a, b) => b.value - a.value);
            const arc = d3.arc().innerRadius(radius * 0.50).outerRadius(radius * 0.85);
            const hoverArc = d3.arc().innerRadius(radius * 0.50).outerRadius(radius * 0.92);

            const pieData = pie(data);

            svg.selectAll("path")
                .data(pieData)
                .join("path")
                .attr("fill", d => color(d.data.name))
                .attr("d", arc)
                .attr("stroke", "#fff")
                .attr("stroke-width", "2px")
                .on("mouseover", function (event, d) {
                    d3.select(this).transition().duration(200).attr("d", hoverArc);
                    showTooltip(`<strong>${d.data.name}</strong><br>Count: ${d.data.value}<br>Ratio: ${Math.round((d.data.value / total) * 100)}%`, event);
                })
                .on("mouseout", function () {
                    d3.select(this).transition().duration(200).attr("d", arc);
                    hideTooltip();
                });

            // HTML Legend below the donut — full width, no truncation
            const legendDiv = document.createElement('div');
            legendDiv.className = "flex flex-col gap-2 w-full max-h-[180px] overflow-y-auto custom-scrollbar px-1 md:px-4";
            
            pieData.forEach((d) => {
                const percent = total > 0 ? Math.round((d.data.value / total) * 100) : 0;
                const colorCode = color(d.data.name);
                
                const item = document.createElement('div');
                item.className = "flex items-center justify-between text-xs md:text-sm py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors";
                item.innerHTML = `
                    <div class="flex items-center gap-2 min-w-0 pr-3">
                        <span class="w-3 h-3 rounded-sm flex-shrink-0" style="background-color: ${colorCode}"></span>
                        <span class="text-gray-700 font-medium" title="${d.data.name}">${d.data.name}</span>
                    </div>
                    <div class="text-gray-800 font-bold whitespace-nowrap">
                        ${d.data.value} <span class="text-[10px] md:text-xs text-gray-400 font-medium">(${percent}%)</span>
                    </div>
                `;
                legendDiv.appendChild(item);
            });

            container.appendChild(legendDiv);
        }

        function renderD3GanttChart(bookings) {
            const container = document.getElementById('d3-gantt-chart');
            container.innerHTML = '';
            const isMobile = window.innerWidth < 768;
            const width = isMobile ? Math.max(container.clientWidth, 500) : Math.max(container.clientWidth, 800);
            const margin = isMobile
                ? { top: 15, right: 15, bottom: 30, left: 70 }
                : { top: 20, right: 30, bottom: 40, left: 100 };

            const rooms = Object.keys(APP_CONFIG.ROOM_CONFIG);

            const roomBookings = {};
            rooms.forEach(r => roomBookings[r] = []);
            bookings.forEach(b => { if (rooms.includes(b.room)) roomBookings[b.room].push(b); });

            let allChartLabels = [];
            let dataPoints = [];

            rooms.forEach(roomName => {
                const roomData = roomBookings[roomName];

                // Sort using parser
                roomData.sort((a, b) => parseDate(a.start_iso) - parseDate(b.start_iso));

                const tracks = [];
                let baseTrackIndex = allChartLabels.length;

                roomData.forEach(b => {
                    const start = parseDate(b.start_iso);
                    const end = parseDate(b.end_iso);

                    if (!start.isValid || !end.isValid) return;

                    const startDec = start.hour + (start.minute / 60);
                    let endDec = end.hour + (end.minute / 60);
                    if (endDec === 0 && end.day > start.day) endDec = 24;

                    let trackIndex = -1;
                    for (let i = 0; i < tracks.length; i++) {
                        if (startDec >= tracks[i] + 0.05) { trackIndex = i; break; }
                    }
                    if (trackIndex === -1) { trackIndex = tracks.length; tracks.push(0); }
                    tracks[trackIndex] = endDec;

                    const globalYIndex = baseTrackIndex + trackIndex;
                    if (globalYIndex >= allChartLabels.length) {
                        const label = trackIndex === 0 ? roomName : `${roomName} (${trackIndex + 1})`;
                        allChartLabels.push(label);
                    }

                    dataPoints.push({ yIndex: globalYIndex, startDec, endDec, room: roomName, data: b });
                });

                if (roomData.length === 0) allChartLabels.push(roomName);
            });

            const rowHeight = isMobile ? 30 : 40;
            const height = (allChartLabels.length * rowHeight) + margin.top + margin.bottom;

            const svg = d3.select(container).append("svg")
                .attr("width", width)
                .attr("height", height);

            const x = d3.scaleLinear()
                .domain([9, 23])
                .range([margin.left, width - margin.right]);

            const y = d3.scaleBand()
                .domain(d3.range(allChartLabels.length))
                .range([margin.top, height - margin.bottom])
                .padding(0.2);

            svg.append("g")
                .attr("transform", `translate(0,${height - margin.bottom})`)
                .call(d3.axisBottom(x).ticks(17).tickFormat(d => d > 12 ? `${d - 12}pm` : `${d}am`))
                .attr("color", "#9ca3af");

            svg.append("g")
                .selectAll("text")
                .data(allChartLabels)
                .join("text")
                .attr("x", margin.left - 10)
                .attr("y", (d, i) => y(i) + y.bandwidth() / 2)
                .attr("dy", "0.32em")
                .attr("text-anchor", "end")
                .text(d => d)
                .attr("font-size", isMobile ? "10px" : "12px")
                .attr("font-family", "Montserrat")
                .attr("font-weight", "500")
                .attr("fill", "#4b5563");

            svg.append("g")
                .selectAll("rect")
                .data(dataPoints)
                .join("rect")
                .attr("x", d => x(d.startDec))
                .attr("y", d => y(d.yIndex))
                .attr("width", d => x(d.endDec) - x(d.startDec))
                .attr("height", y.bandwidth())
                .attr("fill", d => ROOM_COLORS[d.room] || COLORS.gray)
                .attr("rx", 4)
                .on("mouseover", (event, d) => {
                    const start = parseDate(d.data.start_iso);
                    const end = parseDate(d.data.end_iso);
                    const startStr = start.isValid ? start.toFormat('h:mm a') : '?';
                    const endStr = end.isValid ? end.toFormat('h:mm a') : '?';
                    showTooltip(`<strong>${d.data.event}</strong><br>${d.data.name}<br>${startStr} - ${endStr}`, event);
                })
                .on("mouseout", hideTooltip);
        }

        // --- TABLE RENDERING ---
        function renderRoomTables(bookings) {
            const rooms = ['Main Hall', 'Jonah', 'Joseph', 'Moses'];

            rooms.forEach(roomName => {
                const roomId = roomName.replace(/\s+/g, '-');
                const tbody = document.getElementById(`tbody-${roomId}`);
                const container = document.getElementById(`container-${roomId}`);
                const countBadge = document.getElementById(`count-${roomId}`);

                if (!tbody || !container) return;

                if (!selectedRooms.includes(roomName)) { container.classList.add('hidden'); return; }
                container.classList.remove('hidden');

                const roomBookings = bookings.filter(b => b.room === roomName);
                countBadge.textContent = `${roomBookings.length} Booking${roomBookings.length !== 1 ? 's' : ''}`;
                tbody.innerHTML = '';

                if (roomBookings.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-gray-400 italic">No bookings found for this room.</td></tr>';
                } else {
                    roomBookings.forEach(b => {
                        const start = parseDate(b.start_iso);
                        const end = parseDate(b.end_iso);
                        const bookingCode = b.id ? b.id.substring(0, 8).toUpperCase() : '---';

                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td data-label="Code" class="px-6 py-4 whitespace-nowrap text-xs font-mono font-medium text-ccf-blue">${bookingCode}</td>
                            <td data-label="Event" class="px-6 py-4 whitespace-nowrap text-sm text-gray-800 font-medium">${b.event}</td>
                            <td data-label="Schedule" class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                <div class="flex flex-col">
                                    <span class="font-medium">${start.isValid ? start.toFormat('MMM d, yyyy') : 'Invalid Date'}</span>
                                    <span class="text-xs text-gray-500">${start.isValid ? start.toFormat('h:mm a') : '?'} - ${end.isValid ? end.toFormat('h:mm a') : '?'}</span>
                                </div>
                            </td>
                            <td data-label="Booked By" class="px-6 py-4 whitespace-nowrap text-sm text-gray-800">${b.name}</td>
                            <td data-label="Pax" class="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                                <span class="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">${b.pax}</span>
                            </td>
                        `;
                        tbody.appendChild(row);
                    });
                }
            });
        }

        // --- BLOCKED DATES LOGIC ---
        function initBlockedDates() {
            const form = document.getElementById('block-date-form');
            if (form) {
                form.addEventListener('submit', handleBlockDateSubmit);

                // Populate Room Select
                const select = document.getElementById('block-room-select');
                const rooms = Object.keys(APP_CONFIG.ROOM_CONFIG);
                rooms.forEach(room => {
                    const opt = document.createElement('option');
                    opt.value = room;
                    opt.textContent = room;
                    select.appendChild(opt);
                });
            }
        }

        function renderBlockedDates() {
            const tbody = document.getElementById('blocked-dates-table-body');
            if (!tbody) return;

            tbody.innerHTML = '';
            if (!blockedDates || blockedDates.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-10 text-center text-sm text-gray-400 italic">No blocked dates currently active.</td></tr>';
                return;
            }

            // Sort by date descending
            const sorted = [...blockedDates].sort((a, b) => new Date(b.date) - new Date(a.date));

            sorted.forEach(block => {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-gray-50 transition-colors group";
                tr.innerHTML = `
                    <td data-label="Date" class="px-4 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm text-gray-900 font-semibold">${DateTime.fromISO(block.date).toFormat('MMM d, yyyy (ccc)')}</td>
                    <td data-label="Room" class="px-4 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm text-gray-600">
                        <span class="px-2 py-0.5 bg-gray-100 rounded border border-gray-200">${block.room}</span>
                    </td>
                    <td data-label="Reason" class="px-4 md:px-6 py-3 md:py-4 text-xs md:text-sm text-gray-500 italic">${block.reason}</td>
                    <td data-label="Action" class="px-4 md:px-6 py-3 md:py-4 whitespace-nowrap text-right">
                        <button onclick='requestDeleteBlockedDate(${JSON.stringify(block).replace(/'/g, "\\'")})' 
                            class="p-1.5 text-gray-400 hover:text-ccf-red hover:bg-red-50 rounded-lg transition-all"
                            title="Remove this block">
                            <svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        // --- NEW: Blocked Date Deletion ---

        let pinModalCallback = null;

        function showPinModal(message, callback) {
            const backdrop = document.getElementById('pin-modal-backdrop');
            const modal = document.getElementById('pin-modal');
            const messageEl = document.getElementById('pin-modal-message');
            const input = document.getElementById('admin-pin-input');

            messageEl.textContent = message;
            input.value = '';
            pinModalCallback = callback;

            backdrop.showModal();

            // Trigger animation
            setTimeout(() => {
                modal.classList.remove('scale-95', 'opacity-0');
                modal.classList.add('scale-100', 'opacity-100');
                input.focus();
            }, 10);
        }

        function closePinModal() {
            const backdrop = document.getElementById('pin-modal-backdrop');
            const modal = document.getElementById('pin-modal');

            modal.classList.remove('scale-100', 'opacity-100');
            modal.classList.add('scale-95', 'opacity-0');

            setTimeout(() => {
                backdrop.close();
                pinModalCallback = null;
            }, 200);
        }

        function handlePinConfirm() {
            const input = document.getElementById('admin-pin-input');
            const pin = input.value.trim();
            if (!pin) {
                input.classList.add('border-red-300', 'shake');
                setTimeout(() => input.classList.remove('shake'), 500);
                return;
            }
            if (pinModalCallback) {
                pinModalCallback(pin);
            }
            closePinModal();
        }

        // Add Enter key support for PIN modal
        document.getElementById('admin-pin-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handlePinConfirm();
        });

        function requestDeleteBlockedDate(block) {
            showPinModal(`To unblock ${block.date} for ${block.room}, please enter the Admin PIN:`, (pin) => {
                executeDeleteBlockedDate(block, pin);
            });
        }

        function executeDeleteBlockedDate(block, pin) {
            updateStatus('Removing block...', 'text-orange-600');

            const payload = { ...block, adminPin: pin };
            const callbackName = `delete_block_${Date.now()}`;
            const script = document.createElement('script');

            window[callbackName] = (response) => {
                delete window[callbackName];
                document.body.removeChild(script);

                if (response.success) {
                    showResultModal('success', 'Block Removed', `${block.date} — ${block.room} is now open.`);
                    fetchData(); // Refresh list and counts
                } else {
                    showResultModal('error', 'Deletion Failed', response.message);
                    updateStatus('Deletion failed', 'text-red-600');
                }
            };

            const url = `${APP_CONFIG.APPS_SCRIPT_URL}?action=delete_block_date&callback=${callbackName}&payload=${encodeURIComponent(JSON.stringify(payload))}`;
            script.src = url;
            script.onerror = () => {
                showResultModal('error', 'Network Error', 'Could not reach server.');
                updateStatus('Connection failed', 'text-red-600');
            };
            document.body.appendChild(script);
        }

        function handleBlockDateSubmit(e) {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Blocking...';
            btn.disabled = true;

            const formData = new FormData(e.target);
            const payload = {
                date: formData.get('block_date'),
                room: formData.get('block_room'),
                reason: formData.get('block_reason'),
                adminPin: formData.get('admin_pin')
            };

            const callbackName = `block_date_${Date.now()}`;
            const script = document.createElement('script');

            window[callbackName] = (response) => {
                btn.innerHTML = originalText;
                btn.disabled = false;
                delete window[callbackName];
                document.body.removeChild(script);

                if (response.success) {
                    e.target.reset();
                    fetchData();

                    if (response.cancelledCount > 0) {
                        // Build cancelled events list HTML
                        let eventsHtml = '<div class="space-y-2">';
                        eventsHtml += `<div class="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm font-medium">`;
                        eventsHtml += `<svg class="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`;
                        eventsHtml += `${response.cancelledCount} booking(s) auto-cancelled</div>`;
                        eventsHtml += '<ul class="ml-1 space-y-1.5">';
                        if (response.cancelledEvents && response.cancelledEvents.length > 0) {
                            response.cancelledEvents.forEach((evt, idx) => {
                                eventsHtml += `<li class="flex items-center gap-2 text-sm text-gray-700">`;
                                eventsHtml += `<span class="flex-shrink-0 w-5 h-5 rounded-full bg-red-100 text-red-600 text-xs font-bold flex items-center justify-center">${idx + 1}</span>`;
                                eventsHtml += `<span>${evt}</span></li>`;
                            });
                        }
                        eventsHtml += '</ul>';
                        eventsHtml += `<div class="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm mt-2">`;
                        eventsHtml += `<svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>`;
                        eventsHtml += `Affected users notified via email.</div>`;
                        eventsHtml += '</div>';
                        showResultModal('success', 'Date Blocked Successfully', `${payload.date} — ${payload.room}`, eventsHtml);
                    } else {
                        showResultModal('success', 'Date Blocked Successfully', `${payload.date} — ${payload.room}`);
                    }
                } else {
                    showResultModal('error', 'Failed to Block Date', response.message);
                }
            };

            const url = `${APP_CONFIG.APPS_SCRIPT_URL}?action=block_date&callback=${callbackName}&payload=${encodeURIComponent(JSON.stringify(payload))}`;
            script.src = url;
            script.onerror = () => {
                btn.innerHTML = originalText;
                btn.disabled = false;
                showResultModal('error', 'Network Error', 'Could not reach the server. Please check your connection and try again.');
            };
            document.body.appendChild(script);
        }
        // --- RESULT MODAL LOGIC ---
        function showResultModal(type, title, subtitle, bodyHtml) {
            const backdrop = document.getElementById('result-modal-backdrop');
            const icon = document.getElementById('result-modal-icon');
            const titleEl = document.getElementById('result-modal-title');
            const subtitleEl = document.getElementById('result-modal-subtitle');
            const body = document.getElementById('result-modal-body');
            const closeBtn = document.getElementById('result-modal-close-btn');

            // Set icon
            if (type === 'success') {
                icon.className = 'flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-2xl bg-emerald-100';
                icon.innerHTML = '<svg class="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';
            } else {
                icon.className = 'flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-2xl bg-red-100';
                icon.innerHTML = '<svg class="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>';
            }

            titleEl.textContent = title;
            subtitleEl.textContent = subtitle || '';
            subtitleEl.classList.toggle('hidden', !subtitle);

            if (bodyHtml) {
                body.innerHTML = bodyHtml;
                body.classList.remove('hidden');
            } else {
                body.innerHTML = '';
                body.classList.add('hidden');
            }

            // Show
            backdrop.style.display = 'flex';
            backdrop.classList.remove('hidden');

            // Close handler
            const closeModal = () => {
                backdrop.style.display = 'none';
                backdrop.classList.add('hidden');
                closeBtn.removeEventListener('click', closeModal);
                backdrop.removeEventListener('click', backdropClick);
            };
            const backdropClick = (e) => { if (e.target === backdrop) closeModal(); };

            closeBtn.addEventListener('click', closeModal);
            backdrop.addEventListener('click', backdropClick);
        }
    