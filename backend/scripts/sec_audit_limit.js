const fs = require('fs');
const path = require('path');

function findAll(dir) {
  let r = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) r.push(...findAll(p));
    else if (e.name.endsWith('.js')) r.push(p);
  }
  return r;
}

const base = path.join(process.cwd(), 'src', 'controllers');
const files = findAll(base);

let issues = [];

files.forEach(f => {
  const c = fs.readFileSync(f, 'utf-8');
  const rel = path.relative(base, f);
  const lines = c.split('\n');

  lines.forEach((line, i) => {
    // 1. 检查遗漏的占位符 LIMIT ${...} => 比如写成了 LIMIT parseInt
    // 允许 LIMIT 1, LIMIT 10, LIMIT 100 等纯数字，不允许 LIMIT parseInt, LIMIT limit 等没有包裹的变量名
    if (line.match(/LIMIT\s+(?![\$\?\'\"`\d])\w+/) && !line.includes('LIMIT 1') && !line.includes('LIMIT 10')) {
      issues.push('语法疑似异常 (未插值 LIMIT): ' + rel + ':L' + (i+1) + ' => ' + line.trim());
    }

    // 2. 检查遗漏的反引号或单引号错误 (不在注释中)
    // 匹配: '...LIMIT ${...}' 或者 "...LIMIT ${...}"
    if (line.match(/['\"].*LIMIT\s*\$\{.*['\"]/) && !line.match(/^\s*\/\//)) {
      issues.push('语法异常 (单/双引号内的 LIMIT 插值): ' + rel + ':L' + (i+1) + ' => ' + line.trim());
    }

    // 3. 检查是否有 params.push(pageSize, offset) 之类的残留
    if (line.match(/params\.push\(.*(?:limit|offset|pageSize|actualPageSize).*page.*\)/i) && !line.match(/^\s*\/\//)) {
      issues.push('多余参数下发疑似残留: ' + rel + ':L' + (i+1) + ' => ' + line.trim());
    }

    // 4. 检查是否有执行时传入 [...params, limit] 但没有 ? 的 (针对双重铺平遗留)
    if (line.match(/(?:execute|query)\(.*\[\.\.\.\w+,\s*(?:limit|offset|pageSize|actualOffset|limitValue|offsetValue)/)) {
      issues.push('多余的分页参数展开残留: ' + rel + ':L' + (i+1) + ' => ' + line.trim());
    }
  });
});

console.log('--- 基础语法与分页特异性审计完毕 ---');
if(issues.length > 0) {
    issues.forEach(i => console.log(i));
} else {
    console.log('未发现明显的分页插值、单引号与数组越界传参等错误。');
}
