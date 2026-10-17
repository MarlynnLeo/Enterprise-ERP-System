/* global jest, describe, test, expect */
const ProductionReturnService = require('../../src/services/business/ProductionReturnService');

const issue = (overrides = {}) => ({
  material_id: 3,
  location_id: 2,
  batch_number: 'B1',
  issued_quantity: 20,
  unit_cost: 5,
  ...overrides,
});
const inbound = (overrides = {}) => ({
  id: 10,
  inbound_type: 'production_return',
  reference_type: 'production_task',
  reference_id: 7,
  location_id: 2,
  ...overrides,
});
const item = (overrides = {}) => ({
  material_id: 3,
  location_id: 2,
  batch_number: 'B1',
  quantity: 15,
  ...overrides,
});
const connection = (issued = [issue()], returned = []) => ({
  execute: jest.fn(async (sql) => {
    if (/FROM inventory_posting_documents reversal/.test(sql)) return [[]];
    if (/FROM production_tasks t/.test(sql)) return [[{ id: 7, task_code: 'PT-7' }]];
    if (/FROM \(/.test(sql)) return [issued];
    if (/FROM inventory_inbound i/.test(sql)) return [returned];
    throw new Error(`Unexpected SQL: ${sql}`);
  }),
});

describe('production return quantities come from issued warehouse/batch movements', () => {
  test('two issues of 10 and one prior return of 5 leave 15, deducting the return only once', () => {
    const records = ProductionReturnService.subtractReturns(
      [issue({ issued_quantity: 10 }), issue({ issued_quantity: 10 })],
      [{ ...item(), returned_quantity: 5 }]
    );
    expect(records.map((row) => row.max_returnable_quantity)).toEqual([5, 10]);
    expect(records.reduce((sum, row) => sum + row.returned_quantity, 0)).toBe(5);
  });

  test('batch-specific returns never reduce another batch or warehouse', () => {
    const records = ProductionReturnService.subtractReturns(
      [issue(), issue({ batch_number: 'B2' }), issue({ location_id: 8 })],
      [{ ...item(), returned_quantity: 5 }]
    );
    expect(records.map((row) => row.max_returnable_quantity)).toEqual([15, 20, 20]);
  });

  test('legacy blank batch return reserves only its warehouse and is allocated once', () => {
    const records = ProductionReturnService.subtractReturns(
      [
        issue({ issued_quantity: 10 }),
        issue({ issued_quantity: 10, batch_number: 'B2' }),
        issue({ location_id: 8 }),
      ],
      [{ ...item({ batch_number: null }), returned_quantity: 15 }]
    );
    expect(records.map((row) => row.max_returnable_quantity)).toEqual([0, 5, 20]);
  });

  test('reads approved ledger plus pending movement snapshots and locks current reservations', async () => {
    const conn = connection([issue()], [{ ...item(), returned_quantity: 5 }]);
    const result = await ProductionReturnService.validate(conn, inbound(), [item()]);
    expect(result.records[0].max_returnable_quantity).toBe(15);
    expect(conn.execute.mock.calls[0][0]).toContain('FOR UPDATE');
    const movementSql = conn.execute.mock.calls[2][0];
    expect(movementSql).toContain('UNION ALL');
    expect(movementSql).toContain("pd.finance_status = 'pending'");
    expect(movementSql).toContain('SUM(movement.issued_quantity)');
    expect(movementSql).not.toContain('actual_quantity');
    const reservation = conn.execute.mock.calls[3];
    expect(reservation[0]).toContain("i.status IN ('confirmed', 'completed')");
    expect(reservation[0]).toContain('FOR UPDATE');
    expect(reservation[1]).toEqual([10, 7, 7, 7]);
  });

  test.each([
    [{ quantity: 16 }, '超过'],
    [{ location_id: 9 }, '超过'],
    [{ batch_number: 'UNRELATED' }, '超过'],
    [{ batch_number: '' }, '原领料批次'],
    [{ quantity: -1 }, '大于零'],
  ])('rejects invalid return %j before inventory movement', async (change, message) => {
    const conn = connection([issue()], [{ ...item(), returned_quantity: 5 }]);
    await expect(
      ProductionReturnService.validate(conn, inbound(), [item(change)])
    ).rejects.toMatchObject({ httpStatus: 400, message: expect.stringContaining(message) });
  });

  test('duplicate request rows cannot each spend the same available quantity', async () => {
    await expect(
      ProductionReturnService.validate(connection(), inbound(), [item(), item({ quantity: 6 })])
    ).rejects.toMatchObject({ httpStatus: 400, message: expect.stringContaining('上限 5') });
  });

  test('unknown reference cannot be mistaken for a same-numbered outbound', async () => {
    const conn = connection();
    await expect(
      ProductionReturnService.validate(conn, inbound({ reference_type: 'purchase_order' }), [
        item(),
      ])
    ).rejects.toMatchObject({ httpStatus: 400 });
    expect(conn.execute).not.toHaveBeenCalled();
  });

  test('outbound references resolve their actual production task', async () => {
    const conn = connection();
    conn.execute.mockResolvedValueOnce([[{ reference_type: 'production_task', reference_id: 7 }]]);
    await expect(
      ProductionReturnService.resolveTaskId(
        conn,
        inbound({ reference_type: 'outbound', reference_id: 42 })
      )
    ).resolves.toBe(7);
    expect(conn.execute.mock.calls[0][1]).toEqual([42]);
  });
});
