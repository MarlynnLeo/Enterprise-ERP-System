/**
 * 返工任务管理路由
 */

const express = require('express');
const router = express.Router();
const reworkTaskController = require('../../controllers/business/quality/reworkTaskController');
const { authenticateToken } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/requirePermission');
const {
  desensitizeSensitiveResponse,
  requirePriceMutationPermission,
} = require('../../middleware/priceAccessControl');

// 所有路由需要认证
router.use(authenticateToken);
router.use(desensitizeSensitiveResponse('view'));
router.use(requirePriceMutationPermission('update'));

// 获取返工任务列表
router.get('/', requirePermission('quality:rework:view'), reworkTaskController.getReworkTasks);

// 获取返工任务统计数据
router.get('/statistics', requirePermission('quality:rework:view'), reworkTaskController.getStatistics);

// 根据检验单ID查询关联的返工任务状态（静态路径必须在 :id 之前）
router.post('/by-inspections', requirePermission('quality:rework:view'), reworkTaskController.getReworkStatusByInspectionIds);
router.get('/by-inspection/:inspectionId', requirePermission('quality:rework:view'), reworkTaskController.getReworkStatusByInspectionId);

// 获取返工任务详情
router.get('/:id', requirePermission('quality:rework:view'), reworkTaskController.getReworkTaskById);

// 更新返工任务
router.put('/:id', requirePermission('quality:rework:update'), reworkTaskController.updateReworkTask);

// 分配返工任务
router.post('/:id/assign', requirePermission('quality:rework:update'), reworkTaskController.assignTask);

// 完成返工任务
router.post('/:id/complete', requirePermission('quality:rework:update'), reworkTaskController.completeTask);

// 更新返工任务状态
router.put('/:id/status', requirePermission('quality:rework:update'), reworkTaskController.updateStatus);

// 更新返工进度
router.put('/:id/progress', requirePermission('quality:rework:update'), reworkTaskController.updateProgress);

module.exports = router;
