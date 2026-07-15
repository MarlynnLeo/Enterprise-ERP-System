/**
 * 会计期间硬锁定 is_locked：
 * - status 虚拟列：locked / closed / open
 * - 已关闭且锁定的期间禁止 reopen，禁止记账
 */
exports.up = async function up(knex) {
  const hasLocked = await knex.schema.hasColumn('gl_periods', 'is_locked');
  if (!hasLocked) {
    await knex.schema.alterTable('gl_periods', (table) => {
      table.boolean('is_locked').notNullable().defaultTo(false).comment('硬锁定（禁止重开/记账）');
    });
  }

  // 重建虚拟 status 列
  const [cols] = await knex.raw(`SHOW COLUMNS FROM gl_periods LIKE 'status'`);
  if (cols.length > 0) {
    await knex.raw('ALTER TABLE gl_periods DROP COLUMN status');
  }

  await knex.raw(`
    ALTER TABLE gl_periods
    ADD COLUMN status VARCHAR(10)
    GENERATED ALWAYS AS (
      IF(\`is_locked\` = 1, 'locked', IF(\`is_closed\` = 1, 'closed', 'open'))
    ) VIRTUAL
  `);

  try {
    await knex.raw('CREATE INDEX idx_status ON gl_periods (status)');
  } catch (e) {
    // index may already exist
  }
};

exports.down = async function down(knex) {
  const [cols] = await knex.raw(`SHOW COLUMNS FROM gl_periods LIKE 'status'`);
  if (cols.length > 0) {
    await knex.raw('ALTER TABLE gl_periods DROP COLUMN status');
  }

  await knex.raw(`
    ALTER TABLE gl_periods
    ADD COLUMN status VARCHAR(10)
    GENERATED ALWAYS AS (IF(\`is_closed\` = 1, 'closed', 'open')) VIRTUAL
  `);

  if (await knex.schema.hasColumn('gl_periods', 'is_locked')) {
    await knex.schema.alterTable('gl_periods', (table) => {
      table.dropColumn('is_locked');
    });
  }
};
