/**
 * 生产 + 仓库 主流程冒烟（真实 API + 数据库）
 *
 * 覆盖：
 * 1. 架构守卫：任务禁止 PUT completed；出库/入库创建禁止 completed 直接扣库
 * 2. 生产发料：draft→confirmed→completed 才扣库；撤销冲销回库
 * 3. 任务生命周期：in_progress → completeTask → inspection（非 PUT completed）
 * 4. 成品入库完成写库存；completed→reversed 冲销
 * 5. 销售发货核销预留
 *
 * 用法：node scripts/test-production-inventory-flow.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DISABLE_CRON = 'true';
process.env.ENABLE_RATE_LIMIT = 'false';

const { assertSafeLiveDatabase } = require('./lib/assert-safe-live-database');
assertSafeLiveDatabase({
  enableFlag: 'RUN_DESTRUCTIVE_PRODUCTION_FLOW',
  expectedFlag: 'I_UNDERSTAND_THIS_WRITES_DATA',
  scriptName: 'test-production-inventory-flow',
});

const request = require('supertest');
const dayjs = require('dayjs');
const db = require('../src/config/db');
const InventoryService = require('../src/services/InventoryService');
const InventoryReservationService = require('../src/services/InventoryReservationService');

const app = require('../src/app');

const results = [];
let pass = 0;
let fail = 0;

function ok(name, detail = '') {
  pass += 1;
  results.push({ status: 'PASS', name, detail });
  console.log(`✅ PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}

function bad(name, detail = '') {
  fail += 1;
  results.push({ status: 'FAIL', name, detail });
  console.error(`❌ FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function step(name, fn, { fatal = false } = {}) {
  try {
    const detail = await fn();
    ok(name, typeof detail === 'string' ? detail : detail?._detail || '');
    return detail;
  } catch (error) {
    bad(name, error.message || String(error));
    if (fatal) throw error;
    return null;
  }
}

async function q(sql, params = []) {
  const [rows] = await db.pool.execute(sql, params);
  return rows;
}

function dataOf(res) {
  const body = res.body || {};
  if (body.data && body.data.data) return body.data.data;
  return body.data || body;
}

function assertStatus(res, expected, label) {
  const list = Array.isArray(expected) ? expected : [expected];
  if (!list.includes(res.status)) {
    throw new Error(
      `${label} 期望 HTTP ${list.join('/')}, 实际 ${res.status}: ${JSON.stringify(res.body).slice(0, 600)}`
    );
  }
}

async function createAuthClient() {
  const agent = request.agent(app);
  const username = process.env.TEST_ADMIN_USERNAME || 'admin';
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!password) throw new Error('TEST_ADMIN_PASSWORD is required');

  const loginRes = await agent.post('/api/auth/login').send({ username, password });
  if (loginRes.status !== 200) {
    throw new Error(`登录失败 HTTP ${loginRes.status}: ${JSON.stringify(loginRes.body)}`);
  }

  const csrfRes = await agent.get('/api/csrf-token');
  const csrf =
    csrfRes.body.csrfToken || csrfRes.body.token || csrfRes.body.data?.csrfToken || '';
  if (!csrf) {
    throw new Error(`无法获取 CSRF: ${JSON.stringify(csrfRes.body)}`);
  }

  return {
    get: (url) => agent.get(url),
    post: (url, body) =>
      agent.post(url).set('Content-Type', 'application/json').set('X-CSRF-Token', csrf).send(body),
    put: (url, body) =>
      agent.put(url).set('Content-Type', 'application/json').set('X-CSRF-Token', csrf).send(body),
  };
}

async function stockOf(materialId, locationId) {
  const rows = await q(
    `SELECT COALESCE(SUM(quantity), 0) AS qty
     FROM inventory_ledger
     WHERE material_id = ? AND location_id = ?`,
    [materialId, locationId]
  );
  return Number(rows[0]?.qty || 0);
}

async function prepareMaster(prefix) {
  const today = dayjs().format('YYYY-MM-DD');
  const units = await q('SELECT id FROM units WHERE deleted_at IS NULL ORDER BY id LIMIT 1');
  const locations = await q(
    'SELECT id FROM locations WHERE deleted_at IS NULL ORDER BY id LIMIT 3'
  );
  const sources = await q(
    'SELECT id, type FROM material_sources WHERE deleted_at IS NULL ORDER BY id'
  );
  const periods = await q(
    `SELECT id FROM gl_periods
     WHERE is_closed = 0 AND start_date <= ? AND end_date >= ?
     ORDER BY id DESC LIMIT 1`,
    [today, today]
  );

  if (!units.length || locations.length < 2 || !periods.length) {
    throw new Error('需要至少 1 个单位、2 个库位、1 个开放会计期间');
  }

  const external = sources.find((s) => s.type === 'external') || sources[0];
  const internal = sources.find((s) => s.type === 'internal') || sources[0];
  if (!external || !internal) throw new Error('缺少 material_sources');

  const unitId = units[0].id;
  const rawLocationId = locations[0].id;
  const fgLocationId = locations[2]?.id || locations[1].id;
  const conn = await db.pool.getConnection();
  try {
    await conn.beginTransaction();

    const [supplier] = await conn.execute(
      `INSERT INTO suppliers (code, name, contact_person, contact_phone, status, remark)
       VALUES (?, ?, 'SMOKE', '13800000001', 1, ?)`,
      [`${prefix}-SUP`, `${prefix} Supplier`, prefix]
    );
    const [customer] = await conn.execute(
      `INSERT INTO customers (code, name, contact_person, contact_phone, status, remark)
       VALUES (?, ?, 'SMOKE', '13900000001', 'active', ?)`,
      [`${prefix}-CUS`, `${prefix} Customer`, prefix]
    );
    const [raw] = await conn.execute(
      `INSERT INTO materials
       (code, name, material_source_id, supplier_id, unit_id, location_id,
        specs, material_type, price, cost_price, status, remark)
       VALUES (?, ?, ?, ?, ?, ?, 'SMOKE-RM', 'raw', 5, 5, 1, ?)`,
      [`${prefix}-RM`, `${prefix} RM`, external.id, supplier.insertId, unitId, rawLocationId, prefix]
    );
    const [fg] = await conn.execute(
      `INSERT INTO materials
       (code, name, material_source_id, unit_id, location_id,
        specs, material_type, price, cost_price, status, remark)
       VALUES (?, ?, ?, ?, ?, 'SMOKE-FG', 'finished', 30, 12, 1, ?)`,
      [`${prefix}-FG`, `${prefix} FG`, internal.id, unitId, fgLocationId, prefix]
    );
    const [bom] = await conn.execute(
      `INSERT INTO bom_masters (product_id, version, status, remark, created_by, approved_at)
       VALUES (?, 'S1', 1, ?, 'smoke', NOW())`,
      [fg.insertId, prefix]
    );
    await conn.execute(
      `INSERT INTO bom_details (bom_id, material_id, quantity, unit_id, remark)
       VALUES (?, ?, 1, ?, ?)`,
      [bom.insertId, raw.insertId, unitId, prefix]
    );
    const [tpl] = await conn.execute(
      `INSERT INTO process_templates (code, name, product_id, description, status)
       VALUES (?, ?, ?, ?, 1)`,
      [`${prefix}-TPL`, `${prefix} TPL`, fg.insertId, prefix]
    );
    await conn.execute(
      `INSERT INTO process_template_details
       (template_id, order_num, name, description, standard_hours, department, remark)
       VALUES (?, 1, 'Assembly', 'smoke', 0.5, 'SMOKE', ?)`,
      [tpl.insertId, prefix]
    );

    await conn.commit();
    return {
      prefix,
      unitId,
      rawLocationId,
      fgLocationId,
      supplierId: supplier.insertId,
      customerId: customer.insertId,
      rawMaterialId: raw.insertId,
      productId: fg.insertId,
      bomId: bom.insertId,
      processTemplateId: tpl.insertId,
      manager: `${prefix}-mgr`,
      productionQty: 5,
      rawUsageQty: 5,
      salesQty: 3,
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function seedStock(materialId, locationId, qty, batch, operator) {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();
    await InventoryService.updateStock(
      {
        materialId,
        locationId,
        quantity: qty,
        transactionType: 'adjustment_in',
        referenceNo: `SMOKE-SEED-${batch}`,
        referenceType: 'smoke_seed',
        operator,
        batchNumber: batch,
        remark: 'smoke seed stock',
        idempotencyKey: `smoke_seed:${batch}:${materialId}:${locationId}`,
      },
      connection
    );
    await connection.commit();
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
}

async function passInspection(api, inspection) {
  const quantity = Number(inspection.quantity || 0);
  const itemsRes = await api.get(`/api/quality/inspections/${inspection.id}/items`);
  if (itemsRes.status === 200) {
    const items = dataOf(itemsRes);
    const judged = (Array.isArray(items) ? items : []).map((item) => ({
      ...item,
      result: 'passed',
      is_qualified: 1,
      actual_value: item.actual_value || item.standard || 'ok',
    }));
    const res = await api.put(`/api/quality/inspections/${inspection.id}`, {
      status: 'passed',
      qualified_quantity: quantity,
      unqualified_quantity: 0,
      actual_date: dayjs().format('YYYY-MM-DD'),
      first_article_result: 'passed',
      production_can_continue: true,
      items: judged,
    });
    assertStatus(res, 200, `pass inspection ${inspection.id}`);
    return;
  }
  // 无明细接口时直接改状态
  const res = await api.put(`/api/quality/inspections/${inspection.id}`, {
    status: 'passed',
    qualified_quantity: quantity,
    unqualified_quantity: 0,
    actual_date: dayjs().format('YYYY-MM-DD'),
    production_can_continue: true,
  });
  assertStatus(res, 200, `pass inspection ${inspection.id} (no items)`);
}

async function main() {
  console.log('\n========== 生产+仓库主流程冒烟开始 ==========\n');
  const today = dayjs().format('YYYY-MM-DD');
  const prefix = `SMK${Date.now().toString().slice(-10)}`;
  let api;
  let ctx;

  await step('数据库可连接', async () => {
    await q('SELECT 1 AS ok');
    return 'ok';
  }, { fatal: true });

  await step('管理员登录', async () => {
    api = await createAuthClient();
    return 'login ok';
  }, { fatal: true });

  await step('准备主数据', async () => {
    ctx = await prepareMaster(prefix);
    return `rm=${ctx.rawMaterialId} fg=${ctx.productId}`;
  }, { fatal: true });

  await step('种子原料库存', async () => {
    await seedStock(
      ctx.rawMaterialId,
      ctx.rawLocationId,
      100,
      `${prefix}-RM-BATCH`,
      'smoke'
    );
    const qty = await stockOf(ctx.rawMaterialId, ctx.rawLocationId);
    if (qty < 100) throw new Error(`原料库存不足: ${qty}`);
    return `qty=${qty}`;
  }, { fatal: true });

  // ---------- 架构守卫 ----------
  await step('守卫: 创建出库禁止 completed', async () => {
    const res = await api.post('/api/inventory/outbound', {
      outbound_date: today,
      status: 'completed',
      operator: 'smoke',
      outbound_type: 'manual',
      items: [{ material_id: ctx.rawMaterialId, quantity: 1, unit_id: ctx.unitId }],
    });
    if (res.status === 201) {
      throw new Error('创建 completed 出库不应成功');
    }
    if (res.status !== 400) {
      throw new Error(`期望校验 400, 实际 HTTP ${res.status}`);
    }
    return `HTTP ${res.status}`;
  });

  await step('守卫: 创建入库禁止 completed', async () => {
    const res = await api.post('/api/inventory/inbound', {
      inbound_date: today,
      location_id: ctx.fgLocationId,
      status: 'completed',
      operator: 'smoke',
      items: [
        {
          material_id: ctx.productId,
          quantity: 1,
          unit_id: ctx.unitId,
          batch_number: `${prefix}-GUARD-FG`,
        },
      ],
    });
    if (res.status === 201) {
      throw new Error('创建 completed 入库不应成功');
    }
    if (res.status !== 400) {
      throw new Error(`期望校验 400, 实际 HTTP ${res.status}`);
    }
    return `HTTP ${res.status}`;
  });

  // ---------- 生产计划/任务/发料 ----------
  let taskId;
  let taskCode;
  let outboundId;
  let outboundNo;

  await step('创建生产计划+任务', async () => {
    const planRes = await api.post('/api/production/plans', {
      name: `${prefix} Plan`,
      productId: ctx.productId,
      quantity: ctx.productionQty,
      start_date: today,
      end_date: today,
      delivery_date: today,
      bomId: ctx.bomId,
    });
    assertStatus(planRes, [200, 201], 'create plan');
    const planId = dataOf(planRes).id;

    const taskRes = await api.post('/api/production/tasks', {
      plan_id: planId,
      product_id: ctx.productId,
      quantity: ctx.productionQty,
      start_date: today,
      expected_end_date: today,
      manager: ctx.manager,
      process_template_id: ctx.processTemplateId,
    });
    assertStatus(taskRes, [200, 201], 'create task');
    const task = dataOf(taskRes);
    taskId = task.id;
    taskCode = task.code;
    return `task=${taskId} code=${taskCode}`;
  }, { fatal: true });

  await step('守卫: 任务 PUT completed 被拒', async () => {
    const res = await api.put(`/api/production/tasks/${taskId}/status`, {
      status: 'completed',
    });
    if (res.status === 200) {
      throw new Error('PUT completed 不应成功');
    }
    return `HTTP ${res.status}`;
  });

  await step('生产发料 draft→confirm→complete 扣库', async () => {
    const before = await stockOf(ctx.rawMaterialId, ctx.rawLocationId);
    const createRes = await api.post('/api/inventory/outbound', {
      outbound_date: today,
      status: 'draft',
      operator: 'smoke',
      outbound_type: 'production',
      production_task_id: taskId,
      remark: `${prefix} issue`,
      items: [
        {
          material_id: ctx.rawMaterialId,
          quantity: ctx.rawUsageQty,
          unit_id: ctx.unitId,
        },
      ],
    });
    assertStatus(createRes, [200, 201], 'create outbound');
    const created = dataOf(createRes);
    outboundId = created.id || created.data?.id;
    outboundNo = created.outboundNo || created.outbound_no;
    if (!outboundId) {
      // 部分接口包一层 data
      outboundId = createRes.body?.data?.id || createRes.body?.data?.data?.id;
      outboundNo = createRes.body?.data?.outboundNo || createRes.body?.data?.data?.outboundNo;
    }

    const mid = await stockOf(ctx.rawMaterialId, ctx.rawLocationId);
    if (Math.abs(mid - before) > 0.001) {
      throw new Error(`draft 创建不应扣库: before=${before} mid=${mid}`);
    }

    const conf = await api.put(`/api/inventory/outbound/${outboundId}/status`, {
      newStatus: 'confirmed',
    });
    assertStatus(conf, 200, 'confirm outbound');
    const afterConf = await stockOf(ctx.rawMaterialId, ctx.rawLocationId);
    if (Math.abs(afterConf - before) > 0.001) {
      throw new Error(`confirmed 不应扣库: before=${before} after=${afterConf}`);
    }

    const comp = await api.put(`/api/inventory/outbound/${outboundId}/status`, {
      newStatus: 'completed',
    });
    assertStatus(comp, 200, 'complete outbound');
    const after = await stockOf(ctx.rawMaterialId, ctx.rawLocationId);
    const expected = before - ctx.rawUsageQty;
    if (Math.abs(after - expected) > 0.001) {
      throw new Error(`完成应扣库: expect=${expected} actual=${after}`);
    }
    return `out=${outboundNo} stock ${before}→${after}`;
  }, { fatal: true });

  await step('出库撤销冲销回库', async () => {
    const before = await stockOf(ctx.rawMaterialId, ctx.rawLocationId);
    const res = await api.post(`/api/inventory/outbound/${outboundId}/cancel`, {
      force: true,
      createReissue: false,
    });
    // 部分实现可能是 PUT reverse
    if (res.status !== 200) {
      // 尝试通用 cancel 路径
      throw new Error(`cancel outbound HTTP ${res.status}: ${JSON.stringify(res.body).slice(0, 400)}`);
    }
    const after = await stockOf(ctx.rawMaterialId, ctx.rawLocationId);
    if (Math.abs(after - (before + ctx.rawUsageQty)) > 0.001) {
      throw new Error(`冲销后库存应为 ${before + ctx.rawUsageQty}, 实际 ${after}`);
    }
    const rows = await q(
      `SELECT status FROM inventory_outbound WHERE id = ?`,
      [outboundId]
    );
    if (rows[0]?.status !== 'reversed') {
      throw new Error(`出库状态应为 reversed, 实际 ${rows[0]?.status}`);
    }
    return `stock ${before}→${after} status=reversed`;
  });

  // 重新发料以便后续生产
  await step('重新发料完成', async () => {
    const createRes = await api.post('/api/inventory/outbound', {
      outbound_date: today,
      status: 'draft',
      operator: 'smoke',
      outbound_type: 'production',
      production_task_id: taskId,
      remark: `${prefix} re-issue`,
      items: [
        {
          material_id: ctx.rawMaterialId,
          quantity: ctx.rawUsageQty,
          unit_id: ctx.unitId,
        },
      ],
    });
    assertStatus(createRes, [200, 201], 're-create outbound');
    const created = dataOf(createRes);
    const oid = created.id || createRes.body?.data?.id;
    await api.put(`/api/inventory/outbound/${oid}/status`, { newStatus: 'confirmed' });
    const comp = await api.put(`/api/inventory/outbound/${oid}/status`, {
      newStatus: 'completed',
    });
    assertStatus(comp, 200, 're-complete outbound');
    return `outbound=${oid}`;
  }, { fatal: true });

  await step('任务进入生产中并关闭首检/过程检', async () => {
    const start = await api.put(`/api/production/tasks/${taskId}/status`, {
      status: 'in_progress',
    });
    assertStatus(start, 200, 'start task');

    const inspections = await q(
      `SELECT id, inspection_no, inspection_type, quantity, status
       FROM quality_inspections
       WHERE task_id = ?
         AND inspection_type IN ('first_article', 'process')
         AND deleted_at IS NULL`,
      [taskId]
    );
    for (const insp of inspections) {
      if (!['passed', 'completed', 'cancelled'].includes(insp.status)) {
        await passInspection(api, insp);
      }
    }
    return `inspections=${inspections.length}`;
  }, { fatal: true });

  await step('completeTask 满产 → inspection', async () => {
    const res = await api.post(`/api/production/tasks/${taskId}/complete`, {
      quantity: ctx.productionQty,
      remark: 'smoke complete',
    });
    assertStatus(res, 200, 'completeTask');
    const tasks = await q(
      'SELECT status, completed_quantity FROM production_tasks WHERE id = ?',
      [taskId]
    );
    if (tasks[0].status !== 'inspection') {
      throw new Error(`期望 inspection, 实际 ${tasks[0].status}`);
    }
    if (Number(tasks[0].completed_quantity) < ctx.productionQty) {
      throw new Error(`completed_quantity=${tasks[0].completed_quantity}`);
    }
    return `status=${tasks[0].status} qty=${tasks[0].completed_quantity}`;
  }, { fatal: true });

  // ---------- 成品入库 + 冲销 ----------
  let inboundId;
  await step('成品入库确认完成写库存', async () => {
    const before = await stockOf(ctx.productId, ctx.fgLocationId);
    const createRes = await api.post('/api/inventory/inbound', {
      inbound_date: today,
      location_id: ctx.fgLocationId,
      status: 'draft',
      operator: 'smoke',
      inbound_type: 'other',
      items: [
        {
          material_id: ctx.productId,
          quantity: ctx.productionQty,
          unit_id: ctx.unitId,
          batch_number: `${prefix}-FG-BATCH`,
          location_id: ctx.fgLocationId,
        },
      ],
    });
    assertStatus(createRes, [200, 201], 'create inbound');
    inboundId = dataOf(createRes).id || dataOf(createRes).data?.id;
    if (!inboundId) {
      inboundId = createRes.body?.data?.id || createRes.body?.data?.data?.id;
    }
    // 部分接口返回 data: { data: { id } }
    if (!inboundId && createRes.body?.data) {
      inboundId = createRes.body.data.id;
    }

    const mid = await stockOf(ctx.productId, ctx.fgLocationId);
    if (Math.abs(mid - before) > 0.001) {
      throw new Error('draft 入库不应写库存');
    }

    const conf = await api.put(`/api/inventory/inbound/status/${inboundId}`, {
      newStatus: 'confirmed',
    });
    assertStatus(conf, 200, 'confirm inbound');

    const comp = await api.put(`/api/inventory/inbound/status/${inboundId}`, {
      newStatus: 'completed',
    });
    assertStatus(comp, 200, 'complete inbound');
    const after = await stockOf(ctx.productId, ctx.fgLocationId);
    if (Math.abs(after - (before + ctx.productionQty)) > 0.001) {
      throw new Error(`入库后库存 expect=${before + ctx.productionQty} actual=${after}`);
    }
    return `in=${inboundId} stock ${before}→${after}`;
  }, { fatal: true });

  await step('入库 completed→reversed 冲销', async () => {
    const before = await stockOf(ctx.productId, ctx.fgLocationId);
    const res = await api.put(`/api/inventory/inbound/status/${inboundId}`, {
      newStatus: 'reversed',
    });
    assertStatus(res, 200, 'reverse inbound');
    const after = await stockOf(ctx.productId, ctx.fgLocationId);
    if (Math.abs(after - (before - ctx.productionQty)) > 0.001) {
      throw new Error(`冲销后库存 expect=${before - ctx.productionQty} actual=${after}`);
    }
    const rows = await q('SELECT status FROM inventory_inbound WHERE id = ?', [inboundId]);
    if (rows[0]?.status !== 'reversed') {
      throw new Error(`入库状态应为 reversed, 实际 ${rows[0]?.status}`);
    }
    return `stock ${before}→${after}`;
  });

  // 再入一次成品供销售
  await step('重新成品入库供销售', async () => {
    const createRes = await api.post('/api/inventory/inbound', {
      inbound_date: today,
      location_id: ctx.fgLocationId,
      status: 'draft',
      operator: 'smoke',
      inbound_type: 'other',
      items: [
        {
          material_id: ctx.productId,
          quantity: ctx.productionQty,
          unit_id: ctx.unitId,
          batch_number: `${prefix}-FG-BATCH2`,
          location_id: ctx.fgLocationId,
        },
      ],
    });
    assertStatus(createRes, [200, 201], 're-create inbound');
    const id = dataOf(createRes).id || createRes.body?.data?.id;
    await api.put(`/api/inventory/inbound/status/${id}`, { newStatus: 'confirmed' });
    const comp = await api.put(`/api/inventory/inbound/status/${id}`, {
      newStatus: 'completed',
    });
    assertStatus(comp, 200, 're-complete inbound');
    return `inbound=${id}`;
  }, { fatal: true });

  // ---------- 销售预留核销 ----------
  await step('销售订单预留 + 出库完成核销', async () => {
    const soRes = await api.post('/api/sales/orders', {
      customer_id: ctx.customerId,
      delivery_date: today,
      status: 'draft',
      remark: `${prefix} SO`,
      items: [
        {
          material_id: ctx.productId,
          quantity: ctx.salesQty,
          unit_price: 30,
        },
      ],
    });
    assertStatus(soRes, [200, 201], 'create sales order');
    const so = dataOf(soRes);
    const orderId = so.id;
    const orderNo = so.order_no;

    // 直接服务层预留（与订单确认路径一致）
    const reserve = await InventoryReservationService.reserveInventoryForOrder(
      orderId,
      orderNo,
      [{ material_id: ctx.productId, quantity: ctx.salesQty }],
      1
    );
    if (!reserve.success && !reserve.fullSuccess) {
      throw new Error(`预留失败: ${JSON.stringify(reserve)}`);
    }

    const activeBefore = await q(
      `SELECT COUNT(*) AS c, COALESCE(SUM(reserved_quantity),0) AS qty
       FROM inventory_reservations
       WHERE order_id = ? AND status = 'active'`,
      [orderId]
    );

    const outRes = await api.post('/api/sales/outbound', {
      order_id: orderId,
      delivery_date: today,
      status: 'draft',
      remarks: `${prefix} SO out`,
      items: [
        {
          material_id: ctx.productId,
          quantity: ctx.salesQty,
          unit_price: 30,
          source_order_id: orderId,
          source_order_no: orderNo,
        },
      ],
    });
    assertStatus(outRes, [200, 201], 'create sales outbound');
    const outId = dataOf(outRes).id;

    await api.put(`/api/sales/outbound/${outId}`, {
      order_id: orderId,
      delivery_date: today,
      status: 'processing',
      items: [
        {
          material_id: ctx.productId,
          quantity: ctx.salesQty,
          unit_price: 30,
          source_order_id: orderId,
          source_order_no: orderNo,
        },
      ],
    });

    const beforeFg = await stockOf(ctx.productId, ctx.fgLocationId);
    const complete = await api.put(`/api/sales/outbound/${outId}`, {
      order_id: orderId,
      delivery_date: today,
      status: 'completed',
      items: [
        {
          material_id: ctx.productId,
          quantity: ctx.salesQty,
          unit_price: 30,
          source_order_id: orderId,
          source_order_no: orderNo,
        },
      ],
    });
    assertStatus(complete, 200, 'complete sales outbound');
    const afterFg = await stockOf(ctx.productId, ctx.fgLocationId);
    if (Math.abs(afterFg - (beforeFg - ctx.salesQty)) > 0.001) {
      throw new Error(`销售扣库 expect=${beforeFg - ctx.salesQty} actual=${afterFg}`);
    }

    const activeAfter = await q(
      `SELECT COUNT(*) AS c, COALESCE(SUM(reserved_quantity),0) AS qty
       FROM inventory_reservations
       WHERE order_id = ? AND status = 'active'`,
      [orderId]
    );
    const consumed = await q(
      `SELECT COUNT(*) AS c FROM inventory_reservations
       WHERE order_id = ? AND status = 'consumed'`,
      [orderId]
    );

    if (Number(activeAfter[0].qty) > 0) {
      throw new Error(
        `发货后仍有 active 预留 qty=${activeAfter[0].qty} (before=${activeBefore[0].qty})`
      );
    }
    if (Number(consumed[0].c) < 1 && Number(activeBefore[0].c) > 0) {
      throw new Error('发货后未看到 consumed 预留记录');
    }

    // 财务集成：成本分录 + 销项发票（异步订阅，短等后查库；失败则直接调服务）
    await new Promise((r) => setTimeout(r, 800));
    let glRows = await q(
      `SELECT id, entry_number, document_number, is_posted, status
       FROM gl_entries
       WHERE document_type = 'sales_outbound'
         AND document_number = (
           SELECT outbound_no FROM sales_outbound WHERE id = ?
         )
         AND COALESCE(is_reversed, 0) = 0
       ORDER BY id DESC LIMIT 1`,
      [outId]
    );
    if (!glRows.length) {
      // 兜底：同步调用集成服务（验证表名修复）
      const FinanceIntegrationService = require('../src/services/external/FinanceIntegrationService');
      const [sob] = await q('SELECT * FROM sales_outbound WHERE id = ?', [outId]);
      const costResult = await FinanceIntegrationService.generateCostEntryFromSalesOutbound(sob);
      if (costResult?.skipped && !costResult.entryId) {
        throw new Error(`销售成本分录未生成: ${JSON.stringify(costResult)}`);
      }
      glRows = await q(
        `SELECT id, entry_number, document_number, is_posted, status
         FROM gl_entries
         WHERE document_type = 'sales_outbound' AND document_number = ?
           AND COALESCE(is_reversed, 0) = 0
         ORDER BY id DESC LIMIT 1`,
        [sob.outbound_no]
      );
    }
    if (!glRows.length) {
      throw new Error('销售成本 GL 分录未找到');
    }

    let taxRows = await q(
      `SELECT id, invoice_number, total_amount, status
       FROM tax_invoices
       WHERE related_document_type IN ('sales_outbound', '销售出库单') AND related_document_id = ?
       ORDER BY id DESC LIMIT 1`,
      [outId]
    );
    if (!taxRows.length) {
      const FinanceIntegrationService = require('../src/services/external/FinanceIntegrationService');
      const [sob] = await q('SELECT * FROM sales_outbound WHERE id = ?', [outId]);
      await FinanceIntegrationService.generateOutputTaxInvoiceFromSalesOutbound(sob, 1);
      taxRows = await q(
        `SELECT id, invoice_number, total_amount, status
         FROM tax_invoices
         WHERE related_document_type IN ('sales_outbound', '销售出库单') AND related_document_id = ?
         ORDER BY id DESC LIMIT 1`,
        [outId]
      );
    }
    if (!taxRows.length) {
      throw new Error('销项税票未找到');
    }

    // 冲销销售出库：库存回冲 + status=reversed
    const revRes = await api.post(`/api/sales/outbound/${outId}/reverse`, {});
    assertStatus(revRes, 200, 'reverse sales outbound');
    const afterRevFg = await stockOf(ctx.productId, ctx.fgLocationId);
    if (Math.abs(afterRevFg - beforeFg) > 0.001) {
      throw new Error(`冲销后成品库存应还原 ${beforeFg}, 实际 ${afterRevFg}`);
    }
    const [sobStatus] = await q('SELECT status FROM sales_outbound WHERE id = ?', [outId]);
    if (sobStatus.status !== 'reversed') {
      throw new Error(`销售出库状态应为 reversed, 实际 ${sobStatus.status}`);
    }

    // 重新完成发货（验证冲销后可再次业务流程；此处仅验证库存已还原）
    return `fg ${beforeFg}→${afterFg}→${afterRevFg}(rev), reserved active=${activeAfter[0].qty}, consumed=${consumed[0].c}, gl=${glRows[0].entry_number}, tax=${taxRows[0].invoice_number}`;
  });

  // ---------- 调拨完成 + 冲销 ----------
  await step('调拨完成写库存 + reversed 冲销', async () => {
    // 保证源库位有库存
    const srcQty = await stockOf(ctx.productId, ctx.fgLocationId);
    if (srcQty < 1) {
      await seedStock(ctx.productId, ctx.fgLocationId, 2, `${prefix}-TR-FG`, 'smoke');
    }
    const locations = await q(
      'SELECT id FROM locations WHERE deleted_at IS NULL AND id != ? ORDER BY id LIMIT 1',
      [ctx.fgLocationId]
    );
    if (!locations.length) throw new Error('缺少目标库位');
    const toLoc = locations[0].id;
    const transferQty = 1;

    // 路由为 /api/inventory/transfer（单数）
    const createRes = await api.post('/api/inventory/transfer', {
      transfer_date: today,
      from_location_id: ctx.fgLocationId,
      to_location_id: toLoc,
      status: 'draft',
      operator: 'smoke',
      remark: `${prefix} transfer`,
      items: [
        {
          material_id: ctx.productId,
          quantity: transferQty,
          unit_id: ctx.unitId,
        },
      ],
    });
    assertStatus(createRes, [200, 201], 'create transfer');

    const transferId = dataOf(createRes).id || createRes.body?.data?.id;
    if (!transferId) throw new Error(`无 transfer id: ${JSON.stringify(createRes.body).slice(0, 300)}`);

    const fromBefore = await stockOf(ctx.productId, ctx.fgLocationId);
    const toBefore = await stockOf(ctx.productId, toLoc);

    // draft → pending → approved → completed
    for (const st of ['pending', 'approved', 'completed']) {
      const r = await api.put(`/api/inventory/transfer/${transferId}/status`, {
        newStatus: st,
      });
      assertStatus(r, 200, `transfer → ${st}`);
    }

    const fromAfterComplete = await stockOf(ctx.productId, ctx.fgLocationId);
    const toAfterComplete = await stockOf(ctx.productId, toLoc);
    if (Math.abs(fromAfterComplete - (fromBefore - transferQty)) > 0.001) {
      throw new Error(
        `调拨源库位 expect=${fromBefore - transferQty} actual=${fromAfterComplete}`
      );
    }
    if (Math.abs(toAfterComplete - (toBefore + transferQty)) > 0.001) {
      throw new Error(
        `调拨目标库位 expect=${toBefore + transferQty} actual=${toAfterComplete}`
      );
    }

    const rev = await api.put(`/api/inventory/transfer/${transferId}/status`, {
      newStatus: 'reversed',
    });
    assertStatus(rev, 200, 'reverse transfer');

    const rows = await q('SELECT status FROM inventory_transfers WHERE id = ?', [transferId]);
    if (rows[0]?.status !== 'reversed') {
      throw new Error(`调拨状态应为 reversed, 实际 ${rows[0]?.status}`);
    }

    const fromAfterRev = await stockOf(ctx.productId, ctx.fgLocationId);
    const toAfterRev = await stockOf(ctx.productId, toLoc);
    if (Math.abs(fromAfterRev - fromBefore) > 0.001 || Math.abs(toAfterRev - toBefore) > 0.001) {
      throw new Error(
        `冲销后库存未还原 from ${fromAfterRev}/${fromBefore} to ${toAfterRev}/${toBefore}`
      );
    }

    return `transfer=${transferId} stock restored → reversed`;
  });

  console.log('\n========== 结果汇总 ==========');
  console.log(`PASS: ${pass}  FAIL: ${fail}`);
  results.forEach((r) => {
    console.log(`${r.status === 'PASS' ? '✅' : '❌'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  });
  console.log('================================\n');

  // 给异步订阅者一点时间，避免强关连接池
  await new Promise((r) => setTimeout(r, 500));
  try {
    await db.pool.end();
  } catch {
    // ignore
  }

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('冒烟脚本异常:', err);
  await new Promise((r) => setTimeout(r, 300));
  try {
    await db.pool.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
