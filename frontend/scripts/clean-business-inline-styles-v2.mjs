/**
 * 销售出库/换货/报价/采购等第二轮 style 清理
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/views');
const targets = [
  'sales/SalesOutbound.vue',
  'sales/SalesExchanges.vue',
  'sales/SalesQuotations.vue',
  'sales/SalesOrders.vue',
  'purchase/PurchaseOrders.vue',
  'purchase/PurchaseReceipts.vue',
  'quality/NonconformingProducts.vue',
  'quality/FinalInspection.vue',
  'production/ProductionPlan.vue',
  'production/ProductionTask.vue',
  'finance/cost/CostVariance.vue',
  'finance/budget/BudgetAI.vue',
].map((f) => path.join(root, f));

const STATIC = [
  [/ style="margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;?"/g, ' class="cell-ellipsis-mb"'],
  [/ style="margin-bottom: 4px; white-space: nowrap; overflow: h/g, ' class="cell-ellipsis-mb" style="overflow: h'],
  [/ class="text-blue-600 nowrap" style="overflow: hidden; text-overflow: ellipsis;?"/g, ' class="text-primary nowrap cell-ellipsis"'],
  [/ style="flex: 1;"/g, ' class="flex-1"'],
  [/ style="flex: 1; min-width: 0;"/g, ' class="flex-1-min0"'],
  [/ style="flex-shrink: 0;"/g, ' class="flex-shrink-0"'],
  [/ style="font-size: 10px; color: var\(--color-text-secondary\);"/g, ' class="meta-xs"'],
  [/ style="margin-bottom: 15px;"/g, ' class="mb-15"'],
  [/ style="margin-bottom: 15px"/g, ' class="mb-15"'],
  [/ class="search-card" style="margin-bottom: 15px;?"/g, ' class="search-card mb-15"'],
  [/ style="margin-bottom: 20px;"/g, ' class="mb-20"'],
  [/ style="margin-bottom: 20px"/g, ' class="mb-20"'],
  [/ style="margin-top: 20px; text-align: right;"/g, ' class="mt-20 text-right"'],
  [/ style="margin-top: 16px; text-align: center;"/g, ' class="mt-md text-center"'],
  [/ style="display: flex; gap: 8px; align-items: center; width: 100%;"/g, ' class="flex-gap-8 w-full"'],
  [/ style="display: flex; gap: 8px; margin-bottom: 12px;"/g, ' class="flex-gap-8-mb"'],
  [/ style="display: flex; gap: 10px; align-items: center;"/g, ' class="flex-gap"'],
  [/ style="display: flex; gap: 24px; align-items: center; padding: 8px 0;"/g, ' class="flex-gap-24"'],
  [/ style="display: flex; justify-content: space-between; align-items: center; width: 100%"/g, ' class="flex-between-center"'],
  [/ style="display: flex; justify-content: flex-end; margin-top: 16px;"/g, ' class="flex-end mt-md"'],
  [/ style="display: flex; align-items: center; margin-bottom: 10px;"/g, ' class="flex-center-mb"'],
  [/ style="display: flex; flex-direction: column;"/g, ' class="flex-col"'],
  [/ style="margin-right: 10px;"/g, ' class="mr-10"'],
  [/ style="margin-right: 8px;"/g, ' class="mr-sm"'],
  [/ style="margin-left: 10px;"/g, ' class="ml-10"'],
  [/ style="margin-left: 10px"/g, ' class="ml-10"'],
  [/ style="color: var\(--color-text-muted\); font-size: 13px"/g, ' class="text-muted text-md"'],
  [/ style="color: var\(--color-text-muted\); font-size: 12px"/g, ' class="text-muted text-sm"'],
  [/ style="color: var\(--color-text-regular\); font-size: 14px;"/g, ' class="text-regular"'],
  [/ style="font-size: 12px; color: var\(--color-text-secondary\)"/g, ' class="meta-secondary-sm"'],
  [/ style="color: var\(--color-danger\); font-size: 12px; margin-top: 5px;"/g, ' class="text-danger-hint"'],
  [/ style="line-height: 1.4;"/g, ' class="line-height-tight"'],
  [/ class="material-actions" style="display: flex; gap: 10px; margin-bottom: 10px;"/g, ' class="material-actions flex-actions-mb"'],
  [/ class="total-price" style="margin-top: 15px; padding: 12px; background: var\(--color-bg-hover\); border-radius: 4px;"/g, ' class="total-price summary-box"'],
  [/ class="add-material" style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;"/g, ' class="add-material mt-10 flex-between-center"'],
  [/ style="font-size: 16px; font-weight: bold;"/g, ' class="text-lg-bold"'],
  [/ style="color: var\(--color-danger\); font-size: 18px; margin-left: 5px;"/g, ' class="text-amount-lg"'],
  [/ style="margin-top: 16px; text-align: right; padding: 12px; background-color: var\(--color-bg-hover\); border: 1px solid var\(--color-border-lighter\); border-radius: 4px;?"/g, ' class="summary-box-right"'],
  [/ style="font-size: 16px; font-weight: bold; color: var\(--color-text-primary\);"/g, ' class="text-lg-bold text-regular"'],
  [/ style="width: 300px; margin-right: 10px;"/g, ' class="w-300"'],
  [/ style="width: 100%; margin-top: 15px;"/g, ' class="w-full mt-15"'],
  [/ style="margin-bottom: 10px; color: var\(--color-text-regular\); font-size: 14px;"/g, ' class="section-label"'],
  [/ style="float: right; color: var\(--color-text-muted\); font-size: 12px"/g, ' class="option-name text-sm"'],
];

// 动态金额/库存色
const DYNAMIC = [
  [
    /:style="\{\s*color:\s*\(([^}]+?)\)\s*>\s*0\s*\?\s*'var\(--color-success\)'\s*:\s*'var\(--color-danger\)'\s*\}"/g,
    ':class="($1) > 0 ? \'text-stock-ok\' : \'text-stock-low\'"',
  ],
  [
    /:style="\{\s*color:\s*\(([^}]+?)\)\s*>=\s*0\s*\?\s*'var\(--color-success\)'\s*:\s*'var\(--color-danger\)'\s*\}"/g,
    ':class="($1) >= 0 ? \'text-stock-ok\' : \'text-stock-low\'"',
  ],
  // 差额：>0 danger, <0 success, else regular
  [
    /:style="\{\s*color:\s*([^?}]+)\s*>\s*0\s*\?\s*'var\(--color-danger\)'\s*:\s*\1\s*<\s*0\s*\?\s*'var\(--color-success\)'\s*:\s*'var\(--color-text-regular\)'\s*\}"/g,
    ':class="($1) > 0 ? \'amount-positive\' : ($1) < 0 ? \'amount-negative\' : \'amount-zero\'"',
  ],
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
  for (const [re, rep] of DYNAMIC) {
    const before = n;
    n = n.replace(re, rep);
    if (n !== before) hits += 1;
  }
  // SalesExchanges / SalesOutbound 常见差额写法（非回溯）
  n = n.replace(
    /:style="\{\s*color:\s*scope\.row\.differenceAmount\s*>\s*0\s*\?\s*'var\(--color-danger\)'\s*:\s*scope\.row\.differenceAmount\s*<\s*0\s*\?\s*'var\(--color-success\)'\s*:\s*'var\(--color-text-regular\)'\s*\}"/g,
    `:class="scope.row.differenceAmount > 0 ? 'amount-positive' : scope.row.differenceAmount < 0 ? 'amount-negative' : 'amount-zero'"`
  );
  n = n.replace(
    /:style="\{\s*color:\s*calcDifference\(\)\s*>\s*0\s*\?\s*'var\(--color-danger\)'\s*:\s*calcDifference\(\)\s*<\s*0\s*\?\s*'var\(--color-success\)'\s*:\s*'var\(--color-text-regular\)'\s*\}"/g,
    `:class="calcDifference() > 0 ? 'amount-positive' : calcDifference() < 0 ? 'amount-negative' : 'amount-zero'"`
  );
  n = n.replace(
    /:style="\{\s*color:\s*\(parseFloat\(currentExchange\.differenceAmount \|\| currentExchange\.difference_amount \|\| 0\)\)\s*>\s*0\s*\?\s*'var\(--color-danger\)'\s*:\s*\(parseFloat\(currentExchange\.differenceAmount \|\| currentExchange\.difference_amount \|\| 0\)\)\s*<\s*0\s*\?\s*'var\(--color-success\)'\s*:\s*'var\(--color-text-regular\)'\s*\}"/g,
    `:class="(parseFloat(currentExchange.differenceAmount || currentExchange.difference_amount || 0)) > 0 ? 'amount-positive' : (parseFloat(currentExchange.differenceAmount || currentExchange.difference_amount || 0)) < 0 ? 'amount-negative' : 'amount-zero'"`
  );
  n = n.replace(
    /:style="\{\s*color:\s*\(row\.stock_quantity \|\| 0\)\s*>\s*0\s*\?\s*'var\(--color-success\)'\s*:\s*'var\(--color-danger\)'\s*\}"/g,
    `:class="(row.stock_quantity || 0) > 0 ? 'text-stock-ok' : 'text-stock-low'"`
  );
  n = n.replace(
    /:style="\{\s*color:\s*row\.stock_quantity\s*>\s*0\s*\?\s*'var\(--color-success\)'\s*:\s*'var\(--color-danger\)'\s*\}"/g,
    `:class="row.stock_quantity > 0 ? 'text-stock-ok' : 'text-stock-low'"`
  );

  n = mergeClass(n);
  if (n !== c) {
    fs.writeFileSync(file, n, 'utf8');
    filesChanged += 1;
    console.log('ok', path.relative(root, file));
  }
}
console.log(JSON.stringify({ filesChanged, hits }, null, 2));
