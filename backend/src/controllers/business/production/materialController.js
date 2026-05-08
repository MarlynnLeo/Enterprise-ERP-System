/**
 * materialController.js
 * @description 物料需求计算和BOM相关控制器
 * @date 2025-10-16
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { pool } = require('../../../config/db');
const { handleError } = require('./shared/errorHandler');
const {
  calculateMaterialRequirementsWithStock,
} = require('../../../services/business/MaterialCalculationService');
const { PRODUCTION_STATUS_KEYS } = require('../../../constants/systemConstants');

// 采购状态常量
const PURCHASE_PENDING = 'pending';

/**
 * 计算物料需求（支持智能物料替代）- POST方法
 */
exports.calculateMaterials = async (req, res) => {
  try {
    const { productId, bomId, quantity } = req.body;

    if (!productId || !quantity) {
      return ResponseHandler.error(res, '产品ID和数量是必需的', 'BAD_REQUEST', 400);
    }

    // 不检查status，只检查BOM是否存在（可以使用未启用但已审核的BOM）
    const [bomCheck] = await pool.query(
      `
      SELECT bm.id, bm.product_id, bm.version, bm.status, bm.approved_by
      FROM bom_masters bm
      WHERE bm.id = ?
    `,
      [bomId]
    );

    if (bomCheck.length === 0) {
      return ResponseHandler.error(res, '未找到有效的BOM', 'NOT_FOUND', 404);
    }

    const materials = await calculateMaterialRequirementsWithStock(productId, bomId, quantity, null);

    ResponseHandler.success(res, materials);
  } catch (error) {
    logger.error('计算物料需求失败:', error);
    handleError(res, error);
  }
};

/**
 * 计算物料需求（通过BOM ID）- GET方法
 */
exports.calculateMaterialsByBomId = async (req, res) => {
  try {
    const { bomId } = req.params;
    const { quantity } = req.query;

    if (!bomId) {
      return ResponseHandler.error(res, 'BOM ID是必需的', 'BAD_REQUEST', 400);
    }

    if (!quantity || isNaN(quantity) || parseFloat(quantity) <= 0) {
      return ResponseHandler.error(res, '数量必须是大于0的有效数字', 'BAD_REQUEST', 400);
    }

    // 不检查status，只检查BOM是否存在（可以使用未启用但已审核的BOM）
    const [bomCheck] = await pool.query(
      `
      SELECT bm.id, bm.product_id, bm.version, bm.status, bm.approved_by
      FROM bom_masters bm
      WHERE bm.id = ?
    `,
      [bomId]
    );

    if (bomCheck.length === 0) {
      return ResponseHandler.error(res, '未找到有效的BOM', 'NOT_FOUND', 404);
    }

    const materials = await calculateMaterialRequirementsWithStock(bomCheck[0].product_id, bomId, parseFloat(quantity), null);

    ResponseHandler.success(res, { materials });
  } catch (error) {
    logger.error('计算物料需求失败:', error);
    handleError(res, error);
  }
};

/**
 * 获取产品BOM信息
 */
exports.getBomByProductId = async (req, res) => {
  try {
    const { productId } = req.params;

    // 不检查status，优先选择已审核的BOM
    const [bomMasters] = await pool.query(
      `
      SELECT bm.*, m.name as product_name, m.code as product_code
      FROM bom_masters bm
      LEFT JOIN materials m ON bm.product_id = m.id
      WHERE bm.product_id = ?
      ORDER BY
        CASE WHEN bm.approved_by IS NOT NULL THEN 0 ELSE 1 END,
        bm.created_at DESC
      LIMIT 1
    `,
      [productId]
    );

    if (bomMasters.length === 0) {
      return ResponseHandler.error(res, '未找到该产品的BOM配置', 'NOT_FOUND', 404);
    }

    const bom = bomMasters[0];

    const [bomDetails] = await pool.query(
      `
      SELECT
        bd.*,
        m.code as material_code,
        m.name as material_name,
        m.specs as specification,
        u.name as unit
      FROM bom_details bd
      LEFT JOIN materials m ON bd.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      WHERE bd.bom_id = ?
      ORDER BY bd.level ASC, bd.id ASC
    `,
      [bom.id]
    );

    ResponseHandler.success(res, {
      ...bom,
      details: bomDetails,
    });
  } catch (error) {
    logger.error('获取BOM信息失败:', error);
    handleError(res, error);
  }
};

/**
 * 获取缺料统计汇总
 */
exports.getMaterialShortageSummary = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 100);
    const offset = (page - 1) * pageSize;
    const material = req.query.material || ''; // 合并的物料搜索（物料编码、名称、规格）
    const purchaseStatus = req.query.purchaseStatus || ''; // 采购状态筛选

    const searchConditions = [];
    const searchParams = [];
    if (material) {
      searchConditions.push('(m.code LIKE ? OR m.name LIKE ? OR m.specs LIKE ?)');
      searchParams.push(`%${material}%`, `%${material}%`, `%${material}%`);
    }

    const searchWhereClause =
      searchConditions.length > 0 ? `AND ${searchConditions.join(' AND ')}` : '';

    const activeStatuses = [
      PRODUCTION_STATUS_KEYS.DRAFT,
      PRODUCTION_STATUS_KEYS.ALLOCATED,
      PRODUCTION_STATUS_KEYS.PREPARING,
      PRODUCTION_STATUS_KEYS.MATERIAL_ISSUING,
      PRODUCTION_STATUS_KEYS.MATERIAL_ISSUED,
      PRODUCTION_STATUS_KEYS.IN_PROGRESS,
    ];

    const query = `
      SELECT
        pp.id as plan_id,
        pp.code as plan_code,
        pp.name as plan_name,
        pp.contract_code,
        pp.status as plan_status,
        pp.start_date,
        pp.end_date,
        pp.quantity as plan_quantity,
        pp.product_id,
        product.code as product_code,
        product.name as product_name,
        product.specs as product_specs,
        product_unit.name as product_unit,
        m.id as material_id,
        m.code as material_code,
        m.name as material_name,
        m.specs as material_specs,
        u.name as material_unit,
        ppm.required_quantity,
        COALESCE(inv.stock_quantity, 0) as current_stock_quantity,
        CASE 
          WHEN EXISTS (
            SELECT 1 
            FROM purchase_requisitions pr
            INNER JOIN purchase_requisition_items pri ON pr.id = pri.requisition_id
            WHERE pri.material_id = m.id
              AND pr.remarks LIKE CONCAT('%', pp.code, '%')
              AND pr.status != 'cancelled'
              AND pr.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          ) THEN 'requested'
          ELSE 'pending'
        END as purchase_status
      FROM production_plans pp
      INNER JOIN production_plan_materials ppm ON pp.id = ppm.plan_id
      INNER JOIN materials m ON ppm.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      LEFT JOIN materials product ON pp.product_id = product.id
      LEFT JOIN units product_unit ON product.unit_id = product_unit.id
      LEFT JOIN (
        SELECT il.material_id, SUM(il.quantity) as stock_quantity
        FROM inventory_ledger il
        JOIN materials mat ON il.material_id = mat.id
        WHERE mat.location_id IS NULL OR il.location_id = mat.location_id
        GROUP BY il.material_id
      ) inv ON inv.material_id = ppm.material_id
      WHERE pp.status IN (?)
        AND pp.deleted_at IS NULL
        AND ppm.material_id IS NOT NULL
        AND ppm.required_quantity > 0
        ${searchWhereClause}
      ORDER BY m.id ASC, pp.start_date ASC, pp.created_at ASC, pp.id ASC
    `;

    const [rows] = await pool.query(query, [activeStatuses, ...searchParams]);
    const stockCursor = new Map();
    const calculatedRows = [];

    for (const item of rows) {
      const materialId = item.material_id;
      if (!stockCursor.has(materialId)) {
        stockCursor.set(materialId, parseFloat(item.current_stock_quantity) || 0);
      }

      const requiredQuantity = parseFloat(item.required_quantity) || 0;
      const remainingStock = stockCursor.get(materialId) || 0;
      const allocatedStock = Math.min(requiredQuantity, Math.max(remainingStock, 0));
      const shortageQuantity = Math.max(requiredQuantity - allocatedStock, 0);

      stockCursor.set(materialId, remainingStock - allocatedStock);
      if (shortageQuantity <= 0) continue;

      const row = {
        plan_id: item.plan_id,
        plan_code: item.plan_code,
        plan_name: item.plan_name,
        contract_code: item.contract_code,
        plan_status: item.plan_status,
        start_date: item.start_date,
        end_date: item.end_date,
        plan_quantity: parseFloat(item.plan_quantity) || 0,

        product_id: item.product_id,
        product_code: item.product_code,
        product_name: item.product_name,
        product_specs: item.product_specs,
        product_unit: item.product_unit,

        material_id: materialId,
        material_code: item.material_code,
        material_name: item.material_name,
        material_specs: item.material_specs,
        unit: item.material_unit,

        required_quantity: requiredQuantity,
        stock_quantity: allocatedStock,
        current_stock_quantity: parseFloat(item.current_stock_quantity) || 0,
        shortage_quantity: shortageQuantity,

        purchase_status: item.purchase_status || PURCHASE_PENDING,
      };

      if (purchaseStatus && row.purchase_status !== purchaseStatus) continue;
      calculatedRows.push(row);
    }

    calculatedRows.sort((a, b) => {
      const dateA = a.start_date ? new Date(a.start_date).getTime() : Number.MAX_SAFE_INTEGER;
      const dateB = b.start_date ? new Date(b.start_date).getTime() : Number.MAX_SAFE_INTEGER;
      if (dateA !== dateB) return dateA - dateB;
      return b.shortage_quantity - a.shortage_quantity;
    });

    const total = calculatedRows.length;
    const result = calculatedRows.slice(offset, offset + pageSize);

    const statistics = {
      affectedPlans: new Set(calculatedRows.map((item) => item.plan_id)).size,
      shortageMaterials: new Set(calculatedRows.map((item) => item.material_id)).size,
      totalShortage: calculatedRows.reduce((sum, item) => sum + item.shortage_quantity, 0),
    };

    ResponseHandler.success(res, {
      list: result,
      total,
      page,
      pageSize,
      statistics,
    }, '查询成功');
  } catch (error) {
    logger.error('获取缺料统计失败:', error);
    handleError(res, error);
  }
};
