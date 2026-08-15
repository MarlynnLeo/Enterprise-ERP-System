/**
 * enhancedModulesRoutes.js
 * @description 编码规则 / 单据关联 / 汇率 / 绩效 / ECN / 文档 / 告警路由
 */

const express = require('express');
const router = express.Router();
const { codingRules, docLinks, exchangeRates, performance, ecn, documents, alerts } = require('../../controllers/business/enhancedModulesController');
const { authenticateToken } = require('../../middleware/authEnhanced');
const { requirePermission } = require('../../middleware/requirePermission');
const PermissionService = require('../../services/PermissionService');
const DocumentLinkService = require('../../services/business/DocumentLinkService');
const { ResponseHandler } = require('../../utils/responseHandler');
const {
  desensitizeSensitiveResponse,
  requirePriceMutationPermission,
} = require('../../middleware/priceAccessControl');

async function requireDocumentLinkView(req, res, next) {
  try {
    const businessType = String(req.query.business_type || '').trim();
    const businessId = req.query.business_id;

    if (!businessType || businessId === undefined || businessId === null || businessId === '') {
      return ResponseHandler.error(res, 'business_type and business_id are required', 'VALIDATION_ERROR', 400);
    }

    const requiredPermissions = DocumentLinkService.getViewPermissionsForType(businessType);
    if (!requiredPermissions.length) {
      return ResponseHandler.error(res, 'Unsupported business_type', 'VALIDATION_ERROR', 400);
    }

    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return ResponseHandler.unauthorized(res, 'Unauthorized');
    }

    const userPermissions = await PermissionService.getUserPermissions(userId);
    if (!DocumentLinkService.canViewBusinessType(businessType, userPermissions)) {
      return ResponseHandler.forbidden(res, `Permission denied, required: ${requiredPermissions.join(', ')}`);
    }

    req.userPermissions = userPermissions;
    req.documentLinkUserPermissions = userPermissions;
    return next();
  } catch (error) {
    return ResponseHandler.error(res, 'Document link permission check failed', 'SERVER_ERROR', 500, error);
  }
}

// ========== 编码规则 ==========
router.use(authenticateToken);
router.use(desensitizeSensitiveResponse('view'));
router.use(requirePriceMutationPermission('update'));

router.get('/coding-rules', requirePermission('system:settings:view'), codingRules.getList);
router.get('/coding-rules/preview/:type', requirePermission('system:settings:view'), codingRules.preview);
router.get('/coding-rules/sequences/:type', requirePermission('system:settings:view'), codingRules.getSequences);
router.post('/coding-rules/reset-sequence', requirePermission('system:settings:edit'), codingRules.resetSequence);
router.get('/coding-rules/:id', requirePermission('system:settings:view'), codingRules.getById);
router.post('/coding-rules', requirePermission('system:settings:edit'), codingRules.create);
router.put('/coding-rules/:id', requirePermission('system:settings:edit'), codingRules.update);
router.delete('/coding-rules/:id', requirePermission('system:settings:edit'), codingRules.deleteRule);

// ========== 单据关联 ==========
router.get('/document-links', requireDocumentLinkView, docLinks.getLinks);
router.get('/document-links/chain', requireDocumentLinkView, docLinks.getFullChain);
router.get('/document-links/types', requirePermission('system:documents:view'), docLinks.getTypeLabels);
router.post('/document-links', requirePermission('system:documents:edit'), docLinks.createLink);
router.delete('/document-links/:id', requirePermission('system:documents:edit'), docLinks.deleteLink);

// ========== 汇率 ==========
router.get('/exchange-rates', requirePermission('finance:exchange-rates:view'), exchangeRates.getList);
router.get(
  '/exchange-rates/latest',
  requirePermission(['dashboard', 'finance:exchange-rates:view'], 'any'),
  exchangeRates.getLatestRate
);
router.post('/exchange-rates/sync-public', requirePermission('finance:exchange-rates:update'), exchangeRates.syncPublic);
router.post('/exchange-rates', requirePermission('finance:exchange-rates:update'), exchangeRates.create);
router.delete('/exchange-rates/:id', requirePermission('finance:exchange-rates:update'), exchangeRates.delete);

// ========== 绩效管理 ==========
router.get('/performance/indicators', requirePermission('hr:performance:view'), performance.getIndicators);
router.post('/performance/indicators', requirePermission('hr:performance:edit'), performance.createIndicator);
router.put('/performance/indicators/:id', requirePermission('hr:performance:edit'), performance.updateIndicator);
router.delete('/performance/indicators/:id', requirePermission('hr:performance:edit'), performance.deleteIndicator);

router.get('/performance/periods', requirePermission('hr:performance:view'), performance.getPeriods);
router.post('/performance/periods', requirePermission('hr:performance:edit'), performance.createPeriod);
router.put('/performance/periods/:id/status', requirePermission('hr:performance:edit'), performance.updatePeriodStatus);

router.get('/performance/evaluations', requirePermission('hr:performance:view'), performance.getEvaluations);
router.get('/performance/evaluations/:id', requirePermission('hr:performance:view'), performance.getEvaluationById);
router.post('/performance/evaluations', requirePermission('hr:performance:edit'), performance.createEvaluation);
router.put('/performance/evaluations/:id/score', requirePermission('hr:performance:edit'), performance.scoreEvaluation);

// ========== ECN 变更管理 ==========
const ecnPerms = {
  view: 'basedata:ecn:view',
  create: 'basedata:ecn:create',
  update: 'basedata:ecn:update',
  delete: 'basedata:ecn:delete',
};

router.get('/ecn', requirePermission(ecnPerms.view), ecn.getList);
router.get('/ecn/:id', requirePermission(ecnPerms.view), ecn.getById);
router.post('/ecn', requirePermission(ecnPerms.create), ecn.create);
router.put('/ecn/:id/status', requirePermission(ecnPerms.update), ecn.updateStatus);
router.put('/ecn/:id', requirePermission(ecnPerms.update), ecn.update);
router.delete('/ecn/:id', requirePermission(ecnPerms.delete), ecn.delete);

// ========== 文档管理 ==========
router.get('/documents', requirePermission('system:documents:view'), documents.getList);
router.post('/documents', requirePermission('system:documents:create'), documents.create);
router.put('/documents/:id', requirePermission('system:documents:edit'), documents.update);
router.delete('/documents/:id', requirePermission('system:documents:delete'), documents.delete);
router.get('/documents/:id/download', requirePermission('system:documents:view'), documents.download);

// ========== 业务告警 ==========
router.get('/business-alerts', requirePermission('system:business-alerts:view'), alerts.getList);
router.put('/business-alerts/:id', requirePermission('system:business-alerts:edit'), alerts.update);

module.exports = router;
