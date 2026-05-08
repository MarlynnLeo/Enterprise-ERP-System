exports.up = async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS bank_statement_imports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      bank_account_id INT NOT NULL,
      statement_start_date DATE NULL,
      statement_end_date DATE NULL,
      file_name VARCHAR(255) NULL,
      imported_by INT NULL,
      imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_statement_import_account (bank_account_id),
      INDEX idx_statement_import_dates (statement_start_date, statement_end_date),
      FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE RESTRICT
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS bank_statement_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      import_id INT NOT NULL,
      bank_account_id INT NOT NULL,
      transaction_date DATE NOT NULL,
      transaction_type VARCHAR(20) NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      summary VARCHAR(500) NULL,
      reference_number VARCHAR(100) NULL,
      counterparty VARCHAR(100) NULL,
      balance DECIMAL(15,2) NULL,
      status ENUM('unmatched', 'matched') NOT NULL DEFAULT 'unmatched',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_statement_item_import (import_id),
      INDEX idx_statement_item_account_date (bank_account_id, transaction_date),
      INDEX idx_statement_item_status (status),
      FOREIGN KEY (import_id) REFERENCES bank_statement_imports(id) ON DELETE CASCADE,
      FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE RESTRICT
    )
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS bank_reconciliation_matches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      statement_item_id INT NOT NULL,
      bank_transaction_id INT NOT NULL,
      matched_by INT NULL,
      matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_statement_transaction_match (statement_item_id, bank_transaction_id),
      INDEX idx_match_statement_item (statement_item_id),
      INDEX idx_match_bank_transaction (bank_transaction_id),
      FOREIGN KEY (statement_item_id) REFERENCES bank_statement_items(id) ON DELETE CASCADE,
      FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions(id) ON DELETE RESTRICT
    )
  `);
};

exports.down = async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS bank_reconciliation_matches');
  await knex.raw('DROP TABLE IF EXISTS bank_statement_items');
  await knex.raw('DROP TABLE IF EXISTS bank_statement_imports');
};
