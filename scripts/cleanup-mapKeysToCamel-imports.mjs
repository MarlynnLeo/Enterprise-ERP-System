/**
 * Clean unused mapKeysToCamel imports and remaining ResponseHandler wrappers.
 * node scripts/cleanup-mapKeysToCamel-imports.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctrlRoot = path.join(root, 'backend/src/controllers');

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, files);
    else if (name.endsWith('.js')) files.push(full);
  }
  return files;
}

function findMatchingParen(text, openIdx) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function stripAllMapKeysToCamelOnRH(text) {
  // more general: mapKeysToCamel( appearing as 2nd arg after res,
  let result = text;
  let total = 0;
  const needle = 'mapKeysToCamel(';
  let guard = 0;
  while (guard++ < 800) {
    const idx = result.indexOf(needle);
    if (idx < 0) break;
    // only strip if this call is inside ResponseHandler.success/paginated second arg
    const windowStart = Math.max(0, idx - 80);
    const prefix = result.slice(windowStart, idx);
    if (!/ResponseHandler\.(success|paginated)\s*\(\s*res\s*,\s*$/.test(prefix.replace(/\s+/g, ' ').replace(/.*(?=ResponseHandler)/, ''))) {
      // try looser: ends with res,
      if (!/res\s*,\s*$/.test(prefix) || !prefix.includes('ResponseHandler')) {
        // skip this occurrence by replacing temporarily
        result = result.slice(0, idx) + '/*SKIP_MC*/' + result.slice(idx + needle.length - 1);
        continue;
      }
    }
    const openParen = idx + needle.length - 1;
    const close = findMatchingParen(result, openParen);
    if (close < 0) break;
    const inner = result.slice(openParen + 1, close);
    result = result.slice(0, idx) + inner + result.slice(close + 1);
    total += 1;
  }
  result = result.replace(/\/\*SKIP_MC\*\//g, 'mapKeysToCamel');
  return { text: result, total };
}

function cleanImports(text) {
  const used = /\bmapKeysToCamel\s*\(/.test(text) || /\bmapKeysToCamel\s*:/.test(text);
  // count identifier uses excluding import lines
  const withoutImports = text
    .split(/\r?\n/)
    .filter((l) => !/require\(.*fieldMap/.test(l) && !/from ['"].*fieldMap/.test(l))
    .join('\n');
  const stillUsed = /\bmapKeysToCamel\b/.test(withoutImports);

  if (stillUsed) return text;

  let t = text;
  t = t.replace(
    /const\s*\{\s*mapKeysToCamel\s*,\s*mapKeysToSnake\s*\}\s*=\s*require\(([^)]+)\);/g,
    'const { mapKeysToSnake } = require($1);'
  );
  t = t.replace(
    /const\s*\{\s*mapKeysToSnake\s*,\s*mapKeysToCamel\s*\}\s*=\s*require\(([^)]+)\);/g,
    'const { mapKeysToSnake } = require($1);'
  );
  t = t.replace(
    /const\s*\{\s*mapKeysToCamel\s*:\s*\w+\s*,\s*mapKeysToSnake\s*:\s*(\w+)\s*\}\s*=\s*require\(([^)]+)\);/g,
    'const { mapKeysToSnake: $1 } = require($2);'
  );
  t = t.replace(
    /const\s*\{\s*mapKeysToCamel\s*\}\s*=\s*require\(([^)]+)\);\r?\n?/g,
    ''
  );
  // local re-require
  t = t.replace(
    /const\s*\{\s*mapKeysToCamel\s*\}\s*=\s*require\([^)]+\);\r?\n?/g,
    ''
  );
  return t;
}

let filesChanged = 0;
let stripped = 0;

for (const file of walk(ctrlRoot)) {
  let orig = fs.readFileSync(file, 'utf8');
  if (!orig.includes('mapKeysToCamel')) continue;
  let { text, total } = stripAllMapKeysToCamelOnRH(orig);
  text = cleanImports(text);
  if (text !== orig) {
    fs.writeFileSync(file, text);
    filesChanged += 1;
    stripped += total;
    console.log(path.relative(root, file).replace(/\\/g, '/'), 'stripped', total);
  }
}
console.log(JSON.stringify({ filesChanged, stripped }, null, 2));
