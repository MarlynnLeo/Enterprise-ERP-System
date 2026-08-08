/**
 * outboundHelpers.js - 出库单辅助函数
 * 从 inventoryOutboundController.js 拆分
 */

/**
 * inventoryController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../../utils/responseHandler');
const { logger } = require('../../../../utils/logger');

const db = require('../../../../config/db');

const InventoryService = require('../../../../services/InventoryService');
const businessConfig = require('../../../../config/businessConfig');

// 导入生产发料状态同步能力
const { _syncProductionStatus } = require('../inventoryConsistencyController');
const {
  calculateMaterialRequirementsWithStock,
} = require('../../../../services/business/MaterialCalculationService');

// 统一库存查询子查询（基于 inventory_ledger 单表架构聚合计算当前库存）
const STOCK_SUBQUERY = `(SELECT material_id, location_id, COALESCE(SUM(quantity), 0) as quantity, MAX(created_at) as updated_at FROM inventory_ledger GROUP BY material_id, location_id)`;

const PRODUCTION_OUTBOUND_REFERENCE_TYPES = new Set([
  'production_task',
  'production_plan',
  'batch_production_tasks',
]);

const isProductionOutboundReference = (referenceType) =>
  PRODUCTION_OUTBOUND_REFERENCE_TYPES.has(referenceType);

// HTTP 入参只认 camel；归一化后内部统一 materialId/unitId/batchNumber
const normalizeOutboundItem = (item = {}) => ({
  ...item,
  // Accept camel (preferred) and snake (FieldMap / UAT)
  materialId: item.materialId ?? item.material_id,
  unitId: item.unitId ?? item.unit_id,
  batchNumber: item.batchNumber ?? item.batch_number ?? item.batchNo ?? item.batch_no,
  quantity: item.quantity,
  plannedQuantity: item.plannedQuantity ?? item.planned_quantity,
  actualQuantity: item.actualQuantity ?? item.actual_quantity,
});

const toQuantityNumber = (value, fallback = 0) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeIssueQuantities = (item) => {
  const plannedQuantity = toQuantityNumber(
    item.planned_quantity ??
      item.plannedQuantity ??
      item.required_quantity ??
      item.requiredQuantity ??
      item.quantity,
    0
  );

  const actualFallback = plannedQuantity;
  const actualQuantity = toQuantityNumber(
    item.actual_quantity ??
      item.actualQuantity ??
      item.issue_quantity ??
      item.issueQuantity,
    actualFallback
  );

  const shortageQuantity = toQuantityNumber(
    item.shortage_quantity ?? item.shortageQuantity,
    Math.max(plannedQuantity - actualQuantity, 0)
  );

  return {
    plannedQuantity,
    actualQuantity,
    shortageQuantity,
    isShortage: shortageQuantity > 0 ? 1 : 0,
  };
};



const getMaterialInfoMap = async (connection, materialIds) => {
  const uniqueIds = [...new Set((materialIds || []).filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const placeholders = uniqueIds.map(() => '?').join(',');
  const [rows] = await connection.execute(
    `SELECT id, code, name, location_id, unit_id, price, COALESCE(cost_price, 0) AS cost_price
     FROM materials
     WHERE id IN (${placeholders})`,
    uniqueIds
  );

  const infoMap = new Map(
    rows.map((row) => [
      row.id,
      {
        locationId: row.location_id || null,
        unitId: row.unit_id || null,
        code: row.code || '',
        name: row.name || '',
        price: parseFloat(row.price) || 0,
        costPrice: parseFloat(row.cost_price) || 0,
      },
    ])
  );

  for (const id of uniqueIds) {
    if (!infoMap.has(id)) {
      throw new Error(`Material ${id} does not exist`);
    }
  }

  return infoMap;
};

const getProductionPlanMaterialRows = async (connection, planId) => {
  if (!planId) return [];

  const [columnRows] = await connection.execute(
    `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'production_plan_materials'
    `
  );
  const columnSet = new Set(columnRows.map((column) => column.COLUMN_NAME));
  const grossColumn = columnSet.has('gross_required_quantity')
    ? 'ppm.gross_required_quantity'
    : 'ppm.required_quantity';
  const issueColumn = columnSet.has('issue_quantity')
    ? 'ppm.issue_quantity'
    : 'ppm.required_quantity';
  const shortageColumn = columnSet.has('shortage_quantity')
    ? 'ppm.shortage_quantity'
    : '0';

  const [rows] = await connection.execute(
    `
    SELECT
      ppm.material_id,
      ${grossColumn} AS gross_required_quantity,
      ppm.required_quantity,
      ${issueColumn} AS issue_quantity,
      ${shortageColumn} AS shortage_quantity,
      ppm.stock_quantity,
      ppm.level,
      m.unit_id
    FROM production_plan_materials ppm
    JOIN materials m ON m.id = ppm.material_id
    WHERE ppm.plan_id = ?
      AND ppm.required_quantity > 0
    ORDER BY ppm.level ASC, ppm.id ASC
    `,
    [planId]
  );

  return rows;
};

const mergeRequirementRows = (materialMap, rows, scale = 1, sourceTask = null) => {
  for (const row of rows) {
    const plannedQuantity = (parseFloat(row.required_quantity) || 0) * scale;
    const issueQuantity = (parseFloat(row.issue_quantity ?? row.issueQuantity ?? row.required_quantity) || 0) * scale;
    const shortageQuantity = (parseFloat(row.shortage_quantity ?? row.shortageQuantity ?? 0) || 0) * scale;
    const grossRequiredQuantity =
      (parseFloat(row.gross_required_quantity ?? row.grossRequiredQuantity ?? row.required_quantity) || 0) *
      scale;
    if (plannedQuantity <= 0) continue;

    // rows 来自 SQL（snake）
    const materialId = row.material_id;
    const existing = materialMap.get(materialId) || {
      material_id: materialId,
      unit_id: row.unit_id || null,
      quantity: 0,
      planned_quantity: 0,
      actual_quantity: 0,
      shortage_quantity: 0,
      gross_required_quantity: 0,
      level: row.level || 1,
      source_tasks: [],
    };

    existing.quantity += plannedQuantity;
    existing.planned_quantity += plannedQuantity;
    existing.actual_quantity += issueQuantity;
    existing.shortage_quantity += shortageQuantity;
    existing.gross_required_quantity += grossRequiredQuantity;
    existing.level = Math.min(existing.level || row.level || 1, row.level || 1);
    if (!existing.unit_id && row.unit_id) {
      existing.unit_id = row.unit_id;
    }
    if (sourceTask) {
      existing.source_tasks.push({
        ...sourceTask,
        quantity: plannedQuantity,
        actual_quantity: issueQuantity,
        shortage_quantity: shortageQuantity,
      });
    }
    materialMap.set(materialId, existing);
  }
};

const getTaskNetRequirementRows = async (connection, task) => {
  const planMaterials = await getProductionPlanMaterialRows(connection, task.plan_id);
  if (planMaterials.length > 0) {
    const planQuantity = parseFloat(task.plan_quantity) || parseFloat(task.quantity) || 1;
    const taskQuantity = parseFloat(task.quantity) || 0;
    const scale = planQuantity > 0 ? taskQuantity / planQuantity : 1;
    return planMaterials.map((row) => ({
      ...row,
      gross_required_quantity: (parseFloat(row.gross_required_quantity) || 0) * scale,
      required_quantity: (parseFloat(row.required_quantity) || 0) * scale,
      issue_quantity: (parseFloat(row.issue_quantity) || 0) * scale,
      shortage_quantity: (parseFloat(row.shortage_quantity) || 0) * scale,
    }));
  }

  const requirements = await calculateMaterialRequirementsWithStock(
    task.product_id,
    task.bom_id || null,
    parseFloat(task.quantity) || 0,
    task.plan_id || null
  );

  return requirements.map((item) => ({
    material_id: item.materialId,
    required_quantity: item.requiredQuantity,
    gross_required_quantity: item.grossRequiredQuantity || item.requiredQuantity,
    issue_quantity: item.issueQuantity ?? item.requiredQuantity,
    shortage_quantity: item.shortageQuantity || 0,
    level: item.level || 1,
    unit_id: item.unitId || null,
  }));
};

const insertOutboundRequirementItems = async (connection, outboundId, materialMap) => {
  const materials = Array.from(materialMap.values()).filter((item) => item.quantity > 0);
  const missingUnitMaterialIds = materials
    .filter((item) => !item.unit_id)
    .map((item) => item.material_id);

  if (missingUnitMaterialIds.length > 0) {
    const uniqueMissingUnitIds = [...new Set(missingUnitMaterialIds)];
    const placeholders = uniqueMissingUnitIds.map(() => '?').join(',');
    const [unitRows] = await connection.execute(
      `SELECT id, unit_id FROM materials WHERE id IN (${placeholders})`,
      uniqueMissingUnitIds
    );
    const unitMap = new Map(unitRows.map((row) => [row.id, row.unit_id]));

    for (const material of materials) {
      if (!material.unit_id) {
        material.unit_id = unitMap.get(material.material_id) || null;
      }
    }
  }

  for (const material of materials) {
    const plannedQuantity = Number(material.planned_quantity ?? material.quantity) || 0;
    const actualQuantity = Number(material.actual_quantity ?? material.quantity) || 0;
    const shortageQuantity = Number(material.shortage_quantity ?? 0) || 0;

    await connection.execute(
      `INSERT INTO inventory_outbound_items
        (outbound_id, material_id, quantity, planned_quantity, actual_quantity,
         shortage_quantity, is_shortage, unit_id, source_tasks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        outboundId,
        material.material_id,
        plannedQuantity,
        plannedQuantity,
        actualQuantity,
        shortageQuantity,
        shortageQuantity > 0 ? 1 : 0,
        material.unit_id,
        material.source_tasks.length > 0 ? JSON.stringify(material.source_tasks) : null,
      ]
    );
  }

  return materials.length;
};

const issueOutboundItemFromDetail = async ({
  connection,
  item,
  locationId,
  outboundNo,
  operator,
  referenceType,
  unitId,
  issueReason = null,
  isExcess = 0,
  batchNumber = null,
}) => {
  const actualQuantity = parseFloat(item.actual_quantity ?? item.actualQuantity ?? 0);
  if (actualQuantity <= 0) return null;

  // issue 明细来自 DB 行（snake）
  if (!locationId) {
    throw new Error(`Material ${item.material_id} has no default location`);
  }

  const currentStock = await InventoryService.getCurrentStock(
    item.material_id,
    locationId,
    connection,
    true
  );

  if (currentStock < actualQuantity) {
    throw new Error(
      `Material ${item.material_id} stock is insufficient. Current ${currentStock}, required ${actualQuantity}`
    );
  }

  const materialId = item.material_id;
  const txType = isProductionOutboundReference(referenceType)
    ? 'production_outbound'
    : 'outbound';
  // 批次键 SSOT：与 InventoryService 一致；空键表示由服务层 FIFO 拆批
  const normalizedBatch = InventoryService._normalizeBatchNumber(batchNumber);
  const batchKey = normalizedBatch || 'EMPTY';

  return InventoryService.updateStock(
    {
      materialId,
      locationId,
      transactionType: txType,
      quantity: -actualQuantity,
      unitId,
      referenceNo: outboundNo,
      referenceType: 'outbound',
      operator,
      remark: `Outbound: ${outboundNo}`,
      issue_reason: issueReason,
      is_excess: isExcess,
      // 空批次不要写 null；省略语义由服务层按 FIFO 处理（传 '' 等价）
      ...(normalizedBatch ? { batchNumber: normalizedBatch } : {}),
      idempotencyKey: `${txType}:${outboundNo}:${materialId}:${locationId}:${batchKey}:${actualQuantity}`,
    },
    connection
  );
};


// 引入成本凭证服务（用于生成领料凭证）


// 引入状态映射工具和状态常量

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
  partial_completed: '部分完成',
  completed: '已完成',
  reversed: '已冲销',
  cancelled: '已取消',
};
const getStatusText = (status) => OUTBOUND_STATUS_TEXT[status] || status || '未知';

/**
 * 获取物料的批次号（FIFO原则）
 * @param {object} connection - 数据库连接
 * @param {number} materialId - 物料ID
 * @param {number} locationId - 库位ID（可选）
 * @param {string} fallbackBatchNo - 调用方显式传入的候选批次号
 * @returns {Promise<string>} 批次号
 */

const getTaskMaterialIssueRecords = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return ResponseHandler.error(res, '任务ID不能为空', 'VALIDATION_ERROR', 400);
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

module.exports = {
  getMaterialInfoMap,
  getProductionPlanMaterialRows,
  getTaskNetRequirementRows,
  insertOutboundRequirementItems,
  issueOutboundItemFromDetail,
  getTaskMaterialIssueRecords,
  mergeRequirementRows,
  normalizeOutboundItem,
  normalizeIssueQuantities,
  toQuantityNumber,
  isProductionOutboundReference,
  STATUS,
  STOCK_SUBQUERY,
  getStatusText,
};
