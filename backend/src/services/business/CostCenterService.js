/**
 * CostCenterService.js
 * 成本中心服务
 * 提供成本中心管理、成本归集和汇总功能
 */

const db = require('../../config/db');
const { logger } = require('../../utils/logger');
const CostAccountingService = require('./CostAccountingService');
const { softDelete } = require('../../utils/softDelete');

class CostCenterService {
  /**
   * 获取所有成本中心（树形结构）
   * @param {Object} filters - 筛选条件
   * @returns {Promise<Array>} 成本中心列表
   */
  static async getAll(filters = {}) {
    try {
      let sql = `
                SELECT 
                    cc.*,
                    d.name as department_name,
                    d.code as department_code,
                    pcc.name as parent_name,
                    (SELECT COUNT(*) FROM production_tasks WHERE cost_center_id = cc.id) as task_count
                FROM cost_centers cc
                LEFT JOIN departments d ON cc.department_id = d.id
                LEFT JOIN cost_centers pcc ON cc.parent_id = pcc.id
                WHERE cc.deleted_at IS NULL
            `;
      const params = [];

      if (filters.type) {
        sql += ' AND cc.type = ?';
        params.push(filters.type);
      }
      if (filters.isActive !== undefined) {
        sql += ' AND cc.is_active = ?';
        params.push(filters.isActive ? 1 : 0);
      }
      if (filters.keyword) {
        sql += ' AND (cc.code LIKE ? OR cc.name LIKE ?)';
        params.push(`%${filters.keyword}%`, `%${filters.keyword}%`);
      }

      sql += ' ORDER BY cc.type, cc.code';

      const [rows] = await db.pool.execute(sql, params);
      return this.buildTree(rows);
    } catch (error) {
      logger.error('[CostCenter] 获取成本中心列表失败:', error);
      throw error;
    }
  }

  /**
   * 构建树形结构
   */
  static buildTree(flatList) {
    const map = {};
    const roots = [];

    flatList.forEach((item) => {
      map[item.id] = { ...item, children: [] };
    });

    flatList.forEach((item) => {
      if (item.parent_id && map[item.parent_id]) {
        map[item.parent_id].children.push(map[item.id]);
      } else {
        roots.push(map[item.id]);
      }
    });

    return roots;
  }

  /**
   * 获取成本中心详情
   * @param {number} id - 成本中心ID
   * @returns {Promise<Object>} 成本中心详情
   */
  static async getById(id) {
    try {
      const [rows] = await db.pool.execute(
        `
                SELECT 
                    cc.*,
                    pcc.name as parent_name
                FROM cost_centers cc
                LEFT JOIN cost_centers pcc ON cc.parent_id = pcc.id
                WHERE cc.id = ? AND cc.deleted_at IS NULL
            `,
        [id]
      );

      if (rows.length === 0) {
        return null;
      }

      // 获取关联的成本汇总
      const [costSummary] = await db.pool.execute(
        `
                SELECT 
                    SUM(pt.material_cost) as total_material_cost,
                    SUM(pt.labor_cost) as total_labor_cost,
                    SUM(pt.overhead_cost) as total_overhead_cost,
                    SUM(pt.actual_cost) as total_actual_cost,
                    COUNT(pt.id) as task_count
                FROM production_tasks pt
                WHERE pt.cost_center_id = ? AND pt.status = 'completed'
            `,
        [id]
      );

      return {
        ...rows[0],
        cost_summary: costSummary[0],
      };
    } catch (error) {
      logger.error('[CostCenter] 获取成本中心详情失败:', error);
      throw error;
    }
  }

  /**
   * 创建成本中心
   * @param {Object} data - 成本中心数据
   * @returns {Promise<Object>} 创建结果
   */
  static async create(data) {
    try {
      const [result] = await db.pool.execute(
        `
                INSERT INTO cost_centers (code, name, type, parent_id, department_id, manager, description, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
        [
          data.code,
          data.name,
          data.type || 'production',
          data.parent_id || null,
          data.department_id || null,
          data.manager || null,
          data.description || null,
          data.is_active !== false ? 1 : 0,
        ]
      );

      logger.info(`[CostCenter] 创建成本中心成功: ${data.code} - ${data.name}`);
      return { id: result.insertId, ...data };
    } catch (error) {
      logger.error('[CostCenter] 创建成本中心失败:', error);
      throw error;
    }
  }

  /**
   * 更新成本中心
   * @param {number} id - 成本中心ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} 更新结果
   */
  static async update(id, data) {
    try {
      const fields = [];
      const params = [];

      if (data.name !== undefined) {
        fields.push('name = ?');
        params.push(data.name);
      }
      if (data.type !== undefined) {
        fields.push('type = ?');
        params.push(data.type);
      }
      if (data.parent_id !== undefined) {
        fields.push('parent_id = ?');
        params.push(data.parent_id);
      }
      if (data.department_id !== undefined) {
        fields.push('department_id = ?');
        params.push(data.department_id);
      }
      if (data.manager !== undefined) {
        fields.push('manager = ?');
        params.push(data.manager);
      }
      if (data.description !== undefined) {
        fields.push('description = ?');
        params.push(data.description);
      }
      if (data.is_active !== undefined) {
        fields.push('is_active = ?');
        params.push(data.is_active ? 1 : 0);
      }

      if (fields.length === 0) {
        return { affected: 0 };
      }

      params.push(id);
      const [result] = await db.pool.execute(
        `UPDATE cost_centers SET ${fields.join(', ')} WHERE id = ?`,
        params
      );

      logger.info(`[CostCenter] 更新成本中心 ${id} 成功`);
      return { affected: result.affectedRows };
    } catch (error) {
      logger.error('[CostCenter] 更新成本中心失败:', error);
      throw error;
    }
  }

  /**
   * 删除成本中心
   * @param {number} id - 成本中心ID
   * @returns {Promise<Object>} 删除结果
   */
  static async delete(id) {
    try {
      // 检查是否有子成本中心
      const [children] = await db.pool.execute(
        'SELECT COUNT(*) as cnt FROM cost_centers WHERE parent_id = ? AND deleted_at IS NULL',
        [id]
      );
      if (children[0].cnt > 0) {
        throw new Error('存在子成本中心，无法删除');
      }

      // 检查是否有关联的生产任务
      const [tasks] = await db.pool.execute(
        'SELECT COUNT(*) as cnt FROM production_tasks WHERE cost_center_id = ?',
        [id]
      );
      if (tasks[0].cnt > 0) {
        throw new Error('存在关联的生产任务，无法删除');
      }

      // ✅ 软删除替代硬删除
      const affected = await softDelete(db.pool, 'cost_centers', 'id', id);

      logger.info(`[CostCenter] 删除成本中心 ${id} 成功`);
      return { affected };
    } catch (error) {
      logger.error('[CostCenter] 删除成本中心失败:', error);
      throw error;
    }
  }

  /**
   * 获取成本中心成本归集报表
   * @param {Object} filters - 筛选条件
   * @returns {Promise<Array>} 成本归集数据
   */
  static async getCostReport(filters = {}) {
    try {
      let sql = `
                SELECT 
                    cc.id,
                    cc.code,
                    cc.name,
                    cc.type,
                    COALESCE(SUM(pt.material_cost), 0) as material_cost,
                    COALESCE(SUM(pt.labor_cost), 0) as labor_cost,
                    COALESCE(SUM(pt.overhead_cost), 0) as overhead_cost,
                    COALESCE(SUM(pt.actual_cost), 0) as total_cost,
                    COUNT(pt.id) as task_count,
                    COALESCE(SUM(pt.quantity), 0) as total_quantity
                FROM cost_centers cc
                LEFT JOIN production_tasks pt ON cc.id = pt.cost_center_id
                    AND pt.status = 'completed'
                WHERE cc.deleted_at IS NULL
            `;
      const params = [];

      // 日期筛选
      if (filters.startDate) {
        sql += ' AND pt.updated_at >= ?';
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        sql += ' AND pt.updated_at <= ?';
        params.push(filters.endDate + ' 23:59:59');
      }

      sql += `
                GROUP BY cc.id, cc.code, cc.name, cc.type
                ORDER BY cc.type, total_cost DESC
            `;

      const [rows] = await db.pool.execute(sql, params);
      return rows;
    } catch (error) {
      logger.error('[CostCenter] 获取成本归集报表失败:', error);
      throw error;
    }
  }

  /**
   * 获取成本中心下拉选项
   * @returns {Promise<Array>} 选项列表
   */
  static async getOptions() {
    try {
      const [rows] = await db.pool.execute(`
                SELECT id, code, name, type
                FROM cost_centers
                WHERE is_active = 1 AND deleted_at IS NULL
                ORDER BY type, code
            `);
      return rows;
    } catch (error) {
      logger.error('[CostCenter] 获取成本中心选项失败:', error);
      throw error;
    }
  }

  /**
   * 获取效率差异分析数据
   * 标准工时 vs 实际工时
   * @param {Object} filters - 筛选条件
   * @returns {Promise<Object>} 效率差异数据
   */
  static async getEfficiencyVariance(filters = {}) {
    try {
      let whereClause = 'WHERE pt.status = "completed"';
      const params = [];

      if (filters.startDate) {
        whereClause += ' AND pt.updated_at >= ?';
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereClause += ' AND pt.updated_at <= ?';
        params.push(filters.endDate + ' 23:59:59');
      }
      if (filters.costCenterId) {
        whereClause += ' AND pt.cost_center_id = ?';
        params.push(filters.costCenterId);
      }

      const [rows] = await db.pool.execute(
        `
                SELECT 
                    pt.id,
                    pt.code as task_code,
                    m.name as product_name,
                    cc.name as cost_center_name,
                    pt.quantity,
                    COALESCE(
                        (SELECT SUM(ptd.standard_hours) 
                         FROM process_templates pt2 
                         JOIN process_template_details ptd ON pt2.id = ptd.template_id 
                         WHERE pt2.product_id = pt.product_id AND pt2.status = 1),
                        0
                    ) * pt.quantity as standard_hours,
                    COALESCE(
                        (SELECT SUM(TIMESTAMPDIFF(MINUTE, pp.actual_start_time, pp.actual_end_time) / 60)
                         FROM production_processes pp 
                         WHERE pp.task_id = pt.id AND pp.actual_end_time IS NOT NULL),
                        0
                    ) as actual_hours
                FROM production_tasks pt
                LEFT JOIN materials m ON pt.product_id = m.id
                LEFT JOIN cost_centers cc ON pt.cost_center_id = cc.id
                ${whereClause}
                ORDER BY pt.updated_at DESC
                LIMIT 100
            `,
        params
      );

      // 获取动态全局人工费率
      const settings = await CostAccountingService.getCostSettings();
      const laborRate = settings.laborRate;

      // 计算效率差异和成本影响
      const list = rows.map((r) => {
        const stdHours = parseFloat(r.standard_hours) || 0;
        const actHours = parseFloat(r.actual_hours) || 0;
        const effVariance = stdHours - actHours;
        const effRate = actHours > 0 ? (stdHours / actHours) * 100 : 100;
        const costImpact = effVariance * laborRate; // 动态工时费率
        return {
          ...r,
          standard_hours: stdHours,
          actual_hours: actHours,
          efficiency_variance: effVariance,
          efficiency_rate: effRate,
          cost_impact: costImpact,
        };
      });

      return { list };
    } catch (error) {
      logger.error('[CostCenter] 获取效率差异失败:', error);
      throw error;
    }
  }

  /**
   * 获取产能利用分析数据
   * @param {Object} filters - 筛选条件
   * @returns {Promise<Object>} 产能利用数据
   */
  static async getCapacityUtilization(filters = {}) {
    try {
      const month = filters.month || new Date().toISOString().slice(0, 7);
      const startDate = month + '-01';
      const endDate = month + '-31 23:59:59';

      // 假设每个成本中心每月标准产能: 22天 * 8小时 = 176小时
      const standardCapacityPerCenter = 176;

      // 先获取所有生产类型的成本中心
      const [centers] = await db.pool.execute(`
                SELECT id, code, name as cost_center_name
                FROM cost_centers
                WHERE is_active = 1 AND type = 'production' AND deleted_at IS NULL
                ORDER BY code
            `);

      // 批量获取所有成本中心的实际工时（消除 N+1）
      const centerIds = centers.map(c => c.id);
      let hoursMap = new Map();
      if (centerIds.length > 0) {
        const centerPh = centerIds.map(() => '?').join(',');
        const [hourResults] = await db.pool.execute(
          `SELECT pt.cost_center_id,
                  COALESCE(SUM(TIMESTAMPDIFF(MINUTE, pp.actual_start_time, pp.actual_end_time) / 60), 0) as hours
           FROM production_tasks pt
           JOIN production_processes pp ON pp.task_id = pt.id
           WHERE pt.cost_center_id IN (${centerPh})
             AND pt.updated_at >= ? AND pt.updated_at <= ?
             AND pp.actual_end_time IS NOT NULL
           GROUP BY pt.cost_center_id`,
          [...centerIds, startDate, endDate]
        );
        hoursMap = new Map(hourResults.map(r => [r.cost_center_id, parseFloat(r.hours) || 0]));
      }

      // 获取全局人工费率（只查一次，移到循环外）
      const settings = await CostAccountingService.getCostSettings();
      const laborRate = settings.laborRate;

      const list = [];
      for (const cc of centers) {
        const actualUsed = hoursMap.get(cc.id) || 0;
        const stdCap = standardCapacityPerCenter;
        const idleCap = Math.max(stdCap - actualUsed, 0);
        const utilRate = stdCap > 0 ? (actualUsed / stdCap) * 100 : 0;
        const idleCost = idleCap * laborRate;

        list.push({
          id: cc.id,
          code: cc.code,
          cost_center_name: cc.cost_center_name,
          standard_capacity: stdCap,
          actual_used: actualUsed,
          idle_capacity: idleCap,
          utilization_rate: utilRate,
          idle_cost: idleCost,
        });
      }

      return { list, month };
    } catch (error) {
      logger.error('[CostCenter] 获取产能利用失败:', error);
      throw error;
    }
  }
}

module.exports = CostCenterService;

