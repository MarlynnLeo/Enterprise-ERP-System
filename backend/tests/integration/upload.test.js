/**
 * upload.test.js
 * @description 文件上传模块集成测试
 * 覆盖：文件上传权限验证、类型检查、路径遍历防护
 */

const { authRequest, clearCache, getApp } = require('../testHelper');
const request = require('supertest');

let app;
let api;

beforeAll(async () => {
  app = getApp();
  api = await authRequest();
});

afterAll(() => {
  clearCache();
});

// ==================== 上传端点安全性 ====================
describe('文件上传 - 安全性 /api/upload', () => {
  test('未认证用户不能上传文件', async () => {
    const res = await request(app)
      .post('/api/upload/file')
      .attach('file', Buffer.from('test content'), 'test.txt');

    // 未认证可能返回 401 (auth) 或 403 (CSRF)
    expect([401, 403]).toContain(res.status);
  });

  test('上传空请求应返回错误', async () => {
    const res = await api.post('/api/upload/file');

    // 没有文件应返回 400
    expect([400, 422]).toContain(res.status);
  });
});

// ==================== 删除端点安全性 ====================
describe('文件上传 - 删除安全性 /api/upload/file', () => {
  test('未认证用户不能删除文件', async () => {
    const res = await request(app)
      .delete('/api/upload/file')
      .send({ filename: 'test.txt' });

    // 未认证可能返回 401 (auth) 或 403 (CSRF)
    expect([401, 403]).toContain(res.status);
  });

  test('路径遍历攻击应被拒绝', async () => {
    const res = await api.delete('/api/upload/file')
      .send({ filename: '../../../etc/passwd' });

    expect(res.status).toBe(400);
  });

  test('包含斜杠的文件名应被拒绝', async () => {
    const res = await api.delete('/api/upload/file')
      .send({ filename: 'path/to/file.txt' });

    // 全局路径遍历检测可能先拦截返回 400 或 404
    expect([400, 404]).toContain(res.status);
  });

  test('包含反斜杠的文件名应被拒绝', async () => {
    const res = await api.delete('/api/upload/file')
      .send({ filename: 'path\\to\\file.txt' });

    // 全局路径遍历检测可能先拦截返回 400 或 404
    expect([400, 404]).toContain(res.status);
  });

  test('缺少文件名参数应返回400', async () => {
    const res = await api.delete('/api/upload/file')
      .send({});

    expect(res.status).toBe(400);
  });

  test('不存在的文件应返回404', async () => {
    const res = await api.delete('/api/upload/file')
      .send({ filename: 'nonexistent_file_12345.txt' });

    expect(res.status).toBe(404);
  });
});

// ==================== 静态文件访问控制 ====================
describe('文件上传 - 静态文件访问控制 /uploads', () => {
  test('公开目录应无需认证即可访问', async () => {
    // 公开目录即使文件不存在也应返回 404 而非 401
    const res = await request(app).get('/uploads/avatars/nonexistent.png');

    // 公开目录不需要认证，文件不存在应返回 404
    expect(res.status).not.toBe(401);
  });

  test('非公开目录应需要认证', async () => {
    const res = await request(app).get('/uploads/documents/secret.pdf');

    // 非公开目录未认证应返回 401
    expect(res.status).toBe(401);
  });

  test('路径遍历应被阻止', async () => {
    const res = await request(app).get('/uploads/../.env');

    // 路径遍历应被拒绝
    expect([400, 403, 404]).toContain(res.status);
  });

  test('编码路径遍历应被阻止', async () => {
    const res = await request(app).get('/uploads/%2e%2e%2f.env');

    // 编码路径遍历应被拒绝
    expect([400, 403, 404]).toContain(res.status);
  });
});
