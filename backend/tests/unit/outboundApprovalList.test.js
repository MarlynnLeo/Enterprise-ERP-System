/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: { query: jest.fn(), getConnection: jest.fn() },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../src/utils/codeGenerator', () => ({ CodeGenerators: {} }));
jest.mock('../../src/utils/softDelete', () => ({ softDelete: jest.fn() }));
jest.mock('../../src/services/InventoryService', () => ({}));
jest.mock('../../src/utils/userHelper', () => ({ getCurrentUserName: jest.fn() }));
jest.mock('../../src/controllers/business/inventory/inventoryConsistencyController', () => ({
  checkAndUpdateTaskStatus: jest.fn(),
  _syncProductionStatus: jest.fn(),
}));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  applyListScope: jest.fn(),
  denyUnlessAccess: jest.fn(),
}));
jest.mock('../../src/controllers/business/inventory/outbound/outboundHelpers', () => ({
  STATUS: { OUTBOUND: { DRAFT: 'draft' } },
  STOCK_SUBQUERY: 'inventory_stock',
  assertOutboundSourceAccess: jest.fn(),
  getStatusText: (status) => ({
    draft: '草稿',
    completed: '已完成',
    partial_completed: '部分完成',
    reversed: '已冲销',
    cancelled: '已取消',
  })[status] || status,
}));
jest.mock('../../src/controllers/business/inventory/outbound/outboundBomController', () => ({
  fetchBomItemsForOutbound: jest.fn(),
}));

const ExcelJS = require('exceljs');
const db = require('../../src/config/db');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const { assertOutboundSourceAccess } = require('../../src/controllers/business/inventory/outbound/outboundHelpers');
const { inventoryOutboundMap } = require('../../src/utils/inventory/inventoryFieldMap');
const {
  getOutboundList,
  getOutboundDetail,
  exportOutbound,
} = require('../../src/controllers/business/inventory/outbound/outboundCrudController');

function responseDouble() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    send: jest.fn().mockReturnThis(),
  };
}

function mockListResults(rows, total, statistics) {
  db.pool.query
    .mockResolvedValueOnce([rows])
    .mockResolvedValueOnce([[{ total }]])
    .mockResolvedValueOnce([statistics]);
}

function expectLatestMovementJoin(sql) {
  expect(sql).toMatch(/outbound_posting\.id\s*=\s*\(\s*SELECT posting\.id/);
  expect(sql).toContain("posting.source_type = 'outbound'");
  expect(sql).toContain("posting.posting_kind = 'movement'");
  expect(sql).toContain('posting.source_id = o.id OR (posting.source_id IS NULL AND posting.source_no = o.outbound_no COLLATE utf8mb4_unicode_ci)');
  expect(sql).toContain("posting.source_type = 'outbound_supplement'");
  expect(sql).toContain('AND NOT EXISTS (');
  expect(sql).toContain('newer.source_no = posting.source_no');
  expect(sql).toMatch(/ORDER BY CASE posting\.finance_status/);
  expect(sql).toMatch(/posting\.posting_sequence DESC, posting\.id DESC\s+LIMIT 1/);
}

function expectDisplayStatusFilter(sql) {
  expect(sql).toMatch(/AND \(CASE\s+WHEN o\.status IN \('completed', 'partial_completed'\) AND outbound_posting\.finance_status = 'approved' THEN 'approved'\s+ELSE o\.status\s+END\) = \?/);
}

describe('outbound approval list, detail and export', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.pool.query.mockReset();
    ScopeGuard.applyListScope.mockResolvedValue({
      join: '',
      where: ' AND o.created_by = ?',
      params: [7],
    });
    ScopeGuard.denyUnlessAccess.mockResolvedValue(true);
    assertOutboundSourceAccess.mockResolvedValue(true);
  });

  test('evaluates parent and supplemental finance status using only each source latest movement', async () => {
    mockListResults([], 0, []);
    await getOutboundList({ query: {} }, responseDouble());
    const sql = db.pool.query.mock.calls[0][0];
    const financeJoin = sql.slice(sql.indexOf('LEFT JOIN inventory_posting_documents outbound_posting'), sql.indexOf('LEFT JOIN inventory_outbound_items oi'))
      .replace(/ COLLATE utf8mb4_unicode_ci/g, '');
    const { DatabaseSync } = require('node:sqlite');
    const fixture = new DatabaseSync(':memory:');
    try {
      fixture.function('CONCAT', (left, right) => `${left}${right}`);
      fixture.exec(`
        CREATE TABLE inventory_outbound (id INTEGER, outbound_no TEXT);
        CREATE TABLE inventory_posting_documents (
          id INTEGER, source_type TEXT, source_id INTEGER, source_no TEXT,
          posting_kind TEXT, posting_sequence INTEGER, finance_status TEXT
        );
      `);
      const insertOutbound = fixture.prepare('INSERT INTO inventory_outbound VALUES (?, ?)');
      const insertPosting = fixture.prepare('INSERT INTO inventory_posting_documents VALUES (?, ?, ?, ?, ?, ?, ?)');
      let postingId = 0;
      const cases = [
        { parent: 'approved', supplements: ['pending'], expected: 'pending' },
        { parent: 'approved', supplements: ['rejected'], expected: 'rejected' },
        { parent: 'approved', supplements: ['approved', 'approved'], expected: 'approved' },
        { parent: 'rejected', supplements: ['pending'], expected: 'pending' },
        { parent: null, supplements: ['approved'], expected: 'approved' },
        { parent: 'approved', supplements: ['rejected', 'approved'], resubmit: true, expected: 'approved' },
        { parent: 'approved', supplements: ['pending'], legacy: true, expected: 'pending' },
        { parent: 'reversed', supplements: ['approved'], expected: 'reversed' },
      ];
      for (const [index, scenario] of cases.entries()) {
        const id = index + 1;
        const number = `OUT-SQL-${id}`;
        insertOutbound.run(id, number);
        if (scenario.parent) insertPosting.run(++postingId, 'outbound', id, number, 'movement', 1, scenario.parent);
        for (const [line, status] of scenario.supplements.entries()) {
          const sourceNo = scenario.legacy ? `${number}-补发` : `${number}-S${scenario.resubmit ? 0 : line}`;
          insertPosting.run(++postingId, 'outbound_supplement', scenario.legacy ? null : id, sourceNo, 'movement', scenario.resubmit ? line + 1 : 1, status);
        }
      }
      const actual = fixture.prepare(`SELECT o.id, outbound_posting.finance_status FROM inventory_outbound o ${financeJoin} ORDER BY o.id`).all();
      expect(actual.map(row => row.finance_status)).toEqual(cases.map(row => row.expected));
    } finally {
      fixture.close();
    }
  });

  test('preserves business status while displaying and counting each document in one status', async () => {
    mockListResults([
      { id: 1, outbound_no: 'OUT-1', status: 'completed', finance_status: 'approved', total_quantity: '8' },
      { id: 2, outbound_no: 'OUT-2', status: 'partial_completed', finance_status: 'approved' },
      { id: 3, outbound_no: 'OUT-3', status: 'draft' },
      { id: 4, outbound_no: 'OUT-4', status: 'reversed', finance_status: 'approved' },
      { id: 5, outbound_no: 'OUT-5', status: 'cancelled', finance_status: 'approved' },
    ], 23, [
      { status: 'approved', count: '10' },
      { status: 'completed', count: '9' },
      { status: 'partial_completed', count: '1' },
      { status: 'draft', count: '1' },
      { status: 'reversed', count: '1' },
      { status: 'cancelled', count: '1' },
    ]);
    const res = responseDouble();

    await getOutboundList({ query: { pageSize: '5' } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const { data } = res.json.mock.calls[0][0];
    expect(data.total).toBe(23);
    expect(data.list).toEqual([
      expect.objectContaining({ id: 1, status: 'completed', statusText: '已审核', financeStatus: 'approved', totalQuantity: 8 }),
      expect.objectContaining({ id: 2, status: 'partial_completed', statusText: '已审核', financeStatus: 'approved' }),
      expect.objectContaining({ id: 3, status: 'draft', financeStatus: null }),
      expect.objectContaining({ id: 4, status: 'reversed', statusText: '已冲销', financeStatus: 'approved' }),
      expect.objectContaining({ id: 5, status: 'cancelled', statusText: '已取消', financeStatus: 'approved' }),
    ]);
    expect(data.statistics).toEqual({
      total: 23,
      draftCount: 1,
      confirmedCount: 0,
      partialCompletedCount: 1,
      completedCount: 9,
      reversedCount: 1,
      cancelledCount: 1,
      approvedCount: 10,
    });
    for (const [sql, params] of db.pool.query.mock.calls) {
      expectLatestMovementJoin(sql);
      expect(params).toEqual([7]);
    }
    expect(Object.entries(data.statistics).filter(([key]) => key !== 'total')
      .reduce((sum, [, count]) => sum + count, 0)).toBe(data.total);
    expect(db.pool.query.mock.calls[2][0]).toMatch(/GROUP BY CASE\s+WHEN o\.status IN \('completed', 'partial_completed'\) AND outbound_posting\.finance_status = 'approved' THEN 'approved'\s+ELSE o\.status\s+END/);
  });

  test.each([
    ['approved', 'completed', 'approved', 'approvedCount'],
    ['completed', 'completed', 'pending', 'completedCount'],
    ['partial_completed', 'partial_completed', null, 'partialCompletedCount'],
    ['reversed', 'reversed', 'approved', 'reversedCount'],
    ['cancelled', 'cancelled', 'approved', 'cancelledCount'],
  ])('applies the %s display filter to rows, pagination total and statistics', async (status, businessStatus, financeStatus, countKey) => {
    mockListResults([
      { id: 9, status: businessStatus, finance_status: financeStatus },
    ], 4, [
      { status, count: 4 },
    ]);
    const res = responseDouble();

    await getOutboundList({ query: { status, page: '2', pageSize: '1' } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(db.pool.query).toHaveBeenCalledTimes(3);
    for (const [sql, params] of db.pool.query.mock.calls) {
      expectLatestMovementJoin(sql);
      expectDisplayStatusFilter(sql);
      expect(params).toEqual([status, 7]);
      expect(sql).not.toContain('AND o.status = ?');
    }
    expect(db.pool.query.mock.calls[0][0]).toContain('LIMIT 1 OFFSET 1');
    expect(res.json.mock.calls[0][0].data).toEqual(expect.objectContaining({
      total: 4,
      totalPages: 4,
      page: 2,
      statistics: expect.objectContaining({ total: 4, [countKey]: 4 }),
    }));
    const { statistics } = res.json.mock.calls[0][0].data;
    expect(Object.entries(statistics).filter(([key]) => key !== 'total' && key !== countKey)
      .every(([, count]) => count === 0)).toBe(true);
  });

  test('includes approval status in detail without changing the business status', async () => {
    const connection = {
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
      execute: jest.fn()
        .mockResolvedValueOnce([[{ id: 9, outbound_no: 'OUT-9', status: 'completed', finance_status: 'approved' }]])
        .mockResolvedValueOnce([[]]),
    };
    db.pool.getConnection.mockResolvedValue(connection);
    const res = responseDouble();

    await getOutboundDetail({ params: { id: '9' } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data).toEqual(expect.objectContaining({
      id: 9,
      status: 'completed',
      statusText: '已审核',
      financeStatus: 'approved',
    }));
    expectLatestMovementJoin(connection.execute.mock.calls[0][0]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test('business mode keeps approved documents in their completed and partial-completed totals', async () => {
    mockListResults([
      { id: 1, status: 'completed', finance_status: 'approved' },
      { id: 2, status: 'completed', finance_status: 'rejected' },
      { id: 3, status: 'partial_completed', finance_status: 'approved' },
    ], 3, [
      { status: 'completed', count: '2' },
      { status: 'partial_completed', count: '1' },
    ]);
    const res = responseDouble();

    await getOutboundList({ query: { statusMode: 'business' } }, res);

    const { list, statistics } = res.json.mock.calls[0][0].data;
    expect(list).toEqual([
      expect.objectContaining({ status: 'completed', statusText: '已完成', financeStatus: 'approved' }),
      expect.objectContaining({ status: 'completed', statusText: '已完成', financeStatus: 'rejected' }),
      expect.objectContaining({ status: 'partial_completed', statusText: '部分完成', financeStatus: 'approved' }),
    ]);
    expect(statistics).toEqual(expect.objectContaining({
      total: 3, completedCount: 2, partialCompletedCount: 1, approvedCount: 0,
    }));
    const statsSql = db.pool.query.mock.calls[2][0];
    expect(statsSql).toContain('SELECT o.status as status');
    expect(statsSql).toContain('GROUP BY o.status');
    expect(statsSql).not.toContain("THEN 'approved'");
  });

  test('provides the first issued material independently of the production product', async () => {
    mockListResults([{
      id: 1,
      status: 'draft',
      product_code: 'FINISHED-1',
      material_code: 'RAW-2',
      material_name: '螺丝',
      material_specs: 'M6',
      first_item_quantity: '0',
      total_quantity: '14.5',
      items_count: '2',
      location_names: '零件仓,原料仓',
    }], 1, [{ status: 'draft', count: 1 }]);
    const res = responseDouble();

    await getOutboundList({ query: { statusMode: 'business' } }, res);

    expect(res.json.mock.calls[0][0].data.list[0]).toEqual(expect.objectContaining({
      productCode: 'FINISHED-1',
      materialCode: 'RAW-2',
      materialName: '螺丝',
      materialSpecs: 'M6',
      firstItemQuantity: 0,
      totalQuantity: 14.5,
      itemsCount: 2,
      locationName: '零件仓,原料仓',
      locationNames: '零件仓,原料仓',
    }));
    const listSql = db.pool.query.mock.calls[0][0];
    expect(listSql).toContain('MIN(oi_first.id)');
    expect(listSql).toContain('oi_first.outbound_id = o.id');
    expect(listSql).toContain('first_item.material_id = first_material.id');
    expect(listSql).toContain('MAX(first_item.quantity) as first_item_quantity');
  });

  test('uses matching document filters for list, total, statistics and exported business status', async () => {
    const query = {
      statusMode: 'business',
      status: 'completed',
      outboundNo: 'OUT-9',
      materialName: "螺丝' OR 1=1",
      locationId: '4',
      outboundType: 'production',
      productionGroupId: '8',
      startDate: '2026-09-01',
      endDate: '2026-09-29',
    };
    mockListResults([{ id: 1, status: 'completed', finance_status: 'approved' }], 1, [
      { status: 'completed', count: 1 },
    ]);
    db.pool.query.mockResolvedValueOnce([[
      { outbound_no: 'OUT-9', status: 'completed', finance_status: 'approved' },
    ]]);
    const listRes = responseDouble();
    const exportRes = responseDouble();

    await getOutboundList({ query }, listRes);
    await exportOutbound({ query }, exportRes);

    expect(listRes.status).toHaveBeenCalledWith(200);
    expect(exportRes.send).toHaveBeenCalledTimes(1);
    expect(db.pool.query).toHaveBeenCalledTimes(4);
    for (const [sql, params] of db.pool.query.mock.calls) {
      expect(sql).toContain('o.outbound_no LIKE ?');
      expect(sql).toContain('oi_search.outbound_id = o.id');
      expect(sql).toContain('m_search.name LIKE ? OR m_search.code LIKE ? OR m_search.specs LIKE ?');
      expect(sql).toContain('oi_location.outbound_id = o.id AND m_location.location_id = ?');
      expect(sql).toContain('AND (o.status) = ?');
      expect(sql).toContain('AND p.production_group_id = ?');
      expect(sql).toContain('AND o.created_by = ?');
      expect(sql).not.toContain(query.materialName);
      expect(params).toEqual([
        '%OUT-9%', "%螺丝' OR 1=1%", "%螺丝' OR 1=1%", "%螺丝' OR 1=1%",
        '4', 'production', 'completed', '8', '2026-09-01', '2026-09-29', 7,
      ]);
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exportRes.send.mock.calls[0][0]);
    expect(workbook.getWorksheet('出库单').getCell('C2').value).toBe('已完成');
  });

  test('keeps approval metadata read-only in the outbound field contract', () => {
    expect(inventoryOutboundMap.toApi({ status: 'completed', finance_status: 'rejected' }))
      .toEqual(expect.objectContaining({ status: 'completed', financeStatus: 'rejected' }));
    expect(inventoryOutboundMap.toApi({ status: 'draft' }).financeStatus).toBeNull();
    expect(inventoryOutboundMap.fromApi({ status: 'completed', financeStatus: 'approved' }))
      .toEqual({ status: 'completed' });
  });

  test.each(['', 'approved'])('exports approval text and applies the "%s" filter consistently', async (status) => {
    const rows = [
      { outbound_no: 'OUT-1', status: 'completed', finance_status: 'approved' },
      { outbound_no: 'OUT-2', status: 'partial_completed', finance_status: 'approved' },
    ];
    if (!status) rows.push(
      { outbound_no: 'OUT-3', status: 'completed', finance_status: 'pending' },
      { outbound_no: 'OUT-4', status: 'completed', finance_status: 'rejected' },
      { outbound_no: 'OUT-5', status: 'draft' },
      { outbound_no: 'OUT-6', status: 'reversed', finance_status: 'reversed' },
      { outbound_no: 'OUT-7', status: 'reversed', finance_status: 'approved' },
      { outbound_no: 'OUT-8', status: 'cancelled', finance_status: 'approved' },
    );
    db.pool.query.mockResolvedValueOnce([rows]);
    const res = responseDouble();

    await exportOutbound({ query: { status } }, res);

    expect(res.send).toHaveBeenCalledTimes(1);
    const [sql, params] = db.pool.query.mock.calls[0];
    expectLatestMovementJoin(sql);
    expect(params).toEqual(status ? ['approved', 7] : [7]);
    if (status) {
      expectDisplayStatusFilter(sql);
      expect(sql).not.toContain('AND o.status = ?');
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.send.mock.calls[0][0]);
    const sheet = workbook.getWorksheet('出库单');
    expect(sheet.getCell('C2').value).toBe('已审核');
    expect(sheet.getCell('C3').value).toBe('已审核');
    if (!status) {
      expect(sheet.getCell('C4').value).toBe('待财务审');
      expect(sheet.getCell('C5').value).toBe('财务驳回');
      expect(sheet.getCell('C6').value).toBe('草稿');
      expect(sheet.getCell('C7').value).toBe('已冲销');
      expect(sheet.getCell('C8').value).toBe('已冲销');
      expect(sheet.getCell('C9').value).toBe('已取消');
    }
  });

  test('completed export uses the same exclusive status filter as the list', async () => {
    db.pool.query.mockResolvedValueOnce([[
      { outbound_no: 'OUT-PENDING', status: 'completed', finance_status: 'pending' },
      { outbound_no: 'OUT-LEGACY', status: 'completed', finance_status: null },
    ]]);
    const res = responseDouble();

    await exportOutbound({ query: { status: 'completed' } }, res);

    const [sql, params] = db.pool.query.mock.calls[0];
    expectDisplayStatusFilter(sql);
    expect(params).toEqual(['completed', 7]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.send.mock.calls[0][0]);
    const sheet = workbook.getWorksheet('出库单');
    expect(sheet.rowCount).toBe(3);
    expect(sheet.getCell('C2').value).toBe('待财务审');
    expect(sheet.getCell('C3').value).toBe('已完成');
  });
});
