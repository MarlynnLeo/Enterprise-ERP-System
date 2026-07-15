/**
 * knexfile.js
 * @description Knex 数据库迁移配置文件
 * @date 2026-03-12
 *
 * 使用方式:
 *   npx knex migrate:latest        # 执行所有待执行的迁移
 *   npx knex migrate:rollback      # 回滚最后一批迁移
 *   npx knex migrate:status        # 查看迁移状态
 *   npx knex seed:run              # 执行种子数据
 */

require('dotenv').config();

function mysqlConfig(pool) {
  return {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      charset: 'utf8mb4',
    },
    pool,
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './seeds',
    },
  };
}

module.exports = {
  // 开发环境配置
  development: mysqlConfig({
    min: 0,
    max: 5,
  }),

  // 测试环境配置（CI 与本地集成测试使用）
  test: mysqlConfig({
    min: 0,
    max: 5,
  }),

  // 生产环境配置
  production: mysqlConfig({
    min: 2,
    max: 10,
  }),
};
