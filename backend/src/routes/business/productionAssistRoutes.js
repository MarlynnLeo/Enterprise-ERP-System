const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/business/productionAssistController');
const { authenticateToken } = require('../../middleware/authEnhanced');
const { requirePermission } = require('../../middleware/requirePermission');

router.use(authenticateToken);

const READINESS_VIEW_PERMISSIONS = [
  'production:material-check',
  'production:material-check:view',
  'production:shortage',
  'production:tasks:view',
];

const VERIFICATION_VIEW_PERMISSIONS = [
  'production:assembly',
  'production:assembly:view',
  'production:tasks:view',
  'production:process:view',
];

const VERIFICATION_EXECUTE_PERMISSIONS = [
  'production:assembly',
  'production:assembly:execute',
  'production:tasks:update',
  'production:process:update',
];

router.post(
  '/material-readiness/batch',
  requirePermission(READINESS_VIEW_PERMISSIONS),
  ctrl.checkReadinessBatch
);
router.get(
  '/material-readiness/:taskId',
  requirePermission(READINESS_VIEW_PERMISSIONS),
  ctrl.checkReadiness
);

router.post('/scan-verify', requirePermission(VERIFICATION_EXECUTE_PERMISSIONS), ctrl.scanVerify);
router.get(
  '/verification-logs',
  requirePermission(VERIFICATION_VIEW_PERMISSIONS),
  ctrl.getVerificationLogs
);

module.exports = router;
