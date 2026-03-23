const fs = require('fs');

const replacements = [
    { from: /\bBooking Time\b/g, to: 'Reservation Time' },
    { from: /\bBook a partial\b/g, to: 'Reserve a partial' },
    { from: /existing booking/g, to: 'existing reservation' },
    { from: /Existing booking/g, to: 'Existing reservation' },
    { from: /partially booked/g, to: 'partially reserved' },
    { from: /book a new/g, to: 'reserve a new' },
    { from: /Book a New/g, to: 'Reserve a New' },
    { from: /Overwrite Booking/g, to: 'Overwrite Reservation' },
    { from: /New Booking/g, to: 'New Reservation' },
    { from: /Submit Booking/g, to: 'Submit Reservation' },
    { from: /Cancel Booking/g, to: 'Cancel Reservation' },
    { from: /Duplicate Booking/g, to: 'Duplicate Reservation' },
    { from: /duplicate booking/gi, to: 'duplicate reservation' },
    { from: /Confirm Your Booking/g, to: 'Confirm Your Reservation' },
    { from: /booking details/gi, to: 'reservation details' },
    { from: /Book Main Hall/gi, to: 'Reserve Main Hall' },
    { from: /Book Jonah/gi, to: 'Reserve Jonah' },
    { from: /Book Joseph/gi, to: 'Reserve Joseph' },
    { from: /Book Moses/gi, to: 'Reserve Moses' },
    { from: /Book Room/gi, to: 'Reserve Room' },
    { from: /My Bookings/gi, to: 'My Reservations' },
    { from: /future bookings/gi, to: 'future reservations' },
    { from: /Booking Code/gi, to: 'Reservation Code' },
    { from: />\s*Book\s*</g, to: '>Reserve<' },
    { from: />\s*Booking\s*</g, to: '>Reservation<' },
    { from: /Move a Booking/gi, to: 'Move a Reservation' },
    { from: /Move Booking/gi, to: 'Move Reservation' },
    { from: /booking status/gi, to: 'reservation status' },
    { from: /booking confirmations/gi, to: 'reservation confirmations' },
    { from: /this booking/gi, to: 'this reservation' },
    { from: /your booking/gi, to: 'your reservation' },
    { from: /booking records/gi, to: 'reservation records' },
];

const widthReplacements = [
    { from: /max-w-md w-full/g, to: 'max-w-[95vw] sm:max-w-md md:max-w-xl w-full' },
    { from: /max-w-lg w-full/g, to: 'max-w-[95vw] sm:max-w-lg md:max-w-2xl w-full' }
];

const files = [
    'components/modals/booking-modal.html',
    'components/modals/cancel-modal.html',
    'components/modals/info-modals.html',
    'components/modals/move-modal.html',
    'components/modals/my-bookings-modal.html',
    'components/modals/result-modal.html',
    'components/shared/header.html',
    'index.html',
    'dashboard.html'
];

for (const file of files) {
    if (!fs.existsSync(file)) {
        console.log('Skipping missing file:', file);
        continue;
    }
    let content = fs.readFileSync(file, 'utf8');

    // Apply Text Replacements
    for (const r of replacements) {
        content = content.replace(r.from, r.to);
    }

    // Width tweaks
    for (const r of widthReplacements) {
        content = content.replace(r.from, r.to);
    }

    // Padding adjustments for mobile friendliness (change p-6 to p-4 sm:p-6 or p-5 sm:p-6)
    // Only in dialog components. In regular html files, standard p-4 is fine.
    if (file.includes('modals')) {
        content = content.replace(/class="p-6"/g, 'class="p-4 sm:p-6"');
        content = content.replace(/class="p-8 /g, 'class="p-5 sm:p-8 ');
    }

    fs.writeFileSync(file, content);
    console.log('Processed:', file);
}
