// ============================================================================
// BookingService.gs — Core Booking Business Logic
// ============================================================================
// Handles creating, cancelling, moving, fetching bookings, blocking dates,
// and recurrence logic. Delegates to Database.gs for sheet I/O and
// EmailService.gs for notifications.
// ============================================================================

/**
 * Creates a new booking with Main Hall prioritization, duplicate detection,
 * race condition guard, and recurrence support.
 */
function handleCreateBooking(payload) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
        const isAdmin = (payload.adminPin && payload.adminPin === ADMIN_PIN);
        if (payload.adminPin && !isAdmin) {
            throw new Error("Invalid Admin PIN. Booking not created.");
        }

        // Reservation window enforcement (non-admin only)
        if (!isAdmin) {
            const ss_check = SpreadsheetApp.openById(SPREADSHEET_ID);
            const windowSettings = getReservationWindowSettings(ss_check);
            if (!isReservationWindowCurrentlyOpen(windowSettings)) {
                throw new Error("Reservation window is currently closed. Please try again when the booking window reopens.");
            }
        }

        const requestedRoom = payload.room;
        let finalRoom = requestedRoom;
        const newStart = new Date(payload.start_iso);
        const newEnd = new Date(payload.end_iso);
        payload.participants = parseInt(payload.participants, 10);

        const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        const sheet = ss.getSheetByName(SHEET_NAME);

        // Check blocked dates
        const blockedDates = getBlockedDates(ss);
        const isBlocked = checkIsBlocked(newStart, requestedRoom, blockedDates);
        if (isBlocked) throw new Error(`The room ${requestedRoom} is closed on this date: ${isBlocked.reason}`);

        const allBookings = getActiveBookings(sheet);

        // Main Hall prioritization (squeeze logic)
        if (!isAdmin && requestedRoom !== "Main Hall") {
            const mainHallRules = ROOM_CONFIG["Main Hall"];
            const mainHallConcurrent = findConcurrentBookings(newStart, newEnd, allBookings, "Main Hall");
            const mainHallCurrentPax = mainHallConcurrent.reduce((sum, b) => sum + b.participantCount, 0);
            const canFitGroup = (mainHallConcurrent.length + 1) <= mainHallRules.MAX_CONCURRENT_GROUPS;
            const canFitPax = (mainHallCurrentPax + payload.participants) <= mainHallRules.MAX_TOTAL_PARTICIPANTS;
            const meetsSizeRules = (payload.participants >= mainHallRules.MIN_BOOKING_SIZE) && (payload.participants <= mainHallRules.MAX_BOOKING_SIZE);
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

        // --- NEW: Dleaders Name Validation ---
        const dleaderValidation = validateNamesAgainstList(
            payload.first_name, 
            payload.last_name, 
            payload.leader_first_name, 
            payload.leader_last_name
        );
        
        if (!dleaderValidation.passed) {
            logActivity('Validation Failed', 'N/A', payload.adminPin, {
                reason: dleaderValidation.reason,
                user: `${payload.first_name} ${payload.last_name}`,
                leader: `${payload.leader_first_name} ${payload.leader_last_name}`
            });
            
            // Check if the validation failed due to a system crash (e.g. Google Sheets API down) vs an actual name mismatch
            const isSystemError = dleaderValidation.reason.includes("System error");
            
            return {
                success: false,
                message: isSystemError ? dleaderValidation.reason : "Your reservation was denied as the user and/or leader do not exist in the current CCF Manila Dleaders List."
            };
        }

        // Recurrence Logic
        if (isAdmin && payload.recurrence && payload.recurrence !== 'none') {
            return handleRecurrentBooking(payload, rules, allBookings, sheet, requestedRoom, blockedDates);
        }

        // Duplicate booking detection
        const payloadStartIso = String(payload.start_iso).replace(/Z$/i, '');
        const existingDuplicate = allBookings.find(b => {
            const bStartClean = String(b.start_iso).replace(/Z$/i, '');
            return b.email && b.email.toLowerCase() === payload.email.toLowerCase()
                && bStartClean === payloadStartIso
                && b.room === finalRoom;
        });
        if (existingDuplicate) {
            throw new Error('You already have a booking for this time slot.');
        }

        // Race condition guard (optimistic locking)
        const freshBookings = getActiveBookings(sheet);
        const freshConcurrent = findConcurrentBookings(newStart, newEnd, freshBookings, finalRoom);
        const freshPax = freshConcurrent.reduce((sum, b) => sum + b.participantCount, 0);
        if (freshConcurrent.length + 1 > rules.MAX_CONCURRENT_GROUPS) {
            throw new Error('Sorry, this slot was just filled by another user. Please choose a different time.');
        }
        if (freshPax + payload.participants > rules.MAX_TOTAL_PARTICIPANTS) {
            throw new Error('Sorry, this slot was just filled by another user. Please choose a different time.');
        }

        const newId = generateUUID();
        appendBookingRow(sheet, newId, payload, newStart, newEnd, null);

        try {
            sendConfirmationEmail(payload, newId, newStart, newEnd, requestedRoom, payload.app_url);
        } catch (emailError) {
            Logger.log(`Booking ${newId} created, but email failed: ${emailError.message}`);
        }

        const result = { 
            success: true, 
            message: 'Booking confirmed!', 
            id: newId, 
            bookedRoom: finalRoom, 
            requestedRoom: requestedRoom,
            start_iso: payload.start_iso,
            end_iso: payload.end_iso 
        };
        logActivity('Create', newId, payload.adminPin, payload);
        return result;
    } finally {
        lock.releaseLock();
    }
}

/**
 * Handles saving recurrent bookings with blocked date check.
 */
function handleRecurrentBooking(payload, rules, allBookings, sheet, requestedRoom, blockedDates) {
    const recurrenceId = Utilities.getUuid();
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

        const today = new Date();
        if (iterStart < today) {
            if (i > 0) { failCount++; continue; }
        }

        if (checkIsBlocked(iterStart, payload.room, blockedDates)) {
            failCount++;
            continue;
        }

        // Duplicate detection per iteration
        const iterStartIso = Utilities.formatDate(iterStart, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
        const isDuplicate = allBookings.some(b => {
            const bStartClean = String(b.start_iso).replace(/Z$/i, '');
            return b.email && b.email.toLowerCase() === payload.email.toLowerCase()
                && bStartClean === iterStartIso
                && b.room === payload.room;
        });
        if (isDuplicate) {
            failCount++;
            continue;
        }

        const concurrent = findConcurrentBookings(iterStart, iterEnd, allBookings, payload.room);
        const currentPax = concurrent.reduce((sum, b) => sum + b.participantCount, 0);
        const hasCapacity = (concurrent.length + 1) <= rules.MAX_CONCURRENT_GROUPS && (currentPax + payload.participants) <= rules.MAX_TOTAL_PARTICIPANTS;

        if (hasCapacity) {
            successCount++;
            const newId = generateUUID();
            appendBookingRow(sheet, newId, payload, iterStart, iterEnd, recurrenceId);

            if (firstId === null) { firstId = newId; firstStart = iterStart; firstEnd = iterEnd; }

            const formattedStartIso = Utilities.formatDate(iterStart, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss'Z'");
            const formattedEndIso = Utilities.formatDate(iterEnd, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss'Z'");
            allBookings.push({ id: newId, start_iso: formattedStartIso, end_iso: formattedEndIso, participantCount: payload.participants, room: payload.room });
        } else {
            failCount++;
        }
    }

    if (firstId) {
        try { sendConfirmationEmail(payload, firstId, firstStart, firstEnd, requestedRoom, payload.app_url); } catch (e) { Logger.log(e.message); }
    } else {
        throw new Error("No recurrent events could be booked due to conflicts or blocked dates.");
    }
    return { success: true, message: `Recurrent: ${successCount} booked, ${failCount} failed.`, id: firstId, bookedRoom: payload.room, requestedRoom: requestedRoom };
}

/**
 * Cancels a single booking or an entire series.
 */
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

                // Verify Booking Code
                let isUserVerified = false;
                if (bookingCode && bookingCode.length >= 8) {
                    if (data[i][idIndex].toString().toUpperCase().startsWith(bookingCode.toUpperCase())) {
                        isUserVerified = true;
                    }
                }

                if (data[i][statusIndex] === 'cancelled') throw new Error("Already cancelled.");

                // Detect admin booking
                const leaderFirstIndex = headers.indexOf('leader_first_name');
                const leaderFirstName = (leaderFirstIndex !== -1) ? data[i][leaderFirstIndex] : 'Unknown';
                const isAdminBooking = (leaderFirstName === '' || leaderFirstName === null);

                if (isAdminBooking) {
                    if (!isAuthAdmin) {
                        throw new Error("This is an Admin booking. Please enter the Admin PIN to cancel.");
                    }
                } else {
                    if (!isAuthAdmin && !isUserVerified) {
                        throw new Error("Verification failed. Invalid Booking Code.");
                    }
                }

                // Series cancellation
                const recurrenceCol = headers.indexOf('recurrence_id');
                const recurrenceId = (recurrenceCol !== -1) ? data[i][recurrenceCol] : null;

                if (payload.cancelSeries && recurrenceId && isAuthAdmin) {
                    let count = 0;
                    for (let j = 1; j < data.length; j++) {
                        if (data[j][recurrenceCol] === recurrenceId && data[j][statusIndex] !== 'cancelled') {
                            sheet.getRange(j + 1, statusIndex + 1).setValue('cancelled');
                            count++;
                        }
                    }
                    logActivity('Cancel Series', bookingId, adminPin, { bookingCode, reason: "Series Cancelled", count });
                    return { success: true, message: `Series cancelled (${count} bookings).` };
                }

                // Single cancel
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
 * Moves a booking to a new date/time/room.
 */
function handleMoveBooking(payload) {
    if (payload.adminPin !== ADMIN_PIN) {
        return { success: false, message: "Invalid Admin PIN." };
    }

    // Reservation window enforcement — moves are admin-only, but double-check
    const ss_window = SpreadsheetApp.openById(SPREADSHEET_ID);
    const windowSettings = getReservationWindowSettings(ss_window);
    if (!isReservationWindowCurrentlyOpen(windowSettings)) {
        // Even admin can move, but log it
        logActivity('Move (Window Closed)', payload.bookingId, payload.adminPin, payload);
    }
    var bookingId = payload.bookingId;
    var newRoom = payload.newRoom;
    var newStartIso = payload.start_iso;
    var newEndIso = payload.end_iso;
    var newTableId = payload.table_id; // Add table_id
    var reason = payload.reason;
    var newDate = Utilities.formatDate(new Date(newStartIso), 'Asia/Manila', 'yyyy-MM-dd');

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Bookings");
    var data = sheet.getDataRange().getValues();
    var headers = data[0]; // Extract headers to find table_id dynamically
    var tableIdColIndex = headers.indexOf('table_id') + 1; // +1 for 1-based indexing in getRange

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
    if (tableIdColIndex > 0) {
        sheet.getRange(rowIndex, tableIdColIndex).setValue(newTableId || '');
    }

    var currentNotes = bookingRow[14] || "";
    var noteUpdate = " [Admin Moved: " + reason + "]";
    sheet.getRange(rowIndex, 15).setValue(currentNotes + noteUpdate);

    sendMoveNotificationEmail(userEmail, userFirstName, eventName, newRoom, newStartIso, newEndIso, reason, bookingId);

    logActivity('Move', bookingId, payload.adminPin, payload);
    return { success: true, message: "Booking moved successfully." };
}

/**
 * Fetches all confirmed bookings, blocked dates, and global settings.
 */
function handleFetchAllBookings() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);

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
            email: headers.indexOf('email'), recurrence: headers.indexOf('recurrence_id'),
            leader_first: headers.indexOf('leader_first_name'), table: headers.indexOf('table_id')
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
                        first_name: row[idx.first], last_name: row[idx.last],
                        event: row[idx.event], room: row[idx.room],
                        participants: row[idx.pax],
                        status: row[idx.status],
                        recurrence_id: idx.recurrence !== -1 ? row[idx.recurrence] : null,
                        leader_first_name: idx.leader_first !== -1 ? row[idx.leader_first] : '',
                        table_id: idx.table !== -1 ? row[idx.table] : null
                    };
                });
        }
    }

    const blocked = getBlockedDates(ss);
    const settings = getGlobalSettings(ss);

    // Reservation window — wrapped in try-catch so errors don't break the entire response
    let reservationWindowData = { openDay: 0, openTime: '08:00', closeDay: 1, closeTime: '20:00', isOpen: true };
    try {
        const reservationWindow = getReservationWindowSettings(ss);
        const windowIsOpen = isReservationWindowCurrentlyOpen(reservationWindow);
        reservationWindowData = { ...reservationWindow, isOpen: windowIsOpen };
    } catch (rwError) {
        Logger.log('Reservation window error (non-fatal): ' + rwError.toString());
    }

    return {
        success: true,
        data: bookings,
        blocked_dates: blocked,
        announcement: settings,
        reservation_window: reservationWindowData
    };
}

/**
 * Fetches future confirmed bookings for a specific user email.
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

    if (Object.values(idx).some(i => i === -1)) {
        return { success: false, message: "Server Error: Missing columns." };
    }

    const now = new Date();
    const safeBookings = [];

    data.forEach(row => {
        const status = row[idx.status];
        const rowEmail = row[idx.email];

        if (status !== 'confirmed') return;
        if (!rowEmail || rowEmail.toString().toLowerCase() !== userEmail.toLowerCase()) return;

        let startIso = row[idx.start];
        let endIso = row[idx.end];
        let startDate = (startIso instanceof Date) ? startIso : new Date(startIso);

        if (startDate <= now) return;

        if (startIso instanceof Date) startIso = Utilities.formatDate(startIso, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss'Z'");
        if (endIso instanceof Date) endIso = Utilities.formatDate(endIso, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss'Z'");

        safeBookings.push({
            id: row[idx.id],
            date: Utilities.formatDate(startDate, SCRIPT_TIMEZONE, "MMM d, yyyy"),
            start_time: Utilities.formatDate(startDate, SCRIPT_TIMEZONE, "h:mm a"),
            end_time: (endIso instanceof Date || typeof endIso === 'string') ? Utilities.formatDate(new Date(endIso), SCRIPT_TIMEZONE, "h:mm a") : '',
            event: row[idx.event],
            room: row[idx.room]
        });
    });

    return { success: true, bookings: safeBookings };
}

/**
 * Blocks a date and auto-cancels all existing bookings on that date.
 */
function handleBlockDate(payload) {
    if (payload.adminPin !== ADMIN_PIN) {
        return { success: false, message: "Invalid Admin PIN." };
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // Add blocked date entry
    let blockedSheet = ss.getSheetByName(BLOCKED_SHEET_NAME);
    if (!blockedSheet) {
        blockedSheet = ss.insertSheet(BLOCKED_SHEET_NAME);
        blockedSheet.appendRow(["Date", "Room", "Reason"]);
    }
    blockedSheet.appendRow([payload.date, payload.room, payload.reason]);

    // Find and cancel all confirmed bookings on this date
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

    const blockedDateStr = payload.date;
    const blockedRoom = payload.room;
    const reason = payload.reason;
    const cancelledBookings = [];

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row[statusIndex] !== 'confirmed') continue;

        let bookingStartIso = row[startIsoIndex];
        let bookingDateStr;
        if (bookingStartIso instanceof Date) {
            bookingDateStr = Utilities.formatDate(bookingStartIso, SCRIPT_TIMEZONE, "yyyy-MM-dd");
            bookingStartIso = Utilities.formatDate(bookingStartIso, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
        } else {
            const cleanIso = String(bookingStartIso).replace(/Z$/i, '');
            const parsed = new Date(cleanIso);
            if (!isNaN(parsed.getTime())) {
                bookingDateStr = Utilities.formatDate(parsed, SCRIPT_TIMEZONE, "yyyy-MM-dd");
            } else {
                bookingDateStr = String(bookingStartIso).substring(0, 10);
            }
        }

        if (bookingDateStr !== blockedDateStr) continue;
        if (blockedRoom !== 'All Rooms' && row[roomIndex] !== blockedRoom) continue;

        // Cancel this booking
        bookingsSheet.getRange(i + 1, statusIndex + 1).setValue('cancelled');

        if (notesIndex !== -1) {
            const oldNotes = row[notesIndex] || "";
            bookingsSheet.getRange(i + 1, notesIndex + 1).setValue(`[Auto-Cancelled: Blocked Date - ${reason}] ${oldNotes}`);
        }

        logActivity('Auto-Cancel (Blocked Date)', row[idIndex], 'SYSTEM', {
            reason: reason,
            blockedRoom: blockedRoom,
            blockedDate: blockedDateStr
        });

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

    // Send cancellation emails
    cancelledBookings.forEach(booking => {
        if (booking.email) {
            try {
                sendBlockedDateCancellationEmail(booking, reason, blockedDateStr);
            } catch (emailError) {
                Logger.log('Failed to send cancellation email to ' + booking.email + ': ' + emailError.toString());
            }
        }
    });

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
 * Updates reservation window settings.
 * Requires admin PIN. Saves to the Settings sheet.
 */
function handleUpdateReservationWindow(payload) {
    if (payload.admin_pin !== ADMIN_PIN) {
        return { success: false, message: "Invalid Admin PIN." };
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    saveReservationWindowSettings(ss, {
        openDay: parseInt(payload.openDay, 10),
        openTime: payload.openTime,
        closeDay: parseInt(payload.closeDay, 10),
        closeTime: payload.closeTime
    });

    logActivity('Update Reservation Window', 'N/A', payload.admin_pin, {
        openDay: payload.openDay, openTime: payload.openTime,
        closeDay: payload.closeDay, closeTime: payload.closeTime
    });

    return { success: true, message: "Reservation window settings updated successfully." };
}

/**
 * Verifies an Admin PIN. Used by the role selection modal on the booking page.
 */
function handleVerifyAdmin(payload) {
    if (payload.admin_pin === ADMIN_PIN) {
        return { success: true, message: "Admin verified." };
    }
    return { success: false, message: "Invalid Admin PIN." };
}
