// Default navigation uses stable paths; migration order cannot change menu identity.
const CORE_MENUS = [
  {name: "仪表盘",path: "/",component: "dashboard/Dashboard",icon: "Dashboard",permission: "dashboard",type: 1,sort_order: 1,parentPath: null},
  {name: "数据概览",path: "/dataoverview",component: "",icon: "DataAnalysis",permission: "dataoverview",type: 0,sort_order: 2,parentPath: null},
  {name: "生产概览",path: "/dataoverview/production",component: "dataOverview/ProductionDashboard",permission: "dataoverview:production",sort_order: 1,parentPath: "/dataoverview"},
  {name: "库存概览",path: "/dataoverview/inventory",component: "dataOverview/InventoryDashboard",permission: "dataoverview:inventory",sort_order: 2,parentPath: "/dataoverview"},
  {name: "销售概览",path: "/dataoverview/sales",component: "dataOverview/SalesDashboard",permission: "dataoverview:sales",sort_order: 3,parentPath: "/dataoverview"},
  {name: "财务概览",path: "/dataoverview/finance",component: "dataOverview/FinanceDashboard",permission: "dataoverview:finance",sort_order: 4,parentPath: "/dataoverview"},
  {name: "质量概览",path: "/dataoverview/quality",component: "dataOverview/QualityDashboard",permission: "dataoverview:quality",sort_order: 5,parentPath: "/dataoverview"},
  {name: "采购概览",path: "/dataoverview/purchase",component: "dataOverview/PurchaseDashboard",permission: "dataoverview:purchase",sort_order: 6,parentPath: "/dataoverview"},
  {name: "生产管理",path: "/production",component: "",icon: "SetUp",permission: "production",type: 0,sort_order: 3,parentPath: null},
  {name: "基础数据",path: "/basedata",component: "",icon: "Collection",permission: "basedata",type: 0,sort_order: 4,parentPath: null},
  {name: "库存管理",path: "/inventory",component: "",icon: "Box",permission: "inventory",type: 0,sort_order: 5,parentPath: null},
  {name: "采购管理",path: "/purchase",component: "",icon: "ShoppingCart",permission: "purchase",type: 0,sort_order: 6,parentPath: null},
  {name: "销售管理",path: "/sales",component: "",icon: "TrendCharts",permission: "sales",type: 0,sort_order: 7,parentPath: null},
  {name: "质量管理",path: "/quality",component: "",icon: "CircleCheck",permission: "quality",type: 0,sort_order: 8,parentPath: null},
  {name: "财务管理",path: "/finance",component: "",icon: "Money",permission: "finance",type: 0,sort_order: 9,parentPath: null},
  {name: "设备管理",path: "/equipment",component: "",icon: "Monitor",permission: "equipment",type: 0,sort_order: 10,parentPath: null},
  {name: "人力资源",path: "/hr",component: "",icon: "UserFilled",permission: "hr",type: 0,sort_order: 11,parentPath: null},
  {name: "系统管理",path: "/system",component: "",icon: "Setting",permission: "system",type: 0,sort_order: 12,parentPath: null},
  {name: "生产计划",path: "/production/plan",component: "production/ProductionPlan",permission: "production:plans",sort_order: 1,parentPath: "/production"},
  {name: "生产任务",path: "/production/task",component: "production/ProductionTask",permission: "production:tasks",sort_order: 2,parentPath: "/production"},
  {name: "生产过程",path: "/production/process",component: "production/ProductionProcess",permission: "production:process",sort_order: 3,parentPath: "/production"},
  {name: "生产报工",path: "/production/report",component: "production/ProductionReport",permission: "production:reports",sort_order: 4,parentPath: "/production"},
  {name: "生产数据看板",path: "/production/data-view",component: "production/ProductionDataView",permission: "production:data-view",sort_order: 8,parentPath: "/production"},
  {name: "缺料统计",path: "/production/material-shortage",component: "production/MaterialShortage",permission: "production:shortage",sort_order: 5,parentPath: "/production"},
  {name: "MRP计划",path: "/production/mrp",component: "production/MRPPlanning",permission: "production:mrp",sort_order: 7,parentPath: "/production"},
  {name: "生产甘特图",path: "/production/gantt",component: "production/ProductionGantt",permission: "production:gantt",sort_order: 9,parentPath: "/production"},
  {name: "设备监控",path: "/production/equipment-monitoring",component: "production/EquipmentMonitoring",permission: "production:equipment",sort_order: 6,parentPath: "/production"},
  {name: "物料管理",path: "/basedata/materials",component: "baseData/Materials",permission: "basedata:materials",sort_order: 1,parentPath: "/basedata"},
  {name: "BOM管理",path: "/basedata/boms",component: "baseData/Boms",permission: "basedata:boms",sort_order: 2,parentPath: "/basedata"},
  {name: "客户管理",path: "/basedata/customers",component: "baseData/Customers",permission: "basedata:customers",sort_order: 3,parentPath: "/basedata"},
  {name: "供应商管理",path: "/basedata/suppliers",component: "baseData/Suppliers",permission: "basedata:suppliers",sort_order: 4,parentPath: "/basedata"},
  {name: "产品大类",path: "/basedata/categories",component: "baseData/Categories",permission: "basedata:categories",sort_order: 5,parentPath: "/basedata"},
  {name: "单位管理",path: "/basedata/units",component: "baseData/Units",permission: "basedata:units",sort_order: 6,parentPath: "/basedata"},
  {name: "库位管理",path: "/basedata/locations",component: "baseData/Locations",permission: "basedata:locations",sort_order: 7,parentPath: "/basedata"},
  {name: "工序模板",path: "/basedata/process-templates",component: "baseData/ProcessTemplates",permission: "basedata:processtemplates",sort_order: 8,parentPath: "/basedata"},
  {name: "物料类型",path: "/basedata/product-categories",component: "baseData/ProductCategories",permission: "basedata:productcategories",sort_order: 9,parentPath: "/basedata"},
  {name: "工程变更",path: "/basedata/ecn",component: "baseData/ECNManagement",permission: "basedata:ecn",sort_order: 10,parentPath: "/basedata"},
  {name: "库存查询",path: "/inventory/stock",component: "inventory/InventoryStock",permission: "inventory:stock",sort_order: 1,parentPath: "/inventory"},
  {name: "入库管理",path: "/inventory/inbound",component: "inventory/InventoryInbound",permission: "inventory:inbound",sort_order: 2,parentPath: "/inventory"},
  {name: "出库管理",path: "/inventory/outbound",component: "inventory/InventoryOutbound",permission: "inventory:outbound",sort_order: 3,parentPath: "/inventory"},
  {name: "库存调拨",path: "/inventory/transfer",component: "inventory/InventoryTransfer",permission: "inventory:transfer",sort_order: 4,parentPath: "/inventory"},
  {name: "库存盘点",path: "/inventory/check",component: "inventory/InventoryCheck",permission: "inventory:check",sort_order: 5,parentPath: "/inventory"},
  {name: "手工出入库",path: "/inventory/manual-transaction",component: "inventory/ManualTransaction",permission: "inventory:manual-transaction",sort_order: 6,parentPath: "/inventory"},
  {name: "库存报表",path: "/inventory/report",component: "inventory/InventoryReport",permission: "inventory:report",sort_order: 7,parentPath: "/inventory"},
  {name: "库存流水",path: "/inventory/transaction",component: "inventory/InventoryTransaction",permission: "inventory:transaction",sort_order: 8,parentPath: "/inventory"},
  {name: "采购申请",path: "/purchase/requisitions",component: "purchase/PurchaseRequisitions",permission: "purchase:requisitions",sort_order: 1,parentPath: "/purchase"},
  {name: "采购订单",path: "/purchase/orders",component: "purchase/PurchaseOrders",permission: "purchase:orders",sort_order: 2,parentPath: "/purchase"},
  {name: "采购入库",path: "/purchase/receipts",component: "purchase/PurchaseReceipts",permission: "purchase:receipts",sort_order: 3,parentPath: "/purchase"},
  {name: "采购退货",path: "/purchase/returns",component: "purchase/PurchaseReturns",permission: "purchase:returns",sort_order: 4,parentPath: "/purchase"},
  {name: "委外加工",path: "/purchase/processing",component: "purchase/OutsourcedProcessing",permission: "purchase:processing",sort_order: 5,parentPath: "/purchase"},
  {name: "委外入库",path: "/purchase/processing-receipts",component: "purchase/OutsourcedReceipts",permission: "purchase:processing-receipts",sort_order: 6,parentPath: "/purchase"},
  {name: "采购历史",path: "/purchase/history",component: "purchase/PurchaseHistory",permission: "purchase:history",sort_order: 7,parentPath: "/purchase"},
  {name: "销售订单",path: "/sales/orders",component: "sales/SalesOrders",permission: "sales:orders",sort_order: 1,parentPath: "/sales"},
  {name: "销售出库",path: "/sales/outbound",component: "sales/SalesOutbound",permission: "sales:outbound",sort_order: 2,parentPath: "/sales"},
  {name: "销售退货",path: "/sales/returns",component: "sales/SalesReturns",permission: "sales:returns",sort_order: 3,parentPath: "/sales"},
  {name: "销售换货",path: "/sales/exchanges",component: "sales/SalesExchanges",permission: "sales:exchanges",sort_order: 4,parentPath: "/sales"},
  {name: "报价单统计",path: "/sales/quotations",component: "sales/SalesQuotations",permission: "sales:quotations",sort_order: 5,parentPath: "/sales"},
  {name: "装箱单",path: "/sales/packing-lists",component: "sales/PackingLists",permission: "sales:packing-lists",sort_order: 6,parentPath: "/sales"},
  {name: "交付统计",path: "/sales/delivery-stats",component: "sales/DeliveryStats",permission: "sales:delivery-stats",sort_order: 7,parentPath: "/sales"},
  {name: "合同管理",path: "/sales/contracts",component: "sales/ContractManagement",permission: "contract:view",sort_order: 8,parentPath: "/sales"},
  {name: "来料检验",path: "/quality/incoming",component: "quality/IncomingInspection",permission: "quality:incoming",sort_order: 1,parentPath: "/quality"},
  {name: "过程检验",path: "/quality/process",component: "quality/ProcessInspection",permission: "quality:process",sort_order: 2,parentPath: "/quality"},
  {name: "成品检验",path: "/quality/final",component: "quality/FinalInspection",permission: "quality:final",sort_order: 3,parentPath: "/quality"},
  {name: "检验模板",path: "/quality/templates",component: "quality/InspectionTemplates",permission: "quality:templates",sort_order: 4,parentPath: "/quality"},
  {name: "不合格品",path: "/quality/nonconforming",component: "quality/NonconformingProducts",permission: "quality:nonconforming",sort_order: 5,parentPath: "/quality"},
  {name: "8D报告",path: "/quality/8d-reports",component: "quality/EightDReport",permission: "quality:8d",sort_order: 6,parentPath: "/quality"},
  {name: "查看8D报告",path: "",component: "",permission: "quality:8d:view",type: 2,visible: 0,sort_order: 1,parentPath: "/quality/8d-reports"},
  {name: "创建8D报告",path: "",component: "",permission: "quality:8d:create",type: 2,visible: 0,sort_order: 2,parentPath: "/quality/8d-reports"},
  {name: "维护8D报告",path: "",component: "",permission: "quality:8d:update",type: 2,visible: 0,sort_order: 3,parentPath: "/quality/8d-reports"},
  {name: "删除8D报告",path: "",component: "",permission: "quality:8d:delete",type: 2,visible: 0,sort_order: 4,parentPath: "/quality/8d-reports"},
  {name: "首件检验",path: "/quality/first-article",component: "quality/FirstArticleInspection",permission: "quality:first-article",sort_order: 2,parentPath: "/quality"},
  {name: "换货单",path: "/quality/replacement-orders",component: "quality/ReplacementOrders",permission: "quality:replacement",sort_order: 7,parentPath: "/quality"},
  {name: "返工任务",path: "/quality/rework-tasks",component: "quality/ReworkTasks",permission: "quality:rework",sort_order: 8,parentPath: "/quality"},
  {name: "报废记录",path: "/quality/scrap-records",component: "quality/ScrapRecords",permission: "quality:scrap",sort_order: 9,parentPath: "/quality"},
  {name: "AQL标准",path: "/quality/aql-standards",component: "quality/AQLStandards",permission: "quality:aql",sort_order: 10,parentPath: "/quality"},
  {name: "质量统计",path: "/quality/statistics",component: "quality/QualityStatistics",permission: "quality:statistics",sort_order: 11,parentPath: "/quality"},
  {name: "批次追溯",path: "/quality/traceability",component: "quality/components/UnifiedTraceability",permission: "quality:traceability",sort_order: 12,parentPath: "/quality"},
  {name: "量具管理",path: "/quality/gauges",component: "quality/GaugeManagement",permission: "quality:gauges",sort_order: 13,parentPath: "/quality"},
  {name: "SPC控制图",path: "/quality/spc",component: "quality/SPCControlChart",permission: "quality:spc",sort_order: 14,parentPath: "/quality"},
  {name: "供应商质量",path: "/quality/supplier-quality",component: "quality/SupplierQualityScorecard",permission: "quality:supplier-quality",sort_order: 15,parentPath: "/quality"},
  {name: "会计科目",path: "/finance/gl/accounts",component: "finance/gl/Accounts",permission: "finance:accounts:view",sort_order: 1,parentPath: "/finance"},
  {name: "会计凭证",path: "/finance/gl/entries",component: "finance/gl/Entries",permission: "finance:entries:view",sort_order: 2,parentPath: "/finance"},
  {name: "会计期间",path: "/finance/gl/periods",component: "finance/gl/Periods",permission: "finance:periods:view",sort_order: 3,parentPath: "/finance"},
  {name: "应收管理",path: "/finance/ar/invoices",component: "finance/ar/Invoices",permission: "finance:ar:view",sort_order: 4,parentPath: "/finance"},
  {name: "应收待结算",path: "/finance/ar/settlement",component: "finance/ar/Settlement",permission: "finance:ar:view",sort_order: 41,parentPath: "/finance"},
  {name: "应付管理",path: "/finance/ap/invoices",component: "finance/ap/Invoices",permission: "finance:ap:view",sort_order: 5,parentPath: "/finance"},
  {name: "应付待结算",path: "/finance/ap/settlement",component: "finance/ap/Settlement",permission: "finance:ap:view",sort_order: 51,parentPath: "/finance"},
  {name: "出纳管理",path: "/finance/cash/accounts",component: "finance/cash/BankAccounts",permission: "finance:cash:view",sort_order: 6,parentPath: "/finance"},
  {name: "固定资产",path: "/finance/assets/list",component: "finance/assets/AssetsList",permission: "finance:assets:view",sort_order: 7,parentPath: "/finance"},
  {name: "财务报表",path: "/finance/reports/balance-sheet",component: "finance/reports/BalanceSheet",permission: "finance:reports:view",sort_order: 8,parentPath: "/finance"},
  {name: "财务设置",path: "/finance/settings",component: "finance/settings/FinanceSettings",permission: "finance:settings:view",sort_order: 9,parentPath: "/finance"},
  {name: "期末结账",path: "/finance/gl/period-closing",component: "finance/gl/PeriodClosing",permission: "finance:closing:view",sort_order: 10,parentPath: "/finance"},
  {name: "收款凭证",path: "/finance/gl/entries/receipt",component: "finance/gl/entries/ReceiptEntry",permission: "finance:entries:create",sort_order: 1,parentPath: "/finance/gl/entries",visible: 0},
  {name: "付款凭证",path: "/finance/gl/entries/payment",component: "finance/gl/entries/PaymentEntry",permission: "finance:entries:create",sort_order: 2,parentPath: "/finance/gl/entries",visible: 0},
  {name: "转账凭证",path: "/finance/gl/entries/transfer",component: "finance/gl/entries/TransferEntry",permission: "finance:entries:create",sort_order: 3,parentPath: "/finance/gl/entries",visible: 0},
  {name: "记账凭证",path: "/finance/gl/entries/general",component: "finance/gl/entries/GeneralEntry",permission: "finance:entries:create",sort_order: 4,parentPath: "/finance/gl/entries",visible: 0},
  {name: "银行对账",path: "/finance/cash/reconciliation",component: "finance/cash/Reconciliation",permission: "finance:cash:reconcile",sort_order: 10,parentPath: "/finance/cash/accounts"},
  {name: "标准现金流量表",path: "/finance/reports/standard-cash-flow",component: "finance/reports/StandardCashFlow",permission: "finance:reports:standard-cash-flow:view",sort_order: 10,parentPath: "/finance/reports/balance-sheet"},
  {name: "汇率设置",path: "/finance/settings/exchange-rates",component: "finance/settings/ExchangeRates",permission: "finance:exchange-rates:view",sort_order: 10,parentPath: "/finance/settings"},
  {name: "财务自动化",path: "/finance/settings?tab=automation",component: "finance/settings/FinanceSettings",permission: "finance:automation:view",sort_order: 11,parentPath: "/finance"},
  {name: "税务发票",path: "/finance/tax/invoices",component: "finance/tax/TaxInvoices",permission: "finance:tax:view",sort_order: 12,parentPath: "/finance"},
  {name: "预算列表",path: "/finance/budget/list",component: "finance/budget/BudgetList",permission: "finance:budgets:view",sort_order: 13,parentPath: "/finance"},
  {name: "新增预算",path: "/finance/budget/edit",component: "finance/budget/BudgetEdit",permission: "finance:budgets:create",sort_order: 14,parentPath: "/finance",visible: 0},
  {name: "编辑预算",path: "/finance/budget/edit/:id",component: "finance/budget/BudgetEdit",permission: "finance:budgets:update",sort_order: 15,parentPath: "/finance",visible: 0},
  {name: "成本驾驶舱",path: "/finance/cost/dashboard",component: "finance/cost/CostDashboard",permission: "finance:cost:view",sort_order: 16,parentPath: "/finance"},
  {name: "产品定价",path: "/finance/pricing",component: "finance/pricing/ProductPricing",permission: "finance:pricing:view",sort_order: 17,parentPath: "/finance"},
  {name: "费用列表",path: "/finance/expenses",component: "finance/expenses/Expenses",permission: "finance:expenses:view",sort_order: 18,parentPath: "/finance"},
  {name: "价格查看",path: "",component: "",permission: "finance:price:view",type: 2,visible: 0,sort_order: 900,parentPath: "/finance"},
  {name: "价格维护",path: "",component: "",permission: "finance:price:update",type: 2,visible: 0,sort_order: 901,parentPath: "/finance"},
  {name: "价格导出",path: "",component: "",permission: "finance:price:export",type: 2,visible: 0,sort_order: 902,parentPath: "/finance"},
  {name: "采购价格查看",path: "",component: "",permission: "purchase:price:view",type: 2,visible: 0,sort_order: 900,parentPath: "/purchase"},
  {name: "采购价格维护",path: "",component: "",permission: "purchase:price:update",type: 2,visible: 0,sort_order: 901,parentPath: "/purchase"},
  {name: "采购价格导出",path: "",component: "",permission: "purchase:price:export",type: 2,visible: 0,sort_order: 902,parentPath: "/purchase"},
  {name: "销售价格查看",path: "",component: "",permission: "sales:price:view",type: 2,visible: 0,sort_order: 900,parentPath: "/sales"},
  {name: "销售价格维护",path: "",component: "",permission: "sales:price:update",type: 2,visible: 0,sort_order: 901,parentPath: "/sales"},
  {name: "销售价格导出",path: "",component: "",permission: "sales:price:export",type: 2,visible: 0,sort_order: 902,parentPath: "/sales"},
  {name: "库存金额查看",path: "",component: "",permission: "inventory:value:view",type: 2,visible: 0,sort_order: 900,parentPath: "/inventory"},
  {name: "库存金额维护",path: "",component: "",permission: "inventory:value:update",type: 2,visible: 0,sort_order: 901,parentPath: "/inventory"},
  {name: "库存金额导出",path: "",component: "",permission: "inventory:value:export",type: 2,visible: 0,sort_order: 902,parentPath: "/inventory"},
  {name: "设备台账",path: "/equipment/list",component: "equipment/EquipmentList",permission: "equipment:list",sort_order: 1,parentPath: "/equipment"},
  {name: "设备维护",path: "/equipment/maintenance",component: "equipment/Maintenance",permission: "equipment:maintenance",sort_order: 2,parentPath: "/equipment"},
  {name: "设备点检",path: "/equipment/inspection",component: "equipment/Inspection",permission: "equipment:inspection",sort_order: 3,parentPath: "/equipment"},
  {name: "设备状态",path: "/equipment/status",component: "equipment/Status",permission: "equipment:status",sort_order: 4,parentPath: "/equipment"},
  {name: "员工管理",path: "/hr/employees",component: "hr/Employees",permission: "hr:employees",sort_order: 1,parentPath: "/hr"},
  {name: "考勤管理",path: "/hr/attendance",component: "hr/Attendance",permission: "hr:attendance",sort_order: 2,parentPath: "/hr"},
  {name: "薪资管理",path: "/hr/salary",component: "hr/Salary",permission: "hr:salary",sort_order: 3,parentPath: "/hr"},
  {name: "绩效管理",path: "/hr/performance",component: "hr/Performance",permission: "hr:performance",sort_order: 4,parentPath: "/hr"},
  {name: "用户管理",path: "/system/users",component: "system/Users",permission: "system:users",sort_order: 1,parentPath: "/system"},
  {name: "部门管理",path: "/system/departments",component: "system/Departments",permission: "system:departments",sort_order: 2,parentPath: "/system"},
  {name: "权限设置",path: "/system/permissions",component: "system/Permissions",permission: "system:permissions",sort_order: 3,parentPath: "/system"},
  {name: "通知中心",path: "/system/notifications",component: "system/Notifications",permission: "system:notifications",sort_order: 4,parentPath: "/system"},
  {name: "业务类型",path: "/system/business-types",component: "system/BusinessTypes",permission: "system:business-types",sort_order: 5,parentPath: "/system"},
  {name: "打印设置",path: "/system/print",component: "system/Print",permission: "system:print",sort_order: 6,parentPath: "/system"},
  {name: "技术通讯",path: "/system/technical-communication",component: "system/TechnicalCommunication",permission: "system:tech-comm",sort_order: 7,parentPath: "/system"},
  {name: "审批工作流",path: "/system/workflow",component: "system/WorkflowManagement",permission: "system:workflow",sort_order: 8,parentPath: "/system"},
  {name: "编码规则",path: "/system/coding-rules",component: "system/CodingRules",permission: "system:settings",sort_order: 9,parentPath: "/system"},
  {name: "文档管理",path: "/system/documents",component: "system/DocumentManagement",permission: "system:documents",sort_order: 10,parentPath: "/system"},
  {name: "业务告警",path: "/system/business-alerts",component: "system/BusinessAlerts",permission: "system:business-alerts",sort_order: 11,parentPath: "/system"},
  {name: "通知规则",path: "/system/notification-rules",component: "system/NotificationRules",permission: "system:notification-rules",sort_order: 12,parentPath: "/system"},
];

const menuModule = menu => {
  const match = /^\/([^/?#]+)/.exec(menu.path || '');
  return match ? match[1] : String(menu.permission || '').split(':')[0];
};

// Menu identity is its route (or permission for an action), never an auto ID or
// a shared view permission. Finance pages deliberately share permissions.
async function ensureCoreMenus(knex) {
  return knex.transaction(async trx => {
    const rows = await trx('menus').select('*').orderBy('id');
    const byPath = new Map(rows.filter(row => row.path).map(row => [row.path, row]));
    let created = 0;
    const newRows = [];
    for (const { parentPath, ...definition } of CORE_MENUS) {
      let existing = definition.path
        ? byPath.get(definition.path)
        : rows.find(row => Number(row.type) === 2 && row.permission === definition.permission);
      if (!existing) {
        const parent = parentPath ? byPath.get(parentPath) : null;
        if (parentPath && !parent) throw new Error('Missing menu parent: ' + parentPath);
        const payload = {
          ...definition, parent_id: parent?.id || null,
          type: definition.type ?? 1, visible: definition.visible ?? 1,
          status: 1, created_at: trx.fn.now(), updated_at: trx.fn.now(),
        };
        const [id] = await trx('menus').insert(payload);
        existing = { ...payload, id };
        rows.push(existing);
        if (existing.path) byPath.set(existing.path, existing);
        newRows.push(existing);
        created++;
      }
    }

    const repairs = findMenuHierarchyRepairs(rows);
    for (const repair of repairs) {
      const { id, ...changes } = repair;
      await trx('menus').where({ id }).update({ ...changes, updated_at: trx.fn.now() });
    }

    // New routes inherit only roles already holding their exact permission.
    // Existing role assignments and user-customized menus are left intact.
    for (const menu of newRows) {
      const roles = await trx('roles as r').distinct('r.id').leftJoin('role_permissions as rp', 'rp.role_id', 'r.id')
        .leftJoin('permissions as p', 'p.id', 'rp.permission_id')
        .where(builder => builder.where('r.is_super_admin', 1).orWhere('r.code', 'admin').orWhere('p.code', menu.permission));
      for (const role of roles) {
        await trx('role_menus').insert({ role_id: role.id, menu_id: menu.id }).onConflict(['role_id', 'menu_id']).ignore();
      }
    }
    return { created, repaired: repairs.length };
  });
}

function findMenuHierarchyRepairs(rows) {
  const byId = new Map(rows.map(row => [Number(row.id), row]));
  const byPath = new Map(rows.filter(row => row.path).map(row => [row.path, row]));
  const defaultsByPath = new Map(CORE_MENUS.filter(menu => menu.path).map(menu => [menu.path, menu]));
  const roots = new Map(CORE_MENUS.filter(menu => menu.type === 0 && !menu.parentPath)
    .map(menu => [menuModule(menu), byPath.get(menu.path)]));
  const repairs = [];

  for (const menu of rows) {
    const spec = defaultsByPath.get(menu.path);
    const root = roots.get(menuModule(menu));
    const expectedParent = spec?.parentPath ? byPath.get(spec.parentPath) : root;
    const changes = {};
    // Action/detail pages stay reachable by their owning page or saved URLs.
    if (spec?.visible === 0 && Number(menu.visible) !== 0) changes.visible = 0;
    if (root && Number(menu.id) !== Number(root.id) && expectedParent) {
      const visited = new Set([Number(menu.id)]);
      let parent = byId.get(Number(menu.parent_id));
      let valid = Boolean(parent);
      let first = true;
      while (parent && valid) {
        if (visited.has(Number(parent.id)) || Number(parent.type) === 2) { valid = false; break; }
        visited.add(Number(parent.id));
        if (Number(parent.id) === Number(root.id)) break;
        if (first && Number(menu.type) !== 2 && Number(parent.type) !== 0 && Number(parent.id) !== Number(expectedParent.id)
          && !(parent.path && menu.path?.startsWith(parent.path + '/')) && parent.path) {
          valid = false; break;
        }
        const parentRoot = roots.get(menuModule(parent));
        if (Number(menu.type) !== 2 && parentRoot && Number(parentRoot.id) === Number(parent.id)) { valid = false; break; }
        first = false;
        if (!parent.parent_id) break; // A valid custom top-level directory.
        parent = byId.get(Number(parent.parent_id));
        if (!parent) valid = false;
      }
      if (!valid) changes.parent_id = expectedParent.id;
    }
    if (Object.keys(changes).length) repairs.push({ id: menu.id, ...changes });
  }
  return repairs;
}

module.exports = { ensureCoreMenus, findMenuHierarchyRepairs };
