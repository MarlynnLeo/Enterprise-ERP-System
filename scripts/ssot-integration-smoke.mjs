/**
 * SSOT / FieldMap integration smoke (no DB required for pure maps).
 * Exit 1 on any assertion failure.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const be = (...p) => path.join(root, 'backend/src', ...p);

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  } else {
    console.log('OK  ', msg);
  }
}

// --- pure field maps ---
const { mapKeysToCamel, mapKeysToSnake, createFieldMap } = require(be('utils/fieldMap.js'));
const inv = require(be('utils/inventory/inventoryFieldMap.js'));
const pur = require(be('utils/purchase/purchaseFieldMap.js'));
const sales = require(be('utils/sales/salesFieldMap.js'));
const q = require(be('utils/quality/qualityFieldMap.js'));
const prod = require(be('utils/production/productionFieldMap.js'));
const fin = require(be('utils/finance/invoiceFieldMap.js'));
const gl = require(be('utils/finance/glFieldMap.js'));

// mapKeys
const camel = mapKeysToCamel({ material_id: 1, nested: { unit_name: 'kg' } });
assert(camel.materialId === 1 && camel.nested.unitName === 'kg', 'mapKeysToCamel nested');
const snake = mapKeysToSnake({ materialId: 1, nested: { unitName: 'kg' } });
assert(snake.material_id === 1 && snake.nested.unit_name === 'kg', 'mapKeysToSnake nested');

// createFieldMap passthrough extra
const m = createFieldMap({ fields: { productCode: 'product_code' } });
const api = m.toApi({ product_code: 'P1', extra_col: 9 });
assert(api.productCode === 'P1' && api.extraCol === 9, 'createFieldMap toApi maps extras');

// purchase receipt item roundtrip
const receiptIn = pur.purchaseReceiptItemMap.fromApi({
  materialId: 10,
  materialCode: 'M10',
  unitPrice: 12.5,
  quantity: 4,
  qualifiedQuantity: 4,
  orderItemId: 99,
  batchNumber: 'B-1',
  unitId: 2,
  orderedQuantity: 4,
  receivedQuantity: 4,
});
assert(receiptIn.material_id === 10 && receiptIn.batch_number === 'B-1', 'receipt item fromApi');
const receiptOut = pur.purchaseReceiptItemMap.toApi(receiptIn);
assert(
  receiptOut.materialId === 10 && receiptOut.batchNumber === 'B-1' && receiptOut.unitPrice === 12.5,
  'receipt item toApi'
);

// purchase requisition / return
const req = pur.purchaseRequisitionMap.fromApi({
  sourceType: 'plan',
  sourceId: 1,
  sourceMaterialId: 2,
  materials: [{ materialId: 2, quantity: 5 }],
});
assert(req.source_type === 'plan' && req.items?.[0]?.material_id === 2, 'requisition fromApi');
const ret = pur.purchaseReturnItemMap.fromApi({ receiptItemId: 7, returnQuantity: 1 });
assert(ret.receipt_item_id === 7 && ret.return_quantity === 1, 'return item fromApi');

// sales order / return / exchange
const so = sales.salesOrderMap.toApi({
  order_no: 'SO1',
  customer_name: 'C1',
  total_amount: 100,
  delivery_date: '2024-06-01',
});
assert(so.orderNo === 'SO1' && so.customerName === 'C1' && so.totalAmount === 100, 'salesOrder toApi');
const sret = sales.salesReturnMap.fromApi({
  returnDate: '2024-06-02',
  orderId: 3,
  returnReason: 'x',
  items: [{ productId: 9, quantity: 1 }],
});
assert(sret.order_id === 3 && sret.items[0].product_id === 9, 'salesReturn fromApi');

// inventory outbound
const out = inv.inventoryOutboundMap.toApi({
  outbound_no: 'OUT1',
  outbound_date: '2024-01-01',
  status: 'draft',
  production_task_id: 5,
});
assert(out.outboundNo === 'OUT1' && out.productionTaskId === 5, 'inventoryOutbound toApi');

// quality
if (q.qualityInspectionMap) {
  const qi = q.qualityInspectionMap.toApi({
    inspection_no: 'QI1',
    material_name: 'Mat',
    batch_no: 'BN',
    status: 'pending',
  });
  assert(qi.inspectionNo === 'QI1' && qi.batchNo === 'BN', 'qualityInspection toApi');
}

// production task
if (prod.productionTaskMap) {
  const pt = prod.productionTaskMap.toApi({
    task_no: 'T1',
    product_name: 'P',
    plan_id: 1,
    status: 'pending',
  });
  assert(pt.taskNo === 'T1' || pt.task_no === undefined, 'productionTask toApi has camel keys');
  assert(Object.keys(pt).every((k) => !k.includes('_') || k === 'status'), 'productionTask keys mostly camel');
}

// finance invoice / payment / receipt
const invApi = fin.toInvoiceApi(
  {
    invoice_number: 'AP-1',
    total_amount: 200,
    balance_amount: 50,
    supplier_name: 'S',
    status: '已确认',
  },
  'ap'
);
assert(
  invApi.invoiceNumber === 'AP-1' && invApi.balanceAmount === 50 && invApi.supplierName === 'S',
  'toInvoiceApi ap'
);
const pay = fin.toPaymentApi({
  payment_number: 'PAY1',
  supplier_name: 'S',
  total_amount: 50,
  payment_date: '2024-01-01',
  items: [{ invoice_id: 1, amount: 50, discount_amount: 0 }],
});
assert(pay.paymentNumber === 'PAY1' && pay.amount === 50 && pay.items[0].invoiceId === 1, 'toPaymentApi');
const rec = fin.toReceiptApi({
  receipt_number: 'REC1',
  customer_name: 'C',
  total_amount: 30,
  receipt_date: '2024-01-02',
});
assert(rec.receiptNumber === 'REC1' && rec.totalAmount === 30, 'toReceiptApi');

// gl
const entry = gl.toGlEntryApi({
  entry_number: 'E1',
  voucher_word: '记',
  voucher_number: 3,
  entry_date: '2024-01-01',
  is_posted: 1,
  total_debit: 100,
  total_credit: 100,
});
assert(entry.entryNumber === '记-3' && entry.isPosted === true && entry.totalDebit === 100, 'toGlEntryApi');
const acct = gl.toGlAccountApi({
  account_code: '1001',
  account_name: '现金',
  account_type: '资产',
  is_active: 1,
  is_debit: 1,
});
assert(acct.accountCode === '1001' && acct.isActive === true, 'toGlAccountApi');
const bank = gl.toBankTransactionApi({
  transaction_number: 'BT1',
  transaction_date: '2024-01-01',
  amount: 10,
  account_name: '工行',
});
assert(bank.transactionNumber === 'BT1' && bank.accountName === '工行', 'toBankTransactionApi');
const bud = gl.toBudgetApi({
  budget_no: 'B1',
  budget_name: '年度',
  total_amount: 1000,
  used_amount: 100,
});
assert(bud.budgetNo === 'B1' && bud.totalAmount === 1000, 'toBudgetApi');
const budIn = gl.fromBudgetApi({
  budgetName: 'x',
  budgetYear: 2024,
  startDate: '2024-01-01',
  endDate: '2024-12-31',
});
assert(budIn.budget_name === 'x' && budIn.budget_year === 2024, 'fromBudgetApi');

// list query helpers
const qPay = fin.fromPaymentListQuery({ paymentNumber: 'P', startDate: '2024-01-01' });
assert(qPay.payment_number === 'P' && qPay.start_date === '2024-01-01', 'fromPaymentListQuery');
const qEnt = gl.fromGlEntryListQuery({ entryNumber: 'E', isPosted: 'true' });
assert(qEnt.entry_number === 'E' && qEnt.is_posted === true, 'fromGlEntryListQuery');

// --- static frontend consistency: critical pure-camel reads ---
import fs from 'node:fs';

function read(p) {
  return fs.readFileSync(path.join(root, p), 'utf8');
}

// quality AQL client sends camel
const qualityApi = read('frontend/src/api/quality.js');
assert(
  qualityApi.includes('batchSize: data.batchSize') && qualityApi.includes('aqlLevel: data.aqlLevel'),
  'quality AQL client uses camel body'
);
assert(!/batch_size:\s*data\.batchSize/.test(qualityApi), 'quality AQL no snake body keys');

// aql controller accepts camel
const aqlCtrl = read('backend/src/controllers/business/quality/aqlController.js');
assert(aqlCtrl.includes('req.body?.batchSize') && aqlCtrl.includes('req.body?.aqlLevel'), 'aqlController camel body');

// purchase normalize pure camel
const purchaseApi = read('frontend/src/api/purchase.js');
assert(purchaseApi.includes('requisitionId') && !purchaseApi.includes('requisition_id ||'), 'purchase normalize camel-only');

// dual-case script exists and scans api
const dualScript = read('scripts/check-no-dual-case.mjs');
assert(dualScript.includes('frontend/src/api'), 'dual-case scans frontend/src/api');
assert(dualScript.includes('frontend/src/utils'), 'dual-case scans frontend/src/utils');

console.log('\n--- summary ---');
if (failed) {
  console.error(`FAILED ${failed} assertion(s)`);
  process.exit(1);
}
console.log('ALL SMOKE ASSERTIONS PASSED');
