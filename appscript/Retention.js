// ============================================================================
// GdprService.gs — GDPR Subject Rights (Export & Delete)
// ============================================================================

/**
 * Exports all booking data associated with a user's email after
 * verifying their identity via a booking code.
 * Sends a confirmation email with a summary of exported records.
 *
 * @param {Object} payload - Request payload with `email` and `bookingCode`.
 * @returns {Object} Success response with exported data array, or error.
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
    const idx = {};
    headers.forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });

    const emailCol = idx['email'];
    const idCol = idx['id'];
    if (emailCol === undefined) return { success: false, message: 'Server error: email column not found.' };
    if (idCol === undefined) return { success: false, message: 'Server error: id column not found.' };

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
        const booking = {};
        headers.forEach((header, i) => {
            let value = row[i];
            if (value instanceof Date) value = Utilities.formatDate(value, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
            booking[header] = value;
        });
        userBookings.push(booking);
    });

    logActivity('GDPR_EXPORT', bookingCode, 'USER', { email: userEmail, records_exported: userBookings.length, exported_at: new Date().toISOString() });

    if (userBookings.length === 0) return { success: false, message: 'No bookings found for this email address.' };

    sendGdprExportEmail(userEmail, userBookings);
    return { success: true, data: userBookings };
}

/**
 * Permanently anonymizes all booking data for a user after identity
 * verification. Replaces names and email with placeholder values,
 * cancels future confirmed bookings, and clears personal notes.
 * Sends a confirmation email with a summary of affected records.
 *
 * @param {Object} payload - Request payload with `email` and `bookingCode`.
 * @returns {Object} Success response with count of anonymized records, or error.
 */
function handleDeleteUserData(payload) {
    const userEmail = payload.email;
    const bookingCode = (payload.bookingCode || '').toUpperCase();
    if (!userEmail) return { success: false, message: 'Email is required.' };
    if (!bookingCode || bookingCode.length < 6) return { success: false, message: 'Booking Code is required for verification.' };

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return { success: false, message: 'Bookings sheet not found.' };

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
    if (!codeMatch) return { success: false, message: 'Invalid Booking Code.' };

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idx = {};
    headers.forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });

    const emailCol = idx['email'], firstNameCol = idx['first_name'], lastNameCol = idx['last_name'];
    const leaderFirstCol = idx['leader_first_name'], leaderLastCol = idx['leader_last_name'];
    const notesCol = idx['notes'], statusCol = idx['status'], startCol = idx['start_iso'], idCol = idx['id'];

    if (emailCol === undefined || firstNameCol === undefined) return { success: false, message: 'Server error: required columns not found.' };

    const now = new Date();
    let anonymizedCount = 0;
    const deletedBookingsSummary = [];

    for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
        const row = data[rowIndex];
        const rowEmail = row[emailCol];
        if (!rowEmail || rowEmail.toString().toLowerCase() !== userEmail.toLowerCase()) continue;

        const sheetRow = rowIndex + 1;
        const dateCol = idx['date'], eventCol = idx['event'], roomCol = idx['room'], paxCol = idx['participants'];
        let bookingDate = row[startCol];
        if (bookingDate instanceof Date) bookingDate = Utilities.formatDate(bookingDate, SCRIPT_TIMEZONE, "MMM d, yyyy h:mm a");

        deletedBookingsSummary.push({
            id: ((idCol !== undefined) ? row[idCol] : 'N/A').toString().substring(0, 12).toUpperCase(),
            date: bookingDate || 'N/A',
            event: (eventCol !== undefined) ? row[eventCol] : 'N/A',
            room: (roomCol !== undefined) ? row[roomCol] : 'N/A',
            participants: (paxCol !== undefined) ? row[paxCol] : 'N/A',
            status: (statusCol !== undefined) ? row[statusCol] : 'N/A'
        });

        if (statusCol !== undefined && startCol !== undefined) {
            let startDate = row[startCol];
            if (!(startDate instanceof Date)) startDate = new Date(startDate);
            if (!isNaN(startDate.getTime()) && startDate > now && row[statusCol] === 'confirmed') {
                sheet.getRange(sheetRow, statusCol + 1).setValue('cancelled_gdpr');
            }
        }

        if (firstNameCol !== undefined) sheet.getRange(sheetRow, firstNameCol + 1).setValue('Anonymized');
        if (lastNameCol !== undefined) sheet.getRange(sheetRow, lastNameCol + 1).setValue('User');
        if (emailCol !== undefined) sheet.getRange(sheetRow, emailCol + 1).setValue('redacted@anonymized.local');
        if (leaderFirstCol !== undefined) sheet.getRange(sheetRow, leaderFirstCol + 1).setValue('');
        if (leaderLastCol !== undefined) sheet.getRange(sheetRow, leaderLastCol + 1).setValue('');
        if (notesCol !== undefined) sheet.getRange(sheetRow, notesCol + 1).setValue('');

        anonymizedCount++;
        const bookingId = (idCol !== undefined) ? row[idCol] : 'unknown';
        logActivity('GDPR_ERASURE', bookingId, 'USER', { reason: 'User-initiated data deletion request', original_email: userEmail, anonymized_at: new Date().toISOString() });
    }

    if (anonymizedCount === 0) return { success: false, message: 'No bookings found for this email address.' };
    sendGdprDeletionEmail(userEmail, deletedBookingsSummary, anonymizedCount);
    return { success: true, count: anonymizedCount, message: 'Successfully anonymized ' + anonymizedCount + ' booking(s).' };
}
