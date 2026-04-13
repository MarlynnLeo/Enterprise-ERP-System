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

// 状态常量
const STATUS = {
  PURCHASE: {
    PENDING: 'pending',
    APPROVED: 'approved',
    ORDERED: 'ordered',
  },
};

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
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;
    const material = req.query.material || ''; // 合并的物料搜索（物料编码、名称、规格）
    const purchaseStatus = req.query.purchaseStatus || ''; // 采购状态筛选

    // 构建搜索条件
    const searchConditions = [];
    const searchParams = [];

    // 只使用 material 参数（合并的物料搜索），忽略其他搜索参数
    if (material) {
      searchConditions.push('(m.code LIKE ? OR m.name LIKE ? OR m.specs LIKE ?)');
      searchParams.push(`%${material}%`, `%${material}%`, `%${material}%`);
    }

    // 只有当有搜索条件时才添加 WHERE 子句
    const searchWhereClause =
      searchConditions.length > 0 ? `AND ${searchConditions.join(' AND ')}` : '';

    // 根据采购状态添加筛选条件
    let purchaseStatusWhereClause = '';
    if (purchaseStatus === 'requested') {
      // 只显示已申请的
      purchaseStatusWhereClause = `
        AND EXISTS (
          SELECT 1 
          FROM purchase_requisitions pr
          INNER JOIN purchase_requisition_items pri ON pr.id = pri.requisition_id
          WHERE pri.material_id = m.id
            AND pr.remarks LIKE CONCAT('%', pp.code, '%')
            AND pr.status != 'cancelled'
            AND pr.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        )
      `;
    } else if (purchaseStatus === STATUS.PURCHASE.PENDING) {
      // 只显示待申请的
      purchaseStatusWhereClause = `
        AND NOT EXISTS (
          SELECT 1 
          FROM purchase_requisitions pr
          INNER JOIN purchase_requisition_items pri ON pr.id = pri.requisition_id
          WHERE pri.material_id = m.id
            AND pr.remarks LIKE CONCAT('%', pp.code, '%')
            AND pr.status != 'cancelled'
            AND pr.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        )
      `;
    }

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
        ppm.stock_quantity,
        (ppm.required_quantity - ppm.stock_quantity) as shortage_quantity,
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
      LEFT JOIN production_plan_materials ppm ON pp.id = ppm.plan_id
      LEFT JOIN materials m ON ppm.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      LEFT JOIN materials product ON pp.product_id = product.id
      LEFT JOIN units product_unit ON product.unit_id = product_unit.id
      WHERE pp.status IN ('${PRODUCTION_STATUS_KEYS.DRAFT}', '${PRODUCTION_STATUS_KEYS.PREPARING}', '${PRODUCTION_STATUS_KEYS.IN_PROGRESS}', '${PRODUCTION_STATUS_KEYS.MATERIAL_ISSUING}', '${PRODUCTION_STATUS_KEYS.MATERIAL_ISSUED}')
        AND ppm.stock_quantity < ppm.required_quantity
        AND ppm.material_id IS NOT NULL
        ${searchWhereClause}
        ${purchaseStatusWhereClause}
      ORDER BY pp.start_date ASC, pp.created_at DESC, shortage_quantity DESC
      LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}
    `;

    // 统计查询
    const countQuery = `
      SELECT COUNT(*) as total
      FROM production_plans pp
      LEFT JOIN production_plan_materials ppm ON pp.id = ppm.plan_id
      LEFT JOIN materials m ON ppm.material_id = m.id
      LEFT JOIN materials product ON pp.product_id = product.id
      WHERE pp.status IN ('${PRODUCTION_STATUS_KEYS.DRAFT}', '${PRODUCTION_STATUS_KEYS.PREPARING}', '${PRODUCTION_STATUS_KEYS.IN_PROGRESS}', '${PRODUCTION_STATUS_KEYS.MATERIAL_ISSUING}', '${PRODUCTION_STATUS_KEYS.MATERIAL_ISSUED}')
        AND ppm.stock_quantity < ppm.required_quantity
        AND ppm.material_id IS NOT NULL
        ${searchWhereClause}
        ${purchaseStatusWhereClause}
    `;

    // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    const [shortages] = await pool.query(query, searchParams);
    const [countResult] = await pool.query(countQuery, searchParams);
    const total = countResult[0].total;

    // 扁平化数据结构 - 每行一个物料（包含计划和产品信息）
    const result = shortages.map((item) => ({
      // 计划信息
      plan_id: item.plan_id,
      plan_code: item.plan_code,
      plan_name: item.plan_name,
      plan_status: item.plan_status,
      start_date: item.start_date,
      end_date: item.end_date,
      plan_quantity: parseFloat(item.plan_quantity) || 0,

      // 产品信息
      product_id: item.product_id,
      product_code: item.product_code,
      product_name: item.product_name,
      product_specs: item.product_specs,
      product_unit: item.product_unit,

      // 物料信息（直接在顶层，不嵌套）
      material_id: item.material_id,
      material_code: item.material_code,
      material_name: item.material_name,
      material_specs: item.material_specs,
      unit: item.material_unit, // 注意：前端使用 'unit' 而不是 'material_unit'

      // 数量信息
      required_quantity: parseFloat(item.required_quantity) || 0,
      stock_quantity: parseFloat(item.stock_quantity) || 0,
      shortage_quantity: parseFloat(item.shortage_quantity) || 0,

      // 采购状态（从查询结果中获取，而不是硬编码）
      purchase_status: item.purchase_status || 'pending',
    }));

    // 计算统计数据（基于筛选条件）
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT pp.id) as affected_plans,
        COUNT(DISTINCT ppm.material_id) as shortage_materials,
        SUM(ppm.required_quantity - ppm.stock_quantity) as total_shortage
      FROM production_plans pp
      LEFT JOIN production_plan_materials ppm ON pp.id = ppm.plan_id
      LEFT JOIN materials m ON ppm.material_id = m.id
      LEFT JOIN materials product ON pp.product_id = product.id
      WHERE pp.status IN ('draft', 'preparing', 'in_progress', 'material_issuing', 'material_issued')
        AND ppm.stock_quantity < ppm.required_quantity
        AND ppm.material_id IS NOT NULL
        ${searchWhereClause}
        ${purchaseStatusWhereClause}
    `;

    const [stats] = await pool.query(statsQuery, searchParams);

    const statistics = {
      affectedPlans: stats[0].affected_plans || 0,
      shortageMaterials: stats[0].shortage_materials || 0,
      totalShortage: parseFloat(stats[0].total_shortage || 0),
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
