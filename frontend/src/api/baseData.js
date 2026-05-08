import axios from 'axios';
import { api } from '../services/axiosInstance';
import { tokenManager } from '../utils/unifiedStorage';

// 创建专门的axios实例用于文件上传
const uploadApi = axios.create({
    baseURL: '',
    timeout: 300000, // 5分钟超时
    headers: { 'Content-Type': 'multipart/form-data' }
});

// 添加请求拦截器
uploadApi.interceptors.request.use((config) => {
    const token = tokenManager.getToken();
    if (token && tokenManager.isTokenValid()) {
        config.headers['Authorization'] = `Bearer ${token}`;
    }
    // 处理URL前缀
    if (config.url && !config.url.startsWith('http')) {
        if (!config.url.startsWith('/api')) {
            config.url = '/api' + config.url;
        }
    }
    return config;
});

// 添加响应拦截器 - 统一处理后端 ResponseHandler 格式
uploadApi.interceptors.response.use(
    (response) => {
        // 后端 ResponseHandler 格式: { success, data, message, code }
        const result = response.data;
        if (result && typeof result === 'object' && 'success' in result) {
            if (result.success) {
                // 解包：将 data 字段提升到 response.data
                response.data = result.data || result;
                response.data.message = result.message; // 保留消息
            } else {
                // 业务失败，抛出错误
                const error = new Error(result.message || '请求失败');
                error.response = response;
                return Promise.reject(error);
            }
        }
        return response;
    },
    (error) => {
        return Promise.reject(error);
    }
);

/**
 * 统一处理响应格式
 * 注意：axios 拦截器已统一解包 ResponseHandler 格式
 * response.data 现在就是实际的业务数据
 */
const normalizeResponse = (response) => {
    // 拦截器已解包，response.data 就是业务数据
    // 这里只需要处理分页数据的格式统一
    return response;
};

export const baseDataApi = {
    // 仓库管理
    getWarehouses: async () => {
        const response = await api.get('/baseData/warehouses');
        return normalizeResponse(response);
    },

    // 分类管理
    getCategories: async (params) => {
        const response = await api.get('/baseData/categories', { params });
        return normalizeResponse(response);
    },
    getCategory: (id) => api.get(`/baseData/categories/${id}`),
    createCategory: (category) => api.post('/baseData/categories', category),
    updateCategory: (id, category) => api.put(`/baseData/categories/${id}`, category),
    deleteCategory: (id) => api.delete(`/baseData/categories/${id}`),
    downloadCategoryTemplate: () => api.get('/baseData/categories/template', { responseType: 'blob' }),
    importCategories: (formData) => uploadApi.post('/baseData/categories/import', formData),
    importCategoriesJson: (jsonData) => api.post('/baseData/categories/import-json', { data: jsonData }),
    exportCategories: (params) => api.get('/baseData/categories/export', { params, responseType: 'blob' }),

    // 单位管理
    getUnits: async (params) => {
        const response = await api.get('/baseData/units', { params });
        return normalizeResponse(response);
    },
    getUnit: (id) => api.get(`/baseData/units/${id}`),
    createUnit: (unit) => api.post('/baseData/units', unit),
    updateUnit: (id, unit) => api.put(`/baseData/units/${id}`, unit),
    deleteUnit: (id) => api.delete(`/baseData/units/${id}`),
    exportUnits: (params) => api.post('/baseData/units/export', params, { responseType: 'blob' }),

    // 产品大类管理
    getProductCategories: async (params) => {
        const response = await api.get('/baseData/product-categories', { params });
        return normalizeResponse(response);
    },
    getProductCategory: (id) => api.get(`/baseData/product-categories/${id}`),
    createProductCategory: (data) => api.post('/baseData/product-categories', data),
    updateProductCategory: (id, data) => api.put(`/baseData/product-categories/${id}`, data),
    deleteProductCategory: (id) => api.delete(`/baseData/product-categories/${id}`),
    getProductCategoryStats: () => api.get('/baseData/product-categories/statistics'),

    // 获取产品大类树形选项（用于下拉选择器）
    getProductCategoryOptions: async () => {
        const response = await api.get('/baseData/product-categories/options');
        return normalizeResponse(response);
    },

    // 物料来源管理
    getMaterialSources: async (params = {}) => {
        const response = await api.get('/baseData/material-sources', { params });
        return normalizeResponse(response);
    },
    getMaterialSource: (id) => api.get(`/baseData/material-sources/${id}`),
    createMaterialSource: (data) => api.post('/baseData/material-sources', data),
    updateMaterialSource: (id, data) => api.put(`/baseData/material-sources/${id}`, data),
    deleteMaterialSource: (id) => api.delete(`/baseData/material-sources/${id}`),
    getMaterialSourceStats: () => api.get('/baseData/material-sources/statistics'),

    // 客户管理
    getCustomers: async (params = {}) => {
        const response = await api.get('/baseData/customers', {
            params: params || {},
            headers: {
                'Cache-Control': 'no-cache, no-store',
                'Pragma': 'no-cache'
            }
        });
        return normalizeResponse(response);
    },
    getCustomer: (id) => api.get(`/baseData/customers/${id}`),
    createCustomer: (customer) => api.post('/baseData/customers', customer),
    updateCustomer: (id, customer) => {
        if (!id) throw new Error('更新客户失败: 未提供ID');
        return api.put(`/baseData/customers/${id}`, customer);
    },
    deleteCustomer: (id) => api.delete(`/baseData/customers/${id}`),
    exportCustomers: (params) => api.post('/baseData/customers/export', params, { responseType: 'blob' }),
    importCustomers: (formData) => uploadApi.post('/baseData/customers/import', formData),
    downloadCustomerTemplate: () => api.get('/baseData/customers/template', { responseType: 'blob' }),
    // 客户统计（避免全量加载）
    getCustomerStats: () => api.get('/baseData/customers/stats'),

    // 供应商管理
    getSuppliers: async (params = {}) => {
        const response = await api.get('/baseData/suppliers', {
            params: params || {},
            headers: {
                'Cache-Control': 'no-cache, no-store',
                'Pragma': 'no-cache'
            }
        });
        return normalizeResponse(response);
    },
    getSupplier: (id) => api.get(`/baseData/suppliers/${id}`),
    createSupplier: (supplier) => api.post('/baseData/suppliers', supplier),
    updateSupplier: (id, supplier) => api.put(`/baseData/suppliers/${id}`, supplier),
    deleteSupplier: (id) => api.delete(`/baseData/suppliers/${id}`),
    exportSuppliers: (params) => api.post('/baseData/suppliers/export', params, { responseType: 'blob' }),
    importSuppliers: (formData) => uploadApi.post('/baseData/suppliers/import', formData),
    downloadSupplierTemplate: () => api.get('/baseData/suppliers/template', { responseType: 'blob' }),

    // 物料管理
    getMaterials: async (params = {}) => {
        const response = await api.get('/baseData/materials', {
            params: params || {},
            headers: {
                'Cache-Control': 'no-cache, no-store',
                'Pragma': 'no-cache'
            }
        });
        return normalizeResponse(response);
    },
    getMaterial: (id) => api.get(`/baseData/materials/${id}`),
    createMaterial: (material) => api.post('/baseData/materials', material),
    updateMaterial: (id, material) => api.put(`/baseData/materials/${id}`, material),
    deleteMaterial: (id) => api.delete(`/baseData/materials/${id}`),
    exportMaterials: (params) => api.post('/baseData/materials/export', params, { responseType: 'blob' }),
    importMaterials: (formData) => uploadApi.post('/baseData/materials/import', formData),
    downloadMaterialTemplate: () => api.get('/baseData/materials/template', { responseType: 'blob' }),

    // 库位管理
    getLocations: async (params = {}) => {
        const response = await api.get('/baseData/locations', {
            params: params || {},
            headers: {
                'Cache-Control': 'no-cache, no-store',
                'Pragma': 'no-cache'
            }
        });
        return normalizeResponse(response);
    },
    getLocation: (id) => api.get(`/baseData/locations/${id}`),
    createLocation: (location) => api.post('/baseData/locations', location),
    updateLocation: (id, location) => api.put(`/baseData/locations/${id}`, location),
    deleteLocation: (id) => api.delete(`/baseData/locations/${id}`),
    exportLocations: (params) => api.post('/baseData/locations/export', params, { responseType: 'blob' }),
    importLocations: (formData) => uploadApi.post('/baseData/locations/import', formData),
    downloadLocationTemplate: () => api.get('/baseData/locations/template', { responseType: 'blob' }),

    // 工序模板管理
    getProcessTemplates: (params) => api.get('/baseData/process-templates', { params }),
    getProcessTemplate: (id) => api.get(`/baseData/process-templates/${id}`),
    createProcessTemplate: (data) => api.post('/baseData/process-templates', data),
    updateProcessTemplate: (id, data) => api.put(`/baseData/process-templates/${id}`, data),
    deleteProcessTemplate: (id) => api.delete(`/baseData/process-templates/${id}`),
    updateProcessTemplateStatus: (id, status) => api.put(`/baseData/process-templates/${id}/status`, { status }),
    exportProcessTemplates: (params) => api.post('/baseData/process-templates/export', params, { responseType: 'blob' }),
    getProcessTemplateByProductId: (productId) => api.get(`/baseData/products/${productId}/process-template`),

    // 文件上传下载
    uploadFile: (formData) => uploadApi.post('/baseData/upload', formData),
    downloadFile: (filePath) => api.get('/baseData/download-file', { params: { filePath }, responseType: 'blob' }),

    // 检验方式管理
    getInspectionMethods: async (params) => {
        const response = await api.get('/baseData/inspection-methods', { params });
        return normalizeResponse(response);
    },
    getInspectionMethod: (id) => api.get(`/baseData/inspection-methods/${id}`),
    createInspectionMethod: (data) => api.post('/baseData/inspection-methods', data),
    updateInspectionMethod: (id, data) => api.put(`/baseData/inspection-methods/${id}`, data),
    deleteInspectionMethod: (id) => api.delete(`/baseData/inspection-methods/${id}`)
};
