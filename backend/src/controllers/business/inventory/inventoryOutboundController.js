/**
 * inventoryController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { CodeGenerators } = require('../../../utils/codeGenerator');

const db = require('../../../config/db');
const { qualityApi } = require('../../../services/business/QualityService');
const InventoryService = require('../../../services/InventoryService');
const AsyncTaskService = require('../../../services/business/AsyncTaskService');
const businessConfig = require('../../../config/businessConfig');
const { getCurrentUserName } = require('../../../utils/userHelper');

// ✅ 审计修复: 导入 checkAndUpdateTaskStatus（此前未导入导致发料时 500 崩溃）
const { checkAndUpdateTaskStatus } = require('./inventoryConsistencyController');

// 统一库存查询子查询（基于 inventory_ledger 单表架构聚合计算当前库存）
const STOCK_SUBQUERY = `(SELECT material_id, location_id, COALESCE(SUM(quantity), 0) as quantity, MAX(created_at) as updated_at FROM inventory_ledger GROUP BY material_id, location_id)`;
// ✅ 审计修复(D-1): 移除冗余别名 SIMPLE_STOCK_SUBQUERY，全部统一使用 STOCK_SUBQUERY


// 引入成本凭证服务（用于生成领料凭证）
const CostAccountingService = require('../../../services/business/CostAccountingService');


// 引入状态映射工具和状态常量
const { apiStatusToDbStatus } = require('../../../utils/statusMapper');
const STATUS = {
  OUTBOUND: businessConfig.status.outbound,
  INBOUND: businessConfig.status.inbound,
  PRODUCTION_TASK: businessConfig.status.productionTask,
  PRODUCTION_PLAN: businessConfig.status.productionPlan,
  APPROVAL: businessConfig.status.approval,
  TRANSFER: businessConfig.status.transfer,
};

/** 出库单状态文本映射 */
const OUTBOUND_STATUS_TEXT = {
  draft: '草稿',
  confirmed: '已确认',
  completed: '已完成',
  cancelled: '已取消',
};
const getStatusText = (status) => OUTBOUND_STATUS_TEXT[status] || status || '未知';

/**
 * 获取物料的批次号（FIFO原则）
 * @param {object} connection - 数据库连接
 * @param {number} materialId - 物料ID
 * @param {number} locationId - 库位ID（可选）
 * @param {string} defaultBatchNo - 默认批次号（如果查询失败）
 * @returns {Promise<string>} 批次号
 */

const getOutboundList = async (req, res) => {
  try {
    // 确保参数为数字类型
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
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
      LIMIT ? OFFSET ?
    `;

    // ✅ 审计修复(S-5): LIMIT/OFFSET 使用参数化查询防止SQL注入
    // ✅ 修复: 先保存过滤参数，count 查询不应包含 LIMIT/OFFSET 参数
    const filterParams = [...params];
    params.push(parseInt(limit, 10), offset);
    const [outbounds] = await db.pool.query(listQuery, params);

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

    const [countResult] = await db.pool.query(countQuery, filterParams);
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
      LEFT JOIN ${STOCK_SUBQUERY} s ON m.id = s.material_id AND s.location_id = il.location_id
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
          LEFT JOIN ${STOCK_SUBQUERY} s
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

    // ✅ 审计修复(B-1): 统一使用状态常量替代硬编码字符串
    if (currentStatus !== STATUS.OUTBOUND.COMPLETED && items && items.length > 0) {
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
          // ✅ 审计修复(B-2): 出库物料扣减失败时不再静默吞噬
          // 此前仅记录日志并跳过，可能导致库存账实不符
          logger.error(`处理物料 ${item.material_id} 时出错:`, itemError);
          throw new Error(`物料 ${item.material_id} 出库处理失败: ${itemError.message}`);
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

    // ✅ 审计修复(B-3): referenceId 应赋值为 productionTaskId，而非硬编码 null
    // 此前 referenceId 始终为 null，导致出库单与生产任务关联断链
    const referenceId = productionTaskId;
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
      operator: outboundData.operator || await getCurrentUserName(req),
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

    // ✅ 审计修复: 统一使用状态常量
    if (status !== STATUS.OUTBOUND.COMPLETED) {
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
    const operator = await getCurrentUserName(req);

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


module.exports = {
  getOutboundList,
  getOutboundDetail,
  updateOutbound,
  _createOutbound,
  createOutbound,
  deleteOutbound,
  cancelOutbound,
  fetchBomItemsForOutbound,
  updateOutboundStatus,
  supplementOutbound,
  batchOutbound,
  getTaskMaterialIssueRecords,
  batchUpdateOutboundStatus,
  batchDeleteOutbound,
};
