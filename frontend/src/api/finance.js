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
    getARInvoices: (params) => api.get('/finance/ar/invoices', { params }),
    getARInvoice: (id) => api.get(`/finance/ar/invoices/${id}`),
    createARInvoice: (data) => api.post('/finance/ar/invoices', data),
    updateARInvoice: (id, data) => api.put(`/finance/ar/invoices/${id}`, data),

    // ============ 应付账款（AP）============
    // 注意：实际后端路由为 /finance/ap/invoices，不是 /finance/payables
    getAPInvoices: (params) => api.get('/finance/ap/invoices', { params }),
    getAPInvoice: (id) => api.get(`/finance/ap/invoices/${id}`),
    createAPInvoice: (data) => api.post('/finance/ap/invoices', data),
    updateAPInvoice: (id, data) => api.put(`/finance/ap/invoices/${id}`, data),

    // 收款记录
    getReceipts: (params) => api.get('/finance/ar/receipts', { params }),
    getReceipt: (id) => api.get(`/finance/ar/receipts/${id}`),
    createReceipt: (data) => api.post('/finance/ar/receipts', data),

    // 付款记录
    getPayments: (params) => api.get('/finance/ap/payments', { params }),
    getPayment: (id) => api.get(`/finance/ap/payments/${id}`),
    createPayment: (data) => api.post('/finance/ap/payments', data),

    // 银行账户管理
    getBankAccounts: (params) => api.get('/finance/baseData/bankAccounts', { params }),
    getBankAccount: (id) => api.get(`/finance/bank-accounts/${id}`),
    createBankAccount: (data) => api.post('/finance/bank-accounts', data),
    updateBankAccount: (id, data) => api.put(`/finance/bank-accounts/${id}`, data),
    getBankAccountsStats: () => api.get('/finance/bank-accounts/stats'),

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
