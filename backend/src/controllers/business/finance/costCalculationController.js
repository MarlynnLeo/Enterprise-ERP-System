/**
 * costCalculationController.js
 * @description 标准成本/实际成本/批量计算/冻结/物料标准成本控制器
 * @date 2026-06-11
 */

const db = require('../../../config/db');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const CostAccountingService = require('../../../services/business/CostAccountingService');
const { parsePagination } = require('../../../utils/safePagination');
const { currentDateString, toLocalDateString } = require('../../../utils/dateUtils');

// ==================== 辅助函数 ====================

/**
 * 保存标准成本快照到 standard_costs 表
 */
const saveStandardCostSnapshot = async (productId, standardCost = {}) => {
  const normalizedProductId = parseInt(productId);
  const connection = await db.pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute('DELETE FROM standard_costs WHERE product_id = ?', [normalizedProductId]);

    const elements = [
      ['material', standardCost.materialCost],
      ['labor', standardCost.laborCost],
      ['overhead', standardCost.overheadCost],
    ];

    for (const [element, amount] of elements) {
      const value = parseFloat(amount) || 0;
      if (value <= 0) continue;

      await connection.execute(
        `INSERT INTO standard_costs
         (product_id, cost_element, standard_price, effective_date, is_active, status, source_type, operator, created_at)
         VALUES (?, ?, ?, CURDATE(), 1, 'active', 'manual', 'system', NOW())`,
        [normalizedProductId, element, value]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  // ==================== 标准成本 ====================

  /**
   * 获取产品标准成本
   */
  getStandardCost: async (req, res) => {
    try {
      const { productId } = req.params;
      const { quantity = 1 } = req.query;

      const result = await CostAccountingService.calculateStandardCost(
        parseInt(productId),
        parseFloat(quantity)
      );

      ResponseHandler.success(res, result);
    } catch (error) {
      logger.error('Failed to calculate standard cost:', error);
      ResponseHandler.error(res, error.message || 'Failed to calculate standard cost', 'SERVER_ERROR', 500);
    }
  },

  calculateAndSaveStandardCost: async (req, res) => {
    try {
      const { productId } = req.params;
      const { quantity = 1, multiLevel = false } = req.body || {};

      const result = await CostAccountingService.calculateStandardCost(
        parseInt(productId),
        parseFloat(quantity),
        { multiLevel }
      );

      const standardCost = result.standardCost || {};
      await saveStandardCostSnapshot(productId, standardCost);

      logger.info(`Standard cost saved: productId=${productId}, totalCost=${standardCost.totalCost || 0}`);
      ResponseHandler.success(res, result);
    } catch (error) {
      logger.error('Failed to calculate and save standard cost:', error);
      ResponseHandler.error(res, error.message || 'Failed to calculate and save standard cost', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 获取标准成本列表
   */
  getStandardCostList: async (req, res) => {
    try {
      const { productName, productCode } = req.query;
      const { page, pageSize, offset } = parsePagination(req.query.page, req.query.pageSize, {
        defaultPageSize: 20,
        maxPageSize: 100,
      });

      let whereClause = "WHERE psc.is_active = 1 AND (psc.status IS NULL OR psc.status = 'active')";
      const params = [];

      if (productName) {
        whereClause += ' AND p.name LIKE ?';
        params.push(`%${productName}%`);
      }
      if (productCode) {
        whereClause += ' AND p.code LIKE ?';
        params.push(`%${productCode}%`);
      }

      // 尝试从standard_costs表获取
      const [rows] = await db.pool.query(
          `
                    SELECT
                        MAX(psc.id) as id,
                        COALESCE(psc.product_id, psc.material_id) as product_id,
                        p.code as product_code,
                        p.name as product_name,
                        SUM(CASE WHEN psc.cost_element = 'material' THEN psc.standard_price ELSE 0 END) as material_cost,
                        SUM(CASE WHEN psc.cost_element = 'labor' THEN psc.standard_price ELSE 0 END) as labor_cost,
                        SUM(CASE WHEN psc.cost_element = 'overhead' THEN psc.standard_price ELSE 0 END) as overhead_cost,
                        SUM(psc.standard_price) as total_cost,
                        SUM(psc.standard_price) as unit_cost,
                        DATE_FORMAT(MAX(psc.effective_date), '%Y-%m-%d') as effective_date,
                        MAX(psc.is_active) as is_active
                    FROM standard_costs psc
                    LEFT JOIN materials p ON COALESCE(psc.product_id, psc.material_id) = p.id
                    ${whereClause}
                    GROUP BY COALESCE(psc.product_id, psc.material_id), p.code, p.name
                    ORDER BY MAX(psc.updated_at) DESC, MAX(psc.id) DESC
                    LIMIT ${pageSize} OFFSET ${offset}
                `,
          params
        );

      const [countResult] = await db.pool.query(
          `
                    SELECT COUNT(DISTINCT COALESCE(psc.product_id, psc.material_id)) as total
                    FROM standard_costs psc
                    LEFT JOIN materials p ON COALESCE(psc.product_id, psc.material_id) = p.id
                    ${whereClause}
                `,
          params
        );

      ResponseHandler.paginated(res, rows, countResult[0].total, page, pageSize, undefined, {
        items: rows,
      });
    } catch (error) {
      logger.error('获取标准成本列表失败:', error);
      ResponseHandler.error(res, '获取标准成本列表失败', 'SERVER_ERROR', 500);
    }
  },

  // ==================== 实际成本 ====================

  /**
   * 获取实际成本
   */
  getActualCost: async (req, res) => {
    try {
      const { productionOrderId } = req.params;

      const result = await CostAccountingService.calculateActualCost(parseInt(productionOrderId));

      ResponseHandler.success(res, result);
    } catch (error) {
      logger.error('获取实际成本失败:', error);
      ResponseHandler.error(res, error.message || '获取实际成本失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 成本差异分析
   */
  analyzeCostVariance: async (req, res) => {
    try {
      const { productionOrderId } = req.params;

      const result = await CostAccountingService.analyzeCostVariance(parseInt(productionOrderId));

      ResponseHandler.success(res, result);
    } catch (error) {
      logger.error('成本差异分析失败:', error);
      ResponseHandler.error(res, error.message || '成本差异分析失败', 'SERVER_ERROR', 500);
    }
  },

  // ==================== 批量成本计算 ====================

  /**
   * 批量计算标准成本
   */
  batchCalculateStandardCost: async (req, res) => {
    try {
      const { productIds, multiLevel = false } = req.body;

      if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return ResponseHandler.error(res, '请提供产品ID列表', 'VALIDATION_ERROR', 400);
      }

      const results = [];
      const errors = [];

      for (const productId of productIds) {
        try {
          const result = await CostAccountingService.calculateStandardCost(parseInt(productId), 1, {
            multiLevel,
          });

          // 保存到数据库
          const sc = result.standardCost || {};
          await saveStandardCostSnapshot(productId, sc);

          results.push({ productId, success: true, totalCost: sc.totalCost });
        } catch (err) {
          errors.push({ productId, success: false, error: err.message });
        }
      }

      logger.info(`批量计算完成: 成功${results.length}个, 失败${errors.length}个`);
      ResponseHandler.success(res, {
        successCount: results.length,
        errorCount: errors.length,
        results,
        errors,
      });
    } catch (error) {
      logger.error('批量计算标准成本失败:', error);
      ResponseHandler.error(res, '批量计算失败', 'SERVER_ERROR', 500);
    }
  },

  // ==================== 成本冻结管理 ====================

  /**
   * 冻结产品成本
   */
  freezeCost: async (req, res) => {
    try {
      const { productId } = req.params;
      const { period } = req.body;
      const frozenBy = req.user?.name || req.user?.username || 'system';

      await db.pool.execute(
        `
                UPDATE standard_costs
                SET is_frozen = 1, frozen_at = NOW(), frozen_by = ?, frozen_period = ?
                WHERE product_id = ? AND is_active = 1
            `,
        [frozenBy, period || null, productId]
      );

      logger.info(`成本已冻结: 产品ID=${productId}, 冻结人=${frozenBy}`);
      ResponseHandler.success(res, { message: '成本冻结成功' });
    } catch (error) {
      logger.error('冻结成本失败:', error);
      ResponseHandler.error(res, '冻结成本失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 解冻产品成本
   */
  unfreezeCost: async (req, res) => {
    try {
      const { productId } = req.params;

      await db.pool.execute(
        `
                UPDATE standard_costs
                SET is_frozen = 0, frozen_at = NULL, frozen_by = NULL
                WHERE product_id = ? AND is_active = 1
            `,
        [productId]
      );

      logger.info(`成本已解冻: 产品ID=${productId}`);
      ResponseHandler.success(res, { message: '成本解冻成功' });
    } catch (error) {
      logger.error('解冻成本失败:', error);
      ResponseHandler.error(res, '解冻成本失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 期末批量冻结成本
   */
  freezePeriodCosts: async (req, res) => {
    try {
      const { period } = req.body;
      const frozenBy = req.user?.name || req.user?.username || 'system';

      if (!period) {
        return ResponseHandler.error(res, '请指定冻结期间', 'VALIDATION_ERROR', 400);
      }

      const [result] = await db.pool.execute(
        `
                UPDATE standard_costs
                SET is_frozen = 1, frozen_at = NOW(), frozen_by = ?, frozen_period = ?
                WHERE is_active = 1 AND (is_frozen = 0 OR is_frozen IS NULL)
            `,
        [frozenBy, period]
      );

      logger.info(`期末成本冻结完成: 期间=${period}, 冻结数量=${result.affectedRows}`);
      ResponseHandler.success(res, {
        message: '期末成本冻结完成',
        frozenCount: result.affectedRows,
        period,
      });
    } catch (error) {
      logger.error('期末冻结成本失败:', error);
      ResponseHandler.error(res, '期末冻结失败', 'SERVER_ERROR', 500);
    }
  },

  // ==================== 实际成本列表/详情 ====================

  /**
   * 获取实际成本列表
   */
  getActualCostList: async (req, res) => {
    try {
      const { orderNumber, productName, startDate, endDate, page = 1, pageSize = 20 } = req.query;
      const pagination = parsePagination(page, pageSize, {
        defaultPageSize: 20,
        maxPageSize: 100,
      });

      let whereClause = '1=1';
      const params = [];

      if (orderNumber) {
        whereClause += ' AND pt.code LIKE ?';
        params.push(`%${orderNumber}%`);
      }
      if (productName) {
        whereClause += ' AND m.name LIKE ?';
        params.push(`%${productName}%`);
      }
      if (startDate) {
        whereClause += ' AND ac.calculated_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        whereClause += ' AND ac.calculated_at <= ?';
        params.push(endDate);
      }

      // 查询总数
      const [countResult] = await db.pool.execute(
        `
                SELECT COUNT(*) as total
                FROM actual_costs ac
                JOIN production_tasks pt ON ac.production_order_id = pt.id
                LEFT JOIN materials m ON pt.product_id = m.id
                WHERE ${whereClause}
            `,
        params
      );

      // 查询列表
      const [list] = await db.pool.execute(
        `
                SELECT
                    ac.id,
                    pt.code as order_number,
                    m.code as product_code,
                    m.name as product_name,
                    ac.quantity,
                    ac.material_cost,
                    ac.labor_cost,
                    ac.overhead_cost,
                    ac.total_cost,
                    ROUND(ac.total_cost / NULLIF(ac.quantity, 0), 2) as unit_cost,
                    DATE_FORMAT(ac.calculated_at, '%Y-%m-%d') as completion_date,
                    IFNULL((SELECT costing_method FROM cost_settings WHERE is_active = 1 LIMIT 1), 'weighted_average') as costing_method
                FROM actual_costs ac
                JOIN production_tasks pt ON ac.production_order_id = pt.id
                LEFT JOIN materials m ON pt.product_id = m.id
                WHERE ${whereClause}
                ORDER BY ac.calculated_at DESC
                LIMIT ${pagination.pageSize} OFFSET ${pagination.offset}
            `,
        params
      );

      ResponseHandler.paginated(res, list, countResult[0].total, pagination.page, pagination.pageSize);
    } catch (error) {
      logger.error('获取实际成本列表失败:', error);
      ResponseHandler.error(res, '获取实际成本列表失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 获取实际成本详情
   */
  getActualCostDetail: async (req, res) => {
    try {
      const { taskId } = req.params;

      // 获取成本主信息 - 支持通过ac.id或production_order_id查询
      const [costInfo] = await db.pool.execute(
        `
                SELECT
                    ac.id,
                    ac.production_order_id as production_task_id,
                    pt.product_id as product_id,
                    pt.code as order_number,
                    m.code as product_code,
                    m.name as product_name,
                    ac.quantity,
                    ac.material_cost,
                    ac.labor_cost,
                    ac.overhead_cost,
                    ac.total_cost,
                    ROUND(ac.total_cost / NULLIF(ac.quantity, 0), 2) as unit_cost,
                    DATE_FORMAT(ac.calculated_at, '%Y-%m-%d') as completion_date,
                    IFNULL((SELECT costing_method FROM cost_settings WHERE is_active = 1 LIMIT 1), 'weighted_average') as costing_method
                FROM actual_costs ac
                JOIN production_tasks pt ON ac.production_order_id = pt.id
                LEFT JOIN materials m ON pt.product_id = m.id
                WHERE ac.id = ? OR ac.production_order_id = ?
                LIMIT 1
            `,
        [taskId, taskId]
      );

      if (costInfo.length === 0) {
        return ResponseHandler.error(res, '未找到成本记录', 'NOT_FOUND', 404);
      }

      const prodTaskId = costInfo[0].production_task_id;
      const taskCode = costInfo[0].order_number; // 任务编号用于匹配凭证
      // 🔥 从实际出库记录获取材料明细（包含补料）
      let materialDetails = [];
      try {
        const materialMovements = await CostAccountingService.collectTaskMaterialMovements(
          db.pool,
          [prodTaskId]
        );
        const detailMap = new Map();

        for (const movement of materialMovements) {
          const key = `${movement.material_id}:${movement.movement_type}`;
          const current = detailMap.get(key) || {
            material_code: movement.material_code,
            material_name: movement.material_name,
            quantity: 0,
            total_cost: 0,
            batch_number: '-',
            issue_date: null,
            issue_type: movement.movement_type === 'return' ? '生产退料' : '生产领料',
            document_numbers: new Set(),
          };

          const quantity = parseFloat(movement.quantity) || 0;
          const totalCost = parseFloat(movement.total_cost) || 0;
          current.quantity += quantity;
          current.total_cost += totalCost;
          if (!current.issue_date || movement.issue_date > current.issue_date) {
            current.issue_date = movement.issue_date;
          }
          if (movement.documentNo) current.document_numbers.add(movement.documentNo);
          detailMap.set(key, current);
        }

        materialDetails = [...detailMap.values()]
          .map((item) => ({
            ...item,
            quantity: Math.round(item.quantity * 10000) / 10000,
            unit_cost:
              Math.abs(item.quantity) > 0
                ? Math.round((Math.abs(item.total_cost) / Math.abs(item.quantity)) * 10000) / 10000
                : 0,
            total_cost: Math.round(item.total_cost * 100) / 100,
            issue_date: item.issue_date ? toLocalDateString(item.issue_date) : null,
            document_numbers: [...item.document_numbers].join(', '),
          }))
          .sort((a, b) => String(a.material_code || '').localeCompare(String(b.material_code || '')));
        logger.info(
          `[实际成本详情] 任务 ${prodTaskId} 找到 ${materialDetails.length} 条材料消耗记录`
        );
      } catch (e) {
        logger.warn('从出库记录获取材料明细失败:', e.message);
      }

      // 获取关联凭证信息 - 使用transaction_id精确匹配或document_number兜底
      let relatedVouchers = [];
      try {
        const [vouchers] = await db.pool.execute(
          `
                    SELECT
                        ge.id,
                        ge.entry_number,
                        ge.document_number,
                        ge.description,
                        ge.entry_date,
                        ge.status,
                        ge.is_posted,
                        ge.transaction_type,
                        (SELECT SUM(debit_amount) FROM gl_entry_items WHERE entry_id = ge.id) as total_amount
                    FROM gl_entries ge
                    WHERE (ge.transaction_type IN (
                              'PRODUCTION_MATERIAL',
                              'PRODUCTION_LABOR',
                              'PRODUCTION_OVERHEAD',
                              'PRODUCTION_COMPLETE'
                          ) AND ge.transaction_id = ?)
                       OR ge.document_number = ?
                       OR ge.document_number LIKE ?
                     ORDER BY ge.entry_date, ge.id
                 `,
          [prodTaskId, taskCode, `${taskCode}-%`]
        );
        relatedVouchers = vouchers;
      } catch (err) {
        logger.warn('获取关联凭证失败:', err);
      }

      // 如果没有BOM数据，使用估算汇总
      if (materialDetails.length === 0) {
        materialDetails = [
          {
            material_code: '-',
            material_name: '材料汇总',
            quantity: costInfo[0].quantity,
            unit_cost:
              costInfo[0].quantity > 0
                ? Math.round((costInfo[0].material_cost / costInfo[0].quantity) * 100) / 100
                : 0,
            total_cost: costInfo[0].material_cost,
            batch_number: '-',
            issue_date: costInfo[0].completion_date,
          },
        ];
      }

      // 获取人工工时明细（从报工记录读取真实数据）
      const settings = await CostAccountingService.getCostSettings();
      const laborRate = settings.laborRate;

      const [laborRecords] = await db.pool.execute(
        `SELECT
            COALESCE(process_name, '生产车间') as workstation,
            operator_name as operator,
            work_hours,
            ${laborRate} as hourly_rate,
            ROUND(work_hours * ${laborRate}, 2) as total_cost,
            DATE_FORMAT(report_time, '%Y-%m-%d') as work_date
         FROM production_reports
         WHERE task_id = ? AND work_hours > 0`,
        [prodTaskId]
      );
      const laborDetails = laborRecords;

      // 制造费用明细：直接从分摊规则表读取该产品适用的规则
      const calcDate = currentDateString();
      const prodId = costInfo[0].product_id;
      const [ohRules] = await db.pool.execute(
        `SELECT name, allocation_base, rate FROM overhead_allocation_config
         WHERE is_active = 1 AND effective_date <= ? AND (expiry_date IS NULL OR expiry_date >= ?)
           AND (product_id = ? OR product_id IS NULL)
         ORDER BY ISNULL(product_id) ASC, priority DESC`,
        [calcDate, calcDate, prodId]
      );

      const overheadDetails = ohRules.map(rule => ({
        rule_name: rule.name,
        allocation_base: rule.allocation_base,
        rate: parseFloat(rule.rate),
        base_cost: costInfo[0].labor_cost,
        calculated_cost: costInfo[0].overhead_cost,
      }));

      ResponseHandler.success(res, {
        ...costInfo[0],
        material_details: materialDetails,
        labor_details: laborDetails,
        overhead_details: overheadDetails,
        related_vouchers: relatedVouchers,
      });
    } catch (error) {
      logger.error('获取实际成本详情失败:', error);
      ResponseHandler.error(res, '获取实际成本详情失败', 'SERVER_ERROR', 500);
    }
  },

  // ==================== 物料标准成本管理 (期初冻结) ====================

  /**
   * 获取物料标准成本列表
   */
  getMaterialStandardCosts: async (req, res) => {
    try {
      const { is_active, material_code, material_name } = req.query;
      const { page, pageSize, offset } = parsePagination(req.query.page, req.query.pageSize, {
        defaultPageSize: 20,
        maxPageSize: 100,
      });

      let whereClause = '1=1';
      const params = [];

      if (is_active !== undefined && is_active !== '') {
        whereClause += ' AND sc.is_active = ?';
        params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
      }
      if (material_code) {
        whereClause += ' AND m.code LIKE ?';
        params.push(`%${material_code}%`);
      }
      if (material_name) {
        whereClause += ' AND m.name LIKE ?';
        params.push(`%${material_name}%`);
      }

      // 获取总数
      const [countResult] = await db.pool.execute(
        `
                SELECT COUNT(*) as total
                FROM standard_costs sc
                LEFT JOIN materials m ON sc.material_id = m.id
                WHERE ${whereClause} AND sc.material_id IS NOT NULL
            `,
        params
      );

      // 获取列表
      const [list] = await db.pool.execute(
        `
                SELECT
                    sc.id,
                    sc.material_id,
                    m.code as material_code,
                    m.name as material_name,
                    m.specs,
                    m.cost_price as current_cost_price,
                    sc.standard_price,
                    DATE_FORMAT(sc.effective_date, '%Y-%m-%d') as effective_date,
                    DATE_FORMAT(sc.expiry_date, '%Y-%m-%d') as expiry_date,
                    sc.is_active,
                    DATE_FORMAT(sc.created_at, '%Y-%m-%d %H:%i') as created_at,
                    DATE_FORMAT(sc.updated_at, '%Y-%m-%d %H:%i') as updated_at
                FROM standard_costs sc
                LEFT JOIN materials m ON sc.material_id = m.id
                WHERE ${whereClause} AND sc.material_id IS NOT NULL
                ORDER BY sc.created_at DESC
                LIMIT ${pageSize} OFFSET ${offset}
            `,
        params
      );

      ResponseHandler.paginated(res, list, countResult[0].total, page, pageSize);
    } catch (error) {
      logger.error('获取物料标准成本列表失败:', error);
      ResponseHandler.error(res, '获取物料标准成本列表失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 批量冻结物料标准成本
   * 从materials.cost_price读取当前采购成本，写入standard_costs表
   */
  freezeMaterialStandardCosts: async (req, res) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const {
        effective_date,
        expiry_date = null,
        source = 'cost_price', // 'cost_price' 或 'manual'
        materials = [], // 仅当source='manual'时使用
      } = req.body;

      if (!effective_date) {
        await connection.rollback();
        return ResponseHandler.error(res, '生效日期不能为空', 'VALIDATION_ERROR', 400);
      }

      let frozenCount = 0;
      let skippedCount = 0;

      if (source === 'cost_price') {
        // 从materials.cost_price自动读取所有物料的当前采购成本
        const [materialList] = await connection.execute(`
                    SELECT id, code, name, cost_price, price
                    FROM materials
                    WHERE status = 1 AND (cost_price > 0 OR price > 0)
                `);

        for (const mat of materialList) {
          const standardPrice = mat.cost_price || mat.price || 0;
          if (standardPrice <= 0) {
            skippedCount++;
            continue;
          }

          // 先将该物料的旧标准成本设为失效
          await connection.execute(
            `
                        UPDATE standard_costs
                        SET is_active = 0, status = 'archived', expiry_date = DATE_SUB(?, INTERVAL 1 DAY)
                        WHERE material_id = ? AND is_active = 1 AND cost_element = 'material'
                    `,
            [effective_date, mat.id]
          );

          // 插入新的标准成本
          await connection.execute(
            `
                        INSERT INTO standard_costs
                        (material_id, cost_element, standard_price, effective_date, expiry_date, is_active, status, source_type, operator)
                        VALUES (?, 'material', ?, ?, ?, 1, 'active', 'manual', 'system')
                    `,
            [mat.id, standardPrice, effective_date, expiry_date]
          );

          frozenCount++;
        }
      } else if (source === 'manual' && Array.isArray(materials) && materials.length > 0) {
        // 手动指定物料和价格
        for (const item of materials) {
          if (!item.material_id || !item.standard_price || item.standard_price <= 0) {
            skippedCount++;
            continue;
          }

          // 先将该物料的旧标准成本设为失效
          await connection.execute(
            `
                        UPDATE standard_costs
                        SET is_active = 0, status = 'archived', expiry_date = DATE_SUB(?, INTERVAL 1 DAY)
                        WHERE material_id = ? AND is_active = 1 AND cost_element = 'material'
                    `,
            [effective_date, item.material_id]
          );

          // 插入新的标准成本
          await connection.execute(
            `
                        INSERT INTO standard_costs
                        (material_id, cost_element, standard_price, effective_date, expiry_date, is_active, status, source_type, operator)
                        VALUES (?, 'material', ?, ?, ?, 1, 'active', 'manual', 'system')
                    `,
            [item.material_id, item.standard_price, effective_date, expiry_date]
          );

          frozenCount++;
        }
      } else {
        await connection.rollback();
        return ResponseHandler.error(res, '无效的数据来源或物料列表为空', 'VALIDATION_ERROR', 400);
      }

      await connection.commit();

      logger.info(`物料标准成本冻结完成: 成功=${frozenCount}, 跳过=${skippedCount}`);
      ResponseHandler.success(res, {
        message: '物料标准成本冻结完成',
        frozenCount,
        skippedCount,
        effective_date,
      });
    } catch (error) {
      await connection.rollback();
      logger.error('批量冻结物料标准成本失败:', error);
      ResponseHandler.error(res, '批量冻结物料标准成本失败: ' + error.message, 'SERVER_ERROR', 500);
    } finally {
      connection.release();
    }
  },

  /**
   * 更新单个物料标准成本
   */
  updateMaterialStandardCost: async (req, res) => {
    try {
      const { id } = req.params;
      const { standard_price, effective_date, expiry_date, is_active } = req.body;

      if (!id) {
        return ResponseHandler.error(res, '标准成本ID不能为空', 'VALIDATION_ERROR', 400);
      }

      // 构建更新字段
      const updateFields = [];
      const params = [];

      if (standard_price !== undefined) {
        updateFields.push('standard_price = ?');
        params.push(standard_price);
      }
      if (effective_date !== undefined) {
        updateFields.push('effective_date = ?');
        params.push(effective_date);
      }
      if (expiry_date !== undefined) {
        updateFields.push('expiry_date = ?');
        params.push(expiry_date || null);
      }
      if (is_active !== undefined) {
        updateFields.push('is_active = ?');
        params.push(is_active ? 1 : 0);
        updateFields.push('status = ?');
        params.push(is_active ? 'active' : 'archived');
      }

      if (updateFields.length === 0) {
        return ResponseHandler.error(res, '没有需要更新的字段', 'VALIDATION_ERROR', 400);
      }

      params.push(id);
      await db.pool.execute(
        `
                UPDATE standard_costs
                SET ${updateFields.join(', ')}
                WHERE id = ?
            `,
        params
      );

      ResponseHandler.success(res, { message: '物料标准成本更新成功' });
    } catch (error) {
      logger.error('更新物料标准成本失败:', error);
      ResponseHandler.error(res, '更新物料标准成本失败', 'SERVER_ERROR', 500);
    }
  },
};
