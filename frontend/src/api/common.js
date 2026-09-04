import { api } from '../services/axiosInstance';
import { API_CONFIG, buildDownloadUrl } from '@/config/app';

export const commonApi = {
    // 获取枚举/字典数据
    getEnums: (type) => api.get(`/common/enums/${type}`),
    getCurrentWeather: (params) => api.get('/weather/current', { params }),
    uploadFile: (formData) => api.post('/upload/file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: API_CONFIG.uploadTimeoutMs
    }),
    downloadResource: (url) => {
        const resolvedUrl = buildDownloadUrl(url);
        if (!resolvedUrl) {
            return Promise.reject(new Error('附件地址不可用'));
        }
        const requestConfig = { responseType: 'blob' };
        // Axios would combine a relative static path with the API base and
        // request `/api/uploads/...`. An empty baseURL deliberately targets
        // the Vite/reverse-proxy `/uploads` route instead.
        if (/^\/uploads(?:\/|$)/i.test(resolvedUrl)) {
            requestConfig.baseURL = '';
        }
        return api.get(resolvedUrl, requestConfig);
    }
};

// 金属价格 API
export const metalPricesApi = {
    // 获取实时金属价格
    getRealTimePrices: () => api.get('/metal-prices/realtime'),

    // 强制从外部源刷新
    refreshPrices: () => api.post('/metal-prices/refresh'),

    // 获取历史价格趋势
    getPriceHistory: (params) => api.get('/metal-prices/history', { params }),

    // 手动更新价格
    updatePrice: (data) => api.put('/metal-prices', data)
};
