/**
 * 通知规则路由
 * @description 通知规则管理 CRUD + 事件类型查询
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/system/notificationRuleController');
const { authenticateToken } = require('../../middleware/authEnhanced');
const { requirePermission } = require('../../middleware/requirePermission');

// 所有路由需要认证
router.use(authenticateToken);

// 获取支持的事件类型列表（供前端下拉选择，放在 /:id 之前避免路由冲突）
router.get('/events', requirePermission('system:notification-rules'), ctrl.getSupportedEvents);

// 规则 CRUD
router.get('/', requirePermission('system:notification-rules'), ctrl.getRules);
router.get('/:id', requirePermission('system:notification-rules'), ctrl.getRuleById);
router.post('/', requirePermission('system:notification-rules'), ctrl.createRule);
router.put('/:id', requirePermission('system:notification-rules'), ctrl.updateRule);
router.delete('/:id', requirePermission('system:notification-rules'), ctrl.deleteRule);

// 切换启用/禁用
router.patch('/:id/toggle', requirePermission('system:notification-rules'), ctrl.toggleActive);

module.exports = router;
