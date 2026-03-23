const fs = require('fs');
let content = fs.readFileSync('dashboard.html', 'utf8');

content = content.replace(/(onclick="fetchData\(\)"[^>]*class="[^"]*px-)3(\s+md:px-)4(\s+py-)2([^>]*text-)sm(\s+font-medium[^>]*>)/g, '$12.5 sm:px-3$24$31.5 sm:py-2$4[10px] sm:text-xs md:text-sm$5');
content = content.replace(/(<svg\s+xmlns="http:\/\/www\.w3\.org\/2000\/svg"\s+class="h-)4(\s+w-)4(\s+mr-)1(\s+md:mr-)2("\s+fill="none"\s+viewBox="0\s+0\s+24\s+24"\s+stroke="currentColor">)/g, '$13 sm:h-4$23 sm:w-4$31$42$5');

fs.writeFileSync('dashboard.html', content);
