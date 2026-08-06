/**
 * SSOT field audit: find frontend snake reads and backend responses without mapKeysToCamel.
 * Usage: node scripts/ssot-field-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const EXT = new Set(['.vue', '.js', '.ts']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);

// Common business snake fields that should be camel on HTTP
const SNAKE_FIELDS = [
  'material_id', 'material_code', 'material_name', 'location_id', 'location_name',
  'category_id', 'category_name', 'unit_id', 'unit_name', 'product_id', 'product_code', 'product_name',
  'supplier_id', 'supplier_name', 'customer_id', 'customer_name', 'order_no', 'order_id',
  'batch_no', 'batch_number', 'created_at', 'updated_at', 'real_name', 'department_id', 'department_name',
  'employee_id', 'employee_no', 'inspection_no', 'process_id', 'process_name', 'task_id', 'plan_id',
  'warehouse_id', 'receipt_no', 'outbound_no', 'return_no', 'requisition_no', 'invoice_no',
  'expense_number', 'bank_account_id', 'cost_center_id', 'parent_id', 'manager_id',
  'is_active', 'is_read', 'min_stock', 'max_stock', 'unit_price', 'total_amount',
  'planned_date', 'actual_date', 'start_date', 'end_date', 'due_date',
  'qualified_quantity', 'unqualified_quantity', 'available_quantity',
  'reference_no', 'reference_id', 'document_no', 'transaction_type',
  'operator_name', 'inspector_name', 'approver_id', 'approver_name',
  'business_type', 'business_id', 'business_code', 'instance_id', 'node_id',
  'ncp_no', 'scrap_no', 'rework_no', 'gauge_no', 'first_article_qty',
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (EXT.has(path.extname(name))) files.push(full);
  }
  return files;
}

function rel(p) {
  return path.relative(root, p).replace(/\\/g, '/');
}

// Frontend: object.snake_field access (not form field names in string literals only)
const FRONT_DIRS = [
  'frontend/src/views',
  'frontend/src/components',
  'frontend/src/api',
  'mobile/src/views',
  'mobile/src/stores',
];

const frontHits = new Map(); // field -> [{file, line, snippet}]

for (const d of FRONT_DIRS) {
  const files = walk(path.join(root, d));
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      // skip comments and pure CSS-ish
      if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) return;
      for (const field of SNAKE_FIELDS) {
        // match .material_id or ['material_id'] or prop="material_id" or field: 'material_id'
        const re = new RegExp(
          `(\\.${field}\\b|['"\`]${field}['"\`]\\s*:|prop=["']${field}["']|field:\\s*['"]${field}['"]|v-model=["'][^"']*\\.${field})`
        );
        if (re.test(line)) {
          // skip if clearly dual-read already fixed with camel primary and snake only in comment
          if (line.includes(`//`) && line.includes(field) && !line.includes(`.${field}`)) continue;
          if (!frontHits.has(field)) frontHits.set(field, []);
          const arr = frontHits.get(field);
          if (arr.length < 8) {
            arr.push({ file: rel(file), line: i + 1, snippet: line.trim().slice(0, 120) });
          } else if (arr.length === 8) {
            arr.push({ file: '...', line: 0, snippet: '(more truncated)' });
          }
        }
      }
    });
  }
}

// Backend controllers: ResponseHandler with rows/result without nearby mapKeysToCamel
const BE_DIRS = [
  'backend/src/controllers',
];
const beSuspects = [];

for (const d of BE_DIRS) {
  const files = walk(path.join(root, d));
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const hasMap = text.includes('mapKeysToCamel') || text.includes('.toApi(');
    // crude: success/paginated with rows/result/list without mapKeysToCamel on same or prev line
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/ResponseHandler\.(success|paginated)\s*\(/.test(line) && !/ResponseHandler\.(success|paginated)\s*$/.test(line)) {
        continue;
      }
      // look at next 5 lines for data arg
      const window = lines.slice(i, Math.min(i + 6, lines.length)).join(' ');
      if (/mapKeysToCamel|\.toApi\(|null,\s*['"]|,\s*null\s*,/.test(window)) continue;
      if (/\b(rows|result\.rows|stocks|list|records|items|users|menus|data)\b/.test(window) &&
          !/mapKeysToCamel/.test(window)) {
        // if file never maps, more suspicious
        beSuspects.push({
          file: rel(file),
          line: i + 1,
          hasMapInFile: hasMap,
          snippet: window.replace(/\s+/g, ' ').slice(0, 140),
        });
      }
    }
  }
}

// Summarize
console.log('=== FRONTEND snake field reads (sample) ===');
const sortedFront = [...frontHits.entries()].sort((a, b) => b[1].length - a[1].length);
let frontTotal = 0;
for (const [field, hits] of sortedFront) {
  const real = hits.filter((h) => h.file !== '...');
  frontTotal += real.length;
  console.log(`\n[${field}] ~${hits.length} samples`);
  for (const h of hits.slice(0, 4)) {
    if (h.file === '...') {
      console.log('  ...');
      continue;
    }
    console.log(`  ${h.file}:${h.line}  ${h.snippet}`);
  }
}

console.log('\n=== BACKEND ResponseHandler without mapKeysToCamel (sample) ===');
const noMap = beSuspects.filter((s) => !s.hasMapInFile);
const withMap = beSuspects.filter((s) => s.hasMapInFile);
console.log(`suspects total=${beSuspects.length}  filesNeverMap=${noMap.length}  partialMap=${withMap.length}`);
const byFile = new Map();
for (const s of beSuspects) {
  byFile.set(s.file, (byFile.get(s.file) || 0) + 1);
}
const topFiles = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
for (const [f, n] of topFiles) {
  const never = beSuspects.find((s) => s.file === f)?.hasMapInFile === false;
  console.log(`  ${never ? '[NO-MAP] ' : '[partial] '}${f}  hits=${n}`);
}

const report = {
  frontFieldCount: sortedFront.length,
  frontSampleTotal: frontTotal,
  backendSuspects: beSuspects.length,
  backendNoMapFiles: [...new Set(noMap.map((s) => s.file))],
  topBackendFiles: topFiles.map(([f, n]) => ({ f, n })),
  topFrontFields: sortedFront.slice(0, 25).map(([field, hits]) => ({
    field,
    samples: hits.filter((h) => h.file !== '...').slice(0, 5),
  })),
};

const outPath = path.join(root, 'scripts', 'ssot-field-audit-report.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`\nReport written: ${rel(outPath)}`);
