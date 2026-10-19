'use strict';

// Older installations already had audit_logs when the 20260513 CREATE TABLE
// IF NOT EXISTS baseline ran. That baseline never added these three columns,
// so transactional purchase approvals could not persist their mandatory audit.
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('audit_logs'))) {
    throw new Error('audit_logs must exist before completing its payload schema');
  }
  const additions = [
    ['request_body', table => table.text('request_body', 'mediumtext').nullable()],
    ['response_status', table => table.integer('response_status').nullable()],
    ['response_body', table => table.text('response_body', 'mediumtext').nullable()],
  ];
  for (const [column, add] of additions) {
    if (!(await knex.schema.hasColumn('audit_logs', column))) {
      await knex.schema.alterTable('audit_logs', add);
    }
  }
};

// Additive audit compatibility repair. Retain recorded request/response evidence
// on rollback, including columns that may predate this migration.
exports.down = async function () {};
