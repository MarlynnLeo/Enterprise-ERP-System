/**
 * index.js
 * @description 应用程序入口文件
 * @date 2025-08-27
 * @version 1.0.0
 */

import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: {
      title: '登录',
      allowGuest: true
    }
  },
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/Home.vue'),
    meta: { title: '首页', allowGuest: true }
  },
  // 仪表盘
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/common/GenericListView.vue'),
    meta: {
      title: '仪表盘',
      api: 'inventoryApi.getDashboard',
      config: {
        fields: { id: 'id', title: 'name', subtitle: 'code' }
      }
    }
  },
  // 生产管理
  {
    path: '/production',
    name: 'Production',
    component: () => import('@/views/production/Index.vue'),
    meta: { title: '生产管理' }
  },
  {
    path: '/production/plans',
    name: 'ProductionPlans',
    component: () => import('@/views/production/Plans.vue'),
    meta: { title: '生产计划' }
  },
  {
    path: '/production/plans/create',
    name: 'CreateProductionPlan',
    component: () => import('@/views/production/CreatePlan.vue'),
    meta: { title: '新建生产计划' }
  },
  {
    path: '/production/plans/:id',
    name: 'ProductionPlanDetail',
    component: () => import('@/views/production/PlanDetail.vue'),
    meta: { title: '生产计划详情' }
  },
  {
    path: '/production/tasks',
    name: 'ProductionTasks',
    component: () => import('@/views/production/Tasks.vue'),
    meta: { title: '生产任务' }
  },
  {
    path: '/production/tasks/:id',
    name: 'ProductionTaskDetail',
    component: () => import('@/views/production/TaskDetail.vue'),
    meta: { title: '生产任务详情' }
  },
  {
    path: '/production/tasks/create',
    name: 'CreateProductionTask',
    component: () => import('@/views/production/CreateTask.vue'),
    meta: { title: '新建生产任务' }
  },
  {
    path: '/production/report',
    name: 'ProductionReport',
    component: () => import('@/views/production/Report.vue'),
    meta: { title: '生产报工' }
  },
  {
    path: '/production/report/history',
    name: 'ProductionReportHistory',
    component: () => import('@/views/production/ReportHistory.vue'),
    meta: { title: '报工记录' }
  },
  {
    path: '/production/dashboard',
    name: 'ProductionDashboard',
    component: () => import('@/views/production/Dashboard.vue'),
    meta: { title: '生产看板' }
  },
  // 基础数据
  {
    path: '/baseData',
    name: 'BaseData',
    component: () => import('@/views/common/GenericListView.vue'),
    meta: {
      title: '基础数据',
      config: {
        fields: { id: 'id', title: 'name', subtitle: 'code' }
      }
    }
  },
  {
    path: '/baseData/materials',
    name: 'Materials',
    component: () => import('@/views/baseData/Materials.vue'),
    meta: { title: '物料管理' }
  },
  {
    path: '/baseData/materials/:id',
    name: 'MaterialDetail',
    component: () => import('@/views/baseData/MaterialDetail.vue'),
    meta: { title: '物料详情' }
  },
  {
    path: '/baseData/boms',
    name: 'BOMs',
    component: () => import('@/views/baseData/BOMs.vue'),
    meta: { title: 'BOM管理' }
  },
  {
    path: '/baseData/customers',
    name: 'Customers',
    component: () => import('@/views/baseData/Customers.vue'),
    meta: { title: '客户管理' }
  },
  {
    path: '/baseData/customers/:id',
    name: 'CustomerDetail',
    component: () => import('@/views/baseData/CustomerDetail.vue'),
    meta: { title: '客户详情' }
  },
  {
    path: '/baseData/suppliers',
    name: 'Suppliers',
    component: () => import('@/views/baseData/Suppliers.vue'),
    meta: { title: '供应商管理' }
  },
  {
    path: '/baseData/suppliers/:id',
    name: 'SupplierDetail',
    component: () => import('@/views/baseData/SupplierDetail.vue'),
    meta: { title: '供应商详情' }
  },
  {
    path: '/baseData/categories',
    name: 'Categories',
    component: () => import('@/views/common/GenericListView.vue'),
    meta: {
      title: '分类管理',
      api: 'baseDataApi.getCategories',
      config: {
        fields: { id: 'id', title: 'name', subtitle: 'code' }
      }
    }
  },
  {
    path: '/baseData/units',
    name: 'Units',
    component: () => import('@/views/common/GenericListView.vue'),
    meta: {
      title: '单位管理',
      api: 'baseDataApi.getUnits',
      config: {
        fields: { id: 'id', title: 'name', subtitle: 'code' }
      }
    }
  },
  {
    path: '/baseData/locations',
    name: 'Locations',
    component: () => import('@/views/baseData/Locations.vue'),
    meta: { title: '库位管理' }
  },
  {
    path: '/baseData/process-templates',
    name: 'ProcessTemplates',
    component: () => import('@/views/baseData/ProcessTemplates.vue'),
    meta: { title: '工序模板' }
  },
  // 库存管理
  {
    path: '/inventory',
    name: 'Inventory',
    component: () => import('@/views/inventory/Index.vue'),
    meta: { title: '库存管理' }
  },
  {
    path: '/inventory/stock',
    name: 'InventoryStock',
    component: () => import('@/views/inventory/Stock.vue'),
    meta: { title: '库存查询' }
  },
  {
    path: '/inventory/inbound',
    name: 'InventoryInbound',
    component: () => import('@/views/inventory/Inbound.vue'),
    meta: { title: '库存入库' }
  },
  {
    path: '/inventory/inbound/create',
    name: 'CreateInbound',
    component: () => import('@/views/inventory/CreateInbound.vue'),
    meta: { title: '新建入库单' }
  },
  {
    path: '/inventory/inbound/:id',
    component: () => import('@/views/inventory/InboundDetail.vue'),
    meta: { title: '入库详情' }
  },
  {
    path: '/inventory/outbound',
    name: 'InventoryOutbound',
    component: () => import('@/views/inventory/Outbound.vue'),
    meta: { title: '库存出库' }
  },
  {
    path: '/inventory/outbound/create',
    name: 'CreateOutbound',
    component: () => import('@/views/inventory/CreateOutbound.vue'),
    meta: { title: '新建出库单' }
  },
  {
    path: '/inventory/outbound/:id',
    name: 'InventoryOutboundDetail',
    component: () => import('@/views/inventory/OutboundDetail.vue'),
    meta: { title: '出库详情' }
  },
  {
    path: '/inventory/transfer',
    name: 'InventoryTransfer',
    component: () => import('@/views/inventory/Transfer.vue'),
    meta: { title: '库存调拨' }
  },
  {
    path: '/inventory/transfer/create',
    name: 'CreateTransfer',
    component: () => import('@/views/inventory/CreateTransfer.vue'),
    meta: { title: '新建调拨单' }
  },
  {
    path: '/inventory/transfer/:id',
    name: 'InventoryTransferDetail',
    component: () => import('@/views/inventory/TransferDetail.vue'),
    meta: { title: '调拨详情' }
  },
  {
    path: '/inventory/check',
    name: 'InventoryCheck',
    component: () => import('@/views/inventory/Check.vue'),
    meta: { title: '库存盘点' }
  },
  {
    path: '/inventory/check/new',
    name: 'NewCheck',
    component: () => import('@/views/inventory/NewCheck.vue'),
    meta: { title: '新建盘点单' }
  },
  {
    path: '/inventory/check/:id',
    name: 'CheckDetail',
    component: () => import('@/views/inventory/CheckDetail.vue'),
    meta: { title: '盘点单详情' }
  },
  {
    path: '/inventory/check/:id/edit',
    name: 'EditCheck',
    component: () => import('@/views/inventory/EditCheck.vue'),
    meta: { title: '编辑盘点单' }
  },
  {
    path: '/inventory/report',
    name: 'InventoryReport',
    component: () => import('@/views/inventory/Report.vue'),
    meta: { title: '库存报表' }
  },
  {
    path: '/inventory/transaction',
    name: 'InventoryTransaction',
    component: () => import('@/views/inventory/Transaction.vue'),
    meta: { title: '库存流水' }
  },
  // 采购管理
  {
    path: '/purchase',
    name: 'Purchase',
    component: () => import('@/views/purchase/Index.vue'),
    meta: { title: '采购管理' }
  },
  {
    path: '/purchase/dashboard',
    name: 'PurchaseDashboard',
    component: () => import('@/views/common/GenericListView.vue'),
    meta: {
      title: '采购概览',
      api: 'purchaseApi.getStatistics',
      config: {
        fields: { id: 'id', title: 'name', subtitle: 'code' }
      }
    }
  },
  {
    path: '/purchase/requisitions',
    name: 'PurchaseRequisitions',
    component: () => import('@/views/purchase/Requisitions.vue'),
    meta: { title: '采购申请' }
  },
  {
    path: '/purchase/requisitions/create',
    name: 'CreateRequisition',
    component: () => import('@/views/purchase/CreateRequisition.vue'),
    meta: { title: '新建采购申请' }
  },
  {
    path: '/purchase/requisitions/new',
    name: 'NewRequisition',
    component: () => import('@/views/purchase/CreateRequisition.vue'),
    meta: { title: '新建采购申请' }
  },
  {
    path: '/purchase/requisitions/:id',
    name: 'PurchaseRequisitionDetail',
    component: () => import('@/views/purchase/RequisitionDetail.vue'),
    meta: { title: '采购申请详情' }
  },
  {
    path: '/purchase/orders',
    name: 'PurchaseOrders',
    component: () => import('@/views/purchase/Orders.vue'),
    meta: { title: '采购订单' }
  },
  {
    path: '/purchase/orders/create',
    name: 'CreatePurchaseOrder',
    component: () => import('@/views/purchase/CreateOrder.vue'),
    meta: { title: '新建采购订单' }
  },
  {
    path: '/purchase/orders/:id',
    name: 'PurchaseOrderDetail',
    component: () => import('@/views/purchase/OrderDetail.vue'),
    meta: { title: '采购订单详情' }
  },
  {
    path: '/purchase/receipts',
    name: 'PurchaseReceipts',
    component: () => import('@/views/purchase/Receipts.vue'),
    meta: { title: '采购入库' }
  },
  {
    path: '/purchase/receipts/create',
    name: 'CreatePurchaseReceipt',
    component: () => import('@/views/purchase/CreateReceipt.vue'),
    meta: { title: '创建入库单' }
  },
  {
    path: '/purchase/receipts/:id',
    name: 'PurchaseReceiptDetail',
    component: () => import('@/views/purchase/ReceiptDetail.vue'),
    meta: { title: '采购入库详情' }
  },
  {
    path: '/purchase/returns',
    name: 'PurchaseReturns',
    component: () => import('@/views/purchase/Returns.vue'),
    meta: { title: '采购退货' }
  },
  {
    path: '/purchase/processing',
    name: 'PurchaseProcessing',
    component: () => import('@/views/common/GenericListView.vue'),
    meta: {
      title: '外委加工',
      api: 'purchaseApi.getProcessing',
      config: {
        fields: { id: 'id', title: 'name', subtitle: 'code' }
      }
    }
  },
  {
    path: '/purchase/processing-receipts',
    name: 'PurchaseProcessingReceipts',
    component: () => import('@/views/common/GenericListView.vue'),
    meta: {
      title: '外委入库',
      api: 'purchaseApi.getProcessingReceipts',
      config: {
        fields: { id: 'id', title: 'name', subtitle: 'code' }
      }
    }
  },
  // 销售管理
  {
    path: '/sales',
    name: 'Sales',
    component: () => import('@/views/sales/Index.vue'),
    meta: { title: '销售管理' }
  },
  {
    path: '/sales/orders',
    name: 'SalesOrders',
    component: () => import('@/views/sales/Orders.vue'),
    meta: { title: '销售订单' }
  },
  {
    path: '/sales/orders/new',
    name: 'CreateSalesOrder',
    component: () => import('@/views/sales/Orders.vue'),
    meta: { title: '新建销售订单' }
  },
  {
    path: '/sales/orders/:id',
    name: 'SalesOrderDetail',
    component: () => import('@/views/sales/OrderDetail.vue'),
    meta: { title: '销售订单详情' }
  },
  {
    path: '/sales/outbound',
    name: 'SalesOutbound',
    component: () => import('@/views/sales/Outbound.vue'),
    meta: { title: '销售出库' }
  },
  {
    path: '/sales/outbound/new',
    name: 'CreateSalesOutbound',
    component: () => import('@/views/sales/Outbound.vue'),
    meta: { title: '新建销售出库' }
  },
  {
    path: '/sales/outbound/:id',
    name: 'SalesOutboundDetail',
    component: () => import('@/views/sales/OutboundDetail.vue'),
    meta: { title: '销售出库详情' }
  },
  {
    path: '/sales/returns',
    name: 'SalesReturns',
    component: () => import('@/views/sales/Returns.vue'),
    meta: { title: '销售退货' }
  },
  {
    path: '/sales/returns/:id',
    name: 'SalesReturnDetail',
    component: () => import('@/views/sales/ReturnDetail.vue'),
    meta: { title: '销售退货详情' }
  },
  {
    path: '/sales/exchanges',
    name: 'SalesExchanges',
    component: () => import('@/views/sales/Exchanges.vue'),
    meta: { title: '销售换货' }
  },
  {
    path: '/sales/quotations',
    name: 'SalesQuotations',
    component: () => import('@/views/sales/Quotations.vue'),
    meta: { title: '报价管理' }
  },
  // 删除原来的销售自助相关路由
  // 财务管理
  {
    path: '/finance',
    name: 'Finance',
    component: () => import('@/views/finance/Index.vue'),
    meta: { title: '财务管理' }
  },
  {
    path: '/finance/gl/accounts',
    name: 'GLAccounts',
    component: () => import('@/views/finance/Accounts.vue'),
    meta: { title: '会计科目' }
  },
  {
    path: '/finance/gl/accounts/:id',
    name: 'GLAccountDetail',
    component: () => import('@/views/finance/AccountDetail.vue'),
    meta: { title: '科目详情' }
  },
  {
    path: '/finance/gl/entries',
    name: 'GLEntries',
    component: () => import('@/views/finance/Entries.vue'),
    meta: { title: '会计凭证' }
  },
  {
    path: '/finance/gl/entries/:id',
    name: 'GLEntryDetail',
    component: () => import('@/views/finance/EntryDetail.vue'),
    meta: { title: '凭证详情' }
  },
  {
    path: '/finance/gl/entries/create',
    name: 'GLEntryCreate',
    component: () => import('@/views/finance/Entries.vue'),
    meta: { title: '新建凭证' }
  },
  {
    path: '/finance/gl/periods',
    name: 'GLPeriods',
    component: () => import('@/views/finance/Periods.vue'),
    meta: { title: '会计期间' }
  },
  {
    path: '/finance/gl/periods/:id',
    name: 'GLPeriodDetail',
    component: () => import('@/views/finance/PeriodDetail.vue'),
    meta: { title: '期间详情' }
  },
  {
    path: '/finance/ar/invoices',
    name: 'ARInvoices',
    component: () => import('@/views/finance/ARInvoices.vue'),
    meta: { title: '应收账款' }
  },
  {
    path: '/finance/ar/invoices/:id',
    name: 'ARInvoiceDetail',
    component: () => import('@/views/finance/ARInvoiceDetail.vue'),
    meta: { title: '应收发票详情' }
  },
  {
    path: '/finance/ar/receipts',
    name: 'ARReceipts',
    component: () => import('@/views/finance/ARReceipts.vue'),
    meta: { title: '收款管理' }
  },
  {
    path: '/finance/ar/aging',
    name: 'ARAging',
    component: () => import('@/views/finance/ARAging.vue'),
    meta: { title: '应收账龄' }
  },
  {
    path: '/finance/ar/receipts/create',
    name: 'ARReceiptCreate',
    component: () => import('@/views/finance/ARReceipts.vue'),
    meta: { title: '收款登记' }
  },
  {
    path: '/finance/ar/receipts/:id',
    name: 'ARReceiptDetail',
    component: () => import('@/views/finance/ARReceiptDetail.vue'),
    meta: { title: '收款详情' }
  },
  {
    path: '/finance/ap/invoices',
    name: 'APInvoices',
    component: () => import('@/views/finance/APInvoices.vue'),
    meta: { title: '应付账款' }
  },
  {
    path: '/finance/ap/invoices/:id',
    name: 'APInvoiceDetail',
    component: () => import('@/views/finance/APInvoiceDetail.vue'),
    meta: { title: '应付发票详情' }
  },
  {
    path: '/finance/ap/payments',
    name: 'APPayments',
    component: () => import('@/views/finance/APPayments.vue'),
    meta: { title: '付款管理' }
  },
  {
    path: '/finance/ap/payments/create',
    name: 'APPaymentCreate',
    component: () => import('@/views/finance/APPayments.vue'),
    meta: { title: '付款登记' }
  },
  {
    path: '/finance/ap/payments/:id',
    name: 'APPaymentDetail',
    component: () => import('@/views/finance/APPaymentDetail.vue'),
    meta: { title: '付款详情' }
  },
  {
    path: '/finance/ap/aging',
    name: 'APAging',
    component: () => import('@/views/finance/APAging.vue'),
    meta: { title: '应付账龄' }
  },
  {
    path: '/finance/assets/list',
    name: 'AssetsList',
    component: () => import('@/views/finance/Assets.vue'),
    meta: { title: '固定资产' }
  },
  {
    path: '/finance/assets/categories',
    name: 'AssetsCategories',
    component: () => import('@/views/finance/Assets.vue'),
    meta: { title: '资产类别' }
  },
  {
    path: '/finance/assets/depreciation',
    name: 'AssetsDepreciation',
    component: () => import('@/views/finance/Assets.vue'),
    meta: { title: '折旧管理' }
  },
  {
    path: '/finance/assets/:id',
    name: 'AssetDetail',
    component: () => import('@/views/finance/AssetDetail.vue'),
    meta: { title: '资产详情' }
  },
  {
    path: '/finance/cash/accounts',
    name: 'CashAccounts',
    component: () => import('@/views/finance/CashAccounts.vue'),
    meta: { title: '银行账户' }
  },
  {
    path: '/finance/cash/accounts/:id',
    name: 'CashAccountDetail',
    component: () => import('@/views/finance/CashAccountDetail.vue'),
    meta: { title: '账户详情' }
  },
  {
    path: '/finance/cash/transactions',
    name: 'CashTransactionsOld',
    component: () => import('@/views/finance/BankTransactions.vue'),
    meta: { title: '银行交易' }
  },
  {
    path: '/finance/cash/bank-transactions',
    name: 'BankTransactions',
    component: () => import('@/views/finance/BankTransactions.vue'),
    meta: { title: '银行交易' }
  },
  {
    path: '/finance/cash/cash-transactions',
    name: 'CashTransactions',
    component: () => import('@/views/finance/CashTransactionsPage.vue'),
    meta: { title: '现金交易' }
  },
  {
    path: '/finance/cash/reconciliation',
    name: 'CashReconciliation',
    component: () => import('@/views/finance/Reconciliation.vue'),
    meta: { title: '银行对账' }
  },
  {
    path: '/finance/cash/transactions/create',
    name: 'CashTransactionCreate',
    component: () => import('@/views/finance/BankTransactions.vue'),
    meta: { title: '新建交易' }
  },
  {
    path: '/finance/reports/balance-sheet',
    name: 'BalanceSheet',
    component: () => import('@/views/finance/BalanceSheet.vue'),
    meta: { title: '资产负债表' }
  },
  {
    path: '/finance/reports/income-statement',
    name: 'IncomeStatement',
    component: () => import('@/views/finance/IncomeStatement.vue'),
    meta: { title: '利润表' }
  },
  {
    path: '/finance/reports/cash-flow',
    name: 'CashFlowStatement',
    component: () => import('@/views/finance/CashFlowReport.vue'),
    meta: { title: '出纳报表' }
  },
  // 质量管理
  {
    path: '/quality',
    name: 'Quality',
    component: () => import('@/views/quality/Index.vue'),
    meta: { title: '质量管理' }
  },
  {
    path: '/quality/incoming',
    name: 'QualityIncoming',
    component: () => import('@/views/quality/Incoming.vue'),
    meta: { title: '来料检验' }
  },
  {
    path: '/quality/incoming/create',
    name: 'CreateIncomingInspection',
    component: () => import('@/views/quality/CreateIncoming.vue'),
    meta: { title: '新建来料检验' }
  },
  {
    path: '/quality/incoming/:id',
    name: 'IncomingInspectionDetail',
    component: () => import('@/views/quality/IncomingDetail.vue'),
    meta: { title: '来料检验详情' }
  },
  {
    path: '/quality/incoming/:id/inspect',
    name: 'IncomingInspect',
    component: () => import('@/views/quality/IncomingDetail.vue'),
    meta: { title: '执行检验' }
  },
  {
    path: '/quality/process',
    name: 'QualityProcess',
    component: () => import('@/views/quality/Process.vue'),
    meta: { title: '过程检验' }
  },
  {
    path: '/quality/process/create',
    name: 'CreateProcessInspection',
    component: () => import('@/views/quality/CreateProcess.vue'),
    meta: { title: '新建过程检验' }
  },
  {
    path: '/quality/process/:id',
    name: 'ProcessInspectionDetail',
    component: () => import('@/views/quality/ProcessDetail.vue'),
    meta: { title: '过程检验详情' }
  },
  {
    path: '/quality/final',
    name: 'QualityFinal',
    component: () => import('@/views/quality/Final.vue'),
    meta: { title: '成品检验' }
  },
  {
    path: '/quality/final/create',
    name: 'CreateFinalInspection',
    component: () => import('@/views/quality/CreateFinal.vue'),
    meta: { title: '新建成品检验' }
  },
  {
    path: '/quality/final/:id',
    name: 'FinalInspectionDetail',
    component: () => import('@/views/quality/FinalDetail.vue'),
    meta: { title: '成品检验详情' }
  },
  {
    path: '/quality/templates',
    name: 'QualityTemplates',
    component: () => import('@/views/common/GenericListView.vue'),
    meta: {
      title: '检验模板',
      api: 'qualityApi.getInspectionTemplates',
      config: {
        fields: { id: 'id', title: 'name', subtitle: 'code' }
      }
    }
  },
  {
    path: '/quality/traceability',
    name: 'QualityTraceability',
    component: () => import('@/views/quality/Traceability.vue'),
    meta: { title: '追溯管理' }
  },
  {
    path: '/quality/traceability/detail',
    name: 'QualityTraceabilityDetail',
    component: () => import('@/views/quality/TraceabilityDetail.vue'),
    meta: { title: '追溯详情' }
  },

  // 扫码功能
  {
    path: '/scan',
    name: 'Scan',
    component: () => import('@/views/Scan.vue'),
    meta: { title: '扫码功能' }
  },

  // 全局搜索
  {
    path: '/search',
    name: 'GlobalSearch',
    component: () => import('@/views/GlobalSearch.vue'),
    meta: { title: '全局搜索' }
  },

  // 消息通知
  {
    path: '/notifications',
    name: 'Notifications',
    component: () => import('@/views/Notifications.vue'),
    meta: { title: '消息通知' }
  },
  {
    path: '/notifications/:id',
    name: 'NotificationDetail',
    component: () => import('@/views/common/GenericListView.vue'),
    meta: {
      title: '消息详情',
      api: 'systemApi.getLogs',
      config: {
        fields: { id: 'id', title: 'name', subtitle: 'code' }
      }
    }
  },

  // 系统管理
  {
    path: '/system',
    name: 'SystemIndex',
    component: () => import('@/views/system/Index.vue'),
    meta: { title: '系统管理' }
  },
  {
    path: '/system/users',
    name: 'SystemUsers',
    component: () => import('@/views/system/Users.vue'),
    meta: { title: '用户管理' }
  },
  {
    path: '/system/users/create',
    name: 'CreateUser',
    component: () => import('@/views/common/GenericListView.vue'),
    meta: {
      title: '创建用户',
      api: 'systemApi.getRoles',
      config: {
        fields: { id: 'id', title: 'name', subtitle: 'code' }
      }
    }
  },
  {
    path: '/system/users/:id',
    name: 'UserDetail',
    component: () => import('@/views/common/GenericListView.vue'),
    meta: {
      title: '用户详情',
      api: 'systemApi.getLogs',
      config: {
        fields: { id: 'id', title: 'name', subtitle: 'code' }
      }
    }
  },
  {
    path: '/system/departments',
    name: 'SystemDepartments',
    component: () => import('@/views/common/GenericListView.vue'),
    meta: {
      title: '部门管理',
      api: 'systemApi.getDepartments',
      config: {
        fields: { id: 'id', title: 'name', subtitle: 'code' }
      }
    }
  },
  {
    path: '/system/roles',
    name: 'SystemRoles',
    component: () => import('@/views/common/GenericListView.vue'),
    meta: {
      title: '角色管理',
      api: 'systemApi.getRoles',
      config: {
        fields: { id: 'id', title: 'name', subtitle: 'code' }
      }
    }
  },
  {
    path: '/system/permissions',
    name: 'SystemPermissions',
    component: () => import('@/views/common/GenericListView.vue'),
    meta: {
      title: '权限管理',
      api: 'systemApi.getPermissions',
      config: {
        fields: { id: 'id', title: 'name', subtitle: 'code' }
      }
    }
  },
  {
    path: '/system/config',
    name: 'SystemConfig',
    component: () => import('@/views/common/GenericListView.vue'),
    meta: {
      title: '系统配置',
      api: 'systemApi.getConfig',
      config: {
        fields: { id: 'id', title: 'name', subtitle: 'code' }
      }
    }
  },
  {
    path: '/system/logs',
    name: 'SystemLogs',
    component: () => import('@/views/common/GenericListView.vue'),
    meta: {
      title: '系统日志',
      api: 'systemApi.getLogs',
      config: {
        fields: { id: 'id', title: 'name', subtitle: 'code' }
      }
    }
  },

  {
    path: '/profile',
    name: 'Profile',
    component: () => import('@/views/Profile.vue'),
    meta: { title: '个人资料' }
  },
  {
    path: '/profile/edit',
    name: 'EditProfile',
    component: () => import('@/views/profile/EditProfile.vue'),
    meta: { title: '编辑资料' }
  },
  {
    path: '/profile/password',
    name: 'ChangePassword',
    component: () => import('@/views/profile/ChangePassword.vue'),
    meta: { title: '修改密码' }
  },
  {
    path: '/tasks',
    name: 'Tasks',
    component: () => import('@/views/production/Tasks.vue'),
    meta: { title: '任务列表' }
  },
  {
    path: '/tasks/:id',
    name: 'TaskDetail',
    component: () => import('@/views/production/TaskDetail.vue'),
    meta: { title: '任务详情' }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/Settings.vue'),
    meta: { title: '设置' }
  },
  // 测试页面 - 暂时移除，文件不存在
  // {
  //   path: '/test-home',
  //   name: 'TestHome',
  //   component: () => import('@/views/TestHome.vue'),
  //   meta: { title: '首页功能测试', allowGuest: true }
  // },
  // 调试路由已移除
  // {
  //   path: '/api-test',
  //   name: 'ApiTest',
  //   component: () => import('@/views/ApiTest.vue'),
  //   meta: { title: 'API连接测试' }
  // },
  // {
  //   path: '/scroll-test',
  //   name: 'ScrollTest',
  //   component: () => import('@/views/ScrollTest.vue'),
  //   meta: { title: '滚动测试' }
  // },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFound.vue'),
    meta: {
      title: '页面未找到',
      allowGuest: true
    }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  // 设置标题
  document.title = to.meta.title ? `${to.meta.title} - ERP移动版` : 'ERP移动版'

  // 检查是否需要登录
  const token = localStorage.getItem('token')
  if (!token && !to.meta.allowGuest) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
  } else {
    next()
  }
})

export default router
