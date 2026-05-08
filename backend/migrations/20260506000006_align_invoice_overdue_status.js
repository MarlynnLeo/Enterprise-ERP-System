/**
 * Align AR/AP overdue invoice status with frontend and finance constants.
 */

async function tableExists(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function columnExists(knex, tableName, columnName) {
  return knex.schema.hasColumn(tableName, columnName);
}

async function alignInvoiceStatus(knex, tableName, fromStatus, toStatus) {
  if (!(await tableExists(knex, tableName)) || !(await columnExists(knex, tableName, 'status'))) {
    return;
  }

  await knex.raw(`
    ALTER TABLE \`${tableName}\`
    MODIFY COLUMN status ENUM('草稿','已确认','部分付款','已付款','逾期','已逾期','已取消')
    DEFAULT '草稿'
  `);

  await knex(tableName)
    .where('status', fromStatus)
    .update({ status: toStatus });

  await knex.raw(`
    ALTER TABLE \`${tableName}\`
    MODIFY COLUMN status ENUM('草稿','已确认','部分付款','已付款','已逾期','已取消')
    DEFAULT '草稿'
  `);
}

exports.up = async function up(knex) {
  await alignInvoiceStatus(knex, 'ar_invoices', '逾期', '已逾期');
  await alignInvoiceStatus(knex, 'ap_invoices', '逾期', '已逾期');
};

exports.down = async function down(knex) {
  for (const tableName of ['ar_invoices', 'ap_invoices']) {
    if (!(await tableExists(knex, tableName)) || !(await columnExists(knex, tableName, 'status'))) {
      continue;
    }

    await knex.raw(`
    ALTER TABLE \`${tableName}\`
    MODIFY COLUMN status ENUM('草稿','已确认','部分付款','已付款','逾期','已逾期','已取消')
    DEFAULT '草稿'
  `);

    await knex(tableName)
      .where('status', '已逾期')
      .update({ status: '逾期' });

    await knex.raw(`
      ALTER TABLE \`${tableName}\`
      MODIFY COLUMN status ENUM('草稿','已确认','部分付款','已付款','逾期','已取消')
      DEFAULT '草稿'
    `);
  }
};
