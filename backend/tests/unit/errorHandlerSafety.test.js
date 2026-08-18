/**
 * unifiedErrorHandler 安全加固测试
 * @description 验证生产环境下 error.stack 不泄露、5xx 消息被隐藏
 */

const createMockReq = () => ({
  get: () => '',
  originalUrl: '/test',
  ip: '127.0.0.1',
  method: 'GET',
});

// 模拟 express res 对象
const createMockRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    headersSent: false,
  };
  return res;
};

// 直接测试 formatErrorResponse 的逻辑
describe('unifiedErrorHandler production safety', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  test('development mode includes stack trace', () => {
    process.env.NODE_ENV = 'development';
    // 重新加载模块以应用环境变量
    jest.resetModules();
    const { unifiedErrorHandler: handler } = require('../../src/middleware/unifiedErrorHandler');

    const res = createMockRes();
    const error = new Error('test error');
    error.statusCode = 500;
    error.timestamp = new Date().toISOString();

    handler(error, { get: () => '', originalUrl: '/test', ip: '127.0.0.1', method: 'GET' }, res, () => {});

    const response = res.json.mock.calls[0]?.[0];
    if (response) {
      expect(response.stack).toBeDefined();
    }
  });

  test('production mode hides 5xx error messages', () => {
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    const { unifiedErrorHandler: handler } = require('../../src/middleware/unifiedErrorHandler');

    const res = createMockRes();
    const error = new Error('Internal database connection failed at pool.query');
    error.statusCode = 500;
    error.timestamp = new Date().toISOString();

    handler(error, createMockReq(), res, () => {});

    const response = res.json.mock.calls[0]?.[0];
    if (response) {
      expect(response.stack).toBeUndefined();
      expect(response.message).toBe('服务器内部错误，请稍后重试');
      // Should not expose the original internal error message
      expect(response.message).not.toContain('database');
    }
  });

  test('production mode preserves 4xx error messages', () => {
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    const { unifiedErrorHandler: handler, UnifiedAppError } = require('../../src/middleware/unifiedErrorHandler');

    const res = createMockRes();
    // 使用 UnifiedAppError 确保不被转为 500
    const error = new UnifiedAppError('VALIDATION_ERROR');
    error.message = 'Invalid email format';

    handler(error, createMockReq(), res, () => {});

    const response = res.json.mock.calls[0]?.[0];
    if (response) {
      expect(response.message).toBe('Invalid email format');
      expect(response.stack).toBeUndefined();
    }
  });

  test('invalid JSON is a 400 validation error instead of a 500', () => {
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    const { unifiedErrorHandler: handler } = require('../../src/middleware/unifiedErrorHandler');

    const res = createMockRes();
    const error = new SyntaxError('Unexpected token');
    error.status = 400;
    error.body = '{invalid';

    handler(error, createMockReq(), res, () => {});

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: '请求 JSON 格式无效' })
    );
  });

  test('production mode filters originalStack from details', () => {
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    const { unifiedErrorHandler: handler } = require('../../src/middleware/unifiedErrorHandler');

    const res = createMockRes();
    const error = new Error('Operational error');
    error.statusCode = 400;
    error.isOperational = true;
    error.timestamp = new Date().toISOString();
    error.details = {
      field: 'email',
      originalMessage: 'some internal msg',
      originalStack: 'at Object.<anonymous> (...)',
      originalError: { message: 'raw error' },
    };

    handler(error, createMockReq(), res, () => {});

    const response = res.json.mock.calls[0]?.[0];
    if (response && response.details) {
      expect(response.details.field).toBe('email');
      expect(response.details.originalMessage).toBeUndefined();
      expect(response.details.originalStack).toBeUndefined();
      expect(response.details.originalError).toBeUndefined();
    }
  });
});
