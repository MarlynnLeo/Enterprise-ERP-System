/**
 * OverheadAllocationService.js
 * 制造费用分摊服务
 * 提供多分摊基础的制造费用计算
 */

const db = require('../../config/db');
const { logger } = require('../../utils/logger');
const BusinessError = require('../../utils/BusinessError');
const { softDelete } = require('../../utils/softDelete');

class OverheadAllocationService {
  // 分摊基础枚举
  static ALLOCATION_BASE = {
    LABOR_COST: 'labor_cost', // 人工成本比例
    LABOR_HOURS: 'labor_hours', // 工时费率
    MACHINE_HOURS: 'machine_hours', // 机时费率
    QUANTITY: 'quantity', // 产量费率
    MATERIAL_COST: 'material_cost', // 材料成本比例
  };

  /**
   * 获取所有分摊配置
   * @param {Object} filters - 筛选条件
   * @returns {Promise<Array>} 配置列表
   */
  static async getConfigs(filters = {}) {
    try {
      let sql = `
                SELECT 
                    oac.*,
                    cc.name as cost_center_name,
                    m.code as product_code,
                    m.name as product_name
                FROM overhead_allocation_config oac
                LEFT JOIN cost_centers cc ON oac.cost_center_id = cc.id
                LEFT JOIN materials m ON oac.product_id = m.id
                WHERE 1=1
            `;
      const params = [];

      if (filters.isActive !== undefined) {
        sql += ' AND oac.is_active = ?';
        params.push(filters.isActive ? 1 : 0);
      }
      if (filters.costCenterId) {
        sql += ' AND (oac.cost_center_id = ? OR oac.cost_center_id IS NULL)';
        params.push(filters.costCenterId);
      }
      if (filters.allocationBase) {
        sql += ' AND oac.allocation_base = ?';
        params.push(filters.allocationBase);
      }
      if (filters.productId) {
        sql += ' AND oac.product_id = ?';
        params.push(filters.productId);
      }
      if (filters.isGlobal !== undefined) {
        if (filters.isGlobal) {
          sql += ' AND oac.product_id IS NULL AND oac.product_category IS NULL';
        } else {
          sql += ' AND (oac.product_id IS NOT NULL OR oac.product_category IS NOT NULL)';
        }
      }

      sql += ' ORDER BY oac.priority DESC, oac.effective_date DESC';

      const [rows] = await db.pool.execute(sql, params);
      return rows;
    } catch (error) {
      logger.error('[OverheadAllocation] 获取分摊配置失败:', error);
      throw error;
    }
  }

  /**
   * 创建分摊配置
   * @param {Object} data - 配置数据
   * @returns {Promise<Object>} 创建结果
   */
  static async createConfig(data) {
    try {
      const [result] = await db.pool.execute(
        `
                INSERT INTO overhead_allocation_config 
                (name, allocation_base, rate, cost_center_id, product_id, product_category, effective_date, expiry_date, priority, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
        [
          data.name,
          data.allocation_base || 'labor_cost',
          data.rate,
          data.cost_center_id || null,
          data.product_id || null,
          data.product_category || null,
          data.effective_date,
          data.expiry_date || null,
          data.priority || 0,
          data.is_active !== false ? 1 : 0,
        ]
      );

      logger.info(`[OverheadAllocation] 创建分摊配置成功: ${data.name}`);
      return { id: result.insertId, ...data };
    } catch (error) {
      logger.error('[OverheadAllocation] 创建分摊配置失败:', error);
      throw error;
    }
  }

  /**
   * 更新分摊配置
   * @param {number} id - 配置ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} 更新结果
   */
  static async updateConfig(id, data) {
    try {
      const fields = [];
      const params = [];

      const allowedFields = [
        'name',
        'allocation_base',
        'rate',
        'cost_center_id',
        'product_id',
        'product_category',
        'effective_date',
        'expiry_date',
        'priority',
        'is_active',
      ];

      for (const field of allowedFields) {
        if (data[field] !== undefined) {
          fields.push(`${field} = ?`);
          params.push(field === 'is_active' ? (data[field] ? 1 : 0) : data[field]);
        }
      }

      if (fields.length === 0) {
        return { affected: 0 };
      }

      params.push(id);
      const [result] = await db.pool.execute(
        `UPDATE overhead_allocation_config SET ${fields.join(', ')} WHERE id = ?`,
        params
      );

      logger.info(`[OverheadAllocation] 更新分摊配置 ${id} 成功`);
      return { affected: result.affectedRows };
    } catch (error) {
      logger.error('[OverheadAllocation] 更新分摊配置失败:', error);
      throw error;
    }
  }

  /**
   * 删除分摊配置
   * @param {number} id - 配置ID
   * @returns {Promise<Object>} 删除结果
   */
  static async deleteConfig(id) {
    try {
      // ✅ 软删除替代硬删除
      const affected = await softDelete(db.pool, 'overhead_allocation_config', 'id', id);
      logger.info(`[OverheadAllocation] 删除分摊配置 ${id} 成功`);
      return { affected };
    } catch (error) {
      logger.error('[OverheadAllocation] 删除分摊配置失败:', error);
      throw error;
    }
  }

  /**
   * 计算制造费用（多分摊基础）
   * @param {Object} params - 计算参数
   * @param {number} params.costCenterId - 成本中心ID
   * @param {number} params.laborCost - 人工成本
   * @param {number} params.laborHours - 人工工时
   * @param {number} params.machineHours - 机器工时
   * @param {number} params.quantity - 产量
   * @param {number} params.materialCost - 材料成本
   * @param {string} params.productCategory - 产品类别
   * @param {Date} params.date - 计算日期
   * @returns {Promise<Object>} 计算结果
   */
  static async calculateOverhead(params) {
    try {
      const calcDate = params.date || new Date().toISOString().split('T')[0];

      // 1. 查找适用的分摊配置（按优先级排序）
      let sql = `
                SELECT * FROM overhead_allocation_config
                WHERE is_active = 1
                  AND deleted_at IS NULL
                  AND effective_date <= ?
                  AND (expiry_date IS NULL OR expiry_date >= ?)
            `;
      const sqlParams = [calcDate, calcDate];

      // 成本中心筛选
      if (params.costCenterId) {
        sql += ' AND (cost_center_id = ? OR cost_center_id IS NULL)';
        sqlParams.push(params.costCenterId);
      } else {
        sql += ' AND cost_center_id IS NULL';
      }

      // 产品ID精确筛选（最高优先级）
      if (params.productId) {
        sql += ' AND (product_id = ? OR product_id IS NULL)';
        sqlParams.push(params.productId);
      } else {
        sql += ' AND product_id IS NULL';
      }

      // 产品类别筛选
      if (params.productCategory) {
        sql += ' AND (product_category = ? OR product_category IS NULL)';
        sqlParams.push(params.productCategory);
      } else {
        sql += ' AND product_category IS NULL';
      }

      // 优先级排序：product_id 精确匹配 > product_category 匹配 > 全局默认
      sql += ' ORDER BY ISNULL(product_id) ASC, ISNULL(product_category) ASC, priority DESC, ISNULL(cost_center_id) ASC LIMIT 1';

      const [configs] = await db.pool.execute(sql, sqlParams);

      if (configs.length === 0) {
        // SSOT 强校验：没有分摊规则时拒绝计算，绝不能通过妥协参数虚构成本
        throw new BusinessError(
          '系统未找到适用于当前条件（成本中心、产品大类）的制造费用分摊配置',
          { route: '/finance/cost/overhead', buttonText: '配置分摊费率' }
        );
      }

      const config = configs[0];
      let overhead = 0;

      // 2. 根据分摊基础计算费用
      switch (config.allocation_base) {
        case 'labor_cost':
          overhead = (params.laborCost || 0) * parseFloat(config.rate);
          break;
        case 'labor_hours':
          overhead = (params.laborHours || 0) * parseFloat(config.rate);
          break;
        case 'machine_hours':
          overhead = (params.machineHours || 0) * parseFloat(config.rate);
          break;
        case 'quantity':
          overhead = (params.quantity || 0) * parseFloat(config.rate);
          break;
        case 'material_cost':
          overhead = (params.materialCost || 0) * parseFloat(config.rate);
          break;
        default:
          throw new BusinessError(
            `遇到未受支持的费用分摊计算基准: ${config.allocation_base}`,
            { route: '/finance/cost/overhead', buttonText: '修改基准设定' }
          );
      }

      // 保留2位小数
      overhead = Math.round(overhead * 100) / 100;

      logger.info(
        `[OverheadAllocation] 计算制造费用: base=${config.allocation_base}, rate=${config.rate}, result=${overhead}`
      );

      return {
        overhead,
        allocation_base: config.allocation_base,
        rate: parseFloat(config.rate),
        config_id: config.id,
        config_name: config.name,
      };
    } catch (error) {
      logger.error('[OverheadAllocation] 计算制造费用失败:', error);
      throw error;
    }
  }

  /**
   * 获取分摊基础选项（用于下拉框）
   */
  static getAllocationBaseOptions() {
    return [
      { value: 'labor_cost', label: '人工成本比例', unit: '%' },
      { value: 'labor_hours', label: '工时费率', unit: '元/小时' },
      { value: 'machine_hours', label: '机时费率', unit: '元/小时' },
      { value: 'quantity', label: '产量费率', unit: '元/件' },
      { value: 'material_cost', label: '材料成本比例', unit: '%' },
    ];
  }
}

module.exports = OverheadAllocationService;
