'use strict';

// Completes finance/workflow checks for the synthetic records created through the UI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const logDir = path.join(root, 'logs', 'sales-audit-20260914');
const session = JSON.parse(fs.readFileSync(path.join(logDir, 'session.local.json'), 'utf8'));
assert.equal(session.database, 'erp_sales_audit_test_20260914');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
Object.assign(process.env, { DB_NAME: session.database, NODE_ENV: 'test', RUN_LIVE_UAT: '1', DISABLE_CRON: 'true', ENABLE_RATE_LIMIT: 'false', REDIS_ENABLED: 'false' });
const db = require('../src/config/db');
const app = require('../src/app');
require('../src/events/subscribers/FinanceSubscriber');
require('../src/events/subscribers/NotificationSubscriber');
const { createApiClient, approveInventoryPosting } = require('./lib/live-flow-client');
const FinanceIntegrationService = require('../src/services/external/FinanceIntegrationService');
const report = { database: session.database, startedAt: new Date().toISOString(), checks: [] };
const rows = async (sql, params = []) => (await db.pool.query(sql, params))[0];
const one = async (sql, params = []) => (await rows(sql, params))[0];
const checked = (name, evidence) => { report.checks.push({ name, result: 'PASS', evidence }); save(); };
const save = () => fs.writeFileSync(path.join(logDir, 'ui-postings-results.json'), JSON.stringify(report, null, 2));
const ok = response => { assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body.data; };
async function main() {
  assert.equal((await one('SELECT DATABASE() AS db')).db, session.database);
  const business = await createApiClient(app, 'SA1789361935668', session.password);
  const finance = await createApiClient(app, 'SA1789369013810_finance', session.password);
  const reviewer = await createApiClient(app, 'SA1789369013810R', session.password);
  const actor = await one('SELECT id FROM users WHERE username=?', ['SA1789361935668']);
  const outbound = await one('SELECT * FROM sales_outbound WHERE outbound_no=?', ['SOB260914064']);
  const returned = await one('SELECT * FROM sales_returns WHERE return_no=?', ['SRT260914010']);
  const exchange = await one('SELECT * FROM sales_exchanges WHERE exchange_no=?', ['SE260914034']);
  for (const doc of [outbound, returned, exchange]) {
    assert.ok(doc); assert.equal(Number(doc.created_by), Number(actor.id)); assert.equal(doc.status, 'completed');
  }
  if (!process.argv.includes('--verify')) {
    assert.ok(process.argv.includes('--write'), 'Explicit --write is required');
    for (const sourceNo of [outbound.outbound_no, returned.return_no, exchange.exchange_no]) {
      const pending = await one("SELECT COUNT(*) AS count FROM inventory_posting_documents WHERE source_no=? AND posting_kind='movement' AND finance_status='pending'", [sourceNo]);
      if (Number(pending.count)) await approveInventoryPosting(db, finance, sourceNo, { businessApi: business });
    }
    if (process.argv.includes('--repair-test-invoice')) {
      const invoice = await one("SELECT id,total_amount FROM ar_invoices WHERE source_type='sales_outbound' AND source_id=?", [outbound.id]);
      if (invoice && Number(invoice.total_amount) !== 210) {
        assert.equal(Number(invoice.total_amount),237.3);
        ok(await reviewer.put(`/api/finance/ar/invoices/${invoice.id}/status`, { status: '已取消' }));
        checked('隔离测试旧错误税额应收正常作废及冲销', { invoiceId: invoice.id });
      }
      const taxInvoice = await one("SELECT id,total_amount FROM tax_invoices WHERE related_document_type='sales_outbound' AND related_document_id=? AND status<>'已作废'", [outbound.id]);
      if (taxInvoice && Number(taxInvoice.total_amount) !== 210) {
        assert.equal(Number(taxInvoice.total_amount),237.3);
        ok(await reviewer.post(`/api/finance/tax/invoices/${taxInvoice.id}/void`, {}));
        checked('隔离测试旧错误销项税票正常作废', { invoiceId: taxInvoice.id });
      }
    }
    ok(await finance.post(`/api/finance/integration/ar-invoice-from-outbound/${outbound.id}`, {}));
    ok(await finance.post(`/api/finance/integration/tax-output/${outbound.id}`, {}));
  }
    const contractRecord = await one('SELECT id FROM contracts WHERE code=?', ['CT26025']);
    let contract = ok(await business.get(`/api/contracts/${contractRecord.id}`));
    assert.equal(contract.code, 'CT26025');
    assert.equal(contract.name, '销售修复回归 UI-20260914 合同');
    for (let step = 0; !process.argv.includes('--verify') && contract.status === 'pending_approval' && step < 12; step++) {
      const instance = ok(await reviewer.get(`/api/workflow/instances/${contract.workflowInstanceId}`));
      ok(await reviewer.post(`/api/workflow/instances/${contract.workflowInstanceId}/approve`, { nodeId: instance.currentNodeId, action: 'approve', comment: 'UI销售修复回归：独立测试审核人正常审批' }));
      contract = ok(await business.get(`/api/contracts/${contract.id}`));
    }
    assert.equal(contract.status, 'active');
    checked('合同页面创建编辑后通过正常工作流审批', { code: contract.code, status: contract.status, totalAmount: contract.totalAmount });
  const p0 = await one('SELECT id FROM materials WHERE code=?', ['SA1789369013810-P0']);
  const p1 = await one('SELECT id FROM materials WHERE code=?', ['SA1789369013810-P1']);
  for (const [sourceNo, expected] of [
    [outbound.outbound_no, [[p0.id,-7]]], [returned.return_no, [[p0.id,1]]], [exchange.exchange_no, [[p0.id,1],[p1.id,-2]]],
  ]) {
    const ledger = await rows('SELECT material_id,SUM(quantity) AS quantity FROM inventory_ledger WHERE reference_no=? GROUP BY material_id ORDER BY material_id', [sourceNo]);
    assert.deepEqual(ledger.map(row => [Number(row.material_id),Number(row.quantity)]), expected);
    checked('页面单据财审后正式库存正确', { sourceNo, ledger });
  }
  const ar = await rows("SELECT id,total_amount FROM ar_invoices WHERE source_type='sales_outbound' AND source_id=?", [outbound.id]);
  assert.equal(ar.length, 1); assert.equal(Number(ar[0].total_amount), 210);
  checked('页面出库应收金额与七件成交金额一致', ar);
  const taxInvoice = await rows("SELECT id,amount_excluding_tax,tax_amount,total_amount FROM tax_invoices WHERE related_document_type='sales_outbound' AND related_document_id=? AND status<>'已作废'", [outbound.id]);
  assert.equal(taxInvoice.length,1);assert.equal(Number(taxInvoice[0].total_amount),210);assert.equal(Number(taxInvoice[0].tax_amount),0);
  checked('页面出库销项票与零税率应收一致', taxInvoice);
  const packing = await one("SELECT p.id,p.status,p.total_quantity,d.quantity,d.unit_id,u.name AS unit_name FROM packing_lists p JOIN packing_list_details d ON d.packing_list_id=p.id LEFT JOIN units u ON u.id=d.unit_id WHERE p.packing_list_no='PL260914012'");
  assert.equal(packing.status,'completed');assert.equal(Number(packing.quantity),4);assert.ok(packing.unit_id);assert.equal(packing.unit_name,'包');
  checked('装箱页面编辑四件后完成且单位保留', packing);
  let entries = [];
  for (let attempt = 0; attempt < 60; attempt++) {
    entries = await rows("SELECT id FROM gl_entries WHERE document_type='sales_exchange' AND document_number=?", [exchange.exchange_no]);
    if (entries.length) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(entries.length, 1);
  const lines = await rows('SELECT account_id,debit_amount,credit_amount FROM gl_entry_items WHERE entry_id=?', [entries[0].id]);
  const accounts = await FinanceIntegrationService.resolveAccountIds(['ACCOUNTS_RECEIVABLE']);
  const receivable = lines.find(line => Number(line.account_id) === Number(accounts.ACCOUNTS_RECEIVABLE));
  assert.equal(Number(receivable.debit_amount)-Number(receivable.credit_amount), 10);
  checked('页面换货补差价十元且凭证借贷平衡', { entries, lines });
  assert.equal(lines.reduce((sum, line) => sum+Number(line.debit_amount)-Number(line.credit_amount), 0), 0);
  const quote = await one('SELECT id,status FROM sales_quotations WHERE quotation_no=?', ['SQ260914035']);
  const orders = await rows('SELECT id,order_no,total_amount FROM sales_orders WHERE quotation_id=?', [quote.id]);
  assert.equal(quote.status, 'converted'); assert.equal(orders.length, 1); assert.equal(Number(orders[0].total_amount), 120);
  checked('页面报价一次转换只产生一张一百二十元订单', orders);
  if (process.argv.includes('--verify')) {
    const credits = await rows("SELECT id,total_amount FROM ar_invoices WHERE source_type='sales_return' AND source_id=?", [returned.id]);
    assert.equal(credits.length, 1); assert.equal(Number(credits[0].total_amount), -30);
    ok(await finance.post(`/api/finance/integration/ar-credit-note-from-return/${returned.id}`, {}));
    assert.equal((await rows("SELECT id FROM ar_invoices WHERE source_type='sales_return' AND source_id=?", [returned.id])).length, 1);
    checked('页面退货红字应收三十元且重复调用幂等', credits);
  }
  report.finishedAt = new Date().toISOString(); save();
  console.log(JSON.stringify({ checks: report.checks.length, result: 'PASS', output: path.join(logDir, 'ui-postings-results.json') }));
}
main().catch(error => { report.error = error.stack; save(); console.error(error.message); process.exitCode = 1; }).finally(async () => {
  await new Promise(resolve => setTimeout(resolve, 300));
  await require('../src/database/ConnectionPoolFactory').closeAll();
  process.exit(process.exitCode || 0);
});
