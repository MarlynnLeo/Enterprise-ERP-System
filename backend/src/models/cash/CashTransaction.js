/**
 * cash/CashTransaction.js
 * @description 现金交易管理模型
 * @date 2026-01-23
 * @version 1.0.0
 */

const logger = require('../../utils/logger');
const db = require('../../config/db');
const CodeGeneratorService = require('../../services/business/CodeGeneratorService');

class CashTransactionModel {
  /**
   * 创建现金交易
   */
  static async createCashTransaction(transactionData) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const transactionNumber = await CodeGeneratorService.nextCode('cash_transaction', connection);

      // 插入现金交易记录
      const [result] = await connection.execute(
        `INSERT INTO cash_transactions
        (transaction_type, transaction_date, amount, category,
         counterparty, description, reference_number, transaction_number,
         created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          transactionData.transaction_type,
          transactionData.transaction_date,
          parseFloat(transactionData.amount),
          transactionData.category,
          transactionData.counterparty || '',
          transactionData.description,
          transactionData.reference_number || '',
          transactionNumber,
          transactionData.created_by || null,
        ]
      );

      const transactionId = result.insertId;

      // 提交事务
      await connection.commit();

      return {
        transactionId,
        transactionNumber,
        success: true,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('现金交易创建失败，事务已回滚:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 获取现金交易列表
   */
  static async getCashTransactions(filters = {}) {
    try {
      // 计算偏移量
      const page = parseInt(filters.page) || 1;
      const pageSize = parseInt(filters.pageSize) || 10;
      const offset = (page - 1) * pageSize;

      // 先简化查询，不使用筛选条件
      const countQuery = 'SELECT COUNT(*) as total FROM cash_transactions';
      const [countResult] = await db.pool.execute(countQuery);
      const total = parseInt(countResult[0].total) || 0;

      // 查询数据
      const dataQuery = `
        SELECT
          id,
          transaction_date as transactionDate,
          transaction_type as type,
          amount,
          category,
          counterparty,
          description,
          reference_number as referenceNumber,
          transaction_number as transactionNumber,
          status,
          created_by as createdBy,
          created_at as createdAt,
          updated_at as updatedAt
        FROM cash_transactions
        ORDER BY transaction_date DESC, created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;

      // 使用 query 而不是 execute，避免 LIMIT/OFFSET 参数化问题
      const [rows] = await db.pool.query(dataQuery);

      return {
        transactions: rows,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    } catch (error) {
      logger.error('[现金交易] 获取现金交易列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取现金交易统计
   */
  static async getCashTransactionStats(filters = {}) {
    try {
      let whereClause = 'WHERE 1=1';
      const params = [];

      // 添加筛选条件
      if (filters.type) {
        whereClause += ' AND transaction_type = ?';
        params.push(filters.type);
      }

      if (filters.category) {
        whereClause += ' AND category = ?';
        params.push(filters.category);
      }

      if (filters.startDate) {
        whereClause += ' AND transaction_date >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        whereClause += ' AND transaction_date <= ?';
        params.push(filters.endDate);
      }

      const query = `
        SELECT
          COUNT(*) as totalCount,
          COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0) as totalIncome,
          COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0) as totalExpense,
          COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE -amount END), 0) as netAmount
        FROM cash_transactions
        ${whereClause}
      `;

      const [rows] = await db.pool.execute(query, params);
      return rows[0];
    } catch (error) {
      logger.error('获取现金交易统计失败:', error);
      throw error;
    }
  }

  /**
   * 根据ID获取现金交易
   */
  static async getCashTransactionById(id) {
    try {
      const [transactions] = await db.pool.execute(
        `SELECT
          id,
          transaction_date as transactionDate,
          transaction_type as type,
          amount,
          category,
          counterparty,
          description,
          reference_number as referenceNumber,
          transaction_number as transactionNumber,
          created_by as createdBy,
          created_at as createdAt,
          updated_at as updatedAt
         FROM cash_transactions
         WHERE id = ?`,
        [id]
      );
      return transactions.length > 0 ? transactions[0] : null;
    } catch (error) {
      logger.error('获取现金交易失败:', error);
      throw error;
    }
  }

  /**
   * 更新现金交易
   */
  static async updateCashTransaction(id, transactionData) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        `UPDATE cash_transactions
         SET transaction_type = ?, transaction_date = ?, amount = ?, category = ?,
             counterparty = ?, description = ?, reference_number = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          transactionData.transaction_type,
          transactionData.transaction_date,
          parseFloat(transactionData.amount),
          transactionData.category,
          transactionData.counterparty || '',
          transactionData.description,
          transactionData.reference_number || '',
          id,
        ]
      );

      if (result.affectedRows === 0) {
        throw new Error('现金交易不存在');
      }

      await connection.commit();
      logger.info('现金交易更新成功');

      return { success: true };
    } catch (error) {
      await connection.rollback();
      logger.error('现金交易更新失败，事务已回滚:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 删除现金交易
   */
  static async deleteCashTransaction(id) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.execute('DELETE FROM cash_transactions WHERE id = ?', [id]);

      if (result.affectedRows === 0) {
        throw new Error('现金交易不存在');
      }

      await connection.commit();
      logger.info('现金交易删除成功');

      return { success: true };
    } catch (error) {
      await connection.rollback();
      logger.error('现金交易删除失败，事务已回滚:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 批量导入现金交易
   */
  static async batchCreateCashTransactions(transactionsData) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const results = [];

      for (const transactionData of transactionsData) {
        const transactionNumber = await CodeGeneratorService.nextCode('cash_transaction', connection);

        const [result] = await connection.execute(
          `INSERT INTO cash_transactions
          (transaction_type, transaction_date, amount, category,
           counterparty, description, reference_number, transaction_number,
           created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            transactionData.transaction_type,
            transactionData.transaction_date,
            parseFloat(transactionData.amount),
            transactionData.category,
            transactionData.counterparty || '',
            transactionData.description,
            transactionData.reference_number || '',
            transactionNumber,
            transactionData.created_by || null,
          ]
        );

        results.push({
          transactionId: result.insertId,
          transactionNumber,
        });
      }

      await connection.commit();
      logger.info(`批量创建现金交易成功，共创建 ${results.length} 条记录`);

      return {
        success: true,
        count: results.length,
        results,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('批量创建现金交易失败，事务已回滚:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 提交审核
   * @param {number} id 交易ID
   * @param {number} userId 提交人ID
   */
  static async submitForAudit(id) {
    try {
      // status 字段由 migrations/20260312000010 管理


      // 检查当前状态
      const [current] = await db.pool.execute('SELECT status FROM cash_transactions WHERE id = ?', [
        id,
      ]);

      if (current.length === 0) {
        throw new Error('现金交易不存在');
      }

      const currentStatus = current[0].status || 'draft';
      if (['pending', 'approved'].includes(currentStatus)) {
        throw new Error(`交易当前状态为 ${currentStatus}，无法重复提交审核`);
      }

      // 更新状态为待审核
      const [result] = await db.pool.execute(
        `UPDATE cash_transactions
                 SET status = 'pending', updated_at = NOW()
                 WHERE id = ?`,
        [id]
      );

      if (result.affectedRows === 0) {
        throw new Error('现金交易不存在');
      }

      logger.info(`现金交易 ${id} 已提交审核`);
      return true;
    } catch (error) {
      logger.error('提交审核失败:', error);
      throw error;
    }
  }

  /**
   * 审核通过
   * @param {number} id 交易ID
   * @param {number} userId 审核人ID
   */
  static async approveTransaction(id) {
    try {
      const [result] = await db.pool.execute(
        `UPDATE cash_transactions
         SET status = 'approved', updated_at = NOW()
         WHERE id = ?`,
        [id]
      );

      if (result.affectedRows === 0) {
        throw new Error('现金交易不存在');
      }

      logger.info(`现金交易 ${id} 审核通过`);
      return true;
    } catch (error) {
      logger.error('审核通过失败:', error);
      throw error;
    }
  }

  /**
   * 审核拒绝
   * @param {number} id 交易ID
   * @param {number} userId 审核人ID
   * @param {string} reason 拒绝原因
   */
  static async rejectTransaction(id, userId, reason) {
    try {
      const [result] = await db.pool.execute(
        `UPDATE cash_transactions
         SET status = 'rejected', updated_at = NOW()
         WHERE id = ?`,
        [id]
      );

      if (result.affectedRows === 0) {
        throw new Error('现金交易不存在');
      }

      logger.info(`现金交易 ${id} 审核拒绝: ${reason || '无'}`);
      return true;
    } catch (error) {
      logger.error('审核拒绝失败:', error);
      throw error;
    }
  }
}

module.exports = CashTransactionModel;
