/**
 * 生产管理 API 模块
 */
import api from '../client'

export const productionApi = {
  // 仪表盘数据
  getDashboardStatistics() {
    return api.get('/production/dashboard/statistics')
  },

  getDashboardTrends() {
    return api.get('/production/dashboard/trends')
  },

  getPendingTasks() {
    return api.get('/production/dashboard/pending-tasks')
  },

  getProductionReportDetail(params) {
    return api.get('/production/reports/detail', { params })
  },

  // 生产计划
  getProductionPlans(params) {
    return api.get('/production/plans', { params })
  },

  getProductionPlan(id) {
    return api.get(`/production/plans/${id}`)
  },

  createProductionPlan(data) {
    return api.post('/production/plans', data)
  },

  updateProductionPlan(id, data) {
    return api.put(`/production/plans/${id}`, data)
  },

  updateProductionPlanStatus(id, status) {
    return api.put(`/production/plans/${id}/status`, { status })
  },

  deleteProductionPlan(id) {
    return api.delete(`/production/plans/${id}`)
  },

  // 获取计划物料需求
  getPlanMaterials(planId) {
    return api.get(`/production/plans/${planId}/materials`)
  },

  // 生产任务
  getProductionTasks(params) {
    return api.get('/production/tasks', { params })
  },

  getTasks(params) {
    return this.getProductionTasks(params)
  },

  getProductionTask(id) {
    return api.get(`/production/tasks/${id}`)
  },

  createProductionTask(data) {
    return api.post('/production/tasks', data)
  },

  updateProductionTask(id, data) {
    return api.put(`/production/tasks/${id}`, data)
  },

  updateProductionTaskStatus(id, status) {
    return api.put(`/production/tasks/${id}/status`, { status })
  },

  startProductionTask(id) {
    return this.updateProductionTaskStatus(id, 'in_progress')
  },

  updateProductionTaskProgress(id, progress) {
    return api.post(`/production/tasks/${id}/progress`, progress)
  },

  reportProductionProgress(data) {
    const {
      task_id: taskId,
      completed_quantity: completedQuantity,
      quantity,
      remarks,
      remark
    } = data || {}
    return api.post(`/production/tasks/${taskId}/complete`, {
      quantity: Number(completedQuantity ?? quantity),
      remark: remarks ?? remark ?? ''
    })
  },

  generateTaskCode() {
    return api.get('/production/tasks/generate-code')
  },

  // 获取生产过程
  getProcesses(params) {
    return api.get('/production/processes', { params })
  },

  // 物料需求计算
  calculateMaterials(data) {
    return api.post('/production/calculate-materials', data)
  },

  // 获取产品BOM
  getProductBom(productId) {
    return api.get(`/production/product-bom/${productId}`)
  },

  // 获取今日最大序号
  getTodayMaxSequence() {
    return api.get('/production/today-sequence')
  },

  // 删除生产任务（仅pending状态）
  deleteProductionTask(id) {
    return api.delete(`/production/tasks/${id}`)
  },

  // 取消生产计划
  cancelProductionPlan(id) {
    return api.put(`/production/plans/${id}/status`, { status: 'cancelled' })
  }
}
