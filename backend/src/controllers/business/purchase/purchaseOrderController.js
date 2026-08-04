/**
 * purchaseOrderController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const db = require('../../../config/db');
const pool = db.pool;
const { softDelete } = require('../../../utils/softDelete');
const purchaseModel = require('../../../models/purchase');
const {
  PURCHASE_STATUS,
  isValidStatusTransition,
  getStatusLabel,
} = require('../../../constants/purchaseConstants');
const PurchaseOrderService = require('../../../services/PurchaseOrderService');
const PurchaseOrderStatusService = require('../../../services/business/PurchaseOrderStatusService');
const PurchaseReceiveInspectionService = require('../../../services/business/PurchaseReceiveInspectionService');
const PurchasePriceService = require('../../../services/business/PurchasePriceService');
const SupplierMetalRangePriceService = require('../../../services/business/SupplierMetalRangePriceService');
const DBManager = require('../../../utils/dbManager');
const { desensitizeDataForUser } = require('../../../utils/desensitizer');
const { calculateLines, normalizeTaxRate } = require('../../../utils/money');
const {
  resolveUnitPrice,
  normalizeItemsUnitPrice,
} = require('../../../utils/unitPriceFields');
const { parsePagination } = require('../../../utils/safePagination');
const { financeConfig } = require('../../../config/financeConfig');
const ScopeGuard = require('../../../authorization/ScopeGuard');
const { getAuthenticatedUserId } = require('../../../utils/authContext');
const {
  purchaseOrderMap,
  purchaseOrderItemMap,
  toNumber,
} = require('../../../utils/purchase/purchaseFieldMap');

async function canAccessPurchaseOrder(connection, req, id) {
  return ScopeGuard.assertAccess(connection, req, 'purchase_order', id);
}

function forbiddenError(message) {
  const error = new Error(message);
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  return error;
}

function hasProvidedUnitPrice(item) {
  const keys = ['price', 'unit_price', 'unitPrice'];
  return keys.some((key) => item[key] !== null && item[key] !== undefined && item[key] !== '');
}

function assertPurchaseItemPrices(items = []) {
  const invalidRows = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      // 统一从 price / unit_price / unitPrice 解析
      if (!hasProvidedUnitPrice(item)) return true;
      const price = resolveUnitPrice(item, { fallback: Number.NaN });
      return !Number.isFinite(price) || price <= 0;
    })
    .map(({ index }) => index + 1);

  if (invalidRows.length > 0) {
    const error = new Error(`第 ${invalidRows.join(', ')} 行采购单价缺失或无效，请先维护采购价格`);
    error.statusCode = 400;
    throw error;
  }
}

// 获取采购订单列表
const getOrders = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      orderNo,
      contractCode,
      keyword,
      supplierId,
      startDate,
      endDate,
      status,
    } = req.query;
    const pagination = parsePagination(page, pageSize, { defaultPageSize: 10, maxPageSize: 100 });
    const scopeClause = await ScopeGuard.applyListScope(req, 'purchase_order', {
      tableAlias: 'o',
      ownerAlias: 'purchase_order_owner_scope',
    });

    let query = `
      SELECT o.*, s.name as supplier_name, s.code as supplier_code,
             s.contact_person as supplier_contact_person,
             s.contact_phone as supplier_contact_phone,
             NULL as operator_name,
             COUNT(*) OVER() as total_count
      FROM purchase_orders o
      LEFT JOIN suppliers s ON o.supplier_id = s.id
      ${scopeClause.join}
      WHERE o.deleted_at IS NULL
    `;

    const queryParams = [];

    // 支持keyword参数同时搜索订单号和合同编码
    if (keyword) {
      query += ' AND (o.order_no LIKE ? OR o.contract_code LIKE ?)';
      queryParams.push(`%${keyword}%`, `%${keyword}%`);
    } else {
      // 兼容旧的独立参数
      if (orderNo) {
        query += ' AND o.order_no LIKE ?';
        queryParams.push(`%${orderNo}%`);
      }

      if (contractCode) {
        query += ' AND o.contract_code LIKE ?';
        queryParams.push(`%${contractCode}%`);
      }
    }

    // 注意: operator 字段在 purchase_orders 表中不存在，已移除相关过滤
    if (supplierId) {
      query += ' AND o.supplier_id = ?';
      queryParams.push(supplierId);
    }

    if (startDate) {
      query += ' AND o.order_date >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ' AND o.order_date <= ?';
      queryParams.push(endDate);
    }

    if (status) {
      query += ' AND o.status = ?';
      queryParams.push(status);
    }

    query += scopeClause.where;
    queryParams.push(...scopeClause.params);

    // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    const actualPageSize = pagination.limit;
    const actualOffset = pagination.offset;
    query += ` ORDER BY o.created_at DESC LIMIT ${actualPageSize} OFFSET ${actualOffset}`;

    // 使用正确的连接池查询方法
    const [rows] = await pool.query(query, queryParams);

    const items = [];
    if (rows.length > 0) {
      const orderIds = rows.map((row) => row.id);
      if (orderIds.length > 0) {
        const placeholders = orderIds.map(() => '?').join(',');
        const itemsQuery = `
          SELECT poi.*,
                 COALESCE(poi.received_quantity, 0) as received_quantity,
                 COALESCE(poi.warehoused_quantity, 0) as warehoused_quantity,
                 CASE
                   WHEN poi.quantity > 0 THEN ROUND((COALESCE(poi.received_quantity, 0) / poi.quantity) * 100, 2)
                   ELSE 0
                 END as received_percentage,
                 CASE
                   WHEN poi.quantity > 0 THEN ROUND((COALESCE(poi.warehoused_quantity, 0) / poi.quantity) * 100, 2)
                   ELSE 0
                 END as warehoused_percentage
          FROM purchase_order_items poi
          WHERE poi.order_id IN (${placeholders})
          ORDER BY poi.id
        `;
        const [itemRows] = await pool.query(itemsQuery, orderIds);
        items.push(...itemRows);
      }
    }

    // 整合订单及其物料 → 统一 camel API
    const orders = rows.map((row) => {
      const orderItems = normalizeItemsUnitPrice(
        items.filter((item) => item.order_id === row.id)
      );
      const api = purchaseOrderMap.toApi({
        ...row,
        items: orderItems,
      });
      // 明细再走 item map，保证 unitPrice
      api.items = (orderItems || []).map((it) => purchaseOrderItemMap.toApi(it));
      return api;
    });

    const totalCount = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;
    await desensitizeDataForUser(orders, req.user, 'view', req.userPermissions);

    return ResponseHandler.paginated(res, orders, totalCount, pagination.page, pagination.pageSize, undefined, {
      items: orders,
    });
  } catch (error) {
    logger.error('获取采购订单列表失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 获取采购订单详情
const getOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const isNumericId = /^\d+$/.test(id);
    let orderId;

    if (isNumericId) {
      // 如果是纯数字，直接使用ID
      orderId = parseInt(id);
    } else {
      // 如果不是纯数字，按订单号查询获取ID
      const query = 'SELECT id FROM purchase_orders WHERE order_no = ? AND deleted_at IS NULL';
      const [rows] = await pool.query(query, [id]);

      if (rows.length === 0) {
        return ResponseHandler.notFound(res, 'purchase order not found');
      }

      orderId = rows[0].id;
    }

    if (!(await canAccessPurchaseOrder(pool, req, orderId))) {
      return ResponseHandler.forbidden(res, 'No permission to access this purchase order');
    }

    const order = await getOrderById(orderId);

    if (!order) {
      return ResponseHandler.notFound(res, 'purchase order not found');
    }

    await desensitizeDataForUser(order, req.user, 'view', req.userPermissions);
    return ResponseHandler.success(res, order);
  } catch (error) {
    logger.error('获取采购订单详情失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 创建采购订单
const createOrder = async (req, res) => {
  try {
    const {
      order_date: orderDate,
      supplier_id: supplierId,
      expected_delivery_date: expectedDeliveryDate,
      contact_person: contactPerson,
      contact_phone: contactPhone,
      remarks,
      total_amount: _totalAmount,
      requisition_id: requisitionId,
      requisition_number: requisitionNumber,
      contract_code: contractCode,
      items,
    } = req.body;
    const createdBy = getAuthenticatedUserId(req);

    const createdOrder = await DBManager.executeTransaction(async (connection) => {
      const supplierName = await PurchaseOrderService.validateSupplier(connection, supplierId);

      // 生成订单号（传入连接确保事务一致性）
      const orderNo = await purchaseModel.generateOrderNo(connection);

      assertPurchaseItemPrices(items || []);
      const orderAmounts = calculateLines(items || [], {
        defaultTaxRate: req.body.tax_rate !== undefined ? req.body.tax_rate : financeConfig.get('tax.defaultVATRate', 0.13),
      });
      const taxRate = normalizeTaxRate(req.body.tax_rate !== undefined ? req.body.tax_rate : orderAmounts.taxRate, financeConfig.get('tax.defaultVATRate', 0.13));
      const subtotal = orderAmounts.subtotal;
      const taxAmount = orderAmounts.taxAmount;
      const calculatedTotalAmount = orderAmounts.totalAmount;
      const metalSnapshot = await resolveOrderMetalSnapshot(connection, { ...req.body, order_date: orderDate }, orderAmounts.items || items || []);

      const insertQuery = `
        INSERT INTO purchase_orders (
          order_no, order_date, supplier_id, supplier_name, contract_code,
          metal_symbol, metal_price, metal_price_source, metal_price_date, metal_price_scheme_id,
          expected_delivery_date, contact_person, contact_phone,
          total_amount, tax_rate, tax_amount, subtotal, remarks, status, requisition_id, requisition_number, created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const [result] = await connection.query(insertQuery, [
        orderNo,
        orderDate,
        supplierId,
        supplierName,
        contractCode || null,
        metalSnapshot.metal_symbol,
        metalSnapshot.metal_price,
        metalSnapshot.metal_price_source,
        metalSnapshot.metal_price_date,
        metalSnapshot.metal_price_scheme_id,
        expectedDeliveryDate,
        contactPerson,
        contactPhone,
        calculatedTotalAmount,
        taxRate,
        taxAmount,
        subtotal,
        remarks,
        req.body.status || 'draft',
        requisitionId || null,
        requisitionNumber || null,
        createdBy,
      ]);

      const orderId = result.insertId;

      // 插入订单物料项目
      await PurchaseOrderService.insertOrderItems(connection, orderId, orderAmounts.items);

      if (requisitionId) {
        await PurchaseOrderService.syncRequisitionStatusFromOrders(connection, requisitionId);
      }

      return orderId;
    });

    const orderDetails = await getOrderById(createdOrder);
    await desensitizeDataForUser(orderDetails, req.user, 'view', req.userPermissions);


    ResponseHandler.success(res, orderDetails, '创建成功', 201);
  } catch (error) {
    logger.error('创建采购订单失败:', error);
    return ResponseHandler.error(res, error.message || '操作失败', 'OPERATION_ERROR', error.statusCode || 500, error);
  }
};

// 更新采购订单
const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      order_date: orderDate,
      supplier_id: supplierId,
      expected_delivery_date: expectedDeliveryDate,
      contact_person: contactPerson,
      contact_phone: contactPhone,
      remarks,
      total_amount: _totalAmount,
      requisition_id: requisitionId,
      requisition_number: requisitionNumber,
      contract_code: contractCode,
      items,
    } = req.body;

    const updatedOrder = await DBManager.executeTransaction(async (connection) => {
      if (!(await canAccessPurchaseOrder(connection, req, id))) {
        throw forbiddenError('No permission to modify this purchase order');
      }
      const currentOrder = await PurchaseOrderService.validateOrderEditable(connection, id);
      const previousRequisitionId = currentOrder.requisition_id;
      const supplierName = await PurchaseOrderService.validateSupplier(connection, supplierId);
      assertPurchaseItemPrices(items || []);
      const orderAmounts = calculateLines(items || [], {
        defaultTaxRate: req.body.tax_rate !== undefined ? req.body.tax_rate : financeConfig.get('tax.defaultVATRate', 0.13),
      });
      const taxRate = normalizeTaxRate(req.body.tax_rate !== undefined ? req.body.tax_rate : orderAmounts.taxRate, financeConfig.get('tax.defaultVATRate', 0.13));
      const metalSnapshot = await resolveOrderMetalSnapshot(connection, { ...req.body, order_date: orderDate }, orderAmounts.items || items || []);


      // 更新采购订单基本信息
      const updateQuery = `
        UPDATE purchase_orders
        SET order_date = ?, supplier_id = ?, supplier_name = ?, contract_code = ?,
            metal_symbol = ?, metal_price = ?, metal_price_source = ?, metal_price_date = ?, metal_price_scheme_id = ?,
            expected_delivery_date = ?, contact_person = ?, contact_phone = ?,
            total_amount = ?, tax_rate = ?, tax_amount = ?, subtotal = ?, remarks = ?, updated_at = CURRENT_TIMESTAMP,
            requisition_id = ?, requisition_number = ?
        WHERE id = ? AND deleted_at IS NULL
      `;
      await connection.query(updateQuery, [
        orderDate,
        supplierId,
        supplierName,
        contractCode || null,
        metalSnapshot.metal_symbol,
        metalSnapshot.metal_price,
        metalSnapshot.metal_price_source,
        metalSnapshot.metal_price_date,
        metalSnapshot.metal_price_scheme_id,
        expectedDeliveryDate,
        contactPerson,
        contactPhone,
        orderAmounts.totalAmount,
        taxRate,
        orderAmounts.taxAmount,
        orderAmounts.subtotal,
        remarks,
        requisitionId || null,
        requisitionNumber || null,
        id,
      ]);

      // 删除原有物料项目
      await connection.query('DELETE FROM purchase_order_items WHERE order_id = ?', [id]);

      // 插入新的物料项目
      await PurchaseOrderService.insertOrderItems(connection, id, orderAmounts.items);

      const affectedRequisitionIds = [...new Set(
        [previousRequisitionId, requisitionId]
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      )];
      for (const affectedRequisitionId of affectedRequisitionIds) {
        await PurchaseOrderService.syncRequisitionStatusFromOrders(
          connection,
          affectedRequisitionId
        );
      }

      return id;
    });

    // 获取更新后的订单信息
    const orderDetails = await getOrderById(updatedOrder);
    await desensitizeDataForUser(orderDetails, req.user, 'view', req.userPermissions);

    return ResponseHandler.success(res, orderDetails);
  } catch (error) {
    logger.error('更新采购订单失败:', error);
    return ResponseHandler.error(res, error.message || '操作失败', 'OPERATION_ERROR', error.statusCode || 500, error);
  }
};

// 删除采购订单
const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    if (!(await canAccessPurchaseOrder(pool, req, id))) {
      return ResponseHandler.forbidden(res, 'No permission to delete this purchase order');
    }

    await DBManager.executeTransaction(async (connection) => {
      const [orders] = await connection.query(
        'SELECT id, status, requisition_id FROM purchase_orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
        [id]
      );
      if (orders.length === 0) {
        throw new Error('purchase order not found');
      }
      if (!(await canAccessPurchaseOrder(connection, req, id))) {
        throw forbiddenError('No permission to delete this purchase order');
      }
      if (!['draft', 'pending', 'rejected', 'cancelled'].includes(orders[0].status)) {
        const err = new Error('current purchase order status cannot be deleted');
        err.statusCode = 400;
        throw err;
      }

      // 软删除替代硬删除 (物料项目FK仍在，但主表不再物理删除)
      await softDelete(connection, 'purchase_orders', 'id', id);
      if (orders[0].requisition_id) {
        await PurchaseOrderService.syncRequisitionStatusFromOrders(
          connection,
          orders[0].requisition_id
        );
      }
    });

    return ResponseHandler.success(res, null, '采购订单删除成功');
  } catch (error) {
    logger.error('删除采购订单失败:', error);
    const statusCode = error.statusCode || (error.message === 'purchase order not found' ? 404 : 500);
    const errorCode = error.code || (statusCode === 404 ? 'NOT_FOUND' : 'OPERATION_ERROR');
    const message = statusCode < 500 ? error.message : '操作失败';
    return ResponseHandler.error(res, message, errorCode, statusCode, error);
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // 从请求体中获取状态 - 支持多种格式
    let newStatus;
    if (req.body.newStatus) {
      newStatus = req.body.newStatus;
    } else if (req.body.status) {
      newStatus = req.body.status;
    } else if (typeof req.body === 'string') {
      newStatus = req.body;
    } else {
      return ResponseHandler.error(res, 'invalid status format', 'VALIDATION_ERROR', 400);
    }

    const validStatuses = Object.values(PURCHASE_STATUS);
    if (!validStatuses.includes(newStatus)) {
      return ResponseHandler.error(res, 'invalid status', 'VALIDATION_ERROR', 400);
    }

    if (!(await canAccessPurchaseOrder(pool, req, id))) {
      return ResponseHandler.forbidden(res, 'No permission to change this purchase order');
    }

    const updatedOrder = await DBManager.executeTransaction(async (connection) => {
      const [checkRows] = await connection.query('SELECT id, order_no, order_date, supplier_id, supplier_name, contract_code, expected_delivery_date, contact_person, contact_phone, total_amount, remarks, status, completion_percentage, created_at, updated_at, requisition_id, requisition_number, tax_rate, tax_amount, subtotal, deleted_at FROM purchase_orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [
        id,
      ]);

      if (checkRows.length === 0) {
        throw new Error('purchase order not found');
      }

      if (!(await canAccessPurchaseOrder(connection, req, id))) {
        throw forbiddenError('No permission to change this purchase order');
      }

      const currentOrder = checkRows[0];
      const currentStatus = currentOrder.status;

      // approved 状态保留给工作流回调专用，前端不可直接设置
      if (newStatus === 'approved') {
        throw new Error('approved 状态仅限工作流回调设置，请在审批中心处理待审节点');
      }

      // 如果状态没有变化，直接返回（允许保持相同状态）
      if (currentStatus === newStatus) {
        if (newStatus === PURCHASE_STATUS.COMPLETED) {
          const normalizedStatus = await PurchaseOrderStatusService.updateOrderStatus(id, connection);
          if (normalizedStatus?.status !== PURCHASE_STATUS.COMPLETED) {
            throw new Error(
              `采购订单尚未全部入库，不能设置为已完成。订单数量=${normalizedStatus?.totalQuantity || 0}, 已入库=${normalizedStatus?.totalWarehoused || 0}`
            );
          }
        }
        logger.info(`订单状态保持不变: ${currentStatus}`);
        return id;
      }

      if (!isValidStatusTransition(currentStatus, newStatus)) {
        throw new Error(
          `无效的状态变更：${getStatusLabel(currentStatus)} -> ${getStatusLabel(newStatus)}`
        );
      }

      // 已有收货/入库数量时禁止取消（须先退货清零）
      if (newStatus === PURCHASE_STATUS.CANCELLED || newStatus === 'cancelled') {
        const [qtyStats] = await connection.execute(
          `SELECT COALESCE(SUM(received_quantity), 0) AS recv,
                  COALESCE(SUM(warehoused_quantity), 0) AS wh
           FROM purchase_order_items WHERE order_id = ?`,
          [id]
        );
        const recv = parseFloat(qtyStats[0]?.recv) || 0;
        const wh = parseFloat(qtyStats[0]?.wh) || 0;
        if (recv > 0.0001 || wh > 0.0001) {
          throw new Error(
            `采购订单已有收货/入库数量(收货=${recv}, 入库=${wh})，请先完成退货清零后再取消`
          );
        }
        const [openReceipts] = await connection.execute(
          `SELECT COUNT(*) AS cnt FROM purchase_receipts
           WHERE order_id = ? AND deleted_at IS NULL
             AND status IN ('confirmed', 'completed', 'draft')`,
          [id]
        );
        if (Number(openReceipts[0]?.cnt || 0) > 0) {
          throw new Error('采购订单仍有关联收货单，请先处理收货单后再取消');
        }
      }

      // 提交审批前必须已设置供应商，否则审批通过后无法到货
      if (newStatus === 'pending' && !currentOrder.supplier_id) {
        throw new Error('提交审批前请先设置供应商');
      }

      // 提交审批时尝试发起工作流
      let finalStatus = newStatus;
      if (newStatus === 'pending') {
        const WorkflowService = require('../../../services/business/WorkflowService');
        const userId = req.user?.userId || req.user?.id;
        await connection.query(
          "UPDATE purchase_orders SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [id]
        );
        const wfResult = await WorkflowService.tryStartWorkflow(
          'purchase_order', id, currentOrder.order_no,
          `采购订单 ${currentOrder.order_no} 审批`, userId, connection
        );
        if (wfResult.auto_approved) {
          finalStatus = 'approved';
        }
      }

      if (finalStatus === PURCHASE_STATUS.COMPLETED) {
        await PurchaseOrderStatusService.assertOrderCanComplete(id, connection);
      }

      const updateQuery = `
        UPDATE purchase_orders
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND deleted_at IS NULL
      `;
      await connection.query(updateQuery, [finalStatus, id]);

      if (finalStatus === PURCHASE_STATUS.COMPLETED) {
        await PurchaseOrderStatusService.updateOrderStatus(id, connection);
      }

      if (currentOrder.requisition_id) {
        await PurchaseOrderService.syncRequisitionStatusFromOrders(
          connection,
          currentOrder.requisition_id
        );
      }

      return id;
    });

    // 获取更新后的订单
    const orderDetails = await getOrderById(updatedOrder);

    return ResponseHandler.success(res, orderDetails);
  } catch (error) {
    logger.error('更新采购订单状态失败', error);
    const businessErrorMessages = [
      'purchase order not found',
      'approved status',
      'invalid status',
      'purchase order is not fully warehoused',
      '提交审批前请先设置供应商',
      '无效的状态变更',
    ];
    const isBusinessError = error.statusCode >= 400 && error.statusCode < 500
      ? true
      : businessErrorMessages.some((message) => error.message?.startsWith(message));
    const statusCode = error.statusCode || (error.message === 'purchase order not found' ? 404 : isBusinessError ? 400 : 500);
    const errorCode = statusCode === 404 ? 'NOT_FOUND' : statusCode === 400 ? 'VALIDATION_ERROR' : 'OPERATION_ERROR';
    const message = isBusinessError ? error.message : '操作失败';
    return ResponseHandler.error(res, message, errorCode, statusCode, error);
  }
};

const batchUpdateOrderStatus = async (req, res) => {
  try {
    const orderIds = Array.isArray(req.body?.order_ids)
      ? req.body.order_ids.map((id) => parseInt(id, 10)).filter(Boolean)
      : [];
    const newStatus = req.body?.newStatus || req.body?.status;
    const uniqueIds = [...new Set(orderIds)];

    if (uniqueIds.length === 0) {
      return ResponseHandler.error(res, '请选择采购订单', 'VALIDATION_ERROR', 400);
    }
    if (uniqueIds.length > 100) {
      return ResponseHandler.error(res, 'too many purchase orders in one batch', 'VALIDATION_ERROR', 400);
    }

    const validStatuses = Object.values(PURCHASE_STATUS);
    if (!validStatuses.includes(newStatus) || newStatus === 'approved') {
      return ResponseHandler.error(res, 'invalid status', 'VALIDATION_ERROR', 400);
    }

    const result = await DBManager.executeTransaction(async (connection) => {
      const [orders] = await connection.query(
        'SELECT id, order_no, status, requisition_id, supplier_id FROM purchase_orders WHERE id IN (?) AND deleted_at IS NULL FOR UPDATE',
        [uniqueIds]
      );
      const orderMap = new Map(orders.map((order) => [Number(order.id), order]));
      const successes = [];
      const failures = [];
      const updatesByStatus = {};

      for (const id of uniqueIds) {
        const order = orderMap.get(id);
        if (!order) {
          failures.push({ id, message: 'purchase order not found' });
          continue;
        }

        if (!(await canAccessPurchaseOrder(connection, req, id))) {
          failures.push({ id, order_no: order.order_no, message: 'No permission to change this purchase order' });
          continue;
        }

        if (order.status === newStatus) {
          if (newStatus === PURCHASE_STATUS.COMPLETED) {
            try {
              await PurchaseOrderStatusService.assertOrderCanComplete(id, connection);
            } catch (completionError) {
              failures.push({ id, order_no: order.order_no, message: completionError.message });
              continue;
            }
          }
          successes.push({ id, order_no: order.order_no, status: order.status });
          continue;
        }

        if (!isValidStatusTransition(order.status, newStatus)) {
          failures.push({
            id,
            order_no: order.order_no,
            message: `无效的状态变更：${getStatusLabel(order.status)} -> ${getStatusLabel(newStatus)}`,
          });
          continue;
        }

        if (newStatus === 'pending' && !order.supplier_id) {
          failures.push({
            id,
            order_no: order.order_no,
            message: '提交审批前请先设置供应商',
          });
          continue;
        }

        let finalStatus = newStatus;
        if (newStatus === 'pending') {
          const WorkflowService = require('../../../services/business/WorkflowService');
          const userId = req.user?.userId || req.user?.id;
          await connection.query(
            "UPDATE purchase_orders SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [id]
          );
          const wfResult = await WorkflowService.tryStartWorkflow(
            'purchase_order',
            id,
            order.order_no,
            `采购订单 ${order.order_no} 审批`,
            userId,
            connection
          );
          if (wfResult.auto_approved) {
            finalStatus = 'approved';
          }
        }

        if (finalStatus === PURCHASE_STATUS.COMPLETED) {
          try {
            await PurchaseOrderStatusService.assertOrderCanComplete(id, connection);
          } catch (completionError) {
            failures.push({ id, order_no: order.order_no, message: completionError.message });
            continue;
          }
        }

        if (!updatesByStatus[finalStatus]) {
          updatesByStatus[finalStatus] = [];
        }
        updatesByStatus[finalStatus].push(id);
        successes.push({ id, order_no: order.order_no, status: finalStatus });
      }

      for (const [status, ids] of Object.entries(updatesByStatus)) {
        await connection.query(
          'UPDATE purchase_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (?) AND deleted_at IS NULL',
          [status, ids]
        );
        if (status === PURCHASE_STATUS.COMPLETED) {
          for (const orderId of ids) {
            await PurchaseOrderStatusService.updateOrderStatus(orderId, connection);
          }
        }
      }

      const affectedRequisitionIds = [...new Set(
        successes
          .map((success) => orderMap.get(Number(success.id))?.requisition_id)
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      )];
      for (const requisitionId of affectedRequisitionIds) {
        await PurchaseOrderService.syncRequisitionStatusFromOrders(connection, requisitionId);
      }

      return { successes, failures };
    });

    return ResponseHandler.success(res, {
      successCount: result.successes.length,
      failCount: result.failures.length,
      successes: result.successes,
      failures: result.failures,
    });
  } catch (error) {
    logger.error('批量更新采购订单状态失败', error);
    return ResponseHandler.error(res, 'batch update purchase order status failed', 'OPERATION_ERROR', 500, error);
  }
};

// 获取采购统计数据
const getStatistics = async (req, res) => {
  try {
    // 获取订单数量统计
    const ordersCountQuery = `
      SELECT
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = '${PURCHASE_STATUS.DRAFT}' THEN 1 END) as draft_orders,
        COUNT(CASE WHEN status = '${PURCHASE_STATUS.PENDING}' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN status = '${PURCHASE_STATUS.APPROVED}' THEN 1 END) as approved_orders,
        COUNT(CASE WHEN status = '${PURCHASE_STATUS.COMPLETED}' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN status = '${PURCHASE_STATUS.CANCELLED}' THEN 1 END) as cancelled_orders
      FROM purchase_orders
      WHERE deleted_at IS NULL
    `;
    const [countRows] = await pool.query(ordersCountQuery);

    // 获取本月订单金额
    const currentDate = new Date();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    const monthlyAmountQuery = `
      SELECT COALESCE(SUM(total_amount), 0) as monthly_amount
      FROM purchase_orders
      WHERE deleted_at IS NULL
        AND order_date BETWEEN ? AND ?
    `;
    const [amountRows] = await pool.query(monthlyAmountQuery, [
      firstDayOfMonth.toISOString().split('T')[0],
      lastDayOfMonth.toISOString().split('T')[0],
    ]);

    const topSuppliersQuery = `
      SELECT supplier_id, supplier_name, COUNT(*) as order_count, SUM(total_amount) as total_spent
      FROM purchase_orders
      WHERE deleted_at IS NULL
        AND status IN ('${PURCHASE_STATUS.APPROVED}', '${PURCHASE_STATUS.COMPLETED}')
      GROUP BY supplier_id, supplier_name
      ORDER BY total_spent DESC
      LIMIT 5
    `;
    const [supplierRows] = await pool.query(topSuppliersQuery);

    return ResponseHandler.success(res, {
      counts: countRows[0],
      monthlyAmount: amountRows[0].monthly_amount,
      topSuppliers: supplierRows,
    });
  } catch (error) {
    logger.error('获取采购统计数据失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 根据ID获取采购订单信息（内部使用）
const getOrderById = async (id) => {
  try {
    const query = `
      SELECT o.*, s.code as supplier_code
      FROM purchase_orders o
      LEFT JOIN suppliers s ON o.supplier_id = s.id
      WHERE o.id = ? AND o.deleted_at IS NULL
    `;
    const [rows] = await pool.query(query, [id]);

    if (rows.length === 0) {
      return null;
    }

    const order = rows[0];

    const itemsQuery = `
      SELECT
        poi.*,
        po.order_no,
        COALESCE(u1.name, u2.name) as unit_name,
        COALESCE(poi.unit_id, m.unit_id) as effective_unit_id,
        COALESCE(poi.received_quantity, 0) as received_quantity,
        COALESCE(poi.warehoused_quantity, 0) as warehoused_quantity,
        COALESCE(SUM(qi.unqualified_quantity), 0) as unqualified_quantity,
        CASE
          WHEN poi.quantity > 0 THEN ROUND((COALESCE(poi.received_quantity, 0) / poi.quantity) * 100, 2)
          ELSE 0
        END as received_percentage,
        CASE
          WHEN poi.quantity > 0 THEN ROUND((COALESCE(poi.warehoused_quantity, 0) / poi.quantity) * 100, 2)
          ELSE 0
        END as warehoused_percentage,
        (poi.quantity - COALESCE(poi.received_quantity, 0)) as pending_quantity
      FROM
        purchase_order_items poi
        LEFT JOIN purchase_orders po ON poi.order_id = po.id
        LEFT JOIN units u1 ON poi.unit_id = u1.id
        LEFT JOIN materials m ON poi.material_id = m.id
        LEFT JOIN units u2 ON m.unit_id = u2.id
        LEFT JOIN quality_inspections qi ON (qi.reference_id = poi.order_id OR qi.reference_no = po.order_no)
          AND qi.material_id = poi.material_id
          AND qi.inspection_type = 'incoming'
          AND qi.deleted_at IS NULL
      WHERE
        poi.order_id = ?
      GROUP BY
        poi.id, po.order_no, u1.name, u2.name, poi.unit_id, m.unit_id, poi.received_quantity, poi.warehoused_quantity
      ORDER BY
        poi.id
    `;
    const [itemRows] = await pool.query(itemsQuery, [id]);

    let totalQuantity = 0;
    let totalReceived = 0;
    let totalWarehoused = 0;

    itemRows.forEach((item) => {
      totalQuantity += parseFloat(item.quantity) || 0;
      totalReceived += parseFloat(item.received_quantity) || 0;
      totalWarehoused += parseFloat(item.warehoused_quantity) || 0;
    });

    // 明细规范化后走 purchaseOrderMap → 仅 camel 出参
    const normalizedItems = normalizeItemsUnitPrice(itemRows);
    const api = purchaseOrderMap.toApi({
      ...order,
      items: normalizedItems,
    });
    api.items = (normalizedItems || []).map((it) => {
      const line = purchaseOrderItemMap.toApi(it);
      line.unitName = it.unit_name ?? null;
      line.receivedQuantity = toNumber(it.received_quantity, 0);
      line.warehousedQuantity = toNumber(it.warehoused_quantity, 0);
      line.unqualifiedQuantity = toNumber(it.unqualified_quantity, 0);
      line.receivedPercentage = toNumber(it.received_percentage, 0);
      line.warehousedPercentage = toNumber(it.warehoused_percentage, 0);
      line.pendingQuantity = toNumber(it.pending_quantity, 0);
      return line;
    });
    api.totalQuantity = totalQuantity;
    api.totalReceived = totalReceived;
    api.totalWarehoused = totalWarehoused;
    api.receivedPercentage =
      totalQuantity > 0 ? Math.round((totalReceived / totalQuantity) * 100 * 100) / 100 : 0;
    api.warehousedPercentage =
      totalQuantity > 0 ? Math.round((totalWarehoused / totalQuantity) * 100 * 100) / 100 : 0;
    api.pendingQuantity = totalQuantity - totalReceived;
    api.supplierCode = order.supplier_code ?? null;

    return api;
  } catch (error) {
    logger.error('获取采购订单详情失败:', error);
    throw error;
  }
};

const getSuppliers = async (req, res) => {
  try {
    const { status, limit } = req.query;
    let query = 'SELECT id, code, name, contact_person, contact_phone, status FROM suppliers WHERE deleted_at IS NULL';
    const queryParams = [];

    if (status !== undefined) {
      query += ' AND status = ?';
      queryParams.push(status);
    }

    query += ' ORDER BY code';

    if (limit) {
      const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 100, 100));
      query += ` LIMIT ${safeLimit}`;
    }

    const [rows] = await pool.query(query, queryParams);

    return ResponseHandler.success(res, rows);
  } catch (error) {
    logger.error('获取供应商列表失败', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

const getRequisitions = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, requisitionNo, status } = req.query;
    const pagination = parsePagination(page, pageSize, { defaultPageSize: 10, maxPageSize: 100 });

    const defaultStatus = status || 'approved';

    let query = `
      SELECT r.*, u.real_name as user_real_name, COUNT(*) OVER() as total_count
      FROM purchase_requisitions r
      LEFT JOIN users u ON r.requester = u.username
      WHERE r.status = ?
        AND r.deleted_at IS NULL
    `;

    const queryParams = [defaultStatus];

    if (requisitionNo) {
      query += ' AND r.requisition_number LIKE ?';
      queryParams.push(`%${requisitionNo}%`);
    }

    // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    const actualPageSize = pagination.limit;
    const actualOffset = pagination.offset;
    query += ` ORDER BY r.created_at DESC LIMIT ${actualPageSize} OFFSET ${actualOffset}`;

    const [rows] = await pool.query(query, queryParams);

    // 获取申请单的物料详情
    const items = [];
    if (rows.length > 0) {
      const requisitionIds = rows.map((row) => row.id);
      const itemsQuery = `
        SELECT id, requisition_id, material_id, material_code, material_name, specification, unit, unit_id, quantity, created_at, updated_at FROM purchase_requisition_items
        WHERE requisition_id IN (?)
        ORDER BY id
      `;
      const [itemRows] = await pool.query(itemsQuery, [requisitionIds]);
      items.push(...itemRows);

      // 获取已订购数量统计（用于计算采购状态）
      const orderedQuery = `
        SELECT po.requisition_id, poi.material_code, SUM(poi.quantity) as ordered_qty
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.order_id = po.id
        WHERE po.requisition_id IN (?)
        AND po.requisition_id IS NOT NULL
        AND po.deleted_at IS NULL
        AND po.status <> 'cancelled'
        GROUP BY po.requisition_id, poi.material_code
      `;
      const [orderedRows] = await pool.query(orderedQuery, [requisitionIds]);

      items.forEach((item) => {
        const orderedInfo = orderedRows.find(
          (r) => r.requisition_id === item.requisition_id && r.material_code === item.material_code
        );
        item.ordered_quantity = orderedInfo ? parseFloat(orderedInfo.ordered_qty) : 0;
      });
    }

    const requisitions = rows.map((row) => {
      const requisitionItems = items.filter((item) => item.requisition_id === row.id);

      // 优先使用数据库中的real_name，如果为空则使用user_real_name
      if ((!row.real_name || row.real_name === '') && row.user_real_name) {
        row.real_name = row.user_real_name;
      }

      // 移除查询辅助字段
      delete row.user_real_name;

      const processedReq = {
        ...row,
        materials: requisitionItems,
        // 判断是否全部生成订单（所有物料都有采购订单，不管数量）
        is_fully_ordered:
          requisitionItems.length > 0 &&
          requisitionItems.every((item) => item.ordered_quantity > 0),
        // 判断是否部分生成订单（部分物料有订单，部分没有）
        is_partially_ordered: false, // 初始值，下面计算
      };

      // 计算部分订购状态：至少有一个物料有订单，且至少有一个物料没订单
      if (requisitionItems.length > 0 && !processedReq.is_fully_ordered) {
        const hasAnyOrdered = requisitionItems.some((item) => item.ordered_quantity > 0);
        processedReq.is_partially_ordered = hasAnyOrdered;
      }

      return processedReq;
    });

    const totalCount = rows.length > 0 ? parseInt(rows[0].total_count) : 0;

    return ResponseHandler.paginated(res, requisitions, totalCount, pagination.page, pagination.pageSize, undefined, {
      items: requisitions,
    });
  } catch (error) {
    logger.error('获取采购申请列表失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

const getRequisition = async (req, res) => {
  try {
    const { id } = req.params;

    const query =
      'SELECT r.*, u.real_name as user_real_name FROM purchase_requisitions r LEFT JOIN users u ON r.requester = u.username WHERE r.id = ? AND r.status IN (?, ?) AND r.deleted_at IS NULL';
    const [rows] = await pool.query(query, [id, 'approved', 'completed']);

    if (rows.length === 0) {
      return ResponseHandler.notFound(res, 'purchase requisition not found');
    }

    const requisition = rows[0];

    // 如果real_name为空，使用user_real_name
    if ((!requisition.real_name || requisition.real_name === '') && requisition.user_real_name) {
      requisition.real_name = requisition.user_real_name;
    }

    // 移除查询辅助字段
    delete requisition.user_real_name;

    const itemsQuery =
      'SELECT id, requisition_id, material_id, material_code, material_name, specification, unit, unit_id, quantity, created_at, updated_at FROM purchase_requisition_items WHERE requisition_id = ? ORDER BY id';
    const [itemRows] = await pool.query(itemsQuery, [id]);

    // 获取已订购数量统计（用于过滤已采购物料）
    const orderedQuery = `
      SELECT poi.material_code, SUM(poi.quantity) as ordered_qty
      FROM purchase_order_items poi
      JOIN purchase_orders po ON poi.order_id = po.id
      WHERE po.requisition_id = ?
      AND po.requisition_id IS NOT NULL
      AND po.deleted_at IS NULL
      AND po.status <> 'cancelled'
      GROUP BY poi.material_code
    `;
    const [orderedRows] = await pool.query(orderedQuery, [id]);

    // 将已订购信息附加到物料上
    itemRows.forEach((item) => {
      const orderedInfo = orderedRows.find((r) => r.material_code === item.material_code);
      item.ordered_quantity = orderedInfo ? parseFloat(orderedInfo.ordered_qty) : 0;
    });

    requisition.materials = itemRows;

    return ResponseHandler.success(res, requisition);
  } catch (error) {
    logger.error('获取采购申请详情失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 获取采购综合统计数据（用于数据概览）
const getPurchaseDashboardStats = async (req, res) => {
  try {
    const PurchaseDashboardService = require('../../../services/business/PurchaseDashboardService');
    const dashboardData = await PurchaseDashboardService.getDashboardData();

    return ResponseHandler.success(res, dashboardData);
  } catch (error) {
    logger.error('获取采购综合统计数据失败:', error);
    ResponseHandler.error(res, '获取采购综合统计数据失败', 'SERVER_ERROR', 500, error);
  }
};

// 更新采购订单物料收货数量
const updateOrderItemsReceived = async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return ResponseHandler.error(res, '缺少物料收货信息', 'VALIDATION_ERROR', 400);
    }

    const result = await PurchaseReceiveInspectionService.receiveWithIncomingInspection(id, items);

    return ResponseHandler.success(res, result, '收货并生成来料检验单成功');
  } catch (error) {
    logger.error('更新采购订单物料收货数量失败:', error);
    const statusCode = error.statusCode || 500;
    const errorCode =
      error.code || (statusCode === 400 ? 'VALIDATION_ERROR' : 'OPERATION_ERROR');
    const message = statusCode < 500 ? error.message : '收货并生成来料检验单失败';
    return ResponseHandler.error(res, message, errorCode, statusCode, error);
  }
};

// 收货并自动生成来料检验单
const receiveWithIncomingInspection = async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    const result = await PurchaseReceiveInspectionService.receiveWithIncomingInspection(
      id,
      items
    );

    return ResponseHandler.success(res, result, '收货并生成来料检验单成功');
  } catch (error) {
    logger.error('收货并生成来料检验单失败:', error);
    const statusCode = error.statusCode || 500;
    const errorCode =
      error.code || (statusCode === 400 ? 'VALIDATION_ERROR' : 'OPERATION_ERROR');
    const message = statusCode < 500 ? error.message : '收货并生成来料检验单失败';
    return ResponseHandler.error(res, message, errorCode, statusCode, error);
  }
};

/**
 * 获取物料的最新采购指导价 (Purchase Info Record)
 * 三级降级策略：供应商历史价 -> 全局历史价 -> 物料主数据预估价
 */
const resolveOrderMetalSnapshot = async (connection, payload = {}, items = []) => {
  const explicitMetalPrice = payload.metal_price ?? payload.metalPrice;
  const metalSymbol = payload.metal_symbol || payload.metalSymbol || items.find((item) => item.metal_symbol)?.metal_symbol || 'ALUMINUM';
  const metal =
    explicitMetalPrice !== undefined && explicitMetalPrice !== null && explicitMetalPrice !== ''
      ? {
          symbol: metalSymbol,
          price: Number(explicitMetalPrice),
          source: payload.metal_price_source || payload.metalPriceSource || 'MANUAL',
          last_update_at: payload.order_date || payload.orderDate || new Date(),
        }
      : await SupplierMetalRangePriceService.getCurrentMetalPrice(connection, metalSymbol);

  const itemMetal = items.find(
    (item) =>
      (item.metal_price !== null && item.metal_price !== undefined) || item.metal_price_scheme_id
  );
  return {
    metal_symbol: metal?.symbol || itemMetal?.metal_symbol || metalSymbol || null,
    metal_price: metal?.price ?? itemMetal?.metal_price ?? null,
    metal_price_source: metal?.source || itemMetal?.metal_price_source || payload.metal_price_source || null,
    metal_price_date: (metal?.last_update_at ? new Date(metal.last_update_at).toISOString().slice(0, 10) : null) || payload.order_date || null,
    metal_price_scheme_id: payload.metal_price_scheme_id || itemMetal?.metal_price_scheme_id || null,
  };
};

const getLatestPrice = async (req, res) => {
  try {
    const { material_id, material_code, supplier_id } = req.query;

    if (!material_id && !material_code) {
      return ResponseHandler.error(res, '缺少必要参数 (物料编码或物料ID)', 'VALIDATION_ERROR', 400);
    }

    const price = await PurchasePriceService.resolvePurchasePrice(pool, {
      materialId: material_id,
      materialCode: material_code,
      supplierId: supplier_id,
    });

    return ResponseHandler.success(res, price, 'latest purchase price loaded');
  } catch (error) {
    logger.error('获取最新指导价失败:', error);
    return ResponseHandler.error(res, 'failed to load latest price', 'SERVER_ERROR', 500, error);
  }
};

const getLatestPrices = async (req, res) => {
  try {
    const { material_ids = [], supplier_id } = req.body || {};
    const materialIds = [...new Set((Array.isArray(material_ids) ? material_ids : [])
      .map((id) => Number(id))
      .filter(Number.isInteger))];

    if (materialIds.length === 0) {
      return ResponseHandler.error(res, '缺少有效的物料ID数组', 'VALIDATION_ERROR', 400);
    }
    if (materialIds.length > 100) {
      return ResponseHandler.error(res, 'batch query cannot exceed 100 materials', 'VALIDATION_ERROR', 400);
    }

    const prices = await PurchasePriceService.resolvePurchasePrices(
      pool,
      materialIds.map((id) => ({ materialId: id, supplierId: supplier_id }))
    );
    const resultMap = {};
    prices.forEach((price, index) => {
      resultMap[String(materialIds[index])] = price;
    });

    return ResponseHandler.success(res, resultMap, 'latest prices loaded');
  } catch (error) {
    logger.error('批量获取最新指导价失败:', error);
    return ResponseHandler.error(res, 'failed to load latest prices', 'SERVER_ERROR', 500, error);
  }
};

module.exports = {
  getOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder,
  updateOrderStatus,
  batchUpdateOrderStatus,
  updateOrderItemsReceived,
  receiveWithIncomingInspection,
  getStatistics,
  getPurchaseDashboardStats,
  getSuppliers,
  getRequisitions,
  getRequisition,
  getLatestPrice,
  getLatestPrices,
};
