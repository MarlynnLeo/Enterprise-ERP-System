/**
 * UI 批量修复：
 * 1) 业务页常见硬编码 hex → CSS 变量
 * 2) 顶层 views 根节点补 module-page class（已有则跳过）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '../src');

const HEX_MAP = [
  [/#F56C6C/gi, 'var(--color-danger)'],
  [/#67C23A/gi, 'var(--color-success)'],
  [/#409EFF/gi, 'var(--color-primary)'],
  [/#E6A23C/gi, 'var(--color-warning)'],
  [/#909399/gi, 'var(--color-text-secondary)'],
  [/#303133/gi, 'var(--color-text-primary)'],
  [/#606266/gi, 'var(--color-text-regular)'],
  [/#C0C4CC/gi, 'var(--color-text-placeholder, var(--color-text-secondary))'],
  [/#DCDFE6/gi, 'var(--color-border-base)'],
  [/#EBEEF5/gi, 'var(--color-border-lighter)'],
  [/#F2F3F5/gi, 'var(--color-bg-page)'],
  [/#FFFFFF/gi, 'var(--color-bg-base)'],
  [/#fff\b/gi, 'var(--color-bg-base)'],
  [/#000000/gi, 'var(--ds-black, #000)'],
  [/#000\b/gi, 'var(--ds-black, #000)'],
];

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(p, acc);
    } else if (/\.(vue|css|scss)$/.test(name)) {
      acc.push(p);
    }
  }
  return acc;
}

function replaceHex(content) {
  let next = content;
  let count = 0;
  for (const [re, rep] of HEX_MAP) {
    const before = next;
    next = next.replace(re, rep);
    if (next !== before) {
      const m = before.match(re);
      count += m ? m.length : 1;
    }
  }
  return { content: next, count };
}

function ensureModulePageOnView(filePath, content) {
  // 只处理 views 下非 components 子目录的顶层/业务页
  const rel = path.relative(path.join(srcRoot, 'views'), filePath).replace(/\\/g, '/');
  if (rel.startsWith('..')) return { content, changed: false };
  if (rel.includes('/components/')) return { content, changed: false };
  if (/(Layout|Login|NotFound|Dashboard|BaseData|UserProfile)\.vue$/.test(rel)) {
    return { content, changed: false };
  }
  if (content.includes('module-page')) return { content, changed: false };

  // 在第一个带 class 的根 div 上追加 module-page
  const re = /(<template>\s*)(<div\s+class=")([^"]*)(")/;
  if (re.test(content)) {
    const next = content.replace(re, (full, a, b, classes, d) => {
      if (classes.split(/\s+/).includes('module-page')) return full;
      return `${a}${b}module-page ${classes}${d}`;
    });
    return { content: next, changed: next !== content };
  }

  // 无 class 的根 div
  const re2 = /(<template>\s*)(<div)(\s*>)/;
  if (re2.test(content)) {
    const next = content.replace(re2, '$1$2 class="module-page"$3');
    return { content: next, changed: next !== content };
  }

  return { content, changed: false };
}

const files = walk(srcRoot);
let hexFiles = 0;
let hexReplaces = 0;
let modulePages = 0;

for (const file of files) {
  let raw = fs.readFileSync(file, 'utf8');
  let changed = false;

  if (file.includes(`${path.sep}views${path.sep}`) || file.includes(`${path.sep}components${path.sep}`)) {
    const { content, count } = replaceHex(raw);
    if (count > 0) {
      raw = content;
      changed = true;
      hexFiles += 1;
      hexReplaces += count;
    }
  }

  if (file.endsWith('.vue') && file.includes(`${path.sep}views${path.sep}`)) {
    const r = ensureModulePageOnView(file, raw);
    if (r.changed) {
      raw = r.content;
      changed = true;
      modulePages += 1;
    }
  }

  if (changed) {
    fs.writeFileSync(file, raw, 'utf8');
  }
}

console.log(
  JSON.stringify({ filesScanned: files.length, hexFiles, hexReplaces, modulePagesFixed: modulePages }, null, 2)
);
