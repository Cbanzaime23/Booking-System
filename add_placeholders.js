const fs = require('fs');
const path = 'components/modals/booking-modal.html';
let content = fs.readFileSync(path, 'utf8');

// 1. first_name
content = content.replace(/(<input type="text" id="first_name" name="first_name" required)/, '$1 placeholder="e.g. Juan"');

// 2. last_name
content = content.replace(/(<input type="text" id="last_name" name="last_name" required)/, '$1 placeholder="e.g. Dela Cruz"');

// 3. email
content = content.replace(/(<input type="email" id="email" name="email" required)/, '$1 placeholder="e.g. juan@example.com"');

// 4. leader_first_name
content = content.replace(/(<input type="text" id="leader_first_name" name="leader_first_name")/, '$1 placeholder="e.g. Peter"');

// 5. leader_last_name
content = content.replace(/(<input type="text" id="leader_last_name" name="leader_last_name")/, '$1 placeholder="e.g. Tan"');

fs.writeFileSync(path, content);
console.log('Placeholders added to booking-modal.html');
