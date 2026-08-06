#!/usr/bin/env node
/**
 * CI guard: ban camel||snake dual-read patterns in migrated business views.
 *
 * Scans only modules already converted to FieldMap camel SSOT.
 * Expand SCAN_DIRS as more modules are cleaned.
 *
 * Examples banned:
 *   row.foo_bar || row.fooBar
 *   item.fooBar || item.foo_bar
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Modules on camel SSOT (views + controllers boundary)
const SCAN_DIRS = [
  'frontend/src/views/inventory',
  'frontend/src/views/quality',
  'frontend/src/views/production',
  'frontend/src/views/purchase',
  'frontend/src/views/sales',
  'frontend/src/views/finance',
  'frontend/src/views/baseData',
  'frontend/src/views/dashboard',
  'frontend/src/views/dataoverview',
  'frontend/src/views/auth',
  'frontend/src/views/system',
  'mobile/src/views/inventory',
  'mobile/src/views/quality',
  'mobile/src/views/production',
  'mobile/src/views/purchase',
  'mobile/src/views/sales',
  'mobile/src/views/finance',
  'backend/src/controllers/business/inventory',
  'backend/src/controllers/business/quality',
  'backend/src/controllers/business/production',
  'backend/src/controllers/business/purchase',
  'backend/src/controllers/business/sales',
  'backend/src/controllers/business/finance',
  'backend/src/controllers/business/assets',
  'backend/src/controllers/business/hr',
  'backend/src/controllers/common/basedata',
  'frontend/src/views/baseData',
  'frontend/src/views/system',
  'frontend/src/views/finance/cost',
  'frontend/src/views/finance/pricing',
  'frontend/src/views/finance/tax',
  'frontend/src/views/finance/assets',
  'frontend/src/views/hr',
  'frontend/src/views/equipment',
  'frontend/src/views/workflow',
  'frontend/src/views/public',
  'frontend/src/api',
  'frontend/src/utils',
  'frontend/src/components',
  'frontend/src/composables',
  'frontend/src/stores',
  'mobile/src/views/hr',
  'mobile/src/composables',
  'mobile/src/stores',
  'mobile/src/utils',
  'backend/src/routes',
];

// Temporary transitional files (must shrink; prefer fixing over allowlisting)
const ALLOWLIST = new Set([
  // none preferred
]);

const EXT = new Set(['.vue', '.js', '.ts', '.mjs']);

const DUAL_PATTERN =
  /\b([A-Za-z_$][\w$]*)\.([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\s*\|\|\s*\1\.([a-z][a-zA-Z0-9]*)\b|\b([A-Za-z_$][\w$]*)\.([a-z][a-zA-Z0-9]*)\s*\|\|\s*\4\.([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g;

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(full, files);
    } else if (EXT.has(path.extname(name))) {
      files.push(full);
    }
  }
  return files;
}

function toCamel(snake) {
  return snake.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function isPair(snake, camel) {
  return toCamel(snake) === camel;
}

function checkFile(file) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (ALLOWLIST.has(rel)) return [];
  if (rel.includes('FieldMap') || rel.includes('printService')) return [];

  const text = fs.readFileSync(file, 'utf8');
  const hits = [];
  let m;
  const re = new RegExp(DUAL_PATTERN.source, 'g');
  while ((m = re.exec(text)) !== null) {
    const [full, aObj, aSnake, aCamel, bObj, bCamel, bSnake] = m;
    if (aObj && aSnake && aCamel && isPair(aSnake, aCamel)) {
      hits.push({ rel, line: text.slice(0, m.index).split('\n').length, snippet: full.trim() });
    } else if (bObj && bCamel && bSnake && isPair(bSnake, bCamel)) {
      hits.push({ rel, line: text.slice(0, m.index).split('\n').length, snippet: full.trim() });
    }
  }
  return hits;
}

const allFiles = SCAN_DIRS.flatMap((d) => walk(path.join(root, d)));
const violations = allFiles.flatMap(checkFile);

if (violations.length) {
  console.error(`\n[check-no-dual-case] Found ${violations.length} dual camel||snake read(s):\n`);
  for (const v of violations.slice(0, 100)) {
    console.error(`  ${v.rel}:${v.line}`);
    console.error(`    ${v.snippet}`);
  }
  if (violations.length > 100) {
    console.error(`  ... and ${violations.length - 100} more`);
  }
  console.error('\nUse pure camel in views; convert only at FieldMap boundaries.\n');
  process.exit(1);
}

console.log(`[check-no-dual-case] OK — scanned ${allFiles.length} files, no dual-case reads.`);
