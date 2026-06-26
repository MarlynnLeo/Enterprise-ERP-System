/**
 * AnomalyReportService.js
 * @description 装配异常 Andon 上报服务 — CRUD + 状态流转 + 编号生成
 */

const { pool } = require('../../config/db');
const { logger } = require('../../utils/logger');
const EventBus = require('../../events/EventBus');

class AnomalyReportService {
  /**
   * 生成异常编号 ANM-YYMMDD-NNN
   */
  static async generateCode() {
    const today = new Date();
    const dateStr = today.toISOString().slice(2, 10).replace(/-/g, '');
    const prefix = `ANM-${dateStr}`;
    const [rows] = await pool.query(
      'SELECT code FROM anomaly_reports WHERE code LIKE ? ORDER BY id DESC LIMIT 1',
      [`${prefix}-%`]
    );
    const lastSeq = rows.length > 0 ? parseInt(rows[0].code.split('-').pop(), 10) : 0;
    return `${prefix}-${String(lastSeq + 1).padStart(3, '0')}`;
  }

  /** 列表查询（分页 + 筛选） */
  static async getList(params = {}) {
    const page = parseInt(params.page, 10) || 1;
    const pageSize = parseInt(params.pageSize, 10) || 20;
    const { status, category, severity, keyword } = params;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE ar.deleted_at IS NULL';
    const values = [];

    if (status) { where += ' AND ar.status = ?'; values.push(status); }
    if (category) { where += ' AND ar.category = ?'; values.push(category); }
    if (severity) { where += ' AND ar.severity = ?'; values.push(severity); }
    if (keyword) {
      where += ' AND (ar.title LIKE ? OR ar.code LIKE ?)';
      values.push(`%${keyword}%`, `%${keyword}%`);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM anomaly_reports ar ${where}`, values
    );

    const [list] = await pool.query(
      `SELECT ar.id, ar.code, ar.task_id, ar.category, ar.severity, ar.title,
              ar.description, ar.location, ar.images, ar.status, ar.reported_by,
              ar.assigned_to, ar.resolution, ar.resolved_at, ar.resolved_by,
              ar.created_at, ar.updated_at,
              u1.real_name AS reporter_name,
              u2.real_name AS assignee_name,
              pt.code AS task_code
       FROM anomaly_reports ar
       LEFT JOIN users u1 ON ar.reported_by = u1.id
       LEFT JOIN users u2 ON ar.assigned_to = u2.id
       LEFT JOIN production_tasks pt ON ar.task_id = pt.id
       ${where}
       ORDER BY ar.created_at DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return { list, total, page, pageSize };
  }

  /** 详情 */
  static async getById(id) {
    const [rows] = await pool.query(
      `SELECT ar.*, u1.real_name AS reporter_name, u2.real_name AS assignee_name,
              u3.real_name AS resolver_name, pt.code AS task_code
       FROM anomaly_reports ar
       LEFT JOIN users u1 ON ar.reported_by = u1.id
       LEFT JOIN users u2 ON ar.assigned_to = u2.id
       LEFT JOIN users u3 ON ar.resolved_by = u3.id
       LEFT JOIN production_tasks pt ON ar.task_id = pt.id
       WHERE ar.id = ? AND ar.deleted_at IS NULL`,
      [id]
    );
    return rows[0] || null;
  }

  /** 创建异常报告 */
  static async create(data, userId) {
    const code = await this.generateCode();
    const [result] = await pool.query(
      `INSERT INTO anomaly_reports (code, task_id, category, severity, title, description, location, images, reported_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, data.task_id || null, data.category, data.severity || 'medium',
       data.title, data.description, data.location || null,
       data.images ? JSON.stringify(data.images) : null, userId]
    );

    // 发送事件通知
    EventBus.emit('ANOMALY_REPORTED', {
      anomalyId: result.insertId,
      code,
      title: data.title,
      category: data.category,
      severity: data.severity || 'medium',
      reporterName: data.reporterName || '',
      location: data.location || '',
    });

    logger.info(`[Andon] 异常上报 ${code}: ${data.title} (${data.severity})`);
    return this.getById(result.insertId);
  }

  /** 指派处理人 (open → processing) */
  static async assign(id, assignedTo) {
    const [result] = await pool.query(
      `UPDATE anomaly_reports SET assigned_to = ?, status = 'processing', updated_at = NOW()
       WHERE id = ? AND status = 'open' AND deleted_at IS NULL`,
      [assignedTo, id]
    );
    if (result.affectedRows === 0) {
      throw new Error('指派失败: 异常报告不存在或当前状态不允许指派(仅 open 状态可指派)');
    }
    return this.getById(id);
  }

  /** 解决异常 (processing → resolved) */
  static async resolve(id, data, userId) {
    const [result] = await pool.query(
      `UPDATE anomaly_reports SET resolution = ?, status = 'resolved', resolved_by = ?, resolved_at = NOW(), updated_at = NOW()
       WHERE id = ? AND status = 'processing' AND deleted_at IS NULL`,
      [data.resolution, userId, id]
    );
    if (result.affectedRows === 0) {
      throw new Error('解决失败: 异常报告不存在或当前状态不允许解决(仅 processing 状态可解决)');
    }
    return this.getById(id);
  }

  /** 关闭异常 (resolved → closed) */
  static async close(id) {
    const [result] = await pool.query(
      `UPDATE anomaly_reports SET status = 'closed', updated_at = NOW()
       WHERE id = ? AND status = 'resolved' AND deleted_at IS NULL`,
      [id]
    );
    if (result.affectedRows === 0) {
      throw new Error('关闭失败: 异常报告不存在或当前状态不允许关闭(仅 resolved 状态可关闭)');
    }
    return this.getById(id);
  }

  /** 软删除 */
  static async delete(id) {
    await pool.query(
      'UPDATE anomaly_reports SET deleted_at = NOW() WHERE id = ?', [id]
    );
  }

  /** 统计仪表板 */
  static async getStats() {
    const [rows] = await pool.query(
      `SELECT status, COUNT(*) AS count FROM anomaly_reports WHERE deleted_at IS NULL GROUP BY status`
    );
    const stats = { open: 0, processing: 0, resolved: 0, closed: 0 };
    rows.forEach(r => { stats[r.status] = r.count; });
    return stats;
  }
}

module.exports = AnomalyReportService;
