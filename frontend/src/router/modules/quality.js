/**
 * 质量管理模块路由
 */
export default {
    path: 'quality',
    name: 'quality',
    component: () => import('../../views/quality/QualityManagement.vue'),
    meta: {
        requiresAuth: true,
        permission: 'quality'
    },
    children: [
        {
            path: '',
            name: 'quality-dashboard',
            redirect: '/quality/incoming'
        },
        {
            path: 'incoming',
            name: 'quality-incoming',
            component: () => import('../../views/quality/IncomingInspection.vue'),
            meta: {
                requiresAuth: true,
                permission: 'quality:incoming'
            }
        },
        {
            path: 'process',
            name: 'quality-process',
            component: () => import('../../views/quality/ProcessInspection.vue'),
            meta: {
                requiresAuth: true,
                permission: 'quality:process'
            }
        },
        {
            path: 'first-article',
            name: 'quality-first-article',
            component: () => import('../../views/quality/FirstArticleInspection.vue'),
            meta: {
                requiresAuth: true,
                permission: 'quality:first-article',
                title: '首检管理',
                icon: 'el-icon-check'
            }
        },
        {
            path: 'templates',
            name: 'InspectionTemplates',
            component: () => import('../../views/quality/InspectionTemplates.vue'),
            meta: {
                requiresAuth: true,
                permission: 'quality:templates',
                title: '检验模板',
                icon: 'el-icon-document'
            }
        },
        {
            path: 'nonconforming',
            name: 'quality-nonconforming',
            component: () => import('../../views/quality/NonconformingProducts.vue'),
            meta: {
                requiresAuth: true,
                permission: 'quality:nonconforming',
                title: '不合格品',
                icon: 'el-icon-warning'
            }
        },
        {
            path: '8d-reports',
            name: 'quality-8d-reports',
            component: () => import('../../views/quality/EightDReport.vue'),
            meta: {
                requiresAuth: true,
                permission: 'quality:8d',
                title: '8D报告',
                icon: 'el-icon-document-checked'
            }
        },
        {
            path: 'aql-standards',
            name: 'quality-aql-standards',
            component: () => import('../../views/quality/AQLStandards.vue'),
            meta: {
                requiresAuth: true,
                permission: 'quality:aql',
                title: 'AQL 抽样标准库',
                icon: 'el-icon-setting'
            }
        },
        {
            path: 'replacement-orders',
            name: 'quality-replacement-orders',
            component: () => import('../../views/quality/ReplacementOrders.vue'),
            meta: {
                requiresAuth: true,
                permission: 'quality:replacement',
                title: '换货单管理',
                icon: 'el-icon-refresh'
            }
        },
        {
            path: 'rework-tasks',
            name: 'quality-rework-tasks',
            component: () => import('../../views/quality/ReworkTasks.vue'),
            meta: {
                requiresAuth: true,
                permission: 'quality:rework',
                title: '返工任务管理',
                icon: 'el-icon-tools'
            }
        },
        {
            path: 'scrap-records',
            name: 'quality-scrap-records',
            component: () => import('../../views/quality/ScrapRecords.vue'),
            meta: {
                requiresAuth: true,
                permission: 'quality:scrap',
                title: '报废记录管理',
                icon: 'el-icon-delete'
            }
        },
        {
            path: 'statistics',
            name: 'quality-statistics',
            component: () => import('../../views/quality/QualityStatistics.vue'),
            meta: {
                requiresAuth: true,
                permission: 'quality:statistics',
                title: '质量统计报表',
                icon: 'el-icon-data-analysis'
            }
        },
        {
            path: 'final',
            name: 'quality-final',
            component: () => import('../../views/quality/FinalInspection.vue'),
            alias: 'final-inspection',
            meta: {
                requiresAuth: true,
                permission: 'quality:final'
            }
        },
        {
            path: 'traceability',
            name: 'quality-traceability',
            component: () => import('../../views/quality/components/UnifiedTraceability.vue'),
            meta: {
                requiresAuth: true,
                permission: 'quality:traceability',
                title: '批次追溯',
                icon: 'el-icon-connection'
            }
        },

        {
            path: 'gauges',
            name: 'quality-gauges',
            component: () => import('../../views/quality/GaugeManagement.vue'),
            meta: {
                requiresAuth: true,
                permission: 'quality:gauges',
                title: '量具管理',
                icon: 'el-icon-odometer'
            }
        },
        {
            path: 'spc',
            name: 'quality-spc',
            component: () => import('../../views/quality/SPCControlChart.vue'),
            meta: {
                requiresAuth: true,
                permission: 'quality:spc',
                title: 'SPC 控制图',
                icon: 'el-icon-data-line'
            }
        },
        {
            path: 'supplier-quality',
            name: 'quality-supplier-quality',
            component: () => import('../../views/quality/SupplierQualityScorecard.vue'),
            meta: {
                requiresAuth: true,
                permission: 'quality:supplier-quality',
                title: '供应商质量计分卡',
                icon: 'el-icon-trophy'
            }
        }
    ]
}
