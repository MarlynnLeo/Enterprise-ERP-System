import { api } from '@/services/axiosInstance'

export const hrApi = {
  // --------- Employees ---------
  getEmployees(params) {
    return api.get('/hr/employees', { params })
  },
  createEmployee(data) {
    return api.post('/hr/employees', data)
  },
  updateEmployee(id, data) {
    return api.put(`/hr/employees/${id}`, data)
  },
  deleteEmployee(id) {
    return api.delete(`/hr/employees/${id}`)
  },
  syncDingtalk() {
    return api.post('/hr/employees/sync/dingtalk')
  },

  // --------- Attendance ---------
  getAttendance(period) {
    return api.get('/hr/attendance', { params: { period } })
  },
  batchSaveAttendance(period, records) {
    return api.post('/hr/attendance/batch', { period, records })
  },
  syncAttendanceDingtalk(period) {
    return api.post('/hr/attendance/sync/dingtalk', { period })
  },
  importAttendanceExcel(formData) {
    return api.post('/hr/attendance/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  getAttendanceRules() {
    return api.get('/hr/attendance/rules')
  },
  updateAttendanceRule(id, data) {
    return api.put(`/hr/attendance/rules/${id}`, data)
  },

  // --------- Salary ---------
  getSalaryRecords(period) {
    return api.get('/hr/salary', { params: { period } })
  },
  calculateSalary(period) {
    return api.post('/hr/salary/calculate', { period })
  },
  confirmSalary(id) {
    return api.put(`/hr/salary/${id}/confirm`)
  },
  batchConfirmSalary(period) {
    return api.post('/hr/salary/batch-confirm', { period })
  },
  exportSalary(period) {
    return api.get('/hr/salary/export', { params: { period }, responseType: 'blob' })
  }
}
