const express = require('express');
const router = express.Router();
const equipmentMonitoringController = require('../controllers/business/production/equipmentMonitoringController');
const { authenticateToken } = require('../middleware/authEnhanced');
const { requirePermission } = require('../middleware/requirePermission');
const { cacheMiddleware } = require('../services/cache/CacheManager');

router.use(authenticateToken);

router.get(
  '/equipment',
  requirePermission('production:equipment:view'),
  cacheMiddleware(60),
  equipmentMonitoringController.getEquipmentList
);

router.get('/equipment/:id', requirePermission('production:equipment:view'), equipmentMonitoringController.getEquipmentDetail);
router.get('/equipment/:id/realtime-data', requirePermission('production:equipment:view'), equipmentMonitoringController.getEquipmentRealTimeData);
router.get('/equipment/:id/health', requirePermission('production:equipment:view'), equipmentMonitoringController.getEquipmentHealth);
router.put('/equipment/:id/status', requirePermission('production:equipment:update'), equipmentMonitoringController.updateEquipmentStatus);

router.post('/equipment/:id/data', requirePermission('production:equipment:update'), equipmentMonitoringController.recordEquipmentData);
router.post('/equipment/:id/data/batch', requirePermission('production:equipment:update'), equipmentMonitoringController.batchRecordEquipmentData);

router.get('/alarms', requirePermission('production:equipment:view'), equipmentMonitoringController.getEquipmentAlarms);
router.put('/alarms/:id/acknowledge', requirePermission('production:equipment:update'), equipmentMonitoringController.acknowledgeAlarm);
router.put('/alarms/:id/resolve', requirePermission('production:equipment:update'), equipmentMonitoringController.resolveAlarm);

router.get(
  '/statistics',
  requirePermission('production:equipment:view'),
  cacheMiddleware(300),
  equipmentMonitoringController.getEquipmentStatistics
);

module.exports = router;
