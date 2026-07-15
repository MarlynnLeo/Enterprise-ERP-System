/** Ensure every menu granted to a role also grants its runtime permission code. */

exports.up = async function up(knex) {
  await knex.raw(`
    INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
    SELECT DISTINCT rm.role_id, m.permission_id, NOW()
    FROM role_menus rm
    JOIN menus m ON m.id = rm.menu_id
    JOIN permissions p ON p.id = m.permission_id AND p.status = 1
    WHERE m.permission_id IS NOT NULL
  `);
};

exports.down = async function down() {
  // Preserve runtime permission grants derived from existing role menus.
};
