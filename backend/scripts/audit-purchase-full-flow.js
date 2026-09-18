'use strict';

// Writes only to an explicitly named disposable purchase audit database.
// node scripts/audit-purchase-full-flow.js --database erp_purchase_audit_test_20260915 --write
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getAuditCalendar, summarizeCases, auditExitCode, formatCaseResult } = require('./lib/sales-audit-runtime');
const args = process.argv.slice(2);
const database = args.includes('--database') ? args[args.indexOf('--database') + 1] : '';
assert.ok(args.includes('--write'), 'Explicit --write is required');
assert.match(database, /^erp_purchase_audit_test_\d{8}(?:_\w+)?$/);
const outDir = path.resolve(__dirname, '../logs', database.replace('erp_purchase_audit_test_', 'purchase-audit-'));
const runDir = path.join(outDir, 'runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
fs.mkdirSync(runDir, { recursive: true });
const previous = args.includes('--resume') ? JSON.parse(fs.readFileSync(path.join(outDir, 'functional-results.json'), 'utf8')) : null;
if (previous) assert.equal(previous.database, database);
const sessionFile = path.join(outDir, 'session.local.json');
const oldSession = previous ? JSON.parse(fs.readFileSync(sessionFile, 'utf8')) : null;
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
Object.assign(process.env, {
  NODE_ENV: 'test', DB_NAME: database, RUN_LIVE_UAT: '1', DISABLE_CRON: 'true',
  ENABLE_RATE_LIMIT: 'false', REDIS_ENABLED: 'false', LOG_CONSOLE: 'false',
  LOG_DIR: path.join(runDir, 'application'),
  TEST_ADMIN_PASSWORD: oldSession?.password || `PurchaseAudit-${crypto.randomBytes(18).toString('hex')}!`,
});
const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');
const app = require('../src/app');
require('../src/events/subscribers/FinanceSubscriber');
require('../src/events/subscribers/NotificationSubscriber');
const { createApiClient, createFinanceActor, approveInventoryPosting } = require('./lib/live-flow-client');
const InventoryService = require('../src/services/InventoryService');
const calendar = getAuditCalendar();
const today = calendar.today;
const prefix = previous?.prefix || `PA${Date.now()}`;
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const report = previous || { database, prefix, startedAt: new Date().toISOString(), cases: [], fixtures: {} };
delete report.fatal;
delete report.finishedAt;
report.execution = { startedAt: new Date().toISOString(), businessDate: today, runDirectory: runDir, selectedCases: only ? [...only] : null };
const ctx = report.fixtures;
const executed = new Set();
const requestEvidence = new WeakMap();
const rows = async (sql, params = []) => (await db.pool.query(sql, params))[0];
const one = async (sql, params = []) => (await rows(sql, params))[0];
const dataOf = response => response.body?.data?.data || response.body?.data || response.body;
let api, reviewer, finance, current;
function need(value, label) { if (!value) throw Object.assign(new Error(`前置步骤未成功：${label}`), { blocked: true }); return value; }
function evidence(value) { current?.evidence.push(value); return value; }
function save() {
  report.summary = summarizeCases(report.cases);
  const content = JSON.stringify(report, null, 2);
  fs.writeFileSync(path.join(outDir, 'functional-results.json'), content);
  fs.writeFileSync(path.join(runDir, 'functional-results.json'), content);
}
async function test(id, module, name, run) {
  if (only && !only.has(id)) return;
  executed.add(id);
  const item = { id, module, name, requests: [], evidence: [], result: 'RUNNING', startedAt: new Date().toISOString() };
  current = item;
  const started = Date.now();
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
  for (const [name, value] of Object.entries(headers)) req.set(name, value);
  const response = await req.timeout({ response: 20000, deadline: 35000 });
  if (current) {
    const entry = { method: method.toUpperCase(), url, body, status: response.status, response: response.body };
    current.requests.push(entry);
    requestEvidence.set(response, entry);
  }
  return response;
}
function http(response, expected = 200) {
  const statuses = Array.isArray(expected) ? expected : [expected];
  const entry = requestEvidence.get(response);
  if (entry) entry.expectedStatuses = statuses;
  assert.ok(statuses.includes(response.status), `预期 HTTP ${statuses}，实际 ${response.status}: ${JSON.stringify(response.body)}`);
  return dataOf(response);
}
function reject(response) { return http(response, [400, 404, 409, 422]); }
async function eventually(read, predicate, label, timeout = 7000) {
  let value;
  const deadline = Date.now() + timeout;
  do {
    value = await read();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  assert.fail(`${label}: ${JSON.stringify(value)}`);
}
const stock = async materialId => Number((await one('SELECT COALESCE(SUM(quantity),0) n FROM inventory_ledger WHERE material_id=?', [materialId])).n);
function orderBody(quantity = 10, material = ctx.materials[0], extra = {}) {
  return { orderDate: today, supplierId: ctx.supplierIds[0], expectedDeliveryDate: calendar.validityDate,
    contactPerson: prefix, contactPhone: '13900000000', remarks: prefix, status: 'draft', taxRate: 0.13,
    items: [{ materialId: material.id, quantity, price: 10, taxRate: 0.13 }], ...extra };
}
async function createOrder(quantity = 10, material, extra = {}) {
  return http(await call('post', '/api/purchase/orders', orderBody(quantity, material, extra)), 201);
}
function requisitionBody(quantity = 10, material = ctx.materials[0]) {
  return { requestDate: today, requester: prefix, remarks: prefix, materials: [{ materialId: material.id, quantity }] };
}
async function createRequisition(quantity = 10, material) { return http(await call('post', '/api/purchase/requisitions', requisitionBody(quantity, material)), 201); }
async function finishWorkflow(type, businessId, action = 'approve') {
  for (let step = 0; step < 12; step++) {
    const instance = await one("SELECT id,current_node_id FROM workflow_instances WHERE business_type=? AND business_id=? AND status IN ('pending','in_progress') AND deleted_at IS NULL ORDER BY id DESC LIMIT 1", [type, businessId]);
    if (!instance) return;
    http(await call('get', `/api/workflow/instances/${instance.id}`, undefined, reviewer.api));
    http(await call('post', `/api/workflow/instances/${instance.id}/approve`, { nodeId: instance.current_node_id, action, comment: `${prefix} 采购流程回归` }, reviewer.api));
  }
  assert.fail('工作流未能在12步内完成');
}
async function approveOrder(order) {
  http(await call('put', `/api/purchase/orders/${order.id}/status`, { newStatus: 'pending' }));
  await finishWorkflow('purchase_order', order.id);
  const approved = http(await call('get', `/api/purchase/orders/${order.id}`));
  assert.equal(approved.status, 'approved');
  return approved;
}
async function arrive(order, quantity, material = ctx.materials[0], extra = {}) {
  const result = http(await call('post', `/api/purchase/orders/${order.id}/receive-with-inspection`, { items: [{ materialId: material.id, receiveQuantity: quantity, ...extra }] }));
  assert.equal(result.successCount, 1);
  return result.inspections[0];
}
async function inspect(inspection, qualifiedQuantity = Number(inspection.quantity)) {
  return http(await call('put', `/api/quality/inspections/${inspection.id}`, {
    status: qualifiedQuantity === Number(inspection.quantity) ? 'passed' : qualifiedQuantity > 0 ? 'partial' : 'failed',
    qualifiedQuantity, unqualifiedQuantity: Number(inspection.quantity) - qualifiedQuantity,
    actualDate: today, inspectorId: ctx.actorId, inspectorName: prefix,
    items: [{ itemName: '外观', standard: '表面完整无损伤', type: 'visual', method: '目视', result: qualifiedQuantity === Number(inspection.quantity) ? 'OK' : 'NG', actualValue: qualifiedQuantity === Number(inspection.quantity) ? '符合' : '存在缺陷' }],
  }));
}
async function receiptFromInspection(inspection) {
  const result = await one("SELECT id,receipt_no AS receiptNo,status FROM purchase_receipts WHERE inspection_id=? AND deleted_at IS NULL AND status <> 'cancelled'", [inspection.id]);
  need(result, '检验合格后生成采购收货单');
  const receipt = http(await call('get', `/api/purchase/receipts/${result.id}`));
  assert.equal(Number(receipt.inspectionId), Number(inspection.id));
  assert.equal(receipt.fromInspection, true);
  assert.ok(receipt.inspectionNo);
  return receipt;
}
async function completeReceipt(receipt, approve = true) {
  http(await call('put', `/api/purchase/receipts/${receipt.id}/status`, { status: 'completed' }));
  if (approve) await approveInventoryPosting(db, finance.api, receipt.receiptNo, { businessApi: api });
  return receipt;
}
async function makeReceivedOrder(quantity = 10, material = ctx.materials[0]) {
  const order = await approveOrder(await createOrder(quantity, material));
  const inspection = await arrive(order, quantity, material);
  await inspect(inspection);
  const receipt = await receiptFromInspection(inspection);
  await completeReceipt(receipt);
  return { order, receipt, inspection };
}
function receiptBody(order, quantity = 2, extra = {}) {
  return { orderId: order.id, supplierId: ctx.supplierIds[0], warehouseId: ctx.locationId, receiptDate: today, receiver: prefix, remarks: prefix,
    items: [{ materialId: ctx.materials[0].id, orderItemId: order.items?.[0]?.id, unitId: ctx.unitId, orderedQuantity: 10, receivedQuantity: quantity, qualifiedQuantity: quantity, price: 10, batchNumber: `${prefix}-${crypto.randomBytes(4).toString('hex')}`, taxRate: 0.13 }], ...extra };
}
async function createReceipt(order, quantity = 2, extra = {}, key = crypto.randomUUID()) {
  return http(await call('post', '/api/purchase/receipts', receiptBody(order, quantity, extra), api, { 'Idempotency-Key': key }), 201);
}
function returnBody(receipt, quantity = 1) {
  return { receiptId: receipt.id, returnDate: today, reason: '采购回归测试', remarks: prefix,
    items: [{ receiptItemId: receipt.items[0].id, returnQuantity: quantity }] };
}
async function createReturn(receipt, quantity = 1) { return http(await call('post', '/api/purchase/returns', returnBody(receipt, quantity)), 201); }

async function setup() {
  assert.equal((await one('SELECT DATABASE() db')).db, database);
  if (previous) {
    api = await createApiClient(app, ctx.username, process.env.TEST_ADMIN_PASSWORD);
    reviewer = { api: await createApiClient(app, `${prefix}_reviewer`, process.env.TEST_ADMIN_PASSWORD) };
    finance = { api: await createApiClient(app, `${prefix}_finance`, process.env.TEST_ADMIN_PASSWORD) };
    return;
  }
  const hash = await bcrypt.hash(process.env.TEST_ADMIN_PASSWORD, 10);
  const [actor] = await db.pool.query("INSERT INTO users(username,password,real_name,role,status) VALUES(?,?,?,'admin',1)", [prefix, hash, prefix]);
  ctx.actorId = actor.insertId;
  ctx.username = prefix;
  await db.pool.query("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='admin'", [ctx.actorId]);
  api = await createApiClient(app, prefix, process.env.TEST_ADMIN_PASSWORD);
  reviewer = await createFinanceActor(app, db, prefix, 'reviewer', 'purchase_manager');
  finance = await createFinanceActor(app, db, prefix);
  ctx.reviewerId = reviewer.id;
  ctx.financeId = finance.id;
  ctx.locationId = 2;
  ctx.unitId = (await one('SELECT id FROM units WHERE status=1 AND deleted_at IS NULL ORDER BY id LIMIT 1')).id;
  const categoryId = (await one('SELECT id FROM categories WHERE status=1 AND deleted_at IS NULL ORDER BY id LIMIT 1')).id;
  const inspectionMethod = await one("SELECT id FROM inspection_methods WHERE code = 'full' AND deleted_at IS NULL ORDER BY id LIMIT 1");
  need(inspectionMethod, '全检方式');
  ctx.supplierIds = [];
  for (const suffix of ['A', 'B']) {
    const [insert] = await db.pool.query("INSERT INTO suppliers(code,name,contact_person,contact_phone,status,remark) VALUES(?,?,?,'13900000000',1,?)", [`${prefix}-${suffix}`, `${prefix} Supplier ${suffix}`, prefix, prefix]);
    ctx.supplierIds.push(insert.insertId);
  }
  ctx.materials = [];
  for (let index = 0; index < 4; index++) {
    const material = { code: `${prefix}-M${index}`, name: `${prefix} Material ${index}`, price: 10, taxRate: index === 1 ? 0 : 0.13 };
    const [insert] = await db.pool.query("INSERT INTO materials(code,name,category_id,material_source_id,inspection_method_id,supplier_id,unit_id,location_id,specs,material_type,price,cost_price,tax_rate,status,remark) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)",
      [material.code, material.name, categoryId, 2, inspectionMethod?.id || null, ctx.supplierIds[0], ctx.unitId, ctx.locationId, 'purchase audit', index === 3 ? 'finished' : 'raw', 10, 10, material.taxRate, prefix]);
    material.id = insert.insertId;
    ctx.materials.push(material);
  }
  const template = http(await call('post', '/api/quality/templates', {
    templateCode: `${prefix}-IQC`, templateName: `${prefix} 采购检验`, inspectionType: 'incoming', version: '1.0',
    materialTypes: ctx.materials.map(material => material.id), isGeneral: false, isAql: false,
    items: [{ itemName: '外观', standard: '表面完整无损伤', type: 'visual', method: '目视' }],
  }), [200, 201]);
  ctx.templateId = template.id;
  http(await call('put', `/api/quality/templates/${template.id}/status`, { status: 'active' }));
  if (!await one('SELECT id FROM gl_periods WHERE is_closed=0 AND is_locked=0 AND start_date<=? AND end_date>=?', [today, today])) {
    await db.pool.query('INSERT INTO gl_periods(period_name,start_date,end_date,is_closed,is_adjusting,fiscal_year,is_locked) VALUES(?,?,?,0,0,?,0)', [`${prefix}-period`, calendar.periodStart, calendar.periodEnd, calendar.fiscalYear]);
  }
  const sourceNo = `${prefix}-OPEN`;
  const conn = await db.pool.getConnection();
  try {
    await conn.beginTransaction();
    await InventoryService.updateStock({ materialId: ctx.materials[2].id, locationId: ctx.locationId, quantity: 1000, unitId: ctx.unitId,
      transactionType: 'inbound', referenceType: 'audit_opening', referenceNo: sourceNo, batchNumber: sourceNo, operator: prefix,
      businessApprovedById: ctx.actorId, unitCost: 10, transactionDate: today }, conn);
    await conn.commit();
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
  await approveInventoryPosting(db, finance.api, sourceNo);
  // Exercise the configured automatic credit-note path in this disposable copy;
  // keep normal AP invoices on the application's manual generation path.
  const SystemConfigService = require('../src/services/system/SystemConfigService');
  ctx.originalAutoCreditNote = await SystemConfigService.get('auto_generate_ap_credit_note', false);
  await SystemConfigService.set('auto_generate_ap_credit_note', true, 'boolean');
  fs.writeFileSync(sessionFile, JSON.stringify({ database, username: prefix, password: process.env.TEST_ADMIN_PASSWORD, actorId: ctx.actorId }));
  save();
}

async function auditReads() {
  for (const [index, endpoint] of [
    'requisitions', 'requisitions/production-status?planId=2147483640', 'orders', 'orders/statistics', 'order-requisitions', 'suppliers',
    'receipts', 'receipts/history-items', `receipts/material/${ctx.materials[0].id}`, 'receipts-statistics',
    'returns', 'returns-statistics', 'dashboard-statistics', 'outsourced-processings', 'outsourced-processings/options/suppliers',
    'outsourced-processings/options/materials', 'outsourced-receipts', 'outsourced-receipts/options/warehouses', 'outsourced-receipts/options/processings',
  ].entries()) await test(`READ-${index + 1}`, '查询', endpoint, async () => { http(await call('get', `/api/purchase/${endpoint}${endpoint.includes('?') ? '&' : '?'}page=1&pageSize=5`)); });
  await test('AUTH-1', '权限', '未登录不可读取采购订单', async () => { assert.equal((await request(app).get('/api/purchase/orders')).status, 401); });
  await test('AUTH-2', '权限', '未登录不可新增采购订单', async () => { assert.ok([401, 403].includes((await request(app).post('/api/purchase/orders').send(orderBody())).status)); });
  await test('PRICE-1', '取价', '单个和批量采购取价可用', async () => {
    const single = http(await call('get', `/api/purchase/orders/latest-price?materialId=${ctx.materials[0].id}&supplierId=${ctx.supplierIds[0]}`));
    assert.equal(Number(single.price), 10);
    http(await call('post', '/api/purchase/orders/latest-prices', { materialIds: ctx.materials.map(m => m.id), supplierId: ctx.supplierIds[0] }));
  });
}

async function auditRequisitions() {
  await test('REQ-CREATE', '请购', '创建和读取请购，补齐物料信息', async () => {
    ctx.requisition = await createRequisition();
    const d = http(await call('get', `/api/purchase/requisitions/${ctx.requisition.id}`));
    assert.equal(d.status, 'draft'); assert.equal(d.materials[0].materialCode, ctx.materials[0].code); assert.equal(Number(d.materials[0].quantity), 10);
  });
  await test('REQ-EDIT', '请购', '草稿编辑保留物料数量和单位', async () => {
    need(ctx.requisition, '请购');
    const d = http(await call('put', `/api/purchase/requisitions/${ctx.requisition.id}`, requisitionBody(10)));
    assert.equal(Number(d.materials[0].quantity), 10); assert.equal(Number(d.materials[0].unitId), ctx.unitId);
  });
  await test('REQ-EMPTY', '请购', '禁止空明细请购', async () => { reject(await call('post', '/api/purchase/requisitions', { ...requisitionBody(), materials: [] })); });
  await test('REQ-BAD-QTY', '请购', '创建请购拒绝非正数量', async () => { reject(await call('post', '/api/purchase/requisitions', requisitionBody(-1))); });
  await test('REQ-EDIT-BAD-QTY', '请购', '编辑请购同样拒绝非正数量', async () => { const r = await createRequisition(); reject(await call('put', `/api/purchase/requisitions/${r.id}`, requisitionBody(-1))); });
  await test('REQ-EDIT-EMPTY', '请购', '编辑请购不能清空全部明细', async () => { const r = await createRequisition(); reject(await call('put', `/api/purchase/requisitions/${r.id}`, { ...requisitionBody(), materials: [] })); });
  await test('REQ-APPROVAL', '请购', '提交请购并由独立采购审批人审批，自动产生订单', async () => {
    need(ctx.requisition, '请购');
    reject(await call('put', `/api/purchase/requisitions/${ctx.requisition.id}/status`, { newStatus: 'approved' }));
    http(await call('put', `/api/purchase/requisitions/${ctx.requisition.id}/status`, { newStatus: 'submitted' }));
    await finishWorkflow('purchase_requisition', ctx.requisition.id);
    const orders = await rows('SELECT id FROM purchase_orders WHERE requisition_id=? AND deleted_at IS NULL', [ctx.requisition.id]);
    assert.equal(orders.length, 1);
    ctx.generatedOrder = http(await call('get', `/api/purchase/orders/${orders[0].id}`));
    assert.equal(Number(ctx.generatedOrder.items[0].quantity), 10);
    assert.equal((await one('SELECT status FROM purchase_requisitions WHERE id=?', [ctx.requisition.id])).status, 'completed');
  });
  await test('REQ-FINAL-EDIT', '请购', '已转采购的申请不能改删', async () => {
    need(ctx.generatedOrder, '自动订单'); reject(await call('put', `/api/purchase/requisitions/${ctx.requisition.id}`, requisitionBody(20))); reject(await call('delete', `/api/purchase/requisitions/${ctx.requisition.id}`));
  });
  await test('REQ-OVER-ORDER', '请购', '同一申请不能重复或超量转采购', async () => {
    need(ctx.generatedOrder, '自动订单'); reject(await call('post', '/api/purchase/orders', orderBody(10, undefined, { requisitionId: ctx.requisition.id, requisitionNumber: ctx.requisition.requisitionNumber })));
  });
  await test('REQ-ZERO-TAX', '请购', '自动转采购保留零税率', async () => {
    const r = await createRequisition(5, ctx.materials[1]);
    http(await call('put', `/api/purchase/requisitions/${r.id}/status`, { newStatus: 'submitted' }));
    await finishWorkflow('purchase_requisition', r.id);
    const order = await one('SELECT id,tax_amount FROM purchase_orders WHERE requisition_id=? AND deleted_at IS NULL', [r.id]);
    need(order, '零税请购生成订单'); evidence(order); assert.equal(Number(order.tax_amount), 0);
  });
  await test('REQ-DELETE', '请购', '草稿请购可删除', async () => { const r = await createRequisition(); http(await call('delete', `/api/purchase/requisitions/${r.id}`)); assert.ok((await one('SELECT deleted_at FROM purchase_requisitions WHERE id=?', [r.id])).deleted_at); });
}

async function auditOrders() {
  await test('ORDER-CREATE', '订单', '创建订单按明细计算价税金额', async () => {
    ctx.order = await createOrder(); assert.equal(ctx.order.status, 'draft'); assert.equal(Number(ctx.order.totalAmount), 113); assert.equal(Number(ctx.order.taxAmount), 13);
  });
  await test('ORDER-EDIT', '订单', '草稿订单编辑和查询一致', async () => { need(ctx.order, '订单'); ctx.order = http(await call('put', `/api/purchase/orders/${ctx.order.id}`, orderBody())); assert.equal(Number(ctx.order.items[0].quantity), 10); });
  await test('ORDER-EMPTY', '订单', '禁止空明细订单', async () => { reject(await call('post', '/api/purchase/orders', orderBody(10, undefined, { items: [] }))); });
  for (const quantity of [0, -1, 0.001]) await test(`ORDER-QTY-${quantity}`, '订单', `数量 ${quantity} 不能存为无效明细或静默归零`, async () => { reject(await call('post', '/api/purchase/orders', orderBody(quantity))); });
  await test('ORDER-BAD-MATERIAL', '订单', '不存在的物料返回业务校验错误', async () => { reject(await call('post', '/api/purchase/orders', orderBody(10, { id: 2147483640 }))); });
  await test('ORDER-BAD-DATE', '订单', '非法日期返回业务校验错误', async () => { reject(await call('post', '/api/purchase/orders', orderBody(10, undefined, { orderDate: '2026-02-30' }))); });
  await test('ORDER-CREATE-STATUS', '订单', '创建订单不能越过审批进入已批准状态', async () => { reject(await call('post', '/api/purchase/orders', orderBody(10, undefined, { status: 'approved' }))); });
  await test('ORDER-APPROVAL', '订单', '采购订单提交并由独立审批人通过', async () => { need(ctx.order, '订单'); ctx.order = await approveOrder(ctx.order); });
  await test('ORDER-APPROVAL-BYPASS', '订单', '直接写审批结果返回业务错误', async () => { const d = await createOrder(); reject(await call('put', `/api/purchase/orders/${d.id}/status`, { newStatus: 'approved' })); });
  await test('ORDER-APPROVED-EDIT', '订单', '审批后订单禁止直接改删', async () => { need(ctx.order, '订单'); reject(await call('put', `/api/purchase/orders/${ctx.order.id}`, orderBody(20))); reject(await call('delete', `/api/purchase/orders/${ctx.order.id}`)); });
  await test('ORDER-DRAFT-ARRIVAL', '到货', '未审批订单不能登记到货', async () => { const d = await createOrder(); reject(await call('post', `/api/purchase/orders/${d.id}/receive-with-inspection`, { items: [{ materialId: ctx.materials[0].id, receiveQuantity: 1 }] })); });
  await test('ORDER-OVER-ARRIVAL', '到货', '超量到货返回业务错误且无副作用', async () => { const d = await approveOrder(await createOrder(2)); reject(await call('post', `/api/purchase/orders/${d.id}/receive-with-inspection`, { items: [{ materialId: ctx.materials[0].id, receiveQuantity: 3 }] })); assert.equal(Number((await one('SELECT received_quantity FROM purchase_order_items WHERE order_id=?', [d.id])).received_quantity), 0); });
  await test('ORDER-SPLIT-ARRIVAL', '到货', '同物料拆行到货按累计数量校验', async () => { const d = await approveOrder(await createOrder(2)); reject(await call('post', `/api/purchase/orders/${d.id}/receive-with-inspection`, { items: [1.5, 1.5].map(q => ({ materialId: ctx.materials[0].id, receiveQuantity: q })) })); });
  await test('ORDER-CANCEL-DELETE', '订单', '草稿删除和取消终态约束', async () => { const d = await createOrder(); http(await call('delete', `/api/purchase/orders/${d.id}`)); const c = await createOrder(); http(await call('put', `/api/purchase/orders/${c.id}/status`, { newStatus: 'cancelled' })); reject(await call('put', `/api/purchase/orders/${c.id}`, orderBody())); });
}

async function auditReceipts() {
  await test('RECEIVE-PARTIAL', '收货', '首次部分到货生成待检验单', async () => {
    need(ctx.order, '主订单'); ctx.inspection1 = await arrive(ctx.order, 4);
    const order = http(await call('get', `/api/purchase/orders/${ctx.order.id}`)); assert.equal(Number(order.items[0].receivedQuantity), 4); assert.equal(Number(order.items[0].warehousedQuantity), 0);
  });
  await test('RECEIVE-INSPECT', '收货', '来料检验合格自动创建收货草稿', async () => { need(ctx.inspection1, '到货检验'); await inspect(ctx.inspection1); ctx.receipt1 = await receiptFromInspection(ctx.inspection1); assert.equal(ctx.receipt1.status, 'draft'); assert.equal(Number(ctx.receipt1.totalAmount), 45.2); });
  await test('RECEIPT-COMPLETE', '收货', '完成收货仅生成待财审过账', async () => {
    need(ctx.receipt1, '收货单'); const before = await stock(ctx.materials[0].id); await completeReceipt(ctx.receipt1, false); assert.equal(await stock(ctx.materials[0].id), before);
    const posting = await one("SELECT finance_status FROM inventory_posting_documents WHERE source_no=? AND posting_kind='movement'", [ctx.receipt1.receiptNo]); assert.equal(posting.finance_status, 'pending');
  });
  await test('RECEIPT-FINANCE', '收货', '独立财审正式入库并生成应付', async () => {
    need(ctx.receipt1, '收货单'); await approveInventoryPosting(db, finance.api, ctx.receipt1.receiptNo, { businessApi: api });
    const ledger = await one('SELECT SUM(quantity) quantity,SUM(total_value) amount FROM inventory_ledger WHERE reference_no=?', [ctx.receipt1.receiptNo]); evidence(ledger); assert.equal(Number(ledger.quantity), 4); assert.equal(Number(ledger.amount), 40);
    http(await call('post', `/api/finance/integration/ap-invoice/${ctx.receipt1.id}`, {}, finance.api));
    const invoice = await eventually(() => one("SELECT id,total_amount FROM ap_invoices WHERE source_type IN ('inbound','purchase_receipt') AND source_id=? AND status <> 'voided'", [ctx.receipt1.id]), r => !!r, '收货应付未生成'); assert.equal(Number(invoice.total_amount), 45.2);
  });
  await test('RECEIPT-TERMINAL', '收货', '完成收货不能再次编辑、取消或重复入库', async () => {
    need(ctx.receipt1, '收货单'); reject(await call('put', `/api/purchase/receipts/${ctx.receipt1.id}`, { receiptDate: today, warehouseId: ctx.locationId, items: ctx.receipt1.items })); reject(await call('put', `/api/purchase/receipts/${ctx.receipt1.id}/status`, { status: 'cancelled' })); reject(await call('put', `/api/purchase/receipts/${ctx.receipt1.id}/status`, { status: 'completed' }));
  });
  await test('ORDER-CANCEL-RECEIVED', '订单', '已到货订单取消返回明确业务错误', async () => { need(ctx.receipt1, '收货'); reject(await call('put', `/api/purchase/orders/${ctx.order.id}/status`, { newStatus: 'cancelled' })); });
  await test('RECEIVE-REMAINDER', '收货', '第二批到货入库后订单自动完成', async () => { need(ctx.receipt1, '首批收货'); const inspection = await arrive(ctx.order, 6); await inspect(inspection); ctx.receipt2 = await receiptFromInspection(inspection); await completeReceipt(ctx.receipt2); const order = http(await call('get', `/api/purchase/orders/${ctx.order.id}`)); assert.equal(order.status, 'completed'); assert.equal(Number(order.items[0].warehousedQuantity), 10); });
  await test('RECEIPT-MANUAL', '收货', '手工收货使用幂等键创建、读取和重放', async () => {
    const order = await approveOrder(await createOrder()); ctx.manualOrder = order;
    const body = receiptBody(order); const key = crypto.randomUUID();
    const created = http(await call('post', '/api/purchase/receipts', body, api, { 'Idempotency-Key': key }), 201);
    ctx.manualReceipt = http(await call('get', `/api/purchase/receipts/${created.id}`));
    assert.equal(Number(ctx.manualReceipt.items[0].amount), 20);
    assert.equal(Number(ctx.manualReceipt.items[0].taxAmount), 2.6);
    assert.equal(Number(ctx.manualReceipt.items[0].totalAmount), 22.6);
    const replay = http(await call('post', '/api/purchase/receipts', body, api, { 'Idempotency-Key': key })); assert.equal(Number(replay.id), Number(created.id));
    reject(await call('post', '/api/purchase/receipts', { ...body, remarks: 'changed' }, api, { 'Idempotency-Key': key }));
  });
  await test('RECEIPT-WAREHOUSE-EDIT', '收货', '草稿修改仓库实际保存', async () => { need(ctx.manualReceipt, '手工收货'); http(await call('put', `/api/purchase/receipts/${ctx.manualReceipt.id}`, { receiptDate: today, warehouseId: 1, items: ctx.manualReceipt.items })); const updated = http(await call('get', `/api/purchase/receipts/${ctx.manualReceipt.id}`)); assert.equal(Number(updated.warehouseId), 1); });
  await test('RECEIPT-EDIT-BAD-QTY', '收货', '编辑收货拒绝负数和超出合格数量', async () => { need(ctx.manualReceipt, '手工收货'); reject(await call('put', `/api/purchase/receipts/${ctx.manualReceipt.id}`, { receiptDate: today, items: [{ id: ctx.manualReceipt.items[0].id, receivedQuantity: -1, qualifiedQuantity: 20 }] })); });
  await test('RECEIPT-WRONG-SUPPLIER', '收货', '收货供应商必须与采购订单一致', async () => { const order = await approveOrder(await createOrder()); reject(await call('post', '/api/purchase/receipts', receiptBody(order, 2, { supplierId: ctx.supplierIds[1] }), api, { 'Idempotency-Key': crypto.randomUUID() })); });
  await test('RECEIPT-OVER-QTY', '收货', '收货草稿禁止超过订单数量', async () => { const order = await approveOrder(await createOrder(2)); reject(await call('post', '/api/purchase/receipts', receiptBody(order, 3), api, { 'Idempotency-Key': crypto.randomUUID() })); });
}

async function auditReturns() {
  await test('RETURN-CREATE', '退货', '从已入库明细创建退货并保留价税金额', async () => {
    need(ctx.receipt2, '第二批收货'); ctx.purchaseReturn = await createReturn(ctx.receipt2, 1); evidence(ctx.purchaseReturn); assert.equal(Number(ctx.purchaseReturn.totalAmount), 11.3);
  });
  await test('RETURN-EDIT', '退货', '草稿退货可以编辑', async () => { need(ctx.purchaseReturn, '退货'); http(await call('put', `/api/purchase/returns/${ctx.purchaseReturn.id}`, returnBody(ctx.receipt2, 1))); });
  await test('RETURN-COMPLETE', '退货', '退货确认完成、财审后扣库存并生成应付红字', async () => {
    need(ctx.purchaseReturn, '退货'); http(await call('put', `/api/purchase/returns/${ctx.purchaseReturn.id}/status`, { newStatus: 'confirmed' }));
    const before = await stock(ctx.materials[0].id);
    http(await call('put', `/api/purchase/returns/${ctx.purchaseReturn.id}/status`, { newStatus: 'completed' }));
    assert.equal(await stock(ctx.materials[0].id), before);
    await approveInventoryPosting(db, finance.api, ctx.purchaseReturn.returnNo, { businessApi: api }); assert.equal(await stock(ctx.materials[0].id), before - 1);
    const credit = await eventually(() => one("SELECT id,total_amount FROM ap_invoices WHERE source_type='purchase_return' AND source_id=? AND status <> 'voided'", [ctx.purchaseReturn.id]), r => !!r, '退货应付红字未生成'); evidence(credit); assert.equal(Number(credit.total_amount), -11.3);
    const order = http(await call('get', `/api/purchase/orders/${ctx.order.id}`)); assert.equal(Number(order.items[0].receivedQuantity), 9); assert.equal(Number(order.items[0].warehousedQuantity), 9);
  });
  await test('RETURN-FINAL', '退货', '完成退货不能编辑、删除或重复完成', async () => { need(ctx.purchaseReturn, '退货'); reject(await call('put', `/api/purchase/returns/${ctx.purchaseReturn.id}`, returnBody(ctx.receipt2, 2))); reject(await call('delete', `/api/purchase/returns/${ctx.purchaseReturn.id}`)); reject(await call('put', `/api/purchase/returns/${ctx.purchaseReturn.id}/status`, { newStatus: 'completed' })); });
  await test('RETURN-OVER', '退货', '累计超退被拦截', async () => { need(ctx.receipt2, '收货'); reject(await call('post', '/api/purchase/returns', returnBody(ctx.receipt2, 7))); });
  await test('RETURN-SPLIT-OVER', '退货', '同一入库明细拆行不能绕过累计可退量', async () => { need(ctx.receipt2, '收货'); const body = returnBody(ctx.receipt2, 4); body.items.push({ ...body.items[0] }); reject(await call('post', '/api/purchase/returns', body)); });
  await test('RETURN-BAD-LINE', '退货', '不能静默丢弃含负数的退货明细', async () => { need(ctx.receipt1, '收货'); const body = returnBody(ctx.receipt1, 1); body.items.push({ ...body.items[0], returnQuantity: -2 }); reject(await call('post', '/api/purchase/returns', body)); });
  await test('RETURN-BAD-DATE', '退货', '无效退货日期返回业务错误', async () => { need(ctx.receipt1, '收货'); reject(await call('post', '/api/purchase/returns', { ...returnBody(ctx.receipt1), returnDate: '2026-02-30' })); });
  await test('RETURN-DELETE-CANCEL', '退货', '草稿删除和取消释放可退数量', async () => { need(ctx.receipt1, '收货'); const r = await createReturn(ctx.receipt1); http(await call('delete', `/api/purchase/returns/${r.id}`)); const c = await createReturn(ctx.receipt1); http(await call('put', `/api/purchase/returns/${c.id}/status`, { newStatus: 'cancelled' })); });
}

function processingBody(quantity = 5) {
  return { processingDate: today, supplierId: ctx.supplierIds[0], expectedDeliveryDate: calendar.validityDate, remarks: prefix,
    materials: [{ materialId: ctx.materials[2].id, quantity }], products: [{ productId: ctx.materials[3].id, quantity, unitPrice: 3 }] };
}
async function auditOutsourced() {
  await test('OUT-CREATE', '委外', '创建和读取委外加工单', async () => {
    ctx.processing = http(await call('post', '/api/purchase/outsourced-processings', processingBody()), 201);
    ctx.processing = http(await call('get', `/api/purchase/outsourced-processings/${ctx.processing.id}`)); assert.equal(ctx.processing.status, 'pending'); assert.equal(Number(ctx.processing.totalAmount), 15);
    assert.ok(ctx.processing.materials[0].unit); assert.ok(ctx.processing.products[0].unit);
  });
  await test('OUT-EDIT', '委外', '待发料加工单可编辑', async () => { need(ctx.processing, '委外单'); http(await call('put', `/api/purchase/outsourced-processings/${ctx.processing.id}`, processingBody())); });
  await test('OUT-EMPTY', '委外', '拒绝缺少发料或成品的委外单', async () => { reject(await call('post', '/api/purchase/outsourced-processings', { ...processingBody(), materials: [] })); reject(await call('post', '/api/purchase/outsourced-processings', { ...processingBody(), products: [] })); });
  await test('OUT-ISSUE', '委外', '发料及独立财审扣料并自动创建待到货单', async () => {
    need(ctx.processing, '委外单'); const before = await stock(ctx.materials[2].id);
    http(await call('put', `/api/purchase/outsourced-processings/${ctx.processing.id}/status`, { status: 'in_progress' })); assert.equal(await stock(ctx.materials[2].id), before);
    await approveInventoryPosting(db, finance.api, ctx.processing.processingNo, { businessApi: api }); assert.equal(await stock(ctx.materials[2].id), before - 5);
    const r = await one("SELECT id FROM outsourced_processing_receipts WHERE processing_id=? AND status <> 'cancelled'", [ctx.processing.id]); need(r, '自动委外收货单');
    ctx.outReceipt = http(await call('get', `/api/purchase/outsourced-receipts/${r.id}`)); assert.equal(ctx.outReceipt.status, 'pending');
    assert.ok(ctx.outReceipt.items[0].unit);
  });
  await test('OUT-ISSUE-REPEAT', '委外', '重复发料不重复扣库存', async () => { need(ctx.outReceipt, '已发料'); const before = await stock(ctx.materials[2].id); http(await call('put', `/api/purchase/outsourced-processings/${ctx.processing.id}/status`, { status: 'in_progress' })); assert.equal(await stock(ctx.materials[2].id), before); });
  await test('OUT-FINAL-BYPASS', '委外', '禁止绕过到货检验直接入库或加工完成', async () => { need(ctx.outReceipt, '委外收货'); reject(await call('put', `/api/purchase/outsourced-receipts/${ctx.outReceipt.id}/status`, { status: 'confirmed' })); reject(await call('put', `/api/purchase/outsourced-processings/${ctx.processing.id}/status`, { status: 'completed' })); });
  await test('OUT-ARRIVE', '委外', '到货生成委外来源检验单', async () => {
    need(ctx.outReceipt, '委外收货'); ctx.outArrivalKey = crypto.randomUUID();
    const d = http(await call('post', `/api/purchase/outsourced-receipts/${ctx.outReceipt.id}/receive-with-inspection`, { items: [{ productId: ctx.materials[3].id, receiveQuantity: 5 }] }, api, { 'X-Idempotency-Key': ctx.outArrivalKey }));
    assert.equal(d.successCount, 1); ctx.outInspection = d.inspections[0];
  });
  await test('OUT-ARRIVE-REPLAY', '委外', '相同到货请求重放成功且不重复生成检验', async () => {
    need(ctx.outInspection, '委外检验'); const d = http(await call('post', `/api/purchase/outsourced-receipts/${ctx.outReceipt.id}/receive-with-inspection`, { items: [{ productId: ctx.materials[3].id, receiveQuantity: 5 }] }, api, { 'X-Idempotency-Key': ctx.outArrivalKey })); assert.ok(d.idempotentReplay);
    assert.equal(Number((await one("SELECT COUNT(*) n FROM quality_inspections WHERE source_type='outsourced_receipt' AND reference_id=?", [ctx.outReceipt.id])).n), 1);
  });
  await test('OUT-INSPECT', '委外', '委外来料检验合格可放行', async () => { need(ctx.outInspection, '委外检验'); await inspect({ ...ctx.outInspection, quantity: 5 }); });
  await test('OUT-RECEIPT', '委外', '委外收货确认并财审，成品正式入库', async () => {
    need(ctx.outInspection, '委外检验'); const before = await stock(ctx.materials[3].id);
    http(await call('put', `/api/purchase/outsourced-receipts/${ctx.outReceipt.id}/status`, { status: 'confirmed' })); assert.equal(await stock(ctx.materials[3].id), before);
    await approveInventoryPosting(db, finance.api, ctx.outReceipt.receiptNo, { businessApi: api }); assert.equal(await stock(ctx.materials[3].id), before + 5);
    http(await call('put', `/api/purchase/outsourced-receipts/${ctx.outReceipt.id}/status`, { status: 'completed' }));
    const processing = http(await call('get', `/api/purchase/outsourced-processings/${ctx.processing.id}`)); assert.equal(processing.status, 'completed'); ctx.outCompleted = true;
  });
  await test('OUT-COMPLETE-EDIT', '委外', '已完成委外加工和收货禁止改删或取消', async () => { need(ctx.outCompleted, '委外已完成'); reject(await call('put', `/api/purchase/outsourced-processings/${ctx.processing.id}`, processingBody(8))); reject(await call('delete', `/api/purchase/outsourced-processings/${ctx.processing.id}`)); reject(await call('put', `/api/purchase/outsourced-receipts/${ctx.outReceipt.id}/status`, { status: 'cancelled' })); });
  await test('OUT-DELETE', '委外', '待发料委外单可删除', async () => { const p = http(await call('post', '/api/purchase/outsourced-processings', processingBody()), 201); http(await call('delete', `/api/purchase/outsourced-processings/${p.id}`)); });
}

async function auditBoundaries() {
  await test('REQ-AUTO-REPLAY', '请购边界', '审批回调并发重放不能重复生成采购订单', async () => {
    const requisition = await createRequisition(7);
    http(await call('put', `/api/purchase/requisitions/${requisition.id}/status`, { newStatus: 'submitted' }));
    await finishWorkflow('purchase_requisition', requisition.id);
    const before = await one('SELECT COUNT(*) n FROM purchase_orders WHERE requisition_id=? AND deleted_at IS NULL', [requisition.id]);
    const { generateOrdersFromRequisition } = require('../src/services/business/RequisitionAutoOrderService');
    await Promise.all([generateOrdersFromRequisition(requisition.id, null, ctx.actorId), generateOrdersFromRequisition(requisition.id, null, ctx.actorId)]);
    assert.equal(Number((await one('SELECT COUNT(*) n FROM purchase_orders WHERE requisition_id=? AND deleted_at IS NULL', [requisition.id])).n), Number(before.n));
  });
  await test('REQ-AUTO-REMAINDER', '请购边界', '自动转单只补足人工采购后剩余数量', async () => {
    const requisition = http(await call('post', '/api/purchase/requisitions', {
      ...requisitionBody(7), materials: [
        { materialId: ctx.materials[0].id, quantity: 2 },
        { materialId: ctx.materials[0].id, quantity: 5 },
      ],
    }), 201);
    http(await call('put', `/api/purchase/requisitions/${requisition.id}/status`, { newStatus: 'submitted' }));
    await finishWorkflow('purchase_requisition', requisition.id);
    const existing = await one('SELECT id FROM purchase_orders WHERE requisition_id=? AND deleted_at IS NULL', [requisition.id]);
    http(await call('put', `/api/purchase/orders/${existing.id}/status`, { newStatus: 'cancelled' }));
    await createOrder(3, ctx.materials[0], { requisitionId: requisition.id });
    const detail = http(await call('get', `/api/purchase/requisitions/${requisition.id}`));
    const listed = http(await call('get', `/api/purchase/requisitions?keyword=${encodeURIComponent(detail.requisitionNo)}`)).items[0];
    for (const item of [detail, listed]) {
      assert.equal(item.isFullyOrdered, false); assert.equal(item.isPartiallyOrdered, true);
      assert.deepEqual(item.items.map(line => Number(line.orderedQuantity)), [2, 1]);
    }
    const { generateOrdersFromRequisition } = require('../src/services/business/RequisitionAutoOrderService');
    await generateOrdersFromRequisition(requisition.id, null, ctx.actorId);
    const total = await one("SELECT SUM(poi.quantity) n FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.order_id WHERE po.requisition_id=? AND po.deleted_at IS NULL AND po.status <> 'cancelled'", [requisition.id]);
    assert.equal(Number(total.n), 7);
  });
  await test('ORDER-BATCH-SUBMIT', '批量操作', '批量提交订单逐单创建审批流程', async () => {
    const orders = [await createOrder(2), await createOrder(3)];
    const submitted = http(await call('put', '/api/purchase/orders/batch-status', { orderIds: orders.map(o => o.id), newStatus: 'pending' }));
    assert.equal(submitted.successCount, 2); assert.equal(submitted.failCount, 0);
    for (const order of orders) {
      await finishWorkflow('purchase_order', order.id);
      assert.equal(http(await call('get', `/api/purchase/orders/${order.id}`)).status, 'approved');
    }
  });
  await test('ORDER-BATCH-CANCEL', '批量操作', '批量取消保留已到货订单并返回失败原因', async () => {
    const empty = await createOrder(2); const arrived = await approveOrder(await createOrder(2)); await arrive(arrived, 1);
    const result = http(await call('put', '/api/purchase/orders/batch-status', { orderIds: [empty.id, arrived.id], newStatus: 'cancelled' }));
    assert.equal(result.successCount, 1); assert.equal(result.failCount, 1);
    assert.equal(http(await call('get', `/api/purchase/orders/${arrived.id}`)).status, 'partial_received');
    assert.equal(http(await call('get', `/api/purchase/orders/${empty.id}`)).status, 'cancelled');
  });
  await test('ARRIVAL-MANUAL-RESERVATION', '收货边界', '手工草稿和到货同时占用时不能超出订单', async () => {
    const order = await approveOrder(await createOrder(5)); await createReceipt(order, 4);
    reject(await call('post', `/api/purchase/orders/${order.id}/receive-with-inspection`, { items: [{ materialId: ctx.materials[0].id, receiveQuantity: 2 }] }));
  });
  await test('RECEIPT-EDIT-SOURCE-PRICE', '页面契约', '收货编辑省略价格时保留来源价税和明细ID', async () => {
    const order = await approveOrder(await createOrder());
    const created = await createReceipt(order, 2);
    const receipt = http(await call('get', `/api/purchase/receipts/${created.id}`));
    http(await call('put', `/api/purchase/receipts/${receipt.id}`, {
      orderId: order.id, receiptDate: today, warehouseId: ctx.locationId,
      items: [{ id: receipt.items[0].id, orderItemId: order.items[0].id, materialId: ctx.materials[0].id, receivedQuantity: 3, qualifiedQuantity: 3 }],
    }));
    const edited = http(await call('get', `/api/purchase/receipts/${receipt.id}`));
    assert.equal(Number(edited.items[0].unitPrice), 10); assert.equal(Number(edited.totalAmount), 33.9);
  });
  await test('RETURN-FORM-CONTRACT', '页面契约', '退货详情保留来源、日期、仓库、税率和行原因', async () => {
    const flow = await makeReceivedOrder(3);
    const body = returnBody(flow.receipt, 1); body.items[0].returnReason = '质量问题';
    const created = http(await call('post', '/api/purchase/returns', body), 201);
    const detail = http(await call('get', `/api/purchase/returns/${created.id}`));
    assert.equal(detail.receiptId, flow.receipt.id); assert.equal(detail.returnDate, today);
    assert.equal(Number(detail.warehouseId), ctx.locationId); assert.ok(detail.supplierName);
    assert.equal(detail.reason, body.reason); assert.equal(detail.items[0].receiptItemId, flow.receipt.items[0].id);
    assert.equal(detail.items[0].returnReason, '质量问题'); assert.equal(Number(detail.items[0].taxRate), 0.13);
    const source = http(await call('get', `/api/purchase/receipts/${flow.receipt.id}`)); assert.equal(Number(source.items[0].returnedQuantity), 1);
    http(await call('put', `/api/purchase/returns/${created.id}`, { ...body, items: [{ ...body.items[0], returnQuantity: 2 }] }));
    assert.equal(Number(http(await call('get', `/api/purchase/returns/${created.id}`)).totalAmount), 22.6);
  });
  await test('RECEIPT-CANCEL-SYNC', '收货边界', '手工确认收货取消后恢复订单剩余数量', async () => {
    const order = await approveOrder(await createOrder()); const receipt = await createReceipt(order, 3);
    http(await call('put', `/api/purchase/receipts/${receipt.id}/status`, { status: 'confirmed' }));
    http(await call('put', `/api/purchase/receipts/${receipt.id}/status`, { status: 'cancelled' }));
    const updated = http(await call('get', `/api/purchase/orders/${order.id}`));
    assert.equal(Number(updated.items[0].receivedQuantity), 0); assert.equal(updated.status, 'approved');
  });
  await test('ARRIVAL-CONCURRENT', '并发', '同时到货不能超过订单数量且不返回500', async () => {
    const order = await approveOrder(await createOrder(5));
    const replies = await Promise.all([1, 2].map(() => call('post', `/api/purchase/orders/${order.id}/receive-with-inspection`, { items: [{ materialId: ctx.materials[0].id, receiveQuantity: 4 }] })));
    assert.equal(replies.filter(r => r.status === 200).length, 1); replies.filter(r => r.status !== 200).forEach(reject);
    const updated = http(await call('get', `/api/purchase/orders/${order.id}`)); assert.equal(Number(updated.items[0].receivedQuantity), 4);
  });
  await test('RECEIPT-CONCURRENT', '并发', '同时创建收货草稿不能超占订单数量', async () => {
    const order = await approveOrder(await createOrder(5));
    const replies = await Promise.all([1, 2].map(() => call('post', '/api/purchase/receipts', receiptBody(order, 4), api, { 'Idempotency-Key': crypto.randomUUID() })));
    assert.equal(replies.filter(r => r.status === 201).length, 1); replies.filter(r => r.status !== 201).forEach(reject);
  });
  await test('RETURN-CONCURRENT', '并发', '同时退货不能超占原收货可退数量', async () => {
    const flow = await makeReceivedOrder(5);
    const replies = await Promise.all([1, 2].map(() => call('post', '/api/purchase/returns', returnBody(flow.receipt, 4))));
    assert.equal(replies.filter(r => r.status === 201).length, 1); replies.filter(r => r.status !== 201).forEach(reject);
  });
  await test('ORDER-SAME-MATERIAL-LINES', '订单边界', '同物料不同价格逐行到货、检验、入库和生成应付', async () => {
    const order = await approveOrder(await createOrder(4, ctx.materials[0], { items: [
      { materialId: ctx.materials[0].id, quantity: 4, price: 10, taxRate: 0.13 },
      { materialId: ctx.materials[0].id, quantity: 6, price: 20, taxRate: 0 },
    ] }));
    const first = await arrive(order, 4, ctx.materials[0], { orderItemId: order.items[0].id });
    const afterFirst = http(await call('get', `/api/purchase/orders/${order.id}`));
    assert.deepEqual(afterFirst.items.map(item => Number(item.receivedQuantity)), [4, 0]);
    await inspect(first); const receipt1 = await receiptFromInspection(first); await completeReceipt(receipt1);
    const second = await arrive(order, 6, ctx.materials[0], { orderItemId: order.items[1].id });
    await inspect(second); const receipt2 = await receiptFromInspection(second); await completeReceipt(receipt2);
    assert.equal(Number(receipt1.totalAmount), 45.2); assert.equal(Number(receipt2.totalAmount), 120);
    assert.equal(receipt2.items[0].orderItemId, order.items[1].id);
    http(await call('post', `/api/finance/integration/ap-invoice/${receipt2.id}`, {}, finance.api));
    const ap = await one("SELECT total_amount FROM ap_invoices WHERE source_type IN ('inbound','purchase_receipt') AND source_id=? AND status <> 'voided'", [receipt2.id]);
    assert.equal(Number(ap.total_amount), 120);
    assert.equal(http(await call('get', `/api/purchase/orders/${order.id}`)).status, 'completed');
  });
  await test('INSPECTION-PARTIAL-REPLACE', '质量边界', '部分不合格只入合格数，补货后能正常完成订单', async () => {
    const order = await approveOrder(await createOrder(5)); const first = await arrive(order, 5);
    await inspect(first, 3); const receipt = await receiptFromInspection(first);
    assert.equal(Number(receipt.items[0].qualifiedQuantity), 3); assert.equal(Number(receipt.totalAmount), 33.9);
    await completeReceipt(receipt);
    const next = await arrive(order, 2); await inspect(next); await completeReceipt(await receiptFromInspection(next));
    const done = http(await call('get', `/api/purchase/orders/${order.id}`)); assert.equal(done.status, 'completed'); assert.equal(Number(done.items[0].warehousedQuantity), 5);
  });
  await test('INSPECTION-FAILED-REPLACE', '质量边界', '全不合格不产生入库，重新到货后可正常检验', async () => {
    const order = await approveOrder(await createOrder(3)); const first = await arrive(order, 3); await inspect(first, 0);
    assert.equal(Number((await one('SELECT COUNT(*) n FROM purchase_receipts WHERE inspection_id=?', [first.id])).n), 0);
    const next = await arrive(order, 3); await inspect(next); await completeReceipt(await receiptFromInspection(next));
    assert.equal(http(await call('get', `/api/purchase/orders/${order.id}`)).status, 'completed');
  });
  await test('RETURN-REPLENISH', '退货边界', '完成退货后补货不会被累计历史检验数量阻断', async () => {
    const flow = await makeReceivedOrder(2); const returned = await createReturn(flow.receipt, 1);
    http(await call('put', `/api/purchase/returns/${returned.id}/status`, { newStatus: 'confirmed' }));
    http(await call('put', `/api/purchase/returns/${returned.id}/status`, { newStatus: 'completed' }));
    await approveInventoryPosting(db, finance.api, returned.returnNo, { businessApi: api });
    const next = await arrive(flow.order, 1); await inspect(next); await completeReceipt(await receiptFromInspection(next));
    const done = http(await call('get', `/api/purchase/orders/${flow.order.id}`)); assert.equal(done.status, 'completed'); assert.equal(Number(done.items[0].warehousedQuantity), 2);
  });
}

async function createOutsourcedFlow(quantity = 5) {
  const processing = http(await call('post', '/api/purchase/outsourced-processings', processingBody(quantity)), 201);
  http(await call('put', `/api/purchase/outsourced-processings/${processing.id}/status`, { status: 'confirmed' }));
  await approveInventoryPosting(db, finance.api, processing.processingNo, { businessApi: api });
  const issueVoucher = await eventually(() => one(`SELECT ge.id, SUM(gei.debit_amount) AS total_debit, SUM(gei.credit_amount) AS total_credit
    FROM gl_entries ge JOIN gl_entry_items gei ON gei.entry_id = ge.id
    WHERE ge.document_type='outsourced_issue' AND ge.document_number=? AND ge.is_posted=1 AND COALESCE(ge.is_reversed,0)=0
    GROUP BY ge.id`, [processing.processingNo]), row => !!row, '委外发料财务凭证未生成');
  assert.equal(Number(issueVoucher.total_debit), quantity * 10); assert.equal(Number(issueVoucher.total_credit), quantity * 10);
  const row = await one('SELECT id FROM outsourced_processing_receipts WHERE processing_id=? ORDER BY id DESC LIMIT 1', [processing.id]);
  const receipt = http(await call('get', `/api/purchase/outsourced-receipts/${row.id}`));
  return { processing, receipt };
}
async function outsourcedArrival(receipt, quantity, key = crypto.randomUUID()) {
  return call('post', `/api/purchase/outsourced-receipts/${receipt.id}/receive-with-inspection`, { items: [{ productId: ctx.materials[3].id, receiveQuantity: quantity }] }, api, { 'X-Idempotency-Key': key });
}
async function auditOutsourcedBoundaries() {
  await test('OUT-REPLAY-HISTORY', '委外边界', '第二批到货后重试第一批仍只返回第一批结果', async () => {
    const { receipt } = await createOutsourcedFlow(); const key = crypto.randomUUID();
    const first = http(await outsourcedArrival(receipt, 2, key));
    http(await outsourcedArrival(receipt, 1));
    const replay = http(await outsourcedArrival(receipt, 2, key));
    assert.ok(replay.idempotentReplay); assert.equal(replay.inspections[0].id, first.inspections[0].id);
    assert.equal(Number((await one('SELECT SUM(actual_quantity) n FROM outsourced_processing_receipt_items WHERE receipt_id=?', [receipt.id])).n), 3);
  });
  await test('OUT-REPLAY-MISMATCH', '委外边界', '相同到货幂等键不能用于不同数量', async () => {
    const { receipt } = await createOutsourcedFlow(); const key = crypto.randomUUID();
    http(await outsourcedArrival(receipt, 2, key)); reject(await outsourcedArrival(receipt, 3, key));
  });
  await test('OUT-ARRIVAL-BAD-LINE', '委外边界', '负数到货明细必须整单拦截', async () => {
    const { receipt } = await createOutsourcedFlow();
    reject(await call('post', `/api/purchase/outsourced-receipts/${receipt.id}/receive-with-inspection`, {
      items: [{ productId: ctx.materials[3].id, receiveQuantity: 1 }, { productId: ctx.materials[3].id, receiveQuantity: -1 }],
    }, api, { 'X-Idempotency-Key': crypto.randomUUID() }));
  });
  await test('OUT-INVALID-DATE', '委外边界', '非法日历日期返回业务错误', async () => {
    reject(await call('post', '/api/purchase/outsourced-processings', { ...processingBody(), processingDate: '2026-02-30' }));
  });
  await test('OUT-PARTIAL-RECEIPTS', '委外边界', '部分不合格只计合格入库，第二张收货能完成剩余数量', async () => {
    const { processing, receipt } = await createOutsourcedFlow();
    const first = http(await outsourcedArrival(receipt, 3)); await inspect(first.inspections[0], 2);
    const before = await stock(ctx.materials[3].id);
    http(await call('put', `/api/purchase/outsourced-receipts/${receipt.id}/status`, { status: 'confirmed' }));
    await approveInventoryPosting(db, finance.api, receipt.receiptNo, { businessApi: api });
    assert.equal(await stock(ctx.materials[3].id), before + 2);
    http(await call('put', `/api/purchase/outsourced-receipts/${receipt.id}/status`, { status: 'completed' }));
    const source = http(await call('get', `/api/purchase/outsourced-receipts/options/processings/${processing.id}`));
    const product = source.products[0]; evidence(product); assert.equal(Number(product.receivableQuantity), 3);
    const next = http(await call('post', '/api/purchase/outsourced-receipts', {
      processingId: processing.id, receiptDate: today, warehouseId: ctx.locationId, operator: prefix,
      items: [{ productId: ctx.materials[3].id, expectedQuantity: 3, actualQuantity: 0, unitPrice: 3 }],
    }), 201);
    const arrival = http(await outsourcedArrival(next, 3)); await inspect(arrival.inspections[0]);
    http(await call('put', `/api/purchase/outsourced-receipts/${next.id}/status`, { status: 'confirmed' }));
    await approveInventoryPosting(db, finance.api, next.receiptNo, { businessApi: api });
    http(await call('put', `/api/purchase/outsourced-receipts/${next.id}/status`, { status: 'completed' }));
    assert.equal(http(await call('get', `/api/purchase/outsourced-processings/${processing.id}`)).status, 'completed');
  });
  await test('OUT-CANCEL-REVERSAL', '委外边界', '取消已发料委外生成待审冲回，财审后恢复库存', async () => {
    const before = await stock(ctx.materials[2].id); const { processing, receipt } = await createOutsourcedFlow();
    assert.equal(await stock(ctx.materials[2].id), before - 5);
    http(await call('put', `/api/purchase/outsourced-receipts/${receipt.id}/status`, { status: 'cancelled' }));
    http(await call('put', `/api/purchase/outsourced-processings/${processing.id}/status`, { status: 'cancelled' }, reviewer.api));
    assert.equal(await stock(ctx.materials[2].id), before - 5);
    const reversal = await one("SELECT source_no FROM inventory_posting_documents WHERE source_no LIKE ? AND posting_kind='reversal' ORDER BY id DESC LIMIT 1", [`%${processing.processingNo}%`]);
    need(reversal, '委外取消冲回过账');
    const reversalFinance = await createFinanceActor(app, db, prefix, `finance2_${Date.now()}`);
    await approveInventoryPosting(db, reversalFinance.api, reversal.source_no, { businessApi: reviewer.api, postingKind: 'reversal' });
    assert.equal(await stock(ctx.materials[2].id), before);
  });
}

async function main() {
  console.log(`采购流程测试：${database}，业务日期 ${today}`);
  console.log('负数、超量、重复等请求是负例；正确拦截计为 PASS，真实故障计为 FAIL。');
  console.log(`完整应用日志：${process.env.LOG_DIR}`);
  await setup();
  for (const audit of [auditReads, auditRequisitions, auditOrders, auditReceipts, auditReturns, auditOutsourced, auditBoundaries, auditOutsourcedBoundaries]) await audit();
  await test('READ-HISTORY-CONTENT', '查询', '采购历史筛选返回本次测试的完成收货及正确数量', async () => {
    need(ctx.receipt1, '收货');
    const history = http(await call('get', `/api/purchase/receipts/history-items?materialCode=${ctx.materials[0].code}&startDate=${today}&endDate=${today}&pageSize=100`));
    const lines = history.list || history.items || history.rows || [];
    const line = lines.find(item => Number(item.receiptId) === Number(ctx.receipt1.id));
    assert.ok(line); assert.equal(Number(line.quantity), 4); assert.ok(line.unit);
    assert.equal(Number(line.totalAmount), 45.2); assert.equal(Number(line.unitPrice), 10);
    const materialHistory = http(await call('get', `/api/purchase/receipts/material/${ctx.materials[0].id}?pageSize=100&startDate=${today}&endDate=${today}`));
    const materialLine = (materialHistory.list || materialHistory.items || materialHistory.rows).find(item => Number(item.id) === Number(ctx.receipt1.id));
    assert.ok(materialLine); assert.equal(Number(materialLine.quantity), 4); assert.equal(Number(materialLine.totalAmount), 45.2); assert.ok(materialLine.unit);
  });
  await test('READ-DASHBOARD-CONTENT', '查询', '采购看板统计排除删除单据，金额排除取消单且支持12个月', async () => {
    for (const months of [6, 12]) {
      const dashboard = http(await call('get', `/api/purchase/dashboard-statistics?months=${months}`));
      assert.equal(dashboard.months, months);
      for (const [key, table] of Object.entries({ requisitions: 'purchase_requisitions', orders: 'purchase_orders', receipts: 'purchase_receipts', returns: 'purchase_returns' })) {
        const expected = await one(`SELECT COUNT(*) total FROM ${table} WHERE deleted_at IS NULL`);
        assert.equal(Number(dashboard.statistics[key].total), Number(expected.total));
      }
      const expected = await one(`SELECT COUNT(*) count, COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total_amount ELSE 0 END),0) amount
        FROM purchase_orders WHERE deleted_at IS NULL
          AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
          AND created_at < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)`);
      const currentMonth = dashboard.trendData.find(item => item.month === today.slice(0,7));
      assert.ok(currentMonth); assert.equal(Number(currentMonth.orderCount), Number(expected.count));
      assert.ok(Math.abs(Number(currentMonth.orderAmount) - Number(expected.amount)) < 0.01);
    }
    reject(await call('get', '/api/purchase/dashboard-statistics?months=invalid'));
  });
  await test('READ-RECEIPT-STATS', '查询', '收货统计按单头计数，金额包含税且排除取消单', async () => {
    const stats = http(await call('get', '/api/purchase/receipts-statistics'));
    const expected = await one("SELECT COUNT(*) total, SUM(status='draft') drafts, SUM(CASE WHEN status <> 'cancelled' THEN total_amount ELSE 0 END) amount FROM purchase_receipts WHERE deleted_at IS NULL");
    assert.equal(Number(stats.total), Number(expected.total)); assert.equal(Number(stats.draftCount), Number(expected.drafts));
    assert.ok(Math.abs(Number(stats.totalAmount) - Number(expected.amount)) < 0.01);
  });
  await test('READ-REQUISITION-STATS', '查询', '请购物料搜索与全部筛选结果统计一致，翻到空页不丢总数', async () => {
    const expected = await one(`SELECT COUNT(*) total, SUM(r.status='draft') drafts
      FROM purchase_requisitions r WHERE r.deleted_at IS NULL AND EXISTS (
        SELECT 1 FROM purchase_requisition_items ri WHERE ri.requisition_id=r.id AND ri.material_code=?
      )`, [ctx.materials[0].code]);
    const query = `/api/purchase/requisitions?keyword=${encodeURIComponent(ctx.materials[0].code)}&pageSize=1`;
    const first = http(await call('get', query));
    assert.equal(first.items.length, 1); assert.equal(Number(first.total), Number(expected.total));
    assert.equal(Number(first.statistics.total), Number(expected.total));
    assert.equal(Number(first.statistics.draftCount), Number(expected.drafts));
    const empty = http(await call('get', `${query}&page=99999`));
    assert.equal(empty.items.length, 0); assert.deepEqual(empty.statistics, first.statistics); assert.equal(empty.total, first.total);
  });
  for (const config of [
    { id: 'ORDER', path: 'orders', table: 'purchase_orders', state: 'pending', field: 'pendingCount', money: true },
    { id: 'RECEIPT', path: 'receipts', table: 'purchase_receipts', state: 'draft', field: 'draftCount', money: true },
    { id: 'RETURN', path: 'returns', table: 'purchase_returns', state: 'draft', field: 'draftCount', money: true },
    { id: 'OUT', path: 'outsourced-processings', table: 'outsourced_processings', state: 'in_progress', field: 'inProgressCount' },
    { id: 'OUT-RECEIPT', path: 'outsourced-receipts', table: 'outsourced_processing_receipts', state: 'arrived', field: 'arrivedCount' },
  ]) {
    await test(`READ-${config.id}-LIST-STATS`, '查询', `${config.path} 的统计覆盖全部筛选数据并保持翻页一致`, async () => {
      const filter = config.money ? `supplierId=${ctx.supplierIds[0]}` : `supplierName=${encodeURIComponent(prefix)}`;
      const where = config.money ? 'supplier_id=? AND deleted_at IS NULL' : 'supplier_name LIKE ?';
      const expected = await one(`SELECT COUNT(*) total, SUM(status=?) stateCount
        ${config.money ? ", SUM(CASE WHEN status <> 'cancelled' THEN total_amount ELSE 0 END) amount" : ''}
        FROM ${config.table} WHERE ${where}`, [config.state, config.money ? ctx.supplierIds[0] : `%${prefix}%`]);
      const response = await call('get', `/api/purchase/${config.path}?${filter}&pageSize=1`); http(response);
      const first = response.body.data;
      assert.equal((first.list || first.items || first.data).length, 1);
      assert.equal(Number(first.statistics.total), Number(expected.total));
      assert.equal(Number(first.statistics[config.field]), Number(expected.stateCount));
      if (config.money) assert.ok(Math.abs(Number(first.statistics.totalAmount) - Number(expected.amount)) < 0.01);
      const emptyResponse = await call('get', `/api/purchase/${config.path}?${filter}&pageSize=1&page=99999`); http(emptyResponse);
      assert.deepEqual(emptyResponse.body.data.statistics, first.statistics);
    });
  }
  await test('DATA-RECEIVED-RULE', '数据一致性', '收货净数量审计与订单、检验和退货的结果一致', async () => {
    const { consistencyRules } = require('../src/services/business/DataConsistencyRules');
    const rule = consistencyRules.find(r => r.id === 'purchase.order_received_quantity_matches_receipts');
    const issues = await rows(`${rule.sql} AND poi.material_id IN (?)`, [ctx.materials.map(m => m.id)]);
    evidence(issues); assert.equal(issues.length, 0);
  });
  const unknown = only ? [...only].filter(id => !executed.has(id)) : [];
  assert.equal(unknown.length, 0, `未知测试用例：${unknown.join(', ')}`);
  report.finishedAt = new Date().toISOString(); save();
  process.exitCode = auditExitCode(report);
  console.log(`结果：通过 ${report.summary.PASS || 0}，失败 ${report.summary.FAIL || 0}，受阻 ${report.summary.BLOCKED || 0}。退出码：${process.exitCode}`);
  console.log(`本次结果快照：${path.join(runDir, 'functional-results.json')}`);
}
main().catch(error => { report.fatal = error.stack; save(); console.error(error.stack); process.exitCode = 1; }).finally(async () => {
  await new Promise(resolve => setTimeout(resolve, 400));
  await require('../src/database/ConnectionPoolFactory').closeAll();
  process.exit(process.exitCode || 0);
});
