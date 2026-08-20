/* global describe, expect, jest, test, beforeEach, afterEach */

jest.mock('../../src/config/db', () => ({
  pool: {
    execute: jest.fn(),
    query: jest.fn(),
    getConnection: jest.fn(),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const { pool } = require('../../src/config/db');
const FileAccessService = require('../../src/services/FileAccessService');

function createConnection() {
  return {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
    execute: jest.fn(),
  };
}

describe('FileAccessService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('普通私有上传可以不绑定业务对象', async () => {
    const connection = createConnection();
    connection.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    pool.getConnection.mockResolvedValueOnce(connection);

    await expect(
      FileAccessService.recordUpload({
        fileUrl: '/uploads/private.txt',
        uploadedBy: 7,
        isPublic: 0,
      })
    ).resolves.toBe('/uploads/private.txt');

    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  test('不完整、非法或未知业务绑定失败关闭', () => {
    expect(FileAccessService.validateBusinessBinding('material', undefined)).toMatchObject({
      valid: false,
      reason: 'BUSINESS_BINDING_INCOMPLETE',
    });
    expect(FileAccessService.validateBusinessBinding('material', 'abc')).toMatchObject({
      valid: false,
      reason: 'BUSINESS_BINDING_INVALID',
    });
    expect(FileAccessService.validateBusinessBinding('unknown_domain', 1)).toMatchObject({
      valid: false,
      reason: 'BUSINESS_TYPE_UNSUPPORTED',
    });
    expect(FileAccessService.validateBusinessBinding('process_template', 1)).toMatchObject({
      valid: true,
      bound: true,
    });
  });

  test('public 标记不能绕过未知绑定或已删除业务对象', async () => {
    jest.spyOn(FileAccessService, 'findAccessRecord').mockResolvedValueOnce({
      file_url: '/uploads/unknown.txt',
      business_type: 'unknown_domain',
      business_id: 1,
      source: 'upload',
      is_public: 1,
      uploaded_by: 7,
    });

    await expect(
      FileAccessService.authorize({ userId: 7, fileUrl: '/uploads/unknown.txt', req: {} })
    ).resolves.toMatchObject({ allowed: false, reason: 'BUSINESS_TYPE_UNSUPPORTED' });

    jest.spyOn(FileAccessService, 'findAccessRecord').mockResolvedValueOnce({
      file_url: '/uploads/material.txt',
      business_type: 'material',
      business_id: 99,
      source: 'upload',
      is_public: 1,
      uploaded_by: 7,
    });
    pool.execute.mockResolvedValueOnce([[]]);

    await expect(
      FileAccessService.authorize({ userId: 7, fileUrl: '/uploads/material.txt', req: {} })
    ).resolves.toMatchObject({ allowed: false, reason: 'BUSINESS_OBJECT_NOT_FOUND' });
  });

  test('public 标记不能绕过业务类型查看权限', async () => {
    jest.spyOn(FileAccessService, 'findAccessRecord').mockResolvedValue({
      file_url: '/uploads/public-material.txt',
      business_type: 'material',
      business_id: 99,
      source: 'upload',
      is_public: 1,
      uploaded_by: 7,
    });
    jest.spyOn(FileAccessService, 'assertBusinessObjectExists').mockResolvedValue(true);
    const objectScope = jest.spyOn(FileAccessService, 'assertBusinessObjectAccess');

    await expect(
      FileAccessService.authorize({
        userId: 7,
        fileUrl: '/uploads/public-material.txt',
        req: {},
        userPermissions: ['system:files:download'],
      })
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'FEATURE_PERMISSION_DENIED',
      requiredPermissions: ['basedata:materials:view'],
    });

    await expect(
      FileAccessService.authorize({
        userId: 7,
        fileUrl: '/uploads/public-material.txt',
        req: {},
        userPermissions: ['basedata:materials:view'],
      })
    ).resolves.toMatchObject({ allowed: true });
    expect(objectScope).not.toHaveBeenCalled();
  });

  test('绑定已有上传前必须具有对应业务类型查看权限', async () => {
    const objectScope = jest.spyOn(FileAccessService, 'assertBusinessObjectAccess');

    await expect(
      FileAccessService.claimExistingUpload({
        req: { user: { id: 7 }, userPermissions: ['system:documents:create'] },
        userPermissions: ['system:documents:create'],
        fileUrl: '/uploads/private-material.txt',
        businessType: 'material',
        businessId: 10,
        uploadedBy: 7,
      })
    ).rejects.toMatchObject({ code: 'BUSINESS_TYPE_PERMISSION_DENIED' });
    expect(objectScope).not.toHaveBeenCalled();
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  test('不同用户或不同业务对象不能抢绑已有文件', async () => {
    const connection = createConnection();
    connection.execute.mockResolvedValueOnce([
      [
        {
          id: 1,
          business_type: 'material',
          business_id: 10,
          source: 'upload',
          uploaded_by: 8,
          deleted_at: null,
        },
      ],
    ]);
    pool.getConnection.mockResolvedValueOnce(connection);

    await expect(
      FileAccessService.recordUpload({
        fileUrl: '/uploads/existing.txt',
        businessType: 'material',
        businessId: 11,
        uploadedBy: 7,
      })
    ).rejects.toMatchObject({ code: 'FILE_ACCESS_BINDING_CONFLICT' });

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('批量登记任一失败时回滚整个事务并清理落盘文件', async () => {
    const connection = createConnection();
    connection.execute
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockRejectedValueOnce(new Error('metadata write failed'));
    pool.getConnection.mockResolvedValueOnce(connection);
    const cleanup = jest.spyOn(FileAccessService, 'removeLocalFiles').mockImplementation(() => {});
    const payloads = [
      { fileUrl: '/uploads/a.txt', uploadedBy: 7 },
      { fileUrl: '/uploads/b.txt', uploadedBy: 7 },
    ];

    await expect(FileAccessService.recordUploads(payloads)).rejects.toThrow('metadata write failed');
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledWith(['/uploads/a.txt', '/uploads/b.txt']);
  });

  test('未绑定文件仅上传者或文件管理员可删除', async () => {
    jest.spyOn(FileAccessService, 'findAccessRecord').mockResolvedValue({
      file_url: '/uploads/private.txt',
      business_type: null,
      business_id: null,
      source: 'upload',
      is_public: 0,
      uploaded_by: 7,
    });

    await expect(
      FileAccessService.authorizeMutation({
        userId: 7,
        fileUrl: '/uploads/private.txt',
        userPermissions: [],
      })
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      FileAccessService.authorizeMutation({
        userId: 8,
        fileUrl: '/uploads/private.txt',
        userPermissions: [],
      })
    ).resolves.toMatchObject({ allowed: false, reason: 'FILE_OWNER_DENIED' });
    await expect(
      FileAccessService.authorizeMutation({
        userId: 8,
        fileUrl: '/uploads/private.txt',
        userPermissions: ['system:files:manage'],
      })
    ).resolves.toMatchObject({ allowed: true });
  });
});
