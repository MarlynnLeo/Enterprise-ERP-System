/**
 * 应用配置文件
 * @description 仅包含实际被使用的配置项
 */

// 应用基本信息
export const APP_INFO = {
  name: 'MES移动端',
  version: '1.0.0',
  description: '制造执行系统移动端应用',
  author: 'MES Team',
  homepage: 'https://mes.example.com'
}

// API配置 — 被 services/api.js 引用
export const API_CONFIG = {
  // 基础URL - 从环境变量读取，默认使用相对路径 /api 配合反向代理
  baseURL: import.meta.env.VITE_APP_API_BASE_URL || '/api',

  // 请求超时时间（毫秒）
  timeout: 30000
}
