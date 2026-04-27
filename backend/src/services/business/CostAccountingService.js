/**
 * CostAccountingService.js
 * @description 服务层文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');
const BusinessError = require('../../utils/BusinessError');
const globalConfigManager = require('../../config/globalConfig');

/**
 * 成本核算服务
 * 处理产品成本核算、标准成本、实际成本计算和成本差异分析
 */
const GLService = require('../finance/GLService');
const Precision = require('../../utils/precision');
class CostAccountingService {
  /**
   * 成本核算方法枚举
   */
  static COSTING_METHOD = {
    FIFO: 'fifo', // 先进先出
    LIFO: 'lifo', // 后进先出
    WEIGHTED_AVERAGE: 'weighted_average', // 加权平均
    STANDARD: 'standard', // 标准成本
  };

  /**
   * 成本要素枚举
   */
  static COST_ELEMENT = {
    MATERIAL: 'material', // 直接材料
    LABOR: 'labor', // 直接人工
    OVERHEAD: 'overhead', // 制造费用
  };

  /**
   * 多级BOM成本展开（递归计算半成品成本）
   * @param {number} productId 产品ID
   * @param {number} quantity 数量
   * @param {number} depth 当前递归深度
   * @param {number} maxDepth 最大递归深度（防止死循环）
   * @param {Set} visitedProducts 已访问的产品ID集合（循环检测，引用传递）
   * @returns {Object} 展开后的材料成本信息
   */
  static async calculateMultiLevelBomCost(
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
      // 价格优先级: standard_costs表 > cost_price(采购成本) > price(销售价格)
      const [items] = await db.pool.execute(
        `SELECT bd.material_id, bd.quantity, bd.has_sub_bom,
                m.code as material_code, m.name as material_name, 
                COALESCE(
                  (SELECT sc.standard_price FROM standard_costs sc 
                   WHERE sc.material_id = m.id AND sc.is_active = 1 
                   AND (sc.expiry_date IS NULL OR sc.expiry_date > CURDATE())
                   ORDER BY sc.effective_date DESC LIMIT 1),
                  m.cost_price,
                  m.price
                ) as unit_price
         FROM bom_details bd
         JOIN materials m ON bd.material_id = m.id
         WHERE bd.bom_id = ?`,
        [bomId]
      );

      let totalCost = 0;
      const details = [];

      for (const item of items) {
        const itemQuantity = parseFloat(item.quantity) || 0;
        const totalItemQty = itemQuantity * quantity;

        // 检查是否有子BOM（半成品）
        let hasSubBom = item.has_sub_bom;
        if (hasSubBom === undefined || hasSubBom === null) {
          // 动态检查是否有子BOM
          const [subBom] = await db.pool.execute(
            'SELECT id FROM bom_masters WHERE product_id = ? AND (status = 1 OR approved_by IS NOT NULL) AND deleted_at IS NULL LIMIT 1',
            [item.material_id]
          );
          hasSubBom = subBom.length > 0;
        }

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
  }

  /**
   * 计算产品标准成本
   * @param {number} productId 产品ID
   * @param {number} quantity 数量
   * @param {Object} options 选项配置
   * @param {boolean} options.multiLevel 是否使用多级BOM展开（默认false）
   * @param {number} options.maxBomDepth 最大BOM展开深度（默认10）
   * @returns {Object} 标准成本信息
   */
  static async calculateStandardCost(productId, quantity = 1, options = {}) {
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
            // 价格优先级: standard_costs表 > cost_price(采购成本) > price(销售价格)
            const [items] = await db.pool.execute(
              `SELECT bd.material_id, bd.quantity, 
                      m.code as material_code, m.name as material_name, 
                      COALESCE(
                        (SELECT sc.standard_price FROM standard_costs sc 
                         WHERE sc.material_id = m.id AND sc.is_active = 1 
                         AND (sc.expiry_date IS NULL OR sc.expiry_date > CURDATE())
                         ORDER BY sc.effective_date DESC LIMIT 1),
                        m.cost_price,
                        m.price
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
          const itemQuantity = parseFloat(item.quantity) || 0;
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
        const calcDate = new Date().toISOString().split('T')[0];
        const [configs] = await db.pool.execute(
          `SELECT * FROM overhead_allocation_config
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
  }

  /**
   * 计算产品实际成本
   * @param {number} productionOrderId 生产订单ID
   * @returns {Object} 实际成本信息
   */
  static async calculateActualCost(productionOrderId, externalConn = null) {
    const isExternalConn = !!externalConn;
    const connection = externalConn || await db.pool.getConnection();
    try {
      if (!isExternalConn) await connection.beginTransaction();

      // 获取生产任务信息
      const [orderInfo] = await connection.execute('SELECT * FROM production_tasks WHERE id = ?', [
        productionOrderId,
      ]);

      if (orderInfo.length === 0) {
        throw new Error('生产任务不存在');
      }

      const order = orderInfo[0];
      const completionDate = order.completed_at || new Date(); // 使用完工日期作为记账日期

      // 检查期间是否开启 (GL Check) - 修正错误的调法
      const periodId = await GLService.getPeriodIdByDate(completionDate);
      if (!periodId) {
        throw new Error('未找到该完工日期对应的开放会计期间');
      }

      // 计算实际材料成本
      const materialCost = await this.calculateActualMaterialCost(connection, productionOrderId);

      // 计算实际人工成本
      const laborCost = await this.calculateActualLaborCost(connection, productionOrderId);

      // 计算实际制造费用
      const overheadCost = await this.calculateActualOverheadCost(
        connection,
        productionOrderId,
        laborCost.totalCost,
        materialCost.totalCost,
        order.quantity
      );

      const totalActualCost = materialCost.totalCost + laborCost.totalCost + overheadCost.totalCost;

      // 保存实际成本记录
      const [costResult] = await connection.execute(
        `INSERT INTO actual_costs (
          production_order_id, product_id, quantity,
          material_cost, labor_cost, overhead_cost, total_cost,
          calculated_at, calculated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 'system')
        ON DUPLICATE KEY UPDATE
          material_cost = VALUES(material_cost),
          labor_cost = VALUES(labor_cost),
          overhead_cost = VALUES(overhead_cost),
          total_cost = VALUES(total_cost),
          calculated_at = NOW()`,
        [
          productionOrderId,
          order.product_id,
          order.quantity,
          materialCost.totalCost,
          laborCost.totalCost,
          overheadCost.totalCost,
          totalActualCost,
        ]
      );

      // ===== 回写成本到 production_tasks 表 =====
      await connection.execute(
        `UPDATE production_tasks 
         SET actual_cost = ?, material_cost = ?, labor_cost = ?, overhead_cost = ?
         WHERE id = ?`,
        [
          totalActualCost,
          materialCost.totalCost,
          laborCost.totalCost,
          overheadCost.totalCost,
          productionOrderId,
        ]
      );
      logger.info(`生产任务 ${productionOrderId} 成本已回写: 总计=${totalActualCost}, 材料=${materialCost.totalCost}, 人工=${laborCost.totalCost}, 制造费用=${overheadCost.totalCost}`);

      // ========== 计算并保存成本差异 (Cost Variance) ==========
      try {
        const stdCostResult = await this.ensureStandardCost(order.product_id, order.quantity);
        if (stdCostResult && stdCostResult.totalCost > 0) {
          const standardMaterialCost = stdCostResult.materialCost || 0;
          const standardLaborCost = stdCostResult.laborCost || 0;
          const standardOverheadCost = stdCostResult.overheadCost || 0;
          const standardTotalCost = stdCostResult.totalCost || 0;
          
          const materialVariance = standardMaterialCost - materialCost.totalCost;
          const laborVariance = standardLaborCost - laborCost.totalCost;
          const overheadVariance = standardOverheadCost - overheadCost.totalCost;
          const totalVariance = standardTotalCost - totalActualCost;
          const varianceRate = standardTotalCost > 0 ? (totalVariance / standardTotalCost) * 100 : 0;
          const isFavorable = totalVariance >= 0 ? 1 : 0;
          
          await connection.execute(
            `INSERT INTO cost_variance_records (
              task_id, product_id, quantity, 
              standard_material_cost, standard_labor_cost, standard_overhead_cost, standard_total_cost,
              actual_material_cost, actual_labor_cost, actual_overhead_cost, actual_total_cost,
              material_variance, labor_variance, overhead_variance, total_variance,
              variance_rate, is_favorable, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
              standard_material_cost = VALUES(standard_material_cost),
              standard_labor_cost = VALUES(standard_labor_cost),
              standard_overhead_cost = VALUES(standard_overhead_cost),
              standard_total_cost = VALUES(standard_total_cost),
              actual_material_cost = VALUES(actual_material_cost),
              actual_labor_cost = VALUES(actual_labor_cost),
              actual_overhead_cost = VALUES(actual_overhead_cost),
              actual_total_cost = VALUES(actual_total_cost),
              material_variance = VALUES(material_variance),
              labor_variance = VALUES(labor_variance),
              overhead_variance = VALUES(overhead_variance),
              total_variance = VALUES(total_variance),
              variance_rate = VALUES(variance_rate),
              is_favorable = VALUES(is_favorable)`,
            [
              productionOrderId, order.product_id, order.quantity,
              standardMaterialCost, standardLaborCost, standardOverheadCost, standardTotalCost,
              materialCost.totalCost, laborCost.totalCost, overheadCost.totalCost, totalActualCost,
              materialVariance, laborVariance, overheadVariance, totalVariance,
              varianceRate, isFavorable
            ]
          );
          logger.info(`生产任务 ${productionOrderId} 成本差异记录已保存: 标准=${standardTotalCost}, 实际=${totalActualCost}, 差异=${totalVariance}`);
        }
      } catch (varianceErr) {
        logger.warn(`生产任务 ${productionOrderId} 计算/保存成本差异失败: ${varianceErr.message}`);
        // 差异保存失败不应该阻断主核算流程
      }

      // ========== GL Integration (生成凭证) ==========

      // 幂等性校验：检查是否已经生成过该任务的完工入库凭证
      const [existingEntries] = await connection.execute(
        `SELECT id FROM gl_entries 
         WHERE transaction_type = 'PRODUCTION_COMPLETE' 
         AND transaction_id = ? LIMIT 1`,
        [productionOrderId]
      );

      if (existingEntries && existingEntries.length > 0) {
        logger.info(`生产任务 ${productionOrderId} 的完工总账凭证已存在，跳过重复生成以防复数记账`);
        if (!isExternalConn) await connection.commit();
        if (!isExternalConn) connection.release(); // 提前返回前必须释放连接
        return {
          productionOrderId,
          productId: order.product_id,
          quantity: order.quantity,
          actualCost: {
            materialCost: materialCost.totalCost,
            laborCost: laborCost.totalCost,
            overheadCost: overheadCost.totalCost,
            totalCost: totalActualCost,
            unitCost: totalActualCost / order.quantity,
          },
          details: {
            materials: materialCost.details,
            labor: laborCost.details,
            overhead: overheadCost.details,
          },
          duplicateSkipped: true, // 标识由于等幂性已跳过发凭证
        };
      }

      // 1. 获取所有需要的科目映射 (纯净的 SSOT 节点提取，杜绝防呆字面量)
      const config = globalConfigManager.getConfig();
      const accountCodes = [
        config.accounting.accounts.INVENTORY_GOODS,  // 库存商品 (借)
        config.accounting.accounts.PRODUCTION_COST,  // 生产成本/在制品 (借/贷)
        config.accounting.accounts.RAW_MATERIALS,    // 原材料 (贷)
        config.accounting.accounts.EMPLOYEE_PAYABLE, // 应付职工薪酬 (贷)
        config.accounting.accounts.MANUFACTURING_EXPENSE, // 制造费用-转出 (贷)
      ];

      const accounts = await GLService.getAccountIds(accountCodes);
      const accFG = accounts['1405'];
      const accWIP = accounts['5001'];
      const accRaw = accounts['1403'];
      const accWages = accounts['2211'];
      const accOverhead = accounts['5101'];

      // 检查关键科目 (WIP和FG是必须的)
      if (accFG && accWIP) {
        try {
          const baseEntryData = {
              period_id: periodId,
              entry_date: completionDate,
              document_type: '生产成本结转',
              document_number: order.code,
              transaction_id: productionOrderId,
              created_by: 'system',
              voucher_word: '转'
          };

          // --- 凭证 1: 生产领料 (借: 生产成本 / 贷: 原材料) ---
          if (accRaw && materialCost.totalCost > 0) {
            await GLService.createEntry(
              { ...baseEntryData, description: `生产领料结转: ${order.code}`, transaction_type: 'PRODUCTION_MATERIAL' },
              [
                { account_id: accWIP, debit_amount: materialCost.totalCost, credit_amount: 0, description: `生产领料: ${order.code}` },
                { account_id: accRaw, debit_amount: 0, credit_amount: materialCost.totalCost, description: `生产领料出库: ${order.code}` }
              ],
              connection
            );
          }

          // --- 凭证 2: 直接人工 (借: 生产成本 / 贷: 应付职工薪酬) ---
          if (accWages && laborCost.totalCost > 0) {
             await GLService.createEntry(
              { ...baseEntryData, description: `分配生产人工: ${order.code}`, transaction_type: 'PRODUCTION_LABOR' },
              [
                { account_id: accWIP, debit_amount: laborCost.totalCost, credit_amount: 0, description: `分配生产人工: ${order.code}` },
                { account_id: accWages, debit_amount: 0, credit_amount: laborCost.totalCost, description: `计提生产人工: ${order.code}` }
              ],
              connection
            );
          }

          // --- 凭证 3: 制造费用 (借: 生产成本 / 贷: 制造费用转出) ---
          if (accOverhead && overheadCost.totalCost > 0) {
            await GLService.createEntry(
              { ...baseEntryData, description: `分配制造费用: ${order.code}`, transaction_type: 'PRODUCTION_OVERHEAD' },
              [
                { account_id: accWIP, debit_amount: overheadCost.totalCost, credit_amount: 0, description: `分配制造费用: ${order.code}` },
                { account_id: accOverhead, debit_amount: 0, credit_amount: overheadCost.totalCost, description: `制造费用结转: ${order.code}` }
              ],
              connection
            );
          }

          // --- 凭证 4: 完工入库 (借: 库存商品 / 贷: 生产成本) ---
          await GLService.createEntry(
            { ...baseEntryData, description: `生产完工入库: ${order.code}`, transaction_type: 'PRODUCTION_COMPLETE' },
            [
              { account_id: accFG, debit_amount: totalActualCost, credit_amount: 0, description: `生产完工入库: ${order.code}` },
              { account_id: accWIP, debit_amount: 0, credit_amount: totalActualCost, description: `结转生产成本: ${order.code}` }
            ],
            connection
          );
        } catch (glError) {
          logger.error(`GL Entry Creation Failed for Order ${productionOrderId}:`, glError);
          // 财务合规要求一致性: 必须回滚
          throw glError;
        }
      } else {
        logger.warn(`未配置GL标准化科目映射 (4001 或 1405 缺失)，跳过生成凭证: Order ${productionOrderId}`);
        // 可以选择在这里抛出异常，强制要求配置
      }

      if (!isExternalConn) await connection.commit();

      return {
        productionOrderId,
        productId: order.product_id,
        quantity: order.quantity,
        actualCost: {
          materialCost: materialCost.totalCost,
          laborCost: laborCost.totalCost,
          overheadCost: overheadCost.totalCost,
          totalCost: totalActualCost,
          unitCost: totalActualCost / order.quantity,
        },
        details: {
          materials: materialCost.details,
          labor: laborCost.details,
          overhead: overheadCost.details,
        },
      };
    } catch (error) {
      if (connection && !isExternalConn) {
         try { await connection.rollback(); } catch(rbErr) { logger.error('Rollback failed:', rbErr); }
      }
      logger.error('计算实际成本产生全局异常:', error);
      throw error;
    } finally {
      if (connection && !isExternalConn) connection.release();
    }
  }

  /**
   * 计算实际材料成本
   * @param {Object} connection 数据库连接
   * @param {number} productionOrderId 生产订单ID
   * @param {string} method 成本计算方法
   * @returns {Object} 材料成本信息
   */
  static async calculateActualMaterialCost(
    connection,
    productionOrderId,
    method = this.COSTING_METHOD.WEIGHTED_AVERAGE
  ) {
    // 获取材料领用记录（原 material_issues，现对应 inventory_outbound+items）
    const [materialIssues] = await connection.execute(
      `SELECT
              ioi.id, ioi.material_id, ioi.quantity, io.created_at as issue_date,
              m.name as material_name, m.code as material_code, m.product_category_id as category,
              it.transaction_type, it.batch_number,
              0 as unit_cost
       FROM inventory_outbound io
       JOIN inventory_outbound_items ioi ON ioi.outbound_id = io.id
       JOIN materials m ON ioi.material_id = m.id
       LEFT JOIN inventory_ledger it ON it.reference_no = io.outbound_no
                                    AND it.material_id = ioi.material_id
                                    AND it.transaction_type IN ('production_outbound', 'material_issue')
       WHERE io.reference_type = 'production_task'
         AND (io.reference_id = ? OR io.production_task_id = ?)
         AND io.status = 'completed'
       ORDER BY io.created_at, ioi.id`,
      [productionOrderId, productionOrderId]
    );

    let totalCost = 0;
    const details = [];
    const costVariances = [];

    // ✅ 性能优化: 批量预取所有物料的标准成本，消除 N+1 查询
    const uniqueMaterialIds = [...new Set(materialIssues.map(i => i.material_id))];
    const standardCostMap = await this.getBatchStandardMaterialCosts(connection, uniqueMaterialIds);

    for (const issue of materialIssues) {
      // 根据成本计算方法获取更准确的单位成本
      let actualUnitCost = issue.unit_cost || 0;

      if (method !== this.COSTING_METHOD.STANDARD && issue.material_id) {
        try {
          actualUnitCost = await this.getMaterialUnitCost(
            connection,
            issue.material_id,
            method,
            issue.issue_date
          );
        } catch (error) {
          logger.warn(`获取物料 ${issue.material_id} 的实际成本失败，回溯至标准成本:`, error.message);
          // ✅ 使用预取的标准成本映射，不再单独查询
          const stdCost = standardCostMap[issue.material_id];
          if (stdCost === undefined) {
             throw new BusinessError(
               `物料 ${issue.material_code} 的出库计价获取失败：既无实际成本记录也未维护标准成本。请先前往物料库完善基础财务定价，确保出库账务精准无误。`,
               { route: '/basedata/materials', buttonText: '前往物料字典修复' }
             );
          }
          actualUnitCost = stdCost;
        }
      }

      const itemCost = issue.quantity * actualUnitCost;
      totalCost += itemCost;

      // ✅ 使用预取的标准成本映射，不再单独查询
      const standardUnitCost = standardCostMap[issue.material_id] || 0;
      const costVariance = (actualUnitCost - standardUnitCost) * issue.quantity;

      if (Math.abs(costVariance) > 0.01) {
        // 差异超过0.01元才记录
        costVariances.push({
          materialId: issue.material_id,
          materialCode: issue.material_code,
          materialName: issue.material_name,
          quantity: issue.quantity,
          standardUnitCost,
          actualUnitCost,
          variance: costVariance,
          variancePercent:
            standardUnitCost > 0 ? (costVariance / (standardUnitCost * issue.quantity)) * 100 : 0,
        });
      }

      details.push({
        materialId: issue.material_id,
        materialName: issue.material_name,
        materialCode: issue.material_code,
        category: issue.category,
        quantity: issue.quantity,
        unitCost: actualUnitCost,
        standardUnitCost,
        totalCost: itemCost,
        issueDate: issue.issue_date,
        batchNumber: issue.batch_number,
        costMethod: method,
        variance: costVariance,
      });
    }

    return {
      totalCost,
      details,
      costVariances,
      method,
      calculationDate: new Date(),
      totalVariance: costVariances.reduce((sum, v) => sum + v.variance, 0),
    };
  }

  /**
   * 计算实际人工成本
   * @param {Object} connection 数据库连接
   * @param {number} productionOrderId 生产订单ID
   * @returns {Object} 人工成本信息
   */
  static async calculateActualLaborCost(connection, productionOrderId) {
    // 获取报工记录中的工时，代替废弃的 labor_records
    const [laborRecords] = await connection.execute(
      `SELECT pr.id, pr.operator_name as employee_name, pr.process_name as workstation_name, 
              pr.work_hours as hours_worked, pr.report_time as work_date
       FROM production_reports pr
       WHERE pr.task_id = ?`,
      [productionOrderId]
    );

    // SSOT 强校验：如果未找到该生产任务的报工工时记录，拒绝使用 0 元人工费进行妥协记账，直接抛异常倒逼前端补充报工。
    if (laborRecords.length === 0) {
      throw new BusinessError(
        `无法核算人工成本：生产订单 ${productionOrderId} 缺少必须的报工及工时耗用记录，请先执行流转定额报工。`,
        { route: '/production/tasks', buttonText: '返回单据查勘报工' } // 或指向特定的报工维护页
      );
    }

    // 严格从全局 SSOT 获取费率，去除防御性补偿代码
    const defaultHourlyRate = globalConfigManager.getConfig().cost.laborRate;

    let totalCost = 0;
    const details = [];

    for (const record of laborRecords) {
      const hoursWorked = parseFloat(record.hours_worked) || 0;
      // 报工记录中没有费率，使用默认配置的人工作业费率
      const recordCost = hoursWorked * defaultHourlyRate;
      totalCost += recordCost;

      details.push({
        employeeId: record.id, // 用报工ID代替
        employeeName: record.employee_name,
        workstationName: record.workstation_name || '未指定工序',
        hoursWorked: hoursWorked,
        hourlyRate: defaultHourlyRate,
        totalCost: recordCost,
        workDate: record.work_date,
      });
    }

    return {
      totalCost,
      details,
    };
  }

  /**
   * 计算实际制造费用（支持多分摊基础）
   * @param {Object} connection 数据库连接
   * @param {number} productionOrderId 生产订单ID
   * @param {number} laborCost 人工成本
   * @param {number} materialCost 材料成本
   * @param {number} quantity 数量
   * @param {Object} options 额外选项
   * @param {number} options.costCenterId 成本中心ID
   * @param {number} options.laborHours 人工工时
   * @param {number} options.machineHours 机器工时
   * @param {string} options.productCategory 产品类别
   * @returns {Object} 制造费用信息
   */
  static async calculateActualOverheadCost(
    connection,
    productionOrderId,
    laborCost,
    materialCost = 0,
    quantity = 0,
    options = {}
  ) {
    try {
      const OverheadAllocationService = require('./OverheadAllocationService');

      // 获取任务的成本中心和产品ID
      let costCenterId = options.costCenterId;
      let productId = options.productId;
      let laborHours = options.laborHours || 0;

      if (productionOrderId) {
        const [taskInfo] = await connection.execute(
          'SELECT cost_center_id, product_id FROM production_tasks WHERE id = ?',
          [productionOrderId]
        );
        if (taskInfo.length > 0) {
          if (!costCenterId && taskInfo[0].cost_center_id) {
            costCenterId = taskInfo[0].cost_center_id;
          }
          if (!productId && taskInfo[0].product_id) {
            productId = taskInfo[0].product_id;
          }
        }
      }

      // 获取工时信息：从报工表 production_reports 抓取实际工时
      if (!laborHours && productionOrderId) {
        const [hoursInfo] = await connection.execute(
          'SELECT COALESCE(SUM(work_hours), 0) as total_hours FROM production_reports WHERE task_id = ?',
          [productionOrderId]
        );
        if (hoursInfo.length > 0) {
          laborHours = parseFloat(hoursInfo[0].total_hours) || 0;
        }
      }

      // 使用新的分摊服务计算制造费用
      const result = await OverheadAllocationService.calculateOverhead({
        costCenterId,
        productId,
        laborCost,
        laborHours,
        machineHours: options.machineHours || 0,
        quantity,
        materialCost,
        productCategory: options.productCategory,
        date: new Date().toISOString().split('T')[0],
      });

      return {
        totalCost: result.overhead,
        details: {
          allocation_base: result.allocation_base,
          rate: result.rate,
          config_name: result.config_name,
          calculatedCost: result.overhead,
          rules: [
            {
              name: result.config_name,
              cost: result.overhead,
              base: result.allocation_base,
              ruleValue: result.rate,
            },
          ],
        },
      };
    } catch (error) {
      // SSOT 原则：严禁通过魔法数字对缺陷主数据进行补偿估算
      logger.error('[CostAccounting] 制造费用分摊服务调用异常，抛出错误交还上层处理', error);
      throw new BusinessError(
        `制造费用核算阻断: ${error.message}，请进入财务管理配置适用的分摊参数`,
        { route: '/finance/cost/overhead', buttonText: '去配置制造费分摊' }
      );
    }
  }

  /**
   * 成本差异分析
   * @param {number} productionOrderId 生产订单ID
   * @returns {Object} 差异分析结果
   */
  static async analyzeCostVariance(productionOrderId) {
    try {
      // 获取生产任务信息
      const [orderInfo] = await db.pool.execute('SELECT * FROM production_tasks WHERE id = ?', [
        productionOrderId,
      ]);

      if (orderInfo.length === 0) {
        throw new Error('生产任务不存在');
      }

      const order = orderInfo[0];

      // 计算标准成本
      const standardCost = await this.calculateStandardCost(order.product_id, order.quantity);

      // 获取实际成本
      const [actualCostRecord] = await db.pool.execute(
        'SELECT * FROM actual_costs WHERE production_order_id = ?',
        [productionOrderId]
      );

      let actualCost;
      if (actualCostRecord.length === 0) {
        // 如果没有实际成本记录，先计算
        actualCost = await this.calculateActualCost(productionOrderId);
      } else {
        const record = actualCostRecord[0];
        actualCost = {
          actualCost: {
            materialCost: record.material_cost,
            laborCost: record.labor_cost,
            overheadCost: record.overhead_cost,
            totalCost: record.total_cost,
            unitCost: record.total_cost / record.quantity,
          },
        };
      }

      // 计算差异
      const materialVariance =
        actualCost.actualCost.materialCost - standardCost.standardCost.materialCost;
      const laborVariance = actualCost.actualCost.laborCost - standardCost.standardCost.laborCost;
      const overheadVariance =
        actualCost.actualCost.overheadCost - standardCost.standardCost.overheadCost;
      const totalVariance = actualCost.actualCost.totalCost - standardCost.standardCost.totalCost;

      // 计算差异率
      const materialVarianceRate =
        standardCost.standardCost.materialCost > 0
          ? (materialVariance / standardCost.standardCost.materialCost) * 100
          : 0;
      const laborVarianceRate =
        standardCost.standardCost.laborCost > 0
          ? (laborVariance / standardCost.standardCost.laborCost) * 100
          : 0;
      const overheadVarianceRate =
        standardCost.standardCost.overheadCost > 0
          ? (overheadVariance / standardCost.standardCost.overheadCost) * 100
          : 0;
      const totalVarianceRate =
        standardCost.standardCost.totalCost > 0
          ? (totalVariance / standardCost.standardCost.totalCost) * 100
          : 0;

      return {
        productionOrderId,
        productId: order.product_id,
        quantity: order.quantity,
        standardCost: standardCost.standardCost,
        actualCost: actualCost.actualCost,
        variance: {
          material: {
            amount: materialVariance,
            rate: materialVarianceRate,
            favorable: materialVariance <= 0,
          },
          labor: {
            amount: laborVariance,
            rate: laborVarianceRate,
            favorable: laborVariance <= 0,
          },
          overhead: {
            amount: overheadVariance,
            rate: overheadVarianceRate,
            favorable: overheadVariance <= 0,
          },
          total: {
            amount: totalVariance,
            rate: totalVarianceRate,
            favorable: totalVariance <= 0,
          },
        },
      };
    } catch (error) {
      logger.error('成本差异分析失败:', error);
      throw error;
    }
  }

  /**
   * 计算效率差异（标准工时 vs 实际工时）
   * @param {number} taskId 生产任务ID
   * @returns {Promise<Object>} 效率差异分析结果
   */
  static async calculateEfficiencyVariance(taskId) {
    const connection = await db.pool.getConnection();
    try {
      // 获取任务的工序信息
      const [processes] = await connection.execute(
        `
        SELECT 
          pp.id,
          pp.process_name,
          pp.standard_hours,
          TIMESTAMPDIFF(SECOND, pp.actual_start_time, pp.actual_end_time) / 3600 as actual_hours,
          pp.efficiency_rate,
          pp.status
        FROM production_processes pp
        WHERE pp.task_id = ?
        ORDER BY pp.id
      `,
        [taskId]
      );

      if (processes.length === 0) {
        return {
          taskId,
          hasData: false,
          message: '未找到工序记录',
        };
      }

      // 计算汇总数据
      let totalStandardHours = 0;
      let totalActualHours = 0;
      const processDetails = [];

      for (const proc of processes) {
        const standardHours = parseFloat(proc.standard_hours) || 0;
        const actualHours = parseFloat(proc.actual_hours) || 0;
        const hoursVariance = actualHours - standardHours;
        const efficiencyRate = standardHours > 0 ? actualHours / standardHours : 0;

        totalStandardHours += standardHours;
        totalActualHours += actualHours;

        processDetails.push({
          processId: proc.id,
          processName: proc.process_name,
          standardHours,
          actualHours,
          hoursVariance,
          efficiencyRate: Math.round(efficiencyRate * 100) / 100,
          favorable: hoursVariance <= 0,
          status: proc.status,
        });

        // 更新工序的效率率
        if (standardHours > 0) {
          await connection.execute(
            'UPDATE production_processes SET efficiency_rate = ? WHERE id = ?',
            [Math.round(efficiencyRate * 100) / 100, proc.id]
          );
        }
      }

      // 从全局配置统一读取人工费率，严禁硬编码
      const costConfig = globalConfigManager.getConfig().cost;
      const laborRate = costConfig.laborRate;

      // 计算效率差异金额
      const hoursVariance = totalActualHours - totalStandardHours;
      const efficiencyVarianceAmount = hoursVariance * laborRate;
      const overallEfficiencyRate =
        totalStandardHours > 0 ? totalActualHours / totalStandardHours : 0;

      return {
        taskId,
        hasData: true,
        summary: {
          totalStandardHours: Math.round(totalStandardHours * 100) / 100,
          totalActualHours: Math.round(totalActualHours * 100) / 100,
          hoursVariance: Math.round(hoursVariance * 100) / 100,
          efficiencyRate: Math.round(overallEfficiencyRate * 100) / 100,
          efficiencyVarianceAmount: Math.round(efficiencyVarianceAmount * 100) / 100,
          laborRate,
          favorable: hoursVariance <= 0,
        },
        processDetails,
      };
    } catch (error) {
      logger.error('[CostAccounting] 效率差异分析失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 获取物料的单位成本（根据指定方法）
   * @param {Object} connection 数据库连接
   * @param {number} materialId 物料ID
   * @param {string} method 成本计算方法
   * @param {Date} asOfDate 截止日期
   * @returns {number} 单位成本
   */
  static async getMaterialUnitCost(
    connection,
    materialId,
    method = this.COSTING_METHOD.WEIGHTED_AVERAGE,
    asOfDate = new Date()
  ) {
    // 注意：由于系统的库存台账 inventory_ledger 仅记录数量不记录金额，
    // 且 inventory_transactions 表不存在，FIFO/LIFO/加权平均无法使用。
    // 统一使用标准成本或物料主数据价格作为单位成本。
    try {
      return await this.getStandardMaterialCost(connection, materialId);
    } catch (error) {
      logger.error(`获取物料 ${materialId} 单位成本失败:`, error);
      return 0;
    }
  }

  /**
   * 计算先进先出成本
   * @param {Object} connection 数据库连接
   * @param {number} materialId 物料ID
   * @param {string} asOfDate 截止日期
   * @returns {number} FIFO单位成本
   */
  static async calculateFIFOCost(connection, materialId, asOfDate) {
    // @deprecated inventory_transactions 表不存在，降级为标准成本
    logger.warn('[CostAccounting] calculateFIFOCost 已降级为标准成本');
    return await this.getStandardMaterialCost(connection, materialId);
  }

  /**
   * 计算后进先出成本
   * @param {Object} connection 数据库连接
   * @param {number} materialId 物料ID
   * @param {string} asOfDate 截止日期
   * @returns {number} LIFO单位成本
   */
  static async calculateLIFOCost(connection, materialId, asOfDate) {
    // @deprecated inventory_transactions 表不存在，降级为标准成本
    logger.warn('[CostAccounting] calculateLIFOCost 已降级为标准成本');
    return await this.getStandardMaterialCost(connection, materialId);
  }

  /**
   * 计算加权平均成本
   * @param {Object} connection 数据库连接
   * @param {number} materialId 物料ID
   * @param {string} asOfDate 截止日期
   * @returns {number} 加权平均单位成本
   */
  static async calculateWeightedAverageCost(connection, materialId, asOfDate) {
    // @deprecated inventory_transactions 表不存在，降级为标准成本
    logger.warn('[CostAccounting] calculateWeightedAverageCost 已降级为标准成本');
    return await this.getStandardMaterialCost(connection, materialId);
  }

  /**
   * 获取标准物料成本 (严格版本)
   * @param {Object} connection 数据库连接
   * @param {number} materialId 物料ID
   * @returns {number} 标准单位成本
   */
  static async getStandardMaterialCost(connection, materialId) {
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

      // 如果没有活跃版本的标准成本，不要抛出异常卡死车间工序报工。
      // 返回 0 让主流程先过去，方便月底财务根据这笔 0 元入账反查并核算实际制造成本。
      logger.warn(`物料 ID:${materialId} 未配置生效版本的标准成本。下发成本: 0`);
      return 0;

    } catch (error) {
      logger.error(`获取物料 ${materialId} 标准成本失败:`, error.message);
      // 遇到纯粹查数据库失败才退回 0
      return 0;
    }
  }

  /**
   * 批量获取多个物料的标准成本（消除 N+1 查询）
   * @param {Object} connection 数据库连接
   * @param {number[]} materialIds 物料ID数组
   * @returns {Object} materialId → standardPrice 的映射
   */
  static async getBatchStandardMaterialCosts(connection, materialIds) {
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
  }

  /**
   * 库存成本重新计算（月结/全量校准用途）
   *
   * ⚠️ 职责边界说明：
   *   - 本方法用于 **月结** 或 **手动校准** 场景，遍历所有历史台账全量重算 cost_price
   *   - 实时增量场景（采购入库、调整入库等）由 InventoryCostService.generateInboundCostEntry() 的 MAC 算法负责
   *   - 两者是互补关系：InventoryCostService 提供实时准确性，本方法提供事后校验能力
   *   - 若两者计算结果不一致，以本方法的全量重算为准（因为它基于完整历史数据）
   *
   * @param {number} materialId 物料ID（可选，不传则计算所有物料）
   * @param {string} method 成本计算方法
   * @returns {Object} 重新计算结果
   */
  static async recalculateInventoryCost(
    materialId = null,
    method = this.COSTING_METHOD.WEIGHTED_AVERAGE
  ) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      let materials = [];
      if (materialId) {
        const [materialInfo] = await connection.execute(
          'SELECT id, code, name FROM materials WHERE id = ?',
          [materialId]
        );
        materials = materialInfo;
      } else {
        // 尝试查询所有活跃物料，如果is_active字段不存在则查询所有物料
        try {
          const [allMaterials] = await connection.execute(
            'SELECT id, code, name FROM materials WHERE is_active = true'
          );
          materials = allMaterials;
        } catch (error) {
          if (error.message.includes('Unknown column')) {
            const [allMaterials] = await connection.execute('SELECT id, code, name FROM materials');
            materials = allMaterials;
          } else {
            throw error;
          }
        }
      }

      const results = [];

      for (const material of materials) {
        const result = await this.recalculateMaterialCost(connection, material.id, method);
        results.push({
          materialId: material.id,
          materialCode: material.code,
          materialName: material.name,
          ...result,
        });
      }

      await connection.commit();

      return {
        method,
        processedCount: results.length,
        results,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('重新计算库存成本失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 重新计算单个物料成本
   * @param {Object} connection 数据库连接
   * @param {number} materialId 物料ID
   * @param {string} method 成本计算方法
   * @returns {Object} 计算结果
   */
  static async recalculateMaterialCost(connection, materialId, method) {
    // 获取库存交易记录（按时间排序，处理字段名兼容性）
    let transactions = [];
    try {
      const [result] = await connection.execute(
        `SELECT * FROM inventory_ledger
         WHERE material_id = ?
         ORDER BY transaction_date, created_at`,
        [materialId]
      );
      transactions = result;
    } catch (error) {
      if (error.message.includes('Unknown column')) {
        // 尝试使用created_at字段排序
        const [result] = await connection.execute(
          `SELECT * FROM inventory_ledger
           WHERE material_id = ?
           ORDER BY created_at`,
          [materialId]
        );
        transactions = result;
      } else {
        throw error;
      }
    }

    let currentQuantity = 0;
    let currentValue = 0;
    let currentUnitCost = 0;

    for (const transaction of transactions) {
      if (
        transaction.transaction_type === 'inbound' ||
        transaction.transaction_type === 'purchase_inbound' ||
        transaction.transaction_type === 'production_inbound'
      ) {
        // 入库处理
        const inboundQuantity = transaction.quantity;
        // 尝试从不同字段获取单位成本
        const inboundUnitCost =
          transaction.unit_cost ||
          (transaction.amount && transaction.quantity
            ? transaction.amount / transaction.quantity
            : 0) ||
          0;
        const inboundValue = inboundQuantity * inboundUnitCost;

        if (method === this.COSTING_METHOD.WEIGHTED_AVERAGE) {
          // 加权平均法
          const totalValue = currentValue + inboundValue;
          const totalQuantity = currentQuantity + inboundQuantity;

          if (totalQuantity > 0) {
            currentUnitCost = totalValue / totalQuantity;
          }

          currentQuantity = totalQuantity;
          currentValue = totalValue;
        } else if (method === this.COSTING_METHOD.FIFO) {
          // 先进先出法（简化处理）
          currentQuantity += inboundQuantity;
          currentValue += inboundValue;
          if (currentQuantity > 0) {
            currentUnitCost = currentValue / currentQuantity;
          }
        }
      } else if (
        transaction.transaction_type === 'outbound' ||
        transaction.transaction_type === 'sales_outbound' ||
        transaction.transaction_type === 'production_outbound'
      ) {
        // 出库处理
        const outboundQuantity = transaction.quantity;
        const outboundValue = outboundQuantity * currentUnitCost;

        currentQuantity -= outboundQuantity;
        currentValue -= outboundValue;

        // 确保不出现负值
        if (currentQuantity < 0) currentQuantity = 0;
        if (currentValue < 0) currentValue = 0;
      }

      // 更新交易记录的单位成本（尝试不同的字段名）
      try {
        await connection.execute('UPDATE inventory_ledger SET unit_cost = ? WHERE id = ?', [
          currentUnitCost,
          transaction.id,
        ]);
      } catch (error) {
        if (error.message.includes('Unknown column')) {
          // 如果unit_cost字段不存在，尝试更新amount字段
          try {
            const newAmount = transaction.quantity * currentUnitCost;
            await connection.execute('UPDATE inventory_ledger SET amount = ? WHERE id = ?', [
              newAmount,
              transaction.id,
            ]);
          } catch (amountError) {
            // 如果amount字段也不存在，记录警告但不抛出错误
          }
        } else {
          throw error;
        }
      }
    }

    // 更新物料的当前成本（写入 cost_price 成本价字段，严禁污染 price 销售价字段）
    await connection.execute('UPDATE materials SET cost_price = ? WHERE id = ?', [
      currentUnitCost,
      materialId,
    ]);

    return {
      finalQuantity: currentQuantity,
      transactionCount: transactions.length,
    };
  }

  /**
   * 获取成本配置（直接从数据库读取，不依赖全局单例）
   * @returns {Object} 配置对象 { laborRate, overheadRate, costingMethod, ... }
   */
  static async getCostSettings() {
    const [rows] = await db.pool.execute(
      `SELECT labor_rate, overhead_rate, costing_method, wage_payment_method, piece_rate,
              fallback_material_ratio, fallback_labor_ratio, fallback_overhead_ratio
       FROM cost_settings WHERE is_active = 1 LIMIT 1`
    );

    if (rows.length === 0) {
      throw new BusinessError(
        '系统成本基础配置缺失，请在「财务管理 → 成本设置」中完成初始化配置',
        { route: '/finance/cost/settings', buttonText: '去配置成本参数' }
      );
    }

    const row = rows[0];
    return {
      laborRate: Number(row.labor_rate),
      overheadRate: Number(row.overhead_rate),
      costingMethod: row.costing_method,
      wagePaymentMethod: row.wage_payment_method,
      pieceRate: Number(row.piece_rate),
      fallbackMaterialRatio: Number(row.fallback_material_ratio),
      fallbackLaborRatio: Number(row.fallback_labor_ratio),
      fallbackOverheadRatio: Number(row.fallback_overhead_ratio),
    };
  }

  /**
   * 计算生产任务的实际成本 (统一入口)
   * 整合了材料实际出库、工时实际记录等逻辑
   * @param {number} taskId 生产任务ID
   * @param {Object} options 选项 { quantity: number }
   */
  static async calculateTaskActualCost(taskId, options = {}) {
    const connection = await db.pool.getConnection();
    try {
      const quantity = options.quantity || 1;

      // 1. 获取配置
      const settings = await this.getCostSettings();

      // 2. 计算材料成本 (优先基于实际出库)
      let materialCost = 0;
      let useActualOutbound = false;

      try {
        const [outboundCosts] = await connection.execute(
          `SELECT SUM(ioi.actual_quantity * COALESCE(m.cost_price, m.price, 0)) as total_material_cost
            FROM inventory_outbound io
            JOIN inventory_outbound_items ioi ON io.id = ioi.outbound_id
            JOIN materials m ON ioi.material_id = m.id
            LEFT JOIN cost_supplement_configs csc ON io.issue_reason = csc.reason_name
            WHERE io.production_task_id = ? 
              AND io.status IN ('completed', 'confirmed')
              AND (csc.is_included_in_cost IS NULL OR csc.is_included_in_cost = 1)`,
          [taskId]
        );

        if (outboundCosts.length > 0 && outboundCosts[0].total_material_cost) {
          materialCost = parseFloat(outboundCosts[0].total_material_cost) || 0;
          if (materialCost > 0) useActualOutbound = true;
        }
      } catch (e) {
        logger.warn(`[CostService] 查询实际出库成本失败: ${e.message}`);
      }

      // 3. 计算人工成本 (基于实际工序时间)
      let laborCost = 0;
      let actualHours = 0;
      let useActualLabor = false;

      try {
        const [procs] = await connection.query(
          'SELECT actual_start_time, actual_end_time FROM production_processes WHERE task_id = ? AND status = "completed"',
          [taskId]
        );

        if (procs.length > 0) {
          for (const proc of procs) {
            if (proc.actual_start_time && proc.actual_end_time) {
              const start = new Date(proc.actual_start_time);
              const end = new Date(proc.actual_end_time);
              const hours = (end - start) / (1000 * 60 * 60);
              if (hours > 0) actualHours += hours;
            }
          }

          if (actualHours > 0 || settings.wagePaymentMethod === 'piece') {
            if (settings.wagePaymentMethod === 'piece') {
              // 计件模式：按生产数量计算（使用精确计算）
              const quantityNum = Number(quantity) || 0;
              const pieceRateNum = Number(settings.pieceRate) || 0;
              laborCost = Precision.mul(quantityNum, pieceRateNum);
              logger.info(
                `[Cost] 计件模式: 数量=${quantityNum}, 件薪=${pieceRateNum}, 人工=${laborCost}`
              );
            } else {
              // 计时模式：按实际工时计算（使用精确计算）
              laborCost = Precision.mul(actualHours, settings.laborRate);
              logger.info(
                `[Cost] 计时模式: 工时=${actualHours.toFixed(2)}, 时薪=${settings.laborRate}, 人工=${laborCost}`
              );
            }
            useActualLabor = true;
          }
        }
      } catch (e) {
        logger.warn(`[CostService] 获取工序时间失败: ${e.message}`);
      }

      // 4. 如果没有实际数据，回退到标准成本
      let overheadCost = 0;
      let calculationMethod = 'standard';

      // 获取任务对应的产品ID以便查询标准成本
      const [taskInfo] = await connection.execute(
        'SELECT product_id FROM production_tasks WHERE id = ?',
        [taskId]
      );
      const productId = taskInfo.length > 0 ? taskInfo[0].product_id : null;

      if (productId) {
        const stdCost = await this.ensureStandardCost(productId, quantity);

        // 如果没有实际材料成本，使用标准
        if (!useActualOutbound) {
          materialCost = stdCost.materialCost;
        } else {
          calculationMethod = 'actual_material';
        }

        // 如果没有实际人工成本，使用标准
        if (!useActualLabor) {
          laborCost = stdCost.laborCost;
        } else {
          calculationMethod = useActualOutbound ? 'actual_combined' : 'actual_labor';
        }

        // 制造费用：统一通过分摊规则引擎计算
        const OverheadAllocationService = require('./OverheadAllocationService');
        const ohResult = await OverheadAllocationService.calculateOverhead({
          productId,
          laborCost,
          laborHours: actualHours,
          quantity,
          materialCost,
          date: new Date().toISOString().split('T')[0],
        });
        overheadCost = ohResult.overhead;
      }

      // 使用精确加法计算总成本，确保借贷平衡
      // 例如：952.00 + 0.06 + 0.03 = 952.09（而非 952.10）
      const totalCost = Precision.sumRound2(materialCost, laborCost, overheadCost);

      // 四舍五入各项成本到分
      const roundedMaterialCost = Precision.round2(materialCost);
      const roundedLaborCost = Precision.round2(laborCost);
      const roundedOverheadCost = Precision.round2(overheadCost);

      // 确保分项之和等于总成本（尾差调整）
      const costItems = [
        { name: 'material', amount: roundedMaterialCost },
        { name: 'labor', amount: roundedLaborCost },
        { name: 'overhead', amount: roundedOverheadCost },
      ];
      Precision.adjustTail(costItems, totalCost, 'amount');

      return {
        materialCost: costItems[0].amount,
        laborCost: costItems[1].amount,
        overheadCost: costItems[2].amount,
        totalCost,
        currency: 'CNY',
        calculationMethod,
        details: {
          actualHours,
          laborRate: settings.laborRate,
          overheadRate: settings.overheadRate,
          useActualOutbound,
          useActualLabor,
        },
      };
    } catch (error) {
      logger.error(`[CostService] 计算实际成本失败 (Task ${taskId}):`, error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 确保获取标准成本（包含兜底策略）
   * 策略: 查表 -> 动态计算 -> 价格拆分
   * @param {number} productId 产品ID
   * @param {number} quantity 数量
   * @returns {Object} 标准成本对象 { materialCost, laborCost, overheadCost, totalCost }
   */
  static async ensureStandardCost(productId, quantity = 1) {
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
         WHERE product_id = ? AND is_active = 1`,
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

      const [product] = await db.pool.execute('SELECT price FROM materials WHERE id = ?', [
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
  }

  /**
   * 初始化成本核算相关表
   * @deprecated 表结构已迁移至 Knex migration 文件管理
   */
  static async initializeCostAccountingTables() {
    const connection = await db.pool.getConnection();
    try {
      // 注意：standard_costs, actual_costs, cost_settings 表已由 Knex migration 管理
      // 仅保留默认配置检查逻辑
      const [existingSettings] = await connection.execute(
        'SELECT id FROM cost_settings WHERE is_active = true LIMIT 1'
      );

      if (existingSettings.length === 0) {
        // 从全局配置读取初始值，严禁硬编码
        const costConfig = globalConfigManager.getConfig().cost;
        await connection.execute(`
          INSERT INTO cost_settings (setting_name, overhead_rate, labor_rate, costing_method, is_active, description)
          VALUES ('默认成本配置', ?, ?, ?, true, '系统默认成本核算配置')
        `, [costConfig.overheadRate, costConfig.laborRate, costConfig.costingMethod || 'weighted_average']);
        logger.info('[CostAccountingService] 已创建默认成本配置');
      }

      logger.info('[CostAccountingService] 成本核算相关表初始化完成');
    } catch (error) {
      logger.error('初始化成本核算表失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
  /**
   * 计算期末在制品(WIP)成本
   * @param {string} period - 会计期间 (YYYY-MM)
   * @returns {Object} WIP成本汇总
   */
  static async calculatePeriodWIP(period) {
    const connection = await db.pool.getConnection();
    try {
      // 1. 获取该期间内尚未完工的任务，或者在该期间结束时尚未完工的历史任务
      // 逻辑：任务创建早于等于期间结束日，且 (未完工 OR 完工日期晚于期间结束日)

      let endDate;
      if (period) {
        const [year, month] = period.split('-');
        endDate = new Date(year, month, 0); // 月末
      } else {
        endDate = new Date();
      }
      const endDateStr = endDate.toISOString().split('T')[0];

      const [wipTasks] = await connection.execute(
        `
        SELECT pt.id, pt.code, pt.product_id, pt.quantity, pt.created_at,
               m.name as product_name, m.code as product_code
        FROM production_tasks pt
        LEFT JOIN materials m ON pt.product_id = m.id
        WHERE pt.created_at <= ? 
        AND pt.status IN ('planned', 'in_progress', 'paused')
      `,
        [`${endDateStr} 23:59:59`]
      );

      let totalWIPCost = 0;
      let semiFinishedWIPCost = 0; // 半成品（3开头）
      let finishedWIPCost = 0; // 成品

      const semiFinishedDetails = [];
      const finishedDetails = [];

      for (const task of wipTasks) {
        // 计算截至到期末的投入成本
        // 1. 材料投入 (Inventory Outbound where date <= endDate)
        const [matCost] = await connection.execute(
          `
          SELECT SUM(ioi.actual_quantity * m.price) as cost
          FROM inventory_outbound_items ioi
          JOIN inventory_outbound io ON ioi.outbound_id = io.id
          JOIN materials m ON ioi.material_id = m.id
          WHERE io.production_task_id = ? 
          AND io.outbound_date <= ?
          AND io.status IN ('confirmed', 'completed')
        `,
          [task.id, endDateStr]
        );

        // 2. 人工投入 (基于报工记录的实际工时 × 全局人工费率)
        const settings = await this.getCostSettings();
        const [laborData] = await connection.execute(
          `
          SELECT COALESCE(SUM(work_hours), 0) as total_hours
          FROM production_reports
          WHERE task_id = ? AND report_date <= ?
        `,
          [task.id, endDateStr]
        );

        const totalHours = parseFloat(laborData[0]?.total_hours) || 0;
        const taskLaborCost = Precision.round2(Precision.mul(totalHours, settings.laborRate));

        // 3. 制造费用：统一通过分摊规则引擎计算
        const OverheadAllocationService = require('./OverheadAllocationService');
        const taskMaterialCost = matCost[0]?.cost || 0;
        
        const ohResult = await OverheadAllocationService.calculateOverhead({
          productId: task.product_id,
          costCenterId: task.cost_center_id,
          laborCost: taskLaborCost,
          laborHours: totalHours,
          quantity: task.planned_quantity,
          materialCost: taskMaterialCost,
          date: endDateStr,
        });
        const taskOverheadCost = Precision.round2(ohResult.overhead);

        const taskTotalCost = taskMaterialCost + taskLaborCost + taskOverheadCost;

        if (taskTotalCost > 0) {
          const detail = {
            taskId: task.id,
            taskCode: task.code,
            productCode: task.product_code,
            productName: task.product_name,
            materialCost: taskMaterialCost,
            laborCost: taskLaborCost,
            overheadCost: taskOverheadCost,
            totalCost: taskTotalCost,
          };

          // 判断是否为半成品（物料编码3开头）
          const isSemiFinished = task.product_code && task.product_code.startsWith('3');

          if (isSemiFinished) {
            semiFinishedWIPCost += taskTotalCost;
            semiFinishedDetails.push(detail);
          } else {
            finishedWIPCost += taskTotalCost;
            finishedDetails.push(detail);
          }

          totalWIPCost += taskTotalCost;
        }
      }

      return {
        period,
        endDate: endDateStr,
        totalWIPCost,
        taskCount: semiFinishedDetails.length + finishedDetails.length,
        summary: {
          semiFinished: {
            cost: semiFinishedWIPCost,
            count: semiFinishedDetails.length,
          },
          finished: {
            cost: finishedWIPCost,
            count: finishedDetails.length,
          },
        },
        details: {
          semiFinished: semiFinishedDetails,
          finished: finishedDetails,
        },
      };
    } catch (error) {
      logger.error('计算WIP成本失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 计算委外在途成本（已发料但未入库）
   * @param {string} period - 会计期间 (YYYY-MM)
   * @returns {Object} 委外在途成本汇总
   */
  static async calculateOutsourcedWIP(period) {
    const connection = await db.pool.getConnection();
    try {
      let endDate;
      if (period) {
        const [year, month] = period.split('-');
        endDate = new Date(year, month, 0);
      } else {
        endDate = new Date();
      }
      const endDateStr = endDate.toISOString().split('T')[0];

      // 查询已确认但未完成的委外加工单
      const [wipOrders] = await connection.execute(
        `
        SELECT 
          op.id,
          op.processing_no,
          op.supplier_id,
          COALESCE(op.supplier_name, s.name) as supplier_name,
          op.created_at,
          op.confirmed_at
        FROM outsourced_processings op
        LEFT JOIN suppliers s ON op.supplier_id = s.id
        WHERE op.status = 'confirmed'
        AND COALESCE(op.confirmed_at, op.created_at) <= ?
        ORDER BY op.supplier_id, op.processing_no
      `,
        [`${endDateStr} 23:59:59`]
      );

      let totalWIPCost = 0;
      const details = [];
      const supplierSummary = {};

      for (const order of wipOrders) {
        // 获取该订单的发料成本
        const [materials] = await connection.execute(
          `
          SELECT 
            opm.material_id,
            opm.quantity,
            m.code as material_code,
            m.name as material_name,
            m.price,
            m.cost_price
          FROM outsourced_processing_materials opm
          LEFT JOIN materials m ON opm.material_id = m.id
          WHERE opm.processing_id = ?
        `,
          [order.id]
        );

        let orderMaterialCost = 0;
        for (const mat of materials) {
          const costPrice = parseFloat(mat.cost_price || mat.price || 0);
          orderMaterialCost += parseFloat(mat.quantity) * costPrice;
        }

        // 获取该订单的预计加工费
        const [products] = await connection.execute(
          `
          SELECT SUM(quantity * unit_price) as estimated_fee
          FROM outsourced_processing_products
          WHERE processing_id = ?
        `,
          [order.id]
        );
        const estimatedFee = parseFloat(products[0]?.estimated_fee || 0);

        // 查询已入库数量
        const [receipts] = await connection.execute(
          `
          SELECT COALESCE(SUM(ori.actual_quantity * ori.unit_price), 0) as received_value
          FROM outsourced_processing_receipts opr
          LEFT JOIN outsourced_processing_receipt_items ori ON opr.id = ori.receipt_id
          WHERE opr.processing_id = ?
          AND opr.status = 'confirmed'
        `,
          [order.id]
        );
        const receivedValue = parseFloat(receipts[0]?.received_value || 0);

        // 在途成本 = 发料成本 - 已入库价值
        const wipCost = orderMaterialCost - receivedValue;

        if (wipCost > 0) {
          totalWIPCost += wipCost;

          details.push({
            processingId: order.id,
            processingNo: order.processing_no,
            supplierId: order.supplier_id,
            supplierName: order.supplier_name,
            materialCost: orderMaterialCost,
            receivedValue: receivedValue,
            wipCost: wipCost,
            estimatedFee: estimatedFee,
            confirmedDate: order.confirmed_at || order.created_at,
          });

          // 按供应商汇总
          if (!supplierSummary[order.supplier_id]) {
            supplierSummary[order.supplier_id] = {
              supplierId: order.supplier_id,
              supplierName: order.supplier_name,
              orderCount: 0,
              totalWIPCost: 0,
            };
          }
          supplierSummary[order.supplier_id].orderCount++;
          supplierSummary[order.supplier_id].totalWIPCost += wipCost;
        }
      }

      return {
        period,
        endDate: endDateStr,
        totalWIPCost,
        orderCount: details.length,
        supplierSummary: Object.values(supplierSummary),
        details,
      };
    } catch (error) {
      logger.error('计算委外在途成本失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ===================== 凭证生成方法 =====================

  /**
   * 获取科目ID（通过科目编码）
   * @param {Object} connection 数据库连接
   * @param {string} accountCode 科目编码
   * @returns {Promise<number|null>} 科目ID
   */
  static async getAccountIdByCode(connection, accountCode) {
    try {
      const [accounts] = await connection.execute(
        'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = true LIMIT 1',
        [accountCode]
      );
      return accounts.length > 0 ? accounts[0].id : null;
    } catch (error) {
      logger.error(`获取科目ID失败 (${accountCode}):`, error);
      return null;
    }
  }

  /**
   * 生成领料凭证
   * Dr: 生产成本-直接材料
   * Cr: 原材料
   *
   * @param {number} taskId 生产任务ID
   * @param {Object} connection 数据库连接（用于事务）
   * @param {number} outboundId 可选，指定出库单ID（用于补料等场景，只计算该出库单的成本）
   * @returns {Promise<Object>} 凭证信息
   */
  static async generateMaterialVoucher(taskId, connection = null, outboundId = null) {
    const conn = connection || (await db.pool.getConnection());
    const shouldManageTransaction = !connection;

    try {
      if (shouldManageTransaction) {
        await conn.beginTransaction();
      }

      // 1. 获取任务信息
      const [tasks] = await conn.execute(
        `SELECT pt.*, m.name as product_name, m.code as product_code
         FROM production_tasks pt
         LEFT JOIN materials m ON pt.product_id = m.id
         WHERE pt.id = ?`,
        [taskId]
      );

      if (tasks.length === 0) {
        throw new Error('生产任务不存在');
      }

      const task = tasks[0];

      // 2. 获取出库明细，按物料汇总计算成本
      // 如果指定了 outboundId，则只计算该出库单的成本（用于补料场景）
      let outboundItems;
      let voucherDescription;

      if (outboundId) {
        // 指定出库单：只计算这一单的成本
        const [items] = await conn.execute(
          `SELECT 
             ioi.material_id,
             m.code as material_code,
             m.name as material_name,
             SUM(ioi.actual_quantity) as total_quantity,
             SUM(ioi.actual_quantity * COALESCE(m.price, 0)) as total_cost,
             io.is_excess,
             io.issue_reason
           FROM inventory_outbound io
           JOIN inventory_outbound_items ioi ON io.id = ioi.outbound_id
           JOIN materials m ON ioi.material_id = m.id
           WHERE io.id = ?
             AND io.status IN ('completed', 'confirmed')
           GROUP BY ioi.material_id, m.code, m.name, io.is_excess, io.issue_reason`,
          [outboundId]
        );
        outboundItems = items;

        // 判断是否为补料
        const isExcess = items.length > 0 && items[0].is_excess;
        voucherDescription = isExcess
          ? `生产补料凭证 - ${task.product_name || ''}`
          : `生产领料凭证 - ${task.product_name || ''}`;
      } else {
        // 未指定出库单：计算该任务所有出库的成本（原有逻辑）
        const [items] = await conn.execute(
          `SELECT 
             ioi.material_id,
             m.code as material_code,
             m.name as material_name,
             SUM(ioi.actual_quantity) as total_quantity,
             SUM(ioi.actual_quantity * COALESCE(m.price, 0)) as total_cost
           FROM inventory_outbound io
           JOIN inventory_outbound_items ioi ON io.id = ioi.outbound_id
           JOIN materials m ON ioi.material_id = m.id
           WHERE io.production_task_id = ? 
             AND io.status IN ('completed', 'confirmed')
           GROUP BY ioi.material_id, m.code, m.name`,
          [taskId]
        );
        outboundItems = items;
        voucherDescription = `生产领料凭证 - ${task.product_name || ''}`;
      }

      if (outboundItems.length === 0) {
        logger.debug(`[MaterialVoucher] 任务 ${taskId} 无领料记录，跳过凭证生成`);
        if (shouldManageTransaction) await conn.commit();
        return { skipped: true, reason: '无领料记录' };
      }

      // 3. 使用 Precision 计算总成本
      const totalMaterialCost = Precision.round2(
        outboundItems.reduce((sum, item) => Precision.add(sum, item.total_cost || 0), 0)
      );

      if (totalMaterialCost <= 0) {
        logger.debug(`[MaterialVoucher] 任务 ${taskId} 领料成本为0，跳过凭证生成`);
        if (shouldManageTransaction) await conn.commit();
        return { skipped: true, reason: '领料成本为0' };
      }

      // 4. 获取会计科目
      const { accountingConfig } = require('../../config/accountingConfig');
      await accountingConfig.loadFromDatabase(db);

      const productionCostCode = accountingConfig.getAccountCode('PRODUCTION_COST');
      const rawMaterialCode = accountingConfig.getAccountCode('RAW_MATERIALS');

      const productionCostAccountId = await this.getAccountIdByCode(conn, productionCostCode);
      const rawMaterialAccountId = await this.getAccountIdByCode(conn, rawMaterialCode);

      if (!productionCostAccountId || !rawMaterialAccountId) {
        throw new Error(
          `科目配置缺失: 生产成本(${productionCostCode})=${productionCostAccountId}, 原材料(${rawMaterialCode})=${rawMaterialAccountId}`
        );
      }

      // 5. 获取会计期间
      const entryDate = new Date().toISOString().split('T')[0];
      const periodId = await GLService.getPeriodIdByDate(entryDate);

      // 6. 构建分录明细
      const entryItems = [
        {
          account_id: productionCostAccountId,
          debit_amount: totalMaterialCost,
          credit_amount: 0,
          description: `生产领料-${task.code || taskId}: ${task.product_name || '产品'}`,
        },
        {
          account_id: rawMaterialAccountId,
          debit_amount: 0,
          credit_amount: totalMaterialCost,
          description: `原材料出库-${task.code || taskId}`,
        },
      ];

      // 7. 创建凭证
      const entryData = {
        entry_date: entryDate,
        period_id: periodId,
        document_type: '生产领料',
        document_number: task.code || `TASK-${taskId}`,
        description: voucherDescription, // 使用动态描述（区分领料/补料）
        transaction_type: '生产领料', // 业务类型：生产领料
        transaction_id: taskId, // 关联的生产任务ID
        created_by: 'system',
      };

      const entryId = await GLService.createEntry(entryData, entryItems, conn);

      if (shouldManageTransaction) {
        await conn.commit();
      }

      logger.debug(
        `[MaterialVoucher] 任务 ${taskId} 领料凭证生成成功: 分录ID=${entryId}, 金额=${totalMaterialCost}`
      );

      return {
        success: true,
        entryId,
        totalMaterialCost,
        itemCount: outboundItems.length,
      };
    } catch (error) {
      if (shouldManageTransaction) {
        await conn.rollback();
      }
      logger.error(`[MaterialVoucher] 生成领料凭证失败 (Task ${taskId}):`, error);
      throw error;
    } finally {
      if (shouldManageTransaction && conn) {
        conn.release();
      }
    }
  }

  // ===================== 以下方法已移除（未使用）=====================
  // generateLaborOverheadVoucher - 功能由 ProductionCostService.generateLaborCostEntry 替代
  // generateFinishedGoodsVoucher - 功能由 ProductionCostService.generateProductionCompletionEntry 替代
  // ===================== 移除结束 =====================

  // ===================== 在制品(WIP)成本模块 =====================

  /**
   * 计算期末在制品成本
   * 使用约当产量法：WIP成本 = 已投入成本 × 完工率权重
   *
   * @param {number} taskId 生产任务ID
   * @param {number} laborCost 人工成本
   * @param {number} overheadCost 制造费用
   * @param {Object} connection 数据库连接（用于事务）
   * @returns {Promise<Object>} 凭证信息
   */
  static async generateLaborOverheadVoucher(taskId, laborCost, overheadCost, connection = null) {
    const conn = connection || (await db.pool.getConnection());
    const shouldManageTransaction = !connection;

    try {
      if (shouldManageTransaction) {
        await conn.beginTransaction();
      }

      // 使用 Precision 确保精度
      const labor = Precision.round2(laborCost || 0);
      const overhead = Precision.round2(overheadCost || 0);

      // 如果都为0，跳过
      if (labor <= 0 && overhead <= 0) {
        logger.info(`[LaborOverheadVoucher] 任务 ${taskId} 人工和制造费用都为0，跳过`);
        if (shouldManageTransaction) await conn.commit();
        return { skipped: true, reason: '人工和制造费用都为0' };
      }

      // 获取任务信息
      const [tasks] = await conn.execute(
        `SELECT pt.*, m.name as product_name, m.code as product_code
         FROM production_tasks pt
         LEFT JOIN materials m ON pt.product_id = m.id
         WHERE pt.id = ?`,
        [taskId]
      );

      if (tasks.length === 0) {
        throw new Error('生产任务不存在');
      }

      const task = tasks[0];

      // 获取会计科目
      const { accountingConfig } = require('../../config/accountingConfig');
      await accountingConfig.loadFromDatabase(db);

      const productionCostCode = accountingConfig.getAccountCode('PRODUCTION_COST');
      const employeePayableCode = accountingConfig.getAccountCode('EMPLOYEE_PAYABLE');
      const manufacturingExpenseCode = accountingConfig.getAccountCode('MANUFACTURING_EXPENSE');

      const productionCostAccountId = await this.getAccountIdByCode(conn, productionCostCode);
      const employeePayableAccountId = await this.getAccountIdByCode(conn, employeePayableCode);
      const manufacturingExpenseAccountId = await this.getAccountIdByCode(
        conn,
        manufacturingExpenseCode
      );

      // 获取会计期间
      const entryDate = new Date().toISOString().split('T')[0];
      const periodId = await GLService.getPeriodIdByDate(entryDate);

      // 构建分录明细
      const entryItems = [];

      // 借方：生产成本-直接人工
      if (labor > 0 && productionCostAccountId) {
        entryItems.push({
          account_id: productionCostAccountId,
          debit_amount: labor,
          credit_amount: 0,
          description: `直接人工成本-${task.code || taskId}`,
        });
      }

      // 借方：生产成本-制造费用
      if (overhead > 0 && productionCostAccountId) {
        entryItems.push({
          account_id: productionCostAccountId,
          debit_amount: overhead,
          credit_amount: 0,
          description: `制造费用分配-${task.code || taskId}`,
        });
      }

      // 贷方：应付职工薪酬
      if (labor > 0 && employeePayableAccountId) {
        entryItems.push({
          account_id: employeePayableAccountId,
          debit_amount: 0,
          credit_amount: labor,
          description: `计提直接人工-${task.code || taskId}`,
        });
      }

      // 贷方：制造费用
      if (overhead > 0 && manufacturingExpenseAccountId) {
        entryItems.push({
          account_id: manufacturingExpenseAccountId,
          debit_amount: 0,
          credit_amount: overhead,
          description: `制造费用结转-${task.code || taskId}`,
        });
      }

      if (entryItems.length === 0) {
        logger.warn(`[LaborOverheadVoucher] 任务 ${taskId} 无有效分录项`);
        if (shouldManageTransaction) await conn.commit();
        return { skipped: true, reason: '无有效分录项' };
      }

      // 创建凭证
      const entryData = {
        entry_date: entryDate,
        period_id: periodId,
        document_type: '人工及费用',
        document_number: task.code || `TASK-${taskId}`,
        description: `人工与制造费用凭证 - ${task.product_name || ''}`,
        transaction_type: '生产人工', // 业务类型：人工成本
        transaction_id: taskId, // 关联的生产任务ID
        created_by: 'system',
      };

      const entryId = await GLService.createEntry(entryData, entryItems, conn);

      if (shouldManageTransaction) {
        await conn.commit();
      }

      logger.info(
        `[LaborOverheadVoucher] 任务 ${taskId} 凭证生成成功: 分录ID=${entryId}, 人工=${labor}, 费用=${overhead}`
      );

      return {
        success: true,
        entryId,
        laborCost: labor,
        overheadCost: overhead,
      };
    } catch (error) {
      if (shouldManageTransaction) {
        await conn.rollback();
      }
      logger.error(`[LaborOverheadVoucher] 生成凭证失败 (Task ${taskId}):`, error);
      throw error;
    } finally {
      if (shouldManageTransaction && conn) {
        conn.release();
      }
    }
  }

  /**
   * 生成完工入库凭证（改造版，保留成本明细）
   * Dr: 库存商品 (totalCost)
   * Cr: 生产成本-直接材料 (materialCost)
   * Cr: 生产成本-直接人工 (laborCost)
   * Cr: 生产成本-制造费用 (overheadCost)
   *
   * @param {number} taskId 生产任务ID
   * @param {Object} costBreakdown 成本明细 { materialCost, laborCost, overheadCost }
   * @param {Object} connection 数据库连接（用于事务）
   * @returns {Promise<Object>} 凭证信息
   */
  static async generateFinishedGoodsVoucher(taskId, costBreakdown, connection = null) {
    const conn = connection || (await db.pool.getConnection());
    const shouldManageTransaction = !connection;

    try {
      if (shouldManageTransaction) {
        await conn.beginTransaction();
      }

      // 使用 Precision 确保精度
      const materialCost = Precision.round2(costBreakdown.materialCost || 0);
      const laborCost = Precision.round2(costBreakdown.laborCost || 0);
      const overheadCost = Precision.round2(costBreakdown.overheadCost || 0);

      // 计算总成本（使用精确加法）
      const totalCost = Precision.sumRound2(materialCost, laborCost, overheadCost);

      if (totalCost <= 0) {
        logger.info(`[FinishedGoodsVoucher] 任务 ${taskId} 总成本为0，跳过`);
        if (shouldManageTransaction) await conn.commit();
        return { skipped: true, reason: '总成本为0' };
      }

      // 获取任务信息
      const [tasks] = await conn.execute(
        `SELECT pt.*, m.name as product_name, m.code as product_code
         FROM production_tasks pt
         LEFT JOIN materials m ON pt.product_id = m.id
         WHERE pt.id = ?`,
        [taskId]
      );

      if (tasks.length === 0) {
        throw new Error('生产任务不存在');
      }

      const task = tasks[0];

      // 获取会计科目
      const { accountingConfig } = require('../../config/accountingConfig');
      await accountingConfig.loadFromDatabase(db);

      const finishedGoodsCode =
        accountingConfig.getAccountCode('FINISHED_GOODS') ||
        accountingConfig.getAccountCode('INVENTORY_GOODS');
      const productionCostCode = accountingConfig.getAccountCode('PRODUCTION_COST');

      const finishedGoodsAccountId = await this.getAccountIdByCode(conn, finishedGoodsCode);
      const productionCostAccountId = await this.getAccountIdByCode(conn, productionCostCode);

      if (!finishedGoodsAccountId || !productionCostAccountId) {
        throw new Error(
          `科目配置缺失: 库存商品(${finishedGoodsCode})=${finishedGoodsAccountId}, 生产成本(${productionCostCode})=${productionCostAccountId}`
        );
      }

      // 获取会计期间
      const entryDate = new Date().toISOString().split('T')[0];
      const periodId = await GLService.getPeriodIdByDate(entryDate);

      // 构建贷方分项（保留成本明细）
      const creditItems = [];

      if (materialCost > 0) {
        creditItems.push({
          account_id: productionCostAccountId,
          debit_amount: 0,
          credit_amount: materialCost,
          description: `结转直接材料成本-${task.code || taskId}`,
        });
      }

      if (laborCost > 0) {
        creditItems.push({
          account_id: productionCostAccountId,
          debit_amount: 0,
          credit_amount: laborCost,
          description: `结转直接人工成本-${task.code || taskId}`,
        });
      }

      if (overheadCost > 0) {
        creditItems.push({
          account_id: productionCostAccountId,
          debit_amount: 0,
          credit_amount: overheadCost,
          description: `结转制造费用-${task.code || taskId}`,
        });
      }

      // 使用 Precision.adjustTail 确保贷方合计等于借方（总成本）
      Precision.adjustTail(creditItems, totalCost, 'credit_amount');

      // 构建完整分录
      const entryItems = [
        // 借方：库存商品
        {
          account_id: finishedGoodsAccountId,
          debit_amount: totalCost,
          credit_amount: 0,
          description: `生产完工入库-${task.product_name || ''} ${task.quantity}个`,
        },
        // 贷方：生产成本明细
        ...creditItems,
      ];

      // 创建凭证
      const entryData = {
        entry_date: entryDate,
        period_id: periodId,
        document_type: '生产完工',
        document_number: task.code || `TASK-${taskId}`,
        description: `生产完工入库凭证 - ${task.product_name || ''}`,
        transaction_type: '生产完工', // 业务类型：生产完工
        transaction_id: taskId, // 关联的生产任务ID
        created_by: 'system',
      };

      const entryId = await GLService.createEntry(entryData, entryItems, conn);

      if (shouldManageTransaction) {
        await conn.commit();
      }

      logger.info(
        `[FinishedGoodsVoucher] 任务 ${taskId} 完工凭证生成成功: 分录ID=${entryId}, 总成本=${totalCost}`
      );

      return {
        success: true,
        entryId,
        totalCost,
        costBreakdown: {
          materialCost,
          laborCost,
          overheadCost,
        },
      };
    } catch (error) {
      if (shouldManageTransaction) {
        await conn.rollback();
      }
      logger.error(`[FinishedGoodsVoucher] 生成完工凭证失败 (Task ${taskId}):`, error);
      throw error;
    } finally {
      if (shouldManageTransaction && conn) {
        conn.release();
      }
    }
  }

  // ===================== 在制品(WIP)成本模块 =====================

  /**
   * 计算期末在制品成本
   * 使用约当产量法：WIP成本 = 已投入成本 × 完工率权重
   *
   * @param {number} periodId 会计期间ID（可选，默认当前期间）
   * @param {string} snapshotDate 快照日期（可选，默认今天）
   * @returns {Promise<Object>} WIP 成本汇总
   */
  static async calculateWIPCost(periodId = null, snapshotDate = null) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 确定快照日期
      const snapDate = snapshotDate || new Date().toISOString().split('T')[0];

      // 获取会计期间
      let actualPeriodId = periodId;
      if (!actualPeriodId) {
        actualPeriodId = await GLService.getPeriodIdByDate(snapDate);
      }

      // 查询所有未完工任务（状态不是 completed/cancelled）
      const [wipTasks] = await connection.execute(`
        SELECT 
          pt.id as task_id,
          pt.code as task_code,
          pt.product_id,
          m.name as product_name,
          pt.quantity as planned_quantity,
          pt.completed_quantity,
          pt.status,
          pt.created_at
        FROM production_tasks pt
        LEFT JOIN materials m ON pt.product_id = m.id
        WHERE pt.status NOT IN ('completed', 'cancelled', 'warehoused')
        ORDER BY pt.id
      `);

      const wipDetails = [];
      let totalWIPMaterial = 0;
      let totalWIPLabor = 0;
      let totalWIPOverhead = 0;

      for (const task of wipTasks) {
        // 计算已投入成本（领料成本）
        const [materialCosts] = await connection.execute(
          `
          SELECT COALESCE(SUM(ioi.actual_quantity * COALESCE(m.price, 0)), 0) as total
          FROM inventory_outbound io
          JOIN inventory_outbound_items ioi ON io.id = ioi.outbound_id
          JOIN materials m ON ioi.material_id = m.id
          WHERE io.production_task_id = ? AND io.status IN ('completed', 'confirmed')
        `,
          [task.task_id]
        );

        const materialCost = Precision.round2(parseFloat(materialCosts[0]?.total) || 0);

        // 计算完工率（基于工序进度）
        const [processProgress] = await connection.execute(
          `
          SELECT 
            COUNT(*) as total_processes,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_processes
          FROM production_processes
          WHERE task_id = ?
        `,
          [task.task_id]
        );

        let completionRate = 0;
        if (processProgress[0].total_processes > 0) {
          completionRate = Precision.round2(
            (processProgress[0].completed_processes / processProgress[0].total_processes) * 100
          );
        } else {
          // 如果没有工序，使用完工数量比例
          if (task.planned_quantity > 0) {
            completionRate = Precision.round2(
              ((task.completed_quantity || 0) / task.planned_quantity) * 100
            );
          }
        }

        // 获取成本配置计算人工和制造费用
        const settings = await this.getCostSettings();

        // 估算人工成本（基于已完成工序的标准工时）
        const [laborData] = await connection.execute(
          `
          SELECT COALESCE(SUM(
            CASE WHEN pp.status = 'completed' 
            THEN COALESCE(ptd.standard_hours, 1) 
            ELSE 0 END
          ), 0) as actual_hours
          FROM production_processes pp
          LEFT JOIN process_template_details ptd ON pp.process_name = ptd.name
          WHERE pp.task_id = ?
        `,
          [task.task_id]
        );

        const actualHours = parseFloat(laborData[0]?.actual_hours) || 0;
        const laborCost = Precision.round2(Precision.mul(actualHours, settings.laborRate));
        
        // 制造费用：统一通过分摊规则引擎计算
        const OverheadAllocationService = require('./OverheadAllocationService');
        const ohResult = await OverheadAllocationService.calculateOverhead({
          productId: task.product_id,
          costCenterId: task.cost_center_id,
          laborCost: laborCost,
          laborHours: actualHours,
          quantity: task.planned_quantity,
          materialCost: materialCost,
          date: new Date().toISOString().split('T')[0],
        });
        const overheadCost = Precision.round2(ohResult.overhead);

        const totalCost = Precision.sumRound2(materialCost, laborCost, overheadCost);

        // 计算约当产量
        const equivalentUnits = Precision.round2(
          Precision.mul(task.planned_quantity || 0, completionRate / 100)
        );

        // 计算 WIP 成本（约当产量法）
        // WIP成本 = 总投入成本 × (1 - 完工率/100)
        const wipFactor = 1 - completionRate / 100;
        const wipMaterialCost = Precision.round2(Precision.mul(materialCost, wipFactor));
        const wipLaborCost = Precision.round2(Precision.mul(laborCost, wipFactor));
        const wipOverheadCost = Precision.round2(Precision.mul(overheadCost, wipFactor));
        const wipTotalCost = Precision.sumRound2(wipMaterialCost, wipLaborCost, wipOverheadCost);

        totalWIPMaterial = Precision.add(totalWIPMaterial, wipMaterialCost);
        totalWIPLabor = Precision.add(totalWIPLabor, wipLaborCost);
        totalWIPOverhead = Precision.add(totalWIPOverhead, wipOverheadCost);

        // 保存 WIP 快照
        await connection.execute(
          `
          INSERT INTO wip_snapshots (
            period_id, snapshot_date, task_id, task_code, product_id, product_name,
            planned_quantity, completed_quantity, material_cost, labor_cost, overhead_cost, total_cost,
            completion_rate, equivalent_units, wip_material_cost, wip_labor_cost, wip_overhead_cost, wip_total_cost
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            material_cost = VALUES(material_cost),
            labor_cost = VALUES(labor_cost),
            overhead_cost = VALUES(overhead_cost),
            total_cost = VALUES(total_cost),
            completion_rate = VALUES(completion_rate),
            equivalent_units = VALUES(equivalent_units),
            wip_material_cost = VALUES(wip_material_cost),
            wip_labor_cost = VALUES(wip_labor_cost),
            wip_overhead_cost = VALUES(wip_overhead_cost),
            wip_total_cost = VALUES(wip_total_cost)
        `,
          [
            actualPeriodId,
            snapDate,
            task.task_id,
            task.task_code,
            task.product_id,
            task.product_name,
            task.planned_quantity,
            task.completed_quantity || 0,
            materialCost,
            laborCost,
            overheadCost,
            totalCost,
            completionRate,
            equivalentUnits,
            wipMaterialCost,
            wipLaborCost,
            wipOverheadCost,
            wipTotalCost,
          ]
        );

        wipDetails.push({
          taskId: task.task_id,
          taskCode: task.task_code,
          productId: task.product_id,
          productName: task.product_name,
          plannedQuantity: task.planned_quantity,
          completedQuantity: task.completed_quantity || 0,
          completionRate,
          equivalentUnits,
          investedCost: { materialCost, laborCost, overheadCost, totalCost },
          wipCost: {
            materialCost: wipMaterialCost,
            laborCost: wipLaborCost,
            overheadCost: wipOverheadCost,
            totalCost: wipTotalCost,
          },
        });
      }

      await connection.commit();

      const totalWIPCost = Precision.sumRound2(totalWIPMaterial, totalWIPLabor, totalWIPOverhead);

      logger.info(
        `[WIP] 期末在制品成本计算完成: 期间=${actualPeriodId}, 任务数=${wipDetails.length}, WIP总成本=${totalWIPCost}`
      );

      return {
        periodId: actualPeriodId,
        snapshotDate: snapDate,
        taskCount: wipDetails.length,
        summary: {
          totalWIPMaterial,
          totalWIPLabor,
          totalWIPOverhead,
          totalWIPCost,
        },
        details: wipDetails,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('[WIP] 计算在制品成本失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 生成在制品凭证（月末结转）
   * 借: 生产成本-期末在制品
   * 贷: 生产成本-本期投入
   *
   * @param {number} periodId 会计期间ID
   * @returns {Promise<Object>} 凭证信息
   */
  static async generateWIPVoucher(periodId) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 获取该期间的 WIP 汇总
      const [wipSummary] = await connection.execute(
        `
        SELECT 
          SUM(wip_material_cost) as total_material,
          SUM(wip_labor_cost) as total_labor,
          SUM(wip_overhead_cost) as total_overhead,
          SUM(wip_total_cost) as total_cost
        FROM wip_snapshots
        WHERE period_id = ?
      `,
        [periodId]
      );

      const totalWIP = Precision.round2(parseFloat(wipSummary[0]?.total_cost) || 0);

      if (totalWIP <= 0) {
        logger.info(`[WIPVoucher] 期间 ${periodId} 无在制品成本，跳过凭证生成`);
        await connection.commit();
        return { skipped: true, reason: '无在制品成本' };
      }

      // 获取科目
      const { accountingConfig } = require('../../config/accountingConfig');
      await accountingConfig.loadFromDatabase(db);

      const productionCostCode = accountingConfig.getAccountCode('PRODUCTION_COST');
      const productionCostAccountId = await this.getAccountIdByCode(connection, productionCostCode);

      if (!productionCostAccountId) {
        throw new Error(`科目配置缺失: 生产成本(${productionCostCode})`);
      }

      // 获取会计期间信息
      const [periodInfo] = await connection.execute(
        'SELECT end_date FROM gl_periods WHERE id = ?',
        [periodId]
      );
      const entryDate = periodInfo[0]?.end_date || new Date().toISOString().split('T')[0];

      // 构建分录（期末 WIP 结转）
      const entryItems = [
        {
          account_id: productionCostAccountId,
          debit_amount: totalWIP,
          credit_amount: 0,
          description: '期末在制品结转-借方',
        },
        {
          account_id: productionCostAccountId,
          debit_amount: 0,
          credit_amount: totalWIP,
          description: '期末在制品结转-贷方（冲销本期投入）',
        },
      ];

      const entryData = {
        entry_date: entryDate,
        posting_date: entryDate, // 过账日期
        period_id: periodId,
        document_type: '期末WIP结转',
        document_number: `WIP-${periodId}`,
        description: '期末在制品成本结转',
        transaction_type: '期末WIP结转', // 业务类型：在制品结转
        transaction_id: periodId, // 关联的会计期间ID
        created_by: 'system', // 系统自动计算
      };

      const entryId = await GLService.createEntry(entryData, entryItems, connection);

      await connection.commit();

      logger.info(
        `[WIPVoucher] 期间 ${periodId} WIP凭证生成成功: 分录ID=${entryId}, 金额=${totalWIP}`
      );

      return {
        success: true,
        entryId,
        totalWIPCost: totalWIP,
      };
    } catch (error) {
      await connection.rollback();
      // 重复条目错误用WARN级别，其他用ERROR
      if (error.code === 'ER_DUP_ENTRY') {
        logger.warn('[WIPVoucher] 凭证已存在，跳过生成');
      } else {
        logger.error('[WIPVoucher] 生成WIP凭证失败:', error);
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  // ===================== 成本差异分摊模块 =====================

  /**
   * 按产品分摊成本差异
   * 差异分摊率 = 产品产量 / 总产量
   *
   * @param {number} periodId 会计期间ID
   * @returns {Promise<Object>} 分摊结果
   */
  static async allocateVariance(periodId) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 获取本期完工产品及其成本
      const [completedProducts] = await connection.execute(
        `
        SELECT 
          pt.product_id,
          m.name as product_name,
          SUM(pt.quantity) as total_quantity,
          SUM(ac.material_cost) as actual_material,
          SUM(ac.labor_cost) as actual_labor,
          SUM(ac.overhead_cost) as actual_overhead,
          SUM(ac.total_cost) as actual_total
        FROM production_tasks pt
        JOIN actual_costs ac ON pt.id = ac.production_order_id
        JOIN materials m ON pt.product_id = m.id
        WHERE pt.status = 'completed'
          AND EXISTS (
            SELECT 1 FROM gl_periods gp 
            WHERE gp.id = ? 
            AND pt.completed_at BETWEEN gp.start_date AND gp.end_date
          )
        GROUP BY pt.product_id, m.name
      `,
        [periodId]
      );

      if (completedProducts.length === 0) {
        logger.info(`[Variance] 期间 ${periodId} 无完工产品，跳过差异分摊`);
        await connection.commit();
        return { skipped: true, reason: '无完工产品' };
      }

      // 计算总产量
      const totalQuantity = completedProducts.reduce(
        (sum, p) => Precision.add(sum, p.total_quantity || 0),
        0
      );

      // 计算各产品的标准成本
      const allocationDetails = [];
      let totalMaterialVariance = 0;
      let totalLaborVariance = 0;
      let totalOverheadVariance = 0;

      for (const product of completedProducts) {
        // 获取标准成本
        const stdCost = await this.calculateStandardCost(
          product.product_id,
          product.total_quantity
        );

        // 计算差异
        const materialVariance = Precision.sub(
          product.actual_material,
          stdCost.standardCost.materialCost
        );
        const laborVariance = Precision.sub(product.actual_labor, stdCost.standardCost.laborCost);
        const overheadVariance = Precision.sub(
          product.actual_overhead,
          stdCost.standardCost.overheadCost
        );
        const totalVariance = Precision.sumRound2(
          materialVariance,
          laborVariance,
          overheadVariance
        );

        // 计算分摊比例
        const allocationRate =
          totalQuantity > 0
            ? Precision.round(Precision.div(product.total_quantity, totalQuantity), 4)
            : 0;

        totalMaterialVariance = Precision.add(totalMaterialVariance, materialVariance);
        totalLaborVariance = Precision.add(totalLaborVariance, laborVariance);
        totalOverheadVariance = Precision.add(totalOverheadVariance, overheadVariance);

        allocationDetails.push({
          productId: product.product_id,
          productName: product.product_name,
          quantity: product.total_quantity,
          allocationRate,
          standardCost: stdCost.standardCost,
          actualCost: {
            materialCost: product.actual_material,
            laborCost: product.actual_labor,
            overheadCost: product.actual_overhead,
            totalCost: product.actual_total,
          },
          variance: {
            material: materialVariance,
            labor: laborVariance,
            overhead: overheadVariance,
            total: totalVariance,
          },
        });
      }

      const totalVarianceAmount = Precision.sumRound2(
        totalMaterialVariance,
        totalLaborVariance,
        totalOverheadVariance
      );

      await connection.commit();

      logger.info(
        `[Variance] 期间 ${periodId} 差异分摊完成: 产品数=${allocationDetails.length}, 总差异=${totalVarianceAmount}`
      );

      return {
        periodId,
        productCount: allocationDetails.length,
        totalQuantity,
        summary: {
          materialVariance: totalMaterialVariance,
          laborVariance: totalLaborVariance,
          overheadVariance: totalOverheadVariance,
          totalVariance: totalVarianceAmount,
        },
        details: allocationDetails,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('[Variance] 成本差异分摊失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 生成销售成本结转凭证
   * 借: 主营业务成本 (6401)
   * 贷: 库存商品 (1406)
   *
   * @param {number} salesId 销售单ID
   * @param {number} productId 产品ID
   * @param {number} quantity 数量
   * @param {number} unitCost 单位成本
   * @param {Object} connection 数据库连接
   * @returns {Promise<Object>} 凭证信息
   */
  static async generateSalesCostVoucher(salesId, productId, quantity, unitCost, connection = null) {
    const conn = connection || (await db.pool.getConnection());
    const shouldManageTransaction = !connection;

    try {
      if (shouldManageTransaction) {
        await conn.beginTransaction();
      }

      const totalCost = Precision.round2(Precision.mul(quantity, unitCost));

      if (totalCost <= 0) {
        if (shouldManageTransaction) await conn.commit();
        return { skipped: true, reason: '成本为0' };
      }

      // 获取产品信息
      const [products] = await conn.execute('SELECT code, name FROM materials WHERE id = ?', [
        productId,
      ]);
      const productName = products[0]?.name || '';

      // 获取科目
      const { accountingConfig } = require('../../config/accountingConfig');
      await accountingConfig.loadFromDatabase(db);

      const cogsCode =
        accountingConfig.getAccountCode('SALES_COST') ||
        accountingConfig.getAccountCode('COST_OF_GOODS_SOLD');
      const finishedGoodsCode =
        accountingConfig.getAccountCode('FINISHED_GOODS') ||
        accountingConfig.getAccountCode('INVENTORY_GOODS');

      const cogsAccountId = await this.getAccountIdByCode(conn, cogsCode);
      const finishedGoodsAccountId = await this.getAccountIdByCode(conn, finishedGoodsCode);

      if (!cogsAccountId || !finishedGoodsAccountId) {
        throw new Error('科目配置缺失: 主营业务成本或库存商品');
      }

      // 获取会计期间
      const entryDate = new Date().toISOString().split('T')[0];
      const periodId = await GLService.getPeriodIdByDate(entryDate);

      // 构建分录
      const entryItems = [
        {
          account_id: cogsAccountId,
          debit_amount: totalCost,
          credit_amount: 0,
          description: `销售成本结转-${productName}`,
        },
        {
          account_id: finishedGoodsAccountId,
          debit_amount: 0,
          credit_amount: totalCost,
          description: `库存商品减少-${productName}`,
        },
      ];

      const entryData = {
        entry_date: entryDate,
        period_id: periodId,
        document_type: 'SALES_COST',
        document_number: `SALE-${salesId}`,
        description: `销售成本结转 - ${productName}`,
        transaction_type: 'SALES_COST', // 业务类型：销售成本
        transaction_id: salesId, // 关联的销售ID
        created_by: 'system',
      };

      const entryId = await GLService.createEntry(entryData, entryItems, conn);

      if (shouldManageTransaction) {
        await conn.commit();
      }

      logger.info(
        `[SalesCost] 销售 ${salesId} 成本结转凭证生成成功: 分录ID=${entryId}, 成本=${totalCost}`
      );

      return {
        success: true,
        entryId,
        totalCost,
        productId,
        quantity,
        unitCost,
      };
    } catch (error) {
      if (shouldManageTransaction) {
        await conn.rollback();
      }
      logger.error(`[SalesCost] 生成销售成本凭证失败 (Sales ${salesId}):`, error);
      throw error;
    } finally {
      if (shouldManageTransaction && conn) {
        conn.release();
      }
    }
  }
}

module.exports = CostAccountingService;

