'use strict';

/**
 * 业务数据授权只保留功能/动作权限。
 *
 * roles.data_scope 作为兼容字段继续保留，但所有角色统一固定为 ALL；
 * 旧的部门和库位映射清空，避免后续代码或运维脚本重新读到历史限制。
 */

const ALL_DATA_SCOPE = 1;

exports.up = async function up(knex) {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_DISABLE_ROW_LEVEL_DATA_SCOPES !== 'true'
  ) {
    throw new Error(
      'Refusing to disable row-level data scopes in production without ALLOW_DISABLE_ROW_LEVEL_DATA_SCOPES=true'
    );
  }

  if (await knex.schema.hasColumn('roles', 'data_scope')) {
    const update = { data_scope: ALL_DATA_SCOPE };
    if (await knex.schema.hasColumn('roles', 'updated_at')) {
      update.updated_at = knex.fn.now();
    }
    await knex('roles').update(update);
  }

  for (const tableName of ['role_data_departments', 'role_data_locations']) {
    if (await knex.schema.hasTable(tableName)) {
      await knex(tableName).del();
    }
  }
};

exports.down = async function down() {
  // 这是授权数据修复，历史 SELF/部门/库位限制不会通过回滚重新启用。
};
