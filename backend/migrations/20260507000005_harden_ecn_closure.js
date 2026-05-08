/**
 * Harden ECN closure: align menu permission with canonical BOM permissions.
 */
exports.up = async function up(knex) {
  await knex.raw(
    "UPDATE menus SET permission = 'basedata:boms', updated_at = NOW() WHERE path = '/basedata/ecn'"
  );

  const existing = await knex('workflow_templates')
    .where({ business_type: 'ecn', is_active: 1 })
    .whereNull('deleted_at')
    .first('id');

  if (!existing) {
    const [templateId] = await knex('workflow_templates').insert({
      code: 'ECN_DEFAULT_APPROVAL',
      name: 'ECN默认审批流程',
      business_type: 'ecn',
      description: '工程变更默认审批流程，保证ECN提交后能进入审批闭环。',
      is_active: 1,
      version: 1,
      created_by: 1,
    });

    await knex('workflow_template_nodes').insert({
      template_id: templateId,
      node_name: '发起人审批',
      node_type: 'approval',
      sequence: 1,
      approver_type: 'self',
      multi_approve_type: 'any',
      timeout_hours: 0,
      timeout_action: 'notify',
    });
  }
};

exports.down = async function down(knex) {
  await knex.raw(
    "UPDATE menus SET permission = 'basedata:bom', updated_at = NOW() WHERE path = '/basedata/ecn'"
  );
  const templates = await knex('workflow_templates')
    .where({ code: 'ECN_DEFAULT_APPROVAL', business_type: 'ecn' })
    .select('id');
  const ids = templates.map((row) => row.id);
  if (ids.length) {
    await knex('workflow_template_nodes').whereIn('template_id', ids).del();
    await knex('workflow_templates').whereIn('id', ids).del();
  }
};
