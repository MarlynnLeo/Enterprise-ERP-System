/**
 * 发票状态自动更新工具
 * 用于定期检查并更新逾期发票的状态
 */

const db = require('../config/db');
const { logStatusChange } = require('./invoiceStatusLogger');
const logger = require('./logger');

/**
 * 更新逾期的应收发票状态
 */
async function updateOverdueARInvoices() {
  let connection;
  try {
    connection = await db.pool.getConnection();

    // 先查询需要更新的发票
    const [invoices] = await connection.execute(`
      SELECT id, invoice_number, status
      FROM ar_invoices
      WHERE status IN ('已确认', '部分付款')
        AND balance_amount > 0
        AND due_date < CURDATE()
        AND status != '已逾期'
    `);

    if (invoices.length === 0) {
      logger.info('[发票状态更新] 没有需要更新的逾期应收发票');
      return 0;
    }

    // 更新逾期的应收发票
    const [result] = await connection.execute(`
      UPDATE ar_invoices
      SET status = '已逾期'
      WHERE status IN ('已确认', '部分付款')
        AND balance_amount > 0
        AND due_date < CURDATE()
        AND status != '已逾期'
    `);

    // 记录状态变更日志
    for (const invoice of invoices) {
      await logStatusChange({
        invoiceType: 'AR',
        invoiceId: invoice.id,
        invoiceCode: invoice.invoice_number,
        oldStatus: invoice.status,
        newStatus: '已逾期',
        changedBy: 'SYSTEM',
        changeReason: '逾期自动更新',
      });
    }

    logger.info(`[发票状态更新] 更新了 ${result.affectedRows} 条逾期应收发票`);
    return result.affectedRows;
  } catch (error) {
    logger.error('[发票状态更新] 更新逾期应收发票失败:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * 更新逾期的应付发票状态
 */
async function updateOverdueAPInvoices() {
  let connection;
  try {
    connection = await db.pool.getConnection();

    // 先查询需要更新的发票
    const [invoices] = await connection.execute(`
      SELECT id, invoice_number, status
      FROM ap_invoices
      WHERE status IN ('已确认', '部分付款')
        AND balance_amount > 0
        AND due_date < CURDATE()
        AND status != '已逾期'
    `);

    if (invoices.length === 0) {
      logger.info('[发票状态更新] 没有需要更新的逾期应付发票');
      return 0;
    }

    // 更新逾期的应付发票
    const [result] = await connection.execute(`
      UPDATE ap_invoices
      SET status = '已逾期'
      WHERE status IN ('已确认', '部分付款')
        AND balance_amount > 0
        AND due_date < CURDATE()
        AND status != '已逾期'
    `);

    // 记录状态变更日志
    for (const invoice of invoices) {
      await logStatusChange({
        invoiceType: 'AP',
        invoiceId: invoice.id,
        invoiceCode: invoice.invoice_number,
        oldStatus: invoice.status,
        newStatus: '已逾期',
        changedBy: 'SYSTEM',
        changeReason: '逾期自动更新',
      });
    }

    logger.info(`[发票状态更新] 更新了 ${result.affectedRows} 条逾期应付发票`);
    return result.affectedRows;
  } catch (error) {
    logger.error('[发票状态更新] 更新逾期应付发票失败:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * 更新所有逾期发票
 */
async function updateAllOverdueInvoices() {
  logger.info('[发票状态更新] 开始检查逾期发票...');

  try {
    const arCount = await updateOverdueARInvoices();
    const apCount = await updateOverdueAPInvoices();

    logger.info(`[发票状态更新] 完成! 应收: ${arCount}条, 应付: ${apCount}条`);

    return {
      arCount,
      apCount,
      total: arCount + apCount,
    };
  } catch (error) {
    logger.error('[发票状态更新] 更新失败:', error);
    throw error;
  }
}

/**
 * 获取逾期发票统计
 */
async function getOverdueInvoicesStats() {
  let connection;
  try {
    connection = await db.pool.getConnection();

    // 获取应收逾期统计
    const [arStats] = await connection.execute(`
      SELECT 
        COUNT(*) as count,
        SUM(balance_amount) as total_amount
      FROM ar_invoices 
      WHERE status = '已逾期'
        AND balance_amount > 0
    `);

    // 获取应付逾期统计
    const [apStats] = await connection.execute(`
      SELECT 
        COUNT(*) as count,
        SUM(balance_amount) as total_amount
      FROM ap_invoices 
      WHERE status = '已逾期'
        AND balance_amount > 0
    `);

    return {
      ar: {
        count: arStats[0].count,
        totalAmount: parseFloat(arStats[0].total_amount || 0),
      },
      ap: {
        count: apStats[0].count,
        totalAmount: parseFloat(apStats[0].total_amount || 0),
      },
    };
  } catch (error) {
    logger.error('[发票状态更新] 获取逾期统计失败:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  updateOverdueARInvoices,
  updateOverdueAPInvoices,
  updateAllOverdueInvoices,
  getOverdueInvoicesStats,
};
