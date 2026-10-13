/* global beforeEach, expect, jest, test */
jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/services/business/OutboundPostingGroupService', () => ({
  lockSource: jest.fn(),
}));

const Posting = require('../../src/services/InventoryPostingService');

const movement = {
  id: 12,
  source_type: 'sales_outbound',
  source_id: 7,
  source_no: 'SALE-7',
  posting_kind: 'movement',
  original_posting_document_id: null,
  finance_status: 'approved',
  locked: 1,
};
const reversal = {
  ...movement,
  id: 13,
  source_id: null,
  source_no: 'SALE-7-REV-12',
  posting_kind: 'reversal',
  original_posting_document_id: 12,
  finance_status: 'pending',
  locked: 0,
};

function connectionFor({
  target = movement,
  original = movement,
  outbound = { id: 7, outbound_no: 'SALE-7' },
  lockedTarget = target,
} = {}) {
  const locks = [];
  const execute = jest.fn(async (query, params) => {
    const sql = query.replace(/\s+/g, ' ').trim();
    if (sql.includes('FROM sales_outbound')) {
      locks.push(['sales_outbound', params[0]]);
      return [outbound ? [outbound] : []];
    }
    if (sql.includes('FROM inventory_posting_documents WHERE id = ? FOR UPDATE')) {
      locks.push(['posting', params[0]]);
      return [[lockedTarget]];
    }
    if (sql.includes('original_posting_document_id FROM inventory_posting_documents'))
      return [[target]];
    if (sql.includes('FROM inventory_posting_documents WHERE id = ?'))
      return [original ? [original] : []];
    throw new Error(`Unexpected query: ${sql}`);
  });
  return { execute, locks };
}

beforeEach(() => jest.clearAllMocks());

test('finance generation locks the sales source before rechecking the approved posting', async () => {
  const connection = connectionFor();
  jest.spyOn(Posting, 'findApprovedForTransaction').mockResolvedValue(movement);
  await expect(
    Posting.requireApprovedForTransaction(connection, { posting_document_id: 12 })
  ).resolves.toEqual(movement);
  expect(connection.locks).toEqual([
    ['sales_outbound', 7],
    ['posting', 12],
  ]);
});

test.each([null, 999])(
  'reversal uses its original source before taking the posting lock (header ID %s)',
  async (sourceId) => {
    const target = { ...reversal, source_id: sourceId };
    const connection = connectionFor({ target });
    await expect(Posting._lockDocumentForAction(connection, 13)).resolves.toEqual(target);
    expect(connection.locks).toEqual([
      ['sales_outbound', 7],
      ['posting', 13],
    ]);
    expect(
      connection.execute.mock.calls.find(([sql]) => sql.includes('FROM sales_outbound'))[1]
    ).toEqual([7]);
  }
);

test('a legacy original without a source ID locks by the exact original number', async () => {
  const connection = connectionFor({
    target: reversal,
    original: { ...movement, source_id: null },
  });
  await Posting._lockDocumentForAction(connection, 13);
  expect(connection.locks).toEqual([
    ['sales_outbound', 'SALE-7'],
    ['posting', 13],
  ]);
  expect(
    connection.execute.mock.calls.find(([sql]) => sql.includes('FROM sales_outbound'))[0]
  ).toContain('WHERE outbound_no = ?');
});

test.each([
  null,
  { ...movement, source_type: 'outbound' },
  { ...movement, posting_kind: 'reversal' },
])('invalid original source is rejected before taking posting locks: %j', async (original) => {
  const connection = connectionFor({ target: reversal, original });
  await expect(Posting._lockDocumentForAction(connection, 13)).rejects.toMatchObject({
    statusCode: 409,
  });
  expect(connection.locks).toEqual([]);
});

test('a source ID pointing to a different number cannot lock and process another document', async () => {
  const connection = connectionFor({ outbound: { id: 7, outbound_no: 'OTHER' } });
  await expect(Posting._lockDocumentForAction(connection, 12)).rejects.toMatchObject({
    statusCode: 409,
  });
  expect(connection.locks).toEqual([['sales_outbound', 7]]);
});

test('reversal original identity is checked again after acquiring locks', async () => {
  const connection = connectionFor({
    target: reversal,
    lockedTarget: { ...reversal, original_posting_document_id: 99 },
  });
  await expect(Posting._lockDocumentForAction(connection, 13)).rejects.toMatchObject({
    code: 'POSTING_SOURCE_CHANGED',
  });
});

test('unrelated posting types do not add a sales source query', async () => {
  const target = { ...movement, source_type: 'inbound' };
  const connection = connectionFor({ target });
  await expect(Posting._lockDocumentForAction(connection, 12)).resolves.toEqual(target);
  expect(connection.locks).toEqual([['posting', 12]]);
});
