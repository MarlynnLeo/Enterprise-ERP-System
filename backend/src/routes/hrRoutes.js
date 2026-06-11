const express = require('express');
const router = express.Router();
const hrController = require('../controllers/business/hr/hrController');
const { authenticateToken } = require('../middleware/authEnhanced');
const { requirePermission } = require('../middleware/requirePermission');
const { FileUploadMiddlewares } = require('../middleware/unifiedFileUpload');

const employeeRead = [authenticateToken, requirePermission('hr:employees')];
const attendanceRead = [authenticateToken, requirePermission('hr:attendance')];
const salaryRead = [authenticateToken, requirePermission(['hr:salary:view', 'hr:salary'])];

// 员工花名册
router.get('/employees', employeeRead, hrController.getEmployees);
router.post('/employees', authenticateToken, requirePermission('hr:employees:create'), hrController.createEmployee);
router.post('/employees/sync/dingtalk', authenticateToken, requirePermission('hr:employees:create'), hrController.syncDingtalk);
router.put('/employees/:id', authenticateToken, requirePermission('hr:employees:update'), hrController.updateEmployee);
router.delete('/employees/:id', authenticateToken, requirePermission('hr:employees:delete'), hrController.deleteEmployee);

// 考勤
router.get('/leave', attendanceRead, hrController.getLeaveRequests);
router.post('/leave', authenticateToken, requirePermission(['hr:attendance:create', 'hr:attendance:update']), hrController.createLeaveRequest);
router.get('/overtime', attendanceRead, hrController.getOvertimeRequests);
router.post('/overtime', authenticateToken, requirePermission(['hr:attendance:create', 'hr:attendance:update']), hrController.createOvertimeRequest);
router.get('/attendance', attendanceRead, hrController.getAttendance);
router.post('/attendance/batch', authenticateToken, requirePermission('hr:attendance:update'), hrController.batchSaveAttendance);
router.post('/attendance/sync/dingtalk', authenticateToken, requirePermission('hr:attendance:update'), hrController.syncAttendance);

// 考勤 Excel 导入
router.post('/attendance/import', authenticateToken, requirePermission('hr:attendance:update'), FileUploadMiddlewares.excel, hrController.importAttendanceExcel);

// 薪酬核算
router.get('/salary', salaryRead, hrController.getSalaryRecords);
router.post('/salary/calculate', authenticateToken, requirePermission('hr:salary:update'), hrController.calculateSalary);
router.put('/salary/:id/confirm', authenticateToken, requirePermission('hr:salary:update'), hrController.confirmSalary);
router.post('/salary/batch-confirm', authenticateToken, requirePermission('hr:salary:update'), hrController.batchConfirmSalary);
router.get('/salary/export', authenticateToken, requirePermission('hr:salary:view'), hrController.exportSalary);

// 考勤规则配置
router.get('/attendance/rules', attendanceRead, hrController.getAttendanceRules);
router.put('/attendance/rules/:id', authenticateToken, requirePermission('hr:attendance:update'), hrController.updateAttendanceRule);

module.exports = router;
