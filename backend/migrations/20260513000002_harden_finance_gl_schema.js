/**
 * Harden finance GL schema
 * @description Bring columns used by the finance code into Knex migrations so fresh installs
 * do not depend on old ad-hoc SQL files or runtime ALTER TABLE behavior.
 */

async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function hasColumn(knex, tableName, columnName) {
  return knex.schema.hasColumn(tableName, columnName);
}

async function addColumnIfMissing(knex, tableName, columnName, definition) {
  if (await hasTable(knex, tableName)) {
    if (!(await hasColumn(knex, tableName, columnName))) {
      await knex.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
    }
  }
}

async function dropColumnIfExists(knex, tableName, columnName) {
  if (await hasTable(knex, tableName)) {
    if (await hasColumn(knex, tableName, columnName)) {
      await knex.raw(`ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``);
    }
  }
}

exports.up = async function up(knex) {
  await addColumnIfMissing(
    knex,
    'gl_accounts',
    'currency_code',
    "VARCHAR(10) DEFAULT 'CNY' AFTER `is_active`"
  );
  await addColumnIfMissing(knex, 'gl_accounts', 'description', 'TEXT NULL AFTER `currency_code`');
  await addColumnIfMissing(
    knex,
    'gl_accounts',
    'has_customer',
    'BOOLEAN DEFAULT false AFTER `description`'
  );
  await addColumnIfMissing(
    knex,
    'gl_accounts',
    'has_supplier',
    'BOOLEAN DEFAULT false AFTER `has_customer`'
  );
  await addColumnIfMissing(
    knex,
    'gl_accounts',
    'has_employee',
    'BOOLEAN DEFAULT false AFTER `has_supplier`'
  );
  await addColumnIfMissing(
    knex,
    'gl_accounts',
    'has_department',
    'BOOLEAN DEFAULT false AFTER `has_employee`'
  );
  await addColumnIfMissing(
    knex,
    'gl_accounts',
    'has_project',
    'BOOLEAN DEFAULT false AFTER `has_department`'
  );
  await addColumnIfMissing(
    knex,
    'gl_accounts',
    'opening_debit',
    'DECIMAL(15,2) DEFAULT 0 AFTER `has_project`'
  );
  await addColumnIfMissing(
    knex,
    'gl_accounts',
    'opening_credit',
    'DECIMAL(15,2) DEFAULT 0 AFTER `opening_debit`'
  );
  await addColumnIfMissing(
    knex,
    'gl_accounts',
    'opening_balance_date',
    'DATE NULL AFTER `opening_credit`'
  );
  await addColumnIfMissing(
    knex,
    'gl_accounts',
    'opening_balance_set',
    'BOOLEAN DEFAULT false AFTER `opening_balance_date`'
  );

  await addColumnIfMissing(
    knex,
    'gl_entry_items',
    'line_number',
    'INT NOT NULL DEFAULT 1 AFTER `entry_id`'
  );

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS gl_opening_balance_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      account_id INT NOT NULL,
      opening_debit DECIMAL(15,2) DEFAULT 0,
      opening_credit DECIMAL(15,2) DEFAULT 0,
      balance_date DATE NOT NULL,
      set_by INT DEFAULT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_gl_opening_account (account_id),
      INDEX idx_gl_opening_balance_date (balance_date),
      CONSTRAINT fk_gl_opening_balance_account
        FOREIGN KEY (account_id) REFERENCES gl_accounts(id) ON DELETE CASCADE
    )
  `);
};

exports.down = async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS gl_opening_balance_history');
  await dropColumnIfExists(knex, 'gl_entry_items', 'line_number');

  const glAccountColumns = [
    'opening_balance_set',
    'opening_balance_date',
    'opening_credit',
    'opening_debit',
    'has_project',
    'has_department',
    'has_employee',
    'has_supplier',
    'has_customer',
    'description',
    'currency_code',
  ];

  for (const column of glAccountColumns) {
    await dropColumnIfExists(knex, 'gl_accounts', column);
  }
};
