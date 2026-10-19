'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveFinanceSourceIds, createMatch, settleInvoiceInStages } = require('./finance.cjs');

test('finance sources require explicit sales deliveries and never use a material issue ID', () => {
  assert.throws(() => resolveFinanceSourceIds({ receipts: [{ id: 1 }], outbound: { id: 2 } }), /salesOutbounds/);
  assert.deepEqual(resolveFinanceSourceIds({ receipts: [{ id: 1 }], purchaseReceiptIds: [1],
    outbound: { id: 999 }, salesOutbounds: [{ id: 2 }], outboundIds: [2, 3] }), { receiptIds: [1], outboundIds: [2, 3] });
  assert.throws(() => resolveFinanceSourceIds({ receiptIds: [1], outboundIds: [0] }), /positive integers/);
});

test('confirmed match resumes from the database without creating or confirming another', async () => {
  const recorded = [];
  const ctx = { db: { query: async () => [[{ id: 12, match_no: 'MATCH12', status: 'confirmed' }]] },
    record: async (name, detail) => recorded.push(detail), asActor: async () => assert.fail('no UI mutation for a confirmed match') };
  assert.deepEqual(await createMatch(ctx, { id: 4 }), { id: 12, number: 'MATCH12', receiptId: 4 });
  assert.equal(recorded[0].source, 'database');
});

test('ambiguous or variance matches fail before another match can be created', async () => {
  for (const rows of [[{ id: 1, status: 'matched' }, { id: 2, status: 'confirmed' }], [{ id: 1, status: 'variance' }]]) {
    const ctx = { db: { query: async () => [rows] }, asActor: async () => assert.fail('must inspect existing matches first') };
    await assert.rejects(createMatch(ctx, { id: 4 }), /multiple active|needs review/);
  }
});

function settlementFixture({ complete = false, lostResponse = false, missingVoucher = false, unexpected = false } = {}) {
  const invoice = { id: 41, invoice_number: 'AR41', total_amount: 10.01 };
  const saved = [{ id: 1, receipt_number: 'RC1', status: 'normal', notes: 'CHAIN partial AR41',
    total_amount: 5, bank_account_id: 9 }];
  if (complete) saved.push({ id: 2, receipt_number: 'RC2', status: 'normal', notes: 'CHAIN final AR41', total_amount: 5.01, bank_account_id: 9 });
  if (unexpected) saved[0].notes = 'An unrelated manual receipt';
  const records = [], transitions = [];
  let resolveResponse, enteredAmount, mutationCount = 0;
  const balance = () => {
    const paid = Math.round(saved.reduce((sum, row) => sum + row.total_amount, 0) * 100) / 100;
    return { ...invoice, paid_amount: paid, balance_amount: Math.round((invoice.total_amount - paid) * 100) / 100,
      status: paid === invoice.total_amount ? '已付款' : '部分付款' };
  };
  const query = async (sql, args) => {
    if (/FROM ar_invoices/.test(sql)) return [[balance()]];
    if (/SELECT s\.\*/.test(sql)) return [saved.map(row => ({ ...row, applied_amount: row.total_amount, discount_amount: 0 }))];
    if (/SELECT \* FROM ar_receipts/.test(sql)) return [[saved.find(row => row.id === args[0])]];
    if (/FROM ar_receipt_items/.test(sql)) return [[{ invoice_id: 41, amount: saved.find(row => row.id === args[0]).total_amount, discount_amount: 0 }]];
    if (/FROM document_links/.test(sql)) return [[{ target_type: 'bank_transaction', target_id: 100 + args[1] },
      ...(!missingVoucher || args[1] !== 2 ? [{ target_type: 'finance_voucher', target_id: 200 + args[1] }] : [])]];
    if (/FROM bank_transactions/.test(sql)) {
      const row = saved.find(item => item.id === args[0] - 100);
      return [[{ id: args[0], amount: row.total_amount, bank_account_id: 9, transaction_type: '转入', gl_entry_id: 200 + row.id }]];
    }
    if (/FROM gl_entries/.test(sql)) return [[{ is_posted: 1, is_reversed: 0 }]];
    if (/FROM gl_entry_items/.test(sql)) {
      const amount = saved.find(item => item.id === args[0] - 200).total_amount;
      return [[{ debit: amount, credit: amount }]];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  const control = (role, options) => ({
    locator: () => control(), filter: () => control(), first: () => control(), last: () => control(),
    getByRole: (nextRole, nextOptions) => control(nextRole, nextOptions), getByPlaceholder: () => control(),
    fill: async value => { if (role === 'spinbutton') enteredAmount = Number(value); }, press: async () => {}, waitFor: async () => {},
    click: async () => {
      if (role !== 'button' || options?.name !== '确认') return;
      mutationCount++;
      assert.equal(enteredAmount, 5.01, 'resume pays only the unpaid final half');
      saved.push({ id: 2, receipt_number: 'RC2', status: 'approved', notes: 'CHAIN final AR41', total_amount: enteredAmount, bank_account_id: 9 });
      transitions.push(balance());
      resolveResponse({ request: () => ({ method: () => 'POST' }), url: () => 'http://local.test/api/finance/ar/receipts',
        ok: () => true, status: () => 201, json: async () => {
          if (lostResponse) { lostResponse = false; throw new Error('Response lost after successful commit'); }
          return { success: true, data: { id: 2 } };
        } });
    },
  });
  const ctx = { db: { query }, fixture: { today: '2026-10-17', finance: { bank: { id: 9, accountName: 'Test bank' } } },
    baseUrl: 'http://local.test', asActor: async () => {}, record: async (name, detail) => records.push({ name, detail }),
    page: { ...control(), goto: async () => {}, waitForResponse: predicate => new Promise(resolve => {
      resolveResponse = response => { assert.ok(predicate(response)); resolve(response); };
    }) } };
  return { ctx, invoice, saved, records, transitions, mutationCount: () => mutationCount };
}

test('fully paid invoice revalidates both settlements, bank entries and vouchers without another payment', async () => {
  const fixture = settlementFixture({ complete: true });
  const result = await settleInvoiceInStages(fixture.ctx, 'ar', fixture.invoice);
  assert.deepEqual(result.map(row => row.amount), [5, 5.01]);
  assert.equal(fixture.mutationCount(), 0);
  assert.equal(fixture.records.length, 2);
});

test('partially paid invoice resumes the remaining stage and records the persisted balance', async () => {
  const fixture = settlementFixture();
  const progress = [];
  const result = await settleInvoiceInStages(fixture.ctx, 'ar', fixture.invoice, async row => progress.push(row.id));
  assert.equal(fixture.mutationCount(), 1);
  assert.deepEqual(progress, [1, 2]);
  assert.equal(fixture.transitions[0].balance_amount, 0);
  assert.equal(result[1].amount, 5.01);
});

test('a lost successful payment response stops the run and the next run recovers without paying again', async () => {
  const fixture = settlementFixture({ lostResponse: true });
  await assert.rejects(settleInvoiceInStages(fixture.ctx, 'ar', fixture.invoice), /Response lost/);
  const result = await settleInvoiceInStages(fixture.ctx, 'ar', fixture.invoice);
  assert.equal(result.length, 2);
  assert.equal(fixture.mutationCount(), 1);
});

test('paid header alone cannot hide a missing voucher and unrelated payments stop recovery', async () => {
  const corrupt = settlementFixture({ complete: true, missingVoucher: true });
  await assert.rejects(settleInvoiceInStages(corrupt.ctx, 'ar', corrupt.invoice), /exactly one voucher/);
  assert.equal(corrupt.mutationCount(), 0);
  const unrelated = settlementFixture({ unexpected: true });
  await assert.rejects(settleInvoiceInStages(unrelated.ctx, 'ar', unrelated.invoice), /Unexpected existing settlement/);
  assert.equal(unrelated.mutationCount(), 0);
});
