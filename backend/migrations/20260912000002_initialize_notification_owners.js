const { ensureNotificationRules } = require('../src/bootstrap/notificationRules');

exports.up = async knex => ensureNotificationRules(knex);
exports.down = async () => { /* User notification configuration survives code rollback. */ };
