import axios from 'axios';
import { API_CONFIG, normalizeApiRequestUrl } from '@/config/app';
import { applyRequestOptimizer, clearAllRequestCaches } from '@/utils/requestOptimizer';
import { ElMessage } from 'element-plus/es/components/message/index';
import 'element-plus/es/components/message/style/css';
// 使用环境变量，如果没有设置则使用相对路径
const API_URL = API_CONFIG.defaultBaseURL;
const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete']);
const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d+\-.]*:/i;
let csrfToken = '';
let csrfTokenPromise = null;

export const resetCsrfToken = () => {
    csrfToken = '';
    csrfTokenPromise = null;
};

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

/** 解析 CSRF 接口完整路径，避免 baseURL + 绝对路径拼接出错 */
const resolveCsrfTokenUrl = () => {
    const base = String(API_URL || '/api').replace(/\/+$/, '');
    if (!base || base === '/') return '/api/csrf-token';
    if (base.endsWith('/api')) return `${base}/csrf-token`;
    // 已是完整 API 根（如 https://host/api）或自定义前缀
    return `${base}/csrf-token`;
};

const requestCsrfTokenOnce = async () => {
    // 使用绝对站点路径，不依赖 baseURL 拼接（开发环境走 Vite /api 代理）
    const response = await axios.get(resolveCsrfTokenUrl(), {
        timeout: API_CONFIG.fastTimeoutMs,
        withCredentials: true,
    });
    const body = response?.data || {};
    const token = body.csrfToken || body.token || body.data?.csrfToken || '';
    if (!token) {
        throw new Error('CSRF 响应中未包含令牌');
    }
    return token;
};

const fetchCsrfToken = async () => {
    if (csrfToken) return csrfToken;

    if (!csrfTokenPromise) {
        csrfTokenPromise = (async () => {
            try {
                csrfToken = await requestCsrfTokenOnce();
                return csrfToken;
            } catch {
                // 后端刚重启或代理瞬断时重试一次
                await new Promise((resolve) => setTimeout(resolve, 400));
                try {
                    csrfToken = await requestCsrfTokenOnce();
                    return csrfToken;
                } catch (secondError) {
                    csrfToken = '';
                    const status = secondError?.response?.status;
                    const message =
                        status === 404
                            ? '无法获取安全令牌（/api/csrf-token 404）。请确认后端已启动（默认端口 8080），并刷新页面后重试。'
                            : `无法获取安全令牌: ${secondError?.response?.data?.message || secondError?.message || '网络错误'}`;
                    const error = new Error(message);
                    error.response = secondError?.response;
                    error.cause = secondError;
                    throw error;
                }
            } finally {
                csrfTokenPromise = null;
            }
        })();
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
        && !url.includes('/auth/login');
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
// api / fastApi 共享刷新态，避免双实例并发双刷 refresh 导致误登出
let sharedIsRefreshing = false;
let sharedFailedQueue = [];

const processRefreshQueue = (error) => {
    sharedFailedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve();
        }
    });
    sharedFailedQueue = [];
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
            try {
                const csrf = await fetchCsrfToken();
                if (csrf) {
                    config.headers['X-CSRF-Token'] = csrf;
                }
            } catch (csrfError) {
                // 明确抛出中文错误，避免只显示 axiosInstance.js 行号
                return Promise.reject(csrfError);
            }
        }
        return config;
    }, (error) => {
        console.error('API请求拦截器错误:', error);
        return Promise.reject(error);
    });
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
                if (sharedIsRefreshing) {
                    return new Promise((resolve, reject) => {
                        sharedFailedQueue.push({ resolve, reject });
                    }).then(() => {
                        return apiInstance(originalRequest);
                    });
                    // 刷新失败时此 Promise 会被 reject，
                    // 但无需 .catch() 再弹错误，因为发起刷新的请求已负责跳转登录页
                }
                originalRequest._retry = true;
                sharedIsRefreshing = true;
                try {
                    // Refresh is cookie-based; the backend rotates HttpOnly cookies.
                    // 统一走 api 实例刷新，避免 fastApi 超时策略分裂会话
                    await api.post('/auth/refresh');
                    resetCsrfToken();
                    originalRequest.headers = originalRequest.headers || {};
                    delete originalRequest.headers['Authorization'];
                    delete originalRequest.headers.authorization;
                    processRefreshQueue(null);
                    return apiInstance(originalRequest);
                } catch (refreshError) {
                    processRefreshQueue(refreshError);
                    clearAllRequestCaches();
                    try {
                        // 动态导入避免循环依赖
                        const { useAuthStore } = await import('@/stores/auth');
                        const authStore = useAuthStore();
                        if (typeof authStore.clearClientSession === 'function') {
                            authStore.clearClientSession();
                        }
                    } catch {
                        // ignore store cleanup errors
                    }
                    // Route guards handle their own failed session probes with an
                    // in-app redirect. Other 401 responses retain the hard fallback
                    // so an expired mounted session cannot remain on a protected page.
                    if (!originalRequest.skipAuthRedirect && !window.location.pathname.includes('/login')) {
                        window.location.replace('/login');
                    }
                    return Promise.reject(refreshError);
                } finally {
                    sharedIsRefreshing = false;
                }
            }

            // 写操作 403 才全局提示。GET 403 多为页面附属下拉/统计，由页面自行处理，避免一进页连弹多条。
            const method = String(originalRequest.method || 'get').toLowerCase();
            const isWrite = method !== 'get' && method !== 'head';
            if (
                isWrite &&
                error.response?.status === 403 &&
                csrfErrorCode !== 'INVALID_CSRF_TOKEN' &&
                !originalRequest._forbiddenToastShown
            ) {
                originalRequest._forbiddenToastShown = true;
                const msg =
                    error.response?.data?.message ||
                    error.response?.data?.error ||
                    '您没有权限执行此操作';
                ElMessage.error(msg);
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
