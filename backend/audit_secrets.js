const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
}

const hardcoded = [];

walk('f:/ERP/backend/src', function(filePath) {
  if (!filePath.endsWith('.js')) return;
  const content = fs.readFileSync(filePath, 'utf8');
  
  // 匹配类似 password: 'xxx' 或 secret: "xxx" 等
  const regex = /(?:password|secret|key|token)\s*[:=]\s*['"]([^'"]+)['"]/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
      const val = match[1];
      // 忽略看起来像变量引用的，如 '' 或是环境变量 'process.env...' 但是这个正则已经去除了这种情况
      // 过滤太短的，或者是常见的配置值比如 '123456' 已经在要求里了
      if (val.length > 3 && !['id', 'name', 'status'].includes(val)) {
          const lineNum = content.substring(0, match.index).split('\n').length;
          hardcoded.push({ file: filePath.replace('f:\\ERP\\backend\\src\\', ''), lineNum, snippet: match[0] });
      }
  }
});
console.log(JSON.stringify(hardcoded, null, 2));
