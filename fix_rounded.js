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

                content = content.replace(/rounded-(?:xl-)+md/g, 'rounded-xl');
                content = content.replace(/rounded-(?:xl-)+lg/g, 'rounded-xl');
                content = content.replace(/rounded-xl/g, 'rounded-xl');
                content = content.replace(/rounded-xl/g, 'rounded-xl');
                content = content.replace(/rounded-xl/g, 'rounded-xl');

                // Some inner modals had bg-white rounded-2xl
                content = content.replace(/bg-white rounded-2xl/g, 'bg-white rounded-2xl');
                // bg-red-50 border border-red-100 p-4 rounded-xl -> rounded-xl
                content = content.replace(/bg-red-50 border border-red-100 p-4 rounded-xl/g, 'bg-red-50 border border-red-100 p-4 rounded-xl');


                if (content !== originalContent) {
                    fs.writeFileSync(filePath, content);
                    console.log(`Fixed mistakes in ${filePath}`);
                }
            }
        });
    });
}

processFiles();
