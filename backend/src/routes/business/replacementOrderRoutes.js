/**
 * 换货单管理路由
 */

const express = require('express');
const router = express.Router();
const replacementOrderController = require('../../controllers/business/quality/replacementOrderController');
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

// 获取换货单列表
router.get('/', requirePermission('quality:replacement:view'), replacementOrderController.getReplacementOrders);

// 获取换货单统计数据
router.get('/statistics', requirePermission('quality:replacement:view'), replacementOrderController.getStatistics);

// 获取换货单详情
router.get('/:id', requirePermission('quality:replacement:view'), replacementOrderController.getReplacementOrderById);

// 更新换货单
router.put('/:id', requirePermission('quality:replacement:update'), replacementOrderController.updateReplacementOrder);

// 换货收货确认
router.post('/:id/confirm-receipt', requirePermission('quality:replacement:update'), replacementOrderController.confirmReceipt);

// 更新换货单状态
router.put('/:id/status', requirePermission('quality:replacement:update'), replacementOrderController.updateStatus);

module.exports = router;
