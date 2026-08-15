/**
 * 审批流按岗位组挂钩：采购管理员审采购申请/订单，不再绑已删除用户。
 * 部门经理类岗位补审批中心权限，提交人仍走业务页发起。
 */
const RoleAccessService = require('../src/services/RoleAccessService');

const TEMPLATES = [
  {
    businessType: 'purchase_order',
    code: 'PURCHASE_ORDER_MANAGER_APPROVAL',
    name: '采购订单审批',
    description: '采购管理员审批采购订单',
    approverType: 'role',
    roleCode: 'purchase_manager',
    nodeName: '采购管理员审批',
  },
  {
    businessType: 'purchase_requisition',
    code: 'PURCHASE_REQUISITION_MANAGER_APPROVAL',
    name: '采购申请审批',
    description: '采购管理员审批采购申请',
    approverType: 'role',
    roleCode: 'purchase_manager',
    nodeName: '采购管理员审批',
  },
  {
    businessType: 'contract',
    code: 'CONTRACT_DEPT_MANAGER_APPROVAL',
    name: '合同审批',
    description: '提交人所在部门负责人审批',
    approverType: 'manager',
    nodeName: '部门负责人审批',
  },
  {
    businessType: 'hr_leave',
    code: 'HR_LEAVE_DEPT_MANAGER_APPROVAL',
    name: '请假审批',
    description: '提交人所在部门负责人审批',
    approverType: 'manager',
    nodeName: '部门负责人审批',
  },
  {
    businessType: 'hr_overtime',
    code: 'HR_OVERTIME_DEPT_MANAGER_APPROVAL',
    name: '加班审批',
    description: '提交人所在部门负责人审批',
    approverType: 'manager',
    nodeName: '部门负责人审批',
  },
  {
    businessType: 'ecn',
    code: 'ECN_DEPT_MANAGER_APPROVAL',
    name: '工程变更审批',
    description: '提交人所在部门负责人审批',
    approverType: 'manager',
    nodeName: '部门负责人审批',
  },
];

async function replaceTemplate(knex, spec, createdBy) {
  await knex('workflow_templates')
    .where({ business_type: spec.businessType, is_active: 1 })
    .whereNull('deleted_at')
    .update({ is_active: 0, updated_at: knex.fn.now() });

  let approverIds = null;
  if (spec.approverType === 'role') {
    const role = await knex('roles').where({ code: spec.roleCode }).first('id');
    if (!role) {
      throw new Error(`审批模板缺少角色 ${spec.roleCode}`);
    }
    approverIds = JSON.stringify([role.id]);
  }

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
    approver_type: spec.approverType,
    approver_ids: approverIds,
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

  try {
    const PermissionService = require('../src/services/PermissionService');
    await PermissionService.clearUserPermissionsCache();
  } catch {
    // ignore
  }
};

exports.down = async function down() {
  console.warn('[20260814000020] down: 不回滚审批模板岗位挂钩。');
};
