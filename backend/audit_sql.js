const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
}

const results = [];
const regex = /(?:pool|connection|db)\.(?:query|execute)\s*\(\s*\[^\]*\$\{.*?\}[^\]*\\s*[,)]/g;

walk('f:/ERP/backend/src', function(filePath) {
  if (!filePath.endsWith('.js')) return;
  const content = fs.readFileSync(filePath, 'utf8');
  let match;
  while ((match = regex.exec(content)) !== null) {
    // 简单的过滤掉安全的模板字符串，比如被单引号包裹防止数字注入不够安全，但过滤掉显而易见的
    // 主要是找出直接拼接变量的
    const lines = content.substring(0, match.index).split('\n');
    const lineNum = lines.length;
    const snippet = match[0].substring(0, 150).replace(/\r?\n/g, ' ');
    results.push({ file: filePath.replace('f:\\ERP\\backend\\src\\', ''), lineNum, snippet });
  }
});

console.log(JSON.stringify(results, null, 2));
