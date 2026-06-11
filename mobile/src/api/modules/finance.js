/**
 * 财务管理 API 模块
 *
 * W-23: 清理重复 API 方法
 *   - getARInvoice / getARInvoiceById → 保留 getARInvoice，getARInvoiceById 指向同一方法
 *   - getAPInvoice / getAPInvoiceById → 保留 getAPInvoice，getAPInvoiceById 指向同一方法
 *   - getAsset / getAssetById → 保留 getAsset，getAssetById 指向同一方法
 *   - getCashAccount / getCashAccountById → 保留 getCashAccount，getCashAccountById 指向同一方法
 *
 * W-24: rejectEntry / reverseEntry 语义区分
 *   - reverseEntry: 会计冲销 — 创建一笔方向相反的凭证来抵消原凭证
 *   - rejectEntry: 语义上是"拒绝/驳回"，但实际调用同一冲销端点（/reverse）
 *     两者均调用 POST /finance/entries/:id/reverse，
 *     区别在于 rejectEntry 会自动填充当前日期和默认描述
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
   * 驳回凭证 — 语义上为"拒绝/驳回"操作
   * 实际调用与 reverseEntry 相同的冲销端点（POST /finance/entries/:id/reverse），
   * 区别：自动填充当前日期和默认描述 '移动端冲销凭证'。
   * 如果后端未来提供独立的 reject 端点，此方法应迁移到新端点。
   * @param {number} id - 原凭证 ID
   * @param {string|Object} reason - 驳回原因（字符串）或完整的冲销参数对象
   */
  rejectEntry(id, reason) {
    const today = new Date().toISOString().slice(0, 10)
    const payload = typeof reason === 'object' && reason !== null
      ? reason
      : {
          entry_date: today,
          posting_date: today,
          description: reason || '移动端冲销凭证'
        }
    return api.post(`/finance/entries/${id}/reverse`, payload)
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
