/**
 * 质量管理路由
 */
export const qualityRoutes = [
  {
    path: '/quality',
    name: 'Quality',
    component: () => import('@/views/quality/Index.vue'),
    meta: { title: '质量管理', permission: 'quality' }
  },
  {
    path: '/quality/incoming',
    name: 'QualityIncoming',
    component: () => import('@/views/quality/Incoming.vue'),
    meta: { title: '来料检验', permission: 'quality' }
  },
  {
    path: '/quality/incoming/create',
    name: 'CreateIncomingInspection',
    component: () => import('@/views/quality/CreateIncoming.vue'),
    meta: { title: '新建来料检验', permission: 'quality' }
  },
  {
    path: '/quality/incoming/:id',
    name: 'IncomingInspectionDetail',
    component: () => import('@/views/quality/IncomingDetail.vue'),
    meta: { title: '来料检验详情', permission: 'quality' }
  },
  {
    path: '/quality/incoming/:id/inspect',
    name: 'IncomingInspect',
    component: () => import('@/views/quality/IncomingDetail.vue'),
    meta: { title: '执行检验', permission: 'quality' }
  },
  {
    path: '/quality/process',
    name: 'QualityProcess',
    component: () => import('@/views/quality/Process.vue'),
    meta: { title: '过程检验', permission: 'quality' }
  },
  {
    path: '/quality/process/create',
    name: 'CreateProcessInspection',
    component: () => import('@/views/quality/CreateProcess.vue'),
    meta: { title: '新建过程检验', permission: 'quality' }
  },
  {
    path: '/quality/process/:id',
    name: 'ProcessInspectionDetail',
    component: () => import('@/views/quality/ProcessDetail.vue'),
    meta: { title: '过程检验详情', permission: 'quality' }
  },
  {
    path: '/quality/final',
    name: 'QualityFinal',
    component: () => import('@/views/quality/Final.vue'),
    meta: { title: '成品检验', permission: 'quality' }
  },
  {
    path: '/quality/final/create',
    name: 'CreateFinalInspection',
    component: () => import('@/views/quality/CreateFinal.vue'),
    meta: { title: '新建成品检验', permission: 'quality' }
  },
  {
    path: '/quality/final/:id',
    name: 'FinalInspectionDetail',
    component: () => import('@/views/quality/FinalDetail.vue'),
    meta: { title: '成品检验详情', permission: 'quality' }
  },
  {
    path: '/quality/templates',
    name: 'QualityTemplates',
    component: () => import('@/views/quality/Templates.vue'),
    meta: { title: '检验模板', permission: 'quality' }
  },
  {
    path: '/quality/templates/:id',
    name: 'QualityTemplateDetail',
    component: () => import('@/views/common/RecordDetail.vue'),
    meta: { title: '检验模板详情', permission: 'quality', resource: 'qualityTemplate' }
  },
  {
    path: '/quality/traceability',
    name: 'QualityTraceability',
    component: () => import('@/views/quality/Traceability.vue'),
    meta: { title: '追溯管理', permission: 'quality' }
  },
  {
    path: '/quality/traceability/detail',
    name: 'QualityTraceabilityDetail',
    component: () => import('@/views/quality/TraceabilityDetail.vue'),
    meta: { title: '追溯详情', permission: 'quality' }
  },
  {
    path: '/quality/nonconformance',
    name: 'QualityNonconformance',
    component: () => import('@/views/quality/Nonconformance.vue'),
    meta: { title: '不合格品处理', permission: 'quality' }
  },
  {
    path: '/quality/nonconformance/:id',
    name: 'NonconformanceDetail',
    component: () => import('@/views/quality/NonconformanceDetail.vue'),
    meta: { title: '不合格品详情', permission: 'quality' }
  },
  {
    path: '/quality/reports/statistics',
    name: 'QualityReportStatistics',
    component: () => import('@/views/quality/ReportStatistics.vue'),
    meta: { title: '质量统计', permission: 'quality' }
  },
  {
    path: '/quality/reports/spc',
    name: 'QualityReportSPC',
    component: () => import('@/views/quality/ReportSPC.vue'),
    meta: { title: 'SPC分析', permission: 'quality' }
  },
  {
    path: '/quality/reports/trends',
    name: 'QualityReportTrends',
    component: () => import('@/views/quality/ReportTrends.vue'),
    meta: { title: '质量趋势', permission: 'quality' }
  },
  {
    path: '/quality/standards',
    name: 'QualityStandards',
    component: () => import('@/views/quality/Standards.vue'),
    meta: { title: '质量标准', permission: 'quality' }
  }
]
