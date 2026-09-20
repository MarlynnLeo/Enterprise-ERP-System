const migration = require('../../migrations/20260904000000_align_quality_reference_collations');

const UNICODE = 'utf8mb4_unicode_ci';
const MYSQL8 = 'utf8mb4_0900_ai_ci';

function database({
  referenceCollation = MYSQL8,
  receiptCollation = UNICODE,
  purchaseCollation = UNICODE,
  definition = '`reference_no` varchar(20) DEFAULT NULL',
  missingTables = [],
  duplicates = [],
  referenceCharset = 'utf8mb4',
} = {}) {
  const columns = [
    {
      tableName: 'quality_inspections',
      columnName: 'reference_no',
      charset: referenceCharset,
      collation: referenceCollation,
    },
    {
      tableName: 'purchase_orders',
      columnName: 'order_no',
      charset: 'utf8mb4',
      collation: purchaseCollation,
    },
    {
      tableName: 'outsourced_processing_receipts',
      columnName: 'receipt_no',
      charset: 'utf8mb4',
      collation: receiptCollation,
    },
  ].filter((column) => !missingTables.includes(column.tableName));
  const writes = [];
  const knex = {
    raw: jest.fn(async (sql, bindings) => {
      if (sql.includes('information_schema.COLUMNS')) return [columns];
      const tableName = bindings?.[0] || sql.match(/^ALTER TABLE `(\w+)`/)?.[1];
      const column = columns.find((item) => item.tableName === tableName);
      if (sql === 'SHOW CREATE TABLE ??') {
        const declaration =
          column.tableName === 'quality_inspections'
            ? definition
            : `\`${column.columnName}\` varchar(50) NOT NULL`;
        return [
          [
            {
              'Create Table':
                `CREATE TABLE \`${column.tableName}\` (\n  ${declaration},\n` +
                `  UNIQUE KEY \`document_number\` (\`${column.columnName}\`)\n` +
                `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=${column.collation}`,
            },
          ],
        ];
      }
      if (sql.includes('HAVING COUNT(*) > 1')) {
        return [duplicates.includes(column.tableName) ? [{ duplicateCount: 2 }] : []];
      }
      if (sql.startsWith('ALTER TABLE')) {
        writes.push({ sql, table: tableName });
        column.collation = sql.match(/ COLLATE (\w+)/)[1];
        return [{}];
      }
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };
  return { knex, writes };
}

describe('quality reference collation compatibility migration', () => {
  it('changes only the mismatched reference column and is idempotent', async () => {
    const db = database();

    await migration.up(db.knex);
    await migration.up(db.knex);

    expect(db.writes).toEqual([
      {
        table: 'quality_inspections',
        sql:
          'ALTER TABLE `quality_inspections` MODIFY COLUMN `reference_no` varchar(20) ' +
          'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL',
      },
    ]);
    expect(db.knex.raw.mock.calls.some(([sql]) => /DROP|ADD.*INDEX|CONVERT TO/i.test(sql))).toBe(
      false
    );
    expect(migration.config).toEqual({ transaction: false });
  });

  it('preserves type, non-null defaults, comments and visibility verbatim', async () => {
    const suffix =
      " NOT NULL DEFAULT 'A, COLLATE old' INVISIBLE COMMENT 'owner\\'s CHARACTER SET old'";
    const db = database({
      definition:
        '`reference_no` varchar(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci' + suffix,
    });

    await migration.up(db.knex);

    expect(db.writes[0].sql).toBe(
      'ALTER TABLE `quality_inspections` MODIFY COLUMN `reference_no` varchar(96) ' +
        'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci' +
        suffix
    );
  });

  it('preserves literal question marks without treating them as Knex bindings', async () => {
    const db = database({ definition: "`reference_no` varchar(20) DEFAULT '?' COMMENT 'Why ??'" });
    const compiler = require('knex')({ client: 'mysql2' });
    try {
      await migration.up(db.knex);
      const call = db.knex.raw.mock.calls.find(([sql]) => sql.startsWith('ALTER TABLE'));
      expect(compiler.raw(...call).toSQL()).toMatchObject({
        sql: expect.stringContaining("DEFAULT '?' COMMENT 'Why ??'"),
        bindings: [],
      });
    } finally {
      await compiler.destroy();
    }
  });

  it('uses existing source collation without imposing a database-wide default', async () => {
    const db = database({
      referenceCollation: UNICODE,
      receiptCollation: MYSQL8,
      purchaseCollation: MYSQL8,
    });

    await migration.up(db.knex);

    expect(db.writes).toHaveLength(1);
    expect(db.writes[0].sql).toContain('COLLATE utf8mb4_0900_ai_ci');
  });

  it('uses the outsourced source when purchase orders are absent', async () => {
    const db = database({ missingTables: ['purchase_orders'] });
    await migration.up(db.knex);
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0].table).toBe('quality_inspections');
  });

  it.each([['quality_inspections'], ['purchase_orders', 'outsourced_processing_receipts']])(
    'does nothing when the comparison has no counterpart: %j',
    async (...missingTables) => {
      const db = database({ missingTables });
      await migration.up(db.knex);
      expect(db.writes).toEqual([]);
    }
  );

  it('checks changed source keys for collisions before modifying any column', async () => {
    const db = database({
      receiptCollation: MYSQL8,
      duplicates: ['outsourced_processing_receipts'],
    });

    await expect(migration.up(db.knex)).rejects.toThrow(/document numbers collide/);

    expect(db.writes).toEqual([]);
    expect(db.knex.raw).toHaveBeenCalledWith(
      expect.stringContaining('GROUP BY ?? COLLATE utf8mb4_unicode_ci'),
      ['outsourced_processing_receipts', 'receipt_no', 'receipt_no']
    );
  });

  it('keeps source nullability and only modifies its column when keys remain unique', async () => {
    const db = database({ referenceCollation: UNICODE, receiptCollation: MYSQL8 });
    await migration.up(db.knex);
    expect(db.writes).toEqual([
      {
        table: 'outsourced_processing_receipts',
        sql:
          'ALTER TABLE `outsourced_processing_receipts` MODIFY COLUMN `receipt_no` varchar(50) ' +
          'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL',
      },
    ]);
  });

  it('refuses character-set conversion before any DDL', async () => {
    const db = database({ referenceCharset: 'latin1' });
    await expect(migration.up(db.knex)).rejects.toThrow(/refusing a lossy conversion/);
    expect(db.writes).toEqual([]);
  });

  it('fails closed when the existing definition cannot be preserved', async () => {
    const db = database({ definition: '`reference_no` text DEFAULT NULL' });
    await expect(migration.up(db.knex)).rejects.toThrow(/Cannot preserve the definition/);
    expect(db.writes).toEqual([]);
  });

  it('does not reintroduce mixed comparison rules on rollback', async () => {
    const db = database();
    await migration.down(db.knex);
    expect(db.knex.raw).not.toHaveBeenCalled();
  });
});
