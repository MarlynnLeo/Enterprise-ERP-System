/**
 * 生产管理路由
 */
export const productionRoutes = [
  {
    path: '/production',
    name: 'Production',
    component: () => import('@/views/production/Index.vue'),
    meta: { title: '生产管理', permission: 'production' }
  },
  {
    path: '/production/plans',
    name: 'ProductionPlans',
    component: () => import('@/views/production/Plans.vue'),
    meta: { title: '生产计划', permission: 'production' }
  },
  {
    path: '/production/plans/create',
    name: 'CreateProductionPlan',
    component: () => import('@/views/production/CreatePlan.vue'),
    meta: { title: '新建生产计划', permission: 'production' }
  },
  {
    path: '/production/plans/:id',
    name: 'ProductionPlanDetail',
    component: () => import('@/views/production/PlanDetail.vue'),
    meta: { title: '生产计划详情', permission: 'production' }
  },
  {
    path: '/production/tasks',
    name: 'ProductionTasks',
    component: () => import('@/views/production/Tasks.vue'),
    meta: { title: '生产任务', permission: 'production' }
  },
  {
    path: '/production/tasks/create',
    name: 'CreateProductionTask',
    component: () => import('@/views/production/CreateTask.vue'),
    meta: { title: '新建生产任务', permission: 'production' }
  },
  {
    path: '/production/tasks/:id/report',
    name: 'ProductionTaskReport',
    component: () => import('@/views/production/Report.vue'),
    meta: { title: '生产报工', permission: 'production' }
  },
  {
    path: '/production/tasks/:id',
    name: 'ProductionTaskDetail',
    component: () => import('@/views/production/TaskDetail.vue'),
    meta: { title: '生产任务详情', permission: 'production' }
  },
  {
    path: '/production/report',
    name: 'ProductionReport',
    component: () => import('@/views/production/Report.vue'),
    meta: { title: '生产报工', permission: 'production' }
  },
  {
    path: '/production/report/history',
    name: 'ProductionReportHistory',
    component: () => import('@/views/production/ReportHistory.vue'),
    meta: { title: '报工记录', permission: 'production' }
  },
  {
    path: '/production/dashboard',
    name: 'ProductionDashboard',
    component: () => import('@/views/production/Dashboard.vue'),
    meta: { title: '生产看板', permission: 'production' }
  },
  // 任务快捷路由
  {
    path: '/tasks',
    name: 'Tasks',
    component: () => import('@/views/production/Tasks.vue'),
    meta: { title: '任务列表', permission: 'production' }
  },
  {
    path: '/tasks/:id',
    name: 'TaskDetail',
    component: () => import('@/views/production/TaskDetail.vue'),
    meta: { title: '任务详情', permission: 'production' }
  }
]
