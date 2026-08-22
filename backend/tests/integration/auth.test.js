/**
 * auth.test.js
 * @description 认证模块集成测试
 * 覆盖：登录、Token 验证、权限获取
 */

const request = require('supertest');
const { getApp, authRequest, clearCache } = require('../testHelper');

let app;

beforeAll(async () => {
  app = getApp();
  const { pool } = require('../../src/config/db');
  await pool.execute(
    'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE LOWER(username) = ?',
    [String(process.env.TEST_ADMIN_USERNAME).toLowerCase()]
  );
});

afterAll(() => {
  clearCache();
});

describe('认证模块 /api/auth', () => {
  describe('POST /api/auth/login', () => {
    test('正确的用户名密码应返回 200、用户信息和 HttpOnly Cookie', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: process.env.TEST_ADMIN_USERNAME,
          password: process.env.TEST_ADMIN_PASSWORD,
        });

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

    test('连续输错 5 次后锁定，管理员解除后可继续登录', async () => {
      const username = process.env.TEST_ADMIN_USERNAME;
      // Establish the administrator session before locking this same account;
      // an existing authenticated session is allowed to perform the recovery.
      const adminApi = await authRequest();

      // Avoid inheriting a failure counter from another test while still
      // exercising the public administrator API for the actual unlock step.
      const { pool } = require('../../src/config/db');
      await pool.execute(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE LOWER(username) = ?',
        [String(username).toLowerCase()]
      );

      for (let attempt = 1; attempt <= 4; attempt++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ username, password: 'definitely-wrong-password' });

        expect(res.status).toBe(401);
        // Generic message only — do not leak remaining-attempt counts.
        expect(res.body.message).toBe('用户名或密码错误');
        expect(res.body.message).not.toMatch(/还可尝试/);
      }

      const lockedRes = await request(app)
        .post('/api/auth/login')
        .send({ username, password: 'definitely-wrong-password' });
      expect(lockedRes.status).toBe(423);
      expect(lockedRes.body.errorCode).toBe('ACCOUNT_LOCKED');

      const [[user]] = await pool.execute(
        'SELECT id FROM users WHERE LOWER(username) = ? LIMIT 1',
        [String(username).toLowerCase()]
      );
      const unlockRes = await adminApi.put(`/api/system/users/${user.id}/login/unlock`).send({});
      expect(unlockRes.status).toBe(200);

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username, password: process.env.TEST_ADMIN_PASSWORD });
      expect(loginRes.status).toBe(200);
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

    test('旧客户端以 JSON null 刷新会话时不会被误报为 500', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Content-Type', 'application/json')
        .send('null');

      // The legacy body is accepted as empty. With no refresh cookie, the
      // authentication layer correctly returns 401 instead of a parser 500.
      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe('NO_REFRESH_TOKEN');
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
