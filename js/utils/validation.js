import { ROOM_CAPACITIES, state } from '../state.js';

const DateTime = window.luxon.DateTime;

// --- Constants ---
const MAX_ADVANCE_DAYS = 7;
const MIN_NOTICE_HOURS = 24;
const MAX_ADMIN_MONTHS = 6;

const COMMON_EMAIL_TYPOS = {
    'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmai.com': 'gmail.com',
    'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com',
    'gmali.com': 'gmail.com', 'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com',
    'yhaoo.com': 'yahoo.com', 'hotmal.com': 'hotmail.com'
};

// --- Helpers ---

/** Strips HTML tags and trims whitespace. */
export function sanitizeInput(str) {
    return str ? str.trim().replace(/<[^>]*>/g, '') : '';
}

/** Returns an error message string if required fields are missing, or null if valid. */
export function validateRequiredFields({ firstName, lastName, email, event, leaderFirstName, leaderLastName, adminPin }, isAdmin) {
    if (isAdmin && !adminPin) return 'Admin PIN is required.';
    if (!isAdmin && (!leaderFirstName || !leaderLastName)) {
        return 'Please fill in all required fields (including Dgroup Leader).';
    }
    if (!firstName || !lastName || !email || !event) return 'Please fill in all required fields.';
    return null;
}

/** Validates email format. Returns error string or null. */
export function validateEmail(email) {
    if (!/^\S+@\S+\.\S+$/.test(email)) return 'Please enter a valid email address.';
    return null;
}

/** Checks if email and confirm email match. Returns error string or null. */
export function validateEmailMatch(email, confirmEmail) {
    if (email.toLowerCase() !== confirmEmail.toLowerCase()) {
        return 'Email addresses do not match. Please re-enter your email.';
    }
    return null;
}

/** Detects common email domain typos. Returns error string or null. */
export function checkEmailTypo(email) {
    const domain = email.split('@')[1]?.toLowerCase();
    if (domain && COMMON_EMAIL_TYPOS[domain]) {
        return `Did you mean <strong>@${COMMON_EMAIL_TYPOS[domain]}</strong>? The domain "@${domain}" looks like a typo.`;
    }
    return null;
}

/** Validates participant count against room rules. Returns error string or null. */
export function validateParticipants(count, rules, isAdmin, roomName) {
    if (count < rules.MIN_BOOKING_SIZE) {
        return `Invalid participant number. Must be at least ${rules.MIN_BOOKING_SIZE}.`;
    }
    if (!isAdmin && count > rules.MAX_BOOKING_SIZE) {
        return `Invalid participant number. Must be between ${rules.MIN_BOOKING_SIZE} and ${rules.MAX_BOOKING_SIZE}.`;
    }
    const maxCapacity = ROOM_CAPACITIES[roomName] || rules.MAX_TOTAL_PARTICIPANTS;
    if (count > maxCapacity) {
        return `Invalid participant number. Admin booking cannot exceed room's total capacity (${maxCapacity}).`;
    }
    return null;
}

/**
 * Validates booking timing constraints.
 * Checks: past booking, advance days restriction, notice hours, admin 6-month limit.
 * Returns error string or null.
 */
export function validateBookingTiming(startTime, isAdmin) {
    if (startTime < DateTime.local()) return 'Cannot create a reservation in the past.';

    const now = DateTime.now().setZone(window.APP_CONFIG.TIMEZONE);
    const startZoned = startTime.setZone(window.APP_CONFIG.TIMEZONE);

    const diffInDays = startZoned.startOf('day').diff(now.startOf('day'), 'days').days;
    if (!isAdmin && diffInDays > MAX_ADVANCE_DAYS) {
        return `Regular reservations cannot be made more than ${MAX_ADVANCE_DAYS} days in advance. Please login as Admin.`;
    }

    const diffInHours = startZoned.diff(now, 'hours').hours;
    if (!isAdmin && diffInHours > 0 && diffInHours < MIN_NOTICE_HOURS) {
        return `Regular reservations require at least ${MIN_NOTICE_HOURS} hours notice. Please login as Admin.`;
    }

    if (isAdmin) {
        const maxAdminDate = DateTime.local().plus({ months: MAX_ADMIN_MONTHS });
        if (startTime > maxAdminDate) {
            return `Admins can only reserve up to ${MAX_ADMIN_MONTHS} months in advance.`;
        }
    }
    return null;
}

/** Validates terms and privacy consent checkboxes. Returns error string or null. */
export function validateConsent(termsChecked, privacyChecked) {
    if (!termsChecked) return 'You must agree to the Terms & Conditions to proceed.';
    if (!privacyChecked) return 'You must consent to the Privacy Policy to proceed.';
    return null;
}

/**
 * Checks if a time slot is restricted and returns a warning message.
 * Used by handleSlotClick to display admin-only warnings.
 * Returns warning string or null.
 */
export function getSlotWarning(slotStartTime) {
    const now = DateTime.now().setZone(window.APP_CONFIG.TIMEZONE);
    const target = slotStartTime.setZone(window.APP_CONFIG.TIMEZONE);

    const diffInDays = target.startOf('day').diff(now.startOf('day'), 'days').days;
    if (diffInDays > MAX_ADVANCE_DAYS) {
        return `Note: Dates beyond ${MAX_ADVANCE_DAYS} days are restricted to Admins.`;
    }

    const diffInHours = target.diff(now, 'hours').hours;
    if (diffInHours < MIN_NOTICE_HOURS && diffInHours > 0) {
        return `Note: Reservations within ${MIN_NOTICE_HOURS} hours are restricted to Admins.`;
    }

    return null;
}

/**
 * Checks if the reservation window is currently open.
 * Uses state.reservationWindow (from server) or falls back to APP_CONFIG defaults.
 *
 * Also computes the bookable date range (Tue→Mon) that users are allowed to book for.
 *
 * @returns {{ isOpen: boolean, message: string, bookableStart: DateTime|null, bookableEnd: DateTime|null }}
 */
export function isReservationWindowOpen() {
    const DateTime = window.luxon.DateTime;
    const now = DateTime.now().setZone(window.APP_CONFIG.TIMEZONE);

    // Use server settings if available, otherwise fall back to config defaults
    const rw = state.reservationWindow || window.APP_CONFIG.RESERVATION_WINDOW;
    if (!rw) return { isOpen: true, message: '', bookableStart: null, bookableEnd: null };

    const openDay = (rw.openDay !== undefined) ? Number(rw.openDay) : (rw.OPEN_DAY || 0);
    const openTime = String(rw.openTime || rw.OPEN_TIME || '08:00');
    const closeDay = (rw.closeDay !== undefined) ? Number(rw.closeDay) : (rw.CLOSE_DAY || 1);
    const closeTime = String(rw.closeTime || rw.CLOSE_TIME || '20:00');

    /**
     * Returns the next occurrence of a specific weekday + time as a Luxon DateTime.
     * @param {number} targetDay 0=Sun, 1=Mon, ..., 6=Sat
     * @param {string} timeStr "HH:mm"
     * @returns {DateTime}
     */
    function getNextOccurrence(targetDay, timeStr) {
        const [hour, minute] = timeStr.split(':').map(Number);
        let target = now.set({ hour, minute, second: 0, millisecond: 0 });

        const nowDay = now.weekday === 7 ? 0 : now.weekday; // match 0=Sun convention
        let daysToAdd = targetDay - nowDay;
        if (daysToAdd < 0) daysToAdd += 7;

        target = target.plus({ days: daysToAdd });

        if (target <= now) {
            target = target.plus({ days: 7 });
        }

        return target;
    }

    /**
     * Computes the bookable Tue→Mon range based on a given close DateTime.
     * bookableStart = the next Tuesday on or after closeDateTime
     * bookableEnd   = bookableStart + 6 days (Monday) at 23:59
     */
    function computeBookableRange(closeDateTime) {
        // Luxon weekday: 1=Mon, 2=Tue, ..., 7=Sun
        const TUESDAY = 2;
        let daysToTuesday = (TUESDAY - closeDateTime.weekday + 7) % 7;
        if (daysToTuesday === 0) daysToTuesday = 7; // if close day IS Tuesday, go to next Tue
        const bookableStart = closeDateTime.plus({ days: daysToTuesday }).startOf('day');
        const bookableEnd = bookableStart.plus({ days: 6 }).endOf('day');
        return { bookableStart, bookableEnd };
    }

    const fmtDate = "cccc, MMMM d, yyyy h:mm a 'GMT+8'";
    const fmtShort = "MMMM d";

    // Determine current state based on server flag if it exists, otherwise compute locally
    let isOpen = false;
    if (rw.isOpen !== undefined) {
        isOpen = rw.isOpen;
    } else {
        const currentDay = now.weekday === 7 ? 0 : now.weekday;
        const currentMinutes = now.hour * 60 + now.minute;
        const currentWeekMinute = currentDay * 1440 + currentMinutes;

        const [openH, openM] = openTime.split(':').map(Number);
        const [closeH, closeM] = closeTime.split(':').map(Number);
        const openWeekMinute = openDay * 1440 + (openH * 60 + openM);
        const closeWeekMinute = closeDay * 1440 + (closeH * 60 + closeM);

        if (openWeekMinute <= closeWeekMinute) {
            isOpen = currentWeekMinute >= openWeekMinute && currentWeekMinute < closeWeekMinute;
        } else {
            isOpen = currentWeekMinute >= openWeekMinute || currentWeekMinute < closeWeekMinute;
        }
    }

    if (isOpen) {
        const closeDateTime = getNextOccurrence(closeDay, closeTime);
        const { bookableStart, bookableEnd } = computeBookableRange(closeDateTime);
        return {
            isOpen: true,
            bookableStart,
            bookableEnd,
            message: `Reservations are open until ${closeDateTime.toFormat(fmtDate)}. Reservations accepted for ${bookableStart.toFormat(fmtShort)} – ${bookableEnd.toFormat(fmtShort)} only.`
        };
    } else {
        const nextOpen = getNextOccurrence(openDay, openTime);
        // Compute a future close DateTime after the next open
        const [closeH, closeM] = closeTime.split(':').map(Number);
        let futureClose = nextOpen.set({ hour: closeH, minute: closeM, second: 0 });
        const futureCloseNowDay = futureClose.weekday === 7 ? 0 : futureClose.weekday;
        let daysToCloseDay = closeDay - (nextOpen.weekday === 7 ? 0 : nextOpen.weekday);
        if (daysToCloseDay < 0) daysToCloseDay += 7;
        if (daysToCloseDay === 0 && futureClose <= nextOpen) daysToCloseDay = 7;
        futureClose = nextOpen.plus({ days: daysToCloseDay }).set({ hour: closeH, minute: closeM, second: 0 });

        const { bookableStart, bookableEnd } = computeBookableRange(futureClose);
        return {
            isOpen: false,
            bookableStart,
            bookableEnd,
            message: `Reservations are closed. Next opening: ${nextOpen.toFormat(fmtDate)} (for ${bookableStart.toFormat(fmtShort)} – ${bookableEnd.toFormat(fmtShort)}). You may still cancel existing reservations via the link in your email confirmation.`
        };
    }
}
