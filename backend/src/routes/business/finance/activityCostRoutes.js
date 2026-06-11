/**
 * 作业成本法(ABC)路由
 */
const express = require('express');
const router = express.Router();
const ActivityCostService = require('../../../services/business/ActivityCostService');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { authenticateToken } = require('../../../middleware/authEnhanced');
const { requirePermission } = require('../../../middleware/requirePermission');
const {
  desensitizeSensitiveResponse,
  requirePriceMutationPermission,
} = require('../../../middleware/priceAccessControl');

// 所有路由需要认证
router.use(authenticateToken);
router.use(desensitizeSensitiveResponse('view'));
router.use(requirePriceMutationPermission('update'));

// 获取成本动因类型选项
router.get('/driver-types', requirePermission('finance:cost:view'), (req, res) => {
  ResponseHandler.success(res, ActivityCostService.getDriverTypes());
});

// 获取ABC成本汇总报表
router.get('/summary', requirePermission('finance:cost:view'), async (req, res) => {
  try {
    const data = await ActivityCostService.getABCSummaryReport();
    ResponseHandler.success(res, data);
  } catch (error) {
    logger.error('获取ABC汇总报表失败:', error);
    ResponseHandler.error(res, '获取汇总报表失败');
  }
});

// 获取作业列表
router.get('/activities', requirePermission('finance:cost:view'), async (req, res) => {
  try {
    const data = await ActivityCostService.getActivities(req.query);
    ResponseHandler.success(res, data);
  } catch (error) {
    logger.error('获取作业列表失败:', error);
    ResponseHandler.error(res, '获取作业列表失败');
  }
});

// 获取单个作业
router.get('/activities/:id', requirePermission('finance:cost:view'), async (req, res) => {
  try {
    const data = await ActivityCostService.getActivityById(req.params.id);
    if (!data) {
      return ResponseHandler.notFound(res, '作业不存在');
    }
    ResponseHandler.success(res, data);
  } catch (error) {
    logger.error('获取作业详情失败:', error);
    ResponseHandler.error(res, '获取作业详情失败');
  }
});

// 创建作业
router.post('/activities', requirePermission('finance:cost:create'), async (req, res) => {
  try {
    const data = await ActivityCostService.createActivity(req.body);
    ResponseHandler.success(res, data, '创建成功');
  } catch (error) {
    logger.error('创建作业失败:', error);
    ResponseHandler.error(res, error.message || '创建作业失败');
  }
});

// 更新作业
router.put('/activities/:id', requirePermission('finance:cost:update'), async (req, res) => {
  try {
    const data = await ActivityCostService.updateActivity(req.params.id, req.body);
    ResponseHandler.success(res, data, '更新成功');
  } catch (error) {
    logger.error('更新作业失败:', error);
    ResponseHandler.error(res, error.message || '更新作业失败');
  }
});

// 删除作业
router.delete('/activities/:id', requirePermission('finance:cost:delete'), async (req, res) => {
  try {
    await ActivityCostService.deleteActivity(req.params.id);
    ResponseHandler.success(res, null, '删除成功');
  } catch (error) {
    logger.error('删除作业失败:', error);
    ResponseHandler.error(res, error.message || '删除作业失败');
  }
});

// 获取产品的作业关联
router.get('/products/:productId/activities', requirePermission('finance:cost:view'), async (req, res) => {
  try {
    const data = await ActivityCostService.getProductActivities(req.params.productId);
    ResponseHandler.success(res, data);
  } catch (error) {
    logger.error('获取产品作业关联失败:', error);
    ResponseHandler.error(res, '获取产品作业关联失败');
  }
});

// 设置产品的作业关联
router.post('/products/:productId/activities', requirePermission('finance:cost:update'), async (req, res) => {
  try {
    const data = await ActivityCostService.setProductActivities(
      req.params.productId,
      req.body.activities || []
    );
    ResponseHandler.success(res, data, '设置成功');
  } catch (error) {
    logger.error('设置产品作业关联失败:', error);
    ResponseHandler.error(res, '设置产品作业关联失败');
  }
});

// 计算产品的ABC成本
router.get('/products/:productId/abc-cost', requirePermission('finance:cost:view'), async (req, res) => {
  try {
    const data = await ActivityCostService.calculateProductABCCost(req.params.productId);
    ResponseHandler.success(res, data);
  } catch (error) {
    logger.error('计算ABC成本失败:', error);
    ResponseHandler.error(res, '计算ABC成本失败');
  }
});

module.exports = router;
