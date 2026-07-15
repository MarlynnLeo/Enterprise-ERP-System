/**
 * 财务完整性加固：
 * 1. AR/AP 来源单据幂等唯一索引
 * 2. 税务发票关联业务单据唯一索引
 */

async function addUniqueIndexIfMissing(knex, table, indexName, columnsSql) {
  const [rows] = await knex.raw(
    `SELECT COUNT(1) AS cnt
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND index_name = ?`,
    [table, indexName]
  );
  const count = Number(rows?.[0]?.cnt || rows?.[0]?.['cnt'] || 0);
  if (count > 0) return;

  await knex.raw(`ALTER TABLE \`${table}\` ADD UNIQUE INDEX \`${indexName}\` (${columnsSql})`);
}

exports.up = async function up(knex) {
  // 清理可能存在的重复来源数据（保留最小 id）
  await knex.raw(`
    DELETE a FROM ar_invoices a
    INNER JOIN ar_invoices b
      ON a.source_type = b.source_type
     AND a.source_id = b.source_id
     AND a.source_type IS NOT NULL
     AND a.source_id IS NOT NULL
     AND a.id > b.id
  `);

  await knex.raw(`
    DELETE a FROM ap_invoices a
    INNER JOIN ap_invoices b
      ON a.source_type = b.source_type
     AND a.source_id = b.source_id
     AND a.source_type IS NOT NULL
     AND a.source_id IS NOT NULL
     AND a.id > b.id
  `);

  await knex.raw(`
    DELETE a FROM tax_invoices a
    INNER JOIN tax_invoices b
      ON a.related_document_type = b.related_document_type
     AND a.related_document_id = b.related_document_id
     AND a.related_document_type IS NOT NULL
     AND a.related_document_id IS NOT NULL
     AND a.id > b.id
  `);

  await addUniqueIndexIfMissing(
    knex,
    'ar_invoices',
    'uk_ar_invoices_source',
    '`source_type`, `source_id`'
  );
  await addUniqueIndexIfMissing(
    knex,
    'ap_invoices',
    'uk_ap_invoices_source',
    '`source_type`, `source_id`'
  );
  await addUniqueIndexIfMissing(
    knex,
    'tax_invoices',
    'uk_tax_invoices_related_document',
    '`related_document_type`, `related_document_id`'
  );
};

exports.down = async function down(knex) {
  const drop = async (table, indexName) => {
    const [rows] = await knex.raw(
      `SELECT COUNT(1) AS cnt
       FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = ?
         AND index_name = ?`,
      [table, indexName]
    );
    if (Number(rows?.[0]?.cnt || 0) > 0) {
      await knex.raw(`ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\``);
    }
  };

  await drop('ar_invoices', 'uk_ar_invoices_source');
  await drop('ap_invoices', 'uk_ap_invoices_source');
  await drop('tax_invoices', 'uk_tax_invoices_related_document');
};
