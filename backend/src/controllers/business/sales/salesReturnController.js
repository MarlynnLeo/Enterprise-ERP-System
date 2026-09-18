/**
 * salesReturnController.js
 * @description 销售退货控制器
 * @version 1.1.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { mapKeysToSnake } = require('../../../utils/fieldMap');
const { lockSalesOrders } = require('../../../utils/sales/salesOrderLocks');
const { logger } = require('../../../utils/logger');
const { softDelete } = require('../../../utils/softDelete');
const { getAuthenticatedUserId } = require('../../../utils/authContext');
const DomainEventService = require('../../../services/business/DomainEventService');
const { parsePagination, appendPaginationSQL } = require('../../../utils/safePagination');

const { STATUS, getConnection } = require('./salesShared');
const { getRequestActorLabel } = require('../../../utils/userUtils');
const {
  salesReturnMap,
  salesReturnItemMap,
} = require('../../../utils/sales/salesFieldMap');

const SALES_RETURN_STATUS_LABELS = {
  [STATUS.SALES_RETURN.DRAFT]: '草稿',
  [STATUS.SALES_RETURN.PENDING]: '待审批',
  [STATUS.SALES_RETURN.APPROVED]: '已批准',
  [STATUS.SALES_RETURN.COMPLETED]: '已完成',
  [STATUS.SALES_RETURN.REJECTED]: '已驳回',
  [STATUS.SALES_RETURN.CANCELLED]: '已取消',
};

const SALES_RETURN_STATUS_TRANSITIONS = {
  [STATUS.SALES_RETURN.DRAFT]: [STATUS.SALES_RETURN.PENDING, STATUS.SALES_RETURN.CANCELLED],
  [STATUS.SALES_RETURN.PENDING]: [
    STATUS.SALES_RETURN.APPROVED,
    STATUS.SALES_RETURN.REJECTED,
    STATUS.SALES_RETURN.CANCELLED,
  ],
  [STATUS.SALES_RETURN.APPROVED]: [STATUS.SALES_RETURN.COMPLETED, STATUS.SALES_RETURN.CANCELLED],
  [STATUS.SALES_RETURN.COMPLETED]: [],
  [STATUS.SALES_RETURN.REJECTED]: [],
  [STATUS.SALES_RETURN.CANCELLED]: [],
};

const isValidSalesReturnStatus = (status) => Object.values(STATUS.SALES_RETURN).includes(status);

const canTransitionSalesReturnStatus = (currentStatus, nextStatus) => {
  return (SALES_RETURN_STATUS_TRANSITIONS[currentStatus] || []).includes(nextStatus);
};

const SalesReturnEligibilityService = require('../../../services/business/SalesReturnEligibilityService');
const SalesReturnValuationService = require('../../../services/business/SalesReturnValuationService');
const { normalizeSalesDate } = require('../../../utils/sales/salesValidation');
const { validationError } = SalesReturnEligibilityService;

function normalizeReturnItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw validationError('退货明细不能为空');
  return items.map(item => ({ ...item, product_id: item.product_id ?? item.material_id }));
}

async function saveReturnItems(connection, returnId, items) {
  await connection.query('INSERT INTO sales_return_items (return_id, product_id, quantity, reason) VALUES ?', [
    items.map(item => [returnId, item.product_id, item.quantity, item.reason || '']),
  ]);
}

exports.getSalesReturns = async (req, res) => {
  let conn;
  try {
    const { page = 1, pageSize = 10, search, startDate, endDate, status } = req.query;
    const pagination = parsePagination(page, pageSize, { maxPageSize: 100, defaultPageSize: 10 });

    conn = await getConnection();

    const ScopeGuard = require('../../../authorization/ScopeGuard');
    const scopeClause = await ScopeGuard.applyListScope(req, 'sales_return', {
      tableAlias: 'sr',
      ownerAlias: 'sales_return_owner_scope',
      accessMode: 'read',
    });

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

    whereClause += scopeClause.where;
    queryParams.push(...scopeClause.params);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM sales_returns sr
      LEFT JOIN sales_orders o ON sr.order_id = o.id AND o.deleted_at IS NULL
      LEFT JOIN customers c ON o.customer_id = c.id
      ${scopeClause.join}
      WHERE sr.deleted_at IS NULL ${whereClause}
      `;

    const [countResult] = await conn.query(countQuery, queryParams);
    const total = countResult[0].total;

    const query = appendPaginationSQL(
      `
      SELECT sr.*, c.name AS customer_name, o.order_no
      FROM sales_returns sr
      LEFT JOIN sales_orders o ON sr.order_id = o.id AND o.deleted_at IS NULL
      LEFT JOIN customers c ON o.customer_id = c.id
      ${scopeClause.join}
      WHERE sr.deleted_at IS NULL ${whereClause}
      ORDER BY sr.created_at DESC
      `,
      pagination.limit,
      pagination.offset
    );

    const [results] = await conn.query(query, queryParams);

    // 获取状态明细
    const detailsByReturnId = new Map();
    if (results.length > 0) {
      const returnIds = results.map((item) => item.id);
      const allDetails = await SalesReturnValuationService.getItems(conn, returnIds);

      allDetails.forEach((detail) => {
        if (!detailsByReturnId.has(detail.return_id)) {
          detailsByReturnId.set(detail.return_id, []);
        }
        detailsByReturnId.get(detail.return_id).push(detail);
      });
    }

    results.forEach((returnItem) => {
      const detailsResults = detailsByReturnId.get(returnItem.id) || [];

      returnItem.status_label = SALES_RETURN_STATUS_LABELS[returnItem.status] || returnItem.status;

      returnItem.items = detailsResults;

      // 汇总退货总额
      returnItem.total_amount = SalesReturnValuationService.total(detailsResults);
    });

    // 统计不同状态的数量
    const statusQuery = `
      SELECT status, COUNT(*) as count
      FROM sales_returns
      WHERE deleted_at IS NULL
      GROUP BY status
        `;

    const [statusCounts] = await conn.query(statusQuery);

    // 格式化状态数据
    const statusStats = {
      total: total,
      draftCount: 0,
      pendingCount: 0,
      approvedCount: 0,
      completedCount: 0,
      rejectedCount: 0,
      cancelledCount: 0,
    };

    statusCounts.forEach((item) => {
      if (item.status === STATUS.SALES_RETURN.DRAFT) statusStats.draftCount = item.count;
      if (item.status === STATUS.SALES_RETURN.PENDING) statusStats.pendingCount = item.count;
      if (item.status === STATUS.SALES_RETURN.APPROVED) statusStats.approvedCount = item.count;
      if (item.status === STATUS.SALES_RETURN.COMPLETED) statusStats.completedCount = item.count;
      if (item.status === STATUS.SALES_RETURN.REJECTED) statusStats.rejectedCount = item.count;
      if (item.status === STATUS.SALES_RETURN.CANCELLED) statusStats.cancelledCount = item.count;
    });

    return ResponseHandler.success(res, {
      items: results.map((r) => salesReturnMap.toApi(r)),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      statusStats,
    });
  } catch (error) {
    logger.error('获取销售退货单列表失败:', error);
    ResponseHandler.error(res, '获取销售退货单列表失败', 'SERVER_ERROR', 500);
  } finally {
    if (conn) conn.release();
  }
};


exports.getSalesReturnById = async (req, res) => {
  let conn;
  try {
    const { id } = req.params;

    conn = await getConnection();

    const ScopeGuard = require('../../../authorization/ScopeGuard');
    if (!(await ScopeGuard.denyUnlessAccess(res, conn, req, 'sales_return', id, '无权访问该销售退货单', { accessMode: 'read' }))) {
      return;
    }

    const query = `
      SELECT sr.*, c.name as customer_name, c.contact_person, c.contact_phone, o.order_no
      FROM sales_returns sr
      LEFT JOIN sales_orders o ON sr.order_id = o.id AND o.deleted_at IS NULL
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE sr.id = ? AND sr.deleted_at IS NULL
        `;

    const [returnResults] = await conn.query(query, [id]);

    if (returnResults.length === 0) {
      return ResponseHandler.notFound(res, 'Data not found');
    }

    const returnData = returnResults[0];

    const detailsResults = await SalesReturnValuationService.getItems(conn, [id]);

    returnData.status_label = SALES_RETURN_STATUS_LABELS[returnData.status] || returnData.status;

    returnData.items = detailsResults;
    returnData.total_amount = SalesReturnValuationService.total(detailsResults);

    const api = salesReturnMap.toApi(returnData);
    api.statusLabel = returnData.status_label;
    api.totalAmount = returnData.total_amount;
    if (Array.isArray(detailsResults)) {
      api.items = detailsResults.map((it) => salesReturnItemMap.toApi(it));
    }
    return ResponseHandler.success(res, api);
  } catch (error) {
    logger.error('获取销售退货单详情失败:', error);
    ResponseHandler.error(res, '获取销售退货单详情失败', 'SERVER_ERROR', 500);
  } finally {
    if (conn) conn.release();
  }
};


exports.createSalesReturn = async (req, res) => {
  let connection;
  try {
    const body = mapKeysToSnake(req.body || {});
    const status = body.status || 'pending';
    if (!['draft', 'pending'].includes(status)) throw validationError('新退货单只能保存为草稿或待审批');
    if (!body.return_reason) throw validationError('请填写退货原因');
    body.return_date = normalizeSalesDate(body.return_date, '退货日期');
    const items = normalizeReturnItems(body.items);
    connection = await getConnection();
    await connection.beginTransaction();
    let orderId = body.order_id;
    if (!orderId && body.outbound_id) {
      const [sources] = await connection.query(
        'SELECT DISTINCT COALESCE(i.source_order_id, o.order_id) AS order_id FROM sales_outbound o JOIN sales_outbound_items i ON i.outbound_id = o.id WHERE o.id = ? AND o.deleted_at IS NULL',
        [body.outbound_id]
      );
      if (sources.length !== 1) throw validationError('多订单出库请明确选择本次退货的来源订单');
      orderId = sources[0].order_id;
    }
    await SalesReturnEligibilityService.assertReturnable(connection, { orderId, outboundId: body.outbound_id, items });
    const { CodeGenerators } = require('../../../utils/codeGenerator');
    const returnNo = await CodeGenerators.generateSalesReturnCode(connection);
    const [result] = await connection.query(
      'INSERT INTO sales_returns (return_no, order_id, outbound_id, return_date, return_reason, status, remarks, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [returnNo, orderId, body.outbound_id || null, body.return_date, body.return_reason, status, body.remarks || '', getAuthenticatedUserId(req)]
    );
    await saveReturnItems(connection, result.insertId, items);
    await connection.commit();
    return ResponseHandler.success(res, { id: result.insertId, returnNo, status }, '创建成功', 201);
  } catch (error) {
    if (connection) await connection.rollback();
    logger.error('创建销售退货单失败:', error);
    return ResponseHandler.error(res, error.message, error.code || 'SERVER_ERROR', error.statusCode || 500);
  } finally {
    if (connection) connection.release();
  }
};

exports.updateSalesReturn = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const body = mapKeysToSnake(req.body || {});
    const statusOnly = Object.keys(body).length === 1 && body.status !== undefined;
    connection = await getConnection();
    const ScopeGuard = require('../../../authorization/ScopeGuard');
    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'sales_return', id, '无权修改该销售退货单'))) return;
    await connection.beginTransaction();
    const [[source]] = await connection.query('SELECT order_id FROM sales_returns WHERE id=?', [id]);
    const lockedOrderIds = await lockSalesOrders(connection, [source?.order_id, body.order_id]);
    const [[current]] = await connection.query('SELECT * FROM sales_returns WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [id]);
    if (!current) {
      await connection.rollback();
      return ResponseHandler.notFound(res, '销售退货单不存在');
    }
    const nextStatus = body.status || current.status;
    if (!isValidSalesReturnStatus(nextStatus)) throw validationError('无效的退货状态');
    if (statusOnly && current.status === nextStatus) {
      await connection.commit();
      return ResponseHandler.success(res, { id: Number(id), status: nextStatus }, '销售退货状态未变化');
    }
    if (['completed', 'rejected', 'cancelled'].includes(current.status)) throw validationError('已完成、驳回或取消的退货单不可修改');
    if (nextStatus !== current.status && !canTransitionSalesReturnStatus(current.status, nextStatus)) {
      throw validationError(`退货状态不允许从 ${current.status} 变为 ${nextStatus}`);
    }
    if (current.status === 'approved' && !statusOnly) throw validationError('已审批退货单只能通过状态操作完成或取消，不可改写明细');

    const [savedItems] = await connection.query('SELECT * FROM sales_return_items WHERE return_id = ? ORDER BY id', [id]);
    const items = body.items === undefined ? savedItems : normalizeReturnItems(body.items);
    const orderId = body.order_id ?? current.order_id;
    if (!lockedOrderIds.has(Number(orderId))) throw validationError('退货来源已变更，请刷新单据后重试');
    const outboundId = body.outbound_id ?? current.outbound_id;
    const returnDate = normalizeSalesDate(body.return_date ?? current.return_date, '退货日期');
    const returnReason = body.return_reason ?? current.return_reason;
    if (!returnReason) throw validationError('退货原因不能为空');
    if (!['cancelled', 'rejected'].includes(nextStatus)) {
      await SalesReturnEligibilityService.assertReturnable(connection, { orderId, outboundId, items, excludeReturnId: id });
    }
    await connection.query(
      'UPDATE sales_returns SET order_id=?, outbound_id=?, return_date=?, return_reason=?, status=?, remarks=?, updated_at=NOW() WHERE id=?',
      [orderId, outboundId || null, returnDate, returnReason, nextStatus, body.remarks ?? current.remarks, id]
    );
    if (body.items !== undefined) {
      await connection.query('DELETE FROM sales_return_items WHERE return_id = ?', [id]);
      await saveReturnItems(connection, id, items);
    }

    let domainEventId = null;
    if (nextStatus === 'completed') {
      const [persistedItems] = await connection.query(
        'SELECT i.*, m.code, m.name, m.unit_id, m.location_id FROM sales_return_items i JOIN materials m ON m.id = i.product_id AND m.deleted_at IS NULL WHERE i.return_id = ? ORDER BY i.id', [id]
      );
      if (persistedItems.length !== items.length) throw validationError('退货商品已失效，请核对物料资料');
      const InventoryService = require('../../../services/InventoryService');
      for (const item of persistedItems) {
        if (!item.location_id) throw validationError(`物料 ${item.code} 未配置默认仓库`);
        await InventoryService.updateStock({
          materialId: item.product_id, locationId: item.location_id, quantity: Number(item.quantity),
          transactionType: 'sales_return', referenceType: 'sales_return', referenceNo: current.return_no,
          sourceId: Number(id), sourceLineKey: `sales_return:${id}:${item.id}`,
          operator: getRequestActorLabel(req), unitId: item.unit_id,
          transactionDate: returnDate, remark: `销售退货入库：${item.code} ${item.name}`,
          batchNumber: `RT-${current.return_no}-${item.product_id}`,
          idempotencyKey: `sales_return:${id}:${item.id}`,
        }, connection);
      }
      domainEventId = await DomainEventService.enqueue('SALES_RETURN_COMPLETED', {
        returnId: Number(id), returnNo: current.return_no, currentUserId: req.user?.id || null,
      }, { connection, aggregateType: 'sales_return', aggregateId: id, dedupKey: `SALES_RETURN_COMPLETED:${id}` });
      const SalesOrderStatusService = require('../../../services/business/SalesOrderStatusService');
      await SalesOrderStatusService.updateOrderStatus(orderId, connection);
    }
    await connection.commit();
    DomainEventService.dispatchSoon(domainEventId);
    return ResponseHandler.success(res, { id: Number(id), status: nextStatus }, '销售退货单更新成功');
  } catch (error) {
    if (connection) await connection.rollback();
    logger.error('更新销售退货单失败:', error);
    return ResponseHandler.error(res, error.message, error.code || 'SERVER_ERROR', error.statusCode || 500);
  } finally {
    if (connection) connection.release();
  }
};

exports.updateSalesReturnStatus = (req, res) => exports.updateSalesReturn({
  ...req, body: { status: req.body?.status },
}, res);

// 删除退货单功能

exports.deleteSalesReturn = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    connection = await getConnection();

    const ScopeGuard = require('../../../authorization/ScopeGuard');
    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'sales_return', id, '无权删除该销售退货单'))) {
      return;
    }

    await connection.beginTransaction();

    const [returnRows] = await connection.query(
      'SELECT id, status, return_no FROM sales_returns WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );
    if (returnRows.length === 0) {
      await connection.rollback();
      return ResponseHandler.notFound(res, 'Sales return not found');
    }

    const returnOrder = returnRows[0];
    const deletableStatuses = [
      STATUS.SALES_RETURN.DRAFT,
      STATUS.SALES_RETURN.PENDING,
      STATUS.SALES_RETURN.REJECTED,
      STATUS.SALES_RETURN.CANCELLED,
    ];
    if (!deletableStatuses.includes(returnOrder.status)) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        `无法删除状态为 "${returnOrder.status}" 的销售退货单`,
        'VALIDATION_ERROR',
        400
      );
    }

    // 删除明细
    await connection.query('DELETE FROM sales_return_items WHERE return_id = ?', [id]);

    // 软删除退货单主表
    await softDelete(connection, 'sales_returns', 'id', id);

    await connection.commit();

    return ResponseHandler.success(res, {
      message: '销售退货单删除成功',
      id: parseInt(id),
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('删除销售退货单失败:', error);
    ResponseHandler.error(res, '删除销售退货单失败', 'SERVER_ERROR', 500);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Sales Exchange Controllers
