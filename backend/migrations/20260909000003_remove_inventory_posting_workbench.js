'use strict';

const RoleAccessService = require('../src/services/RoleAccessService');

const MENU_PATH = '/finance/inventory-posting';

/**
 * Retire the standalone inventory approval navigation entry.
 * Inventory approval remains available through business document details and
 * the finance approval API remains available for those embedded panels.
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable('menus')) {
    const menu = await knex('menus').where({ path: MENU_PATH }).first('id');
    if (menu) {
      if (await knex.schema.hasTable('role_menus')) {
        await knex('role_menus').where({ menu_id: menu.id }).del();
      }
      await knex('menus').where({ parent_id: menu.id }).del();
      await knex('menus').where({ id: menu.id }).del();
    }
  }

  if (await knex.schema.hasTable('role_menus')) {
    await RoleAccessService.applyAllWithKnex(knex);
  }
};

exports.down = async function down() {
  // Forward-only control migration. The standalone route is retired by design.
};
