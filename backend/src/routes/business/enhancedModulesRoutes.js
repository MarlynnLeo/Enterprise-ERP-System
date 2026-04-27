/**
 * enhancedModulesRoutes.js
 * @description 编码规则 / 单据关联 / 汇率 / 绩效 / ECN / 文档 / 告警路由
 */

const express = require('express');
const router = express.Router();
const { codingRules, docLinks, exchangeRates, performance, ecn, documents, alerts } = require('../../controllers/business/enhancedModulesController');
const { authenticateToken } = require('../../middleware/authEnhanced');
const { requirePermission } = require('../../middleware/requirePermission');

// ========== 编码规则 ==========
router.get('/coding-rules', authenticateToken, requirePermission('system:settings:view'), codingRules.getList);
router.get('/coding-rules/preview/:type', authenticateToken, codingRules.preview);
router.get('/coding-rules/sequences/:type', authenticateToken, codingRules.getSequences);
router.post('/coding-rules/reset-sequence', authenticateToken, requirePermission('system:settings:edit'), codingRules.resetSequence);
router.get('/coding-rules/:id', authenticateToken, requirePermission('system:settings:view'), codingRules.getById);
router.post('/coding-rules', authenticateToken, requirePermission('system:settings:edit'), codingRules.create);
router.put('/coding-rules/:id', authenticateToken, requirePermission('system:settings:edit'), codingRules.update);
router.delete('/coding-rules/:id', authenticateToken, requirePermission('system:settings:edit'), codingRules.deleteRule);

// ========== 单据关联 ==========
router.get('/document-links', authenticateToken, docLinks.getLinks);
router.get('/document-links/chain', authenticateToken, docLinks.getFullChain);
router.get('/document-links/types', authenticateToken, docLinks.getTypeLabels);
router.post('/document-links', authenticateToken, requirePermission('system:documents:edit'), docLinks.createLink);
router.delete('/document-links/:id', authenticateToken, requirePermission('system:documents:edit'), docLinks.deleteLink);

// ========== 汇率 ==========
router.get('/exchange-rates', authenticateToken, requirePermission('finance:settings:view'), exchangeRates.getList);
router.get('/exchange-rates/latest', authenticateToken, exchangeRates.getLatestRate);
router.post('/exchange-rates', authenticateToken, requirePermission('finance:settings:edit'), exchangeRates.create);
router.delete('/exchange-rates/:id', authenticateToken, requirePermission('finance:settings:edit'), exchangeRates.delete);

// ========== 绩效管理 ==========
router.get('/performance/indicators', authenticateToken, requirePermission('hr:performance:view'), performance.getIndicators);
router.post('/performance/indicators', authenticateToken, requirePermission('hr:performance:edit'), performance.createIndicator);
router.put('/performance/indicators/:id', authenticateToken, requirePermission('hr:performance:edit'), performance.updateIndicator);
router.delete('/performance/indicators/:id', authenticateToken, requirePermission('hr:performance:edit'), performance.deleteIndicator);

router.get('/performance/periods', authenticateToken, requirePermission('hr:performance:view'), performance.getPeriods);
router.post('/performance/periods', authenticateToken, requirePermission('hr:performance:edit'), performance.createPeriod);
router.put('/performance/periods/:id/status', authenticateToken, requirePermission('hr:performance:edit'), performance.updatePeriodStatus);

router.get('/performance/evaluations', authenticateToken, requirePermission('hr:performance:view'), performance.getEvaluations);
router.get('/performance/evaluations/:id', authenticateToken, requirePermission('hr:performance:view'), performance.getEvaluationById);
router.post('/performance/evaluations', authenticateToken, requirePermission('hr:performance:edit'), performance.createEvaluation);
router.put('/performance/evaluations/:id/score', authenticateToken, requirePermission('hr:performance:edit'), performance.scoreEvaluation);

// ========== ECN 变更管理 ==========
router.get('/ecn', authenticateToken, requirePermission('basedata:bom:view'), ecn.getList);
router.get('/ecn/:id', authenticateToken, requirePermission('basedata:bom:view'), ecn.getById);
router.post('/ecn', authenticateToken, requirePermission('basedata:bom:create'), ecn.create);
router.put('/ecn/:id/status', authenticateToken, requirePermission('basedata:bom:edit'), ecn.updateStatus);
router.put('/ecn/:id', authenticateToken, requirePermission('basedata:bom:edit'), ecn.update);
router.delete('/ecn/:id', authenticateToken, requirePermission('basedata:bom:delete'), ecn.delete);

// ========== 文档管理 ==========
router.get('/documents', authenticateToken, requirePermission('system:documents:view'), documents.getList);
router.post('/documents', authenticateToken, requirePermission('system:documents:create'), documents.create);
router.put('/documents/:id', authenticateToken, requirePermission('system:documents:edit'), documents.update);
router.delete('/documents/:id', authenticateToken, requirePermission('system:documents:delete'), documents.delete);
router.get('/documents/:id/download', authenticateToken, documents.download);

// ========== 业务告警 ==========
router.get('/business-alerts', authenticateToken, requirePermission('system:settings:view'), alerts.getList);
router.put('/business-alerts/:id', authenticateToken, requirePermission('system:settings:edit'), alerts.update);

module.exports = router;
