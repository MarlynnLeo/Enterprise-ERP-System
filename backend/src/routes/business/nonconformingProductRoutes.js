const express = require('express');
const router = express.Router();
const ncpController = require('../../controllers/business/quality/nonconformingProductController');
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

// 获取不合格品列表
router.get('/', requirePermission('quality:nonconforming:view'), ncpController.getList);

// 获取不合格品统计
router.get('/statistics', requirePermission('quality:nonconforming:view'), ncpController.getStatistics);

// 获取自动处置配置
router.get('/config/auto-disposition', requirePermission('quality:nonconforming:view'), ncpController.getAutoDispositionConfig);

// 更新自动处置配置
router.put('/config/auto-disposition', requirePermission('quality:nonconforming:update'), ncpController.updateAutoDispositionConfig);

// 根据检验单ID获取不合格品
router.get('/inspection/:inspectionId', requirePermission('quality:nonconforming:view'), ncpController.getByInspectionId);

// 获取不合格品详情
router.get('/:id', requirePermission('quality:nonconforming:view'), ncpController.getDetails);

// 创建不合格品
router.post('/', requirePermission('quality:nonconforming:create'), ncpController.create);

// 更新不合格品
router.put('/:id', requirePermission('quality:nonconforming:update'), ncpController.update);

// 更新处置决策
router.put('/:id/disposition', requirePermission('quality:nonconforming:update'), ncpController.updateDisposition);

// 完成处理
router.put('/:id/complete', requirePermission('quality:nonconforming:update'), ncpController.completeHandling);

// 删除不合格品
router.delete('/:id', requirePermission('quality:nonconforming:delete'), ncpController.deleteNcp);

module.exports = router;
