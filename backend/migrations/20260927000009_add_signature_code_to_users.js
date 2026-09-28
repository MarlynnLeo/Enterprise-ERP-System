'use strict';

/**
 * 20260927000009_add_signature_code_to_users.js
 * @description 为 users 表增加电子签名代号，绑定由用户管理显式配置。
 */
exports.up = async function up(knex) {
  const hasUsersTable = await knex.schema.hasTable('users');
  if (!hasUsersTable) return;

  const hasColumn = await knex.schema.hasColumn('users', 'signature_code');
  if (!hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table
        .string('signature_code', 20)
        .nullable()
        .defaultTo(null)
        .comment('电子签名代号(如A对应陈挺, O对应王晓敏)');
    });
  }
};

// Preserve explicit user bindings on rollback.
exports.down = async function down() {};

exports.config = { transaction: false };
