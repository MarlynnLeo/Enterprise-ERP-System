const crypto = require('crypto');
const mysql = require('mysql2/promise');
const db = require('../../src/config/db');
const { getReceipts } = require('../../src/controllers/outsourced/processingController');

const prefix = `receipt_list_${crypto.randomBytes(5).toString('hex')}_`;
const schemas = {
  outsourced_processing_receipts: 'id INT PRIMARY KEY, receipt_no VARCHAR(100) COLLATE utf8mb4_unicode_ci, processing_id INT, processing_no VARCHAR(100), supplier_id INT, supplier_name VARCHAR(100), warehouse_id INT, warehouse_name VARCHAR(100), receipt_date DATE, operator VARCHAR(100), remarks TEXT, status VARCHAR(30), created_at DATETIME, updated_at DATETIME, location_id INT',
  outsourced_processing_receipt_items: 'id INT PRIMARY KEY, receipt_id INT, expected_quantity DECIMAL(14,4), actual_quantity DECIMAL(14,4), product_name VARCHAR(100), product_code VARCHAR(100)',
  inventory_posting_documents: 'id INT PRIMARY KEY, source_type VARCHAR(100), source_id INT NULL, source_no VARCHAR(100) COLLATE utf8mb4_general_ci, finance_status VARCHAR(30), posting_kind VARCHAR(30), posting_sequence INT',
};
const pattern = new RegExp(`\\b(${Object.keys(schemas).join('|')})\\b`, 'g');
const sqlForFixture = sql => sql.replace(pattern, name => `\`${prefix}${name}\``);
let connection;
const created = [];

beforeAll(async () => {
  if (!/(test|uat)/i.test(process.env.DB_NAME)) throw new Error('Isolated database required');
  connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  for (const [table, columns] of Object.entries(schemas)) {
    await connection.query(sqlForFixture(`CREATE TABLE ${table} (${columns}) DEFAULT CHARSET=utf8mb4`));
    created.push(table);
  }
  await connection.query(sqlForFixture("INSERT INTO outsourced_processing_receipts (id, receipt_no, supplier_name, receipt_date, status) VALUES (1, 'TEST-A', '测试供应商', '2026-09-12', 'completed'), (2, 'TEST-B', '测试供应商', '2026-09-12', 'pending')"));
  await connection.query(sqlForFixture("INSERT INTO outsourced_processing_receipt_items VALUES (1,1,10,10,'螺丝','M-A'), (2,2,5,2,'螺母','M-B')"));
  await connection.query(sqlForFixture("INSERT INTO inventory_posting_documents VALUES (10,'outsourced_processing_receipt',1,'TEST-A','rejected','movement',1), (11,'outsourced_processing_receipt',1,'TEST-A','pending','movement',2), (12,'outsourced_processing_receipt',NULL,'test-b','approved','movement',1), (13,'outsourced_processing_receipt',2,'TEST-B','reversed','reversal',2)"));
});
beforeEach(() => {
  jest.spyOn(db.pool, 'execute').mockImplementation((sql, params) => connection.execute(sqlForFixture(sql), params));
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => {
  if (!connection) return;
  try { for (const table of created.reverse()) await connection.query(sqlForFixture(`DROP TABLE ${table}`)); }
  finally { await connection.end(); }
});

async function list(query = {}) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  await getReceipts({ query }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  return res.json.mock.calls[0][0].data;
}

test('lists receipts across legacy collations and returns the latest movement approval', async () => {
  const result = await list({ page: 1, pageSize: 10 });
  expect(result.total).toBe(2);
  expect(result.list.map(row => [row.id, row.approvalStatus, row.approvalDocumentId, row.arrivalRequired])).toEqual([
    [2, 'approved', 12, 1], [1, 'pending', 11, 0],
  ]);
});

test('filters item names, dates and receipt status with accurate pagination totals', async () => {
  const result = await list({ keyword: '螺丝', status: 'completed', startDate: '2026-09-01', endDate: '2026-09-30', pageSize: 1 });
  expect(result.total).toBe(1);
  expect(result.list.map(row => row.id)).toEqual([1]);
});
