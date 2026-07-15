/**
 * userActivityRoutes.js
 * @description 路由定义文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const userActivityController = require('../controllers/common/userActivityController');
const { authenticateToken } = require('../middleware/authEnhanced');
const { requirePermission } = require('../middleware/requirePermission');

// 所有路由都需要认证
router.use(authenticateToken);

// 记录用户活动
router.post('/log', userActivityController.logActivity);

// 获取用户活动记录（本人）
router.get('/', userActivityController.getUserActivities);

// 获取用户统计数据（本人）
router.get('/statistics', userActivityController.getUserStatistics);

// 获取用户在线时长排行榜
router.get(
  '/online-time-ranking',
  requirePermission(['system:monitor', 'system:users:view', 'system:users']),
  userActivityController.getOnlineTimeRanking
);

// 导出用户活动记录（本人审计导出；跨用户审计需 system:audit:export）
router.get(
  '/export',
  requirePermission(['system:audit:export', 'system:monitor', 'system:users:view']),
  userActivityController.exportActivities
);

module.exports = router;
