const mysql = require('mysql2/promise');
const PurchaseOrderService = require('../../src/services/PurchaseOrderService');

// Connection-local tables exercise real MySQL precision, locks and rollback
// without changing any existing requisitions or orders in the test database.
let connection;
let tablesReady = false;

beforeAll(async () => {
  if (!/(test|uat)/i.test(process.env.DB_NAME || '')) {
    throw new Error('Quantity sync integration tests require an isolated test database');
  }
  connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    decimalNumbers: true,
  });
  await connection.query(`CREATE TEMPORARY TABLE purchase_requisitions (
    id INT PRIMARY KEY, requisition_number VARCHAR(50), status VARCHAR(30),
    deleted_at DATETIME NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  await connection.query(`CREATE TEMPORARY TABLE purchase_requisition_items (
    id INT PRIMARY KEY, requisition_id INT, material_id INT, material_code VARCHAR(50),
    quantity DECIMAL(10,2), updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  await connection.query(`CREATE TEMPORARY TABLE purchase_orders (
    id INT PRIMARY KEY, requisition_id INT, status VARCHAR(30), deleted_at DATETIME NULL
  ) ENGINE=InnoDB`);
  await connection.query(`CREATE TEMPORARY TABLE purchase_order_items (
    id INT PRIMARY KEY, order_id INT, material_id INT, material_code VARCHAR(50),
    quantity DECIMAL(10,2)
  ) ENGINE=InnoDB`);
  tablesReady = true;
});

beforeEach(async () => {
  if (!tablesReady) throw new Error('Temporary test tables were not initialized');
  await connection.query('DELETE FROM purchase_order_items');
  await connection.query('DELETE FROM purchase_orders');
  await connection.query('DELETE FROM purchase_requisition_items');
  await connection.query('DELETE FROM purchase_requisitions');
  await connection.query(
    "INSERT INTO purchase_requisitions (id, requisition_number, status) VALUES (1, 'REQ-SYNC-TEST', 'completed')"
  );
  await connection.query(
    "INSERT INTO purchase_requisition_items (id, requisition_id, material_id, material_code, quantity) VALUES (1, 1, 10, '4003003015', 3663)"
  );
  await connection.query(
    "INSERT INTO purchase_orders (id, requisition_id, status) VALUES (7, 1, 'draft')"
  );
  await connection.query(
    "INSERT INTO purchase_order_items (id, order_id, material_id, material_code, quantity) VALUES (71, 7, 10, '4003003015', 3663)"
  );
  await connection.beginTransaction();
});

afterEach(async () => {
  if (connection) await connection.rollback();
});

afterAll(async () => {
  if (connection) await connection.end();
});

async function saveQuantity(quantity) {
  const items = [{ material_id: 10, quantity }];
  await PurchaseOrderService.validateOrderEditable(connection, 7);
  await PurchaseOrderService.syncRequisitionQuantitiesForOrderEdit(connection, 1, 7, items);
  await PurchaseOrderService.validateRequisitionAllocation(connection, 1, items, 7);
  await connection.query('UPDATE purchase_order_items SET quantity = ? WHERE id = 71', [quantity]);
  return PurchaseOrderService.syncRequisitionStatusFromOrders(connection, 1);
}

test('saves an increase beyond 3663 and a subsequent reduction without quantity drift', async () => {
  expect(await saveQuantity(100000)).toMatchObject({
    status: 'completed',
    totalRequired: 100000,
    totalOrdered: 100000,
  });
  expect(await saveQuantity(1200.25)).toMatchObject({
    status: 'completed',
    totalRequired: 1200.25,
    totalOrdered: 1200.25,
  });
  const [[row]] = await connection.query(
    'SELECT quantity FROM purchase_requisition_items WHERE id = 1'
  );
  expect(row.quantity).toBe(1200.25);
});

test('keeps other orders and unpurchased demand when editing one split order', async () => {
  await connection.query('UPDATE purchase_requisition_items SET quantity = 5000 WHERE id = 1');
  await connection.query("UPDATE purchase_requisitions SET status = 'approved' WHERE id = 1");
  await connection.query(
    "INSERT INTO purchase_orders (id, requisition_id, status) VALUES (8, 1, 'approved')"
  );
  await connection.query(
    "INSERT INTO purchase_order_items (id, order_id, material_id, material_code, quantity) VALUES (81, 8, 10, '4003003015', 1000)"
  );
  const result = await saveQuantity(100000);
  expect(result).toMatchObject({ status: 'approved', totalRequired: 101337, totalOrdered: 101000 });
  const [[other]] = await connection.query(
    'SELECT quantity FROM purchase_order_items WHERE id = 81'
  );
  expect(other.quantity).toBe(1000);
});

test('rolls back both documents if saving the order fails after requisition synchronization', async () => {
  await saveQuantity(100000);
  await expect(
    connection.query(
      'INSERT INTO purchase_order_items (id, order_id, material_id, quantity) VALUES (71, 7, 10, 1)'
    )
  ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  await connection.rollback();
  const [[requisition]] = await connection.query(
    'SELECT quantity FROM purchase_requisition_items WHERE id = 1'
  );
  const [[order]] = await connection.query(
    'SELECT quantity FROM purchase_order_items WHERE id = 71'
  );
  expect(requisition.quantity).toBe(3663);
  expect(order.quantity).toBe(3663);
});
