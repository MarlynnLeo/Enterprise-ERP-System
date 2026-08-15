import { api } from '../services/axiosInstance';
import { API_CONFIG } from '@/config/app';

const uploadForm = (url, formData) => api.post(url, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: API_CONFIG.uploadTimeoutMs
});

const normalizeParams = (params = {}) => params?.params || params || {};

export const baseDataApi = {
    getWarehouses: () => api.get('/base-data/warehouses'),

    getCategories: (params) => api.get('/base-data/categories', { params }),
    getCategory: (id) => api.get(`/base-data/categories/${id}`),
    createCategory: (category) => api.post('/base-data/categories', category),
    updateCategory: (id, category) => api.put(`/base-data/categories/${id}`, category),
    deleteCategory: (id) => api.delete(`/base-data/categories/${id}`),
    downloadCategoryTemplate: () => api.get('/base-data/categories/template', { responseType: 'blob' }),
    importCategories: (formData) => uploadForm('/base-data/categories/import', formData),
    importCategoriesJson: (jsonData) => api.post('/base-data/categories/import-json', jsonData),
    exportCategories: (params) => api.get('/base-data/categories/export', { params, responseType: 'blob' }),

    getUnits: (params) => api.get('/base-data/units', { params }),
    getUnitStats: () => api.get('/base-data/units/stats'),
    getUnit: (id) => api.get(`/base-data/units/${id}`),
    createUnit: (unit) => api.post('/base-data/units', unit),
    updateUnit: (id, unit) => api.put(`/base-data/units/${id}`, unit),
    deleteUnit: (id) => api.delete(`/base-data/units/${id}`),
    exportUnits: (params) => api.post('/base-data/units/export', params, { responseType: 'blob' }),

    getProductCategories: (params) => api.get('/base-data/product-categories', { params }),
    getProductCategory: (id) => api.get(`/base-data/product-categories/${id}`),
    createProductCategory: (data) => api.post('/base-data/product-categories', data),
    updateProductCategory: (id, data) => api.put(`/base-data/product-categories/${id}`, data),
    deleteProductCategory: (id) => api.delete(`/base-data/product-categories/${id}`),
    getProductCategoryStats: () => api.get('/base-data/product-categories/statistics'),
    getProductCategoryOptions: () => api.get('/base-data/product-categories/options'),

    getMaterialSources: (params = {}) => api.get('/base-data/material-sources', { params }),
    getMaterialSource: (id) => api.get(`/base-data/material-sources/${id}`),
    createMaterialSource: (data) => api.post('/base-data/material-sources', data),
    updateMaterialSource: (id, data) => api.put(`/base-data/material-sources/${id}`, data),
    deleteMaterialSource: (id) => api.delete(`/base-data/material-sources/${id}`),
    getMaterialSourceStats: () => api.get('/base-data/material-sources/statistics'),

    getCustomers: (params = {}) => api.get('/base-data/customers', { params }),
    getCustomer: (id) => api.get(`/base-data/customers/${id}`),
    createCustomer: (customer) => api.post('/base-data/customers', customer),
    updateCustomer: (id, customer) => {
        if (!id) throw new Error('更新客户失败: 未提供ID');
        return api.put(`/base-data/customers/${id}`, customer);
    },
    deleteCustomer: (id) => api.delete(`/base-data/customers/${id}`),
    exportCustomers: (params) => api.post('/base-data/customers/export', params, { responseType: 'blob' }),
    importCustomers: (formData) => uploadForm('/base-data/customers/import', formData),
    downloadCustomerTemplate: () => api.get('/base-data/customers/template', { responseType: 'blob' }),
    getCustomerStats: () => api.get('/base-data/customers/stats'),

    getSuppliers: (params = {}) => api.get('/base-data/suppliers', { params }),
    getSupplier: (id) => api.get(`/base-data/suppliers/${id}`),
    createSupplier: (supplier) => api.post('/base-data/suppliers', supplier),
    updateSupplier: (id, supplier) => api.put(`/base-data/suppliers/${id}`, supplier),
    deleteSupplier: (id) => api.delete(`/base-data/suppliers/${id}`),
    exportSuppliers: (params) => api.post('/base-data/suppliers/export', params, { responseType: 'blob' }),
    importSuppliers: (formData) => uploadForm('/base-data/suppliers/import', formData),
    downloadSupplierTemplate: () => api.get('/base-data/suppliers/template', { responseType: 'blob' }),
    getSupplierMetalPriceSchemes: (supplierId, params = {}) => api.get(`/base-data/suppliers/${supplierId}/metal-price-schemes`, { params }),
    getSupplierMetalPriceScheme: (supplierId, schemeId) => api.get(`/base-data/suppliers/${supplierId}/metal-price-schemes/${schemeId}`),
    createSupplierMetalPriceScheme: (supplierId, data) => api.post(`/base-data/suppliers/${supplierId}/metal-price-schemes`, data),
    updateSupplierMetalPriceScheme: (supplierId, schemeId, data) => api.put(`/base-data/suppliers/${supplierId}/metal-price-schemes/${schemeId}`, data),
    deleteSupplierMetalPriceScheme: (supplierId, schemeId) => api.delete(`/base-data/suppliers/${supplierId}/metal-price-schemes/${schemeId}`),

    getMaterials: (params = {}) => api.get('/base-data/materials', { params }),
    getMaterial: (id) => api.get(`/base-data/materials/${id}`),
    getMaterialOptions: (params) => api.get('/base-data/materials/options', { params }),
    getNextMaterialCode: (params) => api.get('/base-data/materials/next-code', { params }),
    getLatestMaterialByCategory: (params) => api.get('/base-data/materials/latest', { params }),
    getMaterialStats: () => api.get('/base-data/materials/stats'),
    createMaterial: (material) => api.post('/base-data/materials', material),
    updateMaterial: (id, material) => api.put(`/base-data/materials/${id}`, material),
    updateMaterialStatus: (id, status) => api.put(`/base-data/materials/${id}/status`, { status }),
    deleteMaterial: (id) => api.delete(`/base-data/materials/${id}`),
    exportMaterials: (params) => api.post('/base-data/materials/export', params, { responseType: 'blob' }),
    importMaterials: (formData) => uploadForm('/base-data/materials/import-file', formData),
    importMaterialsJson: (data) => api.post('/base-data/materials/import', data, { timeout: API_CONFIG.longTimeoutMs }),
    downloadMaterialTemplate: () => api.get('/base-data/materials/template', { responseType: 'blob' }),
    getMaterialsByIds: (ids) => api.post('/base-data/materials/batch', { ids }),
    getMaterialsByCodes: (codes) => api.post('/base-data/materials/batch-by-codes', { codes }),
    getMaterialAttachments: (materialId) => api.get(`/base-data/materials/${materialId}/attachments`),
    uploadMaterialAttachment: (materialId, formData) =>
        uploadForm(`/base-data/materials/${materialId}/attachments`, formData),
    deleteMaterialAttachment: (attachmentId) => api.delete(`/base-data/materials/attachments/${attachmentId}`),

    getLocations: (params = {}) => api.get('/base-data/locations', { params }),
    getLocation: (id) => api.get(`/base-data/locations/${id}`),
    createLocation: (location) => api.post('/base-data/locations', location),
    updateLocation: (id, location) => api.put(`/base-data/locations/${id}`, location),
    deleteLocation: (id) => api.delete(`/base-data/locations/${id}`),
    exportLocations: (params) => api.post('/base-data/locations/export', params, { responseType: 'blob' }),

    getBoms: (params = {}) => {
        const requestParams = normalizeParams(params);
        // HTTP 只认 camel；后端 bom 列表已兼容 productId
        if (requestParams.product_id != null && requestParams.productId == null) {
            requestParams.productId = requestParams.product_id;
        }
        delete requestParams.product_id;
        return api.get('/base-data/boms', { params: requestParams });
    },
    getBom: (id) => api.get(`/base-data/boms/${id}`),
    getBomDetails: (id) => api.get(`/base-data/boms/${id}/details`),
    createBom: (data) => api.post('/base-data/boms', data),
    updateBom: (id, data) => api.put(`/base-data/boms/${id}`, data),
    deleteBom: (id) => api.delete(`/base-data/boms/${id}`),
    getBomStats: () => api.get('/base-data/boms/stats'),
    exportBoms: (params) => api.get('/base-data/boms/export', { params, responseType: 'blob' }),
    importBoms: (formData) => uploadForm('/base-data/boms/import', formData),
    downloadBomTemplate: () => api.get('/base-data/boms/template', { responseType: 'blob' }),
    replaceBom: (data) => api.post('/base-data/boms/replace', data),
    locatePart: (partCode) => api.get(`/base-data/boms/locate/${partCode}`),
    detectCircularReference: (productId, materialId) =>
        api.get('/base-data/boms/detect-circular', { params: { productId, materialId } }),
    explodeBom: (id, params = {}) => api.get(`/base-data/boms/${id}/explode`, { params }),
    refreshBomCache: (id) => api.post(`/base-data/boms/${id}/refresh-cache`),
    approveBom: (id) => api.put(`/base-data/boms/${id}/approve`, { approved: true }),
    unapproveBom: (id) => api.put(`/base-data/boms/${id}/unapprove`),
    getMaterialSubBom: (materialId) => api.get(`/base-data/materials/${materialId}/sub-bom`),

    getProcessTemplates: (params) => api.get('/base-data/process-templates', { params }),
    getProcessTemplate: (id) => api.get(`/base-data/process-templates/${id}`),
    createProcessTemplate: (data) => api.post('/base-data/process-templates', data),
    updateProcessTemplate: (id, data) => api.put(`/base-data/process-templates/${id}`, data),
    deleteProcessTemplate: (id) => api.delete(`/base-data/process-templates/${id}`),
    updateProcessTemplateStatus: (id, status) =>
        api.put(`/base-data/process-templates/${id}/status`, { status }),
    exportProcessTemplates: (params) =>
        api.post('/base-data/process-templates/export', params, { responseType: 'blob' }),
    getProcessTemplateByProductId: (productId) =>
        api.get(`/base-data/products/${productId}/process-template`),

    uploadFile: (formData) => uploadForm('/base-data/upload', formData),
    downloadFile: (filePath) =>
        api.get('/base-data/download-file', { params: { filePath }, responseType: 'blob' }),

    getInspectionMethods: (params) => api.get('/base-data/inspection-methods', { params }),
    getInspectionMethod: (id) => api.get(`/base-data/inspection-methods/${id}`),
    createInspectionMethod: (data) => api.post('/base-data/inspection-methods', data),
    updateInspectionMethod: (id, data) => api.put(`/base-data/inspection-methods/${id}`, data),
    deleteInspectionMethod: (id) => api.delete(`/base-data/inspection-methods/${id}`)
};

export default baseDataApi;
