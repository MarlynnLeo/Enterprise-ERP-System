const createKnex = require('knex');
const { randomBytes } = require('crypto');
const config = require('../../knexfile').test;
const { consistencyRules } = require('../../src/services/business/DataConsistencyRules');
const QuantityService = require('../../src/services/business/PurchaseOrderQuantityService');

let knex;
const tables = {
  purchase_orders: 'id INT PRIMARY KEY, order_no VARCHAR(30), deleted_at DATETIME NULL, created_at DATETIME',
  purchase_order_items: 'id INT PRIMARY KEY, order_id INT, material_id INT, quantity DECIMAL(10,2), received_quantity DECIMAL(10,2)',
  quality_inspections: 'id INT PRIMARY KEY, reference_id INT, purchase_order_item_id INT, material_id INT, inspection_type VARCHAR(30), source_type VARCHAR(30), status VARCHAR(30), quantity DECIMAL(10,2), qualified_quantity DECIMAL(10,2), unqualified_quantity DECIMAL(10,2), deleted_at DATETIME NULL',
  purchase_receipts: 'id INT PRIMARY KEY, order_id INT, inspection_id INT, status VARCHAR(30), deleted_at DATETIME NULL',
  purchase_receipt_items: 'id INT PRIMARY KEY, receipt_id INT, order_item_id INT, material_id INT, received_quantity DECIMAL(10,2), qualified_quantity DECIMAL(10,2)',
  purchase_returns: 'id INT PRIMARY KEY, status VARCHAR(30), deleted_at DATETIME NULL',
  purchase_return_items: 'id INT PRIMARY KEY, return_id INT, receipt_item_id INT, return_quantity DECIMAL(10,2)',
  document_links: 'source_type VARCHAR(40), source_id INT, target_type VARCHAR(40), target_id INT, link_type VARCHAR(30)',
};
const prefix = `receipt_audit_${randomBytes(5).toString('hex')}_`;
const fixtureTable = name => knex(`${prefix}${name}`);
const fixtureSql = sql => sql.replace(new RegExp(`\\b(${Object.keys(tables).join('|')})\\b`, 'g'), `${prefix}$1`);

beforeAll(async () => {
  knex = createKnex({ ...config, pool: { min: 1, max: 1 } });
  // The reconciliation query references tables repeatedly, which MySQL does
  // not support with TEMPORARY tables. Unique tables live only in the test DB.
  for (const [name, fields] of Object.entries(tables)) {
    await knex.raw(`CREATE TABLE ?? (${fields})`, [`${prefix}${name}`]);
  }
  await fixtureTable('purchase_orders').insert({ id: 1, order_no: 'PO-1', created_at: '2099-01-01' });
  await fixtureTable('purchase_order_items').insert({ id: 2, order_id: 1, material_id: 3, quantity: 10, received_quantity: 7 });
  await fixtureTable('quality_inspections').insert({ id: 4, reference_id: 1, purchase_order_item_id: 2, material_id: 3, inspection_type: 'incoming', source_type: 'purchase_order', status: 'partial', quantity: 10, qualified_quantity: 6, unqualified_quantity: 4 });
  await fixtureTable('purchase_receipts').insert([
    { id: 5, order_id: 1, inspection_id: 4, status: 'completed' },
    { id: 6, order_id: 1, inspection_id: 4, status: 'inspected' },
  ]);
  await fixtureTable('purchase_receipt_items').insert([
    { id: 7, receipt_id: 5, order_item_id: 2, material_id: 3, received_quantity: 10, qualified_quantity: 6 },
    { id: 8, receipt_id: 6, order_item_id: 2, material_id: 3, received_quantity: 3, qualified_quantity: 3 },
  ]);
  await fixtureTable('document_links').insert({ source_type: 'nonconforming_product', source_id: 9, target_type: 'purchase_receipt', target_id: 6, link_type: 'generate' });
  await fixtureTable('purchase_returns').insert({ id: 10, status: 'completed' });
  await fixtureTable('purchase_return_items').insert({ id: 11, return_id: 10, receipt_item_id: 7, return_quantity: 2 });
});

afterAll(async () => {
  if (!knex) return;
  try {
    for (const name of Object.keys(tables)) await knex.schema.dropTableIfExists(`${prefix}${name}`);
  } finally {
    await knex.destroy();
  }
});

test('quantity reconciliation and audit both count approved concessions in addition to the original verdict', async () => {
  const connection = { query: (sql, values) => knex.raw(fixtureSql(sql), values) };
  const quantities = await QuantityService.read(connection, 1);
  expect(quantities.lines.get(2)).toMatchObject({ received: 7, reserved: 7, qualified: 6, returned: 2 });
  const rule = consistencyRules.find(({ id }) => id === 'purchase.order_received_quantity_matches_receipts');
  const auditSql = fixtureSql(rule.sql);
  const [consistent] = await knex.raw(auditSql);
  expect(consistent).toEqual([]);

  await fixtureTable('purchase_order_items').where('id', 2).update({ received_quantity: 4 });
  const [mismatches] = await knex.raw(auditSql);
  expect(mismatches).toHaveLength(1);
  expect(Number(mismatches[0].source_quantity)).toBe(7);
});
