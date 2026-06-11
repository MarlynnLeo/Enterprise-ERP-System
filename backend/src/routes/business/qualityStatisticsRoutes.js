/**
 * 质量统计报表路由
 */

const express = require('express');
const router = express.Router();
const qualityStatisticsController = require('../../controllers/business/quality/qualityStatisticsController');
const { authenticateToken } = require('../../middleware/authEnhanced');
const { requirePermission } = require('../../middleware/requirePermission');
const { desensitizeSensitiveResponse } = require('../../middleware/priceAccessControl');

router.use(authenticateToken);
router.use(desensitizeSensitiveResponse('view'));

router.get('/overview', requirePermission('quality:reports:view'), qualityStatisticsController.getOverview);
router.get('/disposition', requirePermission('quality:reports:view'), qualityStatisticsController.getDispositionStatistics);
router.get('/trend', requirePermission('quality:reports:view'), qualityStatisticsController.getTrendAnalysis);
router.get('/supplier', requirePermission('quality:reports:view'), qualityStatisticsController.getSupplierQualityAnalysis);
router.get('/material', requirePermission('quality:reports:view'), qualityStatisticsController.getMaterialDefectAnalysis);
router.get('/cost', requirePermission('quality:reports:view'), qualityStatisticsController.getCostAnalysis);

module.exports = router;
