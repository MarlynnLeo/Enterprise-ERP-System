/**
 * workflowRoutes.js
 * @description 审批工作流路由
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/business/workflowController');
const { authenticateToken } = require('../../middleware/authEnhanced');
const { requirePermission } = require('../../middleware/requirePermission');

// 模板管理
router.get('/templates', authenticateToken, requirePermission('system:workflow:view'), ctrl.getTemplates);
router.get('/templates/:id', authenticateToken, requirePermission('system:workflow:view'), ctrl.getTemplateById);
router.post('/templates', authenticateToken, requirePermission('system:workflow:create'), ctrl.createTemplate);
router.put('/templates/:id', authenticateToken, requirePermission('system:workflow:edit'), ctrl.updateTemplate);
router.delete('/templates/:id', authenticateToken, requirePermission('system:workflow:delete'), ctrl.deleteTemplate);

// 审批操作
// 审批动作由流程实例本身校验：发起人只能撤回自己的流程，审批人只能处理分配给自己的节点。
// 路由层仍要求 workflow:use，防止任意登录用户探测接口。
router.post('/start', authenticateToken, requirePermission('system:workflow:use'), ctrl.startWorkflow);
router.post(
  '/instances/:id/approve',
  authenticateToken,
  requirePermission('system:workflow:use'),
  ctrl.handleApproval
);
router.post(
  '/instances/:id/withdraw',
  authenticateToken,
  requirePermission('system:workflow:use'),
  ctrl.withdrawWorkflow
);

// 查询
router.get(
  '/instances/:id',
  authenticateToken,
  requirePermission('system:workflow:use'),
  ctrl.getInstanceById
);
router.get(
  '/my/initiated',
  authenticateToken,
  requirePermission('system:workflow:use'),
  ctrl.getMyInitiated
);
router.get(
  '/my/pending',
  authenticateToken,
  requirePermission('system:workflow:use'),
  ctrl.getMyPending
);
router.get(
  '/business',
  authenticateToken,
  requirePermission('system:workflow:use'),
  ctrl.getWorkflowByBusiness
);

module.exports = router;
