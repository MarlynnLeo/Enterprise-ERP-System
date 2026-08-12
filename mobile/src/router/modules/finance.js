/**
 * 财务管理路由
 */
export const financeRoutes = [
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
  // L4：新建凭证 / 期间关账仅 PC（见 MOBILE_PRODUCT_LAYER）
  {
    path: '/finance/gl/entries/:id',
    name: 'GLEntryDetail',
    component: () => import('@/views/finance/EntryDetail.vue'),
    meta: { title: '凭证详情', permission: 'finance', mobileReadOnly: true }
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
    component: () => import('@/views/finance/CreateARReceipt.vue'),
    meta: { title: '新建收款', permission: 'finance' }
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
    component: () => import('@/views/finance/CreateAPPayment.vue'),
    meta: { title: '新建付款', permission: 'finance' }
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
  // 资产类别/折旧管理为 PC 深度能力；移动端不再挂假路由（同一 Assets 列表会误导用户）
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
    path: '/finance/cash/bank-transactions/:id',
    name: 'BankTransactionDetail',
    component: () => import('@/views/finance/BankTransactionDetail.vue'),
    meta: { title: '银行交易详情', permission: 'finance' }
  },
  {
    path: '/finance/cash/cash-transactions',
    name: 'CashTransactions',
    component: () => import('@/views/finance/CashTransactionsPage.vue'),
    meta: { title: '现金交易', permission: 'finance' }
  },
  {
    path: '/finance/cash/cash-transactions/create',
    name: 'CashTransactionCreateAlias',
    component: () => import('@/views/finance/CreateCashTransaction.vue'),
    meta: { title: '新建现金交易', permission: 'finance' }
  },
  {
    path: '/finance/cash/cash-transactions/:id',
    name: 'CashTransactionDetail',
    component: () => import('@/views/finance/BankTransactionDetail.vue'),
    meta: { title: '现金交易详情', permission: 'finance' }
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
    component: () => import('@/views/finance/CreateCashTransaction.vue'),
    meta: { title: '新建现金交易', permission: 'finance' }
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
  }
]
