/**
 * 天气路由
 * @description 天气数据API路由
 * @author 系统
 * @date 2025-11-24
 */

const express = require('express');
const router = express.Router();
const weatherController = require('../controllers/weather/weatherController');
const { authenticateToken } = require('../middleware/auth');

/**
 * 获取天气数据
 * GET /api/weather/current
 * Query参数:
 *   - city: 城市名称，默认"乐清"
 */
router.get(
  '/current',
  authenticateToken,
  weatherController.getWeather
);

module.exports = router;
