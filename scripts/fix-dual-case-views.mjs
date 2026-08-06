/**
 * Codemod: strip dual camel||snake reads in frontend/mobile views.
 * Prefer camelCase (API SSOT). FieldMaps / backend left alone.
 *
 * node scripts/fix-dual-case-views.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [
  'frontend/src/views',
  'frontend/src/composables',
  'frontend/src/utils',
  'frontend/src/components',
  'mobile/src/views',
  'mobile/src/composables',
  'mobile/src/utils',
];

const EXT = new Set(['.js', '.vue', '.ts', '.mjs']);
const SKIP = new Set(['node_modules', 'dist', 'coverage', '.git']);

function walk(dir, files = []) {
  const fullDir = path.join(root, dir);
  if (!fs.existsSync(fullDir)) return files;
  for (const name of fs.readdirSync(fullDir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(fullDir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(path.relative(root, full), files);
    else if (EXT.has(path.extname(name))) files.push(full);
  }
  return files;
}

function snakeToCamel(s) {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

// obj.snake_case || obj.camelCase  OR  obj.camelCase || obj.snake_case
const DUAL =
  /\b([A-Za-z_$][\w$]*)\.([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\s*\|\|\s*\1\.([a-z][a-zA-Z0-9]*)\b|\b([A-Za-z_$][\w$]*)\.([a-z][a-zA-Z0-9]*)\s*\|\|\s*\4\.([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g;

let filesChanged = 0;
let replacements = 0;

for (const dir of dirs) {
  for (const file of walk(dir)) {
    let text = fs.readFileSync(file, 'utf8');
    const orig = text;
    text = text.replace(DUAL, (match, a1, snake1, camel1, a2, camel2, snake2) => {
      if (snake1 && camel1) {
        // snake || camel — if camel is snakeToCamel(snake) use camel only
        const expected = snakeToCamel(snake1);
        if (camel1 === expected || camel1 === snake1.replace(/_/g, '')) {
          replacements += 1;
          return `${a1}.${camel1}`;
        }
        // different semantic aliases: prefer camel side if looks camel, else snake→camel
        replacements += 1;
        return `${a1}.${expected}`;
      }
      if (camel2 && snake2) {
        const expected = snakeToCamel(snake2);
        if (camel2 === expected || camel2 === snake2.replace(/_/g, '')) {
          replacements += 1;
          return `${a2}.${camel2}`;
        }
        replacements += 1;
        return `${a2}.${expected}`;
      }
      return match;
    });
    if (text !== orig) {
      fs.writeFileSync(file, text);
      filesChanged += 1;
      console.log('fixed', path.relative(root, file).replace(/\\/g, '/'));
    }
  }
}

console.log(JSON.stringify({ filesChanged, replacements }, null, 2));
