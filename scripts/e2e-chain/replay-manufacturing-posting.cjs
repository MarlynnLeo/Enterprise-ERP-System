'use strict';

// One-time repair evidence for an already-processed approval event created
// before fulfillment was connected to finance approval. Never edits chain.json
// or business state through SQL: replay the same application event handler.
const assert = require('node:assert/strict');
const { DATABASE, dbConfig } = require('./config.cjs');
Object.assign(process.env, {
  DB_NAME: DATABASE, DB_HOST: dbConfig.host, DB_PORT: String(dbConfig.port || 3306),
  DB_USER: dbConfig.user, DB_PASSWORD: dbConfig.password,
  NODE_ENV: 'development', DISABLE_CRON: 'true', DISABLE_DLQ_RETRY: 'true',
  REDIS_ENABLED: 'false', DINGTALK_APP_KEY: '', DINGTALK_APP_SECRET: '', DINGTALK_API_TOKEN: '',
});

async function run() {
  const { createRuntime } = require('./runtime.cjs');
  const ctx = await createRuntime('manufacturing-approved-event-replay');
  const chain = ctx.loadChain();
  let factory;
  try {
    const backendDb = require('../../backend/src/config/db');
    factory = require('../../backend/src/database/ConnectionPoolFactory');
    const [[target]] = await backendDb.pool.query('SELECT DATABASE() AS name');
    assert.equal(target.name, DATABASE, 'Event replay must remain in the isolated chain database');
    const [[posting]] = await ctx.db.execute("SELECT * FROM inventory_posting_documents WHERE source_no=? AND posting_kind='movement'", [chain.inbound.inbound_no]);
    assert.equal(posting.finance_status, 'approved');
    const [[event]] = await ctx.db.execute("SELECT * FROM domain_events WHERE event_name='INVENTORY_POSTING_APPROVED' AND aggregate_id=?", [String(posting.id)]);
    assert(event, 'Replay requires the original persisted domain event');
    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
    assert.equal(Number(payload.postingDocumentId), Number(posting.id));
    const subscriber = require('../../backend/src/events/subscribers/FinanceSubscriber');
    const readback = async () => {
      const [[order]] = await ctx.db.execute('SELECT id,order_no,status,is_locked FROM sales_orders WHERE id=?', [chain.order.id]);
      const [reservations] = await ctx.db.execute('SELECT id,material_id,location_id,reserved_quantity,status FROM inventory_reservations WHERE order_id=? ORDER BY id', [chain.order.id]);
      const [stock] = await ctx.db.execute('SELECT material_id,SUM(quantity) AS quantity FROM inventory_ledger WHERE material_id IN (?,?,?) GROUP BY material_id ORDER BY material_id', [ctx.fixture.materials.internal.id,ctx.fixture.materials.external.id,ctx.fixture.materials.raw.id]);
      const [[counts]] = await ctx.db.query('SELECT (SELECT COUNT(*) FROM inventory_ledger) AS ledgerRows,(SELECT COUNT(*) FROM gl_entries) AS glEntries,(SELECT COUNT(*) FROM ap_invoices) AS apInvoices,(SELECT COUNT(*) FROM inventory_posting_documents) AS postingDocuments');
      return { order,reservations,stock,counts };
    };
    const before = await readback();
    await ctx.record('财审事件重放前', { eventId:event.id,postingId:posting.id,before });
    await ctx.step('重放已批准生产入库事件恢复销售齐套状态', async () => {
      await subscriber.handleInventoryPostingApproved(payload);
      const after = await readback();
      assert.equal(after.order.status,'ready_to_ship');
      assert.equal(Number(after.order.is_locked),1);
      assert.deepEqual(after.stock,before.stock,'Replaying approval must not post stock again');
      assert.deepEqual(after.counts,before.counts,'Replaying approval must not duplicate financial documents');
      for(const key of ['internal','external']) {
        const product=ctx.fixture.materials[key];
        const quantity=after.reservations.filter(r=>Number(r.material_id)===Number(product.id)&&r.status==='active').reduce((n,r)=>n+Number(r.reserved_quantity),0);
        assert.equal(quantity,Number(product.quantity));
      }
      await ctx.record('财审后销售齐套与预留',after);
    });
    const first = await readback();
    await ctx.step('再次重放不重复预留库存或财务凭证', async () => {
      await subscriber.handleInventoryPostingApproved(payload);
      const second=await readback();
      assert.deepEqual(second,first);
      await ctx.record('重复重放幂等',second);
    });
    const [[task]] = await ctx.db.execute('SELECT id,quantity,completed_quantity,material_cost,labor_cost,overhead_cost,actual_cost FROM production_tasks WHERE id=?', [chain.task.id]);
    const [ledger] = await ctx.db.execute('SELECT id,quantity,unit_cost,total_value,posting_document_id FROM inventory_ledger WHERE posting_document_id=?',[posting.id]);
    assert.equal(Number(task.actual_cost),Number(task.material_cost)+Number(task.labor_cost)+Number(task.overhead_cost));
    assert.equal(ledger.length,1);
    assert.equal(Number(ledger[0].total_value),Number(task.actual_cost));
    assert.equal(Number(ledger[0].unit_cost)*Number(ledger[0].quantity),Number(task.actual_cost));
    await ctx.record('生产成本与入库台账价值一致',{task,ledger});
    await ctx.page.goto(ctx.baseUrl+'/sales/orders');
    await ctx.snapshot('sales-ready-after-approved-event-replay');
  } finally {
    await ctx.close();
    if(factory) await factory.closeAll();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error.stack);process.exit(1);});
