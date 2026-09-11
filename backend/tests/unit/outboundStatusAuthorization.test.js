/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: { getConnection: jest.fn(), execute: jest.fn() },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/utils/codeGenerator', () => ({
  CodeGenerators: { generateInventoryOutboundCode: jest.fn() },
}));
jest.mock('../../src/utils/softDelete', () => ({ softDeleteBatch: jest.fn() }));
jest.mock('../../src/services/InventoryService', () => ({ updateStock: jest.fn() }));
jest.mock('../../src/services/InventoryPostingService', () => ({
  requireApprovedForTransaction: jest.fn(),
  requestReversal: jest.fn(),
  actorFromRequest: jest.fn(),
}));
jest.mock('../../src/services/business/AsyncTaskService', () => ({}));
jest.mock('../../src/utils/userHelper', () => ({ getCurrentUserName: jest.fn(() => 'tester') }));
jest.mock('../../src/controllers/business/inventory/inventoryConsistencyController', () => ({
  checkAndUpdateTaskStatus: jest.fn(),
  _syncProductionStatus: jest.fn(),
}));
jest.mock('../../src/utils/userUtils', () => ({
  getRequestActorLabel: jest.fn(() => 'tester'),
  resolveActorLabel: jest.fn(() => 'tester'),
}));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  denyUnlessAccess: jest.fn(),
  denyUnlessAllAccess: jest.fn(),
  assertAccess: jest.fn(),
  assertAllAccess: jest.fn(),
}));
jest.mock('../../src/controllers/business/inventory/outbound/outboundHelpers', () => ({
  STATUS: {
    OUTBOUND: {
      DRAFT: 'draft',
      CONFIRMED: 'confirmed',
      COMPLETED: 'completed',
      PARTIAL_COMPLETED: 'partial_completed',
      REVERSED: 'reversed',
      CANCELLED: 'cancelled',
    },
    PRODUCTION_TASK: {
      MATERIAL_ISSUED: 'material_issued',
      MATERIAL_PARTIAL_ISSUED: 'material_partial_issued',
      PREPARING: 'preparing',
    },
    PRODUCTION_PLAN: {
      MATERIAL_ISSUED: 'material_issued',
      PREPARING: 'preparing',
    },
  },
  assertOutboundSourceAccess: jest.fn(),
  isProductionOutboundReference: jest.fn(),
  issueOutboundItemFromDetail: jest.fn(),
}));
jest.mock('../../src/controllers/business/inventory/outbound/outboundBomController', () => ({
  fetchBomItemsForOutbound: jest.fn(),
  fetchBatchBomItemsForOutbound: jest.fn(),
  parseSourceTaskIds: jest.fn(() => []),
}));

const db = require('../../src/config/db');
const InventoryService = require('../../src/services/InventoryService');
const InventoryPostingService = require('../../src/services/InventoryPostingService');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const { assertOutboundSourceAccess } = require('../../src/controllers/business/inventory/outbound/outboundHelpers');
const {
  updateOutboundStatus,
  batchUpdateOutboundStatus,
  batchDeleteOutbound,
  cancelOutboundReissue,
} = require('../../src/controllers/business/inventory/outbound/outboundStatusController');

function connectionDouble() {
  return {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
    execute: jest.fn(),
  };
}

function responseDouble() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('outbound status batch/source authorization', () => {
  let connection;

  beforeEach(() => {
    jest.clearAllMocks();
    connection = connectionDouble();
    db.pool.getConnection.mockResolvedValue(connection);
    ScopeGuard.denyUnlessAccess.mockResolvedValue(true);
    ScopeGuard.denyUnlessAllAccess.mockResolvedValue(true);
    ScopeGuard.assertAccess.mockResolvedValue(true);
    ScopeGuard.assertAllAccess.mockResolvedValue(true);
    assertOutboundSourceAccess.mockResolvedValue(true);
  });

  test.each([
    ['status', batchUpdateOutboundStatus, { ids: [1, 2], newStatus: 'confirmed' }],
    ['delete', batchDeleteOutbound, { ids: [1, 2] }],
  ])('混合合法/越权出库ID的批量%s整批失败且无业务查询或写入', async (_name, handler, body) => {
    ScopeGuard.denyUnlessAllAccess.mockImplementation(async (res) => {
      res.status(403).json({ success: false, errorCode: 'FORBIDDEN' });
      return false;
    });
    const res = responseDouble();

    await handler({ body, user: { id: 3 } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('批量状态变更混入越权来源单据时不执行UPDATE', async () => {
    connection.execute.mockResolvedValueOnce([[
      { id: 1, outbound_no: 'OUT-1', status: 'draft', reference_type: 'production_task', reference_id: 10 },
      { id: 2, outbound_no: 'OUT-2', status: 'draft', reference_type: 'production_task', reference_id: 20 },
    ]]);
    assertOutboundSourceAccess
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const res = responseDouble();

    await batchUpdateOutboundStatus(
      { body: { ids: [1, 2], newStatus: 'confirmed' }, user: { id: 3 } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(connection.execute).toHaveBeenCalledTimes(1);
    expect(connection.execute.mock.calls[0][0]).toContain('SELECT id, outbound_no');
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test.each([batchUpdateOutboundStatus, batchDeleteOutbound])(
    '批量出库ID超过500条时在事务和授权前返回400',
    async (handler) => {
      const res = responseDouble();
      const body = { ids: Array.from({ length: 501 }, (_, index) => index + 1), newStatus: 'confirmed' };

      await handler({ body, user: { id: 3 } }, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(connection.beginTransaction).not.toHaveBeenCalled();
      expect(ScopeGuard.denyUnlessAllAccess).not.toHaveBeenCalled();
      expect(connection.execute).not.toHaveBeenCalled();
    }
  );

  test.each(['production_task', 'production_plan'])(
    '撤销出库关联%s越权时返回403且不冲回库存',
    async (referenceType) => {
      connection.execute.mockResolvedValueOnce([[
        {
          id: 9,
          status: 'completed',
          reference_id: 77,
          reference_type: referenceType,
          outbound_no: 'OUT-9',
          outbound_type: 'bom_issue',
        },
      ]]);
      assertOutboundSourceAccess.mockResolvedValue(false);
      const res = responseDouble();

      await cancelOutboundReissue(
        { params: { id: '9' }, body: {}, user: { id: 3 }, userPermissions: ['inventory:outbound:cancel'] },
        res
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(connection.execute).toHaveBeenCalledTimes(1);
      expect(connection.rollback).toHaveBeenCalledTimes(1);
      expect(InventoryService.updateStock).not.toHaveBeenCalled();
      expect(connection.commit).not.toHaveBeenCalled();
    }
  );
});

describe('outbound reversal approval guards', () => {
  let connection;
  const outbound = {
    id: 9, outbound_no: 'OUT-9', status: 'completed',
    reference_id: null, reference_type: null, production_task_id: null,
  };
  const actor = { id: 3, label: 'tester' };

  function reversalRequest(body = {}) {
    return {
      params: { id: '9' }, body, user: { id: 3 },
      userPermissions: ['inventory:outbound:cancel'],
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    connection = connectionDouble();
    db.pool.getConnection.mockResolvedValue(connection);
    ScopeGuard.denyUnlessAccess.mockResolvedValue(true);
    ScopeGuard.assertAccess.mockResolvedValue(true);
    assertOutboundSourceAccess.mockResolvedValue(true);
    InventoryPostingService.requireApprovedForTransaction.mockReset();
    InventoryPostingService.requireApprovedForTransaction.mockResolvedValue({ id: 20 });
    InventoryPostingService.requestReversal.mockReset();
    InventoryPostingService.requestReversal.mockResolvedValue({ reversalDocumentId: 21, financeStatus: 'pending' });
    InventoryPostingService.actorFromRequest.mockReturnValue(actor);
  });

  test.each(['reversed', 'partial_completed'])('direct status update to %s is rejected without business writes', async (newStatus) => {
    const res = responseDouble();

    await updateOutboundStatus(reversalRequest({ newStatus }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.beginTransaction).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test('the reversal endpoint also requires cancel permission', async () => {
    const res = responseDouble();
    const req = reversalRequest();
    req.userPermissions = ['inventory:outbound:update'];

    await cancelOutboundReissue(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(connection.beginTransaction).not.toHaveBeenCalled();
    expect(InventoryPostingService.requestReversal).not.toHaveBeenCalled();
  });

  test.each([{ force: 'false' }, { force: 1 }, { createReissue: 'false' }, { createReissue: null }])(
    'rejects nonboolean reversal options %j', async (body) => {
      const res = responseDouble();

      await cancelOutboundReissue(reversalRequest(body), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(connection.execute).not.toHaveBeenCalled();
      expect(InventoryPostingService.requestReversal).not.toHaveBeenCalled();
    }
  );

  test.each([{}, { createReissue: false }])('submits a pending reversal without stock changes or reissue by default: %j', async (body) => {
    connection.execute.mockResolvedValueOnce([[outbound]]);
    const res = responseDouble();

    await cancelOutboundReissue(reversalRequest(body), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data).toEqual(expect.objectContaining({
      id: 9, status: 'completed', financeStatus: 'pending', reversalDocumentId: 21,
    }));
    expect(InventoryPostingService.requestReversal).toHaveBeenCalledWith(
      20, actor, '撤销出库单 OUT-9',
      expect.objectContaining({ createReissue: false, force: false, sourceId: 9 }), connection
    );
    expect(connection.execute).toHaveBeenCalledTimes(1);
    expect(connection.execute.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(InventoryService.updateStock).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  test('unapproved documents cannot submit a reversal', async () => {
    connection.execute.mockResolvedValueOnce([[outbound]]);
    InventoryPostingService.requireApprovedForTransaction.mockRejectedValue(
      Object.assign(new Error('库存过账尚未审核'), { code: 'INVENTORY_POSTING_NOT_APPROVED', statusCode: 409 })
    );
    const res = responseDouble();

    await cancelOutboundReissue(reversalRequest(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(InventoryPostingService.requestReversal).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('rejects the removed reissue option', async () => {
    const res = responseDouble();

    await cancelOutboundReissue(reversalRequest({ createReissue: true }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(connection.beginTransaction).not.toHaveBeenCalled();
    expect(InventoryPostingService.requestReversal).not.toHaveBeenCalled();
  });

  test.each([
    ['completed', false, 400], ['inspection', true, 400], ['in_progress', false, 409],
  ])('checks fallback production_task_id for %s even with force=%s', async (taskStatus, force, statusCode) => {
    connection.execute
      .mockResolvedValueOnce([[{ ...outbound, production_task_id: 77 }]])
      .mockResolvedValueOnce([[{ status: taskStatus, code: 'TASK-77' }]]);
    const res = responseDouble();

    await cancelOutboundReissue(reversalRequest({ force }), res);

    expect(res.status).toHaveBeenCalledWith(statusCode);
    expect(connection.execute.mock.calls[1][1]).toEqual([77]);
    expect(connection.execute.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(assertOutboundSourceAccess).toHaveBeenCalledWith(connection, expect.any(Object), expect.objectContaining({
      reference_id: 77, reference_type: 'production_task',
    }));
    expect(InventoryPostingService.requestReversal).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    if (taskStatus === 'in_progress') {
      expect(res.json.mock.calls[0][0]).toEqual(expect.objectContaining({
        code: 'NEED_CONFIRM', details: expect.objectContaining({ needConfirm: true }),
      }));
    }
  });

  test('a confirmed force request still waits for finance and does not create a replacement', async () => {
    connection.execute
      .mockResolvedValueOnce([[{ ...outbound, production_task_id: 77 }]])
      .mockResolvedValueOnce([[{ status: 'in_progress', code: 'TASK-77' }]]);
    const res = responseDouble();

    await cancelOutboundReissue(reversalRequest({ force: true }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(InventoryPostingService.requestReversal).toHaveBeenCalledWith(
      20, actor, expect.any(String), expect.objectContaining({
        createReissue: false, force: true, referenceType: 'production_task', referenceId: 77,
      }), connection
    );
    expect(InventoryService.updateStock).not.toHaveBeenCalled();
  });
});

/**
 * 取消出库单的权限校验回归。
 *
 * 修复前的两个缺陷：
 *   1. 单据状态口读 req.user.permissions / req.user.roles —— access token 载荷里
 *      从来没有这两个字段，恒为空数组，导致取消对所有人（含超管）恒 403；
 *   2. 批量状态口把 cancelled 列为合法目标却完全不校验 cancel 权限，
 *      路由只要求 inventory:outbound:update，因此成了单据口的绕过路径。
 */
describe('outbound cancel permission', () => {
  let connection;

  beforeEach(() => {
    jest.clearAllMocks();
    connection = connectionDouble();
    db.pool.getConnection.mockResolvedValue(connection);
    ScopeGuard.denyUnlessAccess.mockResolvedValue(true);
    ScopeGuard.denyUnlessAllAccess.mockResolvedValue(true);
    ScopeGuard.assertAccess.mockResolvedValue(true);
    ScopeGuard.assertAllAccess.mockResolvedValue(true);
    assertOutboundSourceAccess.mockResolvedValue(true);
  });

  function cancelRequest(userPermissions) {
    return {
      params: { id: '5' },
      body: { newStatus: 'cancelled' },
      user: { id: 3, username: 'operator' },
      userPermissions,
    };
  }

  test('持有 inventory:outbound:cancel 时允许取消', async () => {
    connection.execute
      // SELECT 出库单
      .mockResolvedValueOnce([[
        {
          id: 5,
          status: 'confirmed',
          outbound_no: 'OUT-5',
          reference_id: null,
          reference_type: null,
        },
      ]])
      // UPDATE 状态
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = responseDouble();

    await updateOutboundStatus(cancelRequest(['inventory:outbound:cancel']), res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    const updateCall = connection.execute.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('UPDATE inventory_outbound SET status')
    );
    expect(updateCall).toBeTruthy();
  });

  test('超管通配符 * 视为持有取消权限', async () => {
    connection.execute
      .mockResolvedValueOnce([[
        {
          id: 5,
          status: 'confirmed',
          outbound_no: 'OUT-5',
          reference_id: null,
          reference_type: null,
        },
      ]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = responseDouble();

    await updateOutboundStatus(cancelRequest(['*']), res);

    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  test('缺少 cancel 权限时单据取消返回403且不写库', async () => {
    connection.execute.mockResolvedValueOnce([[
      {
        id: 5,
        status: 'confirmed',
        outbound_no: 'OUT-5',
        reference_id: null,
        reference_type: null,
      },
    ]]);
    const res = responseDouble();

    await updateOutboundStatus(cancelRequest(['inventory:outbound:update']), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    const updateCall = connection.execute.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('UPDATE inventory_outbound SET status')
    );
    expect(updateCall).toBeFalsy();
  });

  test('批量取消缺少 cancel 权限时返回403且不开事务（防绕过单据口）', async () => {
    const res = responseDouble();

    await batchUpdateOutboundStatus(
      {
        body: { ids: [1, 2], newStatus: 'cancelled' },
        user: { id: 3 },
        userPermissions: ['inventory:outbound:update'],
      },
      res
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(connection.beginTransaction).not.toHaveBeenCalled();
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('批量取消持有 cancel 权限时放行到授权校验', async () => {
    connection.execute
      .mockResolvedValueOnce([[
        { id: 1, outbound_no: 'OUT-1', status: 'confirmed', reference_type: null, reference_id: null },
        { id: 2, outbound_no: 'OUT-2', status: 'confirmed', reference_type: null, reference_id: null },
      ]])
      .mockResolvedValueOnce([{ affectedRows: 2 }]);
    const res = responseDouble();

    await batchUpdateOutboundStatus(
      {
        body: { ids: [1, 2], newStatus: 'cancelled' },
        user: { id: 3 },
        userPermissions: ['inventory:outbound:cancel'],
      },
      res
    );

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(connection.beginTransaction).toHaveBeenCalled();
  });

  test('批量非取消状态不受 cancel 权限影响', async () => {
    connection.execute
      .mockResolvedValueOnce([[
        { id: 1, outbound_no: 'OUT-1', status: 'draft', reference_type: null, reference_id: null },
      ]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = responseDouble();

    await batchUpdateOutboundStatus(
      {
        body: { ids: [1], newStatus: 'confirmed' },
        user: { id: 3 },
        userPermissions: ['inventory:outbound:update'],
      },
      res
    );

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(connection.beginTransaction).toHaveBeenCalled();
  });
});
