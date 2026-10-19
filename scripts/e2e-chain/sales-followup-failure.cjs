'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dbConfig, requireBackend, evidenceDir, DATABASE } = require('./config.cjs');
const fixtureFile = path.join(evidenceDir, 'sales-followup-failure-fixture.json');

async function prepare() {
  const fixture = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'fixture.private.json'), 'utf8'));
  const manufacturing = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'manufacturing-fixture.json'), 'utf8'));
  const db = await requireBackend('mysql2/promise').createConnection(dbConfig);
  try {
    const [[database]] = await db.query('SELECT DATABASE() AS name');
    assert.equal(database.name, DATABASE);
    const code = `${fixture.prefix}NOBOM`;
    let [[material]] = await db.execute('SELECT * FROM materials WHERE code = ?', [code]);
    if (!material) {
      const source = fixture.materials.internal;
      const [inserted] = await db.query('INSERT INTO materials SET ?', {
        code, name: `${fixture.prefix}_缺BOM回归专用`, material_source_id: source.material_source_id,
        supplier_id: fixture.supplier.id, unit_id: fixture.unit.id,
        location_id: fixture.location.id, location_name: fixture.location.name,
        production_group_id: manufacturing.group.id, material_type: 'finished',
        price: 100, cost_price: 10, tax_rate: 0.13, status: 1,
        remark: '隔离测试缺少BOM时下游整体回滚；不得修改主链BOM',
      });
      [[material]] = await db.execute('SELECT * FROM materials WHERE id = ?', [inserted.insertId]);
    }
    const [[count]] = await db.execute('SELECT COUNT(*) AS n FROM bom_masters WHERE product_id = ?', [material.id]);
    assert.equal(Number(count.n), 0, 'Negative fixture must deliberately have no BOM');
    const result = { id: material.id, code: material.code, name: material.name, quantity: 1, price: 100, onHand: 0, sourceType: 'internal' };
    fs.writeFileSync(fixtureFile, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ database: database.name, materialId: result.id, materialCode: result.code }));
    return result;
  } finally { await db.end(); }
}

async function run() {
  const { createRuntime } = require('./runtime.cjs');
  const { createOrder, dataRow, requestByButton } = require('./sales.cjs');
  const material = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
  const ctx = await createRuntime('sales-followup-failure');
  try {
    let order;
    await ctx.step('缺BOM：UI保存订单明确提示后续失败，数据库不留下半张生产计划', async () => {
      const response = ctx.page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/sales/orders');
      response.catch(() => {});
      let warningText;
      const warningEvidence = (async () => {
        const warning = ctx.page.locator('.el-message--warning').filter({ hasText: '备货处理失败' });
        await warning.waitFor({ timeout: 60000 });
        warningText = await warning.innerText();
        assert.match(warningText, /BOM/);
        await ctx.snapshot('缺BOM-保存成功但后续失败警告');
      })();
      warningEvidence.catch(() => {});
      order = await createOrder(ctx, { customer: ctx.fixture.customer,
        contractCode: `${ctx.fixture.prefix}NOBOM-${Date.now()}`, deliveryDate: ctx.fixture.today, lines: [material] });
      const http = await response;
      const body = await http.json();
      assert.equal(http.status(), 201, 'The sales order itself was saved');
      assert.equal(body.data.followUp.status, 'failed');
      assert.equal(body.data.followUp.code, 'FOLLOW_UP_GENERATION_FAILED');
      assert.equal(order.status, 'shortage');
      await warningEvidence;
      const [[counts]] = await ctx.db.execute(
        `SELECT (SELECT COUNT(*) FROM production_plans WHERE remark LIKE ?) AS plans,
          (SELECT COUNT(*) FROM production_plan_materials ppm JOIN production_plans pp ON pp.id=ppm.plan_id WHERE pp.remark LIKE ?) AS requirements,
          (SELECT COUNT(*) FROM purchase_requisitions WHERE remarks LIKE ?) AS requisitions,
          (SELECT COUNT(*) FROM document_links WHERE source_type='sales_order' AND source_id=?) AS links`,
        [`%${order.order_no}%`, `%${order.order_no}%`, `%${order.order_no}%`, order.id]);
      for (const count of Object.values(counts)) assert.equal(Number(count), 0, 'Failure must leave no downstream rows');
      await ctx.record('缺BOM真实失败回归', { orderId: order.id, orderNo: order.order_no, materialId: material.id,
        state: order.status, warningText, followUp: body.data.followUp, counts });
    });
    await ctx.step('缺BOM回归测试单通过UI取消', async () => {
      await requestByButton(ctx, 'PUT', `/api/sales/orders/${order.id}/status`, async () => {
        await dataRow(ctx.page, order.order_no).getByRole('button', { name: '取消', exact: true }).click();
        const popconfirm = ctx.page.locator('.el-popconfirm:visible');
        await popconfirm.getByRole('button', { name: /^(确定|确认)$/ }).click();
        const message = ctx.page.locator('.el-message-box:visible');
        await message.getByRole('button', { name: /^(确定|确认)$/ }).click();
      });
      const [[saved]] = await ctx.db.execute('SELECT status FROM sales_orders WHERE id = ?', [order.id]);
      assert.equal(saved.status, 'cancelled');
    });
  } finally { await ctx.close(); }
}

if (require.main === module) {
  (process.argv[2] === 'prepare' ? prepare() : run()).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
module.exports = { prepare, run };
