/**
 * 质量管理 - 菜单权限数据
 * 从 menuPermissions.js 拆分
 */

export const qualityPerms = [
// 8. 质量管理
  {
    id: 8,
    parentId: 0,
    name: '质量管理',
    path: '/quality',
    component: '',
    icon: 'icon-quality',
    type: 0,
    permission: 'quality',
    sort: 8,
    status: 1
  },
  {
    id: 81,
    parentId: 8,
    name: '来料检验',
    path: '/quality/incoming',
    component: 'quality/IncomingInspection',
    icon: 'icon-document',
    type: 1,
    permission: 'quality:incoming',
    sort: 1,
    status: 1
  },
  {
    id: 82,
    parentId: 8,
    name: '过程检验',
    path: '/quality/process',
    component: 'quality/ProcessInspection',
    icon: 'icon-outbound',
    type: 1,
    permission: 'quality:process',
    sort: 2,
    status: 1
  },
  {
    id: 821,
    parentId: 8,
    name: '首检管理',
    path: '/quality/first-article',
    component: 'quality/FirstArticleInspection',
    icon: 'icon-check',
    type: 1,
    permission: 'quality:first-article',
    sort: 3,
    status: 1
  },
  {
    id: 83,
    parentId: 8,
    name: '成品检验',
    path: '/quality/final',
    component: 'quality/FinalInspection',
    icon: 'icon-return',
    type: 1,
    permission: 'quality:final',
    sort: 4,
    status: 1
  },
  {
    id: 84,
    parentId: 8,
    name: '检验模板',
    path: '/quality/templates',
    component: 'quality/InspectionTemplates',
    icon: 'icon-document',
    type: 1,
    permission: 'quality:templates',
    sort: 4,
    status: 1
  },
  {
    id: 85,
    parentId: 8,
    name: '全链路追溯',
    path: '/quality/traceability',
    component: 'quality/components/UnifiedTraceability',
    icon: 'icon-connection',
    type: 1,
    permission: 'quality:traceability',
    sort: 5,
    status: 1
  },
  {
    id: 86,
    parentId: 8,
    name: '不合格品',
    path: '/quality/nonconforming',
    component: 'quality/NonconformingProducts',
    icon: 'icon-warning',
    type: 1,
    permission: 'quality:nonconforming',
    sort: 6,
    status: 1
  },
  {
    id: 87,
    parentId: 8,
    name: '换货单管理',
    path: '/quality/replacement-orders',
    component: 'quality/ReplacementOrders',
    icon: 'icon-refresh',
    type: 1,
    permission: 'quality:replacement',
    sort: 7,
    status: 1
  },
  {
    id: 88,
    parentId: 8,
    name: '返工任务管理',
    path: '/quality/rework-tasks',
    component: 'quality/ReworkTasks',
    icon: 'icon-refresh-left',
    type: 1,
    permission: 'quality:rework',
    sort: 8,
    status: 1
  },
  {
    id: 89,
    parentId: 8,
    name: '报废记录管理',
    path: '/quality/scrap-records',
    component: 'quality/ScrapRecords',
    icon: 'icon-delete',
    type: 1,
    permission: 'quality:scrap',
    sort: 9,
    status: 1
  },
  {
    id: 810,
    parentId: 8,
    name: '质量统计报表',
    path: '/quality/statistics',
    component: 'quality/QualityStatistics',
    icon: 'icon-data-analysis',
    type: 1,
    permission: 'quality:statistics',
    sort: 10,
    status: 1
  },
];
