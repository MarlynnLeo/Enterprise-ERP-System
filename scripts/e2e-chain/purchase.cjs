'use strict';

// Continues actual sales/production requisitions through the procurement UI.
// Readback SQL is intentionally SELECT-only; no status, inspection or stock is
// manufactured by the script. Inventory approval is a separate finance step.
const assert = require('node:assert/strict');
const { snapshot, dataRow, requestByButton } = require('./sales.cjs');
const dialogOf = ctx => ctx.page.locator('.el-dialog:visible').last();
const rows = async (ctx, sql, args = []) => (await ctx.db.query(sql, args))[0];
const closeEnough = (actual, expected, label) => assert.ok(Math.abs(Number(actual) - Number(expected)) < 0.000001, `${label}: ${actual} != ${expected}`);

async function openListRow(ctx, route, placeholder, value, useSearchButton = false) {
  await ctx.page.goto(`${ctx.baseUrl}${route}`);
  const input = ctx.page.getByPlaceholder(placeholder, { exact: true });
  await input.fill(String(value));
  if (useSearchButton) await ctx.page.getByRole('button', { name: /^查询$|^搜索$/ }).first().click();
  else await input.press('Enter');
  const row = dataRow(ctx.page, String(value));
  await row.waitFor({ state: 'visible' });
  return row;
}

async function submitRequisitions(ctx, requisitionIds) {
  const purchaseOrders = [];
  await ctx.asActor('business');
  for (const id of [...new Set(requisitionIds.map(value => Number(value.id || value)))]) {
    await ctx.step(`采购申请 ${id} 前端提交并自动分配供应商订单`, async () => {
      const [requisition] = await rows(ctx, 'SELECT id,requisition_number,status FROM purchase_requisitions WHERE id=? AND deleted_at IS NULL', [id]);
      assert.ok(requisition, `关联采购申请 ${id} 存在`);
      const row = await openListRow(ctx, '/purchase/requisitions', '申请单号、合同编码或物料', requisition.requisition_number);
      if (['draft', 'submitted', 'approved'].includes(requisition.status)) {
        await requestByButton(ctx, 'PUT', `^/api/purchase/requisitions/${id}/status$`, () => row.getByRole('button', { name: /^提交$|^生成剩余订单$/ }).click());
      } else assert.equal(requisition.status, 'completed', '只有已提交并生成订单的申请可复用');
      const orders = await rows(ctx, `SELECT id,order_no,supplier_id,status,requisition_id,total_amount,expected_delivery_date
        FROM purchase_orders WHERE requisition_id=? AND deleted_at IS NULL AND status NOT IN ('cancelled','rejected') ORDER BY id`, [id]);
      assert.ok(orders.length, '采购申请提交后必须自动生成采购订单');
      const required = await rows(ctx, 'SELECT material_id,SUM(quantity) AS quantity FROM purchase_requisition_items WHERE requisition_id=? GROUP BY material_id', [id]);
      const actual = await rows(ctx, `SELECT i.material_id,SUM(i.quantity) AS quantity FROM purchase_order_items i
        JOIN purchase_orders p ON p.id=i.order_id WHERE p.requisition_id=? AND p.deleted_at IS NULL AND p.status NOT IN ('cancelled','rejected') GROUP BY i.material_id`, [id]);
      assert.equal(actual.length, required.length);
      for (const item of required) {
        const match = actual.find(line => Number(line.material_id) === Number(item.material_id));
        assert.ok(match, '采购申请物料必须进入采购订单');
        closeEnough(match.quantity, item.quantity, '采购订单累计数量等于请购量，禁止重复生成');
      }
      const links = await rows(ctx, `SELECT target_id FROM document_links WHERE source_type='purchase_requisition'
        AND source_id=? AND target_type='purchase_order'`, [id]);
      for (const order of orders) assert.ok(links.some(link => Number(link.target_id) === Number(order.id)), '请购与每张 PO 有单据来源关联');
      await ctx.record('purchase-requisition-allocation', { requisition, orders, required, actual, links });
      await snapshot(ctx, `purchase-requisition-${id}-submitted`);
      purchaseOrders.push(...orders);
    });
  }
  return { purchaseOrderIds: [...new Set(purchaseOrders.map(order => Number(order.id)))], orders: purchaseOrders };
}

async function completeOrderDraft(ctx, order) {
  const row = await openListRow(ctx, '/purchase/orders', '输入物料编码/物料名称/订单号', order.order_no);
  const items = await rows(ctx, `SELECT i.id,i.material_id,i.quantity,i.price,m.code,m.cost_price
    FROM purchase_order_items i JOIN materials m ON m.id=i.material_id WHERE i.order_id=? ORDER BY i.id`, [order.id]);
  const missingPrices = items.filter(item => !(Number(item.price) > 0));
  if (!order.expected_delivery_date || !order.supplier_id || missingPrices.length) {
    await row.getByRole('button', { name: '编辑', exact: true }).click();
    const dialog = dialogOf(ctx);
    await dialog.getByText('编辑采购订单', { exact: true }).waitFor();
    if (!order.expected_delivery_date) {
      const date = dialog.getByPlaceholder('选择预计到货日期');
      await date.fill(ctx.fixture.today);
      await date.press('Tab');
    }
    if (!order.supplier_id) {
      const supplier = ctx.fixture.purchase?.supplier || ctx.fixture.supplier;
      assert.ok(supplier?.name, '未分配供应商的自动订单需要明确 fixture supplier');
      await dialog.getByPlaceholder('搜索并选择供应商').fill(supplier.name);
      await ctx.page.getByRole('option').filter({ hasText: supplier.name }).first().click();
    }
    for (const item of missingPrices) {
      const price = ctx.fixture.purchase?.prices?.[item.material_id] ?? item.cost_price;
      assert.ok(Number(price) > 0, `物料 ${item.code} 必须有真实 fixture 采购单价`);
      const line = dialog.locator('.el-table__body-wrapper tbody > tr').filter({ hasText: item.code }).first();
      const input = line.getByRole('spinbutton').nth(1);
      await input.fill(String(price));
      await input.press('Tab');
    }
    await requestByButton(ctx, 'PUT', `^/api/purchase/orders/${order.id}$`, () => dialog.getByRole('button', { name: '保存', exact: true }).click());
    await dialog.waitFor({ state: 'hidden' });
  }
  const freshRow = dataRow(ctx.page, order.order_no);
  await requestByButton(ctx, 'PUT', `^/api/purchase/orders/${order.id}/status$`, async () => {
    await freshRow.getByRole('button', { name: '提交审核', exact: true }).click();
    await ctx.page.locator('.el-message-box:visible').getByRole('button', { name: '确定', exact: true }).click();
  });
}

async function approvePurchaseOrder(ctx, id) {
  await ctx.asActor('business');
  let [order] = await rows(ctx, 'SELECT id,order_no,supplier_id,status,expected_delivery_date FROM purchase_orders WHERE id=?', [id]);
  assert.ok(order);
  if (order.status === 'draft') await completeOrderDraft(ctx, order);
  await ctx.asActor('reviewer');
  for (let n = 0; n < 12; n++) {
    [order] = await rows(ctx, 'SELECT id,order_no,supplier_id,status,created_by FROM purchase_orders WHERE id=?', [id]);
    if (['approved', 'confirmed', 'partial_received', 'received', 'inspected', 'completed'].includes(order.status)) break;
    assert.equal(order.status, 'pending', '采购订单应等待工作流审核');
    assert.notEqual(Number(order.created_by), Number(ctx.actors.reviewer.id), '采购审核人与制单人分离');
    const row = await openListRow(ctx, '/purchase/orders', '输入物料编码/物料名称/订单号', order.order_no);
    await row.getByRole('button', { name: '审核', exact: true }).click();
    const dialog = dialogOf(ctx);
    await dialog.getByText('审核采购订单', { exact: true }).waitFor();
    await dialog.getByPlaceholder('请输入审批意见（选填）').fill('全链路测试：核对销售/生产缺口、供应商及金额，通过');
    await requestByButton(ctx, 'POST', '^/api/workflow/instances/\\d+/approve$', () => dialog.getByRole('button', { name: '通过', exact: true }).click());
    await dialog.waitFor({ state: 'hidden' });
  }
  [order] = await rows(ctx, 'SELECT id,order_no,status,created_by FROM purchase_orders WHERE id=?', [id]);
  assert.ok(['approved', 'confirmed', 'partial_received', 'received', 'inspected', 'completed'].includes(order.status), '采购审批应在正常工作流节点内完成');
  const workflow = await rows(ctx, `SELECT id,status,initiator_id FROM workflow_instances
    WHERE business_type='purchase_order' AND business_id=? AND deleted_at IS NULL ORDER BY id DESC`, [id]);
  await ctx.record('purchase-approval', { order, workflow });
  await snapshot(ctx, `purchase-order-${id}-approved`);
  await ctx.asActor('business');
  return order;
}

async function receiveOrder(ctx, order) {
  const row = await openListRow(ctx, '/purchase/orders', '输入物料编码/物料名称/订单号', order.order_no);
  await row.getByRole('button', { name: '到货', exact: true }).click();
  const dialog = dialogOf(ctx);
  await dialog.getByText('确认到货', { exact: true }).first().waitFor();
  // The UI carries actual outstanding quantities; do not replace them with a
  // direct API payload or alter the supplier/received quantities underneath it.
  await snapshot(ctx, `purchase-order-${order.id}-arrival`);
  const received = await requestByButton(ctx, 'POST', `^/api/purchase/orders/${order.id}/receive-with-inspection$`, () => dialog.getByRole('button', { name: '确认到货', exact: true }).click());
  await dialog.waitFor({ state: 'hidden' });
  assert.ok(Number(received.successCount) > 0, '到货按钮必须生成检验单');
  const ids = (received.inspections || []).map(inspection => Number(inspection.id));
  assert.equal(ids.length, Number(received.successCount));
  const inspections = [];
  for (const id of ids) {
    const [inspection] = await rows(ctx, `SELECT id,inspection_no,source_type,reference_id,purchase_order_item_id,material_id,quantity,status
      FROM quality_inspections WHERE id=? AND deleted_at IS NULL`, [id]);
    assert.equal(inspection.source_type, 'purchase_order');
    assert.equal(Number(inspection.reference_id), Number(order.id));
    assert.ok(Number(inspection.purchase_order_item_id) > 0, '检验单保存采购来源行');
    assert.equal(inspection.status, 'pending');
    inspections.push(inspection);
  }
  await ctx.record('purchase-arrival-inspections', { order, inspections });
  return inspections;
}

async function inspectIncoming(ctx, inspection) {
  const row = await openListRow(ctx, '/quality/incoming', '检验单号/物料名称/供应商', inspection.inspection_no);
  await row.getByRole('button', { name: '检验', exact: true }).click();
  const dialog = dialogOf(ctx);
  await dialog.getByText(`检验操作 - ${inspection.inspection_no}`, { exact: true }).waitFor();
  const firstMeasure = dialog.locator('.measurement-choice').first();
  await firstMeasure.waitFor({ state: 'visible', timeout: 20000 });
  const measurements = dialog.locator('.measurement-choice');
  const count = await measurements.count();
  assert.ok(count > 0, '来料检验必须展示真实专属模板测量项目');
  for (let index = 0; index < count; index++) {
    const measure = measurements.nth(index);
    await measure.click();
    const listboxId = await measure.getByRole('combobox').getAttribute('aria-controls');
    assert.ok(listboxId, '每个测量值选择框必须关联可访问的下拉选项');
    await ctx.page.locator(`[id="${listboxId}"]`).getByRole('option', { name: '√', exact: true }).click();
  }
  const qualified = dialog.locator('.el-form-item').filter({ has: ctx.page.getByText('合格数量', { exact: true }) }).locator('input');
  await qualified.fill(String(inspection.quantity));
  await qualified.press('Tab');
  const inspector = dialog.getByPlaceholder('请输入检验员姓名');
  if (!(await inspector.inputValue())) await inspector.fill(ctx.actors.business.realName || ctx.actors.business.username);
  await dialog.getByPlaceholder('请输入备注信息').fill('全链路测试：逐项外观检验合格');
  await snapshot(ctx, `incoming-${inspection.id}-measurements`);
  await requestByButton(ctx, 'PUT', `^/api/quality/inspections/${inspection.id}$`, () => dialog.getByRole('button', { name: '提交检验', exact: true }).click());
  await dialog.waitFor({ state: 'hidden' });
  const [saved] = await rows(ctx, 'SELECT id,status,qualified_quantity,unqualified_quantity FROM quality_inspections WHERE id=?', [inspection.id]);
  assert.equal(saved.status, 'passed');
  closeEnough(saved.qualified_quantity, inspection.quantity, '检验合格数量');
  closeEnough(saved.unqualified_quantity, 0, '检验不合格数量');
  const receipts = await rows(ctx, `SELECT id,receipt_no,order_id,inspection_id,status,total_amount
    FROM purchase_receipts WHERE inspection_id=? AND deleted_at IS NULL AND status<>'cancelled'`, [inspection.id]);
  assert.equal(receipts.length, 1, '来料检验合格自动生成且只生成一张收货单');
  const receipt = receipts[0];
  assert.equal(receipt.status, 'inspected');
  assert.equal(Number(receipt.order_id), Number(inspection.reference_id));
  receipt.items = await rows(ctx, 'SELECT id,material_id,order_item_id,received_quantity,qualified_quantity,price FROM purchase_receipt_items WHERE receipt_id=?', [receipt.id]);
  assert.ok(receipt.items.some(item => Number(item.order_item_id) === Number(inspection.purchase_order_item_id)), '收货单保留同一采购来源明细');
  await ctx.record('incoming-to-purchase-receipt', { inspection: saved, receipt });
  return { ...receipt, receiptNo: receipt.receipt_no };
}

async function completeReceipt(ctx, receipt) {
  const row = await openListRow(ctx, '/purchase/receipts', '请输入收货单号', receipt.receiptNo || receipt.receipt_no, true);
  await requestByButton(ctx, 'PUT', `^/api/purchase/receipts/${receipt.id}/status$`, () => row.getByRole('button', { name: '入库', exact: true }).click());
  const [saved] = await rows(ctx, 'SELECT id,status FROM purchase_receipts WHERE id=?', [receipt.id]);
  assert.equal(saved.status, 'completed');
  const postings = await rows(ctx, `SELECT id,posting_no,source_no,source_id,finance_status,total_value FROM inventory_posting_documents
    WHERE source_type='purchase_receipt' AND source_id=? AND posting_kind='movement'`, [receipt.id]);
  assert.equal(postings.length, 1, '业务入库完成只产生一个库存财审请求');
  assert.equal(postings[0].finance_status, 'pending');
  const ledger = await rows(ctx, 'SELECT id FROM inventory_ledger WHERE posting_document_id=?', [postings[0].id]);
  assert.equal(ledger.length, 0, '财务审核前库存台账不能提前增加');
  await ctx.record('purchase-receipt-awaiting-finance', { receipt: saved, posting: postings[0] });
  await snapshot(ctx, `purchase-receipt-${receipt.id}-awaiting-finance`);
  return postings[0];
}

async function receivePurchaseOrders(ctx, orderIds) {
  const orders = [], inspections = [], receipts = [], postings = [];
  for (const id of [...new Set(orderIds.map(value => Number(value.id || value)))]) {
    let order;
    await ctx.step(`采购订单 ${id} 填写交期、提交并由另一人审核`, async () => { order = await approvePurchaseOrder(ctx, id); orders.push(order); });
    let incoming;
    await ctx.step(`采购订单 ${id} 到货后自动生成来料检验`, async () => { incoming = await receiveOrder(ctx, order); inspections.push(...incoming); });
    for (const inspection of incoming) {
      let receipt;
      await ctx.step(`来料检验 ${inspection.inspection_no} 实测及判定→收货单`, async () => { receipt = await inspectIncoming(ctx, inspection); receipts.push(receipt); });
      await ctx.step(`采购收货 ${receipt.receiptNo} 业务入库→等待财审`, async () => { postings.push(await completeReceipt(ctx, receipt)); });
    }
  }
  return { purchaseOrderIds: orders.map(order => Number(order.id)), orders, inspections, receipts, receiptIds: receipts.map(receipt => Number(receipt.id)), postings, sourceNos: receipts.map(receipt => receipt.receiptNo) };
}

module.exports = { submitRequisitions, receivePurchaseOrders, approvePurchaseOrder, receiveOrder, inspectIncoming, completeReceipt };
