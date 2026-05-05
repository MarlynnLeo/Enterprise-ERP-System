/**
 * dingtalkConfig.js
 * @description 钉钉开放平台配置
 * @date 2026-02-02
 */

module.exports = {
  // 企业CorpId
  corpId: process.env.DINGTALK_CORP_ID || '',

  // 应用凭据 (从钉钉开放平台获取)
  // 注意: 如果使用旧版API Token，可以留空AppKey/AppSecret
  appKey: process.env.DINGTALK_APP_KEY || '',
  appSecret: process.env.DINGTALK_APP_SECRET || '',

  // 应用AgentId (可选)
  agentId: process.env.DINGTALK_AGENT_ID || '',

  // 审批模板编码 (从钉钉OA审批URL获取)
  processCode: process.env.DINGTALK_PROCESS_CODE || '',

  // API Token (旧版认证方式)
  apiToken: process.env.DINGTALK_API_TOKEN || '',

  // API基础URL
  apiBaseUrl: 'https://oapi.dingtalk.com',

  // 回调配置
  callback: {
    // 回调URL路径
    path: '/api/dingtalk/callback',
    // 加密用的Token和AES Key (在钉钉开放平台配置)
    token: process.env.DINGTALK_CALLBACK_TOKEN || '',
    aesKey: process.env.DINGTALK_CALLBACK_AES_KEY || '',
  },

  // 默认审批人配置
  defaultApprover: {
    userId: '', // 默认审批人钉钉UserId
    deptId: process.env.DINGTALK_DEFAULT_DEPT_ID
      ? Number.parseInt(process.env.DINGTALK_DEFAULT_DEPT_ID, 10)
      : null, // 默认部门ID
  },
};
