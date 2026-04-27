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
const InventoryService = require('../../../services/InventoryService');
// const InventoryDeductionService = require('../../../services/business/InventoryDeductionService');
const businessConfig = require('../../../config/businessConfig');
const { getCurrentUserName } = require('../../../utils/userHelper');
const { getInventoryLedger } = require('./inventoryLedgerController');

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
      LIMIT ${parseInt(limit, 10)} OFFSET ${offset}
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

      const checkLocationQuery = 'SELECT id FROM locations WHERE id = ? AND deleted_at IS NULL';
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
    const operator = await getCurrentUserName(req);

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
  if (businessTypeCache && (now - businessTypeCacheTime) < BUSINESS_TYPE_CACHE_TTL) {
    return businessTypeCache;
  }
  try {
    const [rows] = await db.pool.execute('SELECT DISTINCT transaction_type FROM inventory_ledger');
    businessTypeCache = rows.map(r => r.transaction_type);
    businessTypeCacheTime = now;
  } catch (err) {
    logger.error('加载业务类型缓存失败:', err);
    businessTypeCache = [];
  }
  return businessTypeCache;
};

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
      'SELECT id, name as location_name FROM locations WHERE id = ? AND deleted_at IS NULL',
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
      LIMIT ${parseInt(limit, 10)} OFFSET ${offset}
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

        // 验证数量不能为负
        const parsedQuantity = parseFloat(stock.quantity);

        if (parsedQuantity < 0) {
          results.errors.push({
            row: stock.row,
            data: stock,
            error: '库存数量不能为负数',
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
          'SELECT id, name, status FROM locations WHERE code = ? AND deleted_at IS NULL',
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

        // 使用统一的 InventoryService 更新库存
        const InventoryService = require('../../../services/InventoryService');
        await InventoryService.updateStock(
          {
            materialId: materialId,
            locationId: locationId,
            quantity: adjustmentQuantity, // 可以是正数或负数
            transactionType: 'initial_import',
            referenceNo: adjustmentNo,
            referenceType: 'import_adjustment',
            operator: await getCurrentUserName(req),
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


module.exports = {
  getStockList,
  getStockRecords,
  getLocations,
  getMaterialsWithStock,
  getMaterialsList,
  adjustStock,
  getMaterialRecords,
  getMaterialStockDetail,
  getLowStock,
  checkStockSufficiency,
  downloadStockTemplate,
  importStock,
  exportStockData,
  getStockByLocation,
};
