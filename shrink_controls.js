const fs = require('fs');
let content = fs.readFileSync('dashboard.html', 'utf8');

// 1. Shrink the 3 grey modal buttons
content = content.replace(/(id="open-blocked-dates-modal"[^>]*class="[^"]*gap-)1\.5(\s+px-)3(\s+py-)2(\s+text-)xs/g, '$11 sm:gap-1.5$22.5 sm:px-3$31.5 sm:py-2$4[10px] sm:text-xs');
content = content.replace(/(id="open-reservation-window-modal"[^>]*class="[^"]*gap-)1\.5(\s+px-)3(\s+py-)2(\s+text-)xs/g, '$11 sm:gap-1.5$22.5 sm:px-3$31.5 sm:py-2$4[10px] sm:text-xs');
content = content.replace(/(id="open-housekeeping-modal"[^>]*class="[^"]*gap-)1\.5(\s+px-)3(\s+py-)2(\s+text-)xs/g, '$11 sm:gap-1.5$22.5 sm:px-3$31.5 sm:py-2$4[10px] sm:text-xs');

// Shrink their SVGs
content = content.replace(/(<svg\s+class="w-)4(\s+h-)4("\s+fill="none"\s+stroke="currentColor"\s+viewBox="0\s+0\s+24\s+24">)/g, '$13.5 sm:w-4$23.5 sm:h-4$3');

// 2. Shrink room filter button
content = content.replace(/(id="room-filter-btn"[^>]*class="[^"]*w-)36(\s+md:w-)48(\s+px-)3(\s+md:px-)4(\s+py-)2(\s+text-)sm/g, '$128 sm:w-36$248$32 sm:px-3$44$51.5 sm:py-2$6[10px] sm:text-xs md:text-sm');
// Shrink room filter SVG
content = content.replace(/(<svg\s+class="w-)5(\s+h-)5(\s+ml-2)/g, '$14 sm:w-5$24 sm:h-5$3');

// 3. Shrink Date Filter
content = content.replace(/(id="date-filter"[^>]*class="[^"]*px-)3(\s+md:px-)4(\s+py-)2(\s+text-)sm([\s\S]*?)(">)/g, '$12 sm:px-3$24$31.5 sm:py-2$4[10px] sm:text-xs md:text-sm$5 w-[110px] sm:w-[130px] md:w-auto h-[30px] sm:h-[34px] md:h-auto$6');
// Shrink Clear Date Button
content = content.replace(/(id="clear-date-btn"[^>]*class="[^"]*right-)8/g, '$16 sm:right-8');

// 4. Shrink Refresh Button
content = content.replace(/(onclick="fetchData\(\)"[^>]*class="[^"]*gap-)1\.5(\s+px-)4(\s+py-)2([^>]*font-medium)(">)/g, '$11 sm:gap-1.5$22.5 sm:px-4$31.5 sm:py-2$4 text-[10px] sm:text-xs md:text-sm$5');
// Shrink Refresh SVG
content = content.replace(/(id="refresh-icon"[^>]*class="[^"]*h-)4(\s+w-)4/g, '$13 sm:h-4$23 sm:w-4');

fs.writeFileSync('dashboard.html', content);
console.log('Done modifying dashboard.html');
