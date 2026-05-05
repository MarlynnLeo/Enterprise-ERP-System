/**
 * 批次追溯路由配置
 */

const express = require('express');
const router = express.Router();
const { query, validationResult } = require('express-validator');
const batchTraceabilityController = require('../../../controllers/business/traceability/batchTraceabilityController');
const productSalesTraceabilityController = require('../../../controllers/business/traceability/productSalesTraceabilityController');
const { authenticateToken } = require('../../../middleware/auth');
const { requirePermission } = require('../../../middleware/requirePermission');

// 所有路由需要认证
router.use(authenticateToken);

// 输入验证中间件
const validateInput = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: '输入验证失败',
      errors: errors.array(),
    });
  }
  next();
};

// 追溯查询相关路由

// 统一追溯查询接口 - 自动识别物料类型
router.get(
  '/unified',
  requirePermission('quality:traceability:view'),
  [
    query('materialCode').notEmpty().trim().escape().withMessage('物料编码不能为空'),
    query('batchNumber').optional().trim().escape(),
    validateInput,
  ],
  batchTraceabilityController.getUnifiedTraceability
);

router.get(
  '/chain',
  requirePermission('quality:traceability:view'),
  [
    query('materialCode').notEmpty().trim().escape().withMessage('物料编码不能为空'),
    query('batchNumber').notEmpty().trim().escape().withMessage('批次号不能为空'),
    query('direction')
      .optional()
      .isIn(['forward', 'backward'])
      .withMessage('追溯方向只能是forward或backward'),
    validateInput,
  ],
  batchTraceabilityController.getBatchTraceabilityChain
);

router.get(
  '/batch/details',
  requirePermission('quality:traceability:view'),
  [
    query('materialCode').notEmpty().trim().escape().withMessage('物料编码不能为空'),
    query('batchNumber').notEmpty().trim().escape().withMessage('批次号不能为空'),
    validateInput,
  ],
  batchTraceabilityController.getBatchDetails
);

// 新增：支持路径参数的批次查询路由
router.get('/batch/:materialCode/:batchNumber', requirePermission('quality:traceability:view'), batchTraceabilityController.getBatchDetailsByPath);

router.get(
  '/fifo/preview',
  requirePermission('quality:traceability:view'),
  [
    query('materialId').notEmpty().isInt().withMessage('物料ID必须是整数'),
    query('requiredQuantity').notEmpty().isFloat({ min: 0 }).withMessage('需要数量必须大于0'),
    validateInput,
  ],
  batchTraceabilityController.getFIFOOutboundPreview
);

router.post('/fifo/batch-preview', requirePermission('quality:traceability:view'), batchTraceabilityController.getBatchFIFOOutboundPreview);
router.post(
  '/inventory/check-availability',
  requirePermission('quality:traceability:view'),
  batchTraceabilityController.checkInventoryAvailability
);
router.get('/batch/aging-report', requirePermission('quality:traceability:view'), batchTraceabilityController.getBatchAgingReport);

// 出库处理相关路由
router.post('/outbound/production', requirePermission('quality:traceability:create'), batchTraceabilityController.processProductionOutbound);
router.post('/outbound/sales', requirePermission('quality:traceability:create'), batchTraceabilityController.processSalesOutbound);

// 入库处理相关路由
router.post('/inbound/purchase', requirePermission('quality:traceability:create'), batchTraceabilityController.handlePurchaseReceipt);
router.post('/inbound/production', requirePermission('quality:traceability:create'), batchTraceabilityController.handleProductionInbound);

// 批次管理相关路由
router.post('/batch/reserve', requirePermission('quality:traceability:update'), batchTraceabilityController.reserveBatch);

// 导出相关路由
router.get(
  '/export/report',
  requirePermission('quality:traceability:view'),
  [
    query('materialCode').notEmpty().trim().escape().withMessage('物料编码不能为空'),
    query('batchNumber').notEmpty().trim().escape().withMessage('批次号不能为空'),
    query('direction')
      .optional()
      .isIn(['forward', 'backward'])
      .withMessage('追溯方向只能是forward或backward'),
    validateInput,
  ],
  batchTraceabilityController.exportTraceabilityReport
);

// 成品销售追溯相关路由
router.get(
  '/product-full/:productCode/:batchNumber',
  requirePermission('quality:traceability:view'),
  productSalesTraceabilityController.getProductFullTraceability
);
router.get(
  '/customer/:customerId/materials',
  requirePermission('quality:traceability:view'),
  productSalesTraceabilityController.getCustomerMaterialTraceability
);
router.get(
  '/material-to-customer/:materialCode/:batchNumber',
  requirePermission('quality:traceability:view'),
  productSalesTraceabilityController.getMaterialToCustomerTrace
);
router.get('/customers', requirePermission('quality:traceability:view'), productSalesTraceabilityController.getCustomerList);

// 获取最新批次列表(用于快速查询)
router.get('/latest-batches', requirePermission('quality:traceability:view'), batchTraceabilityController.getLatestBatches);

module.exports = router;
