/**
 * inventoryController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { mapKeysToSnake } = require('../../../utils/fieldMap');
const { logger } = require('../../../utils/logger');
const { INVENTORY_INBOUND_TRANSITIONS } = require('../../../constants/statusRegistry');

const db = require('../../../config/db');
const InventoryService = require('../../../services/InventoryService');
const businessConfig = require('../../../config/businessConfig');
const { CodeGenerators } = require('../../../utils/codeGenerator');
const { parsePagination } = require('../../../utils/safePagination');

// 统一库存查询子查询（基于 inventory_ledger 单表架构聚合计算当前库存）
const STOCK_SUBQUERY = `(SELECT material_id, location_id, COALESCE(SUM(quantity), 0) as quantity, MAX(created_at) as updated_at FROM inventory_ledger GROUP BY material_id, location_id)`;

// 引入重构后的入库处理服务
const InboundTransactionService = require('../../../services/business/InboundTransactionService');
const { getRequestActorLabel } = require('../../../utils/userUtils');
const { inventoryInboundMap } = require('../../../utils/inventory/inventoryFieldMap');

const STATUS = {
  OUTBOUND: businessConfig.status.outbound,
  INBOUND: businessConfig.status.inbound,
  PRODUCTION_TASK: businessConfig.status.productionTask,
  PRODUCTION_PLAN: businessConfig.status.productionPlan,
  APPROVAL: businessConfig.status.approval,
  TRANSFER: businessConfig.status.transfer,
};

/** 入库单状态文本映射 */
const INBOUND_STATUS_TEXT = {
  draft: '草稿',
  confirmed: '已确认',
  completed: '已完成',
  reversed: '已冲销',
  cancelled: '已取消',
};
const getStatusText = (status) => INBOUND_STATUS_TEXT[status] || status || '未知';

const toNullableInteger = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

const toRequiredInteger = (value) => {
  const parsed = toNullableInteger(value);
  return parsed && parsed > 0 ? parsed : null;
};

const toRequiredQuantity = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/**
 * 获取物料的批次号（FIFO原则）
 * @param {object} connection - 数据库连接
 * @param {number} materialId - 物料ID
 * @param {number} locationId - 库位ID（可选）
 * @param {string} fallbackBatchNo - 调用方显式传入的候选批次号
 * @returns {Promise<string>} 批次号
 */

const getInboundList = async (req, res) => {
  const startTime = Date.now();
  const connection = await db.pool.getConnection();
  try {
    const {
      page = 1,
      pageSize = 10,
      inboundNo,
      startDate,
      endDate,
      locationId,
      inboundType,
      materialName,
    } = req.query;

    // 开始查询入库单列表
    const ScopeGuard = require('../../../authorization/ScopeGuard');
    const scopeClause = await ScopeGuard.applyListScope(req, 'inventory_inbound', {
      tableAlias: 'i',
      ownerAlias: 'inbound_owner_scope',
    });

    // 构建查询条件（兼容 is_deleted + deleted_at）
    let whereClause = 'WHERE i.is_deleted = 0 AND i.deleted_at IS NULL';
    const params = [];

    if (inboundNo) {
      whereClause += ' AND i.inbound_no LIKE ?';
      params.push(`%${inboundNo}%`);
    }

    if (startDate) {
      whereClause += ' AND i.inbound_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND i.inbound_date <= ?';
      params.push(endDate);
    }

    if (locationId) {
      whereClause += ' AND i.location_id = ?';
      params.push(parseInt(locationId));
    }

    if (inboundType) {
      whereClause += ' AND i.inbound_type = ?';
      params.push(inboundType);
    }

    if (materialName) {
      whereClause += ` AND EXISTS (
        SELECT 1
        FROM inventory_inbound_items ii_search
        LEFT JOIN materials m_search ON ii_search.material_id = m_search.id
        WHERE ii_search.inbound_id = i.id
          AND (m_search.name LIKE ? OR m_search.code LIKE ? OR m_search.specs LIKE ?)
      )`;
      params.push(`%${materialName}%`, `%${materialName}%`, `%${materialName}%`);
    }

    whereClause += scopeClause.where;
    params.push(...scopeClause.params);

    // 计算分页
    const pagination = parsePagination(page, pageSize, {
      defaultPageSize: 20,
      maxPageSize: 100,
    });
    const pageNum = pagination.page;
    const pageSizeNum = pagination.pageSize;
    const offset = pagination.offset;

    // 获取总记录数
    const [totalResult] = await connection.execute(
      `SELECT COUNT(*) as total FROM inventory_inbound i ${scopeClause.join} ${whereClause}`,
      params
    );

    // 获取分页数据 - 优化查询，添加物料信息
    const query = `
      SELECT
        i.id,
        i.inbound_no,
        DATE_FORMAT(i.inbound_date, '%Y-%m-%d') as inbound_date,
        i.inbound_type,
        i.reference_type,
        i.reference_id,
        i.reference_no,
        i.location_id,
        l.name as location_name,
        i.status,
        i.operator,
        CASE
          WHEN i.operator = 'system' THEN '系统'
          ELSE COALESCE(
            (SELECT u.real_name FROM users u WHERE BINARY u.username = BINARY i.operator LIMIT 1),
            (SELECT u.username FROM users u WHERE BINARY u.username = BINARY i.operator LIMIT 1),
            i.operator
          )
        END as operator_name,
        i.remark,
        DATE_FORMAT(i.created_at, '%Y-%m-%d %H:%i:%s') as created_at,
        DATE_FORMAT(i.updated_at, '%Y-%m-%d %H:%i:%s') as updated_at,
        COALESCE(stats.items_count, 0) as items_count,
        COALESCE(stats.total_quantity, 0) as total_quantity,
        first_item.material_code,
        first_item.material_name,
        first_item.material_specs,
        first_item.first_item_quantity
       FROM inventory_inbound i
       LEFT JOIN locations l ON i.location_id = l.id
       LEFT JOIN (
         SELECT
           inbound_id,
           COUNT(*) as items_count,
           COALESCE(SUM(quantity), 0) as total_quantity
         FROM inventory_inbound_items
         GROUP BY inbound_id
       ) stats ON i.id = stats.inbound_id
       LEFT JOIN (
         SELECT
           ii.inbound_id,
           m.code as material_code,
           m.name as material_name,
           m.specs as material_specs,
           ii.quantity as first_item_quantity,
           ROW_NUMBER() OVER (PARTITION BY ii.inbound_id ORDER BY ii.id ASC) as rn
         FROM inventory_inbound_items ii
         LEFT JOIN materials m ON ii.material_id = m.id
       ) first_item ON i.id = first_item.inbound_id AND first_item.rn = 1
       ${scopeClause.join}
       ${whereClause}
       ORDER BY i.created_at DESC
       LIMIT ${pageSizeNum} OFFSET ${offset}
    `;

    const [rows] = await connection.execute(query, params);

    // 出参仅 camel（inventoryInboundMap）
    const items = rows.map((item) => {
      const api = inventoryInboundMap.toApi({
        ...item,
        remarks: item.remark,
      });
      api.operatorName = item.operator_name ?? null;
      api.itemsCount = Number(item.items_count) || 0;
      api.totalQuantity = Number(item.total_quantity) || 0;
      api.materialCode = item.material_code ?? null;
      api.materialName = item.material_name ?? null;
      api.materialSpecs = item.material_specs ?? null;
      api.firstItemQuantity =
        item.first_item_quantity != null ? Number(item.first_item_quantity) : null;
      api.statusText = getStatusText(item.status);
      return api;
    });

    const endTime = Date.now();
    const _queryTime = endTime - startTime;

    ResponseHandler.paginated(
      res,
      items,
      totalResult[0].total,
      pageNum,
      pageSizeNum,
      '获取入库单列表成功'
    );
  } catch (error) {
    logger.error('获取入库单列表失败:', error);
    ResponseHandler.error(res, '获取入库单列表失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

const getInboundStatistics = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const { inboundNo, startDate, endDate, locationId, inboundType, materialName } = req.query;
    let whereClause = 'WHERE is_deleted = 0 AND deleted_at IS NULL';
    const params = [];

    if (inboundNo) {
      whereClause += ' AND inbound_no LIKE ?';
      params.push(`%${inboundNo}%`);
    }
    if (startDate) {
      whereClause += ' AND inbound_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      whereClause += ' AND inbound_date <= ?';
      params.push(endDate);
    }
    if (locationId) {
      whereClause += ' AND location_id = ?';
      params.push(parseInt(locationId, 10));
    }
    if (inboundType) {
      whereClause += ' AND inbound_type = ?';
      params.push(inboundType);
    }

    if (materialName) {
      whereClause += ` AND EXISTS (
        SELECT 1
        FROM inventory_inbound_items ii_search
        LEFT JOIN materials m_search ON ii_search.material_id = m_search.id
        WHERE ii_search.inbound_id = inventory_inbound.id
          AND (m_search.name LIKE ? OR m_search.code LIKE ? OR m_search.specs LIKE ?)
      )`;
      params.push(`%${materialName}%`, `%${materialName}%`, `%${materialName}%`);
    }

    const [rows] = await connection.execute(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draftCount,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmedCount,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedCount,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelledCount
       FROM inventory_inbound
       ${whereClause}`,
      params
    );

    const stats = rows[0] || {};
    Object.keys(stats).forEach((key) => {
      stats[key] = Number(stats[key]) || 0;
    });

    ResponseHandler.success(res, stats, 'OK');
  } catch (error) {
    logger.error('获取入库单统计失败:', error);
    ResponseHandler.error(res, '获取入库单统计失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 获取入库单详情 - 优化版本

const getInboundDetail = async (req, res) => {
  const startTime = Date.now();
  const connection = await db.pool.getConnection();
  try {
    const { id } = req.params;

    // 查询入库单详情
    const ScopeGuard = require('../../../authorization/ScopeGuard');
    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'inventory_inbound', id, '无权访问该入库单'))) {
      return;
    }

    // 获取入库单主表信息
    const [inboundResult] = await connection.execute(
      `SELECT
        i.*,
        l.name as location_name,
        DATE_FORMAT(i.inbound_date, '%Y-%m-%d') as inbound_date,
        DATE_FORMAT(i.created_at, '%Y-%m-%d %H:%i:%s') as created_at,
        DATE_FORMAT(i.updated_at, '%Y-%m-%d %H:%i:%s') as updated_at
       FROM inventory_inbound i
       LEFT JOIN locations l ON i.location_id = l.id
       WHERE i.id = ?`,
      [id]
    );

    if (inboundResult.length === 0) {
      return ResponseHandler.error(res, '入库单不存在', 'NOT_FOUND', 404);
    }

    // 获取入库单明细
    const [itemsResult] = await connection.execute(
      `SELECT
        ii.*,
        m.code as material_code,
        m.name as material_name,
        m.specs as specification,
        u.name as unit_name,
        COALESCE(s.quantity, 0) as stock_quantity
       FROM inventory_inbound_items ii
       LEFT JOIN materials m ON ii.material_id = m.id
       LEFT JOIN units u ON ii.unit_id = u.id
       LEFT JOIN ${STOCK_SUBQUERY} s ON m.id = s.material_id AND s.location_id = ?
       WHERE ii.inbound_id = ?`,
      [inboundResult[0].location_id, id]
    );

    const inboundDetail = inventoryInboundMap.toApi({
      ...inboundResult[0],
      remark: inboundResult[0].remark,
      status_text: getStatusText(inboundResult[0].status),
      items: itemsResult,
    });

    const endTime = Date.now();
    const _queryTime = endTime - startTime;

    ResponseHandler.success(res, inboundDetail, '获取入库单详情成功');
  } catch (error) {
    logger.error('获取入库单详情失败:', error);
    ResponseHandler.error(res, '获取入库单详情失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 创建入库单

const createInbound = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    // HTTP camel → snake（inventoryInboundMap）
    const mapped = inventoryInboundMap.fromApi(req.body || {});
    const inbound_date = mapped.inbound_date;
    const warehouseId = mapped.location_id ?? mapped.warehouse_id;
    const operator = mapped.operator;
    const remark = mapped.remark ?? null;
    const items = mapped.items || [];
    const inbound_type = mapped.inbound_type || 'other';
    const reference_type = mapped.reference_type ?? null;
    const reference_id = mapped.reference_id ?? null;
    const reference_no = mapped.reference_no ?? null;
    const { assertShopFloorInbound } = require('../../../authorization/shopFloorMaterialRequest');
    assertShopFloorInbound(req, mapped);
    const status = mapped.status;

    // 验证必填字段
    if (!inbound_date || !warehouseId || !status || !operator || !items || items.length === 0) {
      throw new Error('缺少必填字段：入库日期、仓库、状态、操作员、物料项不能为空');
    }

    // 创建仅允许草稿/已确认；完成写库存必须走状态接口
    const allowedCreateStatuses = [STATUS.INBOUND.DRAFT, STATUS.INBOUND.CONFIRMED];
    if (!allowedCreateStatuses.includes(status)) {
      throw new Error('创建入库单仅允许 draft/confirmed，完成入库请使用状态接口');
    }

    // ===== 年度结存校验 =====
    const PeriodValidationService = require('../../../services/business/PeriodValidationService');
    const inventoryCheck = await PeriodValidationService.validateInventoryTransaction(inbound_date);
    if (!inventoryCheck.allowed) {
      throw new Error(inventoryCheck.message);
    }
    // ===== 年度结存校验结束 =====

    // 生产退料必须关联生产任务或出库单
    if (inbound_type === 'production_return' && !reference_id && !reference_no) {
      throw new Error('生产退料必须关联生产任务或原出库单');
    }

    // ✅ 使用统一编码规则引擎生成入库单号
    const inbound_no = await CodeGenerators.generateInboundCode(connection);

    // 插入入库单主表（包含入库类型和关联信息 + DataScope owner）
    const ScopeGuard = require('../../../authorization/ScopeGuard');
    const ownerStamp = ScopeGuard.tryStampOwner(req, 'inventory_inbound');
    const [inboundResult] = await connection.execute(
      `INSERT INTO inventory_inbound
       (inbound_no, inbound_date, inbound_type, reference_type, reference_id, reference_no, location_id, status, operator, remark, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        inbound_no,
        inbound_date,
        inbound_type,
        reference_type,
        reference_id,
        reference_no,
        warehouseId,
        status,
        operator,
        remark,
        ownerStamp.created_by,
      ]
    );

    const inboundId = inboundResult.insertId;

    // 批量预取所有物料信息（消除循环内 N+1 查询）
    const inboundMaterialIds = items.map((i) => i.material_id);
    const inboundMaterialInfoMap = await InventoryService.getBatchMaterialInfo(
      inboundMaterialIds,
      connection
    );

    // 插入入库单明细（创建路径不写库存）
    for (const item of items) {
      if (!item.material_id || !item.quantity || item.quantity <= 0) {
        throw new Error('物料信息不完整或数量无效');
      }

      // 从批量预取结果获取物料的默认单位和仓库
      const matInfo = inboundMaterialInfoMap.get(item.material_id);
      const unitId = item.unit_id || matInfo.unitId;
      // 核心破案：修复强制用物料默认库位覆盖手工选定隔离区库位的终极 Bug
      const itemLocationId = item.location_id || warehouseId || matInfo.locationId;

      await connection.execute(
        'INSERT INTO inventory_inbound_items (inbound_id, material_id, quantity, unit_id, location_id, batch_number, remark) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          inboundId,
          item.material_id,
          item.quantity,
          unitId,
          itemLocationId,
          item.batch_number || null,
          item.remark || null,
        ]
      );
    }

    await connection.commit();
    ResponseHandler.success(
      res,
      {
        message: '入库单创建成功',
        data: {
          id: inboundId,
          inboundNo: inbound_no,
        },
      },
      '创建成功',
      201
    );
  } catch (error) {
    await connection.rollback();
    logger.error('创建入库单失败:', error);
    const msg = error?.message || '创建入库单失败';
    if (error.statusCode === 403) {
      return ResponseHandler.forbidden(res, msg);
    }
    const isValidation =
      /缺少必填|仅允许 draft\/confirmed|请使用状态接口|年度结存|必须关联|物料信息/.test(msg);
    ResponseHandler.error(
      res,
      isValidation ? msg : '创建入库单失败',
      isValidation ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
      isValidation ? 400 : 500,
      error
    );
  } finally {
    connection.release();
  }
};

const updateInbound = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const id = toRequiredInteger(req.params.id);
    if (!id) {
      return ResponseHandler.error(res, '无效的入库单ID', 'VALIDATION_ERROR', 400);
    }

    const ScopeGuard = require('../../../authorization/ScopeGuard');
    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'inventory_inbound', id, '无权修改该入库单'))) {
      return;
    }

    await connection.beginTransaction();

    const [inboundRows] = await connection.execute(
      `SELECT id, inbound_no, inbound_date, inbound_type, reference_type, reference_id, reference_no, location_id, status, total_amount, total_amount_unit, operator, inspection_id, inspection_no, remark, created_at, updated_at, created_by, updated_by, is_deleted
       FROM inventory_inbound
       WHERE id = ? AND is_deleted = 0 AND deleted_at IS NULL
       FOR UPDATE`,
      [id]
    );

    if (inboundRows.length === 0) {
      await connection.rollback();
      return ResponseHandler.notFound(res, '入库单不存在');
    }

    const currentInbound = inboundRows[0];
    const editableStatuses = [STATUS.INBOUND.DRAFT, STATUS.INBOUND.CONFIRMED];
    if (!editableStatuses.includes(currentInbound.status)) {
      await connection.rollback();
      return ResponseHandler.error(res, '已完成或已取消的入库单不允许编辑', 'VALIDATION_ERROR', 400);
    }

    const body = req.body || {};
    const {
      inbound_date = currentInbound.inbound_date,
      location_id,
      status = currentInbound.status,
      operator = currentInbound.operator,
      remark = null,
      items,
      inbound_type = currentInbound.inbound_type || 'other',
      reference_type = currentInbound.reference_type,
      reference_id = currentInbound.reference_id,
      reference_no = currentInbound.reference_no,
    } = body;

    const locationId = toRequiredInteger(location_id || currentInbound.location_id);
    const requestedStatus = status || currentInbound.status;
    const nextStatus = currentInbound.status;

    if (!editableStatuses.includes(requestedStatus)) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '编辑接口只允许保存未完成单据，完成入库请使用状态流转',
        'VALIDATION_ERROR',
        400
      );
    }

    if (!inbound_date || !locationId || !operator || !Array.isArray(items) || items.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '缺少必填字段：入库日期、仓库、操作人、物料明细不能为空',
        'VALIDATION_ERROR',
        400
      );
    }

    const PeriodValidationService = require('../../../services/business/PeriodValidationService');
    const inventoryCheck = await PeriodValidationService.validateInventoryTransaction(inbound_date);
    if (!inventoryCheck.allowed) {
      await connection.rollback();
      return ResponseHandler.error(res, inventoryCheck.message, 'VALIDATION_ERROR', 400);
    }

    if (inbound_type === 'production_return' && !reference_id && !reference_no) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '生产退料必须关联生产任务或原出库单',
        'VALIDATION_ERROR',
        400
      );
    }

    const materialIds = [];
    for (const item of items) {
      const materialId = toRequiredInteger(item.material_id);
      const quantity = toRequiredQuantity(item.quantity);
      if (!materialId || !quantity) {
        await connection.rollback();
        return ResponseHandler.error(res, '物料信息不完整或数量无效', 'VALIDATION_ERROR', 400);
      }
      materialIds.push(materialId);
    }

    const materialInfoMap = await InventoryService.getBatchMaterialInfo(materialIds, connection);

    await connection.execute(
      `UPDATE inventory_inbound
       SET inbound_date = ?,
           inbound_type = ?,
           reference_type = ?,
           reference_id = ?,
           reference_no = ?,
           location_id = ?,
           status = ?,
           operator = ?,
           remark = ?,
           updated_at = NOW()
       WHERE id = ? AND is_deleted = 0 AND deleted_at IS NULL`,
      [
        inbound_date,
        inbound_type || 'other',
        reference_type || null,
        toNullableInteger(reference_id),
        reference_no || null,
        locationId,
        nextStatus,
        operator,
        remark || null,
        id,
      ]
    );

    await connection.execute('DELETE FROM inventory_inbound_items WHERE inbound_id = ?', [id]);

    for (const item of items) {
      const materialId = toRequiredInteger(item.material_id);
      const quantity = toRequiredQuantity(item.quantity);
      const materialInfo = materialInfoMap.get(materialId);
      const unitId = toRequiredInteger(item.unit_id || materialInfo.unitId);
      const itemLocationId = toRequiredInteger(item.location_id || locationId || materialInfo.locationId);

      if (!unitId) {
        await connection.rollback();
        return ResponseHandler.error(res, '物料单位不能为空', 'VALIDATION_ERROR', 400);
      }

      if (!itemLocationId) {
        await connection.rollback();
        return ResponseHandler.error(res, '物料仓库不能为空', 'VALIDATION_ERROR', 400);
      }

      await connection.execute(
        `INSERT INTO inventory_inbound_items
         (inbound_id, material_id, material_code, material_name, specification, quantity, unit_id, location_id, batch_number, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          materialId,
          item.material_code || materialInfo.code || null,
          item.material_name || materialInfo.name || null,
          item.specification || item.materialSpecs || item.specs || null,
          quantity,
          unitId,
          itemLocationId,
          // 明细批次：仅认 batch_number（FieldMap/API snake 入库列）；空则草稿可空，完成时 InboundTransactionService 强制
          item.batch_number != null && String(item.batch_number).trim() !== ''
            ? String(item.batch_number).trim()
            : null,
          item.remark || null,
        ]
      );
    }

    await connection.commit();
    return ResponseHandler.success(res, { id }, '入库单更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新入库单失败:', error);
    return ResponseHandler.error(res, '更新入库单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 从质检单创建入库单

const createInboundFromQuality = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { inbound_date, location_id, operator, remark, items, inspection_id, inspection_no } = mapKeysToSnake(req.body || {});

    // 验证必填字段
    if (!inbound_date || !location_id || !operator || !items || items.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '缺少必填字段', 'VALIDATION_ERROR', 400);
    }

    // ===== 年度结存校验 =====
    const PeriodValidationService = require('../../../services/business/PeriodValidationService');
    const inventoryCheck = await PeriodValidationService.validateInventoryTransaction(inbound_date);
    if (!inventoryCheck.allowed) {
      await connection.rollback();
      return ResponseHandler.error(res, inventoryCheck.message, 'VALIDATION_ERROR', 400);
    }
    // ===== 年度结存校验结束 =====

    // 检查质检单状态是否合格；入库类型/引用由 documentReferences SSOT 解析
    let inspectionContext = null;
    const {
      resolveInboundFromInspection,
      INBOUND_TYPE_KEYS,
    } = require('../../../constants/documentReferences');
    let inboundType = INBOUND_TYPE_KEYS.OTHER;
    let referenceType = null;
    let referenceId = null;
    if (inspection_id) {
      const [inspectionResult] = await connection.execute(
        `SELECT id, status, inspection_no, inspection_type, product_id, product_name,
                product_code, quantity, qualified_quantity, unit,
                reference_id, reference_no, task_id, batch_no
         FROM quality_inspections
         WHERE id = ?
         FOR UPDATE`,
        [inspection_id]
      );

      if (inspectionResult.length === 0) {
        await connection.rollback();
        return ResponseHandler.notFound(res, '质检单不存在');
      }

      inspectionContext = inspectionResult[0];
      if (!['passed', 'partial', 'completed'].includes(inspectionContext.status)) {
        await connection.rollback();
        return ResponseHandler.error(res, '只有质检合格、部分合格或已完成的单据才能生成入库单', 'VALIDATION_ERROR', 400);
      }

      if ((parseFloat(inspectionContext.qualified_quantity) || 0) <= 0) {
        await connection.rollback();
        return ResponseHandler.error(res, '质检单合格数量必须大于0，不能生成入库单', 'VALIDATION_ERROR', 400);
      }

      const [existingInbounds] = await connection.execute(
        "SELECT id, inbound_no FROM inventory_inbound WHERE inspection_id = ? AND status != 'cancelled' LIMIT 1",
        [inspection_id]
      );
      if (existingInbounds.length > 0) {
        await connection.rollback();
        return ResponseHandler.success(
          res,
          {
            id: existingInbounds[0].id,
            inbound_no: existingInbounds[0].inbound_no,
            existed: true,
          },
          '该质检单已创建过入库单'
        );
      }

      const inboundMeta = resolveInboundFromInspection(inspectionContext);
      inboundType = inboundMeta.inboundType;
      referenceType = inboundMeta.referenceType;
      referenceId = inboundMeta.referenceId;

      if (
        inboundType === INBOUND_TYPE_KEYS.PRODUCTION &&
        !referenceId
      ) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          '成品终检未关联生产任务，不能创建生产入库单',
          'VALIDATION_ERROR',
          400
        );
      }
    }

    // ✅ 使用统一编码规则引擎生成入库单号
    const inbound_no = await CodeGenerators.generateInboundCode(connection);

    // 创建入库单（写入 created_by 闭环 DataScope + 业务类型/来源，保证生产闭环）
    const ScopeGuard = require('../../../authorization/ScopeGuard');
    const ownerStamp = ScopeGuard.tryStampOwner(req, 'inventory_inbound');
    const [inboundResult] = await connection.execute(
      `INSERT INTO inventory_inbound (
         inbound_no, inbound_date, inbound_type, reference_type, reference_id,
         location_id, operator, status, remark, inspection_id, inspection_no,
         created_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        inbound_no,
        inbound_date,
        inboundType,
        referenceType,
        referenceId,
        location_id,
        operator,
        'draft',
        remark || null,
        inspection_id || null,
        inspection_no || inspectionContext?.inspection_no || null,
        ownerStamp.created_by,
      ]
    );

    const inbound_id = inboundResult.insertId;

    // 生产入库草稿创建时推进任务至入库中（状态机路径，非裸 UPDATE）
    if (inboundType === INBOUND_TYPE_KEYS.PRODUCTION && referenceId) {
      const { promoteTaskToward } = require('../../../services/business/TaskLifecycleService');
      const promoteResult = await promoteTaskToward(connection, referenceId, 'warehousing', {
        requireOpenInspectionClear: false,
        strict: false,
      });
      if (!promoteResult.promoted && promoteResult.reason !== 'already') {
        logger.warn(
          `[from-quality] 任务 ${referenceId} 未推进至 warehousing: ${promoteResult.reason || promoteResult.status}`
        );
      }
    }

    // 从质检单获取产品信息
    let productId = null;
    let productCode = null;
    let productName = null;

    if (inspection_id) {
      const inspectionInfo = inspectionContext ? [inspectionContext] : [];

      if (inspectionInfo.length > 0) {
        const inspectionType = inspectionInfo[0].inspection_type;
        productId = inspectionInfo[0].product_id || null;
        productCode = inspectionInfo[0].product_code || '';
        productName = inspectionInfo[0].product_name || '';
        // ✅ 使用合格数量而不是检验数量
        const inspectionQuantity =
          inspectionInfo[0].qualified_quantity || inspectionInfo[0].quantity || 0;
        const _inspectionUnit = inspectionInfo[0].unit || '';

        // 如果是成品检验，直接使用product_id作为物料ID
        if (inspectionType === 'final' && productId) {
          // 检查物料表中是否存在该产品ID的记录，同时获取物料的location_id
          const [materialInfo] = await connection.execute(
            'SELECT id, location_id, unit_id FROM materials WHERE id = ? AND deleted_at IS NULL',
            [productId]
          );

          // 如果物料存在，使用items中传入的物料信息创建入库单明细
          if (materialInfo.length > 0) {
            // 成品入库应该使用物料表中定义的库位，而不是请求中的库位
            const materialLocationId = materialInfo[0].location_id;
            const materialUnitId = materialInfo[0].unit_id;

            // 如果物料有指定库位，使用物料的库位；否则使用请求中的库位
            const useLocationId = materialLocationId || location_id;

            // 更新入库单的库位，与物料保持一致
            if (materialLocationId && materialLocationId !== location_id) {
              await connection.execute(
                'UPDATE inventory_inbound SET location_id = ? WHERE id = ? AND is_deleted = 0 AND deleted_at IS NULL',
                [materialLocationId, inbound_id]
              );
            }

            // 获取合适的单位ID
            let unitId = materialUnitId;

            // 验证传入的明细数量
            const totalItemsQuantity = items.reduce(
              (sum, item) => sum + parseFloat(item.quantity || 0),
              0
            );

            // 如果items中的数量与质检单数量相差太大，使用质检单的数量
            if (
              Math.abs(totalItemsQuantity - inspectionQuantity) > 0.01 ||
              totalItemsQuantity <= 0
            ) {
              // 根据请求项取第一个项目的单位ID
              unitId =
                items.length > 0 && items[0].unit_id ? items[0].unit_id : materialUnitId;

              // 创建一个入库明细，使用质检单的数量
              await connection.execute(
                'INSERT INTO inventory_inbound_items (inbound_id, material_id, unit_id, quantity, batch_number, remark, location_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [inbound_id, productId, unitId, inspectionQuantity, null, null, useLocationId]
              );
            } else {
              // 使用items中的信息创建入库明细
              for (const item of items) {
                const { unit_id, quantity, batch_no, remark: itemRemark } = item;

                // 确保必填字段都存在
                if (!unit_id || !quantity || quantity <= 0) {
                  await connection.rollback();
                  return ResponseHandler.error(res, '物料明细字段不完整或无效', 'VALIDATION_ERROR', 400);
                }

                await connection.execute(
                  'INSERT INTO inventory_inbound_items (inbound_id, material_id, unit_id, quantity, batch_number, remark, location_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                  [
                    inbound_id,
                    productId,
                    unit_id,
                    quantity,
                    batch_no || null,
                    itemRemark || null,
                    useLocationId,
                  ]
                );
              }
            }

            await connection.commit();

            return ResponseHandler.success(
              res,
              {
                success: true,
                message: '入库单创建成功',
                data: {
                  id: inbound_id,
                  inbound_no,
                },
              },
              '创建成功',
              201
            );
          }
        }
      }
    }

    // 如果无法直接使用产品ID或者不是成品检验，按照原来的逻辑处理
    // 插入入库物料明细
    for (const item of items) {
      const { material_id, unit_id, quantity, batch_no, remark: itemRemark } = item;

      // 确保所有必填字段都存在
      if (!material_id || !unit_id || !quantity || quantity <= 0) {
        await connection.rollback();
        return ResponseHandler.error(res, '物料明细字段不完整或无效', 'VALIDATION_ERROR', 400);
      }

      // 检查material_id是否存在于materials表中
      const [materialCheck] = await connection.execute('SELECT id FROM materials WHERE id = ? AND deleted_at IS NULL', [
        material_id,
      ]);

      // 每个物料项都有自己的物料ID，默认使用请求中的material_id
      let validMaterialId = material_id;
      let foundMaterial = false;

      // 如果物料ID不存在，尝试查找对应的产品物料关联
      if (materialCheck.length === 0) {
        // 尝试用质检单的product_code查找物料
        if (productCode) {
          // 先尝试使用产品代码查找物料code字段
          const [materialByCode] = await connection.execute(
            'SELECT id FROM materials WHERE code = ?',
            [productCode]
          );

          if (materialByCode.length > 0) {
            validMaterialId = materialByCode[0].id;

            foundMaterial = true;
          } else if (productCode || productName) {
            // 如果在code字段中找不到，尝试在specs字段中查找
            const [materialBySpecs] = await connection.execute(
              'SELECT id FROM materials WHERE specs = ? OR name = ?',
              [productCode, productName]
            );

            if (materialBySpecs.length > 0) {
              validMaterialId = materialBySpecs[0].id;

              foundMaterial = true;
            }
          }
        }

        if (!foundMaterial) {
          await connection.rollback();
          return ResponseHandler.error(
            res,
            `物料ID ${material_id} 不存在，不能用其他物料替代入库。请先维护质检单产品与物料主数据的对应关系`,
            'VALIDATION_ERROR',
            400
          );
        }
      }

      await connection.execute(
        'INSERT INTO inventory_inbound_items (inbound_id, material_id, unit_id, quantity, batch_number, remark, location_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          inbound_id,
          validMaterialId,
          unit_id,
          quantity,
          batch_no || null,
          itemRemark || null,
          item.location_id || location_id, // 优先使用前台明确传来的明细级存放仓位（例如退回死料区的仓位）
        ]
      );
    }

    await connection.commit();

    return ResponseHandler.success(
      res,
      {
        success: true,
        message: '入库单创建成功',
        data: {
          id: inbound_id,
          inbound_no,
        },
      },
      '创建成功',
      201
    );
  } catch (err) {
    await connection.rollback();
    logger.error('创建入库单错误:', err);
    return ResponseHandler.error(res, '服务器错误', 'SERVER_ERROR', 500);
  } finally {
    connection.release();
  }
};

// 更新入库单状态（死锁时整事务重试）

const updateInboundStatus = async (req, res) => {
  const { id } = req.params;
  // 兼容 newStatus / status / new_status（与出库状态接口对齐）
  const newStatus = req.body?.newStatus ?? req.body?.status ?? req.body?.new_status;

  if (!id || isNaN(parseInt(id, 10))) {
    return ResponseHandler.error(res, '无效的入库单ID', 'VALIDATION_ERROR', 400);
  }

  if (!newStatus) {
    return ResponseHandler.error(res, '缺少目标状态 newStatus', 'VALIDATION_ERROR', 400);
  }

  const validStatuses = ['draft', 'confirmed', 'completed', 'reversed', 'cancelled'];
  if (!validStatuses.includes(newStatus)) {
    return ResponseHandler.error(
      res,
      `无效的状态值: ${newStatus}`,
      'VALIDATION_ERROR',
      400
    );
  }

  const isDeadlockError = (err) =>
    err && (err.code === 'ER_LOCK_DEADLOCK' || /Deadlock/i.test(err.message || ''));

  // 状态变更前先做 DataScope 校验（与列表/详情同一策略）
  {
    const ScopeGuard = require('../../../authorization/ScopeGuard');
    const preConn = await db.pool.getConnection();
    try {
      if (!(await ScopeGuard.denyUnlessAccess(res, preConn, req, 'inventory_inbound', id, '无权变更该入库单状态'))) {
        return;
      }
    } finally {
      preConn.release();
    }
  }

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [inboundData] = await connection.execute(
        `SELECT id, inbound_no, inbound_date, inbound_type, reference_type, reference_id, reference_no, location_id, status, total_amount, total_amount_unit, operator, inspection_id, inspection_no, remark, created_at, updated_at, created_by, updated_by, is_deleted
         FROM inventory_inbound
         WHERE id = ? AND is_deleted = 0 AND deleted_at IS NULL
         FOR UPDATE`,
        [id]
      );

      if (inboundData.length === 0) {
        await connection.rollback();
        return ResponseHandler.error(res, `入库单不存在 (ID: ${id})`, 'NOT_FOUND', 404);
      }

      const currentStatus = inboundData[0].status;
      const validTransitions = INVENTORY_INBOUND_TRANSITIONS;

      if (
        !validTransitions[currentStatus] ||
        (!validTransitions[currentStatus].includes(newStatus) && currentStatus !== newStatus)
      ) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `无法从 "${currentStatus}" 状态转换为 "${newStatus}" 状态`,
          'VALIDATION_ERROR',
          400
        );
      }

      if (newStatus === STATUS.INBOUND.COMPLETED) {
        await InboundTransactionService.confirmInbound(
          connection,
          id,
          inboundData[0].operator || getRequestActorLabel(req),
          inboundData[0]
        );
      }

      if (newStatus === STATUS.INBOUND.REVERSED) {
        await InboundTransactionService.reverseInbound(
          connection,
          id,
          inboundData[0].operator || getRequestActorLabel(req),
          inboundData[0]
        );
      }

      const [statusUpdate] = await connection.execute(
        'UPDATE inventory_inbound SET status = ?, updated_at = NOW() WHERE id = ? AND is_deleted = 0 AND deleted_at IS NULL AND status = ?',
        [newStatus, id, currentStatus]
      );
      if (!statusUpdate.affectedRows) {
        await connection.rollback();
        return ResponseHandler.error(res, '入库单状态已变更，请刷新后重试', 'VALIDATION_ERROR', 400);
      }

      await connection.commit();
      return ResponseHandler.success(res, null, '入库单状态更新成功');
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // ignore
      }
      lastError = error;
      if (isDeadlockError(error) && attempt < 3) {
        logger.warn(`更新入库单状态死锁，整事务重试 ${attempt}/3: inboundId=${id}`);
        await new Promise((r) => setTimeout(r, 40 * attempt));
        continue;
      }
      logger.error('更新入库单状态失败:', error);
      return ResponseHandler.error(res, '更新入库单状态失败', 'SERVER_ERROR', 500, error);
    } finally {
      connection.release();
    }
  }

  logger.error('更新入库单状态失败(重试用尽):', lastError);
  return ResponseHandler.error(res, '更新入库单状态失败', 'SERVER_ERROR', 500, lastError);
};

// 获取物料列表 - 从baseData获取


module.exports = {
  getInboundList,
  getInboundStatistics,
  getInboundDetail,
  createInbound,
  updateInbound,
  createInboundFromQuality,
  updateInboundStatus,
};
