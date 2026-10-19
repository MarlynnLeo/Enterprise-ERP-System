'use strict';

// Positive transitions use real Vue controls. SQL is read-only evidence; HTTP
// mutations below are explicitly labelled duplicate/overpayment rejection checks.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const dataOf = body => body?.data?.data ?? body?.data ?? body;
const dialog = page => page.locator('.el-dialog:visible').last();
const dataRow = (page, value) => page.locator('.el-table__body-wrapper tr.el-table__row:visible')
  .filter({ hasText: String(value) }).first();
const cents = amount => Math.round(Number(amount || 0) * 100);

async function query(ctx, sql, args = []) {
  const [rows] = await ctx.db.query(sql, args);
  return rows;
}

async function snapshot(ctx, name) {
  if (!ctx.evidenceDir) return;
  await fs.mkdir(ctx.evidenceDir, { recursive: true });
  const stem = path.join(ctx.evidenceDir, `finance-${name.replace(/[^a-zA-Z0-9_-]/g, '-')}`);
  await fs.writeFile(`${stem}.aria.txt`, await ctx.page.locator('body').ariaSnapshot());
  await ctx.page.screenshot({ path: `${stem}.png`, fullPage: true });
}

async function action(ctx, method, pathname, click) {
  const pending = ctx.page.waitForResponse(response =>
    response.request().method() === method && new URL(response.url()).pathname === pathname,
  { timeout: 45000 });
  pending.catch(() => {});
  await click();
  const response = await pending;
  const body = await response.json();
  assert.ok(response.ok() && body.success !== false,
    `${method} ${pathname}: HTTP ${response.status()} ${JSON.stringify(body).slice(0, 2000)}`);
  ctx.record?.(`HTTP ${method} ${pathname}`, { status: response.status(), triggeredBy: 'UI button' });
  return dataOf(body);
}

async function confirmMessage(ctx, name = /^(确定|确认)$/) {
  const box = ctx.page.locator('.el-message-box:visible').last();
  await box.waitFor();
  await box.getByRole('button', { name }).click();
}

async function search(ctx, placeholder, value) {
  if (['入库单号', '出库单号'].includes(placeholder))
    await ctx.page.getByRole('button', { name: '高级筛选', exact: true }).click();
  const input = ctx.page.getByPlaceholder(placeholder, { exact: true });
  await input.fill(String(value));
  await ctx.page.getByRole('button', { name: /^(查询|搜索)$/ }).first().click();
  await dataRow(ctx.page, value).waitFor({ state: 'visible', timeout: 30000 });
}

/** Approval is embedded in each source document's detail panel. */
async function approveInventoryPosting(ctx, sourceNo) {
  const [posting] = await query(ctx,
    `SELECT id, source_type, source_id, source_no, finance_status, business_approved_by_id
     FROM inventory_posting_documents WHERE source_no = ? AND posting_kind = 'movement'
     ORDER BY id DESC LIMIT 1`, [sourceNo]);
  assert.ok(posting, `No staged inventory posting for ${sourceNo}`);
  if (posting.finance_status === 'approved') {
    ctx.record?.(`Inventory already approved: ${sourceNo}`, { postingId: posting.id, source: 'readback' });
    return posting;
  }
  assert.equal(posting.finance_status, 'pending', `${sourceNo} must be pending before approval`);
  const routes = {
    purchase_receipt: ['/purchase/receipts', '请输入收货单号'],
    sales_outbound: ['/sales/outbound', null],
    inbound: ['/inventory/inbound', '入库单号'],
    outbound: ['/inventory/outbound', '出库单号'],
    production_inbound: ['/inventory/inbound', '入库单号'],
    purchase_inbound: ['/purchase/receipts', '请输入收货单号'],
  };
  const route = routes[posting.source_type];
  assert.ok(route, `No UI approval mapping for source type ${posting.source_type}`);
  await ctx.asActor('finance');
  assert.notEqual(Number(ctx.actors.finance.id), Number(posting.business_approved_by_id), 'Independent inventory reviewer');
  await ctx.page.goto(`${ctx.baseUrl}${route[0]}`);
  if (route[1]) await search(ctx, route[1], sourceNo);
  else await dataRow(ctx.page, sourceNo).waitFor({ state: 'visible', timeout: 30000 });
  await dataRow(ctx.page, sourceNo).getByText(sourceNo, { exact: true }).first().click();
  const panel = dialog(ctx.page).locator('.inventory-approval-panel');
  await panel.getByRole('button', { name: '财务审核', exact: true }).waitFor();
  await snapshot(ctx, `inventory-${posting.id}-before`);
  await action(ctx, 'POST', `/api/finance/inventory-postings/${posting.id}/approve`, async () => {
    await panel.getByRole('button', { name: '财务审核', exact: true }).click();
    await confirmMessage(ctx);
  });
  const [approved] = await query(ctx,
    'SELECT * FROM inventory_posting_documents WHERE id = ?', [posting.id]);
  assert.equal(approved.finance_status, 'approved');
  assert.equal(Number(approved.finance_approved_by), Number(ctx.actors.finance.id));
  const [ledgerCount] = await query(ctx,
    'SELECT COUNT(*) AS count FROM inventory_ledger WHERE posting_document_id = ?', [posting.id]);
  assert.ok(Number(ledgerCount.count) > 0, 'Inventory approval must persist ledger lines');
  ctx.record?.(`库存财务审核 ${sourceNo}`, { postingId: posting.id, ledgerLines: Number(ledgerCount.count) });
  await snapshot(ctx, `inventory-${posting.id}-approved`);
  return approved;
}

async function createMatch(ctx, receipt) {
  let matches = await query(ctx,
    "SELECT * FROM ap_match_headers WHERE purchase_receipt_id = ? AND status <> 'cancelled' ORDER BY id", [receipt.id]);
  assert.ok(matches.length <= 1, `Receipt ${receipt.id} has multiple active three-way matches`);
  let match = matches[0];
  if (match?.status === 'confirmed') {
    await ctx.record?.('恢复已确认三单匹配', { receiptId: receipt.id, matchId: match.id, status: match.status, source: 'database' });
    return { id: match.id, number: match.match_no, receiptId: receipt.id };
  }
  if (match) assert.equal(match.status, 'matched', 'Existing three-way match needs review; do not create another or force a variance');
  await ctx.asActor('finance');
  await ctx.page.goto(`${ctx.baseUrl}/finance/ap/three-way-match`);
  if (!match) {
    await ctx.page.getByRole('button', { name: '从入库单创建', exact: true }).click();
    const d = dialog(ctx.page);
    await d.getByRole('combobox', { name: /入库单/ }).fill(receipt.receipt_no);
    await ctx.page.getByRole('option').filter({ hasText: receipt.receipt_no }).first().click();
    await d.getByPlaceholder('可选，便于对账').fill(`CHAIN-${receipt.receipt_no}`);
    await snapshot(ctx, `match-${receipt.id}-create`);
    await action(ctx, 'POST', `/api/finance/integration/three-way-match/from-receipt/${receipt.id}`,
      () => d.getByRole('button', { name: '创建', exact: true }).click());
    matches = await query(ctx,
      "SELECT * FROM ap_match_headers WHERE purchase_receipt_id = ? AND status <> 'cancelled' ORDER BY id", [receipt.id]);
    assert.equal(matches.length, 1, 'Creating a match must persist exactly one active receipt match');
    [match] = matches;
  } else {
    await ctx.record?.('恢复待确认三单匹配', { receiptId: receipt.id, matchId: match.id, status: match.status, source: 'database' });
  }
  assert.ok(match, 'Three-way match must persist');
  assert.equal(match.status, 'matched', 'Fixture PO and actual receipt quantities/prices must match without forced variance');
  await dataRow(ctx.page, match.match_no).waitFor();
  await snapshot(ctx, `match-${match.id}-matched`);
  await action(ctx, 'POST', `/api/finance/integration/three-way-match/${match.id}/confirm`, async () => {
    await dataRow(ctx.page, match.match_no).getByRole('button', { name: '确认匹配', exact: true }).click();
    await confirmMessage(ctx);
  });
  const [confirmed] = await query(ctx, 'SELECT status FROM ap_match_headers WHERE id = ?', [match.id]);
  assert.equal(confirmed.status, 'confirmed');
  return { id: match.id, number: match.match_no, receiptId: receipt.id };
}

async function generateVouchers(ctx, type, sources) {
  if (!sources.length) return;
  await ctx.asActor('finance');
  const side = type === 'purchase_receipt' ? 'ap' : 'ar';
  const ids = sources.map(row => row.id);
  const existing = await query(ctx,
    `SELECT id, invoice_number, source_id FROM ${side}_invoices
     WHERE source_type = ? AND source_id IN (${ids.map(() => '?').join(',')})
       AND status NOT IN ('已取消', '已作废')`, [type, ...ids]);
  const remaining = sources.filter(source => !existing.some(inv => Number(inv.source_id) === Number(source.id)));
  if (!remaining.length) {
    await ctx.record?.(`${side.toUpperCase()} 已有来源发票`, { sourceIds: ids, invoiceIds: existing.map(row => row.id), source: 'database' });
    return;
  }
  await ctx.page.goto(`${ctx.baseUrl}/finance/gl/entries`);
  await ctx.page.getByRole('button', { name: '录入凭证', exact: true }).click();
  const d = dialog(ctx.page);
  const sourceLabel = type === 'purchase_receipt' ? '采购入库单' : '销售出库单';
  await d.locator('label.el-radio-button').filter({ hasText: sourceLabel }).click();
  assert.equal(await d.getByRole('radio', { name: sourceLabel, exact: true }).isChecked(), true);
  for (const source of remaining) {
    const no = source.receipt_no || source.outbound_no;
    const placeholder = type === 'purchase_receipt' ? '入库单号 / 采购订单号 / 供应商' : '出库单号 / 销售订单号 / 客户';
    await d.getByPlaceholder(placeholder).fill(no);
    await d.getByRole('button', { name: '查询', exact: true }).click();
    const row = dataRow(d, no);
    await row.waitFor();
    if (!(await row.getByRole('checkbox').isChecked())) await row.locator('label.el-checkbox').click();
    assert.equal(await row.getByRole('checkbox').isChecked(), true, 'Source row must be selected through its visible checkbox');
  }
  await snapshot(ctx, `${side}-sources-selected`);
  await action(ctx, 'POST', '/api/finance/integration/batch-preview',
    () => d.getByRole('button', { name: /预览凭证/ }).click());
  const preview = dialog(ctx.page);
  await snapshot(ctx, `${side}-voucher-preview`);
  const result = await action(ctx, 'POST', '/api/finance/integration/batch-generate', async () => {
    await preview.getByRole('button', { name: /确认生成/ }).click();
    await confirmMessage(ctx, '确认生成');
  });
  assert.equal(Number(result.failedCount || 0), 0, `${side} batch generation failures`);
  assert.equal(Number(result.successCount), remaining.length, 'One invoice per source document');
  ctx.record?.(`${side.toUpperCase()} 发票与凭证生成`, result);
  await snapshot(ctx, `${side}-voucher-generated`);
}

async function invoiceRows(ctx, side, ids) {
  if (!ids.length) return [];
  return query(ctx,
    `SELECT * FROM ${side}_invoices WHERE source_type = ?
     AND source_id IN (${ids.map(() => '?').join(',')}) AND status NOT IN ('已取消','已作废') ORDER BY id`,
    [side === 'ap' ? 'purchase_receipt' : 'sales_outbound', ...ids]);
}

async function ensureSalesCostVouchers(ctx, outbounds) {
  const verified = [];
  for (const outbound of outbounds) {
    let entries = await query(ctx,
      "SELECT id, entry_number, is_posted FROM gl_entries WHERE document_type = 'sales_outbound' AND document_number = ? AND COALESCE(is_reversed,0) = 0", [outbound.outbound_no]);
    if (!entries.length) {
      const invoicesBefore = await invoiceRows(ctx, 'ar', [outbound.id]);
      const taxesBefore = await query(ctx,
        "SELECT id FROM tax_invoices WHERE related_document_type = 'sales_outbound' AND related_document_id = ? AND status <> '已作废' ORDER BY id", [outbound.id]);
      await ctx.asActor('finance');
      await ctx.page.goto(`${ctx.baseUrl}/finance/settings?tab=automation`);
      const panel = ctx.page.locator('.repair-panel');
      await panel.waitFor({ state: 'visible' });
      await panel.getByText('采购入库单 -> 应付发票/凭证（主路径）', { exact: true }).click();
      await ctx.page.getByRole('option', { name: '销售出库单 -> 应收发票/凭证（主路径）', exact: true }).click();
      await panel.getByPlaceholder('输入来源单据ID').fill(String(outbound.id));
      await panel.getByPlaceholder('输入来源单据ID').press('Tab');
      await snapshot(ctx, `sales-cost-${outbound.id}-repair-form`);
      await action(ctx, 'POST', `/api/finance/integration/ar-invoice-from-outbound/${outbound.id}`,
        () => panel.getByRole('button', { name: '补生成', exact: true }).click());
      const invoicesAfter = await invoiceRows(ctx, 'ar', [outbound.id]);
      assert.deepEqual(invoicesAfter, invoicesBefore, 'Cost completion must not duplicate or modify the already settled AR invoice');
      assert.deepEqual(await query(ctx,
        "SELECT id FROM tax_invoices WHERE related_document_type = 'sales_outbound' AND related_document_id = ? AND status <> '已作废' ORDER BY id", [outbound.id]), taxesBefore,
      'Cost completion must not duplicate the existing output tax invoice');
      entries = await query(ctx,
        "SELECT id, entry_number, is_posted FROM gl_entries WHERE document_type = 'sales_outbound' AND document_number = ? AND COALESCE(is_reversed,0) = 0", [outbound.outbound_no]);
    }
    assert.equal(entries.length, 1, 'Each delivered source needs exactly one active cost voucher');
    const [entry] = entries;
    assert.equal(Number(entry.is_posted), 1, 'Sales cost voucher must be posted');
    const [ledger] = await query(ctx,
      "SELECT COUNT(*) AS count, SUM(ABS(quantity) * unit_cost) AS amount FROM inventory_ledger WHERE reference_no = ? AND transaction_type = 'sales_outbound' AND quantity < 0", [outbound.outbound_no]);
    assert.ok(Number(ledger.count) > 0, 'Sales cost must have actual inventory ledger evidence');
    const [amounts] = await query(ctx,
      'SELECT SUM(debit_amount) AS debit, SUM(credit_amount) AS credit FROM gl_entry_items WHERE entry_id = ?', [entry.id]);
    assert.equal(cents(amounts.debit), cents(ledger.amount), 'Sales cost debit equals actual inventory valuation');
    assert.equal(cents(amounts.credit), cents(ledger.amount), 'Sales cost credit equals actual inventory valuation');
    const links = await query(ctx,
      "SELECT id FROM document_links WHERE source_type = 'sales_outbound' AND source_id = ? AND target_type = 'finance_voucher' AND target_id = ?", [outbound.id, entry.id]);
    assert.equal(links.length, 1, 'Sales cost voucher preserves the source document link');
    const detail = { outboundId: outbound.id, outboundNo: outbound.outbound_no, entryId: entry.id, entryNumber: entry.entry_number, amount: cents(ledger.amount) / 100 };
    verified.push(detail);
    await ctx.record?.('销售成本凭证及实际出库成本', detail);
  }
  return verified;
}

async function assertInvoiceAndGl(ctx, side, invoices, sources) {
  assert.equal(invoices.length, sources.length, 'Every source needs exactly one active invoice');
  for (const source of sources) {
    const invoice = invoices.find(row => Number(row.source_id) === Number(source.id));
    assert.ok(invoice, `Invoice missing for ${source.id}`);
    assert.equal(cents(side === 'ar' ? invoice.amount_excluding_tax : invoice.total_amount), cents(source.total_amount),
      side === 'ar' ? 'AR net amount must equal actual delivery line total' : 'AP gross amount must equal qualified receipt total');
    assert.equal(cents(invoice.total_amount), cents(invoice.amount_excluding_tax) + cents(invoice.tax_amount), 'Invoice tax split');
    const entries = await query(ctx,
      `SELECT DISTINCT e.* FROM gl_entries e JOIN document_links l
       ON l.target_type = 'finance_voucher' AND l.target_id = e.id
       WHERE l.source_type = ? AND l.source_id = ? AND COALESCE(e.is_reversed,0)=0`,
      [`${side}_invoice`, invoice.id]);
    assert.equal(entries.length, 1, 'Invoice must link to exactly one active recognition voucher');
    for (const entry of entries) {
      if (!entry.is_posted) await postVoucher(ctx, entry);
      const [amounts] = await query(ctx,
        'SELECT SUM(debit_amount) AS debit, SUM(credit_amount) AS credit FROM gl_entry_items WHERE entry_id = ?', [entry.id]);
      assert.equal(cents(amounts.debit), cents(amounts.credit), `Voucher ${entry.entry_number} balances`);
      assert.ok(cents(amounts.debit) > 0, 'Recognition voucher has positive value');
    }
    ctx.record?.(`${side.toUpperCase()}来源/金额/凭证 ${invoice.invoice_number}`,
      { invoiceId: invoice.id, sourceId: source.id, gross: Number(invoice.total_amount), net: Number(invoice.amount_excluding_tax),
        tax: Number(invoice.tax_amount), entryIds: entries.map(row => row.id) });
  }
}

async function postVoucher(ctx, entry) {
  await ctx.asActor('reviewer');
  assert.notEqual(Number(ctx.actors.reviewer.id), Number(entry.created_by), 'Voucher maker/poster segregation');
  await ctx.page.goto(`${ctx.baseUrl}/finance/gl/entries`);
  await search(ctx, '输入凭证编号', entry.entry_number);
  await snapshot(ctx, `voucher-${entry.id}-unposted`);
  await action(ctx, 'PATCH', `/api/finance/entries/${entry.id}/post`, async () => {
    await dataRow(ctx.page, entry.entry_number).getByRole('button', { name: '过账', exact: true }).click();
    await confirmMessage(ctx, '确认');
  });
  const [posted] = await query(ctx, 'SELECT is_posted, approved_by FROM gl_entries WHERE id = ?', [entry.id]);
  assert.equal(Number(posted.is_posted), 1);
  assert.equal(Number(posted.approved_by), Number(ctx.actors.reviewer.id));
}

async function settleInvoice(ctx, side, invoice, amount, suffix) {
  assert.ok(['ar', 'ap'].includes(side), 'Supported settlement side required');
  const [before] = await query(ctx, `SELECT status, balance_amount FROM ${side}_invoices WHERE id = ?`, [invoice.id]);
  assert.ok(before && cents(before.balance_amount) >= cents(amount) && cents(amount) > 0, 'Settlement amount must fit the latest remaining invoice balance');
  await ctx.asActor('finance');
  await ctx.page.goto(`${ctx.baseUrl}/finance/${side}/invoices`);
  await search(ctx, side === 'ar' ? '输入发票编号' : '系统编号', invoice.invoice_number);
  let row = dataRow(ctx.page, invoice.invoice_number);
  const [current] = await query(ctx, `SELECT status FROM ${side}_invoices WHERE id = ?`, [invoice.id]);
  if (current.status === '草稿') {
    await action(ctx, 'PUT', `/api/finance/${side}/invoices/${invoice.id}/status`, async () => {
      await row.getByRole('button', { name: '确认', exact: true }).click();
      await confirmMessage(ctx);
    });
    row = dataRow(ctx.page, invoice.invoice_number);
  }
  await row.getByRole('button', { name: side === 'ar' ? /^(收款|记录收款)$/ : /^(付款|记录付款)$/ }).click();
  const d = dialog(ctx.page);
  const amountItem = d.locator('.el-form-item').filter({ hasText: side === 'ar' ? '收款金额' : '付款金额' });
  await amountItem.getByRole('spinbutton').fill(String(amount));
  await amountItem.getByRole('spinbutton').press('Tab');
  const date = d.getByPlaceholder(side === 'ar' ? '选择收款日期' : '选择付款日期');
  await date.fill(ctx.fixture.today);
  await date.press('Tab');
  const accountItem = d.locator('.el-form-item').filter({ hasText: side === 'ar' ? '收款账户' : '银行账户' });
  await accountItem.locator('.el-select').click();
  await ctx.page.getByRole('option').filter({ hasText: ctx.fixture.finance.bank.accountName }).click();
  await d.getByPlaceholder('请输入备注信息').fill(`CHAIN ${suffix} ${invoice.invoice_number}`);
  await snapshot(ctx, `${side}-${invoice.id}-${suffix}-form`);
  const endpoint = `/api/finance/${side}/${side === 'ar' ? 'receipts' : 'payments'}`;
  const settlement = await action(ctx, 'POST', endpoint,
    () => d.getByRole('button', { name: '确认', exact: true }).click());
  const table = side === 'ar' ? 'ar_receipts' : 'ap_payments';
  const [saved] = await query(ctx, `SELECT * FROM ${table} WHERE id = ?`, [settlement.id]);
  assert.ok(saved, 'UI settlement persisted');
  const verified = await assertSettlement(ctx, side, invoice, saved, amount, suffix);
  await snapshot(ctx, `${side}-${invoice.id}-${suffix}-saved`);
  return verified;
}

async function assertSettlement(ctx, side, invoice, saved, amount, suffix) {
  // Existing installations use normal; the baseline schema uses approved.
  // Both are effective states. The linked posted voucher and bank row below are mandatory.
  assert.ok(['normal', 'approved'].includes(saved.status) && !saved.voided_at, 'Recovered settlement must be effective and not voided');
  assert.equal(saved.notes, `CHAIN ${suffix} ${invoice.invoice_number}`, 'Recovered settlement belongs to this exact test invoice and stage');
  assert.equal(Number(saved.bank_account_id), Number(ctx.fixture.finance.bank.id));
  assert.equal(cents(saved.total_amount), cents(amount));
  const itemTable = side === 'ar' ? 'ar_receipt_items' : 'ap_payment_items';
  const foreignKey = side === 'ar' ? 'receipt_id' : 'payment_id';
  const items = await query(ctx, `SELECT invoice_id, amount, discount_amount FROM ${itemTable} WHERE ${foreignKey} = ?`, [saved.id]);
  assert.equal(items.length, 1, 'Each test settlement must apply to exactly one invoice');
  assert.equal(Number(items[0].invoice_id), Number(invoice.id));
  assert.equal(cents(items[0].amount), cents(amount));
  assert.equal(cents(items[0].discount_amount), 0, 'This flow must not silently settle using a discount');
  const sourceType = side === 'ar' ? 'ar_receipt' : 'ap_payment';
  const links = await query(ctx, 'SELECT * FROM document_links WHERE source_type = ? AND source_id = ?', [sourceType, saved.id]);
  const bankLinks = links.filter(link => link.target_type === 'bank_transaction');
  const glLinks = links.filter(link => link.target_type === 'finance_voucher');
  assert.equal(bankLinks.length, 1, 'Settlement links exactly one bank transaction');
  assert.equal(glLinks.length, 1, 'Settlement links exactly one voucher');
  const [bankLink] = bankLinks, [glLink] = glLinks;
  const [bank] = await query(ctx, 'SELECT * FROM bank_transactions WHERE id = ?', [bankLink.target_id]);
  assert.ok(bank, 'Linked bank transaction must exist');
  assert.equal(cents(bank.amount), cents(amount));
  assert.equal(bank.transaction_type, side === 'ar' ? '转入' : '转出', 'Bank movement direction follows receipt/payment');
  assert.equal(Number(bank.bank_account_id), Number(ctx.fixture.finance.bank.id));
  assert.equal(Number(bank.gl_entry_id), Number(glLink.target_id));
  const [gl] = await query(ctx, 'SELECT is_posted, is_reversed FROM gl_entries WHERE id = ?', [glLink.target_id]);
  assert.ok(gl && !Number(gl.is_reversed), 'Settlement voucher must exist and remain unreversed');
  assert.equal(Number(gl.is_posted), 1, 'Settlement automatically posts its voucher');
  const [totals] = await query(ctx,
    'SELECT SUM(debit_amount) AS debit, SUM(credit_amount) AS credit FROM gl_entry_items WHERE entry_id = ?', [glLink.target_id]);
  assert.equal(cents(totals.debit), cents(amount), 'Settlement debit equals actual cash amount');
  assert.equal(cents(totals.credit), cents(amount), 'Settlement credit equals actual cash amount');
  return { side, id: saved.id, invoiceId: invoice.id, suffix, number: saved.receipt_number || saved.payment_number, amount, bankId: bank.id, glId: glLink.target_id };
}

async function settlementState(ctx, side, invoice) {
  assert.ok(['ar', 'ap'].includes(side));
  const [current] = await query(ctx, `SELECT * FROM ${side}_invoices WHERE id = ?`, [invoice.id]);
  assert.ok(current, 'Settlement invoice must still exist');
  assert.equal(cents(current.total_amount), cents(invoice.total_amount), 'Invoice total cannot change while resuming settlement');
  const table = side === 'ar' ? 'ar_receipts' : 'ap_payments';
  const items = side === 'ar' ? 'ar_receipt_items' : 'ap_payment_items';
  const foreignKey = side === 'ar' ? 'receipt_id' : 'payment_id';
  const saved = await query(ctx,
    `SELECT s.*, i.amount AS applied_amount, i.discount_amount FROM ${table} s
     JOIN ${items} i ON i.${foreignKey} = s.id
     WHERE i.invoice_id = ? AND COALESCE(s.status,'approved') <> 'void' ORDER BY s.id`, [invoice.id]);
  const paid = saved.reduce((total, row) => total + cents(row.applied_amount) + cents(row.discount_amount), 0);
  assert.equal(cents(current.paid_amount), paid, 'Persisted settlement rows must account for the full paid amount');
  assert.equal(cents(current.balance_amount), cents(current.total_amount) - paid, 'Remaining balance must match persisted settlements');
  return { current, saved };
}

async function settleInvoiceInStages(ctx, side, invoice, onProgress = async () => {}) {
  const total = cents(invoice.total_amount);
  assert.ok(total >= 2, 'Partial/final settlement scenario needs at least two cents');
  const partial = Math.floor(total / 2);
  const stages = [{ suffix: 'partial', amount: partial / 100 }, { suffix: 'final', amount: (total - partial) / 100 }];
  const initial = await settlementState(ctx, side, invoice);
  const expectedNotes = stages.map(stage => `CHAIN ${stage.suffix} ${invoice.invoice_number}`);
  assert.ok(initial.saved.every(row => expectedNotes.includes(row.notes)), 'Unexpected existing settlement: inspect before resuming this invoice');
  const settled = [];
  for (const stage of stages) {
    const state = await settlementState(ctx, side, invoice);
    const existing = state.saved.filter(row => row.notes === `CHAIN ${stage.suffix} ${invoice.invoice_number}`);
    assert.ok(existing.length <= 1, `Duplicate ${stage.suffix} settlements require investigation`);
    let verified;
    if (existing.length) {
      verified = await assertSettlement(ctx, side, invoice, existing[0], stage.amount, stage.suffix);
      await ctx.record?.(`恢复 ${side.toUpperCase()} ${stage.suffix} 核销`, { ...verified, source: 'database' });
    } else {
      const expectedPaid = stage.suffix === 'partial' ? 0 : partial;
      assert.equal(cents(state.current.paid_amount), expectedPaid, 'Previous stage must be completely persisted before continuing');
      verified = await settleInvoice(ctx, side, invoice, stage.amount, stage.suffix);
    }
    settled.push(verified);
    const after = await settlementState(ctx, side, invoice);
    if (stage.suffix === 'partial' && !after.saved.some(row => row.notes === expectedNotes[1])) {
      assert.equal(after.current.status, '部分付款');
      assert.equal(cents(after.current.paid_amount), partial);
      assert.equal(cents(after.current.balance_amount), total - partial);
    }
    if (stage.suffix === 'final') {
      assert.equal(after.current.status, '已付款');
      assert.equal(cents(after.current.paid_amount), total);
      assert.equal(cents(after.current.balance_amount), 0);
    }
    await onProgress(verified);
  }
  return settled;
}

async function rejectOverpayment(ctx, side, invoice) {
  const [before] = await query(ctx, `SELECT paid_amount, balance_amount FROM ${side}_invoices WHERE id = ?`, [invoice.id]);
  const [bankBefore] = await query(ctx, 'SELECT current_balance FROM bank_accounts WHERE id = ?', [ctx.fixture.finance.bank.id]);
  const payload = { invoiceId: invoice.id, amount: Number(before.balance_amount) + 0.01,
    paymentMethod: 'bank_transfer', bankAccountId: ctx.fixture.finance.bank.id,
    [side === 'ar' ? 'receiptDate' : 'paymentDate']: ctx.fixture.today,
    notes: 'CHAIN negative API: overpayment must roll back' };
  const result = await ctx.api('POST', `/api/finance/${side}/${side === 'ar' ? 'receipts' : 'payments'}`, payload, 'finance');
  assert.ok([400, 409, 422].includes(result.status), 'Overpayment must be rejected by business validation, not authentication');
  assert.match(JSON.stringify(result.body), /余额|核销|金额|已付款/, 'Rejection must explain the financial settlement constraint');
  const [after] = await query(ctx, `SELECT paid_amount, balance_amount FROM ${side}_invoices WHERE id = ?`, [invoice.id]);
  const [bankAfter] = await query(ctx, 'SELECT current_balance FROM bank_accounts WHERE id = ?', [ctx.fixture.finance.bank.id]);
  assert.deepEqual(after, before, 'Rejected payment cannot change invoice balance');
  assert.deepEqual(bankAfter, bankBefore, 'Rejected payment cannot change cash balance');
  ctx.record?.(`${side.toUpperCase()} 超额核销拒绝(API)`, { invoiceId: invoice.id, status: result.status, body: result.body });
}

async function auditReports(ctx, invoices, settlements, outbounds) {
  await ctx.asActor('finance');
  const finance = ctx.fixture.finance;
  const [bank] = await query(ctx, 'SELECT current_balance FROM bank_accounts WHERE id = ?', [finance.bank.id]);
  const expected = cents(finance.bank.initialBalance) + settlements.reduce((sum, row) => sum + (row.side === 'ar' ? 1 : -1) * cents(row.amount), 0);
  assert.equal(cents(bank.current_balance), expected, 'Bank balance = starting balance + actual receipts - actual payments');
  for (const side of ['ar', 'ap']) {
    for (const invoice of invoices[side]) {
      const [current] = await query(ctx, `SELECT status, total_amount, paid_amount, balance_amount FROM ${side}_invoices WHERE id = ?`, [invoice.id]);
      assert.equal(cents(current.balance_amount), 0);
      assert.equal(cents(current.paid_amount), cents(current.total_amount));
      assert.equal(current.status, '已付款');
    }
    await ctx.page.goto(`${ctx.baseUrl}/finance/${side}/settlement`);
    await snapshot(ctx, `${side}-settlement-dashboard`);
  }
  for (const outbound of outbounds) {
    const response = await ctx.api('GET', `/api/finance/integration/document-status/sales-outbound/${outbound.id}`, undefined, 'finance');
    assert.equal(response.status, 200);
    const status = dataOf(response.body);
    assert.equal(status.closedLoop, true, 'Sales outbound AR/tax/cost closure');
    assert.equal(status.streams.ar.balance, 0);
    assert.equal(status.streams.costGl.posted, true);
    ctx.record?.(`销售业财闭环 ${outbound.outbound_no}`, status);
  }
  // The page loads its default period immediately and the query button can reuse
  // that GET from the frontend cache. Observe the matching request before navigation.
  const trialResponse = ctx.page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === 'GET'
      && url.pathname === '/api/finance/gl/trial-balance'
      && url.searchParams.get('period_id') === String(finance.period.id);
  }, { timeout: 45000 });
  trialResponse.catch(() => {});
  await ctx.page.goto(`${ctx.baseUrl}/finance/gl/trial-balance`);
  await ctx.page.getByRole('combobox', { name: '会计期间', exact: true }).press('Enter');
  await ctx.page.getByRole('option', { name: finance.period.name, exact: true }).click();
  await ctx.page.getByRole('button', { name: /^(查询|搜索)$/ }).first().click();
  const response = await trialResponse;
  const trialBody = await response.json();
  assert.ok(response.ok() && trialBody.success !== false, 'Trial balance report request must succeed');
  const trial = dataOf(trialBody);
  assert.equal(trial.isBalanced, true, 'Trial balance must be balanced');
  await ctx.page.getByText('试算平衡：借贷平衡', { exact: true }).waitFor();
  await snapshot(ctx, 'trial-balance');
  ctx.record?.('试算平衡/UI + API', trial.summary);
  await ctx.page.goto(`${ctx.baseUrl}/finance/gl/period-closing`);
  await ctx.page.getByRole('combobox', { name: '待结转期间', exact: true }).press('Enter');
  await ctx.page.getByRole('option').filter({ hasText: finance.period.name }).first().click();
  const closing = await action(ctx, 'GET', `/api/finance/gl/closing/preview/${finance.period.id}`,
    () => ctx.page.getByRole('button', { name: '下一步', exact: true }).click());
  assert.ok(Array.isArray(closing.checks), 'Closing audit returns check list');
  assert.ok(closing.checks.some(check => check.key === 'core_business_controls'), 'Closing includes core business controls');
  ctx.record?.('关账预检查/UI + API', { canClose: closing.canClose, checks: closing.checks });
  await snapshot(ctx, 'closing-preview');
  return { bankBalance: Number(bank.current_balance), trialBalance: trial.summary, closing };
}

async function runFinance(ctx, chain) {
  assert.ok(ctx.fixture.finance?.bank?.id, 'prepareFinanceFixture must run before finance flow');
  const { receiptIds, outboundIds } = resolveFinanceSourceIds(chain);
  const receipts = await query(ctx, `SELECT * FROM purchase_receipts WHERE id IN (${receiptIds.map(() => '?').join(',')}) AND deleted_at IS NULL ORDER BY id`, receiptIds);
  const outbounds = await query(ctx, `SELECT * FROM sales_outbound WHERE id IN (${outboundIds.map(() => '?').join(',')}) AND deleted_at IS NULL ORDER BY id`, outboundIds);
  assert.equal(receipts.length, receiptIds.length, 'All explicit purchase receipt sources must exist');
  assert.equal(outbounds.length, outboundIds.length, 'All explicit sales outbound sources must exist');
  assert.ok(Number.isSafeInteger(Number(chain.order?.id)) && Number(chain.order.id) > 0, 'An explicit sales order identity is required');
  for (const outbound of outbounds) assert.equal(Number(outbound.order_id), Number(chain.order.id), 'Sales outbound must belong to this chain order, not a production material issue');
  for (const [type, sources] of [['purchase_receipt', receipts], ['sales_outbound', outbounds]]) {
    for (const source of sources) {
      assert.equal(source.status, 'completed', `${type} ${source.id} must be completed before finance flow`);
      const [posting] = await query(ctx,
        `SELECT id, finance_status FROM inventory_posting_documents
         WHERE source_type = ? AND source_id = ? AND posting_kind = 'movement' ORDER BY id DESC LIMIT 1`, [type, source.id]);
      assert.equal(posting?.finance_status, 'approved', `${type} ${source.id} must have a financially approved inventory posting`);
    }
  }
  await ctx.record?.('财务闭环来源核对', { orderId: chain.order.id, receiptIds, outboundIds, source: 'database' });
  const result = { matches: [], invoices: {}, settlements: [] };
  chain.finance = result;
  chain.financeComplete = false;
  const save = () => ctx.saveChain?.(chain);
  save();
  for (const receipt of receipts) {
    await ctx.step(`财务：入库 ${receipt.receipt_no} 三单匹配`, async () => result.matches.push(await createMatch(ctx, receipt)));
    save();
  }
  await ctx.step('财务：前端预览并生成采购应付凭证', () => generateVouchers(ctx, 'purchase_receipt', receipts));
  await ctx.step('财务：前端预览并生成销售应收凭证', () => generateVouchers(ctx, 'sales_outbound', outbounds));
  await ctx.step('财务：销售成本凭证与实际出库估价闭环', async () => {
    result.costEntries = await ensureSalesCostVouchers(ctx, outbounds);
  });
  save();
  result.invoices.ap = await invoiceRows(ctx, 'ap', receiptIds);
  result.invoices.ar = await invoiceRows(ctx, 'ar', outboundIds);
  await ctx.step('财务：上下游来源、金额、税额、总账凭证一致', async () => {
    await assertInvoiceAndGl(ctx, 'ap', result.invoices.ap, receipts);
    await assertInvoiceAndGl(ctx, 'ar', result.invoices.ar, outbounds);
  });
  save();
  for (const side of ['ar', 'ap']) {
    for (const invoice of result.invoices[side]) {
      await ctx.step(`财务：${side.toUpperCase()} ${invoice.invoice_number} 超额拒绝/部分/结清`, async () => {
        await confirmInvoiceIfDraft(ctx, side, invoice);
        await rejectOverpayment(ctx, side, invoice);
        await settleInvoiceInStages(ctx, side, invoice, async settlement => {
          result.settlements.push(settlement);
          save();
        });
        await rejectOverpayment(ctx, side, invoice);
      });
    }
  }
  await ctx.step('财务：银行余额、应收应付结清、试算平衡与关账审计', async () => {
    result.audit = await auditReports(ctx, result.invoices, result.settlements, outbounds);
  });
  chain.finance = result;
  chain.financeComplete = true;
  save();
  return result;
}

function resolveFinanceSourceIds(chain) {
  const ids = values => [...new Set(values.map(value => Number(typeof value === 'object' ? value?.id : value)))];
  const receiptIds = ids([...(chain.receiptIds || []), ...(chain.purchaseReceiptIds || []), ...(chain.receipts || []), ...(chain.purchaseReceipts || [])]);
  // chain.outbound is the manufacturing material issue, in another table whose ID may collide.
  const outboundIds = ids([...(chain.outboundIds || []), ...(chain.salesOutbounds || [])]);
  assert.ok(receiptIds.length && outboundIds.length, 'Finance requires explicit purchase receipts and salesOutbounds/outboundIds; manufacturing outbound is not a sales source');
  assert.ok([...receiptIds, ...outboundIds].every(id => Number.isSafeInteger(id) && id > 0), 'Finance source IDs must be positive integers');
  return { receiptIds, outboundIds };
}

async function confirmInvoiceIfDraft(ctx, side, invoice) {
  const [current] = await query(ctx, `SELECT status FROM ${side}_invoices WHERE id = ?`, [invoice.id]);
  assert.ok(current, 'Invoice must exist before settlement');
  if (current.status !== '草稿') return;
  await ctx.asActor('finance');
  await ctx.page.goto(`${ctx.baseUrl}/finance/${side}/invoices`);
  await search(ctx, side === 'ar' ? '输入发票编号' : '系统编号', invoice.invoice_number);
  await action(ctx, 'PUT', `/api/finance/${side}/invoices/${invoice.id}/status`, async () => {
    await dataRow(ctx.page, invoice.invoice_number).getByRole('button', { name: '确认', exact: true }).click();
    await confirmMessage(ctx);
  });
  const [confirmed] = await query(ctx, `SELECT status FROM ${side}_invoices WHERE id = ?`, [invoice.id]);
  assert.equal(confirmed?.status, '已确认', 'Invoice confirmation must persist before testing settlement');
}

module.exports = { runFinance, approveInventoryPosting, postVoucher, createMatch, generateVouchers, auditReports,
  resolveFinanceSourceIds, settleInvoiceInStages, settlementState, assertSettlement };
