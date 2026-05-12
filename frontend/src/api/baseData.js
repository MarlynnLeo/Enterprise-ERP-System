import { api } from '../services/axiosInstance';

const noCacheHeaders = {
    'Cache-Control': 'no-cache, no-store',
    Pragma: 'no-cache'
};

const uploadForm = (url, formData) => api.post(url, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000
});

const normalizeParams = (params = {}) => params?.params || params || {};

const normalizeResponse = (response) => response;

export const baseDataApi = {
    getWarehouses: async () => normalizeResponse(await api.get('/baseData/warehouses')),

    getCategories: async (params) => normalizeResponse(await api.get('/baseData/categories', { params })),
    getCategory: (id) => api.get(`/baseData/categories/${id}`),
    createCategory: (category) => api.post('/baseData/categories', category),
    updateCategory: (id, category) => api.put(`/baseData/categories/${id}`, category),
    deleteCategory: (id) => api.delete(`/baseData/categories/${id}`),
    downloadCategoryTemplate: () => api.get('/baseData/categories/template', { responseType: 'blob' }),
    importCategories: (formData) => uploadForm('/baseData/categories/import', formData),
    importCategoriesJson: (jsonData) => api.post('/baseData/categories/import-json', jsonData),
    exportCategories: (params) => api.get('/baseData/categories/export', { params, responseType: 'blob' }),

    getUnits: async (params) => normalizeResponse(await api.get('/baseData/units', { params })),
    getUnit: (id) => api.get(`/baseData/units/${id}`),
    createUnit: (unit) => api.post('/baseData/units', unit),
    updateUnit: (id, unit) => api.put(`/baseData/units/${id}`, unit),
    deleteUnit: (id) => api.delete(`/baseData/units/${id}`),
    exportUnits: (params) => api.post('/baseData/units/export', params, { responseType: 'blob' }),

    getProductCategories: async (params) =>
        normalizeResponse(await api.get('/baseData/product-categories', { params })),
    getProductCategory: (id) => api.get(`/baseData/product-categories/${id}`),
    createProductCategory: (data) => api.post('/baseData/product-categories', data),
    updateProductCategory: (id, data) => api.put(`/baseData/product-categories/${id}`, data),
    deleteProductCategory: (id) => api.delete(`/baseData/product-categories/${id}`),
    getProductCategoryStats: () => api.get('/baseData/product-categories/statistics'),
    getProductCategoryOptions: async () =>
        normalizeResponse(await api.get('/baseData/product-categories/options')),

    getMaterialSources: async (params = {}) =>
        normalizeResponse(await api.get('/baseData/material-sources', { params })),
    getMaterialSource: (id) => api.get(`/baseData/material-sources/${id}`),
    createMaterialSource: (data) => api.post('/baseData/material-sources', data),
    updateMaterialSource: (id, data) => api.put(`/baseData/material-sources/${id}`, data),
    deleteMaterialSource: (id) => api.delete(`/baseData/material-sources/${id}`),
    getMaterialSourceStats: () => api.get('/baseData/material-sources/statistics'),

    getCustomers: async (params = {}) =>
        normalizeResponse(await api.get('/baseData/customers', {
            params,
            headers: noCacheHeaders
        })),
    getCustomer: (id) => api.get(`/baseData/customers/${id}`),
    createCustomer: (customer) => api.post('/baseData/customers', customer),
    updateCustomer: (id, customer) => {
        if (!id) throw new Error('更新客户失败: 未提供ID');
        return api.put(`/baseData/customers/${id}`, customer);
    },
    deleteCustomer: (id) => api.delete(`/baseData/customers/${id}`),
    exportCustomers: (params) => api.post('/baseData/customers/export', params, { responseType: 'blob' }),
    importCustomers: (formData) => uploadForm('/baseData/customers/import', formData),
    downloadCustomerTemplate: () => api.get('/baseData/customers/template', { responseType: 'blob' }),
    getCustomerStats: () => api.get('/baseData/customers/stats'),

    getSuppliers: async (params = {}) =>
        normalizeResponse(await api.get('/baseData/suppliers', {
            params,
            headers: noCacheHeaders
        })),
    getSupplier: (id) => api.get(`/baseData/suppliers/${id}`),
    createSupplier: (supplier) => api.post('/baseData/suppliers', supplier),
    updateSupplier: (id, supplier) => api.put(`/baseData/suppliers/${id}`, supplier),
    deleteSupplier: (id) => api.delete(`/baseData/suppliers/${id}`),
    exportSuppliers: (params) => api.post('/baseData/suppliers/export', params, { responseType: 'blob' }),
    importSuppliers: (formData) => uploadForm('/baseData/suppliers/import', formData),
    downloadSupplierTemplate: () => api.get('/baseData/suppliers/template', { responseType: 'blob' }),

    getMaterials: async (params = {}) =>
        normalizeResponse(await api.get('/baseData/materials', {
            params,
            headers: noCacheHeaders
        })),
    getMaterial: (id) => api.get(`/baseData/materials/${id}`),
    getMaterialOptions: (params) => api.get('/baseData/materials/options', { params }),
    getNextMaterialCode: (params) => api.get('/baseData/materials/next-code', { params }),
    getMaterialStats: () => api.get('/baseData/materials/stats'),
    createMaterial: (material) => api.post('/baseData/materials', material),
    updateMaterial: (id, material) => api.put(`/baseData/materials/${id}`, material),
    updateMaterialStatus: (id, status) => api.put(`/baseData/materials/${id}/status`, { status }),
    deleteMaterial: (id) => api.delete(`/baseData/materials/${id}`),
    exportMaterials: (params) => api.post('/baseData/materials/export', params, { responseType: 'blob' }),
    importMaterials: (formData) => uploadForm('/baseData/materials/import-file', formData),
    importMaterialsJson: (data) => api.post('/baseData/materials/import', data, { timeout: 120000 }),
    downloadMaterialTemplate: () => api.get('/baseData/materials/template', { responseType: 'blob' }),
    getMaterialsByIds: (ids) => api.post('/baseData/materials/batch', { ids }),
    getMaterialAttachments: (materialId) => api.get(`/baseData/materials/${materialId}/attachments`),
    uploadMaterialAttachment: (materialId, formData) =>
        uploadForm(`/baseData/materials/${materialId}/attachments`, formData),
    deleteMaterialAttachment: (attachmentId) => api.delete(`/baseData/materials/attachments/${attachmentId}`),

    getLocations: async (params = {}) =>
        normalizeResponse(await api.get('/baseData/locations', {
            params,
            headers: noCacheHeaders
        })),
    getLocation: (id) => api.get(`/baseData/locations/${id}`),
    createLocation: (location) => api.post('/baseData/locations', location),
    updateLocation: (id, location) => api.put(`/baseData/locations/${id}`, location),
    deleteLocation: (id) => api.delete(`/baseData/locations/${id}`),
    exportLocations: (params) => api.post('/baseData/locations/export', params, { responseType: 'blob' }),

    getBoms: (params = {}) => {
        const requestParams = normalizeParams(params);
        if (requestParams.productId && !requestParams.product_id) {
            requestParams.product_id = requestParams.productId;
        }
        return api.get('/baseData/boms', {
            params: requestParams,
            headers: noCacheHeaders
        });
    },
    getBom: (id) => api.get(`/baseData/boms/${id}`),
    getBomDetails: (id) => api.get(`/baseData/boms/${id}/details`),
    createBom: (data) => api.post('/baseData/boms', data),
    updateBom: (id, data) => api.put(`/baseData/boms/${id}`, data),
    deleteBom: (id) => api.delete(`/baseData/boms/${id}`),
    getBomStats: () => api.get('/baseData/boms/stats'),
    exportBoms: (params) => api.get('/baseData/boms/export', { params, responseType: 'blob' }),
    importBoms: (formData) => uploadForm('/baseData/boms/import', formData),
    downloadBomTemplate: () => api.get('/baseData/boms/template', { responseType: 'blob' }),
    replaceBom: (data) => api.post('/baseData/boms/replace', data),
    locatePart: (partCode) => api.get(`/baseData/boms/locate/${partCode}`),
    detectCircularReference: (productId, materialId) =>
        api.get('/baseData/boms/detect-circular', { params: { productId, materialId } }),
    explodeBom: (id, params = {}) => api.get(`/baseData/boms/${id}/explode`, { params }),
    refreshBomCache: (id) => api.post(`/baseData/boms/${id}/refresh-cache`),
    approveBom: (id) => api.put(`/baseData/boms/${id}/approve`, { approved: true }),
    unapproveBom: (id) => api.put(`/baseData/boms/${id}/unapprove`),
    getMaterialSubBom: (materialId) => api.get(`/baseData/materials/${materialId}/sub-bom`),

    getProcessTemplates: (params) => api.get('/baseData/process-templates', { params }),
    getProcessTemplate: (id) => api.get(`/baseData/process-templates/${id}`),
    createProcessTemplate: (data) => api.post('/baseData/process-templates', data),
    updateProcessTemplate: (id, data) => api.put(`/baseData/process-templates/${id}`, data),
    deleteProcessTemplate: (id) => api.delete(`/baseData/process-templates/${id}`),
    updateProcessTemplateStatus: (id, status) =>
        api.put(`/baseData/process-templates/${id}/status`, { status }),
    exportProcessTemplates: (params) =>
        api.post('/baseData/process-templates/export', params, { responseType: 'blob' }),
    getProcessTemplateByProductId: (productId) =>
        api.get(`/baseData/products/${productId}/process-template`),

    uploadFile: (formData) => uploadForm('/baseData/upload', formData),
    downloadFile: (filePath) =>
        api.get('/baseData/download-file', { params: { filePath }, responseType: 'blob' }),

    getInspectionMethods: async (params) =>
        normalizeResponse(await api.get('/baseData/inspection-methods', { params })),
    getInspectionMethod: (id) => api.get(`/baseData/inspection-methods/${id}`),
    createInspectionMethod: (data) => api.post('/baseData/inspection-methods', data),
    updateInspectionMethod: (id, data) => api.put(`/baseData/inspection-methods/${id}`, data),
    deleteInspectionMethod: (id) => api.delete(`/baseData/inspection-methods/${id}`)
};

export default baseDataApi;
