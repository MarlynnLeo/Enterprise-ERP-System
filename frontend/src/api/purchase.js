import { api, fastApi } from '../services/axiosInstance';
import { baseDataApi } from './baseData';
import { normalizePurchaseReceivingItems } from '../utils/purchaseReceiving';
import { normalizePurchaseReceiptPayload } from '../utils/purchaseReceipts';
import {
    normalizePurchaseOrderResponse,
    normalizePurchaseRequisitionResponse
} from '../utils/purchaseContracts';

export { normalizePurchaseReceivingItems } from '../utils/purchaseReceiving';
export {
    normalizePurchaseOrder,
    normalizePurchaseOrderItem,
    normalizePurchaseOrderResponse,
    normalizePurchaseRequisition,
    normalizePurchaseRequisitionItem,
    normalizePurchaseRequisitionResponse
} from '../utils/purchaseContracts';

export const createIdempotencyKey = (prefix) => {
    const uuid = globalThis.crypto?.randomUUID?.();
    return `${prefix}:${uuid || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
};


export const purchaseApi = {
    // 采购申请
    getRequisitions: async (params) => {
        try {
            // 确保数组参数被正确处理
            let apiUrl = '/purchase/requisitions';

            // 特殊处理status参数，确保它作为查询字符串直接附加
            if (params && params.status && Array.isArray(params.status)) {
                const baseParams = { ...params };
                delete baseParams.status; // 从常规参数中移除status

                // 构建URL，直接附加status[]参数
                const searchParams = new URLSearchParams();
                for (const key in baseParams) {
                    searchParams.append(key, baseParams[key]);
                }

                // 为每个status值添加status[]参数
                params.status.forEach(s => {
                    searchParams.append('status[]', s);
                });

                // 组合成完整URL
                apiUrl = `${apiUrl}?${searchParams.toString()}`;

                // 发送请求，不再使用params参数
                const response = await fastApi.get(apiUrl);
                return normalizePurchaseRequisitionResponse(response);
            }

            // 如果没有status数组，使用标准方式发送请求
            const config = { params };
            const response = await fastApi.get(apiUrl, config);
            return normalizePurchaseRequisitionResponse(response);
        } catch (error) {
            console.error('采购申请列表API错误:', error);
            throw error;
        }
    },
    getRequisition: async (id) => {
        try {
            const response = await api.get(`/purchase/requisitions/${id}`);
            return normalizePurchaseRequisitionResponse(response);
        } catch (error) {
            console.error('采购申请详情API错误:', error);
            throw error;
        }
    },
    getProductionPlanRequisitionStatus: (params) => api.get('/purchase/requisitions/production-status', { params }),
    createRequisition: (data) => api.post('/purchase/requisitions', data),
    updateRequisition: (id, data) => api.put(`/purchase/requisitions/${id}`, data),
    deleteRequisition: (id) => api.delete(`/purchase/requisitions/${id}`),
    updateRequisitionStatus: (id, data) => api.put(`/purchase/requisitions/${id}/status`, data),

    // 采购订单
    getOrders: async (params) => {
        try {
            const response = await fastApi.get('/purchase/orders', { params });
            return normalizePurchaseOrderResponse(response);
        } catch (error) {
            console.error('获取订单列表失败:', error);
            throw error;
        }
    },
    getOrder: async (id) => {
        try {
            const response = await api.get(`/purchase/orders/${id}`);
            return normalizePurchaseOrderResponse(response);
        } catch (error) {
            console.error('获取订单详情失败:', error);
            throw error;
        }
    },
    createOrder: async (order) => {
        // HTTP 只认 camelCase
        const orderData = {
            ...order,
            requisitionId: order.requisitionId ?? order.requisition_id ?? null,
            requisitionNumber: order.requisitionNumber ?? order.requisition_number ?? null,
        };
        delete orderData.requisition_id;
        delete orderData.requisition_number;

        const response = await api.post('/purchase/orders', orderData);
        return response;
    },
    updateOrder: async (id, order) => {
        // HTTP 只认 camelCase
        const orderData = {
            ...order,
            requisitionId: order.requisitionId ?? order.requisition_id ?? null,
            requisitionNumber: order.requisitionNumber ?? order.requisition_number ?? null,
        };
        delete orderData.requisition_id;
        delete orderData.requisition_number;

        const response = await api.put(`/purchase/orders/${id}`, orderData);
        return response;
    },
    deleteOrder: (id) => api.delete(`/purchase/orders/${id}`),

    // 获取特定供应商特定物料的历史最新有效价格
    getLatestPrice: (params) => api.get('/purchase/orders/latest-price', { params }),
    getLatestPrices: (data) => api.post('/purchase/orders/latest-prices', data),
    updateOrderStatus: (id, status) => {
        // 处理status参数格式
        // 如果status是字符串，将其转换为{newStatus: status}格式
        const data = (typeof status === 'string') ?
            { newStatus: status } :
            // 如果status是对象但没有newStatus字段，也确保转换为正确格式
            (typeof status === 'object' && !status.newStatus) ?
                { newStatus: status.status || 'draft' } :
                // 否则假设已经是正确格式
                status;

        return api.put(`/purchase/orders/${id}/status`, data);
    },
    batchUpdateOrderStatus: (orderIds, status) => api.put('/purchase/orders/batch-status', {
        orderIds,
        newStatus: status
    }),
    updateOrderItemsReceived: (id, items) => api.put(`/purchase/orders/${id}/items-received`, {
        items: normalizePurchaseReceivingItems(items),
    }),
    receiveOrderWithInspection: (id, items) => api.post(`/purchase/orders/${id}/receive-with-inspection`, {
        items: normalizePurchaseReceivingItems(items),
    }),
    getOrderStats: () => api.get('/purchase/orders/statistics'),

    // 采购订单关联申请单
    getOrderRequisitions: async (params) => {
        const response = await api.get('/purchase/order-requisitions', { params });
        return normalizePurchaseRequisitionResponse(response);
    },
    getOrderRequisition: async (id) => {
        const response = await api.get(`/purchase/order-requisitions/${id}`);
        return normalizePurchaseRequisitionResponse(response);
    },

    // 采购入库
    getReceipts: (params) => api.get('/purchase/receipts', { params }),
    getPurchaseHistoryItems: (params) => api.get('/purchase/receipts/history-items', { params }),
    getReceipt: (id) => api.get(`/purchase/receipts/${id}`),
    outsourcedProcessing: {
        getList: (params) => api.get('/purchase/outsourced-processings', { params }),
        getSupplierOptions: (params = {}) => api.get('/purchase/outsourced-processings/options/suppliers', { params }),
        getMaterialOptions: (params = {}) => api.get('/purchase/outsourced-processings/options/materials', { params }),
        getDetail: (id) => api.get(`/purchase/outsourced-processings/${id}`),
        create: (data) => api.post('/purchase/outsourced-processings', data),
        update: (id, data) => api.put(`/purchase/outsourced-processings/${id}`, data),
        updateStatus: (id, status) => api.put(`/purchase/outsourced-processings/${id}/status`, { status }),
        delete: (id) => api.delete(`/purchase/outsourced-processings/${id}`)
    },
    outsourcedReceipts: {
        getList: (params) => api.get('/purchase/outsourced-receipts', { params }),
        getWarehouseOptions: (params = {}) => api.get('/purchase/outsourced-receipts/options/warehouses', { params }),
        getProcessingOptions: (params = {}) => api.get('/purchase/outsourced-receipts/options/processings', { params }),
        getProcessingDetail: (id) => api.get(`/purchase/outsourced-receipts/options/processings/${id}`),
        getDetail: (id) => api.get(`/purchase/outsourced-receipts/${id}`),
        create: (data) => api.post('/purchase/outsourced-receipts', data),
        update: (id, data) => api.put(`/purchase/outsourced-receipts/${id}`, data),
        updateStatus: (id, status) => api.put(`/purchase/outsourced-receipts/${id}/status`, { status }),
        receiveWithInspection: (id, items, idempotencyKey) => api.post(
            `/purchase/outsourced-receipts/${id}/receive-with-inspection`,
            { items },
            { headers: { 'X-Idempotency-Key': idempotencyKey || createIdempotencyKey(`outsourced-arrival:${id}`) } }
        ),
        arrive: (id, items) => api.post(`/purchase/outsourced-receipts/${id}/arrive`, { items })
    },
    createReceipt: (data) => api.post('/purchase/receipts', normalizePurchaseReceiptPayload(data), {
        headers: { 'Idempotency-Key': data.idempotencyKey || createIdempotencyKey('purchase-receipt') }
    }),
    updateReceipt: (id, data) => api.put(`/purchase/receipts/${id}`, normalizePurchaseReceiptPayload(data)),
    updateReceiptStatus: async (id, data) => {
        try {
            // 处理status参数格式，确保与后端API期望的格式一致
            const statusData = typeof data === 'object' ? data : { status: data };

            const response = await api.put(`/purchase/receipts/${id}/status`, statusData);
            return response;
        } catch (error) {
            throw error;
        }
    },
    getReceiptStats: () => api.get('/purchase/receipts-statistics'),

    // 采购退货
    getReturns: (params) => api.get('/purchase/returns', { params }),
    getReturn: (id) => api.get(`/purchase/returns/${id}`),
    createReturn: (data) => api.post('/purchase/returns', data),
    updateReturn: (id, data) => api.put(`/purchase/returns/${id}`, data),
    deleteReturn: (id) => api.delete(`/purchase/returns/${id}`),
    updateReturnStatus: (id, data) => api.put(`/purchase/returns/${id}/status`, data),
    getReturnStats: () => api.get('/purchase/returns-statistics'),

    // 获取采购统计数据
    getStatistics: () => api.get('/purchase/statistics'),

    // 获取采购综合统计数据（用于数据概览）
    getDashboardStatistics: (params) => api.get('/purchase/dashboard-statistics', { params }),

    // 供应商基础数据统一走 baseDataApi 契约
    getSuppliers: (params = {}) => baseDataApi.getSuppliers(params || {})
};
