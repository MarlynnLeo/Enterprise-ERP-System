/**
 * 统一的数据库配置管理
 * 所有数据库连接都应该使用这个配置文件
 */

require('dotenv').config();
const logger = require('../utils/logger');

// 验证必需的环境变量
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  throw new Error(`缺少必需的数据库环境变量: ${missingVars.join(', ')}。请检查.env文件配置。`);
}

// 数据库连接配置 - 移除所有硬编码凭据
const DATABASE_CONFIG = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};


// MySQL2 连接池配置
const POOL_CONFIG = {
  ...DATABASE_CONFIG,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 50, // MySQL max_connections=151，两池合计100留余量
  queueLimit: 0,

  // 连接保活防断联配置
  connectTimeout: 20000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000, // 10秒后开始 TCP 保活探测

  maxIdle: parseInt(process.env.DB_MAX_IDLE) || 10, // 不囤积空闲连接
  idleTimeout: 30000, // 30秒无使用即释放

  namedPlaceholders: true,
  multipleStatements: false,
  trace: false,
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: false, // 禁用大整数转字符串，COUNT(*) 等将以 Number 返回
  /**
   * [B-4] 设计约束: decimalNumbers = true 将 MySQL DECIMAL 转为 JS Number (IEEE 754 双精度浮点)
   * - 当前策略: Model 层使用 Math.round(x * 100) 整数化运算消除精度误差
   * - 安全范围: 金额 < Number.MAX_SAFE_INTEGER / 100 ≈ 900万亿（当前业务规模远低于此）
   * - 升级路径: 若金额超过该阈值，需改为 decimalNumbers: false + decimal.js 库
   */
  decimalNumbers: true, // 启用将 MySQL 的 DECIMAL/NUMERIC 转为 JS 浮点数，解决财务金额前端强转困境
  charset: 'utf8mb4',

  typeCast: function (field, next) {
    if (field.type === 'TINY' && field.length === 1) {
      return field.string() === '1'; // 1 = true, 0 = false
    }
    return next();
  },
};

// Sequelize 配置 - 只负责标准的 ORM 联接
const SEQUELIZE_CONFIG = {
  database: DATABASE_CONFIG.database,
  username: DATABASE_CONFIG.user,
  password: DATABASE_CONFIG.password,
  host: DATABASE_CONFIG.host,
  port: DATABASE_CONFIG.port,
  dialect: 'mysql',
  logging: process.env.ENABLE_SQL_LOG === 'true' ? (sql) => logger.debug('SQL query', { sql }) : false,

  // 连接池配置
  pool: {
    max: parseInt(process.env.SEQUELIZE_POOL_MAX) || 50, // 与 mysql2 合计 100，不超 MySQL 151 上限
    min: 0,
    acquire: 30000,
    idle: 30000,    // 30秒空闲即释放
    evict: 10000,   // 10秒扫描一次死连接
    handleDisconnects: true,
  },

  // 原生网络重连配置
  retry: {
    max: parseInt(process.env.SEQUELIZE_RETRY_MAX) || 3,
    match: [
      /ETIMEDOUT/,
      /EHOSTUNREACH/,
      /ECONNRESET/,
      /ECONNREFUSED/,
      /ENOTFOUND/,
      /EPIPE/,
      /PROTOCOL_CONNECTION_LOST/,
      /SequelizeConnectionError/,
      /SequelizeConnectionRefusedError/,
      /SequelizeHostNotFoundError/,
      /SequelizeHostNotReachableError/,
      /SequelizeInvalidConnectionError/,
      /SequelizeConnectionTimedOutError/,
    ],
  },

  define: {
    timestamps: true,
    underscored: true,
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
  },

  dialectOptions: {
    decimalNumbers: true,
    connectTimeout: 20000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  },

  benchmark: false,
  isolationLevel: 'READ_COMMITTED',
  timezone: '+08:00',
};

// ==========================================
// 连接池安全保护配置
// 防止因业务代码遗漏 release() 导致连接泄漏、连接池枯竭
// ==========================================
const POOL_SAFETY_CONFIG = {
  /**
   * 单个连接最大持有时间（毫秒）
   * 超过此时间后连接将被强制回收并记录告警日志
   * 注意：对于确实需要长时间运行的大事务，应在业务层显式延长
   */
  maxConnectionHoldTime: parseInt(process.env.DB_MAX_HOLD_TIME) || 30000,

  /**
   * 获取连接超时时间（毫秒）
   * 当连接池耗尽时，等待此时间后快速返回错误而非无限阻塞
   */
  acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 10000,
};

module.exports = {
  DATABASE_CONFIG,
  POOL_CONFIG,
  SEQUELIZE_CONFIG,
  POOL_SAFETY_CONFIG,
  getBasicConfig: () => DATABASE_CONFIG,
  getPoolConfig: () => POOL_CONFIG,
  getSequelizeConfig: () => SEQUELIZE_CONFIG,
  getPoolSafetyConfig: () => POOL_SAFETY_CONFIG,

  // 便捷方法：获取连接字符串（用于脚本）
  getConnectionString: () => {
    return `mysql://${DATABASE_CONFIG.user}:${DATABASE_CONFIG.password}@${DATABASE_CONFIG.host}:${DATABASE_CONFIG.port}/${DATABASE_CONFIG.database}`;
  },

  // 便捷方法：创建单个连接配置（用于脚本）
  getConnectionConfig: () => {
    return {
      host: DATABASE_CONFIG.host,
      port: DATABASE_CONFIG.port,
      user: DATABASE_CONFIG.user,
      password: DATABASE_CONFIG.password,
      database: DATABASE_CONFIG.database,
    };
  },
};
