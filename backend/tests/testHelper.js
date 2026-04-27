/**
 * testHelper.js
 * @description 集成测试辅助工具 - 提供登录、请求封装等共用方法
 */

// 必须在加载 app 之前加载环境变量
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const request = require('supertest');

// 缓存登录 token，避免每个测试重复登录
let cachedToken = null;
let appInstance = null;

/**
 * 获取 Express app 实例（延迟加载，避免模块副作用）
 */
function getApp() {
  if (!appInstance) {
    // 设置测试环境变量
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_CRON = 'true'; // 禁用定时任务
    appInstance = require('../src/app');
  }
  return appInstance;
}

/**
 * 获取已认证的管理员 token
 * @returns {Promise<string>} Bearer token
 */
async function getAdminToken() {
  if (cachedToken) return cachedToken;

  const app = getApp();
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: '123456' })
    .expect(200);

  // 兼容不同的响应格式
  cachedToken = res.body.data?.token || res.body.token;
  if (!cachedToken) {
    throw new Error('登录失败，无法获取 token: ' + JSON.stringify(res.body));
  }
  return cachedToken;
}

/**
 * 创建已认证的请求代理
 * @returns {Promise<{get, post, put, patch, delete}>} 封装好认证头的请求方法
 */
async function authRequest() {
  const app = getApp();
  const token = await getAdminToken();
  const agent = request(app);

  // 返回带认证头的请求方法
  const methods = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    methods[method] = (url) =>
      agent[method](url)
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json');
  }
  return methods;
}

/**
 * 清除缓存（在 afterAll 中调用）
 */
function clearCache() {
  cachedToken = null;
}

module.exports = {
  getApp,
  getAdminToken,
  authRequest,
  clearCache,
};
