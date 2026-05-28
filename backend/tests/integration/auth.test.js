/**
 * auth.test.js
 * @description 认证模块集成测试
 * 覆盖：登录、Token 验证、权限获取
 */

const request = require('supertest');
const { getApp, authRequest, clearCache } = require('../testHelper');

let app;

beforeAll(() => {
  app = getApp();
});

afterAll(() => {
  clearCache();
});

describe('认证模块 /api/auth', () => {
  describe('POST /api/auth/login', () => {
    test('正确的用户名密码应返回 200、用户信息和 HttpOnly Cookie', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: '123456' });

      expect(res.status).toBe(200);
      expect(res.body.data?.user || res.body.user).toBeTruthy();
      expect(res.body.data?.token || res.body.token).toBeFalsy();
      expect(res.body.data?.accessToken || res.body.accessToken).toBeFalsy();
      const cookies = res.headers['set-cookie'] || [];
      expect(cookies.some((cookie) => cookie.includes('accessToken=') && cookie.includes('HttpOnly'))).toBe(true);
      expect(cookies.some((cookie) => cookie.includes('refreshToken=') && cookie.includes('HttpOnly'))).toBe(true);
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
    let api;

    beforeAll(async () => {
      api = await authRequest();
    });

    test('携带有效 Cookie 会话访问受保护接口应成功', async () => {
      const res = await api.get('/api/auth/profile');

      expect(res.status).toBe(200);
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
      const res = await api.get('/api/auth/permissions');

      // 权限列表可能返回 200 或有其他结构
      expect(res.status).toBe(200);
    });
  });
});
