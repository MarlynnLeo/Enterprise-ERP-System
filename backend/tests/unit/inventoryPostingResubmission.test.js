jest.mock('../../src/services/InventoryPostingService', () => ({ stageMovement: jest.fn() }));
jest.mock('../../src/services/business/PeriodValidationService', () => ({
  validateInventoryTransaction: jest.fn(async () => ({ allowed: true })),
}));
const service = require('../../src/services/business/InventoryPostingResubmissionService');
const posting = require('../../src/services/InventoryPostingService');
const periods = require('../../src/services/business/PeriodValidationService');

const context = {
  sourceType: 'purchase_return',
  sourceId: 7,
  sourceNo: 'PR-7',
  actor: { id: 9, label: 'buyer' },
};
const document = {
  id: 30,
  posting_no: 'INV-30',
  finance_status: 'rejected',
  source_id: 7,
  transaction_date: '2026-09-29',
  movement_direction: 'outbound',
};
const payload = {
  materialId: 2,
  locationId: 1,
  referenceType: 'purchase_return',
  referenceNo: 'PR-7',
  signedQuantity: -3,
  batchNumber: 'B1',
  unitCost: 12,
  totalValue: 36,
};
const line = {
  material_id: 2,
  location_id: 1,
  signed_quantity: -3,
  unit_cost: 12,
  total_value: 36,
  batch_number: 'B1',
  source_line_key: 'original-line',
  payload_json: JSON.stringify(payload),
  snapshot_hash: require('crypto')
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex'),
};

beforeEach(() => {
  jest.clearAllMocks();
  periods.validateInventoryTransaction.mockResolvedValue({ allowed: true });
});

test('replays immutable rejected quantities, costs and source lines into a new pending approval', async () => {
  const connection = {
    execute: jest
      .fn()
      .mockResolvedValueOnce([[document]])
      .mockResolvedValueOnce([[line]]),
  };
  posting.stageMovement.mockResolvedValue({ documentId: 31 });
  expect(await service.resubmit(connection, context)).toEqual({
    documentId: 31,
    financeStatus: 'pending',
    resubmittedFrom: 30,
  });
  expect(posting.stageMovement).toHaveBeenCalledWith(
    connection,
    expect.objectContaining({
      sourceType: 'purchase_return',
      sourceId: 7,
      sourceNo: 'PR-7',
      businessApprovedById: 9,
    }),
    [{ ...payload, sourceLineKey: 'original-line' }]
  );
  expect(connection.execute.mock.calls[0][0]).toContain('FOR UPDATE');
  expect(
    connection.execute.mock.calls.every(
      ([sql]) => !/UPDATE purchase|inventory_ledger|domain_events/i.test(sql)
    )
  ).toBe(true);
});

test.each(['pending', 'approved', 'reversed'])(
  'never creates another submission after state changes to %s',
  async (finance_status) => {
    const connection = { execute: jest.fn(async () => [[{ ...document, finance_status }]]) };
    expect(await service.resubmit(connection, context)).toBeNull();
    expect(posting.stageMovement).not.toHaveBeenCalled();
  }
);

test.each([
  ['foreign document', { ...document, source_id: 99 }, line],
  [
    'foreign line',
    document,
    { ...line, payload_json: JSON.stringify({ ...payload, referenceNo: 'OTHER' }) },
  ],
  ['changed quantity', document, { ...line, signed_quantity: -5 }],
  ['changed frozen cost', document, { ...line, unit_cost: 25 }],
  ['changed frozen warehouse', document, { ...line, location_id: 9 }],
  ['changed frozen batch', document, { ...line, batch_number: 'OTHER' }],
  ['invalid snapshot hash', document, { ...line, snapshot_hash: 'tampered' }],
  [
    'missing cost',
    document,
    { ...line, payload_json: JSON.stringify({ ...payload, unitCost: 0 }) },
  ],
])('rejects %s without staging anything', async (_, doc, item) => {
  const connection = {
    execute: jest
      .fn()
      .mockResolvedValueOnce([[doc]])
      .mockResolvedValueOnce([[item]]),
  };
  await expect(service.resubmit(connection, context)).rejects.toThrow();
  expect(posting.stageMovement).not.toHaveBeenCalled();
});

test('does not bypass closed inventory periods', async () => {
  periods.validateInventoryTransaction.mockResolvedValue({
    allowed: false,
    message: 'closed period',
  });
  const connection = { execute: jest.fn(async () => [[document]]) };
  await expect(service.resubmit(connection, context)).rejects.toThrow('closed period');
  expect(posting.stageMovement).not.toHaveBeenCalled();
});
