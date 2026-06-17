/**
 * outboundCrudController.js - 出库单CRUD操作
 * 从 inventoryOutboundController.js 拆分
 */

const { ResponseHandler } = require('../../../../utils/responseHandler');
const { logger } = require('../../../../utils/logger');
const { parsePagination, appendPaginationSQL } = require('../../../../utils/safePagination');
const { CodeGenerators } = require('../../../../utils/codeGenerator');
const db = require('../../../../config/db');
const { softDelete } = require('../../../../utils/softDelete');
const InventoryService = require('../../../../services/InventoryService');
const { getCurrentUserName } = require('../../../../utils/userHelper');
const { checkAndUpdateTaskStatus, _syncProductionStatus } = require('../inventoryConsistencyController');

const {
  getMaterialInfoMap,
  issueOutboundItemFromDetail,
  normalizeOutboundItem,
  normalizeIssueQuantities,
  isProductionOutboundReference,
  STATUS,
  STOCK_SUBQUERY,
  getStatusText,
} = require('./outboundHelpers');

const { fetchBomItemsForOutbound } = require('./outboundBomController');

const getOutboundList = async (req, res) => {
  try {
    // 确保参数为数字类型
    const pagination = parsePagination(req.query.page, req.query.limit || req.query.pageSize, {
      defaultPageSize: 20,
      maxPageSize: 100,
    });
    const {
      search = '',
      status = '',
      production_plan_id = '',
      production_group_id = '',
      startDate = '',
      endDate = '',
    } = req.query;

    // 构建搜索条件 - 只搜索出库单号和产品信息（不搜索物料明细）
    let whereClause = 'WHERE o.deleted_at IS NULL';
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
    const listQuery = appendPaginationSQL(`
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
    `, pagination.limit, pagination.offset);

    // LIMIT/OFFSET 使用参数化查询；count 查询不包含分页参数
    const filterParams = [...params];
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

    const statsQuery = `
      SELECT o.status, COUNT(DISTINCT o.id) as count
      FROM inventory_outbound o
      LEFT JOIN inventory_outbound_items oi ON o.id = oi.outbound_id
      LEFT JOIN materials m ON oi.material_id = m.id
      LEFT JOIN production_tasks pt ON pt.id = COALESCE(o.production_task_id, CASE WHEN o.reference_type = 'production_task' THEN o.reference_id ELSE NULL END)
      LEFT JOIN materials p ON pt.product_id = p.id
      ${whereClause}
      GROUP BY o.status
    `;
    const [statsRows] = await db.pool.query(statsQuery, filterParams);
    const statistics = {
      total,
      draftCount: 0,
      confirmedCount: 0,
      partialCompletedCount: 0,
      completedCount: 0,
      reversedCount: 0,
      cancelledCount: 0,
    };
    const statusStatsMap = {
      draft: 'draftCount',
      confirmed: 'confirmedCount',
      partial_completed: 'partialCompletedCount',
      completed: 'completedCount',
      reversed: 'reversedCount',
      cancelled: 'cancelledCount',
    };
    for (const row of statsRows) {
      const key = statusStatsMap[row.status];
      if (key) {
        statistics[key] = Number(row.count) || 0;
      }
    }

    // 处理状态显示和日期格式
    const items = outbounds.map((item) => ({
      ...item,
      created_at: item.created_at_formatted, // 使用格式化后的时间
      status_text: getStatusText(item.status),
    }));

    ResponseHandler.paginated(
      res,
      items,
      total,
      pagination.page,
      pagination.pageSize,
      '获取出库单列表成功',
      { statistics }
    );
  } catch (error) {
    logger.error('获取出库单列表失败:', error);
    ResponseHandler.error(res, '获取出库单列表失败', 'SERVER_ERROR', 500, error);
  }
};

const exportOutbound = async (req, res) => {
  try {
    const {
      search = '',
      status = '',
      production_plan_id = '',
      production_group_id = '',
      startDate = '',
      endDate = '',
    } = req.query;

    let whereClause = 'WHERE o.deleted_at IS NULL';
    const params = [];

    if (search) {
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

    if (status) {
      whereClause += ' AND o.status = ?';
      params.push(status);
    }

    if (production_plan_id) {
      whereClause += ' AND o.reference_id = ? AND o.reference_type = "production_plan"';
      params.push(production_plan_id);
    }

    if (production_group_id) {
      whereClause += ' AND p.production_group_id = ?';
      params.push(production_group_id);
    }

    if (startDate) {
      whereClause += ' AND o.outbound_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND o.outbound_date <= ?';
      params.push(endDate);
    }

    const [rows] = await db.pool.query(
      `
      SELECT
        o.outbound_no,
        DATE_FORMAT(o.outbound_date, '%Y-%m-%d') as outbound_date,
        o.status,
        o.outbound_type,
        o.reference_type,
        o.reference_id,
        COALESCE(
          (SELECT u.real_name FROM users u WHERE u.username = o.operator LIMIT 1),
          o.operator
        ) as operator_name,
        COUNT(DISTINCT oi.id) as item_count,
        COALESCE(SUM(COALESCE(NULLIF(oi.actual_quantity, 0), oi.quantity)), 0) as actual_quantity,
        COALESCE(SUM(oi.shortage_quantity), 0) as shortage_quantity,
        GROUP_CONCAT(DISTINCT l.name ORDER BY l.name SEPARATOR ', ') as location_names,
        GROUP_CONCAT(DISTINCT pg.name ORDER BY pg.name SEPARATOR ', ') as production_group_names,
        o.remark,
        DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') as created_at
      FROM inventory_outbound o
      LEFT JOIN inventory_outbound_items oi ON o.id = oi.outbound_id
      LEFT JOIN materials m ON oi.material_id = m.id
      LEFT JOIN locations l ON m.location_id = l.id
      LEFT JOIN production_tasks pt ON pt.id = COALESCE(o.production_task_id, CASE WHEN o.reference_type = 'production_task' THEN o.reference_id ELSE NULL END)
      LEFT JOIN materials p ON pt.product_id = p.id
      LEFT JOIN departments pg ON p.production_group_id = pg.id AND pg.status = 1
      ${whereClause}
      GROUP BY o.id, o.outbound_no, o.outbound_date, o.status, o.outbound_type, o.reference_type,
               o.reference_id, o.operator, o.remark, o.created_at
      ORDER BY o.created_at DESC
      `,
      params
    );

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('出库单');
    worksheet.columns = [
      { header: '出库单号', key: 'outbound_no', width: 20 },
      { header: '出库日期', key: 'outbound_date', width: 14 },
      { header: '状态', key: 'status_text', width: 14 },
      { header: '类型', key: 'outbound_type', width: 16 },
      { header: '关联类型', key: 'reference_type', width: 18 },
      { header: '关联ID', key: 'reference_id', width: 12 },
      { header: '仓库', key: 'location_names', width: 24 },
      { header: '生产组', key: 'production_group_names', width: 20 },
      { header: '明细数', key: 'item_count', width: 10 },
      { header: '实发数量', key: 'actual_quantity', width: 14 },
      { header: '缺料数量', key: 'shortage_quantity', width: 14 },
      { header: '操作人', key: 'operator_name', width: 16 },
      { header: '创建时间', key: 'created_at', width: 20 },
      { header: '备注', key: 'remark', width: 30 },
    ];

    rows.forEach((row) => {
      worksheet.addRow({
        ...row,
        status_text: getStatusText(row.status),
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="inventory_outbound_${Date.now()}.xlsx"`
    );
    return res.send(buffer);
  } catch (error) {
    logger.error('导出出库单失败:', error);
    return ResponseHandler.error(res, '导出出库单失败', 'SERVER_ERROR', 500, error);
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

    // 如果是生产出库单且明细为空且状态为draft（撤销后的情况），从统一净需求重新生成并保存
    // 注意：completed状态只显示实际出库明细，不再临时展开BOM
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
        `出库单 ${id} (状态:${STATUS.OUTBOUND.DRAFT}) 明细为空，准备从统一净需求重新生成...`
      );

      // 使用统一净需求结果保存物料明细
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
        logger.warn(`出库单 ${id} 从统一净需求生成物料失败: ${bomResult.error}`);
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

    const enhancedItems = processedItems;

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
      items: enhancedItems,
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
      'SELECT status FROM inventory_outbound WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '出库单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = checkResult[0].status;

    // 只要出库单还没有完成(completed),就允许更新
    if (currentStatus === STATUS.OUTBOUND.COMPLETED) {
      await connection.rollback();
      return ResponseHandler.error(res, '已完成的出库单不能修改', 'VALIDATION_ERROR', 400);
    }

    // 格式化日期
    const formattedDate = new Date(outbound_date).toISOString().split('T')[0];

    // 更新出库单主表 - 移除对production_plan_id的引用
    await connection.execute(
      'UPDATE inventory_outbound SET outbound_date = ?, status = ?, operator = ?, remark = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [formattedDate, status, operator, remark, id]
    );

    // 统一使用状态常量替代硬编码字符串
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
      'SELECT reference_id, reference_type, production_task_id FROM inventory_outbound WHERE id = ? AND deleted_at IS NULL',
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
        'SELECT outbound_no, operator, reference_id, reference_type, production_task_id, issue_reason, is_excess FROM inventory_outbound WHERE id = ? AND deleted_at IS NULL',
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
      const completedMaterialInfoMap = await getMaterialInfoMap(connection, completedMaterialIds);

      // 处理每个物料项
      for (const item of items) {
        try {
          // 从批量预取结果获取物料的默认库位
          const matInfo = completedMaterialInfoMap.get(item.material_id);
          const locationId = matInfo?.locationId || null; // 从物料表取真实默认库位，如果没有不能强行转1

          // ========== 部分发料支持: 使用actual_quantity扣减库存 ==========
          const actualQuantity = isProductionOutbound
            ? parseFloat(item.actual_quantity ?? 0) || 0
            : parseFloat(item.actual_quantity ?? item.quantity) || 0;

          if (actualQuantity > 0) {
            if (isProductionOutbound) {
              await issueOutboundItemFromDetail({
                connection,
                item: { ...item, actual_quantity: actualQuantity },
                locationId,
                outboundNo: outboundRecord.outbound_no,
                operator: outboundRecord.operator,
                referenceType,
                unitId: item.unit_id,
                issueReason: outboundRecord.issue_reason,
                isExcess: outboundRecord.is_excess,
                batchNumber: item.batch_number || item.batchNumber,
              });
            } else {
              // 普通出库逻辑：由于单仓架构废弃了旧库位校验规则，且不再存在“智能寻仓”，强制使用物料的默认存放仓库 (或业务指派) 出库。
              // 若未指定仓库且物料也未配置默认仓库，拒绝出库以防库存错乱。
              if (!locationId) {
                throw new Error(`物料 ${item.material_id} 未配置默认仓库，不支持普通出库。请维护物料基础资料，或启用智能全仓发料。`);
              }

              const outboundTransactionTypeMap = {
                purchase_return: 'purchase_return',
                sales_order: 'sales_outbound',
                sales: 'sales_outbound',
                transfer: 'transfer',
              };

              await InventoryService.updateStock(
                {
                  materialId: item.material_id,
                  locationId,
                  quantity: -actualQuantity,
                  transactionType: outboundTransactionTypeMap[referenceType] || 'outbound',
                  referenceNo: outboundRecord.outbound_no,
                  referenceType: 'outbound',
                  operator: outboundRecord.operator,
                  remark: `出库单号: ${outboundRecord.outbound_no}`,
                  unitId: item.unit_id,
                  batchNumber: item.batch_number || item.batchNumber,
                  issue_reason: outboundRecord.issue_reason,
                  is_excess: outboundRecord.is_excess,
                },
                connection
              );
            }
          }

          // 创建追溯记录 (复制自 updateOutboundStatus)
        } catch (itemError) {
          // 出库物料扣减失败时立即中断，避免库存账实不符
          logger.error(`处理物料 ${item.material_id} 时出错:`, itemError);
          throw new Error(`物料 ${item.material_id} 出库处理失败: ${itemError.message}`, {
            cause: itemError,
          });
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

    // referenceId 使用生产任务 ID，保持出库单与生产任务关联
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
          'SELECT id, status FROM production_tasks WHERE id = ? AND deleted_at IS NULL',
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
            'UPDATE production_tasks SET status = ?, actual_start_time = ? WHERE id = ? AND deleted_at IS NULL',
            [STATUS.PRODUCTION_TASK.MATERIAL_ISSUING, outboundDate, productionTaskId]
          );
          logger.debug(
            `生产任务 ${productionTaskId} 状态已更新为"发料中"，发料时间: ${outboundDate}`
          );

          // 同时更新关联的生产计划状态为"发料中"
          const [planCheck] = await connection.execute(
            'SELECT plan_id FROM production_tasks WHERE id = ? AND deleted_at IS NULL',
            [productionTaskId]
          );

          if (planCheck.length > 0 && planCheck[0].plan_id) {
            await connection.execute(
              'UPDATE production_plans SET status = ? WHERE id = ? AND deleted_at IS NULL AND status IN (?, ?, ?)',
              ['material_issuing', planCheck[0].plan_id, 'draft', 'allocated', 'preparing']
            );
            logger.debug(`生产计划 ${planCheck[0].plan_id} 状态已更新为"发料中"`);
          }
        }
      } catch (taskError) {
        logger.error('更新生产任务状态失败:', taskError);
        throw taskError;
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

    outboundData.items = outboundData.items.map(normalizeOutboundItem);

    // 如果没有items，直接提交并返回
    if (outboundData.items.length === 0) {
      if (referenceType === 'production_task' && productionTaskId) {
        const fillResult = await fetchBomItemsForOutbound(
          connection,
          outboundId,
          referenceType,
          productionTaskId
        );
        if (!fillResult.success) {
          throw new Error(fillResult.error);
        }
        await connection.commit();
        return {
          id: outboundId,
          outboundNo: outboundNo,
          generatedItems: fillResult.itemCount,
          warning: 'Production outbound items were generated from net material requirements',
        };
      }

      throw new Error('出库单没有明细项，不能创建');
    }

    // 批量获取所有物料的仓库和单位信息（通过 InventoryService 统一入口）
    const materialIds = outboundData.items.map((item) => item.materialId);
    const materialInfoMap = await getMaterialInfoMap(connection, materialIds);

    // 构建兼容的 materialLocationMap（供后续逻辑使用）
    const materialLocationMap = {};
    for (const [id, info] of materialInfoMap) {
      materialLocationMap[id] = info.locationId;
    }

    // 记录不存在或没有默认库位的物料ID
    const missingMaterials = [];

    // 插入出库单明细
    for (const item of outboundData.items) {
      if (!item.materialId) {
        throw new Error('每个出库项目必须包含物料ID和数量');
      }

      const matInfo = materialInfoMap.get(item.materialId);
      const { plannedQuantity, actualQuantity, shortageQuantity, isShortage } =
        normalizeIssueQuantities(item);
      if (plannedQuantity <= 0) {
        throw new Error('Invalid outbound item quantity');
      }

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
      if (!locationId && actualQuantity > 0) {
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
          throw new Error('查询库存失败,无法创建出库单', { cause: stockError });
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
            plannedQuantity,
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
          if (isProductionOutboundReference(referenceType)) {
            await issueOutboundItemFromDetail({
              connection,
              item: { material_id: item.materialId, actual_quantity: actualQuantity },
              locationId,
              outboundNo,
              operator,
              referenceType,
              unitId: item.unitId,
              issueReason: outboundData.issueReason || outboundData.issue_reason,
              isExcess: outboundData.isExcess || 0,
              batchNumber: item.batchNumber || item.batch_number,
            });
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
        await connection.execute('UPDATE inventory_outbound SET status = ? WHERE id = ? AND deleted_at IS NULL', [
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

    // 根据业务错误码选择正确的HTTP状态码
    const errorMessage = error.message;
    let statusCode = 500;

    if (error.code === 'EXCESS_ISSUE') {
      // 超额领料需要用户确认 → 409 Conflict
      statusCode = 409;
    } else if (error.code === 'MISSING_ISSUE_REASON') {
      // 缺少超额原因 → 400 Bad Request
      statusCode = 400;
    } else if (
      error.message &&
      error.message.includes('物料ID') &&
      error.message.includes('不存在或没有设置默认库位')
    ) {
      statusCode = 400;
    } else if (error.message && error.message.includes('库存不足')) {
      statusCode = 400;
    } else if (error.message && error.message.includes('年度结存')) {
      statusCode = 400;
    }

    const responseError = error instanceof Error ? error : new Error(error.message || errorMessage);
    responseError.code = error.code;
    responseError.details = error.details;

    ResponseHandler.error(
      res,
      error.message || '创建出库单失败',
      error.code || (statusCode === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR'),
      statusCode,
      responseError
    );
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
      'SELECT status, reference_id, reference_type FROM inventory_outbound WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '出库单不存在', 'NOT_FOUND', 404);
    }

    const { status, reference_id, reference_type } = checkResult[0];

    // 检查出库单状态，只允许删除草稿状态的出库单
    if (status !== 'draft') {
      await connection.rollback();
      return ResponseHandler.error(res, '只能删除草稿状态的出库单', 'VALIDATION_ERROR', 400);
    }

    // 如果出库单关联了生产任务,回退任务状态
    if (reference_id && reference_type === 'production_task') {
      try {
        // 检查任务当前状态
        const [taskCheck] = await connection.execute(
          'SELECT status FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
          [reference_id]
        );

        if (taskCheck.length > 0) {
          const currentTaskStatus = taskCheck[0].status;

          // 只有在发料相关状态时才回退
          if (['material_issuing', 'preparing'].includes(currentTaskStatus)) {
            // 回退任务状态到pending,并清除发料时间
            await connection.execute(
              'UPDATE production_tasks SET status = ?, actual_start_time = NULL WHERE id = ? AND deleted_at IS NULL',
              ['pending', reference_id]
            );
            logger.info(`生产任务 ${reference_id} 状态已回退: ${currentTaskStatus} → pending`);

            // 同时回退关联的生产计划状态
            const [planCheck] = await connection.execute(
              'SELECT plan_id FROM production_tasks WHERE id = ? AND deleted_at IS NULL',
              [reference_id]
            );

            if (planCheck.length > 0 && planCheck[0].plan_id) {
              const planId = planCheck[0].plan_id;
              await connection.execute(
                'UPDATE production_plans SET status = ? WHERE id = ? AND deleted_at IS NULL AND status IN (?, ?)',
                ['draft', planId, 'material_issuing', 'preparing']
              );
              logger.info(`生产计划 ${planId} 状态已回退到 draft`);
            }
          }
        }
      } catch (taskError) {
        logger.error('回退生产任务状态失败:', taskError);
        throw taskError;
      }
    }

    // 如果出库单关联了生产计划(直接关联),也回退计划状态
    if (reference_id && reference_type === 'production_plan') {
      try {
        const [planCheck] = await connection.execute(
          'SELECT status FROM production_plans WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
          [reference_id]
        );

        if (planCheck.length > 0) {
          const currentPlanStatus = planCheck[0].status;

          if (['material_issuing', 'preparing'].includes(currentPlanStatus)) {
            await connection.execute('UPDATE production_plans SET status = ? WHERE id = ? AND deleted_at IS NULL', [
              'draft',
              reference_id,
            ]);
            logger.info(`生产计划 ${reference_id} 状态已回退: ${currentPlanStatus} → draft`);
          }
        }
      } catch (planError) {
        logger.error('回退生产计划状态失败:', planError);
        throw planError;
      }
    }

    // 删除出库单明细
    await connection.execute('DELETE FROM inventory_outbound_items WHERE outbound_id = ?', [id]);

    // ✅ 软删除出库单主表
    await softDelete(connection, 'inventory_outbound', 'id', id);

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

module.exports = {
  getOutboundList,
  exportOutbound,
  getOutboundDetail,
  updateOutbound,
  _createOutbound,
  createOutbound,
  deleteOutbound,
};
