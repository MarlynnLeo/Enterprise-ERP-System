exports.up = async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS file_access_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      file_url VARCHAR(500) NOT NULL,
      business_type VARCHAR(50) NULL,
      business_id INT NULL,
      source VARCHAR(50) NOT NULL DEFAULT 'upload',
      uploaded_by INT NULL,
      is_public TINYINT(1) NOT NULL DEFAULT 0,
      metadata JSON NULL,
      deleted_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_file_access_url (file_url),
      INDEX idx_file_access_business (business_type, business_id),
      INDEX idx_file_access_deleted (deleted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Upload file object-level access metadata'
  `);

  await knex.raw(`
    INSERT IGNORE INTO file_access_records
      (file_url, business_type, business_id, source, uploaded_by, is_public, created_at, updated_at)
    SELECT file_url, business_type, business_id, 'documents', created_by, COALESCE(is_public, 0), NOW(), NOW()
    FROM documents
    WHERE file_url IS NOT NULL AND file_url <> '' AND deleted_at IS NULL
  `);

  await knex.raw(`
    INSERT IGNORE INTO file_access_records
      (file_url, business_type, business_id, source, uploaded_by, is_public, created_at, updated_at)
    SELECT file_path, 'material', material_id, 'material_attachments', uploader_id, 0, NOW(), NOW()
    FROM material_attachments
    WHERE file_path IS NOT NULL AND file_path <> ''
  `);
};

exports.down = async function down() {
  // Object access metadata is data repair and is intentionally kept.
};
