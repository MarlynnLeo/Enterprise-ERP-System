import { api } from '../services/axiosInstance';
import { API_CONFIG } from '@/config/app';

export const commonApi = {
    // 获取枚举/字典数据
    getEnums: (type) => api.get(`/common/enums/${type}`),
    getCurrentWeather: (params) => api.get('/weather/current', { params }),
    uploadFile: (formData) => api.post('/upload/file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: API_CONFIG.uploadTimeoutMs
    }),
    downloadResource: (url) => api.get(url, { responseType: 'blob' })
};

// 金属价格 API
export const metalPricesApi = {
    // 获取实时金属价格
    getRealTimePrices: () => api.get('/metal-prices/realtime'),

    // 获取历史价格趋势
    getPriceHistory: (params) => api.get('/metal-prices/history', { params }),

    // 手动更新价格
    updatePrice: (data) => api.put('/metal-prices', data)
};
