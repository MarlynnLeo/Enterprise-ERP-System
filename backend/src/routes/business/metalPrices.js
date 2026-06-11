/**
 * 稀有金属价格路由
 */
const express = require('express');
const router = express.Router();
const metalPricesController = require('../../controllers/business/metalPricesController');
const { authenticateToken } = require('../../middleware/authEnhanced');
const { requirePermission } = require('../../middleware/requirePermission');
const { PRICE_VIEW_PERMISSIONS, PRICE_UPDATE_PERMISSIONS } = require('../../utils/desensitizer');
const { desensitizeSensitiveResponse } = require('../../middleware/priceAccessControl');

// 所有路由需要认证
router.use(authenticateToken);
router.use(desensitizeSensitiveResponse('view'));

// 获取实时金属价格 (支持两种路径)
router.get('/', requirePermission(PRICE_VIEW_PERMISSIONS), metalPricesController.getRealTimeMetalPrices);
router.get('/realtime', requirePermission(PRICE_VIEW_PERMISSIONS), metalPricesController.getRealTimeMetalPrices);

// 获取金属价格历史数据
router.get('/history', requirePermission(PRICE_VIEW_PERMISSIONS), metalPricesController.getMetalPriceHistory);

// 获取特定金属价格
router.get('/:symbol', requirePermission(PRICE_VIEW_PERMISSIONS), metalPricesController.getMetalPrice);

// 更新金属价格
router.put('/', requirePermission(PRICE_UPDATE_PERMISSIONS), metalPricesController.updatePrice);

module.exports = router;
