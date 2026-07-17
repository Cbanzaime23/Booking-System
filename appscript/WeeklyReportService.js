// ============================================================================
// WeeklyReportService.gs — Weekly Admin Reporting & Series Expiry Alerts
// ============================================================================
// Generates the Weekly Admin Report containing upcoming reservations and
// alerting admins about recurring series near expiration.
// Contains trigger installation for automatic Monday night dispatch.
// ============================================================================

/**
 * Computes and returns confirmed bookings for the upcoming week (Tue 00:00 to Mon 23:59).
 *
 * @returns {{bookings: Array<Object>, startDateStr: string, endDateStr: string, rangeLabel: string}}
 */
function getWeeklyBookings() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return { bookings: [], startDateStr: '', endDateStr: '', rangeLabel: '' };

    const now = new Date();
    
    // Day of week in Manila timezone (1 = Mon, 2 = Tue, ..., 7 = Sun)
    const dayNum = parseInt(Utilities.formatDate(now, SCRIPT_TIMEZONE, "u"), 10);
    
    // Calculate days until upcoming Tuesday
    let daysUntilTue = (2 - dayNum + 7) % 7;
    if (daysUntilTue === 0 && dayNum !== 2) daysUntilTue = 7;
    
    const year = parseInt(Utilities.formatDate(now, SCRIPT_TIMEZONE, "yyyy"), 10);
    const month = parseInt(Utilities.formatDate(now, SCRIPT_TIMEZONE, "MM"), 10) - 1;
    const date = parseInt(Utilities.formatDate(now, SCRIPT_TIMEZONE, "dd"), 10);

    const tueDate = new Date(year, month, date + daysUntilTue, 0, 0, 0);
    const monDate = new Date(year, month, date + daysUntilTue + 6, 23, 59, 59);

    const allBookings = getActiveBookings(sheet);

    const weeklyBookings = allBookings
        .filter(b => {
            if (!b.start_iso) return false;
            const cleanStart = String(b.start_iso).replace(/Z$/i, '');
            const bStart = new Date(cleanStart + '+08:00');
            return bStart >= tueDate && bStart <= monDate;
        })
        .sort((a, b) => {
            const cleanA = String(a.start_iso).replace(/Z$/i, '');
            const cleanB = String(b.start_iso).replace(/Z$/i, '');
            return new Date(cleanA + '+08:00') - new Date(cleanB + '+08:00');
        })
        .map(b => {
            const cleanStart = String(b.start_iso).replace(/Z$/i, '');
            const cleanEnd = String(b.end_iso).replace(/Z$/i, '');
            const startDate = new Date(cleanStart + '+08:00');
            const endDate = new Date(cleanEnd + '+08:00');
            return {
                id: b.id,
                date: Utilities.formatDate(startDate, SCRIPT_TIMEZONE, "yyyy-MM-dd"),
                dayLabel: Utilities.formatDate(startDate, SCRIPT_TIMEZONE, "EEE, MMM d"),
                startTime: Utilities.formatDate(startDate, SCRIPT_TIMEZONE, "h:mm a"),
                endTime: Utilities.formatDate(endDate, SCRIPT_TIMEZONE, "h:mm a"),
                event: b.event || 'Untitled Event',
                room: b.room || 'Unassigned',
                first_name: b.first_name || '',
                last_name: b.last_name || '',
                bookerName: `${b.first_name || ''} ${b.last_name || ''}`.trim() || 'Unknown',
                participants: b.participantCount || b.participants || 0
            };
        });

    return {
        bookings: weeklyBookings,
        startDateStr: Utilities.formatDate(tueDate, SCRIPT_TIMEZONE, "MMM d"),
        endDateStr: Utilities.formatDate(monDate, SCRIPT_TIMEZONE, "MMM d, yyyy"),
        rangeLabel: `${Utilities.formatDate(tueDate, SCRIPT_TIMEZONE, "EEE, MMM d")} – ${Utilities.formatDate(monDate, SCRIPT_TIMEZONE, "EEE, MMM d, yyyy")}`
    };
}


/**
 * Scans all recurring booking series and returns those with <= thresholdRemaining future occurrences.
 *
 * @param {number} [thresholdRemaining=SERIES_ALERT_THRESHOLD] - Maximum remaining occurrences to trigger alert.
 * @returns {Array<Object>} List of expiring series objects.
 */
function getExpiringSeries(thresholdRemaining = SERIES_ALERT_THRESHOLD) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return [];

    const range = sheet.getDataRange();
    if (range.getNumRows() <= 1) return [];

    const data = range.getValues();
    const headers = data.shift();
    const idx = {
        id: headers.indexOf('id'),
        start: headers.indexOf('start_iso'),
        event: headers.indexOf('event'),
        room: headers.indexOf('room'),
        first: headers.indexOf('first_name'),
        last: headers.indexOf('last_name'),
        email: headers.indexOf('email'),
        status: headers.indexOf('status'),
        recurrence: headers.indexOf('recurrence_id')
    };

    if (idx.status === -1 || idx.recurrence === -1 || idx.start === -1) return [];

    const now = new Date();

    // Group confirmed rows by recurrence_id
    const groups = {};
    data.forEach(row => {
        const recurrenceId = row[idx.recurrence];
        const status = row[idx.status];
        if (!recurrenceId || String(recurrenceId).trim() === '' || status !== 'confirmed') return;

        const recKey = String(recurrenceId).trim();
        if (!groups[recKey]) {
            groups[recKey] = [];
        }

        let startIso = row[idx.start];
        if (startIso instanceof Date) {
            startIso = Utilities.formatDate(startIso, SCRIPT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss'Z'");
        }

        groups[recKey].push({
            id: row[idx.id],
            start_iso: startIso,
            event: row[idx.event] || '',
            room: row[idx.room] || '',
            first_name: row[idx.first] || '',
            last_name: row[idx.last] || '',
            email: row[idx.email] || ''
        });
    });

    const expiringSeries = [];

    Object.keys(groups).forEach(recId => {
        const rows = groups[recId];

        const futureRows = rows.filter(r => {
            if (!r.start_iso) return false;
            const cleanStart = String(r.start_iso).replace(/Z$/i, '');
            const startDate = new Date(cleanStart + '+08:00');
            return startDate > now;
        }).sort((a, b) => {
            const cleanA = String(a.start_iso).replace(/Z$/i, '');
            const cleanB = String(b.start_iso).replace(/Z$/i, '');
            return new Date(cleanA + '+08:00') - new Date(cleanB + '+08:00');
        });

        if (futureRows.length > 0 && futureRows.length <= thresholdRemaining) {
            const sample = futureRows[0];
            const lastRow = futureRows[futureRows.length - 1];
            const lastDateObj = new Date(String(lastRow.start_iso).replace(/Z$/i, '') + '+08:00');
            const formattedLastDate = Utilities.formatDate(lastDateObj, SCRIPT_TIMEZONE, "MMM d, yyyy (EEE)");

            const prefillParams = `prefill_event=${encodeURIComponent(sample.event)}&prefill_room=${encodeURIComponent(sample.room)}&prefill_recurrence=true`;

            expiringSeries.push({
                recurrence_id: recId,
                event: sample.event,
                room: sample.room,
                futureCount: futureRows.length,
                lastDate: formattedLastDate,
                bookerName: `${sample.first_name} ${sample.last_name}`.trim(),
                bookerEmail: sample.email,
                prefillParams: prefillParams
            });
        }
    });

    return expiringSeries.sort((a, b) => a.futureCount - b.futureCount || a.event.localeCompare(b.event));
}

/**
 * Reads configured report recipient email addresses from the Settings sheet.
 * Supports multiple rows with key 'Report Recipients' (or legacy 'Admin Alert Email').
 *
 * @param {Spreadsheet} ss - The Google Spreadsheet instance.
 * @returns {Array<string>} List of recipient email addresses.
 */
function getReportRecipients(ss) {
    const sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    const recipients = [];

    data.forEach(row => {
        if (!row[0]) return;
        const key = row[0].toString().trim();
        const val = row[1] ? row[1].toString().trim() : '';

        if ((key === ADMIN_ALERT_EMAIL_SETTING || key === 'Admin Alert Email') && val !== '') {
            if (!recipients.includes(val)) {
                recipients.push(val);
            }
        }
    });

    return recipients;
}

/**
 * Sends the consolidated Weekly Admin Report email containing upcoming week reservations
 * and expiring recurring series alerts to all configured report recipients.
 *
 * @returns {{success: boolean, message: string}}
 */
function sendWeeklyAdminReport() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const recipients = getReportRecipients(ss);

    if (recipients.length === 0) {
        Logger.log('Weekly Admin Report skipped: No recipient emails configured in Settings sheet under "Report Recipients".');
        logActivity('Weekly Admin Report Skipped', 'N/A', 'SYSTEM', { reason: 'No recipients configured' });
        return { success: false, message: 'No recipients configured in Settings sheet.' };
    }

    const reportData = getWeeklyBookings();
    const weeklyBookings = reportData.bookings;
    const expiringSeries = getExpiringSeries(SERIES_ALERT_THRESHOLD);

    const dateRangeLabel = reportData.rangeLabel;

    let subject;
    if (expiringSeries.length > 0) {
        subject = `📋 CCF Manila — Weekly Report + ⚠️ ${expiringSeries.length} Series Expiring (${dateRangeLabel})`;
    } else {
        subject = `📋 CCF Manila — Weekly Reservation Report (${dateRangeLabel})`;
    }

    const toHeader = recipients.join(', ');

    let htmlBody = `<div style="font-family: Arial, sans-serif; font-size: 15px; color: #333; line-height: 1.6; max-width: 680px; margin: 0 auto;">`;

    htmlBody += `
    <div style="background-color: #004d60; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
        <h2 style="margin: 0; font-size: 20px; font-weight: bold;">CCF Manila Room Reservation System</h2>
        <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Weekly Admin Report · ${dateRangeLabel}</p>
    </div>
    <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; padding: 24px;">
    `;

    // SECTION 1: Weekly Bookings
    htmlBody += `
    <div style="margin-bottom: 30px;">
        <h3 style="color: #004d60; font-size: 16px; border-bottom: 2px solid #004d60; padding-bottom: 6px; margin-top: 0;">
            📅 RESERVATIONS THIS WEEK (${weeklyBookings.length})
        </h3>
    `;

    if (weeklyBookings.length === 0) {
        htmlBody += `<p style="color: #64748b; font-style: italic;">No reservations scheduled for the coming week (${dateRangeLabel}).</p>`;
    } else {
        htmlBody += `
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px;">
            <thead>
                <tr style="background-color: #f1f5f9; text-align: left; color: #475569;">
                    <th style="padding: 8px 10px; border-bottom: 1px solid #cbd5e1;">Day / Date</th>
                    <th style="padding: 8px 10px; border-bottom: 1px solid #cbd5e1;">Event</th>
                    <th style="padding: 8px 10px; border-bottom: 1px solid #cbd5e1;">Room</th>
                    <th style="padding: 8px 10px; border-bottom: 1px solid #cbd5e1;">Time</th>
                    <th style="padding: 8px 10px; border-bottom: 1px solid #cbd5e1;">Booker</th>
                    <th style="padding: 8px 10px; border-bottom: 1px solid #cbd5e1; text-align: center;">Pax</th>
                </tr>
            </thead>
            <tbody>
        `;

        weeklyBookings.forEach((b, idx) => {
            const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
            htmlBody += `
            <tr style="background-color: ${bg}; border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 10px; font-weight: bold; color: #1e293b;">${b.dayLabel}</td>
                <td style="padding: 8px 10px; color: #0f172a;">${escapeHtml(b.event)}</td>
                <td style="padding: 8px 10px; color: #0284c7; font-weight: 600;">${escapeHtml(b.room)}</td>
                <td style="padding: 8px 10px; color: #334155;">${b.startTime} - ${b.endTime}</td>
                <td style="padding: 8px 10px; color: #475569;">${escapeHtml(b.bookerName)}</td>
                <td style="padding: 8px 10px; text-align: center; color: #475569;">${b.participants}</td>
            </tr>
            `;
        });

        htmlBody += `
            </tbody>
        </table>
        `;
    }
    htmlBody += `</div>`;

    // SECTION 2: Expiring Series (Only rendered if > 0)
    if (expiringSeries.length > 0) {
        htmlBody += `
        <div style="margin-bottom: 20px; background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 16px;">
            <h3 style="color: #92400e; font-size: 16px; margin-top: 0; margin-bottom: 10px;">
                ⚠️ RECURRING SERIES ENDING SOON (${expiringSeries.length})
            </h3>
            <p style="font-size: 13px; color: #78350f; margin-bottom: 12px;">
                The following recurring series have 2 or fewer scheduled occurrences remaining. Please review and rebook them to prevent scheduling gaps.
            </p>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background-color: #fef3c7; text-align: left; color: #92400e;">
                        <th style="padding: 8px 10px; border-bottom: 1px solid #fde68a;">Event</th>
                        <th style="padding: 8px 10px; border-bottom: 1px solid #fde68a;">Room</th>
                        <th style="padding: 8px 10px; border-bottom: 1px solid #fde68a; text-align: center;">Remaining</th>
                        <th style="padding: 8px 10px; border-bottom: 1px solid #fde68a;">Last Date</th>
                        <th style="padding: 8px 10px; border-bottom: 1px solid #fde68a;">Booker</th>
                    </tr>
                </thead>
                <tbody>
        `;

        expiringSeries.forEach((s) => {
            const badgeBg = s.futureCount === 1 ? '#fee2e2' : '#fef3c7';
            const badgeText = s.futureCount === 1 ? '#991b1b' : '#92400e';
            htmlBody += `
            <tr style="border-bottom: 1px solid #fef3c7;">
                <td style="padding: 8px 10px; font-weight: bold; color: #1e293b;">${escapeHtml(s.event)}</td>
                <td style="padding: 8px 10px; color: #0284c7;">${escapeHtml(s.room)}</td>
                <td style="padding: 8px 10px; text-align: center;">
                    <span style="background-color: ${badgeBg}; color: ${badgeText}; font-weight: bold; padding: 2px 8px; border-radius: 12px; font-size: 11px;">
                        ${s.futureCount} ${s.futureCount === 1 ? 'occurrence' : 'occurrences'}
                    </span>
                </td>
                <td style="padding: 8px 10px; color: #475569;">${s.lastDate}</td>
                <td style="padding: 8px 10px; color: #475569;">${escapeHtml(s.bookerName)}</td>
            </tr>
            `;
        });

        htmlBody += `
                </tbody>
            </table>
        </div>
        `;
    }

    // Footer
    htmlBody += `
        <div style="margin-top: 25px; border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; color: #94a3b8; font-size: 12px;">
            <p style="margin: 0;">This is an automated weekly admin report sent every Monday night after the booking window closes.</p>
            <p style="margin: 4px 0 0 0;">God Bless · CCF Manila Room Reservation System</p>
        </div>
    </div>
    </div>
    `;

    MailApp.sendEmail({
        to: toHeader,
        subject: subject,
        htmlBody: htmlBody,
        name: EMAIL_SENDER_NAME
    });

    logActivity('Weekly Admin Report Sent', 'N/A', 'SYSTEM', {
        recipients: toHeader,
        bookingCount: weeklyBookings.length,
        expiringCount: expiringSeries.length
    });

    return { success: true, message: `Report sent to ${toHeader}` };
}

/**
 * Installs a weekly time-driven trigger to run sendWeeklyAdminReport on Mondays at 22:00-23:00 Manila time.
 * Deletes any existing triggers for this function to prevent duplicate triggers.
 *
 * @returns {{success: boolean, message: string}}
 */
function installWeeklyReportTrigger() {
    const functionName = 'sendWeeklyAdminReport';
    const triggers = ScriptApp.getProjectTriggers();

    triggers.forEach(t => {
        if (t.getHandlerFunction() === functionName) {
            ScriptApp.deleteTrigger(t);
        }
    });

    ScriptApp.newTrigger(functionName)
        .timeBased()
        .onWeekDay(ScriptApp.WeekDay.MONDAY)
        .atHour(22)
        .create();

    Logger.log('Weekly Admin Report trigger installed successfully for Mondays 22:00–23:00 Manila time.');
    return { success: true, message: 'Trigger installed for Mondays 22:00-23:00 Manila time.' };
}

/**
 * Helper to escape HTML characters in string inputs.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
