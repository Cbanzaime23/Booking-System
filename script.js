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
    

    const calendarView = document.querySelector('#calendar-view .grid');
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

    function init() {
        initializeRoomSelector();
        setupEventListeners();
        render();
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
        document.getElementById('choice-back-btn').addEventListener('click', () => choiceModal.close());
        bookingForm.addEventListener('submit', handleBookingFormSubmit);
        cancelForm.addEventListener('submit', handleCancelFormSubmit);
        document.getElementById('cancel-booking-list').addEventListener('change', handleCancelSelectionChange);
        document.getElementById('summary-yes-btn').addEventListener('click', proceedWithBooking);
        document.getElementById('summary-no-btn').addEventListener('click', () => confirmSummaryModal.close());
        document.getElementById('success-done-btn').addEventListener('click', () => successModal.close());
        document.querySelectorAll('.cancel-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                bookingModal.close();
                cancelModal.close();
            });
        });

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

    function renderBookingsForSelectedRoom() {
        const roomRules = APP_CONFIG.ROOM_CONFIG[state.selectedRoom];
        const roomBookings = state.allBookings.filter(b => b.room === state.selectedRoom);
        document.querySelectorAll('.time-slot').forEach(slotEl => {
            if (slotEl.classList.contains('past')) return;
            const slotStart = DateTime.fromISO(slotEl.dataset.startIso);
            const slotEnd = slotStart.plus({ minutes: APP_CONFIG.SLOT_DURATION_MINUTES });
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
            slotEl.className = 'time-slot p-2 text-center text-sm border-t border-slate-100 h-14 flex flex-col items-center justify-center';
            const timeLabelHTML = `<div class="time-label">${slotStart.toFormat('h:mm a')}</div>`;
            let statusLabelHTML = '';
            if (totalParticipants >= roomRules.MAX_TOTAL_PARTICIPANTS || totalGroups >= roomRules.MAX_CONCURRENT_GROUPS) {
                slotEl.classList.add('full');
                statusLabelHTML = `<div class="status-label">Full</div>`;
            } else if (totalParticipants > 0) {
                const remainingPax = roomRules.MAX_TOTAL_PARTICIPANTS - totalParticipants;
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
        const roomRules = APP_CONFIG.ROOM_CONFIG[state.selectedRoom];
        state.selectedSlot = {
            startTime: DateTime.fromISO(slot.dataset.startIso),
            totalParticipants: parseInt(slot.dataset.totalParticipants || '0', 10),
            totalGroups: parseInt(slot.dataset.totalGroups || '0', 10),
            rules: roomRules
        };
        if (slot.classList.contains('partial') || slot.classList.contains('full')) {
            const bookButton = document.getElementById('choice-book-btn');
            const remainingGroups = roomRules.MAX_CONCURRENT_GROUPS - state.selectedSlot.totalGroups;
            const remainingPax = roomRules.MAX_TOTAL_PARTICIPANTS - state.selectedSlot.totalParticipants;
            bookButton.style.display = (remainingGroups <= 0 || remainingPax < roomRules.MIN_BOOKING_SIZE) ? 'none' : 'inline-block';
            choiceModal.showModal();
        } else if (slot.classList.contains('available')) {
            openBookingModalForSelectedSlot();
        }
    }

    function openBookingModalForSelectedSlot() {
        choiceModal.close();
        bookingForm.reset();
        // document.getElementById('admin-toggle').checked = false;

        // Ensure Admin Toggle is reset to User (unchecked)
        const isAdmin = document.getElementById('admin-toggle').checked = false;

        document.getElementById('user-fields').classList.remove('hidden');
        document.getElementById('admin-fields').classList.add('hidden');
        const { startTime, rules } = state.selectedSlot;
        // --- CRITICAL ADDITION: RENDER DROPDOWN FOR USER (false) ---
        renderEventDropdown(isAdmin);


        // --- REVISED CHANGE: Using a dedicated element for date info ---
        
        // 1. Format the date/time string
        // Example: "Mon, Nov 10, 9:00 AM" (using current time of Nov 8, 2025)
        const formattedDate = startTime.toFormat('ccc, MMM d, h:mm a');
        
        // 2. Set the room name title (if you kept the original ID, use that here)
        // Assuming you use the new ID 'modal-room-title'
        const roomTitleElement = document.getElementById('modal-room-title');
        if (roomTitleElement) {
             roomTitleElement.textContent = `Book ${state.selectedRoom}`;
        }
        
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
        const isAdmin = document.getElementById('admin-toggle').checked;
        const roomRules = state.selectedSlot.rules;
        const formData = new FormData(bookingForm);
        const firstName = formData.get('first_name').trim();
        const lastName = formData.get('last_name').trim();
        const email = formData.get('email').trim();
        const leaderFirstName = formData.get('leader_first_name').trim();
        const leaderLastName = formData.get('leader_last_name').trim();
        const event = formData.get('event').trim();
        const participants = parseInt(formData.get('participants'), 10);
        const endTimeStr = formData.get('end-time');
        const notes = formData.get('notes').trim();
        const adminPin = formData.get('admin-pin').trim();
        const recurrence = formData.get('recurrence');
        
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

        
        const maxDate = DateTime.local().plus(isAdmin ? { months: 6 } : { days: 7 });
        if (startTime > maxDate) {
            return showToast(isAdmin ? "Admins can only book up to 6 months in advance." : "Users can only book up to 7 days in advance.", "error");
        }
        if (startTime < DateTime.local()) {
            return showToast("Cannot create a booking in the past.", "error");
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
            recurrence: isAdmin ? recurrence : 'none' // Only send recurrence if admin
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

    /**
     * UPDATED: Relaxes email validation if admin pin is present.
     */
    function handleCancelFormSubmit(e) {
        e.preventDefault();
        const selectedRadio = document.querySelector('input[name="booking-to-cancel"]:checked');
        if (!selectedRadio) { return showToast("Please select a booking to cancel.", "error"); }
        
        const bookingId = selectedRadio.value;
        const email = document.getElementById('cancel-email').value;
        const adminPin = document.getElementById('admin-pin').value;
        
        // If no admin pin is provided, email is strictly required and must be valid.
        if (!adminPin && (!email || !/^\S+@\S+\.\S+$/.test(email))) { 
            return showToast("Please enter a valid email to confirm.", "error"); 
        }
        
        // If admin pin IS provided, email is optional (but we send it anyway).
        // The server will prioritize the PIN.
        
        // We require *something* in the email field to help admins log who cancelled it.
        if (!email) {
             return showToast("Email field is required (use your admin email).", "error");
        }

        loadingModal.showModal();
        submitRequest('cancel', { bookingId, email: email, adminPin: adminPin });
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

    async function fetchAllBookings() {
        const range = `${'Bookings'}!A:O`;
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${APP_CONFIG.SPREADSHEET_ID}/values/${range}?key=${APP_CONFIG.API_KEY}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch from Google Sheets API.');
        const data = await response.json();
        const rows = data.values || [];
        const headers = rows[0];
        
        state.allBookings = rows.slice(1).map(row => {
            const booking = {};
            if (headers) {
                headers.forEach((header, index) => { booking[header] = row[index]; });
            }
            return booking;
        }).filter(b => b.status === 'confirmed');
    }

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