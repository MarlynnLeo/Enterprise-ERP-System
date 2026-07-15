/**
 * 将标准 header-card 结构转为 PageHeader 组件
 * 匹配：
 *   <el-card class="header-card"> ... <h2>标题</h2> <p class="subtitle">...</p> [actions] </el-card>
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
      if (name === 'components') continue; // 子组件多数不是整页
      walk(p, acc);
    } else if (name.endsWith('.vue')) acc.push(p);
  }
  return acc;
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, ' ')
    .trim();
}

function convert(content) {
  if (content.includes('<PageHeader')) return { content, changed: false, reason: 'already' };

  // 允许 action-section / operation-btns / 无 actions
  const re =
    /<el-card\s+class="header-card"[^>]*>\s*<div\s+class="header-content">\s*<div\s+class="title-section">\s*<h2>([\s\S]*?)<\/h2>\s*(?:<p\s+class="subtitle">([\s\S]*?)<\/p>\s*)?<\/div>\s*(?:<(?:div)\s+class="(?:action-section|operation-btns|header-actions)"[^>]*>([\s\S]*?)<\/div>\s*)?<\/div>\s*<\/el-card>/g;

  let count = 0;
  const next = content.replace(re, (_, titleRaw, subRaw, actionsRaw) => {
    count += 1;
    // 动态标题：pageTitle
    const titleIsDynamic = /\{\{/.test(titleRaw);
    const subtitleIsDynamic = subRaw && /\{\{/.test(subRaw);
    const titleAttr = titleIsDynamic
      ? `:title="${titleRaw.replace(/\{\{\s*|\s*\}\}/g, '').trim()}"`
      : `title="${escapeAttr(titleRaw)}"`;
    const sub = subRaw ? String(subRaw).trim() : '';
    const subAttr = sub
      ? subtitleIsDynamic
        ? ` :subtitle="${subRaw.replace(/\{\{\s*|\s*\}\}/g, '').trim()}"`
        : ` subtitle="${escapeAttr(sub)}"`
      : '';

    if (actionsRaw && actionsRaw.trim()) {
      return `<PageHeader ${titleAttr}${subAttr}>\n      <template #actions>\n${actionsRaw.trim()}\n      </template>\n    </PageHeader>`;
    }
    return `<PageHeader ${titleAttr}${subAttr} />`;
  });

  return { content: next, changed: count > 0, count };
}

const files = walk(root);
let filesChanged = 0;
let total = 0;
const report = [];

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const { content, changed, count } = convert(raw);
  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    filesChanged += 1;
    total += count || 1;
    report.push(path.relative(root, file) + ` (${count})`);
  }
}

console.log(JSON.stringify({ filesChanged, headersConverted: total, report }, null, 2));
