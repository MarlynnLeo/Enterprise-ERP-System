import { api } from '../services/axiosInstance';
import {  parseListData } from '../utils/responseParser';

export const inventoryApi = {
    // 库存查询
    getStocks: (params) => api.get('/inventory/stock', { params }),
    getStockDetail: (id) => api.get(`/inventory/stocks/${id}`),
    getStockRecords: (id) => api.get(`/inventory/stock/${id}/records`),
    // 添加通过物料ID获取库存记录的API
    getMaterialRecords: (materialId, params = {}) => api.get(`/inventory/materials/${materialId}/records`, { params }),
    // 批次库存查询
    getBatchInventory: (params) => api.get('/inventory/batch-inventory', { params }),
    // 批次流水查询
    getBatchTransactions: (params) => api.get('/inventory/batch-transactions', { params }),
    // 库存报表API
    getInventoryReport: (params) => api.get('/inventory/report', { params }),
    // 获取库存流水记录（收发结存明细）
    getTransactionList: (params) => api.get('/inventory/ledger', { params }),
    // 获取库存流水列表（流水报表页面使用）
    getTransactions: (params) => api.get('/inventory/transactions', { params }),
    // 获取库存流水统计数据
    getTransactionStats: (params) => api.get('/inventory/transactions/stats', { params }),
    // 导出库存流水报表
    exportTransactions: (params) => api.get('/inventory/transactions/export', {
        params,
        responseType: 'blob'
    }),
    // 获取看板聚合数据
    getDashboardSummary: () => api.get('/inventory/dashboard/summary'),
    // 库存统计API - 直接调用后端统计接口
    getStockStatistics: () => api.get('/inventory/stock/statistics'),
    exportStock: (data) => api.post('/inventory/stock/export', data, {
        responseType: 'blob'
    }),
    getInventoryStock: async (params) => {
        try {
            const response = await api.get('/inventory/stock', { params });

            // 使用统一解析器
            let stockData = parseListData(response, { enableLog: false });

            // 确保每个物料记录都有正确的quantity值
            stockData = stockData.map(item => {
                // 确保quantity字段是数值类型
                const quantity = item.quantity !== undefined && item.quantity !== null
                    ? parseFloat(item.quantity)
                    : 0;

                return {
                    ...item,
                    quantity: quantity,
                    // 添加stock_quantity字段以保持一致性
                    stock_quantity: quantity
                };
            });

            return {
                ...response,
                data: stockData
            };
        } catch (error) {
            console.error('获取库存数据失败:', error);
            throw error;
        }
    },

    // 库存调整
    adjustStock: (data) => api.post('/inventory/stock/adjust', data),

    // 获取物料列表（库存模块特定 - 带库存信息）
    getMaterials: (params) => api.get('/inventory/materials', { params }),

    /**
     * 获取所有物料列表
     * @param {Object} params - 查询参数
     * @returns {Promise} response.data = { list: [], total, page, pageSize }
     * 注意：不再做二次封装，组件使用 parseListData 解析
     */
    getAllMaterials: (params = {}) => api.get('/baseData/materials', {
        params: { ...params, timestamp: Date.now() },
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
    }),

    // 获取单位列表 - 与 baseDataApi.getUnits 保持一致
    getUnits: (params) => api.get('/baseData/units', { params }),

    // 获取库位列表 - 与 baseDataApi.getLocations 保持一致
    getLocations: (params) => api.get('/baseData/locations', { params }),

    // 新增出库单
    createOutbound: (data) => api.post('/inventory/outbound', data),

    // 更新出库单
    updateOutbound: (data) => api.put(`/inventory/outbound/${data.id}`, data),

    // 获取出库单列表
    getOutboundList: (params) => api.get('/inventory/outbound', {
        params: {
            page: params.page,
            pageSize: params.pageSize,
            outboundNo: params.outboundNo,
            startDate: params.startDate,
            endDate: params.endDate
        }
    }),

    // 获取出库单详情
    getOutbound: (id) => api.get(`/inventory/outbound/${id}`),

    // 删除出库单
    deleteOutbound: (id) => api.delete(`/inventory/outbound/${id}`),

    // 更新出库单状态
    updateOutboundStatus: (id, newStatus) => api.put(`/inventory/outbound/${id}/status`, { newStatus }),

    // 批量更新出库单状态
    batchUpdateOutboundStatus: (ids, newStatus) => api.put('/inventory/outbound/batch-status', { ids, newStatus }),

    // 批量删除出库单
    batchDeleteOutbound: (ids) => api.delete('/inventory/outbound/batch-delete', { data: { ids } }),

    // 导出出库单
    exportOutbound: (params) => api.get('/inventory/outbound/export', {
        params,
        responseType: 'blob'
    }),

    // 批量发料
    batchOutbound: (data) => api.post('/inventory/outbound/batch', data),

    // 搜索物料
    searchMaterials: (query) => api.get(`/inventory/materials/search?query=${query}`),

    // 获取物料库存
    getMaterialStock: async (materialId, warehouseId) => {
        try {
            if (!materialId || !warehouseId) {
                return {
                    data: {
                        quantity: 0,
                        stock_quantity: 0,
                        material_id: materialId,
                        location_id: warehouseId
                    }
                };
            }

            // 使用新的直接API
            const response = await api.get(`/inventory/stock/${materialId}/${warehouseId}`);

            if (response.data) {
                return {
                    data: response.data
                };
            }

            return {
                data: {
                    quantity: 0,
                    stock_quantity: 0,
                    material_id: materialId,
                    location_id: warehouseId
                }
            };
        } catch (error) {
            if (process.env.NODE_ENV === 'development') {
                console.error(`获取物料库存失败 (物料ID: ${materialId}, 库位ID: ${warehouseId}):`, error);
            }

            // 返回默认值，但要标记为错误状态
            return {
                data: {
                    quantity: 0,
                    stock_quantity: 0,
                    material_id: materialId,
                    location_id: warehouseId,
                    error: true,
                    errorMessage: error.message
                }
            };
        }
    },

    // 批量获取物料库存
    getBatchMaterialStock: async (materials) => {
        try {
            if (!materials || !Array.isArray(materials) || materials.length === 0) {
                return { data: [] };
            }

            // 使用批量查询API
            const response = await api.post('/inventory/stock/batch', { materials });

            // 拦截器已解包，response.data 就是业务数据
            return {
                data: response.data || []
            };
        } catch (error) {
            console.error('批量获取物料库存失败:', error);
            throw error;
        }
    },

    // 获取入库单列表
    getInboundList: (params) => api.get('/inventory/inbound', { params }),

    // 获取入库单详情
    getInboundDetail: (id) => api.get(`/inventory/inbound/${id}`),

    // 创建入库单
    createInbound: (data) => api.post('/inventory/inbound', data),

    // 从质检单创建入库单
    createInboundFromQuality: (params) => api.post('/inventory/inbound/from-quality', params),

    // 更新入库单状态
    updateInboundStatus: (id, data) => {
        // 允许传入整个对象或者简单的状态字符串
        const payload = typeof data === 'object' ? data : { newStatus: data };
        return api.put(`/inventory/inbound/status/${id}`, payload);
    },

    // 获取任务领料记录（用于生产退料）
    getTaskMaterialIssueRecords: (taskId) => api.get(`/inventory/task/${taskId}/material-issues`),

    // 库存调拨相关API
    getTransferList: (params) => api.get('/inventory/transfer', { params }),
    getTransferDetail: (id) => api.get(`/inventory/transfer/${id}`),
    createTransfer: async (data) => {
        try {
            const response = await api.post('/inventory/transfer', data);
            return response;
        } catch (error) {
            if (process.env.NODE_ENV === 'development') {
                console.error('调用创建调拨单API失败:', error);
            }
            throw error;
        }
    },
    updateTransfer: (id, data) => api.put(`/inventory/transfer/${id}`, data),
    deleteTransfer: (id) => api.delete(`/inventory/transfer/${id}`),

    // 批量删除调拨单
    batchDeleteTransfers: async (ids) => {
        try {
            const response = await api.post('/inventory/transfers/batch-delete', { ids });
            return response;
        } catch (error) {
            console.error('批量删除调拨单失败:', error);
            throw error;
        }
    },

    // 导出调拨单
    exportTransfers: async (ids) => {
        try {
            const response = await api.post('/inventory/transfers/export', { ids }, {
                responseType: 'blob'
            });
            return response;
        } catch (error) {
            console.error('导出调拨单失败:', error);
            throw error;
        }
    },

    updateTransferStatus: (id, status) => {
        const data = typeof status === 'object' ? status : { newStatus: status };
        return api.put(`/inventory/transfer/${id}/status`, data);
    },
    getTransferStatistics: () => api.get('/inventory/transfer/statistics'),

    // 库存盘点相关API
    getCheckList: (params) => api.get('/inventory/check', { params }),
    getCheckDetail: (id) => api.get(`/inventory/check/${id}`),
    createCheck: (data) => api.post('/inventory/check', data),
    updateCheck: (id, data) => api.put(`/inventory/check/${id}`, data),
    updateCheckStatus: (id, status) => api.put(`/inventory/check/${id}/status`, { status }),
    deleteCheck: (id) => api.delete(`/inventory/check/${id}`),
    getCheckStatistics: () => api.get('/inventory/check/statistics'),
    submitCheckResult: (id, data) => api.post(`/inventory/check/${id}/result`, data),
    adjustInventory: (id) => api.post(`/inventory/check/${id}/adjust`),

    // 统一的库存充足性检查
    checkStockSufficiency: (requirements) => api.post('/inventory/check-stock-sufficiency', { requirements }),

    // 库存导入导出
    downloadStockTemplate: () => api.get('/inventory/stock/template', { responseType: 'blob' }),
    importStock: (formData) => api.post('/inventory/stock/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    exportStockData: (params) => api.post('/inventory/stock/export', params, { responseType: 'blob' }),

    // 获取带库存数量的物料列表
    getMaterialsWithStock: (params) => api.get('/inventory/materials-with-stock', { params }),

    // 手工出入库
    getManualTransactions: (params) => api.get('/inventory/manual-transactions', { params }),
    getManualTransaction: (id) => api.get(`/inventory/manual-transactions/${id}`),
    createManualTransaction: (data) => api.post('/inventory/manual-transactions', data),
    createExchange: (data) => api.post('/inventory/manual-transactions/exchange', data),
    updateManualTransaction: (id, data) => api.put(`/inventory/manual-transactions/${id}`, data),
    deleteManualTransaction: (id) => api.delete(`/inventory/manual-transactions/${id}`),
    approveManualTransaction: (id, data) => api.post(`/inventory/manual-transactions/${id}/approve`, data),

    // 获取指定仓库的库存
    getStockByLocation: (params) => api.get('/inventory/stock/by-location', { params }),

    // 获取物料采购历史
    getPurchaseHistory: (materialId, params = {}) => api.get(`/purchase/receipts/material/${materialId}`, { params }),

    // 获取物料销售历史
    getSalesHistory: (materialId, params = {}) => api.get(`/sales/outbound/material/${materialId}`, { params })
};
