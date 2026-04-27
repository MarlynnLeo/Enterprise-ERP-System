/**
 * 系统管理模块路由
 */
import ModuleContainer from '../../components/common/ModuleContainer.vue'

export default {
    path: 'system',
    name: 'system',
    component: ModuleContainer,
    props: { moduleName: 'system' },
    meta: {
        requiresAuth: true,
        permission: 'system'
    },
    children: [
        {
            path: '',
            name: 'system-dashboard',
            redirect: '/system/users'
        },
        {
            path: 'users',
            name: 'system-users',
            component: () => import('../../views/system/Users.vue'),
            meta: {
                requiresAuth: true,
                permission: 'system:users'
            }
        },
        {
            path: 'departments',
            name: 'system-departments',
            component: () => import('../../views/system/Departments.vue'),
            meta: {
                requiresAuth: true,
                permission: 'system:departments'
            }
        },
        {
            path: 'permissions',
            name: 'system-permissions',
            component: () => import('../../views/system/Permissions.vue'),
            meta: {
                requiresAuth: true,
                permission: 'system:permissions'
            }
        },
        {
            path: 'business-types',
            name: 'system-business-types',
            component: () => import('../../views/system/BusinessTypes.vue'),
            meta: {
                requiresAuth: true,
                permission: 'system:business-types'
            }
        },
        {
            path: 'print',
            name: 'system-print',
            component: () => import('../../views/system/Print.vue'),
            meta: {
                requiresAuth: true,
                permission: 'system:print'
            }
        },
        {
            path: 'notifications',
            name: 'system-notifications',
            component: () => import('../../views/system/Notifications.vue'),
            meta: {
                requiresAuth: true,
                permission: 'system:notifications'
            }
        },
        {
            path: 'technical-communication',
            name: 'system-technical-communication',
            component: () => import('../../views/system/TechnicalCommunication.vue'),
            meta: {
                requiresAuth: true,
                permission: 'system:tech-comm'
            }
        },
        {
            path: 'workflow',
            name: 'system-workflow',
            component: () => import('../../views/system/WorkflowManagement.vue'),
            meta: {
                requiresAuth: true,
                permission: 'system:workflow'
            }
        },
        {
            path: 'coding-rules',
            name: 'system-coding-rules',
            component: () => import('../../views/system/CodingRules.vue'),
            meta: {
                requiresAuth: true,
                permission: 'system:settings'
            }
        },
        {
            path: 'documents',
            name: 'system-documents',
            component: () => import('../../views/system/DocumentManagement.vue'),
            meta: {
                requiresAuth: true,
                permission: 'system:documents'
            }
        },
        {
            path: 'business-alerts',
            name: 'system-business-alerts',
            component: () => import('../../views/system/BusinessAlerts.vue'),
            meta: {
                requiresAuth: true,
                permission: 'system:settings'
            }
        }
    ]
}
