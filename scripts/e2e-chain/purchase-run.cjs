'use strict';

// Resume from persisted business documents; never replay completed arrival or
// inspection actions just because the browser session ended.
const assert = require('node:assert/strict');
const { createRuntime } = require('./runtime.cjs');
const purchase = require('./purchase.cjs');
const { approveInventoryPosting } = require('./finance.cjs');

async function main() {
  const inspectOnly = process.argv.includes('--inspect-only');
  const ctx = await createRuntime('purchase');
  const chain = ctx.loadChain();
  const query = async (sql, args) => (await ctx.db.query(sql, args))[0];
  const save = () => ctx.saveChain(chain);
  try {
    const allocation = await purchase.submitRequisitions(ctx, chain.requisitions.map(item => item.id));
    chain.purchaseOrderIds = allocation.purchaseOrderIds;
    chain.purchaseOrders = allocation.orders;
    chain.purchaseReceipts ||= [];
    chain.purchaseInspections ||= [];
    save();
    for (const id of chain.purchaseOrderIds) {
      let order;
      await ctx.step(`采购 ${id} 前端提交及异人工作流审批`, async () => { order = await purchase.approvePurchaseOrder(ctx, id); });
      save();
      let inspections = await query("SELECT id,inspection_no,source_type,reference_id,purchase_order_item_id,material_id,quantity,status FROM quality_inspections WHERE source_type='purchase_order' AND reference_id=? AND deleted_at IS NULL ORDER BY id", [id]);
      if (!inspections.length) await ctx.step(`采购 ${id} 前端到货生成质检单`, async () => { inspections = await purchase.receiveOrder(ctx, order); });
      for (const item of inspections) if (!chain.purchaseInspections.some(existing => existing.id === item.id)) chain.purchaseInspections.push(item);
      save();
      for (const inspection of inspections) {
        await ctx.asActor('business');
        let [receipt] = await query("SELECT id,receipt_no,order_id,inspection_id,status,total_amount FROM purchase_receipts WHERE inspection_id=? AND deleted_at IS NULL AND status<>'cancelled'", [inspection.id]);
        if (!receipt) {
          assert.ok(['pending', 'in_progress'].includes(inspection.status), 'Finished inspection has no auto-generated receipt');
          await ctx.step(`来料 ${inspection.inspection_no} 前端测量和判定`, async () => { receipt = await purchase.inspectIncoming(ctx, inspection); });
        }
        receipt.receiptNo ||= receipt.receipt_no;
        const receiptIndex = chain.purchaseReceipts.findIndex(item => Number(item.id) === Number(receipt.id));
        if (receiptIndex < 0) chain.purchaseReceipts.push(receipt);
        else chain.purchaseReceipts[receiptIndex] = receipt;
        chain.purchaseReceiptIds = chain.purchaseReceipts.map(item => item.id);
        save();
        if (inspectOnly) continue;
        if (receipt.status !== 'completed') {
          await ctx.step(`收货 ${receipt.receiptNo} 前端业务入库`, async () => { await purchase.completeReceipt(ctx, receipt); });
          receipt.status = 'completed';
          save();
        }
        await ctx.step(`收货 ${receipt.receiptNo} 前端独立财务审核`, async () => {
          const posting = await approveInventoryPosting(ctx, receipt.receiptNo);
          receipt.postingId = posting.id;
          receipt.financeStatus = 'approved';
        });
        save();
      }
    }
    chain.receipts = chain.purchaseReceipts;
    chain.purchaseComplete = !inspectOnly;
    save();
    console.log(JSON.stringify({ purchaseOrderIds: chain.purchaseOrderIds, inspectionIds: chain.purchaseInspections.map(item => item.id), receiptIds: chain.purchaseReceiptIds, sourceNos: chain.purchaseReceipts.map(item => item.receiptNo) }));
  } finally { await ctx.close(); }
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
