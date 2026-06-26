/**
 * 工位管理 + 工序路线 + 装配执行 路由
 */
const express = require('express');
const router = express.Router();
const workStationCtrl = require('../../controllers/business/production/workStationController');
const processRouteCtrl = require('../../controllers/business/production/processRouteController');
const assemblyCtrl = require('../../controllers/business/production/assemblyExecutionController');
const { authenticateToken } = require('../../middleware/authEnhanced');

router.use(authenticateToken);

// ==================== 工位管理 ====================
router.get('/stations', workStationCtrl.getList);
router.get('/stations/lines', workStationCtrl.getLines);
router.get('/stations/status', workStationCtrl.getStationStatus);
router.get('/stations/:id', workStationCtrl.getById);
router.post('/stations', workStationCtrl.create);
router.put('/stations/:id', workStationCtrl.update);
router.delete('/stations/:id', workStationCtrl.delete);

// ==================== 工序路线 ====================
router.get('/routes', processRouteCtrl.getList);
router.get('/routes/product/:productId', processRouteCtrl.getActiveByProduct);
router.get('/routes/suggest-materials/:productId', processRouteCtrl.suggestMaterials);
router.get('/routes/:id', processRouteCtrl.getById);
router.post('/routes', processRouteCtrl.create);
router.put('/routes/:id', processRouteCtrl.update);
router.delete('/routes/:id', processRouteCtrl.delete);

// ==================== 装配执行 ====================
router.post('/tasks/:taskId/generate-steps', assemblyCtrl.generateSteps);
router.get('/tasks/:taskId/steps', assemblyCtrl.getTaskSteps);
router.get('/steps/:stepId', assemblyCtrl.getStepDetail);
router.post('/steps/:stepId/start', assemblyCtrl.startStep);
router.post('/steps/:stepId/complete', assemblyCtrl.completeStep);
router.post('/steps/:stepId/skip', assemblyCtrl.skipStep);
router.get('/board', assemblyCtrl.getBoard);

module.exports = router;
