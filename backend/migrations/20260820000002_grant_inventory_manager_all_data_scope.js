'use strict';

/**
 * 仓库管理员的业务单据来自采购、生产、质量等多个部门。
 * 仅限“本部门及下级”会将已授权的出入库单全部过滤掉。
 *
 * 这里只放宽 inventory_manager 的数据范围，不增加任何菜单或操作权限；
 * 用户仍只能访问 role_permissions 中已授权的功能。
 */

const ALL = 1;
const DEPARTMENT_AND_CHILDREN = 2;
const ROLE_CODE = 'inventory_manager';

exports.up = async function up(knex) {
  await knex('roles').where({ code: ROLE_CODE }).update({
    data_scope: ALL,
    updated_at: knex.fn.now(),
  });
};

exports.down = async function down(knex) {
  await knex('roles')
    .where({ code: ROLE_CODE, data_scope: ALL })
    .update({
      data_scope: DEPARTMENT_AND_CHILDREN,
      updated_at: knex.fn.now(),
    });
};
