/**
 * salesExchangeController.js
 * @description 销售换货控制器
 * @version 1.1.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const db = require('../../../config/db');
const { softDelete } = require('../../../utils/softDelete');
const InventoryReservationService = require('../../../services/InventoryReservationService');
const { getCurrentUserName } = require('../../../utils/userHelper');
const { getAuthenticatedUserId } = require('../../../utils/authContext');
const { generateProductionAndPurchasePlans } = require('./salesPackingController');
const { parsePagination, appendPaginationSQL } = require('../../../utils/safePagination');
const { SALES_EXCHANGE_TRANSITIONS } = require('../../../constants/statusRegistry');
const { mapKeysToSnake } = require('../../../utils/fieldMap');
const { lockSalesOrders } = require('../../../utils/sales/salesOrderLocks');
const { calculateLines, normalizeTaxRate, sumMoney, roundMoney } = require('../../../utils/money');
const { normalizeStatus } = require('../../../constants/statusRegistry');
const SalesReturnEligibilityService = require('../../../services/business/SalesReturnEligibilityService');
const SalesOutboundValuationService = require('../../../services/business/SalesOutboundValuationService');
const { validationError } = SalesReturnEligibilityService;
const { normalizeSalesDate } = require('../../../utils/sales/salesValidation');

async function prepareExchange(connection, body, exchangeId = null) {
  const [[order]] = await connection.query(
    'SELECT o.id, o.order_no, o.customer_id, c.name AS customer_name, COALESCE(c.contact_phone, c.phone) AS contact_phone FROM sales_orders o JOIN customers c ON c.id = o.customer_id AND c.deleted_at IS NULL WHERE o.order_no = ? AND o.deleted_at IS NULL FOR UPDATE',
    [body.order_no || '']
  );
  if (!order) throw validationError('请选择有效的原销售订单');
  const outboundId = body.outbound_id == null || body.outbound_id === '' ? null : Number(body.outbound_id);
  if (outboundId !== null && (!Number.isSafeInteger(outboundId) || outboundId <= 0)) {
    throw validationError('请选择有效的原销售出库单');
  }
  const shippedValues = await SalesOutboundValuationService.getShippedMaterialValues(connection, { orderId: order.id, outboundId });
  let rawItems;
  if (body.return_items !== undefined || body.new_items !== undefined) {
    if (!Array.isArray(body.return_items) || !body.return_items.length || !Array.isArray(body.new_items) || !body.new_items.length) {
      throw validationError('必须分别填写退回商品和换出商品');
    }
    rawItems = [
      ...body.return_items.map(item => ({ ...item, item_type: 'return', quantity: item.return_quantity ?? item.quantity })),
      ...body.new_items.map(item => ({ ...item, item_type: 'new', quantity: item.new_quantity ?? item.quantity })),
    ];
  } else {
    rawItems = body.items;
  }
  if (!Array.isArray(rawItems) || !rawItems.some(i => i.item_type === 'return') || !rawItems.some(i => i.item_type === 'new')) {
    throw validationError('换货单必须包含退回商品和换出商品');
  }
  const items = [];
  for (const input of rawItems) {
    const quantity = Number(input.quantity ?? input.exchange_quantity);
    if (!['return', 'new'].includes(input.item_type) || !Number.isSafeInteger(quantity) || quantity <= 0) {
      throw validationError('换货明细类型必须有效，数量必须为正整数');
    }
    const [[material]] = await connection.query(
      'SELECT m.id, m.code, m.name, m.specs, m.price, m.tax_rate, u.name AS unit_name FROM materials m LEFT JOIN units u ON u.id=m.unit_id WHERE m.code=? AND m.deleted_at IS NULL',
      [input.product_code || '']
    );
    if (!material) throw validationError(`商品 ${input.product_code || ''} 不存在或已删除`);
    const [[sold]] = await connection.query(
      'SELECT COALESCE(SUM(quantity),0) AS quantity, COALESCE(SUM(quantity * unit_price) / NULLIF(SUM(quantity),0),0) AS unit_price FROM sales_order_items WHERE order_id=? AND material_id=?',
      [order.id, material.id]
    );
    const shipped = shippedValues.get(Number(material.id));
    if (input.item_type === 'return' && !shipped) throw validationError(`商品 ${material.code} 在所选来源中没有已完成的销售出库`);
    const price = input.item_type === 'return' ? Number(shipped.unit_price) : Number(input.unit_price ?? material.price ?? 0);
    if (!Number.isFinite(price) || price < 0) throw validationError('换货单价必须为有效的非负金额');
    const unitPrice = Math.round(price * 10000) / 10000;
    const rawTaxRate = Number(input.item_type === 'return' ? shipped.tax_percent : (input.tax_percent ?? input.tax_rate ?? material.tax_rate ?? 0));
    if (!Number.isFinite(rawTaxRate) || rawTaxRate < 0 || rawTaxRate > 100) throw validationError('换货税率必须在0%至100%之间');
    items.push({
      product_id: material.id, product_code: material.code, product_name: material.name,
      specification: material.specs || '', unit_name: material.unit_name || '',
      item_type: input.item_type, quantity, original_quantity: input.item_type === 'return' ? Number(sold.quantity) : 0,
      unit_price: unitPrice, tax_percent: normalizeTaxRate(rawTaxRate),
      reason: input.reason ?? input.return_reason ?? input.new_reason ?? input.exchange_reason ?? '',
    });
  }
  await SalesReturnEligibilityService.assertReturnable(connection, {
    orderId: order.id, outboundId, items: items.filter(item => item.item_type === 'return'), excludeExchangeId: exchangeId,
  });
  return { order, outboundId, items: calculateLines(items).items };
}

async function saveExchangeItems(connection, id, items, existingItems = null) {
  if (existingItems) {
    // Preserve line IDs used by inventory idempotency when normalizing old drafts.
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      await connection.query('UPDATE sales_exchange_items SET unit_price=?,amount=?,tax_percent=?,tax_amount=? WHERE id=? AND exchange_id=?',
        [item.unit_price,item.amount,item.tax_percent,item.tax_amount,existingItems[index].id,id]);
    }
  } else {
    await connection.query(
      'INSERT INTO sales_exchange_items (exchange_id,item_type,product_code,product_name,specification,original_quantity,quantity,unit_price,amount,tax_percent,tax_amount,reason,unit_name) VALUES ?',
      [items.map(item => [id,item.item_type,item.product_code,item.product_name,item.specification,item.original_quantity,item.quantity,item.unit_price,item.amount,item.tax_percent,item.tax_amount,item.reason,item.unit_name])]
    );
  }
  const returnAmount = sumMoney(items.filter(i => i.item_type === 'return').map(i => i.total_amount));
  const newAmount = sumMoney(items.filter(i => i.item_type === 'new').map(i => i.total_amount));
  await connection.query('UPDATE sales_exchanges SET return_amount=?, new_amount=?, difference_amount=? WHERE id=?',
    [returnAmount, newAmount, roundMoney(newAmount-returnAmount), id]);
}


const {
  salesExchangeMap,
  salesExchangeItemMap,
  toNumber,
} = require('../../../utils/sales/salesFieldMap');

exports.getSalesExchanges = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, search, startDate, endDate, status } = req.query;
    const pagination = parsePagination(page, pageSize, { maxPageSize: 100, defaultPageSize: 10 });

    // 构建查询条件
    const ScopeGuard = require('../../../authorization/ScopeGuard');
    const scopeClause = await ScopeGuard.applyListScope(req, 'sales_exchange', {
      tableAlias: 'se',
      ownerAlias: 'sales_exchange_owner_scope',
      accessMode: 'read',
    });
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

    whereClause += scopeClause.where || '';
    queryParams.push(...(scopeClause.params || []));

    // 查询总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM sales_exchanges se
      ${scopeClause.join}
      WHERE se.deleted_at IS NULL ${whereClause}
      `;

    const connection = await db.pool.getConnection();

    try {
      const [countResult] = await connection.query(countQuery, queryParams);
      const total = countResult[0].total;

      const query = appendPaginationSQL(
        `
        SELECT se.*,
               se.return_amount, se.new_amount, se.difference_amount
        FROM sales_exchanges se
        ${scopeClause.join}
        WHERE se.deleted_at IS NULL ${whereClause}
        ORDER BY se.created_at DESC
      `,
        pagination.limit,
        pagination.offset
      );

      const [results] = await connection.query(query, queryParams);

      // 统计不同状态的数量
      const statusQuery = `
        SELECT se.status, COUNT(*) as count
        FROM sales_exchanges se
        ${scopeClause.join}
        WHERE se.deleted_at IS NULL ${scopeClause.where || ''}
        GROUP BY se.status
        `;

      const [statusCounts] = await connection.query(statusQuery, scopeClause.params || []);

      // 格式化状态统计数据
      const statusStats = {
        total: total,
        pending: 0,
        processing: 0,
        completed: 0,
        rejected: 0,
        cancelled: 0,
      };

      statusCounts.forEach((item) => {
        const count = Number(item.count) || 0;
        if (item.status === 'pending') statusStats.pending = count;
        if (item.status === 'processing') statusStats.processing = count;
        if (item.status === 'completed') statusStats.completed = count;
        if (item.status === 'rejected') statusStats.rejected = count;
        if (item.status === 'cancelled') statusStats.cancelled = count;
      });

      const responseData = {
        items: results.map((r) => salesExchangeMap.toApi(r)),
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
        statusStats,
      };

      return ResponseHandler.success(res, responseData);
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('获取销售换货单列表失败:', error);
    ResponseHandler.error(res, '获取销售换货单列表失败', 'SERVER_ERROR', 500);
  }
};


exports.getSalesExchangeById = async (req, res) => {
  {
    const { id } = req.params;
    if (id !== null && id !== undefined && id !== '') {
      const ScopeGuard = require('../../../authorization/ScopeGuard');
      if (!(await ScopeGuard.assertAccess(db.pool, req, 'sales_exchange', id, { accessMode: 'read' }))) {
        return ResponseHandler.forbidden(res, '无权访问该销售换货单');
      }
    }
  }

  try {
    const { id } = req.params;

    const connection = await db.pool.getConnection();

    try {
      // 查询换货单主信息
      const query = `
        SELECT se.*
        FROM sales_exchanges se
        WHERE se.id = ? AND se.deleted_at IS NULL
        `;

      const [exchangeResults] = await connection.query(query, [id]);

      if (exchangeResults.length === 0) {
        return ResponseHandler.notFound(res, '换货单不存在');
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
      const availability = await SalesReturnEligibilityService.getAvailability(connection, {
        orderId: exchange.order_id,
        outboundId: exchange.outbound_id,
        productIds: detailsResults.filter(item => item.item_type === 'return').map(item => item.material_id),
        excludeExchangeId: Number(id),
      });
      for (const item of detailsResults) {
        if (item.item_type === 'return') item.returnable_quantity = availability.get(Number(item.material_id))?.availableQuantity ?? 0;
      }

      // 分离退回/换出明细，经 FieldMap 出 camel
      const returnItems = detailsResults
        .filter((item) => item.item_type === 'return')
        .map((item) => ({
          ...salesExchangeItemMap.toApi(item),
          returnQuantity: toNumber(item.quantity, 0),
          returnReason: item.reason,
        }));

      const newItems = detailsResults
        .filter((item) => item.item_type === 'new')
        .map((item) => ({
          ...salesExchangeItemMap.toApi(item),
          newQuantity: toNumber(item.quantity, 0),
          newReason: item.reason,
        }));

      const api = salesExchangeMap.toApi({
        ...exchange,
        return_items: detailsResults.filter((i) => i.item_type === 'return'),
        new_items: detailsResults.filter((i) => i.item_type === 'new'),
        items: detailsResults,
      });
      // 保留业务别名（仍 camel）
      api.returnItems = returnItems;
      api.newItems = newItems;

      return ResponseHandler.success(res, api);
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('获取销售换货单详情失败:', error);
    ResponseHandler.error(res, '获取销售换货单详情失败', 'SERVER_ERROR', 500);
  }
};


exports.createSalesExchange = async (req, res) => {
  let connection;
  try {
    const body = mapKeysToSnake(req.body || {});
    const reason = body.reason ?? body.exchange_reason;
    if (!reason) throw validationError('请填写换货原因');
    body.exchange_date = normalizeSalesDate(body.exchange_date, '换货日期');
    if (body.status && normalizeStatus('salesExchange', body.status) !== 'pending') throw validationError('新换货单只能为待处理状态');
    connection = await db.pool.getConnection();
    await connection.beginTransaction();
    const { order, outboundId, items } = await prepareExchange(connection, body);
    const CodeGeneratorService = require('../../../services/business/CodeGeneratorService');
    const exchangeNo = await CodeGeneratorService.nextCode('sales_exchange', connection);
    const [result] = await connection.query(
      'INSERT INTO sales_exchanges (exchange_no,order_id,order_no,outbound_id,customer_id,customer_name,contact_phone,exchange_date,exchange_reason,status,remarks,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [exchangeNo,order.id,order.order_no,outboundId,order.customer_id,order.customer_name,body.contact_phone ?? order.contact_phone,
        body.exchange_date,reason,'pending',body.remark ?? body.remarks ?? '',getAuthenticatedUserId(req)]
    );
    await saveExchangeItems(connection, result.insertId, items);
    await connection.commit();
    return ResponseHandler.success(res, { id: result.insertId, exchangeNo, status: 'pending' }, '创建成功', 201);
  } catch (error) {
    if (connection) await connection.rollback();
    logger.error('创建销售换货单失败:', error);
    return ResponseHandler.error(res, error.message, error.code || 'SERVER_ERROR', error.statusCode || 500);
  } finally {
    if (connection) connection.release();
  }
};

exports.updateSalesExchange = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const body = mapKeysToSnake(req.body || {});
    const statusOnly = Object.keys(body).length === 1 && body.status !== undefined;
    connection = await db.pool.getConnection();
    const ScopeGuard = require('../../../authorization/ScopeGuard');
    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'sales_exchange', id, '无权修改该销售换货单'))) return;
    await connection.beginTransaction();
    const [sources] = await connection.query(
      'SELECT o.id FROM sales_orders o LEFT JOIN sales_exchanges e ON e.id=? WHERE o.id=e.order_id OR o.order_no COLLATE utf8mb4_unicode_ci=e.order_no COLLATE utf8mb4_unicode_ci OR o.order_no=?', [id, body.order_no || '']
    );
    const lockedOrderIds = await lockSalesOrders(connection, sources.map(order => order.id));
    const [[current]] = await connection.query('SELECT * FROM sales_exchanges WHERE id=? AND deleted_at IS NULL FOR UPDATE', [id]);
    if (!current) {
      await connection.rollback();
      return ResponseHandler.notFound(res, '换货单不存在');
    }
    const previousStatus = normalizeStatus('salesExchange', current.status);
    const status = body.status ? normalizeStatus('salesExchange', body.status) : previousStatus;
    if (!Object.hasOwn(SALES_EXCHANGE_TRANSITIONS, status)) throw validationError('无效的换货状态');
    if (statusOnly && status === previousStatus) {
      await connection.commit();
      return ResponseHandler.success(res, { id: Number(id), status }, '换货单状态未变化');
    }
    if (['completed','rejected'].includes(previousStatus)) throw validationError('已完成或拒绝的换货单不可修改');
    if (status !== previousStatus && !SALES_EXCHANGE_TRANSITIONS[previousStatus]?.includes(status)) {
      throw validationError(`换货状态不允许从 ${previousStatus} 变为 ${status}`);
    }
    const [saved] = await connection.query('SELECT * FROM sales_exchange_items WHERE exchange_id=? ORDER BY id', [id]);
    const hasItems = body.items !== undefined || body.return_items !== undefined || body.new_items !== undefined;
    const merged = { ...current, ...body, items: hasItems ? body.items : saved };
    const reason = body.reason ?? body.exchange_reason ?? current.exchange_reason;
    if (!reason) throw validationError('换货原因不能为空');
    merged.exchange_date = normalizeSalesDate(merged.exchange_date, '换货日期');
    if (status !== 'rejected') {
      const { order, outboundId, items } = await prepareExchange(connection, merged, id);
      if (!lockedOrderIds.has(Number(order.id))) throw validationError('换货来源已变更，请刷新单据后重试');
      await connection.query(
        'UPDATE sales_exchanges SET order_id=?,order_no=?,outbound_id=?,customer_id=?,customer_name=?,contact_phone=?,exchange_date=?,exchange_reason=?,remarks=?,status=?,updated_at=NOW() WHERE id=?',
        [order.id,order.order_no,outboundId,order.customer_id,order.customer_name,merged.contact_phone,merged.exchange_date,reason,
          body.remark ?? body.remarks ?? current.remarks,status,id]
      );
      if (hasItems) {
        await connection.query('DELETE FROM sales_exchange_items WHERE exchange_id=?', [id]);
        await saveExchangeItems(connection, id, items);
      } else if (Number(current.order_id) !== Number(order.id) || Number(current.outbound_id) !== Number(outboundId) || saved.some(item => item.tax_percent == null)) {
        await saveExchangeItems(connection, id, items, saved);
      }
    } else {
      await connection.query('UPDATE sales_exchanges SET status=?,remarks=?,updated_at=NOW() WHERE id=?', [status,body.remarks ?? body.remark ?? current.remarks,id]);
    }
    if (status === 'completed') await processExchangeInventory(connection, id, await getCurrentUserName(req));
    await connection.commit();
    return ResponseHandler.success(res, { id: Number(id), status, previousStatus }, '换货单更新成功');
  } catch (error) {
    if (connection) await connection.rollback();
    logger.error('更新销售换货单失败:', error);
    return ResponseHandler.error(res, error.message, error.code || 'SERVER_ERROR', error.statusCode || 500);
  } finally {
    if (connection) connection.release();
  }
};

// 添加删除换货单功能

exports.deleteSalesExchange = async (req, res) => {
  {
    const { id } = req.params;
    if (id !== null && id !== undefined && id !== '') {
      const ScopeGuard = require('../../../authorization/ScopeGuard');
      if (!(await ScopeGuard.assertAccess(db.pool, req, 'sales_exchange', id))) {
        return ResponseHandler.forbidden(res, '无权删除该销售换货单');
      }
    }
  }

  let connection;
  try {
    const { id } = req.params;

    connection = await db.pool.getConnection();
    await connection.beginTransaction();

    const [existing] = await connection.query(
      'SELECT id, status FROM sales_exchanges WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );
    if (existing.length === 0) {
      await connection.rollback();
      return ResponseHandler.notFound(res, 'Exchange order not found');
    }

    if (['processing', 'completed', 'rejected', '处理中', '已完成', '已拒绝'].includes(existing[0].status)) {
      await connection.rollback();
      return ResponseHandler.error(res, 'Current exchange status cannot be deleted', 'VALIDATION_ERROR', 400);
    }

    // 删除明细
    await connection.query('DELETE FROM sales_exchange_items WHERE exchange_id = ?', [id]);

    // ✅ 软删除换货单主表
    await softDelete(connection, 'sales_exchanges', 'id', id);

    await connection.commit();

    return ResponseHandler.success(res, {
      message: '销售换货单删除成功',
      id: parseInt(id),
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('删除销售换货单失败:', error);
    ResponseHandler.error(res, '删除销售换货单失败', 'SERVER_ERROR', 500);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// 更新换货单状态（前端 salesApi.updateExchangeStatus 对应接口）

exports.updateExchangeStatus = (req, res) => exports.updateSalesExchange({ ...req, body: { status: req.body?.status } }, res);

async function processExchangeInventory(connection, exchangeId, operator) {
  const [[exchange]] = await connection.query('SELECT exchange_no, exchange_date FROM sales_exchanges WHERE id=? AND deleted_at IS NULL', [exchangeId]);
  if (!exchange) throw validationError('换货单不存在');
  const [items] = await connection.query(
    `SELECT i.*, m.id AS material_id, m.location_id, m.unit_id
       FROM sales_exchange_items i
       LEFT JOIN materials m ON CONVERT(i.product_code USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(m.code USING utf8mb4) COLLATE utf8mb4_unicode_ci AND m.deleted_at IS NULL
      WHERE i.exchange_id=? ORDER BY (i.item_type='return') DESC, i.id`, [exchangeId]
  );
  if (!items.length) throw validationError('换货明细不能为空');
  const InventoryService = require('../../../services/InventoryService');
  for (const item of items) {
    if (!item.material_id || !item.location_id) throw validationError(`商品 ${item.product_code} 不存在或未配置默认仓库`);
    const isReturn = item.item_type === 'return';
    await InventoryService.updateStock({
      materialId: item.material_id, locationId: item.location_id,
      quantity: (isReturn ? 1 : -1) * Number(item.quantity),
      transactionType: isReturn ? 'sales_exchange_return' : 'sales_exchange_out',
      referenceNo: exchange.exchange_no, referenceType: 'sales_exchange',
      sourceId: Number(exchangeId), sourceLineKey: `sales_exchange:${exchangeId}:${item.id}`,
      operator, remark: `${isReturn ? '换货退回' : '换货发出'}：${item.product_name}`, unitId: item.unit_id,
      transactionDate: exchange.exchange_date,
      batchNumber: isReturn ? `EX-${exchange.exchange_no}-${item.material_id}` : null,
      idempotencyKey: `sales_exchange:${exchangeId}:${item.id}`,
    }, connection);
  }
}

// 根据物料来源自动生成后续单据（使用统一的新函数）
async function autoGenerateFollowUpDocuments(salesOrderId, items, userInfo) {
  try {
    logger.debug('Generating sales order follow-up documents', {
      salesOrderId,
      itemCount: Array.isArray(items) ? items.length : 0,
    });

    // 获取物料信息和来源类型，同时检查库存
    const materialsBySource = await getMaterialsBySourceWithInventoryCheck(items);

    logger.info('Sales order inventory check completed', {
      internalShortage: materialsBySource.internal.length,
      externalShortage: materialsBySource.external.length,
      sufficient: materialsBySource.sufficient.length,
    });

    // 合并库存不足的物料列表
    const insufficientItems = [...materialsBySource.internal, ...materialsBySource.external];

    if (insufficientItems.length === 0) {
      logger.info('Sales order inventory is sufficient; no production plan or purchase requisition needed');
      const connection = await db.pool.getConnection();
      try {
        await connection.beginTransaction();
        const [orderRows] = await connection.execute(
          'SELECT order_no, created_by FROM sales_orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
          [salesOrderId]
        );
        if (orderRows.length === 0) {
          await connection.rollback();
          return 'shortage';
        }
        const order = orderRows[0];
        const reservationResult = await InventoryReservationService.reserveInventoryForOrder(
          salesOrderId,
          order.order_no || String(salesOrderId),
          items,
          userInfo.id || userInfo.userId || order.created_by || null,
          connection
        );
        await connection.commit();
        return reservationResult.fullSuccess ? 'ready_to_ship' : 'shortage';
      } catch (reservationError) {
        await connection.rollback();
        logger.error('库存充足但预留失败:', reservationError);
        return 'shortage';
      } finally {
        connection.release();
      }
    }

    logger.info(`Sales order has ${insufficientItems.length} material shortages; generating follow-up plans`);

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
    return 'shortage';
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
            logger.debug(
              `Internal material shortage: code=${material.code}, name=${material.name}, shortage=${insufficientItem.shortage}`
            );
          } else if (material.source_type === 'external') {
            materialsBySource.external.push(insufficientItem);
            logger.debug(
              `External material shortage: code=${material.code}, name=${material.name}, shortage=${insufficientItem.shortage}`
            );
          } else {
            // 如果来源类型未设置，默认作为外购物料处理
            insufficientItem.source_type = 'external';
            materialsBySource.external.push(insufficientItem);
            logger.warn(
              `Material source is not configured; defaulting to external purchase: code=${material.code}, name=${material.name}, shortage=${insufficientItem.shortage}`
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

// 使用统一的编号生成服务 - 用于采购申请编号生成


// ==================== 订单锁定功能 ====================

/**
 * 锁定销售订单
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */

// 导出内部工具函数供其他销售模块使用
exports.autoGenerateFollowUpDocuments = autoGenerateFollowUpDocuments;
