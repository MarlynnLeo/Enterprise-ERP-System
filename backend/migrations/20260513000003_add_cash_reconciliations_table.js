exports.up = async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS reconciliations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      account_id INT NOT NULL,
      reconciliation_date DATE NOT NULL,
      bank_statement_balance DECIMAL(15,2) NOT NULL,
      book_balance DECIMAL(15,2) NOT NULL,
      difference DECIMAL(15,2) NOT NULL DEFAULT 0,
      status ENUM('draft', 'completed') NOT NULL DEFAULT 'draft',
      notes TEXT NULL,
      attachment VARCHAR(255) NULL,
      created_by INT NOT NULL,
      updated_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_reconciliation_account_date (account_id, reconciliation_date),
      INDEX idx_reconciliation_status (status),
      INDEX idx_reconciliation_created_by (created_by),
      FOREIGN KEY (account_id) REFERENCES bank_accounts(id) ON DELETE RESTRICT
    )
  `);
};

exports.down = async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS reconciliations');
};
