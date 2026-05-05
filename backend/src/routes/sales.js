/**
 * sales.js
 * @description 路由定义文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const { FileUploadMiddlewares } = require('../middleware/unifiedFileUpload');
const salesCustomerController = require('../controllers/business/sales/salesCustomerController');
const salesQuotationController = require('../controllers/business/sales/salesQuotationController');
const salesOrderController = require('../controllers/business/sales/salesOrderController');
const salesOutboundController = require('../controllers/business/sales/salesOutboundController');
const salesReturnController = require('../controllers/business/sales/salesReturnController');
const salesExchangeController = require('../controllers/business/sales/salesExchangeController');
const salesPackingController = require('../controllers/business/sales/salesPackingController');
const salesStatsController = require('../controllers/business/sales/salesStatsController');
const deliveryStatsController = require('../controllers/business/sales/deliveryStatsController');

// 使用中间件进行身份验证
router.use(authenticateToken);

// Customer routes
router.get('/customers', requirePermission('basedata:customers:view'), salesCustomerController.getCustomers);
router.get('/customers-list', requirePermission('basedata:customers:view'), salesCustomerController.getCustomersList);
router.get('/products-list', requirePermission('basedata:materials:view'), salesCustomerController.getProductsList);
router.get('/customers/:id', requirePermission('basedata:customers:view'), salesCustomerController.getCustomer);
router.get('/customers/:customerId/order-products', requirePermission('sales:orders:view'), salesCustomerController.getCustomerOrderProducts);
router.post('/customers', requirePermission('basedata:customers:create'), salesCustomerController.createCustomer);
router.put('/customers/:id', requirePermission('basedata:customers:update'), salesCustomerController.updateCustomer);

// Sales Quotation routes
router.get('/quotations', requirePermission('sales:quotations:view'), salesQuotationController.getSalesQuotations);
router.get('/quotations/statistics', requirePermission('sales:reports:view'), salesQuotationController.getSalesQuotationStatistics);
router.get('/quotations/:id', requirePermission('sales:quotations:view'), salesQuotationController.getSalesQuotation);
router.post('/quotations', requirePermission('sales:quotations:create'), salesQuotationController.createSalesQuotation);
router.put('/quotations/:id', requirePermission('sales:quotations:update'), salesQuotationController.updateSalesQuotation);
router.delete('/quotations/:id', requirePermission('sales:quotations:delete'), salesQuotationController.deleteSalesQuotation);
router.post('/quotations/:id/convert', requirePermission('sales:quotations:update'), salesQuotationController.convertQuotationToOrder);

// Sales Order routes
router.get('/orders', requirePermission('sales:orders:view'), salesOrderController.getSalesOrders);
router.get('/orders/operators', requirePermission('sales:orders:view'), salesOrderController.getSalesOrderOperators);

router.post('/orders/export', requirePermission('sales:orders:export'), salesOrderController.exportOrders);
router.post('/orders/import', requirePermission('sales:orders:create'), FileUploadMiddlewares.excel, salesOrderController.importOrders);
// 添加销售订单导入模板下载路由
router.get('/orders/template', requirePermission('sales:orders:view'), salesOrderController.downloadOrderTemplate);
router.get('/orders/:id', requirePermission('sales:orders:view'), salesOrderController.getSalesOrder);
router.get('/orders/:id/unshipped-items', requirePermission('sales:orders:view'), salesOrderController.getOrderUnshippedItems);
router.post('/orders', requirePermission('sales:orders:create'), salesOrderController.createSalesOrder);
router.put('/orders/:id', requirePermission('sales:orders:update'), salesOrderController.updateSalesOrder);
router.delete('/orders/:id', requirePermission('sales:orders:delete'), salesOrderController.deleteSalesOrder);
router.put('/orders/:id/status', requirePermission('sales:orders:update'), salesOrderController.updateOrderStatus);

// Order Lock routes
router.post('/orders/:id/lock', requirePermission('sales:orders:update'), salesOrderController.lockOrder);
router.post('/orders/:id/unlock', requirePermission('sales:orders:update'), salesOrderController.unlockOrder);
router.get('/orders/:id/lock-status', requirePermission('sales:orders:view'), salesOrderController.getOrderLockStatus);

// Sales Outbound routes
router.get('/outbound', requirePermission('sales:outbound:view'), salesOutboundController.getSalesOutbound);
router.get('/outbound/material/:materialId', requirePermission('sales:outbound:view'), salesOutboundController.getMaterialSalesHistory);
router.get('/outbound/:id', requirePermission('sales:outbound:view'), salesOutboundController.getSalesOutboundById);
router.post('/outbound', requirePermission('sales:outbound:create'), salesOutboundController.createSalesOutbound);
router.put('/outbound/:id', requirePermission('sales:outbound:update'), salesOutboundController.updateSalesOutbound);
router.delete('/outbound/:id', requirePermission('sales:outbound:delete'), salesOutboundController.deleteSalesOutbound);

// Sales Return routes
router.get('/returns', requirePermission('sales:returns:view'), salesReturnController.getSalesReturns);
router.get('/returns/:id', requirePermission('sales:returns:view'), salesReturnController.getSalesReturnById);
router.post('/returns', requirePermission('sales:returns:create'), salesReturnController.createSalesReturn);
router.put('/returns/:id', requirePermission('sales:returns:update'), salesReturnController.updateSalesReturn);
router.put('/returns/:id/status', requirePermission('sales:returns:update'), salesReturnController.updateSalesReturnStatus);
router.delete('/returns/:id', requirePermission('sales:returns:delete'), salesReturnController.deleteSalesReturn);

// Sales Exchange routes
router.get('/exchanges', requirePermission('sales:returns:view'), salesExchangeController.getSalesExchanges);
router.get('/exchanges/:id', requirePermission('sales:returns:view'), salesExchangeController.getSalesExchangeById);
router.post('/exchanges', requirePermission('sales:returns:create'), salesExchangeController.createSalesExchange);
router.put('/exchanges/:id', requirePermission('sales:returns:update'), salesExchangeController.updateSalesExchange);
router.delete('/exchanges/:id', requirePermission('sales:returns:delete'), salesExchangeController.deleteSalesExchange);
router.put('/exchanges/:id/status', requirePermission('sales:returns:update'), salesExchangeController.updateExchangeStatus);

// Packing List routes
router.get('/packing-lists', requirePermission('sales:packing:view'), salesPackingController.getPackingLists);
router.get('/packing-lists/:id', requirePermission('sales:packing:view'), salesPackingController.getPackingList);
router.post('/packing-lists', requirePermission('sales:packing:create'), salesPackingController.createPackingList);
router.put('/packing-lists/:id', requirePermission('sales:packing:update'), salesPackingController.updatePackingList);
router.delete('/packing-lists/:id', requirePermission('sales:packing:delete'), salesPackingController.deletePackingList);
router.patch('/packing-lists/:id/status', requirePermission('sales:packing:update'), salesPackingController.updatePackingListStatus);
router.get('/packing-lists-statistics', requirePermission('sales:reports:view'), salesPackingController.getPackingListStatistics);

// Sales Statistics routes
router.get('/statistics', requirePermission('sales:reports:view'), salesStatsController.getSalesStatistics);
router.get('/trend', requirePermission('sales:reports:view'), salesStatsController.getSalesTrend);

// Delivery Statistics routes
router.get('/delivery-stats', requirePermission('sales:reports:view'), deliveryStatsController.getDeliveryStats);
router.get('/delivery-stats/overview', requirePermission('sales:reports:view'), deliveryStatsController.getDeliveryOverview);
router.get('/delivery-stats/orders/:orderId', requirePermission('sales:reports:view'), deliveryStatsController.getOrderDeliveryDetails);

module.exports = router;
