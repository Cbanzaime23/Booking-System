/**
 * @module modals
 * @description Modal dialog controllers for the booking system.
 *
 * Manages opening, populating, and resetting every modal in the app:
 * time selection, booking form, cancel, move, move summary, duplicate
 * selection, duplicate booking, conflict warning, and My Bookings lookup.
 *
 * Shared helpers (getOverlappingBookings, renderBookingRadioList,
 * populateRoomDropdown) eliminate duplicate logic across modals.
 */

import { state, ROOM_CAPACITIES } from './state.js';
import { elements, showFormAlert, clearAllFormAlerts, appendFormAlert, showToast, setLoading } from './utils/dom.js';
import { calculateDuration, parseDate } from './utils/date.js';
import { submitRequest, fetchUserBookings } from './api.js';
import { renderEventDropdown } from './admin.js';
import { renderBookingsForSelectedRoom } from './calendar.js';

const DateTime = window.luxon.DateTime;

/**
 * Updates the participant input's min/max constraints and helper text
 * based on the selected room's rules and the current slot's occupancy.
 *
 * @param {Object}  rules   - Room rules from APP_CONFIG.ROOM_CONFIG.
 * @param {boolean} isAdmin - Whether the user is logged in as admin.
 */
export function updateParticipantRules(rules, isAdmin) {
    const { totalParticipants } = state.selectedSlot;
    const remainingCapacity = rules.MAX_TOTAL_PARTICIPANTS - totalParticipants;
    const maxAllowed = Math.min(rules.MAX_BOOKING_SIZE, remainingCapacity);
    const minAllowed = rules.MIN_BOOKING_SIZE;
    const participantsInput = elements.bookingForm.querySelector('#participants');

    participantsInput.max = maxAllowed;
    participantsInput.min = minAllowed;
    if (parseInt(participantsInput.value, 10) < minAllowed) {
        participantsInput.value = minAllowed;
    }

    let helperText = `Group size: ${minAllowed} - ${maxAllowed} participants. `;
    helperText += `Max groups for this room: ${rules.MAX_CONCURRENT_GROUPS}. `;
    const maxDate = DateTime.local().plus(isAdmin ? { months: 6 } : { days: 7 });
    helperText += `Can book up to ${maxDate.toFormat('LLL d')}.`;

    document.getElementById('participants-helper-text').textContent = helperText;
}

/**
 * Opens the time-selection modal where the user picks an end time
 * before proceeding to the full booking form.
 * Closes the choice modal and sets a default 1-hour duration.
 */
export function openTimeSelectionModal() {
    if (elements.choiceModal) elements.choiceModal.close();
    if (!state.selectedSlot) return;

    const { startTime } = state.selectedSlot;
    elements.displayStartTime.textContent = startTime.toFormat('h:mm a');

    const defaultEndDate = startTime.plus({ hours: 1 });
    elements.selectionEndTimeInput.value = defaultEndDate.toFormat('HH:mm');

    updateDurationDisplay();
    elements.timeSelectionModal.showModal();
}

/**
 * Recalculates and updates the duration display in the time-selection modal.
 * Called on every change of the end-time input.
 */
export function updateDurationDisplay() {
    const endTime = elements.selectionEndTimeInput.value;
    const durationMin = calculateDuration(state.selectedSlot.startTime, endTime) * 60;

    if (!endTime) return 0;
    const [hours, minutes] = endTime.split(':').map(Number);
    const endT = state.selectedSlot.startTime.set({ hour: hours, minute: minutes });
    let diff = endT.diff(state.selectedSlot.startTime, 'minutes').minutes;
    if (diff < 0) diff += 24 * 60;

    if (diff <= 0) {
        elements.displayDuration.textContent = '--';
        elements.displayDuration.className = 'font-bold text-red-500';
        return;
    }

    const hr = diff / 60;
    let durationText = '';
    if (diff >= 60) {
        durationText = `${hr} hour${hr !== 1 ? 's' : ''}`;
    } else {
        durationText = `${diff} minute${diff !== 1 ? 's' : ''}`;
    }

    elements.displayDuration.textContent = durationText;
    elements.displayDuration.className = 'font-bold text-ccf-blue';
}

// --- Schedule Info Renderer ---

/**
 * Generates the "Selected Schedule" HTML block shown at the top
 * of the booking modal, displaying date, time range, and duration.
 *
 * @param {DateTime} finalStart - The confirmed start DateTime.
 * @param {string}   finalEnd   - The end time string in "HH:mm" format.
 * @returns {string} HTML string for the schedule info banner.
 * @private
 */
function renderScheduleInfoHTML(finalStart, finalEnd) {
    const startFmt = finalStart.toFormat('h:mm a');
    const endFmt = DateTime.fromFormat(finalEnd, 'HH:mm').toFormat('h:mm a');
    const dateFmt = finalStart.toFormat('ccc, MMM d');

    const [hours, minutes] = finalEnd.split(':').map(Number);
    const endT = finalStart.set({ hour: hours, minute: minutes });
    let durationMin = endT.diff(finalStart, 'minutes').minutes;
    if (durationMin < 0) durationMin += 24 * 60;

    const durationHours = durationMin / 60;
    const durationText = (durationMin > 0) ? `(${durationHours.toFixed(1)} ${durationHours === 1 ? 'hr' : 'hrs'})` : '';

    return `
        <div class="mb-4 p-3 bg-ccf-blue/5 border border-ccf-blue/10 rounded-lg">
            <p class="text-xs text-ccf-blue uppercase font-bold tracking-wider mb-1">Selected Schedule</p>
            <div class="flex items-center justify-between">
                <div>
                    <p class="text-lg font-bold text-gray-800">${dateFmt}</p>
                    <p class="text-md text-ccf-blue font-semibold">
                        ${startFmt} - ${endFmt}
                        <span class="ml-2 text-sm text-gray-500 font-normal">${durationText}</span>
                    </p>
                </div>
                <div class="text-right">
                    <button type="button" id="change-time-btn" class="text-xs text-ccf-red hover:underline font-semibold">Change Time</button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Opens the main booking form modal for the currently selected time slot.
 * Resets the form, populates schedule info, sets participant rules,
 * and renders the event dropdown.
 *
 * @param {DateTime|null} [customStartTime=null] - Override start time (used after time selection modal).
 * @param {string|null}   [customEndTime=null]   - Override end time in "HH:mm" format.
 */
export function openBookingModalForSelectedSlot(customStartTime = null, customEndTime = null) {
    if (elements.choiceModal) elements.choiceModal.close();
    if (elements.timeSelectionModal) elements.timeSelectionModal.close();
    elements.bookingForm.reset();
    clearAllFormAlerts();

    const isAdmin = state.isAdmin;

    document.getElementById('user-fields').classList.toggle('hidden', isAdmin);
    document.getElementById('admin-fields').classList.toggle('hidden', !isAdmin);

    // Hide email confirmation field for admins
    document.getElementById('confirm-email-wrapper').classList.toggle('hidden', isAdmin);
    document.getElementById('confirm_email').required = !isAdmin;

    const { startTime, rules } = state.selectedSlot;

    const finalStart = customStartTime || startTime;
    const finalEnd = customEndTime || startTime.plus({ minutes: window.APP_CONFIG.SLOT_DURATION_MINUTES || 30 }).toFormat('HH:mm');

    renderEventDropdown(isAdmin);

    const dateInfoElement = document.getElementById('modal-date-info');
    if (dateInfoElement) {
        dateInfoElement.innerHTML = renderScheduleInfoHTML(finalStart, finalEnd);
        const changeTimeBtn = dateInfoElement.querySelector('#change-time-btn');
        if (changeTimeBtn) {
            changeTimeBtn.addEventListener('click', () => {
                elements.bookingModal.close();
                openTimeSelectionModal();
            });
        }
    }

    updateParticipantRules(rules, false);
    document.getElementById('modal-title').textContent = `Book ${state.selectedRoom}`;
    elements.bookingForm.querySelector('#start-iso').value = finalStart.toISO();
    elements.bookingForm.querySelector('#end-time').value = finalEnd;

    if (state.selectedRoom === 'Main Hall') {
        elements.tableSelectionWrapper.classList.remove('hidden');
        elements.selectedTableId.value = '';
        elements.displaySelectedTable.textContent = 'None';
        elements.displaySelectedTable.className = 'text-sm font-bold text-gray-500';
    } else {
        elements.tableSelectionWrapper.classList.add('hidden');
        elements.selectedTableId.value = '';
    }

    elements.bookingModal.showModal();

    if (state.pendingWarning) {
        showFormAlert('booking-form-alert', state.pendingWarning, 'warning');
        state.pendingWarning = null;
    }
    if (state.selectedRoom !== 'Main Hall') {
        appendFormAlert('booking-form-alert', 'Your booking may be <strong>automatically moved to Main Hall</strong> if your time slot is available there, to optimize room usage.', 'info');
    }
}

// --- Shared Modal Helpers ---

/**
 * Finds all bookings that overlap a given time slot for a specific room.
 * Eliminates duplication across cancel, move, and duplicate modals.
 */
function getOverlappingBookings(startTime, room) {
    const slotEnd = startTime.plus({ minutes: window.APP_CONFIG.SLOT_DURATION_MINUTES });
    return state.allBookings.filter(b => {
        if (b.room !== room) return false;
        const bStart = parseDate(b.start_iso);
        const bEnd = parseDate(b.end_iso);
        if (!bStart.isValid || !bEnd.isValid) return false;
        return bStart < slotEnd && bEnd > startTime;
    });
}

/**
 * Renders a list of booking radio buttons into a container.
 * @param {string} containerId - DOM id of the list container
 * @param {Array} bookings - Array of booking objects
 * @param {Object} config - { radioName, colorClass, showParticipants, emptyMessage, onChange(booking) }
 */
function renderBookingRadioList(containerId, bookings, config) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    if (bookings.length === 0) {
        container.innerHTML = `<p class="text-slate-500 text-center py-4">${config.emptyMessage || 'No bookings found.'}</p>`;
        return;
    }

    bookings.forEach(booking => {
        const label = document.createElement('label');
        label.className = "block p-3 border border-gray-200 rounded-md cursor-pointer hover:bg-gray-50 transition-colors";
        label.innerHTML = `
            <div class="flex items-start gap-3">
                <input type="radio" name="${config.radioName}" value="${booking.id}" class="mt-1 ${config.colorClass || 'text-ccf-red focus:ring-ccf-red'}">
                <div class="text-sm">
                    <span class="font-bold text-gray-800">${booking.event}</span>
                    <span class="text-gray-600 block text-xs">By: ${booking.first_name} ${booking.last_name}</span>
                    ${config.showParticipants ? `<span class="text-xs text-gray-500 block mt-1">(${booking.participants} participants)</span>` : ''}
                </div>
            </div>
        `;
        const radio = label.querySelector('input[type="radio"]');
        radio.addEventListener('change', () => config.onChange(booking));
        container.appendChild(label);
    });
}

/** Populates a <select> element with room options from APP_CONFIG. */
function populateRoomDropdown(selectEl, selectedRoom) {
    selectEl.innerHTML = '';
    Object.keys(window.APP_CONFIG.ROOM_CONFIG).forEach(room => {
        const opt = document.createElement('option');
        opt.value = room;
        opt.textContent = room;
        if (room === selectedRoom) opt.selected = true;
        selectEl.appendChild(opt);
    });
}

// --- Simplified Modal Openers ---

/**
 * Opens the cancel booking modal for the selected time slot.
 * Lists all overlapping bookings as radio buttons and shows
 * the booking code / admin PIN input fields.
 */
export function openCancelModalForSelectedSlot() {
    if (elements.choiceModal) elements.choiceModal.close();
    const bookings = getOverlappingBookings(state.selectedSlot.startTime, state.selectedRoom);

    renderBookingRadioList('cancel-booking-list', bookings, {
        radioName: 'booking-to-cancel',
        colorClass: 'text-ccf-red focus:ring-ccf-red',
        showParticipants: true,
        emptyMessage: 'No bookings found in this slot to cancel.',
        onChange: (booking) => {
            document.getElementById('cancel-confirmation-section').classList.remove('hidden');
            document.getElementById('confirm-cancel-btn').disabled = false;
            const seriesOption = document.getElementById('cancel-series-option');
            seriesOption.classList.toggle('hidden', !(booking.recurrence && booking.recurrence !== 'none'));
        }
    });

    document.getElementById('cancel-confirmation-section').classList.add('hidden');
    document.getElementById('confirm-cancel-btn').disabled = true;
    document.getElementById('cancel-series-option').classList.add('hidden');
    if (document.getElementById('cancel-series-checkbox')) document.getElementById('cancel-series-checkbox').checked = false;

    // Hide auth fields for authenticated admins
    if (state.isAdmin) {
        document.getElementById('booking-code-section').classList.add('hidden');
        document.getElementById('admin-pin-section').classList.add('hidden');
    } else {
        document.getElementById('booking-code-section').classList.remove('hidden');
        document.getElementById('admin-pin-section').classList.remove('hidden');
    }

    elements.cancelForm.reset();
    elements.cancelModal.showModal();
}

/**
 * Opens the move booking modal for the selected time slot.
 * Lists overlapping bookings to choose from and populates the
 * room dropdown for the destination.
 */
export function openMoveModalForSelectedSlot(preselectedBookingId = null) {
    if (elements.choiceModal) elements.choiceModal.close();
    const bookings = getOverlappingBookings(state.selectedSlot.startTime, state.selectedRoom);

    populateRoomDropdown(document.getElementById('move-new-room'), state.selectedRoom);

    renderBookingRadioList('move-booking-list', bookings, {
        radioName: 'booking_to_move',
        colorClass: 'text-ccf-blue focus:ring-ccf-blue',
        emptyMessage: 'No bookings found to move.',
        onChange: () => {
            document.getElementById('move-details-section').classList.remove('hidden');
            document.getElementById('confirm-move-btn').disabled = false;
        }
    });

    document.getElementById('move-details-section').classList.add('hidden');
    document.getElementById('confirm-move-btn').disabled = true;

    // Hide move admin pin section for authenticated admins
    const movePinSection = document.getElementById('move-admin-pin-section');
    if (movePinSection) {
        movePinSection.classList.toggle('hidden', state.isAdmin);
    }

    document.getElementById('move-form').reset();
    document.getElementById('move-modal').showModal();

    if (preselectedBookingId) {
        const radioToSelect = document.querySelector(`input[name="booking_to_move"][value="${preselectedBookingId}"]`);
        if (radioToSelect) {
            radioToSelect.checked = true;
            radioToSelect.dispatchEvent(new Event('change'));
        }
    }
}



/**
 * Opens the move summary confirmation modal.
 * Displays the pending move details for final admin confirmation
 * before the request is sent to the server.
 */
export function openMoveSummaryModal() {
    const data = state.pendingMoveData;
    if (!data) return;
    document.getElementById('move-sum-event').textContent = data.eventName;
    document.getElementById('move-sum-room').textContent = data.newRoom;
    document.getElementById('move-sum-date').textContent = data.displayDate;
    document.getElementById('move-sum-time').textContent = data.displayTime;
    document.getElementById('move-sum-reason').textContent = data.reason;
    document.getElementById('move-summary-modal').showModal();
}

/**
 * Opens the duplicate booking selection modal.
 * If only one booking exists in the slot, skips straight to the
 * duplicate form. Otherwise shows a selection list.
 */
export function openDuplicateSelectionModalForSelectedSlot() {
    if (elements.choiceModal) elements.choiceModal.close();
    const bookings = getOverlappingBookings(state.selectedSlot.startTime, state.selectedRoom);

    if (bookings.length === 1) {
        openDuplicateBookingModal(bookings[0]);
        return;
    }
    if (bookings.length === 0) {
        showToast("No bookings found to duplicate.", "error");
        return;
    }

    renderBookingRadioList('duplicate-booking-list', bookings, {
        radioName: 'booking-to-duplicate',
        colorClass: 'text-blue-600 focus:ring-blue-500',
        onChange: () => {
            document.getElementById('confirm-duplicate-selection-btn').disabled = false;
        }
    });

    document.getElementById('confirm-duplicate-selection-btn').disabled = true;
    document.getElementById('duplicate-selection-modal').showModal();
}

/**
 * Opens the booking form pre-populated with a source booking's data
 * for the duplicate flow. Admin mode is enforced and a new date must
 * be selected.
 *
 * @param {Object} sourceBooking - The booking to duplicate.
 */
export function openDuplicateBookingModal(sourceBooking) {
    state.duplicationSource = sourceBooking;

    elements.bookingForm.reset();
    clearAllFormAlerts();

    document.getElementById('first_name').value = sourceBooking.first_name;
    document.getElementById('last_name').value = sourceBooking.last_name;
    document.getElementById('email').value = sourceBooking.email;
    document.getElementById('confirm_email').value = sourceBooking.email;
    document.getElementById('event').value = sourceBooking.event;
    document.getElementById('participants').value = sourceBooking.participants;
    document.getElementById('notes').value = sourceBooking.notes || '';

    document.getElementById('leader_first_name').value = sourceBooking.leader_first_name || '';
    document.getElementById('leader_last_name').value = sourceBooking.leader_last_name || '';

    document.getElementById('user-fields').classList.add('hidden');
    document.getElementById('admin-fields').classList.remove('hidden');

    const dateWrapper = document.getElementById('duplicate-date-wrapper');
    const dateInput = document.getElementById('duplicate-date');

    dateWrapper.classList.remove('hidden');
    dateInput.value = '';

    document.getElementById('modal-title').textContent = `Duplicate: ${sourceBooking.event}`;
    document.getElementById('modal-date-info').textContent = "Please select a new date below";

    const roomRules = window.APP_CONFIG.ROOM_CONFIG[state.selectedRoom];
    const participantsInput = elements.bookingForm.querySelector('#participants');
    participantsInput.max = roomRules.MAX_TOTAL_PARTICIPANTS;
    participantsInput.min = roomRules.MIN_BOOKING_SIZE;

    document.getElementById('participants-helper-text').textContent = "Admin Override Enabled.";

    const sStart = parseDate(sourceBooking.start_iso);
    const sEnd = parseDate(sourceBooking.end_iso);
    const durationMin = sEnd.diff(sStart, 'minutes').minutes;

    state.duplicationDuration = durationMin;
    elements.bookingForm.querySelector('#start-iso').value = "";

    elements.bookingModal.showModal();
    dateInput.focus();
}

/**
 * Handles the "My Bookings" lookup form submission.
 * Fetches the user's future bookings by email and displays them,
 * then reveals the GDPR rights section.
 *
 * @param {SubmitEvent} e - The form submit event.
 */
export function handleMyBookingsSubmit(e) {
    e.preventDefault();
    const email = new FormData(e.target).get('lookup_email');
    if (!email) return;

    window.gdprLookupEmail = email.trim();

    elements.myBookingsResults.querySelectorAll('.booking-item').forEach(e => e.remove());
    elements.myBookingsEmpty.classList.add('hidden');
    elements.myBookingsLoading.classList.remove('hidden');
    if (elements.gdprRightsSection) elements.gdprRightsSection.classList.add('hidden');

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Searching...';

    fetchUserBookings(email)
        .then(bookings => {
            elements.myBookingsLoading.classList.add('hidden');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Find';

            if (!bookings || bookings.length === 0) {
                elements.myBookingsEmpty.classList.remove('hidden');
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
                    elements.myBookingsResults.appendChild(item);
                });
            }

            if (elements.gdprRightsSection) elements.gdprRightsSection.classList.remove('hidden');
        })
        .catch(err => {
            elements.myBookingsLoading.classList.add('hidden');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Find';
            alert(err.message);
        });
}
// --- Floorplan Modal ---

export function openFloorplanModal() {
    const startTimeIso = elements.bookingForm.querySelector('#start-iso').value;
    const endTimeStr = elements.bookingForm.querySelector('#end-time').value;

    if (!startTimeIso || !endTimeStr) {
        showFormAlert('booking-form-alert', 'Please select a valid time first.', 'error');
        return;
    }

    const startTime = DateTime.fromISO(startTimeIso);
    const [endHour, endMinute] = endTimeStr.split(':').map(Number);
    const endTime = startTime.set({ hour: endHour, minute: endMinute });

    // Find all overlapping bookings for Main Hall in this exact time span
    const overlapping = state.allBookings.filter(b => {
        if (b.room !== 'Main Hall') return false;
        const bStart = parseDate(b.start_iso);
        const bEnd = parseDate(b.end_iso);
        if (!bStart.isValid || !bEnd.isValid) return false;
        return startTime < bEnd && endTime > bStart;
    });

    const bookedTables = {};
    overlapping.forEach(b => {
        if (b.table_id) {
            bookedTables[b.table_id] = b;
        }
    });

    const isAdmin = state.isAdmin;
    const tableBtns = elements.floorplanModal.querySelectorAll('.table-btn');

    tableBtns.forEach(btn => {
        const tId = btn.dataset.tableId;
        const booking = bookedTables[tId];

        btn.classList.remove('bg-gray-200', 'text-gray-400', 'border-gray-400', 'cursor-not-allowed', 'bg-blue-100', 'border-ccf-blue');
        btn.disabled = false;
        delete btn.dataset.bookingId;
        delete btn.dataset.bookingName;

        if (booking) {
            btn.classList.add('bg-gray-200', 'text-gray-400', 'border-gray-400');
            // If admin, we allow clicking it to prompt for Move flow
            if (isAdmin) {
                btn.dataset.bookingId = booking.id;
                btn.dataset.bookingName = booking.first_name + ' ' + booking.last_name;
            } else {
                btn.classList.add('cursor-not-allowed');
                btn.disabled = true;
            }
        } else if (elements.selectedTableId.value === tId) {
            btn.classList.add('bg-blue-100', 'border-ccf-blue');
        }
    });

    elements.floorplanModal.showModal();
}

/**
 * Processes a deep link to cancel a booking from an email.
 * Validates the booking exists, then routes to the correct confirmation modal.
 * 
 * @param {string} bookingId - The original UUID
 * @param {string} bookingCode - The 12-char auth string
 */
export function handleEmailCancelDeepLink(bookingId, bookingCode) {
    // Strip URL parameters for cleanliness
    const url = new URL(window.location);
    url.search = '';
    window.history.replaceState({}, document.title, url);

    const booking = state.allBookings.find(b => b.id === bookingId);

    if (!booking || new Date(booking.start_iso) < new Date()) {
        const errorMsg = !booking
            ? 'This booking is no longer active or could not be found.'
            : 'You cannot cancel a booking that has already started or passed.';
        // Wait a tick for DOM to be ready to show the alert
        setTimeout(() => showFormAlert('dashboard-alert', errorMsg, 'error'), 100);
        return;
    }

    state.pendingCancelData = { bookingId, bookingCode, adminPin: '' };

    if (booking.recurrence_id && booking.recurrence_id !== 'none') {
        const modal = document.getElementById('cancel-user-series-modal');
        if (modal) modal.showModal();
    } else {
        const start = window.luxon.DateTime.fromISO(booking.start_iso);
        const end = window.luxon.DateTime.fromISO(booking.end_iso);
        document.getElementById('email-cancel-event-name').textContent = booking.event;
        document.getElementById('email-cancel-date').textContent = start.toFormat('MMM d, yyyy (ccc)');
        document.getElementById('email-cancel-time').textContent = `${start.toFormat('h:mm a')} - ${end.toFormat('h:mm a')}`;

        const modal = document.getElementById('email-cancel-confirm-modal');
        if (modal) modal.showModal();
    }
}
