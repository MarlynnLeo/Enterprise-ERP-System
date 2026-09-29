const service = require('../../src/services/business/SalesExchangeCostService');
const shipment = {
  outbound_id: 1,
  outbound_no: 'SO-1',
  item_id: 5,
  product_id: 8,
  quantity: 2,
  material_quantity: 2,
};
const ledger = {
  reference_no: 'SO-1',
  material_id: 8,
  quantity: 2,
  total_value: 20,
  missing_cost: 0,
  source_line_key: 'sales_outbound:1:item:5:1:B1',
};
const connectionFor = (shipments, ledgers) => ({
  query: jest.fn().mockResolvedValueOnce([shipments]).mockResolvedValueOnce([ledgers]),
});

test('uses the actual original shipment cost and never reads current material prices', async () => {
  const connection = connectionFor([shipment], [ledger]);
  expect((await service.getReturnCosts(connection, { orderId: 9, outboundId: 1 })).get(8)).toBe(10);
  expect(connection.query.mock.calls[0][1]).toEqual([9, 1, 1]);
  expect(connection.query.mock.calls.every(([sql]) => !/materials|standard_costs/.test(sql))).toBe(
    true
  );
});

test('weights the original FIFO batches, keeping the returned value equal to original cost', async () => {
  const connection = connectionFor(
    [{ ...shipment, quantity: 3, material_quantity: 3 }],
    [
      { ...ledger, quantity: 1, total_value: 10 },
      { ...ledger, source_line_key: 'sales_outbound:1:item:5:1:B2', quantity: 2, total_value: 40 },
    ]
  );
  const costs = await service.getReturnCosts(connection, { orderId: 9 });
  expect(costs.get(8)).toBe(16.666667);
});

test('isolates the requested order line when a combined shipment uses another order with a different cost', async () => {
  const connection = connectionFor(
    [{ ...shipment, material_quantity: 4 }],
    [ledger, { ...ledger, source_line_key: 'sales_outbound:1:item:6:1:B2', total_value: 200 }]
  );
  expect((await service.getReturnCosts(connection, { orderId: 9 })).get(8)).toBe(10);
});

test('supports unambiguous legacy shipment costs without line keys', async () => {
  const connection = connectionFor([shipment], [{ ...ledger, source_line_key: null }]);
  expect((await service.getReturnCosts(connection, { orderId: 9 })).get(8)).toBe(10);
});

test('does not reuse another line cost when duplicate product lines have incomplete modern postings', async () => {
  const connection = connectionFor(
    [
      { ...shipment, quantity: 1, material_quantity: 2 },
      { ...shipment, item_id: 6, quantity: 1, material_quantity: 2 },
    ],
    [{ ...ledger, quantity: 1, total_value: 10 }]
  );
  await expect(service.getReturnCosts(connection, { orderId: 9 })).rejects.toThrow(
    '缺少完整已过账库存成本'
  );
});

test('only queries products actually being returned, not unrelated order products', async () => {
  const connection = connectionFor([shipment], [ledger]);
  await service.getReturnCosts(connection, { orderId: 9, materialIds: [8] });
  expect(connection.query.mock.calls[0][0]).toContain('AND i.product_id IN (?)');
  expect(connection.query.mock.calls[0][1]).toEqual([9, null, null, [8]]);
});

test.each([
  ['missing ledger', shipment, []],
  ['partial ledger', shipment, [{ ...ledger, quantity: 1, total_value: 10 }]],
  ['zero cost', shipment, [{ ...ledger, total_value: 0, missing_cost: 1 }]],
  [
    'ambiguous legacy combined shipment',
    { ...shipment, material_quantity: 4 },
    [{ ...ledger, quantity: 4, source_line_key: null }],
  ],
])('fails closed on %s instead of falling back to current costs', async (_, item, ledgers) => {
  await expect(
    service.getReturnCosts(connectionFor([item], ledgers), { orderId: 9 })
  ).rejects.toThrow('缺少完整已过账库存成本');
});
