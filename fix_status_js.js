const fs = require('fs');
let content = fs.readFileSync('dashboard.html', 'utf8');

// The exact string to pull out
const oldFunc = `        function updateStatus(text, colorClass) {
            const desktop = document.getElementById('status-indicator');
            const mobile = document.getElementById('status-indicator-mobile');
            [desktop, mobile].forEach(el => {
                if (el) {
                    el.textContent = text;
                    el.className = 'text-xs font-medium ' + colorClass;
                }
            });
        }`;

// The new string
const newFunc = `        function updateStatus(text, colorClass) {
            const ind = document.getElementById('status-indicator');
            if (ind) {
                ind.textContent = text;
                // Overwrites 'hidden md:inline' when updated on mobile to show it cleanly beside refresh!
                ind.className = 'text-[10px] sm:text-xs font-medium flex-shrink-0 ' + colorClass;
            }
        }`;

content = content.replace(oldFunc, newFunc);

fs.writeFileSync('dashboard.html', content);
