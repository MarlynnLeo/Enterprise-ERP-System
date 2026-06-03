/**
 * AuditService.js
 * @description 操作审计日志服务
 * @date 2026-01-12
 * @version 1.0.0
 */

const { getConnection } = require('../config/db');
const { logger } = require('../utils/logger');
const { parsePagination, appendPaginationSQL } = require('../utils/safePagination');

/**
 * 审计操作类型枚举
 */
const AuditAction = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  VIEW: 'view',
  EXPORT: 'export',
  IMPORT: 'import',
  APPROVE: 'approve',
  REJECT: 'reject',
  SUBMIT: 'submit',
  CANCEL: 'cancel',
  PRINT: 'print',
  LOGIN: 'login',
  LOGOUT: 'logout',
};

/**
 * 审计模块枚举
 */
const AuditModule = {
  PRICING: 'pricing',
  SALES_ORDER: 'sales_order',
  PURCHASE_ORDER: 'purchase_order',
  INVENTORY: 'inventory',
  PRODUCTION: 'production',
  MATERIAL: 'material',
  BOM: 'bom',
  CUSTOMER: 'customer',
  SUPPLIER: 'supplier',
  FINANCE: 'finance',
  USER: 'user',
  SYSTEM: 'system',
};

class AuditService {
  /**
   * 记录审计日志
   * @param {Object} params - 审计参数
   * @param {number} params.userId - 用户ID
   * @param {string} params.username - 用户名
   * @param {string} params.module - 模块名称
   * @param {string} params.action - 操作类型
   * @param {string} params.entityType - 实体类型
   * @param {string} params.entityId - 实体ID
   * @param {Object} params.oldValue - 旧值
   * @param {Object} params.newValue - 新值
   * @param {string} params.ipAddress - IP地址
   * @param {string} params.userAgent - User Agent
   */
  static async log(params) {
    let connection;
    try {
      const {
        userId,
        username,
        module,
        action,
        entityType,
        entityId,
        oldValue,
        newValue,
        ipAddress,
        userAgent,
      } = params;

      connection = await getConnection();
      await connection.query(
        `INSERT INTO audit_logs
                 (user_id, username, module, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId || null,
          username || null,
          module,
          action,
          entityType || null,
          entityId || null,
          oldValue ? JSON.stringify(oldValue) : null,
          newValue ? JSON.stringify(newValue) : null,
          ipAddress || null,
          userAgent || null,
        ]
      );

      logger.debug(`审计日志: ${module}/${action} - ${entityType}:${entityId}`);
    } catch (error) {
      // 审计失败不应影响业务流程，只记录错误
      logger.error('记录审计日志失败:', error);
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * 从请求对象创建审计日志
   * @param {Object} req - Express 请求对象
   * @param {string} module - 模块名称
   * @param {string} action - 操作类型
   * @param {string} entityType - 实体类型
   * @param {string} entityId - 实体ID
   * @param {Object} oldValue - 旧值
   * @param {Object} newValue - 新值
   */
  static async logFromRequest(
    req,
    module,
    action,
    entityType,
    entityId,
    oldValue = null,
    newValue = null
  ) {
    const userId = req.user?.id;
    const username = req.user?.username || req.user?.real_name;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    await this.log({
      userId,
      username,
      module,
      action,
      entityType,
      entityId,
      oldValue,
      newValue,
      ipAddress,
      userAgent,
    });
  }

  /**
   * 查询审计日志
   * @param {Object} filters - 查询条件
   */
  static async query(filters = {}) {
    let connection;
    try {
      const {
        module,
        action,
        entityType,
        entityId,
        userId,
        startDate,
        endDate,
        page = 1,
        pageSize = 20,
      } = filters;

      let whereClause = '1=1';
      const params = [];

      if (module) {
        whereClause += ' AND module = ?';
        params.push(module);
      }
      if (action) {
        whereClause += ' AND action = ?';
        params.push(action);
      }
      if (entityType) {
        whereClause += ' AND entity_type = ?';
        params.push(entityType);
      }
      if (entityId) {
        whereClause += ' AND entity_id = ?';
        params.push(entityId);
      }
      if (userId) {
        whereClause += ' AND user_id = ?';
        params.push(userId);
      }
      if (startDate) {
        whereClause += ' AND created_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        whereClause += ' AND created_at <= ?';
        params.push(endDate);
      }

      const pagination = parsePagination(page, pageSize, { defaultPageSize: 20, maxPageSize: 100 });

      connection = await getConnection();

      const auditSql = appendPaginationSQL(
        `SELECT id, user_id, username, module, action, method, path, entity_type, entity_id, old_value, new_value, ip_address, user_agent, created_at FROM audit_logs WHERE ${whereClause} ORDER BY created_at DESC`,
        pagination.limit,
        pagination.offset
      );
      const [rows] = await connection.query(auditSql, params);

      const [countResult] = await connection.query(
        `SELECT COUNT(*) as total FROM audit_logs WHERE ${whereClause}`,
        params
      );

      return {
        list: rows,
        total: countResult[0].total,
        page: pagination.page,
        pageSize: pagination.pageSize,
      };
    } catch (error) {
      logger.error('查询审计日志失败:', error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  static async queryForExport(filters = {}) {
    let connection;
    try {
      const { module, action, entityType, entityId, userId, startDate, endDate } = filters;
      let whereClause = '1=1';
      const params = [];

      if (module) {
        whereClause += ' AND module = ?';
        params.push(module);
      }
      if (action) {
        whereClause += ' AND action = ?';
        params.push(action);
      }
      if (entityType) {
        whereClause += ' AND entity_type = ?';
        params.push(entityType);
      }
      if (entityId) {
        whereClause += ' AND entity_id = ?';
        params.push(entityId);
      }
      if (userId) {
        whereClause += ' AND user_id = ?';
        params.push(userId);
      }
      if (startDate) {
        whereClause += ' AND created_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        whereClause += ' AND created_at <= ?';
        params.push(endDate);
      }

      connection = await getConnection();
      const [rows] = await connection.query(
        `SELECT id, user_id, username, module, action, method, path, entity_type, entity_id, old_value, new_value, ip_address, user_agent, created_at FROM audit_logs WHERE ${whereClause} ORDER BY created_at DESC`,
        params
      );

      return { list: rows, total: rows.length };
    } catch (error) {
      logger.error('导出审计日志查询失败:', error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }
}

module.exports = {
  AuditService,
  AuditAction,
  AuditModule,
};
