/**
 * 追溯监控路由
 */

const express = require('express');
const router = express.Router();
const traceabilityMonitorController = require('../../../controllers/business/traceability/traceabilityMonitorController');
const { authenticateToken } = require('../../../middleware/authEnhanced');
const { requirePermission } = require('../../../middleware/requirePermission');

// 所有路由需要认证
router.use(authenticateToken);

// 获取追溯数据概览
router.get('/overview', requirePermission('quality:traceability:view'), traceabilityMonitorController.getTraceabilityOverview);

// 获取追溯覆盖率统计
router.get('/coverage', requirePermission('quality:traceability:view'), traceabilityMonitorController.getTraceabilityCoverage);

// 获取追溯操作日志 (已废除，旧表已删除)
// router.get('/operation-logs', ...);

// 获取追溯数据质量报告
router.get('/data-quality', requirePermission('quality:traceability:view'), traceabilityMonitorController.getDataQualityReport);

module.exports = router;
