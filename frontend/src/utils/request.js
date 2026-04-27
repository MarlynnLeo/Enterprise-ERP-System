/**
 * request.js
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */

import axios from 'axios';
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import router from '@/router';
import { tokenManager } from '@/utils/unifiedStorage';

// 创建axios实例
const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api', // 从环境变量获取API基础URL，默认使用/api前缀
  timeout: 15000, // 请求超时时间15秒
  withCredentials: true // 允许发送Cookie
});

// 请求拦截器
service.interceptors.request.use(
  config => {
    // 通过统一的 tokenManager 获取 token
    const token = tokenManager.getToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    // 对于非GET请求，添加CSRF Token
    if (config.method !== 'get' && config.method !== 'GET') {
      const csrfToken = getCsrfTokenFromCookie();
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken;
      }
    }

    return config;
  },
  error => {
    console.error('请求错误:', error);
    return Promise.reject(error);
  }
);

/**
 * 从Cookie中获取CSRF Token
 */
function getCsrfTokenFromCookie() {
  const name = '_csrf=';
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    cookie = cookie.trim();
    if (cookie.indexOf(name) === 0) {
      return cookie.substring(name.length);
    }
  }
  return null;
}

// ✅ 审计修复(B-4): Token 刷新并发锁
// 防止多个请求同时触发刷新，避免竞态导致 token 失效
let isRefreshing = false;
let refreshSubscribers = [];

/**
 * 将等待刷新的请求加入队列
 */
function subscribeTokenRefresh(callback) {
  refreshSubscribers.push(callback);
}

/**
 * 刷新成功后，通知所有排队的请求重试
 */
function onTokenRefreshed() {
  refreshSubscribers.forEach(cb => cb());
  refreshSubscribers = [];
}

// 响应拦截器
service.interceptors.response.use(
  response => {
    const res = response.data;

    // 如果响应直接返回数据，则直接返回数据
    return res;
  },
  async error => {
    let message = '';

    if (error.response) {
      // 服务器返回了错误状态码
      const { status, data } = error.response;

      switch (status) {
        case 400:
          message = data.message || '请求参数错误';
          break;
        case 401:
          // ✅ 审计修复(B-4): Token 过期处理 — 使用并发锁防止多次刷新竞争
          if (data.code === 'TOKEN_EXPIRED') {
            if (!isRefreshing) {
              // 第一个请求负责刷新
              isRefreshing = true;
              try {
                const refreshResponse = await axios.post('/api/auth/refresh', {}, {
                  withCredentials: true
                });

                if (refreshResponse.data.success) {
                  // 刷新成功，通知所有排队请求重试
                  isRefreshing = false;
                  onTokenRefreshed();
                  // 重试当前请求
                  return service(error.config);
                }
              } catch (refreshError) {
                // 刷新失败，清理状态并跳转登录
                isRefreshing = false;
                refreshSubscribers = [];
                message = '登录已过期，请重新登录';
                tokenManager.removeToken();
                tokenManager.removeUser();
                if (!window.location.pathname.includes('/login')) {
                  window.location.href = '/login';
                }
                break;
              }
            } else {
              // 其他请求排队等待刷新完成后重试
              return new Promise((resolve) => {
                subscribeTokenRefresh(() => {
                  resolve(service(error.config));
                });
              });
            }
          }

          tokenManager.removeToken();
          tokenManager.removeUser();
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login';
          }
          message = data.message || '未授权，请重新登录';
          break;
        case 403:
          if (data.code === 'INVALID_CSRF_TOKEN') {
            message = 'CSRF令牌无效，页面将刷新';
            // 刷新页面以获取新的CSRF令牌
            setTimeout(() => window.location.reload(), 1000);
          } else {
            message = data.message || '拒绝访问';
          }
          break;
        case 404:
          message = '请求的资源不存在';
          break;
        case 429:
          message = '请求过于频繁，请稍后再试';
          break;
        case 500:
          message = data.message || '服务器内部错误';
          break;
        default:
          message = `请求错误: ${status}`;
      }
    } else if (error.request) {
      // 请求发出但没有收到响应
      message = '服务器无响应，请检查网络连接';
    } else {
      // 请求设置触发的错误
      message = error.message;
    }

    // 默认错误提示
    ElMessage({
      message: message,
      type: 'error',
      duration: 5000
    });

    return Promise.reject(error);
  }
);

export default service; 