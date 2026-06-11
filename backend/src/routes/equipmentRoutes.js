const express = require('express');
const router = express.Router();
const equipmentController = require('../controllers/business/production/equipmentController');
const { authenticateToken } = require('../middleware/authEnhanced');
const { requirePermission } = require('../middleware/requirePermission');

router.get('/list', authenticateToken, requirePermission('production:equipment:view'), equipmentController.getEquipmentList);
router.get('/stats', authenticateToken, requirePermission('production:equipment:view'), equipmentController.getEquipmentStats);
router.get('/maintenance', authenticateToken, requirePermission('production:equipment:view'), equipmentController.getMaintenanceRecords);
router.get('/failures', authenticateToken, requirePermission('production:equipment:view'), equipmentController.getFailureRecords);
router.get('/inspections', authenticateToken, requirePermission('production:equipment:view'), equipmentController.getInspectionRecords);
router.get('/types', authenticateToken, requirePermission('production:equipment:view'), equipmentController.getEquipmentTypes);
router.post('/types', authenticateToken, requirePermission('production:equipment:create'), equipmentController.createEquipmentType);
router.get('/:id', authenticateToken, requirePermission('production:equipment:view'), equipmentController.getEquipmentById);
router.post('/', authenticateToken, requirePermission('production:equipment:create'), equipmentController.createEquipment);
router.put('/:id', authenticateToken, requirePermission('production:equipment:update'), equipmentController.updateEquipment);
router.delete('/:id', authenticateToken, requirePermission('production:equipment:delete'), equipmentController.deleteEquipment);
router.put('/:id/status', authenticateToken, requirePermission('production:equipment:update'), equipmentController.updateEquipmentStatus);
router.post('/import', authenticateToken, requirePermission('production:equipment:create'), equipmentController.importEquipment);

router.post(
  '/:equipment_id/maintenance',
  authenticateToken,
  requirePermission('production:equipment:update'),
  equipmentController.addMaintenanceRecord
);

router.post('/:equipment_id/failure', authenticateToken, requirePermission('production:equipment:update'), equipmentController.addFailureRecord);

router.post(
  '/:equipment_id/inspection',
  authenticateToken,
  requirePermission('production:equipment:update'),
  equipmentController.addInspectionRecord
);

module.exports = router;
