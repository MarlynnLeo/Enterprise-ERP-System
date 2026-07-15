/**
 * 财务管理 API 模块
 *
 * reverseEntry: 会计冲销（创建相反分录）
 * rejectEntry: 已废弃别名，请勿当作草稿驳回
 */
import api from '../client'

export const financeApi = {
  // 总账管理 — 后端路由: /api/finance/accounts
  getAccounts(params) {
    return api.get('/finance/accounts', { params })
  },

  getAccount(id) {
    return api.get(`/finance/accounts/${id}`)
  },

  createAccount(data) {
    return api.post('/finance/accounts', data)
  },

  updateAccount(id, data) {
    return api.put(`/finance/accounts/${id}`, data)
  },

  deleteAccount(id) {
    return api.patch(`/finance/accounts/${id}/deactivate`)
  },

  // 会计凭证 — 后端路由: /api/finance/entries
  getEntries(params) {
    return api.get('/finance/entries', { params })
  },

  getEntry(id) {
    return api.get(`/finance/entries/${id}`)
  },

  createEntry(data) {
    return api.post('/finance/entries', data)
  },

  deleteEntry(id) {
    return api.delete(`/finance/entries/${id}`)
  },

  // 过账（后端实际为 post 操作，非 approve）
  approveEntry(id) {
    return api.patch(`/finance/entries/${id}/post`)
  },

  /**
   * 会计冲销 — 创建一笔方向相反的凭证来抵消原凭证
   * @param {number} id - 原凭证 ID
   * @param {Object} data - 冲销参数（entry_date, posting_date, description 等）
   */
  reverseEntry(id, data) {
    return api.post(`/finance/entries/${id}/reverse`, data)
  },

  /**
   * @deprecated 请使用 reverseEntry。此方法保留兼容，强制走冲销语义并要求明确原因。
   */
  rejectEntry(id, reason) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[financeApi.rejectEntry] 已废弃，请改用 reverseEntry，避免误当作草稿驳回')
    }
    const today = new Date().toISOString().slice(0, 10)
    const payload =
      typeof reason === 'object' && reason !== null
        ? reason
        : {
            entry_date: today,
            posting_date: today,
            description: reason || '移动端冲销凭证',
          }
    return this.reverseEntry(id, payload)
  },

  // 会计期间 — 后端路由: /api/finance/periods
  getPeriods(params) {
    return api.get('/finance/periods', { params })
  },

  getPeriodById(id) {
    return api.get(`/finance/periods/${id}`)
  },

  reopenPeriod(id) {
    return api.patch(`/finance/periods/${id}/reopen`)
  },

  // 应收管理
  getARInvoices(params) {
    return api.get('/finance/ar/invoices', { params })
  },

  /** 获取应收发票详情 */
  getARInvoice(id) {
    return api.get(`/finance/ar/invoices/${id}`)
  },

  createARInvoice(data) {
    return api.post('/finance/ar/invoices', data)
  },

  getARReceipts(params) {
    return api.get('/finance/ar/receipts', { params })
  },

  getARUnpaidInvoices(params) {
    return api.get('/finance/ar/receipts/unpaid-invoices', { params })
  },

  getARReceiptById(id) {
    return api.get(`/finance/ar/receipts/${id}`)
  },

  createARReceipt(data) {
    return api.post('/finance/ar/receipts', data)
  },

  getARAging(params) {
    return api.get('/finance/ar/aging', { params })
  },

  // 应付管理
  getAPInvoices(params) {
    return api.get('/finance/ap/invoices', { params })
  },

  /** 获取应付发票详情 */
  getAPInvoice(id) {
    return api.get(`/finance/ap/invoices/${id}`)
  },

  createAPInvoice(data) {
    return api.post('/finance/ap/invoices', data)
  },

  getAPPayments(params) {
    return api.get('/finance/ap/payments', { params })
  },

  getAPPaymentById(id) {
    return api.get(`/finance/ap/payments/${id}`)
  },

  createAPPayment(data) {
    return api.post('/finance/ap/payments', data)
  },

  getAPAging(params) {
    return api.get('/finance/ap/aging', { params })
  },

  // 固定资产 — 后端路由: /api/finance/assets
  getAssets(params) {
    return api.get('/finance/assets', { params })
  },

  /** 获取固定资产详情 */
  getAsset(id) {
    return api.get(`/finance/assets/${id}`)
  },

  createAsset(data) {
    return api.post('/finance/assets', data)
  },

  updateAsset(id, data) {
    return api.put(`/finance/assets/${id}`, data)
  },

  getAssetCategories() {
    return api.get('/finance/assets/categories')
  },

  getDepreciation(params) {
    return api.get('/finance/assets/depreciation/records', { params })
  },

  calculateDepreciation(data) {
    return api.get('/finance/assets/depreciation/calculate', { params: data })
  },

  // 现金银行 — 后端路由: /api/finance/bank-accounts, /api/finance/cash-transactions
  getCashAccounts(params) {
    return api.get('/finance/bank-accounts', { params })
  },

  /** 获取银行账户详情 */
  getCashAccount(id) {
    return api.get(`/finance/bank-accounts/${id}`)
  },

  createCashAccount(data) {
    return api.post('/finance/bank-accounts', data)
  },

  getCashTransactions(params) {
    return api.get('/finance/cash-transactions', { params })
  },

  getBankTransactions(params) {
    return api.get('/finance/bank-transactions', { params })
  },

  getBankTransaction(id) {
    return api.get(`/finance/bank-transactions/${id}`)
  },

  createBankTransaction(data) {
    return api.post('/finance/bank-transactions', data)
  },

  createCashTransaction(data) {
    return api.post('/finance/cash-transactions', data)
  },

  getCashTransaction(id) {
    return api.get(`/finance/cash-transactions/${id}`)
  },

  getReconciliation(params) {
    return api.get('/finance/cash/reconciliation/unreconciled', { params })
  },

  // 财务报表
  getBalanceSheet(params) {
    // 资产负债表需要 reportDate 参数
    const reportDate = params?.reportDate || new Date().toISOString().split('T')[0]
    return api.get('/finance/reports/balance-sheet', { params: { ...params, reportDate } })
  },

  getIncomeStatement(params) {
    // 利润表需要 startDate + endDate 参数
    const now = new Date()
    const startDate =
      params?.startDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const endDate = params?.endDate || now.toISOString().split('T')[0]
    return api.get('/finance/reports/income-statement', {
      params: { ...params, startDate, endDate }
    })
  },

  getCashFlowStatement(params) {
    // 报表端点需要日期参数，提供默认当月范围
    const now = new Date()
    const startDate =
      params?.startDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const endDate = params?.endDate || now.toISOString().split('T')[0]
    return api.get('/finance/reports/cash-flow', { params: { ...params, startDate, endDate } })
  },

  // 应付发票状态操作
  updateAPInvoiceStatus(id, status) {
    return api.put(`/finance/ap/invoices/${id}/status`, { status })
  },

  // 应付付款作废
  voidAPPayment(id, voidReason) {
    return api.post(`/finance/ap/payments/${id}/void`, { void_reason: voidReason })
  },

  // 应收发票状态操作
  updateARInvoiceStatus(id, status) {
    return api.put(`/finance/ar/invoices/${id}/status`, { status })
  },

  // 应收收款作废
  voidARReceipt(id, voidReason) {
    return api.post(`/finance/ar/receipts/${id}/void`, { void_reason: voidReason })
  }
}

// W-23: 保留别名以兼容旧调用，指向同一实现
financeApi.getARInvoiceById = financeApi.getARInvoice
financeApi.getAPInvoiceById = financeApi.getAPInvoice
financeApi.getAssetById = financeApi.getAsset
financeApi.getCashAccountById = financeApi.getCashAccount
