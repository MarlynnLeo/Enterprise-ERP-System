const MENU_COMPONENTS = {
  '/production/task': 'production/ProductionTask',
  '/production/material-shortage': 'production/MaterialShortage',
  '/production/data-view': 'production/ProductionDataView',
  '/production/gantt': 'production/ProductionGantt',
  '/basedata/categories': 'baseData/Categories',
  '/basedata/units': 'baseData/Units',
  '/basedata/process-templates': 'baseData/ProcessTemplates',
  '/basedata/product-categories': 'baseData/ProductCategories',
  '/basedata/ecn': 'baseData/ECNManagement',
  '/inventory/report': 'inventory/InventoryReport',
  '/inventory/transaction': 'inventory/InventoryTransaction',
  '/sales/packing-lists': 'sales/PackingLists',
  '/sales/delivery-stats': 'sales/DeliveryStats',
  '/sales/contracts': 'sales/ContractManagement',
  '/system/print': 'system/Print',
  '/system/workflow': 'system/WorkflowManagement',
  '/system/coding-rules': 'system/CodingRules',
  '/system/documents': 'system/DocumentManagement',
  '/system/business-alerts': 'system/BusinessAlerts',
  '/quality/first-article': 'quality/FirstArticleInspection',
  '/quality/traceability': 'quality/components/UnifiedTraceability',
  '/quality/8d-reports': 'quality/EightDReport',
  '/quality/supplier-quality': 'quality/SupplierQualityScorecard',
  '/quality/spc': 'quality/SPCControlChart',
  '/quality/aql-standards': 'quality/AQLStandards',
  '/finance/pricing': 'finance/pricing/ProductPricing',
  '/finance/settings/exchange-rates': 'finance/settings/ExchangeRates',
  '/hr/employees': 'hr/Employees',
  '/hr/attendance': 'hr/Attendance',
  '/hr/salary': 'hr/Salary',
  '/hr/performance': 'hr/Performance',
  '/finance/gl/accounts': 'finance/gl/Accounts',
  '/finance/gl/periods': 'finance/gl/Periods',
  '/finance/gl/trial-balance': 'finance/gl/TrialBalance',
  '/finance/gl/period-closing': 'finance/gl/PeriodClosing',
  '/finance/gl/opening-balances': 'finance/gl/OpeningBalances',
  '/finance/ar/invoices': 'finance/ar/Invoices',
  '/finance/ar/receipts': 'finance/ar/Receipts',
  '/finance/ar/aging': 'finance/ar/Aging',
  '/finance/ap/invoices': 'finance/ap/Invoices',
  '/finance/ap/payments': 'finance/ap/Payments',
  '/finance/ap/aging': 'finance/ap/Aging',
  '/finance/cash/accounts': 'finance/cash/BankAccounts',
  '/finance/cash/bank-transactions': 'finance/cash/Transactions',
  '/finance/cash/cash-transactions': 'finance/cash/CashTransactions',
  '/finance/cash/reconciliation': 'finance/cash/Reconciliation',
  '/finance/expenses': 'finance/expenses/Expenses',
  '/finance/expenses/categories': 'finance/expenses/ExpenseCategories',
  '/finance/reports/balance-sheet': 'finance/reports/BalanceSheet',
  '/finance/reports/income-statement': 'finance/reports/IncomeStatement',
  '/finance/reports/cash-flow': 'finance/reports/CashFlow',
  '/finance/reports/standard-cash-flow': 'finance/reports/StandardCashFlow',
  '/finance/tax/invoices': 'finance/tax/TaxInvoices',
  '/finance/tax/returns': 'finance/tax/TaxReturns',
  '/finance/tax/account-config': 'finance/tax/TaxAccountConfig',
  '/finance/budget/execution': 'finance/budget/BudgetExecution',
  '/finance/budget/list': 'finance/budget/BudgetList',
  '/finance/budget/edit': 'finance/budget/BudgetEdit',
  '/finance/budget/ai': 'finance/budget/BudgetAI',
  '/finance/cost/dashboard': 'finance/cost/CostDashboard',
  '/finance/cost/standard': 'finance/cost/StandardCost',
  '/finance/cost/actual': 'finance/cost/ActualCost',
  '/finance/cost/variance': 'finance/cost/CostVariance',
  '/finance/cost/settings': 'finance/cost/CostSettings',
  '/finance/cost/center': 'finance/cost/CostCenter',
  '/finance/cost/ledger': 'finance/cost/CostLedger',
  '/finance/cost/profitability': 'finance/cost/ProfitabilityAnalysis',
  '/finance/cost/abc': 'finance/cost/ActivityBasedCosting',
  '/finance/settings': 'finance/settings/FinanceSettings',
  '/finance/automation': 'finance/automation/FinanceAutomation',
};

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    for (const [path, component] of Object.entries(MENU_COMPONENTS)) {
      await trx('menus')
        .where({ path })
        .andWhere((builder) => builder.whereNull('component').orWhere('component', ''))
        .update({ component, updated_at: trx.fn.now() });
    }
  });
};

exports.down = async function down() {
  // Component path backfill is a data repair and is intentionally not rolled back.
};
