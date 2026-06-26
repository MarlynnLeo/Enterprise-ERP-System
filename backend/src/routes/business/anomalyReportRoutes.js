const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/business/anomalyReportController');
const { authenticateToken } = require('../../middleware/authEnhanced');

router.use(authenticateToken);

router.get('/stats', ctrl.getStats);
router.get('/', ctrl.getList);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.patch('/:id/assign', ctrl.assign);
router.patch('/:id/resolve', ctrl.resolve);
router.patch('/:id/close', ctrl.close);
router.delete('/:id', ctrl.delete);

module.exports = router;
