const Decimal = require('decimal.js');
const BusinessError = require('../BusinessError');
const { requirePositiveInteger, normalizeOpeningAmount } = require('../../models/finance/helpers');

const optional = (value) => value === undefined || value === null || value === '';

function optionalId(value, label) {
  if (optional(value) || value === 0) return null;
  try {
    return requirePositiveInteger(value, label);
  } catch (error) {
    throw new BusinessError(error.message);
  }
}

function optionalText(value, label, maxLength) {
  if (optional(value)) return null;
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new BusinessError(`${label}必须为不超过${maxLength}个字符的文本`);
  }
  return value.trim() || null;
}

function optionalDecimal(value, label, precision, scale) {
  if (optional(value)) return null;
  if (
    !['string', 'number'].includes(typeof value) ||
    (typeof value === 'string' && !value.trim())
  ) {
    throw new BusinessError(`${label}必须为有效数值`);
  }
  let amount;
  try {
    amount = new Decimal(value);
  } catch {
    throw new BusinessError(`${label}必须为有效数值`);
  }
  if (
    !amount.isFinite() ||
    amount.isNegative() ||
    amount.decimalPlaces() > scale ||
    amount.gte(new Decimal(10).pow(precision - scale))
  ) {
    throw new BusinessError(`${label}必须为非负数，最多${scale}位小数，且不能超出范围`);
  }
  return amount;
}

function normalizeEntryMetadata(entry) {
  let attachmentCount = null;
  if (!optional(entry.attachment_count)) {
    const value = entry.attachment_count;
    if (
      !['string', 'number'].includes(typeof value) ||
      !/^\d+$/.test(String(value)) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) > 4294967295
    ) {
      throw new BusinessError('附件数必须为非负整数且不能超出范围');
    }
    attachmentCount = Number(value);
  }
  return {
    attachment_count: attachmentCount,
    approval_comment: optionalText(entry.approval_comment, '审核意见', 500),
  };
}

function normalizeEntryItems(
  items,
  { allowHistoricalAuxiliaries = false, allowFxRoundingAdjustment = false } = {}
) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new BusinessError('分录明细不能为空');
  }
  const normalized = items.map((item, index) => {
    const label = `第${index + 1}行`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new BusinessError(`${label}分录格式无效`);
    }
    let accountId;
    let debit;
    let credit;
    try {
      accountId = requirePositiveInteger(item.account_id, `${label}分录科目`);
      debit = new Decimal(normalizeOpeningAmount(item.debit_amount, `${label}借方金额`));
      credit = new Decimal(normalizeOpeningAmount(item.credit_amount, `${label}贷方金额`));
    } catch (error) {
      throw new BusinessError(error.message);
    }
    if (debit.gt(0) && credit.gt(0)) {
      throw new BusinessError(`${label}不能同时填写借方和贷方金额`);
    }
    if (debit.isZero() && credit.isZero()) {
      throw new BusinessError(`${label}借方和贷方金额不能同时为0`);
    }
    // The ledger and all reports are denominated in CNY. An invoice default
    // currency must never silently change the meaning of a journal amount.
    const currencyCode = String(item.currency_code || 'CNY')
      .trim()
      .toUpperCase();
    if (!['CNY', 'USD'].includes(currencyCode)) {
      throw new BusinessError(`${label}币种仅支持人民币 CNY 和美元 USD`);
    }
    const exchangeRate = optionalDecimal(
      optional(item.exchange_rate) && currencyCode === 'CNY' ? 1 : item.exchange_rate,
      `${label}汇率`,
      18,
      8
    );
    if (!exchangeRate || exchangeRate.lte(0)) {
      throw new BusinessError(`${label}必须明确填写大于0的汇率`);
    }
    if (currencyCode === 'CNY' && !exchangeRate.eq(1)) {
      throw new BusinessError(`${label}人民币汇率必须为1`);
    }
    const foreignAmount = optionalDecimal(item.foreign_amount, `${label}原币金额`, 15, 2);
    if (currencyCode === 'USD' && (!foreignAmount || foreignAmount.lte(0))) {
      throw new BusinessError(`${label}美元分录必须明确填写大于0的原币金额`);
    }
    let roundingAdjustment;
    try {
      const raw = optional(item.base_rounding_adjustment) ? 0 : item.base_rounding_adjustment;
      if (!['string', 'number'].includes(typeof raw)) throw new Error();
      roundingAdjustment = new Decimal(raw);
    } catch {
      throw new BusinessError(`${label}本位币舍入差额无效`);
    }
    if (
      !roundingAdjustment.isFinite() ||
      roundingAdjustment.abs().gt('0.01') ||
      roundingAdjustment.decimalPlaces() > 2 ||
      (!roundingAdjustment.isZero() && (!allowFxRoundingAdjustment || currencyCode !== 'USD'))
    ) {
      throw new BusinessError(`${label}本位币舍入差额只允许由外币业务单据生成且不超过0.01`);
    }
    if (
      foreignAmount &&
      !foreignAmount
        .times(exchangeRate)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .plus(roundingAdjustment)
        .eq(debit.plus(credit))
    ) {
      throw new BusinessError(`${label}原币金额×汇率与人民币借贷金额不一致`);
    }
    const employeeId = optionalId(item.employee_id, `${label}员工`);
    const employeeSource = optionalText(item.employee_source, `${label}员工来源`, 20);
    if (employeeSource && !['user', 'hr'].includes(employeeSource)) {
      throw new BusinessError(`${label}员工来源必须为 user 或 hr`);
    }
    if (employeeId && !employeeSource && !allowHistoricalAuxiliaries) {
      throw new BusinessError(`${label}请选择具有明确来源的员工`);
    }
    if (employeeSource && !employeeId) {
      throw new BusinessError(`${label}员工来源必须同时指定员工`);
    }
    return {
      ...item,
      account_id: accountId,
      debit_amount: debit.toNumber(),
      credit_amount: credit.toNumber(),
      currency_code: currencyCode,
      exchange_rate: currencyCode === 'CNY' ? 1 : exchangeRate.toFixed(8),
      foreign_amount: foreignAmount?.toFixed(2) ?? null,
      base_rounding_adjustment: roundingAdjustment.toFixed(2),
      department_id: optionalId(item.department_id, `${label}部门`),
      cost_center_id: optionalId(item.cost_center_id, `${label}成本中心`),
      customer_id: optionalId(item.customer_id, `${label}客户`),
      supplier_id: optionalId(item.supplier_id, `${label}供应商`),
      project_id: optionalId(item.project_id, `${label}项目`),
      project_name: optionalText(item.project_name, `${label}项目名称`, 200),
      employee_id: employeeId,
      employee_source: employeeSource,
      quantity: optionalDecimal(item.quantity, `${label}数量`, 18, 6)?.toFixed(6) ?? null,
      unit_name: optionalText(item.unit_name, `${label}单位`, 50),
      unit_price: optionalDecimal(item.unit_price, `${label}单价`, 18, 6)?.toFixed(6) ?? null,
      settlement_method: optionalText(item.settlement_method, `${label}结算方式`, 50),
      invoice_number: optionalText(item.invoice_number, `${label}发票号`, 100),
    };
  });
  const debit = normalized.reduce((sum, item) => sum.plus(item.debit_amount), new Decimal(0));
  const credit = normalized.reduce((sum, item) => sum.plus(item.credit_amount), new Decimal(0));
  if (
    debit.times(100).gt(Number.MAX_SAFE_INTEGER) ||
    credit.times(100).gt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new BusinessError('凭证合计超出金额范围');
  }
  if (!debit.eq(credit)) {
    throw new BusinessError(`借贷不平衡: 借方 ${debit.toFixed(2)}, 贷方 ${credit.toFixed(2)}`);
  }
  return normalized;
}

async function assertEntryAuxiliaries(
  connection,
  items,
  accounts,
  { allowHistoricalAuxiliaries = false } = {}
) {
  // Only the controlled reversal path may preserve unknown legacy auxiliary
  // values. It holds the original posted voucher lock before using this option.
  if (allowHistoricalAuxiliaries) return;
  const byId = new Map(accounts.map((account) => [Number(account.id), account]));
  const required = [
    ['has_customer', 'customer_id', '客户'],
    ['has_supplier', 'supplier_id', '供应商'],
    ['has_department', 'department_id', '部门'],
    ['has_employee', 'employee_id', '员工'],
    ['has_project', 'project_name', '项目名称'],
  ];
  items.forEach((item, index) => {
    const account = byId.get(item.account_id);
    for (const [flag, field, label] of required) {
      if (Number(account?.[flag]) === 1 && !item[field]) {
        throw new BusinessError(`第${index + 1}行科目要求填写${label}辅助核算`);
      }
    }
  });
  const references = [
    ['department_id', 'departments', 'status = 1', '部门'],
    [
      'cost_center_id',
      'cost_centers',
      'deleted_at IS NULL AND (is_active = 1 OR is_active IS NULL)',
      '成本中心',
    ],
    ['customer_id', 'customers', 'status = 1', '客户'],
    ['supplier_id', 'suppliers', 'status = 1', '供应商'],
    ['employee_id', 'users', 'status = 1', '员工', 'user'],
    ['employee_id', 'hr_employees', "employment_status = 'active'", '员工', 'hr'],
  ];
  for (const [field, table, active, label, source] of references) {
    const ids = [
      ...new Set(
        items
          .filter((item) => !source || item.employee_source === source)
          .map((item) => item[field])
          .filter(Boolean)
      ),
    ].sort((a, b) => a - b);
    if (!ids.length) continue;
    const [rows] = await connection.query(
      `SELECT id FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')}) AND ${active}
       ORDER BY id LOCK IN SHARE MODE`,
      ids
    );
    const available = new Set(rows.map((row) => Number(row.id)));
    if (ids.some((id) => !available.has(id))) {
      throw new BusinessError(`${label}不存在或已停用，请刷新后重新选择`);
    }
  }
}

module.exports = { normalizeEntryMetadata, normalizeEntryItems, assertEntryAuxiliaries };
