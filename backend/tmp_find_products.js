const fs = require('fs');
const path = require('path');
function findFiles(root, pattern) {
  const res = [];
  try {
    const files = fs.readdirSync(root, { withFileTypes: true });
    for (const f of files) {
      const full = path.join(root, f.name);
      if (f.isDirectory()) {
        if (f.name !== 'node_modules') res.push(...findFiles(full, pattern));
      } else if (f.name.match(pattern)) {
        res.push(full);
      }
    }
  } catch(e){}
  return res;
}
const jsFiles = findFiles('F:\ERP\frontend\src', '\.(vue|js|ts|jsx|tsx)$');
const matches = [];
for (const f of jsFiles.slice(0, 200)) {
  const content = fs.readFileSync(f, 'utf8');
  if (content.match(/productCategory|物料大类|物料类型|ProductCategory|product_category/)) {
    matches.push(f);
    if (matches.length >= 40) break;
  }
}
console.log(matches.slice(0, 40));
