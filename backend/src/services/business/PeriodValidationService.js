/**
 * PeriodValidationService.js
 * @description 期间校验服务 - 统一管理财务和库存的期间控制
 * @date 2025-12-08
 * @version 1.0.0
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');
const { DOCUMENT_TYPE_MAPPING } = require('../../constants/financeConstants');

/**
 * 期间校验服务
 * 用于检查财务年度结转和库存年度结存状态，阻止对已关闭期间的修改
 */
class PeriodValidationService {
  /**
   * 检查库存年度是否已冻结
   * @param {Date|string} transactionDate 交易日期
   * @returns {Object} { isFrozen: boolean, message: string, year: number }
   */
  static async checkInventoryYearFrozen(transactionDate, connection = null) {
    try {
      const date = new Date(transactionDate);
      if (Number.isNaN(date.getTime())) {
        return { isFrozen: true, year: null, message: '库存交易日期无效' };
      }
      const year = date.getFullYear();

      const executor = connection || db.pool;
      const [result] = await executor.execute(
        `SELECT COUNT(*) as count, MAX(is_frozen) as is_frozen
         FROM inventory_year_end_balances WHERE year = ?`,
        [year]
      );

      const isFrozen =
        Number(result[0].count || 0) > 0 &&
        (Number(result[0].is_frozen) === 1 || result[0].is_frozen === true);

      return {
        isFrozen,
        year,
        message: isFrozen ? `${year}年度库存已冻结，无法创建或修改该年度的库存单据` : null,
      };
    } catch (error) {
      logger.error('检查库存年度冻结状态失败:', error);
      throw error;
    }
  }

  /**
   * 检查财务期间是否已关闭
   * @param {number} periodId 会计期间ID
   * @returns {Object} { isClosed: boolean, message: string, periodName: string }
   */
  static async checkPeriodClosed(periodId) {
    try {
      const [result] = await db.pool.execute(
        'SELECT id, period_name, is_closed, is_locked, fiscal_year FROM gl_periods WHERE id = ?',
        [periodId]
      );

      if (result.length === 0) {
        return { isClosed: true, message: '会计期间不存在', periodName: null };
      }

      const period = result[0];

      return {
        isClosed:
          Number(period.is_closed) === 1 ||
          period.is_closed === true ||
          Number(period.is_locked) === 1 ||
          period.is_locked === true,
        periodName: period.period_name,
        fiscalYear: period.fiscal_year,
        message: period.is_closed || period.is_locked
          ? `会计期间"${period.period_name}"已关闭或锁定，无法创建或修改分录`
          : null,
      };
    } catch (error) {
      logger.error('检查会计期间状态失败:', error);
      throw error;
    }
  }

  /**
   * 检查财务年度是否已结转
   * @param {number} year 会计年度
   * @returns {Object} { isTransferred: boolean, message: string }
   */
  static async checkYearEndTransferred(year) {
    try {
      const [result] = await db.pool.execute(
        `SELECT COUNT(*) as count FROM gl_entries
         WHERE document_type = ? AND YEAR(entry_date) = ?`,
        [DOCUMENT_TYPE_MAPPING.YEAR_END_TRANSFER, year]
      );

      const isTransferred = result[0].count > 0;

      return {
        isTransferred,
        year,
        message: isTransferred ? `${year}年度已执行年度结转，无法创建或修改该年度的会计分录` : null,
      };
    } catch (error) {
      logger.error('检查年度结转状态失败:', error);
      throw error;
    }
  }

  /**
   * 综合检查财务分录是否允许创建
   * @param {number} periodId 会计期间ID
   * @param {Date|string} entryDate 分录日期
   * @returns {Object} { allowed: boolean, message: string }
   */
  static async validateFinanceEntry(periodId, entryDate) {
    // 1. 检查期间是否关闭
    const periodCheck = await this.checkPeriodClosed(periodId);
    if (periodCheck.isClosed) {
      return { allowed: false, message: periodCheck.message };
    }

    // 2. 检查年度是否已结转
    const year = new Date(entryDate).getFullYear();
    const yearCheck = await this.checkYearEndTransferred(year);
    if (yearCheck.isTransferred) {
      return { allowed: false, message: yearCheck.message };
    }

    return { allowed: true, message: null };
  }

  /**
   * 综合检查库存单据是否允许创建
   * @param {Date|string} transactionDate 交易日期
   * @returns {Object} { allowed: boolean, message: string }
   */
  static async checkInventoryPeriod(transactionDate, connection = null) {
    const date = new Date(transactionDate);
    if (Number.isNaN(date.getTime())) {
      return { isClosed: true, periodId: null, message: '库存交易日期无效' };
    }

    const normalizedDate = date.toISOString().slice(0, 10);
    const executor = connection || db.pool;
    const [rows] = await executor.execute(
      `SELECT id, period_name, is_closed, is_locked
         FROM gl_periods
        WHERE ? BETWEEN start_date AND end_date
        ORDER BY start_date DESC
        LIMIT 1`,
      [normalizedDate]
    );
    if (rows.length === 0) {
      return {
        isClosed: true,
        periodId: null,
        message: `库存交易日期 ${normalizedDate} 未配置会计期间，不能写入库存`,
      };
    }

    const period = rows[0];
    const isClosed =
      Number(period.is_closed) === 1 ||
      period.is_closed === true ||
      Number(period.is_locked) === 1 ||
      period.is_locked === true;
    return {
      isClosed,
      periodId: period.id,
      periodName: period.period_name,
      message: isClosed
        ? `会计期间"${period.period_name}"已关闭或锁定，不能写入库存`
        : null,
    };
  }

  static async validateInventoryTransaction(transactionDate, connection = null) {
    const periodCheck = await this.checkInventoryPeriod(transactionDate, connection);
    if (periodCheck.isClosed) {
      return {
        allowed: false,
        message: periodCheck.message,
        periodId: periodCheck.periodId,
      };
    }

    const check = await this.checkInventoryYearFrozen(transactionDate, connection);

    return {
      allowed: !check.isFrozen,
      message: check.message,
      year: check.year,
      periodId: periodCheck.periodId,
    };
  }
}

module.exports = PeriodValidationService;
