/**
 * 统一响应处理器
 * @description 提供统一的API响应格式和数据转换功能
 * @author ERP开发团队
 * @date 2025-01-27
 */

/**
 * 响应处理器
 */
class ResponseHandler {
  /**
   * 成功响应
   * @param {Object} res - Express响应对象
   * @param {*} data - 响应数据
   * @param {String} message - 成功消息
   * @param {Number} code - HTTP状态码
   */
  static success(res, data = null, message = '操作成功', code = 200) {
    return res.status(code).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 分页响应
   * @param {Object} res - Express响应对象
   * @param {Array} list - 数据列表
   * @param {Number} total - 总记录数
   * @param {Number} page - 当前页码
   * @param {Number} pageSize - 每页大小
   * @param {String} message - 成功消息
   */
  static paginated(res, list = [], total = 0, page = 1, pageSize = 20, message = '查询成功') {
    return res.status(200).json({
      success: true,
      message,
      data: {
        list,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / pageSize),
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 错误响应
   * @param {Object} res - Express响应对象
   * @param {String} message - 错误消息
   * @param {String} errorCode - 错误代码
   * @param {Number} statusCode - HTTP状态码
   * @param {Error} error - 错误对象（可选）
   */
  static error(res, message = '操作失败', errorCode = 'ERROR', statusCode = 500, error = null) {
    const response = {
      success: false,
      message,
      errorCode,
      timestamp: new Date().toISOString(),
    };

    // [New] 业务报错可能需要前端页面跳页指引
    if (error && error.action) {
      response.action = error.action;
    }

    // 开发环境下包含详细错误信息
    if (process.env.NODE_ENV !== 'production' && error) {
      response.error = {
        message: error.message,
        stack: error.stack,
      };
    }

    return res.status(statusCode).json(response);
  }

  /**
   * 验证错误响应
   * @param {Object} res - Express响应对象
   * @param {String} message - 错误消息
   * @param {Object} errors - 验证错误详情
   */
  static validationError(res, message = '验证失败', errors = {}) {
    return res.status(400).json({
      success: false,
      message,
      errorCode: 'VALIDATION_ERROR',
      errors,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 未授权响应
   * @param {Object} res - Express响应对象
   * @param {String} message - 错误消息
   */
  static unauthorized(res, message = '未授权访问') {
    return res.status(401).json({
      success: false,
      message,
      errorCode: 'UNAUTHORIZED',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 禁止访问响应
   * @param {Object} res - Express响应对象
   * @param {String} message - 错误消息
   */
  static forbidden(res, message = '禁止访问') {
    return res.status(403).json({
      success: false,
      message,
      errorCode: 'FORBIDDEN',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 未找到响应
   * @param {Object} res - Express响应对象
   * @param {String} message - 错误消息
   */
  static notFound(res, message = '资源未找到') {
    return res.status(404).json({
      success: false,
      message,
      errorCode: 'NOT_FOUND',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * 数据转换器
 */
class DataTransformer {
  /**
   * 将snake_case转换为camelCase
   * @param {*} data - 要转换的数据
   * @returns {*} 转换后的数据
   */
  static toCamelCase(data) {
    if (data === null || data === undefined) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.toCamelCase(item));
    }

    if (typeof data === 'object' && data.constructor === Object) {
      const result = {};
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          const camelKey = key.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
          result[camelKey] = this.toCamelCase(data[key]);
        }
      }
      return result;
    }

    return data;
  }

  /**
   * 将camelCase转换为snake_case
   * @param {*} data - 要转换的数据
   * @returns {*} 转换后的数据
   */
  static toSnakeCase(data) {
    if (data === null || data === undefined) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.toSnakeCase(item));
    }

    if (typeof data === 'object' && data.constructor === Object) {
      const result = {};
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          result[snakeKey] = this.toSnakeCase(data[key]);
        }
      }
      return result;
    }

    return data;
  }

  /**
   * 过滤空值
   * @param {Object} obj - 要过滤的对象
   * @returns {Object} 过滤后的对象
   */
  static filterEmpty(obj) {
    const result = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (value !== null && value !== undefined && value !== '') {
          result[key] = value;
        }
      }
    }
    return result;
  }

  /**
   * 提取分页参数
   * @param {Object} query - 查询参数
   * @returns {Object} 分页参数 { page, pageSize, offset, limit }
   */
  static extractPagination(query) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const pageSize = Math.max(1, Math.min(10000, parseInt(query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    return {
      page,
      pageSize,
      offset,
      limit: pageSize,
    };
  }
}

module.exports = {
  ResponseHandler,
  DataTransformer,
};
