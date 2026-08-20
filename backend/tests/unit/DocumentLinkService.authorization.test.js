/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../src/services/FileAccessService', () => ({
  assertBusinessObjectAccess: jest.fn(),
}));

jest.mock('../../src/services/PermissionService', () => ({
  getUserPermissions: jest.fn(),
}));

const { pool } = require('../../src/config/db');
const FileAccessService = require('../../src/services/FileAccessService');
const DocumentLinkService = require('../../src/services/business/DocumentLinkService');

function request(userPermissions = ['basedata:materials:view']) {
  return {
    user: { id: 7 },
    userPermissions,
  };
}

describe('DocumentLinkService authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FileAccessService.assertBusinessObjectAccess.mockResolvedValue(true);
  });

  test('createLink validates both endpoints before INSERT', async () => {
    const req = request(['*']);
    FileAccessService.assertBusinessObjectAccess
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(
      DocumentLinkService.createLink(
        {
          source_type: 'material',
          source_id: 10,
          target_type: 'bom',
          target_id: 20,
          link_type: 'related',
        },
        null,
        { req }
      )
    ).rejects.toMatchObject({
      code: 'DOCUMENT_LINK_ACCESS_DENIED',
      statusCode: 403,
    });

    expect(FileAccessService.assertBusinessObjectAccess).toHaveBeenCalledTimes(2);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('createLink checks endpoint feature permissions before object access', async () => {
    const req = request(['basedata:materials:view']);

    await expect(
      DocumentLinkService.createLink(
        {
          source_type: 'material',
          source_id: 10,
          target_type: 'finance_voucher',
          target_id: 20,
          link_type: 'reference',
        },
        null,
        { req }
      )
    ).rejects.toMatchObject({
      code: 'DOCUMENT_LINK_ACCESS_DENIED',
      statusCode: 403,
    });

    expect(FileAccessService.assertBusinessObjectAccess).toHaveBeenCalledTimes(1);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('deleteLink validates both stored endpoints before DELETE', async () => {
    pool.query.mockResolvedValueOnce([[
      {
        source_type: 'material',
        source_id: 10,
        target_type: 'bom',
        target_id: 20,
      },
    ]]);
    FileAccessService.assertBusinessObjectAccess
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(
      DocumentLinkService.deleteLink(99, { req: request(['*']) })
    ).rejects.toMatchObject({
      code: 'DOCUMENT_LINK_ACCESS_DENIED',
      statusCode: 403,
    });

    expect(FileAccessService.assertBusinessObjectAccess).toHaveBeenCalledTimes(2);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).toMatch(/^SELECT source_type/);
  });

  test('deleteLink returns not found without issuing DELETE', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    await expect(
      DocumentLinkService.deleteLink(404, { req: request() })
    ).rejects.toMatchObject({
      code: 'DOCUMENT_LINK_NOT_FOUND',
      statusCode: 404,
    });

    expect(FileAccessService.assertBusinessObjectAccess).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('getLinks checks the requested object and filters unauthorized related objects', async () => {
    pool.query
      .mockResolvedValueOnce([[
        {
          id: 1,
          target_type: 'bom',
          target_id: 20,
          target_code: 'B-20',
          link_type: 'related',
          remark: null,
          created_at: new Date(),
        },
      ]])
      .mockResolvedValueOnce([[]]);
    FileAccessService.assertBusinessObjectAccess
      .mockResolvedValueOnce(true) // requested material
      .mockResolvedValueOnce(false); // related BOM

    const links = await DocumentLinkService.getLinks('material', 10, {
      req: request(['*']),
      userPermissions: ['*'],
    });

    expect(links).toEqual([]);
    expect(FileAccessService.assertBusinessObjectAccess).toHaveBeenCalledTimes(2);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });
});
