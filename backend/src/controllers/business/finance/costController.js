/**
 * costController.js
 * @description 成本核算控制器
 * @date 2026-01-24
 * @version 1.0.0
 */

const db = require('../../../config/db');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const CostAccountingService = require('../../../services/business/CostAccountingService');

const costController = {
  /**
   * 获取期末在制品(WIP)报告
   */
  getWIPReport: async (req, res) => {
    try {
      const { period } = req.query;
      const result = await CostAccountingService.calculatePeriodWIP(period);
      ResponseHandler.success(res, result);
    } catch (error) {
      logger.error('获取WIP报告失败:', error);
      ResponseHandler.error(res, '获取WIP报告失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 获取委外在途成本报告
   */
  getOutsourcedWIPReport: async (req, res) => {
    try {
      const { period } = req.query;
      const result = await CostAccountingService.calculateOutsourcedWIP(period);
      ResponseHandler.success(res, result);
    } catch (error) {
      logger.error('获取委外在途成本报告失败:', error);
      ResponseHandler.error(res, '获取委外在途成本报告失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 获取成本统计数据
   * 返回本月材料成本、人工成本、制造费用汇总
   */
  getCostStatistics: async (req, res) => {
    try {
      const { period } = req.query;

      // 获取当前月份范围
      const now = new Date();
      const year = period ? period.split('-')[0] : now.getFullYear();
      const month = period ? period.split('-')[1] : String(now.getMonth() + 1).padStart(2, '0');
      const startDate = `${year}-${month}-01`;
      const endDate = `${year}-${month}-31`;

      // 查询本月生产成本汇总
      let stats = { totalCost: 0, materialCost: 0, laborCost: 0, overheadCost: 0 };

      try {
        const [costData] = await db.pool.execute(
          `
                    SELECT 
                      COALESCE(SUM(material_cost), 0) as materialCost,
                      COALESCE(SUM(labor_cost), 0) as laborCost,
                      COALESCE(SUM(overhead_cost), 0) as overheadCost,
                      COALESCE(SUM(total_cost), 0) as totalCost
                    FROM actual_costs
                    WHERE calculated_at BETWEEN ? AND ?
                `,
          [startDate, endDate]
        );
        stats = costData[0];
      } catch {
        // actual_costs表可能不存在，忽略
      }

      // 如果没有数据，从WIP快照获取
      if (parseFloat(stats.totalCost) === 0) {
        const [wipData] = await db.pool.execute(
          `
                    SELECT 
                      COALESCE(SUM(material_cost), 0) as materialCost,
                      COALESCE(SUM(labor_cost), 0) as laborCost,
                      COALESCE(SUM(overhead_cost), 0) as overheadCost,
                      COALESCE(SUM(total_cost), 0) as totalCost
                    FROM wip_snapshots
                    WHERE snapshot_date BETWEEN ? AND ?
                `,
          [startDate, endDate]
        );

        if (parseFloat(wipData[0].totalCost) > 0) {
          stats = wipData[0];
        }
      }

      // 如果还是没有数据，获取最新的WIP快照汇总
      if (parseFloat(stats.totalCost) === 0) {
        const [latestWIP] = await db.pool.execute(`
                    SELECT 
                      COALESCE(SUM(material_cost), 0) as materialCost,
                      COALESCE(SUM(labor_cost), 0) as laborCost,
                      COALESCE(SUM(overhead_cost), 0) as overheadCost,
                      COALESCE(SUM(total_cost), 0) as totalCost
                    FROM wip_snapshots
                    WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM wip_snapshots)
                `);

        if (parseFloat(latestWIP[0].totalCost) > 0) {
          stats = latestWIP[0];
        }
      }

      ResponseHandler.success(res, {
        period: `${year}-${month}`,
        totalCost: parseFloat(stats.totalCost) || 0,
        materialCost: parseFloat(stats.materialCost) || 0,
        laborCost: parseFloat(stats.laborCost) || 0,
        overheadCost: parseFloat(stats.overheadCost) || 0,
      });
    } catch (error) {
      logger.error('获取成本统计失败:', error);
      ResponseHandler.error(res, '获取成本统计失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 获取成本趋势数据
   * 返回近6个月成本变化趋势
   */
  getCostTrend: async (req, res) => {
    try {
      const { months = 6 } = req.query;

      // 生成近N个月的月份列表
      const trendData = [];
      const now = new Date();

      for (let i = parseInt(months) - 1; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const startDate = `${year}-${month}-01`;
        const lastDay = new Date(year, date.getMonth() + 1, 0).getDate();
        const endDate = `${year}-${month}-${lastDay}`;

        let monthStats = { totalCost: 0, materialCost: 0, laborCost: 0, overheadCost: 0 };

        // 首先尝试从 actual_costs 获取
        try {
          const [costData] = await db.pool.execute(
            `
                        SELECT 
                          COALESCE(SUM(material_cost), 0) as materialCost,
                          COALESCE(SUM(labor_cost), 0) as laborCost,
                          COALESCE(SUM(overhead_cost), 0) as overheadCost,
                          COALESCE(SUM(total_cost), 0) as totalCost
                        FROM actual_costs
                        WHERE calculated_at BETWEEN ? AND ?
                    `,
            [startDate, endDate]
          );
          monthStats = costData[0];
        } catch {
          // 表可能不存在
        }

        // 如果没有数据，从WIP快照获取
        if (parseFloat(monthStats.totalCost) === 0) {
          const [wipData] = await db.pool.execute(
            `
                        SELECT 
                          COALESCE(SUM(material_cost), 0) as materialCost,
                          COALESCE(SUM(labor_cost), 0) as laborCost,
                          COALESCE(SUM(overhead_cost), 0) as overheadCost,
                          COALESCE(SUM(total_cost), 0) as totalCost
                        FROM wip_snapshots
                        WHERE snapshot_date BETWEEN ? AND ?
                    `,
            [startDate, endDate]
          );

          if (parseFloat(wipData[0].totalCost) > 0) {
            monthStats = wipData[0];
          }
        }

        trendData.push({
          month: `${month}月`,
          period: `${year}-${month}`,
          totalCost: parseFloat(monthStats.totalCost) || 0,
          materialCost: parseFloat(monthStats.materialCost) || 0,
          laborCost: parseFloat(monthStats.laborCost) || 0,
          overheadCost: parseFloat(monthStats.overheadCost) || 0,
        });
      }

      ResponseHandler.success(res, { trend: trendData });
    } catch (error) {
      logger.error('获取成本趋势失败:', error);
      ResponseHandler.error(res, '获取成本趋势失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 获取成本构成数据
   * 返回材料/人工/制造费用占比
   */
  getCostComposition: async (req, res) => {
    try {
      const { period } = req.query;

      // 获取当前月份范围
      const now = new Date();
      const year = period ? period.split('-')[0] : now.getFullYear();
      const month = period ? period.split('-')[1] : String(now.getMonth() + 1).padStart(2, '0');
      const startDate = `${year}-${month}-01`;
      const endDate = `${year}-${month}-31`;

      let composition = { materialCost: 0, laborCost: 0, overheadCost: 0 };

      // 先尝试从 actual_costs 获取
      try {
        const [costData] = await db.pool.execute(
          `
                    SELECT 
                      COALESCE(SUM(material_cost), 0) as materialCost,
                      COALESCE(SUM(labor_cost), 0) as laborCost,
                      COALESCE(SUM(overhead_cost), 0) as overheadCost
                    FROM actual_costs
                    WHERE calculated_at BETWEEN ? AND ?
                `,
          [startDate, endDate]
        );
        composition = costData[0];
      } catch {
        // 表可能不存在
      }

      // 如果没有数据，从WIP快照获取
      if (parseFloat(composition.materialCost) === 0 && parseFloat(composition.laborCost) === 0) {
        const [wipData] = await db.pool.execute(
          `
                    SELECT 
                      COALESCE(SUM(material_cost), 0) as materialCost,
                      COALESCE(SUM(labor_cost), 0) as laborCost,
                      COALESCE(SUM(overhead_cost), 0) as overheadCost
                    FROM wip_snapshots
                    WHERE snapshot_date BETWEEN ? AND ?
                `,
          [startDate, endDate]
        );

        if (parseFloat(wipData[0].materialCost) > 0 || parseFloat(wipData[0].laborCost) > 0) {
          composition = wipData[0];
        }
      }

      // 如果还是没有数据，获取最新的WIP快照
      if (parseFloat(composition.materialCost) === 0 && parseFloat(composition.laborCost) === 0) {
        const [latestWIP] = await db.pool.execute(`
                    SELECT 
                      COALESCE(SUM(material_cost), 0) as materialCost,
                      COALESCE(SUM(labor_cost), 0) as laborCost,
                      COALESCE(SUM(overhead_cost), 0) as overheadCost
                    FROM wip_snapshots
                    WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM wip_snapshots)
                `);

        if (parseFloat(latestWIP[0].materialCost) > 0 || parseFloat(latestWIP[0].laborCost) > 0) {
          composition = latestWIP[0];
        }
      }

      ResponseHandler.success(res, {
        period: `${year}-${month}`,
        composition: [
          { name: '材料成本', value: parseFloat(composition.materialCost) || 0 },
          { name: '人工成本', value: parseFloat(composition.laborCost) || 0 },
          { name: '制造费用', value: parseFloat(composition.overheadCost) || 0 },
        ],
      });
    } catch (error) {
      logger.error('获取成本构成失败:', error);
      ResponseHandler.error(res, '获取成本构成失败', 'SERVER_ERROR', 500);
    }
  },

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

      // 保存标准成本到数据库
      try {
        // result.standardCost 包含 materialCost, laborCost, overheadCost, totalCost, unitCost
        const sc = result.standardCost || {};
        const connection = await db.pool.getConnection();
        try {
          await connection.beginTransaction();
          // 删除属于该产品的旧标准成本
          await connection.execute('DELETE FROM standard_costs WHERE product_id = ?', [productId]);

          if (sc.materialCost > 0) {
            await connection.execute(
              'INSERT INTO standard_costs (product_id, cost_element, standard_price, effective_date, is_active, created_at) VALUES (?, ?, ?, CURDATE(), 1, NOW())',
              [productId, 'material', sc.materialCost]
            );
          }
          if (sc.laborCost > 0) {
            await connection.execute(
              'INSERT INTO standard_costs (product_id, cost_element, standard_price, effective_date, is_active, created_at) VALUES (?, ?, ?, CURDATE(), 1, NOW())',
              [productId, 'labor', sc.laborCost]
            );
          }
          if (sc.overheadCost > 0) {
            await connection.execute(
              'INSERT INTO standard_costs (product_id, cost_element, standard_price, effective_date, is_active, created_at) VALUES (?, ?, ?, CURDATE(), 1, NOW())',
              [productId, 'overhead', sc.overheadCost]
            );
          }
          await connection.commit();
          logger.info(`标准成本已保存: 产品ID=${productId}, 总成本=${sc.totalCost}`);
        } catch (saveError) {
          await connection.rollback();
          throw saveError;
        } finally {
          connection.release();
        }
      } catch (saveError) {
        logger.warn('保存标准成本失败:', saveError.message);
      }

      ResponseHandler.success(res, result);
    } catch (error) {
      logger.error('获取标准成本失败:', error);
      ResponseHandler.error(res, error.message || '获取标准成本失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 获取标准成本列表
   */
  getStandardCostList: async (req, res) => {
    try {
      const { page = 1, pageSize = 20, productName, productCode } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(pageSize);

      let whereClause = 'WHERE psc.is_active = 1';
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
                    LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}
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

      ResponseHandler.success(res, {
        items: rows,
        total: countResult[0].total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      });
    } catch (error) {
      logger.error('获取标准成本列表失败:', error.stack || error.message);
      ResponseHandler.error(res, '获取标准成本列表失败', 'SERVER_ERROR', 500);
    }
  },

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

  /**
   * 获取成本设置
   */
  getCostSettings: async (req, res) => {
    try {
      const [settings] = await db.pool.execute(
        `SELECT id, setting_name, overhead_rate, labor_rate, costing_method, 
                wage_payment_method, piece_rate, overhead_allocation_rules,
                fallback_material_ratio, fallback_labor_ratio, fallback_overhead_ratio,
                is_active, description, created_at, updated_at
         FROM cost_settings 
         WHERE is_active = 1 
         ORDER BY id DESC LIMIT 1`
      );

      if (settings.length === 0) {
        return ResponseHandler.error(
          res,
          '系统成本基础配置缺失，请先完成初始化配置',
          'CONFIG_MISSING',
          404
        );
      }

      const s = settings[0];
      ResponseHandler.success(res, {
        id: s.id,
        settingName: s.setting_name,
        overheadRate: parseFloat(s.overhead_rate),
        laborRate: parseFloat(s.labor_rate),
        costingMethod: s.costing_method,
        wagePaymentMethod: s.wage_payment_method,
        pieceRate: parseFloat(s.piece_rate),
        isActive: Boolean(s.is_active),
        description: s.description || '',
        overheadAllocationRules: s.overhead_allocation_rules || [],
        fallbackMaterialRatio: parseFloat(s.fallback_material_ratio),
        fallbackLaborRatio: parseFloat(s.fallback_labor_ratio),
        fallbackOverheadRatio: parseFloat(s.fallback_overhead_ratio),
        updatedAt: s.updated_at ? new Date(s.updated_at).toLocaleString('zh-CN') : '',
      });
    } catch (error) {
      logger.error('获取成本设置失败:', error);
      ResponseHandler.error(res, '获取成本设置失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 保存成本设置
   */
  saveCostSettings: async (req, res) => {
    try {
      const {
        overheadRate,
        laborRate,
        costingMethod,
        description,
        wagePaymentMethod,
        pieceRate,
        overheadAllocationRules,
        fallbackMaterialRatio,
        fallbackLaborRatio,
        fallbackOverheadRatio,
      } = req.body;

      // 验证参数
      if (overheadRate === undefined || laborRate === undefined) {
        return ResponseHandler.error(res, '请提供制造费用分摊率和人工费率', 'INVALID_PARAMS', 400);
      }

      // 校验拆分比例（三项之和必须等于 1.0）
      const mr = parseFloat(fallbackMaterialRatio);
      const lr = parseFloat(fallbackLaborRatio);
      const or = parseFloat(fallbackOverheadRatio);
      if (isNaN(mr) || isNaN(lr) || isNaN(or)) {
        return ResponseHandler.error(res, '请提供完整的成本拆分比例', 'INVALID_PARAMS', 400);
      }
      if (Math.abs((mr + lr + or) - 1.0) > 0.001) {
        return ResponseHandler.error(res, `成本拆分比例之和必须等于1.0（当前: ${(mr + lr + or).toFixed(4)}）`, 'INVALID_PARAMS', 400);
      }

      // 检查是否存在激活的设置
      const [existing] = await db.pool.execute(
        'SELECT id FROM cost_settings WHERE is_active = 1 LIMIT 1'
      );

      if (existing.length > 0) {
        // 保存当前设置到历史表
        try {
          const [currentSettings] = await db.pool.execute(
            'SELECT * FROM cost_settings WHERE id = ?',
            [existing[0].id]
          );
          if (currentSettings.length > 0) {
            const cs = currentSettings[0];
            await db.pool.execute(
              `INSERT INTO cost_settings_history 
                             (settings_id, setting_name, overhead_rate, labor_rate, costing_method, 
                              wage_payment_method, piece_rate, overhead_allocation_rules,
                              effective_from, effective_to, changed_by, change_reason)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), ?, ?)`,
              [
                cs.id,
                cs.setting_name,
                cs.overhead_rate,
                cs.labor_rate,
                cs.costing_method,
                cs.wage_payment_method || 'hourly',
                cs.piece_rate || 0,
                cs.overhead_allocation_rules || null,
                cs.updated_at ? cs.updated_at.toISOString().split('T')[0] : '2020-01-01',
                req.user?.name || 'system',
                '费率变更',
              ]
            );
          }
        } catch (historyError) {
          logger.warn('保存费率历史失败:', historyError.message);
        }

        // 更新现有设置
        await db.pool.execute(
          `UPDATE cost_settings 
                     SET overhead_rate = ?, labor_rate = ?, costing_method = ?, 
                         wage_payment_method = ?, piece_rate = ?, overhead_allocation_rules = ?,
                         fallback_material_ratio = ?, fallback_labor_ratio = ?, fallback_overhead_ratio = ?,
                         description = ?, updated_at = NOW()
                     WHERE id = ?`,
          [
            parseFloat(overheadRate),
            parseFloat(laborRate),
            costingMethod || 'weighted_average',
            wagePaymentMethod || 'hourly',
            parseFloat(pieceRate) || 0,
            JSON.stringify(overheadAllocationRules || []),
            mr,
            lr,
            or,
            description || '',
            existing[0].id,
          ]
        );
        logger.info(
          `成本设置已更新: 人工费率=${laborRate}, 制造费用率=${overheadRate}, 计薪=${wagePaymentMethod}`
        );
      } else {
        // 创建新设置
        await db.pool.execute(
          `INSERT INTO cost_settings 
                     (setting_name, overhead_rate, labor_rate, costing_method, wage_payment_method, piece_rate, overhead_allocation_rules, is_active, description, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
          [
            '默认成本配置',
            parseFloat(overheadRate),
            parseFloat(laborRate),
            costingMethod || 'weighted_average',
            wagePaymentMethod || 'hourly',
            parseFloat(pieceRate) || 0,
            JSON.stringify(overheadAllocationRules || []),
            description || '',
          ]
        );
        logger.info(
          `成本设置已创建: 人工费率=${laborRate}, 制造费用率=${overheadRate}, 计薪=${wagePaymentMethod}`
        );
      }

      // 热重载SSOT配置，确保内存中的配置树立即生效
      try {
        const globalConfigManager = require('../../../config/globalConfig');
        await globalConfigManager.reload();
        logger.info('SSOT 配置树已热重载');
      } catch (reloadErr) {
        logger.warn('SSOT 配置热重载失败:', reloadErr.message);
      }

      ResponseHandler.success(res, { message: '成本设置保存成功' });
    } catch (error) {
      logger.error('保存成本设置失败:', error);
      ResponseHandler.error(res, '保存成本设置失败', 'SERVER_ERROR', 500);
    }
  },

  // ==================== 成本中心管理 ====================

  /**
   * 获取成本中心列表
   */
  getCostCenters: async (req, res) => {
    try {
      const [centers] = await db.pool.execute(`
                SELECT cc.*, d.name as department_name, cc.manager as manager_name
                FROM cost_centers cc
                LEFT JOIN departments d ON cc.department_id = d.id
                WHERE cc.is_active = 1
                ORDER BY cc.code
            `);
      ResponseHandler.success(res, { items: centers, total: centers.length });
    } catch (error) {
      logger.error('获取成本中心列表失败:', error);
      ResponseHandler.error(res, '获取成本中心列表失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 创建成本中心
   */
  createCostCenter: async (req, res) => {
    try {
      const { code, name, type, parent_id, department_id, manager, manager_id, description } =
        req.body;

      if (!code || !name) {
        return ResponseHandler.error(res, '成本中心编码和名称不能为空', 'INVALID_PARAMS', 400);
      }

      const [result] = await db.pool.execute(
        `INSERT INTO cost_centers (code, name, type, parent_id, department_id, manager, description)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          code,
          name,
          type || 'production',
          parent_id || null,
          department_id || null,
          manager || manager_id || null,
          description || '',
        ]
      );

      logger.info(`创建成本中心: ${code} - ${name}`);
      ResponseHandler.success(res, { id: result.insertId, message: '成本中心创建成功' });
    } catch (error) {
      logger.error('创建成本中心失败:', error);
      ResponseHandler.error(res, error.message || '创建成本中心失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 更新成本中心
   */
  updateCostCenter: async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        type,
        parent_id,
        department_id,
        manager,
        manager_id,
        description,
        is_active,
      } = req.body;

      await db.pool.execute(
        `UPDATE cost_centers SET name = ?, type = ?, parent_id = ?, department_id = ?,
                 manager = ?, description = ?, is_active = ? WHERE id = ?`,
        [
          name,
          type,
          parent_id || null,
          department_id || null,
          manager || manager_id || null,
          description || '',
          is_active !== false ? 1 : 0,
          id,
        ]
      );

      ResponseHandler.success(res, { message: '成本中心更新成功' });
    } catch (error) {
      logger.error('更新成本中心失败:', error);
      ResponseHandler.error(res, '更新成本中心失败', 'SERVER_ERROR', 500);
    }
  },

  // ==================== 费率历史管理 ====================

  /**
   * 获取费率变更历史
   */
  getCostSettingsHistory: async (req, res) => {
    try {
      const { page = 1, pageSize = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(pageSize);

      const [rows] = await db.pool.query(`
                SELECT * FROM cost_settings_history
                ORDER BY changed_at DESC
                LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}
            `, [parseInt(pageSize)]);

      const [countResult] = await db.pool.execute(
        'SELECT COUNT(*) as total FROM cost_settings_history'
      );

      ResponseHandler.success(res, {
        items: rows,
        total: countResult[0].total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      });
    } catch (error) {
      logger.error('获取费率历史失败:', error);
      ResponseHandler.error(res, '获取费率历史失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 根据日期获取历史费率
   */
  getCostSettingsByDate: async (req, res) => {
    try {
      const { date } = req.query;
      const queryDate = date || new Date().toISOString().split('T')[0];

      const [settings] = await db.pool.execute(
        `
                SELECT * FROM cost_settings_history
                WHERE effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
                ORDER BY effective_from DESC LIMIT 1
            `,
        [queryDate, queryDate]
      );

      if (settings.length > 0) {
        ResponseHandler.success(res, settings[0]);
      } else {
        // 返回当前设置
        const [current] = await db.pool.execute(
          'SELECT * FROM cost_settings WHERE is_active = 1 LIMIT 1'
        );
        ResponseHandler.success(res, current[0] || null);
      }
    } catch (error) {
      logger.error('获取历史费率失败:', error);
      ResponseHandler.error(res, '获取历史费率失败', 'SERVER_ERROR', 500);
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
        return ResponseHandler.error(res, '请提供产品ID列表', 'INVALID_PARAMS', 400);
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
          const connection = await db.pool.getConnection();
          try {
            await connection.beginTransaction();
            // 删除属于该产品的旧标准成本
            await connection.execute('DELETE FROM standard_costs WHERE product_id = ?', [productId]);

            if (sc.materialCost > 0) {
              await connection.execute(
                'INSERT INTO standard_costs (product_id, cost_element, standard_price, effective_date, is_active, created_at) VALUES (?, ?, ?, CURDATE(), 1, NOW())',
                [productId, 'material', sc.materialCost]
              );
            }
            if (sc.laborCost > 0) {
              await connection.execute(
                'INSERT INTO standard_costs (product_id, cost_element, standard_price, effective_date, is_active, created_at) VALUES (?, ?, ?, CURDATE(), 1, NOW())',
                [productId, 'labor', sc.laborCost]
              );
            }
            if (sc.overheadCost > 0) {
              await connection.execute(
                'INSERT INTO standard_costs (product_id, cost_element, standard_price, effective_date, is_active, created_at) VALUES (?, ?, ?, CURDATE(), 1, NOW())',
                [productId, 'overhead', sc.overheadCost]
              );
            }
            await connection.commit();
          } catch (saveError) {
            await connection.rollback();
            throw saveError;
          } finally {
            connection.release();
          }

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
        return ResponseHandler.error(res, '请指定冻结期间', 'INVALID_PARAMS', 400);
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

  /**
   * 获取实际成本列表
   */
  getActualCostList: async (req, res) => {
    try {
      const { orderNumber, productName, startDate, endDate, page = 1, pageSize = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(pageSize);

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
                LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}
            `,
        params
      );

      ResponseHandler.success(res, {
        list,
        total: countResult[0].total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      });
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
        const [outboundMaterials] = await db.pool.execute(
          `
                    SELECT 
                        m.code as material_code,
                        m.name as material_name,
                        SUM(ioi.actual_quantity) as quantity,
                        COALESCE(m.cost_price, m.price, 0) as unit_cost,
                        ROUND(SUM(ioi.actual_quantity) * COALESCE(m.cost_price, m.price, 0), 2) as total_cost,
                        GROUP_CONCAT(DISTINCT il.batch_number) as batch_number,
                        DATE_FORMAT(MAX(io.outbound_date), '%Y-%m-%d') as issue_date,
                        CASE WHEN io.is_excess = 1 OR io.issue_reason IS NOT NULL THEN '补料' ELSE '正常' END as issue_type
                    FROM inventory_outbound io
                    JOIN inventory_outbound_items ioi ON io.id = ioi.outbound_id
                    JOIN materials m ON ioi.material_id = m.id
                    LEFT JOIN inventory_ledger il ON il.material_id = ioi.material_id 
                        AND il.reference_no = io.outbound_no
                    WHERE io.production_task_id = ? 
                        AND io.status IN ('completed', 'confirmed')
                    GROUP BY ioi.material_id, m.code, m.name, m.price, io.is_excess, io.issue_reason
                    ORDER BY m.code
                `,
          [prodTaskId]
        );

        materialDetails = outboundMaterials;
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
                    WHERE (ge.transaction_type IN ('PRODUCTION', 'MATERIAL_ISSUE') AND ge.transaction_id = ?)
                       OR ge.document_number = ?
                    ORDER BY ge.entry_date, ge.id
                `,
          [prodTaskId, taskCode]
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
            unit_cost: Math.round((costInfo[0].material_cost / costInfo[0].quantity) * 100) / 100,
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
      const calcDate = new Date().toISOString().split('T')[0];
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

  /**
   * 获取成本差异列表
   */
  getCostVarianceList: async (req, res) => {
    try {
      const { orderNumber, productName, varianceType, page = 1, pageSize = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(pageSize);

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
      if (varianceType === 'favorable') {
        whereClause += ' AND cv.is_favorable = 1';
      } else if (varianceType === 'unfavorable') {
        whereClause += ' AND cv.is_favorable = 0';
      }

      // 先检查cost_variance_records表是否有数据
      let hasVarianceRecords = false;
      try {
        const [check] = await db.pool.execute('SELECT COUNT(*) as cnt FROM cost_variance_records');
        hasVarianceRecords = check[0].cnt > 0;
      } catch {
        hasVarianceRecords = false;
      }

      if (hasVarianceRecords) {
        // 从cost_variance_records表查询
        const [countResult] = await db.pool.execute(
          `
                    SELECT COUNT(*) as total 
                    FROM cost_variance_records cv
                    JOIN production_tasks pt ON cv.task_id = pt.id
                    LEFT JOIN materials m ON cv.product_id = m.id
                    WHERE ${whereClause}
                `,
          params
        );

        const [list] = await db.pool.execute(
          `
                    SELECT 
                        cv.id,
                        pt.code as order_number,
                        m.name as product_name,
                        cv.quantity,
                        cv.standard_total_cost as standard_cost,
                        cv.actual_total_cost as actual_cost,
                        cv.total_variance,
                        cv.material_variance,
                        cv.labor_variance,
                        cv.overhead_variance,
                        cv.variance_rate,
                        cv.is_favorable,
                        DATE_FORMAT(cv.created_at, '%Y-%m-%d') as completion_date
                    FROM cost_variance_records cv
                    JOIN production_tasks pt ON cv.task_id = pt.id
                    LEFT JOIN materials m ON cv.product_id = m.id
                    WHERE ${whereClause}
                    ORDER BY cv.created_at DESC
                    LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}
                `,
          params
        );

        return ResponseHandler.success(res, {
          list,
          total: countResult[0].total,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
        });
      }

      // 已经不再从 actual_costs 即时聚合这部分数据了，强依赖 cost_variance_records 的完整度
      ResponseHandler.success(res, {
        list: [],
        total: 0,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      });
    } catch (error) {
      logger.error('获取成本差异列表失败:', error);
      ResponseHandler.error(res, '获取成本差异列表失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 获取成本差异详情
   */
  /**
   * 获取成本差异详情
   */
  getCostVarianceDetail: async (req, res) => {
    try {
      const { taskId } = req.params;

      // 1. 严格 ID 匹配：只接受 cost_variance_records.id
      const [records] = await db.pool.execute(
        `
                SELECT 
                    cv.*,
                    pt.code as order_number,
                    pt.product_id,
                    m.name as product_name,
                    DATE_FORMAT(cv.created_at, '%Y-%m-%d') as completion_date
                FROM cost_variance_records cv
                JOIN production_tasks pt ON cv.task_id = pt.id
                LEFT JOIN materials m ON cv.product_id = m.id
                WHERE cv.id = ?
            `,
        [taskId]
      );

      if (records.length === 0) {
        return ResponseHandler.error(res, '未找到成本差异记录', 'NOT_FOUND', 404);
      }

      const variance = records[0];
      const qty = variance.quantity || 1;

      // 2. 检查标准成本完整性，若缺失则调用服务层恢复
      if ((variance.standard_total_cost || 0) === 0 && variance.product_id) {
        const stdCost = await CostAccountingService.ensureStandardCost(variance.product_id, qty);
        if (stdCost.totalCost > 0) {
          variance.standard_material_cost = stdCost.materialCost;
          variance.standard_labor_cost = stdCost.laborCost;
          variance.standard_overhead_cost = stdCost.overheadCost;
          variance.standard_total_cost = stdCost.totalCost;
        }
      }

      // 3. 计算差异
      const materialVariance =
        (variance.standard_material_cost || 0) - (variance.actual_material_cost || 0);
      const laborVariance = (variance.standard_labor_cost || 0) - (variance.actual_labor_cost || 0);
      const overheadVariance =
        (variance.standard_overhead_cost || 0) - (variance.actual_overhead_cost || 0);
      const totalVariance = (variance.standard_total_cost || 0) - (variance.actual_total_cost || 0);

      const comparison = [
        {
          item: '材料成本',
          standard: variance.standard_material_cost || 0,
          actual: variance.actual_material_cost || 0,
          variance: materialVariance,
          variance_rate: variance.standard_material_cost
            ? Math.round((materialVariance / variance.standard_material_cost) * 10000) / 100
            : 0,
        },
        {
          item: '人工成本',
          standard: variance.standard_labor_cost || 0,
          actual: variance.actual_labor_cost || 0,
          variance: laborVariance,
          variance_rate: variance.standard_labor_cost
            ? Math.round((laborVariance / variance.standard_labor_cost) * 10000) / 100
            : 0,
        },
        {
          item: '制造费用',
          standard: variance.standard_overhead_cost || 0,
          actual: variance.actual_overhead_cost || 0,
          variance: overheadVariance,
          variance_rate: variance.standard_overhead_cost
            ? Math.round((overheadVariance / variance.standard_overhead_cost) * 10000) / 100
            : 0,
        },
        {
          item: '总成本',
          standard: variance.standard_total_cost || 0,
          actual: variance.actual_total_cost || 0,
          variance: totalVariance,
          variance_rate: variance.standard_total_cost
            ? Math.round((totalVariance / variance.standard_total_cost) * 10000) / 100
            : 0,
        },
      ];

      ResponseHandler.success(res, {
        order_number: variance.order_number,
        product_name: variance.product_name,
        quantity: variance.quantity,
        completion_date: variance.completion_date,
        comparison,
      });
    } catch (error) {
      logger.error('获取成本差异详情失败:', error);
      ResponseHandler.error(res, '获取成本差异详情失败', 'SERVER_ERROR', 500);
    }
  },

  // =========================================================================
  // 补料原因配置 API
  // =========================================================================

  /**
   * 获取补料原因列表
   */
  getSupplementReasons: async (req, res) => {
    try {
      const [reasons] = await db.pool.execute(
        'SELECT * FROM cost_supplement_configs ORDER BY created_at DESC'
      );
      return ResponseHandler.success(res, reasons);
    } catch (error) {
      logger.error('获取补料原因失败:', error);
      return ResponseHandler.error(res, error);
    }
  },

  /**
   * 保存补料原因 (新增或更新)
   */
  saveSupplementReason: async (req, res) => {
    try {
      const { id, reason_code, reason_name, is_included_in_cost, is_active } = req.body;
      logger.info('Save Supplement Reason Body:', req.body);

      if (!reason_code || !reason_name) {
        return ResponseHandler.error(res, '原因代码和名称不能为空');
      }

      if (id) {
        // 更新
        await db.pool.execute(
          `UPDATE cost_supplement_configs 
                     SET reason_code = ?, reason_name = ?, is_included_in_cost = ?, is_active = ?
                     WHERE id = ?`,
          [reason_code, reason_name, is_included_in_cost, is_active, id]
        );
      } else {
        // 新增
        await db.pool.execute(
          `INSERT INTO cost_supplement_configs (reason_code, reason_name, is_included_in_cost, is_active)
                     VALUES (?, ?, ?, ?)`,
          [reason_code, reason_name, is_included_in_cost, is_active || 1]
        );
      }
      return ResponseHandler.success(res, { message: '保存成功' });
    } catch (error) {
      logger.error('保存补料原因失败:', error);
      return ResponseHandler.error(res, error);
    }
  },

  /**
   * 删除补料原因
   */
  deleteSupplementReason: async (req, res) => {
    try {
      const { id } = req.params;
      await db.pool.execute('DELETE FROM cost_supplement_configs WHERE id = ?', [id]);
      return ResponseHandler.success(res, { message: '删除成功' });
    } catch (error) {
      logger.error('删除补料原因失败:', error);
      return ResponseHandler.error(res, error);
    }
  },

  // ==================== 财务合规接口 (GL Integration) ====================

  /**
   * 获取总账科目列表
   */
  getGLAccounts: async (req, res) => {
    try {
      const [accounts] = await db.pool.execute('SELECT * FROM gl_accounts ORDER BY account_code');
      return ResponseHandler.success(res, accounts);
    } catch (error) {
      logger.error('获取科目列表失败:', error);
      return ResponseHandler.error(res, error);
    }
  },

  /**
   * 获取科目映射配置
   */
  getGLMappings: async (req, res) => {
    try {
      const [mappings] = await db.pool.execute(`
                SELECT m.*, a.account_code, a.account_name 
                FROM gl_account_mappings m
                LEFT JOIN gl_accounts a ON m.account_id = a.id
                ORDER BY m.id
            `);
      return ResponseHandler.success(res, mappings);
    } catch (error) {
      logger.error('获取科目映射失败:', error);
      return ResponseHandler.error(res, error);
    }
  },

  /**
   * 保存科目映射
   */
  saveGLMapping: async (req, res) => {
    try {
      const { mappings } = req.body; // Expect array of { mapping_key, account_id }

      if (!mappings || !Array.isArray(mappings)) {
        return ResponseHandler.error(res, '参数格式错误');
      }

      for (const item of mappings) {
        if (item.mapping_key && item.account_id) {
          await db.pool.execute(
            'UPDATE gl_account_mappings SET account_id = ? WHERE mapping_key = ?',
            [item.account_id, item.mapping_key]
          );
        }
      }
      return ResponseHandler.success(res, { message: '映射保存成功' });
    } catch (error) {
      logger.error('保存科目映射失败:', error);
      return ResponseHandler.error(res, error);
    }
  },

  // ==================== 成本预警 ====================

  /**
   * 获取成本预警列表
   * 返回差异超过阈值的成本记录
   */
  getCostAlerts: async (req, res) => {
    try {
      const { page = 1, pageSize = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(pageSize);

      // 获取预警阈值配置
      const [settings] = await db.pool.execute(
        'SELECT * FROM cost_alert_settings WHERE is_active = 1 LIMIT 1'
      );
      const threshold = settings.length > 0 ? parseFloat(settings[0].variance_threshold) : 10; // 默认10%

      // 始终使用实时计算逻辑，确保显示最新数据
      // 注意：如果数据量过大，后续应考虑使用物化视图或定时任务更新 cost_variance_records

      // 兜底逻辑：实时计算
      const [rows] = await db.pool.query(`
                SELECT 
                    ac.id,
                    pt.code as task_code,
                    m.name as product_name,
                    m.code as product_code,
                    COALESCE(psc.total_cost * pt.quantity, 0) as standard_total_cost,
                    ac.total_cost as actual_total_cost,
                    (COALESCE(psc.total_cost * pt.quantity, 0) - ac.total_cost) as total_variance,
                    ROUND((COALESCE(psc.total_cost * pt.quantity, 0) - ac.total_cost) / NULLIF(ac.total_cost, 0) * 100, 2) as variance_rate,
                    CASE WHEN (COALESCE(psc.total_cost * pt.quantity, 0) - ac.total_cost) >= 0 THEN 1 ELSE 0 END as is_favorable,
                    DATE_FORMAT(ac.calculated_at, '%Y-%m-%d %H:%i') as created_at
                FROM actual_costs ac
                JOIN production_tasks pt ON ac.production_order_id = pt.id
                LEFT JOIN materials m ON pt.product_id = m.id
                LEFT JOIN (
                    SELECT product_id as p_id, SUM(standard_price) as total_cost 
                    FROM standard_costs 
                    WHERE is_active = 1 
                    GROUP BY product_id
                ) psc ON pt.product_id = psc.p_id
                HAVING ABS(variance_rate) > ${threshold}
                ORDER BY ABS(variance_rate) DESC
                LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}
            `, [parseInt(pageSize)]);

      // 处理 alert_level
      const alertsList = rows.map((row) => ({
        ...row,
        alert_level: Math.abs(row.variance_rate) > threshold * 2 ? 'critical' : 'warning',
      }));

      // 获取总数 (需要嵌套查询因为 HAVING 不能直接用于 COUNT)
      const [countResult] = await db.pool.query(`
                SELECT COUNT(*) as total FROM (
                    SELECT 
                        ROUND((COALESCE(psc.total_cost * pt.quantity, 0) - ac.total_cost) / NULLIF(ac.total_cost, 0) * 100, 2) as variance_rate
                    FROM actual_costs ac
                    JOIN production_tasks pt ON ac.production_order_id = pt.id
                    LEFT JOIN (
                        SELECT product_id as p_id, SUM(standard_price) as total_cost 
                        FROM standard_costs 
                        WHERE is_active = 1 
                        GROUP BY product_id
                    ) psc ON pt.product_id = psc.p_id
                    HAVING ABS(variance_rate) > ${threshold}
                ) as t
            `);
      const totalCount = countResult[0].total;

      ResponseHandler.success(res, {
        list: alertsList,
        total: totalCount,
        threshold,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      });
    } catch (error) {
      logger.error('获取成本预警失败:', error.stack || error.message || error);
      ResponseHandler.error(res, '获取成本预警失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 获取成本预警配置
   */
  getCostAlertSettings: async (req, res) => {
    try {
      // 表结构由 migrations/20260312000009_baseline_misc_tables.js 管理

      const [settings] = await db.pool.execute(
        'SELECT * FROM cost_alert_settings WHERE is_active = 1 LIMIT 1'
      );

      if (settings.length > 0) {
        ResponseHandler.success(res, settings[0]);
      } else {
        // 返回默认配置
        ResponseHandler.success(res, {
          variance_threshold: 10,
          material_threshold: 15,
          labor_threshold: 20,
          overhead_threshold: 25,
          is_active: 1,
        });
      }
    } catch (error) {
      logger.error('获取预警配置失败:', error);
      ResponseHandler.error(res, '获取预警配置失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 保存成本预警配置
   */
  saveCostAlertSettings: async (req, res) => {
    try {
      const { variance_threshold, material_threshold, labor_threshold, overhead_threshold } =
        req.body;

      // 表结构由 migrations/20260312000009_baseline_misc_tables.js 管理

      // 更新或插入配置
      const [existing] = await db.pool.execute(
        'SELECT id FROM cost_alert_settings WHERE is_active = 1'
      );

      if (existing.length > 0) {
        await db.pool.execute(
          `
                    UPDATE cost_alert_settings SET
                        variance_threshold = ?,
                        material_threshold = ?,
                        labor_threshold = ?,
                        overhead_threshold = ?,
                        updated_by = ?
                    WHERE id = ?
                `,
          [
            variance_threshold,
            material_threshold,
            labor_threshold,
            overhead_threshold,
            req.user?.username || 'system',
            existing[0].id,
          ]
        );
      } else {
        await db.pool.execute(
          `
                    INSERT INTO cost_alert_settings 
                    (variance_threshold, material_threshold, labor_threshold, overhead_threshold, updated_by)
                    VALUES (?, ?, ?, ?, ?)
                `,
          [
            variance_threshold,
            material_threshold,
            labor_threshold,
            overhead_threshold,
            req.user?.username || 'system',
          ]
        );
      }

      ResponseHandler.success(res, { message: '预警配置保存成功' });
    } catch (error) {
      logger.error('保存预警配置失败:', error);
      ResponseHandler.error(res, '保存预警配置失败', 'SERVER_ERROR', 500);
    }
  },

  // ==================== 年度成本对比 ====================

  /**
   * 获取年度成本累计对比
   * 对比当年与去年同期的成本数据
   */
  getYearlyCostComparison: async (req, res) => {
    try {
      const { year } = req.query;
      const currentYear = year || new Date().getFullYear();
      const lastYear = parseInt(currentYear) - 1;

      // 获取当年各月成本数据
      const [currentYearData] = await db.pool.execute(
        `
                SELECT 
                    DATE_FORMAT(calculated_at, '%Y-%m') as month,
                    COALESCE(SUM(material_cost), 0) as material_cost,
                    COALESCE(SUM(labor_cost), 0) as labor_cost,
                    COALESCE(SUM(overhead_cost), 0) as overhead_cost,
                    COALESCE(SUM(total_cost), 0) as total_cost,
                    COUNT(*) as task_count
                FROM actual_costs
                WHERE YEAR(calculated_at) = ?
                GROUP BY DATE_FORMAT(calculated_at, '%Y-%m')
                ORDER BY month
            `,
        [currentYear]
      );

      // 获取去年各月成本数据
      const [lastYearData] = await db.pool.execute(
        `
                SELECT 
                    DATE_FORMAT(calculated_at, '%Y-%m') as month,
                    COALESCE(SUM(material_cost), 0) as material_cost,
                    COALESCE(SUM(labor_cost), 0) as labor_cost,
                    COALESCE(SUM(overhead_cost), 0) as overhead_cost,
                    COALESCE(SUM(total_cost), 0) as total_cost,
                    COUNT(*) as task_count
                FROM actual_costs
                WHERE YEAR(calculated_at) = ?
                GROUP BY DATE_FORMAT(calculated_at, '%Y-%m')
                ORDER BY month
            `,
        [lastYear]
      );

      // 计算年度累计
      const currentYearTotal = currentYearData.reduce(
        (acc, row) => ({
          material_cost: acc.material_cost + parseFloat(row.material_cost),
          labor_cost: acc.labor_cost + parseFloat(row.labor_cost),
          overhead_cost: acc.overhead_cost + parseFloat(row.overhead_cost),
          total_cost: acc.total_cost + parseFloat(row.total_cost),
          task_count: acc.task_count + parseInt(row.task_count),
        }),
        { material_cost: 0, labor_cost: 0, overhead_cost: 0, total_cost: 0, task_count: 0 }
      );

      const lastYearTotal = lastYearData.reduce(
        (acc, row) => ({
          material_cost: acc.material_cost + parseFloat(row.material_cost),
          labor_cost: acc.labor_cost + parseFloat(row.labor_cost),
          overhead_cost: acc.overhead_cost + parseFloat(row.overhead_cost),
          total_cost: acc.total_cost + parseFloat(row.total_cost),
          task_count: acc.task_count + parseInt(row.task_count),
        }),
        { material_cost: 0, labor_cost: 0, overhead_cost: 0, total_cost: 0, task_count: 0 }
      );

      // 计算同比增幅
      const calcGrowthRate = (current, previous) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 10000) / 100;
      };

      ResponseHandler.success(res, {
        currentYear: parseInt(currentYear),
        lastYear: parseInt(lastYear),
        currentYearMonthly: currentYearData,
        lastYearMonthly: lastYearData,
        currentYearTotal,
        lastYearTotal,
        growthRate: {
          material_cost: calcGrowthRate(
            currentYearTotal.material_cost,
            lastYearTotal.material_cost
          ),
          labor_cost: calcGrowthRate(currentYearTotal.labor_cost, lastYearTotal.labor_cost),
          overhead_cost: calcGrowthRate(
            currentYearTotal.overhead_cost,
            lastYearTotal.overhead_cost
          ),
          total_cost: calcGrowthRate(currentYearTotal.total_cost, lastYearTotal.total_cost),
        },
      });
    } catch (error) {
      logger.error('获取年度成本对比失败:', error);
      ResponseHandler.error(res, '获取年度成本对比失败', 'SERVER_ERROR', 500);
    }
  },

  // ==================== 成本报表导出 ====================

  /**
   * 导出成本明细账
   */
  exportCostLedger: async (req, res) => {
    try {
      const { startDate, endDate, costCenterId, productId } = req.query;

      let whereClause = '1=1';
      const params = [];

      if (startDate) {
        whereClause += ' AND ac.calculated_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        whereClause += ' AND ac.calculated_at <= ?';
        params.push(endDate);
      }
      if (costCenterId) {
        whereClause += ' AND cc.id = ?';
        params.push(costCenterId);
      }
      if (productId) {
        whereClause += ' AND m.id = ?';
        params.push(productId);
      }

      const [data] = await db.pool.execute(
        `
                SELECT 
                    DATE_FORMAT(ac.calculated_at, '%Y-%m-%d') as 日期,
                    pt.code as 任务编号,
                    m.code as 产品编码,
                    m.name as 产品名称,
                    COALESCE(cc.name, '-') as 成本中心,
                    pt.quantity as 数量,
                    ac.material_cost as 材料成本,
                    ac.labor_cost as 人工成本,
                    ac.overhead_cost as 制造费用,
                    ac.total_cost as 总成本,
                    ROUND(ac.total_cost / NULLIF(pt.quantity, 0), 2) as 单位成本
                FROM actual_costs ac
                JOIN production_tasks pt ON ac.production_order_id = pt.id
                LEFT JOIN materials m ON pt.product_id = m.id
                LEFT JOIN cost_centers cc ON pt.cost_center_id = cc.id
                WHERE ${whereClause}
                ORDER BY ac.calculated_at DESC
            `,
        params
      );

      // 设置响应头为CSV格式
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=cost_ledger.csv');

      // 添加BOM以支持Excel正确显示中文
      res.write('\uFEFF');

      // 写入表头
      if (data.length > 0) {
        res.write(Object.keys(data[0]).join(',') + '\n');
        // 写入数据
        for (const row of data) {
          res.write(
            Object.values(row)
              .map((v) => `"${v || ''}"`)
              .join(',') + '\n'
          );
        }
      }

      res.end();
    } catch (error) {
      logger.error('导出成本明细失败:', error);
      ResponseHandler.error(res, '导出成本明细失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 导出成本差异分析
   */
  exportCostVariance: async (req, res) => {
    try {
      const { startDate, endDate, varianceType } = req.query;

      let whereClause = '1=1';
      const params = [];

      if (startDate) {
        whereClause += ' AND cv.created_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        whereClause += ' AND cv.created_at <= ?';
        params.push(endDate + ' 23:59:59');
      }
      if (varianceType === 'favorable') {
        whereClause += ' AND cv.is_favorable = 1';
      } else if (varianceType === 'unfavorable') {
        whereClause += ' AND cv.is_favorable = 0';
      }

      const [data] = await db.pool.execute(
        `
                SELECT 
                    pt.code as 任务编号,
                    m.name as 产品名称,
                    cv.quantity as 数量,
                    cv.standard_total_cost as 标准成本,
                    cv.actual_total_cost as 实际成本,
                    cv.total_variance as 总差异,
                    cv.material_variance as 材料差异,
                    cv.labor_variance as 人工差异,
                    cv.overhead_variance as 费用差异,
                    CONCAT(cv.variance_rate, '%') as 差异率,
                    CASE WHEN cv.is_favorable = 1 THEN '有利' ELSE '不利' END as 差异性质,
                    DATE_FORMAT(cv.created_at, '%Y-%m-%d') as 日期
                FROM cost_variance_records cv
                JOIN production_tasks pt ON cv.task_id = pt.id
                LEFT JOIN materials m ON cv.product_id = m.id
                WHERE ${whereClause}
                ORDER BY cv.created_at DESC
            `,
        params
      );

      // 设置响应头为CSV格式
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=cost_variance.csv');

      // 添加BOM以支持Excel正确显示中文
      res.write('\uFEFF');

      // 写入表头和数据
      if (data.length > 0) {
        res.write(Object.keys(data[0]).join(',') + '\n');
        for (const row of data) {
          res.write(
            Object.values(row)
              .map((v) => `"${v || ''}"`)
              .join(',') + '\n'
          );
        }
      }

      res.end();
    } catch (error) {
      logger.error('导出成本差异失败:', error);
      ResponseHandler.error(res, '导出成本差异失败', 'SERVER_ERROR', 500);
    }
  },

  // ==================== 物料标准成本管理 (期初冻结) ====================

  /**
   * 获取物料标准成本列表
   */
  getMaterialStandardCosts: async (req, res) => {
    try {
      const { page = 1, pageSize = 20, is_active, material_code, material_name } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(pageSize);

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
                LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}
            `,
        params
      );

      ResponseHandler.success(res, {
        list,
        total: countResult[0].total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      });
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
                        SET is_active = 0, expiry_date = DATE_SUB(?, INTERVAL 1 DAY)
                        WHERE material_id = ? AND is_active = 1 AND cost_element = 'material'
                    `,
            [effective_date, mat.id]
          );

          // 插入新的标准成本
          await connection.execute(
            `
                        INSERT INTO standard_costs 
                        (material_id, cost_element, standard_price, effective_date, expiry_date, is_active)
                        VALUES (?, 'material', ?, ?, ?, 1)
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
                        SET is_active = 0, expiry_date = DATE_SUB(?, INTERVAL 1 DAY)
                        WHERE material_id = ? AND is_active = 1 AND cost_element = 'material'
                    `,
            [effective_date, item.material_id]
          );

          // 插入新的标准成本
          await connection.execute(
            `
                        INSERT INTO standard_costs 
                        (material_id, cost_element, standard_price, effective_date, expiry_date, is_active)
                        VALUES (?, 'material', ?, ?, ?, 1)
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

module.exports = costController;
