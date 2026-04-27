/**
 * 财务管理模块路由
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
        // 总账模块路由
        {
            path: 'gl/accounts',
            name: 'gl-accounts',
            component: () => import('../../views/finance/gl/Accounts.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:gl:accounts'
            }
        },
        {
            path: 'gl/entries',
            name: 'gl-entries',
            component: () => import('../../views/finance/gl/Entries.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:gl:entries'
            }
        },
        {
            path: 'gl/opening-balances',
            name: 'gl-opening-balances',
            component: () => import('../../views/finance/gl/OpeningBalances.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:gl:accounts'
            }
        },
        {
            path: 'gl/trial-balance',
            name: 'gl-trial-balance',
            component: () => import('../../views/finance/gl/TrialBalance.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:gl:view'
            }
        },
        {
            path: 'gl/period-closing',
            name: 'gl-period-closing',
            component: () => import('../../views/finance/gl/PeriodClosing.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:gl:closing'
            }
        },
        {
            path: 'gl/periods',
            name: 'gl-periods',
            component: () => import('../../views/finance/gl/Periods.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:gl:periods'
            }
        },
        // 专用凭证路由
        {
            path: 'gl/entries/receipt',
            name: 'gl-receipt-entry',
            component: () => import('../../views/finance/gl/entries/ReceiptEntry.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:gl:entries',
                title: '收款凭证',
                voucherType: '收款凭证'
            }
        },
        {
            path: 'gl/entries/payment',
            name: 'gl-payment-entry',
            component: () => import('../../views/finance/gl/entries/PaymentEntry.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:gl:entries',
                title: '付款凭证',
                voucherType: '付款凭证'
            }
        },
        {
            path: 'gl/entries/transfer',
            name: 'gl-transfer-entry',
            component: () => import('../../views/finance/gl/entries/TransferEntry.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:gl:entries',
                title: '转账凭证',
                voucherType: '转账凭证'
            }
        },
        {
            path: 'gl/entries/create',
            name: 'gl-entry-create',
            component: () => import('../../views/finance/gl/entries/EntryForm.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:gl:entries'
            }
        },
        {
            path: 'gl/entries/general',
            name: 'gl-general-entry',
            component: () => import('../../views/finance/gl/entries/GeneralEntry.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:gl:entries',
                title: '记账凭证',
                voucherType: '记账凭证'
            }
        },
        // 应收账款模块路由
        {
            path: 'ar/invoices',
            name: 'ar-invoices',
            component: () => import('../../views/finance/ar/Invoices.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:ar:invoices'
            }
        },
        {
            path: 'ar/receipts',
            name: 'ar-receipts',
            component: () => import('../../views/finance/ar/Receipts.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:ar:receipts'
            }
        },
        {
            path: 'ar/aging',
            name: 'ar-aging',
            component: () => import('../../views/finance/ar/Aging.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:ar:aging'
            }
        },
        // 应付账款模块路由
        {
            path: 'ap/invoices',
            name: 'ap-invoices',
            component: () => import('../../views/finance/ap/Invoices.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:ap:invoices'
            }
        },
        {
            path: 'ap/payments',
            name: 'ap-payments',
            component: () => import('../../views/finance/ap/Payments.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:ap:payments'
            }
        },
        {
            path: 'ap/aging',
            name: 'ap-aging',
            component: () => import('../../views/finance/ap/Aging.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:ap:aging'
            }
        },
        // 固定资产模块路由
        {
            path: 'assets/list',
            name: 'assets-list',
            component: () => import('../../views/finance/assets/AssetsList.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:assets:list'
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
                permission: 'finance:assets:categories'
            }
        },
        {
            path: 'assets/depreciation',
            name: 'assets-depreciation',
            component: () => import('../../views/finance/assets/Depreciation.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:assets:depreciation'
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
        // 现金管理模块路由
        {
            path: 'cash/accounts',
            name: 'cash-accounts',
            component: () => import('../../views/finance/cash/BankAccounts.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cash:accounts'
            }
        },
        {
            path: 'cash/bank-transactions',
            name: 'bank-transactions',
            component: () => import('../../views/finance/cash/Transactions.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cash:bank-transactions'
            }
        },
        {
            path: 'cash/cash-transactions',
            name: 'cash-transactions',
            component: () => import('../../views/finance/cash/CashTransactions.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cash:cash-transactions'
            }
        },
        {
            path: 'cash/reconciliation',
            name: 'cash-reconciliation',
            component: () => import('../../views/finance/cash/Reconciliation.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cash:reconciliation'
            }
        },
        // 财务报表模块路由
        {
            path: 'reports/balance-sheet',
            name: 'balance-sheet',
            component: () => import('../../views/finance/reports/BalanceSheet.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:reports:balance-sheet'
            }
        },
        {
            path: 'reports/income-statement',
            name: 'income-statement',
            component: () => import('../../views/finance/reports/IncomeStatement.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:reports:income-statement'
            }
        },
        {
            path: 'reports/cash-flow',
            name: 'cash-flow',
            component: () => import('../../views/finance/reports/CashFlow.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:reports:cash-flow'
            }
        },
        {
            path: 'reports/standard-cash-flow',
            name: 'standard-cash-flow',
            component: () => import('../../views/finance/reports/StandardCashFlow.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:reports:cash-flow'
            }
        },
        // 财务自动化模块路由
        {
            path: 'automation',
            name: 'finance-automation',
            component: () => import('../../views/finance/automation/FinanceAutomation.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:automation:manage'
            }
        },
        // 税务管理模块路由
        {
            path: 'tax/invoices',
            name: 'tax-invoices',
            component: () => import('../../views/finance/tax/TaxInvoices.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:tax:invoices'
            }
        },
        {
            path: 'tax/returns',
            name: 'tax-returns',
            component: () => import('../../views/finance/tax/TaxReturns.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:tax:returns'
            }
        },
        {
            path: 'tax/account-config',
            name: 'tax-account-config',
            component: () => import('../../views/finance/tax/TaxAccountConfig.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:tax:config'
            }
        },
        // 预算管理模块路由
        {
            path: 'budget/list',
            name: 'budget-list',
            component: () => import('../../views/finance/budget/BudgetList.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:budget:list'
            }
        },
        {
            path: 'budget/edit',
            name: 'budget-create',
            component: () => import('../../views/finance/budget/BudgetEdit.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:budget:create'
            }
        },
        {
            path: 'budget/edit/:id',
            name: 'budget-edit',
            component: () => import('../../views/finance/budget/BudgetEdit.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:budget:edit'
            }
        },
        {
            path: 'budget/detail/:id',
            name: 'budget-detail',
            component: () => import('../../views/finance/budget/BudgetDetail.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:budget:view'
            }
        },
        {
            path: 'budget/analysis/:id',
            name: 'budget-analysis',
            component: () => import('../../views/finance/budget/BudgetAnalysis.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:budget:analysis'
            }
        },
        {
            path: 'budget/execution',
            name: 'budget-execution',
            component: () => import('../../views/finance/budget/BudgetExecution.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:budget:execution'
            }
        },
        {
            path: 'budget/executions/:id',
            name: 'budget-executions',
            component: () => import('../../views/finance/budget/BudgetExecution.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:budget:execution'
            }
        },
        {
            path: 'budget/ai',
            name: 'budget-ai',
            component: () => import('../../views/finance/budget/BudgetAI.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:budget:analysis'
            }
        },
        // 成本核算模块路由
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
                permission: 'finance:cost:standard'
            }
        },
        {
            path: 'cost/versions',
            name: 'cost-versions',
            component: () => import('../../views/finance/cost/CostVersionManage.vue'),
            meta: {
                title: '标准成本版本管理',
                requiresAuth: true,
                permission: 'finance:cost:standard'
            }
        },
        {
            path: 'cost/actual',
            name: 'cost-actual',
            component: () => import('../../views/finance/cost/ActualCost.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cost:actual'
            }
        },
        {
            path: 'cost/variance',
            name: 'cost-variance',
            component: () => import('../../views/finance/cost/CostVariance.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cost:variance'
            }
        },
        {
            path: 'cost/settings',
            name: 'cost-settings',
            component: () => import('../../views/finance/cost/CostSettings.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cost:settings'
            }
        },
        {
            path: 'cost/center',
            name: 'cost-center',
            component: () => import('../../views/finance/cost/CostCenter.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:cost:settings'
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
                permission: 'finance:pricing'
            }
        },
        // 费用管理模块路由
        {
            path: 'expenses',
            name: 'expenses',
            component: () => import('../../views/finance/expenses/Expenses.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:expenses'
            }
        },
        {
            path: 'expenses/categories',
            name: 'expense-categories',
            component: () => import('../../views/finance/expenses/ExpenseCategories.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:expenses:categories'
            }
        },
        {
            path: 'settings',
            name: 'finance-settings',
            component: () => import('../../views/finance/settings/FinanceSettings.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:settings'
            }
        },
        {
            path: 'settings/exchange-rates',
            name: 'exchange-rates',
            component: () => import('../../views/finance/settings/ExchangeRates.vue'),
            meta: {
                requiresAuth: true,
                permission: 'finance:settings'
            }
        }
    ]
}
