/**
 * @module calendar
 * @description Weekly calendar grid renderer.
 *
 * Builds the 7-day calendar shell (day headers + time slot cells),
 * overlays reservation status (available / partial / full / blocked) onto
 * each slot, and renders "Add to Google Calendar" buttons on the
 * success modal after a booking is created.
 */

import { state } from './state.js';
import { elements } from './utils/dom.js';
import { parseDate } from './utils/date.js';
import { isReservationWindowOpen } from './utils/validation.js';

const DateTime = window.luxon.DateTime;

/**
 * Renders the structural calendar grid for the current week.
 * Creates the AM/PM legend column, 7 day-header cells, and
 * one time-slot cell per business-hour increment for each day.
 * Does NOT populate booking data — call {@link renderBookingsForSelectedRoom} after.
 */
export function renderCalendarShell() {
    elements.calendarDayHeaders.innerHTML = '';
    elements.calendarView.innerHTML = '';

    const startOfWeek = state.currentDate.startOf('week');
    const endOfWeek = state.currentDate.endOf('week');
    elements.calendarControls.currentWeekTitle.textContent = `${startOfWeek.toFormat('LLL d')} - ${endOfWeek.toFormat('LLL d, yyyy')}`;

    const legendHeader = document.createElement('div');
    legendHeader.className = 'text-center p-2 border-b-4 border-r border-ccf-blue bg-slate-50 flex items-center justify-center';
    legendHeader.innerHTML = '<span class="text-xs font-bold text-gray-400">AM/PM</span>';
    elements.calendarDayHeaders.appendChild(legendHeader);

    const legendColumn = document.createElement('div');
    legendColumn.className = 'flex flex-col border-r border-b border-slate-200';

    let amSlots = 0, pmSlots = 0;
    const refHours = window.APP_CONFIG.BUSINESS_HOURS[0];
    if (refHours && refHours.start) {
        const [sH, sM] = refHours.start.split(':').map(Number);
        const [eH, eM] = refHours.end.split(':').map(Number);

        let curr = DateTime.now().set({ hour: sH, minute: sM, second: 0, millisecond: 0 });
        const end = curr.set({ hour: eH, minute: eM });

        while (curr < end) {
            if (curr.hour < 12) amSlots++; else pmSlots++;
            curr = curr.plus({ minutes: window.APP_CONFIG.SLOT_DURATION_MINUTES });
        }
    }

    if (amSlots > 0) {
        const amDiv = document.createElement('div');
        amDiv.style.flex = amSlots;
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
    elements.calendarView.appendChild(legendColumn);

    for (let i = 0; i < 7; i++) {
        const day = startOfWeek.plus({ days: i });

        const dayHeader = document.createElement('div');
        const isToday = day.hasSame(DateTime.local().setZone(window.APP_CONFIG.TIMEZONE), 'day');
        if (isToday) {
            dayHeader.className = 'text-center p-2 border-b-4 border-r border-ccf-blue bg-ccf-blue';
            dayHeader.innerHTML = `<span class="font-bold text-white text-sm md:text-base uppercase tracking-wider">${day.toFormat('ccc')}</span><br><span class="text-xs md:text-sm text-blue-200 font-bold">${day.toFormat('d')}</span>`;
        } else {
            dayHeader.className = 'text-center p-2 border-b-4 border-r border-ccf-blue bg-slate-50';
            dayHeader.innerHTML = `<span class="font-bold text-ccf-blue text-sm md:text-base uppercase tracking-wider">${day.toFormat('ccc')}</span><br><span class="text-xs md:text-sm text-gray-600 font-bold">${day.toFormat('d')}</span>`;
        }
        elements.calendarDayHeaders.appendChild(dayHeader);

        const dayColumn = document.createElement('div');
        dayColumn.className = 'border-r border-b border-slate-200';

        const hours = window.APP_CONFIG.BUSINESS_HOURS[day.weekday % 7];
        if (hours && hours.start) {
            const dayStart = day.set({ hour: parseInt(hours.start.split(':')[0]), minute: parseInt(hours.start.split(':')[1]) });
            const dayEnd = day.set({ hour: parseInt(hours.end.split(':')[0]), minute: parseInt(hours.end.split(':')[1]) });
            for (let currentTime = dayStart; currentTime < dayEnd; currentTime = currentTime.plus({ minutes: window.APP_CONFIG.SLOT_DURATION_MINUTES })) {
                dayColumn.appendChild(createTimeSlot(currentTime));
            }
        } else {
            const closedDiv = document.createElement('div');
            closedDiv.className = 'p-4 text-center text-slate-400 text-xs md:text-base';
            closedDiv.textContent = 'Closed';
            dayColumn.appendChild(closedDiv);
        }
        elements.calendarView.appendChild(dayColumn);
    }
}

/**
 * Creates a single time-slot DOM element for the calendar grid.
 * Marks past slots as visually disabled.
 *
 * @param {DateTime} time - The Luxon DateTime for this slot's start time.
 * @returns {HTMLElement} The configured time-slot div.
 * @private
 */
function createTimeSlot(time) {
    const slot = document.createElement('div');
    const isPast = time < DateTime.local().setZone(window.APP_CONFIG.TIMEZONE);
    const isNoon = time.hour === 12 && time.minute === 0;
    const borderClass = isNoon ? 'border-t-4 border-gray-300' : 'border-t border-slate-100';

    slot.className = `time-slot p-1 md:p-2 text-center text-[10px] md:text-sm ${borderClass} h-10 md:h-14 flex items-center justify-center`;
    slot.dataset.startIso = time.toISO();
    if (isPast) {
        slot.classList.add('past', 'bg-slate-100', 'cursor-not-allowed');
        slot.innerHTML = `<div class="time-label" style="color:#cbd5e1;">${time.toFormat('h:mm')}</div>`;
    }
    return slot;
}

/**
 * Overlays reservation status onto every time slot in the calendar.
 *
 * For each slot, calculates the number of overlapping bookings,
 * total participant count, and blocked-date status. Then sets
 * the slot's visual state:
 * - **blocked** — greyed out with closure reason
 * - **full** — capacity/group limit reached
 * - **partial** — has bookings but still has capacity
 * - **available** — no bookings
 *
 * Also attaches `data-*` attributes (totalParticipants, totalGroups,
 * bookingId, bookingName) that the slot-click handler reads.
 */
export function renderBookingsForSelectedRoom() {
    const roomRules = window.APP_CONFIG.ROOM_CONFIG[state.selectedRoom];
    const roomBookings = state.allBookings.filter(b => b.room === state.selectedRoom);

    // Reservation window: block all slots for non-admin users when closed
    const windowStatus = isReservationWindowOpen();
    const windowClosed = !windowStatus.isOpen && !state.isAdmin;

    document.querySelectorAll('.time-slot').forEach(slotEl => {
        if (slotEl.classList.contains('past')) return;

        const slotStart = DateTime.fromISO(slotEl.dataset.startIso);
        const slotEnd = slotStart.plus({ minutes: window.APP_CONFIG.SLOT_DURATION_MINUTES });
        const borderClass = (slotStart.hour === 12 && slotStart.minute === 0) ? 'border-t-4 border-gray-300' : 'border-t border-slate-100';
        const isPast = slotEl.classList.contains('past');

        // Block all slots when reservation window is closed (non-admin)
        if (windowClosed) {
            slotEl.className = `time-slot p-1 md:p-2 text-center text-[10px] md:text-sm ${borderClass} h-10 md:h-14 flex flex-col items-center justify-center bg-gray-200 text-gray-400 cursor-not-allowed`;
            const isMobile = window.innerWidth < 768;
            const closedLabel = isMobile ? 'Closed' : 'Reservations Closed';
            slotEl.innerHTML = `<div class="time-label" style="color:#94a3b8;">${slotStart.toFormat('h:mm')}</div><div class="status-label font-bold text-gray-500">${closedLabel}</div>`;
            slotEl.classList.add('window-closed');
            return;
        }

        // Block slots outside the bookable date range (non-admin, window open)
        if (!state.isAdmin && windowStatus.bookableStart && windowStatus.bookableEnd) {
            if (slotStart < windowStatus.bookableStart || slotStart > windowStatus.bookableEnd) {
                slotEl.className = `time-slot p-1 md:p-2 text-center text-[10px] md:text-sm ${borderClass} h-10 md:h-14 flex flex-col items-center justify-center bg-gray-200 text-gray-400 cursor-not-allowed`;
                const isMobile = window.innerWidth < 768;
                const outLabel = isMobile ? 'N/A' : 'Outside Reservation Window';
                slotEl.innerHTML = `<div class="time-label" style="color:#94a3b8;">${slotStart.toFormat('h:mm')}</div><div class="status-label font-bold text-gray-500">${outLabel}</div>`;
                slotEl.classList.add('window-closed');
                return;
            }
        }

        const slotDateStr = slotStart.toISODate();
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
            slotEl.classList.add('past');
            return;
        }

        let totalParticipants = 0, totalGroups = 0;
        const overlappingBookings = roomBookings.filter(b => {
            const bStart = parseDate(b.start_iso);
            const bEnd = parseDate(b.end_iso);

            if (!bStart.isValid || !bEnd.isValid) return false;

            return bStart < slotEnd && bEnd > slotStart;
        });

        overlappingBookings.forEach(b => {
            totalParticipants += parseInt(b.participants, 10);
            totalGroups++;
        });
        slotEl.dataset.totalParticipants = totalParticipants;
        slotEl.dataset.totalGroups = totalGroups;

        const primaryBooking = overlappingBookings.find(b => {
            const bStart = parseDate(b.start_iso);
            return bStart.equals(slotStart);
        });

        if (primaryBooking) {
            slotEl.dataset.bookingId = primaryBooking.id;
            slotEl.dataset.bookingName = `${primaryBooking.first_name} ${primaryBooking.last_name}`;
        } else {
            delete slotEl.dataset.bookingId;
            delete slotEl.dataset.bookingName;
        }

        slotEl.className = `time-slot p-1 md:p-2 text-center text-[10px] md:text-sm ${borderClass} h-10 md:h-14 flex flex-col items-center justify-center`;
        if (isPast) {
            slotEl.classList.add('past', 'bg-slate-100', 'text-slate-400', 'cursor-not-allowed');
        }

        const timeLabelHTML = `<div class="time-label">${slotStart.toFormat('h:mm')}</div>`;
        let statusLabelHTML = '';

        if (totalParticipants >= roomRules.MAX_TOTAL_PARTICIPANTS || totalGroups >= roomRules.MAX_CONCURRENT_GROUPS) {
            slotEl.classList.add('full');
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

/**
 * Renders a "Add to Google Calendar" link inside the success modal.
 * Constructs the Google Calendar event URL from the booking details.
 *
 * @param {Object} booking - The booking data with id, event, room, start_iso, end_iso, notes.
 */
export function renderCalendarButtons(booking) {
    const container = document.getElementById('calendar-links-container');
    if (!container) return;

    const fmt = "yyyyMMdd'T'HHmmss";
    const startObj = DateTime.fromISO(booking.start_iso).setZone('Asia/Manila');
    const endObj = DateTime.fromISO(booking.end_iso).setZone('Asia/Manila');

    const startStr = startObj.toFormat(fmt);
    const endStr = endObj.toFormat(fmt);

    const title = encodeURIComponent(`CCF Reservation: ${booking.event}`);
    const location = encodeURIComponent(`CCF Manila - ${booking.room}`);
    const details = encodeURIComponent(`Reservation Ref: ${booking.id}\nNote: ${booking.notes || ''}`);

    const gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}&location=${location}&ctz=Asia/Manila`;

    container.innerHTML = `
        <a href="${gCalUrl}" target="_blank" rel="noopener noreferrer" class="w-full flex items-center justify-center gap-2 px-3 py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 text-sm font-bold transition-colors">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5v-5z"/></svg>
            Add to Google Calendar
        </a>
    `;
}
