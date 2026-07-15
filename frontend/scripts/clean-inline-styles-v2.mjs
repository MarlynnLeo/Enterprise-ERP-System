/**
 * 第二轮行内 style 清理（表格宽度、语义色字重）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/views');

const REPLACEMENTS = [
  [/ style="width:\s*100%;\s*margin-top:\s*16px;?"/gi, ' class="w-full mt-md"'],
  [/ style="margin-top:\s*16px;\s*width:\s*100%;?"/gi, ' class="w-full mt-md"'],
  [/ style="width:\s*100%;\s*margin-top:\s*20px;?"/gi, ' class="w-full mt-md"'],
  [/ style="color:\s*var\(--color-success\);\s*font-weight:\s*bold;?"/gi, ' class="text-success font-weight-700"'],
  [/ style="color:\s*var\(--color-danger\);\s*font-weight:\s*bold;?"/gi, ' class="text-danger font-weight-700"'],
  [/ style="color:\s*var\(--color-warning\);\s*font-weight:\s*bold;?"/gi, ' class="text-warning font-weight-700"'],
  [/ style="color:\s*var\(--color-primary\);\s*font-weight:\s*bold;?"/gi, ' class="text-primary font-weight-700"'],
  [/ style="color:\s*var\(--color-success\);?"/gi, ' class="text-success"'],
  [/ style="color:\s*var\(--color-danger\);?"/gi, ' class="text-danger"'],
  [/ style="color:\s*var\(--color-warning\);?"/gi, ' class="text-warning"'],
  [/ style="color:\s*var\(--color-primary\);?"/gi, ' class="text-primary"'],
  [/ style="color:\s*var\(--color-text-secondary\);?"/gi, ' class="text-muted"'],
  [/ style="font-weight:\s*bold;?"/gi, ' class="font-weight-700"'],
  [/ style="font-weight:\s*600;?"/gi, ' class="font-weight-600"'],
  [/ style="margin-left:\s*5px;?"/gi, ' class="ml-sm"'],
  [/ style="margin-left:\s*8px;?"/gi, ' class="ml-sm"'],
];

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (name.endsWith('.vue')) acc.push(p);
  }
  return acc;
}

function mergeClass(html) {
  let n = html;
  for (let i = 0; i < 6; i++) {
    const m = n.replace(
      /\sclass="([^"]*)"([^>]*?)\sclass="([^"]*)"/g,
      (_, c1, mid, c2) => {
        const set = new Set(`${c1} ${c2}`.split(/\s+/).filter(Boolean));
        return ` class="${[...set].join(' ')}"${mid}`;
      }
    );
    if (m === n) break;
    n = m;
  }
  return n;
}

let files = 0;
let hits = 0;
for (const file of walk(root)) {
  const c = fs.readFileSync(file, 'utf8');
  let n = c;
  for (const [re, rep] of REPLACEMENTS) {
    const before = n;
    n = n.replace(re, rep);
    if (n !== before) hits += 1;
  }
  n = mergeClass(n);
  if (n !== c) {
    fs.writeFileSync(file, n, 'utf8');
    files += 1;
  }
}
console.log(JSON.stringify({ filesChanged: files, ruleHits: hits }, null, 2));
