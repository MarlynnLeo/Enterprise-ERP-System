/**
 * locations.js
 * @description 路由定义文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const locationsController = require('../controllers/business/inventory/locationsController');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');

// 获取所有库位
router.get('/', authenticateToken, locationsController.getAll);

// 获取单个库位
router.get('/:id', authenticateToken, locationsController.getById);

// 创建库位
router.post('/', authenticateToken, requirePermission('basedata:locations:create'), locationsController.create);

// 更新库位
router.put('/:id', authenticateToken, requirePermission('basedata:locations:edit'), locationsController.update);

// 删除库位
router.delete('/:id', authenticateToken, requirePermission('basedata:locations:delete'), locationsController.delete);

module.exports = router;
