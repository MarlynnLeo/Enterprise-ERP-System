/**
 * printRoutes.js
 * @description 路由定义文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const printController = require('../controllers/common/printController');
const { authenticateToken } = require('../middleware/authEnhanced');
const { requirePermission } = require('../middleware/requirePermission');
const { FileUploadMiddlewares } = require('../middleware/unifiedFileUpload');
const PermissionService = require('../services/PermissionService');
const { PermissionUtils } = require('../utils/authUtils');
const { ResponseHandler } = require('../utils/responseHandler');

const DEFAULT_TEMPLATE_PERMISSIONS = {
  inventory: [
    'inventory:inbound:view',
    'inventory:outbound:view',
    'inventory:transfer:view',
    'inventory:check:view',
    'inventory:stock:view',
  ],
  purchase: [
    'purchase:requisitions:view',
    'purchase:orders:view',
    'purchase:receipts:view',
    'purchase:returns:view',
  ],
  sales: [
    'sales:orders:view',
    'sales:outbound:view',
    'sales:returns:view',
    'sales:quotations:view',
  ],
  production: [
    'production:plans:view',
    'production:tasks:view',
    'production:reports:view',
  ],
  quality: [
    'quality:inspections:view',
    'quality:incoming:view',
    'quality:process:view',
    'quality:final:view',
    'quality:8d:view',
  ],
  finance: [
    'finance:entries:view',
    'finance:reports:view',
    'finance:ar:view',
    'finance:ap:view',
    'finance:cash:view',
  ],
};

async function requireDefaultTemplatePermission(req, res, next) {
  try {
    const moduleName = String(req.query.module || '').trim().toLowerCase();
    const modulePermissions = DEFAULT_TEMPLATE_PERMISSIONS[moduleName] || [];
    const requiredPermissions = [
      'system:print:view',
      ...modulePermissions,
    ];

    const userPermissions = await PermissionService.getUserPermissions(req.user.id);
    if (!PermissionUtils.hasAnyPermission(userPermissions, requiredPermissions)) {
      return ResponseHandler.forbidden(res, `权限不足，需要权限: ${requiredPermissions.join(', ')}`);
    }

    req.userPermissions = userPermissions;
    return next();
  } catch (error) {
    return ResponseHandler.error(res, '打印模板权限检查失败', 'SERVER_ERROR', 500, error);
  }
}

// 所有打印路由都需要身份验证；业务打印可读取默认模板，模板管理另行校验系统权限。
router.use(authenticateToken);

// 打印设置路由
router.get('/settings', requirePermission('system:print:view'), printController.getAllPrintSettings);
router.get('/settings/:id', requirePermission('system:print:view'), printController.getPrintSettingById);
router.post('/settings', requirePermission('system:print:create'), printController.createPrintSetting);
router.put('/settings/:id', requirePermission('system:print:update'), printController.updatePrintSetting);
router.delete('/settings/:id', requirePermission('system:print:delete'), printController.deletePrintSetting);

// 打印模板路由
router.get('/templates/default', requireDefaultTemplatePermission, printController.getDefaultTemplateByType);
router.get('/templates', requirePermission('system:print:view'), printController.getAllPrintTemplates);
router.get('/templates/:id', requirePermission('system:print:view'), printController.getPrintTemplateById);
router.post('/templates', requirePermission('system:print:create'), printController.createPrintTemplate);
router.put('/templates/:id', requirePermission('system:print:update'), printController.updatePrintTemplate);
router.delete('/templates/:id', requirePermission('system:print:delete'), printController.deletePrintTemplate);

// 文件上传路由
router.post('/upload/logo', requirePermission('system:print:update'), FileUploadMiddlewares.logo, printController.uploadLogo);

module.exports = router;
