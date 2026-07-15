import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const jobs = {
  'src/views/finance/cost/StandardCost.vue': [
    [' style="font-weight: bold; color: var(--color-primary);"', ' class="text-primary font-weight-700"'],
    [' style="margin-top: 16px; text-align: right; font-size: 15px;"', ' class="detail-total-row"'],
    [' style="font-weight: bold; color: var(--color-text-primary); margin-right: 12px;"', ' class="detail-total-label"'],
    [' style="font-size: 18px; font-weight: bold; color: var(--color-danger);"', ' class="detail-total-amount"'],
    [' style="margin-top: 16px; color: var(--color-text-secondary); font-size: 13px;"', ' class="help-text-mt"'],
    [' style="margin-bottom: 16px; display:flex; justify-content: space-between;"', ' class="flex-between-mb"'],
    [' style="line-height:32px; font-weight:bold;"', ' class="section-title-line"'],
    [' style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px;"', ' class="help-text-sm"'],
  ],
  'src/views/finance/cost/CostSettings.vue': [
    [' style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px;"', ' class="help-text-sm"'],
    [' style="float: left"', ' class="option-code"'],
    [' style="float: right; color: var(--color-text-muted); font-size: 13px"', ' class="option-name"'],
    [' style="color: var(--color-primary); font-weight: 600;"', ' class="text-primary font-weight-600"'],
    [' style="margin-top: 16px; justify-content: flex-end;"', ' class="pagination-end"'],
  ],
  'src/views/finance/tax/TaxInvoices.vue': [
    [' style="color: var(--color-text-disabled); font-style: italic; font-size: 12px;"', ' class="text-italic-disabled"'],
    [' style="vertical-align: middle; margin-right: 2px"', ' class="icon-mid-mr2"'],
    [' style="color: var(--color-text-secondary); font-size: 12px"', ' class="text-muted-sm"'],
    [' style="color: var(--color-text-disabled); font-size: 12px"', ' class="text-disabled text-sm"'],
    [' style="margin-top: 20px; justify-content: flex-end"', ' class="pagination-end"'],
    [' style="margin-left: 8px;"', ' class="ml-sm"'],
    [' style="margin-bottom: 12px"', ' class="mb-12"'],
    [' style="cursor: pointer"', ' class="cursor-pointer"'],
  ],
  'src/views/quality/FinalInspection.vue': [
    [' style="margin-bottom: 12px"', ' class="mb-12"'],
    [' style="display: flex; justify-content: flex-end; margin-bottom: 8px;"', ' class="flex-end-mb"'],
    [' style="margin-right: 4px;"', ' class="mr-sm"'],
    [' style="color: var(--color-warning); margin-left: 4px;"', ' class="icon-warning-ml"'],
  ],
  'src/views/production/ProductionProcess.vue': [
    [' style="display: flex; justify-content: space-between; align-items: center; width: 100%;"', ' class="flex-between-center"'],
    [' style="height: 100%;"', ' class="h-full"'],
    [' style="width: 100%; height: 100%; border: none;"', ' class="iframe-full"'],
    [' style="margin-bottom: 10px; max-height: 200px; overflow-y: auto;"', ' class="preview-scroll-box"'],
    [' style="margin-bottom: 12px;"', ' class="mb-12"'],
    [' style="margin-top: 8px; color: var(--color-success); font-size: 13px;"', ' class="return-hint"'],
  ],
  'src/views/system/Print.vue': [
    [' style="max-width: 800px;"', ' class="w-max-800"'],
    [' style="margin-top: 20px;"', ' class="mt-20-block"'],
    [" style=\"margin-top: 8px; font-family: 'Courier New', monospace;\"", ' class="mono-sm"'],
    [" style=\"width: 100%; min-width: 600px; font-family: 'Courier New', monospace; font-size: 13px;\"", ' class="mono-table"'],
    [' style="width: 100%; height: 500px; border: none; background: var(--color-bg-base);"', ' class="chart-box-500"'],
  ],
};

function mergeClass(html) {
  let n = html;
  for (let i = 0; i < 6; i++) {
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

for (const [rel, pairs] of Object.entries(jobs)) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.log('missing', rel);
    continue;
  }
  const c = fs.readFileSync(file, 'utf8');
  let n = c;
  for (const [from, to] of pairs) {
    n = n.split(from).join(to);
  }
  // FinalInspection pass rate
  n = n.replace(
    /:style="\{\s*color:\s*\(currentInspection\.qualified_quantity\s*\/\s*currentInspection\.quantity\)\s*>=\s*1\s*\?\s*'var\(--color-success\)'\s*:\s*'var\(--color-danger\)'[^}]*\}"/g,
    `:class="(currentInspection.qualified_quantity / currentInspection.quantity) >= 1 ? 'text-stock-ok font-weight-700' : 'text-stock-low font-weight-700'"`
  );
  // TaxInvoices selected box (literal contains)
  if (n.includes('margin-top: 12px; padding: 8px 12px; background:')) {
    n = n.replace(
      / style="margin-top: 12px; padding: 8px 12px; background:[^"]*"/g,
      ' class="selected-link-box"'
    );
  }

  n = mergeClass(n);
  if (n !== c) {
    fs.writeFileSync(file, n, 'utf8');
    console.log('ok', rel);
  } else {
    console.log('skip', rel);
  }
}
