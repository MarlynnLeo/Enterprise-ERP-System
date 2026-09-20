'use strict';

/**
 * Align only the document numbers compared by the quality source repair.
 *
 * This intentionally sorts before 20260904000001 so fresh installations can
 * execute that immutable migration on MySQL 8. Existing deployments also run
 * this previously unseen filename as a pending compatibility migration.
 * The purchase document number is the canonical comparison; do not change
 * database/table defaults or recreate column definitions from guessed types.
 */

const REFERENCES = [
  ['quality_inspections', 'reference_no'],
  ['purchase_orders', 'order_no'],
  ['outsourced_processing_receipts', 'receipt_no'],
];

exports.up = async function up(knex) {
  const [columns] = await knex.raw(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName,
            CHARACTER_SET_NAME AS charset, COLLATION_NAME AS collation
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND (${REFERENCES.map(() => '(TABLE_NAME = ? AND COLUMN_NAME = ?)').join(' OR ')})`,
    REFERENCES.flat()
  );
  const findColumn = (table, column) =>
    columns.find((item) => item.tableName === table && item.columnName === column);
  const reference = findColumn(...REFERENCES[0]);
  const canonical = findColumn(...REFERENCES[1]) || findColumn(...REFERENCES[2]);
  if (!reference || !canonical) return;

  const { charset, collation } = canonical;
  if (!/^[a-z0-9_]+$/i.test(charset || '') || !/^[a-z0-9_]+$/i.test(collation || '')) {
    throw new Error('Quality document numbers require a character-set collation');
  }
  // Collation repair must never silently convert or truncate character data.
  if (columns.some((column) => column.charset !== charset)) {
    throw new Error('Quality document number character sets differ; refusing a lossy conversion');
  }

  const plans = [];
  for (const column of columns) {
    if (column.collation === collation) continue;
    const [rows] = await knex.raw('SHOW CREATE TABLE ??', [column.tableName]);
    const createTable = rows[0]?.['Create Table'];
    const definition = createTable
      ?.split(/\r?\n/)
      .find((line) => line.trimStart().startsWith(`\`${column.columnName}\` `))
      ?.trim()
      .replace(/,$/, '');
    const prefix = new RegExp(
      `^(\`${column.columnName}\`\\s+(?:var)?char\\(\\d+\\))` +
        '(?:\\s+CHARACTER SET\\s+\\w+)?(?:\\s+COLLATE\\s+\\w+)?(?=\\s|$)',
      'i'
    );
    if (!definition || !prefix.test(definition)) {
      throw new Error(`Cannot preserve the definition of ${column.tableName}.${column.columnName}`);
    }
    // Keep nullability, literal/expression defaults, comments, visibility and
    // every other suffix exactly as emitted by MySQL. MODIFY retains indexes.
    plans.push({
      ...column,
      definition: definition.replace(prefix, `$1 CHARACTER SET ${charset} COLLATE ${collation}`),
    });
  }

  // Source document numbers are unique business keys. Check all changes before
  // DDL so a different equality rule cannot merge existing document numbers.
  for (const plan of plans.filter((column) => column.tableName !== 'quality_inspections')) {
    const [duplicates] = await knex.raw(
      `SELECT COUNT(*) AS duplicateCount FROM ??
        WHERE ?? IS NOT NULL
        GROUP BY ?? COLLATE ${collation}
        HAVING COUNT(*) > 1 LIMIT 1`,
      [plan.tableName, plan.columnName, plan.columnName]
    );
    if (duplicates.length) {
      throw new Error(
        `Cannot align ${plan.tableName}.${plan.columnName}: document numbers collide under ${collation}`
      );
    }
  }

  for (const plan of plans) {
    // Names come only from REFERENCES. Supplying no positional bindings also
    // keeps question marks in SHOW CREATE defaults/comments as literal text.
    await knex.raw(`ALTER TABLE \`${plan.tableName}\` MODIFY COLUMN ${plan.definition}`);
  }
};

exports.down = async function down() {
  // Forward compatibility repair: restoring mixed collations breaks joins.
};

exports.config = { transaction: false };
