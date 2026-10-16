/* global afterEach, beforeEach, describe, expect, jest, test */
jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/services/business/PeriodValidationService', () => ({
  validateInventoryTransaction: jest.fn(async () => ({ allowed: true })),
}));

const { DatabaseSync } = require('node:sqlite');
const Posting = require('../../src/services/InventoryPostingService');
const Source = require('../../src/services/business/PurchaseReceiptPostingSourceService');
const SourceLock = require('../../src/services/business/InventoryPostingSourceLockService');
const Resubmission = require('../../src/services/business/InventoryPostingResubmissionService');
const Periods = require('../../src/services/business/PeriodValidationService');
const { hashSnapshot } = require('../../src/utils/inventoryPostingSnapshot');
const crypto = require('crypto');

let database;
let connection;
const actor = { id: 8, label: '采购员' };
const request = { sourceType: 'purchase_receipt', sourceId: 9, sourceNo: 'RC-9', actor };

beforeEach(() => {
  database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE inventory_posting_documents (
      id INTEGER PRIMARY KEY, posting_no TEXT, source_type TEXT, source_id INTEGER, source_no TEXT,
      posting_sequence INTEGER DEFAULT 1, posting_kind TEXT DEFAULT 'movement',
      original_posting_document_id INTEGER, movement_direction TEXT DEFAULT 'inbound', transaction_date TEXT DEFAULT '2026-10-15',
      finance_status TEXT DEFAULT 'rejected', business_approved_by_id INTEGER,
      business_approved_by TEXT, business_approved_at TEXT, finance_approved_by INTEGER,
      finance_approved_label TEXT, finance_approved_at TEXT, rejected_by INTEGER,
      rejected_label TEXT, rejected_at TEXT, reversed_by INTEGER, reversed_label TEXT,
      reversed_at TEXT, snapshot_hash TEXT, snapshot_version INTEGER, locked INTEGER DEFAULT 0,
      is_legacy INTEGER DEFAULT 0, total_quantity NUMERIC, total_value NUMERIC, remark TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE inventory_posting_lines (
      id INTEGER PRIMARY KEY, posting_document_id INTEGER, line_no INTEGER,
      material_id INTEGER, location_id INTEGER, signed_quantity REAL, unit_id INTEGER,
      unit_cost REAL, total_value REAL, transaction_type TEXT, reference_type TEXT, reference_no TEXT,
      batch_number TEXT, operator TEXT, transaction_date TEXT, source_line_key TEXT,
      payload_json TEXT, snapshot_hash TEXT, posted_quantity REAL, posted_value REAL
    );
    CREATE TABLE inventory_posting_events (id INTEGER, posting_document_id INTEGER,
      event_type TEXT, from_status TEXT, to_status TEXT, actor_id INTEGER, actor_label TEXT,
      remark TEXT, event_data TEXT, created_at TEXT);
    CREATE TABLE purchase_receipts (id INTEGER PRIMARY KEY, order_id INTEGER, receipt_no TEXT, status TEXT, deleted_at TEXT, warehouse_id INTEGER);
    INSERT INTO purchase_receipts VALUES (9,2,'RC-9','completed',NULL,6),(10,3,'RC-10','completed',NULL,6);
    CREATE TABLE purchase_receipt_items (id INTEGER PRIMARY KEY, receipt_id INTEGER, material_id INTEGER,
      qualified_quantity REAL, batch_number TEXT, price REAL, unit_id INTEGER);
    INSERT INTO purchase_receipt_items VALUES (90,9,3,6,'BATCH-7',20,1);
    CREATE TABLE inventory_ledger (id INTEGER PRIMARY KEY, posting_document_id INTEGER, posting_line_id INTEGER,
      reversal_of_ledger_id INTEGER, material_id INTEGER, location_id INTEGER, transaction_type TEXT,
      reference_type TEXT, reference_no TEXT, quantity REAL, unit_id INTEGER, batch_number TEXT,
      unit_cost REAL, total_value REAL, receipt_id INTEGER, receipt_no TEXT);
    CREATE TABLE purchase_orders (id INTEGER PRIMARY KEY);
    INSERT INTO purchase_orders VALUES (2),(3);
    CREATE TABLE inventory_inbound (id INTEGER PRIMARY KEY, inbound_no TEXT, is_deleted INTEGER, deleted_at TEXT);
    INSERT INTO inventory_inbound VALUES (9,'RC-9',0,NULL);
  `);
  connection = {
    execute: jest.fn(async (sql, params = []) => {
      const statement = database.prepare(sql.replace(/\s+FOR UPDATE/g, ''));
      return /^\s*SELECT/.test(sql)
        ? [statement.all(...params)]
        : [{ affectedRows: Number(statement.run(...params).changes) }];
    }),
  };
  Periods.validateInventoryTransaction.mockResolvedValue({ allowed: true });
});
afterEach(() => database.close());

function insert(id, sourceType, { sourceId = null, sourceNo = 'RC-9', receiptId = 9,
  status = 'rejected', sequence = 1, missingReceiptId = false, payload: extra = {} } = {}) {
  const payload = {
    materialId: 3, locationId: 6, transactionType: 'purchase_inbound', referenceType: sourceType,
    referenceNo: sourceNo, signedQuantity: 6, unitId: 1, batchNumber: 'BATCH-7', unitCost: 20,
    totalValue: 120, transactionDate: '2026-10-15', operator: 'Inspector',
    receiptId, receiptNo: sourceNo, sourceLineKey: `purchase_receipt:${receiptId}:item:90`, ...extra,
  };
  if (missingReceiptId) delete payload.receiptId;
  database.prepare(`INSERT INTO inventory_posting_documents
    (id,posting_no,source_type,source_id,source_no,finance_status,posting_sequence) VALUES (?,?,?,?,?,?,?)`)
    .run(id, `INV-${id}`, sourceType, sourceId, sourceNo, status, sequence);
  database.prepare(`INSERT INTO inventory_posting_lines
    (id,posting_document_id,line_no,material_id,location_id,signed_quantity,unit_id,unit_cost,total_value,
     transaction_type,reference_type,reference_no,batch_number,operator,transaction_date,source_line_key,payload_json,snapshot_hash)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id * 10, id, 1, payload.materialId, payload.locationId, payload.signedQuantity, payload.unitId,
      payload.unitCost, payload.totalValue, payload.transactionType, payload.referenceType, payload.referenceNo,
      payload.batchNumber, payload.operator, payload.transactionDate, payload.sourceLineKey,
      JSON.stringify(payload), hashSnapshot(payload)
    );
  return database.prepare('SELECT * FROM inventory_posting_documents WHERE id=?').get(id);
}

function archive(id = 1) {
  insert(id, 'batch_create', { status: 'approved' });
  const ledgerId = 1000 + id;
  const key = `legacy-ledger-${ledgerId}`;
  database.prepare('UPDATE inventory_posting_documents SET is_legacy=1,locked=1 WHERE id=?').run(id);
  database.prepare(`UPDATE inventory_posting_lines SET source_line_key=?,snapshot_hash=?,payload_json=?,
    posted_quantity=signed_quantity,posted_value=total_value WHERE posting_document_id=?`)
    .run(key, crypto.createHash('sha256').update(key).digest('hex'), JSON.stringify({ legacyLedgerId: ledgerId }), id);
  database.prepare(`INSERT INTO inventory_ledger
    (id,posting_document_id,posting_line_id,material_id,location_id,transaction_type,reference_type,
     reference_no,quantity,unit_id,batch_number,unit_cost,total_value)
    SELECT ?,posting_document_id,id,material_id,location_id,transaction_type,reference_type,
      reference_no,signed_quantity,unit_id,batch_number,unit_cost,total_value
      FROM inventory_posting_lines WHERE posting_document_id=?`).run(ledgerId, id);
  return database.prepare('SELECT * FROM inventory_posting_documents WHERE id=?').get(id);
}

describe('采购冻结来源的可验证身份和锁顺序', () => {
  test.each(['inbound', 'purchase_inbound', 'batch_create'])('历史 %s 按受验快照锁采购单，不误锁同号同ID的仓库入库单', async type => {
    const posting = insert(1, type);
    expect(await Source.resolve(connection, posting)).toEqual({ receiptId: 9, receiptNo: 'RC-9' });
    connection.execute.mockClear();
    expect(await SourceLock.lockSource(connection, posting)).toMatchObject({ id: 9, source_no: 'RC-9' });
    const locks = connection.execute.mock.calls.filter(([sql]) => sql.includes('FOR UPDATE')).map(([sql]) => sql);
    expect(locks[0]).toContain('FROM purchase_orders');
    expect(locks[1]).toContain('FROM purchase_receipts');
    expect(connection.execute.mock.calls.some(([sql]) => sql.includes('FROM inventory_inbound'))).toBe(false);
  });

  test('新canonical来源以receiptId和receiptNo联合确认业务单据', async () => {
    const posting = insert(1, 'purchase_receipt', { sourceId: 9 });
    expect(await SourceLock.lockSource(connection, posting)).toMatchObject({ id: 9 });
    await expect(SourceLock.lockSource(connection, { ...posting, source_id: 10 }))
      .rejects.toMatchObject({ code: 'POSTING_SOURCE_CHANGED' });
  });

  test.each(['draft', 'inspected', 'cancelled'])('采购业务状态为%s时阻断审批', async status => {
    const posting = insert(1, 'purchase_receipt', { sourceId: 9 });
    database.prepare('UPDATE purchase_receipts SET status=? WHERE id=9').run(status);
    await expect(SourceLock.lockSource(connection, posting)).rejects.toMatchObject({ code: 'POSTING_SOURCE_CHANGED' });
  });

  test('缺少receipt证据的普通inbound即使同号仍归仓库', async () => {
    const posting = insert(1, 'inbound', { sourceId: 9, receiptId: null,
      payload: { transactionType: 'other_inbound', receiptNo: null } });
    expect(await Source.resolve(connection, posting)).toBeNull();
    expect(await SourceLock.lockSource(connection, posting)).toMatchObject({ id: 9 });
    expect(connection.execute.mock.calls.some(([sql]) => sql.includes('FROM purchase_receipts'))).toBe(false);
  });

  test.each([
    ['快照hash被改', "UPDATE inventory_posting_lines SET snapshot_hash='changed'"],
    ['冻结金额被改', 'UPDATE inventory_posting_lines SET unit_cost=999'],
    ['来源头ID不匹配', 'UPDATE inventory_posting_documents SET source_id=10'],
    ['来源头单号不匹配', "UPDATE inventory_posting_documents SET source_no='OTHER'"],
  ])('%s时拒绝历史来源识别', async (_label, sql) => {
    insert(1, 'inbound');
    database.exec(sql);
    const posting = database.prepare('SELECT * FROM inventory_posting_documents WHERE id=1').get();
    await expect(Source.resolve(connection, posting)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('同张历史过账的不同冻结行不能指向不同采购收货单', async () => {
    const posting = insert(1, 'inbound');
    insert(2, 'inbound', { receiptId: 10 });
    database.exec('UPDATE inventory_posting_lines SET posting_document_id=1 WHERE id=20');
    await expect(Source.resolve(connection, posting)).rejects.toMatchObject({ code: 'POSTING_SOURCE_CHANGED' });
  });

  test.each(['inbound', 'purchase_inbound', 'batch_create', 'purchase_receipt'])('阻断%s采购来源的遗留待审反审核，不写库存或更改原单状态', async type => {
    insert(1, type, { sourceId: type === 'purchase_receipt' ? 9 : null, status: 'approved' });
    database.prepare(`INSERT INTO inventory_posting_documents
      (id,source_type,source_id,source_no,posting_kind,original_posting_document_id,finance_status)
      VALUES (2,?,9,'RC-9-REV-1','reversal',1,'pending')`).run(type);
    await expect(Posting.approve(2, { id: 99, label: '财务' }, connection))
      .rejects.toMatchObject({ statusCode: 409, code: 'REVERSAL_NOT_SUPPORTED' });
    expect(connection.execute.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
    expect(database.prepare('SELECT finance_status FROM inventory_posting_documents WHERE id=1').get().finance_status).toBe('approved');
    expect(database.prepare('SELECT status FROM purchase_receipts WHERE id=9').get().status).toBe('completed');
  });
});

describe('采购审批轨迹隔离与历史后继', () => {
  test.each([
    ['RCV202609040001', 27223, 14614, 'G005-260904006', 1, 0.16],
    ['RCV202609030002', 27222, 12151, 'G128-260824001', 5000, 5.92],
    ['RCV202609030001', 27221, 10147, 'G476-260824001', 1000, 1],
  ])('人工一致样例%s的完整快照缺receiptId时按全部收货明细证明身份', async (sourceNo, receiptId, materialId, batchNumber, signedQuantity, unitCost) => {
    database.prepare(`INSERT INTO purchase_receipts VALUES (?,2,?,'completed',NULL,1)`).run(receiptId, sourceNo);
    database.prepare(`INSERT INTO purchase_receipt_items VALUES (?, ?, ?, ?, ?, ?, 1)`)
      .run(receiptId, receiptId, materialId, signedQuantity, batchNumber, unitCost);
    const posting = insert(1, 'batch_create', { sourceNo, missingReceiptId: true, status: 'pending', payload: {
      materialId, locationId: 1, signedQuantity, batchNumber, unitCost, totalValue: signedQuantity * unitCost,
    } });
    expect(await Source.resolve(connection, posting)).toEqual({ receiptId, receiptNo: sourceNo });
    expect(await Posting.getApprovalBySource({ sourceType: 'purchase_receipt', sourceId: receiptId, sourceNo }, connection))
      .toMatchObject({ current: { id: 1, finance_status: 'pending', source_context: { sourceId: receiptId, sourceNo } } });
    expect(await SourceLock.lockSource(connection, posting)).toMatchObject({ id: receiptId });
    expect(connection.execute.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
  });

  test.each([
    ['数量', 'UPDATE purchase_receipt_items SET qualified_quantity=7'],
    ['物料', 'UPDATE purchase_receipt_items SET material_id=4'],
    ['仓库', 'UPDATE purchase_receipts SET warehouse_id=7 WHERE id=9'],
    ['批次', "UPDATE purchase_receipt_items SET batch_number='OTHER'"],
    ['成本', 'UPDATE purchase_receipt_items SET price=21'],
    ['缺收货行', 'DELETE FROM purchase_receipt_items'],
    ['部分明细', "INSERT INTO purchase_receipt_items VALUES (91,9,4,3,'OTHER',10,1)"],
    ['重复单号', "INSERT INTO purchase_receipts VALUES (11,2,'RC-9','completed',NULL,6)"],
    ['来源ID', 'UPDATE inventory_posting_documents SET source_id=10'],
    ['非完成状态', "UPDATE purchase_receipts SET status='inspected' WHERE id=9"],
  ])('缺receiptId的%s证据不符时拒绝识别并向采购页报告校验错误', async (_label, sql) => {
    insert(1, 'inbound', { missingReceiptId: true });
    database.exec(sql);
    const posting = database.prepare('SELECT * FROM inventory_posting_documents WHERE id=1').get();
    await expect(Source.resolve(connection, posting)).rejects.toMatchObject({ code: 'POSTING_SOURCE_CHANGED' });
    if (_label === '来源ID') {
      expect((await Posting.getApprovalBySource(request, connection)).postings).toEqual([]);
    } else {
      await expect(Posting.getApprovalBySource(request, connection))
        .rejects.toMatchObject({ statusCode: 409, code: 'POSTING_SOURCE_CHANGED', message: expect.stringContaining('INV-1') });
    }
    expect((await Posting.getApprovalBySource({ ...request, sourceType: 'inbound' }, connection)).postings).toEqual([]);
  });

  test.each(['batch_number', 'source_line_key'])('hash正确且经济值一致但%s偏离冻结payload时阻断查询与审批', async column => {
    insert(1, 'batch_create', { missingReceiptId: true, status: 'pending' });
    database.prepare(`UPDATE inventory_posting_lines SET ${column}=? WHERE id=10`).run('changed-after-freeze');
    const line = database.prepare('SELECT * FROM inventory_posting_lines WHERE id=10').get();
    expect(line.snapshot_hash).toBe(hashSnapshot(JSON.parse(line.payload_json)));
    await expect(Posting.getApprovalBySource(request, connection)).rejects.toMatchObject({
      statusCode: 409, code: 'SNAPSHOT_INVALID', message: expect.stringContaining('INV-1（ID: 1）'),
    });
    await expect(Posting.approve(1, { id: 99, label: '财务' }, connection))
      .rejects.toMatchObject({ code: 'SNAPSHOT_INVALID' });
    expect(connection.execute.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
    expect(database.prepare('SELECT * FROM inventory_posting_lines WHERE id=10').get()).toEqual(line);
  });

  test.each([
    [8249, 8206, 'RCV202609040001'],
    [8250, 8207, 'RCV202609030002'],
    [8251, 8208, 'RCV202609030001'],
  ])('历史模式过账%s的批次与行标识偏离冻结payload时返回409及明确过账身份', async (postingId, lineId, sourceNo) => {
    insert(postingId, 'batch_create', { sourceNo, missingReceiptId: true, status: 'pending' });
    database.prepare(`UPDATE inventory_posting_lines SET id=?,batch_number='changed-batch',source_line_key='changed-key'
      WHERE posting_document_id=?`).run(lineId, postingId);
    const sourceRequest = { sourceType: 'purchase_receipt', sourceId: 9, sourceNo };
    await expect(Posting.getApprovalBySource(sourceRequest, connection)).rejects.toMatchObject({
      statusCode: 409, code: 'SNAPSHOT_INVALID', message: expect.stringContaining(`INV-${postingId}（ID: ${postingId}）`),
    });
    await expect(Posting.approve(postingId, { id: 99, label: '财务' }, connection))
      .rejects.toMatchObject({ code: 'SNAPSHOT_INVALID' });
    expect(connection.execute.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
  });

  test('最新采购候选损坏时不得回退到较早已审单伪装当前审批状态', async () => {
    insert(1, 'purchase_receipt', { sourceId: 9, status: 'approved' });
    insert(2, 'batch_create', { missingReceiptId: true, status: 'pending' });
    database.exec("UPDATE inventory_posting_lines SET source_line_key='changed' WHERE posting_document_id=2");
    await expect(Posting.getApprovalBySource(request, connection)).rejects.toMatchObject({
      code: 'SNAPSHOT_INVALID', message: expect.stringContaining('INV-2'),
    });
  });

  test('同物料同批次的全部冻结分行合计必须等于全部收货行', async () => {
    const posting = insert(1, 'inbound', { missingReceiptId: true, payload: { signedQuantity: 2, totalValue: 40 } });
    insert(2, 'inbound', { missingReceiptId: true, payload: { signedQuantity: 4, totalValue: 80 } });
    database.exec('UPDATE inventory_posting_lines SET posting_document_id=1,line_no=2 WHERE id=20');
    expect(await Source.resolve(connection, posting)).toEqual({ receiptId: 9, receiptNo: 'RC-9' });
    database.exec('DELETE FROM inventory_posting_lines WHERE id=20');
    await expect(Source.resolve(connection, posting)).rejects.toMatchObject({ code: 'POSTING_SOURCE_CHANGED' });
  });

  test('同号仓库、其他采购ID和其他采购单号均不会混入采购审批轨迹', async () => {
    insert(1, 'inbound');
    insert(2, 'inbound', { sourceId: 9, receiptId: null,
      payload: { transactionType: 'other_inbound', receiptNo: null } });
    insert(3, 'inbound', { receiptId: 10 });
    insert(4, 'purchase_receipt', { sourceId: 9, sourceNo: 'OTHER' });
    const receipt = await Posting.getApprovalBySource(request, connection);
    expect(receipt.postings.map(row => row.id)).toEqual([1]);
    const warehouse = await Posting.getApprovalBySource({ sourceType: 'inbound', sourceId: 9, sourceNo: 'RC-9' }, connection);
    expect(warehouse.postings.map(row => row.id)).toEqual([2]);
  });

  test('canonical新申请优先于历史类型较大的posting_sequence', async () => {
    insert(1, 'inbound', { sequence: 8 });
    insert(2, 'purchase_receipt', { sourceId: 9, sequence: 1, status: 'pending' });
    const result = await Posting.getApprovalBySource(request, connection);
    expect(result.current).toMatchObject({ id: 2, finance_status: 'pending' });
    expect(result.postings.map(row => row.id)).toEqual([2, 1]);
  });
});

describe('历史已审台账归档只读证明', () => {
  test('精确ledger关联与全部业务明细相符才展示，只读且采购反审核不可用', async () => {
    const posting = archive();
    expect(await Source.resolve(connection, posting)).toEqual({ receiptId: 9, receiptNo: 'RC-9', readOnly: true });
    const result = await Posting.getApprovalBySource(request, connection);
    expect(result.current).toMatchObject({ id: 1, finance_status: 'approved', source_read_only: true,
      capabilities: { reversalSupported: false }, source_context: { sourceId: 9, sourceNo: 'RC-9' } });
    await expect(Posting.requestReversal(1, actor, '历史反审核', connection))
      .rejects.toMatchObject({ code: 'REVERSAL_NOT_SUPPORTED' });
    const stage = jest.spyOn(Posting, 'stageMovement').mockResolvedValue({});
    expect(await Resubmission.resubmit(connection, request)).toBeNull();
    expect(stage).not.toHaveBeenCalled();
    expect(connection.execute.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
  });

  test.each([
    ['台账缺失', 'DELETE FROM inventory_ledger'],
    ['错误过账头关联', 'UPDATE inventory_ledger SET posting_document_id=22'],
    ['错误过账行关联', 'UPDATE inventory_ledger SET posting_line_id=22'],
    ['错误hash', "UPDATE inventory_posting_lines SET snapshot_hash='bad'"],
    ['错误key', "UPDATE inventory_posting_lines SET source_line_key='bad'"],
    ['错误金额', 'UPDATE inventory_ledger SET total_value=999'],
    ['未锁定', 'UPDATE inventory_posting_documents SET locked=0'],
    ['非归档', 'UPDATE inventory_posting_documents SET is_legacy=0'],
    ['待审核伪快照', "UPDATE inventory_posting_documents SET finance_status='pending'"],
    ['驳回伪快照', "UPDATE inventory_posting_documents SET finance_status='rejected'"],
    ['错误收货ID', 'UPDATE inventory_ledger SET receipt_id=10'],
    ['错误收货单号', "UPDATE inventory_ledger SET receipt_no='OTHER'"],
    ['冲销台账', 'UPDATE inventory_ledger SET reversal_of_ledger_id=55'],
    ['错误已过账数量', 'UPDATE inventory_posting_lines SET posted_quantity=5'],
  ])('%s不能借用历史归档形成审批证据', async (_label, sql) => {
    archive();
    database.exec(sql);
    const posting = database.prepare('SELECT * FROM inventory_posting_documents WHERE id=1').get();
    await expect(Source.resolve(connection, posting)).rejects.toMatchObject({ code: 'POSTING_SOURCE_CHANGED' });
    await expect(Posting.getApprovalBySource(request, connection))
      .rejects.toMatchObject({ statusCode: 409, code: 'POSTING_SOURCE_CHANGED' });
  });

  test('同一ledger不能被归档的两条过账行重复认领', async () => {
    const posting = archive();
    archive(2);
    database.exec(`UPDATE inventory_posting_lines SET posting_document_id=1,payload_json='{"legacyLedgerId":1001}' WHERE id=20`);
    await expect(Source.resolve(connection, posting)).rejects.toMatchObject({ code: 'POSTING_SOURCE_CHANGED' });
  });
});

describe('采购驳回只重新冻结原始明细', () => {
  test('缺receiptId的历史驳回可按全部明细证明重提，补canonical身份且保留冻结经济值', async () => {
    insert(1, 'batch_create', { missingReceiptId: true, payload: { sourceLineKey: 'legacy-line:batch:7' } });
    const stage = jest.spyOn(Posting, 'stageMovement').mockResolvedValue({ documentId: 2 });
    expect(await Resubmission.resubmit(connection, request)).toMatchObject({ documentId: 2, resubmittedFrom: 1 });
    expect(stage).toHaveBeenCalledWith(connection, expect.objectContaining({ sourceType: 'purchase_receipt', sourceId: 9 }),
      [expect.objectContaining({ receiptId: 9, receiptNo: 'RC-9', referenceType: 'purchase_receipt',
        signedQuantity: 6, unitCost: 20, totalValue: 120, batchNumber: 'BATCH-7', transactionDate: '2026-10-15',
        sourceLineKey: 'legacy-line:batch:7' })]);
    expect(connection.execute.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
  });

  test.each(['inbound', 'purchase_inbound', 'batch_create', 'purchase_receipt'])('%s驳回转canonical来源并保留原成本、批次、日期、行身份', async type => {
    insert(1, type, { sourceId: type === 'purchase_receipt' ? 9 : null });
    const stage = jest.spyOn(Posting, 'stageMovement').mockResolvedValue({ documentId: 2 });
    expect(await Resubmission.resubmit(connection, request)).toMatchObject({ documentId: 2, resubmittedFrom: 1, financeStatus: 'pending' });
    expect(stage).toHaveBeenCalledWith(connection, expect.objectContaining({
      sourceType: 'purchase_receipt', sourceId: 9, sourceNo: 'RC-9', transactionDate: '2026-10-15', businessApprovedById: 8,
    }), [expect.objectContaining({ referenceType: 'purchase_receipt', referenceNo: 'RC-9',
      signedQuantity: 6, unitCost: 20, totalValue: 120, batchNumber: 'BATCH-7', sourceLineKey: 'purchase_receipt:9:item:90' })]);
    expect(connection.execute.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
  });

  test.each(['pending', 'approved', 'reversed'])('较新的canonical状态%s阻止重复重提老驳回', async status => {
    insert(1, 'inbound', { sequence: 10 });
    insert(2, 'purchase_receipt', { sourceId: 9, status });
    const stage = jest.spyOn(Posting, 'stageMovement').mockResolvedValue({});
    expect(await Resubmission.resubmit(connection, request)).toBeNull();
    expect(stage).not.toHaveBeenCalled();
  });

  test('关闭期间或损坏快照不产生新过账', async () => {
    insert(1, 'inbound');
    const stage = jest.spyOn(Posting, 'stageMovement').mockResolvedValue({});
    Periods.validateInventoryTransaction.mockResolvedValueOnce({ allowed: false, message: '会计期间已关闭' });
    await expect(Resubmission.resubmit(connection, request)).rejects.toThrow('会计期间已关闭');
    database.exec("UPDATE inventory_posting_lines SET snapshot_hash='changed'");
    await expect(Resubmission.resubmit(connection, request)).rejects.toMatchObject({ code: 'SNAPSHOT_INVALID' });
    expect(stage).not.toHaveBeenCalled();
  });
});
