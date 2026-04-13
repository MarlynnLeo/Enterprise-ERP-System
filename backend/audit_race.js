const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
}

const raceRisks = [];

walk('f:/ERP/backend/src', function(filePath) {
  if (!filePath.endsWith('.js') || filePath.includes('node_modules')) return;
  const content = fs.readFileSync(filePath, 'utf8');
  
  // 查找是否有扣减或增加库存/余额的逻辑 (例如 quantity = quantity - ...)
  // 且没有在同一个方法里出现 FOR UPDATE
  const updatePatterns = [
    /UPDATE\s+(?:materials|inventory_ledger|accounts|balance)\s+SET.*?(?:\+|-)/gi,
    /const\s+newQuantity\s*=\s*\w+\s*[-+]/g
  ];

  let hasRisk = true;
  for (const regex of updatePatterns) {
      if (regex.test(content)) {
          // 检查同一文件内是否有 FOR UPDATE
          if (!/FOR\s+UPDATE/i.test(content)) {
              raceRisks.push(filePath.replace('f:\\ERP\\backend\\src\\', ''));
              break;
          }
      }
  }
});

console.log(JSON.stringify(raceRisks, null, 2));
