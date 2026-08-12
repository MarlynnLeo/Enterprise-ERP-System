const fs = require('fs');
const path = require('path');
function read(p, n=200){ try { return fs.readFileSync(p,'utf8').split(/\r?\n/).slice(0,n).join('\n'); } catch(e){ return e.message } }
console.log('==== MaterialTable ====');
console.log(fs.readFileSync('F:/ERP/frontend/src/views/baseData/components/MaterialTable.vue','utf8').slice(0,2500));
console.log('==== productCategory options model ====');
const pc = fs.readFileSync('F:/ERP/backend/src/models/productCategory.js','utf8');
const idx = pc.indexOf('getProductCategoryOptions');
console.log(pc.slice(idx, idx+2500));
console.log('==== categoryService ====');
console.log(fs.readFileSync('F:/ERP/backend/src/services/categoryService.js','utf8').slice(0,2000));
