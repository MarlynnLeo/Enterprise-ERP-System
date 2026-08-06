/**
 * Full business UAT chain.
 *
 * This test intentionally writes UAT business data into an explicitly selected
 * test/UAT database and drives documents through the public API, then validates the
 * downstream data flow from inventory to finance and costing.
 */

const liveUatEnabled =
  process.env.RUN_LIVE_UAT === '1' &&
  /(test|uat)/i.test(String(process.env.DB_NAME || ''));
const describeLiveUat = liveUatEnabled ? describe : describe.skip;
const { authRequest, clearCache, getApp } = require('../testHelper');
const db = liveUatEnabled ? require('../../src/config/db') : null;

jest.setTimeout(120000);

let app;
let api;

const context = {};

const today = () => new Date().toISOString().slice(0, 10);

function dataOf(res) {
  const body = res.body || {};
  if (body.data && body.data.data) return body.data.data;
  return body.data || body;
}

function expectHttp(res, expected, label) {
  const statuses = Array.isArray(expected) ? expected : [expected];
  if (!statuses.includes(res.status)) {
    throw new Error(`${label} failed with HTTP ${res.status}: ${JSON.stringify(res.body)}`);
  }
}

async function scalar(sql, params = []) {
  const [rows] = await db.pool.query(sql, params);
  return rows[0] || {};
}

async function waitFor(checkFn, label, { timeoutMs = 5000, intervalMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await checkFn();
    if (lastValue) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(lastValue)}`);
}

async function prepareUatMasterData(prefix) {
  const shortCode = prefix.replace(/[^A-Za-z0-9]/g, '').slice(-12);
  const [[{ unit_count: unitCount }]] = await db.pool.query(
    'SELECT COUNT(*) AS unit_count FROM units WHERE deleted_at IS NULL'
  );
  if (Number(unitCount) === 0) {
    await db.pool.query(
      "INSERT INTO units (name, code, status, remark) VALUES ('件', ?, 1, 'Live UAT prerequisite')",
      [`UATU-${shortCode}`]
    );
  }

  const [[{ location_count: locationCount }]] = await db.pool.query(
    'SELECT COUNT(*) AS location_count FROM locations WHERE deleted_at IS NULL'
  );
  for (let index = Number(locationCount); index < 3; index += 1) {
    await db.pool.query(
      `INSERT INTO locations (code, name, type, status, remark)
       VALUES (?, ?, 'warehouse', 1, 'Live UAT prerequisite')`,
      [`${prefix}-LOC-${index + 1}`, `${prefix} Warehouse ${index + 1}`]
    );
  }

  const [[{ category_count: categoryCount }]] = await db.pool.query(
    'SELECT COUNT(*) AS category_count FROM categories WHERE deleted_at IS NULL'
  );
  if (Number(categoryCount) === 0) {
    await db.pool.query(
      `INSERT INTO categories (name, code, level, sort, status, remark)
       VALUES (?, ?, 1, 0, 1, 'Live UAT prerequisite')`,
      [`${prefix} Category`, `${prefix}-CAT`]
    );
  }

  const currentDate = today();
  const periodStart = `${currentDate.slice(0, 7)}-01`;
  const nextMonth = new Date(`${periodStart}T00:00:00.000Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  nextMonth.setUTCDate(0);
  const periodEnd = nextMonth.toISOString().slice(0, 10);
  const [[{ period_count: periodCount }]] = await db.pool.query(
    `SELECT COUNT(*) AS period_count
     FROM gl_periods
     WHERE is_closed = 0 AND is_locked = 0 AND start_date <= ? AND end_date >= ?`,
    [currentDate, currentDate]
  );
  if (Number(periodCount) === 0) {
    await db.pool.query(
      `INSERT INTO gl_periods
       (period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year, is_locked)
       VALUES (?, ?, ?, 0, 0, ?, 0)`,
      [`${prefix}-${currentDate.slice(0, 7)}`, periodStart, periodEnd, Number(currentDate.slice(0, 4))]
    );
  }

  const [unitRows] = await db.pool.query(
    "SELECT id, name FROM units WHERE deleted_at IS NULL ORDER BY id LIMIT 1"
  );
  const [locationRows] = await db.pool.query(
    "SELECT id, code, name FROM locations WHERE deleted_at IS NULL ORDER BY id LIMIT 3"
  );
  const [categoryRows] = await db.pool.query(
    "SELECT id FROM categories WHERE deleted_at IS NULL ORDER BY id LIMIT 1"
  );
  const [sourceRows] = await db.pool.query(
    "SELECT id, type FROM material_sources WHERE deleted_at IS NULL ORDER BY id"
  );
  const [periodRows] = await db.pool.query(
    "SELECT id, period_name FROM gl_periods WHERE is_closed = 0 AND start_date <= ? AND end_date >= ? ORDER BY id DESC LIMIT 1",
    [today(), today()]
  );

  if (unitRows.length === 0 || locationRows.length < 2 || periodRows.length === 0) {
    throw new Error('UAT requires at least one unit, two locations, and one open GL period');
  }

  const externalSource = sourceRows.find((row) => row.type === 'external') || sourceRows[0];
  const internalSource = sourceRows.find((row) => row.type === 'internal') || sourceRows[0];
  if (!externalSource || !internalSource) {
    throw new Error('UAT requires material source master data');
  }

  const unitId = unitRows[0].id;
  const rawLocationId = locationRows[0].id;
  const fgLocationId = locationRows[2]?.id || locationRows[1].id;
  const categoryId = categoryRows[0]?.id || null;

  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const [supplierResult] = await connection.query(
      `INSERT INTO suppliers (code, name, contact_person, contact_phone, status, remark)
       VALUES (?, ?, 'UAT', '13800000000', 1, ?)`,
      [`${prefix}-SUP`, `${prefix} Supplier`, `${prefix} supplier`]
    );

    const [customerResult] = await connection.query(
      `INSERT INTO customers (code, name, contact_person, contact_phone, status, remark)
       VALUES (?, ?, 'UAT', '13900000000', 1, ?)`,
      [`${prefix}-CUS`, `${prefix} Customer`, `${prefix} customer`]
    );

    const [rawMaterialResult] = await connection.query(
      `INSERT INTO materials
       (code, name, category_id, material_source_id, supplier_id, unit_id, location_id,
        specs, material_type, price, cost_price, status, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'UAT-RM-SPEC', 'raw', 5.00, 5.00, 1, ?)`,
      [
        `${prefix}-RM`,
        `${prefix} Raw Material`,
        categoryId,
        externalSource.id,
        supplierResult.insertId,
        unitId,
        rawLocationId,
        `${prefix} raw material`,
      ]
    );

    const [productResult] = await connection.query(
      `INSERT INTO materials
       (code, name, category_id, material_source_id, unit_id, location_id,
        specs, material_type, price, cost_price, status, remark)
       VALUES (?, ?, ?, ?, ?, ?, 'UAT-FG-SPEC', 'finished', 30.00, 12.00, 1, ?)`,
      [
        `${prefix}-FG`,
        `${prefix} Finished Product`,
        categoryId,
        internalSource.id,
        unitId,
        fgLocationId,
        `${prefix} finished product`,
      ]
    );

    const [bomResult] = await connection.query(
      `INSERT INTO bom_masters (product_id, version, status, remark, created_by, approved_at)
       VALUES (?, 'UAT-V1', 1, ?, 'codex-uat', NOW())`,
      [productResult.insertId, `${prefix} BOM`]
    );
    await connection.query(
      `INSERT INTO bom_details (bom_id, material_id, quantity, unit_id, remark)
       VALUES (?, ?, 2.00, ?, ?)`,
      [bomResult.insertId, rawMaterialResult.insertId, unitId, `${prefix} BOM detail`]
    );

    const [templateResult] = await connection.query(
      `INSERT INTO process_templates (code, name, product_id, description, status)
       VALUES (?, ?, ?, ?, 1)`,
      [`${prefix}-PTPL`, `${prefix} Process Template`, productResult.insertId, `${prefix} template`]
    );
    await connection.query(
      `INSERT INTO process_template_details
       (template_id, order_num, name, description, standard_hours, department, remark)
       VALUES (?, 1, 'Assembly', 'UAT assembly', 0.50, 'UAT', ?)`,
      [templateResult.insertId, `${prefix} process detail`]
    );

    const [inspectionItemResult] = await connection.query(
      `INSERT INTO inspection_items
       (item_name, standard, type, is_critical, dimension_value, tolerance_upper, tolerance_lower)
       VALUES (?, 'No visible or functional defect', 'function', 1, NULL, NULL, NULL)`,
      [`${prefix} Functional Check`]
    );
    const qualityTemplateIds = {};
    for (const inspectionType of ['first_article', 'process', 'final']) {
      const [qualityTemplateResult] = await connection.query(
        `INSERT INTO inspection_templates
         (template_code, template_name, inspection_type, material_type, material_types,
          is_general, is_default, priority, version, description, status, is_aql, created_by)
         VALUES (?, ?, ?, ?, ?, 0, 0, 1, 'UAT-V1', ?, 'active', 0, 1)`,
        [
          `${prefix}-${inspectionType}`,
          `${prefix} ${inspectionType} template`,
          inspectionType,
          productResult.insertId,
          JSON.stringify([productResult.insertId]),
          `${prefix} ${inspectionType} quality template`,
        ]
      );
      await connection.query(
        `INSERT INTO template_item_mappings (template_id, item_id, sort_order)
         VALUES (?, ?, 1)`,
        [qualityTemplateResult.insertId, inspectionItemResult.insertId]
      );
      qualityTemplateIds[inspectionType] = qualityTemplateResult.insertId;
    }

    await connection.query(
      `INSERT INTO first_article_rules
       (product_id, first_article_qty, full_inspection_threshold, template_id, is_mandatory, note)
       VALUES (?, 1, 1, ?, 1, ?)`,
      [
        productResult.insertId,
        qualityTemplateIds.first_article,
        `${prefix} first article rule`,
      ]
    );
    await connection.query(
      `INSERT INTO process_inspection_rules
       (product_id, inspection_interval, sample_rate, punch_interval, template_id, is_enabled, note)
       VALUES (?, 1, 100, 1, ?, 1, ?)`,
      [
        productResult.insertId,
        qualityTemplateIds.process,
        `${prefix} process inspection rule`,
      ]
    );

    await connection.commit();

    return {
      prefix,
      manager: `${prefix}-manager`,
      unitId,
      rawLocationId,
      fgLocationId,
      periodId: periodRows[0].id,
      supplierId: supplierResult.insertId,
      customerId: customerResult.insertId,
      rawMaterialId: rawMaterialResult.insertId,
      productId: productResult.insertId,
      bomId: bomResult.insertId,
      processTemplateId: templateResult.insertId,
      purchaseQty: 40,
      productionQty: 10,
      rawUsageQty: 20,
      salesQty: 6,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function passInspection(inspection) {
  const quantity = Number(inspection.quantity || 0);
  const itemsRes = await api.get(`/api/quality/inspections/${inspection.id}/items`);
  expectHttp(itemsRes, 200, `get inspection ${inspection.id} items`);
  const items = dataOf(itemsRes);
  const judgedItems = (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    result: 'passed',
    is_qualified: 1,
    actual_value: item.actual_value || item.standard || 'UAT pass',
    remark: item.remark || 'UAT item passed',
  }));

  const res = await api
    .put(`/api/quality/inspections/${inspection.id}`)
    .send({
      status: 'passed',
      qualified_quantity: quantity,
      unqualified_quantity: 0,
      actual_date: today(),
      first_article_result: 'passed',
      production_can_continue: true,
      note: 'UAT passed',
      items: judgedItems,
    });
  expectHttp(res, 200, `pass inspection ${inspection.id}`);
}

beforeAll(async () => {
  if (!liveUatEnabled) return;
  app = getApp();
  api = await authRequest();
});

afterAll(() => {
  clearCache();
});

describeLiveUat('UAT full business flow', () => {
  test('purchase -> inventory -> production -> quality -> sales -> finance -> costing closes the loop', async () => {
    const prefix = `UAT${Date.now()}`;
    Object.assign(context, await prepareUatMasterData(prefix));

    const purchaseOrderRes = await api.post('/api/purchase/orders').send({
      order_date: today(),
      supplier_id: context.supplierId,
      expected_delivery_date: today(),
      contact_person: 'UAT',
      contact_phone: '13800000000',
      contract_code: `${prefix}-PO-CONTRACT`,
      remarks: `${prefix} purchase order`,
      items: [
        {
          material_id: context.rawMaterialId,
          quantity: context.purchaseQty,
          price: 5,
          unit_id: context.unitId,
        },
      ],
    });
    expectHttp(purchaseOrderRes, 201, 'create purchase order');
    const purchaseOrder = dataOf(purchaseOrderRes);
    context.purchaseOrderId = purchaseOrder.id;
    context.purchaseOrderNo = purchaseOrder.order_no;

    const purchaseReceiptRes = await api
      .post('/api/purchase/receipts')
      .set('Idempotency-Key', `${prefix}-purchase-receipt`)
      .send({
        orderId: context.purchaseOrderId,
        supplierId: context.supplierId,
        warehouseId: context.rawLocationId,
        receiptDate: today(),
        receiver: 'codex-uat',
        remarks: `${prefix} purchase receipt`,
        items: [
          {
            materialId: context.rawMaterialId,
            unitId: context.unitId,
            orderedQuantity: context.purchaseQty,
            receivedQuantity: context.purchaseQty,
            qualifiedQuantity: context.purchaseQty,
            batchNumber: `${prefix}-RM-BATCH`,
            price: 5,
          },
        ],
      });
    expectHttp(purchaseReceiptRes, 201, 'create purchase receipt');
    const purchaseReceipt = dataOf(purchaseReceiptRes);
    context.purchaseReceiptId = purchaseReceipt.id;
    context.purchaseReceiptNo = purchaseReceipt.receiptNo;

    const purchaseReceiptLink = await scalar(
      `SELECT pri.order_item_id, poi.order_id, poi.material_id
       FROM purchase_receipt_items pri
       LEFT JOIN purchase_order_items poi ON poi.id = pri.order_item_id
       WHERE pri.receipt_id = ?
       LIMIT 1`,
      [context.purchaseReceiptId]
    );
    expect(Number(purchaseReceiptLink.order_item_id)).toBeGreaterThan(0);
    expect(Number(purchaseReceiptLink.order_id)).toBe(context.purchaseOrderId);
    expect(Number(purchaseReceiptLink.material_id)).toBe(context.rawMaterialId);

    const completePurchaseReceiptRes = await api
      .put(`/api/purchase/receipts/${context.purchaseReceiptId}/status`)
      .send({ status: 'completed', remarks: 'UAT receive complete' });
    expectHttp(completePurchaseReceiptRes, 200, 'complete purchase receipt');

    const rawStockAfterPurchase = await scalar(
      `SELECT COALESCE(SUM(quantity), 0) AS qty
       FROM inventory_ledger
       WHERE material_id = ? AND location_id = ?`,
      [context.rawMaterialId, context.rawLocationId]
    );
    expect(Number(rawStockAfterPurchase.qty)).toBeCloseTo(context.purchaseQty, 3);

    const apRes = await api.post(
      `/api/finance/integration/ap-invoice/${context.purchaseReceiptId}`
    );
    expectHttp(apRes, 200, 'generate AP invoice');
    const apData = dataOf(apRes);
    context.apInvoiceId = apData.invoiceId || apData.id;

    const planRes = await api.post('/api/production/plans').send({
      name: `${prefix} Production Plan`,
      productId: context.productId,
      quantity: context.productionQty,
      start_date: today(),
      end_date: today(),
      delivery_date: today(),
      contract_code: `${prefix}-PLAN`,
      bomId: context.bomId,
    });
    expectHttp(planRes, 201, 'create production plan');
    context.productionPlanId = dataOf(planRes).id;

    const taskRes = await api.post('/api/production/tasks').send({
      plan_id: context.productionPlanId,
      product_id: context.productId,
      quantity: context.productionQty,
      start_date: today(),
      expected_end_date: today(),
      manager: context.manager,
      process_template_id: context.processTemplateId,
    });
    expectHttp(taskRes, 201, 'create production task');
    context.productionTaskId = dataOf(taskRes).id;
    context.productionTaskCode = dataOf(taskRes).code;

    const productionOutboundRes = await api.post('/api/inventory/outbound').send({
      outbound_date: today(),
      status: 'draft',
      operator: 'codex-uat',
      outbound_type: 'production',
      production_task_id: context.productionTaskId,
      remark: `${prefix} production issue`,
      items: [
        {
          material_id: context.rawMaterialId,
          quantity: context.rawUsageQty,
          unit_id: context.unitId,
        },
      ],
    });
    expectHttp(productionOutboundRes, 201, 'create production material outbound');
    context.productionOutboundId = dataOf(productionOutboundRes).id;
    context.productionOutboundNo = dataOf(productionOutboundRes).outboundNo;

    const confirmProductionOutboundRes = await api
      .put(`/api/inventory/outbound/${context.productionOutboundId}/status`)
      .send({ newStatus: 'confirmed' });
    expectHttp(confirmProductionOutboundRes, 200, 'confirm production outbound');

    const completeProductionOutboundRes = await api
      .put(`/api/inventory/outbound/${context.productionOutboundId}/status`)
      .send({ newStatus: 'completed' });
    expectHttp(completeProductionOutboundRes, 200, 'complete production outbound');

    const rawStockAfterIssue = await scalar(
      `SELECT COALESCE(SUM(quantity), 0) AS qty
       FROM inventory_ledger
       WHERE material_id = ? AND location_id = ?`,
      [context.rawMaterialId, context.rawLocationId]
    );
    expect(Number(rawStockAfterIssue.qty)).toBeCloseTo(
      context.purchaseQty - context.rawUsageQty,
      3
    );

    const startTaskRes = await api
      .put(`/api/production/tasks/${context.productionTaskId}/status`)
      .send({ status: 'in_progress' });
    expectHttp(startTaskRes, 200, 'start production task');

    const [preCompletionInspections] = await db.pool.query(
      `SELECT id, inspection_no, inspection_type, quantity, status
       FROM quality_inspections
       WHERE task_id = ?
         AND inspection_type IN ('first_article', 'process')
         AND deleted_at IS NULL
       ORDER BY id`,
      [context.productionTaskId]
    );
    expect(preCompletionInspections.map((row) => row.inspection_type).sort()).toEqual([
      'first_article',
      'process',
    ]);
    for (const inspection of preCompletionInspections) {
      await passInspection(inspection);
    }

    const completeTaskRes = await api
      .post(`/api/production/tasks/${context.productionTaskId}/complete`)
      .send({ quantity: context.productionQty, remark: 'UAT production complete' });
    expectHttp(completeTaskRes, 200, 'complete production task');

    const [finalInspections] = await db.pool.query(
      `SELECT id, inspection_no, inspection_type, product_id, quantity, unit_id, status
       FROM quality_inspections
       WHERE task_id = ?
         AND inspection_type = 'final'
         AND deleted_at IS NULL
       ORDER BY id DESC
       LIMIT 1`,
      [context.productionTaskId]
    );
    expect(finalInspections.length).toBe(1);
    const finalInspection = finalInspections[0];
    context.finalInspectionId = finalInspection.id;
    context.finalInspectionNo = finalInspection.inspection_no;
    await passInspection(finalInspection);

    const fgInboundRes = await api.post('/api/inventory/inbound/from-quality').send({
      inbound_date: today(),
      location_id: context.fgLocationId,
      operator: 'codex-uat',
      remark: `${prefix} finished goods inbound`,
      inspection_id: context.finalInspectionId,
      inspection_no: context.finalInspectionNo,
      items: [
        {
          material_id: context.productId,
          unit_id: context.unitId,
          quantity: context.productionQty,
          batch_no: `${prefix}-FG-BATCH`,
        },
      ],
    });
    expectHttp(fgInboundRes, [200, 201], 'create finished goods inbound from quality');
    context.finishedInboundId = dataOf(fgInboundRes).id;
    context.finishedInboundNo = dataOf(fgInboundRes).inbound_no;

    const confirmFgInboundRes = await api
      .put(`/api/inventory/inbound/status/${context.finishedInboundId}`)
      .send({ newStatus: 'confirmed' });
    expectHttp(confirmFgInboundRes, 200, 'confirm finished goods inbound');

    const completeFgInboundRes = await api
      .put(`/api/inventory/inbound/status/${context.finishedInboundId}`)
      .send({ newStatus: 'completed' });
    expectHttp(completeFgInboundRes, 200, 'complete finished goods inbound');

    const fgStockAfterInbound = await scalar(
      `SELECT COALESCE(SUM(quantity), 0) AS qty
       FROM inventory_ledger
       WHERE material_id = ? AND location_id = ?`,
      [context.productId, context.fgLocationId]
    );
    expect(Number(fgStockAfterInbound.qty)).toBeCloseTo(context.productionQty, 3);

    const salesOrderRes = await api.post('/api/sales/orders').send({
      customer_id: context.customerId,
      contract_code: `${prefix}-SO-CONTRACT`,
      delivery_date: today(),
      status: 'draft',
      remark: `${prefix} sales order`,
      items: [
        {
          material_id: context.productId,
          quantity: context.salesQty,
          unit_price: 30,
        },
      ],
    });
    expectHttp(salesOrderRes, 201, 'create sales order');
    const salesOrder = dataOf(salesOrderRes);
    context.salesOrderId = salesOrder.id;
    context.salesOrderNo = salesOrder.order_no;

    const salesOutboundRes = await api.post('/api/sales/outbound').send({
      order_id: context.salesOrderId,
      delivery_date: today(),
      status: 'draft',
      remarks: `${prefix} sales outbound`,
      items: [
        {
          material_id: context.productId,
          quantity: context.salesQty,
          unit_price: 30,
          source_order_id: context.salesOrderId,
          source_order_no: context.salesOrderNo,
        },
      ],
    });
    expectHttp(salesOutboundRes, 201, 'create sales outbound');
    context.salesOutboundId = dataOf(salesOutboundRes).id;
    context.salesOutboundNo = dataOf(salesOutboundRes).outbound_no;

    const processingSalesOutboundRes = await api
      .put(`/api/sales/outbound/${context.salesOutboundId}`)
      .send({
        order_id: context.salesOrderId,
        delivery_date: today(),
        status: 'processing',
        remarks: `${prefix} sales outbound processing`,
        items: [
          {
            material_id: context.productId,
            quantity: context.salesQty,
            unit_price: 30,
            source_order_id: context.salesOrderId,
            source_order_no: context.salesOrderNo,
          },
        ],
      });
    expectHttp(processingSalesOutboundRes, 200, 'process sales outbound');

    const completeSalesOutboundRes = await api
      .put(`/api/sales/outbound/${context.salesOutboundId}`)
      .send({
        order_id: context.salesOrderId,
        delivery_date: today(),
        status: 'completed',
        remarks: `${prefix} sales outbound completed`,
        items: [
          {
            material_id: context.productId,
            quantity: context.salesQty,
            unit_price: 30,
            source_order_id: context.salesOrderId,
            source_order_no: context.salesOrderNo,
          },
        ],
      });
    expectHttp(completeSalesOutboundRes, 200, 'complete sales outbound');

    const fgStockAfterSales = await scalar(
      `SELECT COALESCE(SUM(quantity), 0) AS qty
       FROM inventory_ledger
       WHERE material_id = ? AND location_id = ?`,
      [context.productId, context.fgLocationId]
    );
    expect(Number(fgStockAfterSales.qty)).toBeCloseTo(
      context.productionQty - context.salesQty,
      3
    );

    // Professional path: AR from sales outbound (order-level AR is disabled by default)
    const arRes = await api.post(
      `/api/finance/integration/ar-invoice-from-outbound/${context.salesOutboundId}`
    );
    expectHttp(arRes, 200, 'generate AR invoice from outbound');
    const arData = dataOf(arRes);
    context.arInvoiceId = arData.invoiceId || arData.id;

    const productionCostRes = await api.post(
      `/api/finance/automation/production/cost-entry/${context.productionTaskId}`
    );
    expectHttp(productionCostRes, 200, 'generate production cost entry');

    const inventoryCostRes = await api.post('/api/finance/cost/recalculate-inventory').send({
      materialId: context.productId,
      method: 'moving_average',
    });
    expectHttp(inventoryCostRes, 200, 'recalculate inventory cost');

    const finishedGoodsUnitCost = await scalar(
      `SELECT unit_cost, total_value
       FROM inventory_ledger
       WHERE transaction_type = 'production_inbound'
         AND material_id = ?
         AND quantity > 0
       ORDER BY id DESC
       LIMIT 1`,
      [context.productId]
    );
    expect(Number(finishedGoodsUnitCost.unit_cost)).toBeGreaterThan(0);
    expect(Number(finishedGoodsUnitCost.total_value)).toBeCloseTo(
      context.productionQty * Number(finishedGoodsUnitCost.unit_cost),
      2
    );

    const salesOutboundCost = await scalar(
      `SELECT unit_cost, total_value
       FROM inventory_ledger
       WHERE transaction_type = 'sales_outbound'
         AND material_id = ?
         AND quantity < 0
       ORDER BY id DESC
       LIMIT 1`,
      [context.productId]
    );
    expect(Number(salesOutboundCost.unit_cost)).toBeGreaterThan(0);
    expect(Number(salesOutboundCost.total_value)).toBeCloseTo(
      context.salesQty * Number(salesOutboundCost.unit_cost),
      2
    );

    const costClosingRes = await api.post(
      `/api/finance/automation/cost-closing/${context.periodId}`
    );
    if (costClosingRes.status === 400 && costClosingRes.body?.code === 'DUPLICATE_CLOSING') {
      context.costClosingDuplicate = true;
    } else {
      expectHttp(costClosingRes, 200, 'execute cost closing');
    }

    const apInvoice = await scalar(
      "SELECT id, invoice_number, total_amount FROM ap_invoices WHERE source_type = 'purchase_receipt' AND source_id = ?",
      [context.purchaseReceiptId]
    );
    expect(apInvoice.id).toBeTruthy();

    const arInvoice = await scalar(
      "SELECT id, invoice_number, total_amount FROM ar_invoices WHERE source_type = 'sales_outbound' AND source_id = ?",
      [context.salesOutboundId]
    );
    expect(arInvoice.id).toBeTruthy();

    const apGlEntry = await waitFor(
      async () => {
        const row = await scalar(
          'SELECT id FROM gl_entries WHERE document_number = ? AND is_reversed = 0 LIMIT 1',
          [apInvoice.invoice_number]
        );
        return row.id ? row : null;
      },
      'AP GL entry'
    );
    const arGlEntry = await waitFor(
      async () => {
        const row = await scalar(
          'SELECT id FROM gl_entries WHERE document_number = ? AND is_reversed = 0 LIMIT 1',
          [arInvoice.invoice_number]
        );
        return row.id ? row : null;
      },
      'AR GL entry'
    );
    context.apGlEntryId = apGlEntry.id;
    context.arGlEntryId = arGlEntry.id;

    const actualCost = await scalar(
      'SELECT id, total_cost FROM actual_costs WHERE production_order_id = ? ORDER BY id DESC LIMIT 1',
      [context.productionTaskId]
    );
    expect(actualCost.id).toBeTruthy();

    const documentLinks = await scalar(
      `SELECT COUNT(*) AS count
       FROM document_links
       WHERE (source_id IN (?, ?, ?) OR target_id IN (?, ?, ?))`,
      [
        context.purchaseOrderId,
        context.productionPlanId,
        context.salesOrderId,
        context.purchaseReceiptId,
        context.productionTaskId,
        context.salesOutboundId,
      ]
    );
    expect(Number(documentLinks.count)).toBeGreaterThanOrEqual(3);
  });
});
