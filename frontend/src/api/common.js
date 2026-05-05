import { api } from '../services/axiosInstance';

export const commonApi = {
    // 文件上传
    uploadFile: (formData) => api.post('/common/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),

    // 获取枚举值/字典数据
    getEnums: (type) => api.get(`/common/enums/${type}`),

    // 获取系统配置
    getConfig: (key) => api.get(`/common/config/${key}`),

    // 发送验证码
    sendVerificationCode: (data) => api.post('/common/send-code', data),

    // 验证验证码
    verifyCode: (data) => api.post('/common/verify-code', data),

    // 获取仪表盘数据
    getDashboardData: () => api.get('/dashboard/data')
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
