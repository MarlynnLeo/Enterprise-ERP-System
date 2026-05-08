/**
 * Allow regenerating a voucher for the same business document after the
 * original voucher has been reversed, while still keeping at most one active
 * voucher per document.
 */

async function hasColumn(knex, columnName) {
  const [rows] = await knex.raw(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'gl_entries'
        AND COLUMN_NAME = ?
    `,
    [columnName]
  );
  return rows.length > 0;
}

async function hasIndex(knex, indexName) {
  const [rows] = await knex.raw(
    `
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'gl_entries'
        AND INDEX_NAME = ?
    `,
    [indexName]
  );
  return rows.length > 0;
}

exports.up = async function(knex) {
  const [duplicates] = await knex.raw(`
    SELECT document_type, document_number, COUNT(*) AS cnt
    FROM gl_entries
    WHERE document_type IS NOT NULL
      AND document_number IS NOT NULL
      AND COALESCE(is_reversed, 0) = 0
    GROUP BY document_type, document_number
    HAVING COUNT(*) > 1
    LIMIT 1
  `);

  if (duplicates.length > 0) {
    const duplicate = duplicates[0];
    throw new Error(
      `存在重复的有效业务凭证，无法调整唯一约束: ${duplicate.document_type}/${duplicate.document_number}`
    );
  }

  if (await hasIndex(knex, 'uq_document')) {
    await knex.raw('ALTER TABLE gl_entries DROP INDEX uq_document');
  }

  if (!(await hasColumn(knex, 'active_document_number'))) {
    await knex.raw(`
      ALTER TABLE gl_entries
      ADD COLUMN active_document_number VARCHAR(50)
      GENERATED ALWAYS AS (
        CASE
          WHEN COALESCE(is_reversed, 0) = 0 THEN document_number
          ELSE NULL
        END
      ) STORED
      AFTER document_number
    `);
  }

  if (!(await hasIndex(knex, 'uq_active_document'))) {
    await knex.raw(
      'ALTER TABLE gl_entries ADD UNIQUE INDEX uq_active_document (document_type, active_document_number)'
    );
  }
};

exports.down = async function(knex) {
  if (await hasIndex(knex, 'uq_active_document')) {
    await knex.raw('ALTER TABLE gl_entries DROP INDEX uq_active_document');
  }

  if (await hasColumn(knex, 'active_document_number')) {
    await knex.raw('ALTER TABLE gl_entries DROP COLUMN active_document_number');
  }

  if (!(await hasIndex(knex, 'uq_document'))) {
    await knex.raw('ALTER TABLE gl_entries ADD UNIQUE INDEX uq_document (document_type, document_number)');
  }
};
