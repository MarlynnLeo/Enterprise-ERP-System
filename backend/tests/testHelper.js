/**
 * testHelper.js
 * @description 集成测试辅助工具 - 提供登录、请求封装等共用方法
 */

// 必须在加载 app 之前加载环境变量
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const request = require('supertest');

// Cache an authenticated cookie agent so tests follow the production auth mode.
let cachedAgent = null;
let cachedCsrfToken = null;
let appInstance = null;

/**
 * 获取 Express app 实例（延迟加载，避免模块副作用）
 */
function getApp() {
  if (!appInstance) {
    // 设置测试环境变量
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_CRON = 'true'; // 禁用定时任务
    process.env.ENABLE_RATE_LIMIT = 'false'; // 避免限流器 MemoryStore 在测试中创建后台定时器
    appInstance = require('../src/app');
  }
  return appInstance;
}

/**
 * 获取已认证的管理员请求代理
 * @returns {Promise<import('supertest').SuperAgentTest>}
 */
async function getAdminAgent() {
  if (cachedAgent) return cachedAgent;

  const app = getApp();
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/login')
    .send({ username: process.env.TEST_ADMIN_USERNAME || 'admin', password: process.env.TEST_ADMIN_PASSWORD || '123456' })
    .expect(200);

  if (!res.body.data?.user && !res.body.user) {
    throw new Error('登录失败，无法获取用户信息: ' + JSON.stringify(res.body));
  }

  cachedAgent = agent;
  return cachedAgent;
}

async function getCsrfToken(agent) {
  if (cachedCsrfToken) return cachedCsrfToken;

  const res = await agent.get('/api/csrf-token').expect(200);
  cachedCsrfToken = res.body.csrfToken || res.body.token || res.body.data?.csrfToken;
  if (!cachedCsrfToken) {
    throw new Error('无法获取 CSRF token: ' + JSON.stringify(res.body));
  }
  return cachedCsrfToken;
}

/**
 * 创建已认证的请求代理
 * @returns {Promise<{get, post, put, patch, delete}>} 封装好认证头的请求方法
 */
async function authRequest() {
  const agent = await getAdminAgent();
  const csrfToken = await getCsrfToken(agent);

  // 返回带 Cookie 会话和 CSRF 头的请求方法
  const methods = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    methods[method] = (url) => {
      const req = agent[method](url).set('Content-Type', 'application/json');
      if (['post', 'put', 'patch', 'delete'].includes(method)) {
        req.set('X-CSRF-Token', csrfToken);
      }
      return req;
    };
  }
  return methods;
}

/**
 * 清除缓存（在 afterAll 中调用）
 */
function clearCache() {
  cachedAgent = null;
  cachedCsrfToken = null;
}

module.exports = {
  getApp,
  getAdminAgent,
  authRequest,
  clearCache,
};
