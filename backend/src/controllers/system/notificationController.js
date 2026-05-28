/**
 * 通知控制器
 * @description 处理系统通知相关的业务逻辑
 */

const db = require('../../config/db');
const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');
const { parsePagination, appendPaginationSQL } = require('../../utils/safePagination');
const NotificationService = require('../../services/NotificationService');

class NotificationController {
  /**
   * 获取当前用户的通知列表
   */
  async getNotifications(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, pageSize = 20, type, isRead, priority } = req.query;

      const pagination = parsePagination(page, pageSize, { defaultPageSize: 20, maxPageSize: 100 });
      const whereConditions = ['user_id = ?'];
      const params = [userId];

      if (type) {
        const types = type.split(',');
        if (types.length > 1) {
          whereConditions.push(`type IN (${types.map(() => '?').join(',')})`);
          params.push(...types);
        } else {
          whereConditions.push('type = ?');
          params.push(type);
        }
      }

      if (isRead !== undefined) {
        whereConditions.push('is_read = ?');
        params.push(isRead === 'true' ? 1 : 0);
      }

      if (priority !== undefined) {
        whereConditions.push('priority = ?');
        params.push(priority);
      }

      const whereClause = whereConditions.join(' AND ');

      // 获取总数
      const countResult = await db.query(
        `SELECT COUNT(*) as total FROM notifications WHERE ${whereClause}`,
        params
      );

      // 获取通知列表
      const notificationsSql = appendPaginationSQL(
        `SELECT * FROM notifications
         WHERE ${whereClause}
         ORDER BY priority DESC, created_at DESC`,
        pagination.limit,
        pagination.offset
      );
      const notificationsResult = await db.query(notificationsSql, params);

      ResponseHandler.success(res, {
        list: notificationsResult.rows,
        total: countResult.rows[0].total,
        page: pagination.page,
        pageSize: pagination.pageSize,
      });
    } catch (error) {
      logger.error('获取通知列表失败:', error);
      ResponseHandler.error(res, '获取通知列表失败');
    }
  }

  /**
   * 获取单条通知详情
   */
  async getNotificationById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const result = await db.query(
        'SELECT * FROM notifications WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!result.rows || result.rows.length === 0) {
        return ResponseHandler.notFound(res, '通知不存在');
      }

      ResponseHandler.success(res, result.rows[0]);
    } catch (error) {
      logger.error('获取通知详情失败:', error);
      ResponseHandler.error(res, '获取通知详情失败');
    }
  }

  /**
   * 获取未读通知数量
   */
  async getUnreadCount(req, res) {
    try {
      const userId = req.user.id;

      const result = await db.query(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
        [userId]
      );

      ResponseHandler.success(res, { count: result.rows[0].count });
    } catch (error) {
      logger.error('获取未读通知数量失败:', error);
      ResponseHandler.error(res, '获取未读通知数量失败');
    }
  }

  /**
   * 标记通知为已读
   */
  async markAsRead(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const result = await db.query(
        'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?',
        [id, userId]
      );
      if (result.affectedRows === 0) {
        return ResponseHandler.notFound(res, '通知不存在');
      }

      ResponseHandler.success(res, null, '标记成功');
    } catch (error) {
      logger.error('标记通知已读失败:', error);
      ResponseHandler.error(res, '标记失败');
    }
  }

  /**
   * 批量标记为已读
   */
  async markAllAsRead(req, res) {
    try {
      const userId = req.user.id;
      const { ids } = req.body || {};
      const targetIds = Array.isArray(ids) ? ids.filter(Boolean) : [];

      if (targetIds.length > 0) {
        // 标记指定的通知
        const placeholders = targetIds.map(() => '?').join(',');
        await db.query(
          `UPDATE notifications SET is_read = 1, read_at = NOW()
           WHERE id IN (${placeholders}) AND user_id = ?`,
          [...targetIds, userId]
        );
      } else {
        // 标记所有未读通知
        await db.query(
          'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0',
          [userId]
        );
      }

      ResponseHandler.success(res, null, '全部标记成功');
    } catch (error) {
      logger.error('批量标记已读失败:', error);
      ResponseHandler.error(res, '批量标记失败');
    }
  }

  /**
   * 删除通知
   */
  async deleteNotification(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const result = await db.query('DELETE FROM notifications WHERE id = ? AND user_id = ?', [id, userId]);
      if (result.affectedRows === 0) {
        return ResponseHandler.notFound(res, '通知不存在');
      }

      ResponseHandler.success(res, null, '删除成功');
    } catch (error) {
      logger.error('删除通知失败:', error);
      ResponseHandler.error(res, '删除失败');
    }
  }

  /**
   * 批量删除通知
   */
  async batchDeleteNotifications(req, res) {
    try {
      const userId = req.user.id;
      const { ids } = req.body || {};
      const targetIds = Array.isArray(ids) ? ids.filter(Boolean) : [];

      if (targetIds.length === 0) {
        return ResponseHandler.error(res, '请选择要删除的通知', 'INVALID_PARAMS', 400);
      }

      const placeholders = targetIds.map(() => '?').join(',');
      const result = await db.query(
        `DELETE FROM notifications WHERE id IN (${placeholders}) AND user_id = ?`,
        [...targetIds, userId]
      );

      ResponseHandler.success(res, { deleted: result.affectedRows }, `成功删除 ${result.affectedRows} 条通知`);
    } catch (error) {
      logger.error('批量删除通知失败:', error);
      ResponseHandler.error(res, '批量删除失败');
    }
  }

  /**
   * 创建通知（系统内部调用）
   */
  async createNotification(req, res) {
    try {
      const {
        userId,
        type,
        title,
        content,
        link,
        linkParams,
        priority = 0,
        sourceType,
        sourceId,
      } = req.body;

      const result = await NotificationService.notifyUsers(
        [userId],
        {
          type,
          title,
          content,
          link,
          linkParams,
          priority,
          sourceType,
          sourceId,
          createdBy: req.user?.id,
        },
        { dedupeBySource: true }
      );

      ResponseHandler.success(res, result, '通知创建成功');
    } catch (error) {
      logger.error('创建通知失败:', error);
      ResponseHandler.error(res, '创建通知失败');
    }
  }

  /**
   * 批量创建通知（系统内部调用）
   */
  async createBatchNotifications(req, res) {
    try {
      const { notifications } = req.body;

      if (!notifications || notifications.length === 0) {
        return ResponseHandler.error(res, '通知列表不能为空');
      }

      const result = await NotificationService.notifyMany(
        notifications.map((n) => ({
          userIds: [n.userId],
          notification: {
            type: n.type,
            title: n.title,
            content: n.content,
            link: n.link,
            linkParams: n.linkParams,
            priority: n.priority || 0,
            sourceType: n.sourceType,
            sourceId: n.sourceId,
            createdBy: req.user?.id,
          },
        })),
        { dedupeBySource: true }
      );

      ResponseHandler.success(res, result, '批量通知创建成功');
    } catch (error) {
      logger.error('批量创建通知失败:', error);
      ResponseHandler.error(res, '批量创建通知失败');
    }
  }
}

const controller = new NotificationController();

module.exports = {
  getNotifications: controller.getNotifications.bind(controller),
  getNotificationById: controller.getNotificationById.bind(controller),
  getUnreadCount: controller.getUnreadCount.bind(controller),
  markAsRead: controller.markAsRead.bind(controller),
  markAllAsRead: controller.markAllAsRead.bind(controller),
  deleteNotification: controller.deleteNotification.bind(controller),
  batchDeleteNotifications: controller.batchDeleteNotifications.bind(controller),
  createNotification: controller.createNotification.bind(controller),
  createBatchNotifications: controller.createBatchNotifications.bind(controller),
};
