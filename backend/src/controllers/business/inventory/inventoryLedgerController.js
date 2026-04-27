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
const BusinessTypeService = require('../../../services/BusinessTypeService');

// 统一库存查询子查询（基于 inventory_ledger 单表架构聚合计算当前库存）
const STOCK_SUBQUERY = `(SELECT material_id, location_id, COALESCE(SUM(quantity), 0) as quantity, MAX(created_at) as updated_at FROM inventory_ledger GROUP BY material_id, location_id)`;
// DRY: 两处引用相同子查询，统一使用 STOCK_SUBQUERY
const SIMPLE_STOCK_SUBQUERY = STOCK_SUBQUERY;

const {
  getInventoryTransactionTypeText,
  getTransferStatusText,
  getSalesStatusText,
  generateStatusCaseSQL,
  INVENTORY_TRANSACTION_TYPES,
  INVENTORY_TRANSACTION_GROUPS,
} = require('../../../constants/systemConstants');

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
 * @param {string} defaultBatchNo - 默认批次号（如果查询失败）
 * @returns {Promise<string>} 批次号
 */

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
        LIMIT ${parseInt(limit, 10)} OFFSET ${offset}
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
        LIMIT ${parseInt(limit, 10)} OFFSET ${offset}
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
        LIMIT ${parseInt(limit, 10)} OFFSET ${offset}
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
        LIMIT ${parseInt(limit, 10)} OFFSET ${offset}
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
        LIMIT ${parseInt(limit, 10)} OFFSET ${offset}
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
        LIMIT ${parseInt(limit, 10)} OFFSET ${offset}
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
      LIMIT ${limit} OFFSET ${offset}
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
      LIMIT ${parseInt(limit, 10)} OFFSET ${offset}
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
      LIMIT ${parseInt(limit, 10)} OFFSET ${offset}
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


module.exports = {
  _insertInventoryLedgerLocal,
  _getStockStatistics,
  getTransactionList,
  getTransactionStats,
  exportInventoryReport,
  exportTransactionReport,
  getInventoryReport,
  calculatePeriodInventory,
  getInventoryLedger,
  getMaterialLedger,
  getMovements,
};
