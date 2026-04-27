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

    // 应收账款
    getReceivables: (params) => api.get('/finance/receivables', { params }),
    getReceivable: (id) => api.get(`/finance/receivables/${id}`),
    createReceivable: (data) => api.post('/finance/receivables', data),
    updateReceivable: (id, data) => api.put(`/finance/receivables/${id}`, data),
    deleteReceivable: (id) => api.delete(`/finance/receivables/${id}`),

    // 应付账款
    getPayables: (params) => api.get('/finance/payables', { params }),
    getPayable: (id) => api.get(`/finance/payables/${id}`),
    createPayable: (data) => api.post('/finance/payables', data),
    updatePayable: (id, data) => api.put(`/finance/payables/${id}`, data),
    deletePayable: (id) => api.delete(`/finance/payables/${id}`),

    // 收款记录
    getReceipts: (params) => api.get('/finance/receipts', { params }),
    getReceipt: (id) => api.get(`/finance/receipts/${id}`),
    createReceipt: (data) => api.post('/finance/receipts', data),
    updateReceipt: (id, data) => api.put(`/finance/receipts/${id}`, data),
    deleteReceipt: (id) => api.delete(`/finance/receipts/${id}`),

    // 付款记录
    getPayments: (params) => api.get('/finance/payments', { params }),
    getPayment: (id) => api.get(`/finance/payments/${id}`),
    createPayment: (data) => api.post('/finance/payments', data),
    updatePayment: (id, data) => api.put(`/finance/payments/${id}`, data),
    deletePayment: (id) => api.delete(`/finance/payments/${id}`),

    // 发票管理
    getInvoices: (params) => api.get('/finance/invoices', { params }),
    getInvoice: (id) => api.get(`/finance/invoices/${id}`),
    createInvoice: (data) => api.post('/finance/invoices', data),
    updateInvoice: (id, data) => api.put(`/finance/invoices/${id}`, data),
    deleteInvoice: (id) => api.delete(`/finance/invoices/${id}`),

    // 银行账户管理
    getBankAccounts: (params) => api.get('/finance/baseData/bankAccounts', { params }),
    getBankAccount: (id) => api.get(`/finance/cash/bank-accounts/${id}`),
    createBankAccount: (data) => api.post('/finance/cash/bank-accounts', data),
    updateBankAccount: (id, data) => api.put(`/finance/cash/bank-accounts/${id}`, data),
    deleteBankAccount: (id) => api.delete(`/finance/cash/bank-accounts/${id}`),
    getBankAccountsStats: () => api.get('/finance/cash/bank-accounts/stats'),

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
        executeProductionCost: (taskId) => api.post(`/finance/automation/production/cost-entry/${taskId}`),
        generateMaterialIssueEntry: (data) => api.post('/finance/automation/production/material-issue-entry', data)
    }
};
