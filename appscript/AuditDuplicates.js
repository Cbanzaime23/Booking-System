/**
 * Audit Script — Find Duplicate Bookings
 * 
 * Run this function in the Apps Script editor to scan the Bookings sheet
 * for duplicate rows that slipped through the broken duplicate detection.
 * 
 * A duplicate is defined as: same email + same start time + same room + status = confirmed.
 * 
 * Outputs results to the Logger and optionally to a new "Audit_Duplicates" sheet.
 */

function auditDuplicateBookings() {
  const SPREADSHEET_ID = '13SROZHNchpiGKpgSc6bpxbuf2Fhw0AMIAcQyC48BKkM';
  const SCRIPT_TIMEZONE = 'Asia/Manila';
  
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Bookings');
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  
  const idx = {
    id: headers.indexOf('id'),
    start_iso: headers.indexOf('start_iso'),
    email: headers.indexOf('email'),
    room: headers.indexOf('room'),
    status: headers.indexOf('status'),
    first_name: headers.indexOf('first_name'),
    last_name: headers.indexOf('last_name'),
    event: headers.indexOf('event'),
    participants: headers.indexOf('participants'),
    consent_timestamp: headers.indexOf('consent_timestamp'),
    created_at: headers.indexOf('created_at')
  };
  
  // Build a map: key = "email|startTimestamp|room" → array of rows
  const buckets = {};
  
  data.forEach((row, i) => {
    if (row[idx.status] !== 'confirmed') return;
    
    const email = String(row[idx.email] || '').toLowerCase().trim();
    if (!email) return;
    
    let startIso = row[idx.start_iso];
    let startTimestamp;
    
    if (startIso instanceof Date) {
      startTimestamp = startIso.getTime();
    } else {
      const str = String(startIso);
      if (/[+-]\d{2}:\d{2}$/.test(str)) {
        startTimestamp = new Date(str).getTime();
      } else {
        const cleaned = str.replace(/Z$/i, '');
        startTimestamp = new Date(cleaned + '+08:00').getTime();
      }
    }
    
    const room = String(row[idx.room] || '').trim();
    const key = `${email}|${startTimestamp}|${room}`;
    
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push({
      rowNumber: i + 2, // +2 because headers removed and 1-indexed
      id: row[idx.id],
      email: email,
      name: `${row[idx.first_name]} ${row[idx.last_name]}`,
      event: row[idx.event],
      room: room,
      start_iso: String(startIso),
      participants: row[idx.participants],
      consent_timestamp: row[idx.consent_timestamp],
      created_at: row[idx.created_at]
    });
  });
  
  // Find buckets with more than 1 entry (duplicates)
  const duplicateGroups = Object.entries(buckets).filter(([_, rows]) => rows.length > 1);
  
  Logger.log(`===== DUPLICATE BOOKING AUDIT =====`);
  Logger.log(`Total confirmed bookings scanned: ${data.filter(r => r[idx.status] === 'confirmed').length}`);
  Logger.log(`Duplicate groups found: ${duplicateGroups.length}`);
  Logger.log(`Total duplicate rows: ${duplicateGroups.reduce((sum, [_, rows]) => sum + rows.length, 0)}`);
  Logger.log(``);
  
  if (duplicateGroups.length === 0) {
    Logger.log('✅ No duplicate bookings found.');
    return;
  }
  
  // Create audit output sheet
  let auditSheet = ss.getSheetByName('Audit_Duplicates');
  if (auditSheet) {
    auditSheet.clear();
  } else {
    auditSheet = ss.insertSheet('Audit_Duplicates');
  }
  
  auditSheet.appendRow([
    'Group #', 'Row #', 'ID', 'Email', 'Name', 'Event', 'Room',
    'Start ISO', 'Participants', 'Consent Timestamp', 'Created At', 'Action Needed'
  ]);
  
  duplicateGroups.forEach(([key, rows], groupIdx) => {
    Logger.log(`--- Group ${groupIdx + 1} (${rows.length} duplicates) ---`);
    rows.forEach((r, i) => {
      const isOriginal = i === 0;
      Logger.log(`  ${isOriginal ? '✓ KEEP' : '✗ DUPLICATE'} Row ${r.rowNumber}: ${r.id} | ${r.name} | ${r.event} | ${r.room} | ${r.start_iso}`);
      
      auditSheet.appendRow([
        groupIdx + 1,
        r.rowNumber,
        r.id,
        r.email,
        r.name,
        r.event,
        r.room,
        r.start_iso,
        r.participants,
        r.consent_timestamp ? r.consent_timestamp.toString() : '',
        r.created_at ? r.created_at.toString() : '',
        isOriginal ? 'KEEP (Original)' : 'CANCEL (Duplicate)'
      ]);
    });
    Logger.log('');
  });
  
  Logger.log(`\nAudit results have been written to the "Audit_Duplicates" sheet.`);
  Logger.log(`Review the sheet and manually cancel the duplicate rows (set status to "cancelled" and add note "[Duplicate Cleanup]").`);
}
