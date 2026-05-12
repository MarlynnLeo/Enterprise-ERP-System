/**
 * 发票状态变更日志记录工具
 * 用于记录所有发票状态变更历史
 */

const db = require('../config/db');
const logger = require('./logger');

/**
 * 记录发票状态变更
 * @param {Object} params - 参数对象
 * @param {string} params.invoiceType - 发票类型: 'AR' 或 'AP'
 * @param {number} params.invoiceId - 发票ID
 * @param {string} params.invoiceCode - 发票编号
 * @param {string} params.oldStatus - 原状态
 * @param {string} params.newStatus - 新状态
 * @param {string} params.changedBy - 变更人 (默认: 'SYSTEM')
 * @param {string} params.changeReason - 变更原因
 * @returns {Promise<boolean>} 是否记录成功
 */
async function logStatusChange({
  invoiceType,
  invoiceId,
  invoiceCode,
  oldStatus,
  newStatus,
  changedBy = 'SYSTEM',
  changeReason = '',
}) {
  let connection;
  try {
    // 如果状态没有变化,不记录
    if (oldStatus === newStatus) {
      return true;
    }

    connection = await db.pool.getConnection();

    await connection.execute(
      `INSERT INTO invoice_status_log
       (invoice_type, invoice_id, invoice_code, old_status, new_status, changed_by, change_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [invoiceType, invoiceId, invoiceCode, oldStatus, newStatus, changedBy, changeReason]
    );

    logger.info(
      `[状态日志] ${invoiceType}发票 ${invoiceCode}: ${oldStatus} → ${newStatus} (${changeReason})`
    );
    return true;
  } catch (error) {
    logger.error('[状态日志] 记录失败:', error);
    return false;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * 获取发票状态变更历史
 * @param {string} invoiceType - 发票类型: 'AR' 或 'AP'
 * @param {number} invoiceId - 发票ID
 * @returns {Promise<Array>} 状态变更历史列表
 */
async function getStatusHistory(invoiceType, invoiceId) {
  let connection;
  try {
    connection = await db.pool.getConnection();

    const [rows] = await connection.execute(
      `SELECT * FROM invoice_status_log
       WHERE invoice_type = ? AND invoice_id = ?
       ORDER BY changed_at DESC`,
      [invoiceType, invoiceId]
    );

    return rows;
  } catch (error) {
    logger.error('[状态日志] 查询历史失败:', error);
    return [];
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * 获取状态变更统计
 * @param {Object} params - 参数对象
 * @param {string} params.invoiceType - 发票类型 (可选)
 * @param {Date} params.startDate - 开始日期 (可选)
 * @param {Date} params.endDate - 结束日期 (可选)
 * @returns {Promise<Array>} 统计结果
 */
async function getStatusChangeStats({ invoiceType, startDate, endDate } = {}) {
  let connection;
  try {
    connection = await db.pool.getConnection();

    let sql = `
      SELECT
        invoice_type,
        old_status,
        new_status,
        COUNT(*) as change_count,
        changed_by,
        change_reason
      FROM invoice_status_log
      WHERE 1=1
    `;
    const params = [];

    if (invoiceType) {
      sql += ' AND invoice_type = ?';
      params.push(invoiceType);
    }

    if (startDate) {
      sql += ' AND changed_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND changed_at <= ?';
      params.push(endDate);
    }

    sql += ' GROUP BY invoice_type, old_status, new_status, changed_by, change_reason';
    sql += ' ORDER BY change_count DESC';

    const [rows] = await connection.execute(sql, params);
    return rows;
  } catch (error) {
    logger.error('[状态日志] 查询统计失败:', error);
    return [];
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  logStatusChange,
  getStatusHistory,
  getStatusChangeStats,
};
