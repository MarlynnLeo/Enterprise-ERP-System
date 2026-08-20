/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));
jest.mock('../../src/services/business/CodeGeneratorService', () => ({
  nextCode: jest.fn(),
}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({
  getViewPermissionsForType: jest.fn((type) => type === 'material' ? ['basedata:materials:view'] : []),
}));
jest.mock('../../src/services/FileAccessService', () => ({
  authorize: jest.fn(),
  assertBusinessObjectAccess: jest.fn(),
  canViewBusinessType: jest.fn(),
  validateBusinessBinding: jest.fn(),
  normalizePublicFlag: jest.fn(),
  normalizeUploadUrl: jest.fn(),
  claimExistingUpload: jest.fn(),
  canSetPublic: jest.fn(),
  setPublicFlag: jest.fn(),
  safeMarkDeleted: jest.fn(),
}));
jest.mock('../../src/services/DataScopeService', () => ({
  isAllScope: jest.fn(() => true),
}));
jest.mock('../../src/utils/softDelete', () => ({ softDelete: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const { pool } = require('../../src/config/db');
const FileAccessService = require('../../src/services/FileAccessService');
const { documents } = require('../../src/controllers/business/enhancedModulesController');

function responseDouble() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function request(query = {}) {
  return {
    query,
    params: {},
    user: { id: 7 },
    userPermissions: ['system:documents:view'],
    authzScope: { type: 'all', departmentIds: [] },
  };
}

function responseBody(res) {
  return res.json.mock.calls.at(-1)?.[0];
}

describe('enhanced document authorization and pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('公开的手工文档仍不能绕过绑定业务类型权限', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[
        {
          id: 1,
          file_url: 'manual',
          business_type: 'material',
          business_id: 10,
          is_public: 1,
          department_id: 99,
        },
      ]]);
    FileAccessService.canViewBusinessType.mockReturnValue(false);
    const res = responseDouble();

    await documents.getList(request({ page: '1', pageSize: '20' }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(responseBody(res).data).toMatchObject({
      list: [],
      total: 0,
      totalExact: true,
      hasMore: false,
    });
    expect(FileAccessService.assertBusinessObjectAccess).not.toHaveBeenCalled();
  });

  test('授权过滤后分页从候选起点扫描，第二页不重复第一页', async () => {
    const rows = [5, 4, 3, 2, 1].map((id) => ({
      id,
      file_url: 'manual',
      business_type: 'material',
      business_id: id,
      is_public: 0,
      department_id: 1,
    }));
    pool.query
      .mockResolvedValueOnce([[{ total: rows.length }]])
      .mockResolvedValueOnce([rows])
      .mockResolvedValueOnce([[{ total: rows.length }]])
      .mockResolvedValueOnce([rows]);
    FileAccessService.canViewBusinessType.mockReturnValue(true);
    FileAccessService.assertBusinessObjectAccess.mockImplementation(
      (_req, _type, id) => Promise.resolve(id !== 5)
    );

    const first = responseDouble();
    await documents.getList(request({ page: '1', pageSize: '2' }), first);
    const second = responseDouble();
    await documents.getList(request({ page: '2', pageSize: '2' }), second);

    expect(responseBody(first).data.list.map((row) => row.id)).toEqual([4, 3]);
    expect(responseBody(second).data.list.map((row) => row.id)).toEqual([2, 1]);
    expect(responseBody(first).data.total).toBe(4);
    expect(responseBody(first).data.totalExact).toBe(true);
  });

  test('安全扫描上限内无法解析授权页时要求缩小筛选范围', async () => {
    const deniedRows = Array.from({ length: 100 }, (_, index) => ({
      id: 1000 - index,
      file_url: 'manual',
      business_type: 'material',
      business_id: 1000 - index,
      is_public: 1,
      department_id: 1,
    }));
    pool.query
      .mockResolvedValueOnce([[{ total: 501 }]])
      .mockResolvedValueOnce([deniedRows])
      .mockResolvedValueOnce([deniedRows])
      .mockResolvedValueOnce([deniedRows])
      .mockResolvedValueOnce([deniedRows])
      .mockResolvedValueOnce([deniedRows]);
    FileAccessService.canViewBusinessType.mockReturnValue(false);
    const res = responseDouble();

    await documents.getList(request({ page: '1', pageSize: '20' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(responseBody(res)).toMatchObject({
      success: false,
      errorCode: 'DOCUMENT_QUERY_TOO_BROAD',
    });
  });

  test('公开文档下载端点也要求绑定业务类型权限', async () => {
    pool.query.mockResolvedValueOnce([[
      {
        file_url: 'manual',
        file_name: 'manual.txt',
        is_public: 1,
        department_id: 99,
        business_type: 'material',
        business_id: 10,
      },
    ]]);
    FileAccessService.canViewBusinessType.mockReturnValue(false);
    const req = request();
    req.params.id = '1';
    const res = responseDouble();

    await documents.download(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('创建业务绑定文档前先校验业务类型权限且无数据库副作用', async () => {
    FileAccessService.normalizePublicFlag.mockReturnValue(0);
    FileAccessService.validateBusinessBinding.mockReturnValue({
      valid: true,
      bound: true,
      businessType: 'material',
      businessId: 10,
    });
    FileAccessService.canViewBusinessType.mockReturnValue(false);
    const req = request();
    req.body = { name: '材料文档', business_type: 'material', business_id: 10 };
    const res = responseDouble();

    await documents.create(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(FileAccessService.assertBusinessObjectAccess).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });
});
