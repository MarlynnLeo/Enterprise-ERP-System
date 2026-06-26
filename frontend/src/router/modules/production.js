/**
 * 生产管理模块路由
 * 注意：生产路由没有使用嵌套children结构，而是平级定义在Layout的children中
 */
export default [
    {
        path: 'production',
        name: 'production',
        redirect: '/production/plan',
        meta: {
            requiresAuth: true,
            permission: 'production'
        }
    },
    {
        path: 'production/plan',
        name: 'productionPlan',
        component: () => import('../../views/production/ProductionPlan.vue'),
        meta: {
            requiresAuth: true,
            permission: 'production:plans'
        }
    },
    {
        path: 'production/task',
        name: 'productionTask',
        component: () => import('../../views/production/ProductionTask.vue'),
        meta: {
            requiresAuth: true,
            permission: 'production:tasks'
        }
    },
    {
        path: 'production/process',
        name: 'productionProcess',
        component: () => import('../../views/production/ProductionProcess.vue'),
        meta: {
            requiresAuth: true,
            permission: 'production:process'
        }
    },
    {
        path: 'production/report',
        name: 'productionReport',
        component: () => import('../../views/production/ProductionReport.vue'),
        meta: {
            requiresAuth: true,
            permission: 'production:reports'
        }
    },
    {
        path: 'production/equipment-monitoring',
        name: 'equipmentMonitoring',
        component: () => import('../../views/production/EquipmentMonitoring.vue'),
        meta: {
            requiresAuth: true,
            permission: 'production:equipment'
        }
    },
    {
        path: 'production/material-shortage',
        name: 'materialShortage',
        component: () => import('../../views/production/MaterialShortage.vue'),
        meta: {
            requiresAuth: true,
            permission: 'production:shortage',
            title: '生产计划缺料统计'
        }
    },
    {
        path: 'production/mrp',
        name: 'mrpPlanning',
        component: () => import('../../views/production/MRPPlanning.vue'),
        meta: {
            requiresAuth: true,
            permission: 'production:mrp',
            title: '生产需求'
        }
    },
    {
        path: 'production/data-view',
        name: 'productionDataView',
        component: () => import('../../views/production/ProductionDataView.vue'),
        meta: {
            requiresAuth: true,
            permission: 'production:data-view',
            title: '生产数据看板'
        }
    },
    {
        path: 'production/gantt',
        name: 'productionGantt',
        component: () => import('../../views/production/ProductionGantt.vue'),
        meta: {
            requiresAuth: true,
            permission: 'production:gantt',
            title: '排程甘特图'
        }
    },
    {
        path: 'production/calendar',
        name: 'productionCalendar',
        component: () => import('../../views/production/ProductionCalendar.vue'),
        meta: {
            requiresAuth: true,
            permission: 'production:calendar',
            title: '生产日历'
        }
    },
    {
        path: 'production/anomaly',
        name: 'productionAnomaly',
        component: () => import('../../views/production/AnomalyReport.vue'),
        meta: {
            requiresAuth: true,
            permission: 'production:anomaly',
            title: '异常上报'
        }
    },
    {
        path: 'production/material-readiness',
        name: 'materialReadiness',
        component: () => import('../../views/production/MaterialReadiness.vue'),
        meta: {
            requiresAuth: true,
            permission: 'production:material-check',
            title: '物料齐套检查'
        }
    },
    {
        path: 'production/work-stations',
        name: 'workStations',
        component: () => import('../../views/production/WorkStations.vue'),
        meta: {
            requiresAuth: true,
            permission: 'production:stations',
            title: '工位管理'
        }
    },
    {
        path: 'production/process-routes',
        name: 'processRoutes',
        component: () => import('../../views/production/ProcessRoutes.vue'),
        meta: {
            requiresAuth: true,
            permission: 'production:routes',
            title: '工序路线'
        }
    },
    {
        path: 'production/assembly-board',
        name: 'assemblyBoard',
        component: () => import('../../views/production/AssemblyBoard.vue'),
        meta: {
            requiresAuth: true,
            permission: 'production:assembly',
            title: '装配看板'
        }
    }
]
