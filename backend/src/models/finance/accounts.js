/**
 * finance/accounts.js
 * @description 总账科目相关方法
 *              从 models/finance.js L384-810 提取
 * @date 2026-06-11
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');
const { financeConfig } = require('../../config/financeConfig');
const { parsePagination } = require('../../utils/safePagination');
const {
  requirePositiveInteger,
  normalizeDateInput,
  currentDateString,
  toCents,
  fromCents,
  normalizeOpeningBalanceLine,
  normalizeOpeningSourceType,
  serializeOpeningSourceDetails,
  createOpeningBalanceBatchNo,
  assertOpeningBalancesEditable,
  assertAccountsAvailableForOpeningBalances,
  assertAccountCanBeDeactivated,
} = require('./helpers');

module.exports = {
  /**
   * 获取所有会计科目
   */
  getAllAccounts: async () => {
    try {
      const [accounts] = await db.pool.execute('SELECT id, account_code, account_name, account_type, parent_id, is_debit, is_active, currency_code, description, created_at, updated_at, type, opening_debit, opening_credit, opening_balance_date, opening_balance_set, opening_source_type, opening_source_details, opening_source_updated_at, has_customer, has_supplier, has_employee, has_department, has_project FROM gl_accounts ORDER BY account_code');
      return accounts;
    } catch (error) {
      logger.error('获取会计科目失败:', error);
      throw error;
    }
  },

  /**
   * 获取会计科目列表（支持分页和搜索）
   */
  getAccountsList: async (filters = {}, page = 1, limit = 20) => {
    try {
      const safeFilters = filters || {};
      let whereClause = 'WHERE 1=1';
      const params = [];

      if (safeFilters.account_code) {
        whereClause += ' AND account_code LIKE ?';
        params.push(`%${safeFilters.account_code}%`);
      }

      if (safeFilters.account_name) {
        whereClause += ' AND account_name LIKE ?';
        params.push(`%${safeFilters.account_name}%`);
      }

      if (safeFilters.account_type) {
        whereClause += ' AND account_type = ?';
        params.push(safeFilters.account_type);
      }

      const countQuery = `SELECT COUNT(*) as total FROM gl_accounts ${whereClause}`;
      const [countResult] = await db.pool.query(countQuery, params);
      const total = countResult[0].total;

      const pagination = parsePagination(page, limit, {
        defaultPageSize: 20,
        maxPageSize: 100,
      });
      const pageNum = pagination.page;
      const limitNum = pagination.limit;
      const offset = pagination.offset;

      if (isNaN(pageNum) || isNaN(limitNum) || isNaN(offset)) {
        throw new Error('Invalid pagination parameters');
      }

      const dataQuery = `
        SELECT id, account_code, account_name, account_type, parent_id, is_debit, is_active, currency_code, description, created_at, updated_at, type, opening_debit, opening_credit, opening_balance_date, opening_balance_set, opening_source_type, opening_source_details, opening_source_updated_at, has_customer, has_supplier, has_employee, has_department, has_project FROM gl_accounts
        ${whereClause}
        ORDER BY account_code
        LIMIT ${limitNum} OFFSET ${offset}
      `;
      const [accounts] = await db.pool.query(dataQuery, params);

      return {
        accounts,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      };
    } catch (error) {
      logger.error('获取会计科目列表失败:', error);
      throw error;
    }
  },

  /**
   * 按ID获取会计科目
   */
  getAccountById: async (id) => {
    try {
      const [accounts] = await db.pool.execute('SELECT id, account_code, account_name, account_type, parent_id, is_debit, is_active, currency_code, description, created_at, updated_at, type, opening_debit, opening_credit, opening_balance_date, opening_balance_set, opening_source_type, opening_source_details, opening_source_updated_at, has_customer, has_supplier, has_employee, has_department, has_project FROM gl_accounts WHERE id = ?', [id]);
      return accounts.length > 0 ? accounts[0] : null;
    } catch (error) {
      logger.error('按ID获取会计科目失败:', error);
      throw error;
    }
  },

  /**
   * 创建会计科目
   */
  createAccount: async (accountData) => {
    try {
      const { financeConfig } = require('../../config/financeConfig');
      await financeConfig.loadFromDatabase(db);

      const [result] = await db.pool.execute(
        'INSERT INTO gl_accounts (account_code, account_name, account_type, parent_id, is_debit, is_active, currency_code, description, has_customer, has_supplier, has_employee, has_department, has_project) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          accountData.account_code,
          accountData.account_name,
          accountData.account_type,
          accountData.parent_id || null,
          accountData.is_debit,
          accountData.is_active !== undefined
            ? accountData.is_active
            : financeConfig.get('account.defaultIsActive', true),
          accountData.currency_code || financeConfig.get('account.defaultCurrency', 'CNY'),
          accountData.description || null,
          accountData.has_customer ? 1 : 0,
          accountData.has_supplier ? 1 : 0,
          accountData.has_employee ? 1 : 0,
          accountData.has_department ? 1 : 0,
          accountData.has_project ? 1 : 0,
        ]
      );
      return result.insertId;
    } catch (error) {
      logger.error('创建会计科目失败:', error);
      throw error;
    }
  },

  /**
   * 更新会计科目
   */
  updateAccount: async (id, accountData) => {
    try {
      if (accountData.is_active === false || accountData.is_active === 0 || accountData.is_active === '0') {
        await assertAccountCanBeDeactivated(db.pool, id);
      }
      const [result] = await db.pool.execute(
        'UPDATE gl_accounts SET account_name = ?, account_type = ?, parent_id = ?, is_debit = ?, is_active = ?, currency_code = ?, description = ?, has_customer = ?, has_supplier = ?, has_employee = ?, has_department = ?, has_project = ? WHERE id = ?',
        [
          accountData.account_name,
          accountData.account_type,
          accountData.parent_id || null,
          accountData.is_debit,
          accountData.is_active !== undefined ? accountData.is_active : true,
          accountData.currency_code || financeConfig.get('account.defaultCurrency', 'CNY'),
          accountData.description || null,
          accountData.has_customer ? 1 : 0,
          accountData.has_supplier ? 1 : 0,
          accountData.has_employee ? 1 : 0,
          accountData.has_department ? 1 : 0,
          accountData.has_project ? 1 : 0,
          id,
        ]
      );
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('更新会计科目失败:', error);
      throw error;
    }
  },

  /**
   * 删除会计科目（软删除，设置为非活跃）
   */
  deactivateAccount: async (id) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      await assertAccountCanBeDeactivated(connection, id);
      const [result] = await connection.execute(
        'UPDATE gl_accounts SET is_active = false WHERE id = ?',
        [id]
      );
      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      logger.error('停用会计科目失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 更新会计科目状态
   */
  updateAccountStatus: async (id, isActive) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      if (!isActive) {
        await assertAccountCanBeDeactivated(connection, id);
      }
      const [result] = await connection.execute('UPDATE gl_accounts SET is_active = ? WHERE id = ?', [
        isActive,
        id,
      ]);
      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      logger.error('更新会计科目状态失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 设置期初余额
   */
  setOpeningBalance: async (accountId, balanceData) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const setBy = requirePositiveInteger(balanceData.setBy, 'setBy');
      const normalizedAccountId = requirePositiveInteger(accountId, 'accountId');
      const normalized = normalizeOpeningBalanceLine(balanceData);
      const balanceDate = normalizeDateInput(
        balanceData.balanceDate || currentDateString(),
        'balanceDate'
      );
      const sourceType = normalizeOpeningSourceType(balanceData.sourceType);
      const sourceDetails = serializeOpeningSourceDetails(balanceData.sourceDetails);

      await assertOpeningBalancesEditable(connection);
      await assertAccountsAvailableForOpeningBalances(connection, [normalizedAccountId]);

      await connection.execute(
        `UPDATE gl_accounts SET
          opening_debit = ?,
          opening_credit = ?,
          opening_balance_date = ?,
          opening_balance_set = 1,
          opening_source_type = ?,
          opening_source_details = ?,
          opening_source_updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          normalized.debit,
          normalized.credit,
          balanceDate,
          sourceType,
          sourceDetails,
          normalizedAccountId,
        ]
      );

      const [[openingTotals]] = await connection.execute(
        `SELECT
           COALESCE(SUM(opening_debit), 0) AS total_debit,
           COALESCE(SUM(opening_credit), 0) AS total_credit
         FROM gl_accounts
         WHERE is_active = 1`
      );
      if (toCents(openingTotals.total_debit) !== toCents(openingTotals.total_credit)) {
        throw new Error('Opening balances must remain balanced after saving');
      }

      await connection.execute(
        `INSERT INTO gl_opening_balance_history
          (account_id, batch_no, opening_debit, opening_credit, balance_date, set_by, notes, source_type, source_details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          normalizedAccountId,
          createOpeningBalanceBatchNo(),
          normalized.debit,
          normalized.credit,
          balanceDate,
          setBy,
          balanceData.notes || '设置期初余额',
          sourceType,
          sourceDetails,
        ]
      );

      await connection.commit();
      logger.info(`期初余额设置成功: 科目ID=${normalizedAccountId}`);
      return { success: true };
    } catch (error) {
      await connection.rollback();
      logger.error('设置期初余额失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 批量设置期初余额
   */
  setBatchOpeningBalance: async (balances, balanceDate, setBy = null) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      if (!Array.isArray(balances) || balances.length === 0) {
        throw new Error('Opening balance list cannot be empty');
      }

      const normalizedBalanceDate = normalizeDateInput(
        balanceDate || currentDateString(),
        'balanceDate'
      );
      const normalizedSetBy = setBy ? requirePositiveInteger(setBy, 'setBy') : null;
      const batchNo = createOpeningBalanceBatchNo();
      const accountIds = balances.map((item) => item.accountId);
      const uniqueAccountIds = new Set(accountIds.map((id) => Number.parseInt(id, 10)));
      if (uniqueAccountIds.size !== accountIds.length) {
        throw new Error('Opening balance list contains duplicate accounts');
      }

      await assertOpeningBalancesEditable(connection);
      await assertAccountsAvailableForOpeningBalances(connection, accountIds);

      const normalizedBalances = balances.map((item, index) => {
        const accountId = requirePositiveInteger(item.accountId, `balances[${index}].accountId`);
        return {
          accountId,
          ...normalizeOpeningBalanceLine(item, `balances[${index}]`),
          sourceType: normalizeOpeningSourceType(item.sourceType),
          sourceDetails: serializeOpeningSourceDetails(item.sourceDetails),
        };
      });

      const totalDebit = normalizedBalances.reduce((sum, item) => sum + toCents(item.debit), 0);
      const totalCredit = normalizedBalances.reduce((sum, item) => sum + toCents(item.credit), 0);
      if (totalDebit !== totalCredit) {
        throw new Error(
          `Opening balances are not balanced: debit ${fromCents(totalDebit).toFixed(2)}, credit ${fromCents(totalCredit).toFixed(2)}`
        );
      }

      for (const item of normalizedBalances) {
        await connection.execute(
          `UPDATE gl_accounts SET
            opening_debit = ?,
            opening_credit = ?,
            opening_balance_date = ?,
            opening_balance_set = 1,
            opening_source_type = ?,
            opening_source_details = ?,
            opening_source_updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
          [
            item.debit,
            item.credit,
            normalizedBalanceDate,
            item.sourceType,
            item.sourceDetails,
            item.accountId,
          ]
        );

        await connection.execute(
          `INSERT INTO gl_opening_balance_history
            (account_id, batch_no, opening_debit, opening_credit, balance_date, set_by, notes, source_type, source_details)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.accountId,
            batchNo,
            item.debit,
            item.credit,
            normalizedBalanceDate,
            normalizedSetBy,
            '批量设置期初余额',
            item.sourceType,
            item.sourceDetails,
          ]
        );
      }

      const [[openingTotals]] = await connection.execute(
        `SELECT
           COALESCE(SUM(opening_debit), 0) AS total_debit,
           COALESCE(SUM(opening_credit), 0) AS total_credit
         FROM gl_accounts
         WHERE is_active = 1`
      );
      if (toCents(openingTotals.total_debit) !== toCents(openingTotals.total_credit)) {
        throw new Error('Opening balances must remain balanced after batch saving');
      }

      await connection.commit();
      logger.info(`批量期初余额设置成功: ${normalizedBalances.length}个科目`);
      return { success: true, count: normalizedBalances.length };
    } catch (error) {
      await connection.rollback();
      logger.error('批量设置期初余额失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 获取期初余额列表
   */
  getOpeningBalances: async () => {
    try {
      const [accounts] = await db.pool.execute(`
        SELECT id, account_code, account_name, account_type, is_debit,
          opening_debit, opening_credit, opening_balance_date, opening_balance_set,
          opening_source_type, opening_source_details, opening_source_updated_at
        FROM gl_accounts
        WHERE is_active = 1
        ORDER BY account_code
      `);
      return accounts;
    } catch (error) {
      logger.error('获取期初余额列表失败:', error);
      throw error;
    }
  },
};
