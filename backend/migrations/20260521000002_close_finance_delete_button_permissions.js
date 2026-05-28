async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

function utf8Hex(hex) {
  return `CONVERT(UNHEX('${hex}') USING utf8mb4)`;
}

const deleteButtons = [
  {
    parentPath: '/finance/gl/accounts',
    permission: 'finance:accounts:delete',
    sortOrder: 2,
  },
  {
    parentPath: '/finance/gl/entries',
    permission: 'finance:entries:delete',
    sortOrder: 3,
  },
  {
    parentPath: '/finance/ar/invoices',
    permission: 'finance:ar:delete',
    sortOrder: 4,
  },
  {
    parentPath: '/finance/ap/invoices',
    permission: 'finance:ap:delete',
    sortOrder: 4,
  },
];

exports.up = async function up(knex) {
  if (!(await hasTable(knex, 'menus')) || !(await hasTable(knex, 'roles')) || !(await hasTable(knex, 'role_menus'))) {
    return;
  }

  await knex.transaction(async (trx) => {
    for (const button of deleteButtons) {
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
        [button.permission, button.sortOrder, button.parentPath, button.permission]
      );
    }

    await trx.raw(
      `
        INSERT INTO role_menus (role_id, menu_id, is_half_checked)
        SELECT r.id, m.id, 0
        FROM roles r
        JOIN menus m ON m.permission IN (${deleteButtons.map(() => '?').join(',')})
        WHERE (r.code = 'admin' OR r.name IN (${utf8Hex('E7AEA1E79086E59198')}, ${utf8Hex('E8B685E7BAA7E7AEA1E79086E59198')}, 'admin'))
          AND NOT EXISTS (
            SELECT 1 FROM role_menus rm WHERE rm.role_id = r.id AND rm.menu_id = m.id
          )
      `,
      deleteButtons.map((button) => button.permission)
    );
  });
};

exports.down = async function down() {
  // Permission closure migration is intentionally not rolled back.
};
