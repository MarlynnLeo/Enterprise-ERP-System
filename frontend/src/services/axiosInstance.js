import axios from 'axios';
import { tokenManager } from '../utils/unifiedStorage';
import { ElMessageBox, ElNotification } from 'element-plus';
import router from '@/router';

// 使用环境变量，如果没有设置则使用相对路径
const API_URL = import.meta.env.VITE_API_URL || '';

// 默认API实例（用于一般请求）
export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 20000,
    retry: 1,
    retryDelay: 1000,
    withCredentials: true  // ✅ 重要：允许发送Cookie
});

// 快速API实例（用于用户信息等关键请求）
export const fastApi = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 5000,
    retry: 1,
    retryDelay: 500,
    withCredentials: true  // ✅ 重要：允许发送Cookie
});

/**
 * 统一解包 ResponseHandler 格式的响应
 *
 * 后端 ResponseHandler.success() 返回格式：
 * { success: true, data: {...}, message: '操作成功', timestamp: '...' }
 *
 * 解包后前端获取到的 response.data 就是实际的业务数据
 *
 * @param {Object} response - axios 原始响应
 * @returns {Object} 解包后的响应，response.data 为实际业务数据
 */
const unwrapResponse = (response) => {
    const responseData = response.data;

    // 检查是否是 ResponseHandler 格式
    if (responseData && typeof responseData === 'object' && 'success' in responseData) {
        if (responseData.success === true) {

            // 成功响应：解包，将 data 字段提升为 response.data
            return {
                ...response,
                data: responseData.data,
                // 保留原始响应信息供需要时使用
                _raw: responseData,
                _message: responseData.message
            };
        } else {
            // 业务失败：抛出错误
            const error = new Error(responseData.message || '操作失败');
            error.response = response;
            error.code = responseData.errorCode || 'BUSINESS_ERROR';

            throw error;
        }
    }

    // 非 ResponseHandler 格式，直接返回（兼容直接返回数据的接口）
    return response;
};

// 通用拦截器配置函数
const setupInterceptors = (apiInstance) => {
    apiInstance.interceptors.request.use((config) => {
        const token = tokenManager.getToken();

        if (config.url && !config.url.startsWith('http')) {
            if (!config.url.startsWith('/api')) {
                config.url = '/api' + config.url;
            }
        }

        // 只要存在 token 就注入 Authorization 头
        // 即使 token 可能已过期，也应该发送，让后端返回 401 触发前端的 refresh 逻辑
        // 否则请求不带 Authorization 头会被 CSRF 中间件拦截为 403
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }

        return config;
    }, (error) => {
        console.error('API请求拦截器错误:', error);
        return Promise.reject(error);
    });

    // 用于管理刷新Token的状态
    let isRefreshing = false;
    let failedQueue = [];

    const processQueue = (error, token = null) => {
        failedQueue.forEach(prom => {
            if (error) {
                prom.reject(error);
            } else {
                prom.resolve(token);
            }
        });
        failedQueue = [];
    };

    apiInstance.interceptors.response.use(
        (response) => {
            // ✅ 统一解包 ResponseHandler 格式
            // 解包后 response.data 就是实际的业务数据
            // 前端代码统一使用 response.data 获取数据
            return unwrapResponse(response);
        },
        async (error) => {
            const originalRequest = error.config;

            // 如果是401错误且不是登录/刷新接口且未重试过
            if (error.response?.status === 401 && 
                !originalRequest.url.includes('/auth/login') && 
                !originalRequest.url.includes('/auth/refresh') &&
                !originalRequest._retry) {

                // ✅ 根源判断：如果本地根本没有任何 token，说明用户未登录，直接跳登录页
                // 不发送任何 refresh 请求，避免后端产生无意义的错误日志
                const hasAnyToken = tokenManager.getToken() || tokenManager.getRefreshToken();
                if (!hasAnyToken) {
                    tokenManager.clearAuth();
                    if (!window.location.pathname.includes('/login')) {
                        window.location.href = '/login';
                    }
                    return Promise.reject(error);
                }

                if (isRefreshing) {
                    return new Promise((resolve, reject) => {
                        failedQueue.push({ resolve, reject });
                    }).then(token => {
                        if (token) {
                            originalRequest.headers['Authorization'] = `Bearer ${token}`;
                        }
                        return apiInstance(originalRequest);
                    }).catch(err => {
                        return Promise.reject(err);
                    });
                }

                originalRequest._retry = true;
                isRefreshing = true;

                try {
                    // 尝试用 Cookie 或 localStorage 中的 refreshToken 刷新
                    let refreshResponse;
                    const storedRefreshToken = tokenManager.getRefreshToken();
                    
                    try {
                        refreshResponse = await apiInstance.post('/auth/refresh',
                            storedRefreshToken ? { refreshToken: storedRefreshToken } : undefined
                        );
                    } catch (refreshErr) {
                        throw refreshErr;
                    }

                    const resData = refreshResponse.data;
                    const accessToken = resData?.accessToken || resData?.token;
                    const newRefreshToken = resData?.refreshToken;

                    if (accessToken) {
                        tokenManager.setToken(accessToken);
                        if (newRefreshToken) {
                            tokenManager.setRefreshToken(newRefreshToken);
                        }
                        apiInstance.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
                        originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
                        processQueue(null, accessToken);
                        return apiInstance(originalRequest);
                    } else {
                        throw new Error('刷新Token失败: 响应中没有token');
                    }
                } catch (refreshError) {
                    processQueue(refreshError, null);
                    tokenManager.clearAuth();
                    if (!window.location.pathname.includes('/login')) {
                        window.location.href = '/login';
                    }
                    return Promise.reject(refreshError);
                } finally {
                    isRefreshing = false;
                }
            }

            return Promise.reject(error);
        }
    );
};

setupInterceptors(api);
setupInterceptors(fastApi);


// 请求重试拦截器（仅对网络错误和 5xx 服务端错误重试，排除认证相关的 4xx）
api.interceptors.response.use(undefined, async (err) => {
    const config = err.config;
    const status = err.response?.status;

    // 不重试以下情况：没有配置、已达重试上限、认证/权限错误（4xx 不重试）
    if (!config || !config.retry || config.retryCount >= config.retry || (status && status >= 400 && status < 500)) {
        return Promise.reject(err);
    }
    config.retryCount = (config.retryCount || 0) + 1;
    await new Promise(resolve => setTimeout(resolve, config.retryDelay || 1000));
    return api(config);
});

export default api;
