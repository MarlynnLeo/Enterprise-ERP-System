/**
 * financeAutomationRoutes.js
 * @description 路由定义文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const FinanceAutomationController = require('../../../controllers/business/finance/financeAutomationController');
const { authenticateToken } = require('../../../middleware/auth');
const { requirePermission } = require('../../../middleware/requirePermission');
const { desensitizeSensitiveResponse } = require('../../../middleware/priceAccessControl');
const { PRICE_UPDATE_PERMISSIONS } = require('../../../utils/desensitizer');

// 所有路由需要认证
router.use(authenticateToken);
router.use(desensitizeSensitiveResponse('view'));

/**
 * 财务自动化路由
 * 提供财务自动化相关的API接口
 */

// 生产成本自动化
router.post(
  '/production/cost-entry/:taskId',
  requirePermission('finance:automation:execute'),
  requirePermission(PRICE_UPDATE_PERMISSIONS),
  FinanceAutomationController.generateProductionCostEntry
);

// 期末结转自动化
router.post(
  '/period-end/auto-closing/:periodId',
  requirePermission('finance:automation:execute'),
  requirePermission(PRICE_UPDATE_PERMISSIONS),
  FinanceAutomationController.executePeriodEndClosing
);
router.post(
  '/period-end/manual-closing/:periodId',
  requirePermission('finance:automation:execute'),
  requirePermission(PRICE_UPDATE_PERMISSIONS),
  FinanceAutomationController.executePeriodEndManually
);

// 折旧自动化
router.post(
  '/depreciation/monthly/:periodMonth',
  requirePermission('finance:automation:execute'),
  requirePermission(PRICE_UPDATE_PERMISSIONS),
  FinanceAutomationController.calculateMonthlyDepreciation
);
router.post(
  '/depreciation/manual/:periodMonth',
  requirePermission('finance:automation:execute'),
  requirePermission(PRICE_UPDATE_PERMISSIONS),
  FinanceAutomationController.executeDepreciationManually
);

// 定时任务管理
router.get('/scheduled-tasks/status', requirePermission('finance:automation:view'), FinanceAutomationController.getScheduledTaskStatus);
router.post('/scheduled-tasks/start', requirePermission('finance:automation:execute'), FinanceAutomationController.startScheduledTasks);
router.post('/scheduled-tasks/stop', requirePermission('finance:automation:execute'), FinanceAutomationController.stopScheduledTasks);
router.post('/scheduled-tasks/restart/:taskName', requirePermission('finance:automation:execute'), FinanceAutomationController.restartScheduledTask);

// ==================== 成本闭环模块 ====================
// 在制品成本
router.post('/wip/calculate', requirePermission('finance:cost:execute'), requirePermission(PRICE_UPDATE_PERMISSIONS), FinanceAutomationController.calculateWIPCost);
router.post('/wip/voucher/:periodId', requirePermission('finance:cost:execute'), requirePermission(PRICE_UPDATE_PERMISSIONS), FinanceAutomationController.generateWIPVoucher);

// 成本差异分摊
router.post('/variance/:periodId', requirePermission('finance:cost:execute'), requirePermission(PRICE_UPDATE_PERMISSIONS), FinanceAutomationController.allocateVariance);

// 月末成本结转（一键执行 WIP计算 + WIP凭证 + 差异分摊）
router.post('/cost-closing/:periodId', requirePermission('finance:cost:execute'), requirePermission(PRICE_UPDATE_PERMISSIONS), FinanceAutomationController.executeCostClosing);

module.exports = router;
