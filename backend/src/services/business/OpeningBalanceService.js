const db = require('../../config/db');
const financeModel = require('../../models/finance');
const { accountingConfig } = require('../../config/accountingConfig');

const EXCLUDED_DOCUMENT_STATUSES = [
  'draft',
  '草稿',
  'void',
  'voided',
  '已作废',
  'cancelled',
  'canceled',
  '已取消',
  'rejected',
  '已驳回',
];

function toCents(value) {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function fromCents(value) {
  return value / 100;
}

function amountParts(netCents) {
  return {
    debit: netCents > 0 ? fromCents(netCents) : 0,
    credit: netCents < 0 ? fromCents(Math.abs(netCents)) : 0,
  };
}

function normalizeBalanceDate(value) {
  const date = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('balanceDate must use YYYY-MM-DD format');
  }

  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error('balanceDate is not a valid date');
  }
  return date;
}

function normalizeManualAmount(value, accountId) {
  const amount = value === undefined || value === null || value === '' ? 0 : Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Manual opening balance must be a non-negative amount: account ${accountId}`);
  }
  return fromCents(toCents(amount));
}

function isDebitAccount(account) {
  return account?.is_debit === true || account?.is_debit === 1 || account?.is_debit === '1';
}

function createSourceLine({ sourceType, sourceLabel, accountKey, accountCode, netAmount, details }) {
  return {
    sourceType,
    sourceLabel,
    accountKey,
    accountCode,
    netCents: toCents(netAmount),
    details,
  };
}

function aggregateSourceLines(lines, accountsByCode) {
  const rows = new Map();
  const warnings = [];

  for (const line of lines) {
    const account = accountsByCode.get(line.accountCode);
    if (!account) {
      if (line.netCents) {
        warnings.push(`系统来源“${line.sourceLabel}”存在余额，但未找到启用的会计科目 ${line.accountCode}`);
      }
      continue;
    }

    const current = rows.get(account.id) || {
      account,
      netCents: 0,
      sourceTypes: new Set(),
      sourceLabels: new Set(),
      details: [],
    };
    current.netCents += line.netCents;
    current.sourceTypes.add(line.sourceType);
    current.sourceLabels.add(line.sourceLabel);
    current.details.push(line.details);
    rows.set(account.id, current);
  }

  return { rows, warnings };
}

async function hasTable(connection, tableName) {
  const [rows] = await connection.execute(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ?
      LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function queryTotal(connection, sql, params = []) {
  const [[row]] = await connection.execute(sql, params);
  return Number.parseFloat(row?.total || 0) || 0;
}

async function getInventoryOpeningValue(connection, balanceDate) {
  if (!(await hasTable(connection, 'inventory_year_end_balances'))) {
    return { amount: 0, available: false, details: { strategy: 'unavailable' }, warning: '库存年度结存表不存在，库存期初无法自动生成' };
  }

  const fiscalYear = Number.parseInt(String(balanceDate).slice(0, 4), 10);
  const currentOpening = await queryTotal(
    connection,
    `SELECT COALESCE(SUM(opening_value), 0) AS total
       FROM inventory_year_end_balances
      WHERE year = ?`,
    [fiscalYear]
  );

  if (toCents(currentOpening) !== 0) {
    return {
      amount: currentOpening,
      available: true,
      details: { strategy: 'current_year_opening', fiscalYear },
    };
  }

  const [[priorYear]] = await connection.execute(
    `SELECT MAX(year) AS year
       FROM inventory_year_end_balances
      WHERE year < ?
        AND COALESCE(is_frozen, 0) = 1`,
    [fiscalYear]
  );

  if (!priorYear?.year) {
    return {
      amount: 0,
      available: false,
      details: { strategy: 'no_frozen_year_end', fiscalYear },
      warning: '没有可用的库存年度冻结结存，库存期初需要先完成库存年结或人工补录',
    };
  }

  const amount = await queryTotal(
    connection,
    `SELECT COALESCE(SUM(closing_value), 0) AS total
       FROM inventory_year_end_balances
      WHERE year = ?
        AND COALESCE(is_frozen, 0) = 1`,
    [priorYear.year]
  );

  return {
    amount,
    available: true,
    details: { strategy: 'prior_frozen_year_end', fiscalYear: Number(priorYear.year) },
  };
}

async function collectSourceLines(connection, balanceDate) {
  await accountingConfig.loadFromDatabase(db);
  const accountCodes = accountingConfig.getAllAccountCodes();
  const lines = [];
  const warnings = [];

  if (await hasTable(connection, 'bank_accounts')) {
    const amount = await queryTotal(
      connection,
      `SELECT COALESCE(SUM(opening_balance), 0) AS total
         FROM bank_accounts
        WHERE COALESCE(is_active, 1) = 1`
    );
    lines.push(createSourceLine({
      sourceType: 'bank_accounts',
      sourceLabel: '资金账户期初',
      accountKey: 'BANK_DEPOSIT',
      accountCode: accountCodes.BANK_DEPOSIT,
      netAmount: amount,
      details: { table: 'bank_accounts', field: 'opening_balance' },
    }));
  } else {
    warnings.push('银行账户表不存在，银行存款期初无法自动生成');
  }

  const excludedPlaceholders = EXCLUDED_DOCUMENT_STATUSES.map(() => '?').join(',');
  if (await hasTable(connection, 'ar_invoices')) {
    const amount = await queryTotal(
      connection,
      `SELECT COALESCE(SUM(balance_amount), 0) AS total
         FROM ar_invoices
        WHERE LOWER(COALESCE(status, '')) NOT IN (${excludedPlaceholders})`,
      EXCLUDED_DOCUMENT_STATUSES
    );
    lines.push(createSourceLine({
      sourceType: 'ar_invoices',
      sourceLabel: '应收未结发票',
      accountKey: 'ACCOUNTS_RECEIVABLE',
      accountCode: accountCodes.ACCOUNTS_RECEIVABLE,
      netAmount: amount,
      details: { table: 'ar_invoices', field: 'balance_amount' },
    }));
  } else {
    warnings.push('应收发票表不存在，应收账款期初无法自动生成');
  }

  if (await hasTable(connection, 'ap_invoices')) {
    const amount = await queryTotal(
      connection,
      `SELECT COALESCE(SUM(balance_amount), 0) AS total
         FROM ap_invoices
        WHERE LOWER(COALESCE(status, '')) NOT IN (${excludedPlaceholders})`,
      EXCLUDED_DOCUMENT_STATUSES
    );
    lines.push(createSourceLine({
      sourceType: 'ap_invoices',
      sourceLabel: '应付未结发票',
      accountKey: 'ACCOUNTS_PAYABLE',
      accountCode: accountCodes.ACCOUNTS_PAYABLE,
      netAmount: -amount,
      details: { table: 'ap_invoices', field: 'balance_amount' },
    }));
  } else {
    warnings.push('应付发票表不存在，应付账款期初无法自动生成');
  }

  const inventory = await getInventoryOpeningValue(connection, balanceDate);
  if (inventory.warning) warnings.push(inventory.warning);
  if (inventory.available) {
    lines.push(createSourceLine({
      sourceType: 'inventory_year_end',
      sourceLabel: '库存年度结存',
      accountKey: 'INVENTORY_GOODS',
      accountCode: accountCodes.INVENTORY_GOODS,
      netAmount: inventory.amount,
      details: inventory.details,
    }));
  }

  if (await hasTable(connection, 'fixed_assets')) {
    const activeAssetFilter = `
      WHERE LOWER(COALESCE(status, '')) NOT IN ('disposed', 'scrapped', 'cancelled', 'canceled', '已处置', '已报废', '已取消')`;
    const acquisitionCost = await queryTotal(
      connection,
      `SELECT COALESCE(SUM(acquisition_cost), 0) AS total FROM fixed_assets ${activeAssetFilter}`
    );
    const accumulatedDepreciation = await queryTotal(
      connection,
      `SELECT COALESCE(SUM(accumulated_depreciation), 0) AS total FROM fixed_assets ${activeAssetFilter}`
    );
    const impairment = await queryTotal(
      connection,
      `SELECT COALESCE(SUM(impairment_amount), 0) AS total FROM fixed_assets ${activeAssetFilter}`
    );

    lines.push(createSourceLine({
      sourceType: 'fixed_assets',
      sourceLabel: '固定资产卡片原值',
      accountKey: 'FIXED_ASSETS',
      accountCode: accountCodes.FIXED_ASSETS,
      netAmount: acquisitionCost,
      details: { table: 'fixed_assets', field: 'acquisition_cost' },
    }));
    lines.push(createSourceLine({
      sourceType: 'fixed_assets',
      sourceLabel: '固定资产累计折旧',
      accountKey: 'ACCUMULATED_DEPRECIATION',
      accountCode: accountCodes.ACCUMULATED_DEPRECIATION,
      netAmount: -accumulatedDepreciation,
      details: { table: 'fixed_assets', field: 'accumulated_depreciation' },
    }));
    lines.push(createSourceLine({
      sourceType: 'fixed_assets',
      sourceLabel: '固定资产减值准备',
      accountKey: 'FIXED_ASSET_IMPAIRMENT_ALLOWANCE',
      accountCode: accountCodes.FIXED_ASSET_IMPAIRMENT_ALLOWANCE,
      netAmount: -impairment,
      details: { table: 'fixed_assets', field: 'impairment_amount' },
    }));
  } else {
    warnings.push('固定资产表不存在，固定资产期初无法自动生成');
  }

  return { lines, warnings };
}

async function getPreview(balanceDate) {
  const normalizedBalanceDate = normalizeBalanceDate(balanceDate);
  const connection = await db.pool.getConnection();
  try {
    const [accounts] = await connection.execute(
      `SELECT id, account_code, account_name, account_type, is_debit,
              opening_debit, opening_credit, opening_balance_date, opening_balance_set,
              opening_source_type, opening_source_details, opening_source_updated_at
         FROM gl_accounts
        WHERE is_active = 1
        ORDER BY account_code`
    );
    const accountsByCode = new Map(accounts.map((account) => [account.account_code, account]));
    const collected = await collectSourceLines(connection, normalizedBalanceDate);
    const aggregated = aggregateSourceLines(collected.lines, accountsByCode);

    let totalDebitCents = 0;
    let totalCreditCents = 0;
    let systemAccountCount = 0;

    const rows = accounts.map((account) => {
      const generated = aggregated.rows.get(account.id);
      const hasSystemSource = Boolean(generated);
      const shouldClearStaleSystemValue = account.opening_source_type === 'system' && !hasSystemSource;
      const currentNetCents = toCents(account.opening_debit) - toCents(account.opening_credit);
      const netCents = hasSystemSource
        ? generated.netCents
        : (shouldClearStaleSystemValue ? 0 : currentNetCents);
      const parts = amountParts(netCents);
      totalDebitCents += toCents(parts.debit);
      totalCreditCents += toCents(parts.credit);
      if (hasSystemSource) systemAccountCount += 1;

      return {
        ...account,
        opening_debit: parts.debit,
        opening_credit: parts.credit,
        opening_amount: fromCents(Math.abs(netCents)),
        opening_direction: hasSystemSource
          ? (netCents < 0 ? 'credit' : 'debit')
          : (isDebitAccount(account) ? 'debit' : 'credit'),
        source_type: hasSystemSource ? 'system' : 'manual',
        source_label: hasSystemSource
          ? [...generated.sourceLabels].join('、')
          : '人工补录',
        source_details: hasSystemSource ? generated.details : null,
        manual_allowed: !hasSystemSource,
      };
    });

    return {
      balanceDate: normalizedBalanceDate,
      rows,
      warnings: [...collected.warnings, ...aggregated.warnings],
      summary: {
        totalDebit: fromCents(totalDebitCents),
        totalCredit: fromCents(totalCreditCents),
        difference: fromCents(Math.abs(totalDebitCents - totalCreditCents)),
        isBalanced: totalDebitCents === totalCreditCents,
        systemAccountCount,
        manualAccountCount: rows.length - systemAccountCount,
      },
    };
  } finally {
    connection.release();
  }
}

async function initialize({ balanceDate, manualBalances, setBy }) {
  const preview = await getPreview(balanceDate);
  const manualByAccountId = new Map(
    (manualBalances || []).map((item) => [Number(item.accountId), item])
  );
  const systemAccountIds = new Set(
    preview.rows.filter((row) => !row.manual_allowed).map((row) => Number(row.id))
  );
  const manualAccountIds = new Set(
    preview.rows.filter((row) => row.manual_allowed).map((row) => Number(row.id))
  );

  for (const accountId of manualByAccountId.keys()) {
    if (systemAccountIds.has(accountId)) {
      throw new Error(`System-generated opening balance cannot be overridden: account ${accountId}`);
    }
    if (!manualAccountIds.has(accountId)) {
      throw new Error(`Opening balance account is not available for manual entry: account ${accountId}`);
    }
  }

  const balances = preview.rows.map((row) => {
    if (!row.manual_allowed) {
      return {
        accountId: row.id,
        debit: row.opening_debit,
        credit: row.opening_credit,
        sourceType: 'system',
        sourceDetails: row.source_details,
      };
    }

    const manual = manualByAccountId.get(Number(row.id));
    const amount = normalizeManualAmount(manual?.amount ?? row.opening_amount, row.id);
    const isDebit = isDebitAccount(row);
    return {
      accountId: row.id,
      debit: isDebit ? amount : 0,
      credit: isDebit ? 0 : amount,
      sourceType: 'manual',
      sourceDetails: manual?.notes ? { notes: String(manual.notes).slice(0, 500) } : null,
    };
  });

  return financeModel.setBatchOpeningBalance(balances, balanceDate, setBy);
}

module.exports = {
  aggregateSourceLines,
  amountParts,
  collectSourceLines,
  createSourceLine,
  getPreview,
  initialize,
  isDebitAccount,
  normalizeBalanceDate,
  normalizeManualAmount,
};
