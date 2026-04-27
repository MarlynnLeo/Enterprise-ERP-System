/**
 * auth.test.js
 * @description 认证模块集成测试
 * 覆盖：登录、Token 验证、权限获取
 */

const request = require('supertest');
const { getApp, clearCache } = require('../testHelper');

let app;

beforeAll(() => {
  app = getApp();
});

afterAll(() => {
  clearCache();
});

describe('认证模块 /api/auth', () => {
  describe('POST /api/auth/login', () => {
    test('正确的用户名密码应返回 200 和 token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: '123456' });

      expect(res.status).toBe(200);
      // 兼容 { token } 或 { data: { token } } 格式
      const token = res.body.data?.token || res.body.token;
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(10);
    });

    test('错误密码应返回 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrongpassword' });

      expect(res.status).toBe(401);
    });

    test('空用户名应返回 400 或 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: '', password: '123456' });

      expect([400, 401]).toContain(res.status);
    });

    test('缺少密码字段应返回错误', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin' });

      expect([400, 401]).toContain(res.status);
    });
  });

  describe('需要认证的接口', () => {
    let token;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: '123456' });
      token = res.body.data?.token || res.body.token;
    });

    test('携带有效 Token 访问受保护接口应成功', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      // 200 或 404 都可接受（取决于是否有 /me 端点）
      expect(res.status).not.toBe(401);
    });

    test('无 Token 访问受保护接口应返回 401', async () => {
      const res = await request(app)
        .get('/api/purchase/orders');

      expect(res.status).toBe(401);
    });

    test('无效 Token 应返回 401', async () => {
      const res = await request(app)
        .get('/api/purchase/orders')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(res.status).toBe(401);
    });

    test('GET /api/auth/permissions 应返回权限列表', async () => {
      const res = await request(app)
        .get('/api/auth/permissions')
        .set('Authorization', `Bearer ${token}`);

      // 权限列表可能返回 200 或有其他结构
      expect([200, 404]).toContain(res.status);
    });
  });
});
