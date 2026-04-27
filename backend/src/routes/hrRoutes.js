const express = require('express');
const router = express.Router();
const hrController = require('../controllers/business/hr/hrController');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');

// 提取共用的鉴权中间件
const hrRead = [authenticateToken, requirePermission('hr')];

// 员工花名册
router.get('/employees', hrRead, hrController.getEmployees);
router.post('/employees', authenticateToken, requirePermission('hr:employees:create'), hrController.createEmployee);
router.post('/employees/sync/dingtalk', authenticateToken, requirePermission('hr:employees:create'), hrController.syncDingtalk);
router.put('/employees/:id', authenticateToken, requirePermission('hr:employees:update'), hrController.updateEmployee);
router.delete('/employees/:id', authenticateToken, requirePermission('hr:employees:delete'), hrController.deleteEmployee);

// 考勤
router.get('/attendance', hrRead, hrController.getAttendance);
router.post('/attendance/batch', authenticateToken, requirePermission('hr:attendance:update'), hrController.batchSaveAttendance);
router.post('/attendance/sync/dingtalk', authenticateToken, requirePermission('hr:attendance:update'), hrController.syncAttendance);

// 考勤 Excel 导入（multer 内存上传）
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.post('/attendance/import', authenticateToken, requirePermission('hr:attendance:update'), upload.single('file'), hrController.importAttendanceExcel);

// 薪酬核算
router.get('/salary', hrRead, hrController.getSalaryRecords);
router.post('/salary/calculate', authenticateToken, requirePermission('hr:salary:update'), hrController.calculateSalary);
router.put('/salary/:id/confirm', authenticateToken, requirePermission('hr:salary:update'), hrController.confirmSalary);
router.post('/salary/batch-confirm', authenticateToken, requirePermission('hr:salary:update'), hrController.batchConfirmSalary);
router.get('/salary/export', authenticateToken, requirePermission('hr:salary:view'), hrController.exportSalary);

// 考勤规则配置
router.get('/attendance/rules', hrRead, hrController.getAttendanceRules);
router.put('/attendance/rules/:id', authenticateToken, requirePermission('hr:attendance:update'), hrController.updateAttendanceRule);

module.exports = router;
