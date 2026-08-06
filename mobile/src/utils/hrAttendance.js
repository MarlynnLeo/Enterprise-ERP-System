import { extractApiData } from '@/utils/apiHelper'

export const getCurrentPeriod = () => new Date().toISOString().slice(0, 7)

export const getPeriodFromDate = (date) => (date || new Date().toISOString().slice(0, 10)).slice(0, 7)

export const getAttendanceList = (response) => {
  const data = extractApiData(response, [])
  if (Array.isArray(data)) return data
  return data.list || data.items || data.rows || []
}

export const findEmployeeAttendance = async (hrApi, employeeId, period) => {
  try {
    const response = await hrApi.getAttendance({ period })
    return getAttendanceList(response).find((item) => String(item.employeeId) === String(employeeId)) || null
  } catch (error) {
    console.warn('读取考勤记录失败，将按新记录保存:', error)
    return null
  }
}

export const buildAttendanceRecord = (employeeId, existing, patch = {}) => ({
  employee_id: employeeId,
  days_in_month: Number(patch.days_in_month ?? existing?.days_in_month ?? 21.75),
  leave_days: Number(patch.leave_days ?? existing?.leave_days ?? 0),
  vacation_days: Number(patch.vacation_days ?? existing?.vacation_days ?? 0),
  overtime_hours: Number(patch.overtime_hours ?? existing?.overtime_hours ?? 0),
  full_attendance: Boolean(patch.full_attendance ?? existing?.full_attendance ?? false)
})
