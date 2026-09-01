'use strict';

const RoleAccessService = require('../src/services/RoleAccessService');

exports.up = async function up(knex) {
  await RoleAccessService.applyAllWithKnex(knex);
};

exports.down = async function down() {
  // Role permission normalization is intentionally not reversed. Roles may be
  // edited after this migration, so restoring a stale snapshot would revoke
  // legitimate grants or reintroduce permissions that were later removed.
};
