/**
 * 常见行内 style → utility class
 * 保守替换，避免破坏动态绑定
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src');

const REPLACEMENTS = [
  // 静态 style 属性整段替换
  [/ style="width:\s*100%"/gi, ' class="w-full"'],
  [/ style="width:\s*100%;"/gi, ' class="w-full"'],
  [/ style="margin-bottom:\s*16px"/gi, ' class="mb-md"'],
  [/ style="margin-bottom:\s*16px;"/gi, ' class="mb-md"'],
  [/ style="margin-top:\s*16px"/gi, ' class="mt-md"'],
  [/ style="margin-top:\s*16px;"/gi, ' class="mt-md"'],
  [/ style="margin-bottom:\s*8px"/gi, ' class="mb-sm"'],
  [/ style="width:\s*200px"/gi, ' class="form-control-lg"'],
  [/ style="width:\s*160px"/gi, ' class="form-control-md"'],
  [/ style="width:\s*150px"/gi, ' class="form-control-md"'],
  [/ style="width:\s*120px"/gi, ' class="form-control-sm"'],
  [/ style="min-height:\s*100px;?"/gi, ' class="min-h-form"'],
  // 合并 class 时若已有 class="..." style 被单独替换成 class，可能产生两个 class——后处理合并
  [/ style="display:\s*flex;\s*align-items:\s*center;?\s*"/gi, ' class="flex-row"'],
  [/ style="display:\s*flex;\s*justify-content:\s*space-between;\s*align-items:\s*center;?\s*"/gi, ' class="flex-between"'],
  // 颜色行内
  [/style="color:\s*var\(--color-success\);?"/gi, 'class="text-success"'],
  [/style="color:\s*var\(--color-danger\);?"/gi, 'class="text-danger"'],
  [/style="color:\s*var\(--color-primary\);?"/gi, 'class="text-primary"'],
  [/style="color:\s*var\(--color-text-secondary\);?"/gi, 'class="text-muted"'],
  [/style="color:\s*var\(--color-text-regular\);?"/gi, 'class="text-regular"'],
];

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(p, acc);
    } else if (name.endsWith('.vue')) acc.push(p);
  }
  return acc;
}

function mergeDuplicateClass(html) {
  // class="a" class="b" → class="a b"
  return html.replace(
    /\sclass="([^"]*)"([^>]*?)\sclass="([^"]*)"/g,
    (_, c1, mid, c2) => {
      const set = new Set(`${c1} ${c2}`.split(/\s+/).filter(Boolean));
      return ` class="${[...set].join(' ')}"${mid}`;
    }
  );
}

let files = 0;
let hits = 0;
for (const file of walk(path.join(root, 'views'))) {
  const c = fs.readFileSync(file, 'utf8');
  let n = c;
  for (const [re, rep] of REPLACEMENTS) {
    const before = n;
    n = n.replace(re, rep);
    if (n !== before) hits += 1;
  }
  // 多轮合并 class
  for (let i = 0; i < 5; i++) {
    const m = mergeDuplicateClass(n);
    if (m === n) break;
    n = m;
  }
  if (n !== c) {
    fs.writeFileSync(file, n, 'utf8');
    files += 1;
  }
}
console.log(JSON.stringify({ filesChanged: files, ruleHits: hits }, null, 2));
