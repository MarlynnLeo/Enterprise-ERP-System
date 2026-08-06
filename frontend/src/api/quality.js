import { api } from '../services/axiosInstance';

export const qualityApi = {
  getIncomingInspections: (params) => api.get('/quality/inspections/incoming', { params }),
  getIncomingInspectionStats: () => api.get('/quality/inspections/incoming/stats'),
  getIncomingInspection: (id, params) => api.get(`/quality/inspections/${id}`, { params }),
  createIncomingInspection: (data) => api.post('/quality/inspections', data),
  updateIncomingInspection: (id, data) => api.put(`/quality/inspections/${id}`, data),

  getProcessInspections: (params) => api.get('/quality/inspections/process', { params }),
  getProcessInspectionStats: () => api.get('/quality/inspections/process/stats'),
  getProcessInspection: (id) => api.get(`/quality/inspections/${id}`),
  createProcessInspection: (data) => api.post('/quality/inspections', data),
  updateProcessInspection: (id, data) => api.put(`/quality/inspections/${id}`, data),
  deleteProcessInspection: (id) => api.delete(`/quality/inspections/${id}`),

  getFinalInspections: (params) => api.get('/quality/inspections/final', { params }),
  getFinalInspectionStats: () => api.get('/quality/inspections/final/stats'),
  getFinalInspection: (id) => api.get(`/quality/inspections/${id}`),
  createFinalInspection: (data) => api.post('/quality/inspections', data),
  updateFinalInspection: (id, data) => api.put(`/quality/inspections/${id}`, data),
  deleteFinalInspection: (id) => api.delete(`/quality/inspections/${id}`),

  getFirstArticleInspections: (params) => api.get('/quality/inspections/first-article', { params }),
  getFirstArticleStats: () => api.get('/quality/inspections/first-article/stats'),
  createFirstArticleInspection: (data) => api.post('/quality/inspections/first-article', data),
  updateFirstArticleResult: (id, data) => api.put(`/quality/inspections/first-article/${id}/result`, data),
  getFirstArticleInspection: (id) => api.get(`/quality/inspections/${id}`),

  getFirstArticleRules: () => api.get('/quality/first-article-rules'),
  getFirstArticleRuleByProduct: (productId) => api.get(`/quality/first-article-rules/${productId}`),
  createFirstArticleRule: (data) => api.post('/quality/first-article-rules', data),
  updateFirstArticleRule: (id, data) => api.put(`/quality/first-article-rules/${id}`, data),
  deleteFirstArticleRule: (id) => api.delete(`/quality/first-article-rules/${id}`),

  getMaterialDefaultTemplate: (materialId, inspectionType = 'incoming') => api.get('/quality/templates', {
    params: {
      materialType: materialId,
      inspectionType,
      includeGeneral: true,
      status: 'active',
      pageSize: 50,
      page: 1,
    },
  }),
  getTemplates: (params) => api.get('/quality/templates', { params }),
  getTemplate: (id) => api.get(`/quality/templates/${id}`),
  createTemplate: (data) => api.post('/quality/templates', data),
  updateTemplate: (id, data) => api.put(`/quality/templates/${id}`, data),
  deleteInspectionTemplate: (id) => api.delete(`/quality/templates/${id}`),
  updateTemplateStatus: (id, status) => api.put(`/quality/templates/${id}/status`, { status }),
  copyTemplate: (id) => api.post(`/quality/templates/${id}/copy`),
  getReusableItems: (params) => api.get('/quality/templates/reusable-items', { params }),
  createReusableItem: (data) => api.post('/quality/templates/reusable-items', data),

  getQualityStatistics: (params = {}) => api.get('/quality/statistics', { params }),
  getDefectItems: (params = {}) => api.get('/quality/defect-items', { params }),
  getQualityTrends: (params = {}) => api.get('/quality/trends', { params }),
  getReworkStatusByInspectionIds: (inspectionIds) =>
    api.post('/quality/rework-tasks/by-inspections', { inspectionIds }),
  getInspectionItems: (id) => api.get(`/quality/inspections/${id}/items`),

  reworkTasks: {
    getList: (params) => api.get('/quality/rework-tasks', { params }),
    getStatistics: (params) => api.get('/quality/rework-tasks/statistics', { params }),
    getDetail: (id) => api.get(`/quality/rework-tasks/${id}`),
    assign: (id, data) => api.post(`/quality/rework-tasks/${id}/assign`, data),
    complete: (id, data) => api.post(`/quality/rework-tasks/${id}/complete`, data),
    update: (id, data) => api.put(`/quality/rework-tasks/${id}`, data)
  },

  scrapRecords: {
    getList: (params) => api.get('/quality/scrap-records', { params }),
    getStatistics: (params) => api.get('/quality/scrap-records/statistics', { params }),
    getDetail: (id) => api.get(`/quality/scrap-records/${id}`),
    approve: (id, data) => api.post(`/quality/scrap-records/${id}/approve`, data),
    complete: (id, data) => api.post(`/quality/scrap-records/${id}/complete`, data),
    update: (id, data) => api.put(`/quality/scrap-records/${id}`, data)
  },

  traceability: {
    getUnified: (params) => api.get('/batch-traceability/unified', { params }),
    getLatestBatches: (params) => api.get('/batch-traceability/latest-batches', { params }),
    exportReport: (params) => api.get('/batch-traceability/export/report', { params, responseType: 'blob' })
  },

  getProcessInspectionRules: () => api.get('/quality/process-inspection/rules'),
  createProcessInspectionRule: (data) => api.post('/quality/process-inspection/rules', data),
  updateProcessInspectionRule: (id, data) => api.put(`/quality/process-inspection/rules/${id}`, data),
  deleteProcessInspectionRule: (id) => api.delete(`/quality/process-inspection/rules/${id}`),

  getProcessInspectionPunchToday: () => api.get('/quality/process-inspection/punch/today'),
  getProcessInspectionPunchList: (params) => api.get('/quality/process-inspection/punch/list', { params }),
  createProcessInspectionPunch: (data) => api.post('/quality/process-inspection/punch', data),

  punchProcessInspection: (id, data) => api.post(`/quality/inspections/process/${id}/punch`, data),

  getAqlStandards: (params) => api.get('/quality/aql-standards', { params }),
  createAqlStandard: (data) => api.post('/quality/aql-standards', data),
  updateAqlStandard: (id, data) => api.put(`/quality/aql-standards/${id}`, data),
  deleteAqlStandard: (id) => api.delete(`/quality/aql-standards/${id}`),
  getAqlLevels: () => api.get('/quality/aql-levels'),
  // HTTP 入参只认 camel
  calculateAqlSampling: (data) => api.post('/quality/aql-sampling/calculate', {
    batchSize: data.batchSize,
    aqlLevel: data.aqlLevel,
  }),

  getGauges: (params) => api.get('/quality/gauges', { params }),
  getGaugeById: (id) => api.get(`/quality/gauges/${id}`),
  getDueGauges: () => api.get('/quality/gauges/due'),
  createGauge: (data) => api.post('/quality/gauges', data),
  updateGauge: (id, data) => api.put(`/quality/gauges/${id}`, data),
  deleteGauge: (id) => api.delete(`/quality/gauges/${id}`),
  getCalibrationRecords: (params) => api.get('/quality/calibrations', { params }),
  createCalibrationRecord: (data) => api.post('/quality/calibrations', data),

  getSpcPlans: (params) => api.get('/quality/spc/plans', { params }),
  createSpcPlan: (data) => api.post('/quality/spc/plans', data),
  updateSpcPlan: (id, data) => api.put(`/quality/spc/plans/${id}`, data),
  deleteSpcPlan: (id) => api.delete(`/quality/spc/plans/${id}`),
  addSpcDataPoints: (data) => api.post('/quality/spc/data', data),
  getSpcCpk: (planId) => api.get(`/quality/spc/plans/${planId}/cpk`),
  getSpcChart: (planId) => api.get(`/quality/spc/plans/${planId}/chart`),

  getSupplierScores: (params) => api.get('/quality/supplier-quality/scores', { params }),
  getSupplierRanking: (params) => api.get('/quality/supplier-quality/ranking', { params }),
  getSupplierTrend: (supplierId, params) => api.get(`/quality/supplier-quality/trend/${supplierId}`, { params }),
  calculateSupplierScores: (data) => api.post('/quality/supplier-quality/calculate', data),
};

export const qualityStatisticsApi = {
  getOverview: (params) => api.get('/quality/statistics/overview', { params }),
  getDispositionStatistics: (params) => api.get('/quality/statistics/disposition', { params }),
  getTrendAnalysis: (params) => api.get('/quality/statistics/trend', { params }),
  getSupplierQualityAnalysis: (params) => api.get('/quality/statistics/supplier', { params }),
  getMaterialDefectAnalysis: (params) => api.get('/quality/statistics/material', { params }),
  getCostAnalysis: (params) => api.get('/quality/statistics/cost', { params }),
};

export const eightDReportApi = {
  getReports: (params) => api.get('/quality/eight-d-reports', { params }),
  getReportById: (id) => api.get(`/quality/eight-d-reports/${id}`),
  getReportLogs: (id) => api.get(`/quality/eight-d-reports/${id}/logs`),
  createReport: (data) => api.post('/quality/eight-d-reports', data),
  updateReport: (id, data) => api.put(`/quality/eight-d-reports/${id}`, data),
  submitReview: (id) => api.post(`/quality/eight-d-reports/${id}/submit-review`),
  submitPhase2Review: (id) => api.post(`/quality/eight-d-reports/${id}/submit-phase2-review`),
  reviewReport: (id, data) => api.post(`/quality/eight-d-reports/${id}/review`, data),
  completeReport: (id) => api.post(`/quality/eight-d-reports/${id}/complete`),
  closeReport: (id) => api.post(`/quality/eight-d-reports/${id}/close`),
  deleteReport: (id) => api.delete(`/quality/eight-d-reports/${id}`),
  getStatistics: () => api.get('/quality/eight-d-reports/statistics'),
  aiAnalyze: (data) => api.post('/quality/eight-d-reports/ai-analyze', data, { timeout: 60000 }),
};
