'use strict';

// Retain the migration identity for installations that have already recorded it.
// A display name is not a unique user identity. User management must explicitly
// assign signature bindings; migrations must not assign or clear them by name.
exports.up = async function up() {};
exports.down = async function down() {};
