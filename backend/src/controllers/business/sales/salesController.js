/**
 * salesController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const db = require('../../../config/db');
const SalesDao = require('../../../database/salesDao');
const customerService = require('../../../services/customerService');
const materialService = require('../../../services/materialService');
const { SALES_STATUS, SALES_STATUS_KEYS, ORDER_STATUS_KEYS } = require('../../../constants/systemConstants');
const InventoryReservationService = require('../../../services/InventoryReservationService');
const SalesOrderStatusService = require('../../../services/business/SalesOrderStatusService');
const { CodeGenerators } = require('../../../utils/codeGenerator');
const DBManager = require('../../../utils/dbManager');
const InventoryCheckService = require('../../../services/business/InventoryCheckService');
const CostAccountingService = require('../../../services/business/CostAccountingService');
const businessConfig = require('../../../config/businessConfig');
const XLSX = require('xlsx');

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

// 移除了废弃的 ensureSalesExchangeTablesExist, createSalesExchangeTablesDirectly, 和 updateSalesExchangeTableStructure
// 使用统一的编号生成服务 - 替代原 generateTransactionNo 函数
async function generateTransactionNo(connection) {
  return await CodeGenerators.generateTransactionCode(connection);
}

// Import the connection pool from db
const connection = db.pool;

// 统一的连接管理函数
const getConnection = async () => {
  return await connection.getConnection();
};

// 带事务的连接管理函数
const getConnectionWithTransaction = async () => {
  const conn = await connection.getConnection();
  await conn.beginTransaction();
  return conn;
};

// 统一的销售订单编号生成函数 - 替代所有重复的生成函数
const generateSalesOrderNo = async (connection) => {
  return CodeGenerators.generateSalesOrderCode(connection);
};

// 保持向后兼容的别名函数
const generateOrderNo = generateSalesOrderNo;

// 添加新的控制器方法
exports.getCustomersList = async (req, res) => {
  try {
    // 获取所有客户，不分页
    const result = await customerService.getAllCustomers(1, 1000);

    // 返回客户列表，直接返回items数组
    res.json(result.items || []);
  } catch (error) {
    logger.error('Error getting customers list:', error);
    ResponseHandler.error(res, 'Error getting customers list', 'SERVER_ERROR', 500, error);
  }
};

exports.getProductsList = async (req, res) => {
  try {
    // 不使用type过滤，获取所有物料
    const products = await materialService.getAllMaterials(1, 1000);

    // materialService.getAllMaterials 返回 { data, pagination }
    const items = products?.data || products?.list || products?.items || [];
    res.json(items);
  } catch (error) {
    logger.error('Error getting products list:', error);
    ResponseHandler.error(res, 'Error getting products list', 'SERVER_ERROR', 500, error);
  }
};

// Customer Controllers
exports.getCustomers = async (req, res) => {
  try {
    const { keyword, limit = 50 } = req.query;

    let query =
      'SELECT id, name, code, contact_person, contact_phone, address FROM customers WHERE 1=1';
    const params = [];

    // 如果有搜索关键词，添加搜索条件
    if (keyword && keyword.trim()) {
      query += ' AND (name LIKE ? OR code LIKE ?)';
      const searchTerm = `%${keyword.trim()}%`;
      params.push(searchTerm, searchTerm);
    }

    query += ' ORDER BY name ASC';

    // 添加限制条数
    if (limit) {
      query += ' LIMIT ?';
      params.push(parseInt(limit));
    }

    const { getConnection } = require('../../../config/db');
    const connection = await getConnection();

    try {
      const [customers] = await connection.query(query, params);

      // 格式化返回数据
      const formattedCustomers = customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        code: customer.code,
        contact_person: customer.contact_person,
        contact: customer.contact_person, // 兼容字段
        contact_phone: customer.contact_phone,
        phone: customer.contact_phone, // 兼容字段
        delivery_address: customer.delivery_address,
        address: customer.delivery_address, // 兼容字段
      }));

      ResponseHandler.success(res, formattedCustomers, '操作成功');
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('Error getting customers:', error);
    ResponseHandler.error(res, 'Error getting customers', 'SERVER_ERROR', 500, error);
  }
};

exports.getCustomer = async (req, res) => {
  try {
    const customerId = req.params.id;

    const { getConnection } = require('../../../config/db');
    const connection = await getConnection();

    try {
      const [customers] = await connection.query(
        'SELECT id, name, code, contact_person, contact_phone, delivery_address FROM customers WHERE id = ?',
        [customerId]
      );

      if (customers.length === 0) {
        return ResponseHandler.error(res, 'Customer not found', 'NOT_FOUND', 404);
      }

      const customer = customers[0];

      // 格式化返回数据
      const formattedCustomer = {
        id: customer.id,
        name: customer.name,
        code: customer.code,
        contact_person: customer.contact_person,
        contact: customer.contact_person, // 兼容字段
        contact_phone: customer.contact_phone,
        phone: customer.contact_phone, // 兼容字段
        delivery_address: customer.delivery_address,
        address: customer.delivery_address, // 兼容字段
      };

      ResponseHandler.success(res, formattedCustomer, '操作成功');
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('Error getting customer:', error);
    ResponseHandler.error(res, 'Error getting customer', 'SERVER_ERROR', 500, error);
  }
};

exports.createCustomer = async (req, res) => {
  try {
    const customer = await SalesDao.createCustomer(req.body);
    ResponseHandler.success(res, customer, '创建成功', 201);
  } catch (error) {
    logger.error('Error creating customer:', error);
    ResponseHandler.error(res, 'Error creating customer', 'SERVER_ERROR', 500, error);
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const customer = await SalesDao.updateCustomer(req.params.id, req.body);
    res.json(customer);
  } catch (error) {
    logger.error('Error updating customer:', error);
    ResponseHandler.error(res, 'Error updating customer', 'SERVER_ERROR', 500, error);
  }
};

// Sales Quotation Controllers
exports.getSalesQuotations = async (req, res) => {
  try {
    const { search, status, startDate, endDate, page = 1, pageSize = 20 } = req.query;

    // 构建查询条件
    const conditions = {};
    const params = [];
    let whereClause = '';

    if (search) {
      whereClause += ' AND (q.quotation_no LIKE ? OR c.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (status) {
      whereClause += ' AND q.status = ?';
      params.push(status);
    }

    if (startDate && endDate) {
      whereClause += ' AND q.created_at BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    // 计算分页参数
    // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    const actualPageSize = parseInt(pageSize);
    const offset = (parseInt(page) - 1) * actualPageSize;

    // 获取连接
    const conn = await getConnection();

    try {
      // 查询总数
      const [countRows] = await conn.query(
        `SELECT COUNT(*) as total FROM sales_quotations q
         LEFT JOIN customers c ON q.customer_id = c.id
         WHERE 1=1 ${whereClause}`,
        params
      );

      const total = countRows[0].total;

      // 查询分页数据
      const [rows] = await conn.query(
        `SELECT q.*, c.name as customerName,
                COALESCE(u.real_name, u.username) as creator_name
         FROM sales_quotations q
         LEFT JOIN customers c ON q.customer_id = c.id
         LEFT JOIN users u ON q.created_by = u.id
         WHERE 1=1 ${whereClause}
         ORDER BY q.created_at DESC
         LIMIT ${actualPageSize} OFFSET ${offset}`,
        params
      );

      // 批量查询所有明细（避免N+1查询问题）
      let quotations = rows;
      if (rows.length > 0) {
        const quotationIds = rows.map((q) => q.id);
        const placeholders = quotationIds.map(() => '?').join(',');
        const [allItems] = await conn.query(
          `SELECT * FROM sales_quotation_items WHERE quotation_id IN (${placeholders})`,
          quotationIds
        );

        // 按quotation_id分组
        const itemsMap = {};
        allItems.forEach((item) => {
          if (!itemsMap[item.quotation_id]) {
            itemsMap[item.quotation_id] = [];
          }
          itemsMap[item.quotation_id].push(item);
        });

        // 组装数据
        quotations = rows.map((quotation) => ({
          ...quotation,
          items: itemsMap[quotation.id] || [],
        }));
      }

      res.json({
        items: quotations,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      });
    } finally {
      // 释放连接
      conn.release();
    }
  } catch (error) {
    logger.error('Error getting sales quotations:', error);
    ResponseHandler.error(res, 'Error getting sales quotations', 'SERVER_ERROR', 500, error);
  }
};

// 添加销售报价单统计数据接口
exports.getSalesQuotationStatistics = async (req, res) => {
  // 获取数据库连接
  const conn = await getConnection();

  try {
    // 获取当前月份
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const firstDay = firstDayOfMonth.toISOString().split('T')[0];
    const lastDay = lastDayOfMonth.toISOString().split('T')[0];

    // 查询当月报价单数量和金额
    const [monthlyData] = await conn.query(
      `SELECT COUNT(*) as count, SUM(total_amount) as amount
       FROM sales_quotations
       WHERE created_at BETWEEN ? AND ?`,
      [firstDay, lastDay]
    );

    // 查询转化为订单的报价单数量
    const [convertedData] = await conn.query(
      `SELECT COUNT(*) as count
       FROM sales_quotations
       WHERE status = '已转订单'
       AND created_at BETWEEN ? AND ?`,
      [firstDay, lastDay]
    );

    // 计算转化率
    const monthlyCount = monthlyData[0].count || 0;
    const convertedCount = convertedData[0].count || 0;
    const conversionRate = monthlyCount > 0 ? convertedCount / monthlyCount : 0;

    res.json({
      monthly_count: monthlyCount,
      monthly_amount: monthlyData[0].amount || 0,
      conversion_rate: conversionRate,
    });
  } catch (error) {
    logger.error('Error getting quotation statistics:', error);
    ResponseHandler.error(res, 'Error getting quotation statistics', 'SERVER_ERROR', 500, error);
  } finally {
    // 释放连接
    conn.release();
  }
};

exports.getSalesQuotation = async (req, res) => {
  // 获取数据库连接
  const conn = await getConnection();

  try {
    // 查询报价单主表
    const [quotationRows] = await conn.query(
      `SELECT q.*, c.name as customer_name
       FROM sales_quotations q
       LEFT JOIN customers c ON q.customer_id = c.id
       WHERE q.id = ?`,
      [req.params.id]
    );

    if (quotationRows.length === 0) {
      return ResponseHandler.error(res, 'Sales quotation not found', 'NOT_FOUND', 404);
    }

    const quotation = quotationRows[0];

    // 查询报价单明细，关联产品表获取产品名称和规格
    const [itemRows] = await conn.query(
      `SELECT
        sqi.*,
        m.name as product_name,
        m.specs as specification
       FROM sales_quotation_items sqi
       LEFT JOIN materials m ON sqi.product_id = m.id
       WHERE sqi.quotation_id = ?`,
      [req.params.id]
    );

    // 组合数据
    quotation.items = itemRows;

    res.json(quotation);
  } catch (error) {
    logger.error('Error getting sales quotation:', error);
    ResponseHandler.error(res, 'Error getting sales quotation', 'SERVER_ERROR', 500, error);
  } finally {
    // 释放连接
    conn.release();
  }
};

exports.createSalesQuotation = async (req, res) => {
  // 获取数据库连接
  const conn = await getConnection();

  try {
    // 开始事务
    await conn.beginTransaction();

    const { quotation, items } = req.body;

    // 生成报价单号 QUO + 年月日 + 3位序号
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    // 查询当天最大序号
    const [results] = await conn.query(
      'SELECT MAX(quotation_no) as max_no FROM sales_quotations WHERE quotation_no LIKE ?',
      [`QUO${dateStr}%`]
    );

    let sequence = 1;
    if (results[0].max_no) {
      // 提取序号部分并增加1
      const currentSequence = parseInt(results[0].max_no.slice(-3));
      sequence = currentSequence + 1;
    }

    // 确保序号格式为3位
    const sequenceStr = sequence.toString().padStart(3, '0');
    const quotationNo = `QUO${dateStr}${sequenceStr}`;

    // 插入报价单主表
    const [result] = await conn.query(
      `INSERT INTO sales_quotations 
       (quotation_no, customer_id, total_amount, validity_date, status, remarks, created_by, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        quotationNo,
        quotation.customer_id,
        quotation.total_amount || 0,
        formatDateToMySQLDate(quotation.validity_date) ||
        formatDateToMySQLDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
        quotation.status === '待确认' ? 'draft' : quotation.status || 'draft',
        quotation.remarks || '',
        req.user ? req.user.id : 1,
      ]
    );

    const quotationId = result.insertId;

    // ✅ 批量校验产品存在性
    if (items && items.length > 0) {
      const productIds = items.map(i => i.product_id).filter(Boolean);
      if (productIds.length > 0) {
        const placeholders = productIds.map(() => '?').join(',');
        const [existingProducts] = await conn.query(
          `SELECT id FROM materials WHERE id IN (${placeholders})`,
          productIds
        );
        const existingIds = new Set(existingProducts.map(p => p.id));
        const missing = productIds.filter(id => !existingIds.has(id));
        if (missing.length > 0) {
          throw new Error(`以下产品ID在物料表中不存在: ${missing.join(', ')}`);
        }
      }

      // ✅ 批量 INSERT
      const valuesPlaceholders = items.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const values = [];
      for (const item of items) {
        values.push(
          quotationId,
          item.product_id || null,
          item.quantity,
          item.unit_price,
          item.total_price || item.quantity * item.unit_price
        );
      }
      await conn.query(
        `INSERT INTO sales_quotation_items 
         (quotation_id, product_id, quantity, unit_price, total_price) 
         VALUES ${valuesPlaceholders}`,
        values
      );
    }

    // 提交事务
    await conn.commit();

    ResponseHandler.success(
      res,
      {
        id: quotationId,
        quotation_no: quotationNo,
        message: 'Quotation created successfully',
      },
      '创建成功',
      201
    );
  } catch (error) {
    // 回滚事务
    await conn.rollback();
    logger.error('Error creating sales quotation:', error);
    ResponseHandler.error(res, 'Error creating sales quotation', 'SERVER_ERROR', 500, error);
  } finally {
    // 释放连接
    conn.release();
  }
};

exports.updateSalesQuotation = async (req, res) => {
  // 获取数据库连接
  const conn = await getConnection();

  try {
    // 开始事务
    await conn.beginTransaction();

    const { id } = req.params;
    const { quotation, items } = req.body;

    // 更新报价单主表
    await conn.query(
      `UPDATE sales_quotations 
       SET customer_id = ?, 
           total_amount = ?,
           validity_date = ?,
           status = ?,
           remarks = ?
       WHERE id = ?`,
      [
        quotation.customer_id,
        quotation.total_amount || 0,
        formatDateToMySQLDate(quotation.validity_date) ||
        formatDateToMySQLDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
        quotation.status === '待确认' ? 'draft' : quotation.status || 'draft',
        quotation.remarks || '',
        id,
      ]
    );

    // 删除原有明细
    await conn.query('DELETE FROM sales_quotation_items WHERE quotation_id = ?', [id]);

    // ✅ 批量校验 + 插入
    if (items && items.length > 0) {
      const productIds = items.map(i => i.product_id).filter(Boolean);
      if (productIds.length > 0) {
        const placeholders = productIds.map(() => '?').join(',');
        const [existingProducts] = await conn.query(
          `SELECT id FROM materials WHERE id IN (${placeholders})`,
          productIds
        );
        const existingIds = new Set(existingProducts.map(p => p.id));
        const missing = productIds.filter(id => !existingIds.has(id));
        if (missing.length > 0) {
          throw new Error(`以下产品ID在物料表中不存在: ${missing.join(', ')}`);
        }
      }

      const valuesPlaceholders = items.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const values = [];
      for (const item of items) {
        values.push(
          id,
          item.product_id || null,
          item.quantity,
          item.unit_price,
          item.total_price || item.quantity * item.unit_price
        );
      }
      await conn.query(
        `INSERT INTO sales_quotation_items 
         (quotation_id, product_id, quantity, unit_price, total_price) 
         VALUES ${valuesPlaceholders}`,
        values
      );
    }

    // 提交事务
    await conn.commit();

    res.json({
      id,
      message: 'Quotation updated successfully',
    });
  } catch (error) {
    if (conn) {
      await conn.rollback();
    }
    logger.error('Error updating sales quotation:', error);
    ResponseHandler.error(res, 'Error updating sales quotation', 'SERVER_ERROR', 500, error);
  } finally {
    if (conn) {
      conn.release();
    }
  }
};

// 添加删除报价单功能
exports.deleteSalesQuotation = async (req, res) => {
  // 获取数据库连接
  const conn = await getConnection();

  try {
    // 开始事务
    await conn.beginTransaction();

    const { id } = req.params;

    // 检查报价单状态
    const [statusRows] = await conn.query('SELECT status FROM sales_quotations WHERE id = ?', [id]);

    if (statusRows.length === 0) {
      return ResponseHandler.error(res, 'Quotation not found', 'NOT_FOUND', 404);
    }

    // 只允许删除"待确认"状态的报价单
    if (statusRows[0].status !== 'draft') {
      return ResponseHandler.error(res, '只能删除待确认状态的报价单', 'BAD_REQUEST', 400);
    }

    // 删除报价单明细
    await conn.query('DELETE FROM sales_quotation_items WHERE quotation_id = ?', [id]);

    // 删除报价单主表
    await conn.query('DELETE FROM sales_quotations WHERE id = ?', [id]);

    // 提交事务
    await conn.commit();

    res.json({
      message: 'Quotation deleted successfully',
      id,
    });
  } catch (error) {
    // 回滚事务
    await conn.rollback();
    logger.error('Error deleting sales quotation:', error);
    ResponseHandler.error(res, 'Error deleting sales quotation', 'SERVER_ERROR', 500, error);
  } finally {
    // 释放连接
    conn.release();
  }
};

// 报价单转订单
exports.convertQuotationToOrder = async (req, res) => {
  const conn = await getConnection();

  try {
    // 开始事务
    await conn.beginTransaction();

    const { id } = req.params;

    // 获取报价单完整信息
    const [quotationRows] = await conn.query(
      `SELECT q.*, c.name as customer_name, c.contact_person, c.contact_phone, c.address
       FROM sales_quotations q
       LEFT JOIN customers c ON q.customer_id = c.id
       WHERE q.id = ?`,
      [id]
    );

    if (quotationRows.length === 0) {
      await conn.rollback();
      return ResponseHandler.error(res, 'Quotation not found', 'NOT_FOUND', 404);
    }

    const quotation = quotationRows[0];

    // 只允许转换"已确认"状态的报价单
    if (quotation.status !== 'accepted') {
      await conn.rollback();
      return ResponseHandler.error(res, '只能转换已确认状态的报价单为订单', 'BAD_REQUEST', 400);
    }

    // 获取报价单明细
    const [itemRows] = await conn.query(
      `SELECT sqi.*, m.name as product_name, m.specs as specification
       FROM sales_quotation_items sqi
       LEFT JOIN materials m ON sqi.product_id = m.id
       WHERE sqi.quotation_id = ?`,
      [id]
    );

    if (itemRows.length === 0) {
      await conn.rollback();
      return ResponseHandler.error(res, '报价单没有明细项目，无法转换为订单', 'BAD_REQUEST', 400);
    }

    // 生成销售订单号
    const orderNo = await generateOrderNo(conn);

    // 创建销售订单主表数据
    const orderData = {
      order_no: orderNo,
      customer_id: quotation.customer_id,
      quotation_id: quotation.id,
      order_date: new Date().toISOString().split('T')[0],
      delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 默认7天后交货
      delivery_address: quotation.address || '',
      contact_person: quotation.contact_person || '',
      contact_phone: quotation.contact_phone || '',
      total_amount: quotation.total_amount,
      status: 'pending',
      remarks: `由报价单 ${quotation.quotation_no} 转换生成`,
      created_by: req.user ? req.user.id : 1,
    };

    // 插入销售订单主表
    const [orderResult] = await conn.query(
      `INSERT INTO sales_orders (
        order_no, customer_id, quotation_id, order_date, delivery_date,
        delivery_address, contact_person, contact_phone, total_amount,
        status, remarks, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderData.order_no,
        orderData.customer_id,
        orderData.quotation_id,
        orderData.order_date,
        orderData.delivery_date,
        orderData.delivery_address,
        orderData.contact_person,
        orderData.contact_phone,
        orderData.total_amount,
        orderData.status,
        orderData.remarks,
        orderData.created_by,
      ]
    );

    const orderId = orderResult.insertId;

    // 插入销售订单明细
    for (const item of itemRows) {
      await conn.query(
        `INSERT INTO sales_order_items (
          order_id, material_id, quantity, unit_price, amount
        ) VALUES (?, ?, ?, ?, ?)`,
        [orderId, item.product_id, item.quantity, item.unit_price, item.total_price]
      );
    }

    // 更新报价单状态为"已转订单"
    // ✅ 安全修复：添加前置状态条件，防止 TOCTOU 竞态导致已关闭的报价单被重复转订单
    await conn.query('UPDATE sales_quotations SET status = ? WHERE id = ? AND status = ?', ['sent', id, 'accepted']);

    // 提交事务
    await conn.commit();

    res.json({
      message: 'Quotation converted to order successfully',
      quotation_id: id,
      order_id: orderId,
      order_no: orderData.order_no,
    });
  } catch (error) {
    await conn.rollback();
    logger.error('Error converting quotation to order:', error);
    ResponseHandler.error(res, 'Error converting quotation to order', 'SERVER_ERROR', 500, error);
  } finally {
    conn.release();
  }
};

// 获取销售订单操作人列表
exports.getSalesOrderOperators = async (req, res) => {
  try {
    const connection = await db.pool.getConnection();

    try {
      // 获取所有创建过销售订单的用户
      const [operators] = await connection.query(`
        SELECT DISTINCT 
          u.id,
          u.username,
          u.real_name,
          COUNT(so.id) as order_count
        FROM users u
        INNER JOIN sales_orders so ON u.id = so.created_by
        GROUP BY u.id, u.username, u.real_name
        ORDER BY order_count DESC, u.real_name ASC
      `);

      ResponseHandler.success(res, operators, '获取操作人列表成功');
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('获取操作人列表失败:', error);
    ResponseHandler.error(res, '获取操作人列表失败', 'INTERNAL_ERROR', 500);
  }
};

// Sales Order Controllers - 优化版本
exports.getSalesOrders = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      search = '',
      status = '',
      startDate = '',
      endDate = '',
      operator = '',
      sort = 'order_no',
      order = 'desc',
    } = req.query;

    const offset = (page - 1) * pageSize;

    const connection = await db.pool.getConnection();

    try {
      // 构建查询条件
      let whereClause = '';
      const params = [];

      if (search) {
        whereClause += ' AND (so.order_no LIKE ? OR c.name LIKE ? OR so.contract_code LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (status) {
        whereClause += ' AND so.status = ?';
        params.push(status);
      }

      if (startDate) {
        whereClause += ' AND so.created_at >= ?';
        params.push(startDate);
      }

      if (endDate) {
        whereClause += ' AND so.created_at <= ?';
        params.push(endDate);
      }

      if (operator) {
        whereClause += ' AND so.created_by = ?';
        params.push(operator);
      }

      // 优化的单次查询 - 使用JOIN避免N+1问题
      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
      const actualPageSize = parseInt(pageSize);
      const actualOffset = parseInt(offset);
      const [orders] = await connection.query(
        `
      SELECT
        so.id,
        so.order_no,
        so.created_at as order_date,
        so.delivery_date,
        so.status,
        so.total_amount,
        so.contract_code,
        so.remarks,
        so.created_at,
        so.updated_at,
        so.created_by,
        COALESCE(so.is_locked, 0) as is_locked,
        so.locked_at,
        so.locked_by,
        so.lock_reason,
        c.name as customer_name,
        c.contact_person,
        c.contact_phone,
        c.address as delivery_address,
        u.username as locked_by_name,
        creator.username as created_by_name,
        creator.real_name as created_by_real_name,
        (SELECT COUNT(*) FROM sales_outbound WHERE order_id = so.id AND status = 'draft') > 0 as has_draft_outbound,
        COUNT(*) OVER() as total_count
      FROM sales_orders so
      LEFT JOIN customers c ON so.customer_id = c.id
      LEFT JOIN users u ON so.locked_by = u.id
      LEFT JOIN users creator ON so.created_by = creator.id
      WHERE 1=1${whereClause}
      ORDER BY so.order_no DESC
      LIMIT ${actualPageSize} OFFSET ${actualOffset}
    `,
        params
      );

      // 如果需要订单明细，批量获取（可选）
      let orderItems = [];
      if (orders.length > 0) {
        const orderIds = orders.map((order) => order.id);
        const [items] = await connection.query(
          `
        SELECT
          soi.*,
          soi.product_code,
          soi.product_specs,
          m.code as material_code,
          m.name as material_name,
          m.specs as specification,
          u.name as unit_name,
          (soi.quantity * soi.unit_price) as total_price,
          soi.remark,
          COALESCE((
            SELECT SUM(quantity)
            FROM inventory_ledger
            WHERE material_id = soi.material_id
          ), 0) as stock_quantity
        FROM sales_order_items soi
        LEFT JOIN materials m ON soi.material_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        WHERE soi.order_id IN (${orderIds.map(() => '?').join(',')})
        ORDER BY soi.order_id, soi.id
      `,
          orderIds
        );

        orderItems = items;
      }

      // 转换订单数据以匹配前端期望的格式
      const formattedOrders = orders.map((order) => {
        // 获取该订单的物料明细
        const items = orderItems.filter((item) => item.order_id === order.id);

        // ✅ 新增：检查该订单是否有缺料
        let hasShortage = false;
        const shortageItems = [];

        if (items.length > 0) {
          for (const item of items) {
            const orderedQty = parseFloat(item.quantity) || 0;
            const stockQty = parseFloat(item.stock_quantity) || 0;

            // 如果库存不足，标记缺料
            if (stockQty < orderedQty) {
              hasShortage = true;
              shortageItems.push({
                material_code: item.material_code,
                material_name: item.material_name,
                shortage_qty: orderedQty - stockQty,
              });
            }
          }
        }

        // ✅ 新增：根据缺料情况调整状态显示 (动态计算，不修改数据库)
        let displayStatus = order.status;

        // 逻辑：
        // 1. 如果缺料，且当前状态是"待发货"/"可发货"/"待处理"，强制显示为"缺料"
        // 2. 如果不缺料(库存充足)，且当前状态是"已确认"/"缺料"，自动显示为"可发货"

        if (hasShortage) {
          if (['ready_to_ship', 'can_ship', 'pending', 'confirmed'].includes(order.status)) {
            displayStatus = 'shortage';
          }
        } else {
          // 库存充足
          if (['confirmed', 'shortage'].includes(order.status)) {
            displayStatus = 'ready_to_ship';
          }
        }

        return {
          id: order.id,
          order_no: order.order_no,
          customer: order.customer_name,
          customer_name: order.customer_name, // 添加前端期望的字段名
          contract_code: order.contract_code, // 添加合同编码字段
          totalAmount: parseFloat(order.total_amount) || 0,
          total_amount: parseFloat(order.total_amount) || 0, // 添加前端期望的字段名
          orderDate: order.order_date,
          order_date: order.order_date, // 添加前端期望的字段名
          deliveryDate: order.delivery_date,
          delivery_date: order.delivery_date, // 添加前端期望的字段名
          status: displayStatus, // ✅ 使用调整后的状态
          originalStatus: order.status, // ✅ 保存原始状态便于调试
          hasShortage: hasShortage, // ✅ 标记是否有缺料
          shortageItems: shortageItems, // ✅ 保存缺料物料详情
          remark: order.remarks,
          remarks: order.remarks, // 添加前端期望的字段名
          address: order.delivery_address,
          delivery_address: order.delivery_address, // 添加前端期望的字段名
          contact: order.contact_person,
          contact_person: order.contact_person, // 添加前端期望的字段名
          phone: order.contact_phone,
          contact_phone: order.contact_phone, // 添加前端期望的字段名
          created_at: order.created_at,
          updated_at: order.updated_at,
          // 添加创建人相关字段
          created_by: order.created_by,
          created_by_name: order.created_by_name,
          created_by_real_name: order.created_by_real_name,
          // 添加锁定相关字段
          is_locked: Boolean(order.is_locked),
          locked_at: order.locked_at,
          locked_by: order.locked_by,
          lock_reason: order.lock_reason,
          locked_by_name: order.locked_by_name,
          // ✅ 添加草稿出库单标记（控制发货按钮显示）
          has_draft_outbound: Boolean(order.has_draft_outbound),
          // 添加订单物料信息
          items:
            items.map((item) => ({
              code: item.material_code,
              material_code: item.material_code,
              material_name: item.material_name,
              specification: item.specification,
              product_code: item.product_code || '', // 产品编码（当没有物料时）
              product_specs: item.product_specs || '', // 产品规格（当没有物料时）
              quantity: parseFloat(item.quantity) || 0,
              stock_quantity: parseFloat(item.stock_quantity) || 0, // 库存数量
              unit_name: item.unit_name,
              unit_price: parseFloat(item.unit_price) || 0,
              amount: parseFloat(item.amount) || 0,
              total_price: parseFloat(item.total_price) || 0,
              remark: item.remark || '',
              remarks: item.remark || '', // 兼容字段
            })) || [],
        };
      });

      // 返回分页格式
      const total = orders.length > 0 ? orders[0].total_count : 0;

      ResponseHandler.paginated(
        res,
        formattedOrders,
        total,
        parseInt(page),
        parseInt(pageSize),
        '获取销售订单成功'
      );
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('Error getting sales orders:', error);
    ResponseHandler.error(res, 'Error getting sales orders', 'SERVER_ERROR', 500, error);
  }
};

exports.getSalesOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await db.pool.getConnection();

    try {
      // 查询订单主信息
      const [orderResults] = await connection.query(
        `
        SELECT so.*, c.name as customer_name, c.contact_person, c.contact_phone
        FROM sales_orders so
        LEFT JOIN customers c ON so.customer_id = c.id
        WHERE so.id = ? OR so.order_no = ?
      `,
        [id, id]
      );

      if (orderResults.length === 0) {
        return ResponseHandler.error(res, 'Sales order not found', 'NOT_FOUND', 404);
      }

      const order = orderResults[0];

      // 查询订单明细（包含库存数量）
      const [itemResults] = await connection.query(
        `
        SELECT
          soi.*,
          soi.product_code,
          soi.product_specs,
          m.code as material_code,
          m.name as material_name,
          m.specs as specification,
          u.name as unit_name,
          soi.remark,
          COALESCE((
            SELECT SUM(quantity)
            FROM inventory_ledger
            WHERE material_id = soi.material_id
            GROUP BY material_id
          ), 0) as stock_quantity
        FROM sales_order_items soi
        LEFT JOIN materials m ON soi.material_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        WHERE soi.order_id = ?
      `,
        [order.id]
      );

      // 组合结果（修复字段名匹配问题）
      order.items = itemResults.map((item) => ({
        id: item.id,
        material_id: item.material_id, // 添加物料ID字段
        code: item.material_code || item.material_id, // 展开行期望的字段名
        material_code: item.material_code || item.material_id, // 前端期望的字段名
        materialCode: item.material_code || item.material_id, // 保持向后兼容
        name: item.material_name, // 展开行期望的字段名
        material_name: item.material_name, // 前端期望的字段名
        materialName: item.material_name, // 保持向后兼容
        specification: item.specification,
        product_code: item.product_code || '', // 产品编码（当没有物料时）
        product_specs: item.product_specs || '', // 产品规格（当没有物料时）
        quantity: item.quantity,
        stock_quantity: item.stock_quantity || 0, // 库存数量
        unit_price: item.unit_price, // 前端期望的字段名
        unitPrice: item.unit_price, // 保持向后兼容
        amount: item.amount, // 前端期望的字段名
        totalPrice: item.amount, // 保持向后兼容
        unit_name: item.unit_name, // 前端期望的字段名
        unitName: item.unit_name, // 保持向后兼容
        remark: item.remark || '', // 备注字段
        remarks: item.remark || '', // 兼容字段
      }));

      // 添加前端期望的字段以保持兼容性
      order.totalAmount = order.total_amount;

      res.json(order);
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('Error getting sales order:', error);
    ResponseHandler.error(res, 'Error getting sales order', 'SERVER_ERROR', 500, error);
  }
};

// 更新订单状态
exports.updateOrderStatus = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    let { newStatus } = req.body; // 使用 let 而不是 const，因为可能需要根据库存情况调整状态

    // 验证状态值是否有效（使用统一常量）
    const validStatuses = Object.keys(SALES_STATUS);

    if (!validStatuses.includes(newStatus)) {
      await connection.rollback();
      logger.error(
        `❌ [订单状态更新] 无效的状态值: ${newStatus}, 有效状态: ${validStatuses.join(', ')}`
      );
      return ResponseHandler.error(res, `无效的状态值: ${newStatus}`, 'BAD_REQUEST', 400);
    }

    // 检查订单是否存在
    const [checkResult] = await connection.execute('SELECT status FROM sales_orders WHERE id = ?', [
      id,
    ]);

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '订单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = checkResult[0].status;

    // 验证状态转换的合法性
    const validTransitions = {
      draft: [
        'pending',
        'confirmed',
        'in_production',
        'in_procurement',
        'ready_to_ship',
        'shortage',
        'cancelled',
      ],
      pending: [
        'confirmed',
        'in_production',
        'in_procurement',
        'ready_to_ship',
        'shortage',
        'cancelled',
      ],
      confirmed: [
        'in_production',
        'in_procurement',
        'ready_to_ship',
        'shortage',
        'partial_shipped',
        'shipped',
        'completed',
        'cancelled',
      ],
      in_production: [
        'ready_to_ship',
        'shortage',
        'partial_shipped',
        'shipped',
        'completed',
        'cancelled',
      ],
      in_procurement: [
        'ready_to_ship',
        'shortage',
        'partial_shipped',
        'shipped',
        'completed',
        'cancelled',
      ],
      ready_to_ship: ['partial_shipped', 'shipped', 'completed', 'cancelled'],
      shortage: [
        'in_production',
        'in_procurement',
        'ready_to_ship',
        'partial_shipped',
        'shipped',
        'cancelled',
      ],
      partial_shipped: ['shipped', 'completed', 'cancelled'],
      shipped: ['delivered', 'completed'],
      delivered: ['completed'],
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      await connection.rollback();
      const currentStatusText = SALES_STATUS[currentStatus] || currentStatus;
      const newStatusText = SALES_STATUS[newStatus] || newStatus;
      return ResponseHandler.error(
        res,
        `无效的状态转换：订单当前状态为"${currentStatusText}"，不能直接转换为"${newStatusText}"`,
        'BAD_REQUEST',
        400
      );
    }

    // 扩展库存检查触发条件：任何可能需要库存的状态转换都要检查
    const needsInventoryCheck =
      // 原有条件：从草稿/待确认转换到确认/生产状态
      ([STATUS.SALES_ORDER.DRAFT, STATUS.SALES_ORDER.PENDING].includes(currentStatus) &&
        [STATUS.SALES_ORDER.CONFIRMED, STATUS.SALES_ORDER.IN_PRODUCTION].includes(newStatus)) ||
      // 新增条件：任何转换到可发货状态的情况
      newStatus === STATUS.SALES_ORDER.READY_TO_SHIP ||
      // 新增条件：重新确认已有订单（用于修正错误状态）
      (newStatus === STATUS.SALES_ORDER.CONFIRMED &&
        [
          STATUS.SALES_ORDER.READY_TO_SHIP,
          STATUS.SALES_ORDER.IN_PRODUCTION,
          STATUS.SALES_ORDER.IN_PROCUREMENT,
        ].includes(currentStatus));

    if (needsInventoryCheck) {
      logger.info(
        `🔍 开始库存检查 - 订单ID: ${id}, 当前状态: ${currentStatus}, 目标状态: ${newStatus}`
      );

      // 获取订单明细
      const [orderItems] = await connection.execute(
        `SELECT soi.*, m.name as material_name, m.code as material_code, ms.type as source_type
         FROM sales_order_items soi
         LEFT JOIN materials m ON soi.material_id = m.id
         LEFT JOIN material_sources ms ON m.material_source_id = ms.id
         WHERE soi.order_id = ?`,
        [id]
      );

      logger.info(`📋 找到订单明细 ${orderItems.length} 项`);

      if (orderItems.length > 0) {
        // 检查库存并自动生成生产计划/采购申请
        const insufficientItems = [];
        const incompleteMaterials = []; // 收集信息不完整的物料

        for (const item of orderItems) {
          if (item.material_id) {
            // 验证物料信息是否完整
            const [materialInfo] = await connection.execute(
              'SELECT code, category_id, unit_id, material_source_id FROM materials WHERE id = ?',
              [item.material_id]
            );

            if (materialInfo.length > 0) {
              const material = materialInfo[0];
              const isComplete =
                material.code &&
                material.category_id &&
                material.unit_id &&
                material.material_source_id;

              if (!isComplete) {
                // 收集缺失的字段信息
                const missingFields = [];
                if (!material.code) missingFields.push('物料编码');
                if (!material.category_id) missingFields.push('物料分类');
                if (!material.unit_id) missingFields.push('计量单位');
                if (!material.material_source_id) missingFields.push('物料来源');

                incompleteMaterials.push({
                  name: item.material_name || '未知物料',
                  missingFields: missingFields,
                });

                logger.warn(
                  `⚠️  物料信息不完整: ${item.material_name} - 缺少: ${missingFields.join('、')}`
                );
                continue; // 跳过此物料，不检查库存
              }
            }

            // 检查库存
            const [stockResult] = await connection.execute(
              `SELECT COALESCE(SUM(quantity), 0) as current_quantity
               FROM inventory_ledger
               WHERE material_id = ?`,
              [item.material_id]
            );

            const currentStock = parseFloat(stockResult[0]?.current_quantity || 0);
            const requiredQuantity = parseFloat(item.quantity);

            logger.info(
              `📦 物料 ${item.material_name} (${item.material_code}): 需要${requiredQuantity}, 库存${currentStock}`
            );

            if (currentStock < requiredQuantity) {
              insufficientItems.push({
                material_id: item.material_id,
                material_name: item.material_name,
                material_code: item.material_code,
                source_type: item.source_type,
                required: requiredQuantity,
                available: currentStock,
                shortage: requiredQuantity - currentStock,
              });
              logger.info(
                `❌ 库存不足: ${item.material_name}, 缺少${requiredQuantity - currentStock}`
              );
            } else {
              logger.info(`✅ 库存充足: ${item.material_name}`);
            }
          }
        }

        // 如果有物料信息不完整，不允许确认订单
        if (incompleteMaterials.length > 0) {
          await connection.rollback();

          // 构建详细的错误信息
          const errorDetails = incompleteMaterials
            .map((m) => `【${m.name}】缺少: ${m.missingFields.join('、')}`)
            .join('\n');

          const errorMessage = `订单包含物料信息不完整的明细，请先补充以下信息：\n${errorDetails}`;

          logger.error(`❌ 订单确认失败 - 物料信息不完整:\n${errorDetails}`);
          return ResponseHandler.error(res, errorMessage, 'INCOMPLETE_MATERIAL', 400);
        }

        // 根据库存检查结果决定最终状态
        let finalStatus = newStatus;

        // 如果有库存不足的物料，自动生成生产计划或采购申请
        if (insufficientItems.length > 0) {
          logger.info(
            `⚠️  发现 ${insufficientItems.length} 个物料库存不足，开始生成生产计划/采购申请`
          );
          try {
            await generateProductionAndPurchasePlans(
              connection,
              id,
              insufficientItems,
              req.user || { id: 1, username: 'system', real_name: '系统' }
            );

            // 如果生成了计划，状态应该是in_production或in_procurement
            if (newStatus === STATUS.SALES_ORDER.CONFIRMED) {
              // 根据物料来源类型决定状态
              const hasInternal = insufficientItems.some((item) => item.source_type === 'internal');
              const hasExternal = insufficientItems.some((item) => item.source_type === 'external');

              logger.info(`📊 物料来源分析: 自产物料=${hasInternal}, 外购物料=${hasExternal}`);

              if (hasInternal && hasExternal) {
                // 既有自产又有外购，优先标记为生产中（因为生产周期通常更长）
                finalStatus = STATUS.SALES_ORDER.IN_PRODUCTION;
                logger.info(
                  `🔄 状态调整为: ${finalStatus} (因同时有自产和外购物料库存不足，优先标记为生产中)`
                );
              } else if (hasInternal) {
                finalStatus = STATUS.SALES_ORDER.IN_PRODUCTION;
                logger.info(`🔄 状态调整为: ${finalStatus} (因有自产物料库存不足)`);
              } else if (hasExternal) {
                finalStatus = STATUS.SALES_ORDER.IN_PROCUREMENT;
                logger.info(`🔄 状态调整为: ${finalStatus} (因有外购物料库存不足)`);
              }
            }
          } catch (planError) {
            logger.error('自动生成生产计划/采购申请失败:', planError);
            // 不阻止状态更新，但记录错误
          }
        } else {
          // 库存充足，可以直接发货
          if (newStatus === STATUS.SALES_ORDER.CONFIRMED) {
            finalStatus = STATUS.SALES_ORDER.READY_TO_SHIP;
            logger.info(`🔄 状态调整为: ${finalStatus} (库存充足)`);
          }
        }

        // 使用最终状态
        newStatus = finalStatus;
      }
    }

    // 更新订单状态
    await connection.execute(
      'UPDATE sales_orders SET status = ?, updated_at = NOW() WHERE id = ?',
      [newStatus, id]
    );

    // 获取更新后的订单
    const [updatedOrder] = await connection.execute('SELECT * FROM sales_orders WHERE id = ?', [
      id,
    ]);

    await connection.commit();
    res.json(updatedOrder[0]);
  } catch (error) {
    await connection.rollback();
    logger.error('更新订单状态时出错:', error);
    ResponseHandler.error(res, '更新订单状态失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

exports.createSalesOrder = async (req, res) => {
  try {
    const orderData = req.body;

    if (!orderData || !orderData.items || !Array.isArray(orderData.items)) {
      return ResponseHandler.error(res, '订单数据格式不正确', 'BAD_REQUEST', 400);
    }

    // 验证必要字段
    if (!orderData.customer_id) {
      return ResponseHandler.error(res, '客户ID不能为空', 'BAD_REQUEST', 400);
    }

    // 设置创建者信息
    if (req.user && req.user.id) {
      orderData.createdBy = req.user.id;
    } else {
      orderData.createdBy = 1; // 假设1是默认管理员ID
    }

    // 准备订单数据
    const order = {
      orderNo: await generateSalesOrderNo(connection), // 使用统一的订单号生成规则
      customerId: orderData.customer_id,
      quotationId: orderData.quotation_id || null,
      contractCode: orderData.contract_code || '',
      totalAmount: orderData.total_amount || 0,
      taxRate: orderData.taxRate || orderData.tax_rate || 0.13, // 税率
      taxAmount: orderData.tax_amount || 0, // 税额
      subtotal: orderData.subtotal || 0, // 不含税金额
      paymentTerms: orderData.payment_terms || '',
      // 确保日期格式正确 (YYYY-MM-DD)
      deliveryDate: orderData.delivery_date
        ? new Date(orderData.delivery_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      status: orderData.status || 'draft',
      remarks: orderData.remark || '',
      createdBy: orderData.createdBy,
    };

    // 处理订单项 - 支持自动从物料获取销售价格
    const items = [];
    for (let index = 0; index < orderData.items.length; index++) {
      const item = orderData.items[index];
      const quantity = parseFloat(item.quantity) || 0;
      let unit_price = parseFloat(item.unit_price) || 0;

      // 验证必要字段
      if (!item.material_id || item.material_id === null || item.material_id === '') {
        logger.error(`订单项 ${index + 1} 缺少物料ID:`, item);
        throw new Error(`订单项 ${index + 1} 缺少物料ID，请确保已选择物料`);
      }

      // 验证 material_id 是有效数字
      const materialId = parseInt(item.material_id);
      if (isNaN(materialId) || materialId <= 0) {
        logger.error(`订单项 ${index + 1} 物料ID无效:`, item.material_id);
        throw new Error(`订单项 ${index + 1} 物料ID无效: ${item.material_id}`);
      }

      if (quantity <= 0) {
        throw new Error(`订单项 ${index + 1} 的数量必须大于0`);
      }

      // 如果没有提供单价，自动从物料主数据获取销售价格
      if (unit_price <= 0) {
        try {
          const [materialInfo] = await db.pool.execute('SELECT price FROM materials WHERE id = ?', [
            materialId,
          ]);
          if (materialInfo.length > 0 && materialInfo[0].price > 0) {
            unit_price = parseFloat(materialInfo[0].price);
            logger.info(`订单项 ${index + 1} 自动引用物料销售价格: ${unit_price}`);
          }
        } catch (err) {
          logger.warn(`获取物料 ${materialId} 价格失败:`, err);
        }
      }

      const amount = quantity * unit_price;

      items.push({
        material_id: materialId,
        quantity: quantity,
        unit_price: unit_price,
        amount: amount,
        tax_percent:
          item.tax_percent !== undefined
            ? item.tax_percent
            : item.tax_rate !== undefined
              ? item.tax_rate
              : 0.13,
        remark: item.remark || '',
      });
    }

    // 计算金额：不含税金额、税额、价税合计
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const taxRate = order.taxRate || 0.13;
    const taxAmount = subtotal * taxRate;
    order.subtotal = subtotal;
    order.taxAmount = taxAmount;
    order.totalAmount = subtotal + taxAmount;

    try {
      // 创建销售订单
      const result = await SalesDao.createSalesOrder(order, items);

      // 根据物料来源自动生成后续单据，并获取建议的订单状态
      // 使用统一的生成函数，传入用户信息
      const userInfo = req.user || {
        id: orderData.createdBy,
        username: 'system',
        real_name: '系统',
      };
      const suggestedStatus = await autoGenerateFollowUpDocuments(result.id, items, userInfo);

      // 如果有建议的状态且与当前状态不同，则更新订单状态
      if (suggestedStatus && suggestedStatus !== result.status) {
        await SalesDao.updateSalesOrderStatus(result.id, suggestedStatus);
        result.status = suggestedStatus;
      }

      ResponseHandler.success(res, result, '创建成功', 201);
    } catch (error) {
      logger.error('数据库操作错误:', error);
      ResponseHandler.error(res, '创建订单失败', 'SERVER_ERROR', 500, error);
    }
  } catch (error) {
    logger.error('创建销售订单时出错:', error);
    ResponseHandler.error(res, '创建销售订单时出错', 'SERVER_ERROR', 500, error);
  }
};

exports.updateSalesOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const requestData = req.body;

    // 兼容两种数据格式：
    // 1. { order, items } - 旧格式
    // 2. { customer_id, items, ... } - 新格式（前端直接发送整个对象）
    let order, items;

    if (requestData.order && requestData.items) {
      // 旧格式
      order = requestData.order;
      items = requestData.items;
    } else {
      // 新格式：从请求体中提取items和其他字段
      items = requestData.items || [];
      order = {
        customer_id: requestData.customer_id,
        contract_code: requestData.contract_code,
        delivery_date: requestData.delivery_date,
        order_date: requestData.order_date,
        status: requestData.status,
        notes: requestData.notes,
        remarks: requestData.remarks,
        payment_terms: requestData.payment_terms,
      };
    }

    // 验证必需字段
    if (!order.customer_id) {
      return ResponseHandler.error(res, '客户ID不能为空', 'BAD_REQUEST', 400);
    }

    if (!items || items.length === 0) {
      return ResponseHandler.error(res, '订单明细不能为空', 'BAD_REQUEST', 400);
    }

    // 验证所有物料项都有material_id
    const invalidItems = items.filter((item) => !item.material_id);
    if (invalidItems.length > 0) {
      return ResponseHandler.error(
        res,
        `有 ${invalidItems.length} 个物料项缺少物料ID`,
        'BAD_REQUEST',
        400
      );
    }

    // 调用数据库函数更新订单
    const updatedOrder = await SalesDao.updateSalesOrder(id, order, items);

    // 如果前端标记需要生成生产/采购计划（编辑订单添加了新物料且库存不足）
    if (requestData.should_generate_plans) {
      try {
        logger.info(`✅ 编辑订单 ${id}，需要生成生产/采购计划`);
        const userInfo = req.user || { id: 1, username: 'system', real_name: '系统' };

        // 自动生成生产计划和采购申请
        await autoGenerateFollowUpDocuments(id, items, userInfo);

        logger.info(`✅ 订单 ${id} 的生产/采购计划已生成`);
      } catch (planError) {
        logger.error('⚠️ 生成生产/采购计划失败:', planError);
        // 不阻止订单更新，只记录错误
      }
    }

    ResponseHandler.success(res, updatedOrder, '订单更新成功');
  } catch (error) {
    logger.error('更新销售订单失败:', error);
    ResponseHandler.error(res, '更新销售订单失败', 'SERVER_ERROR', 500, error);
  }
};

// 添加删除订单功能
exports.deleteSalesOrder = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    connection = await getConnection();
    await connection.beginTransaction();

    // 1. 查询订单当前状态
    const [orderResult] = await connection.query(
      'SELECT id, order_no, status FROM sales_orders WHERE id = ?',
      [id]
    );

    if (orderResult.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: '销售订单不存在' });
    }

    const order = orderResult[0];

    // 2. 仅允许删除草稿(draft)和待审核(pending)状态的订单
    const deletableStatuses = ['draft', 'pending'];
    if (!deletableStatuses.includes(order.status)) {
      await connection.rollback();
      return res.status(400).json({
        error: `无法删除状态为"${order.status}"的订单。仅草稿和待审核状态的订单可以删除。`,
      });
    }

    // 3. 检查是否存在关联的出库单
    const [outboundCheck] = await connection.query(
      'SELECT COUNT(*) as count FROM sales_outbound WHERE order_id = ?',
      [id]
    );
    if (outboundCheck[0].count > 0) {
      await connection.rollback();
      return res.status(400).json({
        error: `此订单已有 ${outboundCheck[0].count} 条关联出库单，无法删除。请先删除相关出库单。`,
      });
    }

    // 4. 检查是否存在关联的退货单
    const [returnCheck] = await connection.query(
      'SELECT COUNT(*) as count FROM sales_returns WHERE order_id = ?',
      [id]
    );
    if (returnCheck[0].count > 0) {
      await connection.rollback();
      return res.status(400).json({
        error: `此订单已有 ${returnCheck[0].count} 条关联退货单，无法删除。请先处理相关退货单。`,
      });
    }

    // 5. 检查是否存在关联的换货单
    const [exchangeCheck] = await connection.query(
      'SELECT COUNT(*) as count FROM sales_exchanges WHERE order_id = ?',
      [id]
    );
    if (exchangeCheck[0].count > 0) {
      await connection.rollback();
      return res.status(400).json({
        error: `此订单已有 ${exchangeCheck[0].count} 条关联换货单，无法删除。请先处理相关换货单。`,
      });
    }

    // 6. 安全删除：先删除明细，再删除主表
    await connection.query('DELETE FROM sales_order_items WHERE order_id = ?', [id]);
    await connection.query('DELETE FROM sales_orders WHERE id = ?', [id]);

    await connection.commit();

    logger.info(`✅ 销售订单 ${order.order_no} (ID: ${id}) 已安全删除，原状态: ${order.status}`);

    res.json({
      message: '销售订单删除成功',
      id: parseInt(id),
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('删除销售订单失败:', error);
    res.status(500).json({ error: '删除销售订单失败: ' + error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// 添加订单统计数据接口
exports.getSalesOrderStatistics = async (req, res) => {
  try {
    // 这里可以实现真实的统计逻辑，现在返回模拟数据
    res.json({
      monthly_count: 10,
      monthly_amount: 35000,
      completion_rate: 0.8,
    });
  } catch (error) {
    logger.error('Error getting order statistics:', error);
    ResponseHandler.error(res, 'Error getting order statistics', 'SERVER_ERROR', 500, error);
  }
};

// 添加总体销售统计数据接口
exports.getSalesStatistics = async (req, res) => {
  try {
    // 获取当前月份的开始和结束日期
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const currentMonthStartStr = currentMonthStart.toISOString().slice(0, 10);
    const currentMonthEndStr = currentMonthEnd.toISOString().slice(0, 10);

    // 1. 获取销售订单总体统计
    const [orderStats] = await connection.query(`
      SELECT
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status IN ('${SALES_STATUS_KEYS.DRAFT}', '${SALES_STATUS_KEYS.PENDING}') THEN 1 END) as pending_orders,
        COUNT(CASE WHEN status = '${SALES_STATUS_KEYS.COMPLETED}' THEN 1 END) as completed_orders,
        SUM(total_amount) as total_sales_amount,
        AVG(total_amount) as avg_order_amount
      FROM sales_orders
    `);

    // 2. 获取当月销售统计
    const [monthlyStats] = await connection.query(
      `
      SELECT
        COUNT(*) as monthly_orders,
        SUM(total_amount) as monthly_sales,
        COUNT(CASE WHEN status = '${SALES_STATUS_KEYS.COMPLETED}' THEN 1 END) as monthly_completed
      FROM sales_orders
      WHERE DATE(created_at) BETWEEN ? AND ?
    `,
      [currentMonthStartStr, currentMonthEndStr]
    );

    // 3. 获取销售退货统计
    const [returnStats] = await connection.query(`
      SELECT
        COUNT(*) as returns_count,
        COUNT(CASE WHEN status = '${SALES_STATUS_KEYS.COMPLETED}' THEN 1 END) as completed_returns
      FROM sales_returns
    `);

    // 4. 获取应收账款统计
    const [receivableStats] = await connection.query(`
      SELECT
        SUM(CASE WHEN status = 'paid' THEN balance_amount ELSE 0 END) as collected_amount,
        SUM(CASE WHEN status != 'paid' THEN balance_amount ELSE 0 END) as pending_amount
      FROM ar_invoices
    `);

    // 5. 获取Top5客户销售排名
    const [topCustomers] = await connection.query(`
      SELECT
        c.name,
        SUM(so.total_amount) as sales
      FROM sales_orders so
      LEFT JOIN customers c ON so.customer_id = c.id
      WHERE so.status IN ('completed', 'shipped', 'delivered')
      GROUP BY c.id, c.name
      HAVING sales > 0
      ORDER BY sales DESC
      LIMIT 5
    `);

    // 6. 获取Top5产品销售排名（通过订单明细）
    const [topProducts] = await connection.query(`
      SELECT
        m.name,
        SUM(soi.quantity * soi.unit_price) as sales
      FROM sales_order_items soi
      LEFT JOIN materials m ON soi.material_id = m.id
      LEFT JOIN sales_orders so ON soi.order_id = so.id
      WHERE so.status IN ('completed', 'shipped', 'delivered')
      GROUP BY m.id, m.name
      HAVING sales > 0
      ORDER BY sales DESC
      LIMIT 5
    `);

    // 格式化返回数据
    const stats = orderStats[0] || {};
    const monthly = monthlyStats[0] || {};
    const returns = returnStats[0] || {};
    const receivables = receivableStats[0] || {};

    logger.info('[销售统计] 统计数据获取完成:', {
      total_orders: stats.total_orders,
      monthly_orders: monthly.monthly_orders,
      returns_count: returns.returns_count,
    });

    res.json({
      // 订单统计
      total_sales: parseFloat(stats.total_sales_amount || 0),
      pending_orders: parseInt(stats.pending_orders || 0),
      completed_orders: parseInt(stats.completed_orders || 0),

      // 当月统计
      monthly_sales: parseFloat(monthly.monthly_sales || 0),
      monthly_orders: parseInt(monthly.monthly_orders || 0),
      monthly_completed: parseInt(monthly.monthly_completed || 0),

      // 退货统计
      returns_count: parseInt(returns.returns_count || 0),
      returns_amount: 0, // 退货表中没有金额字段，暂时设为0

      // 应收账款统计
      collected_amount: parseFloat(receivables.collected_amount || 0),
      pending_amount: parseFloat(receivables.pending_amount || 0),

      // Top排名
      top_customers: topCustomers.map((item) => ({
        name: item.name || '未知客户',
        sales: parseFloat(item.sales || 0),
      })),
      top_products: topProducts.map((item) => ({
        name: item.name || '未知产品',
        sales: parseFloat(item.sales || 0),
      })),
    });
  } catch (error) {
    logger.error('Error getting sales statistics:', error);
    ResponseHandler.error(res, 'Error getting sales statistics', 'SERVER_ERROR', 500, error);
  }
};

// 获取销售趋势数据（最近12个月）
exports.getSalesTrend = async (req, res) => {
  try {
    // 获取最近12个月的数据
    const [trendData] = await connection.query(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as order_count,
        SUM(total_amount) as sales_amount
      FROM sales_orders
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        AND status IN ('completed', 'shipped', 'delivered')
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month ASC
    `);

    // 生成最近12个月的月份列表
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = date.toISOString().slice(0, 7); // YYYY-MM格式
      months.push(monthStr);
    }

    // 填充缺失月份的数据
    const trendResult = months.map((month) => {
      const found = trendData.find((item) => item.month === month);
      return {
        month: month,
        order_count: found ? parseInt(found.order_count) : 0,
        sales_amount: found ? parseFloat(found.sales_amount) : 0,
      };
    });

    res.json({
      trend_data: trendResult,
    });
  } catch (error) {
    logger.error('Error getting sales trend:', error);
    ResponseHandler.error(res, 'Error getting sales trend', 'SERVER_ERROR', 500, error);
  }
};

// Sales Outbound Controllers
exports.getSalesOutbound = async (req, res) => {
  try {
    const { page = 1, pageSize = 50, search, startDate, endDate, status } = req.query;
    const offset = (page - 1) * pageSize;

    const connection = await db.pool.getConnection();

    try {
      // 构建查询条件
      let whereClause = '';
      const queryParams = [];

      if (search) {
        whereClause += ' AND (so.outbound_no LIKE ? OR o.order_no LIKE ? OR c.name LIKE ?)';
        queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (startDate) {
        whereClause += ' AND so.delivery_date >= ?';
        queryParams.push(startDate);
      }

      if (endDate) {
        whereClause += ' AND so.delivery_date <= ?';
        queryParams.push(endDate);
      }

      if (status) {
        whereClause += ' AND so.status = ?';
        queryParams.push(status);
      }

      // 查询总数
      const countQuery = `
        SELECT COUNT(*) as total
        FROM sales_outbound so
        LEFT JOIN sales_orders o ON so.order_id = o.id
        LEFT JOIN customers c ON o.customer_id = c.id
        WHERE 1=1 ${whereClause}
      `;

      const [countResult] = await connection.query(countQuery, queryParams);
      const total = parseInt(countResult[0].total) || 0;

      // 查询数据
      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
      const actualPageSize = parseInt(pageSize);
      const actualOffset = parseInt(offset);
      const query = `
        SELECT so.*, o.order_no, o.contract_code, o.customer_id, c.name as customer_name
        FROM sales_outbound so
        LEFT JOIN sales_orders o ON so.order_id = o.id
        LEFT JOIN customers c ON o.customer_id = c.id
        WHERE 1=1 ${whereClause}
        ORDER BY so.created_at DESC
        LIMIT ${actualPageSize} OFFSET ${actualOffset}
      `;

      const [results] = await connection.query(query, queryParams);

      // 处理多订单出库的客户信息和关联订单信息
      for (const outbound of results) {
        if (outbound.is_multi_order && outbound.related_orders) {
          let relatedOrderIds = [];

          try {
            // 解析关联订单ID
            if (typeof outbound.related_orders === 'string') {
              relatedOrderIds = JSON.parse(outbound.related_orders);
            } else {
              relatedOrderIds = outbound.related_orders;
            }

            if (relatedOrderIds.length > 0) {
              // 查询关联订单信息
              const [relatedOrders] = await connection.query(
                `
                SELECT so.id, so.order_no, c.name as customer_name
                FROM sales_orders so
                LEFT JOIN customers c ON so.customer_id = c.id
                WHERE so.id IN (?)
              `,
                [relatedOrderIds]
              );

              outbound.related_order_details = relatedOrders;
              outbound.order_nos = relatedOrders.map((order) => order.order_no).join(', ');

              // 统一客户名称（如果所有订单都是同一客户）
              const customerNames = [
                ...new Set(relatedOrders.map((o) => o.customer_name).filter((n) => n)),
              ];
              if (customerNames.length === 1) {
                outbound.customer_name = customerNames[0];
              } else if (customerNames.length > 1) {
                outbound.customer_name = `多个客户 (${customerNames.length}个)`;
              }
            }
          } catch (error) {
            logger.error('处理多订单出库信息失败:', error);
          }
        }
      }

      // 统计不同状态的数量
      const statusQuery = `
        SELECT status, COUNT(*) as count
        FROM sales_outbound
        GROUP BY status
      `;

      const [statusCounts] = await connection.query(statusQuery);


      // 格式化状态统计数据
      const statusStats = {
        total: total,
        pendingCount: 0,
        processingCount: 0,
        completedCount: 0,
        cancelledCount: 0,
      };

      statusCounts.forEach((item) => {
        if (item.status === STATUS.EXCHANGE.PENDING) statusStats.pendingCount = item.count;
        if (item.status === STATUS.EXCHANGE.PROCESSING) statusStats.processingCount = item.count;
        if (item.status === STATUS.EXCHANGE.COMPLETED) statusStats.completedCount = item.count;
        if (item.status === STATUS.EXCHANGE.CANCELLED) statusStats.cancelledCount = item.count;
      });

      ResponseHandler.success(
        res,
        {
          list: results,
          total,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          statusStats,
        },
        '获取销售出库单成功'
      );
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('获取销售出库单列表失败:', error);
    res.status(500).json({ error: '获取销售出库单列表失败' });
  }
};

exports.getSalesOutboundById = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    connection = await getConnection();

    // 查询出库单主信息
    const query = `
      SELECT so.*, o.order_no, o.contract_code, o.customer_id, c.name as customer_name, c.contact_person, c.contact_phone
      FROM sales_outbound so
      LEFT JOIN sales_orders o ON so.order_id = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE so.id = ?
    `;

    const [results] = await connection.query(query, [id]);

    if (results.length === 0) {
      return res.status(404).json({ error: '出库单不存在' });
    }

    const outbound = results[0];

    // 查询销售出库单明细
    try {

      // 查询明细数据
      const itemsQuery = `
        SELECT soi.id, soi.outbound_id, soi.product_id, soi.quantity
        FROM sales_outbound_items soi
        WHERE soi.outbound_id = ?
      `;

      const [itemsResult] = await connection.query(itemsQuery, [id]);


      // 如果有明细数据，查询相应的物料信息
      if (itemsResult.length > 0) {
        // 提取所有物料ID
        const materialIds = itemsResult.map((item) => item.product_id);

        // 查询物料信息
        const materialsQuery = `
          SELECT id, code, name, specs, unit_id
          FROM materials
          WHERE id IN (?)
        `;

        const [materialsResult] = await connection.query(materialsQuery, [materialIds]);

        // 查询单位信息
        const unitIds = materialsResult
          .map((m) => m.unit_id)
          .filter((id) => id !== null && id !== undefined);

        let unitsResult = [];
        if (unitIds.length > 0) {
          const unitsQuery = `
            SELECT id, name
            FROM units
            WHERE id IN (?)
          `;

          [unitsResult] = await connection.query(unitsQuery, [unitIds]);
        }

        // 查询该订单下各物料的历史已退数量（排除已拒绝和已取消的退货单）
        let returnedMap = new Map();
        if (outbound.order_id) {
          const [returnedRows] = await connection.query(
            `SELECT sri.product_id, SUM(sri.quantity) AS total_returned
             FROM sales_return_items sri
             JOIN sales_returns sr ON sri.return_id = sr.id
             WHERE sr.order_id = ? AND sr.status NOT IN ('rejected', 'cancelled')
             GROUP BY sri.product_id`,
            [outbound.order_id]
          );
          returnedRows.forEach(row => {
            returnedMap.set(row.product_id, parseFloat(row.total_returned) || 0);
          });
        }

        // 组装完整的明细数据
        const items = itemsResult.map((item) => {
          const material = materialsResult.find((m) => m.id === item.product_id) || {};
          const unit = material.unit_id ? unitsResult.find((u) => u.id === material.unit_id) : null;
          const returnedQty = returnedMap.get(item.product_id) || 0;

          return {
            id: item.id,
            outbound_id: item.outbound_id,
            product_id: item.product_id,
            quantity: item.quantity,
            returned_quantity: returnedQty,
            returnable_quantity: Math.max(0, item.quantity - returnedQty),
            material_name: material.name,
            material_code: material.code,
            specification: material.specs,
            unit_name: unit ? unit.name : null,
            unit_id: material.unit_id,
          };
        });

        // 转换字段名称保持兼容性
        const formattedItems = items.map((item) => ({
          id: item.id,
          outbound_id: item.outbound_id,
          product_id: item.product_id,
          quantity: item.quantity,
          returned_quantity: item.returned_quantity,
          returnable_quantity: item.returnable_quantity,
          product_name: item.material_name || `未知物料(ID:${item.product_id})`,
          product_code: item.material_code || '未知代码',
          specification: item.specification || '无规格信息',
          unit: item.unit_name || '未知单位',
        }));

        outbound.items = formattedItems;
      } else {
        outbound.items = [];
      }

      // 处理多订单关联信息
      if (outbound.is_multi_order && outbound.related_orders) {
        try {
          let relatedOrderIds = [];
          const rawValue = outbound.related_orders;

          // 处理不同类型的数据
          if (typeof rawValue === 'string') {
            // 尝试直接JSON解析
            try {
              relatedOrderIds = JSON.parse(rawValue);
            } catch (jsonError) {
              // 如果JSON解析失败，尝试解析逗号分隔的ID列表
              logger.info('JSON解析失败，尝试解析逗号分隔的ID:', rawValue);
              relatedOrderIds = rawValue
                .split(',')
                .map((id) => parseInt(id.trim()))
                .filter((id) => !isNaN(id));
            }
          } else if (Array.isArray(rawValue)) {
            relatedOrderIds = rawValue;
          } else if (Buffer.isBuffer(rawValue)) {
            // 处理Buffer类型
            const stringValue = rawValue.toString('utf8');
            try {
              relatedOrderIds = JSON.parse(stringValue);
            } catch (jsonError) {
              relatedOrderIds = stringValue
                .split(',')
                .map((id) => parseInt(id.trim()))
                .filter((id) => !isNaN(id));
            }
          } else {
            // 其他类型，尝试转换为字符串处理
            const stringValue = String(rawValue);
            try {
              relatedOrderIds = JSON.parse(stringValue);
            } catch (jsonError) {
              relatedOrderIds = stringValue
                .split(',')
                .map((id) => parseInt(id.trim()))
                .filter((id) => !isNaN(id));
            }
          }

          if (relatedOrderIds.length > 0) {
            // 查询关联订单信息
            const [relatedOrders] = await connection.query(
              `
              SELECT so.id, so.order_no, c.name as customer_name
              FROM sales_orders so
              LEFT JOIN customers c ON so.customer_id = c.id
              WHERE so.id IN (?)
            `,
              [relatedOrderIds]
            );

            outbound.related_order_details = relatedOrders;
            outbound.order_nos = relatedOrders.map((order) => order.order_no).join(', ');

            // 统一客户名称（如果所有订单都是同一客户）
            const customerNames = [
              ...new Set(relatedOrders.map((o) => o.customer_name).filter((n) => n)),
            ];
            if (customerNames.length === 1) {
              outbound.customer_name = customerNames[0];
            } else if (customerNames.length > 1) {
              outbound.customer_name = `多个客户 (${customerNames.length}个)`;
            }
          }
        } catch (error) {
          logger.error('解析关联订单信息失败:', error, '原始值:', outbound.related_orders);
          outbound.related_order_details = [];
          outbound.order_nos = '';
        }
      } else if (outbound.order_no) {
        // 单订单情况
        outbound.order_nos = outbound.order_no;
        outbound.related_order_details = [
          {
            id: outbound.order_id,
            order_no: outbound.order_no,
            customer_name: outbound.customer_name,
          },
        ];
      }

      res.json(outbound);
    } catch (error) {
      throw error;
    }
  } catch (error) {
    logger.error('获取销售出库单详情失败:', error);
    res.status(500).json({ error: '获取销售出库单详情失败: ' + error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// 使用统一的编号生成服务 - 替代原 generateSalesOutboundNo 函数
async function generateSalesOutboundNo(conn) {
  return await CodeGenerators.generateOutboundCode(conn);
}

exports.createSalesOutbound = async (req, res) => {
  let connection;

  try {
    const {
      order_id,
      related_orders: rawRelatedOrders = [],
      is_multi_order = false,
      delivery_date,
      status,
      remarks,
      items = [],
    } = req.body;

    // 处理related_orders参数，支持JSON字符串或数组
    let related_orders = [];
    if (typeof rawRelatedOrders === 'string') {
      try {
        related_orders = JSON.parse(rawRelatedOrders);
      } catch (error) {
        logger.error('解析related_orders JSON失败:', error);
        return res.status(400).json({ error: '无效的关联订单格式' });
      }
    } else if (Array.isArray(rawRelatedOrders)) {
      related_orders = rawRelatedOrders;
    }
    const created_by = req.user?.id || 1; // 使用用户ID而不是用户名，默认为1（系统用户）

    logger.info(
      '销售出库单创建请求:',
      JSON.stringify(
        {
          order_id,
          related_orders,
          is_multi_order,
          delivery_date,
          status,
          remarks,
          items_count: items?.length || 0,
        },
        null,
        2
      )
    );

    // 验证日期格式转换
    let formattedDeliveryDate;
    try {
      // 支持ISO格式日期或标准日期字符串
      if (delivery_date) {
        formattedDeliveryDate = new Date(delivery_date).toISOString().split('T')[0];
      } else {
        formattedDeliveryDate = new Date().toISOString().split('T')[0];
      }
    } catch (error) {
      logger.error('日期格式转换错误:', error);
      return res.status(400).json({ error: '无效的日期格式' });
    }

    connection = await DBManager.getConnection();
    await connection.beginTransaction();

    // 🔒 业务规则检查：防止重复创建草稿出库单
    // 策略：只要该订单存在状态为'draft'的出库单，就不允许创建新的
    // 目的：确保每个订单同一时间只有一个待处理的出库单，避免重复操作
    const duplicateCheckQuery = `
      SELECT id, outbound_no, status, created_at
      FROM sales_outbound
      WHERE order_id = ?
        AND status = 'draft'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const [recentDrafts] = await connection.query(duplicateCheckQuery, [order_id]);

    if (recentDrafts.length > 0) {
      await connection.rollback();

      logger.warn('🔒 业务检查：检测到已存在草稿出库单，拒绝创建', {
        order_id,
        existing_outbound: recentDrafts[0].outbound_no,
        existing_status: recentDrafts[0].status,
        created_at: recentDrafts[0].created_at,
        request_user: created_by,
        reason: '已存在草稿出库单',
      });

      return res.status(409).json({
        success: false,
        error: `该订单已存在草稿状态的出库单 ${recentDrafts[0].outbound_no}。请先完成或取消现有出库单，才能创建新的出库单。`,
        code: 'DUPLICATE_DRAFT_EXISTS',
        existing_outbound_no: recentDrafts[0].outbound_no,
      });
    }

    logger.info('✅ 幂等性检查通过，开始创建出库单', { order_id, created_by });

    // 验证订单存在性
    if (is_multi_order) {
      // 多订单模式：验证所有关联订单存在
      if (!related_orders || related_orders.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: '多订单模式下必须提供关联订单列表' });
      }

      const [orderCheck] = await connection.query(
        'SELECT id, order_no, customer_id FROM sales_orders WHERE id IN (?)',
        [related_orders]
      );

      if (orderCheck.length !== related_orders.length) {
        await connection.rollback();
        return res.status(400).json({ error: '部分关联订单不存在' });
      }

      // 检查是否所有订单属于同一客户（可选验证）
      const customerIds = [...new Set(orderCheck.map((order) => order.customer_id))];
      if (customerIds.length > 1) {
        logger.warn('警告：多订单出库涉及不同客户，请确认业务逻辑');
      }
    } else {
      // 单订单模式：验证单个订单存在
      if (order_id) {
        const [orderCheck] = await connection.query('SELECT id FROM sales_orders WHERE id = ?', [
          order_id,
        ]);

        if (orderCheck.length === 0) {
          await connection.rollback();
          return res.status(400).json({ error: '关联的订单不存在' });
        }
      }
    }

    // 生成出库单编号
    const outboundNo = await generateSalesOutboundNo(connection);

    // 插入出库单主表
    const insertQuery = `
      INSERT INTO sales_outbound (
        outbound_no, order_id, is_multi_order, related_orders,
        delivery_date, status, remarks, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await connection.query(insertQuery, [
      outboundNo,
      is_multi_order ? null : order_id,
      is_multi_order,
      is_multi_order ? JSON.stringify(related_orders) : null,
      formattedDeliveryDate,
      status || 'draft',
      remarks,
      created_by,
    ]);

    const outboundId = result.insertId;

    // 插入明细表
    if (items && items.length > 0) {
      // 验证物料是否存在于materials表中
      const materialIds = items.map((item) => item.material_id || item.product_id).filter(Boolean);

      if (materialIds.length > 0) {
        try {
          // 安全处理IN查询，当只有一个ID时，直接使用等于
          let materialsQuery;
          let materialsParams;

          if (materialIds.length === 1) {
            materialsQuery = 'SELECT id, code, name FROM materials WHERE id = ?';
            materialsParams = [materialIds[0]];
          } else {
            materialsQuery = 'SELECT id, code, name FROM materials WHERE id IN (?)';
            materialsParams = [materialIds];
          }

          logger.info('物料查询参数:', materialsParams);

          const [materialCheck] = await connection.query(materialsQuery, materialsParams);

          const validMaterialIds = materialCheck.map((m) => m.id);

          // 查找无效的物料ID
          const invalidMaterialIds = materialIds.filter((id) => !validMaterialIds.includes(id));
          if (invalidMaterialIds.length > 0) {
          }

          // 过滤出有效的物料项
          const validItems = items.filter((item) => {
            const materialId = item.material_id || item.product_id;
            return validMaterialIds.includes(materialId);
          });

          if (validItems.length === 0) {
          } else {
            // 插入出库单明细
            try {
              const detailQuery = `
                INSERT INTO sales_outbound_items (
                  outbound_id, product_id, quantity, price, amount, source_order_id, source_order_no
                ) VALUES ?
              `;

              const detailValues = [];

              // 预加载订单明细的单价映射（防止前端不传价格导致 price=0）
              let orderPriceMap = {};
              const sourceOrderId = items[0]?.source_order_id || items[0]?.order_id || order_id;
              if (sourceOrderId) {
                const [orderItems] = await connection.query(
                  'SELECT material_id, unit_price FROM sales_order_items WHERE order_id = ?',
                  [sourceOrderId]
                );
                orderItems.forEach(oi => { orderPriceMap[oi.material_id] = parseFloat(oi.unit_price) || 0; });
              }

              for (const item of validItems) {
                const materialId = item.material_id || item.product_id;
                const material = materialCheck.find((m) => m.id === materialId);
                // 从前端传入 → 订单明细单价 → 物料基础价格（三级回退）
                let unitPrice = parseFloat(item.unit_price || item.price || 0);
                if (unitPrice === 0) {
                  unitPrice = orderPriceMap[materialId] || 0;
                }
                const amount = parseFloat(item.quantity || 0) * unitPrice;

                // 确保这里推入数组的值顺序和上方列名完全一致
                detailValues.push([
                  outboundId,
                  materialId,
                  item.quantity,
                  unitPrice,
                  amount,
                  item.source_order_id || item.order_id || null,
                  item.source_order_no || item.order_no || null,
                ]);
              }

              if (detailValues.length > 0) {
                try {
                  await connection.query(detailQuery, [detailValues]);
                } catch (insertError) {
                  logger.error('插入明细数据失败:', insertError);
                  throw new Error('插入明细数据失败: ' + insertError.message);
                }
              }
            } catch (error) {
              throw error;
            }
          }
        } catch (error) {
          logger.error('验证物料ID或插入明细时出错:', error);
          throw new Error(`验证物料ID或插入明细时出错: ${error.message}`);
        }
      } else {
      }
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        message: '销售出库单创建成功',
        id: outboundId,
        outbound_no: outboundNo,
      },
      '创建成功',
      201
    );
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('创建销售出库单失败:', error);
    res.status(500).json({ error: '创建销售出库单失败: ' + error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

exports.updateSalesOutbound = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const {
      delivery_date,
      order_id,
      related_orders = [],
      is_multi_order = false,
      status,
      remarks,
      items,
    } = req.body;

    logger.info('请求数据:', req.body);

    // 转换日期格式为YYYY-MM-DD
    const formattedDeliveryDate = delivery_date
      ? new Date(delivery_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    connection = await getConnection();
    await connection.beginTransaction();

    // 1. 检查出库单是否存在并获取当前状态和明细
    const [outboundCheck] = await connection.query('SELECT * FROM sales_outbound WHERE id = ?', [
      id,
    ]);

    if (outboundCheck.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: '出库单不存在' });
    }

    const currentOutbound = outboundCheck[0];

    // 获取当前明细
    const [currentItems] = await connection.query(
      'SELECT * FROM sales_outbound_items WHERE outbound_id = ?',
      [id]
    );

    // 2. 验证状态转换的合法性
    const validTransitions = {
      draft: ['processing', 'cancelled'],
      processing: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    if (
      status &&
      status !== currentOutbound.status &&
      !validTransitions[currentOutbound.status]?.includes(status)
    ) {
      await connection.rollback();
      return res.status(400).json({
        error: '无效的状态转换',
        currentStatus: currentOutbound.status,
        newStatus: status,
        message: `当前状态 "${currentOutbound.status}" 不能转换为 "${status}"`,
      });
    }

    // 3. 验证订单存在性
    let finalOrderId = order_id;
    let finalRelatedOrders = related_orders;
    let finalIsMultiOrder = is_multi_order;

    if (finalIsMultiOrder) {
      // 多订单模式：验证所有关联订单存在
      if (!finalRelatedOrders || finalRelatedOrders.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: '多订单模式下必须提供关联订单列表' });
      }

      const [orderCheck] = await connection.query('SELECT id FROM sales_orders WHERE id IN (?)', [
        finalRelatedOrders,
      ]);

      if (orderCheck.length !== finalRelatedOrders.length) {
        await connection.rollback();
        return res.status(400).json({ error: '部分关联订单不存在' });
      }

      finalOrderId = null; // 多订单时主订单ID为空
    } else {
      // 单订单模式
      if (finalOrderId) {
        const [orderCheck] = await connection.query('SELECT id FROM sales_orders WHERE id = ?', [
          finalOrderId,
        ]);

        if (orderCheck.length === 0) {
          await connection.rollback();
          return res.status(400).json({ error: '关联的订单不存在' });
        }
      } else {
        finalOrderId = currentOutbound.order_id;
        finalIsMultiOrder = currentOutbound.is_multi_order || false;
        // 安全解析 related_orders JSON
        finalRelatedOrders = [];
        if (currentOutbound.related_orders) {
          try {
            const rawValue = currentOutbound.related_orders;

            if (typeof rawValue === 'string') {
              // 尝试直接JSON解析
              try {
                finalRelatedOrders = JSON.parse(rawValue);
              } catch (jsonError) {
                // 如果JSON解析失败，尝试解析逗号分隔的ID列表
                logger.info('JSON解析失败，尝试解析逗号分隔的ID:', rawValue);
                finalRelatedOrders = rawValue
                  .split(',')
                  .map((id) => parseInt(id.trim()))
                  .filter((id) => !isNaN(id));
              }
            } else if (Array.isArray(rawValue)) {
              finalRelatedOrders = rawValue;
            } else if (Buffer.isBuffer(rawValue)) {
              // 处理Buffer类型
              const stringValue = rawValue.toString('utf8');
              try {
                finalRelatedOrders = JSON.parse(stringValue);
              } catch (jsonError) {
                finalRelatedOrders = stringValue
                  .split(',')
                  .map((id) => parseInt(id.trim()))
                  .filter((id) => !isNaN(id));
              }
            } else {
              // 其他类型，尝试转换为字符串处理
              const stringValue = String(rawValue);
              try {
                finalRelatedOrders = JSON.parse(stringValue);
              } catch (jsonError) {
                finalRelatedOrders = stringValue
                  .split(',')
                  .map((id) => parseInt(id.trim()))
                  .filter((id) => !isNaN(id));
              }
            }
          } catch (error) {
            logger.error(
              '解析 related_orders 失败:',
              error.message,
              '原始值:',
              currentOutbound.related_orders
            );
            finalRelatedOrders = [];
          }
        }
      }
    }

    // 4. 更新主表
    const updateQuery = `
      UPDATE sales_outbound SET
        order_id = ?,
        is_multi_order = ?,
        related_orders = ?,
        delivery_date = ?,
        status = ?,
        remarks = ?,
        updated_at = NOW()
      WHERE id = ?
    `;

    const finalStatus = status || currentOutbound.status;
    const finalRemarks = remarks || currentOutbound.remarks;

    await connection.query(updateQuery, [
      finalOrderId,
      finalIsMultiOrder,
      finalIsMultiOrder ? JSON.stringify(finalRelatedOrders) : null,
      formattedDeliveryDate,
      finalStatus,
      finalRemarks,
      id,
    ]);

    // 5. 处理明细
    if (items && items.length > 0) {
      // 验证物料是否存在于materials表中
      const materialIds = items.map((item) => item.material_id || item.product_id).filter(Boolean);

      if (materialIds.length > 0) {
        // 检查ID是否存在于materials表中
        const [materialCheck] = await connection.query(
          'SELECT id, code, name FROM materials WHERE id IN (?)',
          [materialIds]
        );

        const validMaterialIds = materialCheck.map((m) => m.id);

        // 过滤出有效的物料项
        const validItems = items.filter((item) => {
          const materialId = item.material_id || item.product_id;
          return validMaterialIds.includes(materialId);
        });

        if (validItems.length === 0) {
        } else {
          try {
            // 删除原有明细
            await connection.query('DELETE FROM sales_outbound_items WHERE outbound_id = ?', [id]);

            // 插入新明细
            const detailQuery = `
              INSERT INTO sales_outbound_items (
                outbound_id, product_id, quantity, price, amount
              ) VALUES ?
            `;

            const detailValues = [];

            for (const item of validItems) {
              const materialId = item.material_id || item.product_id;
              const material = materialCheck.find((m) => m.id === materialId);
              const unitPrice = parseFloat(item.unit_price || item.price || 0);
              const amount = parseFloat(item.quantity || 0) * unitPrice;

              detailValues.push([id, materialId, item.quantity, unitPrice, amount]);
            }

            if (detailValues.length > 0) {
              await connection.query(detailQuery, [detailValues]);
            }
          } catch (error) {
            throw error;
          }
        }
      } else {
      }
    } else {
      // 确保原有明细存在
      if (currentItems.length === 0) {
      } else {
      }
    }

    // 判断是否刚刚变更为完成状态
    const isJustCompleted = finalStatus === STATUS.OUTBOUND.COMPLETED && currentOutbound.status !== STATUS.OUTBOUND.COMPLETED;

    // 6. 如果状态变为completed，处理库存和追溯
    if (isJustCompleted) {
      // 使用 ProductSalesTraceabilityService 处理发货追溯和库存扣减
      // 该服务会自动按FIFO原则从不同库位分配库存，并记录追溯关系
      const ProductSalesTraceabilityService = require('../../../services/business/ProductSalesTraceabilityService');

      const salesData = {
        outbound_id: id,
        outbound_no: currentOutbound.outbound_no,
        order_id: finalOrderId,
        customer_id: currentOutbound.customer_id, // 需要确保currentOutbound或者关联订单中有customer_id
        delivery_date: formattedDeliveryDate,
        items: items && items.length > 0 ? items : currentItems,
        operator: req.user?.username || 'system',
      };

      // 如果 currentOutbound 没有 customer_id (可能之前没存)，尝试从订单获取
      if (!salesData.customer_id && finalOrderId) {
        const [orderRes] = await connection.query(
          'SELECT customer_id FROM sales_orders WHERE id = ?',
          [finalOrderId]
        );
        if (orderRes.length > 0) {
          salesData.customer_id = orderRes[0].customer_id;
        }
      }

      await ProductSalesTraceabilityService.handleProductSalesOutbound(salesData, connection);

      logger.info(`✅ 销售出库单 ${id} 完成，库存和追溯数据已处理`);

      // 注意: 销售成本分录由 FinanceIntegrationService.generateCostEntryFromSalesOutbound
      // 在 commit 后的 setImmediate 中统一生成，此处不再重复生成
    }

    // 更新订单状态 - 使用智能状态服务
    logger.info('🔍 状态更新调试信息:', {
      finalIsMultiOrder,
      finalRelatedOrdersLength: finalRelatedOrders ? finalRelatedOrders.length : 0,
      finalRelatedOrders,
      finalOrderId,
      outboundId: id,
    });

    // 使用新的基于物料的状态更新方法
    // 这将更新所有包含这些物料的订单，而不仅仅是关联订单
    if (items && items.length > 0) {
      logger.info('🔄 基于出库物料更新所有相关订单状态...');
      try {
        const results = await SalesOrderStatusService.updateOrderStatusByMaterials(
          items,
          connection
        );
        logger.info(`✅ 共更新了 ${results.length} 个订单的状态`);

        results.forEach((result) => {
          if (result.error) {
            logger.error(`❌ 订单 ${result.orderId} 状态更新失败: ${result.error} `);
          } else {
            logger.info(`✅ 订单 ${result.orderId} 状态: ${result.status} (${result.message})`);
          }
        });
      } catch (error) {
        logger.error('❌ 基于物料的订单状态更新失败:', error);

        // 如果基于物料的更新失败，回退到原有逻辑
        if (finalIsMultiOrder && finalRelatedOrders && finalRelatedOrders.length > 0) {
          logger.info(
            `📦 回退：开始智能更新 ${finalRelatedOrders.length} 个订单状态: [${finalRelatedOrders.join(', ')}]`
          );
          const updateResults = await SalesOrderStatusService.updateMultipleOrderStatus(
            finalRelatedOrders,
            connection
          );
          updateResults.forEach((result) => {
            if (result.error) {
              logger.error(`❌ 订单 ${result.orderId} 状态更新失败: ${result.error} `);
            } else {
              logger.info(`✅ 订单 ${result.orderId} 状态: ${result.status} (${result.message})`);
            }
          });
        } else if (finalOrderId) {
          logger.info(`📦 回退：开始智能更新单个订单 ${finalOrderId} 状态...`);
          try {
            const result = await SalesOrderStatusService.updateOrderStatus(
              finalOrderId,
              connection
            );
            logger.info(`✅ 订单 ${finalOrderId} 状态: ${result.status} (${result.message})`);
          } catch (error) {
            logger.error(`❌ 订单 ${finalOrderId} 状态更新失败: `, error);
          }
        }
      }
    } else {
      // 没有物料信息时使用原有逻辑
      if (finalIsMultiOrder && finalRelatedOrders && finalRelatedOrders.length > 0) {
        logger.info(
          `📦 开始智能更新 ${finalRelatedOrders.length} 个订单状态: [${finalRelatedOrders.join(', ')}]`
        );
        const updateResults = await SalesOrderStatusService.updateMultipleOrderStatus(
          finalRelatedOrders,
          connection
        );
        updateResults.forEach((result) => {
          if (result.error) {
            logger.error(`❌ 订单 ${result.orderId} 状态更新失败: ${result.error} `);
          } else {
            logger.info(`✅ 订单 ${result.orderId} 状态: ${result.status} (${result.message})`);
          }
        });
      } else if (finalOrderId) {
        logger.info(`📦 开始智能更新单个订单 ${finalOrderId} 状态...`);
        try {
          const result = await SalesOrderStatusService.updateOrderStatus(finalOrderId, connection);
          logger.info(`✅ 订单 ${finalOrderId} 状态: ${result.status} (${result.message})`);
        } catch (error) {
          logger.error(`❌ 订单 ${finalOrderId} 状态更新失败: `, error);
        }
      } else {
        logger.warn('⚠️ 没有找到需要更新状态的订单，跳过状态更新');
      }
    }

    // ========== 在事务内预先查好下游需要的数据（仅读取，不编排） ==========
    let eventPayload = null;
    try {
      let fullSalesOrder = null;
      let customerId = null;
      let customerName = null;

      if (finalOrderId) {
        const [salesOrders] = await connection.execute(
          `SELECT so.*, c.name as customer_name 
           FROM sales_orders so 
           LEFT JOIN customers c ON so.customer_id = c.id 
           WHERE so.id = ?`,
          [finalOrderId]
        );
        if (salesOrders.length > 0) {
          fullSalesOrder = salesOrders[0];
          customerId = fullSalesOrder.customer_id ?? null;
          customerName = fullSalesOrder.customer_name ?? null;
        }
      }

      eventPayload = {
        salesOrder: fullSalesOrder,
        outboundData: {
          id: id ?? null,
          outbound_no: currentOutbound.outbound_no ?? null,
          outbound_date: currentOutbound.delivery_date ?? null,
          customer_id: customerId,
          customer_name: customerName,
          total_amount: currentOutbound.total_amount ?? null,
          created_by: currentOutbound.created_by ?? null,
        },
        currentUserId: req.user?.id ?? null,
      };
    } catch (evtError) {
      logger.error('⚠️ 财务事件数据准备失败，但不阻塞出库:', evtError);
    }

    // ========== 提交主事务，释放所有行锁 ==========
    await connection.commit();

    // 7. 获取更新后的完整出库单信息
    const [updatedOutbound] = await connection.query(
      `SELECT so.*, o.order_no, c.name as customer_name
       FROM sales_outbound so
       LEFT JOIN sales_orders o ON so.order_id = o.id
       LEFT JOIN customers c ON o.customer_id = c.id
       WHERE so.id = ? `,
      [id]
    );

    // 获取更新后的明细
    const [updatedItems] = await connection.query(
      `SELECT soi.*, m.code as material_code, m.name as material_name, m.specs as specification, u.name as unit_name
       FROM sales_outbound_items soi
       LEFT JOIN materials m ON soi.product_id = m.id
       LEFT JOIN units u ON m.unit_id = u.id
       WHERE soi.outbound_id = ? `,
      [id]
    );

    // 组合完整数据
    const completeOutbound = {
      ...updatedOutbound[0],
      items: updatedItems,
    };

    res.json({
      message: '销售出库单更新成功',
      data: completeOutbound,
    });

    // ========== 响应已返回、事务已提交、连接即将归还 ==========
    // 【关键】EventEmitter.emit 是同步的！如果直接 emit，订阅者的 async handler
    // 会在当前同步调用栈中立即开始执行，此时主连接可能还未 release，造成锁等待。
    // 因此必须用 setTimeout 推迟到下一个宏任务，确保 finally 中 connection.release() 先执行。
    if (eventPayload && isJustCompleted) {
      const outboundNo = currentOutbound.outbound_no;
      setTimeout(() => {
        try {
          const EventBus = require('../../../events/EventBus');
          EventBus.emit('SALES_OUTBOUND_COMPLETED', eventPayload);
          logger.info(`📢 业务事件触发: SALES_OUTBOUND_COMPLETED (单号: ${outboundNo})`);
        } catch (emitErr) {
          logger.error('⚠️ [EventBus] 发送事件失败:', emitErr);
        }
      }, 0);
    }
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('更新销售出库单失败:', error);
    res.status(500).json({ error: '更新销售出库单失败: ' + error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// 删除出库单功能（仅允许草稿/待处理状态，已完成的出库单禁止删除以保护库存和财务数据一致性）
exports.deleteSalesOutbound = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    connection = await getConnection();
    await connection.beginTransaction();

    // 安全检查：查询出库单当前状态
    const [outboundResult] = await connection.query(
      'SELECT id, status, outbound_no, order_id FROM sales_outbound WHERE id = ?',
      [id]
    );

    if (outboundResult.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: '出库单不存在' });
    }

    const outbound = outboundResult[0];

    // 仅允许删除草稿(draft)和待处理(pending)状态的出库单
    // 已完成(completed)/处理中(processing)的出库单已产生库存变动和财务凭证，不允许直接删除
    const deletableStatuses = ['draft', 'pending'];
    if (!deletableStatuses.includes(outbound.status)) {
      await connection.rollback();
      return res.status(400).json({
        error: `无法删除状态为"${outbound.status}"的出库单。已完成或处理中的出库单请使用"撤销"功能以回滚库存和财务数据。仅草稿和待处理状态的出库单可以直接删除。`,
      });
    }

    try {
      // 删除明细
      await connection.query('DELETE FROM sales_outbound_items WHERE outbound_id = ?', [id]);

      // 删除主表
      await connection.query('DELETE FROM sales_outbound WHERE id = ?', [id]);

      await connection.commit();

      logger.info(`✅ 销售出库单 ${outbound.outbound_no} (ID: ${id}) 已安全删除，状态: ${outbound.status}`);

      res.json({
        message: '销售出库单删除成功',
        id: parseInt(id),
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('删除销售出库单失败:', error);
    res.status(500).json({ error: '删除销售出库单失败: ' + error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Sales Return Controllers
exports.getSalesReturns = async (req, res) => {
  let conn;
  try {
    const { page = 1, pageSize = 10, search, startDate, endDate, status } = req.query;
    const offset = (page - 1) * pageSize;

    conn = await getConnection();

    // 构建查询条件
    let whereClause = '';
    const queryParams = [];

    if (search) {
      whereClause += ' AND (sr.return_no LIKE ? OR c.name LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (startDate) {
      whereClause += ' AND sr.return_date >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND sr.return_date <= ?';
      queryParams.push(endDate);
    }

    if (status) {
      whereClause += ' AND sr.status = ?';
      queryParams.push(status);
    }

    // 查询总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM sales_returns sr
      LEFT JOIN sales_orders o ON sr.order_id = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE 1 = 1 ${whereClause}
      `;

    const [countResult] = await conn.query(countQuery, queryParams);
    const total = countResult[0].total;

    // 查询数据
    // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    const actualPageSize = parseInt(pageSize);
    const actualOffset = parseInt(offset);
    const query = `
      SELECT sr.*, c.name AS customer_name, o.order_no
      FROM sales_returns sr
      LEFT JOIN sales_orders o ON sr.order_id = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE 1 = 1 ${whereClause}
      ORDER BY sr.created_at DESC
      LIMIT ${actualPageSize} OFFSET ${actualOffset}
      `;

    const [results] = await conn.query(query, queryParams);

    // 为每个退货单获取明细信息并转换状态
    for (let i = 0; i < results.length; i++) {
      const returnItem = results[i];

      // 保留英文状态 key（与系统其他模块一致），添加中文标签供前端展示
      const statusLabelMap = {
        draft: '草稿',
        pending: '待审批',
        approved: '已审批',
        completed: '已完成',
        rejected: '已拒绝',
      };
      results[i].status_label = statusLabelMap[returnItem.status] || returnItem.status;

      const detailsQuery = `
      SELECT
      sri.*,
        m.code as material_code,
        m.code as productCode,
        m.name as material_name,
        m.name as productName,
        m.specs as specification,
        u.name as unit_name,
        COALESCE(soi.unit_price, m.price, 0) as unit_price,
        ROUND(sri.quantity * COALESCE(soi.unit_price, m.price, 0), 2) as amount
        FROM sales_return_items sri
        LEFT JOIN materials m ON sri.product_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        LEFT JOIN sales_order_items soi ON soi.order_id = ? AND soi.material_id = sri.product_id
        WHERE sri.return_id = ?
        `;

      const [detailsResults] = await conn.query(detailsQuery, [returnItem.order_id, returnItem.id]);
      results[i].items = detailsResults;

      // 汇总退货金额
      results[i].total_amount = detailsResults.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    }

    // 统计不同状态的数量
    const statusQuery = `
      SELECT status, COUNT(*) as count
      FROM sales_returns
      GROUP BY status
        `;

    const [statusCounts] = await conn.query(statusQuery);

    // 格式化状态统计数据
    const statusStats = {
      total: total,
      draftCount: 0,
      pendingCount: 0,
      approvedCount: 0,
      completedCount: 0,
      rejectedCount: 0,
    };

    statusCounts.forEach((item) => {
      if (item.status === STATUS.SALES_RETURN.DRAFT) statusStats.draftCount = item.count;
      if (item.status === STATUS.SALES_RETURN.PENDING) statusStats.pendingCount = item.count;
      if (item.status === STATUS.SALES_RETURN.APPROVED) statusStats.approvedCount = item.count;
      if (item.status === STATUS.SALES_RETURN.COMPLETED) statusStats.completedCount = item.count;
      if (item.status === STATUS.SALES_RETURN.REJECTED) statusStats.rejectedCount = item.count;
    });

    res.json({
      items: results,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      statusStats,
    });
  } catch (error) {
    logger.error('获取销售退货单列表失败:', error);
    res.status(500).json({ error: '获取销售退货单列表失败' });
  } finally {
    if (conn) conn.release();
  }
};

exports.getSalesReturnById = async (req, res) => {
  let conn;
  try {
    const { id } = req.params;

    conn = await getConnection();

    // 查询退货单主信息
    const query = `
      SELECT sr.*, c.name as customer_name, c.contact_person, c.contact_phone, o.order_no
      FROM sales_returns sr
      LEFT JOIN sales_orders o ON sr.order_id = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE sr.id = ?
        `;

    const [returnResults] = await conn.query(query, [id]);

    if (returnResults.length === 0) {
      return res.status(404).json({ error: '退货单不存在' });
    }

    const returnData = returnResults[0];

    // 查询退货单明细
    const detailsQuery = `
      SELECT
      sri.*,
        m.code as material_code,
        m.code as productCode,
        m.name as material_name,
        m.name as productName,
        m.specs as specification,
        u.name as unit_name,
        COALESCE(soi.unit_price, m.price, 0) as unit_price,
        ROUND(sri.quantity * COALESCE(soi.unit_price, m.price, 0), 2) as amount
      FROM sales_return_items sri
      LEFT JOIN materials m ON sri.product_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      LEFT JOIN sales_order_items soi ON soi.order_id = ? AND soi.material_id = sri.product_id
      WHERE sri.return_id = ?
        `;

    const [detailsResults] = await conn.query(detailsQuery, [returnData.order_id, id]);

    // 保留英文状态 key，添加中文标签供前端展示
    const statusLabelMap = {
      draft: '草稿',
      pending: '待审批',
      approved: '已审批',
      completed: '已完成',
      rejected: '已拒绝',
    };
    returnData.status_label = statusLabelMap[returnData.status] || returnData.status;

    // 组合结果
    returnData.items = detailsResults;
    returnData.total_amount = detailsResults.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

    res.json(returnData);
  } catch (error) {
    logger.error('获取销售退货单详情失败:', error);
    res.status(500).json({ error: '获取销售退货单详情失败' });
  } finally {
    if (conn) conn.release();
  }
};

exports.createSalesReturn = async (req, res) => {
  let connection;
  try {
    const {
      return_date,
      order_id,
      outbound_id,
      outbound_no,
      order_no,
      customer_name,
      return_reason,
      status,
      remarks,
      items,
    } = req.body;

    // 验证必要参数（支持基于出库单或订单的退货）
    if (!return_date || !return_reason) {
      return res.status(400).json({ error: '缺少必要参数：退货日期和退货原因' });
    }

    if (!outbound_id && !order_id) {
      return res.status(400).json({ error: '必须指定出库单ID或订单ID' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '至少需要一个退货项目' });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    // 生成退货单号: RT + 年月日 + 3位序号
    const date = new Date();
    const dateStr =
      date.getFullYear() +
      ('0' + (date.getMonth() + 1)).slice(-2) +
      ('0' + date.getDate()).slice(-2);

    // 查询当天最大序号
    const [seqResult] = await connection.query(
      'SELECT MAX(SUBSTRING(return_no, 11)) as max_seq FROM sales_returns WHERE return_no LIKE ?',
      [`RT${dateStr}%`]
    );

    const seq = seqResult[0].max_seq ? parseInt(seqResult[0].max_seq) + 1 : 1;
    const returnNo = `RT${dateStr}${seq.toString().padStart(3, '0')} `;

    // 如果是基于出库单的退货，需要获取订单信息
    let finalOrderId = order_id;
    if (outbound_id && !order_id) {
      const [outboundResult] = await connection.query(
        'SELECT order_id FROM sales_outbound WHERE id = ?',
        [outbound_id]
      );
      if (outboundResult.length > 0) {
        finalOrderId = outboundResult[0].order_id;
      }
    }

    // 【新增】超额退货防范机制，严格校验累计退货数量不得超过原订单购买数量
    if (finalOrderId && items && items.length > 0) {
      for (const item of items) {
        const productId = item.product_id;
        const returnQty = parseFloat(item.quantity) || 0;

        // 获取订单原始购买数量
        const [orderItemResult] = await connection.query(
          'SELECT quantity FROM sales_order_items WHERE order_id = ? AND material_id = ?',
          [finalOrderId, productId]
        );

        if (orderItemResult.length === 0) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({ error: '数据异常：原订单中不存在您要退购的产品！' });
        }

        const maxOrderQty = parseFloat(orderItemResult[0].quantity) || 0;

        // 汇总该订单下此物料的所有历史有效退货记录（排除已被拦截和作废的记录）
        const [historicalReturn] = await connection.query(
          `SELECT SUM(sri.quantity) as total_returned
           FROM sales_return_items sri
           JOIN sales_returns sr ON sri.return_id = sr.id
           WHERE sr.order_id = ? AND sri.product_id = ? AND sr.status NOT IN ('rejected', 'cancelled')`,
          [finalOrderId, productId]
        );

        const alreadyReturnedQty = parseFloat(historicalReturn[0].total_returned) || 0;
        const maxReturnableQty = Math.max(0, maxOrderQty - alreadyReturnedQty);

        if (returnQty > maxReturnableQty) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({ error: `退货数量超限阻止！原订单总购件数：${maxOrderQty}，历史已退累计件数：${alreadyReturnedQty}。本次您最多只能申请退回余数：${maxReturnableQty}件。` });
        }
      }
    }

    // 插入退货单主表
    const insertQuery = `
      INSERT INTO sales_returns(
          return_no, order_id, return_date, return_reason,
          status, remarks, created_by, created_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, NOW())
          `;

    const created_by = req.user ? req.user.id : 1; // 获取当前用户ID，如果不存在则默认为1

    const [result] = await connection.query(insertQuery, [
      returnNo,
      finalOrderId,
      return_date,
      return_reason,
      status || 'pending',
      remarks,
      created_by,
    ]);

    const returnId = result.insertId;

    // 插入明细表
    if (items && items.length > 0) {
      const detailQuery = `
        INSERT INTO sales_return_items(
            return_id, product_id, quantity, reason
          ) VALUES ?
            `;

      const detailValues = items.map((item) => [
        returnId,
        item.product_id,
        item.quantity,
        item.reason || '',
      ]);

      await connection.query(detailQuery, [detailValues]);
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        message: '销售退货单创建成功',
        id: returnId,
        return_no: returnNo,
      },
      '创建成功',
      201
    );
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('创建销售退货单失败:', error);
    res.status(500).json({ error: '创建销售退货单失败' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

exports.updateSalesReturn = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const { return_date, order_id, return_reason, status, remarks, items } = req.body;

    connection = await getConnection();
    await connection.beginTransaction();

    // 如果是基于出库单的退货，需要获取订单信息
    let finalOrderId = order_id;
    // 如果前端只传了 outbound_id 没有 order_id（虽然前端有控制，但也防范一下）
    // 或者直接使用原数据库记录的 order_id 

    // 【新增】超额退货防范机制
    if (finalOrderId && items && items.length > 0) {
      for (const item of items) {
        const productId = item.product_id;
        const returnQty = parseFloat(item.quantity) || 0;

        // 获取订单原始购买数量
        const [orderItemResult] = await connection.query(
          'SELECT quantity FROM sales_order_items WHERE order_id = ? AND material_id = ?',
          [finalOrderId, productId]
        );

        if (orderItemResult.length === 0) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({ error: '数据异常：原订单中不存在您要修改的产品！' });
        }

        const maxOrderQty = parseFloat(orderItemResult[0].quantity) || 0;

        // 汇总该订单下此物料的所有历史有效退货记录（排除当前正在修改的退货单 itself 以及作废单）
        const [historicalReturn] = await connection.query(
          `SELECT SUM(sri.quantity) as total_returned
           FROM sales_return_items sri
           JOIN sales_returns sr ON sri.return_id = sr.id
           WHERE sr.order_id = ? AND sri.product_id = ? 
             AND sr.id != ? 
             AND sr.status NOT IN ('rejected', 'cancelled')`,
          [finalOrderId, productId, id]
        );

        const alreadyReturnedQty = parseFloat(historicalReturn[0].total_returned) || 0;
        const maxReturnableQty = Math.max(0, maxOrderQty - alreadyReturnedQty);

        if (returnQty > maxReturnableQty) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({ error: `修改数量超限阻止！原订单总购件数：${maxOrderQty}，除当前单外历史已退件数：${alreadyReturnedQty}。本次您最多只能将件数修改为：${maxReturnableQty}件。` });
        }
      }
    }

    // 更新主表
    const updateQuery = `
      UPDATE sales_returns SET
      return_date = ?,
        order_id = ?,
        return_reason = ?,
        status = ?,
        remarks = ?,
        updated_at = NOW()
      WHERE id = ?
        `;

    await connection.query(updateQuery, [
      return_date,
      order_id,
      return_reason,
      status,
      remarks,
      id,
    ]);

    // 删除原有明细
    await connection.query('DELETE FROM sales_return_items WHERE return_id = ?', [id]);

    // 插入新明细
    if (items && items.length > 0) {
      const detailQuery = `
        INSERT INTO sales_return_items(
          return_id, product_id, quantity, reason
        ) VALUES ?
          `;

      const detailValues = items.map((item) => [
        id,
        item.product_id,
        item.quantity,
        item.reason || '',
      ]);

      await connection.query(detailQuery, [detailValues]);
    }

    // 如果状态变为已完成，处理库存入库
    if (status === STATUS.SALES_RETURN.COMPLETED && items && items.length > 0) {
      for (const item of items) {
        // 兼容不同的字段名
        const productId = item.product_id || item.productId || item.material_id;
        const quantity = item.quantity || item.return_quantity;

        if (!productId || !quantity) {
          continue;
        }

        // 获取物料信息、单位和默认仓库
        const [materialResults] = await connection.query(
          `
          SELECT m.code, m.name, m.unit_id, m.location_id, m.location_name,
        u.name as unit_name, loc.name as warehouse_name
          FROM materials m
          LEFT JOIN units u ON m.unit_id = u.id
          LEFT JOIN locations loc ON m.location_id = loc.id
          WHERE m.id = ?
        `,
          [productId]
        );

        if (materialResults.length > 0) {
          const material = materialResults[0];

          // 使用物料的默认仓库，如果没有则强制抛错终止业务
          const warehouseId = material.location_id;
          if (!warehouseId) {
            throw new Error(`物料 ${productId} 未配置默认仓库，请在物料资料中设置后再操作。`);
          }
          const warehouseName = material.warehouse_name || material.location_name || '未命名仓库';

          // 获取当前库存（使用单表架构，参考采购退货逻辑）
          const [stockResult] = await connection.query(
            `
            SELECT COALESCE(SUM(quantity), 0) as current_quantity
            FROM inventory_ledger
            WHERE material_id = ? AND location_id = ?
        `,
            [productId, warehouseId]
          );

          const beforeQuantity = parseFloat(stockResult[0]?.current_quantity || 0);
          const changeQuantity = parseFloat(quantity);
          const afterQuantity = beforeQuantity + changeQuantity;

          // 获取物料单位ID
          const unitId = material.unit_id;

          // 获取当前退货单的正确编号
          const [returnInfo] = await connection.query(
            'SELECT return_no FROM sales_returns WHERE id = ?',
            [id]
          );
          const actualReturnNo = returnInfo[0]?.return_no || `RT${id} `;

          // 🔥 使用统一的 InventoryService 更新库存（自动同步 batch_inventory）
          const InventoryService = require('../../../services/InventoryService');
          await InventoryService.updateStock(
            {
              materialId: productId,
              locationId: warehouseId,
              quantity: changeQuantity, // 退货为正数（入库）
              transactionType: 'sales_return',
              referenceNo: actualReturnNo,
              referenceType: 'sales_return',
              operator: 'system',
              remark: `销售退货入库：${material.code} ${material.name} `,
              unitId: material.unit_id,
              batchNumber: null,
            },
            connection
          );

          logger.info(`✅ 销售退货入库完成（统一服务）: 物料${productId}, 数量${changeQuantity} `);
        }
      }

      // 退货单库存处理完成

      // 获取退货单信息用于生成红字发票
      const [returnInfo] = await connection.query('SELECT * FROM sales_returns WHERE id = ?', [id]);

      // 在事务提交后异步生成红字发票
      if (returnInfo.length > 0) {
        const salesReturn = returnInfo[0];
        setImmediate(async () => {
          try {
            const FinanceIntegrationService = require('../../../services/external/FinanceIntegrationService');
            await FinanceIntegrationService.generateARCreditNoteFromSalesReturn(salesReturn);
            logger.info(`✅ 销售退货红字发票自动生成成功 - 退货单: ${salesReturn.return_no} `);
          } catch (financeError) {
            logger.warn(`⚠️ 销售退货红字发票自动生成失败（不影响退货）: ${financeError.message} `);
          }
        });
      }
    }

    await connection.commit();

    res.json({
      message: '销售退货单更新成功',
      id: parseInt(id),
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('更新销售退货单失败:', error);
    res.status(500).json({ error: '更新销售退货单失败' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// 添加删除退货单功能
exports.deleteSalesReturn = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    connection = await getConnection();
    await connection.beginTransaction();

    // 删除明细
    await connection.query('DELETE FROM sales_return_items WHERE return_id = ?', [id]);

    // 删除主表
    await connection.query('DELETE FROM sales_returns WHERE id = ?', [id]);

    await connection.commit();

    res.json({
      message: '销售退货单删除成功',
      id: parseInt(id),
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('删除销售退货单失败:', error);
    res.status(500).json({ error: '删除销售退货单失败' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Sales Exchange Controllers
exports.getSalesExchanges = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, search, startDate, endDate, status } = req.query;
    const offset = (page - 1) * pageSize;

    // 构建查询条件
    let whereClause = '';
    const queryParams = [];

    if (search) {
      whereClause +=
        ' AND (se.exchange_no LIKE ? OR se.customer_name LIKE ? OR se.order_no LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (startDate) {
      whereClause += ' AND se.exchange_date >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND se.exchange_date <= ?';
      queryParams.push(endDate);
    }

    if (status) {
      whereClause += ' AND se.status = ?';
      queryParams.push(status);
    }

    // 查询总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM sales_exchanges se
      WHERE 1 = 1 ${whereClause}
      `;

    const connection = await db.pool.getConnection();

    try {
      const [countResult] = await connection.query(countQuery, queryParams);
      const total = countResult[0].total;

      // 查询数据
      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
      const actualPageSize = parseInt(pageSize);
      const actualOffset = parseInt(offset);
      const query = `
        SELECT se.*, 
               se.return_amount, se.new_amount, se.difference_amount
        FROM sales_exchanges se
        WHERE 1 = 1 ${whereClause}
        ORDER BY se.created_at DESC
        LIMIT ${actualPageSize} OFFSET ${actualOffset}
      `;

      const [results] = await connection.query(query, queryParams);

      // 统计不同状态的数量
      const statusQuery = `
        SELECT status, COUNT(*) as count
        FROM sales_exchanges
        GROUP BY status
        `;

      const [statusCounts] = await connection.query(statusQuery);

      // 格式化状态统计数据
      const statusStats = {
        total: total,
        pending: 0,
        processing: 0,
        completed: 0,
        rejected: 0,
      };

      statusCounts.forEach((item) => {
        if (item.status === '待处理') statusStats.pending = item.count;
        if (item.status === '处理中') statusStats.processing = item.count;
        if (item.status === '已完成') statusStats.completed = item.count;
        if (item.status === '已拒绝') statusStats.rejected = item.count;
      });

      const responseData = {
        items: results,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        statusStats,
      };

      res.json(responseData);
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('获取销售换货单列表失败:', error);
    res.status(500).json({ error: '获取销售换货单列表失败' });
  }
};

exports.getSalesExchangeById = async (req, res) => {
  try {
    const { id } = req.params;

    const connection = await db.pool.getConnection();

    try {
      // 查询换货单主信息
      const query = `
        SELECT se.*
        FROM sales_exchanges se
        WHERE se.id = ?
        `;

      const [exchangeResults] = await connection.query(query, [id]);

      if (exchangeResults.length === 0) {
        return res.status(404).json({ error: '换货单不存在' });
      }

      const exchange = exchangeResults[0];

      // 查询换货单明细（含单价金额）
      const detailsQuery = `
        SELECT sei.*, 
               sei.unit_price, sei.amount,
               m.id as material_id, m.price as material_price
        FROM sales_exchange_items sei
        LEFT JOIN materials m ON sei.product_code COLLATE utf8mb4_unicode_ci = m.code COLLATE utf8mb4_unicode_ci
        WHERE sei.exchange_id = ?
        ORDER BY sei.item_type, sei.id
          `;

      const [detailsResults] = await connection.query(detailsQuery, [id]);

      // 分离退回商品和换出商品
      const returnItems = detailsResults
        .filter((item) => item.item_type === 'return')
        .map((item) => ({
          productCode: item.product_code,
          productName: item.product_name,
          specification: item.specification,
          originalQuantity: item.original_quantity,
          returnQuantity: item.quantity,
          returnReason: item.reason,
          unitName: item.unit_name,
        }));

      const newItems = detailsResults
        .filter((item) => item.item_type === 'new')
        .map((item) => ({
          productCode: item.product_code,
          productName: item.product_name,
          specification: item.specification,
          newQuantity: item.quantity,
          newReason: item.reason,
          unitName: item.unit_name,
        }));

      // 组合结果 - 支持新旧两种格式
      exchange.returnItems = returnItems;
      exchange.newItems = newItems;

      // 转换字段名以匹配前端期望的格式
      exchange.items = detailsResults.map((item) => ({
        ...item,
        exchange_quantity: item.quantity, // 换货数量
        exchange_reason: item.reason, // 换货原因
      }));

      res.json(exchange);
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('获取销售换货单详情失败:', error);
    res.status(500).json({ error: '获取销售换货单详情失败' });
  }
};

exports.createSalesExchange = async (req, res) => {
  let connection;
  try {
    const {
      orderNo,
      customerName,
      contactPhone,
      exchangeDate,
      reason,
      remark,
      returnItems,
      newItems,
      items, // 支持新旧两种数据格式
    } = req.body;

    // 验证必要参数
    if (!orderNo || !exchangeDate || !reason) {
      return res.status(400).json({ error: '缺少必要参数：订单号、换货日期、换货原因' });
    }

    // 支持新的数据结构（returnItems + newItems）或旧的数据结构（items）
    const hasNewFormat = returnItems && newItems;
    const hasOldFormat = items && Array.isArray(items) && items.length > 0;

    if (!hasNewFormat && !hasOldFormat) {
      return res.status(400).json({ error: '至少需要退回商品和换出商品，或者换货项目' });
    }

    if (hasNewFormat) {
      if (!Array.isArray(returnItems) || returnItems.length === 0) {
        return res.status(400).json({ error: '至少需要一个退回商品' });
      }
      if (!Array.isArray(newItems) || newItems.length === 0) {
        return res.status(400).json({ error: '至少需要一个换出商品' });
      }
    }

    // 获取数据库连接并开启事务
    connection = await db.pool.getConnection();
    await connection.beginTransaction();

    // 生成换货单号: EX + 年月日 + 3位序号
    const date = new Date();
    const dateStr =
      date.getFullYear() +
      ('0' + (date.getMonth() + 1)).slice(-2) +
      ('0' + date.getDate()).slice(-2);

    // 查询当天最大序号
    const [seqResult] = await connection.query(
      'SELECT MAX(SUBSTRING(exchange_no, 11)) as max_seq FROM sales_exchanges WHERE exchange_no LIKE ?',
      [`EX${dateStr}%`]
    );

    const seq = seqResult[0].max_seq ? parseInt(seqResult[0].max_seq) + 1 : 1;
    const exchangeNo = `EX${dateStr}${seq.toString().padStart(3, '0')} `;

    // 插入换货单主表（金额字段后续计算回填）
    const insertQuery = `
      INSERT INTO sales_exchanges(
            exchange_no, order_no, customer_name, contact_phone, exchange_date,
            exchange_reason, status, remarks, created_by, created_at,
            return_amount, new_amount, difference_amount
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0, 0, 0)
            `;

    const created_by = req.user ? req.user.id : 1; // 获取当前用户ID，如果不存在则默认为1

    // 格式化日期为MySQL DATE格式 (YYYY-MM-DD)
    const formattedDate = new Date(exchangeDate).toISOString().split('T')[0];

    logger.info('执行插入查询，参数:', [
      exchangeNo,
      orderNo,
      customerName,
      contactPhone,
      formattedDate,
      reason,
      '待处理',
      remark,
      created_by,
    ]);

    const [result] = await connection.query(insertQuery, [
      exchangeNo,
      orderNo,
      customerName,
      contactPhone,
      formattedDate,
      reason,
      '待处理',
      remark,
      created_by,
    ]);

    const exchangeId = result.insertId;

    // 插入明细表 - 支持新旧两种数据格式
    // 预加载物料价格映射（用于金额计算）
    let materialPriceMap = {};
    try {
      const allCodes = [];
      if (hasNewFormat) {
        (returnItems || []).forEach(i => { if (i.productCode) allCodes.push(i.productCode); });
        (newItems || []).forEach(i => { if (i.productCode) allCodes.push(i.productCode); });
      } else if (hasOldFormat) {
        items.forEach(i => { if (i.productCode) allCodes.push(i.productCode); });
      }
      if (allCodes.length > 0) {
        const [mats] = await connection.query(
          'SELECT code, price FROM materials WHERE code IN (?)', [allCodes]
        );
        mats.forEach(m => { materialPriceMap[m.code] = parseFloat(m.price) || 0; });
      }
    } catch (e) { logger.warn('预加载物料价格失败:', e.message); }

    // 尝试从关联订单获取成交价（退回商品优先使用订单价格）
    let orderPriceMap = {};
    if (orderNo) {
      try {
        const [orderItems] = await connection.query(
          `SELECT m.code, soi.unit_price 
           FROM sales_order_items soi 
           JOIN materials m ON soi.material_id = m.id 
           JOIN sales_orders so ON soi.order_id = so.id 
           WHERE so.order_no = ?`, [orderNo]
        );
        orderItems.forEach(oi => { orderPriceMap[oi.code] = parseFloat(oi.unit_price) || 0; });
      } catch (e) { logger.warn('获取订单价格失败:', e.message); }
    }

    if (hasNewFormat) {
      // 新格式：分别处理退回商品和换出商品
      const detailQuery = `
        INSERT INTO sales_exchange_items(
              exchange_id, item_type, product_code, product_name, specification,
              original_quantity, quantity, unit_price, amount, reason, unit_name
            ) VALUES ?
              `;

      const allDetailValues = [];

      // 插入退回商品（单价优先用订单成交价，其次物料基础价）
      if (returnItems && returnItems.length > 0) {
        const returnValues = returnItems.map((item) => {
          const unitPrice = orderPriceMap[item.productCode] || materialPriceMap[item.productCode] || 0;
          const qty = parseFloat(item.returnQuantity) || 0;
          return [
            exchangeId, 'return', item.productCode, item.productName,
            item.specification || '', item.originalQuantity || 0, qty,
            unitPrice, Math.round(qty * unitPrice * 100) / 100,
            item.returnReason || '', item.unitName || '',
          ];
        });
        allDetailValues.push(...returnValues);
      }

      // 插入换出商品（单价用物料基础售价）
      if (newItems && newItems.length > 0) {
        const newValues = newItems.map((item) => {
          const unitPrice = materialPriceMap[item.productCode] || 0;
          const qty = parseFloat(item.newQuantity) || 0;
          return [
            exchangeId, 'new', item.productCode, item.productName,
            item.specification || '', 0, qty,
            unitPrice, Math.round(qty * unitPrice * 100) / 100,
            item.newReason || '', item.unitName || '',
          ];
        });
        allDetailValues.push(...newValues);
      }

      if (allDetailValues.length > 0) {
        await connection.query(detailQuery, [allDetailValues]);
      }
    } else if (hasOldFormat) {
      // 旧格式：兼容原有的数据结构
      const detailQuery = `
        INSERT INTO sales_exchange_items(
                exchange_id, item_type, product_code, product_name, specification,
                original_quantity, quantity, unit_price, amount, reason, unit_name
              ) VALUES ?
                `;

      const detailValues = items.map((item) => {
        const unitPrice = orderPriceMap[item.productCode] || materialPriceMap[item.productCode] || 0;
        const qty = parseFloat(item.exchangeQuantity) || 0;
        return [
          exchangeId,
          'return', // 旧格式默认作为退回商品处理
          item.productCode,
          item.productName,
          item.specification || '',
          item.originalQuantity || 0,
          qty,
          unitPrice,
          Math.round(qty * unitPrice * 100) / 100,
          item.exchangeReason || '',
          item.unitName || '',
        ];
      });

      await connection.query(detailQuery, [detailValues]);
    }

    // 汇总明细金额并回填主表
    const [retSum] = await connection.query(
      'SELECT COALESCE(SUM(amount), 0) as s FROM sales_exchange_items WHERE exchange_id = ? AND item_type = ?',
      [exchangeId, 'return']
    );
    const [newSum] = await connection.query(
      'SELECT COALESCE(SUM(amount), 0) as s FROM sales_exchange_items WHERE exchange_id = ? AND item_type = ?',
      [exchangeId, 'new']
    );
    const returnAmt = parseFloat(retSum[0].s);
    const newAmt = parseFloat(newSum[0].s);
    const diffAmt = Math.round((newAmt - returnAmt) * 100) / 100;
    await connection.query(
      'UPDATE sales_exchanges SET return_amount = ?, new_amount = ?, difference_amount = ? WHERE id = ?',
      [returnAmt, newAmt, diffAmt, exchangeId]
    );
    logger.info(`💰 换货单 ${exchangeNo} 金额: 退回=${returnAmt}, 换出=${newAmt}, 差价=${diffAmt}`);

    // 如果创建时状态就是"已完成"，立即处理库存操作
    if (reason === '已完成' && (hasNewFormat || hasOldFormat)) {
      await processExchangeInventory(connection, exchangeId, req.user?.username || 'system');
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        message: '销售换货单创建成功',
        id: exchangeId,
        exchange_no: exchangeNo,
      },
      '创建成功',
      201
    );
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('创建销售换货单失败:', error);
    res.status(500).json({ error: '创建销售换货单失败' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

exports.updateSalesExchange = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    logger.info('请求数据:', JSON.stringify(req.body, null, 2));

    const { orderNo, customerName, contactPhone, exchangeDate, reason, remark, items, status } =
      req.body;

    logger.info('解析后的字段:', {
      orderNo,
      customerName,
      contactPhone,
      exchangeDate,
      reason,
      remark,
      status,
      itemsCount: items ? items.length : 0,
    });

    connection = await db.pool.getConnection();
    await connection.beginTransaction();

    // 获取当前换货单状态（在更新之前）
    const [currentExchange] = await connection.query(
      'SELECT status FROM sales_exchanges WHERE id = ?',
      [id]
    );
    const currentStatus = currentExchange[0]?.status;

    // 更新主表
    const updateQuery = `
      UPDATE sales_exchanges SET
      order_no = ?,
        customer_name = ?,
        contact_phone = ?,
        exchange_date = ?,
        exchange_reason = ?,
        status = ?,
        remarks = ?,
        updated_at = NOW()
      WHERE id = ?
        `;

    // 格式化日期为MySQL DATE格式 (YYYY-MM-DD)
    const formattedDate = new Date(exchangeDate).toISOString().split('T')[0];

    await connection.query(updateQuery, [
      orderNo,
      customerName,
      contactPhone,
      formattedDate,
      reason,
      status || '待处理',
      remark,
      id,
    ]);

    // 删除原有明细
    await connection.query('DELETE FROM sales_exchange_items WHERE exchange_id = ?', [id]);

    // 插入新明细
    if (items && items.length > 0) {
      // 预加载物料价格映射
      let materialPriceMap = {};
      let orderPriceMap = {};
      try {
        const allCodes = items.map(i => i.productCode || i.product_code).filter(Boolean);
        if (allCodes.length > 0) {
          const [mats] = await connection.query('SELECT code, price FROM materials WHERE code IN (?)', [allCodes]);
          mats.forEach(m => { materialPriceMap[m.code] = parseFloat(m.price) || 0; });
        }
        if (orderNo) {
          const [ois] = await connection.query(
            `SELECT m.code, soi.unit_price FROM sales_order_items soi 
             JOIN materials m ON soi.material_id = m.id 
             JOIN sales_orders so ON soi.order_id = so.id WHERE so.order_no = ?`, [orderNo]
          );
          ois.forEach(oi => { orderPriceMap[oi.code] = parseFloat(oi.unit_price) || 0; });
        }
      } catch (e) { logger.warn('预加载价格映射失败:', e.message); }

      const detailQuery = `
        INSERT INTO sales_exchange_items(
          exchange_id, item_type, product_code, product_name, specification,
          original_quantity, quantity, unit_price, amount, reason, unit_name
        ) VALUES ?
          `;

      // 先计算退回商品的总数量，用于设置换出商品的默认数量
      const returnItemsFiltered = items.filter((item) => parseFloat(item.originalQuantity || 0) > 0);
      const totalReturnQuantity = returnItemsFiltered.reduce(
        (sum, item) => sum + parseFloat(item.originalQuantity || 0),
        0
      );

      const detailValues = items.map((item) => {
        // 支持两种命名方式：驼峰命名和下划线命名
        const productCode = item.productCode || item.product_code || '';
        const productName = item.productName || item.product_name || '';
        const specification = item.specification || '';
        const originalQuantity = parseFloat(item.originalQuantity || item.original_quantity || 0);
        // 对于换货，处理数量逻辑
        let quantity = parseFloat(
          item.quantity || item.exchangeQuantity || item.exchange_quantity || 0
        );

        if (quantity === 0) {
          if (originalQuantity > 0) {
            quantity = originalQuantity;
          } else {
            quantity = totalReturnQuantity;
          }
        }
        const reason = item.reason || item.exchangeReason || item.exchange_reason || '';
        const unitName = item.unitName || item.unit_name || '';

        const itemType =
          item.item_type || item.itemType || (originalQuantity > 0 ? 'return' : 'new');

        // 计算单价和金额
        const unitPrice = (itemType === 'return')
          ? (orderPriceMap[productCode] || materialPriceMap[productCode] || 0)
          : (materialPriceMap[productCode] || 0);
        const amount = Math.round(quantity * unitPrice * 100) / 100;

        return [
          id, itemType, productCode, productName, specification,
          originalQuantity, quantity, unitPrice, amount, reason, unitName,
        ];
      });

      await connection.query(detailQuery, [detailValues]);
    }

    // 汇总明细金额并回填主表
    const [retSum] = await connection.query(
      'SELECT COALESCE(SUM(amount), 0) as s FROM sales_exchange_items WHERE exchange_id = ? AND item_type = ?',
      [id, 'return']
    );
    const [newSum] = await connection.query(
      'SELECT COALESCE(SUM(amount), 0) as s FROM sales_exchange_items WHERE exchange_id = ? AND item_type = ?',
      [id, 'new']
    );
    const returnAmt = parseFloat(retSum[0].s);
    const newAmt = parseFloat(newSum[0].s);
    const diffAmt = Math.round((newAmt - returnAmt) * 100) / 100;
    await connection.query(
      'UPDATE sales_exchanges SET return_amount = ?, new_amount = ?, difference_amount = ? WHERE id = ?',
      [returnAmt, newAmt, diffAmt, id]
    );
    logger.info(`💰 换货单更新金额: 退回=${returnAmt}, 换出=${newAmt}, 差价=${diffAmt}`);

    // 如果状态变为"已完成"，处理库存操作
    logger.info('库存处理检查:', {
      status: status,
      currentStatus: currentStatus,
      condition: status === '已完成' && currentStatus !== '已完成',
    });

    if (status === '已完成' && currentStatus !== '已完成') {
      await processExchangeInventory(connection, id, req.user?.username || 'system');

      // 获取换货单信息用于生成差价分录
      const [exchangeInfo] = await connection.query('SELECT * FROM sales_exchanges WHERE id = ?', [
        id,
      ]);

      // 在事务提交后异步生成差价分录
      if (exchangeInfo.length > 0) {
        const salesExchange = exchangeInfo[0];
        setImmediate(async () => {
          try {
            const FinanceIntegrationService = require('../../../services/external/FinanceIntegrationService');
            await FinanceIntegrationService.generateExchangeDifferenceEntry(salesExchange);
            logger.info(`✅ 销售换货差价分录自动生成成功 - 换货单: ${salesExchange.exchange_no} `);
          } catch (financeError) {
            logger.warn(`⚠️ 销售换货差价分录自动生成失败（不影响换货）: ${financeError.message} `);
          }
        });
      }
    } else {
      logger.info('跳过库存处理，原因:', {
        statusNotCompleted: status !== '已完成',
        alreadyCompleted: currentStatus === '已完成',
      });
    }

    await connection.commit();

    res.json({
      message: '销售换货单更新成功',
      id: parseInt(id),
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('更新销售换货单失败:', error);
    logger.error('错误堆栈:', error.stack);
    res.status(500).json({
      error: '更新销售换货单失败',
      details: error.message,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// 添加删除换货单功能
exports.deleteSalesExchange = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    connection = await db.pool.getConnection();
    await connection.beginTransaction();

    // 删除明细
    await connection.query('DELETE FROM sales_exchange_items WHERE exchange_id = ?', [id]);

    // 删除主表
    await connection.query('DELETE FROM sales_exchanges WHERE id = ?', [id]);

    await connection.commit();

    res.json({
      message: '销售换货单删除成功',
      id: parseInt(id),
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('删除销售换货单失败:', error);
    res.status(500).json({ error: '删除销售换货单失败' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// 更新换货单状态（前端 salesApi.updateExchangeStatus 对应接口）
exports.updateExchangeStatus = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: '缺少必要参数：status' });
    }

    // 允许的状态值
    const allowedStatuses = ['pending', 'processing', 'completed', 'rejected'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: `无效的状态值: ${status}，允许值: ${allowedStatuses.join(', ')}` });
    }

    connection = await db.pool.getConnection();
    await connection.beginTransaction();

    // 查询当前状态
    const [currentResult] = await connection.query(
      'SELECT id, status, exchange_no FROM sales_exchanges WHERE id = ?',
      [id]
    );

    if (currentResult.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: '换货单不存在' });
    }

    const currentExchange = currentResult[0];
    const previousStatus = currentExchange.status;

    // 状态流转检查（防止非法状态变更）
    const validTransitions = {
      'pending': ['processing', 'rejected'],
      'processing': ['completed', 'rejected'],
      'completed': [],   // 已完成不可再变更
      'rejected': [],    // 已拒绝不可再变更
    };

    const allowed = validTransitions[previousStatus];
    if (allowed && !allowed.includes(status)) {
      await connection.rollback();
      return res.status(400).json({
        error: `状态"${previousStatus}"不允许变更为"${status}"。允许的目标状态: ${allowed.length > 0 ? allowed.join(', ') : '无（终态）'}`,
      });
    }

    // 更新状态
    await connection.query(
      'UPDATE sales_exchanges SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );

    // 如果状态变为 completed，处理换货库存操作
    if (status === 'completed' && previousStatus !== 'completed') {
      const operator = req.user?.username || 'system';
      await processExchangeInventory(connection, id, operator);
      logger.info(`✅ 换货单 ${currentExchange.exchange_no} 完成，库存已处理`);

      // 异步生成差价分录
      const [exchangeInfo] = await connection.query('SELECT * FROM sales_exchanges WHERE id = ?', [id]);
      if (exchangeInfo.length > 0) {
        const salesExchange = exchangeInfo[0];
        setImmediate(async () => {
          try {
            const FinanceIntegrationService = require('../../../services/external/FinanceIntegrationService');
            await FinanceIntegrationService.generateExchangeDifferenceEntry(salesExchange);
            logger.info(`✅ 换货差价分录自动生成成功 - 换货单: ${salesExchange.exchange_no}`);
          } catch (financeError) {
            logger.warn(`⚠️ 换货差价分录自动生成失败（不影响换货）: ${financeError.message}`);
          }
        });
      }
    }

    await connection.commit();

    res.json({
      message: '换货单状态更新成功',
      data: { id: parseInt(id), status, previousStatus },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('更新换货单状态失败:', error);
    res.status(500).json({ error: '更新换货单状态失败: ' + error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// 辅助函数：将日期格式化为MySQL日期格式 YYYY-MM-DD
function formatDateToMySQLDate(date) {
  if (!date) return null;
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

// 处理换货库存操作
async function processExchangeInventory(connection, exchangeId, operator) {
  try {
    // 获取换货单信息
    const [exchangeInfo] = await connection.query(
      'SELECT exchange_no FROM sales_exchanges WHERE id = ?',
      [exchangeId]
    );

    if (exchangeInfo.length === 0) {
      throw new Error(`换货单ID ${exchangeId} 不存在`);
    }

    const exchangeNo = exchangeInfo[0].exchange_no;

    // 获取换货明细
    const [exchangeItems] = await connection.query(
      `
      SELECT sei.*, m.id as material_id, m.location_id, m.unit_id, m.price
      FROM sales_exchange_items sei
      LEFT JOIN materials m ON sei.product_code COLLATE utf8mb4_unicode_ci = m.code COLLATE utf8mb4_unicode_ci
      WHERE sei.exchange_id = ?
        ORDER BY sei.item_type, sei.id
          `,
      [exchangeId]
    );

    if (exchangeItems.length === 0) {
      return;
    }

    // 分别处理退回商品和换出商品
    const returnItems = exchangeItems.filter((item) => item.item_type === 'return');
    const newItems = exchangeItems.filter((item) => item.item_type === 'new');

    // 处理退回商品 - 增加库存
    for (const item of returnItems) {
      if (!item.material_id) {
        continue;
      }

      const locationId = item.location_id;
      if (!locationId) {
        throw new Error(`退回商品 ${item.material_id} 未能获取到归属仓库，操作终止。`);
      }
      logger.info('🔍 退回商品数量调试:', {
        product_code: item.product_code,
        quantity: item.quantity,
        type: typeof item.quantity,
      });
      const quantity = parseFloat(item.quantity);

      // 获取当前库存
      const [stockResult] = await connection.query(
        `
        SELECT COALESCE(SUM(
            CASE
            WHEN transaction_type IN('inbound', 'transfer_in', 'adjustment_in', 'sales_return') THEN quantity
            WHEN transaction_type IN('outbound', 'transfer_out', 'adjustment_out', 'sales_outbound') THEN - quantity
            ELSE 0
          END
          ), 0) as current_quantity
        FROM inventory_ledger
        WHERE material_id = ? AND location_id = ?
        `,
        [item.material_id, locationId]
      );

      const beforeQuantity = parseFloat(stockResult[0]?.current_quantity || 0);
      const afterQuantity = beforeQuantity + quantity;

      // 🔥 使用统一的 InventoryService 记录退回商品的库存增加
      const InventoryService = require('../../../services/InventoryService');
      await InventoryService.updateStock(
        {
          materialId: item.material_id,
          locationId: locationId,
          quantity: quantity, // 正数表示入库
          transactionType: 'sales_exchange_return',
          referenceNo: exchangeNo,
          referenceType: 'sales_exchange',
          operator: operator,
          remark: `换货退回：${item.product_name} (${item.specification})`,
          unitId: item.unit_id || null,
          batchNumber: null,
        },
        connection
      );
      logger.info(`✅ 换货退回入库完成（统一服务）: 物料${item.material_id}, 数量${quantity} `);
    }

    // 处理换出商品 - 减少库存
    for (const item of newItems) {
      if (!item.material_id) {
        continue;
      }

      const locationId = item.location_id;
      if (!locationId) {
        throw new Error(`换出商品 ${item.material_id} 无法确定仓库起源，操作终止。`);
      }
      logger.info('🔍 换出商品数量调试:', {
        product_code: item.product_code,
        quantity: item.quantity,
        type: typeof item.quantity,
      });
      const quantity = parseFloat(item.quantity);

      // 获取当前库存并检查是否充足
      const [stockResult] = await connection.query(
        `
        SELECT COALESCE(SUM(
          CASE
            WHEN transaction_type IN('inbound', 'transfer_in', 'adjustment_in', 'sales_return') THEN quantity
            WHEN transaction_type IN('outbound', 'transfer_out', 'adjustment_out', 'sales_outbound') THEN - quantity
            ELSE 0
          END
        ), 0) as current_quantity
        FROM inventory_ledger
        WHERE material_id = ? AND location_id = ?
        FOR UPDATE
      `,
        [item.material_id, locationId]
      );

      const beforeQuantity = parseFloat(stockResult[0]?.current_quantity || 0);

      if (beforeQuantity < quantity) {
        throw new Error(
          `换出商品 ${item.product_code} 库存不足，需要 ${quantity}，当前库存 ${beforeQuantity} `
        );
      }

      const afterQuantity = beforeQuantity - quantity;

      // 🔥 使用统一的 InventoryService 记录换出商品的库存减少
      const InventoryService = require('../../../services/InventoryService');
      await InventoryService.updateStock(
        {
          materialId: item.material_id,
          locationId: locationId,
          quantity: -quantity, // 负数表示出库
          transactionType: 'sales_exchange_out',
          referenceNo: exchangeNo,
          referenceType: 'sales_exchange',
          operator: operator,
          remark: `换货发出：${item.product_name} (${item.specification})`,
          unitId: item.unit_id || null,
          batchNumber: null,
        },
        connection
      );
      logger.info(`✅ 换货发出完成（统一服务）: 物料${item.material_id}, 数量${-quantity} `);
    }
  } catch (error) {
    logger.error('处理换货库存操作失败:', error);
    throw error;
  }
}

// 根据物料来源自动生成后续单据（使用统一的新函数）
async function autoGenerateFollowUpDocuments(salesOrderId, items, userInfo) {
  try {
    logger.info('🚀🚀🚀 autoGenerateFollowUpDocuments 被调用了！销售订单ID:', salesOrderId);
    logger.info('📋 销售订单物料列表:', items);

    // 获取物料信息和来源类型，同时检查库存
    const materialsBySource = await getMaterialsBySourceWithInventoryCheck(items);

    logger.info('📊 库存检查结果:', {
      自产物料: materialsBySource.internal.length,
      外购物料: materialsBySource.external.length,
      库存充足: materialsBySource.sufficient.length,
    });

    // 合并库存不足的物料列表
    const insufficientItems = [...materialsBySource.internal, ...materialsBySource.external];

    if (insufficientItems.length === 0) {
      logger.info('✅ 所有物料库存充足，无需生成生产计划或采购申请');
      return 'ready_to_ship';
    }

    logger.info(`⚠️  发现 ${insufficientItems.length} 个物料库存不足，准备生成计划`);

    // 使用统一的生成函数（支持用户信息、合同编码、批量编号生成）
    const connection = await db.pool.getConnection();
    try {
      await generateProductionAndPurchasePlans(
        connection,
        salesOrderId,
        insufficientItems,
        userInfo
      );

      // 根据物料来源类型决定状态
      const hasInternal = materialsBySource.internal.length > 0;
      const hasExternal = materialsBySource.external.length > 0;

      if (hasInternal) {
        return 'in_production'; // 需要生产
      } else if (hasExternal) {
        return 'in_procurement'; // 需要采购
      }
      return 'ready_to_ship';
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('自动生成后续单据失败:', error);
    // 不抛出错误，避免影响销售订单创建
    return 'ready_to_ship'; // 出错时返回默认状态
  }
}

// 获取物料信息并按来源分类（带库存检查）
async function getMaterialsBySourceWithInventoryCheck(items) {
  const materialsBySource = {
    internal: [], // 库存不足的自产物料
    external: [], // 库存不足的外购物料
    sufficient: [], // 库存充足的物料
  };

  for (const item of items) {
    try {
      // 查询物料信息和来源类型
      const materialQuery = `
        SELECT m.*, ms.type as source_type, ms.name as source_name
        FROM materials m
        LEFT JOIN material_sources ms ON m.material_source_id = ms.id
        WHERE m.id = ?
        `;

      const result = await db.query(materialQuery, [item.material_id]);

      if (result.rows && result.rows.length > 0) {
        const material = result.rows[0];

        // 检查当前库存
        const stockQuery = `
          SELECT COALESCE(SUM(quantity), 0) as current_stock
          FROM inventory_ledger
          WHERE material_id = ? AND location_id = ?
        `;

        const stockResult = await db.query(stockQuery, [item.material_id, material.location_id]);
        const currentStock = parseFloat(stockResult.rows[0].current_stock || 0);

        // 获取可用库存（考虑已预留的库存）
        const availableStock = await InventoryReservationService.getAvailableStock(
          item.material_id,
          material.location_id,
          db.pool
        );

        const requiredQuantity = parseFloat(item.quantity || 0);

        const itemWithMaterial = {
          ...item,
          material: material,
          currentStock: currentStock,
          availableStock: availableStock,
          requiredQuantity: requiredQuantity,
          shortage: Math.max(0, requiredQuantity - availableStock),
        };

        // 检查可用库存是否充足（考虑预留）
        if (availableStock >= requiredQuantity) {
          // 可用库存充足，无需生产或采购
          materialsBySource.sufficient.push(itemWithMaterial);
        } else {
          // 可用库存不足，根据来源类型分类
          // 构建完整的物料信息对象
          const insufficientItem = {
            material_id: item.material_id,
            material_name: material.name,
            material_code: material.code,
            source_type: material.source_type || 'external', // 默认为外购
            shortage: itemWithMaterial.shortage,
            currentStock: currentStock,
            availableStock: availableStock,
            requiredQuantity: requiredQuantity,
          };

          if (material.source_type === 'internal') {
            materialsBySource.internal.push(insufficientItem);
            logger.info(
              `  🏭 自产物料: ${material.code} - ${material.name}, 缺货: ${insufficientItem.shortage} `
            );
          } else if (material.source_type === 'external') {
            materialsBySource.external.push(insufficientItem);
            logger.info(
              `  🛒 外购物料: ${material.code} - ${material.name}, 缺货: ${insufficientItem.shortage} `
            );
          } else {
            // 如果来源类型未设置，默认作为外购物料处理
            insufficientItem.source_type = 'external';
            materialsBySource.external.push(insufficientItem);
            logger.warn(
              `  ⚠️  物料来源未设置，默认为外购: ${material.code} - ${material.name}, 缺货: ${insufficientItem.shortage} `
            );
          }
        }
      }
    } catch (error) {
      logger.error(`获取物料信息失败，物料ID: ${item.material_id} `, error);
    }
  }

  return materialsBySource;
}

// 保留原有函数以兼容其他地方的调用
async function getMaterialsBySource(items) {
  const materialsBySource = {
    internal: [], // 自产物料
    external: [], // 外购物料
  };

  for (const item of items) {
    try {
      // 查询物料信息和来源类型
      const materialQuery = `
        SELECT m.*, ms.type as source_type, ms.name as source_name
        FROM materials m
        LEFT JOIN material_sources ms ON m.material_source_id = ms.id
        WHERE m.id = ?
        `;

      const result = await db.query(materialQuery, [item.material_id]);

      if (result.rows && result.rows.length > 0) {
        const material = result.rows[0];
        const itemWithMaterial = {
          ...item,
          material: material,
        };

        // 根据来源类型分类
        if (material.source_type === 'internal') {
          materialsBySource.internal.push(itemWithMaterial);
        } else if (material.source_type === 'external') {
          materialsBySource.external.push(itemWithMaterial);
        }
      }
    } catch (error) {
      logger.error(`获取物料信息失败，物料ID: ${item.material_id} `, error);
    }
  }

  return materialsBySource;
}

// 使用统一的编号生成服务 - 用于采购申请编号生成
async function generatePurchaseRequisitionNo(connection = null) {
  if (connection) {
    // 如果传入了连接，直接使用（在事务中）
    return await CodeGenerators.generatePurchaseRequisitionCode(connection);
  } else {
    // 如果没有传入连接，创建新连接（非事务场景）
    const newConnection = await DBManager.getConnection();
    try {
      return await CodeGenerators.generatePurchaseRequisitionCode(newConnection);
    } finally {
      newConnection.release();
    }
  }
}

// ==================== 订单锁定功能 ====================

/**
 * 锁定销售订单
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
exports.lockOrder = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { lock_reason } = req.body;
    const userId = req.user ? req.user.id : 1;

    // 检查订单是否存在
    const [orderResult] = await connection.execute('SELECT * FROM sales_orders WHERE id = ?', [id]);

    if (orderResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '订单不存在', 'NOT_FOUND', 404);
    }

    const order = orderResult[0];

    // 检查订单是否已经锁定
    if (order.is_locked) {
      await connection.rollback();
      return ResponseHandler.error(res, '订单已经锁定，无法重复锁定', 'BAD_REQUEST', 400);
    }

    // 检查订单状态是否允许锁定 - 只允许生产中和采购中的订单锁定
    const allowedStatuses = ['in_production', 'in_procurement'];

    if (!allowedStatuses.includes(order.status)) {
      await connection.rollback();
      return res.status(400).json({
        message: `订单状态为"${order.status}"，不允许锁定。只有"生产中"和"采购中"的订单才能锁定库存。`,
      });
    }

    // 获取订单物料项
    const [itemsResult] = await connection.execute(
      'SELECT * FROM sales_order_items WHERE order_id = ?',
      [id]
    );

    // 预留库存
    const reservationResult = await InventoryReservationService.reserveInventoryForOrder(
      id,
      order.order_no,
      itemsResult,
      userId,
      connection
    );

    if (!reservationResult.success) {
      await connection.rollback();
      logger.warn('🔒 锁定订单失败 - 库存不足详情:', JSON.stringify({
        orderId: id,
        insufficientItems: reservationResult.insufficientItems,
        reservations: reservationResult.reservations
      }));
      return res.status(400).json({
        success: false,
        message: '库存不足，无法锁定订单',
        errorCode: 'BAD_REQUEST',
        insufficientItems: reservationResult.insufficientItems || []
      });
    }

    // 更新订单锁定状态
    await connection.execute(
      `
      UPDATE sales_orders
      SET is_locked = TRUE, locked_at = NOW(), locked_by = ?, lock_reason = ?, updated_at = NOW()
      WHERE id = ?
        `,
      [userId, lock_reason || '手动锁定', id]
    );

    await connection.commit();

    // 返回详细的锁定结果
    res.json({
      success: reservationResult.success,
      message: reservationResult.fullSuccess ? '订单锁定成功' : '订单部分锁定成功',
      data: {
        orderId: id,
        fullSuccess: reservationResult.fullSuccess,
        partialSuccess: reservationResult.partialSuccess,
        reservations: reservationResult.reservations,
        insufficientItems: reservationResult.insufficientItems,
      }
    });
  } catch (error) {
    await connection.rollback();
    logger.error('锁定订单失败:', error);
    ResponseHandler.error(res, '锁定订单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 解锁销售订单
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
exports.unlockOrder = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const userId = req.user ? req.user.id : 1;

    // 检查订单是否存在
    const [orderResult] = await connection.execute('SELECT * FROM sales_orders WHERE id = ?', [id]);

    if (orderResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '订单不存在', 'NOT_FOUND', 404);
    }

    const order = orderResult[0];

    // 检查订单是否已经锁定
    if (!order.is_locked) {
      await connection.rollback();
      return ResponseHandler.error(res, '订单未锁定，无需解锁', 'BAD_REQUEST', 400);
    }

    // 释放库存预留
    const releaseResult = await InventoryReservationService.releaseInventoryReservation(
      id,
      userId,
      connection
    );

    // 更新订单锁定状态
    await connection.execute(
      `
      UPDATE sales_orders
      SET is_locked = FALSE, locked_at = NULL, locked_by = NULL, lock_reason = NULL, updated_at = NOW()
      WHERE id = ?
        `,
      [id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: '订单解锁成功',
      data: {
        orderId: id,
        releaseResult: releaseResult,
      }
    });
  } catch (error) {
    await connection.rollback();
    logger.error('解锁订单失败:', error);
    ResponseHandler.error(res, '解锁订单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 获取订单锁定状态和预留信息
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
exports.getOrderLockStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // 获取订单锁定信息
    const [orderResult] = await db.pool.execute(
      `
      SELECT so.*, u.username as locked_by_name
      FROM sales_orders so
      LEFT JOIN users u ON so.locked_by = u.id
      WHERE so.id = ?
        `,
      [id]
    );

    if (orderResult.length === 0) {
      return ResponseHandler.error(res, '订单不存在', 'NOT_FOUND', 404);
    }

    const order = orderResult[0];

    // 获取预留信息
    const reservations = await InventoryReservationService.getOrderReservations(id);

    res.json({
      orderId: id,
      isLocked: order.is_locked,
      lockedAt: order.locked_at,
      lockedBy: order.locked_by,
      lockedByName: order.locked_by_name,
      lockReason: order.lock_reason,
      reservations: reservations,
    });
  } catch (error) {
    logger.error('获取订单锁定状态失败:', error);
    ResponseHandler.error(res, '获取订单锁定状态失败', 'SERVER_ERROR', 500, error);
  }
};

// ==================== 装箱单管理 ====================

/**
 * @deprecated 装箱单表结构已迁移至 Knex 迁移文件 20260312000009 管理，此函数保留为空操作
 */
async function ensurePackingListTablesExist() {
  // 表结构由 migrations/20260312000009_baseline_misc_tables.js 管理
  // 测试数据应由 seeds/ 种子文件管理
}

/**
 * 使用统一的编号生成服务 - 替代原 generatePackingListNo 函数
 */
async function generatePackingListNo(connection) {
  return await CodeGenerators.generatePackingListCode(connection);
}

/**
 * 获取装箱单列表
 */
exports.getPackingLists = async (req, res) => {
  try {
    await ensurePackingListTablesExist();

    const {
      page = 1,
      pageSize = 20,
      search = '',
      status = '',
      startDate = '',
      endDate = '',
      customerId = '',
    } = req.query;

    // 确保分页参数是有效的数字
    const currentPage = Math.max(1, parseInt(page) || 1);
    const currentPageSize = Math.max(1, Math.min(10000, parseInt(pageSize) || 20));
    const offset = (currentPage - 1) * currentPageSize;

    const whereConditions = [];
    const queryParams = [];

    // 搜索条件
    if (search) {
      whereConditions.push(
        '(pl.packing_list_no LIKE ? OR pl.customer_name LIKE ? OR pl.sales_order_no LIKE ?)'
      );
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // 状态筛选
    if (status) {
      whereConditions.push('pl.status = ?');
      queryParams.push(status);
    }

    // 客户筛选
    if (customerId) {
      whereConditions.push('pl.customer_id = ?');
      queryParams.push(parseInt(customerId));
    }

    // 日期范围筛选
    if (startDate) {
      whereConditions.push('pl.packing_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      whereConditions.push('pl.packing_date <= ?');
      queryParams.push(endDate);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')} ` : '';

    // 使用字符串拼接避免参数绑定问题
    const sql = `
      SELECT
      pl.*,
        COALESCE(pl.customer_name, '') as customer_name,
        COALESCE(pl.sales_order_no, '') as sales_order_no
      FROM packing_lists pl
      ${whereClause}
      ORDER BY pl.created_at DESC
      LIMIT ${currentPageSize} OFFSET ${offset}
      `;

    logger.info('查询参数:', queryParams);

    const [rows] =
      queryParams.length > 0 ? await db.pool.execute(sql, queryParams) : await db.pool.execute(sql);

    // 获取总数
    const countSql = `
      SELECT COUNT(*) as total
      FROM packing_lists pl
      LEFT JOIN customers c ON pl.customer_id = c.id
      LEFT JOIN sales_orders so ON pl.sales_order_id = so.id
      ${whereClause}
      `;

    const [countResult] =
      queryParams.length > 0
        ? await db.pool.execute(countSql, queryParams)
        : await db.pool.execute(countSql);

    // 获取统计数据
    const [statsResult] = await db.pool.execute(`
      SELECT
      COUNT(*) as total_lists,
        COALESCE(SUM(total_boxes), 0) as total_boxes,
        COALESCE(SUM(total_quantity), 0) as total_quantity,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_count,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_count,
        SUM(CASE WHEN status = 'packing' THEN 1 ELSE 0 END) as packing_count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count
      FROM packing_lists pl
        `);

    res.json({
      data: rows,
      total: countResult[0].total,
      page: currentPage,
      pageSize: currentPageSize,
      statistics: statsResult[0],
    });
  } catch (error) {
    logger.error('获取装箱单列表失败:', error);
    ResponseHandler.error(res, '获取装箱单列表失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取装箱单详情
 */
exports.getPackingList = async (req, res) => {
  try {
    await ensurePackingListTablesExist();

    const { id } = req.params;

    // 获取装箱单基本信息
    const [packingListRows] = await db.pool.execute(
      `
      SELECT
      pl.*,
        c.name as customer_name,
        so.order_no as sales_order_no
      FROM packing_lists pl
      LEFT JOIN customers c ON pl.customer_id = c.id
      LEFT JOIN sales_orders so ON pl.sales_order_id = so.id
      WHERE pl.id = ?
        `,
      [id]
    );

    if (packingListRows.length === 0) {
      return ResponseHandler.error(res, '装箱单不存在', 'NOT_FOUND', 404);
    }

    const packingList = packingListRows[0];

    // 获取装箱单明细
    const [detailRows] = await db.pool.execute(
      `
      SELECT
      pld.*,
        u.name as unit_name
      FROM packing_list_details pld
      LEFT JOIN units u ON pld.unit_id = u.id
      WHERE pld.packing_list_id = ?
        ORDER BY pld.id
          `,
      [id]
    );

    packingList.details = detailRows;

    res.json(packingList);
  } catch (error) {
    logger.error('获取装箱单详情失败:', error);
    ResponseHandler.error(res, '获取装箱单详情失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 创建装箱单
 */
exports.createPackingList = async (req, res) => {
  const connection = await db.pool.getConnection();

  try {
    await ensurePackingListTablesExist();
    await connection.beginTransaction();

    const { customer_id, sales_order_id, packing_date, remark, details = [] } = req.body;

    // 验证必填字段
    if (!customer_id) {
      return ResponseHandler.error(res, '客户ID不能为空', 'BAD_REQUEST', 400);
    }
    if (!packing_date) {
      return ResponseHandler.error(res, '装箱日期不能为空', 'BAD_REQUEST', 400);
    }

    // 获取客户信息
    const [customerRows] = await connection.execute('SELECT id, name FROM customers WHERE id = ?', [
      customer_id,
    ]);
    if (customerRows.length === 0) {
      return ResponseHandler.error(res, '客户不存在', 'BAD_REQUEST', 400);
    }
    const customer = customerRows[0];

    // 获取销售订单信息（如果有）
    let salesOrder = null;
    if (sales_order_id) {
      const [orderRows] = await connection.execute(
        'SELECT id, order_no FROM sales_orders WHERE id = ?',
        [sales_order_id]
      );
      if (orderRows.length > 0) {
        salesOrder = orderRows[0];
      }
    }

    // 生成装箱单号
    const packing_list_no = await generatePackingListNo(connection);

    // 计算总数量和总箱数
    const total_quantity = details.reduce(
      (sum, detail) => sum + (parseFloat(detail.quantity) || 0),
      0
    );
    const total_boxes = details.length; // 每个明细项算一箱

    // 插入装箱单主表
    const [result] = await connection.execute(
      `
      INSERT INTO packing_lists(
            packing_list_no, customer_id, customer_name, sales_order_id, sales_order_no,
            packing_date, total_boxes, total_quantity, remark, created_by, status
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
            `,
      [
        packing_list_no,
        customer_id,
        customer.name,
        sales_order_id || null,
        salesOrder ? salesOrder.order_no : null,
        packing_date,
        total_boxes,
        total_quantity,
        remark || '',
        req.user?.username || 'system',
      ]
    );

    const packingListId = result.insertId;

    // 插入装箱单明细
    if (details && details.length > 0) {
      for (let i = 0; i < details.length; i++) {
        const detail = details[i];

        // 获取产品信息
        let product = null;
        if (detail.product_id) {
          const [productRows] = await connection.execute(
            'SELECT id, code, name, specs, unit_id FROM materials WHERE id = ?',
            [detail.product_id]
          );
          if (productRows.length > 0) {
            product = productRows[0];
          }
        }

        // 获取单位信息
        let unit = null;
        const unitId = detail.unit_id || (product ? product.unit_id : null);
        if (unitId) {
          const [unitRows] = await connection.execute('SELECT id, name FROM units WHERE id = ?', [
            unitId,
          ]);
          if (unitRows.length > 0) {
            unit = unitRows[0];
          }
        }

        await connection.execute(
          `
          INSERT INTO packing_list_details(
              packing_list_id, product_id, product_code, product_name,
              product_specs, quantity, unit_id, unit_name, item_no,
              box_no, weight, volume, remark
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            packingListId,
            detail.product_id || null,
            detail.product_code || (product ? product.code : ''),
            detail.product_name || (product ? product.name : ''),
            detail.product_specs || (product ? product.specs : ''),
            detail.quantity || 0,
            unitId,
            detail.unit_name || (unit ? unit.name : ''),
            detail.item_no || '',
            detail.box_no || `BOX${String(i + 1).padStart(3, '0')} `,
            detail.weight || null,
            detail.volume || null,
            detail.remark || '',
          ]
        );
      }
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        id: packingListId,
        packing_list_no,
        message: '装箱单创建成功',
      },
      '创建成功',
      201
    );
  } catch (error) {
    await connection.rollback();
    logger.error('创建装箱单失败:', error);
    ResponseHandler.error(res, '创建装箱单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新装箱单
 */
exports.updatePackingList = async (req, res) => {
  const connection = await db.pool.getConnection();

  try {
    await ensurePackingListTablesExist();
    await connection.beginTransaction();

    const { id } = req.params;
    const { customer_id, sales_order_id, packing_date, status, remark, details = [] } = req.body;

    // 计算总箱数
    const total_boxes = details.reduce((sum, detail) => sum + (parseInt(detail.quantity) || 0), 0);

    // 更新装箱单主表
    await connection.execute(
      `
      UPDATE packing_lists SET
      customer_id = ?,
        sales_order_id = ?,
        packing_date = ?,
        status = ?,
        total_boxes = ?,
        remark = ?,
        updated_by = ?
          WHERE id = ?
            `,
      [
        customer_id,
        sales_order_id || null,
        packing_date,
        status || 'draft',
        total_boxes,
        remark || '',
        req.user?.username || 'system',
        id,
      ]
    );

    // 删除原有明细
    await connection.execute('DELETE FROM packing_list_details WHERE packing_list_id = ?', [id]);

    // 插入新明细
    if (details && details.length > 0) {
      for (const detail of details) {
        await connection.execute(
          `
          INSERT INTO packing_list_details(
              packing_list_id, product_id, product_code, product_name,
              product_specs, quantity, unit_id, item_no, remark
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            id,
            detail.product_id,
            detail.product_code || '',
            detail.product_name || '',
            detail.product_specs || '',
            detail.quantity || 0,
            detail.unit_id || null,
            detail.item_no || '',
            detail.remark || '',
          ]
        );
      }
    }

    await connection.commit();

    res.json({
      id: parseInt(id),
      message: '装箱单更新成功',
    });
  } catch (error) {
    await connection.rollback();
    logger.error('更新装箱单失败:', error);
    ResponseHandler.error(res, '更新装箱单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 删除装箱单
 */
exports.deletePackingList = async (req, res) => {
  const connection = await db.pool.getConnection();

  try {
    await ensurePackingListTablesExist();
    await connection.beginTransaction();

    const { id } = req.params;

    // 检查装箱单是否存在
    const [packingListRows] = await connection.execute(
      'SELECT id, status FROM packing_lists WHERE id = ?',
      [id]
    );

    if (packingListRows.length === 0) {
      return ResponseHandler.error(res, '装箱单不存在', 'NOT_FOUND', 404);
    }

    const packingList = packingListRows[0];

    // 检查是否可以删除（只有草稿状态可以删除）
    if (packingList.status !== 'draft') {
      return ResponseHandler.error(res, '只有草稿状态的装箱单可以删除', 'BAD_REQUEST', 400);
    }

    // 删除装箱单明细（由于外键约束，会自动删除）
    await connection.execute('DELETE FROM packing_list_details WHERE packing_list_id = ?', [id]);

    // 删除装箱单主表
    await connection.execute('DELETE FROM packing_lists WHERE id = ?', [id]);

    await connection.commit();

    res.json({
      message: '装箱单删除成功',
    });
  } catch (error) {
    await connection.rollback();
    logger.error('删除装箱单失败:', error);
    ResponseHandler.error(res, '删除装箱单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新装箱单状态
 */
exports.updatePackingListStatus = async (req, res) => {
  try {
    await ensurePackingListTablesExist();

    const { id } = req.params;
    const { status, remark } = req.body;

    // 验证状态值
    const validStatuses = ['draft', 'confirmed', 'packing', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return ResponseHandler.error(res, '无效的状态值', 'BAD_REQUEST', 400);
    }

    // 检查装箱单是否存在
    const [packingListRows] = await db.pool.execute(
      'SELECT id, status, packing_list_no FROM packing_lists WHERE id = ?',
      [id]
    );

    if (packingListRows.length === 0) {
      return ResponseHandler.error(res, '装箱单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = packingListRows[0].status;

    // 状态转换验证
    const statusTransitions = {
      draft: ['confirmed', 'cancelled'],
      confirmed: ['packing', 'cancelled'],
      packing: ['completed', 'cancelled'],
      completed: [], // 已完成不能转换到其他状态
      cancelled: ['draft'], // 已取消可以重新开始
    };

    if (!statusTransitions[currentStatus].includes(status)) {
      return res.status(400).json({
        message: `不能从状态 "${currentStatus}" 转换到 "${status}"`,
      });
    }

    // 更新状态
    await db.pool.execute(
      `
      UPDATE packing_lists SET
      status = ?,
        remark = COALESCE(?, remark),
        updated_by = ?
          WHERE id = ?
            `,
      [status, remark, req.user?.username || 'system', id]
    );

    res.json({
      id: parseInt(id),
      status,
      message: '状态更新成功',
    });
  } catch (error) {
    logger.error('更新装箱单状态失败:', error);
    ResponseHandler.error(res, '更新装箱单状态失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 导出销售订单
 */
exports.exportOrders = async (req, res) => {
  try {
    const { search = '', status = '', startDate = '', endDate = '' } = req.body;

    // 构建查询条件
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      whereClause += ' AND (so.order_no LIKE ? OR c.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (status) {
      whereClause += ' AND so.status = ?';
      params.push(status);
    }

    if (startDate) {
      whereClause += ' AND DATE(so.created_at) >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND DATE(so.created_at) <= ?';
      params.push(endDate);
    }

    const connection = await db.pool.getConnection();

    try {
      // 获取订单数据
      const [orders] = await connection.query(
        `
      SELECT
      so.order_no as '订单编号',
        c.name as '客户名称',
        DATE(so.created_at) as '订单日期',
        so.delivery_date as '交货日期',
        so.total_amount as '订单金额',
        CASE so.status
            WHEN 'draft' THEN '草稿'
            WHEN 'confirmed' THEN '已确认'
            WHEN 'in_production' THEN '生产中'
            WHEN 'completed' THEN '已完成'
            WHEN 'cancelled' THEN '已取消'
            ELSE so.status
      END as '订单状态',
        so.remarks as '备注',
        so.created_at as '创建时间'
        FROM sales_orders so
        LEFT JOIN customers c ON so.customer_id = c.id
        ${whereClause}
        ORDER BY so.created_at DESC
        LIMIT 1000
      `,
        params
      );

      // 使用 ExcelJS 创建Excel文件
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('销售订单');

      // 设置列，注意 key 必须与 SQL 查询的 AS 别名完全一致
      worksheet.columns = [
        { header: '订单编号', key: '订单编号', width: 20 },
        { header: '客户名称', key: '客户名称', width: 25 },
        { header: '订单日期', key: '订单日期', width: 15 },
        { header: '交货日期', key: '交货日期', width: 15 },
        { header: '订单金额', key: '订单金额', width: 15 },
        { header: '订单状态', key: '订单状态', width: 15 },
        { header: '备注', key: '备注', width: 30 },
        { header: '创建时间', key: '创建时间', width: 20 },
      ];

      // 添加数据行
      orders.forEach((order) => {
        worksheet.addRow(order);
      });

      // 生成Excel文件
      const excelBuffer = await workbook.xlsx.writeBuffer();

      // 设置响应头
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      const filename = `sales_orders_${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader(
        'Content-Disposition',
        `attachment; filename = "${filename}"; filename *= UTF - 8''${encodeURIComponent('销售订单_' + new Date().toISOString().slice(0, 10) + '.xlsx')} `
      );

      res.send(excelBuffer);
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('导出销售订单失败:', error);
    ResponseHandler.error(res, '导出销售订单失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 导入销售订单
 */
exports.importOrders = async (req, res) => {
  try {
    // 记录当前用户信息
    logger.info('📥 导入订单 - 当前用户信息:', {
      id: req.user?.id,
      username: req.user?.username,
      real_name: req.user?.real_name,
    });

    if (!req.file) {
      return ResponseHandler.error(res, '请选择要导入的文件', 'BAD_REQUEST', 400);
    }

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const worksheet = workbook.worksheets[0];
    const data = [];
    const headers = [];

    worksheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber - 1] = cell.value;
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // 跳过表头
      const rowData = {};
      row.eachCell((cell, colNumber) => {
        rowData[headers[colNumber - 1]] = cell.value;
      });
      data.push(rowData);
    });

    if (!data || data.length === 0) {
      return ResponseHandler.error(res, '导入文件为空或格式不正确', 'BAD_REQUEST', 400);
    }

    const connection = await db.pool.getConnection();
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    try {
      await connection.beginTransaction();

      // 按客户+合同编码分组处理订单
      const ordersByCustomer = {};

      // 先验证所有数据并按客户+合同编码分组
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2;

        try {
          // 验证必填字段
          if (!row['客户编码']) {
            errors.push(`第${rowNum} 行: 客户编码为必填项`);
            errorCount++;
            continue;
          }

          // 验证产品信息（编码或规格至少填一个）
          if (!row['产品编码'] && !row['产品规格']) {
            errors.push(`第${rowNum} 行: 产品编码或产品规格至少填写一个`);
            errorCount++;
            continue;
          }

          // 验证数量
          const quantity = parseFloat(row['数量']) || 0;
          if (quantity <= 0) {
            errors.push(`第${rowNum} 行: 数量必须大于0`);
            errorCount++;
            continue;
          }

          // 单价可以为空，默认为0
          const unitPrice = parseFloat(row['单价']) || 0;

          // 按客户编码+合同编码分组（不同客户或不同合同的订单分开）
          const customerCode = row['客户编码'];
          const contractCode = row['合同编码'] || '';
          const groupKey = `${customerCode}_${contractCode} `;

          if (!ordersByCustomer[groupKey]) {
            // 处理交货日期
            let deliveryDate;
            if (row['交货日期']) {
              // 如果Excel中填写了交货日期，就使用表格中的日期
              const originalDate = new Date(row['交货日期']);
              deliveryDate = originalDate.toISOString().split('T')[0];
            } else {
              // 如果Excel中没有填写交货日期，默认使用当前日期+21天（3周）
              const defaultDate = new Date();
              defaultDate.setDate(defaultDate.getDate() + 21);
              deliveryDate = defaultDate.toISOString().split('T')[0];
            }

            ordersByCustomer[groupKey] = {
              customerCode: customerCode,
              contractCode: contractCode,
              deliveryDate: deliveryDate,
              remarks: row['备注'] || '',
              items: [],
            };

            // 调试日志：记录备注信息
            if (row['备注']) {
              logger.info(
                `📝 读取到备注信息: "${row['备注']}"(客户: ${customerCode}, 合同: ${contractCode})`
              );
            }
          }

          // 添加订单明细
          ordersByCustomer[groupKey].items.push({
            productCode: row['产品编码'] || '',
            productSpecs: row['产品规格'] || '',
            quantity: quantity,
            unitPrice: unitPrice, // 可以为0
            amount: quantity * unitPrice, // 如果单价为0，金额也为0
            remark: row['备注'] || '', // 添加产品级别的备注
            rowNum: rowNum,
          });

          // 调试日志：记录产品级别的备注
          if (row['备注']) {
            logger.info(
              `📝 读取到产品备注: "${row['备注']}"(产品编码: ${row['产品编码'] || row['产品规格']})`
            );
          }
        } catch (error) {
          logger.error(`验证第${rowNum} 行数据失败: `, error);
          errors.push(`第${rowNum} 行: ${error.message} `);
          errorCount++;
        }
      }

      // 处理每个分组的订单（按客户+合同编码分组）
      for (const [groupKey, orderData] of Object.entries(ordersByCustomer)) {
        try {
          // 通过客户编码查找客户ID
          const [customers] = await connection.query('SELECT id FROM customers WHERE code = ?', [
            orderData.customerCode,
          ]);

          if (customers.length === 0) {
            // 标记该客户的所有行为错误
            orderData.items.forEach((item) => {
              errors.push(
                `第${item.rowNum} 行: 找不到客户编码"${orderData.customerCode}"，请确认客户编码是否正确`
              );
              errorCount++;
            });
            continue;
          }

          // 计算订单总金额
          const totalAmount = orderData.items.reduce((sum, item) => sum + item.amount, 0);

          // 生成订单编号
          const orderNo = await generateSalesOrderNo(connection);

          // 调试日志：记录即将插入的备注信息
          logger.info(`📝 准备插入订单备注: "${orderData.remarks}"(订单号: ${orderNo})`);

          // 插入销售订单主记录
          const [orderResult] = await connection.query(
            `
            INSERT INTO sales_orders(
          order_no, customer_id, contract_code, delivery_date,
          total_amount, status, remarks, created_by, created_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `,
            [
              orderNo,
              customers[0].id,
              orderData.contractCode,
              orderData.deliveryDate,
              totalAmount,
              'draft',
              orderData.remarks,
              req.user?.id || 1,
            ]
          );

          const orderId = orderResult.insertId;

          // 插入订单明细
          for (const item of orderData.items) {
            let materialId = null;
            const productCodeForStorage = item.productCode || '';
            const productSpecsForStorage = item.productSpecs || '';

            // 根据产品编码或规格查找物料
            if (item.productCode) {
              const [materials] = await connection.query(
                'SELECT id FROM materials WHERE code = ?',
                [item.productCode]
              );
              if (materials.length > 0) {
                materialId = materials[0].id;
                logger.info(`✅ 找到物料: 编码 = ${item.productCode}, ID = ${materialId} `);
              } else {
                logger.warn(`⚠️ 未找到产品编码 ${item.productCode} 对应的物料，将自动创建物料记录`);

                // 获取默认的物料来源ID（外购）
                const [defaultSource] = await connection.query(`
                  SELECT id FROM material_sources WHERE type = 'external' AND status = 1 ORDER BY sort LIMIT 1
        `);
                const defaultSourceId = defaultSource.length > 0 ? defaultSource[0].id : null;

                // 自动创建物料记录（名称和规格使用产品编码，设置默认物料来源）
                const [createResult] = await connection.query(
                  `
                  INSERT INTO materials(name, specs, material_source_id, created_at, updated_at)
      VALUES(?, ?, ?, NOW(), NOW())
                `,
                  [item.productCode, item.productCode, defaultSourceId]
                );

                materialId = createResult.insertId;
                logger.info(
                  `✅ 已自动创建物料: ID = ${materialId}, 名称 = ${item.productCode}, 规格 = ${item.productCode}, 物料来源ID = ${defaultSourceId || '未设置'} `
                );
              }
            } else if (item.productSpecs) {
              const [materials] = await connection.query(
                'SELECT id FROM materials WHERE specs = ?',
                [item.productSpecs]
              );
              if (materials.length > 0) {
                materialId = materials[0].id;
                logger.info(`✅ 找到物料: 规格 = ${item.productSpecs}, ID = ${materialId} `);
              } else {
                logger.warn(
                  `⚠️ 未找到产品规格 ${item.productSpecs} 对应的物料，将自动创建物料记录`
                );

                // 获取默认的物料来源ID（外购）
                const [defaultSource] = await connection.query(`
                  SELECT id FROM material_sources WHERE type = 'external' AND status = 1 ORDER BY sort LIMIT 1
        `);
                const defaultSourceId = defaultSource.length > 0 ? defaultSource[0].id : null;

                // 自动创建物料记录（名称和规格使用产品规格，设置默认物料来源）
                const [createResult] = await connection.query(
                  `
                  INSERT INTO materials(name, specs, material_source_id, created_at, updated_at)
      VALUES(?, ?, ?, NOW(), NOW())
                `,
                  [item.productSpecs, item.productSpecs, defaultSourceId]
                );

                materialId = createResult.insertId;
                logger.info(
                  `✅ 已自动创建物料: ID = ${materialId}, 名称 = ${item.productSpecs}, 规格 = ${item.productSpecs}, 物料来源ID = ${defaultSourceId || '未设置'} `
                );
              }
            }

            // 如果仍然没有物料ID（既没有编码也没有规格），记录警告
            if (!materialId) {
              logger.warn(
                `📝 订单明细暂无物料ID：产品编码 = ${productCodeForStorage || '无'}，产品规格 = ${productSpecsForStorage || '无'}，数量 = ${item.quantity}，单价 = ${item.unitPrice} `
              );
            }

            // 调试日志：记录产品备注插入
            if (item.remark) {
              logger.info(`📝 插入产品备注: "${item.remark}"(物料ID: ${materialId || '待补充'})`);
            }

            // 插入订单明细（允许material_id为NULL）
            await connection.query(
              `
              INSERT INTO sales_order_items(
        order_id, material_id, quantity, unit_price, amount, remark, product_code, product_specs
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
            `,
              [
                orderId,
                materialId, // 可以为NULL
                item.quantity,
                item.unitPrice,
                item.amount,
                item.remark || '',
                productCodeForStorage,
                productSpecsForStorage,
              ]
            );
          }

          // 导入完成后立即进行库存检查并设置正确状态
          logger.info(`🔍 导入订单后进行库存检查 - 订单ID: ${orderId}, 订单号: ${orderNo} `);

          // 获取订单明细进行库存检查
          const [orderItems] = await connection.execute(
            `SELECT soi.*, m.name as material_name, m.code as material_code, ms.type as source_type
             FROM sales_order_items soi
             LEFT JOIN materials m ON soi.material_id = m.id
             LEFT JOIN material_sources ms ON m.material_source_id = ms.id
             WHERE soi.order_id = ? `,
            [orderId]
          );

          // 如果订单没有任何明细项（这种情况理论上不应该发生，因为我们刚刚插入了明细）
          if (orderItems.length === 0) {
            await connection.query('DELETE FROM sales_orders WHERE id = ?', [orderId]);
            const errorMsg = `订单 ${orderNo} 没有明细项，已删除`;
            logger.error(errorMsg);
            errors.push(errorMsg);
            errorCount++;
            continue; // 跳过这个订单
          }

          logger.info(`✅ 订单 ${orderNo} 共有 ${orderItems.length} 个明细项`);

          if (orderItems.length > 0) {
            const insufficientItems = [];
            let hasIncompleteMaterial = false; // 标记是否有物料信息不完整

            for (const item of orderItems) {
              if (item.material_id) {
                // 验证物料信息是否完整
                const [materialInfo] = await connection.execute(
                  'SELECT code, category_id, unit_id, material_source_id FROM materials WHERE id = ?',
                  [item.material_id]
                );

                if (materialInfo.length > 0) {
                  const material = materialInfo[0];
                  const isComplete =
                    material.code &&
                    material.category_id &&
                    material.unit_id &&
                    material.material_source_id;

                  if (!isComplete) {
                    hasIncompleteMaterial = true;
                    logger.warn(
                      `⚠️  物料信息不完整: ${item.material_name} (编码: ${material.code || '无'
                      }, 分类:${material.category_id || '无'}, 单位:${material.unit_id || '无'}, 来源:${material.material_source_id || '无'})`
                    );
                    continue; // 跳过此物料，不检查库存
                  }
                }

                // 检查库存
                const [stockResult] = await connection.execute(
                  `SELECT COALESCE(SUM(current_quantity), 0) as current_quantity
                   FROM v_batch_stock
                   WHERE material_id = ? `,
                  [item.material_id]
                );

                const currentStock = parseFloat(stockResult[0]?.current_quantity || 0);
                const requiredQuantity = parseFloat(item.quantity);

                logger.info(
                  `📦 物料 ${item.material_name} (${item.material_code}): 需要${requiredQuantity}, 库存${currentStock} `
                );

                if (currentStock < requiredQuantity) {
                  insufficientItems.push({
                    material_id: item.material_id,
                    material_name: item.material_name,
                    material_code: item.material_code,
                    source_type: item.source_type,
                    required: requiredQuantity,
                    available: currentStock,
                    shortage: requiredQuantity - currentStock,
                  });
                  logger.info(
                    `❌ 库存不足: ${item.material_name}, 缺少${requiredQuantity - currentStock} `
                  );
                } else {
                  logger.info(`✅ 库存充足: ${item.material_name} `);
                }
              }
            }

            // 根据库存检查结果设置正确状态
            let finalStatus = 'draft';

            // 如果有物料信息不完整，保持草稿状态
            if (hasIncompleteMaterial) {
              finalStatus = 'draft';
              logger.warn(
                `⚠️  订单 ${orderNo} 包含物料信息不完整的明细，状态设置为: draft，请补充物料信息后再确认订单`
              );
            } else if (insufficientItems.length > 0) {
              logger.info(`⚠️  发现 ${insufficientItems.length} 个物料库存不足`);

              // 自动生成生产计划或采购申请
              try {
                await generateProductionAndPurchasePlans(
                  connection,
                  orderId,
                  insufficientItems,
                  req.user || { id: 1, username: 'system', real_name: '系统' }
                );

                // 根据物料来源类型决定状态
                const hasInternal = insufficientItems.some(
                  (item) => item.source_type === 'internal'
                );
                const hasExternal = insufficientItems.some(
                  (item) => item.source_type === 'external'
                );

                if (hasInternal) {
                  finalStatus = 'in_production';
                  logger.info(`🔄 状态设置为: ${finalStatus} (因有自产物料库存不足)`);
                } else if (hasExternal) {
                  finalStatus = 'in_procurement';
                  logger.info(`🔄 状态设置为: ${finalStatus} (因有外购物料库存不足)`);
                }
              } catch (planError) {
                logger.error('自动生成生产计划/采购申请失败:', planError);
                finalStatus = 'in_production'; // 默认设为生产中
              }
            } else {
              // 库存充足，可以直接发货
              finalStatus = 'ready_to_ship';
              logger.info(`🔄 状态设置为: ${finalStatus} (库存充足)`);
            }

            // 更新订单状态
            await connection.execute(
              'UPDATE sales_orders SET status = ?, updated_at = NOW() WHERE id = ?',
              [finalStatus, orderId]
            );

            logger.info(`✅ 订单 ${orderNo} 状态已设置为: ${finalStatus} `);
          }

          successCount += orderData.items.length;
        } catch (error) {
          logger.error(
            `处理客户编码"${orderData.customerCode}"、合同编码"${orderData.contractCode}"的订单失败: `,
            error
          );
          // 标记该分组的所有行为错误
          orderData.items.forEach((item) => {
            errors.push(`第${item.rowNum} 行: ${error.message} `);
            errorCount++;
          });
        }
      }

      await connection.commit();

      res.json({
        success: true,
        message: `导入完成，成功${successCount} 条，失败${errorCount} 条`,
        data: {
          successCount,
          errorCount,
          errors: errors.slice(0, 10), // 只返回前10个错误
        },
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('导入销售订单失败:', error);
    ResponseHandler.error(res, '导入销售订单失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 下载销售订单导入模板
 */
exports.downloadOrderTemplate = async (req, res) => {
  try {
    logger.info('收到销售订单导入模板下载请求');

    // 准备模板数据
    const templateData = [
      {
        客户编码: 'C001',
        合同编码: 'HT2025001',
        产品编码: 'PROD001',
        产品规格: '10*20*30mm',
        数量: 10,
        单价: 100,
        交货日期: '2025-09-15',
        订单金额: 1000,
        备注: '示例订单备注',
      },
      {
        客户编码: 'C001',
        合同编码: 'HT2025001',
        产品编码: '',
        产品规格: '不锈钢板材 厚度5mm',
        数量: 5,
        单价: 200,
        交货日期: '2025-09-15',
        订单金额: 1000,
        备注: '可以只填产品编码或产品规格',
      },
    ];

    // 创建工作簿
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(templateData);

    // 设置列宽
    const colWidths = [
      { wch: 15 }, // 客户编码
      { wch: 15 }, // 合同编码
      { wch: 15 }, // 产品编码
      { wch: 25 }, // 产品规格
      { wch: 10 }, // 数量
      { wch: 12 }, // 单价
      { wch: 15 }, // 交货日期
      { wch: 15 }, // 订单金额
      { wch: 30 }, // 备注
    ];
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, '销售订单导入模板');

    // 生成Excel文件
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // 设置响应头
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    const filename = 'sales_order_import_template.xlsx';
    res.setHeader(
      'Content-Disposition',
      `attachment; filename = "${filename}"; filename *= UTF - 8''${encodeURIComponent('销售订单导入模板.xlsx')} `
    );

    logger.info('销售订单导入模板下载成功，文件大小:', excelBuffer.length);
    res.send(excelBuffer);
  } catch (error) {
    logger.error('下载销售订单导入模板失败:', error);
    ResponseHandler.error(res, '下载销售订单导入模板失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取装箱单统计信息
 */
exports.getPackingListStatistics = async (req, res) => {
  try {
    await ensurePackingListTablesExist();

    const { startDate, endDate } = req.query;

    let dateCondition = '';
    let queryParams = [];

    if (startDate && endDate) {
      dateCondition = 'WHERE packing_date BETWEEN ? AND ?';
      queryParams = [startDate, endDate];
    } else if (startDate) {
      dateCondition = 'WHERE packing_date >= ?';
      queryParams = [startDate];
    } else if (endDate) {
      dateCondition = 'WHERE packing_date <= ?';
      queryParams = [endDate];
    }

    // 获取基础统计
    const [basicStats] = await db.pool.execute(
      `
  SELECT
  COUNT(*) as total_lists,
    SUM(total_boxes) as total_boxes,
    SUM(total_quantity) as total_quantity,
    SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_count,
    SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_count,
    SUM(CASE WHEN status = 'packing' THEN 1 ELSE 0 END) as packing_count,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count
      FROM packing_lists
      ${dateCondition}
  `,
      queryParams
    );

    // 获取每日统计
    const [dailyStats] = await db.pool.execute(
      `
  SELECT
  DATE(packing_date) as date,
    COUNT(*) as count,
    SUM(total_boxes) as boxes,
    SUM(total_quantity) as quantity
      FROM packing_lists
      ${dateCondition}
      GROUP BY DATE(packing_date)
      ORDER BY date DESC
      LIMIT 30
    `,
      queryParams
    );

    // 获取客户统计
    const [customerStats] = await db.pool.execute(
      `
  SELECT
  customer_name,
    COUNT(*) as count,
    SUM(total_boxes) as boxes,
    SUM(total_quantity) as quantity
      FROM packing_lists
      ${dateCondition}
      GROUP BY customer_id, customer_name
      ORDER BY count DESC
      LIMIT 10
    `,
      queryParams
    );

    res.json({
      basic: basicStats[0],
      daily: dailyStats,
      customers: customerStats,
    });
  } catch (error) {
    logger.error('获取装箱单统计失败:', error);
    ResponseHandler.error(res, '获取装箱单统计失败', 'SERVER_ERROR', 500, error);
  }
};

// 计算并插入生产计划的物料需求
async function calculateAndInsertMaterialsForPlan(connection, planId, productId, quantity) {
  try {
    // 获取产品最新的已审核BOM
    const [bomMasters] = await connection.query(
      `
      SELECT id
      FROM bom_masters
      WHERE product_id = ? AND approved_by IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
      [productId]
    );

    if (bomMasters.length === 0) {
      const [products] = await connection.query(
        `
        SELECT code, name FROM materials WHERE id = ?
    `,
        [productId]
      );

      const productInfo =
        products.length > 0 ? `${products[0].code} - ${products[0].name} ` : `ID: ${productId} `;
      throw new Error(`产品 ${productInfo} 未找到有效的BOM配置`);
    }

    const bomId = bomMasters[0].id;

    // 获取BOM明细（只获取一级物料）
    const [bomDetails] = await connection.query(
      `
  SELECT
  bd.material_id,
    bd.quantity,
    m.code,
    m.name,
    COALESCE(s.quantity, 0) as stock_quantity
      FROM bom_details bd
      LEFT JOIN materials m ON bd.material_id = m.id
      LEFT JOIN(
      SELECT il.material_id, SUM(il.quantity) as quantity
        FROM inventory_ledger il
        JOIN materials mat ON il.material_id = mat.id
        WHERE mat.location_id IS NULL OR il.location_id = mat.location_id
        GROUP BY il.material_id
    ) s ON m.id = s.material_id
      WHERE bd.bom_id = ? AND(bd.level = 1 OR bd.level IS NULL)
      ORDER BY bd.id ASC
    `,
      [bomId]
    );

    if (bomDetails.length === 0) {
      throw new Error(`BOM ID ${bomId} 中没有物料明细`);
    }

    // 插入物料需求记录
    for (const detail of bomDetails) {
      const requiredQuantity = Number(detail.quantity) * Number(quantity);
      const stockQuantity = Number(detail.stock_quantity) || 0;

      await connection.query(
        `
        INSERT INTO production_plan_materials
    (plan_id, material_id, required_quantity, stock_quantity)
  VALUES(?, ?, ?, ?)
      `,
        [planId, detail.material_id, requiredQuantity, stockQuantity]
      );
    }

    logger.info(`    📦 已为生产计划 ${planId} 计算并保存 ${bomDetails.length} 个物料需求`);
  } catch (error) {
    logger.error('计算生产计划物料需求失败:', error);
    throw error;
  }
}

// 生成生产计划和采购申请的统一函数
async function generateProductionAndPurchasePlans(
  connection,
  salesOrderId,
  insufficientItems,
  userInfo
) {
  try {
    // 首先查询销售订单号和合同编码
    let salesOrderNo = salesOrderId; // 默认使用ID
    let contractCode = ''; // 合同编码
    try {
      const [orderRows] = await connection.execute(
        'SELECT order_no, contract_code FROM sales_orders WHERE id = ?',
        [salesOrderId]
      );
      if (orderRows && orderRows.length > 0) {
        salesOrderNo = orderRows[0].order_no;
        contractCode = orderRows[0].contract_code || '';
      }
    } catch (queryError) {
      logger.error('查询销售订单信息失败:', queryError);
      // 继续使用ID作为备用
    }

    // 分离自产和外购物料
    const internalMaterials = insufficientItems.filter((item) => item.source_type === 'internal');
    const externalMaterials = insufficientItems.filter((item) => item.source_type === 'external');

    // 处理自产物料 - 逐个生成生产计划
    if (internalMaterials.length > 0) {
      try {
        logger.info(`📝 开始为 ${internalMaterials.length} 个自产物料生成生产计划`);

        // 逐个创建生产计划
        for (let i = 0; i < internalMaterials.length; i++) {
          const item = internalMaterials[i];
          const { material_id, material_name, material_code, shortage } = item;

          // 使用统一的编号生成器逐个生成编号（保证唯一性和并发安全）
          const planNo = await CodeGenerators.generatePlanCode(connection);

          try {
            // 计算预计开始和结束日期
            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(startDate.getDate() + 7); // 假设生产周期为7天

            const insertQuery = `
              INSERT INTO production_plans
    (code, name, product_id, quantity, start_date, end_date, status, remark, contract_code)
  VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            // 构建备注内容
            const remarkText = contractCode
              ? `由销售订单${salesOrderNo}（合同编码：${contractCode}）自动生成`
              : `由销售订单${salesOrderNo} 自动生成`;

            const [insertResult] = await connection.execute(insertQuery, [
              planNo,
              `${material_name || material_code} 生产计划`,
              material_id,
              shortage,
              startDate.toISOString().split('T')[0],
              endDate.toISOString().split('T')[0],
              'draft',
              remarkText,
              contractCode || null,
            ]);

            const planId = insertResult.insertId;

            // 计算并插入物料需求
            try {
              await calculateAndInsertMaterialsForPlan(connection, planId, material_id, shortage);
              logger.info(
                `  ✅ 生产计划创建成功: ${planNo} (物料: ${material_name}, 数量: ${shortage}，已计算物料需求)`
              );
            } catch (bomError) {
              logger.warn(
                `  ⚠️  生产计划创建成功: ${planNo}，但计算物料需求失败: ${bomError.message} `
              );
              // 不影响计划创建，但记录警告
            }
          } catch (planError) {
            logger.error(`  ❌ 生产计划创建失败(物料: ${material_name}): `, planError.message);
          }
        }

        logger.info(`✅ 共创建 ${internalMaterials.length} 个生产计划`);
      } catch (batchError) {
        logger.error('❌ 批量生成生产计划编号失败:', batchError.message);
      }
    }

    // 处理外购物料 - 合并到一个采购申请中
    if (externalMaterials.length > 0) {
      try {
        const reqNo = await generatePurchaseRequisitionNo(connection);

        // 计算预计需求日期
        const requiredDate = new Date();
        requiredDate.setDate(requiredDate.getDate() + 3); // 假设3天后需要

        // 创建采购申请主记录（添加合同编码字段）
        const insertReqQuery = `
          INSERT INTO purchase_requisitions
    (requisition_number, request_date, requester, contract_code, real_name, remarks, status, created_at)
  VALUES(?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        logger.info('📝 创建采购申请，包含', externalMaterials.length, '个外购物料');

        // 构建备注内容（简化版，因为合同编码已独立）
        const requisitionRemark = `由销售订单${salesOrderNo} 自动生成`;

        // 使用当前用户信息，并从数据库查询真实姓名
        const requester = userInfo.username || 'system';
        let realName = userInfo.real_name || '系统';

        // 如果userInfo中没有real_name，尝试从数据库查询
        if (!userInfo.real_name && userInfo.username && userInfo.username !== 'system') {
          try {
            const [userRows] = await connection.execute(
              'SELECT real_name FROM users WHERE username = ?',
              [userInfo.username]
            );
            if (userRows.length > 0 && userRows[0].real_name) {
              realName = userRows[0].real_name;
              logger.info(`✅ 从数据库查询到用户真实姓名: ${realName} `);
            }
          } catch (err) {
            logger.error('查询用户真实姓名失败:', err);
          }
        }

        logger.info(
          `📝 采购申请人信息 - 用户名: ${requester}, 姓名: ${realName}, 合同编码: ${contractCode || '无'} `
        );

        const [reqResult] = await connection.execute(insertReqQuery, [
          reqNo,
          requiredDate.toISOString().split('T')[0],
          requester,
          contractCode || null, // 合同编码单独保存
          realName,
          requisitionRemark,
          'draft',
        ]);

        const requisitionId = reqResult.insertId;

        // 批量创建采购申请明细
        for (const item of externalMaterials) {
          const { material_id, material_name, material_code, shortage } = item;

          const insertItemQuery = `
            INSERT INTO purchase_requisition_items
    (requisition_id, material_id, material_code, material_name, quantity, created_at)
  VALUES(?, ?, ?, ?, ?, NOW())
          `;

          await connection.execute(insertItemQuery, [
            requisitionId,
            material_id,
            material_code || '',
            material_name || '',
            shortage,
          ]);

          logger.info(`  ✅ 添加物料: ${material_name} (数量: ${shortage})`);
        }

        logger.info(`✅ 采购申请创建成功: ${reqNo} (包含${externalMaterials.length}个物料)`);
      } catch (reqError) {
        logger.error('❌ 采购申请创建失败:', reqError.message);
      }
    }

    logger.info(`✅ 销售订单 ${salesOrderId} 的生产计划和采购申请生成完成`);
  } catch (error) {
    logger.error('生成生产计划和采购申请失败:', error);
    throw error;
  }
}

/**
 * 获取订单的未完全发货物料明细
 * @description 用于创建出库单时，只显示未发货或部分发货的物料
 */
exports.getOrderUnshippedItems = async (req, res) => {
  let connection;

  try {
    const { id } = req.params; // 订单ID

    connection = await getConnection();

    // 查询订单基本信息
    const [orderResults] = await connection.query(
      `
      SELECT so.*, c.name as customer_name, c.contact_person, c.contact_phone
      FROM sales_orders so
      LEFT JOIN customers c ON so.customer_id = c.id
      WHERE so.id = ? OR so.order_no = ?
    `,
      [id, id]
    );

    if (orderResults.length === 0) {
      return ResponseHandler.error(res, '订单不存在', 'NOT_FOUND', 404);
    }

    const order = orderResults[0];

    // 首先获取订单的所有物料项
    const [orderItems] = await connection.query(
      `
      SELECT
  soi.id as order_item_id,
    soi.material_id,
    soi.quantity as ordered_quantity,
    soi.unit_price,
    soi.amount,
    m.code as material_code,
    m.name as material_name,
    m.specs as specification,
    m.unit_id,
    u.name as unit_name
      FROM sales_order_items soi
      LEFT JOIN materials m ON soi.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      WHERE soi.order_id = ?
    ORDER BY m.code
      `,
      [order.id]
    );

    // 然后获取已发货数量（支持单订单和多订单出库）
    const [shippedItems] = await connection.query(
      `
  SELECT
  soi.material_id,
    SUM(sobi.quantity) as shipped_quantity
      FROM sales_order_items soi
      INNER JOIN sales_outbound_items sobi ON soi.material_id = sobi.product_id
      INNER JOIN sales_outbound sob ON sobi.outbound_id = sob.id
      WHERE soi.order_id = ?
    AND sob.status IN('completed', 'processing')
  AND(
    --单订单出库：直接匹配order_id
          sob.order_id = soi.order_id
          OR
          --多订单出库：检查related_orders字段
    (sob.is_multi_order = 1 AND sob.related_orders IS NOT NULL
           AND(
      JSON_CONTAINS(sob.related_orders, CAST(soi.order_id AS JSON))
             OR sob.related_orders LIKE CONCAT('%', soi.order_id, '%')
    ))
  )
      GROUP BY soi.material_id
    `,
      [order.id]
    );

    // 创建已发货数量映射
    const shippedMap = {};
    shippedItems.forEach((item) => {
      shippedMap[item.material_id] = parseFloat(item.shipped_quantity) || 0;
    });

    // 筛选出未完全发货的物料
    const unshippedItems = orderItems
      .map((item) => {
        const orderedQty = parseFloat(item.ordered_quantity) || 0;
        const shippedQty = shippedMap[item.material_id] || 0;
        const remainingQty = orderedQty - shippedQty;

        let shippingStatus = 'unshipped';
        if (shippedQty === 0) {
          shippingStatus = 'unshipped';
        } else if (shippedQty >= orderedQty) {
          shippingStatus = 'fully_shipped';
        } else {
          shippingStatus = 'partial_shipped';
        }

        return {
          id: item.order_item_id,
          material_id: item.material_id,
          material_code: item.material_code,
          material_name: item.material_name,
          specification: item.specification,
          unit_id: item.unit_id,
          unit_name: item.unit_name,
          ordered_quantity: orderedQty,
          shipped_quantity: shippedQty,
          remaining_quantity: remainingQty,
          quantity: remainingQty, // 默认出库数量为剩余数量
          unit_price: parseFloat(item.unit_price) || 0,
          amount: parseFloat(item.amount) || 0,
          shipping_status: shippingStatus,
        };
      })
      .filter((item) => item.shipping_status !== 'fully_shipped'); // 只返回未完全发货的物料

    // 组合结果
    const result = {
      ...order,
      items: unshippedItems,
      total_items: unshippedItems.length,
      unshipped_items_count: unshippedItems.filter((item) => item.shipping_status === 'unshipped')
        .length,
      partial_shipped_items_count: unshippedItems.filter(
        (item) => item.shipping_status === 'partial_shipped'
      ).length,
    };

    ResponseHandler.success(res, result, '操作成功');
  } catch (error) {
    logger.error('获取订单未发货物料失败:', error);
    ResponseHandler.error(res, '获取订单未发货物料失败', 'SERVER_ERROR', 500, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// 获取客户所有订单的产品明细
exports.getCustomerOrderProducts = async (req, res) => {
  let connection;
  try {
    const { customerId } = req.params;
    const { search } = req.query; // 获取搜索参数

    if (!customerId) {
      return ResponseHandler.error(res, '客户ID不能为空', 'BAD_REQUEST', 400);
    }

    connection = await db.pool.getConnection();

    // 构建搜索条件
    let searchCondition = '';
    const queryParams = [customerId];

    if (search && search.trim()) {
      // 支持合同编码、产品编码、产品规格搜索
      searchCondition = ` AND(
    so.contract_code LIKE ? OR 
        m.code LIKE ? OR 
        m.name LIKE ? OR 
        m.specs LIKE ?
      )`;
      const searchTerm = `%${search.trim()}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // 获取客户所有订单的产品明细，包含每个订单的详细信息
    const [rawProducts] = await connection.query(
      `
  SELECT
  so.id as order_id,
    so.order_no,
    so.contract_code,
    soi.material_id,
    m.code as material_code,
    m.name as material_name,
    m.specs as specification,
    u.name as unit_name,
    m.unit_id,
    soi.quantity as ordered_quantity,
    soi.unit_price,
    soi.amount,
    COALESCE(shipped.shipped_quantity, 0) as shipped_quantity,
    (soi.quantity - COALESCE(shipped.shipped_quantity, 0)) as remaining_quantity,
    COALESCE(stock.total_stock, 0) as stock_quantity,
    CASE 
          WHEN COALESCE(shipped.shipped_quantity, 0) = 0 THEN 'unshipped'
          WHEN COALESCE(shipped.shipped_quantity, 0) >= soi.quantity THEN 'fully_shipped'
          ELSE 'partial_shipped'
  END as shipping_status
      FROM sales_orders so
      INNER JOIN sales_order_items soi ON so.id = soi.order_id
      LEFT JOIN materials m ON soi.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      LEFT JOIN(
    SELECT 
          soi2.material_id,
    soi2.order_id,
    SUM(sobi.quantity) as shipped_quantity
        FROM sales_order_items soi2
        INNER JOIN sales_outbound_items sobi ON soi2.material_id = sobi.product_id
        INNER JOIN sales_outbound sob ON sobi.outbound_id = sob.id
        WHERE sob.status IN('completed', 'processing')
          AND(
      --单订单出库：直接匹配order_id
            sob.order_id = soi2.order_id
            OR
            --多订单出库：检查related_orders字段
      (sob.is_multi_order = 1 AND sob.related_orders IS NOT NULL
             AND(
        JSON_CONTAINS(sob.related_orders, CAST(soi2.order_id AS JSON))
               OR sob.related_orders LIKE CONCAT('%', soi2.order_id, '%')
      ))
    )
        GROUP BY soi2.material_id, soi2.order_id
  ) shipped ON soi.material_id = shipped.material_id AND soi.order_id = shipped.order_id
      LEFT JOIN(
    SELECT \n          material_id,\n    SUM(total_by_location) as total_stock\n        FROM(\n      SELECT \n            il.material_id,\n      il.location_id,\n      SUM(il.quantity) as total_by_location\n          FROM inventory_ledger il\n          JOIN materials mat ON il.material_id = mat.id\n          WHERE mat.location_id IS NULL OR il.location_id = mat.location_id\n          GROUP BY il.material_id, il.location_id\n          HAVING SUM(il.quantity) > 0\n    ) location_stock\n        GROUP BY material_id
  ) stock ON soi.material_id = stock.material_id
      WHERE so.customer_id = ?
    AND so.status IN('confirmed', 'in_production', 'ready_to_ship', 'partial_shipped')
  AND(soi.quantity - COALESCE(shipped.shipped_quantity, 0)) > 0
        ${searchCondition}
      ORDER BY material_code, so.order_no
    `,
      queryParams
    );

    // 按物料合并，但保留每个订单的详细信息
    const materialMap = new Map();

    rawProducts.forEach((item) => {
      const key = item.material_id;
      if (!materialMap.has(key)) {
        materialMap.set(key, {
          material_id: item.material_id,
          material_code: item.material_code,
          material_name: item.material_name,
          specification: item.specification,
          unit_name: item.unit_name,
          unit_id: item.unit_id,
          unit_price: item.unit_price,
          stock_quantity: item.stock_quantity,
          total_ordered_quantity: 0,
          total_shipped_quantity: 0,
          total_remaining_quantity: 0,
          orders: [],
          order_ids: [],
          order_nos: [],
          contract_codes: [], // 添加合同编码数组
        });
      }

      const material = materialMap.get(key);
      material.total_ordered_quantity += parseFloat(item.ordered_quantity) || 0;
      material.total_shipped_quantity += parseFloat(item.shipped_quantity) || 0;
      material.total_remaining_quantity += parseFloat(item.remaining_quantity) || 0;

      // 保存每个订单的详细信息
      material.orders.push({
        order_id: item.order_id,
        order_no: item.order_no,
        contract_code: item.contract_code,
        ordered_quantity: item.ordered_quantity,
        shipped_quantity: item.shipped_quantity,
        remaining_quantity: item.remaining_quantity,
        shipping_status: item.shipping_status,
      });

      material.order_ids.push(item.order_id);
      material.order_nos.push(item.order_no);
      if (item.contract_code) {
        material.contract_codes.push(item.contract_code);
      }
    });

    // 转换为数组并格式化
    const products = Array.from(materialMap.values()).map((material) => ({
      material_id: material.material_id,
      material_code: material.material_code,
      material_name: material.material_name,
      specification: material.specification,
      unit_name: material.unit_name,
      unit_id: material.unit_id,
      unit_price: material.unit_price,
      stock_quantity: material.stock_quantity,
      ordered_quantity: material.total_ordered_quantity,
      shipped_quantity: material.total_shipped_quantity,
      remaining_quantity: material.total_remaining_quantity,
      shipping_status:
        material.total_shipped_quantity === 0
          ? 'unshipped'
          : material.total_shipped_quantity >= material.total_ordered_quantity
            ? 'fully_shipped'
            : 'partial_shipped',
      // 保留原有格式的字段
      order_ids: material.order_ids.join(','),
      order_nos: material.order_nos.join(', '),
      contract_codes: material.contract_codes.join(', '), // 添加合同编码字段
      // 新增详细订单信息
      order_details: material.orders,
    }));

    ResponseHandler.success(res, products, '操作成功');
  } catch (error) {
    logger.error('获取客户订单产品失败:', error);
    ResponseHandler.error(res, '获取客户订单产品失败', 'SERVER_ERROR', 500, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/**
 * 获取指定物料的销售出库历史
 * GET /api/sales/outbound/material/:materialId
 */
exports.getMaterialSalesHistory = async (req, res) => {
  let connection;
  try {
    const { materialId } = req.params;
    const { page = 1, pageSize = 10, startDate, endDate, customerId } = req.query;

    // 验证参数
    if (!materialId) {
      return res.status(400).json({
        success: false,
        error: '物料ID不能为空',
      });
    }

    const actualPage = parseInt(page, 10);
    const actualPageSize = parseInt(pageSize, 10);
    const offset = (actualPage - 1) * actualPageSize;

    connection = await getConnection();

    // 构建查询条件
    let whereClause = 'WHERE soi.product_id = ?';
    const queryParams = [materialId];

    if (startDate) {
      whereClause += ' AND so.delivery_date >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND so.delivery_date <= ?';
      queryParams.push(endDate);
    }

    if (customerId) {
      whereClause += ' AND o.customer_id = ?';
      queryParams.push(customerId);
    }

    // 只查询已完成的出库单
    whereClause += ' AND so.status = ?';
    queryParams.push('completed');

    // 查询总数
    const countQuery = `
      SELECT COUNT(DISTINCT so.id) as total
      FROM sales_outbound so
      INNER JOIN sales_outbound_items soi ON so.id = soi.outbound_id
      LEFT JOIN sales_orders o ON so.order_id = o.id
      ${whereClause}
  `;

    const [countResult] = await connection.query(countQuery, queryParams);
    const total = parseInt(countResult[0].total) || 0;

    // 查询销售出库历史数据
    // 注：sales_outbound_items.price/amount 创建出库单时可能未回填，
    // 因此优先取出库明细价格，为0时回退到关联订单明细的价格
    const dataQuery = `
  SELECT
  so.id,
    so.outbound_no,
    DATE_FORMAT(so.delivery_date, '%Y-%m-%d') as outbound_date,
    so.order_id,
    so.is_multi_order,
    so.related_orders,
    so.status,
    so.remarks,
    so.created_at,
    o.order_no,
    o.customer_id,
    c.name as customer_name,
    soi.product_id,
    m.code as product_code,
    m.name as product_name,
    m.specs as specification,
    soi.unit_id,
    u.name as unit,
    soi.quantity,
    COALESCE(NULLIF(soi.price, 0), oi.unit_price, 0) as unit_price,
    COALESCE(NULLIF(soi.amount, 0), oi.amount, soi.quantity * COALESCE(NULLIF(soi.price, 0), oi.unit_price, 0)) as total_amount,
    soi.remarks as item_remarks
      FROM sales_outbound so
      INNER JOIN sales_outbound_items soi ON so.id = soi.outbound_id
      LEFT JOIN sales_orders o ON so.order_id = o.id
      LEFT JOIN sales_order_items oi ON o.id = oi.order_id AND soi.product_id = oi.material_id
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN materials m ON soi.product_id = m.id
      LEFT JOIN units u ON soi.unit_id = u.id
      ${whereClause}
      ORDER BY so.delivery_date DESC, so.created_at DESC
      LIMIT ${actualPageSize} OFFSET ${offset}
  `;

    const [dataResult] = await connection.query(dataQuery, queryParams);

    // 返回结果
    res.json({
      success: true,
      data: {
        list: dataResult,
        total: total,
        page: actualPage,
        pageSize: actualPageSize,
      },
      message: '获取物料销售历史成功',
    });
  } catch (error) {
    logger.error('获取物料销售历史失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: '获取物料销售历史失败',
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
