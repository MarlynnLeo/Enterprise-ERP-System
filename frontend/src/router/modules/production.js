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
            permission: 'production:report'
        }
    },
    {
        path: 'production/equipment-monitoring',
        name: 'equipmentMonitoring',
        component: () => import('../../views/production/EquipmentMonitoring.vue'),
        meta: {
            requiresAuth: true,
            permission: 'production:equipment-monitoring'
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
            permission: 'production:plans',
            title: 'MRP物料需求计划'
        }
    }
]
