const fs = require('fs');
let content = fs.readFileSync('dashboard.html', 'utf8');

// 1. Label these buttons as "Admin Tools"
content = content.replace(/(<div class="flex flex-wrap items-center gap-2 md:gap-3">)(\s*<button id="open-blocked-dates-modal")/, '$1\n                <span class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mr-1 md:hidden">Admin Tools:</span>$2');

// 2. Remove duplicated "Last updated"
// Remove the HTML element
content = content.replace(/\s*<!-- Mobile status indicator -->[\s\S]*?<div class="md:hidden mt-1 text-right">[\s\S]*?<span id="status-indicator-mobile"[^>]*>[\s\S]*?<\/span>[\s\S]*?<\/div>/g, '');
// Update the JS function to only target the main indicator and never wipe out its responsiveness
content = content.replace(/function updateStatus\(text, colorClass\) \{[\s\S]*?\}\n        \}/g, `function updateStatus(text, colorClass) {
            const ind = document.getElementById('status-indicator');
            if (ind) {
                ind.textContent = text;
                ind.className = 'text-[10px] sm:text-xs font-medium flex-shrink-0 ' + colorClass;
            }
        }`);

// 3. Reduce the size of header buttons for mobile view
// Admin Mode badge
content = content.replace(/(id="admin-mode-badge"[^>]*class="[^"]*gap-)1\.5(\s+px-)3(\s+py-)1\.5([^>]*text-)xs/g, '$11 sm:gap-1.5$22 sm:px-3$31 sm:py-1.5$4[10px] sm:text-xs');
// Back to Booking Form button
content = content.replace(/(href="index.html"[^>]*class="[^"]*text-)sm([^>]*gap-)1(\s+border-l[^>]*pl-)3/g, '$1[10px] sm:text-sm$20.5 sm:gap-1$32 sm:pl-3');

fs.writeFileSync('dashboard.html', content);
console.log('Done!');
