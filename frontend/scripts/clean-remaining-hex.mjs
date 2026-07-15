/**
 * 清理 views 内剩余硬编码色（含短 hex / 常见 Element 色）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/views');

const MAP = [
  [/#F56C6C/gi, 'var(--color-danger)'],
  [/#f56c6c/gi, 'var(--color-danger)'],
  [/#67C23A/gi, 'var(--color-success)'],
  [/#67c23a/gi, 'var(--color-success)'],
  [/#409EFF/gi, 'var(--color-primary)'],
  [/#409eff/gi, 'var(--color-primary)'],
  [/#E6A23C/gi, 'var(--color-warning)'],
  [/#e6a23c/gi, 'var(--color-warning)'],
  [/#909399/gi, 'var(--color-text-secondary)'],
  [/#303133/gi, 'var(--color-text-primary)'],
  [/#606266/gi, 'var(--color-text-regular)'],
  [/#C0C4CC/gi, 'var(--color-text-placeholder, var(--color-text-secondary))'],
  [/#DCDFE6/gi, 'var(--color-border-base)'],
  [/#EBEEF5/gi, 'var(--color-border-lighter)'],
  [/#F2F3F5/gi, 'var(--color-bg-page)'],
  [/#F5F7FA/gi, 'var(--color-bg-section)'],
  [/#FAFCFF/gi, 'var(--color-bg-section)'],
  [/#FFFFFF/gi, 'var(--color-bg-base)'],
  [/#ffffff/gi, 'var(--color-bg-base)'],
  [/#FFF\b/gi, 'var(--color-bg-base)'],
  [/#fff\b/gi, 'var(--color-bg-base)'],
  [/#000000/gi, 'var(--ds-black, #000)'],
  [/#000\b/gi, 'var(--ds-black, #000)'],
  [/#7C3AED/gi, 'var(--ds-purple)'],
  [/#8b5cf6/gi, 'var(--ds-purple)'],
  [/#EA580C/gi, 'var(--ds-orange)'],
  [/#00B4D8/gi, 'var(--ds-cyan)'],
  [/#DB2777/gi, 'var(--ds-pink)'],
  [/#79bbff/gi, 'var(--color-primary-light-3, var(--color-primary))'],
  [/#a0cfff/gi, 'var(--color-primary-light-5, var(--color-primary))'],
  [/#337ecc/gi, 'var(--color-primary-dark-2, var(--color-primary))'],
  [/#95d475/gi, 'var(--color-success-light-3, var(--color-success))'],
  [/#b3e19d/gi, 'var(--color-success-light-5, var(--color-success))'],
  [/#529b2e/gi, 'var(--color-success-dark-2, var(--color-success))'],
  [/#eebe77/gi, 'var(--color-warning-light-3, var(--color-warning))'],
  [/#f3d19e/gi, 'var(--color-warning-light-5, var(--color-warning))'],
  [/#b88230/gi, 'var(--color-warning-dark-2, var(--color-warning))'],
  [/#f89898/gi, 'var(--color-danger-light-3, var(--color-danger))'],
  [/#fab6b6/gi, 'var(--color-danger-light-5, var(--color-danger))'],
  [/#c45656/gi, 'var(--color-danger-dark-2, var(--color-danger))'],
  [/#b1b3b8/gi, 'var(--color-info-light-3, var(--color-info))'],
  [/#c8c9cc/gi, 'var(--color-info-light-5, var(--color-info))'],
  [/#73767a/gi, 'var(--color-info-dark-2, var(--color-info))'],
];

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.vue$/.test(name)) acc.push(p);
  }
  return acc;
}

let files = 0;
let reps = 0;
const left = [];
for (const file of walk(root)) {
  const c = fs.readFileSync(file, 'utf8');
  let n = c;
  for (const [re, rep] of MAP) {
    const m = n.match(re);
    if (m) {
      reps += m.length;
      n = n.replace(re, rep);
    }
  }
  if (n !== c) {
    fs.writeFileSync(file, n, 'utf8');
    files += 1;
  }
  const remain = n.match(/#[0-9a-fA-F]{3,8}/g);
  if (remain) {
    left.push({ file: path.relative(root, file), samples: [...new Set(remain)].slice(0, 5) });
  }
}
console.log(JSON.stringify({ filesChanged: files, replacements: reps, remainingFiles: left.length, remaining: left.slice(0, 30) }, null, 2));
