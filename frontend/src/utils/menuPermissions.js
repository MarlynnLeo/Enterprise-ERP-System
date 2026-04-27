/**
 * 菜单权限数据 - 基于系统的菜单结构
 * 此数据可用于初始化菜单权限
 */

export const menuPermissions = [
  // 1. 仪表盘
  {
    id: 1,
    parentId: 0,
    name: '仪表盘',
    path: '/',
    component: 'Dashboard',
    icon: 'icon-dashboard',
    type: 1, // 1-菜单
    permission: 'dashboard',
    sort: 1,
    status: 1
  },

  // 2. 生产管理
  {
    id: 2,
    parentId: 0,
    name: '生产管理',
    path: '/production',
    component: '',
    icon: 'icon-data-line',
    type: 0, // 0-目录
    permission: 'production',
    sort: 2,
    status: 1
  },
  {
    id: 21,
    parentId: 2,
    name: '生产计划',
    path: '/production/plan',
    component: 'production/ProductionPlan',
    icon: 'icon-calendar',
    type: 1,
    permission: 'production:plans',
    sort: 1,
    status: 1
  },
  {
    id: 22,
    parentId: 2,
    name: '生产任务',
    path: '/production/task',
    component: 'production/ProductionTask',
    icon: 'icon-tickets',
    type: 1,
    permission: 'production:tasks',
    sort: 2,
    status: 1
  },
  {
    id: 23,
    parentId: 2,
    name: '生产过程',
    path: '/production/process',
    component: 'production/ProductionProcess',
    icon: 'icon-set-up',
    type: 1,
    permission: 'production:process',
    sort: 3,
    status: 1
  },
  {
    id: 24,
    parentId: 2,
    name: '生产报工',
    path: '/production/report',
    component: 'production/ProductionReport',
    icon: 'icon-data-analysis',
    type: 1,
    permission: 'production:report',
    sort: 4,
    status: 1
  },
  {
    id: 25,
    parentId: 2,
    name: '缺料统计',
    path: '/production/material-shortage',
    component: 'production/MaterialShortage',
    icon: 'icon-warning',
    type: 1,
    permission: 'production:shortage',
    sort: 5,
    status: 1
  },
  {
    id: 26,
    parentId: 2,
    name: '设备监控',
    path: '/production/equipment-monitoring',
    component: 'production/EquipmentMonitoring',
    icon: 'icon-monitor',
    type: 1,
    permission: 'production:equipment-monitoring',
    sort: 6,
    status: 1
  },
  {
    id: 27,
    parentId: 2,
    name: 'MRP需求计划',
    path: '/production/mrp',
    component: 'production/MRPPlanning',
    icon: 'icon-data-analysis',
    type: 1,
    permission: 'production:plans',
    sort: 7,
    status: 1
  },

  // 生产计划按钮权限
  {
    id: 211,
    parentId: 21,
    name: '查看生产计划',
    path: '',
    component: '',
    icon: '',
    type: 2, // 2-按钮
    permission: 'production:plans:view',
    sort: 1,
    status: 1
  },
  {
    id: 212,
    parentId: 21,
    name: '创建生产计划',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:plans:create',
    sort: 2,
    status: 1
  },
  {
    id: 213,
    parentId: 21,
    name: '编辑生产计划',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:plans:update',
    sort: 3,
    status: 1
  },
  {
    id: 214,
    parentId: 21,
    name: '删除生产计划',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:plans:delete',
    sort: 4,
    status: 1
  },
  {
    id: 215,
    parentId: 21,
    name: '审批生产计划',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:plans:approve',
    sort: 5,
    status: 1
  },
  {
    id: 216,
    parentId: 21,
    name: '导出生产计划',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:plans:export',
    sort: 6,
    status: 1
  },
  {
    id: 217,
    parentId: 21,
    name: '下推生产计划',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:plans:pushdown',
    sort: 7,
    status: 1
  },
  {
    id: 218,
    parentId: 21,
    name: '提交生产计划',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:plans:submit',
    sort: 8,
    status: 1
  },
  {
    id: 219,
    parentId: 21,
    name: '关闭生产计划',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:plans:close',
    sort: 9,
    status: 1
  },
  {
    id: 2110,
    parentId: 21,
    name: '取消生产计划',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:plans:cancel',
    sort: 10,
    status: 1
  },
  {
    id: 2111,
    parentId: 21,
    name: '导入生产计划',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:plans:import',
    sort: 11,
    status: 1
  },
  // 生产任务按钮权限
  {
    id: 221,
    parentId: 22,
    name: '查看生产任务',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:tasks:view',
    sort: 1,
    status: 1
  },
  {
    id: 222,
    parentId: 22,
    name: '创建生产任务',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:tasks:create',
    sort: 2,
    status: 1
  },
  {
    id: 223,
    parentId: 22,
    name: '编辑生产任务',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:tasks:update',
    sort: 3,
    status: 1
  },
  {
    id: 224,
    parentId: 22,
    name: '删除生产任务',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:tasks:delete',
    sort: 4,
    status: 1
  },
  {
    id: 225,
    parentId: 22,
    name: '开始任务',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:tasks:start',
    sort: 5,
    status: 1
  },
  {
    id: 226,
    parentId: 22,
    name: '完成任务',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:tasks:complete',
    sort: 6,
    status: 1
  },
  {
    id: 227,
    parentId: 22,
    name: '导出生产任务',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:tasks:export',
    sort: 7,
    status: 1
  },
  {
    id: 228,
    parentId: 22,
    name: '导入生产任务',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:tasks:import',
    sort: 8,
    status: 1
  },
  {
    id: 229,
    parentId: 22,
    name: '提交生产任务',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:tasks:submit',
    sort: 9,
    status: 1
  },
  {
    id: 2210,
    parentId: 22,
    name: '关闭生产任务',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:tasks:close',
    sort: 10,
    status: 1
  },
  // 生产过程按钮权限
  {
    id: 231,
    parentId: 23,
    name: '查看生产过程',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:process:view',
    sort: 1,
    status: 1
  },
  {
    id: 232,
    parentId: 23,
    name: '编辑生产过程',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:process:update',
    sort: 2,
    status: 1
  },
  // 生产报工按钮权限
  {
    id: 241,
    parentId: 24,
    name: '查看生产报工',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:report:view',
    sort: 1,
    status: 1
  },
  {
    id: 242,
    parentId: 24,
    name: '创建生产报工',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:report:create',
    sort: 2,
    status: 1
  },
  {
    id: 243,
    parentId: 24,
    name: '编辑生产报工',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'production:report:update',
    sort: 3,
    status: 1
  },

  // 3. 基础数据
  {
    id: 3,
    parentId: 0,
    name: '基础数据',
    path: '/basedata',
    component: '',
    icon: 'icon-base',
    type: 0,
    permission: 'basedata',
    sort: 3,
    status: 1
  },
  {
    id: 31,
    parentId: 3,
    name: '物料管理',
    path: '/basedata/materials',
    component: 'baseData/Materials',
    icon: 'icon-material',
    type: 1,
    permission: 'basedata:materials',
    sort: 1,
    status: 1
  },
  {
    id: 32,
    parentId: 3,
    name: 'BOM管理',
    path: '/basedata/boms',
    component: 'baseData/Boms',
    icon: 'icon-bom',
    type: 1,
    permission: 'basedata:boms',
    sort: 2,
    status: 1
  },
  {
    id: 33,
    parentId: 3,
    name: '客户管理',
    path: '/basedata/customers',
    component: 'baseData/Customers',
    icon: 'icon-customer',
    type: 1,
    permission: 'basedata:customers',
    sort: 3,
    status: 1
  },
  {
    id: 34,
    parentId: 3,
    name: '供应商管理',
    path: '/basedata/suppliers',
    component: 'baseData/Suppliers',
    icon: 'icon-supplier',
    type: 1,
    permission: 'basedata:suppliers',
    sort: 4,
    status: 1
  },
  {
    id: 35,
    parentId: 3,
    name: '产品大类',
    path: '/basedata/categories',
    component: 'baseData/Categories',
    icon: 'icon-category',
    type: 1,
    permission: 'basedata:categories',
    sort: 5,
    status: 1
  },
  {
    id: 36,
    parentId: 3,
    name: '单位管理',
    path: '/basedata/units',
    component: 'baseData/Units',
    icon: 'icon-unit',
    type: 1,
    permission: 'basedata:units',
    sort: 6,
    status: 1
  },
  {
    id: 37,
    parentId: 3,
    name: '库位管理',
    path: '/basedata/locations',
    component: 'baseData/Locations',
    icon: 'icon-location',
    type: 1,
    permission: 'basedata:locations',
    sort: 7,
    status: 1
  },
  {
    id: 38,
    parentId: 3,
    name: '工序模板',
    path: '/basedata/process-templates',
    component: 'baseData/ProcessTemplates',
    icon: 'icon-set-up',
    type: 1,
    permission: 'basedata:process-templates',
    sort: 8,
    status: 1
  },
  {
    id: 310,
    parentId: 3,
    name: '物料类型',
    path: '/basedata/product-categories',
    component: 'baseData/ProductCategories',
    icon: 'icon-category',
    type: 1,
    permission: 'basedata:product-categories',
    sort: 9,
    status: 1
  },
  {
    id: 311,
    parentId: 3,
    name: '工程变更(ECN)',
    path: '/basedata/ecn',
    component: 'baseData/ECNManagement',
    icon: 'icon-edit',
    type: 1,
    permission: 'basedata:bom',
    sort: 10,
    status: 1
  },

  // 4. 库存管理
  {
    id: 4,
    parentId: 0,
    name: '库存管理',
    path: '/inventory',
    component: '',
    icon: 'icon-inventory',
    type: 0,
    permission: 'inventory',
    sort: 4,
    status: 1
  },
  {
    id: 41,
    parentId: 4,
    name: '库存查询',
    path: '/inventory/stock',
    component: 'inventory/InventoryStock',
    icon: 'icon-stock',
    type: 1,
    permission: 'inventory:stock',
    sort: 1,
    status: 1
  },
  {
    id: 42,
    parentId: 4,
    name: '入库管理',
    path: '/inventory/inbound',
    component: 'inventory/InventoryInbound',
    icon: 'icon-plus',
    type: 1,
    permission: 'inventory:inbound',
    sort: 2,
    status: 1
  },
  {
    id: 43,
    parentId: 4,
    name: '出库管理',
    path: '/inventory/outbound',
    component: 'inventory/InventoryOutbound',
    icon: 'icon-minus',
    type: 1,
    permission: 'inventory:outbound',
    sort: 3,
    status: 1
  },
  {
    id: 431,
    parentId: 4,
    name: '手工出入',
    path: '/inventory/manual-transaction',
    component: 'inventory/ManualTransaction',
    icon: 'icon-edit',
    type: 1,
    permission: 'inventory:manual-transaction',
    sort: 4,
    status: 1
  },
  {
    id: 44,
    parentId: 4,
    name: '库存调拨',
    path: '/inventory/transfer',
    component: 'inventory/InventoryTransfer',
    icon: 'icon-right',
    type: 1,
    permission: 'inventory:transfer',
    sort: 5,
    status: 1
  },
  {
    id: 45,
    parentId: 4,
    name: '库存盘点',
    path: '/inventory/check',
    component: 'inventory/InventoryCheck',
    icon: 'icon-check',
    type: 1,
    permission: 'inventory:check',
    sort: 6,
    status: 1
  },
  {
    id: 46,
    parentId: 4,
    name: '库存报表',
    path: '/inventory/report',
    component: 'inventory/InventoryReport',
    icon: 'icon-chart',
    type: 1,
    permission: 'inventory:report',
    sort: 7,
    status: 1
  },
  {
    id: 47,
    parentId: 4,
    name: '流水报表',
    path: '/inventory/transaction',
    component: 'inventory/InventoryTransaction',
    icon: 'icon-list',
    type: 1,
    permission: 'inventory:transaction',
    sort: 8,
    status: 1
  },

  // 5. 采购管理
  {
    id: 5,
    parentId: 0,
    name: '采购管理',
    path: '/purchase',
    component: '',
    icon: 'icon-shopping-bag',
    type: 0,
    permission: 'purchase',
    sort: 5,
    status: 1
  },
  {
    id: 51,
    parentId: 5,
    name: '采购申请',
    path: '/purchase/requisitions',
    component: 'purchase/PurchaseRequisitions',
    icon: 'icon-document',
    type: 1,
    permission: 'purchase:requisitions',
    sort: 1,
    status: 1
  },
  {
    id: 52,
    parentId: 5,
    name: '采购订单',
    path: '/purchase/orders',
    component: 'purchase/PurchaseOrders',
    icon: 'icon-wallet',
    type: 1,
    permission: 'purchase:orders',
    sort: 2,
    status: 1
  },
  {
    id: 53,
    parentId: 5,
    name: '采购入库',
    path: '/purchase/receipts',
    component: 'purchase/PurchaseReceipts',
    icon: 'icon-goods',
    type: 1,
    permission: 'purchase:receipts',
    sort: 3,
    status: 1
  },
  {
    id: 54,
    parentId: 5,
    name: '采购退货',
    path: '/purchase/returns',
    component: 'purchase/PurchaseReturns',
    icon: 'icon-return',
    type: 1,
    permission: 'purchase:returns',
    sort: 4,
    status: 1
  },
  {
    id: 55,
    parentId: 5,
    name: '外委加工',
    path: '/purchase/processing',
    component: 'purchase/OutsourcedProcessing',
    icon: 'icon-set-up',
    type: 1,
    permission: 'purchase:processing',
    sort: 5,
    status: 1
  },
  {
    id: 56,
    parentId: 5,
    name: '加工入库',
    path: '/purchase/processing-receipts',
    component: 'purchase/OutsourcedReceipts',
    icon: 'icon-goods',
    type: 1,
    permission: 'purchase:processing-receipts',
    sort: 6,
    status: 1
  },

  // 6. 销售管理
  {
    id: 6,
    parentId: 0,
    name: '销售管理',
    path: '/sales',
    component: '',
    icon: 'icon-sales',
    type: 0,
    permission: 'sales',
    sort: 6,
    status: 1
  },
  {
    id: 61,
    parentId: 6,
    name: '销售订单',
    path: '/sales/orders',
    component: 'sales/SalesOrders',
    icon: 'icon-order',
    type: 1,
    permission: 'sales:orders',
    sort: 1,
    status: 1
  },
  {
    id: 62,
    parentId: 6,
    name: '销售出库',
    path: '/sales/outbound',
    component: 'sales/SalesOutbound',
    icon: 'icon-outbound',
    type: 1,
    permission: 'sales:outbound',
    sort: 2,
    status: 1
  },
  {
    id: 63,
    parentId: 6,
    name: '销售退货',
    path: '/sales/returns',
    component: 'sales/SalesReturns',
    icon: 'icon-return',
    type: 1,
    permission: 'sales:returns',
    sort: 3,
    status: 1
  },
  {
    id: 64,
    parentId: 6,
    name: '销售换货',
    path: '/sales/exchanges',
    component: 'sales/SalesExchanges',
    icon: 'icon-exchange',
    type: 1,
    permission: 'sales:exchanges',
    sort: 4,
    status: 1
  },
  {
    id: 65,
    parentId: 6,
    name: '报价单统计',
    path: '/sales/quotations',
    component: 'sales/SalesQuotations',
    icon: 'icon-quotation',
    type: 1,
    permission: 'sales:quotations',
    sort: 5,
    status: 1
  },
  {
    id: 66,
    parentId: 6,
    name: '装箱单',
    path: '/sales/packing-lists',
    component: 'sales/PackingLists',
    icon: 'icon-box',
    type: 1,
    permission: 'sales:packing-lists',
    sort: 6,
    status: 1
  },
  {
    id: 67,
    parentId: 6,
    name: '发货统计',
    path: '/sales/delivery-stats',
    component: 'sales/DeliveryStats',
    icon: 'icon-data-analysis',
    type: 1,
    permission: 'sales:delivery-stats',
    sort: 7,
    status: 1
  },
  {
    id: 68,
    parentId: 6,
    name: '合同管理',
    path: '/sales/contracts',
    component: 'sales/ContractManagement',
    icon: 'icon-document-copy',
    type: 1,
    permission: 'contract:view',
    sort: 8,
    status: 1
  },

  // 7. 财务管理
  {
    id: 7,
    parentId: 0,
    name: '财务管理',
    path: '/finance',
    component: '',
    icon: 'icon-money',
    type: 0,
    permission: 'finance',
    sort: 7,
    status: 1
  },
  // 总账管理
  {
    id: 71,
    parentId: 7,
    name: '会计科目',
    path: '/finance/gl/accounts',
    component: 'finance/gl/Accounts',
    icon: 'icon-account',
    type: 1,
    permission: 'finance:gl:accounts',
    sort: 1,
    status: 1
  },
  {
    id: 72,
    parentId: 7,
    name: '会计凭证',
    path: '/finance/gl/entries',
    component: '',
    icon: 'icon-document',
    type: 0, // 目录
    permission: 'finance:gl:entries',
    sort: 2,
    status: 1
  },
  // 凭证子菜单
  {
    id: 721,
    parentId: 72,
    name: '凭证列表',
    path: '/finance/gl/entries',
    component: 'finance/gl/Entries',
    icon: 'icon-list',
    type: 1,
    permission: 'finance:gl:entries',
    sort: 1,
    status: 1
  },
  {
    id: 722,
    parentId: 72,
    name: '收款凭证',
    path: '/finance/gl/entries/receipt',
    component: 'finance/gl/entries/ReceiptEntry',
    icon: 'icon-download',
    type: 1,
    permission: 'finance:gl:entries',
    sort: 2,
    status: 1
  },
  {
    id: 723,
    parentId: 72,
    name: '付款凭证',
    path: '/finance/gl/entries/payment',
    component: 'finance/gl/entries/PaymentEntry',
    icon: 'icon-upload',
    type: 1,
    permission: 'finance:gl:entries',
    sort: 3,
    status: 1
  },
  {
    id: 724,
    parentId: 72,
    name: '转账凭证',
    path: '/finance/gl/entries/transfer',
    component: 'finance/gl/entries/TransferEntry',
    icon: 'icon-right',
    type: 1,
    permission: 'finance:gl:entries',
    sort: 4,
    status: 1
  },
  {
    id: 725,
    parentId: 72,
    name: '记账凭证',
    path: '/finance/gl/entries/general',
    component: 'finance/gl/entries/GeneralEntry',
    icon: 'icon-edit-outline',
    type: 1,
    permission: 'finance:gl:entries',
    sort: 5,
    status: 1
  },
  {
    id: 73,
    parentId: 7,
    name: '会计期间',
    path: '/finance/gl/periods',
    component: 'finance/gl/Periods',
    icon: 'icon-calendar',
    type: 1,
    permission: 'finance:gl:periods',
    sort: 3,
    status: 1
  },
  {
    id: 731,
    parentId: 7,
    name: '试算平衡表',
    path: '/finance/gl/trial-balance',
    component: 'finance/gl/TrialBalance',
    icon: 'icon-data-analysis',
    type: 1,
    permission: 'finance:gl:view',
    sort: 31,
    status: 1
  },
  {
    id: 732,
    parentId: 7,
    name: '期间结账',
    path: '/finance/gl/period-closing',
    component: 'finance/gl/PeriodClosing',
    icon: 'icon-check',
    type: 1,
    permission: 'finance:gl:closing',
    sort: 32,
    status: 1
  },
  // 应收账款
  {
    id: 74,
    parentId: 7,
    name: '销售发票',
    path: '/finance/ar/invoices',
    component: 'finance/ar/Invoices',
    icon: 'icon-tickets',
    type: 1,
    permission: 'finance:ar:invoices',
    sort: 4,
    status: 1
  },
  {
    id: 75,
    parentId: 7,
    name: '收款记录',
    path: '/finance/ar/receipts',
    component: 'finance/ar/Receipts',
    icon: 'icon-money',
    type: 1,
    permission: 'finance:ar:receipts',
    sort: 5,
    status: 1
  },
  {
    id: 76,
    parentId: 7,
    name: '应收账龄',
    path: '/finance/ar/aging',
    component: 'finance/ar/Aging',
    icon: 'icon-data-analysis',
    type: 1,
    permission: 'finance:ar:aging',
    sort: 6,
    status: 1
  },
  // 应付账款
  {
    id: 77,
    parentId: 7,
    name: '采购发票',
    path: '/finance/ap/invoices',
    component: 'finance/ap/Invoices',
    icon: 'icon-document',
    type: 1,
    permission: 'finance:ap:invoices',
    sort: 7,
    status: 1
  },
  {
    id: 78,
    parentId: 7,
    name: '付款记录',
    path: '/finance/ap/payments',
    component: 'finance/ap/Payments',
    icon: 'icon-money',
    type: 1,
    permission: 'finance:ap:payments',
    sort: 8,
    status: 1
  },
  {
    id: 79,
    parentId: 7,
    name: '应付账龄',
    path: '/finance/ap/aging',
    component: 'finance/ap/Aging',
    icon: 'icon-data-analysis',
    type: 1,
    permission: 'finance:ap:aging',
    sort: 9,
    status: 1
  },
  // 固定资产
  {
    id: 710,
    parentId: 7,
    name: '固定资产',
    path: '/finance/assets/list',
    component: 'finance/assets/AssetsList',
    icon: 'icon-goods',
    type: 1,
    permission: 'finance:assets:list',
    sort: 10,
    status: 1
  },
  {
    id: 711,
    parentId: 7,
    name: '资产类别',
    path: '/finance/assets/categories',
    component: 'finance/assets/AssetCategoryList',
    icon: 'icon-folder',
    type: 1,
    permission: 'finance:assets:categories',
    sort: 11,
    status: 1
  },
  {
    id: 712,
    parentId: 7,
    name: '产品定价',
    path: '/finance/pricing',
    component: 'finance/pricing/ProductPricing',
    icon: 'icon-money',
    type: 1,
    permission: 'finance:pricing',
    sort: 14,
    status: 1
  },
  {
    id: 712,
    parentId: 7,
    name: '折旧管理',
    path: '/finance/assets/depreciation',
    component: 'finance/assets/Depreciation',
    icon: 'icon-calendar',
    type: 1,
    permission: 'finance:assets:depreciation',
    sort: 12,
    status: 1
  },
  // 出纳管理
  {
    id: 720,
    parentId: 7,
    name: '出纳管理',
    path: '/finance/cashier',
    component: '',
    icon: 'icon-wallet',
    type: 0,
    permission: 'finance:cashier',
    sort: 13,
    status: 1
  },
  {
    id: 721,
    parentId: 720,
    name: '银行账户',
    path: '/finance/cash/accounts',
    component: 'finance/cash/BankAccounts',
    icon: 'icon-wallet',
    type: 1,
    permission: 'finance:cash:accounts',
    sort: 1,
    status: 1
  },
  {
    id: 722,
    parentId: 720,
    name: '银行交易',
    path: '/finance/cash/bank-transactions',
    component: 'finance/cash/Transactions',
    icon: 'icon-right',
    type: 1,
    permission: 'finance:cash:bank-transactions',
    sort: 2,
    status: 1
  },
  {
    id: 723,
    parentId: 720,
    name: '现金交易',
    path: '/finance/cash/cash-transactions',
    component: 'finance/cash/CashTransactions',
    icon: 'icon-money',
    type: 1,
    permission: 'finance:cash:cash-transactions',
    sort: 3,
    status: 1
  },
  {
    id: 724,
    parentId: 720,
    name: '银行对账',
    path: '/finance/cash/reconciliation',
    component: 'finance/cash/Reconciliation',
    icon: 'icon-check',
    type: 1,
    permission: 'finance:cash:reconciliation',
    sort: 4,
    status: 1
  },
  {
    id: 725,
    parentId: 720,
    name: '出纳报表',
    path: '/finance/reports/cash-flow',
    component: 'finance/reports/CashFlow',
    icon: 'icon-document',
    type: 1,
    permission: 'finance:reports:cash-flow',
    sort: 5,
    status: 1
  },
  // 财务报表
  {
    id: 716,
    parentId: 7,
    name: '资产负债表',
    path: '/finance/reports/balance-sheet',
    component: 'finance/reports/BalanceSheet',
    icon: 'icon-document',
    type: 1,
    permission: 'finance:reports:balance-sheet',
    sort: 14,
    status: 1
  },
  {
    id: 717,
    parentId: 7,
    name: '利润表',
    path: '/finance/reports/income-statement',
    component: 'finance/reports/IncomeStatement',
    icon: 'icon-data-analysis',
    type: 1,
    permission: 'finance:reports:income-statement',
    sort: 15,
    status: 1
  },
  {
    id: 718,
    parentId: 7,
    name: '现金流量表',
    path: '/finance/reports/standard-cash-flow',
    component: 'finance/reports/StandardCashFlow',
    icon: 'icon-data-line',
    type: 1,
    permission: 'finance:reports:cash-flow',
    sort: 16,
    status: 1
  },
  // 财务自动化
  {
    id: 719,
    parentId: 7,
    name: '财务自动化',
    path: '/finance/automation',
    component: 'finance/automation/FinanceAutomation',
    icon: 'icon-robot',
    type: 1,
    permission: 'finance:automation:manage',
    sort: 16,
    status: 1
  },
  {
    id: 7191,
    parentId: 7,
    name: '汇率维护',
    path: '/finance/settings/exchange-rates',
    component: 'finance/settings/ExchangeRates',
    icon: 'icon-coin',
    type: 1,
    permission: 'finance:settings',
    sort: 161,
    status: 1
  },
  // 税务管理
  {
    id: 730,
    parentId: 7,
    name: '税务管理',
    path: '/finance/tax',
    component: '',
    icon: 'icon-document',
    type: 0,
    permission: 'finance:tax',
    sort: 17,
    status: 1
  },
  {
    id: 731,
    parentId: 730,
    name: '税务发票',
    path: '/finance/tax/invoices',
    component: 'finance/tax/TaxInvoices',
    icon: 'icon-tickets',
    type: 1,
    permission: 'finance:tax:invoices',
    sort: 1,
    status: 1
  },
  {
    id: 732,
    parentId: 730,
    name: '税务申报',
    path: '/finance/tax/returns',
    component: 'finance/tax/TaxReturns',
    icon: 'icon-document',
    type: 1,
    permission: 'finance:tax:returns',
    sort: 2,
    status: 1
  },
  {
    id: 733,
    parentId: 730,
    name: '税务科目配置',
    path: '/finance/tax/config',
    component: 'finance/tax/TaxAccountConfig',
    icon: 'icon-setting',
    type: 1,
    permission: 'finance:tax:config',
    sort: 3,
    status: 1
  },
  // 预算管理
  {
    id: 740,
    parentId: 7,
    name: '预算管理',
    path: '/finance/budget',
    component: '',
    icon: 'icon-data-analysis',
    type: 0,
    permission: 'finance:budget',
    sort: 18,
    status: 1
  },
  {
    id: 741,
    parentId: 740,
    name: '预算列表',
    path: '/finance/budget/list',
    component: 'finance/budget/BudgetList',
    icon: 'icon-document',
    type: 1,
    permission: 'finance:budget:list',
    sort: 1,
    status: 1
  },
  {
    id: 742,
    parentId: 740,
    name: '新增预算',
    path: '/finance/budget/edit',
    component: 'finance/budget/BudgetEdit',
    icon: 'icon-edit',
    type: 1,
    permission: 'finance:budget:edit',
    sort: 2,
    status: 1
  },
  {
    id: 743,
    parentId: 740,
    name: '预算执行分析',
    path: '/finance/budget/execution',
    component: 'finance/budget/BudgetExecution',
    icon: 'icon-data-analysis',
    type: 1,
    permission: 'finance:budget:execution',
    sort: 3,
    status: 1
  },
  {
    id: 744,
    parentId: 740,
    name: 'AI预算建议',
    path: '/finance/budget/ai',
    component: 'finance/budget/BudgetAI',
    icon: 'icon-cpu',
    type: 1,
    permission: 'finance:budget:analysis',
    sort: 4,
    status: 1
  },

  // 成本管理
  {
    id: 750,
    parentId: 7,
    name: '成本管理',
    path: '/finance/cost',
    component: '',
    icon: 'icon-data-line',
    type: 0,
    permission: 'finance:cost',
    sort: 19,
    status: 1
  },
  {
    id: 751,
    parentId: 750,
    name: '成本驾驶舱',
    path: '/finance/cost/dashboard',
    component: 'finance/cost/CostDashboard',
    icon: 'icon-data-board',
    type: 1,
    permission: 'finance:cost:view',
    sort: 1,
    status: 1
  },
  {
    id: 753,
    parentId: 750,
    name: '标准成本',
    path: '/finance/cost/standard',
    component: 'finance/cost/StandardCost',
    icon: 'icon-document',
    type: 1,
    permission: 'finance:cost:standard',
    sort: 3,
    status: 1
  },
  {
    id: 754,
    parentId: 750,
    name: '实际成本',
    path: '/finance/cost/actual',
    component: 'finance/cost/ActualCost',
    icon: 'icon-money',
    type: 1,
    permission: 'finance:cost:actual',
    sort: 4,
    status: 1
  },
  {
    id: 755,
    parentId: 750,
    name: '成本差异',
    path: '/finance/cost/variance',
    component: 'finance/cost/CostVariance',
    icon: 'icon-data-analysis',
    type: 1,
    permission: 'finance:cost:variance',
    sort: 5,
    status: 1
  },
  {
    id: 756,
    parentId: 750,
    name: '成本设置',
    path: '/finance/cost/settings',
    component: 'finance/cost/CostSettings',
    icon: 'icon-setting',
    type: 1,
    permission: 'finance:cost:settings',
    sort: 6,
    status: 1
  },
  {
    id: 7561,
    parentId: 750,
    name: '成本中心',
    path: '/finance/cost/center',
    component: 'finance/cost/CostCenter',
    icon: 'icon-office-building',
    type: 1,
    permission: 'finance:cost:settings',
    sort: 7,
    status: 1
  },
  {
    id: 7562,
    parentId: 750,
    name: '成本明细账',
    path: '/finance/cost/ledger',
    component: 'finance/cost/CostLedger',
    icon: 'icon-document',
    type: 1,
    permission: 'finance:cost:view',
    sort: 8,
    status: 1
  },
  {
    id: 757,
    parentId: 750,
    name: '盈利分析',
    path: '/finance/cost/profitability',
    component: 'finance/cost/ProfitabilityAnalysis',
    icon: 'icon-trend-charts',
    type: 1,
    permission: 'finance:cost:view',
    sort: 9,
    status: 1
  },
  {
    id: 758,
    parentId: 750,
    name: '作业成本法',
    path: '/finance/cost/abc',
    component: 'finance/cost/ActivityBasedCosting',
    icon: 'icon-data-analysis',
    type: 1,
    permission: 'finance:cost:view',
    sort: 10,
    status: 1
  },

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
    component: 'quality/components/FullChainTraceability',
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


  // 9. 系统管理
  {
    id: 9,
    parentId: 0,
    name: '系统管理',
    path: '/system',
    component: '',
    icon: 'icon-setting',
    type: 0,
    permission: 'system',
    sort: 9,
    status: 1
  },
  {
    id: 91,
    parentId: 9,
    name: '用户管理',
    path: '/system/users',
    component: 'system/Users',
    icon: 'icon-user',
    type: 1,
    permission: 'system:users',
    sort: 1,
    status: 1
  },
  {
    id: 92,
    parentId: 9,
    name: '部门管理',
    path: '/system/departments',
    component: 'system/Departments',
    icon: 'icon-office-building',
    type: 1,
    permission: 'system:departments',
    sort: 2,
    status: 1
  },
  {
    id: 93,
    parentId: 9,
    name: '权限设置',
    path: '/system/permissions',
    component: 'system/Permissions',
    icon: 'icon-lock',
    type: 1,
    permission: 'system:permissions',
    sort: 3,
    status: 1
  },
  {
    id: 94,
    parentId: 9,
    name: '技术通讯',
    path: '/system/technical-communication',
    component: 'system/TechnicalCommunication',
    icon: 'icon-document',
    type: 1,
    permission: 'system:tech-comm',
    sort: 4,
    status: 1
  },
  {
    id: 95,
    parentId: 9,
    name: '打印设置',
    path: '/system/print',
    component: 'system/PrintSettings',
    icon: 'icon-printer',
    type: 1,
    permission: 'system:print',
    sort: 5,
    status: 1
  },
  {
    id: 96,
    parentId: 9,
    name: '通知中心',
    path: '/system/notifications',
    component: 'system/Notifications',
    icon: 'icon-bell',
    type: 1,
    permission: 'system:notifications',
    sort: 6,
    status: 1
  },
  {
    id: 97,
    parentId: 9,
    name: '业务类型',
    path: '/system/business-types',
    component: 'system/BusinessTypes',
    icon: 'icon-folder',
    type: 1,
    permission: 'system:business-types',
    sort: 7,
    status: 1
  },
  {
    id: 98,
    parentId: 9,
    name: '审批工作流',
    path: '/system/workflow',
    component: 'system/WorkflowManagement',
    icon: 'icon-connection',
    type: 1,
    permission: 'system:workflow',
    sort: 8,
    status: 1
  },
  {
    id: 99,
    parentId: 9,
    name: '编码规则',
    path: '/system/coding-rules',
    component: 'system/CodingRules',
    icon: 'icon-stamp',
    type: 1,
    permission: 'system:settings',
    sort: 9,
    status: 1
  },
  {
    id: 910,
    parentId: 9,
    name: '文档管理',
    path: '/system/documents',
    component: 'system/DocumentManagement',
    icon: 'icon-files',
    type: 1,
    permission: 'system:documents',
    sort: 10,
    status: 1
  },
  {
    id: 911,
    parentId: 9,
    name: '业务告警',
    path: '/system/business-alerts',
    component: 'system/BusinessAlerts',
    icon: 'icon-warning',
    type: 1,
    permission: 'system:settings',
    sort: 11,
    status: 1
  },

  // 10. 数据概览
  {
    id: 10,
    parentId: 0,
    name: '数据概览',
    path: '/dataOverview',
    component: '',
    icon: 'icon-data-board',
    type: 0,
    permission: 'dataOverview',
    sort: 10,
    status: 1
  },
  {
    id: 101,
    parentId: 10,
    name: '生产看板',
    path: '/dataOverview/production',
    component: 'dataOverview/ProductionDashboard',
    icon: 'icon-data-line',
    type: 1,
    permission: 'dataOverview:production',
    sort: 1,
    status: 1
  },
  {
    id: 102,
    parentId: 10,
    name: '库存看板',
    path: '/dataOverview/inventory',
    component: 'dataOverview/InventoryDashboard',
    icon: 'icon-goods',
    type: 1,
    permission: 'dataOverview:inventory',
    sort: 2,
    status: 1
  },
  {
    id: 103,
    parentId: 10,
    name: '销售看板',
    path: '/dataOverview/sales',
    component: 'dataOverview/SalesDashboard',
    icon: 'icon-shopping-cart',
    type: 1,
    permission: 'dataOverview:sales',
    sort: 3,
    status: 1
  },
  {
    id: 104,
    parentId: 10,
    name: '财务看板',
    path: '/dataOverview/finance',
    component: 'dataOverview/FinanceDashboard',
    icon: 'icon-money',
    type: 1,
    permission: 'dataOverview:finance',
    sort: 4,
    status: 1
  },
  {
    id: 105,
    parentId: 10,
    name: '质量看板',
    path: '/dataOverview/quality',
    component: 'dataOverview/QualityDashboard',
    icon: 'icon-check',
    type: 1,
    permission: 'dataOverview:quality',
    sort: 5,
    status: 1
  },
  {
    id: 106,
    parentId: 10,
    name: '采购看板',
    path: '/dataOverview/purchase',
    component: 'dataOverview/PurchaseDashboard',
    icon: 'icon-shopping-bag',
    type: 1,
    permission: 'dataOverview:purchase',
    sort: 6,
    status: 1
  },

  // 11. 设备管理
  {
    id: 11,
    parentId: 0,
    name: '设备管理',
    path: '/equipment',
    component: '',
    icon: 'icon-cpu',
    type: 0,
    permission: 'equipment',
    sort: 11,
    status: 1
  },
  {
    id: 111,
    parentId: 11,
    name: '设备台账',
    path: '/equipment/list',
    component: 'equipment/EquipmentList',
    icon: 'icon-list',
    type: 1,
    permission: 'equipment:list',
    sort: 1,
    status: 1
  },
  {
    id: 112,
    parentId: 11,
    name: '设备维护',
    path: '/equipment/maintenance',
    component: 'equipment/EquipmentMaintenance',
    icon: 'icon-tools',
    type: 1,
    permission: 'equipment:maintenance',
    sort: 2,
    status: 1
  },
  {
    id: 113,
    parentId: 11,
    name: '设备检修',
    path: '/equipment/inspection',
    component: 'equipment/EquipmentInspection',
    icon: 'icon-search',
    type: 1,
    permission: 'equipment:inspection',
    sort: 3,
    status: 1
  },
  {
    id: 114,
    parentId: 11,
    name: '设备状态',
    path: '/equipment/status',
    component: 'equipment/EquipmentStatus',
    icon: 'icon-monitor',
    type: 1,
    permission: 'equipment:status',
    sort: 4,
    status: 1
  },

  // 12. 人力资源
  {
    id: 12,
    parentId: 0,
    name: '人力资源',
    path: '/hr',
    component: '',
    icon: 'icon-user-filled',
    type: 0,
    permission: 'hr',
    sort: 12,
    status: 1
  },
  {
    id: 121,
    parentId: 12,
    name: '员工管理',
    path: '/hr/employees',
    component: 'hr/Employees',
    icon: 'icon-user',
    type: 1,
    permission: 'hr:employees',
    sort: 1,
    status: 1
  },
  {
    id: 122,
    parentId: 12,
    name: '考勤管理',
    path: '/hr/attendance',
    component: 'hr/Attendance',
    icon: 'icon-calendar',
    type: 1,
    permission: 'hr:attendance',
    sort: 2,
    status: 1
  },
  {
    id: 123,
    parentId: 12,
    name: '薪资管理',
    path: '/hr/salary',
    component: 'hr/Salary',
    icon: 'icon-money',
    type: 1,
    permission: 'hr:salary',
    sort: 3,
    status: 1
  },
  {
    id: 124,
    parentId: 12,
    name: '绩效考核',
    path: '/hr/performance',
    component: 'hr/Performance',
    icon: 'icon-trophy',
    type: 1,
    permission: 'hr:performance',
    sort: 4,
    status: 1
  }
];

/**
 * 将平铺的菜单列表转换为树形结构
 */
export function buildMenuTree(menus = menuPermissions) {
  const menuMap = {};
  menus.forEach(menu => {
    menuMap[menu.id] = { ...menu, children: [] };
  });

  const tree = [];
  menus.forEach(menu => {
    const id = menu.id;
    const parentId = menu.parentId;

    if (parentId === 0) {
      tree.push(menuMap[id]);
    } else {
      if (menuMap[parentId]) {
        menuMap[parentId].children.push(menuMap[id]);
      }
    }
  });

  return tree;
}

/**
 * 导出SQL格式的菜单数据，用于数据库初始化
 */
export function generateMenuSQL() {
  let sql = 'INSERT INTO menus (id, parent_id, name, path, component, icon, permission, type, visible, status, sort_order, created_at, updated_at) VALUES\n';

  const values = menuPermissions.map(menu => {
    return `(${menu.id}, ${menu.parentId}, '${menu.name}', '${menu.path}', '${menu.component}', '${menu.icon}', '${menu.permission}', ${menu.type}, 1, ${menu.status}, ${menu.sort}, NOW(), NOW())`;
  }).join(',\n');

  sql += values + ';';
  return sql;
}

export default menuPermissions; 