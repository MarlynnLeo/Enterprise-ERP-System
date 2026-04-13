/**
 * cash/Reconciliation.js
 * @description 银行对账管理模型
 * @date 2026-01-23
 * @version 1.0.0
 */

const logger = require('../../utils/logger');
const db = require('../../config/db');

class ReconciliationModel {
  /**
   * 银行对账
   */
  static async reconcileBankTransaction(id, reconciliationData) {
    try {
      const [result] = await db.pool.execute(
        'UPDATE bank_transactions SET is_reconciled = ?, reconciliation_date = ? WHERE id = ? AND (is_reconciled = false OR is_reconciled IS NULL)',
        [true, reconciliationData.reconciliation_date, id]
      );
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('银行对账失败:', error);
      throw error;
    }
  }

  /**
   * 对账交易（别名，用于兼容控制器调用）
   */
  static async reconcileTransaction(id, reconciliationData) {
    // 调用已有的对账方法
    return await this.reconcileBankTransaction(id, reconciliationData);
  }

  /**
   * 取消银行对账
   */
  static async cancelReconciliation(id) {
    try {
      const [result] = await db.pool.execute(
        'UPDATE bank_transactions SET is_reconciled = ?, reconciliation_date = NULL WHERE id = ?',
        [false, id]
      );
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('取消银行对账失败:', error);
      throw error;
    }
  }
  /**
   * 获取对账记录列表
   */
  static async getReconciliations(filters = {}) {
    try {
      let query = 'SELECT * FROM reconciliations WHERE 1=1';
      const params = [];

      if (filters.accountId) {
        query += ' AND account_id = ?';
        params.push(filters.accountId);
      }

      if (filters.status) {
        query += ' AND status = ?';
        params.push(filters.status);
      }

      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const offset = (page - 1) * limit;

      // 获取总数
      // 注意：如果表不存在，这里会抛错。
      const countQuery = `SELECT COUNT(*) as total FROM reconciliations WHERE 1=1 ${filters.accountId ? 'AND account_id = ?' : ''} ${filters.status ? 'AND status = ?' : ''}`;

      // 简单处理count params
      const countParams = params.slice(); // Copy params

      const [countResult] = await db.pool.execute(countQuery, countParams);
      const total = countResult[0].total;

      query += ' ORDER BY reconciliation_date DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      // query execution might fail if LIMIT ? is not supported by prepared statement wrapper or if params need to be numbers
      // db.js usually handles this if checking for LIMIT ?
      // Let's use string interpolation for limit/offset to be safe with mysql2 execute sometimes
      const [rows] = await db.pool.query(query, params);

      return {
        data: rows,
        total,
      };
    } catch (error) {
      // 如果是因为表不存在，返回空
      if (error.code === 'ER_NO_SUCH_TABLE') {
        return { data: [], total: 0 };
      }
      logger.error('获取对账记录列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取单条对账记录
   */
  static async getReconciliationById(id) {
    try {
      const [rows] = await db.pool.execute('SELECT * FROM reconciliations WHERE id = ?', [id]);
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') return null;
      logger.error('获取对账记录失败:', error);
      throw error;
    }
  }

  /**
   * 创建对账记录
   */
  static async createReconciliation(data) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        `INSERT INTO reconciliations 
                (account_id, reconciliation_date, bank_statement_balance, book_balance, status, notes, created_by) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          data.account_id,
          data.reconciliation_date,
          data.bank_statement_balance,
          data.book_balance,
          data.status || 'draft',
          data.notes,
          data.created_by || 1,
        ]
      );

      await connection.commit();
      return result.insertId;
    } catch (error) {
      await connection.rollback();
      logger.error('创建对账记录失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 更新对账记录
   */
  static async updateReconciliation(id, data) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        `UPDATE reconciliations SET 
                account_id = ?, 
                reconciliation_date = ?, 
                bank_statement_balance = ?, 
                book_balance = ?, 
                status = ?, 
                notes = ? 
                WHERE id = ?`,
        [
          data.account_id,
          data.reconciliation_date,
          data.bank_statement_balance,
          data.book_balance,
          data.status,
          data.notes,
          id,
        ]
      );

      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      logger.error('更新对账记录失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = ReconciliationModel;
