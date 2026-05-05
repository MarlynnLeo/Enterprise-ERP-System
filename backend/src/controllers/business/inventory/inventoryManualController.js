/**
 * inventoryController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const db = require('../../../config/db');
const InventoryService = require('../../../services/InventoryService');
// const InventoryDeductionService = require('../../../services/business/InventoryDeductionService');
const businessConfig = require('../../../config/businessConfig');
const { getCurrentUserName } = require('../../../utils/userHelper');
const { _insertInventoryLedgerLocal } = require('./inventoryLedgerController');

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
    } = req.query;

    const offset = (page - 1) * pageSize;
    const whereConditions = [];
    const queryParams = [];

    // 构建查询条件
    if (transaction_no) {
      whereConditions.push('mt.transaction_no LIKE ?');
      queryParams.push(`%${transaction_no}%`);
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
    const countQuery = `SELECT COUNT(DISTINCT mt.transaction_no) as total FROM manual_transactions mt ${whereClause}`;
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
        LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}`;
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
        LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}`;
      [rows] = await connection.query(listQuery);
    }

    // 查询统计数据
    const [statsResult] = await connection.execute(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN transaction_type = 'in' THEN 1 ELSE 0 END) as inCount,
        SUM(CASE WHEN transaction_type = 'out' THEN 1 ELSE 0 END) as outCount,
        SUM(CASE WHEN DATE(transaction_date) = CURDATE() THEN 1 ELSE 0 END) as todayCount
      FROM manual_transactions`
    );

    ResponseHandler.success(
      res,
      {
        items: rows,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
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

    logger.info('=== 收到创建手工出入库请求 ===');
    logger.info('req.body:', JSON.stringify(req.body, null, 2));
    logger.info('req.user:', req.user);

    const { transaction_type: businessTypeCode, transaction_date, remark, items } = req.body;

    const operator = await getCurrentUserName(req);

    logger.info('解析后的字段:', {
      businessTypeCode,
      transaction_date,
      remark,
      items,
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
      return ResponseHandler.error(res, '缺少必填字段', 'VALIDATION_ERROR', 400);
    }

    // ===== 年度结存校验 =====
    const PeriodValidationService = require('../../../services/business/PeriodValidationService');
    const inventoryCheck =
      await PeriodValidationService.validateInventoryTransaction(transaction_date);
    if (!inventoryCheck.allowed) {
      await connection.rollback();
      return ResponseHandler.error(res, inventoryCheck.message, 'VALIDATION_ERROR', 400);
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
        return ResponseHandler.error(
          res,
          '该业务类型不支持手工出入库操作',
          'VALIDATION_ERROR',
          400
        );
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
        return ResponseHandler.error(res, '无效的业务类型', 'VALIDATION_ERROR', 400);
      }
    }

    logger.info('转换后的 transaction_type:', transaction_type);

    // 验证明细
    if (!items || !Array.isArray(items) || items.length === 0) {
      logger.error('明细数据为空:', { items });
      return ResponseHandler.error(res, '请至少添加一条物料明细', 'VALIDATION_ERROR', 400);
    }

    // 验证每条明细
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.material_id || !item.location_id || !item.quantity) {
        logger.error(`第${i + 1}条明细数据不完整:`, item);
        return ResponseHandler.error(res, `第${i + 1}条明细数据不完整`, 'VALIDATION_ERROR', 400);
      }
    }

    // 生成单据编号 (使用数据库锁防止并发重复)
    const prefix = transaction_type === 'in' ? 'MTIN' : 'MTOUT';
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
    const prefixWithDate = `${prefix}${dateStr}`;

    // 使用 FOR UPDATE 锁定查询，防止并发时产生重复编号
    const [maxNoResult] = await connection.execute(
      `SELECT MAX(transaction_no) as max_no
       FROM manual_transactions
       WHERE transaction_no LIKE ?
       FOR UPDATE`,
      [`${prefixWithDate}%`]
    );

    let sequenceNumber = 1;
    if (maxNoResult[0].max_no) {
      // 提取最后3位序号并加1
      const lastSeq = maxNoResult[0].max_no.slice(-3);
      sequenceNumber = parseInt(lastSeq) + 1;

      // 防止序号溢出（最大999）
      if (sequenceNumber > 999) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          '当天单据编号已达上限(999)，请联系管理员',
          'VALIDATION_ERROR',
          400
        );
      }
    }

    const transaction_no = `${prefixWithDate}${String(sequenceNumber).padStart(3, '0')}`;

    logger.info(
      `生成单据编号: ${transaction_no}, 当前最大编号: ${maxNoResult[0].max_no}, 下一个序号: ${sequenceNumber}`
    );

    // 批量预取物料信息（消除循环内 N+1 查询）

    // 处理每条明细
    for (const item of items) {
      const { material_id, location_id, quantity } = item;

      // 从批量预取结果获取物料信息


      // 插入手工出入库记录 - 默认状态为待审批
      await connection.execute(
        `INSERT INTO manual_transactions
          (transaction_no, transaction_type, business_type_code, transaction_date, material_id, location_id, quantity, remark, operator, approval_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
        [
          transaction_no,
          transaction_type,
          businessTypeCode,
          transaction_date,
          material_id,
          location_id,
          quantity,
          remark,
          operator,
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
  const { businessTypeCode, transaction_date, remark, items, operator } = params;

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

  // 验证每条明细
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.material_id || !item.location_id || !item.quantity) {
      throw new Error(`第${i + 1}条明细数据不完整`);
    }
  }

  // 生成单据编号 (使用数据库锁防止并发重复)
  const prefix = transaction_type === 'in' ? 'MTIN' : 'MTOUT';
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
  const prefixWithDate = `${prefix}${dateStr}`;

  // 使用 FOR UPDATE 锁定查询，防止并发时产生重复编号
  const [maxNoResult] = await connection.execute(
    `SELECT MAX(transaction_no) as max_no
     FROM manual_transactions
     WHERE transaction_no LIKE ?
     FOR UPDATE`,
    [`${prefixWithDate}%`]
  );

  let sequenceNumber = 1;
  if (maxNoResult[0].max_no) {
    const lastSeq = maxNoResult[0].max_no.slice(-3);
    sequenceNumber = parseInt(lastSeq) + 1;

    if (sequenceNumber > 999) {
      throw new Error('当天单据编号已达上限(999)，请联系管理员');
    }
  }

  const transaction_no = `${prefixWithDate}${String(sequenceNumber).padStart(3, '0')}`;

  logger.info(`生成单据编号: ${transaction_no}`);

  // 批量预取物料信息（消除循环内 N+1 查询）
  const approvalMaterialIds = items.map(i => i.material_id);
  const approvalMaterialInfoMap = await InventoryService.getBatchMaterialInfo(approvalMaterialIds, connection);

  // 处理每条明细
  for (const item of items) {
    const { material_id, location_id, quantity } = item;

    // 从批量预取结果获取物料信息
    const matInfo = approvalMaterialInfoMap.get(material_id);
    if (!matInfo) {
      throw new Error(`物料ID ${material_id} 不存在`);
    }

    // 插入手工出入库记录 - 默认状态为待审批
    await connection.execute(
      `INSERT INTO manual_transactions
        (transaction_no, transaction_type, business_type_code, transaction_date, material_id, location_id, quantity, remark, operator, approval_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
      [
        transaction_no,
        transaction_type,
        businessTypeCode,
        transaction_date,
        material_id,
        location_id,
        quantity,
        remark,
        operator,
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
      issue_material_id,
      issue_location_id,
      issue_quantity,
    } = req.body;

    const operator = await getCurrentUserName(req);

    // 验证必填字段
    if (
      !transaction_date ||
      !remark ||
      !return_material_id ||
      !return_location_id ||
      !return_quantity ||
      !issue_material_id ||
      !issue_location_id ||
      !issue_quantity
    ) {
      await connection.rollback();
      return ResponseHandler.error(res, '缺少必填字段', 'VALIDATION_ERROR', 400);
    }

    // 创建入库单（退回）
    const returnTransactionNo = await createManualTransactionInternal(connection, {
      businessTypeCode: 'in',
      transaction_date,
      remark: `调货-退回：${remark}`,
      items: [
        {
          material_id: return_material_id,
          location_id: return_location_id,
          quantity: return_quantity,
        },
      ],
      operator,
    });

    logger.info(`创建退回单成功: ${returnTransactionNo}`);

    // 创建出库单（补发）
    const issueTransactionNo = await createManualTransactionInternal(connection, {
      businessTypeCode: 'out',
      transaction_date,
      remark: `调货-补发：${remark}`,
      items: [
        {
          material_id: issue_material_id,
          location_id: issue_location_id,
          quantity: issue_quantity,
        },
      ],
      operator,
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
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { action, remark: approvalRemark } = req.body; // action: 'approve' 或 'reject'
    const approver = req.user?.name || req.user?.username || 'system';

    logger.info('=== 审批手工出入库 ===', { id, action, approver });

    // 验证action
    if (!['approve', 'reject'].includes(action)) {
      return ResponseHandler.error(res, '无效的审批操作', 'VALIDATION_ERROR', 400);
    }

    // 查询所有同单号的记录
    const [records] = await connection.execute('SELECT * FROM manual_transactions WHERE id = ?', [
      id,
    ]);

    if (records.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '记录不存在', 'NOT_FOUND', 404);
    }

    const record = records[0];

    // 检查是否已审批
    if (record.approval_status !== 'pending') {
      await connection.rollback();
      return ResponseHandler.error(res, '该单据已审批，不能重复操作', 'VALIDATION_ERROR', 400);
    }

    // 获取同一单号的所有记录
    const [allRecords] = await connection.execute(
      'SELECT * FROM manual_transactions WHERE transaction_no = ?',
      [record.transaction_no]
    );

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // 更新所有同单号记录的审批状态
    await connection.execute(
      `UPDATE manual_transactions
       SET approval_status = ?, approved_by = ?, approved_at = NOW(), approval_remark = ?
       WHERE transaction_no = ?`,
      [newStatus, approver, approvalRemark || '', record.transaction_no]
    );

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
          transaction_no,
          operator,
          remark,
        } = item;

        // 从批量预取结果获取物料信息
        const matInfo = approveMaterialInfoMap.get(material_id);
        const unit_id = matInfo.unitId;

        // 计算库存变化量
        const quantityChange =
          transaction_type === 'in' ? parseFloat(quantity) : -parseFloat(quantity);

        // 插入库存流水（出库时启用库存校验，不允许负库存）
        await _insertInventoryLedgerLocal(connection, {
          material_id,
          location_id,
          transaction_type:
            business_type_code || (transaction_type === 'in' ? 'manual_in' : 'manual_out'),
          quantity: quantityChange,
          unit_id,
          reference_no: transaction_no,
          reference_type: 'manual_transaction',
          operator: operator || approver,
          remark,
          checkStockSufficiency: transaction_type === 'out', // 出库时校验库存
          allowNegativeStock: false, // 不允许负库存
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

    const { id } = req.params;
    const {
      transaction_type: businessTypeCode,
      transaction_date,
      material_id,
      location_id,
      quantity,
      remark,
      operator,
    } = req.body;

    // 从业务类型编码中提取实际的 transaction_type (in/out)
    let transaction_type;
    if (businessTypeCode.includes('_in')) {
      transaction_type = 'in';
    } else if (businessTypeCode.includes('_out')) {
      transaction_type = 'out';
    } else {
      // 兼容直接传入 'in' 或 'out' 的情况
      transaction_type = businessTypeCode;
    }

    // 验证 transaction_type 是否有效
    if (transaction_type !== 'in' && transaction_type !== 'out') {
      return ResponseHandler.error(
        res,
        '无效的业务类型，必须是入库或出库类型',
        'VALIDATION_ERROR',
        400
      );
    }

    // 查询原记录
    const [oldRecord] = await connection.execute('SELECT * FROM manual_transactions WHERE id = ?', [
      id,
    ]);

    if (oldRecord.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '记录不存在', 'NOT_FOUND', 404);
    }

    const old = oldRecord[0];

    // 获取物料信息
    const [materialInfo] = await connection.execute('SELECT unit_id FROM materials WHERE id = ?', [
      material_id,
    ]);

    if (materialInfo.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '物料不存在', 'NOT_FOUND', 404);
    }

    const unit_id = materialInfo[0].unit_id;

    // 如果关键字段有变化，需要回滚原库存并重新计算
    if (
      old.material_id !== material_id ||
      old.location_id !== location_id ||
      old.quantity !== quantity ||
      old.transaction_type !== transaction_type
    ) {
      // 回滚原库存
      const oldQuantityChange =
        old.transaction_type === 'in' ? -parseFloat(old.quantity) : parseFloat(old.quantity);
      await _insertInventoryLedgerLocal(connection, {
        material_id: old.material_id,
        location_id: old.location_id,
        transaction_type: old.transaction_type === 'in' ? 'manual_in' : 'manual_out',
        quantity: oldQuantityChange,
        unit_id,
        reference_no: old.transaction_no,
        reference_type: 'manual_transaction',
        operator,
        remark: '修改手工出入库-回滚',
      });

      // 应用新库存
      const newQuantityChange =
        transaction_type === 'in' ? parseFloat(quantity) : -parseFloat(quantity);
      await _insertInventoryLedgerLocal(connection, {
        material_id,
        location_id,
        transaction_type: transaction_type === 'in' ? 'manual_in' : 'manual_out',
        quantity: newQuantityChange,
        unit_id,
        reference_no: old.transaction_no,
        reference_type: 'manual_transaction',
        operator,
        remark,
      });
    }

    // 更新记录
    await connection.execute(
      `UPDATE manual_transactions
       SET transaction_type = ?, business_type_code = ?, transaction_date = ?, material_id = ?, location_id = ?,
           quantity = ?, remark = ?, operator = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        transaction_type,
        businessTypeCode,
        transaction_date,
        material_id,
        location_id,
        quantity,
        remark,
        operator,
        id,
      ]
    );

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
      'SELECT * FROM manual_transactions WHERE transaction_no = ?',
      [transaction_no]
    );

    if (records.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '单据不存在', 'NOT_FOUND', 404);
    }

    const firstRecord = records[0];
    const approvalStatus = firstRecord.approval_status;

    // 检查审批状态
    if (approvalStatus === STATUS.APPROVAL.APPROVED) {
      // 已审批通过的单据，需要回滚库存
      logger.info(`删除已审批单据 ${transaction_no}，将回滚库存`);

      // 批量预取物料信息（消除循环内 N+1 查询）
      const deleteMaterialIds = records.map(r => r.material_id);
      const deleteMaterialInfoMap = await InventoryService.getBatchMaterialInfo(deleteMaterialIds, connection);

      for (const data of records) {
        // 从批量预取结果获取物料信息
        const matInfo = deleteMaterialInfoMap.get(data.material_id);
        const unit_id = matInfo ? matInfo.unitId : null;

        // 回滚库存
        const quantityChange =
          data.transaction_type === 'in' ? -parseFloat(data.quantity) : parseFloat(data.quantity);
        await _insertInventoryLedgerLocal(connection, {
          material_id: data.material_id,
          location_id: data.location_id,
          transaction_type: data.transaction_type === 'in' ? 'manual_in' : 'manual_out',
          quantity: quantityChange,
          unit_id,
          reference_no: data.transaction_no,
          reference_type: 'manual_transaction',
          operator: await getCurrentUserName(req),
          remark: '删除已审批单据-回滚库存',
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
