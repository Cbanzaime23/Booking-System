// ============================================================================
// Utils.gs — Shared Utility Functions
// ============================================================================
// Small, reusable helpers: UUID generation, input validation, audit logging,
// and date calculation helpers for recurrence.
// ============================================================================

/**
 * Generates a RFC4122 v4-compliant UUID string.
 * @returns {string} A 36-character UUID (e.g. '550e8400-e29b-41d4-a716-446655440000').
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Server-side input validation for booking payloads.
 * Checks required fields, group size limits, email format, date validity,
 * and advance-booking restrictions (7 days for users, 6 months for admins).
 *
 * @param {Object}  data    - The booking payload.
 * @param {Object}  rules   - Room rules (MAX_TOTAL_PARTICIPANTS, etc.).
 * @param {boolean} isAdmin - Whether the request is admin-authenticated.
 * @returns {string|null} Error message string, or null if valid.
 */
function validateInput(data, rules, isAdmin) {
    let requiredFields;
    if (isAdmin) {
        requiredFields = ['first_name', 'last_name', 'email', 'event', 'participants', 'start_iso', 'end_iso', 'room'];
    } else {
        requiredFields = ['first_name', 'last_name', 'email', 'leader_first_name', 'leader_last_name', 'event', 'participants', 'start_iso', 'end_iso', 'room'];
    }
    for (const field of requiredFields) {
        if (!data[field]) { return `Missing required field: ${field}.`; }
    }

    if (!isAdmin) {
        if (data.participants < rules.MIN_BOOKING_SIZE || data.participants > rules.MAX_BOOKING_SIZE) {
            return `Invalid group size for ${data.room}. Participants must be between ${rules.MIN_BOOKING_SIZE} and ${rules.MAX_BOOKING_SIZE}.`;
        }
    } else {
        if (data.participants < rules.MIN_BOOKING_SIZE) {
            return `Invalid group size. Must be at least ${rules.MIN_BOOKING_SIZE}.`;
        }
    }

    if (!/^\S+@\S+\.\S+$/.test(data.email)) return "Invalid email format.";
    const start = new Date(data.start_iso);
    const end = new Date(data.end_iso);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return "Invalid date format.";
    if (start >= end) return "Start time must be before end time.";

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today);
    if (isAdmin) {
        maxDate.setMonth(maxDate.getMonth() + 6);
    } else {
        maxDate.setDate(maxDate.getDate() + 7);
    }
    if (start < today) return "Cannot create a booking in the past.";
    if (start > maxDate) return isAdmin ? "Admins can only book up to 6 months in advance." : "Users can only book up to 7 days in advance.";
    return null;
}

/**
 * Appends an audit log row to the Logs sheet.
 * Creates the Logs sheet with headers if it doesn't exist.
 * Silently swallows errors to avoid breaking the main operation.
 *
 * @param {string} action    - The action being logged (e.g. 'Create', 'Cancel', 'GDPR_EXPORT').
 * @param {string} bookingId - The booking ID related to this action.
 * @param {string} adminPin  - The admin PIN used (or 'N/A').
 * @param {Object} details   - Additional details to store as JSON.
 */
function logActivity(action, bookingId, adminPin, details) {
    try {
        const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        let sheet = ss.getSheetByName(LOGS_SHEET_NAME);
        if (!sheet) {
            sheet = ss.insertSheet(LOGS_SHEET_NAME);
            sheet.appendRow(["Timestamp", "Action", "Booking ID", "Admin PIN", "Details"]);
        }

        const timestamp = new Date();
        const detailsStr = (typeof details === 'object') ? JSON.stringify(details) : String(details);
        sheet.appendRow([timestamp, action, bookingId, adminPin || 'N/A', detailsStr]);
    } catch (e) {
        Logger.log("Logging failed: " + e.message);
    }
}

/**
 * Returns the first occurrence of a given day-of-week in a month.
 * Used by recurrence logic for patterns like "first Wednesday".
 *
 * @param {Date}   date      - Any date within the target month.
 * @param {number} dayOfWeek - JS day-of-week (0=Sunday, 1=Monday, ..., 6=Saturday).
 * @returns {Date} The date of the first matching weekday in that month.
 */
function findFirstDayOfWeekOfMonth(date, dayOfWeek) {
    const d = new Date(date.getFullYear(), date.getMonth(), 1);
    while (d.getDay() !== dayOfWeek) {
        d.setDate(d.getDate() + 1);
    }
    return d;
}

/**
 * Returns the last occurrence of a given day-of-week in a month.
 * Used by recurrence logic for patterns like "last Saturday".
 *
 * @param {Date}   date      - Any date within the target month.
 * @param {number} dayOfWeek - JS day-of-week (0=Sunday, 1=Monday, ..., 6=Saturday).
 * @returns {Date} The date of the last matching weekday in that month.
 */
function findLastDayOfWeekOfMonth(date, dayOfWeek) {
    const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    while (d.getDay() !== dayOfWeek) {
        d.setDate(d.getDate() - 1);
    }
    return d;
}
