/**
 * Default system seed data.
 * @description Creates the initial admin role/user, core menu tree, and default cost settings.
 */

const CORE_ROLES = [
  { id: 1, name: '管理员', code: 'admin', description: '系统管理员，拥有全部权限' },
  { id: 2, name: '普通用户', code: 'user', description: '普通用户角色' },
  { id: 3, name: '财务管理员', code: 'finance_manager', description: '财务模块管理角色' },
  { id: 4, name: '仓库管理员', code: 'inventory_manager', description: '仓库和库存管理角色' },
  { id: 5, name: '采购管理员', code: 'purchase_manager', description: '采购模块管理角色' },
  { id: 6, name: '销售管理员', code: 'sales_manager', description: '销售模块管理角色' },
  { id: 7, name: '生产管理员', code: 'production_manager', description: '生产模块管理角色' },
  { id: 8, name: '质量管理员', code: 'quality_manager', description: '质量模块管理角色' },
  { id: 9, name: '人事管理员', code: 'hr_manager', description: '人力资源模块管理角色' },
];

const { ensureCoreMenus } = require('../src/bootstrap/menus');

const DEFAULT_APPROVAL_TEMPLATES = [
  ['purchase_order', 'DEFAULT_PURCHASE_ORDER_APPROVAL', 'Purchase order approval'],
  ['purchase_requisition', 'DEFAULT_PURCHASE_REQUISITION_APPROVAL', 'Purchase requisition approval'],
  ['contract', 'DEFAULT_CONTRACT_APPROVAL', 'Contract approval'],
  ['ecn', 'DEFAULT_ECN_APPROVAL', 'Engineering change approval'],
  ['hr_leave', 'DEFAULT_HR_LEAVE_APPROVAL', 'Leave request approval'],
  ['hr_overtime', 'DEFAULT_HR_OVERTIME_APPROVAL', 'Overtime request approval'],
];

async function insertWithPreferredId(knex, tableName, record) {
  const payload = {
    ...record,
    status: record.status ?? 1,
    created_at: knex.fn.now(),
  };

  if (payload.id) {
    const idTaken = await knex(tableName).where({ id: payload.id }).first();
    if (idTaken) {
      delete payload.id;
    }
  }

  const [id] = await knex(tableName).insert(payload);
  return payload.id || id;
}

async function ensureCoreRoles(knex) {
  let created = 0;

  for (const role of CORE_ROLES) {
    const existing = await knex('roles').where({ code: role.code }).first();
    if (!existing) {
      await insertWithPreferredId(knex, 'roles', role);
      created += 1;
    }
  }

  if (created > 0) {
    console.log(`[Seed] Core roles initialized: ${created}`);
  }
}

async function ensureAdminUser(knex) {
  const bcrypt = require('bcryptjs');
  const testPassword = process.env.NODE_ENV === 'test'
    ? process.env.TEST_ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD || '123456'
    : null;

  let adminUser = await knex('users').where({ username: 'admin' }).first();
  if (!adminUser) {
    const passwordHash = process.env.DEFAULT_ADMIN_PASSWORD_HASH;
    const plainPassword = process.env.DEFAULT_ADMIN_PASSWORD;
    if (!passwordHash && !plainPassword && process.env.NODE_ENV === 'production') {
      throw new Error('DEFAULT_ADMIN_PASSWORD or DEFAULT_ADMIN_PASSWORD_HASH is required for production seeding');
    }

    const generatedPassword = !passwordHash && !plainPassword && !testPassword
      ? `Dev-${require('crypto').randomUUID()}`
      : null;
    const bcryptHash = passwordHash || await bcrypt.hash(testPassword || plainPassword || generatedPassword, 10);

    const [adminId] = await knex('users').insert({
      username: 'admin',
      password: bcryptHash,
      real_name: '系统管理员',
      email: 'admin@erp.local',
      role: 'admin',
      status: 1,
      created_at: knex.fn.now(),
    });
    adminUser = { id: adminId };
    console.log('[Seed] Default admin user created. Configure initial password with DEFAULT_ADMIN_PASSWORD or DEFAULT_ADMIN_PASSWORD_HASH.');
    if (generatedPassword) {
      console.log(`[Seed] Generated one-time development admin password: ${generatedPassword}`);
    }
  } else if (testPassword) {
    await knex('users')
      .where({ id: adminUser.id })
      .update({ password: await bcrypt.hash(testPassword, 10), updated_at: knex.fn.now() });
  }

  const adminRole = await knex('roles').where({ code: 'admin' }).first();
  if (adminRole) {
    const exists = await knex('user_roles')
      .where({ user_id: adminUser.id, role_id: adminRole.id })
      .first();
    if (!exists) {
      await knex('user_roles').insert({
        user_id: adminUser.id,
        role_id: adminRole.id,
        created_at: knex.fn.now(),
      });
    }
  }
}

async function grantAdminMenus(knex) {
  const adminRole = await knex('roles').where({ code: 'admin' }).first();
  if (!adminRole) return;

  const menus = await knex('menus').select('id');
  for (const menu of menus) {
    const exists = await knex('role_menus')
      .where({ role_id: adminRole.id, menu_id: menu.id })
      .first();
    if (!exists) {
      await knex('role_menus').insert({
        role_id: adminRole.id,
        menu_id: menu.id,
        created_at: knex.fn.now(),
      });
    }
  }
}

async function ensureOperationalFinanceActions(knex) {
  const actions = [
    {
      parentPermission: 'finance:entries:view',
      permission: 'finance:entries:update',
      name: '编辑凭证',
      roleCodes: ['admin', 'system_admin', 'finance_manager', 'accountant'],
    },
    {
      parentPermission: 'finance:entries:view',
      permission: 'finance:entries:approve',
      name: '审核凭证',
      roleCodes: ['admin', 'system_admin', 'finance_manager'],
    },
    {
      parentPermission: 'finance:entries:view',
      permission: 'finance:entries:delete',
      name: '删除凭证',
      roleCodes: ['admin', 'system_admin', 'finance_manager'],
    },
    {
      parentPermission: 'finance:closing:view',
      permission: 'finance:closing:execute',
      name: '执行结账',
      roleCodes: ['admin', 'system_admin', 'finance_manager'],
    },
  ];

  for (const action of actions) {
    const parent = await knex('menus').where({ permission: action.parentPermission }).first();
    if (!parent) continue;

    let menu = await knex('menus').where({ permission: action.permission }).first();
    if (menu) {
      await knex('menus').where({ id: menu.id }).update({
        parent_id: parent.id,
        name: action.name,
        type: 2,
        visible: 1,
        status: 1,
        updated_at: knex.fn.now(),
      });
    } else {
      const [menuId] = await knex('menus').insert({
        parent_id: parent.id,
        name: action.name,
        path: '',
        component: '',
        icon: '',
        permission: action.permission,
        type: 2,
        visible: 1,
        status: 1,
        sort_order: 900,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });
      menu = { id: menuId };
    }

    const roles = await knex('roles').select('id').whereIn('code', action.roleCodes);
    for (const role of roles) {
      for (const menuId of [parent.id, menu.id]) {
        const exists = await knex('role_menus')
          .where({ role_id: role.id, menu_id: menuId })
          .first();
        if (!exists) {
          await knex('role_menus').insert({
            role_id: role.id,
            menu_id: menuId,
            created_at: knex.fn.now(),
          });
        }
      }
    }
  }
}

async function syncPermissionSsot(knex) {
  const requiredTables = ['permissions', 'role_permissions', 'menus', 'role_menus'];
  for (const table of requiredTables) {
    if (!(await knex.schema.hasTable(table))) return;
  }

  await knex.raw(`
    INSERT INTO permissions (code, name, module, status, source, created_at, updated_at)
    SELECT DISTINCT m.permission,
           COALESCE(NULLIF(m.name, ''), m.permission),
           SUBSTRING_INDEX(m.permission, ':', 1),
           1,
           'menu',
           NOW(),
           NOW()
      FROM menus m
     WHERE m.permission IS NOT NULL AND m.permission <> ''
    ON DUPLICATE KEY UPDATE
      status = 1,
      updated_at = NOW()
  `);

  if (await knex.schema.hasColumn('menus', 'permission_id')) {
    await knex.raw(`
      UPDATE menus m
      JOIN permissions p ON BINARY p.code = BINARY m.permission
         SET m.permission_id = p.id
       WHERE m.permission IS NOT NULL AND m.permission <> ''
    `);
  }

  await knex.raw(`
    INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
    SELECT DISTINCT rm.role_id, p.id, NOW()
      FROM role_menus rm
      JOIN menus m ON m.id = rm.menu_id
      JOIN permissions p ON BINARY p.code = BINARY m.permission
     WHERE m.permission IS NOT NULL AND m.permission <> ''
       AND COALESCE(m.status, 1) = 1
  `);
}

async function ensureDefaultApprovalTemplates(knex) {
  const requiredTables = ['permissions', 'role_permissions', 'workflow_templates', 'workflow_template_nodes'];
  for (const table of requiredTables) {
    if (!(await knex.schema.hasTable(table))) return;
  }

  const adminRole = await knex('roles').where({ code: 'admin' }).first('id');
  const adminUser = await knex('users').where({ username: 'admin' }).first('id');
  if (!adminRole || !adminUser) return;

  let permission = await knex('permissions').where({ code: 'system:workflow:use' }).first('id');
  if (!permission) {
    const [id] = await knex('permissions').insert({
      code: 'system:workflow:use',
      name: 'Use approval center',
      module: 'system',
      description: 'Submit and process assigned workflow approvals',
      status: 1,
      source: 'system',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
    permission = { id };
  }

  const permissionGrant = await knex('role_permissions')
    .where({ role_id: adminRole.id, permission_id: permission.id })
    .first('role_id');
  if (!permissionGrant) {
    await knex('role_permissions').insert({
      role_id: adminRole.id,
      permission_id: permission.id,
      created_at: knex.fn.now(),
    });
  }

  for (const [businessType, code, name] of DEFAULT_APPROVAL_TEMPLATES) {
    const active = await knex('workflow_templates')
      .where({ business_type: businessType, is_active: 1 })
      .whereNull('deleted_at')
      .first('id');
    if (active) continue;

    const latest = await knex('workflow_templates')
      .where({ code })
      .orderBy('version', 'desc')
      .first('version');
    const [templateId] = await knex('workflow_templates').insert({
      code,
      name,
      business_type: businessType,
      description: 'Safe default: any authorized administrator except the initiator may approve',
      is_active: 1,
      version: Number(latest?.version || 0) + 1,
      created_by: adminUser.id,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
    await knex('workflow_template_nodes').insert({
      template_id: templateId,
      node_name: 'Administrator approval',
      node_type: 'approval',
      sequence: 1,
      approver_type: 'role',
      approver_ids: JSON.stringify([adminRole.id]),
      multi_approve_type: 'any',
      allow_self_approval: 0,
      timeout_hours: 0,
      timeout_action: 'notify',
      created_at: knex.fn.now(),
    });
  }
}

exports.seed = async function seed(knex) {
  await ensureCoreRoles(knex);
  await ensureAdminUser(knex);
  await ensureCoreMenus(knex);
  await ensureOperationalFinanceActions(knex);
  await grantAdminMenus(knex);
  await syncPermissionSsot(knex);
  await ensureDefaultApprovalTemplates(knex);
  await require('../src/bootstrap/notificationRules').ensureNotificationRules(knex);

  const hasCostSettings = await knex.schema.hasTable('cost_settings');
  if (hasCostSettings) {
    const activeCostSetting = await knex('cost_settings').where({ is_active: true }).first();
    if (!activeCostSetting) {
      await knex('cost_settings').insert({
        setting_name: '默认成本配置',
        overhead_rate: 0.5,
        labor_rate: 50.00,
        costing_method: 'weighted_average',
        is_active: true,
        description: '系统默认成本核算配置',
      });
      console.log('[Seed] Default cost setting created');
    }
  }
};
