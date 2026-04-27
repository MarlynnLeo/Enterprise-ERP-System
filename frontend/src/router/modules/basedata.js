/**
 * 基础数据模块路由
 */
export default {
    path: 'basedata',
    name: 'basedata',
    component: () => import('../../views/baseData/BaseData.vue'),
    meta: {
        requiresAuth: true,
        permission: 'basedata'
    },
    children: [
        {
            path: 'materials',
            name: 'materials',
            component: () => import('../../views/baseData/Materials.vue'),
            meta: {
                requiresAuth: true,
                permission: 'basedata:materials'
            }
        },
        {
            path: 'boms',
            name: 'boms',
            component: () => import('../../views/baseData/Boms.vue'),
            meta: {
                requiresAuth: true,
                permission: 'basedata:boms'
            }
        },
        {
            path: 'customers',
            name: 'customers',
            component: () => import('../../views/baseData/Customers.vue'),
            meta: {
                requiresAuth: true,
                permission: 'basedata:customers'
            }
        },
        {
            path: 'suppliers',
            name: 'suppliers',
            component: () => import('../../views/baseData/Suppliers.vue'),
            meta: {
                requiresAuth: true,
                permission: 'basedata:suppliers'
            }
        },
        {
            path: 'categories',
            name: 'categories',
            component: () => import('../../views/baseData/Categories.vue'),
            meta: {
                requiresAuth: true,
                permission: 'basedata:categories'
            }
        },
        {
            path: 'units',
            name: 'units',
            component: () => import('../../views/baseData/Units.vue'),
            meta: {
                requiresAuth: true,
                permission: 'basedata:units'
            }
        },
        {
            path: 'locations',
            name: 'locations',
            component: () => import('../../views/baseData/Locations.vue'),
            meta: {
                requiresAuth: true,
                permission: 'basedata:locations'
            }
        },
        {
            path: 'process-templates',
            name: 'processTemplates',
            component: () => import('../../views/baseData/ProcessTemplates.vue'),
            meta: {
                requiresAuth: true,
                permission: 'basedata:process-templates'
            }
        },
        {
            path: 'product-categories',
            name: 'productCategories',
            component: () => import('../../views/baseData/ProductCategories.vue'),
            meta: {
                requiresAuth: true,
                permission: 'basedata:product-categories'
            }
        },
        {
            path: 'ecn',
            name: 'ecnManagement',
            component: () => import('../../views/baseData/ECNManagement.vue'),
            meta: {
                requiresAuth: true,
                permission: 'basedata:bom'
            }
        }
    ]
}
