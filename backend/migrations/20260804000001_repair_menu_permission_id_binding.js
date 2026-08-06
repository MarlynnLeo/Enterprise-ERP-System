/**
 * 功能修复：menus.permission_id 与权限码一致性
 *
 * 问题：
 * 1) 20260801 结算/三单匹配菜单只写了 permission 字符串，未回填 permission_id
 * 2) 部分 type=2 按钮权限码出现双动作后缀（如 contract:view:view）
 *
 * 不做角色菜单重新分配（业务赋权由用户后续自行配置）。
 */

const ACTION_SEGMENTS = new Set([
  'view',
  'create',
  'update',
  'delete',
  'edit',
  'export',
  'import',
  'print',
  'approve',
  'pay',
  'void',
  'confirm',
  'read',
  'write',
]);

function moduleOf(code) {
  const i = String(code).indexOf(':');
  return i > 0 ? code.slice(0, i) : code;
}

/**
 * 折叠重复动作后缀：a:b:view:view → a:b:view；a:b:edit:create → a:b:create
 */
function normalizeDoubleActionCode(code) {
  const raw = String(code || '').trim();
  if (!raw) return raw;
  const parts = raw.split(':').filter(Boolean);
  if (parts.length < 3) return raw;

  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2];
  if (!ACTION_SEGMENTS.has(last) || !ACTION_SEGMENTS.has(prev)) {
    return raw;
  }

  // drop penultimate action segment
  const next = [...parts.slice(0, -2), last].join(':');
  return next === raw ? raw : next;
}

async function ensurePermissionRow(knex, code, name) {
  const existing = await knex('permissions').where({ code }).first();
  if (existing) return existing.id;
  const [id] = await knex('permissions').insert({
    code,
    name: name || code,
    module: moduleOf(code),
    status: 1,
    source: 'repair',
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  return id;
}

exports.up = async function up(knex) {
  const hasMenus = await knex.schema.hasTable('menus');
  const hasPermissions = await knex.schema.hasTable('permissions');
  if (!hasMenus || !hasPermissions) return;
  if (!(await knex.schema.hasColumn('menus', 'permission_id'))) return;

  // ---- 1) normalize double-action permission codes on menus + permissions ----
  const menus = await knex('menus')
    .whereNotNull('permission')
    .andWhere('permission', '<>', '')
    .select('id', 'permission', 'name');

  for (const menu of menus) {
    const normalized = normalizeDoubleActionCode(menu.permission);
    if (normalized === menu.permission) continue;

    const targetId = await ensurePermissionRow(knex, normalized, menu.name || normalized);

    // remap role_permissions from old code if present
    const oldPerm = await knex('permissions').where({ code: menu.permission }).first();
    if (oldPerm && oldPerm.id !== targetId) {
      await knex.raw(
        `INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
         SELECT role_id, ?, NOW() FROM role_permissions WHERE permission_id = ?`,
        [targetId, oldPerm.id]
      );
      await knex('role_permissions').where({ permission_id: oldPerm.id }).del();
      // soft-disable bad code rather than hard delete (may be referenced in logs)
      await knex('permissions').where({ id: oldPerm.id }).update({
        status: 0,
        description: `normalized→${normalized}`,
        updated_at: knex.fn.now(),
      });
    }

    await knex('menus').where({ id: menu.id }).update({
      permission: normalized,
      permission_id: targetId,
      updated_at: knex.fn.now(),
    });
  }

  // ---- 2) full backfill permission_id from permission string ----
  await knex.raw(`
    UPDATE menus m
    INNER JOIN permissions p
      ON p.code COLLATE utf8mb4_unicode_ci = m.permission COLLATE utf8mb4_unicode_ci
     AND p.status = 1
    SET m.permission_id = p.id
    WHERE m.permission IS NOT NULL
      AND m.permission <> ''
      AND (m.permission_id IS NULL OR m.permission_id <> p.id)
  `);

  // ---- 3) ensure any remaining menu codes exist then bind ----
  const stillMissing = await knex('menus')
    .whereNotNull('permission')
    .andWhere('permission', '<>', '')
    .whereNull('permission_id')
    .select('id', 'permission', 'name');

  for (const menu of stillMissing) {
    const pid = await ensurePermissionRow(knex, menu.permission, menu.name || menu.permission);
    await knex('menus').where({ id: menu.id }).update({
      permission_id: pid,
      updated_at: knex.fn.now(),
    });
  }

  // ---- 4) repair role_permissions for menus that now have permission_id
  //         (only insert missing links; do not shrink existing grants)
  if (await knex.schema.hasTable('role_permissions')) {
    await knex.raw(`
      INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
      SELECT DISTINCT rm.role_id, m.permission_id, NOW()
      FROM role_menus rm
      INNER JOIN menus m ON m.id = rm.menu_id
      INNER JOIN permissions p ON p.id = m.permission_id AND p.status = 1
      WHERE m.permission_id IS NOT NULL
    `);
  }
};

exports.down = async function down() {
  // non-destructive repair; no automatic rollback of data fixes
};
