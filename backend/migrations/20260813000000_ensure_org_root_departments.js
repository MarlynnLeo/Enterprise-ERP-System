/**
 * Establish the root departments required by the role/data-scope migrations
 * that follow this file. Fresh installations previously failed at
 * 20260814000009 because those migrations assumed production data already
 * contained organizational roots.
 *
 * This migration is deliberately idempotent: it matches by canonical name or
 * known legacy code and never re-parents an existing department.  Legacy
 * aliases are normalised to the canonical name/code because downstream
 * migrations use both fields when resolving the root.
 */

const ROOT_DEPARTMENTS = [
  { name: '财务部', code: '10002', aliases: [] },
  { name: '品质部', code: '10004', aliases: ['100001'] },
  { name: '生产部', code: '10005', aliases: [] },
  { name: '仓储部', code: '10007', aliases: [] },
];

/**
 * Older installations created `departments` before the common timestamp
 * columns were standardized.  `CREATE TABLE IF NOT EXISTS` does not alter
 * those legacy tables, so the first organizational migration must repair the
 * missing column before any update/insert includes it.
 */
async function ensureDepartmentUpdatedAt(knex) {
  if (!(await knex.schema.hasTable('departments'))) return;
  if (await knex.schema.hasColumn('departments', 'updated_at')) return;

  await knex.raw(`
    ALTER TABLE departments
      ADD COLUMN updated_at TIMESTAMP NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
  `);
}

async function ensureRootDepartment(knex, spec) {
  let row = await knex('departments').where({ name: spec.name }).first();
  if (!row) {
    row = await knex('departments').whereIn('code', [spec.code, ...spec.aliases]).first();
  }

  if (row) {
    // Keep the existing parent/manager relationship, but normalise the
    // identity used by later migrations.  Leaving an alias such as 100001 in
    // place makes a fresh install fail when the next migration looks for
    // code 10004.
    await knex('departments').where({ id: row.id }).update({
      name: spec.name,
      code: spec.code,
      status: 1,
      updated_at: knex.fn.now(),
    });
    return row.id;
  }

  const [id] = await knex('departments').insert({
    parent_id: null,
    name: spec.name,
    code: spec.code,
    status: 1,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  return id;
}

exports.up = async function up(knex) {
  await ensureDepartmentUpdatedAt(knex);
  for (const spec of ROOT_DEPARTMENTS) await ensureRootDepartment(knex, spec);
};


exports.down = async function down() {
  // Root departments may be referenced by production data; do not delete them
  // during rollback. A reviewed data migration is required for removal.
  console.warn('[20260813000000] down: 保留组织根部门，避免破坏业务数据。');
};
