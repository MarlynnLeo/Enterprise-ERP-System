/**
 * salesShared.js
 * @description 销售模块共享工具函数和常量
 * @date 2026-01-07
 * @version 1.0.0
 */

const db = require('../../../config/db');
const { CodeGenerators } = require('../../../utils/codeGenerator');
const businessConfig = require('../../../config/businessConfig');

// 状态常量
const STATUS = {
  SALES_ORDER: {
    DRAFT: 'draft',
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    READY_TO_SHIP: 'ready_to_ship',
    IN_PRODUCTION: 'in_production',
    IN_PROCUREMENT: 'in_procurement',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },
  OUTBOUND: businessConfig.status.outbound,
  SALES_RETURN: {
    DRAFT: 'draft',
    PENDING: 'pending',
    APPROVED: 'approved',
    COMPLETED: 'completed',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
  },
  EXCHANGE: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },
};

// 数据库连接池
const connection = db.pool;

// 统一的连接管理函数
const getConnection = async () => {
  return await connection.getConnection();
};

// 统一的销售订单编号生成函数
const generateSalesOrderNo = async (connection) => {
  return await CodeGenerators.generateSalesOrderCode(connection);
};

// 生成交易编号
const generateTransactionNo = async (connection) => {
  return await CodeGenerators.generateTransactionCode(connection);
};

// 生成销售出库编号
const generateSalesOutboundNo = async (conn) => {
  return await CodeGenerators.generateOutboundCode(conn);
};

// 日期格式化函数
const formatDateToMySQLDate = (date) => {
  if (!date) return null;
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

module.exports = {
  STATUS,
  connection,
  getConnection,
  generateSalesOrderNo,
  generateTransactionNo,
  generateSalesOutboundNo,
  formatDateToMySQLDate,
  // 向后兼容别名
  generateOrderNo: generateSalesOrderNo,
};
