'use strict';

const RoleAccessService = require('../src/services/RoleAccessService');

const SOURCE_VIEW_PERMISSIONS = [
  ['basedata:materials:view', '物料查看'],
  ['basedata:locations:view', '库位查看'],
  ['basedata:units:view', '单位查看'],
  ['inventory:inbound:view', '入库单查看'],
  ['inventory:outbound:view', '出库单查看'],
  ['inventory:manual:view', '手工出入库单查看'],
  ['inventory:transfer:view', '库存调拨单查看'],
  ['inventory:check:view', '库存盘点单查看'],
  ['purchase:receipts:view', '采购收货单查看'],
  ['purchase:returns:view', '采购退货单查看'],
  ['purchase:processing:view', '委外加工单查看'],
  ['purchase:processing-receipts:view', '委外收货单查看'],
  ['sales:outbound:view', '销售出库单查看'],
  ['sales:returns:view', '销售退货单查看'],
  ['sales:exchanges:view', '销售换货单查看'],
  ['quality:scrap:view', '报废记录查看'],
];

async function ensurePermission(knex, code, name) {
  const existing = await knex('permissions').where({ code }).first('id');
  if (existing) return existing.id;

  const [id] = await knex('permissions').insert({
    code,
    name,
    module: code.split(':')[0],
    status: 1,
    source: 'migration',
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  return id;
}

exports.up = async function up(knex) {
  for (const [code, name] of SOURCE_VIEW_PERMISSIONS) {
    await ensurePermission(knex, code, name);
  }

  // Rebuild managed roles from the single role profile so existing databases
  // receive the same read access as newly bootstrapped environments.
  await RoleAccessService.applyAllWithKnex(knex);
};

exports.down = async function down() {
  // Forward-only access migration. Removing read permissions could hide the
  // source documents required to audit existing inventory postings.
};
