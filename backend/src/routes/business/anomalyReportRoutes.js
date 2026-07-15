const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/business/anomalyReportController');
const { authenticateToken } = require('../../middleware/authEnhanced');
const { requirePermission } = require('../../middleware/requirePermission');

router.use(authenticateToken);

const VIEW_PERMISSIONS = ['production:anomaly', 'production:anomaly:view'];
const CREATE_PERMISSIONS = ['production:anomaly', 'production:anomaly:create'];
const UPDATE_PERMISSIONS = ['production:anomaly', 'production:anomaly:update'];
const DELETE_PERMISSIONS = ['production:anomaly:delete'];

router.get('/stats', requirePermission(VIEW_PERMISSIONS), ctrl.getStats);
router.get('/', requirePermission(VIEW_PERMISSIONS), ctrl.getList);
router.get('/:id', requirePermission(VIEW_PERMISSIONS), ctrl.getById);
router.post('/', requirePermission(CREATE_PERMISSIONS), ctrl.create);
router.patch('/:id/assign', requirePermission(UPDATE_PERMISSIONS), ctrl.assign);
router.patch('/:id/resolve', requirePermission(UPDATE_PERMISSIONS), ctrl.resolve);
router.patch('/:id/close', requirePermission(UPDATE_PERMISSIONS), ctrl.close);
router.delete('/:id', requirePermission(DELETE_PERMISSIONS), ctrl.delete);

module.exports = router;
