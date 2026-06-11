/**
 * finance/closing.js
 * @description 期末结转相关方法
 *              从 models/finance.js L1783-1816 提取
 * @date 2026-06-11
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');

module.exports = {
  /**
   * 获取期末结转历史
   * @param {number} periodId - 会计期间ID
   * @returns {Array} 结转历史记录
   */
  getClosingHistory: async (periodId) => {
    try {
      const [entries] = await db.pool.execute(
        `
        SELECT
          e.*,
          u.real_name as operator_name
        FROM gl_entries e
        LEFT JOIN users u ON e.created_by = u.id
        WHERE e.period_id = ?
          AND (e.description LIKE '%结转%'
               OR e.document_type LIKE '%结转%'
               OR e.document_number LIKE 'PL-%')
        ORDER BY e.created_at DESC
      `,
        [periodId]
      );

      return entries;
    } catch (error) {
      logger.error('获取期末结转历史失败:', error);
      throw error;
    }
  },
};
