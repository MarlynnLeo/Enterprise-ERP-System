const { ensureCoreMenus } = require('../src/bootstrap/menus');

exports.up = async knex => ensureCoreMenus(knex);
exports.down = async () => { /* Keep repaired navigation and user menu assignments on rollback. */ };
