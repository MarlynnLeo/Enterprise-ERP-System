/**
 * 报废记录管理路由
 */

const express = require('express');
const router = express.Router();
const scrapRecordController = require('../../controllers/business/quality/scrapRecordController');
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

// 获取报废记录列表
router.get('/', requirePermission('quality:scrap:view'), scrapRecordController.getScrapRecords);

// 获取报废统计数据
router.get('/statistics', requirePermission('quality:scrap:view'), scrapRecordController.getStatistics);

// 获取报废记录详情
router.get('/:id', requirePermission('quality:scrap:view'), scrapRecordController.getScrapRecordById);

// 更新报废记录
router.put('/:id', requirePermission('quality:scrap:update'), scrapRecordController.updateScrapRecord);

// 审批报废
router.post('/:id/approve', requirePermission('quality:scrap:update'), scrapRecordController.approveScrap);

// 完成报废
router.post('/:id/complete', requirePermission('quality:scrap:update'), scrapRecordController.completeScrap);

// 更新报废状态
router.put('/:id/status', requirePermission('quality:scrap:update'), scrapRecordController.updateStatus);

module.exports = router;
