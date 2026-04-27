/**
 * index.js
 * @description 应用程序路由 — 支持权限控制
 * @date 2025-08-27
 * @version 2.0.0 — 增加路由级权限
 */

import { createRouter, createWebHistory } from 'vue-router'
import { showToast } from 'vant'

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
  {
    path: '/about',
    name: 'About',
    component: () => import('@/views/About.vue'),
    meta: { title: '关于系统' }
  },
  // 仪表盘 — 重定向到首页（首页已包含数据概览）
  {
    path: '/dashboard',
    name: 'Dashboard',
    redirect: '/'
  },
  // 生产管理
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
  // 基础数据
  {
    path: '/baseData',
    name: 'BaseData',
    component: () => import('@/views/baseData/Index.vue'),
    meta: { title: '基础数据', permission: 'basedata' }
  },
  {
    path: '/baseData/materials',
    name: 'Materials',
    component: () => import('@/views/baseData/Materials.vue'),
    meta: { title: '物料管理', permission: 'basedata' }
  },
  {
    path: '/baseData/materials/create',
    name: 'CreateMaterial',
    component: () => import('@/views/baseData/CreateMaterial.vue'),
    meta: { title: '新建物料', permission: 'basedata' }
  },
  {
    path: '/baseData/materials/:id/edit',
    name: 'EditMaterial',
    component: () => import('@/views/baseData/CreateMaterial.vue'),
    meta: { title: '编辑物料', permission: 'basedata' }
  },
  {
    path: '/baseData/materials/:id',
    name: 'MaterialDetail',
    component: () => import('@/views/baseData/MaterialDetail.vue'),
    meta: { title: '物料详情', permission: 'basedata' }
  },
  {
    path: '/baseData/boms',
    name: 'BOMs',
    component: () => import('@/views/baseData/BOMs.vue'),
    meta: { title: 'BOM管理', permission: 'basedata' }
  },
  {
    path: '/baseData/customers',
    name: 'Customers',
    component: () => import('@/views/baseData/Customers.vue'),
    meta: { title: '客户管理', permission: 'basedata' }
  },
  {
    path: '/baseData/customers/create',
    name: 'CreateCustomer',
    component: () => import('@/views/baseData/CreateCustomer.vue'),
    meta: { title: '新建客户', permission: 'basedata' }
  },
  {
    path: '/baseData/customers/:id',
    name: 'CustomerDetail',
    component: () => import('@/views/baseData/CustomerDetail.vue'),
    meta: { title: '客户详情', permission: 'basedata' }
  },
  {
    path: '/baseData/suppliers',
    name: 'Suppliers',
    component: () => import('@/views/baseData/Suppliers.vue'),
    meta: { title: '供应商管理', permission: 'basedata' }
  },
  {
    path: '/baseData/suppliers/create',
    name: 'CreateSupplier',
    component: () => import('@/views/baseData/CreateSupplier.vue'),
    meta: { title: '新建供应商', permission: 'basedata' }
  },
  {
    path: '/baseData/suppliers/:id',
    name: 'SupplierDetail',
    component: () => import('@/views/baseData/SupplierDetail.vue'),
    meta: { title: '供应商详情', permission: 'basedata' }
  },
  {
    path: '/baseData/categories',
    name: 'Categories',
    component: () => import('@/views/baseData/Categories.vue'),
    meta: { title: '分类管理', permission: 'basedata' }
  },
  {
    path: '/baseData/units',
    name: 'Units',
    component: () => import('@/views/baseData/Units.vue'),
    meta: { title: '单位管理', permission: 'basedata' }
  },
  {
    path: '/baseData/locations',
    name: 'Locations',
    component: () => import('@/views/baseData/Locations.vue'),
    meta: { title: '库位管理', permission: 'basedata' }
  },
  {
    path: '/baseData/process-templates',
    name: 'ProcessTemplates',
    component: () => import('@/views/baseData/ProcessTemplates.vue'),
    meta: { title: '工序模板', permission: 'basedata' }
  },
  // 库存管理
  {
    path: '/inventory',
    name: 'Inventory',
    component: () => import('@/views/inventory/Index.vue'),
    meta: { title: '库存管理', permission: 'inventory' }
  },
  {
    path: '/inventory/stock',
    name: 'InventoryStock',
    component: () => import('@/views/inventory/Stock.vue'),
    meta: { title: '库存查询', permission: 'inventory' }
  },
  {
    path: '/inventory/inbound',
    name: 'InventoryInbound',
    component: () => import('@/views/inventory/Inbound.vue'),
    meta: { title: '库存入库', permission: 'inventory' }
  },
  {
    path: '/inventory/inbound/create',
    name: 'CreateInbound',
    component: () => import('@/views/inventory/CreateInbound.vue'),
    meta: { title: '新建入库单', permission: 'inventory' }
  },
  {
    path: '/inventory/inbound/:id',
    component: () => import('@/views/inventory/InboundDetail.vue'),
    meta: { title: '入库详情', permission: 'inventory' }
  },
  {
    path: '/inventory/outbound',
    name: 'InventoryOutbound',
    component: () => import('@/views/inventory/Outbound.vue'),
    meta: { title: '库存出库', permission: 'inventory' }
  },
  {
    path: '/inventory/outbound/create',
    name: 'CreateOutbound',
    component: () => import('@/views/inventory/CreateOutbound.vue'),
    meta: { title: '新建出库单', permission: 'inventory' }
  },
  {
    path: '/inventory/outbound/:id',
    name: 'InventoryOutboundDetail',
    component: () => import('@/views/inventory/OutboundDetail.vue'),
    meta: { title: '出库详情', permission: 'inventory' }
  },
  {
    path: '/inventory/transfer',
    name: 'InventoryTransfer',
    component: () => import('@/views/inventory/Transfer.vue'),
    meta: { title: '库存调拨', permission: 'inventory' }
  },
  {
    path: '/inventory/transfer/create',
    name: 'CreateTransfer',
    component: () => import('@/views/inventory/CreateTransfer.vue'),
    meta: { title: '新建调拨单', permission: 'inventory' }
  },
  {
    path: '/inventory/transfer/:id',
    name: 'InventoryTransferDetail',
    component: () => import('@/views/inventory/TransferDetail.vue'),
    meta: { title: '调拨详情', permission: 'inventory' }
  },
  {
    path: '/inventory/check',
    name: 'InventoryCheck',
    component: () => import('@/views/inventory/Check.vue'),
    meta: { title: '库存盘点', permission: 'inventory' }
  },
  {
    path: '/inventory/check/new',
    name: 'NewCheck',
    component: () => import('@/views/inventory/NewCheck.vue'),
    meta: { title: '新建盘点单', permission: 'inventory' }
  },
  {
    path: '/inventory/check/:id',
    name: 'CheckDetail',
    component: () => import('@/views/inventory/CheckDetail.vue'),
    meta: { title: '盘点单详情', permission: 'inventory' }
  },
  {
    path: '/inventory/check/:id/edit',
    name: 'EditCheck',
    component: () => import('@/views/inventory/EditCheck.vue'),
    meta: { title: '编辑盘点单', permission: 'inventory' }
  },
  {
    path: '/inventory/report',
    name: 'InventoryReport',
    component: () => import('@/views/inventory/Report.vue'),
    meta: { title: '库存报表', permission: 'inventory' }
  },
  {
    path: '/inventory/transaction',
    name: 'InventoryTransaction',
    component: () => import('@/views/inventory/Transaction.vue'),
    meta: { title: '库存流水', permission: 'inventory' }
  },
  // 采购管理
  {
    path: '/purchase',
    name: 'Purchase',
    component: () => import('@/views/purchase/Index.vue'),
    meta: { title: '采购管理', permission: 'purchase' }
  },
  {
    path: '/purchase/dashboard',
    name: 'PurchaseDashboard',
    redirect: '/purchase'
  },
  {
    path: '/purchase/requisitions',
    name: 'PurchaseRequisitions',
    component: () => import('@/views/purchase/Requisitions.vue'),
    meta: { title: '采购申请', permission: 'purchase' }
  },
  {
    path: '/purchase/requisitions/create',
    name: 'CreateRequisition',
    component: () => import('@/views/purchase/CreateRequisition.vue'),
    meta: { title: '新建采购申请', permission: 'purchase' }
  },
  {
    path: '/purchase/requisitions/new',
    name: 'NewRequisition',
    component: () => import('@/views/purchase/CreateRequisition.vue'),
    meta: { title: '新建采购申请', permission: 'purchase' }
  },
  {
    path: '/purchase/requisitions/:id',
    name: 'PurchaseRequisitionDetail',
    component: () => import('@/views/purchase/RequisitionDetail.vue'),
    meta: { title: '采购申请详情', permission: 'purchase' }
  },
  {
    path: '/purchase/orders',
    name: 'PurchaseOrders',
    component: () => import('@/views/purchase/Orders.vue'),
    meta: { title: '采购订单', permission: 'purchase' }
  },
  {
    path: '/purchase/orders/create',
    name: 'CreatePurchaseOrder',
    component: () => import('@/views/purchase/CreateOrder.vue'),
    meta: { title: '新建采购订单', permission: 'purchase' }
  },
  {
    path: '/purchase/orders/new',
    name: 'NewPurchaseOrder',
    component: () => import('@/views/purchase/CreateOrder.vue'),
    meta: { title: '新建采购订单', permission: 'purchase' }
  },
  {
    path: '/purchase/orders/:id',
    name: 'PurchaseOrderDetail',
    component: () => import('@/views/purchase/OrderDetail.vue'),
    meta: { title: '采购订单详情', permission: 'purchase' }
  },
  {
    path: '/purchase/receipts',
    name: 'PurchaseReceipts',
    component: () => import('@/views/purchase/Receipts.vue'),
    meta: { title: '采购入库', permission: 'purchase' }
  },
  {
    path: '/purchase/receipts/create',
    name: 'CreatePurchaseReceipt',
    component: () => import('@/views/purchase/CreateReceipt.vue'),
    meta: { title: '创建入库单', permission: 'purchase' }
  },
  {
    path: '/purchase/receipts/:id',
    name: 'PurchaseReceiptDetail',
    component: () => import('@/views/purchase/ReceiptDetail.vue'),
    meta: { title: '采购入库详情', permission: 'purchase' }
  },
  {
    path: '/purchase/returns',
    name: 'PurchaseReturns',
    component: () => import('@/views/purchase/Returns.vue'),
    meta: { title: '采购退货', permission: 'purchase' }
  },
  {
    path: '/purchase/returns/:id',
    name: 'PurchaseReturnDetail',
    component: () => import('@/views/purchase/ReceiptDetail.vue'),
    meta: { title: '退货详情', permission: 'purchase' }
  },
  {
    path: '/purchase/processing',
    name: 'PurchaseProcessing',
    component: () => import('@/views/purchase/Processing.vue'),
    meta: { title: '外委加工', permission: 'purchase' }
  },
  {
    path: '/purchase/processing-receipts',
    name: 'PurchaseProcessingReceipts',
    component: () => import('@/views/purchase/ProcessingReceipts.vue'),
    meta: { title: '外委入库', permission: 'purchase' }
  },
  // 销售管理
  {
    path: '/sales',
    name: 'Sales',
    component: () => import('@/views/sales/Index.vue'),
    meta: { title: '销售管理', permission: 'sales' }
  },
  {
    path: '/sales/orders',
    name: 'SalesOrders',
    component: () => import('@/views/sales/Orders.vue'),
    meta: { title: '销售订单', permission: 'sales' }
  },
  {
    path: '/sales/orders/create',
    name: 'CreateSalesOrderPage',
    component: () => import('@/views/sales/CreateSalesOrder.vue'),
    meta: { title: '新建销售订单', permission: 'sales' }
  },
  {
    path: '/sales/orders/:id',
    name: 'SalesOrderDetail',
    component: () => import('@/views/sales/OrderDetail.vue'),
    meta: { title: '销售订单详情', permission: 'sales' }
  },
  {
    path: '/sales/outbound',
    name: 'SalesOutbound',
    component: () => import('@/views/sales/Outbound.vue'),
    meta: { title: '销售出库', permission: 'sales' }
  },
  {
    path: '/sales/outbound/new',
    name: 'CreateSalesOutbound',
    component: () => import('@/views/sales/Outbound.vue'),
    meta: { title: '新建销售出库', permission: 'sales' }
  },
  {
    path: '/sales/outbound/:id',
    name: 'SalesOutboundDetail',
    component: () => import('@/views/sales/OutboundDetail.vue'),
    meta: { title: '销售出库详情', permission: 'sales' }
  },
  {
    path: '/sales/returns',
    name: 'SalesReturns',
    component: () => import('@/views/sales/Returns.vue'),
    meta: { title: '销售退货', permission: 'sales' }
  },
  {
    path: '/sales/returns/:id',
    name: 'SalesReturnDetail',
    component: () => import('@/views/sales/ReturnDetail.vue'),
    meta: { title: '销售退货详情', permission: 'sales' }
  },
  {
    path: '/sales/exchanges',
    name: 'SalesExchanges',
    component: () => import('@/views/sales/Exchanges.vue'),
    meta: { title: '销售换货', permission: 'sales' }
  },
  {
    path: '/sales/quotations',
    name: 'SalesQuotations',
    component: () => import('@/views/sales/Quotations.vue'),
    meta: { title: '报价管理', permission: 'sales' }
  },
  {
    path: '/sales/customers',
    name: 'SalesCustomers',
    component: () => import('@/views/sales/SalesCustomers.vue'),
    meta: { title: '客户管理', permission: 'sales' }
  },
  // 财务管理
  {
    path: '/finance',
    name: 'Finance',
    component: () => import('@/views/finance/Index.vue'),
    meta: { title: '财务管理', permission: 'finance' }
  },
  {
    path: '/finance/gl/accounts',
    name: 'GLAccounts',
    component: () => import('@/views/finance/Accounts.vue'),
    meta: { title: '会计科目', permission: 'finance' }
  },
  {
    path: '/finance/gl/accounts/:id',
    name: 'GLAccountDetail',
    component: () => import('@/views/finance/AccountDetail.vue'),
    meta: { title: '科目详情', permission: 'finance' }
  },
  {
    path: '/finance/gl/entries',
    name: 'GLEntries',
    component: () => import('@/views/finance/Entries.vue'),
    meta: { title: '会计凭证', permission: 'finance' }
  },
  {
    path: '/finance/gl/entries/:id',
    name: 'GLEntryDetail',
    component: () => import('@/views/finance/EntryDetail.vue'),
    meta: { title: '凭证详情', permission: 'finance' }
  },
  {
    path: '/finance/gl/entries/create',
    name: 'GLEntryCreate',
    component: () => import('@/views/finance/Entries.vue'),
    meta: { title: '新建凭证', permission: 'finance' }
  },
  {
    path: '/finance/gl/periods',
    name: 'GLPeriods',
    component: () => import('@/views/finance/Periods.vue'),
    meta: { title: '会计期间', permission: 'finance' }
  },
  {
    path: '/finance/gl/periods/:id',
    name: 'GLPeriodDetail',
    component: () => import('@/views/finance/PeriodDetail.vue'),
    meta: { title: '期间详情', permission: 'finance' }
  },
  {
    path: '/finance/ar/invoices',
    name: 'ARInvoices',
    component: () => import('@/views/finance/ARInvoices.vue'),
    meta: { title: '应收账款', permission: 'finance' }
  },
  {
    path: '/finance/ar/invoices/:id',
    name: 'ARInvoiceDetail',
    component: () => import('@/views/finance/ARInvoiceDetail.vue'),
    meta: { title: '应收发票详情', permission: 'finance' }
  },
  {
    path: '/finance/ar/receipts',
    name: 'ARReceipts',
    component: () => import('@/views/finance/ARReceipts.vue'),
    meta: { title: '收款管理', permission: 'finance' }
  },
  {
    path: '/finance/ar/aging',
    name: 'ARAging',
    component: () => import('@/views/finance/ARAging.vue'),
    meta: { title: '应收账龄', permission: 'finance' }
  },
  {
    path: '/finance/ar/receipts/create',
    name: 'ARReceiptCreate',
    component: () => import('@/views/finance/ARReceipts.vue'),
    meta: { title: '收款登记', permission: 'finance' }
  },
  {
    path: '/finance/ar/receipts/:id',
    name: 'ARReceiptDetail',
    component: () => import('@/views/finance/ARReceiptDetail.vue'),
    meta: { title: '收款详情', permission: 'finance' }
  },
  {
    path: '/finance/ap/invoices',
    name: 'APInvoices',
    component: () => import('@/views/finance/APInvoices.vue'),
    meta: { title: '应付账款', permission: 'finance' }
  },
  {
    path: '/finance/ap/invoices/:id',
    name: 'APInvoiceDetail',
    component: () => import('@/views/finance/APInvoiceDetail.vue'),
    meta: { title: '应付发票详情', permission: 'finance' }
  },
  {
    path: '/finance/ap/payments',
    name: 'APPayments',
    component: () => import('@/views/finance/APPayments.vue'),
    meta: { title: '付款管理', permission: 'finance' }
  },
  {
    path: '/finance/ap/payments/create',
    name: 'APPaymentCreate',
    component: () => import('@/views/finance/APPayments.vue'),
    meta: { title: '付款登记', permission: 'finance' }
  },
  {
    path: '/finance/ap/payments/:id',
    name: 'APPaymentDetail',
    component: () => import('@/views/finance/APPaymentDetail.vue'),
    meta: { title: '付款详情', permission: 'finance' }
  },
  {
    path: '/finance/ap/aging',
    name: 'APAging',
    component: () => import('@/views/finance/APAging.vue'),
    meta: { title: '应付账龄', permission: 'finance' }
  },
  {
    path: '/finance/assets/list',
    name: 'AssetsList',
    component: () => import('@/views/finance/Assets.vue'),
    meta: { title: '固定资产', permission: 'finance' }
  },
  {
    path: '/finance/assets/categories',
    name: 'AssetsCategories',
    component: () => import('@/views/finance/Assets.vue'),
    meta: { title: '资产类别', permission: 'finance' }
  },
  {
    path: '/finance/assets/depreciation',
    name: 'AssetsDepreciation',
    component: () => import('@/views/finance/Assets.vue'),
    meta: { title: '折旧管理', permission: 'finance' }
  },
  {
    path: '/finance/assets/:id',
    name: 'AssetDetail',
    component: () => import('@/views/finance/AssetDetail.vue'),
    meta: { title: '资产详情', permission: 'finance' }
  },
  {
    path: '/finance/cash/accounts',
    name: 'CashAccounts',
    component: () => import('@/views/finance/CashAccounts.vue'),
    meta: { title: '银行账户', permission: 'finance' }
  },
  {
    path: '/finance/cash/accounts/:id',
    name: 'CashAccountDetail',
    component: () => import('@/views/finance/CashAccountDetail.vue'),
    meta: { title: '账户详情', permission: 'finance' }
  },
  {
    path: '/finance/cash/transactions',
    name: 'CashTransactionsOld',
    component: () => import('@/views/finance/BankTransactions.vue'),
    meta: { title: '银行交易', permission: 'finance' }
  },
  {
    path: '/finance/cash/bank-transactions',
    name: 'BankTransactions',
    component: () => import('@/views/finance/BankTransactions.vue'),
    meta: { title: '银行交易', permission: 'finance' }
  },
  {
    path: '/finance/cash/cash-transactions',
    name: 'CashTransactions',
    component: () => import('@/views/finance/CashTransactionsPage.vue'),
    meta: { title: '现金交易', permission: 'finance' }
  },
  {
    path: '/finance/cash/reconciliation',
    name: 'CashReconciliation',
    component: () => import('@/views/finance/Reconciliation.vue'),
    meta: { title: '银行对账', permission: 'finance' }
  },
  {
    path: '/finance/cash/transactions/create',
    name: 'CashTransactionCreate',
    component: () => import('@/views/finance/BankTransactions.vue'),
    meta: { title: '新建交易', permission: 'finance' }
  },
  {
    path: '/finance/reports/balance-sheet',
    name: 'BalanceSheet',
    component: () => import('@/views/finance/BalanceSheet.vue'),
    meta: { title: '资产负债表', permission: 'finance' }
  },
  {
    path: '/finance/reports/income-statement',
    name: 'IncomeStatement',
    component: () => import('@/views/finance/IncomeStatement.vue'),
    meta: { title: '利润表', permission: 'finance' }
  },
  {
    path: '/finance/reports/cash-flow',
    name: 'CashFlowStatement',
    component: () => import('@/views/finance/CashFlowReport.vue'),
    meta: { title: '出纳报表', permission: 'finance' }
  },
  // 质量管理
  {
    path: '/quality',
    name: 'Quality',
    component: () => import('@/views/quality/Index.vue'),
    meta: { title: '质量管理', permission: 'quality' }
  },
  {
    path: '/quality/incoming',
    name: 'QualityIncoming',
    component: () => import('@/views/quality/Incoming.vue'),
    meta: { title: '来料检验', permission: 'quality' }
  },
  {
    path: '/quality/incoming/create',
    name: 'CreateIncomingInspection',
    component: () => import('@/views/quality/CreateIncoming.vue'),
    meta: { title: '新建来料检验', permission: 'quality' }
  },
  {
    path: '/quality/incoming/:id',
    name: 'IncomingInspectionDetail',
    component: () => import('@/views/quality/IncomingDetail.vue'),
    meta: { title: '来料检验详情', permission: 'quality' }
  },
  {
    path: '/quality/incoming/:id/inspect',
    name: 'IncomingInspect',
    component: () => import('@/views/quality/IncomingDetail.vue'),
    meta: { title: '执行检验', permission: 'quality' }
  },
  {
    path: '/quality/process',
    name: 'QualityProcess',
    component: () => import('@/views/quality/Process.vue'),
    meta: { title: '过程检验', permission: 'quality' }
  },
  {
    path: '/quality/process/create',
    name: 'CreateProcessInspection',
    component: () => import('@/views/quality/CreateProcess.vue'),
    meta: { title: '新建过程检验', permission: 'quality' }
  },
  {
    path: '/quality/process/:id',
    name: 'ProcessInspectionDetail',
    component: () => import('@/views/quality/ProcessDetail.vue'),
    meta: { title: '过程检验详情', permission: 'quality' }
  },
  {
    path: '/quality/final',
    name: 'QualityFinal',
    component: () => import('@/views/quality/Final.vue'),
    meta: { title: '成品检验', permission: 'quality' }
  },
  {
    path: '/quality/final/create',
    name: 'CreateFinalInspection',
    component: () => import('@/views/quality/CreateFinal.vue'),
    meta: { title: '新建成品检验', permission: 'quality' }
  },
  {
    path: '/quality/final/:id',
    name: 'FinalInspectionDetail',
    component: () => import('@/views/quality/FinalDetail.vue'),
    meta: { title: '成品检验详情', permission: 'quality' }
  },
  {
    path: '/quality/templates',
    name: 'QualityTemplates',
    component: () => import('@/views/quality/Templates.vue'),
    meta: { title: '检验模板', permission: 'quality' }
  },
  {
    path: '/quality/traceability',
    name: 'QualityTraceability',
    component: () => import('@/views/quality/Traceability.vue'),
    meta: { title: '追溯管理', permission: 'quality' }
  },
  {
    path: '/quality/traceability/detail',
    name: 'QualityTraceabilityDetail',
    component: () => import('@/views/quality/TraceabilityDetail.vue'),
    meta: { title: '追溯详情', permission: 'quality' }
  },
  {
    path: '/quality/nonconformance',
    name: 'QualityNonconformance',
    component: () => import('@/views/quality/Nonconformance.vue'),
    meta: { title: '不合格品处理', permission: 'quality' }
  },
  {
    path: '/quality/nonconformance/:id',
    name: 'NonconformanceDetail',
    component: () => import('@/views/quality/NonconformanceDetail.vue'),
    meta: { title: '不合格品详情', permission: 'quality' }
  },
  {
    path: '/quality/reports/statistics',
    name: 'QualityReportStatistics',
    component: () => import('@/views/quality/ReportStatistics.vue'),
    meta: { title: '质量统计', permission: 'quality' }
  },
  {
    path: '/quality/reports/spc',
    name: 'QualityReportSPC',
    component: () => import('@/views/quality/ReportSPC.vue'),
    meta: { title: 'SPC分析', permission: 'quality' }
  },
  {
    path: '/quality/reports/trends',
    name: 'QualityReportTrends',
    component: () => import('@/views/quality/ReportTrends.vue'),
    meta: { title: '质量趋势', permission: 'quality' }
  },
  {
    path: '/quality/standards',
    name: 'QualityStandards',
    component: () => import('@/views/quality/Standards.vue'),
    meta: { title: '质量标准', permission: 'quality' }
  },
  // 设备资产管理
  {
    path: '/equipment',
    name: 'Equipment',
    component: () => import('@/views/equipment/Index.vue'),
    meta: { title: '设备管理', permission: 'equipment' }
  },
  {
    path: '/equipment/list',
    name: 'EquipmentList',
    component: () => import('@/views/equipment/EquipmentList.vue'),
    meta: { title: '设备台账', permission: 'equipment' }
  },
  {
    path: '/equipment/types',
    name: 'EquipmentTypes',
    component: () => import('@/views/equipment/Types.vue'),
    meta: { title: '设备类型', permission: 'equipment' }
  },
  {
    path: '/equipment/check',
    name: 'EquipmentCheck',
    component: () => import('@/views/equipment/Check.vue'),
    meta: { title: '日常点检', permission: 'equipment' }
  },
  {
    path: '/equipment/maintenance',
    name: 'EquipmentMaintenance',
    component: () => import('@/views/equipment/Maintenance.vue'),
    meta: { title: '保养计划', permission: 'equipment' }
  },
  {
    path: '/equipment/repair',
    name: 'EquipmentRepair',
    component: () => import('@/views/equipment/Repair.vue'),
    meta: { title: '故障维修', permission: 'equipment' }
  },
  {
    path: '/equipment/check/create',
    name: 'CreateEquipmentCheck',
    component: () => import('@/views/equipment/CreateCheck.vue'),
    meta: { title: '新建点检', permission: 'equipment' }
  },
  {
    path: '/equipment/repair/create',
    name: 'CreateEquipmentRepair',
    component: () => import('@/views/equipment/CreateRepair.vue'),
    meta: { title: '新建报修', permission: 'equipment' }
  },

  // 人事管理
  {
    path: '/hr',
    name: 'HR',
    component: () => import('@/views/hr/Index.vue'),
    meta: { title: '人事管理', permission: 'hr' }
  },
  {
    path: '/hr/employees',
    name: 'HREmployees',
    component: () => import('@/views/hr/Employees.vue'),
    meta: { title: '员工档案', permission: 'hr' }
  },
  {
    path: '/hr/departments',
    name: 'HRDepartments',
    component: () => import('@/views/hr/Departments.vue'),
    meta: { title: '部门管理', permission: 'hr' }
  },
  {
    path: '/hr/attendance',
    name: 'HRAttendance',
    component: () => import('@/views/hr/Attendance.vue'),
    meta: { title: '考勤记录', permission: 'hr' }
  },
  {
    path: '/hr/leave',
    name: 'HRLeave',
    component: () => import('@/views/hr/Leave.vue'),
    meta: { title: '请假审阅', permission: 'hr' }
  },
  {
    path: '/hr/overtime',
    name: 'HROvertime',
    component: () => import('@/views/hr/Overtime.vue'),
    meta: { title: '加班审批', permission: 'hr' }
  },
  {
    path: '/hr/leave/create',
    name: 'CreateLeave',
    component: () => import('@/views/hr/CreateLeave.vue'),
    meta: { title: '请假申请', permission: 'hr' }
  },
  {
    path: '/hr/overtime/create',
    name: 'CreateOvertime',
    component: () => import('@/views/hr/CreateOvertime.vue'),
    meta: { title: '加班申请', permission: 'hr' }
  },
  {
    path: '/hr/schedule',
    name: 'HRSchedule',
    component: () => import('@/views/hr/Schedule.vue'),
    meta: { title: '排班管理', permission: 'hr' }
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
    component: () => import('@/views/notifications/NotificationDetail.vue'),
    meta: { title: '消息详情' }
  },

  // 即时通讯
  {
    path: '/chat',
    name: 'Chat',
    component: () => import('@/views/Chat.vue'),
    meta: { title: '即时通讯' }
  },

  // 系统管理
  {
    path: '/system',
    name: 'SystemIndex',
    component: () => import('@/views/system/Index.vue'),
    meta: { title: '系统管理', permission: 'system' }
  },
  {
    path: '/system/users',
    name: 'SystemUsers',
    component: () => import('@/views/system/Users.vue'),
    meta: { title: '用户管理', permission: 'system' }
  },
  {
    path: '/system/users/create',
    name: 'CreateUser',
    component: () => import('@/views/system/Users.vue'),
    meta: { title: '创建用户', permission: 'system' }
  },
  {
    path: '/system/users/:id',
    name: 'UserDetail',
    component: () => import('@/views/system/Users.vue'),
    meta: { title: '用户详情', permission: 'system' }
  },
  {
    path: '/system/departments',
    name: 'SystemDepartments',
    component: () => import('@/views/system/Departments.vue'),
    meta: { title: '部门管理', permission: 'system' }
  },
  {
    path: '/system/roles',
    name: 'SystemRoles',
    component: () => import('@/views/system/Roles.vue'),
    meta: { title: '角色管理', permission: 'system' }
  },
  {
    path: '/system/permissions',
    name: 'SystemPermissions',
    component: () => import('@/views/system/Permissions.vue'),
    meta: { title: '权限管理', permission: 'system' }
  },
  {
    path: '/system/config',
    name: 'SystemConfig',
    component: () => import('@/views/system/Config.vue'),
    meta: { title: '系统配置', permission: 'system' }
  },
  {
    path: '/system/logs',
    name: 'SystemLogs',
    component: () => import('@/views/system/Logs.vue'),
    meta: { title: '系统日志', permission: 'system' }
  },
  {
    path: '/system/access-control',
    name: 'SystemAccessControl',
    component: () => import('@/views/system/AccessControl.vue'),
    meta: { title: '访问控制', permission: 'system' }
  },
  {
    path: '/system/backup',
    name: 'SystemBackup',
    component: () => import('@/views/system/Backup.vue'),
    meta: { title: '数据备份', permission: 'system' }
  },
  {
    path: '/system/hierarchy',
    name: 'SystemHierarchy',
    component: () => import('@/views/system/Hierarchy.vue'),
    meta: { title: '组织架构', permission: 'system' }
  },
  {
    path: '/system/maintenance',
    name: 'SystemMaintenance',
    component: () => import('@/views/system/SystemMaintenance.vue'),
    meta: { title: '系统维护', permission: 'system' }
  },
  {
    path: '/system/positions',
    name: 'SystemPositions',
    component: () => import('@/views/system/Positions.vue'),
    meta: { title: '岗位管理', permission: 'system' }
  },
  {
    path: '/system/profiles',
    name: 'SystemProfiles',
    component: () => import('@/views/system/Profiles.vue'),
    meta: { title: '配置文件', permission: 'system' }
  },
  {
    path: '/system/sessions',
    name: 'SystemSessions',
    component: () => import('@/views/system/Sessions.vue'),
    meta: { title: '会话管理', permission: 'system' }
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
    path: '/profile/theme',
    name: 'ThemeSettings',
    component: () => import('@/views/profile/Theme.vue'),
    meta: { title: '主题设置' }
  },
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
  },
  // 设置页已废弃 — 功能已合并到 /profile
  {
    path: '/settings',
    redirect: '/profile'
  },

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
  routes,
  /**
   * 滚动位置恢复
   * - 按返回键 → 恢复之前的滚动位置
   * - 正常导航 → 滚动到页面顶部
   * - 带 hash → 滚动到锚点
   */
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    if (to.hash) {
      return { el: to.hash, behavior: 'smooth' }
    }
    return { top: 0, behavior: 'smooth' }
  }
})

router.beforeEach(async (to, from, next) => {
  // 设置标题
  document.title = to.meta.title ? `${to.meta.title} - ERP移动版` : 'ERP移动版'

  // 检查是否需要登录
  const token = sessionStorage.getItem('token')
  if (!token && !to.meta.allowGuest) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }

  // ==================== 权限检查 ====================
  if (to.meta.permission && token) {
    // 延迟导入 authStore，避免循环依赖
    const { useAuthStore } = await import('@/stores/auth')
    const authStore = useAuthStore()

    // 首次导航时自动加载权限数据
    if (!authStore.permissionsLoaded) {
      try {
        await authStore.fetchUserPermissions()
      } catch (error) {
        console.error('[路由守卫] 加载权限数据失败:', error)
      }
    }

    // 检查路由权限
    const requiredPermission = to.meta.permission
    let hasPermission = authStore.hasPermission(requiredPermission)

    // 无权限时尝试刷新一次
    if (!hasPermission && authStore.permissionsLoaded) {
      try {
        await authStore.refreshPermissions()
        hasPermission = authStore.hasPermission(requiredPermission)
      } catch (error) {
        console.error('[路由守卫] 刷新权限失败:', error)
      }
    }

    if (!hasPermission) {
      showToast('您没有权限访问此页面')
      next('/')
      return
    }
  }

  next()
})

export default router
