/**
 * PeriodEndService — helpers methods (mixin)
 * @module periodEnd/helpersMethods
 */

const runtime = require('./runtime');
const {
  db,
  DOCUMENT_TYPE_MAPPING,
  accountingConfig,
} = runtime;


module.exports = {
  roundMoney(value) {
      return Math.round((parseFloat(value) || 0) * 100) / 100;
    },

  /**
     * 未冲销的「原」损益结转凭证条件（正规模型：is_reversed + reversal_entry_id 反查）
     * - 原分录：is_reversed=0 且 没有任何凭证的 reversal_entry_id 指向自己
     * - 冲销分录：存在 source.reversal_entry_id = 本分录.id，不计入
     */
    sqlActiveOriginalClosingEntries(periodIdParam = '?', documentTypeParam = '?') {
      return `period_id = ${periodIdParam}
             AND document_type = ${documentTypeParam}
             AND COALESCE(is_reversed, 0) = 0
             AND NOT EXISTS (
               SELECT 1 FROM gl_entries src
               WHERE src.reversal_entry_id = gl_entries.id
             )`;
    },

  toDateString(value) {
      if (!value) return '';
      if (value instanceof Date) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      return String(value).slice(0, 10);
    },

  normalizeDateInput(value, fieldName) {
      const dateString = this.toDateString(value);
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
    },

  isDateWithinPeriod(date, period) {
      const startDate = this.toDateString(period.start_date);
      const endDate = this.toDateString(period.end_date);
      return date >= startDate && date <= endDate;
    },

  isClosed(value) {
      if (value === true || value === 1 || value === 1n) return true;
      if (Buffer.isBuffer(value)) {
        return value.some((byte) => byte !== 0);
      }
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return normalized === '1' || normalized === 'true' || normalized === 'yes';
      }
      return false;
    },

  async getAccountIdByConfigKey(connection, configKey, accountLabel) {
      await accountingConfig.loadFromDatabase(db);
      const accountCode = accountingConfig.getAccountCode(configKey);
  
      if (!accountCode) {
        throw new Error(`未配置${accountLabel}科目(${configKey})，无法生成期末结转凭证`);
      }
  
      const [accounts] = await connection.execute(
        'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = 1 LIMIT 1',
        [accountCode]
      );
  
      if (accounts.length === 0) {
        throw new Error(`未找到${accountLabel}科目(${accountCode})，无法生成期末结转凭证`);
      }
  
      return accounts[0].id;
    },

  async getIncomeStatementCostCodes() {
      await accountingConfig.loadFromDatabase(db);
      return [
        accountingConfig.getAccountCode('SALES_COST'),
        accountingConfig.getAccountCode('COST_OF_GOODS_SOLD'),
        accountingConfig.getAccountCode('OTHER_COST'),
        '6401',
        '6402',
      ].filter(Boolean);
    },

  /**
     * 生成结转分录编号
     * @returns {string} 分录编号
     */
    async generateTransferEntryNumber(connection = db.pool) {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const prefix = `PL${dateStr}`;
  
      const [result] = await connection.execute(
        `SELECT entry_number
         FROM gl_entries
         WHERE entry_number LIKE ?
         ORDER BY entry_number DESC
         LIMIT 1
         FOR UPDATE`,
        [`${prefix}%`]
      );
  
      const lastSequence = result[0]?.entry_number?.startsWith(prefix)
        ? Number.parseInt(result[0].entry_number.slice(prefix.length), 10) || 0
        : 0;
      const sequence = (lastSequence + 1).toString().padStart(3, '0');
      return `${prefix}${sequence}`;
    },

  /**
     * 生成年度结转分录编号
     * @param {number} year 年度
     * @returns {string} 分录编号
     */
    async generateYearEndEntryNumber(year) {
      // 获取年度结转序号
      const [result] = await db.pool.execute(
        'SELECT COUNT(*) as count FROM gl_entries WHERE document_type = ? AND YEAR(entry_date) = ?',
        [DOCUMENT_TYPE_MAPPING.YEAR_END_TRANSFER, year]
      );
  
      const sequence = (result[0].count + 1).toString().padStart(2, '0');
      return `YE${year}${sequence}`;
    },

  /**
     * 生成分录编号
     */
    async generateEntryNumber(prefix) {
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  
      const [result] = await db.pool.execute(
        'SELECT MAX(entry_number) as max_no FROM gl_entries WHERE entry_number LIKE ?',
        [`${prefix}${dateStr}%`]
      );
  
      const maxNo = result[0].max_no || `${prefix}${dateStr}000`;
      const nextNo = `${prefix}${dateStr}${(parseInt(maxNo.slice(-3)) + 1).toString().padStart(3, '0')}`;
  
      return nextNo;
    },

  /**
     * 获取本年利润科目ID
     */
    async getCurrentYearProfitAccountId(connection) {
      return this.getAccountIdByConfigKey(connection, 'CURRENT_YEAR_PROFIT', '本年利润');
    },

  /**
     * 获取利润分配-未分配利润科目ID
     */
    async getRetainedEarningsAccountId(connection) {
      return this.getAccountIdByConfigKey(connection, 'RETAINED_EARNINGS', '利润分配-未分配利润');
    },
};
