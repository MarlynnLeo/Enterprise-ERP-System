/**
 * MaterialCalculationService.js
 * @description 物料需求计算服务 (已深度对接专业级 Gross-to-Net MRP 联机推演算法)
 * @date 2026-03-27
 * @version 3.0.0
 */

const { pool } = require('../../config/db');
const { logger } = require('../../utils/logger');
const BomExplosionService = require('../BomExplosionService');
const { PRODUCTION_STATUS_KEYS } = require('../../constants/systemConstants');

const MATERIAL_ALLOCATION_PLAN_STATUSES = Object.freeze([
  PRODUCTION_STATUS_KEYS.MATERIAL_ISSUED,
  PRODUCTION_STATUS_KEYS.IN_PROGRESS,
  PRODUCTION_STATUS_KEYS.INSPECTION,
]);

/**
 * 智能净需求 MRP 推演引擎 (Option 3: 动态库存抵扣式算法)
 * 完全解决父子组件的双重计算问题 (Double Counting)
 */
async function calculateMaterialRequirementsWithStock(productId, bomId, quantity, planIdToExclude = null) {
  // 1. 利用现有的粗展平获取涉及到的所有可能物料的字典，便于一次性查库存
  const explosionResult = await BomExplosionService.explodeBom(productId, bomId, quantity, false);
  if (!explosionResult || explosionResult.length === 0) {
    return [];
  }

  const allMaterialIds = [...new Set(explosionResult.map(item => item.material_id))];
  const materialInfoMap = new Map();
  const materialTraceMap = new Map();
  for (const item of explosionResult) {
    if (!materialInfoMap.has(item.material_id)) {
      materialInfoMap.set(item.material_id, {
        code: item.material_code,
        name: item.material_name,
        specification: item.material_specs || '',
        specs: item.material_specs || '',
        unit: item.unit_name || ''
      });
    }

    if (!materialTraceMap.has(item.material_id)) {
      materialTraceMap.set(item.material_id, {
        minLevel: Number(item.level) || 1,
        paths: [],
        parentMaterialIds: new Set(),
        sourceBomIds: new Set(),
        isLeaf: item.is_leaf !== false
      });
    }
    const trace = materialTraceMap.get(item.material_id);
    trace.minLevel = Math.min(trace.minLevel, Number(item.level) || 1);
    if (item.bom_path && !trace.paths.includes(item.bom_path)) {
      trace.paths.push(item.bom_path);
    }
    if (item.parent_material_id) trace.parentMaterialIds.add(item.parent_material_id);
    if (item.source_bom_id) trace.sourceBomIds.add(item.source_bom_id);
    trace.isLeaf = trace.isLeaf && item.is_leaf !== false;
  }

  // 2. 批量查验全局真实可用库存字典
  const [planMaterialColumns] = await pool.query(
    `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'production_plan_materials'
    `
  );
  const planMaterialColumnSet = new Set(planMaterialColumns.map((column) => column.COLUMN_NAME));
  const allocationQuantityExpression = planMaterialColumnSet.has('issue_quantity')
    ? 'COALESCE(ppm.issue_quantity, ppm.required_quantity, 0)'
    : 'COALESCE(ppm.required_quantity, 0)';

  let allocationExcludeClause = "";
  const queryParams = [MATERIAL_ALLOCATION_PLAN_STATUSES];
  if (planIdToExclude) {
     allocationExcludeClause = ` AND pp.id != ? `;
     queryParams.push(planIdToExclude);
  }
  queryParams.push(allMaterialIds);

  const [stockInfo] = await pool.query(
    `
    SELECT m.id as material_id,
      COALESCE(s.quantity, 0) as stock_quantity,
      GREATEST(COALESCE(s.quantity, 0) - COALESCE(alloc.allocated_quantity, 0), 0) as available_quantity
    FROM materials m
    LEFT JOIN (
      SELECT il.material_id, SUM(il.quantity) as quantity
      FROM inventory_ledger il
      JOIN materials mat ON il.material_id = mat.id
      WHERE mat.location_id IS NULL OR il.location_id = mat.location_id
      GROUP BY il.material_id
    ) s ON m.id = s.material_id
    LEFT JOIN (
      SELECT ppm.material_id, SUM(${allocationQuantityExpression}) as allocated_quantity
      FROM production_plan_materials ppm
      JOIN production_plans pp ON ppm.plan_id = pp.id
      WHERE pp.status IN (?)
        ${allocationExcludeClause}
      GROUP BY ppm.material_id
    ) alloc ON m.id = alloc.material_id
    WHERE m.id IN (?)
    `,
    queryParams
  );

  // 游标库存：推演过程边扣减边变化
  const dynamicStockMap = new Map();
  // 原始库存：保留展示给前端看
  const originalStockMap = new Map();

  for (const row of stockInfo) {
    dynamicStockMap.set(row.material_id, Number(row.available_quantity) || 0);
    originalStockMap.set(row.material_id, {
      stockQuantity: Number(row.stock_quantity) || 0,
      availableQuantity: Number(row.available_quantity) || 0
    });
  }

  // 3. 调用企业级单一事实来源（BomExplosionService 高级净推演能力）
  const netReqMap = new Map();
  await BomExplosionService.explodeBom(productId, bomId, quantity, false, {
    netStockMap: dynamicStockMap,
    netReqMap: netReqMap
  });

  // 4. 重组干净的完美视图供落盘和展示
  const materials = [];
  for (const [matId, req] of netReqMap.entries()) {
    let info = materialInfoMap.get(matId);

    // 兜底查询 (极小概率某级半成品由于引用异常未在预展出现)
    if (!info) {
      const [matInfo] = await pool.query(`SELECT m.code, m.name, m.specs, u.name as unit_name FROM materials m LEFT JOIN units u ON m.unit_id = u.id WHERE m.id = ?`, [matId]);
      if (matInfo.length > 0) {
        info = { code: matInfo[0].code, name: matInfo[0].name, specification: matInfo[0].specs, specs: matInfo[0].specs, unit: matInfo[0].unit_name };
      } else {
        info = { code: 'N/A', name: `未知物料ID: ${matId}`, specification: '', specs: '', unit: '' };
      }
    }

    const stock = originalStockMap.get(matId) || { stockQuantity: 0, availableQuantity: 0 };
    const trace = materialTraceMap.get(matId) || {
      minLevel: req.level || 1,
      paths: [],
      parentMaterialIds: new Set(),
      sourceBomIds: new Set(),
      isLeaf: true
    };
    const bomPaths = trace.paths.length > 0 ? trace.paths : [info.code].filter(Boolean);

    const plannedQuantity = Number(req.requiredQuantity) || 0;
    const issueQuantity = Number(req.issueQuantity) || 0;
    const shortageQuantity = Number(req.shortageQuantity) || 0;
    const grossRequiredQuantity = Number(req.grossRequiredQuantity) || plannedQuantity;

    // 只挑选要求数量严格大于零的数据汇入生产清单
    if (plannedQuantity > 0) {
      materials.push({
        materialId: matId,
        code: info.code,
        name: info.name,
        specification: info.specification,
        specs: info.specs,
        unit: info.unit,
        requiredQuantity: plannedQuantity,
        plannedQuantity,
        issueQuantity,
        shortageQuantity,
        grossRequiredQuantity,
        level: trace.minLevel || req.level,
        bomPath: bomPaths.join(' | '),
        bomPaths,
        parentMaterialId: [...trace.parentMaterialIds][0] || null,
        sourceBomIds: [...trace.sourceBomIds],
        isLeaf: trace.isLeaf,
        stockQuantity: stock.stockQuantity,
        availableQuantity: stock.availableQuantity
      });
    }
  }

  return materials;
}

/**
 * 计算并插入物料需求 (生产计划控制器调用)
 */
async function calculateAndInsertMaterials(connection, planId, productId, quantity, providedBomId = null) {
  try {
    let bomId = providedBomId;
    let bomVersion = '';

    if (!bomId) {
      const preferredBom = await BomExplosionService.getPreferredBom(productId, connection);
      if (!preferredBom) {
         throw new Error(`请先在基础数据中配置该产品的BOM`);
      }
      bomId = preferredBom.id;
      bomVersion = preferredBom.version;
    } else {
      const [bomMasters] = await connection.query(
        `SELECT version FROM bom_masters WHERE id = ? AND deleted_at IS NULL`,
        [bomId]
      );
      if (bomMasters.length > 0) bomVersion = bomMasters[0].version;
    }

    // 调用最强净需求 MRP 物料推演
    const materialRequirements = await calculateMaterialRequirementsWithStock(productId, bomId, quantity, planId);

    const [planMaterialColumns] = await connection.query(
      `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'production_plan_materials'
      `
    );
    const columnSet = new Set(planMaterialColumns.map((column) => column.COLUMN_NAME));
    const hasClosedLoopColumns =
      columnSet.has('gross_required_quantity') &&
      columnSet.has('issue_quantity') &&
      columnSet.has('shortage_quantity');

    // 回写落盘到生产计划明细要求表
    for (const mat of materialRequirements) {
      if (hasClosedLoopColumns) {
        await connection.query(
          `INSERT INTO production_plan_materials
          (plan_id, material_id, gross_required_quantity, required_quantity,
           issue_quantity, shortage_quantity, stock_quantity, level)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            planId,
            mat.materialId,
            mat.grossRequiredQuantity || mat.requiredQuantity,
            mat.requiredQuantity,
            mat.issueQuantity || 0,
            mat.shortageQuantity || 0,
            mat.stockQuantity,
            mat.level || 1,
          ]
        );
      } else {
        await connection.query(
          `INSERT INTO production_plan_materials
          (plan_id, material_id, required_quantity, stock_quantity, level)
          VALUES (?, ?, ?, ?, ?)`,
          [planId, mat.materialId, mat.requiredQuantity, mat.stockQuantity, mat.level || 1]
        );
      }
    }

    logger.info(`净推演算料完毕: planId=${planId}, 生成真实需发料记录 ${materialRequirements.length} 条 (采用bomId=${bomId})`);

    return { bomId, bomVersion };
  } catch (error) {
    logger.error('计算净物料需求发生异常:', error);
    throw error;
  }
}

module.exports = {
  calculateMaterialRequirementsWithStock,
  calculateAndInsertMaterials
};
