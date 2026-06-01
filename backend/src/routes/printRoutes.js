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

// 所有打印路由都需要身份验证；业务打印可读取默认模板，模板管理另行校验系统权限。
router.use(authenticateToken);

// 打印设置路由
router.get('/settings', requirePermission(['system:print:view', 'system:print:template:view']), printController.getAllPrintSettings);
router.get('/settings/:id', requirePermission(['system:print:view', 'system:print:template:view']), printController.getPrintSettingById);
router.post('/settings', requirePermission(['system:print:create', 'system:print:add', 'system:print:template:add']), printController.createPrintSetting);
router.put('/settings/:id', requirePermission(['system:print:update', 'system:print:edit', 'system:print:template:edit']), printController.updatePrintSetting);
router.delete('/settings/:id', requirePermission('system:print:delete'), printController.deletePrintSetting);

// 打印模板路由
router.get('/templates/default', printController.getDefaultTemplateByType);
router.get('/templates', requirePermission(['system:print:view', 'system:print:template:view']), printController.getAllPrintTemplates);
router.get('/templates/:id', requirePermission(['system:print:view', 'system:print:template:view']), printController.getPrintTemplateById);
router.post('/templates', requirePermission(['system:print:create', 'system:print:add', 'system:print:template:add']), printController.createPrintTemplate);
router.put('/templates/:id', requirePermission(['system:print:update', 'system:print:edit', 'system:print:template:edit']), printController.updatePrintTemplate);
router.delete('/templates/:id', requirePermission(['system:print:delete', 'system:print:template:delete']), printController.deletePrintTemplate);

// 文件上传路由
router.post('/upload/logo', requirePermission(['system:print:update', 'system:print:edit', 'system:print:template:edit']), FileUploadMiddlewares.logo, printController.uploadLogo);

module.exports = router;
