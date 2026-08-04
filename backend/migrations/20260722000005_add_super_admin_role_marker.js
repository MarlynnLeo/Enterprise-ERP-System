exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('roles', 'is_super_admin'))) {
    await knex.schema.alterTable('roles', (table) => {
      table.boolean('is_super_admin').notNullable().defaultTo(false).index()
        .comment('是否超级管理员角色，不依赖可变角色编码');
    });
  }

  // 一次性迁移旧角色语义；运行时代码只读取 is_super_admin 标记。
  await knex('roles').where({ code: 'admin' }).update({ is_super_admin: 1 });
};

exports.down = async function down() {
  // 超级管理员标记属于授权主数据，回滚代码时保留。
};
