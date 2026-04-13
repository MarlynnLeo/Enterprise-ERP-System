const express = require('express');
const router = express.Router();
const hrController = require('../controllers/business/hr/hrController');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');

// 提取共用的鉴权中间件
const hrAuth = [authenticateToken, requirePermission('hr')];

// 员工花名册
router.get('/employees', hrAuth, hrController.getEmployees);
router.post('/employees', hrAuth, hrController.createEmployee);
router.post('/employees/sync/dingtalk', hrAuth, hrController.syncDingtalk);
router.put('/employees/:id', hrAuth, hrController.updateEmployee);
router.delete('/employees/:id', hrAuth, hrController.deleteEmployee);

// 考勤
router.get('/attendance', hrAuth, hrController.getAttendance);
router.post('/attendance/batch', hrAuth, hrController.batchSaveAttendance);
router.post('/attendance/sync/dingtalk', hrAuth, hrController.syncAttendance);

// 考勤 Excel 导入（multer 内存上传）
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.post('/attendance/import', hrAuth, upload.single('file'), hrController.importAttendanceExcel);

// 薪酬核算
router.get('/salary', hrAuth, hrController.getSalaryRecords);
router.post('/salary/calculate', hrAuth, hrController.calculateSalary);
router.put('/salary/:id/confirm', hrAuth, hrController.confirmSalary);
router.post('/salary/batch-confirm', hrAuth, hrController.batchConfirmSalary);
router.get('/salary/export', hrAuth, hrController.exportSalary);

// 考勤规则配置
router.get('/attendance/rules', hrAuth, hrController.getAttendanceRules);
router.put('/attendance/rules/:id', hrAuth, hrController.updateAttendanceRule);

module.exports = router;
