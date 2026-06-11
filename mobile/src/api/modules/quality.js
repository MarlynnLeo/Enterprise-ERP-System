/**
 * 质量管理 API 模块
 */
import api from '../client'

export const qualityApi = {
  // 质量统计
  getStatistics() {
    return api.get('/quality/statistics')
  },

  // 来料检验
  getIncomingInspections(params) {
    return api.get('/quality/inspections/incoming', { params })
  },

  // 单条检验详情（通用路由，适用于 incoming/process/final）
  getIncomingInspection(id) {
    return api.get(`/quality/inspections/${id}`)
  },

  // 获取检验项目列表
  getInspectionItems(id) {
    return api.get(`/quality/inspections/${id}/items`)
  },

  createIncomingInspection(data) {
    return api.post('/quality/inspections/incoming', data)
  },

  // 更新检验单（通用路由）
  updateIncomingInspection(id, data) {
    return api.put(`/quality/inspections/${id}`, data)
  },

  startInspection(id) {
    return api.put(`/quality/inspections/${id}`, { status: 'in_progress' })
  },

  completeInspection(id, data) {
    return api.put(`/quality/inspections/${id}`, { status: 'passed', ...data })
  },

  // 过程检验
  getProcessInspections(params) {
    return api.get('/quality/inspections/process', { params })
  },

  getProcessInspection(id) {
    return api.get(`/quality/inspections/${id}`)
  },

  createProcessInspection(data) {
    return api.post('/quality/inspections/process', data)
  },

  updateProcessInspection(id, data) {
    return api.put(`/quality/inspections/${id}`, data)
  },

  // 成品检验
  getFinalInspections(params) {
    return api.get('/quality/inspections/final', { params })
  },

  getFinalInspection(id) {
    return api.get(`/quality/inspections/${id}`)
  },

  createFinalInspection(data) {
    return api.post('/quality/inspections/final', data)
  },

  updateFinalInspection(id, data) {
    return api.put(`/quality/inspections/${id}`, data)
  },

  // 检验模板
  getInspectionTemplates(params) {
    return api.get('/quality/templates', { params })
  },

  getInspectionTemplate(id) {
    return api.get(`/quality/templates/${id}`)
  },

  // 质量追溯
  getTraceabilityRecords(params) {
    return api.get('/batch-traceability/latest-batches', { params })
  },

  traceBatch(materialCode, batchNumber) {
    return api.get(`/batch-traceability/chain`, { params: { materialCode, batchNumber } })
  },

  // 不合格品处理
  getNonconformanceRecords(params) {
    return api.get('/quality/nonconforming-products', { params })
  },

  getNonconformanceRecord(id) {
    return api.get(`/quality/nonconforming-products/${id}`)
  },

  createNonconformanceRecord(data) {
    return api.post('/quality/nonconforming-products', data)
  },

  updateNonconformanceRecord(id, data) {
    return api.put(`/quality/nonconforming-products/${id}`, data)
  },

  processNonconformance(id, action, data) {
    if (action === 'start') {
      return api.put(`/quality/nonconforming-products/${id}`, { ...data, status: 'processing' })
    }

    if (action === 'complete') {
      return api.put(`/quality/nonconforming-products/${id}/complete`, data)
    }

    return api.put(`/quality/nonconforming-products/${id}/disposition`, data)
  },

  // ==================== 质量统计报表 ====================
  getStatisticsOverview(params) {
    return api.get('/quality/statistics/overview', { params })
  },
  getDispositionStatistics(params) {
    return api.get('/quality/statistics/disposition', { params })
  },
  getTrendAnalysis(params) {
    return api.get('/quality/statistics/trend', { params })
  },
  getSupplierQualityAnalysis(params) {
    return api.get('/quality/statistics/supplier', { params })
  },
  getMaterialDefectAnalysis(params) {
    return api.get('/quality/statistics/material', { params })
  },
  getCostAnalysis(params) {
    return api.get('/quality/statistics/cost', { params })
  },

  // ==================== SPC ====================
  getSpcPlans(params) {
    return api.get('/quality/spc/plans', { params })
  },
  getSpcCpk(planId) {
    return api.get(`/quality/spc/plans/${planId}/cpk`)
  },
  getSpcChart(planId) {
    return api.get(`/quality/spc/plans/${planId}/chart`)
  },

  // ==================== AQL 标准 ====================
  getAqlStandards(params) {
    return api.get('/quality/aql-standards', { params })
  },
  getAqlLevels() {
    return api.get('/quality/aql-levels')
  }
}
