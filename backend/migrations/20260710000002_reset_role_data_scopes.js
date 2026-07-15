/**
 * 按角色职责重置 data_scope（修复全员 ALL 导致行级隔离失效）
 *
 * DATA_SCOPE:
 *   1 = ALL
 *   2 = DEPARTMENT_AND_CHILDREN
 *   3 = DEPARTMENT
 *   4 = SELF
 *   5 = CUSTOM
 */
const ALL = 1;
const DEPT_AND_CHILDREN = 2;
const DEPT = 3;
const SELF = 4;

/** code → data_scope */
const ROLE_SCOPE_MAP = {
  admin: ALL,
  system_admin: ALL,
  finance_manager: ALL,
  accountant: ALL,

  // 部门管理者：本部门及下级
  purchase_manager: DEPT_AND_CHILDREN,
  sales_manager: DEPT_AND_CHILDREN,
  production_manager: DEPT_AND_CHILDREN,
  quality_manager: DEPT_AND_CHILDREN,
  inventory_manager: DEPT_AND_CHILDREN,
  purchase: DEPT_AND_CHILDREN, // 采购部门

  // 一线业务：仅本人
  salesperson: SELF,
  purchaser: SELF,
  production_operator: SELF,
  quality_inspector: SELF,
  inventory_operator: SELF,
  employee: SELF,
  user: SELF,

  // 其他命名
  '100001': DEPT, // 品质部
  XX: DEPT, // 销售部
  test: SELF,
};

exports.up = async function up(knex) {
  const roles = await knex('roles').select('id', 'code', 'name', 'data_scope');
  for (const role of roles) {
    const code = String(role.code || '').trim();
    let scope = ROLE_SCOPE_MAP[code];

    // 未映射：名称启发式
    if (scope === undefined) {
      const name = String(role.name || '');
      if (/管理|经理|主管|admin/i.test(code + name)) {
        scope = DEPT_AND_CHILDREN;
      } else if (/财务|会计|出纳/i.test(code + name)) {
        scope = ALL;
      } else {
        scope = SELF;
      }
    }

    await knex('roles').where({ id: role.id }).update({ data_scope: scope });
  }
};

exports.down = async function down(knex) {
  // 回滚为全员 ALL（审计前状态）
  await knex('roles').update({ data_scope: ALL });
};
