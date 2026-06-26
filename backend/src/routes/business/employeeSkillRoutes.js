const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/business/employeeSkillController');
const { authenticateToken } = require('../../middleware/authEnhanced');

router.use(authenticateToken);

router.get('/categories', ctrl.getCategories);
router.get('/matrix', ctrl.getMatrix);
router.get('/expiring', ctrl.getExpiring);
router.get('/', ctrl.getList);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.delete);

module.exports = router;
