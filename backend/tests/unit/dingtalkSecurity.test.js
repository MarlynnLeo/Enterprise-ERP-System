/* global describe, expect, jest, test, beforeEach, afterEach */

jest.mock('../../src/config/db', () => ({
  pool: { execute: jest.fn(), query: jest.fn() },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../src/utils/httpClient', () => ({
  request: jest.fn(),
  httpGet: jest.fn(),
  httpPost: jest.fn(),
}));

const { request, httpPost } = require('../../src/utils/httpClient');
const DingtalkSyncService = require('../../src/services/business/hr/dingtalkSyncService');
const dingtalkService = require('../../src/services/integrations/dingtalkService');

describe('DingTalk outbound request security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    request.mockResolvedValue({ status: 200, data: { errcode: 0, result: { list: [], has_more: false } } });
    dingtalkService.accessToken = 'cached-token';
    dingtalkService.tokenExpireTime = Date.now() + 60_000;
    dingtalkService.config = {
      ...dingtalkService.config,
      requestTimeoutMs: 3210,
      maxResponseBytes: 123456,
      maxRetries: 2,
      rejectUnauthorized: true,
      processCode: 'PROC',
      agentId: '',
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('HR 请求拒绝非 2xx 和非对象响应，并传递超时/大小限制', async () => {
    request.mockResolvedValueOnce({ status: 503, data: { errcode: 0 } });
    await expect(DingtalkSyncService.requestJSON('GET', 'https://oapi.dingtalk.com/gettoken'))
      .rejects.toMatchObject({ code: 'DINGTALK_HTTP_ERROR', status: 503 });

    request.mockResolvedValueOnce({ status: 200, data: 'not-json-object' });
    await expect(DingtalkSyncService.requestJSON('GET', 'https://oapi.dingtalk.com/gettoken'))
      .rejects.toMatchObject({ code: 'DINGTALK_INVALID_RESPONSE' });

    expect(request).toHaveBeenLastCalledWith(
      'GET',
      'https://oapi.dingtalk.com/gettoken',
      expect.objectContaining({
        timeout: expect.any(Number),
        maxResponseBytes: expect.any(Number),
        rejectUnauthorized: true,
      })
    );
  });

  test('HR 用户分页拒绝重复游标，避免恶意/异常响应造成无限循环', async () => {
    const response = {
      errcode: 0,
      result: { list: [], has_more: true, next_cursor: 0 },
    };
    jest.spyOn(DingtalkSyncService, 'requestJSON').mockResolvedValue(response);

    await expect(
      DingtalkSyncService.listUsersInDepartment('token', 1, 100)
    ).rejects.toThrow(/repeated cursor|invalid/i);
  });

  test('创建审批明确禁止自动重试，避免网络超时重复创建实例', async () => {
    httpPost.mockResolvedValueOnce({
      status: 200,
      data: { errcode: 0, process_instance_id: 'instance-1' },
    });

    await expect(
      dingtalkService.createApprovalInstance({
        originatorUserId: 'user-1',
        deptId: 1,
        formData: {},
      })
    ).resolves.toMatchObject({ success: true, instanceId: 'instance-1' });

    expect(httpPost).toHaveBeenCalledWith(
      expect.stringContaining('/topapi/processinstance/create'),
      expect.any(Object),
      expect.objectContaining({ retries: 0, timeout: 3210, maxResponseBytes: 123456 })
    );
  });
});
