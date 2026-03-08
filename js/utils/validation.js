import { ROOM_CAPACITIES } from '../state.js';

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
    if (startTime < DateTime.local()) return 'Cannot create a booking in the past.';

    const now = DateTime.now().setZone(window.APP_CONFIG.TIMEZONE);
    const startZoned = startTime.setZone(window.APP_CONFIG.TIMEZONE);

    const diffInDays = startZoned.startOf('day').diff(now.startOf('day'), 'days').days;
    if (!isAdmin && diffInDays > MAX_ADVANCE_DAYS) {
        return `Regular bookings cannot be made more than ${MAX_ADVANCE_DAYS} days in advance. Please login as Admin.`;
    }

    const diffInHours = startZoned.diff(now, 'hours').hours;
    if (!isAdmin && diffInHours > 0 && diffInHours < MIN_NOTICE_HOURS) {
        return `Regular bookings require at least ${MIN_NOTICE_HOURS} hours notice. Please login as Admin.`;
    }

    if (isAdmin) {
        const maxAdminDate = DateTime.local().plus({ months: MAX_ADMIN_MONTHS });
        if (startTime > maxAdminDate) {
            return `Admins can only book up to ${MAX_ADMIN_MONTHS} months in advance.`;
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
        return `Note: Bookings within ${MIN_NOTICE_HOURS} hours are restricted to Admins.`;
    }

    return null;
}
