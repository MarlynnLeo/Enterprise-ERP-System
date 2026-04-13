const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
}

const swallowedErrors = [];

walk('f:/ERP/backend/src', function(filePath) {
  if (!filePath.endsWith('.js')) return;
  const content = fs.readFileSync(filePath, 'utf8');
  
  // 匹配 catch(err) { ... }
  const catchRegex = /catch\s*\(\w+\)\s*\{([\s\S]*?)\}/g;
  let match;
  while ((match = catchRegex.exec(content)) !== null) {
      const block = match[1].trim();
      // 如果块为空，或者只包含注释，或者只包含 logger/console
      if (block === '' || /^(\/\/.*|logger\.\w+\(.*?\);*|console\.\w+\(.*?\);*|\s*)+$/.test(block)) {
          // 如果没有抛出或响应，且不是专门用来忽略的(比如有 return 或者 throw)
          if (!block.includes('throw') && !block.includes('res.') && !block.includes('return')) {
            const lineNum = content.substring(0, match.index).split('\n').length;
            swallowedErrors.push({ file: filePath.replace('f:\\ERP\\backend\\src\\', ''), lineNum });
          }
      }
  }
});

console.log(JSON.stringify(swallowedErrors.slice(0, 50), null, 2));
