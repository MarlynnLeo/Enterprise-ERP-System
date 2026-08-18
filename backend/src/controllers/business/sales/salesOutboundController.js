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
const DBManager = require('../../../utils/dbManager');
const { getCurrentUserName } = require('../../../utils/userHelper');
const { SALES_OUTBOUND_TRANSITIONS } = require('../../../constants/statusRegistry');
const { getAuthenticatedUserId } = require('../../../utils/authContext');
const { parsePagination, appendPaginationSQL } = require('../../../utils/safePagination');

const { STATUS, getConnection, generateSalesOutboundNo } = require('./salesShared');
const { getRequestActorLabel } = require('../../../utils/userUtils');
const { salesOutboundMap, salesOutboundItemMap } = require('../../../utils/sales/salesFieldMap');

const createValidationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  return error;
};

const assertSalesOutboundQuantities = async (
  connection,
  items = [],
  { orderId = null, isMultiOrder = false, outboundId = null, status = 'draft' } = {}
) => {
  if (status === STATUS.OUTBOUND.DRAFT || !Array.isArray(items) || items.length === 0) return;

  for (const item of items) {
    const materialId = item.material_id || item.product_id;
    const sourceOrderId = item.source_order_id || item.order_id || (!isMultiOrder ? orderId : null);
    const outboundQty = parseFloat(item.quantity) || 0;

    if (!materialId || !sourceOrderId || outboundQty <= 0) {
      throw createValidationError('销售出库明细缺少订单、物料或有效数量');
    }

    const [orderRows] = await connection.query(
      `SELECT COALESCE(SUM(soi.quantity), 0) AS quantity
       FROM sales_order_items soi
       JOIN sales_orders so ON soi.order_id = so.id AND so.deleted_at IS NULL
       WHERE soi.order_id = ? AND soi.material_id = ?
       FOR UPDATE`,
      [sourceOrderId, materialId]
    );

    if (orderRows.length === 0) {
      throw createValidationError(`销售订单${sourceOrderId}中不存在物料${materialId}`);
    }

    const params = [materialId, sourceOrderId, sourceOrderId];
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
         AND (sob.order_id = ? OR sobi.source_order_id = ?)
         ${excludeClause}`,
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
        SELECT soi.id, soi.outbound_id, soi.product_id, soi.quantity, soi.price, soi.amount,
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

        const returnedMap = new Map();
        if (outbound.order_id) {
          const [returnedRows] = await connection.query(
            `SELECT sri.product_id, SUM(sri.quantity) AS total_returned
             FROM sales_return_items sri
             JOIN sales_returns sr ON sri.return_id = sr.id
             WHERE sr.deleted_at IS NULL
               AND sr.status NOT IN ('rejected', 'cancelled', 'draft')
               AND sr.outbound_id = ?
             GROUP BY sri.product_id`,
            [outbound.id]
          );
          returnedRows.forEach(row => {
            returnedMap.set(row.product_id, parseFloat(row.total_returned) || 0);
          });
        }

        const items = itemsResult.map((item) => {
          const material = materialsResult.find((m) => m.id === item.product_id) || {};
          const unit = material.unit_id ? unitsResult.find((u) => u.id === material.unit_id) : null;
          const returnedQty = returnedMap.get(item.product_id) || 0;

          // 内部仍用 snake 组装，最后经 salesOutboundItemMap.toApi 输出
          return {
            id: item.id,
            outbound_id: item.outbound_id,
            product_id: item.product_id,
            quantity: item.quantity,
            price: item.price,
            amount: item.amount,
            source_order_id: item.source_order_id,
            source_order_no: item.source_order_no,
            returned_quantity: returnedQty,
            returnable_quantity: Math.max(0, (parseFloat(item.quantity) || 0) - returnedQty),
            material_name: material.name,
            material_code: material.code,
            specification: material.specs,
            unit_name: unit ? unit.name : null,
            unit_id: material.unit_id,
          };
        });

        outbound.items = items.map((item) => {
          const apiItem = salesOutboundItemMap.toApi(item);
          // 展示名：未知物料兜底
          if (!apiItem.materialName) {
            apiItem.materialName = `未知物料(ID:${apiItem.productId})`;
          }
          if (!apiItem.materialCode) apiItem.materialCode = '未知代码';
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
    const mapped = salesOutboundMap.fromApi(req.body || {});
    const order_id = mapped.order_id;
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

      // 检查是否所有订单属于同一个客户（可选验证）
      const customerIds = [...new Set(orderCheck.map((order) => order.customer_id))];
      if (customerIds.length > 1) {
        logger.warn('警告：多订单出库涉及不同客户，请确认业务逻辑');
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
            materialsQuery = 'SELECT id, code, name FROM materials WHERE id = ?';
            materialsParams = [materialIds[0]];
          } else {
            materialsQuery = 'SELECT id, code, name FROM materials WHERE id IN (?)';
            materialsParams = [materialIds];
          }


          const [materialCheck] = await connection.query(materialsQuery, materialsParams);

          const validMaterialIds = materialCheck.map((m) => m.id);

          // 查找无效的物料ID
          const invalidMaterialIds = materialIds.filter((id) => !validMaterialIds.includes(id));
          if (invalidMaterialIds.length > 0) {
            throw new Error(`销售出库物料不存在: ${invalidMaterialIds.join(',')}`);
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
                  `SELECT soi.order_id, soi.material_id, soi.unit_price
                   FROM sales_order_items soi
                   JOIN sales_orders so ON soi.order_id = so.id AND so.deleted_at IS NULL
                   WHERE soi.order_id IN (?)`,
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
                let unitPrice = parseFloat(item.unitPrice || item.price || 0);
                if (unitPrice === 0) {
                  unitPrice = orderPriceMap[`${sourceOrderId}:${materialId}`] || orderPriceMap[materialId] || 0;
                }
                const amount = parseFloat(item.quantity || 0) * unitPrice;

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
    const formattedDeliveryDate = delivery_date
      ? new Date(delivery_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    connection = await getConnection();

    const ScopeGuard = require('../../../authorization/ScopeGuard');
    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'sales_outbound', id, '无权修改该销售出库单'))) {
      return;
    }

    await connection.beginTransaction();

    // 1. 检查出库单是否存在并获取当前状态和明细
    const [outboundCheck] = await connection.query('SELECT id, outbound_no, order_id, delivery_date, status, remarks, created_by, created_at, updated_at, is_multi_order, related_orders, deleted_at, total_amount FROM sales_outbound WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [
      id,
    ]);

    if (outboundCheck.length === 0) {
      await connection.rollback();
      return ResponseHandler.notFound(res, '出库单不存在');
    }

    const currentOutbound = outboundCheck[0];

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

      const [orderCheck] = await connection.query('SELECT id FROM sales_orders WHERE id IN (?) AND deleted_at IS NULL', [
        finalRelatedOrders,
      ]);

      if (orderCheck.length !== finalRelatedOrders.length) {
        await connection.rollback();
        return ResponseHandler.error(res, '部分关联订单不存在', 'VALIDATION_ERROR', 400);
      }

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
    const finalRemarks = remarks || currentOutbound.remarks;
    const quantityCheckItems = items && items.length > 0 ? items : currentItems;

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
          'SELECT id, code, name FROM materials WHERE id IN (?)',
          [materialIds]
        );

        const validMaterialIds = materialCheck.map((m) => m.id);

        const validItems = items.filter((item) => {
          const materialId = item.material_id || item.product_id;
          return validMaterialIds.includes(materialId);
        });

        if (validItems.length === 0) {
          throw new Error('销售出库单更新没有有效物料明细');
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
                `SELECT soi.order_id, soi.material_id, soi.unit_price
                 FROM sales_order_items soi
                 JOIN sales_orders so ON soi.order_id = so.id AND so.deleted_at IS NULL
                 WHERE soi.order_id IN (?)`,
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

              let unitPrice = parseFloat(item.unitPrice || item.price || 0);
              if (unitPrice === 0) {
                unitPrice = orderPriceMap[`${sourceOrderId}:${materialId}`] || orderPriceMap[materialId] || 0;
              }
              const amount = parseFloat(item.quantity || 0) * unitPrice;

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

    const isJustCompleted = finalStatus === STATUS.OUTBOUND.COMPLETED && currentOutbound.status !== STATUS.OUTBOUND.COMPLETED;

    // 6. 如果状态变为 completed，处理库存和追溯
    if (isJustCompleted) {
      const ProductSalesTraceabilityService = require('../../../services/business/ProductSalesTraceabilityService');

      const salesData = {
        outbound_id: id,
        outbound_no: currentOutbound.outbound_no,
        order_id: finalOrderId,
        customer_id: currentOutbound.customer_id, // 需要确保 currentOutbound 或关联订单中有 customer_id
        delivery_date: formattedDeliveryDate,
        items: items && items.length > 0 ? items : currentItems,
        operator: await getCurrentUserName(req),
      };

      // 如果 currentOutbound 没有 customer_id (可能之前没存)，尝试从订单获取
      if (!salesData.customer_id && finalOrderId) {
        const [orderRes] = await connection.query(
          'SELECT customer_id FROM sales_orders WHERE id = ? AND deleted_at IS NULL',
          [finalOrderId]
        );
        if (orderRes.length > 0) {
          salesData.customer_id = orderRes[0].customer_id;
        }
      }

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
          total_amount: currentOutbound.total_amount ?? null,
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
    const [already] = await connection.execute(
      `SELECT COUNT(*) AS count
       FROM inventory_ledger
       WHERE reference_no = ?
         AND transaction_type = 'outbound_cancel'
         AND quantity > 0
         AND reference_type = 'sales_outbound_reversal'`,
      [outboundNo]
    );
    if (Number(already[0]?.count || 0) > 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '该出库单已有冲销流水，禁止重复冲销', 'VALIDATION_ERROR', 400);
    }

    const [ledgerRows] = await connection.execute(
      `SELECT id, material_id, location_id, unit_id, batch_number, ABS(quantity) AS qty
       FROM inventory_ledger
       WHERE reference_no = ?
         AND quantity < 0
         AND transaction_type IN ('sales_outbound', 'outbound')
       ORDER BY material_id ASC, location_id ASC, id ASC`,
      [outboundNo]
    );

    if (ledgerRows.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '找不到该出库单的扣库台账，无法安全冲销',
        'VALIDATION_ERROR',
        400
      );
    }

    const InventoryService = require('../../../services/InventoryService');
    const operator = await getCurrentUserName(req);
    let reversedQty = 0;

    for (const ledger of ledgerRows) {
      const qty = parseFloat(ledger.qty) || 0;
      if (qty <= 0 || !ledger.location_id) continue;

      await InventoryService.updateStock(
        {
          materialId: ledger.material_id,
          locationId: ledger.location_id,
          quantity: qty, // 加回库存
          // 与库存出库冲销共用 outbound_cancel（字段长度受限）
          transactionType: 'outbound_cancel',
          referenceNo: outboundNo,
          referenceType: 'sales_outbound_reversal',
          operator: operator || getRequestActorLabel(req),
          remark: `冲销销售出库 ${outboundNo}，来源台账 ${ledger.id}`,
          unitId: ledger.unit_id,
          batchNumber: ledger.batch_number || `REV-SOB-${outboundNo}-${ledger.id}`,
          idempotencyKey: `sales_outbound_cancel:${outboundNo}:ledger:${ledger.id}`,
        },
        connection
      );
      reversedQty += qty;
    }

    const [statusUpdate] = await connection.execute(
      `UPDATE sales_outbound
       SET status = 'reversed', updated_at = NOW()
       WHERE id = ? AND deleted_at IS NULL AND status = 'completed'`,
      [id]
    );
    if (!statusUpdate.affectedRows) {
      await connection.rollback();
      return ResponseHandler.error(res, '出库单状态已变更，请刷新后重试', 'VALIDATION_ERROR', 400);
    }

    // P0：财务补偿闭环（成本 GL / 销项税 / 安全取消未收款 AR）
    const SalesOutboundReversalService = require('../../../services/business/SalesOutboundReversalService');
    let financeCompensation = null;
    try {
      financeCompensation = await SalesOutboundReversalService.compensateFinance(connection, {
        outboundNo,
        outboundId: Number(id),
        orderId: outbound.order_id ? Number(outbound.order_id) : null,
        operator: operator || getRequestActorLabel(req),
      });
    } catch (finErr) {
      await connection.rollback();
      const status = finErr.statusCode || 400;
      return ResponseHandler.error(
        res,
        finErr.message || '财务冲销失败，已中止出库冲销',
        finErr.code || 'FINANCE_REVERSAL_BLOCKED',
        status
      );
    }

    // 冲销后：同步所有关联订单状态 + 重新预留剩余未发数量
    const relatedOrderIds = new Set();
    if (outbound.order_id) relatedOrderIds.add(Number(outbound.order_id));
    if (outbound.related_orders) {
      try {
        const parsed =
          typeof outbound.related_orders === 'string'
            ? JSON.parse(outbound.related_orders)
            : outbound.related_orders;
        if (Array.isArray(parsed)) {
          parsed.forEach((oid) => {
            const n = Number(oid);
            if (Number.isInteger(n) && n > 0) relatedOrderIds.add(n);
          });
        }
      } catch {
        // ignore
      }
    }
    const [srcOrders] = await connection.execute(
      `SELECT DISTINCT source_order_id FROM sales_outbound_items
       WHERE outbound_id = ? AND source_order_id IS NOT NULL`,
      [id]
    );
    srcOrders.forEach((r) => {
      const n = Number(r.source_order_id);
      if (Number.isInteger(n) && n > 0) relatedOrderIds.add(n);
    });

    const orderIdList = [...relatedOrderIds].filter(Boolean);
    for (const orderId of orderIdList) {
      try {
        await SalesOrderStatusService.updateOrderStatus(orderId, connection);
      } catch (statusErr) {
        logger.warn(`销售出库冲销后订单 ${orderId} 状态同步失败: ${statusErr.message}`);
      }
    }

    // 重新预留：库存已回冲，为仍未发完的订单行建立 active 预留
    try {
      const InventoryReservationService = require('../../../services/InventoryReservationService');
      const userId = req.user?.id || null;
      for (const orderId of orderIdList) {
        const [orderRows] = await connection.execute(
          `SELECT id, order_no, status FROM sales_orders
           WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
          [orderId]
        );
        if (!orderRows.length) continue;
        const order = orderRows[0];
        if (['cancelled', 'completed'].includes(String(order.status))) continue;

        const [items] = await connection.execute(
          `SELECT material_id, quantity AS ordered_quantity
           FROM sales_order_items WHERE order_id = ?`,
          [orderId]
        );
        if (!items.length) continue;

        // 剩余可发 = 订购 − 其它未冲销出库
        const remainingItems = [];
        for (const item of items) {
          const [shipped] = await connection.execute(
            `SELECT COALESCE(SUM(sobi.quantity), 0) AS shipped_qty
             FROM sales_outbound_items sobi
             JOIN sales_outbound sob ON sob.id = sobi.outbound_id
             WHERE sob.deleted_at IS NULL
               AND sob.status IN ('processing', 'completed')
               AND sobi.product_id = ?
               AND (sob.order_id = ? OR sobi.source_order_id = ?)`,
            [item.material_id, orderId, orderId]
          );
          const ordered = parseFloat(item.ordered_quantity) || 0;
          const shipQty = parseFloat(shipped[0]?.shipped_qty) || 0;
          const remain = Math.max(0, ordered - shipQty);
          if (remain > 0.0001) {
            remainingItems.push({
              material_id: item.material_id,
              quantity: remain,
              ordered_quantity: remain,
            });
          }
        }
        if (remainingItems.length) {
          await InventoryReservationService.reserveInventoryForOrder(
            orderId,
            order.order_no,
            remainingItems,
            userId,
            connection
          );
          logger.info(
            `销售出库冲销后订单 ${order.order_no} 已重预留 ${remainingItems.length} 行`
          );
        }
      }
    } catch (reserveErr) {
      logger.warn(`销售出库冲销后重预留失败: ${reserveErr.message}`);
    }

    await connection.commit();
    return ResponseHandler.success(
      res,
      {
        id: Number(id),
        outbound_no: outboundNo,
        status: 'reversed',
        reversedQuantity: reversedQty,
        reversedLedgerCount: ledgerRows.length,
        financeCompensation,
        relatedOrderIds: orderIdList,
      },
      '销售出库冲销成功，库存与财务已回冲'
    );
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        // ignore
      }
    }
    logger.error('冲销销售出库失败:', error);
    return ResponseHandler.error(res, error.message || '冲销销售出库失败', 'SERVER_ERROR', 500, error);
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
