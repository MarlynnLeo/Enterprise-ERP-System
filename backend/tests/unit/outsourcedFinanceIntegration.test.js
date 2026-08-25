/* global afterEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: {
    getConnection: jest.fn(),
  },
}));

jest.mock('../../src/config/financeConfig', () => ({
  financeConfig: {
    get: jest.fn(() => null),
  },
}));

jest.mock('../../src/models/ar', () => ({}));
jest.mock('../../src/models/ap', () => ({}));
jest.mock('../../src/models/finance', () => ({
  createEntry: jest.fn(async () => 88),
}));
jest.mock('../../src/models/tax', () => ({}));
jest.mock('../../src/services/system/SystemConfigService', () => ({}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({
  tryAutoLink: jest.fn(async () => {}),
}));
jest.mock('../../src/constants/documentLinkTypes', () => ({
  DOCUMENT_LINK_TYPES: {},
}));
jest.mock('../../src/constants/financeConstants', () => ({
  DOCUMENT_TYPES: {},
  TAX_RELATED_DOCUMENT_TYPES: [],
  taxRelatedDocumentTypeMatchList: [],
}));
jest.mock('../../src/utils/userUtils', () => ({
  resolveActorUserId: jest.fn(async () => 1),
}));
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const financeModel = require('../../src/models/finance');
const FinanceIntegrationService = require('../../src/services/external/FinanceIntegrationService');

describe('outsourced finance integration', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    financeModel.createEntry.mockClear();
  });

  test('uses the actual FIFO issue ledger cost when material master cost is zero', async () => {
    const connection = {
      execute: jest.fn()
        .mockResolvedValueOnce([[
          { total_cost: '6.06', invalid_cost_lines: 0, ledger_lines: 1 },
        ]])
        .mockResolvedValueOnce([[{ entry_number: '凭证-001' }]]),
      query: jest.fn(),
    };

    jest.spyOn(FinanceIntegrationService, 'findExistingActiveGlEntry')
      .mockResolvedValue(null);
    jest.spyOn(FinanceIntegrationService, 'resolveAccountIds')
      .mockResolvedValue({ OUTSOURCED_MATERIALS: 1001, RAW_MATERIALS: 1002 });
    jest.spyOn(FinanceIntegrationService, 'getMaterialCostById')
      .mockResolvedValue(new Map([[12146, 0]]));
    jest.spyOn(FinanceIntegrationService, 'getCurrentPeriod')
      .mockResolvedValue({ id: 1 });

    const result = await FinanceIntegrationService.generateOutsourcedIssueEntry(
      { id: 7, processing_no: 'WW260824001', processing_date: '2026-08-24' },
      [{ material_id: 12146, quantity: 1 }],
      connection
    );

    expect(result).toMatchObject({ success: true, amount: 6.06 });
    expect(financeModel.createEntry).toHaveBeenCalledWith(
      expect.any(Object),
      expect.arrayContaining([
        expect.objectContaining({ debit_amount: 6.06 }),
        expect.objectContaining({ credit_amount: 6.06 }),
      ]),
      connection
    );
  });

  test('rejects an issue ledger that contains a zero-cost line', async () => {
    const connection = {
      execute: jest.fn().mockResolvedValueOnce([[
        { total_cost: '0.00', invalid_cost_lines: 1, ledger_lines: 1 },
      ]]),
      query: jest.fn(),
    };

    jest.spyOn(FinanceIntegrationService, 'findExistingActiveGlEntry')
      .mockResolvedValue(null);
    jest.spyOn(FinanceIntegrationService, 'resolveAccountIds')
      .mockResolvedValue({ OUTSOURCED_MATERIALS: 1001, RAW_MATERIALS: 1002 });
    jest.spyOn(FinanceIntegrationService, 'getMaterialCostById')
      .mockResolvedValue(new Map([[12146, 0]]));

    await expect(
      FinanceIntegrationService.generateOutsourcedIssueEntry(
        { id: 7, processing_no: 'WW260824001' },
        [{ material_id: 12146, quantity: 1 }],
        connection
      )
    ).rejects.toThrow('存在零成本发料台账');
    expect(financeModel.createEntry).not.toHaveBeenCalled();
  });

  test('allocates FIFO material cost into inventory even when processing fee is zero', async () => {
    const connection = {
      execute: jest.fn()
        .mockResolvedValueOnce([[
          { product_id: 11427, quantity: '2.00' },
        ]])
        .mockResolvedValueOnce([[
          { received_quantity: '0.00' },
        ]])
        .mockResolvedValueOnce([[
          { total_cost: '6.00', invalid_cost_lines: 0, ledger_lines: 1 },
        ]]),
    };

    const result = await FinanceIntegrationService.getOutsourcedReceiptCostAllocation(
      connection,
      { id: 9, processing_id: 8, processing_no: 'WW260825001' },
      [{ id: 21, actual_quantity: 1, unit_price: 0 }]
    );

    expect(result).toMatchObject({
      materialCost: 6,
      allocatedMaterialCost: 3,
      processingFee: 0,
      totalInventoryValue: 3,
    });
    expect(result.materialCostByItemId.get(21)).toEqual({
      materialCost: 3,
      unitCost: 3,
    });
  });

  test('uses cumulative rounding so split receipts fully consume material cost', async () => {
    const connection = {
      execute: jest.fn()
        .mockResolvedValueOnce([[
          { product_id: 11427, quantity: '3.00' },
        ]])
        .mockResolvedValueOnce([[
          { received_quantity: '1.00' },
        ]])
        .mockResolvedValueOnce([[
          { total_cost: '1.00', invalid_cost_lines: 0, ledger_lines: 1 },
        ]]),
    };

    const result = await FinanceIntegrationService.getOutsourcedReceiptCostAllocation(
      connection,
      { id: 10, processing_id: 8, processing_no: 'WW260825001' },
      [{ id: 22, actual_quantity: 2, unit_price: 0 }]
    );

    expect(result.allocatedMaterialCost).toBe(0.67);
    expect(result.totalInventoryValue).toBe(0.67);
  });
});
