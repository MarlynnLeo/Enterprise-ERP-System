import { api } from '../services/axiosInstance';

export const commonApi = {
    // 获取枚举值/字典数据
    getEnums: (type) => api.get(`/common/enums/${type}`)
};

// 金属价格API
export const metalPricesApi = {
    // 获取实时金属价格
    getRealTimePrices: () => api.get('/metal-prices/realtime'),

    // 获取历史价格趋势
    getPriceHistory: (params) => api.get('/metal-prices/history', { params }),

    // 手动更新价格
    updatePrice: (data) => api.put('/metal-prices', data)
};
