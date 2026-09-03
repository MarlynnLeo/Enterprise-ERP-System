'use strict';

/**
 * Repair notification rules created with legacy role ids.
 *
 * Role ids are data, not stable identifiers.  The original rules pointed at
 * roles 12/18/20, which no longer have active users after the warehouse and
 * quality role split.  Resolve the current role ids by code and only replace
 * rules whose configured roles no longer resolve to a recipient.
 */

const ROLE_CODES_BY_EVENT = Object.freeze({
  PRODUCTION_TASK_COMPLETED: ['production_manager', 'production_planning', 'quality_manager'],
  PURCHASE_RECEIPT_COMPLETED: ['component_warehouse_operator', 'inventory_manager', 'incoming_inspector'],
  SALES_OUTBOUND_COMPLETED: ['sales_manager', 'salesperson', 'finished_goods_operator', 'inventory_manager'],
  SALES_RETURN_COMPLETED: ['sales_manager', 'salesperson', 'finished_goods_operator', 'inventory_manager'],
  PURCHASE_RETURN_COMPLETED: ['purchase_manager', 'purchaser', 'component_warehouse_operator', 'inventory_manager'],
  ANOMALY_REPORTED: ['production_manager', 'production_planning', 'quality_manager'],
  ASSEMBLY_ALL_STEPS_COMPLETED: ['production_manager', 'production_planning', 'quality_manager'],
});

function parseConfig(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isInteger);
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isInteger) : [];
  } catch {
    return [];
  }
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('notification_rules'))) return;
  if (!(await knex.schema.hasTable('roles')) || !(await knex.schema.hasTable('user_roles'))) return;

  await knex.transaction(async (trx) => {
    const rules = await trx('notification_rules')
      .select('id', 'event_type', 'recipient_type', 'recipient_config')
      .whereIn('event_type', Object.keys(ROLE_CODES_BY_EVENT))
      .where({ is_active: 1 })
      .whereNull('deleted_at');

    for (const rule of rules) {
      if (rule.recipient_type !== 'role') continue;

      const configuredRoleIds = parseConfig(rule.recipient_config);
      const [[currentCount]] = await trx.raw(
        `SELECT COUNT(DISTINCT u.id) AS count
           FROM user_roles ur
           JOIN users u ON u.id = ur.user_id AND u.status = 1
           JOIN roles r ON r.id = ur.role_id AND r.status = 1
          WHERE ur.role_id IN (?)`,
        [configuredRoleIds.length ? configuredRoleIds : [0]]
      );
      if (Number(currentCount?.count || 0) > 0) continue;

      const roleCodes = ROLE_CODES_BY_EVENT[rule.event_type];
      const [rows] = await trx.raw(
        `SELECT DISTINCT r.id
           FROM roles r
           JOIN user_roles ur ON ur.role_id = r.id
           JOIN users u ON u.id = ur.user_id AND u.status = 1
          WHERE r.status = 1 AND r.code IN (?)
          ORDER BY r.id`,
        [roleCodes]
      );
      const replacement = rows.map((row) => Number(row.id));
      if (!replacement.length) continue;

      await trx('notification_rules')
        .where({ id: rule.id })
        .update({
          recipient_config: JSON.stringify(replacement),
          updated_at: trx.fn.now(),
        });
    }
  });
};
exports.down = async function down() {
  // Keep repaired routing in place when rolling back unrelated code changes.
};
