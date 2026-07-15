const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/business/employeeSkillController');
const { authenticateToken } = require('../../middleware/authEnhanced');
const { requirePermission } = require('../../middleware/requirePermission');

router.use(authenticateToken);

const VIEW_PERMISSIONS = ['hr:skills', 'hr:skills:view'];
const CREATE_PERMISSIONS = ['hr:skills:create'];
const UPDATE_PERMISSIONS = ['hr:skills', 'hr:skills:update'];
const DELETE_PERMISSIONS = ['hr:skills:delete'];

router.get('/categories', requirePermission(VIEW_PERMISSIONS), ctrl.getCategories);
router.get('/matrix', requirePermission(VIEW_PERMISSIONS), ctrl.getMatrix);
router.get('/expiring', requirePermission(VIEW_PERMISSIONS), ctrl.getExpiring);
router.get('/', requirePermission(VIEW_PERMISSIONS), ctrl.getList);
router.get('/:id', requirePermission(VIEW_PERMISSIONS), ctrl.getById);
router.post('/', requirePermission(CREATE_PERMISSIONS), ctrl.create);
router.put('/:id', requirePermission(UPDATE_PERMISSIONS), ctrl.update);
router.delete('/:id', requirePermission(DELETE_PERMISSIONS), ctrl.delete);

module.exports = router;
