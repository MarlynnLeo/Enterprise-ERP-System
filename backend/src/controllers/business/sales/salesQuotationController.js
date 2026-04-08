/**
 * salesQuotationController.js
 * @description 销售模块 - 报价单相关控制器
 * @date 2026-01-07
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { getConnection, formatDateToMySQLDate } = require('./salesShared');

/**
 * 获取报价单列表
 */
exports.getSalesQuotations = async (req, res) => {
  try {
    const { search, status, startDate, endDate, page = 1, pageSize = 20 } = req.query;

    // 构建查询条件
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
        `SELECT q.*, c.name as customerName
         FROM sales_quotations q
         LEFT JOIN customers c ON q.customer_id = c.id
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
      conn.release();
    }
  } catch (error) {
    logger.error('Error getting sales quotations:', error);
    ResponseHandler.error(res, 'Error getting sales quotations', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取报价单统计数据
 */
exports.getSalesQuotationStatistics = async (req, res) => {
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
    conn.release();
  }
};

/**
 * 获取单个报价单详情
 */
exports.getSalesQuotation = async (req, res) => {
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
    conn.release();
  }
};

/**
 * 创建报价单
 */
exports.createSalesQuotation = async (req, res) => {
  const conn = await getConnection();

  try {
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
      const currentSequence = parseInt(results[0].max_no.slice(-3));
      sequence = currentSequence + 1;
    }

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

      // ✅ 批量 INSERT 替代逐条插入
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
    await conn.rollback();
    logger.error('Error creating sales quotation:', error);
    ResponseHandler.error(res, 'Error creating sales quotation', 'SERVER_ERROR', 500, error);
  } finally {
    conn.release();
  }
};

/**
 * 更新报价单
 */
exports.updateSalesQuotation = async (req, res) => {
  const conn = await getConnection();

  try {
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

    try {
      // 删除原有明细
      await conn.query('DELETE FROM sales_quotation_items WHERE quotation_id = ?', [id]);

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

        // ✅ 批量 INSERT 替代逐条插入
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
    } catch (error) {
      throw error;
    }

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

/**
 * 删除报价单
 */
exports.deleteSalesQuotation = async (req, res) => {
  const conn = await getConnection();

  try {
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

    await conn.commit();

    res.json({
      message: 'Quotation deleted successfully',
      id,
    });
  } catch (error) {
    await conn.rollback();
    logger.error('Error deleting sales quotation:', error);
    ResponseHandler.error(res, 'Error deleting sales quotation', 'SERVER_ERROR', 500, error);
  } finally {
    conn.release();
  }
};
