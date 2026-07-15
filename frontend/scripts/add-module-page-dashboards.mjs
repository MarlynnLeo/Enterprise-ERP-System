import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'src/views/dataoverview');

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.vue'))) {
  const p = path.join(dir, f);
  const c = fs.readFileSync(p, 'utf8');
  if (c.includes('module-page')) {
    console.log('skip', f);
    continue;
  }
  const n = c.replace(/(<template>\s*<div\s+class=")([^"]*)(")/, (_, a, b, d) => {
    return `${a}module-page overview-page ${b}${d}`;
  });
  if (n !== c) {
    fs.writeFileSync(p, n, 'utf8');
    console.log('ok', f);
  } else {
    console.log('fail', f);
  }
}

const dp = path.join(root, 'src/views/dashboard/Dashboard.vue');
let d = fs.readFileSync(dp, 'utf8');
if (!d.includes('module-page')) {
  d = d.replace(
    'class="dashboard-container"',
    'class="module-page dashboard-page dashboard-container"'
  );
  fs.writeFileSync(dp, d, 'utf8');
  console.log('ok Dashboard');
} else {
  console.log('skip Dashboard');
}
