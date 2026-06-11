/**
 * finance/helpers.js
 * @description 财务模型公共辅助函数
 *              从 models/finance.js L1-382 提取
 * @date 2026-06-11
 */

function requirePositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || String(value).trim() !== String(parsed)) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return parsed;
}

function toDateString(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function currentDateString() {
  return toDateString(new Date());
}

function normalizeDateInput(value, fieldName) {
  const dateString = toDateString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new Error(`${fieldName}格式必须为YYYY-MM-DD`);
  }

  const [year, month, day] = dateString.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${fieldName}不是有效日期`);
  }

  return dateString;
}

function isClosedFlag(value) {
  return value === true || value === 1 || value === '1';
}

function isActiveFlag(value) {
  return value === true || value === 1 || value === '1';
}

function parseOptionalBoolean(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  if (value === true || value === 1 || value === '1' || value === 'true') return 1;
  if (value === false || value === 0 || value === '0' || value === 'false') return 0;
  throw new Error(`${fieldName} must be true or false`);
}

function isDateWithinPeriod(date, period) {
  const startDate = toDateString(period.start_date);
  const endDate = toDateString(period.end_date);
  return date >= startDate && date <= endDate;
}

function toCents(value) {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function fromCents(cents) {
  return cents / 100;
}

function normalizeOpeningAmount(value, fieldName) {
  const amount = value === undefined || value === null || value === '' ? 0 : Number.parseFloat(value);
  if (!Number.isFinite(amount)) {
    throw new Error(`${fieldName} must be a valid amount`);
  }

  const cents = Math.round(amount * 100);
  if (cents < 0) {
    throw new Error(`${fieldName} cannot be negative`);
  }

  return fromCents(cents);
}

function normalizeOpeningBalanceLine(balanceData, label = 'opening balance') {
  const debit = normalizeOpeningAmount(balanceData.debit, `${label}.debit`);
  const credit = normalizeOpeningAmount(balanceData.credit, `${label}.credit`);

  if (toCents(debit) > 0 && toCents(credit) > 0) {
    throw new Error(`${label} cannot have both debit and credit amounts`);
  }

  return { debit, credit };
}

function normalizeOpeningSourceType(value) {
  return ['manual', 'system', 'import'].includes(value) ? value : 'manual';
}

function serializeOpeningSourceDetails(value) {
  return value ? JSON.stringify(value) : null;
}

function createOpeningBalanceBatchNo() {
  return `OB-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function assertOpeningBalancesEditable(connection) {
  const [[postedEntries]] = await connection.execute(
    'SELECT COUNT(*) AS count FROM gl_entries WHERE COALESCE(is_posted, 0) = 1'
  );
  if (Number(postedEntries.count || 0) > 0) {
    throw new Error('Opening balances are locked after vouchers have been posted; use adjustment entries instead');
  }

  const [[closedPeriods]] = await connection.execute(
    'SELECT COUNT(*) AS count FROM gl_periods WHERE COALESCE(is_closed, 0) = 1'
  );
  if (Number(closedPeriods.count || 0) > 0) {
    throw new Error('Opening balances are locked after any accounting period has been closed');
  }
}

async function assertAccountsAvailableForOpeningBalances(connection, accountIds) {
  const uniqueIds = [...new Set(accountIds.map((id) => Number.parseInt(id, 10)))];
  if (uniqueIds.length === 0) {
    throw new Error('Opening balance list cannot be empty');
  }
  if (uniqueIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error('Opening balance accountId must be a positive integer');
  }

  const placeholders = uniqueIds.map(() => '?').join(',');
  const [accounts] = await connection.execute(
    `SELECT id, is_active FROM gl_accounts WHERE id IN (${placeholders}) FOR UPDATE`,
    uniqueIds
  );
  const activeAccountIds = new Set(
    accounts
      .filter((account) => Number(account.is_active) === 1)
      .map((account) => Number(account.id))
  );
  const missingIds = uniqueIds.filter((id) => !activeAccountIds.has(id));
  if (missingIds.length > 0) {
    throw new Error(`Opening balance accounts do not exist or are inactive: ${missingIds.join(', ')}`);
  }
}

async function assertAccountCanBeDeactivated(connection, accountId) {
  const normalizedAccountId = requirePositiveInteger(accountId, 'accountId');
  const [[usage]] = await connection.execute(
    `SELECT
       COALESCE(MAX(ABS(COALESCE(a.opening_debit, 0)) + ABS(COALESCE(a.opening_credit, 0))), 0) AS opening_amount,
       COUNT(ei.id) AS entry_line_count
     FROM gl_accounts a
     LEFT JOIN gl_entry_items ei ON ei.account_id = a.id
     WHERE a.id = ?`,
    [normalizedAccountId]
  );

  if (Number(usage.opening_amount || 0) > 0 || Number(usage.entry_line_count || 0) > 0) {
    throw new Error('Accounts with opening balances or voucher history cannot be deactivated');
  }
}

function createEmptyPostingDiagnostic(entryId) {
  return {
    entry_id: Number(entryId),
    line_count: 0,
    invalid_account_count: 0,
    invalid_amount_count: 0,
    total_debit: 0,
    total_credit: 0,
    amount_balanced: false,
    posting_ready: false,
    posting_issue: '凭证没有明细，不能过账',
    invalid_lines: [],
  };
}

function buildEntryPostingDiagnostic(entryId, rows) {
  if (!rows.length) {
    return createEmptyPostingDiagnostic(entryId);
  }

  let totalDebitCents = 0;
  let totalCreditCents = 0;
  let postingIssue = null;
  let invalidAccountCount = 0;
  let invalidAmountCount = 0;
  const invalidLines = [];

  rows.forEach((item, index) => {
    const lineLabel = item.line_number || index + 1;
    const accountInvalid =
      !item.account_id || !item.account_exists || !isActiveFlag(item.is_active);
    const debitCents = toCents(item.debit_amount);
    const creditCents = toCents(item.credit_amount);
    let lineIssue = null;

    if (accountInvalid) {
      invalidAccountCount += 1;
      lineIssue = `第${lineLabel}行会计科目不存在或未启用，不能过账`;
    } else if (debitCents < 0 || creditCents < 0) {
      invalidAmountCount += 1;
      lineIssue = `第${lineLabel}行借贷金额不能为负数`;
    } else if (debitCents > 0 && creditCents > 0) {
      invalidAmountCount += 1;
      lineIssue = `第${lineLabel}行不能同时填写借方和贷方金额`;
    } else if (debitCents === 0 && creditCents === 0) {
      invalidAmountCount += 1;
      lineIssue = `第${lineLabel}行借方和贷方金额不能同时为0`;
    }

    if (lineIssue) {
      postingIssue = postingIssue || lineIssue;
      invalidLines.push({
        item_id: item.id,
        line_number: lineLabel,
        account_id: item.account_id,
        account_code: item.account_code,
        account_name: item.account_name,
        issue: lineIssue,
      });
    }

    totalDebitCents += debitCents;
    totalCreditCents += creditCents;
  });

  if (!postingIssue && totalDebitCents !== totalCreditCents) {
    postingIssue = `借贷不平衡: 借方 ${(totalDebitCents / 100).toFixed(2)}, 贷方 ${(totalCreditCents / 100).toFixed(2)}`;
  }

  return {
    entry_id: Number(entryId),
    line_count: rows.length,
    invalid_account_count: invalidAccountCount,
    invalid_amount_count: invalidAmountCount,
    total_debit: totalDebitCents / 100,
    total_credit: totalCreditCents / 100,
    amount_balanced: totalDebitCents === totalCreditCents,
    posting_ready: !postingIssue,
    posting_issue: postingIssue,
    invalid_lines: invalidLines,
  };
}

async function getEntryPostingDiagnostics(connection, entryIds, options = {}) {
  const ids = [...new Set(entryIds.map((id) => Number.parseInt(id, 10)))]
    .filter((id) => Number.isInteger(id) && id > 0);
  const diagnostics = new Map();

  ids.forEach((id) => {
    diagnostics.set(id, createEmptyPostingDiagnostic(id));
  });

  if (ids.length === 0) {
    return diagnostics;
  }

  const placeholders = ids.map(() => '?').join(',');
  const [items] = await connection.execute(
    `SELECT
       ei.id,
       ei.entry_id,
       ei.line_number,
       ei.account_id,
       ei.debit_amount,
       ei.credit_amount,
       CASE WHEN a.id IS NULL THEN 0 ELSE 1 END AS account_exists,
       a.account_code,
       a.account_name,
       a.is_active
     FROM gl_entry_items ei
     LEFT JOIN gl_accounts a ON a.id = ei.account_id
     WHERE ei.entry_id IN (${placeholders})
     ORDER BY ei.entry_id, ei.line_number, ei.id
     ${options.lock ? 'FOR UPDATE' : ''}`,
    ids
  );

  const rowsByEntryId = new Map();
  ids.forEach((id) => rowsByEntryId.set(id, []));
  items.forEach((item) => {
    const itemEntryId = Number(item.entry_id);
    if (!rowsByEntryId.has(itemEntryId)) {
      rowsByEntryId.set(itemEntryId, []);
    }
    rowsByEntryId.get(itemEntryId).push(item);
  });

  ids.forEach((id) => {
    diagnostics.set(id, buildEntryPostingDiagnostic(id, rowsByEntryId.get(id) || []));
  });

  return diagnostics;
}

async function assertEntryCanBePosted(connection, entryId) {
  const normalizedEntryId = requirePositiveInteger(entryId, 'entryId');
  const diagnostics = await getEntryPostingDiagnostics(connection, [normalizedEntryId], {
    lock: true,
  });
  const diagnostic = diagnostics.get(normalizedEntryId) || createEmptyPostingDiagnostic(normalizedEntryId);

  if (!diagnostic.posting_ready) {
    throw new Error(diagnostic.posting_issue || '凭证不满足过账条件');
  }

  return diagnostic;
}

async function resolveOpenPeriodForDates(connection, periodId, entryDate, postingDate) {
  if (periodId) {
    const resolvedPeriodId = requirePositiveInteger(periodId, '会计期间');
    const [periods] = await connection.execute(
      `SELECT id, is_closed, period_name, start_date, end_date
       FROM gl_periods
       WHERE id = ?
       FOR UPDATE`,
      [resolvedPeriodId]
    );

    if (periods.length === 0) {
      throw new Error('会计期间不存在');
    }

    const period = periods[0];
    if (!isDateWithinPeriod(entryDate, period) || !isDateWithinPeriod(postingDate, period)) {
      throw new Error(
        `冲销日期 ${entryDate} 或过账日期 ${postingDate} 不在会计期间[${period.period_name} ${toDateString(period.start_date)} 至 ${toDateString(period.end_date)}]内`
      );
    }

    if (isClosedFlag(period.is_closed)) {
      throw new Error(`不能在已关闭的会计期间[${period.period_name}]冲销凭证`);
    }

    return period;
  }

  const [periods] = await connection.execute(
    `SELECT id, is_closed, period_name, start_date, end_date
     FROM gl_periods
     WHERE ? BETWEEN start_date AND end_date
       AND ? BETWEEN start_date AND end_date
     ORDER BY start_date DESC
     LIMIT 1
     FOR UPDATE`,
    [entryDate, postingDate]
  );

  if (periods.length === 0) {
    throw new Error(`冲销日期 ${entryDate} 和过账日期 ${postingDate} 未匹配到同一个会计期间`);
  }

  if (isClosedFlag(periods[0].is_closed)) {
    throw new Error(`不能在已关闭的会计期间[${periods[0].period_name}]冲销凭证`);
  }

  return periods[0];
}

module.exports = {
  requirePositiveInteger,
  toDateString,
  currentDateString,
  normalizeDateInput,
  isClosedFlag,
  isActiveFlag,
  parseOptionalBoolean,
  isDateWithinPeriod,
  toCents,
  fromCents,
  normalizeOpeningAmount,
  normalizeOpeningBalanceLine,
  normalizeOpeningSourceType,
  serializeOpeningSourceDetails,
  createOpeningBalanceBatchNo,
  assertOpeningBalancesEditable,
  assertAccountsAvailableForOpeningBalances,
  assertAccountCanBeDeactivated,
  createEmptyPostingDiagnostic,
  buildEntryPostingDiagnostic,
  getEntryPostingDiagnostics,
  assertEntryCanBePosted,
  resolveOpenPeriodForDates,
};
