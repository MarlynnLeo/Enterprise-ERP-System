/**
 * Bootstrap the role/user principals required by the 20260814 organisational
 * migrations.
 *
 * The normal seed runs after migrations, while several historical migrations
 * were written against an already-populated production database.  On a new
 * database that used to make the migration chain fail halfway through.  This
 * forward-only, idempotent migration supplies only the structural principals
 * those migrations need.  Missing users receive a cryptographically random
 * password hash and are forced to change it; no shared/default password is
 * ever stored or printed.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const PasswordSecurity = require('../src/utils/passwordSecurity');

const REQUIRED_ROLES = [
  { code: 'admin', name: '管理员', description: '系统管理员', data_scope: 1, is_super_admin: 1 },
  { code: 'system_admin', name: '系统管理员', description: '系统配置管理员', data_scope: 1, is_super_admin: 0 },
  { code: 'employee', name: '基础账号', description: '基础员工账号', data_scope: 4, is_super_admin: 0 },
  { code: 'production_manager', name: '生产管理员', description: '生产模块管理角色', data_scope: 2, is_super_admin: 0 },
  { code: 'production_operator', name: '生产操作员', description: '生产现场作业角色', data_scope: 4, is_super_admin: 0 },
  { code: 'production_planner', name: '生产计划员', description: '生产计划角色', data_scope: 2, is_super_admin: 0 },
  { code: 'inventory_manager', name: '仓库管理员', description: '仓库和库存管理角色', data_scope: 2, is_super_admin: 0 },
  { code: 'inventory_operator', name: '仓库操作员', description: '仓库作业角色', data_scope: 4, is_super_admin: 0 },
  { code: 'quality_manager', name: '质量管理员', description: '质量模块管理角色', data_scope: 2, is_super_admin: 0 },
  { code: 'quality_inspector', name: '质检员', description: '质量检验角色', data_scope: 4, is_super_admin: 0 },
  { code: 'incoming_inspector', name: '来料检验员', description: '来料检验角色', data_scope: 4, is_super_admin: 0 },
  { code: 'process_inspector', name: '线上检验员', description: '过程检验角色', data_scope: 4, is_super_admin: 0 },
  { code: 'final_inspector', name: '成品检验员', description: '成品检验角色', data_scope: 4, is_super_admin: 0 },
  { code: 'finance_manager', name: '财务管理员', description: '财务模块管理角色', data_scope: 1, is_super_admin: 0 },
  { code: 'accountant', name: '会计助理', description: '日常核算角色', data_scope: 1, is_super_admin: 0 },
  { code: 'cashier', name: '出纳', description: '资金作业角色', data_scope: 1, is_super_admin: 0 },
  { code: 'purchase_manager', name: '采购管理员', description: '采购模块管理角色', data_scope: 2, is_super_admin: 0 },
  { code: 'purchase', name: '采购部门', description: '采购部门角色', data_scope: 2, is_super_admin: 0 },
  { code: 'purchaser', name: '采购员', description: '采购作业角色', data_scope: 4, is_super_admin: 0 },
  { code: 'sales_manager', name: '销售管理员', description: '销售模块管理角色', data_scope: 2, is_super_admin: 0 },
  { code: 'salesperson', name: '销售员', description: '销售作业角色', data_scope: 4, is_super_admin: 0 },
  { code: 'XX', name: '销售部门', description: '销售部门角色', data_scope: 2, is_super_admin: 0 },
];

// These principals are referenced by later data/permission migrations.  They
// are only created when absent, so existing production identities are never
// overwritten.
const REQUIRED_USERS = [
  ['admin', '系统管理员'],
  ['XAP', '谢爱萍'],
  ['HLG', '黄立果'],
  ['NHY', '倪海燕'],
  ['WLF', '韦兰凤'],
  ['QXF', '钱小飞'],
  ['WCH', '王翠华'],
  ['LLJ', '骆丽君'],
  ['YL', '杨林'],
  ['SF', '舒凡'],
  ['GXX', '郭芯芯'],
  ['XHY', '徐海英'],
  ['YYZ', '杨叶子'],
  ['ZR', '赵瑞'],
  ['NXJ', '倪晓洁'],
  ['XLX', '肖丽霞'],
  ['WGZ', '王国柱'],
  ['CXQ', '褚秀琴'],
  ['WX', '吴霞'],
  ['CC', '陈诚'],
  ['XXX', '徐秀霞'],
  ['XQ', '向琴'],
  ['LXL', '林选乐'],
  ['ZYS', '张玉松'],
];

// This migration was added later with an earlier timestamp to repair fresh
// installs.  On an existing database Knex will still see it as pending even
// though the organisational migrations it supports have already completed.
// In that case changing role definitions or creating historical principals is
// both unnecessary and unsafe, so make the late migration an explicit no-op.
const FIRST_SAFE_LATE_SKIP_MIGRATION = '20260814000009_add_quality_inspector_org.js';

async function hasDependentMigrationAlreadyRun(knex) {
  const hasMigrationTable = await knex.schema.hasTable('knex_migrations');
  if (!hasMigrationTable) return false;

  const applied = await knex('knex_migrations')
    .where('name', '>=', FIRST_SAFE_LATE_SKIP_MIGRATION)
    .orderBy('name', 'asc')
    .first('id');
  return Boolean(applied);
}

async function ensureRole(knex, spec) {
  const existing = await knex('roles').where({ code: spec.code }).first('id');
  const values = {
    name: spec.name,
    description: spec.description,
    status: 1,
    data_scope: spec.data_scope,
    is_super_admin: spec.is_super_admin,
    updated_at: knex.fn.now(),
  };
  if (existing) {
    await knex('roles').where({ id: existing.id }).update(values);
    return existing.id;
  }
  const [id] = await knex('roles').insert({
    code: spec.code,
    ...values,
    created_at: knex.fn.now(),
  });
  return id;
}

async function ensureUser(knex, username, realName) {
  const existing = await knex('users').where({ username }).first('id');
  if (existing) return existing.id;

  let password;
  if (username === 'admin') {
    const configuredHash = String(process.env.DEFAULT_ADMIN_PASSWORD_HASH || '').trim();
    const configuredPassword = String(process.env.DEFAULT_ADMIN_PASSWORD || '');
    if (configuredHash) {
      if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(configuredHash)) {
        throw new Error('DEFAULT_ADMIN_PASSWORD_HASH must be a valid bcrypt hash');
      }
      password = configuredHash;
    } else if (configuredPassword) {
      const validation = PasswordSecurity.validatePasswordStrength(configuredPassword);
      if (!validation.isValid) {
        throw new Error(`DEFAULT_ADMIN_PASSWORD is not strong enough: ${validation.errors.join(', ')}`);
      }
      password = await bcrypt.hash(configuredPassword, 12);
    } else if (process.env.NODE_ENV === 'test') {
      password = await bcrypt.hash(process.env.TEST_ADMIN_PASSWORD || '123456', 12);
    } else {
      throw new Error(
        'DEFAULT_ADMIN_PASSWORD or DEFAULT_ADMIN_PASSWORD_HASH is required to bootstrap the administrator'
      );
    }
  } else {
    // Hash an un-disclosed random value.  The account is immediately marked
    // for password change and has no role until a later migration/administrator
    // explicitly assigns one.
    const randomPassword = crypto.randomBytes(32).toString('base64url');
    password = await bcrypt.hash(randomPassword, 12);
  }
  const [id] = await knex('users').insert({
    username,
    password,
    real_name: realName,
    role: 'employee',
    status: 1,
    employee_status: 'active',
    force_password_change: 1,
    password_changed_at: null,
    password_expires_at: null,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  return id;
}

exports.up = async function up(knex) {
  if (await hasDependentMigrationAlreadyRun(knex)) {
    console.warn(
      `[20260813000001] ${FIRST_SAFE_LATE_SKIP_MIGRATION} 或更后迁移已执行，跳过历史角色/账号补齐。`
    );
    return;
  }

  for (const role of REQUIRED_ROLES) await ensureRole(knex, role);
  for (const [username, realName] of REQUIRED_USERS) await ensureUser(knex, username, realName);
};

exports.down = async function down() {
  // Principals may be referenced by business data; never delete them during a
  // rollback.  A reviewed data-retirement migration is required instead.
  console.warn('[20260813000001] down: 保留角色和账号，避免破坏业务数据。');
};
