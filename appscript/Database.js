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
    const eventIndex = headers.indexOf('event');
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
                event: eventIndex !== -1 ? row[eventIndex] : '',
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

    // Ensure required headers exist (auto-migration)
    const lastColCtx = sheet.getLastColumn();
    if (lastColCtx > 0) {
        const headers = sheet.getRange(1, 1, 1, lastColCtx).getValues()[0];
        const requiredHeaders = ['recurrence_id', 'table_id', 'is_admin_booking'];
        let nextCol = lastColCtx + 1;
        requiredHeaders.forEach(h => {
            if (headers.indexOf(h) === -1) {
                sheet.getRange(1, nextCol).setValue(h);
                nextCol++;
            }
        });
    }

    const newRow = [
        id,
        Utilities.formatDate(startDate, SCRIPT_TIMEZONE, "yyyy-MM-dd"),
        formattedStartIso,
        formattedEndIso,
        payload.first_name, payload.last_name, payload.email,
        '', '', // leader_first_name, leader_last_name — deprecated, kept for backward compat
        payload.event, payload.room, payload.participants, 'confirmed',
        new Date(), payload.notes || '',
        payload.terms_accepted ? "TRUE" : "FALSE",
        payload.privacy_accepted ? "TRUE" : "FALSE",
        payload.consent_timestamp || '',
        recurrenceId || '',
        payload.table_id || '',
        payload.is_admin_booking ? "TRUE" : "FALSE"
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
        // Fix: Strip misleading 'Z' suffix — stored times are Manila local, not UTC.
        // Append the correct +08:00 offset so they are parsed as Asia/Manila.
        const cleanStart = String(booking.start_iso).replace(/Z$/i, '');
        const cleanEnd = String(booking.end_iso).replace(/Z$/i, '');
        const existingStartTime = new Date(cleanStart + '+08:00').getTime();
        const existingEndTime = new Date(cleanEnd + '+08:00').getTime();
        return newStartTime < existingEndTime && newEndTime > existingStartTime;
    });
}

/**
 * Reads all blocked date entries from the BlockedDates sheet.
 * Supports optional Start Time and End Time columns (backward-compatible).
 *
 * @param {Spreadsheet} ss - The spreadsheet reference.
 * @returns {Array<{date: string, room: string, reason: string, start_time: string, end_time: string}>} Array of blocked date objects.
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

        // Read optional time columns (col 3 = Start Time, col 4 = End Time)
        let startTime = row[3] || '';
        let endTime = row[4] || '';
        if (startTime instanceof Date) {
            startTime = Utilities.formatDate(startTime, SCRIPT_TIMEZONE, "HH:mm");
        } else {
            startTime = String(startTime).trim();
        }
        if (endTime instanceof Date) {
            endTime = Utilities.formatDate(endTime, SCRIPT_TIMEZONE, "HH:mm");
        } else {
            endTime = String(endTime).trim();
        }

        return {
            date: dateStr,
            room: row[1],
            reason: row[2],
            start_time: startTime,
            end_time: endTime
        };
    });
}

/**
 * Checks if a specific date/time and room combination is blocked.
 * If the blocked entry has start_time/end_time, checks for time overlap.
 * If no times are set, the entire day is blocked.
 *
 * @param {Date}   dateObj      - The booking start date/time to check.
 * @param {string} roomName     - The room to check.
 * @param {Array}  blockedDates - Array of blocked date objects from getBlockedDates.
 * @param {Date}   [endDateObj] - Optional booking end date/time for time-range overlap check.
 * @returns {Object|undefined} The matching blocked date entry, or undefined if not blocked.
 */
function checkIsBlocked(dateObj, roomName, blockedDates, endDateObj) {
    const dateStr = Utilities.formatDate(dateObj, SCRIPT_TIMEZONE, "yyyy-MM-dd");
    return blockedDates.find(b => {
        if (b.date !== dateStr) return false;
        if (b.room !== "All Rooms" && b.room !== roomName) return false;

        // If the blocked entry has time range, check for overlap
        if (b.start_time && b.end_time) {
            const bookingStartMinutes = dateObj.getHours() * 60 + dateObj.getMinutes();
            const [bStartH, bStartM] = b.start_time.split(':').map(Number);
            const [bEndH, bEndM] = b.end_time.split(':').map(Number);
            const blockedStartMinutes = bStartH * 60 + bStartM;
            const blockedEndMinutes = bEndH * 60 + bEndM;

            let bookingEndMinutes;
            if (endDateObj) {
                bookingEndMinutes = endDateObj.getHours() * 60 + endDateObj.getMinutes();
                // Handle midnight crossover
                if (bookingEndMinutes === 0) bookingEndMinutes = 1440;
            } else {
                // If no end time provided, assume 1-hour booking
                bookingEndMinutes = bookingStartMinutes + 60;
            }

            // Standard overlap check: two ranges overlap if start1 < end2 AND start2 < end1
            return bookingStartMinutes < blockedEndMinutes && blockedStartMinutes < bookingEndMinutes;
        }

        // No time range = entire day is blocked
        return true;
    });
}

/**
 * Reads global settings (announcement banner) from the Settings sheet.
 * Supports date-ranged announcements with optional start/end dates.
 *
 * @param {Spreadsheet} ss - The spreadsheet reference.
 * @returns {{message: string, isActive: boolean, startDate: string, endDate: string}} Settings object.
 */
function getGlobalSettings(ss) {
    const sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
    const settings = { message: '', isActive: false, startDate: '', endDate: '' };

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

    // Always return the raw message text and dates for the admin form
    settings.message = rawMessage || '';

    // Format start/end dates for the admin form
    if (rawStart && rawStart instanceof Date && !isNaN(rawStart.getTime())) {
        settings.startDate = Utilities.formatDate(rawStart, SCRIPT_TIMEZONE, 'yyyy-MM-dd');
    } else if (rawStart && rawStart.toString().trim() !== '') {
        settings.startDate = rawStart.toString().trim();
    }
    if (rawEnd && rawEnd instanceof Date && !isNaN(rawEnd.getTime())) {
        settings.endDate = Utilities.formatDate(rawEnd, SCRIPT_TIMEZONE, 'yyyy-MM-dd');
    } else if (rawEnd && rawEnd.toString().trim() !== '') {
        settings.endDate = rawEnd.toString().trim();
    }

    let isActive = false;
    if (rawActive === true) isActive = true;
    if (typeof rawActive === 'string' && rawActive.toUpperCase() === 'TRUE') isActive = true;
    settings.isActive = isActive;

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

        // If currently out of range, the banner won't show, but isActive stays true for the admin form
        if (!inRange) {
            settings.isActive = false; // Banner not active for public
            settings.isActiveRaw = true; // But the toggle IS checked in the settings sheet
        }
    }

    return settings;
}

/**
 * Saves Announcement Settings to the Settings sheet.
 * Updates existing rows or appends new ones.
 *
 * @param {Spreadsheet} ss - The spreadsheet reference.
 * @param {string} message - The announcement text.
 * @param {boolean} isActive - Whether the announcement is active.
 * @param {string} startDate - The announcement start date (yyyy-MM-dd).
 * @param {string} endDate - The announcement end date (yyyy-MM-dd).
 */
function saveGlobalSettings(ss, message, isActive, startDate, endDate) {
    let sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
    if (!sheet) {
        sheet = ss.insertSheet(SETTINGS_SHEET_NAME);
        sheet.appendRow(['Setting Name', 'Setting Value']);
    }

    const data = sheet.getDataRange().getValues();
    const keyMap = {
        'Announcement Message': message,
        'Announcement Active': isActive ? 'TRUE' : 'FALSE',
        'Announcement Start': startDate || '',
        'Announcement End': endDate || ''
    };

    // Update existing rows
    const keysLeft = { ...keyMap };
    for (let i = 1; i < data.length; i++) {
        const rowKey = (data[i][0] || '').toString().trim();
        if (keysLeft[rowKey] !== undefined) {
            sheet.getRange(i + 1, 2).setValue(keysLeft[rowKey]);
            delete keysLeft[rowKey];
        }
    }

    // Append missing rows
    for (const [key, value] of Object.entries(keysLeft)) {
        sheet.appendRow([key, value]);
    }
}

/**
 * Extracts raw data from the Logs sheet.
 * @param {Spreadsheet} ss - The spreadsheet reference.
 * @returns {Array<Array<any>>} The raw 2D array of log data.
 */
function getRawLogsData(ss) {
    const sheet = ss.getSheetByName(LOGS_SHEET_NAME);
    if (!sheet) return [];
    
    // We only need the raw data arrays, skipping completely empty rows
    const rawData = sheet.getDataRange().getDisplayValues();
    return rawData;
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
 * Matches on date, room, reason, and optionally start_time/end_time.
 *
 * @param {Spreadsheet} ss         - The spreadsheet reference.
 * @param {string}      date       - The date to match.
 * @param {string}      room       - The room to match.
 * @param {string}      reason     - The reason to match.
 * @param {string}      [startTime] - The start time to match (optional).
 * @param {string}      [endTime]   - The end time to match (optional).
 * @throws {Error} If the blocked dates sheet is missing or the entry is not found.
 */
function deleteBlockedDateRow(ss, date, room, reason, startTime, endTime) {
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

        // Normalize time values for comparison
        let rowStartTime = data[i][3] || '';
        let rowEndTime = data[i][4] || '';
        if (rowStartTime instanceof Date) {
            rowStartTime = Utilities.formatDate(rowStartTime, SCRIPT_TIMEZONE, "HH:mm");
        } else {
            rowStartTime = String(rowStartTime).trim();
        }
        if (rowEndTime instanceof Date) {
            rowEndTime = Utilities.formatDate(rowEndTime, SCRIPT_TIMEZONE, "HH:mm");
        } else {
            rowEndTime = String(rowEndTime).trim();
        }

        const matchStartTime = (startTime || '') === rowStartTime;
        const matchEndTime = (endTime || '') === rowEndTime;

        if (rowDate === date && rowRoom === room && rowReason === reason && matchStartTime && matchEndTime) {
            sheet.deleteRow(i + 1);
            return;
        }
    }
    
    throw new Error("Specified blocked date entry not found.");
}
