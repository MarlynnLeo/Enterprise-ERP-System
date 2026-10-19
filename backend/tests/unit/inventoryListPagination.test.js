/* global jest, beforeEach, afterEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn(), query: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('../../src/utils/codeGenerator', () => ({ CodeGenerators: {} }));
jest.mock('../../src/services/InventoryService', () => ({}));
jest.mock('../../src/services/business/InboundTransactionService', () => ({}));
jest.mock('../../src/services/business/ProductionReturnService', () => ({}));
jest.mock('../../src/controllers/business/inventory/inventoryConsistencyController', () => ({}));
jest.mock('../../src/controllers/business/inventory/outbound/outboundBomController', () => ({}));
jest.mock('../../src/controllers/business/inventory/outbound/outboundHelpers', () => ({
  STATUS: {}, getStatusText: status => status,
}));
jest.mock('../../src/authorization/ScopeGuard', () => ({ applyListScope: jest.fn() }));

const { DatabaseSync } = require('node:sqlite');
const db = require('../../src/config/db');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const { getInboundList } = require('../../src/controllers/business/inventory/inventoryInboundController');
const { getOutboundList } = require('../../src/controllers/business/inventory/outbound/outboundCrudController');

let fixture;
let connection;
const normalizeSql = sql => sql.replace(/\bBINARY\s+/g, '').replace(/ COLLATE utf8mb4_unicode_ci/g, '');
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });

beforeEach(() => {
  jest.clearAllMocks();
  fixture = new DatabaseSync(':memory:');
  fixture.function('DATE_FORMAT', (value, format) => value == null ? null : value.slice(0, format.includes('%H') ? 19 : 10));
  fixture.function('CONCAT', (left, right) => `${left}${right}`);
  fixture.exec(`
    CREATE TABLE inventory_inbound (
      id INTEGER PRIMARY KEY, inbound_no TEXT, inbound_date TEXT, inbound_type TEXT,
      reference_type TEXT, reference_id INTEGER, reference_no TEXT, location_id INTEGER,
      status TEXT, operator TEXT, remark TEXT, created_at TEXT, updated_at TEXT,
      is_deleted INTEGER DEFAULT 0, deleted_at TEXT, created_by INTEGER
    );
    CREATE TABLE inventory_outbound (
      id INTEGER PRIMARY KEY, outbound_no TEXT, outbound_date TEXT, outbound_type TEXT,
      production_task_id INTEGER, sales_order_id INTEGER, reference_type TEXT,
      reference_id INTEGER, status TEXT, operator TEXT, remark TEXT,
      created_at TEXT, updated_at TEXT, deleted_at TEXT, created_by INTEGER
    );
    CREATE TABLE inventory_inbound_items (id INTEGER PRIMARY KEY, inbound_id INTEGER, material_id INTEGER, quantity REAL);
    CREATE INDEX inbound_items_parent ON inventory_inbound_items(inbound_id);
    CREATE TABLE inventory_outbound_items (id INTEGER PRIMARY KEY, outbound_id INTEGER, material_id INTEGER, quantity REAL);
    CREATE INDEX outbound_items_parent ON inventory_outbound_items(outbound_id);
    CREATE TABLE materials (id INTEGER PRIMARY KEY, code TEXT, name TEXT, specs TEXT, unit_id INTEGER, location_id INTEGER, production_group_id INTEGER);
    CREATE TABLE locations (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE units (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, real_name TEXT, department_id INTEGER);
    CREATE TABLE production_tasks (id INTEGER PRIMARY KEY, product_id INTEGER, quantity REAL);
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT, status INTEGER);
    CREATE TABLE inventory_posting_documents (
      id INTEGER PRIMARY KEY, source_type TEXT, source_id INTEGER, source_no TEXT,
      posting_kind TEXT, posting_sequence INTEGER, finance_status TEXT
    );
    INSERT INTO materials VALUES (1, 'RAW-1', '螺丝', 'M6', 1, 2, NULL), (2, 'RAW-2', '螺母', 'M8', 2, 3, NULL), (3, 'FINISHED', '成品', '组装', 1, 2, 8);
    INSERT INTO locations VALUES (2, '零件仓'), (3, '原料仓');
    INSERT INTO units VALUES (1, '个'), (2, '盒');
    INSERT INTO users VALUES (7, 'warehouse', '库管', 8), (99, 'other', '其他', 99);
    INSERT INTO production_tasks VALUES (42, 3, 15);
    INSERT INTO departments VALUES (8, '装配组', 1);
  `);
  const statuses = ['cancelled', 'completed', 'confirmed', 'partial_completed', 'completed', 'draft', 'completed', 'completed'];
  for (let id = 1; id <= 8; id++) {
    const createdAt = '2026-10-17 09:00:00';
    const owner = id === 7 ? 99 : 7;
    const deletedAt = id === 8 ? createdAt : null;
    fixture.prepare(`INSERT INTO inventory_inbound (id, inbound_no, inbound_date, inbound_type, location_id, status, operator, created_at, updated_at, deleted_at, created_by)
      VALUES (?, ?, '2026-10-17', 'other', 2, ?, 'warehouse', ?, ?, ?, ?)`).run(id, `IN-${id}`, statuses[id - 1], createdAt, createdAt, deletedAt, owner);
    fixture.prepare(`INSERT INTO inventory_outbound (id, outbound_no, outbound_date, outbound_type, production_task_id, reference_type, reference_id, status, operator, created_at, updated_at, deleted_at, created_by)
      VALUES (?, ?, '2026-10-17', 'production', 42, 'production_task', 42, ?, 'warehouse', ?, ?, ?, ?)`).run(id, `OUT-${id}`, statuses[id - 1], createdAt, createdAt, deletedAt, owner);
    if (id !== 6) {
      for (const [index, materialId, quantity] of [[1, 1, 1], [2, 2, 2.5], [3, 1, 0]]) {
        fixture.prepare('INSERT INTO inventory_inbound_items VALUES (?, ?, ?, ?)').run(id * 10 + index, id, materialId, quantity);
        fixture.prepare('INSERT INTO inventory_outbound_items VALUES (?, ?, ?, ?)').run(id * 10 + index, id, materialId, quantity);
      }
    }
    fixture.prepare("INSERT INTO inventory_posting_documents VALUES (?, 'outbound', ?, ?, 'movement', 1, 'approved')").run(id, id, `OUT-${id}`);
  }
  fixture.exec("INSERT INTO inventory_posting_documents VALUES (9, 'outbound_supplement', 4, 'OUT-4-S1', 'movement', 1, 'pending')");
  connection = {
    execute: jest.fn(async (sql, params = []) => [fixture.prepare(normalizeSql(sql)).all(...params)]),
    release: jest.fn(),
  };
  db.pool.getConnection.mockResolvedValue(connection);
  db.pool.query.mockImplementation(connection.execute);
  ScopeGuard.applyListScope.mockImplementation(async (_req, _resource, { tableAlias, ownerAlias }) => ({
    join: `LEFT JOIN users ${ownerAlias} ON ${ownerAlias}.id = ${tableAlias}.created_by`,
    where: ` AND ${ownerAlias}.department_id = ?`, params: [8],
  }));
});

afterEach(() => fixture.close());

async function list(controller, query) {
  const res = response();
  await controller({ query }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  return res.json.mock.calls[0][0].data;
}

test.each([['inbound', getInboundList], ['outbound', getOutboundList]])(
  '%s paginates scoped documents stably before aggregating all of each document’s lines',
  async (_type, controller) => {
    const first = await list(controller, { page: 1, pageSize: 2, statusMode: 'business' });
    const second = await list(controller, { page: 2, pageSize: 2, statusMode: 'business' });
    expect(first.total).toBe(6);
    expect(first.list.map(row => row.id)).toEqual([6, 5]);
    expect(second.list.map(row => row.id)).toEqual([4, 3]);
    expect(first.list[0]).toEqual(expect.objectContaining({ itemsCount: 0, totalQuantity: 0, materialCode: null, firstItemQuantity: null }));
    for (const item of [first.list[1], ...second.list]) {
      expect(item).toEqual(expect.objectContaining({ itemsCount: 3, totalQuantity: 3.5, materialCode: 'RAW-1', firstItemQuantity: 1, operatorName: '库管' }));
    }
  }
);

test.each([['inbound', getInboundList], ['outbound', getOutboundList]])(
  '%s material filters select documents without trimming nonmatching lines from totals',
  async (_type, controller) => {
    const data = await list(controller, { page: 2, pageSize: 2, materialName: '螺丝', startDate: '2026-10-17', endDate: '2026-10-17', statusMode: 'business' });
    expect(data.total).toBe(5);
    expect(data.list.map(row => row.id)).toEqual([3, 2]);
    data.list.forEach(row => expect(row).toEqual(expect.objectContaining({ itemsCount: 3, totalQuantity: 3.5 })));
    const beyond = await list(controller, { page: 99, pageSize: 2, materialName: '螺丝', statusMode: 'business' });
    expect(beyond.total).toBe(5);
    expect(beyond.list).toEqual([]);
  }
);

test('outbound production, location and business status filters share totals and ignore finance history for counting', async () => {
  const data = await list(getOutboundList, { pageSize: 1, statusMode: 'business', status: 'completed', locationId: 3, productionGroupId: 8, outboundType: 'production' });
  expect(data.total).toBe(2);
  expect(data.list).toEqual([expect.objectContaining({ id: 5, totalQuantity: 3.5, itemsCount: 3, itemUnitName: null, productionGroupNames: '装配组', productQuantity: 15, financeStatus: 'approved' })]);
  expect(data.statistics).toEqual(expect.objectContaining({ total: 2, completedCount: 2, approvedCount: 0 }));
  for (const [sql] of db.pool.query.mock.calls.slice(1)) {
    expect(sql).not.toContain('inventory_posting_documents');
    expect(sql).not.toMatch(/JOIN inventory_outbound_items oi ON/);
  }
});

test('outbound approval status filtering applies before pagination and respects pending supplements', async () => {
  const approved = await list(getOutboundList, { pageSize: 1, page: 2, status: 'approved' });
  expect(approved.total).toBe(2);
  expect(approved.list.map(row => row.id)).toEqual([2]);
  expect(approved.statistics.approvedCount).toBe(2);
  const partial = await list(getOutboundList, { status: 'partial_completed' });
  expect(partial.total).toBe(1);
  expect(partial.list).toEqual([expect.objectContaining({ id: 4, status: 'partial_completed', financeStatus: 'pending', statusText: '待财务审' })]);
  const cancelled = await list(getOutboundList, { status: 'cancelled' });
  expect(cancelled.list.map(row => row.id)).toEqual([1]);
});

test.each([
  [undefined, 0], ['', 6], [null, 6], [0, 6], [8, 6],
])('outbound snake production group value %s keeps its precedence over the camel filter', async (production_group_id, total) => {
  const data = await list(getOutboundList, { statusMode: 'business', productionGroupId: 999, production_group_id });
  expect(data.total).toBe(total);
  expect(data.statistics.total).toBe(total);
});

test.each([['inbound', getInboundList, 'ii'], ['outbound', getOutboundList, 'oi']])(
  '%s only aggregates page document quantities even with many historical documents',
  async (type, controller, alias) => {
    fixture.exec(`
      WITH RECURSIVE ids(id) AS (SELECT 100 UNION ALL SELECT id + 1 FROM ids WHERE id < 1099)
      INSERT INTO inventory_${type} (id, ${type}_no, ${type}_date, status, created_at, created_by)
      SELECT id, 'HISTORY-' || id, '2025-01-01', 'draft', '2025-01-01 00:00:00', 7 FROM ids;
      WITH RECURSIVE ids(id) AS (SELECT 100 UNION ALL SELECT id + 1 FROM ids WHERE id < 1099)
      INSERT INTO inventory_${type}_items SELECT 10000 + id, id, 1, 9 FROM ids;
    `);
    let quantityVisits = 0;
    fixture.function('observe_quantity', quantity => { quantityVisits++; return quantity; });
    connection.execute.mockImplementation(async (sql, params = []) => [fixture.prepare(normalizeSql(sql).replace(`SUM(${alias}.quantity)`, `SUM(observe_quantity(${alias}.quantity))`)).all(...params)]);
    db.pool.query.mockImplementation(connection.execute);
    const data = await list(controller, { pageSize: 2, statusMode: 'business', materialName: '螺丝' });
    expect(data.total).toBe(1005);
    expect(data.list.map(row => row.id)).toEqual([5, 4]);
    expect(quantityVisits).toBe(6);
  }
);
