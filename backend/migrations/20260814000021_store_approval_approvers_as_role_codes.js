/**
 * 审批人只存系统角色编码，不再存用户 ID 或角色数字 ID。
 */
const RoleAccessService = require('../src/services/RoleAccessService');

const TEMPLATES = [
  {
    businessType: 'purchase_order',
    code: 'PURCHASE_ORDER_ROLE_APPROVAL',
    name: '采购订单审批',
    description: '由采购管理员角色审批，换人只需调整角色成员',
    roleCodes: ['purchase_manager'],
    nodeName: '采购管理员审批',
  },
  {
    businessType: 'purchase_requisition',
    code: 'PURCHASE_REQUISITION_ROLE_APPROVAL',
    name: '采购申请审批',
    description: '由采购管理员角色审批，换人只需调整角色成员',
    roleCodes: ['purchase_manager'],
    nodeName: '采购管理员审批',
  },
  {
    businessType: 'contract',
    code: 'CONTRACT_ROLE_APPROVAL',
    name: '合同审批',
    description: '由销售部角色审批，换人只需调整角色成员',
    roleCodes: ['XX', 'sales_manager'],
    nodeName: '销售部门审批',
  },
  {
    businessType: 'hr_leave',
    code: 'HR_LEAVE_ROLE_APPROVAL',
    name: '请假审批',
    description: '由人事管理角色审批，未配置时由管理员角色处理',
    roleCodes: ['hr_manager', 'admin'],
    nodeName: '人事管理审批',
  },
  {
    businessType: 'hr_overtime',
    code: 'HR_OVERTIME_ROLE_APPROVAL',
    name: '加班审批',
    description: '由人事管理角色审批，未配置时由管理员角色处理',
    roleCodes: ['hr_manager', 'admin'],
    nodeName: '人事管理审批',
  },
  {
    businessType: 'ecn',
    code: 'ECN_ROLE_APPROVAL',
    name: '工程变更审批',
    description: '由生产管理员角色审批，换人只需调整角色成员',
    roleCodes: ['production_manager'],
    nodeName: '生产管理员审批',
  },
];

async function replaceTemplate(knex, spec, createdBy) {
  await knex('workflow_templates')
    .where({ business_type: spec.businessType, is_active: 1 })
    .whereNull('deleted_at')
    .update({ is_active: 0, updated_at: knex.fn.now() });

  const latest = await knex('workflow_templates').where({ code: spec.code }).orderBy('version', 'desc').first('version');
  const [templateId] = await knex('workflow_templates').insert({
    code: spec.code,
    name: spec.name,
    business_type: spec.businessType,
    description: spec.description,
    is_active: 1,
    version: Number(latest?.version || 0) + 1,
    created_by: createdBy,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });

  await knex('workflow_template_nodes').insert({
    template_id: templateId,
    node_name: spec.nodeName,
    node_type: 'approval',
    sequence: 1,
    approver_type: 'role',
    approver_ids: JSON.stringify(spec.roleCodes),
    multi_approve_type: 'any',
    allow_self_approval: 0,
    timeout_hours: 0,
    timeout_action: 'notify',
    created_at: knex.fn.now(),
  });
}

exports.up = async function up(knex) {
  await RoleAccessService.applyAllWithKnex(knex);
  const adminUser = await knex('users').where({ username: 'admin' }).first('id');
  const createdBy = adminUser ? adminUser.id : 1;
  for (const spec of TEMPLATES) {
    await replaceTemplate(knex, spec, createdBy);
  }
};

exports.down = async function down() {
  console.warn('[20260814000021] down: 不回滚角色编码审批模板。');
};
