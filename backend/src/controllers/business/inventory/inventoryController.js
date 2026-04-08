/**
 * inventoryController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { CodeGenerators } = require('../../../utils/codeGenerator');
const { validateRequiredFields } = require('../../../utils/validationHelper');

const db = require('../../../config/db');
const { qualityApi } = require('../../../services/business/QualityService');
const InventoryService = require('../../../services/InventoryService');
const { ENABLE_TRACEABILITY, ENABLE_TRACEABILITY_CHAIN } = require('../../../config/features');
// const InventoryDeductionService = require('../../../services/business/InventoryDeductionService');
const AsyncTaskService = require('../../../services/business/AsyncTaskService');
const businessConfig = require('../../../config/businessConfig');
const BusinessTypeService = require('../../../services/BusinessTypeService');

// 统一库存查询子查询（基于 inventory_ledger 单表架构聚合计算当前库存）
const STOCK_SUBQUERY = `(SELECT material_id, location_id, COALESCE(SUM(quantity), 0) as quantity, MAX(created_at) as updated_at FROM inventory_ledger GROUP BY material_id, location_id)`;
const SIMPLE_STOCK_SUBQUERY = `(SELECT material_id, location_id, COALESCE(SUM(quantity), 0) as quantity, MAX(created_at) as updated_at FROM inventory_ledger GROUP BY material_id, location_id)`;

const {
  getInventoryTransactionTypeText,
  getTransferStatusText,
  getSalesStatusText,
  generateStatusCaseSQL,
  INVENTORY_TRANSACTION_TYPES,
  INVENTORY_TRANSACTION_GROUPS,
} = require('../../../constants/systemConstants');

// 引入库存一致性校验服务
const InventoryConsistencyService = require('../../../services/business/InventoryConsistencyService');

// 引入成本凭证服务（用于生成领料凭证）
const CostAccountingService = require('../../../services/business/CostAccountingService');

// 引入重构后的入库处理服务
const InboundTransactionService = require('../../../services/business/InboundTransactionService');

// 引入状态映射工具和状态常量
const { apiStatusToDbStatus, getStatusConstants } = require('../../../utils/statusMapper');
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
 * @param {string} defaultBatchNo - 默认批次号（如果查询失败）
 * @returns {Promise<string>} 批次号
 */
const getMaterialBatchNumber = async (
  connection,
  materialId,
  locationId = null,
  defaultBatchNo = 'default'
) => {
  try {
    // ✅ 单表架构：从 v_batch_stock 视图查询
    let query = `
      SELECT batch_number
      FROM v_batch_stock
      WHERE material_id = ?
        AND current_quantity > 0
    `;
    const params = [materialId];

    if (locationId) {
      query += ' AND location_id = ?';
      params.push(locationId);
    }

    query += ' ORDER BY receipt_date ASC LIMIT 1'; // FIFO: 先进先出

    const [stockBatchRecords] = await connection.execute(query, params);

    if (stockBatchRecords.length > 0 && stockBatchRecords[0].batch_number) {
      return stockBatchRecords[0].batch_number;
    }

    return defaultBatchNo;
  } catch (error) {
    logger.error('获取物料批次号失败:', error);
    return defaultBatchNo;
  }
};

// ========== 出入库类型常量（全局唯一定义，消除重复） ==========
const OUTBOUND_TYPES = [
  'outbound', 'outsourced_outbound', 'production_outbound',
  'sales_outbound', 'sale', 'manual_out', 'transfer_out', 'adjustment_out',
];
const INBOUND_TYPES = [
  'inbound', 'outsourced_inbound', 'purchase_inbound', 'production_inbound',
  'production_return', 'sales_return', 'manual_in', 'transfer_in',
  'adjustment_in', 'inventory_init',
];

// 添加一个辅助函数来处理inventory_ledger插入
const _insertInventoryLedgerLocal = async (
  connection,
  {
    material_id,
    location_id,
    transaction_type,
    quantity,
    unit_id,
    batch_number = null, // 🔥 新增批次号参数
    reference_no,
    reference_type,
    operator,
    remark = null,
    beforeQuantity = null,
    afterQuantity = null,
    checkStockSufficiency = false, // 是否校验库存充足性
    allowNegativeStock = true, // 是否允许负库存（某些业务场景需要）
    issue_reason = null,
    is_excess = 0,
    bom_required_qty = null,
    total_issued_qty = null,
  }
) => {
  try {
    const params = {
      materialId: material_id,
      locationId: location_id,
      quantity,
      transactionType: transaction_type,
      referenceNo: reference_no || 'SYSTEM',
      referenceType: reference_type || 'SYSTEM',
      operator: operator || 'system',
      remark: remark || '',
      unitId: unit_id,
      batchNumber: batch_number,
      issue_reason,
      is_excess,
      bom_required_qty,
      total_issued_qty,
      allowNegativeStock,
    };

    return await InventoryService.updateStock(params, connection);
  } catch (error) {
    logger.error('插入库存事务记录失败:', error);
    throw error;
  }
};

// 获取库存列表 - 单表架构版本(支持排序和高级筛选)
const getStockList = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      location_id = '',
      category_id = '',
      stock_status = '', // 库存状态: normal(正常), low(低库存), zero(零库存)
      min_quantity = '', // 最小库存数量
      max_quantity = '', // 最大库存数量
      start_date = '', // 更新时间开始
      end_date = '', // 更新时间结束
      sort_field = 'updated_at', // 排序字段
      sort_order = 'DESC', // 排序方向: ASC, DESC
    } = req.query;
    const offset = (page - 1) * limit;

    // 构建WHERE条件
    const whereConditions = [];
    const queryParams = [];

    if (search && search.trim()) {
      whereConditions.push('(m.code LIKE ? OR m.name LIKE ? OR m.specs LIKE ?)');
      queryParams.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
    }

    if (location_id && location_id !== '') {
      whereConditions.push('current_stock.location_id = ?');
      queryParams.push(location_id);
    }

    if (category_id && category_id !== '') {
      whereConditions.push('m.category_id = ?');
      queryParams.push(category_id);
    }

    // 库存数量范围筛选
    if (min_quantity && min_quantity !== '') {
      whereConditions.push('current_stock.quantity >= ?');
      queryParams.push(parseFloat(min_quantity));
    }

    if (max_quantity && max_quantity !== '') {
      whereConditions.push('current_stock.quantity <= ?');
      queryParams.push(parseFloat(max_quantity));
    }

    // 更新时间范围筛选
    if (start_date && start_date !== '') {
      whereConditions.push('current_stock.last_updated >= ?');
      queryParams.push(start_date);
    }

    if (end_date && end_date !== '') {
      whereConditions.push('current_stock.last_updated <= ?');
      queryParams.push(end_date + ' 23:59:59');
    }

    // 库存状态筛选
    if (stock_status && stock_status !== '') {
      // 允许查询零库存，如果是查询非零库存，子查询已经过滤了 <= 0 的情况
      // 但为了支持 'zero' 状态，我们需要调整子查询逻辑，或者在这里处理
      // 注意：当前子查询 `HAVING SUM(quantity) > 0` 已经排除了零库存
      // 如果要支持零库存，子查询条件必须放宽，或者我们需要更改架构
      // 鉴于现有架构，我们假设 'zero' 是指 "当前显示的项目中库存为0的" (虽然子查询过滤了)
      // 或者我们需要修改子查询。

      // 更好的做法：根据 stock_status 动态构建 WHERE 条件

      if (stock_status === 'zero') {
        // 零库存: 数量为0
        whereConditions.push('current_stock.quantity = 0');
      } else if (stock_status === 'low') {
        // 低库存: (0 < 数量 <= 最低库存) 且 最低库存 > 0
        whereConditions.push('current_stock.quantity > 0');
        whereConditions.push('current_stock.quantity <= IFNULL(m.min_stock, 0)');
        whereConditions.push('IFNULL(m.min_stock, 0) > 0');
      } else if (stock_status === 'normal') {
        // 正常: 数量 > 最低库存 或 最低库存为0
        whereConditions.push(
          '(current_stock.quantity > IFNULL(m.min_stock, 0) OR IFNULL(m.min_stock, 0) = 0)'
        );
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // 构建排序子句
    const allowedSortFields = {
      material_code: 'm.code',
      material_name: 'm.name',
      quantity: 'current_stock.quantity',
      updated_at: 'current_stock.last_updated',
      location_name: 'l.name',
      category_name: 'c.name',
    };
    const sortColumn = allowedSortFields[sort_field] || 'current_stock.last_updated';
    const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const orderByClause = `ORDER BY ${sortColumn} ${sortDirection}`;

    // 动态调整子查询的 HAVING 条件
    // 当用户主动搜索或筛选时，不隐藏负库存（用户需要能找到负库存的物料来处理异常）
    // 仅在默认无筛选的列表首页隐藏零/负库存
    const hasActiveFilter = (search && search.trim()) ||
      (location_id && location_id !== '') ||
      (min_quantity !== '' && min_quantity !== undefined) ||
      (max_quantity !== '' && max_quantity !== undefined);
    let subqueryHaving = hasActiveFilter ? '' : 'HAVING SUM(quantity) > 0';

    if (stock_status === 'zero') {
      subqueryHaving = 'HAVING SUM(quantity) = 0';
    } else if (stock_status === 'negative') {
      subqueryHaving = 'HAVING SUM(quantity) < 0';
    }

    // 使用SUM(quantity)计算库存
    const listQuery = `
      SELECT
        CONCAT(current_stock.material_id, '_', current_stock.location_id) as id,
        current_stock.material_id as material_id,
        m.name as material_name,
        m.code as material_code,
        m.specs as specification,
        u.name as unit_name,
        c.name as category_name,
        current_stock.location_id as location_id,
        l.name as location_name,
        current_stock.quantity as quantity,
        IFNULL(m.price, 0) as unit_price,
        current_stock.quantity * IFNULL(m.price, 0) as total_amount,
        current_stock.last_updated as updated_at,
        IFNULL(m.min_stock, 0) as min_stock,
        IFNULL(m.max_stock, 0) as max_stock
      FROM (
        SELECT material_id, location_id, SUM(quantity) as quantity, MAX(created_at) as last_updated
        FROM inventory_ledger
        GROUP BY material_id, location_id
        ${subqueryHaving}
      ) current_stock
      LEFT JOIN materials m ON current_stock.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN locations l ON current_stock.location_id = l.id
      ${whereClause}
      ${orderByClause}
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM (
        SELECT material_id, location_id, SUM(quantity) as quantity, MAX(created_at) as last_updated
        FROM inventory_ledger
        GROUP BY material_id, location_id
        ${subqueryHaving}
      ) current_stock
      LEFT JOIN materials m ON current_stock.material_id = m.id
      LEFT JOIN categories c ON m.category_id = c.id
      ${whereClause}
    `;

    const [countResult] = await db.pool.execute(countQuery, queryParams);
    const total = countResult[0].total;

    // 执行查询
    const [stocks] = await db.pool.execute(listQuery, queryParams);

    // 移除之前的内存过滤逻辑

    // 统一使用下划线命名,符合数据库规范
    ResponseHandler.paginated(
      res,
      stocks,
      total,
      parseInt(page),
      parseInt(limit),
      '获取库存列表成功'
    );
  } catch (error) {
    logger.error('获取库存列表失败:', error);
    ResponseHandler.error(res, '获取库存列表失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取出库单列表
const getOutboundList = async (req, res) => {
  try {
    // 确保参数为数字类型
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const {
      search = '',
      status = '',
      production_plan_id = '',
      production_group_id = '',
      startDate = '',
      endDate = '',
    } = req.query;

    // 构建搜索条件 - 只搜索出库单号和产品信息（不搜索物料明细）
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      // 只搜索出库单号、产品编码、产品名称、产品型号规格
      // 不搜索物料明细，避免返回不相关的出库单
      whereClause += ` AND o.id IN (
        SELECT DISTINCT o2.id
        FROM inventory_outbound o2
        LEFT JOIN production_tasks pt2 ON o2.reference_type = 'production_task' AND o2.reference_id = pt2.id
        LEFT JOIN materials p2 ON pt2.product_id = p2.id
        WHERE o2.outbound_no LIKE ?
           OR p2.name LIKE ?
           OR p2.code LIKE ?
           OR p2.specs LIKE ?
      )`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status && status !== '') {
      whereClause += ' AND o.status = ?';
      params.push(status);
    }

    if (production_plan_id && production_plan_id !== '') {
      whereClause += ' AND o.reference_id = ? AND o.reference_type = "production_plan"';
      params.push(production_plan_id);
    }

    if (production_group_id && production_group_id !== '') {
      whereClause += ' AND p.production_group_id = ?';
      params.push(production_group_id);
    }

    // 添加时间范围筛选
    if (startDate && startDate !== '') {
      whereClause += ' AND o.outbound_date >= ?';
      params.push(startDate);
    }

    if (endDate && endDate !== '') {
      whereClause += ' AND o.outbound_date <= ?';
      params.push(endDate);
    }

    // 获取出库单主表数据（包含操作人信息和生产组信息）
    const listQuery = `
      SELECT
        o.id,
        o.outbound_no,
        DATE_FORMAT(o.outbound_date, '%Y-%m-%d') as outbound_date,
        GROUP_CONCAT(DISTINCT l.name) as location_names,
        GROUP_CONCAT(DISTINCT CASE WHEN pg.name IS NOT NULL THEN pg.name END) as production_group_names,
        p.code as product_code,
        p.specs as product_specs,
        pt.quantity as product_quantity,
        o.status,
        o.operator,
        CASE
          WHEN o.operator = 'system' THEN '系统'
          ELSE COALESCE(
            (SELECT u.real_name FROM users u WHERE u.username = o.operator LIMIT 1),
            (SELECT u.username FROM users u WHERE u.username = o.operator LIMIT 1),
            o.operator
          )
        END as operator_name,
        o.remark,
        o.created_at,
        DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') as created_at_formatted,
        DATE_FORMAT(o.updated_at, '%Y-%m-%d %H:%i:%s') as updated_at,
        COUNT(DISTINCT oi.id) as items_count,
        COALESCE(SUM(oi.quantity), 0) as total_quantity,
        CASE WHEN COUNT(DISTINCT mu.id) = 1 THEN MAX(mu.name) ELSE NULL END as item_unit_name,
        o.outbound_type,
        o.reference_id,
        o.reference_type
      FROM inventory_outbound o
      LEFT JOIN inventory_outbound_items oi ON o.id = oi.outbound_id
      LEFT JOIN materials m ON oi.material_id = m.id
      LEFT JOIN units mu ON m.unit_id = mu.id
      LEFT JOIN locations l ON m.location_id = l.id
      LEFT JOIN production_tasks pt ON pt.id = COALESCE(o.production_task_id, CASE WHEN o.reference_type = 'production_task' THEN o.reference_id ELSE NULL END)
      LEFT JOIN materials p ON pt.product_id = p.id
      LEFT JOIN departments pg ON p.production_group_id = pg.id AND pg.status = 1
      ${whereClause}
      GROUP BY o.id, o.outbound_no, o.outbound_date, o.status, o.operator, o.remark, o.created_at, o.updated_at, o.reference_id, o.reference_type, p.code, p.specs, pt.quantity, pg.name
      ORDER BY o.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    // 使用参数，但不包括 LIMIT 和 OFFSET 部分
    const [outbounds] = await db.pool.execute(listQuery, params);

    // 获取总数 - 需要包含生产组筛选所需的JOIN
    const countQuery = `
      SELECT COUNT(DISTINCT o.id) as total
      FROM inventory_outbound o
      LEFT JOIN inventory_outbound_items oi ON o.id = oi.outbound_id
      LEFT JOIN materials m ON oi.material_id = m.id
      LEFT JOIN production_tasks pt ON pt.id = COALESCE(o.production_task_id, CASE WHEN o.reference_type = 'production_task' THEN o.reference_id ELSE NULL END)
      LEFT JOIN materials p ON pt.product_id = p.id
      ${whereClause}
    `;

    const [countResult] = await db.pool.execute(countQuery, params);
    const total = countResult[0].total;

    // 处理状态显示和日期格式
    const items = outbounds.map((item) => ({
      ...item,
      created_at: item.created_at_formatted, // 使用格式化后的时间
      status_text: getStatusText(item.status),
    }));

    ResponseHandler.paginated(res, items, total, page, limit, '获取出库单列表成功');
  } catch (error) {
    logger.error('获取出库单列表失败:', error);
    ResponseHandler.error(res, '获取出库单列表失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取状态文本（支持出库单状态和生产状态）
const getStatusText = (status) => {
  const { getStatusLabel } = require('../../../utils/statusMapper');

  // 尝试从statusMapper获取状态标签
  const label = getStatusLabel(status);
  if (label) {
    return label;
  }

  // 兜底使用销售状态映射
  return getSalesStatusText(status);
};

// 获取库存记录
const getStockRecords = async (req, res) => {
  try {
    const { id } = req.params;
    let materialId, locationId;

    // 判断ID是否为复合ID（material_id_location_id格式）
    if (id.includes('_')) {
      // 如果是复合ID，分解出物料ID和仓库ID
      const [matId, locId] = id.split('_');
      materialId = matId;
      locationId = locId;

      // 验证物料和仓库是否存在
      const checkMaterialQuery = 'SELECT id, location_id FROM materials WHERE id = ?';
      const [materialResult] = await db.pool.execute(checkMaterialQuery, [materialId]);

      if (materialResult.length === 0) {
        return ResponseHandler.error(res, '物料不存在', 'NOT_FOUND', 404);
      }

      // 如果获取的location_id与物料表中的默认位置不符，使用物料的默认位置
      if (String(materialResult[0].location_id) !== String(locationId)) {
        locationId = materialResult[0].location_id;
      }

      const checkLocationQuery = 'SELECT id FROM locations WHERE id = ?';
      const [locationResult] = await db.pool.execute(checkLocationQuery, [locationId]);

      if (locationResult.length === 0) {
        return ResponseHandler.error(res, '仓库不存在', 'NOT_FOUND', 404);
      }
    } else {
      // 在新架构中，直接使用物料ID
      // 检查是否为物料ID
      const checkMaterialQuery = `
        SELECT id, location_id FROM materials WHERE id = ?
      `;
      const [checkMaterialResult] = await db.pool.execute(checkMaterialQuery, [id]);

      if (checkMaterialResult.length > 0) {
        // 是物料ID
        materialId = id;
        locationId = checkMaterialResult[0].location_id;
      } else {
        return ResponseHandler.error(res, '库存记录或物料不存在', 'NOT_FOUND', 404);
      }
    }

    // 构建查询条件
    let whereClause = 'WHERE t.material_id = ?';
    const queryParams = [materialId];

    // 如果有仓库ID，增加仓库筛选条件
    if (locationId) {
      whereClause += ' AND t.location_id = ?';
      queryParams.push(locationId);
    }

    // 获取库存交易记录
    const recordsQuery = `
      SELECT 
        t.id,
        t.transaction_type,
        DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') as date,
        ${generateStatusCaseSQL('t.transaction_type', INVENTORY_TRANSACTION_TYPES, 'type')},
        t.quantity,
        t.reference_no,
        t.reference_type,
        CASE
          WHEN t.operator = 'system' THEN '系统'
          ELSE COALESCE(
            (SELECT u.real_name FROM users u WHERE u.username = t.operator LIMIT 1),
            (SELECT u.username FROM users u WHERE u.username = t.operator LIMIT 1),
            t.operator
          )
        END as operator,
        t.remark
      FROM inventory_ledger t
      ${whereClause}
      ORDER BY t.created_at ASC
    `;

    const [records] = await db.pool.execute(recordsQuery, queryParams);

    // 手动计算变动前后数量 - 正向计算，从开始累加
    let runningTotal = 0; // 起始库存为0

    for (const record of records) {
      // 设置变动前数量为当前累计值
      record.before_quantity = runningTotal;

      // 根据交易类型调整runningTotal
      // 使用系统常量判断库存增减，避免硬编码中文
      if (INVENTORY_TRANSACTION_GROUPS.INCREASE.includes(record.transaction_type)) {
        runningTotal += parseFloat(record.quantity);
      } else if (INVENTORY_TRANSACTION_GROUPS.DECREASE.includes(record.transaction_type)) {
        // 出库类型：减去绝对值
        runningTotal -= Math.abs(parseFloat(record.quantity));
      } else if (
        record.transaction_type === 'check' ||
        record.transaction_type === 'adjust' ||
        record.transaction_type === 'adjustment' ||
        record.transaction_type === 'manual_adjustment'
      ) {
        // 调整可能是正数或负数，直接累加
        runningTotal += parseFloat(record.quantity);
      } else {
        // 其他情况，根据数值正负累加
        runningTotal += parseFloat(record.quantity);
      }

      // 设置变动后数量
      record.after_quantity = runningTotal;
    }

    // 返回记录
    ResponseHandler.success(res, records, '获取库存记录成功');
  } catch (error) {
    logger.error('获取库存记录失败:', error);
    ResponseHandler.error(res, '获取库存记录失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取仓库列表
const getLocations = async (req, res) => {
  try {
    const query = `
      SELECT
        id,
        name,
        code
      FROM locations
      ORDER BY name
    `;

    const [locations] = await db.pool.execute(query);

    // 返回符合前端期望的格式
    ResponseHandler.paginated(
      res,
      locations,
      locations.length,
      1,
      locations.length,
      '获取库位列表成功'
    );
  } catch (error) {
    logger.error('获取仓库列表失败:', error);
    ResponseHandler.error(res, '获取仓库列表失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取出库单详情
const getOutboundDetail = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction(); // 添加事务，确保INSERT操作能正确提交
    const { id } = req.params;

    // 获取出库单主表信息 - 添加用户表和生产任务表关联查询
    const [outboundResult] = await connection.execute(
      `
      SELECT
        o.*,
        COALESCE(
          (SELECT u.real_name FROM users u WHERE u.username = o.operator LIMIT 1),
          o.operator
        ) as operator_name,
        pt.code as production_task_code,
        pt.quantity as production_task_quantity,
        m.name as production_task_product_name,
        DATE_FORMAT(o.outbound_date, '%Y-%m-%d') as outbound_date,
        DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') as created_at,
        DATE_FORMAT(o.updated_at, '%Y-%m-%d %H:%i:%s') as updated_at
      FROM inventory_outbound o
      LEFT JOIN production_tasks pt ON (o.reference_type = 'production_task' AND o.reference_id = pt.id)
      LEFT JOIN materials m ON pt.product_id = m.id
      WHERE o.id = ?
    `,
      [id]
    );

    if (outboundResult.length === 0) {
      return ResponseHandler.error(res, '出库单不存在', 'NOT_FOUND', 404);
    }

    // 获取出库单明细（原始需求）
    const [itemsResult] = await connection.execute(
      `
      SELECT
        oi.*,
        m.code as material_code,
        m.name as material_name,
        m.specs as specification,
        u.name as unit_name,
        m.location_id,
        l.name as location_name,
        COALESCE(s.quantity, 0) as stock_quantity
      FROM inventory_outbound_items oi
      LEFT JOIN materials m ON oi.material_id = m.id
      LEFT JOIN units u ON oi.unit_id = u.id
      LEFT JOIN locations l ON m.location_id = l.id
      LEFT JOIN ${STOCK_SUBQUERY} s ON m.id = s.material_id AND s.location_id = m.location_id
      WHERE oi.outbound_id = ?
    `,
      [id]
    );

    // 获取实际出库记录（包括替代物料）
    const [actualOutboundResult] = await connection.execute(
      `
      SELECT
        il.material_id,
        ABS(il.quantity) as actual_quantity,
        m.code as material_code,
        m.name as material_name,
        m.specs as specification,
        u.name as unit_name,
        il.location_id,
        l.name as location_name,
        il.remark,
        COALESCE(s.quantity, 0) as current_stock_quantity
      FROM inventory_ledger il
      LEFT JOIN materials m ON il.material_id = m.id
      LEFT JOIN units u ON il.unit_id = u.id
      LEFT JOIN locations l ON il.location_id = l.id
      LEFT JOIN ${SIMPLE_STOCK_SUBQUERY} s ON m.id = s.material_id AND s.location_id = il.location_id
      WHERE il.reference_no = ? AND il.transaction_type = 'outbound' AND il.quantity < 0
      ORDER BY il.created_at
    `,
      [outboundResult[0].outbound_no]
    );

    // 如果是生产出库单且明细为空且状态为draft（撤销后的情况），从BOM重新获取并保存
    // 注意：只有draft状态才从BOM获取，completed状态的出库单应该显示实际出库的物料
    let finalItemsResult = itemsResult;
    const outbound = outboundResult[0];

    if (
      itemsResult.length === 0 &&
      outbound.status === STATUS.OUTBOUND.DRAFT &&
      (outbound.reference_type === 'production_task' ||
        outbound.reference_type === 'production_plan') &&
      outbound.reference_id
    ) {
      logger.info(
        `出库单 ${id} (状态:${STATUS.OUTBOUND.DRAFT}) 明细为空，准备从BOM重新获取并保存...`
      );

      // 使用辅助函数从BOM获取并保存物料明细
      const bomResult = await fetchBomItemsForOutbound(
        connection,
        id,
        outbound.reference_type,
        outbound.reference_id
      );

      if (bomResult.success && bomResult.itemCount > 0) {
        // 重新查询已保存的明细（带完整信息）
        const [savedItems] = await connection.execute(
          `
          SELECT
            ioi.id, ioi.outbound_id, ioi.material_id, ioi.quantity,
            ioi.planned_quantity, ioi.actual_quantity, ioi.unit_id,
            m.code as material_code, m.name as material_name,
            m.specs as specification, u.name as unit_name,
            m.location_id, l.name as location_name,
            COALESCE(s.quantity, 0) as stock_quantity
          FROM inventory_outbound_items ioi
          JOIN materials m ON ioi.material_id = m.id
          LEFT JOIN units u ON m.unit_id = u.id
          LEFT JOIN locations l ON m.location_id = l.id
          LEFT JOIN ${SIMPLE_STOCK_SUBQUERY} s
            ON m.id = s.material_id AND s.location_id = m.location_id
          WHERE ioi.outbound_id = ?
        `,
          [id]
        );

        finalItemsResult = savedItems;
      } else if (!bomResult.success) {
        logger.warn(`出库单 ${id} 从BOM获取物料失败: ${bomResult.error}`);
      }
    }

    // 处理每个物料项，确保stock_quantity是数值
    const processedItems = finalItemsResult.map((item) => ({
      ...item,
      stock_quantity:
        item.stock_quantity !== null && item.stock_quantity !== undefined
          ? parseFloat(item.stock_quantity)
          : 0,
    }));

    // 重构完整的出库信息（包括替代物料）
    const enhancedItems = processedItems.map((originalItem) => {
      // 查找该物料的实际出库记录
      const _actualRecords = actualOutboundResult.filter(
        (record) => record.material_id === originalItem.material_id
      );

      // 查找替代物料出库记录（通过remark识别）
      const substituteRecords = actualOutboundResult.filter(
        (record) => record.remark && record.remark.includes(`替代物料 ${originalItem.material_id}`)
      );

      const enhancedItem = { ...originalItem };

      // 如果有替代物料出库，添加替代物料信息
      if (substituteRecords.length > 0) {
        enhancedItem.substitutionInfo = {
          substituteMaterials: substituteRecords.map((sub) => ({
            materialId: sub.material_id,
            code: sub.material_code,
            name: sub.material_name,
            specification: sub.specification || '',
            unit: sub.unit_name || '件',
            stockQuantity: sub.current_stock_quantity,
            requiredQuantity: 1, // BOM基础数量，这里简化为1
            actualOutboundQuantity: sub.actual_quantity,
          })),
        };
      }

      return enhancedItem;
    });

    // 从明细项中获取location_id和location_name (如果有多个，使用第一个)
    let locationId = null;
    let locationName = null;

    if (enhancedItems.length > 0) {
      locationId = enhancedItems[0].location_id;
      locationName = enhancedItems[0].location_name;
    }

    // 处理生产任务ID
    const productionTaskId =
      outboundResult[0].reference_type === 'production_task'
        ? outboundResult[0].reference_id
        : null;

    const outboundDetail = {
      ...outboundResult[0],
      items: enhancedItems, // 使用包含替代物料信息的增强数据
      location_id: locationId, // 使用从明细项中获取的location_id
      location_name: locationName, // 使用从明细项中获取的location_name
      production_task_id: productionTaskId, // 如果关联的是生产任务，返回任务ID
      production_task_code: outboundResult[0].production_task_code || null, // 生产任务编号
      production_task_product_name: outboundResult[0].production_task_product_name || null, // 生产任务产品名称
      production_task_quantity: outboundResult[0].production_task_quantity || null, // 生产任务数量
      production_plan_id: null, // 由于数据库表中没有production_plan_id字段，设置默认值为null
      production_plan_code: null, // 由于数据库表中没有production_plan_id字段，无法获取计划代码
      production_plan_name: null, // 由于数据库表中没有production_plan_id字段，无法获取计划名称
    };

    await connection.commit(); // 提交事务
    ResponseHandler.success(res, outboundDetail, '获取出库单详情成功');
  } catch (error) {
    await connection.rollback(); // 回滚事务
    logger.error('获取出库单详情失败:', error);
    ResponseHandler.error(res, '获取出库单详情失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 更新出库单
const updateOutbound = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { outbound_date, status, operator, remark = null, items } = req.body;

    logger.info('更新主表参数:', [outbound_date, status, operator, remark, id]);

    // 验证必填字段 - 移除对location_id和production_plan_id的要求
    if (!outbound_date || !status || !operator) {
      throw new Error('缺少必填字段: 出库日期、状态或操作员');
    }

    // 检查出库单是否存在
    const [checkResult] = await connection.execute(
      'SELECT status FROM inventory_outbound WHERE id = ?',
      [id]
    );

    if (checkResult.length === 0) {
      return ResponseHandler.error(res, '出库单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = checkResult[0].status;

    // 只要出库单还没有完成(completed),就允许更新
    if (currentStatus === STATUS.OUTBOUND.COMPLETED) {
      return ResponseHandler.error(res, '已完成的出库单不能修改', 'BAD_REQUEST', 400);
    }

    // 格式化日期
    const formattedDate = new Date(outbound_date).toISOString().split('T')[0];

    // 更新出库单主表 - 移除对production_plan_id的引用
    await connection.execute(
      'UPDATE inventory_outbound SET outbound_date = ?, status = ?, operator = ?, remark = ?, updated_at = NOW() WHERE id = ?',
      [formattedDate, status, operator, remark, id]
    );

    // 只要出库单还没有完成,就允许更新物料明细
    if (currentStatus !== 'completed' && items && items.length > 0) {
      // 删除原有明细
      await connection.execute('DELETE FROM inventory_outbound_items WHERE outbound_id = ?', [id]);

      // 批量预取物料信息（消除循环内 N+1 查询）
      const itemMaterialIds = items.map(i => i.material_id);
      const itemMaterialInfoMap = await InventoryService.getBatchMaterialInfo(itemMaterialIds, connection);

      // 重新插入明细
      for (const item of items) {
        if (!item.material_id || !item.quantity || item.quantity <= 0) {
          throw new Error('物料信息不完整或数量无效');
        }

        const matInfo = itemMaterialInfoMap.get(item.material_id);

        // 如果没有提供单位，使用物料的默认单位
        const unitId = item.unit_id || matInfo.unitId;

        // 直接使用物料表中的location_id
        const locationId = matInfo.locationId;

        if (!locationId) {
          throw new Error(`物料 ${item.material_id} 未配置默认仓库，请在【物料管理】中设置存放仓库后再操作`);
        }

        await connection.execute(
          'INSERT INTO inventory_outbound_items (outbound_id, material_id, quantity, unit_id, remark) VALUES (?, ?, ?, ?, ?)',
          [id, item.material_id, item.quantity, unitId, item.remark]
        );
      }
    } else {
      // 检查现有明细条数
      const [_itemsCount] = await connection.execute(
        'SELECT COUNT(*) AS count FROM inventory_outbound_items WHERE outbound_id = ?',
        [id]
      );
    }

    // 提前读取出库单关联信息，供 confirmed 和 completed 两种状态逻辑共用
    const [outboundBasicInfo] = await connection.execute(
      'SELECT reference_id, reference_type, production_task_id FROM inventory_outbound WHERE id = ?',
      [id]
    );
    let earlyReferenceId = outboundBasicInfo[0]?.reference_id || null;
    let earlyReferenceType = outboundBasicInfo[0]?.reference_type || null;
    const earlyProductionTaskId = outboundBasicInfo[0]?.production_task_id || null;
    if (!earlyReferenceId && earlyProductionTaskId) {
      earlyReferenceId = earlyProductionTaskId;
      earlyReferenceType = 'production_task';
    }

    // 如果状态为已完成，更新库存
    if (status === STATUS.OUTBOUND.COMPLETED) {
      // 获取出库单明细
      const [items] = await connection.execute(
        'SELECT material_id, quantity, planned_quantity, actual_quantity, shortage_quantity, unit_id FROM inventory_outbound_items WHERE outbound_id = ?',
        [id]
      );

      // 获取出库单信息（完整信息，用于后续追溯等）
      const [outboundInfo] = await connection.execute(
        'SELECT outbound_no, operator, reference_id, reference_type, production_task_id, issue_reason, is_excess FROM inventory_outbound WHERE id = ?',
        [id]
      );

      if (!outboundInfo || outboundInfo.length === 0) {
        throw new Error(`无法获取出库单信息: ${id}`);
      }

      const outboundRecord = outboundInfo[0];
      let referenceId = outboundRecord.reference_id;
      let referenceType = outboundRecord.reference_type;
      const productionTaskId = outboundRecord.production_task_id;

      // 如果referenceId为空但有productionTaskId，补充设置
      if (!referenceId && productionTaskId) {
        referenceId = productionTaskId;
        referenceType = 'production_task';
      }

      // 判断是否是生产出库
      const isProductionOutbound =
        referenceType === 'production_task' || referenceType === 'production_plan';

      // 批量预取完成出库时所需的物料库位信息（消除循环内 N+1 查询）
      const completedMaterialIds = items.map(i => i.material_id);
      let completedMaterialInfoMap;
      try {
        completedMaterialInfoMap = await InventoryService.getBatchMaterialInfo(completedMaterialIds, connection);
      } catch (e) {
        // getBatchMaterialInfo 会对未配置仓库的物料抛错，这里降级为空 Map
        logger.warn('完成出库时批量获取物料信息失败（可能有物料未配置仓库）:', e.message);
        completedMaterialInfoMap = new Map();
      }

      // 处理每个物料项
      for (const item of items) {
        try {
          // 从批量预取结果获取物料的默认库位
          const matInfo = completedMaterialInfoMap.get(item.material_id);
          const locationId = matInfo?.locationId || null; // 从物料表取真实默认库位，如果没有不能强行转1

          // ========== 部分发料支持: 使用actual_quantity扣减库存 ==========
          const actualQuantity = parseFloat(item.actual_quantity ?? item.quantity) || 0; // Fallback to quantity if actual is missing

          if (actualQuantity > 0) {
            if (isProductionOutbound) {
              // 使用智能出库逻辑
              await smartOutboundStock(
                item.material_id,
                locationId,
                actualQuantity,
                outboundRecord.operator,
                `出库单号: ${outboundRecord.outbound_no}`,
                referenceId,
                connection,
                {
                  issueReason: outboundRecord.issue_reason,
                  isExcess: outboundRecord.is_excess,
                  batchNumber: item.batch_number || item.batchNumber
                }
              );
            } else {
              // 普通出库逻辑：由于单仓架构废弃了旧库位校验规则，且不再存在“智能寻仓”，强制使用物料的默认存放仓库 (或业务指派) 出库。
              // 若未指定仓库且物料也未配置默认仓库，拒绝出库以防库存错乱。
              if (!locationId) {
                throw new Error(`物料 ${item.material_id} 未配置默认仓库，不支持普通出库。请维护物料基础资料，或启用智能全仓发料。`);
              }

              const [stockRecords] = await connection.execute(
                'SELECT material_id, location_id, SUM(il.quantity) as quantity FROM inventory_ledger il JOIN materials mat ON il.material_id = mat.id WHERE il.material_id = ? AND il.location_id = ? AND (mat.location_id IS NULL OR il.location_id = mat.location_id) GROUP BY material_id, location_id',
                [item.material_id, locationId]
              );

              if (stockRecords.length === 0) {
                await _insertInventoryLedgerLocal(connection, {
                  material_id: item.material_id,
                  location_id: locationId,
                  transaction_type: 'production_outbound',
                  quantity: -actualQuantity,
                  unit_id: item.unit_id,
                  reference_no: outboundRecord.outbound_no,
                  reference_type: 'outbound',
                  operator: outboundRecord.operator,
                  beforeQuantity: 0,
                  afterQuantity: -actualQuantity,
                  issue_reason: outboundRecord.issue_reason,
                  is_excess: outboundRecord.is_excess,
                });
                continue;
              }

              const stockRecord = stockRecords[0];
              const beforeQuantity = parseFloat(stockRecord.quantity);
              const afterQuantity = beforeQuantity - actualQuantity;

              await connection.execute('UPDATE inventory_ledger SET quantity = ? WHERE id = ?', [
                afterQuantity,
                stockRecord.id,
              ]);

              await _insertInventoryLedgerLocal(connection, {
                material_id: item.material_id,
                location_id: stockRecord.location_id,
                transaction_type: 'production_outbound',
                quantity: -actualQuantity,
                unit_id: item.unit_id,
                reference_no: outboundRecord.outbound_no,
                reference_type: 'outbound',
                operator: outboundRecord.operator,
                beforeQuantity: beforeQuantity,
                afterQuantity: afterQuantity,
                issue_reason: outboundRecord.issue_reason,
                is_excess: outboundRecord.is_excess,
                batch_number: item.batch_number || item.batchNumber
              });
            }
          }

          // 创建追溯记录 (复制自 updateOutboundStatus)
        } catch (itemError) {
          logger.error(`处理物料 ${item.material_id} 时出错:`, itemError);
        }
      }

      // 统一联动更新生产任务/计划状态（出库完成）
      if (referenceId && referenceType === 'production_task') {
        await _syncProductionStatus(connection, 'completed', referenceId);
      }
    }

    // 出库单确认（confirmed）→ 统一联动更新生产任务/计划状态
    if (status === STATUS.OUTBOUND.CONFIRMED && earlyReferenceType === 'production_task' && earlyReferenceId) {
      await _syncProductionStatus(connection, 'confirmed', earlyReferenceId);
    }

    await connection.commit();
    ResponseHandler.success(res, { id }, '出库单更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新出库单失败:', error);
    ResponseHandler.error(res, '更新出库单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 内部方法：创建出库单
const _createOutbound = async (outboundData) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    // 确保outboundData是一个对象
    if (!outboundData || typeof outboundData !== 'object') {
      throw new Error('无效的出库单数据，必须是一个对象');
    }

    // ===== 年度结存校验 =====
    const outboundDateForCheck =
      outboundData.outboundDate || new Date().toISOString().split('T')[0];
    const PeriodValidationService = require('../../../services/business/PeriodValidationService');
    const inventoryCheck =
      await PeriodValidationService.validateInventoryTransaction(outboundDateForCheck);
    if (!inventoryCheck.allowed) {
      throw new Error(inventoryCheck.message);
    }
    // ===== 年度结存校验结束 =====

    // 生成出库单号
    const outboundNo = await CodeGenerators.generateInventoryOutboundCode(connection);

    // 获取操作人信息
    const operator = outboundData.operator || 'system';

    // 获取状态
    const status = outboundData.status || 'draft';

    // 检查outboundDate是否存在，如果不存在则使用当前日期
    const outboundDate = outboundData.outboundDate || new Date().toISOString().split('T')[0];

    // 确保remark不是undefined，如果是undefined则设为null
    const remark = outboundData.remark !== undefined ? outboundData.remark : null;

    // 获取生产任务ID（如果存在）
    const productionTaskId =
      outboundData.productionTaskId || outboundData.production_task_id || null;

    // 如果有生产任务ID，设置reference_id和reference_type
    const referenceId = null;
    let referenceType = null;


    if (productionTaskId) {
      referenceType = 'production_task';

      // 🔥 超额领料检查逻辑
      const ExcessIssueService = require('../../../services/business/ExcessIssueService');

      // 提取物料明细用于检查
      // 注意：outboundData.items 是前端传入的原始数据或者已处理的数据
      // 我们需要确保 items 里的 materialId 和 quantity 是正确的
      const itemsToCheck = outboundData.items.map((item) => ({
        materialId: item.materialId || item.material_id,
        quantity: parseFloat(item.quantity),
      }));

      if (itemsToCheck.length > 0) {
        const excessResults = await ExcessIssueService.checkBatchExcess(
          productionTaskId,
          itemsToCheck
        );

        if (excessResults.length > 0) {
          // 存在超额项
          const excessDetails = excessResults
            .map((r) => {
              // 获取物料名称（需要查询或从items中获取，这里简化）
              // 假设 item 中有 materialName，如果没有也无妨，前端可以根据 materialId 匹配
              return `物料ID:${r.materialId} 超出 ${r.excessQty}`;
            })
            .join(', ');

          logger.warn(`检测到超额领料: ${excessDetails}`);

          // 如果前端没有明确允许超额 (allowExcess !== true)
          if (!outboundData.allowExcess) {
            const error = new Error('存在超额领料，请确认');
            error.code = 'EXCESS_ISSUE';
            error.details = excessResults; // 将超额详情返回给前端
            throw error;
          }

          // 如果允许超额，检查是否填写了原因
          // 这里检查每一项超额的是否都有原因，或者整体有一个原因
          // 简化逻辑：如果是超额出库，要求出库单备注或单独字段填写原因
          // 假设我们在 items 级别或 header 级别 check
          // 实施计划中提到 inventory_ledger.issue_reason
          // 我们需要确保 items 中每一行超额的都有 issue_reason 或者如果整体补发，用 header 的 issueReason?
          // 暂定：如果超额，检查 outboundData.items 中对应行的 issueReason，或者 outboundData.issueReason

          // 简单起见，如果超额，要求 outboundData.remark 或 issueReason 必填
          // 但实施计划要求是 "issue_reason" 字段
          // 我们检查是否有传入 issue_reason (在 outboundData 中)

          if (!outboundData.issueReason && !outboundData.issue_reason) {
            // 也可以检查 item 级别的 issue_reason
            const hasItemReason = outboundData.items.some((i) => i.issueReason || i.issue_reason);
            if (!hasItemReason) {
              const error = new Error('超额领料必须填写补发/超额原因');
              error.code = 'MISSING_ISSUE_REASON';
              throw error;
            }
          }

          // 标记超额状态，以便后续写入 inventory_ledger
          outboundData.isExcess = 1;
        }
      }


      // 更新生产任务状态为"配料中"，并记录发料时间
      try {
        const [taskCheck] = await connection.execute(
          'SELECT id, status FROM production_tasks WHERE id = ?',
          [productionTaskId]
        );

        if (
          taskCheck.length > 0 &&
          (taskCheck[0].status === STATUS.PRODUCTION_TASK.PENDING ||
            taskCheck[0].status === STATUS.PRODUCTION_TASK.ALLOCATED ||
            taskCheck[0].status === STATUS.PRODUCTION_TASK.PREPARING)
        ) {
          // 更新任务状态为"发料中"并记录发料时间
          await connection.execute(
            'UPDATE production_tasks SET status = ?, actual_start_time = ? WHERE id = ?',
            [STATUS.PRODUCTION_TASK.MATERIAL_ISSUING, outboundDate, productionTaskId]
          );
          logger.debug(
            `生产任务 ${productionTaskId} 状态已更新为"发料中"，发料时间: ${outboundDate}`
          );

          // 同时更新关联的生产计划状态为"发料中"
          const [planCheck] = await connection.execute(
            'SELECT plan_id FROM production_tasks WHERE id = ?',
            [productionTaskId]
          );

          if (planCheck.length > 0 && planCheck[0].plan_id) {
            await connection.execute(
              'UPDATE production_plans SET status = ? WHERE id = ? AND status IN (?, ?, ?)',
              ['material_issuing', planCheck[0].plan_id, 'draft', 'allocated', 'preparing']
            );
            logger.debug(`生产计划 ${planCheck[0].plan_id} 状态已更新为"发料中"`);
          }
        }
      } catch (taskError) {
        logger.error('更新生产任务状态失败:', taskError);
        // 不阻止出库单创建流程
      }
    }

    // 插入出库单主表（含出库类型标记）
    const outboundType = outboundData.outbound_type || 'manual';
    const [result] = await connection.execute(
      `INSERT INTO inventory_outbound 
        (outbound_no, outbound_date, status, outbound_type, operator, remark, reference_id, reference_type, production_task_id, issue_reason, is_excess) 
       VALUES 
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        outboundNo,
        outboundDate,
        status,
        outboundType,
        operator,
        remark,
        referenceId,
        referenceType,
        productionTaskId || null,
        outboundData.issueReason || outboundData.issue_reason || null,
        outboundData.isExcess ? 1 : 0,
      ]
    );

    const outboundId = result.insertId;

    // 检查items是否存在且是数组
    if (!outboundData.items || !Array.isArray(outboundData.items)) {
      // 如果items不是数组，尝试将其转换为数组
      const items = outboundData.items ? [outboundData.items] : [];
      outboundData.items = items;
    }

    // 如果没有items，直接提交并返回
    if (outboundData.items.length === 0) {
      await connection.commit();
      return { id: outboundId, outboundNo: outboundNo, warning: '出库单创建成功，但没有明细项' };
    }

    // 批量获取所有物料的仓库和单位信息（通过 InventoryService 统一入口）
    const materialIds = outboundData.items.map((item) => item.materialId);
    const materialInfoMap = await InventoryService.getBatchMaterialInfo(materialIds, connection);

    // 构建兼容的 materialLocationMap（供后续逻辑使用）
    const materialLocationMap = {};
    for (const [id, info] of materialInfoMap) {
      materialLocationMap[id] = info.locationId;
    }

    // 记录不存在或没有默认库位的物料ID
    const missingMaterials = [];

    // 插入出库单明细
    for (const item of outboundData.items) {
      if (!item.materialId || !item.quantity) {
        throw new Error('每个出库项目必须包含物料ID和数量');
      }

      const matInfo = materialInfoMap.get(item.materialId);

      // 如果没有提供 unitId，使用批查询中获取的默认单位
      if (!item.unitId) {
        if (matInfo && matInfo.unitId) {
          item.unitId = matInfo.unitId;
        } else {
          logger.warn(`物料 ${item.materialId} 本身缺少单位ID`);
          item.unitId = null;
        }
      }

      // 获取物料对应的库位，由于已经通过getBatchMaterialInfo校验过，一定存在
      let locationId = materialLocationMap[item.materialId];
      if (!locationId) {
        // 只有在状态为completed时才严格检查物料和库位
        if (status === STATUS.OUTBOUND.COMPLETED) {
          throw new Error(`物料ID ${item.materialId} 不存在或没有设置默认库位`);
        } else {
          // 如果是草稿状态，直接将库位留空 (null)，不要造出一个假的仓库 1
          locationId = null;

          missingMaterials.push(item.materialId);
        }
      }

      // 确保remark不是undefined，如果是undefined则设为null
      const itemRemark = item.remark !== undefined ? item.remark : null;

      // ========== 部分发料支持: 检查库存并设置planned/actual quantity ==========
      const plannedQuantity = parseFloat(item.quantity);
      const actualQuantity = plannedQuantity;
      const shortageQuantity = 0;
      const isShortage = 0;

      // 查询当前库存
      try {
        const [stockResult] = await connection.execute(
          `SELECT COALESCE(SUM(quantity), 0) as total_quantity
           FROM inventory_ledger
           WHERE material_id = ? AND location_id = ?`,
          [item.materialId, locationId]
        );

        const _currentStock = parseFloat(stockResult[0].total_quantity) || 0;

        // 获取物料信息用于错误提示 (直接从已加载的缓存中取)
        const _materialName = matInfo 
            ? `${matInfo.code || ''} - ${matInfo.name || ''}`
            : `物料ID ${item.materialId}`;

        // 移除库存检查，允许出库数量大于库存数量
        // 这样可以支持预出库、负库存等业务场景
        // if (currentStock < plannedQuantity) {
        //   // 如果是草稿状态,允许创建但标记为缺料
        //   if (status === 'draft') {
        //     actualQuantity = currentStock > 0 ? currentStock : 0;
        //     shortageQuantity = plannedQuantity - actualQuantity;
        //     isShortage = 1;
        //     logger.info(`物料 ${materialName} 库存不足: 计划${plannedQuantity}, 库存${currentStock}, 实际${actualQuantity}, 缺料${shortageQuantity}`);
        //   } else {
        //     // 如果是confirmed或completed状态,直接报错
        //     throw new Error(`物料 ${materialName} 库存不足! 需要出库 ${plannedQuantity} 件,当前库存仅有 ${currentStock} 件,缺少 ${plannedQuantity - currentStock} 件。请先补充库存或调整出库数量。`);
        //   }
        // }
      } catch (stockError) {
        // 如果是库存不足的错误,直接抛出
        if (stockError.message.includes('库存不足')) {
          throw stockError;
        }
        logger.error('查询库存失败:', stockError);
        // 查询失败时,如果不是草稿状态则报错
        if (status !== 'draft') {
          throw new Error('查询库存失败,无法创建出库单');
        }
      }

      try {
        await connection.execute(
          `INSERT INTO inventory_outbound_items
            (outbound_id, material_id, quantity, planned_quantity, actual_quantity, shortage_quantity, is_shortage, unit_id, remark)
           VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            outboundId,
            item.materialId,
            item.quantity,
            plannedQuantity,
            actualQuantity,
            shortageQuantity,
            isShortage,
            item.unitId,
            itemRemark,
          ]
        );
      } catch (insertError) {
        logger.error('插入出库单明细项出错:', insertError);
        throw insertError;
      }

      // 更新库存 - 使用actual_quantity而不是quantity
      if (status === STATUS.OUTBOUND.COMPLETED) {
        // 只有actual_quantity > 0时才扣减库存
        if (actualQuantity > 0) {
          // 如果是生产出库，使用智能出库逻辑
          if (referenceType === 'production_plan') {
            await smartOutboundStock(
              item.materialId,
              locationId,
              actualQuantity,
              operator,
              `出库单号: ${outboundNo}`,
              referenceId,
              connection,
              {
                issueReason: outboundData.issueReason || outboundData.issue_reason,
                isExcess: outboundData.isExcess || 0,
              }
            );
          } else {
            // 普通出库 - 使用新的InventoryService
            await InventoryService.updateStock(
              {
                materialId: item.materialId,
                locationId: locationId,
                quantity: -actualQuantity,
                transactionType: 'outbound',
                referenceNo: outboundNo,
                issue_reason: outboundData.issueReason || outboundData.issue_reason,
                is_excess: outboundData.isExcess || 0,
                referenceType: 'outbound',
                operator: operator,
                remark: `出库单号: ${outboundNo}`,
                unitId: item.unitId,
                batchNumber: item.batchNumber || item.batch_number
              },
              connection
            );
          }
        }

        // 创建追溯记录 - 已禁用，改用新的追溯链路服务（在出库单完成时调用）
        // try {

        //   // 获取物料的批次号（使用公共函数）
        //   let batchNumber = item.batchNumber || '';

        //   // 如果没有批次号，尝试从库存中获取
        //   if (!batchNumber) {
        //     batchNumber = await getMaterialBatchNumber(
        //       connection,
        //       item.materialId,
        //       null,
        //       'default'
        //     );
        //   }

        //   // 调用追溯API
        //   await qualityApi.autoCreateTraceability('outbound', {
        //     outbound_id: outboundId,
        //     material_id: item.materialId,
        //     batch_number: batchNumber
        //   });

        // } catch (traceError) {
        //   logger.error('创建追溯记录失败:', traceError);
        //   // 不因为追溯失败而影响出库操作
        // }
      }
    }

    // ========== 部分发料支持: 判断是否部分完成并创建缺料记录 ==========
    let finalStatus = status;
    let hasShortage = false;

    if (status === STATUS.OUTBOUND.COMPLETED) {
      // 检查是否有缺料
      const [shortageCheck] = await connection.execute(
        `SELECT COUNT(*) as shortage_count
         FROM inventory_outbound_items
         WHERE outbound_id = ? AND shortage_quantity > 0`,
        [outboundId]
      );

      hasShortage = shortageCheck[0].shortage_count > 0;

      if (hasShortage) {
        // 有缺料,状态改为partial_completed
        finalStatus = 'partial_completed';
        await connection.execute('UPDATE inventory_outbound SET status = ? WHERE id = ?', [
          finalStatus,
          outboundId,
        ]);

        logger.info(`出库单 ${outboundNo} 存在缺料,状态设置为 partial_completed`);

        // 创建缺料记录
        const [shortageItems] = await connection.execute(
          `SELECT
            ioi.id as outbound_item_id,
            ioi.material_id,
            m.code as material_code,
            m.name as material_name,
            m.specs as material_specs,
            ioi.unit_id,
            u.name as unit_name,
            ioi.planned_quantity,
            ioi.actual_quantity,
            ioi.shortage_quantity
           FROM inventory_outbound_items ioi
           LEFT JOIN materials m ON ioi.material_id = m.id
           LEFT JOIN units u ON ioi.unit_id = u.id
           WHERE ioi.outbound_id = ? AND ioi.shortage_quantity > 0`,
          [outboundId]
        );

        for (const item of shortageItems) {
          // 查询当前库存
          const [stockResult] = await connection.execute(
            `SELECT COALESCE(SUM(quantity), 0) as total_quantity
             FROM inventory_ledger
             WHERE material_id = ?`,
            [item.material_id]
          );

          const currentStock = parseFloat(stockResult[0].total_quantity) || 0;

          await connection.execute(
            `INSERT INTO material_shortage_records
              (outbound_id, outbound_no, outbound_item_id, material_id, material_code, material_name, material_specs,
               unit_id, unit_name, planned_quantity, actual_quantity, shortage_quantity, supplied_quantity,
               remaining_quantity, current_stock, status, reference_type, reference_id, reference_no)
             VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'pending', ?, ?, ?)`,
            [
              outboundId,
              outboundNo,
              item.outbound_item_id,
              item.material_id,
              item.material_code,
              item.material_name,
              item.material_specs,
              item.unit_id,
              item.unit_name,
              item.planned_quantity,
              item.actual_quantity,
              item.shortage_quantity,
              item.shortage_quantity,
              currentStock,
              referenceType,
              referenceId,
              referenceId,
            ]
          );
        }

        logger.info(`已为出库单 ${outboundNo} 创建 ${shortageItems.length} 条缺料记录`);
      }
    }

    // 检查并更新生产任务状态
    if (productionTaskId) {
      await checkAndUpdateTaskStatus(connection, productionTaskId);
    }

    await connection.commit();

    // 添加警告信息
    let warning = null;
    if (missingMaterials.length > 0) {
      warning = `以下物料ID不存在或没有设置默认库位：${missingMaterials.join(', ')}。出库单已创建为草稿状态，请先添加这些物料或设置默认库位。`;
    } else if (hasShortage) {
      warning = '出库单已创建,但部分物料库存不足,状态为"部分完成"。请及时补货后进行补发。';
    }

    return {
      id: outboundId,
      outboundNo: outboundNo,
      status: finalStatus,
      hasShortage: hasShortage,
      warning: warning,
    };
  } catch (error) {
    await connection.rollback();
    logger.error('Error creating outbound:', error.message);
    logger.error('Error stack:', error.stack);
    throw error;
  } finally {
    connection.release();
  }
};

// HTTP 路由处理函数
const createOutbound = async (req, res) => {
  try {
    // 从请求体中获取出库单数据
    const outboundData = req.body;

    // 格式化日期为 YYYY-MM-DD
    const formatDateForDB = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // 适配字段名称 - 前端可能使用不同的字段名
    const adaptedData = {
      outboundDate: formatDateForDB(outboundData.outbound_date || outboundData.outboundDate),
      status: outboundData.status || 'draft',
      operator: outboundData.operator || req.user?.real_name || req.user?.username || 'system',
      remark: outboundData.remark || outboundData.remarks,
      // 出库类型标记（前端传入）
      outbound_type: outboundData.outbound_type || 'manual',
      // 转换productionTaskId
      productionTaskId: outboundData.production_task_id || outboundData.productionTaskId,
      // 补料申请相关字段
      issue_reason: outboundData.issue_reason || outboundData.issueReason,
      isExcess:
        outboundData.is_excess || outboundData.isExcess || outboundData.force_excess || false,
      // 允许超额 - 用于补料申请场景
      allowExcess:
        outboundData.allowExcess || outboundData.allow_excess || outboundData.force_excess || false,
      // 转换items数组字段名
      items: Array.isArray(outboundData.items)
        ? outboundData.items.map((item) => ({
          materialId: item.material_id || item.materialId,
          quantity: item.quantity,
          unitId: item.unit_id || item.unitId,
          remark: item.remark || item.remarks,
        }))
        : [],
    };

    // 调用内部方法创建出库单
    const result = await _createOutbound(adaptedData);

    // 返回成功响应
    ResponseHandler.success(
      res,
      {
        success: true,
        message: '出库单创建成功',
        data: result,
        warning: result.warning,
      },
      '创建成功',
      201
    );
  } catch (error) {
    logger.error('创建出库单失败:', error.message);
    logger.error('错误堆栈:', error.stack);
    logger.error('请求数据:', JSON.stringify(req.body));

    // 判断错误类型并提供更友好的错误信息
    const errorMessage = error.message;
    let statusCode = 500;

    // 检查是否是物料不存在的错误
    if (
      error.message &&
      error.message.includes('物料ID') &&
      error.message.includes('不存在或没有设置默认库位')
    ) {
      statusCode = 400; // 使用400表示客户端错误
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || '创建出库单失败',
      error: errorMessage,
      code: error.code,
      details: error.details,
    });
  }
};

// 获取带库存数量的物料列表
const getMaterialsWithStock = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const { keyword = '' } = req.query;

    // 构建查询，获取物料及其默认库位的库存信息
    const query = `
      SELECT
        m.id,
        m.code,
        m.name,
        m.specs as specification,
        c.name as category_name,
        m.unit_id,
        u.name as unit_name,
        m.location_id,
        COALESCE(l.name, m.location_name, '默认库位') as location_name,
        COALESCE(s.quantity, 0) as stock_quantity,
        COALESCE(s.quantity, 0) as quantity,
        0 as stock_id
      FROM
        materials m
        JOIN categories c ON m.category_id = c.id
        JOIN units u ON m.unit_id = u.id
        LEFT JOIN locations l ON m.location_id = l.id
        LEFT JOIN (
          SELECT il.material_id, il.location_id, SUM(il.quantity) as quantity
          FROM inventory_ledger il
          JOIN materials mat ON il.material_id = mat.id
          WHERE mat.location_id IS NULL OR il.location_id = mat.location_id
          GROUP BY il.material_id, il.location_id
        ) s ON m.id = s.material_id AND s.location_id = m.location_id
      WHERE
        m.status = 1
        ${keyword ? 'AND (m.code LIKE ? OR m.name LIKE ?)' : ''}
      ORDER BY
        m.code
      LIMIT 50
    `;

    // 构建参数数组
    const params = [];
    if (keyword) {
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const [rows] = await connection.execute(query, params);

    // SQL 子查询已计算准确的库存，直接使用，无需逐行重查
    const processedRows = rows.map(row => ({
      ...row,
      material_id: row.id,
      quantity: parseFloat(row.quantity || 0),
      stock_quantity: parseFloat(row.stock_quantity || 0),
    }));

    ResponseHandler.success(res, processedRows, '获取库存物料列表成功');
  } catch (error) {
    logger.error('Error getting materials with stock:', error);
    ResponseHandler.error(res, '获取库存物料列表失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 删除出库单
const deleteOutbound = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // 检查出库单是否存在,并获取关联信息
    const [checkResult] = await connection.execute(
      'SELECT status, reference_id, reference_type FROM inventory_outbound WHERE id = ?',
      [id]
    );

    if (checkResult.length === 0) {
      return ResponseHandler.error(res, '出库单不存在', 'NOT_FOUND', 404);
    }

    const { status, reference_id, reference_type } = checkResult[0];

    // 检查出库单状态，只允许删除草稿状态的出库单
    if (status !== 'draft') {
      return ResponseHandler.error(res, '只能删除草稿状态的出库单', 'BAD_REQUEST', 400);
    }

    // 如果出库单关联了生产任务,回退任务状态
    if (reference_id && reference_type === 'production_task') {
      try {
        // 检查任务当前状态
        const [taskCheck] = await connection.execute(
          'SELECT status FROM production_tasks WHERE id = ?',
          [reference_id]
        );

        if (taskCheck.length > 0) {
          const currentTaskStatus = taskCheck[0].status;

          // 只有在发料相关状态时才回退
          if (['material_issuing', 'preparing'].includes(currentTaskStatus)) {
            // 回退任务状态到pending,并清除发料时间
            await connection.execute(
              'UPDATE production_tasks SET status = ?, actual_start_time = NULL WHERE id = ?',
              ['pending', reference_id]
            );
            logger.info(`生产任务 ${reference_id} 状态已回退: ${currentTaskStatus} → pending`);

            // 同时回退关联的生产计划状态
            const [planCheck] = await connection.execute(
              'SELECT plan_id FROM production_tasks WHERE id = ?',
              [reference_id]
            );

            if (planCheck.length > 0 && planCheck[0].plan_id) {
              const planId = planCheck[0].plan_id;
              await connection.execute(
                'UPDATE production_plans SET status = ? WHERE id = ? AND status IN (?, ?)',
                ['draft', planId, 'material_issuing', 'preparing']
              );
              logger.info(`生产计划 ${planId} 状态已回退到 draft`);
            }
          }
        }
      } catch (taskError) {
        logger.error('回退生产任务状态失败:', taskError);
        // 不阻止删除流程,但记录错误
      }
    }

    // 如果出库单关联了生产计划(直接关联),也回退计划状态
    if (reference_id && reference_type === 'production_plan') {
      try {
        const [planCheck] = await connection.execute(
          'SELECT status FROM production_plans WHERE id = ?',
          [reference_id]
        );

        if (planCheck.length > 0) {
          const currentPlanStatus = planCheck[0].status;

          if (['material_issuing', 'preparing'].includes(currentPlanStatus)) {
            await connection.execute('UPDATE production_plans SET status = ? WHERE id = ?', [
              'draft',
              reference_id,
            ]);
            logger.info(`生产计划 ${reference_id} 状态已回退: ${currentPlanStatus} → draft`);
          }
        }
      } catch (planError) {
        logger.error('回退生产计划状态失败:', planError);
      }
    }

    // 删除出库单明细
    await connection.execute('DELETE FROM inventory_outbound_items WHERE outbound_id = ?', [id]);

    // 删除出库单主表
    await connection.execute('DELETE FROM inventory_outbound WHERE id = ?', [id]);

    await connection.commit();
    logger.info(
      `出库单 ${id} 删除成功${reference_id ? `, 已回退关联的${reference_type === 'production_task' ? '生产任务' : '生产计划'} ${reference_id}` : ''}`
    );
    ResponseHandler.success(res, null, '出库单删除成功');
  } catch (error) {
    await connection.rollback();
    logger.error('删除出库单失败:', error);
    ResponseHandler.error(res, '删除出库单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 撤销出库 - 回退已完成的出库单
const cancelOutbound = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { force } = req.body || {}; // 强制撤销标志（用于生产中状态的确认）

    // 检查出库单是否存在,并获取详细信息
    const [checkResult] = await connection.execute(
      'SELECT status, reference_id, reference_type, outbound_no FROM inventory_outbound WHERE id = ?',
      [id]
    );

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '出库单不存在', 'NOT_FOUND', 404);
    }

    const { status, reference_id, reference_type, outbound_no } = checkResult[0];

    // 只允许撤销已完成的出库单
    if (status !== 'completed') {
      await connection.rollback();
      return ResponseHandler.error(res, '只能撤销已完成的出库单', 'BAD_REQUEST', 400);
    }

    // ============ 新增：检查关联的生产任务/计划状态，判断是否允许撤销 ============
    // 不允许撤销的状态（生产已完成或已进入检验阶段）
    const prohibitedStatuses = ['inspection', 'quality_passed', 'completed', 'warehoused'];
    // 需要警告确认的状态（生产进行中）
    const warningStatuses = ['in_progress'];

    if (reference_id && reference_type === 'production_task') {
      // 检查生产任务状态
      const [taskCheck] = await connection.execute(
        'SELECT status, code FROM production_tasks WHERE id = ?',
        [reference_id]
      );

      if (taskCheck.length > 0) {
        const taskStatus = taskCheck[0].status;
        const taskCode = taskCheck[0].code;

        // 检查是否在禁止撤销的状态
        if (prohibitedStatuses.includes(taskStatus)) {
          await connection.rollback();
          return ResponseHandler.error(
            res,
            `无法撤销：关联的生产任务 ${taskCode} 已进入"${getStatusText(taskStatus)}"状态，物料已被消耗转化为成品，撤销会导致数据不一致`,
            'BAD_REQUEST',
            400
          );
        }

        // 检查是否需要警告确认
        if (warningStatuses.includes(taskStatus) && !force) {
          await connection.rollback();
          return ResponseHandler.error(
            res,
            `警告：关联的生产任务 ${taskCode} 正在生产中，部分物料可能已被消耗。如确需撤销，请使用强制撤销。`,
            'NEED_CONFIRM',
            409,
            { needConfirm: true, taskStatus, taskCode }
          );
        }
      }
    }

    if (reference_id && reference_type === 'production_plan') {
      // 检查生产计划状态
      const [planCheck] = await connection.execute(
        'SELECT status, code FROM production_plans WHERE id = ?',
        [reference_id]
      );

      if (planCheck.length > 0) {
        const planStatus = planCheck[0].status;
        const planCode = planCheck[0].code;

        // 检查是否在禁止撤销的状态
        if (prohibitedStatuses.includes(planStatus)) {
          await connection.rollback();
          return ResponseHandler.error(
            res,
            `无法撤销：关联的生产计划 ${planCode} 已进入"${getStatusText(planStatus)}"状态，物料已被消耗转化为成品，撤销会导致数据不一致`,
            'BAD_REQUEST',
            400
          );
        }

        // 检查是否需要警告确认
        if (warningStatuses.includes(planStatus) && !force) {
          await connection.rollback();
          return ResponseHandler.error(
            res,
            `警告：关联的生产计划 ${planCode} 正在生产中，部分物料可能已被消耗。如确需撤销，请使用强制撤销。`,
            'NEED_CONFIRM',
            409,
            { needConfirm: true, planStatus, planCode }
          );
        }
      }

      // 额外检查：该计划下的所有任务状态
      const [taskStats] = await connection.execute(
        `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status IN ('inspection', 'quality_passed', 'completed', 'warehoused') THEN 1 ELSE 0 END) as completed_count,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count
        FROM production_tasks
        WHERE plan_id = ?
      `,
        [reference_id]
      );

      if (taskStats.length > 0) {
        const { total, completed_count, in_progress_count } = taskStats[0];
        const completedNum = Number(completed_count) || 0;
        const inProgressNum = Number(in_progress_count) || 0;

        if (completedNum > 0) {
          await connection.rollback();
          return ResponseHandler.error(
            res,
            `无法撤销：该计划下有 ${completedNum} 个生产任务已完成或进入检验阶段，物料已被消耗转化为成品`,
            'BAD_REQUEST',
            400
          );
        }

        if (inProgressNum > 0 && !force) {
          await connection.rollback();
          return ResponseHandler.error(
            res,
            `警告：该计划下有 ${inProgressNum} 个生产任务正在生产中，部分物料可能已被消耗。如确需撤销，请使用强制撤销。`,
            'NEED_CONFIRM',
            409,
            { needConfirm: true, inProgressCount: inProgressNum }
          );
        }
      }
    }
    // ============ 结束：检查关联的生产任务/计划状态 ============

    // 获取出库单明细（包含actual_quantity用于库存回退）
    // 注意：location_id 从 materials 表获取，因为 inventory_outbound_items 表没有 location_id 字段
    const [items] = await connection.execute(
      `
      SELECT
        ioi.material_id,
        COALESCE(m.location_id, 1) as location_id,
        ioi.quantity,
        ioi.actual_quantity,
        ioi.unit_id,
        m.code as material_code,
        m.name as material_name
      FROM inventory_outbound_items ioi
      LEFT JOIN materials m ON ioi.material_id = m.id
      WHERE ioi.outbound_id = ?
    `,
      [id]
    );

    // ✅ 源头修复：预先从台账中按物料返回原始出库批次（一个物料可能有多个 FIFO 批次）
    // 结构: Map<material_id, Array<{batchNumber, quantity}>>
    const [originalLedger] = await connection.execute(
      `SELECT material_id, batch_number, ABS(quantity) as qty
       FROM inventory_ledger
       WHERE reference_no = ? AND transaction_type = 'sales_outbound'
         AND quantity < 0
         AND batch_number IS NOT NULL AND batch_number != ''
       ORDER BY id ASC`,
      [outbound_no]
    );
    // 尝试其他出库类型（如果 sales_outbound 未查到）
    const ledgerCheck = originalLedger.length > 0 ? originalLedger : (
      await connection.execute(
        `SELECT material_id, batch_number, ABS(quantity) as qty
         FROM inventory_ledger
         WHERE reference_no = ? AND quantity < 0
           AND batch_number IS NOT NULL AND batch_number != ''
         ORDER BY id ASC`,
        [outbound_no]
      )
    )[0];

    // 构建 "material_id => [{batchNumber, qty}]" 映射
    const batchByMaterial = new Map();
    for (const row of ledgerCheck) {
      const mid = row.material_id;
      if (!batchByMaterial.has(mid)) batchByMaterial.set(mid, []);
      batchByMaterial.get(mid).push({ batchNumber: row.batch_number, qty: parseFloat(row.qty) });
    }

    // 获取当前操作员
    const operator = req.user?.username || 'system';

    // 如果明细为空（可能已经被删除），直接更新状态为draft
    if (items.length === 0) {
      logger.info(`出库单 ${outbound_no} 明细为空（可能已经被之前的操作删除），直接回退状态`);

      // 将出库单状态改为draft
      await connection.execute(
        'UPDATE inventory_outbound SET status = ?, updated_at = NOW() WHERE id = ?',
        ['draft', id]
      );

      // 如果出库单关联了生产任务,回退任务状态
      if (reference_id && reference_type === 'production_task') {
        const [taskCheck] = await connection.execute(
          'SELECT status FROM production_tasks WHERE id = ?',
          [reference_id]
        );

        if (
          taskCheck.length > 0 &&
          taskCheck[0].status === STATUS.PRODUCTION_TASK.MATERIAL_ISSUED
        ) {
          await connection.execute('UPDATE production_tasks SET status = ? WHERE id = ?', [
            STATUS.PRODUCTION_TASK.PREPARING,
            reference_id,
          ]);
          logger.info(
            `生产任务 ${reference_id} 状态已回退: ${STATUS.PRODUCTION_TASK.MATERIAL_ISSUED} → ${STATUS.PRODUCTION_TASK.PREPARING}`
          );
        }
      }

      await connection.commit();
      return ResponseHandler.success(res, { id }, '出库单已撤销');
    }

    // 回退库存 - 将出库的物料加回来，将源头批次号一并恢复
    for (const item of items) {
      try {
        // 使用actual_quantity回退库存（与出库时的扣减逻辑一致）
        // 如果actual_quantity为null，说明是旧数据，使用quantity作为后备
        const returnQuantity = parseFloat(item.actual_quantity ?? item.quantity) || 0;

        // 如果实际出库数量为0，则不需要回退
        if (returnQuantity <= 0) {
          logger.info(`物料 ${item.material_code} 实际出库数量为0，跳过回退`);
          continue;
        }

        // ✅ 取回原始批次并将对应批次的库存分别回退
        const originalBatches = batchByMaterial.get(item.material_id) || [];

        if (originalBatches.length > 0) {
          // 按原始 FIFO 批次逐一回退，保持批次追溯的一致性
          for (const batchInfo of originalBatches) {
            await InventoryService.updateStock(
              {
                materialId: item.material_id,
                locationId: item.location_id,
                quantity: batchInfo.qty,
                transactionType: 'outbound_cancel',
                referenceNo: outbound_no,
                referenceType: 'outbound_cancel',
                operator: operator,
                remark: `撤销出库单: ${outbound_no}`,
                unitId: item.unit_id,
                batchNumber: batchInfo.batchNumber, // 使用原始批次号回退
              },
              connection
            );
          }
        } else {
          // 如果还是未找到批次（非常旧数据），则整个单元一错回退
          // updateStock 会自动生成批次号，不会产生空批次
          await InventoryService.updateStock(
            {
              materialId: item.material_id,
              locationId: item.location_id,
              quantity: returnQuantity,
              transactionType: 'outbound_cancel',
              referenceNo: outbound_no,
              referenceType: 'outbound_cancel',
              operator: operator,
              remark: `撤销出库单: ${outbound_no}`,
              unitId: item.unit_id,
              // batchNumber 未传入，将由 updateStock 内部自动生成
            },
            connection
          );
        }

        logger.info(
          `撤销出库: ${item.material_code} ${item.material_name}, 数量: +${returnQuantity}`
        );
      } catch (stockError) {
        logger.error(`回退库存失败 - 物料: ${item.material_code}:`, stockError);
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `回退库存失败: ${item.material_name}`,
          'SERVER_ERROR',
          500,
          stockError
        );
      }
    }

    // 将出库单状态改为draft
    await connection.execute(
      'UPDATE inventory_outbound SET status = ?, updated_at = NOW() WHERE id = ?',
      ['draft', id]
    );

    logger.info(`出库单 ${id} (${outbound_no}) 状态已回退: completed → draft`);

    // ============ 重要：删除出库单明细，以便重新出库时使用最新的BOM数据 ============
    // 如果是生产出库单，需要删除明细项，确保重新出库时获取最新的BOM
    if (
      reference_id &&
      (reference_type === 'production_task' || reference_type === 'production_plan')
    ) {
      try {
        const [deleteResult] = await connection.execute(
          'DELETE FROM inventory_outbound_items WHERE outbound_id = ?',
          [id]
        );
        logger.info(
          `已删除出库单 ${outbound_no} 的 ${deleteResult.affectedRows} 条明细项，重新出库时将获取最新BOM`
        );
      } catch (deleteError) {
        logger.error('删除出库单明细失败:', deleteError);
        // 不阻止撤销流程，但记录警告
      }
    }
    // ============ 结束：删除出库单明细 ============

    // 如果出库单关联了生产任务,回退任务状态
    if (reference_id && reference_type === 'production_task') {
      try {
        const [taskCheck] = await connection.execute(
          'SELECT status FROM production_tasks WHERE id = ?',
          [reference_id]
        );

        if (taskCheck.length > 0) {
          const currentTaskStatus = taskCheck[0].status;

          // 如果任务是已发料状态,回退到配料中
          if (currentTaskStatus === STATUS.PRODUCTION_TASK.MATERIAL_ISSUED) {
            await connection.execute('UPDATE production_tasks SET status = ? WHERE id = ?', [
              STATUS.PRODUCTION_TASK.PREPARING,
              reference_id,
            ]);
            logger.info(
              `生产任务 ${reference_id} 状态已回退: ${STATUS.PRODUCTION_TASK.MATERIAL_ISSUED} → ${STATUS.PRODUCTION_TASK.PREPARING}`
            );
          }
        }
      } catch (taskError) {
        logger.error('回退生产任务状态失败:', taskError);
        // 不阻止撤销流程
      }
    }

    // 如果出库单关联了生产计划,回退计划状态
    if (reference_id && reference_type === 'production_plan') {
      try {
        const [planCheck] = await connection.execute(
          'SELECT status FROM production_plans WHERE id = ?',
          [reference_id]
        );

        if (planCheck.length > 0) {
          const currentPlanStatus = planCheck[0].status;

          if (currentPlanStatus === STATUS.PRODUCTION_PLAN.MATERIAL_ISSUED) {
            await connection.execute('UPDATE production_plans SET status = ? WHERE id = ?', [
              STATUS.PRODUCTION_PLAN.PREPARING,
              reference_id,
            ]);
            logger.info(`生产计划 ${reference_id} 状态已回退: material_issued → preparing`);
          }
        }
      } catch (planError) {
        logger.error('回退生产计划状态失败:', planError);
      }
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        id,
        outbound_no,
        canceledItems: items.length,
        message: '出库已撤销,库存已回退,出库单状态已改为草稿',
      },
      '撤销成功'
    );
  } catch (error) {
    await connection.rollback();
    logger.error('撤销出库失败:', error);
    ResponseHandler.error(res, '撤销失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 辅助函数：从BOM获取物料明细并保存到出库单
 * @param {Object} connection - 数据库连接
 * @param {number} outboundId - 出库单ID
 * @param {string} referenceType - 关联类型 ('production_task' 或 'production_plan')
 * @param {number} referenceId - 关联ID
 * @returns {Object} { success: boolean, itemCount: number, error?: string }
 */
const fetchBomItemsForOutbound = async (connection, outboundId, referenceType, referenceId) => {
  try {
    // 获取生产任务/计划信息以获取product_id
    let productId = null;
    let planQuantity = 1;

    if (referenceType === 'production_task') {
      const [taskInfo] = await connection.execute(
        'SELECT product_id, quantity FROM production_tasks WHERE id = ?',
        [referenceId]
      );
      if (taskInfo.length > 0) {
        productId = taskInfo[0].product_id;
        planQuantity = parseFloat(taskInfo[0].quantity) || 1;
      }
    } else if (referenceType === 'production_plan') {
      const [planInfo] = await connection.execute(
        'SELECT product_id, quantity FROM production_plans WHERE id = ?',
        [referenceId]
      );
      if (planInfo.length > 0) {
        productId = planInfo[0].product_id;
        planQuantity = parseFloat(planInfo[0].quantity) || 1;
      }
    }

    if (!productId) {
      return { success: false, itemCount: 0, error: '无法获取产品信息' };
    }

    // 通过product_id获取已审核的BOM（通过approved_by字段判断是否已审核）
    const [bomResult] = await connection.execute(
      'SELECT id FROM bom_masters WHERE product_id = ? AND approved_by IS NOT NULL ORDER BY id DESC LIMIT 1',
      [productId]
    );

    if (bomResult.length === 0) {
      return { success: false, itemCount: 0, error: '关联的产品没有启用的BOM' };
    }

    const bomId = bomResult[0].id;

    // 从BOM获取物料明细（只获取第一层级）
    const [bomItems] = await connection.execute(
      `SELECT bd.material_id, bd.quantity as bom_quantity, m.unit_id
       FROM bom_details bd
       JOIN materials m ON bd.material_id = m.id
       WHERE bd.bom_id = ? AND bd.level = 1`,
      [bomId]
    );

    // 插入出库单明细
    for (const bomItem of bomItems) {
      const requiredQuantity = parseFloat(bomItem.bom_quantity) * planQuantity;
      await connection.execute(
        `INSERT INTO inventory_outbound_items
          (outbound_id, material_id, quantity, planned_quantity, actual_quantity, unit_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          outboundId,
          bomItem.material_id,
          requiredQuantity,
          requiredQuantity,
          requiredQuantity,
          bomItem.unit_id,
        ]
      );
    }

    logger.info(`已从BOM(ID:${bomId})获取 ${bomItems.length} 条物料明细到出库单 ${outboundId}`);
    return { success: true, itemCount: bomItems.length };
  } catch (error) {
    logger.error('从BOM获取物料明细失败:', error);
    return { success: false, itemCount: 0, error: error.message };
  }
};

// 更新出库单状态
const updateOutboundStatus = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { newStatus } = req.body;

    // 检查出库单是否存在
    const [checkResult] = await connection.execute(
      'SELECT status, reference_id, reference_type, production_task_id, issue_reason, is_excess FROM inventory_outbound WHERE id = ?',
      [id]
    );

    if (checkResult.length === 0) {
      return ResponseHandler.error(res, '出库单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = checkResult[0].status;
    let referenceId = checkResult[0].reference_id;
    let referenceType = checkResult[0].reference_type;
    const productionTaskId = checkResult[0].production_task_id;

    // 如果referenceId为空但有productionTaskId，补充设置（兼容旧数据或逻辑缺口）
    if (!referenceId && productionTaskId) {
      referenceId = productionTaskId;
      referenceType = 'production_task';
    }

    // 验证状态转换的合法性
    // 状态转换规则（与数据库枚举保持一致：draft, confirmed, partial_completed, completed, cancelled）
    const validTransitions = {
      draft: ['confirmed', 'cancelled'],
      confirmed: ['completed', 'partial_completed', 'cancelled'],
      partial_completed: ['completed', 'cancelled'], // 部分完成可以通过补发变成完成
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[currentStatus] || !validTransitions[currentStatus].includes(newStatus)) {
      return ResponseHandler.error(res, '无效的状态转换', 'BAD_REQUEST', 400);
    }

    // 如果从draft转为confirmed，更新operator为当前用户
    let updateQuery = 'UPDATE inventory_outbound SET status = ?, updated_at = NOW()';
    const updateParams = [newStatus];

    if (currentStatus === STATUS.OUTBOUND.DRAFT && newStatus === STATUS.OUTBOUND.CONFIRMED) {
      // 获取当前用户
      const currentUser = req.user?.username || 'system';
      updateQuery += ', operator = ?';
      updateParams.push(currentUser);
      logger.info(`出库单 ${id} 确认，记录操作人: ${currentUser}`);

      // 如果是生产出库单且没有明细项，从BOM获取物料
      if (
        referenceId &&
        (referenceType === 'production_task' || referenceType === 'production_plan')
      ) {
        const [itemCheck] = await connection.execute(
          'SELECT COUNT(*) as count FROM inventory_outbound_items WHERE outbound_id = ?',
          [id]
        );

        const itemCount = Number(itemCheck[0].count);
        if (itemCount === 0) {
          logger.info(`出库单 ${id} 确认时没有明细项，准备从BOM获取...`);
          const bomResult = await fetchBomItemsForOutbound(
            connection,
            id,
            referenceType,
            referenceId
          );
          if (!bomResult.success) {
            logger.warn(`出库单 ${id} 确认时从BOM获取物料失败: ${bomResult.error}`);
          }
        }
      }
    }

    updateQuery += ' WHERE id = ?';
    updateParams.push(id);

    // 更新出库单状态
    const [_updateResult] = await connection.execute(updateQuery, updateParams);

    logger.debug(
      `出库单 ${id} 状态更新: ${currentStatus} → ${newStatus}, 关联类型: ${referenceType}, 关联ID: ${referenceId}`
    );

    // 获取出库单的补料/超额标记
    const issueReason = checkResult[0].issue_reason;
    const isExcess = checkResult[0].is_excess;
    const isSupplementRequest = isExcess || issueReason;

    // 如果出库单关联了生产任务，更新生产任务状态
    // 🔥 重要：补料申请（超额领料）不应该更新任务状态，因为任务可能已经在"生产中"状态
    if (isSupplementRequest) {
      logger.debug(
        `[补料申请] 出库单 ${id} 是补料申请/超额领料（原因: ${issueReason || '无'}, 超额: ${isExcess ? '是' : '否'}），跳过任务状态更新`
      );
    }

    if (referenceId && referenceType === 'production_task' && !isSupplementRequest) {
      // 统一联动更新生产任务/计划状态（confirmed 或 completed）
      await _syncProductionStatus(connection, newStatus, referenceId);
    }


    // 如果出库单关联了生产计划（直接关联，非通过任务），也更新计划和任务状态
    if (
      referenceId &&
      referenceType === 'production_plan' &&
      newStatus === STATUS.OUTBOUND.COMPLETED
    ) {
      try {
        const [planCheck] = await connection.execute(
          'SELECT status FROM production_plans WHERE id = ?',
          [referenceId]
        );

        if (planCheck.length > 0 && planCheck[0].status === 'preparing') {
          await connection.execute(
            'UPDATE production_plans SET status = "material_issued" WHERE id = ?',
            [referenceId]
          );
          logger.debug(`生产计划 ${referenceId} 物料发放完成，状态已更新为 material_issued`);
        }

        // 同时更新该计划下所有未完成的生产任务状态为"已发料"
        const [tasks] = await connection.execute(
          "SELECT id, status FROM production_tasks WHERE plan_id = ? AND status IN ('pending', 'preparing')",
          [referenceId]
        );

        if (tasks.length > 0) {
          const { apiStatusToDbStatus } = require('../../../utils/statusMapper');
          const dbStatus = apiStatusToDbStatus(
            STATUS.PRODUCTION_TASK.MATERIAL_ISSUED,
            'productionTask'
          );

          for (const task of tasks) {
            await connection.execute('UPDATE production_tasks SET status = ? WHERE id = ?', [
              dbStatus,
              task.id,
            ]);
            logger.debug(`生产任务 ${task.id} 状态已更新为 ${dbStatus}（出库单完成）`);
          }
        }
      } catch (planError) {
        logger.error('更新生产计划/任务状态时出错:', planError);
      }
    }

    // 如果状态变更为已完成，更新库存
    if (newStatus === STATUS.OUTBOUND.COMPLETED) {
      // 检查是否有出库明细
      const [itemCheck] = await connection.execute(
        'SELECT COUNT(*) as count FROM inventory_outbound_items WHERE outbound_id = ?',
        [id]
      );

      // 注意：MySQL的COUNT(*)返回的可能是字符串或BigInt，需要转换为数字
      let itemCount = Number(itemCheck[0].count);

      // 如果是生产出库单且没有明细项，从BOM获取物料
      if (
        itemCount === 0 &&
        referenceId &&
        (referenceType === 'production_task' || referenceType === 'production_plan')
      ) {
        logger.warn(`出库单 ${id} 完成时发现没有明细项，尝试从BOM获取...`);

        // 调用辅助函数从BOM获取物料明细
        const bomResult = await fetchBomItemsForOutbound(
          connection,
          id,
          referenceType,
          referenceId
        );

        if (bomResult.success) {
          itemCount = bomResult.itemCount;
          logger.info(`出库单 ${id} 完成时从BOM获取并保存了 ${itemCount} 条物料明细`);
        } else {
          logger.error(`出库单 ${id} 完成失败：${bomResult.error}`);
          await connection.rollback();
          return ResponseHandler.error(res, bomResult.error, 'BAD_REQUEST', 400);
        }
      }

      if (itemCount === 0) {
        logger.warn(`出库单 ${id} 没有明细项，跳过库存扣减`);
      } else {
        // 获取出库明细项(包含planned_quantity和actual_quantity，支持部分发料)
        const [items] = await connection.execute(
          'SELECT material_id, quantity, planned_quantity, actual_quantity, shortage_quantity, unit_id FROM inventory_outbound_items WHERE outbound_id = ?',
          [id]
        );

        // 获取出库单信息
        const [outboundInfo] = await connection.execute(
          'SELECT outbound_no, operator FROM inventory_outbound WHERE id = ?',
          [id]
        );

        if (!outboundInfo || outboundInfo.length === 0) {
          throw new Error(`找不到出库单信息: ${id}`);
        }

        // 判断是否是生产出库（包括production_task和production_plan）
        const isProductionOutbound =
          referenceType === 'production_task' || referenceType === 'production_plan';

        // ========== 通过 InventoryService 统一获取物料信息和库存 ==========
        const materialIds = items.map(i => i.material_id);
        const materialMap = new Map();
        const stockMap = new Map();

        if (materialIds.length > 0) {
          // 通过服务层批量获取物料仓库和单位信息
          const materialInfoMap = await InventoryService.getBatchMaterialInfo(materialIds, connection);
          for (const [id, info] of materialInfoMap) {
            materialMap.set(id, { id, location_id: info.locationId, unit_id: info.unitId });
          }

          // 通过服务层批量获取默认仓库的库存
          const pairs = [];
          for (const [id, info] of materialInfoMap) {
            pairs.push({ material_id: id, location_id: info.locationId });
          }
          const stockResults = await InventoryService.getBatchStock(pairs, connection);
          for (const row of stockResults) {
            const key = `${row.material_id}_${row.location_id}`;
            stockMap.set(key, row.quantity);
          }
        }

        // 非生产出库时，根据出库单的 reference_type 动态判定交易类型（提到循环外，避免每次迭代重建）
        const outboundTransactionTypeMap = {
          'purchase_return': 'purchase_return',
          'sales_order': 'sales_outbound',
          'sales': 'sales_outbound',
          'transfer': 'transfer',
        };
        const dynamicTransactionType = isProductionOutbound
          ? 'production_outbound'
          : (outboundTransactionTypeMap[referenceType] || 'outbound');

        for (const item of items) {
          try {
            // 从预加载的 Map 获取物料默认库位（不再逐条查询）
            const matInfo = materialMap.get(item.material_id);
            const locationId = matInfo?.location_id; // 从物料表取真实默认库位
            if (!locationId) {
              throw new Error(`物料 ${item.material_id} 未配置默认仓库，请在物料管理中设置`);
            }

            // ========== 部分发料支持: 使用actual_quantity扣减库存 ==========
            // 当actual_quantity为0时,不使用quantity作为后备值
            const actualQuantity = parseFloat(item.actual_quantity ?? 0);

            // 只有actual_quantity > 0时才扣减库存
            if (actualQuantity > 0) {
              // 如果是生产出库，使用智能出库逻辑
              if (isProductionOutbound) {
                await smartOutboundStock(
                  item.material_id,
                  locationId,
                  actualQuantity,
                  outboundInfo[0].operator,
                  `出库单号: ${outboundInfo[0].outbound_no}`,
                  referenceId,
                  connection,
                  {
                    issueReason: checkResult[0].issue_reason,
                    isExcess: checkResult[0].is_excess,
                  }
                );
              } else {
                // 非生产类出库 - 从预加载的 stockMap 读取库存
                const stockKey = `${item.material_id}_${locationId}`;
                const currentStock = stockMap.get(stockKey) || 0;

                const beforeQuantity = currentStock > 0 ? currentStock : 0;
                const afterQuantity = beforeQuantity - actualQuantity;

                // 检查库存是否足够
                if (afterQuantity < 0) {
                  logger.warn(
                    `物料 ${item.material_id} 库存不足，当前库存: ${beforeQuantity}，需要: ${actualQuantity}`
                  );
                }

                // 记录库存交易（统一一次写入，不再分库存为零和非零两段重复代码）
                await _insertInventoryLedgerLocal(connection, {
                  material_id: item.material_id,
                  location_id: locationId,
                  transaction_type: dynamicTransactionType,
                  quantity: -actualQuantity,
                  unit_id: item.unit_id,
                  reference_no: outboundInfo[0].outbound_no,
                  reference_type: 'outbound',
                  operator: outboundInfo[0].operator,
                  beforeQuantity,
                  afterQuantity,
                });

                // 更新内存中的库存 Map（后续物料可能引用同一库位）
                stockMap.set(stockKey, afterQuantity);
              }
            }


          } catch (itemError) {
            logger.error(`处理物料 ${item.material_id} 时出错:`, itemError);
            // 不抛出异常，继续处理其他物料项
          }
        }
      }

      // ========== 部分发料支持: 判断是否部分完成并创建缺料记录 ==========
      // 检查是否有缺料
      const [shortageCheck] = await connection.execute(
        `SELECT COUNT(*) as shortage_count
         FROM inventory_outbound_items
         WHERE outbound_id = ? AND shortage_quantity > 0`,
        [id]
      );

      const hasShortage = shortageCheck[0].shortage_count > 0;

      if (hasShortage) {
        // 有缺料,状态改为partial_completed
        await connection.execute(
          "UPDATE inventory_outbound SET status = 'partial_completed' WHERE id = ?",
          [id]
        );

        // 获取出库单号
        const [outboundInfo] = await connection.execute(
          'SELECT outbound_no FROM inventory_outbound WHERE id = ?',
          [id]
        );
        const outboundNo = outboundInfo[0].outbound_no;

        logger.info(`出库单 ${outboundNo} 存在缺料,状态设置为 partial_completed`);

        // 创建缺料记录
        const [shortageItems] = await connection.execute(
          `SELECT
            ioi.id as outbound_item_id,
            ioi.material_id,
            m.code as material_code,
            m.name as material_name,
            m.specs as material_specs,
            ioi.unit_id,
            u.name as unit_name,
            ioi.planned_quantity,
            ioi.actual_quantity,
            ioi.shortage_quantity
           FROM inventory_outbound_items ioi
           LEFT JOIN materials m ON ioi.material_id = m.id
           LEFT JOIN units u ON ioi.unit_id = u.id
           WHERE ioi.outbound_id = ? AND ioi.shortage_quantity > 0`,
          [id]
        );

        for (const item of shortageItems) {
          // 查询当前库存
          const [stockResult] = await connection.execute(
            `SELECT COALESCE(SUM(quantity), 0) as total_quantity
             FROM inventory_ledger
             WHERE material_id = ?`,
            [item.material_id]
          );

          const currentStock = parseFloat(stockResult[0].total_quantity) || 0;

          await connection.execute(
            `INSERT INTO material_shortage_records
              (outbound_id, outbound_no, outbound_item_id, material_id, material_code, material_name, material_specs,
               unit_id, unit_name, planned_quantity, actual_quantity, shortage_quantity, supplied_quantity,
               remaining_quantity, current_stock, status, reference_type, reference_id, reference_no)
             VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'pending', ?, ?, ?)`,
            [
              id,
              outboundNo,
              item.outbound_item_id,
              item.material_id,
              item.material_code,
              item.material_name,
              item.material_specs,
              item.unit_id,
              item.unit_name,
              item.planned_quantity,
              item.actual_quantity,
              item.shortage_quantity,
              item.shortage_quantity,
              currentStock,
              referenceType,
              referenceId,
              referenceId,
            ]
          );
        }

        logger.info(`已为出库单 ${outboundNo} 创建 ${shortageItems.length} 条缺料记录`);

        // 如果关联了生产任务,更新任务状态为material_partial_issued
        if (referenceId && referenceType === 'production_task') {
          await connection.execute('UPDATE production_tasks SET status = ? WHERE id = ?', [
            'material_partial_issued',
            referenceId,
          ]);
          logger.info(`产任务 ${referenceId} 状态已更新为 material_partial_issued`);
        }
      }

      // ========== 重要：在检查缺料并确定最终状态后，才创建生产过程记录 ==========
      // 使用 ProductionProcessService 统一处理生产过程创建逻辑
      if (referenceId && referenceType === 'production_task') {
        try {
          // 获取任务的最终状态
          const [finalTaskStatus] = await connection.execute(
            'SELECT status FROM production_tasks WHERE id = ?',
            [referenceId]
          );

          const actualTaskStatus = finalTaskStatus[0]?.status;

          // 使用服务创建生产过程记录
          const ProductionProcessService = require('../../../services/business/ProductionProcessService');
          const processRemarks =
            actualTaskStatus === STATUS.PRODUCTION_TASK.MATERIAL_PARTIAL_ISSUED
              ? '出库单部分完成后自动创建（部分发料）'
              : '出库单完成后自动创建';

          await ProductionProcessService.createProductionProcessIfNeeded(
            connection,
            referenceId,
            actualTaskStatus,
            processRemarks
          );
        } catch (processError) {
          logger.error('创建生产过程记录失败:', processError);
          // 不阻止主流程继续执行
        }
      }

      // 检查并更新生产任务状态 (全额发料判断)
      const taskIdToCheck =
        productionTaskId || (referenceType === 'production_task' ? referenceId : null);
      if (taskIdToCheck) {
        await checkAndUpdateTaskStatus(connection, taskIdToCheck);
      }

      // ========== 生成领料凭证（已移除） ==========
      // 本系统采用标准的生产完工归集法处理总账
      // 原先在此处单独生成物料凭证会导致当期出库多次记账，已迁移至 CostAccountingService.calculateActualCost 中在完工时一并处理。

      // ========== 计算并更新出库单总金额 ==========
      try {
        const [totalCalc] = await connection.execute(
          `SELECT COALESCE(SUM(oi.actual_quantity * COALESCE(m.cost_price, 0)), 0) as total
           FROM inventory_outbound_items oi
           JOIN materials m ON oi.material_id = m.id
           WHERE oi.outbound_id = ?`,
          [id]
        );
        const totalAmount = parseFloat(totalCalc[0]?.total) || 0;
        if (totalAmount > 0) {
          await connection.execute(
            'UPDATE inventory_outbound SET total_amount = ? WHERE id = ?',
            [totalAmount, id]
          );
          logger.info(`出库单 ${id} 总金额已更新为 ${totalAmount}`);
        }
      } catch (amountError) {
        logger.warn(`计算出库单总金额失败: ${amountError.message}`);
      }
    }


    // ========== 提交事务 ==========
    await connection.commit();

    // ========== 性能优化: 异步处理非关键业务逻辑 ==========
    // 在事务提交后,异步处理成本核算和追溯记录,提升响应速度
    if (newStatus === STATUS.OUTBOUND.COMPLETED) {
      try {
        // 获取出库单信息用于异步任务
        const [outboundData] = await connection.execute(
          'SELECT * FROM inventory_outbound WHERE id = ?',
          [id]
        );

        if (outboundData.length > 0) {
          const outbound = outboundData[0];

          // 异步创建成本分录
          if (businessConfig.performance.asyncCostCalculation) {
            AsyncTaskService.createCostEntryAsync({
              transaction_type: 'production_outbound',
              reference_no: outbound.outbound_no,
              reference_type: 'outbound',
              material_id: null, // 将在服务中处理每个物料
              quantity: 0,
              operator: outbound.operator,
            });
            logger.debug(`[性能优化] 已提交异步成本核算任务: ${outbound.outbound_no}`);
          }

          // 异步创建追溯记录
          if (businessConfig.performance.asyncTraceability) {
            AsyncTaskService.createTraceabilityAsync('production_outbound', {
              outbound_id: id,
              outbound_no: outbound.outbound_no,
              reference_type: outbound.reference_type,
              reference_id: outbound.reference_id,
            });
            logger.debug(`[性能优化] 已提交异步追溯记录任务: ${outbound.outbound_no}`);
          }
        }
      } catch (asyncError) {
        // 异步任务提交失败不影响主流程
        logger.error('[性能优化] 异步任务提交失败:', asyncError);
      }
    }

    ResponseHandler.success(res, null, '出库单状态更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新出库单状态失败:', error);
    ResponseHandler.error(res, '更新出库单状态失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 补发出库单 - 对部分完成的出库单继续发货
const supplementOutbound = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { remark, items } = req.body;

    // 1. 检查原出库单状态
    const [outboundCheck] = await connection.execute(
      'SELECT * FROM inventory_outbound WHERE id = ?',
      [id]
    );

    if (outboundCheck.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '出库单不存在', 'NOT_FOUND', 404);
    }

    const originalOutbound = outboundCheck[0];

    if (originalOutbound.status !== 'partial_completed') {
      await connection.rollback();
      return ResponseHandler.error(res, '只能对部分完成的出库单进行补发', 'BAD_REQUEST', 400);
    }

    // 2. 验证补发物料和数量
    if (!items || items.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '补发物料不能为空', 'BAD_REQUEST', 400);
    }

    // 3. 获取原出库单明细(包含物料名称)
    const [originalItems] = await connection.execute(
      `SELECT ioi.*, m.code as material_code, m.name as material_name
       FROM inventory_outbound_items ioi
       LEFT JOIN materials m ON ioi.material_id = m.id
       WHERE ioi.outbound_id = ?`,
      [id]
    );

    // 3.5 批量获取并验证物料库位信息
    const materialIds = items.map(item => item.material_id);
    let materialInfoMap;
    try {
      materialInfoMap = await InventoryService.getBatchMaterialInfo(materialIds, connection);
    } catch (err) {
      await connection.rollback();
      return ResponseHandler.error(res, err.message, 'BAD_REQUEST', 400);
    }

    // 4. 验证每个补发物料
    for (const item of items) {
      const originalItem = originalItems.find((oi) => oi.id === item.outbound_item_id);

      if (!originalItem) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `物料ID ${item.material_id} 不在原出库单中`,
          'BAD_REQUEST',
          400
        );
      }

      // 检查补发数量不能超过缺料数量
      const shortageQty = parseFloat(originalItem.shortage_quantity || 0);
      const supplementQty = parseFloat(item.quantity);

      if (supplementQty > shortageQty) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `物料 ${originalItem.material_code} - ${originalItem.material_name} 补发数量(${supplementQty})不能超过缺料数量(${shortageQty})`,
          'BAD_REQUEST',
          400
        );
      }

      // 获取物料的默认库位
      const matInfo = materialInfoMap.get(item.material_id);
      const locationId = matInfo.locationId;
      const materialName = `${matInfo.code || ''} - ${matInfo.name || ''}`;

      logger.info(
        `[补发验证] 物料: ${materialName}, 物料ID: ${item.material_id}, 库位ID: ${locationId}, 补发数量: ${supplementQty}`
      );

      // 检查库存是否充足
      const currentStock = await InventoryService.getCurrentStock(
        item.material_id,
        locationId,
        connection
      );

      logger.info(
        `[补发验证] 物料: ${materialName}, 当前库存: ${currentStock}, 需要: ${supplementQty}`
      );

      if (currentStock < supplementQty) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `物料 ${materialName} 库存不足，当前库存: ${currentStock}，需要: ${supplementQty}`,
          'BAD_REQUEST',
          400
        );
      }
    }

    // 5. 更新原出库单明细的actual_quantity和shortage_quantity,并扣减库存
    for (const item of items) {
      const supplementQty = parseFloat(item.quantity);

      await connection.execute(
        `UPDATE inventory_outbound_items
         SET actual_quantity = actual_quantity + ?,
             shortage_quantity = shortage_quantity - ?
         WHERE id = ?`,
        [supplementQty, supplementQty, item.outbound_item_id]
      );

      // 获取物料的默认库位 (直接通过已缓存的信息获取)
      const matInfo = materialInfoMap.get(item.material_id);
      const locationId = matInfo.locationId;
      const materialName = `${matInfo.code || ''} - ${matInfo.name || ''}`;

      // 补发时正常扣减库存
      logger.info(`物料 ${materialName} 补发扣减库存: ${supplementQty}`);

      await InventoryService.updateStock(
        {
          materialId: item.material_id,
          locationId: locationId,
          quantity: -supplementQty,
          transactionType: 'outbound',
          referenceType: 'outbound_supplement',
          referenceNo: originalOutbound.outbound_no + '-补发',
          operator: 'system',
          remark: `补发: ${remark || ''}`,
        },
        connection
      );
    }

    // 6. 检查是否所有物料都已补齐
    const [updatedItems] = await connection.execute(
      'SELECT * FROM inventory_outbound_items WHERE outbound_id = ?',
      [id]
    );

    const allFulfilled = updatedItems.every(
      (item) => parseFloat(item.shortage_quantity || 0) === 0
    );

    // 7. 更新出库单状态
    if (allFulfilled) {
      // 所有物料都已补齐，更新为已完成
      await connection.execute(
        'UPDATE inventory_outbound SET status = ?, remark = CONCAT(COALESCE(remark, ""), " [补发完成]") WHERE id = ?',
        ['completed', id]
      );

      // 更新生产任务状态为已发料
      if (originalOutbound.reference_type === 'production_task' && originalOutbound.reference_id) {
        await connection.execute('UPDATE production_tasks SET status = ? WHERE id = ?', [
          'material_issued',
          originalOutbound.reference_id,
        ]);
        logger.info(
          `生产任务 ${originalOutbound.reference_id} 状态已更新为 material_issued (补发完成)`
        );
      }

      logger.info(`出库单 ${id} 补发完成，状态更新为 completed`);
    } else {
      // 仍有缺料，保持部分完成状态
      await connection.execute(
        'UPDATE inventory_outbound SET remark = CONCAT(COALESCE(remark, ""), " [已补发]") WHERE id = ?',
        [id]
      );
      logger.info(`出库单 ${id} 补发成功，仍有缺料，保持 partial_completed 状态`);
    }

    // ========== 补发后创建生产过程记录（无论是否补齐）==========
    // 使用 ProductionProcessService 统一处理生产过程创建逻辑
    if (originalOutbound.reference_type === 'production_task' && originalOutbound.reference_id) {
      try {
        // 获取任务的当前状态
        const [taskStatus] = await connection.execute(
          'SELECT status FROM production_tasks WHERE id = ?',
          [originalOutbound.reference_id]
        );

        if (taskStatus.length > 0) {
          const currentStatus = taskStatus[0].status;

          // 使用服务创建生产过程记录
          const ProductionProcessService = require('../../../services/business/ProductionProcessService');
          const processRemarks = allFulfilled ? '补发完成后自动创建' : '补发后自动创建（部分发料）';

          await ProductionProcessService.createProductionProcessIfNeeded(
            connection,
            originalOutbound.reference_id,
            currentStatus,
            processRemarks
          );
        }
      } catch (processError) {
        logger.error('补发后创建生产过程记录失败:', processError);
        // 不阻止主流程
      }
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        status: allFulfilled ? 'completed' : 'partial_completed',
      },
      allFulfilled ? '补发成功，出库单已完成' : '补发成功，仍有缺料'
    );
  } catch (error) {
    await connection.rollback();
    logger.error('补发出库单失败:', error);
    ResponseHandler.error(res, '补发出库单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 获取入库单列表 - 优化版本
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
    } = req.query;

    // 开始查询入库单列表

    // 构建查询条件
    let whereClause = 'WHERE 1=1';
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

    // 计算分页
    const pageNum = Math.max(1, parseInt(page));
    const pageSizeNum = Math.max(1, parseInt(pageSize));
    const offset = (pageNum - 1) * pageSizeNum;

    // 获取总记录数
    const [totalResult] = await connection.execute(
      `SELECT COUNT(*) as total FROM inventory_inbound i ${whereClause}`,
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
            (SELECT u.real_name FROM users u WHERE u.username = i.operator LIMIT 1),
            (SELECT u.username FROM users u WHERE u.username = i.operator LIMIT 1),
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
       ${whereClause}
       ORDER BY i.created_at DESC
       LIMIT ${pageSizeNum} OFFSET ${offset}
    `;

    const [rows] = await connection.execute(query, params);

    // 处理状态显示
    const items = rows.map((item) => ({
      ...item,
      status_text: getStatusText(item.status),
    }));

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

// 获取入库单详情 - 优化版本
const getInboundDetail = async (req, res) => {
  const startTime = Date.now();
  const connection = await db.pool.getConnection();
  try {
    const { id } = req.params;

    // 查询入库单详情

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

    const inboundDetail = {
      ...inboundResult[0],
      items: itemsResult,
      status_text: getStatusText(inboundResult[0].status),
    };

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

    const {
      inbound_date,
      location_id,
      status,
      operator,
      remark = null,
      items,
      // 新增字段：入库类型和关联单据
      inbound_type = 'other',
      reference_type = null,
      reference_id = null,
      reference_no = null,
    } = req.body;

    // 使用统一的字段名：location_id
    const warehouseId = location_id;

    // 验证必填字段
    if (!inbound_date || !warehouseId || !status || !operator || !items || items.length === 0) {
      throw new Error('缺少必填字段：入库日期、仓库、状态、操作员、物料项不能为空');
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

    // 生成入库单号，退料单使用TL前缀
    const dateStr = inbound_date.replace(/-/g, '');
    const prefix = inbound_type === 'production_return' ? 'TL' : 'RK';
    const [result] = await connection.execute(
      'SELECT MAX(inbound_no) as max_no FROM inventory_inbound WHERE inbound_no LIKE ?',
      [`${prefix}${dateStr}%`]
    );
    const maxNo = result[0].max_no || `${prefix}${dateStr}000`;
    const inbound_no = `${prefix}${dateStr}${(parseInt(maxNo.slice(-3)) + 1).toString().padStart(3, '0')}`;

    // 插入入库单主表（包含入库类型和关联信息）
    const [inboundResult] = await connection.execute(
      `INSERT INTO inventory_inbound
       (inbound_no, inbound_date, inbound_type, reference_type, reference_id, reference_no, location_id, status, operator, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ]
    );

    const inboundId = inboundResult.insertId;

    // 批量预取所有物料信息（消除循环内 N+1 查询）
    const inboundMaterialIds = items.map(i => i.material_id);
    const inboundMaterialInfoMap = await InventoryService.getBatchMaterialInfo(inboundMaterialIds, connection);

    // 插入入库单明细
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

      // 更新库存
      if (status === STATUS.INBOUND.COMPLETED) {
        // 检查库存是否存在
        const [stockResult] = await connection.execute(
          'SELECT material_id, location_id, SUM(il.quantity) as quantity FROM inventory_ledger il JOIN materials mat ON il.material_id = mat.id WHERE il.material_id = ? AND il.location_id = ? AND (mat.location_id IS NULL OR il.location_id = mat.location_id) GROUP BY material_id, location_id HAVING SUM(quantity) > 0',
          [item.material_id, itemLocationId]
        );

        let beforeQuantity = 0;
        let afterQuantity = 0;

        if (stockResult.length === 0) {
          // 创建新的库存记录
          beforeQuantity = 0;
          afterQuantity = parseFloat(item.quantity);

          await connection.execute(
            'INSERT INTO inventory_ledger (material_id, location_id, quantity) VALUES (?, ?, ?)',
            [item.material_id, itemLocationId, afterQuantity]
          );
        } else {
          // 更新现有库存
          beforeQuantity = parseFloat(stockResult[0].quantity);
          afterQuantity = beforeQuantity + parseFloat(item.quantity);

          await connection.execute('UPDATE inventory_ledger SET quantity = ? WHERE id = ?', [
            afterQuantity,
            stockResult[0].id,
          ]);
        }

        // 从批量预取结果获取物料价格（消除循环内 N+1 查询）
        const unitPrice = matInfo.price || 0;
        const _itemAmount = parseFloat(item.quantity) * unitPrice;

        await _insertInventoryLedgerLocal(connection, {
          material_id: item.material_id,
          location_id: itemLocationId, // 修复 Bug: 把 inboundId 或表头 location_id 强转为 itemLocationId
          transaction_type: inbound_type === 'production_return' ? 'production_return' : (inbound_type.includes('_') ? inbound_type : `${inbound_type}_inbound`),
          quantity: parseFloat(item.quantity),
          unit_id: unitId,
          reference_no: inbound_no,
          reference_type: 'inbound',
          operator: operator,
          beforeQuantity: beforeQuantity,
          afterQuantity: afterQuantity,
        });
      }
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
    ResponseHandler.error(res, '创建入库单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 从质检单创建入库单
const createInboundFromQuality = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { inbound_date, location_id, operator, remark, items, inspection_id, inspection_no } =
      req.body;

    // 验证必填字段
    if (!inbound_date || !location_id || !operator || !items || items.length === 0) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    // ===== 年度结存校验 =====
    const PeriodValidationService = require('../../../services/business/PeriodValidationService');
    const inventoryCheck = await PeriodValidationService.validateInventoryTransaction(inbound_date);
    if (!inventoryCheck.allowed) {
      await connection.rollback();
      return res.status(400).json({ error: inventoryCheck.message });
    }
    // ===== 年度结存校验结束 =====

    // 检查质检单状态是否合格
    if (inspection_id) {
      const [inspectionResult] = await connection.execute(
        'SELECT id, status, inspection_no FROM quality_inspections WHERE id = ?',
        [inspection_id]
      );

      if (inspectionResult.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: '质检单不存在' });
      }

      if (inspectionResult[0].status !== 'passed') {
        await connection.rollback();
        return res.status(400).json({ error: '只有质检合格的单据才能生成入库单' });
      }
    }

    // 生成入库单号
    const dateStr = inbound_date.replace(/-/g, '');
    const [result] = await connection.execute(
      'SELECT MAX(inbound_no) as max_no FROM inventory_inbound WHERE inbound_no LIKE ?',
      [`RK${dateStr}%`]
    );
    const maxNo = result[0].max_no || `RK${dateStr}000`;
    const inbound_no = `RK${dateStr}${(parseInt(maxNo.slice(-3)) + 1).toString().padStart(3, '0')}`;

    // 创建入库单
    const [inboundResult] = await connection.execute(
      'INSERT INTO inventory_inbound (inbound_no, inbound_date, location_id, operator, status, remark, inspection_id, inspection_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
      [
        inbound_no,
        inbound_date,
        location_id,
        operator,
        'draft',
        remark || null,
        inspection_id || null,
        inspection_no || null,
      ]
    );

    const inbound_id = inboundResult.insertId;

    // 从质检单获取产品信息
    let productId = null;
    let productCode = null;
    let productName = null;

    if (inspection_id) {
      const [inspectionInfo] = await connection.execute(
        'SELECT inspection_type, product_id, product_name, product_code, quantity, qualified_quantity, unit FROM quality_inspections WHERE id = ?',
        [inspection_id]
      );

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
            'SELECT id, location_id, unit_id FROM materials WHERE id = ?',
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
                'UPDATE inventory_inbound SET location_id = ? WHERE id = ?',
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
                  return res.status(400).json({ error: '物料明细字段不完整或无效' });
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
        return res.status(400).json({ error: '物料明细字段不完整或无效' });
      }

      // 检查material_id是否存在于materials表中
      const [materialCheck] = await connection.execute('SELECT id FROM materials WHERE id = ?', [
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

        // 只有在没有找到对应产品代码的物料时才执行这一部分
        if (!foundMaterial) {
          // 如果没有找到对应的产品代码或通过产品代码找不到物料，尝试通过名称或编码前缀查找
          const [defaultMaterial] = await connection.execute(
            'SELECT id FROM materials WHERE name LIKE ? OR code LIKE ? OR code LIKE ? LIMIT 1',
            ['%成品%', '%FP%', '%CP%']
          );

          if (defaultMaterial.length > 0) {
            validMaterialId = defaultMaterial[0].id;
          } else {
            // 如果找不到特定命名的物料，使用系统中的任意物料
            const [anyMaterial] = await connection.execute('SELECT id FROM materials LIMIT 1');

            if (anyMaterial.length > 0) {
              validMaterialId = anyMaterial[0].id;
            } else {
              await connection.rollback();
              return res.status(400).json({
                error: `物料ID ${material_id} 不存在，且无法找到替代物料`,
              });
            }
          }
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
    return res.status(500).json({ error: '服务器错误' });
  } finally {
    connection.release();
  }
};

// 更新入库单状态
const updateInboundStatus = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { newStatus } = req.body;

    // 验证入库单ID是否为有效数字
    if (!id || isNaN(parseInt(id))) {
      logger.error('无效的入库单ID:', id);
      throw new Error('无效的入库单ID');
    }

    // 验证状态值
    const validStatuses = ['draft', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(newStatus)) {
      logger.error('无效的状态值:', newStatus);
      throw new Error('无效的状态值');
    }

    // 获取当前入库单信息
    const [inboundData] = await connection.execute('SELECT * FROM inventory_inbound WHERE id = ?', [
      id,
    ]);

    if (inboundData.length === 0) {
      logger.error('入库单不存在, ID:', id);
      throw new Error(`入库单不存在 (ID: ${id})`);
    }

    const currentStatus = inboundData[0].status;

    // 检查状态转换是否有效
    const validTransitions = {
      draft: ['confirmed', 'cancelled'],
      confirmed: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[currentStatus].includes(newStatus) && currentStatus !== newStatus) {
      logger.error('无效的状态转换:', { from: currentStatus, to: newStatus });
      throw new Error(`无法从 "${currentStatus}" 状态转换为 "${newStatus}" 状态`);
    }

    // 更新状态
    await connection.execute('UPDATE inventory_inbound SET status = ? WHERE id = ?', [
      newStatus,
      id,
    ]);

    // 如果状态变更为已完成，更新库存
    if (newStatus === STATUS.INBOUND.COMPLETED) {
      // 调用抽离好的服务完成核心入库逻辑以及所有副产物（如NCP生成、批次溯源等）
      await InboundTransactionService.confirmInbound(
        connection, 
        id, 
        inboundData[0].operator || 'system', 
        inboundData[0]
      );

    }

    await connection.commit();
    ResponseHandler.success(res, null, '入库单状态更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新入库单状态失败:', error);
    ResponseHandler.error(res, '更新入库单状态失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 获取物料列表 - 从baseData获取
const getMaterialsList = async (req, res) => {
  try {
    // 从请求中获取参数
    const { search = '', category_id = '' } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      whereClause += ' AND (m.name LIKE ? OR m.code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (category_id) {
      whereClause += ' AND m.category_id = ?';
      params.push(category_id);
    }

    // 查询物料列表
    const query = `
      SELECT 
        m.id,
        m.code,
        m.name,
        m.specs as specification,
        m.category_id,
        c.name as category_name,
        m.unit_id,
        u.name as unit_name,
        m.price,
        COALESCE(s.location_id, 1) as location_id, 
        COALESCE(l.name, '默认仓库') as location_name
      FROM 
        materials m
      LEFT JOIN 
        categories c ON m.category_id = c.id
      LEFT JOIN 
        units u ON m.unit_id = u.id
      LEFT JOIN ${STOCK_SUBQUERY} s ON m.id = s.material_id
      LEFT JOIN
        locations l ON s.location_id = l.id
      ${whereClause}
      GROUP BY m.id
      ORDER BY m.code
      LIMIT 50
    `;

    const [materials] = await db.pool.execute(query, params);

    // 直接返回数组，而不是包装在对象中
    ResponseHandler.success(res, materials, '获取物料列表成功');
  } catch (error) {
    logger.error('获取物料列表失败:', error);
    ResponseHandler.error(res, '获取物料列表失败', 'SERVER_ERROR', 500, error);
  }
};

// 调整库存
const adjustStock = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { materialId, locationId, quantity, type, remark } = req.body;

    // 验证必填字段
    if (!materialId || !locationId || !quantity) {
      throw new Error('物料ID、仓库ID和数量为必填项');
    }

    // 根据调整类型计算实际数量变化
    let actualQuantity = parseFloat(quantity);

    if (type === 'out') {
      // 调整出库：确保数量为负数
      actualQuantity = -Math.abs(actualQuantity);
    } else {
      // 调整入库：确保数量为正数
      actualQuantity = Math.abs(actualQuantity);
    }

    // 使用新的库存服务获取当前库存
    const beforeQuantity = await InventoryService.getCurrentStock(
      materialId,
      locationId,
      connection,
      true
    );

    let changeQuantity;
    let afterQuantity;
    let adjustedTransactionType;

    // 计算变动数量和事务类型
    if (type === 'out') {
      // 调整出库：减少库存
      changeQuantity = -Math.abs(actualQuantity);
      afterQuantity = beforeQuantity + changeQuantity;
      adjustedTransactionType = 'adjustment_out';

      // 检查库存不足
      if (afterQuantity < 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `库存不足，当前库存: ${beforeQuantity}，需要: ${Math.abs(changeQuantity)}`,
        });
      }
    } else {
      // 调整入库：增加库存
      changeQuantity = Math.abs(actualQuantity);
      afterQuantity = beforeQuantity + changeQuantity;
      adjustedTransactionType = 'adjustment_in';
    }

    // 获取操作员信息
    const operator = req.user ? req.user.username : 'system';

    // 生成调整单号
    const adjustmentNo = await CodeGenerators.generateAdjustmentCode(connection);

    // 使用新的库存服务更新库存
    const result = await InventoryService.updateStock(
      {
        materialId,
        locationId,
        quantity: changeQuantity,
        transactionType: adjustedTransactionType,
        referenceNo: adjustmentNo,
        referenceType: 'manual_adjustment',
        operator,
        remark: remark || '',
      },
      connection
    );

    const transactionResult = { insertId: result.transactionId };

    await connection.commit();

    // 自动生成财务分录（异步处理，不影响主流程）
    setImmediate(async () => {
      try {
        const InventoryCostService = require('../../../services/business/InventoryCostService');
        const transactionData = {
          id: transactionResult.insertId,
          material_id: materialId,
          location_id: locationId,
          transaction_type: adjustedTransactionType, // 使用正确的事务类型
          quantity: changeQuantity, // 使用实际变动量
          reference_no: adjustmentNo, // 使用生成的调整单号
          reference_type: 'inventory_adjustment',
        };

        if (changeQuantity > 0) {
          await InventoryCostService.generateInboundCostEntry(transactionData);
        } else {
          await InventoryCostService.generateOutboundCostEntry(transactionData);
        }
      } catch (error) {
        logger.error('生成库存调整财务分录失败:', error);
        // 不影响主流程
      }
    });

    ResponseHandler.success(
      res,
      {
        id: result.transactionId,
        materialId,
        locationId,
        beforeQuantity: result.beforeQuantity,
        afterQuantity: result.afterQuantity,
        adjustQuantity: Math.abs(changeQuantity),
        adjustType: type,
      },
      '库存调整成功'
    );
  } catch (error) {
    await connection.rollback();
    logger.error('调整库存失败:', error);
    ResponseHandler.error(res, '调整库存失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 通过物料ID获取库存交易记录 - 统一API方案
// 注意：此API现在内部调用getInventoryLedger，确保两个API使用相同的计算逻辑
// 这样避免了重复代码维护，防止数据不一致的问题
const getMaterialRecords = async (req, res) => {
  try {
    const { id } = req.params;

    // 先加载业务类型缓存
    await loadBusinessTypeCache();

    // 验证物料ID是否存在
    const checkMaterialQuery = `
      SELECT id, code, name FROM materials WHERE id = ?
    `;
    const [checkMaterialResult] = await db.pool.execute(checkMaterialQuery, [id]);

    if (checkMaterialResult.length === 0) {
      return ResponseHandler.error(res, '物料不存在', 'NOT_FOUND', 404);
    }

    // 重定向到getInventoryLedger，使用统一的逻辑
    // 修改req.query来匹配getInventoryLedger的参数格式
    const locationIdParam = req.query.locationId || '';
    req.query = {
      ...req.query,
      materialId: id,
      locationId: locationIdParam, // 透传仓库过滤条件
      page: 1,
      pageSize: 1000, // 获取所有记录
      startDate: '1900-01-01', // 获取所有历史记录
      endDate: '2099-12-31',
    };

    // 创建一个包装的res对象来转换响应格式
    const originalJson = res.json.bind(res);
    const originalStatus = res.status.bind(res);
    let statusCode = 200;
    const capturedData = null;

    // 拦截 status 方法
    res.status = function (code) {
      statusCode = code;
      return originalStatus(code);
    };

    // 拦截 json 方法
    res.json = function (responseData) {
      // 如果是成功响应
      if (statusCode === 200 && responseData && responseData.success && responseData.data) {
        const innerData = responseData.data;

        // 如果有items数据
        if (innerData.items && Array.isArray(innerData.items)) {
          // 转换数据格式以匹配原有的getMaterialRecords格式
          const records = innerData.items.map((item) => ({
            id: item.id,
            date: item.date,
            transaction_type: item.transactionType,
            type: getInventoryTransactionTypeText(item.transactionType),
            batch_number: item.batchNumber || '',
            quantity: item.quantity,
            before_quantity: item.beforeQuantity,
            after_quantity: item.afterQuantity,
            reference_no: item.documentNo,
            reference_type: 'ledger',
            operator: item.operatorName || item.operator || '系统',
            operator_name: item.operatorName || item.operator || '系统',
            remark: item.remark || '',
            source_table: 'ledger',
          }));

          // 直接返回数组格式，让前端可以直接使用
          return originalJson(records);
        } else {
          // 如果没有items，返回空数组
          return originalJson([]);
        }
      } else if (statusCode === 200) {
        // 如果是成功但数据格式不对，返回空数组
        return originalJson([]);
      } else {
        // 如果是错误响应，保持原样
        return originalJson(responseData);
      }
    };

    // 调用getInventoryLedger，它会使用我们包装的res.json
    return await getInventoryLedger(req, res);
  } catch (error) {
    logger.error('获取物料库存记录失败:', error);
    ResponseHandler.error(res, '获取物料库存记录失败', 'SERVER_ERROR', 500, error);
  }
};

// 注：交易类型文本转换已统一使用 systemConstants.getInventoryTransactionTypeText()
// 本文件通过顶部 import 引入，不再维护重复的私有函数

// 业务类型缓存
let businessTypeCache = null;
let businessTypeCacheTime = 0;
const BUSINESS_TYPE_CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

// 加载业务类型缓存
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
const _getStockStatistics = async (req, res) => {
  try {
    const connection = await db.pool.getConnection();
    try {
      // 合并查询所有统计数据，减少数据库交互
      const [statsResult] = await connection.execute(`
        SELECT 
          (SELECT COUNT(id) FROM materials) as total_items,
          (SELECT COUNT(id) FROM locations) as total_locations,
          SUM(CASE WHEN max_qty < safety_stock OR max_qty IS NULL THEN 1 ELSE 0 END) as low_stock,
          SUM(CASE WHEN max_qty IS NULL OR max_qty <= 0 THEN 1 ELSE 0 END) as out_of_stock
        FROM (
          SELECT m.id, MAX(s.quantity) as max_qty, m.safety_stock
          FROM materials m
          LEFT JOIN (
            SELECT il.material_id, il.location_id, SUM(il.quantity) as quantity
            FROM inventory_ledger il 
            JOIN materials mat ON il.material_id = mat.id 
            WHERE mat.location_id IS NULL OR il.location_id = mat.location_id 
            GROUP BY il.material_id, il.location_id
          ) s ON m.id = s.material_id
          GROUP BY m.id, m.safety_stock
        ) AS stock_summary
      `);

      const statistics = {
        totalItems: statsResult[0].total_items || 0,
        totalLocations: statsResult[0].total_locations || 0,
        lowStock: statsResult[0].low_stock || 0,
        outOfStock: statsResult[0].out_of_stock || 0,
      };

      ResponseHandler.success(res, statistics, '获取库存统计成功');
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('获取库存统计数据失败:', error);
    ResponseHandler.error(res, '获取库存统计数据失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取库存流水列表
const getTransactionList = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const {
      page = 1,
      pageSize = 10,
      startDate,
      endDate,
      materialName = '',
      transactionType = '',
      locationId = '',
      sortField = 'inventory_ledger.created_at',
      sortOrder = 'DESC',
    } = req.query;

    // 安全性：验证排序字段和排序方向
    const allowedSortFields = [
      'inventory_ledger.created_at',
      'inventory_ledger.transaction_type',
      'inventory_ledger.quantity',
      'materials.name',
      'materials.code',
      'locations.name',
    ];
    const allowedSortOrders = ['ASC', 'DESC'];

    const safeSortField = allowedSortFields.includes(sortField)
      ? sortField
      : 'inventory_ledger.created_at';
    const safeSortOrder = allowedSortOrders.includes(sortOrder.toUpperCase())
      ? sortOrder.toUpperCase()
      : 'DESC';

    // 处理库存流水查询请求

    // 安全性：验证和清理输入参数
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSizeNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 10000); // 限制最大页面大小为10000
    const offset = (pageNum - 1) * pageSizeNum;
    const limit = pageSizeNum;

    // 验证日期格式
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return ResponseHandler.error(res, '开始日期格式无效', 'BAD_REQUEST', 400);
    }
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return ResponseHandler.error(res, '结束日期格式无效', 'BAD_REQUEST', 400);
    }

    // 验证物料名称长度
    if (materialName && materialName.length > 100) {
      return ResponseHandler.error(res, '物料名称过长', 'BAD_REQUEST', 400);
    }

    // 验证交易类型 - 动态从数据库获取
    if (transactionType) {
      const isValid = await BusinessTypeService.isValidCode(transactionType);
      if (!isValid) {
        return ResponseHandler.error(res, '无效的交易类型', 'BAD_REQUEST', 400);
      }
    }

    // 验证位置ID
    if (locationId && (isNaN(parseInt(locationId)) || parseInt(locationId) <= 0)) {
      return ResponseHandler.error(res, '无效的位置ID', 'BAD_REQUEST', 400);
    }

    // 构建查询条件 - 使用新的单表架构
    const conditions = [];
    const params = [];

    if (startDate && endDate) {
      conditions.push('inventory_ledger.created_at BETWEEN ? AND ?');
      params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    }

    if (materialName) {
      // 如果输入的是纯数字或看起来像物料编码，优先进行精确匹配
      if (/^[0-9]+$/.test(materialName.trim())) {
        conditions.push('materials.code = ?');
        params.push(materialName.trim());
      } else {
        // 否则进行模糊匹配
        conditions.push('(materials.name LIKE ? OR materials.code LIKE ?)');
        params.push(`%${materialName}%`, `%${materialName}%`);
      }
    }

    if (transactionType) {
      conditions.push('inventory_ledger.transaction_type = ?');
      params.push(transactionType);
    }

    if (locationId) {
      conditions.push('inventory_ledger.location_id = ?');
      params.push(locationId);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // 查询总记录数 - 使用新的单表架构
    const [countResult] = await connection.query(
      `SELECT COUNT(*) as total
       FROM inventory_ledger
       LEFT JOIN materials ON inventory_ledger.material_id = materials.id
       ${whereClause}`,
      params
    );

    const total = countResult[0].total;

    // 查询流水数据 - 使用新的单表架构
    const query = `
      SELECT
        inventory_ledger.id,
        inventory_ledger.material_id as materialId,
        materials.code as materialCode,
        materials.name as materialName,
        inventory_ledger.location_id as locationId,
        locations.name as locationName,
        inventory_ledger.transaction_type as transactionType,
        inventory_ledger.quantity,
        inventory_ledger.unit_id as unitId,
        units.name as unitName,
        inventory_ledger.reference_no as referenceNo,
        inventory_ledger.reference_type as referenceType,
        CASE 
          WHEN inventory_ledger.operator = 'system' THEN '系统'
          ELSE COALESCE(users.real_name, users.username, inventory_ledger.operator)
        END as operator,
        inventory_ledger.remark as remarks,
        inventory_ledger.before_quantity as beforeQuantity,
        inventory_ledger.after_quantity as afterQuantity,
        inventory_ledger.transaction_no as transactionNo,
        DATE_FORMAT(inventory_ledger.created_at, '%Y-%m-%d %H:%i:%s') as transactionTime,
        inventory_ledger.created_at as createdAt,
        'ledger' as source_table
      FROM
        inventory_ledger
      LEFT JOIN
        materials ON inventory_ledger.material_id = materials.id
      LEFT JOIN
        locations ON inventory_ledger.location_id = locations.id
      LEFT JOIN
        units ON inventory_ledger.unit_id = units.id
      LEFT JOIN
        users ON inventory_ledger.operator = users.username
      ${whereClause}
      ORDER BY ${safeSortField} ${safeSortOrder}
      LIMIT ${limit} OFFSET ${offset}
    `;

    // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    const [transactions] = await connection.query(query, params);

    // 处理数据 - 添加交易类型名称
    const formattedTransactions = transactions.map((trans) => {
      // 根据交易类型添加交易类型名称，特殊处理采购退货
      let transactionTypeName;
      if (trans.transactionType === 'purchase_return') {
        transactionTypeName = '采购退货';
      } else {
        transactionTypeName = getInventoryTransactionTypeText(trans.transactionType);
      }

      // 统一格式转换，确保数字字段是数字而不是字符串，但保留null和undefined
      const beforeQuantity =
        trans.beforeQuantity !== null && trans.beforeQuantity !== undefined
          ? parseFloat(trans.beforeQuantity)
          : trans.beforeQuantity;
      const afterQuantity =
        trans.afterQuantity !== null && trans.afterQuantity !== undefined
          ? parseFloat(trans.afterQuantity)
          : trans.afterQuantity;

      return {
        ...trans,
        quantity: parseFloat(trans.quantity || 0),
        beforeQuantity,
        afterQuantity,
        amount: 0,
        transactionTypeText: transactionTypeName,
        transactionNo: trans.transactionNo || trans.referenceNo || '未知', // 优先使用transaction_no，其次使用reference_no
      };
    });

    // 性能优化：inventory_ledger 表已存储 before_quantity / after_quantity，
    // 直接使用 SQL 查询结果，不再逐物料查全量历史重算（消除 N+1 查询）。

    // 获取统计信息 - 重新计算正确的统计数据
    // 修改统计查询条件，移除materials表的引用，只保留inventory_ledger表的条件
    const statsConditions = [];
    const statsParams = [];

    if (startDate && endDate) {
      statsConditions.push('created_at BETWEEN ? AND ?');
      statsParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    }

    if (materialName) {
      statsConditions.push(
        'material_id IN (SELECT id FROM materials WHERE name LIKE ? OR code LIKE ?)'
      );
      statsParams.push(`%${materialName}%`, `%${materialName}%`);
    }

    if (transactionType) {
      statsConditions.push('transaction_type = ?');
      statsParams.push(transactionType);
    }

    if (locationId) {
      statsConditions.push('location_id = ?');
      statsParams.push(locationId);
    }

    const whereClauseForStats =
      statsConditions.length > 0 ? 'WHERE ' + statsConditions.join(' AND ') : '';

    // 查询所有统计数据 - 使用新的单表架构
    const [statsResult] = await connection.query(
      `SELECT
         COUNT(*) as totalTransactions,
         SUM(CASE
           WHEN LOWER(transaction_type) IN ('inbound', 'in', 'transfer_in', '入库', '调拨入库') THEN 1
           ELSE 0
         END) as inboundCount,
         SUM(CASE
           WHEN LOWER(transaction_type) IN ('outbound', 'out', 'transfer_out', '出库', '调拨出库') THEN 1
           ELSE 0
         END) as outboundCount,
         SUM(CASE
           WHEN LOWER(transaction_type) IN ('transfer', 'transfer_in', 'transfer_out', '调拨', '调拨入库', '调拨出库') THEN 1
           ELSE 0
         END) as transferCount,
         SUM(CASE
           WHEN LOWER(transaction_type) = 'check' OR LOWER(transaction_type) = '盘点' THEN 1
           ELSE 0
         END) as checkCount,
         SUM(ABS(quantity)) as totalQuantity,
         COUNT(DISTINCT operator) as uniqueOperators
       FROM inventory_ledger
       ${whereClauseForStats}`,
      statsParams
    );

    // 处理统计数据
    // 如果有交易类型筛选，在这里进行过滤
    let _filteredTransactions = formattedTransactions;
    if (transactionType) {
      _filteredTransactions = formattedTransactions.filter(
        (trans) => trans.transactionType === transactionType
      );
    }

    const statistics = {
      totalTransactions: parseInt(statsResult[0].totalTransactions || 0),
      inboundCount: parseInt(statsResult[0].inboundCount || 0),
      outboundCount: parseInt(statsResult[0].outboundCount || 0),
      transferCount: parseInt(statsResult[0].transferCount || 0),
      checkCount: parseInt(statsResult[0].checkCount || 0),
      totalQuantity: parseFloat(statsResult[0].totalQuantity || 0),
      uniqueOperators: parseInt(statsResult[0].uniqueOperators || 0),
      totalAmount: 0,
    };

    // 返回处理后的数据
    ResponseHandler.success(
      res,
      {
        items: formattedTransactions,
        total: parseInt(total),
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        statistics,
      },
      '获取库存流水列表成功'
    );
  } catch (error) {
    logger.error('获取库存流水列表失败:', error);

    // 根据错误类型返回不同的错误信息
    let errorMessage = '获取库存流水列表失败';
    let statusCode = 500;

    if (error.code === 'ER_BAD_FIELD_ERROR') {
      errorMessage = '查询字段错误';
      statusCode = 400;
    } else if (error.code === 'ER_NO_SUCH_TABLE') {
      errorMessage = '数据表不存在';
      statusCode = 500;
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = '数据库连接失败';
      statusCode = 503;
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      ...(process.env.NODE_ENV !== 'production' && { error: error.message }),
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// 获取库存流水统计数据
const getTransactionStats = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const {
      startDate,
      endDate,
      materialName = '',
      transactionType = '',
      locationId = '',
    } = req.query;

    // 构建查询条件
    const conditions = [];
    const params = [];

    if (startDate && endDate) {
      conditions.push('t.created_at BETWEEN ? AND ?');
      params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    }

    if (materialName) {
      conditions.push('(m.name LIKE ? OR m.code LIKE ?)');
      params.push(`%${materialName}%`, `%${materialName}%`);
    }

    if (transactionType) {
      conditions.push('t.transaction_type = ?');
      params.push(transactionType);
    }

    if (locationId) {
      conditions.push('t.location_id = ?');
      params.push(locationId);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // 1. 交易类型分布
    const [typeDistribution] = await connection.query(
      `SELECT
         t.transaction_type as type,
         COUNT(*) as count,
         SUM(t.quantity) as totalQuantity
       FROM inventory_ledger t
       LEFT JOIN materials m ON t.material_id = m.id
       ${whereClause}
       GROUP BY t.transaction_type`,
      params
    );

    // 2. 交易金额统计（按月分组）
    const [amountStats] = await connection.query(
      `SELECT
         DATE_FORMAT(t.created_at, '%Y-%m') as month,
         COUNT(*) as count
       FROM inventory_ledger t
       LEFT JOIN materials m ON t.material_id = m.id
       ${whereClause}
       GROUP BY DATE_FORMAT(t.created_at, '%Y-%m')
       ORDER BY month`,
      params
    );

    // 3. 交易趋势数据
    // 获取日期范围
    const startDateObj = startDate ? new Date(startDate) : new Date();
    const endDateObj = endDate ? new Date(endDate) : new Date();

    if (!startDate) {
      startDateObj.setDate(startDateObj.getDate() - 30); // 默认30天
    }

    const dateRange = [];
    const currentDate = new Date(startDateObj);

    while (currentDate <= endDateObj) {
      dateRange.push(new Date(currentDate).toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // 按日期查询各类型的交易数量 - 使用新的单表架构
    const [trendData] = await connection.query(
      `SELECT
         DATE(t.created_at) as date,
         t.transaction_type,
         COUNT(*) as count
       FROM inventory_ledger t
       LEFT JOIN materials m ON t.material_id = m.id
       ${whereClause}
       GROUP BY DATE(t.created_at), t.transaction_type
       ORDER BY date`,
      params
    );

    // 组织趋势数据 - 确保包含所有可能的交易类型
    const trend = {
      dates: dateRange,
      inbound: Array(dateRange.length).fill(0),
      outbound: Array(dateRange.length).fill(0),
      transfer: Array(dateRange.length).fill(0),
      check: Array(dateRange.length).fill(0),
      other: Array(dateRange.length).fill(0),
    };

    // 处理趋势数据
    for (const item of trendData) {
      // 处理日期 - 支持多种日期格式
      let dateStr;
      if (item.date) {
        if (typeof item.date === 'string') {
          // 如果已经是字符串，直接使用
          dateStr = item.date.split(' ')[0]; // 去除时间部分
        } else if (typeof item.date.toISOString === 'function') {
          // 如果是Date对象
          dateStr = item.date.toISOString().split('T')[0];
        } else if (item.date instanceof Date) {
          // 兼容处理
          dateStr = item.date.toISOString().split('T')[0];
        }

        if (dateStr) {
          const dateIndex = dateRange.indexOf(dateStr);

          if (dateIndex !== -1) {
            const transType = item.transaction_type || 'other';
            const count = parseInt(item.count || 0);

            // 将具体的交易类型映射到分类
            if (
              [
                'inbound',
                'in',
                'purchase_inbound',
                'production_inbound',
                'outsourced_inbound',
                'sales_return',
                'purchase_return',
                'sales_exchange_return',
                'adjustment_in',
                'manual_in',
                'other_inbound',
                'production_return'
              ].includes(transType)
            ) {
              trend.inbound[dateIndex] += count;
            } else if (
              [
                'outbound',
                'out',
                'sales_outbound',
                'production_outbound',
                'outsourced_outbound',
                'sale',
                'sales_exchange_out',
                'adjustment_out',
                'manual_out',
                'other_outbound'
              ].includes(transType)
            ) {
              trend.outbound[dateIndex] += count;
            } else if (['transfer', 'transfer_in', 'transfer_out'].includes(transType)) {
              trend.transfer[dateIndex] += count;
            } else if (['check'].includes(transType)) {
              trend.check[dateIndex] += count;
            } else {
              trend.other[dateIndex] += count;
            }
          }
        }
      }
    }

    // 处理类型分布数据为饼图格式
    const typeDistributionData = typeDistribution.map((item) => ({
      name: getInventoryTransactionTypeText(item.type),
      value: parseInt(item.count),
    }));

    // 处理统计数据为柱状图格式
    const amountStatsData = amountStats.map((item) => ({
      name: item.month,
      value: parseInt(item.count || 0),
    }));

    ResponseHandler.success(
      res,
      {
        typeDistribution: typeDistributionData,
        amountStats: amountStatsData,
        trend,
      },
      '获取库存流水统计数据成功'
    );
  } catch (error) {
    logger.error('获取库存流水统计数据失败:', error);
    ResponseHandler.error(res, '获取库存流水统计数据失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 使用统一的常量文件中的函数

// 导出库存报表
const exportInventoryReport = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const {
      reportType = 'summary',
      materialName = '',
      categoryId = '',
      locationId = '',
      startDate = '',
      endDate = '',
    } = req.query;

    // 构建查询条件
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (materialName) {
      whereClause += ' AND (m.name LIKE ? OR m.code LIKE ?)';
      params.push(`%${materialName}%`, `%${materialName}%`);
    }

    if (categoryId) {
      whereClause += ' AND m.category_id = ?';
      params.push(categoryId);
    }

    if (locationId) {
      whereClause += ' AND s.location_id = ?';
      params.push(locationId);
    }

    let query = '';
    let reportData = [];

    if (reportType === 'summary') {
      // 库存汇总报表（字段名使用驼峰命名）
      query = `
        SELECT
          m.code as materialCode,
          m.name as materialName,
          m.specs as specification,
          c.name as categoryName,
          COALESCE(SUM(s.quantity), 0) as quantity,
          u.name as unitName,
          m.price as unitPrice,
          COALESCE(SUM(s.quantity * m.price), 0) as totalValue,
          COUNT(DISTINCT s.location_id) as locationCount,
          m.min_stock as safetyStock
        FROM materials m
        LEFT JOIN ${STOCK_SUBQUERY} s ON m.id = s.material_id
        LEFT JOIN categories c ON m.category_id = c.id
        LEFT JOIN units u ON m.unit_id = u.id
        ${whereClause}
        GROUP BY m.id, m.code, m.name, m.specs, c.name, m.price, u.name, m.min_stock
        ORDER BY m.code
      `;
    } else if (reportType === 'location') {
      // 库存分布报表（字段名使用驼峰命名）
      query = `
        SELECT
          m.code as materialCode,
          m.name as materialName,
          m.specs as specification,
          c.name as categoryName,
          l.name as locationName,
          COALESCE(s.quantity, 0) as quantity,
          u.name as unitName,
          m.price as unitPrice,
          COALESCE(s.quantity * m.price, 0) as totalValue,
          DATE_FORMAT(s.updated_at, '%Y-%m-%d %H:%i:%s') as lastMoveDate
        FROM materials m
        LEFT JOIN ${STOCK_SUBQUERY} s ON m.id = s.material_id
        LEFT JOIN categories c ON m.category_id = c.id
        LEFT JOIN locations l ON s.location_id = l.id
        LEFT JOIN units u ON m.unit_id = u.id
        ${whereClause}
        ORDER BY m.code, l.name
      `;
    } else if (reportType === 'value') {
      // 库存价值报表（字段名使用驼峰命名）
      query = `
        SELECT
          c.name as categoryName,
          COUNT(DISTINCT m.id) as materialCount,
          COALESCE(SUM(s.quantity), 0) as totalQuantity,
          COALESCE(SUM(s.quantity * m.price), 0) as totalValue,
          COALESCE(AVG(m.price), 0) as averagePrice
        FROM categories c
        LEFT JOIN materials m ON c.id = m.category_id
        LEFT JOIN ${STOCK_SUBQUERY} s ON m.id = s.material_id
        ${whereClause}
        GROUP BY c.id, c.name
        ORDER BY totalValue DESC
      `;
    } else if (reportType === 'period') {
      // 期间库存报表（字段名使用驼峰命名）
      query = `
        SELECT
          m.code as materialCode,
          m.name as materialName,
          m.specs as specification,
          c.name as categoryName,
          u.name as unitName,
          m.price as unitPrice,
          0 as beginningQuantity,
          0 as beginningValue,
          0 as inboundQuantity,
          0 as inboundValue,
          0 as outboundQuantity,
          0 as outboundValue,
          0 as endingQuantity,
          0 as endingValue,
          0 as turnoverRate,
          0 as turnoverDays
        FROM materials m
        LEFT JOIN categories c ON m.category_id = c.id
        LEFT JOIN units u ON m.unit_id = u.id
        ${whereClause}
        ORDER BY m.code
      `;
    } else if (reportType === 'warning') {
      // 低库存预警报表
      query = `
        SELECT
          m.code as '物料编码',
          m.name as '物料名称',
          m.specs as '规格',
          c.name as '类别',
          COALESCE(stock_summary.total_quantity, 0) as '当前库存',
          u.name as '单位',
          m.min_stock as '安全库存',
          CASE
            WHEN COALESCE(stock_summary.total_quantity, 0) = 0 THEN '零库存'
            WHEN COALESCE(stock_summary.total_quantity, 0) < m.min_stock THEN '低库存'
            ELSE '正常'
          END as '库存状态'
        FROM materials m
        LEFT JOIN (
          SELECT material_id, SUM(quantity) as total_quantity
          FROM ${STOCK_SUBQUERY} as current_stock
          GROUP BY material_id
        ) stock_summary ON m.id = stock_summary.material_id
        LEFT JOIN categories c ON m.category_id = c.id
        LEFT JOIN units u ON m.unit_id = u.id
        ${whereClause}
        HAVING COALESCE(stock_summary.total_quantity, 0) <= m.min_stock
        ORDER BY 当前库存 ASC, m.code
      `;
    }

    logger.info('查询参数:', params);

    const [rows] = await connection.execute(query, params);
    reportData = rows;

    if (reportData.length === 0) {
      return ResponseHandler.error(res, '没有找到符合条件的数据', 'BAD_REQUEST', 400);
    }

    // 如果是期间库存报表，需要计算实际的期间数据
    if (reportType === 'period') {
      reportData = await Promise.all(
        reportData.map(async (row) => {
          try {
            // 从物料编码获取物料ID
            const [materialResult] = await connection.execute(
              'SELECT id FROM materials WHERE code = ?',
              [row['物料编码']]
            );

            if (materialResult.length > 0) {
              const materialId = materialResult[0].id;
              const periodData = await calculatePeriodInventory(
                connection,
                materialId,
                startDate,
                endDate,
                locationId
              );

              return {
                ...row,
                期初数量: periodData.beginningQuantity,
                期初金额: periodData.beginningValue,
                本期收入数量: periodData.inboundQuantity,
                本期收入金额: periodData.inboundValue,
                本期发出数量: periodData.outboundQuantity,
                本期发出金额: periodData.outboundValue,
                期末数量: periodData.endingQuantity,
                期末金额: periodData.endingValue,
                库存周转率: periodData.turnoverRate,
                库存周转天数: periodData.turnoverDays,
              };
            }
            return row;
          } catch (error) {
            logger.error('计算期间数据失败:', error);
            return row;
          }
        })
      );
    }

    // 创建工作簿和工作表
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();

    // 根据报表类型设置工作表名称
    let sheetName = '库存报表';
    switch (reportType) {
      case 'summary':
        sheetName = '库存汇总报表';
        break;
      case 'location':
        sheetName = '库存分布报表';
        break;
      case 'value':
        sheetName = '库存价值报表';
        break;
      case 'warning':
        sheetName = '低库存预警报表';
        break;
    }

    const worksheet = workbook.addWorksheet(sheetName);

    // 根据报表类型设置列
    const headers = Object.keys(reportData[0] || {});
    const colWidths =
      reportType === 'summary'
        ? [15, 30, 20, 15, 12, 8, 12, 15, 10, 12]
        : reportType === 'location'
          ? [15, 30, 20, 15, 15, 12, 8, 12, 15, 20]
          : reportType === 'value'
            ? [20, 12, 15, 18, 12]
            : [15, 30, 20, 15, 12, 8, 12, 10];

    worksheet.columns = headers.map((header, index) => ({
      header,
      key: header,
      width: colWidths[index] || 15,
    }));

    // 添加数据
    reportData.forEach((row) => {
      worksheet.addRow(row);
    });

    // 将工作簿写入缓冲区
    const buf = await workbook.xlsx.writeBuffer();

    // 设置响应头
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    // 使用英文文件名避免编码问题
    let fileName = 'inventory_report.xlsx';
    switch (reportType) {
      case 'summary':
        fileName = 'inventory_summary_report.xlsx';
        break;
      case 'location':
        fileName = 'inventory_location_report.xlsx';
        break;
      case 'value':
        fileName = 'inventory_value_report.xlsx';
        break;
      case 'warning':
        fileName = 'inventory_warning_report.xlsx';
        break;
    }

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // 发送响应
    res.send(buf);
  } catch (error) {
    logger.error('导出库存报表失败:', error);
    ResponseHandler.error(res, '导出库存报表失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 导出库存流水报表
const exportTransactionReport = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const {
      startDate,
      endDate,
      materialName = '',
      transactionType = '',
      locationId = '',
    } = req.query;

    // 构建查询条件
    const conditions = [];
    const params = [];

    if (startDate && endDate) {
      conditions.push('inventory_ledger.created_at BETWEEN ? AND ?');
      params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    }

    if (materialName) {
      conditions.push('(materials.name LIKE ? OR materials.code LIKE ?)');
      params.push(`%${materialName}%`, `%${materialName}%`);
    }

    if (transactionType) {
      conditions.push('inventory_ledger.transaction_type = ?');
      params.push(transactionType);
    }

    if (locationId) {
      conditions.push('inventory_ledger.location_id = ?');
      params.push(locationId);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    logger.info('查询参数:', params);

    // 查询流水数据，无分页限制
    const [rawTransactions] = await connection.query(
      `SELECT
         inventory_ledger.reference_no,
         inventory_ledger.created_at,
         inventory_ledger.material_id,
         inventory_ledger.location_id,
         materials.code as material_code,
         materials.name as material_name,
         materials.specs,
         inventory_ledger.transaction_type,
         inventory_ledger.quantity,
         units.name as unit_name,
         locations.name as location_name,
         inventory_ledger.reference_type,
         CASE 
          WHEN inventory_ledger.operator = 'system' THEN '系统'
          ELSE COALESCE(users.real_name, users.username, inventory_ledger.operator)
        END as operator,
         inventory_ledger.remark,
         inventory_ledger.before_quantity,
         inventory_ledger.after_quantity
       FROM inventory_ledger
       LEFT JOIN materials ON inventory_ledger.material_id = materials.id
       LEFT JOIN locations ON inventory_ledger.location_id = locations.id
       LEFT JOIN units ON inventory_ledger.unit_id = units.id
       LEFT JOIN users ON inventory_ledger.operator = users.username
       ${whereClause}
       ORDER BY inventory_ledger.created_at ASC`,
      params
    );

    if (!rawTransactions || rawTransactions.length === 0) {
      return ResponseHandler.error(res, '未找到符合条件的流水记录', 'NOT_FOUND', 404);
    }

    // 按物料和位置分组，计算变动前后数量
    const materialLocationMap = {};
    for (const trans of rawTransactions) {
      const key = `${trans.material_id}_${trans.location_id}`;
      if (!materialLocationMap[key]) {
        materialLocationMap[key] = [];
      }
      materialLocationMap[key].push(trans);
    }

    // 计算每条记录的变动前后数量
    Object.values(materialLocationMap).forEach((records) => {
      let runningTotal = 0;
      for (const record of records) {
        // 设置变动前数量
        record.before_quantity = runningTotal;

        // 根据交易类型调整runningTotal
        if (record.transaction_type === 'inbound') {
          runningTotal += parseFloat(record.quantity);
        } else if (record.transaction_type === 'outbound') {
          runningTotal -= parseFloat(record.quantity);
        }

        // 设置变动后数量
        record.after_quantity = runningTotal;

        // 设置金额为0
        record.amount = 0;
      }
    });

    // 按原始顺序重新排序
    rawTransactions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // 格式化数据，添加中文标题
    const transactions = rawTransactions.map((t) => ({
      流水编号: t.reference_no,
      交易时间: new Date(t.created_at).toLocaleString(),
      物料编码: t.material_code,
      物料名称: t.material_name,
      规格: t.specs,
      流水类型: getInventoryTransactionTypeText(t.transaction_type),
      数量: t.quantity,
      变动前数量: t.before_quantity,
      变动后数量: t.after_quantity,
      金额: t.amount,
      单位: t.unit_name,
      仓库位置: t.location_name,
      关联单据类型: t.reference_type,
      操作人: t.operator,
      备注: t.remark,
    }));

    // 创建工作簿和工作表
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('库存流水');

    // 设置列
    worksheet.columns = [
      { header: '流水编号', key: '流水编号', width: 15 },
      { header: '交易时间', key: '交易时间', width: 20 },
      { header: '物料编码', key: '物料编码', width: 15 },
      { header: '物料名称', key: '物料名称', width: 30 },
      { header: '规格', key: '规格', width: 20 },
      { header: '流水类型', key: '流水类型', width: 10 },
      { header: '数量', key: '数量', width: 10 },
      { header: '单位', key: '单位', width: 8 },
      { header: '仓库位置', key: '仓库位置', width: 15 },
      { header: '关联单据类型', key: '关联单据类型', width: 15 },
      { header: '操作人', key: '操作人', width: 10 },
      { header: '备注', key: '备注', width: 30 },
    ];

    // 添加数据
    transactions.forEach((row) => {
      worksheet.addRow(row);
    });

    // 将工作簿写入缓冲区
    const buf = await workbook.xlsx.writeBuffer();

    // 设置响应头
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    // 使用最简单的固定文件名避免任何编码问题
    res.setHeader('Content-Disposition', 'attachment; filename="inventory_ledger.xlsx"');

    // 发送响应
    res.send(buf);
  } catch (error) {
    logger.error('导出库存流水报表失败:', error);
    ResponseHandler.error(res, '导出库存流水报表失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 使用统一的常量文件中的函数

// 获取库存报表
const getInventoryReport = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const {
      page = 1,
      pageSize = 10,
      reportType = 'summary',
      materialName = '',
      categoryId = '',
      locationId = '',
      startDate = '',
      endDate = '',
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    // 构建查询条件
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (materialName) {
      whereClause += ' AND (m.name LIKE ? OR m.code LIKE ?)';
      params.push(`%${materialName}%`, `%${materialName}%`);
    }

    if (categoryId) {
      whereClause += ' AND m.category_id = ?';
      params.push(categoryId);
    }

    if (locationId) {
      whereClause += ' AND s.location_id = ?';
      params.push(locationId);
    }

    let query = '';
    let countQuery = '';
    let statisticsData = {};

    // 根据报表类型构建不同的查询
    if (reportType === 'summary') {
      // 汇总报表 - 按物料汇总，使用与库存管理页面相同的逻辑
      // 修改WHERE条件以适应新的查询结构
      let reportWhereClause = 'WHERE 1=1';
      const reportParams = [];

      if (materialName) {
        reportWhereClause += ' AND (m.name LIKE ? OR m.code LIKE ? OR m.specs LIKE ?)';
        reportParams.push(`%${materialName}%`, `%${materialName}%`, `%${materialName}%`);
      }

      if (categoryId) {
        reportWhereClause += ' AND m.category_id = ?';
        reportParams.push(categoryId);
      }

      if (locationId) {
        reportWhereClause += ' AND current_stock.location_id = ?';
        reportParams.push(locationId);
      }

      countQuery = `
        SELECT COUNT(*) as total
        FROM (
          SELECT il.material_id, SUM(il.quantity) as total_quantity
          FROM inventory_ledger il
          JOIN materials mat ON il.material_id = mat.id
          GROUP BY il.material_id
          HAVING total_quantity > 0
        ) stock_summary
        LEFT JOIN materials m ON stock_summary.material_id = m.id
        LEFT JOIN categories c ON m.category_id = c.id
        ${reportWhereClause.replace('current_stock.location_id', 'stock_summary.material_id')}
      `;

      query = `
        SELECT
          m.id,
          m.code as materialCode,
          m.name as materialName,
          m.specs as specification,
          c.name as categoryName,
          SUM(current_stock.quantity) as quantity,
          m.price as unitPrice,
          SUM(current_stock.quantity) * IFNULL(m.price, 0) as totalValue,
          COUNT(DISTINCT current_stock.location_id) as locationCount,
          u.name as unitName,
          m.min_stock as safetyStock
        FROM (
          SELECT il.material_id, il.location_id, SUM(il.quantity) as quantity
          FROM inventory_ledger il
          JOIN materials mat ON il.material_id = mat.id
          WHERE mat.location_id IS NULL OR il.location_id = mat.location_id
          GROUP BY il.material_id, il.location_id
          HAVING quantity > 0
        ) current_stock
        LEFT JOIN materials m ON current_stock.material_id = m.id
        LEFT JOIN categories c ON m.category_id = c.id
        LEFT JOIN units u ON m.unit_id = u.id
        ${reportWhereClause}
        GROUP BY m.id, m.code, m.name, m.specs, c.name, m.price, u.name, m.min_stock
        HAVING SUM(current_stock.quantity) > 0
        ORDER BY m.code
        LIMIT ${limit} OFFSET ${offset}
      `;

      // 更新参数数组
      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
      params.length = 0;
      params.push(...reportParams);
    } else if (reportType === 'aging') {
      // 库龄分析报表 - 按物料最早入库时间计算

      // 构建WHERE条件
      let reportWhereClause = 'WHERE 1=1';
      const reportParams = [];

      if (materialName) {
        reportWhereClause += ' AND (m.name LIKE ? OR m.code LIKE ? OR m.specs LIKE ?)';
        reportParams.push(`%${materialName}%`, `%${materialName}%`, `%${materialName}%`);
      }

      if (categoryId) {
        reportWhereClause += ' AND m.category_id = ?';
        reportParams.push(categoryId);
      }

      if (locationId) {
        reportWhereClause += ' AND current_stock.location_id = ?';
        reportParams.push(locationId);
      }

      countQuery = `
        SELECT COUNT(*) as total
        FROM (
          SELECT il.material_id, SUM(il.quantity) as total_quantity
          FROM inventory_ledger il
          JOIN materials mat ON il.material_id = mat.id
          WHERE mat.location_id IS NULL OR il.location_id = mat.location_id
          GROUP BY il.material_id
          HAVING total_quantity > 0
        ) stock_summary
        LEFT JOIN materials m ON stock_summary.material_id = m.id
        LEFT JOIN categories c ON m.category_id = c.id
        ${reportWhereClause.replace('current_stock.location_id', 'stock_summary.material_id')}
      `;

      query = `
        SELECT
          m.id,
          m.code as materialCode,
          m.name as materialName,
          m.specs as specification,
          c.name as categoryName,
          SUM(current_stock.quantity) as quantity,
          m.price as unitPrice,
          SUM(current_stock.quantity) * IFNULL(m.price, 0) as totalValue,
          u.name as unitName,
          MIN(first_in.date) as firstInboundDate,
          DATEDIFF(NOW(), MIN(first_in.date)) as agingDays
        FROM (
          SELECT il.material_id, il.location_id, SUM(il.quantity) as quantity
          FROM inventory_ledger il
          JOIN materials mat ON il.material_id = mat.id
          WHERE mat.location_id IS NULL OR il.location_id = mat.location_id
          GROUP BY il.material_id, il.location_id
          HAVING quantity > 0
        ) current_stock
        LEFT JOIN materials m ON current_stock.material_id = m.id
        LEFT JOIN categories c ON m.category_id = c.id
        LEFT JOIN units u ON m.unit_id = u.id
        LEFT JOIN (
          SELECT material_id, MIN(created_at) as date
          FROM inventory_ledger
          WHERE transaction_type IN (
            'inbound', 'purchase_inbound', 'production_inbound', 'outsourced_inbound', 
            'in', 'return_in', 'other_in',
            '入库', '采购入库', '生产入库', '委外入库', '归还入库', '其他入库'
          )
          GROUP BY material_id
        ) first_in ON m.id = first_in.material_id
        ${reportWhereClause}
        GROUP BY m.id, m.code, m.name, m.specs, c.name, m.price, u.name
        HAVING SUM(current_stock.quantity) > 0
        ORDER BY agingDays DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      // 更新参数数组
      params.length = 0;
      params.push(...reportParams);
    } else if (reportType === 'period') {
      // 期间库存报表 - 新增的财务库存报表
      countQuery = `
        SELECT COUNT(DISTINCT m.id) as total
        FROM materials m
        LEFT JOIN categories c ON m.category_id = c.id
        ${whereClause}
      `;

      query = `
        SELECT
          m.id,
          m.code as materialCode,
          m.name as materialName,
          m.specs as specification,
          c.name as categoryName,
          u.name as unitName,
          m.price as unitPrice,
          m.min_stock as safetyStock
        FROM materials m
        LEFT JOIN categories c ON m.category_id = c.id
        LEFT JOIN units u ON m.unit_id = u.id
        ${whereClause}
        ORDER BY m.code
        LIMIT ${limit} OFFSET ${offset}
      `;

      // 为period报表添加参数
      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    } else if (reportType === 'location') {
      // 库存分布报表 - 按物料和库位展开
      countQuery = `
        SELECT COUNT(*) as total
        FROM materials m
        LEFT JOIN ${STOCK_SUBQUERY} s ON m.id = s.material_id
        LEFT JOIN categories c ON m.category_id = c.id
        LEFT JOIN locations l ON s.location_id = l.id
        ${whereClause}
      `;

      query = `
        SELECT
          m.id,
          m.code as materialCode,
          m.name as materialName,
          m.specs as specification,
          c.name as categoryName,
          l.name as locationName,
          COALESCE(s.quantity, 0) as quantity,
          m.price as unitPrice,
          COALESCE(s.quantity * m.price, 0) as totalValue,
          u.name as unitName,
          m.min_stock as minStock,
          m.max_stock as maxStock,
          DATE_FORMAT(s.updated_at, '%Y-%m-%d %H:%i:%s') as lastMoveDate
        FROM materials m
        LEFT JOIN ${STOCK_SUBQUERY} s ON m.id = s.material_id
        LEFT JOIN categories c ON m.category_id = c.id
        LEFT JOIN locations l ON s.location_id = l.id
        LEFT JOIN units u ON m.unit_id = u.id
        ${whereClause}
        ORDER BY m.code, l.name
        LIMIT ${limit} OFFSET ${offset}
      `;

      // 为location报表添加参数
      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    } else if (reportType === 'value') {
      // 库存价值报表
      countQuery = `
        SELECT COUNT(DISTINCT c.id) as total
        FROM categories c
        LEFT JOIN materials m ON c.id = m.category_id
        LEFT JOIN ${STOCK_SUBQUERY} s ON m.id = s.material_id
        ${whereClause}
      `;

      query = `
        SELECT
          c.id,
          c.name as categoryName,
          COUNT(DISTINCT m.id) as materialCount,
          COALESCE(SUM(s.quantity), 0) as totalQuantity,
          COALESCE(SUM(s.quantity * m.price), 0) as totalValue,
          COALESCE(AVG(m.price), 0) as averagePrice,
          COALESCE(SUM(s.quantity * m.price) / (SELECT SUM(s2.quantity * m2.price) FROM ${SIMPLE_STOCK_SUBQUERY} as s2 JOIN materials m2 ON s2.material_id = m2.id) * 100, 0) as valuePercent
        FROM categories c
        LEFT JOIN materials m ON c.id = m.category_id
        LEFT JOIN ${STOCK_SUBQUERY} s ON m.id = s.material_id
        ${whereClause}
        GROUP BY c.id, c.name
        ORDER BY totalValue DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      // 为value报表添加参数
      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    } else if (reportType === 'warning') {
      // 低库存预警报表
      countQuery = `
        SELECT COUNT(*) as total
        FROM materials m
        LEFT JOIN (
          SELECT material_id, SUM(quantity) as total_quantity
          FROM ${STOCK_SUBQUERY} as current_stock
          GROUP BY material_id
        ) s ON m.id = s.material_id
        LEFT JOIN categories c ON m.category_id = c.id
        WHERE m.min_stock > 0 AND (s.total_quantity < m.min_stock OR s.total_quantity IS NULL)
        ${whereClause.replace('WHERE 1=1', '')}
      `;

      query = `
        SELECT
          m.id,
          m.code as materialCode,
          m.name as materialName,
          m.specs as specification,
          c.name as categoryName,
          COALESCE(s.total_quantity, 0) as quantity,
          m.min_stock as safetyStock,
          (COALESCE(s.total_quantity, 0) - m.min_stock) as gap,
          (m.min_stock - COALESCE(s.total_quantity, 0)) as suggestedPurchase,
          u.name as unitName,
          CASE
            WHEN COALESCE(s.total_quantity, 0) = 0 THEN 'critical'
            WHEN COALESCE(s.total_quantity, 0) < m.min_stock * 0.5 THEN 'high'
            ELSE 'medium'
          END as warningLevel
        FROM materials m
        LEFT JOIN (
          SELECT material_id, SUM(quantity) as total_quantity
          FROM ${STOCK_SUBQUERY} as current_stock
          GROUP BY material_id
        ) s ON m.id = s.material_id
        LEFT JOIN categories c ON m.category_id = c.id
        LEFT JOIN units u ON m.unit_id = u.id
        WHERE m.min_stock > 0 AND (s.total_quantity < m.min_stock OR s.total_quantity IS NULL)
        ${whereClause.replace('WHERE 1=1', '')}
        ORDER BY gap ASC
        LIMIT ${limit} OFFSET ${offset}
      `;

      // 为warning报表添加参数
      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    }

    // 执行查询 - 使用query而不是execute，并确保正确传递参数
    const [countResult] = await connection.query(countQuery, params); // params 不再包含 limit 和 offset
    const [items] = await connection.query(query, params);

    // 处理不同类型的报表数据
    let updatedItems = [];

    if (reportType === 'period') {
      // 期间库存报表 - 计算期初、期末、收入、发出
      updatedItems = await Promise.all(
        items.map(async (item) => {
          try {
            const periodData = await calculatePeriodInventory(
              connection,
              item.id,
              startDate,
              endDate,
              locationId
            );
            return {
              ...item,
              ...periodData,
            };
          } catch (error) {
            logger.error('计算期间库存数据时出错:', error);
            return {
              ...item,
              beginningQuantity: 0,
              beginningValue: 0,
              inboundQuantity: 0,
              inboundValue: 0,
              outboundQuantity: 0,
              outboundValue: 0,
              endingQuantity: 0,
              endingValue: 0,
              turnoverRate: 0,
              turnoverDays: 0,
            };
          }
        })
      );

      // 计算统计数据
      statisticsData = calculatePeriodStatistics(updatedItems);
    } else {
      // 对于汇总报表，数据已经在查询中正确计算，无需额外处理
      updatedItems = items;

      // 计算汇总报表的统计数据 - 使用全量数据而非当前页
      if (['summary', 'aging', 'location', 'value', 'warning'].includes(reportType)) {
        // 执行全量统计查询
        const [statsResult] = await connection.query(`
          SELECT
            COUNT(DISTINCT m.id) as totalItems,
            COALESCE(SUM(current_stock.quantity * IFNULL(m.price, 0)), 0) as totalValue,
            COUNT(DISTINCT current_stock.location_id) as totalLocations,
            SUM(CASE WHEN current_stock.quantity < m.min_stock THEN 1 ELSE 0 END) as lowStock
          FROM (
            SELECT il.material_id, il.location_id, SUM(il.quantity) as quantity
            FROM inventory_ledger il
            JOIN materials mat ON il.material_id = mat.id
            WHERE mat.location_id IS NULL OR il.location_id = mat.location_id
            GROUP BY il.material_id, il.location_id
            HAVING quantity > 0
          ) current_stock
          LEFT JOIN materials m ON current_stock.material_id = m.id
        `);

        statisticsData = {
          totalItems: parseInt(statsResult[0].totalItems) || 0,
          totalValue: parseFloat(statsResult[0].totalValue) || 0,
          totalLocations: parseInt(statsResult[0].totalLocations) || 0,
          lowStock: parseInt(statsResult[0].lowStock) || 0,
        };
      }
    }

    // 返回结果
    ResponseHandler.success(
      res,
      {
        items: updatedItems,
        total: countResult[0].total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        statistics: statisticsData,
      },
      '获取库存报表成功'
    );
  } catch (error) {
    logger.error('获取库存报表失败:', error);
    ResponseHandler.error(res, '获取库存报表失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 计算期间库存数据的辅助函数
const calculatePeriodInventory = async (
  connection,
  materialId,
  startDate,
  endDate,
  locationId = ''
) => {
  try {
    // 设置默认日期范围（当月）
    const now = new Date();
    const defaultStartDate =
      startDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const defaultEndDate =
      endDate ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`;

    // 构建位置条件
    const locationCondition = locationId ? 'AND location_id = ?' : '';
    const locationParams = locationId ? [locationId] : [];

    // 1. 计算期初结存（开始日期之前的最后库存状态）
    const [beginningResult] = await connection.query(
      `SELECT
        COALESCE(after_quantity, 0) as quantity,
        COALESCE(after_quantity * (SELECT price FROM materials WHERE id = ?), 0) as value
       FROM inventory_ledger
       WHERE material_id = ?
       AND created_at < ?
       ${locationCondition}
       ORDER BY created_at DESC
       LIMIT 1`,
      [materialId, materialId, defaultStartDate, ...locationParams]
    );

    const beginningQuantity =
      beginningResult.length > 0 ? parseFloat(beginningResult[0].quantity) : 0;
    const beginningValue = beginningResult.length > 0 ? parseFloat(beginningResult[0].value) : 0;

    // 2. 计算本期收入（入库）
    const [inboundResult] = await connection.query(
      `SELECT
        COALESCE(SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END), 0) as quantity,
        COALESCE(SUM(CASE WHEN quantity > 0 THEN quantity * (SELECT price FROM materials WHERE id = ?) ELSE 0 END), 0) as value
       FROM inventory_ledger
       WHERE material_id = ?
       AND created_at >= ? AND created_at <= ?
       AND transaction_type IN ('inbound', 'purchase_inbound', 'production_inbound', 'outsourced_inbound', 'in', '入库', '采购入库', '生产入库', '委外入库')
       ${locationCondition}`,
      [materialId, materialId, defaultStartDate, defaultEndDate, ...locationParams]
    );

    const inboundQuantity = parseFloat(inboundResult[0].quantity);
    const inboundValue = parseFloat(inboundResult[0].value);

    // 3. 计算本期发出（出库）
    const [outboundResult] = await connection.query(
      `SELECT
        COALESCE(SUM(CASE WHEN quantity < 0 THEN ABS(quantity) ELSE 0 END), 0) as quantity,
        COALESCE(SUM(CASE WHEN quantity < 0 THEN ABS(quantity) * (SELECT price FROM materials WHERE id = ?) ELSE 0 END), 0) as value
       FROM inventory_ledger
       WHERE material_id = ?
       AND created_at >= ? AND created_at <= ?
       AND transaction_type IN ('outbound', 'production_outbound', 'sales_outbound', 'outsourced_outbound', 'out', '出库', '生产出库', '销售出库', '委外出库')
       ${locationCondition}`,
      [materialId, materialId, defaultStartDate, defaultEndDate, ...locationParams]
    );

    const outboundQuantity = parseFloat(outboundResult[0].quantity);
    const outboundValue = parseFloat(outboundResult[0].value);

    // 4. 计算期末结存
    const endingQuantity = beginningQuantity + inboundQuantity - outboundQuantity;
    const endingValue = beginningValue + inboundValue - outboundValue;

    // 5. 计算库存周转率和周转天数
    const avgInventory = (beginningValue + endingValue) / 2;
    const turnoverRate = avgInventory > 0 ? outboundValue / avgInventory : 0;
    const turnoverDays = turnoverRate > 0 ? 365 / turnoverRate : 0;

    return {
      beginningQuantity,
      beginningValue,
      inboundQuantity,
      inboundValue,
      outboundQuantity,
      outboundValue,
      endingQuantity,
      endingValue,
      turnoverRate: parseFloat(turnoverRate.toFixed(2)),
      turnoverDays: parseFloat(turnoverDays.toFixed(1)),
    };
  } catch (error) {
    logger.error('计算期间库存数据失败:', error);
    throw error;
  }
};

// 计算期间统计数据
const calculatePeriodStatistics = (items) => {
  const totalItems = items.length;
  const totalBeginningValue = items.reduce((sum, item) => sum + (item.beginningValue || 0), 0);
  const totalInboundValue = items.reduce((sum, item) => sum + (item.inboundValue || 0), 0);
  const totalOutboundValue = items.reduce((sum, item) => sum + (item.outboundValue || 0), 0);
  const totalEndingQuantity = items.reduce((sum, item) => sum + (item.endingQuantity || 0), 0);
  const totalEndingValue = items.reduce((sum, item) => sum + (item.endingValue || 0), 0);
  const avgTurnoverRate =
    items.length > 0
      ? items.reduce((sum, item) => sum + (item.turnoverRate || 0), 0) / items.length
      : 0;

  return {
    totalItems,
    totalBeginningValue,
    totalInboundValue,
    totalOutboundValue,
    totalEndingQuantity,
    totalEndingValue,
    avgTurnoverRate: parseFloat(avgTurnoverRate.toFixed(2)),
  };
};

// 获取库存收发结存明细
const getInventoryLedger = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const {
      page = 1,
      pageSize = 20,
      materialId = '',
      materialName = '',
      categoryId = '',
      locationId = '',
      startDate = '',
      endDate = '',
      transactionType = '',
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    // 设置默认日期范围
    // 注意：使用 || 运算符时，空字符串会被视为 falsy，所以需要明确检查
    let defaultStartDate;
    let defaultEndDate;

    if (startDate && startDate !== '') {
      defaultStartDate = startDate;
    } else {
      // 默认最近3个月
      const now = new Date();
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      defaultStartDate = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`;
    }

    if (endDate && endDate !== '') {
      defaultEndDate = endDate;
    } else {
      // 默认到当月最后一天
      const now = new Date();
      defaultEndDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`;
    }

    // 构建查询条件
    let whereClause = 'WHERE t.created_at >= ? AND t.created_at <= ?';
    const params = [defaultStartDate, defaultEndDate];

    if (materialId) {
      whereClause += ' AND t.material_id = ?';
      params.push(materialId);
    }

    if (materialName) {
      whereClause += ' AND (m.name LIKE ? OR m.code LIKE ?)';
      params.push(`%${materialName}%`, `%${materialName}%`);
    }

    if (categoryId) {
      whereClause += ' AND m.category_id = ?';
      params.push(categoryId);
    }

    if (locationId) {
      whereClause += ' AND t.location_id = ?';
      params.push(locationId);
    }

    if (transactionType) {
      whereClause += ' AND t.transaction_type = ?';
      params.push(transactionType);
    }

    // 查询总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM inventory_ledger t
      LEFT JOIN materials m ON t.material_id = m.id
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN locations l ON t.location_id = l.id
      ${whereClause}
    `;

    // 查询明细数据
    const detailQuery = `
      SELECT
        t.id,
        DATE_FORMAT(t.created_at, '%Y-%m-%d') as date,
        m.code as materialCode,
        m.name as materialName,
        m.specs as specification,
        c.name as categoryName,
        l.name as locationName,
        t.transaction_type as transactionType,
        t.batch_number as batchNumber,
        t.reference_no as documentNo,
        t.quantity,
        COALESCE(t.before_quantity, 0) as before_quantity,
        COALESCE(t.after_quantity, 0) as after_quantity,
        m.price as unitPrice,
        CASE
          WHEN t.quantity > 0 THEN t.quantity
          ELSE 0
        END as inQuantity,
        CASE
          WHEN t.quantity > 0 THEN t.quantity * m.price
          ELSE 0
        END as inValue,
        CASE
          WHEN t.quantity < 0 THEN ABS(t.quantity)
          ELSE 0
        END as outQuantity,
        CASE
          WHEN t.quantity < 0 THEN ABS(t.quantity) * m.price
          ELSE 0
        END as outValue,
        COALESCE(t.after_quantity, 0) as balanceQuantity,
        COALESCE(t.after_quantity * m.price, 0) as balanceValue,
        t.operator,
        CASE
          WHEN t.operator = 'system' THEN '系统'
          ELSE COALESCE(
            (SELECT usr.real_name FROM users usr WHERE usr.username = t.operator COLLATE utf8mb4_unicode_ci LIMIT 1),
            (SELECT usr.username FROM users usr WHERE usr.username = t.operator COLLATE utf8mb4_unicode_ci LIMIT 1),
            t.operator
          )
        END as operatorName,
        t.remark,
        u.name as unitName
      FROM inventory_ledger t
      LEFT JOIN materials m ON t.material_id = m.id
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN locations l ON t.location_id = l.id
      LEFT JOIN units u ON m.unit_id = u.id
      ${whereClause}
      ORDER BY t.created_at DESC, m.code
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;

    // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    const [countResult] = await connection.query(countQuery, params);
    const [items] = await connection.query(detailQuery, params);

    // 性能优化：inventory_ledger 表已存储 before_quantity / after_quantity，
    // 直接使用 SQL 查询结果，不再逐物料查全量历史重算（消除 N+1 查询）。
    const processedItems = items.map((item) => {
      const beforeQty = parseFloat(item.before_quantity || 0);
      const afterQty = parseFloat(item.after_quantity || 0);

      // 添加交易类型文本
      let transactionTypeText;
      if (item.transactionType === 'purchase_return') {
        transactionTypeText = '采购退货';
      } else {
        transactionTypeText = getInventoryTransactionTypeText(item.transactionType);
      }

      return {
        ...item,
        quantity: parseFloat(item.quantity || 0),
        beforeQuantity: beforeQty,
        afterQuantity: afterQty,
        inQuantity: parseFloat(item.inQuantity || 0),
        inValue: parseFloat(item.inValue || 0),
        outQuantity: parseFloat(item.outQuantity || 0),
        outValue: parseFloat(item.outValue || 0),
        balanceQuantity: afterQty,
        balanceValue: afterQty * parseFloat(item.unitPrice || 0),
        unitPrice: parseFloat(item.unitPrice || 0),
        transactionTypeText: transactionTypeText,
      };
    });

    // 计算汇总统计
    const statistics = {
      totalTransactions: countResult[0].total,
      totalInQuantity: processedItems.reduce((sum, item) => sum + item.inQuantity, 0),
      totalInValue: processedItems.reduce((sum, item) => sum + item.inValue, 0),
      totalOutQuantity: processedItems.reduce((sum, item) => sum + item.outQuantity, 0),
      totalOutValue: processedItems.reduce((sum, item) => sum + item.outValue, 0),
    };

    ResponseHandler.success(
      res,
      {
        items: processedItems,
        total: countResult[0].total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        statistics,
      },
      '获取库存收发结存明细成功'
    );
  } catch (error) {
    logger.error('获取库存收发结存明细失败:', error);
    ResponseHandler.error(res, '获取库存收发结存明细失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 批量获取物料库存详情
const getBatchMaterialStock = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const { materials } = req.body; // 期望格式: [{ materialId: 1, locationId: 2 }, ...]

    if (!materials || !Array.isArray(materials) || materials.length === 0) {
      return ResponseHandler.error(res, '请提供有效的物料库存查询列表', 'BAD_REQUEST', 400);
    }

    // 限制批量查询数量
    if (materials.length > 50) {
      return ResponseHandler.error(res, '批量查询数量不能超过50个', 'BAD_REQUEST', 400);
    }

    // 构建批量查询SQL
    const materialConditions = materials.map(() => '(m.id = ? AND s.location_id = ?)').join(' OR ');
    const params = [];
    materials.forEach((item) => {
      params.push(item.materialId, item.locationId);
    });

    const query = `
      SELECT
        m.id as material_id,
        m.code as material_code,
        m.name as material_name,
        m.specs as specification,
        u.id as unit_id,
        u.name as unit_name,
        s.location_id,
        l.name as location_name,
        COALESCE(s.quantity, 0) as quantity,
        COALESCE(s.quantity, 0) as stock_quantity,
        0 as stock_id
      FROM materials m
      LEFT JOIN units u ON u.id = m.unit_id
      LEFT JOIN ${STOCK_SUBQUERY} s ON m.id = s.material_id
      LEFT JOIN locations l ON s.location_id = l.id
      WHERE (${materialConditions})
    `;

    const [rows] = await connection.execute(query, params);

    // 创建结果映射，确保每个请求的物料都有对应的结果
    const resultMap = new Map();

    // 先填充查询到的结果
    rows.forEach((row) => {
      const key = `${row.material_id}_${row.location_id}`;
      resultMap.set(key, {
        material_id: parseInt(row.material_id),
        material_code: row.material_code,
        material_name: row.material_name,
        specification: row.specification || '',
        unit_id: row.unit_id,
        unit_name: row.unit_name,
        location_id: parseInt(row.location_id),
        location_name: row.location_name || '默认库位',
        quantity: parseFloat(row.quantity || 0),
        stock_quantity: parseFloat(row.stock_quantity || 0),
        stock_id: parseInt(row.stock_id || 0),
        success: true,
      });
    });

    // 为没有查询到的物料补充默认值
    const results = materials.map((item) => {
      const key = `${item.materialId}_${item.locationId}`;
      if (resultMap.has(key)) {
        return resultMap.get(key);
      } else {
        // 返回默认值，表示该物料在该库位没有库存
        return {
          material_id: parseInt(item.materialId),
          location_id: parseInt(item.locationId),
          quantity: 0,
          stock_quantity: 0,
          success: false,
          message: '物料在该库位无库存记录',
        };
      }
    });

    ResponseHandler.success(res, results, '批量获取物料库存成功');
  } catch (error) {
    logger.error('批量获取物料库存失败:', error);
    ResponseHandler.error(res, '批量获取物料库存失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 获取物料库存详情
const getMaterialStockDetail = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const { materialId, locationId } = req.params;

    // 首先确认物料是否存在
    const [materialExists] = await connection.execute(
      `SELECT
        m.id,
        m.code as material_code,
        m.name as material_name,
        m.specs as specification,
        u.id as unit_id,
        u.name as unit_name
      FROM materials m
      LEFT JOIN units u ON u.id = m.unit_id
      WHERE m.id = ?`,
      [materialId]
    );

    if (materialExists.length === 0) {
      // 返回200状态码，但数量为0
      return ResponseHandler.error(res, '物料不存在', 'NOT_FOUND', 404, {
        material_id: parseInt(materialId),
        location_id: parseInt(locationId),
        quantity: 0,
        stock_quantity: 0,
      });
    }

    // 确认库位是否存在
    const [locationExists] = await connection.execute(
      'SELECT id, name as location_name FROM locations WHERE id = ?',
      [locationId]
    );

    if (locationExists.length === 0) {
      // 返回200状态码，但数量为0
      return ResponseHandler.error(res, '库位不存在', 'NOT_FOUND', 404, {
        material_id: parseInt(materialId),
        location_id: parseInt(locationId),
        material_code: materialExists[0].material_code,
        material_name: materialExists[0].material_name,
        specification: materialExists[0].specification,
        unit_id: materialExists[0].unit_id,
        unit_name: materialExists[0].unit_name,
        quantity: 0,
        stock_quantity: 0,
      });
    }

    // 查询库存记录
    const [stockResult] = await connection.execute(
      'SELECT 0 as stock_id, SUM(il.quantity) as quantity FROM inventory_ledger il JOIN materials mat ON il.material_id = mat.id WHERE il.material_id = ? AND il.location_id = ? AND (mat.location_id IS NULL OR il.location_id = mat.location_id)',
      [materialId, locationId]
    );

    // 使用统一的库存服务获取库存数量
    const quantity = await InventoryService.getCurrentStock(
      parseInt(materialId),
      parseInt(locationId),
      connection
    );

    // 组装结果
    const stockData = {
      success: true,
      material_id: parseInt(materialId),
      location_id: parseInt(locationId),
      material_code: materialExists[0].material_code,
      material_name: materialExists[0].material_name,
      specification: materialExists[0].specification,
      location_name: locationExists[0].location_name,
      unit_id: materialExists[0].unit_id,
      unit_name: materialExists[0].unit_name,
      stock_id: stockResult.length > 0 ? stockResult[0].stock_id : null,
      quantity: quantity,
      stock_quantity: quantity,
    };

    ResponseHandler.success(res, stockData, '获取物料库存详情成功');
  } catch (error) {
    logger.error('获取物料库存详情失败:', error);
    ResponseHandler.error(res, '获取物料库存详情失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 获取库存调拨单列表
const getTransferList = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      transfer_no = '',
      status = '',
      from_location_id = '',
      to_location_id = '',
      start_date = '',
      end_date = '',
    } = req.query;
    const offsetValue = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const limitValue = parseInt(limit, 10);

    let whereClause = 'WHERE 1=1';
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

    // 获取总记录数
    const [countResult] = await db.pool.execute(
      `SELECT COUNT(*) as total FROM inventory_transfers t ${whereClause}`,
      params
    );

    const total = countResult[0].total;

    // 使用query代替execute，使用?号占位符插入，但手动拼接LIMIT OFFSET部分
    const query = `
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
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT ${limitValue} OFFSET ${offsetValue}`;

    const [transfers] = await db.pool.query(query, params);

    ResponseHandler.paginated(
      res,
      transfers,
      total,
      parseInt(page, 10),
      parseInt(limit, 10),
      '获取调拨单列表成功'
    );
  } catch (error) {
    logger.error('获取调拨单列表失败:', error);
    ResponseHandler.error(res, '获取调拨单列表失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取库存调拨单详情
const getTransferDetail = async (req, res) => {
  try {
    const { id } = req.params;

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
      WHERE t.id = ?`,
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

    // 返回组合结果
    ResponseHandler.success(
      res,
      {
        ...transfer,
        items,
      },
      '获取调拨单详情成功'
    );
  } catch (error) {
    logger.error('获取调拨单详情失败:', error);
    ResponseHandler.error(res, '获取调拨单详情失败', 'SERVER_ERROR', 500, error);
  }
};

// 创建库存调拨单
const createTransfer = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      transfer_date,
      from_location_id,
      to_location_id,
      items,
      remark,
      status = 'draft',
    } = req.body;

    // 基本验证
    if (
      !transfer_date ||
      !from_location_id ||
      !to_location_id ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '请提供调拨日期、源库位、目标库位和物料明细',
        'BAD_REQUEST',
        400
      );
    }

    // ===== 年度结存校验 =====
    const PeriodValidationService = require('../../../services/business/PeriodValidationService');
    const inventoryCheck =
      await PeriodValidationService.validateInventoryTransaction(transfer_date);
    if (!inventoryCheck.allowed) {
      await connection.rollback();
      return ResponseHandler.error(res, inventoryCheck.message, 'BAD_REQUEST', 400);
    }
    // ===== 年度结存校验结束 =====

    if (from_location_id === to_location_id) {
      await connection.rollback();
      return ResponseHandler.error(res, '源库位和目标库位不能相同', 'BAD_REQUEST', 400);
    }

    // 验证物料明细
    for (const item of items) {
      if (!item.material_id || !item.quantity || item.quantity <= 0) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          '调拨物料必须提供物料ID和大于0的数量',
          'BAD_REQUEST',
          400
        );
      }

      // 使用统一的库存服务检查库存是否足够
      try {
        const validation = await InventoryService.validateStock(
          item.material_id,
          from_location_id,
          parseFloat(item.quantity),
          connection
        );

        if (!validation.isEnough) {
          await connection.rollback();
          const [materialResult] = await connection.execute(
            'SELECT name FROM materials WHERE id = ?',
            [item.material_id]
          );
          const materialName =
            materialResult.length > 0 ? materialResult[0].name : `物料ID: ${item.material_id}`;
          return res.status(400).json({
            message: `库存不足: ${materialName} 当前库存 ${validation.currentStock}, 需要 ${item.quantity}`,
          });
        }
      } catch (error) {
        await connection.rollback();
        logger.error('验证库存时发生错误:', error);
        return ResponseHandler.error(
          res,
          '验证库存失败: ' + error.message,
          'SERVER_ERROR',
          500,
          error
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
        creator
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        transfer_no,
        transfer_date,
        from_location_id,
        to_location_id,
        status,
        remark || '',
        req.user?.username || 'system',
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

    ResponseHandler.success(
      res,
      {
        message: '调拨单创建成功',
        id: transferId,
        transfer_no,
      },
      '创建成功',
      201
    );
  } catch (error) {
    await connection.rollback();
    logger.error('创建库存调拨单失败:', error);
    ResponseHandler.error(res, '创建库存调拨单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 更新库存调拨单
const updateTransfer = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { transfer_date, from_location_id, to_location_id, items, remark } = req.body;

    // 检查调拨单是否存在
    const [transferResult] = await connection.execute(
      'SELECT status FROM inventory_transfers WHERE id = ?',
      [id]
    );

    if (transferResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '调拨单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = transferResult[0].status;

    // 只有草稿状态的调拨单可以更新
    if (currentStatus !== 'draft') {
      await connection.rollback();
      return ResponseHandler.error(res, '只有草稿状态的调拨单可以更新', 'BAD_REQUEST', 400);
    }

    // 基本验证
    if (
      !transfer_date ||
      !from_location_id ||
      !to_location_id ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '请提供调拨日期、源库位、目标库位和物料明细',
        'BAD_REQUEST',
        400
      );
    }

    if (from_location_id === to_location_id) {
      await connection.rollback();
      return ResponseHandler.error(res, '源库位和目标库位不能相同', 'BAD_REQUEST', 400);
    }

    // 验证物料明细
    for (const item of items) {
      if (!item.material_id || !item.quantity || item.quantity <= 0) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          '调拨物料必须提供物料ID和大于0的数量',
          'BAD_REQUEST',
          400
        );
      }

      // 检查源库位库存是否足够
      const [stockResult] = await connection.execute(
        `SELECT quantity FROM ${STOCK_SUBQUERY} as current_stock WHERE material_id = ? AND location_id = ?`,
        [item.material_id, from_location_id]
      );

      const currentStock = stockResult.length > 0 ? parseFloat(stockResult[0].quantity) : 0;

      if (currentStock < parseFloat(item.quantity)) {
        await connection.rollback();
        const [materialResult] = await connection.execute(
          'SELECT name FROM materials WHERE id = ?',
          [item.material_id]
        );
        const materialName =
          materialResult.length > 0 ? materialResult[0].name : `物料ID: ${item.material_id}`;
        return res.status(400).json({
          message: `库存不足: ${materialName} 当前库存 ${currentStock}, 需要 ${item.quantity}`,
        });
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
      WHERE id = ?`,
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

    ResponseHandler.success(res, { id }, '调拨单更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新库存调拨单失败:', error);
    ResponseHandler.error(res, '更新库存调拨单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 删除库存调拨单
const deleteTransfer = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // 检查调拨单是否存在
    const [transferResult] = await connection.execute(
      'SELECT status FROM inventory_transfers WHERE id = ?',
      [id]
    );

    if (transferResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '调拨单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = transferResult[0].status;

    // 只有草稿状态的调拨单可以删除
    if (currentStatus !== 'draft') {
      await connection.rollback();
      return ResponseHandler.error(res, '只有草稿状态的调拨单可以删除', 'BAD_REQUEST', 400);
    }

    // 删除调拨单物料明细
    await connection.execute('DELETE FROM inventory_transfer_items WHERE transfer_id = ?', [id]);

    // 删除调拨单
    await connection.execute('DELETE FROM inventory_transfers WHERE id = ?', [id]);

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
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { newStatus } = req.body;

    // 验证状态参数
    const validStatuses = ['draft', 'pending', 'approved', 'completed', 'cancelled'];
    if (!validStatuses.includes(newStatus)) {
      await connection.rollback();
      return ResponseHandler.error(res, '无效的状态值', 'BAD_REQUEST', 400);
    }

    // 获取当前调拨单信息
    const [transferResults] = await connection.execute(
      `SELECT 
        t.*,
        fl.name as from_location_name,
        tl.name as to_location_name
      FROM inventory_transfers t
      LEFT JOIN locations fl ON t.from_location_id = fl.id
      LEFT JOIN locations tl ON t.to_location_id = tl.id
      WHERE t.id = ?`,
      [id]
    );

    if (transferResults.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '调拨单不存在', 'NOT_FOUND', 404);
    }

    const transfer = transferResults[0];
    const currentStatus = transfer.status;

    // 状态转换逻辑验证
    const validTransitions = {
      draft: ['pending', 'cancelled'],
      pending: ['approved', 'cancelled'],
      approved: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[currentStatus].includes(newStatus)) {
      await connection.rollback();
      return res.status(400).json({
        message: `调拨单状态无法从 "${currentStatus}" 变更为 "${newStatus}"`,
      });
    }

    // 如果状态从'approved'变更为'completed'，执行实际的库存转移
    if (currentStatus === STATUS.TRANSFER.APPROVED && newStatus === STATUS.TRANSFER.COMPLETED) {
      // 获取调拨单物料明细
      const [items] = await connection.execute(
        `SELECT
          i.id, 
          i.material_id, 
          i.quantity,
          m.name as material_name,
          m.unit_id
        FROM inventory_transfer_items i
        LEFT JOIN materials m ON i.material_id = m.id
        WHERE i.transfer_id = ?`,
        [id]
      );

      // 获取库位名称用于备注（循环外只查一次，所有物料共享同一源/目标库位）
      const fromLocationName = transfer.from_location_name || `库位ID:${transfer.from_location_id}`;
      const toLocationName = transfer.to_location_name || `库位ID:${transfer.to_location_id}`;

      // 处理每个物料的库存转移 - 使用统一的库存服务
      for (const item of items) {
        const materialId = item.material_id;
        const quantity = parseFloat(item.quantity);

        // 使用统一的库存服务进行库存转移
        try {
          await InventoryService.transferStock(
            {
              materialId,
              fromLocationId: transfer.from_location_id,
              toLocationId: transfer.to_location_id,
              quantity,
              referenceNo: transfer.transfer_no,
              referenceType: 'transfer',
              operator: req.user?.username || 'system',
              remark: `从 ${fromLocationName} 调拨至 ${toLocationName}`,
              unitId: item.unit_id,
            },
            connection
          );
        } catch (error) {
          logger.error(
            `库存转移失败 - 物料ID:${materialId}, 调拨单:${transfer.transfer_no}:`,
            error
          );
          throw error;
        }
      }
    }

    // 更新调拨单状态
    await connection.execute(
      'UPDATE inventory_transfers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newStatus, id]
    );

    await connection.commit();

    ResponseHandler.success(res, { id, status: newStatus }, '调拨单状态更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新库存调拨单状态失败:', error);
    ResponseHandler.error(res, '更新库存调拨单状态失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 获取调拨单统计信息
const getTransferStatistics = async (req, res) => {
  try {
    const [results] = await db.pool.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingCount,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approvedCount,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedCount,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelledCount
      FROM inventory_transfers
    `);

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
      return ResponseHandler.error(res, '请选择要导出的调拨单', 'BAD_REQUEST', 400);
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
    const placeholders = ids.map(() => '?').join(',');
    const [transfers] = await db.pool.execute(
      `
      SELECT 
        t.id,
        t.transfer_no,
        t.from_location_id,
        t.to_location_id,
        t.status,
        t.transfer_date,
        t.remarks,
        t.created_at,
        fl.name as from_location,
        tl.name as to_location
      FROM inventory_transfers t
      LEFT JOIN locations fl ON t.from_location_id = fl.id
      LEFT JOIN locations tl ON t.to_location_id = tl.id
      WHERE t.id IN (${placeholders})
      ORDER BY t.created_at DESC
    `,
      ids
    );

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

      // 查询调拨单明细
      const [items] = await db.pool.execute(
        `
        SELECT 
          ti.*,
          m.code as material_code,
          m.name as material_name,
          m.specification,
          u.name as unit_name
        FROM inventory_transfer_items ti
        LEFT JOIN materials m ON ti.material_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        WHERE ti.transfer_id = ?
        ORDER BY ti.id
      `,
        [transfer.id]
      );

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
      return ResponseHandler.error(res, '请选择要删除的调拨单', 'BAD_REQUEST', 400);
    }

    // 检查所有调拨单的状态
    const placeholders = ids.map(() => '?').join(',');
    const [transferResults] = await connection.execute(
      `SELECT id, transfer_no, status FROM inventory_transfers WHERE id IN (${placeholders})`,
      ids
    );

    if (transferResults.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '未找到要删除的调拨单', 'NOT_FOUND', 404);
    }

    // 检查是否有非草稿状态的调拨单
    const nonDraftTransfers = transferResults.filter((t) => t.status !== 'draft');
    if (nonDraftTransfers.length > 0) {
      await connection.rollback();
      const nonDraftNos = nonDraftTransfers.map((t) => t.transfer_no).join(', ');
      return ResponseHandler.error(
        res,
        `以下调拨单不是草稿状态，无法删除: ${nonDraftNos}`,
        'BAD_REQUEST',
        400
      );
    }

    // 批量删除调拨单物料明细
    await connection.execute(
      `DELETE FROM inventory_transfer_items WHERE transfer_id IN (${placeholders})`,
      ids
    );

    // 批量删除调拨单
    const [result] = await connection.execute(
      `DELETE FROM inventory_transfers WHERE id IN (${placeholders})`,
      ids
    );

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
const getCheckStatistics = async (req, res) => {
  try {
    const [results] = await db.pool.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingCount,
        SUM(CASE WHEN status = 'inProgress' THEN 1 ELSE 0 END) as inProgressCount,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedCount,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelledCount
      FROM inventory_checks
    `);

    ResponseHandler.success(res, results[0], '获取库存盘点统计信息成功');
  } catch (error) {
    logger.error('获取库存盘点统计信息失败:', error);
    ResponseHandler.error(res, '获取库存盘点统计信息失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取库存盘点列表
const getCheckList = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      whereClause += ' AND (c.check_no LIKE ? OR l.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (status) {
      whereClause += ' AND c.status = ?';
      params.push(status);
    }

    const countQuery = `
      SELECT COUNT(*) as total
      FROM inventory_checks c
      LEFT JOIN locations l ON c.location_id = l.id
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
        u.username as creator_name,
        u.real_name as creator_real_name,
        COALESCE(c.check_type, 'warehouse') as check_type,
        (SELECT COUNT(*) FROM inventory_check_items WHERE check_id = c.id) as item_count
      FROM inventory_checks c
      LEFT JOIN locations l ON c.location_id = l.id
      LEFT JOIN users u ON c.created_by = u.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;

    const [checks] = await db.pool.execute(listQuery, params);

    // 处理返回数据，确保字段映射正确
    const processedChecks = checks.map((check) => ({
      ...check,
      warehouse: check.location_name || '未知仓库',
      creator: check.creator_real_name || check.creator_name || '未知',
      check_type: check.check_type || 'warehouse',
    }));

    ResponseHandler.paginated(
      res,
      processedChecks,
      total,
      parseInt(page),
      parseInt(limit),
      '获取库存盘点列表成功'
    );
  } catch (error) {
    logger.error('获取库存盘点列表失败:', error);
    ResponseHandler.error(res, '获取库存盘点列表失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取库存盘点详情
const getCheckDetail = async (req, res) => {
  try {
    const { id } = req.params;

    // 获取盘点单基本信息
    const [checkResults] = await db.pool.execute(
      `SELECT 
        c.*,
        l.name as location_name,
        u.username as creator_name
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

    // 确保数值类型正确
    const processedItems = items.map((item) => ({
      ...item,
      system_quantity: parseFloat(item.system_quantity || 0),
      actual_quantity: parseFloat(item.actual_quantity || 0),
      difference: parseFloat(item.difference || 0),
      // 添加前端需要的字段别名
      book_qty: parseFloat(item.system_quantity || 0),
      actual_qty: parseFloat(item.actual_quantity || 0),
      specs: item.material_specs,
    }));

    ResponseHandler.success(
      res,
      {
        ...check,
        items: processedItems,
      },
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

    const { location_id, check_date, check_type, remark } = req.body;

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

    // 生成盘点单号
    const dateStr = check_date.replace(/-/g, '');
    const [result] = await connection.execute(
      'SELECT MAX(check_no) as max_no FROM inventory_checks WHERE check_no LIKE ?',
      [`IC${dateStr}%`]
    );
    const maxNo = result[0].max_no || `IC${dateStr}000`;
    const checkNo = `IC${dateStr}${(parseInt(maxNo.slice(-3)) + 1).toString().padStart(3, '0')}`;

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
        req.user?.id || 1, // 默认用户ID为1
      ]
    );

    const checkId = checkResult.insertId;

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
      for (const item of stockItems) {
        // 获取该物料最新的库存事务记录，确保使用最新的库存数量
        const [transactionResult] = await connection.execute(
          `SELECT after_quantity 
           FROM inventory_ledger 
           WHERE material_id = ? AND location_id = ? 
           ORDER BY created_at DESC 
           LIMIT 1`,
          [item.material_id, location_id]
        );

        // 确定实际系统数量 - 优先使用事务记录的after_quantity
        let actualSystemQuantity = parseFloat(item.system_quantity || 0);
        if (transactionResult.length > 0 && transactionResult[0].after_quantity !== null) {
          actualSystemQuantity = parseFloat(transactionResult[0].after_quantity);
        }

        await connection.execute(
          `INSERT INTO inventory_check_items (
            check_id, 
            material_id, 
            system_quantity, 
            actual_quantity, 
            unit_id,
            difference
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            checkId,
            item.material_id,
            actualSystemQuantity,
            actualSystemQuantity, // 默认实际数量等于系统数量
            item.unit_id,
            0, // 默认差异为零
          ]
        );
      }
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        message: '盘点单创建成功',
        id: checkId,
        check_no: checkNo,
      },
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
const updateCheck = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { check_date, remark, items } = req.body;

    // 检查盘点单是否存在
    const [checkResult] = await connection.execute(
      'SELECT status FROM inventory_checks WHERE id = ?',
      [id]
    );

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '盘点单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = checkResult[0].status;

    // 只有草稿状态的盘点单可以更新
    if (currentStatus !== 'draft') {
      await connection.rollback();
      return ResponseHandler.error(res, '只有草稿状态的盘点单可以更新', 'BAD_REQUEST', 400);
    }

    // 更新盘点单基本信息
    await connection.execute(
      `UPDATE inventory_checks SET 
        check_date = ?, 
        remark = ?, 
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?`,
      [check_date, remark || null, id]
    );

    // 如果提供了物料明细，更新明细
    if (items && Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        if (!item.id || !item.actual_quantity) {
          continue;
        }

        const systemQuantity = parseFloat(item.system_quantity) || 0;
        const actualQuantity = parseFloat(item.actual_quantity) || 0;
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
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // 检查盘点单是否存在
    const [checkResult] = await connection.execute(
      'SELECT status FROM inventory_checks WHERE id = ?',
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
    await connection.execute('DELETE FROM inventory_checks WHERE id = ?', [id]);

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

// 提交盘点结果
const submitCheckResult = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { items } = req.body;

    // 检查盘点单是否存在
    const [checkResult] = await connection.execute('SELECT * FROM inventory_checks WHERE id = ?', [
      id,
    ]);

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

    // 更新盘点单状态为待审核
    await connection.execute(
      'UPDATE inventory_checks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['pending', id]
    );

    // 如果提供了物料明细，更新明细
    if (items && Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        if (!item.id || item.actual_quantity === undefined) {
          continue;
        }

        const systemQuantity = parseFloat(item.system_quantity) || 0;
        const actualQuantity = parseFloat(item.actual_quantity) || 0;
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
    const [checkResult] = await connection.execute('SELECT * FROM inventory_checks WHERE id = ?', [
      id,
    ]);

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '盘点单不存在', 'NOT_FOUND', 404);
    }

    const check = checkResult[0];
    const currentStatus = check.status;

    // 状态转换验证
    const validTransitions = {
      draft: ['in_progress', 'cancelled'],
      in_progress: ['pending', 'cancelled'],
      pending: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[currentStatus].includes(status)) {
      await connection.rollback();
      return res.status(400).json({
        message: `无法从"${currentStatus}"状态转换为"${status}"状态`,
      });
    }

    // 更新状态
    await connection.execute(
      'UPDATE inventory_checks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
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
    const [checkResult] = await connection.execute('SELECT * FROM inventory_checks WHERE id = ?', [
      id,
    ]);

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

    // 处理每个物料的库存调整
    for (const item of items) {
      // 只处理有差异的物料
      if (parseFloat(item.difference) === 0) {
        continue;
      }

      // 获取当前库存（移除HAVING条件，获取真实库存数量）
      const [stockResult] = await connection.execute(
        'SELECT material_id, location_id, SUM(il.quantity) as quantity FROM inventory_ledger il JOIN materials mat ON il.material_id = mat.id WHERE il.material_id = ? AND il.location_id = ? AND (mat.location_id IS NULL OR il.location_id = mat.location_id) GROUP BY material_id, location_id',
        [item.material_id, check.location_id]
      );

      const currentQuantity = stockResult.length > 0 ? parseFloat(stockResult[0].quantity) : 0;
      const newQuantity = parseFloat(item.actual_quantity);
      const difference = parseFloat(item.difference);

      // 记录库存交易日志
      await _insertInventoryLedgerLocal(connection, {
        material_id: item.material_id,
        location_id: check.location_id,
        transaction_type: 'check',
        quantity: difference,
        unit_id: item.unit_id,
        reference_no: check.check_no,
        reference_type: 'check',
        operator: req.user?.username || 'system',
        remark: `盘点调整：系统库存${currentQuantity}，实际库存${newQuantity}，差异${difference}`,
        beforeQuantity: currentQuantity,
        afterQuantity: newQuantity,
      });

      // 在新架构中，库存通过inventory_ledger流水记录汇总计算
      // 只需要插入调整记录，无需直接更新库存表
    }

    // 更新盘点单状态为已完成
    await connection.execute(
      'UPDATE inventory_checks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['completed', id]
    );

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
const getBatchInventory = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const { materialIds, locationIds } = req.body;

    if (!materialIds || !Array.isArray(materialIds) || materialIds.length === 0) {
      return ResponseHandler.error(res, '物料ID列表不能为空', 'BAD_REQUEST', 400);
    }

    // 构建批量查询SQL
    const materialIdList = materialIds.map((id) => parseInt(id)).filter((id) => !isNaN(id));
    const locationFilter =
      locationIds && locationIds.length > 0
        ? `AND location_id IN (${locationIds.map((id) => parseInt(id)).join(',')})`
        : '';

    // 优化的库存查询SQL - 优先使用事务记录聚合，库存表作为补充
    const inventoryQuery = `
      WITH transaction_inventory AS (
        SELECT
          material_id,
          location_id,
          SUM(quantity) as calculated_quantity
        FROM inventory_ledger
        WHERE material_id IN (${materialIdList.join(',')}) ${locationFilter}
        GROUP BY material_id, location_id
        HAVING calculated_quantity > 0
      ),
      stock_inventory AS (
        SELECT
          material_id,
          location_id,
          quantity as stock_quantity
        FROM ${STOCK_SUBQUERY} as current_stock
        WHERE material_id IN (${materialIdList.join(',')}) ${locationFilter}
        AND quantity > 0
      )
      SELECT
        COALESCE(t.material_id, s.material_id) as material_id,
        COALESCE(t.location_id, s.location_id) as location_id,
        COALESCE(t.calculated_quantity, s.stock_quantity, 0) as quantity,
        CASE
          WHEN t.material_id IS NOT NULL THEN 'transaction'
          ELSE 'stock'
        END as source,
        m.name as material_name,
        m.code as material_code,
        m.unit,
        l.name as location_name
      FROM transaction_inventory t
      FULL OUTER JOIN stock_inventory s ON t.material_id = s.material_id AND t.location_id = s.location_id
      LEFT JOIN materials m ON COALESCE(t.material_id, s.material_id) = m.id
      LEFT JOIN locations l ON COALESCE(t.location_id, s.location_id) = l.id
      ORDER BY material_id, location_id
    `;

    const [inventoryResults] = await connection.execute(inventoryQuery);

    // 构建结果映射
    const inventoryMap = {};
    inventoryResults.forEach((row) => {
      const key = `${row.material_id}_${row.location_id}`;
      inventoryMap[key] = {
        materialId: row.material_id,
        locationId: row.location_id,
        quantity: parseFloat(row.quantity) || 0,
        source: row.source,
        materialName: row.material_name,
        materialCode: row.material_code,
        unit: row.unit,
        locationName: row.location_name,
      };
    });

    // 预取物料和库位名称信息（消除双层循环内 N+1 查询）
    const matPlaceholders = materialIdList.map(() => '?').join(',');
    const [allMaterialInfo] = await connection.execute(
      `SELECT id, name, code, unit FROM materials WHERE id IN (${matPlaceholders})`,
      materialIdList
    );
    const materialNameMap = {};
    allMaterialInfo.forEach(m => {
      materialNameMap[m.id] = { name: m.name, code: m.code, unit: m.unit };
    });

    // 如果没有指定库位，查询所有启用的库位（只查一次）
    let resolvedLocations = locationIds && locationIds.length > 0 ? locationIds : null;
    if (!resolvedLocations) {
      const [activeLocations] = await connection.execute(
        'SELECT id FROM locations WHERE status = 1 ORDER BY id ASC LIMIT 10'
      );
      resolvedLocations = activeLocations.map((loc) => loc.id);
    }

    // 预取所有相关库位名称
    const locPlaceholders = resolvedLocations.map(() => '?').join(',');
    const [allLocationInfo] = await connection.execute(
      `SELECT id, name FROM locations WHERE id IN (${locPlaceholders})`,
      resolvedLocations
    );
    const locationNameMap = {};
    allLocationInfo.forEach(l => {
      locationNameMap[l.id] = l.name;
    });

    // 为请求的所有物料-库位组合填充结果（包括零库存）
    const results = [];
    for (const materialId of materialIdList) {
      for (const locationId of resolvedLocations) {
        const key = `${materialId}_${locationId}`;
        if (inventoryMap[key]) {
          results.push(inventoryMap[key]);
        } else {
          const matName = materialNameMap[materialId] || {};
          results.push({
            materialId: parseInt(materialId),
            locationId: parseInt(locationId),
            quantity: 0,
            source: 'none',
            materialName: matName.name || `物料${materialId}`,
            materialCode: matName.code || '',
            unit: matName.unit || '个',
            locationName: locationNameMap[locationId] || `库位${locationId}`,
          });
        }
      }
    }

    ResponseHandler.success(
      res,
      {
        data: results,
        summary: {
          totalMaterials: materialIdList.length,
          totalRecords: results.length,
          hasStock: results.filter((r) => r.quantity > 0).length,
          zeroStock: results.filter((r) => r.quantity === 0).length,
        },
      },
      '批量库存查询成功'
    );
  } catch (error) {
    ResponseHandler.error(res, '批量库存查询失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 获取物料库存台账
const getMaterialLedger = async (req, res) => {
  try {
    const { materialId } = req.params;
    const { page = 1, limit = 20, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;

    // 构建查询条件
    let whereClause = 'WHERE l.material_id = ?';
    const queryParams = [materialId];

    if (startDate) {
      whereClause += ' AND l.created_at >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND l.created_at <= ?';
      queryParams.push(endDate + ' 23:59:59');
    }

    // 获取物料库存台账记录
    const query = `
      SELECT
        l.id,
        l.transaction_type,
        l.quantity,
        l.unit_id,
        u.name as unit_name,
        l.reference_no,
        l.reference_type,
        l.operator,
        l.remark,
        l.before_quantity,
        l.after_quantity,
        l.created_at,
        loc.name as location_name,
        m.code as material_code,
        m.name as material_name
      FROM inventory_ledger l
      JOIN materials m ON l.material_id = m.id
      LEFT JOIN units u ON l.unit_id = u.id
      LEFT JOIN locations loc ON l.location_id = loc.id
      ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;

    const [rows] = await db.pool.execute(query, queryParams);

    // 获取总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM inventory_ledger l
      ${whereClause}
    `;
    const [countResult] = await db.pool.execute(countQuery, queryParams);

    ResponseHandler.success(
      res,
      {
        data: rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit),
        },
      },
      '获取物料库存台账成功'
    );
  } catch (error) {
    logger.error('获取物料库存台账失败:', error);
    ResponseHandler.error(res, '获取物料库存台账失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取低库存预警
const getLowStock = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // 获取低库存物料（库存量小于最小库存量的物料）
    const query = `
      SELECT
        m.id,
        m.code,
        m.name,
        m.specs as specification,
        m.min_stock,
        m.max_stock,
        c.name as category_name,
        u.name as unit_name,
        loc.name as location_name,
        COALESCE(stock.current_quantity, 0) as current_quantity,
        CASE
          WHEN COALESCE(stock.current_quantity, 0) = 0 THEN '缺货'
          WHEN COALESCE(stock.current_quantity, 0) < m.min_stock THEN '低库存'
          ELSE '正常'
        END as status
      FROM materials m
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN units u ON m.unit_id = u.id
      LEFT JOIN locations loc ON m.location_id = loc.id
      LEFT JOIN (
        SELECT
          il.material_id,
          il.location_id,
          SUM(il.quantity) as current_quantity
        FROM inventory_ledger il
        JOIN materials mat2 ON il.material_id = mat2.id
        WHERE mat2.location_id IS NULL OR il.location_id = mat2.location_id
        GROUP BY il.material_id, il.location_id
        HAVING SUM(il.quantity) >= 0
      ) stock ON m.id = stock.material_id AND m.location_id = stock.location_id
      WHERE m.min_stock > 0
        AND (COALESCE(stock.current_quantity, 0) < m.min_stock OR stock.current_quantity IS NULL)
        AND m.status = 'active'
      ORDER BY
        CASE
          WHEN COALESCE(stock.current_quantity, 0) = 0 THEN 1
          ELSE 2
        END,
        (m.min_stock - COALESCE(stock.current_quantity, 0)) DESC
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;

    const [rows] = await db.pool.execute(query);

    // 获取总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM materials m
      LEFT JOIN (
        SELECT
          il.material_id,
          il.location_id,
          SUM(il.quantity) as current_quantity
        FROM inventory_ledger il
        JOIN materials mat2 ON il.material_id = mat2.id
        WHERE mat2.location_id IS NULL OR il.location_id = mat2.location_id
        GROUP BY il.material_id, il.location_id
        HAVING SUM(il.quantity) >= 0
      ) stock ON m.id = stock.material_id AND m.location_id = stock.location_id
      WHERE m.min_stock > 0
        AND (COALESCE(stock.current_quantity, 0) < m.min_stock OR stock.current_quantity IS NULL)
        AND m.status = 'active'
    `;
    const [countResult] = await db.pool.execute(countQuery);

    ResponseHandler.success(
      res,
      {
        data: rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit),
        },
      },
      '获取低库存预警成功'
    );
  } catch (error) {
    logger.error('获取低库存预警失败:', error);
    ResponseHandler.error(res, '获取低库存预警失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取库存变动记录
const getMovements = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      materialId,
      locationId,
      transactionType,
      startDate,
      endDate,
    } = req.query;
    const offset = (page - 1) * limit;

    // 构建查询条件
    let whereClause = 'WHERE 1=1';
    const queryParams = [];

    if (materialId) {
      whereClause += ' AND l.material_id = ?';
      queryParams.push(materialId);
    }

    if (locationId) {
      whereClause += ' AND l.location_id = ?';
      queryParams.push(locationId);
    }

    if (transactionType) {
      whereClause += ' AND l.transaction_type = ?';
      queryParams.push(transactionType);
    }

    if (startDate) {
      whereClause += ' AND l.created_at >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND l.created_at <= ?';
      queryParams.push(endDate + ' 23:59:59');
    }

    // 获取库存变动记录
    const query = `
      SELECT
        l.id,
        l.material_id,
        m.code as material_code,
        m.name as material_name,
        m.specs as specification,
        l.location_id,
        loc.name as location_name,
        l.transaction_type,
        l.quantity,
        l.unit_id,
        u.name as unit_name,
        l.reference_no,
        l.reference_type,
        l.operator,
        l.remark,
        l.before_quantity,
        l.after_quantity,
        l.created_at,
        CASE
          WHEN l.quantity > 0 THEN '入库'
          WHEN l.quantity < 0 THEN '出库'
          ELSE '调整'
        END as movement_type
      FROM inventory_ledger l
      JOIN materials m ON l.material_id = m.id
      LEFT JOIN units u ON l.unit_id = u.id
      LEFT JOIN locations loc ON l.location_id = loc.id
      ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;

    const [rows] = await db.pool.execute(query, queryParams);

    // 获取总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM inventory_ledger l
      JOIN materials m ON l.material_id = m.id
      ${whereClause}
    `;
    const [countResult] = await db.pool.execute(countQuery, queryParams);

    // 获取统计信息
    const statsQuery = `
      SELECT
        COUNT(*) as total_movements,
        SUM(CASE WHEN l.quantity > 0 THEN 1 ELSE 0 END) as inbound_count,
        SUM(CASE WHEN l.quantity < 0 THEN 1 ELSE 0 END) as outbound_count,
        SUM(CASE WHEN l.quantity > 0 THEN l.quantity ELSE 0 END) as total_inbound,
        SUM(CASE WHEN l.quantity < 0 THEN ABS(l.quantity) ELSE 0 END) as total_outbound
      FROM inventory_ledger l
      JOIN materials m ON l.material_id = m.id
      ${whereClause}
    `;
    const [statsResult] = await db.pool.execute(statsQuery, queryParams);

    ResponseHandler.success(
      res,
      {
        items: rows,
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        statistics: statsResult[0],
      },
      '获取库存变动记录成功'
    );
  } catch (error) {
    logger.error('获取库存变动记录失败:', error);
    ResponseHandler.error(res, '获取库存变动记录失败', 'SERVER_ERROR', 500, error);
  }
};
// 统一的库存充足性检查
const checkStockSufficiency = async (req, res) => {
  try {
    const { requirements } = req.body;

    if (!requirements || !Array.isArray(requirements)) {
      return ResponseHandler.error(res, '无效的需求数据', 'BAD_REQUEST', 400);
    }

    // 使用已导入的InventoryService
    const insufficientItems = await InventoryService.checkStockSufficiency(requirements);

    ResponseHandler.success(
      res,
      insufficientItems,
      insufficientItems.length > 0
        ? `发现 ${insufficientItems.length} 个物料库存不足`
        : '所有物料库存充足'
    );
  } catch (error) {
    logger.error('库存充足性检查失败:', error);
    ResponseHandler.error(res, '库存充足性检查失败', 'SERVER_ERROR', 500, error);
  }
};

// 下载库存导入模板
const downloadStockTemplate = async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();

    // 创建说明页
    const instructionSheet = workbook.addWorksheet('导入说明');
    instructionSheet.columns = [
      { header: '字段名', key: 'field', width: 40 },
      { header: '说明', key: 'description', width: 40 },
      { header: '示例', key: 'example', width: 20 },
    ];
    instructionSheet.addRow({
      field: '物料编码',
      description: '必填，物料的唯一编码',
      example: 'M001',
    });
    instructionSheet.addRow({
      field: '库位编码',
      description: '必填，库位的唯一编码',
      example: 'RM-A01',
    });
    instructionSheet.addRow({
      field: '库存数量',
      description: '必填，要设置的库存数量',
      example: '100',
    });
    instructionSheet.addRow({
      field: '备注',
      description: '可选，库存调整的备注信息',
      example: '期初库存导入',
    });
    instructionSheet.addRow({ field: '', description: '', example: '' });
    instructionSheet.addRow({ field: '注意事项：', description: '', example: '' });
    instructionSheet.addRow({
      field: '1. 物料编码、库位编码、库存数量为必填项',
      description: '',
      example: '',
    });
    instructionSheet.addRow({
      field: '2. 导入时会根据物料编码和库位编码更新对应的库存数量',
      description: '',
      example: '',
    });
    instructionSheet.addRow({ field: '3. 最多支持导入10000条记录', description: '', example: '' });
    instructionSheet.addRow({ field: '4. 请删除此说明页后再导入', description: '', example: '' });

    // 创建数据模板页
    const templateSheet = workbook.addWorksheet('库存数据');
    templateSheet.columns = [
      { header: '物料编码', key: 'material_code', width: 15 },
      { header: '库位编码', key: 'location_code', width: 15 },
      { header: '库存数量', key: 'quantity', width: 12 },
      { header: '备注', key: 'remark', width: 20 },
    ];
    templateSheet.addRow({
      material_code: 'M001',
      location_code: 'RM-A01',
      quantity: '100',
      remark: '期初库存导入',
    });
    templateSheet.addRow({
      material_code: 'M002',
      location_code: 'RM-A02',
      quantity: '50',
      remark: '期初库存导入',
    });
    templateSheet.addRow({
      material_code: 'M003',
      location_code: 'WS-B01',
      quantity: '200',
      remark: '期初库存导入',
    });

    // 生成Excel文件
    const excelBuffer = await workbook.xlsx.writeBuffer();

    // 设置响应头
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=stock_import_template.xlsx');

    res.send(excelBuffer);
  } catch (error) {
    logger.error('生成库存导入模板失败:', error);
    ResponseHandler.error(res, '生成模板失败', 'SERVER_ERROR', 500, error);
  }
};

// 导入库存数据
const importStock = async (req, res) => {
  const connection = await db.pool.getConnection();

  try {
    if (!req.file) {
      return ResponseHandler.error(res, '请选择要导入的Excel文件', 'BAD_REQUEST', 400);
    }

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    // 获取第一个工作表（通常是数据表）
    let worksheet = workbook.worksheets[0];

    // 如果第一个是说明页，使用第二个
    if (worksheet.name.includes('说明') && workbook.worksheets.length > 1) {
      worksheet = workbook.worksheets[1];
    }

    // 读取数据
    const jsonData = [];
    const headers = [];
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber - 1] = cell.value;
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // 跳过表头
      const rowData = {};
      row.eachCell((cell, colNumber) => {
        rowData[headers[colNumber - 1]] = cell.value;
      });
      jsonData.push(rowData);
    });

    if (!jsonData || jsonData.length === 0) {
      return ResponseHandler.error(res, 'Excel文件中没有找到有效数据', 'BAD_REQUEST', 400);
    }

    if (jsonData.length > 10000) {
      return ResponseHandler.error(res, '导入数据不能超过10000条', 'BAD_REQUEST', 400);
    }

    // 转换数据格式
    const stockData = jsonData.map((row, index) => ({
      material_code: row['物料编码'] || row['material_code'] || '',
      location_code: row['库位编码'] || row['location_code'] || '',
      quantity: parseFloat(row['库存数量'] || row['quantity'] || 0),
      remark: row['备注'] || row['remark'] || '库存导入',
      row: index + 2, // Excel行号（从第2行开始）
    }));

    logger.info(`开始导入 ${stockData.length} 条库存数据`);

    await connection.beginTransaction();

    const results = {
      success: [],
      errors: [],
    };

    for (let i = 0; i < stockData.length; i++) {
      const stock = stockData[i];
      logger.info(`处理第 ${i + 1} 条库存数据:`, stock);

      try {
        // 使用统一验证工具验证必填字段
        const requiredFieldsError = validateRequiredFields(
          stock,
          ['material_code', 'location_code', 'quantity'],
          {
            material_code: '物料编码',
            location_code: '库位编码',
            quantity: '库存数量',
          }
        );

        if (requiredFieldsError) {
          results.errors.push({
            row: stock.row,
            data: stock,
            error: requiredFieldsError.message,
          });
          continue;
        }

        // 使用统一验证工具验证数量范围
        const parsedQuantity = parseFloat(stock.quantity);
        // const rangeError = validateRange(parsedQuantity, 0, undefined, '库存数量');

        if (parsedQuantity < 0) {
          results.errors.push({
            row: stock.row,
            data: stock,
            error: rangeError.message,
          });
          continue;
        }

        // ✅ 增强验证：查找物料ID并验证物料状态
        const [materials] = await connection.query(
          'SELECT id, name, status, unit_id FROM materials WHERE code = ?',
          [stock.material_code]
        );

        if (materials.length === 0) {
          results.errors.push({
            row: stock.row,
            data: stock,
            error: `物料编码 ${stock.material_code} 不存在，请先在系统中创建该物料`,
          });
          continue;
        }

        // ✅ 增强验证：检查物料是否启用
        if (materials[0].status !== 1) {
          results.errors.push({
            row: stock.row,
            data: stock,
            error: `物料 ${stock.material_code} 已停用，无法导入库存`,
          });
          continue;
        }

        // ✅ 增强验证：查找库位ID并验证库位状态
        const [locations] = await connection.query(
          'SELECT id, name, status FROM locations WHERE code = ?',
          [stock.location_code]
        );

        if (locations.length === 0) {
          results.errors.push({
            row: stock.row,
            data: stock,
            error: `库位编码 ${stock.location_code} 不存在，请先在系统中创建该库位`,
          });
          continue;
        }

        // ✅ 增强验证：检查库位是否启用
        if (locations[0].status !== undefined && locations[0].status !== 1) {
          results.errors.push({
            row: stock.row,
            data: stock,
            error: `库位 ${stock.location_code} 已停用，无法导入库存`,
          });
          continue;
        }

        const materialId = materials[0].id;
        const locationId = locations[0].id;
        const materialName = materials[0].name;
        const locationName = locations[0].name;

        // 检查当前库存（从inventory_ledger表计算）
        const [currentStock] = await connection.query(
          `
          SELECT COALESCE(SUM(quantity), 0) as quantity
          FROM inventory_ledger
          WHERE material_id = ? AND location_id = ?
        `,
          [materialId, locationId]
        );

        const currentQuantity = currentStock.length > 0 ? parseFloat(currentStock[0].quantity) : 0;
        const newQuantity = parsedQuantity; // ✅ 使用已验证的数量
        const adjustmentQuantity = newQuantity - currentQuantity;

        if (Math.abs(adjustmentQuantity) < 0.001) {
          // 数量没有变化，跳过
          results.success.push({
            material_code: stock.material_code,
            material_name: materialName,
            location_code: stock.location_code,
            location_name: locationName,
            quantity: newQuantity,
            action: 'skipped',
            message: '库存数量无变化',
          });
          continue;
        }

        // 生成调整单号
        const adjustmentNo = await CodeGenerators.generateAdjustmentCode(connection);

        // 🔥 使用统一的 InventoryService 更新库存（自动同步 batch_inventory，及预警系统）
        const InventoryService = require('../../../services/InventoryService');
        await InventoryService.updateStock(
          {
            materialId: materialId,
            locationId: locationId,
            quantity: adjustmentQuantity, // 可以是正数或负数
            transactionType: 'initial_import',
            referenceNo: adjustmentNo,
            referenceType: 'import_adjustment',
            operator: req.user?.username || 'system',
            remark: stock.remark || '初始导入',
            unitId: materials[0].unit_id || null,
            batchNumber: null,
          },
          connection
        );

        results.success.push({
          material_code: stock.material_code,
          material_name: materialName,
          location_code: stock.location_code,
          location_name: locationName,
          quantity: newQuantity,
          adjustment: adjustmentQuantity,
          action: adjustmentQuantity > 0 ? 'increased' : 'decreased',
        });
      } catch (itemError) {
        logger.error(`处理第 ${i + 1} 条库存数据失败:`, itemError);
        results.errors.push({
          row: stock.row,
          data: stock,
          error: itemError.message,
        });
      }
    }

    await connection.commit();

    logger.info('库存导入完成:', {
      成功: results.success.length,
      失败: results.errors.length,
    });

    ResponseHandler.success(
      res,
      {
        successCount: results.success.length,
        errorCount: results.errors.length,
        successData: results.success,
        errors: results.errors,
      },
      `导入完成，成功 ${results.success.length} 条，失败 ${results.errors.length} 条`
    );
  } catch (error) {
    await connection.rollback();
    logger.error('库存导入失败:', error);
    ResponseHandler.error(res, '导入失败: ' + error.message, 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 导出库存数据 —— 复用 getStockList 同源 SQL 模式，确保导出与列表页完全一致
const exportStockData = async (req, res) => {
  try {
    const filters = req.body;
    logger.info('开始导出库存数据，过滤条件:', filters);

    // ========== 1. 构建与 getStockList 完全一致的筛选条件 ==========
    const whereConditions = [];
    const queryParams = [];

    // 批量导出：按指定物料ID筛选
    if (filters.material_ids && Array.isArray(filters.material_ids) && filters.material_ids.length > 0) {
      whereConditions.push(`cs.material_id IN (${filters.material_ids.map(() => '?').join(',')})`);
      queryParams.push(...filters.material_ids);
    }

    // 关键字搜索
    if (filters.search && filters.search.trim()) {
      whereConditions.push('(m.code LIKE ? OR m.name LIKE ? OR m.specs LIKE ?)');
      queryParams.push(`%${filters.search.trim()}%`, `%${filters.search.trim()}%`, `%${filters.search.trim()}%`);
    }

    // 仓库筛选
    if (filters.location_id && filters.location_id !== '') {
      whereConditions.push('cs.location_id = ?');
      queryParams.push(filters.location_id);
    }

    // 类别筛选
    if (filters.category_id && filters.category_id !== '') {
      whereConditions.push('m.category_id = ?');
      queryParams.push(filters.category_id);
    }

    // 库存数量范围
    if (filters.min_quantity && filters.min_quantity !== '') {
      whereConditions.push('cs.quantity >= ?');
      queryParams.push(parseFloat(filters.min_quantity));
    }
    if (filters.max_quantity && filters.max_quantity !== '') {
      whereConditions.push('cs.quantity <= ?');
      queryParams.push(parseFloat(filters.max_quantity));
    }

    // 更新时间范围
    if (filters.start_date && filters.start_date !== '') {
      whereConditions.push('cs.last_updated >= ?');
      queryParams.push(filters.start_date);
    }
    if (filters.end_date && filters.end_date !== '') {
      whereConditions.push('cs.last_updated <= ?');
      queryParams.push(filters.end_date + ' 23:59:59');
    }

    // 库存状态
    if (filters.stock_status && filters.stock_status !== '') {
      if (filters.stock_status === 'zero') {
        whereConditions.push('cs.quantity = 0');
      } else if (filters.stock_status === 'low') {
        whereConditions.push('cs.quantity > 0');
        whereConditions.push('cs.quantity <= IFNULL(m.min_stock, 0)');
        whereConditions.push('IFNULL(m.min_stock, 0) > 0');
      } else if (filters.stock_status === 'normal') {
        whereConditions.push('(cs.quantity > IFNULL(m.min_stock, 0) OR IFNULL(m.min_stock, 0) = 0)');
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // 默认过滤掉零/负库存（与列表页一致）
    const hasActiveFilter = (filters.search && filters.search.trim()) ||
      (filters.location_id && filters.location_id !== '') ||
      (filters.material_ids && filters.material_ids.length > 0);
    let subqueryHaving = hasActiveFilter ? '' : 'HAVING SUM(quantity) > 0';
    if (filters.stock_status === 'zero') {
      subqueryHaving = 'HAVING SUM(quantity) = 0';
    } else if (filters.stock_status === 'negative') {
      subqueryHaving = 'HAVING SUM(quantity) < 0';
    }

    // ========== 2. 主查询 —— 与 getStockList 同源子查询 ==========
    const mainSql = `
      SELECT
        cs.material_id,
        m.code       AS material_code,
        m.name       AS material_name,
        m.specs      AS specification,
        l.name       AS location_name,
        c.name       AS category_name,
        cs.quantity,
        u.name       AS unit_name,
        IFNULL(m.min_stock, 0) AS min_stock,
        cs.last_updated AS updated_at
      FROM (
        SELECT material_id, location_id, SUM(quantity) AS quantity, MAX(created_at) AS last_updated
        FROM inventory_ledger
        GROUP BY material_id, location_id
        ${subqueryHaving}
      ) cs
      LEFT JOIN materials m ON cs.material_id = m.id
      LEFT JOIN locations l ON cs.location_id = l.id
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN units u ON m.unit_id = u.id
      ${whereClause}
      ORDER BY m.code, l.name
    `;

    const [rows] = await db.pool.execute(mainSql, queryParams);
    logger.info(`导出查询到 ${rows.length} 条库存数据`);

    // ========== 3. 批量流水查询（仅当 includeDetails=true）==========
    const recordsMap = {};
    if (filters.includeDetails && rows.length > 0) {
      const allMaterialIds = [...new Set(rows.map(r => r.material_id))];
      const BATCH_SIZE = 1000;

      for (let i = 0; i < allMaterialIds.length; i += BATCH_SIZE) {
        const chunk = allMaterialIds.slice(i, i + BATCH_SIZE);
        const placeholders = chunk.map(() => '?').join(',');
        const ledgerSql = `
          SELECT material_id, transaction_type, reference_no, batch_number,
                 quantity, before_quantity, after_quantity, created_at
          FROM inventory_ledger
          WHERE material_id IN (${placeholders})
          ORDER BY created_at ASC
        `;
        const [ledgerRows] = await db.pool.execute(ledgerSql, chunk);
        ledgerRows.forEach(rec => {
          if (!recordsMap[rec.material_id]) recordsMap[rec.material_id] = [];
          recordsMap[rec.material_id].push(rec);
        });
      }
      logger.info(`批量查询流水完成，涉及 ${Object.keys(recordsMap).length} 种物料`);
    }

    // ========== 4. 流水类型中文映射 ==========
    const txTypeMap = {
      'in': '入库', 'out': '出库',
      'purchase_inbound': '采购入库', 'production_inbound': '生产入库',
      'outsourced_inbound': '委外入库', 'sales_return': '销售退货',
      'transfer_in': '调拨入库', 'adjustment_in': '盘点盘盈',
      'sales_outbound': '销售出库', 'production_outbound': '生产领料',
      'outsourced_outbound': '委外领料', 'purchase_return': '采购退货',
      'transfer_out': '调拨出库', 'adjustment_out': '盘点盘亏',
      'initial_import': '期初导入', 'correction': '差异修正',
      'outbound_cancel': '出库撤销', 'inbound': '入库', 'outbound': '出库',
      'sale': '销售出库', 'sales_exchange_return': '换货退回',
      'sales_exchange_out': '换货发出', 'inventory_init': '库存初始化',
      'manual_in': '手动入库', 'production_return': '生产退料'
    };

    // ========== 5. ExcelJS 渲染 ==========
    const ExcelJS = require('exceljs');
    const moment = require('moment');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('库存明细及状态');

    // 列定义
    worksheet.columns = [
      { header: '物料编码', key: 'material_code', width: 16 },
      { header: '物料名称', key: 'material_name', width: 25 },
      { header: '规格',     key: 'specification', width: 28 },
      { header: '仓库',     key: 'location_name', width: 15 },
      { header: '类别',     key: 'category_name', width: 14 },
      { header: '库存数量', key: 'quantity',      width: 14 },
      { header: '单位',     key: 'unit_name',     width: 8 },
      { header: '状态',     key: 'status',        width: 12 },
      { header: '最近更新时间', key: 'updated_at', width: 20 }
    ];

    // 表头样式
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell({ includeEmpty: true }, cell => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    // 遍历数据行
    rows.forEach(item => {
      const qty = parseFloat(item.quantity) || 0;
      const minStock = parseFloat(item.min_stock) || 0;
      let statusText = '正常';
      if (qty <= 0) statusText = '缺货';
      else if (minStock > 0 && qty < minStock) statusText = '低库存';

      const row = worksheet.addRow({
        material_code: item.material_code,
        material_name: item.material_name,
        specification: item.specification,
        location_name: item.location_name,
        category_name: item.category_name,
        quantity: qty,
        unit_name: item.unit_name,
        status: statusText,
        updated_at: item.updated_at ? moment(item.updated_at).format('YYYY-MM-DD HH:mm:ss') : '-'
      });

      // 主行样式
      row.eachCell({ includeEmpty: true }, cell => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { vertical: 'middle' };
      });
      row.getCell('quantity').numFmt = '#,##0.00';

      // 低库存/缺货红色高亮
      if (statusText === '低库存' || statusText === '缺货') {
        row.getCell('quantity').font = { color: { argb: 'FFF56C6C' }, bold: true };
        row.getCell('status').font = { color: { argb: 'FFF56C6C' }, bold: true };
      }

      // ---- 嵌入流水明细 ----
      const materialRecords = recordsMap[item.material_id];
      if (filters.includeDetails && materialRecords && materialRecords.length > 0) {
        // 子表头
        const subHeader = worksheet.addRow({
          material_code: '',
          material_name: '└─> [流水明细记录]',
          specification: '【单据编号】',
          location_name: '【业务类型】',
          category_name: '【关联批次号】',
          quantity: '【发生数量】',
          unit_name: '【变动前库存】',
          status: '【变动后库存】',
          updated_at: '【发生时间】'
        });
        subHeader.eachCell({ includeEmpty: true }, cell => {
          cell.font = { bold: true, color: { argb: 'FF909399' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDFDFD' } };
          cell.border = { top: { style: 'hair', color: { argb: 'FFEBEEF5' } }, bottom: { style: 'hair', color: { argb: 'FFEBEEF5' } } };
          cell.alignment = { vertical: 'middle' };
        });

        // 流水数据行
        materialRecords.forEach(rec => {
          const typeText = txTypeMap[rec.transaction_type] || rec.transaction_type;
          const recRow = worksheet.addRow({
            material_code: '',
            material_name: '',
            specification: rec.reference_no || '-',
            location_name: typeText,
            category_name: rec.batch_number || '-',
            quantity: parseFloat(rec.quantity) || 0,
            unit_name: parseFloat(rec.before_quantity) || 0,
            status: parseFloat(rec.after_quantity) || 0,
            updated_at: rec.created_at ? moment(rec.created_at).format('YYYY-MM-DD HH:mm:ss') : '-'
          });

          recRow.eachCell({ includeEmpty: true }, cell => {
            cell.font = { color: { argb: 'FF606266' } };
            cell.border = { bottom: { style: 'hair', color: { argb: 'FFEBEEF5' } } };
            cell.alignment = { vertical: 'middle' };
          });
          recRow.getCell('quantity').numFmt = '#,##0.00';
          recRow.getCell('unit_name').numFmt = '#,##0.00';
          recRow.getCell('status').numFmt = '#,##0.00';

          // 入库绿色、出库红色
          const rQty = parseFloat(rec.quantity) || 0;
          if (rQty > 0) {
            recRow.getCell('quantity').font = { color: { argb: 'FF67C23A' }, bold: true };
          } else if (rQty < 0) {
            recRow.getCell('quantity').font = { color: { argb: 'FFF56C6C' }, bold: true };
          }
        });
      }
    });

    // ========== 6. 输出文件流 ==========
    const excelBuffer = await workbook.xlsx.writeBuffer();
    logger.info('库存导出完成，文件大小:', excelBuffer.length);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=stock_export.xlsx');
    res.send(excelBuffer);
  } catch (error) {
    logger.error('导出库存失败:', error);
    ResponseHandler.error(res, '导出失败: ' + error.message, 'SERVER_ERROR', 500, error);
  }
};

// ==================== 手工出入库管理 ====================

/**
 * 获取手工出入库列表
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
    const pageSizeNum = Number(pageSize);
    const offsetNum = Number(offset);

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
        LIMIT ${pageSizeNum} OFFSET ${offsetNum}`;
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
        LIMIT ${pageSizeNum} OFFSET ${offsetNum}`;
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

    const operator = req.user?.name || req.user?.username || 'system';

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
    const manualMaterialIds = items.map(i => i.material_id);
    const manualMaterialInfoMap = await InventoryService.getBatchMaterialInfo(manualMaterialIds, connection);

    // 处理每条明细
    for (const item of items) {
      const { material_id, location_id, quantity } = item;

      // 从批量预取结果获取物料信息
      const matInfo = manualMaterialInfoMap.get(material_id);
      const unit_id = matInfo.unitId;

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
const getStockByLocation = async (req, res) => {
  try {
    const { material_id, location_id } = req.query;

    if (!material_id || !location_id) {
      return ResponseHandler.error(
        res,
        '缺少必填参数：material_id 和 location_id',
        'VALIDATION_ERROR',
        400
      );
    }

    // 查询指定物料在指定仓库的库存
    const [stockRows] = await db.pool.execute(
      `SELECT
        COALESCE(SUM(quantity), 0) as quantity
       FROM inventory_ledger
       WHERE material_id = ? AND location_id = ?`,
      [material_id, location_id]
    );

    const quantity = stockRows.length > 0 ? stockRows[0].quantity : 0;

    ResponseHandler.success(res, {
      material_id: parseInt(material_id),
      location_id: parseInt(location_id),
      quantity: parseFloat(quantity) || 0,
    });
  } catch (error) {
    logger.error('获取仓库库存失败:', error);
    ResponseHandler.error(res, '获取仓库库存失败: ' + error.message, 'SERVER_ERROR', 500, error);
  }
};

/**
 * 内部方法：创建手工出入库单据（不提交事务）
 * @param {Connection} connection - 数据库连接
 * @param {Object} params - 参数
 * @returns {Promise<string>} 单据编号
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

    const operator = req.user?.name || req.user?.username || 'system';

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
          operator: req.user?.name || req.user?.username || 'system',
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

const batchOutbound = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { task_ids, outbound_date, remark, operator, preview } = req.body;

    // 验证参数
    if (!task_ids || !Array.isArray(task_ids) || task_ids.length === 0) {
      return ResponseHandler.error(res, '请选择至少一个生产任务', 'VALIDATION_ERROR', 400);
    }

    // ===== 年度结存校验 =====
    const dateToCheck = outbound_date || new Date().toISOString().split('T')[0];
    const PeriodValidationService = require('../../../services/business/PeriodValidationService');
    const inventoryCheck = await PeriodValidationService.validateInventoryTransaction(dateToCheck);
    if (!inventoryCheck.allowed) {
      await connection.rollback();
      return ResponseHandler.error(res, inventoryCheck.message, 'VALIDATION_ERROR', 400);
    }
    // ===== 年度结存校验结束 =====

    // 1. 获取所有生产任务的信息
    const placeholders = task_ids.map(() => '?').join(',');
    const [tasks] = await connection.execute(
      `SELECT
        pt.id, pt.code, pt.plan_id, pt.product_id, pt.quantity,
        p.code as product_code, p.name as product_name,
        bm.id as bom_id
      FROM production_tasks pt
      LEFT JOIN materials p ON pt.product_id = p.id
      LEFT JOIN bom_masters bm ON p.id = bm.product_id AND bm.approved_by IS NOT NULL
      WHERE pt.id IN (${placeholders}) AND pt.status IN ('pending', 'allocated', 'preparing')`,
      task_ids
    );

    if (tasks.length === 0) {
      return ResponseHandler.error(res, '未找到可发料的生产任务', 'NOT_FOUND', 404);
    }

    if (tasks.length !== task_ids.length) {
      return ResponseHandler.error(
        res,
        '部分生产任务不存在或状态不允许发料',
        'VALIDATION_ERROR',
        400
      );
    }

    // 2. 获取每个任务的BOM物料需求
    const materialMap = new Map(); // 用于合并相同物料

    for (const task of tasks) {
      if (!task.bom_id) {
        logger.warn(`生产任务 ${task.code} 没有关联BOM，跳过`);
        continue;
      }

      // 获取BOM明细
      const [bomItems] = await connection.execute(
        `SELECT
          bd.material_id, bd.quantity as bom_quantity,
          m.code as material_code, m.name as material_name,
          m.specs as specification, m.unit_id,
          u.name as unit_name,
          m.location_id as default_location_id,
          l.name as location_name
        FROM bom_details bd
        JOIN materials m ON bd.material_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        LEFT JOIN locations l ON m.location_id = l.id
        WHERE bd.bom_id = ? AND bd.level = 1`,
        [task.bom_id]
      );

      // 计算物料需求并合并
      for (const bomItem of bomItems) {
        const requiredQuantity = bomItem.bom_quantity * task.quantity;
        const materialId = bomItem.material_id;

        if (materialMap.has(materialId)) {
          // 物料已存在，累加数量并记录来源任务
          const existing = materialMap.get(materialId);
          existing.quantity += requiredQuantity;
          existing.source_tasks.push({
            task_id: task.id,
            task_code: task.code,
            product_code: task.product_code,
            product_name: task.product_name,
            quantity: requiredQuantity,
          });
        } else {
          // 新物料，添加到Map
          materialMap.set(materialId, {
            material_id: materialId,
            material_code: bomItem.material_code,
            material_name: bomItem.material_name,
            specification: bomItem.specification,
            unit_id: bomItem.unit_id,
            unit_name: bomItem.unit_name,
            location_id: bomItem.default_location_id || null, // 由物料基础资料决定
            location_name: bomItem.location_name || null,
            quantity: requiredQuantity,
            source_tasks: [
              {
                task_id: task.id,
                task_code: task.code,
                product_code: task.product_code,
                product_name: task.product_name,
                quantity: requiredQuantity,
              },
            ],
          });
        }
      }
    }

    const mergedMaterials = Array.from(materialMap.values());

    if (mergedMaterials.length === 0) {
      return ResponseHandler.error(res, '没有找到需要发料的物料', 'VALIDATION_ERROR', 400);
    }

    // 如果是预览模式，只返回合并后的物料清单
    if (preview) {
      await connection.commit();
      return ResponseHandler.success(
        res,
        {
          task_count: tasks.length,
          material_count: mergedMaterials.length,
          materials: mergedMaterials,
        },
        '物料清单加载成功'
      );
    }

    // 3. 生成出库单号
    const outboundNo = await CodeGenerators.generateInventoryOutboundCode(connection);

    // 4. 格式化出库日期
    let formattedOutboundDate;
    if (outbound_date) {
      // 如果是ISO格式的日期字符串，提取日期部分
      if (typeof outbound_date === 'string' && outbound_date.includes('T')) {
        formattedOutboundDate = outbound_date.split('T')[0];
      } else {
        formattedOutboundDate = outbound_date;
      }
    } else {
      formattedOutboundDate = new Date().toISOString().split('T')[0];
    }

    // 5. 创建出库单
    const [outboundResult] = await connection.execute(
      `INSERT INTO inventory_outbound
        (outbound_no, outbound_date, status, outbound_type, remark, operator, reference_type, source_task_ids, is_batch_outbound, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        outboundNo,
        formattedOutboundDate,
        'draft',
        'batch_issue',
        remark || '批量发料',
        operator || 'system',
        'batch_production_tasks',
        JSON.stringify(task_ids),
        1,
      ]
    );

    const outboundId = outboundResult.insertId;

    // 批量预取物料信息（消除循环内 N+1 查询）
    const batchMaterialIds = mergedMaterials.map(m => m.material_id);
    const batchMaterialInfoMap = await InventoryService.getBatchMaterialInfo(batchMaterialIds, connection);

    // 6. 插入出库单明细
    for (const material of mergedMaterials) {
      // 从批量预取结果获取物料的单位ID
      const batchMatInfo = batchMaterialInfoMap.get(material.material_id);
      const unit_id = batchMatInfo ? batchMatInfo.unitId : null;

      await connection.execute(
        `INSERT INTO inventory_outbound_items
          (outbound_id, material_id, quantity, unit_id, source_tasks, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          outboundId,
          material.material_id,
          material.quantity,
          unit_id,
          JSON.stringify(material.source_tasks),
        ]
      );
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        outbound_id: outboundId,
        outbound_no: outboundNo,
        task_count: tasks.length,
        material_count: mergedMaterials.length,
        materials: mergedMaterials,
      },
      '批量发料单创建成功'
    );
  } catch (error) {
    await connection.rollback();
    logger.error('批量发料失败:', error);
    ResponseHandler.error(res, '批量发料失败: ' + error.message, 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 获取生产任务的领料记录（用于退料时选择）
 * @param {object} req - 请求对象
 * @param {object} res - 响应对象
 */
const getTaskMaterialIssueRecords = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return ResponseHandler.error(res, '任务ID不能为空', 'BAD_REQUEST', 400);
    }

    // 查询该任务关联的所有已完成出库单及其明细
    const query = `
      SELECT
        o.id as outbound_id,
        o.outbound_no,
        DATE_FORMAT(o.outbound_date, '%Y-%m-%d') as outbound_date,
        o.status as outbound_status,
        oi.id as item_id,
        oi.material_id,
        m.code as material_code,
        m.name as material_name,
        m.specs as material_specs,
        oi.quantity as issued_quantity,
        oi.actual_quantity,
        COALESCE(oi.actual_quantity, oi.quantity) as returnable_quantity,
        u.name as unit_name,
        u.id as unit_id,
        m.location_id as default_location_id,
        l.name as default_location_name
      FROM inventory_outbound o
      INNER JOIN inventory_outbound_items oi ON o.id = oi.outbound_id
      LEFT JOIN materials m ON oi.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      LEFT JOIN locations l ON m.location_id = l.id
      WHERE o.reference_type = 'production_task'
        AND o.reference_id = ?
        AND o.status IN ('completed', 'partial_completed')
      ORDER BY o.outbound_date DESC, oi.id ASC
    `;

    const [records] = await db.pool.execute(query, [taskId]);

    // 查询任务基本信息
    const [taskInfo] = await db.pool.execute(
      `
      SELECT
        t.id,
        t.code as task_code,
        m.code as product_code,
        m.name as product_name,
        t.quantity,
        t.status
      FROM production_tasks t
      LEFT JOIN materials m ON t.product_id = m.id
      WHERE t.id = ?
    `,
      [taskId]
    );

    // 计算已退料数量（查询已有的退料入库单）
    const [returnedRecords] = await db.pool.execute(
      `
      SELECT
        ii.material_id,
        SUM(ii.quantity) as returned_quantity
      FROM inventory_inbound i
      INNER JOIN inventory_inbound_items ii ON i.id = ii.inbound_id
      WHERE i.inbound_type = 'production_return'
        AND i.reference_type = 'production_task'
        AND i.reference_id = ?
        AND i.status IN ('confirmed', 'completed')
      GROUP BY ii.material_id
    `,
      [taskId]
    );

    // 构建已退料数量映射
    const returnedMap = {};
    returnedRecords.forEach((r) => {
      returnedMap[r.material_id] = parseFloat(r.returned_quantity) || 0;
    });

    // 计算每个物料的可退数量
    const enhancedRecords = records.map((record) => {
      const returnedQty = returnedMap[record.material_id] || 0;
      const maxReturnable = Math.max(0, parseFloat(record.returnable_quantity) - returnedQty);
      return {
        ...record,
        returned_quantity: returnedQty,
        max_returnable_quantity: maxReturnable,
      };
    });

    ResponseHandler.success(
      res,
      {
        task: taskInfo[0] || null,
        records: enhancedRecords,
      },
      '获取领料记录成功'
    );
  } catch (error) {
    logger.error('获取任务领料记录失败:', error);
    ResponseHandler.error(res, '获取任务领料记录失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 执行数据一致性检查
 */
const runConsistencyCheck = async (req, res) => {
  try {
    logger.info('执行库存数据一致性检查...');
    const report = await InventoryConsistencyService.runFullConsistencyCheck();

    ResponseHandler.success(res, report, '数据一致性检查完成');
  } catch (error) {
    logger.error('数据一致性检查失败:', error);
    ResponseHandler.error(res, '数据一致性检查失败: ' + error.message, 'SERVER_ERROR', 500);
  }
};

/**
 * 获取负库存列表
 */
const getNegativeStock = async (req, res) => {
  try {
    const negativeStocks = await InventoryConsistencyService.checkNegativeStock();

    ResponseHandler.success(
      res,
      {
        count: negativeStocks.length,
        items: negativeStocks,
      },
      '获取负库存列表成功'
    );
  } catch (error) {
    logger.error('获取负库存列表失败:', error);
    ResponseHandler.error(res, '获取负库存列表失败: ' + error.message, 'SERVER_ERROR', 500);
  }
};

/**
 * 修复数量不一致记录
 */
const fixQuantityConsistency = async (req, res) => {
  try {
    logger.info('修复库存数量不一致记录...');
    const result = await InventoryConsistencyService.fixQuantityConsistency();

    ResponseHandler.success(res, result, `成功修复 ${result.fixedCount} 条记录`);
  } catch (error) {
    logger.error('修复数量不一致记录失败:', error);
    ResponseHandler.error(res, '修复失败: ' + error.message, 'SERVER_ERROR', 500);
  }
};

/**
 * 修复负库存（生成调整单）
 */
const fixNegativeStock = async (req, res) => {
  try {
    const operator = req.user?.name || req.user?.username || 'system';
    logger.info(`用户 ${operator} 执行负库存修复...`);

    const result = await InventoryConsistencyService.generateAdjustmentForNegativeStock(operator);

    ResponseHandler.success(res, result, result.message);
  } catch (error) {
    logger.error('修复负库存失败:', error);
    ResponseHandler.error(res, '修复负库存失败: ' + error.message, 'SERVER_ERROR', 500);
  }
};

// 批次库存明细查询
const getBatchInventoryDetail = async (req, res) => {
  try {
    const { material_id, location_id } = req.query;

    if (!material_id) {
      return ResponseHandler.error(res, '物料ID不能为空', 'BAD_REQUEST', 400);
    }

    // ✅ 单表架构：从 inventory_ledger 聚合查询批次库存
    // 修复：移除对 location_id 的强制聚合，使得同批次跨库位可以合并展示，并过滤掉数量<=0的无意义批次及错误的无批次负结存
    let query = `
      SELECT
        vbs.material_id,
        m.code as material_code,
        m.name as material_name,
        vbs.batch_number,
        ? as location_id,
        wl.name as location_name,
        vbs.current_quantity,
        vbs.current_quantity as available_quantity,
        0 as reserved_quantity,
        vbs.current_quantity as original_quantity,
        u.name as unit_name,
        vbs.receipt_date as first_in_date,
        vbs.last_transaction_date,
        vbs.expiry_date,
        'active' as status,
        vbs.unit_cost,
        (vbs.current_quantity * COALESCE(vbs.unit_cost, 0)) as total_cost,
        vbs.supplier_name
      FROM (
        SELECT 
          material_id, 
          COALESCE(batch_number, '[无批次]') as batch_number,
          SUM(quantity) as current_quantity,
          MIN(created_at) as receipt_date,
          MAX(created_at) as last_transaction_date,
          MAX(unit_cost) as unit_cost,
          MAX(supplier_name) as supplier_name,
          MAX(expiry_date) as expiry_date
        FROM inventory_ledger
        WHERE material_id = ? ${location_id ? 'AND location_id = ?' : ''}
        GROUP BY material_id, COALESCE(batch_number, '[无批次]')
        HAVING SUM(quantity) > 0
      ) vbs
      LEFT JOIN materials m ON vbs.material_id = m.id
      LEFT JOIN locations wl ON wl.id = ?
      LEFT JOIN units u ON m.unit_id = u.id
      ORDER BY vbs.receipt_date ASC
    `;

    const params = [location_id || null, material_id];
    if (location_id) params.push(location_id);
    params.push(location_id || null);

    const [rows] = await db.pool.execute(query, params);

    ResponseHandler.success(res, rows, '获取批次库存成功');
  } catch (error) {
    logger.error('获取批次库存失败:', error);
    ResponseHandler.error(res, '获取批次库存失败', 'SERVER_ERROR', 500, error);
  }
};

// 批次流水记录查询
const getBatchTransactionsDetail = async (req, res) => {
  try {
    const { material_id, batch_number } = req.query;

    if (!material_id || !batch_number) {
      return ResponseHandler.error(res, '物料ID和批次号不能为空', 'BAD_REQUEST', 400);
    }

    // 单表架构：直接查询 inventory_ledger
    const query = `
      SELECT
        il.id,
        il.batch_number,
        il.material_id,
        m.code as material_code,
        m.name as material_name,
        il.transaction_type,
        il.quantity,
        il.location_id,
        l.name as location_name,
        il.reference_no,
        il.reference_type,
        il.operator,
        il.remark,
        il.created_at as date,
        il.before_quantity,
        il.after_quantity
      FROM inventory_ledger il
      LEFT JOIN materials m ON il.material_id = m.id
      LEFT JOIN locations l ON il.location_id = l.id
      WHERE il.material_id = ? 
        AND (il.batch_number = ? OR (il.batch_number IS NULL AND ? = '[无批次]') OR (il.batch_number = '' AND ? = '[无批次]'))
      ORDER BY il.created_at DESC
    `;

    const [rows] = await db.pool.execute(query, [material_id, batch_number, batch_number, batch_number]);

    ResponseHandler.success(res, rows, '获取批次流水成功');
  } catch (error) {
    logger.error('获取批次流水失败:', error);
    ResponseHandler.error(res, '获取批次流水失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 批量更新出库单状态
 */
const batchUpdateOutboundStatus = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { ids, newStatus } = req.body;

    // 验证参数
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return ResponseHandler.error(res, '请选择至少一个出库单', 'VALIDATION_ERROR', 400);
    }

    if (!newStatus) {
      return ResponseHandler.error(res, '缺少必填字段: newStatus', 'VALIDATION_ERROR', 400);
    }

    // 验证状态值
    const validStatuses = [
      STATUS.OUTBOUND.DRAFT,
      STATUS.OUTBOUND.CONFIRMED,
      STATUS.OUTBOUND.COMPLETED,
      STATUS.OUTBOUND.CANCELLED,
    ];
    if (!validStatuses.includes(newStatus)) {
      return ResponseHandler.error(res, `无效的状态值: ${newStatus}`, 'VALIDATION_ERROR', 400);
    }

    // 检查所有出库单是否存在
    const placeholders = ids.map(() => '?').join(',');
    const [outbounds] = await connection.execute(
      `SELECT id, outbound_no, status FROM inventory_outbound WHERE id IN (${placeholders})`,
      ids
    );

    if (outbounds.length !== ids.length) {
      await connection.rollback();
      return ResponseHandler.error(res, '部分出库单不存在', 'NOT_FOUND', 404);
    }

    // 检查是否有已完成的出库单(已完成的不能修改状态)
    const completedOutbounds = outbounds.filter((o) => o.status === STATUS.OUTBOUND.COMPLETED);
    if (completedOutbounds.length > 0 && newStatus !== STATUS.OUTBOUND.COMPLETED) {
      await connection.rollback();
      const completedNos = completedOutbounds.map((o) => o.outbound_no).join(', ');
      return ResponseHandler.error(
        res,
        `以下出库单已完成,无法修改状态: ${completedNos}`,
        'BAD_REQUEST',
        400
      );
    }

    // 批量更新状态
    const [result] = await connection.execute(
      `UPDATE inventory_outbound SET status = ?, updated_at = NOW() WHERE id IN (${placeholders})`,
      [newStatus, ...ids]
    );

    await connection.commit();

    logger.info(`批量更新出库单状态成功: ${ids.length}个出库单更新为${newStatus}`);

    return ResponseHandler.success(
      res,
      { updated: result.affectedRows },
      `成功更新 ${result.affectedRows} 个出库单状态`
    );
  } catch (error) {
    await connection.rollback();
    logger.error('批量更新出库单状态失败:', error);
    return ResponseHandler.error(res, '批量更新出库单状态失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 批量删除出库单
 */
const batchDeleteOutbound = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { ids } = req.body;

    // 验证参数
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return ResponseHandler.error(res, '请选择至少一个出库单', 'VALIDATION_ERROR', 400);
    }

    // 检查所有出库单是否存在并获取状态
    const placeholders = ids.map(() => '?').join(',');
    const [outbounds] = await connection.execute(
      `SELECT id, outbound_no, status FROM inventory_outbound WHERE id IN (${placeholders})`,
      ids
    );

    if (outbounds.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '未找到要删除的出库单', 'NOT_FOUND', 404);
    }

    // 检查是否有非草稿状态的出库单
    const nonDraftOutbounds = outbounds.filter((o) => o.status !== STATUS.OUTBOUND.DRAFT);
    if (nonDraftOutbounds.length > 0) {
      await connection.rollback();
      const nonDraftNos = nonDraftOutbounds.map((o) => o.outbound_no).join(', ');
      return ResponseHandler.error(
        res,
        `以下出库单不是草稿状态,无法删除: ${nonDraftNos}`,
        'BAD_REQUEST',
        400
      );
    }

    // 批量删除出库单物料明细
    await connection.execute(
      `DELETE FROM inventory_outbound_items WHERE outbound_id IN (${placeholders})`,
      ids
    );

    // 批量删除出库单
    const [result] = await connection.execute(
      `DELETE FROM inventory_outbound WHERE id IN (${placeholders})`,
      ids
    );

    await connection.commit();

    logger.info(`批量删除出库单成功: ${result.affectedRows}个出库单已删除`);

    return ResponseHandler.success(
      res,
      { deleted: result.affectedRows },
      `成功删除 ${result.affectedRows} 个出库单`
    );
  } catch (error) {
    await connection.rollback();
    logger.error('批量删除出库单失败:', error);
    return ResponseHandler.error(res, '批量删除出库单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 统一处理出库单状态变更时，联动更新生产任务和计划状态，以及自动创建工序
 * @param {Connection} connection - 数据库连接
 * @param {string} outboundStatus - 新的出库单状态 ('confirmed' | 'completed')
 * @param {number} taskId - 关联的生产任务ID
 */
const _syncProductionStatus = async (connection, outboundStatus, taskId) => {
  if (!taskId) return;
  try {
    if (outboundStatus === 'confirmed') {
      // 出库单确认 → 任务变为配料中（仅从较早状态升级）
      await connection.execute(
        "UPDATE production_tasks SET status = 'preparing' WHERE id = ? AND status IN ('pending', 'allocated', 'material_issuing')",
        [taskId]
      );
    } else if (outboundStatus === 'completed') {
      // 出库单完成 → 任务变为已发料
      await connection.execute(
        "UPDATE production_tasks SET status = 'material_issued' WHERE id = ?",
        [taskId]
      );
    }

    // 联动更新关联的生产计划
    const [taskInfo] = await connection.execute(
      'SELECT plan_id FROM production_tasks WHERE id = ?',
      [taskId]
    );
    if (taskInfo.length > 0 && taskInfo[0].plan_id) {
      const planId = taskInfo[0].plan_id;
      if (outboundStatus === 'confirmed') {
        await connection.execute(
          "UPDATE production_plans SET status = 'preparing' WHERE id = ? AND status IN ('draft', 'allocated', 'material_issuing')",
          [planId]
        );
        logger.info(`生产计划 ${planId} 已更新为 preparing（配料中）`);
      } else if (outboundStatus === 'completed') {
        // 全部任务已发料才更新计划
        const [stats] = await connection.execute(
          `SELECT COUNT(*) as total,
           SUM(CASE WHEN status IN ('material_issued','in_progress','completed') THEN 1 ELSE 0 END) as done
           FROM production_tasks WHERE plan_id = ? AND status != 'cancelled'`,
          [planId]
        );
        if (stats[0].total > 0 && stats[0].done >= stats[0].total) {
          await connection.execute(
            "UPDATE production_plans SET status = 'material_issued' WHERE id = ? AND status IN ('allocated','preparing','material_issuing')",
            [planId]
          );
          logger.info(`生产计划 ${planId} 所有任务已发料，状态更新为 material_issued`);
        }
      }
    }

    // 出库完成：若任务尚无工序则从模板自动创建
    if (outboundStatus === 'completed') {
      try {
        const [existing] = await connection.execute(
          'SELECT COUNT(*) as cnt FROM production_processes WHERE task_id = ?',
          [taskId]
        );
        if (Number(existing[0].cnt) === 0) {
          const [taskDetail] = await connection.execute(
            'SELECT product_id, quantity FROM production_tasks WHERE id = ?',
            [taskId]
          );
          if (taskDetail.length > 0) {
            const { product_id: productId, quantity: taskQuantity } = taskDetail[0];
            const [templates] = await connection.execute(
              'SELECT id FROM process_templates WHERE product_id = ? AND status = 1 ORDER BY created_at DESC LIMIT 1',
              [productId]
            );
            if (templates.length > 0) {
              const [steps] = await connection.execute(
                'SELECT * FROM process_template_details WHERE template_id = ? ORDER BY order_num',
                [templates[0].id]
              );
              for (const step of steps) {
                await connection.execute(
                  `INSERT INTO production_processes (task_id, process_name, sequence, quantity, progress, status, description, remarks)
                   VALUES (?, ?, ?, ?, 0, 'pending', ?, ?)`,
                  [taskId, step.name, step.order_num, taskQuantity, step.description || '', step.remark || '']
                );
              }
              logger.info(`✅ 出库完成后自动生成了 ${steps.length} 个工序（任务ID: ${taskId}）`);
            }
          }
        }
      } catch (processErr) {
        logger.error('出库完成后自动生成工序失败:', processErr);
      }
    }
  } catch (err) {
    logger.error(`[_syncProductionStatus] 联动更新失败 outboundStatus=${outboundStatus} taskId=${taskId}:`, err);
  }
};

const checkAndUpdateTaskStatus = async (connection, taskId) => {
  try {
    if (!taskId) return;

    // 1. 获取任务信息
    const [tasks] = await connection.execute(
      'SELECT product_id, quantity, status FROM production_tasks WHERE id = ?',
      [taskId]
    );
    if (tasks.length === 0) return;
    const task = tasks[0];

    // 如果状态已经是"生产中"或更后面的状态（完成、取消、检验、入库等），不处理
    // 这可以防止补料申请导致任务状态被重置
    const protectedStatuses = [
      'in_progress', // 生产中
      'inspection', // 检验中
      'warehousing', // 入库中
      'completed', // 已完成
      'cancelled', // 已取消
    ];

    if (protectedStatuses.includes(task.status)) {
      logger.info(
        `[checkAndUpdateTaskStatus] 任务 ${taskId} 状态为 ${task.status}，跳过发料状态检查`
      );
      return;
    }

    // 2. 获取BOM需求
    // 查找由于productId可能对应多版本BOM，取最新的已审核版本
    const [boms] = await connection.execute(
      `SELECT id FROM bom_masters 
       WHERE product_id = ? AND approved_by IS NOT NULL 
       ORDER BY created_at DESC LIMIT 1`,
      [task.product_id]
    );

    // 如果没有BOM，无法判断发料进度，跳过
    if (boms.length === 0) return;
    const bomId = boms[0].id;

    const [bomDetails] = await connection.execute(
      'SELECT material_id, quantity FROM bom_details WHERE bom_id = ?',
      [bomId]
    );

    if (bomDetails.length === 0) return;

    // 3. 计算发料情况
    let allIssued = true;

    // 获取该任务所有的出库明细汇总
    const [issuedSummary] = await connection.execute(
      `SELECT ioi.material_id, SUM(ioi.actual_quantity) as total_issued
       FROM inventory_outbound io
       JOIN inventory_outbound_items ioi ON io.id = ioi.outbound_id
       WHERE io.production_task_id = ? AND io.status IN ('completed', 'partial_completed')
       GROUP BY ioi.material_id`,
      [taskId]
    );

    const issuedMap = {};
    issuedSummary.forEach((row) => {
      issuedMap[row.material_id] = parseFloat(row.total_issued || 0);
    });

    for (const item of bomDetails) {
      const requiredQty = item.quantity * task.quantity;
      const issuedQty = issuedMap[item.material_id] || 0;

      // 允许微小误差? 暂时严格 >=
      if (issuedQty < requiredQty) {
        allIssued = false;
        break;
      }
    }

    // 4. 更新状态
    if (allIssued) {
      // 全部已发料 -> material_issued
      if (task.status !== 'material_issued') {
        await connection.execute(
          "UPDATE production_tasks SET status = 'material_issued', updated_at = NOW() WHERE id = ?",
          [taskId]
        );
        logger.info(`生产任务 ${taskId} 所有物料已发齐，状态更新为 'material_issued'`);
      }
    } else {
      // 部分发料，设置任务为配料中（preparing），与生产计划状态统一
      if (['draft', 'allocated', 'preparing', 'material_issuing'].includes(task.status)) {
        await connection.execute(
          "UPDATE production_tasks SET status = 'preparing', updated_at = NOW() WHERE id = ?",
          [taskId]
        );
      }
    }
  } catch (error) {
    logger.error(`检查生产任务 ${taskId} 发料状态失败:`, error);
  }
};

module.exports = {
  getStockList,
  getLocations,
  getStockRecords,
  getMaterialRecords,
  getOutboundList,
  createOutbound,
  getOutboundDetail,
  getMaterialsWithStock,
  updateOutbound,
  deleteOutbound,
  cancelOutbound,
  supplementOutbound,
  updateOutboundStatus,
  getMaterialsList,
  getInboundList,
  getInboundDetail,
  createInbound,
  createInboundFromQuality,
  updateInboundStatus,
  adjustStock,
  getTransactionList,
  getTransactionStats,
  exportTransactionReport,
  getInventoryReport,
  exportInventoryReport,
  getMaterialStockDetail,
  getBatchMaterialStock,
  getTransferList,
  getTransferDetail,
  createTransfer,
  updateTransfer,
  deleteTransfer,
  updateTransferStatus,
  getTransferStatistics,
  exportTransfers,
  batchDeleteTransfers,
  getCheckStatistics,
  getCheckList,
  getCheckDetail,
  createCheck,
  updateCheck,
  updateCheckStatus,
  deleteCheck,
  submitCheckResult,
  adjustInventory,
  getInventoryLedger,
  checkStatusMappings,
  getBatchInventory,
  getBatchInventoryDetail,
  getBatchTransactionsDetail,
  getMaterialLedger,
  getLowStock,
  getMovements,
  checkStockSufficiency,
  downloadStockTemplate,
  importStock,
  exportStockData,
  getManualTransactions,
  getManualTransaction,
  createManualTransaction,
  createExchange,
  updateManualTransaction,
  deleteManualTransaction,
  approveManualTransaction,
  getStockByLocation,
  batchOutbound,
  batchUpdateOutboundStatus,
  batchDeleteOutbound,
  getTaskMaterialIssueRecords,
  runConsistencyCheck,
  getNegativeStock,
  fixQuantityConsistency,
  fixNegativeStock,
  getStockStatistics: _getStockStatistics,
};

/**
 * 智能出库函数 - 当父物料库存不足时自动使用子物料替代
 * @param {number} materialId - 物料ID
 * @param {number} locationId - 库位ID
 * @param {number} quantity - 出库数量
 * @param {string} operator - 操作员
 * @param {string} remark - 备注
 * @param {number} productionPlanId - 生产计划ID
 * @param {object} connection - 数据库连接
 * @param {object} extraData - 额外数据（如 issue_reason, is_excess）
 */
async function smartOutboundStock(
  materialId,
  locationId,
  quantity,
  operator,
  remark,
  productionPlanId,
  connection,
  extraData = {}
) {
  try {
    // 0. 从正规服务获取完整的物料默认配置
    const materialInfo = await InventoryService.getMaterialInfo(materialId, connection);
    const materialUnitId = materialInfo.unitId;

    // 0.1 获取物料成本单价，用于写入台账的 unit_cost 字段
    const [costPriceRow] = await connection.execute(
      'SELECT COALESCE(cost_price, 0) as cost_price FROM materials WHERE id = ?',
      [materialId]
    );
    const materialUnitCost = parseFloat(costPriceRow[0]?.cost_price) || 0;

    // 1. 获取当前仓库的可用库存（直接使用库存服务层统一接口）
    const currentStock = await InventoryService.getCurrentStock(materialId, locationId, connection, true);
    let remainingQuantity = parseFloat(quantity);

    // 2. 如果存在现货库存，则直接从目标库位优先发料
    if (currentStock > 0) {
      const deductQty = Math.min(currentStock, remainingQuantity);

      await InventoryService.updateStock(
        {
          materialId,
          locationId,
          transactionType: 'production_outbound',
          quantity: -deductQty,
          unitId: materialUnitId,
          referenceNo: remark.split(': ')[1] || remark,
          referenceType: 'production_task',
          operator,
          remark,
          issue_reason: extraData.issueReason || null,
          is_excess: extraData.isExcess || 0,
          batchNumber: extraData.batchNumber || null,
          unitCost: materialUnitCost,
        },
        connection
      );

      remainingQuantity -= deductQty;
    }

    // 3. 如果库存充足已经完全发料，直接返回
    if (remainingQuantity <= 0) {
      return;
    }

    // 4. 库存不足，进行混合出库：剩余部分尝试用子物料替代或由末尾逻辑强行作负库存兜底
    // 3.2 查找是否有子物料可以替代剩余数量

    // 获取生产计划的产品信息
    // 注意：productionPlanId 可能实际上是 production_task 的 ID
    // 需要先尝试从 production_tasks 获取 plan_id，如果不存在则直接使用
    let actualPlanId = productionPlanId;

    // 先尝试作为生产任务ID查询
    const [taskInfo] = await connection.execute(
      'SELECT plan_id, product_id FROM production_tasks WHERE id = ?',
      [productionPlanId]
    );

    let productId = null;

    if (taskInfo.length > 0) {
      // 这是一个生产任务ID
      productId = taskInfo[0].product_id;
      actualPlanId = taskInfo[0].plan_id;
      logger.debug(
        `智能出库：从生产任务 ${productionPlanId} 获取产品ID ${productId}，计划ID ${actualPlanId}`
      );
    } else {
      // 尝试作为生产计划ID查询
      const [planInfo] = await connection.execute(
        'SELECT product_id FROM production_plans WHERE id = ?',
        [productionPlanId]
      );

      if (planInfo.length === 0) {
        throw new Error(`找不到生产任务或生产计划 ID: ${productionPlanId}`);
      }

      productId = planInfo[0].product_id;
      logger.debug(`智能出库：从生产计划 ${productionPlanId} 获取产品ID ${productId}`);
    }

    // 通过产品ID查找已审核的BOM
    const [bomInfo] = await connection.execute(
      `SELECT bm.id as bom_id
       FROM bom_masters bm
       WHERE bm.product_id = ? AND bm.approved_by IS NOT NULL`,
      [productId]
    );

    if (bomInfo.length === 0) {
      throw new Error(`产品 ${productId} 没有有效的BOM`);
    }

    const bomId = bomInfo[0].bom_id;

    // 获取BOM详情，查找子物料
    const [bomDetails] = await connection.execute(
      `SELECT bd.id, bd.material_id, bd.quantity, bd.level, bd.parent_id,
              m.code, m.name, m.specs,
              COALESCE(s.quantity, 0) as stock_quantity
       FROM bom_details bd
       LEFT JOIN materials m ON bd.material_id = m.id
       LEFT JOIN (
         SELECT il.material_id, SUM(il.quantity) as quantity
         FROM inventory_ledger il
         JOIN materials mat ON il.material_id = mat.id
         WHERE mat.location_id IS NULL OR il.location_id = mat.location_id
         GROUP BY il.material_id
       ) s ON m.id = s.material_id
       WHERE bd.bom_id = ?
       ORDER BY bd.level ASC, bd.id ASC`,
      [bomId]
    );

    // 查找当前物料在BOM中的信息
    const currentMaterial = bomDetails.find((detail) => detail.material_id === materialId);
    if (!currentMaterial) {
      throw new Error(`物料 ${materialId} 不在BOM中，无法进行智能替代`);
    }

    // 查找该物料的直接子物料
    const childMaterials = bomDetails.filter(
      (detail) => detail.parent_id === currentMaterial.id && detail.level > currentMaterial.level
    );

    if (childMaterials.length === 0) {
      // 没有子物料时，继续记录出库流水（允许负库存），不报错
      logger.warn(
        `物料 ${materialId} 没有子物料，直接记录剩余数量 ${remainingQuantity} 的出库流水（可能产生负库存）`
      );

      await InventoryService.updateStock(
        {
          materialId,
          locationId,
          transactionType: 'production_outbound',
          quantity: -remainingQuantity,
          unitId: materialUnitId,
          referenceNo: remark.split(': ')[1] || remark,
          referenceType: 'production_task',
          operator,
          remark: `${remark} (库存不足，无子物料替代)`,
          issue_reason: extraData.issueReason || null,
          is_excess: extraData.isExcess || 0,
          allowNegativeStock: true, // 明确允许兜底出库
          unitCost: materialUnitCost,
        },
        connection
      );

      return; // 完成出库，直接返回
    }

    // 4. 使用子物料进行剩余数量的替代出库
    // let totalOutboundQuantity = 0;
    const insufficientMaterials = [];
    const successfulOutbounds = [];

    // 批量预取所有子物料信息（消除循环内 getMaterialInfo + cost_price 双重 N+1 查询）
    const childMaterialIds = childMaterials.map(cm => cm.material_id);
    const childMaterialInfoMap = await InventoryService.getBatchMaterialInfo(childMaterialIds, connection);

    for (const childMaterial of childMaterials) {
      const childStockQuantity = parseFloat(childMaterial.stock_quantity) || 0;
      const _childRequiredQuantity = parseFloat(childMaterial.quantity) || 1;

      // 修改：子物料出库量应该等于剩余需要出库的主物料数量
      // 因为子物料是替代主物料的，所以应该是1:1的关系
      const childOutboundQuantity = remainingQuantity;

      if (childStockQuantity < childOutboundQuantity) {
        insufficientMaterials.push({
          code: childMaterial.code,
          name: childMaterial.name,
          required: childOutboundQuantity,
          available: childStockQuantity,
        });
        continue; // 跳过库存不足的子物料，继续检查其他子物料
      }

      try {
        // 从批量预取结果获取子物料属性（含 costPrice）
        const childMatInfo = childMaterialInfoMap.get(childMaterial.material_id);
        const childLocationId = childMatInfo.locationId || locationId;
        const childUnitId = childMatInfo.unitId || null;
        const childUnitCost = childMatInfo.costPrice || 0;

        await InventoryService.updateStock(
          {
            materialId: childMaterial.material_id,
            locationId: childLocationId,
            transactionType: 'production_outbound', // 🔥 修改为 production_outbound
            quantity: -parseFloat(childOutboundQuantity),
            unitId: childUnitId, // 从物料表获取正确的 unit_id
            referenceNo: remark.split(': ')[1] || remark, // 提取出库单号
            referenceType: 'production_task', // 🔥 修改为 production_task
            operator,
            remark: `${remark} (替代物料 ${materialId})`,
            issue_reason: extraData.issueReason || null,
            is_excess: extraData.isExcess || 0,
            allowNegativeStock: true, // 智能查子料默认允许一定程度透支
            unitCost: childUnitCost,
          },
          connection
        );

        // totalOutboundQuantity += childOutboundQuantity;
        successfulOutbounds.push({
          code: childMaterial.code,
          name: childMaterial.name,
          quantity: childOutboundQuantity,
        });
      } catch (outboundError) {
        logger.error(`出库子物料 ${childMaterial.code} 失败:`, outboundError);
        insufficientMaterials.push({
          code: childMaterial.code,
          name: childMaterial.name,
          required: childOutboundQuantity,
          error: outboundError.message,
        });
      }
    }

    // 检查是否有成功的出库
    if (successfulOutbounds.length > 0) {
      // 部分成功的情况
      if (insufficientMaterials.length > 0) {
        logger.warn('部分物料库存不足，但已完成部分出库');
      }
    } else {
      // 所有子物料都库存不足
      const errorMessage = `所有子物料库存不足: ${insufficientMaterials.map((m) => `${m.code}(需要${m.required},库存${m.available})`).join(', ')}`;
      throw new Error(errorMessage);
    }
  } catch (error) {
    logger.error('智能出库失败:', error);
    throw error;
  }
}



