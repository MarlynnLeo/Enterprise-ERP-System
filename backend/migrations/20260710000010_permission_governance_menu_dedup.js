/**
 * 权限治理：
 * 1. 停用冗余 type=2「查看」按钮菜单（permission 已由页面菜单承载）
 * 2. 清理 role_menus 中指向这些按钮的关联（权限码不丢，页面菜单仍在）
 * 3. 同步清理半勾选垃圾
 */

exports.up = async function up(knex) {
  // 找出：同 permission 下存在非按钮页面，且自身为「查看」按钮
  const redundant = await knex.raw(`
    SELECT b.id
    FROM menus b
    WHERE b.status = 1
      AND b.permission IS NOT NULL
      AND b.permission <> ''
      AND (
        b.type = 2
        OR b.name = '查看'
      )
      AND EXISTS (
        SELECT 1 FROM menus p
        WHERE p.permission = b.permission
          AND p.id <> b.id
          AND p.status = 1
          AND (p.type IS NULL OR p.type <> 2)
          AND (p.name IS NULL OR p.name <> '查看')
      )
  `);

  const rows = redundant[0] || redundant;
  const ids = (Array.isArray(rows) ? rows : []).map((r) => Number(r.id)).filter(Boolean);
  if (!ids.length) {
    return;
  }

  await knex('menus')
    .whereIn('id', ids)
    .update({
      status: 0,
      visible: 0,
      updated_at: knex.fn.now(),
    });

  await knex('role_menus').whereIn('menu_id', ids).del();
};

exports.down = async function down() {
  // 不自动恢复已停用菜单
};
