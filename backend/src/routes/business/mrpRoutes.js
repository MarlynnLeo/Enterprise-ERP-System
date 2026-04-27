/**
 * mrpRoutes.js
 * @description MRP 物料需求计划路由
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/business/mrpController');
const { authenticateToken } = require('../../middleware/authEnhanced');
const { requirePermission } = require('../../middleware/requirePermission');

router.get('/runs', authenticateToken, requirePermission('production:plan:view'), ctrl.getRunList);
router.get('/runs/:id', authenticateToken, requirePermission('production:plan:view'), ctrl.getRunById);
router.post('/runs', authenticateToken, requirePermission('production:plan:create'), ctrl.createAndRun);
router.put('/results/:id/status', authenticateToken, requirePermission('production:plan:edit'), ctrl.updateSuggestionStatus);
router.post('/results/batch-confirm', authenticateToken, requirePermission('production:plan:edit'), ctrl.batchConfirm);
router.post('/results/convert', authenticateToken, requirePermission('production:plan:create'), ctrl.convertSuggestions);

module.exports = router;
