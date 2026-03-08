// ============================================================================
// EmailService.gs — Email Notifications
// ============================================================================
// All email sending functions: booking confirmations, move notifications,
// blocked date cancellation notices, and GDPR receipts.
// ============================================================================

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

    const htmlBody = '<div style="font-family: Arial, sans-serif; font-size: 16px; line-height: 1.6;">' +
      greeting +
      '<div style="background-color: #f4f4f4; border-radius: 8px; padding: 20px; margin: 20px 0;">' +
        '<h3 style="margin-top: 0;">Booking Summary</h3>' +
        '<p><strong>Booking Code:</strong> <span style="font-family: \'Courier New\', monospace; font-size: 18px; color: #000;">' + bookingCode + '</span></p>' +
        '<hr style="border: 0; border-top: 1px solid #ddd;">' +
        '<p><strong>Room:</strong> ' + payload.room + '</p>' +
        '<p><strong>Name:</strong> ' + payload.first_name + ' ' + payload.last_name + '</p>' +
        '<p><strong>Event:</strong> ' + payload.event + '</p>' +
        '<p><strong>Date:</strong> ' + dateStr + '</p>' +
        '<p><strong>Time:</strong> ' + timeStr + '</p>' +
        '<p><strong>Participants:</strong> ' + payload.participants + '</p>' +
        (payload.notes ? '<p><strong>Notes:</strong> ' + payload.notes + '</p>' : '') +
        '<div style="margin-top: 25px; text-align: left;">' +
           '<a href="' + gCalLink + '" style="background-color: #004d60; color: white; padding: 12px 18px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 14px;">📅 Add to Google Calendar</a>' +
        '</div>' +
      '</div>' +
      '<div style="background-color: #e6fffa; border: 1px solid #b2f5ea; border-radius: 8px; padding: 15px; margin-top: 20px;">' +
        '<h3 style="color: #047857; margin-top: 0;">Need Help or Have Questions?</h3>' +
        '<p style="color: #065f46; font-size: 14px;">For Queries, Feature Requests, or Help Needs, please submit them via our Survey Google Form.</p>' +
        '<a href="' + surveyLink + '" style="background-color: #047857; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px; font-weight: bold;">Submit Feedback / Query</a>' +
      '</div>' +
      '<p style="margin-top: 30px; color: #888; font-size: 12px;">This is an automated no-reply email confirmation.<br>Thank you for using the CCF Manila Room Reservation System.</p>' +
    '</div>';

    MailApp.sendEmail({ to: recipient, subject: subject, htmlBody: htmlBody, name: EMAIL_SENDER_NAME });
}

function sendMoveNotificationEmail(email, name, event, room, startIso, endIso, reason, bookingId) {
    var startDate = new Date(startIso);
    var endDate = new Date(endIso);
    var bookingCode = (bookingId || "").substring(0, 12).toUpperCase();
    var surveyLink = SURVEY_FORM_URL.replace('${bookingCode}', bookingCode);
    var dateStr = Utilities.formatDate(startDate, 'Asia/Manila', "MMM d, yyyy (EEE)");
    var startTimeStr = Utilities.formatDate(startDate, 'Asia/Manila', "h:mm a");
    var endTimeStr = Utilities.formatDate(endDate, 'Asia/Manila', "h:mm a");
    var subject = "Update: Your Booking Schedule Has Changed - CCF Manila";

    var body = "Hi " + name + ",\n\nPlease be advised that your booking for '" + event + "' has been moved by an Administrator.\n\n" +
        "NEW DETAILS:\nDate: " + dateStr + "\nTime: " + startTimeStr + " - " + endTimeStr + "\nRoom: " + room + "\n\nReason: " + reason + "\n\n" +
        "For Queries or Help: " + surveyLink + "\n\nGod Bless,\nCCF Manila Admin";

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
        "<p>God Bless,<br>CCF Manila Admin</p></div>";

    MailApp.sendEmail({ to: email, subject: subject, body: body, htmlBody: htmlBody });
}

function sendBlockedDateCancellationEmail(booking, reason, blockedDate) {
    const recipient = booking.email;
    const bookingCode = (booking.id || "").substring(0, 12).toUpperCase();
    const cleanStartIso = String(booking.start_iso).replace(/Z$/i, '');
    const cleanEndIso = String(booking.end_iso).replace(/Z$/i, '');
    const startDate = new Date(cleanStartIso);
    const endDate = new Date(cleanEndIso);
    const bookingDateStr = Utilities.formatDate(startDate, SCRIPT_TIMEZONE, "MMMM d, yyyy (EEE)");
    const startTimeStr = Utilities.formatDate(startDate, SCRIPT_TIMEZONE, "h:mm a");
    const endTimeStr = Utilities.formatDate(endDate, SCRIPT_TIMEZONE, "h:mm a");
    const surveyLink = SURVEY_FORM_URL.replace('${bookingCode}', bookingCode);
    const blockedDateObj = new Date(blockedDate + 'T00:00:00');
    const closureDateStr = Utilities.formatDate(blockedDateObj, SCRIPT_TIMEZONE, "MMMM d, yyyy (EEE)");
    const subject = 'Booking Cancelled: ' + booking.event + ' on ' + bookingDateStr + ' — CCF Manila';

    const htmlBody = '<div style="font-family: Arial, sans-serif; font-size: 16px; line-height: 1.6; max-width: 600px;">' +
      '<h2 style="color: #b80000;">Booking Cancellation Notice</h2>' +
      '<p>Hi <strong>' + booking.firstName + '</strong>,</p>' +
      '<p>We sincerely apologize. Your booking has been <strong>automatically cancelled</strong> because the facility will be <strong>closed on ' + closureDateStr + '</strong>.</p>' +
      '<div style="background-color: #fef2f2; border-left: 4px solid #b80000; border-radius: 4px; padding: 15px; margin: 20px 0;">' +
        '<p style="margin: 0 0 8px 0; font-weight: bold; color: #b80000;">Reason for Closure:</p>' +
        '<p style="margin: 0; color: #7f1d1d;">' + reason + '</p>' +
      '</div>' +
      '<div style="background-color: #f4f4f4; border-radius: 8px; padding: 20px; margin: 20px 0;">' +
        '<h3 style="margin-top: 0; color: #333;">Cancelled Booking Details</h3>' +
        '<p><strong>Booking Code:</strong> <span style="font-family: \'Courier New\', monospace;">' + bookingCode + '</span></p>' +
        '<hr style="border: 0; border-top: 1px solid #ddd;">' +
        '<p><strong>Event:</strong> ' + booking.event + '</p>' +
        '<p><strong>Room:</strong> ' + booking.room + '</p>' +
        '<p><strong>Date:</strong> ' + bookingDateStr + '</p>' +
        '<p><strong>Time:</strong> ' + startTimeStr + ' - ' + endTimeStr + '</p>' +
        (booking.participants ? '<p><strong>Participants:</strong> ' + booking.participants + '</p>' : '') +
      '</div>' +
      '<div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 15px; margin: 20px 0;">' +
        '<p style="margin: 0; color: #1e40af; font-size: 14px;"><strong>What to do next:</strong> Please rebook on a different date using our <a href="https://cbanzaime23.github.io/Booking-System/" style="color: #1e40af;">Room Reservation System</a>.</p>' +
      '</div>' +
      '<div style="background-color: #e6fffa; border: 1px solid #b2f5ea; border-radius: 8px; padding: 15px; margin-top: 20px;">' +
        '<h3 style="color: #047857; margin-top: 0;">Need Help?</h3>' +
        '<a href="' + surveyLink + '" style="background-color: #047857; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px; font-weight: bold;">Submit Feedback / Query</a>' +
      '</div>' +
      '<p style="margin-top: 30px; color: #888; font-size: 12px;">This is an automated no-reply email notification.</p>' +
      '<p style="color: #555;">God Bless,<br>CCF Manila Admin</p></div>';

    const plainBody = 'Hi ' + booking.firstName + ',\n\nYour booking was auto-cancelled due to facility closure on ' + closureDateStr + '.\nReason: ' + reason + '\n\nBooking Code: ' + bookingCode + '\nEvent: ' + booking.event + '\nRoom: ' + booking.room + '\nDate: ' + bookingDateStr + '\nTime: ' + startTimeStr + ' - ' + endTimeStr + '\n\nPlease rebook on a different date.\n\nGod Bless,\nCCF Manila Admin';
    MailApp.sendEmail({ to: recipient, subject: subject, body: plainBody, htmlBody: htmlBody, name: EMAIL_SENDER_NAME });
}

function sendGdprExportEmail(email, bookings) {
    const subject = 'Your Data Export Confirmation - CCF Manila Room Reservation System';
    const dateNow = Utilities.formatDate(new Date(), SCRIPT_TIMEZONE, "MMMM d, yyyy 'at' h:mm a");
    let bookingRows = '';
    bookings.forEach(function(b) {
        const id = (b.id || '').toString().substring(0, 12).toUpperCase();
        bookingRows += '<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">' + id + '</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid #eee;">' + (b.date||'N/A') + '</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid #eee;">' + (b.event||'N/A') + '</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid #eee;">' + (b.room||'N/A') + '</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid #eee;">' + (b.status||'N/A') + '</td></tr>';
    });
    const htmlBody = '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333;max-width:700px;">' +
      '<h2 style="color:#004d60;">📥 Data Export Confirmation</h2>' +
      '<p>Your personal data export was completed on <strong>' + dateNow + '</strong>.</p>' +
      '<p>The following <strong>' + bookings.length + ' booking(s)</strong> were included:</p>' +
      '<div style="overflow-x:auto;margin:20px 0;"><table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<thead><tr style="background-color:#004d60;color:white;"><th style="padding:10px 12px;text-align:left;">Code</th><th style="padding:10px 12px;text-align:left;">Date</th><th style="padding:10px 12px;text-align:left;">Event</th><th style="padding:10px 12px;text-align:left;">Room</th><th style="padding:10px 12px;text-align:left;">Status</th></tr></thead>' +
      '<tbody>' + bookingRows + '</tbody></table></div>' +
      '<div style="background-color:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:15px;margin-top:20px;"><p style="margin:0;font-size:13px;color:#92400e;"><strong>🔒 Security Notice:</strong> Please store this data securely.</p></div>' +
      '<p style="margin-top:30px;color:#888;font-size:12px;">This is an automated no-reply email confirmation.</p></div>';
    MailApp.sendEmail({ to: email, subject: subject, htmlBody: htmlBody, name: EMAIL_SENDER_NAME });
}

function sendGdprDeletionEmail(email, deletedBookings, count) {
    const subject = '⚠️ Data Deletion Confirmation - CCF Manila Room Reservation System';
    const dateNow = Utilities.formatDate(new Date(), SCRIPT_TIMEZONE, "MMMM d, yyyy 'at' h:mm a");
    let bookingRows = '';
    deletedBookings.forEach(function(b) {
        bookingRows += '<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">' + b.id + '</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid #eee;">' + b.date + '</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid #eee;">' + b.event + '</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid #eee;">' + b.room + '</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid #eee;">' + b.status + '</td></tr>';
    });
    const htmlBody = '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333;max-width:700px;">' +
      '<h2 style="color:#b91c1c;">🗑️ Data Deletion Confirmation</h2>' +
      '<p>Your personal data deletion request was processed on <strong>' + dateNow + '</strong>.</p>' +
      '<div style="background-color:#fef2f2;border-left:4px solid #ef4444;padding:15px;margin:20px 0;border-radius:4px;">' +
        '<p style="margin:0;font-weight:bold;color:#991b1b;">What was removed:</p>' +
        '<ul style="margin:10px 0;padding-left:20px;color:#991b1b;"><li>Your name, email, and leader details have been permanently anonymized.</li><li>Any future confirmed bookings have been cancelled.</li><li>Notes and personal information have been cleared.</li></ul>' +
        '<p style="margin:0;font-size:13px;color:#991b1b;"><strong>' + count + ' booking(s)</strong> were affected.</p>' +
      '</div>' +
      '<p><strong>Bookings that were anonymized:</strong></p>' +
      '<div style="overflow-x:auto;margin:10px 0;"><table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<thead><tr style="background-color:#991b1b;color:white;"><th style="padding:10px 12px;text-align:left;">Code</th><th style="padding:10px 12px;text-align:left;">Date</th><th style="padding:10px 12px;text-align:left;">Event</th><th style="padding:10px 12px;text-align:left;">Room</th><th style="padding:10px 12px;text-align:left;">Previous Status</th></tr></thead>' +
      '<tbody>' + bookingRows + '</tbody></table></div>' +
      '<div style="background-color:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:15px;margin-top:20px;"><p style="margin:0;font-size:13px;color:#92400e;"><strong>⚠️ Important:</strong> This action is permanent and cannot be undone.</p></div>' +
      '<p style="margin-top:30px;color:#888;font-size:12px;">This is an automated no-reply email confirmation.</p></div>';
    MailApp.sendEmail({ to: email, subject: subject, htmlBody: htmlBody, name: EMAIL_SENDER_NAME });
}
