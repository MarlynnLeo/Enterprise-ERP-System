/**
 * Full SSOT audit under ResponseHandler auto-camel scheme.
 * node scripts/ssot-full-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const EXT = new Set(['.js', '.vue', '.ts', '.mjs']);
const SKIP = new Set(['node_modules', 'dist', 'coverage', '.git']);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (EXT.has(path.extname(name))) files.push(full);
  }
  return files;
}
const rel = (p) => path.relative(root, p).replace(/\\/g, '/');

const report = {
  dualCase: [],
  frontendSnakeProp: [],
  rawResJson: [],
  redundantMapKeysToCamel: [],
  controllersNoMapKeysSnakeOnBody: [],
  printSnakeKeys: [],
  summary: {},
};

// 1) dual-case pattern (same as CI)
const DUAL =
  /\b([A-Za-z_$][\w$]*)\.([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\s*\|\|\s*\1\.([a-z][a-zA-Z0-9]*)\b|\b([A-Za-z_$][\w$]*)\.([a-z][a-zA-Z0-9]*)\s*\|\|\s*\4\.([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g;

const dualDirs = [
  'frontend/src',
  'mobile/src',
  'backend/src/controllers',
  'backend/src/utils',
];
for (const d of dualDirs) {
  for (const f of walk(path.join(root, d))) {
    const text = fs.readFileSync(f, 'utf8');
    let m;
    const re = new RegExp(DUAL.source, 'g');
    while ((m = re.exec(text))) {
      const line = text.slice(0, m.index).split(/\r?\n/).length;
      report.dualCase.push({ file: rel(f), line, match: m[0].slice(0, 80) });
    }
  }
}

// 2) frontend property access .snake_case (common business fields)
const SNAKE_RE =
  /\.([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g;
const ALLOW_SNAKE_PROP = new Set([
  // CSS / i18n / env / sql-ish not API
  'border_radius', // unlikely
]);
// Only flag known ERP fields
const KNOWN = new Set([
  'material_id','material_code','material_name','location_id','location_name',
  'product_id','product_code','product_name','unit_id','unit_name','category_id',
  'supplier_id','supplier_name','customer_id','customer_name','order_no','order_id',
  'created_at','updated_at','real_name','department_id','department_name',
  'is_active','is_read','batch_no','batch_number','unit_price','total_amount',
  'transaction_type','parent_id','manager_id','employee_id','task_id','plan_id',
  'inspection_no','process_id','ncp_no','scrap_no','rework_no','business_type',
  'instance_id','node_id','approver_name','start_date','end_date','min_stock',
  'max_stock','receipt_no','outbound_no','return_no','invoice_no','expense_number',
  'bank_account_id','cost_center_id','first_article_qty','gauge_no','ip_address',
  'user_id','entity_type','entity_id','sender_id','conversation_id','unread_count',
  'display_name','sort_order','group_code','data_scope','avatar_frame','role_name',
]);

for (const d of ['frontend/src/views', 'frontend/src/components', 'mobile/src/views']) {
  for (const f of walk(path.join(root, d))) {
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (/^\s*\/\//.test(line) || line.includes('// keep snake')) return;
      let m;
      const re = new RegExp(SNAKE_RE.source, 'g');
      while ((m = re.exec(line))) {
        const field = m[1];
        if (!KNOWN.has(field)) continue;
        // skip string keys in object literals for submit that might still be intentional:
        // only property access was matched by \.
        report.frontendSnakeProp.push({
          file: rel(f),
          line: i + 1,
          field,
          snippet: line.trim().slice(0, 100),
        });
      }
    });
  }
}

// 3) backend raw res.json / res.send with data (bypass ResponseHandler)
for (const f of walk(path.join(root, 'backend/src'))) {
  if (!f.includes(`${path.sep}controllers${path.sep}`) && !f.includes(`${path.sep}routes${path.sep}`)) continue;
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/res\.(json|send)\s*\(/.test(line) && !/ResponseHandler/.test(line)) {
      // skip empty or error-only
      if (/status\s*\(\s*[45]/.test(lines[Math.max(0, i - 2)] + line)) return;
      report.rawResJson.push({
        file: rel(f),
        line: i + 1,
        snippet: line.trim().slice(0, 120),
      });
    }
  });
}

// 4) redundant mapKeysToCamel inside controllers (still OK idempotent, but noise)
for (const f of walk(path.join(root, 'backend/src/controllers'))) {
  const text = fs.readFileSync(f, 'utf8');
  if (!text.includes('mapKeysToCamel')) continue;
  const lines = text.split(/\r?\n/);
  let count = 0;
  lines.forEach((line, i) => {
    if (line.includes('mapKeysToCamel')) {
      count++;
      if (count <= 3) {
        report.redundantMapKeysToCamel.push({
          file: rel(f),
          line: i + 1,
          snippet: line.trim().slice(0, 100),
        });
      }
    }
  });
  if (count > 3) {
    report.redundantMapKeysToCamel.push({
      file: rel(f),
      line: 0,
      snippet: `... total mapKeysToCamel occurrences in file: ${count}`,
    });
  }
}

// 5) controllers that use req.body fields with snake without mapKeysToSnake nearby
// heuristic: destructure snake from req.body
const bodySnakeRe = /const\s*\{[^}]*\b[a-z]+_[a-z_]+\b[^}]*\}\s*=\s*req\.body/;
for (const f of walk(path.join(root, 'backend/src/controllers'))) {
  const text = fs.readFileSync(f, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (bodySnakeRe.test(line) && !text.slice(Math.max(0, text.indexOf(line) - 200), text.indexOf(line)).includes('mapKeysToSnake')) {
      // check same function block roughly
      const window = lines.slice(Math.max(0, i - 5), i + 1).join('\n');
      if (!window.includes('mapKeysToSnake')) {
        report.controllersNoMapKeysSnakeOnBody.push({
          file: rel(f),
          line: i + 1,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
  });
}

// 6) print templates / print data still snake-only keys in frontend print payloads
for (const f of walk(path.join(root, 'frontend/src'))) {
  const text = fs.readFileSync(f, 'utf8');
  if (!/print|generateByDefaultTemplate|printData/.test(text)) continue;
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/\b(material_code|order_no|created_at)\s*:/.test(line) && /print|template|printData/i.test(lines.slice(Math.max(0,i-8),i+1).join(' '))) {
      report.printSnakeKeys.push({ file: rel(f), line: i + 1, snippet: line.trim().slice(0, 100) });
    }
  });
}

// Cap lists
const cap = (arr, n = 40) => (arr.length <= n ? arr : [...arr.slice(0, n), { file: '...', line: 0, snippet: `+${arr.length - n} more` }]);

report.summary = {
  dualCase: report.dualCase.length,
  frontendSnakeProp: report.frontendSnakeProp.length,
  rawResJson: report.rawResJson.length,
  redundantMapKeysToCamelFiles: new Set(report.redundantMapKeysToCamel.map((x) => x.file).filter((f) => f !== '...')).size,
  redundantMapKeysToCamelHits: report.redundantMapKeysToCamel.filter((x) => x.line > 0).length,
  bodySnakeWithoutMap: report.controllersNoMapKeysSnakeOnBody.length,
  printSnakeKeys: report.printSnakeKeys.length,
};

const out = {
  summary: report.summary,
  dualCase: cap(report.dualCase, 20),
  frontendSnakeProp: cap(report.frontendSnakeProp, 50),
  rawResJson: cap(report.rawResJson, 40),
  controllersNoMapKeysSnakeOnBody: cap(report.controllersNoMapKeysSnakeOnBody, 40),
  printSnakeKeys: cap(report.printSnakeKeys, 25),
  note: 'redundant mapKeysToCamel is idempotent under ResponseHandler auto-camel; safe but optional cleanup',
  redundantMapKeysToCamelSample: cap(report.redundantMapKeysToCamel, 30),
};

const outPath = path.join(root, 'scripts', 'ssot-full-audit-report.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

console.log('=== SSOT FULL AUDIT SUMMARY ===');
console.log(JSON.stringify(report.summary, null, 2));
console.log('\n--- dualCase sample ---');
out.dualCase.slice(0, 10).forEach((x) => console.log(`  ${x.file}:${x.line} ${x.match || x.snippet || ''}`));
console.log('\n--- frontendSnakeProp sample ---');
out.frontendSnakeProp.slice(0, 15).forEach((x) => console.log(`  ${x.file}:${x.line} .${x.field} ${x.snippet || ''}`));
console.log('\n--- rawResJson sample ---');
out.rawResJson.slice(0, 15).forEach((x) => console.log(`  ${x.file}:${x.line} ${x.snippet}`));
console.log('\n--- body snake without mapKeysToSnake sample ---');
out.controllersNoMapKeysSnakeOnBody.slice(0, 15).forEach((x) => console.log(`  ${x.file}:${x.line} ${x.snippet}`));
console.log('\n--- print snake keys sample ---');
out.printSnakeKeys.slice(0, 10).forEach((x) => console.log(`  ${x.file}:${x.line} ${x.snippet}`));
console.log(`\nFull report: ${rel(outPath)}`);
