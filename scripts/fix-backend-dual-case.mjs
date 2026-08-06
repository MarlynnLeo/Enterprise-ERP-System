/**
 * Fix remaining dual camel||snake in controllers (not FieldMaps).
 * Prefer camel after mapKeysToSnake body should already be snake — for HTTP body
 * use mapKeysToSnake first then snake fields; for display rows use camel from joins.
 *
 * node scripts/fix-backend-dual-case.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function snakeToCamel(s) {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

const DUAL =
  /\b([A-Za-z_$][\w$]*)\.([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\s*\|\|\s*\1\.([a-z][a-zA-Z0-9]*)\b|\b([A-Za-z_$][\w$]*)\.([a-z][a-zA-Z0-9]*)\s*\|\|\s*\4\.([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g;

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, files);
    else if (name.endsWith('.js')) files.push(full);
  }
  return files;
}

// Semantic pairs that are NOT pure case transforms — keep both sides but camel-ize snake
const SEMANTIC = new Map([
  ['operator', 'realName'], // real_name || operator → realName || operator
  ['username', 'realName'],
  ['price', 'unitPrice'],
  ['price', 'costPrice'],
  ['balance', 'balanceAmount'],
  ['originalValue', 'acquisitionCost'],
  ['specification', 'materialSpecs'],
  ['standard', 'standardValue'],
  ['id', 'reuseItemId'],
  ['transaction_type', 'type'],
  ['leave_type', 'type'],
  ['overtime_type', 'type'],
  ['overtime_date', 'date'],
  ['avatar_frame', 'frameId'],
  ['d1_team_leader', 'owner'],
]);

function fixFile(file) {
  let text = fs.readFileSync(file, 'utf8');
  const orig = text;
  text = text.replace(DUAL, (match, a1, snake1, camel1, a2, camel2, snake2) => {
    if (snake1 && camel1) {
      const expected = snakeToCamel(snake1);
      // pure case dual
      if (camel1 === expected) return `${a1}.${expected}`;
      // semantic: snake || otherName → camel(snake) || otherName
      return `${a1}.${expected} || ${a1}.${camel1}`;
    }
    if (camel2 && snake2) {
      const expected = snakeToCamel(snake2);
      if (camel2 === expected) return `${a2}.${camel2}`;
      return `${a2}.${camel2} || ${a2}.${expected}`;
    }
    return match;
  });
  if (text !== orig) {
    fs.writeFileSync(file, text);
    return true;
  }
  return false;
}

let n = 0;
for (const f of walk(path.join(root, 'backend/src/controllers'))) {
  if (fixFile(f)) {
    n++;
    console.log(path.relative(root, f).replace(/\\/g, '/'));
  }
}
// FieldMaps intentionally dual for query fromApi — convert to camel-only for query side
for (const rel of [
  'backend/src/utils/finance/glFieldMap.js',
  'backend/src/utils/inventory/inventoryFieldMap.js',
  'backend/src/utils/purchase/purchaseFieldMap.js',
]) {
  const f = path.join(root, rel);
  if (fixFile(f)) {
    n++;
    console.log(rel);
  }
}
console.log('files', n);
