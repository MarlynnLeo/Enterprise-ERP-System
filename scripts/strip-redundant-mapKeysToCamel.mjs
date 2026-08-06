/**
 * Strip mapKeysToCamel(...) wrappers around ResponseHandler.success/paginated payloads.
 * ResponseHandler already camelizes. Keep mapKeysToSnake.
 *
 * node scripts/strip-redundant-mapKeysToCamel.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctrlRoot = path.join(root, 'backend/src/controllers');

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, files);
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

function stripMapKeysToCamelCalls(text) {
  // ResponseHandler.success(res, mapKeysToCamel(...), ...)
  // ResponseHandler.paginated(res, mapKeysToCamel(...), ...)
  const markers = [
    /ResponseHandler\.(success|paginated)\s*\(\s*res\s*,\s*mapKeysToCamel\s*\(/g,
  ];
  let result = text;
  let total = 0;
  for (const re of markers) {
    let guard = 0;
    while (guard++ < 500) {
      re.lastIndex = 0;
      const m = re.exec(result);
      if (!m) break;
      const callStart = m.index + m[0].lastIndexOf('mapKeysToCamel');
      const openParen = result.indexOf('(', callStart);
      const closeParen = findMatchingParen(result, openParen);
      if (closeParen < 0) break;
      const inner = result.slice(openParen + 1, closeParen);
      // replace mapKeysToCamel(inner) with inner
      const before = result.slice(0, callStart);
      const after = result.slice(closeParen + 1);
      result = before + inner + after;
      total += 1;
    }
  }
  return { text: result, total };
}

function cleanupImport(text) {
  // mapKeysToCamel only import → remove or keep mapKeysToSnake
  if (!/\bmapKeysToCamel\b/.test(text)) {
    // remove from destructure
    let t = text.replace(
      /const\s*\{\s*mapKeysToCamel\s*,\s*mapKeysToSnake\s*\}\s*=\s*require\(([^)]+)\);?/g,
      'const { mapKeysToSnake } = require($1);'
    );
    t = t.replace(
      /const\s*\{\s*mapKeysToSnake\s*,\s*mapKeysToCamel\s*\}\s*=\s*require\(([^)]+)\);?/g,
      'const { mapKeysToSnake } = require($1);'
    );
    t = t.replace(
      /const\s*\{\s*mapKeysToCamel\s*\}\s*=\s*require\(([^)]+)\);?\r?\n?/g,
      ''
    );
    // aliased imports
    t = t.replace(
      /const\s*\{\s*mapKeysToCamel\s*:\s*_toCamel\s*,\s*mapKeysToSnake\s*:\s*_toSnake\s*\}\s*=\s*require\(([^)]+)\);?/g,
      'const { mapKeysToSnake: _toSnake } = require($1);'
    );
    return t;
  }
  // still used somewhere — if only in comments, leave
  return text;
}

let filesChanged = 0;
let stripped = 0;

for (const file of walk(ctrlRoot)) {
  const orig = fs.readFileSync(file, 'utf8');
  if (!orig.includes('mapKeysToCamel')) continue;
  let { text, total } = stripMapKeysToCamelCalls(orig);
  if (total === 0 && !/mapKeysToCamel\s*\(/.test(orig)) continue;
  text = cleanupImport(text);
  // second pass cleanup if mapKeysToCamel fully gone
  if (!/\bmapKeysToCamel\b/.test(text)) {
    text = cleanupImport(text);
  }
  if (text !== orig) {
    fs.writeFileSync(file, text);
    filesChanged += 1;
    stripped += total;
    console.log(path.relative(root, file).replace(/\\/g, '/'), 'stripped', total);
  }
}

console.log(JSON.stringify({ filesChanged, stripped }, null, 2));
