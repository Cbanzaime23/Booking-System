const fs = require('fs');
const path = require('path');

// 1. Modifying js/modals.js to adjust the injected HTML for Selected Schedule
let modalsJs = fs.readFileSync('js/modals.js', 'utf8');

// Replace the injected HTML wrapper to remove mb-4 and add h-full flex classes so it sizes nicely alongside the table selector
modalsJs = modalsJs.replace(
    /<div class="mb-4 p-3 bg-ccf-blue\/5 border border-ccf-blue\/10 rounded-lg">/g,
    '<div class="h-full p-2 sm:p-3 bg-ccf-blue/5 border border-ccf-blue/10 rounded-lg flex flex-col justify-center relative">'
);

// Reduce font sizes inside the schedule block to fit in half width on mobile
modalsJs = modalsJs.replace(
    /text-lg font-bold text-gray-800/g,
    'text-sm sm:text-lg font-bold text-gray-800 leading-tight'
);
modalsJs = modalsJs.replace(
    /text-md text-ccf-blue font-semibold/g,
    'text-xs sm:text-sm text-ccf-blue font-semibold mt-0.5'
);
modalsJs = modalsJs.replace(
    /text-xs text-ccf-blue uppercase font-bold tracking-wider mb-1/g,
    'text-[10px] sm:text-xs text-ccf-blue uppercase font-bold tracking-wider mb-0.5 sm:mb-1'
);

// Make the change time button absolutely positioned top right or just tight
modalsJs = modalsJs.replace(
    /<div class="text-right">\s+<button type="button" id="change-time-btn"/g,
    '<div class="absolute top-2 right-2 sm:top-3 sm:right-3">\n                        <button type="button" id="change-time-btn"'
);
fs.writeFileSync('js/modals.js', modalsJs);
console.log('Updated js/modals.js');

// 2. Modifying components/modals/booking-modal.html
let html = fs.readFileSync('components/modals/booking-modal.html', 'utf8');

// First, fix the modal-date-info tag (it was an h3, change to div and move inside form)
html = html.replace(/<h3 class="text-1xl font-bold mb-4 font-heading text-ccf-blue" id="modal-date-info"[\s\S]*?<\/h3>/g, '');

// We will inject the flex wrapper inside the form right after the duplicate-date-wrapper
const flexWrapperHTML = `
            <!-- Responsive Group 1: Schedule & Table -->
            <div id="schedule-table-group" class="flex flex-row gap-2 sm:gap-3 mb-4 items-stretch w-full">
                <!-- Schedule injected here -->
                <div id="modal-date-info" class="flex-1 min-w-0"></div>

                <!-- Table Selection -->
                <div id="table-selection-wrapper" class="hidden flex-1 min-w-0 p-2 sm:p-3 bg-gray-50 border border-gray-200 rounded-lg flex-col justify-center relative">
                    <span class="block text-[10px] sm:text-xs font-bold text-gray-700 uppercase tracking-wider mb-0.5 sm:mb-1">Selected Table</span>
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                        <span id="display-selected-table" class="text-xs sm:text-sm font-bold text-gray-500 truncate">None</span>
                        <input type="hidden" id="selected-table-id" name="table_id">
                        <button type="button" id="btn-open-floorplan" class="px-2 py-1 bg-ccf-blue text-white rounded text-[10px] sm:text-xs hover:bg-ccf-blue-dark whitespace-nowrap self-start sm:self-auto">Choose Table</button>
                    </div>
                </div>
            </div>
`;

html = html.replace(/(<div id="duplicate-date-wrapper"[\s\S]*?<\/div>)/, '$1' + flexWrapperHTML);

// Remove the old table-selection-wrapper
html = html.replace(/<!-- Table Selection component \(shown only for Main Hall\) -->\s*<div id="table-selection-wrapper"[\s\S]*?<\/div>\s*<\/div>/, '');

// Now replace Event and Participants to be in a grid
const eventParticipantsRegex = /<div class="mb-4">\s*<label for="event" class="block text-sm font-medium text-gray-700">Event<\/label>[\s\S]*?<\/option>\s*<\/select>\s*<\/div>\s*<\/div>\s*<div class="mb-4">\s*<input type="hidden" id="end-time" name="end-time" required>\s*<label for="participants" class="block text-sm font-medium text-gray-700">Number of Participant\s*Groups<\/label>[\s\S]*?<\/div>\s*<\/div>/;

const newEventParticipantsHTML = `
            <div class="grid grid-cols-2 gap-2 sm:gap-4 mb-4">
                <div class="min-w-0">
                    <label for="event" class="block text-xs sm:text-sm font-medium text-gray-700 mb-1 truncate">Event</label>
                    <div class="relative">
                        <div class="absolute inset-y-0 left-0 pl-2 sm:pl-3 flex items-center pointer-events-none">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                            </svg>
                        </div>
                        <select id="event" name="event" required class="block w-full pl-7 sm:pl-10 px-2 py-2 text-xs sm:text-sm border border-gray-300 rounded-md shadow-sm bg-white focus:ring-ccf-red focus:border-ccf-red">
                            <option value="">Select event...</option>
                            <option value="Rehearsal/Practice">Rehearsal/Practice</option>
                            <option value="Ministry Event">Ministry Event</option>
                            <option value="Dgroup">Dgroup</option>
                            <option value="Celebration">Celebration</option>
                        </select>
                    </div>
                </div>

                <div class="min-w-0">
                    <input type="hidden" id="end-time" name="end-time" required>
                    <label for="participants" class="block text-xs sm:text-sm font-medium text-gray-700 mb-1 truncate" title="Number of Participant Groups">Part. Groups</label>
                    <div class="relative">
                        <div class="absolute inset-y-0 left-0 pl-2 sm:pl-3 flex items-center pointer-events-none">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        </div>
                        <input type="number" id="participants" name="participants" required min="1" value="2" class="block w-full pl-7 sm:pl-10 px-2 flex-1 py-2 text-xs sm:text-sm border border-gray-300 rounded-md shadow-sm focus:ring-ccf-red focus:border-ccf-red">
                    </div>
                </div>
            </div>
            <p id="participant-rule-hint" class="text-[10px] sm:text-xs text-gray-500 mb-4 text-center px-1">
                Group size: 2 - 25 participants. Max groups for this room: <span id="hint-max-groups" class="font-bold">6</span>. Can reserve up to <span id="hint-max-date" class="font-bold border-b border-gray-400">...</span>.
            </p>
`;

// It's safer to read the file and use string indexes or simpler replace if the big regex fails.
// Let's do a more robust replacement for the event/participants blocks
// 1. Target Event block:
html = html.replace(/<div class="mb-4">\s*<label for="event"[\s\S]*?<\/select>\s*<\/div>\s*<\/div>/, '<!-- EVENT_PARTICIPANTS_PLACEHOLDER -->');
// 2. Target Participants block:
html = html.replace(/<div class="mb-4">\s*<input type="hidden" id="end-time"[\s\S]*?<\/p>\s*<\/div>/, '');

// Replace the placeholder
html = html.replace('<!-- EVENT_PARTICIPANTS_PLACEHOLDER -->', newEventParticipantsHTML);

fs.writeFileSync('components/modals/booking-modal.html', html);
console.log('Updated components/modals/booking-modal.html');
