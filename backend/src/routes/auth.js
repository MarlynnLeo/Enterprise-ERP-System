/**
 * auth.js
 * @description 路由定义文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const {
  login,
  verifyMfaChallenge,
  enrollMfaChallenge,
  setupMfa,
  confirmMfa,
  disableMfa,
  regenerateMfaRecoveryCodes,
  logout,
  refreshToken,
  getUserProfile,
  updateUserProfile,
  changePassword,
  uploadAvatar,
  getUserPermissions,
  updateAvatarFrame,
  getUserMenus,
} = require('../controllers/auth/authController');
const {
  getUserTheme,
  saveUserTheme,
  resetUserTheme,
} = require('../controllers/auth/themeController');
const { authenticateToken, authenticateRefreshToken } = require('../middleware/authEnhanced');
const { FileUploadMiddlewares } = require('../middleware/unifiedFileUpload');

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: 用户登录
 *     tags: [认证]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *                 description: 用户名
 *                 example: admin
 *               password:
 *                 type: string
 *                 description: 密码
 *                 example: "******"
 *     responses:
 *       200:
 *         description: 登录成功，返回用户信息并设置 Cookie
 *       401:
 *         description: 用户名或密码错误
 */
// 登录路由
router.post('/login', login);
router.post('/mfa/verify', verifyMfaChallenge);
router.post('/mfa/enroll', enrollMfaChallenge);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: 用户登出
 *     tags: [认证]
 *     responses:
 *       200:
 *         description: 登出成功
 */
// 登出路由
router.post('/logout', authenticateToken, logout);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: 刷新访问令牌
 *     tags: [认证]
 *     responses:
 *       200:
 *         description: 新的 access_token 已设置
 *       401:
 *         description: refresh_token 无效或已过期
 */
// 刷新令牌路由
router.post('/refresh', authenticateRefreshToken, refreshToken);

/**
 * @swagger
 * /auth/profile:
 *   get:
 *     summary: 获取当前用户信息
 *     tags: [认证]
 *     responses:
 *       200:
 *         description: 用户信息
 *   put:
 *     summary: 更新当前用户信息
 *     tags: [认证]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               realName:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: 更新成功
 */
// 获取用户信息
router.get('/profile', authenticateToken, getUserProfile);

// 更新用户信息
router.put('/profile', authenticateToken, updateUserProfile);

/**
 * @swagger
 * /auth/permissions:
 *   get:
 *     summary: 获取当前用户权限列表
 *     tags: [认证]
 *     responses:
 *       200:
 *         description: 权限列表
 */
// 获取用户权限
router.get('/permissions', authenticateToken, getUserPermissions);

/**
 * @swagger
 * /auth/menus:
 *   get:
 *     summary: 获取当前用户菜单（根据权限过滤）
 *     tags: [认证]
 *     responses:
 *       200:
 *         description: 菜单树
 */
// 获取用户菜单（根据权限过滤）
router.get('/menus', authenticateToken, getUserMenus);

// 上传用户头像
router.put('/users/avatar', authenticateToken, FileUploadMiddlewares.avatar, uploadAvatar);

/**
 * @swagger
 * /auth/change-password:
 *   put:
 *     summary: 修改密码
 *     tags: [认证]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword]
 *             properties:
 *               oldPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: 密码修改成功
 */
// 修改密码
router.put('/change-password', authenticateToken, changePassword);

router.post('/mfa/setup', authenticateToken, setupMfa);
router.post('/mfa/confirm', authenticateToken, confirmMfa);
router.post('/mfa/disable', authenticateToken, disableMfa);
router.post('/mfa/recovery-codes/regenerate', authenticateToken, regenerateMfaRecoveryCodes);

// 更新用户头像特效
router.post('/profile/avatar-frame', authenticateToken, updateAvatarFrame);

// 主题设置路由
router.get('/theme', authenticateToken, getUserTheme);
router.post('/theme', authenticateToken, saveUserTheme);
router.delete('/theme', authenticateToken, resetUserTheme);

module.exports = router;
