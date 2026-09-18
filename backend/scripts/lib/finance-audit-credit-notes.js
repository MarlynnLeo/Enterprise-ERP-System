'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

module.exports = async function ({ test, call, http, reject, one, rows, ctx, today, prefix, finance, bankBalance, equalMoney, assertEntry }) {
  for (const kind of ['ar', 'ap']) {
    const tag = `CREDIT-${kind.toUpperCase()}`;
    const source = kind === 'ar' ? 'sales_return' : 'purchase_return';
    const collection = kind === 'ar' ? 'receipts' : 'payments';
    const recordTable = `${kind}_${collection}`;
    const numberField = kind === 'ar' ? 'receipt_number' : 'payment_number';
    const credit = await one(`SELECT * FROM ${kind}_invoices WHERE source_type = ? ORDER BY id LIMIT 1`, [source]);
    assert.ok(credit, `${source} 红字发票前置数据缺失`);
    const magnitude = Math.abs(Number(credit.total_amount));
    const refund = { invoiceId: credit.id, refundDate: today, amount: 25, bankAccountId: ctx.bankIds[0], requestId: crypto.randomUUID() };
    await test(`${tag}-INVALID`, '退款', '普通收付款不能处理红字，退款拒绝零、负数、超额及非法日期', async () => {
      const before = await bankBalance(ctx.bankIds[0]);
      for (const change of [{amount:0}, {amount:-1}, {amount:magnitude+0.01}, {refundDate:'2026-02-30'}, {bankAccountId:null}]) reject(await call('post', `/api/finance/${kind}/refunds`, {...refund,...change}, finance.api));
      reject(await call('post', `/api/finance/${kind}/${collection}`, { invoiceId: credit.id, amount: 25, [kind === 'ar' ? 'receiptDate' : 'paymentDate']: today, paymentMethod: '银行转账', bankAccountId: ctx.bankIds[0] }, finance.api));
      reject(await call('post', `/api/finance/${kind}/refunds`, { ...refund, invoiceId: ctx[kind].id }, finance.api));
      if (kind === 'ar') reject(await call('post', '/api/finance/ar/refunds', { ...refund, bankAccountId: ctx.bankIds[2] }, finance.api));
      equalMoney(await bankBalance(ctx.bankIds[0]), before);
    });
    await test(`${tag}-PARTIAL`, '退款', '部分退款更新红字余额、反向银行流水和平衡凭证', async () => {
      const before = await bankBalance(ctx.bankIds[0]);
      const result = http(await call('post', `/api/finance/${kind}/refunds`, refund, finance.api),201);
      ctx[`${kind}CreditRefund`] = { ...refund, id:result.id };
      const updated = await one(`SELECT * FROM ${kind}_invoices WHERE id = ?`, [credit.id]);
      equalMoney(updated.paid_amount,-25); equalMoney(updated.balance_amount,-magnitude+25); assert.equal(updated.status,'部分付款');
      equalMoney(await bankBalance(ctx.bankIds[0]),before+(kind==='ar'?-25:25));
      const record = await one(`SELECT * FROM ${recordTable} WHERE id = ?`,[result.id]);
      const movement = await one('SELECT * FROM bank_transactions WHERE transaction_number = ?',[record[numberField]]);
      assert.equal(movement.transaction_type,kind==='ar'?'转出':'转入'); equalMoney(movement.amount,25); await assertEntry(movement.gl_entry_id,25);
    });
    await test(`${tag}-RETRY`, '退款', '相同请求重复提交不重复退款，修改请求内容被拒绝', async () => {
      const saved = ctx[`${kind}CreditRefund`];
      const before = await bankBalance(ctx.bankIds[0]);
      const response=http(await call('post', `/api/finance/${kind}/refunds`, saved, finance.api)); assert.equal(response.id,saved.id); assert.equal(response.replayed,true);
      reject(await call('post', `/api/finance/${kind}/refunds`, {...saved,amount:26}, finance.api)); equalMoney(await bankBalance(ctx.bankIds[0]),before);
    });
    await test(`${tag}-VOID`, '退款', '作废退款恢复红字余额和银行余额，禁止重复作废及重放旧请求', async () => {
      const saved=ctx[`${kind}CreditRefund`]; const before=await bankBalance(ctx.bankIds[0]);
      http(await call('post',`/api/finance/${kind}/${collection}/${saved.id}/void`,{voidReason:`${prefix} 退款回归`},finance.api));
      equalMoney(await bankBalance(ctx.bankIds[0]),before+(kind==='ar'?25:-25));
      const invoice=await one(`SELECT * FROM ${kind}_invoices WHERE id=?`,[credit.id]);equalMoney(invoice.balance_amount,-magnitude);equalMoney(invoice.paid_amount,0);
      reject(await call('post',`/api/finance/${kind}/${collection}/${saved.id}/void`,{voidReason:prefix},finance.api));
      reject(await call('post',`/api/finance/${kind}/refunds`,saved,finance.api));
    });
    await test(`${tag}-CONCURRENT-FULL`, '退款', '并发全额退款仅成功一次，结清后作废恢复全部余额', async () => {
      const before = await bankBalance(ctx.bankIds[0]);
      const results = await Promise.all([0, 1].map(() => call('post', `/api/finance/${kind}/refunds`, { ...refund, amount: magnitude, requestId: crypto.randomUUID() }, finance.api)));
      assert.equal(results.filter(result => result.status === 201).length, 1);
      for (const result of results) http(result, [201, 400, 409]);
      const settled = await one(`SELECT * FROM ${kind}_invoices WHERE id = ?`, [credit.id]);
      assert.equal(settled.status, '已付款'); equalMoney(settled.balance_amount, 0);
      equalMoney(await bankBalance(ctx.bankIds[0]), before + (kind === 'ar' ? -magnitude : magnitude));
      const saved = http(results.find(result => result.status === 201), 201);
      http(await call('post', `/api/finance/${kind}/${collection}/${saved.id}/void`, { voidReason: `${prefix} 并发退款回归` }, finance.api));
      equalMoney(await bankBalance(ctx.bankIds[0]), before);
      equalMoney((await one(`SELECT balance_amount FROM ${kind}_invoices WHERE id = ?`, [credit.id])).balance_amount, -magnitude);
    });
    const red = { kind, invoiceId: credit.id, invoiceDate: today, invoiceNumber: `${prefix}-${kind}-RED-${crypto.randomBytes(4).toString('hex')}` };
    await test(`${tag}-TAX-CREATE`, '红字税务', '原税票候选仅包含对应来源，红字票从业务单据取价税', async () => {
      const originals=http(await call('get',`/api/finance/tax/red-letter-originals?kind=${kind}&invoiceId=${credit.id}`,undefined,finance.api));
      assert.equal(originals.length,1);red.originalTaxInvoiceId=originals[0].id;
      const result=http(await call('post','/api/finance/tax/red-letter-invoices',red,finance.api),201);
      ctx[`${kind}RedLetter`] = {...red,id:result.id};
      const stored=await one('SELECT * FROM tax_invoices WHERE id=?',[result.id]);equalMoney(stored.total_amount,credit.total_amount);equalMoney(stored.tax_amount,credit.tax_amount);
      const replay=http(await call('post','/api/finance/tax/red-letter-invoices',red,finance.api));assert.equal(replay.id,result.id);
      reject(await call('post', `/api/finance/tax/invoices/${result.id}/link`, { documentType: `${kind}_invoice`, documentId: ctx[kind].id }, finance.api));
      reject(await call('post', `/api/finance/tax/invoices/${result.id}/unlink`, {}, finance.api));
      const unchanged = await one('SELECT related_document_id, original_tax_invoice_id FROM tax_invoices WHERE id = ?', [result.id]);
      assert.equal(Number(unchanged.related_document_id), Number(credit.id));
      assert.equal(Number(unchanged.original_tax_invoice_id), Number(red.originalTaxInvoiceId));
    });
    await test(`${tag}-TAX-CERTIFY`, '红字税务', '认证红字票复用原退货凭证；进项红字可抵扣调整', async () => {
      const saved=ctx[`${kind}RedLetter`];const before=(await one('SELECT COUNT(*) n FROM gl_entries')).n;
      http(await call('post',`/api/finance/tax/invoices/${saved.id}/certify`,{certificationDate:today},finance.api));
      if(kind==='ap')http(await call('post',`/api/finance/tax/invoices/${saved.id}/deduct`,{deductionDate:today},finance.api));
      const invoice=await one('SELECT * FROM tax_invoices WHERE id=?',[saved.id]);assert.ok(invoice.gl_entry_id);await assertEntry(invoice.gl_entry_id,magnitude);
      assert.equal((await one('SELECT COUNT(*) n FROM gl_entries')).n,before);
      reject(await call('post',`/api/finance/tax/invoices/${saved.originalTaxInvoiceId}/void`,{},finance.api));
    });
    await test(`${tag}-TAX-VOID-REISSUE`, '红字税务', '红字税票作废及重开保留业务凭证且避免重复冲税', async () => {
      const saved=ctx[`${kind}RedLetter`];const original=await one('SELECT gl_entry_id FROM tax_invoices WHERE id=?',[saved.id]);
      http(await call('post',`/api/finance/tax/invoices/${saved.id}/void`,{},finance.api));
      assert.equal(Number((await one('SELECT is_reversed FROM gl_entries WHERE id=?',[original.gl_entry_id])).is_reversed),0);
      const reissued=http(await call('post','/api/finance/tax/red-letter-invoices',{...saved,invoiceNumber:`${saved.invoiceNumber}-R`},finance.api),201);
      http(await call('post',`/api/finance/tax/invoices/${reissued.id}/void`,{},finance.api));
    });
  }
  await test('CREDIT-AP-VOID-BALANCE', '退款', '已收供应商退款被使用后禁止作废，资金恢复后可作废', async () => {
    const bankId = ctx.bankIds[2];
    equalMoney(await bankBalance(bankId), 0);
    const ar = await one("SELECT id FROM ar_invoices WHERE source_type = 'sales_return' ORDER BY id LIMIT 1");
    const ap = await one("SELECT id FROM ap_invoices WHERE source_type = 'purchase_return' ORDER BY id LIMIT 1");
    const payment = http(await call('post', '/api/finance/ap/refunds', { invoiceId: ap.id, refundDate: today, amount: 25, bankAccountId: bankId, requestId: crypto.randomUUID() }, finance.api), 201);
    const receipt = http(await call('post', '/api/finance/ar/refunds', { invoiceId: ar.id, refundDate: today, amount: 25, bankAccountId: bankId, requestId: crypto.randomUUID() }, finance.api), 201);
    equalMoney(await bankBalance(bankId), 0);
    reject(await call('post', `/api/finance/ap/payments/${payment.id}/void`, { voidReason: prefix }, finance.api));
    equalMoney((await one('SELECT paid_amount FROM ap_invoices WHERE id = ?', [ap.id])).paid_amount, -25);
    assert.notEqual((await one('SELECT status FROM ap_payments WHERE id = ?', [payment.id])).status, 'void');
    http(await call('post', `/api/finance/ar/receipts/${receipt.id}/void`, { voidReason: prefix }, finance.api));
    http(await call('post', `/api/finance/ap/payments/${payment.id}/void`, { voidReason: prefix }, finance.api));
    equalMoney(await bankBalance(bankId), 0);
  });
  await test('CREDIT-INTEGRITY','退款与税务核对','退款作废后红字余额恢复，银行与凭证一致性无异常',async()=>{
    const { consistencyRules } = require('../../src/services/business/DataConsistencyRules');
    const rules = consistencyRules.filter(rule => /^(gl|finance)\./.test(rule.id));
    assert.equal(rules.length, 14, '预期核对全部14项账务规则');
    for(const rule of rules){
      assert.ok(rule.sql, `${rule.id} 缺少核对SQL`);
      const findings=await rows(rule.sql);assert.equal(findings.length,0,rule.id);
    }
  });
};
