/**
 * public.js
 * @description 公开路由（无需认证）
 * @date 2025-10-30
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const productionBoardController = require('../controllers/public/productionBoardController');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');

const productionBoardAccess = [
  authenticateToken,
  requirePermission([
    'production:data-view',
    'production:plans:view',
    'production:tasks:view',
    'production:process:view',
  ]),
];

// 生产流程可视化看板
router.get('/production-board', productionBoardAccess, productionBoardController.getProductionBoardData);
router.get('/production-board/stats', productionBoardAccess, productionBoardController.getProductionBoardStats);

module.exports = router;
