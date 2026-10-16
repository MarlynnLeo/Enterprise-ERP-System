const db = require('../../config/db');
const { accountingConfig } = require('../../config/accountingConfig');
const { getGlLedger } = require('./financialLedgers/glMethods');
const { getQuantityLedger } = require('./financialLedgers/quantityMethods');
const {
  REPORT_TITLES,
  invalid,
  validateType,
  normalizeFilters,
  availableAccounts,
  columnsFor,
} = require('./financialLedgers/helpers');

async function loadAccounts(connection) {
  const [accounts] = await connection.execute(
    `SELECT id, account_code, account_name, parent_id, is_debit, is_active, currency_code,
            opening_debit, opening_credit, DATE_FORMAT(opening_balance_date, '%Y-%m-%d') AS opening_balance_date
       FROM gl_accounts ORDER BY account_code`
  );
  return accounts;
}

async function loadContext(connection) {
  return {
    accounts: await loadAccounts(connection),
    accountCodes: accountingConfig.getAllAccountCodes(),
  };
}

function paginateReport(report, filters) {
  if (report.rows.length > 30000) throw invalid('报表超过 30000 行，请缩小筛选范围后重试');
  const total = report.rows.length;
  const offset = (filters.page - 1) * filters.pageSize;
  return {
    ...report,
    rows: filters.exportAll ? report.rows : report.rows.slice(offset, offset + filters.pageSize),
    pagination: {
      page: filters.exportAll ? 1 : filters.page,
      pageSize: filters.exportAll ? total : filters.pageSize,
      total,
    },
  };
}

class FinancialLedgerService {
  static async getLedger(type, query = {}) {
    const filters = normalizeFilters(type, query);
    await accountingConfig.loadFromDatabase(db);
    const connection = await db.pool.getConnection();
    let started = false;
    try {
      await connection.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      started = true;
      const context = await loadContext(connection);
      const [organization] = await connection.execute(
        'SELECT `value` FROM system_settings WHERE `key` = ? LIMIT 1',
        ['company_name']
      );
      filters.organizationName = organization[0]?.value || '';
      filters.currencyLabel = '记账本位币';
      if (filters.supplierId) {
        const [suppliers] = await connection.execute(
          'SELECT id, code, name FROM suppliers WHERE id = ?',
          [filters.supplierId]
        );
        if (!suppliers.length) throw invalid('所选供应商不存在，请重新选择');
        filters.supplierName = `${suppliers[0].code} ${suppliers[0].name}`;
      }
      const report =
        type === 'quantity'
          ? await getQuantityLedger(connection, filters, context)
          : await getGlLedger(connection, type, filters, context);
      const result = paginateReport(
        {
          ...report,
          type,
          title: REPORT_TITLES[type],
          columns: columnsFor(type),
          organizationName: filters.organizationName,
          filters: { ...filters, ...report.filters },
          warnings: [...new Set(report.warnings || [])],
        },
        filters
      );
      await connection.commit();
      return result;
    } catch (error) {
      if (started) await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getOptions(query = {}) {
    const type = validateType(String(query.type || 'general'));
    const keyword = String(query.keyword || '').trim();
    if (keyword.length > 100) throw invalid('搜索内容最多 100 个字符');
    await accountingConfig.loadFromDatabase(db);
    const connection = await db.pool.getConnection();
    try {
      const context = await loadContext(connection);
      const accountOptions = availableAccounts(type, context.accounts, context.accountCodes)
        .filter((account) =>
          `${account.account_code} ${account.account_name}`
            .toLowerCase()
            .includes(keyword.toLowerCase())
        )
        .slice(0, 100)
        .map((account) => ({
          id: account.id,
          code: account.account_code,
          name: account.account_name,
        }));
      const options = { accountOptions, supplierOptions: [], materialOptions: [] };
      if (type === 'payable' || type === 'quantity') {
        const table = type === 'payable' ? 'suppliers' : 'materials';
        const [rows] = await connection.execute(
          `SELECT id, code, name FROM ${table} WHERE code LIKE ? OR name LIKE ? ORDER BY code, id LIMIT 100`,
          [`%${keyword}%`, `%${keyword}%`]
        );
        options[type === 'payable' ? 'supplierOptions' : 'materialOptions'] = rows;
      }
      return options;
    } finally {
      connection.release();
    }
  }
}

module.exports = FinancialLedgerService;
module.exports.paginateReport = paginateReport;
