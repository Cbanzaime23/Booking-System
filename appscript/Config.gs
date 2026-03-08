// ============================================================================
// Config.gs — Global Constants & Room Configuration
// ============================================================================
// All shared configuration values used across the other modules.
// In Google Apps Script, all .gs files share the same global scope,
// so these constants are automatically available to all other files.
// ============================================================================

/** @const {string} Google Sheets spreadsheet ID containing all booking data. */
const SPREADSHEET_ID = '13SROZHNchpiGKpgSc6bpxbuf2Fhw0AMIAcQyC48BKkM';
/** @const {string} Name of the sheet tab that stores booking rows. */
const SHEET_NAME = 'Bookings';
/** @const {string} Name of the sheet tab that stores blocked date entries. */
const BLOCKED_SHEET_NAME = 'BlockedDates';
/** @const {string} Name of the sheet tab that stores global settings (announcements). */
const SETTINGS_SHEET_NAME = 'Settings';
/** @const {string} Name of the sheet tab for audit log entries. */
const LOGS_SHEET_NAME = 'Logs';
/** @const {string} IANA timezone used for all date formatting in the backend. */
const SCRIPT_TIMEZONE = "Asia/Manila";
/** @const {string} Display name shown as the sender in all outgoing emails. */
const EMAIL_SENDER_NAME = "CCF Manila Room Reservation System";

// --- EXTERNAL RESOURCES ---
/** @const {string} External Spreadsheet ID containing the CCF Manila Dleaders Name Reference list. */
const DLEADERS_SPREADSHEET_ID = '1ri8268kl9lk08DD_BMGOSveB7oygnOLgI0wTQwZ1l1c';

/** @const {string} Google Form URL for the feedback survey. `${bookingCode}` is replaced at runtime. */
const SURVEY_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSfEZsWJRYGRh0Jqr6_L9Cw3OGcew6TGGV0YxM0cRTuB4GuJ3A/viewform?usp=pp_url&entry.1009510910=${bookingCode}";

/** @const {string} Admin PIN required for privileged operations. */
const ADMIN_PIN = "CCFManila@2025";

/** @const {number} Number of days after which personal booking data is auto-anonymized. */
const RETENTION_DAYS = 365;

/**
 * Room-level rules for capacity, concurrency, and group size.
 * Each key is a room name; values define the constraints
 * enforced during booking creation.
 * @const {Object.<string, {MAX_TOTAL_PARTICIPANTS: number, MAX_CONCURRENT_GROUPS: number, MIN_BOOKING_SIZE: number, MAX_BOOKING_SIZE: number}>}
 */
const ROOM_CONFIG = {
    "Main Hall": {
        MAX_TOTAL_PARTICIPANTS: 55,
        MAX_CONCURRENT_GROUPS: 6,
        MIN_BOOKING_SIZE: 2,
        MAX_BOOKING_SIZE: 25
    },
    "Jonah": {
        MAX_TOTAL_PARTICIPANTS: 20,
        MAX_CONCURRENT_GROUPS: 2,
        MIN_BOOKING_SIZE: 2,
        MAX_BOOKING_SIZE: 10
    },
    "Joseph": {
        MAX_TOTAL_PARTICIPANTS: 15,
        MAX_CONCURRENT_GROUPS: 1,
        MIN_BOOKING_SIZE: 2,
        MAX_BOOKING_SIZE: 15
    },
    "Moses": {
        MAX_TOTAL_PARTICIPANTS: 15,
        MAX_CONCURRENT_GROUPS: 1,
        MIN_BOOKING_SIZE: 2,
        MAX_BOOKING_SIZE: 15
    }
};
