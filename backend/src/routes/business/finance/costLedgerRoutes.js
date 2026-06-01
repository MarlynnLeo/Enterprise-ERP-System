/**
 * costLedgerRoutes.js
 * 成本明细账API路由
 */

const express = require('express');
const router = express.Router();
const CostLedgerService = require('../../../services/business/CostLedgerService');
const CostAccountingService = require('../../../services/business/CostAccountingService');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { authenticateToken } = require('../../../middleware/auth');
const { requirePermission } = require('../../../middleware/requirePermission');
const {
  desensitizeSensitiveResponse,
  requirePriceMutationPermission,
} = require('../../../middleware/priceAccessControl');

// 所有路由需要认证
router.use(authenticateToken);
router.use(desensitizeSensitiveResponse('view'));
router.use(requirePriceMutationPermission('update'));

/**
 * 获取成本明细账
 * GET /api/finance/cost-ledger
 */
router.get('/', requirePermission('finance:cost:view'), async (req, res) => {
  try {
    const { startDate, endDate, productId, costCenterId, taskId, costType, page, pageSize } =
      req.query;
    const data = await CostLedgerService.getCostLedger({
      startDate,
      endDate,
      productId: productId ? parseInt(productId) : null,
      costCenterId: costCenterId ? parseInt(costCenterId) : null,
      taskId: taskId ? parseInt(taskId) : null,
      costType,
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 20,
    });
    ResponseHandler.success(res, data);
  } catch (error) {
    logger.error('[API] 获取成本明细账失败:', error);
    ResponseHandler.error(res, '获取成本明细账失败', 'SERVER_ERROR', 500);
  }
});

/**
 * 获取成本汇总（按维度）
 * GET /api/finance/cost-ledger/summary/:dimension
 */
router.get('/summary/:dimension', requirePermission('finance:cost:view'), async (req, res) => {
  try {
    const { dimension } = req.params;
    const { startDate, endDate, costCenterId, productId } = req.query;

    if (!['product', 'cost_center', 'month', 'task'].includes(dimension)) {
      return ResponseHandler.error(res, '无效的维度参数', 'VALIDATION_ERROR', 400);
    }

    const data = await CostLedgerService.getCostSummary(dimension, {
      startDate,
      endDate,
      costCenterId: costCenterId ? parseInt(costCenterId) : null,
      productId: productId ? parseInt(productId) : null,
    });
    ResponseHandler.success(res, data);
  } catch (error) {
    logger.error('[API] 获取成本汇总失败:', error);
    ResponseHandler.error(res, '获取成本汇总失败', 'SERVER_ERROR', 500);
  }
});

/**
 * 获取成本趋势
 * GET /api/finance/cost-ledger/trend
 */
router.get('/trend', requirePermission('finance:cost:view'), async (req, res) => {
  try {
    const { period, count } = req.query;
    const data = await CostLedgerService.getCostTrend({
      period: period || 'month',
      count: parseInt(count) || 12,
    });
    ResponseHandler.success(res, data);
  } catch (error) {
    logger.error('[API] 获取成本趋势失败:', error);
    ResponseHandler.error(res, '获取成本趋势失败', 'SERVER_ERROR', 500);
  }
});

/**
 * 获取任务成本钻取详情
 * GET /api/finance/cost-ledger/task/:taskId
 */
router.get('/task/:taskId', requirePermission('finance:cost:view'), async (req, res) => {
  try {
    const data = await CostLedgerService.getTaskCostDrilldown(parseInt(req.params.taskId));
    if (!data) {
      return ResponseHandler.error(res, '任务不存在', 'NOT_FOUND', 404);
    }
    ResponseHandler.success(res, data);
  } catch (error) {
    logger.error('[API] 获取任务成本钻取失败:', error);
    ResponseHandler.error(res, '获取任务成本钻取详情失败', 'SERVER_ERROR', 500);
  }
});

/**
 * 获取效率差异分析
 * GET /api/finance/cost-ledger/efficiency/:taskId
 */
router.get('/efficiency/:taskId', requirePermission('finance:reports:view'), async (req, res) => {
  try {
    const data = await CostAccountingService.calculateEfficiencyVariance(
      parseInt(req.params.taskId)
    );
    ResponseHandler.success(res, data);
  } catch (error) {
    logger.error('[API] 获取效率差异分析失败:', error);
    ResponseHandler.error(res, '获取效率差异分析失败', 'SERVER_ERROR', 500);
  }
});

module.exports = router;
