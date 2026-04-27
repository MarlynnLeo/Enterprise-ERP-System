/**
 * 统一错误处理中间件
 * 整合和规范化所有错误处理逻辑
 */

const { logger } = require('../utils/logger');
const crypto = require('crypto');

// 生成请求唯一标识（替代未导入的 uuidv4）
const generateRequestId = () => crypto.randomUUID();

// 扩展的错误码定义
const ERROR_CODES = {
  // 通用错误 1000-1999
  INTERNAL_ERROR: { code: 1000, message: '服务器内部错误', statusCode: 500 },
  INVALID_REQUEST: { code: 1001, message: '请求参数无效', statusCode: 400 },
  UNAUTHORIZED: { code: 1002, message: '未授权访问', statusCode: 401 },
  FORBIDDEN: { code: 1003, message: '权限不足', statusCode: 403 },
  NOT_FOUND: { code: 1004, message: '资源不存在', statusCode: 404 },
  VALIDATION_ERROR: { code: 1005, message: '数据验证失败', statusCode: 400 },
  RATE_LIMIT_EXCEEDED: { code: 1006, message: '请求频率超限', statusCode: 429 },

  // 业务错误 2000-2999
  USER_NOT_FOUND: { code: 2001, message: '用户不存在', statusCode: 404 },
  INVALID_CREDENTIALS: { code: 2002, message: '用户名或密码错误', statusCode: 401 },
  USER_DISABLED: { code: 2003, message: '用户已被禁用', statusCode: 403 },
  EMAIL_ALREADY_EXISTS: { code: 2004, message: '邮箱已存在', statusCode: 400 },
  USERNAME_ALREADY_EXISTS: { code: 2005, message: '用户名已存在', statusCode: 400 },

  // 库存错误 3000-3999
  INSUFFICIENT_STOCK: { code: 3001, message: '库存不足', statusCode: 400 },
  INVALID_MATERIAL: { code: 3002, message: '物料不存在', statusCode: 404 },
  STOCK_LOCKED: { code: 3003, message: '库存已锁定', statusCode: 400 },
  INVALID_LOCATION: { code: 3004, message: '库位不存在', statusCode: 404 },

  // 订单错误 4000-4999
  ORDER_NOT_FOUND: { code: 4001, message: '订单不存在', statusCode: 404 },
  ORDER_CANCELLED: { code: 4002, message: '订单已取消', statusCode: 400 },
  ORDER_COMPLETED: { code: 4003, message: '订单已完成', statusCode: 400 },
  INVALID_ORDER_STATUS: { code: 4004, message: '订单状态无效', statusCode: 400 },

  // 数据库错误 5000-5999
  DATABASE_ERROR: { code: 5001, message: '数据库操作失败', statusCode: 500 },
  DUPLICATE_ENTRY: { code: 5002, message: '数据重复', statusCode: 400 },
  FOREIGN_KEY_ERROR: { code: 5003, message: '关联数据不存在', statusCode: 400 },
  CONNECTION_ERROR: { code: 5004, message: '数据库连接失败', statusCode: 503 },

  // 文件错误 6000-6999
  FILE_NOT_FOUND: { code: 6001, message: '文件不存在', statusCode: 404 },
  FILE_TOO_LARGE: { code: 6002, message: '文件过大', statusCode: 413 },
  INVALID_FILE_TYPE: { code: 6003, message: '文件类型不支持', statusCode: 400 },
  FILE_UPLOAD_ERROR: { code: 6004, message: '文件上传失败', statusCode: 500 },
};

// 统一的应用错误类
class UnifiedAppError extends Error {
  constructor(errorCode, details = null, customMessage = null) {
    const errorInfo = ERROR_CODES[errorCode] || ERROR_CODES.INTERNAL_ERROR;
    const message = customMessage || errorInfo.message;

    super(message);

    this.name = 'UnifiedAppError';
    this.code = errorInfo.code;
    this.statusCode = errorInfo.statusCode;
    this.details = details;
    this.isOperational = true;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }
}

// 错误工厂方法
const ErrorFactory = {
  // 验证错误
  validation(message, details = null) {
    return new UnifiedAppError('VALIDATION_ERROR', details, message);
  },

  // 未找到错误
  notFound(resource = '资源') {
    return new UnifiedAppError('NOT_FOUND', null, `${resource}不存在`);
  },

  // 权限错误
  forbidden(message = '权限不足') {
    return new UnifiedAppError('FORBIDDEN', null, message);
  },

  // 未授权错误
  unauthorized(message = '未授权访问') {
    return new UnifiedAppError('UNAUTHORIZED', null, message);
  },

  // 数据库错误
  database(originalError, customMessage = null) {
    return new UnifiedAppError(
      'DATABASE_ERROR',
      {
        originalError: originalError.message,
        code: originalError.code,
      },
      customMessage
    );
  },

  // 业务逻辑错误
  business(code, message, details = null) {
    return new UnifiedAppError(code, details, message);
  },
};

// 统一错误处理中间件
const unifiedErrorHandler = (err, req, res, next) => {
  // 生成请求ID用于追踪
  const requestId = req.requestId || generateRequestId();

  let error = err;

  // 如果不是统一错误，转换为统一错误
  if (!(err instanceof UnifiedAppError)) {
    // 处理不同类型的原生错误
    if (err.name === 'ValidationError') {
      // Mongoose/Sequelize 验证错误
      const message = Object.values(err.errors)
        .map((val) => val.message)
        .join(', ');
      error = ErrorFactory.validation(message, err.errors);
    } else if (err.code === 11000) {
      // MongoDB 重复键错误
      const field = Object.keys(err.keyValue)[0];
      error = new UnifiedAppError('DUPLICATE_ENTRY', null, `${field} 已存在`);
    } else if (err.name === 'JsonWebTokenError') {
      error = ErrorFactory.unauthorized('Token 无效');
    } else if (err.name === 'TokenExpiredError') {
      error = ErrorFactory.unauthorized('Token 已过期');
    } else if (err.name === 'SequelizeUniqueConstraintError') {
      error = new UnifiedAppError('DUPLICATE_ENTRY');
    } else if (err.name === 'SequelizeForeignKeyConstraintError') {
      error = new UnifiedAppError('FOREIGN_KEY_ERROR');
    } else if (err.name === 'SequelizeDatabaseError') {
      error = ErrorFactory.database(err);
    } else if (
      err.code === 'PROTOCOL_CONNECTION_LOST' ||
      err.code === 'ECONNREFUSED' ||
      err.code === 'ETIMEDOUT'
    ) {
      error = new UnifiedAppError('CONNECTION_ERROR');
    } else if (err.code === 'ER_DUP_ENTRY') {
      error = new UnifiedAppError('DUPLICATE_ENTRY');
    } else if (err.code === 'ER_NO_REFERENCED_ROW' || err.code === 'ER_NO_REFERENCED_ROW_2') {
      error = new UnifiedAppError('FOREIGN_KEY_ERROR');
    } else if (err.code === 'LIMIT_FILE_SIZE') {
      error = new UnifiedAppError('FILE_TOO_LARGE');
    } else {
      // 未知错误，转换为内部错误
      error = new UnifiedAppError('INTERNAL_ERROR', {
        originalMessage: err.message,
        originalStack: err.stack,
      });
    }
  }

  // 记录错误日志
  const logData = {
    requestId,
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
      stack: error.stack,
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      body: req.method !== 'GET' ? req.body : undefined,
    },
    timestamp: error.timestamp,
  };

  // 根据错误级别选择日志方法
  if (error.statusCode >= 500) {
    logger.error('服务器错误:', logData);
  } else if (error.statusCode >= 400) {
    logger.warn('客户端错误:', logData);
  } else {
    logger.info('其他错误:', logData);
  }

  // 构建响应
  const response = {
    success: false,
    code: error.code,
    message: error.message,
    timestamp: error.timestamp,
    requestId,
  };

  // 开发环境添加详细信息
  if (process.env.NODE_ENV === 'development') {
    response.details = error.details;
    response.stack = error.stack;
  } else if (error.details && error.isOperational) {
    // ✅ 安全修复: 生产环境过滤掉可能包含内部信息的 details 字段
    // 仅保留不含 originalError/originalMessage/originalStack 的安全详情
    const { originalError, originalMessage, originalStack, ...safeDetails } = (error.details || {});
    if (Object.keys(safeDetails).length > 0) {
      response.details = safeDetails;
    }
  }

  res.status(error.statusCode).json(response);
};

// 404 处理中间件
const notFoundHandler = (req, res, next) => {
  const error = ErrorFactory.notFound(`路径 ${req.originalUrl}`);
  next(error);
};

// 请求ID中间件
const requestIdMiddleware = (req, res, next) => {
  req.requestId = generateRequestId();
  res.setHeader('X-Request-ID', req.requestId);
  next();
};

// 全局未捕获异常处理
const handleUncaughtException = () => {
  process.on('uncaughtException', (error) => {
    logger.error('未捕获的异常:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    // 优雅关闭服务器
    process.exit(1);
  });
};

// 全局未处理的Promise拒绝处理
const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('未处理的Promise拒绝:', {
      reason: reason,
      promise: promise,
      timestamp: new Date().toISOString(),
    });

    // 不立即退出，但记录错误
    // 在生产环境中，可能需要根据具体情况决定是否退出
  });
};

module.exports = {
  UnifiedAppError,
  ERROR_CODES,
  ErrorFactory,
  unifiedErrorHandler,
  notFoundHandler,
  requestIdMiddleware,
  handleUncaughtException,
  handleUnhandledRejection,
};
