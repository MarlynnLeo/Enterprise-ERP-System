/**
 * 权限码 SSOT：
 *   permissions          — 权限码主数据
 *   role_permissions     — 角色鉴权图（PermissionService 读取源）
 *   menus.permission_id  — 菜单绑定权限码
 *
 * 回填：
 *   1) 从 menus.permission 种子
 *   2) 扫描路由 requirePermission 补全未挂菜单的码
 *   3) 从 role_menus 推导 role_permissions
 */

const fs = require('fs');
const path = require('path');

function collectRoutePermissionCodes(srcRoot) {
  const codes = new Set();
  const reRequire = /requirePermission\s*\(\s*(['"`])([^'"`]+)\1/g;
  const reArrayItem = /(['"`])([a-z][a-z0-9_]*:[a-z0-9_.:-]+)\1/gi;

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === 'coverage') continue;
        walk(full);
      } else if (/\.js$/.test(name)) {
        const text = fs.readFileSync(full, 'utf8');
        if (!text.includes('requirePermission')) continue;
        let m;
        reRequire.lastIndex = 0;
        while ((m = reRequire.exec(text))) {
          codes.add(m[2]);
        }
        // 数组形式 requirePermission(['a','b'])
        const arrayBlocks = text.match(/requirePermission\s*\(\s*\[[^\]]+\]/g) || [];
        for (const block of arrayBlocks) {
          let am;
          reArrayItem.lastIndex = 0;
          while ((am = reArrayItem.exec(block))) {
            if (am[2].includes(':')) codes.add(am[2]);
          }
        }
      }
    }
  }

  walk(path.join(srcRoot, 'routes'));
  walk(path.join(srcRoot, 'src', 'routes'));
  return [...codes];
}

function moduleOf(code) {
  const i = String(code).indexOf(':');
  return i > 0 ? code.slice(0, i) : code;
}

exports.up = async function up(knex) {
  // 1. permissions（charset/collation 与 menus 对齐，避免 join 冲突）
  const hasPermissions = await knex.schema.hasTable('permissions');
  if (!hasPermissions) {
    await knex.raw(`
      CREATE TABLE permissions (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        code VARCHAR(120) NOT NULL,
        name VARCHAR(200) NULL,
        module VARCHAR(60) NULL,
        description VARCHAR(500) NULL,
        status TINYINT NOT NULL DEFAULT 1,
        source VARCHAR(30) NOT NULL DEFAULT 'system',
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_permissions_code (code),
        KEY idx_permissions_module (module),
        KEY idx_permissions_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  // 2. role_permissions
  const hasRolePerms = await knex.schema.hasTable('role_permissions');
  if (!hasRolePerms) {
    await knex.schema.createTable('role_permissions', (t) => {
      t.increments('id').primary();
      t.integer('role_id').notNullable();
      t.integer('permission_id').unsigned().notNullable();
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.unique(['role_id', 'permission_id']);
      t.index(['permission_id']);
      t.foreign('role_id').references('id').inTable('roles').onDelete('CASCADE');
      t.foreign('permission_id').references('id').inTable('permissions').onDelete('CASCADE');
    });
  }

  // 3. menus.permission_id
  if (await knex.schema.hasTable('menus')) {
    const hasCol = await knex.schema.hasColumn('menus', 'permission_id');
    if (!hasCol) {
      await knex.schema.alterTable('menus', (t) => {
        t.integer('permission_id').unsigned().nullable().after('permission');
        t.index(['permission_id']);
      });
    }
  }

  // 4. 种子：menus.permission
  const menuPerms = await knex('menus')
    .whereNotNull('permission')
    .andWhere('permission', '<>', '')
    .distinct('permission')
    .select('permission');

  const now = knex.fn.now();
  for (const row of menuPerms) {
    const code = String(row.permission).trim();
    if (!code) continue;
    const exists = await knex('permissions').where({ code }).first();
    if (!exists) {
      await knex('permissions').insert({
        code,
        name: code,
        module: moduleOf(code),
        status: 1,
        source: 'menu',
        created_at: now,
        updated_at: now,
      });
    }
  }

  // 5. 路由扫描补全
  const backendRoot = path.join(__dirname, '..');
  const routeCodes = collectRoutePermissionCodes(backendRoot);
  for (const code of routeCodes) {
    const exists = await knex('permissions').where({ code }).first();
    if (!exists) {
      await knex('permissions').insert({
        code,
        name: code,
        module: moduleOf(code),
        status: 1,
        source: 'route',
        created_at: now,
        updated_at: now,
      });
    }
  }

  // 6. 回填 menus.permission_id（显式 COLLATE 避免库表排序规则混用）
  await knex.raw(`
    UPDATE menus m
    INNER JOIN permissions p
      ON p.code COLLATE utf8mb4_unicode_ci = m.permission COLLATE utf8mb4_unicode_ci
    SET m.permission_id = p.id
    WHERE m.permission IS NOT NULL AND m.permission <> ''
  `);

  // 7. 从 role_menus 回填 role_permissions
  await knex.raw(`
    INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
    SELECT DISTINCT rm.role_id, p.id, NOW()
    FROM role_menus rm
    INNER JOIN menus m ON m.id = rm.menu_id
    INNER JOIN permissions p
      ON p.code COLLATE utf8mb4_unicode_ci = m.permission COLLATE utf8mb4_unicode_ci
    WHERE m.permission IS NOT NULL AND m.permission <> ''
      AND (m.status = 1 OR m.status IS NULL)
  `);
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('menus') && (await knex.schema.hasColumn('menus', 'permission_id'))) {
    await knex.schema.alterTable('menus', (t) => {
      t.dropColumn('permission_id');
    });
  }
  if (await knex.schema.hasTable('role_permissions')) {
    await knex.schema.dropTable('role_permissions');
  }
  if (await knex.schema.hasTable('permissions')) {
    await knex.schema.dropTable('permissions');
  }
};
