/**
 * cash/Account.js
 * @description 银行账户管理模型
 * @date 2026-01-23
 * @version 1.0.0
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');
const { financeConfig } = require('../../config/financeConfig');

class BankAccountModel {
  /**
   * 创建银行账户
   */
  static async createBankAccount(accountData) {
    try {
      logger.info(
        `[银行账户] 开始创建银行账户: ${accountData.account_name} (${accountData.account_number})`
      );

      const [result] = await db.pool.execute(
        `INSERT INTO bank_accounts
        (account_number, account_name, bank_name, branch_name,
         currency_code, current_balance, opening_balance, account_type, is_active,
         contact_person, contact_phone, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          accountData.account_number,
          accountData.account_name,
          accountData.bank_name,
          accountData.branch_name || null,
          accountData.currency_code || financeConfig.get('account.defaultCurrency', 'CNY'),
          accountData.current_balance || 0,
          accountData.opening_balance ?? accountData.current_balance ?? 0,
          accountData.account_type || '活期',
          accountData.is_active !== undefined ? accountData.is_active : true,
          accountData.contact_person || null,
          accountData.contact_phone || null,
          accountData.notes || null,
          accountData.created_by || null,
        ]
      );

      logger.info(`[银行账户] 银行账户创建成功，ID: ${result.insertId}`);
      return result.insertId;
    } catch (error) {
      logger.error('[银行账户] 创建银行账户失败:', {
        accountData,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * 按ID获取银行账户
   */
  static async getBankAccountById(id) {
    try {
      const [accounts] = await db.pool.execute('SELECT * FROM bank_accounts WHERE id = ?', [id]);
      return accounts.length > 0 ? accounts[0] : null;
    } catch (error) {
      logger.error('获取银行账户失败:', error);
      throw error;
    }
  }

  /**
   * 获取银行账户列表（支持数据库级分页）
   * @param {Object} filters - 过滤条件
   * @param {number} [filters.page] - 页码（从1开始）
   * @param {number} [filters.pageSize] - 每页条数
   */
  static async getBankAccounts(filters = {}) {
    try {
      let whereClause = ' WHERE 1=1';
      const params = [];

      if (filters.account_number) {
        whereClause += ' AND account_number LIKE ?';
        params.push(`%${filters.account_number}%`);
      }

      if (filters.account_name) {
        whereClause += ' AND account_name LIKE ?';
        params.push(`%${filters.account_name}%`);
      }

      if (filters.bank_name) {
        whereClause += ' AND bank_name LIKE ?';
        params.push(`%${filters.bank_name}%`);
      }

      if (filters.currency_code) {
        whereClause += ' AND currency_code = ?';
        params.push(filters.currency_code);
      }

      if (filters.account_type) {
        whereClause += ' AND account_type = ?';
        params.push(filters.account_type);
      }

      if (filters.is_active !== undefined) {
        whereClause += ' AND is_active = ?';
        params.push(filters.is_active);
      }

      const orderClause = ' ORDER BY bank_name, account_name';

      // 如果提供了分页参数，使用数据库级分页
      if (filters.page && filters.pageSize) {
        const page = Math.max(1, parseInt(filters.page, 10) || 1);
        const pageSize = Math.max(1, Math.min(100, parseInt(filters.pageSize, 10) || 10));
        const offset = (page - 1) * pageSize;

        const [countResult] = await db.pool.execute(
          `SELECT COUNT(*) as total FROM bank_accounts${whereClause}`,
          params
        );
        const total = countResult[0].total;

        const [accounts] = await db.pool.execute(
          `SELECT * FROM bank_accounts${whereClause}${orderClause} LIMIT ${pageSize} OFFSET ${offset}`,
          params
        );

        return { accounts, total, page, pageSize };
      }

      // 无分页参数时返回全量（兼容旧调用）
      const [accounts] = await db.pool.execute(
        `SELECT * FROM bank_accounts${whereClause}${orderClause}`,
        params
      );

      return accounts;
    } catch (error) {
      logger.error('获取银行账户列表失败:', error);
      const enhancedError = new Error(`获取银行账户列表时发生错误: ${error.message}`);
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }


  /**
   * 更新银行账户
   */
  static async updateBankAccount(id, accountData) {
    try {
      const [result] = await db.pool.execute(
        `UPDATE bank_accounts SET
         account_number = ?,
         account_name = ?,
         bank_name = ?,
         branch_name = ?,
         currency_code = ?,
         account_type = ?,
         is_active = ?,
         contact_person = ?,
         contact_phone = ?,
         notes = ?,
         updated_by = ?
         WHERE id = ?`,
        [
          accountData.account_number,
          accountData.account_name,
          accountData.bank_name,
          accountData.branch_name || null,
          accountData.currency_code || financeConfig.get('account.defaultCurrency', 'CNY'),
          accountData.account_type || '活期',
          accountData.is_active !== undefined ? accountData.is_active : true,
          accountData.contact_person || null,
          accountData.contact_phone || null,
          accountData.notes || null,
          accountData.updated_by || null,
          id,
        ]
      );
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('更新银行账户失败:', error);
      throw error;
    }
  }

  /**
   * 更新银行账户状态
   */
  static async updateBankAccountStatus(id, isActive) {
    try {
      const [result] = await db.pool.execute(
        `UPDATE bank_accounts SET
         is_active = ?
         WHERE id = ?`,
        [isActive, id]
      );
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('更新银行账户状态失败:', error);
      throw error;
    }
  }

  /**
   * 更新银行账户余额
   * @param {number} accountId 账户ID
   * @param {number} amount 金额
   * @param {string} transactionType 交易类型
   * @param {string} operation 操作类型 ('add' 或 'subtract')
   * @param {object} connection 数据库连接（可选）
   */
  static async updateBankAccountBalance(
    accountId,
    amount,
    transactionType,
    operation = 'add',
    connection = null
  ) {
    const conn = connection || db.pool;

    try {
      // 先检查账户是否存在
      const [accounts] = await conn.execute(
        'SELECT id FROM bank_accounts WHERE id = ?',
        [accountId]
      );
      if (accounts.length === 0) {
        throw new Error(`银行账户ID ${accountId} 不存在`);
      }

      const balanceChange = parseFloat(amount);
      if (isNaN(balanceChange) || balanceChange < 0) {
        throw new Error(`无效的金额: ${amount}`);
      }

      // 根据交易类型和操作确定余额变化方向（+1 或 -1）
      let direction;
      if (operation === 'add') {
        switch (transactionType) {
          case '存款':
          case '转入':
          case '利息':
            direction = 1;
            break;
          case '取款':
          case '转出':
          case '费用':
            direction = -1;
            break;
          default:
            throw new Error(`不支持的交易类型: ${transactionType}`);
        }
      } else if (operation === 'subtract') {
        // 撤销交易时的余额变化（与添加时相反）
        switch (transactionType) {
          case '存款':
          case '转入':
          case '利息':
            direction = -1;
            break;
          case '取款':
          case '转出':
          case '费用':
            direction = 1;
            break;
          default:
            throw new Error(`不支持的交易类型: ${transactionType}`);
        }
      }

      // ✅ 使用原子 SQL 更新，避免并发读-改-写竞态条件（TOCTOU）
      const [result] = await conn.execute(
        'UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?',
        [direction * balanceChange, accountId]
      );

      return result.affectedRows > 0;
    } catch (error) {
      logger.error('更新银行账户余额失败:', error);
      throw error;
    }
  }
}

logger.debug(
  '[AccountModel] Exporting BankAccountModel class with methods:',
  Object.getOwnPropertyNames(BankAccountModel)
);
module.exports = BankAccountModel;
