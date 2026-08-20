/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: {
    getConnection: jest.fn(),
  },
}));
jest.mock('../../src/utils/softDelete', () => ({ softDelete: jest.fn() }));

const { pool } = require('../../src/config/db');
const service = require('../../src/services/processTemplateService');

function connectionDouble() {
  return {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
    query: jest.fn(),
    execute: jest.fn(),
  };
}

describe('process template instruction document persistence', () => {
  let connection;

  beforeEach(() => {
    connection = connectionDouble();
    pool.getConnection.mockResolvedValue(connection);
  });

  test('persists controlled files and binds an owner upload to the new template', async () => {
    connection.query
      .mockResolvedValueOnce([{ insertId: 77 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    connection.execute
      .mockResolvedValueOnce([[
        { id: 9, business_type: null, business_id: null, uploaded_by: 5, deleted_at: null },
      ]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 0 }]);

    await expect(service.create({
      name: '受控工序',
      created_by: 5,
      details: [{
        name: '装配',
        instruction_docs: [{ name: '作业书.pdf', url: '/uploads/file-safe.pdf' }],
      }],
    })).resolves.toMatchObject({ id: 77 });

    const detailInsert = connection.query.mock.calls[1];
    expect(detailInsert[0]).toContain('instruction_docs');
    expect(JSON.parse(detailInsert[1][7])).toEqual([
      { name: '作业书.pdf', url: '/uploads/file-safe.pdf', uploadTime: null },
    ]);
    expect(connection.execute.mock.calls[1][0]).toContain("business_type = 'process_template'");
  });

  test('rejects external or untracked instruction URLs atomically', async () => {
    connection.query.mockResolvedValueOnce([{ insertId: 78 }]);

    await expect(service.create({
      name: '恶意模板',
      created_by: 5,
      details: [{
        name: '装配',
        instruction_docs: [{ name: '外部页', url: 'https://attacker.invalid/page' }],
      }],
    })).rejects.toMatchObject({ code: 'INVALID_FILE_REFERENCE' });

    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
  });
});
