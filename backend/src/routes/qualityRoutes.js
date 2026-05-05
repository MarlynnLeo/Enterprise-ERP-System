/**
 * qualityRoutes.js
 * @description 质量管理模块路由定义
 * @date 2025-08-27 (创建) / 2026-03-03 (SRP重构 — 拆分控制器引用)
 * @version 2.0.0
 *
 * 重构说明：原 qualityController 拆分为 6 个独立控制器，
 * 所有路由路径和权限保持不变，仅更换了 require 引用。
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');

// 拆分后的控制器
const inspectionCtrl = require('../controllers/business/quality/inspectionController');
// const traceabilityCtrl = require('../controllers/business/quality/traceabilityController');
const standardCtrl = require('../controllers/business/quality/qualityStandardController');
const firstArticleCtrl = require('../controllers/business/quality/firstArticleController');
const processInspCtrl = require('../controllers/business/quality/processInspectionController');
const qualityStatCtrl = require('../controllers/business/quality/qualityStatisticsController');

// 独立控制器（未变更）
const inspectionTemplateController = require('../controllers/business/quality/InspectionTemplateController');
const aqlController = require('../controllers/business/quality/aqlController');
const ncpController = require('../controllers/business/quality/nonconformingProductController');

/**
 * AQL 标准管理
 */
router.get('/aql-standards', authenticateToken, requirePermission('quality:settings:view'), aqlController.getStandards);
router.post('/aql-standards', authenticateToken, requirePermission('quality:settings:create'), aqlController.createStandard);
router.put('/aql-standards/:id', authenticateToken, requirePermission('quality:settings:update'), aqlController.updateStandard);
router.delete('/aql-standards/:id', authenticateToken, requirePermission('quality:settings:delete'), aqlController.deleteStandard);
router.get('/aql-levels', authenticateToken, requirePermission('quality:settings:view'), aqlController.getAqlLevels);
router.post('/aql-sampling/calculate', authenticateToken, requirePermission('quality:inspections:view'), aqlController.calculateSampling);

/**
 * 质量检验相关路由
 */

// 来料检验
router.get('/inspections/incoming', authenticateToken, requirePermission('quality:inspections:view'), inspectionCtrl.getIncomingInspections);
router.post('/inspections/incoming', authenticateToken, requirePermission('quality:inspections:create'), inspectionCtrl.createInspection);

// 过程检验
router.get('/inspections/process', authenticateToken, requirePermission('quality:inspections:view'), inspectionCtrl.getProcessInspections);
router.post('/inspections/process', authenticateToken, requirePermission('quality:inspections:create'), inspectionCtrl.createInspection);
router.post(
  '/inspections/process/:id/punch',
  authenticateToken,
  requirePermission('quality:inspections:update'),
  processInspCtrl.punchProcessInspection
);

// 过程检验规则配置
router.get('/process-inspection/rules', authenticateToken, requirePermission('quality:settings:view'), processInspCtrl.getProcessInspectionRules);
router.post('/process-inspection/rules', authenticateToken, requirePermission('quality:settings:create'), processInspCtrl.createProcessInspectionRule);
router.put('/process-inspection/rules/:id', authenticateToken, requirePermission('quality:settings:update'), processInspCtrl.updateProcessInspectionRule);
router.delete('/process-inspection/rules/:id', authenticateToken, requirePermission('quality:settings:delete'), processInspCtrl.deleteProcessInspectionRule);

// 过程检验打卡记录
router.get('/process-inspection/punch/today', authenticateToken, requirePermission('quality:inspections:view'), processInspCtrl.getProcessInspectionPunchToday);
router.get('/process-inspection/punch/list', authenticateToken, requirePermission('quality:inspections:view'), processInspCtrl.getProcessInspectionPunchList);
router.post('/process-inspection/punch', authenticateToken, requirePermission('quality:inspections:create'), processInspCtrl.createProcessInspectionPunch);

// 成品检验
router.get('/inspections/final', authenticateToken, requirePermission('quality:inspections:view'), inspectionCtrl.getFinalInspections);
router.post('/inspections/final', authenticateToken, requirePermission('quality:inspections:create'), inspectionCtrl.createInspection);

// 首检管理
router.get('/inspections/first-article', authenticateToken, requirePermission('quality:inspections:view'), firstArticleCtrl.getFirstArticleInspections);
router.get('/inspections/first-article/stats', authenticateToken, requirePermission('quality:inspections:view'), firstArticleCtrl.getFirstArticleStats);
router.post('/inspections/first-article', authenticateToken, requirePermission('quality:inspections:create'), firstArticleCtrl.createFirstArticleInspection);
router.put('/inspections/first-article/:id/result', authenticateToken, requirePermission('quality:inspections:update'), firstArticleCtrl.updateFirstArticleResult);

// 首检规则配置
router.get('/first-article-rules', authenticateToken, requirePermission('quality:settings:view'), firstArticleCtrl.getFirstArticleRules);
router.get('/first-article-rules/:productId', authenticateToken, requirePermission('quality:settings:view'), firstArticleCtrl.getFirstArticleRuleByProduct);
router.post('/first-article-rules', authenticateToken, requirePermission('quality:settings:create'), firstArticleCtrl.createFirstArticleRule);
router.put('/first-article-rules/:id', authenticateToken, requirePermission('quality:settings:update'), firstArticleCtrl.updateFirstArticleRule);
router.delete('/first-article-rules/:id', authenticateToken, requirePermission('quality:settings:delete'), firstArticleCtrl.deleteFirstArticleRule);

// 获取未关联到追溯记录的质检记录（静态路径必须在 :id 之前）
router.get('/inspections/unlinked', authenticateToken, requirePermission('quality:traceability:view'), inspectionCtrl.getUnlinkedInspections);

// 根据批次号查询检验单（静态路径必须在 :id 之前）
router.get('/inspections/batch/:batchNo', authenticateToken, requirePermission('quality:inspections:view'), inspectionCtrl.getInspectionByBatchNo);

// 获取检验单详情
router.get('/inspections/:id', authenticateToken, requirePermission('quality:inspections:view'), inspectionCtrl.getInspectionById);

// 获取检验单项目
router.get('/inspections/:id/items', authenticateToken, requirePermission('quality:inspections:view'), inspectionCtrl.getInspectionItems);

// 通用创建检验单接口
router.post('/inspections', authenticateToken, requirePermission('quality:inspections:create'), inspectionCtrl.createInspection);

// 更新检验单
router.put('/inspections/:id', authenticateToken, requirePermission('quality:inspections:update'), inspectionCtrl.updateInspection);

// 更新检验单状态并创建追溯记录
router.put('/inspections/:id/status-and-trace', authenticateToken, requirePermission('quality:inspections:update'), inspectionCtrl.updateInspectionStatusAndTrace);

// 删除检验单
router.delete('/inspections/:id', authenticateToken, requirePermission('quality:inspections:delete'), inspectionCtrl.deleteInspection);

// 获取检验相关的引用数据
router.get('/reference-data/:type', authenticateToken, requirePermission('quality:inspections:view'), inspectionCtrl.getReferenceData);

/**
 * 检验模板相关路由（未变更）
 */
router.get('/templates', authenticateToken, requirePermission('quality:templates:view'), inspectionTemplateController.getTemplates);
router.get('/templates/reusable-items', authenticateToken, requirePermission('quality:templates:view'), inspectionTemplateController.getReusableItems);
router.post('/templates/reusable-items', authenticateToken, requirePermission('quality:templates:create'), inspectionTemplateController.createReusableItem);
router.get('/templates/:id', authenticateToken, requirePermission('quality:templates:view'), inspectionTemplateController.getTemplate);
router.post('/templates', authenticateToken, requirePermission('quality:templates:create'), inspectionTemplateController.createTemplate);
router.put('/templates/:id', authenticateToken, requirePermission('quality:templates:update'), inspectionTemplateController.updateTemplate);
router.delete('/templates/:id', authenticateToken, requirePermission('quality:templates:delete'), inspectionTemplateController.deleteTemplate);
router.put('/templates/:id/status', authenticateToken, requirePermission('quality:templates:update'), inspectionTemplateController.updateTemplateStatus);
router.post('/templates/:id/copy', authenticateToken, requirePermission('quality:templates:create'), inspectionTemplateController.copyTemplate);

// 获取检验标准
router.get('/standards/:type/:targetId', authenticateToken, requirePermission('quality:standards:view'), inspectionCtrl.getStandards);

/**
 * 质量标准相关路由
 */
router.get('/quality-standards', authenticateToken, requirePermission('quality:standards:view'), standardCtrl.getAllStandards);
router.get('/quality-standards/:id', authenticateToken, requirePermission('quality:standards:view'), standardCtrl.getStandardById);
router.post('/quality-standards', authenticateToken, requirePermission('quality:standards:create'), standardCtrl.createStandard);
router.put('/quality-standards/:id', authenticateToken, requirePermission('quality:standards:update'), standardCtrl.updateStandard);
router.delete('/quality-standards/:id', authenticateToken, requirePermission('quality:standards:delete'), standardCtrl.deleteStandard);
router.get('/target-options/:targetType', authenticateToken, requirePermission('quality:standards:view'), standardCtrl.getTargetOptions);

/**
 * 追溯管理相关路由已废弃，迁移至 batchTraceabilityRoutes
 */

/**
 * 不合格品 (NCP) 特采相关路由（未变更）
 */
router.post('/ncp/:id/concession/apply', authenticateToken, requirePermission('quality:inspections:update'), ncpController.applyConcession);
router.post('/ncp/:id/concession/approve', authenticateToken, requirePermission('quality:inspections:update'), ncpController.approveConcession);

// 自动追溯相关的旧接口已移动到 batchTraceabilityRoutes 或废弃

/**
 * 质量统计相关路由
 */
router.get('/statistics', authenticateToken, requirePermission('quality:reports:view'), qualityStatCtrl.getQualityStatistics);
router.get('/defect-items', authenticateToken, requirePermission('quality:reports:view'), qualityStatCtrl.getDefectItems);
router.get('/trends', authenticateToken, requirePermission('quality:reports:view'), qualityStatCtrl.getQualityTrends);

module.exports = router;
