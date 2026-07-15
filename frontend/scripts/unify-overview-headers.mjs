/**
 * 数据概览看板：header-card → PageHeader
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/views/dataoverview');

const re =
  /<el-card\s+class="header-card"[^>]*>\s*<div[^>]*>\s*<h2>([^<]+)<\/h2>\s*<div>([\s\S]*?)<\/div>\s*<\/div>\s*<\/el-card>/;

let n = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.vue'))) {
  const p = path.join(dir, f);
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes('header-card')) continue;
  const m = c.match(re);
  if (!m) {
    // simpler: only h2
    const re2 =
      /<el-card\s+class="header-card"[^>]*>\s*<div[^>]*>\s*<h2>([^<]+)<\/h2>([\s\S]*?)<\/div>\s*<\/el-card>/;
    const m2 = c.match(re2);
    if (!m2) {
      console.log('fail', f);
      continue;
    }
    const title = m2[1].trim();
    const rest = m2[2].trim();
    const actions = rest
      ? `\n      <template #actions>\n        ${rest}\n      </template>`
      : '';
    c = c.replace(m2[0], `<PageHeader title="${title}">${actions}\n    </PageHeader>`);
    fs.writeFileSync(p, c, 'utf8');
    n += 1;
    console.log('ok', f, title);
    continue;
  }
  const title = m[1].trim();
  const actionsInner = m[2].trim();
  c = c.replace(
    m[0],
    `<PageHeader title="${title}">\n      <template #actions>\n        ${actionsInner}\n      </template>\n    </PageHeader>`
  );
  fs.writeFileSync(p, c, 'utf8');
  n += 1;
  console.log('ok', f, title);
}
console.log('changed', n);
