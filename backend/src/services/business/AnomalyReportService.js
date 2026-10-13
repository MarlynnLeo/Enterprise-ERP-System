/**
 * AnomalyReportService.js
 * @description 装配异常 Andon 上报服务 — CRUD + 状态流转 + 编号生成
 */

const { pool } = require('../../config/db');
const { logger } = require('../../utils/logger');
const EventBus = require('../../events/EventBus');
const ScopeGuard = require('../../authorization/ScopeGuard');
const FileAccessService = require('../FileAccessService');
const { parsePagination, appendPaginationSQL } = require('../../utils/safePagination');

const TASK_CONTEXT_FIELDS = `pt.plan_id, pl.code AS plan_code, pl.name AS plan_name,
  pt.product_id, m.code AS product_code, m.name AS product_name, m.specs AS specification,
  pt.manager, (SELECT GROUP_CONCAT(pr.process_name ORDER BY pr.sequence SEPARATOR ' / ')
    FROM production_processes pr WHERE pr.task_id = pt.id) AS process_name`;
const TASK_CONTEXT_JOINS = `LEFT JOIN production_plans pl ON pt.plan_id = pl.id AND pl.deleted_at IS NULL
  LEFT JOIN materials m ON pt.product_id = m.id`;

function validationError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function normalizeImages(images) {
  if (images === undefined || images === null) return [];
  if (!Array.isArray(images) || images.length > 5) throw validationError('现场照片最多上传 5 张');
  const paths = images.map((image) => {
    if (
      typeof image !== 'string' ||
      !/^\/uploads\/anomalies\/[a-zA-Z0-9_-]+\.(jpe?g|png|gif|bmp|webp)$/i.test(image)
    ) {
      throw validationError('现场照片必须先通过图片上传功能上传');
    }
    return image;
  });
  if (new Set(paths).size !== paths.length) throw validationError('请勿重复添加同一张现场照片');
  return paths;
}

class AnomalyReportService {
  /**
   * 生成异常编号 ANM-YYMMDD-NNN
   */
  static async generateCode(connection = pool) {
    const today = new Date();
    const dateStr = today.toISOString().slice(2, 10).replace(/-/g, '');
    const prefix = `ANM-${dateStr}`;
    const [rows] = await connection.query(
      'SELECT code FROM anomaly_reports WHERE code LIKE ? ORDER BY id DESC LIMIT 1',
      [`${prefix}-%`]
    );
    const lastSeq = rows.length > 0 ? parseInt(rows[0].code.split('-').pop(), 10) : 0;
    return `${prefix}-${String(lastSeq + 1).padStart(3, '0')}`;
  }

  /** 只提供上报所需的任务上下文，使用与关联写入相同的数据范围。 */
  static async getTaskOptions(params = {}, req) {
    const pagination = parsePagination(params.page, params.pageSize, { maxPageSize: 50 });
    const scope = await ScopeGuard.applyListScope(req, 'production_task', {
      tableAlias: 'pt',
      ownerAlias: 'anomaly_task_owner_scope',
    });
    let where = 'WHERE pt.deleted_at IS NULL';
    const values = [];
    if (params.taskId !== undefined || params.task_id !== undefined) {
      const taskId = Number(params.taskId ?? params.task_id);
      if (!Number.isSafeInteger(taskId) || taskId <= 0) {
        return { list: [], total: 0, page: pagination.page, pageSize: pagination.pageSize };
      }
      where += ' AND pt.id = ?';
      values.push(taskId);
    }
    const keyword = typeof params.keyword === 'string' ? params.keyword.trim().slice(0, 100) : '';
    if (keyword) {
      where +=
        ' AND (pt.code LIKE ? OR pl.code LIKE ? OR m.code LIKE ? OR m.name LIKE ? OR pt.manager LIKE ?)';
      values.push(...Array(5).fill(`%${keyword}%`));
    }
    where += scope.where || '';
    values.push(...(scope.params || []));
    const from = `FROM production_tasks pt ${TASK_CONTEXT_JOINS} ${scope.join || ''} ${where}`;
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from}`, values);
    const [list] = await pool.query(
      appendPaginationSQL(
        `SELECT pt.id, pt.code, pt.status, ${TASK_CONTEXT_FIELDS} ${from}
       ORDER BY CASE WHEN pt.status = 'in_progress' THEN 0 WHEN pt.status IN ('completed', 'cancelled') THEN 2 ELSE 1 END,
       pt.created_at DESC, pt.id DESC`,
        pagination.limit,
        pagination.offset
      ),
      values
    );
    return { list, total, page: pagination.page, pageSize: pagination.pageSize };
  }

  /** 列表查询（分页 + 筛选） */
  static async getList(params = {}) {
    const page = parseInt(params.page, 10) || 1;
    const pageSize = parseInt(params.pageSize, 10) || 20;
    const { status, category, severity, keyword } = params;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE ar.deleted_at IS NULL';
    const values = [];

    if (status) {
      where += ' AND ar.status = ?';
      values.push(status);
    }
    if (category) {
      where += ' AND ar.category = ?';
      values.push(category);
    }
    if (severity) {
      where += ' AND ar.severity = ?';
      values.push(severity);
    }
    if (keyword) {
      where += ' AND (ar.title LIKE ? OR ar.code LIKE ? OR pt.code LIKE ?)';
      values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM anomaly_reports ar
       LEFT JOIN production_tasks pt ON ar.task_id = pt.id ${where}`,
      values
    );

    const [list] = await pool.query(
      `SELECT ar.id, ar.code, ar.task_id, ar.category, ar.severity, ar.title,
              ar.description, ar.location, ar.images, ar.status, ar.reported_by,
              ar.assigned_to, ar.resolution, ar.resolved_at, ar.resolved_by,
              ar.created_at, ar.updated_at,
              u1.real_name AS reporter_name,
              u2.real_name AS assignee_name,
              pt.code AS task_code, ${TASK_CONTEXT_FIELDS}
       FROM anomaly_reports ar
       LEFT JOIN users u1 ON ar.reported_by = u1.id
       LEFT JOIN users u2 ON ar.assigned_to = u2.id
       LEFT JOIN production_tasks pt ON ar.task_id = pt.id
       ${TASK_CONTEXT_JOINS}
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
              u3.real_name AS resolver_name, pt.code AS task_code, ${TASK_CONTEXT_FIELDS}
       FROM anomaly_reports ar
       LEFT JOIN users u1 ON ar.reported_by = u1.id
       LEFT JOIN users u2 ON ar.assigned_to = u2.id
       LEFT JOIN users u3 ON ar.resolved_by = u3.id
       LEFT JOIN production_tasks pt ON ar.task_id = pt.id
       ${TASK_CONTEXT_JOINS}
       WHERE ar.id = ? AND ar.deleted_at IS NULL`,
      [id]
    );
    return rows[0] || null;
  }

  /** 创建异常报告 */
  static async create(data = {}, userId, req) {
    const rawTaskId = data.task_id ?? data.taskId;
    const taskId =
      rawTaskId === undefined || rawTaskId === null || rawTaskId === '' ? null : Number(rawTaskId);
    if (taskId !== null && (!Number.isSafeInteger(taskId) || taskId <= 0)) {
      throw validationError('请选择有效的生产任务');
    }
    const images = normalizeImages(data.images);
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    if (!title || title.length > 200) throw validationError('请填写 200 字以内的异常标题');
    if (
      !['quality', 'equipment', 'material', 'safety', 'process', 'other'].includes(data.category)
    ) {
      throw validationError('请选择异常类别');
    }
    const severity = data.severity || 'medium';
    if (!['low', 'medium', 'high', 'critical'].includes(severity))
      throw validationError('请选择严重程度');
    const description = typeof data.description === 'string' ? data.description.trim() : '';
    if (!description) throw validationError('请填写异常描述');
    const location = typeof data.location === 'string' ? data.location.trim() : '';
    if (location.length > 100) throw validationError('发生位置不能超过 100 字');
    if (Buffer.byteLength(description, 'utf8') > 65535) throw validationError('异常描述过长');

    const connection = await pool.getConnection();
    let result;
    let code;
    try {
      await connection.beginTransaction();
      if (taskId !== null) {
        if (!req || !(await ScopeGuard.assertAccess(connection, req, 'production_task', taskId))) {
          throw Object.assign(new Error('生产任务不存在或无权为该任务上报异常'), {
            statusCode: 403,
          });
        }
        const [[task]] = await connection.query(
          'SELECT id FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
          [taskId]
        );
        if (!task) throw validationError('生产任务不存在或已删除，请重新选择');
      }
      code = await this.generateCode(connection);
      [result] = await connection.query(
        `INSERT INTO anomaly_reports (code, task_id, category, severity, title, description, location, images, reported_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          code,
          taskId,
          data.category,
          severity,
          title,
          description,
          location || null,
          JSON.stringify(images),
          userId,
        ]
      );
      for (const fileUrl of images) {
        try {
          await FileAccessService.bindExistingUploadInTransaction(connection, {
            userId,
            fileUrl,
            businessType: 'anomaly_report',
            businessId: result.insertId,
          });
        } catch (error) {
          if (
            [
              'FILE_ACCESS_RECORD_NOT_FOUND',
              'FILE_ACCESS_BINDING_CONFLICT',
              'FILE_OWNER_MISMATCH',
              'INVALID_FILE_REFERENCE',
            ].includes(error.code)
          ) {
            throw validationError('现场照片无效、已被使用或不属于当前用户，请重新上传');
          }
          throw error;
        }
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

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
    await pool.query('UPDATE anomaly_reports SET deleted_at = NOW() WHERE id = ?', [id]);
  }

  /** 统计仪表板 */
  static async getStats() {
    const [rows] = await pool.query(
      `SELECT status, COUNT(*) AS count FROM anomaly_reports WHERE deleted_at IS NULL GROUP BY status`
    );
    const stats = { open: 0, processing: 0, resolved: 0, closed: 0 };
    rows.forEach((r) => {
      stats[r.status] = r.count;
    });
    return stats;
  }
}

module.exports = AnomalyReportService;
