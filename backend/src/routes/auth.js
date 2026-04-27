/**
 * auth.js
 * @description 路由定义文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const {
  login,
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
const { authenticateToken, authenticateRefreshToken } = require('../middleware/auth');

// 配置multer — 头像保存到磁盘
const avatarDir = path.join(process.cwd(), 'uploads', 'avatars');
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const safeName = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    cb(null, safeName);
  },
});
const ALLOWED_AVATAR_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const upload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_AVATAR_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的图片格式，仅允许 JPEG/PNG/GIF/WebP'));
    }
  },
});

// 登录路由
router.post('/login', login);

// 登出路由
router.post('/logout', authenticateToken, logout);

// 刷新令牌路由
router.post('/refresh', authenticateRefreshToken, refreshToken);

// 获取用户信息
router.get('/profile', authenticateToken, getUserProfile);

// 更新用户信息
router.put('/profile', authenticateToken, updateUserProfile);

// 获取用户权限
router.get('/permissions', authenticateToken, getUserPermissions);

// 获取用户菜单（根据权限过滤）
router.get('/menus', authenticateToken, getUserMenus);

// 上传用户头像
router.put('/users/avatar', authenticateToken, upload.single('avatar'), uploadAvatar);

// 修改密码
router.put('/change-password', authenticateToken, changePassword);

// 更新用户头像特效
router.post('/profile/avatar-frame', authenticateToken, updateAvatarFrame);

// 主题设置路由
router.get('/theme', authenticateToken, getUserTheme);
router.post('/theme', authenticateToken, saveUserTheme);
router.delete('/theme', authenticateToken, resetUserTheme);

module.exports = router;
