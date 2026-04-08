/**
 * financeEnhancement.js
 * @description 路由定义文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { logger } = require('../utils/logger');
const express = require('express');
const router = express.Router();
const FinanceEnhancementController = require('../controllers/business/finance/financeEnhancementController');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');

// 应用认证中间件
router.use(authenticateToken);

// ==================== 自动化集成路由 ====================

/**
 * @route POST /api/finance-enhancement/integration/ar-invoice/:salesOrderId
 * @desc 从销售订单生成应收发票
 * @access Private
 */
router.post(
  '/integration/ar-invoice/:salesOrderId',
  requirePermission('finance:ar:create'),
  FinanceEnhancementController.generateARInvoiceFromSalesOrder
);

/**
 * @route POST /api/finance-enhancement/integration/ap-invoice/:receiptId
 * @desc 从采购入库单生成应付发票
 * @access Private
 */
router.post(
  '/integration/ap-invoice/:receiptId',
  requirePermission('finance:ap:create'),
  FinanceEnhancementController.generateAPInvoiceFromPurchaseReceipt
);

// 注意: 审批工作流路由已移除，审批功能统一通过 RBAC 权限按钮控制

// ==================== 期末处理路由 ====================

/**
 * @route GET /api/finance-enhancement/period/status/:periodId
 * @desc 获取期间结账状态
 * @access Private
 */
router.get('/period/status/:periodId', requirePermission('finance:periodEnd:view'), FinanceEnhancementController.getPeriodClosingStatus);

/**
 * @route GET /api/finance-enhancement/period/year-end-status/:year
 * @desc 获取年度结转状态
 * @access Private
 */
router.get('/period/year-end-status/:year', requirePermission('finance:periodEnd:view'), FinanceEnhancementController.getYearEndStatus);

/**
 * @route POST /api/finance-enhancement/period/year-end-transfer
 * @desc 年度结转
 * @access Private
 */
router.post('/period/year-end-transfer', requirePermission('finance:periodEnd:execute'), FinanceEnhancementController.yearEndTransfer);

/**
 * @route GET /api/finance-enhancement/automation/history
 * @desc 获取自动化任务执行历史
 * @access Private
 */
router.get('/automation/history', requirePermission('finance:automation:view'), FinanceEnhancementController.getAutomationHistory);

// ==================== 成本核算路由 ====================

const costController = require('../controllers/business/finance/costController');
const overheadAllocationController = require('../controllers/business/finance/overheadAllocationController');

/**
 * @route GET /api/finance-enhancement/cost/statistics
 * @desc 获取成本统计数据
 * @access Private
 */
router.get('/cost/statistics', requirePermission('finance:cost:view'), costController.getCostStatistics);

/**
 * @route GET /api/finance-enhancement/cost/trend
 * @desc 获取成本趋势数据
 * @access Private
 */
router.get('/cost/trend', requirePermission('finance:cost:view'), costController.getCostTrend);

/**
 * @route GET /api/finance-enhancement/cost/composition
 * @desc 获取成本构成数据
 * @access Private
 */
router.get('/cost/composition', requirePermission('finance:cost:view'), costController.getCostComposition);

/**
 * @route GET /api/finance-enhancement/cost/standard-list
 * @desc 获取标准成本列表
 * @access Private
 */
router.get('/cost/standard-list', requirePermission('finance:cost:view'), costController.getStandardCostList);

/**
 * @route GET /api/finance-enhancement/cost/standard/:productId
 * @desc 计算标准成本
 * @access Private
 */
router.get('/cost/standard/:productId', requirePermission('finance:cost:view'), costController.getStandardCost);

/**
 * @route GET /api/finance-enhancement/cost/settings
 * @desc 获取成本设置
 * @access Private
 */
router.get('/cost/settings', requirePermission('finance:cost:view'), costController.getCostSettings);

/**
 * @route POST /api/finance-enhancement/cost/settings
 * @desc 保存成本设置
 * @access Private
 */
router.post('/cost/settings', requirePermission('finance:cost:update'), costController.saveCostSettings);

/**
 * @route GET /api/finance-enhancement/cost/supplement-reasons
 * @desc 获取补料原因配置
 * @access Private
 */
router.get('/cost/supplement-reasons', requirePermission('finance:cost:view'), costController.getSupplementReasons);

/**
 * @route POST /api/finance-enhancement/cost/supplement-reasons
 * @desc 保存补料原因配置
 * @access Private
 */
router.post('/cost/supplement-reasons', requirePermission('finance:cost:create'), costController.saveSupplementReason);

/**
 * @route DELETE /api/finance-enhancement/cost/supplement-reasons/:id
 * @desc 删除补料原因配置
 * @access Private
 */
router.delete('/cost/supplement-reasons/:id', requirePermission('finance:cost:delete'), costController.deleteSupplementReason);

// ==================== GL Integration 路由 ====================

/**
 * @route GET /api/finance-enhancement/cost/gl-accounts
 * @desc 获取总账科目列表
 * @access Private
 */
router.get('/cost/gl-accounts', requirePermission('finance:cost:view'), costController.getGLAccounts);

/**
 * @route GET /api/finance-enhancement/cost/gl-mappings
 * @desc 获取科目映射配置
 * @access Private
 */
router.get('/cost/gl-mappings', requirePermission('finance:cost:view'), costController.getGLMappings);

/**
 * @route POST /api/finance-enhancement/cost/gl-mapping
 * @desc 保存科目映射
 * @access Private
 */
router.post('/cost/gl-mapping', requirePermission('finance:cost:update'), costController.saveGLMapping);

// ==========================================
// 制造费用分摊配置
// ==========================================
/**
 * @route GET /api/finance-enhancement/cost/overhead-allocation
 * @route POST /api/finance-enhancement/cost/overhead-allocation
 * @route PUT /api/finance-enhancement/cost/overhead-allocation/:id
 * @route DELETE /api/finance-enhancement/cost/overhead-allocation/:id
 * @route GET /api/finance-enhancement/cost/overhead-allocation/bases
 */
router.get('/cost/overhead-allocation', requirePermission('finance:cost:view'), overheadAllocationController.getConfigs);
router.post('/cost/overhead-allocation', requirePermission('finance:cost:create'), overheadAllocationController.createConfig);
router.put('/cost/overhead-allocation/:id', requirePermission('finance:cost:update'), overheadAllocationController.updateConfig);
router.delete('/cost/overhead-allocation/:id', requirePermission('finance:cost:delete'), overheadAllocationController.deleteConfig);
router.get('/cost/overhead-allocation/bases', requirePermission('finance:cost:view'), overheadAllocationController.getAllocationBases);

// ==================== 物料标准成本管理 ====================
router.get('/cost/material-standard-costs', requirePermission('finance:cost:view'), costController.getMaterialStandardCosts);
router.post('/cost/material-standard-costs/freeze', requirePermission('finance:cost:execute'), costController.freezeMaterialStandardCosts);
router.put('/cost/material-standard-costs/:id', requirePermission('finance:cost:update'), costController.updateMaterialStandardCost);

// ==================== 成本版本管理系统 (Standard Cost Versions - V2) ====================
const standardCostVersionController = require('../controllers/business/finance/standardCostVersionController');
router.get('/cost-versions', requirePermission('finance:cost:view'), standardCostVersionController.getVersions);
router.post('/cost-versions', requirePermission('finance:cost:execute'), standardCostVersionController.createVersion);
router.put('/cost-versions/:id/submit', requirePermission('finance:cost:update'), standardCostVersionController.submitVersion);
router.put('/cost-versions/:id/approve', requirePermission('finance:cost:execute'), standardCostVersionController.approveVersion);
router.post('/cost-versions/:id/generate', requirePermission('finance:cost:execute'), standardCostVersionController.generateCostsFromPurchase);

// ==================== 成本中心路由 ====================

router.get('/cost/centers', requirePermission('finance:cost:view'), costController.getCostCenters);
router.post('/cost/centers', requirePermission('finance:cost:create'), costController.createCostCenter);
router.put('/cost/centers/:id', requirePermission('finance:cost:update'), costController.updateCostCenter);

// ==================== 费率历史路由 ====================

router.get('/cost/settings-history', requirePermission('finance:cost:view'), costController.getCostSettingsHistory);
router.get('/cost/settings-by-date', requirePermission('finance:cost:view'), costController.getCostSettingsByDate);

// ==================== 批量成本计算路由 ====================

router.post('/cost/batch-calculate', requirePermission('finance:cost:execute'), costController.batchCalculateStandardCost);

// ==================== 成本冻结路由 ====================

router.post('/cost/freeze/:productId', requirePermission('finance:cost:execute'), costController.freezeCost);
router.post('/cost/unfreeze/:productId', requirePermission('finance:cost:execute'), costController.unfreezeCost);
router.post('/cost/freeze-period', requirePermission('finance:cost:execute'), costController.freezePeriodCosts);

// ==================== 实际成本路由 ====================

router.get('/cost/actual', requirePermission('finance:cost:view'), costController.getActualCostList);
router.get('/cost/actual/:taskId', requirePermission('finance:cost:view'), costController.getActualCostDetail);

// ==================== 成本差异路由 ====================

router.get('/cost/variance', requirePermission('finance:cost:view'), costController.getCostVarianceList);
router.get('/cost/variance/:taskId', requirePermission('finance:cost:view'), costController.getCostVarianceDetail);

// WIP（在制品）成本报告
router.get('/cost/wip-report', requirePermission('finance:cost:view'), costController.getWIPReport);

// 委外在途成本报告
router.get('/cost/outsourced-wip', requirePermission('finance:cost:view'), costController.getOutsourcedWIPReport);

// ==================== 成本预警路由 ====================

router.get('/cost/alerts', requirePermission('finance:cost:view'), costController.getCostAlerts);
router.get('/cost/alert-settings', requirePermission('finance:cost:view'), costController.getCostAlertSettings);
router.post('/cost/alert-settings', requirePermission('finance:cost:update'), costController.saveCostAlertSettings);

// ==================== 年度成本对比路由 ====================

router.get('/cost/yearly-comparison', requirePermission('finance:cost:view'), costController.getYearlyCostComparison);

// ==================== 成本报表导出路由 ====================

router.get('/cost/export/ledger', requirePermission('finance:cost:export'), costController.exportCostLedger);
router.get('/cost/export/variance', requirePermission('finance:cost:export'), costController.exportCostVariance);

// 注：原有的 /cost/actual/:productionOrderId 和 /cost/variance/:productionOrderId
// 路由已整合到上面的新API中

/**
 * @route POST /api/finance-enhancement/cost/recalculate-inventory
 * @desc 重新计算库存成本
 * @access Private
 */
router.post('/cost/recalculate-inventory', requirePermission('finance:cost:execute'), FinanceEnhancementController.recalculateInventoryCost);

// ==================== 高级报表路由 ====================

/**
 * @route GET /api/finance-enhancement/reports/ratio-analysis
 * @desc 财务比率分析
 * @access Private
 */
router.get('/reports/ratio-analysis', requirePermission('finance:reports:view'), FinanceEnhancementController.generateFinancialRatioAnalysis);

/**
 * @route GET /api/finance-enhancement/reports/trend-analysis
 * @desc 趋势分析
 * @access Private
 */
router.get('/reports/trend-analysis', requirePermission('finance:reports:view'), FinanceEnhancementController.generateTrendAnalysis);

/**
 * @route GET /api/finance-enhancement/reports/dashboard
 * @desc 财务仪表板数据
 * @access Private
 */
router.get('/reports/dashboard', requirePermission('finance:reports:view'), FinanceEnhancementController.getDashboardData);

// ==================== 系统初始化路由 ====================

/**
 * @route POST /api/finance-enhancement/system/initialize
 * @desc 初始化财务增强功能相关表
 * @access Private (仅超级管理员)
 */
router.post('/system/initialize', requirePermission('system:initialize'), FinanceEnhancementController.initializeSystem);

module.exports = router;
