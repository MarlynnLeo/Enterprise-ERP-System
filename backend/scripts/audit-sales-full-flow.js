'use strict';

/**
 * Functional sales audit against a disposable, production-shaped database.
 * Never points at the live database and never patches production application code.
 * Run from backend:
 *   node scripts/audit-sales-full-flow.js --database erp_sales_audit_test_20260914 --write
 * Findings (including failed assertions) are written to logs/sales-audit-20260914/.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getAuditCalendar, summarizeCases, auditExitCode, canSkipPrintTemplate, formatCaseResult } = require('./lib/sales-audit-runtime');
const args = process.argv.slice(2);
const database = args[args.indexOf('--database') + 1];
assert.ok(args.includes('--write'), 'Explicit --write is required for isolated fixtures');
assert.match(database || '', /^erp_sales_audit_test_\d{8}(?:_\w+)?$/, 'Only a dedicated sales audit database is allowed');
const outDir = path.join(__dirname, '..', 'logs', 'sales-audit-20260914');
const runDir = path.join(outDir, 'runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
fs.mkdirSync(runDir, { recursive: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
Object.assign(process.env, {
  DB_NAME: database, NODE_ENV: 'test', RUN_LIVE_UAT: '1', DISABLE_CRON: 'true',
  ENABLE_RATE_LIMIT: 'false', REDIS_ENABLED: 'false',
  // Keep full application errors for diagnosis without mixing expected negative
  // cases into the terminal result stream or the running ERP's daily log files.
  LOG_CONSOLE: 'false', LOG_DIR: path.join(runDir, 'application'),
  TEST_ADMIN_PASSWORD: 'SalesAuditOnly-20260914!',
});
const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');
const app = require('../src/app');
// app.js intentionally suppresses subscribers under NODE_ENV=test. Register them
// explicitly, without starting retry workers or replaying the cloned event queue.
require('../src/events/subscribers/FinanceSubscriber');
require('../src/events/subscribers/NotificationSubscriber');
const { createApiClient, createFinanceActor, approveInventoryPosting } = require('./lib/live-flow-client');
const InventoryService = require('../src/services/InventoryService');
const previous = args.includes('--resume') ? JSON.parse(fs.readFileSync(path.join(outDir,'functional-results.json'),'utf8')) : null;
if(previous) assert.equal(previous.database,database,'Resume cannot switch databases');
const only = args.includes('--only') ? new Set(args[args.indexOf('--only')+1].split(',')) : null;
const prefix = previous?.prefix || `SA${Date.now()}`;
const calendar = getAuditCalendar();
const today = calendar.today;
const report = previous || { database, prefix, startedAt: new Date().toISOString(), scope: 'sales full flow', cases: [], fixtures: {} };
delete report.fatal;
delete report.finishedAt;
report.execution = { startedAt: new Date().toISOString(), businessDate: today, selectedCases: only ? [...only] : null, runDirectory: runDir };
const ctx = report.fixtures;
let api, finance, reversalReviewer, reversalFinance, current;
const requestEvidence = new WeakMap();
const executedCases = new Set();
const rows = async (sql, params = []) => (await db.pool.query(sql, params))[0];
const one = async (sql, params = []) => (await rows(sql, params))[0];
const dataOf = response => response.body?.data?.data || response.body?.data || response.body;
function need(value, name) { if (!value) { const error = new Error(`前置步骤未成功：${name}`); error.blocked = true; throw error; } return value; }
function summary(body) {
  if (Buffer.isBuffer(body)) return { bytes: body.length };
  if (Array.isArray(body)) return body.length > 6 ? { count: body.length, first: body.slice(0, 2) } : body.map(summary);
  if (body && typeof body === 'object') return Object.fromEntries(Object.entries(body).map(([key, val]) => [key, summary(val)]));
  return body;
}
async function call(method, url, body, actor = api) {
  const res = await actor[method](url, body).timeout({ response: 20000, deadline: 35000 });
  if (current) {
    const record = { method: method.toUpperCase(), url, body, status: res.status, response: summary(res.body) };
    current.requests.push(record);
    requestEvidence.set(res, record);
  }
  return res;
}
function http(res, expected = 200) {
  const expectedStatuses = Array.isArray(expected) ? expected : [expected];
  const record = requestEvidence.get(res);
  if (record) record.expectedStatuses = expectedStatuses;
  assert.ok(expectedStatuses.includes(res.status), `预期 HTTP ${expected}，实际 ${res.status}: ${JSON.stringify(res.body)}`);
  return dataOf(res);
}
function reject(res) { http(res, [400, 403, 404, 409, 422]); }
function evidence(value) { if (current) current.evidence.push(value); return value; }
async function eventually(read, predicate, message, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  let result;
  do {
    result = await read();
    if (predicate(result)) return result;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  assert.fail(`${message}: ${JSON.stringify(result)}`);
}
function save() {
  report.summary = summarizeCases(report.cases);
  const contents = JSON.stringify(report, null, 2);
  fs.writeFileSync(path.join(outDir, 'functional-results.json'), contents);
  fs.writeFileSync(path.join(runDir, 'functional-results.json'), contents);
}
async function test(id, module, name, fn) {
  if(only && !only.has(id)) return;
  executedCases.add(id);
  const item = { id, module, name, startedAt: new Date().toISOString(), requests: [], evidence: [], result: 'RUNNING' }; current = item;
  const start = Date.now();
  try { await fn(); item.result = 'PASS'; }
  catch (error) { item.result = error.skipped ? 'SKIP' : error.blocked ? 'BLOCKED' : 'FAIL'; item.error = error.message; }
  item.durationMs = Date.now() - start;
  const existingIndex=report.cases.findIndex(x=>x.id===id);
  if(existingIndex>=0) report.cases[existingIndex]=item; else report.cases.push(item);
  current = null; save();
  console.log(formatCaseResult(item));
}
function orderBody(quantity = 10, product = ctx.products[0], customerId = ctx.customerIds[0]) {
  return { customerId, deliveryDate: today, status: 'draft', taxRate: 0, remarks: prefix,
    items: [{ materialId: product.id, quantity, unitPrice: product.price, taxRate: 0 }] };
}
async function createOrder(quantity = 10, product, customerId) {
  const res = await call('post', '/api/sales/orders', orderBody(quantity, product, customerId));
  const d = http(res, 201); need(d.id, '新订单 ID');
  return { ...d, ...(await one('SELECT id, order_no AS orderNo, status FROM sales_orders WHERE id=?', [d.id])) };
}
function outboundBody(order, quantity, product = ctx.products[0]) {
  return { orderId: order.id, deliveryDate: today, remarks: prefix, items: [{ productId: product.id, quantity, price: product.price, sourceOrderId: order.id, sourceOrderNo: order.orderNo }] };
}
async function createOutbound(order, quantity, product) {
  const d = http(await call('post', '/api/sales/outbound', outboundBody(order, quantity, product)), 201);
  return { ...d, ...(await one('SELECT id,outbound_no AS outboundNo,status FROM sales_outbound WHERE id=?', [d.id])) };
}
async function createShippedOrder(quantity = 10) {
  const order = await createOrder(quantity);
  const outbound = await createOutbound(order, quantity);
  http(await call('put', `/api/sales/outbound/${outbound.id}`, { status: 'processing' }));
  http(await call('put', `/api/sales/outbound/${outbound.id}`, { status: 'completed' }));
  await approveInventoryPosting(db, finance.api, outbound.outboundNo, { businessApi: api });
  return order;
}
async function approveContractForAudit(id) {
  let contract = http(await call('get', `/api/contracts/${id}`));
  for (let step = 0; contract.status === 'pending_approval' && step < 12; step++) {
    const instance = http(await call('get', `/api/workflow/instances/${contract.workflowInstanceId}`));
    http(await call('post', `/api/workflow/instances/${contract.workflowInstanceId}/approve`, {
      nodeId: instance.currentNodeId, action: 'approve', comment: `${prefix} repair regression approval`,
    }, reversalReviewer));
    contract = http(await call('get', `/api/contracts/${id}`));
  }
  assert.equal(contract.status, 'active');
  return contract;
}
function quoteBody(status = 'draft', quantity = 3) {
  return { quotation: { customer_id: ctx.customerIds[0], validity_date: calendar.validityDate, status, remarks: prefix },
    items: [{ product_id: ctx.products[0].id, quantity, unit_price: 30, tax_percent: 0 }] };
}
async function createQuote(status = 'draft') { return http(await call('post', '/api/sales/quotations', quoteBody(status)), 201); }
function exchangeBody(order, reason = '规格更换', quantity = 1) {
  return { orderNo: order.orderNo, customerName: `${prefix}-Customer-A`, contactPhone: '13900000000', exchangeDate: today, reason, remark: prefix,
    returnItems: [{ productCode: ctx.products[0].code, productName: ctx.products[0].name, specification: 'audit', originalQuantity: 10, returnQuantity: quantity, unitName: '件' }],
    newItems: [{ productCode: ctx.products[1].code, productName: ctx.products[1].name, specification: 'audit', newQuantity: quantity, unitName: '件' }] };
}
function packingBody(order) {
  return { customerId: ctx.customerIds[0], salesOrderId: order.id, packingDate: today, remark: prefix,
    details: [2, 3].map((quantity, i) => ({ productId: ctx.products[0].id, unitId: ctx.unitId, quantity, boxNo: `B${i + 1}`, weight: 1.2, volume: 0.4 })) };
}
function contractBody() {
  return { name: `${prefix} 销售合同`, type: 'sales', party_a: 'Audit ERP', party_b: `${prefix}-Customer-A`, party_b_id: ctx.customerIds[0], party_b_type: 'customer',
    total_amount: 300, effective_date: today, expiry_date: calendar.validityDate, payment_terms: '30天', items: [{ material_id: ctx.products[0].id, quantity: 10, unit_price: 30, amount: 300 }] };
}

async function setup() {
  assert.equal((await one('SELECT DATABASE() AS db')).db, database);
  if(previous){
    api=await createApiClient(app,ctx.username,process.env.TEST_ADMIN_PASSWORD);
    finance={id:ctx.financeActorId,api:await createApiClient(app,`${prefix}_finance`,process.env.TEST_ADMIN_PASSWORD)};
    reversalFinance={api:await createApiClient(app,`${prefix}_finance2`,process.env.TEST_ADMIN_PASSWORD)};
    reversalReviewer=await createApiClient(app,`${prefix}R`,process.env.TEST_ADMIN_PASSWORD);
    return;
  }
  const hash = await bcrypt.hash(process.env.TEST_ADMIN_PASSWORD, 10);
  const [actor] = await db.pool.query("INSERT INTO users(username,password,real_name,role,status) VALUES(?,?,?,'admin',1)", [prefix, hash, prefix]);
  ctx.actorId = actor.insertId; ctx.username = prefix;
  await db.pool.query('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [ctx.actorId, 'admin']);
  api = await createApiClient(app, prefix, process.env.TEST_ADMIN_PASSWORD);
  finance = await createFinanceActor(app, db, prefix);
  reversalFinance = await createFinanceActor(app, db, prefix, 'finance2');
  const [reviewer] = await db.pool.query("INSERT INTO users(username,password,real_name,role,status) VALUES(?,?,?,'admin',1)", [`${prefix}R`, hash, `${prefix}R`]);
  await db.pool.query('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [reviewer.insertId, 'admin']);
  reversalReviewer = await createApiClient(app, `${prefix}R`, process.env.TEST_ADMIN_PASSWORD);
  ctx.financeActorId = finance.id;
  const unit = await one('SELECT id FROM units WHERE deleted_at IS NULL AND status=1 ORDER BY id LIMIT 1');
  const category = await one('SELECT id FROM categories WHERE deleted_at IS NULL AND status=1 ORDER BY id LIMIT 1');
  ctx.unitId = unit.id;
  ctx.locationId = 3;
  ctx.customerIds = [];
  for (const suffix of ['A', 'B']) {
    const [c] = await db.pool.query("INSERT INTO customers(code,name,contact_person,contact_phone,status,remark) VALUES(?,?,?,'13900000000',1,?)", [`${prefix}-${suffix}`, `${prefix}-Customer-${suffix}`, prefix, prefix]);
    ctx.customerIds.push(c.insertId);
  }
  ctx.products = [];
  for (let i = 0; i < 3; i++) {
    const product = { code: `${prefix}-P${i}`, name: `${prefix} Product ${i}`, price: i === 0 ? 30 : 20, cost: i === 0 ? 12 : 8 };
    const [m] = await db.pool.query("INSERT INTO materials(code,name,category_id,material_source_id,unit_id,location_id,specs,material_type,price,cost_price,status,remark) VALUES(?,?,?,?,?,?,'audit','finished',?,?,1,?)", [product.code, product.name, category.id, i === 0 ? 2 : 1, unit.id, ctx.locationId, product.price, product.cost, prefix]);
    product.id = m.insertId; ctx.products.push(product);
  }
  const period = await one('SELECT id FROM gl_periods WHERE is_closed=0 AND is_locked=0 AND start_date<=? AND end_date>=?', [today, today]);
  if (!period) await db.pool.query('INSERT INTO gl_periods(period_name,start_date,end_date,is_closed,is_adjusting,fiscal_year,is_locked) VALUES(?,?,?,0,0,?,0)', [`${prefix}-period`, calendar.periodStart, calendar.periodEnd, calendar.fiscalYear]);
  // Opening inventory is a test prerequisite; it follows normal finance posting gates.
  for (const product of ctx.products.slice(0, 2)) {
    const sourceNo = `${prefix}-OPEN-${product.id}`;
    const conn = await db.pool.getConnection();
    try {
      await conn.beginTransaction();
      await InventoryService.updateStock({ materialId: product.id, locationId: ctx.locationId, quantity: 10000, unitId: ctx.unitId,
        transactionType: 'inbound', referenceType: 'audit_opening', referenceNo: sourceNo, batchNumber: `${prefix}-BATCH-${product.id}`,
        operator: prefix, businessApprovedById: ctx.actorId, unitCost: product.cost, transactionDate: today }, conn);
      await conn.commit();
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
    await approveInventoryPosting(db, finance.api, sourceNo);
  }
  fs.writeFileSync(path.join(outDir, 'session.local.json'), JSON.stringify({ database, username: prefix, password: process.env.TEST_ADMIN_PASSWORD, actorId: ctx.actorId }));
  save();
}

async function auditReadEndpoints() {
  const routes = [
    ['customers', '基础选择'], ['customers-list', '基础选择'], ['products-list', '基础选择'],
    [`customers/${ctx.customerIds[0]}`, '基础选择'], [`customers/${ctx.customerIds[0]}/order-products`, '基础选择'],
    ['orders', '订单'], ['orders/operators', '订单'], ['orders/statistics', '统计'], ['outbound', '出库'], ['outbound/statistics', '统计'],
    ['returns', '退货'], ['exchanges', '换货'], ['quotations', '报价'], ['quotations/statistics', '统计'],
    ['packing-lists', '装箱'], ['packing-lists-statistics', '统计'], ['statistics', '统计'], ['trend', '统计'],
    ['delivery-stats', '交付'], ['delivery-stats/overview', '交付'],
  ];
  for (const [i, [route, module]] of routes.entries()) await test(`READ-${i + 1}`, module, `读取 ${route}`, async () => {
    http(await call('get', `/api/sales/${route}${route.includes('?') ? '&' : '?'}page=1&pageSize=5`));
  });
  for (const [id, route] of [['LIST', '/api/contracts?type=sales&pageSize=5'], ['EXPIRING', '/api/contracts/expiring']]) await test(`CONTRACT-READ-${id}`, '合同', `读取 ${route}`, async () => { http(await call('get', route)); });
  await test('AUTH-1', '权限', '未登录用户不能读取销售订单', async () => { assert.equal((await request(app).get('/api/sales/orders')).status, 401); });
  await test('AUTH-2', '权限', '未登录用户不能新增销售订单', async () => { const r = await request(app).post('/api/sales/orders').send(orderBody()); assert.ok([401, 403].includes(r.status)); });
}

async function auditOrders() {
  await test('ORDER-1', '订单', '创建销售订单，正确计算金额并保留明细', async () => {
    ctx.mainOrder = await createOrder(10);
    const d = http(await call('get', `/api/sales/orders/${ctx.mainOrder.id}`));
    evidence(d); assert.equal(Number(d.totalAmount), 300); assert.equal(d.items.length, 1); assert.equal(Number(d.items[0].quantity), 10);
  });
  await test('ORDER-2', '订单', '库存充足时按现有规则自动进入待发货', async () => {
    const d = await createOrder(1); evidence(d); assert.equal(d.status, 'ready_to_ship');
  });
  await test('ORDER-3', '订单', '缺少客户时给出业务错误', async () => { const input = orderBody(); delete input.customerId; reject(await call('post', '/api/sales/orders', input)); });
  await test('ORDER-4', '订单', '空明细订单不能保存', async () => { reject(await call('post', '/api/sales/orders', { ...orderBody(), items: [] })); });
  for (const qty of [0, -1]) await test(`ORDER-QTY-${qty}`, '订单', `订单数量 ${qty} 返回业务校验错误`, async () => { reject(await call('post', '/api/sales/orders', orderBody(qty))); });
  await test('ORDER-DECIMAL', '订单', '小数数量不被无提示改写', async () => {
    const before = await one('SELECT COUNT(*) AS n FROM sales_orders WHERE customer_id=?', [ctx.customerIds[0]]);
    const res = await call('post', '/api/sales/orders', orderBody(1.5));
    http(res, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
    const after = await one('SELECT COUNT(*) AS n FROM sales_orders WHERE customer_id=?', [ctx.customerIds[0]]);
    assert.equal(Number(after.n), Number(before.n), '无效数量不能保存订单或被自动取整');
  });
  await test('ORDER-PRICE', '订单', '未填单价时引用物料销售价', async () => {
    const input = orderBody(2); input.items[0].unitPrice = 0; const d = http(await call('post', '/api/sales/orders', input), 201);
    const line = await one('SELECT unit_price,amount FROM sales_order_items WHERE order_id=?', [d.id]); evidence(line); assert.equal(Number(line.unit_price), 30);
  });
  await test('ORDER-MISSING-PRODUCT', '订单', '不存在的物料不能产生订单', async () => { const input = orderBody(); input.items[0].materialId = 99999999; reject(await call('post', '/api/sales/orders', input)); });
  await test('ORDER-CANCEL', '订单', '取消未发货订单并释放预留', async () => {
    const d = await createOrder(2); http(await call('put', `/api/sales/orders/${d.id}/status`, { newStatus: 'cancelled' }));
    const status = await one('SELECT status,is_locked FROM sales_orders WHERE id=?', [d.id]); evidence(status); assert.equal(status.status, 'cancelled');
  });
  await test('ORDER-INVALID-STATUS', '订单', '已取消订单禁止直接变成已完成', async () => { const d = await createOrder(2); http(await call('put', `/api/sales/orders/${d.id}/status`, { newStatus: 'cancelled' })); reject(await call('put', `/api/sales/orders/${d.id}/status`, { newStatus: 'completed' })); });
  await test('ORDER-UNSHIPPED', '订单', '查询订单未发货明细', async () => { const order = need(ctx.mainOrder, 'ORDER-1'); const d = http(await call('get', `/api/sales/orders/${order.id}/unshipped-items`)); evidence(d); });
  await test('ORDER-PROCUREMENT', '订单', '外购物料缺货会生成采购后续单据', async () => {
    const d = await createOrder(5, ctx.products[2]); ctx.procurementOrder = d; evidence(d);
    assert.equal(d.status, 'in_procurement');
    const docs = await rows('SELECT pr.id,pr.requisition_number,pr.status FROM purchase_requisitions pr JOIN purchase_requisition_items i ON i.requisition_id=pr.id WHERE i.material_id=?', [ctx.products[2].id]); evidence(docs); assert.ok(docs.length > 0, '没有生成采购申请');
  });
  await test('ORDER-LOCK-STATUS', '订单', '查询锁定状态', async () => { const d = need(ctx.mainOrder, 'ORDER-1'); http(await call('get', `/api/sales/orders/${d.id}/lock-status`)); });
  await test('ORDER-LOCK-VALIDATION', '订单', '缺货订单锁定不会产生虚假库存预留', async () => { const d = need(ctx.procurementOrder, 'ORDER-PROCUREMENT'); reject(await call('post', `/api/sales/orders/${d.id}/lock`, { lockReason: prefix })); });
  await test('ORDER-EDIT', '订单', '草稿订单编辑能保存数量与价税合计', async () => {
    const [result] = await db.pool.query("INSERT INTO sales_orders(order_no,customer_id,total_amount,created_by,status,delivery_date) VALUES(?,?,30,?,'draft',?)", [`${prefix}-EDIT`, ctx.customerIds[0], ctx.actorId, today]);
    ctx.editOrderId = result.insertId;
    await db.pool.query('INSERT INTO sales_order_items(order_id,material_id,quantity,unit_price,amount,tax_percent) VALUES(?,?,1,30,30,0)', [result.insertId, ctx.products[0].id]);
    const body = { customerId: ctx.customerIds[0], deliveryDate: today, status: 'draft', items: [{ material_id: ctx.products[0].id, quantity: 4, unit_price: 30, tax_percent: 0 }], remarks: prefix };
    http(await call('put', `/api/sales/orders/${result.insertId}`, body));
    const d = http(await call('get', `/api/sales/orders/${result.insertId}`)); evidence(d); assert.equal(Number(d.totalAmount), 120);
  });
  await test('ORDER-CONFIRM', '订单', '手动确认草稿订单进入备货流程', async () => { need(ctx.editOrderId, 'ORDER-EDIT'); http(await call('put', `/api/sales/orders/${ctx.editOrderId}/status`, { newStatus: 'confirmed' })); evidence(await one('SELECT status,is_locked FROM sales_orders WHERE id=?', [ctx.editOrderId])); });
  await test('ORDER-DELETE', '订单', '删除未关联单据的草稿订单', async () => {
    const [result] = await db.pool.query("INSERT INTO sales_orders(order_no,customer_id,total_amount,created_by,status) VALUES(?,?,0,?,'draft')", [`${prefix}-DELETE`, ctx.customerIds[0], ctx.actorId]);
    http(await call('delete', `/api/sales/orders/${result.insertId}`)); reject(await call('get', `/api/sales/orders/${result.insertId}`));
  });
}

async function auditOutbound() {
  await test('OUT-1', '出库', '从订单创建部分数量出库草稿', async () => {
    ctx.mainOutbound = await createOutbound(need(ctx.mainOrder, 'ORDER-1'), 6);
    const d = http(await call('get', `/api/sales/outbound/${ctx.mainOutbound.id}`)); evidence(d); assert.equal(Number(d.items[0].quantity), 6);
  });
  await test('OUT-TOTAL', '出库', '出库主表金额等于明细金额', async () => {
    const d = need(ctx.mainOutbound, 'OUT-1'); const row = await one('SELECT o.total_amount,SUM(i.amount) AS item_amount FROM sales_outbound o JOIN sales_outbound_items i ON i.outbound_id=o.id WHERE o.id=? GROUP BY o.id', [d.id]); evidence(row); assert.equal(Number(row.total_amount), Number(row.item_amount));
  });
  await test('OUT-DUPLICATE-DRAFT', '出库', '同一订单重复建草稿被拦截', async () => { reject(await call('post', '/api/sales/outbound', outboundBody(need(ctx.mainOrder, 'ORDER-1'), 1))); });
  await test('OUT-PROCESS', '出库', '出库草稿进入处理中', async () => { const d = need(ctx.mainOutbound, 'OUT-1'); http(await call('put', `/api/sales/outbound/${d.id}`, { status: 'processing' })); });
  await test('OUT-COMPLETE', '出库', '完成出库并生成待财务审核记录', async () => {
    const d = need(ctx.mainOutbound, 'OUT-1'); http(await call('put', `/api/sales/outbound/${d.id}`, { status: 'completed' }));
    ctx.mainOutboundCompleted = true;
    const doc = await one('SELECT id,finance_status FROM inventory_posting_documents WHERE source_no=? ORDER BY id DESC LIMIT 1', [d.outboundNo]); evidence(doc); assert.equal(doc.finance_status, 'pending');
    const ledger = await one('SELECT COUNT(*) AS n FROM inventory_ledger WHERE reference_no=?', [d.outboundNo]); assert.equal(Number(ledger.n), 0);
    evidence(await one('SELECT status FROM sales_orders WHERE id=?', [ctx.mainOrder.id]));
  });
  await test('OUT-IDEMPOTENT', '出库', '重复完成不重复扣库或新增过账行', async () => {
    need(ctx.mainOutboundCompleted, 'OUT-COMPLETE'); const d = ctx.mainOutbound;
    const query = 'SELECT COUNT(*) AS n FROM inventory_posting_lines WHERE reference_no=?'; const before = await one(query, [d.outboundNo]);
    const res = await call('put', `/api/sales/outbound/${d.id}`, { status: 'completed' }); http(res, [200,400,409]);
    assert.equal(Number((await one(query, [d.outboundNo])).n), Number(before.n));
  });
  await test('OUT-FINANCE', '出库', '财务审核后正式扣库并按配置生成应收', async () => {
    need(ctx.mainOutboundCompleted, 'OUT-COMPLETE'); const d = ctx.mainOutbound;
    await approveInventoryPosting(db, finance.api, d.outboundNo, { businessApi: api });
    ctx.mainOutboundApproved = true;
    const ledgers = await rows('SELECT quantity,unit_cost,total_value FROM inventory_ledger WHERE reference_no=?', [d.outboundNo]); evidence(ledgers);
    assert.equal(ledgers.reduce((sum, x) => sum + Number(x.quantity), 0), -6);
    const autoAR=await require('../src/services/system/SystemConfigService').get('auto_generate_ar_invoice',false);evidence({autoGenerateAR:autoAR});
    if(!autoAR) return;
    const deadline = Date.now() + 6000; let invoice;
    do { invoice = await one("SELECT id,total_amount,customer_id FROM ar_invoices WHERE source_type='sales_outbound' AND source_id=?", [d.id]); if (invoice) break; await new Promise(resolve => setTimeout(resolve, 150)); } while (Date.now() < deadline);
    evidence(invoice || null); assert.ok(invoice, '财务审核后未找到关联应收'); assert.equal(Number(invoice.total_amount), 180);
  });
  await test('OUT-AR-MANUAL','出库','手工从已审核出库生成应收、凭证且可幂等重试',async()=>{
    need(ctx.mainOutboundApproved,'OUT-FINANCE');const d=ctx.mainOutbound;
    http(await call('post',`/api/finance/integration/ar-invoice-from-outbound/${d.id}`,{},finance.api),[200,201]);
    const invoice=await one("SELECT id,invoice_number,total_amount FROM ar_invoices WHERE source_type='sales_outbound' AND source_id=?",[d.id]);evidence(invoice);assert.ok(invoice);assert.equal(Number(invoice.total_amount),180);
    http(await call('post',`/api/finance/integration/ar-invoice-from-outbound/${d.id}`,{},finance.api),[200,201,409]);
    assert.equal(Number((await one("SELECT COUNT(*) AS n FROM ar_invoices WHERE source_type='sales_outbound' AND source_id=?",[d.id])).n),1);
    const gl=await rows('SELECT id,document_number FROM gl_entries WHERE document_number=?',[invoice.invoice_number]);evidence(gl);assert.ok(gl.length>0);
  });
  await test('OUT-IMMUTABLE', '出库', '已完成出库不能直接重写数量', async () => {
    need(ctx.mainOutboundCompleted, 'OUT-COMPLETE'); const d = ctx.mainOutbound;
    reject(await call('put', `/api/sales/outbound/${d.id}`, { ...outboundBody(ctx.mainOrder, 2), status: 'completed' }));
  });
  await test('OUT-OVER', '出库', '提交处理时禁止数量超过订单未发货量', async () => { const order = await createOrder(5); const d = await createOutbound(order, 6); reject(await call('put', `/api/sales/outbound/${d.id}`, {status:'processing'})); });
  await test('OUT-OVER-DUPLICATE-LINES', '出库', '提交处理时同物料拆成多行不能绕过超发校验', async () => {
    const order = await createOrder(5); const input = outboundBody(order, 3); input.items.push({ ...input.items[0] });
    const d=http(await call('post', '/api/sales/outbound', input),201); reject(await call('put', `/api/sales/outbound/${d.id}`, {status:'processing'}));
  });
  await test('OUT-ZERO', '出库', '提交处理时禁止零数量出库', async () => { const order = await createOrder(5); const d=await createOutbound(order,0); reject(await call('put', `/api/sales/outbound/${d.id}`, {status:'processing'})); });
  await test('OUT-WRONG-PRODUCT', '出库', '提交处理时禁止出库不属于来源订单的物料', async () => { const order = await createOrder(5); const d=await createOutbound(order,1,ctx.products[1]); reject(await call('put', `/api/sales/outbound/${d.id}`, {status:'processing'})); });
  await test('OUT-CANCEL', '出库', '出库草稿可取消', async () => {
    const order = await createOrder(5); const d = await createOutbound(order, 2); http(await call('put', `/api/sales/outbound/${d.id}`, { status: 'cancelled' })); assert.equal((await one('SELECT status FROM sales_outbound WHERE id=?',[d.id])).status,'cancelled');
  });
  await test('OUT-DELETE', '出库', '出库草稿可直接删除', async () => { const order=await createOrder(5);const d=await createOutbound(order,2);http(await call('delete',`/api/sales/outbound/${d.id}`)); });
  await test('OUT-MULTI', '出库', '多订单同物料出库保留来源并冻结全部数量', async () => {
    const a = await createOrder(4), b = await createOrder(5);
    const d = http(await call('post', '/api/sales/outbound', { isMultiOrder: true, relatedOrders: [a.id, b.id], deliveryDate: today, remarks: prefix,
      items: [{ productId: ctx.products[0].id, quantity: 2, sourceOrderId: a.id, sourceOrderNo: a.orderNo }, { productId: ctx.products[0].id, quantity: 3, sourceOrderId: b.id, sourceOrderNo: b.orderNo }] }), 201);
    ctx.multiOutboundId = d.id;
    http(await call('put', `/api/sales/outbound/${d.id}`, { status: 'processing' })); http(await call('put', `/api/sales/outbound/${d.id}`, { status: 'completed' }));
    const row = await one('SELECT o.outbound_no,SUM(l.signed_quantity) AS quantity,COUNT(l.id) AS n FROM sales_outbound o JOIN inventory_posting_lines l ON l.reference_no=o.outbound_no WHERE o.id=? GROUP BY o.id', [d.id]); evidence(row); assert.equal(Number(row?.quantity), -5);
  });
  await test('OUT-MATERIAL-HISTORY', '出库', '物料销售历史查询', async () => { http(await call('get', `/api/sales/outbound/material/${ctx.products[0].id}`)); });
  await test('DELIVERY-DETAIL', '交付', '订单交付明细反映已完成出库', async () => { const d = need(ctx.mainOrder, 'ORDER-1'); evidence(http(await call('get', `/api/sales/delivery-stats/orders/${d.id}`))); });
  await test('OUT-REVERSE', '出库', '已财务审核出库可以反审核并生成冲销过账', async () => {
    const order = await createOrder(3); const d = await createOutbound(order, 3);
    http(await call('put', `/api/sales/outbound/${d.id}`, { status: 'processing' })); http(await call('put', `/api/sales/outbound/${d.id}`, { status: 'completed' }));
    await approveInventoryPosting(db, finance.api, d.outboundNo);
    reject(await call('post', `/api/sales/outbound/${d.id}/reverse`, { reason: `${prefix} reversal` }));
    const reversal=http(await call('post', `/api/sales/outbound/${d.id}/reverse`, { reason: `${prefix} reversal` },reversalReviewer));
    evidence(reversal); assert.equal((await one('SELECT status FROM sales_outbound WHERE id=?',[d.id])).status,'completed');
    http(await call('post',`/api/finance/inventory-postings/${reversal.reversalDocumentId}/approve`,{},reversalFinance.api));
    const row = await one('SELECT status FROM sales_outbound WHERE id=?', [d.id]); evidence(row); assert.equal(row.status, 'reversed');
    evidence(await rows('SELECT id,posting_kind,finance_status FROM inventory_posting_documents WHERE source_no=?', [d.outboundNo]));
    ctx.reversedOutbound = d;
  });
}

async function auditReturns() {
  await test('RETURN-CREATE-CAMEL', '退货', '对已出库订单创建退货（标准 camelCase）', async () => {
    need(ctx.mainOutboundCompleted, 'OUT-COMPLETE');
    ctx.returnInput = { orderId: ctx.mainOrder.id, outboundId: ctx.mainOutbound.id, returnDate: today, returnReason: '质量退货', status: 'pending', remarks: prefix, items: [{ productId: ctx.products[0].id, quantity: 1, reason: 'audit' }] };
    ctx.createdReturn = http(await call('post', '/api/sales/returns', ctx.returnInput), 201);
  });
  await test('RETURN-CREATE-UI', '退货', '按修复后的页面字段提交退货', async () => {
    need(ctx.mainOutboundCompleted, 'OUT-COMPLETE');
    ctx.uiReturn = http(await call('post', '/api/sales/returns', {
      outboundId: ctx.mainOutbound.id, orderId: ctx.mainOrder.id, returnDate: today, returnReason: '质量退货',
      remarks: prefix, items: [{ productId: ctx.products[0].id, quantity: 1, reason: '' }],
    }), 201);
  });
  await test('RETURN-STATUS-FIXTURE', '退货', '独立退货样本通过真实创建、审批与完成接口', async () => {
    const r = http(await call('post', '/api/sales/returns', ctx.returnInput), 201);
    ctx.returnFixtureId = r.id; ctx.returnFixtureNo = r.returnNo;
    http(await call('put', `/api/sales/returns/${r.id}/status`, { status: 'approved' }));
    http(await call('put', `/api/sales/returns/${r.id}/status`, { status: 'completed' }));
    ctx.returnCompleted = true;
  });
  await test('RETURN-DETAIL', '退货', '读取退货详情和关联明细', async () => { need(ctx.returnFixtureId, 'RETURN-STATUS-FIXTURE'); const d = http(await call('get', `/api/sales/returns/${ctx.returnFixtureId}`)); evidence(d); assert.equal(d.items.length, 1); });
  await test('RETURN-EDIT', '退货', '编辑待审批退货保持明细；已完成退货禁止重写', async () => {
    const id = need(ctx.createdReturn?.id, 'RETURN-CREATE-CAMEL');
    http(await call('put', `/api/sales/returns/${id}`, { ...ctx.returnInput, returnReason: 'updated' }));
    const d = http(await call('get', `/api/sales/returns/${id}`));
    assert.equal(d.items.length, 1); assert.equal(Number(d.items[0].quantity), 1);
    reject(await call('put', `/api/sales/returns/${ctx.returnFixtureId}`, { ...ctx.returnInput, status: 'completed' }));
  });
  await test('RETURN-INVALID', '退货', '已审批退货禁止返回待审批', async () => { need(ctx.returnFixtureId, 'RETURN-STATUS-FIXTURE'); reject(await call('put', `/api/sales/returns/${ctx.returnFixtureId}/status`, { status: 'pending' })); });
  await test('RETURN-DELETE', '退货', '未完成退货取消后可删除', async () => {
    const id = need(ctx.uiReturn?.id, 'RETURN-CREATE-UI');
    http(await call('put', `/api/sales/returns/${id}/status`, { status: 'cancelled' }));
    http(await call('delete', `/api/sales/returns/${id}`));
  });
  await test('RETURN-FINANCE', '退货', '退货库存回补、红字应收和凭证（兼容自动关闭，手工幂等）', async () => {
    need(ctx.returnCompleted, 'RETURN-STATUS-FIXTURE');
    const posting = await one('SELECT finance_status FROM inventory_posting_documents WHERE source_no=? ORDER BY id DESC LIMIT 1', [ctx.returnFixtureNo]);
    if (posting.finance_status !== 'approved') {
      reject(await call('post', `/api/finance/integration/ar-credit-note-from-return/${ctx.returnFixtureId}`, {}, finance.api));
      await approveInventoryPosting(db, finance.api, ctx.returnFixtureNo, { businessApi: api });
    }
    const inventory = await one('SELECT SUM(quantity) AS quantity FROM inventory_ledger WHERE reference_no=?', [ctx.returnFixtureNo]);
    assert.equal(Number(inventory.quantity), 1);
    http(await call('post', `/api/finance/integration/ar-credit-note-from-return/${ctx.returnFixtureId}`, {}, finance.api));
    const invoice = await eventually(() => one("SELECT id,invoice_number,total_amount FROM ar_invoices WHERE source_type='sales_return' AND source_id=?", [ctx.returnFixtureId]), Boolean, '没有生成红字应收');
    evidence({ inventory, invoice }); assert.equal(Number(invoice.total_amount), -30);
    http(await call('post', `/api/finance/integration/ar-credit-note-from-return/${ctx.returnFixtureId}`, {}, finance.api));
    assert.equal(Number((await one("SELECT COUNT(*) AS n FROM ar_invoices WHERE source_type='sales_return' AND source_id=?", [ctx.returnFixtureId])).n), 1);
    const gl = await rows('SELECT id FROM gl_entries WHERE document_number=?', [invoice.invoice_number]);
    evidence(gl); assert.equal(gl.length, 1);
  });
  await test('RETURN-FINANCE-AUTO', '退货', '自动红字应收开启后只在财审通过时生成一次', async () => {
    const config = require('../src/services/system/SystemConfigService');
    const original = await config.get('auto_generate_ar_credit_note', false);
    try {
      assert.equal(await config.set('auto_generate_ar_credit_note', true, 'boolean'), true);
      const order = await createShippedOrder(2);
      const returned = http(await call('post', '/api/sales/returns', { ...ctx.returnInput, orderId: order.id, outboundId: null }), 201);
      http(await call('put', `/api/sales/returns/${returned.id}/status`, { status: 'approved' }));
      http(await call('put', `/api/sales/returns/${returned.id}/status`, { status: 'completed' }));
      assert.equal(Number((await one("SELECT COUNT(*) AS n FROM ar_invoices WHERE source_type='sales_return' AND source_id=?", [returned.id])).n), 0);
      await approveInventoryPosting(db, finance.api, returned.returnNo, { businessApi: api });
      const invoice = await eventually(() => one("SELECT id,invoice_number,total_amount FROM ar_invoices WHERE source_type='sales_return' AND source_id=?", [returned.id]), Boolean, '自动红字应收未生成');
      evidence(invoice); assert.equal(Number(invoice.total_amount), -30);
    } finally {
      await config.set('auto_generate_ar_credit_note', original, 'boolean');
    }
  });
}

async function auditQuotes() {
  await test('QUOTE-CREATE', '报价', '创建报价并保存金额', async () => { ctx.quote = await createQuote(); const d = http(await call('get', `/api/sales/quotations/${ctx.quote.id}`)); evidence(d); assert.equal(Number(d.totalAmount), 90); });
  await test('QUOTE-EDIT', '报价', '编辑报价数量和金额', async () => { need(ctx.quote, 'QUOTE-CREATE'); http(await call('put', `/api/sales/quotations/${ctx.quote.id}`, quoteBody('draft', 4))); const d = http(await call('get', `/api/sales/quotations/${ctx.quote.id}`)); assert.equal(Number(d.totalAmount), 120); });
  await test('QUOTE-CONFIRM-UI', '报价', '按页面的详情回传方式确认报价', async () => {
    const quote = await createQuote(); const d = http(await call('get', `/api/sales/quotations/${quote.id}`));
    http(await call('put', `/api/sales/quotations/${quote.id}`, { quotation: { customer_id: d.customerId, validity_date: d.validityDate, status: 'accepted', remarks: d.remarks }, items: d.items }));
  });
  await test('QUOTE-CONVERT-API', '报价', '已确认报价通过专用转换接口生成一张订单', async () => {
    const quote = await createQuote('accepted'); ctx.convertedQuote = quote;
    const before = await one('SELECT COUNT(*) AS n FROM sales_orders WHERE quotation_id=?', [quote.id]);
    const d = http(await call('post', `/api/sales/quotations/${quote.id}/convert`, {})); evidence(d);
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM sales_orders WHERE quotation_id=?', [quote.id])).n), Number(before.n) + 1);
    const repeated = http(await call('post', `/api/sales/quotations/${quote.id}/convert`, {})); assert.equal(repeated.orderId, d.orderId); assert.equal(Number((await one('SELECT COUNT(*) AS n FROM sales_orders WHERE quotation_id=?', [quote.id])).n), 1);
  });
  await test('QUOTE-CONVERT-UI', '报价', '页面转订单只调用权威转换接口并只创建一张订单', async () => {
    const quote = await createQuote('accepted');
    const before = await one('SELECT COUNT(*) AS n FROM sales_orders WHERE customer_id=?', [ctx.customerIds[0]]);
    http(await call('post', `/api/sales/quotations/${quote.id}/convert`, {}));
    const after = await one('SELECT COUNT(*) AS n FROM sales_orders WHERE customer_id=?', [ctx.customerIds[0]]);
    evidence({ createdOrders: Number(after.n)-Number(before.n) }); assert.equal(Number(after.n)-Number(before.n),1);
  });
  await test('QUOTE-CONVERT-STATE', '报价', '转换后返回页面可识别的已转订单状态', async () => {
    const q = need(ctx.convertedQuote, 'QUOTE-CONVERT-API'); const d = http(await call('get', `/api/sales/quotations/${q.id}`)); evidence({ status: d.status }); assert.equal(d.status, 'converted', '页面的已转订单筛选使用 converted');
  });
  await test('QUOTE-RECONVERT', '报价', '已转换报价不能重新确认并再次生成订单', async () => {
    const q = need(ctx.convertedQuote, 'QUOTE-CONVERT-API'); const result = await call('put', `/api/sales/quotations/${q.id}`, quoteBody('accepted'));
    if (result.status < 400) reject(await call('post', `/api/sales/quotations/${q.id}/convert`, {})); else reject(result);
  });
  await test('QUOTE-DELETE', '报价', '删除草稿报价', async () => { const q = await createQuote(); http(await call('delete', `/api/sales/quotations/${q.id}`)); reject(await call('get', `/api/sales/quotations/${q.id}`)); });
  await test('QUOTE-ZERO', '报价', '拒绝零数量报价', async () => { reject(await call('post', '/api/sales/quotations', quoteBody('draft', 0))); });
  await test('QUOTE-EMPTY', '报价', '拒绝没有明细的报价', async () => { reject(await call('post', '/api/sales/quotations', { ...quoteBody(), items: [] })); });
}

async function auditExchanges() {
  await test('EX-CREATE', '换货', '创建换货单计算退回和换出差额', async () => {
    ctx.exchangeOrder = await createShippedOrder(10); ctx.exchangeInput = exchangeBody(ctx.exchangeOrder);
    ctx.exchange = http(await call('post', '/api/sales/exchanges', ctx.exchangeInput), 201);
    const d = http(await call('get', `/api/sales/exchanges/${ctx.exchange.id}`)); evidence(d); assert.equal(Number(d.differenceAmount), -10);
  });
  await test('EX-STATUS-UI', '换货', '修复后的页面处理按钮只提交状态并保留明细', async () => {
    const e = need(ctx.exchange, 'EX-CREATE');
    http(await call('put', `/api/sales/exchanges/${e.id}/status`, { status: 'processing' }));
    const d = http(await call('get', `/api/sales/exchanges/${e.id}`));
    assert.equal(d.items.length,2); assert.equal(d.status,'processing');
  });
  await test('EX-STATUS-API', '换货', '接口英文状态可以开始处理并完成换货', async () => {
    const e = need(ctx.exchange, 'EX-CREATE'); http(await call('put', `/api/sales/exchanges/${e.id}/status`, { status: 'processing' }));
    http(await call('put', `/api/sales/exchanges/${e.id}/status`, { status: 'completed' }));
    ctx.exchangeCompleted = true;
    evidence(await rows('SELECT transaction_type,signed_quantity,material_id FROM inventory_posting_lines WHERE reference_no=?', [e.exchangeNo]));
  });
  await test('EX-REPEAT', '换货', '重复完成换货不会重复生成库存记录', async () => {
    need(ctx.exchangeCompleted, 'EX-STATUS-API'); const id = ctx.exchange.id;
    const sql = 'SELECT COUNT(*) AS n FROM inventory_posting_lines WHERE reference_no=?';
    const before = await one(sql, [ctx.exchange.exchangeNo]); const r = await call('put', `/api/sales/exchanges/${id}/status`, { status: 'completed' }); http(r, [200,400,409]); assert.equal(Number((await one(sql,[ctx.exchange.exchangeNo])).n), Number(before.n));
  });
  await test('EX-EDIT-NEW-FORMAT', '换货', '编辑时保留分别填写的退回商品和换出商品', async () => {
    const order = await createShippedOrder(10); const body = exchangeBody(order); const e = http(await call('post', '/api/sales/exchanges', body), 201);
    http(await call('put', `/api/sales/exchanges/${e.id}`, { ...body, remark: `${prefix} edited`, status: '待处理' }));
    const detail = await rows('SELECT item_type,quantity FROM sales_exchange_items WHERE exchange_id=?', [e.id]); evidence(detail); assert.equal(detail.length, 2);
  });
  await test('EX-NO-SOURCE', '换货', '不存在的原订单不能建立有效换货', async () => { reject(await call('post', '/api/sales/exchanges', exchangeBody({ orderNo: `${prefix}-NOT-EXIST` }))); });
  await test('EX-ZERO', '换货', '禁止零数量换货', async () => { reject(await call('post', '/api/sales/exchanges', exchangeBody(need(ctx.exchangeOrder,'EX-CREATE'), 'audit', 0))); });
  await test('EX-NEGATIVE', '换货', '禁止负数量换货', async () => { reject(await call('post', '/api/sales/exchanges', exchangeBody(need(ctx.exchangeOrder,'EX-CREATE'), 'audit', -2))); });
  await test('EX-OVER', '换货', '不能退回超过原订单购买数量的商品', async () => { reject(await call('post', '/api/sales/exchanges', exchangeBody(need(ctx.exchangeOrder,'EX-CREATE'), 'audit', 20))); });
  await test('EX-REASON', '换货', '填写原因不会在未审批时触发库存变动', async () => {
    const e = http(await call('post', '/api/sales/exchanges', exchangeBody(need(ctx.exchangeOrder,'EX-CREATE'), '已完成')), 201);
    const state = await one('SELECT status,exchange_no FROM sales_exchanges WHERE id=?', [e.id]);
    const posting = await one('SELECT COUNT(*) AS n FROM inventory_posting_documents WHERE source_no=?', [state.exchange_no]); evidence({ ...state, postings: Number(posting.n) }); assert.equal(Number(posting.n), 0);
  });
  await test('EX-DELETE', '换货', '删除未处理换货单', async () => { const e = http(await call('post', '/api/sales/exchanges', exchangeBody(ctx.exchangeOrder)), 201); http(await call('delete', `/api/sales/exchanges/${e.id}`)); });
}

async function auditPacking() {
  await test('PACK-CREATE', '装箱', '新建装箱单并汇总箱数、数量', async () => { const order = await createOrder(10); ctx.packBody = packingBody(order); ctx.packing = http(await call('post', '/api/sales/packing-lists', ctx.packBody), 201); const d = http(await call('get', `/api/sales/packing-lists/${ctx.packing.id}`)); assert.equal(Number(d.totalBoxes),2); assert.equal(Number(d.totalQuantity),5); });
  await test('PACK-EDIT', '装箱', '编辑草稿装箱单数量', async () => { const p=need(ctx.packing,'PACK-CREATE'); ctx.packBody.details[0].quantity=4; http(await call('put', `/api/sales/packing-lists/${p.id}`, ctx.packBody)); const d=http(await call('get', `/api/sales/packing-lists/${p.id}`)); assert.equal(Number(d.totalQuantity),7); });
  await test('PACK-FLOW', '装箱', '确认、装箱中、完成完整状态流程', async () => { const p=need(ctx.packing,'PACK-CREATE'); for(const status of ['confirmed','packing','completed']) http(await call('patch', `/api/sales/packing-lists/${p.id}/status`, {status})); });
  await test('PACK-IMMUTABLE', '装箱', '已完成装箱单禁止修改', async () => { const p=need(ctx.packing,'PACK-CREATE'); reject(await call('put', `/api/sales/packing-lists/${p.id}`, ctx.packBody)); });
  await test('PACK-CUSTOMER', '装箱', '拒绝关联其他客户订单', async () => { reject(await call('post','/api/sales/packing-lists',{...ctx.packBody,customerId:ctx.customerIds[1]})); });
  await test('PACK-ZERO', '装箱', '禁止零数量装箱', async () => { reject(await call('post','/api/sales/packing-lists',{...ctx.packBody, details:[{...ctx.packBody.details[0],quantity:0}]})); });
  await test('PACK-DELETE', '装箱', '草稿装箱单可以删除', async () => { const p=http(await call('post','/api/sales/packing-lists',ctx.packBody),201); http(await call('delete',`/api/sales/packing-lists/${p.id}`)); });
}

async function auditContracts() {
  await test('CONTRACT-CREATE-UI', '合同', '合同页面填写中文表单后可以保存', async () => { http(await call('post','/api/contracts',{name:`${prefix} 页面销售合同`,type:'sales',total_amount:0,partyA:'Audit ERP',partyB:`${prefix}-Customer-A`,totalAmount:300,effectiveDate:today,expiryDate:calendar.validityDate,paymentTerms:'30天'}),[200,201]); });
  await test('CONTRACT-CREATE-API', '合同', '按后端字段创建销售合同', async () => { ctx.contract=http(await call('post','/api/contracts',contractBody()),[200,201]); assert.ok(ctx.contract.id); assert.equal(Number(ctx.contract.totalAmount),300); });
  await test('CONTRACT-DETAIL', '合同', '合同详情包含明细及执行记录', async () => { const c=need(ctx.contract,'CONTRACT-CREATE-API'); const d=http(await call('get',`/api/contracts/${c.id}`)); assert.equal(d.items.length,1); assert.ok(Array.isArray(d.executions)); });
  await test('CONTRACT-EDIT-API', '合同', '编辑草稿合同', async () => { const c=need(ctx.contract,'CONTRACT-CREATE-API'); http(await call('put',`/api/contracts/${c.id}`,{...contractBody(),name:`${prefix} 修改销售合同`})); });
  await test('CONTRACT-EDIT-UI', '合同', '页面详情字段直接回传编辑能保存', async () => { const c=need(ctx.contract,'CONTRACT-CREATE-API'); const d=http(await call('get',`/api/contracts/${c.id}`)); http(await call('put',`/api/contracts/${c.id}`,{...d,name:`${prefix} UI修改`})); });
  await test('CONTRACT-SUBMIT', '合同', '合同提交审批并成功启动工作流', async () => { const c=need(ctx.contract,'CONTRACT-CREATE-API'); const d=http(await call('put',`/api/contracts/${c.id}/status`,{status:'pending_approval'})); evidence(d); assert.ok(['pending_approval','active'].includes(d.status)); ctx.contractSubmitted=true; });
  await test('CONTRACT-DIRECT-APPROVAL', '合同', '直接绕过工作流审批返回业务错误', async () => { const c=need(ctx.contract,'CONTRACT-CREATE-API'); reject(await call('put',`/api/contracts/${c.id}/status`,{status:'active'})); });
  await test('CONTRACT-CANCEL', '合同', '合同草稿可以按服务允许的流程取消', async () => { const c=http(await call('post','/api/contracts',contractBody()),[200,201]); http(await call('put',`/api/contracts/${c.id}/status`,{status:'cancelled'})); });
  await test('CONTRACT-EXECUTION', '合同', '审批中禁止执行及删除；审批通过后记录真实订单', async () => {
    const c = need(ctx.contract, 'CONTRACT-CREATE-API');
    const execution = { executionType: 'order', businessId: ctx.mainOrder.id, businessCode: ctx.mainOrder.orderNo, amount: 300 };
    reject(await call('post', `/api/contracts/${c.id}/executions`, execution));
    reject(await call('delete', `/api/contracts/${c.id}`));
    await approveContractForAudit(c.id);
    const d = http(await call('post', `/api/contracts/${c.id}/executions`, execution));
    assert.equal(Number(d.executedAmount),300);
  });
  await test('CONTRACT-EXECUTION-DUPLICATE', '合同', '同一订单不能重复累计合同执行额', async () => { const c=need(ctx.contract,'CONTRACT-CREATE-API'); const r=await call('post',`/api/contracts/${c.id}/executions`,{execution_type:'order',business_id:ctx.mainOrder.id,business_code:ctx.mainOrder.orderNo,amount:300}); if(r.status<400){const d=dataOf(r); evidence(d); assert.equal(Number(d.executedAmount),300);}else reject(r); });
  await test('CONTRACT-DELETE-DRAFT', '合同', '合同草稿可删除', async () => { const c=http(await call('post','/api/contracts',contractBody()),[200,201]); http(await call('delete',`/api/contracts/${c.id}`)); reject(await call('get',`/api/contracts/${c.id}`)); });
  await test('CONTRACT-DELETE-SUBMITTED', '合同', '审批中或已生效合同禁止直接删除', async () => { need(ctx.contractSubmitted,'CONTRACT-SUBMIT'); reject(await call('delete',`/api/contracts/${ctx.contract.id}`)); });
}

async function auditRemainingFlows() {
  const customerBody = {
    code: `${prefix}-API-${Date.now() % 1000000}`, name: `${prefix}-Customer-API`,
    contactPerson: prefix, phone: '13900000000', email: 'sales-audit@example.invalid',
    address: 'Sales audit isolated fixture', status: 1,
  };
  await test('CUSTOMER-CREATE', '基础选择', '销售客户接口支持完整客户资料新增', async () => {
    const created = http(await call('post', '/api/sales/customers', customerBody), [200, 201]);
    const persisted = await one('SELECT code,name FROM customers WHERE id=?', [created.id]);
    evidence(persisted);
    assert.equal(persisted.code, customerBody.code);
    assert.equal(persisted.name, customerBody.name);
  });
  await test('CUSTOMER-EDIT', '基础选择', '销售客户接口修改并读取联系方式', async () => {
    const body = { ...customerBody, code: `${prefix}-B`, name: `${prefix}-Customer-B`, contactPerson: `${prefix} edited`, phone: '13800000001' };
    http(await call('put', `/api/sales/customers/${ctx.customerIds[1]}`, body));
    const persisted = await one('SELECT name,contact_person,phone,address FROM customers WHERE id=?', [ctx.customerIds[1]]);
    evidence(persisted);
    assert.equal(persisted.contact_person, body.contactPerson);
    assert.equal(persisted.address, body.address);
    const detail = http(await call('get', `/api/sales/customers/${ctx.customerIds[1]}`));
    assert.equal(detail.phone, body.phone);
  });
  async function submittedContract(suffix) {
    const contract = http(await call('post', '/api/contracts', {
      ...contractBody(), name: `${prefix} ${suffix}`,
    }), [200, 201]);
    const submitted = http(await call('put', `/api/contracts/${contract.id}/status`, { status: 'pending_approval' }));
    return submitted;
  }
  async function activeContract(suffix) {
    let contract = await submittedContract(suffix);
    // A separate synthetic administrator exercises the existing approval API.
    // No workflow assignments, approval rules or business statuses are patched.
    for (let step = 0; contract.status === 'pending_approval' && step < 12; step += 1) {
      const instance = http(await call('get', `/api/workflow/instances/${contract.workflowInstanceId}`));
      const nodeId = need(instance.currentNodeId, '审批流程当前节点');
      const approved = http(await call('post', `/api/workflow/instances/${contract.workflowInstanceId}/approve`, {
        nodeId, action: 'approve', comment: `${prefix} isolated audit approval`,
      }, reversalReviewer));
      if (approved.status === 'in_progress' && approved.currentNodeId === nodeId) {
        need(false, '会签仍需指定审批人处理，管理员操作未跳过会签');
      }
      contract = http(await call('get', `/api/contracts/${contract.id}`));
    }
    assert.equal(contract.status, 'active');
    return contract;
  }
  await test('CONTRACT-LIFECYCLE', '合同', '销售合同生效、执行并履约完成', async () => {
    const contract = await activeContract('lifecycle');
    let detail = http(await call('put', `/api/contracts/${contract.id}/status`, { status: 'executing' }));
    assert.equal(detail.status, 'executing');
    const order = await createOrder(10);
    detail = http(await call('post', `/api/contracts/${contract.id}/executions`, {
      execution_type: 'order', business_id: order.id, business_code: order.orderNo, amount: 300,
    }));
    assert.equal(Number(detail.executedAmount), 300);
    detail = http(await call('put', `/api/contracts/${contract.id}/status`, { status: 'completed' }));
    evidence({ id: contract.id, status: detail.status, executedAmount: detail.executedAmount });
    assert.equal(detail.status, 'completed');
  });
  await test('CONTRACT-TERMINATE', '合同', '已生效销售合同可终止', async () => {
    const contract = await activeContract('terminate');
    const detail = http(await call('put', `/api/contracts/${contract.id}/status`, { status: 'terminated' }));
    evidence({ id: contract.id, status: detail.status });
    assert.equal(detail.status, 'terminated');
  });
  await test('CONTRACT-WORKFLOW-REJECT', '合同', '审批拒绝使合同退回草稿并保留拒绝记录', async () => {
    const contract = await submittedContract('reject');
    need(contract.workflowInstanceId, '已配置合同审批流程');
    const instance = http(await call('get', `/api/workflow/instances/${contract.workflowInstanceId}`));
    const rejected = http(await call('post', `/api/workflow/instances/${contract.workflowInstanceId}/approve`, {
      nodeId: instance.currentNodeId, action: 'reject', comment: `${prefix} isolated audit rejection`,
    }, reversalReviewer));
    const detail = http(await call('get', `/api/contracts/${contract.id}`));
    evidence({ id: contract.id, status: detail.status, workflowStatus: detail.workflowStatus });
    assert.equal(rejected.status, 'rejected');
    assert.equal(detail.status, 'draft');
    assert.equal(detail.workflowStatus, 'rejected');
  });
  await test('CONTRACT-WORKFLOW-WITHDRAW', '合同', '发起人撤回审批后合同返回草稿', async () => {
    const contract = await submittedContract('withdraw');
    need(contract.workflowInstanceId, '已配置合同审批流程');
    http(await call('post', `/api/workflow/instances/${contract.workflowInstanceId}/withdraw`, {}));
    const detail = http(await call('get', `/api/contracts/${contract.id}`));
    evidence({ id: contract.id, status: detail.status, workflowStatus: detail.workflowStatus });
    assert.equal(detail.status, 'draft');
    assert.equal(detail.workflowStatus, 'withdrawn');
  });
}

async function auditCsvExports() {
  const vm = require('node:vm');
  const { Readable } = require('node:stream');
  const ExcelJS = require('exceljs');
  async function runExport(component, records, fileName) {
    const sourcePath = path.join(__dirname, '../../frontend/src/views/sales', component);
    const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');
    const start = source.indexOf('const handleExport = () => {');
    assert.ok(start >= 0, 'Export handler must exist in the actual component');
    const end = source.indexOf('\n}\n', start);
    assert.ok(end > start, 'Export handler must have a complete body');
    let blob, clicked = false;
    const messages = [];
    const context = {
      tableData: { value: records }, selectedRows: { value: records }, Blob, Date,
      formatDate: value => String(value || '').slice(0, 10),
      getStatusText: value => String(value || ''), getStatusLabel: value => String(value || ''),
      window: { URL: { createObjectURL: value => { blob = value; return 'blob:sales-audit-only'; }, revokeObjectURL() {} } },
      document: { createElement: () => ({ click() { clicked = true; } }), body: { appendChild() {}, removeChild() {} } },
      ElMessage: { success: value => messages.push(value), warning: value => messages.push(value), error: value => messages.push(value) },
      console: { error: value => messages.push(String(value)) },
    };
    // Execute the unchanged component handler with DOM/download adapters. This
    // verifies generated bytes; the real browser save-to-disk path is separate.
    vm.runInNewContext(`${source.slice(start, end + 2)}\nhandleExport();`, context, { timeout: 1000 });
    assert.ok(clicked && blob, 'The handler must create a CSV download');
    const bytes = Buffer.from(await blob.arrayBuffer());
    fs.writeFileSync(path.join(outDir, fileName), bytes);
    const workbook = new ExcelJS.Workbook();
    const sheet = await workbook.csv.read(Readable.from([bytes]));
    evidence({ component, method: 'actual handler with DOM adapters', bytes: bytes.length, messages, header: sheet.getRow(1).values, firstRow: sheet.getRow(2).values });
    return sheet;
  }
  await test('IO-DELIVERY-CSV', '导入导出', '配送导出保留实际产品名称和订单数量', async () => {
    const result = http(await call('get', `/api/sales/delivery-stats?orderId=${ctx.mainOrder.id}&pageSize=5`));
    const row = need(result.list?.[0], '配送统计测试行');
    const sheet = await runExport('DeliveryStats.vue', [row], 'delivery-export-audit.csv');
    assert.deepEqual([sheet.getRow(2).getCell(3).value, sheet.getRow(2).getCell(4).value],
      [row.materialName, Number(row.orderedQuantity)], 'CSV产品名称和订单数量必须与列表一致');
  });
  await test('IO-PACK-CSV', '导入导出', '装箱单CSV保留数量并正确转义逗号、引号和换行', async () => {
    const detail = http(await call('get', `/api/sales/packing-lists/${ctx.packing.id}`));
    const record = { ...detail, customerName: 'Audit, "customer"', remark: 'Line 1\nLine 2, "quoted"' };
    const sheet = await runExport('PackingLists.vue', [record], 'packing-export-audit.csv');
    const row = sheet.getRow(2);
    assert.equal(row.getCell(2).value, record.customerName);
    assert.equal(Number(row.getCell(5).value), Number(record.totalQuantity));
    assert.equal(row.getCell(7).value, record.remark);
    assert.equal(sheet.rowCount, 2);
  });
}

async function auditImportExportAndEdges() {
  const ExcelJS=require('exceljs');
  const binaryParser=(res,callback)=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>callback(null,Buffer.concat(chunks)));};
  async function workbookRequest(url,method='get',body) {
    const res=await api[method](url,body).buffer(true).parse(binaryParser);
    current.requests.push({method:method.toUpperCase(),url,status:res.status,bytes:res.body?.length});
    assert.equal(res.status,200); const w=new ExcelJS.Workbook();await w.xlsx.load(res.body);return w;
  }
  async function importWorkbook(records) {
    const w=new ExcelJS.Workbook(),sheet=w.addWorksheet('销售订单');
    const headers=['客户编码','合同编码','产品编码','产品规格','数量','单价','交货日期','备注'];sheet.addRow(headers);
    for(const record of records) sheet.addRow(headers.map(h=>record[h] ?? ''));
    const bytes=await w.xlsx.writeBuffer();
    const res=await api.post('/api/sales/orders/import').unset('Content-Type').attach('file',Buffer.from(bytes),{filename:`${prefix}.xlsx`,contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    current.requests.push({method:'POST',url:'/api/sales/orders/import',body:records,status:res.status,response:summary(res.body)});return res;
  }
  const importRow=(suffix='IMPORT')=>({'客户编码':`${prefix}-A`,'合同编码':`${prefix}-${suffix}`,'产品编码':ctx.products[0].code,'数量':2,'单价':30,'交货日期':today,'备注':prefix});
  await test('IO-TEMPLATE','导入导出','导入模板可以下载且含必需字段',async()=>{const w=await workbookRequest('/api/sales/orders/template');const headers=w.worksheets[0].getRow(1).values;evidence(headers);assert.ok(headers.includes('客户编码'));assert.ok(headers.includes('产品编码'));assert.ok(headers.includes('数量'));});
  await test('IO-EXPORT','导入导出','订单按客户关键字导出为有效 Excel',async()=>{const w=await workbookRequest('/api/sales/orders/export','post',{search:prefix});evidence({sheets:w.worksheets.length,rows:w.worksheets[0].rowCount});assert.ok(w.worksheets[0].rowCount>1);});
  await test('IO-IMPORT','导入导出','有效 Excel 导入订单及明细',async()=>{const d=http(await importWorkbook([importRow()]));evidence(d);assert.equal(Number(d.successCount),1);assert.equal(Number(d.errorCount),0);ctx.importedOrder=await one('SELECT id,order_no,status,total_amount,subtotal,tax_amount FROM sales_orders WHERE contract_code=?',[`${prefix}-IMPORT`]);evidence(ctx.importedOrder);assert.equal(Number(ctx.importedOrder.total_amount),60);});
  await test('IO-IMPORT-AMOUNTS','导入导出','导入订单价税明细与主表保持一致',async()=>{const d=need(ctx.importedOrder,'IO-IMPORT');assert.equal(Number(d.total_amount),Number(d.subtotal)+Number(d.tax_amount));});
  await test('IO-IMPORT-INVALID','导入导出','缺失客户编码和负数量行给出可定位错误',async()=>{const d=http(await importWorkbook([{...importRow('INVALID'),'客户编码':''},{...importRow('INVALID2'),'数量':-1}]));evidence(d);assert.equal(Number(d.successCount),0);assert.equal(Number(d.errorCount),2);});
  await test('IO-IMPORT-MIXED','导入导出','混合文件仅导入有效行且返回失败行',async()=>{const d=http(await importWorkbook([importRow('MIXED'),{...importRow('MIXEDBAD'),'客户编码':`${prefix}-UNKNOWN`}]));evidence(d);assert.equal(Number(d.successCount),1);assert.equal(Number(d.errorCount),1);});
  await test('IO-IMPORT-ATOMIC','导入导出','单个订单分组导入失败不会留下半张订单',async()=>{
    const contractCode=`${prefix}-ATOMIC`;
    const d=http(await importWorkbook([{...importRow('ATOMIC'),'产品编码':`${prefix}-UNKNOWN-PRODUCT`} ]));evidence(d);
    const docs=await rows('SELECT o.id,o.status,COUNT(i.id) AS item_count FROM sales_orders o LEFT JOIN sales_order_items i ON i.order_id=o.id WHERE o.contract_code=? AND o.deleted_at IS NULL GROUP BY o.id',[contractCode]);evidence(docs);
    if(Number(d.errorCount)>0) assert.equal(docs.length,0,'接口报告失败但仍提交了订单主表'); else {assert.equal(Number(d.successCount),1);assert.ok(docs.every(x=>Number(x.item_count)>0));}
  });
  await test('ORDER-LOCK-UNLOCK','订单','有足够库存的采购中订单可锁定并释放预留',async()=>{
    const [o]=await db.pool.query("INSERT INTO sales_orders(order_no,customer_id,total_amount,created_by,status,delivery_date) VALUES(?,?,90,?,'in_procurement',?)",[`${prefix}-LOCK`,ctx.customerIds[0],ctx.actorId,today]);
    await db.pool.query('INSERT INTO sales_order_items(order_id,material_id,quantity,unit_price,amount,tax_percent) VALUES(?,?,3,30,90,0)',[o.insertId,ctx.products[0].id]);
    http(await call('post',`/api/sales/orders/${o.insertId}/lock`,{lockReason:prefix}));assert.ok((await one('SELECT is_locked FROM sales_orders WHERE id=?',[o.insertId])).is_locked);
    reject(await call('post',`/api/sales/orders/${o.insertId}/lock`,{lockReason:prefix}));
    http(await call('post',`/api/sales/orders/${o.insertId}/unlock`,{}));assert.ok(!(await one('SELECT is_locked FROM sales_orders WHERE id=?',[o.insertId])).is_locked);
  });
  await test('ORDER-PRODUCTION','订单','自产缺货订单生成生产计划',async()=>{
    const p={...ctx.products[0],code:`${prefix}-MAKE-${Date.now()%1000000}`,name:`${prefix} Make`};
    const [m]=await db.pool.query("INSERT INTO materials(code,name,category_id,material_source_id,unit_id,location_id,specs,material_type,price,cost_price,status) SELECT ?,?,category_id,2,unit_id,location_id,'audit','finished',30,12,1 FROM materials WHERE id=?",[p.code,p.name,p.id]);p.id=m.insertId;
    const [bom]=await db.pool.query("INSERT INTO bom_masters(product_id,version,status,remark,created_by,approved_by,approved_at) VALUES(?,'AUDIT',1,?,?,?,NOW())",[p.id,prefix,prefix,ctx.actorId]);
    await db.pool.query('INSERT INTO bom_details(bom_id,material_id,quantity,unit_id,remark) VALUES(?,?,1,?,?)',[bom.insertId,ctx.products[1].id,ctx.unitId,prefix]);
    const order=await createOrder(3,p);evidence(order);assert.equal(order.status,'in_production');
    const plans=await rows('SELECT id,status FROM production_plans WHERE product_id=?',[p.id]);evidence(plans);assert.ok(plans.length>0);
  });
  await test('OUT-FOUR-DECIMAL-PRICE','出库','四位小数成交价在出库中不被截断',async()=>{
    const p={...ctx.products[0],price:0.1234};const order=await createOrder(10,p);const d=await createOutbound(order,10,p);
    const line=await one('SELECT price,amount FROM sales_outbound_items WHERE outbound_id=?',[d.id]);evidence(line);assert.equal(Number(line.price),0.1234);
  });
  await test('EX-APPROVE-FINANCE','换货','换货的退回入库和换出出库经财务审核正式过账',async()=>{
    need(ctx.exchangeCompleted,'EX-STATUS-API');const e=ctx.exchange;await approveInventoryPosting(db,finance.api,e.exchangeNo);
    const movements=await rows('SELECT transaction_type,quantity FROM inventory_ledger WHERE reference_no=?',[e.exchangeNo]);evidence(movements);assert.equal(movements.length,2);assert.deepEqual(movements.map(x=>Number(x.quantity)).sort(),[-1,1]);
  });
  await test('EX-INITIAL-IMPORT-STOCK','换货','期初库存导入的商品也能用于换货出库',async()=>{
    const p={...ctx.products[1],code:`${prefix}-INITIAL`,name:`${prefix} Initial`};
    const [m]=await db.pool.query("INSERT INTO materials(code,name,category_id,material_source_id,unit_id,location_id,specs,material_type,price,cost_price,status) SELECT ?,?,category_id,1,unit_id,location_id,'audit','finished',20,8,1 FROM materials WHERE id=?",[p.code,p.name,p.id]);p.id=m.insertId;
    const sourceNo=`${prefix}-INIT`;const conn=await db.pool.getConnection();try{await conn.beginTransaction();await InventoryService.updateStock({materialId:p.id,locationId:ctx.locationId,quantity:10,unitId:ctx.unitId,transactionType:'initial_import',referenceType:'audit_opening',referenceNo:sourceNo,batchNumber:sourceNo,operator:prefix,businessApprovedById:ctx.actorId,unitCost:8,transactionDate:today},conn);await conn.commit();}catch(e){await conn.rollback();throw e;}finally{conn.release();}
    await approveInventoryPosting(db,finance.api,sourceNo);
    const body=exchangeBody(ctx.exchangeOrder);body.newItems=[{...body.newItems[0],productCode:p.code,productName:p.name}];
    const ex=http(await call('post','/api/sales/exchanges',body),201);http(await call('put',`/api/sales/exchanges/${ex.id}/status`,{status:'processing'}));
    evidence(await one('SELECT SUM(quantity) AS stock FROM inventory_ledger WHERE material_id=?',[p.id]));http(await call('put',`/api/sales/exchanges/${ex.id}/status`,{status:'completed'}));
  });
  await test('EX-TERMINAL-EDIT','换货','已完成换货不能通过编辑接口重写单据',async()=>{need(ctx.exchangeCompleted,'EX-STATUS-API');reject(await call('put',`/api/sales/exchanges/${ctx.exchange.id}`,{...ctx.exchangeInput,status:'completed'}));});
  for(const type of ['sales_order','sales_outbound','sales_return','sales_exchange','sales_quotation','packing_list']) await test(`PRINT-${type}`,'打印',`读取 ${type} 默认打印模板`,async()=>{
    const r=await call('get',`/api/print/templates/default?module=sales&templateType=${type}`);
    if(canSkipPrintTemplate(type,r.status)) {
      const error=new Error('当前页面未提供对应打印功能，默认模板未配置（不适用）');
      error.skipped=true;
      throw error;
    }
    const d=http(r);evidence({found:Boolean(d),keys:d?Object.keys(d):[]});
  });
}

async function auditRepairBoundaries() {
  await test('FIX-ORDER-PRINT-HEADER','订单','订单详情提供实际制单人和客户地址供打印使用',async()=>{
    const order=need(ctx.mainOrder,'ORDER-1');
    const detail=http(await call('get',`/api/sales/orders/${order.id}`));
    const source=await one("SELECT COALESCE(NULLIF(TRIM(u.real_name),''),u.username) AS creator,c.address FROM sales_orders o JOIN users u ON u.id=o.created_by JOIN customers c ON c.id=o.customer_id WHERE o.id=?",[order.id]);
    assert.equal(detail.createdByName,source.creator);assert.equal(detail.address,source.address);
    evidence({order:order.id,creatorPresent:Boolean(detail.createdByName),addressMatches:true});
  });
  await test('FIX-ZERO-SHIPMENT-PRICE','销售财务','明确的零价出库在退货、换货估值中不会回退成原订单价格',async()=>{
    const order=await createOrder(2);
    const out=await createOutbound(order,2,{...ctx.products[0],price:0});
    http(await call('put',`/api/sales/outbound/${out.id}`,{status:'processing'}));http(await call('put',`/api/sales/outbound/${out.id}`,{status:'completed'}));
    const shipped=http(await call('get',`/api/sales/outbound/${out.id}`));assert.equal(shipped.items[0].unitPrice,0);assert.equal(shipped.items[0].totalAmount,0);
    const ret=http(await call('post','/api/sales/returns',{orderId:order.id,outboundId:out.id,returnDate:today,returnReason:'zero price',items:[{productId:ctx.products[0].id,quantity:1}]}),201);
    assert.equal(http(await call('get',`/api/sales/returns/${ret.id}`)).totalAmount,0);
    const ex=http(await call('post','/api/sales/exchanges',{...exchangeBody(order),outboundId:out.id}),201);
    const detail=http(await call('get',`/api/sales/exchanges/${ex.id}`));assert.equal(detail.returnAmount,0);assert.equal(detail.differenceAmount,20);
    evidence({outbound:out.id,returned:ret.id,exchange:ex.id,returnAmount:detail.returnAmount});
  });
  for (const scenario of [
    { id:'SUPPLEMENT', shippedPrice:35.1234, newPrice:50, newTax:0.06, returned:39.69, added:53, revenue:14.88, tax:-1.57, gross:13.31 },
    { id:'REFUND', shippedPrice:35, newPrice:20, newTax:0.06, returned:39.55, added:21.2, revenue:-15, tax:-3.35, gross:-18.35 },
    { id:'EQUAL', shippedPrice:100, newPrice:113, newTax:0, returned:113, added:113, revenue:13, tax:-13, gross:0 },
  ]) await test(`FIX-EXCHANGE-TAX-${scenario.id}`, '销售财务', `换货实际出库成交价、税快照与${scenario.id}差价凭证一致`, async () => {
    const body=orderBody(3);body.items[0].taxRate=0.13;
    const order=http(await call('post','/api/sales/orders',body),201);
    order.orderNo=(await one('SELECT order_no FROM sales_orders WHERE id=?',[order.id])).order_no;
    const outbound=await createOutbound(order,3,{...ctx.products[0],price:scenario.shippedPrice});
    http(await call('put',`/api/sales/outbound/${outbound.id}`,{status:'processing'}));
    http(await call('put',`/api/sales/outbound/${outbound.id}`,{status:'completed'}));
    await approveInventoryPosting(db,finance.api,outbound.outboundNo,{businessApi:api});
    const input={...exchangeBody(order),outboundId:outbound.id};
    input.newItems[0]={...input.newItems[0],unitPrice:scenario.newPrice,taxPercent:scenario.newTax,taxAmount:999};
    const exchange=http(await call('post','/api/sales/exchanges',input),201);
    const detail=http(await call('get',`/api/sales/exchanges/${exchange.id}`));
    assert.equal(Number(detail.outboundId),outbound.id);
    assert.equal(detail.returnItems[0].unitPrice,scenario.shippedPrice);
    assert.equal(detail.returnItems[0].taxPercent,0.13);
    assert.equal(detail.newItems[0].taxPercent,scenario.newTax);
    assert.equal(detail.returnAmount,scenario.returned);assert.equal(detail.newAmount,scenario.added);assert.equal(detail.differenceAmount,scenario.gross);
    http(await call('put',`/api/sales/exchanges/${exchange.id}`,{remark:'keep saved tax snapshot'}));
    const after=http(await call('get',`/api/sales/exchanges/${exchange.id}`));assert.deepEqual(after.items,detail.items);
    http(await call('put',`/api/sales/exchanges/${exchange.id}/status`,{status:'processing'}));
    http(await call('put',`/api/sales/exchanges/${exchange.id}/status`,{status:'completed'}));
    const query="SELECT id FROM gl_entries WHERE document_type='sales_exchange' AND document_number=? AND COALESCE(is_reversed,0)=0";
    assert.equal((await rows(query,[exchange.exchangeNo])).length,0);
    await approveInventoryPosting(db,finance.api,exchange.exchangeNo,{businessApi:api});
    const entries=await eventually(()=>rows(query,[exchange.exchangeNo]),value=>value.length===1,'换货税额凭证未生成');
    const lines=await rows('SELECT account_id,debit_amount,credit_amount FROM gl_entry_items WHERE entry_id=?',[entries[0].id]);
    const service=require('../src/services/external/FinanceIntegrationService');
    const accounts=await service.resolveAccountIds(['ACCOUNTS_RECEIVABLE','SALES_REVENUE','VAT_OUTPUT_TAX']);
    const balance=key=>lines.filter(line=>Number(line.account_id)===Number(accounts[key])).reduce((sum,line)=>sum+Math.round(Number(line.debit_amount)*100)-Math.round(Number(line.credit_amount)*100),0)/100;
    assert.equal(balance('ACCOUNTS_RECEIVABLE'),scenario.gross);
    assert.equal(balance('SALES_REVENUE'),-scenario.revenue);
    assert.equal(balance('VAT_OUTPUT_TAX'),-scenario.tax);
    assert.equal(lines.reduce((sum,line)=>sum+Math.round(Number(line.debit_amount)*100)-Math.round(Number(line.credit_amount)*100),0),0);
    await service.generateExchangeDifferenceEntry(await one('SELECT * FROM sales_exchanges WHERE id=?',[exchange.id]));
    assert.equal((await rows(query,[exchange.exchangeNo])).length,1);
    evidence({exchangeId:exchange.id,outboundId:outbound.id,returnAmount:detail.returnAmount,newAmount:detail.newAmount,difference:detail.differenceAmount,lines});
  });
  await test('FIX-EXCHANGE-OUTBOUND-QUOTA','退换货','换货保留具体出库来源，退货与换货不能重复占用同一张出库',async()=>{
    const order=await createOrder(4);
    const outbounds=[];
    for(const price of [35,45]) {
      const out=await createOutbound(order,2,{...ctx.products[0],price});
      http(await call('put',`/api/sales/outbound/${out.id}`,{status:'processing'}));http(await call('put',`/api/sales/outbound/${out.id}`,{status:'completed'}));
      await approveInventoryPosting(db,finance.api,out.outboundNo,{businessApi:api});outbounds.push(out);
    }
    const input={...exchangeBody(order,'specific outbound',2),outboundId:outbounds[0].id};
    const ex=http(await call('post','/api/sales/exchanges',input),201);
    const detail=http(await call('get',`/api/sales/exchanges/${ex.id}`));assert.equal(detail.returnAmount,70);
    reject(await call('post','/api/sales/exchanges',{...exchangeBody(order),outboundId:outbounds[0].id}));
    reject(await call('post','/api/sales/returns',{orderId:order.id,outboundId:outbounds[0].id,returnDate:today,returnReason:'already exchanged',items:[{productId:ctx.products[0].id,quantity:1}]}));
    const availability=http(await call('get',`/api/sales/outbound/${outbounds[0].id}`));assert.equal(availability.items[0].returnableQuantity,0);
    const second=http(await call('post','/api/sales/exchanges',{...exchangeBody(order),outboundId:outbounds[1].id}),201);
    assert.equal(http(await call('get',`/api/sales/exchanges/${second.id}`)).returnAmount,45);
    reject(await call('post','/api/sales/exchanges',{...exchangeBody(order),outboundId:999999999}));
    evidence({exchange:ex.id,outbounds:outbounds.map(item=>item.id),remainingFirst:0});
  });
  await test('FIX-AR-LINE-TAX', '销售财务', '零税率明细不会被默认13%覆盖，应收按实际四位成交价计价', async () => {
    const body=orderBody(5); delete body.taxRate;
    const order=http(await call('post','/api/sales/orders',body),201);
    const saved=await one('SELECT order_no,tax_rate FROM sales_orders WHERE id=?',[order.id]);
    order.orderNo=saved.order_no;assert.equal(Number(saved.tax_rate),0);
    const outbound=await createOutbound(order,3,{...ctx.products[0],price:35.1234});
    http(await call('put',`/api/sales/outbound/${outbound.id}`,{status:'processing'}));
    http(await call('put',`/api/sales/outbound/${outbound.id}`,{status:'completed'}));
    await approveInventoryPosting(db,finance.api,outbound.outboundNo,{businessApi:api});
    http(await call('post',`/api/finance/integration/ar-invoice-from-outbound/${outbound.id}`,{},finance.api));
    const invoice=await one("SELECT total_amount,amount_excluding_tax,tax_amount FROM ar_invoices WHERE source_type='sales_outbound' AND source_id=?",[outbound.id]);
    assert.equal(Number(invoice.total_amount),105.37);assert.equal(Number(invoice.tax_amount),0);
    const raw=await one('SELECT * FROM sales_outbound WHERE id=?',[outbound.id]);
    const tax=await require('../src/services/external/FinanceIntegrationService').generateOutputTaxInvoiceFromSalesOutbound(raw,ctx.financeActorId,{force:true});
    const taxSaved=await one('SELECT total_amount,tax_amount FROM tax_invoices WHERE id=?',[tax.invoiceId]);
    assert.equal(Number(taxSaved.total_amount),105.37);assert.equal(Number(taxSaved.tax_amount),0);
    http(await call('post',`/api/finance/tax/invoices/${tax.invoiceId}/void`,{},reversalReviewer));
    const replacement=http(await call('post',`/api/finance/integration/tax-output/${outbound.id}`,{},finance.api));
    assert.notEqual(replacement.invoiceId,tax.invoiceId);
    const repeated=http(await call('post',`/api/finance/integration/tax-output/${outbound.id}`,{},finance.api));
    assert.equal(repeated.invoiceId,replacement.invoiceId);
    assert.equal((await one("SELECT COUNT(*) AS n FROM tax_invoices WHERE related_document_type='sales_outbound' AND related_document_id=? AND status<>'已作废'",[outbound.id])).n,1);
    evidence({outbound:outbound.id,invoice,tax:taxSaved,voidedTaxId:tax.invoiceId,replacementTaxId:replacement.invoiceId});
  });
  await test('FIX-AR-MIXED-TAX', '销售财务', '重复物料和多订单混合税率不倍增应收，含税退货红字冲回相应税额', async () => {
    const body=orderBody(2);body.items[0].taxRate=0.13;
    body.items.push({...body.items[0],quantity:3,unitPrice:40,taxRate:0});
    const a=http(await call('post','/api/sales/orders',body),201);
    a.orderNo=(await one('SELECT order_no FROM sales_orders WHERE id=?',[a.id])).order_no;
    const bodyB=orderBody(2,ctx.products[1]);bodyB.items[0].taxRate=0.06;
    const b=http(await call('post','/api/sales/orders',bodyB),201);
    b.orderNo=(await one('SELECT order_no FROM sales_orders WHERE id=?',[b.id])).order_no;
    const out=http(await call('post','/api/sales/outbound',{orderId:null,isMultiOrder:true,relatedOrders:[a.id,b.id],deliveryDate:today,items:[...outboundBody(a,5,{...ctx.products[0],price:36}).items,...outboundBody(b,2,{...ctx.products[1],price:25}).items]}),201);
    http(await call('put',`/api/sales/outbound/${out.id}`,{status:'processing'}));http(await call('put',`/api/sales/outbound/${out.id}`,{status:'completed'}));
    await approveInventoryPosting(db,finance.api,out.outboundNo,{businessApi:api});
    http(await call('post',`/api/finance/integration/ar-invoice-from-outbound/${out.id}`,{},finance.api));
    const invoice=await one("SELECT id,total_amount,amount_excluding_tax,tax_amount FROM ar_invoices WHERE source_type='sales_outbound' AND source_id=?",[out.id]);
    assert.equal(Number(invoice.amount_excluding_tax),230);assert.equal(Number(invoice.tax_amount),10.8);assert.equal(Number(invoice.total_amount),240.8);
    const raw=await one('SELECT * FROM sales_outbound WHERE id=?',[out.id]);
    const tax=await require('../src/services/external/FinanceIntegrationService').generateOutputTaxInvoiceFromSalesOutbound(raw,ctx.financeActorId,{force:true});
    const taxSaved=await one('SELECT total_amount,tax_amount FROM tax_invoices WHERE id=?',[tax.invoiceId]);
    assert.equal(Number(taxSaved.total_amount),240.8);assert.equal(Number(taxSaved.tax_amount),10.8);
    const ret=http(await call('post','/api/sales/returns',{orderId:b.id,outboundId:out.id,returnDate:today,returnReason:'tax regression',items:[{productId:ctx.products[1].id,quantity:1}]}),201);
    const detail=http(await call('get',`/api/sales/returns/${ret.id}`));assert.equal(Number(detail.totalAmount),26.5);
    http(await call('put',`/api/sales/returns/${ret.id}/status`,{status:'approved'}));http(await call('put',`/api/sales/returns/${ret.id}/status`,{status:'completed'}));
    await approveInventoryPosting(db,finance.api,ret.returnNo,{businessApi:api});
    http(await call('post',`/api/finance/integration/ar-credit-note-from-return/${ret.id}`,{},finance.api));
    const credit=await one("SELECT id,invoice_number,total_amount,amount_excluding_tax,tax_amount FROM ar_invoices WHERE source_type='sales_return' AND source_id=?",[ret.id]);
    assert.equal(Number(credit.total_amount),-26.5);assert.equal(Number(credit.amount_excluding_tax),-25);assert.equal(Number(credit.tax_amount),-1.5);
    const gl=await rows('SELECT i.debit_amount,i.credit_amount FROM gl_entries e JOIN gl_entry_items i ON i.entry_id=e.id WHERE e.document_number=? AND COALESCE(e.is_reversed,0)=0',[credit.invoice_number]);
    assert.equal(gl.length,3);assert.equal(gl.reduce((sum,row)=>sum+Number(row.debit_amount)-Number(row.credit_amount),0),0);
    evidence({outbound:out.id,invoice,tax:taxSaved,credit});
  });
  await test('FIX-QUOTE-SEARCH', '报价', '物料远程搜索和按物料筛选报价均命中，日期筛选包含结束日', async () => {
    const product = ctx.products[0];
    const materials = http(await call('get',`/api/base-data/materials?search=${encodeURIComponent(product.code)}&page=1&pageSize=50&status=1`));
    assert.equal(materials.list.length,1);
    assert.equal(Number(materials.list[0].id),product.id);
    assert.equal(Number(materials.list[0].price),30);
    const quote = await createQuote();
    // An explicit late-day fixture tests the inclusive end date regardless of
    // when this script is rerun or whether the run crosses midnight.
    const createdAt = `${today} 23:59:59`;
    await db.pool.query('UPDATE sales_quotations SET created_at=? WHERE id=?', [createdAt,quote.id]);
    const result = http(await call('get',`/api/sales/quotations?search=${encodeURIComponent(product.code)}&startDate=${today}&endDate=${today}&pageSize=100`));
    assert.ok(result.items.some(item=>Number(item.id)===Number(quote.id)));
    assert.ok(result.items.every(item=>item.items.some(line=>Number(line.productId)===product.id)));
    evidence({productId:product.id,quotationId:quote.id,createdAt,dateFilter:today,count:result.total});
  });
  await test('FIX-QUOTE-STATISTICS', '报价', '全量状态统计及当月转换率包含月末、不包含相邻月份', async () => {
    const month = getAuditCalendar();
    const first = month.periodStart;
    const next = month.nextPeriodStart;
    const dates = [month.previousPeriodEnd+' 23:59:59',month.periodEnd+' 23:59:59',next+' 00:00:00'];
    const quotes = [];
    for (const date of dates) {
      const quote = await createQuote('accepted');
      await db.pool.query('UPDATE sales_quotations SET created_at=? WHERE id=?',[date,quote.id]);
      quotes.push(quote);
    }
    http(await call('post',`/api/sales/quotations/${quotes[1].id}/convert`,{}));
    const actual = http(await call('get','/api/sales/quotations/statistics'));
    const expected = await one("SELECT COUNT(*) AS count,COALESCE(SUM(total_amount),0) AS amount,COALESCE(SUM(status='converted'),0) AS converted FROM sales_quotations WHERE deleted_at IS NULL AND created_at>=? AND created_at<?",[first,next]);
    const statusCounts = await rows('SELECT status,COUNT(*) AS count FROM sales_quotations WHERE deleted_at IS NULL GROUP BY status');
    const counts = Object.fromEntries(statusCounts.map(row=>[row.status,Number(row.count)]));
    assert.equal(Number(actual.monthlyCount),Number(expected.count));
    assert.equal(Number(actual.monthlyAmount),Number(expected.amount));
    assert.equal(Number(actual.conversionRate),Number(expected.converted)/Number(expected.count));
    assert.deepEqual(actual.statusStats,{total:statusCounts.reduce((sum,row)=>sum+Number(row.count),0),pending:counts.draft||0,confirmed:counts.accepted||0,converted:counts.converted||0,expired:counts.expired||0});
    evidence({quotes:quotes.map(q=>q.id),dates,statistics:actual});
  });
  await test('FIX-RETURN-EXCHANGE-DATES', '退换货', '日期控件的 ISO 入参可保存，编辑保留抬头、价格和可退额度', async () => {
    const order = await createShippedOrder(5);
    const exchangeInput = {...exchangeBody(order), exchangeDate:calendar.isoDateInput};
    const doc = http(await call('post','/api/sales/exchanges',exchangeInput),201);
    let detail = http(await call('get',`/api/sales/exchanges/${doc.id}`));
    assert.equal(detail.exchangeDate, today);
    assert.equal(detail.exchangeReason, exchangeInput.reason);
    assert.equal(detail.contactPhone, exchangeInput.contactPhone);
    assert.equal(Number(detail.items.find(item=>item.itemType==='return').returnableQuantity),5);
    exchangeInput.newItems[0].newQuantity = 2;
    http(await call('put',`/api/sales/exchanges/${doc.id}`,exchangeInput));
    detail = http(await call('get',`/api/sales/exchanges/${doc.id}`));
    assert.equal(detail.items.length,2);
    assert.equal(Number(detail.newAmount),40);
    for (const exchangeDate of ['2026-02-30','invalid']) http(await call('put',`/api/sales/exchanges/${doc.id}`,{...exchangeInput,exchangeDate}),400);
    const returnInput = {orderId:order.id,returnDate:calendar.isoDateInput,returnReason:'date regression',items:[{productId:ctx.products[0].id,quantity:1}]};
    const returned=http(await call('post','/api/sales/returns',returnInput),201);
    const returnedDetail=http(await call('get',`/api/sales/returns/${returned.id}`));
    assert.equal(returnedDetail.returnDate,today);
    const list=http(await call('get',`/api/sales/returns?search=${returned.returnNo}`));
    assert.equal(Number(list.items.find(item=>Number(item.id)===returned.id).totalAmount),30);
    http(await call('put',`/api/sales/returns/${returned.id}`,{returnDate:'2026-02-30'}),400);
    evidence({exchange:doc.id,returned:returned.id,date:today,newAmount:detail.newAmount});
  });
  await test('FIX-STOCK-CODES', '库存选择', '单个和多个物料编码查询返回与正式库存台账一致的数量', async () => {
    for (const products of [ctx.products.slice(0, 1), ctx.products.slice(0, 2)]) {
      const result = http(await call('get', `/api/inventory/materials-with-stock?codes=${encodeURIComponent(products.map(p => p.code).join(','))}`));
      assert.equal(result.length, products.length);
      for (const product of products) {
        const actual = result.find(row => Number(row.id) === product.id);
        const expected = await one('SELECT SUM(quantity) AS stock FROM inventory_ledger WHERE material_id=? AND location_id=?', [product.id, ctx.locationId]);
        assert.equal(Number(actual.stockQuantity), Number(expected.stock));
      }
      evidence(result.map(row => ({id:row.id,code:row.code,stockQuantity:row.stockQuantity})));
    }
  });
  await test('FIX-OUT-CONCURRENT-FULL', '出库', '并发合法分批发满订单后状态准确，完成时库存暂存不重复', async () => {
    const order = await createOrder(5);
    const extras = [await createOrder(1), await createOrder(1)];
    const docs = [];
    for (const [index, extra] of extras.entries()) docs.push(http(await call('post', '/api/sales/outbound', {
      orderId:null, isMultiOrder:true, relatedOrders:[order.id,extra.id], deliveryDate:today,
      items:[...outboundBody(order, index+2).items, ...outboundBody(extra,1).items],
    }),201));
    for (const status of ['processing', 'completed']) {
      const responses = await Promise.all(docs.map(doc => call('put', `/api/sales/outbound/${doc.id}`, {status})));
      responses.forEach(response => http(response));
      const saved = await one('SELECT status FROM sales_orders WHERE id=?', [order.id]);
      evidence({stage:status,order:order.id,status:saved.status});
      assert.equal(saved.status, 'shipped');
    }
    for (const doc of docs) await approveInventoryPosting(db, finance.api, doc.outboundNo, {businessApi:api});
    const movements = await rows('SELECT reference_no,SUM(quantity) AS quantity FROM inventory_ledger WHERE reference_no IN (?) GROUP BY reference_no', [docs.map(doc => doc.outboundNo)]);
    assert.deepEqual(movements.map(row => Number(row.quantity)).sort((a,b) => a-b), [-4,-3]);
  });
  await test('FIX-OUT-CONCURRENT', '出库', '并发处理两张出库单不能抢占超过同一订单额度', async () => {
    const shared = await createOrder(5), a = await createOrder(1), b = await createOrder(1);
    const docs = [];
    for (const extra of [a,b]) docs.push(http(await call('post', '/api/sales/outbound', {
      orderId: null, isMultiOrder: true, relatedOrders: [shared.id, extra.id], deliveryDate: today,
      items: [...outboundBody(shared, 3).items, ...outboundBody(extra, 1).items],
    }), 201));
    const responses = await Promise.all(docs.map(doc => call('put', `/api/sales/outbound/${doc.id}`, {status:'processing'})));
    evidence(responses.map(r => ({status:r.status,body:r.body})));
    assert.deepEqual(responses.map(r => r.status).sort(), [200,400]);
    const quantity = await one("SELECT SUM(i.quantity) AS quantity FROM sales_outbound_items i JOIN sales_outbound o ON o.id=i.outbound_id WHERE i.source_order_id=? AND o.status IN ('processing','completed')", [shared.id]);
    assert.equal(Number(quantity.quantity),3);
  });
  await test('FIX-OUT-MULTI-POST', '出库', '多订单同物料同批次正式扣库，重复完成保持明细和日期', async () => {
    const a = await createOrder(3), b = await createOrder(4);
    const doc = http(await call('post','/api/sales/outbound',{orderId:null,isMultiOrder:true,relatedOrders:[a.id,b.id],deliveryDate:'2026-09-12',items:[...outboundBody(a,2).items,...outboundBody(b,3).items]}),201);
    http(await call('put',`/api/sales/outbound/${doc.id}`,{status:'processing'}));
    http(await call('put',`/api/sales/outbound/${doc.id}`,{status:'completed'}));
    await approveInventoryPosting(db,finance.api,doc.outboundNo,{businessApi:api});
    const before = await rows('SELECT id,quantity FROM inventory_ledger WHERE reference_no=? ORDER BY id',[doc.outboundNo]);
    assert.equal(before.length,2); assert.equal(before.reduce((n,row)=>n+Number(row.quantity),0),-5);
    http(await call('put',`/api/sales/outbound/${doc.id}`,{status:'completed'}));
    const after = await rows('SELECT id,quantity FROM inventory_ledger WHERE reference_no=? ORDER BY id',[doc.outboundNo]);
    assert.deepEqual(after,before);
    const saved = http(await call('get',`/api/sales/outbound/${doc.id}`));
    assert.ok(String(saved.deliveryDate).startsWith('2026-09-12'));
    const returned = http(await call('post','/api/sales/returns',{orderId:a.id,outboundId:doc.id,returnDate:today,returnReason:'multi source',items:[{productId:ctx.products[0].id,quantity:1}]}),201);
    const detail = http(await call('get',`/api/sales/outbound/${doc.id}`));
    assert.equal(Number(detail.items.find(i=>Number(i.sourceOrderId)===a.id).returnableQuantity),1);
    assert.equal(Number(detail.items.find(i=>Number(i.sourceOrderId)===b.id).returnableQuantity),3);
    evidence({outbound:doc,returned,ledger:after});
  });
  await test('FIX-OUT-DRAFT-INPUT', '出库', '草稿也拒绝小数、负数、无效单价和已删除物料', async () => {
    const order = await createOrder(5);
    for (const quantity of [1.5,-1]) http(await call('post','/api/sales/outbound',outboundBody(order,quantity)),400);
    for (const price of [-1,0.12345,'invalid']) {
      const input = outboundBody(order,1); input.items[0].price=price;
      http(await call('post','/api/sales/outbound',input),400);
    }
    const draft = await createOutbound(order,1);
    const detail = http(await call('get',`/api/sales/outbound/${draft.id}`));
    assert.equal(Number(detail.items[0].remainingQuantity),5);
    http(await call('put',`/api/sales/outbound/${draft.id}`,outboundBody(order,4)));
    assert.equal(Number((await one('SELECT quantity FROM sales_outbound_items WHERE outbound_id=?',[draft.id])).quantity),4);
  });
  await test('FIX-RETURN-SHARED-QUOTA', '退换货', '退货与换货共享额度，取消释放额度，重复行不能绕过校验', async () => {
    const order=await createShippedOrder(5);
    const input={orderId:order.id,returnDate:today,returnReason:'shared quota',items:[{productId:ctx.products[0].id,quantity:3}]};
    const returned=http(await call('post','/api/sales/returns',input),201);
    reject(await call('post','/api/sales/exchanges',exchangeBody(order,'over quota',3)));
    http(await call('post','/api/sales/exchanges',exchangeBody(order,'remaining quota',2)),201);
    reject(await call('post','/api/sales/returns',{...input,items:[{productId:ctx.products[0].id,quantity:1}]}));
    http(await call('put',`/api/sales/returns/${returned.id}/status`,{status:'cancelled'}));
    reject(await call('post','/api/sales/returns',{...input,items:[{productId:ctx.products[0].id,quantity:2},{productId:ctx.products[0].id,quantity:2}]}));
    const allowed=http(await call('post','/api/sales/returns',input),201);
    evidence({order:order.id,returned:returned.id,replacement:allowed.id});
  });
  await test('FIX-RETURN-CONCURRENT', '退换货', '并发退货和换货申请不能重复占用可退额度', async () => {
    const order=await createShippedOrder(3);
    const responses=await Promise.all([
      call('post','/api/sales/returns',{orderId:order.id,returnDate:today,returnReason:'concurrent',items:[{productId:ctx.products[0].id,quantity:2}]}),
      call('post','/api/sales/exchanges',exchangeBody(order,'concurrent',2)),
    ]);
    evidence(responses.map(r=>({status:r.status,body:r.body}))); assert.deepEqual(responses.map(r=>r.status).sort(),[201,400]);
  });
  await test('FIX-RETURN-INVALID-SOURCE', '退换货', '未完成发货、错误物料、非正整数数量均不能退换', async () => {
    const order=await createOrder(3);
    reject(await call('post','/api/sales/exchanges',exchangeBody(order)));
    reject(await call('post','/api/sales/returns',{orderId:order.id,returnDate:today,returnReason:'unshipped',items:[{productId:ctx.products[0].id,quantity:1}]}));
    const shipped=await createShippedOrder(3);
    for (const quantity of [0,-1,1.5]) reject(await call('post','/api/sales/returns',{orderId:shipped.id,returnDate:today,returnReason:'invalid qty',items:[{productId:ctx.products[0].id,quantity}]}));
    reject(await call('post','/api/sales/returns',{orderId:shipped.id,returnDate:today,returnReason:'wrong product',items:[{productId:ctx.products[1].id,quantity:1}]}));
  });
  await test('FIX-RETURN-PRICES', '退货', '重复订单物料不重复退货明细；红字应收使用实际出库成交价', async () => {
    const input=orderBody(2);input.items.push({...input.items[0],quantity:3,unitPrice:40});
    const order=http(await call('post','/api/sales/orders',input),201);
    order.orderNo=(await one('SELECT order_no FROM sales_orders WHERE id=?',[order.id])).order_no;
    const unshipped=http(await call('get',`/api/sales/orders/${order.id}/unshipped-items`));
    assert.equal(unshipped.items.length,1);assert.equal(Number(unshipped.items[0].remainingQuantity),5);assert.equal(Number(unshipped.items[0].unitPrice),36);
    const doc=await createOutbound(order,3,{...ctx.products[0],price:35.1234});
    http(await call('put',`/api/sales/outbound/${doc.id}`,{status:'processing'}));http(await call('put',`/api/sales/outbound/${doc.id}`,{status:'completed'}));await approveInventoryPosting(db,finance.api,doc.outboundNo,{businessApi:api});
    const products=http(await call('get',`/api/sales/customers/${ctx.customerIds[0]}/order-products`));
    const product=products.find(p=>Number(p.materialId)===ctx.products[0].id);
    const source=product.orderDetails.find(o=>Number(o.orderId)===order.id);
    assert.equal(Number(source.remainingQuantity),2);assert.equal(Number(source.unitPrice),36);
    const returned=http(await call('post','/api/sales/returns',{orderId:order.id,outboundId:doc.id,returnDate:today,returnReason:'price',items:[{productId:ctx.products[0].id,quantity:2}]}),201);
    const detail=http(await call('get',`/api/sales/returns/${returned.id}`));assert.equal(detail.items.length,1);assert.equal(Number(detail.items[0].unitPrice),35.1234);assert.equal(Number(detail.totalAmount),70.25);
    http(await call('put',`/api/sales/returns/${returned.id}/status`,{status:'approved'}));http(await call('put',`/api/sales/returns/${returned.id}/status`,{status:'completed'}));await approveInventoryPosting(db,finance.api,returned.returnNo,{businessApi:api});
    http(await call('post',`/api/finance/integration/ar-credit-note-from-return/${returned.id}`,{},finance.api));
    assert.equal(Number((await one("SELECT total_amount FROM ar_invoices WHERE source_type='sales_return' AND source_id=?",[returned.id])).total_amount),-70.25);
  });
  await test('FIX-QUOTE-CONCURRENT', '报价', '并发转换报价只创建一张订单且不能重新确认再转换', async () => {
    const quote=await createQuote('accepted');
    const responses=await Promise.all([call('post',`/api/sales/quotations/${quote.id}/convert`,{}),call('post',`/api/sales/quotations/${quote.id}/convert`,{})]);
    const converted=responses.map(r=>http(r));assert.equal(converted[0].orderId,converted[1].orderId);
    const orders=await rows('SELECT id,status FROM sales_orders WHERE quotation_id=?',[quote.id]);evidence(orders);assert.equal(orders.length,1);assert.equal(orders[0].status,'ready_to_ship');
    reject(await call('put',`/api/sales/quotations/${quote.id}`,quoteBody('accepted')));
    reject(await call('post','/api/sales/orders',{...orderBody(),quotationId:quote.id}));
  });
  for (const [suffix,price,difference] of [['SUPPLEMENT',50,20],['REFUND',20,-10]]) await test(`FIX-EX-${suffix}`,'换货',`换货${difference>0?'补差价':'退差价'}财审前后金额及幂等`,async()=>{
    const order=await createShippedOrder(2);const body=exchangeBody(order);body.newItems[0].unitPrice=price;
    const exchange=http(await call('post','/api/sales/exchanges',body),201);
    http(await call('put',`/api/sales/exchanges/${exchange.id}/status`,{status:'processing'}));http(await call('put',`/api/sales/exchanges/${exchange.id}/status`,{status:'completed'}));
    const query="SELECT id FROM gl_entries WHERE document_type='sales_exchange' AND document_number=?";
    assert.equal((await rows(query,[exchange.exchangeNo])).length,0);
    await approveInventoryPosting(db,finance.api,exchange.exchangeNo,{businessApi:api});
    const entries=await eventually(()=>rows(query,[exchange.exchangeNo]),r=>r.length>0,'换货差价凭证未生成');assert.equal(entries.length,1);
    const lines=await rows('SELECT account_id,debit_amount,credit_amount FROM gl_entry_items WHERE entry_id=?',[entries[0].id]);evidence({difference,lines});
    const accounts=await require('../src/services/external/FinanceIntegrationService').resolveAccountIds(['ACCOUNTS_RECEIVABLE','SALES_REVENUE']);
    const receivable=lines.find(l=>Number(l.account_id)===Number(accounts.ACCOUNTS_RECEIVABLE));
    assert.equal(Number(receivable.debit_amount)-Number(receivable.credit_amount),difference);
    assert.equal(lines.reduce((n,l)=>n+Number(l.debit_amount)-Number(l.credit_amount),0),0);
    const saved=await one('SELECT * FROM sales_exchanges WHERE id=?',[exchange.id]);
    await Promise.all([1,2].map(()=>require('../src/services/external/FinanceIntegrationService').generateExchangeDifferenceEntry(saved)));
    http(await call('put',`/api/sales/exchanges/${exchange.id}/status`,{status:'completed'}));
    assert.equal((await rows(query,[exchange.exchangeNo])).length,1);
    assert.equal((await rows('SELECT id FROM inventory_ledger WHERE reference_no=?',[exchange.exchangeNo])).length,2);
  });
  await test('FIX-CONTRACT-SOURCES','合同','合同执行校验来源、客户、金额并按阶段去重',async()=>{
    const contract=http(await call('post','/api/contracts',contractBody()),[200,201]);
    http(await call('put',`/api/contracts/${contract.id}/status`,{status:'pending_approval'}));await approveContractForAudit(contract.id);
    const other=await createOrder(10,ctx.products[0],ctx.customerIds[1]);
    reject(await call('post',`/api/contracts/${contract.id}/executions`,{executionType:'order',businessId:other.id,amount:300}));
    const order=await createShippedOrder(4);
    const input={executionType:'order',businessId:order.id,amount:120};
    for (const amount of [-1,0,120.001,121]) reject(await call('post',`/api/contracts/${contract.id}/executions`,{...input,amount}));
    http(await call('post',`/api/contracts/${contract.id}/executions`,input));
    http(await call('post',`/api/contracts/${contract.id}/executions`,input));
    reject(await call('post',`/api/contracts/${contract.id}/executions`,{...input,amount:100}));
    const outbound=await one("SELECT id,outbound_no FROM sales_outbound WHERE order_id=? AND status='completed'",[order.id]);
    http(await call('post',`/api/contracts/${contract.id}/executions`,{executionType:'shipment',businessId:outbound.id,amount:120}));
    http(await call('post',`/api/finance/integration/ar-invoice-from-outbound/${outbound.id}`,{},finance.api));
    const invoice=await one("SELECT id FROM ar_invoices WHERE source_type='sales_outbound' AND source_id=?",[outbound.id]);
    const result=http(await call('post',`/api/contracts/${contract.id}/executions`,{executionType:'invoice',businessId:invoice.id,amount:120}));
    assert.equal(Number(result.executedAmount),120);assert.equal(result.executions.length,3);
    reject(await call('delete',`/api/contracts/${contract.id}`));
  });
}

async function main() {
  console.log(`销售流程测试：${database}，业务日期 ${today}`);
  console.log('负数、超发、重复操作等用例会主动提交非法请求；正确拦截计为 PASS，真实失败显示 FAIL。');
  console.log(`完整应用日志：${process.env.LOG_DIR}`);
  await setup();
  for(const audit of [auditReadEndpoints,auditOrders,auditOutbound,auditReturns,auditQuotes,auditExchanges,auditPacking,auditContracts,auditImportExportAndEdges,auditRemainingFlows,auditCsvExports,auditRepairBoundaries]) await audit();
  const unknownCases = only ? [...only].filter(id => !executedCases.has(id)) : [];
  assert.equal(unknownCases.length,0,`未知测试用例：${unknownCases.join(', ')}`);
  report.finishedAt=new Date().toISOString(); save();
  process.exitCode=auditExitCode(report);
  const counts=report.summary;
  console.log(`\n结果：通过 ${counts.PASS||0}，失败 ${counts.FAIL||0}，跳过 ${counts.SKIP||0}，受阻 ${counts.BLOCKED||0}。退出码：${process.exitCode}`);
  if(only) console.log(`本次执行 ${executedCases.size} 项；以上汇总包含保留的历史用例结果。`);
  for(const item of report.cases.filter(item=>['FAIL','BLOCKED'].includes(item.result))) console.error(formatCaseResult(item));
  console.log(`本次结果快照：${path.join(runDir,'functional-results.json')}`);
  console.log(`最新结果：${path.join(outDir,'functional-results.json')}`);
}
main().catch(error=>{report.fatal=error.stack;save();console.error(error.stack);process.exitCode=1;}).finally(async()=>{
  await new Promise(resolve=>setTimeout(resolve,300));
  await require('../src/database/ConnectionPoolFactory').closeAll();
  process.exit(process.exitCode || 0);
});
