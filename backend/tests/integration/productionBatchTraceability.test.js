jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../src/utils/userUtils', () => ({
  resolveActorLabel: jest.fn().mockResolvedValue('测试员'),
}));

const crypto = require('crypto');
const mysql = require('mysql2/promise');
const Service = require('../../src/services/business/ProductionBatchTraceabilityService');
const { resolveActorLabel } = require('../../src/utils/userUtils');

// Real MySQL fixtures in the isolated test database exercise aggregation and
// the different ledger/snapshot collations without touching application tables.
const schemas = {
  materials: 'id INT PRIMARY KEY, code VARCHAR(50)',
  production_tasks: 'id INT PRIMARY KEY, code VARCHAR(50), product_id INT DEFAULT 100, deleted_at DATETIME NULL',
  quality_inspections:
    'id INT PRIMARY KEY, task_id INT NULL, reference_id INT, inspection_type VARCHAR(20), deleted_at DATETIME NULL',
  inventory_inbound:
    'id INT PRIMARY KEY, inbound_no VARCHAR(50), inbound_type VARCHAR(20), status VARCHAR(20), inspection_id INT, operator VARCHAR(50), updated_by INT DEFAULT 42, created_by INT DEFAULT 7, is_deleted INT DEFAULT 0',
  inventory_inbound_items:
    'id INT PRIMARY KEY, inbound_id INT, material_id INT, batch_number VARCHAR(50), quantity DECIMAL(20,6)',
  inventory_outbound:
    'id INT PRIMARY KEY, outbound_no VARCHAR(50) COLLATE utf8mb4_unicode_ci, production_task_id INT NULL, reference_type VARCHAR(50), reference_id INT, status VARCHAR(20), deleted_at DATETIME NULL',
  inventory_posting_documents:
    'id INT PRIMARY KEY, finance_status VARCHAR(20), posting_kind VARCHAR(20)',
  inventory_posting_lines:
    'id INT PRIMARY KEY, posting_document_id INT, material_id INT, reference_no VARCHAR(50) COLLATE utf8mb4_general_ci, transaction_type VARCHAR(50), signed_quantity DECIMAL(20,6), batch_number VARCHAR(191) COLLATE utf8mb4_unicode_ci, posted_quantity DECIMAL(20,6) NULL',
  inventory_ledger:
    'id INT PRIMARY KEY, posting_document_id INT NULL, posting_line_id INT NULL, material_id INT, reference_no VARCHAR(50), transaction_type VARCHAR(50), quantity DECIMAL(20,6), batch_number VARCHAR(191) COLLATE utf8mb4_general_ci',
  batch_relationships:
    'id INT AUTO_INCREMENT PRIMARY KEY, parent_batch_id INT NULL, child_batch_id INT NULL, parent_material_code VARCHAR(50), child_material_code VARCHAR(50), parent_batch_number VARCHAR(50), child_batch_number VARCHAR(50), relationship_type VARCHAR(50), consumed_quantity DECIMAL(15,4), produced_quantity DECIMAL(15,4), conversion_ratio DECIMAL(10,6), process_type VARCHAR(50), reference_type VARCHAR(50), reference_id INT, reference_no VARCHAR(50), operator VARCHAR(50), remarks TEXT, created_at DATETIME',
};

const prefix = `trace_${crypto.randomBytes(5).toString('hex')}_`;
const tablePattern = new RegExp(`\\b(${Object.keys(schemas).join('|')})\\b`, 'g');
const fixtureSql = (sql) => sql.replace(tablePattern, (table) => `\`${prefix}${table}\``);
let rawConnection;
let connection;
const createdTables = [];

beforeAll(async () => {
  if (!/(test|uat)/i.test(process.env.DB_NAME))
    throw new Error('An isolated test database is required');
  rawConnection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    decimalNumbers: true,
    dateStrings: true,
  });
  connection = {
    query: (sql, params) => rawConnection.query(fixtureSql(sql), params),
    execute: (sql, params) => rawConnection.execute(fixtureSql(sql), params),
  };
  for (const [table, columns] of Object.entries(schemas)) {
    await connection.query(
      `CREATE TABLE ${table} (${columns}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    createdTables.push(table);
  }
});

afterAll(async () => {
  if (!rawConnection) return;
  try {
    for (const table of createdTables.reverse()) await connection.query(`DROP TABLE ${table}`);
  } finally {
    await rawConnection.end();
  }
});

beforeEach(async () => {
  await rawConnection.beginTransaction();
  await connection.query('INSERT INTO materials (id, code) VALUES ?', [
    [...[1, 2, 3, 4, 5, 6].map((id) => [id, `RAW-${id}`]), [100, 'PRODUCT']],
  ]);
  await connection.query("INSERT INTO production_tasks (id, code) VALUES (10, 'PT-10')");
  await connection.query(
    "INSERT INTO quality_inspections (id, reference_id, inspection_type) VALUES (46, 10, 'final')"
  );
  await connection.query(
    "INSERT INTO inventory_inbound (id, inbound_no, inbound_type, status, inspection_id, operator) VALUES (100, 'IN-100', 'production', 'completed', 46, 'tester')"
  );
  await connection.query(
    "INSERT INTO inventory_inbound_items (id, inbound_id, material_id, batch_number, quantity) VALUES (1, 100, 100, 'B-PT-10', 16)"
  );
  await connection.query(
    "INSERT INTO inventory_outbound (id, outbound_no, production_task_id, reference_type, reference_id, status) VALUES (1, 'OUT-10', 10, 'production_task', 10, 'completed')"
  );
});

afterEach(async () => {
  await rawConnection?.rollback();
});

async function snapshot(id, options = {}) {
  const {
    state = 'pending',
    kind = 'movement',
    materialId = 1,
    batch = 'NG-OPEN-202608',
    quantity = -16,
    referenceNo = 'OUT-10',
    transactionType = 'production_outbound',
  } = options;
  await connection.query(
    'INSERT INTO inventory_posting_documents (id, finance_status, posting_kind) VALUES (?, ?, ?)',
    [id, state, kind]
  );
  await connection.query(
    `INSERT INTO inventory_posting_lines
    (id, posting_document_id, material_id, reference_no, transaction_type, signed_quantity, batch_number)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, id, materialId, referenceNo, transactionType, quantity, batch]
  );
}

async function ledger(id, options = {}) {
  const { documentId = null, lineId = null, quantity = -16, batch = 'NG-OPEN-202608' } = options;
  await connection.query(
    `INSERT INTO inventory_ledger
    (id, posting_document_id, posting_line_id, material_id, reference_no, transaction_type, quantity, batch_number)
    VALUES (?, ?, ?, 1, 'OUT-10', 'production_outbound', ?, ?)`,
    [id, documentId, lineId, quantity, batch]
  );
}

describe('production batch consumption across finance posting', () => {
  it('aggregates split lines for the same finished batch', async () => {
    await snapshot(1);
    await connection.query('UPDATE inventory_inbound_items SET quantity = 12 WHERE id = 1');
    await connection.query("INSERT INTO inventory_inbound_items VALUES (2, 100, 100, 'B-PT-10', 4)");
    await Service.createForInbound(connection, 100);
    const [[row]] = await connection.query('SELECT consumed_quantity, produced_quantity FROM batch_relationships');
    expect(row).toEqual({ consumed_quantity: 16, produced_quantity: 16 });
  });

  it('conserves task consumption across finished batches and later partial inbounds', async () => {
    await snapshot(1);
    await connection.query('UPDATE inventory_inbound_items SET quantity = 12 WHERE id = 1');
    await connection.query("INSERT INTO inventory_inbound_items VALUES (2, 100, 100, 'B-PT-10-B', 4)");
    await Service.createForInbound(connection, 100);
    let [rows] = await connection.query('SELECT consumed_quantity, produced_quantity FROM batch_relationships ORDER BY child_batch_number');
    expect(rows).toEqual([{ consumed_quantity: 12, produced_quantity: 12 }, { consumed_quantity: 4, produced_quantity: 4 }]);
    await snapshot(2, { quantity: -8 });
    await connection.query("INSERT INTO quality_inspections (id, reference_id, inspection_type) VALUES (47, 10, 'final')");
    await connection.query("INSERT INTO inventory_inbound (id, inbound_no, inbound_type, status, inspection_id) VALUES (101, 'IN-101', 'production', 'completed', 47)");
    await connection.query("INSERT INTO inventory_inbound_items VALUES (3, 101, 100, 'B-PT-10-C', 8)");
    await Service.createForInbound(connection, 101);
    [rows] = await connection.query('SELECT consumed_quantity, produced_quantity FROM batch_relationships ORDER BY child_batch_number');
    expect(rows).toEqual([{ consumed_quantity: 12, produced_quantity: 12 }, { consumed_quantity: 4, produced_quantity: 4 }, { consumed_quantity: 8, produced_quantity: 8 }]);
    expect(rows.reduce((sum, row) => sum + row.consumed_quantity, 0)).toBe(24);
    await expect(Service.createForInbound(connection, 101)).resolves.toMatchObject({ created: 0 });
  });

  it('keeps relationships for different tasks distinct even when batch labels match', async () => {
    await snapshot(1);
    await connection.query(`INSERT INTO batch_relationships
      (parent_material_code, child_material_code, parent_batch_number, child_batch_number, relationship_type,
       consumed_quantity, produced_quantity, process_type, reference_type, reference_id)
      VALUES ('RAW-1', 'PRODUCT', 'NG-OPEN-202608', 'B-PT-10', 'consume', 5, 5, 'production', 'production_task', 20)`);
    await expect(Service.createForInbound(connection, 100)).resolves.toMatchObject({ created: 1 });
    const [[other]] = await connection.query('SELECT consumed_quantity FROM batch_relationships WHERE reference_id = 20');
    expect(other.consumed_quantity).toBe(5);
  });

  it('creates all six consumption relationships from pending FIFO snapshots without posting stock', async () => {
    for (let id = 1; id <= 6; id += 1) {
      await snapshot(id, { materialId: id, quantity: id <= 4 ? -16 : -0.16 });
    }
    await expect(Service.createForInbound(connection, 100)).resolves.toMatchObject({
      taskId: 10,
      consumedBatches: 6,
      created: 6,
    });
    expect(resolveActorLabel).toHaveBeenCalledWith(connection, 42, 7, null, 'tester');
    const [relations] = await connection.query(`SELECT parent_batch_number, child_batch_number,
      consumed_quantity, produced_quantity FROM batch_relationships ORDER BY parent_material_code`);
    expect(relations).toHaveLength(6);
    expect(
      relations.every(
        (row) =>
          row.parent_batch_number === 'NG-OPEN-202608' && row.child_batch_number === 'B-PT-10'
      )
    ).toBe(true);
    expect(relations.map((row) => row.consumed_quantity)).toEqual([16, 16, 16, 16, 0.16, 0.16]);
    const [[stock]] = await connection.query('SELECT COUNT(*) AS count FROM inventory_ledger');
    expect(stock.count).toBe(0);
  });

  it('keeps consumption and relationships unchanged when the same snapshots are formally posted', async () => {
    await snapshot(1);
    await Service.createForInbound(connection, 100);
    await connection.query(
      "UPDATE inventory_posting_documents SET finance_status = 'approved' WHERE id = 1"
    );
    await connection.query(
      'UPDATE inventory_posting_lines SET posted_quantity = signed_quantity WHERE id = 1'
    );
    await ledger(1, { documentId: 1, lineId: 1 });
    await expect(Service.getConsumedBatches(connection, 10)).resolves.toEqual([
      {
        material_id: 1,
        raw_batch_number: 'NG-OPEN-202608',
        raw_material_code: 'RAW-1',
        consumed_quantity: 16,
      },
    ]);
    await expect(Service.createForInbound(connection, 100)).resolves.toMatchObject({ created: 0 });
    const [[relations]] = await connection.query(
      'SELECT COUNT(*) AS count, SUM(consumed_quantity) AS quantity FROM batch_relationships'
    );
    expect(relations).toEqual({ count: 1, quantity: 16 });
  });

  it('combines legacy ledger, posted and pending movements without collation conflicts', async () => {
    await ledger(1, { quantity: -5 });
    await snapshot(2, { state: 'approved', quantity: -3 });
    await ledger(2, { documentId: 2, lineId: 2, quantity: -3 });
    await snapshot(3);
    const rows = await Service.getConsumedBatches(connection, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].consumed_quantity).toBe(24);
  });

  it('excludes rejected, reversed, unrelated and non-production snapshots', async () => {
    await snapshot(1);
    await snapshot(2, { state: 'rejected' });
    await snapshot(3, { state: 'reversed' });
    await ledger(3, { documentId: 3, lineId: 3 });
    await snapshot(4, { kind: 'reversal' });
    await snapshot(5, { transactionType: 'sales_outbound' });
    await connection.query(
      "INSERT INTO inventory_outbound (id, outbound_no, production_task_id, status) VALUES (2, 'OTHER-TASK', 20, 'completed'), (3, 'CANCELLED', 10, 'cancelled')"
    );
    await snapshot(6, { referenceNo: 'OTHER-TASK' });
    await snapshot(7, { referenceNo: 'CANCELLED' });
    expect(
      (await Service.getConsumedBatches(connection, 10)).map((row) => row.consumed_quantity)
    ).toEqual([16]);
  });

  it('does not count a pending snapshot again if its ledger row already exists', async () => {
    await snapshot(1);
    await ledger(1, { lineId: 1 });
    expect((await Service.getConsumedBatches(connection, 10))[0].consumed_quantity).toBe(16);
  });

  it('supports historical ledger-only issues linked through reference_type', async () => {
    await connection.query('UPDATE inventory_outbound SET production_task_id = NULL WHERE id = 1');
    await ledger(1, { batch: 'IMP-20260814103010000-1-1' });
    await expect(Service.createForInbound(connection, 100)).resolves.toMatchObject({ created: 1 });
    const [[relation]] = await connection.query(
      'SELECT parent_batch_number FROM batch_relationships'
    );
    expect(relation.parent_batch_number).toBe('IMP-20260814103010000-1-1');
  });

  it.each([null, '', '   '])(
    'reports a missing raw-material batch (%p) instead of creating incomplete traceability',
    async (batch) => {
      await snapshot(1);
      await snapshot(2, { materialId: 2, batch });
      await expect(Service.createForInbound(connection, 100)).rejects.toThrow(
        'RAW-2 领用记录缺少批次号'
      );
      const [[relations]] = await connection.query(
        'SELECT COUNT(*) AS count FROM batch_relationships'
      );
      expect(relations.count).toBe(0);
    }
  );

  it('still rejects production with no actual material issue evidence', async () => {
    await expect(Service.createForInbound(connection, 100)).rejects.toThrow(
      '未找到已完成领料单的原料领用记录'
    );
  });

  it('does not recreate relationships for a cancelled inbound on replay', async () => {
    await snapshot(1);
    await connection.query("UPDATE inventory_inbound SET status = 'cancelled' WHERE id = 100");
    await expect(Service.createForInbound(connection, 100)).resolves.toEqual({
      skipped: true,
      created: 0,
    });
  });
});
