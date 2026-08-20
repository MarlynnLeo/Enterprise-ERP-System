/**
 * inventoryController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { INVENTORY_TRANSFER_TRANSITIONS } = require('../../../constants/statusRegistry');
const { CodeGenerators } = require('../../../utils/codeGenerator');
const { parsePagination, appendPaginationSQL } = require('../../../utils/safePagination');

const db = require('../../../config/db');
const { softDelete, softDeleteBatch } = require('../../../utils/softDelete');
const InventoryService = require('../../../services/InventoryService');
const businessConfig = require('../../../config/businessConfig');
const { getCurrentUserName } = require('../../../utils/userHelper');

const { getTransferStatusText } = require('../../../constants/systemConstants');
const { getRequestActorLabel } = require('../../../utils/userUtils');
const { inventoryTransferMap } = require('../../../utils/inventory/inventoryFieldMap');
const ScopeGuard = require('../../../authorization/ScopeGuard');
const DataScopeService = require('../../../services/DataScopeService');

const MAX_TRANSFER_ITEMS = 500;

function parsePositiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeTransferItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_TRANSFER_ITEMS) {
    return null;
  }

  const normalized = [];
  const materialIds = new Set();
  for (const item of items) {
    const materialId = parsePositiveId(item?.material_id);
    const quantity = Number(item?.quantity);
    if (!materialId || !Number.isFinite(quantity) || quantity <= 0 || materialIds.has(materialId)) {
      return null;
    }
    materialIds.add(materialId);
    normalized.push({ ...item, material_id: materialId, quantity });
  }
  return normalized;
}

function isValidTransferDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function canAccessTransferLocations(req, fromLocationId, toLocationId) {
  const [fromAllowed, toAllowed] = await Promise.all([
    DataScopeService.canAccessLocation(req, fromLocationId),
    DataScopeService.canAccessLocation(req, toLocationId),
  ]);
  return fromAllowed && toAllowed;
}

async function assertTransferReferences(connection, fromLocationId, toLocationId, items) {
  const [locations] = await connection.execute(
    'SELECT id FROM locations WHERE id IN (?, ?) AND status = 1 FOR UPDATE',
    [fromLocationId, toLocationId]
  );
  if (new Set(locations.map((row) => Number(row.id))).size !== 2) {
    throw Object.assign(new Error('源库位或目标库位不存在/已停用'), { statusCode: 400 });
  }

  const materialIds = items.map((item) => item.material_id);
  const placeholders = materialIds.map(() => '?').join(',');
  const [materials] = await connection.execute(
    `SELECT id FROM materials
      WHERE id IN (${placeholders}) AND deleted_at IS NULL AND status = 1`,
    materialIds
  );
  if (new Set(materials.map((row) => Number(row.id))).size !== materialIds.length) {
    throw Object.assign(new Error('调拨明细包含不存在或已停用的物料'), { statusCode: 400 });
  }
}

const STATUS = {
  OUTBOUND: businessConfig.status.outbound,
  INBOUND: businessConfig.status.inbound,
  PRODUCTION_TASK: businessConfig.status.productionTask,
  PRODUCTION_PLAN: businessConfig.status.productionPlan,
  APPROVAL: businessConfig.status.approval,
  TRANSFER: businessConfig.status.transfer,
};

/**
 * 获取物料的批次号（FIFO原则）
 * @param {object} connection - 数据库连接
 * @param {number} materialId - 物料ID
 * @param {number} locationId - 库位ID（可选）
 * @param {string} fallbackBatchNo - 调用方显式传入的候选批次号
 * @returns {Promise<string>} 批次号
 */

const getTransferList = async (req, res) => {
  try {
    // 列表查询 camel → snake
    const q = inventoryTransferMap.fromListQuery(req.query || {});
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    const transfer_no = q.transfer_no || '';
    const status = q.status || '';
    const from_location_id = q.from_location_id || '';
    const to_location_id = q.to_location_id || '';
    const start_date = q.start_date || '';
    const end_date = q.end_date || '';
    const materialName = req.query.materialName || '';
    const pagination = parsePagination(page, limit, { maxPageSize: 100, defaultPageSize: 10 });

    const scopeClause = await ScopeGuard.applyListScope(req, 'inventory_transfer', {
      tableAlias: 't',
      ownerAlias: 'inventory_transfer_owner_scope',
    });
    let whereClause = 'WHERE t.deleted_at IS NULL';
    const params = [];

    if (transfer_no) {
      whereClause += ' AND t.transfer_no LIKE ?';
      params.push(`%${transfer_no}%`);
    }

    if (status) {
      whereClause += ' AND t.status = ?';
      params.push(status);
    }

    if (from_location_id) {
      whereClause += ' AND t.from_location_id = ?';
      params.push(from_location_id);
    }

    if (to_location_id) {
      whereClause += ' AND t.to_location_id = ?';
      params.push(to_location_id);
    }

    if (start_date && end_date) {
      whereClause += ' AND t.transfer_date BETWEEN ? AND ?';
      params.push(start_date, end_date);
    } else if (start_date) {
      whereClause += ' AND t.transfer_date >= ?';
      params.push(start_date);
    } else if (end_date) {
      whereClause += ' AND t.transfer_date <= ?';
      params.push(end_date);
    }

    if (materialName) {
      whereClause += ` AND EXISTS (
        SELECT 1
        FROM inventory_transfer_items ti_search
        LEFT JOIN materials m_search ON ti_search.material_id = m_search.id
        WHERE ti_search.transfer_id = t.id
          AND (m_search.name LIKE ? OR m_search.code LIKE ? OR m_search.specs LIKE ?)
      )`;
      params.push(`%${materialName}%`, `%${materialName}%`, `%${materialName}%`);
    }

    whereClause += scopeClause.where || '';
    params.push(...(scopeClause.params || []));

    // 获取总记录数
    const [countResult] = await db.pool.execute(
      `SELECT COUNT(*) as total FROM inventory_transfers t ${scopeClause.join} ${whereClause}`,
      params
    );

    const total = countResult[0].total;

    const query = appendPaginationSQL(
      `
      SELECT
        t.id,
        t.transfer_no,
        t.transfer_date,
        t.from_location_id,
        t.to_location_id,
        fl.name as from_location,
        tl.name as to_location,
        t.status,
        t.remark,
        t.creator,
        (SELECT COALESCE(u.real_name, t.creator)
         FROM users u
         WHERE u.username = t.creator OR u.real_name = t.creator
         LIMIT 1) as creator_name,
        t.created_at,
        t.updated_at,
        (SELECT COUNT(*) FROM inventory_transfer_items WHERE transfer_id = t.id) as item_count
      FROM inventory_transfers t
      LEFT JOIN locations fl ON t.from_location_id = fl.id
      LEFT JOIN locations tl ON t.to_location_id = tl.id
      ${scopeClause.join}
      ${whereClause}
      ORDER BY t.created_at DESC`,
      pagination.limit,
      pagination.offset
    );

    const [transfers] = await db.pool.query(query, params);

    // 出参仅 camel
    const mappedTransfers = transfers.map((t) => inventoryTransferMap.toApi(t));

    ResponseHandler.paginated(
      res,
      mappedTransfers,
      total,
      pagination.page,
      pagination.pageSize,
      '获取调拨单列表成功'
    );
  } catch (error) {
    logger.error('获取调拨单列表失败:', error);
    ResponseHandler.error(res, '获取调拨单列表失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取库存调拨单详情

const getTransferDetail = async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) {
    return ResponseHandler.error(res, '调拨单ID无效', 'VALIDATION_ERROR', 400);
  }
  if (
    !(await ScopeGuard.assertAccess(db.pool, req, 'inventory_transfer', id, {
      accessMode: 'read',
    }))
  ) {
    return ResponseHandler.forbidden(res, '无权访问该调拨单');
  }

  try {
    // 获取调拨单基本信息
    const [transferResults] = await db.pool.execute(
      `SELECT
        t.id,
        t.transfer_no,
        t.transfer_date,
        t.from_location_id,
        t.to_location_id,
        fl.name as from_location,
        tl.name as to_location,
        t.status,
        t.remark,
        t.creator,
        t.created_at,
        t.updated_at
      FROM inventory_transfers t
      LEFT JOIN locations fl ON t.from_location_id = fl.id
      LEFT JOIN locations tl ON t.to_location_id = tl.id
      WHERE t.id = ? AND t.deleted_at IS NULL`,
      [id]
    );

    if (transferResults.length === 0) {
      return ResponseHandler.error(res, '调拨单不存在', 'NOT_FOUND', 404);
    }

    const transfer = transferResults[0];

    // 获取调拨单物料明细
    const [items] = await db.pool.execute(
      `SELECT
        i.id,
        i.material_id,
        m.code as material_code,
        m.name as material_name,
        m.specs as specification,
        i.quantity,
        u.id as unit_id,
        u.name as unit_name
      FROM inventory_transfer_items i
      LEFT JOIN materials m ON i.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      WHERE i.transfer_id = ?`,
      [id]
    );

    // 返回组合结果（仅 camel）
    ResponseHandler.success(
      res,
      inventoryTransferMap.toApi({
        ...transfer,
        items,
      }),
      '获取调拨单详情成功'
    );
  } catch (error) {
    logger.error('获取调拨单详情失败:', error);
    ResponseHandler.error(res, '获取调拨单详情失败', 'SERVER_ERROR', 500, error);
  }
};

// 创建库存调拨单

const getTransferDetails = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return ResponseHandler.error(res, '请提供有效的调拨单ID数组', 'VALIDATION_ERROR', 400);
    }

    const transferIds = ids.map((id) => Number(id));
    if (
      transferIds.some((id) => !Number.isInteger(id) || id <= 0) ||
      new Set(transferIds).size !== transferIds.length
    ) {
      return ResponseHandler.error(res, '请提供有效的调拨单ID数组', 'VALIDATION_ERROR', 400);
    }

    if (transferIds.length > 100) {
      return ResponseHandler.error(res, '批量查询数量不能超过100条', 'VALIDATION_ERROR', 400);
    }

    if (
      !(await ScopeGuard.assertAllAccess(db.pool, req, 'inventory_transfer', transferIds, {
        accessMode: 'read',
      }))
    ) {
      return ResponseHandler.forbidden(res, '批量调拨单中包含无权访问的记录');
    }

    const placeholders = transferIds.map(() => '?').join(',');
    const [transfers] = await db.pool.query(
      `SELECT
        t.id,
        t.transfer_no,
        t.transfer_date,
        t.from_location_id,
        t.to_location_id,
        fl.name as from_location,
        tl.name as to_location,
        t.status,
        t.remark,
        t.creator,
        t.created_at,
        t.updated_at
      FROM inventory_transfers t
      LEFT JOIN locations fl ON t.from_location_id = fl.id
      LEFT JOIN locations tl ON t.to_location_id = tl.id
      WHERE t.id IN (${placeholders}) AND t.deleted_at IS NULL`,
      transferIds
    );

    if (transfers.length !== transferIds.length) {
      return ResponseHandler.error(res, '部分调拨单不存在或已删除', 'NOT_FOUND', 404);
    }

    const [items] = await db.pool.query(
      `SELECT
        i.id,
        i.transfer_id,
        i.material_id,
        m.code as material_code,
        m.name as material_name,
        m.specs as specification,
        i.quantity,
        u.id as unit_id,
        u.name as unit_name
      FROM inventory_transfer_items i
      LEFT JOIN materials m ON i.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      WHERE i.transfer_id IN (${placeholders})`,
      transferIds
    );

    const itemsByTransferId = new Map();
    items.forEach((item) => {
      const list = itemsByTransferId.get(item.transfer_id) || [];
      list.push(item);
      itemsByTransferId.set(item.transfer_id, list);
    });

    const transferById = new Map(
      transfers.map((transfer) => [
        transfer.id,
        {
          ...transfer,
          items: itemsByTransferId.get(transfer.id) || [],
        },
      ])
    );

    const orderedTransfers = transferIds
      .map((id) => transferById.get(id))
      .filter(Boolean);

    ResponseHandler.success(res, orderedTransfers, '批量获取调拨单详情成功');
  } catch (error) {
    logger.error('批量获取调拨单详情失败:', error);
    ResponseHandler.error(res, '批量获取调拨单详情失败', 'SERVER_ERROR', 500, error);
  }
};

const createTransfer = async (req, res) => {
  const connection = await db.pool.getConnection();
  let transactionStarted = false;
  try {
    // HTTP camel → snake（inventoryTransferMap）
    const mapped = inventoryTransferMap.fromApi(req.body || {});
    const transfer_date = mapped.transfer_date || new Date().toISOString().slice(0, 10);
    const from_location_id = parsePositiveId(mapped.from_location_id);
    const to_location_id = parsePositiveId(mapped.to_location_id);
    const items = normalizeTransferItems(mapped.items);
    const remark = mapped.remark;
    const status = STATUS.TRANSFER.DRAFT || 'draft';

    // 基本验证
    if (
      !from_location_id ||
      !to_location_id ||
      !items ||
      !isValidTransferDate(transfer_date)
    ) {
      return ResponseHandler.error(
        res,
        `请提供有效的调拨日期、源库位、目标库位和1-${MAX_TRANSFER_ITEMS}条不重复物料明细`,
        'VALIDATION_ERROR',
        400
      );
    }

    if (mapped.status !== undefined && mapped.status !== status) {
      return ResponseHandler.error(res, '新建调拨单只能为草稿状态', 'VALIDATION_ERROR', 400);
    }

    if (from_location_id === to_location_id) {
      return ResponseHandler.error(res, '源库位和目标库位不能相同', 'VALIDATION_ERROR', 400);
    }

    if (!(await canAccessTransferLocations(req, from_location_id, to_location_id))) {
      return ResponseHandler.forbidden(res, '无权使用源库位或目标库位');
    }

    // ===== 年度结存校验 =====
    const PeriodValidationService = require('../../../services/business/PeriodValidationService');
    const inventoryCheck = await PeriodValidationService.validateInventoryTransaction(transfer_date);
    if (!inventoryCheck.allowed) {
      return ResponseHandler.error(res, inventoryCheck.message, 'VALIDATION_ERROR', 400);
    }
    // ===== 年度结存校验结束 =====

    await connection.beginTransaction();
    transactionStarted = true;
    await assertTransferReferences(connection, from_location_id, to_location_id, items);
    if (!(await canAccessTransferLocations(req, from_location_id, to_location_id))) {
      throw Object.assign(new Error('无权使用源库位或目标库位'), { statusCode: 403 });
    }

    // 验证物料明细
    for (const item of items) {
      // 使用统一的库存服务检查库存是否足够
      const validation = await InventoryService.validateStock(
        item.material_id,
        from_location_id,
        item.quantity,
        connection
      );

      if (!validation.isEnough) {
        const [materialResult] = await connection.execute(
          'SELECT name FROM materials WHERE id = ? AND deleted_at IS NULL',
          [item.material_id]
        );
        const materialName =
          materialResult.length > 0 ? materialResult[0].name : `物料ID: ${item.material_id}`;
        await connection.rollback();
        transactionStarted = false;
        return ResponseHandler.error(
          res,
          `库存不足: ${materialName} 当前库存 ${validation.currentStock}, 需要 ${item.quantity}`,
          'VALIDATION_ERROR',
          400
        );
      }
    }

    // 生成调拨单号
    const transfer_no = await CodeGenerators.generateTransferCode(connection);

    // 创建调拨单
    const [transferResult] = await connection.execute(
      `INSERT INTO inventory_transfers (
        transfer_no,
        transfer_date,
        from_location_id,
        to_location_id,
        status,
        remark,
        creator,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transfer_no,
        transfer_date,
        from_location_id,
        to_location_id,
        status,
        remark || '',
        getRequestActorLabel(req),
        ScopeGuard.tryStampOwner(req, 'inventory_transfer').created_by,
      ]
    );

    const transferId = transferResult.insertId;

    // 添加调拨物料明细
    for (const item of items) {
      await connection.execute(
        `INSERT INTO inventory_transfer_items (
          transfer_id,
          material_id,
          quantity
        ) VALUES (?, ?, ?)`,
        [transferId, item.material_id, item.quantity]
      );
    }

    await connection.commit();
    transactionStarted = false;

    ResponseHandler.success(
      res,
      inventoryTransferMap.toApi({
        id: transferId,
        transfer_no,
        transfer_date,
        from_location_id,
        to_location_id,
        status,
        remark: remark || '',
      }),
      '创建成功',
      201
    );
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the original error.
      }
    }
    logger.error('创建库存调拨单失败:', error);
    const statusCode = Number(error.statusCode) === 400 ? 400 : 500;
    ResponseHandler.error(
      res,
      statusCode === 400 ? error.message : '创建库存调拨单失败',
      statusCode === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
      statusCode,
      error
    );
  } finally {
    connection.release();
  }
};

// 更新库存调拨单

const updateTransfer = async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) {
    return ResponseHandler.error(res, '调拨单ID无效', 'VALIDATION_ERROR', 400);
  }
  if (!(await ScopeGuard.assertAccess(db.pool, req, 'inventory_transfer', id))) {
    return ResponseHandler.forbidden(res, '无权修改该调拨单');
  }

  const connection = await db.pool.getConnection();
  let transactionStarted = false;
  try {
    // HTTP camel → snake
    const mapped = inventoryTransferMap.fromApi(req.body || {});
    const transfer_date = mapped.transfer_date;
    const from_location_id = parsePositiveId(mapped.from_location_id);
    const to_location_id = parsePositiveId(mapped.to_location_id);
    const items = normalizeTransferItems(mapped.items);
    const remark = mapped.remark;

    if (
      !from_location_id ||
      !to_location_id ||
      !items ||
      !isValidTransferDate(transfer_date)
    ) {
      return ResponseHandler.error(
        res,
        `请提供有效的调拨日期、源库位、目标库位和1-${MAX_TRANSFER_ITEMS}条不重复物料明细`,
        'VALIDATION_ERROR',
        400
      );
    }

    if (from_location_id === to_location_id) {
      return ResponseHandler.error(res, '源库位和目标库位不能相同', 'VALIDATION_ERROR', 400);
    }

    if (!(await canAccessTransferLocations(req, from_location_id, to_location_id))) {
      return ResponseHandler.forbidden(res, '无权使用源库位或目标库位');
    }

    const PeriodValidationService = require('../../../services/business/PeriodValidationService');
    const inventoryCheck = await PeriodValidationService.validateInventoryTransaction(transfer_date);
    if (!inventoryCheck.allowed) {
      return ResponseHandler.error(res, inventoryCheck.message, 'VALIDATION_ERROR', 400);
    }

    await connection.beginTransaction();
    transactionStarted = true;

    // 检查调拨单是否存在
    const [transferResult] = await connection.execute(
      'SELECT status, from_location_id, to_location_id FROM inventory_transfers WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );

    if (transferResult.length === 0) {
      await connection.rollback();
      transactionStarted = false;
      return ResponseHandler.error(res, '调拨单不存在', 'NOT_FOUND', 404);
    }

    if (!(await ScopeGuard.assertAccess(connection, req, 'inventory_transfer', id))) {
      await connection.rollback();
      transactionStarted = false;
      return ResponseHandler.forbidden(res, '无权修改该调拨单');
    }
    if (!(await canAccessTransferLocations(req, transferResult[0].from_location_id, transferResult[0].to_location_id))) {
      await connection.rollback();
      transactionStarted = false;
      return ResponseHandler.forbidden(res, '无权使用该调拨单的源库位或目标库位');
    }

    const currentStatus = transferResult[0].status;

    // 只有草稿状态的调拨单可以更新
    if (currentStatus !== 'draft') {
      await connection.rollback();
      transactionStarted = false;
      return ResponseHandler.error(res, '只有草稿状态的调拨单可以更新', 'VALIDATION_ERROR', 400);
    }

    await assertTransferReferences(connection, from_location_id, to_location_id, items);
    if (!(await canAccessTransferLocations(req, from_location_id, to_location_id))) {
      throw Object.assign(new Error('无权使用源库位或目标库位'), { statusCode: 403 });
    }

    // 验证物料明细
    for (const item of items) {
      const validation = await InventoryService.validateStock(
        item.material_id,
        from_location_id,
        item.quantity,
        connection
      );
      if (!validation.isEnough) {
        const [materialResult] = await connection.execute(
          'SELECT name FROM materials WHERE id = ? AND deleted_at IS NULL',
          [item.material_id]
        );
        const materialName =
          materialResult.length > 0 ? materialResult[0].name : `物料ID: ${item.material_id}`;
        await connection.rollback();
        transactionStarted = false;
        return ResponseHandler.error(
          res,
          `库存不足: ${materialName} 当前库存 ${validation.currentStock}, 需要 ${item.quantity}`,
          'VALIDATION_ERROR',
          400
        );
      }
    }

    // 更新调拨单
    await connection.execute(
      `UPDATE inventory_transfers SET
        transfer_date = ?,
        from_location_id = ?,
        to_location_id = ?,
        remark = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL`,
      [transfer_date, from_location_id, to_location_id, remark || '', id]
    );

    // 删除旧的物料明细
    await connection.execute('DELETE FROM inventory_transfer_items WHERE transfer_id = ?', [id]);

    // 添加新的物料明细
    for (const item of items) {
      await connection.execute(
        `INSERT INTO inventory_transfer_items (
          transfer_id,
          material_id,
          quantity
        ) VALUES (?, ?, ?)`,
        [id, item.material_id, item.quantity]
      );
    }

    await connection.commit();
    transactionStarted = false;

    ResponseHandler.success(
      res,
      inventoryTransferMap.toApi({
        id: Number(id),
        transfer_date,
        from_location_id,
        to_location_id,
        remark: remark || '',
        status: currentStatus,
      }),
      '调拨单更新成功'
    );
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the original error.
      }
    }
    logger.error('更新库存调拨单失败:', error);
    const statusCode = Number(error.statusCode) === 400 ? 400 : 500;
    ResponseHandler.error(
      res,
      statusCode === 400 ? error.message : '更新库存调拨单失败',
      statusCode === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
      statusCode,
      error
    );
  } finally {
    connection.release();
  }
};

// 删除库存调拨单

const deleteTransfer = async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) {
    return ResponseHandler.error(res, '调拨单ID无效', 'VALIDATION_ERROR', 400);
  }
  if (!(await ScopeGuard.assertAccess(db.pool, req, 'inventory_transfer', id))) {
    return ResponseHandler.forbidden(res, '无权删除该调拨单');
  }

  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    // 检查调拨单是否存在
    const [transferResult] = await connection.execute(
      'SELECT status FROM inventory_transfers WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );

    if (transferResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '调拨单不存在', 'NOT_FOUND', 404);
    }

    if (!(await ScopeGuard.assertAccess(connection, req, 'inventory_transfer', id))) {
      await connection.rollback();
      return ResponseHandler.forbidden(res, '无权删除该调拨单');
    }

    const currentStatus = transferResult[0].status;

    // 只有草稿状态的调拨单可以删除
    if (currentStatus !== 'draft') {
      await connection.rollback();
      return ResponseHandler.error(res, '只有草稿状态的调拨单可以删除', 'VALIDATION_ERROR', 400);
    }

    // 删除调拨单物料明细
    await connection.execute('DELETE FROM inventory_transfer_items WHERE transfer_id = ?', [id]);

    // ✅ 软删除调拨单主表
    await softDelete(connection, 'inventory_transfers', 'id', id);

    await connection.commit();

    ResponseHandler.success(res, null, '调拨单删除成功');
  } catch (error) {
    await connection.rollback();
    logger.error('删除库存调拨单失败:', error);
    ResponseHandler.error(res, '删除库存调拨单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 更新库存调拨单状态

const updateTransferStatus = async (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id) {
    return ResponseHandler.error(res, '调拨单ID无效', 'VALIDATION_ERROR', 400);
  }
  if (!(await ScopeGuard.assertAccess(db.pool, req, 'inventory_transfer', id))) {
    return ResponseHandler.forbidden(res, '无权变更该调拨单状态');
  }

  const { newStatus } = req.body || {};

  const validStatuses = ['draft', 'pending', 'approved', 'completed', 'reversed', 'cancelled'];
  if (!validStatuses.includes(newStatus)) {
    return ResponseHandler.error(res, '无效的状态值', 'VALIDATION_ERROR', 400);
  }

  const isDeadlockError = (err) =>
    err && (err.code === 'ER_LOCK_DEADLOCK' || /Deadlock/i.test(err.message || ''));

  const operatorName = await getCurrentUserName(req);
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [transferResults] = await connection.execute(
        `SELECT
          t.*,
          fl.name as from_location_name,
          tl.name as to_location_name
        FROM inventory_transfers t
        LEFT JOIN locations fl ON t.from_location_id = fl.id
        LEFT JOIN locations tl ON t.to_location_id = tl.id
        WHERE t.id = ? AND t.deleted_at IS NULL
        FOR UPDATE`,
        [id]
      );

      if (transferResults.length === 0) {
        await connection.rollback();
        return ResponseHandler.error(res, '调拨单不存在', 'NOT_FOUND', 404);
      }

      const transfer = transferResults[0];
      if (!(await ScopeGuard.assertAccess(connection, req, 'inventory_transfer', id))) {
        await connection.rollback();
        return ResponseHandler.forbidden(res, '无权变更该调拨单状态');
      }
      if (!(await canAccessTransferLocations(req, transfer.from_location_id, transfer.to_location_id))) {
        await connection.rollback();
        return ResponseHandler.forbidden(res, '无权使用该调拨单的源库位或目标库位');
      }
      const currentStatus = transfer.status;
      const validTransitions = INVENTORY_TRANSFER_TRANSITIONS;

      if (
        !validTransitions[currentStatus] ||
        !validTransitions[currentStatus].includes(newStatus)
      ) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `调拨单状态无法从 "${currentStatus}" 变更为 "${newStatus}"`,
          'VALIDATION_ERROR',
          400
        );
      }

      if (currentStatus === STATUS.TRANSFER.APPROVED && newStatus === STATUS.TRANSFER.COMPLETED) {
        const [items] = await connection.execute(
          `SELECT
            i.id,
            i.material_id,
            i.quantity,
            m.name as material_name,
            m.unit_id
          FROM inventory_transfer_items i
          LEFT JOIN materials m ON i.material_id = m.id
          WHERE i.transfer_id = ?
          ORDER BY i.material_id ASC, i.id ASC`,
          [id]
        );

        if (items.length === 0) {
          await connection.rollback();
          return ResponseHandler.error(
            res,
            '调拨单没有有效物料明细，不能完成',
            'VALIDATION_ERROR',
            400
          );
        }

        const fromLocationName =
          transfer.from_location_name || `库位ID:${transfer.from_location_id}`;
        const toLocationName = transfer.to_location_name || `库位ID:${transfer.to_location_id}`;

        for (const item of items) {
          await InventoryService.transferStock(
            {
              materialId: item.material_id,
              fromLocationId: transfer.from_location_id,
              toLocationId: transfer.to_location_id,
              quantity: parseFloat(item.quantity),
              referenceNo: transfer.transfer_no,
              referenceType: 'transfer',
              operator: operatorName,
              remark: `从 ${fromLocationName} 调拨至 ${toLocationName}`,
              unitId: item.unit_id,
            },
            connection
          );
        }
      }

      if (
        currentStatus === STATUS.TRANSFER.COMPLETED &&
        newStatus === STATUS.TRANSFER.REVERSED
      ) {
        const [already] = await connection.execute(
          `SELECT COUNT(*) AS count
           FROM inventory_ledger
           WHERE reference_no = ?
             AND transaction_type IN ('transfer_cancel_in', 'transfer_cancel_out')`,
          [transfer.transfer_no]
        );
        if (Number(already[0]?.count || 0) > 0) {
          await connection.rollback();
          return ResponseHandler.error(
            res,
            '该调拨单已有冲销流水，禁止重复冲销',
            'VALIDATION_ERROR',
            400
          );
        }

        const [ledgerRows] = await connection.execute(
          `SELECT id, material_id, location_id, unit_id, batch_number, quantity, transaction_type
           FROM inventory_ledger
           WHERE reference_no = ?
             AND transaction_type IN ('transfer_out', 'transfer_in')
           ORDER BY material_id ASC, location_id ASC, id ASC`,
          [transfer.transfer_no]
        );

        if (ledgerRows.length === 0) {
          await connection.rollback();
          return ResponseHandler.error(
            res,
            '找不到该调拨单台账，无法安全冲销',
            'VALIDATION_ERROR',
            400
          );
        }

        for (const ledger of ledgerRows) {
          const qty = parseFloat(ledger.quantity) || 0;
          if (qty === 0 || !ledger.location_id) continue;

          const reverseQty = -qty;
          const reverseType =
            ledger.transaction_type === 'transfer_out'
              ? 'transfer_cancel_out'
              : 'transfer_cancel_in';

          await InventoryService.updateStock(
            {
              materialId: ledger.material_id,
              locationId: ledger.location_id,
              quantity: reverseQty,
              transactionType: reverseType,
              referenceNo: transfer.transfer_no,
              referenceType: 'transfer_reversal',
              operator: operatorName,
              remark: `冲销调拨单 ${transfer.transfer_no}，来源台账 ${ledger.id}`,
              unitId: ledger.unit_id,
              batchNumber:
                ledger.batch_number || `REV-TR-${transfer.transfer_no}-${ledger.id}`,
              idempotencyKey: `transfer_cancel:${transfer.transfer_no}:ledger:${ledger.id}`,
            },
            connection
          );
        }
      }

      const [statusUpdate] = await connection.execute(
        'UPDATE inventory_transfers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL AND status = ?',
        [newStatus, id, currentStatus]
      );
      if (!statusUpdate.affectedRows) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          '调拨单状态已变更，请刷新后重试',
          'VALIDATION_ERROR',
          400
        );
      }

      await connection.commit();
      return ResponseHandler.success(res, { id, status: newStatus }, '调拨单状态更新成功');
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // ignore
      }
      lastError = error;
      if (isDeadlockError(error) && attempt < 3) {
        logger.warn(`调拨状态更新死锁，整事务重试 ${attempt}/3: transferId=${id}`);
        await new Promise((r) => setTimeout(r, 40 * attempt));
        continue;
      }
      logger.error('更新库存调拨单状态失败:', error);
      return ResponseHandler.error(res, '更新库存调拨单状态失败', 'SERVER_ERROR', 500, error);
    } finally {
      connection.release();
    }
  }

  return ResponseHandler.error(res, '更新库存调拨单状态失败', 'SERVER_ERROR', 500, lastError);
};

// 获取调拨单统计信息

const getTransferStatistics = async (req, res) => {
  try {
    const scopeClause = await ScopeGuard.applyListScope(req, 'inventory_transfer', {
      tableAlias: 't',
      ownerAlias: 'inventory_transfer_stats_owner_scope',
    });
    const [results] = await db.pool.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN t.status = 'draft' THEN 1 ELSE 0 END) as draft,
        SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) as pendingCount,
        SUM(CASE WHEN t.status = 'approved' THEN 1 ELSE 0 END) as approvedCount,
        SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completedCount,
        SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END) as cancelledCount
      FROM inventory_transfers t
      ${scopeClause.join || ''}
      WHERE t.deleted_at IS NULL${scopeClause.where || ''}
    `, scopeClause.params || []);

    ResponseHandler.success(res, results[0], '获取调拨单统计信息成功');
  } catch (error) {
    logger.error('获取调拨单统计信息失败:', error);
    ResponseHandler.error(res, '获取调拨单统计信息失败', 'SERVER_ERROR', 500, error);
  }
};

// 导出调拨单

const exportTransfers = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return ResponseHandler.error(res, '请选择要导出的调拨单', 'VALIDATION_ERROR', 400);
    }

    const transferIds = ids.map((id) => Number(id));
    if (
      transferIds.some((id) => !Number.isInteger(id) || id <= 0) ||
      new Set(transferIds).size !== transferIds.length
    ) {
      return ResponseHandler.error(res, '请选择有效的调拨单ID', 'VALIDATION_ERROR', 400);
    }
    if (transferIds.length > 100) {
      return ResponseHandler.error(res, '批量导出数量不能超过100条', 'VALIDATION_ERROR', 400);
    }

    if (
      !(await ScopeGuard.assertAllAccess(db.pool, req, 'inventory_transfer', transferIds, {
        accessMode: 'read',
      }))
    ) {
      return ResponseHandler.forbidden(res, '批量调拨单中包含无权导出的记录');
    }

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('调拨单列表');

    // 设置列
    worksheet.columns = [
      { header: '调拨单号', key: 'transfer_no', width: 20 },
      { header: '调出仓库', key: 'from_location', width: 20 },
      { header: '调入仓库', key: 'to_location', width: 20 },
      { header: '状态', key: 'status_text', width: 12 },
      { header: '调拨日期', key: 'transfer_date', width: 15 },
      { header: '创建时间', key: 'created_at', width: 20 },
      { header: '备注', key: 'remarks', width: 30 },
    ];

    // 查询调拨单主表数据
    const placeholders = transferIds.map(() => '?').join(',');
    const [transfers] = await db.pool.execute(
      `
      SELECT
        t.id,
        t.transfer_no,
        t.from_location_id,
        t.to_location_id,
        t.status,
        t.transfer_date,
        t.remark AS remarks,
        t.created_at,
        fl.name as from_location,
        tl.name as to_location
      FROM inventory_transfers t
      LEFT JOIN locations fl ON t.from_location_id = fl.id
      LEFT JOIN locations tl ON t.to_location_id = tl.id
      WHERE t.id IN (${placeholders}) AND t.deleted_at IS NULL
      ORDER BY t.created_at DESC
    `,
      transferIds
    );

    // Fail closed if a requested record disappeared or was filtered by soft-delete
    // after the authorization check; never return a silent partial export.
    if (transfers.length !== transferIds.length) {
      return ResponseHandler.error(res, '部分调拨单不存在或已删除', 'NOT_FOUND', 404);
    }

    // 添加数据到表格
    transfers.forEach((transfer) => {
      worksheet.addRow({
        transfer_no: transfer.transfer_no,
        from_location: transfer.from_location || '未知',
        to_location: transfer.to_location || '未知',
        status_text: getTransferStatusText(transfer.status),
        transfer_date: transfer.transfer_date
          ? new Date(transfer.transfer_date).toLocaleDateString('zh-CN')
          : '',
        created_at: transfer.created_at
          ? new Date(transfer.created_at).toLocaleString('zh-CN')
          : '',
        remarks: transfer.remarks || '',
      });
    });

    // 批量查出所有调拨单的明细（消除 N+1）
    const allTransferIds = transfers.map(t => t.id);
    const detailPlaceholders = allTransferIds.map(() => '?').join(',');
    const [allItems] = await db.pool.execute(
      `SELECT
        ti.transfer_id,
        ti.*,
        m.code as material_code,
        m.name as material_name,
        m.specs AS specification,
        u.name as unit_name
      FROM inventory_transfer_items ti
      LEFT JOIN materials m ON ti.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      WHERE ti.transfer_id IN (${detailPlaceholders})
      ORDER BY ti.id`,
      allTransferIds
    );
    // 按 transfer_id 分组
    const itemsMap = new Map();
    for (const item of allItems) {
      if (!itemsMap.has(item.transfer_id)) itemsMap.set(item.transfer_id, []);
      itemsMap.get(item.transfer_id).push(item);
    }

    // 为每个调拨单创建详细明细表
    for (const transfer of transfers) {
      const detailSheet = workbook.addWorksheet(`调拨单${transfer.transfer_no}`);

      // 添加调拨单头信息
      detailSheet.addRow(['调拨单号:', transfer.transfer_no]);
      detailSheet.addRow(['调出仓库:', transfer.from_location || '未知']);
      detailSheet.addRow(['调入仓库:', transfer.to_location || '未知']);
      detailSheet.addRow(['状态:', getTransferStatusText(transfer.status)]);
      detailSheet.addRow([
        '调拨日期:',
        transfer.transfer_date ? new Date(transfer.transfer_date).toLocaleDateString('zh-CN') : '',
      ]);
      detailSheet.addRow(['备注:', transfer.remarks || '']);
      detailSheet.addRow([]); // 空行

      // 设置明细列
      detailSheet.columns = [
        { header: '物料编码', key: 'material_code', width: 20 },
        { header: '物料名称', key: 'material_name', width: 30 },
        { header: '规格型号', key: 'specification', width: 25 },
        { header: '调拨数量', key: 'quantity', width: 12 },
        { header: '单位', key: 'unit', width: 10 },
        { header: '备注', key: 'item_remark', width: 30 },
      ];

      const items = itemsMap.get(transfer.id) || [];
      // 添加明细数据
      items.forEach((item) => {
        detailSheet.addRow({
          material_code: item.material_code || '',
          material_name: item.material_name || '',
          specification: item.specification || '',
          quantity: item.quantity,
          unit: item.unit_name || '',
          item_remark: item.remark || '',
        });
      });
    }

    // 设置响应头
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="transfer_export_${Date.now()}.xlsx"`
    );

    // 发送文件
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('导出调拨单失败:', error);
    ResponseHandler.error(res, '导出调拨单失败', 'SERVER_ERROR', 500, error);
  }
};

// 批量删除调拨单

const batchDeleteTransfers = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '请选择要删除的调拨单', 'VALIDATION_ERROR', 400);
    }

    const transferIds = ids.map((id) => Number(id));
    if (
      transferIds.some((id) => !Number.isInteger(id) || id <= 0) ||
      new Set(transferIds).size !== transferIds.length
    ) {
      await connection.rollback();
      return ResponseHandler.error(res, '请选择有效的调拨单ID', 'VALIDATION_ERROR', 400);
    }
    if (transferIds.length > 100) {
      await connection.rollback();
      return ResponseHandler.error(res, '批量删除数量不能超过100条', 'VALIDATION_ERROR', 400);
    }

    if (
      !(await ScopeGuard.assertAllAccess(connection, req, 'inventory_transfer', transferIds, {
        accessMode: 'write',
      }))
    ) {
      await connection.rollback();
      return ResponseHandler.forbidden(res, '批量调拨单中包含无权删除的记录');
    }

    // 检查所有调拨单的状态
    const placeholders = transferIds.map(() => '?').join(',');
    const [transferResults] = await connection.execute(
      `SELECT id, transfer_no, status, from_location_id, to_location_id
         FROM inventory_transfers
        WHERE id IN (${placeholders}) AND deleted_at IS NULL
        FOR UPDATE`,
      transferIds
    );

    if (transferResults.length !== transferIds.length) {
      await connection.rollback();
      return ResponseHandler.error(res, '部分调拨单不存在或已删除', 'NOT_FOUND', 404);
    }

    if (!(await ScopeGuard.assertAllAccess(connection, req, 'inventory_transfer', transferIds, { accessMode: 'write' }))) {
      await connection.rollback();
      return ResponseHandler.forbidden(res, '批量调拨单中包含无权删除的记录');
    }
    for (const transfer of transferResults) {
      if (!(await canAccessTransferLocations(req, transfer.from_location_id, transfer.to_location_id))) {
        await connection.rollback();
        return ResponseHandler.forbidden(res, '批量调拨单包含无权使用的库位');
      }
    }

    // 检查是否有非草稿状态的调拨单
    const nonDraftTransfers = transferResults.filter((t) => t.status !== 'draft');
    if (nonDraftTransfers.length > 0) {
      await connection.rollback();
      const nonDraftNos = nonDraftTransfers.map((t) => t.transfer_no).join(', ');
      return ResponseHandler.error(
        res,
        `以下调拨单不是草稿状态，无法删除: ${nonDraftNos}`,
        'VALIDATION_ERROR',
        400
      );
    }

    // 批量删除调拨单物料明细
    await connection.execute(
      `DELETE FROM inventory_transfer_items WHERE transfer_id IN (${placeholders})`,
      transferIds
    );

    // ✅ 批量软删除调拨单
    const affected = await softDeleteBatch(connection, 'inventory_transfers', 'id', transferIds);
    const result = { affectedRows: affected };

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        deleted: result.affectedRows,
      },
      `成功删除 ${result.affectedRows} 个调拨单`
    );
  } catch (error) {
    await connection.rollback();
    logger.error('批量删除调拨单失败:', error);
    ResponseHandler.error(res, '批量删除调拨单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 获取库存盘点统计信息


module.exports = {
  getTransferList,
  getTransferDetail,
  getTransferDetails,
  createTransfer,
  updateTransfer,
  deleteTransfer,
  updateTransferStatus,
  getTransferStatistics,
  exportTransfers,
  batchDeleteTransfers,
};
