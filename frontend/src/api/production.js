import { api } from '../services/axiosInstance'

const normalizeMaterialNumber = (value) => {
  const numberValue = Number(value || 0)
  return Number.isFinite(numberValue) ? numberValue : 0
}

const normalizeMaterialRequirement = (material) => {
  const requiredQuantity = normalizeMaterialNumber(
    material.requiredQuantity ?? material.required_quantity
  )
  const stockQuantity = normalizeMaterialNumber(
    material.stockQuantity ?? material.stock_quantity
  )
  const availableQuantity = normalizeMaterialNumber(
    material.availableQuantity ?? material.available_quantity ?? stockQuantity
  )
  const rawIssueQuantity =
    material.issueQuantity ?? material.issue_quantity ?? material.actualQuantity ?? material.actual_quantity
  const issueQuantity =
    rawIssueQuantity === undefined || rawIssueQuantity === null
      ? Math.min(requiredQuantity, availableQuantity)
      : normalizeMaterialNumber(rawIssueQuantity)
  const shortageQuantity = normalizeMaterialNumber(
    material.shortageQuantity ??
      material.shortage_quantity ??
      Math.max(0, requiredQuantity - issueQuantity)
  )
  const grossRequiredQuantity = normalizeMaterialNumber(
    material.grossRequiredQuantity ?? material.gross_required_quantity ?? requiredQuantity
  )

  return {
    ...material,
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
    materialCode: material.code || material.materialCode || material.material_code || '',
    materialName: material.name || material.materialName || material.material_name || ''
  }
}

const normalizeMaterialResponse = (response) => {
  const data = response.data

  if (Array.isArray(data)) {
    return data
  }

  if (Array.isArray(data?.list)) {
    return data.list
  }

  if (Array.isArray(data?.materials)) {
    return data.materials
  }

  return data && typeof data === 'object' ? [data] : []
}

export const productionApi = {
  // Dashboard
  getDashboardStatistics: () => api.get('/production/dashboard/statistics'),
  getDashboardTrends: (params) => api.get('/production/dashboard/trends', { params }),
  getProcessCompletionRates: () => api.get('/production/dashboard/process-completion'),
  getPendingTasks: (params) => api.get('/production/dashboard/pending-tasks', { params }),
  getDashboardProductionPlans: (params) => api.get('/production/dashboard/plans', { params }),

  // Plans
  getTodayMaxSequence: () => api.get('/production/today-sequence'),
  getTodaySequence: () => api.get('/production/today-sequence'),
  getProductionPlans: (params = {}) => api.get('/production/plans', {
    params,
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    }
  }),
  getProductionPlan: (id) => api.get(`/production/plans/${id}`),
  createProductionPlan: (data) => api.post('/production/plans', data),
  updateProductionPlan: (id, data) => api.put(`/production/plans/${id}`, data),
  deleteProductionPlan: (id) => api.delete(`/production/plans/${id}`),
  updateProductionPlanStatus: (id, data) => api.put(`/production/plans/${id}/status`, data),

  // Tasks
  getProductionTasks: (params) => api.get('/production/tasks', { params }),
  getProductionTask: (id) => api.get(`/production/tasks/${id}`),
  createProductionTask: (data) => api.post('/production/tasks', data),
  updateProductionTask: (id, data) => api.put(`/production/tasks/${id}`, data),
  deleteProductionTask: (id) => api.delete(`/production/tasks/${id}`),
  updateProductionTaskStatus: (id, data) =>
    api.put(`/production/tasks/${id}/status`, { status: data.status }),
  generateTaskCode: () => api.get('/production/tasks/generate-code'),

  // Processes
  getProductionProcesses: (params) => api.get('/production/processes', { params }),
  getProductionProcess: (id) => api.get(`/production/processes/${id}`),
  updateProductionProcess: (id, data) => api.put(`/production/processes/${id}`, data),

  // Reports
  getProductionReportSummary: (params) => api.get('/production/reports/summary', { params }),
  getProductionReportDetail: (params) => api.get('/production/reports/detail', { params }),
  getProductionReportStatistics: (params) => api.get('/production/reports/statistics', { params }),
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
      throw new Error('缺少必要参数: productId, bomId, quantity')
    }

    const quantity = Number(params.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('quantity 参数必须是大于 0 的数字')
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
      throw new Error('缺少必要参数: productId')
    }

    const response = await api.get(`/production/product-bom/${productId}`)
    return { data: response.data }
  },

  // 任务完成
  completeTask: (id, data) => api.post(`/production/tasks/${id}/complete`, data),

  // 获取任务负责人列表
  getTaskManagers: () => api.get('/production/tasks/managers'),

  // 更新任务进度
  updateTaskProgress: (id, data) => api.post(`/production/tasks/${id}/progress`, data),

  // 获取任务BOM
  getTaskBom: (id) => api.get(`/production/tasks/${id}/bom`),

  // 获取计划物料需求
  getPlanMaterials: (id) => api.get(`/production/plans/${id}/materials`),

  // 获取缺料汇总
  getMaterialShortageSummary: (params) => api.get('/production/material-shortage-summary', { params }),

  // 排程相关接口
  getSchedulingGanttData: (params) => api.get('/production/scheduling/gantt', { params })
}

export default productionApi
