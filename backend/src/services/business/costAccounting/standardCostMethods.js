/**
 * CostAccountingService — standardCost methods (mixin)
 * Attached via Object.assign so `this` resolves to CostAccountingService.
 * @module services/business/costAccounting/standardCostMethods
 */

const {
  logger,
  db,
  currentDateString,
} = require('./runtime');

module.exports = {
  /**
     * 多级BOM成本展开（递归计算半成品成本）
     * @param {number} productId 产品ID
     * @param {number} quantity 数量
     * @param {number} depth 当前递归深度
     * @param {number} maxDepth 最大递归深度（防止死循环）
     * @param {Set} visitedProducts 已访问的产品ID集合（循环检测，引用传递）
     * @returns {Object} 展开后的材料成本信息
     */
    async calculateMultiLevelBomCost(
      productId,
      quantity = 1,
      depth = 0,
      maxDepth = 20,
      visitedProducts = new Set()
    ) {
      // 循环检测
      if (visitedProducts.has(productId)) {
        logger.warn(`检测到BOM循环引用: 产品ID=${productId}`);
        return { totalCost: 0, details: [], hasCircularRef: true };
      }
  
      // 深度限制
      if (depth > maxDepth) {
        logger.warn(`BOM展开深度超过限制(${maxDepth}): 产品ID=${productId}`);
        return { totalCost: 0, details: [], depthExceeded: true };
      }
  
      visitedProducts.add(productId);
  
      try {
        // 获取产品的BOM（兼容 status 和 approved_by 两种判断方式）
        const [bomMaster] = await db.pool.execute(
          'SELECT id FROM bom_masters WHERE product_id = ? AND (status = 1 OR approved_by IS NOT NULL) AND deleted_at IS NULL LIMIT 1',
          [productId]
        );
  
        if (bomMaster.length === 0) {
          // 没有BOM，返回空
          visitedProducts.delete(productId);
          return { totalCost: 0, details: [], noBom: true };
        }
  
        const bomId = bomMaster[0].id;
  
        // 获取BOM明细，包含has_sub_bom标志
        // 价格优先级: standard_costs表 > cost_price(采购成本)
        // ✅ P-1 优化: 通过子查询一次性检测子BOM，消除 N+1 查询
        const [items] = await db.pool.execute(
          `SELECT bd.material_id, bd.quantity, bd.has_sub_bom,
                  m.code as material_code, m.name as material_name,
                  COALESCE(
                    (SELECT sc.standard_price FROM standard_costs sc
                     WHERE sc.material_id = m.id AND sc.is_active = 1
                     AND (sc.status IS NULL OR sc.status = 'active')
                     AND (sc.expiry_date IS NULL OR sc.expiry_date > CURDATE())
                     ORDER BY sc.effective_date DESC LIMIT 1),
                    m.cost_price,
                    0
                  ) as unit_price,
                  EXISTS(
                    SELECT 1 FROM bom_masters bm
                    WHERE bm.product_id = bd.material_id
                      AND (bm.status = 1 OR bm.approved_by IS NOT NULL)
                      AND bm.deleted_at IS NULL
                  ) as has_sub_bom_detected
           FROM bom_details bd
           JOIN materials m ON bd.material_id = m.id
           WHERE bd.bom_id = ?`,
          [bomId]
        );
  
        let totalCost = 0;
        const details = [];
  
        for (const item of items) {
          const itemQuantity =
            (parseFloat(item.quantity) || 0) / (parseFloat(item.base_quantity) || 1);
          const totalItemQty = itemQuantity * quantity;
  
          // 优先使用 bd.has_sub_bom 字段，回退到子查询检测结果
          const hasSubBom = (item.has_sub_bom !== undefined && item.has_sub_bom !== null)
            ? !!item.has_sub_bom
            : !!item.has_sub_bom_detected;
  
          if (hasSubBom) {
            // 递归计算子BOM成本
            // 关键修复：使用同一个 visitedProducts 引用（不再创建副本），
            // 确保所有递归分支共享循环检测状态，避免菱形依赖绕过检测
            const subResult = await this.calculateMultiLevelBomCost(
              item.material_id,
              totalItemQty,
              depth + 1,
              maxDepth,
              visitedProducts
            );
  
            const itemCost = subResult.totalCost;
            totalCost += itemCost;
  
            details.push({
              materialId: item.material_id,
              materialCode: item.material_code,
              materialName: item.material_name,
              category: item.category || '',
              quantity: totalItemQty,
              unitCost: totalItemQty > 0 ? itemCost / totalItemQty : 0,
              totalCost: itemCost,
              level: depth,
              isSubAssembly: true,
              subDetails: subResult.details,
            });
          } else {
            // 直接材料，使用单价计算
            const unitPrice = parseFloat(item.unit_price) || 0;
            const itemCost = unitPrice * totalItemQty;
            totalCost += itemCost;
  
            details.push({
              materialId: item.material_id,
              materialCode: item.material_code,
              materialName: item.material_name,
              category: item.category || '',
              quantity: totalItemQty,
              unitCost: unitPrice,
              totalCost: itemCost,
              level: depth,
              isSubAssembly: false,
            });
          }
        }
  
        visitedProducts.delete(productId);
  
        return {
          productId,
          totalCost,
          details,
          depth,
          itemCount: details.length,
        };
      } catch (error) {
        visitedProducts.delete(productId);
        logger.error(`多级BOM展开失败 (产品ID=${productId}):`, error);
        throw error;
      }
    },

  /**
     * 计算产品标准成本
     * @param {number} productId 产品ID
     * @param {number} quantity 数量
     * @param {Object} options 选项配置
     * @param {boolean} options.multiLevel 是否使用多级BOM展开（默认false）
     * @param {number} options.maxBomDepth 最大BOM展开深度（默认10）
     * @returns {Object} 标准成本信息
     */
    async calculateStandardCost(productId, quantity = 1, options = {}) {
      const { multiLevel = false, maxBomDepth = 10 } = options;
  
      try {
        // 获取成本配置
        const settings = await this.getCostSettings();
        const laborHourlyRate = settings.laborRate;
  
        // ========== 获取BOM材料成本 ==========
        let materialCost = 0;
        let materialDetails = [];
  
        if (multiLevel) {
          // 使用多级BOM展开计算
          const bomResult = await this.calculateMultiLevelBomCost(
            productId,
            quantity,
            0,
            maxBomDepth
          );
          materialCost = bomResult.totalCost;
          materialDetails = bomResult.details;
        } else {
          // 使用单级BOM计算（原有逻辑）
          let bomItems = [];
          try {
            const [bomMaster] = await db.pool.execute(
              'SELECT id FROM bom_masters WHERE product_id = ? AND status = 1 AND deleted_at IS NULL LIMIT 1',
              [productId]
            );
  
            if (bomMaster.length > 0) {
              const bomId = bomMaster[0].id;
              // 价格优先级: standard_costs表 > cost_price(采购成本)
              const [items] = await db.pool.execute(
                `SELECT bd.material_id, bd.quantity, bd.base_quantity,
                        m.code as material_code, m.name as material_name,
                        COALESCE(
                          (SELECT sc.standard_price FROM standard_costs sc
                           WHERE sc.material_id = m.id AND sc.is_active = 1
                           AND (sc.status IS NULL OR sc.status = 'active')
                           AND (sc.expiry_date IS NULL OR sc.expiry_date > CURDATE())
                           ORDER BY sc.effective_date DESC LIMIT 1),
                          m.cost_price,
                          0
                        ) as unit_price
                 FROM bom_details bd
                 JOIN materials m ON bd.material_id = m.id
                 WHERE bd.bom_id = ?`,
                [bomId]
              );
              bomItems = items;
            }
          } catch (error) {
            if (!error.message.includes("doesn't exist")) {
              logger.warn('获取BOM数据失败:', error.message);
            }
          }
  
          // 计算直接材料成本
          for (const item of bomItems) {
            const unitPrice = parseFloat(item.unit_price) || 0;
            const itemQuantity =
              (parseFloat(item.quantity) || 0) / (parseFloat(item.base_quantity) || 1);
            const itemCost = unitPrice * itemQuantity * quantity;
            materialCost += itemCost;
  
            materialDetails.push({
              materialId: item.material_id,
              materialCode: item.material_code,
              materialName: item.material_name,
              quantity: itemQuantity * quantity,
              unitCost: unitPrice,
              totalCost: itemCost,
            });
          }
        }
  
        // ========== 获取工序人工成本 ==========
        let processSteps = [];
        try {
          // 获取产品关联的工序模板明细（只取启用状态的模板）
          const [steps] = await db.pool.execute(
            `SELECT ptd.id, ptd.name as step_name, ptd.description,
                    ptd.standard_hours, ptd.department,
                    pt.name as template_name
             FROM process_templates pt
             JOIN process_template_details ptd ON pt.id = ptd.template_id
             WHERE pt.product_id = ? AND pt.status = 1 AND pt.deleted_at IS NULL
             ORDER BY ptd.order_num`,
            [productId]
          );
          processSteps = steps;
        } catch (error) {
          if (!error.message.includes("doesn't exist")) {
            logger.warn('获取工序数据失败:', error.message);
          }
        }
  
        // 计算直接人工成本
        let laborCost = 0;
        const laborDetails = [];
  
        for (const step of processSteps) {
          const standardHours = parseFloat(step.standard_hours) || 0;
          const stepLaborCost = laborHourlyRate * standardHours * quantity;
          laborCost += stepLaborCost;
  
          laborDetails.push({
            stepId: step.id,
            stepName: step.step_name,
            description: step.description || '',
            department: step.department || '',
            standardHours: standardHours * quantity,
            hourlyRate: laborHourlyRate,
            totalCost: stepLaborCost,
          });
        }
  
        // ========== 计算制造费用 ==========
        // 获取可用的分摊规则 (全局 + 该产品的专属重载)
        let allocationRules = [];
        try {
          const calcDate = currentDateString();
          const [configs] = await db.pool.execute(
            `SELECT id, name, allocation_base, rate, cost_center_id, product_id, product_category, effective_date, expiry_date, priority, is_active, created_at, updated_at, deleted_at FROM overhead_allocation_config
              WHERE is_active = 1
                AND effective_date <= ?
                AND (expiry_date IS NULL OR expiry_date >= ?)
                AND (product_id = ? OR product_id IS NULL)
              ORDER BY priority DESC, effective_date DESC`,
            [calcDate, calcDate, productId]
          );
  
          // 去重逻辑：按 name 为基准，优先使用 product_id 特化的配置
          const rulesMap = new Map();
          for (const config of configs) {
            if (!rulesMap.has(config.name)) {
              rulesMap.set(config.name, config);
            } else {
              const existing = rulesMap.get(config.name);
              if (config.product_id === productId && existing.product_id !== productId) {
                rulesMap.set(config.name, config);
              }
            }
          }
          allocationRules = Array.from(rulesMap.values());
        } catch (err) {
          logger.warn('获取制造费用分摊规则失败:', err.message);
        }
  
        let overheadCost = 0;
        const overheadDetails = {
          rules: [],
          totalCost: 0,
        };
  
        if (allocationRules.length > 0) {
          for (const rule of allocationRules) {
            let ruleCost = 0;
            let baseValue = 0;
  
            // 确定分摊基础与量级
            if (rule.allocation_base === 'labor_cost') {
              baseValue = laborCost;
            } else if (rule.allocation_base === 'material_cost') {
              baseValue = materialCost;
            } else if (rule.allocation_base === 'quantity') {
              baseValue = quantity;
            } else if (rule.allocation_base === 'labor_hours') {
              baseValue = laborDetails.reduce((sum, step) => sum + (step.standardHours || 0), 0);
            } else {
              // Fallback
              baseValue = laborCost;
            }
  
            ruleCost = baseValue * parseFloat(rule.rate || 0);
  
            overheadCost += ruleCost;
            overheadDetails.rules.push({
              name: rule.name,
              allocation_base: rule.allocation_base,
              rate: rule.rate,
              cost: ruleCost,
              base: baseValue,
            });
          }
        }
  
        overheadDetails.totalCost = overheadCost;
  
        // ========== 计算总成本 ==========
        const totalStandardCost = materialCost + laborCost + overheadCost;
  
        return {
          productId,
          quantity,
          standardCost: {
            materialCost,
            laborCost,
            overheadCost,
            totalCost: totalStandardCost,
            unitCost: quantity > 0 ? totalStandardCost / quantity : 0,
          },
          details: {
            materials: materialDetails,
            labor: laborDetails,
            overhead: overheadDetails,
          },
          settings: {
            laborHourlyRate,
          },
        };
      } catch (error) {
        logger.error('计算标准成本失败:', error);
        throw error;
      }
    },

  /**
     * 获取物料的单位成本（根据指定方法）
     * @param {Object} connection 数据库连接
     * @param {number} materialId 物料ID
     * @param {string} method 成本计算方法
     * @param {Date} asOfDate 截止日期
     * @returns {number} 单位成本
     */
    async getMaterialUnitCost(connection, materialId) {
      // 注意：由于系统的库存台账 inventory_ledger 仅记录数量不记录金额，
      // 且 inventory_transactions 表不存在，FIFO/LIFO/加权平均无法使用。
      // 统一使用标准成本或物料主数据价格作为单位成本。
      try {
        return await this.getStandardMaterialCost(connection, materialId);
      } catch (error) {
        logger.error(`获取物料 ${materialId} 单位成本失败:`, error);
        return 0;
      }
    },

  /**
     * 获取标准物料成本 (严格版本)
     * @param {Object} connection 数据库连接
     * @param {number} materialId 物料ID
     * @returns {number} 标准单位成本
     */
    async getStandardMaterialCost(connection, materialId) {
      try {
        const [standardCosts] = await connection.execute(
          `SELECT standard_price FROM standard_costs
           WHERE material_id = ? AND status = 'active'
           AND (expiry_date IS NULL OR expiry_date > CURDATE())
           ORDER BY effective_date DESC LIMIT 1`,
          [materialId]
        );
  
        if (standardCosts.length > 0) {
          return parseFloat(standardCosts[0].standard_price);
        }
  
        const [materialRows] = await connection.execute(
          'SELECT cost_price FROM materials WHERE id = ? AND deleted_at IS NULL LIMIT 1',
          [materialId]
        );
  
        const materialCostPrice = parseFloat(materialRows[0]?.cost_price) || 0;
        if (materialCostPrice > 0) {
          return materialCostPrice;
        }
  
        // 如果没有活跃版本的标准成本，不要抛出异常卡死车间工序报工。
        // 返回 0 让主流程先过去，方便月底财务根据这笔 0 元入账反查并核算实际制造成本。
        logger.warn(`物料 ID:${materialId} 未配置生效版本的标准成本。下发成本: 0`);
        return 0;
      } catch (error) {
        logger.error(`获取物料 ${materialId} 标准成本失败:`, error.message);
        // 遇到纯粹查数据库失败才退回 0
        return 0;
      }
    },

  /**
     * 批量获取多个物料的标准成本（消除 N+1 查询）
     * @param {Object} connection 数据库连接
     * @param {number[]} materialIds 物料ID数组
     * @returns {Object} materialId → standardPrice 的映射
     */
    async getBatchStandardMaterialCosts(connection, materialIds) {
      const costMap = {};
      if (!materialIds || materialIds.length === 0) return costMap;
  
      try {
        // 使用子查询取每个物料最新生效的标准成本
        const placeholders = materialIds.map(() => '?').join(',');
        const [rows] = await connection.execute(
          `SELECT sc.material_id, sc.standard_price
           FROM standard_costs sc
           INNER JOIN (
             SELECT material_id, MAX(effective_date) as max_date
             FROM standard_costs
             WHERE material_id IN (${placeholders})
               AND status = 'active'
               AND (expiry_date IS NULL OR expiry_date > CURDATE())
             GROUP BY material_id
           ) latest ON sc.material_id = latest.material_id AND sc.effective_date = latest.max_date
           WHERE sc.status = 'active'
             AND (sc.expiry_date IS NULL OR sc.expiry_date > CURDATE())`,
          materialIds
        );
  
        for (const row of rows) {
          costMap[row.material_id] = parseFloat(row.standard_price) || 0;
        }
  
        const missingIds = materialIds.filter((id) => costMap[id] === undefined);
        if (missingIds.length > 0) {
          const materialPlaceholders = missingIds.map(() => '?').join(',');
          const [materialRows] = await connection.execute(
            `SELECT id, cost_price
             FROM materials
             WHERE id IN (${materialPlaceholders})
               AND COALESCE(cost_price, 0) > 0`,
            missingIds
          );
  
          for (const row of materialRows) {
            costMap[row.id] = parseFloat(row.cost_price) || 0;
          }
        }
  
        // 对未找到标准成本的物料赋值 0 并记录警告
        for (const id of materialIds) {
          if (costMap[id] === undefined) {
            costMap[id] = 0;
            logger.warn(`物料 ID:${id} 未配置生效版本的标准成本。下发成本: 0`);
          }
        }
      } catch (error) {
        logger.error('批量获取标准成本失败:', error.message);
        for (const id of materialIds) {
          costMap[id] = 0;
        }
      }
  
      return costMap;
    },

  /**
     * 确保获取标准成本（包含兜底策略）
     * 策略: 查表 -> 动态计算 -> 价格拆分
     * @param {number} productId 产品ID
     * @param {number} quantity 数量
     * @returns {Object} 标准成本对象 { materialCost, laborCost, overheadCost, totalCost }
     */
    async ensureStandardCost(productId, quantity = 1) {
      const defaultResult = {
        materialCost: 0,
        laborCost: 0,
        overheadCost: 0,
        totalCost: 0,
      };
  
      if (!productId) return defaultResult;
  
      try {
        // 1. 优先从 standard_costs 表获取
        const [psc] = await db.pool.execute(
          `SELECT
             SUM(CASE WHEN cost_element = 'material' THEN standard_price ELSE 0 END) as material_cost,
             SUM(CASE WHEN cost_element = 'labor' THEN standard_price ELSE 0 END) as labor_cost,
             SUM(CASE WHEN cost_element = 'overhead' THEN standard_price ELSE 0 END) as overhead_cost,
             SUM(standard_price) as total_cost
           FROM standard_costs
           WHERE product_id = ? AND is_active = 1
             AND (status IS NULL OR status = 'active')`,
          [productId]
        );
  
        if (psc.length > 0 && psc[0].total_cost > 0) {
          return {
            materialCost: (parseFloat(psc[0].material_cost) || 0) * quantity,
            laborCost: (parseFloat(psc[0].labor_cost) || 0) * quantity,
            overheadCost: (parseFloat(psc[0].overhead_cost) || 0) * quantity,
            totalCost: (parseFloat(psc[0].total_cost) || 0) * quantity,
          };
        }
  
        // 2. 如果表里没有，尝试动态计算
        const stdResult = await this.calculateStandardCost(productId, 1);
        if (stdResult && stdResult.standardCost && stdResult.standardCost.totalCost > 0) {
          return {
            materialCost: (stdResult.standardCost.materialCost || 0) * quantity,
            laborCost: (stdResult.standardCost.laborCost || 0) * quantity,
            overheadCost: (stdResult.standardCost.overheadCost || 0) * quantity,
            totalCost: (stdResult.standardCost.totalCost || 0) * quantity,
          };
        }
  
        // 3. 最后策略：按成本设置中的配置比例拆分产品价格估算各要素
        const costSettings = await this.getCostSettings();
        const materialRatio = costSettings.fallbackMaterialRatio;
        const laborRatio = costSettings.fallbackLaborRatio;
        const overheadRatio = costSettings.fallbackOverheadRatio;
  
        const [product] = await db.pool.execute('SELECT price FROM materials WHERE id = ? AND deleted_at IS NULL', [
          productId,
        ]);
        if (product.length > 0 && product[0].price > 0) {
          const price = parseFloat(product[0].price);
          return {
            materialCost: price * materialRatio * quantity,
            laborCost: price * laborRatio * quantity,
            overheadCost: price * overheadRatio * quantity,
            totalCost: price * quantity,
          };
        }
  
        return defaultResult;
      } catch (error) {
        logger.warn(
          `[CostAccountingService] 确保标准成本失败 (Product ${productId}): ${error.message}`
        );
        return defaultResult;
      }
    },
};
