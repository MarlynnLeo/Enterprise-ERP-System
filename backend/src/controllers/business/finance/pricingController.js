const { getConnection } = require('../../../config/db');
const { ResponseHandler } = require('../../../utils/responseHandler');
const logger = require('../../../utils/logger');
const { AuditService, AuditAction, AuditModule } = require('../../../services/AuditService');

// 获取产品定价列表
exports.getPricingList = async (req, res) => {
  let connection;
  try {
    const { page = 1, pageSize = 20, search, filterType } = req.query;
    const offset = (page - 1) * pageSize;

    connection = await getConnection();

    let whereClause = '1=1';
    const params = [];
    let applyFilterLater = false; // 成本变动在后端排序后处理

    if (search) {
      whereClause += ' AND (m.name LIKE ? OR m.code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // 筛选条件
    // low_margin 筛选已移至前端实现（使用用户自定义阈值）
    if (filterType === 'no_pricing') {
      whereClause += ' AND pp.id IS NULL';
    } else if (filterType === 'cost_variance') {
      applyFilterLater = true; // 成本变动需要计算后筛选
    }

    // 查询当前有效定价
    const query = `
      SELECT 
        pp.id,
        m.id as product_id,
        m.code as product_code,
        m.name as product_name,
        m.specs as product_specs,
        pp.cost_price,
        COALESCE(pp.suggested_price, m.price) as suggested_price,
        pp.profit_margin,
        pp.effective_date,
        pp.created_at,
        u.username as created_by_name
      FROM materials m
      LEFT JOIN product_pricing pp ON m.id = pp.product_id AND pp.is_active = 1
      LEFT JOIN users u ON pp.created_by = u.id
      WHERE ${whereClause}
      ORDER BY 
        CASE WHEN pp.id IS NOT NULL THEN 0 ELSE 1 END ASC,
        m.code ASC
      LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}
    `;

    // 统计总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM materials m
      LEFT JOIN product_pricing pp ON m.id = pp.product_id AND pp.is_active = 1
      WHERE ${whereClause}
    `;

    const [rows] = await connection.query(query, params);
    const [countResult] = await connection.query(countQuery, params);

    // 批量获取所有产品的BOM成本（优化N+1查询）
    const productIds = rows.map((r) => r.product_id);
    const bomCostMap = await calculateBomCostsInBatch(connection, productIds);

    // 批量获取所有定价记录的策略字段(优化N+1查询)
    const pricingIds = rows.filter((r) => r.id).map((r) => r.id);
    const strategiesMap = new Map();

    if (pricingIds.length > 0) {
      const placeholders = pricingIds.map(() => '?').join(',');
      const [allStrategies] = await connection.query(
        `
                SELECT 
                    pps.pricing_id,
                    pps.field_value,
                    psf.field_name,
                    psf.field_label,
                    psf.field_type,
                    psf.unit
                FROM product_pricing_strategies pps
                JOIN pricing_strategy_fields psf ON pps.field_id = psf.id
                WHERE pps.pricing_id IN (${placeholders})
                ORDER BY psf.sort_order ASC
            `,
        pricingIds
      );

      // 按pricing_id分组
      for (const strategy of allStrategies) {
        if (!strategiesMap.has(strategy.pricing_id)) {
          strategiesMap.set(strategy.pricing_id, []);
        }
        strategiesMap.get(strategy.pricing_id).push({
          field_name: strategy.field_name,
          field_label: strategy.field_label,
          field_type: strategy.field_type,
          field_value: strategy.field_value,
          unit: strategy.unit,
        });
      }
    }

    // 为每行添加BOM成本信息和策略字段
    const enrichedRows = rows.map((row) => {
      const latestBomCost = bomCostMap.get(row.product_id) || 0;
      const savedCost = parseFloat(row.cost_price) || 0;
      const hasStoredCost = savedCost > 0;

      // 计算成本变动百分比
      let costVariancePercent = 0;
      if (hasStoredCost && latestBomCost > 0) {
        costVariancePercent = Math.abs(((latestBomCost - savedCost) / savedCost) * 100);
      }

      // 计算成本变动标志（初步判断是否有成本差异）
      // 前端会根据用户自定义阈值重新判断是否显示警告图标
      const costVarianceFlag =
        latestBomCost > 0 && ((hasStoredCost && costVariancePercent > 0) || !hasStoredCost);

      return {
        ...row,
        cost_price: hasStoredCost ? row.cost_price : latestBomCost,
        latest_bom_cost: latestBomCost,
        cost_variance_flag: costVarianceFlag,
        cost_variance_percent: parseFloat(costVariancePercent.toFixed(2)), // 返回百分比给前端
        strategies: strategiesMap.get(row.id) || [], // 添加策略字段
      };
    });

    // 成本变动筛选（如果需要）
    let finalRows = enrichedRows;
    if (applyFilterLater && filterType === 'cost_variance') {
      finalRows = enrichedRows.filter((row) => row.cost_variance_flag);
    }

    // 排序：成本变动的排在前面
    finalRows.sort((a, b) => {
      if (a.cost_variance_flag && !b.cost_variance_flag) return -1;
      if (!a.cost_variance_flag && b.cost_variance_flag) return 1;
      return 0;
    });

    ResponseHandler.success(res, {
      list: finalRows,
      total: applyFilterLater ? finalRows.length : parseInt(countResult[0].total),
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    });
  } catch (error) {
    logger.error('获取产品定价列表失败:', error);
    const message = error.code === 'ECONNREFUSED' ? '数据库连接失败' : '获取产品定价列表失败';
    ResponseHandler.error(res, message);
  } finally {
    if (connection) connection.release();
  }
};

// 获取单个产品定价详情
exports.getPricingDetail = async (req, res) => {
  let connection;
  try {
    const { productId } = req.params;

    // 参数验证
    if (!productId || isNaN(parseInt(productId))) {
      return ResponseHandler.error(res, '无效的产品ID', 'BAD_REQUEST', 400);
    }

    connection = await getConnection();

    // 1. 获取产品基本信息
    const [products] = await connection.query('SELECT * FROM materials WHERE id = ?', [productId]);
    if (products.length === 0) {
      return ResponseHandler.error(res, '产品不存在', 'NOT_FOUND', 404);
    }
    const product = products[0];

    // 2. 获取当前有效定价
    const [pricing] = await connection.query(
      `
            SELECT 
                pp.*, 
                u.username as created_by_name,
                COALESCE(pp.suggested_price, m.price) as suggested_price
            FROM product_pricing pp
            LEFT JOIN users u ON pp.created_by = u.id
            JOIN materials m ON pp.product_id = m.id
            WHERE pp.product_id = ? AND pp.is_active = 1
        `,
      [productId]
    );

    let currentPricing = pricing[0];
    let strategies = [];

    // 如果有定价记录,获取关联的策略字段
    if (currentPricing) {
      const [strategyData] = await connection.query(
        `
                SELECT 
                    pps.field_id,
                    pps.field_value,
                    psf.field_name,
                    psf.field_label,
                    psf.field_type,
                    psf.unit
                FROM product_pricing_strategies pps
                JOIN pricing_strategy_fields psf ON pps.field_id = psf.id
                WHERE pps.pricing_id = ?
                ORDER BY psf.sort_order ASC
            `,
        [currentPricing.id]
      );
      strategies = strategyData;
    } else {
      // 如果没有定价记录，构建一个包含默认建议售价的对象
      currentPricing = {
        suggested_price: product.price || 0,
        cost_price: 0,
        profit_margin: 0,
        remarks: '',
        is_new: true, // 标记为新定价
      };
    }

    // 3. 计算最新成本（优先BOM成本，无BOM则使用物料采购价格）
    const costResult = await calculateProductCost(connection, productId);

    ResponseHandler.success(res, {
      product,
      currentPricing,
      strategies,
      latestBomCost: costResult.cost,
      costType: costResult.costType, // 'bom' 或 'purchase'
      costTypeText: costResult.costType === 'bom' ? 'BOM成本' : '采购成本',
    });
  } catch (error) {
    logger.error('获取产品定价详情失败:', error);
    ResponseHandler.error(res, '获取产品定价详情失败');
  } finally {
    if (connection) connection.release();
  }
};

// 批量计算BOM成本（优化的批量查询）
async function calculateBomCostsInBatch(connection, productIds) {
  const costMap = new Map();

  if (!productIds || productIds.length === 0) {
    return costMap;
  }

  // 获取所有产品的有效BOM（优先已审核的）
  const placeholders = productIds.map(() => '?').join(',');
  const [boms] = await connection.query(
    `
        SELECT bm.id, bm.product_id
        FROM bom_masters bm
        INNER JOIN (
            SELECT product_id, MAX(CASE WHEN approved_by IS NOT NULL THEN 1 ELSE 0 END) as has_approved,
                   MAX(version) as max_version
            FROM bom_masters 
            WHERE product_id IN (${placeholders}) AND status IN (0, 1)
            GROUP BY product_id
        ) latest ON bm.product_id = latest.product_id
        WHERE bm.product_id IN (${placeholders}) AND bm.status IN (0, 1)
        ORDER BY bm.product_id, CASE WHEN bm.approved_by IS NOT NULL THEN 0 ELSE 1 END, bm.version DESC
    `,
    [...productIds, ...productIds]
  );

  // 取每个产品的第一个BOM（已按优先级排序）
  const bomMap = new Map();
  for (const bom of boms) {
    if (!bomMap.has(bom.product_id)) {
      bomMap.set(bom.product_id, bom.id);
    }
  }

  if (bomMap.size === 0) {
    return costMap;
  }

  // 批量获取所有BOM的明细和成本
  const bomIds = Array.from(bomMap.values());
  const bomPlaceholders = bomIds.map(() => '?').join(',');
  const [details] = await connection.query(
    `
        SELECT 
            bd.bom_id,
            SUM(COALESCE(bd.quantity, 0) * COALESCE(
                (SELECT sc.standard_price FROM standard_costs sc 
                 WHERE sc.material_id = m.id AND sc.is_active = 1 
                 AND sc.effective_date <= CURDATE()
                 AND (sc.expiry_date IS NULL OR sc.expiry_date > CURDATE())
                 ORDER BY sc.effective_date DESC LIMIT 1),
                m.cost_price,
                m.price,
                0
            )) as total_cost
        FROM bom_details bd
        JOIN materials m ON bd.material_id = m.id
        WHERE bd.bom_id IN (${bomPlaceholders})
        GROUP BY bd.bom_id
    `,
    bomIds
  );

  // 构建bom_id到成本的映射
  const bomCostMap = new Map();
  for (const detail of details) {
    bomCostMap.set(detail.bom_id, parseFloat(detail.total_cost) || 0);
  }

  // 映射回产品ID
  for (const [productId, bomId] of bomMap) {
    const cost = bomCostMap.get(bomId) || 0;
    costMap.set(productId, parseFloat(cost.toFixed(2)));
  }

  return costMap;
}

// 计算单个BOM成本（内部函数）
// 优化：接收bomId参数避免重复查询，材料价格优先使用冻结标准成本
async function calculateBomCostInternal(connection, productId, bomId = null) {
  // 如果没传bomId，则查询
  if (!bomId) {
    const [boms] = await connection.query(
      'SELECT id FROM bom_masters WHERE product_id = ? AND status IN (0, 1) AND deleted_at IS NULL ORDER BY CASE WHEN approved_by IS NOT NULL THEN 0 ELSE 1 END ASC, version DESC LIMIT 1',
      [productId]
    );
    if (boms.length === 0) return 0;
    bomId = boms[0].id;
  }

  // 获取BOM明细及物料价格（优先使用冻结的标准成本）
  // 优化：增加生效日期检查 effective_date <= CURDATE()
  const [details] = await connection.query(
    `
        SELECT 
            bd.quantity,
            COALESCE(
                (SELECT sc.standard_price FROM standard_costs sc 
                 WHERE sc.material_id = m.id AND sc.is_active = 1 
                 AND sc.effective_date <= CURDATE()
                 AND (sc.expiry_date IS NULL OR sc.expiry_date > CURDATE())
                 ORDER BY sc.effective_date DESC LIMIT 1),
                m.cost_price,
                m.price
            ) as unit_price
        FROM bom_details bd
        JOIN materials m ON bd.material_id = m.id
        WHERE bd.bom_id = ?
    `,
    [bomId]
  );

  // 计算总成本
  let totalCost = 0;
  for (const item of details) {
    totalCost += (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
  }

  return parseFloat(totalCost.toFixed(2));
}

// 计算产品成本（BOM成本或采购成本）
// 优先级: standard_costs表 > 实时BOM成本 > standard_costs/采购成本
async function calculateProductCost(connection, productId) {
  // 1. 优先检查是否有冻结的产品标准成本
  // 优化：增加生效日期检查
  const [frozenCost] = await connection.query(
    `
        SELECT unit_cost, effective_date 
        FROM standard_costs 
        WHERE product_id = ? AND is_active = 1 
        AND effective_date <= CURDATE()
        ORDER BY effective_date DESC 
        LIMIT 1
    `,
    [productId]
  );

  if (frozenCost.length > 0 && parseFloat(frozenCost[0].unit_cost) > 0) {
    return {
      cost: parseFloat(frozenCost[0].unit_cost),
      costType: 'frozen_standard',
      hasBom: true,
      source: '冻结标准成本',
    };
  }

  // 2. 检查是否有BOM（优化：查询一次后传递bomId）
  const [boms] = await connection.query(
    'SELECT id FROM bom_masters WHERE product_id = ? AND status IN (0, 1) AND deleted_at IS NULL ORDER BY CASE WHEN approved_by IS NOT NULL THEN 0 ELSE 1 END ASC, version DESC LIMIT 1',
    [productId]
  );

  // 有BOM的产品，传递bomId避免重复查询
  if (boms.length > 0) {
    const bomCost = await calculateBomCostInternal(connection, productId, boms[0].id);
    return { cost: bomCost, costType: 'bom', hasBom: true, source: 'BOM计算' };
  }

  // 3. 无BOM时，优化：也读取standard_costs表的冻结价格
  const [materials] = await connection.query(
    `
        SELECT 
            COALESCE(
                (SELECT sc.standard_price FROM standard_costs sc 
                 WHERE sc.material_id = m.id AND sc.is_active = 1 
                 AND sc.effective_date <= CURDATE()
                 AND (sc.expiry_date IS NULL OR sc.expiry_date > CURDATE())
                 ORDER BY sc.effective_date DESC LIMIT 1),
                m.cost_price,
                m.price
            ) as final_cost
        FROM materials m
        WHERE m.id = ?
    `,
    [productId]
  );

  if (materials.length > 0 && materials[0].final_cost) {
    return {
      cost: parseFloat(parseFloat(materials[0].final_cost).toFixed(2)),
      costType: 'purchase',
      hasBom: false,
      source: '采购/冻结成本',
    };
  }

  return { cost: 0, costType: 'none', hasBom: false, source: '无成本数据' };
}

// 计算成本API (供前端随时调用查看最新成本)
exports.calculateBomCost = async (req, res) => {
  let connection;
  try {
    const { productId } = req.params;
    connection = await getConnection();
    // 使用统一的成本计算函数（BOM成本或采购成本）
    const costResult = await calculateProductCost(connection, productId);
    ResponseHandler.success(res, {
      cost: costResult.cost,
      costType: costResult.costType,
      costTypeText: costResult.costType === 'bom' ? 'BOM成本' : '采购成本',
    });
  } catch (error) {
    logger.error('计算成本失败:', error);
    ResponseHandler.error(res, '计算成本失败');
  } finally {
    if (connection) connection.release();
  }
};

// 价格验证规则
const validatePricing = (cost, price, margin) => {
  const costNum = parseFloat(cost) || 0;
  const priceNum = parseFloat(price) || 0;
  const marginNum = parseFloat(margin) || 0;

  // 售价不能低于成本
  if (priceNum < costNum) {
    throw new Error('售价不能低于成本价');
  }

  // 利润率合理范围检查
  if (marginNum < -100 || marginNum > 1000) {
    throw new Error('利润率超出合理范围（-100% ~ 1000%）');
  }

  // 低利润率预警
  if (marginNum < 10 && marginNum >= 0) {
    return { valid: true, warning: '⚠️ 低利润率预警：当前利润率低于10%，请确认' };
  }

  return { valid: true };
};

// 创建/更新产品定价
exports.createPricing = async (req, res) => {
  let connection;
  try {
    const {
      product_id,
      cost_price,
      suggested_price,
      profit_margin,
      remarks,
      effective_date,
      strategies,
    } = req.body;

    if (!product_id) {
      return ResponseHandler.error(res, '产品ID不能为空', 'BAD_REQUEST', 400);
    }

    // 价格验证
    try {
      const validation = validatePricing(cost_price, suggested_price, profit_margin);
      if (validation.warning) {
        logger.warn(validation.warning);
      }
    } catch (validationError) {
      return ResponseHandler.error(res, validationError.message, 'BAD_REQUEST', 400);
    }

    connection = await getConnection();
    await connection.beginTransaction();

    // 1. 将旧的定价标记为inactive
    await connection.query(
      'UPDATE product_pricing SET is_active = 0 WHERE product_id = ? AND is_active = 1',
      [product_id]
    );

    // 2. 获取当前版本号
    const [versions] = await connection.query(
      'SELECT MAX(version) as max_ver FROM product_pricing WHERE product_id = ?',
      [product_id]
    );
    const newVersion = (versions[0].max_ver || 0) + 1;

    // 3. 插入新定价
    const [pricingResult] = await connection.query(
      `INSERT INTO product_pricing 
       (product_id, cost_price, suggested_price, profit_margin, version, is_active, effective_date, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product_id,
        cost_price,
        suggested_price,
        profit_margin,
        newVersion,
        1,
        effective_date || new Date(),
        remarks,
        req.user ? req.user.id : null,
      ]
    );

    const newPricingId = pricingResult.insertId;

    // 4. 保存策略字段值(如果有)
    if (strategies && Array.isArray(strategies) && strategies.length > 0) {
      const strategyValues = strategies.map((s) => [newPricingId, s.field_id, s.field_value]);
      await connection.query(
        'INSERT INTO product_pricing_strategies (pricing_id, field_id, field_value) VALUES ?',
        [strategyValues]
      );
    }

    // 5. 同步更新物料基础表中的价格
    await connection.query('UPDATE materials SET price = ? WHERE id = ?', [
      suggested_price,
      product_id,
    ]);

    await connection.commit();

    // 6. 记录审计日志
    await AuditService.logFromRequest(
      req,
      AuditModule.PRICING,
      AuditAction.UPDATE,
      'product_pricing',
      String(product_id),
      null,
      {
        cost_price,
        suggested_price,
        profit_margin,
        effective_date,
        strategies_count: strategies ? strategies.length : 0,
      }
    );

    ResponseHandler.success(res, null, '定价更新成功');
  } catch (error) {
    if (connection) await connection.rollback();
    logger.error('更新产品定价失败:', error);
    ResponseHandler.error(res, '更新产品定价失败');
  } finally {
    if (connection) connection.release();
  }
};

// 获取定价历史
exports.getPricingHistory = async (req, res) => {
  let connection;
  try {
    const { productId } = req.params;
    connection = await getConnection();

    const [history] = await connection.query(
      `
      SELECT 
        pp.*,
        u.username as created_by_name
      FROM product_pricing pp
      LEFT JOIN users u ON pp.created_by = u.id
      WHERE pp.product_id = ?
      ORDER BY pp.version DESC
    `,
      [productId]
    );

    // 为每条历史记录获取关联的策略字段
    for (const record of history) {
      const [strategies] = await connection.query(
        `
                SELECT 
                    pps.field_value,
                    psf.field_name,
                    psf.field_label,
                    psf.field_type,
                    psf.unit
                FROM product_pricing_strategies pps
                JOIN pricing_strategy_fields psf ON pps.field_id = psf.id
                WHERE pps.pricing_id = ?
                ORDER BY psf.sort_order ASC
            `,
        [record.id]
      );
      record.strategies = strategies;
    }

    ResponseHandler.success(res, history);
  } catch (error) {
    logger.error('获取定价历史失败:', error);
    ResponseHandler.error(res, '获取定价历史失败');
  } finally {
    if (connection) connection.release();
  }
};

// 获取产品BOM明细（含价格变动标识）
exports.getBomDetails = async (req, res) => {
  let connection;
  try {
    const { productId } = req.params;
    connection = await getConnection();

    // 1. 查找产品的有效BOM（优先使用已审核的）
    const [boms] = await connection.query(
      'SELECT id, version, status, approved_by FROM bom_masters WHERE product_id = ? AND status IN (0, 1) AND deleted_at IS NULL ORDER BY CASE WHEN approved_by IS NOT NULL THEN 0 ELSE 1 END ASC, status DESC, version DESC LIMIT 1',
      [productId]
    );

    if (boms.length === 0) {
      return ResponseHandler.success(res, {
        hasBom: false,
        bom: null,
        details: [],
        totalCost: 0,
      });
    }

    const bom = boms[0];

    // 2. 获取BOM明细及物料信息
    const [details] = await connection.query(
      `
            SELECT 
                bd.id,
                bd.material_id,
                bd.quantity,
                m.code as material_code,
                m.name as material_name,
                m.specs as material_specs,
                m.price as current_price,
                m.cost_price as purchase_price
            FROM bom_details bd
            JOIN materials m ON bd.material_id = m.id
            WHERE bd.bom_id = ?
            ORDER BY bd.id ASC
        `,
      [bom.id]
    );

    // 3. 获取所有物料的价格调整(当前生效的)
    const materialIds = details.map((d) => d.material_id);
    const adjustmentsMap = new Map();

    if (materialIds.length > 0) {
      const placeholders = materialIds.map(() => '?').join(',');
      const [adjustments] = await connection.query(
        `
                SELECT material_id, original_price, adjusted_price, adjustment_reason, version
                FROM bom_material_price_adjustments
                WHERE product_id = ? AND material_id IN (${placeholders}) AND is_active = 1
            `,
        [productId, ...materialIds]
      );

      for (const adj of adjustments) {
        adjustmentsMap.set(adj.material_id, adj);
      }
    }

    // 4. 获取上次定价时保存的BOM成本（如有）
    const [lastPricing] = await connection.query(
      'SELECT cost_price, created_at FROM product_pricing WHERE product_id = ? AND is_active = 1',
      [productId]
    );
    const lastSavedCost = lastPricing[0]?.cost_price || 0;
    const lastPricingDate = lastPricing[0]?.created_at;

    // 5. 计算当前总成本并标记价格变动,包含价格调整
    let totalCost = 0;
    const enrichedDetails = details.map((item) => {
      const qty = parseFloat(item.quantity) || 0;
      const originalPrice = parseFloat(item.current_price) || 0;

      // 检查是否有价格调整
      const adjustment = adjustmentsMap.get(item.material_id);
      const hasAdjustment = !!adjustment;
      const adjustedPrice = hasAdjustment ? parseFloat(adjustment.adjusted_price) : null;

      // 使用调整后的价格计算,如果没有调整则使用原价
      const effectivePrice = hasAdjustment ? adjustedPrice : originalPrice;
      const subtotal = qty * effectivePrice;
      totalCost += subtotal;

      return {
        ...item,
        bom_id: bom.id,
        original_price: originalPrice,
        adjusted_price: adjustedPrice,
        effective_price: effectivePrice,
        has_adjustment: hasAdjustment,
        adjustment_reason: adjustment?.adjustment_reason || null,
        adjustment_version: adjustment?.version || null,
        subtotal: parseFloat(subtotal.toFixed(2)),
        // 如果当前价格与采购价格不同，标记为价格已变动
        price_changed:
          item.purchase_price && Math.abs(originalPrice - parseFloat(item.purchase_price)) > 0.01,
      };
    });

    // 6. 计算成本变动
    const costVariance = totalCost - parseFloat(lastSavedCost);

    ResponseHandler.success(res, {
      hasBom: true,
      bom: {
        id: bom.id,
        version: bom.version,
        status: bom.status,
        approved: bom.approved_by !== null,
        statusText: bom.approved_by !== null ? '已审核' : '未审核',
      },
      details: enrichedDetails,
      totalCost: parseFloat(totalCost.toFixed(2)),
      lastSavedCost: parseFloat(lastSavedCost),
      costVariance: parseFloat(costVariance.toFixed(2)),
      lastPricingDate,
    });
  } catch (error) {
    logger.error('获取BOM明细失败:', error);
    ResponseHandler.error(res, '获取BOM明细失败');
  } finally {
    if (connection) connection.release();
  }
};

// 获取用户定价设置
exports.getPricingSettings = async (req, res) => {
  let connection;
  try {
    const userId = req.user ? req.user.id : null;
    if (!userId) {
      // 如果没有用户上下文，返回默认设置
      return ResponseHandler.success(res, {});
    }

    connection = await getConnection();

    // 表结构由 migrations/20260312000009_baseline_misc_tables.js 管理

    const [rows] = await connection.query(
      'SELECT settings_json FROM user_pricing_settings WHERE user_id = ?',
      [userId]
    );

    let settings = {};
    if (rows.length > 0) {
      // MySQL JSON类型自动解析，或者如果是字符串则解析
      settings =
        typeof rows[0].settings_json === 'string'
          ? JSON.parse(rows[0].settings_json)
          : rows[0].settings_json;
    }

    ResponseHandler.success(res, settings);
  } catch (error) {
    logger.error('获取用户定价设置失败:', error);
    ResponseHandler.error(res, '获取设置失败');
  } finally {
    if (connection) connection.release();
  }
};

// 更新用户定价设置
exports.updatePricingSettings = async (req, res) => {
  let connection;
  try {
    const userId = req.user ? req.user.id : null;
    const settings = req.body;

    if (!userId) {
      return ResponseHandler.error(res, '未登录', 'UNAUTHORIZED', 401);
    }

    connection = await getConnection();

    // 表结构由 migrations/20260312000009_baseline_misc_tables.js 管理

    await connection.query(
      `INSERT INTO user_pricing_settings (user_id, settings_json) 
             VALUES (?, ?) 
             ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json)`,
      [userId, JSON.stringify(settings)]
    );

    ResponseHandler.success(res, null, '设置保存成功');
  } catch (error) {
    logger.error('保存用户定价设置失败:', error);
    ResponseHandler.error(res, '保存设置失败');
  } finally {
    if (connection) connection.release();
  }
};

