import axios from 'axios';
import { api } from '../services/axiosInstance';
import { tokenManager } from '../utils/unifiedStorage';

/**
 * 物料 API
 *
 * 注意：API 层直接返回 axios 响应，不做二次封装
 * 前端组件使用 parseListData 或 parsePaginatedData 解析数据
 */
export const materialApi = {
    /**
     * 获取物料列表
     * @param {Object} params - 查询参数 { page, pageSize, keyword, ... }
     * @returns {Promise} response.data = { list: [], total, page, pageSize, totalPages }
     */
    getMaterials: (params = {}) => api.get('/baseData/materials', { params }),
    getMaterial: (id) => {
        // 验证ID有效性
        if (!id || id === null || id === 'null' || id === 'undefined') {
            return Promise.reject(new Error(`无效的物料ID: ${id}`));
        }
        return api.get(`/baseData/materials/${id}`);
    },
    createMaterial: (material) => api.post('/baseData/materials', material),
    updateMaterial: (id, material) => api.put(`/baseData/materials/${id}`, material),
    deleteMaterial: (id) => api.delete(`/baseData/materials/${id}`),
    // 批量获取物料信息
    getMaterialsByIds: (ids) => api.post('/baseData/materials/batch', { ids }),

    // 添加导入物料API
    importMaterials: (formData) => {
        // 创建专门的axios实例用于文件上传，避免默认超时限制
        const uploadApi = axios.create({
            baseURL: '',
            timeout: 300000, // 5分钟超时，支持大量数据导入
            headers: { 'Content-Type': 'multipart/form-data' }
        });

        // 添加请求拦截器来设置认证token和URL前缀
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

        return uploadApi.post('/baseData/materials/import', formData);
    },
    // 导入JSON格式物料数据（增加超时时间到2分钟）
    importMaterialsJson: (data) => api.post('/baseData/materials/import', data, {
        timeout: 120000 // 2分钟超时
    }),
    // 添加导出物料API
    exportMaterials: (filters) => api.post('/baseData/materials/export', filters, {
        responseType: 'blob'
    }),
    // 添加物料导入模板下载API
    downloadMaterialTemplate: () => api.get('/baseData/materials/template', {
        responseType: 'blob'
    }),
    // 获取下一个物料编码
    getNextMaterialCode: (params) => api.get('/baseData/materials/next-code', { params }),

    // 物料附件相关API
    getMaterialAttachments: (materialId) => api.get(`/baseData/materials/${materialId}/attachments`),
    uploadMaterialAttachment: (materialId, formData) => api.post(`/baseData/materials/${materialId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    deleteMaterialAttachment: (attachmentId) => api.delete(`/baseData/materials/attachments/${attachmentId}`),

    // 状态更新
    updateMaterialStatus: (id, status) => api.put(`/baseData/materials/${id}/status`, { status }),

    // 获取统计
    getMaterialStats: () => api.get('/baseData/materials/stats')
};
