const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2');
const { pool } = require('../../config/db');

const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '../../../backups'));

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function formatSqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`;
  if (value instanceof Date) {
    return mysql.escape(value.toISOString().slice(0, 19).replace('T', ' '));
  }
  return mysql.escape(value);
}

async function ensureBackupTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_backups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      file_path VARCHAR(1000) NOT NULL,
      file_size BIGINT NOT NULL DEFAULT 0,
      checksum VARCHAR(64),
      status ENUM('success','failed') NOT NULL DEFAULT 'success',
      message TEXT,
      created_by INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_created_at (created_at),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统数据库备份记录'
  `);
}

async function writeLine(stream, line = '') {
  if (!stream.write(`${line}\n`)) {
    await new Promise((resolve) => stream.once('drain', resolve));
  }
}

async function dumpTable(stream, tableName) {
  const quotedTable = quoteIdentifier(tableName);
  const [[createRow]] = await pool.query(`SHOW CREATE TABLE ${quotedTable}`);
  const createSql = createRow['Create Table'];

  await writeLine(stream, `DROP TABLE IF EXISTS ${quotedTable};`);
  await writeLine(stream, `${createSql};`);
  await writeLine(stream);

  const [rows] = await pool.query(`SELECT * FROM ${quotedTable}`);
  if (rows.length === 0) {
    await writeLine(stream);
    return;
  }

  const columns = Object.keys(rows[0]);
  const quotedColumns = columns.map(quoteIdentifier).join(', ');
  const batchSize = 200;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = batch.map((row) => {
      const rowValues = columns.map((column) => formatSqlValue(row[column])).join(', ');
      return `(${rowValues})`;
    });
    await writeLine(stream, `INSERT INTO ${quotedTable} (${quotedColumns}) VALUES`);
    await writeLine(stream, `${values.join(',\n')};`);
  }

  await writeLine(stream);
}

class BackupService {
  async createBackup(createdBy) {
    await ensureBackupTable();
    await fs.promises.mkdir(BACKUP_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const filename = `backup_${timestamp}.sql`;
    const filePath = path.join(BACKUP_DIR, filename);
    const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });

    try {
      await writeLine(stream, '-- ERP database backup');
      await writeLine(stream, `-- Created at: ${new Date().toISOString()}`);
      await writeLine(stream, 'SET FOREIGN_KEY_CHECKS=0;');
      await writeLine(stream);

      const [tables] = await pool.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
      const tableNameKey = Object.keys(tables[0] || {}).find((key) => key.startsWith('Tables_in_'));
      const tableNames = tableNameKey ? tables.map((row) => row[tableNameKey]) : [];

      for (const tableName of tableNames) {
        await dumpTable(stream, tableName);
      }

      await writeLine(stream, 'SET FOREIGN_KEY_CHECKS=1;');
      await new Promise((resolve, reject) => stream.end((error) => (error ? reject(error) : resolve())));

      const fileBuffer = await fs.promises.readFile(filePath);
      const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      const fileSize = fileBuffer.length;

      await pool.query(
        `INSERT INTO system_backups (filename, file_path, file_size, checksum, status, created_by)
         VALUES (?, ?, ?, ?, 'success', ?)`,
        [filename, filePath, fileSize, checksum, createdBy || null]
      );

      return { filename, file_size: fileSize, checksum };
    } catch (error) {
      stream.destroy();
      try {
        await fs.promises.unlink(filePath);
      } catch {
        // ignore cleanup errors
      }
      await pool.query(
        `INSERT INTO system_backups (filename, file_path, file_size, status, message, created_by)
         VALUES (?, ?, 0, 'failed', ?, ?)`,
        [filename, filePath, error.message, createdBy || null]
      );
      throw error;
    }
  }

  async listBackups() {
    await ensureBackupTable();
    const [rows] = await pool.query(
      `SELECT id, filename, file_size, checksum, status, message, created_by, created_at
       FROM system_backups
       ORDER BY created_at DESC
       LIMIT 50`
    );
    return rows;
  }

  async getBackupFile(filename) {
    await ensureBackupTable();
    const safeFilename = path.basename(filename);
    if (safeFilename !== filename) {
      throw new Error('invalid backup filename');
    }

    const [[backup]] = await pool.query(
      'SELECT * FROM system_backups WHERE filename = ? AND status = "success" LIMIT 1',
      [safeFilename]
    );
    if (!backup) {
      throw new Error('NOT_FOUND: backup not found');
    }

    const resolvedPath = path.resolve(backup.file_path);
    const relativePath = path.relative(BACKUP_DIR, resolvedPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error('invalid backup path');
    }

    await fs.promises.access(resolvedPath, fs.constants.R_OK);
    return { ...backup, file_path: resolvedPath };
  }
}

module.exports = new BackupService();
