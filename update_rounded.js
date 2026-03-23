const fs = require('fs');
const path = require('path');

const directories = [
    '.',
    './components/shared',
    './components/modals',
    './js',
    './js/utils'
];

function walkDir(dir, callback) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
        const dirPath = path.join(dir, f);
        const isDirectory = fs.statSync(dirPath).isDirectory();
        if (dirPath.includes('.git') || dirPath.includes('node_modules')) return;
        if (isDirectory) {
            walkDir(dirPath, callback);
        } else {
            callback(dirPath);
        }
    });
}

function processFiles() {
    directories.forEach(dir => {
        walkDir(dir, (filePath) => {
            if (filePath.endsWith('.html') || filePath.endsWith('.js')) {
                // Ignore the scripts we use for node
                if (filePath.includes('update_js_strings') || filePath.includes('update_modals') || filePath.includes('update_layout') || filePath.includes('update_rounded')) return;

                let content = fs.readFileSync(filePath, 'utf8');
                let originalContent = content;

                // 1. Modals and large containers: `<dialog>` and calendar backgrounds
                // <dialog ... rounded-lg> -> rounded-2xl
                content = content.replace(/(<dialog[^>]*class="[^"]*)rounded-(md|lg|xl)([^"]*")/g, '$1rounded-2xl$3');

                // Divs that are typical "cards" or "outer containers" (bg-white rounded-lg shadow-md)
                content = content.replace(/(class="[^"]*bg-(white|gray-50)[^"]*)rounded-(md|lg|xl)([^"]*shadow-[md|sm|lg|xl|2xl][^"]*")/g, '$1rounded-2xl$4');
                // Calendar header grid borders? In index.html the calendar has `rounded-lg shadow-md overflow-hidden`.
                content = content.replace(/rounded-lg(\s+shadow-md\s+overflow-hidden)/g, 'rounded-2xl$1');
                content = content.replace(/rounded-md(\s+shadow-md\s+overflow-hidden)/g, 'rounded-2xl$1');

                // 2. Buttons: rounded-md or rounded -> rounded-xl
                content = content.replace(/(<button[^>]*class="[^"]*)(?:\brounded\b|\brounded-md\b|\brounded-lg\b)([^"]*")/g, '$1rounded-xl$2');
                // Also anchors styled as buttons
                content = content.replace(/(<a[^>]*class="[^"]*(?:btn|bg-ccf-red|bg-gray-200)[^"]*)(?:\brounded\b|\brounded-md\b|\brounded-lg\b)([^"]*")/g, '$1rounded-xl$2');

                // 3. Form Inputs, Selects, Textareas: rounded-md -> rounded-xl
                content = content.replace(/(<(?:input|select|textarea)[^>]*class="[^"]*)(?:\brounded\b|\brounded-md\b|\brounded-lg\b)([^"]*")/g, '$1rounded-xl$2');

                // 4. Notice blocks (like time-selection-alert, info banners)
                // class="... rounded-md ... bg-red-50 ..."
                content = content.replace(/(class="[^"]*)rounded-(md|lg)([^"]*bg-(red|blue|green|yellow|gray)-50[^"]*")/g, '$1rounded-xl$3');

                // Extra check for the newly added room/day block
                content = content.replace(/(class="[^"]*bg-ccf-blue\/5[^"]*)rounded-lg([^"]*")/g, '$1rounded-xl$2');

                if (content !== originalContent) {
                    fs.writeFileSync(filePath, content);
                    console.log(`Updated rounded edges in ${filePath}`);
                }
            }
        });
    });
}

processFiles();
