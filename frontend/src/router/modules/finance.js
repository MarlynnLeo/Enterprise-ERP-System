/**
 * 璐㈠姟绠＄悊妯″潡璺敱
 */
import ModuleContainer from '../../components/common/ModuleContainer.vue'

export default {
    path: 'finance',
    name: 'finance',
    component: ModuleContainer,
    props: { moduleName: 'finance', padding: true },
    meta: {
        requiresAuth: true,
        permission: 'finance'
    },
    children: [
        {
            path: '',
            name: 'finance-dashboard',
            redirect: '/finance/gl/accounts'
        },
        // 鎬昏处妯″潡璺敱
        {
            path: 'gl/accounts',
            name: 'gl-accounts',
            component: () => import('../../views/finance/gl/Accounts.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:accounts:view'
            }
        },
        {
            path: 'gl/entries',
            name: 'gl-entries',
            component: () => import('../../views/finance/gl/Entries.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:entries:view'
            }
        },
        {
            path: 'gl/opening-balances',
            name: 'gl-opening-balances',
            component: () => import('../../views/finance/gl/OpeningBalances.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:accounts:view'
            }
        },
        {
            path: 'gl/trial-balance',
            name: 'gl-trial-balance',
            component: () => import('../../views/finance/gl/TrialBalance.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:reports:view'
            }
        },
        {
            path: 'gl/period-closing',
            name: 'gl-period-closing',
            component: () => import('../../views/finance/gl/PeriodClosing.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:closing:view'
            }
        },
        {
            path: 'gl/periods',
            name: 'gl-periods',
            component: () => import('../../views/finance/gl/Periods.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:periods:view'
            }
        },
        // 涓撶敤鍑瘉璺敱
        {
            path: 'gl/entries/receipt',
            name: 'gl-receipt-entry',
            component: () => import('../../views/finance/gl/entries/ReceiptEntry.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:entries:create',
                title: '鏀舵鍑瘉',
                voucherType: '鏀舵鍑瘉'
            }
        },
        {
            path: 'gl/entries/payment',
            name: 'gl-payment-entry',
            component: () => import('../../views/finance/gl/entries/PaymentEntry.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:entries:create',
                title: '浠樻鍑瘉',
                voucherType: '浠樻鍑瘉'
            }
        },
        {
            path: 'gl/entries/transfer',
            name: 'gl-transfer-entry',
            component: () => import('../../views/finance/gl/entries/TransferEntry.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:entries:create',
                title: '杞处鍑瘉',
                voucherType: '杞处鍑瘉'
            }
        },
        {
            path: 'gl/entries/create',
            name: 'gl-entry-create',
            component: () => import('../../views/finance/gl/entries/EntryForm.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:entries:create'
            }
        },
        {
            path: 'gl/entries/general',
            name: 'gl-general-entry',
            component: () => import('../../views/finance/gl/entries/GeneralEntry.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:entries:create',
                title: '璁拌处鍑瘉',
                voucherType: '璁拌处鍑瘉'
            }
        },
        // 搴旀敹璐︽妯″潡璺敱
        {
            path: 'ar/invoices',
            name: 'ar-invoices',
            component: () => import('../../views/finance/ar/Invoices.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:ar:view'
            }
        },
        {
            path: 'ar/receipts',
            name: 'ar-receipts',
            component: () => import('../../views/finance/ar/Receipts.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:ar:view'
            }
        },
        {
            path: 'ar/aging',
            name: 'ar-aging',
            component: () => import('../../views/finance/ar/Aging.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:reports:view'
            }
        },
        // 搴斾粯璐︽妯″潡璺敱
        {
            path: 'ap/invoices',
            name: 'ap-invoices',
            component: () => import('../../views/finance/ap/Invoices.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:ap:view'
            }
        },
        {
            path: 'ap/payments',
            name: 'ap-payments',
            component: () => import('../../views/finance/ap/Payments.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:ap:view'
            }
        },
        {
            path: 'ap/aging',
            name: 'ap-aging',
            component: () => import('../../views/finance/ap/Aging.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:reports:view'
            }
        },
        // 鍥哄畾璧勪骇妯″潡璺敱
        {
            path: 'assets/list',
            name: 'assets-list',
            component: () => import('../../views/finance/assets/AssetsList.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:assets:view'
            }
        },
        {
            path: 'assets/detail/:id',
            name: 'assets-detail',
            component: () => import('../../views/finance/assets/AssetDetail.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:assets:view'
            }
        },
        {
            path: 'assets/categories',
            name: 'assets-categories',
            component: () => import('../../views/finance/assets/AssetCategoryList.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:assets:view'
            }
        },
        {
            path: 'assets/depreciation',
            name: 'assets-depreciation',
            component: () => import('../../views/finance/assets/Depreciation.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:assets:view'
            }
        },
        {
            path: 'assets/cip',
            name: 'assets-cip',
            component: () => import('../../views/finance/assets/CIPList.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:assets:view'
            }
        },
        {
            path: 'assets/inventory',
            name: 'assets-inventory',
            component: () => import('../../views/finance/assets/AssetInventory.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:assets:view'
            }
        },
        {
            path: 'assets/reports',
            name: 'assets-reports',
            component: () => import('../../views/finance/assets/AssetReports.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:assets:view'
            }
        },
        // 鐜伴噾绠＄悊妯″潡璺敱
        {
            path: 'cash',
            name: 'finance-cash',
            redirect: '/finance/cash/accounts'
        },
        {
            path: 'cash/accounts',
            name: 'cash-accounts',
            component: () => import('../../views/finance/cash/BankAccounts.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cash:view'
            }
        },
        {
            path: 'cash/bank-transactions',
            name: 'bank-transactions',
            component: () => import('../../views/finance/cash/Transactions.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cash:view'
            }
        },
        {
            path: 'cash/cash-transactions',
            name: 'cash-transactions',
            component: () => import('../../views/finance/cash/CashTransactions.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cash:view'
            }
        },
        {
            path: 'cash/reconciliation',
            name: 'cash-reconciliation',
            component: () => import('../../views/finance/cash/Reconciliation.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cash:reconcile'
            }
        },
        // 璐㈠姟鎶ヨ〃妯″潡璺敱
        {
            path: 'reports/balance-sheet',
            name: 'balance-sheet',
            component: () => import('../../views/finance/reports/BalanceSheet.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:reports:view'
            }
        },
        {
            path: 'reports/income-statement',
            name: 'income-statement',
            component: () => import('../../views/finance/reports/IncomeStatement.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:reports:view'
            }
        },
        {
            path: 'reports/cash-flow',
            name: 'cash-flow',
            component: () => import('../../views/finance/reports/CashFlow.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:reports:view'
            }
        },
        {
            path: 'reports/standard-cash-flow',
            name: 'standard-cash-flow',
            component: () => import('../../views/finance/reports/StandardCashFlow.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:reports:standard-cash-flow:view'
            }
        },
        // 财务自动化 → 已合并到财务设置
        {
            path: 'automation',
            name: 'finance-automation',
            redirect: { path: '/finance/settings', query: { tab: 'automation' } },
            meta: {
                requiresAuth: true,
                permission: 'finance:automation:view'
            }
        },
        // 税务管理模块路由
        {
            path: 'tax',
            name: 'finance-tax',
            redirect: '/finance/tax/invoices'
        },
        {
            path: 'tax/invoices',
            name: 'tax-invoices',
            component: () => import('../../views/finance/tax/TaxInvoices.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:tax:view'
            }
        },
        {
            path: 'tax/returns',
            name: 'tax-returns',
            component: () => import('../../views/finance/tax/TaxReturns.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:tax:view'
            }
        },
        {
            path: 'tax/account-config',
            name: 'tax-account-config',
            component: () => import('../../views/finance/tax/TaxAccountConfig.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:tax:view'
            }
        },
        // 棰勭畻绠＄悊妯″潡璺敱
        {
            path: 'budget',
            name: 'finance-budget',
            redirect: '/finance/budget/list'
        },
        {
            path: 'budget/list',
            name: 'budget-list',
            component: () => import('../../views/finance/budget/BudgetList.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:budgets:view'
            }
        },
        {
            path: 'budget/edit',
            name: 'budget-create',
            component: () => import('../../views/finance/budget/BudgetEdit.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:budgets:create'
            }
        },
        {
            path: 'budget/edit/:id',
            name: 'budget-edit',
            component: () => import('../../views/finance/budget/BudgetEdit.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:budgets:update'
            }
        },
        {
            path: 'budget/detail/:id',
            name: 'budget-detail',
            component: () => import('../../views/finance/budget/BudgetDetail.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:budgets:view'
            }
        },
        {
            path: 'budget/analysis/:id',
            name: 'budget-analysis',
            component: () => import('../../views/finance/budget/BudgetAnalysis.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:budgets:view'
            }
        },
        {
            path: 'budget/execution',
            name: 'budget-execution',
            component: () => import('../../views/finance/budget/BudgetExecution.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:budgets:view'
            }
        },
        {
            path: 'budget/executions/:id',
            name: 'budget-executions',
            component: () => import('../../views/finance/budget/BudgetExecution.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:budgets:view'
            }
        },
        {
            path: 'budget/ai',
            name: 'budget-ai',
            component: () => import('../../views/finance/budget/BudgetAI.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:budgets:view'
            }
        },
        // 鎴愭湰鏍哥畻妯″潡璺敱
        {
            path: 'cost',
            name: 'finance-cost',
            redirect: '/finance/cost/dashboard'
        },
        {
            path: 'cost/dashboard',
            name: 'cost-dashboard',
            component: () => import('../../views/finance/cost/CostDashboard.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cost:view'
            }
        },
        {
            path: 'cost/standard',
            name: 'cost-standard',
            component: () => import('../../views/finance/cost/StandardCost.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cost:view'
            }
        },
        {
            path: 'cost/versions',
            name: 'cost-versions',
            component: () => import('../../views/finance/cost/CostVersionManage.vue'),
            meta: {
                title: '鏍囧噯鎴愭湰鐗堟湰绠＄悊',
                requiresAuth: true,
                permission: 'finance:cost:view'
            }
        },
        {
            path: 'cost/closing',
            name: 'cost-closing',
            component: () => import('../../views/finance/cost/CostClosing.vue'),
            meta: {
                title: '鎴愭湰鍏宠处',
                requiresAuth: true,
                permission: 'finance:cost:view'
            }
        },
        {
            path: 'cost/actual',
            name: 'cost-actual',
            component: () => import('../../views/finance/cost/ActualCost.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cost:view'
            }
        },
        {
            path: 'cost/variance',
            name: 'cost-variance',
            component: () => import('../../views/finance/cost/CostVariance.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cost:view'
            }
        },
        {
            path: 'cost/settings',
            name: 'cost-settings',
            component: () => import('../../views/finance/cost/CostSettings.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cost:view'
            }
        },
        {
            path: 'cost/center',
            name: 'cost-center',
            component: () => import('../../views/finance/cost/CostCenter.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cost:view'
            }
        },
        {
            path: 'cost/ledger',
            name: 'cost-ledger',
            component: () => import('../../views/finance/cost/CostLedger.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cost:view'
            }
        },
        {
            path: 'cost/profitability',
            name: 'cost-profitability',
            component: () => import('../../views/finance/cost/ProfitabilityAnalysis.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cost:view'
            }
        },
        {
            path: 'cost/abc',
            name: 'cost-abc',
            component: () => import('../../views/finance/cost/ActivityBasedCosting.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cost:view'
            }
        },
        {
            path: 'pricing',
            name: 'finance-pricing',
            component: () => import('../../views/finance/pricing/ProductPricing.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:pricing:view'
            }
        },
        // 璐圭敤绠＄悊妯″潡璺敱
        {
            path: 'expenses',
            name: 'expenses',
            component: () => import('../../views/finance/expenses/Expenses.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:expenses:view'
            }
        },
        {
            path: 'expenses/categories',
            name: 'expense-categories',
            component: () => import('../../views/finance/expenses/ExpenseCategories.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:expenses:view'
            }
        },
        {
            path: 'settings',
            name: 'finance-settings',
            component: () => import('../../views/finance/settings/FinanceSettings.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:settings:view'
            }
        },
        {
            path: 'settings/exchange-rates',
            name: 'exchange-rates',
            component: () => import('../../views/finance/settings/ExchangeRates.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:exchange-rates:view'
            }
        }
    ]
}
