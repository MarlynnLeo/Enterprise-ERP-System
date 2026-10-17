/* global expect, jest, test */
jest.mock('../../src/config/db', () => ({ pool: {} }));

const Posting = require('../../src/services/InventoryPostingService');
const SourceLock = require('../../src/services/business/InventoryPostingSourceLockService');
const Group = require('../../src/services/business/OutboundPostingGroupService');
const Closure = require('../../src/services/business/InventoryPostingReversalClosureService');

const movement = {
  id: 12, source_type: 'inbound', source_id: 7, source_no: 'SOURCE-7',
  posting_kind: 'movement', original_posting_document_id: null,
};

test.each([
  ['inbound', 'inventory_inbound'], ['purchase_inbound', 'inventory_inbound'],
  ['production_outbound', 'inventory_outbound'], ['transfer', 'inventory_transfers'],
  ['outsourced_processing_material', 'outsourced_processings'],
  ['outsourced_processing_receipt', 'outsourced_processing_receipts'],
])('%s locks its business source before its posting row', async (type, table) => {
  const target = { ...movement, source_type: type };
  const locks = [];
  const connection = { execute: jest.fn(async (sql, params) => {
    if (sql.includes(`FROM ${table}`)) {
      expect(sql).toContain('WHERE id = ?');
      locks.push([table, params[0]]);
      return [[{ id: 7, source_no: 'SOURCE-7' }]];
    }
    if (sql.includes('FOR UPDATE')) locks.push(['posting', params[0]]);
    return [[target]];
  }) };
  expect(await Posting._lockDocumentForAction(connection, 12)).toEqual(target);
  expect(locks).toEqual([[table, 7], ['posting', 12]]);
});

test('reversal locks the original source number instead of its suffixed request number', async () => {
  const connection = { execute: jest.fn()
    .mockResolvedValueOnce([[{ ...movement, source_id: null }]])
    .mockResolvedValueOnce([[]])
    .mockResolvedValueOnce([[{ id: 7, source_no: 'SOURCE-7' }]]) };
  await SourceLock.lockSource(connection, {
    ...movement, id: 13, source_id: 999, source_no: 'SOURCE-7-REV-12',
    posting_kind: 'reversal', original_posting_document_id: 12,
  });
  expect(connection.execute.mock.calls[2][0]).toContain('WHERE inbound_no = ?');
  expect(connection.execute.mock.calls[2][1]).toEqual(['SOURCE-7']);
});

test.each([null, { id: 7, source_no: 'ANOTHER' }])('missing or mismatched source %j blocks processing', async (source) => {
  const connection = { execute: jest.fn().mockResolvedValue([source ? [source] : []]) };
  await expect(SourceLock.lockSource(connection, movement)).rejects.toMatchObject({ code: 'POSTING_SOURCE_CHANGED' });
});

test('an outbound ID cannot be combined with another outbound number', async () => {
  const connection = { execute: jest.fn().mockResolvedValue([[{ id: 7, outbound_no: 'OUT-7' }]]) };
  await expect(Group.lockSource(connection, {
    sourceType: 'outbound', sourceId: 7, sourceNo: 'OUT-8',
  })).rejects.toMatchObject({ code: 'POSTING_SOURCE_CHANGED' });
  expect(connection.execute.mock.calls[0][0]).toContain('WHERE id = ?');
  expect(connection.execute.mock.calls[0][1]).toEqual([7]);
});

test.each([
  { id: 8, inbound_no: 'IN-7' }, { id: 7, inbound_no: 'IN-8' },
])('reversal closure refuses an OR-query result for a different source: %j', async (source) => {
  const connection = { execute: jest.fn().mockResolvedValue([[source]]) };
  await expect(Closure.closeInbound(connection, { sourceId: 7, sourceNo: 'IN-7' }, {}))
    .rejects.toMatchObject({ code: 'POSTING_SOURCE_CHANGED' });
  expect(connection.execute).toHaveBeenCalledTimes(1);
});
