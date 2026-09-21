const createKnex = require('knex');
const migration = require('../../migrations/20260920000001_purchase_receipt_inspection_lifecycle');
const config = require('../../knexfile').test;

// A dedicated connection owns temporary tables. They shadow the real table
// names for this migration and disappear when the connection closes.
let knex;

beforeAll(() => {
  knex = createKnex({ ...config, pool: { min: 1, max: 1 } });
});

beforeEach(async () => {
  for (const table of ['purchase_receipts', 'purchase_receipt_items', 'purchase_order_items', 'quality_inspections', 'business_types', 'nonconforming_products', 'document_links']) {
    await knex.raw('DROP TEMPORARY TABLE IF EXISTS ??', [table]);
  }
  await knex.raw(`CREATE TEMPORARY TABLE purchase_receipts (
    id INT PRIMARY KEY, inspection_id INT NULL, order_id INT, supplier_id INT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft', deleted_at DATETIME NULL
  )`);
  await knex.raw(`CREATE TEMPORARY TABLE quality_inspections (
    id INT PRIMARY KEY, inspection_type VARCHAR(20), source_type VARCHAR(30),
    reference_id INT, supplier_id INT, status VARCHAR(20), purchase_order_item_id INT,
    material_id INT, batch_no VARCHAR(100),
    quantity DECIMAL(12,4), qualified_quantity DECIMAL(12,4),
    unqualified_quantity DECIMAL(12,4), deleted_at DATETIME NULL
  )`);
  await knex.raw(`CREATE TEMPORARY TABLE purchase_order_items (
    id INT PRIMARY KEY, order_id INT, material_id INT
  )`);
  await knex.raw(`CREATE TEMPORARY TABLE purchase_receipt_items (
    id INT AUTO_INCREMENT PRIMARY KEY, receipt_id INT, order_item_id INT, material_id INT,
    batch_number VARCHAR(100), quantity DECIMAL(12,4), received_quantity DECIMAL(12,4),
    qualified_quantity DECIMAL(12,4)
  )`);
  await knex('purchase_order_items').insert({ id: 301, order_id: 101, material_id: 401 });
  await knex.raw(`CREATE TEMPORARY TABLE nonconforming_products (
    id INT PRIMARY KEY, inspection_id INT, material_id INT, supplier_id INT,
    batch_no VARCHAR(100), quantity DECIMAL(12,4), status VARCHAR(20), disposition VARCHAR(30),
    concession_status VARCHAR(20), deleted_at DATETIME NULL
  )`);
  await knex.raw(`CREATE TEMPORARY TABLE document_links (
    id INT AUTO_INCREMENT PRIMARY KEY, source_id INT, target_id INT,
    source_type VARCHAR(50), target_type VARCHAR(50), link_type VARCHAR(30)
  )`);
  await knex.raw(`CREATE TEMPORARY TABLE business_types (
    id INT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(50), name VARCHAR(100),
    group_code VARCHAR(50), category VARCHAR(50), tag_type VARCHAR(20),
    sort_order INT, is_system TINYINT, status TINYINT,
    created_at DATETIME, updated_at DATETIME, UNIQUE KEY group_code_code (group_code, code)
  )`);
});

afterAll(async () => {
  if (knex) await knex.destroy();
});

function inspection(id, values = {}) {
  return {
    id,
    inspection_type: 'incoming',
    source_type: 'purchase_order',
    reference_id: 101,
    supplier_id: 201,
    purchase_order_item_id: 301,
    material_id: 401,
    batch_no: `BATCH-${id}`,
    status: 'passed',
    quantity: 10,
    qualified_quantity: 10,
    unqualified_quantity: 0,
    ...values,
  };
}

function receipt(id, inspectionId, status = 'draft') {
  return { id, inspection_id: inspectionId, order_id: 101, supplier_id: 201, status };
}

function receiptItem(receiptId, source, values = {}) {
  return {
    receipt_id: receiptId,
    order_item_id: 301,
    material_id: 401,
    batch_number: source.batch_no,
    quantity: source.quantity,
    received_quantity: source.quantity,
    qualified_quantity: source.qualified_quantity,
    ...values,
  };
}

test('converts only proven inspection facts and preserves completed/cancelled business records', async () => {
  const inspections = [
    inspection(1),
    inspection(2, { status: 'partial', qualified_quantity: 6, unqualified_quantity: 4 }),
    inspection(3, { status: 'failed', qualified_quantity: 0, unqualified_quantity: 10 }),
    inspection(4, { status: 'completed', qualified_quantity: 0, unqualified_quantity: 10 }),
    inspection(5, { status: 'pending' }),
    inspection(6, { status: 'in_progress' }),
    inspection(7, { status: 'conditional' }),
    inspection(8, { status: 'completed', qualified_quantity: null, unqualified_quantity: null }),
    inspection(9, { status: 'completed', qualified_quantity: 6, unqualified_quantity: 2 }),
    inspection(10, { status: 'passed', qualified_quantity: 0, unqualified_quantity: 10 }),
    inspection(11, { status: 'failed' }),
    inspection(12, { status: 'partial' }),
    inspection(13, { inspection_type: 'final' }),
    inspection(14, { source_type: 'outsourced_receipt' }),
    inspection(15, { reference_id: 102 }),
    inspection(16, { supplier_id: 202 }),
    inspection(17, { deleted_at: '2026-09-01 00:00:00' }),
    inspection(18, { status: 'completed', qualified_quantity: -1, unqualified_quantity: 11 }),
    inspection(19, { quantity: 0, qualified_quantity: 0, unqualified_quantity: 0 }),
    inspection(20, { source_type: null }),
    inspection(21, { source_type: '' }),
  ];
  await knex('quality_inspections').insert(inspections);
  await knex('purchase_receipts').insert([
    ...inspections.map((item) => receipt(item.id, item.id, item.id % 2 ? 'draft' : 'confirmed')),
    receipt(30, null, 'confirmed'),
    receipt(31, 999, 'confirmed'),
    receipt(32, null, 'draft'),
    receipt(33, null, 'completed'),
    receipt(34, 1, 'cancelled'),
    receipt(35, 1, 'inspected'),
  ]);
  await knex('purchase_receipt_items').insert(inspections.map(item => receiptItem(item.id, item)));

  await migration.up(knex);

  const rows = await knex('purchase_receipts').select('id', 'status').orderBy('id');
  const inspectedIds = new Set([1, 2, 3, 4, 20, 21, 35]);
  for (const row of rows) {
    const expected =
      row.id === 33
        ? 'completed'
        : row.id === 34
          ? 'cancelled'
          : inspectedIds.has(row.id)
            ? 'inspected'
            : 'draft';
    expect(row).toEqual({ id: row.id, status: expected });
  }
  // Receipt 32 shares an order with completed inspections but has no direct link.
  expect(rows.find((row) => row.id === 32).status).toBe('draft');
  const [[column]] = await knex.raw("SHOW COLUMNS FROM purchase_receipts LIKE 'status'");
  expect(column.Type).toBe("enum('draft','inspected','completed','cancelled')");
  expect(column.Default).toBe('draft');
  await expect(knex('purchase_receipts').insert(receipt(99, null, 'confirmed'))).rejects.toThrow();
});

test('seeds the complete dictionary, removes confirmed, and can resume safely after a partial deployment', async () => {
  await knex('business_types').insert([
    { group_code: 'purchase_receipt_status', code: 'confirmed', name: '已确认', status: 1 },
    { group_code: 'purchase_receipt_status', code: 'legacy', name: '旧状态', status: 1 },
    { group_code: 'purchase_order_status', code: 'confirmed', name: '已确认', status: 1 },
  ]);
  await knex('quality_inspections').insert(inspection(1));
  await knex('purchase_receipts').insert(receipt(1, 1));
  await knex('purchase_receipt_items').insert(receiptItem(1, inspection(1)));

  await migration.up(knex);
  await migration.up(knex);

  const dictionary = await knex('business_types')
    .where({ group_code: 'purchase_receipt_status', status: 1 })
    .select('code', 'name', 'is_system')
    .orderBy('sort_order');
  expect(dictionary).toEqual([
    { code: 'draft', name: '草稿', is_system: 1 },
    { code: 'inspected', name: '已检验', is_system: 1 },
    { code: 'completed', name: '已完成', is_system: 1 },
    { code: 'cancelled', name: '已取消', is_system: 1 },
  ]);
  expect(
    await knex('business_types').where({ group_code: 'purchase_receipt_status', code: 'confirmed' })
  ).toEqual([]);
  expect(
    await knex('business_types').where({ group_code: 'purchase_order_status', code: 'confirmed' })
  ).toHaveLength(1);
  expect((await knex('purchase_receipts').first()).status).toBe('inspected');
});

test('rejects unknown stored states before enum conversion and leaves data intact', async () => {
  await knex('purchase_receipts').insert(receipt(1, null, 'unrecognized'));
  await expect(migration.up(knex)).rejects.toThrow('Unknown purchase_receipts.status');
  const [[column]] = await knex.raw("SHOW COLUMNS FROM purchase_receipts LIKE 'status'");
  expect(column.Type).toBe('varchar(20)');
  expect((await knex('purchase_receipts').first()).status).toBe('unrecognized');
});

test('refuses rollback rather than reporting a successful downgrade of irreversible states', async () => {
  await expect(migration.down(knex)).rejects.toThrow('migration is irreversible');
});

test.each([
  ['unknown source line', { order_item_id: 999 }],
  ['different material', { material_id: 402 }],
  ['different batch', { batch_number: 'batch-1' }],
  ['different quantity', { quantity: 9 }],
  ['different received quantity', { received_quantity: 9 }],
  ['different qualified quantity', { qualified_quantity: 9 }],
])('does not establish inspection for a receipt with %s', async (_name, values) => {
  await knex('quality_inspections').insert(inspection(1));
  await knex('purchase_receipts').insert(receipt(1, 1, 'confirmed'));
  await knex('purchase_receipt_items').insert(receiptItem(1, inspection(1), values));
  await migration.up(knex);
  expect((await knex('purchase_receipts').first()).status).toBe('draft');
});

test('does not collapse multiple receipt lines into one proven inspection', async () => {
  await knex('quality_inspections').insert(inspection(1));
  await knex('purchase_receipts').insert(receipt(1, 1, 'confirmed'));
  await knex('purchase_receipt_items').insert([receiptItem(1, inspection(1)), receiptItem(1, inspection(1))]);
  await migration.up(knex);
  expect((await knex('purchase_receipts').first()).status).toBe('draft');
});

async function seedConcession({ receiptId = 1, inspectionId = 1, ncpId = 1, quantity = 4, ncp = {}, item = {}, status = 'draft' } = {}) {
  await knex('nonconforming_products').insert({
    id: ncpId, inspection_id: inspectionId, material_id: 401, supplier_id: 201,
    batch_no: `BATCH-${inspectionId}`, quantity: 10, status: 'completed',
    disposition: 'use_as_is', concession_status: 'approved', ...ncp,
  });
  await knex('purchase_receipts').insert(receipt(receiptId, inspectionId, status));
  await knex('purchase_receipt_items').insert(receiptItem(receiptId, inspection(inspectionId), {
    quantity, received_quantity: quantity, qualified_quantity: quantity, ...item,
  }));
  await knex('document_links').insert({
    source_id: ncpId, target_id: receiptId, source_type: 'nonconforming_product',
    target_type: 'purchase_receipt', link_type: 'generate',
  });
}

test('migrates an approved concession by its disposition evidence without changing the failed verdict', async () => {
  await knex('quality_inspections').insert(inspection(1, { status: 'failed', qualified_quantity: 0, unqualified_quantity: 10 }));
  await seedConcession({ item: { order_item_id: null } });
  await migration.up(knex);
  await migration.up(knex);
  expect((await knex('purchase_receipts').first()).status).toBe('inspected');
  expect((await knex('quality_inspections').first()).status).toBe('failed');
  expect(Number((await knex('purchase_receipt_items').first()).qualified_quantity)).toBe(4);
  expect((await knex('purchase_receipt_items').first()).order_item_id).toBe(301);
});

test.each([
  ['unapproved disposition', { ncp: { concession_status: 'pending' } }],
  ['cancelled disposition', { ncp: { status: 'cancelled' } }],
  ['deleted disposition', { ncp: { deleted_at: '2026-09-01' } }],
  ['different source inspection', { ncp: { inspection_id: 2 } }],
  ['different supplier', { ncp: { supplier_id: 202 } }],
  ['different source line', { item: { order_item_id: 302 } }],
  ['different batch', { item: { batch_number: 'BATCH-OTHER' } }],
  ['excess receipt quantity', { quantity: 11 }],
  ['excess approved quantity', { ncp: { quantity: 11 } }],
])('keeps concession with %s unproven', async (_name, values) => {
  await knex('quality_inspections').insert(inspection(1, { status: 'failed', qualified_quantity: 0, unqualified_quantity: 10 }));
  await seedConcession(values);
  await migration.up(knex);
  expect((await knex('purchase_receipts').first()).status).toBe('draft');
});

test('counts completed concessions across dispositions against the same rejected stock allowance', async () => {
  await knex('quality_inspections').insert(inspection(1, { status: 'failed', qualified_quantity: 0, unqualified_quantity: 10 }));
  await seedConcession({ receiptId: 1, ncpId: 1, quantity: 7, status: 'completed' });
  await seedConcession({ receiptId: 2, ncpId: 2, quantity: 4, status: 'confirmed' });
  await migration.up(knex);
  expect(await knex('purchase_receipts').select('id', 'status').orderBy('id')).toEqual([
    { id: 1, status: 'completed' }, { id: 2, status: 'draft' },
  ]);
});

test('requires a unique disposition link and never infers a source line from a repeated material', async () => {
  await knex('quality_inspections').insert(inspection(1, { status: 'failed', qualified_quantity: 0, unqualified_quantity: 10, purchase_order_item_id: null }));
  await knex('purchase_order_items').insert({ id: 302, order_id: 101, material_id: 401 });
  await seedConcession({ item: { order_item_id: null } });
  await knex('document_links').insert({
    source_id: 1, target_id: 1, source_type: 'nonconforming_product', target_type: 'purchase_receipt', link_type: 'generate',
  });
  await migration.up(knex);
  expect((await knex('purchase_receipts').first()).status).toBe('draft');
  expect((await knex('purchase_receipt_items').first()).order_item_id).toBeNull();
});

test('counts multiple receipts against one approved disposition quantity', async () => {
  await knex('quality_inspections').insert(inspection(1, { status: 'failed', qualified_quantity: 0, unqualified_quantity: 10 }));
  await seedConcession({ quantity: 4, ncp: { quantity: 6 } });
  await knex('purchase_receipts').insert(receipt(2, 1, 'confirmed'));
  await knex('purchase_receipt_items').insert(receiptItem(2, inspection(1), { quantity: 3, received_quantity: 3, qualified_quantity: 3 }));
  await knex('document_links').insert({ source_id: 1, target_id: 2, source_type: 'nonconforming_product', target_type: 'purchase_receipt', link_type: 'generate' });
  await migration.up(knex);
  expect((await knex('purchase_receipts').orderBy('id')).map(row => row.status)).toEqual(['draft', 'draft']);
});
