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
  static async checkInventoryYearFrozen(transactionDate) {
    try {
      const date = new Date(transactionDate);
      const year = date.getFullYear();

      const [result] = await db.pool.execute(
        `SELECT COUNT(*) as count, MAX(is_frozen) as is_frozen 
         FROM inventory_year_end_balances WHERE year = ?`,
        [year]
      );

      const isFrozen = result[0].count > 0 && result[0].is_frozen === 1;

      return {
        isFrozen,
        year,
        message: isFrozen ? `${year}年度库存已冻结，无法创建或修改该年度的库存单据` : null,
      };
    } catch (error) {
      // 如果表不存在或其他错误，允许操作
      logger.warn('检查库存年度冻结状态时出错:', error.message);
      return { isFrozen: false, year: null, message: null };
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
        'SELECT id, period_name, is_closed, fiscal_year FROM gl_periods WHERE id = ?',
        [periodId]
      );

      if (result.length === 0) {
        return { isClosed: false, message: '会计期间不存在', periodName: null };
      }

      const period = result[0];

      return {
        isClosed: period.is_closed === 1 || period.is_closed === true,
        periodName: period.period_name,
        fiscalYear: period.fiscal_year,
        message: period.is_closed
          ? `会计期间"${period.period_name}"已关闭，无法创建或修改分录`
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
  static async validateInventoryTransaction(transactionDate) {
    const check = await this.checkInventoryYearFrozen(transactionDate);

    return {
      allowed: !check.isFrozen,
      message: check.message,
      year: check.year,
    };
  }
}

module.exports = PeriodValidationService;
