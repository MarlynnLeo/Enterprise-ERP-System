/**
 * equipmentRoutes.js
 * @description 路由定义文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const equipmentController = require('../controllers/business/production/equipmentController');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');

// 设备基本信息管理
router.get('/list', authenticateToken, requirePermission('production:equipment:view'), equipmentController.getEquipmentList);
router.get('/stats', authenticateToken, requirePermission('production:equipment:view'), equipmentController.getEquipmentStats);
router.get('/maintenance', authenticateToken, requirePermission('production:equipment:view'), equipmentController.getMaintenanceRecords);
router.get('/failures', authenticateToken, requirePermission('production:equipment:view'), equipmentController.getFailureRecords);
router.get('/inspections', authenticateToken, requirePermission('production:equipment:view'), equipmentController.getInspectionRecords);
router.get('/:id', authenticateToken, requirePermission('production:equipment:view'), equipmentController.getEquipmentById);
router.post('/', authenticateToken, requirePermission('production:equipment:create'), equipmentController.createEquipment);
router.put('/:id', authenticateToken, requirePermission('production:equipment:update'), equipmentController.updateEquipment);
router.delete('/:id', authenticateToken, requirePermission('production:equipment:delete'), equipmentController.deleteEquipment);
router.put('/:id/status', authenticateToken, requirePermission('production:equipment:update'), equipmentController.updateEquipmentStatus);
router.post('/import', authenticateToken, requirePermission('production:equipment:create'), equipmentController.importEquipment);

// 设备维护记录
router.post(
  '/:equipment_id/maintenance',
  authenticateToken,
  requirePermission('production:equipment:update'),
  equipmentController.addMaintenanceRecord
);

// 设备故障记录
router.post('/:equipment_id/failure', authenticateToken, requirePermission('production:equipment:update'), equipmentController.addFailureRecord);

// 设备检查记录
router.post(
  '/:equipment_id/inspection',
  authenticateToken,
  requirePermission('production:equipment:update'),
  equipmentController.addInspectionRecord
);

module.exports = router;
