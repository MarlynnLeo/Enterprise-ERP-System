/**
 * 人事管理 API 模块
 */
import api from '../client'

export const hrApi = {
  getEmployees(params) {
    return api.get('/hr/employees', { params })
  },
  createEmployee(data) {
    return api.post('/hr/employees', data)
  },
  updateEmployee(id, data) {
    return api.put(`/hr/employees/${id}`, data)
  },
  getLeaveRequests(params) {
    return api.get('/hr/leave', { params })
  },
  createLeaveRequest(data) {
    return api.post('/hr/leave', data)
  },
  getOvertimeRequests(params) {
    return api.get('/hr/overtime', { params })
  },
  createOvertimeRequest(data) {
    return api.post('/hr/overtime', data)
  },
  getAttendance(params) {
    return api.get('/hr/attendance', { params })
  },
  saveAttendanceRecords(data) {
    return api.post('/hr/attendance/batch', data)
  },
  syncAttendance(period) {
    return api.post('/hr/attendance/sync/dingtalk', { period })
  },
  getAttendanceRules() {
    return api.get('/hr/attendance/rules')
  },
  getSalary(params) {
    return api.get('/hr/salary', { params })
  }
}
