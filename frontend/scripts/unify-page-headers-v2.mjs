/**
 * 第二轮：处理 action 区无标准 class 的 header-card
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

function convert(content) {
  // 更宽：title-section 后任意一个 div 作为 actions
  const re =
    /<el-card\s+class="header-card"[^>]*>\s*<div\s+class="header-content">\s*<div\s+class="title-section">\s*<h2>([\s\S]*?)<\/h2>\s*(?:<p\s+class="subtitle">([\s\S]*?)<\/p>\s*)?<\/div>\s*(?:<div([^>]*)>([\s\S]*?)<\/div>\s*)?<\/div>\s*<\/el-card>/g;

  let count = 0;
  const next = content.replace(re, (full, titleRaw, subRaw, _divAttrs, actionsRaw) => {
    // 若已是 PageHeader 周边误匹配则跳过
    if (full.includes('PageHeader')) return full;
    count += 1;
    const titleIsDynamic = /\{\{/.test(titleRaw);
    const subtitleIsDynamic = subRaw && /\{\{/.test(subRaw);
    const titleAttr = titleIsDynamic
      ? `:title="${String(titleRaw).replace(/\{\{\s*|\s*\}\}/g, '').trim()}"`
      : `title="${escapeAttr(titleRaw)}"`;
    const sub = subRaw ? String(subRaw).trim() : '';
    const subAttr = sub
      ? subtitleIsDynamic
        ? ` :subtitle="${String(subRaw).replace(/\{\{\s*|\s*\}\}/g, '').trim()}"`
        : ` subtitle="${escapeAttr(sub)}"`
      : '';

    if (actionsRaw && String(actionsRaw).trim()) {
      return `<PageHeader ${titleAttr}${subAttr}>\n      <template #actions>\n${String(actionsRaw).trim()}\n      </template>\n    </PageHeader>`;
    }
    return `<PageHeader ${titleAttr}${subAttr} />`;
  });

  return { content: next, changed: count > 0, count };
}

let filesChanged = 0;
let total = 0;
const report = [];
for (const file of walk(root)) {
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.includes('header-card') || !raw.includes('<h2>')) continue;
  const { content, changed, count } = convert(raw);
  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    filesChanged += 1;
    total += count;
    report.push(path.relative(root, file));
  }
}
console.log(JSON.stringify({ filesChanged, headersConverted: total, report }, null, 2));
