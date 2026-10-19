/**
 * finance/periods.js
 * @description 会计期间相关方法
 *              从 models/finance.js L1428-1647 提取
 * @date 2026-06-11
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');
const {
  parseOptionalBoolean,
  currentDateString,
  normalizeDateInput,
  isClosedFlag,
  toDateString,
} = require('./helpers');
const BusinessError = require('../../utils/BusinessError');

function normalizePeriodData(data) {
  try {
    const start_date = normalizeDateInput(data.start_date, 'start_date');
    const end_date = normalizeDateInput(data.end_date, 'end_date');
    const fiscal_year = Number(data.fiscal_year);
    if (start_date > end_date) throw new Error('开始日期不能晚于结束日期');
    if (!Number.isInteger(fiscal_year) || fiscal_year < 1000 || fiscal_year > 9999) {
      throw new Error('会计年度必须为四位整数');
    }
    const period_name = typeof data.period_name === 'string' ? data.period_name.trim() : '';
    if (!period_name || period_name.length > 50) throw new Error('期间名称必须为1至50个字符');
    return {
      ...data,
      period_name,
      start_date,
      end_date,
      fiscal_year,
      is_adjusting: parseOptionalBoolean(data.is_adjusting, 'is_adjusting') ?? 0,
    };
  } catch (error) {
    throw new BusinessError(error.message);
  }
}

module.exports = {
  /**
   * 获取当前会计期间（未关闭的最新期间）
   */
  getCurrentPeriod: async () => {
    try {
      const [periods] = await db.pool.execute(
        'SELECT id, period_name, start_date, end_date, is_closed, is_locked, is_adjusting, fiscal_year, created_at, updated_at, closed_by, closed_at, closing_date, reopened_by, reopened_at, status FROM gl_periods WHERE is_closed = 0 ORDER BY end_date DESC LIMIT 1'
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

      let query = `SELECT id, period_name, start_date, end_date, is_closed, is_locked, is_adjusting, fiscal_year, created_at, updated_at, closed_by, closed_at, closing_date, reopened_by, reopened_at, status FROM gl_periods ${whereClause} ORDER BY fiscal_year DESC, start_date DESC`;
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
      const [periods] = await db.pool.execute(
        'SELECT id, period_name, start_date, end_date, is_closed, is_locked, is_adjusting, fiscal_year, created_at, updated_at, closed_by, closed_at, closing_date, reopened_by, reopened_at, status FROM gl_periods WHERE id = ?',
        [id]
      );
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
    const normalized = normalizePeriodData(periodData);
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [overlaps] = await connection.execute(
        `SELECT id FROM gl_periods
         WHERE start_date <= ? AND end_date >= ?
         LIMIT 1 FOR UPDATE`,
        [normalized.end_date, normalized.start_date]
      );

      if (overlaps.length > 0) {
        throw new Error('Accounting period date range overlaps an existing period');
      }

      const [result] = await connection.execute(
        'INSERT INTO gl_periods (period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year) VALUES (?, ?, ?, ?, ?, ?)',
        [
          normalized.period_name,
          normalized.start_date,
          normalized.end_date,
          0,
          normalized.is_adjusting,
          normalized.fiscal_year,
        ]
      );
      await connection.commit();
      return result.insertId;
    } catch (error) {
      await connection.rollback();
      logger.error('创建会计期间失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 更新会计期间
   */
  updatePeriod: async (id, periodData) => {
    const normalized = normalizePeriodData(periodData);
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [periods] = await connection.execute(
        'SELECT id, is_closed, is_locked, start_date, end_date, fiscal_year, is_adjusting FROM gl_periods WHERE id = ? FOR UPDATE',
        [id]
      );

      if (periods.length === 0) {
        throw new Error('Accounting period not found');
      }

      const period = periods[0];
      if (isClosedFlag(period.is_closed) || isClosedFlag(period.is_locked)) {
        throw new BusinessError('已关闭或锁定的会计期间不能修改');
      }

      const calendarChanged =
        toDateString(period.start_date) !== normalized.start_date ||
        toDateString(period.end_date) !== normalized.end_date ||
        Number(period.fiscal_year) !== normalized.fiscal_year ||
        Number(period.is_adjusting || 0) !== normalized.is_adjusting;
      if (calendarChanged) {
        // 期间行锁与记账共享锁互斥，禁止挪动已有凭证的报表归属。
        const [entries] = await connection.execute(
          'SELECT id FROM gl_entries WHERE period_id = ? LIMIT 1 FOR UPDATE',
          [id]
        );
        const [balances] = await connection.execute(
          'SELECT account_id FROM gl_period_balances WHERE period_id = ? LIMIT 1 FOR UPDATE',
          [id]
        );
        if (entries.length || balances.length) {
          throw new BusinessError('已有凭证或余额快照的期间不能修改日期、会计年度或调整期属性');
        }
      }

      const [overlaps] = await connection.execute(
        `SELECT id FROM gl_periods
         WHERE id <> ? AND start_date <= ? AND end_date >= ?
         LIMIT 1 FOR UPDATE`,
        [id, normalized.end_date, normalized.start_date]
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
          normalized.period_name,
          normalized.start_date,
          normalized.end_date,
          normalized.is_adjusting,
          normalized.fiscal_year,
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
        closed_by: null, // resolveActorUserId 在 PeriodEndService 内解析
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
        reopened_by: null, // resolveActorUserId 在 PeriodEndService 内解析
      });
      return Boolean(result?.periodId);
    } catch (error) {
      logger.error('重新开启会计期间失败:', error);
      throw error;
    }
  },
};
