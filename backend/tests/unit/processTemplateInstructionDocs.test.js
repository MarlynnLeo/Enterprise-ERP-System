/* global beforeEach, describe, expect, jest, test */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));

const { pool } = require('../../src/config/db');
const service = require('../../src/services/processTemplateService');

const input = (url = '/uploads/file-safe.pdf', extra = {}) => ({
  product_id: 8, name: '受控工艺', version: 'V2', created_by: 5,
  details: [{ name: '装配', order_num: 1, standard_hours: 0.1,
    instruction_docs: [{ name: '作业书.pdf', url }] }],
  ...extra,
});

describe('process version controlled documents', () => {
  let connection, record, savedDetails;
  const sourceDocs = [{ name: '旧版作业书.pdf', url: '/uploads/file-safe.pdf' }];

  beforeEach(() => {
    record = { id: 9, business_type: null, business_id: null, uploaded_by: 5, deleted_at: null };
    savedDetails = [];
    connection = {
      beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
      query: jest.fn(async (sql, params) => {
        if (sql.startsWith('SELECT id FROM materials')) return [[{ id: 8 }]];
        if (sql.includes('INSERT INTO process_templates')) return [{ insertId: 77 }];
        if (sql.includes('DELETE FROM process_template_details')) return [{ affectedRows: 0 }];
        if (sql.includes('INSERT INTO process_template_details')) {
          savedDetails.push({ template_id: params[0], name: params[1], order_num: params[2],
            standard_hours: params[4], instruction_docs: params[7], sop_images: params[11], materials: params[12] });
          return [{ insertId: 1 }];
        }
        if (sql.includes('SELECT pt.*')) return [[{ id: params[0], product_id: 8, name: '受控工艺', version: params[0] === 55 ? 'V1' : 'V2', status: 0 }]];
        if (sql.includes('SELECT d.*')) return [params[0] === 55
          ? [{ instruction_docs: sourceDocs, sop_images: [], materials: [] }]
          : savedDetails];
        throw new Error('Unexpected query: ' + sql);
      }),
      execute: jest.fn(async sql => {
        if (sql.includes('FROM file_access_records')) return [record ? [record] : []];
        if (sql.includes('UPDATE file_access_records')) return [{ affectedRows: 1 }];
        throw new Error('Unexpected execute: ' + sql);
      }),
    };
    pool.getConnection.mockResolvedValue(connection);
  });

  test('binds a registered owner upload and persists normalized metadata', async () => {
    const result = await service.create(input());
    expect(result).toMatchObject({ id: 77, product_id: 8, version: 'V2' });
    expect(result.details[0].instruction_docs).toEqual([
      { name: '作业书.pdf', url: '/uploads/file-safe.pdf', upload_time: null },
    ]);
    expect(connection.execute).toHaveBeenCalledWith(
      expect.stringContaining("SET business_type = 'process_template'"), [77, 9]
    );
    expect(connection.commit).toHaveBeenCalled();
  });

  test('a copied version reuses registered source documents without rebinding the original', async () => {
    record.business_type = 'process_template';
    record.business_id = 55;
    const result = await service.create(input('/uploads/file-safe.pdf', { source_template_id: 55 }));
    expect(result.details[0].instruction_docs[0].url).toBe('/uploads/file-safe.pdf');
    expect(connection.execute.mock.calls.filter(([sql]) => sql.includes('SET business_type'))).toHaveLength(0);
    expect(connection.commit).toHaveBeenCalled();
  });

  test.each([
    ['https://external.invalid/page', 'INVALID_FILE_REFERENCE'],
    ['/uploads/not-registered.pdf', 'FILE_ACCESS_RECORD_NOT_FOUND'],
  ])('rejects an uncontrolled reference %s atomically', async (url, errorCode) => {
    record = null;
    await expect(service.create(input(url))).rejects.toMatchObject({ errorCode, httpStatus: 400 });
    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('rejects a document belonging to an unrelated version', async () => {
    record.business_type = 'process_template';
    record.business_id = 99;
    await expect(service.create(input())).rejects.toMatchObject({ errorCode: 'FILE_ACCESS_BINDING_CONFLICT' });
    expect(connection.rollback).toHaveBeenCalled();
  });

  test('rejects another user’s unbound upload', async () => {
    record.uploaded_by = 9;
    await expect(service.create(input())).rejects.toMatchObject({ errorCode: 'FILE_OWNER_MISMATCH' });
  });
});
