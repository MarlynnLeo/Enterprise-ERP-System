/**
 * contractRoutes.js
 * @description 合同管理路由
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/business/contractController');
const { authenticateToken } = require('../../middleware/authEnhanced');
const { requirePermission } = require('../../middleware/requirePermission');

router.get('/', authenticateToken, requirePermission('contract:view'), ctrl.getList);
router.get('/expiring', authenticateToken, requirePermission('contract:view'), ctrl.getExpiring);
router.get('/:id', authenticateToken, requirePermission('contract:view'), ctrl.getById);
router.post('/', authenticateToken, requirePermission('contract:create'), ctrl.create);
router.put('/:id', authenticateToken, requirePermission('contract:edit'), ctrl.update);
router.delete('/:id', authenticateToken, requirePermission('contract:delete'), ctrl.delete);
router.put('/:id/status', authenticateToken, requirePermission('contract:edit'), ctrl.updateStatus);
router.post('/:id/executions', authenticateToken, requirePermission('contract:edit'), ctrl.addExecution);

module.exports = router;
