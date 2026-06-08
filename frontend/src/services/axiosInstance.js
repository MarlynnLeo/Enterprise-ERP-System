import axios from 'axios';
import { API_CONFIG, normalizeApiRequestUrl } from '@/config/app';
import { applyRequestOptimizer } from '@/utils/requestOptimizer';
// 使用环境变量，如果没有设置则使用相对路径
const API_URL = API_CONFIG.defaultBaseURL;
const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete']);
const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d+\-.]*:/i;
let csrfToken = '';
let csrfTokenPromise = null;

const getWindowOrigin = () => (
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''
);

const isAbsoluteUrl = (url) => ABSOLUTE_URL_PATTERN.test(String(url || ''));

const getUrl = (url, baseOrigin) => {
    try {
        return new URL(String(url || ''), baseOrigin || undefined);
    } catch {
        return null;
    }
};

const isCredentialedApiRequest = (config) => {
    const url = String(config.url || '');
    if (!isAbsoluteUrl(url)) return true;

    const origin = getWindowOrigin();
    if (!origin) return false;

    const requestUrl = getUrl(url, origin);
    const apiBaseUrl = getUrl(config.baseURL || API_URL, origin);
    if (!requestUrl || !apiBaseUrl || requestUrl.origin !== apiBaseUrl.origin) {
        return false;
    }

    const apiPath = apiBaseUrl.pathname.replace(/\/+$/, '') || '/';
    return apiPath === '/'
        || requestUrl.pathname === apiPath
        || requestUrl.pathname.startsWith(`${apiPath}/`);
};

const isCrossOriginAbsoluteRequest = (config) => {
    const url = String(config.url || '');
    if (!isAbsoluteUrl(url)) return false;

    const origin = getWindowOrigin();
    const requestUrl = origin ? getUrl(url, origin) : null;
    return Boolean(requestUrl && requestUrl.origin !== origin);
};

const fetchCsrfToken = async () => {
    if (csrfToken) return csrfToken;

    if (!csrfTokenPromise) {
        csrfTokenPromise = axios.get('/csrf-token', {
            baseURL: API_URL,
            timeout: API_CONFIG.fastTimeoutMs,
            withCredentials: true
        }).then((response) => {
            const token = response.data?.csrfToken || response.data?.token || response.data?.data?.csrfToken || '';
            csrfToken = token;
            return token;
        }).finally(() => {
            csrfTokenPromise = null;
        });
    }

    return csrfTokenPromise;
};

const shouldAttachCsrfToken = (config, isTrustedApiRequest) => {
    const method = String(config.method || 'get').toLowerCase();
    const url = String(config.url || '');
    return UNSAFE_METHODS.has(method)
        && isTrustedApiRequest
        && !config.skipCsrf
        && !url.includes('/csrf-token')
        && !url.includes('/auth/login')
        && !url.includes('/auth/refresh');
};
// 默认API实例（用于一般请求）
export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: API_CONFIG.timeoutMs,
    retry: API_CONFIG.retryCount,
    retryDelay: API_CONFIG.retryDelayMs,
    withCredentials: true  // ✅ 重要：允许发送Cookie
});
// 快速API实例（用于用户信息等关键请求）
export const fastApi = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: API_CONFIG.fastTimeoutMs,
    retry: API_CONFIG.retryCount,
    retryDelay: API_CONFIG.fastRetryDelayMs,
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
    apiInstance.interceptors.request.use(async (config) => {
        config.url = normalizeApiRequestUrl(config.url);

        const isTrustedApiRequest = isCredentialedApiRequest(config);
        config.headers = config.headers || {};
        delete config.headers['Authorization'];
        delete config.headers.authorization;

        if (!isTrustedApiRequest && isCrossOriginAbsoluteRequest(config)) {
            config.withCredentials = false;
        }

        if (shouldAttachCsrfToken(config, isTrustedApiRequest)) {
            const csrf = await fetchCsrfToken();
            if (csrf) {
                config.headers['X-CSRF-Token'] = csrf;
            }
        }
        return config;
    }, (error) => {
        console.error('API请求拦截器错误:', error);
        return Promise.reject(error);
    });
    // 用于管理刷新Token的状态
    let isRefreshing = false;
    let failedQueue = [];
    const processQueue = (error) => {
        failedQueue.forEach(prom => {
            if (error) {
                prom.reject(error);
            } else {
                prom.resolve();
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
            const originalRequest = error.config || {};
            const requestUrl = String(originalRequest.url || '');
            const csrfErrorCode = error.response?.data?.errorCode || error.response?.data?.code;
            if (error.response?.status === 403 && csrfErrorCode === 'INVALID_CSRF_TOKEN' && !originalRequest._csrfRetry) {
                csrfToken = '';
                originalRequest._csrfRetry = true;
                return apiInstance(originalRequest);
            }
            // 如果是401错误且不是登录/刷新接口且未重试过
            if (error.response?.status === 401 &&
                isCredentialedApiRequest(originalRequest) &&
                !requestUrl.includes('/auth/login') &&
                !requestUrl.includes('/auth/refresh') &&
                !originalRequest._retry) {
                if (isRefreshing) {
                    return new Promise((resolve, reject) => {
                        failedQueue.push({ resolve, reject });
                    }).then(() => {
                        return apiInstance(originalRequest);
                    });
                    // 刷新失败时此 Promise 会被 reject，
                    // 但无需 .catch() 再弹错误，因为发起刷新的请求已负责跳转登录页
                }
                originalRequest._retry = true;
                isRefreshing = true;
                try {
                    // Refresh is cookie-based; the backend rotates HttpOnly cookies.
                    await apiInstance.post('/auth/refresh');
                    originalRequest.headers = originalRequest.headers || {};
                    delete originalRequest.headers['Authorization'];
                    delete originalRequest.headers.authorization;
                    processQueue(null);
                    return apiInstance(originalRequest);
                } catch (refreshError) {
                    processQueue(refreshError);
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
applyRequestOptimizer(api, axios, {
    defaultCacheTtl: API_CONFIG.getCacheTtlMs,
    maxCacheSize: API_CONFIG.maxRequestCacheSize
});
applyRequestOptimizer(fastApi, axios, {
    defaultCacheTtl: API_CONFIG.getCacheTtlMs,
    maxCacheSize: API_CONFIG.maxRequestCacheSize
});
setupInterceptors(api);
setupInterceptors(fastApi);
// 请求重试拦截器（仅对网络错误和 5xx 服务端错误重试，排除认证相关的 4xx）
api.interceptors.response.use(undefined, async (err) => {
    const config = err.config;
    const status = err.response?.status;
    const method = (config?.method || 'get').toLowerCase();
    const isIdempotent = method === 'get' || method === 'head';
    // 不重试：无配置/超限/非幂等方法（避免重复提交）/认证权限类 4xx
    if (!config || !config.retry || config.retryCount >= config.retry || !isIdempotent || (status && status >= 400 && status < 500)) {
        return Promise.reject(err);
    }
    config.retryCount = (config.retryCount || 0) + 1;
    await new Promise(resolve => setTimeout(resolve, config.retryDelay || API_CONFIG.retryDelayMs));
    return api(config);
});
export default api;
