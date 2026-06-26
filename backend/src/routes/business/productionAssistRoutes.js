const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/business/productionAssistController');
const { authenticateToken } = require('../../middleware/authEnhanced');

router.use(authenticateToken);

// 物料齐套检查
router.get('/material-readiness/:taskId', ctrl.checkReadiness);
router.post('/material-readiness/batch', ctrl.checkReadinessBatch);

// 扫码防错
router.post('/scan-verify', ctrl.scanVerify);
router.get('/verification-logs', ctrl.getVerificationLogs);

module.exports = router;
