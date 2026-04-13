const fs = require('fs');
let c = fs.readFileSync('f:/ERP/backend/src/controllers/business/sales/salesReturnController.js', 'utf8');
c = c.replace(/^( *)(\(.*?\)\s*\{ *\n)/gm, '$1if $2');
fs.writeFileSync('f:/ERP/backend/src/controllers/business/sales/salesReturnController.js', c, 'utf8');
