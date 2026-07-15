import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/views/quality');
let n = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.vue'))) {
  const p = path.join(dir, f);
  let c = fs.readFileSync(p, 'utf8');
  const o = c;
  c = c.replace(/class="box-card"/g, 'class="data-card"');
  c = c.replace(
    /<template #header>\s*<div class="card-header">\s*<span>[^<]*<\/span>\s*<\/div>\s*<\/template>/g,
    ''
  );
  if (c !== o) {
    fs.writeFileSync(p, c, 'utf8');
    n += 1;
    console.log('ok', f);
  }
}
console.log('changed', n);
