/**
 * 安全增强: 为 users 表添加 token_version 字段
 * 用于实现 Refresh Token 撤销机制 —— 登出/改密时递增版本号，旧 Token 自动失效
 */

exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('users', 'token_version');
  if (!hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.integer('token_version').notNullable().defaultTo(0)
        .comment('Token版本号，用于撤销刷新令牌');
    });
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('users', 'token_version');
  if (hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('token_version');
    });
  }
};
