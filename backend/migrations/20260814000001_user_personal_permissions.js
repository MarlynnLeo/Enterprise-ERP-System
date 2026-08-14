/**
 * 个人权限（对照 NG fg_userrgts）：
 *   user_menus        — 用户额外可见菜单
 *   user_permissions  — 用户额外鉴权码（由菜单同步）
 *
 * 生效权限 = 权限分组(role_*) ∪ 个人权限(user_*)
 */

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('user_menus'))) {
    await knex.raw(`
      CREATE TABLE user_menus (
        id INT NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        menu_id INT NOT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_user_menus (user_id, menu_id),
        KEY idx_user_menus_menu_id (menu_id),
        CONSTRAINT fk_user_menus_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_user_menus_menu_id FOREIGN KEY (menu_id) REFERENCES menus (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  if (!(await knex.schema.hasTable('user_permissions'))) {
    await knex.raw(`
      CREATE TABLE user_permissions (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        permission_id INT UNSIGNED NOT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_user_permissions (user_id, permission_id),
        KEY idx_user_permissions_permission_id (permission_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('user_permissions')) {
    await knex.schema.dropTable('user_permissions');
  }
  if (await knex.schema.hasTable('user_menus')) {
    await knex.schema.dropTable('user_menus');
  }
};
