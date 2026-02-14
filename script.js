document.addEventListener('DOMContentLoaded', () => {
    const DateTime = luxon.DateTime;

    // --- STATE & MODAL REFERENCES ---
    const state = {
        currentDate: DateTime.local().setZone(APP_CONFIG.TIMEZONE),
        allBookings: [],
        selectedRoom: Object.keys(APP_CONFIG.ROOM_CONFIG)[0],
        isLoading: false,
        selectedSlot: null,
        pendingBookingData: null,
        pendingMoveData: null,
    };

    // Define the overall maximum capacity for each room (used for admin max bookings)
    const ROOM_CAPACITIES = {
        "Main Hall": 55,
        "Jonah": 20,
        "Joseph": 15,
        "Moses": 15,
        // Add other rooms here as needed
    };

    const EVENT_OPTIONS = {
        USER: [
            { name: "Discipleship Group Meeting", setsMaxCapacity: false },
            { name: "Ministry Event - Meeting", setsMaxCapacity: false }
        ],
        ADMIN_ADDITIONS: [
            { name: "Ministry Event - B1G Fridays", setsMaxCapacity: true },
            { name: "Ministry Event - Elevate", setsMaxCapacity: true },
            { name: "Ministry Event - Exalt Rehearsal", setsMaxCapacity: true },
            { name: "Ministry Event - Intercede Prayer Ministry", setsMaxCapacity: true },
            { name: "Ministry Event - Women 2 Women", setsMaxCapacity: true },
            { name: "Ministry Event - MOVEMENT", setsMaxCapacity: true },
            { name: "Ministry Event - ACROSS Family Ministry", setsMaxCapacity: true },
            { name: "Sunday Service", setsMaxCapacity: true }
        ]
    };


    // Select the calendar grids by ID
    const calendarDayHeaders = document.getElementById('calendar-day-headers');
    const calendarView = document.getElementById('calendar-slots-grid');
    const loader = document.getElementById('loader');
    const roomSelector = document.getElementById('room-selector');

    // Modals and Forms
    const choiceModal = document.getElementById('choice-modal');
    const bookingModal = document.getElementById('booking-modal');
    const bookingForm = document.getElementById('booking-form');
    const cancelModal = document.getElementById('cancel-modal');
    const cancelForm = document.getElementById('cancel-form');
    const confirmSummaryModal = document.getElementById('confirm-summary-modal');
    const loadingModal = document.getElementById('loading-modal');
    const successModal = document.getElementById('success-modal');

    const calendarControls = {
        prevWeekBtn: document.getElementById('prev-week'),
        nextWeekBtn: document.getElementById('next-week'),
        currentWeekTitle: document.getElementById('current-week-title'),
    };

    // My Bookings UI
    const myBookingsBtn = document.getElementById('my-bookings-btn');
    const myBookingsModal = document.getElementById('my-bookings-modal');
    const myBookingsForm = document.getElementById('my-bookings-form');
    const myBookingsResults = document.getElementById('my-bookings-results');
    const myBookingsEmpty = document.getElementById('my-bookings-empty');
    const myBookingsLoading = document.getElementById('my-bookings-loading');

    // GDPR Data Rights UI
    const gdprRightsSection = document.getElementById('gdpr-rights-section');
    let gdprLookupEmail = null; // Tracks the email used for the last My Bookings lookup

    // --- CORE APP FUNCTIONS ---

    /**
     * Renders the event dropdown options based on admin status.
     * @param {boolean} isAdmin - True if the admin toggle is checked.
     */
    function renderEventDropdown(isAdmin) {
        const eventSelector = bookingForm.querySelector('#event'); // Assuming the ID of the dropdown is 'event'
        if (!eventSelector) return;

        // Start with a clean slate
        eventSelector.innerHTML = '';

        // Add the default placeholder option
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select an event type...';
        placeholder.disabled = true;
        placeholder.selected = true;
        eventSelector.appendChild(placeholder);

        // 1. Add User (Base) options
        const allOptions = [...EVENT_OPTIONS.USER];

        // 2. Add Admin options if applicable
        if (isAdmin) {
            allOptions.push(...EVENT_OPTIONS.ADMIN_ADDITIONS);
        }

        // 3. Populate the dropdown
        allOptions.forEach(eventObj => { // Loop through event objects
            const option = document.createElement('option');
            option.value = eventObj.name; // Use eventObj.name for the value
            option.textContent = eventObj.name; // Use eventObj.name for display text
            // Store the setsMaxCapacity property as a data attribute on the option
            option.dataset.setsMaxCapacity = eventObj.setsMaxCapacity;
            eventSelector.appendChild(option);
        });
    }

    // --- HELPER: ROBUST DATE PARSER ---
    function parseDate(dateInput) {
        if (!dateInput) return DateTime.invalid('missing data');

        // FIX: Handle "Fake UTC" strings. 
        // The server sends Manila time (e.g. 10:00) but adds 'Z' (UTC marker).
        // We strip the 'Z' so Luxon treats "2025-11-29T10:00:00" as 10:00 AM in the configured APP_CONFIG.TIMEZONE.
        if (typeof dateInput === 'string' && dateInput.endsWith('Z')) {
            dateInput = dateInput.slice(0, -1);
        }

        // 1. Try Standard ISO (now treated as Local due to stripped Z)
        let dt = DateTime.fromISO(dateInput, { zone: APP_CONFIG.TIMEZONE });
        if (dt.isValid) return dt;

        // 2. Try SQL/Sheets Format (e.g., "2025-11-29 13:00:00")
        dt = DateTime.fromSQL(dateInput, { zone: APP_CONFIG.TIMEZONE });
        if (dt.isValid) return dt;

        // 3. Try standard Javascript Date constructor as fallback
        const jsDate = new Date(dateInput);
        if (!isNaN(jsDate)) {
            return DateTime.fromJSDate(jsDate, { zone: APP_CONFIG.TIMEZONE });
        }

        return DateTime.invalid('unsupported format');
    }

    function adjustStickyOffsets() {
        const header = document.getElementById('main-header');
        const controlsWrapper = document.getElementById('sticky-controls-wrapper');

        if (!header || !controlsWrapper) return;

        const headerHeight = header.offsetHeight;
        const controlsHeight = controlsWrapper.offsetHeight;

        // 1. Set Controls Wrapper Top
        document.body.style.setProperty('--controls-top', `${headerHeight}px`);

        // 2. Set Calendar Header Top
        const totalTop = headerHeight + controlsHeight;
        document.body.style.setProperty('--calendar-header-top', `${totalTop}px`);
    }

    function init() {
        initializeRoomSelector();
        setupEventListeners();
        render(); // This renders the empty grid or initial state

        // Layout Adjustment - Initial Call
        adjustStickyOffsets();

        // Robust Observation for Size Changes (Images loading, banner, etc.)
        const header = document.getElementById('main-header');
        const controls = document.getElementById('sticky-controls-wrapper');
        const banner = document.getElementById('announcement-banner');

        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(adjustStickyOffsets);
        });

        if (header) resizeObserver.observe(header);
        if (controls) resizeObserver.observe(controls);
        if (banner) resizeObserver.observe(banner); // Also watch banner height directly

        window.addEventListener('resize', adjustStickyOffsets);
    }

    function initializeRoomSelector() {
        const roomNames = Object.keys(APP_CONFIG.ROOM_CONFIG);
        roomNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            roomSelector.appendChild(option);
        });
        state.selectedRoom = roomNames[0];
    }

    function setupEventListeners() {

        // Add Move Modal Logic
        const moveModal = document.getElementById('move-modal');
        const moveForm = document.getElementById('move-form');


        roomSelector.addEventListener('change', (e) => {
            state.selectedRoom = e.target.value;
            render();
        });

        calendarControls.prevWeekBtn.addEventListener('click', () => changeWeek(-1));
        calendarControls.nextWeekBtn.addEventListener('click', () => changeWeek(1));
        calendarView.addEventListener('click', handleSlotClick);

        // Modal Listeners
        document.getElementById('choice-book-btn').addEventListener('click', openBookingModalForSelectedSlot);
        document.getElementById('choice-cancel-btn').addEventListener('click', openCancelModalForSelectedSlot);
        const moveBtn = document.getElementById('choice-move-btn');
        if (moveBtn) {
            moveBtn.addEventListener('click', openMoveModalForSelectedSlot);
        }
        // Duplicate Logic Listeners
        const duplicateBtn = document.getElementById('choice-duplicate-btn');
        if (duplicateBtn) {
            duplicateBtn.addEventListener('click', openDuplicateSelectionModalForSelectedSlot);
        }
        document.getElementById('duplicate-booking-list').addEventListener('change', handleDuplicateSelectionChange);
        document.getElementById('confirm-duplicate-selection-btn').addEventListener('click', handleDuplicateConfirmation);
        document.getElementById('duplicate-date').addEventListener('change', handleDuplicateDateChange);

        document.getElementById('move-sum-no-btn').addEventListener('click', () => document.getElementById('move-summary-modal').close());
        document.getElementById('move-sum-yes-btn').addEventListener('click', proceedWithMove);

        document.getElementById('choice-back-btn').addEventListener('click', () => choiceModal.close());
        bookingForm.addEventListener('submit', handleBookingFormSubmit);
        cancelForm.addEventListener('submit', handleCancelFormSubmit);
        document.getElementById('cancel-booking-list').addEventListener('change', handleCancelSelectionChange);
        document.getElementById('summary-yes-btn').addEventListener('click', proceedWithBooking);
        document.getElementById('summary-no-btn').addEventListener('click', () => confirmSummaryModal.close());
        document.getElementById('success-done-btn').addEventListener('click', () => successModal.close());
        document.querySelectorAll('.cancel-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // Close ALL modals when any cancel button is clicked
                if (typeof bookingModal !== 'undefined') bookingModal.close();
                if (typeof cancelModal !== 'undefined') cancelModal.close();
                if (typeof bookingModal !== 'undefined') bookingModal.close();
                if (typeof cancelModal !== 'undefined') cancelModal.close();
                if (moveModal) moveModal.close();
                const duplicateModal = document.getElementById('duplicate-selection-modal');
                if (duplicateModal) duplicateModal.close();
                // Reset Duplicate State
                document.getElementById('duplicate-date-wrapper').classList.add('hidden');
                document.getElementById('duplicate-date').value = '';
                state.duplicationSource = null;
            });
        });

        // Terms Modal Logic
        const termsModal = document.getElementById('terms-modal');
        const termsLinkBtn = document.getElementById('terms-link-btn');
        const termsCloseBtn = document.getElementById('terms-close-btn');

        if (termsLinkBtn && termsModal) {
            termsLinkBtn.addEventListener('click', () => termsModal.showModal());
        }
        if (termsCloseBtn && termsModal) {
            termsCloseBtn.addEventListener('click', () => termsModal.close());
        }

        // Privacy Policy Modal Logic
        const privacyModal = document.getElementById('privacy-modal');
        const privacyLinkBtn = document.getElementById('privacy-link-btn');
        const privacyCloseBtn = document.getElementById('privacy-close-btn');

        if (privacyLinkBtn && privacyModal) {
            privacyLinkBtn.addEventListener('click', () => privacyModal.showModal());
        }
        if (privacyCloseBtn && privacyModal) {
            privacyCloseBtn.addEventListener('click', () => privacyModal.close());
        }

        // Conflict Modal Listeners
        const conflictModal = document.getElementById('conflict-modal');
        document.getElementById('conflict-cancel-btn').addEventListener('click', () => conflictModal.close());
        document.getElementById('conflict-proceed-btn').addEventListener('click', () => {
            conflictModal.close();
            openMoveSummaryModal(); // Go to the next step
        });



        moveForm.addEventListener('submit', handleMoveFormSubmit);
        document.getElementById('move-booking-list').addEventListener('change', handleMoveSelectionChange);

        // NEW: Listener for Admin Toggle
        document.getElementById('admin-toggle').addEventListener('change', (e) => {
            const isAdmin = e.target.checked;

            // --- CRITICAL ADDITION: RENDER DROPDOWN BASED ON NEW ADMIN STATUS ---
            renderEventDropdown(isAdmin);

            document.getElementById('user-fields').classList.toggle('hidden', isAdmin);
            document.getElementById('admin-fields').classList.toggle('hidden', !isAdmin);

            const participantsInput = bookingForm.querySelector('#participants');

            // --- CRITICAL CHANGE: BYPASSING PARTICIPANT LIMIT ---
            if (isAdmin) {
                // Admin can bypass the MAX_PARTICIPANTS_PER_BOOKING limit
                participantsInput.removeAttribute('max');
            } else if (state.selectedSlot) {
                // User must adhere to the rule, so re-apply the max limit
                const maxPerBooking = state.selectedSlot.rules.MAX_PARTICIPANTS_PER_BOOKING;
                participantsInput.max = maxPerBooking;
            }
            // --- END CRITICAL CHANGE ---

            // Also update participant helper text
            if (state.selectedSlot) {
                updateParticipantRules(state.selectedSlot.rules, isAdmin);
            }
        });

        // --- NEW LISTENER FOR EVENT DROPDOWN ---
        bookingForm.querySelector('#event').addEventListener('change', (e) => {
            const selectedOption = e.target.selectedOptions[0];
            const setsMaxCapacity = selectedOption.dataset.setsMaxCapacity === 'true'; // Convert string to boolean

            if (setsMaxCapacity && state.selectedSlot) {
                const participantsInput = bookingForm.querySelector('#participants');

                // --- CRITICAL CHANGE: Use overall room capacity ---
                const selectedRoomName = state.selectedRoom; // e.g., "Main Hall"
                const maxRoomCapacity = ROOM_CAPACITIES[selectedRoomName] || 0; // Get 55, 20, etc.

                // 1. Ensure the admin bypass is active if this feature is used (optional check)
                const isAdmin = document.getElementById('admin-toggle').checked;
                if (!isAdmin) {
                    // Safety: If they choose a max capacity event without admin status, warn them
                    // and allow them to proceed only up to the booking limit.
                    // However, based on your previous requirement, max capacity events are often admin-only.
                    // Assuming the admin flag is checked if they can see these options.
                }

                // 2. Set participants to the room's OVERALL MAX CAPACITY
                participantsInput.value = maxRoomCapacity;

                // 3. Re-apply the overall room capacity as the max attribute (if not already removed by admin logic)
                participantsInput.max = maxRoomCapacity;
            }
        });


        // --- MY BOOKINGS EVENTS ---
        if (myBookingsBtn) {
            myBookingsBtn.addEventListener('click', () => {
                myBookingsModal.showModal();
                // Reset form and results
                myBookingsForm.reset();
                myBookingsResults.querySelectorAll('.booking-item').forEach(e => e.remove());
                myBookingsEmpty.classList.add('hidden');
                myBookingsLoading.classList.add('hidden');
                // Reset GDPR section
                if (gdprRightsSection) gdprRightsSection.classList.add('hidden');
                gdprLookupEmail = null;
            });
        }

        if (myBookingsForm) {
            myBookingsForm.addEventListener('submit', handleMyBookingsSubmit);
        }

        // Close My Bookings Modal
        if (myBookingsModal) {
            myBookingsModal.querySelector('.cancel-btn').addEventListener('click', () => myBookingsModal.close());
            // Close on backdrop click
            myBookingsModal.addEventListener('click', (e) => {
                if (e.target === myBookingsModal) myBookingsModal.close();
            });
        }

        // GDPR Data Rights Event Listeners
        document.getElementById('download-my-data-btn')?.addEventListener('click', handleDownloadMyData);
        document.getElementById('delete-my-data-btn')?.addEventListener('click', handleDeleteMyData);
        document.getElementById('gdpr-privacy-link')?.addEventListener('click', () => {
            document.getElementById('privacy-modal')?.showModal();
        });

        // --- ADMIN LOGIN EVENTS ---
        const goToDashboardBtn = document.getElementById('go-to-dashboard-btn');
        if (goToDashboardBtn) {
            goToDashboardBtn.addEventListener('click', openAdminLoginModal);
        }

        const adminLoginForm = document.getElementById('admin-login-form');
        if (adminLoginForm) {
            adminLoginForm.addEventListener('submit', handleAdminLoginSubmit);
        }
    }

    async function render() {
        setLoading(true, 'page');
        renderCalendarShell();
        try {
            await fetchAllBookings();
            renderBookingsForSelectedRoom();
        } catch (error) {
            console.error("Failed to render:", error);
            showToast("Error: Could not load bookings.", "error");
        } finally {
            setLoading(false, 'page');
        }
    }

    // --- CALENDAR RENDERING ---

    function renderCalendarShell() {
        // Clear both the header row and the time-slot grid
        calendarDayHeaders.innerHTML = '';
        calendarView.innerHTML = '';

        const startOfWeek = state.currentDate.startOf('week');
        const endOfWeek = state.currentDate.endOf('week');
        calendarControls.currentWeekTitle.textContent = `${startOfWeek.toFormat('LLL d')} - ${endOfWeek.toFormat('LLL d, yyyy')}`;

        // Create Legend Header (empty top-left cell)
        const legendHeader = document.createElement('div');
        legendHeader.className = 'p-2 border-b-4 border-r border-ccf-blue bg-white';
        // Using bg-white to match header background or gray-50? Existing headers use bg-slate-50 or ccf-blue (for today). 
        // Let's use bg-slate-50 to match inactive days.
        legendHeader.className = 'text-center p-2 border-b-4 border-r border-ccf-blue bg-slate-50 flex items-center justify-center';
        legendHeader.innerHTML = '<span class="text-xs font-bold text-gray-400">AM/PM</span>';
        calendarDayHeaders.appendChild(legendHeader);

        // Create Legend Column (AM/PM vertical blocks)
        const legendColumn = document.createElement('div');
        legendColumn.className = 'flex flex-col border-r border-b border-slate-200';

        let amSlots = 0, pmSlots = 0;
        const refHours = APP_CONFIG.BUSINESS_HOURS[0]; // Assuming uniform schedule
        if (refHours && refHours.start) {
            // Calculate using simple integer math or temp dates
            const [sH, sM] = refHours.start.split(':').map(Number);
            const [eH, eM] = refHours.end.split(':').map(Number);

            // Use arbitrary date for calculation
            let curr = DateTime.now().set({ hour: sH, minute: sM, second: 0, millisecond: 0 });
            const end = curr.set({ hour: eH, minute: eM });

            while (curr < end) {
                if (curr.hour < 12) amSlots++; else pmSlots++;
                curr = curr.plus({ minutes: APP_CONFIG.SLOT_DURATION_MINUTES });
            }
        }

        if (amSlots > 0) {
            const amDiv = document.createElement('div');
            amDiv.style.flex = amSlots;
            // Center content, allow text to be large
            amDiv.className = 'flex items-center justify-center border-b-4 border-gray-300 bg-slate-50 text-gray-400 font-bold text-xl';
            amDiv.innerText = 'AM';
            legendColumn.appendChild(amDiv);
        }
        if (pmSlots > 0) {
            const pmDiv = document.createElement('div');
            pmDiv.style.flex = pmSlots;
            pmDiv.className = 'flex items-center justify-center bg-slate-50 text-gray-400 font-bold text-xl';
            pmDiv.innerText = 'PM';
            legendColumn.appendChild(pmDiv);
        }
        calendarView.appendChild(legendColumn);

        for (let i = 0; i < 7; i++) {
            const day = startOfWeek.plus({ days: i });

            // 1. Build the day header cell
            const dayHeader = document.createElement('div');
            const isToday = day.hasSame(DateTime.local().setZone(APP_CONFIG.TIMEZONE), 'day');
            if (isToday) {
                dayHeader.className = 'text-center p-2 border-b-4 border-r border-ccf-blue bg-ccf-blue';
                dayHeader.innerHTML = `<span class="font-bold text-white text-sm md:text-base uppercase tracking-wider">${day.toFormat('ccc')}</span><br><span class="text-xs md:text-sm text-blue-200 font-bold">${day.toFormat('d')}</span>`;
            } else {
                dayHeader.className = 'text-center p-2 border-b-4 border-r border-ccf-blue bg-slate-50';
                dayHeader.innerHTML = `<span class="font-bold text-ccf-blue text-sm md:text-base uppercase tracking-wider">${day.toFormat('ccc')}</span><br><span class="text-xs md:text-sm text-gray-600 font-bold">${day.toFormat('d')}</span>`;
            }
            calendarDayHeaders.appendChild(dayHeader);

            // 2. Build the day column with ONLY time slots (goes into the content grid)
            const dayColumn = document.createElement('div');
            dayColumn.className = 'border-r border-b border-slate-200';

            const hours = APP_CONFIG.BUSINESS_HOURS[day.weekday % 7];
            if (hours && hours.start) {
                const dayStart = day.set({ hour: parseInt(hours.start.split(':')[0]), minute: parseInt(hours.start.split(':')[1]) });
                const dayEnd = day.set({ hour: parseInt(hours.end.split(':')[0]), minute: parseInt(hours.end.split(':')[1]) });
                for (let currentTime = dayStart; currentTime < dayEnd; currentTime = currentTime.plus({ minutes: APP_CONFIG.SLOT_DURATION_MINUTES })) {
                    dayColumn.appendChild(createTimeSlot(currentTime));
                }
            } else {
                const closedDiv = document.createElement('div');
                closedDiv.className = 'p-4 text-center text-slate-400 text-xs md:text-base';
                closedDiv.textContent = 'Closed';
                dayColumn.appendChild(closedDiv);
            }
            calendarView.appendChild(dayColumn);
        }
    }

    function createTimeSlot(time) {
        const slot = document.createElement('div');
        const isPast = time < DateTime.local().setZone(APP_CONFIG.TIMEZONE);
        const isNoon = time.hour === 12 && time.minute === 0;
        const borderClass = isNoon ? 'border-t-4 border-gray-300' : 'border-t border-slate-100';

        // MOBILE OPTIMIZATION: text-xs on mobile, text-sm on desktop
        slot.className = `time-slot p-1 md:p-2 text-center text-[10px] md:text-sm ${borderClass} h-10 md:h-14 flex items-center justify-center`;
        slot.dataset.startIso = time.toISO();
        if (isPast) {
            slot.classList.add('past', 'bg-slate-100', 'cursor-not-allowed');
            slot.innerHTML = `<div class="time-label" style="color:#cbd5e1;">${time.toFormat('h:mm')}</div>`;
        }
        return slot;
    }

    function renderBookingsForSelectedRoom() {
        const roomRules = APP_CONFIG.ROOM_CONFIG[state.selectedRoom];
        const roomBookings = state.allBookings.filter(b => b.room === state.selectedRoom);
        document.querySelectorAll('.time-slot').forEach(slotEl => {
            // Skip past slots entirely — they stay as plain gray cells
            if (slotEl.classList.contains('past')) return;

            const slotStart = DateTime.fromISO(slotEl.dataset.startIso);
            const slotEnd = slotStart.plus({ minutes: APP_CONFIG.SLOT_DURATION_MINUTES });
            const borderClass = (slotStart.hour === 12 && slotStart.minute === 0) ? 'border-t-4 border-gray-300' : 'border-t border-slate-100';
            const isPast = slotEl.classList.contains('past');

            // --- NEW: BLOCKED DATE CHECK ---
            const slotDateStr = slotStart.toISODate(); // YYYY-MM-DD
            const blockedInfo = state.blockedDates && state.blockedDates.find(d => {
                const dateMatch = d.date === slotDateStr;
                const roomMatch = d.room === "All Rooms" || d.room === state.selectedRoom;
                return dateMatch && roomMatch;
            });

            if (blockedInfo) {
                slotEl.className = `time-slot p-1 md:p-2 text-center text-[10px] md:text-sm ${borderClass} h-10 md:h-14 flex flex-col items-center justify-center bg-gray-200 text-gray-500 cursor-not-allowed`;
                const isMobile = window.innerWidth < 768;
                const blockedLabel = isMobile ? blockedInfo.reason : `Closed: ${blockedInfo.reason}`;
                slotEl.innerHTML = `<div class="time-label">${slotStart.toFormat('h:mm')}</div><div class="status-label font-bold text-gray-600">${blockedLabel}</div>`;
                delete slotEl.dataset.bookingId;
                delete slotEl.dataset.bookingName;
                slotEl.classList.add('past'); // Ensure blocked dates are treated as non-clickable
                return;
            }
            // -------------------------------

            let totalParticipants = 0, totalGroups = 0;
            // FIX: Using the Robust Date Parser here
            const overlappingBookings = roomBookings.filter(b => {
                const bStart = parseDate(b.start_iso); // Tries multiple formats
                const bEnd = parseDate(b.end_iso);     // Tries multiple formats

                if (!bStart.isValid || !bEnd.isValid) return false; // Safety check

                return bStart < slotEnd && bEnd > slotStart;
            });

            overlappingBookings.forEach(b => {
                totalParticipants += parseInt(b.participants, 10);
                totalGroups++;
            });
            slotEl.dataset.totalParticipants = totalParticipants;
            slotEl.dataset.totalGroups = totalGroups;
            const primaryBooking = overlappingBookings.find(b => {
                const bStart = parseDate(b.start_iso); // Uses parser
                return bStart.equals(slotStart);
            });
            if (primaryBooking) {
                slotEl.dataset.bookingId = primaryBooking.id;
                slotEl.dataset.bookingName = `${primaryBooking.first_name} ${primaryBooking.last_name}`;
            } else {
                delete slotEl.dataset.bookingId;
                delete slotEl.dataset.bookingName;
            }

            // Reset classes but preserve 'past' styling if needed
            slotEl.className = `time-slot p-1 md:p-2 text-center text-[10px] md:text-sm ${borderClass} h-10 md:h-14 flex flex-col items-center justify-center`;
            if (isPast) {
                slotEl.classList.add('past', 'bg-slate-100', 'text-slate-400', 'cursor-not-allowed');
            }

            const timeLabelHTML = `<div class="time-label">${slotStart.toFormat('h:mm')}</div>`;
            let statusLabelHTML = '';

            if (totalParticipants >= roomRules.MAX_TOTAL_PARTICIPANTS || totalGroups >= roomRules.MAX_CONCURRENT_GROUPS) {
                slotEl.classList.add('full');
                // If full, we might want to override the 'past' gray with red, or keep it gray?
                // Usually 'past' implies read-only. We still want to see it was full.
                statusLabelHTML = `<div class="status-label">Full</div>`;
            } else if (totalParticipants > 0) {
                const remainingPax = roomRules.MAX_TOTAL_PARTICIPANTS - totalParticipants;
                slotEl.classList.add('partial');
                const isMobile = window.innerWidth < 768;
                const spotsText = isMobile ? `${remainingPax} left` : `${remainingPax} spots left`;
                statusLabelHTML = `<div class="status-label">${spotsText}</div>`;
            } else {
                slotEl.classList.add('available');
            }
            slotEl.innerHTML = (statusLabelHTML) ? `${timeLabelHTML}${statusLabelHTML}` : `<div class="time-label">${slotStart.toFormat('h:mm')}</div>`;
        });
    }

    // --- MODAL & CLICK HANDLING ---

    function handleSlotClick(e) {
        const slot = e.target.closest('.time-slot');
        if (!slot || slot.classList.contains('past')) return;
        const roomRules = APP_CONFIG.ROOM_CONFIG[state.selectedRoom];
        state.selectedSlot = {
            startTime: DateTime.fromISO(slot.dataset.startIso),
            totalParticipants: parseInt(slot.dataset.totalParticipants || '0', 10),
            totalGroups: parseInt(slot.dataset.totalGroups || '0', 10),
            rules: roomRules
        };

        // --- VALIDATION LOGIC REORDERED FOR TOAST Z-INDEX ---
        // Store warning message to show AFTER modal opens
        let warningMessage = null;

        // 1. Calculate the difference in days from NOW
        const now = DateTime.now().setZone(APP_CONFIG.TIMEZONE).startOf('day');
        const targetDate = state.selectedSlot.startTime.setZone(APP_CONFIG.TIMEZONE).startOf('day');
        const diffInDays = targetDate.diff(now, 'days').days;

        // 2. Define the Booking Window
        const MAX_ADVANCE_DAYS = 7;

        // 3. Check Restriction (Soft check to allow Admin override)
        if (diffInDays > MAX_ADVANCE_DAYS) {
            warningMessage = `Note: Dates beyond ${MAX_ADVANCE_DAYS} days are restricted to Admins.`;
        }

        // 4. Min Notice Check (24 Hours)
        const nowExact = DateTime.now().setZone(APP_CONFIG.TIMEZONE);
        const slotStartExact = state.selectedSlot.startTime.setZone(APP_CONFIG.TIMEZONE);
        const diffInHours = slotStartExact.diff(nowExact, 'hours').hours;
        const MIN_NOTICE_HOURS = 24;

        if (diffInHours < MIN_NOTICE_HOURS && diffInHours > 0) {
            warningMessage = `Note: Bookings within ${MIN_NOTICE_HOURS} hours are restricted to Admins.`;
        }
        // --------------------------------------------

        if (slot.classList.contains('partial') || slot.classList.contains('full')) {
            const bookButton = document.getElementById('choice-book-btn');
            const duplicateButton = document.getElementById('choice-duplicate-btn');

            const remainingGroups = roomRules.MAX_CONCURRENT_GROUPS - state.selectedSlot.totalGroups;
            const remainingPax = roomRules.MAX_TOTAL_PARTICIPANTS - state.selectedSlot.totalParticipants;

            // Toggle Book Button
            bookButton.style.display = (remainingGroups <= 0 || remainingPax < roomRules.MIN_BOOKING_SIZE) ? 'none' : 'inline-block';

            // Toggle Duplicate Button
            if (duplicateButton) duplicateButton.classList.remove('hidden');

            choiceModal.showModal();

            // Show toast AFTER modal is open (Top Layer Stack)
            if (warningMessage) showToast(warningMessage, 'info');

        } else if (slot.classList.contains('available')) {
            openBookingModalForSelectedSlot();

            // Show toast AFTER modal is open (Top Layer Stack)
            if (warningMessage) showToast(warningMessage, 'info');
        }
    }

    function openBookingModalForSelectedSlot() {
        choiceModal.close();
        bookingForm.reset();
        // document.getElementById('admin-toggle').checked = false;

        // Ensure Admin Toggle is reset to User (unchecked)
        const adminToggle = document.getElementById('admin-toggle');
        adminToggle.disabled = false; // Re-enable for normal booking
        const isAdmin = adminToggle.checked = false;

        document.getElementById('user-fields').classList.remove('hidden');
        document.getElementById('admin-fields').classList.add('hidden');
        const { startTime, rules } = state.selectedSlot;
        // --- CRITICAL ADDITION: RENDER DROPDOWN FOR USER (false) ---
        renderEventDropdown(isAdmin);


        // --- REVISED CHANGE: Using a dedicated element for date info ---

        // 1. Format the date/time string
        // Example: "Mon, Nov 10, 9:00 AM" (using current time of Nov 8, 2025)
        const formattedDate = startTime.toFormat('ccc, MMM d, h:mm a');



        // 3. Populate the dedicated date/time element (This targets the highlighted area)
        const dateInfoElement = document.getElementById('modal-date-info');
        if (dateInfoElement) {
            dateInfoElement.textContent = formattedDate;
        }

        // --- END OF REVISED CHANGE ---

        updateParticipantRules(rules, false);
        document.getElementById('modal-title').textContent = `Book ${state.selectedRoom}`;
        bookingForm.querySelector('#start-iso').value = startTime.toISO();
        bookingForm.querySelector('#end-time').value = startTime.plus({ minutes: APP_CONFIG.SLOT_DURATION_MINUTES }).toFormat('HH:mm');
        bookingModal.showModal();
    }

    function updateParticipantRules(rules, isAdmin) {
        const { totalParticipants } = state.selectedSlot;
        const remainingCapacity = rules.MAX_TOTAL_PARTICIPANTS - totalParticipants;
        const maxAllowed = Math.min(rules.MAX_BOOKING_SIZE, remainingCapacity);
        const minAllowed = rules.MIN_BOOKING_SIZE;
        const participantsInput = bookingForm.querySelector('#participants');

        participantsInput.max = maxAllowed;
        participantsInput.min = minAllowed;
        if (parseInt(participantsInput.value, 10) < minAllowed) {
            participantsInput.value = minAllowed;
        }
        // --- START OF CHANGE ---

        // 1. Build the helper text string
        let helperText = `Group size: ${minAllowed} - ${maxAllowed} participants. `;

        // 2. Add the max concurrent groups from the rules
        helperText += `Max groups for this room: ${rules.MAX_CONCURRENT_GROUPS}. `;

        // 3. Add the booking window date
        const maxDate = DateTime.local().plus(isAdmin ? { months: 6 } : { days: 7 });
        helperText += `Can book up to ${maxDate.toFormat('LLL d')}.`;

        // --- END OF CHANGE ---
        document.getElementById('participants-helper-text').textContent = helperText;
    }

    function openCancelModalForSelectedSlot() {
        choiceModal.close();
        const { startTime } = state.selectedSlot;
        const slotEnd = startTime.plus({ minutes: APP_CONFIG.SLOT_DURATION_MINUTES });
        const overlappingBookings = state.allBookings.filter(b => {
            if (b.room !== state.selectedRoom) return false;
            // --- OLD CODE (Cause of Bug) ---
            // const bStart = DateTime.fromISO(b.start_iso);
            // const bEnd = DateTime.fromISO(b.end_iso);

            // --- NEW CODE (The Fix) ---
            const bStart = parseDate(b.start_iso); // Use the robust parser
            const bEnd = parseDate(b.end_iso);     // Use the robust parser

            // Safety check in case parsing fails
            if (!bStart.isValid || !bEnd.isValid) return false;

            return bStart < slotEnd && bEnd > startTime;
        });
        const listContainer = document.getElementById('cancel-booking-list');
        listContainer.innerHTML = '';
        if (overlappingBookings.length === 0) {
            listContainer.innerHTML = '<p class="text-slate-500">No bookings found in this slot to cancel.</p>';
        } else {
            overlappingBookings.forEach(booking => {
                const label = document.createElement('label');
                // label.innerHTML = `
                //     <input type="radio" name="booking-to-cancel" value="${booking.id}" class="mr-2">
                //     <span>Booking by <strong>${booking.first_name} ${booking.last_name}</strong> (${booking.participants} participants)</span>
                // `;
                // Added a styling fix for better readability
                label.className = "block p-3 border border-gray-200 rounded-md cursor-pointer hover:bg-gray-50 transition-colors";
                label.innerHTML = `
                    <div class="flex items-start gap-3">
                        <input type="radio" name="booking-to-cancel" value="${booking.id}" class="mt-1 text-ccf-red focus:ring-ccf-red">
                        <div class="text-sm">
                            <span class="font-bold text-gray-800">${booking.event}</span><br>
                            <span class="text-gray-600">Booked by: ${booking.first_name} ${booking.last_name}</span>
                            <span class="text-xs text-gray-500 block mt-1">(${booking.participants} participants)</span>
                        </div>
                    </div>
                `;
                listContainer.appendChild(label);
            });
        }
        document.getElementById('cancel-confirmation-section').classList.add('hidden');
        document.getElementById('confirm-cancel-btn').disabled = true;
        cancelForm.reset();
        cancelModal.showModal();
    }

    function handleCancelSelectionChange(e) {
        if (e.target.name === 'booking-to-cancel') {
            document.getElementById('cancel-confirmation-section').classList.remove('hidden');
            document.getElementById('confirm-cancel-btn').disabled = false;
            document.querySelectorAll('#cancel-booking-list label').forEach(l => l.classList.remove('selected'));
            e.target.closest('label').classList.add('selected');
        }
    }

    function openMoveModalForSelectedSlot() {
        choiceModal.close();
        const { startTime } = state.selectedSlot;
        const slotEnd = startTime.plus({ minutes: APP_CONFIG.SLOT_DURATION_MINUTES });

        // Use the robust parser logic we discussed earlier
        const overlappingBookings = state.allBookings.filter(b => {
            if (b.room !== state.selectedRoom) return false;
            const bStart = parseDate(b.start_iso);
            const bEnd = parseDate(b.end_iso);
            if (!bStart.isValid || !bEnd.isValid) return false;
            return bStart < slotEnd && bEnd > startTime;
        });

        const listContainer = document.getElementById('move-booking-list');
        listContainer.innerHTML = '';

        // Populate Room Dropdown
        const roomSelect = document.getElementById('move-new-room');
        roomSelect.innerHTML = '';
        Object.keys(APP_CONFIG.ROOM_CONFIG).forEach(room => {
            const opt = document.createElement('option');
            opt.value = room;
            opt.textContent = room;
            if (room === state.selectedRoom) opt.selected = true;
            roomSelect.appendChild(opt);
        });

        if (overlappingBookings.length === 0) {
            listContainer.innerHTML = '<p class="text-slate-500 text-center py-4">No bookings found to move.</p>';
        } else {
            overlappingBookings.forEach(booking => {
                const label = document.createElement('label');
                label.className = "block p-3 border border-gray-200 rounded-md cursor-pointer hover:bg-gray-50 transition-colors";
                label.innerHTML = `
                    <div class="flex items-start gap-3">
                        <input type="radio" name="booking_to_move" value="${booking.id}" class="mt-1 text-ccf-blue focus:ring-ccf-blue">
                        <div class="text-sm">
                            <span class="font-bold text-gray-800">${booking.event}</span>
                            <span class="text-gray-600 block text-xs">By: ${booking.first_name} ${booking.last_name}</span>
                        </div>
                    </div>
                `;
                listContainer.appendChild(label);
            });
        }

        document.getElementById('move-details-section').classList.add('hidden');
        document.getElementById('confirm-move-btn').disabled = true;
        const moveModal = document.getElementById('move-modal');
        const moveForm = document.getElementById('move-form');
        moveForm.reset();
        moveModal.showModal();
    }

    function handleMoveSelectionChange(e) {
        if (e.target.name === 'booking_to_move') {
            const moveModal = document.getElementById('move-modal');
            const moveForm = document.getElementById('move-form');

            document.getElementById('move-details-section').classList.remove('hidden');
            document.getElementById('confirm-move-btn').disabled = false;

            // Optional: Pre-fill dates based on the selected booking (requires finding the booking obj)
            const bookingId = e.target.value;
            const booking = state.allBookings.find(b => b.id === bookingId);
            if (booking) {
                const bStart = parseDate(booking.start_iso);
                const bEnd = parseDate(booking.end_iso);

                const dateInput = moveForm.querySelector('[name="new_date"]');
                const startInput = moveForm.querySelector('[name="new_start_time"]');
                const endInput = moveForm.querySelector('[name="new_end_time"]');

                if (bStart.isValid) {
                    dateInput.value = bStart.toISODate();
                    startInput.value = bStart.toFormat('HH:mm');
                }
                if (bEnd.isValid) {
                    endInput.value = bEnd.toFormat('HH:mm');
                }
            }
        }
    }

    function handleMoveFormSubmit(e) {
        const moveModal = document.getElementById('move-modal');
        const moveForm = document.getElementById('move-form');
        e.preventDefault();

        const formData = new FormData(moveForm);
        // ... (keep variable extraction: bookingId, newDate, etc.) ...
        const bookingId = formData.get('booking_to_move');
        const newDate = formData.get('new_date');
        const newRoom = formData.get('new_room');
        const newStartTime = formData.get('new_start_time');
        const newEndTime = formData.get('new_end_time');
        const reason = formData.get('move_reason');
        const adminPin = formData.get('admin_pin');

        if (!bookingId || !newDate || !newStartTime || !newEndTime || !reason || !adminPin) {
            return showToast("All fields including Admin PIN are required.", "error");
        }

        const startIso = DateTime.fromISO(`${newDate}T${newStartTime}`, { zone: APP_CONFIG.TIMEZONE });
        const endIso = DateTime.fromISO(`${newDate}T${newEndTime}`, { zone: APP_CONFIG.TIMEZONE });

        if (endIso <= startIso) return showToast("End time must be after start time.", "error");

        // 1. Save Preliminary Data to State (So we can access it after the modal)
        state.pendingMoveData = {
            bookingId, adminPin, newRoom,
            start_iso: startIso.toISO(),
            end_iso: endIso.toISO(),
            reason,
            // Save display info for the summary modal
            eventName: document.querySelector('input[name="booking_to_move"]:checked')?.nextElementSibling.querySelector('span').textContent || 'Event',
            displayDate: startIso.toFormat('MMM d, yyyy (ccc)'),
            displayTime: `${startIso.toFormat('h:mm a')} - ${endIso.toFormat('h:mm a')}`
        };

        // 2. Conflict Check
        const conflicts = state.allBookings.filter(b => {
            if (b.id === bookingId) return false;
            if (b.room !== newRoom) return false;
            const bStart = parseDate(b.start_iso);
            const bEnd = parseDate(b.end_iso);
            if (!bStart.isValid || !bEnd.isValid) return false;
            return startIso < bEnd && endIso > bStart;
        });

        if (conflicts.length > 0) {
            // Populate Conflict Modal
            const listEl = document.getElementById('conflict-list');
            listEl.innerHTML = '';
            conflicts.forEach(c => {
                const item = document.createElement('div');
                item.className = "flex justify-between border-b border-amber-200 pb-1 last:border-0";
                item.innerHTML = `<span><strong>${c.event}</strong></span> <span>${parseDate(c.start_iso).toFormat('h:mm a')} - ${parseDate(c.end_iso).toFormat('h:mm a')}</span>`;
                listEl.appendChild(item);
            });

            // Show Custom Modal instead of confirm()
            document.getElementById('conflict-modal').showModal();
            return; // Stop here, wait for user input
        }

        // 3. If No Conflict, proceed directly
        openMoveSummaryModal();
    }

    function openMoveSummaryModal() {
        const data = state.pendingMoveData;
        if (!data) return;

        // Populate Summary Modal
        document.getElementById('move-sum-event').textContent = data.eventName;
        document.getElementById('move-sum-room').textContent = data.newRoom;
        document.getElementById('move-sum-date').textContent = data.displayDate;
        document.getElementById('move-sum-time').textContent = data.displayTime;
        document.getElementById('move-sum-reason').textContent = data.reason;

        document.getElementById('move-summary-modal').showModal();
    }

    // --- DUPLICATE BOOKING LOGIC ---

    function openDuplicateSelectionModalForSelectedSlot() {
        choiceModal.close();
        const { startTime } = state.selectedSlot;
        const slotEnd = startTime.plus({ minutes: APP_CONFIG.SLOT_DURATION_MINUTES });

        const overlappingBookings = state.allBookings.filter(b => {
            if (b.room !== state.selectedRoom) return false;
            const bStart = parseDate(b.start_iso);
            const bEnd = parseDate(b.end_iso);
            if (!bStart.isValid || !bEnd.isValid) return false;
            return bStart < slotEnd && bEnd > startTime;
        });

        // If only 1 booking, skip selection and go straight to duplicating
        if (overlappingBookings.length === 1) {
            openDuplicateBookingModal(overlappingBookings[0]);
            return;
        }

        // If multiple, show selection
        const listContainer = document.getElementById('duplicate-booking-list');
        listContainer.innerHTML = '';

        if (overlappingBookings.length === 0) {
            showToast("No bookings found to duplicate.", "error");
            return;
        }

        overlappingBookings.forEach(booking => {
            const label = document.createElement('label');
            label.className = "block p-3 border border-gray-200 rounded-md cursor-pointer hover:bg-gray-50 transition-colors";
            label.innerHTML = `
                 <div class="flex items-start gap-3">
                     <input type="radio" name="booking-to-duplicate" value="${booking.id}" class="mt-1 text-blue-600 focus:ring-blue-500">
                     <div class="text-sm">
                         <span class="font-bold text-gray-800">${booking.event}</span>
                         <span class="text-gray-600 block text-xs">By: ${booking.first_name} ${booking.last_name}</span>
                     </div>
                 </div>
             `;
            listContainer.appendChild(label);
        });

        const modal = document.getElementById('duplicate-selection-modal');
        document.getElementById('confirm-duplicate-selection-btn').disabled = true;
        modal.showModal();
    }

    function handleDuplicateSelectionChange(e) {
        if (e.target.name === 'booking-to-duplicate') {
            document.getElementById('confirm-duplicate-selection-btn').disabled = false;
        }
    }

    function handleDuplicateConfirmation(e) {
        e.preventDefault();
        const selectedId = document.querySelector('input[name="booking-to-duplicate"]:checked')?.value;
        if (selectedId) {
            const booking = state.allBookings.find(b => b.id === selectedId);
            if (booking) {
                document.getElementById('duplicate-selection-modal').close();
                openDuplicateBookingModal(booking);
            }
        }
    }

    function openDuplicateBookingModal(sourceBooking) {
        // Save source for logic
        state.duplicationSource = sourceBooking;

        // Reset Form
        bookingForm.reset();

        // 1. Pre-fill Fields
        document.getElementById('first_name').value = sourceBooking.first_name;
        document.getElementById('last_name').value = sourceBooking.last_name;
        document.getElementById('email').value = sourceBooking.email;
        document.getElementById('event').value = sourceBooking.event;
        document.getElementById('participants').value = sourceBooking.participants;
        document.getElementById('notes').value = sourceBooking.notes || '';

        // Handle Leader fields if present (though usually hidden for Admins, we copy anyway)
        document.getElementById('leader_first_name').value = sourceBooking.leader_first_name || ''; // Assuming property exists or empty
        document.getElementById('leader_last_name').value = sourceBooking.leader_last_name || '';

        // 2. Set Admin Mode
        const adminToggle = document.getElementById('admin-toggle');
        adminToggle.checked = true; // Auto-check "I am Admin"
        adminToggle.disabled = true; // Force Admin Mode (Cannot uncheck)
        document.getElementById('user-fields').classList.add('hidden');
        document.getElementById('admin-fields').classList.remove('hidden');

        // 3. Show Date Picker for Duplication
        const dateWrapper = document.getElementById('duplicate-date-wrapper');
        const dateInput = document.getElementById('duplicate-date');

        dateWrapper.classList.remove('hidden');
        dateInput.value = ''; // Expect user to pick

        // 4. Update Modal Title
        document.getElementById('modal-title').textContent = `Duplicate: ${sourceBooking.event}`;
        document.getElementById('modal-date-info').textContent = "Please select a new date below";
        document.getElementById('modal-room-title').textContent = `Book ${state.selectedRoom}`;

        // 5. Update Rules (Assuming same room)
        const roomRules = APP_CONFIG.ROOM_CONFIG[state.selectedRoom];
        // We need a dummy 'rules' object if state.selectedSlot isn't set perfectly, 
        // but typically selectedSlot is still set from the click that started this flow.
        // However, we want to ensure we don't rely on selectedSlot.totalParticipants for the *new* date.
        // We'll use the generic room rules.

        const participantsInput = bookingForm.querySelector('#participants');
        participantsInput.max = roomRules.MAX_TOTAL_PARTICIPANTS;
        participantsInput.min = roomRules.MIN_BOOKING_SIZE;

        // Mock helper text
        document.getElementById('participants-helper-text').textContent = "Admin Override Enabled.";

        // 6. Set Time Input (End Time duration)
        // We calculate duration from source
        const sStart = parseDate(sourceBooking.start_iso);
        const sEnd = parseDate(sourceBooking.end_iso);
        const durationMin = sEnd.diff(sStart, 'minutes').minutes;

        // We can't set #end-time correctly until we have a start time.
        // But we can store the duration to apply later.
        state.duplicationDuration = durationMin;

        // Clear hidden start-iso to prevent premature submission
        bookingForm.querySelector('#start-iso').value = "";

        bookingModal.showModal();
        dateInput.focus();
    }

    function handleDuplicateDateChange(e) {
        if (!state.duplicationSource) return;
        const newDateStr = e.target.value; // YYYY-MM-DD
        if (!newDateStr) return;

        // 1. Get original time of day
        const sStart = parseDate(state.duplicationSource.start_iso);
        const sEnd = parseDate(state.duplicationSource.end_iso);

        // 2. Combine new date with old time
        // Note: newDateStr is YYYY-MM-DD. We assume local time.
        const [year, month, day] = newDateStr.split('-').map(Number);

        const newStart = DateTime.local(year, month, day, sStart.hour, sStart.minute, sStart.second, { zone: APP_CONFIG.TIMEZONE });
        const newEnd = DateTime.local(year, month, day, sEnd.hour, sEnd.minute, sEnd.second, { zone: APP_CONFIG.TIMEZONE });

        // 3. Update Hidden Field
        bookingForm.querySelector('#start-iso').value = newStart.toISO();

        // 4. Update End Time Input (Visual)
        bookingForm.querySelector('#end-time').value = newEnd.toFormat('HH:mm');

        // 5. Update Header Text
        const formattedDate = newStart.toFormat('ccc, MMM d, h:mm a');
        document.getElementById('modal-date-info').textContent = formattedDate;

        // 6. Mock state.selectedSlot to pass validation in handleBookingFormSubmit
        // logic there checks `state.selectedSlot.rules`.
        // We reuse the existing selectedSlot (which has the room rules), 
        // OR we ensure we don't crash.
        // selectedSlot is likely still set from the click.
    }
    function handleBookingFormSubmit(e) {
        e.preventDefault();
        const isAdmin = document.getElementById('admin-toggle').checked;

        // --- START STEP 3: SUBMISSION VALIDATION (Fail Fast) ---
        // We grab the value directly here to validate before processing the rest of the form
        const startIsoInput = document.getElementById('start-iso').value;
        const startDate = DateTime.fromISO(startIsoInput).setZone(APP_CONFIG.TIMEZONE).startOf('day');
        const now = DateTime.now().setZone(APP_CONFIG.TIMEZONE).startOf('day');
        const diffInDays = startDate.diff(now, 'days').days;
        const MAX_ADVANCE_DAYS = 7;

        if (!isAdmin && diffInDays > MAX_ADVANCE_DAYS) {
            return showToast(`Regular bookings cannot be made more than ${MAX_ADVANCE_DAYS} days in advance. Please login as Admin.`, "error");
        }
        // --- END STEP 3 ---

        // 2. NEW: Min Notice Check (24 Hours)
        const startDateExact = DateTime.fromISO(startIsoInput).setZone(APP_CONFIG.TIMEZONE);
        const nowExact = DateTime.now().setZone(APP_CONFIG.TIMEZONE);
        const diffInHours = startDateExact.diff(nowExact, 'hours').hours;
        const MIN_NOTICE_HOURS = 24;

        // Only block if it is in the future (diff > 0) but less than 24 hours away
        if (!isAdmin && diffInHours > 0 && diffInHours < MIN_NOTICE_HOURS) {
            return showToast(`Regular bookings require at least ${MIN_NOTICE_HOURS} hours notice. Please login as Admin.`, "error");
        }
        // --- END SUBMISSION VALIDATION ---

        const roomRules = state.selectedSlot.rules;
        const formData = new FormData(bookingForm);

        // SECURITY: Sanitize all text inputs to prevent XSS
        const sanitize = (str) => str ? str.trim().replace(/<[^>]*>/g, '') : '';

        const firstName = sanitize(formData.get('first_name'));
        const lastName = sanitize(formData.get('last_name'));
        const email = sanitize(formData.get('email'));
        const leaderFirstName = sanitize(formData.get('leader_first_name'));
        const leaderLastName = sanitize(formData.get('leader_last_name'));
        const event = sanitize(formData.get('event'));
        const participants = parseInt(formData.get('participants'), 10);
        const endTimeStr = formData.get('end-time');
        const notes = sanitize(formData.get('notes'));
        const adminPin = formData.get('admin-pin').trim();
        const recurrence = formData.get('recurrence');

        // --- ENFORCE DUPLICATE RESTRICTION ---
        if (state.duplicationSource && !adminPin) {
            return showToast("Admin PIN is required for Duplicate Booking.", "error");
        }
        // -------------------------------------

        let requiredFields = ['first_name', 'last_name', 'email', 'event'];
        if (isAdmin) {
            if (!adminPin) return showToast("Admin PIN is required.", "error");
        } else {
            if (!leaderFirstName || !leaderLastName) {
                return showToast("Please fill in all required fields (including Dgroup Leader).", "error");
            }
            requiredFields.push('leader_first_name', 'leader_last_name');
        }
        if (!firstName || !lastName || !email || !event) {
            return showToast("Please fill in all required fields.", "error");
        }
        if (!/^\S+@\S+\.\S+$/.test(email)) return showToast("Please enter a valid email address.", "error");
        // if (!participants || participants < roomRules.MIN_BOOKING_SIZE || participants > roomRules.MAX_BOOKING_SIZE) {
        //     return showToast(`Invalid participant number. Must be between ${roomRules.MIN_BOOKING_SIZE} and ${roomRules.MAX_BOOKING_SIZE}.`, "error");
        // }
        // --- CRITICAL FIX: Admin Bypass for Participant Max Size ---

        // 1. Check Minimum size (Applies to everyone)
        if (participants < roomRules.MIN_PARTICIPANTS) {
            return showToast(`Invalid participant number. Must be at least ${roomRules.MIN_PARTICIPANTS}.`, "error");
        }

        // 2. Check Maximum size (Applies ONLY to regular users)
        if (!isAdmin && participants > roomRules.MAX_BOOKING_SIZE) {
            return showToast(`Invalid participant number. Must be between ${roomRules.MIN_PARTICIPANTS} and ${roomRules.MAX_BOOKING_SIZE}.`, "error");
        }

        // 3. For Admins, we must ensure they don't exceed the overall room capacity (55 for Main Hall)
        // We can use the overall MAX_TOTAL_PARTICIPANTS here for a strict client-side check.
        // We need ROOM_CAPACITIES available in script.js for this.
        const maxRoomCapacity = ROOM_CAPACITIES[state.selectedRoom] || roomRules.MAX_TOTAL_PARTICIPANTS;

        if (participants > maxRoomCapacity) {
            return showToast(`Invalid participant number. Admin booking cannot exceed room's total capacity (${maxRoomCapacity}).`, "error");
        }

        // --- END CRITICAL FIX ---

        const maxAllowed = parseInt(bookingForm.querySelector('#participants').max, 10);
        if (participants > maxAllowed) {
            return showToast(`This slot only has ${maxAllowed} spots left.`, "error");
        }
        const startTime = DateTime.fromISO(bookingForm.querySelector('#start-iso').value);
        const [endHour, endMinute] = endTimeStr.split(':').map(Number);
        const endTime = startTime.set({ hour: endHour, minute: endMinute });
        if (endTime <= startTime) return showToast("End time must be after the start time.", "error");

        // --- START OF REQUIRED CHANGE ---

        // Calculate Duration
        const durationMinutes = endTime.diff(startTime, 'minutes').minutes;
        const durationHours = durationMinutes / 60;

        let durationText = '';
        if (durationMinutes >= 60) {
            // Display as X hours
            durationText = `${durationHours} hour${durationHours !== 1 ? 's' : ''}`;
        } else {
            // Display as X minutes
            durationText = `${durationMinutes} minute${durationMinutes !== 1 ? 's' : ''}`;
        }


        // Validate Past Bookings
        if (startTime < DateTime.local()) {
            return showToast("Cannot create a booking in the past.", "error");
        }

        // Validate Admin 6-Month Limit 
        // (7-day User limit is already handled by Step 3 at the top)
        if (isAdmin) {
            const maxAdminDate = DateTime.local().plus({ months: 6 });
            if (startTime > maxAdminDate) {
                return showToast("Admins can only book up to 6 months in advance.", "error");
            }
        }



        state.pendingBookingData = {
            room: state.selectedRoom,
            first_name: firstName,
            last_name: lastName,
            email: email,
            leader_first_name: isAdmin ? '' : leaderFirstName,
            leader_last_name: isAdmin ? '' : leaderLastName,
            event: event,
            participants: participants,
            notes: notes,
            start_iso: startTime.toISO(),
            end_iso: endTime.toISO(),
            adminPin: adminPin,
            recurrence: isAdmin ? recurrence : 'none',
            terms_accepted: true,
            privacy_accepted: true,
            consent_timestamp: DateTime.local().setZone(APP_CONFIG.TIMEZONE).toISO() // GDPR: log when consent was given
        };

        document.getElementById('summary-room').textContent = state.selectedRoom;
        document.getElementById('summary-name').textContent = `${firstName} ${lastName}`;
        document.getElementById('summary-event').textContent = event;
        document.getElementById('summary-leader').textContent = isAdmin ? 'N/A (Admin)' : `${leaderFirstName} ${leaderLastName}`;
        document.getElementById('summary-date').textContent = startTime.toFormat('DDD');


        document.getElementById('summary-time').textContent = `${startTime.toFormat('h:mm a')} - ${endTime.toFormat('h:mm a')} (${durationText})`;
        document.getElementById('summary-participants').textContent = `${participants} participants`;
        document.getElementById('summary-email').textContent = email;
        confirmSummaryModal.showModal();
    }

    function proceedWithBooking() {
        confirmSummaryModal.close();
        loadingModal.showModal();
        if (state.pendingBookingData) {
            submitRequest('create', state.pendingBookingData);
            state.pendingBookingData = null;
        }
    }

    function proceedWithMove() {
        document.getElementById('move-summary-modal').close();
        document.getElementById('move-modal').close(); // Also close the input form
        loadingModal.showModal();

        if (state.pendingMoveData) {
            submitRequest('move', state.pendingMoveData);
            state.pendingMoveData = null; // Clear state
        }
    }

    /**
     * UPDATED: Relaxes email validation if admin pin is present.
     */
    function handleCancelFormSubmit(e) {
        e.preventDefault();
        const selectedRadio = document.querySelector('input[name="booking-to-cancel"]:checked');
        if (!selectedRadio) { return showToast("Please select a booking to cancel.", "error"); }

        const bookingId = selectedRadio.value;
        const bookingCode = document.getElementById('cancel-booking-code').value.trim();
        const adminPin = document.getElementById('admin-pin').value.trim();

        // If no admin pin is provided, booking code is strictly required.
        if (!adminPin && !bookingCode) {
            return showToast("Please enter the Booking Code to confirm.", "error");
        }

        loadingModal.showModal();
        submitRequest('cancel', { bookingId, bookingCode, adminPin });
    }

    function submitRequest(action, payload) {
        const callbackName = `jsonp_callback_${Date.now()}`;
        const script = document.createElement('script');
        let timeoutId = null;
        const cleanup = () => {
            clearTimeout(timeoutId);
            if (script.parentNode) document.body.removeChild(script);
            delete window[callbackName];
            loadingModal.close();
        };
        timeoutId = setTimeout(() => {
            cleanup();
            showToast("Request timed out.", "error");
        }, 30000);

        window[callbackName] = (data) => {
            cleanup();
            if (data.success) {
                if (action === 'create') {
                    const bookingCode = data.id.substring(0, 12).toUpperCase();
                    const bookedRoom = data.bookedRoom;
                    const requestedRoom = data.requestedRoom;
                    document.getElementById('success-booking-code').textContent = bookingCode;
                    document.getElementById('success-room-name').textContent = bookedRoom;
                    const redirectMsgEl = document.getElementById('success-redirect-message');
                    if (data.message.includes('Recurrent')) {
                        redirectMsgEl.textContent = data.message;
                    } else if (bookedRoom !== requestedRoom) {
                        redirectMsgEl.innerHTML = `To optimize room usage, your booking for <strong>${requestedRoom}</strong> has been moved to the <strong>${bookedRoom}</strong>.`;
                    } else {
                        redirectMsgEl.textContent = `Your booking for ${bookedRoom} is confirmed. Please save this code for your records.`;
                    }

                    renderCalendarButtons({
                        id: data.id,
                        event: data.event || document.getElementById('event').value,
                        room: data.room,
                        start_iso: data.start_iso,
                        end_iso: data.end_iso,
                        notes: document.getElementById('notes')?.value || ''
                    });

                    successModal.showModal();
                } else {
                    showToast(data.message, "success");
                }
                bookingModal.close();
                cancelModal.close();
                render();
            } else {
                showToast((data.message || "An unknown error occurred.").replace(/^Error: /i, ''), "error");
            }
        };

        script.onerror = () => {
            cleanup();
            showToast("Failed to send request.", "error");
        };

        const encodedPayload = encodeURIComponent(JSON.stringify(payload));
        script.src = `${APP_CONFIG.APPS_SCRIPT_URL}?action=${action}&callback=${callbackName}&payload=${encodedPayload}`;
        document.body.appendChild(script);
    }

    // --- DATA & UTILITIES ---
    // NOTE: Legacy direct Google Sheets API access removed for security.
    // All data access now routes exclusively through Apps Script (APPS_SCRIPT_URL).

    function changeWeek(direction) {
        state.currentDate = state.currentDate.plus({ weeks: direction });
        setLoading(true, 'page');
        renderCalendarShell();
        renderBookingsForSelectedRoom();
        setLoading(false, 'page');
    }

    function setLoading(isLoading, scope = 'page') {
        if (scope === 'page') {
            loader.classList.toggle('hidden', !isLoading);
        }
    }

    function showToast_OLD(message, type = "success") {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icon = type === 'success' ? '✔' : (type === 'error' ? '✖' : 'ℹ');
        toast.innerHTML = `<span>${icon}</span><p>${message}</p>`;

        // STRATEGY: Popover API (Best) -> Embedded Banner (Fallback) -> Body (Default)
        const openDialog = document.querySelector('dialog[open]');

        // Feature detection for Popover
        let usedPopover = false;
        if ('showPopover' in toast) {
            try {
                // 1. Modern Approach: Popover API (Top Layer)
                toast.setAttribute('popover', 'manual');
                document.body.appendChild(toast);
                toast.showPopover();
                usedPopover = true;
            } catch (e) {
                console.warn('Popover API failed, using fallback');
                // Cleanup if partially applied
                if (toast.isConnected) toast.remove();
            }
        }

        if (!usedPopover) {
            // 2. Robust Fallback: Inject as a static banner INSIDE the modal
            // This prevents z-index/clipping issues by making it part of the layout
            toast.classList.add('toast-embedded');
            const contentContainer = openDialog ? openDialog.querySelector('div') : null; // Usually the first div is the padding container

            if (openDialog && contentContainer) {
                contentContainer.prepend(toast);
            } else {
                // Last resort: Body append (only if no dialog to attach to)
                document.body.appendChild(toast);
            }
        }

        // Trigger entrance animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Auto-dismiss after 6 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                try { if (toast.matches(':popover-open')) toast.hidePopover(); } catch (e) { }
                toast.remove();
            }, 300);
        }, 6000);
    }
    function showToast(message, type = "success") {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        // Icon based on type
        const icon = type === 'success' ? '✔' : (type === 'error' ? '✖' : 'ℹ');
        toast.innerHTML = `<span>${icon}</span><p>${message}</p>`;

        // PHYSICAL APPEND STRATEGY
        // Attach directly to the active dialog if one exists.
        // This leverages the browser's own stacking for that dialog.
        const openDialog = document.querySelector('dialog[open]');

        if (openDialog) {
            toast.classList.add('toast-in-dialog');
            openDialog.appendChild(toast);
        } else {
            document.body.appendChild(toast);
        }

        // Trigger entrance animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Auto-dismiss after 6 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 6000);
    }

    /**
     * Generates Google Calendar Link and ICS Download Button
     * and renders them into the DOM container.
     * * Paste this at the bottom of script.js
     */
    function renderCalendarButtons(booking) {
        const container = document.getElementById('calendar-links-container');
        if (!container) return;

        // 1. Format Dates for Calendar Clients (YYYYMMDDTHHmmSS)
        // We use Luxon to strictly enforce Asia/Manila timezone
        const fmt = "yyyyMMdd'T'HHmmss";
        const startObj = DateTime.fromISO(booking.start_iso).setZone('Asia/Manila');
        const endObj = DateTime.fromISO(booking.end_iso).setZone('Asia/Manila');

        const startStr = startObj.toFormat(fmt);
        const endStr = endObj.toFormat(fmt);

        // 2. Prepare Data for URL
        const title = encodeURIComponent(`CCF Booking: ${booking.event}`);
        const location = encodeURIComponent(`CCF Manila - ${booking.room}`);
        const details = encodeURIComponent(`Booking Ref: ${booking.id}\nNote: ${booking.notes || ''}`);

        // 3. Generate Google Calendar URL
        // ctz=Asia/Manila ensures the calendar opens in the correct timezone
        const gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}&location=${location}&ctz=Asia/Manila`;

        // 4. Generate ICS File Content
        const icsData = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//CCF Manila//Booking System//EN',
            'BEGIN:VEVENT',
            `UID:${booking.id}@ccfmanila.org`,
            `DTSTAMP:${DateTime.now().setZone('Asia/Manila').toFormat(fmt)}Z`,
            `DTSTART;TZID=Asia/Manila:${startStr}`,
            `DTEND;TZID=Asia/Manila:${endStr}`,
            `SUMMARY:CCF Booking: ${booking.event}`,
            `DESCRIPTION:${booking.notes || ''}`,
            `LOCATION:CCF Manila - ${booking.room}`,
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');

        // Create a downloadable file blob
        const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
        const icsUrl = URL.createObjectURL(blob);

        // 5. Inject HTML
        container.innerHTML = `
            <a href="${gCalUrl}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 text-sm font-medium transition-colors">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5v-5z"/></svg>
                Add to Google
            </a>
            <a href="${icsUrl}" download="ccf-booking-${booking.id}.ics" class="flex items-center justify-center gap-2 px-3 py-2 bg-gray-50 text-gray-700 border border-gray-200 rounded hover:bg-gray-100 text-sm font-medium transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Download .ics
            </a>
        `;
    }


    /**
     * Toast Notification Helper
     * Creates and manages the floating alert messages.
     * Place this at the bottom of script.js
     */
    // --- ADMIN LOGIN MODAL LOGIC ---
    function openAdminLoginModal() {
        const modal = document.getElementById('admin-login-modal');
        const form = document.getElementById('admin-login-form');
        const pinInput = document.getElementById('admin-login-pin');

        if (modal && form) {
            form.reset();
            modal.showModal();
            if (pinInput) pinInput.focus();
        }
    }

    function handleAdminLoginSubmit(e) {
        e.preventDefault(); // Prevent default dialog submission
        const pinInput = document.getElementById('admin-login-pin');
        const input = pinInput.value;
        const ADMIN_PIN = "CCFManila@2025";

        if (input === ADMIN_PIN) {
            // Save Session Token
            sessionStorage.setItem('ccf_admin_logged_in', 'true');
            // Redirect
            window.location.href = 'dashboard.html';
        } else {
            showToast("Incorrect PIN. Access Denied.", "error");
            pinInput.value = '';
            pinInput.focus();
        }
    }

    // --- TOAST NOTIFICATION ---
    function showToast(message, type = 'info') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        let iconSvg = '';
        if (type === 'success') {
            iconSvg = '<svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
        } else if (type === 'error') {
            iconSvg = '<svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
        } else {
            iconSvg = '<svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
        }

        toast.innerHTML = `${iconSvg}<span>${message}</span>`;
        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (container.contains(toast)) container.removeChild(toast);
            }, 300);
        }, 4000);
    }

    // --- MY BOOKINGS LOGIC ---
    function handleMyBookingsSubmit(e) {
        e.preventDefault();
        const email = new FormData(e.target).get('lookup_email');
        if (!email) return;

        // Store email for GDPR data rights requests
        gdprLookupEmail = email.trim();

        myBookingsResults.querySelectorAll('.booking-item').forEach(e => e.remove());
        myBookingsEmpty.classList.add('hidden');
        myBookingsLoading.classList.remove('hidden');
        if (gdprRightsSection) gdprRightsSection.classList.add('hidden');

        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Searching...';

        fetchUserBookings(email)
            .then(bookings => {
                myBookingsLoading.classList.add('hidden');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Find';

                if (!bookings || bookings.length === 0) {
                    myBookingsEmpty.classList.remove('hidden');
                } else {
                    bookings.forEach(booking => {
                        const item = document.createElement('div');
                        item.className = 'booking-item bg-gray-50 border border-gray-200 rounded p-3 flex justify-between items-center';
                        item.innerHTML = `
                            <div>
                                <div class="font-bold text-ccf-blue text-sm">${booking.event}</div>
                                <div class="text-xs text-gray-600 mt-1">
                                    <span class="font-semibold">${booking.date}</span> at ${booking.start_time} - ${booking.end_time}
                                </div>
                                <div class="text-xs text-gray-500">${booking.room}</div>
                            </div>
                            <div class="text-right">
                                <span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-medium">Confirmed</span>
                            </div>
                        `;
                        myBookingsResults.appendChild(item);
                    });
                }

                // Show GDPR rights section after any lookup (whether bookings found or not)
                if (gdprRightsSection) gdprRightsSection.classList.remove('hidden');
            })
            .catch(err => {
                myBookingsLoading.classList.add('hidden');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Find';
                alert(err.message);
            });
    }

    // --- GDPR: Download My Data ---
    function handleDownloadMyData() {
        if (!gdprLookupEmail) return showToast('Please look up your email first.', 'error');

        const btn = document.getElementById('download-my-data-btn');
        btn.disabled = true;
        btn.textContent = 'Preparing...';

        const url = `${APP_CONFIG.APPS_SCRIPT_URL}?action=export_user_data&payload=${encodeURIComponent(JSON.stringify({ email: gdprLookupEmail }))}`;

        const callbackName = `export_data_cb_${Date.now()}`;
        const script = document.createElement('script');

        window[callbackName] = (response) => {
            delete window[callbackName];
            if (script.parentNode) document.body.removeChild(script);
            btn.disabled = false;
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> Download My Data`;

            if (response.success && response.data) {
                // Create downloadable JSON file
                const exportData = {
                    exported_at: new Date().toISOString(),
                    email: gdprLookupEmail,
                    bookings: response.data
                };
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const downloadUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = `my-booking-data-${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(downloadUrl);
                showToast('Your data has been downloaded.', 'success');
            } else {
                showToast(response.message || 'No data found for this email.', 'error');
            }
        };

        script.src = `${url}&callback=${callbackName}`;
        script.onerror = () => {
            btn.disabled = false;
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> Download My Data`;
            showToast('Connection failed. Please try again.', 'error');
        };
        document.body.appendChild(script);
    }

    // --- GDPR: Delete My Data ---
    function handleDeleteMyData() {
        if (!gdprLookupEmail) return showToast('Please look up your email first.', 'error');

        const confirmed = confirm(
            `⚠️ Are you sure you want to delete all your personal data?\n\n` +
            `This will anonymize ALL bookings associated with:\n${gdprLookupEmail}\n\n` +
            `• Your name, email, and leader details will be permanently removed.\n` +
            `• Active future bookings will be cancelled.\n` +
            `• This action cannot be undone.\n\n` +
            `Click OK to proceed.`
        );

        if (!confirmed) return;

        const btn = document.getElementById('delete-my-data-btn');
        btn.disabled = true;
        btn.textContent = 'Processing...';

        const url = `${APP_CONFIG.APPS_SCRIPT_URL}?action=delete_user_data&payload=${encodeURIComponent(JSON.stringify({ email: gdprLookupEmail }))}`;

        const callbackName = `delete_data_cb_${Date.now()}`;
        const script = document.createElement('script');

        window[callbackName] = (response) => {
            delete window[callbackName];
            if (script.parentNode) document.body.removeChild(script);
            btn.disabled = false;
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> Delete My Data`;

            if (response.success) {
                showToast(`Your personal data has been anonymized. ${response.count || 0} booking(s) processed.`, 'success');
                // Reset the modal
                myBookingsResults.querySelectorAll('.booking-item').forEach(e => e.remove());
                myBookingsEmpty.classList.add('hidden');
                gdprRightsSection.classList.add('hidden');
                gdprLookupEmail = null;
                myBookingsForm.reset();
                // Refresh calendar data
                fetchAllBookings().then(renderBookingsForSelectedRoom);
            } else {
                showToast(response.message || 'Failed to process deletion request.', 'error');
            }
        };

        script.src = `${url}&callback=${callbackName}`;
        script.onerror = () => {
            btn.disabled = false;
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> Delete My Data`;
            showToast('Connection failed. Please try again.', 'error');
        };
        document.body.appendChild(script);
    }

    async function fetchUserBookings(email) {
        const url = `${APP_CONFIG.APPS_SCRIPT_URL}?action=fetch_user_bookings&payload=${encodeURIComponent(JSON.stringify({ email: email }))}`;

        return new Promise((resolve, reject) => {
            const callbackName = `my_bookings_callback_${Date.now()}`;
            const script = document.createElement('script');

            window[callbackName] = (response) => {
                delete window[callbackName];
                document.body.removeChild(script);
                if (response.success) {
                    resolve(response.bookings);
                } else {
                    reject(new Error(response.message || "Failed to fetch bookings"));
                }
            };

            script.src = `${url}&callback=${callbackName}`;
            script.onerror = () => {
                reject(new Error("Network connection failed"));
            };
            document.body.appendChild(script);
        });
    }



    // --- 4. FETCH BOOKINGS (Updated to use Apps Script for Blocked Dates support) ---
    async function fetchAllBookings() {
        const url = `${APP_CONFIG.APPS_SCRIPT_URL}?action=fetch_all`;

        return new Promise((resolve, reject) => {
            const callbackName = `fetch_all_callback_${Date.now()}`;
            const script = document.createElement('script');
            let timeoutId = null;

            const cleanup = () => {
                clearTimeout(timeoutId);
                if (script.parentNode) document.body.removeChild(script);
                delete window[callbackName];
            };

            // Timeout Handling
            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error("Request timed out. Please check your internet connection or the configuration."));
            }, 30000); // 30 seconds

            window[callbackName] = (response) => {
                cleanup(); // clear timeout and remove script
                if (response.success) {
                    // 1. Process Bookings
                    state.allBookings = (response.data || []).map(b => ({
                        ...b,
                        // Robust mapping for backend changes
                        participants: (b.participants !== undefined) ? b.participants : b.pax,
                        first_name: b.first_name || (b.name ? b.name.split(' ')[0] : 'Unknown'),
                        last_name: b.last_name || (b.name ? b.name.split(' ').slice(1).join(' ') : ''),
                        start_iso: b.start_iso,
                        end_iso: b.end_iso
                    }));

                    // 2. Process Blocked Dates
                    state.blockedDates = (response.blocked_dates || []).map(d => ({
                        date: d.date,
                        room: d.room,
                        reason: d.reason
                    }));

                    // 3. Process Global Announcement (NEW)
                    console.log("Full Response:", response);
                    console.log("Announcement Data:", (response.announcement ? response.announcement : "None"));

                    if (response.announcement && response.announcement.isActive) {
                        console.log("Banner should be active");
                        const banner = document.getElementById('announcement-banner');
                        const text = document.getElementById('announcement-text');
                        if (banner && text) {
                            text.textContent = response.announcement.message;
                            banner.classList.remove('hidden');

                            // Setup dismiss handler
                            const closeBtn = document.getElementById('announcement-close');
                            if (closeBtn) {
                                closeBtn.onclick = () => {
                                    banner.classList.add('hidden');
                                };
                            }
                        }
                    } else {
                        // Ensure it's hidden if not active
                        const banner = document.getElementById('announcement-banner');
                        if (banner) banner.classList.add('hidden');
                    }

                    resolve();
                } else {
                    console.error("Fetch failed:", response.message);
                    reject(new Error(response.message || "Failed to fetch bookings"));
                }
            };

            script.src = `${url}&callback=${callbackName}`;
            script.onerror = () => {
                cleanup();
                console.error("Script injection failed.");
                reject(new Error("Network connection failed."));
            };
            document.body.appendChild(script);
        });
    }

    // --- START THE APP ---
    init();
});