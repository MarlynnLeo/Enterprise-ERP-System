/**
 * header-content 内 title-section + 直接 el-button（无包裹 div）→ PageHeader
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/views');

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === 'components') continue;
      walk(p, acc);
    } else if (name.endsWith('.vue')) acc.push(p);
  }
  return acc;
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\n/g, ' ').trim();
}

const re =
  /<el-card\s+class="header-card"[^>]*>\s*<div\s+class="header-content">\s*<div\s+class="title-section">\s*<h2>([\s\S]*?)<\/h2>\s*(?:<p\s+class="subtitle">([\s\S]*?)<\/p>\s*)?<\/div>\s*((?:<el-button[\s\S]*?<\/el-button>\s*)+)\s*<\/div>\s*<\/el-card>/g;

let filesChanged = 0;
let total = 0;
const report = [];
for (const file of walk(root)) {
  const c = fs.readFileSync(file, 'utf8');
  if (!c.includes('header-card')) continue;
  let count = 0;
  const n = c.replace(re, (_, titleRaw, subRaw, actionsRaw) => {
    count += 1;
    const titleIsDynamic = /\{\{/.test(titleRaw);
    const titleAttr = titleIsDynamic
      ? `:title="${String(titleRaw).replace(/\{\{\s*|\s*\}\}/g, '').trim()}"`
      : `title="${escapeAttr(titleRaw)}"`;
    const sub = subRaw ? String(subRaw).trim() : '';
    const subAttr = sub ? ` subtitle="${escapeAttr(sub)}"` : '';
    return `<PageHeader ${titleAttr}${subAttr}>\n      <template #actions>\n${String(actionsRaw).trim()}\n      </template>\n    </PageHeader>`;
  });
  if (count > 0) {
    fs.writeFileSync(file, n, 'utf8');
    filesChanged += 1;
    total += count;
    report.push(path.relative(root, file));
  }
}
console.log(JSON.stringify({ filesChanged, total, report }, null, 2));
