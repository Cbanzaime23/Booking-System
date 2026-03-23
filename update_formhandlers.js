const fs = require('fs');
const path = 'G:\\My Drive\\1. Projects\\BookingSystem\\js\\formHandlers.js';
let content = fs.readFileSync(path, 'utf8');

const targetFunction = `export function handleBookingFormSubmit(e) {
    e.preventDefault();

    const data = extractBookingFormData(e.target);
    const roomRules = state.selectedSlot.rules || window.APP_CONFIG.ROOM_CONFIG[state.selectedRoom];

    const error = validateBookingForm(data, roomRules);
    if (error) return showFormAlert('booking-form-alert', error, 'error');

    state.pendingBookingData = buildBookingPayload(data);
    populateBookingSummary(state.pendingBookingData);
    elements.confirmSummaryModal.showModal();
}`;

const replaceWith = `export function handleBookingFormSubmit(e) {
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
            payload.room = "Main Hall";
            reassigned = true;
        }
    }

    state.pendingBookingData = payload;
    populateBookingSummary(state.pendingBookingData);
    
    // Toggle the reassignment notice visibility
    const noticeEl = document.getElementById('summary-reassign-notice');
    if (noticeEl) {
        noticeEl.classList.toggle('hidden', !reassigned);
    }

    elements.confirmSummaryModal.showModal();
}`;

if (content.includes('export function handleBookingFormSubmit')) {
    content = content.replace(targetFunction, replaceWith);
    fs.writeFileSync(path, content);
    console.log('formHandlers.js updated with squeeze logic.');
} else {
    console.error('Target function not found in formHandlers.js');
}
