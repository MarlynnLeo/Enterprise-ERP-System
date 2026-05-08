/**
 * 通知路由
 */

const express = require('express');
const router = express.Router();
const notificationController = require('../../controllers/system/notificationController');
const { authenticateToken } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/requirePermission');

// 所有路由都需要认证
router.use(authenticateToken);

// 获取通知列表
router.get('/', notificationController.getNotifications);

// 获取未读通知数量
router.get('/unread-count', notificationController.getUnreadCount);

// 标记通知为已读
router.put('/:id/read', notificationController.markAsRead);

// 批量标记为已读
router.put('/mark-all-read', notificationController.markAllAsRead);

// 删除通知
router.delete(
  '/:id',
  requirePermission('system:notifications:delete'),
  notificationController.deleteNotification
);

// 创建通知
router.post('/', requirePermission('system:notifications:create'), notificationController.createNotification);

// 批量创建通知
router.post('/batch', requirePermission('system:notifications:create'), notificationController.createBatchNotifications);

module.exports = router;
