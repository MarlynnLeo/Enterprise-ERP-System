/**
 * traceId.js
 * @description 请求链路追踪中间件 — 为每个请求注入唯一的 traceId
 * @date 2026-06-22
 *
 * traceId 会注入到:
 *  - req.traceId      → 业务代码可直接使用
 *  - res header       → 'x-trace-id' 返回给前端用于问题排查
 *  - req.logger       → 携带 traceId 的上下文 logger（可选使用）
 */

const { randomUUID } = require('crypto');
const { logger } = require('../utils/logger');

const TRACE_HEADER = 'x-trace-id';

/**
 * 创建链路追踪中间件
 * @returns {Function} Express middleware
 */
function traceIdMiddleware(req, res, next) {
  // 优先使用上游传入的 traceId（如 nginx / 网关），否则生成新的
  const traceId = req.headers[TRACE_HEADER] || randomUUID();

  req.traceId = traceId;
  res.setHeader(TRACE_HEADER, traceId);

  // 创建携带 traceId 的上下文 logger
  req.logger = {
    error: (msg, meta = {}) => logger.error(msg, { ...meta, traceId }),
    warn: (msg, meta = {}) => logger.warn(msg, { ...meta, traceId }),
    info: (msg, meta = {}) => logger.info(msg, { ...meta, traceId }),
    debug: (msg, meta = {}) => logger.debug(msg, { ...meta, traceId }),
  };

  next();
}

module.exports = traceIdMiddleware;
