/**
 * inventoryController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { mapKeysToSnake } = require('../../../utils/fieldMap');
const { logger } = require('../../../utils/logger');
const { parsePagination } = require('../../../utils/safePagination');

const db = require('../../../config/db');
const InventoryService = require('../../../services/InventoryService');
const businessConfig = require('../../../config/businessConfig');
const { getCurrentUserName } = require('../../../utils/userHelper');
const { _insertInventoryLedgerLocal } = require('./inventoryLedgerController');
const { getRequestActorLabel } = require('../../../utils/userUtils');

let businessTypeCache = null;
let businessTypeCacheTime = 0;
const BUSINESS_TYPE_CACHE_TTL = 5 * 60 * 1000;

// 统一库存查询子查询（基于 inventory_ledger 单表架构聚合计算当前库存）
// DRY: 两处引用相同子查询，统一使用 STOCK_SUBQUERY


// 引入库存一致性校验服务

// 引入成本凭证服务（用于生成领料凭证）

// 引入重构后的入库处理服务

// 引入状态映射工具和状态常量
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

const getManualTransactions = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const {
      page = 1,
      pageSize = 10,
      transaction_no,
      transaction_type,
      location_id,
      start_date,
      end_date,
      approval_status,
      material_name,
    } = req.query;

    const pagination = parsePagination(page, pageSize, { defaultPageSize: 10, maxPageSize: 100 });
    const offset = pagination.offset;
    const pageNum = pagination.page;
    const pageSizeNum = pagination.pageSize;
    const whereConditions = [];
    const queryParams = [];

    // 构建查询条件
    if (transaction_no) {
      whereConditions.push('mt.transaction_no LIKE ?');
      queryParams.push(`%${transaction_no}%`);
    }
    if (material_name) {
      whereConditions.push('(m.name LIKE ? OR m.code LIKE ? OR m.specs LIKE ?)');
      queryParams.push(`%${material_name}%`, `%${material_name}%`, `%${material_name}%`);
    }
    if (transaction_type) {
      whereConditions.push('mt.business_type_code = ?');
      queryParams.push(transaction_type);
    }
    if (location_id) {
      whereConditions.push('mt.location_id = ?');
      queryParams.push(location_id);
    }
    if (start_date) {
      whereConditions.push('mt.transaction_date >= ?');
      queryParams.push(start_date);
    }
    if (end_date) {
      whereConditions.push('mt.transaction_date <= ?');
      queryParams.push(end_date);
    }
    if (approval_status) {
      whereConditions.push('mt.approval_status = ?');
      queryParams.push(approval_status);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    // 查询总数（按单据编号分组）
    const countQuery = `SELECT COUNT(DISTINCT mt.transaction_no) as total
      FROM manual_transactions mt
      LEFT JOIN materials m ON mt.material_id = m.id
      ${whereClause}`;
    const [countResult] =
      whereConditions.length > 0
        ? await connection.execute(countQuery, queryParams)
        : await connection.query(countQuery);
    const total = countResult[0].total;

    // 查询列表数据（按单据编号分组，显示主要信息）


    let rows;
    if (whereConditions.length > 0) {
      // 有查询条件时使用 execute
      const listQuery = `SELECT
          MIN(mt.id) as id,
          mt.transaction_no,
          mt.transaction_type,
          mt.business_type_code,
          mt.transaction_date,
          mt.remark,
          mt.operator,
          CASE
            WHEN mt.operator = 'system' THEN '系统'
            ELSE COALESCE(
              (SELECT u.real_name FROM users u WHERE u.username = mt.operator COLLATE utf8mb4_unicode_ci LIMIT 1),
              (SELECT u.username FROM users u WHERE u.username = mt.operator COLLATE utf8mb4_unicode_ci LIMIT 1),
              mt.operator
            )
          END as operator_name,
          mt.approval_status,
          mt.approved_by,
          mt.approved_at,
          mt.approval_remark,
          mt.created_at,
          mt.updated_at,
          COUNT(mt.id) as item_count,
          GROUP_CONCAT(DISTINCT m.name SEPARATOR ', ') as material_names,
          GROUP_CONCAT(DISTINCT m.code SEPARATOR ', ') as material_codes,
          GROUP_CONCAT(DISTINCT m.specs SEPARATOR ', ') as material_specs
        FROM manual_transactions mt
        LEFT JOIN materials m ON mt.material_id = m.id
        ${whereClause}
        GROUP BY mt.transaction_no, mt.transaction_type, mt.business_type_code, mt.transaction_date, mt.remark, mt.operator, mt.approval_status, mt.approved_by, mt.approved_at, mt.approval_remark, mt.created_at, mt.updated_at
        ORDER BY mt.created_at DESC
        LIMIT ${pageSizeNum} OFFSET ${offset}`;
      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
      [rows] = await connection.execute(listQuery, queryParams);
    } else {
      // 没有查询条件时使用 query
      const listQuery = `SELECT
          MIN(mt.id) as id,
          mt.transaction_no,
          mt.transaction_type,
          mt.business_type_code,
          mt.transaction_date,
          mt.remark,
          mt.operator,
          CASE
            WHEN mt.operator = 'system' THEN '系统'
            ELSE COALESCE(
              (SELECT u.real_name FROM users u WHERE u.username = mt.operator COLLATE utf8mb4_unicode_ci LIMIT 1),
              (SELECT u.username FROM users u WHERE u.username = mt.operator COLLATE utf8mb4_unicode_ci LIMIT 1),
              mt.operator
            )
          END as operator_name,
          mt.approval_status,
          mt.approved_by,
          mt.approved_at,
          mt.approval_remark,
          mt.created_at,
          mt.updated_at,
          COUNT(mt.id) as item_count,
          GROUP_CONCAT(DISTINCT m.name SEPARATOR ', ') as material_names,
          GROUP_CONCAT(DISTINCT m.code SEPARATOR ', ') as material_codes,
          GROUP_CONCAT(DISTINCT m.specs SEPARATOR ', ') as material_specs
        FROM manual_transactions mt
        LEFT JOIN materials m ON mt.material_id = m.id
        GROUP BY mt.transaction_no, mt.transaction_type, mt.business_type_code, mt.transaction_date, mt.remark, mt.operator, mt.approval_status, mt.approved_by, mt.approved_at, mt.approval_remark, mt.created_at, mt.updated_at
        ORDER BY mt.created_at DESC
        LIMIT ${pageSizeNum} OFFSET ${offset}`;
      [rows] = await connection.query(listQuery);
    }

    // 查询统计数据（复用筛选条件，使统计卡片与列表一致）
    const statsQuery = `SELECT
        COUNT(DISTINCT mt.transaction_no) as total,
        COUNT(DISTINCT CASE WHEN mt.transaction_type = 'in' THEN mt.transaction_no END) as inCount,
        COUNT(DISTINCT CASE WHEN mt.transaction_type = 'out' THEN mt.transaction_no END) as outCount,
        COUNT(DISTINCT CASE WHEN DATE(mt.transaction_date) = CURDATE() THEN mt.transaction_no END) as todayCount
      FROM manual_transactions mt
      LEFT JOIN materials m ON mt.material_id = m.id
      ${whereClause}`;
    const [statsResult] = whereConditions.length > 0
      ? await connection.execute(statsQuery, queryParams)
      : await connection.query(statsQuery);

    ResponseHandler.success(
      res,
      {
        items: rows,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
        stats: statsResult[0],
      },
      '获取手工出入库列表成功'
    );
  } catch (error) {
    logger.error('获取手工出入库列表失败:', error);
    ResponseHandler.error(
      res,
      '获取手工出入库列表失败: ' + error.message,
      'SERVER_ERROR',
      500,
      error
    );
  } finally {
    connection.release();
  }
};

/**
 * 获取手工出入库详情（按单据编号获取所有明细）
 */

const getManualTransaction = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { transaction_no } = req.params;

    // 获取单据主信息
    const [mainInfo] = await connection.execute(
      `SELECT
        transaction_no,
        transaction_type,
        business_type_code,
        transaction_date,
        remark,
        operator,
        CASE
          WHEN operator = 'system' THEN '系统'
          ELSE COALESCE(
            (SELECT u.real_name FROM users u WHERE u.username = manual_transactions.operator COLLATE utf8mb4_unicode_ci LIMIT 1),
            (SELECT u.username FROM users u WHERE u.username = manual_transactions.operator COLLATE utf8mb4_unicode_ci LIMIT 1),
            operator
          )
        END as operator_name,
        created_at,
        updated_at
      FROM manual_transactions
      WHERE transaction_no = ?
      LIMIT 1`,
      [transaction_no]
    );

    if (mainInfo.length === 0) {
      return ResponseHandler.error(res, '单据不存在', 'NOT_FOUND', 404);
    }

    // 获取单据明细
    const [items] = await connection.execute(
      `SELECT
        mt.id,
        mt.material_id,
        mt.location_id,
        mt.quantity,
        mt.unit_cost,
        m.code as material_code,
        m.name as material_name,
        m.specs as specification,
        u.name as unit_name,
        l.name as location_name
      FROM manual_transactions mt
      LEFT JOIN materials m ON mt.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      LEFT JOIN locations l ON mt.location_id = l.id
      WHERE mt.transaction_no = ?
      ORDER BY mt.id`,
      [transaction_no]
    );

    const result = {
      ...mainInfo[0],
      items,
    };

    ResponseHandler.success(res, result, '获取手工出入库详情成功');
  } catch (error) {
    logger.error('获取手工出入库详情失败:', error);
    ResponseHandler.error(
      res,
      '获取手工出入库详情失败: ' + error.message,
      'SERVER_ERROR',
      500,
      error
    );
  } finally {
    connection.release();
  }
};

/**
 * 创建手工出入库
 */

const createManualTransaction = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const failValidation = async (message, code = 'VALIDATION_ERROR', status = 400) => {
      await connection.rollback();
      return ResponseHandler.error(res, message, code, status);
    };

    const { transaction_type: businessTypeCode, transaction_date, remark, items } = mapKeysToSnake(req.body || {});

    const operator = await getCurrentUserName(req);
    const createdBy = Number.parseInt(req.user?.id, 10) || null;

    logger.debug('Manual inventory transaction payload normalized', {
      businessTypeCode,
      transactionDate: transaction_date,
      hasRemark: Boolean(remark),
      itemCount: Array.isArray(items) ? items.length : 0,
      userId: req.user?.id,
      operator,
    });

    // 验证必填字段
    if (!businessTypeCode || !transaction_date) {
      logger.error('缺少必填字段:', {
        businessTypeCode,
        transaction_date,
        businessTypeCode类型: typeof businessTypeCode,
        transaction_date类型: typeof transaction_date,
      });
      return failValidation('缺少必填字段');
    }

    // ===== 年度结存校验 =====
    const PeriodValidationService = require('../../../services/business/PeriodValidationService');
    const inventoryCheck =
      await PeriodValidationService.validateInventoryTransaction(transaction_date);
    if (!inventoryCheck.allowed) {
      return failValidation(inventoryCheck.message);
    }
    // ===== 年度结存校验结束 =====

    // 从业务类型表获取 category 来判断是入库还是出库
    const [businessTypeRows] = await connection.execute(
      'SELECT id, code, name, category FROM business_types WHERE code = ? AND status = 1',
      [businessTypeCode]
    );

    let transaction_type;
    if (businessTypeRows.length > 0) {
      // 从业务类型表获取 category (in/out/transfer/adjust)
      const category = businessTypeRows[0].category;
      if (category === 'in') {
        transaction_type = 'in';
      } else if (category === 'out') {
        transaction_type = 'out';
      } else {
        logger.error('无效的业务类型分类:', { businessTypeCode, category });
        return failValidation('该业务类型不支持手工出入库操作');
      }
    } else {
      // 兼容直接传入 'in' 或 'out' 的情况
      if (businessTypeCode === 'in' || businessTypeCode === 'out') {
        transaction_type = businessTypeCode;
      } else if (businessTypeCode.includes('_in')) {
        transaction_type = 'in';
      } else if (businessTypeCode.includes('_out')) {
        transaction_type = 'out';
      } else {
        logger.error('无效的业务类型:', { businessTypeCode });
        return failValidation('无效的业务类型');
      }
    }

    logger.info('转换后的 transaction_type:', transaction_type);

    // 验证明细
    if (!items || !Array.isArray(items) || items.length === 0) {
      logger.error('明细数据为空:', { items });
      return failValidation('请至少添加一条物料明细');
    }

    const materialIds = [...new Set(items.map(item => Number(item.material_id)).filter(Boolean))];
    const locationIds = [...new Set(items.map(item => Number(item.location_id)).filter(Boolean))];

    const materialInfoMap = await InventoryService.getBatchMaterialInfo(materialIds, connection);
    let validLocationIds = new Set();
    if (locationIds.length > 0) {
      const locationPlaceholders = locationIds.map(() => '?').join(',');
      const [locationRows] = await connection.execute(
        `SELECT id FROM locations WHERE id IN (${locationPlaceholders}) AND deleted_at IS NULL`,
        locationIds
      );
      validLocationIds = new Set(locationRows.map(row => Number(row.id)));
    }

    // 验证每条明细
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const materialId = Number(item.material_id);
      const locationId = Number(item.location_id);
      const quantity = Number(item.quantity);
      if (!materialId || !locationId || !Number.isFinite(quantity) || quantity <= 0) {
        logger.error(`第${i + 1}条明细数据不完整:`, item);
        return failValidation(`第${i + 1}条明细数据不完整或数量无效`);
      }
      if (!materialInfoMap.has(materialId)) {
        logger.error(`第${i + 1}条明细物料不存在:`, item);
        return failValidation(`第${i + 1}条明细物料不存在`);
      }
      if (!validLocationIds.has(locationId)) {
        logger.error(`第${i + 1}条明细仓库不存在:`, item);
        return failValidation(`第${i + 1}条明细仓库不存在`);
      }
      const unitCost = Number(item.unit_cost ?? item.unitCost);
      if (transaction_type === 'in' && (!Number.isFinite(unitCost) || unitCost <= 0)) {
        return failValidation(`第${i + 1}条入库明细必须填写大于0的单位成本`);
      }
    }

    // 生成单据编号 — 使用统一编码引擎
    const { CodeGenerators } = require('../../../utils/codeGenerator');
    const transaction_no = await CodeGenerators.generateManualTransactionCode(connection);

    logger.info(`生成单据编号: ${transaction_no}`);

    // 处理每条明细
    for (const item of items) {
      const material_id = Number(item.material_id);
      const location_id = Number(item.location_id);
      const quantity = Number(item.quantity);
      const unitCost = transaction_type === 'in'
        ? Number(item.unit_cost ?? item.unitCost)
        : null;

      // 从批量预取结果获取物料信息


      // 插入手工出入库记录 - 默认状态为待审批
      await connection.execute(
        `INSERT INTO manual_transactions
          (transaction_no, transaction_type, business_type_code, transaction_date, material_id, location_id, quantity, unit_cost, remark, operator, created_by, approval_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
        [
          transaction_no,
          transaction_type,
          businessTypeCode,
          transaction_date,
          material_id,
          location_id,
          quantity,
          unitCost,
          remark,
          operator,
          createdBy,
        ]
      );

      // 注意：不再立即更新库存，等审批通过后再更新
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        transaction_no,
      },
      '创建手工出入库成功，等待审批'
    );
  } catch (error) {
    await connection.rollback();
    logger.error('创建手工出入库失败:', error);
    ResponseHandler.error(res, '创建手工出入库失败: ' + error.message, 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 获取指定仓库的库存
 */

const createManualTransactionInternal = async (connection, params) => {
  const { businessTypeCode, transaction_date, remark, items, operator, createdBy = null } = params;

  logger.info('=== 内部创建手工出入库 ===');
  logger.info('参数:', { businessTypeCode, transaction_date, remark, items, operator });

  // 验证必填字段
  if (!businessTypeCode || !transaction_date) {
    throw new Error('缺少必填字段');
  }

  // ===== 年度结存校验 =====
  const PeriodValidationService = require('../../../services/business/PeriodValidationService');
  const inventoryCheck =
    await PeriodValidationService.validateInventoryTransaction(transaction_date);
  if (!inventoryCheck.allowed) {
    throw new Error(inventoryCheck.message);
  }

  // 从业务类型表获取 category 来判断是入库还是出库
  const [businessTypeRows] = await connection.execute(
    'SELECT id, code, name, category FROM business_types WHERE code = ? AND status = 1',
    [businessTypeCode]
  );

  let transaction_type;
  if (businessTypeRows.length > 0) {
    const category = businessTypeRows[0].category;
    if (category === 'in') {
      transaction_type = 'in';
    } else if (category === 'out') {
      transaction_type = 'out';
    } else {
      throw new Error('该业务类型不支持手工出入库操作');
    }
  } else {
    // 兼容直接传入 'in' 或 'out' 的情况
    if (businessTypeCode === 'in' || businessTypeCode === 'out') {
      transaction_type = businessTypeCode;
    } else if (businessTypeCode.includes('_in')) {
      transaction_type = 'in';
    } else if (businessTypeCode.includes('_out')) {
      transaction_type = 'out';
    } else {
      throw new Error('无效的业务类型');
    }
  }

  // 验证明细
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('请至少添加一条物料明细');
  }

  const locationIds = [...new Set(items.map(item => Number(item.location_id)).filter(Boolean))];
  let validLocationIds = new Set();
  if (locationIds.length > 0) {
    const locationPlaceholders = locationIds.map(() => '?').join(',');
    const [locationRows] = await connection.execute(
      `SELECT id FROM locations WHERE id IN (${locationPlaceholders}) AND deleted_at IS NULL`,
      locationIds
    );
    validLocationIds = new Set(locationRows.map(row => Number(row.id)));
  }

  // 验证每条明细
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const quantity = Number(item.quantity);
    const locationId = Number(item.location_id);
    if (!item.material_id || !locationId || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`第${i + 1}条明细数据不完整或数量无效`);
    }
    if (!validLocationIds.has(locationId)) {
      throw new Error(`第${i + 1}条明细仓库不存在`);
    }
    const unitCost = Number(item.unit_cost ?? item.unitCost);
    if (transaction_type === 'in' && (!Number.isFinite(unitCost) || unitCost <= 0)) {
      throw new Error(`第${i + 1}条入库明细必须填写大于0的单位成本`);
    }
  }

  // 生成单据编号 — 使用统一编码引擎
  const { CodeGenerators } = require('../../../utils/codeGenerator');
  const transaction_no = await CodeGenerators.generateManualTransactionCode(connection);

  logger.info(`生成单据编号: ${transaction_no}`);

  // 批量预取物料信息（消除循环内 N+1 查询）
  const approvalMaterialIds = items.map(i => i.material_id);
  const approvalMaterialInfoMap = await InventoryService.getBatchMaterialInfo(approvalMaterialIds, connection);

  // 处理每条明细
  for (const item of items) {
    const material_id = Number(item.material_id);
    const location_id = Number(item.location_id);
    const quantity = Number(item.quantity);
    const unitCost = transaction_type === 'in'
      ? Number(item.unit_cost ?? item.unitCost)
      : null;

    // 从批量预取结果获取物料信息
    const matInfo = approvalMaterialInfoMap.get(material_id);
    if (!matInfo) {
      throw new Error(`物料ID ${material_id} 不存在`);
    }

    // 插入手工出入库记录 - 默认状态为待审批
    await connection.execute(
      `INSERT INTO manual_transactions
        (transaction_no, transaction_type, business_type_code, transaction_date, material_id, location_id, quantity, unit_cost, remark, operator, created_by, approval_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
      [
        transaction_no,
        transaction_type,
        businessTypeCode,
        transaction_date,
        material_id,
        location_id,
        quantity,
        unitCost,
        remark,
        operator,
        createdBy,
      ]
    );
  }

  return transaction_no;
};

/**
 * 调货（在一个事务中创建入库单和出库单）
 */

const createExchange = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const {
      transaction_date,
      remark,
      return_material_id,
      return_location_id,
      return_quantity,
      return_unit_cost,
      issue_material_id,
      issue_location_id,
      issue_quantity,
    } = mapKeysToSnake(req.body || {});

    const operator = await getCurrentUserName(req);

    // 验证必填字段
    if (
      !transaction_date ||
      !String(remark || '').trim() ||
      !return_material_id ||
      !return_location_id ||
      !Number.isFinite(Number(return_quantity)) ||
      Number(return_quantity) <= 0 ||
      !Number.isFinite(Number(return_unit_cost)) ||
      Number(return_unit_cost) <= 0 ||
      !issue_material_id ||
      !issue_location_id ||
      !Number.isFinite(Number(issue_quantity)) ||
      Number(issue_quantity) <= 0
    ) {
      await connection.rollback();
      return ResponseHandler.error(res, '缺少必填字段', 'VALIDATION_ERROR', 400);
    }

    // 创建入库单（退回）
    const returnTransactionNo = await createManualTransactionInternal(connection, {
      businessTypeCode: 'manual_in',
      transaction_date,
      remark: `调货-退回：${String(remark).trim()}`,
      items: [
        {
          material_id: return_material_id,
          location_id: return_location_id,
          quantity: return_quantity,
          unit_cost: return_unit_cost,
        },
      ],
      operator,
      createdBy: Number.parseInt(req.user?.id, 10) || null,
    });

    logger.info(`创建退回单成功: ${returnTransactionNo}`);

    // 创建出库单（补发）
    const issueTransactionNo = await createManualTransactionInternal(connection, {
      businessTypeCode: 'manual_out',
      transaction_date,
      remark: `调货-补发：${String(remark).trim()}`,
      items: [
        {
          material_id: issue_material_id,
          location_id: issue_location_id,
          quantity: issue_quantity,
        },
      ],
      operator,
      createdBy: Number.parseInt(req.user?.id, 10) || null,
    });

    logger.info(`创建补发单成功: ${issueTransactionNo}`);

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        return_transaction_no: returnTransactionNo,
        issue_transaction_no: issueTransactionNo,
      },
      '调货成功，已创建退回单和补发单'
    );
  } catch (error) {
    await connection.rollback();
    logger.error('调货失败:', error);
    ResponseHandler.error(res, '调货失败: ' + error.message, 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 审批手工出入库
 */

const approveManualTransaction = async (req, res) => {
  const { id } = req.params;
  const { action, remark: approvalRemark } = req.body;
  if (!['approve', 'reject'].includes(action)) {
    return ResponseHandler.error(res, '无效的审批操作', 'VALIDATION_ERROR', 400);
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const approver = getRequestActorLabel(req);
    const approverId = Number.parseInt(req.user?.id, 10) || null;

    logger.info('=== 审批手工出入库 ===', { id, action, approver });

    const [records] = await connection.execute(
      `SELECT id, transaction_no, transaction_type, business_type_code, transaction_date,
              material_id, location_id, quantity, unit_cost, remark, operator, created_by,
              created_at, updated_at, approval_status, approved_by, approved_at, approval_remark
         FROM manual_transactions
        WHERE id = ?
        FOR UPDATE`,
      [id]
    );

    if (records.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '记录不存在', 'NOT_FOUND', 404);
    }

    const record = records[0];

    const legacyCreatorMatches = !record.created_by && [
      req.user?.username,
      req.user?.name,
      req.user?.real_name,
    ].filter(Boolean).some((name) => String(name) === String(record.operator));
    if ((approverId && Number(record.created_by) === approverId) || legacyCreatorMatches) {
      await connection.rollback();
      return ResponseHandler.error(res, '制单人不能审批自己的手工出入库单', 'VALIDATION_ERROR', 400);
    }

    // 检查是否已审批
    if (record.approval_status !== 'pending') {
      await connection.rollback();
      return ResponseHandler.error(res, '该单据已审批，不能重复操作', 'VALIDATION_ERROR', 400);
    }

    // 获取同一单号的所有记录
    const [allRecords] = await connection.execute(
      `SELECT id, transaction_no, transaction_type, business_type_code, transaction_date,
              material_id, location_id, quantity, unit_cost, remark, operator, created_by,
              created_at, updated_at, approval_status, approved_by, approved_at, approval_remark
         FROM manual_transactions
        WHERE transaction_no = ?
        ORDER BY id
        FOR UPDATE`,
      [record.transaction_no]
    );

    if (allRecords.some((item) => item.approval_status !== 'pending')) {
      await connection.rollback();
      return ResponseHandler.error(res, '单据明细审批状态不一致，请刷新后重试', 'VALIDATION_ERROR', 409);
    }

    if (action === 'approve') {
      const PeriodValidationService = require('../../../services/business/PeriodValidationService');
      const inventoryCheck = await PeriodValidationService.validateInventoryTransaction(
        record.transaction_date,
        connection
      );
      if (!inventoryCheck.allowed) {
        await connection.rollback();
        return ResponseHandler.error(res, inventoryCheck.message, 'VALIDATION_ERROR', 400);
      }
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // 更新所有同单号记录的审批状态
    const [approvalUpdate] = await connection.execute(
      `UPDATE manual_transactions
       SET approval_status = ?, approved_by = ?, approved_at = NOW(), approval_remark = ?
       WHERE transaction_no = ? AND approval_status = 'pending'`,
      [newStatus, approver, approvalRemark || '', record.transaction_no]
    );
    if (Number(approvalUpdate.affectedRows) !== allRecords.length) {
      throw new Error('单据已被其他人处理，请刷新后重试');
    }

    // 如果是审批通过，执行库存变动
    if (action === 'approve') {
      // 批量预取物料信息（消除循环内 N+1 查询）
      const approveMaterialIds = allRecords.map(r => r.material_id);
      const approveMaterialInfoMap = await InventoryService.getBatchMaterialInfo(approveMaterialIds, connection);

      for (const item of allRecords) {
        const {
          material_id,
          location_id,
          quantity,
          transaction_type,
          business_type_code,
          transaction_date,
          transaction_no,
          operator,
          remark,
        } = item;

        // 从批量预取结果获取物料信息
        const matInfo = approveMaterialInfoMap.get(material_id);
        if (!matInfo) {
          throw new Error(`物料ID ${material_id} 不存在`);
        }
        const unit_id = matInfo.unitId;

        // 计算库存变化量
        const quantityChange =
          transaction_type === 'in' ? parseFloat(quantity) : -parseFloat(quantity);

        // 入库操作需要生成可追溯的批次号，出库由 FIFO 自动拆批
        let batch_number = null;
        if (transaction_type === 'in') {
          const dateStr = new Date(transaction_date || Date.now()).toISOString().slice(0, 10).replace(/-/g, '');
          batch_number = `MI-${dateStr}-${transaction_no}-${item.id}`;
        }

        // 插入库存流水（出库时启用库存校验，不允许负库存）
        await _insertInventoryLedgerLocal(connection, {
          material_id,
          location_id,
          transaction_type:
            business_type_code || (transaction_type === 'in' ? 'manual_in' : 'manual_out'),
          quantity: quantityChange,
          unit_id,
          batch_number,
          reference_no: transaction_no,
          reference_type: 'manual_transaction',
          operator: operator || approver,
          remark,
          transaction_date,
          unit_cost: transaction_type === 'in' ? Number(item.unit_cost) : null,
          checkStockSufficiency: transaction_type === 'out',
          allowNegativeStock: false,
        });
      }
    }

    await connection.commit();

    const message = action === 'approve' ? '审批通过，库存已更新' : '已拒绝该单据';

    ResponseHandler.success(
      res,
      {
        transaction_no: record.transaction_no,
        approval_status: newStatus,
        approved_by: approver,
      },
      message
    );
  } catch (error) {
    await connection.rollback();
    logger.error('审批手工出入库失败:', error);
    ResponseHandler.error(res, '审批失败: ' + error.message, 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新手工出入库
 */

const updateManualTransaction = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { transaction_no } = req.params;
    const {
      item_id,
      transaction_type: businessTypeCode,
      transaction_date,
      material_id,
      location_id,
      quantity,
      unit_cost,
      remark,
    } = mapKeysToSnake(req.body || {});

    if (!businessTypeCode || !transaction_date) {
      await connection.rollback();
      return ResponseHandler.error(res, '缺少必填字段', 'VALIDATION_ERROR', 400);
    }

    let transaction_type;
    const [businessTypes] = await connection.execute(
      'SELECT category FROM business_types WHERE code = ? AND status = 1',
      [businessTypeCode]
    );
    if (businessTypes[0]?.category === 'in' || businessTypeCode === 'in' || businessTypeCode.includes('_in')) {
      transaction_type = 'in';
    } else if (businessTypes[0]?.category === 'out' || businessTypeCode === 'out' || businessTypeCode.includes('_out')) {
      transaction_type = 'out';
    }

    if (transaction_type !== 'in' && transaction_type !== 'out') {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '无效的业务类型，必须是入库或出库类型',
        'VALIDATION_ERROR',
        400
      );
    }

    const [documentItems] = await connection.execute(
      `SELECT id, transaction_no, transaction_type, business_type_code, transaction_date,
              material_id, location_id, quantity, unit_cost, remark, operator, created_by,
              approval_status
         FROM manual_transactions
        WHERE transaction_no = ?
        ORDER BY id
        FOR UPDATE`,
      [transaction_no]
    );

    if (documentItems.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '单据不存在', 'NOT_FOUND', 404);
    }

    let old;
    if (item_id) {
      old = documentItems.find((item) => Number(item.id) === Number(item_id));
      if (!old) {
        await connection.rollback();
        return ResponseHandler.error(res, '指定明细不属于该单据', 'VALIDATION_ERROR', 400);
      }
    } else if (documentItems.length === 1) {
      old = documentItems[0];
    } else {
      await connection.rollback();
      return ResponseHandler.error(res, '多明细单据修改时必须指定 item_id', 'VALIDATION_ERROR', 400);
    }

    if (documentItems.some((item) => item.approval_status !== 'pending')) {
      await connection.rollback();
      return ResponseHandler.error(res, '已审批的单据不允许修改', 'VALIDATION_ERROR', 400);
    }

    const normalizedMaterialId = Number(material_id);
    const normalizedLocationId = Number(location_id);
    const normalizedQuantity = Number(quantity);
    const normalizedUnitCost = Number(unit_cost);
    if (
      !normalizedMaterialId ||
      !normalizedLocationId ||
      !Number.isFinite(normalizedQuantity) ||
      normalizedQuantity <= 0 ||
      (transaction_type === 'in' && (!Number.isFinite(normalizedUnitCost) || normalizedUnitCost <= 0))
    ) {
      await connection.rollback();
      return ResponseHandler.error(res, '明细数据不完整、数量无效或入库成本无效', 'VALIDATION_ERROR', 400);
    }

    const PeriodValidationService = require('../../../services/business/PeriodValidationService');
    const inventoryCheck = await PeriodValidationService.validateInventoryTransaction(
      transaction_date,
      connection
    );
    if (!inventoryCheck.allowed) {
      await connection.rollback();
      return ResponseHandler.error(res, inventoryCheck.message, 'VALIDATION_ERROR', 400);
    }

    const [materialInfo] = await connection.execute(
      'SELECT id FROM materials WHERE id = ? AND deleted_at IS NULL',
      [normalizedMaterialId]
    );

    if (materialInfo.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '物料不存在', 'NOT_FOUND', 404);
    }
    const [locationInfo] = await connection.execute(
      'SELECT id FROM locations WHERE id = ? AND deleted_at IS NULL',
      [normalizedLocationId]
    );
    if (locationInfo.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '仓库不存在', 'NOT_FOUND', 404);
    }

    const [updateResult] = await connection.execute(
      `UPDATE manual_transactions
       SET transaction_type = ?, business_type_code = ?, transaction_date = ?, material_id = ?, location_id = ?,
           quantity = ?, unit_cost = ?, remark = ?, updated_at = NOW()
       WHERE id = ? AND approval_status = 'pending'`,
      [
        transaction_type,
        businessTypeCode,
        transaction_date,
        normalizedMaterialId,
        normalizedLocationId,
        normalizedQuantity,
        transaction_type === 'in' ? normalizedUnitCost : null,
        remark,
        old.id,
      ]
    );
    if (updateResult.affectedRows !== 1) {
      throw new Error('单据已被其他人处理，请刷新后重试');
    }

    await connection.commit();

    ResponseHandler.success(res, null, '更新手工出入库成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新手工出入库失败:', error);
    ResponseHandler.error(res, '更新手工出入库失败: ' + error.message, 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 删除手工出入库（删除整个单据的所有明细）
 */

const deleteManualTransaction = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { transaction_no } = req.params;

    // 查询单据的所有明细
    const [records] = await connection.execute(
      `SELECT id, transaction_no, transaction_type, business_type_code, transaction_date,
              material_id, location_id, quantity, unit_cost, remark, operator, created_by,
              created_at, updated_at, approval_status, approved_by, approved_at, approval_remark
         FROM manual_transactions
        WHERE transaction_no = ?
        FOR UPDATE`,
      [transaction_no]
    );

    if (records.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '单据不存在', 'NOT_FOUND', 404);
    }

    const firstRecord = records[0];
    const approvalStatus = firstRecord.approval_status;

    if (approvalStatus !== STATUS.APPROVAL.PENDING) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '已审批或已拒绝的单据必须保留审计记录，不能删除；如需更正请走冲销流程',
        'VALIDATION_ERROR',
        400
      );
    }

    // 检查审批状态
    if (approvalStatus === STATUS.APPROVAL.APPROVED) {
      // 已审批通过的单据，需要回滚库存
      logger.info(`删除已审批单据 ${transaction_no}，将回滚库存`);

      // 批量预取物料信息（消除循环内 N+1 查询）
      const deleteMaterialIds = records.map(r => r.material_id);
      const deleteMaterialInfoMap = await InventoryService.getBatchMaterialInfo(deleteMaterialIds, connection);

      const rollbackOperator = await getCurrentUserName(req);
      for (const data of records) {
        // 从批量预取结果获取物料信息
        const matInfo = deleteMaterialInfoMap.get(data.material_id);
        const unit_id = matInfo ? matInfo.unitId : null;

        // 回滚库存
        const quantityChange =
          data.transaction_type === 'in' ? -parseFloat(data.quantity) : parseFloat(data.quantity);

        // 回滚入库（出库方向）：从原始台账溯源批次号，供 FIFO 自动拆批
        // 回滚出库（入库方向）：需要生成回滚批次号
        let rollbackBatchNumber = null;
        if (quantityChange > 0) {
          // 入库方向（回滚出库），需要批次号
          rollbackBatchNumber = `ROLLBACK-${data.transaction_no}-${data.material_id}`;
        }
        // quantityChange < 0（回滚入库 = 出库方向），不传批次号由 FIFO 自动分配

        await _insertInventoryLedgerLocal(connection, {
          material_id: data.material_id,
          location_id: data.location_id,
          transaction_type: data.transaction_type === 'in' ? 'manual_in' : 'manual_out',
          quantity: quantityChange,
          unit_id,
          batch_number: rollbackBatchNumber,
          reference_no: data.transaction_no,
          reference_type: 'manual_transaction',
          operator: rollbackOperator,
          remark: '删除已审批单据-回滚库存',
          transaction_date: data.transaction_date,
        });
      }
    } else if (approvalStatus === STATUS.APPROVAL.REJECTED) {
      // 已拒绝的单据不允许删除
      await connection.rollback();
      return ResponseHandler.error(res, '已拒绝的单据无需删除', 'VALIDATION_ERROR', 400);
    } else {
      // pending 状态，直接删除，不需要回滚库存
      logger.info(`删除待审批单据 ${transaction_no}，无需回滚库存`);
    }

    // 删除所有明细记录
    await connection.execute('DELETE FROM manual_transactions WHERE transaction_no = ?', [
      transaction_no,
    ]);

    await connection.commit();

    ResponseHandler.success(res, null, '删除手工出入库成功');
  } catch (error) {
    await connection.rollback();
    logger.error('删除手工出入库失败:', error);
    ResponseHandler.error(res, '删除手工出入库失败: ' + error.message, 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};


const loadBusinessTypeCache = async () => {
  const now = Date.now();
  if (businessTypeCache && now - businessTypeCacheTime < BUSINESS_TYPE_CACHE_TTL) {
    return businessTypeCache;
  }

  try {
    const [rows] = await db.pool.execute('SELECT code, name FROM business_types WHERE status = 1');
    businessTypeCache = {};
    rows.forEach((row) => {
      businessTypeCache[row.code] = row.name;
    });
    businessTypeCacheTime = now;
    return businessTypeCache;
  } catch (error) {
    logger.error('加载业务类型缓存失败:', error);
    return businessTypeCache || {};
  }
};

// 获取库存统计数据


module.exports = {
  getManualTransactions,
  getManualTransaction,
  createManualTransaction,
  createManualTransactionInternal,
  createExchange,
  approveManualTransaction,
  updateManualTransaction,
  deleteManualTransaction,
  loadBusinessTypeCache,
};
