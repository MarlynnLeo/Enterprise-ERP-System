const Precision = require('../../../utils/precision');
const {
  MAX_SOURCE_ROWS,
  VAT_COLUMNS,
  invalid,
  accountTree,
  availableAccounts,
  balanceParts,
  monthList,
  vatColumnFor,
} = require('./helpers');

const sum = (rows, key) =>
  Precision.round(rows.reduce((total, row) => Precision.add(total, row[key] || 0), 0));
const dateString = (value) => (value ? String(value).slice(0, 10) : null);

function selectScopes(type, filters, accounts, codes) {
  const allowed = availableAccounts(type, accounts, codes);
  const selected =
    filters.accountId && allowed.find((account) => Number(account.id) === filters.accountId);
  if (filters.accountId && !selected) throw invalid('所选科目不属于当前账簿，请重新选择');
  if (selected) {
    const children = accountTree(allowed, selected);
    const includePending = type === 'vat' && selected.account_code === codes.VAT_PAYABLE;
    return [{ account: selected, accounts: includePending ? allowed : children }];
  }
  if (type === 'general') {
    const ids = new Set(accounts.map((account) => Number(account.id)));
    return accounts
      .filter((account) => !account.parent_id || !ids.has(Number(account.parent_id)))
      .map((account) => ({ account, accounts: accountTree(accounts, account) }));
  }
  if (!allowed.length) return [];
  const rootCode = codes[{ cash: 'CASH', payable: 'ACCOUNTS_PAYABLE', vat: 'VAT_PAYABLE' }[type]];
  return [
    {
      account: allowed.find((account) => account.account_code === rootCode) || allowed[0],
      accounts: allowed,
    },
  ];
}

async function loadGlData(connection, accountIds, filters) {
  if (!accountIds.length) return { beforeYear: [], beforePeriod: [], entries: [] };
  const placeholders = accountIds.map(() => '?').join(',');
  const supplierFilter = filters.supplierId ? ' AND i.supplier_id = ?' : '';
  const supplierParams = filters.supplierId ? [filters.supplierId] : [];
  const [beforeYear] = await connection.execute(
    `SELECT i.account_id, COALESCE(SUM(i.debit_amount), 0) AS debit,
            COALESCE(SUM(i.credit_amount), 0) AS credit
       FROM gl_entry_items i JOIN gl_entries e ON e.id = i.entry_id
      WHERE e.is_posted = 1 AND e.entry_date < ? AND i.account_id IN (${placeholders})${supplierFilter}
      GROUP BY i.account_id`,
    [filters.yearStartDate, ...accountIds, ...supplierParams]
  );
  // Earlier months only contribute to opening/YTD. Do not load their individual
  // vouchers or let them consume the selected period's detail limit.
  const [beforePeriod] = await connection.execute(
    `SELECT i.account_id, COALESCE(SUM(i.debit_amount), 0) AS debit,
            COALESCE(SUM(i.credit_amount), 0) AS credit
       FROM gl_entry_items i JOIN gl_entries e ON e.id = i.entry_id
      WHERE e.is_posted = 1 AND e.entry_date >= ? AND e.entry_date < ?
        AND i.account_id IN (${placeholders})${supplierFilter}
      GROUP BY i.account_id`,
    [filters.yearStartDate, filters.startDate, ...accountIds, ...supplierParams]
  );
  const [entries] = await connection.execute(
    `SELECT i.id, i.account_id, i.supplier_id, i.debit_amount AS debit,
            i.credit_amount AS credit, COALESCE(NULLIF(i.description, ''), e.description, '') AS description,
            e.id AS entry_id, DATE_FORMAT(e.entry_date, '%Y-%m-%d') AS date,
            e.entry_number, e.voucher_word, e.voucher_number, s.name AS supplier_name
       FROM gl_entry_items i JOIN gl_entries e ON e.id = i.entry_id
       LEFT JOIN suppliers s ON s.id = i.supplier_id
      WHERE e.is_posted = 1 AND e.entry_date >= ? AND e.entry_date <= ?
        AND i.account_id IN (${placeholders})${supplierFilter}
      ORDER BY e.entry_date, e.id, i.line_number, i.id LIMIT ${MAX_SOURCE_ROWS + 1}`,
    [filters.startDate, filters.endDate, ...accountIds, ...supplierParams]
  );
  if (entries.length > MAX_SOURCE_ROWS) {
    throw invalid(`查询涉及超过 ${MAX_SOURCE_ROWS} 条凭证明细，请缩小科目或期间范围后重试`);
  }
  return { beforeYear, beforePeriod, entries };
}

function buildGlReport(type, filters, scopes, data, codes) {
  const warnings = [];
  const openingWarnings = new Map();
  const rows = [];
  const summary = {
    openingBalance: 0,
    totalDebit: 0,
    totalCredit: 0,
    closingBalance: 0,
    groupCount: 0,
    entryCount: 0,
  };
  const months = monthList(filters);
  const taxKeys = [...VAT_COLUMNS.map((column) => column.key), 'unclassifiedTax'];
  const emptyTax = () => (type === 'vat' ? Object.fromEntries(taxKeys.map((key) => [key, 0])) : {});
  for (const scope of scopes) {
    const byId = new Map(scope.accounts.map((account) => [Number(account.id), account]));
    const ids = new Set(byId.keys());
    const openingAccounts = scope.accounts.filter(
      (account) =>
        (!account.opening_balance_date ||
          dateString(account.opening_balance_date) <= filters.endDate) &&
        (Number(account.opening_debit) || Number(account.opening_credit))
    );
    const missingSupplierOpening = Boolean(filters.supplierId && openingAccounts.length);
    if (missingSupplierOpening) {
      warnings.push(
        '科目期初余额未保存供应商分项，当前供应商的期初和结存余额无法核实；余额留空，借贷发生额仍按已过账凭证列示。'
      );
    }
    const seedNet = (list) =>
      Precision.sub(sum(list, 'opening_debit'), sum(list, 'opening_credit'));
    const initialSeeds = openingAccounts.filter(
      (account) =>
        !account.opening_balance_date ||
        dateString(account.opening_balance_date) <= filters.startDate
    );
    const laterSeeds = openingAccounts.filter(
      (account) => dateString(account.opening_balance_date) > filters.startDate
    );
    const firstDate = openingAccounts
      .map((account) => dateString(account.opening_balance_date))
      .filter(Boolean)
      .sort()[0];
    if (firstDate && firstDate > filters.yearStartDate) {
      if (!openingWarnings.has(firstDate)) openingWarnings.set(firstDate, new Set());
      openingWarnings.get(firstDate).add(scope.account.account_code);
    }
    const sourceEntries = [
      ...(data.beforePeriod || []).map((entry) => ({ ...entry, date: filters.yearStartDate })),
      ...data.entries,
    ];
    const scopeEntries = sourceEntries
      .filter((entry) => ids.has(Number(entry.account_id)))
      .map((entry) => {
        const account = byId.get(Number(entry.account_id));
        const row = {
          ...entry,
          date: dateString(entry.date),
          debit: Number(entry.debit || 0),
          credit: Number(entry.credit || 0),
          accountCode: account.account_code,
          accountName: account.account_name,
          supplierName:
            entry.supplier_name || (entry.supplier_id ? '供应商资料已移除' : '未指定供应商'),
          entryId: Number(entry.entry_id),
          voucherNumber:
            entry.voucher_number != null
              ? `${entry.voucher_word || '记'}-${entry.voucher_number}`
              : entry.entry_number,
          ...emptyTax(),
        };
        if (type === 'vat') {
          const column = vatColumnFor(account, codes);
          if (column)
            row[column.key] = Precision.sub(
              row[column.side],
              row[column.side === 'debit' ? 'credit' : 'debit']
            );
          else {
            row.unclassifiedTax = Precision.sub(row.debit, row.credit);
            warnings.push(
              `科目 ${account.account_code} ${account.account_name} 列入“其他明细（借减贷）”，未自动归入标准税额栏。`
            );
          }
        }
        return row;
      });
    const prior = data.beforeYear.filter((entry) => ids.has(Number(entry.account_id)));
    const beforeStart = scopeEntries.filter((entry) => entry.date < filters.startDate);
    let balance = missingSupplierOpening
      ? null
      : Precision.add(
          seedNet(initialSeeds),
          Precision.sub(sum(prior, 'debit'), sum(prior, 'credit')),
          Precision.sub(sum(beforeStart, 'debit'), sum(beforeStart, 'credit'))
        );
    const openingBalance = balance;
    const inPeriod = scopeEntries.filter((entry) => entry.date >= filters.startDate);
    // A selected zero account still has a useful opening/subtotal view. Unused roots do not fill the report.
    if (!filters.accountId && !openingAccounts.length && !prior.length && !scopeEntries.length)
      continue;
    const common = {
      accountCode: scope.account.account_code,
      accountName: scope.account.account_name,
      supplierName: filters.supplierName || '',
    };
    const makeRow = (row) => ({
      ...common,
      date: '',
      period: '',
      voucherNumber: '',
      description: '',
      debit: 0,
      credit: 0,
      ...emptyTax(),
      ...row,
      ...balanceParts(balance),
    });
    rows.push(
      makeRow({
        rowType: 'opening',
        date: filters.startDate,
        period: filters.startMonth,
        description: '期初余额',
      })
    );
    const monthly = new Map();
    for (const entry of scopeEntries) {
      const period = entry.date.slice(0, 7);
      if (!monthly.has(period)) monthly.set(period, []);
      monthly.get(period).push(entry);
    }
    for (const month of months) {
      const current = monthly.get(month) || [];
      let displayEntries = current;
      if (type === 'vat') {
        const vouchers = new Map();
        for (const entry of current) {
          let voucher = vouchers.get(entry.entryId);
          if (!voucher) {
            voucher = { ...entry, debit: 0, credit: 0, ...emptyTax(), descriptions: new Set() };
            vouchers.set(entry.entryId, voucher);
          }
          voucher.debit = Precision.add(voucher.debit, entry.debit);
          voucher.credit = Precision.add(voucher.credit, entry.credit);
          for (const key of taxKeys) voucher[key] = Precision.add(voucher[key], entry[key]);
          voucher.descriptions.add(entry.description);
        }
        displayEntries = [...vouchers.values()].map(({ descriptions, ...entry }) => ({
          ...entry,
          description: [...descriptions].filter(Boolean).join('；'),
        }));
      }
      const events = [
        ...displayEntries.map((entry) => ({ ...entry, rowType: 'entry' })),
        ...laterSeeds
          .filter((account) => dateString(account.opening_balance_date).startsWith(month))
          .map((account) => ({
            rowType: 'opening',
            date: dateString(account.opening_balance_date),
            description: `${account.account_code} ${account.account_name} 期初余额启用`,
            seed: seedNet([account]),
            debit: 0,
            credit: 0,
          })),
      ].sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          (a.rowType === 'opening'
            ? -1
            : b.rowType === 'opening'
              ? 1
              : a.entryId - b.entryId || a.id - b.id)
      );
      for (const event of events) {
        if (balance !== null)
          balance = Precision.add(
            balance,
            event.seed || 0,
            Precision.sub(event.debit, event.credit)
          );
        if (type !== 'general' || event.rowType === 'opening') {
          rows.push(makeRow({ ...event, period: month }));
        }
      }
      const totals = { debit: sum(current, 'debit'), credit: sum(current, 'credit') };
      if (type === 'vat') for (const key of taxKeys) totals[key] = sum(current, key);
      rows.push(
        makeRow({ ...totals, rowType: 'subtotal', period: month, description: `${month} 本期合计` })
      );
      const yearEntries = scopeEntries.filter(
        (entry) => entry.date.slice(0, 4) === month.slice(0, 4) && entry.date.slice(0, 7) <= month
      );
      const cumulative = { debit: sum(yearEntries, 'debit'), credit: sum(yearEntries, 'credit') };
      if (type === 'vat') for (const key of taxKeys) cumulative[key] = sum(yearEntries, key);
      rows.push(
        makeRow({
          ...cumulative,
          rowType: 'cumulative',
          period: month,
          description: `${month} 本年累计`,
        })
      );
    }
    summary.openingBalance =
      summary.openingBalance === null || openingBalance === null
        ? null
        : Precision.add(summary.openingBalance, openingBalance);
    summary.closingBalance =
      summary.closingBalance === null || balance === null
        ? null
        : Precision.add(summary.closingBalance, balance);
    summary.totalDebit = Precision.add(summary.totalDebit, sum(inPeriod, 'debit'));
    summary.totalCredit = Precision.add(summary.totalCredit, sum(inPeriod, 'credit'));
    summary.entryCount += inPeriod.length;
    summary.groupCount += 1;
  }
  for (const [date, accountCodes] of openingWarnings) {
    const codes = [...accountCodes];
    const subject = codes.length === 1 ? `科目 ${codes[0]} ` : `${codes.length} 个科目`;
    const details =
      codes.length > 1
        ? ` 科目：${codes.slice(0, 6).join('、')}${codes.length > 6 ? `等（共 ${codes.length} 个）` : ''}。`
        : '';
    warnings.push(
      `${subject}的期初余额自 ${date} 启用；此前发生额仅包含系统已过账记录，本年累计不含导入期初余额。${details}`
    );
  }
  if (type === 'vat')
    warnings.push(
      '借方税额栏按借减贷、贷方税额栏按贷减借列示；相反方向发生额以负数显示，同一凭证合并列示。'
    );
  return {
    rows,
    summary,
    warnings: [...new Set(warnings)],
    source: '已过账总账凭证及会计科目期初余额（凭证记账金额口径）',
  };
}

async function getGlLedger(connection, type, filters, context) {
  const scopes = selectScopes(type, filters, context.accounts, context.accountCodes);
  const ids = [
    ...new Set(scopes.flatMap((scope) => scope.accounts.map((account) => Number(account.id)))),
  ];
  const data = await loadGlData(connection, ids, filters);
  const report = buildGlReport(type, filters, scopes, data, context.accountCodes);
  if (type === 'vat' && scopes.length) {
    const mainTree = new Set(
      accountTree(context.accounts, scopes[0].account).map((account) => Number(account.id))
    );
    const additional = scopes[0].accounts.filter((account) => !mainTree.has(Number(account.id)));
    if (additional.length) {
      report.warnings.push(
        `本表同时包含独立核算科目：${additional.map((account) => `${account.account_code} ${account.account_name}`).join('、')}；余额为所列科目合计。`
      );
    }
  }
  if (!scopes.length) report.warnings.push('尚未配置此账簿对应的会计科目，请先完善会计科目设置。');
  return {
    ...report,
    filters: {
      accountName:
        scopes.length === 1
          ? `${scopes[0].account.account_code} ${scopes[0].account.account_name}`
          : '全部一级科目',
      ...filters,
    },
  };
}

module.exports = { selectScopes, loadGlData, buildGlReport, getGlLedger };
