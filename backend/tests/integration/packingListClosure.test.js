const { authRequest, clearCache } = require('../testHelper');
const db = require('../../src/config/db');

const prefix = `PACK-${Date.now()}`;
const fixture = { packingIds: [], customerIds: [] };
let api;
let input;
const dataOf = (response, status = 200) => {
  if (response.status !== status) throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.body)}`);
  return response.body.data;
};

describe('packing list write closure', () => {
beforeAll(async () => {
  api = await authRequest();
  const [unit] = await db.pool.query('INSERT INTO units (code, name, status) VALUES (?, ?, 1)', [prefix, '件']);
  fixture.unitId = unit.insertId;
  const [product] = await db.pool.query('INSERT INTO materials (code, name, unit_id, status) VALUES (?, ?, ?, 1)', [prefix, prefix, fixture.unitId]);
  fixture.productId = product.insertId;
  for (const suffix of ['A', 'B']) {
    const [customer] = await db.pool.query('INSERT INTO customers (code, name, status) VALUES (?, ?, 1)', [`${prefix}-${suffix}`, `${prefix}-${suffix}`]);
    fixture.customerIds.push(customer.insertId);
  }
  const [order] = await db.pool.query('INSERT INTO sales_orders (order_no, customer_id, total_amount, created_by, status) VALUES (?, ?, 0, 1, ?)', [prefix, fixture.customerIds[0], 'draft']);
  fixture.orderId = order.insertId;
  input = {
    customerId: fixture.customerIds[0], salesOrderId: fixture.orderId, packingDate: '2026-09-12',
    details: [2.5, 3.25].map((quantity, index) => ({ productId: fixture.productId, unitId: fixture.unitId, quantity, boxNo: `B${index + 1}`, weight: 1.2, volume: 0.4 })),
  };
});

afterAll(async () => {
  if (fixture.customerIds.length) {
    await db.pool.query('DELETE d FROM packing_list_details d JOIN packing_lists p ON p.id = d.packing_list_id WHERE p.customer_id IN (?)', [fixture.customerIds]);
    await db.pool.query('DELETE FROM packing_lists WHERE customer_id IN (?)', [fixture.customerIds]);
  }
  if (fixture.orderId) await db.pool.query('DELETE FROM sales_orders WHERE id = ?', [fixture.orderId]);
  if (fixture.customerIds.length) await db.pool.query('DELETE FROM customers WHERE id IN (?)', [fixture.customerIds]);
  if (fixture.productId) await db.pool.query('DELETE FROM materials WHERE id = ?', [fixture.productId]);
  if (fixture.unitId) await db.pool.query('DELETE FROM units WHERE id = ?', [fixture.unitId]);
  clearCache();
});

test('creation, editing and status transitions preserve packing quantities and linked master data', async () => {
  const created = dataOf(await api.post('/api/sales/packing-lists').send(input), 201);
  const first = dataOf(await api.get(`/api/sales/packing-lists/${created.id}`));
  expect(Number(first.totalBoxes)).toBe(2);
  expect(Number(first.totalQuantity)).toBe(5.75);
  const edited = { ...input, details: input.details.map(row => ({ ...row, quantity: row.quantity + 1 })) };
  dataOf(await api.put(`/api/sales/packing-lists/${created.id}`).send(edited));
  const updated = dataOf(await api.get(`/api/sales/packing-lists/${created.id}`));
  expect(Number(updated.totalBoxes)).toBe(2);
  expect(Number(updated.totalQuantity)).toBe(7.75);
  expect(updated.customerCode).toBe(`${prefix}-A`);
  expect(updated.salesOrderNo).toBe(prefix);
  expect(updated.details.map(row => row.boxNo)).toEqual(['B1', 'B2']);
  expect(updated.details.every(row => Number(row.weight) === 1.2 && row.unitCode === prefix)).toBe(true);
  for (const status of ['confirmed', 'packing', 'completed']) {
    dataOf(await api.patch(`/api/sales/packing-lists/${created.id}/status`).send({ status }));
  }
  expect((await api.put(`/api/sales/packing-lists/${created.id}`).send(edited)).status).toBe(409);
  const completed = dataOf(await api.get(`/api/sales/packing-lists/${created.id}`));
  expect(completed.status).toBe('completed');
  expect(Number(completed.totalQuantity)).toBe(7.75);
  expect(completed.details).toHaveLength(2);
});

test('rejects a different customer’s order and invalid detail quantities before creating a document', async () => {
  expect((await api.post('/api/sales/packing-lists').send({ ...input, customerId: fixture.customerIds[1] })).status).toBe(400);
  for (const quantity of [0, -1, 'not-a-number']) {
    expect((await api.post('/api/sales/packing-lists').send({ ...input, details: [{ ...input.details[0], quantity }] })).status).toBe(400);
  }
});

test('a status-only edit cannot erase the document header or details', async () => {
  const created = dataOf(await api.post('/api/sales/packing-lists').send(input), 201);
  expect((await api.put(`/api/sales/packing-lists/${created.id}`).send({ status: 'completed' })).status).toBe(400);
  const remaining = dataOf(await api.get(`/api/sales/packing-lists/${created.id}`));
  expect(remaining.status).toBe('draft');
  expect(remaining.customerId).toBe(fixture.customerIds[0]);
  expect(remaining.details).toHaveLength(2);
});
});
