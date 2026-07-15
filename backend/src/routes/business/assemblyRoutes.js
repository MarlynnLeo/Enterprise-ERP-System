/**
 * Work station, process route, and assembly execution routes.
 */
const express = require('express');
const router = express.Router();
const workStationCtrl = require('../../controllers/business/production/workStationController');
const processRouteCtrl = require('../../controllers/business/production/processRouteController');
const assemblyCtrl = require('../../controllers/business/production/assemblyExecutionController');
const { authenticateToken } = require('../../middleware/authEnhanced');
const { requirePermission } = require('../../middleware/requirePermission');

router.use(authenticateToken);

const STATION_VIEW_PERMISSIONS = ['production:stations', 'production:stations:view'];
const STATION_CREATE_PERMISSIONS = ['production:stations:create'];
const STATION_UPDATE_PERMISSIONS = ['production:stations', 'production:stations:update'];
const STATION_DELETE_PERMISSIONS = ['production:stations:delete'];

const ROUTE_VIEW_PERMISSIONS = ['production:routes', 'production:routes:view'];
const ROUTE_CREATE_PERMISSIONS = ['production:routes:create'];
const ROUTE_UPDATE_PERMISSIONS = ['production:routes', 'production:routes:update'];
const ROUTE_DELETE_PERMISSIONS = ['production:routes:delete'];

const ASSEMBLY_VIEW_PERMISSIONS = ['production:assembly', 'production:assembly:view'];
const ASSEMBLY_EXECUTE_PERMISSIONS = [
  'production:assembly',
  'production:assembly:execute',
  'production:tasks:update',
  'production:process:update',
];

router.get('/stations', requirePermission(STATION_VIEW_PERMISSIONS), workStationCtrl.getList);
router.get(
  '/stations/lines',
  requirePermission(STATION_VIEW_PERMISSIONS),
  workStationCtrl.getLines
);
router.get(
  '/stations/status',
  requirePermission(STATION_VIEW_PERMISSIONS),
  workStationCtrl.getStationStatus
);
router.get('/stations/:id', requirePermission(STATION_VIEW_PERMISSIONS), workStationCtrl.getById);
router.post('/stations', requirePermission(STATION_CREATE_PERMISSIONS), workStationCtrl.create);
router.put('/stations/:id', requirePermission(STATION_UPDATE_PERMISSIONS), workStationCtrl.update);
router.delete(
  '/stations/:id',
  requirePermission(STATION_DELETE_PERMISSIONS),
  workStationCtrl.delete
);

router.get('/routes', requirePermission(ROUTE_VIEW_PERMISSIONS), processRouteCtrl.getList);
router.get(
  '/routes/product/:productId',
  requirePermission(ROUTE_VIEW_PERMISSIONS),
  processRouteCtrl.getActiveByProduct
);
router.get(
  '/routes/suggest-materials/:productId',
  requirePermission(ROUTE_VIEW_PERMISSIONS),
  processRouteCtrl.suggestMaterials
);
router.get('/routes/:id', requirePermission(ROUTE_VIEW_PERMISSIONS), processRouteCtrl.getById);
router.post('/routes', requirePermission(ROUTE_CREATE_PERMISSIONS), processRouteCtrl.create);
router.put('/routes/:id', requirePermission(ROUTE_UPDATE_PERMISSIONS), processRouteCtrl.update);
router.delete('/routes/:id', requirePermission(ROUTE_DELETE_PERMISSIONS), processRouteCtrl.delete);

router.post(
  '/tasks/:taskId/generate-steps',
  requirePermission(ASSEMBLY_EXECUTE_PERMISSIONS),
  assemblyCtrl.generateSteps
);
router.get(
  '/tasks/:taskId/steps',
  requirePermission(ASSEMBLY_VIEW_PERMISSIONS),
  assemblyCtrl.getTaskSteps
);
router.get(
  '/steps/:stepId',
  requirePermission(ASSEMBLY_VIEW_PERMISSIONS),
  assemblyCtrl.getStepDetail
);
router.post(
  '/steps/:stepId/start',
  requirePermission(ASSEMBLY_EXECUTE_PERMISSIONS),
  assemblyCtrl.startStep
);
router.post(
  '/steps/:stepId/complete',
  requirePermission(ASSEMBLY_EXECUTE_PERMISSIONS),
  assemblyCtrl.completeStep
);
router.post(
  '/steps/:stepId/skip',
  requirePermission(ASSEMBLY_EXECUTE_PERMISSIONS),
  assemblyCtrl.skipStep
);
router.get('/board', requirePermission(ASSEMBLY_VIEW_PERMISSIONS), assemblyCtrl.getBoard);

module.exports = router;
