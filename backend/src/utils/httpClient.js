/**
 * httpClient.js
 * @description 基于原生 https/http 模块的 HTTP 请求工具
 *
 * 背景：axios + follow-redirects 在当前网络环境下发起 HTTPS 请求时
 *       TLS 握手不稳定（ECONNRESET），而 Node.js 原生 https 模块始终正常。
 *       本模块提供统一的 httpGet / httpPost 方法替代 axios 对外部服务的调用。
 *
 * @date 2026-06-11
 * @version 1.0.0
 */

const https = require('https');
const http = require('http');

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

/**
 * 发起 HTTP/HTTPS 请求
 * @param {string} method - GET / POST / PUT / DELETE
 * @param {string} urlString - 完整 URL
 * @param {Object} [options={}]
 * @param {Object} [options.params] - URL 查询参数
 * @param {Object} [options.data] - 请求体（自动 JSON 序列化）
 * @param {Object} [options.headers] - 自定义请求头
 * @param {number} [options.timeout] - 超时毫秒数
 * @param {boolean} [options.rejectUnauthorized] - 是否验证 SSL 证书（默认 true）
 * @param {number} [options.retries] - 重试次数（默认 MAX_RETRIES）
 * @param {number} [options.maxResponseBytes] - 最大响应体字节数（默认 5MB）
 * @returns {Promise<{status: number, data: any, headers: Object}>}
 */
const request = (method, urlString, options = {}) => {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const {
    params,
    data,
    headers = {},
    timeout = DEFAULT_TIMEOUT_MS,
    rejectUnauthorized = true,
    retries: configuredRetries,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  } = options;
  const safeToRetry = ['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod);
  const parsedRetries = Number.parseInt(configuredRetries, 10);
  const retries = Number.isInteger(parsedRetries)
    ? Math.min(Math.max(parsedRetries, 0), 5)
    : safeToRetry
      ? MAX_RETRIES
      : 0;

  const doRequest = () => {
    return new Promise((resolve, reject) => {
      const url = new URL(urlString);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(`Unsupported protocol for HTTP request: ${url.protocol}`);
      }

      // 追加查询参数
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
          }
        });
      }

      const body = data ? JSON.stringify(data) : null;
      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? https : http;
      const safeRequestTarget = `${url.origin}${url.pathname}`;
      const safeMaxResponseBytes = Math.max(
        1,
        Number.parseInt(maxResponseBytes, 10) || DEFAULT_MAX_RESPONSE_BYTES
      );

      const requestHeaders = { ...headers };
      if (body) {
        requestHeaders['Content-Type'] = requestHeaders['Content-Type'] || 'application/json';
        requestHeaders['Content-Length'] = Buffer.byteLength(body);
      }

      const reqOptions = {
        method: normalizedMethod,
        hostname: url.hostname,
        path: url.pathname + url.search,
        port: url.port || (isHttps ? 443 : 80),
        headers: requestHeaders,
        timeout,
      };

      if (isHttps) {
        reqOptions.rejectUnauthorized = rejectUnauthorized;
      }

      let settled = false;
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        callback(value);
      };

      const req = transport.request(reqOptions, (res) => {
        const chunks = [];
        let receivedBytes = 0;
        res.on('data', (chunk) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          receivedBytes += buffer.length;
          if (receivedBytes > safeMaxResponseBytes) {
            const error = new Error(
              `HTTP response too large (${receivedBytes} bytes): ${normalizedMethod} ${safeRequestTarget}`
            );
            error.code = 'HTTP_RESPONSE_TOO_LARGE';
            res.destroy(error);
            req.destroy(error);
            settle(reject, error);
            return;
          }
          chunks.push(buffer);
        });
        res.on('error', (error) => settle(reject, error));
        res.on('end', () => {
          if (settled) return;
          const rawBody = Buffer.concat(chunks).toString('utf8');
          let parsedData;
          try {
            parsedData = rawBody ? JSON.parse(rawBody) : null;
          } catch {
            // 非 JSON 响应，返回原始字符串
            parsedData = rawBody;
          }
          settle(resolve, {
            status: res.statusCode,
            data: parsedData,
            headers: res.headers,
          });
        });
      });

      req.on('error', (error) => settle(reject, error));
      req.on('timeout', () => {
        const error = new Error(
          `HTTP 请求超时 (${timeout}ms): ${normalizedMethod} ${safeRequestTarget}`
        );
        error.code = 'ETIMEDOUT';
        req.destroy();
        settle(reject, error);
      });

      if (body) req.write(body);
      req.end();
    });
  };

  // 带重试的请求
  const executeWithRetry = async () => {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await doRequest();
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * (attempt + 1)));
        }
      }
    }
    throw lastError;
  };

  return executeWithRetry();
};

/**
 * GET 请求
 * @param {string} url - 完整 URL
 * @param {Object} [options] - 同 request options（不含 data）
 * @returns {Promise<{status: number, data: any, headers: Object}>}
 */
const httpGet = (url, options = {}) => request('GET', url, options);

/**
 * POST 请求
 * @param {string} url - 完整 URL
 * @param {Object} [data] - 请求体
 * @param {Object} [options] - 同 request options（不含 data）
 * @returns {Promise<{status: number, data: any, headers: Object}>}
 */
const httpPost = (url, data, options = {}) => request('POST', url, { ...options, data });

module.exports = {
  request,
  httpGet,
  httpPost,
  DEFAULT_MAX_RESPONSE_BYTES,
};
