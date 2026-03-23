// ============================================================================
// Database.gs — Google Sheets Data Access Layer
// ============================================================================
// All functions that read from or write to the Google Sheets database.
// Handles booking rows, blocked dates, settings, and concurrent booking queries.
// ============================================================================

/**
 * Reads all confirmed bookings from the Bookings sheet.
 * Normalizes Date objects to ISO strings in Manila timezone.
 *
 * @param {Sheet} sheet - The Bookings sheet reference.
 * @returns {Array<Object>} Array of booking objects with id, start_iso, end_iso, participantCount, room, email, etc.
 * @throws {Error} If the sheet is missing required columns.
 */
function getActiveBookings(sheet) {
    const values = sheet.getDataRange().getValues();
    const headers = values.shift();
    const startIsoIndex = headers.indexOf('start_iso');
    const endIsoIndex = headers.indexOf('end_iso');
    const statusIndex = headers.indexOf('status');
    const participantsIndex = headers.indexOf('participants');
    const idIndex = headers.indexOf('id');
    const firstNameIndex = headers.indexOf('first_name');
    const lastNameIndex = headers.indexOf('last_name');
    const roomIndex = headers.indexOf('room');
    const emailIndex = headers.indexOf('email');
    const tableIndex = headers.indexOf('table_id');

    if ([startIsoIndex, endIsoIndex, statusIndex, participantsIndex, idIndex, firstNameIndex, lastNameIndex, roomIndex].some(i => i === -1)) {
        throw new Error("Sheet is missing required columns. Check: id, start_iso, end_iso, status, participants, first_name, last_name, room.");
    }

    return values
        .filter(row => row[statusIndex] === 'confirmed' && row[startIsoIndex])
        .map(row => {
            let startIsoValue = row[startIsoIndex];
            let endIsoValue = row[endIsoIndex];

            if (startIsoValue instanceof Date) {
                startIsoValue = Utilities.formatDate(startIsoValue, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss'Z'");
            }
            if (endIsoValue instanceof Date) {
                endIsoValue = Utilities.formatDate(endIsoValue, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss'Z'");
            }

            return {
                id: row[idIndex],
                start_iso: startIsoValue,
                end_iso: endIsoValue,
                participantCount: parseInt(row[participantsIndex], 10) || 0,
                first_name: row[firstNameIndex],
                last_name: row[lastNameIndex],
                participants: row[participantsIndex],
                room: row[roomIndex],
                email: emailIndex !== -1 ? row[emailIndex] : '',
                table_id: tableIndex !== -1 ? row[tableIndex] : ''
            };
        });
}

/**
 * Appends a new booking row to the Bookings sheet.
 * Automatically adds a `recurrence_id` column if it doesn't exist yet.
 *
 * @param {Sheet}       sheet        - The Bookings sheet reference.
 * @param {string}      id           - The generated UUID for this booking.
 * @param {Object}      payload      - The booking payload from the API request.
 * @param {Date}        startDate    - The booking start date/time.
 * @param {Date}        endDate      - The booking end date/time.
 * @param {string|null} [recurrenceId=null] - ID linking recurrent bookings.
 */
function appendBookingRow(sheet, id, payload, startDate, endDate, recurrenceId = null) {
    const formattedStartIso = Utilities.formatDate(startDate, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss'Z'");
    const formattedEndIso = Utilities.formatDate(endDate, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss'Z'");

    // Ensure recurrence_id header exists (auto-migration)
    const lastColCtx = sheet.getLastColumn();
    if (lastColCtx > 0) {
        const headerVal = sheet.getRange(1, lastColCtx).getValue();
        if (headerVal !== 'recurrence_id' && headerVal !== 'consent_timestamp' && headerVal !== 'table_id') {
            const headers = sheet.getRange(1, 1, 1, lastColCtx).getValues()[0];
            if (headers.indexOf('recurrence_id') === -1) {
                sheet.getRange(1, lastColCtx + 1).setValue('recurrence_id');
                sheet.getRange(1, lastColCtx + 2).setValue('table_id');
            } else if (headers.indexOf('table_id') === -1) {
                sheet.getRange(1, lastColCtx + 1).setValue('table_id');
            }
        } else if (headerVal === 'consent_timestamp') {
            sheet.getRange(1, lastColCtx + 1).setValue('recurrence_id');
            sheet.getRange(1, lastColCtx + 2).setValue('table_id');
        } else if (headerVal === 'recurrence_id') {
            sheet.getRange(1, lastColCtx + 1).setValue('table_id');
        }
    }

    const newRow = [
        id,
        Utilities.formatDate(startDate, SCRIPT_TIMEZONE, "yyyy-MM-dd"),
        formattedStartIso,
        formattedEndIso,
        payload.first_name, payload.last_name, payload.email,
        payload.leader_first_name || '', payload.leader_last_name || '',
        payload.event, payload.room, payload.participants, 'confirmed',
        new Date(), payload.notes || '',
        payload.terms_accepted ? "TRUE" : "FALSE",
        payload.privacy_accepted ? "TRUE" : "FALSE",
        payload.consent_timestamp || '',
        recurrenceId || '',
        payload.table_id || ''
    ];
    sheet.appendRow(newRow);
}

/**
 * Finds all confirmed bookings that overlap with a given time range in a specific room.
 * Used for conflict detection during booking creation and move operations.
 *
 * @param {Date}   newStart    - Start of the proposed time range.
 * @param {Date}   newEnd      - End of the proposed time range.
 * @param {Array}  allBookings - Array of active booking objects.
 * @param {string} roomName    - The room to check for overlaps.
 * @returns {Array<Object>} Overlapping booking objects.
 */
function findConcurrentBookings(newStart, newEnd, allBookings, roomName) {
    const newStartTime = newStart.getTime();
    const newEndTime = newEnd.getTime();
    return allBookings.filter(booking => {
        if (booking.room !== roomName) return false;
        const existingStartTime = new Date(booking.start_iso).getTime();
        const existingEndTime = new Date(booking.end_iso).getTime();
        return newStartTime < existingEndTime && newEndTime > existingStartTime;
    });
}

/**
 * Reads all blocked date entries from the BlockedDates sheet.
 *
 * @param {Spreadsheet} ss - The spreadsheet reference.
 * @returns {Array<{date: string, room: string, reason: string}>} Array of blocked date objects.
 */
function getBlockedDates(ss) {
    const sheet = ss.getSheetByName(BLOCKED_SHEET_NAME);
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    data.shift(); // Remove header

    return data.map(row => {
        let dateStr = row[0];
        if (dateStr instanceof Date) {
            dateStr = Utilities.formatDate(dateStr, SCRIPT_TIMEZONE, "yyyy-MM-dd");
        }
        return {
            date: dateStr,
            room: row[1],
            reason: row[2]
        };
    });
}

/**
 * Checks if a specific date and room combination is blocked.
 *
 * @param {Date}   dateObj      - The date to check.
 * @param {string} roomName     - The room to check.
 * @param {Array}  blockedDates - Array of blocked date objects from getBlockedDates.
 * @returns {Object|undefined} The matching blocked date entry, or undefined if not blocked.
 */
function checkIsBlocked(dateObj, roomName, blockedDates) {
    const dateStr = Utilities.formatDate(dateObj, SCRIPT_TIMEZONE, "yyyy-MM-dd");
    return blockedDates.find(b => {
        if (b.date !== dateStr) return false;
        if (b.room === "All Rooms" || b.room === roomName) return true;
        return false;
    });
}

/**
 * Reads global settings (announcement banner) from the Settings sheet.
 * Supports date-ranged announcements with optional start/end dates.
 *
 * @param {Spreadsheet} ss - The spreadsheet reference.
 * @returns {{message: string, isActive: boolean}} Settings object.
 */
function getGlobalSettings(ss) {
    const sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
    const settings = { message: '', isActive: false };

    if (!sheet) return settings;

    const data = sheet.getDataRange().getValues();
    const map = {};
    data.forEach(row => {
        if (row[0]) map[row[0].toString().trim()] = row[1];
    });

    const rawMessage = map['Announcement Message'];
    const rawActive = map['Announcement Active'];
    const rawStart = map['Announcement Start'];
    const rawEnd = map['Announcement End'];

    let isActive = false;
    if (rawActive === true) isActive = true;
    if (typeof rawActive === 'string' && rawActive.toUpperCase() === 'TRUE') isActive = true;

    if (isActive) {
        const now = new Date();
        let inRange = true;

        const hasStart = rawStart && (rawStart instanceof Date || rawStart.toString().trim() !== '');
        const hasEnd = rawEnd && (rawEnd instanceof Date || rawEnd.toString().trim() !== '');

        if (hasStart && hasEnd) {
            const start = new Date(rawStart);
            const end = new Date(rawEnd);
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                if (now < start || now > end) {
                    inRange = false;
                }
            }
        }

        if (inRange) {
            settings.message = rawMessage;
            settings.isActive = true;
        }
    }

    return settings;
}

/**
 * Reads reservation window settings from the Settings sheet.
 *
 * @param {Spreadsheet} ss - The spreadsheet reference.
 * @returns {{openDay: number, openTime: string, closeDay: number, closeTime: string}}
 */
function getReservationWindowSettings(ss) {
    const defaults = { openDay: 0, openTime: '08:00', closeDay: 1, closeTime: '20:00' };
    const sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
    if (!sheet) return defaults;

    const data = sheet.getDataRange().getValues();
    const map = {};
    data.forEach(row => {
        if (row[0]) map[row[0].toString().trim()] = row[1];
    });

    /**
     * Safely converts a Sheets cell value to an "HH:mm" time string.
     * Google Sheets may return Date objects for time-formatted cells.
     */
    function toTimeString(val, fallback) {
        if (!val && val !== 0) return fallback;
        if (val instanceof Date) {
            return Utilities.formatDate(val, SCRIPT_TIMEZONE, 'HH:mm');
        }
        return String(val);
    }

    return {
        openDay:   (map['Reservation Window Open Day'] !== undefined) ? parseInt(map['Reservation Window Open Day'], 10) : defaults.openDay,
        openTime:  toTimeString(map['Reservation Window Open Time'], defaults.openTime),
        closeDay:  (map['Reservation Window Close Day'] !== undefined) ? parseInt(map['Reservation Window Close Day'], 10) : defaults.closeDay,
        closeTime: toTimeString(map['Reservation Window Close Time'], defaults.closeTime)
    };
}

/**
 * Saves reservation window settings to the Settings sheet.
 * Updates existing rows or appends new ones.
 *
 * @param {Spreadsheet} ss - The spreadsheet reference.
 * @param {{openDay: number, openTime: string, closeDay: number, closeTime: string}} settings
 */
function saveReservationWindowSettings(ss, settings) {
    let sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
    if (!sheet) {
        sheet = ss.insertSheet(SETTINGS_SHEET_NAME);
        sheet.appendRow(['Key', 'Value']);
    }

    const data = sheet.getDataRange().getValues();
    const keyMap = {
        'Reservation Window Open Day': settings.openDay,
        'Reservation Window Open Time': settings.openTime,
        'Reservation Window Close Day': settings.closeDay,
        'Reservation Window Close Time': settings.closeTime
    };

    // Update existing rows or track which keys need to be appended
    const keysToAppend = { ...keyMap };
    for (let i = 0; i < data.length; i++) {
        const key = data[i][0] ? data[i][0].toString().trim() : '';
        if (keyMap.hasOwnProperty(key)) {
            sheet.getRange(i + 1, 2).setValue(keyMap[key]);
            delete keysToAppend[key];
        }
    }

    // Append any keys that weren't found
    Object.keys(keysToAppend).forEach(key => {
        sheet.appendRow([key, keysToAppend[key]]);
    });
}

/**
 * Checks if the reservation window is currently open.
 * Uses Manila timezone for all calculations.
 *
 * @param {{openDay: number, openTime: string, closeDay: number, closeTime: string}} windowSettings
 * @returns {boolean} True if window is currently open.
 */
function isReservationWindowCurrentlyOpen(windowSettings) {
    const now = new Date();
    const manilaOffset = 8 * 60; // UTC+8
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const manilaTime = new Date(utcMs + (manilaOffset * 60000));

    const currentDay = manilaTime.getDay(); // 0=Sun, 1=Mon, ...
    const currentMinutes = manilaTime.getHours() * 60 + manilaTime.getMinutes();

    const [openH, openM] = windowSettings.openTime.split(':').map(Number);
    const [closeH, closeM] = windowSettings.closeTime.split(':').map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    const openDay = windowSettings.openDay;
    const closeDay = windowSettings.closeDay;

    // Convert to a weekly minute offset (0 = Sunday 00:00, max = Saturday 23:59)
    const currentWeekMinute = currentDay * 1440 + currentMinutes;
    const openWeekMinute = openDay * 1440 + openMinutes;
    const closeWeekMinute = closeDay * 1440 + closeMinutes;

    if (openWeekMinute <= closeWeekMinute) {
        // Normal range: open and close within the same week span
        return currentWeekMinute >= openWeekMinute && currentWeekMinute < closeWeekMinute;
    } else {
        // Wraps around the week boundary (e.g., Sat → Mon)
        return currentWeekMinute >= openWeekMinute || currentWeekMinute < closeWeekMinute;
    }
}
/**
 * Deletes a matching blocked date entry from the BlockedDates sheet.
 *
 * @param {Spreadsheet} ss     - The spreadsheet reference.
 * @param {string}      date   - The date to match.
 * @param {string}      room   - The room to match.
 * @param {string}      reason - The reason to match.
 * @throws {Error} If the blocked dates sheet is missing or the entry is not found.
 */
function deleteBlockedDateRow(ss, date, room, reason) {
    const sheet = ss.getSheetByName(BLOCKED_SHEET_NAME);
    if (!sheet) throw new Error("BlockedDates sheet not found.");

    const data = sheet.getDataRange().getValues();
    // Headers are at data[0]
    
    for (let i = 1; i < data.length; i++) {
        let rowDate = data[i][0];
        if (rowDate instanceof Date) {
            rowDate = Utilities.formatDate(rowDate, SCRIPT_TIMEZONE, "yyyy-MM-dd");
        }
        
        const rowRoom = data[i][1];
        const rowReason = data[i][2];

        if (rowDate === date && rowRoom === room && rowReason === reason) {
            sheet.deleteRow(i + 1);
            return;
        }
    }
    
    throw new Error("Specified blocked date entry not found.");
}
