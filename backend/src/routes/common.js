/**
 * common.js
 * @description 通用路由定义文件
 * @date 2026-01-23
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const commonController = require('../controllers/common/commonController');
const { authenticateToken } = require('../middleware/authEnhanced');

// 获取枚举/字典值
router.get('/enums/:type', authenticateToken, commonController.getEnums);

module.exports = router;
