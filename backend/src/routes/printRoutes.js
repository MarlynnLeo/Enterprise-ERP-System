/**
 * printRoutes.js
 * @description 路由定义文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const printController = require('../controllers/common/printController');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const { FileUploadMiddlewares } = require('../middleware/unifiedFileUpload');

// 公开的模板获取路由（不需要认证）
router.get('/templates/public/default', printController.getDefaultTemplateByType);

// 所有其他路由都需要身份验证
router.use(authenticateToken);

// 打印设置路由
router.get('/settings', requirePermission('system:print:view'), printController.getAllPrintSettings);
router.get('/settings/:id', requirePermission('system:print:view'), printController.getPrintSettingById);
router.post('/settings', requirePermission('system:print:create'), printController.createPrintSetting);
router.put('/settings/:id', requirePermission('system:print:update'), printController.updatePrintSetting);
router.delete('/settings/:id', requirePermission('system:print:delete'), printController.deletePrintSetting);

// 打印模板路由
router.get('/templates/default', requirePermission('system:print:view'), printController.getDefaultTemplateByType);
router.get('/templates', requirePermission('system:print:view'), printController.getAllPrintTemplates);
router.get('/templates/:id', requirePermission('system:print:view'), printController.getPrintTemplateById);
router.post('/templates', requirePermission('system:print:create'), printController.createPrintTemplate);
router.put('/templates/:id', requirePermission('system:print:update'), printController.updatePrintTemplate);
router.delete('/templates/:id', requirePermission('system:print:delete'), printController.deletePrintTemplate);

// 文件上传路由
router.post('/upload/logo', requirePermission('system:print:update'), FileUploadMiddlewares.logo, printController.uploadLogo);

module.exports = router;
