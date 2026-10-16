import axios from 'axios';
import { API_CONFIG, normalizeApiRequestUrl } from '@/config/app';
import { applyRequestOptimizer, clearAllRequestCaches } from '@/utils/requestOptimizer';
import { getApiErrorMessage } from '@/utils/errorHandler';
import { ElMessage } from 'element-plus/es/components/message/index';
import 'element-plus/es/components/message/style/css';
// 使用环境变量，如果没有设置则使用相对路径
const API_URL = API_CONFIG.defaultBaseURL;
const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete']);
let csrfToken = '';
let csrfTokenPromise = null;
let csrfGeneration = 0;
let authGeneration = 0;

// Login/logout invalidate the principal; token rotation keeps the same principal.
export const resetCsrfToken = ({ sessionChanged = true } = {}) => {
    if (sessionChanged) authGeneration++;
    csrfGeneration++;
    csrfToken = '';
    csrfTokenPromise = null;
};

const assertRequestSession = (config) => {
    if (config?._authGeneration !== undefined && config._authGeneration !== authGeneration) {
        throw new axios.CanceledError('登录状态已变更，请重新提交操作');
    }
};

const getWindowOrigin = () => (
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''
);

const getUrl = (url, baseOrigin) => {
    try {
        return new URL(String(url || ''), baseOrigin || undefined);
    } catch {
        return null;
    }
};

const isCredentialedApiRequest = (config) => {
    const origin = getWindowOrigin();
    if (!origin) return false;

    // A relative URL can still target an external host through baseURL.
    // Trust the configured application API, never a per-request override.
    const requestUrl = getUrl(axios.getUri(config), origin);
    const apiBaseUrl = getUrl(API_URL, origin);
    if (!requestUrl || !apiBaseUrl || requestUrl.origin !== apiBaseUrl.origin) {
        return false;
    }

    const apiPath = apiBaseUrl.pathname.replace(/\/+$/, '') || '/';
    return apiPath === '/'
        || requestUrl.pathname === apiPath
        || requestUrl.pathname.startsWith(`${apiPath}/`);
};

const isCrossOriginRequest = (config) => {
    const origin = getWindowOrigin();
    const requestUrl = origin ? getUrl(axios.getUri(config), origin) : null;
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
        const generation = csrfGeneration;
        const principal = authGeneration;
        const assertCurrentSession = () => {
            if (principal !== authGeneration) {
                throw new axios.CanceledError('登录状态已变更，请重新提交操作');
            }
        };
        const pending = (async () => {
            try {
                const token = await requestCsrfTokenOnce();
                assertCurrentSession();
                if (generation !== csrfGeneration) return fetchCsrfToken();
                csrfToken = token;
                return csrfToken;
            } catch {
                assertCurrentSession();
                if (generation !== csrfGeneration) return fetchCsrfToken();
                // 后端刚重启或代理瞬断时重试一次
                await new Promise((resolve) => setTimeout(resolve, 400));
                assertCurrentSession();
                if (generation !== csrfGeneration) return fetchCsrfToken();
                try {
                    const token = await requestCsrfTokenOnce();
                    assertCurrentSession();
                    if (generation !== csrfGeneration) return fetchCsrfToken();
                    csrfToken = token;
                    return csrfToken;
                } catch (secondError) {
                    assertCurrentSession();
                    if (generation !== csrfGeneration) return fetchCsrfToken();
                    csrfToken = '';
                    const status = secondError?.response?.status;
                    const message =
                        status === 404
                            ? '无法获取安全令牌（/api/csrf-token 404）。请确认后端已启动（默认端口 8080），并刷新页面后重试。'
                            : `无法获取安全令牌：${getApiErrorMessage(secondError, '网络错误')}`;
                    const error = new Error(message);
                    error.response = secondError?.response;
                    error.cause = secondError;
                    throw error;
                }
            } finally {
                if (csrfTokenPromise === pending) csrfTokenPromise = null;
            }
        })();
        csrfTokenPromise = pending;
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
const normalizeClientError = (error) => {
    const message = getApiErrorMessage(error, '操作失败');
    if (!message) return error;

    // 老页面仍可能直接读取 response.data.message。统一把该字段规范化，
    // 这样错误码和开发环境中的 error 对象不会绕过统一错误解析直接展示。
    error.message = message;
    const data = error.response?.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        data.message = message;
        if ('msg' in data) data.msg = message;
        if (data.error && typeof data.error === 'object') data.error.message = message;
        else if (typeof data.error === 'string') data.error = message;
    }
    return error;
};

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
            throw normalizeClientError(error);
        }
    }
    // 非 ResponseHandler 格式，直接返回（兼容直接返回数据的接口）
    return response;
};
// api / fastApi 共享刷新态，避免双实例并发双刷 refresh 导致误登出
let sharedIsRefreshing = false;
let sharedFailedQueue = [];
// 防止多个 401 同时 hard-redirect，把低端机浏览器卡死
let authRedirectScheduled = false;
let sharedRefreshPromise = null;

const REFRESH_LOCK_KEY = 'erp_auth_refresh_lock';
const REFRESH_LOCK_TTL_MS = 12000;
const REFRESH_WAIT_POLL_MS = 80;
const REFRESH_WAIT_MAX_MS = 10000;

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

const redirectToLoginOnce = () => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname.includes('/login')) return;
    if (authRedirectScheduled) return;
    authRedirectScheduled = true;
    // Soft navigate first; hard replace only as fallback after paint.
    try {
        window.location.replace('/login');
    } catch {
        window.location.href = '/login';
    }
};

const readRefreshLock = () => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(REFRESH_LOCK_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.owner || !parsed?.expiresAt) return null;
        if (Number(parsed.expiresAt) <= Date.now()) {
            localStorage.removeItem(REFRESH_LOCK_KEY);
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
};

const tryAcquireRefreshLock = () => {
    if (typeof window === 'undefined') return true;
    const owner = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
        const existing = readRefreshLock();
        if (existing) return false;
        const payload = JSON.stringify({
            owner,
            expiresAt: Date.now() + REFRESH_LOCK_TTL_MS,
        });
        localStorage.setItem(REFRESH_LOCK_KEY, payload);
        const confirmed = readRefreshLock();
        return Boolean(confirmed && confirmed.owner === owner);
    } catch {
        // private mode / blocked storage — fall back to in-tab single flight only
        return true;
    }
};

const releaseRefreshLock = () => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem(REFRESH_LOCK_KEY);
    } catch {
        // ignore
    }
};

const waitForCrossTabRefresh = async () => {
    const started = Date.now();
    while (Date.now() - started < REFRESH_WAIT_MAX_MS) {
        const lock = readRefreshLock();
        if (!lock) return true;
        await new Promise((resolve) => setTimeout(resolve, REFRESH_WAIT_POLL_MS));
    }
    // Stale lock — clear and let caller try
    releaseRefreshLock();
    return false;
};

/**
 * Single-flight refresh across tabs. Concurrent tabs either wait for the
 * lock holder or perform one refresh themselves.
 */
const refreshSessionOnce = async () => {
    if (sharedRefreshPromise) return sharedRefreshPromise;

    sharedRefreshPromise = (async () => {
        // Another tab may already be refreshing.
        if (!tryAcquireRefreshLock()) {
            await waitForCrossTabRefresh();
            // Winner should have rotated cookies; caller retries original request.
            return;
        }

        try {
            let lastError = null;
            for (let attempt = 0; attempt < 2; attempt += 1) {
                try {
                    await api.post('/auth/refresh', {}, {
                        skipAuthRedirect: true,
                        // Avoid the response interceptor re-entering refresh on 401.
                        _retry: true,
                    });
                    resetCsrfToken({ sessionChanged: false });
                    return;
                } catch (error) {
                    lastError = error;
                    const code =
                        error?.response?.data?.errorCode ||
                        error?.response?.data?.code ||
                        error?.code;
                    const status = error?.response?.status;
                    // Concurrent rotation race — brief wait then one retry.
                    if (
                        attempt === 0 &&
                        (status === 409 || code === 'REFRESH_TOKEN_BUSY')
                    ) {
                        await new Promise((resolve) => setTimeout(resolve, 250));
                        continue;
                    }
                    throw error;
                }
            }
            throw lastError || new Error('refresh failed');
        } finally {
            releaseRefreshLock();
        }
    })();

    try {
        await sharedRefreshPromise;
    } finally {
        sharedRefreshPromise = null;
    }
};

// 通用拦截器配置函数
const setupInterceptors = (apiInstance) => {
    apiInstance.interceptors.request.use(async (config) => {
        config._authGeneration ??= authGeneration;
        assertRequestSession(config);
        config.url = normalizeApiRequestUrl(config.url);

        const isTrustedApiRequest = isCredentialedApiRequest(config);
        config.headers = axios.AxiosHeaders.from(config.headers);
        config.headers.delete('Authorization');

        if (!isTrustedApiRequest) {
            config.headers.delete('X-CSRF-Token');
            if (isCrossOriginRequest(config)) config.withCredentials = false;
        }

        if (shouldAttachCsrfToken(config, isTrustedApiRequest)) {
            try {
                const csrf = await fetchCsrfToken();
                assertRequestSession(config);
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
            assertRequestSession(response.config);
            // ✅ 统一解包 ResponseHandler 格式
            // 解包后 response.data 就是实际的业务数据
            // 前端代码统一使用 response.data 获取数据
            return unwrapResponse(response);
        },
        async (error) => {
            if (axios.isCancel(error)) return Promise.reject(error);
            // 非 2xx 响应不会经过 unwrapResponse，统一保留后端返回的中文提示，
            // 避免页面只能看到 Axios 技术错误或错误代码。
            normalizeClientError(error);
            const originalRequest = error.config || {};
            assertRequestSession(originalRequest);
            const requestUrl = String(originalRequest.url || '');
            const csrfErrorCode = error.response?.data?.errorCode || error.response?.data?.code;
            if (error.response?.status === 403 && isCredentialedApiRequest(originalRequest) && csrfErrorCode === 'INVALID_CSRF_TOKEN' && !originalRequest._csrfRetry) {
                resetCsrfToken({ sessionChanged: false });
                originalRequest._csrfRetry = true;
                originalRequest.headers = originalRequest.headers || {};
                delete originalRequest.headers['X-CSRF-Token'];
                delete originalRequest.headers['x-csrf-token'];
                return apiInstance(originalRequest);
            }
            // 如果是401错误且不是登录/刷新接口且未重试过
            if (error.response?.status === 401 &&
                isCredentialedApiRequest(originalRequest) &&
                !requestUrl.includes('/auth/login') &&
                !requestUrl.includes('/auth/refresh') &&
                !originalRequest._retry) {
                // Queued requests share the same single retry limit as the
                // request that started the refresh.
                originalRequest._retry = true;
                if (sharedIsRefreshing) {
                    return new Promise((resolve, reject) => {
                        sharedFailedQueue.push({ resolve, reject });
                    }).then(() => {
                        return apiInstance(originalRequest);
                    });
                    // 刷新失败时此 Promise 会被 reject，
                    // 但无需 .catch() 再弹错误，因为发起刷新的请求已负责跳转登录页
                }
                sharedIsRefreshing = true;
                try {
                    // Cookie-based refresh with cross-tab single-flight.
                    await refreshSessionOnce();
                    originalRequest.headers = originalRequest.headers || {};
                    delete originalRequest.headers['Authorization'];
                    delete originalRequest.headers.authorization;
                    processRefreshQueue(null);
                    return apiInstance(originalRequest);
                } catch (refreshError) {
                    processRefreshQueue(refreshError);
                    assertRequestSession(originalRequest);
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
                    // in-app redirect. Other 401 responses retain a single hard
                    // fallback so we never stack dozens of location.replace calls.
                    if (!originalRequest.skipAuthRedirect) {
                        redirectToLoginOnce();
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
                    getApiErrorMessage(error, '您没有权限执行此操作');
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
