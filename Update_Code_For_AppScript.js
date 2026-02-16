// Google Apps Script for handling booking writes to the Google Sheet.

// --- CONFIGURATION ---
const SPREADSHEET_ID = '13SROZHNchpiGKpgSc6bpxbuf2Fhw0AMIAcQyC48BKkM';
const SHEET_NAME = 'Bookings';
const BLOCKED_SHEET_NAME = 'BlockedDates';
const SETTINGS_SHEET_NAME = 'Settings'; // NEW: Configuration for Global Settings
const LOGS_SHEET_NAME = 'Logs'; // NEW: Audit Logs
const SCRIPT_TIMEZONE = "Asia/Manila";
const EMAIL_SENDER_NAME = "CCF Manila Booking";

// --- SURVEY FORM CONFIGURATION ---
const SURVEY_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSfEZsWJRYGRh0Jqr6_L9Cw3OGcew6TGGV0YxM0cRTuB4GuJ3A/viewform?usp=pp_url&entry.1009510910=${bookingCode}";

// --- !! ADMIN CONFIGURATION !! ---
const ADMIN_PIN = "CCFManila@2025";

// --- ROOM CONFIGURATION ---
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

/**
 * Main entry point for GET requests.
 */
function doGet(e) {
    const callback = e.parameter.callback;
    const action = e.parameter.action || 'create';
    let result;
    try {
        if (action === 'fetch_all') {
            result = handleFetchAllBookings();
        } else if (e.parameter.payload) {
            const payload = JSON.parse(e.parameter.payload);
            switch (action) {
                case 'create':
                    result = handleCreateBooking(payload);
                    break;
                case 'cancel':
                    result = handleCancelBooking(payload);
                    break;
                case 'move':
                    result = handleMoveBooking(payload);
                    break;
                case 'block_date': // NEW Action
                    result = handleBlockDate(payload);
                    break;
                case 'fetch_user_bookings': // "My Bookings" lookup
                    result = handleFetchUserBookings(payload);
                    break;
                case 'export_user_data': // GDPR: Right to Access / Data Portability
                    result = handleExportUserData(payload);
                    break;
                case 'delete_user_data': // GDPR: Right to Erasure
                    result = handleDeleteUserData(payload);
                    break;
                default:
                    throw new Error("Invalid action specified.");
            }
        } else {
            throw new Error("Missing payload or invalid action.");
        }
    } catch (error) {
        Logger.log('Error in doGet: ' + error.toString());
        result = { success: false, message: error.message };
    }
    return ContentService.createTextOutput(`${callback}(${JSON.stringify(result)})`)
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/**
 * Handles the logic for creating a new booking.
 */
function handleCreateBooking(payload) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
        const isAdmin = (payload.adminPin && payload.adminPin === ADMIN_PIN);
        if (payload.adminPin && !isAdmin) {
            throw new Error("Invalid Admin PIN. Booking not created.");
        }
        const requestedRoom = payload.room;
        let finalRoom = requestedRoom;
        const newStart = new Date(payload.start_iso);
        const newEnd = new Date(payload.end_iso);
        payload.participants = parseInt(payload.participants, 10);

        const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        const sheet = ss.getSheetByName(SHEET_NAME);

        // --- CHECK BLOCKED DATES ---
        const blockedDates = getBlockedDates(ss);
        const isBlocked = checkIsBlocked(newStart, requestedRoom, blockedDates);
        if (isBlocked) throw new Error(`The room ${requestedRoom} is closed on this date: ${isBlocked.reason}`);

        // --- EXISTING LOGIC ---
        const allBookings = getActiveBookings(sheet);

        // --- Prioritization Logic (Main Hall Squeeze) ---
        if (!isAdmin && requestedRoom !== "Main Hall") {
            const mainHallRules = ROOM_CONFIG["Main Hall"];
            const mainHallConcurrent = findConcurrentBookings(newStart, newEnd, allBookings, "Main Hall");
            const mainHallCurrentPax = mainHallConcurrent.reduce((sum, b) => sum + b.participantCount, 0);
            const canFitGroup = (mainHallConcurrent.length + 1) <= mainHallRules.MAX_CONCURRENT_GROUPS;
            const canFitPax = (mainHallCurrentPax + payload.participants) <= mainHallRules.MAX_TOTAL_PARTICIPANTS;
            const meetsSizeRules = (payload.participants >= mainHallRules.MIN_BOOKING_SIZE) && (payload.participants <= mainHallRules.MAX_BOOKING_SIZE);

            // Also check if Main Hall is blocked!
            const isMainHallBlocked = checkIsBlocked(newStart, "Main Hall", blockedDates);

            if (canFitGroup && canFitPax && meetsSizeRules && !isMainHallBlocked) {
                finalRoom = "Main Hall";
            }
        }

        const rules = ROOM_CONFIG[finalRoom];
        if (!rules) throw new Error(`Invalid room name: ${finalRoom}`);
        payload.room = finalRoom;

        const validationError = validateInput(payload, rules, isAdmin);
        if (validationError) throw new Error(validationError);

        // --- Recurrence Logic ---
        if (isAdmin && payload.recurrence && payload.recurrence !== 'none') {
            return handleRecurrentBooking(payload, rules, allBookings, sheet, requestedRoom, blockedDates);
        }

        // --- Single Booking Logic ---
        const concurrent = findConcurrentBookings(newStart, newEnd, allBookings, finalRoom);
        const currentPax = concurrent.reduce((sum, b) => sum + b.participantCount, 0);
        if (concurrent.length + 1 > rules.MAX_CONCURRENT_GROUPS) {
            throw new Error(`Group Limit Exceeded for ${finalRoom}.`);
        }
        if (currentPax + payload.participants > rules.MAX_TOTAL_PARTICIPANTS) {
            throw new Error(`Participant Capacity Exceeded for ${finalRoom}.`);
        }

        const newId = generateUUID();
        appendBookingRow(sheet, newId, payload, newStart, newEnd);

        try {
            sendConfirmationEmail(payload, newId, newStart, newEnd, requestedRoom);
        } catch (emailError) {
            Logger.log(`Booking ${newId} created, but email failed: ${emailError.message}`);
        }

        const result = { success: true, message: 'Booking confirmed!', id: newId, bookedRoom: finalRoom, requestedRoom: requestedRoom };
        logActivity('Create', newId, payload.adminPin, payload);
        return result;
    } finally {
        lock.releaseLock();
    }
}

// --- NEW FUNCTION: Handle Blocking a Date ---
// Auto-cancels all existing confirmed bookings on the blocked date and emails affected users.
function handleBlockDate(payload) {
    if (payload.adminPin !== ADMIN_PIN) {
        return { success: false, message: "Invalid Admin PIN." };
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // 1. Add blocked date entry
    let blockedSheet = ss.getSheetByName(BLOCKED_SHEET_NAME);
    if (!blockedSheet) {
        blockedSheet = ss.insertSheet(BLOCKED_SHEET_NAME);
        blockedSheet.appendRow(["Date", "Room", "Reason"]); // Headers
    }
    blockedSheet.appendRow([payload.date, payload.room, payload.reason]);

    // 2. Find and cancel all confirmed bookings on this date
    const bookingsSheet = ss.getSheetByName(SHEET_NAME);
    if (!bookingsSheet) {
        return { success: true, message: "Date blocked successfully. No bookings sheet found to check.", cancelledCount: 0 };
    }

    const data = bookingsSheet.getDataRange().getValues();
    const headers = data[0];
    const idIndex = headers.indexOf('id');
    const startIsoIndex = headers.indexOf('start_iso');
    const statusIndex = headers.indexOf('status');
    const roomIndex = headers.indexOf('room');
    const notesIndex = headers.indexOf('notes');
    const emailIndex = headers.indexOf('email');
    const firstNameIndex = headers.indexOf('first_name');
    const lastNameIndex = headers.indexOf('last_name');
    const eventIndex = headers.indexOf('event');
    const endIsoIndex = headers.indexOf('end_iso');
    const participantsIndex = headers.indexOf('participants');

    if ([idIndex, startIsoIndex, statusIndex, roomIndex].some(i => i === -1)) {
        return { success: true, message: "Date blocked successfully. Could not check existing bookings (missing columns).", cancelledCount: 0 };
    }

    const blockedDateStr = payload.date; // YYYY-MM-DD
    const blockedRoom = payload.room;    // "All Rooms" or specific room name
    const reason = payload.reason;
    const cancelledBookings = [];

    for (let i = 1; i < data.length; i++) {
        const row = data[i];

        // Skip non-confirmed bookings
        if (row[statusIndex] !== 'confirmed') continue;

        // Parse the booking's start date to YYYY-MM-DD for comparison
        // NOTE: start_iso is stored as Manila time with a misleading 'Z' suffix (from appendBookingRow).
        // We must parse it properly to extract the correct Manila-timezone date.
        let bookingStartIso = row[startIsoIndex];
        let bookingDateStr;
        if (bookingStartIso instanceof Date) {
            bookingDateStr = Utilities.formatDate(bookingStartIso, SCRIPT_TIMEZONE, "yyyy-MM-dd");
            bookingStartIso = Utilities.formatDate(bookingStartIso, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
        } else {
            // Strip trailing 'Z' to avoid UTC re-interpretation, then parse
            const cleanIso = String(bookingStartIso).replace(/Z$/i, '');
            const parsed = new Date(cleanIso);
            if (!isNaN(parsed.getTime())) {
                bookingDateStr = Utilities.formatDate(parsed, SCRIPT_TIMEZONE, "yyyy-MM-dd");
            } else {
                // Fallback: extract from string directly
                bookingDateStr = String(bookingStartIso).substring(0, 10);
            }
        }

        // Check if booking falls on the blocked date
        if (bookingDateStr !== blockedDateStr) continue;

        // Check room filter: "All Rooms" cancels everything, otherwise only matching room
        if (blockedRoom !== 'All Rooms' && row[roomIndex] !== blockedRoom) continue;

        // --- CANCEL THIS BOOKING ---
        bookingsSheet.getRange(i + 1, statusIndex + 1).setValue('cancelled');

        // Add note
        if (notesIndex !== -1) {
            const oldNotes = row[notesIndex] || "";
            bookingsSheet.getRange(i + 1, notesIndex + 1).setValue(`[Auto-Cancelled: Blocked Date - ${reason}] ${oldNotes}`);
        }

        // Log the activity
        logActivity('Auto-Cancel (Blocked Date)', row[idIndex], 'SYSTEM', {
            reason: reason,
            blockedRoom: blockedRoom,
            blockedDate: blockedDateStr
        });

        // Collect info for email notification
        let endIsoVal = row[endIsoIndex];
        if (endIsoVal instanceof Date) {
            endIsoVal = Utilities.formatDate(endIsoVal, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
        }

        cancelledBookings.push({
            id: row[idIndex],
            email: emailIndex !== -1 ? row[emailIndex] : null,
            firstName: firstNameIndex !== -1 ? row[firstNameIndex] : 'Guest',
            lastName: lastNameIndex !== -1 ? row[lastNameIndex] : '',
            event: eventIndex !== -1 ? row[eventIndex] : 'Your Booking',
            room: row[roomIndex],
            start_iso: bookingStartIso,
            end_iso: endIsoVal,
            participants: participantsIndex !== -1 ? row[participantsIndex] : ''
        });
    }

    // 3. Send cancellation emails to all affected users
    cancelledBookings.forEach(booking => {
        if (booking.email) {
            try {
                sendBlockedDateCancellationEmail(booking, reason, blockedDateStr);
            } catch (emailError) {
                Logger.log('Failed to send cancellation email to ' + booking.email + ': ' + emailError.toString());
            }
        }
    });

    // 4. Build response message
    const cancelledCount = cancelledBookings.length;
    const cancelledEvents = cancelledBookings.map(b => b.event);
    let message = "Date blocked successfully.";
    if (cancelledCount > 0) {
        message += ` ${cancelledCount} existing booking(s) were automatically cancelled and affected users have been notified via email.`;
    }

    return {
        success: true,
        message: message,
        cancelledCount: cancelledCount,
        cancelledEvents: cancelledEvents
    };
}

/**
 * Sends an apology/cancellation email when a booking is auto-cancelled due to a blocked date.
 * NOTE: start_iso/end_iso are stored as Manila time with misleading 'Z' suffix.
 * We strip the 'Z' before parsing to avoid a UTC re-interpretation that shifts the date.
 */
function sendBlockedDateCancellationEmail(booking, reason, blockedDate) {
    const recipient = booking.email;
    const bookingCode = (booking.id || "").substring(0, 12).toUpperCase();

    // Strip trailing 'Z' to treat as Manila local time (matches how appendBookingRow stores it)
    const cleanStartIso = String(booking.start_iso).replace(/Z$/i, '');
    const cleanEndIso = String(booking.end_iso).replace(/Z$/i, '');
    const startDate = new Date(cleanStartIso);
    const endDate = new Date(cleanEndIso);
    const bookingDateStr = Utilities.formatDate(startDate, SCRIPT_TIMEZONE, "MMMM d, yyyy (EEE)");
    const startTimeStr = Utilities.formatDate(startDate, SCRIPT_TIMEZONE, "h:mm a");
    const endTimeStr = Utilities.formatDate(endDate, SCRIPT_TIMEZONE, "h:mm a");
    const surveyLink = SURVEY_FORM_URL.replace('${bookingCode}', bookingCode);

    // Format the BLOCKED date (the actual closure date) for the email notice text
    const blockedDateObj = new Date(blockedDate + 'T00:00:00');
    const closureDateStr = Utilities.formatDate(blockedDateObj, SCRIPT_TIMEZONE, "MMMM d, yyyy (EEE)");

    const subject = `Booking Cancelled: ${booking.event} on ${bookingDateStr} — CCF Manila`;

    const htmlBody = `
    <div style="font-family: Arial, sans-serif; font-size: 16px; line-height: 1.6; max-width: 600px;">
      <h2 style="color: #b80000;">Booking Cancellation Notice</h2>
      <p>Hi <strong>${booking.firstName}</strong>,</p>
      <p>We sincerely apologize for the inconvenience. Your booking has been <strong>automatically cancelled</strong> because the church facility will be <strong>closed on ${closureDateStr}</strong>.</p>
      
      <div style="background-color: #fef2f2; border-left: 4px solid #b80000; border-radius: 4px; padding: 15px; margin: 20px 0;">
        <p style="margin: 0 0 8px 0; font-weight: bold; color: #b80000;">Reason for Closure:</p>
        <p style="margin: 0; color: #7f1d1d;">${reason}</p>
      </div>

      <div style="background-color: #f4f4f4; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #333;">Cancelled Booking Details</h3>
        <p><strong>Booking Code:</strong> <span style="font-family: 'Courier New', monospace; font-size: 16px;">${bookingCode}</span></p>
        <hr style="border: 0; border-top: 1px solid #ddd;">
        <p><strong>Event:</strong> ${booking.event}</p>
        <p><strong>Room:</strong> ${booking.room}</p>
        <p><strong>Date:</strong> ${bookingDateStr}</p>
        <p><strong>Time:</strong> ${startTimeStr} - ${endTimeStr}</p>
        ${booking.participants ? `<p><strong>Participants:</strong> ${booking.participants}</p>` : ''}
      </div>

      <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; color: #1e40af; font-size: 14px;">
          <strong>What to do next:</strong> Please rebook your event on a different available date using our <a href="https://cbanzaime23.github.io/Booking-System/" style="color: #1e40af;">Booking System</a>. We apologize again for any inconvenience caused.
        </p>
      </div>

      <div style="background-color: #e6fffa; border: 1px solid #b2f5ea; border-radius: 8px; padding: 15px; margin-top: 20px;">
        <h3 style="color: #047857; margin-top: 0;">Need Help or Have Questions?</h3>
        <p style="color: #065f46; font-size: 14px;">For Queries, Feature Requests, or Help Needs, please submit them via our Survey Google Form.</p>
        <a href="${surveyLink}" style="background-color: #047857; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px; font-weight: bold;">Submit Feedback / Query</a>
      </div>

      <p style="margin-top: 30px; color: #888; font-size: 12px;">This is an automated no-reply email notification.<br>We are sorry for the inconvenience and thank you for your understanding.</p>
      <p style="color: #555;">God Bless,<br>CCF Manila Admin</p>
    </div>
  `;

    const plainBody = `Hi ${booking.firstName},\n\n` +
        `We sincerely apologize for the inconvenience. Your booking has been automatically cancelled because the church facility will be closed on ${closureDateStr}.\n\n` +
        `Reason: ${reason}\n\n` +
        `CANCELLED BOOKING DETAILS:\n` +
        `Booking Code: ${bookingCode}\n` +
        `Event: ${booking.event}\n` +
        `Room: ${booking.room}\n` +
        `Date: ${bookingDateStr}\n` +
        `Time: ${startTimeStr} - ${endTimeStr}\n\n` +
        `Please rebook your event on a different available date.\n\n` +
        `For Queries or Help: ${surveyLink}\n\n` +
        `God Bless,\nCCF Manila Admin`;

    MailApp.sendEmail({
        to: recipient,
        subject: subject,
        body: plainBody,
        htmlBody: htmlBody,
        name: EMAIL_SENDER_NAME
    });
}

// --- NEW HELPER: Audit Logging ---
function logActivity(action, bookingId, adminPin, details) {
    try {
        const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        let sheet = ss.getSheetByName(LOGS_SHEET_NAME);
        if (!sheet) {
            sheet = ss.insertSheet(LOGS_SHEET_NAME);
            sheet.appendRow(["Timestamp", "Action", "Booking ID", "Admin PIN", "Details"]); // Headers
        }

        const timestamp = new Date();
        const detailsStr = (typeof details === 'object') ? JSON.stringify(details) : String(details);

        // Log: Date, Action, ID, PIN (or 'N/A'), Details
        sheet.appendRow([timestamp, action, bookingId, adminPin || 'N/A', detailsStr]);
    } catch (e) {
        Logger.log("Logging failed: " + e.message);
    }
}

// --- NEW HELPER: Get Blocked Dates ---
function getBlockedDates(ss) {
    const sheet = ss.getSheetByName(BLOCKED_SHEET_NAME);
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    // Remove header
    data.shift();

    return data.map(row => {
        // Row: [Date, Room, Reason]
        // Date column might be a Date object or string
        let dateStr = row[0];
        if (dateStr instanceof Date) {
            // Force YYYY-MM-DD in Manila Time
            dateStr = Utilities.formatDate(dateStr, SCRIPT_TIMEZONE, "yyyy-MM-dd");
        }
        return {
            date: dateStr,
            room: row[1],
            reason: row[2]
        };
    });
}

// --- NEW HELPER: Check if a date/room is blocked ---
function checkIsBlocked(dateObj, roomName, blockedDates) {
    const dateStr = Utilities.formatDate(dateObj, SCRIPT_TIMEZONE, "yyyy-MM-dd");
    return blockedDates.find(b => {
        // Check Date Match
        if (b.date !== dateStr) return false;
        // Check Room Match (Specific Room or "All Rooms")
        if (b.room === "All Rooms" || b.room === roomName) return true;
        return false;
    });
}

// --- HELPER FUNCTIONS ---

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
                room: row[roomIndex]
            };
        });
}

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
    // Allow bookings ending at the same time (0 duration filtered by frontend, but logical here is strictly >)
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
 * UPDATED: Handles saving recurrent bookings with blocked date check.
 */
function handleRecurrentBooking(payload, rules, allBookings, sheet, requestedRoom, blockedDates) {
    let successCount = 0;
    let failCount = 0;
    let firstId = null;
    let firstStart, firstEnd;
    let loopCount, loopType, dayOfWeek;

    switch (payload.recurrence) {
        case 'weekly': loopCount = 12; loopType = 'weekly'; break;
        case 'monthly': loopCount = 6; loopType = 'monthly'; break;
        case 'quarterly': loopCount = 4; loopType = 'quarterly'; break;
        case 'first_wednesday': loopCount = 6; loopType = 'first_day'; dayOfWeek = 3; break;
        case 'last_saturday': loopCount = 6; loopType = 'last_day'; dayOfWeek = 6; break;
        default: throw new Error("Invalid recurrence type.");
    }

    const originalStart = new Date(payload.start_iso);
    const originalEnd = new Date(payload.end_iso);
    const durationMs = originalEnd.getTime() - originalStart.getTime();

    for (let i = 0; i < loopCount; i++) {
        let iterStart, iterEnd;
        let currentMonthIter = new Date(originalStart);
        currentMonthIter.setDate(1);
        currentMonthIter.setMonth(originalStart.getMonth() + i);

        switch (loopType) {
            case 'weekly':
                iterStart = new Date(originalStart);
                iterStart.setDate(iterStart.getDate() + (i * 7));
                break;
            case 'monthly':
                iterStart = new Date(originalStart);
                const targetMonth = iterStart.getMonth() + i;
                iterStart.setMonth(targetMonth);
                if (iterStart.getMonth() !== targetMonth % 12) {
                    iterStart.setDate(0);
                }
                break;
            case 'quarterly':
                iterStart = new Date(originalStart);
                iterStart.setMonth(iterStart.getMonth() + (i * 3));
                break;
            case 'first_day':
                iterStart = findFirstDayOfWeekOfMonth(currentMonthIter, dayOfWeek);
                iterStart.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0);
                break;
            case 'last_day':
                iterStart = findLastDayOfWeekOfMonth(currentMonthIter, dayOfWeek);
                iterStart.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0);
                break;
        }
        iterEnd = new Date(iterStart.getTime() + durationMs);

        // Check if in past
        const today = new Date();
        if (iterStart < today) {
            if (i > 0) { failCount++; continue; }
        }

        // --- CHECK BLOCK (Optimization: Skip if blocked) ---
        if (checkIsBlocked(iterStart, payload.room, blockedDates)) {
            failCount++;
            continue;
        }

        const concurrent = findConcurrentBookings(iterStart, iterEnd, allBookings, payload.room);
        const currentPax = concurrent.reduce((sum, b) => sum + b.participantCount, 0);
        const hasCapacity = (concurrent.length + 1) <= rules.MAX_CONCURRENT_GROUPS && (currentPax + payload.participants) <= rules.MAX_TOTAL_PARTICIPANTS;

        if (hasCapacity) {
            successCount++;
            const newId = generateUUID();
            appendBookingRow(sheet, newId, payload, iterStart, iterEnd);

            if (firstId === null) { firstId = newId; firstStart = iterStart; firstEnd = iterEnd; }

            const formattedStartIso = Utilities.formatDate(iterStart, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss'Z'");
            const formattedEndIso = Utilities.formatDate(iterEnd, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss'Z'");
            allBookings.push({ id: newId, start_iso: formattedStartIso, end_iso: formattedEndIso, participantCount: payload.participants, room: payload.room });
        } else {
            failCount++;
        }
    }

    if (firstId) {
        try { sendConfirmationEmail(payload, firstId, firstStart, firstEnd, requestedRoom); } catch (e) { Logger.log(e.message); }
    } else {
        throw new Error("No recurrent events could be booked due to conflicts or blocked dates.");
    }
    return { success: true, message: `Recurrent: ${successCount} booked, ${failCount} failed.`, id: firstId, bookedRoom: payload.room, requestedRoom: requestedRoom };
}

function findFirstDayOfWeekOfMonth(date, dayOfWeek) {
    const d = new Date(date.getFullYear(), date.getMonth(), 1);
    while (d.getDay() !== dayOfWeek) {
        d.setDate(d.getDate() + 1);
    }
    return d;
}

function findLastDayOfWeekOfMonth(date, dayOfWeek) {
    const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    while (d.getDay() !== dayOfWeek) {
        d.setDate(d.getDate() - 1);
    }
    return d;
}


function appendBookingRow(sheet, id, payload, startDate, endDate) {
    const formattedStartIso = Utilities.formatDate(startDate, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss'Z'");
    const formattedEndIso = Utilities.formatDate(endDate, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss'Z'");

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
        payload.consent_timestamp || ''
    ];
    sheet.appendRow(newRow);
}

function handleCancelBooking(payload) {
    const { bookingId, bookingCode, adminPin } = payload;
    if (!bookingId) throw new Error("Booking ID required.");
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
        const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const idIndex = headers.indexOf('id');
        const statusIndex = headers.indexOf('status');
        const notesIndex = headers.indexOf('notes');

        if (idIndex === -1 || statusIndex === -1) throw new Error("Missing columns.");

        for (let i = 1; i < data.length; i++) {
            if (data[i][idIndex] === bookingId) {
                const isAuthAdmin = (adminPin && adminPin === ADMIN_PIN);

                // Verify Booking Code (User must provide at least the first 8 characters for security)
                let isUserVerified = false;
                if (bookingCode && bookingCode.length >= 8) {
                    // Check if the Full UUID starts with the provided Code
                    if (data[i][idIndex].toString().toUpperCase().startsWith(bookingCode.toUpperCase())) {
                        isUserVerified = true;
                    }
                }

                if (data[i][statusIndex] === 'cancelled') throw new Error("Already cancelled.");
                if (!isAuthAdmin && !isUserVerified) throw new Error("Verification failed. Invalid Booking Code.");

                sheet.getRange(i + 1, statusIndex + 1).setValue('cancelled');

                if (isAuthAdmin && !isUserVerified && notesIndex !== -1) {
                    const oldNotes = data[i][notesIndex] || "";
                    sheet.getRange(i + 1, notesIndex + 1).setValue(`[Admin Cancel] ${oldNotes}`);
                }
                logActivity('Cancel', bookingId, adminPin, { bookingCode, reason: "Cancelled by user/admin" });
                return { success: true, message: "Booking cancelled." };
            }
        }
        throw new Error("Booking not found.");
    } finally {
        lock.releaseLock();
    }
}

/**
 * UPDATED: Returns bookings AND blocked dates
 */
function handleFetchAllBookings() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);

    // 1. Fetch Bookings
    let bookings = [];
    const range = sheet.getDataRange();
    if (range.getNumRows() > 1) {
        const data = range.getValues();
        const headers = data.shift();
        const idx = {
            id: headers.indexOf('id'), date: headers.indexOf('date'),
            start: headers.indexOf('start_iso'), end: headers.indexOf('end_iso'),
            first: headers.indexOf('first_name'), last: headers.indexOf('last_name'),
            event: headers.indexOf('event'), room: headers.indexOf('room'),
            pax: headers.indexOf('participants'), status: headers.indexOf('status'),
            email: headers.indexOf('email')
        };

        if (idx.id !== -1 && idx.status !== -1) {
            bookings = data
                .filter(row => row[idx.status] === 'confirmed')
                .map(row => {
                    let startIso = row[idx.start];
                    let endIso = row[idx.end];
                    if (startIso instanceof Date) startIso = Utilities.formatDate(startIso, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss'Z'");
                    if (endIso instanceof Date) endIso = Utilities.formatDate(endIso, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss'Z'");
                    return {
                        id: row[idx.id], date: row[idx.date], start_iso: startIso, end_iso: endIso,
                        first_name: row[idx.first], last_name: row[idx.last], // Return separate names
                        event: row[idx.event], room: row[idx.room],
                        participants: row[idx.pax], // Return as participants
                        status: row[idx.status]
                    };
                });
        }
    }

    // 2. Fetch Blocked Dates
    const blocked = getBlockedDates(ss);

    // 3. Fetch Global Settings (Announcement)
    const settings = getGlobalSettings(ss);

    return { success: true, data: bookings, blocked_dates: blocked, announcement: settings };
}

/**
 * NEW: Fetch Global Settings (Announcement)
 * Checks for Active status AND Date Range (if provided)
 */
function getGlobalSettings(ss) {
    const sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
    const settings = { message: '', isActive: false };

    if (!sheet) return settings;

    const data = sheet.getDataRange().getValues();
    // Expected Structure:
    // Row 2: Announcement Message | [Message]
    // Row 3: Announcement Active  | TRUE/FALSE
    // Row 4: Announcement Start   | [Date]
    // Row 5: Announcement End     | [Date]

    // Simple lookup map
    const map = {};
    data.forEach(row => {
        if (row[0]) map[row[0].toString().trim()] = row[1];
    });

    const rawMessage = map['Announcement Message'];
    const rawActive = map['Announcement Active'];
    const rawStart = map['Announcement Start'];
    const rawEnd = map['Announcement End'];

    // Robust Active Check (Boolean true or String "TRUE"/"true")
    let isActive = false;
    if (rawActive === true) isActive = true;
    if (typeof rawActive === 'string' && rawActive.toUpperCase() === 'TRUE') isActive = true;

    if (isActive) {
        // Validate Date Range if present
        const now = new Date();
        let inRange = true; // Default to true if no dates provided

        // Check if dates are valid objects or non-empty strings
        const hasStart = rawStart && (rawStart instanceof Date || rawStart.toString().trim() !== '');
        const hasEnd = rawEnd && (rawEnd instanceof Date || rawEnd.toString().trim() !== '');

        if (hasStart && hasEnd) {
            const start = new Date(rawStart);
            const end = new Date(rawEnd);
            // If invalid dates (e.g. text), ignore them or fail safe?
            // Let's assume if provided, they must be valid.
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

function sendConfirmationEmail(payload, newId, newStart, newEnd, requestedRoom) {
    const recipient = payload.email;
    const subject = `Booking Confirmed: ${payload.event} for ${payload.room}`;
    const bookingCode = newId.substring(0, 12).toUpperCase();
    const dateStr = Utilities.formatDate(newStart, SCRIPT_TIMEZONE, "MMMM d, yyyy");
    const timeStr = `${Utilities.formatDate(newStart, SCRIPT_TIMEZONE, "h:mm a")} - ${Utilities.formatDate(newEnd, SCRIPT_TIMEZONE, "h:mm a")}`;
    const surveyLink = SURVEY_FORM_URL.replace('${bookingCode}', bookingCode);

    const fmt = "yyyyMMdd'T'HHmmss";
    const gStart = Utilities.formatDate(newStart, SCRIPT_TIMEZONE, fmt);
    const gEnd = Utilities.formatDate(newEnd, SCRIPT_TIMEZONE, fmt);
    const gTitle = encodeURIComponent(`CCF Booking: ${payload.event}`);
    const gLoc = encodeURIComponent(`CCF Manila - ${payload.room}`);
    const gDetails = encodeURIComponent(`Ref: ${bookingCode}\nParticipants: ${payload.participants}\nNotes: ${payload.notes || 'None'}`);
    const gCalLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${gTitle}&dates=${gStart}/${gEnd}&details=${gDetails}&location=${gLoc}&ctz=${SCRIPT_TIMEZONE}`;

    let greeting = `<h2 style="color: #333;">Hi ${payload.first_name},</h2>`;
    if (requestedRoom && payload.room !== requestedRoom) {
        greeting += `<p>To optimize room usage, your booking for <strong>${requestedRoom}</strong> has been moved to the <strong>${payload.room}</strong>. Your booking is confirmed for the following details:</p>`;
    } else {
        greeting += `<p>Your booking for <strong>${payload.room}</strong> is confirmed! Please review the details below.</p>`;
    }

    const htmlBody = `
    <div style="font-family: Arial, sans-serif; font-size: 16px; line-height: 1.6;">
      ${greeting}
      <div style="background-color: #f4f4f4; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Booking Summary</h3>
        <p><strong>Booking Code:</strong> <span style="font-family: 'Courier New', monospace; font-size: 18px; color: #000;">${bookingCode}</span></p>
        <hr style="border: 0; border-top: 1px solid #ddd;">
        <p><strong>Room:</strong> ${payload.room}</p>
        <p><strong>Name:</strong> ${payload.first_name} ${payload.last_name}</p>
        <p><strong>Event:</strong> ${payload.event}</p>
        <p><strong>Date:</strong> ${dateStr}</p>
        <p><strong>Time:</strong> ${timeStr}</p>
        <p><strong>Participants:</strong> ${payload.participants}</p>
        ${payload.notes ? `<p><strong>Notes:</strong> ${payload.notes}</p>` : ''}

        <div style="margin-top: 25px; text-align: left;">
           <a href="${gCalLink}" style="background-color: #004d60; color: white; padding: 12px 18px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 14px;">📅 Add to Google Calendar</a>
        </div>
      </div>
      
      <div style="background-color: #e6fffa; border: 1px solid #b2f5ea; border-radius: 8px; padding: 15px; margin-top: 20px;">
        <h3 style="color: #047857; margin-top: 0;">Need Help or Have Questions?</h3>
        <p style="color: #065f46; font-size: 14px;">For Queries, Feature Requests, or Help Needs, please submit them via our Survey Google Form.</p>
        <a href="${surveyLink}" style="background-color: #047857; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px; font-weight: bold;">Submit Feedback / Query</a>
      </div>
      <p style="margin-top: 30px; color: #888; font-size: 12px;">This is an automated no-reply email confirmation.<br>Thank you for using the CCF Manila Booking System.</p>
    </div>
  `;

    MailApp.sendEmail({
        to: recipient,
        subject: subject,
        htmlBody: htmlBody,
        name: EMAIL_SENDER_NAME
    });
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function handleMoveBooking(payload) {
    if (payload.adminPin !== ADMIN_PIN) {
        return { success: false, message: "Invalid Admin PIN." };
    }
    var bookingId = payload.bookingId;
    var newRoom = payload.newRoom;
    var newStartIso = payload.start_iso;
    var newEndIso = payload.end_iso;
    var reason = payload.reason;
    var newDate = Utilities.formatDate(new Date(newStartIso), 'Asia/Manila', 'yyyy-MM-dd');

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Bookings");
    var data = sheet.getDataRange().getValues();
    var rowIndex = -1;
    var bookingRow = null;

    for (var i = 1; i < data.length; i++) {
        if (data[i][0] === bookingId) {
            rowIndex = i + 1;
            bookingRow = data[i];
            break;
        }
    }

    if (rowIndex === -1) {
        return { success: false, message: "Booking not found." };
    }

    var userFirstName = bookingRow[4];
    var userEmail = bookingRow[6];
    var eventName = bookingRow[9];

    sheet.getRange(rowIndex, 2).setValue(newDate);
    sheet.getRange(rowIndex, 3).setValue(newStartIso);
    sheet.getRange(rowIndex, 4).setValue(newEndIso);
    sheet.getRange(rowIndex, 11).setValue(newRoom);

    var currentNotes = bookingRow[14] || "";
    var noteUpdate = " [Admin Moved: " + reason + "]";
    sheet.getRange(rowIndex, 15).setValue(currentNotes + noteUpdate);

    sendMoveNotificationEmail(userEmail, userFirstName, eventName, newRoom, newStartIso, newEndIso, reason, bookingId);

    logActivity('Move', bookingId, payload.adminPin, payload);
    return { success: true, message: "Booking moved successfully." };
}

function sendMoveNotificationEmail(email, name, event, room, startIso, endIso, reason, bookingId) {
    var startDate = new Date(startIso);
    var endDate = new Date(endIso);
    var timeFormat = "h:mm a";
    var dateFormat = "MMM d, yyyy (EEE)";
    var bookingCode = (bookingId || "").substring(0, 12).toUpperCase();
    var surveyLink = SURVEY_FORM_URL.replace('${bookingCode}', bookingCode);

    var dateStr = Utilities.formatDate(startDate, 'Asia/Manila', dateFormat);
    var startTimeStr = Utilities.formatDate(startDate, 'Asia/Manila', timeFormat);
    var endTimeStr = Utilities.formatDate(endDate, 'Asia/Manila', timeFormat);
    var subject = "Update: Your Booking Schedule Has Changed - CCF Manila";

    var body = "Hi " + name + ",\n\n" +
        "Please be advised that your booking for '" + event + "' has been moved by an Administrator.\n\n" +
        "NEW DETAILS:\n" +
        "Date: " + dateStr + "\n" +
        "Time: " + startTimeStr + " - " + endTimeStr + "\n" +
        "Room: " + room + "\n\n" +
        "Reason: " + reason + "\n\n" +
        "For Queries, Feature Requests, or Help, please submit them via our Survey Google Form: " + surveyLink + "\n\n" +
        "This is an automated no-reply email confirmation.\n\n" +
        "God Bless,\nCCF Manila Admin";

    var htmlBody = "<div style='font-family: sans-serif; color: #333;'>" +
        "<h2 style='color: #004d60;'>Booking Update</h2>" +
        "<p>Hi <strong>" + name + "</strong>,</p>" +
        "<p>Please be advised that your booking for <strong>" + event + "</strong> has been moved.</p>" +
        "<div style='background: #f8fafc; padding: 15px; border-left: 4px solid #004d60; margin: 20px 0;'>" +
        "<p style='margin: 5px 0;'><strong>New Date:</strong> " + dateStr + "</p>" +
        "<p style='margin: 5px 0;'><strong>New Time:</strong> " + startTimeStr + " - " + endTimeStr + "</p>" +
        "<p style='margin: 5px 0;'><strong>New Room:</strong> " + room + "</p>" +
        "<p style='margin: 5px 0;'><strong>Reason:</strong> " + reason + "</p>" +
        "</div>" +

        "<div style='background-color: #e6fffa; border: 1px solid #b2f5ea; border-radius: 8px; padding: 15px; margin-top: 20px;'>" +
        "<h3 style='color: #047857; margin-top: 0;'>Need Help or Have Questions?</h3>" +
        "<p style='color: #065f46; font-size: 14px;'>For Queries, Feature Requests, or Help Needs, please submit them via our Survey Google Form.</p>" +
        "<a href='" + surveyLink + "' style='background-color: #047857; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px; font-weight: bold;'>Submit Feedback / Query</a>" +
        "</div>" +

        "<p style='margin-top: 30px; font-size: 12px; color: #888;'>This is an automated no-reply email confirmation.</p>" +
        "<p>God Bless,<br>CCF Manila Admin</p>" +
        "</div>";

    MailApp.sendEmail({
        to: email,
        subject: subject,
        body: body,
        htmlBody: htmlBody
    });
}

/**
 * NEW: Fetch bookings for a specific user email
 * Returns only future, confirmed bookings.
 * Filters out sensitive data.
 */
function handleFetchUserBookings(payload) {
    const userEmail = payload.email;
    if (!userEmail) return { success: false, message: "Email is required." };

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();

    const idx = {
        id: headers.indexOf('id'),
        start: headers.indexOf('start_iso'),
        end: headers.indexOf('end_iso'),
        status: headers.indexOf('status'),
        email: headers.indexOf('email'),
        event: headers.indexOf('event'),
        room: headers.indexOf('room')
    };

    // Check required columns
    if (Object.values(idx).some(i => i === -1)) {
        return { success: false, message: "Server Error: Missing columns." };
    }

    const now = new Date();
    const safeBookings = [];

    data.forEach(row => {
        const status = row[idx.status];
        const rowEmail = row[idx.email];

        // 1. Check Status
        if (status !== 'confirmed') return;

        // 2. Check Email (Case Insensitive)
        if (!rowEmail || rowEmail.toString().toLowerCase() !== userEmail.toLowerCase()) return;

        // 3. Check Future Date
        let startIso = row[idx.start];
        let endIso = row[idx.end];
        let startDate = (startIso instanceof Date) ? startIso : new Date(startIso);

        if (startDate <= now) return;

        // Format for response
        if (startIso instanceof Date) startIso = Utilities.formatDate(startIso, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss'Z'");
        if (endIso instanceof Date) endIso = Utilities.formatDate(endIso, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss'Z'");

        safeBookings.push({
            id: row[idx.id], // Useful for referencing (maybe cancellation later)
            date: Utilities.formatDate(startDate, SCRIPT_TIMEZONE, "MMM d, yyyy"), // Friendly date
            start_time: Utilities.formatDate(startDate, SCRIPT_TIMEZONE, "h:mm a"),
            end_time: (endIso instanceof Date || typeof endIso === 'string') ? Utilities.formatDate(new Date(endIso), SCRIPT_TIMEZONE, "h:mm a") : '',
            event: row[idx.event],
            room: row[idx.room]
        });
    });

    return { success: true, bookings: safeBookings };
}

// =============================================================================
// GDPR SUBJECT RIGHTS — Export & Delete User Data
// =============================================================================

/**
 * GDPR Right to Access / Data Portability
 * Returns ALL booking data associated with the given email.
 */
function handleExportUserData(payload) {
    const userEmail = payload.email;
    const bookingCode = (payload.bookingCode || '').toUpperCase();
    if (!userEmail) return { success: false, message: 'Email is required.' };
    if (!bookingCode || bookingCode.length < 6) return { success: false, message: 'Booking Code is required for verification.' };

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return { success: false, message: 'Bookings sheet not found.' };

    const data = sheet.getDataRange().getValues();
    const headers = data.shift();

    // Build column index map
    const idx = {};
    headers.forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });

    const emailCol = idx['email'];
    const idCol = idx['id'];
    if (emailCol === undefined) return { success: false, message: 'Server error: email column not found.' };
    if (idCol === undefined) return { success: false, message: 'Server error: id column not found.' };

    // Verify booking code belongs to this email
    const codeMatch = data.some(row => {
        const rowEmail = row[emailCol];
        const rowId = (row[idCol] || '').toString().substring(0, 12).toUpperCase();
        return rowEmail && rowEmail.toString().toLowerCase() === userEmail.toLowerCase() && rowId === bookingCode;
    });
    if (!codeMatch) return { success: false, message: 'Invalid Booking Code. Please enter the correct code from your most recent confirmation email.' };

    const userBookings = [];

    data.forEach(row => {
        const rowEmail = row[emailCol];
        if (!rowEmail || rowEmail.toString().toLowerCase() !== userEmail.toLowerCase()) return;

        // Build a clean export object from each row
        const booking = {};
        headers.forEach((header, i) => {
            let value = row[i];
            // Format dates for readability
            if (value instanceof Date) {
                value = Utilities.formatDate(value, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
            }
            booking[header] = value;
        });
        userBookings.push(booking);
    });

    // Log the data export request
    logActivity('GDPR_EXPORT', bookingCode, 'USER', {
        email: userEmail,
        records_exported: userBookings.length,
        exported_at: new Date().toISOString()
    });

    if (userBookings.length === 0) {
        return { success: false, message: 'No bookings found for this email address.' };
    }

    // Send confirmation email with exported data summary
    sendGdprExportEmail(userEmail, userBookings);

    return { success: true, data: userBookings };
}

/**
 * GDPR Right to Erasure (Right to be Forgotten)
 * Anonymizes ALL bookings associated with the given email.
 * Future confirmed bookings are also cancelled.
 */
function handleDeleteUserData(payload) {
    const userEmail = payload.email;
    const bookingCode = (payload.bookingCode || '').toUpperCase();
    if (!userEmail) return { success: false, message: 'Email is required.' };
    if (!bookingCode || bookingCode.length < 6) return { success: false, message: 'Booking Code is required for verification.' };

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return { success: false, message: 'Bookings sheet not found.' };

    // First pass: verify booking code
    const verifyData = sheet.getDataRange().getValues();
    const verifyHeaders = verifyData[0];
    const vIdx = {};
    verifyHeaders.forEach((h, i) => { vIdx[String(h).trim().toLowerCase()] = i; });
    const vEmailCol = vIdx['email'];
    const vIdCol = vIdx['id'];
    if (vEmailCol === undefined || vIdCol === undefined) return { success: false, message: 'Server error: required columns not found.' };

    const codeMatch = verifyData.slice(1).some(row => {
        const rowEmail = row[vEmailCol];
        const rowId = (row[vIdCol] || '').toString().substring(0, 12).toUpperCase();
        return rowEmail && rowEmail.toString().toLowerCase() === userEmail.toLowerCase() && rowId === bookingCode;
    });
    if (!codeMatch) return { success: false, message: 'Invalid Booking Code. Please enter the correct code from your most recent confirmation email.' };

    // Second pass: process deletion using the same sheet
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // Build column index map
    const idx = {};
    headers.forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });

    const emailCol = idx['email'];
    const firstNameCol = idx['first_name'];
    const lastNameCol = idx['last_name'];
    const leaderFirstCol = idx['leader_first_name'];
    const leaderLastCol = idx['leader_last_name'];
    const notesCol = idx['notes'];
    const statusCol = idx['status'];
    const startCol = idx['start_iso'];
    const idCol = idx['id'];

    if (emailCol === undefined || firstNameCol === undefined) {
        return { success: false, message: 'Server error: required columns not found.' };
    }

    const now = new Date();
    let anonymizedCount = 0;
    const deletedBookingsSummary = []; // Capture details BEFORE anonymization

    for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
        const row = data[rowIndex];
        const rowEmail = row[emailCol];

        if (!rowEmail || rowEmail.toString().toLowerCase() !== userEmail.toLowerCase()) continue;

        const sheetRow = rowIndex + 1; // 1-indexed for Sheet API

        // Capture booking details BEFORE anonymization for the email
        const dateCol = idx['date'];
        const eventCol = idx['event'];
        const roomCol = idx['room'];
        const paxCol = idx['participants'];
        let bookingDate = row[startCol];
        if (bookingDate instanceof Date) {
            bookingDate = Utilities.formatDate(bookingDate, SCRIPT_TIMEZONE, "MMM d, yyyy h:mm a");
        }
        deletedBookingsSummary.push({
            id: ((idCol !== undefined) ? row[idCol] : 'N/A').toString().substring(0, 12).toUpperCase(),
            date: bookingDate || 'N/A',
            event: (eventCol !== undefined) ? row[eventCol] : 'N/A',
            room: (roomCol !== undefined) ? row[roomCol] : 'N/A',
            participants: (paxCol !== undefined) ? row[paxCol] : 'N/A',
            status: (statusCol !== undefined) ? row[statusCol] : 'N/A'
        });

        // Cancel future bookings
        if (statusCol !== undefined && startCol !== undefined) {
            let startDate = row[startCol];
            if (!(startDate instanceof Date)) startDate = new Date(startDate);
            if (!isNaN(startDate.getTime()) && startDate > now && row[statusCol] === 'confirmed') {
                sheet.getRange(sheetRow, statusCol + 1).setValue('cancelled_gdpr');
            }
        }

        // Anonymize personal data
        if (firstNameCol !== undefined) sheet.getRange(sheetRow, firstNameCol + 1).setValue('Anonymized');
        if (lastNameCol !== undefined) sheet.getRange(sheetRow, lastNameCol + 1).setValue('User');
        if (emailCol !== undefined) sheet.getRange(sheetRow, emailCol + 1).setValue('redacted@anonymized.local');
        if (leaderFirstCol !== undefined) sheet.getRange(sheetRow, leaderFirstCol + 1).setValue('');
        if (leaderLastCol !== undefined) sheet.getRange(sheetRow, leaderLastCol + 1).setValue('');
        if (notesCol !== undefined) sheet.getRange(sheetRow, notesCol + 1).setValue('');

        anonymizedCount++;

        // Log each anonymization
        const bookingId = (idCol !== undefined) ? row[idCol] : 'unknown';
        logActivity('GDPR_ERASURE', bookingId, 'USER', {
            reason: 'User-initiated data deletion request',
            original_email: userEmail,
            anonymized_at: new Date().toISOString()
        });
    }

    if (anonymizedCount === 0) {
        return { success: false, message: 'No bookings found for this email address.' };
    }

    // Send confirmation email with deletion summary
    sendGdprDeletionEmail(userEmail, deletedBookingsSummary, anonymizedCount);

    return { success: true, count: anonymizedCount, message: `Successfully anonymized ${anonymizedCount} booking(s).` };
}

// =============================================================================
// GDPR EMAIL CONFIRMATIONS — Export & Deletion Receipts
// =============================================================================

/**
 * Sends a confirmation email after a successful data export.
 * Lists all bookings that were included in the download.
 */
function sendGdprExportEmail(email, bookings) {
    const subject = 'Your Data Export Confirmation - CCF Manila Booking System';
    const dateNow = Utilities.formatDate(new Date(), SCRIPT_TIMEZONE, "MMMM d, yyyy 'at' h:mm a");

    let bookingRows = '';
    bookings.forEach(b => {
        const id = (b.id || '').toString().substring(0, 12).toUpperCase();
        const date = b.date || 'N/A';
        const event = b.event || 'N/A';
        const room = b.room || 'N/A';
        const status = b.status || 'N/A';
        bookingRows += `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-family: 'Courier New', monospace; font-size: 12px;">${id}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${date}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${event}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${room}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${status}</td>
        </tr>`;
    });

    const htmlBody = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333; max-width: 700px;">
      <h2 style="color: #004d60;">📥 Data Export Confirmation</h2>
      <p>Your personal data export was completed on <strong>${dateNow}</strong>.</p>
      <p>The following <strong>${bookings.length} booking(s)</strong> were included in your download:</p>

      <div style="overflow-x: auto; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background-color: #004d60; color: white;">
              <th style="padding: 10px 12px; text-align: left;">Code</th>
              <th style="padding: 10px 12px; text-align: left;">Date</th>
              <th style="padding: 10px 12px; text-align: left;">Event</th>
              <th style="padding: 10px 12px; text-align: left;">Room</th>
              <th style="padding: 10px 12px; text-align: left;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${bookingRows}
          </tbody>
        </table>
      </div>

      <div style="background-color: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 15px; margin-top: 20px;">
        <p style="margin: 0; font-size: 13px; color: #92400e;">
          <strong>🔒 Security Notice:</strong> This file contains your personal information. Please store it securely and do not share it with unauthorized individuals.
        </p>
      </div>

      <p style="margin-top: 30px; color: #888; font-size: 12px;">This is an automated no-reply email confirmation.<br>Thank you for using the CCF Manila Booking System.</p>
    </div>`;

    MailApp.sendEmail({
        to: email,
        subject: subject,
        htmlBody: htmlBody,
        name: EMAIL_SENDER_NAME
    });
}

/**
 * Sends a confirmation email after a successful data deletion.
 * Lists all bookings that were anonymized as a final receipt.
 */
function sendGdprDeletionEmail(email, deletedBookings, count) {
    const subject = '⚠️ Data Deletion Confirmation - CCF Manila Booking System';
    const dateNow = Utilities.formatDate(new Date(), SCRIPT_TIMEZONE, "MMMM d, yyyy 'at' h:mm a");

    let bookingRows = '';
    deletedBookings.forEach(b => {
        bookingRows += `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-family: 'Courier New', monospace; font-size: 12px;">${b.id}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${b.date}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${b.event}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${b.room}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${b.status}</td>
        </tr>`;
    });

    const htmlBody = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333; max-width: 700px;">
      <h2 style="color: #b91c1c;">🗑️ Data Deletion Confirmation</h2>
      <p>Your personal data deletion request was processed on <strong>${dateNow}</strong>.</p>

      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; font-weight: bold; color: #991b1b;">What was removed:</p>
        <ul style="margin: 10px 0; padding-left: 20px; color: #991b1b;">
          <li>Your name, email, and leader details have been permanently anonymized.</li>
          <li>Any future confirmed bookings have been cancelled.</li>
          <li>Notes and personal information have been cleared.</li>
        </ul>
        <p style="margin: 0; font-size: 13px; color: #991b1b;"><strong>${count} booking(s)</strong> were affected.</p>
      </div>

      <p><strong>Bookings that were anonymized:</strong></p>
      <div style="overflow-x: auto; margin: 10px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background-color: #991b1b; color: white;">
              <th style="padding: 10px 12px; text-align: left;">Code</th>
              <th style="padding: 10px 12px; text-align: left;">Date</th>
              <th style="padding: 10px 12px; text-align: left;">Event</th>
              <th style="padding: 10px 12px; text-align: left;">Room</th>
              <th style="padding: 10px 12px; text-align: left;">Previous Status</th>
            </tr>
          </thead>
          <tbody>
            ${bookingRows}
          </tbody>
        </table>
      </div>

      <div style="background-color: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 15px; margin-top: 20px;">
        <p style="margin: 0; font-size: 13px; color: #92400e;">
          <strong>⚠️ Important:</strong> This action is permanent and cannot be undone. Statistical data (room, event type, date) has been retained for system reporting, but all personal identifiers have been removed. This email serves as your final receipt.
        </p>
      </div>

      <p style="margin-top: 30px; color: #888; font-size: 12px;">This is an automated no-reply email confirmation.<br>Thank you for using the CCF Manila Booking System.</p>
    </div>`;

    MailApp.sendEmail({
        to: email,
        subject: subject,
        htmlBody: htmlBody,
        name: EMAIL_SENDER_NAME
    });
}

// =============================================================================
// GDPR DATA RETENTION — Automated Personal Data Anonymization
// =============================================================================
// Run `setupRetentionTrigger()` once from the Script Editor to schedule daily cleanup.
// This anonymizes personal data from bookings older than RETENTION_DAYS.
// Statistical data (room, event, date, participants) is preserved for reporting.
// =============================================================================

const RETENTION_DAYS = 365;

/**
 * Main retention function: finds bookings older than RETENTION_DAYS
 * and replaces personal data with anonymized values.
 * Safe to run multiple times — already-anonymized rows are skipped.
 */
function anonymizeExpiredBookings() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return; // Only headers, nothing to process

    const headers = data[0];

    // Build column index map
    const idx = {};
    headers.forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });

    // Required column indices
    const dateCol = idx['date'];
    const firstNameCol = idx['first_name'];
    const lastNameCol = idx['last_name'];
    const emailCol = idx['email'];
    const leaderFirstCol = idx['leader_first_name'];
    const leaderLastCol = idx['leader_last_name'];
    const notesCol = idx['notes'];
    const idCol = idx['id'];

    // Validate we have the columns we need
    if (dateCol === undefined || firstNameCol === undefined || emailCol === undefined) {
        Logger.log('RETENTION ERROR: Missing required columns (date, first_name, or email).');
        return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    let anonymizedCount = 0;

    // Process each row (skip header)
    for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
        const row = data[rowIndex];

        // Skip already-anonymized rows
        if (row[firstNameCol] === 'Anonymized' && row[lastNameCol] === 'User') {
            continue;
        }

        // Parse the booking date
        let bookingDate;
        const rawDate = row[dateCol];
        if (rawDate instanceof Date) {
            bookingDate = rawDate;
        } else if (typeof rawDate === 'string' && rawDate.trim()) {
            bookingDate = new Date(rawDate);
        } else {
            continue; // Skip rows with no date
        }

        // Check if booking is expired
        if (isNaN(bookingDate.getTime()) || bookingDate >= cutoffDate) {
            continue; // Not expired or invalid date
        }

        // --- Anonymize personal data ---
        const sheetRow = rowIndex + 1; // 1-indexed for Sheet API

        // First Name → "Anonymized"
        if (firstNameCol !== undefined) {
            sheet.getRange(sheetRow, firstNameCol + 1).setValue('Anonymized');
        }
        // Last Name → "User"
        if (lastNameCol !== undefined) {
            sheet.getRange(sheetRow, lastNameCol + 1).setValue('User');
        }
        // Email → redacted
        if (emailCol !== undefined) {
            sheet.getRange(sheetRow, emailCol + 1).setValue('redacted@anonymized.local');
        }
        // Leader First Name → cleared
        if (leaderFirstCol !== undefined) {
            sheet.getRange(sheetRow, leaderFirstCol + 1).setValue('');
        }
        // Leader Last Name → cleared
        if (leaderLastCol !== undefined) {
            sheet.getRange(sheetRow, leaderLastCol + 1).setValue('');
        }
        // Notes → cleared (may contain personal info)
        if (notesCol !== undefined) {
            sheet.getRange(sheetRow, notesCol + 1).setValue('');
        }

        anonymizedCount++;

        // Log the anonymization
        const bookingId = (idCol !== undefined) ? row[idCol] : 'unknown';
        logActivity('GDPR_ANONYMIZE', bookingId, 'SYSTEM', {
            reason: `Booking older than ${RETENTION_DAYS} days`,
            booking_date: Utilities.formatDate(bookingDate, SCRIPT_TIMEZONE, 'yyyy-MM-dd'),
            anonymized_at: new Date().toISOString()
        });
    }

    Logger.log(`GDPR Retention: Anonymized ${anonymizedCount} expired booking(s).`);
}

/**
 * Run this ONCE from the Script Editor to set up the daily retention trigger.
 * It creates a time-driven trigger that runs anonymizeExpiredBookings() every day at 2 AM.
 */
function setupRetentionTrigger() {
    // Remove any existing retention triggers first to avoid duplicates
    removeRetentionTrigger();

    ScriptApp.newTrigger('anonymizeExpiredBookings')
        .timeBased()
        .everyDays(1)
        .atHour(2)       // Run at 2 AM server time
        .create();

    Logger.log('GDPR Retention trigger created: anonymizeExpiredBookings will run daily at 2 AM.');
}

/**
 * Removes the retention trigger (if it exists).
 * Useful for disabling the automated cleanup.
 */
function removeRetentionTrigger() {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
        if (trigger.getHandlerFunction() === 'anonymizeExpiredBookings') {
            ScriptApp.deleteTrigger(trigger);
            Logger.log('Removed existing retention trigger.');
        }
    });
}
