/** Seed safe, fail-closed approval templates for every supported business type. */

const TYPES = [
  ['purchase_order', 'DEFAULT_PURCHASE_ORDER_APPROVAL', 'Purchase order approval'],
  ['purchase_requisition', 'DEFAULT_PURCHASE_REQUISITION_APPROVAL', 'Purchase requisition approval'],
  ['contract', 'DEFAULT_CONTRACT_APPROVAL', 'Contract approval'],
  ['ecn', 'DEFAULT_ECN_APPROVAL', 'Engineering change approval'],
  ['hr_leave', 'DEFAULT_HR_LEAVE_APPROVAL', 'Leave request approval'],
  ['hr_overtime', 'DEFAULT_HR_OVERTIME_APPROVAL', 'Overtime request approval'],
];

exports.up = async function up(knex) {
  const adminRole = await knex('roles').where({ code: 'admin' }).first('id');
  const adminUser = await knex('users').where({ username: 'admin' }).first('id');
  if (!adminRole || !adminUser) {
    throw new Error('Admin role and user are required before seeding approval templates');
  }

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
  await knex('role_permissions').insert({
    role_id: adminRole.id,
    permission_id: permission.id,
    created_at: knex.fn.now(),
  }).onConflict(['role_id', 'permission_id']).ignore();

  for (const [businessType, code, name] of TYPES) {
    const active = await knex('workflow_templates')
      .where({ business_type: businessType, is_active: 1 })
      .whereNull('deleted_at')
      .first('id');
    if (active) continue;

    const latest = await knex('workflow_templates')
      .where({ code })
      .orderBy('version', 'desc')
      .first('version');
    const version = Number(latest?.version || 0) + 1;
    const [templateId] = await knex('workflow_templates').insert({
      code,
      name,
      business_type: businessType,
      description: 'Safe default: any authorized administrator except the initiator may approve',
      is_active: 1,
      version,
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
};

exports.down = async function down() {
  // Preserve configured approval templates and permission grants.
};
