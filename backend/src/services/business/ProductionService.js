/**
 * 生产管理服务层
 * 处理生产相关的业务逻辑
 */

const { pool } = require('../../config/db');
const { softDelete } = require('../../utils/softDelete');

class ProductionService {
  /**
   * 获取生产计划列表
   */
  async getProductionPlans(params = {}) {
    const connection = await pool.getConnection();
    try {
      const { page = 1, pageSize = 10, status, code, productName } = params;
      const safePage = Math.max(1, parseInt(page, 10) || 1);
      const safePageSize = Math.max(1, Math.min(10000, parseInt(pageSize, 10) || 10));
      const offset = (safePage - 1) * safePageSize;

      let whereClause = 'WHERE 1=1';
      const queryParams = [];

      if (status) {
        whereClause += ' AND pp.status = ?';
        queryParams.push(status);
      }

      if (code) {
        whereClause += ' AND pp.code LIKE ?';
        queryParams.push(`%${code}%`);
      }

      if (productName) {
        whereClause += ' AND p.name LIKE ?';
        queryParams.push(`%${productName}%`);
      }

      // 获取总数
      const countQuery = `
        SELECT COUNT(*) as total
        FROM production_plans pp
        LEFT JOIN materials p ON pp.product_id = p.id
        ${whereClause}
      `;

      const [countResult] = await connection.query(countQuery, queryParams);
      const total = countResult[0].total;

      // 获取数据
      const dataQuery = `
        SELECT pp.*, p.name as productName, p.code as productCode, p.specs, u.name as unit
        FROM production_plans pp
        LEFT JOIN materials p ON pp.product_id = p.id
        LEFT JOIN units u ON p.unit_id = u.id
        ${whereClause}
        ORDER BY pp.created_at DESC
        LIMIT ${safePageSize} OFFSET ${offset}
      `;

      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
      const [rows] = await connection.query(dataQuery, queryParams);

      return {
        data: rows,
        total,
        page,
        pageSize,
      };
    } finally {
      connection.release();
    }
  }

  /**
   * 创建生产计划
   */
  async createProductionPlan(planData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const {
        code,
        name,
        productId,
        quantity,
        startDate,
        endDate,
        priority = 'normal',
        description = '',
        bomId,
      } = planData;

      // 插入生产计划
      const insertQuery = `
        INSERT INTO production_plans (
          code, name, product_id, quantity, start_date, end_date,
          priority, description, bom_id, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())
      `;

      const [result] = await connection.query(insertQuery, [
        code,
        name,
        productId,
        quantity,
        startDate,
        endDate,
        priority,
        description,
        bomId,
      ]);

      await connection.commit();
      return { id: result.insertId, ...planData };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 更新生产计划
   */
  async updateProductionPlan(id, planData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { name, productId, quantity, startDate, endDate, priority, description, status } =
        planData;

      const updateQuery = `
        UPDATE production_plans SET
          name = ?, product_id = ?, quantity = ?, start_date = ?,
          end_date = ?, priority = ?, description = ?, status = ?,
          updated_at = NOW()
        WHERE id = ?
      `;

      await connection.query(updateQuery, [
        name,
        productId,
        quantity,
        startDate,
        endDate,
        priority,
        description,
        status,
        id,
      ]);

      await connection.commit();
      return { id, ...planData };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 删除生产计划
   */
  async deleteProductionPlan(id) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 检查是否有关联的生产任务
      const [tasks] = await connection.query(
        'SELECT COUNT(*) as count FROM production_tasks WHERE plan_id = ?',
        [id]
      );

      if (tasks[0].count > 0) {
        throw new Error('该生产计划下存在生产任务，无法删除');
      }

      // ✅ 软删除替代硬删除
      await softDelete(connection, 'production_plans', 'id', id);

      await connection.commit();
      return { success: true };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 获取生产任务列表
   */
  async getProductionTasks(params = {}) {
    const connection = await pool.getConnection();
    try {
      const { page = 1, pageSize = 10, status, planId } = params;
      const safePage = Math.max(1, parseInt(page, 10) || 1);
      const safePageSize = Math.max(1, Math.min(10000, parseInt(pageSize, 10) || 10));
      const offset = (safePage - 1) * safePageSize;

      let whereClause = 'WHERE 1=1';
      const queryParams = [];

      if (status) {
        whereClause += ' AND pt.status = ?';
        queryParams.push(status);
      }

      if (planId) {
        whereClause += ' AND pt.plan_id = ?';
        queryParams.push(planId);
      }

      // 获取总数
      const countQuery = `
        SELECT COUNT(*) as total
        FROM production_tasks pt
        ${whereClause}
      `;

      const [countResult] = await connection.query(countQuery, queryParams);
      const total = countResult[0].total;

      // 获取数据
      const dataQuery = `
        SELECT pt.*, pp.name as planName, p.name as productName, p.code as productCode
        FROM production_tasks pt
        LEFT JOIN production_plans pp ON pt.plan_id = pp.id
        LEFT JOIN materials p ON pt.product_id = p.id
        ${whereClause}
        ORDER BY pt.created_at DESC
        LIMIT ${safePageSize} OFFSET ${offset}
      `;

      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
      const [rows] = await connection.query(dataQuery, queryParams);

      return {
        data: rows,
        total,
        page,
        pageSize,
      };
    } finally {
      connection.release();
    }
  }

  /**
   * 创建生产任务
   */
  async createProductionTask(taskData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const {
        code,
        planId,
        productId,
        quantity,
        startDate,
        endDate,
        workstationId,
        priority = 'normal',
        description = '',
      } = taskData;

      // 根据产品的生产组自动获取对应的成本中心
      let costCenterId = taskData.costCenterId || null;
      if (!costCenterId && productId) {
        const [ccResult] = await connection.query(
          `
          SELECT cc.id as cost_center_id
          FROM materials m
          JOIN cost_centers cc ON cc.department_id = m.production_group_id
          WHERE m.id = ?
        `,
          [productId]
        );
        if (ccResult.length > 0) {
          costCenterId = ccResult[0].cost_center_id;
        }
      }

      const insertQuery = `
        INSERT INTO production_tasks (
          code, plan_id, product_id, quantity, start_date, end_date,
          workstation_id, priority, description, cost_center_id, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())
      `;

      const [result] = await connection.query(insertQuery, [
        code,
        planId,
        productId,
        quantity,
        startDate,
        endDate,
        workstationId,
        priority,
        description,
        costCenterId,
      ]);

      await connection.commit();
      return { id: result.insertId, costCenterId, ...taskData };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 计算物料需求
   */
  async calculateMaterials(productId, quantity) {
    const connection = await pool.getConnection();
    try {
      // 获取BOM信息
      const bomQuery = `
        SELECT bi.material_id, bi.quantity as bomQuantity, m.name, m.code, m.specs, u.name as unit
        FROM bom_details bi
        JOIN materials m ON bi.material_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        WHERE bi.bom_id = (
          SELECT id FROM bom_masters WHERE product_id = ? AND status = 'active' LIMIT 1
        )
      `;

      const [bomItems] = await connection.query(bomQuery, [productId]);

      // 计算需求量
      const requirements = bomItems.map((item) => ({
        materialId: item.material_id,
        materialName: item.name,
        materialCode: item.code,
        specs: item.specs,
        unit: item.unit,
        bomQuantity: item.bomQuantity,
        requiredQuantity: item.bomQuantity * quantity,
      }));

      return requirements;
    } finally {
      connection.release();
    }
  }

  /**
   * 获取设备状态
   */
  async getEquipmentStatus() {
    const connection = await pool.getConnection();
    try {
      const query = `
        SELECT e.*, es.status, es.last_update
        FROM equipment e
        LEFT JOIN equipment_status es ON e.id = es.equipment_id
        ORDER BY e.name
      `;

      const [rows] = await connection.query(query);
      return rows;
    } finally {
      connection.release();
    }
  }
}

module.exports = new ProductionService();
