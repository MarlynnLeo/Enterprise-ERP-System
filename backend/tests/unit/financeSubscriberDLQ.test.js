const mockRegisteredHandlers = new Map();

jest.mock('../../src/services/business/DLQService', () => ({
  registerHandler: jest.fn((name, handler) => mockRegisteredHandlers.set(name, handler)),
  recordSideEffectFailure: jest.fn(),
}));

jest.mock('../../src/events/EventBus', () => ({
  on: jest.fn(),
}));

const mockExecute = jest.fn();
jest.mock('../../src/config/db', () => ({
  pool: { execute: mockExecute },
}));

const mockGenerateInboundCostEntry = jest.fn();
const mockGenerateOutboundCostEntry = jest.fn();
jest.mock('../../src/services/business/InventoryCostService', () => ({
  generateInboundCostEntry: mockGenerateInboundCostEntry,
  generateOutboundCostEntry: mockGenerateOutboundCostEntry,
}));

jest.mock('../../src/services/external/FinanceIntegrationService', () => ({}));
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('FinanceSubscriber inventory adjustment replay', () => {
  beforeAll(() => {
    jest.resetModules();
    require('../../src/events/subscribers/FinanceSubscriber');
  });

  beforeEach(() => {
    mockExecute.mockReset();
    mockGenerateInboundCostEntry.mockReset();
    mockGenerateOutboundCostEntry.mockReset();
  });

  test('replays an inbound adjustment from its persisted ledger row', async () => {
    mockExecute.mockResolvedValueOnce([[
      {
        id: 403,
        material_id: 128223,
        location_id: 27,
        transaction_type: 'adjustment_in',
        transaction_date: '2026-07-13',
        quantity: 100,
        unit_cost: 100,
        reference_no: 'TZ20260713001',
        reference_type: 'manual_adjustment',
      },
    ]]);

    const handler = mockRegisteredHandlers.get('FinanceIntegration:InventoryAdjustmentEntry');
    expect(handler).toEqual(expect.any(Function));
    await handler({
      adjustmentNo: 'TZ20260713001',
      materialId: 128223,
      locationId: 27,
      adjustedTransactionType: 'adjustment_in',
    });

    expect(mockGenerateInboundCostEntry).toHaveBeenCalledWith(expect.objectContaining({
      id: 403,
      unit_cost: 100,
      reference_type: 'inventory_adjustment',
    }));
    expect(mockGenerateOutboundCostEntry).not.toHaveBeenCalled();
  });
});
