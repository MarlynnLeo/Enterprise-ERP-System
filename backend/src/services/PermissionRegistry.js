/**
 * PermissionRegistry — 权限码 SSOT 读写
 *
 * 表：
 *   permissions(code)           权限码主数据
 *   role_permissions            角色↔权限（鉴权 SSOT）
 *   menus.permission / permission_id  导航绑定（展示/菜单树）
 *
 * 上下游约定：
 *   改 role_menus  → 必须 syncRolePermissionsFromMenus
 *   写 menus.permission → 必须 ensurePermission + 回填 permission_id
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
  if (!code || typeof code !== 'string') return null;
  const i = code.indexOf(':');
  return i > 0 ? code.slice(0, i) : code;
}

/**
 * 折叠错误的双动作后缀：module:resource:view:view → module:resource:view
 * 以及 resource 本身已是动作时的重复：contract:view:view → contract:view
 */
function normalizePermissionCode(code) {
  const raw = String(code || '').trim();
  if (!raw) return raw;
  const parts = raw.split(':').filter(Boolean);
  if (parts.length < 3) return raw;
  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2];
  if (ACTION_SEGMENTS.has(last) && ACTION_SEGMENTS.has(prev)) {
    return [...parts.slice(0, -2), last].join(':');
  }
  return raw;
}

/**
 * 确保权限码存在，返回 permission.id
 * @param {import('mysql2/promise').PoolConnection|import('mysql2/promise').Pool} conn
 * @param {string} code
 * @param {{ name?: string, source?: string, description?: string }} meta
 */
async function ensurePermission(conn, code, meta = {}) {
  const normalized = normalizePermissionCode(String(code || '').trim());
  if (!normalized) return null;

  const [existing] = await conn.execute(
    'SELECT id FROM permissions WHERE code = ? LIMIT 1',
    [normalized]
  );
  if (existing.length) return Number(existing[0].id);

  const name = meta.name || normalized;
  const source = meta.source || 'system';
  const description = meta.description || null;
  const moduleName = moduleOf(normalized);

  try {
    const [result] = await conn.execute(
      `INSERT INTO permissions (code, name, module, description, status, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, NOW(), NOW())`,
      [normalized, name, moduleName, description, source]
    );
    return Number(result.insertId);
  } catch (error) {
    // 并发插入唯一冲突时回查
    if (error.code === 'ER_DUP_ENTRY') {
      const [again] = await conn.execute(
        'SELECT id FROM permissions WHERE code = ? LIMIT 1',
        [normalized]
      );
      if (again.length) return Number(again[0].id);
    }
    throw error;
  }
}

/**
 * 批量 ensure
 * @returns {Promise<Map<string, number>>} code → id
 */
async function ensurePermissions(conn, codes = [], meta = {}) {
  const map = new Map();
  const unique = [...new Set((codes || []).map((c) => String(c || '').trim()).filter(Boolean))];
  for (const code of unique) {
    const id = await ensurePermission(conn, code, meta);
    if (id) map.set(code, id);
  }
  return map;
}

/**
 * 用菜单上的 permission 码重写角色的 role_permissions
 * @param {*} conn
 * @param {number} roleId
 * @param {number[]} menuIds
 */
async function syncRolePermissionsFromMenus(conn, roleId, menuIds = []) {
  const rid = Number(roleId);
  if (!Number.isInteger(rid) || rid <= 0) {
    throw new Error('invalid roleId');
  }

  await conn.execute('DELETE FROM role_permissions WHERE role_id = ?', [rid]);

  const ids = [
    ...new Set((Array.isArray(menuIds) ? menuIds : []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)),
  ];
  if (!ids.length) return { inserted: 0 };

  const placeholders = ids.map(() => '?').join(',');
  const [menus] = await conn.execute(
    `SELECT id, permission, name FROM menus
      WHERE id IN (${placeholders})
        AND status = 1
        AND permission IS NOT NULL AND permission <> ''`,
    ids
  );

  const codes = [...new Set(menus.map((m) => m.permission).filter(Boolean))];
  if (!codes.length) return { inserted: 0 };

  const codeToId = await ensurePermissions(conn, codes, { source: 'menu' });

  // 回填 menus.permission_id
  for (const m of menus) {
    const pid = codeToId.get(m.permission);
    if (pid) {
      await conn.execute(
        'UPDATE menus SET permission_id = ? WHERE id = ? AND (permission_id IS NULL OR permission_id <> ?)',
        [pid, m.id, pid]
      );
    }
  }

  const permissionIds = [...new Set([...codeToId.values()])];
  if (!permissionIds.length) return { inserted: 0 };

  const values = permissionIds.map(() => '(?, ?, NOW())').join(',');
  const params = [];
  for (const pid of permissionIds) {
    params.push(rid, pid);
  }
  const [ins] = await conn.execute(
    `INSERT INTO role_permissions (role_id, permission_id, created_at) VALUES ${values}`,
    params
  );

  return { inserted: ins.affectedRows || permissionIds.length };
}

/**
 * 菜单写入后：保证 permissions 行 + permission_id
 */
async function bindMenuPermission(conn, menuId, permissionCode, menuName) {
  if (!permissionCode) {
    await conn.execute('UPDATE menus SET permission_id = NULL WHERE id = ?', [menuId]);
    return null;
  }
  const normalized = normalizePermissionCode(permissionCode);
  const pid = await ensurePermission(conn, normalized, {
    name: menuName || normalized,
    source: 'menu',
  });
  if (pid) {
    // 同步纠正 permission 字符串与 permission_id，避免只绑 id 字符串仍是脏码
    await conn.execute(
      'UPDATE menus SET permission = ?, permission_id = ? WHERE id = ?',
      [normalized, pid, menuId]
    );
  }
  return pid;
}

/**
 * 角色继承新菜单时，把菜单 permission 并入 role_permissions
 */
async function grantMenuPermissionToRoles(conn, menuId, roleIds = []) {
  const [[menu]] = await conn.execute(
    'SELECT id, permission, name, status FROM menus WHERE id = ? LIMIT 1',
    [menuId]
  );
  if (!menu?.permission || Number(menu.status) !== 1) return;

  const normalized = normalizePermissionCode(menu.permission);
  const pid = await ensurePermission(conn, normalized, {
    name: menu.name || normalized,
    source: 'menu',
  });
  if (!pid) return;

  await conn.execute('UPDATE menus SET permission = ?, permission_id = ? WHERE id = ?', [
    normalized,
    pid,
    menuId,
  ]);

  for (const roleId of roleIds) {
    await conn.execute(
      `INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
       VALUES (?, ?, NOW())`,
      [Number(roleId), pid]
    );
  }
}

/**
 * 全量回填 menus.permission_id（运维/启动修复用）
 */
async function backfillMenuPermissionIds(conn) {
  // ensure missing permission rows
  const [missing] = await conn.execute(
    `SELECT DISTINCT m.permission AS code, MIN(m.name) AS name
       FROM menus m
       LEFT JOIN permissions p
         ON p.code COLLATE utf8mb4_unicode_ci = m.permission COLLATE utf8mb4_unicode_ci
      WHERE m.permission IS NOT NULL AND m.permission <> ''
        AND p.id IS NULL
      GROUP BY m.permission`
  );
  for (const row of missing) {
    await ensurePermission(conn, row.code, { name: row.name || row.code, source: 'backfill' });
  }

  const [result] = await conn.execute(
    `UPDATE menus m
     INNER JOIN permissions p
       ON p.code COLLATE utf8mb4_unicode_ci = m.permission COLLATE utf8mb4_unicode_ci
      AND p.status = 1
     SET m.permission_id = p.id
     WHERE m.permission IS NOT NULL
       AND m.permission <> ''
       AND (m.permission_id IS NULL OR m.permission_id <> p.id)`
  );
  return { updated: result.affectedRows || 0, ensured: missing.length };
}

module.exports = {
  moduleOf,
  normalizePermissionCode,
  ensurePermission,
  ensurePermissions,
  syncRolePermissionsFromMenus,
  bindMenuPermission,
  grantMenuPermissionToRoles,
  backfillMenuPermissionIds,
};
