/**
 * ProcessRouteService.js
 * @description 工序路线管理服务
 * @date 2026-06-23
 */

const { pool } = require('../../config/db');
const { logger } = require('../../utils/logger');

class ProcessRouteService {
  // ==================== 工序路线 CRUD ====================

  /**
   * 获取工序路线列表
   */
  static async getList(params = {}) {
    const page = parseInt(params.page, 10) || 1;
    const pageSize = parseInt(params.pageSize, 10) || 20;
    const { productId, isActive, keyword } = params;
    const offset = (page - 1) * pageSize;

    let where = 'WHERE pr.deleted_at IS NULL';
    const values = [];

    if (productId) { where += ' AND pr.product_id = ?'; values.push(productId); }
    if (isActive !== undefined && isActive !== '') {
      where += ' AND pr.is_active = ?';
      values.push(parseInt(isActive, 10));
    }
    if (keyword) {
      where += ' AND (pr.name LIKE ? OR m.name LIKE ? OR m.code LIKE ?)';
      values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total
       FROM process_routes pr
       LEFT JOIN materials m ON pr.product_id = m.id
       ${where}`, values
    );

    const [list] = await pool.query(
      `SELECT pr.id, pr.product_id, pr.version, pr.name, pr.is_active,
              pr.total_standard_minutes, pr.created_at, pr.updated_at,
              m.name AS product_name, m.code AS product_code,
              (SELECT COUNT(*) FROM process_route_steps WHERE route_id = pr.id) AS step_count
       FROM process_routes pr
       LEFT JOIN materials m ON pr.product_id = m.id
       ${where}
       ORDER BY pr.created_at DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return { list, total, page, pageSize };
  }

  /**
   * 获取路线详情（含步骤 + 物料）
   */
  static async getById(id) {
    const [routes] = await pool.query(
      `SELECT pr.*, m.name AS product_name, m.code AS product_code
       FROM process_routes pr
       LEFT JOIN materials m ON pr.product_id = m.id
       WHERE pr.id = ? AND pr.deleted_at IS NULL`,
      [id]
    );
    if (routes.length === 0) return null;

    const route = routes[0];

    // 获取工序步骤
    const [steps] = await pool.query(
      `SELECT prs.*, ws.code AS station_code, ws.name AS station_name
       FROM process_route_steps prs
       LEFT JOIN work_stations ws ON prs.station_id = ws.id
       WHERE prs.route_id = ?
       ORDER BY prs.sequence ASC`,
      [id]
    );

    // 获取每步骤的物料
    for (const step of steps) {
      const [materials] = await pool.query(
        `SELECT psm.id, psm.material_id, psm.quantity, psm.is_scan_required,
                mt.code AS material_code, mt.name AS material_name
         FROM process_step_materials psm
         LEFT JOIN materials mt ON psm.material_id = mt.id
         WHERE psm.step_id = ?`,
        [step.id]
      );
      step.materials = materials;
    }

    route.steps = steps;
    return route;
  }

  /**
   * 创建工序路线
   */
  static async create(data, userId) {
    const { product_id, version, name, steps } = data;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 创建路线
      const [result] = await connection.query(
        `INSERT INTO process_routes (product_id, version, name, created_by)
         VALUES (?, ?, ?, ?)`,
        [product_id, version || 'V1.0', name, userId]
      );
      const routeId = result.insertId;

      // 创建步骤
      let totalMinutes = 0;
      if (Array.isArray(steps)) {
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const seq = step.sequence || (i + 1);
          const minutes = parseFloat(step.standard_minutes) || 0;
          totalMinutes += minutes;

          const [stepResult] = await connection.query(
            `INSERT INTO process_route_steps
             (route_id, sequence, step_name, step_code, station_id, standard_minutes, description, sop_content, sop_images)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [routeId, seq, step.step_name, step.step_code || null,
             step.station_id || null, minutes, step.description || null,
             step.sop_content || null, step.sop_images ? JSON.stringify(step.sop_images) : null]
          );

          // 创建工序物料
          if (Array.isArray(step.materials)) {
            for (const mat of step.materials) {
              await connection.query(
                `INSERT INTO process_step_materials (step_id, material_id, quantity, is_scan_required)
                 VALUES (?, ?, ?, ?)`,
                [stepResult.insertId, mat.material_id, mat.quantity || 1, mat.is_scan_required ? 1 : 0]
              );
            }
          }
        }
      }

      // 更新总工时
      await connection.query(
        'UPDATE process_routes SET total_standard_minutes = ? WHERE id = ?',
        [totalMinutes, routeId]
      );

      await connection.commit();
      return this.getById(routeId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 更新工序路线
   */
  static async update(id, data, userId) {
    const { name, version, is_active, steps } = data;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 更新路线基本信息
      const fields = [];
      const values = [];
      if (name !== undefined) { fields.push('name = ?'); values.push(name); }
      if (version !== undefined) { fields.push('version = ?'); values.push(version); }
      if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active); }

      if (fields.length > 0) {
        values.push(id);
        await connection.query(
          `UPDATE process_routes SET ${fields.join(', ')} WHERE id = ?`, values
        );
      }

      // 如果提供了 steps，重建步骤
      if (Array.isArray(steps)) {
        // 删除旧步骤（级联删除物料）
        await connection.query('DELETE FROM process_route_steps WHERE route_id = ?', [id]);

        let totalMinutes = 0;
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const seq = step.sequence || (i + 1);
          const minutes = parseFloat(step.standard_minutes) || 0;
          totalMinutes += minutes;

          const [stepResult] = await connection.query(
            `INSERT INTO process_route_steps
             (route_id, sequence, step_name, step_code, station_id, standard_minutes, description, sop_content, sop_images)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, seq, step.step_name, step.step_code || null,
             step.station_id || null, minutes, step.description || null,
             step.sop_content || null, step.sop_images ? JSON.stringify(step.sop_images) : null]
          );

          if (Array.isArray(step.materials)) {
            for (const mat of step.materials) {
              await connection.query(
                `INSERT INTO process_step_materials (step_id, material_id, quantity, is_scan_required)
                 VALUES (?, ?, ?, ?)`,
                [stepResult.insertId, mat.material_id, mat.quantity || 1, mat.is_scan_required ? 1 : 0]
              );
            }
          }
        }

        await connection.query(
          'UPDATE process_routes SET total_standard_minutes = ? WHERE id = ?',
          [totalMinutes, id]
        );
      }

      await connection.commit();
      return this.getById(id);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 删除工序路线（软删除）
   */
  static async delete(id) {
    // 检查是否有正在执行的装配任务
    const [[{ count }]] = await pool.query(
      `SELECT COUNT(*) as count FROM assembly_task_steps ats
       JOIN process_route_steps prs ON ats.route_step_id = prs.id
       WHERE prs.route_id = ? AND ats.status IN ('pending', 'in_progress')`,
      [id]
    );
    if (count > 0) {
      throw new Error('该工序路线有正在执行的装配任务，无法删除');
    }
    await pool.query('UPDATE process_routes SET deleted_at = NOW() WHERE id = ?', [id]);
    return { success: true };
  }

  /**
   * 获取产品的活跃工序路线
   */
  static async getActiveByProduct(productId) {
    const [routes] = await pool.query(
      `SELECT id FROM process_routes
       WHERE product_id = ? AND is_active = 1 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [productId]
    );
    if (routes.length === 0) return null;
    return this.getById(routes[0].id);
  }

  /**
   * 从 BOM 自动生成工序物料分配建议
   */
  static async suggestMaterialsFromBom(productId) {
    const [materials] = await pool.query(
      `SELECT bd.material_id, bd.quantity, bd.level,
              m.code AS material_code, m.name AS material_name
       FROM bom_details bd
       JOIN bom_masters bm ON bd.bom_id = bm.id
       JOIN materials m ON bd.material_id = m.id
       WHERE bm.product_id = ? AND bm.status = 1 AND bm.deleted_at IS NULL
       ORDER BY bd.level ASC, bd.id ASC`,
      [productId]
    );
    return materials;
  }
}

module.exports = ProcessRouteService;
