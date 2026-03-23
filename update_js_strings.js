const fs = require('fs');

const replacements = [
    { from: /Cannot create a booking/g, to: 'Cannot create a reservation' },
    { from: /Regular bookings cannot/g, to: 'Regular reservations cannot' },
    { from: /Regular bookings require/g, to: 'Regular reservations require' },
    { from: /Admins can only book/g, to: 'Admins can only reserve' },
    { from: /Note: Bookings within/g, to: 'Note: Reservations within' },
    { from: /Bookings accepted for/g, to: 'Reservations accepted for' },
    { from: /cancel existing bookings/g, to: 'cancel existing reservations' },
    { from: /Outside Booking Window/g, to: 'Outside Reservation Window' },
    { from: /your booking for/g, to: 'your reservation for' },
    { from: /Booking Ref:/g, to: 'Reservation Ref:' },
    { from: /CCF Booking:/g, to: 'CCF Reservation:' },
    { from: /Can book up to/g, to: 'Can reserve up to' },
    { from: /No bookings found/g, to: 'No reservations found' },
    { from: /Your booking/g, to: 'Your reservation' },
    { from: /Booking successful/g, to: 'Reservation successful' },
    { from: /Booking canceled/g, to: 'Reservation canceled' },
    { from: /Booking moved/g, to: 'Reservation moved' },
    { from: /Booking Confirmed/g, to: 'Reservation Confirmed' },
    { from: /Failed to fetch bookings/g, to: 'Failed to fetch reservations' },
    { from: /textContent = `Book \$\{state\.selectedRoom\}`/g, to: 'textContent = `Reserve ${state.selectedRoom}`' },

    // EmailService.gs specific
    { from: /Room Booking Confirmed/g, to: 'Room Reservation Confirmed' },
    { from: /Room Booking Canceled/g, to: 'Room Reservation Canceled' },
    { from: /Room Booking Modified/g, to: 'Room Reservation Modified' },
    { from: /Action Required: Room Reservation Denied/g, to: 'Action Required: Room Reservation Denied' },
    { from: /Below are your booking details/g, to: 'Below are your reservation details' },
    { from: /Below are your updated booking details/g, to: 'Below are your updated reservation details' },
    { from: /Canceled booking details/g, to: 'Canceled reservation details' },
    { from: /booking records/g, to: 'reservation records' },
    { from: /booking status/g, to: 'reservation status' },
    { from: /booking confirmations/g, to: 'reservation confirmations' },
    { from: /My Bookings/g, to: 'My Reservations' }
];

const files = [
    'js/utils/validation.js',
    'js/calendar.js',
    'js/modals.js',
    'js/api.js',
    'js/script.js',
    'js/formHandlers.js',
    'appscript/EmailService.gs',
    'appscript/BookingService.gs'
];

for (const file of files) {
    if (!fs.existsSync(file)) {
        console.log('Skipping missing file:', file);
        continue;
    }
    let content = fs.readFileSync(file, 'utf8');

    for (const r of replacements) {
        content = content.replace(r.from, r.to);
    }

    fs.writeFileSync(file, content);
    console.log('Processed JS:', file);
}
