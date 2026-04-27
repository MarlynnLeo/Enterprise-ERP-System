/**
 * 作业成本法(ABC)服务
 * @description 提供作业管理和ABC成本计算功能
 */

const db = require('../../config/db');
const { logger } = require('../../utils/logger');
const { softDelete } = require('../../utils/softDelete');

class ActivityCostService {
  /**
   * 获取作业列表
   */
  async getActivities(params = {}) {
    const { status, keyword } = params;

    const whereConditions = ['deleted_at IS NULL'];
    const queryParams = [];

    if (status !== undefined && status !== '') {
      whereConditions.push('status = ?');
      queryParams.push(status);
    }

    if (keyword) {
      whereConditions.push('(code LIKE ? OR name LIKE ?)');
      queryParams.push(`%${keyword}%`, `%${keyword}%`);
    }

    const query = `
      SELECT id, code, name, description, cost_pool, 
             cost_driver_type, driver_rate, status,
             created_at, updated_at
      FROM cost_activities
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY code
    `;

    try {
      const result = await db.query(query, queryParams);
      return result.rows || [];
    } catch (error) {
      logger.error('获取作业列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取单个作业详情
   */
  async getActivityById(id) {
    const query = 'SELECT * FROM cost_activities WHERE id = ? AND deleted_at IS NULL';
    const result = await db.query(query, [id]);
    return result.rows?.[0] || null;
  }

  /**
   * 创建作业
   */
  async createActivity(data) {
    const { code, name, description, cost_pool, cost_driver_type, driver_rate, status = 1 } = data;

    // 检查编码唯一性
    const existCheck = await db.query('SELECT id FROM cost_activities WHERE code = ? AND deleted_at IS NULL', [code]);
    if (existCheck.rows && existCheck.rows.length > 0) {
      throw new Error('作业编码已存在');
    }

    const query = `
      INSERT INTO cost_activities (code, name, description, cost_pool, cost_driver_type, driver_rate, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await db.query(query, [
      code,
      name,
      description || '',
      cost_pool || 0,
      cost_driver_type,
      driver_rate || 0,
      status,
    ]);
    return { id: result.insertId, code, name };
  }

  /**
   * 更新作业
   */
  async updateActivity(id, data) {
    const { code, name, description, cost_pool, cost_driver_type, driver_rate, status } = data;

    // 检查编码唯一性
    const existCheck = await db.query('SELECT id FROM cost_activities WHERE code = ? AND id != ? AND deleted_at IS NULL', [
      code,
      id,
    ]);
    if (existCheck.rows && existCheck.rows.length > 0) {
      throw new Error('作业编码已存在');
    }

    const query = `
      UPDATE cost_activities 
      SET code = ?, name = ?, description = ?, cost_pool = ?, 
          cost_driver_type = ?, driver_rate = ?, status = ?
      WHERE id = ?
    `;

    await db.query(query, [
      code,
      name,
      description || '',
      cost_pool || 0,
      cost_driver_type,
      driver_rate || 0,
      status,
      id,
    ]);
    return { id, code, name };
  }

  /**
   * 删除作业
   */
  async deleteActivity(id) {
    // 检查是否有产品关联
    const linkCheck = await db.query(
      'SELECT COUNT(*) as cnt FROM product_activities WHERE activity_id = ?',
      [id]
    );
    if (linkCheck.rows?.[0]?.cnt > 0) {
      throw new Error('该作业已关联产品，无法删除');
    }

    // ✅ 软删除替代硬删除
    await softDelete(db, 'cost_activities', 'id', id);
    return { success: true };
  }

  /**
   * 获取产品的作业关联
   */
  async getProductActivities(productId) {
    const query = `
      SELECT pa.id, pa.product_id, pa.activity_id, pa.driver_quantity,
             ca.code as activity_code, ca.name as activity_name,
             ca.cost_driver_type, ca.driver_rate,
             ROUND(pa.driver_quantity * ca.driver_rate, 2) as allocated_cost
      FROM product_activities pa
      JOIN cost_activities ca ON pa.activity_id = ca.id
      WHERE pa.product_id = ?
      ORDER BY ca.code
    `;

    const result = await db.query(query, [productId]);
    return result.rows || [];
  }

  /**
   * 设置产品的作业关联
   */
  async setProductActivities(productId, activities) {
    // 先删除旧的关联
    await db.query('DELETE FROM product_activities WHERE product_id = ?', [productId]);

    // 插入新的关联
    for (const item of activities) {
      if (item.activity_id && item.driver_quantity > 0) {
        await db.query(
          'INSERT INTO product_activities (product_id, activity_id, driver_quantity) VALUES (?, ?, ?)',
          [productId, item.activity_id, item.driver_quantity]
        );
      }
    }

    return { success: true };
  }

  /**
   * 计算产品的ABC成本
   */
  async calculateProductABCCost(productId) {
    const activities = await this.getProductActivities(productId);

    let totalABCCost = 0;
    const breakdown = activities.map((a) => {
      const cost = parseFloat(a.driver_quantity) * parseFloat(a.driver_rate);
      totalABCCost += cost;
      return {
        activityCode: a.activity_code,
        activityName: a.activity_name,
        driverType: a.cost_driver_type,
        driverQuantity: parseFloat(a.driver_quantity),
        driverRate: parseFloat(a.driver_rate),
        allocatedCost: Math.round(cost * 100) / 100,
      };
    });

    return {
      productId,
      totalABCCost: Math.round(totalABCCost * 100) / 100,
      breakdown,
    };
  }

  /**
   * 获取ABC成本汇总报表
   */
  async getABCSummaryReport() {
    const query = `
      SELECT 
        ca.id, ca.code, ca.name, ca.cost_pool, ca.cost_driver_type, ca.driver_rate,
        COALESCE(SUM(pa.driver_quantity), 0) as total_driver_quantity,
        COALESCE(SUM(pa.driver_quantity * ca.driver_rate), 0) as total_allocated_cost,
        COUNT(DISTINCT pa.product_id) as product_count
      FROM cost_activities ca
      LEFT JOIN product_activities pa ON ca.id = pa.activity_id
      WHERE ca.status = 1 AND ca.deleted_at IS NULL
      GROUP BY ca.id
      ORDER BY ca.code
    `;

    const result = await db.query(query);
    return result.rows || [];
  }

  /**
   * 获取成本动因类型选项
   */
  getDriverTypes() {
    return [
      { value: 'machine_hours', label: '机器工时' },
      { value: 'labor_hours', label: '人工工时' },
      { value: 'units', label: '生产数量' },
      { value: 'transactions', label: '作业次数' },
      { value: 'area', label: '占用面积' },
    ];
  }
}

module.exports = new ActivityCostService();
