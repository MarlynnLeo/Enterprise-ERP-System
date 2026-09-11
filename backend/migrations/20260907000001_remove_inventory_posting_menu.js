'use strict';

const RoleAccessService = require('../src/services/RoleAccessService');

const MENU_PATH = '/finance/inventory-posting';

/**
 * Inventory approval is embedded in each warehouse document detail page.
 * Keep the finance permission records for API authorization, but remove the
 * legacy standalone navigation entry from databases where the earlier
 * migration has already created it.
 */
exports.up = async function up(knex) {
  const menu = await knex('menus').where({ path: MENU_PATH }).first('id');
  if (menu) {
    await knex('role_menus').where({ menu_id: menu.id }).del();
    await knex('menus').where({ parent_id: menu.id }).del();
    await knex('menus').where({ id: menu.id }).del();
  }

  // Rebuild managed role navigation after removing the legacy menu. Super
  // admins are refreshed here as well so they retain the full permission set.
  await RoleAccessService.applyAllWithKnex(knex);
};

exports.down = async function down() {
  // The standalone page is intentionally retired and is not recreated on rollback.
}
