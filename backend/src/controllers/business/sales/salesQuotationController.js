/**
 * salesQuotationController.js
 * @description 销售报价控制器
 * @version 1.1.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');


const { softDelete } = require('../../../utils/softDelete');
const { getAuthenticatedUserId } = require('../../../utils/authContext');

const { getConnection, formatDateToMySQLDate } = require('./salesShared');
const { CodeGenerators } = require('../../../utils/codeGenerator');
const { calculateLines } = require('../../../utils/money');
const { parsePagination } = require('../../../utils/safePagination');
const { mapKeysToSnake } = require('../../../utils/fieldMap');
const { SALES_QUOTATION_TRANSITIONS } = require('../../../constants/statusRegistry');
const { validationError, assertSalesLineQuantities, assertActiveSalesMaterials } = require('../../../utils/sales/salesValidation');

function assertQuotationItemPrices(items = []) {
  const invalidRows = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      const rawPrice = item.unit_price ?? item.unitPrice ?? item.price;
      if (rawPrice === null || rawPrice === undefined || rawPrice === '') return true;
      const price = Number(rawPrice);
      return !Number.isFinite(price) || price < 0;
    })
    .map(({ index }) => index + 1);

  if (invalidRows.length > 0) {
    const error = new Error(`第 ${invalidRows.join(', ')} 行销售报价单价缺失或无效，请先维护销售价格`);
    error.statusCode = 400;
    throw error;
  }
}

exports.getSalesQuotations = async (req, res) => {
  try {
    const { search, status, startDate, endDate, page = 1, pageSize = 20 } = req.query;

    // 构建查询条件

    const ScopeGuard = require('../../../authorization/ScopeGuard');
    const scopeClause = await ScopeGuard.applyListScope(req, 'sales_quotation', {
      tableAlias: 'q',
      ownerAlias: 'sales_quotation_owner_scope',
      accessMode: 'read',
    });
    const params = [];
    let whereClause = '';

    if (search) {
      whereClause += ` AND (q.quotation_no LIKE ? OR c.name LIKE ? OR EXISTS (
        SELECT 1 FROM sales_quotation_items qi JOIN materials m ON m.id=qi.product_id
        WHERE qi.quotation_id=q.id AND (m.code LIKE ? OR m.name LIKE ? OR m.specs LIKE ?)
      ))`;
      params.push(...Array(5).fill(`%${search}%`));
    }

    if (status) {
      whereClause += ' AND q.status = ?';
      params.push(status);
    }

    if (startDate && endDate) {
      whereClause += ' AND q.created_at >= ? AND q.created_at < DATE_ADD(?, INTERVAL 1 DAY)';
      params.push(startDate, endDate);
    }

    // 计算分页参数
    // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    const pagination = parsePagination(page, pageSize, {
      defaultPageSize: 20,
      maxPageSize: 100,
    });
    const actualPageSize = pagination.pageSize;
    const offset = pagination.offset;

    // 获取连接
    const conn = await getConnection();

    try {
      // 查询总数
      const [countRows] = await conn.query(
        `SELECT COUNT(*) as total FROM sales_quotations q
         LEFT JOIN customers c ON q.customer_id = c.id
         ${scopeClause.join}
         WHERE q.deleted_at IS NULL ${whereClause}${scopeClause.where}`,
        [...params, ...(scopeClause.params || [])]
      );

      const total = countRows[0].total;

      // 查询分页数据
      const [rows] = await conn.query(
        `SELECT q.*, c.name as customerName,
                COALESCE(u.real_name, u.username) as creator_name
         FROM sales_quotations q
         LEFT JOIN customers c ON q.customer_id = c.id
         LEFT JOIN users u ON q.created_by = u.id
         ${scopeClause.join}
         WHERE q.deleted_at IS NULL ${whereClause}${scopeClause.where}
         ORDER BY q.created_at DESC, q.id DESC
         LIMIT ${actualPageSize} OFFSET ${offset}`,
        [...params, ...(scopeClause.params || [])]
      );

      // 批量查询所有明细（避免N+1查询问题）
      let quotations = rows;
      if (rows.length > 0) {
        const quotationIds = rows.map((q) => q.id);
        const placeholders = quotationIds.map(() => '?').join(',');
        const [allItems] = await conn.query(
          `SELECT id, quotation_id, product_id, quantity, unit_price, discount_percent, tax_percent, total_price FROM sales_quotation_items WHERE quotation_id IN (${placeholders})`,
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

      return ResponseHandler.success(res, {
        items: quotations,
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
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
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const nextFirstDay = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
    const ScopeGuard = require('../../../authorization/ScopeGuard');
    const scopeClause = await ScopeGuard.applyListScope(req, 'sales_quotation', {
      tableAlias: 'q', ownerAlias: 'quotation_stats_owner', accessMode: 'read',
    });

    // 查询当月报价单数量和金额
    const [monthlyData] = await conn.query(
      `SELECT COUNT(*) as count, SUM(q.total_amount) as amount
       FROM sales_quotations q ${scopeClause.join}
       WHERE q.deleted_at IS NULL
         AND q.created_at >= ? AND q.created_at < ? ${scopeClause.where}`,
      [firstDay, nextFirstDay, ...scopeClause.params]
    );

    // 查询转化为订单的报价单数量
    const [convertedData] = await conn.query(
      `SELECT COUNT(*) as count
       FROM sales_quotations q ${scopeClause.join}
       WHERE q.status = 'converted'
         AND q.deleted_at IS NULL
         AND q.created_at >= ? AND q.created_at < ? ${scopeClause.where}`,
      [firstDay, nextFirstDay, ...scopeClause.params]
    );

    // 计算转化率
    const monthlyCount = monthlyData[0].count || 0;
    const convertedCount = convertedData[0].count || 0;
    const conversionRate = monthlyCount > 0 ? convertedCount / monthlyCount : 0;
    const [statusCounts] = await conn.query(
      `SELECT q.status, COUNT(*) AS count FROM sales_quotations q ${scopeClause.join}
       WHERE q.deleted_at IS NULL ${scopeClause.where} GROUP BY q.status`, scopeClause.params
    );
    const counts = Object.fromEntries(statusCounts.map(row => [row.status, Number(row.count)]));

    return ResponseHandler.success(res, {
      monthly_count: monthlyCount,
      monthly_amount: monthlyData[0].amount || 0,
      conversion_rate: conversionRate,
      statusStats: {
        total: statusCounts.reduce((sum, row) => sum + Number(row.count), 0),
        pending: counts.draft || 0, confirmed: counts.accepted || 0,
        converted: counts.converted || 0, expired: counts.expired || 0,
      },
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
  {
    const { id } = req.params;
    if (id !== null && id !== undefined && id !== '') {
      const ScopeGuard = require('../../../authorization/ScopeGuard');
      if (!(await ScopeGuard.assertAccess(require('../../../config/db').pool, req, 'sales_quotation', id, { accessMode: 'read' }))) {
        return ResponseHandler.forbidden(res, '无权访问该销售报价单');
      }
    }
  }

  // 获取数据库连接
  const conn = await getConnection();

  try {
    // 查询报价单主表
    const [quotationRows] = await conn.query(
      `SELECT q.*, c.name as customer_name
       FROM sales_quotations q
       LEFT JOIN customers c ON q.customer_id = c.id
       WHERE q.id = ? AND q.deleted_at IS NULL`,
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

    return ResponseHandler.success(res, quotation);
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

    const { quotation = {}, items } = mapKeysToSnake(req.body || {});
    const quotationItems = Array.isArray(items) ? items : [];
    assertSalesLineQuantities(quotationItems);
    await assertActiveSalesMaterials(conn, quotationItems);
    if (!quotation.customer_id) throw validationError('请选择客户');
    if (quotation.status && !['draft', 'sent', 'accepted', '待确认'].includes(quotation.status)) throw validationError('新报价单状态无效');
    assertQuotationItemPrices(quotationItems);
    const quotationAmounts = calculateLines(quotationItems, {
      defaultTaxRate: quotation?.tax_rate ?? quotation?.taxRate ?? 0,
    });

    // ✅ 使用统一编码规则引擎生成报价单号
    const quotationNo = await CodeGenerators.generateSalesQuotationCode(conn);

    // 插入报价单主表
    const [result] = await conn.query(
      `INSERT INTO sales_quotations
       (quotation_no, customer_id, total_amount, validity_date, status, remarks, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        quotationNo,
        quotation.customer_id,
        quotationAmounts.totalAmount,
        formatDateToMySQLDate(quotation.validity_date) ||
        formatDateToMySQLDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
        quotation.status === '待确认' ? 'draft' : quotation.status || 'draft',
        quotation.remarks || '',
        getAuthenticatedUserId(req),
      ]
    );

    const quotationId = result.insertId;

    // ✅ 批量校验产品存在性
    if (quotationItems.length > 0) {
      const productIds = quotationItems.map(i => i.product_id).filter(Boolean);
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
      const valuesPlaceholders = quotationAmounts.items.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
      const values = [];
      for (const item of quotationAmounts.items) {
        values.push(
          quotationId,
          item.product_id || null,
          item.quantity,
          item.unit_price,
          item.tax_percent,
          item.total_price
        );
      }
      await conn.query(
        `INSERT INTO sales_quotation_items
         (quotation_id, product_id, quantity, unit_price, tax_percent, total_price)
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
    ResponseHandler.error(res, error.message || 'Error creating sales quotation', 'SERVER_ERROR', error.statusCode || 500, error);
  } finally {
    // 释放连接
    conn.release();
  }
};


exports.updateSalesQuotation = async (req, res) => {
  {
    const { id } = req.params;
    if (id !== null && id !== undefined && id !== '') {
      const ScopeGuard = require('../../../authorization/ScopeGuard');
      if (!(await ScopeGuard.assertAccess(require('../../../config/db').pool, req, 'sales_quotation', id))) {
        return ResponseHandler.forbidden(res, '无权修改该销售报价单');
      }
    }
  }

  // 获取数据库连接
  const conn = await getConnection();

  try {
    // 开始事务
    await conn.beginTransaction();

    const { id } = req.params;
    const { quotation = {}, items } = mapKeysToSnake(req.body || {});
    const quotationItems = Array.isArray(items) ? items : [];
    assertSalesLineQuantities(quotationItems);
    await assertActiveSalesMaterials(conn, quotationItems);
    assertQuotationItemPrices(quotationItems);
    const quotationAmounts = calculateLines(quotationItems, {
      defaultTaxRate: quotation?.tax_rate ?? quotation?.taxRate ?? 0,
    });

    const [existingRows] = await conn.query(
      'SELECT id, status FROM sales_quotations WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );

    if (existingRows.length === 0) {
      await conn.rollback();
      return ResponseHandler.error(res, 'Quotation not found', 'NOT_FOUND', 404);
    }

    const currentStatus = existingRows[0].status;
    const nextStatus = quotation.status === '待确认' ? 'draft' : (quotation.status || currentStatus);
    if (['converted','rejected','expired','cancelled'].includes(currentStatus)) throw validationError('已转换或已关闭的报价单不能修改');
    if (nextStatus === 'converted' || (nextStatus !== currentStatus && !SALES_QUOTATION_TRANSITIONS[currentStatus]?.includes(nextStatus))) {
      throw validationError('报价状态转换无效，转订单请使用专用转换操作');
    }
    quotation.status = nextStatus;

    // 更新报价单主表
    await conn.query(
      `UPDATE sales_quotations
       SET customer_id = ?,
           total_amount = ?,
           validity_date = ?,
           status = ?,
           remarks = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        quotation.customer_id,
        quotationAmounts.totalAmount,
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
    if (quotationItems.length > 0) {
      const productIds = quotationItems.map(i => i.product_id).filter(Boolean);
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

      const valuesPlaceholders = quotationAmounts.items.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
      const values = [];
      for (const item of quotationAmounts.items) {
        values.push(
          id,
          item.product_id || null,
          item.quantity,
          item.unit_price,
          item.tax_percent,
          item.total_price
        );
      }
      await conn.query(
        `INSERT INTO sales_quotation_items
         (quotation_id, product_id, quantity, unit_price, tax_percent, total_price)
         VALUES ${valuesPlaceholders}`,
        values
      );
    }

    // 提交事务
    await conn.commit();

    return ResponseHandler.success(res, {
      id,
      message: 'Quotation updated successfully',
    });
  } catch (error) {
    if (conn) {
      await conn.rollback();
    }
    logger.error('Error updating sales quotation:', error);
    ResponseHandler.error(res, error.message || 'Error updating sales quotation', 'SERVER_ERROR', error.statusCode || 500, error);
  } finally {
    if (conn) {
      conn.release();
    }
  }
};

// 添加删除报价单功能

exports.deleteSalesQuotation = async (req, res) => {
  {
    const { id } = req.params;
    if (id !== null && id !== undefined && id !== '') {
      const ScopeGuard = require('../../../authorization/ScopeGuard');
      if (!(await ScopeGuard.assertAccess(require('../../../config/db').pool, req, 'sales_quotation', id))) {
        return ResponseHandler.forbidden(res, '无权删除该销售报价单');
      }
    }
  }

  // 获取数据库连接
  const conn = await getConnection();

  try {
    // 开始事务
    await conn.beginTransaction();

    const { id } = req.params;

    // 检查报价单状态
    const [statusRows] = await conn.query(
      'SELECT status FROM sales_quotations WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );

    if (statusRows.length === 0) {
      await conn.rollback();
      return ResponseHandler.error(res, 'Quotation not found', 'NOT_FOUND', 404);
    }

    // 只允许删除"待确认"状态的报价单
    if (statusRows[0].status !== 'draft') {
      await conn.rollback();
      return ResponseHandler.error(res, '只能删除待确认状态的报价单', 'VALIDATION_ERROR', 400);
    }

    // 删除报价单明细
    await conn.query('DELETE FROM sales_quotation_items WHERE quotation_id = ?', [id]);

    // ✅ 软删除报价单主表
    await softDelete(conn, 'sales_quotations', 'id', id);

    // 提交事务
    await conn.commit();

    return ResponseHandler.success(res, {
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
  {
    const { id } = req.params;
    if (id !== null && id !== undefined && id !== '') {
      const ScopeGuard = require('../../../authorization/ScopeGuard');
      if (!(await ScopeGuard.assertAccess(require('../../../config/db').pool, req, 'sales_quotation', id))) {
        return ResponseHandler.forbidden(res, '无权转换该销售报价单');
      }
    }
  }

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
       WHERE q.id = ? AND q.deleted_at IS NULL
       FOR UPDATE`,
      [id]
    );

    if (quotationRows.length === 0) {
      await conn.rollback();
      return ResponseHandler.error(res, 'Quotation not found', 'NOT_FOUND', 404);
    }

    const quotation = quotationRows[0];

    const [[existingOrder]] = await conn.query('SELECT id, order_no FROM sales_orders WHERE quotation_id = ? ORDER BY id LIMIT 1 FOR UPDATE', [id]);
    if (existingOrder) {
      await conn.commit();
      return ResponseHandler.success(res, { quotationId: Number(id), orderId: existingOrder.id, orderNo: existingOrder.order_no }, '该报价单已转换为订单');
    }

    // 只允许转换"已确认"状态的报价单
    if (quotation.status !== 'accepted') {
      await conn.rollback();
      return ResponseHandler.error(res, '只能转换已确认状态的报价单为订单', 'VALIDATION_ERROR', 400);
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
      return ResponseHandler.error(res, '报价单没有明细项目，无法转换为订单', 'VALIDATION_ERROR', 400);
    }

    assertSalesLineQuantities(itemRows);
    await assertActiveSalesMaterials(conn, itemRows);

    // ✅ 使用统一编码规则引擎生成销售订单号
    const orderAmounts = calculateLines(itemRows.map((item) => ({
      material_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tax_percent: item.tax_percent,
    })), { defaultTaxRate: 0 });

    const orderNo = await CodeGenerators.generateSalesOrderCode(conn);

    // 创建销售订单主表数据
    const orderData = {
      order_no: orderNo,
      customer_id: quotation.customer_id,
      quotation_id: quotation.id,
      delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 默认7天后交货
      total_amount: orderAmounts.totalAmount,
      subtotal: orderAmounts.subtotal,
      tax_amount: orderAmounts.taxAmount,
      tax_rate: orderAmounts.taxRate,
      status: 'draft',
      remarks: `由报价单 ${quotation.quotation_no} 转换生成`,
      created_by: getAuthenticatedUserId(req),
    };

    // 插入销售订单主表
    const [orderResult] = await conn.query(
      `INSERT INTO sales_orders (
        order_no, customer_id, quotation_id, delivery_date,
        total_amount, tax_rate, tax_amount, subtotal,
        status, remarks, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderData.order_no,
        orderData.customer_id,
        orderData.quotation_id,
        orderData.delivery_date,
        orderData.total_amount,
        orderData.tax_rate,
        orderData.tax_amount,
        orderData.subtotal,
        orderData.status,
        orderData.remarks,
        orderData.created_by,
      ]
    );

    const orderId = orderResult.insertId;

    // 插入销售订单明细
    for (const item of orderAmounts.items) {
      await conn.query(
        `INSERT INTO sales_order_items (
          order_id, material_id, quantity, unit_price, amount, tax_percent
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, item.material_id, item.quantity, item.unit_price, item.amount, item.tax_percent]
      );
    }

    // 更新报价单状态为"已转订单"
    // ✅ 安全修复：添加前置状态条件，防止 TOCTOU 竞态导致已关闭的报价单被重复转订单
    await conn.query(
      'UPDATE sales_quotations SET status = ? WHERE id = ? AND status = ? AND deleted_at IS NULL',
      ['converted', id, 'accepted']
    );

    // 提交事务
    await conn.commit();

    // 与手工销售订单使用同一备货、预留和后续计划流程。
    try {
      const { autoGenerateFollowUpDocuments } = require('./salesExchangeController');
      const SalesDao = require('../../../database/salesDao');
      const nextStatus = await autoGenerateFollowUpDocuments(orderId, orderAmounts.items, { ...req.user, id: getAuthenticatedUserId(req) });
      if (nextStatus) await SalesDao.updateSalesOrderStatus(orderId, nextStatus);
    } catch (error) {
      logger.error('报价转换后的订单备货失败，订单保留草稿供重试:', error);
    }

    return ResponseHandler.success(res, {
      message: 'Quotation converted to order successfully',
      quotation_id: id,
      order_id: orderId,
      order_no: orderData.order_no,
    });
  } catch (error) {
    await conn.rollback();
    logger.error('Error converting quotation to order:', error);
    ResponseHandler.error(res, error.message || '报价单转换失败', error.code || 'SERVER_ERROR', error.statusCode || 500, error);
  } finally {
    conn.release();
  }
};

// 获取销售订单操作人列表
