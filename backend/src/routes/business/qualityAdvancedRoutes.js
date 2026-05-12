/**
 * qualityAdvancedRoutes.js
 * @description 质量管理高级功能路由（量具校准 / SPC / 供应商计分卡）
 * @date 2026-03-03
 *
 * 挂载路径建议: /api/quality (与 qualityRoutes 共用前缀)
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/requirePermission');

const gaugeCtrl = require('../../controllers/business/quality/gaugeController');
const spcCtrl = require('../../controllers/business/quality/spcController');
const supplierQualityCtrl = require('../../controllers/business/quality/supplierQualityController');

// ==================== 量具台账 ====================
router.get('/gauges', authenticateToken, requirePermission('quality:gauges:view'), gaugeCtrl.getGauges);
router.get('/gauges/due', authenticateToken, requirePermission('quality:gauges:view'), gaugeCtrl.getDueGauges);
router.get('/gauges/:id', authenticateToken, requirePermission('quality:gauges:view'), gaugeCtrl.getGaugeById);
router.post('/gauges', authenticateToken, requirePermission('quality:gauges:create'), gaugeCtrl.createGauge);
router.put('/gauges/:id', authenticateToken, requirePermission('quality:gauges:update'), gaugeCtrl.updateGauge);
router.delete('/gauges/:id', authenticateToken, requirePermission('quality:gauges:delete'), gaugeCtrl.deleteGauge);

// ==================== 校准记录 ====================
router.get('/calibrations', authenticateToken, requirePermission('quality:gauges:view'), gaugeCtrl.getCalibrationRecords);
router.post('/calibrations', authenticateToken, requirePermission('quality:gauges:create'), gaugeCtrl.createCalibrationRecord);

// ==================== SPC 控制计划 ====================
router.get('/spc/plans', authenticateToken, requirePermission('quality:spc:view'), spcCtrl.getControlPlans);
router.post('/spc/plans', authenticateToken, requirePermission('quality:spc:update'), spcCtrl.createControlPlan);
router.put('/spc/plans/:id', authenticateToken, requirePermission('quality:spc:update'), spcCtrl.updateControlPlan);
router.delete('/spc/plans/:id', authenticateToken, requirePermission('quality:spc:update'), spcCtrl.deleteControlPlan);

// ==================== SPC 数据采集 & 分析 ====================
router.post('/spc/data', authenticateToken, requirePermission('quality:spc:update'), spcCtrl.addDataPoints);
router.get('/spc/plans/:id/cpk', authenticateToken, requirePermission('quality:spc:view'), spcCtrl.getCpk);
router.get('/spc/plans/:id/chart', authenticateToken, requirePermission('quality:spc:view'), spcCtrl.getControlChart);

// ==================== 供应商质量计分卡 ====================
router.get('/supplier-quality/scores', authenticateToken, requirePermission('quality:supplier-quality:view'), supplierQualityCtrl.getScores);
router.get('/supplier-quality/ranking', authenticateToken, requirePermission('quality:supplier-quality:view'), supplierQualityCtrl.getRanking);
router.get('/supplier-quality/trend/:supplierId', authenticateToken, requirePermission('quality:supplier-quality:view'), supplierQualityCtrl.getSupplierTrend);
router.post('/supplier-quality/calculate', authenticateToken, requirePermission('quality:supplier-quality:update'), supplierQualityCtrl.calculateMonthlyScores);

module.exports = router;
