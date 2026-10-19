'use strict';

// Business mutations use the local API; SQL is restricted to read-only evidence.
// Credentials/cookies stay in memory and are never included in reports.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { DATABASE, dbConfig, requireBackend, evidenceDir: chainEvidenceDir } = require('./config.cjs');
const Decimal = requireBackend('decimal.js');
const API = 'http://127.0.0.1:3520';
const TARGET = 'erp_purchase_audit_test_20261017_chain';
const evidenceDir = path.resolve(__dirname, '../../output/playwright/voucher-entry');
const statePath = path.join(evidenceDir, 'voucher-currency-state.json');
const reportPath = path.join(evidenceDir, 'voucher-currency-results.json');
const dataOf = body => body?.data?.data ?? body?.data ?? body;
const money = value => new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
const RATE = 6.50000001;
const TOTAL = 0.03;
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));

async function main({ inspectOnly = process.argv.includes('--inspect'), readReview = process.argv.includes('--read-review') } = {}) {
  assert.equal(DATABASE, TARGET, 'Refusing any database other than this isolated voucher fixture');
  assert.equal(new URL(API).origin, 'http://127.0.0.1:3520');
  const fixture = JSON.parse(fs.readFileSync(path.join(chainEvidenceDir, 'fixture.private.json'), 'utf8'));
  assert.equal(fixture.database, TARGET);
  assert.notEqual(fixture.actors.business.id, fixture.actors.finance.id);
  fs.mkdirSync(evidenceDir, { recursive: true });
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {
    database: TARGET, api: API, prefix: `TESTUSD${Date.now()}`, createdAt: new Date().toISOString(),
  };
  assert.equal(state.database, TARGET); assert.equal(state.api, API);
  assert.match(state.prefix, /^TESTUSD\d+$/);
  save(statePath, state);
  const activeReportPath = readReview ? path.join(evidenceDir, 'voucher-currency-read-review.json') : reportPath;
  const previousReport = fs.existsSync(activeReportPath) ? JSON.parse(fs.readFileSync(activeReportPath, 'utf8')) : null;
  const previousSteps = previousReport?.status === 'PASS' && previousReport?.prefix === state.prefix ? previousReport.steps : [];
  const report = { database: TARGET, api: API, prefix: state.prefix, startedAt: new Date().toISOString(), steps: previousSteps };
  const record = (name, detail) => { report.steps.push({ name, ...detail }); save(activeReportPath, report); };
  const db = await requireBackend('mysql2/promise').createConnection(dbConfig);
  const query = async (sql, values = []) => {
    assert.match(sql.trim(), /^(SELECT|SHOW)\b/i, 'Business data must only change through the API');
    const [rows] = await db.query(sql, values); return rows;
  };
  const sessions = {};
  async function rawRequest(actor, method, pathname, body, headers = {}) {
    assert.ok(pathname.startsWith('/api/'));
    const url = new URL(pathname, API); assert.equal(url.origin, API);
    const cookies = sessions[actor] ||= new Map();
    const response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body) });
    for (const cookie of response.headers.getSetCookie()) {
      const first = cookie.split(';', 1)[0]; const equal = first.indexOf('=');
      cookies.set(first.slice(0, equal), first.slice(equal + 1));
    }
    const result = { status: response.status, body: await response.json() };
    return result;
  }
  async function api(actor, method, pathname, body) {
    const headers = {};
    if (method !== 'GET') {
      const csrf = await rawRequest(actor, 'GET', '/api/csrf-token');
      assert.equal(csrf.status, 200, 'CSRF token unavailable');
      headers['X-CSRF-Token'] = csrf.body.csrfToken || csrf.body.token || csrf.body.data?.csrfToken;
      assert.ok(headers['X-CSRF-Token']);
    }
    const response = await rawRequest(actor, method, pathname, body, headers);
    if (!pathname.includes('/auth/')) record(`${method} ${pathname}`, { actor, status: response.status, response: response.body });
    return response;
  }
  async function success(actor, method, pathname, body, statuses = [200, 201]) {
    const response = await api(actor, method, pathname, body);
    assert.ok(statuses.includes(response.status) && response.body.success !== false,
      `${method} ${pathname}: HTTP ${response.status} ${JSON.stringify(response.body).slice(0, 1600)}`);
    return dataOf(response.body);
  }
  async function invoiceRow(kind, id) {
    const [row] = await query(`SELECT * FROM ${kind}_invoices WHERE id = ?`, [id]); assert.ok(row); return row;
  }
  async function bankRow() {
    const [row] = await query('SELECT id, account_number, currency_code, current_balance, opening_balance FROM bank_accounts WHERE id = ?', [state.bankId]);
    assert.ok(row); return row;
  }
  const invoicePayload = (kind, number) => ({
    invoiceNumber: number, invoiceDate: fixture.today, dueDate: fixture.today,
    [kind === 'ar' ? 'customerId' : 'supplierId']: kind === 'ar' ? fixture.customer.id : fixture.supplier.id,
    currencyCode: 'USD', exchangeRate: RATE, totalAmount: TOTAL, amountExcludingTax: 0.02, taxAmount: 0.01, taxRate: 0.5,
    notes: `${state.prefix} isolated USD round-trip`,
    items: [{ [kind === 'ar' ? 'productId' : 'materialId']: fixture.materials.raw.id, quantity: 2, unitPrice: 0.01,
      description: `${state.prefix} unit metadata source`, amount: 0.02 }],
  });
  async function verifyVoucher(kind, invoice, key = kind) {
    const entries = await query("SELECT id, entry_number, document_number FROM gl_entries WHERE document_type = 'invoice' AND document_number = ? AND COALESCE(is_reversed,0) = 0", [invoice.invoice_number]);
    assert.equal(entries.length, 1, 'Each source invoice needs one original voucher');
    const { entry: detail } = await success('finance', 'GET', `/api/finance/entries/${entries[0].id}`);
    assert.equal(detail.isPosted, true);
    const items = detail.items;
    const partyField = kind === 'ar' ? 'customerId' : 'supplierId';
    const partyId = kind === 'ar' ? fixture.customer.id : fixture.supplier.id;
    const controlSide = kind === 'ar' ? 'debitAmount' : 'creditAmount';
    const control = items.filter(item => Number(item[partyField]) === Number(partyId) && money(item.foreignAmount) === TOTAL && Number(item[controlSide]) > 0);
    assert.equal(control.length, 1);
    assert.equal(money(control[0][controlSide]), money(new Decimal(TOTAL).times(RATE)));
    assert.equal(Number(control[0].baseRoundingAdjustment), 0);
    assert.ok(items.every(item => item.currencyCode === 'USD' && Number(item.exchangeRate) === RATE && item.invoiceNumber === invoice.invoice_number));
    const quantityLine = items.find(item => Number(item.quantity) === 2);
    assert.ok(quantityLine, 'Physical quantity survives invoice confirmation');
    assert.equal(Number(quantityLine.unitPrice), 0.01);
    assert.equal(Number(invoice.created_by), Number(fixture.actors.business.id));
    assert.equal(Number(invoice.approved_by), Number(fixture.actors.finance.id));
    record(`${kind} confirmation source metadata`, { entryId: detail.id, invoiceId: invoice.id, quantity: quantityLine.quantity,
      unitPrice: quantityLine.unitPrice, unitName: quantityLine.unitName, originalAmount: TOTAL, baseAmount: control[0][controlSide], rate: RATE });
    state[`${key}EntryId`] = detail.id; state[`${key}ControlAccountId`] = control[0].accountId; save(statePath, state);
  }
  async function ensureInvoice(kind) {
    const number = `${state.prefix}-${kind.toUpperCase()}`;
    let rows = await query(`SELECT id FROM ${kind}_invoices WHERE invoice_number = ?`, [number]);
    assert.ok(rows.length <= 1);
    if (!rows.length) {
      const created = await success('business', 'POST', `/api/finance/${kind}/invoices`, invoicePayload(kind, number));
      rows = [{ id: created.id }];
    }
    state[`${kind}InvoiceId`] = rows[0].id; save(statePath, state);
    let invoice = await invoiceRow(kind, rows[0].id);
    assert.equal(invoice.currency_code, 'USD'); assert.equal(Number(invoice.exchange_rate), RATE);
    if (invoice.status === '草稿') {
      await success('finance', 'PUT', `/api/finance/${kind}/invoices/${invoice.id}/status`, { status: '已确认' });
      invoice = await invoiceRow(kind, invoice.id);
    }
    assert.ok(['已确认', '部分付款', '已付款'].includes(invoice.status));
    await verifyVoucher(kind, invoice);
    return invoice;
  }
  async function negativeSettlements(kind, invoice) {
    if (state[`${kind}NegativesPassed`]) return;
    const resource = kind === 'ar' ? 'receipts' : 'payments';
    const table = `${kind}_${resource}`;
    const payload = { invoiceId: invoice.id, [kind === 'ar' ? 'receiptDate' : 'paymentDate']: fixture.today,
      amount: 0.01, currencyCode: 'USD', exchangeRate: RATE, bankAccountId: state.bankId, paymentMethod: 'bank_transfer' };
    const cases = [
      ['missing-rate', { ...payload, exchangeRate: undefined }],
      ['wrong-currency', { ...payload, currencyCode: 'CNY' }],
      ['wrong-rate', { ...payload, exchangeRate: 7 }],
      ['cross-currency-bank', { ...payload, bankAccountId: state.cnyBankId }],
    ];
    for (const [label, body] of cases) {
      const referenceNumber = `${state.prefix}-${kind}-${label}`;
      const beforeInvoice = await invoiceRow(kind, invoice.id); const beforeBank = await bankRow();
      const result = await api('finance', 'POST', `/api/finance/${kind}/${resource}`, { ...body, referenceNumber });
      assert.ok(result.status >= 400 && result.status < 500, `${kind} ${label} must be a validation refusal`);
      assert.equal((await query(`SELECT id FROM ${table} WHERE reference_number = ?`, [referenceNumber])).length, 0);
      const afterInvoice = await invoiceRow(kind, invoice.id); const afterBank = await bankRow();
      assert.equal(afterInvoice.paid_amount, beforeInvoice.paid_amount); assert.equal(afterInvoice.balance_amount, beforeInvoice.balance_amount);
      assert.equal(afterBank.current_balance, beforeBank.current_balance);
      record(`${kind} ${label} unchanged`, { status: 'PASS', invoiceId: invoice.id, bankBalance: afterBank.current_balance });
    }
    state[`${kind}NegativesPassed`] = true; save(statePath, state);
  }
  async function negativeInvoiceCreation(kind) {
    if (state[`${kind}InvoiceNegativesPassed`]) return;
    for (const [label, currency] of [
      ['NORATE', { exchangeRate: undefined }],
      ['9DP', { exchangeRate: 6.500000001 }],
      ['EUR', { currencyCode: 'EUR' }],
    ]) {
      const number = `${state.prefix}-${kind.toUpperCase()}-${label}`;
      const result = await api('business', 'POST', `/api/finance/${kind}/invoices`, { ...invoicePayload(kind, number), ...currency });
      assert.ok(result.status >= 400 && result.status < 500, `${kind} invoice ${label} must be a validation refusal`);
      assert.equal((await query(`SELECT id FROM ${kind}_invoices WHERE invoice_number = ?`, [number])).length, 0, 'Invalid invoice must not persist');
      assert.equal((await query('SELECT id FROM gl_entries WHERE document_number = ?', [number])).length, 0);
      record(`${kind} invoice ${label} has no persisted invoice/voucher`, { status: 'PASS' });
    }
    state[`${kind}InvoiceNegativesPassed`] = true; save(statePath, state);
  }
  async function prepareUiInvoice(kind) {
    const number = `${state.prefix}-${kind.toUpperCase()}-UI`;
    let rows = await query(`SELECT id FROM ${kind}_invoices WHERE invoice_number = ?`, [number]);
    assert.ok(rows.length <= 1);
    if (!rows.length) {
      const created = await success('business', 'POST', `/api/finance/${kind}/invoices`, { ...invoicePayload(kind, number), currencyCode: 'CNY', exchangeRate: 1 });
      rows = [{ id: created.id }];
    }
    state[`${kind}UiInvoiceId`] = rows[0].id; save(statePath, state);
    let invoice = await invoiceRow(kind, rows[0].id);
    if (invoice.status === '草稿' && invoice.currency_code === 'CNY') {
      const result = await api('business', 'PUT', `/api/finance/${kind}/invoices/${invoice.id}`, { ...invoicePayload(kind, number), exchangeRate: undefined });
      assert.ok(result.status >= 400 && result.status < 500, 'Switching CNY draft to USD must require an explicit rate');
      const unchanged = await invoiceRow(kind, invoice.id);
      assert.equal(unchanged.currency_code, 'CNY'); assert.equal(Number(unchanged.exchange_rate), 1);
      assert.equal((await query('SELECT id FROM gl_entries WHERE document_number = ?', [number])).length, 0);
      record(`${kind} draft currency switch without rate unchanged`, { status: 'PASS', invoiceId: invoice.id });
      await success('business', 'PUT', `/api/finance/${kind}/invoices/${invoice.id}`, invoicePayload(kind, number));
      invoice = await invoiceRow(kind, invoice.id);
    }
    assert.equal(invoice.currency_code, 'USD'); assert.equal(Number(invoice.exchange_rate), RATE);
    if (invoice.status === '草稿') {
      await success('finance', 'PUT', `/api/finance/${kind}/invoices/${invoice.id}/status`, { status: '已确认' });
      invoice = await invoiceRow(kind, invoice.id);
    }
    await verifyVoucher(kind, invoice, `${kind}Ui`);
    record(`${kind} UI sample available`, { invoiceId: invoice.id, invoiceNumber: number, currencyCode: 'USD', exchangeRate: RATE,
      balanceAmount: invoice.balance_amount, bankAccountId: state.bankId });
  }
  async function settle(kind, invoice) {
    const resource = kind === 'ar' ? 'receipts' : 'payments';
    const table = `${kind}_${resource}`, itemTable = kind === 'ar' ? 'ar_receipt_items' : 'ap_payment_items';
    const parentId = kind === 'ar' ? 'receipt_id' : 'payment_id';
    for (let part = 1; part <= 3; part++) {
      const referenceNumber = `${state.prefix}-${kind}-${part}`;
      let rows = await query(`SELECT * FROM ${table} WHERE reference_number = ?`, [referenceNumber]);
      assert.ok(rows.length <= 1, 'Retry must not duplicate a settlement');
      if (!rows.length) {
        await success('finance', 'POST', `/api/finance/${kind}/${resource}`, {
          invoiceId: invoice.id, [kind === 'ar' ? 'receiptDate' : 'paymentDate']: fixture.today,
          amount: 0.01, currencyCode: 'USD', exchangeRate: RATE, bankAccountId: state.bankId, paymentMethod: 'bank_transfer',
          referenceNumber, notes: `${state.prefix} ${kind} part ${part}/3`,
        });
        rows = await query(`SELECT * FROM ${table} WHERE reference_number = ?`, [referenceNumber]);
      }
      assert.equal(rows.length, 1); const settlement = rows[0];
      const detail = await success('finance', 'GET', `/api/finance/${kind}/${resource}/${settlement.id}`);
      assert.equal(detail.currencyCode, 'USD'); assert.equal(Number(detail.exchangeRate), RATE);
      const itemRows = await query(`SELECT * FROM ${itemTable} WHERE ${parentId} = ?`, [settlement.id]);
      assert.equal(itemRows.length, 1);
      const expectedBase = part === 2 ? 0.06 : 0.07;
      assert.equal(money(itemRows[0].base_settlement_amount), expectedBase);
      assert.equal(money(settlement.base_amount), expectedBase);
      record(`${kind} part ${part} source and base amounts`, { settlementId: settlement.id, originalAmount: 0.01, baseAmount: expectedBase, currency: 'USD' });
    }
    const after = await invoiceRow(kind, invoice.id);
    assert.equal(after.status, '已付款'); assert.equal(money(after.paid_amount), TOTAL); assert.equal(money(after.balance_amount), 0);
    const controls = await query(`SELECT i.debit_amount, i.credit_amount, i.foreign_amount, i.base_rounding_adjustment, e.document_type
      FROM gl_entry_items i JOIN gl_entries e ON e.id = i.entry_id
      WHERE i.invoice_number = ? AND i.account_id = ? AND e.is_posted = 1 AND COALESCE(e.is_reversed,0) = 0`,
    [invoice.invoice_number, state[`${kind}ControlAccountId`]]);
    assert.equal(controls.length, 4, 'One confirmation plus three settlement control lines');
    const net = controls.reduce((sum, row) => sum.plus(row.debit_amount).minus(row.credit_amount), new Decimal(0));
    assert.equal(net.toNumber(), 0, 'Invoice base-currency control account must clear exactly');
    const bank = await bankRow();
    const [received] = await query('SELECT COALESCE(SUM(total_amount),0) AS amount FROM ar_receipts WHERE bank_account_id = ?', [state.bankId]);
    const [paid] = await query('SELECT COALESCE(SUM(total_amount),0) AS amount FROM ap_payments WHERE bank_account_id = ?', [state.bankId]);
    assert.equal(money(bank.current_balance), money(new Decimal(received.amount).minus(paid.amount)));
    record(`${kind} fully settled`, { invoiceId: invoice.id, paidAmount: after.paid_amount, balanceAmount: after.balance_amount,
      controlBaseNet: net.toNumber(), bankOriginalBalance: bank.current_balance, controls });
  }
  async function verifyBankLedger() {
    const rows = await query(`SELECT b.id AS bank_transaction_id, b.amount AS bank_original_amount, b.transaction_type,
      b.related_invoice_type, b.related_invoice_id, b.gl_entry_id, i.debit_amount, i.credit_amount,
      i.foreign_amount, i.exchange_rate, i.base_rounding_adjustment
      FROM bank_transactions b JOIN gl_entry_items i ON i.entry_id = b.gl_entry_id
      WHERE b.bank_account_id = ? AND ((b.related_invoice_type = 'AR' AND b.related_invoice_id = ?)
        OR (b.related_invoice_type = 'AP' AND b.related_invoice_id = ?)) AND i.account_id NOT IN (?, ?)`,
    [state.bankId, state.arInvoiceId, state.apInvoiceId, state.arControlAccountId, state.apControlAccountId]);
    assert.equal(rows.length, 6, 'Six bank transactions must each have one bank GL line');
    assert.ok(rows.every(row => money(row.bank_original_amount) === 0.01 && money(row.foreign_amount) === 0.01 && Number(row.exchange_rate) === RATE));
    const net = rows.reduce((sum, row) => sum.plus(row.debit_amount).minus(row.credit_amount), new Decimal(0));
    assert.equal(net.toNumber(), 0, 'The dedicated bank base-currency ledger must also balance to zero');
    record('bank original-currency movements and base-currency GL reconcile', { status: 'PASS', bankId: state.bankId, rows, baseNet: net.toNumber() });
  }
  try {
    const [{ name }] = await query('SELECT DATABASE() AS name'); assert.equal(name, TARGET);
    const schemaRows = await query("SELECT table_name, column_name, numeric_scale FROM information_schema.columns WHERE table_schema = ? AND ((table_name IN ('ar_invoices','ap_invoices','ar_receipts','ap_payments') AND column_name IN ('currency_code','exchange_rate','base_amount')) OR (table_name IN ('ar_receipt_items','ap_payment_items') AND column_name = 'base_settlement_amount'))", [TARGET]);
    const schema = schemaRows.map(row => ({ table_name: row.table_name ?? row.TABLE_NAME, column_name: row.column_name ?? row.COLUMN_NAME, numeric_scale: row.numeric_scale ?? row.NUMERIC_SCALE }));
    const fixtureSummary = { database: name, actorIds: Object.fromEntries(Object.entries(fixture.actors).map(([key, value]) => [key, value.id])),
      customerId: fixture.customer?.id, supplierId: fixture.supplier?.id, materialId: fixture.materials?.raw?.id, schema };
    record('isolated database/schema verified', fixtureSummary);
    if (inspectOnly) { console.log(JSON.stringify(fixtureSummary, null, 2)); return; }
    for (const table of ['ar_invoices', 'ap_invoices', 'ar_receipts', 'ap_payments']) {
      const rateColumn = schema.find(column => column.table_name === table && column.column_name === 'exchange_rate');
      assert.ok(rateColumn && Number(rateColumn.numeric_scale) === 8, `${table} needs 8-decimal migration before testing`);
    }
    for (const actor of ['business', 'finance']) {
      const logged = await api(actor, 'POST', '/api/auth/login', { username: fixture.actors[actor].username, password: fixture.actors[actor].password });
      assert.equal(logged.status, 200, `${actor} fixture login failed`);
    }
    const sentinel = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'usd-voucher-result.json'), 'utf8'));
    assert.equal(sentinel.database, TARGET);
    const { entry: apiSentinel } = await success('finance', 'GET', `/api/finance/entries/${sentinel.entry.id}`);
    assert.equal(apiSentinel.documentNumber, sentinel.entry.documentNumber);
    assert.equal(apiSentinel.createdBy, sentinel.entry.createdBy);
    const directSentinel = await query('SELECT document_number FROM gl_entries WHERE id = ?', [sentinel.entry.id]);
    assert.equal(directSentinel[0].document_number, apiSentinel.documentNumber);
    record('API matches isolated database sentinel', { entryId: apiSentinel.id, documentNumber: apiSentinel.documentNumber });
    if (readReview) {
      const checks = [];
      for (const kind of ['ar', 'ap']) {
        const invoiceId = state[`${kind}InvoiceId`];
        for (const endpoint of [`/finance/${kind}/invoices/${invoiceId}`, `/finance/${kind}/invoices/${invoiceId}/edit`,
          `/finance/${kind}/invoices/${invoiceId}/payments`, `/finance/${kind}/invoices?pageSize=100`,
          `/finance/${kind}/${kind === 'ar' ? 'receipts' : 'payments'}?pageSize=100`,
          kind === 'ar' ? '/finance/ar/customer-receivables' : '/finance/ap/supplier-payables',
          kind === 'ar' ? `/finance/ar/customer-receivables/${fixture.customer.id}` : `/finance/ap/supplier-payables/${fixture.supplier.id}`]) {
          const data = await success('finance', 'GET', `/api${endpoint}`);
          const rows = Array.isArray(data) ? data : data.list || data.invoices || data.payments || data.items;
          checks.push({ endpoint, keys: Object.keys(data),
            currencyCode: data.currencyCode, exchangeRate: data.exchangeRate, totalAmount: data.totalAmount,
            paidAmount: data.paidAmount, balanceAmount: data.balanceAmount, balance: data.balance,
            amountBasis: data.amountBasis, hasMixedCurrencies: data.hasMixedCurrencies, currencyTotals: data.currencyTotals,
            rows: Array.isArray(rows) ? rows.filter(row => endpoint.endsWith('/payments') || endpoint.includes('customer-receivables') || endpoint.includes('supplier-payables') || row.id === invoiceId || row.invoiceId === invoiceId || String(row.referenceNumber || '').startsWith(state.prefix))
              .map(row => ({ id: row.id, invoiceId: row.invoiceId, customerId: row.customerId, supplierId: row.supplierId,
                currencyCode: row.currencyCode, exchangeRate: row.exchangeRate,
                baseAmount: row.baseAmount, baseSettlementAmount: row.baseSettlementAmount,
                totalAmount: row.totalAmount, paidAmount: row.paidAmount, balanceAmount: row.balanceAmount, balance: row.balance,
                amountBasis: row.amountBasis, hasMixedCurrencies: row.hasMixedCurrencies, currencyTotals: row.currencyTotals })) : undefined });
        }
      }
      report.status = 'PASS'; report.checks = checks; save(activeReportPath, report);
      console.log(JSON.stringify(checks, null, 2)); return;
    }
    const cnyBanks = await query("SELECT id FROM bank_accounts WHERE currency_code = 'CNY' AND is_active = 1 ORDER BY id LIMIT 1");
    assert.equal(cnyBanks.length, 1); state.cnyBankId = cnyBanks[0].id;
    let banks = await query('SELECT id FROM bank_accounts WHERE account_number = ?', [state.prefix]);
    if (!banks.length) {
      const bank = await success('finance', 'POST', '/api/finance/bank-accounts', {
        accountNumber: state.prefix, accountName: `${state.prefix}美元闭环测试`, bankName: '隔离测试银行',
        currencyCode: 'USD', initialBalance: 0, accountType: '活期', isActive: true,
        notes: `${state.prefix}隔离美元测试账户，无外部银行连接`,
      });
      banks = [{ id: bank.id }];
    }
    assert.equal(banks.length, 1); state.bankId = banks[0].id; save(statePath, state);
    for (const kind of ['ar', 'ap']) {
      const invoice = await ensureInvoice(kind);
      await negativeSettlements(kind, invoice);
      await settle(kind, invoice);
      await negativeInvoiceCreation(kind);
    }
    await verifyBankLedger();
    for (const kind of ['ar', 'ap']) await prepareUiInvoice(kind);
    report.status = 'PASS'; report.completedAt = new Date().toISOString(); report.ids = state;
    save(reportPath, report); console.log(JSON.stringify({ status: report.status, prefix: state.prefix, ids: state, reportPath }, null, 2));
  } catch (error) {
    report.status = 'FAIL'; report.error = error.message; save(activeReportPath, report); throw error;
  } finally { await db.end(); }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
