const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

describe('BackupService.verifyBackup', () => {
  let tempDir;
  let originalBackupDir;
  let originalRetentionCount;

  beforeEach(() => {
    jest.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-backup-'));
    originalBackupDir = process.env.BACKUP_DIR;
    originalRetentionCount = process.env.BACKUP_RETENTION_COUNT;
    process.env.BACKUP_DIR = tempDir;
  });

  afterEach(() => {
    if (originalBackupDir === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = originalBackupDir;
    if (originalRetentionCount === undefined) delete process.env.BACKUP_RETENTION_COUNT;
    else process.env.BACKUP_RETENTION_COUNT = originalRetentionCount;
    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.dontMock('../../src/config/db');
  });

  function loadServiceFor(content, overrides = {}) {
    const filename = 'backup_20260627000000.sql';
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, content, 'utf8');
    const stats = fs.statSync(filePath);
    const record = {
      filename,
      file_path: filePath,
      file_size: stats.size,
      checksum: sha256(content),
      status: 'success',
      ...overrides,
    };

    jest.doMock('../../src/config/db', () => ({
      pool: {
        query: jest.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([[record]]),
      },
    }));

    return require('../../src/services/system/BackupService');
  }

  it('validates checksum and generated SQL restore structure', async () => {
    const sql = [
      '-- ERP database backup',
      'SET FOREIGN_KEY_CHECKS=0;',
      'DROP TABLE IF EXISTS `sample`;',
      'CREATE TABLE `sample` (`id` int primary key);',
      'INSERT INTO `sample` (`id`) VALUES',
      '(1);',
      'SET FOREIGN_KEY_CHECKS=1;',
      '',
    ].join('\n');
    const service = loadServiceFor(sql);

    const result = await service.verifyBackup('backup_20260627000000.sql');

    expect(result.valid).toBe(true);
    expect(result.table_count).toBe(1);
    expect(result.insert_count).toBe(1);
    expect(result.checks.every((check) => check.ok)).toBe(true);
  });

  it('reports checksum mismatches as invalid', async () => {
    const sql = [
      'SET FOREIGN_KEY_CHECKS=0;',
      'CREATE TABLE `sample` (`id` int primary key);',
      'SET FOREIGN_KEY_CHECKS=1;',
      '',
    ].join('\n');
    const service = loadServiceFor(sql, { checksum: 'bad-checksum' });

    const result = await service.verifyBackup('backup_20260627000000.sql');

    expect(result.valid).toBe(false);
    expect(result.checks.find((check) => check.name === 'checksum_matches_record').ok).toBe(false);
  });

  it('removes backup files beyond the configured retention count', async () => {
    process.env.BACKUP_RETENTION_COUNT = '1';
    const latestPath = path.join(tempDir, 'backup_latest.sql');
    const expiredPath = path.join(tempDir, 'backup_expired.sql');
    fs.writeFileSync(latestPath, 'latest', 'utf8');
    fs.writeFileSync(expiredPath, 'expired', 'utf8');
    fs.writeFileSync(`${expiredPath}.sha256`, 'checksum', 'utf8');

    const query = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([[
        { id: 1, filename: 'backup_latest.sql', file_path: latestPath, created_at: new Date() },
        { id: 2, filename: 'backup_expired.sql', file_path: expiredPath, created_at: new Date() },
      ]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 0 }]);
    jest.doMock('../../src/config/db', () => ({ pool: { query } }));
    const service = require('../../src/services/system/BackupService');

    const result = await service.pruneBackups();

    expect(result.deleted).toBe(1);
    expect(fs.existsSync(latestPath)).toBe(true);
    expect(fs.existsSync(expiredPath)).toBe(false);
    expect(fs.existsSync(`${expiredPath}.sha256`)).toBe(false);
  });
});
