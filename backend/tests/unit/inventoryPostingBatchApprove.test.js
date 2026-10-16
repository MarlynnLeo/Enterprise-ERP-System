jest.mock('../../src/config/db', () => ({ pool: {}, getConnection: jest.fn() }));

const InventoryPostingService = require('../../src/services/InventoryPostingService');
const FinanceEnhancementController = require('../../src/controllers/business/finance/financeEnhancementController');
const { ResponseHandler } = require('../../src/utils/responseHandler');
const db = require('../../src/config/db');
const OutboundPostingGroupService = require('../../src/services/business/OutboundPostingGroupService');
const DomainEventService = require('../../src/services/business/DomainEventService');

describe('InventoryPostingService.batchApprove', () => {
  const actor = { id: 1, label: 'admin' };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('input validation', () => {
    test('throws INVALID_INPUT when ids is not an array or is empty', async () => {
      await expect(InventoryPostingService.batchApprove(null, actor)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_INPUT',
      });
      await expect(InventoryPostingService.batchApprove([], actor)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_INPUT',
      });
      await expect(InventoryPostingService.batchApprove('1,2', actor)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_INPUT',
      });
    });

    test('throws INVALID_INPUT when ids exceed 100 items', async () => {
      const ids = Array.from({ length: 101 }, (_, i) => i + 1);
      await expect(InventoryPostingService.batchApprove(ids, actor)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_INPUT',
      });
    });

    test('throws INVALID_INPUT when ids contain invalid values', async () => {
      const invalidCases = [
        [1, 0],
        [1, -5],
        [1, 'abc'],
        [1, null],
        [1, {}],
      ];
      for (const item of invalidCases) {
        await expect(InventoryPostingService.batchApprove(item, actor)).rejects.toMatchObject({
          statusCode: 400,
          code: 'INVALID_INPUT',
        });
      }
    });
  });

  describe('execution and results aggregation', () => {
    test('deduplicates ids and successfully approves all documents', async () => {
      const approveSpy = jest
        .spyOn(InventoryPostingService, 'approve')
        .mockResolvedValueOnce({ id: 10, status: 'approved' })
        .mockResolvedValueOnce({ id: 20, status: 'approved' });

      const result = await InventoryPostingService.batchApprove([10, '20', 10], actor);

      expect(approveSpy).toHaveBeenCalledTimes(2);
      expect(approveSpy).toHaveBeenNthCalledWith(1, 10, actor);
      expect(approveSpy).toHaveBeenNthCalledWith(2, 20, actor);

      expect(result).toEqual({
        totalCount: 2,
        successCount: 2,
        failureCount: 0,
        results: [
          { id: 10, success: true, result: { id: 10, status: 'approved' } },
          { id: 20, success: true, result: { id: 20, status: 'approved' } },
        ],
      });
    });

    test('catches individual errors and aggregates both success and failure results', async () => {
      const err = new Error('单据已审核');
      err.code = 'INVALID_STATUS';

      jest
        .spyOn(InventoryPostingService, 'approve')
        .mockResolvedValueOnce({ id: 10, status: 'approved' })
        .mockRejectedValueOnce(err);

      const result = await InventoryPostingService.batchApprove([10, 20], actor);

      expect(result).toEqual({
        totalCount: 2,
        successCount: 1,
        failureCount: 1,
        results: [
          { id: 10, success: true, result: { id: 10, status: 'approved' } },
          {
            id: 20,
            success: false,
            error: '单据已审核',
            code: 'INVALID_STATUS',
          },
        ],
      });
    });
  });

  describe('the real approval path within a mixed batch', () => {
    const reviewer = { id: 9, label: '财务乙' };
    const pending = id => ({
      id, posting_no: `PST-${id}`, source_type: 'inbound', source_id: id + 1000,
      source_no: `IN-${id}`, posting_kind: 'movement', finance_status: 'pending',
      business_approved_by_id: 2, business_approved_by: '业务甲',
    });
    const connection = () => ({
      beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
      execute: jest.fn(async sql => sql.includes('FROM inventory_posting_lines')
        ? [[{ id: 1, signed_quantity: 2 }]] : [{ affectedRows: 1 }]),
    });

    test('rechecks each document, rejects self review and stale state, and audits only the committed approval', async () => {
      const connections = Array.from({ length: 4 }, connection);
      const documents = {
        101: { ...pending(101), business_approved_by_id: 9 },
        102: { ...pending(102), business_approved_by_id: null, business_approved_by: '财务乙' },
        103: { ...pending(103), finance_status: 'approved' },
        104: pending(104),
      };
      connections.forEach(conn => db.getConnection.mockResolvedValueOnce(conn));
      const lock = jest.spyOn(InventoryPostingService, '_lockDocumentForAction').mockImplementation(async (_conn, id) => documents[id]);
      const post = jest.spyOn(InventoryPostingService, '_postLines').mockResolvedValue([{ quantity: 2 }]);
      jest.spyOn(OutboundPostingGroupService, 'assertWritable').mockResolvedValue(null);
      jest.spyOn(DomainEventService, 'enqueue').mockResolvedValue(501);
      const dispatch = jest.spyOn(DomainEventService, 'dispatchSoon').mockImplementation(() => {});

      const result = await InventoryPostingService.batchApprove([101, 102, 103, 104], reviewer);
      expect(result).toMatchObject({ totalCount: 4, successCount: 1, failureCount: 3 });
      expect(result.results.map(row => row.code || 'OK')).toEqual([
        'SEPARATION_OF_DUTIES', 'SEPARATION_OF_DUTIES', 'INVALID_STATUS', 'OK',
      ]);
      expect(lock.mock.calls.map(([, id]) => id)).toEqual([101, 102, 103, 104]);
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith(connections[3], expect.objectContaining({ id: 104 }), expect.any(Array), reviewer);
      for (const conn of connections.slice(0, 3)) {
        expect(conn.rollback).toHaveBeenCalledTimes(1);
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.execute).not.toHaveBeenCalled();
      }
      expect(connections[3].commit).toHaveBeenCalledTimes(1);
      expect(connections[3].rollback).not.toHaveBeenCalled();
      const eventCall = connections[3].execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO inventory_posting_events'));
      expect(eventCall[0]).toContain("'finance_approved'");
      expect(eventCall[1].slice(0, 5)).toEqual([104, 'pending', 'approved', 9, '财务乙']);
      expect(DomainEventService.enqueue).toHaveBeenCalledTimes(1);
      expect(DomainEventService.enqueue).toHaveBeenCalledWith('INVENTORY_POSTING_APPROVED', expect.objectContaining({ postingDocumentId: 104 }), expect.objectContaining({ connection: connections[3] }));
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith(501);
      expect(connections.every(conn => conn.beginTransaction.mock.calls.length === 1 && conn.release.mock.calls.length === 1)).toBe(true);
    });

    test('rolls back an approval if its per-document audit write fails and continues with the next document', async () => {
      const first = connection();
      const second = connection();
      first.execute.mockImplementation(async sql => {
        if (sql.includes('INSERT INTO inventory_posting_events')) throw Object.assign(new Error('审批记录写入失败'), { code: 'AUDIT_WRITE_FAILED' });
        return sql.includes('FROM inventory_posting_lines') ? [[{ id: 1 }]] : [{ affectedRows: 1 }];
      });
      db.getConnection.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
      jest.spyOn(InventoryPostingService, '_lockDocumentForAction').mockImplementation(async (_conn, id) => pending(id));
      jest.spyOn(InventoryPostingService, '_postLines').mockResolvedValue([{ quantity: 2 }]);
      jest.spyOn(OutboundPostingGroupService, 'assertWritable').mockResolvedValue(null);
      jest.spyOn(DomainEventService, 'enqueue').mockResolvedValue(502);
      jest.spyOn(DomainEventService, 'dispatchSoon').mockImplementation(() => {});

      const result = await InventoryPostingService.batchApprove([101, 102], reviewer);
      expect(result).toMatchObject({ successCount: 1, failureCount: 1 });
      expect(result.results[0]).toMatchObject({ id: 101, success: false, code: 'AUDIT_WRITE_FAILED' });
      expect(result.results[1]).toMatchObject({ id: 102, success: true });
      expect(first.rollback).toHaveBeenCalledTimes(1);
      expect(first.commit).not.toHaveBeenCalled();
      expect(second.commit).toHaveBeenCalledTimes(1);
      expect(DomainEventService.enqueue).toHaveBeenCalledTimes(1);
      expect(DomainEventService.enqueue).toHaveBeenCalledWith('INVENTORY_POSTING_APPROVED', expect.objectContaining({ postingDocumentId: 102 }), expect.objectContaining({ connection: second }));
    });
  });
});

describe('FinanceEnhancementController.batchApproveInventoryPostings', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('calls batchApprove and returns success response', async () => {
    jest.spyOn(InventoryPostingService, 'batchApprove').mockResolvedValue({
      totalCount: 1,
      successCount: 1,
      failureCount: 0,
      results: [{ id: 1, success: true }],
    });

    const req = {
      user: { id: 2, username: 'finance_user' },
      body: { ids: [1], actor: { id: 999, label: '伪造审核人' }, userId: 999 },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    const successSpy = jest.spyOn(ResponseHandler, 'success');

    await FinanceEnhancementController.batchApproveInventoryPostings(req, res);

    expect(InventoryPostingService.batchApprove).toHaveBeenCalledWith(
      [1],
      expect.objectContaining({ id: 2, label: 'finance_user' })
    );
    expect(successSpy).toHaveBeenCalledWith(
      res,
      expect.objectContaining({ totalCount: 1, successCount: 1 }),
      '批量审核完成'
    );
  });
});
