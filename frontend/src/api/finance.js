/**
 * @module api/finance
 * @description 财务模块 API 接口定义
 * @date 2025-11-21
 *
 * 所有方法返回 axios Promise，拦截器已统一解包 ResponseHandler 格式。
 */

import { api } from '../services/axiosInstance';
import { API_CONFIG } from '../config/app';

/**
 * @typedef {import('axios').AxiosResponse} AxiosResponse
 * @typedef {import('axios').AxiosRequestConfig} AxiosRequestConfig
 */

/**
 * 通用分页查询参数
 * @typedef {Object} PaginationParams
 * @property {number} [page=1] - 页码
 * @property {number} [pageSize=20] - 每页条数
 * @property {string} [keyword] - 搜索关键词
 * @property {string} [sortBy] - 排序字段
 * @property {string} [sortOrder] - 排序方向 ('asc'|'desc')
 */

/**
 * 通用分页响应
 * @typedef {Object} PaginatedResponse
 * @property {Array<Object>} list - 数据列表
 * @property {number} total - 总记录数
 * @property {number} page - 当前页码
 * @property {number} pageSize - 每页条数
 * @property {number} totalPages - 总页数
 */

/**
 * 通用 ID 类型
 * @typedef {number|string} EntityId
 */

/**
 * 发票状态更新参数
 * @typedef {Object} StatusUpdateData
 * @property {string} status - 目标状态
 * @property {string} [remark] - 备注
 */

/**
 * 会计分录数据（HTTP camelCase）
 * @typedef {Object} EntryData
 * @property {string} documentNumber - 凭证号
 * @property {string} entryDate - 记账日期
 * @property {string} [description] - 摘要
 * @property {Array<{accountId: number, debit: number, credit: number, description?: string}>} items - 分录行
 */

/**
 * 冲销数据（HTTP camelCase）
 * @typedef {Object} ReversalData
 * @property {string} [reason] - 冲销原因
 * @property {string} [reversalDate] - 冲销日期
 * @property {string} [entryDate] - 冲销记账日期
 * @property {string} [postingDate] - 过账日期
 */

export const financeApi = {
    inventoryPostings: {
        list: (params) => api.get('/finance/inventory-postings', { params }),
        get: (id) => api.get(`/finance/inventory-postings/${id}`),
        approve: (id) => api.post(`/finance/inventory-postings/${id}/approve`),
        reject: (id, data) => api.post(`/finance/inventory-postings/${id}/reject`, data),
        reverse: (id, data) => api.post(`/finance/inventory-postings/${id}/reverse`, data)
    },
    // ============ 仪表盘 & 统计 ============
    // 现金流统计（收支趋势、按类型汇总）
    getCashFlowStatistics: (params) => api.get('/finance/statistics/cash-flow', { params }),
    // 应收账款账龄分析
    getReceivablesAging: (params) => api.get('/finance/ar/aging', { params }),
    // 应付账款账龄分析
    getPayablesAging: (params) => api.get('/finance/ap/aging', { params }),
    // 会计分录列表
    getEntries: (params) => api.get('/finance/entries', { params }),
    // 会计分录详情
    getEntry: (id) => api.get(`/finance/entries/${id}`),
    getEntryItems: (id) => api.get(`/finance/entries/${id}/items`),
    createEntry: (data) => api.post('/finance/entries', data),
    postEntry: (id) => api.patch(`/finance/entries/${id}/post`),
    reverseEntry: (id, data) => api.post(`/finance/entries/${id}/reverse`, data),
    deleteEntry: (id) => api.delete(`/finance/entries/${id}`),

    accounts: {
        getList: (params) => api.get('/finance/accounts', { params }),
        getOptions: () => api.get('/finance/accounts/options'),
        create: (data) => api.post('/finance/accounts', data),
        update: (id, data) => api.put(`/finance/accounts/${id}`, data),
        updateStatus: (id, data) => api.patch(`/finance/accounts/${id}/status`, data)
    },

    periods: {
        getList: (params) => api.get('/finance/periods', { params }),
        create: (data) => api.post('/finance/periods', data),
        update: (id, data) => api.put(`/finance/periods/${id}`, data),
        reopen: (id) => api.patch(`/finance/periods/${id}/reopen`)
    },

    glClosing: {
        preview: (periodId) => api.get(`/finance/gl/closing/preview/${periodId}`),
        getUnpostedEntries: (periodId) => api.get(`/finance/gl/closing/unposted/${periodId}`),
        updateUnpostedEntryDates: (entryId, data) => api.patch(`/finance/gl/closing/unposted-entries/${entryId}/dates`, data),
        execute: (periodId) => api.post(`/finance/gl/closing/execute/${periodId}`),
        getUnreconciledTransactions: (periodId) => api.get(`/finance/gl/closing/unreconciled/${periodId}`),
        history: (periodId) => api.get(`/finance/gl/closing/history/${periodId}`)
    },

    reports: {
        getTrialBalance: (params) => api.get('/finance/gl/trial-balance', { params }),
        getBalanceSheet: (params) => api.get('/finance/reports/balance-sheet', { params }),
        getIncomeStatement: (params) => api.get('/finance/reports/income-statement', { params }),
        getCashFlow: (params) => api.get('/finance/reports/cash-flow', { params }),
        getStandardCashFlow: (params) => api.get('/finance/reports/standard-cash-flow', { params })
    },

    settings: {
        get: () => api.get('/finance/settings'),
        getOptions: () => api.get('/finance/settings/options'),
        update: (data) => api.put('/finance/settings', data),
        reset: () => api.post('/finance/settings/reset')
    },

    budgets: {
        getList: (params) => api.get('/finance/budgets', { params }),
        getDetail: (id) => api.get(`/finance/budgets/${id}`),
        create: (data) => api.post('/finance/budgets', data),
        update: (id, data) => api.put(`/finance/budgets/${id}`, data),
        delete: (id) => api.delete(`/finance/budgets/${id}`),
        submit: (id) => api.post(`/finance/budgets/${id}/submit`),
        approve: (id, data) => api.post(`/finance/budgets/${id}/approve`, data),
        start: (id) => api.post(`/finance/budgets/${id}/start`),
        close: (id) => api.post(`/finance/budgets/${id}/close`),
        getAnalysis: (id) => api.get(`/finance/budgets/${id}/analysis`),
        getExecutionAnalysis: (id) => api.get(`/finance/budgets/${id}/analysis/execution`),
        getAiUsageStats: () => api.get('/finance/budgets/ai/usage-stats'),
        getAiRecommendation: (params, config = {}) => api.get('/finance/budgets/ai/recommendation', { ...config, params }),
        createFromAi: (data, config = {}) => api.post('/finance/budgets/ai/create-from-ai', data, config),
        getAiAnomalies: (id, config = {}) => api.get(`/finance/budgets/${id}/ai/anomalies`, config),
        getAiOptimization: (id, config = {}) => api.get(`/finance/budgets/${id}/ai/optimization`, config),
        getAiYearComparison: (params, config = {}) => api.get('/finance/budgets/ai/year-comparison', { ...config, params }),
        getAiComprehensiveReport: (id, config = {}) => api.get(`/finance/budgets/${id}/ai/comprehensive-report`, config)
    },

    openingBalances: {
        getList: () => api.get('/finance/opening-balances'),
        preview: (params) => api.get('/finance/opening-balances/preview', { params }),
        initialize: (data) => api.post('/finance/opening-balances/initialize', data),
        saveBatch: (data) => api.post('/finance/opening-balances/batch', data)
    },

    // ============ 应收账款（AR）============
    // 注意：实际后端路由为 /finance/ar/invoices，不是 /finance/receivables
    getARInvoices: (params, config = {}) => api.get('/finance/ar/invoices', { ...config, params }),
    getARInvoice: (id) => api.get(`/finance/ar/invoices/${id}`),
    createARInvoice: (data) => api.post('/finance/ar/invoices', data),
    updateARInvoice: (id, data) => api.put(`/finance/ar/invoices/${id}`, data),
    updateARInvoiceStatus: (id, data) => api.put(`/finance/ar/invoices/${id}/status`, data),
    getARInvoicePayments: (id) => api.get(`/finance/ar/invoices/${id}/payments`),
    getARSettlementDashboard: (params) =>
      api.get('/finance/ar/settlement-dashboard', { params }),

    // ============ 应付账款（AP）============
    // 注意：实际后端路由为 /finance/ap/invoices，不是 /finance/payables
    getAPInvoices: (params, config = {}) => api.get('/finance/ap/invoices', { ...config, params }),
    getAPInvoice: (id) => api.get(`/finance/ap/invoices/${id}`),
    createAPInvoice: (data) => api.post('/finance/ap/invoices', data),
    updateAPInvoice: (id, data) => api.put(`/finance/ap/invoices/${id}`, data),
    updateAPInvoiceStatus: (id, data) => api.put(`/finance/ap/invoices/${id}/status`, data),
    getAPInvoicePayments: (id) => api.get(`/finance/ap/invoices/${id}/payments`),
    getUnpaidAPInvoices: () => api.get('/finance/ap/invoices/unpaid'),
    getAPSettlementDashboard: (params) =>
      api.get('/finance/ap/settlement-dashboard', { params }),

    // 三单匹配 / 业财状态
    createThreeWayMatchFromReceipt: (receiptId, data) =>
      api.post(`/finance/integration/three-way-match/from-receipt/${receiptId}`, data),
    listThreeWayMatches: (params) =>
      api.get('/finance/integration/three-way-match', { params }),
    getThreeWayMatch: (id) => api.get(`/finance/integration/three-way-match/${id}`),
    confirmThreeWayMatch: (id, data) =>
      api.post(`/finance/integration/three-way-match/${id}/confirm`, data || {}),
    updateThreeWayMatchLines: (id, data) =>
      api.put(`/finance/integration/three-way-match/${id}/lines`, data),
    cancelThreeWayMatch: (id, data) =>
      api.post(`/finance/integration/three-way-match/${id}/cancel`, data || {}),
    getPurchaseReceiptFinanceStatus: (receiptId) =>
      api.get(`/finance/integration/document-status/purchase-receipt/${receiptId}`),
    getSalesOutboundFinanceStatus: (outboundId) =>
      api.get(`/finance/integration/document-status/sales-outbound/${outboundId}`),
    getBankReconciliationBalanceSheet: (params) =>
      api.get('/finance/cash/bank-reconciliation-balance-sheet', { params }),

    integration: {
        // 专业主路径
        getEligiblePurchaseReceipts: (params) =>
            api.get('/finance/integration/eligible-purchase-receipts', { params }),
        getEligibleSalesOutbounds: (params) =>
            api.get('/finance/integration/eligible-sales-outbounds', { params }),
        // 例外（订单级）
        getEligibleSalesOrders: (params) =>
            api.get('/finance/integration/eligible-sales-orders', { params }),
        getEligiblePurchaseOrders: (params) =>
            api.get('/finance/integration/eligible-purchase-orders', { params }),
        /** 批量预览：默认多选合并为 1 张凭证草稿（可改后再确认） */
        batchPreviewFromOrders: (data) =>
            api.post('/finance/integration/batch-preview', data, {
              timeout: API_CONFIG.longTimeoutMs,
            }),
        /** 批量生成：默认合并 1 张总账；可带 overrides（长超时，避免锁等待被 20s 掐断） */
        batchGenerateFromOrders: (data) =>
            api.post('/finance/integration/batch-generate', data, {
              timeout: API_CONFIG.longTimeoutMs,
            }),
        generateAPInvoiceFromPurchaseReceipt: (receiptId) =>
            api.post(`/finance/integration/ap-invoice/${receiptId}`),
        generateARInvoiceFromSalesOutbound: (outboundId) =>
            api.post(`/finance/integration/ar-invoice-from-outbound/${outboundId}`),
        generateARInvoiceFromSalesOrder: (salesOrderId) =>
            api.post(`/finance/integration/ar-invoice/${salesOrderId}`),
        generateAPInvoiceFromPurchaseOrder: (purchaseOrderId) =>
            api.post(`/finance/integration/ap-invoice-from-po/${purchaseOrderId}`),
        /** 闭环补齐：税票 / 成本凭证（force） */
        generateInputTaxFromReceipt: (receiptId) =>
            api.post(`/finance/integration/tax-input/${receiptId}`),
        generateOutputTaxFromOutbound: (outboundId) =>
            api.post(`/finance/integration/tax-output/${outboundId}`),
        generateCostEntryFromOutbound: (outboundId) =>
            api.post(`/finance/integration/cost-entry/${outboundId}`),
    },

    // 收款记录
    getReceipts: (params) => api.get('/finance/ar/receipts', { params }),
    getReceipt: (id) => api.get(`/finance/ar/receipts/${id}`),
    createReceipt: (data) => api.post('/finance/ar/receipts', data),
    voidReceipt: (id, data) => api.post(`/finance/ar/receipts/${id}/void`, data),
    generateReceiptNumber: () => api.get('/finance/ar/receipts/generate-number'),
    getUnpaidReceiptInvoices: () => api.get('/finance/ar/receipts/unpaid-invoices'),

    // 付款记录
    getPayments: (params) => api.get('/finance/ap/payments', { params }),
    getPayment: (id) => api.get(`/finance/ap/payments/${id}`),
    createPayment: (data) => api.post('/finance/ap/payments', data),
    voidPayment: (id, data) => api.post(`/finance/ap/payments/${id}/void`, data),

    tax: {
        getInvoices: (params) => api.get('/finance/tax/invoices', { params }),
        createInvoice: (data) => api.post('/finance/tax/invoices', data),
        certifyInvoice: (id, data) => api.post(`/finance/tax/invoices/${id}/certify`, data),
        deductInvoice: (id, data) => api.post(`/finance/tax/invoices/${id}/deduct`, data),
        voidInvoice: (id) => api.post(`/finance/tax/invoices/${id}/void`),
        updateInvoiceNumber: (id, data) => api.put(`/finance/tax/invoices/${id}/invoice-number`, data),
        getAvailableDocuments: (params) => api.get('/finance/tax/available-documents', { params }),
        linkInvoice: (id, data) => api.post(`/finance/tax/invoices/${id}/link`, data),
        unlinkInvoice: (id) => api.post(`/finance/tax/invoices/${id}/unlink`),
        getReturns: (params) => api.get('/finance/tax/returns', { params }),
        createReturn: (data) => api.post('/finance/tax/returns', data),
        getReturn: (id) => api.get(`/finance/tax/returns/${id}`),
        submitReturn: (id, data) => api.post(`/finance/tax/returns/${id}/submit`, data),
        payReturn: (id, data) => api.post(`/finance/tax/returns/${id}/pay`, data),
        voidReturnPayment: (id, data) => api.post(`/finance/tax/returns/${id}/void-payment`, data),
        deleteReturn: (id) => api.delete(`/finance/tax/returns/${id}`),
        getAccountConfig: () => api.get('/finance/tax/account-config'),
        createAccountConfig: (data) => api.post('/finance/tax/account-config', data),
        updateAccountConfig: (id, data) => api.put(`/finance/tax/account-config/${id}`, data),
        deleteAccountConfig: (id) => api.delete(`/finance/tax/account-config/${id}`)
    },

    // 银行账户管理
    getBankAccounts: (params) => api.get('/finance/bank-accounts', { params }),

    getBankAccount: (id) => api.get(`/finance/bank-accounts/${id}`),
    createBankAccount: (data) => api.post('/finance/bank-accounts', data),
    updateBankAccount: (id, data) => api.put(`/finance/bank-accounts/${id}`, data),
    updateBankAccountStatus: (id, data) => api.patch(`/finance/bank-accounts/${id}/status`, data),
    getBankAccountsStats: () => api.get('/finance/bank-accounts/stats'),

    bankTransactions: {
        getList: (params) => api.get('/finance/bank-transactions', { params }),
        getDetail: (id) => api.get(`/finance/bank-transactions/${id}`),
        create: (data) => api.post('/finance/bank-transactions', data),
        createTransfer: (data) => api.post('/finance/bank-transactions/transfer', data),
        update: (id, data) => api.put(`/finance/bank-transactions/${id}`, data),
        delete: (id) => api.delete(`/finance/bank-transactions/${id}`),
        getPrintData: (params) => api.get('/finance/bank-transactions/print-data', { params }),
        import: (data) => api.post('/finance/bank-transactions/import', data, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }),
        submit: (id, data) => api.post(`/finance/bank-transactions/${id}/submit`, data),
        audit: (id, data) => api.post(`/finance/bank-transactions/${id}/audit`, data)
    },

    cashTransactions: {
        getList: (params) => api.get('/finance/cash-transactions', { params }),
        getStats: (params) => api.get('/finance/cash-transactions/stats', { params }),
        create: (data) => api.post('/finance/cash-transactions', data),
        update: (id, data) => api.put(`/finance/cash-transactions/${id}`, data),
        delete: (id) => api.delete(`/finance/cash-transactions/${id}`),
        submit: (id) => api.put(`/finance/cash-transactions/${id}/submit`),
        approve: (id, data) => api.put(`/finance/cash-transactions/${id}/approve`, data),
        reject: (id, data) => api.put(`/finance/cash-transactions/${id}/reject`, data),
        export: (params) => api.get('/finance/cash-transactions/export', { params, responseType: 'blob' }),
        import: (data) => api.post('/finance/cash-transactions/import', data, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }),
        getPrintData: (params) => api.get('/finance/cash-transactions/print-data', { params })
    },

    reconciliation: {
        importStatement: (data) => api.post('/finance/cash/reconciliation/import-statement', data, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }),
        getStats: (params) => api.get('/finance/cash/reconciliation/stats', { params }),
        getMatchedTransaction: (params) => api.get('/finance/cash/reconciliation/matched-transaction', { params }),
        getPossibleMatches: (params) => api.get('/finance/cash/reconciliation/possible-matches', { params }),
        confirmMatch: (data) => api.post('/finance/cash/reconciliation/confirm-match', data),
        cancelReconciliation: (data) => api.post('/finance/cash/reconciliation/cancel-reconciled', data)
    },

    // 产品定价
    getPricingList: (params) => api.get('/finance/pricing', { params }),
    getPricingDetail: (productId) => api.get(`/finance/pricing/${productId}`),
    calculateBomCost: (productId) => api.get(`/finance/pricing/calculate-bom/${productId}`),
    createPricing: (data) => api.post('/finance/pricing', data),
    getPricingHistory: (productId) => api.get(`/finance/pricing/${productId}/history`),
    getBomDetails: (productId) => api.get(`/finance/pricing/${productId}/bom`),
    exportPricingList: (params) => api.get('/finance/pricing/export', { params, responseType: 'blob' }),

    // 定价设置
    getPricingSettings: () => api.get('/finance/pricing/settings'),
    updatePricingSettings: (data) => api.put('/finance/pricing/settings', data),

    // 定价策略字段管理
    getStrategyFields: (params) => api.get('/finance/pricing/strategy-fields', { params }),
    createStrategyField: (data) => api.post('/finance/pricing/strategy-fields', data),
    updateStrategyField: (id, data) => api.put(`/finance/pricing/strategy-fields/${id}`, data),
    deleteStrategyField: (id) => api.delete(`/finance/pricing/strategy-fields/${id}`),
    toggleStrategyField: (id) => api.patch(`/finance/pricing/strategy-fields/${id}/toggle`),

    // BOM价格调整
    getBomPriceAdjustments: (productId) => api.get(`/finance/bom-price-adjustments/${productId}`),
    saveBomPriceAdjustment: (data) => api.post('/finance/bom-price-adjustments', data),
    getBomPriceHistory: (productId, materialId) => api.get(`/finance/bom-price-adjustments/${productId}/${materialId}/history`),
    deleteBomPriceAdjustment: (id) => api.delete(`/finance/bom-price-adjustments/${id}`),


    // Cost settings and allocation
    cost: {
        getSettings: () => api.get('/finance/cost/settings'),
        saveSettings: (data) => api.post('/finance/cost/settings', data),
        getSupplementReasons: () => api.get('/finance/cost/supplement-reasons'),
        saveSupplementReason: (data) => data?.id
            ? api.put(`/finance/cost/supplement-reasons/${data.id}`, data)
            : api.post('/finance/cost/supplement-reasons', data),
        deleteSupplementReason: (id) => api.delete(`/finance/cost/supplement-reasons/${id}`),
        getGLAccounts: () => api.get('/finance/cost/gl-accounts'),
        getGLMappings: () => api.get('/finance/cost/gl-mappings'),
        saveGLMappings: (mappings) => api.post('/finance/cost/gl-mapping', { mappings }),
        getMaterialStandardCosts: (params) => api.get('/finance/cost/material-standard-costs', { params }),
        freezeMaterialStandardCosts: (data) => api.post('/finance/cost/material-standard-costs/freeze', data),
        updateMaterialStandardCost: (id, data) => api.put(`/finance/cost/material-standard-costs/${id}`, data),
        getAllocationBases: () => api.get('/finance/cost/overhead-allocation/bases'),
        getAllocationRules: () => api.get('/finance/cost/overhead-allocation'),
        getAllocationRulesByParams: (params) => api.get('/finance/cost/overhead-allocation', { params }),
        saveAllocationRule: (data) => data?.id
            ? api.put(`/finance/cost/overhead-allocation/${data.id}`, data)
            : api.post('/finance/cost/overhead-allocation', data),
        deleteAllocationRule: (id) => api.delete(`/finance/cost/overhead-allocation/${id}`),
        getCostCenters: () => api.get('/finance/cost-centers'),
        getCostCenterOptions: () => api.get('/finance/cost-centers/options'),
        getCostCenterReport: (params) => api.get('/finance/cost-centers/report', { params }),
        createCostCenter: (data) => api.post('/finance/cost-centers', data),
        updateCostCenter: (id, data) => api.put(`/finance/cost-centers/${id}`, data),
        deleteCostCenter: (id) => api.delete(`/finance/cost-centers/${id}`),
        getCostLedger: (params) => api.get('/finance/cost-ledger', { params }),
        getCostLedgerSummary: (dimension, params) => api.get(`/finance/cost-ledger/summary/${dimension}`, { params }),
        getCostLedgerTask: (taskId) => api.get(`/finance/cost-ledger/task/${taskId}`),
        getActualCost: (params) => api.get('/finance/cost/actual', { params }),
        getActualCostDetail: (taskId) => api.get(`/finance/cost/actual/${taskId}`),
        getStatistics: () => api.get('/finance/cost/statistics'),
        getTrend: (params) => api.get('/finance/cost/trend', { params }),
        getComposition: () => api.get('/finance/cost/composition'),
        getVariance: (params) => api.get('/finance/cost/variance', { params }),
        getVarianceDetail: (taskId) => api.get(`/finance/cost/variance/${taskId}`),
        getEfficiencyVariance: (params) => api.get('/finance/cost-centers/efficiency-variance', { params }),
        getCapacityUtilization: (params) => api.get('/finance/cost-centers/capacity-utilization', { params }),
        getAlerts: () => api.get('/finance/cost/alerts'),
        getAlertSettings: () => api.get('/finance/cost/alert-settings'),
        saveAlertSettings: (data) => api.post('/finance/cost/alert-settings', data),
        getYearlyComparison: (params) => api.get('/finance/cost/yearly-comparison', { params }),
        getActivities: () => api.get('/finance/activity-cost/activities'),
        getActivitySummary: () => api.get('/finance/activity-cost/summary'),
        createActivity: (data) => api.post('/finance/activity-cost/activities', data),
        updateActivity: (id, data) => api.put(`/finance/activity-cost/activities/${id}`, data),
        deleteActivity: (id) => api.delete(`/finance/activity-cost/activities/${id}`),
        getCostVersions: (params) => api.get('/finance/cost-versions', { params }),
        createCostVersion: (data) => api.post('/finance/cost-versions', data),
        generateCostVersion: (id) => api.post(`/finance/cost-versions/${id}/generate`),
        submitCostVersion: (id) => api.put(`/finance/cost-versions/${id}/submit`),
        approveCostVersion: (id) => api.put(`/finance/cost-versions/${id}/approve`),
        getProfitabilitySummary: (params) => api.get('/finance/profitability/summary', { params }),
        getProfitabilityProducts: (params) => api.get('/finance/profitability/products', { params }),
        getProfitabilityCustomers: (params) => api.get('/finance/profitability/customers', { params }),
        getProfitabilityTrend: (params) => api.get('/finance/profitability/trend', { params }),
        getStandardCostList: (params) => api.get('/finance/cost/standard-list', { params }),
        calculateStandardCost: (productId, data) => api.post(`/finance/cost/standard/${productId}/calculate`, data),
        getStandardCost: (productId) => api.get(`/finance/cost/standard/${productId}`),
        getClosingStatus: (params) => api.get('/finance/cost/closing/status', { params }),
        executeClosingWorkbench: (periodId) => api.post(`/finance/cost/closing/${periodId}/execute`),
        getPeriods: () => api.get('/finance/periods'),
        calculateWIP: (params) => api.post('/finance/automation/wip/calculate', null, { params }),
        generateWIPVoucher: (periodId) => api.post(`/finance/automation/wip/voucher/${periodId}`),
        executeCostClosing: (periodId) => api.post(`/finance/automation/cost-closing/${periodId}`)
    },

    // Expenses
    getExpenses: (params) => api.get('/finance/expenses', { params }),
    getExpense: (id) => api.get(`/finance/expenses/${id}`),
    createExpense: (data) => api.post('/finance/expenses', data),
    updateExpense: (id, data) => api.put(`/finance/expenses/${id}`, data),
    deleteExpense: (id) => api.delete(`/finance/expenses/${id}`),
    getExpenseCategories: (params) => api.get('/finance/expenses/categories', { params }),
    initExpenseCategories: () => api.post('/finance/expenses/init'),
    createExpenseCategory: (data) => api.post('/finance/expenses/categories', data),
    updateExpenseCategory: (id, data) => api.put(`/finance/expenses/categories/${id}`, data),
    deleteExpenseCategory: (id) => api.delete(`/finance/expenses/categories/${id}`),
    getExpenseStats: () => api.get('/finance/expenses/stats'),
    generateExpenseNumber: () => api.get('/finance/expenses/generate-number'),
    submitExpense: (id) => api.post(`/finance/expenses/${id}/submit`),
    approveExpense: (id, data) => api.post(`/finance/expenses/${id}/approve`, data),
    payExpense: (id, data) => api.post(`/finance/expenses/${id}/pay`, data),
    voidExpensePayment: (id, data) => api.post(`/finance/expenses/${id}/void-payment`, data),
    cancelExpense: (id) => api.post(`/finance/expenses/${id}/cancel`),
    importDingtalkExpenses: (data) => api.post('/dingtalk/import', data),

    // Fixed assets
    getAssets: (params) => api.get('/finance/assets', { params }),
    getAsset: (id) => api.get(`/finance/assets/${id}`),
    createAsset: (data) => api.post('/finance/assets', data),
    updateAsset: (id, data) => api.put(`/finance/assets/${id}`, data),
    getAssetCategories: (params) => api.get('/finance/assets/categories', { params }),
    createAssetCategory: (data) => api.post('/finance/assets/categories', data),
    updateAssetCategory: (id, data) => api.put(`/finance/assets/categories/${id}`, data),
    deleteAssetCategory: (id) => api.delete(`/finance/assets/categories/${id}`),
    getAssetStats: () => api.get('/finance/assets/stats'),
    getAssetDashboardStats: () => api.get('/finance/assets/dashboard/stats'),
    getAssetDepreciationForecast: (params) => api.get('/finance/assets/depreciation/forecast', { params }),
    assetInventory: {
        getList: (params) => api.get('/finance/assets-inventory', { params }),
        create: (data) => api.post('/finance/assets-inventory', data),
        getDetail: (id) => api.get(`/finance/assets-inventory/${id}`),
        updateItem: (inventoryId, itemId, data) =>
            api.put(`/finance/assets-inventory/${inventoryId}/items/${itemId}`, data),
        complete: (id) => api.post(`/finance/assets-inventory/${id}/complete`)
    },
    assetCip: {
        getList: (params) => api.get('/finance/assets-cip', { params }),
        create: (data) => api.post('/finance/assets-cip', data),
        update: (id, data) => api.put(`/finance/assets-cip/${id}`, data),
        delete: (id) => api.delete(`/finance/assets-cip/${id}`),
        addCost: (id, data) => api.post(`/finance/assets-cip/${id}/cost`, data),
        transfer: (id, data) => api.post(`/finance/assets-cip/${id}/transfer`, data)
    },
    generateAssetCode: (params) => api.get('/finance/assets/generate-code', { params }),
    calculateAssetDepreciation: (params) => api.get('/finance/assets/depreciation/calculate', { params }),
    getAssetDepreciationRecords: (params) => api.get('/finance/assets/depreciation/records', { params }),
    submitAssetDepreciation: (data) => api.post('/finance/assets/depreciation/submit', data),
    auditAsset: (id, data) => api.post(`/finance/assets/${id}/audit`, data),
    transferAsset: (id, data) => api.post(`/finance/assets/${id}/transfer`, data),
    splitAsset: (id, data) => api.post(`/finance/assets/${id}/split`, data),
    impairAsset: (id, data) => api.post(`/finance/assets/${id}/impairments`, data),
    getAssetChangeLogs: (id) => api.get(`/finance/assets/${id}/change-logs`),
    getAssetDepreciationHistory: (id) => api.get(`/finance/assets/${id}/depreciation-history`),
    getAssetImpairments: (id) => api.get(`/finance/assets/${id}/impairments`),
    disposeAsset: (id, data) => api.post(`/finance/assets/${id}/dispose`, data),


    // 财务自动化
    automation: {
        // 定时任务状态管理
        getTaskStatus: () => api.get('/finance/automation/scheduled-tasks/status'),
        startScheduledTasks: () => api.post('/finance/automation/scheduled-tasks/start'),
        stopScheduledTasks: () => api.post('/finance/automation/scheduled-tasks/stop'),
        restartScheduledTask: (taskName) => api.post(`/finance/automation/scheduled-tasks/restart/${taskName}`),
        // 折旧计提
        executeDepreciation: (month) => api.post(`/finance/automation/depreciation/monthly/${month}`),
        executeDepreciationManually: (month) => api.post(`/finance/automation/depreciation/manual/${month}`),
        // 期末结转
        executePeriodEnd: (periodId) => api.post(`/finance/automation/period-end/auto-closing/${periodId}`),
        executePeriodEndManually: (periodId) => api.post(`/finance/automation/period-end/manual-closing/${periodId}`),
        getFinanceYearEndStatus: (year) => api.get(`/finance/period/year-end-status/${year}`),
        executeFinanceYearEnd: (year) => api.post('/finance/period/year-end-transfer', { year }),
        getHistory: (params) => api.get('/finance/automation/history', { params }),
        getFailedJobs: (params) => api.get('/finance/automation/failed-jobs', { params }),
        retryFailedJobs: (data) => api.post('/finance/automation/failed-jobs/retry', data),
        resolveFailedJob: (id) => api.put(`/finance/automation/failed-jobs/${id}/resolve`),
        // 生产成本
        executeProductionCost: (taskId) => api.post(`/finance/automation/production/cost-entry/${taskId}`)
    }
};
