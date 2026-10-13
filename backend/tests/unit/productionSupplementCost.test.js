/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/services/business/costAccounting/runtime', () => ({
  logger: { warn: jest.fn() },
  Precision: require('../../src/utils/precision'),
  BusinessError: require('../../src/utils/BusinessError'),
}));
jest.mock('../../src/services/InventoryValuationAdjustmentService', () => ({}));
jest.mock('../../src/services/InventoryPostingService', () => ({
  requireApprovedForTransaction: jest.fn(),
}));

const InventoryPostingService = require('../../src/services/InventoryPostingService');
const helpers = require('../../src/services/business/costAccounting/helpersMethods');
const actual = require('../../src/services/business/costAccounting/actualCostMethods');

describe('production supplement cost closure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    InventoryPostingService.requireApprovedForTransaction.mockResolvedValue({ id: 1 });
  });

  test('material cost counts initial issue plus supplements once via the cumulative parent quantity', async () => {
    const connection = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[{ id: 40, plan_id: null, quantity: 10 }]])
        .mockResolvedValueOnce([
          [
            {
              document_id: 9,
              document_no: 'OUT-9',
              reference_type: 'production_task',
              reference_id: 40,
              item_id: 21,
              material_id: 7,
              material_code: 'M7',
              quantity: 20,
              actual_quantity: 10,
              price: 2,
              material_name: 'Material 7',
            },
          ],
        ])
        .mockResolvedValueOnce([[]]),
    };
    const context = {
      ...helpers,
      ...actual,
      COSTING_METHOD: { WEIGHTED_AVERAGE: 'weighted_average', STANDARD: 'standard' },
      getBatchStandardMaterialCosts: jest.fn().mockResolvedValue({ 7: 2 }),
    };
    const result = await context.calculateActualMaterialCost(connection, 40);
    expect(result.totalCost).toBe(20);
    expect(result.details).toHaveLength(1);
    expect(result.details[0]).toMatchObject({ quantity: 10, unitCost: 2 });
    expect(connection.execute).toHaveBeenCalledTimes(3);
  });

  function approvalConnection() {
    return {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[{ plan_id: null }]])
        .mockResolvedValueOnce([[{ inbound_no: 'IN-1' }]])
        .mockResolvedValueOnce([[{ id: 9, outbound_no: 'OUT-9' }]])
        .mockResolvedValueOnce([
          [
            { id: 101, source_no: 'OUT-9-Sfirst' },
            { id: 102, source_no: 'OUT-9-Ssecond' },
          ],
        ]),
    };
  }

  test.each(['pending', 'rejected'])(
    'a %s supplement blocks cost GL even if the parent issue is approved',
    async (status) => {
      const connection = approvalConnection();
      InventoryPostingService.requireApprovedForTransaction.mockImplementation(
        async (_conn, transaction) => {
          if (transaction.posting_document_id === 102) {
            throw Object.assign(new Error(`supplement ${status}`), { statusCode: 409 });
          }
          return { id: transaction.posting_document_id || 1 };
        }
      );
      await expect(
        actual.assertApprovedProductionInboundPostings(connection, 40)
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(InventoryPostingService.requireApprovedForTransaction).toHaveBeenLastCalledWith(
        connection,
        {
          posting_document_id: 102,
          reference_type: 'outbound_supplement',
          reference_no: 'OUT-9-Ssecond',
        }
      );
    }
  );

  test('all supplement approvals allow costing; latest snapshots and legacy references are included', async () => {
    const connection = approvalConnection();
    const result = await actual.assertApprovedProductionInboundPostings(connection, 40);
    expect(result).toMatchObject({
      inboundNos: ['IN-1'],
      outboundNos: ['OUT-9'],
      supplementNos: ['OUT-9-Sfirst', 'OUT-9-Ssecond'],
    });
    expect(InventoryPostingService.requireApprovedForTransaction).toHaveBeenCalledTimes(4);
    const [sql, params] = connection.execute.mock.calls.at(-1);
    expect(sql).toContain('pd.source_id = io.id');
    expect(sql).toContain("CONCAT(io.outbound_no, '-补发')");
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('newer.posting_sequence > pd.posting_sequence');
    expect(params).toEqual([9]);
    expect(connection.execute.mock.calls[2][0]).toContain('FOR UPDATE');
    expect(sql).toContain('FOR UPDATE');
  });
});
