/**
 * 8D报告管理路由（P0重构版）
 * 新增：结案审核、完成报告路由，审核权限独立
 */

const express = require('express');
const router = express.Router();
const eightDReportController = require('../../controllers/business/quality/eightDReportController');
const { authenticateToken } = require('../../middleware/authEnhanced');
const { requirePermission } = require('../../middleware/requirePermission');

// 所有路由需要认证
router.use(authenticateToken);

// 获取8D报告列表
router.get('/', requirePermission('quality:8d:view'), eightDReportController.getReports);

// 获取8D报告统计（注意：必须在 /:id 之前注册）
router.get('/statistics', requirePermission('quality:8d:view'), eightDReportController.getStatistics);

// AI智能分析 — 根据问题描述自动生成8D内容
router.post('/ai-analyze', requirePermission('quality:8d:create'), eightDReportController.aiAnalyze);

// 获取8D报告日志
router.get('/:id/logs', requirePermission('quality:8d:view'), eightDReportController.getReportLogs);

// 获取8D报告详情
router.get('/:id', requirePermission('quality:8d:view'), eightDReportController.getReportById);

// 创建8D报告
router.post('/', requirePermission('quality:8d:create'), eightDReportController.createReport);

// 更新8D报告
router.put('/:id', requirePermission('quality:8d:update'), eightDReportController.updateReport);

// 提交初审（D1-D3阶段完成后提交）
router.post('/:id/submit-review', requirePermission('quality:8d:update'), eightDReportController.submitReview);

// 提交结案审核（D4-D7阶段完成后提交）
router.post('/:id/submit-phase2-review', requirePermission('quality:8d:update'), eightDReportController.submitPhase2Review);

// 审核8D报告（初审 + 结案审核共用，权限独立）
router.post('/:id/review', requirePermission('quality:8d:update'), eightDReportController.reviewReport);

// 完成8D报告（D8总结后完成）
router.post('/:id/complete', requirePermission('quality:8d:update'), eightDReportController.completeReport);

// 关闭/归档8D报告
router.post('/:id/close', requirePermission('quality:8d:update'), eightDReportController.closeReport);

// 删除8D报告
router.delete('/:id', requirePermission('quality:8d:delete'), eightDReportController.deleteReport);

module.exports = router;
