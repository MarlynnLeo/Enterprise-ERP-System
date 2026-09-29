const {
  resolveArrivalQuantity,
  up,
} = require('../../migrations/20260929000001_preserve_outsourced_arrival_quantity');
const item = {
  id: 5,
  receipt_id: 1,
  receipt_no: 'R-1',
  product_id: 7,
  actual_quantity: 8,
  expected_quantity: 10,
  arrived_quantity: null,
};
const inspection = {
  reference_id: 1,
  reference_no: 'R-1',
  material_id: 7,
  quantity: 10,
  source_type: 'outsourced_receipt',
  inspection_type: 'incoming',
  deleted_at: null,
};

test('recovers the original 10 arrivals from an old receipt overwritten with 8 qualified units', () => {
  expect(resolveArrivalQuantity(item, [inspection])).toBe(10);
});
test('sums split arrivals and ignores other receipts, product lines, source types and deleted inspections', () => {
  expect(
    resolveArrivalQuantity(item, [
      { ...inspection, quantity: 4 },
      { ...inspection, quantity: 6 },
      { ...inspection, reference_id: 2 },
      { ...inspection, reference_no: 'R-2' },
      { ...inspection, material_id: 8 },
      { ...inspection, source_type: 'purchase_order' },
      { ...inspection, deleted_at: '2026-09-01' },
    ])
  ).toBe(10);
});
test('never overwrites an existing fact and does not infer impossible arrivals', () => {
  expect(resolveArrivalQuantity({ ...item, arrived_quantity: 9 }, [inspection])).toBe(9);
  expect(resolveArrivalQuantity(item, [inspection, inspection])).toBe(8);
  expect(resolveArrivalQuantity(item, [])).toBe(8);
});
test('the migration is idempotent and protects concurrent recorded arrivals', async () => {
  const updates = [];
  let selected = false;
  const knex = jest.fn((table) => {
    if (typeof table === 'object') {
      const chain = {};
      for (const method of ['join', 'select', 'whereNull', 'where', 'orderBy'])
        chain[method] = jest.fn(() => chain);
      chain.limit = jest.fn(async () => (selected ? [] : ((selected = true), [item])));
      return chain;
    }
    if (table === 'quality_inspections') {
      const chain = {};
      for (const method of ['select', 'whereIn', 'where']) chain[method] = jest.fn(() => chain);
      chain.whereNull = jest.fn(async () => [inspection]);
      return chain;
    }
    const chain = {
      where: jest.fn(() => chain),
      whereNull: jest.fn(() => chain),
      update: jest.fn(async (data) => updates.push(data)),
    };
    return chain;
  });
  knex.schema = { hasColumn: jest.fn(async () => true), alterTable: jest.fn() };
  await up(knex);
  await up(knex);
  expect(knex.schema.alterTable).not.toHaveBeenCalled();
  expect(updates).toEqual([{ arrived_quantity: 10 }]);
  const updateBuilder = knex.mock.results.find(
    (result, index) => knex.mock.calls[index][0] === 'outsourced_processing_receipt_items'
  ).value;
  expect(updateBuilder.whereNull).toHaveBeenCalledWith('arrived_quantity');
});
