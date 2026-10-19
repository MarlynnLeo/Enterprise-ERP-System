'use strict';

// This test writes business data only through the isolated HTTP API.
// SQL is read-only evidence; auth credentials and cookies remain in memory.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { DATABASE, dbConfig, requireBackend, evidenceDir: fixtureDir } = require('./config.cjs');
const Decimal = requireBackend('decimal.js');
const TARGET = 'erp_purchase_audit_test_20261017_chain';
const API = 'http://127.0.0.1:3520';
const evidenceDir = path.resolve(__dirname, '../../output/playwright/voucher-entry');
const reportPath = path.join(evidenceDir, 'settlement-idempotency-results.json');
const dataOf = body => body?.data?.data ?? body?.data ?? body;
const money = value => new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
const names = kind => ({ resource: kind === 'ar' ? 'receipts' : 'payments', single: kind === 'ar' ? 'receipt' : 'payment' });

async function main({ prepareUiOnly = process.argv.includes('--prepare-ui') } = {}) {
  assert.equal(DATABASE, TARGET);
  const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'fixture.private.json'), 'utf8'));
  assert.equal(fixture.database, TARGET);
  fs.mkdirSync(evidenceDir, { recursive: true });
  const prior = prepareUiOnly ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : null;
  if (prior) { assert.equal(prior.database, TARGET); assert.equal(prior.status, 'PASS'); }
  const prefix = prior?.prefix || `TESTUIAUDIT${Date.now()}`;
  const activeReportPath = prepareUiOnly ? path.join(evidenceDir, 'settlement-idempotency-ui.json') : reportPath;
  const report = { database: TARGET, api: API, prefix, status: 'RUNNING', startedAt: new Date().toISOString(), steps: [] };
  const record = (name, detail) => { report.steps.push({ name, ...detail }); fs.writeFileSync(activeReportPath, JSON.stringify(report, null, 2)); };
  const db = await requireBackend('mysql2/promise').createConnection(dbConfig);
  const query = async (sql, params = []) => {
    assert.match(sql.trim(), /^(SELECT|SHOW)\b/i, 'Only read-only SQL is permitted');
    return (await db.query(sql, params))[0];
  };
  const sessions = {};
  async function raw(actor, method, endpoint, body, extraHeaders = {}, discardBody = false) {
    const url = new URL(endpoint, API); assert.equal(url.origin, API); assert.ok(endpoint.startsWith('/api/'));
    const cookies = sessions[actor] ||= new Map();
    const response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(45000),
      headers: { 'Content-Type': 'application/json', Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body) });
    for (const cookie of response.headers.getSetCookie()) {
      const first = cookie.split(';', 1)[0], equal = first.indexOf('=');
      cookies.set(first.slice(0, equal), first.slice(equal + 1));
    }
    if (discardBody) { await response.arrayBuffer(); return { status: response.status, responseDiscarded: true }; }
    return { status: response.status, body: await response.json() };
  }
  async function token(actor) {
    const result = await raw(actor, 'GET', '/api/csrf-token'); assert.equal(result.status, 200);
    const csrf = result.body.csrfToken || result.body.token || result.body.data?.csrfToken; assert.ok(csrf);
    return { 'X-CSRF-Token': csrf };
  }
  async function api(actor, method, endpoint, body, key, discard = false) {
    const headers = method === 'GET' ? {} : await token(actor);
    if (key) headers['Idempotency-Key'] = key;
    return raw(actor, method, endpoint, body, headers, discard);
  }
  async function success(actor, method, endpoint, body, key) {
    const result = await api(actor, method, endpoint, body, key);
    assert.ok([200, 201].includes(result.status) && result.body.success !== false,
      `${method} ${endpoint}: ${result.status} ${JSON.stringify(result.body).slice(0, 1500)}`);
    return dataOf(result.body);
  }
  const invoiceRow = async (kind, id) => (await query(`SELECT id, invoice_number, status, total_amount, paid_amount, balance_amount, currency_code, exchange_rate FROM ${kind}_invoices WHERE id = ?`, [id]))[0];
  async function snapshot(kind, invoiceId, bankId) {
    const { single, resource } = names(kind);
    return {
      invoice: await invoiceRow(kind, invoiceId),
      settlements: await query(`SELECT s.id, s.${single}_number AS number, s.status, s.total_amount, s.base_amount,
        s.currency_code, s.exchange_rate, s.idempotency_key, s.idempotency_hash, i.amount, i.base_settlement_amount
        FROM ${kind}_${resource} s JOIN ${kind}_${single}_items i ON i.${single}_id = s.id WHERE i.invoice_id = ? ORDER BY s.id`, [invoiceId]),
      bank: (await query('SELECT id, current_balance FROM bank_accounts WHERE id = ?', [bankId]))[0],
      movements: await query('SELECT id, transaction_number, transaction_type, amount, gl_entry_id FROM bank_transactions WHERE bank_account_id = ? AND related_invoice_type = ? AND related_invoice_id = ? ORDER BY id', [bankId, kind.toUpperCase(), invoiceId]),
      vouchers: await query(`SELECT DISTINCT e.id, e.document_number, e.is_posted, e.is_reversed,
        (SELECT SUM(debit_amount) FROM gl_entry_items WHERE entry_id = e.id) AS total_debit,
        (SELECT SUM(credit_amount) FROM gl_entry_items WHERE entry_id = e.id) AS total_credit
        FROM gl_entries e JOIN gl_entry_items i ON i.entry_id = e.id WHERE i.invoice_number = (SELECT invoice_number FROM ${kind}_invoices WHERE id = ?) ORDER BY e.id`, [invoiceId]),
    };
  }
  async function assertSingle(kind, invoiceId, bankId, key, amount, baseAmount) {
    const state = await snapshot(kind, invoiceId, bankId);
    const rows = state.settlements.filter(row => row.idempotency_key === key); assert.equal(rows.length, 1);
    const row = rows[0]; assert.equal(money(row.amount), amount); assert.equal(money(row.total_amount), amount);
    assert.equal(money(row.base_settlement_amount), baseAmount); assert.equal(money(row.base_amount), baseAmount);
    assert.match(row.idempotency_hash, /^[a-f0-9]{64}$/);
    const moves = state.movements.filter(item => item.transaction_number === row.number); assert.equal(moves.length, 1);
    assert.equal(money(moves[0].amount), amount);
    const voucher = state.vouchers.find(item => item.id === moves[0].gl_entry_id); assert.ok(voucher);
    assert.equal(voucher.is_posted, 1); assert.equal(money(voucher.total_debit), baseAmount); assert.equal(money(voucher.total_credit), baseAmount);
    return row;
  }
  async function createInvoice(kind, currency, rate, suffix, total = 0.03) {
    const number = `${prefix}-${currency[0]}${kind}-${suffix[0]}`;
    const existing = await query(`SELECT id FROM ${kind}_invoices WHERE invoice_number = ?`, [number]); assert.ok(existing.length <= 1);
    const created = existing[0] || await success('business', 'POST', `/api/finance/${kind}/invoices`, {
      invoiceNumber: number, invoiceDate: fixture.today, dueDate: fixture.today,
      [kind === 'ar' ? 'customerId' : 'supplierId']: kind === 'ar' ? fixture.customer.id : fixture.supplier.id,
      currencyCode: currency, exchangeRate: rate, totalAmount: total, amountExcludingTax: total === 0.03 ? 0.02 : total,
      taxAmount: total === 0.03 ? 0.01 : 0, taxRate: total === 0.03 ? 0.5 : 0,
      notes: `${prefix} isolated idempotency audit`,
      items: [{ [kind === 'ar' ? 'productId' : 'materialId']: fixture.materials.raw.id,
        quantity: 2, unitPrice: total === 0.03 ? 0.01 : total / 2, description: `${prefix} audit`, amount: total === 0.03 ? 0.02 : total }],
    });
    if ((await invoiceRow(kind, created.id)).status === '草稿') {
      await success('finance', 'PUT', `/api/finance/${kind}/invoices/${created.id}/status`, { status: '已确认' });
    }
    const invoice = await invoiceRow(kind, created.id); assert.equal(invoice.invoice_number, number);
    return invoice;
  }
  async function concurrent(kind, invoice, bankId, payload, key, expectedBase) {
    const endpoint = `/api/finance/${kind}/${names(kind).resource}`;
    const headers = { ...await token('finance'), 'Idempotency-Key': key };
    const results = await Promise.all([raw('finance', 'POST', endpoint, payload, headers), raw('finance', 'POST', endpoint, payload, headers)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 201], JSON.stringify(results));
    assert.equal(dataOf(results[0].body).id, dataOf(results[1].body).id);
    const row = await assertSingle(kind, invoice.id, bankId, key, payload.amount, expectedBase);
    record(`${kind} ${invoice.currency_code} concurrent identical request records once`, {
      statuses: results.map(result => result.status), id: row.id, number: row.number, originalAmount: row.amount, baseAmount: row.base_amount });
    return row;
  }

  try {
    const [{ name }] = await query('SELECT DATABASE() AS name'); assert.equal(name, TARGET);
    for (const table of ['ar_receipts', 'ap_payments']) {
      const columns = await query(`SHOW COLUMNS FROM ${table} LIKE 'idempotency_%'`); assert.equal(columns.length, 2);
    }
    for (const actor of ['business', 'finance', 'reviewer']) {
      const result = await api(actor, 'POST', '/api/auth/login', { username: fixture.actors[actor].username, password: fixture.actors[actor].password });
      assert.equal(result.status, 200, `${actor} login failed`);
    }
    // Existing isolated sentinel proves the HTTP server uses the same DB before writing.
    const sentinel = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'usd-voucher-result.json'), 'utf8'));
    assert.equal(sentinel.database, TARGET);
    const { entry } = await success('finance', 'GET', `/api/finance/entries/${sentinel.entry.id}`);
    assert.equal(entry.documentNumber, sentinel.entry.documentNumber);
    const [{ document_number: sentinelNumber }] = await query('SELECT document_number FROM gl_entries WHERE id = ?', [entry.id]);
    assert.equal(sentinelNumber, entry.documentNumber);
    if (prepareUiOnly) {
      const bankId = prior.steps.find(step => step.bankIds)?.bankIds.USD;
      const [bank] = await query('SELECT id, account_number, currency_code FROM bank_accounts WHERE id = ?', [bankId]);
      assert.equal(bank.account_number, `${prefix}-USD`); assert.equal(bank.currency_code, 'USD');
      for (const kind of ['ar', 'ap']) {
        const invoice = await createInvoice(kind, 'USD', 6.50000001, 'UI', 100);
        const payload = { invoiceId: invoice.id, [kind === 'ar' ? 'receiptDate' : 'paymentDate']: fixture.today,
          amount: 40, discountAmount: 0, currencyCode: 'USD', exchangeRate: 6.50000001, paymentMethod: 'bank_transfer',
          bankAccountId: bankId, referenceNumber: `${prefix}-${kind}-UI40`, notes: `${prefix} initial UI settlement` };
        const settled = await success('finance', 'POST', `/api/finance/${kind}/${names(kind).resource}`, payload, `${prefix}-${kind}-UI40`);
        const current = await invoiceRow(kind, invoice.id);
        assert.equal(money(current.paid_amount), 40); assert.equal(money(current.balance_amount), 60);
        record(`${kind} UI sample`, { invoice: current, bankId, settlementId: settled.id, suggestedOrder: 'AR first, then AP' });
      }
      report.status = 'PASS'; report.completedAt = new Date().toISOString();
      fs.writeFileSync(activeReportPath, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ status: report.status, steps: report.steps, reportPath: activeReportPath }, null, 2));
      return;
    }
    const banks = {};
    for (const currency of ['CNY', 'USD']) {
      const result = await success('finance', 'POST', '/api/finance/bank-accounts', {
        accountNumber: `${prefix}-${currency}`, accountName: `${prefix}${currency}重试测试`, bankName: '隔离测试银行',
        currencyCode: currency, initialBalance: 0, accountType: '活期', isActive: true, notes: `${prefix}无外部银行连接`,
      });
      banks[currency] = result.id;
    }
    record('isolated fixture identity', { bankIds: banks, actorIds: Object.fromEntries(['business', 'finance', 'reviewer'].map(actor => [actor, fixture.actors[actor].id])) });
    for (const currency of ['CNY', 'USD']) {
      const rate = currency === 'USD' ? 6.50000001 : 1;
      const bankId = banks[currency]; const invoices = {}, payloads = {}, keys = {}, recorded = {};
      for (const kind of ['ar', 'ap']) {
        invoices[kind] = await createInvoice(kind, currency, rate, 'MAIN');
        keys[kind] = `${prefix}-${currency}-${kind}-concurrent`;
        payloads[kind] = { invoiceId: invoices[kind].id, [kind === 'ar' ? 'receiptDate' : 'paymentDate']: fixture.today,
          amount: 0.01, discountAmount: 0, currencyCode: currency, exchangeRate: rate, paymentMethod: 'bank_transfer', bankAccountId: bankId,
          referenceNumber: `${prefix}-${currency}-${kind}-first`, notes: `${prefix} concurrent request` };
      }
      const beforeFailure = await snapshot('ap', invoices.ap.id, bankId);
      const failed = await api('finance', 'POST', '/api/finance/ap/payments', payloads.ap, keys.ap);
      assert.equal(failed.status, 400); assert.match(JSON.stringify(failed.body), /余额不足/);
      assert.deepEqual(await snapshot('ap', invoices.ap.id, bankId), beforeFailure);
      record(`${currency} insufficient bank balance rolls back all effects`, { status: failed.status, invoiceId: invoices.ap.id, requestKey: keys.ap });
      for (const kind of ['ar', 'ap']) {
        recorded[kind] = await concurrent(kind, invoices[kind], bankId, payloads[kind], keys[kind], currency === 'USD' ? 0.07 : 0.01);
        const endpoint = `/api/finance/${kind}/${names(kind).resource}`;
        const beforeConflicts = await snapshot(kind, invoices[kind].id, bankId);
        for (const [label, actor, patch] of [
          ['amount', 'finance', { amount: 0.02 }], ['rate', 'finance', { exchangeRate: 7 }],
          ['bank', 'finance', { bankAccountId: banks[currency === 'USD' ? 'CNY' : 'USD'] }], ['actor', 'reviewer', {}],
        ]) {
          const conflict = await api(actor, 'POST', endpoint, { ...payloads[kind], ...patch }, keys[kind]);
          assert.equal(conflict.status, 409, `${kind} ${label}: ${JSON.stringify(conflict.body)}`);
          assert.equal(conflict.body.code, 'IDEMPOTENCY_CONFLICT');
          assert.deepEqual(await snapshot(kind, invoices[kind].id, bankId), beforeConflicts);
        }
        const otherInvoice = await createInvoice(kind, currency, rate, 'CONFLICT');
        const otherBefore = await snapshot(kind, otherInvoice.id, bankId);
        const wrongInvoice = await api('finance', 'POST', endpoint, { ...payloads[kind], invoiceId: otherInvoice.id }, keys[kind]);
        assert.equal(wrongInvoice.status, 409); assert.equal(wrongInvoice.body.code, 'IDEMPOTENCY_CONFLICT');
        assert.deepEqual(await snapshot(kind, otherInvoice.id, bankId), otherBefore);
        record(`${kind} ${currency} changed amount/rate/bank/actor/invoice conflict`, { status: 'PASS', originalId: recorded[kind].id, otherInvoiceId: otherInvoice.id });
      }
      // Drop a fresh successful response body; replay must recover the recorded ID.
      for (const kind of ['ar', 'ap']) {
        const endpoint = `/api/finance/${kind}/${names(kind).resource}`;
        const key = `${prefix}-${currency}-${kind}-lost`;
        const payload = { ...payloads[kind], amount: 0.02, referenceNumber: `${prefix}-${currency}-${kind}-lost`, notes: `${prefix} lost response` };
        const ignored = await api('finance', 'POST', endpoint, payload, key, true); assert.equal(ignored.status, 201);
        const beforeRetry = await snapshot(kind, invoices[kind].id, bankId);
        assert.equal(beforeRetry.invoice.status, '已付款'); assert.equal(money(beforeRetry.invoice.balance_amount), 0);
        const retry = await api('finance', 'POST', endpoint, payload, key); assert.equal(retry.status, 200);
        assert.equal(dataOf(retry.body).replayed, true);
        const row = await assertSingle(kind, invoices[kind].id, bankId, key, 0.02, currency === 'USD' ? 0.13 : 0.02);
        assert.equal(dataOf(retry.body).id, row.id);
        assert.deepEqual(await snapshot(kind, invoices[kind].id, bankId), beforeRetry);
        const firstReplay = await api('finance', 'POST', endpoint, payloads[kind], keys[kind]);
        assert.equal(firstReplay.status, 200); assert.equal(dataOf(firstReplay.body).id, recorded[kind].id);
        record(`${kind} ${currency} lost response/full invoice replay`, { id: row.id, number: row.number, replayStatus: retry.status,
          invoicePaid: beforeRetry.invoice.paid_amount, invoiceBalance: beforeRetry.invoice.balance_amount, settlements: beforeRetry.settlements.length });
      }
      assert.equal(money((await snapshot('ar', invoices.ar.id, bankId)).bank.current_balance), 0);
      for (const kind of ['ap', 'ar']) {
        const endpoint = `/api/finance/${kind}/${names(kind).resource}`;
        await success('finance', 'POST', `${endpoint}/${recorded[kind].id}/void`, { voidReason: `${prefix} verify original request cannot recreate a void settlement` });
        const beforeReplay = await snapshot(kind, invoices[kind].id, bankId);
        const replay = await api('finance', 'POST', endpoint, payloads[kind], keys[kind]);
        assert.equal(replay.status, 200); assert.equal(dataOf(replay.body).id, recorded[kind].id); assert.equal(dataOf(replay.body).status, 'void');
        assert.deepEqual(await snapshot(kind, invoices[kind].id, bankId), beforeReplay);
        assert.equal(money(beforeReplay.invoice.paid_amount), 0.02); assert.equal(money(beforeReplay.invoice.balance_amount), 0.01);
        record(`${kind} ${currency} void original replay returns same void ID without effects`, { id: recorded[kind].id, replay: dataOf(replay.body), afterVoid: beforeReplay });
      }
      assert.equal(money((await snapshot('ar', invoices.ar.id, bankId)).bank.current_balance), 0);
    }
    report.status = 'PASS'; report.completedAt = new Date().toISOString();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, prefix, steps: report.steps.length, reportPath }, null, 2));
  } catch (error) {
    report.status = 'FAIL'; report.error = error.message; fs.writeFileSync(activeReportPath, JSON.stringify(report, null, 2)); throw error;
  } finally { await db.end(); }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
