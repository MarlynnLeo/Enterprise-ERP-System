import { api } from '../services/axiosInstance'

const normalizeMaterialNumber = (value) => {
  const numberValue = Number(value || 0)
  return Number.isFinite(numberValue) ? numberValue : 0
}

const normalizeMaterialRequirement = (material) => {
  // HTTP SSOT: camel only
  const materialId = material.materialId ?? material.id
  const requiredQuantity = normalizeMaterialNumber(material.requiredQuantity)
  const stockQuantity = normalizeMaterialNumber(material.stockQuantity)
  const availableQuantity = normalizeMaterialNumber(
    material.availableQuantity ?? stockQuantity
  )
  const rawIssueQuantity = material.issueQuantity ?? material.actualQuantity
  const issueQuantity =
    rawIssueQuantity === undefined || rawIssueQuantity === null
      ? Math.min(requiredQuantity, availableQuantity)
      : normalizeMaterialNumber(rawIssueQuantity)
  const shortageQuantity = normalizeMaterialNumber(
    material.shortageQuantity ?? Math.max(0, requiredQuantity - issueQuantity)
  )
  const grossRequiredQuantity = normalizeMaterialNumber(
    material.grossRequiredQuantity ?? requiredQuantity
  )

  return {
    ...material,
    id: material.id ?? materialId,
    materialId,
    quantity: requiredQuantity,
    requiredQuantity,
    plannedQuantity: requiredQuantity,
    grossRequiredQuantity,
    issueQuantity,
    actualQuantity: issueQuantity,
    stockQuantity,
    availableQuantity,
    shortageQuantity,
    status: shortageQuantity > 0 ? 'shortage' : 'sufficient',
    materialCode: material.code || material.materialCode || '',
    materialName: material.name || material.materialName || ''
  }
}

const normalizeMaterialResponse = (response) => {
  const data = response.data

  if (Array.isArray(data)) return data
  if (Array.isArray(data?.list)) return data.list
  if (Array.isArray(data?.materials)) return data.materials

  return data && typeof data === 'object' ? [data] : []
}

export const productionApi = {
  getPublicProductionBoard: (params) => api.get('/public/production-board', { params }),
  getDashboardStatistics: () => api.get('/production/dashboard/statistics'),
  getDashboardTrends: (params) => api.get('/production/dashboard/trends', { params }),
  getProcessCompletionRates: () => api.get('/production/dashboard/process-completion'),
  getPendingTasks: (params) => api.get('/production/dashboard/pending-tasks', { params }),
  getDashboardProductionPlans: (params) => api.get('/production/dashboard/plans', { params }),

  getTodayMaxSequence: () => api.get('/production/today-sequence'),
  getTodaySequence: () => api.get('/production/today-sequence'),
  getProductionPlans: (params = {}) => api.get('/production/plans', { params }),
  getProductionPlan: (id) => api.get(`/production/plans/${id}`),
  createProductionPlan: (data) => api.post('/production/plans', data),
  updateProductionPlan: (id, data) => api.put(`/production/plans/${id}`, data),
  deleteProductionPlan: (id) => api.delete(`/production/plans/${id}`),
  updateProductionPlanStatus: (id, data) => api.put(`/production/plans/${id}/status`, data),
  calculateMaterialsByBom: (bomId, params = {}) =>
    api.get(`/production/calculate-materials/${bomId}`, { params }),

  getProductionTasks: (params) => api.get('/production/tasks', { params }),
  getProductionTask: (id) => api.get(`/production/tasks/${id}`),
  createProductionTask: (data) => api.post('/production/tasks', data),
  updateProductionTask: (id, data) => api.put(`/production/tasks/${id}`, data),
  deleteProductionTask: (id) => api.delete(`/production/tasks/${id}`),
  updateProductionTaskStatus: (id, data) =>
    api.put(`/production/tasks/${id}/status`, { status: data.status }),
  generateTaskCode: () => api.get('/production/tasks/generate-code'),

  getProductionProcesses: (params) => api.get('/production/processes', { params }),
  getProductionProcess: (id) => api.get(`/production/processes/${id}`),
  createProductionProcess: (data) => api.post('/production/processes', data),
  updateProductionProcess: (id, data) => api.put(`/production/processes/${id}`, data),
  deleteProductionProcess: (id) => api.delete(`/production/processes/${id}`),

  getProductionReportSummary: (params) => api.get('/production/reports/summary', { params }),
  getProductionReportDetail: (params) => api.get('/production/reports/detail', { params }),
  getProductionReportStatistics: (params) => api.get('/production/reports/statistics', { params }),
  exportProductionReports: (params) => api.get('/production/reports/export', {
    params,
    responseType: 'blob'
  }),
  getTaskReportStats: (taskId) => api.get(`/production/reports/task/${taskId}/stats`),
  getTaskProcesses: (taskId) => api.get(`/production/reports/task/${taskId}/processes`),
  createProductionReport: (data) => api.post('/production/reports', data),
  updateProductionReport: (id, data) => api.put(`/production/reports/${id}`, data),
  deleteProductionReport: (id) => api.delete(`/production/reports/${id}`),

  exportProductionData: (params) => api.get('/production/export', {
    params,
    responseType: 'blob'
  }),

  calculateMaterials: async (params) => {
    if (!params?.productId || !params?.bomId || !params?.quantity) {
      throw new Error('Missing required parameters: productId, bomId, quantity')
    }

    const quantity = Number(params.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('quantity must be a number greater than 0')
    }

    const response = await api.post('/production/calculate-materials', {
      ...params,
      quantity
    })

    return {
      data: normalizeMaterialResponse(response).map(normalizeMaterialRequirement),
      success: true
    }
  },

  getProductBom: async (productId) => {
    if (!productId) {
      throw new Error('Missing required parameter: productId')
    }

    const response = await api.get(`/production/product-bom/${productId}`)
    return { data: response.data }
  },

  calculateSchedule: (data) => api.post('/production/scheduling/calculate', data),
  checkScheduleConflicts: (data) => api.post('/production/scheduling/check-conflicts', data),
  batchSchedule: (data) => api.post('/production/scheduling/batch', data),
  getSchedulingGanttData: (params) => api.get('/production/scheduling/gantt', { params }),
  getCalendars: () => api.get('/production/scheduling/calendars'),
  updateCalendar: (id, data) => api.put(`/production/scheduling/calendars/${id}`, data),
  setDefaultCalendar: (id) => api.post(`/production/scheduling/calendars/${id}/default`),
  getCalendarOverrides: (params) => api.get('/production/scheduling/calendar-overrides', { params }),
  saveCalendarOverrides: (data) => api.post('/production/scheduling/calendar-overrides', data),
  deleteCalendarOverride: (date) => api.delete(`/production/scheduling/calendar-overrides/${date}`),
  analyzeCalendarImpact: (data) => api.post('/production/scheduling/calendar-impact', data),
  recalculateCalendarImpact: (data) => api.post('/production/scheduling/calendar-impact/recalculate', data),

  completeTask: (id, data) => api.post(`/production/tasks/${id}/complete`, data),
  getTaskManagers: () => api.get('/production/tasks/managers'),
  updateTaskProgress: (id, data) => api.post(`/production/tasks/${id}/progress`, data),
  getTaskBom: (id) => api.get(`/production/tasks/${id}/bom`),
  getPlanMaterials: (id) => api.get(`/production/plans/${id}/materials`),
  getMaterialShortageSummary: (params) => api.get('/production/material-shortage-summary', { params })
}

export default productionApi
