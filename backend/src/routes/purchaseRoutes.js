/**
 * purchaseRoutes.js
 * @description 路由定义文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authEnhanced');
const { requirePermission } = require('../middleware/requirePermission');
const { PRICE_VIEW_PERMISSIONS } = require('../utils/desensitizer');
const {
  desensitizeSensitiveResponse,
  requirePriceMutationPermission,
} = require('../middleware/priceAccessControl');
const purchaseRequisitionController = require('../controllers/business/purchase/purchaseRequisitionController');
const purchaseOrderController = require('../controllers/business/purchase/purchaseOrderController');
const purchaseReceiptController = require('../controllers/business/purchase/purchaseReceiptController');
const purchaseReturnController = require('../controllers/business/purchase/purchaseReturnController');
const outsourcedProcessingController = require('../controllers/outsourced/processingController');

router.use(authenticateToken);
router.use(desensitizeSensitiveResponse('view'));
router.use(requirePriceMutationPermission('update'));

// 采购申请路由
router.get('/requisitions', authenticateToken, requirePermission('purchase:requisitions:view'), purchaseRequisitionController.getRequisitions);
router.get(
  '/requisitions/production-status',
  authenticateToken,
  requirePermission('purchase:requisitions:view'),
  purchaseRequisitionController.getProductionPlanRequisitionStatus
);
router.get('/requisitions/:id', authenticateToken, requirePermission('purchase:requisitions:view'), purchaseRequisitionController.getRequisition);
router.post('/requisitions', authenticateToken, requirePermission('purchase:requisitions:create'), requirePriceMutationPermission('update'), purchaseRequisitionController.createRequisition);
router.put('/requisitions/:id', authenticateToken, requirePermission('purchase:requisitions:update'), requirePriceMutationPermission('update'), purchaseRequisitionController.updateRequisition);
router.delete(
  '/requisitions/:id',
  authenticateToken,
  requirePermission('purchase:requisitions:delete'),
  purchaseRequisitionController.deleteRequisition
);
router.put(
  '/requisitions/:id/status',
  authenticateToken,
  requirePermission('purchase:requisitions:update'),
  purchaseRequisitionController.updateRequisitionStatus
);

// 采购订单路由
router.get('/orders', authenticateToken, requirePermission('purchase:orders:view'), purchaseOrderController.getOrders);
router.get('/orders/latest-price', authenticateToken, requirePermission(PRICE_VIEW_PERMISSIONS), purchaseOrderController.getLatestPrice);
router.post('/orders/latest-prices', authenticateToken, requirePermission(PRICE_VIEW_PERMISSIONS), purchaseOrderController.getLatestPrices);
router.put('/orders/batch-status', authenticateToken, requirePermission('purchase:orders:update'), purchaseOrderController.batchUpdateOrderStatus);
router.get('/orders/statistics', authenticateToken, requirePermission(['purchase:orders:view', 'purchase:reports:view']), purchaseOrderController.getStatistics);
router.get('/orders/:id', authenticateToken, requirePermission('purchase:orders:view'), purchaseOrderController.getOrder);
router.post('/orders', authenticateToken, requirePermission('purchase:orders:create'), requirePriceMutationPermission('update'), purchaseOrderController.createOrder);
router.put('/orders/:id', authenticateToken, requirePermission('purchase:orders:update'), requirePriceMutationPermission('update'), purchaseOrderController.updateOrder);
router.delete('/orders/:id', authenticateToken, requirePermission('purchase:orders:delete'), purchaseOrderController.deleteOrder);
router.put('/orders/:id/status', authenticateToken, requirePermission('purchase:orders:update'), purchaseOrderController.updateOrderStatus);
router.put(
  '/orders/:id/items-received',
  authenticateToken,
  requirePermission(['purchase:orders:pushdown', 'purchase:orders:update']),
  purchaseOrderController.updateOrderItemsReceived
);
router.post(
  '/orders/:id/receive-with-inspection',
  authenticateToken,
  requirePermission(['purchase:orders:pushdown', 'purchase:orders:update']),
  purchaseOrderController.receiveWithIncomingInspection
);
router.get('/orders-statistics', authenticateToken, requirePermission(['purchase:orders:view', 'purchase:reports:view']), purchaseOrderController.getStatistics);

// 采购综合统计数据（用于数据概览）
router.get(
  '/dashboard-statistics',
  authenticateToken,
  requirePermission('purchase:reports:view'),
  purchaseOrderController.getPurchaseDashboardStats
);

// 采购订单关联申请单路由
router.get('/order-requisitions', authenticateToken, requirePermission('purchase:requisitions:view'), purchaseOrderController.getRequisitions);
router.get('/order-requisitions/:id', authenticateToken, requirePermission('purchase:requisitions:view'), purchaseOrderController.getRequisition);

// 供应商路由
router.get('/suppliers', authenticateToken, requirePermission('basedata:suppliers:view'), purchaseOrderController.getSuppliers);

// 采购入库路由
router.get('/receipts/history-items', authenticateToken, requirePermission('purchase:receipts:view'), purchaseReceiptController.getPurchaseHistoryItems);
router.get('/receipts', authenticateToken, requirePermission('purchase:receipts:view'), purchaseReceiptController.getReceipts);
router.get(
  '/receipts/material/:materialId',
  authenticateToken,
  requirePermission('purchase:receipts:view'),
  purchaseReceiptController.getMaterialPurchaseHistory
);
router.get('/receipts/:id', authenticateToken, requirePermission('purchase:receipts:view'), purchaseReceiptController.getReceipt);
router.post('/receipts', authenticateToken, requirePermission('purchase:receipts:create'), requirePriceMutationPermission('update'), purchaseReceiptController.createReceipt);
router.put('/receipts/:id', authenticateToken, requirePermission('purchase:receipts:update'), requirePriceMutationPermission('update'), purchaseReceiptController.updateReceipt);
router.put(
  '/receipts/:id/status',
  authenticateToken,
  requirePermission('purchase:receipts:update'),
  purchaseReceiptController.updateReceiptStatus
);
router.get('/receipts-statistics', authenticateToken, requirePermission(['purchase:receipts:view', 'purchase:reports:view']), purchaseReceiptController.getReceiptStats);

// 采购退货路由
router.get('/returns', authenticateToken, requirePermission('purchase:returns:view'), purchaseReturnController.getReturns);
router.get('/returns/:id', authenticateToken, requirePermission('purchase:returns:view'), purchaseReturnController.getReturn);
router.post('/returns', authenticateToken, requirePermission('purchase:returns:create'), requirePriceMutationPermission('update'), purchaseReturnController.createReturn);
router.put('/returns/:id', authenticateToken, requirePermission('purchase:returns:update'), requirePriceMutationPermission('update'), purchaseReturnController.updateReturn);
router.delete('/returns/:id', authenticateToken, requirePermission('purchase:returns:delete'), purchaseReturnController.deleteReturn);
router.put('/returns/:id/status', authenticateToken, requirePermission('purchase:returns:update'), purchaseReturnController.updateReturnStatus);
router.get('/returns-statistics', authenticateToken, requirePermission(['purchase:returns:view', 'purchase:reports:view']), purchaseReturnController.getReturnStats);

// 采购统计数据
router.get('/statistics', authenticateToken, requirePermission('purchase:reports:view'), purchaseOrderController.getStatistics);

// 委外加工路由
router.get(
  '/outsourced-processings',
  authenticateToken,
  requirePermission('purchase:processing:view'),
  outsourcedProcessingController.getProcessings
);
router.get(
  '/outsourced-processings/options/suppliers',
  authenticateToken,
  requirePermission([
    'purchase:processing:view',
    'purchase:processing:create',
    'purchase:processing:update',
  ]),
  outsourcedProcessingController.getOutsourcedSupplierOptions
);
router.get(
  '/outsourced-processings/options/materials',
  authenticateToken,
  requirePermission([
    'purchase:processing:view',
    'purchase:processing:create',
    'purchase:processing:update',
  ]),
  outsourcedProcessingController.getOutsourcedMaterialOptions
);
router.get(
  '/outsourced-processings/:id',
  authenticateToken,
  requirePermission('purchase:processing:view'),
  outsourcedProcessingController.getProcessing
);
router.post(
  '/outsourced-processings',
  authenticateToken,
  requirePermission('purchase:processing:create'),
  requirePriceMutationPermission('update'),
  outsourcedProcessingController.createProcessing
);
router.put(
  '/outsourced-processings/:id',
  authenticateToken,
  requirePermission('purchase:processing:update'),
  requirePriceMutationPermission('update'),
  outsourcedProcessingController.updateProcessing
);
router.delete(
  '/outsourced-processings/:id',
  authenticateToken,
  requirePermission('purchase:processing:delete'),
  outsourcedProcessingController.deleteProcessing
);
router.put(
  '/outsourced-processings/:id/status',
  authenticateToken,
  requirePermission('purchase:processing:update'),
  outsourcedProcessingController.updateProcessingStatus
);

// 委外入库路由
router.get('/outsourced-receipts', authenticateToken, requirePermission('purchase:processing-receipts:view'), outsourcedProcessingController.getReceipts);
router.get(
  '/outsourced-receipts/options/warehouses',
  authenticateToken,
  requirePermission([
    'purchase:processing-receipts:view',
    'purchase:processing-receipts:create',
    'purchase:processing-receipts:edit',
  ]),
  outsourcedProcessingController.getOutsourcedReceiptWarehouseOptions
);
router.get(
  '/outsourced-receipts/options/processings',
  authenticateToken,
  requirePermission([
    'purchase:processing-receipts:view',
    'purchase:processing-receipts:create',
    'purchase:processing-receipts:edit',
  ]),
  outsourcedProcessingController.getOutsourcedReceiptProcessingOptions
);
router.get(
  '/outsourced-receipts/options/processings/:processingId',
  authenticateToken,
  requirePermission([
    'purchase:processing-receipts:view',
    'purchase:processing-receipts:create',
    'purchase:processing-receipts:edit',
  ]),
  outsourcedProcessingController.getOutsourcedReceiptProcessingDetail
);
router.get(
  '/outsourced-receipts/:id',
  authenticateToken,
  requirePermission('purchase:processing-receipts:view'),
  outsourcedProcessingController.getReceipt
);
router.post(
  '/outsourced-receipts',
  authenticateToken,
  requirePermission('purchase:processing-receipts:create'),
  requirePriceMutationPermission('update'),
  outsourcedProcessingController.createReceipt
);
router.put(
  '/outsourced-receipts/:id',
  authenticateToken,
  requirePermission('purchase:processing-receipts:edit'),
  requirePriceMutationPermission('update'),
  outsourcedProcessingController.updateReceipt
);
router.put(
  '/outsourced-receipts/:id/status',
  authenticateToken,
  requirePermission('purchase:processing-receipts:edit'),
  outsourcedProcessingController.updateReceiptStatus
);
router.post(
  '/outsourced-receipts/:id/receive-with-inspection',
  authenticateToken,
  requirePermission('purchase:processing-receipts:edit'),
  outsourcedProcessingController.receiveReceiptWithInspection
);
// 兼容前端/第三方集成使用“到货”语义的别名。
router.post(
  '/outsourced-receipts/:id/arrive',
  authenticateToken,
  requirePermission('purchase:processing-receipts:edit'),
  outsourcedProcessingController.receiveReceiptWithInspection
);

module.exports = router;
