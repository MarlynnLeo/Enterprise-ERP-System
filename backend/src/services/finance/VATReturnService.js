'use strict';

const { roundMoney } = require('../../utils/money');
const Precision = require('../../utils/precision');
const { invalid } = require('./TaxPeriodGuard');

function monthRange(period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period))) throw invalid('增值税申报期间必须使用 YYYY-MM 格式');
  const [year, month] = period.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return {
    start: `${period}-01`, end: `${period}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`,
    previous: `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`,
  };
}

async function calculate(connection, period, baseline = {}) {
  const range = monthRange(period);
  const [prior] = await connection.execute(
    `SELECT * FROM tax_returns WHERE return_type = '增值税' AND status <> '已作废'
     AND return_period < ? ORDER BY return_period DESC, id DESC LIMIT 2`, [period]
  );
  const previous = prior[0];
  let opening;
  if (previous) {
    if (previous.return_period !== range.previous) throw invalid('增值税申报必须逐月衔接，请先补齐上期申报');
    if (prior[1]?.return_period === previous.return_period) throw invalid('上期存在重复申报，请先核对处理');
    if (!['已申报', '已缴纳'].includes(previous.status)) throw invalid('请先提交上期增值税申报');
  }
  if (previous && Number(previous.vat_snapshot_version) > 0 && previous.closing_input_credit != null) {
    opening = roundMoney(previous.closing_input_credit);
  } else {
    const value = baseline.opening_input_credit;
    const note = String(baseline.opening_credit_note || '').trim();
    if (value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || !note || note.length > 500) {
      throw invalid('首次申报或旧版申报衔接须填写经核对的期初留抵及依据（无留抵填 0）');
    }
    opening = roundMoney(value);
  }
  const [salesRows] = await connection.execute(
    `SELECT COALESCE(SUM(amount_excluding_tax), 0) AS sales_amount,
       COALESCE(SUM(tax_amount), 0) AS sales_output_tax FROM tax_invoices
     WHERE invoice_type = '销项' AND status IN ('已认证', '已抵扣') AND invoice_date BETWEEN ? AND ?`, [range.start, range.end]
  );
  const [purchaseRows] = await connection.execute(
    `SELECT COALESCE(SUM(amount_excluding_tax), 0) AS purchase_amount,
       COALESCE(SUM(tax_amount), 0) AS purchase_input_tax FROM tax_invoices
     WHERE invoice_type = '进项' AND status IN ('已认证', '已抵扣') AND invoice_date BETWEEN ? AND ?`, [range.start, range.end]
  );
  const [deductions] = await connection.execute(
    `SELECT COALESCE(SUM(tax_amount), 0) AS input_tax_deduction FROM tax_invoices
     WHERE invoice_type = '进项' AND status = '已抵扣' AND deduction_date BETWEEN ? AND ?`, [range.start, range.end]
  );
  const output = roundMoney(salesRows[0]?.sales_output_tax || 0);
  const deduction = roundMoney(deductions[0]?.input_tax_deduction || 0);
  const net = Precision.sub(Precision.sub(output, deduction), opening);
  return {
    sales_amount: roundMoney(salesRows[0]?.sales_amount || 0), sales_output_tax: output,
    purchase_amount: roundMoney(purchaseRows[0]?.purchase_amount || 0),
    purchase_input_tax: roundMoney(purchaseRows[0]?.purchase_input_tax || 0),
    input_tax_deduction: deduction, opening_input_credit: opening,
    closing_input_credit: roundMoney(Math.max(-net, 0)), tax_payable: roundMoney(Math.max(net, 0)),
    previous_vat_return_id: previous?.id || null,
    previous_vat_snapshot_version: previous ? Number(previous.vat_snapshot_version || 0) : null,
  };
}

async function assertSnapshot(connection, taxReturn) {
  if (!(Number(taxReturn.vat_snapshot_version) > 0)) throw invalid('旧版申报尚未确认留抵，请撤回后重新申报');
  const current = await calculate(connection, taxReturn.return_period, taxReturn);
  for (const [key, amount] of Object.entries(current)) {
    if (taxReturn[key] == null ? amount != null : Number(taxReturn[key]) !== Number(amount)) {
      throw invalid('申报税额或上期留抵已变化，请撤回后重新申报，不能使用旧快照缴款');
    }
  }
}

module.exports = { calculate, assertSnapshot, monthRange };
