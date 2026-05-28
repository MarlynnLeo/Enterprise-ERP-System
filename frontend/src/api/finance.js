import { api } from '../services/axiosInstance';

export const financeApi = {
    // ============ 仪表盘 & 统计 ============
    // 现金流统计（收支趋势、按类型汇总）
    getCashFlowStatistics: (params) => api.get('/finance/statistics/cash-flow', { params }),
    // 综合财务统计（仪表盘汇总用）
    getFinancialStatistics: (params) => api.get('/finance/statistics/cash-flow', { params }),
    // 应收账款账龄分析
    getReceivablesAging: (params) => api.get('/finance/ar/aging', { params }),
    // 应付账款账龄分析
    getPayablesAging: (params) => api.get('/finance/ap/aging', { params }),
    // 会计分录列表
    getEntries: (params) => api.get('/finance/entries', { params }),
    // 会计分录详情
    getEntry: (id) => api.get(`/finance/entries/${id}`),

    // ============ 应收账款（AR）============
    // 注意：实际后端路由为 /finance/ar/invoices，不是 /finance/receivables
    getARInvoices: (params, config = {}) => api.get('/finance/ar/invoices', { ...config, params }),
    getARInvoice: (id) => api.get(`/finance/ar/invoices/${id}`),
    createARInvoice: (data) => api.post('/finance/ar/invoices', data),
    updateARInvoice: (id, data) => api.put(`/finance/ar/invoices/${id}`, data),
    updateARInvoiceStatus: (id, data) => api.put(`/finance/ar/invoices/${id}/status`, data),
    getARInvoicePayments: (id) => api.get(`/finance/ar/invoices/${id}/payments`),

    // ============ 应付账款（AP）============
    // 注意：实际后端路由为 /finance/ap/invoices，不是 /finance/payables
    getAPInvoices: (params, config = {}) => api.get('/finance/ap/invoices', { ...config, params }),
    getAPInvoice: (id) => api.get(`/finance/ap/invoices/${id}`),
    createAPInvoice: (data) => api.post('/finance/ap/invoices', data),
    updateAPInvoice: (id, data) => api.put(`/finance/ap/invoices/${id}`, data),
    updateAPInvoiceStatus: (id, data) => api.put(`/finance/ap/invoices/${id}/status`, data),
    getAPInvoicePayments: (id) => api.get(`/finance/ap/invoices/${id}/payments`),
    getUnpaidAPInvoices: () => api.get('/finance/ap/invoices/unpaid'),

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
        unlinkInvoice: (id) => api.post(`/finance/tax/invoices/${id}/unlink`)
    },

    // 银行账户管理
    getBankAccounts: (params) => api.get('/finance/bank-accounts', { params }),
    getBankAccountsList: (params) => api.get('/finance/bank-accounts', { params }),
    getBankAccount: (id) => api.get(`/finance/bank-accounts/${id}`),
    createBankAccount: (data) => api.post('/finance/bank-accounts', data),
    updateBankAccount: (id, data) => api.put(`/finance/bank-accounts/${id}`, data),
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
        audit: (id, data) => api.post(`/finance/bank-transactions/${id}/audit`, data),
        reconcile: (id, data) => api.patch(`/finance/bank-transactions/${id}/reconcile`, data)
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
        batchMarkReconciled: (data) => api.post('/finance/cash/reconciliation/batch-mark-reconciled', data),
        getMatchedTransaction: (params) => api.get('/finance/cash/reconciliation/matched-transaction', { params }),
        getPossibleMatches: (params) => api.get('/finance/cash/reconciliation/possible-matches', { params }),
        confirmMatch: (data) => api.post('/finance/cash/reconciliation/confirm-match', data)
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
    getCostSupplementReasons: () => api.get('/finance/cost/supplement-reasons'),
    saveCostSupplementReason: (data) => data?.id
        ? api.put(`/finance/cost/supplement-reasons/${data.id}`, data)
        : api.post('/finance/cost/supplement-reasons', data),
    deleteCostSupplementReason: (id) => api.delete(`/finance/cost/supplement-reasons/${id}`),

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
        saveAllocationRule: (data) => data?.id
            ? api.put(`/finance/cost/overhead-allocation/${data.id}`, data)
            : api.post('/finance/cost/overhead-allocation', data),
        deleteAllocationRule: (id) => api.delete(`/finance/cost/overhead-allocation/${id}`),
        getCostCenters: () => api.get('/finance/cost-centers'),
        getStatistics: () => api.get('/finance/cost/statistics'),
        getTrend: (params) => api.get('/finance/cost/trend', { params }),
        getComposition: () => api.get('/finance/cost/composition'),
        getVariance: (params) => api.get('/finance/cost/variance', { params }),
        getAlerts: () => api.get('/finance/cost/alerts'),
        getAlertSettings: () => api.get('/finance/cost/alert-settings'),
        saveAlertSettings: (data) => api.post('/finance/cost/alert-settings', data),
        getYearlyComparison: (params) => api.get('/finance/cost/yearly-comparison', { params }),
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
    getExpenseStats: () => api.get('/finance/expenses/stats'),
    generateExpenseNumber: () => api.get('/finance/expenses/generate-number'),
    submitExpense: (id) => api.post(`/finance/expenses/${id}/submit`),
    approveExpense: (id, data) => api.post(`/finance/expenses/${id}/approve`, data),
    payExpense: (id, data) => api.post(`/finance/expenses/${id}/pay`, data),
    cancelExpense: (id) => api.post(`/finance/expenses/${id}/cancel`),
    importDingtalkExpenses: (data) => api.post('/dingtalk/import', data),

    // Fixed assets
    getAssets: (params) => api.get('/finance/assets', { params }),
    getAsset: (id) => api.get(`/finance/assets/${id}`),
    createAsset: (data) => api.post('/finance/assets', data),
    updateAsset: (id, data) => api.put(`/finance/assets/${id}`, data),
    getAssetCategories: () => api.get('/finance/assets/categories'),
    getAssetStats: () => api.get('/finance/assets/stats'),
    generateAssetCode: (params) => api.get('/finance/assets/generate-code', { params }),
    auditAsset: (id, data) => api.post(`/finance/assets/${id}/audit`, data),
    transferAsset: (id, data) => api.post(`/finance/assets/${id}/transfer`, data),
    splitAsset: (id, data) => api.post(`/finance/assets/${id}/split`, data),
    impairAsset: (id, data) => api.post(`/finance/assets/${id}/impairments`, data),
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
        // 生产成本
        executeProductionCost: (taskId) => api.post(`/finance/automation/production/cost-entry/${taskId}`)
    }
};
