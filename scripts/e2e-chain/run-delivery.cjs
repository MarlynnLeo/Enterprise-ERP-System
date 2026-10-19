'use strict';

const assert = require('node:assert/strict');
const { createRuntime } = require('./runtime.cjs');
const sales = require('./sales.cjs');
const { approveInventoryPosting } = require('./finance.cjs');
const { assertInventoryBalances } = require('./inventory.cjs');

async function runDelivery(ctx, chain) {
  const query = async (sql, args = []) => (await ctx.db.query(sql, args))[0];
  const order = chain.order;
  const materials = ctx.fixture.materials;
  const firstQuantities = { [materials.internal.id]: 2, [materials.external.id]: 1 };
  const secondQuantities = { [materials.internal.id]: 3, [materials.external.id]: 2 };
  const save = async () => {
    chain.salesOutbounds = await query("SELECT * FROM sales_outbound WHERE order_id=? AND deleted_at IS NULL AND status<>'cancelled' ORDER BY id", [order.id]);
    chain.outboundIds = chain.salesOutbounds.map(row => row.id);
    ctx.saveChain(chain);
  };
  await save();
  assert.ok(chain.manufacturingComplete, 'Finish the actual upstream manufacturing chain first');
  assert.ok(chain.salesOutbounds.length <= 2, 'Unexpected extra delivery documents; inspect instead of replaying');
  for (let index = 0; index < 2; index++) {
    await ctx.asActor('business');
    const quantities = index === 0 ? firstQuantities : secondQuantities;
    let outbound = chain.salesOutbounds[index];
    await ctx.step(`销售第${index + 1}批：前端发货与剩余数量核对`, async () => {
      if (!outbound) {
        const [current] = await query('SELECT status FROM sales_orders WHERE id=?', [order.id]);
        assert.equal(current.status, index === 0 ? 'ready_to_ship' : 'partial_shipped');
        outbound = await sales.createDraftDelivery(ctx, order, index === 0 ? quantities : null);
        await save();
      } else if (index === 0 && outbound.status === 'draft') {
        // If interrupted after creation but before editing, finish the UI form.
        await sales.editDeliveryQuantities(ctx, order, outbound, quantities);
      }
      outbound.items = await query('SELECT * FROM sales_outbound_items WHERE outbound_id=? ORDER BY id', [outbound.id]);
      assert.equal(outbound.items.length, 2);
      for (const item of outbound.items) {
        assert.equal(Number(item.source_order_id), Number(order.id));
        assert.equal(Number(item.quantity), quantities[item.product_id], 'Each delivery uses only its actual outstanding demand');
      }
      await ctx.record('分批出库数量', { id: outbound.id, items: outbound.items });
    });
    await ctx.step(`销售第${index + 1}批：业务完成及同人财审拒绝`, async () => {
      await sales.submitDelivery(ctx, outbound);
      const [posting] = await query("SELECT * FROM inventory_posting_documents WHERE source_type='sales_outbound' AND source_id=? AND posting_kind='movement'", [outbound.id]);
      assert.ok(posting);
      if (posting.finance_status === 'pending') {
        const [ledger] = await query('SELECT COUNT(*) AS count FROM inventory_ledger WHERE posting_document_id=?', [posting.id]);
        assert.equal(Number(ledger.count), 0, 'Business completion must not write formal stock');
        const denied = await ctx.api('POST', `/api/finance/inventory-postings/${posting.id}/approve`, {}, 'business');
        assert.equal(denied.status, 403);
        await ctx.record('销售制单财审分离', { postingId: posting.id, sameActorStatus: denied.status, ledgerRows: 0 });
      }
    });
    await ctx.step(`销售第${index + 1}批：独立财审与订单履约状态`, async () => {
      const posting = await approveInventoryPosting(ctx, outbound.outbound_no);
      await sales.assertPostedDelivery(ctx, outbound);
      const [current] = await query('SELECT status FROM sales_orders WHERE id=?', [order.id]);
      // On a resumed completed chain, the first batch is already followed by the second.
      if (index === 1 || chain.salesOutbounds.length === 1) assert.equal(current.status, index === 0 ? 'partial_shipped' : 'shipped');
      const before = await query('SELECT id,quantity,total_value FROM inventory_ledger WHERE posting_document_id=? ORDER BY id', [posting.id]);
      const duplicate = await ctx.api('POST', `/api/finance/inventory-postings/${posting.id}/approve`, {}, 'finance');
      assert.ok([200, 400, 409, 422].includes(duplicate.status), 'Repeated approval must be idempotent or reject with a business error');
      assert.deepEqual(await query('SELECT id,quantity,total_value FROM inventory_ledger WHERE posting_document_id=? ORDER BY id', [posting.id]), before);
      await ctx.record('重复财审不重复记账', { postingId: posting.id, duplicateStatus: duplicate.status, ledgerRows: before.length });
      await save();
    });
  }
  await ctx.step('销售：两批发货合计及原料/成品库存守恒', async () => {
    await ctx.asActor('business');
    const delivered = await query("SELECT i.product_id,SUM(i.quantity) AS quantity FROM sales_outbound_items i JOIN sales_outbound o ON o.id=i.outbound_id WHERE o.order_id=? AND o.deleted_at IS NULL AND o.status='completed' GROUP BY i.product_id", [order.id]);
    for (const line of order.lines) assert.equal(Number(delivered.find(row => Number(row.product_id) === Number(line.id))?.quantity), Number(line.quantity));
    await assertInventoryBalances(ctx, { [materials.raw.id]: 0, [materials.internal.id]: 0, [materials.external.id]: 0 });
    const remaining = await ctx.api('GET', `/api/sales/orders/${order.id}/unshipped-items`);
    assert.equal(remaining.status, 200);
    const remainingItems = remaining.body.data?.items ?? remaining.body.items;
    assert.ok(Array.isArray(remainingItems), 'Unshipped response must explicitly return the items array');
    assert.equal(remainingItems.length, 0);
    await ctx.record('销售完整履约', { orderId: order.id, outboundIds: chain.outboundIds, delivered });
  });
  chain.deliveryComplete = true;
  await save();
}

if (require.main === module) {
  (async () => {
    const ctx = await createRuntime('sales-delivery');
    try { await runDelivery(ctx, ctx.loadChain()); }
    finally { await ctx.close(); }
  })().catch(error => { console.error(error.stack); process.exitCode = 1; });
}
module.exports = { runDelivery };
