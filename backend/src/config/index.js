/**
 * 系统配置文件
 */

const { getBasicConfig } = require('./database-config');
const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  // API 相关配置
  api: {
    baseUrl: process.env.API_BASE_URL || '',
    protocol: process.env.API_PROTOCOL || 'http',
    host: process.env.API_HOST || (isProduction ? '' : 'localhost'),
    port: process.env.PORT || 8080,
  },

  // 数据库配置 - 使用统一配置
  database: getBasicConfig(),

  // 系统默认配置
  system: {
    defaultPageSize: 10,
    maxPageSize: 100,
  },
};
