/**
 * 换货单管理控制器
 * @description 处理换货单的CRUD操作、收货确认、状态更新等
 */

const { logger } = require('../../../utils/logger');
const { ResponseHandler } = require('../../../utils/responseHandler');
const db = require('../../../config/db');
const pool = db.pool;
const businessConfig = require('../../../config/businessConfig');
const { parsePagination, appendPaginationSQL } = require('../../../utils/safePagination');
const QualityIntegrationService = require('../../../services/business/QualityIntegrationService');

// 从统一配置获取状态常量
const STATUS = {
  REPLACEMENT: businessConfig.status.replacement,
};

/**
 * 获取换货单列表
 */
const getReplacementOrders = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      replacementNo,
      ncpNo,
      supplierName,
      materialCode,
      status,
      startDate,
      endDate,
    } = req.query;

    const pagination = parsePagination(page, pageSize, {
      defaultPageSize: 10,
      maxPageSize: 200,
    });

    const whereConditions = [];
    const queryParams = [];

    if (replacementNo) {
      whereConditions.push('ro.replacement_no LIKE ?');
      queryParams.push(`%${replacementNo}%`);
    }

    if (ncpNo) {
      whereConditions.push('ro.ncp_no LIKE ?');
      queryParams.push(`%${ncpNo}%`);
    }

    if (supplierName) {
      whereConditions.push('ro.supplier_name LIKE ?');
      queryParams.push(`%${supplierName}%`);
    }

    if (materialCode) {
      whereConditions.push('ro.material_code LIKE ?');
      queryParams.push(`%${materialCode}%`);
    }

    if (status) {
      whereConditions.push('ro.status = ?');
      queryParams.push(status);
    }

    if (startDate) {
      whereConditions.push('ro.created_at >= ?');
      queryParams.push(startDate);
    }

    if (endDate) {
      whereConditions.push('ro.created_at <= ?');
      queryParams.push(`${endDate} 23:59:59`);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    // 查询总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM replacement_orders ro
      ${whereClause}
    `;
    const [countResult] = await pool.query(countQuery, queryParams);
    const total = countResult[0].total;

    // 查询列表数据
    const dataQuery = appendPaginationSQL(`
      SELECT
        ro.*,
        ncp.inspection_no,
        ncp.defect_description
      FROM replacement_orders ro
      LEFT JOIN nonconforming_products ncp ON ro.ncp_id = ncp.id
      ${whereClause}
      ORDER BY ro.created_at DESC
    `, pagination.limit, pagination.offset);
    const [rows] = await pool.query(dataQuery, queryParams);

    return ResponseHandler.success(res, {
      data: rows,
      pagination: {
        total,
        current: pagination.page,
        pageSize: pagination.pageSize,
      },
    }, '获取换货单列表成功');
  } catch (error) {
    logger.error('获取换货单列表失败:', error);
    return ResponseHandler.error(res, '获取换货单列表失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * 获取换货单详情
 */
const getReplacementOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        ro.*,
        ncp.inspection_no,
        ncp.inspection_id,
        ncp.defect_description,
        ncp.quantity as defect_quantity,
        pr.status as return_status
      FROM replacement_orders ro
      LEFT JOIN nonconforming_products ncp ON ro.ncp_id = ncp.id
      LEFT JOIN purchase_returns pr ON ro.return_no = pr.return_no
      WHERE ro.id = ?
    `;

    const [rows] = await pool.query(query, [id]);

    if (rows.length === 0) {
      return ResponseHandler.error(res, '换货单不存在', 'NOT_FOUND', 404);
    }

    return ResponseHandler.success(res, rows[0], '获取换货单详情成功');
  } catch (error) {
    logger.error('获取换货单详情失败:', error);
    return ResponseHandler.error(res, '获取换货单详情失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * 更新换货单
 */
const updateReplacementOrder = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { expected_date, note } = req.body;

    // 检查换货单是否存在
    const [checkResult] = await connection.query(
      'SELECT status FROM replacement_orders WHERE id = ?',
      [id]
    );

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '换货单不存在', 'NOT_FOUND', 404);
    }

    if (
      checkResult[0].status === STATUS.REPLACEMENT.COMPLETED ||
      checkResult[0].status === STATUS.REPLACEMENT.CANCELLED
    ) {
      await connection.rollback();
      return ResponseHandler.error(res, '已完成或已取消的换货单不能修改', 'VALIDATION_ERROR', 400);
    }

    // 更新换货单
    await connection.query(
      `UPDATE replacement_orders
       SET expected_date = ?, note = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [expected_date, note, id]
    );

    await connection.commit();
    return ResponseHandler.success(res, null, '换货单更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新换货单失败:', error);
    return ResponseHandler.error(res, '更新换货单失败', 'OPERATION_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 换货收货确认
 */
const confirmReceipt = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { received_quantity, actual_date, note } = req.body;

    const receiveQty = parseFloat(received_quantity);
    if (!Number.isFinite(receiveQty) || receiveQty <= 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '收货数量必须大于0', 'VALIDATION_ERROR', 400);
    }

    // 获取换货单信息
    const [orders] = await connection.query('SELECT * FROM replacement_orders WHERE id = ? FOR UPDATE', [id]);

    if (orders.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '换货单不存在', 'NOT_FOUND', 404);
    }

    const order = orders[0];

    if (
      order.status === STATUS.REPLACEMENT.COMPLETED ||
      order.status === STATUS.REPLACEMENT.CANCELLED
    ) {
      await connection.rollback();
      return ResponseHandler.error(res, '该换货单已完成或已取消', 'VALIDATION_ERROR', 400);
    }

    // 计算新的已收货数量
    const newReceivedQty = parseFloat(order.received_quantity || 0) + receiveQty;
    const totalQty = parseFloat(order.quantity);

    if (newReceivedQty > totalQty) {
      await connection.rollback();
      return ResponseHandler.error(res, '收货数量超过换货数量', 'VALIDATION_ERROR', 400);
    }

    // 确定新状态
    let newStatus = 'partial';
    if (newReceivedQty >= totalQty) {
      newStatus = 'completed';
    }

    const receipt = await QualityIntegrationService.createReplacementReceipt(
      {
        replacementOrder: order,
        receivedQuantity: receiveQty,
        actualDate: actual_date,
        note,
        user: req.user,
      },
      connection
    );

    // 更新换货单
    await connection.query(
      `UPDATE replacement_orders
       SET received_quantity = ?, actual_date = ?, status = ?, note = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newReceivedQty, actual_date || new Date().toISOString().slice(0, 10), newStatus, note, id]
    );

    await connection.commit();
    QualityIntegrationService.emitPurchaseReceiptCompleted(receipt.receipt_id, req.user?.id);
    return ResponseHandler.success(res, {
      received_quantity: newReceivedQty,
      status: newStatus,
      receipt,
    }, '收货确认成功');
  } catch (error) {
    await connection.rollback();
    logger.error('换货收货确认失败:', error);
    return ResponseHandler.error(res, '换货收货确认失败', 'OPERATION_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新换货单状态
 */
const updateStatus = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { status, note } = req.body;

    const validStatuses = ['pending', 'partial', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      await connection.rollback();
      return ResponseHandler.error(res, '无效的状态值', 'VALIDATION_ERROR', 400);
    }

    const [existing] = await connection.query('SELECT * FROM replacement_orders WHERE id = ?', [id]);
    if (existing.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '换货单不存在', 'NOT_FOUND', 404);
    }

    const order = existing[0];
    const receivedQty = parseFloat(order.received_quantity || 0);
    if (order.status === STATUS.REPLACEMENT.COMPLETED) {
      await connection.rollback();
      return ResponseHandler.error(res, '已完成的换货单不能变更状态', 'VALIDATION_ERROR', 400);
    }
    if (['partial', 'completed'].includes(status)) {
      await connection.rollback();
      return ResponseHandler.error(res, '部分收货和完成状态必须通过收货确认流程产生', 'VALIDATION_ERROR', 400);
    }
    if (['pending', 'cancelled'].includes(status) && receivedQty > 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '已有收货记录的换货单不能退回待收货或取消', 'VALIDATION_ERROR', 400);
    }

    await connection.query(
      `UPDATE replacement_orders
       SET status = ?, note = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, note, id]
    );

    await connection.commit();
    return ResponseHandler.success(res, null, '状态更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新换货单状态失败:', error);
    return ResponseHandler.error(res, '更新换货单状态失败', 'OPERATION_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 获取换货单统计数据
 */
const getStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let dateCondition = '';
    let queryParams = [];

    if (startDate && endDate) {
      dateCondition = 'WHERE created_at BETWEEN ? AND ?';
      queryParams = [startDate, `${endDate} 23:59:59`];
    }

    const query = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) as partial,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(quantity) as total_quantity,
        SUM(received_quantity) as total_received
      FROM replacement_orders
      ${dateCondition}
    `;

    const [rows] = await pool.query(query, queryParams);
    return ResponseHandler.success(res, rows[0], '获取换货单统计数据成功');
  } catch (error) {
    logger.error('获取换货单统计数据失败:', error);
    return ResponseHandler.error(res, '获取统计数据失败', 'OPERATION_ERROR', 500, error);
  }
};

module.exports = {
  getReplacementOrders,
  getReplacementOrderById,
  updateReplacementOrder,
  confirmReceipt,
  updateStatus,
  getStatistics,
};
