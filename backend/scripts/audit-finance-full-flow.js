'use strict';

// Real API and database UAT; accepts only explicitly named disposable databases.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getAuditCalendar, summarizeCases, auditExitCode, formatCaseResult } = require('./lib/sales-audit-runtime');
const args = process.argv.slice(2);
const database = args.includes('--database') ? args[args.indexOf('--database') + 1] : '';
assert.ok(args.includes('--write'), 'Explicit --write is required');
assert.match(database, /^erp_finance_audit_test_\d{8}(?:_\w+)?$/);
const outDir = path.resolve(__dirname, '../logs', database.replace('erp_finance_audit_test_', 'finance-audit-'));
const runDir = path.join(outDir, 'runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
fs.mkdirSync(runDir, { recursive: true });
const previous = args.includes('--resume') ? JSON.parse(fs.readFileSync(path.join(outDir, 'functional-results.json'), 'utf8')) : null;
if (previous) assert.equal(previous.database, database);
const sessionFile = path.join(outDir, 'session.local.json');
const savedSession = previous ? JSON.parse(fs.readFileSync(sessionFile, 'utf8')) : null;
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
Object.assign(process.env, {
  NODE_ENV: 'test', DB_NAME: database, RUN_LIVE_UAT: '1', DISABLE_CRON: 'true',
  ENABLE_RATE_LIMIT: 'false', REDIS_ENABLED: 'false', LOG_CONSOLE: 'false',
  DINGTALK_APP_KEY: '', DINGTALK_APP_SECRET: '', DINGTALK_API_TOKEN: '',
  DINGTALK_API_BASE_URL: 'http://127.0.0.1:9',
  LOG_DIR: path.join(runDir, 'application'),
  TEST_ADMIN_PASSWORD: savedSession?.password || `FinanceAudit-${crypto.randomBytes(18).toString('hex')}!`,
});
const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');
const app = require('../src/app');
require('../src/events/subscribers/FinanceSubscriber');
const { createApiClient, createFinanceActor } = require('./lib/live-flow-client');
const calendar = getAuditCalendar();
const today = calendar.today;
const prefix = previous?.prefix || `FA${Date.now()}`;
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const report = previous || { database, prefix, startedAt: new Date().toISOString(), cases: [], fixtures: {} };
delete report.fatal;
delete report.finishedAt;
report.execution = { startedAt: new Date().toISOString(), businessDate: today, runDirectory: runDir, selectedCases: only ? [...only] : null };
const ctx = report.fixtures;
const requestEvidence = new WeakMap();
const rows = async (sql, params = []) => (await db.pool.query(sql, params))[0];
const one = async (sql, params = []) => (await rows(sql, params))[0];
const dataOf = response => response.body?.data?.data || response.body?.data || response.body;
let api, finance, reviewer, current;
function need(value, label) { if (!value) throw Object.assign(new Error(`前置步骤未成功：${label}`), { blocked: true }); return value; }
function evidence(value) { current?.evidence.push(value); return value; }
function money(value) { return Math.round(Number(value) * 100) / 100; }
function equalMoney(actual, expected, label = '金额') { assert.equal(money(actual), money(expected), `${label}: ${actual} != ${expected}`); }
function save() {
  report.summary = summarizeCases(report.cases);
  const serialized = JSON.stringify(report, null, 2);
  fs.writeFileSync(path.join(outDir, 'functional-results.json'), serialized);
  fs.writeFileSync(path.join(runDir, 'functional-results.json'), serialized);
}
async function test(id, module, name, run) {
  if (only && !only.has(id)) return;
  const item = { id, module, name, result: 'RUNNING', startedAt: new Date().toISOString(), requests: [], evidence: [] };
  const started = Date.now();
  current = item;
  try { await run(); item.result = 'PASS'; }
  catch (error) { item.result = error.blocked ? 'BLOCKED' : 'FAIL'; item.error = error.message; }
  item.durationMs = Date.now() - started;
  const index = report.cases.findIndex(c => c.id === id);
  if (index < 0) report.cases.push(item); else report.cases[index] = item;
  current = null;
  save();
  console.log(formatCaseResult(item));
}
async function call(method, url, body, actor = api, headers = {}) {
  const req = actor[method](url, body);
  if (url.includes('/export')) req.buffer(true).parse((res,done)=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>done(null,Buffer.concat(chunks)));res.on('error',done);});
  for (const [name, value] of Object.entries(headers)) req.set(name, value);
  const response = await req.timeout({ response: 25000, deadline: 40000 });
  if (current) {
    const entry = { method: method.toUpperCase(), url, body, status: response.status, response: Buffer.isBuffer(response.body) ? {bytes:response.body.length,sha256:crypto.createHash('sha256').update(response.body).digest('hex')} : response.body };
    current.requests.push(entry);
    requestEvidence.set(response, entry);
  }
  return response;
}
async function upload(url, fields, buffer, filename, actor = api) {
  const req = actor.post(url).unset('Content-Type');
  for (const [key,value] of Object.entries(fields)) req.field(key,String(value));
  const response = await req.attach('file',buffer,{filename,contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}).timeout({response:25000,deadline:40000});
  if(current){const entry={method:'POST',url,fields,file:{filename,bytes:buffer.length},status:response.status,response:response.body};current.requests.push(entry);requestEvidence.set(response,entry);}
  return response;
}
function http(response, expected = 200) {
  const statuses = Array.isArray(expected) ? expected : [expected];
  const entry = requestEvidence.get(response);
  if (entry) entry.expectedStatuses = statuses;
  assert.ok(statuses.includes(response.status), `预期 HTTP ${statuses}，实际 ${response.status}: ${JSON.stringify(response.body)}`);
  return dataOf(response);
}
function reject(response) { return http(response, [400, 403, 404, 409, 422]); }
async function eventually(read, predicate, label, timeout = 8000) {
  let value;
  const deadline = Date.now() + timeout;
  do {
    value = await read();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  assert.fail(`${label}: ${JSON.stringify(value)}`);
}
const bankBalance = async id => Number((await one('SELECT current_balance FROM bank_accounts WHERE id=?', [id])).current_balance);
async function assertEntry(entryId, expectedTotal) {
  const entry = need(await one('SELECT * FROM gl_entries WHERE id=?', [entryId]), '总账凭证');
  const items = await rows('SELECT i.*,a.account_code FROM gl_entry_items i JOIN gl_accounts a ON a.id=i.account_id WHERE i.entry_id=?', [entryId]);
  assert.ok(items.length >= 2, '至少两条分录');
  const debit = money(items.reduce((n,i)=>n+Number(i.debit_amount),0));
  const credit = money(items.reduce((n,i)=>n+Number(i.credit_amount),0));
  equalMoney(debit, credit, '借贷平衡');
  if (expectedTotal !== undefined) equalMoney(debit, expectedTotal, '借方合计');
  assert.equal(Number(entry.is_posted), 1, '凭证已过账');
  evidence({ entryId, entryNumber: entry.entry_number, debit, credit, items: items.map(i=>({ accountCode: i.account_code, debit:i.debit_amount, credit:i.credit_amount })) });
  return { entry, items };
}

async function setup() {
  assert.equal((await one('SELECT DATABASE() db')).db, database);
  if (previous) {
    api = await createApiClient(app, prefix, process.env.TEST_ADMIN_PASSWORD);
    finance = { id: ctx.financeId, api: await createApiClient(app, `${prefix}_finance`, process.env.TEST_ADMIN_PASSWORD) };
    reviewer = { id: ctx.reviewerId, api: await createApiClient(app, `${prefix}_reviewer`, process.env.TEST_ADMIN_PASSWORD) };
    return;
  }
  const hash = await bcrypt.hash(process.env.TEST_ADMIN_PASSWORD, 10);
  const [actor] = await db.pool.query("INSERT INTO users(username,password,real_name,role,status) VALUES(?,?,?,'admin',1)", [prefix,hash,`${prefix} 财务测试制单`]);
  ctx.actorId = actor.insertId;
  await db.pool.query("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='admin'", [ctx.actorId]);
  api = await createApiClient(app, prefix, process.env.TEST_ADMIN_PASSWORD);
  finance = await createFinanceActor(app, db, prefix);
  reviewer = await createFinanceActor(app, db, prefix, 'reviewer', 'admin');
  ctx.financeId = finance.id;
  ctx.reviewerId = reviewer.id;
  fs.writeFileSync(sessionFile, JSON.stringify({ database, username:prefix, password:process.env.TEST_ADMIN_PASSWORD, financeUsername:finance.username, reviewerUsername:reviewer.username }));
  const period = await one('SELECT id FROM gl_periods WHERE start_date<=? AND end_date>=?', [today,today]);
  if (!period) http(await call('post','/api/finance/periods',{periodName:today.slice(0,7),startDate:calendar.periodStart,endDate:calendar.periodEnd,fiscalYear:calendar.fiscalYear}),[200,201]);
  ctx.periodId = (await one('SELECT id FROM gl_periods WHERE start_date<=? AND end_date>=?', [today,today])).id;
  ctx.locationId = (await one('SELECT id FROM locations WHERE deleted_at IS NULL ORDER BY id LIMIT 1')).id;
  ctx.unitId = (await one('SELECT id FROM units WHERE status=1 AND deleted_at IS NULL ORDER BY id LIMIT 1')).id;
  ctx.departmentId = (await one('SELECT id FROM departments WHERE status=1 ORDER BY id LIMIT 1')).id;
  ctx.costCenterId = (await one('SELECT id FROM cost_centers WHERE is_active=1 ORDER BY id LIMIT 1')).id;
  ctx.expenseCategoryId = (await one('SELECT id FROM expense_categories WHERE status=1 ORDER BY id LIMIT 1')).id;
  const categoryId = (await one('SELECT id FROM categories WHERE status=1 AND deleted_at IS NULL ORDER BY id LIMIT 1')).id;
  const [customer] = await db.pool.query("INSERT INTO customers(code,name,status) VALUES(?,?,1)", [`${prefix}-C`,`${prefix} 测试客户`]);
  const [supplier] = await db.pool.query("INSERT INTO suppliers(code,name,status) VALUES(?,?,1)", [`${prefix}-S`,`${prefix} 测试供应商`]);
  ctx.customerId=customer.insertId;
  ctx.supplierId=supplier.insertId;
  const inspectionMethodId = (await one("SELECT id FROM inspection_methods WHERE code='full' AND deleted_at IS NULL LIMIT 1")).id;
  const [material] = await db.pool.query("INSERT INTO materials(code,name,category_id,material_source_id,inspection_method_id,supplier_id,unit_id,location_id,specs,material_type,price,cost_price,tax_rate,status) VALUES(?,?,?,?,?,?,?,?,?,'finished',200,100,0.13,1)",
    [`${prefix}-M`,`${prefix} 测试产品`,categoryId,2,inspectionMethodId,ctx.supplierId,ctx.unitId,ctx.locationId,'finance audit']);
  ctx.materialId=material.insertId;
  ctx.materialCode=`${prefix}-M`;
  ctx.bankIds=[];
  for (const [suffix,initialBalance] of [['A',200000],['B',10000],['EMPTY',0]]) {
    http(await call('post','/api/finance/bank-accounts',{accountNumber:`${prefix}-${suffix}`,accountName:`${prefix} 测试账户 ${suffix}`,bankName:'隔离测试银行',currencyCode:'CNY',initialBalance,accountType:'活期',notes:prefix}),[200,201]);
    ctx.bankIds.push((await one('SELECT id FROM bank_accounts WHERE account_number=?',[`${prefix}-${suffix}`])).id);
  }
  save();
}

async function readChecks() {
  const endpoints = [
    'accounts','accounts/options','periods','entries','opening-balances','opening-balances/preview',
    `gl/trial-balance?periodId=${ctx.periodId}`,`gl/closing/preview/${ctx.periodId}`,`gl/closing/history/${ctx.periodId}`,
    'ar/invoices','ar/invoices/overdue','ar/receipts','ar/receipts/unpaid-invoices','ar/aging','ar/customer-receivables','ar/settlement-dashboard',
    'ap/invoices','ap/invoices/unpaid','ap/invoices/overdue','ap/payments','ap/aging','ap/supplier-payables','ap/settlement-dashboard',
    'integration/eligible-purchase-receipts','integration/eligible-sales-outbounds','integration/three-way-match',
    'bank-accounts','bank-accounts/stats','bank-transactions','bank-transactions/transfer-requests',
    'cash-transactions','cash-transactions/stats','cash/reconciliation/unreconciled','cash/reconciliation/reconciled','cash/reconciliation/stats',
    'expenses','expenses/categories','expenses/stats','assets','assets/categories','assets/stats','assets/dashboard/stats',
    'assets/depreciation/records','assets/depreciation/forecast','assets-cip','assets-inventory',
    'budgets','budgets/warnings','budgets/analysis/department-comparison','tax/invoices','tax/returns','tax/account-config',
    'cost/statistics','cost/trend','cost/composition','cost/standard-list','cost/actual','cost/variance','cost/wip-report','cost/outsourced-wip',
    'cost/alerts','cost/closing/status','cost-centers','cost-versions','cost/settings','cost/overhead-allocation','cost/gl-mappings',
    'cost-ledger','settings','settings/options','automation/history','automation/failed-jobs','automation/scheduled-tasks/status',
    'reports/balance-sheet','reports/income-statement','reports/cash-flow','reports/standard-cash-flow','reports/summary','reports/ratio-analysis','reports/trend-analysis','reports/dashboard',
    'profitability/summary','profitability/products','profitability/customers','profitability/trend',
  ];
  for(const [i,url] of endpoints.entries()) await test(`READ-${i+1}`,'查询',url,async()=>{
    http(await call('get',`/api/finance/${url}${url.includes('?')?'&':'?'}page=1&pageSize=5&startDate=${calendar.periodStart}&endDate=${calendar.periodEnd}&reportDate=${today}&depreciationDate=${today.slice(0,7)}&year=${calendar.fiscalYear}&month=${Number(today.slice(5,7))}`));
  });
  await test('AUTH-READ','权限','未登录不可读取财务凭证',async()=>{assert.equal((await request(app).get('/api/finance/entries')).status,401);});
  await test('AUTH-WRITE','权限','未登录不可创建财务单据',async()=>{assert.ok([401,403].includes((await request(app).post('/api/finance/ar/invoices').send({})).status));});
  await test('OPTIONS-BUSINESS', '前端配置', '财务业务选项包含银行及总账白名单', async () => {
    const config = http(await call('get', '/api/finance/settings/options', undefined, finance.api));
    assert.deepEqual(Object.keys(config).sort(), ['bank', 'currency', 'gl', 'invoice', 'tax']);
    assert.ok(config.bank.transactionTypes.some(type => type.value === 'expense'));
    assert.ok(config.bank.transactionCategories.expense.length > 0);
    assert.ok(config.bank.paymentMethods.length > 0);
    assert.ok(config.gl.documentTypes.length > 0); assert.ok(config.gl.entryStatuses.length > 0);
  });
}

function invoiceBody(kind, extra={}) {
  return { [kind==='ar'?'customerId':'supplierId']:kind==='ar'?ctx.customerId:ctx.supplierId,
    invoiceDate:today,dueDate:today,taxRate:0.13,notes:prefix,totalAmount:1,
    items:[{materialId:ctx.materialId,description:`${prefix} 发票测试`,quantity:2,unitPrice:100}],...extra };
}
async function createInvoice(kind,extra={}) {
  const number = http(await call('get',`/api/finance/${kind}/invoices/generate-number`)).invoiceNumber;
  http(await call('post',`/api/finance/${kind}/invoices`,{...invoiceBody(kind,extra),invoiceNumber:number}),[200,201]);
  return need(await one(`SELECT * FROM ${kind}_invoices WHERE invoice_number=?`,[number]),'发票已保存');
}
async function confirmInvoice(kind,id) { http(await call('put',`/api/finance/${kind}/invoices/${id}/status`,{status:'已确认'},finance.api)); }
async function invoiceFlows() {
  for(const kind of ['ar','ap']) {
    const tag=kind.toUpperCase();
    const collection=kind==='ar'?'receipts':'payments';
    const dateKey=kind==='ar'?'receiptDate':'paymentDate';
    const sign=kind==='ar'?1:-1;
    const entryType=kind==='ar'?'collection':'payment';
    const recordTable=kind==='ar'?'ar_receipts':'ap_payments';
    const recordNumber=kind==='ar'?'receipt_number':'payment_number';
    const settle=(amount,extra={})=>({invoiceId:need(ctx[kind],'发票').id,[dateKey]:today,amount,paymentMethod:'银行转账',bankAccountId:ctx.bankIds[0],notes:prefix,...extra});
    await test(`${tag}-CREATE`,tag,'草稿按明细与税率重算总额',async()=>{ctx[kind]=await createInvoice(kind);assert.equal(ctx[kind].status,'草稿');equalMoney(ctx[kind].total_amount,226);equalMoney(ctx[kind].balance_amount,226);evidence(ctx[kind]);});
    if (kind === 'ap') await test('AP-INVALID-MATERIAL', 'AP', '创建与编辑拒绝空明细物料、零ID和空行且不落库', async () => {
      const before = await one('SELECT COUNT(*) n FROM ap_invoices');
      for (const item of [null, { quantity: 1, unitPrice: 100 }, { materialId: 0, quantity: 1, unitPrice: 100 }]) {
        const body = invoiceBody('ap', { invoiceNumber: `${prefix}-INVALID`, items: [item] });
        http(await call('post', '/api/finance/ap/invoices', body), 400);
        http(await call('put', `/api/finance/ap/invoices/${ctx.ap.id}`, body), 400);
      }
      assert.deepEqual(await one('SELECT COUNT(*) n FROM ap_invoices'), before);
      equalMoney((await one('SELECT total_amount FROM ap_invoices WHERE id=?', [ctx.ap.id])).total_amount, 226);
    });
    await test(`${tag}-DRAFT-EDIT`, tag, '草稿改数量后保留物料、单价，并重算旧的行金额和价税', async () => {
      for (const quantity of [3, 2]) {
        const edited = invoiceBody(kind, { invoiceNumber: ctx[kind].invoice_number, totalAmount: 226, taxAmount: 26, items: [{ materialId: ctx.materialId, quantity, unitPrice: 100, amount: 200, description: prefix }] });
        http(await call('put', `/api/finance/${kind}/invoices/${ctx[kind].id}`, edited));
        const stored = await one(`SELECT * FROM ${kind}_invoices WHERE id = ?`, [ctx[kind].id]);
        const item = await one(`SELECT * FROM ${kind}_invoice_items WHERE invoice_id = ?`, [ctx[kind].id]);
        equalMoney(stored.total_amount, quantity * 113); equalMoney(stored.tax_amount, quantity * 13);
        equalMoney(stored.balance_amount, quantity * 113); equalMoney(item.amount, quantity * 100);
        equalMoney(item.unit_price, 100); assert.equal(Number(item[kind === 'ap' ? 'material_id' : 'product_id']), Number(ctx.materialId));
      }
    });
    await test(`${tag}-DRAFT-SETTLE`,tag,'草稿禁止直接核销',async()=>{reject(await call('post',`/api/finance/${kind}/${collection}`,settle(10)));});
    await test(`${tag}-SELF-APPROVAL`,tag,'制单人不可审核自己的发票',async()=>{const r=await call('put',`/api/finance/${kind}/invoices/${ctx[kind].id}/status`,{status:'已确认'});reject(r);assert.match(r.body.message,/分离/);});
    await test(`${tag}-CONFIRM`,tag,'确认生成平衡总账和价税分录',async()=>{
      await confirmInvoice(kind,need(ctx[kind],'发票').id);
      const gl=need(await one('SELECT id FROM gl_entries WHERE document_number=? AND COALESCE(is_reversed,0)=0 ORDER BY id DESC LIMIT 1',[ctx[kind].invoice_number]),'发票总账');
      ctx[`${kind}EntryId`]=gl.id;
      await assertEntry(gl.id,226);
    });
    await test(`${tag}-CONFIRM-RETRY`,tag,'重复确认不能重复记账',async()=>{
      const before=await rows('SELECT id FROM gl_entries WHERE document_number=?',[ctx[kind].invoice_number]);
      http(await call('put',`/api/finance/${kind}/invoices/${ctx[kind].id}/status`,{status:'已确认'},finance.api),[200,400,409]);
      assert.equal((await rows('SELECT id FROM gl_entries WHERE document_number=?',[ctx[kind].invoice_number])).length,before.length);
    });
    await test(`${tag}-EDIT-CONFIRMED`,tag,'已确认发票禁止直接改金额',async()=>{reject(await call('put',`/api/finance/${kind}/invoices/${ctx[kind].id}`,invoiceBody(kind,{items:[{materialId:ctx.materialId,description:prefix,quantity:3,unitPrice:100}]})));});
    for(const value of [0,-1,227]) await test(`${tag}-AMOUNT-${value}`,tag,`拒绝非法核销金额 ${value}`,async()=>{const before=await bankBalance(ctx.bankIds[0]);reject(await call('post',`/api/finance/${kind}/${collection}`,settle(value)));equalMoney(await bankBalance(ctx.bankIds[0]),before);});
    if(kind==='ap') await test('AP-INSUFFICIENT','AP','余额不足无银行或发票变动',async()=>{reject(await call('post','/api/finance/ap/payments',settle(100,{bankAccountId:ctx.bankIds[2]})));equalMoney(await bankBalance(ctx.bankIds[2]),0);equalMoney((await one('SELECT paid_amount FROM ap_invoices WHERE id=?',[ctx.ap.id])).paid_amount,0);});
    await test(`${tag}-PARTIAL`,tag,'部分核销同步发票、银行与总账',async()=>{
      const before=await bankBalance(ctx.bankIds[0]);
      const result=http(await call('post',`/api/finance/${kind}/${collection}`,settle(100)),[200,201]);
      const record=await one(`SELECT * FROM ${recordTable} WHERE id=?`,[result.id||result.receiptId||result.paymentId]);
      ctx[`${kind}Partial`]=need(record,'部分收付款单');
      const invoice=await one(`SELECT * FROM ${kind}_invoices WHERE id=?`,[ctx[kind].id]);
      equalMoney(invoice.paid_amount,100);equalMoney(invoice.balance_amount,126);equalMoney(await bankBalance(ctx.bankIds[0]),before+sign*100);
      const gl=await one('SELECT id FROM gl_entries WHERE document_number=? AND document_type=?',[record[recordNumber],entryType]);
      await assertEntry(need(gl,'核销凭证').id,100);evidence(invoice);
    });
    await test(`${tag}-FULL`,tag,'剩余金额核销至零',async()=>{http(await call('post',`/api/finance/${kind}/${collection}`,settle(126)),[200,201]);const inv=await one(`SELECT * FROM ${kind}_invoices WHERE id=?`,[ctx[kind].id]);equalMoney(inv.balance_amount,0);assert.equal(inv.status,'已付款');});
    await test(`${tag}-OVERSETTLE`,tag,'结清后重复收付款被拦截',async()=>{reject(await call('post',`/api/finance/${kind}/${collection}`,settle(1)));});
    await test(`${tag}-VOID`,tag,'作废部分核销恢复余额并冲销凭证',async()=>{
      const record=need(ctx[`${kind}Partial`],'部分核销');const before=await bankBalance(ctx.bankIds[0]);
      http(await call('post',`/api/finance/${kind}/${collection}/${record.id}/void`,{voidReason:`${prefix} 作废验证`}));
      const inv=await one(`SELECT * FROM ${kind}_invoices WHERE id=?`,[ctx[kind].id]);equalMoney(inv.paid_amount,126);equalMoney(inv.balance_amount,100);equalMoney(await bankBalance(ctx.bankIds[0]),before-sign*100);
      const gl=await one('SELECT is_reversed FROM gl_entries WHERE document_number=? AND document_type=?',[record[recordNumber],entryType]);assert.equal(Number(gl.is_reversed),1);
    });
    await test(`${tag}-VOID-RETRY`,tag,'重复作废不重复回退银行余额',async()=>{const before=await bankBalance(ctx.bankIds[0]);reject(await call('post',`/api/finance/${kind}/${collection}/${ctx[`${kind}Partial`].id}/void`,{voidReason:prefix}));equalMoney(await bankBalance(ctx.bankIds[0]),before);});
    await test(`${tag}-ATOMIC-BATCH`,tag,'批量第二张发票无效时整体回滚',async()=>{
      const before=await bankBalance(ctx.bankIds[0]);const recordCount=(await one(`SELECT COUNT(*) n FROM ${recordTable}`)).n;
      reject(await call('post',`/api/finance/${kind}/${collection}/batch`,{[dateKey]:today,paymentMethod:'银行转账',bankAccountId:ctx.bankIds[0],notes:prefix,atomic:true,[collection]:[{invoiceId:ctx[kind].id,amount:10},{invoiceId:2147483640,amount:10}]}));
      equalMoney(await bankBalance(ctx.bankIds[0]),before);assert.equal((await one(`SELECT COUNT(*) n FROM ${recordTable}`)).n,recordCount);equalMoney((await one(`SELECT balance_amount FROM ${kind}_invoices WHERE id=?`,[ctx[kind].id])).balance_amount,100);
    });
    await test(`${tag}-CONCURRENT`,tag,'并发核销不会超收超付',async()=>{
      const before=await bankBalance(ctx.bankIds[0]);
      const results=await Promise.all([call('post',`/api/finance/${kind}/${collection}`,settle(100)),call('post',`/api/finance/${kind}/${collection}`,settle(100))]);
      assert.equal(results.filter(r=>[200,201].includes(r.status)).length,1);
      for(const response of results) http(response,[200,201,400,409]);
      equalMoney(await bankBalance(ctx.bankIds[0]),before+sign*100);equalMoney((await one(`SELECT balance_amount FROM ${kind}_invoices WHERE id=?`,[ctx[kind].id])).balance_amount,0);
    });
    await test(`${tag}-ZERO-TAX`,tag,'零税率发票保持零税额',async()=>{const inv=await createInvoice(kind,{taxRate:0});equalMoney(inv.total_amount,200);equalMoney(inv.tax_amount,0);await confirmInvoice(kind,inv.id);});
  }
}

async function main() {
  await setup();
  if(args.includes('--serve')) {
    assert.ok(previous, '--serve requires --resume');
    app.listen(8081,'127.0.0.1',()=>console.log(`Finance audit API listening on http://127.0.0.1:8081; database=${database}`));
    return;
  }
  const helpers = {test,call,upload,http,reject,need,evidence,one,rows,ctx,prefix,today,calendar,finance,reviewer,bankBalance,equalMoney,assertEntry,createInvoice,confirmInvoice,eventually};
  if (!args.includes('--credit-only')) {
    await readChecks();
    await invoiceFlows();
    await require('./lib/finance-audit-operations')(helpers);
    await require('./lib/finance-audit-integrations')(helpers);
    await require('./lib/finance-audit-period')(helpers);
  }
  await require('./lib/finance-audit-credit-notes')(helpers);
  report.finishedAt=new Date().toISOString();
  save();
  console.log(JSON.stringify({database,prefix,summary:report.summary,runDirectory:runDir}));
  process.exitCode=auditExitCode(report);
}
main().catch(error=>{report.fatal=error.stack;save();console.error(error.stack);process.exitCode=1;}).finally(async()=>{
  if(args.includes('--serve')&&!report.fatal) return;
  await require('../src/database/ConnectionPoolFactory').closeAll();
  const sequelizePath=require.resolve('../src/config/sequelize');
  if(require.cache[sequelizePath]){const sequelize=require('../src/config/sequelize');sequelize.stopInitialization?.();await sequelize.close();}
  setTimeout(()=>process.exit(process.exitCode||0),100).unref();
});
