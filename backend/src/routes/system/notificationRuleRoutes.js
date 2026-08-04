/**
 * 通知规则路由
 * @description 通知规则管理 CRUD + 事件类型查询
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/system/notificationRuleController');
const { authenticateToken } = require('../../middleware/authEnhanced');
const { requirePermission } = require('../../middleware/requirePermission');
const { NOTIFICATION_PERMISSIONS } = require('../../constants/notification');

// 所有路由需要认证
router.use(authenticateToken);

// 获取支持的事件类型列表（供前端下拉选择，放在 /:id 之前避免路由冲突）
router.get('/events', requirePermission(NOTIFICATION_PERMISSIONS.VIEW), ctrl.getSupportedEvents);
router.get('/recipient-options', requirePermission(NOTIFICATION_PERMISSIONS.VIEW), ctrl.getRecipientOptions);
router.post('/preview', requirePermission(NOTIFICATION_PERMISSIONS.VIEW), ctrl.previewRecipients);
router.get('/responsibilities', requirePermission(NOTIFICATION_PERMISSIONS.VIEW), ctrl.getResponsibilities);
router.put('/responsibilities/:code', requirePermission(NOTIFICATION_PERMISSIONS.UPDATE), ctrl.updateResponsibility);

// 规则 CRUD
router.get('/', requirePermission(NOTIFICATION_PERMISSIONS.VIEW), ctrl.getRules);
router.get('/:id', requirePermission(NOTIFICATION_PERMISSIONS.VIEW), ctrl.getRuleById);
router.post('/', requirePermission(NOTIFICATION_PERMISSIONS.CREATE), ctrl.createRule);
router.put('/:id', requirePermission(NOTIFICATION_PERMISSIONS.UPDATE), ctrl.updateRule);
router.delete('/:id', requirePermission(NOTIFICATION_PERMISSIONS.DELETE), ctrl.deleteRule);

// 切换启用/禁用
router.patch('/:id/toggle', requirePermission(NOTIFICATION_PERMISSIONS.TOGGLE), ctrl.toggleActive);
router.post('/:id/test', requirePermission(NOTIFICATION_PERMISSIONS.TEST), ctrl.sendTestNotification);

module.exports = router;
