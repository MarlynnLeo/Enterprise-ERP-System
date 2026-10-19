'use strict';

// Read-only verification of the four settlements submitted through the UI.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { DATABASE, dbConfig, requireBackend } = require('./config.cjs');
const Decimal = requireBackend('decimal.js');
const TARGET = 'erp_purchase_audit_test_20261017_chain';
const evidenceDir = path.resolve(__dirname, '../../output/playwright/voucher-entry');
const reportPath = path.join(evidenceDir, 'voucher-ui-settlement-results.json');
const money = value => new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
const sum = (rows, value) => rows.reduce((total, row) => total.plus(value(row)), new Decimal(0)).toNumber();

async function main() {
  assert.equal(DATABASE, TARGET);
  const state = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'voucher-currency-state.json'), 'utf8'));
  assert.equal(state.database, TARGET);
  assert.equal(state.bankId, 10);
  assert.equal(state.arUiInvoiceId, 5);
  assert.equal(state.apUiInvoiceId, 5);
  const report = { status: 'RUNNING', readOnly: true, database: TARGET, startedAt: new Date().toISOString(), invoiceResults: [] };
  const db = await requireBackend('mysql2/promise').createConnection(dbConfig);
  const query = async (sql, params = []) => {
    assert.match(sql.trim(), /^SELECT\b/i, 'UI verification must remain read-only');
    const [rows] = await db.query(sql, params);
    return rows;
  };
  try {
    const [database] = await query('SELECT DATABASE() AS name');
    assert.equal(database.name, TARGET);
    for (const kind of ['ar', 'ap']) {
      const settlement = kind === 'ar' ? 'receipt' : 'payment';
      const numbers = kind === 'ar' ? ['RC261017012', 'RC261017013'] : ['PAY261017012', 'PAY261017013'];
      const [invoice] = await query(`SELECT id, invoice_number, currency_code, exchange_rate, total_amount, paid_amount, balance_amount, status
        FROM ${kind}_invoices WHERE id = ?`, [5]);
      assert.equal(invoice.invoice_number, `${state.prefix}-${kind.toUpperCase()}-UI`);
      assert.equal(invoice.currency_code, 'USD');
      assert.equal(Number(invoice.exchange_rate), 6.50000001);
      assert.equal(invoice.status, '已付款');
      assert.equal(money(invoice.total_amount), 0.03);
      assert.equal(money(invoice.paid_amount), 0.03);
      assert.equal(money(invoice.balance_amount), 0);
      const settlements = await query(`SELECT s.id, s.${settlement}_number AS number, s.bank_account_id, s.currency_code, s.exchange_rate,
        s.total_amount, s.base_amount, s.status, si.invoice_id, si.amount, si.discount_amount, si.base_settlement_amount
        FROM ${kind}_${settlement}s s JOIN ${kind}_${settlement}_items si ON si.${settlement}_id = s.id
        WHERE si.invoice_id = ? ORDER BY s.id`, [5]);
      assert.equal(settlements.length, 2);
      settlements.forEach((row, index) => {
        assert.equal(row.id, index + 9);
        assert.equal(row.number, numbers[index]);
        assert.equal(row.bank_account_id, 10);
        assert.equal(row.currency_code, 'USD');
        assert.equal(Number(row.exchange_rate), 6.50000001);
        assert.ok(!['void', 'cancelled'].includes(row.status));
        assert.equal(money(row.amount), index ? 0.02 : 0.01);
        assert.equal(money(row.total_amount), index ? 0.02 : 0.01);
        assert.equal(money(row.discount_amount), 0);
        assert.equal(money(row.base_amount), index ? 0.13 : 0.07);
        assert.equal(money(row.base_settlement_amount), index ? 0.13 : 0.07);
      });
      const controlLines = await query(`SELECT e.id AS entry_id, e.document_number, e.document_type, e.is_posted, e.is_reversed,
        i.account_id, i.debit_amount, i.credit_amount, i.currency_code, i.exchange_rate, i.foreign_amount, i.base_rounding_adjustment
        FROM gl_entry_items i JOIN gl_entries e ON e.id = i.entry_id
        WHERE i.invoice_number = ? AND i.account_id = ? ORDER BY e.id`, [invoice.invoice_number, state[`${kind}UiControlAccountId`]]);
      assert.equal(controlLines.length, 3);
      assert.ok(controlLines.every(row => row.is_posted === 1 && !row.is_reversed && row.currency_code === 'USD' && Number(row.exchange_rate) === 6.50000001));
      assert.equal(controlLines[0].entry_id, state[`${kind}UiEntryId`]);
      assert.equal(money(controlLines[0][kind === 'ar' ? 'debit_amount' : 'credit_amount']), 0.20);
      const controlBaseNet = sum(controlLines, row => new Decimal(row.debit_amount).minus(row.credit_amount));
      assert.equal(controlBaseNet, 0);
      const settlementVouchers = [];
      for (const [index, number] of numbers.entries()) {
        const lines = await query(`SELECT e.id AS entry_id, e.document_number, e.is_posted, e.is_reversed,
          i.account_id, i.debit_amount, i.credit_amount, i.currency_code, i.exchange_rate, i.foreign_amount, i.base_rounding_adjustment
          FROM gl_entries e JOIN gl_entry_items i ON i.entry_id = e.id WHERE e.document_number = ? ORDER BY i.line_number, i.id`, [number]);
        assert.equal(lines.length, 2);
        assert.ok(lines.every(row => row.is_posted === 1 && !row.is_reversed && row.currency_code === 'USD' && Number(row.exchange_rate) === 6.50000001));
        assert.equal(sum(lines, row => row.debit_amount), index ? 0.13 : 0.07);
        assert.equal(sum(lines, row => row.credit_amount), index ? 0.13 : 0.07);
        assert.ok(lines.every(row => money(row.foreign_amount) === (index ? 0.02 : 0.01)));
        settlementVouchers.push({ number, lines });
      }
      report.invoiceResults.push({ kind, invoice, settlements, controlLines, controlBaseNet, settlementVouchers,
        settlementOriginalTotal: sum(settlements, row => row.amount), settlementBaseTotal: sum(settlements, row => row.base_settlement_amount) });
    }
    const [bank] = await query('SELECT id, account_number, currency_code, opening_balance, current_balance FROM bank_accounts WHERE id = ?', [10]);
    assert.equal(bank.account_number, state.prefix);
    assert.equal(bank.currency_code, 'USD');
    assert.equal(money(bank.opening_balance), 0);
    assert.equal(money(bank.current_balance), 0);
    const movements = await query(`SELECT id, transaction_number, transaction_type, amount, reference_number, related_invoice_type, related_invoice_id, gl_entry_id
      FROM bank_transactions WHERE bank_account_id = ? ORDER BY id`, [10]);
    assert.ok(movements.every(row => ['转入', '转出'].includes(row.transaction_type)));
    const bankOriginalNet = sum(movements, row => row.transaction_type === '转入' ? row.amount : new Decimal(row.amount).negated());
    assert.equal(bankOriginalNet, 0);
    const uiMovements = movements.filter(row => Number(row.related_invoice_id) === 5 && ['AR', 'AP'].includes(row.related_invoice_type));
    assert.equal(uiMovements.length, 4);
    for (const result of report.invoiceResults) {
      for (const settlement of result.settlements) {
        const matches = uiMovements.filter(row => row.transaction_number === settlement.number);
        assert.equal(matches.length, 1);
        assert.equal(matches[0].related_invoice_type, result.kind.toUpperCase());
        assert.equal(money(matches[0].amount), money(settlement.amount));
        const voucher = result.settlementVouchers.find(row => row.number === settlement.number);
        assert.equal(matches[0].gl_entry_id, voucher.lines[0].entry_id);
      }
    }
    const uiBankLines = report.invoiceResults.flatMap(result => result.settlementVouchers.flatMap(voucher =>
      voucher.lines.filter(line => line.account_id !== state[`${result.kind}UiControlAccountId`])));
    assert.equal(uiBankLines.length, 4);
    const uiBankBaseNet = sum(uiBankLines, row => new Decimal(row.debit_amount).minus(row.credit_amount));
    assert.equal(uiBankBaseNet, 0);
    report.bank = { ...bank, bankOriginalNet, uiBankBaseNet, uiMovements };
    report.status = 'PASS';
    report.completedAt = new Date().toISOString();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, database: TARGET,
      invoices: report.invoiceResults.map(row => ({ kind: row.kind, invoiceId: row.invoice.id, paidAmount: row.invoice.paid_amount,
        balanceAmount: row.invoice.balance_amount, baseAllocations: row.settlements.map(item => item.base_settlement_amount), controlBaseNet: row.controlBaseNet })),
      bankOriginalBalance: bank.current_balance, bankOriginalNet, uiBankBaseNet, reportPath }, null, 2));
  } catch (error) {
    report.status = 'FAIL'; report.error = error.message;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    throw error;
  } finally { await db.end(); }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
