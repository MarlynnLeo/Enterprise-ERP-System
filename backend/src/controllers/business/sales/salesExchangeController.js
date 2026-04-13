/**
 * salesController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const db = require('../../../config/db');
const InventoryReservationService = require('../../../services/InventoryReservationService');
const { CodeGenerators } = require('../../../utils/codeGenerator');
const DBManager = require('../../../utils/dbManager');
const businessConfig = require('../../../config/businessConfig');
const { getCurrentUserName } = require('../../../utils/userHelper');

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
// 注意: 改名为 connectionPool 避免与函数内局部变量 connection 产生遮蔽
const connectionPool = db.pool;

// 统一的连接管理函数
const getConnection = async () => {
  return await connectionPool.getConnection();
};

// 带事务的连接管理函数
const getConnectionWithTransaction = async () => {
  const conn = await connectionPool.getConnection();
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

    const created_by = await getCurrentUserName(req);

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
      // 静默忽略该错误
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
      const operator = await getCurrentUserName(req);
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

