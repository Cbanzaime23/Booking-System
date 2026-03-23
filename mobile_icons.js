const fs = require('fs');
let content = fs.readFileSync('dashboard.html', 'utf8');

// Wrap text in span class="hidden md:inline" for the 3 modal buttons
content = content.replace(/(<\/svg>\s*)(Blocked Dates)(\s*<\/button>)/, '$1<span class="hidden md:inline">$2</span>$3');
content = content.replace(/(<\/svg>\s*)(Reservation Window)(\s*<\/button>)/, '$1<span class="hidden md:inline">$2</span>$3');
content = content.replace(/(<\/svg>\s*)(Housekeeping Report)(\s*<\/button>)/, '$1<span class="hidden md:inline">$2</span>$3');

// Shrink the px and py on those buttons
content = content.replace(/(id="open-blocked-dates-modal"[^>]*class="[^"]*px-)2\.5(\s+sm:px-)3(\s+py-)1\.5/g, '$12$23$31.5');
content = content.replace(/(id="open-reservation-window-modal"[^>]*class="[^"]*px-)2\.5(\s+sm:px-)3(\s+py-)1\.5/g, '$12$23$31.5');
content = content.replace(/(id="open-housekeeping-modal"[^>]*class="[^"]*px-)2\.5(\s+sm:px-)3(\s+py-)1\.5/g, '$12$23$31.5');

// For All Rooms dropdown, shrink height/padding further
content = content.replace(/(id="room-filter-btn"[^>]*class="[^"]*px-)2(\s+sm:px-)3(\s+md:px-)4(\s+py-)1\.5/g, '$11.5$23$34$41 md:py-2');

// For Date Filter, shrink padding further and height
content = content.replace(/(id="date-filter"[^>]*class="[^"]*px-)2(\s+sm:px-)3(\s+md:px-)4(\s+py-)1\.5(\s+sm:py-)2/g, '$11.5$23$34$41$52 md:py-2');

fs.writeFileSync('dashboard.html', content);
console.log('Mobile icons updated.');
