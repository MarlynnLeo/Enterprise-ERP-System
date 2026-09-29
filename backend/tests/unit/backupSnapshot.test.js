const fs = require('fs');
const os = require('os');
const path = require('path');

describe('BackupService consistent snapshot', () => {
  let directory, savedEnv, connection, pool, service;
  beforeEach(() => {
    jest.resetModules();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-backup-snapshot-'));
    savedEnv = { BACKUP_DIR: process.env.BACKUP_DIR, BACKUP_ENCRYPTION_MODE: process.env.BACKUP_ENCRYPTION_MODE };
    process.env.BACKUP_DIR = directory;
    process.env.BACKUP_ENCRYPTION_MODE = 'disabled';
    connection = {
      query: jest.fn(async sql => {
        if (/^(SET TRANSACTION|START TRANSACTION|SELECT 1)/.test(sql)) return [[]];
        if (sql.includes('information_schema.TABLES')) return [[{ table_name: 'sample', engine: 'InnoDB' }]];
        if (sql.startsWith('SHOW CREATE')) return [[{ 'Create Table': 'CREATE TABLE `sample` (`id` INT PRIMARY KEY)' }]];
        if (sql.startsWith('SHOW FULL')) return [[{ Field: 'id', Extra: '' }]];
        if (sql.startsWith('SHOW INDEX')) return [[{ Seq_in_index: 1, Column_name: 'id' }]];
        if (sql.startsWith('SELECT `id`')) return [[{ id: 1 }]];
        throw new Error('Unexpected query: ' + sql);
      }),
      commit: jest.fn(async () => {}), rollback: jest.fn(async () => {}), release: jest.fn(),
    };
    pool = {
      getConnection: jest.fn(async () => connection),
      query: jest.fn(async sql => {
        if (/^\s*(CREATE TABLE|INSERT INTO|DELETE FROM)/.test(sql)) return [{ affectedRows: 1 }];
        if (sql.includes('FROM system_backups')) return [[]];
        throw new Error('Snapshot escaped onto pool: ' + sql);
      }),
    };
    jest.doMock('../../src/config/db', () => ({ pool }));
    service = require('../../src/services/system/BackupService');
  });
  afterEach(() => {
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    const relative = path.relative(os.tmpdir(), directory);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !relative.startsWith('erp-backup-snapshot-')) throw new Error('Unsafe cleanup path');
    fs.rmSync(directory, { recursive: true, force: true });
    jest.dontMock('../../src/config/db');
  });

  test('reads schema and rows on one read-only repeatable-read connection', async () => {
    const result = await service.createBackup(7);
    expect(connection.query.mock.calls.slice(0, 2).map(([sql]) => sql)).toEqual([
      'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',
      'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY',
    ]);
    expect(connection.query).toHaveBeenCalledWith('SELECT 1 FROM `sample` LIMIT 0');
    expect(connection.query).toHaveBeenCalledWith('SELECT `id` FROM `sample` ORDER BY `id` LIMIT 1000 OFFSET 0');
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
    const sql = fs.readFileSync(path.join(directory, result.filename), 'utf8');
    expect(sql).toContain('INSERT INTO `sample` (`id`) VALUES\n(1);');
    expect(fs.existsSync(path.join(directory, result.filename + '.sha256'))).toBe(true);
  });

  test.each(['query failure', 'nontransactional table'])('%s rolls back and removes partial files', async reason => {
    const query = connection.query.getMockImplementation();
    connection.query.mockImplementation(async sql => {
      if (reason === 'query failure' && sql.startsWith('SELECT `id`')) throw new Error('read failed');
      if (reason === 'nontransactional table' && sql.includes('information_schema.TABLES')) return [[{ table_name: 'sample', engine: 'MyISAM' }]];
      return query(sql);
    });
    await expect(service.createBackup(7)).rejects.toThrow(reason === 'query failure' ? 'read failed' : 'InnoDB');
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync(directory)).toEqual([]);
  });
});
