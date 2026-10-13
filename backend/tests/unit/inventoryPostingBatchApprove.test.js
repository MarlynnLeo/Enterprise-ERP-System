jest.mock('../../src/config/db', () => ({ pool: {} }));

const InventoryPostingService = require('../../src/services/InventoryPostingService');
const FinanceEnhancementController = require('../../src/controllers/business/finance/financeEnhancementController');
const { ResponseHandler } = require('../../src/utils/responseHandler');

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
      body: { ids: [1] },
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
