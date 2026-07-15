/**
 * Default system seed data.
 * @description Creates the initial admin role/user, core menu tree, and default cost settings.
 */

const CORE_ROLES = [
  { id: 1, name: '管理员', code: 'admin', description: '系统管理员，拥有全部权限' },
  { id: 2, name: '普通用户', code: 'user', description: '普通用户角色' },
  { id: 3, name: '财务管理员', code: 'finance_manager', description: '财务模块管理角色' },
  { id: 4, name: '仓库管理员', code: 'inventory_manager', description: '仓库和库存管理角色' },
  { id: 5, name: '采购管理员', code: 'purchase_manager', description: '采购模块管理角色' },
  { id: 6, name: '销售管理员', code: 'sales_manager', description: '销售模块管理角色' },
  { id: 7, name: '生产管理员', code: 'production_manager', description: '生产模块管理角色' },
  { id: 8, name: '质量管理员', code: 'quality_manager', description: '质量模块管理角色' },
  { id: 9, name: '人事管理员', code: 'hr_manager', description: '人力资源模块管理角色' },
];

const CORE_MENUS = [
  { id: 1, name: '仪表盘', path: '/', component: 'dashboard/Dashboard', icon: 'Dashboard', permission: 'dashboard', type: 1, parent_id: null, sort_order: 1 },
  { id: 2, name: '数据概览', path: '/dataoverview', component: '', icon: 'DataAnalysis', permission: 'dataoverview', type: 0, parent_id: null, sort_order: 2 },
  { id: 201, name: '生产概览', path: '/dataoverview/production', component: 'dataOverview/ProductionDashboard', permission: 'dataoverview:production', parent_id: 2, sort_order: 1 },
  { id: 202, name: '库存概览', path: '/dataoverview/inventory', component: 'dataOverview/InventoryDashboard', permission: 'dataoverview:inventory', parent_id: 2, sort_order: 2 },
  { id: 203, name: '销售概览', path: '/dataoverview/sales', component: 'dataOverview/SalesDashboard', permission: 'dataoverview:sales', parent_id: 2, sort_order: 3 },
  { id: 204, name: '财务概览', path: '/dataoverview/finance', component: 'dataOverview/FinanceDashboard', permission: 'dataoverview:finance', parent_id: 2, sort_order: 4 },
  { id: 205, name: '质量概览', path: '/dataoverview/quality', component: 'dataOverview/QualityDashboard', permission: 'dataoverview:quality', parent_id: 2, sort_order: 5 },
  { id: 206, name: '采购概览', path: '/dataoverview/purchase', component: 'dataOverview/PurchaseDashboard', permission: 'dataoverview:purchase', parent_id: 2, sort_order: 6 },
  { id: 3, name: '生产管理', path: '/production', component: '', icon: 'SetUp', permission: 'production', type: 0, parent_id: null, sort_order: 3 },
  { id: 4, name: '基础数据', path: '/basedata', component: '', icon: 'Collection', permission: 'basedata', type: 0, parent_id: null, sort_order: 4 },
  { id: 5, name: '库存管理', path: '/inventory', component: '', icon: 'Box', permission: 'inventory', type: 0, parent_id: null, sort_order: 5 },
  { id: 6, name: '采购管理', path: '/purchase', component: '', icon: 'ShoppingCart', permission: 'purchase', type: 0, parent_id: null, sort_order: 6 },
  { id: 7, name: '销售管理', path: '/sales', component: '', icon: 'TrendCharts', permission: 'sales', type: 0, parent_id: null, sort_order: 7 },
  { id: 8, name: '质量管理', path: '/quality', component: '', icon: 'CircleCheck', permission: 'quality', type: 0, parent_id: null, sort_order: 8 },
  { id: 9, name: '财务管理', path: '/finance', component: '', icon: 'Money', permission: 'finance', type: 0, parent_id: null, sort_order: 9 },
  { id: 10, name: '设备管理', path: '/equipment', component: '', icon: 'Monitor', permission: 'equipment', type: 0, parent_id: null, sort_order: 10 },
  { id: 11, name: '人力资源', path: '/hr', component: '', icon: 'UserFilled', permission: 'hr', type: 0, parent_id: null, sort_order: 11 },
  { id: 12, name: '系统管理', path: '/system', component: '', icon: 'Setting', permission: 'system', type: 0, parent_id: null, sort_order: 12 },

  { id: 31, name: '生产计划', path: '/production/plan', component: 'production/ProductionPlan', permission: 'production:plans', parent_id: 3, sort_order: 1 },
  { id: 32, name: '生产任务', path: '/production/task', component: 'production/ProductionTask', permission: 'production:tasks', parent_id: 3, sort_order: 2 },
  { id: 33, name: '生产过程', path: '/production/process', component: 'production/ProductionProcess', permission: 'production:process', parent_id: 3, sort_order: 3 },
  { id: 34, name: '生产报工', path: '/production/report', component: 'production/ProductionReport', permission: 'production:reports', parent_id: 3, sort_order: 4 },
  { id: 35, name: '生产数据看板', path: '/production/data-view', component: 'production/ProductionDataView', permission: 'production:data-view', parent_id: 3, sort_order: 8 },
  { id: 36, name: '缺料统计', path: '/production/material-shortage', component: 'production/MaterialShortage', permission: 'production:shortage', parent_id: 3, sort_order: 5 },
  { id: 37, name: 'MRP计划', path: '/production/mrp', component: 'production/MRPPlanning', permission: 'production:mrp', parent_id: 3, sort_order: 7 },
  { id: 38, name: '生产甘特图', path: '/production/gantt', component: 'production/ProductionGantt', permission: 'production:gantt', parent_id: 3, sort_order: 9 },
  { id: 39, name: '设备监控', path: '/production/equipment-monitoring', component: 'production/EquipmentMonitoring', permission: 'production:equipment', parent_id: 3, sort_order: 6 },

  { id: 41, name: '物料管理', path: '/basedata/materials', component: 'baseData/Materials', permission: 'basedata:materials', parent_id: 4, sort_order: 1 },
  { id: 42, name: 'BOM管理', path: '/basedata/boms', component: 'baseData/Boms', permission: 'basedata:boms', parent_id: 4, sort_order: 2 },
  { id: 43, name: '客户管理', path: '/basedata/customers', component: 'baseData/Customers', permission: 'basedata:customers', parent_id: 4, sort_order: 3 },
  { id: 44, name: '供应商管理', path: '/basedata/suppliers', component: 'baseData/Suppliers', permission: 'basedata:suppliers', parent_id: 4, sort_order: 4 },
  { id: 45, name: '产品大类', path: '/basedata/categories', component: 'baseData/Categories', permission: 'basedata:categories', parent_id: 4, sort_order: 5 },
  { id: 46, name: '单位管理', path: '/basedata/units', component: 'baseData/Units', permission: 'basedata:units', parent_id: 4, sort_order: 6 },
  { id: 47, name: '库位管理', path: '/basedata/locations', component: 'baseData/Locations', permission: 'basedata:locations', parent_id: 4, sort_order: 7 },
  { id: 48, name: '工序模板', path: '/basedata/process-templates', component: 'baseData/ProcessTemplates', permission: 'basedata:processtemplates', parent_id: 4, sort_order: 8 },
  { id: 49, name: '物料类型', path: '/basedata/product-categories', component: 'baseData/ProductCategories', permission: 'basedata:productcategories', parent_id: 4, sort_order: 9 },
  { id: 410, name: '工程变更', path: '/basedata/ecn', component: 'baseData/ECNManagement', permission: 'basedata:ecn', parent_id: 4, sort_order: 10 },

  { id: 51, name: '库存查询', path: '/inventory/stock', component: 'inventory/InventoryStock', permission: 'inventory:stock', parent_id: 5, sort_order: 1 },
  { id: 52, name: '入库管理', path: '/inventory/inbound', component: 'inventory/InventoryInbound', permission: 'inventory:inbound', parent_id: 5, sort_order: 2 },
  { id: 53, name: '出库管理', path: '/inventory/outbound', component: 'inventory/InventoryOutbound', permission: 'inventory:outbound', parent_id: 5, sort_order: 3 },
  { id: 54, name: '库存调拨', path: '/inventory/transfer', component: 'inventory/InventoryTransfer', permission: 'inventory:transfer', parent_id: 5, sort_order: 4 },
  { id: 55, name: '库存盘点', path: '/inventory/check', component: 'inventory/InventoryCheck', permission: 'inventory:check', parent_id: 5, sort_order: 5 },
  { id: 56, name: '手工出入库', path: '/inventory/manual-transaction', component: 'inventory/ManualTransaction', permission: 'inventory:manual-transaction', parent_id: 5, sort_order: 6 },
  { id: 57, name: '库存报表', path: '/inventory/report', component: 'inventory/InventoryReport', permission: 'inventory:report', parent_id: 5, sort_order: 7 },
  { id: 58, name: '库存流水', path: '/inventory/transaction', component: 'inventory/InventoryTransaction', permission: 'inventory:transaction', parent_id: 5, sort_order: 8 },

  { id: 61, name: '采购申请', path: '/purchase/requisitions', component: 'purchase/PurchaseRequisitions', permission: 'purchase:requisitions', parent_id: 6, sort_order: 1 },
  { id: 62, name: '采购订单', path: '/purchase/orders', component: 'purchase/PurchaseOrders', permission: 'purchase:orders', parent_id: 6, sort_order: 2 },
  { id: 63, name: '采购入库', path: '/purchase/receipts', component: 'purchase/PurchaseReceipts', permission: 'purchase:receipts', parent_id: 6, sort_order: 3 },
  { id: 64, name: '采购退货', path: '/purchase/returns', component: 'purchase/PurchaseReturns', permission: 'purchase:returns', parent_id: 6, sort_order: 4 },
  { id: 65, name: '外委加工', path: '/purchase/processing', component: 'purchase/OutsourcedProcessing', permission: 'purchase:processing', parent_id: 6, sort_order: 5 },
  { id: 66, name: '外委入库', path: '/purchase/processing-receipts', component: 'purchase/OutsourcedReceipts', permission: 'purchase:processing-receipts', parent_id: 6, sort_order: 6 },
  { id: 67, name: '采购历史', path: '/purchase/history', component: 'purchase/PurchaseHistory', permission: 'purchase:history', parent_id: 6, sort_order: 7 },

  { id: 71, name: '销售订单', path: '/sales/orders', component: 'sales/SalesOrders', permission: 'sales:orders', parent_id: 7, sort_order: 1 },
  { id: 72, name: '销售出库', path: '/sales/outbound', component: 'sales/SalesOutbound', permission: 'sales:outbound', parent_id: 7, sort_order: 2 },
  { id: 73, name: '销售退货', path: '/sales/returns', component: 'sales/SalesReturns', permission: 'sales:returns', parent_id: 7, sort_order: 3 },
  { id: 74, name: '销售换货', path: '/sales/exchanges', component: 'sales/SalesExchanges', permission: 'sales:exchanges', parent_id: 7, sort_order: 4 },
  { id: 75, name: '报价单统计', path: '/sales/quotations', component: 'sales/SalesQuotations', permission: 'sales:quotations', parent_id: 7, sort_order: 5 },
  { id: 76, name: '装箱单', path: '/sales/packing-lists', component: 'sales/PackingLists', permission: 'sales:packing-lists', parent_id: 7, sort_order: 6 },
  { id: 77, name: '交付统计', path: '/sales/delivery-stats', component: 'sales/DeliveryStats', permission: 'sales:delivery-stats', parent_id: 7, sort_order: 7 },
  { id: 78, name: '合同管理', path: '/sales/contracts', component: 'sales/ContractManagement', permission: 'contract:view', parent_id: 7, sort_order: 8 },

  { id: 81, name: '来料检验', path: '/quality/incoming', component: 'quality/IncomingInspection', permission: 'quality:incoming', parent_id: 8, sort_order: 1 },
  { id: 82, name: '过程检验', path: '/quality/process', component: 'quality/ProcessInspection', permission: 'quality:process', parent_id: 8, sort_order: 2 },
  { id: 83, name: '成品检验', path: '/quality/final', component: 'quality/FinalInspection', permission: 'quality:final', parent_id: 8, sort_order: 3 },
  { id: 84, name: '检验模板', path: '/quality/templates', component: 'quality/InspectionTemplates', permission: 'quality:templates', parent_id: 8, sort_order: 4 },
  { id: 85, name: '不合格品', path: '/quality/nonconforming', component: 'quality/NonconformingProducts', permission: 'quality:nonconforming', parent_id: 8, sort_order: 5 },
  { id: 86, name: '8D报告', path: '/quality/8d-reports', component: 'quality/EightDReport', permission: 'quality:8d', parent_id: 8, sort_order: 6 },
  { id: 861, name: '查看8D报告', path: '', component: '', permission: 'quality:8d:view', type: 2, visible: 0, parent_id: 86, sort_order: 1 },
  { id: 862, name: '创建8D报告', path: '', component: '', permission: 'quality:8d:create', type: 2, visible: 0, parent_id: 86, sort_order: 2 },
  { id: 863, name: '维护8D报告', path: '', component: '', permission: 'quality:8d:update', type: 2, visible: 0, parent_id: 86, sort_order: 3 },
  { id: 864, name: '删除8D报告', path: '', component: '', permission: 'quality:8d:delete', type: 2, visible: 0, parent_id: 86, sort_order: 4 },
  { id: 87, name: '首件检验', path: '/quality/first-article', component: 'quality/FirstArticleInspection', permission: 'quality:first-article', parent_id: 8, sort_order: 2 },
  { id: 88, name: '换货单', path: '/quality/replacement-orders', component: 'quality/ReplacementOrders', permission: 'quality:replacement', parent_id: 8, sort_order: 7 },
  { id: 89, name: '返工任务', path: '/quality/rework-tasks', component: 'quality/ReworkTasks', permission: 'quality:rework', parent_id: 8, sort_order: 8 },
  { id: 90, name: '报废记录', path: '/quality/scrap-records', component: 'quality/ScrapRecords', permission: 'quality:scrap', parent_id: 8, sort_order: 9 },
  { id: 865, name: 'AQL标准', path: '/quality/aql-standards', component: 'quality/AQLStandards', permission: 'quality:aql', parent_id: 8, sort_order: 10 },
  { id: 866, name: '质量统计', path: '/quality/statistics', component: 'quality/QualityStatistics', permission: 'quality:statistics', parent_id: 8, sort_order: 11 },
  { id: 867, name: '批次追溯', path: '/quality/traceability', component: 'quality/components/UnifiedTraceability', permission: 'quality:traceability', parent_id: 8, sort_order: 12 },
  { id: 868, name: '量具管理', path: '/quality/gauges', component: 'quality/GaugeManagement', permission: 'quality:gauges', parent_id: 8, sort_order: 13 },
  { id: 869, name: 'SPC控制图', path: '/quality/spc', component: 'quality/SPCControlChart', permission: 'quality:spc', parent_id: 8, sort_order: 14 },
  { id: 870, name: '供应商质量', path: '/quality/supplier-quality', component: 'quality/SupplierQualityScorecard', permission: 'quality:supplier-quality', parent_id: 8, sort_order: 15 },

  { id: 91, name: '会计科目', path: '/finance/gl/accounts', component: 'finance/gl/Accounts', permission: 'finance:accounts:view', parent_id: 9, sort_order: 1 },
  { id: 92, name: '会计凭证', path: '/finance/gl/entries', component: 'finance/gl/Entries', permission: 'finance:entries:view', parent_id: 9, sort_order: 2 },
  { id: 93, name: '会计期间', path: '/finance/gl/periods', component: 'finance/gl/Periods', permission: 'finance:periods:view', parent_id: 9, sort_order: 3 },
  { id: 94, name: '应收管理', path: '/finance/ar/invoices', component: 'finance/ar/Invoices', permission: 'finance:ar:view', parent_id: 9, sort_order: 4 },
  { id: 95, name: '应付管理', path: '/finance/ap/invoices', component: 'finance/ap/Invoices', permission: 'finance:ap:view', parent_id: 9, sort_order: 5 },
  { id: 96, name: '出纳管理', path: '/finance/cash/accounts', component: 'finance/cash/BankAccounts', permission: 'finance:cash:view', parent_id: 9, sort_order: 6 },
  { id: 97, name: '固定资产', path: '/finance/assets/list', component: 'finance/assets/AssetsList', permission: 'finance:assets:view', parent_id: 9, sort_order: 7 },
  { id: 98, name: '财务报表', path: '/finance/reports/balance-sheet', component: 'finance/reports/BalanceSheet', permission: 'finance:reports:view', parent_id: 9, sort_order: 8 },
  { id: 99, name: '财务设置', path: '/finance/settings', component: 'finance/settings/FinanceSettings', permission: 'finance:settings:view', parent_id: 9, sort_order: 9 },
  { id: 911, name: '期末结账', path: '/finance/gl/period-closing', component: 'finance/gl/PeriodClosing', permission: 'finance:closing:view', parent_id: 9, sort_order: 10 },
  { id: 921, name: '收款凭证', path: '/finance/gl/entries/receipt', component: 'finance/gl/entries/ReceiptEntry', permission: 'finance:entries:create', parent_id: 92, sort_order: 1 },
  { id: 922, name: '付款凭证', path: '/finance/gl/entries/payment', component: 'finance/gl/entries/PaymentEntry', permission: 'finance:entries:create', parent_id: 92, sort_order: 2 },
  { id: 923, name: '转账凭证', path: '/finance/gl/entries/transfer', component: 'finance/gl/entries/TransferEntry', permission: 'finance:entries:create', parent_id: 92, sort_order: 3 },
  { id: 924, name: '记账凭证', path: '/finance/gl/entries/general', component: 'finance/gl/entries/GeneralEntry', permission: 'finance:entries:create', parent_id: 92, sort_order: 4 },
  { id: 925, name: '新增凭证', path: '/finance/gl/entries/create', component: 'finance/gl/entries/EntryForm', permission: 'finance:entries:create', parent_id: 92, sort_order: 5 },
  { id: 961, name: '银行对账', path: '/finance/cash/reconciliation', component: 'finance/cash/Reconciliation', permission: 'finance:cash:reconcile', parent_id: 96, sort_order: 10 },
  { id: 981, name: '标准现金流量表', path: '/finance/reports/standard-cash-flow', component: 'finance/reports/StandardCashFlow', permission: 'finance:reports:standard-cash-flow:view', parent_id: 98, sort_order: 10 },
  { id: 991, name: '汇率设置', path: '/finance/settings/exchange-rates', component: 'finance/settings/ExchangeRates', permission: 'finance:exchange-rates:view', parent_id: 99, sort_order: 10 },
  { id: 9101, name: '财务自动化', path: '/finance/automation', component: 'finance/automation/FinanceAutomation', permission: 'finance:automation:view', parent_id: 9, sort_order: 11 },
  { id: 9102, name: '税务发票', path: '/finance/tax/invoices', component: 'finance/tax/TaxInvoices', permission: 'finance:tax:view', parent_id: 9, sort_order: 12 },
  { id: 9103, name: '预算列表', path: '/finance/budget/list', component: 'finance/budget/BudgetList', permission: 'finance:budgets:view', parent_id: 9, sort_order: 13 },
  { id: 9104, name: '新增预算', path: '/finance/budget/edit', component: 'finance/budget/BudgetEdit', permission: 'finance:budgets:create', parent_id: 9, sort_order: 14 },
  { id: 9105, name: '编辑预算', path: '/finance/budget/edit/:id', component: 'finance/budget/BudgetEdit', permission: 'finance:budgets:update', parent_id: 9, sort_order: 15 },
  { id: 9106, name: '成本驾驶舱', path: '/finance/cost/dashboard', component: 'finance/cost/CostDashboard', permission: 'finance:cost:view', parent_id: 9, sort_order: 16 },
  { id: 9107, name: '产品定价', path: '/finance/pricing', component: 'finance/pricing/ProductPricing', permission: 'finance:pricing:view', parent_id: 9, sort_order: 17 },
  { id: 9108, name: '费用列表', path: '/finance/expenses', component: 'finance/expenses/Expenses', permission: 'finance:expenses:view', parent_id: 9, sort_order: 18 },
  { id: 9001, name: '价格查看', path: '', component: '', permission: 'finance:price:view', type: 2, visible: 0, parent_id: 9, sort_order: 900 },
  { id: 9002, name: '价格维护', path: '', component: '', permission: 'finance:price:update', type: 2, visible: 0, parent_id: 9, sort_order: 901 },
  { id: 9003, name: '价格导出', path: '', component: '', permission: 'finance:price:export', type: 2, visible: 0, parent_id: 9, sort_order: 902 },
  { id: 9004, name: '采购价格查看', path: '', component: '', permission: 'purchase:price:view', type: 2, visible: 0, parent_id: 6, sort_order: 900 },
  { id: 9005, name: '采购价格维护', path: '', component: '', permission: 'purchase:price:update', type: 2, visible: 0, parent_id: 6, sort_order: 901 },
  { id: 9006, name: '采购价格导出', path: '', component: '', permission: 'purchase:price:export', type: 2, visible: 0, parent_id: 6, sort_order: 902 },
  { id: 9007, name: '销售价格查看', path: '', component: '', permission: 'sales:price:view', type: 2, visible: 0, parent_id: 7, sort_order: 900 },
  { id: 9008, name: '销售价格维护', path: '', component: '', permission: 'sales:price:update', type: 2, visible: 0, parent_id: 7, sort_order: 901 },
  { id: 9009, name: '销售价格导出', path: '', component: '', permission: 'sales:price:export', type: 2, visible: 0, parent_id: 7, sort_order: 902 },
  { id: 9010, name: '库存金额查看', path: '', component: '', permission: 'inventory:value:view', type: 2, visible: 0, parent_id: 5, sort_order: 900 },
  { id: 9011, name: '库存金额维护', path: '', component: '', permission: 'inventory:value:update', type: 2, visible: 0, parent_id: 5, sort_order: 901 },
  { id: 9012, name: '库存金额导出', path: '', component: '', permission: 'inventory:value:export', type: 2, visible: 0, parent_id: 5, sort_order: 902 },

  { id: 101, name: '设备台账', path: '/equipment/list', component: 'equipment/EquipmentList', permission: 'equipment:list', parent_id: 10, sort_order: 1 },
  { id: 102, name: '设备维护', path: '/equipment/maintenance', component: 'equipment/Maintenance', permission: 'equipment:maintenance', parent_id: 10, sort_order: 2 },
  { id: 103, name: '设备点检', path: '/equipment/inspection', component: 'equipment/Inspection', permission: 'equipment:inspection', parent_id: 10, sort_order: 3 },
  { id: 104, name: '设备状态', path: '/equipment/status', component: 'equipment/Status', permission: 'equipment:status', parent_id: 10, sort_order: 4 },

  { id: 111, name: '员工管理', path: '/hr/employees', component: 'hr/Employees', permission: 'hr:employees', parent_id: 11, sort_order: 1 },
  { id: 112, name: '考勤管理', path: '/hr/attendance', component: 'hr/Attendance', permission: 'hr:attendance', parent_id: 11, sort_order: 2 },
  { id: 113, name: '薪资管理', path: '/hr/salary', component: 'hr/Salary', permission: 'hr:salary', parent_id: 11, sort_order: 3 },
  { id: 114, name: '绩效管理', path: '/hr/performance', component: 'hr/Performance', permission: 'hr:performance', parent_id: 11, sort_order: 4 },

  { id: 121, name: '用户管理', path: '/system/users', component: 'system/Users', permission: 'system:users', parent_id: 12, sort_order: 1 },
  { id: 122, name: '部门管理', path: '/system/departments', component: 'system/Departments', permission: 'system:departments', parent_id: 12, sort_order: 2 },
  { id: 123, name: '权限设置', path: '/system/permissions', component: 'system/Permissions', permission: 'system:permissions', parent_id: 12, sort_order: 3 },
  { id: 124, name: '通知中心', path: '/system/notifications', component: 'system/Notifications', permission: 'system:notifications', parent_id: 12, sort_order: 4 },
  { id: 125, name: '业务类型', path: '/system/business-types', component: 'system/BusinessTypes', permission: 'system:business-types', parent_id: 12, sort_order: 5 },
  { id: 126, name: '打印设置', path: '/system/print', component: 'system/Print', permission: 'system:print', parent_id: 12, sort_order: 6 },
  { id: 127, name: '技术通讯', path: '/system/technical-communication', component: 'system/TechnicalCommunication', permission: 'system:tech-comm', parent_id: 12, sort_order: 7 },
  { id: 128, name: '审批工作流', path: '/system/workflow', component: 'system/WorkflowManagement', permission: 'system:workflow', parent_id: 12, sort_order: 8 },
  { id: 129, name: '编码规则', path: '/system/coding-rules', component: 'system/CodingRules', permission: 'system:settings', parent_id: 12, sort_order: 9 },
  { id: 1210, name: '文档管理', path: '/system/documents', component: 'system/DocumentManagement', permission: 'system:documents', parent_id: 12, sort_order: 10 },
  { id: 1211, name: '业务告警', path: '/system/business-alerts', component: 'system/BusinessAlerts', permission: 'system:business-alerts', parent_id: 12, sort_order: 11 },
];

async function insertWithPreferredId(knex, tableName, record) {
  const payload = {
    ...record,
    status: record.status ?? 1,
    created_at: knex.fn.now(),
  };

  if (payload.id) {
    const idTaken = await knex(tableName).where({ id: payload.id }).first();
    if (idTaken) {
      delete payload.id;
    }
  }

  const [id] = await knex(tableName).insert(payload);
  return payload.id || id;
}

async function ensureCoreRoles(knex) {
  let created = 0;

  for (const role of CORE_ROLES) {
    const existing = await knex('roles').where({ code: role.code }).first();
    if (!existing) {
      await insertWithPreferredId(knex, 'roles', role);
      created += 1;
    }
  }

  if (created > 0) {
    console.log(`[Seed] Core roles initialized: ${created}`);
  }
}

async function ensureCoreMenus(knex) {
  let created = 0;
  const preferredIdMap = new Map();

  for (const menu of CORE_MENUS) {
    const existing = await knex('menus')
      .where(builder => {
        builder.where({ permission: menu.permission });
        if (menu.path) {
          builder.orWhere({ path: menu.path });
        }
      })
      .first();

    if (existing) {
      preferredIdMap.set(menu.id, existing.id);
      continue;
    }

    const parentId = menu.parent_id ? preferredIdMap.get(menu.parent_id) || menu.parent_id : null;
    const id = await insertWithPreferredId(knex, 'menus', {
      ...menu,
      parent_id: parentId,
      type: menu.type ?? 1,
      visible: menu.visible ?? 1,
    });
    preferredIdMap.set(menu.id, id);
    created += 1;
  }

  if (created > 0) {
    console.log(`[Seed] Core menus initialized: ${created}`);
  }
}

async function ensureAdminUser(knex) {
  const bcrypt = require('bcryptjs');
  const testPassword = process.env.NODE_ENV === 'test'
    ? process.env.TEST_ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD || '123456'
    : null;

  let adminUser = await knex('users').where({ username: 'admin' }).first();
  if (!adminUser) {
    const passwordHash = process.env.DEFAULT_ADMIN_PASSWORD_HASH;
    const plainPassword = process.env.DEFAULT_ADMIN_PASSWORD;
    if (!passwordHash && !plainPassword && process.env.NODE_ENV === 'production') {
      throw new Error('DEFAULT_ADMIN_PASSWORD or DEFAULT_ADMIN_PASSWORD_HASH is required for production seeding');
    }

    const generatedPassword = !passwordHash && !plainPassword && !testPassword
      ? `Dev-${require('crypto').randomUUID()}`
      : null;
    const bcryptHash = passwordHash || await bcrypt.hash(testPassword || plainPassword || generatedPassword, 10);

    const [adminId] = await knex('users').insert({
      username: 'admin',
      password: bcryptHash,
      real_name: '系统管理员',
      email: 'admin@erp.local',
      role: 'admin',
      status: 1,
      created_at: knex.fn.now(),
    });
    adminUser = { id: adminId };
    console.log('[Seed] Default admin user created. Configure initial password with DEFAULT_ADMIN_PASSWORD or DEFAULT_ADMIN_PASSWORD_HASH.');
    if (generatedPassword) {
      console.log(`[Seed] Generated one-time development admin password: ${generatedPassword}`);
    }
  } else if (testPassword) {
    await knex('users')
      .where({ id: adminUser.id })
      .update({ password: await bcrypt.hash(testPassword, 10), updated_at: knex.fn.now() });
  }

  const adminRole = await knex('roles').where({ code: 'admin' }).first();
  if (adminRole) {
    const exists = await knex('user_roles')
      .where({ user_id: adminUser.id, role_id: adminRole.id })
      .first();
    if (!exists) {
      await knex('user_roles').insert({
        user_id: adminUser.id,
        role_id: adminRole.id,
        created_at: knex.fn.now(),
      });
    }
  }
}

async function grantAdminMenus(knex) {
  const adminRole = await knex('roles').where({ code: 'admin' }).first();
  if (!adminRole) return;

  const menus = await knex('menus').select('id');
  for (const menu of menus) {
    const exists = await knex('role_menus')
      .where({ role_id: adminRole.id, menu_id: menu.id })
      .first();
    if (!exists) {
      await knex('role_menus').insert({
        role_id: adminRole.id,
        menu_id: menu.id,
        created_at: knex.fn.now(),
      });
    }
  }
}

async function ensureOperationalFinanceActions(knex) {
  const actions = [
    {
      parentPermission: 'finance:entries:view',
      permission: 'finance:entries:update',
      name: '编辑凭证',
      roleCodes: ['admin', 'system_admin', 'finance_manager', 'accountant'],
    },
    {
      parentPermission: 'finance:entries:view',
      permission: 'finance:entries:approve',
      name: '审核凭证',
      roleCodes: ['admin', 'system_admin', 'finance_manager'],
    },
    {
      parentPermission: 'finance:entries:view',
      permission: 'finance:entries:delete',
      name: '删除凭证',
      roleCodes: ['admin', 'system_admin', 'finance_manager'],
    },
    {
      parentPermission: 'finance:closing:view',
      permission: 'finance:closing:execute',
      name: '执行结账',
      roleCodes: ['admin', 'system_admin', 'finance_manager'],
    },
  ];

  for (const action of actions) {
    const parent = await knex('menus').where({ permission: action.parentPermission }).first();
    if (!parent) continue;

    let menu = await knex('menus').where({ permission: action.permission }).first();
    if (menu) {
      await knex('menus').where({ id: menu.id }).update({
        parent_id: parent.id,
        name: action.name,
        type: 2,
        visible: 1,
        status: 1,
        updated_at: knex.fn.now(),
      });
    } else {
      const [menuId] = await knex('menus').insert({
        parent_id: parent.id,
        name: action.name,
        path: '',
        component: '',
        icon: '',
        permission: action.permission,
        type: 2,
        visible: 1,
        status: 1,
        sort_order: 900,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });
      menu = { id: menuId };
    }

    const roles = await knex('roles').select('id').whereIn('code', action.roleCodes);
    for (const role of roles) {
      for (const menuId of [parent.id, menu.id]) {
        const exists = await knex('role_menus')
          .where({ role_id: role.id, menu_id: menuId })
          .first();
        if (!exists) {
          await knex('role_menus').insert({
            role_id: role.id,
            menu_id: menuId,
            created_at: knex.fn.now(),
          });
        }
      }
    }
  }
}

async function syncPermissionSsot(knex) {
  const requiredTables = ['permissions', 'role_permissions', 'menus', 'role_menus'];
  for (const table of requiredTables) {
    if (!(await knex.schema.hasTable(table))) return;
  }

  await knex.raw(`
    INSERT INTO permissions (code, name, module, status, source, created_at, updated_at)
    SELECT DISTINCT m.permission,
           COALESCE(NULLIF(m.name, ''), m.permission),
           SUBSTRING_INDEX(m.permission, ':', 1),
           1,
           'menu',
           NOW(),
           NOW()
      FROM menus m
     WHERE m.permission IS NOT NULL AND m.permission <> ''
    ON DUPLICATE KEY UPDATE
      status = 1,
      updated_at = NOW()
  `);

  if (await knex.schema.hasColumn('menus', 'permission_id')) {
    await knex.raw(`
      UPDATE menus m
      JOIN permissions p ON BINARY p.code = BINARY m.permission
         SET m.permission_id = p.id
       WHERE m.permission IS NOT NULL AND m.permission <> ''
    `);
  }

  await knex.raw(`
    INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
    SELECT DISTINCT rm.role_id, p.id, NOW()
      FROM role_menus rm
      JOIN menus m ON m.id = rm.menu_id
      JOIN permissions p ON BINARY p.code = BINARY m.permission
     WHERE m.permission IS NOT NULL AND m.permission <> ''
       AND COALESCE(m.status, 1) = 1
  `);
}

exports.seed = async function seed(knex) {
  await ensureCoreRoles(knex);
  await ensureAdminUser(knex);
  await ensureCoreMenus(knex);
  await ensureOperationalFinanceActions(knex);
  await grantAdminMenus(knex);
  await syncPermissionSsot(knex);

  const hasCostSettings = await knex.schema.hasTable('cost_settings');
  if (hasCostSettings) {
    const activeCostSetting = await knex('cost_settings').where({ is_active: true }).first();
    if (!activeCostSetting) {
      await knex('cost_settings').insert({
        setting_name: '默认成本配置',
        overhead_rate: 0.5,
        labor_rate: 50.00,
        costing_method: 'weighted_average',
        is_active: true,
        description: '系统默认成本核算配置',
      });
      console.log('[Seed] Default cost setting created');
    }
  }
};
