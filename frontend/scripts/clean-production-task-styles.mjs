import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const file = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/views/production/ProductionTask.vue'
);
let n = fs.readFileSync(file, 'utf8');
const pairs = [
  [' style="color: var(--color-text-secondary); font-size: 13px"', ' class="meta-md"'],
  [' style="margin-left: 16px"', ' class="ml-16"'],
  [' style="margin-top: 8px"', ' class="mt-8"'],
  [' style="margin-top: 4px; font-size: 13px"', ' class="mt-sm text-md"'],
  [' style="margin-left: 8px; color: var(--color-warning)"', ' class="text-warning-ml"'],
  [' style="margin-bottom: 12px"', ' class="mb-12"'],
  [' style="margin-bottom: 12px;"', ' class="mb-12"'],
  [' style="width: 220px"', ' class="w-220"'],
  [' style="font-weight: 700; color: var(--el-color-primary)"', ' class="text-primary-bold"'],
  [' style="margin-top: 12px"', ' class="mt-12"'],
  [' style="margin-bottom: 6px"', ' class="mb-6"'],
  [' style="color: var(--color-warning); margin-left: 4px"', ' class="icon-warning-ml"'],
  [' style="margin-bottom: 12px">', ' class="mb-12">'],
];
for (const [a, b] of pairs) n = n.split(a).join(b);
// el-form / el-alert remaining
n = n.replace(/ style="margin-bottom: 12px"/g, ' class="mb-12"');
n = n.replace(/ style="margin-top: 8px"/g, ' class="mt-8"');
fs.writeFileSync(file, n, 'utf8');
const left = (n.match(/style=|:style=/g) || []).length;
console.log('ProductionTask styles left approx', left);
