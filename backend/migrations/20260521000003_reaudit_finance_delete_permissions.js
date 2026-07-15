async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

function utf8Hex(hex) {
  return `CONVERT(UNHEX('${hex}') USING utf8mb4)`;
}

const REAL_DELETE_PERMISSION = {
  parentPath: '/finance/gl/entries',
  permission: 'finance:entries:delete',
  sortOrder: 3,
};

const UNUSED_DELETE_PERMISSIONS = [
  'finance:accounts:delete',
  'finance:ar:delete',
  'finance:ap:delete',
];

exports.up = async function up(knex) {
  if (
    !(await hasTable(knex, 'menus')) ||
    !(await hasTable(knex, 'roles')) ||
    !(await hasTable(knex, 'role_menus'))
  ) {
    return;
  }

  await knex.transaction(async (trx) => {
    await trx('role_menus')
      .whereIn('menu_id', trx('menus').select('id').whereIn('permission', UNUSED_DELETE_PERMISSIONS))
      .del();

    await trx('menus').whereIn('permission', UNUSED_DELETE_PERMISSIONS).del();

    await trx.raw(
      `
        INSERT INTO menus
          (parent_id, name, path, component, icon, permission, type, visible, status, sort_order, created_at, updated_at)
        SELECT parent.id, ${utf8Hex('E588A0E999A4')}, NULL, NULL, NULL, ?, 2, 1, 1, ?, NOW(), NOW()
        FROM menus parent
        WHERE parent.path = ?
          AND NOT EXISTS (
            SELECT 1 FROM menus existing WHERE existing.permission = ?
          )
        LIMIT 1
      `,
      [
        REAL_DELETE_PERMISSION.permission,
        REAL_DELETE_PERMISSION.sortOrder,
        REAL_DELETE_PERMISSION.parentPath,
        REAL_DELETE_PERMISSION.permission,
      ]
    );

    await trx.raw(
      `
        INSERT INTO role_menus (role_id, menu_id, is_half_checked)
        SELECT r.id, m.id, 0
        FROM roles r
        JOIN menus m ON m.permission = ?
        WHERE (r.code = 'admin' OR HEX(r.name) IN ('E7AEA1E79086E59198', 'E8B685E7BAA7E7AEA1E79086E59198', '61646D696E'))
          AND NOT EXISTS (
            SELECT 1 FROM role_menus rm WHERE rm.role_id = r.id AND rm.menu_id = m.id
          )
      `,
      [REAL_DELETE_PERMISSION.permission]
    );
  });
};

exports.down = async function down() {
  // Audit cleanup is intentionally not rolled back.
};
