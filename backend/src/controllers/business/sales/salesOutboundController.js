/**
 * salesOutboundController.js
 * @description 销售出库控制器
 * @version 1.1.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { mapKeysToSnake } = require('../../../utils/fieldMap');
const { logger } = require('../../../utils/logger');

const db = require('../../../config/db');
const { softDelete } = require('../../../utils/softDelete');
const SalesOrderStatusService = require('../../../services/business/SalesOrderStatusService');
const DomainEventService = require('../../../services/business/DomainEventService');
const SalesReturnEligibilityService = require('../../../services/business/SalesReturnEligibilityService');
const DBManager = require('../../../utils/dbManager');
const { getCurrentUserName } = require('../../../utils/userHelper');
const { SALES_OUTBOUND_TRANSITIONS } = require('../../../constants/statusRegistry');
const { getAuthenticatedUserId } = require('../../../utils/authContext');
const { parsePagination, appendPaginationSQL } = require('../../../utils/safePagination');
const { lineAmount, resolveLineUnitPrice } = require('../../../utils/money');
const { lockSalesOrders } = require('../../../utils/sales/salesOrderLocks');

const { STATUS, getConnection, generateSalesOutboundNo } = require('./salesShared');
const { salesOutboundMap, salesOutboundItemMap } = require('../../../utils/sales/salesFieldMap');

const createValidationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  return error;
};

const assertSalesOutboundOrderReferences = (
  items,
  { orderId, isMultiOrder, relatedOrders }
) => {
  const orderIds = isMultiOrder ? relatedOrders : [orderId];
  if (!Array.isArray(orderIds) || orderIds.length === 0 ||
      orderIds.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
    throw createValidationError('销售出库单缺少有效的关联订单，请重新选择销售订单');
  }

  const allowedOrderIds = new Set(orderIds.map(Number));
  for (const item of items) {
    const sourceOrderId = item.source_order_id || item.order_id || (!isMultiOrder ? orderId : null);
    if (!sourceOrderId) {
      throw createValidationError('多订单出库的每条明细必须指定来源订单');
    }
    if (!allowedOrderIds.has(Number(sourceOrderId))) {
      throw createValidationError(`明细来源订单${sourceOrderId}不在出库单的关联订单中`);
    }
  }
};

const assertOutboundInputLines = (items) => {
  if (!Array.isArray(items)) throw createValidationError('出库明细格式无效');
  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2147483647) {
      throw createValidationError('出库数量必须为非负整数，不能保存小数或超出范围的数量');
    }
    const rawPrice = item.unitPrice ?? item.unit_price ?? item.price;
    if (rawPrice !== undefined && rawPrice !== null && rawPrice !== '') {
      const price = Number(rawPrice);
      if (!Number.isFinite(price) || price < 0 || Math.round(price * 10000) / 10000 !== price) {
        throw createValidationError('出库单价必须为非负金额，最多保留四位小数');
      }
    }
  }
};

const assertSalesOutboundQuantities = async (
  connection,
  items = [],
  { orderId = null, isMultiOrder = false, outboundId = null, status = 'draft' } = {}
) => {
  if (['draft', 'cancelled', 'reversed'].includes(status)) return;
  if (!Array.isArray(items) || items.length === 0) {
    throw createValidationError('销售出库单必须包含有效明细');
  }

  const quantities = new Map();
  for (const item of items) {
    const materialId = item.material_id || item.product_id;
    const sourceOrderId = item.source_order_id || item.order_id || (!isMultiOrder ? orderId : null);
    const outboundQty = Number(item.quantity);

    if (!materialId || !Number.isSafeInteger(outboundQty) || outboundQty <= 0) {
      throw createValidationError('销售出库明细必须选择物料，数量必须为正整数');
    }

    if (!sourceOrderId) {
      throw createValidationError('销售出库明细缺少来源订单');
    }
    const key = `${sourceOrderId}:${materialId}`;
    const group = quantities.get(key) || { sourceOrderId, materialId, outboundQty: 0 };
    group.outboundQty += outboundQty;
    quantities.set(key, group);
  }

  // 同一订单的并发出库共用订单行锁；按 ID 顺序加锁，避免多单交叉锁定。
  const orderIds = [...new Set([...quantities.values()].map(item => Number(item.sourceOrderId)))].sort((a, b) => a - b);
  await connection.query('SELECT id FROM sales_orders WHERE id IN (?) AND deleted_at IS NULL ORDER BY id FOR UPDATE', [orderIds]);

  for (const { sourceOrderId, materialId, outboundQty } of quantities.values()) {

    const [orderRows] = await connection.query(
      `SELECT COALESCE(SUM(soi.quantity), 0) AS quantity
       FROM sales_order_items soi
       JOIN sales_orders so ON soi.order_id = so.id AND so.deleted_at IS NULL
       WHERE soi.order_id = ? AND soi.material_id = ?
       FOR UPDATE`,
      [sourceOrderId, materialId]
    );

    if (orderRows.length === 0 || Number(orderRows[0].quantity) <= 0) {
      throw createValidationError(`销售订单${sourceOrderId}中不存在物料${materialId}`);
    }

    const params = [materialId, sourceOrderId];
    let excludeClause = '';
    if (outboundId) {
      excludeClause = ' AND sob.id <> ?';
      params.push(outboundId);
    }

    const [shippedRows] = await connection.query(
      `SELECT COALESCE(SUM(sobi.quantity), 0) AS shipped_qty
       FROM sales_outbound_items sobi
       JOIN sales_outbound sob ON sob.id = sobi.outbound_id
       WHERE sob.deleted_at IS NULL
         AND sob.status IN ('processing', 'completed')
         AND sobi.product_id = ?
         AND COALESCE(sobi.source_order_id, sob.order_id) = ?
         ${excludeClause} FOR UPDATE`,
      params
    );

    const orderedQty = parseFloat(orderRows[0].quantity) || 0;
    const shippedQty = parseFloat(shippedRows[0]?.shipped_qty) || 0;
    const remainingQty = Math.max(0, orderedQty - shippedQty);

    if (outboundQty > remainingQty + 0.0001) {
      throw createValidationError(`销售出库数量超过订单未出库数量：订单${sourceOrderId}，物料${materialId}，订购${orderedQty}，已出库${shippedQty}，可出库${remainingQty}，本次${outboundQty}`);
    }
  }
};

exports.getSalesOutbound = async (req, res) => {
  try {
    const { page = 1, pageSize = 50, search, startDate, endDate, status } = req.query;
    const pagination = parsePagination(page, pageSize, { maxPageSize: 100, defaultPageSize: 50 });

    const connection = await db.pool.getConnection();

    try {
      const ScopeGuard = require('../../../authorization/ScopeGuard');
      const scopeClause = await ScopeGuard.applyListScope(req, 'sales_outbound', {
        tableAlias: 'so',
        ownerAlias: 'sales_outbound_owner_scope',
        accessMode: 'read',
      });

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

      whereClause += scopeClause.where;
      queryParams.push(...scopeClause.params);

      // 查询总数
      const countQuery = `
        SELECT COUNT(*) as total
        FROM sales_outbound so
        LEFT JOIN sales_orders o ON so.order_id = o.id AND o.deleted_at IS NULL
        LEFT JOIN customers c ON o.customer_id = c.id
        ${scopeClause.join}
        WHERE so.deleted_at IS NULL ${whereClause}
      `;

      const [countResult] = await connection.query(countQuery, queryParams);
      const total = parseInt(countResult[0].total) || 0;

      const query = appendPaginationSQL(
        `
        SELECT so.*, o.order_no, o.contract_code, o.customer_id, c.name as customer_name
        FROM sales_outbound so
        LEFT JOIN sales_orders o ON so.order_id = o.id AND o.deleted_at IS NULL
        LEFT JOIN customers c ON o.customer_id = c.id
        ${scopeClause.join}
        WHERE so.deleted_at IS NULL ${whereClause}
        ORDER BY so.created_at DESC
      `,
        pagination.limit,
        pagination.offset
      );

      const [results] = await connection.query(query, queryParams);

      const relatedIdsByOutboundId = new Map();
      const allRelatedOrderIds = new Set();
      for (const outbound of results) {
        if (!outbound.is_multi_order || !outbound.related_orders) continue;
        try {
          const relatedOrderIds = Array.isArray(outbound.related_orders)
            ? outbound.related_orders
            : JSON.parse(outbound.related_orders);
          const cleanIds = [...new Set((relatedOrderIds || []).map(Number).filter(Number.isInteger))];
          relatedIdsByOutboundId.set(outbound.id, cleanIds);
          cleanIds.forEach((id) => allRelatedOrderIds.add(id));
        } catch (error) {
          logger.error('处理多订单出库关联订单ID失败:', error);
        }
      }
      if (allRelatedOrderIds.size > 0) {
        const relatedIds = [...allRelatedOrderIds];
        const relatedPlaceholders = relatedIds.map(() => '?').join(',');
        const [relatedOrders] = await connection.query(
          `
          SELECT so.id, so.order_no, c.name as customer_name
          FROM sales_orders so
          LEFT JOIN customers c ON so.customer_id = c.id
          WHERE so.deleted_at IS NULL AND so.id IN (${relatedPlaceholders})
          `,
          relatedIds
        );
        const relatedOrderMap = new Map(relatedOrders.map((order) => [Number(order.id), order]));
        for (const outbound of results) {
          const relatedOrderIds = relatedIdsByOutboundId.get(outbound.id) || [];
          const relatedDetails = relatedOrderIds.map((id) => relatedOrderMap.get(Number(id))).filter(Boolean);
          outbound.related_order_details = relatedDetails;
          outbound.order_nos = relatedDetails.map((order) => order.order_no).join(', ');
          const customerNames = [...new Set(relatedDetails.map((order) => order.customer_name).filter(Boolean))];
          if (customerNames.length === 1) outbound.customer_name = customerNames[0];
          else if (customerNames.length > 1) outbound.customer_name = `多个客户 (${customerNames.length}个)`;
        }
      }


      // 统计不同状态的数量
      const statusQuery = `
        SELECT status, COUNT(*) as count
        FROM sales_outbound
        WHERE deleted_at IS NULL
        GROUP BY status
      `;

      const [statusCounts] = await connection.query(statusQuery);


      const statusStats = {
        total: total,
        draftCount: 0,
        pendingCount: 0,
        processingCount: 0,
        completedCount: 0,
        cancelledCount: 0,
      };

      statusCounts.forEach((item) => {
        const count = Number(item.count) || 0;
        if (item.status === 'draft') statusStats.draftCount = count;
        if (item.status === 'pending' || item.status === 'confirmed') statusStats.pendingCount += count;
        if (item.status === 'processing') statusStats.processingCount = count;
        if (item.status === STATUS.OUTBOUND.COMPLETED) statusStats.completedCount = count;
        if (item.status === STATUS.OUTBOUND.CANCELLED) statusStats.cancelledCount = count;
      });

      // 出参统一 camelCase（salesOutboundMap）
      ResponseHandler.success(
        res,
        {
          list: (results || []).map((row) => salesOutboundMap.toApi(row)),
          total,
          page: pagination.page,
          pageSize: pagination.pageSize,
          statusStats,
        },
        '获取销售出库单成功'
      );
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('获取销售出库单列表失败:', error);
    ResponseHandler.error(res, '获取销售出库单列表失败', 'SERVER_ERROR', 500);
  }
};

exports.getSalesOutboundStatistics = async (req, res) => {
  let connection;
  try {
    connection = await db.pool.getConnection();
    const [rows] = await connection.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM sales_outbound
      WHERE deleted_at IS NULL
    `);
    const stats = rows[0] || {};
    ResponseHandler.success(res, {
      total: Number(stats.total) || 0,
      draft: Number(stats.draft) || 0,
      processing: Number(stats.processing) || 0,
      completed: Number(stats.completed) || 0,
      cancelled: Number(stats.cancelled) || 0,
    }, '获取销售出库统计成功');
  } catch (error) {
    logger.error('获取销售出库统计失败', error);
    ResponseHandler.error(res, '获取销售出库统计失败', 'SERVER_ERROR', 500, error);
  } finally {
    if (connection) connection.release();
  }
};

exports.getSalesOutboundById = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    connection = await getConnection();

    const ScopeGuard = require('../../../authorization/ScopeGuard');
    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'sales_outbound', id, '无权访问该销售出库单', { accessMode: 'read' }))) {
      return;
    }

    // 查询出库单主信息
    const query = `
      SELECT so.*, o.order_no, o.contract_code, o.customer_id, c.name as customer_name, c.contact_person, c.contact_phone
      FROM sales_outbound so
      LEFT JOIN sales_orders o ON so.order_id = o.id AND o.deleted_at IS NULL
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE so.id = ? AND so.deleted_at IS NULL
    `;

    const [results] = await connection.query(query, [id]);

    if (results.length === 0) {
      return ResponseHandler.notFound(res, '出库单不存在');
    }

    const outbound = results[0];

    // 查询明细数据
    const itemsQuery = `
      SELECT soi.id, soi.outbound_id, soi.product_id, soi.unit_id, soi.quantity, soi.price, soi.amount,
             soi.source_order_id, soi.source_order_no
      FROM sales_outbound_items soi
      WHERE soi.outbound_id = ?
    `;

    const [itemsResult] = await connection.query(itemsQuery, [id]);

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
      const unitIds = Array.from(new Set(
        materialsResult.map((m) => m.unit_id)
          .concat(itemsResult.map((i) => i.unit_id))
          .filter((id) => id !== null && id !== undefined)
      ));

      let unitsResult = [];
      if (unitIds.length > 0) {
        const unitsQuery = `
          SELECT id, name
          FROM units
          WHERE id IN (?)
        `;

        [unitsResult] = await connection.query(unitsQuery, [unitIds]);
      }

      const availability = new Map();
      const sourceIds = [...new Set(itemsResult.map(item => item.source_order_id || outbound.order_id).filter(Boolean))];
      const deliveryQuotas = new Map();
      if (sourceIds.length) {
        const [ordered] = await connection.query(
          'SELECT order_id, material_id, SUM(quantity) AS quantity FROM sales_order_items WHERE order_id IN (?) GROUP BY order_id, material_id', [sourceIds]
        );
        const [delivered] = await connection.query(
          `SELECT COALESCE(i.source_order_id,o.order_id) AS order_id, i.product_id, SUM(i.quantity) AS quantity
             FROM sales_outbound_items i JOIN sales_outbound o ON o.id=i.outbound_id
            WHERE COALESCE(i.source_order_id,o.order_id) IN (?) AND o.id<>?
              AND o.deleted_at IS NULL AND o.status IN ('processing','completed')
            GROUP BY COALESCE(i.source_order_id,o.order_id), i.product_id`, [sourceIds, id]
        );
        for (const row of ordered) deliveryQuotas.set(`${row.order_id}:${row.material_id}`, { ordered: Number(row.quantity), shipped: 0 });
        for (const row of delivered) {
          const quota = deliveryQuotas.get(`${row.order_id}:${row.product_id}`);
          if (quota) quota.shipped = Number(row.quantity);
        }
      }
      for (const sourceId of sourceIds) {
        const products = itemsResult.filter(item => Number(item.source_order_id || outbound.order_id) === Number(sourceId)).map(item => item.product_id);
        const quotas = await SalesReturnEligibilityService.getAvailability(connection, {
          orderId: sourceId, outboundId: outbound.id, productIds: products,
        });
        for (const [productId, quota] of quotas) availability.set(`${sourceId}:${productId}`, quota);
      }

      const SalesOutboundValuationService = require('../../../services/business/SalesOutboundValuationService');
      const valuedItems = new Map((await SalesOutboundValuationService.getItems(connection, [id])).map(item => [Number(item.id), item]));
      const items = itemsResult.map((item) => {
        const material = materialsResult.find((m) => m.id === item.product_id) || {};
        const effectiveUnitId = item.unit_id || material.unit_id;
        const unit = effectiveUnitId ? unitsResult.find((u) => u.id === effectiveUnitId) : null;
        const sourceOrderId = item.source_order_id || outbound.order_id;
        const deliveryQuota = deliveryQuotas.get(`${sourceOrderId}:${item.product_id}`);
        const quota = availability.get(`${sourceOrderId}:${item.product_id}`);
        const returnedQty = Math.min(Number(item.quantity), quota?.outboundReturnedQuantity || 0);
        const returnableQty = outbound.status === 'completed'
          ? Math.min(Number(item.quantity) - returnedQty, quota?.availableQuantity || 0) : 0;
        if (quota) {
          quota.outboundReturnedQuantity -= returnedQty;
          quota.availableQuantity -= returnableQty;
        }

        // 内部仍用 snake 组装，最后经 salesOutboundItemMap.toApi 输出
        return {
          id: item.id,
          outbound_id: item.outbound_id,
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.price,
          amount: item.amount,
          tax_percent: valuedItems.get(Number(item.id))?.tax_percent ?? 0,
          tax_amount: valuedItems.get(Number(item.id))?.tax_amount ?? 0,
          total_amount: valuedItems.get(Number(item.id))?.total_amount ?? item.amount,
          source_order_id: sourceOrderId,
          source_order_no: item.source_order_no,
          returned_quantity: returnedQty,
          returnable_quantity: Math.max(0, returnableQty),
          ordered_quantity: deliveryQuota?.ordered ?? 0,
          shipped_quantity: deliveryQuota?.shipped ?? 0,
          remaining_quantity: Math.max(0, (deliveryQuota?.ordered ?? 0) - (deliveryQuota?.shipped ?? 0)),
          material_name: material.name,
          material_code: material.code,
          specification: material.specs,
          unit_name: unit ? unit.name : null,
          unit_id: effectiveUnitId,
        };
      });

      outbound.items = items.map((item) => {
        const apiItem = salesOutboundItemMap.toApi(item);
        // 展示名：未知物料兜底
        if (!apiItem.materialName) {
          apiItem.materialName = `未知物料(ID:${apiItem.productId})`;
          apiItem.productName = apiItem.materialName;
        }
        if (!apiItem.materialCode) {
          apiItem.materialCode = '未知代码';
          apiItem.productCode = '未知代码';
        }
        return apiItem;
      });
    } else {
      outbound.items = [];
    }

    if (outbound.is_multi_order && outbound.related_orders) {
      try {
        let relatedOrderIds = [];
        const rawValue = outbound.related_orders;

        if (typeof rawValue === 'string') {
          // 尝试直接 JSON 解析
          try {
            relatedOrderIds = JSON.parse(rawValue);
          } catch {
            // 如果 JSON 解析失败，尝试解析逗号分隔的 ID 列表
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
          } catch {
            relatedOrderIds = stringValue
              .split(',')
              .map((id) => parseInt(id.trim()))
              .filter((id) => !isNaN(id));
          }
        } else {
          const stringValue = String(rawValue);
          try {
            relatedOrderIds = JSON.parse(stringValue);
          } catch {
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
        logger.error('解析关联订单信息失败:', error, '原始值', outbound.related_orders);
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

    // 详情出参：主表 + 已是 camel 的 items
    const payload = salesOutboundMap.toApi(outbound);
    payload.items = outbound.items || [];
    return ResponseHandler.success(res, payload);
  } catch (error) {
    logger.error('获取销售出库单详情失败:', error);
    ResponseHandler.error(res, '获取销售出库单详情失败', 'SERVER_ERROR', 500, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};


exports.createSalesOutbound = async (req, res) => {
  let connection;

  try {
    // HTTP camel → 内部 snake（唯一入参边界，不再吸收 snake 顶层键）
    if (req.body?.items !== undefined) assertOutboundInputLines(req.body.items);
    const mapped = salesOutboundMap.fromApi(req.body || {});
    const order_id = mapped.order_id ?? null;
    const is_multi_order = Boolean(mapped.is_multi_order);
    let related_orders = mapped.related_orders ?? [];
    const delivery_date = mapped.delivery_date;
    const status = mapped.status;
    const remarks = mapped.remarks;
    const items = Array.isArray(mapped.items) ? mapped.items : [];

    if (typeof related_orders === 'string') {
      try {
        related_orders = JSON.parse(related_orders);
      } catch (error) {
        logger.error('解析related_orders JSON失败:', error);
        return ResponseHandler.error(res, '无效的关联订单格式', 'VALIDATION_ERROR', 400);
      }
    }
    if (!Array.isArray(related_orders)) related_orders = [];
    const created_by = getAuthenticatedUserId(req);

    // 创建仅允许 draft；完成扣库必须走更新为 completed 路径
    if (status && status !== 'draft') {
      return ResponseHandler.error(
        res,
        '创建销售出库单仅允许 draft，完成发货请通过更新状态为 completed',
        'VALIDATION_ERROR',
        400
      );
    }
    const createStatus = 'draft';

    assertSalesOutboundOrderReferences(items, {
      orderId: order_id,
      isMultiOrder: is_multi_order,
      relatedOrders: related_orders,
    });

    logger.debug('Sales outbound create payload normalized', {
      orderId: order_id,
      relatedOrderCount: related_orders.length,
      isMultiOrder: Boolean(is_multi_order),
      deliveryDate: delivery_date,
      status: createStatus,
      hasRemarks: Boolean(remarks),
      itemCount: items?.length || 0,
    });

    // 验证日期格式转换
    let formattedDeliveryDate;
    try {
      if (delivery_date) {
        formattedDeliveryDate = new Date(delivery_date).toISOString().split('T')[0];
      } else {
        formattedDeliveryDate = new Date().toISOString().split('T')[0];
      }
    } catch (error) {
      logger.error('日期格式转换错误:', error);
      return ResponseHandler.error(res, '无效的日期格式', 'VALIDATION_ERROR', 400);
    }

    connection = await DBManager.getConnection();
    await connection.beginTransaction();

    const duplicateCheckQuery = `
      SELECT id, outbound_no, status, created_at
      FROM sales_outbound
      WHERE order_id = ?
        AND status = 'draft'
        AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const [recentDrafts] = await connection.query(duplicateCheckQuery, [order_id]);

    if (recentDrafts.length > 0) {
      await connection.rollback();

      logger.warn('业务检查：检测到已存在草稿出库单，拒绝创建', {
        order_id,
        existing_outbound: recentDrafts[0].outbound_no,
        existing_status: recentDrafts[0].status,
        created_at: recentDrafts[0].created_at,
        request_user: created_by,
        reason: '已存在草稿出库单',
      });

      return ResponseHandler.error(res, `该订单已存在草稿状态的出库单 ${recentDrafts[0].outbound_no}。请先完成或取消现有出库单，再创建新的出库单。`, 'CONFLICT', 409);
    }

    logger.info('幂等性检查通过，开始创建出库单', { order_id, created_by });

    if (is_multi_order) {
      if (!related_orders || related_orders.length === 0) {
        await connection.rollback();
        return ResponseHandler.error(res, '多订单模式下必须提供关联订单列表', 'VALIDATION_ERROR', 400);
      }

      const [orderCheck] = await connection.query(
        'SELECT id, order_no, customer_id FROM sales_orders WHERE id IN (?) AND deleted_at IS NULL',
        [related_orders]
      );

      if (orderCheck.length !== related_orders.length) {
        await connection.rollback();
        return ResponseHandler.error(res, '部分关联订单不存在', 'VALIDATION_ERROR', 400);
      }

      // 一张出库单对应一个往来客户，避免财务归属不明确。
      const customerIds = [...new Set(orderCheck.map((order) => order.customer_id))];
      if (customerIds.length > 1) {
        throw createValidationError('同一出库单的来源订单必须属于同一客户');
      }
    } else {
      // 单订单模式：验证单个订单存在
      if (order_id) {
        const [orderCheck] = await connection.query('SELECT id FROM sales_orders WHERE id = ? AND deleted_at IS NULL', [
          order_id,
        ]);

        if (orderCheck.length === 0) {
          await connection.rollback();
          return ResponseHandler.error(res, '关联的订单不存在', 'VALIDATION_ERROR', 400);
        }
      }
    }

    const outboundNo = await generateSalesOutboundNo(connection);

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
      createStatus,
      remarks,
      created_by,
    ]);

    const outboundId = result.insertId;

    if (items && items.length > 0) {
      // 验证物料是否存在于 materials 表中
      const materialIds = items.map((item) => item.material_id || item.product_id).filter(Boolean);

      if (materialIds.length > 0) {
        try {
          // 安全处理 IN 查询，当只有一个 ID 时，直接使用等于
          let materialsQuery;
          let materialsParams;

          if (materialIds.length === 1) {
            materialsQuery = 'SELECT id, code, name FROM materials WHERE id = ? AND deleted_at IS NULL';
            materialsParams = [materialIds[0]];
          } else {
            materialsQuery = 'SELECT id, code, name FROM materials WHERE id IN (?) AND deleted_at IS NULL';
            materialsParams = [materialIds];
          }


          const [materialCheck] = await connection.query(materialsQuery, materialsParams);

          const validMaterialIds = materialCheck.map((m) => m.id);

          // 查找无效的物料ID
          const invalidMaterialIds = materialIds.filter((id) => !validMaterialIds.includes(id));
          if (invalidMaterialIds.length > 0) {
            throw createValidationError(`销售出库物料不存在或已删除: ${invalidMaterialIds.join(',')}`);
          }

          const validItems = items.filter((item) => {
            const materialId = item.material_id || item.product_id;
            return validMaterialIds.includes(materialId);
          });

          if (validItems.length === 0) {
            throw new Error('销售出库单没有有效物料明细');
          } else {
            await assertSalesOutboundQuantities(connection, validItems, {
              orderId: order_id,
              isMultiOrder: is_multi_order,
              status: createStatus,
            });

            const detailQuery = `
                INSERT INTO sales_outbound_items (
                  outbound_id, product_id, quantity, price, amount, source_order_id, source_order_no
                ) VALUES ?
              `;

              const detailValues = [];

              const orderPriceMap = {};
              const sourceOrderIds = [
                ...new Set(
                  validItems
                    .map((item) => item.source_order_id || item.order_id || order_id)
                    .filter(Boolean)
                ),
              ];
              if (sourceOrderIds.length > 0) {
                const [orderItems] = await connection.query(
                  `SELECT soi.order_id, soi.material_id, ROUND(SUM(soi.quantity * soi.unit_price) / NULLIF(SUM(soi.quantity),0),4) AS unit_price
                   FROM sales_order_items soi
                   JOIN sales_orders so ON soi.order_id = so.id AND so.deleted_at IS NULL
                   WHERE soi.order_id IN (?) GROUP BY soi.order_id, soi.material_id`,
                  [sourceOrderIds]
                );
                orderItems.forEach((oi) => {
                  const price = parseFloat(oi.unit_price) || 0;
                  orderPriceMap[`${oi.order_id}:${oi.material_id}`] = price;
                  if (!orderPriceMap[oi.material_id]) {
                    orderPriceMap[oi.material_id] = price;
                  }
                });
              }

              for (const item of validItems) {
                const materialId = item.material_id || item.product_id;

                const sourceOrderId = item.source_order_id || item.order_id || order_id || null;
                const unitPrice = resolveLineUnitPrice(item, orderPriceMap[`${sourceOrderId}:${materialId}`] ?? 0);
                const amount = lineAmount(item.quantity, unitPrice);

                detailValues.push([
                  outboundId,
                  materialId,
                  item.quantity,
                  unitPrice,
                  amount,
                  sourceOrderId,
                  item.source_order_no || item.order_no || null,
                ]);
              }

              if (detailValues.length > 0) {
                try {
                  await connection.query(detailQuery, [detailValues]);
                } catch (insertError) {
                  logger.error('插入明细数据失败:', insertError);
                  throw new Error('插入明细数据失败: ' + insertError.message, {
                    cause: insertError,
                  });
                }
              }
          }
        } catch (error) {
          logger.error('验证物料ID或插入明细时出错:', error);
          throw new Error(`验证物料ID或插入明细时出错: ${error.message}`, {
            cause: error,
          });
        }
      } else {
        throw new Error('销售出库单没有有效物料明细');
      }
    } else if (status && status !== 'draft') {
      throw new Error('非草稿销售出库单必须包含物料明细');
    }

    await connection.query(
      'UPDATE sales_outbound SET total_amount = (SELECT COALESCE(SUM(amount), 0) FROM sales_outbound_items WHERE outbound_id = ?) WHERE id = ?',
      [outboundId, outboundId]
    );

    // 标准业务链：销售订单 → 销售出库（类型 SSOT）
    if (order_id) {
      const DocumentChainService = require('../../../services/business/DocumentChainService');
      const [[orderRow]] = await connection.query(
        'SELECT order_no FROM sales_orders WHERE id = ? AND deleted_at IS NULL',
        [order_id]
      );
      await DocumentChainService.linkSalesOrderToOutbound(
        {
          orderId: order_id,
          orderNo: orderRow?.order_no || null,
          outboundId,
          outboundNo,
        },
        created_by,
        connection
      );
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        message: '销售出库单创建成功',
        id: outboundId,
        outboundNo,
      },
      '创建成功',
      201
    );
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('创建销售出库单失败:', error);
    ResponseHandler.error(
      res,
      error.message || '创建销售出库单失败',
      (error.cause?.code || error.code) || 'SERVER_ERROR',
      (error.cause?.statusCode || error.statusCode) || 500,
      error.cause?.statusCode ? error.cause : error
    );
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
    } = mapKeysToSnake(req.body || {});

    if (items !== undefined) assertOutboundInputLines(items);
    if (delivery_date && !Number.isFinite(new Date(delivery_date).getTime())) throw createValidationError('无效的出库日期');

    logger.debug('Sales outbound update payload normalized', {
      id,
      orderId: order_id,
      relatedOrderCount: Array.isArray(related_orders) ? related_orders.length : 0,
      isMultiOrder: Boolean(is_multi_order),
      status,
      hasRemarks: Boolean(remarks),
      itemCount: Array.isArray(items) ? items.length : 0,
    });

    // 转换日期格式为YYYY-MM-DD
    let formattedDeliveryDate = delivery_date
      ? new Date(delivery_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    connection = await getConnection();

    const ScopeGuard = require('../../../authorization/ScopeGuard');
    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'sales_outbound', id, '无权修改该销售出库单'))) {
      return;
    }

    await connection.beginTransaction();

    // 1. 检查出库单是否存在并获取当前状态和明细
    const [sourceOrders] = await connection.query(
      'SELECT DISTINCT COALESCE(i.source_order_id,o.order_id) AS order_id FROM sales_outbound o LEFT JOIN sales_outbound_items i ON i.outbound_id=o.id WHERE o.id=?', [id]
    );
    const lockedOrderIds = await lockSalesOrders(connection, [
      ...sourceOrders.map(row => row.order_id), order_id,
      ...(Array.isArray(related_orders) ? related_orders : []),
      ...(Array.isArray(items) ? items.map(item => item.source_order_id || item.order_id) : []),
    ]);
    const [outboundCheck] = await connection.query('SELECT id, outbound_no, order_id, delivery_date, status, remarks, created_by, created_at, updated_at, is_multi_order, related_orders, deleted_at, total_amount FROM sales_outbound WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [
      id,
    ]);

    if (outboundCheck.length === 0) {
      await connection.rollback();
      return ResponseHandler.notFound(res, '出库单不存在');
    }

    const currentOutbound = outboundCheck[0];
    if (!delivery_date) formattedDeliveryDate = currentOutbound.delivery_date;

    if (['completed', 'reversed', 'cancelled'].includes(currentOutbound.status)) {
      // 重试同一状态只读取结果，不再改写主表、明细或财务事件。
      if (status === currentOutbound.status && Object.keys(req.body || {}).every(key => key === 'status')) {
        await connection.commit();
        return ResponseHandler.success(res, salesOutboundMap.toApi(currentOutbound), '出库单状态未变化');
      }
      await connection.rollback();
      return ResponseHandler.error(res, '已完成、已冲销或已取消的出库单不可修改；已完成单据请通过冲销流程处理', 'OUTBOUND_IMMUTABLE', 409);
    }

    // 获取当前明细
    const [currentItems] = await connection.query(
      'SELECT id, outbound_id, product_id, unit_id, quantity, price, amount, remarks, source_order_id, source_order_no FROM sales_outbound_items WHERE outbound_id = ?',
      [id]
    );

    const validTransitions = SALES_OUTBOUND_TRANSITIONS;

    if (
      status &&
      status !== currentOutbound.status &&
      !validTransitions[currentOutbound.status]?.includes(status)
    ) {
      await connection.rollback();
      return ResponseHandler.error(res, `当前状态 "${currentOutbound.status}" 不能转换为 "${status}"`, 'VALIDATION_ERROR', 400);
    }

    let finalOrderId = order_id;
    let finalRelatedOrders = related_orders;
    let finalIsMultiOrder = is_multi_order;

    if (finalIsMultiOrder) {
      if (!finalRelatedOrders || finalRelatedOrders.length === 0) {
        await connection.rollback();
        return ResponseHandler.error(res, '多订单模式下必须提供关联订单列表', 'VALIDATION_ERROR', 400);
      }

      const [orderCheck] = await connection.query('SELECT id, customer_id FROM sales_orders WHERE id IN (?) AND deleted_at IS NULL', [
        finalRelatedOrders,
      ]);

      if (orderCheck.length !== finalRelatedOrders.length) {
        await connection.rollback();
        return ResponseHandler.error(res, '部分关联订单不存在', 'VALIDATION_ERROR', 400);
      }

      if (new Set(orderCheck.map(order => order.customer_id)).size > 1) throw createValidationError('同一出库单的来源订单必须属于同一客户');

      finalOrderId = null; // 多订单时主订单ID为空
    } else {
      if (finalOrderId) {
        const [orderCheck] = await connection.query('SELECT id FROM sales_orders WHERE id = ? AND deleted_at IS NULL', [
          finalOrderId,
        ]);

        if (orderCheck.length === 0) {
          await connection.rollback();
          return ResponseHandler.error(res, '关联的订单不存在', 'VALIDATION_ERROR', 400);
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
              // 尝试直接 JSON 解析
              try {
                finalRelatedOrders = JSON.parse(rawValue);
              } catch {
                // 如果 JSON 解析失败，尝试解析逗号分隔的 ID 列表
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
              } catch {
                finalRelatedOrders = stringValue
                  .split(',')
                  .map((id) => parseInt(id.trim()))
                  .filter((id) => !isNaN(id));
              }
            } else {
              const stringValue = String(rawValue);
              try {
                finalRelatedOrders = JSON.parse(stringValue);
              } catch {
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
              '原始值',
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
      WHERE id = ? AND deleted_at IS NULL
    `;

    const finalStatus = status || currentOutbound.status;
    const finalRemarks = remarks ?? currentOutbound.remarks;
    if (items !== undefined && (!Array.isArray(items) || items.length === 0)) {
      throw createValidationError('销售出库明细不能为空');
    }
    const quantityCheckItems = items === undefined ? currentItems : items;

    if (quantityCheckItems.some(item => {
      const sourceId = Number(item.source_order_id || item.order_id || finalOrderId);
      return sourceId > 0 && !lockedOrderIds.has(sourceId);
    })) {
      const error = createValidationError('出库来源已被其他操作更新，请刷新单据后重试');
      error.statusCode = 409;
      throw error;
    }

    if (![STATUS.OUTBOUND.CANCELLED, 'reversed'].includes(finalStatus)) {
      assertSalesOutboundOrderReferences(quantityCheckItems, {
        orderId: finalOrderId,
        isMultiOrder: finalIsMultiOrder,
        relatedOrders: finalRelatedOrders,
      });
    }

    await assertSalesOutboundQuantities(connection, quantityCheckItems, {
      orderId: finalOrderId,
      isMultiOrder: finalIsMultiOrder,
      outboundId: id,
      status: finalStatus,
    });

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
      // 验证物料是否存在于 materials 表中
      const materialIds = items.map((item) => item.material_id || item.product_id).filter(Boolean);

      if (materialIds.length > 0) {
        // 检查 ID 是否存在于 materials 表中
        const [materialCheck] = await connection.query(
          'SELECT id, code, name FROM materials WHERE id IN (?) AND deleted_at IS NULL',
          [materialIds]
        );

        const validMaterialIds = materialCheck.map((m) => m.id);

        const validItems = items.filter((item) => {
          const materialId = item.material_id || item.product_id;
          return validMaterialIds.includes(materialId);
        });

        if (validItems.length !== items.length) {
          throw createValidationError('销售出库单包含不存在的物料明细');
        } else {
          // 删除原有明细
          await connection.query('DELETE FROM sales_outbound_items WHERE outbound_id = ?', [id]);

          const detailQuery = `
              INSERT INTO sales_outbound_items (
                outbound_id, product_id, quantity, price, amount, source_order_id, source_order_no
              ) VALUES ?
            `;

            const detailValues = [];
            const orderPriceMap = {};
            const sourceOrderIds = [
              ...new Set(
                validItems
                  .map((item) => item.source_order_id || item.order_id || finalOrderId)
                  .filter(Boolean)
              ),
            ];
            if (sourceOrderIds.length > 0) {
              const [orderItems] = await connection.query(
                `SELECT soi.order_id, soi.material_id, ROUND(SUM(soi.quantity * soi.unit_price) / NULLIF(SUM(soi.quantity),0),4) AS unit_price
                 FROM sales_order_items soi
                 JOIN sales_orders so ON soi.order_id = so.id AND so.deleted_at IS NULL
                 WHERE soi.order_id IN (?) GROUP BY soi.order_id, soi.material_id`,
                [sourceOrderIds]
              );
              orderItems.forEach((oi) => {
                const price = parseFloat(oi.unit_price) || 0;
                orderPriceMap[`${oi.order_id}:${oi.material_id}`] = price;
                if (!orderPriceMap[oi.material_id]) {
                  orderPriceMap[oi.material_id] = price;
                }
              });
            }

            for (const item of validItems) {
              const materialId = item.material_id || item.product_id;
              const sourceOrderId = item.source_order_id || item.order_id || finalOrderId || null;

              const unitPrice = resolveLineUnitPrice(item, orderPriceMap[`${sourceOrderId}:${materialId}`] ?? 0);
              const amount = lineAmount(item.quantity, unitPrice);

              detailValues.push([
                id,
                materialId,
                item.quantity,
                unitPrice,
                amount,
                sourceOrderId,
                item.source_order_no || item.order_no || null,
              ]);
            }

          if (detailValues.length > 0) {
            await connection.query(detailQuery, [detailValues]);
          }
        }
      } else {
        throw new Error('销售出库单更新没有有效物料明细');
      }
    } else {
      // 确保原有明细存在
      if (currentItems.length === 0) {
        if (finalStatus === STATUS.OUTBOUND.COMPLETED) {
          throw new Error(`销售出库单 ${id} 没有明细，不能完成`);
        }
        logger.warn(`销售出库单 ${id} 没有提交明细，且当前也没有历史明细`);
      } else {
        logger.info(`销售出库单 ${id} 未提交明细，保留 ${currentItems.length} 条历史明细`);
      }
    }

    await connection.query(
      'UPDATE sales_outbound SET total_amount = (SELECT COALESCE(SUM(amount), 0) FROM sales_outbound_items WHERE outbound_id = ?) WHERE id = ?',
      [id, id]
    );
    const [[amountRow]] = await connection.query('SELECT total_amount FROM sales_outbound WHERE id = ?', [id]);
    const isJustCompleted = finalStatus === STATUS.OUTBOUND.COMPLETED && currentOutbound.status !== STATUS.OUTBOUND.COMPLETED;

    // 6. 如果状态变为 completed，处理库存和追溯
    if (isJustCompleted) {
      const ProductSalesTraceabilityService = require('../../../services/business/ProductSalesTraceabilityService');

      // 明细更新会重新插入；使用实际保存的明细 ID，保证每行库存记账独立幂等。
      const [savedItems] = items && items.length > 0
        ? await connection.query('SELECT * FROM sales_outbound_items WHERE outbound_id = ? ORDER BY id', [id])
        : [currentItems];
      const salesData = {
        outbound_id: id,
        outbound_no: currentOutbound.outbound_no,
        order_id: finalOrderId,
        delivery_date: formattedDeliveryDate,
        items: savedItems,
        operator: await getCurrentUserName(req),
        operator_id: getAuthenticatedUserId(req),
      };

      await ProductSalesTraceabilityService.handleProductSalesOutbound(salesData, connection);

      logger.info(`销售出库单 ${id} 完成，库存和追溯数据已处理`);

      // 注意: 销售成本分录由 FinanceIntegrationService.generateCostEntryFromSalesOutbound
      // 在 commit 后的 setImmediate 中统一生成，此处不再重复生成
    }

    logger.debug('状态更新信息', {
      finalIsMultiOrder,
      finalRelatedOrdersLength: finalRelatedOrders ? finalRelatedOrders.length : 0,
      finalRelatedOrders,
      finalOrderId,
      outboundId: id,
    });

    if (items && items.length > 0) {
      logger.info('Updating related sales order statuses from outbound materials');
      try {
        const results = await SalesOrderStatusService.updateOrderStatusByMaterials(
          items,
          connection
        );
        logger.info(`共更新了 ${results.length} 个订单的状态`);

        results.forEach((result) => {
          if (result.error) {
            logger.error(`订单 ${result.orderId} 状态更新失败: ${result.error}`);
          } else {
            logger.info(`订单 ${result.orderId} 状态: ${result.status} (${result.message})`);
          }
        });
      } catch (error) {
        logger.error('基于物料的订单状态更新失败', error);

        // 如果基于物料的更新失败，回退到原有逻辑
        if (finalIsMultiOrder && finalRelatedOrders && finalRelatedOrders.length > 0) {
          logger.info(
            `📦 回退：开始智能更新 ${finalRelatedOrders.length} 个订单状态 [${finalRelatedOrders.join(', ')}]`
          );
          const updateResults = await SalesOrderStatusService.updateMultipleOrderStatus(
            finalRelatedOrders,
            connection
          );
          updateResults.forEach((result) => {
            if (result.error) {
              logger.error(`订单 ${result.orderId} 状态更新失败: ${result.error}`);
            } else {
              logger.info(`订单 ${result.orderId} 状态: ${result.status} (${result.message})`);
            }
          });
        } else if (finalOrderId) {
          logger.info(`Fallback sales order status update started: orderId=${finalOrderId}`);
          try {
            const result = await SalesOrderStatusService.updateOrderStatus(
              finalOrderId,
              connection
            );
            logger.info(`订单 ${finalOrderId} 状态: ${result.status} (${result.message})`);
          } catch (error) {
            logger.error(`订单 ${finalOrderId} 状态更新失败`, error);
            throw error;
          }
        }
      }
    } else {
      // 没有物料信息时使用原有逻辑
      if (finalIsMultiOrder && finalRelatedOrders && finalRelatedOrders.length > 0) {
        logger.info(
          `Sales order status batch update started: count=${finalRelatedOrders.length}, orderIds=${finalRelatedOrders.join(',')}`
        );
        const updateResults = await SalesOrderStatusService.updateMultipleOrderStatus(
          finalRelatedOrders,
          connection
        );
        updateResults.forEach((result) => {
          if (result.error) {
            logger.error(`订单 ${result.orderId} 状态更新失败: ${result.error}`);
          } else {
            logger.info(`订单 ${result.orderId} 状态: ${result.status} (${result.message})`);
          }
        });
      } else if (finalOrderId) {
        logger.info(`Sales order status update started: orderId=${finalOrderId}`);
        try {
          const result = await SalesOrderStatusService.updateOrderStatus(finalOrderId, connection);
          logger.info(`订单 ${finalOrderId} 状态: ${result.status} (${result.message})`);
        } catch (error) {
          logger.error(`订单 ${finalOrderId} 状态更新失败`, error);
          throw error;
        }
      } else {
        logger.warn('没有找到需要更新状态的订单，跳过状态更新');
      }
    }

    // ========== 在事务内预先查好下游需要的数据（仅读取，不编排）==========
    let eventPayload = null;
    try {
      // 收集全部关联订单 ID（单订单 + 多订单 + 明细 source_order_id）
      const relatedOrderIdSet = new Set();
      if (finalOrderId) relatedOrderIdSet.add(Number(finalOrderId));
      if (Array.isArray(finalRelatedOrders)) {
        finalRelatedOrders.forEach((oid) => {
          const n = Number(oid);
          if (Number.isInteger(n) && n > 0) relatedOrderIdSet.add(n);
        });
      }
      if (currentOutbound.related_orders) {
        try {
          const parsed =
            typeof currentOutbound.related_orders === 'string'
              ? JSON.parse(currentOutbound.related_orders)
              : currentOutbound.related_orders;
          if (Array.isArray(parsed)) {
            parsed.forEach((oid) => {
              const n = Number(oid);
              if (Number.isInteger(n) && n > 0) relatedOrderIdSet.add(n);
            });
          }
        } catch {
          // ignore parse errors
        }
      }
      const [sourceOrderRows] = await connection.execute(
        `SELECT DISTINCT source_order_id FROM sales_outbound_items
         WHERE outbound_id = ? AND source_order_id IS NOT NULL`,
        [id]
      );
      sourceOrderRows.forEach((row) => {
        const n = Number(row.source_order_id);
        if (Number.isInteger(n) && n > 0) relatedOrderIdSet.add(n);
      });

      const orderIds = [...relatedOrderIdSet].filter(Boolean);
      let salesOrdersList = [];
      if (orderIds.length > 0) {
        const ph = orderIds.map(() => '?').join(',');
        const [salesOrders] = await connection.execute(
          `SELECT so.*, c.name as customer_name
           FROM sales_orders so
           LEFT JOIN customers c ON so.customer_id = c.id
           WHERE so.id IN (${ph}) AND so.deleted_at IS NULL`,
          orderIds
        );
        salesOrdersList = salesOrders;
      }

      const fullSalesOrder = salesOrdersList[0] || null;
      const customerId =
        fullSalesOrder?.customer_id ?? currentOutbound.customer_id ?? null;
      const customerName = fullSalesOrder?.customer_name ?? null;

      eventPayload = {
        salesOrder: fullSalesOrder,
        salesOrders: salesOrdersList,
        outboundData: {
          id: id ?? null,
          outbound_no: currentOutbound.outbound_no ?? null,
          order_id: finalOrderId ?? currentOutbound.order_id ?? null,
          delivery_date: formattedDeliveryDate ?? currentOutbound.delivery_date ?? null,
          outbound_date: formattedDeliveryDate ?? currentOutbound.delivery_date ?? null,
          customer_id: customerId,
          customer_name: customerName,
          total_amount: amountRow.total_amount,
          created_by: currentOutbound.created_by ?? null,
        },
        currentUserId: req.user?.id ?? null,
      };
    } catch (evtError) {
      logger.error('Financial event payload preparation failed; outbound processing will continue', evtError);
    }

    let domainEventId = null;
    if (eventPayload && isJustCompleted) {
      domainEventId = await DomainEventService.enqueue(
        'SALES_OUTBOUND_COMPLETED',
        eventPayload,
        {
          connection,
          aggregateType: 'sales_outbound',
          aggregateId: id,
          dedupKey: `SALES_OUTBOUND_COMPLETED:${id}`,
        }
      );
    }

    // ========== 提交主事务，释放所有行锁 ==========
    await connection.commit();
    DomainEventService.dispatchSoon(domainEventId);

    const [updatedOutbound] = await connection.query(
      `SELECT so.*, o.order_no, c.name as customer_name
       FROM sales_outbound so
       LEFT JOIN sales_orders o ON so.order_id = o.id AND o.deleted_at IS NULL
       LEFT JOIN customers c ON o.customer_id = c.id
       WHERE so.id = ? AND so.deleted_at IS NULL`,
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

    return ResponseHandler.success(res, {
      message: '销售出库单更新成功',
      data: completeOutbound,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('更新销售出库单失败:', error);
    ResponseHandler.error(
      res,
      error.message || '更新销售出库单失败',
      (error.cause?.code || error.code) || 'SERVER_ERROR',
      (error.cause?.statusCode || error.statusCode) || 500,
      error.cause?.statusCode ? error.cause : error
    );
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/**
 * 冲销已完成销售出库：按台账回冲库存，状态 → reversed
 * 幂等：outbound_cancel 流水 + 条件状态更新
 */
exports.reverseSalesOutbound = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    connection = await getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, outbound_no, order_id, status, is_multi_order, related_orders, delivery_date
       FROM sales_outbound
       WHERE id = ? AND deleted_at IS NULL
       FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return ResponseHandler.notFound(res, '销售出库单不存在');
    }

    const outbound = rows[0];
    if (outbound.status === 'reversed') {
      await connection.rollback();
      return ResponseHandler.success(res, { id: Number(id), status: 'reversed' }, '出库单已冲销');
    }
    if (outbound.status !== 'completed') {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        `仅已完成出库单可冲销，当前状态: ${outbound.status}`,
        'VALIDATION_ERROR',
        400
      );
    }

    const outboundNo = outbound.outbound_no;
    const InventoryPostingService = require('../../../services/InventoryPostingService');
    const posting = await InventoryPostingService.requireApprovedForTransaction(connection, {
      reference_no: outboundNo,
    });
    const reversal = await InventoryPostingService.requestReversal(
      posting.id,
      InventoryPostingService.actorFromRequest(req),
      `冲销销售出库 ${outboundNo}`,
      {
        sourceType: 'sales_outbound',
        sourceId: Number(id),
        sourceNo: outboundNo,
        referenceType: 'sales_outbound',
        referenceId: Number(id),
        orderId: outbound.order_id ? Number(outbound.order_id) : null,
        isMultiOrder: outbound.is_multi_order,
        relatedOrders: outbound.related_orders,
      },
      connection
    );
    if (reversal?.reversalDocumentId) {
      await connection.commit();
      return ResponseHandler.success(
        res,
        {
          id: Number(id),
          outboundNo,
          status: outbound.status,
          reversalDocumentId: reversal.reversalDocumentId,
          financeStatus: reversal.financeStatus,
        },
        '销售出库反审核申请已提交，待财务审批后正式冲销并完成财务收尾'
      );
    }

  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        // ignore
      }
    }
    logger.error('冲销销售出库失败:', error);
    return ResponseHandler.error(
      res,
      error.message || '冲销销售出库失败',
      error.code || 'SERVER_ERROR',
      error.statusCode || 500,
      error
    );
  } finally {
    if (connection) connection.release();
  }
};

// 删除出库单功能（仅允许草稿或待处理状态，已完成的出库单禁止删除以保护库存和财务数据一致性）

exports.deleteSalesOutbound = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    connection = await getConnection();

    const ScopeGuard = require('../../../authorization/ScopeGuard');
    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'sales_outbound', id, '无权删除该销售出库单'))) {
      return;
    }

    await connection.beginTransaction();

    const [outboundResult] = await connection.query(
      'SELECT id, status, outbound_no, order_id FROM sales_outbound WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );

    if (outboundResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.notFound(res, '出库单不存在');
    }

    const outbound = outboundResult[0];

    // 仅允许删除草稿(draft)和待处理(pending)状态的出库单。
    // 已完成(completed)/处理中(processing)的出库单已产生库存变动和财务凭证，不允许直接删除。
    const deletableStatuses = ['draft', 'pending'];
    if (!deletableStatuses.includes(outbound.status)) {
      await connection.rollback();
      return ResponseHandler.error(res, `无法删除状态为 "${outbound.status}" 的出库单。已完成或处理中出库单请使用撤销功能回滚库存和财务数据。仅草稿和待处理状态可直接删除。`, 'VALIDATION_ERROR', 400);
    }

    try {
      // 删除明细
      await connection.query('DELETE FROM sales_outbound_items WHERE outbound_id = ?', [id]);

      // 软删除出库单主表
      await softDelete(connection, 'sales_outbound', 'id', id);

      await connection.commit();

      logger.info(`销售出库单 ${outbound.outbound_no} (ID: ${id}) 已安全删除，状态: ${outbound.status}`);

      return ResponseHandler.success(res, {
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
    ResponseHandler.error(res, '删除销售出库单失败', 'SERVER_ERROR', 500, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Sales Return Controllers

exports.getMaterialSalesHistory = async (req, res) => {
  let connection;
  try {
    const { materialId } = req.params;
    const { page = 1, pageSize = 10, startDate, endDate, customerId } = req.query;

    // 验证参数
    if (!materialId) {
      return ResponseHandler.error(res, '物料ID不能为空', 'VALIDATION_ERROR', 400);
    }

    const pagination = parsePagination(page, pageSize, {
      defaultPageSize: 10,
      maxPageSize: 100,
    });
    const actualPage = pagination.page;
    const actualPageSize = pagination.pageSize;
    const offset = pagination.offset;

    connection = await getConnection();

    // 构建查询条件
    let whereClause = 'WHERE soi.product_id = ? AND so.deleted_at IS NULL';
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
      LEFT JOIN sales_orders o ON COALESCE(soi.source_order_id, so.order_id) = o.id AND o.deleted_at IS NULL
      ${whereClause}
  `;

    const [countResult] = await connection.query(countQuery, queryParams);
    const total = parseInt(countResult[0].total) || 0;

    // 查询销售出库历史数据。
    // 注：sales_outbound_items.price/amount 创建出库单时可能未回填，
    // 因此优先取出库明细价格，同时回退到关联订单明细的价格。
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
      LEFT JOIN sales_orders o ON COALESCE(soi.source_order_id, so.order_id) = o.id AND o.deleted_at IS NULL
      LEFT JOIN sales_order_items oi ON COALESCE(soi.source_order_id, so.order_id) = oi.order_id AND soi.product_id = oi.material_id
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN materials m ON soi.product_id = m.id
      LEFT JOIN units u ON soi.unit_id = u.id
      ${whereClause}
      ORDER BY so.delivery_date DESC, so.created_at DESC
      LIMIT ${actualPageSize} OFFSET ${offset}
  `;

    const [dataResult] = await connection.query(dataQuery, queryParams);

    // 返回结果
    return ResponseHandler.paginated(
      res,
      dataResult,
      total,
      actualPage,
      actualPageSize,
      '获取物料销售历史成功'
    );
  } catch (error) {
    logger.error('获取物料销售历史失败', error);
    ResponseHandler.error(res, '获取物料销售历史失败', 'SERVER_ERROR', 500, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
