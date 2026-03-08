/**
 * @module date
 * @description Date/time parsing and duration calculation utilities.
 *
 * All functions use Luxon's DateTime and respect the application timezone
 * configured in `window.APP_CONFIG.TIMEZONE`.
 */

const DateTime = window.luxon.DateTime;

/**
 * Parses a date input (ISO string, SQL string, or JS Date) into a
 * Luxon DateTime anchored to the application timezone.
 *
 * Handles the backend's convention of appending a trailing 'Z' to
 * Manila-local timestamps by stripping it before parsing, so the
 * value is not re-interpreted as UTC.
 *
 * @param {string|Date} dateInput - An ISO 8601 string, SQL datetime string, or native Date.
 * @returns {DateTime} A valid Luxon DateTime, or `DateTime.invalid()` if parsing fails.
 */
export function parseDate(dateInput) {
    if (!dateInput) return DateTime.invalid('missing data');

    // Strip misleading trailing 'Z' — backend stores Manila time with a 'Z' suffix
    if (typeof dateInput === 'string' && dateInput.endsWith('Z')) {
        dateInput = dateInput.slice(0, -1);
    }

    let dt = DateTime.fromISO(dateInput, { zone: window.APP_CONFIG.TIMEZONE });
    if (dt.isValid) return dt;

    dt = DateTime.fromSQL(dateInput, { zone: window.APP_CONFIG.TIMEZONE });
    if (dt.isValid) return dt;

    const jsDate = new Date(dateInput);
    if (!isNaN(jsDate)) {
        return DateTime.fromJSDate(jsDate, { zone: window.APP_CONFIG.TIMEZONE });
    }

    return DateTime.invalid('unsupported format');
}

/**
 * Calculates the duration in **hours** between a Luxon DateTime start
 * and an end time string (HH:mm format on the same day).
 *
 * @param {DateTime} startTime   - The start DateTime (Luxon).
 * @param {string}   endTimeStr  - End time in "HH:mm" format (e.g. "14:30").
 * @returns {number|null} Duration in hours, or null if inputs are missing.
 */
export function calculateDuration(startTime, endTimeStr) {
    if (!startTime || !endTimeStr) return null;
    const [hours, minutes] = endTimeStr.split(':').map(Number);
    const endTime = startTime.set({ hour: hours, minute: minutes });

    let diff = endTime.diff(startTime, 'hours').hours;
    if (diff < 0) diff += 24; // Handle overnight wrap
    return diff;
}

/**
 * Calculates the duration in **minutes** between a Luxon DateTime start
 * and an end time string (HH:mm format on the same day).
 *
 * @param {DateTime} startTime   - The start DateTime (Luxon).
 * @param {string}   endTimeStr  - End time in "HH:mm" format (e.g. "14:30").
 * @returns {number} Duration in minutes, or 0 if the end time is missing.
 */
export function calculateDurationMinutes(startTime, endTimeStr) {
    if (!endTimeStr) return 0;
    const [hours, minutes] = endTimeStr.split(':').map(Number);
    const endTime = startTime.set({ hour: hours, minute: minutes });
    let diff = endTime.diff(startTime, 'minutes').minutes;
    if (diff < 0) diff += 24 * 60; // Handle overnight wrap
    return diff;
}
