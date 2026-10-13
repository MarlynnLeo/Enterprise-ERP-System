'use strict';

/**
 * Reconstructed on 2026-10-13 to reconcile an applied production migration
 * whose original source was not retained. This is not the original file.
 * Production recorded this name in batch 276 on 2026-10-12 and the matching
 * finance automation menu has icon-robot, also the canonical frontend icon.
 * Existing databases skip this recorded migration; fresh databases receive
 * the same narrowly scoped, idempotent menu metadata correction.
 */
exports.up = async function up(knex) {
  await knex('menus')
    .where('permission', 'finance:automation:view')
    .where('type', 1)
    .whereIn('path', ['/finance/automation', '/finance/settings?tab=automation'])
    .where(function needsCorrection() {
      this.whereNull('icon').orWhere('icon', '<>', 'icon-robot');
    })
    .update({ icon: 'icon-robot', updated_at: knex.fn.now() });
};

exports.down = async function down() {
  // The original icon is unknown; preserve the valid icon and later user edits.
};
