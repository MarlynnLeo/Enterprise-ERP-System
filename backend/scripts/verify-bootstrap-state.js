'use strict';

const knexFactory = require('knex');
const environments = require('../knexfile');

const REQUIRED_APPROVAL_TYPES = [
  'purchase_order',
  'purchase_requisition',
  'contract',
  'ecn',
  'hr_leave',
  'hr_overtime',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function verify() {
  const environment = process.env.NODE_ENV || 'development';
  const config = environments[environment];
  assert(config, `Missing Knex configuration for NODE_ENV=${environment}`);

  const knex = knexFactory(config);
  try {
    const [, pendingMigrations] = await knex.migrate.list();
    assert(pendingMigrations.length === 0, `Pending migrations: ${pendingMigrations.join(', ')}`);

    const adminRole = await knex('roles').where({ code: 'admin' }).first('id');
    const adminUser = await knex('users').where({ username: 'admin' }).first('id');
    assert(adminRole, 'Default admin role is missing');
    assert(adminUser, 'Default admin user is missing');

    const notificationMenu = await knex('menus')
      .where({ permission: 'system:notification-rules' })
      .first('id', 'parent_id');
    const systemMenu = await knex('menus').where({ path: '/system' }).first('id');
    assert(notificationMenu, 'Notification rules menu is missing');
    assert(systemMenu && notificationMenu.parent_id === systemMenu.id, 'Notification rules menu has an invalid parent');

    const activeTemplates = await knex('workflow_templates')
      .whereIn('business_type', REQUIRED_APPROVAL_TYPES)
      .where({ is_active: 1 })
      .whereNull('deleted_at')
      .select('business_type');
    const activeTypes = new Set(activeTemplates.map((row) => row.business_type));
    const missingTypes = REQUIRED_APPROVAL_TYPES.filter((type) => !activeTypes.has(type));
    assert(missingTypes.length === 0, `Default approval templates are missing: ${missingTypes.join(', ')}`);

    const workflowPermission = await knex('permissions')
      .where({ code: 'system:workflow:use' })
      .first('id');
    assert(workflowPermission, 'Workflow usage permission is missing');
    const adminGrant = await knex('role_permissions')
      .where({ role_id: adminRole.id, permission_id: workflowPermission.id })
      .first('role_id');
    assert(adminGrant, 'Admin role is missing the workflow usage permission');

    console.log('Bootstrap state verified: migrations, admin principal, menus, and approval templates are complete.');
  } finally {
    await knex.destroy();
  }
}

verify().catch((error) => {
  console.error(`Bootstrap state verification failed: ${error.message}`);
  process.exitCode = 1;
});
