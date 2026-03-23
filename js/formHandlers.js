/**
 * @module formHandlers
 * @description Form submission handlers for booking, cancel, and move flows.
 *
 * Each handler extracts form data, runs client-side validation via
 * the validation module, builds the API payload, and either submits
 * directly or opens a confirmation summary modal.
 */

import { state } from './state.js';
import { elements, showFormAlert } from './utils/dom.js';
import { parseDate } from './utils/date.js';
import { submitRequest } from './api.js';
import { openMoveSummaryModal } from './modals.js';
import {
    sanitizeInput,
    validateRequiredFields,
    validateEmail,
    validateEmailMatch,
    checkEmailTypo,
    validateParticipants,
    validateBookingTiming,
    validateConsent
} from './utils/validation.js';

const DateTime = window.luxon.DateTime;

/**
 * Handles the move booking form submission.
 * Validates all fields, checks for time conflicts with existing bookings,
 * and either shows a conflict modal or proceeds to the move summary.
 *
 * @param {SubmitEvent} e - The form submit event.
 */
export function handleMoveFormSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const bookingId = formData.get('booking_to_move');
    const newDate = formData.get('new_date');
    const newRoom = formData.get('new_room');
    const newStartTime = formData.get('new_start_time');
    const newEndTime = formData.get('new_end_time');
    const reason = formData.get('move_reason');
    const adminPin = state.isAdmin ? state.adminPin : formData.get('admin_pin');

    if (!bookingId || !newDate || !newStartTime || !newEndTime || !reason || (!state.isAdmin && !adminPin)) {
        return showFormAlert('move-form-alert', 'All fields including Admin PIN are required.', 'error');
    }

    const startIso = DateTime.fromISO(`${newDate}T${newStartTime}`, { zone: window.APP_CONFIG.TIMEZONE });
    const endIso = DateTime.fromISO(`${newDate}T${newEndTime}`, { zone: window.APP_CONFIG.TIMEZONE });

    if (endIso <= startIso) return showFormAlert('move-form-alert', 'End time must be after start time.', 'error');

    state.pendingMoveData = {
        bookingId, adminPin, newRoom,
        start_iso: startIso.toISO(),
        end_iso: endIso.toISO(),
        reason,
        eventName: document.querySelector('input[name="booking_to_move"]:checked')?.nextElementSibling.querySelector('span').textContent || 'Event',
        displayDate: startIso.toFormat('MMM d, yyyy (ccc)'),
        displayTime: `${startIso.toFormat('h:mm a')} - ${endIso.toFormat('h:mm a')}`
    };

    const conflicts = state.allBookings.filter(b => {
        if (b.id == bookingId) return false;
        if (b.room !== newRoom) return false;
        const bStart = parseDate(b.start_iso);
        const bEnd = parseDate(b.end_iso);
        if (!bStart.isValid || !bEnd.isValid) return false;
        return startIso < bEnd && endIso > bStart;
    });

    if (conflicts.length > 0) {
        const listEl = document.getElementById('conflict-list');
        listEl.innerHTML = '';
        conflicts.forEach(c => {
            const item = document.createElement('div');
            item.className = "flex justify-between border-b border-amber-200 pb-1 last:border-0";
            item.innerHTML = `<span><strong>${c.event}</strong></span> <span>${parseDate(c.start_iso).toFormat('h:mm a')} - ${parseDate(c.end_iso).toFormat('h:mm a')}</span>`;
            listEl.appendChild(item);
        });

        document.getElementById('conflict-modal').showModal();
        return;
    }

    openMoveSummaryModal();
}

// --- Booking Form Helpers ---

/**
 * Extracts and sanitizes all field values from the booking form.
 *
 * @param {HTMLFormElement} formElement - The booking <form> element.
 * @returns {Object} An object with all cleaned field values.
 * @private
 */
function extractBookingFormData(formElement) {
    const formData = new FormData(formElement);
    return {
        firstName: sanitizeInput(formData.get('first_name')),
        lastName: sanitizeInput(formData.get('last_name')),
        email: sanitizeInput(formData.get('email')),
        confirmEmail: sanitizeInput(formData.get('confirm_email')),
        leaderFirstName: sanitizeInput(formData.get('leader_first_name')),
        leaderLastName: sanitizeInput(formData.get('leader_last_name')),
        event: sanitizeInput(formData.get('event')),
        participants: parseInt(formData.get('participants'), 10),
        endTimeStr: formData.get('end-time'),
        tableId: formData.get('table_id'),
        notes: sanitizeInput(formData.get('notes')),
        adminPin: state.isAdmin ? state.adminPin : '',
        recurrence: formData.get('recurrence'),
        isAdmin: state.isAdmin,
        termsChecked: document.getElementById('terms-checkbox').checked,
        privacyChecked: document.getElementById('privacy-checkbox').checked
    };
}

/**
 * Runs the full validation pipeline on extracted booking form data.
 * Returns the first error encountered, or null if everything is valid.
 *
 * @param {Object} data      - The extracted form data from {@link extractBookingFormData}.
 * @param {Object} roomRules - Room capacity/concurrency rules from APP_CONFIG.
 * @returns {string|null} Error message string, or null if valid.
 * @private
 */
function validateBookingForm(data, roomRules) {
    if (!data.termsChecked) return 'You must agree to the Terms & Conditions.';
    if (!data.privacyChecked) return 'You must consent to the processing of your personal data.';

    // Duplicate booking requires admin PIN
    if (state.duplicationSource && !data.adminPin) return 'Admin PIN is required for Duplicate Booking.';

    const reqErr = validateRequiredFields(data, data.isAdmin);
    if (reqErr) return reqErr;

    const emailErr = validateEmail(data.email);
    if (emailErr) return emailErr;

    if (!data.isAdmin) {
        const matchErr = validateEmailMatch(data.email, data.confirmEmail);
        if (matchErr) return matchErr;
    }

    const typoErr = checkEmailTypo(data.email);
    if (typoErr) return typoErr;

    const partErr = validateParticipants(data.participants, roomRules, data.isAdmin, state.selectedRoom);
    if (partErr) return partErr;

    // Compute start/end times for timing validation
    const startTime = DateTime.fromISO(elements.bookingForm.querySelector('#start-iso').value);
    const [endHour, endMinute] = data.endTimeStr.split(':').map(Number);
    const endTime = startTime.set({ hour: endHour, minute: endMinute });
    if (endTime <= startTime) return 'End time must be after the start time.';

    const timingErr = validateBookingTiming(startTime, data.isAdmin);
    if (timingErr) return timingErr;

    const consentErr = validateConsent(data.termsChecked, data.privacyChecked);
    if (consentErr) return consentErr;

    return null;
}

/**
 * Builds the API payload object from validated form data.
 * Computes start/end ISO timestamps and attaches consent metadata.
 *
 * @param {Object} data - The validated form data.
 * @returns {Object} The payload object ready for submitRequest('create', ...).
 * @private
 */
function buildBookingPayload(data) {
    const startTime = DateTime.fromISO(elements.bookingForm.querySelector('#start-iso').value);
    const [endHour, endMinute] = data.endTimeStr.split(':').map(Number);
    const endTime = startTime.set({ hour: endHour, minute: endMinute });

    return {
        room: state.selectedRoom,
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        leader_first_name: data.isAdmin ? '' : data.leaderFirstName,
        leader_last_name: data.isAdmin ? '' : data.leaderLastName,
        event: data.event,
        participants: data.participants,
        notes: data.notes,
        start_iso: startTime.toISO(),
        end_iso: endTime.toISO(),
        table_id: data.tableId,
        adminPin: data.adminPin,
        recurrence: data.isAdmin ? data.recurrence : 'none',
        terms_accepted: data.termsChecked,
        privacy_accepted: data.privacyChecked,
        consent_timestamp: DateTime.local().setZone(window.APP_CONFIG.TIMEZONE).toISO(),
        app_url: window.location.origin + window.location.pathname
    };
}

/**
 * Fills the confirmation summary modal with human-readable booking details.
 * Called just before showing the summary modal to the user.
 *
 * @param {Object} payload - The booking payload from {@link buildBookingPayload}.
 * @private
 */
function populateBookingSummary(payload) {
    const startTime = DateTime.fromISO(payload.start_iso);
    const endTime = DateTime.fromISO(payload.end_iso);
    const durationMinutes = endTime.diff(startTime, 'minutes').minutes;
    const durationHours = durationMinutes / 60;
    const durationText = durationMinutes >= 60
        ? `${durationHours} hour${durationHours !== 1 ? 's' : ''}`
        : `${durationMinutes} minute${durationMinutes !== 1 ? 's' : ''}`;

    document.getElementById('summary-room').textContent = payload.room;
    document.getElementById('summary-name').textContent = `${payload.first_name} ${payload.last_name}`;
    document.getElementById('summary-event').textContent = payload.event;

    if (payload.room === 'Main Hall') {
        document.getElementById('summary-table-row').classList.remove('hidden');
        document.getElementById('summary-table-row').classList.add('flex');
        document.getElementById('summary-table').textContent = payload.table_id ? `Table ${payload.table_id}` : 'None';
    } else {
        document.getElementById('summary-table-row').classList.add('hidden');
        document.getElementById('summary-table-row').classList.remove('flex');
    }

    document.getElementById('summary-leader').textContent = payload.leader_first_name
        ? `${payload.leader_first_name} ${payload.leader_last_name}`
        : 'N/A (Admin)';
    document.getElementById('summary-date').textContent = startTime.toFormat('DDD');
    document.getElementById('summary-time').textContent = `${startTime.toFormat('h:mm a')} - ${endTime.toFormat('h:mm a')} (${durationText})`;
    document.getElementById('summary-participants').textContent = `${payload.participants} participants`;
    document.getElementById('summary-email').textContent = payload.email;
}

/**
 * Main booking form submit handler.
 * Orchestrates extract → validate → build payload → show summary.
 *
 * @param {SubmitEvent} e - The form submit event.
 */
export function handleBookingFormSubmit(e) {
    e.preventDefault();

    const data = extractBookingFormData(e.target);
    const roomRules = state.selectedSlot.rules || window.APP_CONFIG.ROOM_CONFIG[state.selectedRoom];

    const error = validateBookingForm(data, roomRules);
    if (error) return showFormAlert('booking-form-alert', error, 'error');

    const payload = buildBookingPayload(data);

    // --- Frontend Main Hall Prioritization (Squeeze Logic) ---
    let reassigned = false;
    if (!state.isAdmin && state.selectedRoom !== "Main Hall") {
        const { start_iso, end_iso, participants } = payload;
        const mainHallRules = window.APP_CONFIG.ROOM_CONFIG["Main Hall"];

        const startLux = DateTime.fromISO(start_iso);
        const endLux = DateTime.fromISO(end_iso);

        const mainHallConcurrent = state.allBookings.filter(b => {
            if (b.room !== "Main Hall") return false;
            const bStart = parseDate(b.start_iso);
            const bEnd = parseDate(b.end_iso);
            if (!bStart.isValid || !bEnd.isValid) return false;
            return startLux < bEnd && endLux > bStart;
        });

        const mainHallCurrentPax = mainHallConcurrent.reduce((sum, b) => sum + parseInt(b.participantCount || 0, 10), 0);

        const canFitGroup = (mainHallConcurrent.length + 1) <= mainHallRules.MAX_CONCURRENT_GROUPS;
        const canFitPax = (mainHallCurrentPax + participants) <= mainHallRules.MAX_TOTAL_PARTICIPANTS;
        const meetsSizeRules = (participants >= mainHallRules.MIN_BOOKING_SIZE) && (participants <= mainHallRules.MAX_BOOKING_SIZE);

        const isMainHallBlocked = state.blockedDates && state.blockedDates.some(d => {
            return d.date === startLux.toISODate() && (d.room === "All Rooms" || d.room === "Main Hall");
        });

        if (canFitGroup && canFitPax && meetsSizeRules && !isMainHallBlocked) {
            payload.original_room = payload.room;
            payload.room = "Main Hall";
            reassigned = true;
        }
    }

    // If upgraded, pause the submission flow and force the user to select a table
    if (reassigned && !payload.table_id) {
        state.isAutoUpgradeTableSelect = true;
        state.pendingBookingData = payload;

        // Dynamically import the modal opener here to avoid massive refactoring/circular deps
        import('./modals.js').then(modals => {
            modals.openFloorplanModal(payload);
        });
        return; // Halt execution until table is selected
    }

    resumeBookingSubmit(payload, reassigned);
}

/**
 * Continuation of the booking submission flow after a table has been assigned
 * during an automatic Main Hall upgrade.
 * 
 * @param {Object} payload - The partially completed booking payload.
 * @param {boolean} reassigned - Whether the booking was automatically upgraded.
 */
export function resumeBookingSubmit(payload, reassigned = false) {
    state.pendingBookingData = payload;
    populateBookingSummary(state.pendingBookingData);

    // Toggle the reassignment notice visibility
    const noticeEl = document.getElementById('summary-reassign-notice');
    if (noticeEl) {
        if (reassigned) {
            noticeEl.innerHTML = `To optimize room usage, your reservation will be moved from <strong>${payload.original_room}</strong> to <strong>Main Hall</strong>.`;
            noticeEl.classList.remove('hidden');
        } else {
            noticeEl.classList.add('hidden');
        }
    }

    elements.confirmSummaryModal.showModal();
}

/**
 * Handles the cancel booking form submission.
 * Supports both user-initiated (via booking code) and admin-initiated
 * cancellations. For recurrent admin bookings, opens a secondary
 * modal asking whether to cancel the full series.
 *
 * @param {SubmitEvent} e - The form submit event.
 */
export function handleCancelFormSubmit(e) {
    e.preventDefault();
    const selectedRadio = document.querySelector('input[name="booking-to-cancel"]:checked');
    if (!selectedRadio) { return showFormAlert('cancel-form-alert', 'Please select a booking to cancel.', 'error'); }

    const bookingId = selectedRadio.value;
    const bookingCode = document.getElementById('cancel-booking-code').value.trim();
    const adminPin = state.isAdmin ? state.adminPin : document.getElementById('cancel-admin-pin').value.trim();
    const cancelSeries = document.getElementById('cancel-series-checkbox') ? document.getElementById('cancel-series-checkbox').checked : false;

    if (cancelSeries && !adminPin) {
        return showFormAlert('cancel-form-alert', 'Admin PIN is required to cancel a recurrent series.', 'error');
    }

    if (cancelSeries) {
        if (!confirm("⚠️ WARNING: You are about to cancel this ENTIRE series of bookings.\\n\\nThis action cannot be undone. Are you sure?")) {
            return;
        }
    }

    const booking = state.allBookings.find(b => b.id == bookingId);
    const isAdminBooking = booking && !booking.leader_first_name;

    if (isAdminBooking) {
        if (!adminPin) {
            return showFormAlert('cancel-form-alert', 'Admin PIN is required to cancel this Admin Booking.', 'error');
        }
    } else {
        if (!adminPin && !bookingCode) {
            return showFormAlert('cancel-form-alert', 'Please enter the Booking Code to confirm.', 'error');
        }
    }

    if (booking && booking.recurrence_id && isAdminBooking && adminPin) {
        state.pendingCancelData = { bookingId, bookingCode, adminPin };
        document.getElementById('cancel-user-series-modal').showModal();
        return;
    }

    elements.loadingModal.showModal();
    submitRequest('cancel', { bookingId, bookingCode, adminPin, cancelSeries });
}

/**
 * Submits the pending cancellation after the series-confirmation modal.
 * Called by the series modal's "Cancel This Only" or "Cancel Entire Series" buttons.
 *
 * @param {boolean} cancelSeries - True to cancel the full recurrent series.
 */
export function submitPendingCancellation(cancelSeries) {
    document.getElementById('cancel-user-series-modal').close();
    if (!state.pendingCancelData) return;
    const { bookingId, bookingCode, adminPin } = state.pendingCancelData;
    elements.loadingModal.showModal();
    submitRequest('cancel', { bookingId, bookingCode, adminPin, cancelSeries });
    state.pendingCancelData = null;
}
