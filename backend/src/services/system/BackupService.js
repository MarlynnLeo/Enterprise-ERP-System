const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const mysql = require('mysql2');
const { pool } = require('../../config/db');
const {
  getEncryptionMode,
  isEncryptedBackup,
  encryptFile,
  decryptFile,
} = require('../../utils/backupCrypto');

const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '../../../backups'));
const BACKUP_RETENTION_DAYS = Math.max(1, Number.parseInt(process.env.BACKUP_RETENTION_DAYS, 10) || 30);
const BACKUP_RETENTION_COUNT = Math.max(1, Number.parseInt(process.env.BACKUP_RETENTION_COUNT, 10) || 30);

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function formatSqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`;
  if (value instanceof Date) {
    return mysql.escape(value.toISOString().slice(0, 19).replace('T', ' '));
  }
  if (typeof value === 'object') return mysql.escape(JSON.stringify(value));
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
      encrypted TINYINT(1) NOT NULL DEFAULT 0,
      encryption_algorithm VARCHAR(32) NULL,
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

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const readStream = fs.createReadStream(filePath);
    readStream.on('data', (chunk) => hash.update(chunk));
    readStream.on('end', () => resolve(hash.digest('hex')));
    readStream.on('error', reject);
  });
}

function isStatementBalanced(sql) {
  let quote = null;
  let escaped = false;
  let parenDepth = 0;

  for (const char of sql) {
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '\'' || char === '"') {
      quote = char;
    } else if (char === '(') {
      parenDepth += 1;
    } else if (char === ')') {
      parenDepth -= 1;
      if (parenDepth < 0) return false;
    }
  }

  return !quote && parenDepth === 0;
}

async function scanBackupSql(filePath) {
  const checks = {
    lineCount: 0,
    statementCount: 0,
    tableCount: 0,
    insertCount: 0,
    hasForeignKeyOff: false,
    hasForeignKeyOn: false,
    hasInvalidStatement: false,
    hasUnterminatedStatement: false,
  };
  let statement = '';

  const input = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  for await (const line of rl) {
    checks.lineCount += 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;

    statement += `${line}\n`;
    if (!trimmed.endsWith(';')) continue;

    const normalized = statement.trim();
    checks.statementCount += 1;
    checks.hasForeignKeyOff = checks.hasForeignKeyOff || /SET\s+FOREIGN_KEY_CHECKS\s*=\s*0/i.test(normalized);
    checks.hasForeignKeyOn = checks.hasForeignKeyOn || /SET\s+FOREIGN_KEY_CHECKS\s*=\s*1/i.test(normalized);
    if (/^CREATE\s+TABLE/i.test(normalized)) checks.tableCount += 1;
    if (/^INSERT\s+INTO/i.test(normalized)) checks.insertCount += 1;
    if (!isStatementBalanced(normalized)) checks.hasInvalidStatement = true;
    statement = '';
  }

  checks.hasUnterminatedStatement = statement.trim().length > 0;
  return checks;
}

async function dumpTable(stream, tableName) {
  const quotedTable = quoteIdentifier(tableName);
  const [[createRow]] = await pool.query(`SHOW CREATE TABLE ${quotedTable}`);
  const createSql = createRow['Create Table'];
  const [columnDefinitions] = await pool.query(`SHOW FULL COLUMNS FROM ${quotedTable}`);
  const columns = columnDefinitions
    .filter((column) => !/GENERATED/i.test(String(column.Extra || '')))
    .map((column) => column.Field);
  const quotedColumns = columns.map(quoteIdentifier).join(', ');

  await writeLine(stream, `DROP TABLE IF EXISTS ${quotedTable};`);
  await writeLine(stream, `${createSql};`);
  await writeLine(stream);

  // Generated columns are recreated by DDL and must not be present in INSERT statements.
  // 分页流式查询：每次取 FETCH_SIZE 行，避免大表一次性加载导致 OOM
  const FETCH_SIZE = 1000;
  const INSERT_BATCH = 200;
  let offset = 0;

  while (true) {
    const [batch] = await pool.query(
      `SELECT ${quotedColumns} FROM ${quotedTable} LIMIT ${FETCH_SIZE} OFFSET ${offset}`
    );

    if (batch.length === 0) {
      // 首批即为空 → 空表
      if (offset === 0) await writeLine(stream);
      break;
    }

    // 按 INSERT_BATCH 分组写入 INSERT 语句
    for (let i = 0; i < batch.length; i += INSERT_BATCH) {
      const slice = batch.slice(i, i + INSERT_BATCH);
      const values = slice.map((row) => {
        const rowValues = columns.map((column) => formatSqlValue(row[column])).join(', ');
        return `(${rowValues})`;
      });
      await writeLine(stream, `INSERT INTO ${quotedTable} (${quotedColumns}) VALUES`);
      await writeLine(stream, `${values.join(',\n')};`);
    }

    offset += batch.length;
    if (batch.length < FETCH_SIZE) break; // 最后一批
  }

  await writeLine(stream);
}

class BackupService {
  async pruneBackups() {
    await ensureBackupTable();
    const [rows] = await pool.query(
      `SELECT id, filename, file_path, created_at
       FROM system_backups
       WHERE status = 'success'
       ORDER BY created_at DESC, id DESC`
    );
    const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const expired = rows.filter(
      (row, index) => index >= BACKUP_RETENTION_COUNT || new Date(row.created_at).getTime() < cutoff
    );
    let deleted = 0;

    for (const backup of expired) {
      const resolvedPath = path.resolve(backup.file_path);
      const relativePath = path.relative(BACKUP_DIR, resolvedPath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) continue;

      for (const target of [resolvedPath, `${resolvedPath}.sha256`]) {
        try {
          await fs.promises.unlink(target);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      await pool.query('DELETE FROM system_backups WHERE id = ?', [backup.id]);
      deleted += 1;
    }

    await pool.query(
      `DELETE FROM system_backups
       WHERE status = 'failed' AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [BACKUP_RETENTION_DAYS]
    );
    return { deleted, retention_days: BACKUP_RETENTION_DAYS, retention_count: BACKUP_RETENTION_COUNT };
  }

  async createBackup(createdBy) {
    await ensureBackupTable();
    await fs.promises.mkdir(BACKUP_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 17);
    const encryptionMode = getEncryptionMode();
    if (process.env.NODE_ENV === 'production' && encryptionMode !== 'required') {
      throw new Error('Production backups must use BACKUP_ENCRYPTION_MODE=required');
    }
    const encrypted = encryptionMode !== 'disabled';
    const plainFilename = `backup_${timestamp}.sql`;
    const filename = encrypted ? `${plainFilename}.enc` : plainFilename;
    const plainPath = path.join(BACKUP_DIR, `${plainFilename}.tmp`);
    const filePath = path.join(BACKUP_DIR, filename);
    const checksumPath = `${filePath}.sha256`;
    const stream = fs.createWriteStream(plainPath, { encoding: 'utf8', mode: 0o600 });

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

      if (encrypted) {
        await encryptFile(plainPath, filePath);
        await fs.promises.unlink(plainPath);
      } else {
        await fs.promises.rename(plainPath, filePath);
      }

      // 流式计算文件哈希，避免大文件一次性读入内存
      const stats = await fs.promises.stat(filePath);
      const fileSize = stats.size;
      const checksum = await sha256File(filePath);
      await fs.promises.writeFile(checksumPath, `${checksum}  ${filename}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });

      await pool.query(
        `INSERT INTO system_backups
           (filename, file_path, file_size, checksum, status, encrypted, encryption_algorithm, created_by)
         VALUES (?, ?, ?, ?, 'success', ?, ?, ?)`,
        [filename, filePath, fileSize, checksum, encrypted ? 1 : 0, encrypted ? 'aes-256-gcm' : null, createdBy || null]
      );

      let retention;
      try {
        retention = await this.pruneBackups();
      } catch (error) {
        retention = { warning: error.message };
      }

      return {
        filename,
        file_size: fileSize,
        checksum,
        encrypted,
        encryption_algorithm: encrypted ? 'aes-256-gcm' : null,
        retention,
      };
    } catch (error) {
      stream.destroy();
      for (const target of [plainPath, filePath, checksumPath]) {
        try {
          await fs.promises.unlink(target);
        } catch {
          // ignore cleanup errors
        }
      }
      await pool.query(
        `INSERT INTO system_backups
           (filename, file_path, file_size, status, encrypted, encryption_algorithm, message, created_by)
         VALUES (?, ?, 0, 'failed', ?, ?, ?, ?)`,
        [filename, filePath, encrypted ? 1 : 0, encrypted ? 'aes-256-gcm' : null, error.message, createdBy || null]
      );
      throw error;
    }
  }

  async listBackups() {
    await ensureBackupTable();
    const [rows] = await pool.query(
      `SELECT id, filename, file_size, checksum, status, encrypted, encryption_algorithm, message, created_by, created_at
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
      'SELECT id, filename, file_path, file_size, checksum, status, encrypted, encryption_algorithm, message, created_by, created_at FROM system_backups WHERE filename = ? AND status = "success" LIMIT 1',
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

  async verifyBackup(filename) {
    const backup = await this.getBackupFile(filename);
    const stats = await fs.promises.stat(backup.file_path);
    const checksum = await sha256File(backup.file_path);
    let scanPath = backup.file_path;
    let temporaryPlainPath = null;
    const encrypted = Boolean(Number(backup.encrypted)) || await isEncryptedBackup(backup.file_path);
    if (encrypted) {
      temporaryPlainPath = path.join(BACKUP_DIR, `.verify_${crypto.randomUUID()}.sql`);
      try {
        await decryptFile(backup.file_path, temporaryPlainPath);
        scanPath = temporaryPlainPath;
      } catch (error) {
        await fs.promises.unlink(temporaryPlainPath).catch(() => {});
        return {
          filename: backup.filename,
          file_size: stats.size,
          checksum,
          valid: false,
          checks: [{ name: 'encrypted_backup_authentication', ok: false, error: error.message }],
        };
      }
    }
    const sqlScan = await scanBackupSql(scanPath);
    if (temporaryPlainPath) await fs.promises.unlink(temporaryPlainPath).catch(() => {});

    const checks = [
      {
        name: 'encrypted_backup_required_in_production',
        ok: process.env.NODE_ENV !== 'production' || encrypted,
      },
      {
        name: 'file_size_matches_record',
        ok: Number(stats.size) === Number(backup.file_size),
        expected: Number(backup.file_size),
        actual: Number(stats.size),
      },
      {
        name: 'checksum_matches_record',
        ok: !backup.checksum || checksum === backup.checksum,
        expected: backup.checksum || null,
        actual: checksum,
      },
      {
        name: 'foreign_key_checks_disabled_before_restore',
        ok: sqlScan.hasForeignKeyOff,
      },
      {
        name: 'foreign_key_checks_reenabled_after_restore',
        ok: sqlScan.hasForeignKeyOn,
      },
      {
        name: 'contains_table_definitions',
        ok: sqlScan.tableCount > 0,
        actual: sqlScan.tableCount,
      },
      {
        name: 'statements_are_complete',
        ok: !sqlScan.hasUnterminatedStatement,
      },
      {
        name: 'statements_are_balanced',
        ok: !sqlScan.hasInvalidStatement,
      },
    ];

    return {
      filename: backup.filename,
      file_size: stats.size,
      checksum,
      statement_count: sqlScan.statementCount,
      table_count: sqlScan.tableCount,
      insert_count: sqlScan.insertCount,
      valid: checks.every((check) => check.ok),
      checks,
    };
  }
}

module.exports = new BackupService();
