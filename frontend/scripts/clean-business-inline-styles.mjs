/**
 * 库存/销售/采购业务页：常见行内 style → utility class
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const files = [
  'inventory/InventoryOutbound.vue',
  'inventory/InventoryInbound.vue',
  'inventory/InventoryStock.vue',
  'inventory/ManualTransaction.vue',
  'sales/SalesOrders.vue',
  'sales/SalesOutbound.vue',
  'sales/SalesExchanges.vue',
  'sales/SalesQuotations.vue',
  'purchase/PurchaseOrders.vue',
  'purchase/PurchaseReceipts.vue',
  'production/ProductionTask.vue',
  'production/ProductionPlan.vue',
  'quality/FinalInspection.vue',
  'quality/EightDReport.vue',
  'quality/NonconformingProducts.vue',
].map((f) =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/views', f)
);

const REPLACEMENTS = [
  // 替代料高亮
  [
    /:style="([^"]*?)isSubstitute \? 'color: var\(--color-success\);' : ''"/g,
    ':class="$1isSubstitute ? \'is-substitute\' : \'\'"',
  ],
  [
    /:style="([^"]*?)is_substitute \? 'color: var\(--color-success\);' : ''"/g,
    ':class="$1is_substitute ? \'is-substitute\' : \'\'"',
  ],
  // 简单静态
  [
    / style="float: left"/g,
    ' class="option-code"',
  ],
  [
    / style="float: right; color: var\(--color-text-muted\); font-size: 13px"/g,
    ' class="option-name"',
  ],
  [
    / style="margin-left: 20px; color: var\(--color-text-secondary\);"/g,
    ' class="tree-indent"',
  ],
  [
    / style="margin-left: 20px;"/g,
    ' class="tree-indent"',
  ],
  [
    / style="color: var\(--color-success\); font-size: 12px;"/g,
    ' class="is-substitute-sm"',
  ],
  [
    / style="font-size: 12px; color: var\(--color-success\);"/g,
    ' class="is-substitute-sm"',
  ],
  [
    / style="margin-top: 10px;"/g,
    ' class="mt-10"',
  ],
  [
    / style="margin-top: 15px;"/g,
    ' class="mt-15"',
  ],
  [
    / style="margin-left: 12px;"/g,
    ' class="ml-sm"',
  ],
  [
    / style="margin-left: 4px;"/g,
    ' class="ml-sm"',
  ],
  [
    / style="margin-left: 8px;"/g,
    ' class="ml-sm"',
  ],
  [
    / style="cursor: pointer;"/g,
    ' class="cursor-pointer"',
  ],
  [
    / style="text-align: right;"/g,
    ' class="text-right"',
  ],
  [
    / style="color: var\(--color-text-disabled\);"/g,
    ' class="text-disabled"',
  ],
  [
    / style="display: flex; gap: 10px;"/g,
    ' class="flex-gap"',
  ],
  [
    / style="margin-bottom: 4px;"/g,
    ' class="mb-xs"',
  ],
  [
    / style="margin-bottom: 5px;"/g,
    ' class="mb-5"',
  ],
  [
    / style="margin-right: 8px; margin-bottom: 5px;"/g,
    ' class="mr-sm mb-5"',
  ],
  [
    / style="font-weight: bold; margin-bottom: 6px;"/g,
    ' class="font-weight-700 mb-sm"',
  ],
  [
    / style="color: var\(--color-text-secondary\); font-size: 12px;"/g,
    ' class="text-muted text-sm"',
  ],
  [
    / style="color: var\(--color-text-regular\); margin-left: 8px;"/g,
    ' class="text-regular ml-sm"',
  ],
  [
    / style="font-weight: bold; color: var\(--color-primary\);"/g,
    ' class="text-primary font-weight-700"',
  ],
  [
    / style="font-weight: bold; color: var\(--color-primary\); font-size: 16px;"/g,
    ' class="text-primary font-weight-700"',
  ],
  // 库存足够/不足三元（SalesOrders 常见）
  [
    /:style="\{\s*color:\s*\(([^)]+)\)\s*>=\s*\(([^)]+)\)\s*\?\s*'var\(--color-success\)'\s*:\s*'var\(--color-danger\)'\s*\}"/g,
    ':class="($1) >= ($2) ? \'text-stock-ok\' : \'text-stock-low\'"',
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
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const c = fs.readFileSync(file, 'utf8');
  let n = c;
  for (const [re, rep] of REPLACEMENTS) {
    const before = n;
    n = n.replace(re, rep);
    if (n !== before) hits += 1;
  }
  // 特殊：isSubstitute 复杂 :style 含 supplement
  n = n.replace(
    /:style="scope\.row\.isSubstitute \? 'color: var\(--color-success\); font-size: 12px;' : \(\(dialogType === 'supplement' && \(scope\.row\.stock_quantity \|\| 0\) <= 0\) \? 'color: var\(--color-danger\);' : ''\)"/g,
    `:class="scope.row.isSubstitute ? 'is-substitute-sm' : ((dialogType === 'supplement' && (scope.row.stock_quantity || 0) <= 0) ? 'text-stock-low' : '')"`
  );
  // 材料选择 option 块（简化常见 flex 行）
  n = n.replace(
    /style="display: flex; align-items: center; padding: 4px 0; font-size: 13px;"/g,
    'class="option-row"'
  );
  n = n.replace(
    /style="display: flex; align-items: center; gap: 12px; padding: 4px 0;"/g,
    'class="option-row gap-12"'
  );
  n = n.replace(
    /style="font-weight: bold; color: var\(--color-text-primary\); min-width: 80px;"/g,
    'class="option-row__code"'
  );
  n = n.replace(
    /style="font-weight: 500; font-size: 13px; min-width: 100px;"/g,
    'class="option-row__code"'
  );
  n = n.replace(
    /style="color: var\(--color-text-regular\); margin: 0 8px; flex: 1;"/g,
    'class="option-row__name"'
  );
  n = n.replace(
    /style="color: var\(--color-text-regular\); font-size: 13px; flex: 1;"/g,
    'class="option-row__name"'
  );
  n = n.replace(
    /style="color: var\(--color-text-secondary\); margin: 0 8px; min-width: 100px;"/g,
    'class="option-row__meta"'
  );
  n = n.replace(
    /style="color: var\(--color-text-secondary\); font-size: 12px;"/g,
    'class="option-row__meta text-sm"'
  );
  n = n.replace(
    /style="color: var\(--color-primary\); font-weight: bold; min-width: 60px; text-align: right;"/g,
    'class="option-row__stock"'
  );
  n = n.replace(
    /class="order-summary" style="margin-top: 15px; padding: 12px; background: var\(--color-bg-hover\); border-radius: 4px;?"/g,
    'class="order-summary summary-box"'
  );
  n = n.replace(
    /style="margin-top: 10px; width: 100%;"/g,
    'class="mt-10 w-full"'
  );
  n = n.replace(
    /style="white-space: nowrap; overflow: h/g,
    'class="nowrap" style="overflow: h'
  );

  n = mergeClass(n);
  if (n !== c) {
    fs.writeFileSync(file, n, 'utf8');
    filesChanged += 1;
    console.log('updated', path.basename(file));
  }
}
console.log(JSON.stringify({ filesChanged, hits }, null, 2));
