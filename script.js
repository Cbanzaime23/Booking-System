document.addEventListener('DOMContentLoaded', () => {
    const DateTime = luxon.DateTime;
    const MAX_TOTAL_PARTICIPANTS = 30;
    const MAX_CONCURRENT_GROUPS = 5;
    const MAX_PARTICIPANTS_PER_BOOKING = 25;

    // --- STATE & MODAL REFERENCES ---
    const state = {
        currentDate: DateTime.local().setZone(APP_CONFIG.TIMEZONE),
        bookings: [],
        isLoading: false,
        selectedSlot: null,
        pendingBookingData: null,
    };

    const calendarView = document.querySelector('#calendar-view .grid');
    const loader = document.getElementById('loader');
    
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

    // --- CORE APP FUNCTIONS ---

    function init() {
        setupEventListeners();
        render();
    }

    function setupEventListeners() {
        calendarControls.prevWeekBtn.addEventListener('click', () => changeWeek(-1));
        calendarControls.nextWeekBtn.addEventListener('click', () => changeWeek(1));
        calendarView.addEventListener('click', handleSlotClick);
        
        // Modal Listeners
        document.getElementById('choice-book-btn').addEventListener('click', openBookingModalForSelectedSlot);
        document.getElementById('choice-cancel-btn').addEventListener('click', openCancelModalForSelectedSlot);
        bookingForm.addEventListener('submit', handleBookingFormSubmit);
        cancelForm.addEventListener('submit', handleCancelFormSubmit);
        document.getElementById('cancel-booking-list').addEventListener('change', handleCancelSelectionChange);
        document.getElementById('summary-yes-btn').addEventListener('click', proceedWithBooking);
        document.getElementById('summary-no-btn').addEventListener('click', () => confirmSummaryModal.close());
        document.getElementById('success-done-btn').addEventListener('click', () => successModal.close());

        // Generic close buttons
        document.querySelectorAll('.cancel-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                bookingModal.close();
                cancelModal.close();
            });
        });
    }

    async function render() {
        setLoading(true, 'page');
        renderCalendarShell();
        try {
            await fetchBookings();
            renderBookingsWithCapacity();
        } catch (error) {
            console.error("Failed to render:", error);
            showToast("Error: Could not load bookings.", "error");
        } finally {
            setLoading(false, 'page');
        }
    }

    // --- CALENDAR RENDERING ---

    function renderCalendarShell() {
        calendarView.innerHTML = '';
        const startOfWeek = state.currentDate.startOf('week');
        const endOfWeek = state.currentDate.endOf('week');
        calendarControls.currentWeekTitle.textContent = `${startOfWeek.toFormat('LLL d')} - ${endOfWeek.toFormat('LLL d, yyyy')}`;
        for (let i = 0; i < 7; i++) {
            const day = startOfWeek.plus({ days: i });
            const dayColumn = document.createElement('div');
            dayColumn.className = 'border-r border-b border-slate-200';
            const dayHeader = document.createElement('div');
            dayHeader.className = 'text-center p-2 border-b border-slate-200 sticky top-0 bg-white z-10';
            dayHeader.innerHTML = `<span class="font-semibold">${day.toFormat('ccc')}</span><br><span class="text-sm text-slate-500">${day.toFormat('d')}</span>`;
            dayColumn.appendChild(dayHeader);
            const hours = APP_CONFIG.BUSINESS_HOURS[day.weekday % 7];
            if (hours && hours.start) {
                const dayStart = day.set({ hour: parseInt(hours.start.split(':')[0]), minute: parseInt(hours.start.split(':')[1]) });
                const dayEnd = day.set({ hour: parseInt(hours.end.split(':')[0]), minute: parseInt(hours.end.split(':')[1]) });
                for (let currentTime = dayStart; currentTime < dayEnd; currentTime = currentTime.plus({ minutes: APP_CONFIG.SLOT_DURATION_MINUTES })) {
                    dayColumn.appendChild(createTimeSlot(currentTime));
                }
            } else {
                const closedDiv = document.createElement('div');
                closedDiv.className = 'p-4 text-center text-slate-400';
                closedDiv.textContent = 'Closed';
                dayColumn.appendChild(closedDiv);
            }
            calendarView.appendChild(dayColumn);
        }
    }

    function createTimeSlot(time) {
        const slot = document.createElement('div');
        const isPast = time < DateTime.local().setZone(APP_CONFIG.TIMEZONE);
        slot.className = 'time-slot p-2 text-center text-sm border-t border-slate-100 h-14 flex items-center justify-center';
        slot.dataset.startIso = time.toISO();
        if (isPast) {
            slot.classList.add('past', 'bg-slate-100', 'text-slate-400', 'cursor-not-allowed');
            slot.innerHTML = `<div class="time-label">${time.toFormat('h:mm a')}</div>`;
        }
        return slot;
    }

    function renderBookingsWithCapacity() {
        document.querySelectorAll('.time-slot').forEach(slotEl => {
            if (slotEl.classList.contains('past')) return;
            const slotStart = DateTime.fromISO(slotEl.dataset.startIso);
            const slotEnd = slotStart.plus({ minutes: APP_CONFIG.SLOT_DURATION_MINUTES });
            let totalParticipants = 0, totalGroups = 0;
            const overlappingBookings = state.bookings.filter(b => {
                const bStart = DateTime.fromISO(b.start_iso);
                const bEnd = DateTime.fromISO(b.end_iso);
                return bStart < slotEnd && bEnd > slotStart;
            });
            overlappingBookings.forEach(b => {
                totalParticipants += parseInt(b.participants, 10);
                totalGroups++;
            });
            slotEl.dataset.totalParticipants = totalParticipants;
            slotEl.dataset.totalGroups = totalGroups;
            
            // UPDATED: Use first_name and last_name
            const primaryBooking = overlappingBookings.find(b => DateTime.fromISO(b.start_iso).equals(slotStart));
            if (primaryBooking) {
                slotEl.dataset.bookingId = primaryBooking.id;
                slotEl.dataset.bookingName = `${primaryBooking.first_name} ${primaryBooking.last_name}`;
            } else {
                delete slotEl.dataset.bookingId;
                delete slotEl.dataset.bookingName;
            }
            
            slotEl.className = 'time-slot p-2 text-center text-sm border-t border-slate-100 h-14 flex flex-col items-center justify-center';
            const timeLabelHTML = `<div class="time-label">${slotStart.toFormat('h:mm a')}</div>`;
            let statusLabelHTML = '';
            if (totalParticipants >= MAX_TOTAL_PARTICIPANTS || totalGroups >= MAX_CONCURRENT_GROUPS) {
                slotEl.classList.add('full');
                statusLabelHTML = `<div class="status-label">Full</div>`;
            } else if (totalParticipants > 0) {
                const remainingPax = MAX_TOTAL_PARTICIPANTS - totalParticipants;
                slotEl.classList.add('partial');
                statusLabelHTML = `<div class="status-label">${remainingPax} spots left</div>`;
            } else {
                slotEl.classList.add('available');
            }
            slotEl.innerHTML = (statusLabelHTML) ? `${timeLabelHTML}${statusLabelHTML}` : `<div class="time-label">${slotStart.toFormat('h:mm a')}</div>`;
        });
    }

    // --- MODAL & CLICK HANDLING ---

    function handleSlotClick(e) {
        const slot = e.target.closest('.time-slot');
        if (!slot || slot.classList.contains('past')) return;
        state.selectedSlot = {
            startTime: DateTime.fromISO(slot.dataset.startIso),
            totalParticipants: parseInt(slot.dataset.totalParticipants || '0', 10),
            totalGroups: parseInt(slot.dataset.totalGroups || '0', 10),
        };
        if (slot.classList.contains('partial') || slot.classList.contains('full')) {
            const bookButton = document.getElementById('choice-book-btn');
            const remainingGroups = MAX_CONCURRENT_GROUPS - state.selectedSlot.totalGroups;
            const remainingPax = MAX_TOTAL_PARTICIPANTS - state.selectedSlot.totalParticipants;
            bookButton.style.display = (remainingGroups <= 0 || remainingPax < 2) ? 'none' : 'inline-block';
            choiceModal.showModal();
        } else if (slot.classList.contains('available')) {
            openBookingModalForSelectedSlot();
        }
    }

    function openBookingModalForSelectedSlot() {
        choiceModal.close();
        bookingForm.reset(); // Clear the form
        const { startTime, totalParticipants } = state.selectedSlot;
        const remainingCapacity = MAX_TOTAL_PARTICIPANTS - totalParticipants;
        const maxAllowed = Math.min(MAX_PARTICIPANTS_PER_BOOKING, remainingCapacity);
        const participantsInput = bookingForm.querySelector('#participants');
        participantsInput.max = maxAllowed;
        participantsInput.value = 2; // Reset to default
        document.getElementById('participants-helper-text').textContent = `Max ${maxAllowed} participants for this slot.`;
        document.getElementById('modal-title').textContent = `Book Slot for ${startTime.toFormat('LLL d, h:mm a')}`;
        bookingForm.querySelector('#start-iso').value = startTime.toISO();
        bookingForm.querySelector('#end-time').value = startTime.plus({ minutes: APP_CONFIG.SLOT_DURATION_MINUTES }).toFormat('HH:mm');
        bookingModal.showModal();
    }

    function openCancelModalForSelectedSlot() {
        choiceModal.close();
        const { startTime } = state.selectedSlot;
        const slotEnd = startTime.plus({ minutes: APP_CONFIG.SLOT_DURATION_MINUTES });
        
        // UPDATED: Use first_name and last_name
        const overlappingBookings = state.bookings.filter(b => {
            const bStart = DateTime.fromISO(b.start_iso);
            const bEnd = DateTime.fromISO(b.end_iso);
            return bStart < slotEnd && bEnd > startTime;
        });

        const listContainer = document.getElementById('cancel-booking-list');
        listContainer.innerHTML = '';
        if (overlappingBookings.length === 0) {
            listContainer.innerHTML = '<p class="text-slate-500">No bookings found in this slot to cancel.</p>';
        } else {
            overlappingBookings.forEach(booking => {
                const label = document.createElement('label');
                label.innerHTML = `
                    <input type="radio" name="booking-to-cancel" value="${booking.id}" class="mr-2">
                    <span>Booking by <strong>${booking.first_name} ${booking.last_name}</strong> (${booking.participants} participants)</span>
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

    // --- FORM SUBMISSION ---

    function handleBookingFormSubmit(e) {
        e.preventDefault();
        
        // 1. Get all form data
        const formData = new FormData(bookingForm);
        const firstName = formData.get('first_name').trim();
        const lastName = formData.get('last_name').trim();
        const email = formData.get('email').trim();
        const leaderFirstName = formData.get('leader_first_name').trim();
        const leaderLastName = formData.get('leader_last_name').trim();
        const event = formData.get('event').trim();
        const participants = parseInt(formData.get('participants'), 10);
        const maxAllowed = parseInt(bookingForm.querySelector('#participants').max, 10);
        const endTimeStr = formData.get('end-time');
        const notes = formData.get('notes').trim();
        
        // 2. Validation
        if (!firstName || !lastName || !email || !leaderFirstName || !leaderLastName || !event) {
            return showToast("Please fill in all required fields.", "error");
        }
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            return showToast("Please enter a valid email address.", "error");
        }
        if (!participants || participants < 2 || participants > maxAllowed) {
            return showToast(`Invalid participant number. Must be between 2 and ${maxAllowed}.`, "error");
        }
        const startTime = DateTime.fromISO(bookingForm.querySelector('#start-iso').value);
        const [endHour, endMinute] = endTimeStr.split(':').map(Number);
        const endTime = startTime.set({ hour: endHour, minute: endMinute });
        if (endTime <= startTime) return showToast("End time must be after the start time.", "error");

        // 3. Store data for submission
        state.pendingBookingData = {
            first_name: firstName,
            last_name: lastName,
            email: email,
            leader_first_name: leaderFirstName,
            leader_last_name: leaderLastName,
            event: event,
            participants: participants,
            notes: notes,
            start_iso: startTime.toISO(),
            end_iso: endTime.toISO()
        };

        // 4. Populate and show summary modal
        document.getElementById('summary-name').textContent = `${firstName} ${lastName}`;
        document.getElementById('summary-event').textContent = event;
        document.getElementById('summary-leader').textContent = `${leaderFirstName} ${leaderLastName}`;
        document.getElementById('summary-date').textContent = startTime.toFormat('DDD');
        document.getElementById('summary-time').textContent = `${startTime.toFormat('h:mm a')} - ${endTime.toFormat('h:mm a')}`;
        document.getElementById('summary-participants').textContent = `${participants} participants`;
        document.getElementById('summary-email').textContent = email;

        confirmSummaryModal.showModal();
    }

    function proceedWithBooking() {
        confirmSummaryModal.close();
        loadingModal.showModal(); // Show the loading modal
        
        if (state.pendingBookingData) {
            submitRequest('create', state.pendingBookingData);
            state.pendingBookingData = null;
        }
    }

    function handleCancelFormSubmit(e) {
        e.preventDefault();
        const selectedRadio = document.querySelector('input[name="booking-to-cancel"]:checked');
        if (!selectedRadio) {
            return showToast("Please select a booking to cancel.", "error");
        }
        const bookingId = selectedRadio.value;
        const email = document.getElementById('cancel-email').value;
        if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
            return showToast("Please enter a valid email to confirm.", "error");
        }
        loadingModal.showModal(); // Show loading modal for cancellation
        submitRequest('cancel', { bookingId, email });
    }

    function submitRequest(action, payload) {
        const callbackName = `jsonp_callback_${Date.now()}`;
        const script = document.createElement('script');
        let timeoutId = null;
        
        const cleanup = () => {
            clearTimeout(timeoutId);
            if (script.parentNode) document.body.removeChild(script);
            delete window[callbackName];
            loadingModal.close(); // Always close the loading modal
        };
        
        timeoutId = setTimeout(() => { 
            cleanup(); 
            showToast("Request timed out.", "error"); 
        }, 15000);
        
        window[callbackName] = (data) => {
            cleanup();
            if (data.success) {
                if (action === 'create') {
                    const bookingCode = data.id.substring(0, 12).toUpperCase();
                    document.getElementById('success-booking-code').textContent = bookingCode;
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

    async function fetchBookings() {
        const range = `${'Bookings'}!A:O`; // Updated for 15 columns
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${APP_CONFIG.SPREADSHEET_ID}/values/${range}?key=${APP_CONFIG.API_KEY}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch from Google Sheets API.');
        const data = await response.json();
        const rows = data.values || [];
        const headers = rows[0];
        state.bookings = rows.slice(1).map(row => {
            const booking = {};
            if (headers) {
                headers.forEach((header, index) => { booking[header] = row[index]; });
            }
            return booking;
        }).filter(b => b.status === 'confirmed');
    }

    function changeWeek(direction) {
        state.currentDate = state.currentDate.plus({ weeks: direction });
        render();
    }

    function setLoading(isLoading, scope = 'page') {
        if (scope === 'page') {
            loader.classList.toggle('hidden', !isLoading);
        }
        // Modal button loading state is now handled by the loadingModal
    }

    function showToast(message, type = "success") {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span>${type === 'success' ? '✔' : '✖'}</span><p>${message}</p>`;
        container.appendChild(toast);
        setTimeout(() => { toast.remove(); }, 6000);
    }

    // --- START THE APP ---
    init();
});