/**
 * 销售管理模块路由
 */
import ModuleContainer from '../../components/common/ModuleContainer.vue'

export default {
    path: 'sales',
    name: 'sales',
    component: ModuleContainer,
    props: { moduleName: 'sales' },
    meta: {
        requiresAuth: true,
        permission: 'sales'
    },
    children: [
        {
            path: 'orders',
            name: 'salesOrders',
            component: () => import('../../views/sales/SalesOrders.vue'),
            meta: {
                requiresAuth: true,
                permission: 'sales:orders'
            }
        },
        {
            path: 'outbound',
            name: 'salesOutbound',
            component: () => import('../../views/sales/SalesOutbound.vue'),
            meta: {
                requiresAuth: true,
                permission: 'sales:outbound'
            }
        },
        {
            path: 'returns',
            name: 'salesReturns',
            component: () => import('../../views/sales/SalesReturns.vue'),
            meta: {
                requiresAuth: true,
                permission: 'sales:returns'
            }
        },
        {
            path: 'exchanges',
            name: 'salesExchanges',
            component: () => import('../../views/sales/SalesExchanges.vue'),
            meta: {
                requiresAuth: true,
                permission: 'sales:exchanges'
            }
        },
        {
            path: 'quotations',
            name: 'salesQuotations',
            component: () => import('../../views/sales/SalesQuotations.vue'),
            meta: {
                requiresAuth: true,
                permission: 'sales:quotations'
            }
        },
        {
            path: 'packing-lists',
            name: 'salesPackingLists',
            component: () => import('../../views/sales/PackingLists.vue'),
            meta: {
                requiresAuth: true,
                permission: 'sales:packing-lists'
            }
        },
        {
            path: 'delivery-stats',
            name: 'deliveryStats',
            component: () => import('../../views/sales/DeliveryStats.vue'),
            meta: {
                requiresAuth: true,
                permission: 'sales:delivery-stats'
            }
        },
        {
            path: 'contracts',
            name: 'contractManagement',
            component: () => import('../../views/sales/ContractManagement.vue'),
            meta: {
                requiresAuth: true,
                permission: 'contract:view'
            }
        }
    ]
}
