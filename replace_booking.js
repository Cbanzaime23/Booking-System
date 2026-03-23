const fs = require('fs');

let content = fs.readFileSync('dashboard.html', 'utf8');

// Replace specific UI text segments safely
content = content.replace(/Filtered Bookings/g, 'Filtered Reservations');
content = content.replace(/Bookings\s*\n\s*by Room Type/g, 'Reservations\n                        by Room Type');
content = content.replace(/Booking\s*\n\s*Distribution/g, 'Reservation\n                        Distribution');
content = content.replace(/Overlapping bookings/gi, 'Overlapping reservations');
content = content.replace(/Back to Booking Form/g, 'Back to Reservation Form');
content = content.replace(/"Bookings"/g, '"Reservations"');
content = content.replace(/Bookings/g, 'Reservations');
content = content.replace(/Booking/g, 'Reservation');
content = content.replace(/bookings/g, 'reservations');
content = content.replace(/booking/g, 'reservation');

// Revert id and class names that might have been hit
// Or instead of broad replacement, let's just do exact ones to avoid breaking js vars
content = fs.readFileSync('dashboard.html', 'utf8');
content = content.replace(/>Filtered Bookings</g, '>Filtered Reservations<');
content = content.replace(/>\s*Bookings\s*\n\s*by Room Type\s*</g, '>\n                        Reservations\n                        by Room Type<');
content = content.replace(/>\s*Booking\s*\n\s*Distribution \(Event Type\)\s*</g, '>\n                        Reservation\n                        Distribution (Event Type)<');
content = content.replace(/Overlapping bookings/g, 'Overlapping reservations');
content = content.replace(/Back to Booking Form/g, 'Back to Reservation Form');

fs.writeFileSync('dashboard.html', content);
console.log('Terms replaced.');
