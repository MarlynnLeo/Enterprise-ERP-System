/**
 * 预算管理路由
 *
 * @module routes/business/finance/budgetRoutes
 */

const express = require('express');
const router = express.Router();
const budgetController = require('../../../controllers/business/finance/budgetController');
const { authenticateToken } = require('../../../middleware/auth');
const { requirePermission } = require('../../../middleware/requirePermission');

// 应用认证中间件
router.use(authenticateToken);

// ==================== 预算主表操作 ====================

/**
 * @route   POST /api/finance/budgets
 * @desc    创建预算
 * @access  Private
 */
router.post('/', requirePermission('finance:budgets:create'), budgetController.createBudget);

/**
 * @route   GET /api/finance/budgets
 * @desc    获取预算列表
 * @access  Private
 */
router.get('/', requirePermission('finance:budgets:view'), budgetController.getBudgets);

// ==================== 预算控制 ====================

/**
 * @route   GET /api/finance/budgets/check/availability
 * @desc    检查预算可用性
 * @access  Private
 */
router.get('/check/availability', requirePermission('finance:budgets:view'), budgetController.checkBudgetAvailability);

// ==================== 预算预警 ====================

/**
 * @route   GET /api/finance/budgets/warnings
 * @desc    获取预算预警列表
 * @access  Private
 */
router.get('/warnings', requirePermission('finance:budgets:view'), budgetController.getBudgetWarnings);

/**
 * @route   PUT /api/finance/budgets/warnings/:id/read
 * @desc    标记预警为已读
 * @access  Private
 */
router.put('/warnings/:id/read', requirePermission('finance:budgets:update'), budgetController.markWarningAsRead);

/**
 * @route   GET /api/finance/budgets/analysis/department-comparison
 * @desc    获取部门预算对比分析
 * @access  Private
 */
router.get('/analysis/department-comparison', requirePermission('finance:reports:view'), budgetController.getDepartmentBudgetComparison);

// ==================== AI 智能分析（无 :id 的路由） ====================

/**
 * @route   GET /api/finance/budgets/ai/recommendation
 * @desc    AI 预算建议
 * @access  Private
 */
router.get('/ai/recommendation', requirePermission('finance:budgets:view'), budgetController.getAIRecommendation);

/**
 * @route   POST /api/finance/budgets/ai/create-from-ai
 * @desc    从 AI 建议创建预算
 * @access  Private
 */
router.post('/ai/create-from-ai', requirePermission('finance:budgets:create'), budgetController.createBudgetFromAI);

/**
 * @route   GET /api/finance/budgets/ai/year-comparison
 * @desc    AI 年度对比分析
 * @access  Private
 */
router.get('/ai/year-comparison', requirePermission('finance:budgets:view'), budgetController.getAIYearComparison);

/**
 * @route   GET /api/finance/budgets/ai/usage-stats
 * @desc    AI 使用统计
 * @access  Private
 */
router.get('/ai/usage-stats', requirePermission('finance:budgets:view'), budgetController.getAIUsageStats);

/**
 * @route   GET /api/finance/budgets/:id
 * @desc    获取预算详情（参数路由，必须在所有具体路由之后）
 * @access  Private
 */
router.get('/:id', requirePermission('finance:budgets:view'), budgetController.getBudgetById);

/**
 * @route   PUT /api/finance/budgets/:id
 * @desc    更新预算
 * @access  Private
 */
router.put('/:id', requirePermission('finance:budgets:update'), budgetController.updateBudget);

/**
 * @route   DELETE /api/finance/budgets/:id
 * @desc    删除预算
 * @access  Private
 */
router.delete('/:id', requirePermission('finance:budgets:delete'), budgetController.deleteBudget);

// ==================== 预算审批流程 ====================

/**
 * @route   POST /api/finance/budgets/:id/submit
 * @desc    提交预算审批
 * @access  Private
 */
router.post('/:id/submit', requirePermission('finance:budgets:update'), budgetController.submitBudget);

/**
 * @route   POST /api/finance/budgets/:id/approve
 * @desc    审批预算
 * @access  Private
 */
router.post('/:id/approve', requirePermission('finance:budgets:approve'), budgetController.approveBudget);

/**
 * @route   POST /api/finance/budgets/:id/start
 * @desc    启动预算执行
 * @access  Private
 */
router.post('/:id/start', requirePermission('finance:budgets:update'), budgetController.startBudgetExecution);

/**
 * @route   POST /api/finance/budgets/:id/close
 * @desc    关闭预算
 * @access  Private
 */
router.post('/:id/close', requirePermission('finance:budgets:update'), budgetController.closeBudget);

// ==================== 预算执行 ====================

/**
 * @route   GET /api/finance/budgets/:id/executions
 * @desc    获取预算执行记录
 * @access  Private
 */
router.get('/:id/executions', requirePermission('finance:budgets:view'), budgetController.getBudgetExecutions);

// ==================== 预算分析 ====================

/**
 * @route   GET /api/finance/budgets/:id/analysis/execution
 * @desc    获取预算执行率分析
 * @access  Private
 */
router.get('/:id/analysis/execution', requirePermission('finance:reports:view'), budgetController.getBudgetExecutionAnalysis);

/**
 * @route   GET /api/finance/budgets/:id/analysis/variance
 * @desc    获取预算差异分析
 * @access  Private
 */
router.get('/:id/analysis/variance', requirePermission('finance:reports:view'), budgetController.getBudgetVarianceAnalysis);

/**
 * @route   GET /api/finance/budgets/:id/analysis
 * @desc    获取实时预算执行分析
 * @access  Private
 */
router.get('/:id/analysis', requirePermission('finance:budgets:view'), budgetController.getRealTimeBudgetAnalysis);

// ==================== AI 智能分析 ====================

/**
 * @route   GET /api/finance/budgets/ai/recommendation
 * @desc    AI 预算建议
 * @access  Private
 * @note    ⚠️ 无 :id 的路由必须在参数路由 /:id 之前注册，已通过路由顺序保证
 */
// 注意：以下 AI 路由已在文件上部通过具体路径优先注册的方式处理
// 如需新增，请在 /:id 路由之前的区域添加

/**
 * @route   GET /api/finance/budgets/:id/ai/anomalies
 * @desc    AI 异常检测
 * @access  Private
 */
router.get('/:id/ai/anomalies', requirePermission('finance:budgets:view'), budgetController.getAIAnomalies);

/**
 * @route   GET /api/finance/budgets/:id/ai/optimization
 * @desc    AI 优化建议
 * @access  Private
 */
router.get('/:id/ai/optimization', requirePermission('finance:budgets:view'), budgetController.getAIOptimization);

/**
 * @route   GET /api/finance/budgets/:id/ai/comprehensive-report
 * @desc    AI 综合分析报告
 * @access  Private
 */
router.get('/:id/ai/comprehensive-report', requirePermission('finance:budgets:view'), budgetController.getAIComprehensiveReport);

module.exports = router;
