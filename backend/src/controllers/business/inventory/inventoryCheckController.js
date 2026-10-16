const businessConfig = require('../../../config/businessConfig');
/**
 * inventoryController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { mapKeysToSnake } = require('../../../utils/fieldMap');
const { logger } = require('../../../utils/logger');
const { INVENTORY_CHECK_TRANSITIONS } = require('../../../constants/statusRegistry');
const { parsePagination } = require('../../../utils/safePagination');

const db = require('../../../config/db');
const InventoryService = require('../../../services/InventoryService');
const { softDelete } = require('../../../utils/softDelete');
const { CodeGenerators } = require('../../../utils/codeGenerator');
const { getCurrentUserName } = require('../../../utils/userHelper');
const { getAuthenticatedUserId } = require('../../../utils/authContext');
const { _insertInventoryLedgerLocal } = require('./inventoryLedgerController');
const {
  inventoryCheckMap,
  inventoryCheckItemMap,
} = require('../../../utils/inventory/inventoryFieldMap');

// 统一库存查询子查询（基于 inventory_ledger 单表架构聚合计算当前库存）
const STOCK_SUBQUERY = `(SELECT material_id, location_id, COALESCE(SUM(quantity), 0) as quantity, MAX(created_at) as updated_at FROM inventory_ledger GROUP BY material_id, location_id)`;
// DRY: 两处引用相同子查询，统一使用 STOCK_SUBQUERY
const SIMPLE_STOCK_SUBQUERY = STOCK_SUBQUERY;

// 引入库存一致性校验服务

// 引入成本凭证服务（用于生成领料凭证）

// 引入重构后的入库处理服务

// 引入状态映射工具和状态常量

/**
 * 获取物料的批次号（FIFO原则）
 * @param {object} connection - 数据库连接
 * @param {number} materialId - 物料ID
 * @param {number} locationId - 库位ID（可选）
 * @param {string} fallbackBatchNo - 调用方显式传入的候选批次号
 * @returns {Promise<string>} 批次号
 */

const getCheckStatistics = async (req, res) => {
  try {
    const ScopeGuard = require('../../../authorization/ScopeGuard');
    const scopeClause = await ScopeGuard.applyListScope(req, 'inventory_check', {
      tableAlias: 'c',
      ownerAlias: 'inventory_check_stats_owner_scope',
    });
    const [results] = await db.pool.execute(
      `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN c.status = 'draft' THEN 1 ELSE 0 END) as draft,
        SUM(CASE WHEN c.status = 'pending' THEN 1 ELSE 0 END) as pendingCount,
        SUM(CASE WHEN c.status = 'in_progress' THEN 1 ELSE 0 END) as inProgressCount,
        SUM(CASE WHEN c.status = 'completed' THEN 1 ELSE 0 END) as completedCount,
        SUM(CASE WHEN c.status = 'cancelled' THEN 1 ELSE 0 END) as cancelledCount
      FROM inventory_checks c
      ${scopeClause.join || ''}
      WHERE c.deleted_at IS NULL${scopeClause.where || ''}
    `,
      scopeClause.params || []
    );

    ResponseHandler.success(res, results[0], '获取库存盘点统计信息成功');
  } catch (error) {
    logger.error('获取库存盘点统计信息失败:', error);
    ResponseHandler.error(res, '获取库存盘点统计信息失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取库存盘点列表

const getCheckList = async (req, res) => {
  try {
    // 列表查询 camel → snake
    const q = inventoryCheckMap.fromListQuery(req.query || {});
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const search = q.search || '';
    const check_no = q.check_no || '';
    const status = q.status || '';
    const check_type = q.check_type || '';
    const start_date = q.start_date || '';
    const end_date = q.end_date || '';
    const materialName = q.materialName || '';
    const pagination = parsePagination(page, limit, { defaultPageSize: 20, maxPageSize: 100 });

    const ScopeGuard = require('../../../authorization/ScopeGuard');
    const scopeClause = await ScopeGuard.applyListScope(req, 'inventory_check', {
      tableAlias: 'c',
      ownerAlias: 'inventory_check_owner_scope',
    });
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      whereClause += ' AND (c.check_no LIKE ? OR l.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (check_no) {
      whereClause += ' AND c.check_no LIKE ?';
      params.push(`%${check_no}%`);
    }

    if (status) {
      whereClause += ' AND c.status = ?';
      params.push(status);
    }

    if (check_type) {
      whereClause += ' AND c.check_type = ?';
      params.push(check_type);
    }

    if (start_date) {
      whereClause += ' AND c.check_date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      whereClause += ' AND c.check_date <= ?';
      params.push(end_date);
    }

    if (materialName) {
      whereClause += ` AND EXISTS (
        SELECT 1
        FROM inventory_check_items ci_search
        LEFT JOIN materials m_search ON ci_search.material_id = m_search.id
        WHERE ci_search.check_id = c.id
          AND (m_search.name LIKE ? OR m_search.code LIKE ? OR m_search.specs LIKE ?)
      )`;
      params.push(`%${materialName}%`, `%${materialName}%`, `%${materialName}%`);
    }

    whereClause += scopeClause.where || '';
    params.push(...(scopeClause.params || []));

    const countQuery = `
      SELECT COUNT(*) as total
      FROM inventory_checks c
      LEFT JOIN locations l ON c.location_id = l.id
      ${scopeClause.join}
      ${whereClause}
    `;

    const [countResult] = await db.pool.execute(countQuery, params);
    const total = countResult[0].total;

    const listQuery = `
      SELECT
        c.id,
        c.check_no,
        c.location_id,
        l.name as location_name,
        c.check_date,
        c.status,
        c.created_by,
        c.created_at,
        c.updated_at,
        c.remark,
        COALESCE(NULLIF(TRIM(u.real_name), ''), u.username) as creator_name,
        u.real_name as creator_real_name,
        COALESCE(c.check_type, 'warehouse') as check_type,
        (SELECT COUNT(*) FROM inventory_check_items WHERE check_id = c.id) as item_count
      FROM inventory_checks c
      LEFT JOIN locations l ON c.location_id = l.id
      LEFT JOIN users u ON c.created_by = u.id
      ${scopeClause.join}
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ${pagination.limit} OFFSET ${pagination.offset}
    `;

    const [checks] = await db.pool.execute(listQuery, params);

    // 出参仅 camel（inventoryCheckMap）
    const processedChecks = checks.map((check) =>
      inventoryCheckMap.toApi({
        ...check,
        warehouse: check.location_name || '未知仓库',
        creator: check.creator_real_name || check.creator_name || '未知',
        check_type: check.check_type || 'warehouse',
      })
    );

    ResponseHandler.paginated(
      res,
      processedChecks,
      total,
      pagination.page,
      pagination.pageSize,
      '获取库存盘点列表成功'
    );
  } catch (error) {
    logger.error('获取库存盘点列表失败:', error);
    ResponseHandler.error(res, '获取库存盘点列表失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取库存盘点详情

const getCheckDetail = async (req, res) => {
  {
    const { id } = req.params;
    if (id !== null && id !== undefined && id !== '') {
      const ScopeGuard = require('../../../authorization/ScopeGuard');
      if (!(await ScopeGuard.assertAccess(db.pool, req, 'inventory_check', id))) {
        return ResponseHandler.forbidden(res, '无权访问该盘点单');
      }
    }
  }

  try {
    const { id } = req.params;

    // 获取盘点单基本信息
    const [checkResults] = await db.pool.execute(
      `SELECT
        c.*,
        l.name as location_name,
        COALESCE(NULLIF(TRIM(u.real_name), ''), u.username) as creator_name
      FROM inventory_checks c
      LEFT JOIN locations l ON c.location_id = l.id
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.id = ?`,
      [id]
    );

    if (checkResults.length === 0) {
      return ResponseHandler.error(res, '库存盘点单不存在', 'NOT_FOUND', 404);
    }

    const check = checkResults[0];

    // 获取盘点明细
    const [items] = await db.pool.execute(
      `SELECT
        i.*,
        m.code as material_code,
        m.name as material_name,
        m.specs as material_specs,
        u.name as unit_name
      FROM inventory_check_items i
      LEFT JOIN materials m ON i.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      WHERE i.check_id = ?`,
      [id]
    );

    // 出参仅 camel（inventoryCheckMap）
    const processedItems = items.map((item) => ({
      ...item,
      system_quantity: parseFloat(item.system_quantity || 0),
      actual_quantity: parseFloat(item.actual_quantity || 0),
      difference: parseFloat(item.difference || 0),
      specification: item.material_specs,
    }));

    ResponseHandler.success(
      res,
      inventoryCheckMap.toApi({
        ...check,
        warehouse: check.location_name,
        creator: check.creator_name,
        items: processedItems,
      }),
      '获取库存盘点详情成功'
    );
  } catch (error) {
    logger.error('获取库存盘点详情失败:', error);
    ResponseHandler.error(res, '获取库存盘点详情失败', 'SERVER_ERROR', 500, error);
  }
};

// 创建库存盘点单

const createCheck = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    // HTTP camel → snake（inventoryCheckMap）
    const mapped = inventoryCheckMap.fromApi(req.body || {});
    const location_id = mapped.location_id;
    const check_date = mapped.check_date;
    const check_type = mapped.check_type;
    const remark = mapped.remark;

    // 验证必要参数
    if (!location_id || !check_date) {
      await connection.rollback();
      return ResponseHandler.error(res, '仓库位置和盘点日期为必填项', 'BAD_REQUEST', 400);
    }

    // ===== 年度结存校验 =====
    const PeriodValidationService = require('../../../services/business/PeriodValidationService');
    const inventoryCheck = await PeriodValidationService.validateInventoryTransaction(check_date);
    if (!inventoryCheck.allowed) {
      await connection.rollback();
      return ResponseHandler.error(res, inventoryCheck.message, 'BAD_REQUEST', 400);
    }
    // ===== 年度结存校验结束 =====

    // ✅ 使用统一编码规则引擎生成盘点单号
    const checkNo = await CodeGenerators.generateCheckCode(connection);

    // 创建盘点单
    const [checkResult] = await connection.execute(
      `INSERT INTO inventory_checks (
        check_no,
        location_id,
        check_type,
        check_date,
        status,
        remark,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        checkNo,
        location_id,
        check_type || 'warehouse',
        check_date,
        'draft',
        remark || null,
        getAuthenticatedUserId(req),
      ]
    );

    const checkId = checkResult.insertId;

    // 仅针对 全面盘点（full）或周期盘点（cycle），或者未分类的库位盘点时，自动加载账面现有库存
    // 若为随机盘点（random）或专项盘点（special），则默认创建“空”的盘点单，完全由人工扫码一条条追加
    const shouldPrepopulate =
      check_type === 'full' || check_type === 'cycle' || check_type === 'warehouse';

    if (shouldPrepopulate) {
      // 为该库位的所有物料创建盘点明细条目
      const [stockItems] = await connection.execute(
        `SELECT
          s.material_id,
          s.quantity as system_quantity,
          m.unit_id
        FROM ${SIMPLE_STOCK_SUBQUERY} as s
        JOIN materials m ON s.material_id = m.id
        WHERE s.location_id = ?`,
        [location_id]
      );

      if (stockItems.length > 0) {
        // 批量查出所有物料在该库位的最新 after_quantity（消除 N+1）
        const materialIds = stockItems.map((i) => i.material_id);
        const mPh = materialIds.map(() => '?').join(',');
        const [latestRecords] = await connection.execute(
          `SELECT material_id, after_quantity FROM (
             SELECT material_id, after_quantity,
                    ROW_NUMBER() OVER (PARTITION BY material_id ORDER BY created_at DESC) as rn
             FROM inventory_ledger
             WHERE material_id IN (${mPh}) AND location_id = ?
           ) t WHERE rn = 1`,
          [...materialIds, location_id]
        );
        const afterQtyMap = new Map(
          latestRecords.map((r) => [r.material_id, parseFloat(r.after_quantity)])
        );

        // 批量插入盘点明细
        const insertValues = stockItems.map((item) => {
          const aq = afterQtyMap.get(item.material_id);
          const actualSystemQuantity =
            aq !== undefined && aq !== null ? aq : parseFloat(item.system_quantity || 0);
          return [
            checkId,
            item.material_id,
            actualSystemQuantity,
            actualSystemQuantity,
            item.unit_id,
            0,
          ];
        });
        const insertPh = insertValues.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
        await connection.execute(
          `INSERT INTO inventory_check_items (check_id, material_id, system_quantity, actual_quantity, unit_id, difference)
           VALUES ${insertPh}`,
          insertValues.flat()
        );
      }
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      inventoryCheckMap.toApi({
        id: checkId,
        check_no: checkNo,
        location_id,
        check_type: check_type || 'warehouse',
        check_date,
        status: businessConfig.status.approval.DRAFT,
        remark: remark || null,
      }),
      '创建成功',
      201
    );
  } catch (error) {
    await connection.rollback();
    logger.error('创建库存盘点单失败:', error);
    ResponseHandler.error(res, '创建库存盘点单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 更新库存盘点单

const addCheckItem = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { material_id, remark } = mapKeysToSnake(req.body || {});
    const materialId = Number(material_id);

    if (!materialId) {
      await connection.rollback();
      return ResponseHandler.error(res, '请选择物料', 'BAD_REQUEST', 400);
    }

    const [checkRows] = await connection.execute(
      'SELECT id, status, location_id FROM inventory_checks WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );

    if (checkRows.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, 'Inventory check not found', 'NOT_FOUND', 404);
    }

    const check = checkRows[0];
    if (!['draft', 'in_progress'].includes(check.status)) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        'Only draft or in-progress inventory checks can add items',
        'BAD_REQUEST',
        400
      );
    }

    const [materialRows] = await connection.execute(
      `SELECT m.id, m.code, m.name, m.specs, m.unit_id, u.name as unit_name
       FROM materials m
       LEFT JOIN units u ON m.unit_id = u.id
       WHERE m.id = ?`,
      [materialId]
    );

    if (materialRows.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, 'Material not found', 'NOT_FOUND', 404);
    }

    const [existingRows] = await connection.execute(
      'SELECT id FROM inventory_check_items WHERE check_id = ? AND material_id = ? LIMIT 1',
      [id, materialId]
    );

    if (existingRows.length > 0) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        'Material already exists in this inventory check',
        'DUPLICATE_ITEM',
        409
      );
    }

    const [stockRows] = await connection.execute(
      `SELECT COALESCE(SUM(quantity), 0) as quantity
       FROM inventory_ledger
       WHERE material_id = ? AND location_id = ?`,
      [materialId, check.location_id]
    );
    const systemQuantity = parseFloat(stockRows[0]?.quantity || 0);
    const material = materialRows[0];

    const [insertResult] = await connection.execute(
      `INSERT INTO inventory_check_items
        (check_id, material_id, system_quantity, actual_quantity, unit_id, difference, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, materialId, systemQuantity, systemQuantity, material.unit_id || null, 0, remark || null]
    );

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        id: insertResult.insertId,
        check_id: Number(id),
        material_id: materialId,
        material_code: material.code,
        material_name: material.name,
        material_specs: material.specs,
        specs: material.specs,
        system_quantity: systemQuantity,
        actual_quantity: systemQuantity,
        difference: 0,
        book_qty: systemQuantity,
        actual_qty: systemQuantity,
        unit_id: material.unit_id,
        unit_name: material.unit_name,
        remark: remark || null,
      },
      'Inventory check item added successfully',
      201
    );
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return ResponseHandler.error(
        res,
        'Material already exists in this inventory check',
        'DUPLICATE_ITEM',
        409
      );
    }
    logger.error('Add inventory check item failed:', error);
    ResponseHandler.error(res, 'Add inventory check item failed', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

const updateCheck = async (req, res) => {
  {
    const { id } = req.params;
    if (id !== null && id !== undefined && id !== '') {
      const ScopeGuard = require('../../../authorization/ScopeGuard');
      if (!(await ScopeGuard.assertAccess(db.pool, req, 'inventory_check', id))) {
        return ResponseHandler.forbidden(res, '无权修改该盘点单');
      }
    }
  }

  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    // HTTP camel → snake
    const mapped = inventoryCheckMap.fromApi(req.body || {});
    const check_date = mapped.check_date;
    const remark = mapped.remark;
    const items = Array.isArray(mapped.items)
      ? mapped.items
      : Array.isArray(req.body?.items)
        ? req.body.items.map((it) => inventoryCheckItemMap.fromApi(it))
        : undefined;

    // 检查盘点单是否存在
    const [checkResult] = await connection.execute(
      'SELECT status FROM inventory_checks WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '盘点单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = checkResult[0].status;

    // 进行中允许录入实盘数量和备注；待审核及终态不得再覆盖结果。
    if (!['draft', 'in_progress'].includes(currentStatus)) {
      await connection.rollback();
      return ResponseHandler.error(res, '只有草稿或进行中的盘点单可以更新', 'BAD_REQUEST', 400);
    }

    // 检查原始实盘输入，避免字段转换器把非法字符串补成0。
    if (req.body?.items !== undefined && !Array.isArray(req.body.items)) {
      await connection.rollback();
      return ResponseHandler.error(res, '盘点明细格式无效', 'VALIDATION_ERROR', 400);
    }
    for (const item of req.body?.items || []) {
      const rawActual = item?.actualQuantity;
      if (rawActual !== undefined) {
        const actual = parseCheckQuantity(rawActual);
        if (actual === null || actual < 0) {
          await connection.rollback();
          return ResponseHandler.error(res, '实盘数量必须为有效的非负数', 'VALIDATION_ERROR', 400);
        }
      }
    }

    const [storedItems] = await connection.execute(
      'SELECT id, system_quantity FROM inventory_check_items WHERE check_id = ? FOR UPDATE',
      [id]
    );

    // 更新盘点单基本信息
    await connection.execute(
      `UPDATE inventory_checks SET
        check_date = COALESCE(?, check_date),
        remark = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL`,
      [currentStatus === 'draft' ? check_date || null : null, remark || null, id]
    );

    // 如果提供了物料明细，更新明细
    if (items && Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        // items already snake via inventoryCheckItemMap.fromApi
        if (!item.id) continue;
        if (
          item.actual_quantity === undefined ||
          item.actual_quantity === null ||
          item.actual_quantity === ''
        ) {
          continue;
        }

        const stored = storedItems.find((row) => Number(row.id) === Number(item.id));
        const systemQuantity = parseCheckQuantity(stored?.system_quantity);
        if (systemQuantity === null) {
          await connection.rollback();
          return ResponseHandler.error(res, '盘点明细或账面数量无效', 'VALIDATION_ERROR', 400);
        }
        const actualQuantity = parseFloat(item.actual_quantity);
        if (!Number.isFinite(actualQuantity)) {
          await connection.rollback();
          return ResponseHandler.error(
            res,
            'actual_quantity must be a valid number',
            'BAD_REQUEST',
            400
          );
        }
        const difference = actualQuantity - systemQuantity;

        await connection.execute(
          `UPDATE inventory_check_items SET
            actual_quantity = ?,
            difference = ?,
            remark = ?
          WHERE id = ? AND check_id = ?`,
          [actualQuantity, difference, item.remark || null, item.id, id]
        );
      }
    }

    await connection.commit();

    ResponseHandler.success(res, { id }, '盘点单更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新库存盘点单失败:', error);
    ResponseHandler.error(res, '更新库存盘点单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 删除库存盘点单

const deleteCheck = async (req, res) => {
  {
    const { id } = req.params;
    if (id !== null && id !== undefined && id !== '') {
      const ScopeGuard = require('../../../authorization/ScopeGuard');
      if (!(await ScopeGuard.assertAccess(db.pool, req, 'inventory_check', id))) {
        return ResponseHandler.forbidden(res, '无权删除该盘点单');
      }
    }
  }

  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // 检查盘点单是否存在
    const [checkResult] = await connection.execute(
      'SELECT status FROM inventory_checks WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '盘点单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = checkResult[0].status;

    // 只有草稿状态的盘点单可以删除
    if (currentStatus !== 'draft') {
      await connection.rollback();
      return ResponseHandler.error(res, '只有草稿状态的盘点单可以删除', 'BAD_REQUEST', 400);
    }

    // 删除盘点单明细
    await connection.execute('DELETE FROM inventory_check_items WHERE check_id = ?', [id]);

    // 删除盘点单
    // ✅ 软删除盘点单主表
    await softDelete(connection, 'inventory_checks', 'id', id);

    await connection.commit();

    ResponseHandler.success(res, null, '盘点单删除成功');
  } catch (error) {
    await connection.rollback();
    logger.error('删除库存盘点单失败:', error);
    ResponseHandler.error(res, '删除库存盘点单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

function parseCheckQuantity(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const quantity = Number(value);
  return Number.isFinite(quantity) ? quantity : null;
}

// 完成盘点必须覆盖全部明细；账面数量只以锁定的数据库记录为准。
function prepareCheckResults(storedItems, submittedItems) {
  if (!storedItems.length) throw new Error('请先添加盘点物料并录入实盘数量');
  if (submittedItems !== undefined && !Array.isArray(submittedItems)) {
    throw new Error('盘点明细格式无效');
  }
  const supplied = new Map();
  for (const item of submittedItems || []) {
    const itemId = Number(item?.id);
    if (
      !Number.isSafeInteger(itemId) ||
      itemId <= 0 ||
      supplied.has(itemId) ||
      !storedItems.some((stored) => Number(stored.id) === itemId)
    ) {
      throw new Error('盘点明细包含无效、重复或不属于本单的记录');
    }
    supplied.set(itemId, item);
  }
  if (submittedItems !== undefined && supplied.size !== storedItems.length) {
    throw new Error('请提交全部盘点明细的实盘数量');
  }
  return storedItems.map((stored, index) => {
    const submitted = supplied.get(Number(stored.id));
    const rawActual = submitted
      ? Object.hasOwn(submitted, 'actualQuantity')
        ? submitted.actualQuantity
        : submitted.actual_quantity
      : stored.actual_quantity;
    const actual = parseCheckQuantity(rawActual);
    const book = parseCheckQuantity(stored.system_quantity);
    if (actual === null || actual < 0) {
      throw new Error(`第${index + 1}项实盘数量必须为有效的非负数`);
    }
    if (book === null) throw new Error(`第${index + 1}项账面数量无效，请重新加载盘点单`);
    return {
      id: stored.id,
      actual_quantity: actual,
      difference: actual - book,
      remark: submitted
        ? (submitted.remarks ?? submitted.remark ?? stored.remark ?? null)
        : stored.remark,
    };
  });
}

// 提交盘点结果

const submitCheckResult = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { items } = req.body;

    // 检查盘点单是否存在
    const [checkResult] = await connection.execute(
      'SELECT id, check_no, location_id, check_type, check_date, status, remark, created_by, created_at, updated_at, deleted_at FROM inventory_checks WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '盘点单不存在', 'NOT_FOUND', 404);
    }

    const check = checkResult[0];

    // 只有草稿或进行中状态的盘点单可以提交结果
    if (check.status !== 'draft' && check.status !== 'in_progress') {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '只有草稿或进行中状态的盘点单可以提交结果',
        'BAD_REQUEST',
        400
      );
    }

    const [storedItems] = await connection.execute(
      'SELECT id, system_quantity, actual_quantity, remark FROM inventory_check_items WHERE check_id = ? FOR UPDATE',
      [id]
    );
    let results;
    try {
      results = prepareCheckResults(storedItems, items);
    } catch (error) {
      await connection.rollback();
      return ResponseHandler.error(res, error.message, 'VALIDATION_ERROR', 400);
    }
    for (const item of results) {
      await connection.execute(
        `UPDATE inventory_check_items SET
            actual_quantity = ?,
            difference = ?,
            remark = ?
          WHERE id = ? AND check_id = ?`,
        [item.actual_quantity, item.difference, item.remark || null, item.id, id]
      );
    }

    await connection.execute(
      'UPDATE inventory_checks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL',
      ['pending', id]
    );

    await connection.commit();

    ResponseHandler.success(res, { id }, '盘点结果提交成功，等待审核');
  } catch (error) {
    await connection.rollback();
    logger.error('提交盘点结果失败:', error);
    ResponseHandler.error(res, '提交盘点结果失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 更新盘点单状态

const updateCheckStatus = async (req, res) => {
  {
    const { id } = req.params;
    if (id !== null && id !== undefined && id !== '') {
      const ScopeGuard = require('../../../authorization/ScopeGuard');
      if (!(await ScopeGuard.assertAccess(db.pool, req, 'inventory_check', id))) {
        return ResponseHandler.forbidden(res, '无权变更该盘点单状态');
      }
    }
  }

  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { status } = req.body;

    // 验证状态值
    const validStatuses = ['draft', 'in_progress', 'pending', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      await connection.rollback();
      return ResponseHandler.error(res, '无效的状态值', 'BAD_REQUEST', 400);
    }

    // 检查盘点单是否存在
    const [checkResult] = await connection.execute(
      'SELECT id, check_no, location_id, check_type, check_date, status, remark, created_by, created_at, updated_at, deleted_at FROM inventory_checks WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '盘点单不存在', 'NOT_FOUND', 404);
    }

    const check = checkResult[0];
    const currentStatus = check.status;

    // 状态转换验证（引用统一状态注册表）
    const validTransitions = INVENTORY_CHECK_TRANSITIONS;

    if (!validTransitions[currentStatus].includes(status)) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        `无法从"${currentStatus}"状态转换为"${status}"状态`,
        'VALIDATION_ERROR',
        400
      );
    }

    if (status === 'pending' || status === 'completed') {
      const [storedItems] = await connection.execute(
        'SELECT id, system_quantity, actual_quantity, remark FROM inventory_check_items WHERE check_id = ? FOR UPDATE',
        [id]
      );
      try {
        const results = prepareCheckResults(storedItems);
        if (
          status === 'completed' &&
          results.some((item) => Math.abs(item.difference) > 0.000001)
        ) {
          throw new Error('盘点存在差异，请先通过调整库存处理差异');
        }
      } catch (error) {
        await connection.rollback();
        return ResponseHandler.error(res, error.message, 'VALIDATION_ERROR', 400);
      }
    }

    // 更新状态
    await connection.execute(
      'UPDATE inventory_checks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL',
      [status, id]
    );

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        id,
        oldStatus: currentStatus,
        newStatus: status,
      },
      '状态更新成功'
    );
  } catch (error) {
    await connection.rollback();
    logger.error('更新盘点单状态失败:', error);
    ResponseHandler.error(res, '更新盘点单状态失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 调整库存（基于盘点结果）

const adjustInventory = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // 检查盘点单是否存在
    const [checkResult] = await connection.execute(
      'SELECT id, check_no, location_id, check_type, check_date, status, remark, created_by, created_at, updated_at, deleted_at FROM inventory_checks WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '盘点单不存在', 'NOT_FOUND', 404);
    }

    const check = checkResult[0];

    // 只有待审核状态的盘点单可以进行库存调整
    if (check.status !== 'pending') {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '只有待审核状态的盘点单可以进行库存调整',
        'BAD_REQUEST',
        400
      );
    }

    // 获取盘点明细
    const [items] = await connection.execute(
      `SELECT
        i.*,
        m.name as material_name,
        m.unit_id
      FROM inventory_check_items i
      JOIN materials m ON i.material_id = m.id
      WHERE i.check_id = ?`,
      [id]
    );

    const checkOperator = await getCurrentUserName(req);

    // Physical counts cannot be reconciled against the formal ledger while
    // unposted movements exist. Serialize with movement staging and use a
    // current read, since this transaction may already have a read snapshot.
    const materialIds = [...new Set(items.map(item => Number(item.material_id)))].sort((a, b) => a - b);
    for (const materialId of materialIds) {
      await InventoryService._lockStockLocation(materialId, check.location_id, connection);
      const [pending] = await connection.execute(
        `SELECT l.id FROM inventory_posting_lines l
         JOIN inventory_posting_documents d ON d.id = l.posting_document_id
         WHERE l.material_id = ? AND l.location_id = ? AND d.finance_status = 'pending'
         LIMIT 1 FOR UPDATE`,
        [materialId, check.location_id]
      );
      if (pending.length) {
        await connection.rollback();
        return ResponseHandler.error(res,
          '盘点范围内存在待财务审核的库存单据，请先完成审核并复核实盘数量后再调整库存',
          'PENDING_INVENTORY_APPROVAL', 409);
      }
    }

    // 处理每个物料的库存调整
    for (const item of items) {
      // 只处理有差异的物料
      // 获取当前库存（移除HAVING条件，获取真实库存数量）
      const [stockResult] = await connection.execute(
        'SELECT material_id, location_id, SUM(il.quantity) as quantity FROM inventory_ledger il JOIN materials mat ON il.material_id = mat.id WHERE il.material_id = ? AND il.location_id = ? AND (mat.location_id IS NULL OR il.location_id = mat.location_id) GROUP BY material_id, location_id FOR UPDATE',
        [item.material_id, check.location_id]
      );

      const currentQuantity = stockResult.length > 0 ? parseFloat(stockResult[0].quantity) : 0;
      const newQuantity = parseCheckQuantity(item.actual_quantity);
      if (newQuantity === null || newQuantity < 0) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          'Inventory check item actual quantity is invalid',
          'BAD_REQUEST',
          400
        );
      }

      const adjustmentQuantity = newQuantity - currentQuantity;
      if (adjustmentQuantity === 0) {
        continue;
      }

      // 盘盈（入库方向）需要生成调整批次号，盘亏（出库方向）由 FIFO 自动拆批
      let checkBatchNumber = null;
      if (adjustmentQuantity > 0) {
        checkBatchNumber = `CK-${check.check_no}-${item.material_id}`;
      }

      // 记录库存交易日志
      await _insertInventoryLedgerLocal(connection, {
        material_id: item.material_id,
        location_id: check.location_id,
        transaction_type: 'check',
        quantity: adjustmentQuantity,
        batch_number: checkBatchNumber,
        unit_id: item.unit_id,
        reference_no: check.check_no,
        reference_type: 'check',
        operator: checkOperator,
        remark: `Inventory check adjustment: current stock ${currentQuantity}, counted stock ${newQuantity}, adjustment ${adjustmentQuantity}`,
        transaction_date: check.check_date,
        beforeQuantity: currentQuantity,
        afterQuantity: newQuantity,
      });

      // 在新架构中，库存通过inventory_ledger流水记录汇总计算
      // 只需要插入调整记录，无需直接更新库存表
    }

    // 更新盘点单状态为已完成（条件更新防并发重复调账）
    const [statusResult] = await connection.execute(
      `UPDATE inventory_checks
       SET status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL AND status = ?`,
      ['completed', id, 'pending']
    );
    if (!statusResult.affectedRows) {
      await connection.rollback();
      return ResponseHandler.error(res, '盘点单状态已变更，请刷新后重试', 'VALIDATION_ERROR', 400);
    }

    await connection.commit();

    ResponseHandler.success(res, { id }, '库存调整成功');
  } catch (error) {
    await connection.rollback();
    logger.error('库存调整失败:', error);
    ResponseHandler.error(res, '库存调整失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 状态映射检查API

const checkStatusMappings = async (req, res) => {
  try {
    const { generateStatusMappingReport } = require('../../../utils/statusMappingValidator');
    const report = generateStatusMappingReport();

    ResponseHandler.success(res, report, '状态映射检查完成');
  } catch (error) {
    logger.error('状态映射检查失败:', error);
    ResponseHandler.error(res, '状态映射检查失败', 'SERVER_ERROR', 500, error);
  }
};

// 批量库存查询API（优化版）

module.exports = {
  getCheckStatistics,
  getCheckList,
  getCheckDetail,
  createCheck,
  addCheckItem,
  updateCheck,
  deleteCheck,
  submitCheckResult,
  updateCheckStatus,
  adjustInventory,
  checkStatusMappings,
};
