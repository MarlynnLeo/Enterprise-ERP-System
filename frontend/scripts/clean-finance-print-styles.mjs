/**
 * 成本差异 / 预算AI / 打印 / 标准成本 等 style 清理
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/views');
const targets = [
  'finance/cost/CostVariance.vue',
  'finance/cost/StandardCost.vue',
  'finance/cost/CostSettings.vue',
  'finance/budget/BudgetAI.vue',
  'finance/tax/TaxInvoices.vue',
  'system/Print.vue',
  'production/ProductionTask.vue',
  'production/ProductionProcess.vue',
  'quality/FinalInspection.vue',
  'quality/EightDReport.vue',
].map((f) => path.join(root, f));

const STATIC = [
  [/ style="width: 180px; margin-right: 10px;"/g, ' class="form-control-180"'],
  [/ style="width: 130px; margin-right: 10px;"/g, ' class="form-control-130"'],
  [/ style="width: 150px; margin-right: 10px;"/g, ' class="form-control-150-mr"'],
  [/ style="width: 280px; margin-right: 10px;"/g, ' class="form-control-280-mr"'],
  [/ style="width: 150px; margin-right: 10px;?"/g, ' class="form-control-150-mr"'],
  [/ style="margin-top: 15px; justify-content: flex-end;"/g, ' class="pagination-end"'],
  [/ style="margin-top: 20px;"/g, ' class="row-mt-20"'],
  [/ :gutter="20" style="margin-top: 20px;"/g, ' :gutter="20" class="row-mt-20"'],
  [/ style="height:350px"/g, ' class="chart-box-350"'],
  [/ style="height:350px;"/g, ' class="chart-box-350"'],
  [/ style="height:380px"/g, ' class="chart-box-380"'],
  [/ style="height:380px;"/g, ' class="chart-box-380"'],
  [/ style="height:140px"/g, ' class="chart-box-140"'],
  [/ style="height:140px;"/g, ' class="chart-box-140"'],
  [/ style="vertical-align: middle; font-size: 14px;"/g, ' class="icon-mid-sm"'],
  [/ style="vertical-align: middle;"/g, ' class="icon-mid"'],
  [/ style="vertical-align: middle; color: var\(--color-primary\);"/g, ' class="icon-mid-primary"'],
  [/ style="vertical-align: middle; color: var\(--color-danger\);"/g, ' class="icon-mid-danger"'],
  [/ style="vertical-align: middle; color: var\(--color-warning\);"/g, ' class="icon-mid-warning"'],
  [/ style="vertical-align: middle; color: var\(--color-success\);"/g, ' class="icon-mid-success"'],
  [/ style="margin:0 8px;color:var\(--color-text-secondary\)"/g, ' class="vs-sep"'],
  [/ style="max-width: 800px;"/g, ' class="w-max-800"'],
  [/ style="margin-top: 8px; font-family: 'Courier New', monospace;"/g, ' class="mono-sm"'],
  [/ style="width: 100%; min-width: 600px; font-family: 'Courier New', monospace; font-size: 13px;"/g, ' class="mono-table"'],
  [/ style="width: 100%; height: 500px; border: none; background: var\(--color-bg-base\);"/g, ' class="chart-box-500"'],
  [/ style="margin-top: 20px;"/g, ' class="mt-20-block"'],
  [/ style="margin-top: 16px;"/g, ' class="mt-md"'],
  [/ style="margin-bottom: 16px;"/g, ' class="mb-md"'],
  [/ style="margin-bottom: 20px;"/g, ' class="mb-20"'],
  [/ style="width: 100%"/g, ' class="w-full"'],
  [/ style="width: 100%;"/g, ' class="w-full"'],
];

function mergeClass(html) {
  let n = html;
  for (let i = 0; i < 8; i++) {
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

function convertVarianceStyles(n) {
  // :style="{ color: xxx >= 0 ? success : danger, fontWeight: 'bold' }"
  n = n.replace(
    /:style="\{\s*color:\s*([^?}]+)\s*>=\s*0\s*\?\s*'var\(--color-success\)'\s*:\s*'var\(--color-danger\)'\s*,\s*fontWeight:\s*'bold'\s*\}"/g,
    `:class="($1) >= 0 ? 'text-stock-ok font-weight-700' : 'text-stock-low font-weight-700'"`
  );
  n = n.replace(
    /:style="\{\s*color:\s*([^?}]+)\s*>=\s*0\s*\?\s*'var\(--color-success\)'\s*:\s*'var\(--color-danger\)'\s*\}"/g,
    `:class="($1) >= 0 ? 'text-stock-ok' : 'text-stock-low'"`
  );
  n = n.replace(
    /:style="\{\s*color:\s*([^?}]+)\s*>=\s*100\s*\?\s*'var\(--color-success\)'\s*:\s*'var\(--color-danger\)'\s*\}"/g,
    `:class="($1) >= 100 ? 'text-stock-ok' : 'text-stock-low'"`
  );
  n = n.replace(
    /:style="\{\s*color:\s*([^?}]+)\s*>=\s*80\s*\?\s*'var\(--color-success\)'\s*:\s*'var\(--color-danger\)'\s*\}"/g,
    `:class="($1) >= 80 ? 'text-stock-ok' : 'text-stock-low'"`
  );
  // scope.row.xxx patterns with optional spaces
  n = n.replace(
    /:style="\{\s*color:\s*scope\.row\.(\w+)\s*>=\s*0\s*\?\s*'var\(--color-success\)'\s*:\s*'var\(--color-danger\)'\s*,\s*fontWeight:\s*'bold'\s*\}"/g,
    `:class="scope.row.$1 >= 0 ? 'text-stock-ok font-weight-700' : 'text-stock-low font-weight-700'"`
  );
  n = n.replace(
    /:style="\{\s*color:\s*scope\.row\.(\w+)\s*>=\s*0\s*\?\s*'var\(--color-success\)'\s*:\s*'var\(--color-danger\)'\s*\}"/g,
    `:class="scope.row.$1 >= 0 ? 'text-stock-ok' : 'text-stock-low'"`
  );
  n = n.replace(
    /:style="\{\s*color:\s*effSummary\.(\w+)\s*>=\s*0\s*\?\s*'var\(--color-success\)'\s*:\s*'var\(--color-danger\)'\s*\}"/g,
    `:class="effSummary.$1 >= 0 ? 'text-stock-ok' : 'text-stock-low'"`
  );
  n = n.replace(
    /:style="\{\s*color:\s*effSummary\.(\w+)\s*>=\s*100\s*\?\s*'var\(--color-success\)'\s*:\s*'var\(--color-danger\)'\s*\}"/g,
    `:class="effSummary.$1 >= 100 ? 'text-stock-ok' : 'text-stock-low'"`
  );
  n = n.replace(
    /:style="\{\s*color:\s*capacitySummary\.(\w+)\s*>=\s*80\s*\?\s*'var\(--color-success\)'\s*:\s*'var\(--color-danger\)'\s*\}"/g,
    `:class="capacitySummary.$1 >= 80 ? 'text-stock-ok' : 'text-stock-low'"`
  );
  return n;
}

let filesChanged = 0;
let hits = 0;
for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  const c = fs.readFileSync(file, 'utf8');
  let n = c;
  for (const [re, rep] of STATIC) {
    const before = n;
    n = n.replace(re, rep);
    if (n !== before) hits += 1;
  }
  const beforeDyn = n;
  n = convertVarianceStyles(n);
  if (n !== beforeDyn) hits += 1;
  n = mergeClass(n);
  if (n !== c) {
    fs.writeFileSync(file, n, 'utf8');
    filesChanged += 1;
    console.log('ok', path.relative(root, file));
  }
}
console.log(JSON.stringify({ filesChanged, hits }, null, 2));
