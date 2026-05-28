/**
 * purchase.js
 * @description 数据模型文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const logger = require('../utils/logger');
const db = require('../config/db');
const { CodeGenerators } = require('../utils/codeGenerator');

// 生成采购申请单号
const generateRequisitionNo = async (connection = null) => {
  try {
    const conn = connection || (await db.pool.getConnection());
    try {
      return await CodeGenerators.generatePurchaseRequisitionCode(conn);
    } finally {
      if (!connection && conn) {
        conn.release();
      }
    }
  } catch (error) {
    logger.error('生成申请单号失败:', error);
    throw error;
  }
};

// 生成采购订单号
const generateOrderNo = async (connection = null) => {
  try {
    const conn = connection || (await db.pool.getConnection());
    try {
      return await CodeGenerators.generatePurchaseOrderCode(conn);
    } finally {
      if (!connection && conn) {
        conn.release();
      }
    }
  } catch (error) {
    logger.error('生成订单号失败:', error);
    throw error;
  }
};

// 生成采购入库单号
const generateReceiptNo = async (connection = null) => {
  try {
    const conn = connection || (await db.pool.getConnection());
    try {
      return await CodeGenerators.generateReceiptCode(conn);
    } finally {
      if (!connection && conn) {
        conn.release();
      }
    }
  } catch (error) {
    logger.error('生成收货单号失败:', error);
    throw error;
  }
};

// 生成采购退货单号
const generateReturnNo = async (connection = null) => {
  try {
    const conn = connection || (await db.pool.getConnection());
    try {
      return await CodeGenerators.generatePurchaseReturnCode(conn);
    } finally {
      if (!connection && conn) {
        conn.release();
      }
    }
  } catch (error) {
    logger.error('生成退货单号失败:', error);
    throw error;
  }
};

// 生成外委加工单号
const generateProcessingNo = async () => {
  const connection = await db.pool.getConnection();
  try {
    return await CodeGenerators.generateProcessingCode(connection);
  } finally {
    connection.release();
  }
};

// 生成外委加工入库单号
const generateProcessingReceiptNo = async () => {
  const connection = await db.pool.getConnection();
  try {
    return await CodeGenerators.generateProcessingReceiptCode(connection);
  } finally {
    connection.release();
  }
};

module.exports = {
  generateRequisitionNo,
  generateOrderNo,
  generateReceiptNo,
  generateReturnNo,
  generateProcessingNo,
  generateProcessingReceiptNo,
};
