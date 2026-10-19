'use strict';

// Real browser operations only. Fixtures initialize master data; this module never
// inserts or updates a business table. All SQL below is evidence readback.
// fixture.sales = { customer:{id,code,name}, contractCode, deliveryDate,
//   lines:[{id,code,name,sourceType,quantity,price,onHand:0,
//           bom:[{materialId,quantityPerUnit}]}] }
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const dataOf = body => body?.data?.data || body?.data || body;
const pageOf = ctx => ctx.page;
const liveDialog = page => page.locator('.el-dialog:visible').last();
const dataRow = (page, text) => page.locator('.el-table__body-wrapper tbody > tr').filter({ hasText: text }).first();
const escapeRegex = text => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const asNumber = value => Number(Number(value).toFixed(6));

async function snapshot(ctx, name) {
  if (!ctx.evidenceDir) return;
  await fs.mkdir(ctx.evidenceDir, { recursive: true });
  const file = path.join(ctx.evidenceDir, name.replace(/[^a-zA-Z0-9_-]/g, '-'));
  await pageOf(ctx).screenshot({ path: `${file}.png`, fullPage: true });
  await fs.writeFile(`${file}.aria.txt`, await pageOf(ctx).locator('body').ariaSnapshot(), 'utf8');
}

async function rows(ctx, sql, args = []) {
  const [result] = await ctx.db.query(sql, args);
  return result;
}

async function requestByButton(ctx, method, pathname, click) {
  const expected = new RegExp(pathname);
  const pending = pageOf(ctx).waitForResponse(response =>
    response.request().method() === method && expected.test(new URL(response.url()).pathname),
  { timeout: 45000 });
  // Immediately handle rejection if UI validation prevents a request; do not
  // let the delayed timeout become an unhandled rejection during the next step.
  pending.catch(() => {});
  await click();
  const response = await pending;
  const body = await response.json();
  assert.ok(response.ok() && body.success !== false,
    `${method} ${pathname}: HTTP ${response.status()} ${JSON.stringify(body)}`);
  return dataOf(body);
}

async function createOrder(ctx, spec) {
  const page = pageOf(ctx);
  assert.ok(spec.customer?.code || spec.customer?.name, 'fixture.sales.customer is required');
  assert.ok(spec.lines?.length, 'fixture.sales.lines is required');
  await page.goto(`${ctx.baseUrl}/sales/orders`);
  await page.getByRole('button', { name: /新增订单|添加订单|增加订单/ }).click();
  const dialog = liveDialog(page);
  await dialog.getByText('新增订单', { exact: true }).waitFor();
  await snapshot(ctx, 'sales-order-new');

  const customer = dialog.getByRole('combobox', { name: /客户名称/ });
  await customer.fill(spec.customer.code || spec.customer.name);
  await page.getByRole('option').filter({ hasText: spec.customer.code || spec.customer.name }).first().click();
  await dialog.getByPlaceholder('请输入合同编码').fill(spec.contractCode);
  if (spec.deliveryDate) {
    const delivery = dialog.getByRole('combobox', { name: /交付日期/ });
    await delivery.fill(spec.deliveryDate);
    await delivery.press('Tab');
  }
  for (let i = 0; i < spec.lines.length; i++) {
    if (i) await dialog.getByRole('button', { name: '添加物料', exact: true }).click();
    const line = spec.lines[i];
    const row = dialog.locator('.order-items-table .el-table__body-wrapper tbody > tr').nth(i);
    await row.getByPlaceholder('输入', { exact: true }).fill(line.code);
    await page.getByRole('option').filter({ hasText: line.code }).first().click();
    await row.getByPlaceholder('数量', { exact: true }).fill(String(line.quantity));
    await row.getByPlaceholder('单价', { exact: true }).fill(String(line.price));
    await row.getByPlaceholder('单价', { exact: true }).press('Tab');
  }
  await snapshot(ctx, 'sales-order-filled');
  const created = await requestByButton(ctx, 'POST', '^/api/sales/orders$', async () => {
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    if (spec.lines.some(line => Number(line.quantity) > Number(line.onHand || 0))) {
      const confirm = page.getByRole('button', { name: '继续创建', exact: true });
      await confirm.waitFor({ state: 'visible', timeout: 15000 });
      await snapshot(ctx, 'sales-order-shortage-warning');
      await confirm.click();
    }
  });
  await dialog.waitFor({ state: 'hidden' });
  const orderId = Number(created.id);
  assert.ok(orderId > 0, '销售创建响应必须返回实际订单 ID');
  const [order] = await rows(ctx, 'SELECT id,order_no,customer_id,contract_code,status,total_amount FROM sales_orders WHERE id=?', [orderId]);
  assert.equal(Number(order.customer_id), Number(spec.customer.id));
  assert.equal(order.contract_code, spec.contractCode);
  await dataRow(page, order.order_no).waitFor({ state: 'visible' });
  await snapshot(ctx, 'sales-order-created');
  return { ...order, orderNo: order.order_no, lines: spec.lines };
}

async function assertDemandSplit(ctx, order, spec) {
  const links = await rows(ctx, `SELECT source_type,source_id,target_type,target_id
    FROM document_links WHERE source_type='sales_order' AND source_id=?`, [order.id]);
  const plans = await rows(ctx, `SELECT p.id,p.code,p.product_id,p.quantity,p.status,p.department_id,p.contract_code
    FROM production_plans p JOIN document_links d ON d.target_type='production_plan' AND d.target_id=p.id
    WHERE d.source_type='sales_order' AND d.source_id=? AND p.deleted_at IS NULL`, [order.id]);
  const requisitions = await rows(ctx, `SELECT r.id,r.requisition_number,r.status,r.contract_code
    FROM purchase_requisitions r JOIN document_links d ON d.target_type='purchase_requisition' AND d.target_id=r.id
    WHERE d.source_type='sales_order' AND d.source_id=? AND r.deleted_at IS NULL`, [order.id]);
  const requisitionLines = [];
  for (const req of requisitions) {
    req.items = await rows(ctx, 'SELECT id,requisition_id,material_id,quantity FROM purchase_requisition_items WHERE requisition_id=? ORDER BY id', [req.id]);
    requisitionLines.push(...req.items);
  }
  const expectedInternal = spec.lines.filter(line => line.sourceType === 'internal' && Number(line.quantity) > Number(line.onHand || 0));
  const expectedExternal = spec.lines.filter(line => line.sourceType === 'external' && Number(line.quantity) > Number(line.onHand || 0));
  assert.equal(plans.length, expectedInternal.length, '每个自制成品缺口应生成一个关联生产计划');
  for (const line of expectedInternal) {
    const plan = plans.find(item => Number(item.product_id) === Number(line.id));
    assert.ok(plan, `自制物料 ${line.code} 必须通过 document_links 关联生产计划`);
    assert.equal(asNumber(plan.quantity), asNumber(line.quantity - (line.onHand || 0)), `${line.code} 生产数量等于净缺口`);
    assert.equal(plan.status, 'draft');
    assert.equal(plan.contract_code, spec.contractCode);
    plan.materials = await rows(ctx, 'SELECT material_id,required_quantity,stock_quantity FROM production_plan_materials WHERE plan_id=? ORDER BY material_id', [plan.id]);
    assert.ok(plan.materials.length, '生产计划必须同步生成 BOM 用料需求');
    for (const component of line.bom || []) {
      const requirement = plan.materials.find(item => Number(item.material_id) === Number(component.materialId));
      assert.ok(requirement, '每个一级 BOM 零件应有生产计划用量');
      assert.equal(asNumber(requirement.required_quantity), asNumber(component.quantityPerUnit * plan.quantity));
    }
  }
  assert.equal(requisitionLines.length, expectedExternal.length, '外购物料进入关联采购申请');
  for (const line of expectedExternal) {
    const reqLine = requisitionLines.find(item => Number(item.material_id) === Number(line.id));
    assert.ok(reqLine, `外购物料 ${line.code} 应生成采购申请明细`);
    assert.equal(asNumber(reqLine.quantity), asNumber(line.quantity - (line.onHand || 0)));
  }
  for (const req of requisitions) {
    assert.equal(req.status, 'draft', '销售缺货只生成草稿请购，须按前端提交后形成采购订单');
    assert.equal(req.contract_code, spec.contractCode);
    const orders = await rows(ctx, 'SELECT id FROM purchase_orders WHERE requisition_id=? AND deleted_at IS NULL', [req.id]);
    assert.equal(orders.length, 0, '不得越过采购申请提交步骤');
  }
  const expectedStatus = expectedInternal.length ? 'in_production' : expectedExternal.length ? 'in_procurement' : 'ready_to_ship';
  assert.equal(order.status, expectedStatus, '销售订单状态需反映实际下游分流');
  await ctx.record('sales-demand-links', { order, links, plans, requisitions });
  return { order, plans, requisitions, lines: spec.lines };
}

async function runSales(ctx) {
  const spec = ctx.fixture.sales;
  let order;
  await ctx.step('销售前端下单并接受缺货分流', async () => { order = await createOrder(ctx, spec); });
  let result;
  await ctx.step('核对销售→生产计划/采购申请来源、缺口数量及 BOM 用量', async () => {
    result = await assertDemandSplit(ctx, order, spec);
  });
  return result;
}

async function createDraftDelivery(ctx, order, quantities = null) {
  const page = pageOf(ctx);
  await page.goto(`${ctx.baseUrl}/sales/orders`);
  const row = dataRow(page, order.orderNo || order.order_no);
  await row.waitFor({ state: 'visible' });
  await snapshot(ctx, `sales-ready-${order.id}`);
  const created = await requestByButton(ctx, 'POST', '^/api/sales/outbound$', () => row.getByRole('button', { name: '发货', exact: true }).click());
  const id = Number(created.id);
  assert.ok(id > 0, '点击发货必须返回出库单 ID');
  const [outbound] = await rows(ctx, 'SELECT id,outbound_no,order_id,status FROM sales_outbound WHERE id=?', [id]);
  assert.equal(Number(outbound.order_id), Number(order.id));
  assert.equal(outbound.status, 'draft');
  await page.goto(`${ctx.baseUrl}/sales/outbound`);
  const outboundRow = dataRow(page, outbound.outbound_no);
  await outboundRow.waitFor({ state: 'visible' });
  if (quantities) await editDeliveryQuantities(ctx, order, outbound, quantities);
  outbound.items = await rows(ctx, 'SELECT id,product_id,quantity,source_order_id FROM sales_outbound_items WHERE outbound_id=? ORDER BY id', [id]);
  assert.ok(outbound.items.length > 0);
  for (const line of outbound.items) assert.equal(Number(line.source_order_id), Number(order.id));
  await ctx.record('sales-draft-delivery', outbound);
  return { ...outbound, outboundNo: outbound.outbound_no };
}

async function editDeliveryQuantities(ctx, order, outbound, quantities) {
    const page = pageOf(ctx), id = outbound.id;
    await page.goto(`${ctx.baseUrl}/sales/outbound`);
    const outboundRow = dataRow(page, outbound.outbound_no);
    await outboundRow.waitFor({ state: 'visible' });
    await outboundRow.getByRole('button', { name: '编辑', exact: true }).click();
    const dialog = liveDialog(page);
    await dialog.getByText('编辑出库单', { exact: true }).waitFor();
    for (const line of order.lines) {
      const quantity = quantities[line.id] ?? quantities[line.code];
      if (quantity == null) continue;
      const itemRow = dialog.locator('.el-table__body-wrapper tbody > tr').filter({ hasText: line.code }).first();
      const input = itemRow.getByPlaceholder('数量', { exact: true });
      await input.fill(String(quantity));
      await input.press('Tab');
    }
    await snapshot(ctx, `sales-partial-draft-${id}`);
    await requestByButton(ctx, 'PUT', `^/api/sales/outbound/${id}$`, () => dialog.getByRole('button', { name: '确认', exact: true }).click());
    await dialog.waitFor({ state: 'hidden' });
}

async function submitDelivery(ctx, outbound) {
  const page = pageOf(ctx);
  await page.goto(`${ctx.baseUrl}/sales/outbound`);
  const [current] = await rows(ctx, 'SELECT status FROM sales_outbound WHERE id=?', [outbound.id]);
  assert.ok(['draft', 'processing', 'completed'].includes(current?.status), 'Unexpected outbound state');
  if (current.status === 'completed') {
    await ctx.record('销售出库恢复：业务已完成', { id: outbound.id });
    return;
  }
  let row = dataRow(page, outbound.outboundNo || outbound.outbound_no);
  if (current.status === 'draft') await requestByButton(ctx, 'PUT', `^/api/sales/outbound/${outbound.id}$`, () => row.getByRole('button', { name: '开始处理', exact: true }).click());
  row = dataRow(page, outbound.outboundNo || outbound.outbound_no);
  await row.getByRole('button', { name: '完成', exact: true }).waitFor({ state: 'visible' });
  await requestByButton(ctx, 'PUT', `^/api/sales/outbound/${outbound.id}$`, () => row.getByRole('button', { name: '完成', exact: true }).click());
  const postings = await rows(ctx, `SELECT id,posting_no,source_no,finance_status,total_value
    FROM inventory_posting_documents WHERE source_type='sales_outbound' AND source_id=? AND posting_kind='movement' ORDER BY id`, [outbound.id]);
  assert.equal(postings.length, 1, '业务完成只应产生一笔库存过账请求');
  assert.equal(postings[0].finance_status, 'pending', '业务完成后先等待财务审核');
  await snapshot(ctx, `sales-complete-awaiting-finance-${outbound.id}`);
  await ctx.record('sales-delivery-awaiting-finance', { outbound, postings });
  return postings[0];
}

async function assertPostedDelivery(ctx, outbound) {
  const postings = await rows(ctx, `SELECT id,posting_no,finance_status,total_value FROM inventory_posting_documents
    WHERE source_type='sales_outbound' AND source_id=? AND posting_kind='movement'`, [outbound.id]);
  assert.equal(postings.length, 1);
  assert.equal(postings[0].finance_status, 'approved');
  const movements = await rows(ctx, `SELECT material_id,SUM(signed_quantity) AS quantity
    FROM inventory_posting_lines WHERE posting_document_id=? GROUP BY material_id`, [postings[0].id]);
  const ledger = await rows(ctx, `SELECT material_id,SUM(quantity) AS quantity,SUM(total_value) AS value
    FROM inventory_ledger WHERE posting_document_id=? GROUP BY material_id`, [postings[0].id]);
  assert.ok(ledger.length > 0, 'Approved sales delivery must have formal inventory ledger rows');
  for (const item of outbound.items) {
    const movement = movements.find(line => Number(line.material_id) === Number(item.product_id));
    assert.ok(movement);
    const sum = outbound.items.filter(line => Number(line.product_id) === Number(item.product_id)).reduce((total, line) => total + Number(line.quantity), 0);
    assert.equal(asNumber(movement.quantity), -asNumber(sum), '财审出库数量等于当前单据数量且只记账一次');
    const formal = ledger.find(line => Number(line.material_id) === Number(item.product_id));
    assert.ok(formal, 'Each delivered material must reach the formal ledger');
    assert.equal(asNumber(formal.quantity), -asNumber(sum));
  }
  const ar = await rows(ctx, `SELECT id,source_type,source_id,total_amount,balance_amount,status
    FROM ar_invoices WHERE source_type='sales_outbound' AND source_id=?`, [outbound.id]);
  await ctx.record('sales-posted-delivery', { postings, movements, ledger, ar });
  return { postings, movements, ledger, ar };
}

module.exports = { runSales, createOrder, assertDemandSplit, createDraftDelivery, editDeliveryQuantities, submitDelivery, assertPostedDelivery, snapshot, dataRow, requestByButton, escapeRegex };
