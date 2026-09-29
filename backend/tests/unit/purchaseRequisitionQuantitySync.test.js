const PurchaseOrderService = require('../../src/services/PurchaseOrderService');

const material = (quantity, materialId = 10, extra = {}) => ({
  material_id: materialId,
  material_code: materialId === 10 ? '4003003015' : `M-${materialId}`,
  quantity,
  ...extra,
});

// Model persisted quantities so allocation and completion read the actual result
// of synchronization, including other orders against the same requisition.
function fixture({ requested, previous, other = [], status = 'completed', exists = true }) {
  const state = {
    requisition: { id: 1, requisition_number: 'PR-1', status },
    requested: requested.map((item, index) => ({ id: index + 1, ...item })),
    previous: previous.map((item) => ({ ...item })),
    other: other.map((item) => ({ ...item })),
    writes: [],
  };
  const connection = {
    query: jest.fn(async (sql, params = []) => {
      const statement = sql.replace(/\s+/g, ' ').trim();
      if (statement.startsWith('SELECT') && statement.includes('FROM purchase_requisitions ')) {
        return [exists ? [{ ...state.requisition }] : []];
      }
      if (
        statement.startsWith('SELECT') &&
        statement.includes('FROM purchase_requisition_items ')
      ) {
        return [state.requested.map((item) => ({ ...item }))];
      }
      if (statement.startsWith('SELECT material_id, quantity FROM purchase_order_items')) {
        return [state.previous.map((item) => ({ ...item }))];
      }
      if (statement.startsWith('SELECT poi.material_id, poi.quantity')) {
        return [state.other.map((item) => ({ ...item }))];
      }
      if (statement.startsWith('SELECT poi.material_id, poi.material_code, SUM')) {
        const ordered = new Map();
        for (const item of [...state.previous, ...state.other]) {
          const key = Number(item.material_id);
          const row = ordered.get(key) || { ...item, ordered_quantity: 0 };
          row.ordered_quantity += Number(item.quantity);
          ordered.set(key, row);
        }
        return [[...ordered.values()]];
      }
      if (statement.startsWith('UPDATE purchase_requisition_items SET quantity = ?')) {
        const item = state.requested.find((row) => row.id === params[1]);
        if (!item || params[2] !== 1) throw new Error('Unexpected requisition item update');
        item.quantity = params[0];
        state.writes.push({ table: 'items', id: item.id, quantity: item.quantity });
        return [{ affectedRows: 1 }];
      }
      if (statement.startsWith('UPDATE purchase_requisitions SET status = ?')) {
        state.requisition.status = params[0];
        state.writes.push({ table: 'requisition', status: params[0] });
        return [{ affectedRows: 1 }];
      }
      if (statement.startsWith('UPDATE purchase_requisitions SET updated_at = CURRENT_TIMESTAMP')) {
        state.writes.push({ table: 'requisition', touched: true });
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected query: ${statement}`);
    }),
  };
  const sync = (next) =>
    PurchaseOrderService.syncRequisitionQuantitiesForOrderEdit(connection, 1, 7, next);
  const save = async (next) => {
    await sync(next);
    await PurchaseOrderService.validateRequisitionAllocation(connection, 1, next, 7);
    state.previous = next.map((item) => ({ ...item }));
    return PurchaseOrderService.syncRequisitionStatusFromOrders(connection, 1);
  };
  const required = (materialId = 10) =>
    state.requested
      .filter((item) => item.material_id === materialId)
      .reduce((total, item) => total + Number(item.quantity), 0);
  return { state, connection, sync, save, required };
}

describe('purchase order quantity edits synchronize requisition quantities', () => {
  test('allows the reported 3663 to 100000 edit and keeps the requisition completed', async () => {
    const model = fixture({ requested: [material(3663)], previous: [material(3663)] });

    const result = await model.save([material(100000)]);

    expect(model.required()).toBe(100000);
    expect(result).toMatchObject({
      status: 'completed',
      totalRequired: 100000,
      totalOrdered: 100000,
    });
  });

  test('reduces the source quantity when a fully allocated order quantity decreases', async () => {
    const model = fixture({ requested: [material(100000)], previous: [material(100000)] });

    const result = await model.save([material(3663)]);

    expect(model.required()).toBe(3663);
    expect(result).toMatchObject({ completed: true, totalRequired: 3663, totalOrdered: 3663 });
  });

  test.each([500, 100])(
    'preserves other orders and unused demand when changing a split order to %s',
    async (nextQuantity) => {
      const model = fixture({
        requested: [material(1000)],
        previous: [material(300)],
        other: [material(200)],
        status: 'approved',
      });

      const result = await model.save([material(nextQuantity)]);

      expect(model.required()).toBe(1000 + nextQuantity - 300);
      expect(model.state.other).toEqual([material(200)]);
      expect(result.totalRequired - result.totalOrdered).toBe(500);
      expect(result.status).toBe('approved');
    }
  );

  test('applies one aggregate positive difference for duplicate lines in both documents', async () => {
    const model = fixture({
      requested: [material(5), material(5)],
      previous: [material(4), material(6)],
    });

    await model.save([material(10), material(20)]);

    expect(model.required()).toBe(30);
    expect(model.state.requested.map((item) => item.quantity)).toEqual([5, 25]);
  });

  test('spreads a decrease over duplicate source rows while preserving their IDs and positive quantities', async () => {
    const model = fixture({
      requested: [material(5), material(5)],
      previous: [material(4), material(6)],
    });

    const result = await model.save([material(0.1), material(0.15)]);

    expect(model.state.requested.map(({ id, quantity }) => ({ id, quantity }))).toEqual([
      { id: 1, quantity: 0.24 },
      { id: 2, quantity: 0.01 },
    ]);
    expect(model.required()).toBe(0.25);
    expect(result.completed).toBe(true);
  });

  test('does not rewrite a requisition when only the order price changes', async () => {
    const model = fixture({
      requested: [material(10)],
      previous: [material(10, 10, { price: 1 })],
    });

    await model.save([material(10, 10, { price: 5 })]);

    expect(model.required()).toBe(10);
    expect(model.state.writes).toEqual([]);
  });

  test('does not rewrite quantities when duplicate order lines are regrouped without changing their total', async () => {
    const model = fixture({ requested: [material(10)], previous: [material(4), material(6)] });

    await model.save([material(10)]);

    expect(model.state.writes).toEqual([]);
  });

  test('new material lines still consume the existing requisition remainder', async () => {
    const model = fixture({
      requested: [material(10), material(8, 20)],
      previous: [material(10)],
      status: 'approved',
    });

    const result = await model.save([material(10), material(3, 20)]);

    expect(model.required(20)).toBe(8);
    expect(model.state.writes).toEqual([]);
    expect(result.status).toBe('approved');
    expect(result.totalRequired - result.totalOrdered).toBe(5);
  });

  test('new material lines cannot bypass their existing allocation limit', async () => {
    const model = fixture({ requested: [material(10), material(8, 20)], previous: [material(10)] });

    await expect(model.save([material(10), material(9, 20)])).rejects.toThrow(
      '采购数量超过申请剩余可采购量'
    );

    expect(model.required(20)).toBe(8);
    expect(model.state.writes).toEqual([]);
  });

  test('removing a material releases its allocation without deleting the original demand', async () => {
    const model = fixture({
      requested: [material(10), material(8, 20)],
      previous: [material(10), material(8, 20)],
    });

    const result = await model.save([material(10)]);

    expect(model.required(20)).toBe(8);
    expect(result).toMatchObject({ status: 'approved', totalRequired: 18, totalOrdered: 10 });
    expect(model.state.writes.filter((write) => write.table === 'items')).toEqual([]);
  });

  test.each([false, true])(
    'rejects materials outside the requisition (previously present: %s)',
    async (presentBefore) => {
      const model = fixture({
        requested: [material(10)],
        previous: presentBefore ? [material(10), material(1, 20)] : [material(10)],
      });

      await expect(model.save([material(10), material(2, 20)])).rejects.toThrow(
        '采购订单包含不属于来源申请的物料'
      );

      expect(model.state.writes).toEqual([]);
    }
  );

  test('repeated decimal edits preserve the unused quantity without floating point drift', async () => {
    const model = fixture({
      requested: [material('0.30')],
      previous: [material('0.10')],
      status: 'approved',
    });

    for (const next of ['0.20', '0.10', '0.29', '0.01']) {
      await model.save([material(next)]);
    }

    expect(model.required()).toBe(0.21);
    expect(model.state.requested[0].quantity).toBe(0.21);
  });

  test.each(['draft', 'submitted', 'rejected'])(
    'rejects a source requisition in status %s before writing',
    async (status) => {
      const model = fixture({ requested: [material(10)], previous: [material(10)], status });

      await expect(model.sync([material(20)])).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });

      expect(model.state.writes).toEqual([]);
    }
  );

  test('returns not found for a removed requisition', async () => {
    const model = fixture({ requested: [], previous: [material(10)], exists: false });

    await expect(model.sync([material(20)])).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });

    expect(model.state.writes).toEqual([]);
  });

  test.each([0, -1, '0.001', 100000000, 'invalid', Infinity])(
    'rejects invalid order quantity %s before writing',
    async (quantity) => {
      const model = fixture({ requested: [material(10)], previous: [material(10)] });

      await expect(model.sync([material(quantity)])).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });

      expect(model.state.writes).toEqual([]);
    }
  );

  test('accepts the single-line minimum and maximum quantities', async () => {
    const model = fixture({ requested: [material(10)], previous: [material(10)] });

    await model.save([material(0.01)]);
    expect(model.required()).toBe(0.01);
    await model.save([material(99999999.99)]);
    expect(model.required()).toBe(99999999.99);
  });

  test('rejects a total too small to retain all duplicate source rows before writing any changes', async () => {
    const model = fixture({ requested: [material(5), material(5)], previous: [material(10)] });

    await expect(model.sync([material(0.01)])).rejects.toThrow('请检查同物料的重复明细');

    expect(model.required()).toBe(10);
    expect(model.state.writes).toEqual([]);
  });

  test('spreads increases across duplicate source rows when one reaches the column maximum', async () => {
    const model = fixture({
      requested: [material(99999998.99), material(99999999.99)],
      previous: [material(1)],
      status: 'approved',
    });

    await model.save([material(2)]);

    expect(model.state.requested.map((item) => item.quantity)).toEqual([99999999.99, 99999999.99]);
  });

  test('rejects source column overflow before writing a partly synchronized requisition', async () => {
    const model = fixture({ requested: [material(99999999.99)], previous: [material(1)] });

    await expect(model.sync([material(2)])).rejects.toThrow(
      '申请明细数量须在0.01至99999999.99之间'
    );

    expect(model.state.writes).toEqual([]);
  });

  test('keeps the allocation check for historical orders already above source demand', async () => {
    const model = fixture({ requested: [material(10)], previous: [material(12)] });

    await expect(model.save([material(20)])).rejects.toThrow('采购数量超过申请剩余可采购量');

    // The service applies the delta, never an unrequested repair to cover 20.
    // The controller owns the transaction and rolls this rejected edit back.
    expect(model.required()).toBe(18);
  });
});
