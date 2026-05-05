import { api, fastApi } from '../services/axiosInstance';
import { parseListData } from '../utils/responseParser';

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
                return response.data || response;
            }

            // 如果没有status数组，使用标准方式发送请求
            const config = { params };
            const response = await fastApi.get(apiUrl, config);
            return response.data || response;
        } catch (error) {
            console.error('采购申请列表API错误:', error);
            throw error;
        }
    },
    getRequisition: async (id) => {
        try {
            const response = await api.get(`/purchase/requisitions/${id}`);
            return response.data || response;
        } catch (error) {
            console.error('采购申请详情API错误:', error);
            throw error;
        }
    },
    createRequisition: (data) => api.post('/purchase/requisitions', data),
    updateRequisition: (id, data) => api.put(`/purchase/requisitions/${id}`, data),
    deleteRequisition: (id) => api.delete(`/purchase/requisitions/${id}`),
    updateRequisitionStatus: (id, data) => api.put(`/purchase/requisitions/${id}/status`, data),

    // 采购订单
    getOrders: async (params) => {
        try {
            const response = await fastApi.get('/purchase/orders', { params });

            // 使用统一解析器
            const items = parseListData(response, { enableLog: false });
            if (items.length > 0) {
                // 检查每个订单的状态，标记含有关联申请且待审批的订单
                const processedItems = items.map(order => {
                    // 确保关联申请字段统一
                    if (order.requisitionId && !order.requisition_id) {
                        order.requisition_id = order.requisitionId;
                    }
                    if (order.requisitionNumber && !order.requisition_number) {
                        order.requisition_number = order.requisitionNumber;
                    }

                    // 如果有关联申请但字段为null或undefined，确保显示为空字符串
                    if (order.requisition_id) {
                        if (!order.requisition_number) {
                            order.requisition_number = '关联申请';
                        }
                    }

                    // 标记关联申请单的订单
                    if (order.requisition_id && order.status === 'pending') {
                        // 添加标记
                        order.hasRequisition = true;
                    }
                    return order;
                });
                // 更新 response.data 以保持一致性
                if (response.data && typeof response.data === 'object') {
                    response.data.list = processedItems;
                }
            }

            return response;
        } catch (error) {
            console.error('获取订单列表失败:', error);
            throw error;
        }
    },
    getOrder: async (id) => {
        try {
            const response = await api.get(`/purchase/orders/${id}`);

            // 处理响应数据
            if (response.data) {
                // 标记关联申请单的订单
                if (response.data.requisition_id && response.data.status === 'pending') {
                    response.data.hasRequisition = true;
                }
            }

            return response;
        } catch (error) {
            console.error('获取订单详情失败:', error);
            throw error;
        }
    },
    createOrder: async (order) => {
        // 保留原始状态，不再强制设置为draft
        const orderData = {
            ...order,
            // 确保同时提供下划线和驼峰格式的关联申请字段
            requisition_id: order.requisition_id,
            requisitionId: order.requisition_id,
            requisition_number: order.requisition_number,
            requisitionNumber: order.requisition_number
        };

        const response = await api.post('/purchase/orders', orderData);
        return response;
    },
    updateOrder: async (id, order) => {
        // 保留原始状态，不再强制设置为draft
        const orderData = {
            ...order,
            // 确保同时提供下划线和驼峰格式的关联申请字段
            requisition_id: order.requisition_id,
            requisitionId: order.requisition_id,
            requisition_number: order.requisition_number,
            requisitionNumber: order.requisition_number
        };

        const response = await api.put(`/purchase/orders/${id}`, orderData);
        return response;
    },
    deleteOrder: (id) => api.delete(`/purchase/orders/${id}`),

    // 获取特定供应商特定物料的历史最新有效价格
    getLatestPrice: (params) => api.get('/purchase/orders/latest-price', { params }),
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
    updateOrderItemsReceived: (id, items) => api.put(`/purchase/orders/${id}/items-received`, { items }),
    getOrderStats: () => api.get('/purchase/orders/statistics'),

    // 采购订单关联申请单
    getOrderRequisitions: (params) => api.get('/purchase/order-requisitions', { params }),
    getOrderRequisition: (id) => api.get(`/purchase/order-requisitions/${id}`),

    // 采购入库
    getReceipts: (params) => api.get('/purchase/receipts', { params }),
    getPurchaseHistoryItems: (params) => api.get('/purchase/receipts/history-items', { params }),
    getReceipt: (id) => api.get(`/purchase/receipts/${id}`),
    createReceipt: async (data) => {
        try {

            // 确保orderId字段存在并处理字段格式
            if (!data.orderId) {
                console.error('创建收货单失败: 缺少必要的orderId字段');
                throw new Error('缺少必要的orderId字段');
            }

            // 确保其他必要字段存在
            if (!data.receiptDate) {
                console.error('创建收货单失败: 缺少必要的receiptDate字段');
                throw new Error('缺少必要的receiptDate字段');
            }

            // 确保items字段是数组
            if (!data.items || !Array.isArray(data.items)) {
                console.error('创建收货单失败: items必须是数组');
                data.items = [];  // 设置为空数组以防止错误
            }

            if (!data.warehouseId) {
                console.error('创建收货单失败: 缺少必要的warehouseId字段');
                throw new Error('缺少必要的warehouseId字段');
            }

            // 确保warehouseId是数字类型
            const warehouseId = parseInt(data.warehouseId);
            if (isNaN(warehouseId)) {
                console.error('创建收货单失败: warehouseId不是有效的数字', data.warehouseId);
                throw new Error(`仓库ID格式无效: ${data.warehouseId}`);
            }

            // 准备最终发送的数据，处理下划线格式和驼峰格式字段
            const receiptData = {
                ...data,
                status: data.status || 'draft',
                orderId: data.orderId,
                receiptDate: data.receiptDate,
                warehouseId: warehouseId, 
                operator: data.receiver,
                receiver: data.receiver,
                inspectionId: data.inspectionId || null,
                items: data.items.map(item => ({
                    materialId: item.materialId,
                    unitId: item.unitId,
                    orderedQuantity: Number(item.orderedQuantity),
                    receivedQuantity: Number(item.receivedQuantity),
                    qualifiedQuantity: Number(item.qualifiedQuantity),
                    price: Number(item.price || 0),
                    remarks: item.remarks || ''
                }))
            };

            const response = await api.post('/purchase/receipts', receiptData);
            return response;
        } catch (error) {
            console.error('创建收货单失败:', error);
            if (error.response) {
                console.error('错误响应状态:', error.response.status);
                console.error('错误响应数据:', error.response.data);
                console.error('错误响应头:', error.response.headers);
                if (error.response.data && error.response.data.error) {
                    console.error('服务器返回的错误信息:', error.response.data.error);
                }
            } else if (error.request) {
                console.error('请求已发送但没有收到响应');
                console.error('请求对象:', error.request);
            } else {
                console.error('设置请求时发生错误:', error.message);
            }
            console.error('错误配置:', error.config);
            throw error;
        }
    },
    updateReceipt: async (id, data) => {
        try {
            // 确保orderId字段存在并处理字段格式
            if (!data.orderId) {
                throw new Error('缺少必要的orderId字段');
            }

            // 确保其他必要字段存在
            if (!data.receiptDate) {
                console.error('更新收货单失败: 缺少必要的receiptDate字段');
                throw new Error('缺少必要的receiptDate字段');
            }

            if (!data.receiver) {
                console.error('更新收货单失败: 缺少必要的receiver字段');
                throw new Error('缺少必要的receiver字段');
            }

            if (!data.warehouseId) {
                console.error('更新收货单失败: 缺少必要的warehouseId字段');
                throw new Error('缺少必要的warehouseId字段');
            }

            // 确保warehouseId是数字类型
            const warehouseId = parseInt(data.warehouseId);
            if (isNaN(warehouseId)) {
                console.error('更新收货单失败: warehouseId不是有效的数字', data.warehouseId);
                throw new Error(`仓库ID格式无效: ${data.warehouseId}`);
            }

            // 准备最终发送的数据，处理下划线格式和驼峰格式字段
            const receiptData = {
                ...data,
                status: data.status || 'draft',
                order_id: data.orderId,
                orderId: data.orderId,
                receipt_date: data.receiptDate,
                receiptDate: data.receiptDate,
                warehouse_id: warehouseId, // 使用转换后的数字类型
                warehouseId: warehouseId,  // 同时提供驼峰形式
                // 确保包含收货人字段
                operator: data.receiver,
                receiver: data.receiver,
                inspection_id: data.inspectionId || null,
                inspectionId: data.inspectionId || null,
                items: data.items.map(item => ({
                    material_id: item.materialId,
                    materialId: item.materialId,
                    unit_id: item.unitId,
                    unitId: item.unitId,
                    ordered_quantity: Number(item.orderedQuantity),
                    orderedQuantity: Number(item.orderedQuantity),
                    received_quantity: Number(item.receivedQuantity),
                    receivedQuantity: Number(item.receivedQuantity),
                    qualified_quantity: Number(item.qualifiedQuantity),
                    qualifiedQuantity: Number(item.qualifiedQuantity),
                    price: Number(item.price || 0),
                    remarks: item.remarks || ''
                }))
            };

            const response = await api.put(`/purchase/receipts/${id}`, receiptData);
            return response;
        } catch (error) {
            throw error;
        }
    },
    deleteReceipt: (id) => api.delete(`/purchase/receipts/${id}`),
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
    getDashboardStatistics: () => api.get('/purchase/dashboard-statistics'),

    // 供应商 - 直接调用API避免循环引用
    getSuppliers: async (params = {}) => {
        try {
            const response = await api.get('/baseData/suppliers', {
                params: params || {},
                headers: {
                    'Cache-Control': 'no-cache, no-store',
                    'Pragma': 'no-cache'
                }
            });
            return response;
        } catch (error) {
            throw error;
        }
    }
};
