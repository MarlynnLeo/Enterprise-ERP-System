/**
 * WorkStationService.js
 * @description 工位管理服务
 * @date 2026-06-23
 */

const { pool } = require('../../config/db');

class WorkStationService {
  /**
   * 获取工位列表
   */
  static async getList(params = {}) {
    const page = parseInt(params.page, 10) || 1;
    const pageSize = parseInt(params.pageSize, 10) || 20;
    const { lineCode, stationType, isActive, keyword } = params;
    const offset = (page - 1) * pageSize;

    let where = 'WHERE 1=1';
    const values = [];

    if (lineCode) {
      where += ' AND ws.line_code = ?';
      values.push(lineCode);
    }
    if (stationType) {
      where += ' AND ws.station_type = ?';
      values.push(stationType);
    }
    if (isActive !== undefined && isActive !== '') {
      where += ' AND ws.is_active = ?';
      values.push(parseInt(isActive, 10));
    }
    if (keyword) {
      where += ' AND (ws.code LIKE ? OR ws.name LIKE ?)';
      values.push(`%${keyword}%`, `%${keyword}%`);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM work_stations ws ${where}`,
      values
    );

    const [list] = await pool.query(
      `SELECT ws.id, ws.code, ws.name, ws.line_code, ws.line_name,
              ws.station_type, ws.capacity, ws.equipment_id, ws.is_active,
              ws.sort_order, ws.description, ws.created_at, ws.updated_at,
              e.name AS equipment_name
       FROM work_stations ws
       LEFT JOIN equipment e ON ws.equipment_id = e.id
       ${where}
       ORDER BY ws.sort_order ASC, ws.code ASC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return { list, total, page, pageSize };
  }

  /**
   * 获取工位详情
   */
  static async getById(id) {
    const [rows] = await pool.query(
      `SELECT ws.*, e.name AS equipment_name
       FROM work_stations ws
       LEFT JOIN equipment e ON ws.equipment_id = e.id
       WHERE ws.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * 创建工位
   */
  static async create(data) {
    const {
      code,
      name,
      line_code,
      line_name,
      station_type,
      capacity,
      equipment_id,
      sort_order,
      description,
    } = data;
    const [result] = await pool.query(
      `INSERT INTO work_stations (code, name, line_code, line_name, station_type, capacity, equipment_id, sort_order, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        name,
        line_code || null,
        line_name || null,
        station_type || 'assembly',
        capacity || 1,
        equipment_id || null,
        sort_order || 0,
        description || null,
      ]
    );
    return this.getById(result.insertId);
  }

  /**
   * 更新工位
   */
  static async update(id, data) {
    const fields = [];
    const values = [];
    const allowedFields = [
      'code',
      'name',
      'line_code',
      'line_name',
      'station_type',
      'capacity',
      'equipment_id',
      'is_active',
      'sort_order',
      'description',
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(data[field]);
      }
    }

    if (fields.length === 0) return this.getById(id);

    values.push(id);
    await pool.query(`UPDATE work_stations SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.getById(id);
  }

  /**
   * 删除工位
   */
  static async delete(id) {
    // 检查是否有正在执行的装配任务使用此工位
    const [[{ count }]] = await pool.query(
      `SELECT COUNT(*) as count FROM assembly_task_steps WHERE station_id = ? AND status IN ('pending', 'in_progress')`,
      [id]
    );
    if (count > 0) {
      throw new Error('该工位有正在执行的装配任务，无法删除');
    }
    await pool.query('DELETE FROM work_stations WHERE id = ?', [id]);
    return { success: true };
  }

  /**
   * 获取所有产线
   */
  static async getLines() {
    const [rows] = await pool.query(
      `SELECT DISTINCT line_code, line_name, COUNT(*) as station_count
       FROM work_stations
       WHERE line_code IS NOT NULL AND is_active = 1
       GROUP BY line_code, line_name
       ORDER BY line_code`
    );
    return rows;
  }

  /**
   * 获取工位实时状态 (空闲/忙碌)
   */
  static async getStationStatus() {
    const [rows] = await pool.query(
      `SELECT ws.id, ws.code, ws.name, ws.line_code, ws.line_name, ws.station_type,
              CASE WHEN ats.id IS NOT NULL THEN 'busy' ELSE 'idle' END AS current_status,
              ats.task_id AS current_task_id,
              pt.code AS current_task_code,
              ats.step_name AS current_step_name,
              u.real_name AS current_operator
       FROM work_stations ws
       LEFT JOIN assembly_task_steps ats ON ws.id = ats.station_id AND ats.status = 'in_progress'
       LEFT JOIN production_tasks pt ON ats.task_id = pt.id
       LEFT JOIN users u ON ats.operator_id = u.id
       WHERE ws.is_active = 1
       ORDER BY ws.sort_order ASC, ws.code ASC`
    );
    return rows;
  }
}

module.exports = WorkStationService;
