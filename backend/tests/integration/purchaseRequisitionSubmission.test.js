const mysql = require('mysql2/promise');

jest.mock('../../src/config/db', () => ({
  pool: { getConnection: jest.fn(), execute: jest.fn(), query: jest.fn() },
}));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  assertAccess: jest.fn(),
  applyListScope: jest.fn(),
}));
jest.mock('../../src/models/purchase', () => ({ generateOrderNo: jest.fn() }));
jest.mock('../../src/services/business/PurchasePriceService', () => ({
  resolvePurchasePrices: jest.fn(),
}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({ tryAutoLink: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { pool } = require('../../src/config/db');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const purchaseModel = require('../../src/models/purchase');
const PurchasePriceService = require('../../src/services/business/PurchasePriceService');
const DocumentLinkService = require('../../src/services/business/DocumentLinkService');
const {
  getRequisitions,
  updateRequisitionStatus,
  updateRequisition,
} = require('../../src/controllers/business/purchase/purchaseRequisitionController');

// Real controller, order generator, material validation and order persistence run
// on connection-local tables only. No application table receives fixture writes.
const tableNames = [
  'purchase_order_items',
  'purchase_orders',
  'purchase_requisition_items',
  'purchase_requisitions',
  'materials',
  'suppliers',
  'units',
  'users',
];
let connection;
let transactionConnection;
let tablesReady = false;
let nextOrderNo = 1;

beforeAll(async () => {
  if (!/(test|uat)/i.test(process.env.DB_NAME || '')) {
    throw new Error('Requisition submission integration tests require an isolated test database');
  }
  connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    decimalNumbers: true,
  });
  for (const table of tableNames) {
    // MySQL cannot use the same identifier as both CREATE target and LIKE source.
    await connection.query(`CREATE TEMPORARY TABLE fixture_${table} LIKE ${table}`);
    await connection.query(`CREATE TEMPORARY TABLE ${table} LIKE fixture_${table}`);
    await connection.query(`DROP TEMPORARY TABLE fixture_${table}`);
  }
  // This test database predates the nullable supplier column already present in
  // the running application schema. Align only the connection-local fixture.
  await connection.query('ALTER TABLE purchase_orders MODIFY supplier_id INT NULL');
  await connection.query(`CREATE TEMPORARY TABLE document_links (
    id INT AUTO_INCREMENT PRIMARY KEY, source_type VARCHAR(50), source_id INT,
    target_type VARCHAR(50), target_id INT
  ) ENGINE=InnoDB`);
  transactionConnection = {
    query: connection.query.bind(connection),
    execute: connection.execute.bind(connection),
    beginTransaction: jest.fn(() => connection.beginTransaction()),
    commit: jest.fn(() => connection.commit()),
    rollback: jest.fn(() => connection.rollback()),
    release: jest.fn(),
  };
  tablesReady = true;
});

beforeEach(async () => {
  if (!tablesReady) throw new Error('Temporary test tables were not initialized');
  await connection.rollback();
  for (const table of ['document_links', ...tableNames]) {
    await connection.query(`DELETE FROM ${table}`);
  }
  nextOrderNo = 1;
  ScopeGuard.assertAccess.mockResolvedValue(true);
  ScopeGuard.applyListScope.mockResolvedValue({ join: '', where: '', params: [] });
  pool.getConnection.mockResolvedValue(transactionConnection);
  pool.query.mockImplementation((...args) => connection.query(...args));
  pool.execute.mockImplementation((...args) => connection.execute(...args));
  purchaseModel.generateOrderNo.mockImplementation(async () => `PO-SUBMIT-${nextOrderNo++}`);
  PurchasePriceService.resolvePurchasePrices.mockImplementation(async (_conn, items) =>
    items.map((item) => ({
      supplier_id: item.supplierId,
      price: { 101: 10.25, 102: 4, 103: 2 }[item.materialId],
      tax_rate: 0.13,
      source: 'test-price',
    }))
  );
  DocumentLinkService.tryAutoLink.mockImplementation(
    async (sourceType, sourceId, _sourceCode, targetType, targetId, _targetCode, _extra, conn) => {
      expect(conn).toBe(transactionConnection);
      await conn.query(
        'INSERT INTO document_links (source_type, source_id, target_type, target_id) VALUES (?, ?, ?, ?)',
        [sourceType, sourceId, targetType, targetId]
      );
    }
  );
  await connection.query("INSERT INTO units (id, code, name) VALUES (1, 'PCS', '件')");
  await connection.query(`INSERT INTO suppliers (id, code, name) VALUES
    (201, 'SUP-201', 'Supplier A'), (202, 'SUP-202', 'Supplier B')`);
  await connection.query(`INSERT INTO materials (id, code, name, unit_id, supplier_id) VALUES
    (101, 'MAT-101', 'Material A', 1, 201),
    (102, 'MAT-102', 'Material B', 1, 202),
    (103, 'MAT-103', 'Material C', 1, 201)`);
  await connection.query(`INSERT INTO purchase_requisitions
    (id, requisition_number, request_date, requester, real_name, status, created_by)
    VALUES (1, 'PR-SUBMIT-1', '2026-09-30', 'test.user', 'Test User', 'draft', 41)`);
  await connection.query(`INSERT INTO purchase_requisition_items
    (id, requisition_id, material_id, material_code, material_name, unit_id, quantity) VALUES
    (1, 1, 101, 'MAT-101', 'Material A', 1, 2),
    (2, 1, 102, 'MAT-102', 'Material B', 1, 3),
    (3, 1, 103, 'MAT-103', 'Material C', 1, 1.5)`);
});

afterEach(async () => {
  if (connection) await connection.rollback();
});

afterAll(async () => {
  if (connection) await connection.end();
});

async function callController(handler, body, query = {}) {
  const res = { statusCode: 200 };
  res.status = jest.fn((status) => {
    res.statusCode = status;
    return res;
  });
  res.json = jest.fn((payload) => {
    res.body = payload;
    return res;
  });
  await handler(
    {
      params: { id: '1' },
      body,
      query,
      user: { id: 77, userId: 77, username: 'test.user', real_name: 'Test User' },
    },
    res
  );
  return res;
}

const submit = (newStatus = 'submitted') => callController(updateRequisitionStatus, { newStatus });
const edit = () =>
  callController(updateRequisition, {
    requestDate: '2026-09-30',
    requester: 'test.user',
    realName: 'Test User',
    remarks: 'Corrected legacy requisition',
    materials: [{ materialId: 101, quantity: 5 }],
  });

async function readState() {
  const [[requisition]] = await connection.query(
    'SELECT status FROM purchase_requisitions WHERE id = 1'
  );
  const [orders] = await connection.query(
    'SELECT id, supplier_id, supplier_name, status, requisition_id, created_by, subtotal, tax_amount, total_amount FROM purchase_orders ORDER BY supplier_id'
  );
  const [items] = await connection.query(
    'SELECT material_id, quantity, price FROM purchase_order_items ORDER BY material_id'
  );
  const [[{ linkCount }]] = await connection.query(
    'SELECT COUNT(*) AS linkCount FROM document_links'
  );
  return { status: requisition.status, orders, items, linkCount };
}

test.each(['draft', 'submitted', 'pending', 'rejected', 'approved'])(
  'directly submits %s requisitions and groups order lines by supplier',
  async (status) => {
    await connection.query('UPDATE purchase_requisitions SET status = ? WHERE id = 1', [status]);

    const res = await submit();

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'completed' });
    expect(res.body.data.generatedOrders).toHaveLength(2);
    const state = await readState();
    expect(state.status).toBe('completed');
    expect(state.orders).toEqual([
      expect.objectContaining({
        supplier_id: 201,
        status: 'draft',
        requisition_id: 1,
        created_by: 41,
        subtotal: 23.5,
        tax_amount: 3.06,
        total_amount: 26.56,
      }),
      expect.objectContaining({
        supplier_id: 202,
        status: 'draft',
        requisition_id: 1,
        created_by: 41,
        subtotal: 12,
        tax_amount: 1.56,
        total_amount: 13.56,
      }),
    ]);
    expect(state.items).toEqual([
      { material_id: 101, quantity: 2, price: 10.25 },
      { material_id: 102, quantity: 3, price: 4 },
      { material_id: 103, quantity: 1.5, price: 2 },
    ]);
    const [allocation] = await connection.query(`SELECT po.supplier_id,
      GROUP_CONCAT(poi.material_id ORDER BY poi.material_id) AS material_ids
      FROM purchase_orders po JOIN purchase_order_items poi ON poi.order_id = po.id
      GROUP BY po.supplier_id ORDER BY po.supplier_id`);
    expect(allocation).toEqual([
      { supplier_id: 201, material_ids: '101,103' },
      { supplier_id: 202, material_ids: '102' },
    ]);
    expect(state.linkCount).toBe(2);
    expect(transactionConnection.commit).toHaveBeenCalledTimes(1);
  }
);

test('completed submission retries do not duplicate orders, lines or links', async () => {
  expect((await submit()).statusCode).toBe(200);
  const initialState = await readState();

  const retry = await submit();

  expect(retry.statusCode).toBe(200);
  expect(retry.body.data.generatedOrders).toEqual([]);
  expect(await readState()).toEqual(initialState);
  expect(purchaseModel.generateOrderNo).toHaveBeenCalledTimes(2);
});

test('a later document link failure rolls back status, both supplier orders, lines and earlier links', async () => {
  const writeLink = DocumentLinkService.tryAutoLink.getMockImplementation();
  DocumentLinkService.tryAutoLink.mockImplementation(async (...args) => {
    await writeLink(...args);
    if (DocumentLinkService.tryAutoLink.mock.calls.length === 2) {
      throw new Error('Document link persistence failed');
    }
  });

  const res = await submit();

  expect(res.statusCode).toBe(500);
  expect(purchaseModel.generateOrderNo).toHaveBeenCalledTimes(2);
  expect(transactionConnection.rollback).toHaveBeenCalledTimes(1);
  expect(transactionConnection.commit).not.toHaveBeenCalled();
  expect(await readState()).toEqual({ status: 'draft', orders: [], items: [], linkCount: 0 });
});

test('an empty requisition returns 400 without changing its state', async () => {
  await connection.query('DELETE FROM purchase_requisition_items');

  expect((await submit()).statusCode).toBe(400);
  expect(await readState()).toEqual({ status: 'draft', orders: [], items: [], linkCount: 0 });
});

test.each(['approved', 'rejected', 'draft', 'completed', 'cancelled'])(
  'rejects direct status changes to %s',
  async (newStatus) => {
    expect((await submit(newStatus)).statusCode).toBe(400);
    expect(await readState()).toEqual({ status: 'draft', orders: [], items: [], linkCount: 0 });
  }
);

test('refuses to submit a cancelled requisition', async () => {
  await connection.query("UPDATE purchase_requisitions SET status = 'cancelled' WHERE id = 1");

  expect((await submit()).statusCode).toBe(400);
  expect(await readState()).toEqual({ status: 'cancelled', orders: [], items: [], linkCount: 0 });
});

test('denied record access returns 403 before obtaining a transaction or generating orders', async () => {
  ScopeGuard.assertAccess.mockResolvedValue(false);

  expect((await submit()).statusCode).toBe(403);
  expect(pool.getConnection).not.toHaveBeenCalled();
  expect(await readState()).toEqual({ status: 'draft', orders: [], items: [], linkCount: 0 });
});

test.each(['pending', 'rejected', 'submitted', 'approved'])(
  'allows editing unconverted legacy %s requisitions back to draft',
  async (status) => {
    await connection.query('UPDATE purchase_requisitions SET status = ? WHERE id = 1', [status]);

    const res = await edit();

    expect(res.statusCode).toBe(200);
    expect(res.body.data.status).toBe('draft');
    const [lines] = await connection.query(
      'SELECT material_id, quantity FROM purchase_requisition_items WHERE requisition_id = 1'
    );
    expect(lines).toEqual([{ material_id: 101, quantity: 5 }]);
    expect((await readState()).orders).toEqual([]);
  }
);

test('rejects editing legacy requisitions already used by an active order', async () => {
  expect((await submit()).statusCode).toBe(200);
  await connection.query("UPDATE purchase_requisitions SET status = 'approved' WHERE id = 1");
  const initialState = await readState();

  expect((await edit()).statusCode).toBe(400);
  expect(await readState()).toEqual(initialState);
  const [[{ lineCount }]] = await connection.query(
    'SELECT COUNT(*) AS lineCount FROM purchase_requisition_items WHERE requisition_id = 1'
  );
  expect(lineCount).toBe(3);
});

test('materials without a supplier generate a draft order marked 待指定', async () => {
  await connection.query('UPDATE materials SET supplier_id = NULL');
  await connection.query('UPDATE purchase_requisitions SET created_by = NULL WHERE id = 1');

  const res = await submit();

  expect(res.statusCode).toBe(200);
  expect(res.body.data.generatedOrders).toHaveLength(1);
  expect((await readState()).orders).toEqual([
    expect.objectContaining({
      supplier_id: null,
      supplier_name: '待指定',
      status: 'draft',
      created_by: 77,
    }),
  ]);
});

test('pending submission lists include legacy states and report accurate statistics across pages', async () => {
  await connection.query(`INSERT INTO purchase_requisitions
    (id, requisition_number, request_date, status) VALUES
    (2, 'PR-SUBMIT-2', '2026-09-30', 'submitted'),
    (3, 'PR-SUBMIT-3', '2026-09-30', 'pending'),
    (4, 'PR-SUBMIT-4', '2026-09-30', 'approved'),
    (5, 'PR-SUBMIT-5', '2026-09-30', 'rejected'),
    (6, 'PR-SUBMIT-6', '2026-09-30', 'completed'),
    (7, 'PR-SUBMIT-7', '2026-09-30', 'cancelled')`);

  const pending = await callController(getRequisitions, {}, { status: 'submitted' });

  expect(pending.statusCode).toBe(200);
  expect(pending.body.data.items.map((item) => item.id).sort()).toEqual([2, 3, 4, 5]);
  expect(pending.body.data).toMatchObject({
    total: 4,
    statistics: { total: 4, draftCount: 0, submittedCount: 4, completedCount: 0 },
  });

  const all = await callController(getRequisitions, {}, { page: 1, pageSize: 2 });

  expect(all.statusCode).toBe(200);
  expect(all.body.data.items).toHaveLength(2);
  expect(all.body.data).toMatchObject({
    total: 7,
    totalPages: 4,
    statistics: { total: 7, draftCount: 1, submittedCount: 4, completedCount: 1 },
  });
});
