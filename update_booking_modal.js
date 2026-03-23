const fs = require('fs');
const path = 'G:\\My Drive\\1. Projects\\BookingSystem\\components\\modals\\booking-modal.html';
let content = fs.readFileSync(path, 'utf8');

// 1. Change the label
content = content.replace(
    /(<label for="participants" class="block text-sm font-medium text-gray-700 truncate"[\s\S]*?title=")[^"]*(">)[^<]*(<\/label>)/,
    '$1Number of People in Your Group$2Group Size$3'
);

// 2. Add the summary reassign notice
const summaryHeaderRegex = /(<h3 class="text-2xl font-bold mb-4 font-heading text-ccf-blue">Confirm Reservation<\/h3>)/;
const noticeHTML = `\n        <p id="summary-reassign-notice" class="hidden text-sm text-amber-800 bg-amber-100 p-3 rounded-lg border border-amber-200 mb-4 font-medium flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Notice: Due to optimization, your reservation has been upgraded to the Main Hall.
        </p>`;

if (!content.includes('summary-reassign-notice')) {
    content = content.replace(summaryHeaderRegex, '$1' + noticeHTML);
}

fs.writeFileSync(path, content);
console.log('booking-modal.html updated');
