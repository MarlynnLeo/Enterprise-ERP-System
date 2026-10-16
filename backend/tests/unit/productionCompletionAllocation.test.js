jest.mock('../../src/models/finance', () => ({ reverseEntry: jest.fn(async () => 71) }));
jest.mock('../../src/services/finance/GLService', () => ({ createEntry: jest.fn(async () => 72) }));
const finance = require('../../src/models/finance');
const GLService = require('../../src/services/finance/GLService');
const service = require('../../src/services/business/ProductionCompletionAllocationService');
beforeEach(() => jest.clearAllMocks());
const connectionFor = (remaining) => ({
  execute: jest.fn(async (sql) => {
    if (sql.includes("transaction_type = 'PRODUCTION_COMPLETE'"))
      return [
        [
          {
            id: 69,
            document_type: '生产成本结转',
            document_number: 'TASK-COMPLETE',
            created_by: 1,
          },
        ],
      ];
    if (sql.includes('FROM gl_entry_items'))
      return [
        [
          { account_id: 1, debit_amount: 75, credit_amount: 0 },
          { account_id: 2, debit_amount: 0, credit_amount: 75 },
        ],
      ];
    if (sql.includes('SELECT l.posted_quantity'))
      return [[{ posted_quantity: remaining ? 90 : 100 }]];
    if (sql.includes('AS inbound_id'))
      return [
        remaining
          ? [{ finance_status: 'approved', locked: 1, line_id: 4, posted_quantity: remaining }]
          : [],
      ];
    if (sql.includes('SELECT actual_cost'))
      return [[{ actual_cost: 75, completed_quantity: 100, quantity: 100 }]];
    return [{ affectedRows: 1 }];
  }),
});
test('90-unit reversal retains ten-unit FG cost and never reverses incurred labor or overhead', async () => {
  const connection = connectionFor(10);
  const result = await service.reverseInbound(connection, {
    taskId: 165,
    inbound: { id: 90, inbound_no: 'IN90' },
    operator: 1,
  });
  expect(finance.reverseEntry).toHaveBeenCalledTimes(1);
  expect(finance.reverseEntry.mock.calls[0][0]).toBe(69);
  expect(result).toMatchObject({
    remainingQuantity: 10,
    reversedQuantity: 90,
    retainedAmount: 7.5,
  });
  expect(GLService.createEntry.mock.calls[0][1]).toEqual([
    expect.objectContaining({ account_id: 1, debit_amount: 7.5, credit_amount: 0 }),
    expect.objectContaining({ account_id: 2, debit_amount: 0, credit_amount: 7.5 }),
  ]);
  expect(GLService.createEntry.mock.calls[0][0]).toMatchObject({
    transaction_type: 'PRODUCTION_COMPLETE',
    transaction_id: 165,
  });
});
test('full reversal returns all FG cost to WIP without a zero-value replacement voucher', async () => {
  const result = await service.reverseInbound(connectionFor(0), {
    taskId: 165,
    inbound: { id: 90, inbound_no: 'IN90' },
    operator: 1,
  });
  expect(result.retainedAmount).toBe(0);
  expect(GLService.createEntry).not.toHaveBeenCalled();
});
test('replacement 90 restores transferred FG amount to 75 while 10 alone is 7.5', () => {
  expect(service.transferAmount(75, 100, 10)).toBe(7.5);
  expect(service.transferAmount(75, 100, 100)).toBe(75);
  expect(() => service.transferAmount(75, 100, 110)).toThrow('数量');
});
test('missing posted completion voucher remains a hard financial approval gate', async () => {
  await expect(
    service.reverseInbound(
      { execute: jest.fn(async () => [[]]) },
      { taskId: 165, inbound: { id: 90 } }
    )
  ).rejects.toThrow('有效完工成本凭证');
  expect(finance.reverseEntry).not.toHaveBeenCalled();
});

test.each(['pending', 'rejected', 'reversed'])(
  'remaining %s posting blocks reversal before any GL write',
  async (finance_status) => {
    const connection = connectionFor(10);
    const original = connection.execute.getMockImplementation();
    connection.execute.mockImplementation(async (sql, args) =>
      sql.includes('AS inbound_id')
        ? [[{ inbound_no: 'IN10', finance_status, locked: 0, line_id: 4, posted_quantity: null }]]
        : original(sql, args)
    );
    await expect(
      service.reverseInbound(connection, {
        taskId: 165,
        inbound: { id: 90 },
        originalPostingDocumentId: 2,
      })
    ).rejects.toMatchObject({ statusCode: 409, code: 'INVENTORY_POSTING_PENDING' });
    expect(finance.reverseEntry).not.toHaveBeenCalled();
    expect(GLService.createEntry).not.toHaveBeenCalled();
  }
);
test('active quantity uses locked posted snapshots and queries the latest movement, not mutable business quantities', async () => {
  const connection = {
    execute: jest.fn(async () => [
      [{ finance_status: 'approved', locked: 1, line_id: 8, posted_quantity: 10, quantity: 999 }],
    ]),
  };
  expect(await service.getActiveInboundQuantity(connection, 165)).toBe(10);
  const sql = connection.execute.mock.calls[0][0];
  expect(sql).toContain('latest.posting_sequence DESC, latest.id DESC');
  expect(sql).toContain('FOR UPDATE');
  expect(sql).not.toContain('inventory_inbound_items');
});
test('mismatched completion voucher coverage is blocked instead of inventing a remainder', async () => {
  const connection = connectionFor(10);
  const original = connection.execute.getMockImplementation();
  connection.execute.mockImplementation(async (sql, args) =>
    sql.includes('FROM gl_entry_items')
      ? [
          [
            { account_id: 1, debit_amount: 67.5, credit_amount: 0 },
            { account_id: 2, debit_amount: 0, credit_amount: 67.5 },
          ],
        ]
      : original(sql, args)
  );
  await expect(
    service.reverseInbound(connection, {
      taskId: 165,
      inbound: { id: 90 },
      originalPostingDocumentId: 2,
    })
  ).rejects.toMatchObject({ code: 'PRODUCTION_COST_ALLOCATION_MISMATCH' });
  expect(finance.reverseEntry).not.toHaveBeenCalled();
});
