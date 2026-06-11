/**
 * finance/periods.js
 * @description 会计期间相关方法
 *              从 models/finance.js L1428-1647 提取
 * @date 2026-06-11
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');
const { parseOptionalBoolean, currentDateString } = require('./helpers');

module.exports = {
  /**
   * 获取当前会计期间（未关闭的最新期间）
   */
  getCurrentPeriod: async () => {
    try {
      const [periods] = await db.pool.execute(
        'SELECT id, period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year, created_at, updated_at, closed_by, closed_at, closing_date, reopened_by, reopened_at, status FROM gl_periods WHERE is_closed = 0 ORDER BY end_date DESC LIMIT 1'
      );
      return periods.length > 0 ? periods[0] : null;
    } catch (error) {
      logger.error('获取当前会计期间失败:', error);
      throw error;
    }
  },

  /**
   * 获取所有会计期间
   */
  getAllPeriods: async (filters = {}) => {
    try {
      const where = [];
      const params = [];

      if (
        filters.fiscalYear !== undefined &&
        filters.fiscalYear !== null &&
        filters.fiscalYear !== ''
      ) {
        const fiscalYear = Number.parseInt(filters.fiscalYear, 10);
        if (!Number.isInteger(fiscalYear)) {
          throw new Error('fiscalYear must be an integer');
        }
        where.push('fiscal_year = ?');
        params.push(fiscalYear);
      }

      const isClosed = parseOptionalBoolean(filters.isClosed, 'isClosed');
      if (isClosed !== null) {
        where.push('is_closed = ?');
        params.push(isClosed);
      }

      const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const [countRows] = await db.pool.execute(
        `SELECT COUNT(*) AS total FROM gl_periods ${whereClause}`,
        params
      );

      const page = Number.parseInt(filters.page, 10);
      const limit = Number.parseInt(filters.limit || filters.pageSize, 10);
      const shouldPaginate =
        Number.isInteger(page) && page > 0 && Number.isInteger(limit) && limit > 0;
      const safeLimit = shouldPaginate ? Math.min(limit, 100) : null;
      const offset = shouldPaginate ? (page - 1) * safeLimit : null;

      let query = `SELECT id, period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year, created_at, updated_at, closed_by, closed_at, closing_date, reopened_by, reopened_at, status FROM gl_periods ${whereClause} ORDER BY fiscal_year DESC, start_date DESC`;
      if (shouldPaginate) {
        query += ` LIMIT ${safeLimit} OFFSET ${offset}`;
      }

      const [periods] = await db.pool.query(query, params);
      return {
        periods,
        total: Number(countRows[0]?.total || 0),
        page: shouldPaginate ? page : 1,
        pageSize: shouldPaginate ? safeLimit : periods.length,
      };
    } catch (error) {
      logger.error('获取会计期间失败:', error);
      throw error;
    }
  },

  /**
   * 按ID获取会计期间
   */
  getPeriodById: async (id) => {
    try {
      const [periods] = await db.pool.execute('SELECT id, period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year, created_at, updated_at, closed_by, closed_at, closing_date, reopened_by, reopened_at, status FROM gl_periods WHERE id = ?', [
        id,
      ]);
      return periods.length > 0 ? periods[0] : null;
    } catch (error) {
      logger.error('按ID获取会计期间失败:', error);
      throw error;
    }
  },

  /**
   * 创建会计期间
   */
  createPeriod: async (periodData) => {
    try {
      const [overlaps] = await db.pool.execute(
        `SELECT id FROM gl_periods
         WHERE start_date <= ? AND end_date >= ?
         LIMIT 1`,
        [periodData.end_date, periodData.start_date]
      );

      if (overlaps.length > 0) {
        throw new Error('Accounting period date range overlaps an existing period');
      }

      const [result] = await db.pool.execute(
        'INSERT INTO gl_periods (period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year) VALUES (?, ?, ?, ?, ?, ?)',
        [
          periodData.period_name,
          periodData.start_date,
          periodData.end_date,
          0,
          periodData.is_adjusting !== undefined ? periodData.is_adjusting : false,
          periodData.fiscal_year,
        ]
      );
      return result.insertId;
    } catch (error) {
      logger.error('创建会计期间失败:', error);
      throw error;
    }
  },

  /**
   * 更新会计期间
   */
  updatePeriod: async (id, periodData) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [periods] = await connection.execute(
        'SELECT id, is_closed FROM gl_periods WHERE id = ? FOR UPDATE',
        [id]
      );

      if (periods.length === 0) {
        throw new Error('Accounting period not found');
      }

      if (periods[0].is_closed) {
        throw new Error('Closed accounting periods cannot be edited');
      }

      const [overlaps] = await connection.execute(
        `SELECT id FROM gl_periods
         WHERE id <> ? AND start_date <= ? AND end_date >= ?
         LIMIT 1`,
        [id, periodData.end_date, periodData.start_date]
      );

      if (overlaps.length > 0) {
        throw new Error('Accounting period date range overlaps an existing period');
      }

      const [result] = await connection.execute(
        `UPDATE gl_periods SET
          period_name = ?,
          start_date = ?,
          end_date = ?,
          is_adjusting = ?,
          fiscal_year = ?
         WHERE id = ?`,
        [
          periodData.period_name,
          periodData.start_date,
          periodData.end_date,
          periodData.is_adjusting ? 1 : 0,
          periodData.fiscal_year,
          id,
        ]
      );

      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      logger.error('Update accounting period failed:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 关闭会计期间
   */
  closePeriod: async (id) => {
    try {
      const PeriodEndService = require('../../services/business/PeriodEndService');
      const result = await PeriodEndService.closePeriod({
        period_id: Number.parseInt(id, 10),
        closed_by: 'system',
        closing_date: currentDateString(),
      });
      return Boolean(result?.periodId);
    } catch (error) {
      logger.error('关闭会计期间失败:', error);
      throw error;
    }
  },

  /**
   * 重新开启会计期间
   */
  reopenPeriod: async (id) => {
    try {
      const PeriodEndService = require('../../services/business/PeriodEndService');
      const result = await PeriodEndService.reopenPeriod({
        period_id: Number.parseInt(id, 10),
        reopened_by: 'system',
      });
      return Boolean(result?.periodId);
    } catch (error) {
      logger.error('重新开启会计期间失败:', error);
      throw error;
    }
  },
};
