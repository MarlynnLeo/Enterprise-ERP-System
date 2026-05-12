/**
 * production.js
 * @description 路由定义文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
// 更新：使用重构后的生产控制器（向后兼容）
const productionController = require('../controllers/business/production');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');

// 应用认证中间件
router.use(authenticateToken);

// 仪表盘数据接口
router.get('/dashboard/statistics', productionController.getDashboardStatistics);
router.get('/dashboard/trends', productionController.getDashboardTrends);
router.get('/dashboard/process-completion', productionController.getProcessCompletionRates);
router.get('/dashboard/pending-tasks', productionController.getPendingTasks);
// 仪表盘生产计划接口 - 所有用户都可访问
router.get('/dashboard/plans', productionController.getDashboardProductionPlans);

// ===== 排程与冲突检测接口 =====
const SchedulingService = require('../services/business/SchedulingService');

// 获取产品标准工时
router.get('/scheduling/standard-hours/:productId', async (req, res) => {
  try {
    const result = await SchedulingService.getProductStandardHours(parseInt(req.params.productId));
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// 计算排程（预计耗时+结束时间+工序时间表）
router.post('/scheduling/calculate', async (req, res) => {
  try {
    const { productId, quantity, startTime } = req.body;
    if (!productId || !quantity || !startTime) {
      return res.status(400).json({ success: false, message: '缺少必填参数: productId, quantity, startTime' });
    }
    const result = await SchedulingService.calculateSchedule({
      productId: parseInt(productId),
      quantity: parseFloat(quantity),
      startTime,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// 检测冲突
router.post('/scheduling/check-conflicts', async (req, res) => {
  try {
    const { manager, startTime, endTime, excludeTaskId } = req.body;
    const result = await SchedulingService.checkConflicts({
      manager,
      startTime,
      endTime,
      excludeTaskId: excludeTaskId ? parseInt(excludeTaskId) : null,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取班次配置
router.get('/scheduling/calendar', async (req, res) => {
  try {
    const calendar = await SchedulingService.getDefaultCalendar();
    res.json({ success: true, data: calendar });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 批量排程（一键排程）
router.post('/scheduling/batch', async (req, res) => {
  try {
    const { taskIds, startTime } = req.body;
    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0 || !startTime) {
      return res.status(400).json({ success: false, message: '缺少参数: taskIds(数组), startTime' });
    }
    const result = await SchedulingService.batchSchedule({
      taskIds: taskIds.map(id => parseInt(id)),
      startTime,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 甘特图排程数据
router.get('/scheduling/gantt', requirePermission('production:gantt'), async (req, res) => {
  try {
    const data = await SchedulingService.getGanttData(req.query);
    return res.json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// 生产计划相关接口
router.get(
  '/plans',
  requirePermission('production:plans:view'),
  productionController.getProductionPlans
);
router.get(
  '/plans/:id',
  requirePermission('production:plans:view'),
  productionController.getProductionPlanById
);
router.post(
  '/plans',
  requirePermission('production:plans:create'),
  productionController.createProductionPlan
);
router.put(
  '/plans/:id',
  requirePermission('production:plans:update'),
  productionController.updateProductionPlan
);
router.put(
  '/plans/:id/status',
  requirePermission('production:plans:update'),
  productionController.updateProductionPlanStatus
);
router.delete(
  '/plans/:id',
  requirePermission('production:plans:delete'),
  productionController.deleteProductionPlan
);
// 导出生产计划数据
router.get(
  '/export',
  requirePermission('production:plans:export'),
  productionController.exportProductionData
);

// 计算物料需求
router.post('/calculate-materials', requirePermission(['production:plans:view', 'production:mrp:view']), productionController.calculateMaterials);
router.get('/calculate-materials/:bomId', requirePermission(['production:plans:view', 'production:mrp:view']), productionController.calculateMaterialsByBomId);

// 直接获取产品BOM信息
router.get('/product-bom/:productId', requirePermission(['production:plans:view', 'production:mrp:view']), productionController.getBomByProductId);

// 获取当天的最大序号
router.get('/today-sequence', requirePermission('production:plans:view'), productionController.getTodayMaxSequence);

// 获取生产计划物料清单
router.get('/plans/:id/materials', requirePermission('production:plans:view'), productionController.getPlanMaterials);

// 获取所有生产计划的缺料统计
router.get(
  '/material-shortage-summary',
  requirePermission(['production:plans:view', 'production:mrp:view']),
  productionController.getMaterialShortageSummary
);

// 生产任务相关路由
router.get(
  '/tasks/managers',
  requirePermission('production:tasks:view'),
  productionController.getProductionTaskManagers
);
router.get(
  '/tasks/generate-code',
  requirePermission('production:tasks:create'),
  productionController.generateTaskCode
);
router.get(
  '/tasks',
  requirePermission('production:tasks:view'),
  productionController.getProductionTasks
);
router.get(
  '/tasks/:id',
  requirePermission('production:tasks:view'),
  productionController.getProductionTaskById
);
router.post(
  '/tasks',
  requirePermission('production:tasks:create'),
  productionController.createProductionTask
);
router.put(
  '/tasks/:id',
  requirePermission('production:tasks:update'),
  productionController.updateProductionTask
);
router.delete(
  '/tasks/:id',
  requirePermission('production:tasks:delete'),
  productionController.deleteProductionTask
);
router.post(
  '/tasks/:id/progress',
  requirePermission('production:tasks:update'),
  productionController.updateProductionTaskProgress
);
router.put(
  '/tasks/:id/status',
  requirePermission('production:tasks:update'),
  productionController.updateProductionTaskStatus
);
router.post(
  '/tasks/:id/complete',
  requirePermission('production:tasks:update'),
  productionController.completeTask
);
router.get(
  '/tasks/:id/bom',
  requirePermission('production:tasks:view'),
  productionController.getProductionTaskBom
);

// 生产过程相关路由
router.get(
  '/processes',
  requirePermission('production:process:view'),
  productionController.getProcesses
);
router.get(
  '/processes/:id',
  requirePermission('production:process:view'),
  productionController.getProcessById
);
router.put(
  '/processes/:id',
  requirePermission('production:process:update'),
  productionController.updateProcess
);
router.post(
  '/processes',
  requirePermission('production:process:create'),
  productionController.createProcess
);
router.delete(
  '/processes/:id',
  requirePermission('production:process:delete'),
  productionController.deleteProcess
);

// 生产报工相关路由
router.get(
  '/reports/summary',
  requirePermission('production:reports:view'),
  productionController.getReportSummary
);
router.get(
  '/reports/detail',
  requirePermission('production:reports:view'),
  productionController.getReportDetail
);
router.get(
  '/reports/export',
  requirePermission('production:reports:view'),
  productionController.exportReport
);
router.get(
  '/reports/statistics',
  requirePermission('production:reports:view'),
  productionController.getReportStatistics
);
router.get(
  '/reports/task/:taskId/stats',
  requirePermission('production:reports:view'),
  productionController.getTaskReportStats
);
router.get(
  '/reports/task/:taskId/processes',
  requirePermission('production:reports:view'),
  productionController.getTaskProcesses
);
router.post(
  '/reports',
  requirePermission('production:reports:create'),
  productionController.createReport
);
router.get(
  '/reports/:id',
  requirePermission('production:reports:view'),
  productionController.getReportById
);
router.put(
  '/reports/:id',
  requirePermission('production:reports:update'),
  productionController.updateReport
);
router.delete(
  '/reports/:id',
  requirePermission('production:reports:delete'),
  productionController.deleteReport
);

module.exports = router;
