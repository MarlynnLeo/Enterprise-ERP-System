/**
 * BusinessError.js
 * @description 带有前端引导行为的业务级错误
 *
 * 提供统一的业务错误判定和响应工具方法：
 *   - BusinessError.is(error) — 判断错误是否属于业务错误
 *   - BusinessError.handleError(res, error, fallback, ResponseHandler) — 统一 catch 块响应
 *
 * @date 2025-12-13
 * @version 2.0.0
 */
class BusinessError extends Error {
  /**
   * 构造业务错误
   * @param {string} message 错误消息（将展示给用户看）
   * @param {Object} action 附带的新增行动指令，例如：{ route: '/basedata/materials', buttonText: '去完善物料' }
   * @param {string} errorCode 给前端分辨用的特定错误码，默认 'BUSINESS_ERROR'
   * @param {number} httpStatus 返回给前端的 Http StatusCode
   */
  constructor(message, action = null, errorCode = 'BUSINESS_ERROR', httpStatus = 400) {
    super(message);
    this.name = 'BusinessError';
    this.action = action;
    this.errorCode = errorCode;
    this.httpStatus = httpStatus;
  }

  /**
   * 判断错误是否为业务错误（替代正则匹配错误消息的做法）
   * 兼容 BusinessError 实例、带 statusCode/httpStatus 的错误、以及模型层抛出的原生 Error
   * @param {Error} error - 错误对象
   * @returns {boolean}
   */
  static is(error) {
    if (!error) return false;
    if (error instanceof BusinessError) return true;
    // 向后兼容：部分模型层/服务层给 Error 设置了 statusCode 或 httpStatus
    if (error.statusCode && error.statusCode < 500) return true;
    if (error.httpStatus && error.httpStatus < 500) return true;
    if (error.code === 'VALIDATION_ERROR') return true;
    return false;
  }

  /**
   * 获取适当的 HTTP 状态码
   * @param {Error} error
   * @param {number} [fallback=500]
   * @returns {number}
   */
  static statusCodeOf(error, fallback = 500) {
    if (error instanceof BusinessError) return error.httpStatus;
    if (error && error.statusCode && error.statusCode < 500) return error.statusCode;
    if (error && error.httpStatus && error.httpStatus < 500) return error.httpStatus;
    return fallback;
  }

  /**
   * 获取适当的错误码
   * @param {Error} error
   * @param {string} [fallback='SERVER_ERROR']
   * @returns {string}
   */
  static codeOf(error, fallback = 'SERVER_ERROR') {
    if (error instanceof BusinessError) return error.errorCode;
    if (error && error.code && error.code !== 'ERR_HTTP_HEADERS_SENT') return error.code;
    return fallback;
  }

  /**
   * 统一的 catch 块错误响应方法
   * 控制器 catch 块可直接调用此方法，替代分散的正则匹配逻辑
   * @param {Object} res - Express 响应对象
   * @param {Error} error - 捕获的异常
   * @param {string} fallbackMessage - 系统错误时的兜底消息
   * @param {Object} ResponseHandler - ResponseHandler 工具
   * @returns {Object} Express 响应
   */
  static handleError(res, error, fallbackMessage, ResponseHandler) {
    const isBiz = BusinessError.is(error);
    const statusCode = isBiz ? BusinessError.statusCodeOf(error) : 500;
    const errorCode = isBiz ? BusinessError.codeOf(error, 'VALIDATION_ERROR') : 'SERVER_ERROR';
    const message = isBiz ? (error.message || fallbackMessage) : fallbackMessage;
    return ResponseHandler.error(res, message, errorCode, statusCode, error);
  }
}

module.exports = BusinessError;
