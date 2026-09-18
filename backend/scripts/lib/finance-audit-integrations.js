'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');

module.exports = async function integrations(h) {
  const { test, call, http, reject, need, evidence, one, rows, ctx, prefix, today, calendar,
    finance, reviewer, bankBalance, equalMoney, assertEntry, eventually } = h;
  const stock = async () => Number((await one('SELECT COALESCE(SUM(quantity),0) n FROM inventory_ledger WHERE material_id=?', [ctx.materialId])).n);
  const poBody = items => ({ orderDate: today, supplierId: ctx.supplierId, expectedDeliveryDate: calendar.validityDate,
    status: 'draft', taxRate: 0.13, remarks: prefix, items });
  async function approveOrder(order) {
    http(await call('put', `/api/purchase/orders/${order.id}/status`, { newStatus: 'pending' }));
    for (let step = 0; step < 12; step++) {
      const workflow = await one("SELECT id,current_node_id FROM workflow_instances WHERE business_type='purchase_order' AND business_id=? AND status IN ('pending','in_progress') AND deleted_at IS NULL ORDER BY id DESC LIMIT 1", [order.id]);
      if (!workflow) break;
      http(await call('get', `/api/workflow/instances/${workflow.id}`, undefined, reviewer.api));
      http(await call('post', `/api/workflow/instances/${workflow.id}/approve`, { nodeId: workflow.current_node_id, action: 'approve', comment: prefix }, reviewer.api));
    }
    const result = http(await call('get', `/api/purchase/orders/${order.id}`));
    assert.equal(result.status, 'approved');
    return result;
  }
  async function posting(sourceNo, checkSelf = true) {
    const documents = await rows("SELECT id,finance_status FROM inventory_posting_documents WHERE source_no=? AND posting_kind='movement' AND finance_status='pending' ORDER BY posting_sequence,id", [sourceNo]);
    need(documents.length, `待财审库存单 ${sourceNo}`);
    for (const doc of documents) {
      assert.equal(Number((await one('SELECT COUNT(*) n FROM inventory_ledger WHERE posting_document_id=?', [doc.id])).n), 0);
      if (checkSelf) http(await call('post', `/api/finance/inventory-postings/${doc.id}/approve`, {}), 403);
      http(await call('post', `/api/finance/inventory-postings/${doc.id}/approve`, {}, finance.api));
      assert.equal((await one('SELECT finance_status FROM inventory_posting_documents WHERE id=?', [doc.id])).finance_status, 'approved');
    }
  }
  async function batch(kind, id, action = 'generate') {
    return http(await call('post', `/api/finance/integration/batch-${action}`, { businessType: kind, ids: [id], merge: false }, finance.api));
  }
  const invoice = async (kind, type, id) => need(await one(`SELECT * FROM ${kind}_invoices WHERE source_type=? AND source_id=? AND status NOT IN ('已作废','已取消')`, [type, id]), `${kind} 来源发票`);
  const invoiceGl = async inv => {
    const gl = need(await one("SELECT id FROM gl_entries WHERE document_number=? AND COALESCE(is_reversed,0)=0 ORDER BY id DESC LIMIT 1", [inv.invoice_number]), '发票凭证');
    return assertEntry(gl.id, Math.abs(Number(inv.total_amount)));
  };

  await test('CHAIN-PO', '采购到财务', '采购订单审批及价税金额', async () => {
    ctx.chainPo = await approveOrder(http(await call('post', '/api/purchase/orders', poBody([{ materialId: ctx.materialId, quantity: 10, price: 100, taxRate: 0.13 }])), 201));
    equalMoney(ctx.chainPo.totalAmount, 1130); evidence(ctx.chainPo);
  });
  await test('CHAIN-IQC', '采购到财务', '到货检验合格生成来源收货单', async () => {
    const template = http(await call('post', '/api/quality/templates', { templateCode: `${prefix}-IQC`, templateName: prefix,
      inspectionType: 'incoming', version: '1.0', materialTypes: [ctx.materialId], isGeneral: false, isAql: false,
      items: [{ itemName: '外观', standard: '完整', type: 'visual', method: '目视' }] }), [200, 201]);
    http(await call('put', `/api/quality/templates/${template.id}/status`, { status: 'active' }));
    const arrival = http(await call('post', `/api/purchase/orders/${need(ctx.chainPo, '采购订单').id}/receive-with-inspection`, { items: [{ materialId: ctx.materialId, receiveQuantity: 10 }] }));
    assert.equal(arrival.successCount, 1); const inspection = arrival.inspections[0];
    http(await call('put', `/api/quality/inspections/${inspection.id}`, { status: 'passed', qualifiedQuantity: 10, unqualifiedQuantity: 0,
      actualDate: today, inspectorId: ctx.actorId, inspectorName: prefix,
      items: [{ itemName: '外观', standard: '完整', type: 'visual', method: '目视', result: 'OK', actualValue: '符合' }] }));
    const receipt = need(await one("SELECT id FROM purchase_receipts WHERE inspection_id=? AND deleted_at IS NULL AND status<>'cancelled'", [inspection.id]), '检验生成收货单');
    ctx.chainReceipt = http(await call('get', `/api/purchase/receipts/${receipt.id}`));
    assert.equal(Number(ctx.chainReceipt.inspectionId), Number(inspection.id));
  });
  await test('CHAIN-RECEIVE-PENDING', '采购到财务', '收货完成待财审时不可提前生成应付', async () => {
    const receipt = need(ctx.chainReceipt, '收货单'); const before = await stock();
    http(await call('put', `/api/purchase/receipts/${receipt.id}/status`, { status: 'completed' }));
    equalMoney(await stock(), before);
    const d = await batch('purchase_receipt', receipt.id); evidence(d);
    assert.equal(Number(d.successCount), 0); assert.equal(Number(d.failedCount), 1);
    assert.equal(Number((await one("SELECT COUNT(*) n FROM ap_invoices WHERE source_type='purchase_receipt' AND source_id=?", [receipt.id])).n), 0);
  });
  await test('CHAIN-RECEIVE-APPROVE', '采购到财务', '独立财审形成数量10、成本1000的库存流水', async () => {
    const receipt = need(ctx.chainReceipt, '收货单'); const before = await stock(); await posting(receipt.receiptNo);
    equalMoney(await stock(), before + 10);
    const ledger = await one('SELECT SUM(quantity) quantity,SUM(total_value) amount FROM inventory_ledger WHERE reference_no=?', [receipt.receiptNo]);
    evidence(ledger); equalMoney(ledger.quantity, 10); equalMoney(ledger.amount, 1000);
  });
  await test('MATCH-CREATE', '三单匹配', '采购数量单价与收货单一致', async () => {
    ctx.match = http(await call('post', `/api/finance/integration/three-way-match/from-receipt/${need(ctx.chainReceipt, '收货').id}`, { remark: prefix }));
    equalMoney(ctx.match.poAmount, 1000); equalMoney(ctx.match.receiptAmount, 1000); assert.equal(ctx.match.items.length, 1);
  });
  await test('MATCH-VARIANCE', '三单匹配', '发票价格差异超过容差时禁止确认', async () => {
    const match = need(ctx.match, '三单匹配');
    const d = http(await call('put', `/api/finance/integration/three-way-match/${match.id}/lines`, { lines: [{ id: match.items[0].id, invoice_qty: 10, invoice_price: 101 }] }));
    assert.equal(d.status, 'variance'); equalMoney(d.amountVariance, 10);
    reject(await call('post', `/api/finance/integration/three-way-match/${match.id}/confirm`, {}, finance.api));
  });
  await test('MATCH-CONFIRM', '三单匹配', '修正量价后可确认', async () => {
    const match = need(ctx.match, '三单匹配');
    http(await call('put', `/api/finance/integration/three-way-match/${match.id}/lines`, { lines: [{ id: match.items[0].id, invoice_qty: 10, invoice_price: 100 }] }));
    assert.equal(http(await call('post', `/api/finance/integration/three-way-match/${match.id}/confirm`, {}, finance.api)).status, 'confirmed');
  });
  await test('CHAIN-AP-PREVIEW', '采购到财务', '生成凭证预览不产生发票或总账', async () => {
    const before = await one('SELECT (SELECT COUNT(*) FROM ap_invoices) invoices,(SELECT COUNT(*) FROM gl_entries) entries');
    const d = await batch('purchase_receipt', ctx.chainReceipt.id, 'preview'); evidence(d); assert.equal(Number(d.readyCount), 1);
    assert.deepEqual(await one('SELECT (SELECT COUNT(*) FROM ap_invoices) invoices,(SELECT COUNT(*) FROM gl_entries) entries'), before);
  });
  await test('CHAIN-AP-GENERATE', '采购到财务', '收货生成应付1130及进项130的平衡凭证', async () => {
    const d = await batch('purchase_receipt', ctx.chainReceipt.id); evidence(d); assert.equal(Number(d.successCount), 1); assert.equal(Number(d.failedCount), 0);
    ctx.chainAp = await invoice('ap', 'purchase_receipt', ctx.chainReceipt.id);
    equalMoney(ctx.chainAp.total_amount, 1130); equalMoney(ctx.chainAp.tax_amount, 130); await invoiceGl(ctx.chainAp);
  });
  await test('CHAIN-AP-RETRY', '采购到财务', '重复生成跳过且不新增应付', async () => {
    const d = await batch('purchase_receipt', ctx.chainReceipt.id); assert.equal(Number(d.skippedCount), 1); assert.equal(Number(d.successCount), 0);
    assert.equal(Number((await one("SELECT COUNT(*) n FROM ap_invoices WHERE source_type='purchase_receipt' AND source_id=?", [ctx.chainReceipt.id])).n), 1);
  });
  await test('CHAIN-AP-PAY', '采购到财务', '支付采购货款并核对业财闭环', async () => {
    const inv = need(ctx.chainAp, '采购应付'); const before = await bankBalance(ctx.bankIds[0]);
    http(await call('post', '/api/finance/ap/payments', { invoiceId: inv.id, amount: 1130, paymentDate: today, paymentMethod: '银行转账', bankAccountId: ctx.bankIds[0], notes: prefix }), [200, 201]);
    equalMoney(await bankBalance(ctx.bankIds[0]), before - 1130); equalMoney((await invoice('ap', 'purchase_receipt', ctx.chainReceipt.id)).balance_amount, 0);
    evidence(http(await call('get', `/api/finance/integration/document-status/purchase-receipt/${ctx.chainReceipt.id}`)));
  });
  await test('CHAIN-SO-OUTBOUND', '销售到财务', '销售6件、单价200并完成出库业务审批', async () => {
    ctx.chainSo = http(await call('post', '/api/sales/orders', { customerId: ctx.customerId, deliveryDate: today, status: 'draft', taxRate: 0.13, remarks: prefix,
      items: [{ materialId: ctx.materialId, quantity: 6, unitPrice: 200, taxRate: 0.13 }] }), 201);
    ctx.chainOutbound = http(await call('post', '/api/sales/outbound', { orderId: ctx.chainSo.id, deliveryDate: today, remarks: prefix,
      items: [{ productId: ctx.materialId, quantity: 6, price: 200, sourceOrderId: ctx.chainSo.id, sourceOrderNo: ctx.chainSo.orderNo }] }), 201);
    http(await call('put', `/api/sales/outbound/${ctx.chainOutbound.id}`, { status: 'processing' }));
    http(await call('put', `/api/sales/outbound/${ctx.chainOutbound.id}`, { status: 'completed' }));
    const d = await batch('sales_outbound', ctx.chainOutbound.id); assert.equal(Number(d.successCount), 0); assert.equal(Number(d.failedCount), 1);
  });
  await test('CHAIN-OUTBOUND-APPROVE', '销售到财务', '出库财审核对数量成本及库存余量', async () => {
    await posting(need(ctx.chainOutbound, '出库单').outboundNo);
    const ledger = await one('SELECT SUM(quantity) quantity,SUM(total_value) amount FROM inventory_ledger WHERE reference_no=?', [ctx.chainOutbound.outboundNo]);
    evidence(ledger); equalMoney(ledger.quantity, -6); equalMoney(ledger.amount, 600); equalMoney(await stock(), 4);
  });
  await test('CHAIN-AR-PREVIEW', '销售到财务', '销售凭证预览不落账', async () => {
    const before = await one('SELECT (SELECT COUNT(*) FROM ar_invoices) invoices,(SELECT COUNT(*) FROM gl_entries) entries');
    const d = await batch('sales_outbound', ctx.chainOutbound.id, 'preview'); evidence(d); assert.equal(Number(d.readyCount), 1);
    assert.deepEqual(await one('SELECT (SELECT COUNT(*) FROM ar_invoices) invoices,(SELECT COUNT(*) FROM gl_entries) entries'), before);
  });
  await test('CHAIN-AR-GENERATE', '销售到财务', '出库生成应收1356及销项税156', async () => {
    const d = await batch('sales_outbound', ctx.chainOutbound.id); evidence(d); assert.equal(Number(d.successCount), 1); assert.equal(Number(d.failedCount), 0);
    ctx.chainAr = await invoice('ar', 'sales_outbound', ctx.chainOutbound.id);
    equalMoney(ctx.chainAr.total_amount, 1356); equalMoney(ctx.chainAr.tax_amount, 156); await invoiceGl(ctx.chainAr);
  });
  await test('CHAIN-AR-RETRY', '销售到财务', '重复生成不重计应收、收入和销项税', async () => {
    const d = await batch('sales_outbound', ctx.chainOutbound.id); assert.equal(Number(d.skippedCount), 1); assert.equal(Number(d.successCount), 0);
    assert.equal(Number((await one("SELECT COUNT(*) n FROM ar_invoices WHERE source_type='sales_outbound' AND source_id=?", [ctx.chainOutbound.id])).n), 1);
  });
  await test('CHAIN-AR-RECEIVE', '销售到财务', '销售收款1356并核对业财闭环', async () => {
    const inv = need(ctx.chainAr, '销售应收'); const before = await bankBalance(ctx.bankIds[0]);
    http(await call('post', '/api/finance/ar/receipts', { invoiceId: inv.id, amount: 1356, receiptDate: today, paymentMethod: '银行转账', bankAccountId: ctx.bankIds[0], notes: prefix }), [200, 201]);
    equalMoney(await bankBalance(ctx.bankIds[0]), before + 1356); equalMoney((await invoice('ar', 'sales_outbound', ctx.chainOutbound.id)).balance_amount, 0);
    evidence(http(await call('get', `/api/finance/integration/document-status/sales-outbound/${ctx.chainOutbound.id}`)));
  });
  await test('CHAIN-SALES-RETURN', '退货财务', '销售退货财审后生成红字应收并保留价税', async () => {
    ctx.chainSalesReturn = http(await call('post', '/api/sales/returns', { orderId: ctx.chainSo.id, outboundId: ctx.chainOutbound.id, returnDate: today, returnReason: '隔离财务测试退货', remarks: prefix,
      items: [{ productId: ctx.materialId, quantity: 1, reason: prefix }] }), 201);
    const returned = ctx.chainSalesReturn;
    http(await call('put', `/api/sales/returns/${returned.id}/status`, { status: 'approved' }));
    http(await call('put', `/api/sales/returns/${returned.id}/status`, { status: 'completed' }));
    reject(await call('post', `/api/finance/integration/ar-credit-note-from-return/${returned.id}`, {}, finance.api));
    await posting(returned.returnNo);
    http(await call('post', `/api/finance/integration/ar-credit-note-from-return/${returned.id}`, {}, finance.api));
    ctx.arCredit = await invoice('ar', 'sales_return', returned.id); equalMoney(ctx.arCredit.total_amount, -226); equalMoney(ctx.arCredit.tax_amount, -26);
    await invoiceGl(ctx.arCredit); equalMoney(await stock(), 5);
    http(await call('post', `/api/finance/integration/ar-credit-note-from-return/${returned.id}`, {}, finance.api));
    assert.equal(Number((await one("SELECT COUNT(*) n FROM ar_invoices WHERE source_type='sales_return' AND source_id=?", [returned.id])).n), 1);
  });
  await test('CHAIN-PURCHASE-RETURN', '退货财务', '采购退货财审及自动红字应付只生成一次', async () => {
    const config = require('../../src/services/system/SystemConfigService'); const original = await config.get('auto_generate_ap_credit_note', false);
    try {
      assert.equal(await config.set('auto_generate_ap_credit_note', true, 'boolean'), true);
      ctx.chainPurchaseReturn = http(await call('post', '/api/purchase/returns', { receiptId: ctx.chainReceipt.id, returnDate: today, reason: prefix, remarks: prefix,
        items: [{ receiptItemId: ctx.chainReceipt.items[0].id, returnQuantity: 1 }] }), 201);
      const returned = ctx.chainPurchaseReturn;
      http(await call('put', `/api/purchase/returns/${returned.id}/status`, { newStatus: 'confirmed' }));
      http(await call('put', `/api/purchase/returns/${returned.id}/status`, { newStatus: 'completed' }));
      assert.equal(Number((await one("SELECT COUNT(*) n FROM ap_invoices WHERE source_type='purchase_return' AND source_id=?", [returned.id])).n), 0);
      await posting(returned.returnNo);
      await eventually(() => one("SELECT id FROM ap_invoices WHERE source_type='purchase_return' AND source_id=?", [returned.id]), Boolean, '自动红字应付');
      ctx.apCredit = await invoice('ap', 'purchase_return', returned.id); equalMoney(ctx.apCredit.total_amount, -113); equalMoney(ctx.apCredit.tax_amount, -13); await invoiceGl(ctx.apCredit);
      equalMoney(await stock(), 4);
    } finally { await config.set('auto_generate_ap_credit_note', original, 'boolean'); }
  });
  await test('MATCH-SPLIT-FIXTURE', '三单匹配', '同物料两价采购明细测试样本', async () => {
    ctx.splitPo = await approveOrder(http(await call('post', '/api/purchase/orders', poBody([
      { materialId: ctx.materialId, quantity: 2, price: 100, taxRate: 0.13 },
      { materialId: ctx.materialId, quantity: 3, price: 120, taxRate: 0.13 },
    ])), 201));
    const items = ctx.splitPo.items.map((item, index) => ({ materialId: ctx.materialId, orderItemId: item.id, unitId: ctx.unitId,
      orderedQuantity: Number(item.quantity), receivedQuantity: Number(item.quantity), qualifiedQuantity: Number(item.quantity), price: Number(item.price), taxRate: 0.13, batchNumber: `${prefix}-SPLIT-${index}` }));
    ctx.splitReceipt = http(await call('post', '/api/purchase/receipts', { orderId: ctx.splitPo.id, supplierId: ctx.supplierId, warehouseId: ctx.locationId, receiptDate: today, receiver: prefix, remarks: prefix, items }, undefined, { 'Idempotency-Key': crypto.randomUUID() }), 201);
  });
  await test('MATCH-SPLIT-LINES', '三单匹配', '同物料不同价格按订单明细匹配且金额不倍增', async () => {
    ctx.splitMatch = http(await call('post', `/api/finance/integration/three-way-match/from-receipt/${need(ctx.splitReceipt, '拆行收货单').id}`, { remark: prefix }));
    evidence(ctx.splitMatch); assert.equal(ctx.splitMatch.items.length, 2, '两条收货明细应匹配两条订单明细');
    equalMoney(ctx.splitMatch.poAmount, 560); equalMoney(ctx.splitMatch.receiptAmount, 560); equalMoney(ctx.splitMatch.invoiceAmount, 560);
    assert.deepEqual(ctx.splitMatch.items.map(i => Number(i.poPrice)), [100, 120]);
  });
  await test('MATCH-SPLIT-CLEANUP', '三单匹配', '取消拆行匹配测试草稿及未入库单据', async () => {
    if (ctx.splitMatch) http(await call('post', `/api/finance/integration/three-way-match/${ctx.splitMatch.id}/cancel`, { reason: prefix }));
    http(await call('put', `/api/purchase/receipts/${need(ctx.splitReceipt, '拆行收货').id}/status`, { status: 'cancelled' }));
    http(await call('put', `/api/purchase/orders/${ctx.splitPo.id}/status`, { newStatus: 'cancelled' }));
  });
};
