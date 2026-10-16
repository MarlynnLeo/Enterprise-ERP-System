const db = require('../../src/config/db');
const InventoryService = require('../../src/services/InventoryService');
const InventoryPostingService = require('../../src/services/InventoryPostingService');
const { currentDateString } = require('../../src/utils/dateUtils');
const { ensureCurrentAccountingPeriod } = require('../accountingPeriodFixture');

describe('inventory posting accounting lifecycle against MySQL', () => {
  let connection;
  let fixture;

  beforeEach(async () => {
    connection = await db.pool.getConnection();
    await connection.beginTransaction();
    await ensureCurrentAccountingPeriod(connection);
    const prefix = `IP${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`;
    const [location] = await connection.query(
      "INSERT INTO locations (code, name, type, status) VALUES (?, ?, 'warehouse', 1)",
      [prefix, prefix]
    );
    const [unit] = await connection.query('INSERT INTO units (code, name) VALUES (?, ?)', [
      prefix,
      '件',
    ]);
    const [material] = await connection.query(
      'INSERT INTO materials (code, name, location_id, unit_id) VALUES (?, ?, ?, ?)',
      [prefix, prefix, location.insertId, unit.insertId]
    );
    const actors = [];
    for (const role of ['maker', 'reviewer', 'reversal-reviewer']) {
      const [actor] = await connection.query(
        "INSERT INTO users (username, password, real_name, role, status) VALUES (?, ?, ?, 'user', 1)",
        [`${prefix}-${role}`, 'login-disabled-test-fixture', role]
      );
      actors.push({ id: actor.insertId, label: role });
    }
    const [inbound] = await connection.query(
      "INSERT INTO inventory_inbound (inbound_no, inbound_date, inbound_type, location_id, status, operator, created_by) VALUES (?, CURRENT_DATE, 'other', ?, 'completed', ?, ?)",
      [prefix, location.insertId, actors[0].label, actors[0].id]
    );
    fixture = {
      prefix,
      locationId: location.insertId,
      unitId: unit.insertId,
      materialId: material.insertId,
      inboundId: inbound.insertId,
      maker: actors[0],
      reviewer: actors[1],
      reversalReviewer: actors[2],
    };
  });

  afterEach(async () => {
    if (connection) {
      await connection.rollback();
      connection.release();
      connection = null;
    }
  });

  async function stage(overrides = {}) {
    await InventoryService.updateStock(
      {
        materialId: fixture.materialId,
        locationId: fixture.locationId,
        unitId: fixture.unitId,
        quantity: 5,
        unitCost: 12.5,
        batchNumber: fixture.prefix,
        transactionType: 'inbound',
        referenceType: 'inbound',
        referenceNo: fixture.prefix,
        sourceId: fixture.inboundId,
        operator: fixture.maker.label,
        businessApprovedById: fixture.maker.id,
        idempotencyKey: fixture.prefix,
        ...overrides,
      },
      connection
    );
    const [[posting]] = await connection.query(
      'SELECT * FROM inventory_posting_documents WHERE source_no = ? ORDER BY posting_sequence DESC LIMIT 1',
      [fixture.prefix]
    );
    return posting;
  }

  async function inventory() {
    const [[balance]] = await connection.query(
      'SELECT COALESCE(SUM(quantity), 0) AS quantity, COALESCE(SUM(total_value), 0) AS value FROM inventory_stock_balances WHERE material_id = ?',
      [fixture.materialId]
    );
    const [[ledger]] = await connection.query(
      'SELECT COUNT(*) AS count, COALESCE(SUM(quantity), 0) AS quantity FROM inventory_ledger WHERE material_id = ?',
      [fixture.materialId]
    );
    return {
      quantity: Number(balance.quantity),
      value: Number(balance.value),
      ledgerCount: Number(ledger.count),
      ledgerQuantity: Number(ledger.quantity),
    };
  }

  test('staging and rejection do not post stock; resubmission posts exactly once and records a durable finance task', async () => {
    const rejected = await stage();
    expect(rejected.finance_status).toBe('pending');
    expect(await inventory()).toMatchObject({ quantity: 0, value: 0, ledgerCount: 0 });
    await expect(
      InventoryPostingService.approve(rejected.id, fixture.maker, connection)
    ).rejects.toMatchObject({ code: 'SEPARATION_OF_DUTIES' });
    await InventoryPostingService.reject(
      rejected.id,
      fixture.reviewer,
      '数量单价需要复核',
      connection
    );
    expect(await inventory()).toMatchObject({ quantity: 0, value: 0, ledgerCount: 0 });

    const resubmitted = await stage();
    expect(resubmitted.id).not.toBe(rejected.id);
    expect(Number(resubmitted.posting_sequence)).toBe(2);
    await InventoryPostingService.approve(resubmitted.id, fixture.reviewer, connection);
    expect(await inventory()).toEqual({
      quantity: 5,
      value: 62.5,
      ledgerCount: 1,
      ledgerQuantity: 5,
    });
    await expect(
      InventoryPostingService.approve(resubmitted.id, fixture.reviewer, connection)
    ).rejects.toMatchObject({ code: 'INVALID_STATUS' });
    expect(await inventory()).toMatchObject({ quantity: 5, ledgerCount: 1 });

    const [events] = await connection.query(
      "SELECT status, payload FROM domain_events WHERE dedup_key = ? AND event_name = 'INVENTORY_POSTING_APPROVED'",
      [`INVENTORY_POSTING_APPROVED:${resubmitted.id}`]
    );
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('pending');
    const [history] = await connection.query(
      'SELECT event_type FROM inventory_posting_events WHERE posting_document_id IN (?, ?) ORDER BY id',
      [rejected.id, resubmitted.id]
    );
    expect(history.map((row) => row.event_type)).toEqual([
      'business_approved',
      'finance_rejected',
      'business_approved',
      'finance_approved',
    ]);
  });

  test('reversal requires a separate review and closes the source document with compensating ledger entries', async () => {
    const original = await stage();
    await InventoryPostingService.approve(original.id, fixture.reviewer, connection);
    const [accounts] = await connection.query(
      'SELECT id FROM gl_accounts a WHERE is_active = 1 AND NOT EXISTS (SELECT 1 FROM gl_accounts child WHERE child.parent_id = a.id) ORDER BY id LIMIT 2'
    );
    expect(accounts).toHaveLength(2);
    const [[period]] = await connection.query(
      "SELECT id, DATE_FORMAT(CURRENT_DATE, '%Y-%m-%d') AS today FROM gl_periods WHERE CURRENT_DATE BETWEEN start_date AND end_date AND is_closed = 0 LIMIT 1"
    );
    const entryId = await require('../../src/models/finance').createEntry(
      {
        entry_date: period.today,
        posting_date: period.today,
        period_id: period.id,
        document_type: 'inventory_inbound',
        document_number: fixture.prefix,
        description: '库存过账冲销集成测试',
        created_by: fixture.reviewer.id,
        status: 'posted',
        is_posted: 1,
      },
      [
        { account_id: accounts[0].id, debit_amount: 62.5, credit_amount: 0 },
        { account_id: accounts[1].id, debit_amount: 0, credit_amount: 62.5 },
      ],
      connection
    );
    const reversal = await InventoryPostingService.requestReversal(
      original.id,
      fixture.reviewer,
      '撤销重复业务单据',
      {},
      connection
    );
    expect(await inventory()).toMatchObject({ quantity: 5, value: 62.5, ledgerCount: 1 });
    await expect(
      InventoryPostingService.requestReversal(
        original.id,
        fixture.reviewer,
        '重复申请',
        {},
        connection
      )
    ).rejects.toMatchObject({ code: 'ALREADY_REVERSED' });
    await expect(
      InventoryPostingService.approve(reversal.reversalDocumentId, fixture.reviewer, connection)
    ).rejects.toMatchObject({ code: 'SEPARATION_OF_DUTIES' });

    await InventoryPostingService.approve(
      reversal.reversalDocumentId,
      fixture.reversalReviewer,
      connection
    );
    expect(await inventory()).toEqual({ quantity: 0, value: 0, ledgerCount: 2, ledgerQuantity: 0 });
    const [[source]] = await connection.query('SELECT status FROM inventory_inbound WHERE id = ?', [
      fixture.inboundId,
    ]);
    expect(source.status).toBe('reversed');
    const [[posting]] = await connection.query(
      'SELECT finance_status FROM inventory_posting_documents WHERE id = ?',
      [original.id]
    );
    expect(posting.finance_status).toBe('reversed');
    const [ledger] = await connection.query(
      'SELECT id, reversal_of_ledger_id FROM inventory_ledger WHERE material_id = ? ORDER BY id',
      [fixture.materialId]
    );
    expect(Number(ledger[1].reversal_of_ledger_id)).toBe(Number(ledger[0].id));
    const [[voucher]] = await connection.query(
      'SELECT is_reversed, reversal_entry_id FROM gl_entries WHERE id = ?',
      [entryId]
    );
    expect(Number(voucher.is_reversed)).toBe(1);
    expect(Number(voucher.reversal_entry_id)).toBeGreaterThan(0);
    const [[totals]] = await connection.query(
      'SELECT SUM(debit_amount) AS debit, SUM(credit_amount) AS credit FROM gl_entry_items WHERE entry_id = ?',
      [voucher.reversal_entry_id]
    );
    expect(Number(totals.debit)).toBe(62.5);
    expect(Number(totals.credit)).toBe(62.5);
  });

  test('weighted costs are frozen at storage precision before valuation and stay equal after approval', async () => {
    const staged = await stage({ quantity: 100000, unitCost: 1 / 3 });
    await InventoryPostingService.approve(staged.id, fixture.reviewer, connection);
    const [[line]] = await connection.query(
      'SELECT signed_quantity, unit_cost, total_value, posted_value FROM inventory_posting_lines WHERE posting_document_id = ?',
      [staged.id]
    );
    const [[ledger]] = await connection.query(
      'SELECT quantity, unit_cost, total_value FROM inventory_ledger WHERE posting_document_id = ?',
      [staged.id]
    );
    expect(Number(line.unit_cost)).toBe(0.333333);
    expect(Number(staged.total_value)).toBe(33333.3);
    expect(Number(line.total_value)).toBe(Number(ledger.total_value));
    expect(Number(line.posted_value)).toBe(Number(line.total_value));
    expect((await inventory()).value).toBe(Number(line.total_value));
  });

  test('approval preserves a historical frozen value instead of recalculating it from rounded unit cost', async () => {
    const { documentId } = await InventoryPostingService.stageMovement(
      connection,
      {
        sourceType: 'inbound',
        sourceId: fixture.inboundId,
        sourceNo: fixture.prefix,
        transactionDate: currentDateString(),
        businessApprovedById: fixture.maker.id,
        businessApprovedBy: fixture.maker.label,
      },
      [
        {
          materialId: fixture.materialId,
          locationId: fixture.locationId,
          unitId: fixture.unitId,
          transactionType: 'inbound',
          referenceType: 'inbound',
          referenceNo: fixture.prefix,
          signedQuantity: 3,
          unitCost: 0.333333,
          totalValue: 1,
          batchNumber: fixture.prefix,
          transactionDate: currentDateString(),
          operator: fixture.maker.label,
        },
      ]
    );
    await InventoryPostingService.approve(documentId, fixture.reviewer, connection);
    expect((await inventory()).value).toBe(1);
    const reversal = await InventoryPostingService.requestReversal(
      documentId,
      fixture.reviewer,
      '验证历史成本尾差冲销',
      {},
      connection
    );
    const [lines] = await connection.query(
      'SELECT * FROM inventory_posting_lines WHERE posting_document_id = ?',
      [reversal.reversalDocumentId]
    );
    expect(Number(lines[0].total_value)).toBe(-1);
    // Exercise the real stock writer with the reversal snapshot; business/GL
    // closure is covered by the separate complete reversal test above.
    await connection.query(
      "UPDATE inventory_posting_documents SET finance_status = 'approved', locked = 1 WHERE id = ?",
      [reversal.reversalDocumentId]
    );
    await InventoryPostingService._postLines(
      connection,
      { id: reversal.reversalDocumentId },
      lines,
      fixture.reversalReviewer
    );
    expect(await inventory()).toEqual({ quantity: 0, value: 0, ledgerCount: 2, ledgerQuantity: 0 });
  });
});
