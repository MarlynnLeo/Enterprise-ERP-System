/* global beforeEach, expect, jest, test */
jest.mock('../../src/config/db', () => ({ pool: {}, getConnection: jest.fn() }));
jest.mock('../../src/models/finance', () => ({ reverseEntry: jest.fn(async () => 1) }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../src/services/business/TaskLifecycleService', () => ({
  promoteTaskStatus: jest.fn(),
  syncPlanStatus: jest.fn(),
}));
const posting = require('../../src/services/InventoryPostingService');
const groups = require('../../src/services/business/OutboundPostingGroupService');
const closure = require('../../src/services/business/InventoryPostingReversalClosureService');

const doc = (id, sourceType, sourceNo, status = 'approved') => ({
  id,
  source_type: sourceType,
  source_id: 9,
  source_no: sourceNo,
  posting_no: `INV-${id}`,
  posting_kind: 'movement',
  posting_sequence: 1,
  finance_status: status,
  locked: status === 'approved' ? 1 : 0,
  business_approved_by_id: 1,
  business_approved_by: 'warehouse',
  finance_approved_by: 2,
  finance_approved_label: 'finance',
});
const actor = { id: 3, label: 'requester' };
const reviewer = { id: 4, label: 'reviewer' };
const line = (id, documentId, quantity, referenceNo) => ({
  id,
  posting_document_id: documentId,
  ledger_id: id + 100,
  material_id: 7,
  location_id: 1,
  signed_quantity: quantity,
  reference_no: referenceNo,
  reference_type: documentId === 1 ? 'outbound' : 'outbound_supplement',
  transaction_type: 'outbound',
  unit_id: 1,
  batch_number: 'B1',
  unit_cost: 2,
  total_value: -quantity * 2,
});

function store({ initial = true, pending = true } = {}) {
  const state = {
    outbound: {
      id: 9,
      outbound_no: 'OUT-9',
      status: 'partial_completed',
      reference_type: null,
      reference_id: null,
    },
    documents: [
      ...(initial ? [doc(1, 'outbound', 'OUT-9')] : []),
      doc(2, 'outbound_supplement', 'OUT-9-Sa'),
      doc(3, 'outbound_supplement', 'OUT-9-Sb'),
      ...(pending ? [doc(4, 'outbound_supplement', 'OUT-9-Sc', 'pending')] : []),
    ],
    lines: [
      ...(initial ? [line(11, 1, -2, 'OUT-9')] : []),
      line(12, 2, -3, 'OUT-9-Sa'),
      line(13, 3, -3, 'OUT-9-Sb'),
    ],
    events: [],
    stock: initial ? 92 : 94,
  };
  const connection = {
    execute: jest.fn(async (query, params = []) => {
      const sql = query.replace(/\s+/g, ' ').trim();
      if (sql.startsWith('SELECT')) {
        if (
          sql.startsWith(
            'SELECT source_type, source_id, source_no FROM inventory_posting_documents'
          )
        ) {
          const document = state.documents.find(
            (document) => Number(document.id) === Number(params[0])
          );
          return [document ? [{ ...document }] : []];
        }
        if (sql.includes('FROM inventory_outbound')) return [[{ ...state.outbound }]];
        if (sql.includes('SELECT * FROM inventory_posting_documents WHERE id'))
          return [
            [state.documents.find((document) => Number(document.id) === Number(params[0]))].filter(
              Boolean
            ),
          ];
        if (sql.includes('original_posting_document_id = ?'))
          return [
            state.documents.filter(
              (document) =>
                document.original_posting_document_id === params[0] &&
                document.finance_status !== 'rejected'
            ),
          ];
        if (sql.includes('FROM inventory_posting_documents d')) {
          if (sql.includes("d.posting_kind = 'reversal'"))
            return [
              state.documents.filter(
                (document) =>
                  document.posting_kind === 'reversal' && document.finance_status === 'pending'
              ),
            ];
          return [state.documents.map((document) => ({ ...document }))];
        }
        if (sql.includes('JOIN inventory_ledger'))
          return [
            state.lines
              .filter((item) => params.includes(item.posting_document_id))
              .map((item) => ({ ...item })),
          ];
        if (sql.includes('FROM inventory_posting_lines WHERE posting_document_id'))
          return [
            state.lines
              .filter((item) => item.posting_document_id === Number(params[0]))
              .map((item) => ({ ...item })),
          ];
        if (sql.includes('FROM inventory_posting_events')) {
          if (sql.includes("event_type = 'reversal_requested'"))
            return [
              state.events.filter(
                (event) =>
                  event.posting_document_id === params[0] &&
                  event.event_type === 'reversal_requested'
              ),
            ];
          return [state.events];
        }
      }
      if (sql.startsWith('UPDATE inventory_posting_documents')) {
        let id, status;
        if (sql.includes("finance_status = 'reversed'")) {
          id = params[2];
          status = 'reversed';
        } else if (sql.includes("finance_status = 'rejected'")) {
          id = params[2];
          status = 'rejected';
        } else if (sql.includes('locked = 1, finance_approved_by')) {
          id = params[3];
          status = params[0];
        } else if (sql.includes('reversed_by')) {
          id = params[3];
          status = params[0];
        } else throw new Error(`Unhandled posting update: ${sql}`);
        Object.assign(
          state.documents.find((document) => Number(document.id) === Number(id)),
          { finance_status: status, locked: status === 'approved' ? 1 : undefined }
        );
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE inventory_outbound')) {
        state.outbound.status = 'reversed';
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE material_shortage_records')) return [{ affectedRows: 1 }];
      if (sql.startsWith('INSERT INTO inventory_posting_events')) {
        if (sql.includes("'reversal_requested'"))
          state.events.push({
            posting_document_id: params[0],
            event_type: 'reversal_requested',
            event_data: params[5],
          });
        else state.events.push({ posting_document_id: params[0], event_type: params[1] });
        return [{ insertId: state.events.length }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }),
  };
  let backup;
  connection.beginTransaction = jest.fn(async () => {
    backup = structuredClone(state);
  });
  connection.rollback = jest.fn(async () => {
    Object.assign(state, backup);
  });
  connection.commit = jest.fn(async () => {});
  connection.release = jest.fn();
  return { state, connection };
}

beforeEach(() => jest.restoreAllMocks());

function wireReversalStore(testStore) {
  const { state } = testStore;
  jest.spyOn(posting, '_getOrCreateDocument').mockImplementation(async (_conn, input) => {
    const document = {
      ...doc(10, input.sourceType, input.sourceNo, 'pending'),
      posting_kind: 'reversal',
      source_id: input.sourceId,
      original_posting_document_id: input.originalPostingDocumentId,
      business_approved_by_id: actor.id,
      business_approved_by: actor.label,
      transaction_date: '2026-09-30',
    };
    state.documents.push(document);
    return document;
  });
  jest.spyOn(posting, 'stageMovement').mockImplementation(async (_conn, _input, lines) => {
    state.lines.push(
      ...lines.map((item, index) => ({
        ...item,
        id: 20 + index,
        posting_document_id: 10,
        signed_quantity: item.signedQuantity,
      }))
    );
    return { documentId: 10 };
  });
  jest.spyOn(posting, '_postLines').mockImplementation(async (_conn, _document, lines) => {
    state.stock += lines.reduce((sum, item) => sum + Number(item.signed_quantity), 0);
    return lines;
  });
  jest
    .spyOn(closure, 'reverseOutboundGLEntries')
    .mockResolvedValue({ reversedCount: 1, errors: [] });
}

test('parent approval exposes each independent supplement and ignores superseded rejected snapshots', async () => {
  const { state, connection } = store();
  state.documents.push({
    ...doc(5, 'outbound_supplement', 'OUT-9-Sd', 'rejected'),
    posting_sequence: 1,
  });
  state.documents.push({
    ...doc(6, 'outbound_supplement', 'OUT-9-Sd', 'approved'),
    posting_sequence: 2,
  });
  expect(
    (
      await posting.getApprovalBySource(
        { sourceType: 'outbound', sourceId: 9, sourceNo: 'OUT-9' },
        connection
      )
    ).movement.id
  ).toBe(4);
  state.documents.find((document) => document.id === 4).finance_status = 'approved';
  expect(groups.selectCurrent(state.documents).id).toBe(1);
  expect(connection.execute.mock.calls[0][0]).toContain("'outbound_supplement'");
});

test.each([true, false])(
  'reverses all approved quantities and releases pending supplements atomically (initial posting=%s)',
  async (initial) => {
    const testStore = store({ initial });
    wireReversalStore(testStore);
    const { state, connection } = testStore;
    await groups.requestReversal(connection, {
      outbound: state.outbound,
      actor,
      remark: '整单撤销',
    });
    const requestEvent = JSON.parse(
      state.events.find((event) => event.event_type === 'reversal_requested').event_data
    );
    expect(requestEvent.sourceType).toBe('outbound');
    expect(requestEvent.sourceNo).toBe('OUT-9');
    expect(requestEvent.outboundPostingGroup.approvedIds).toEqual(initial ? [1, 2, 3] : [2, 3]);
    expect(state.stock).toBe(initial ? 92 : 94);
    expect(state.documents.find((document) => document.id === 4).finance_status).toBe('pending');

    await posting.approve(10, reviewer, connection);
    expect(state.stock).toBe(100);
    expect(state.outbound.status).toBe('reversed');
    expect(
      state.documents
        .filter((document) => document.posting_kind === 'movement')
        .map((document) => document.finance_status)
    ).toEqual(
      initial
        ? ['reversed', 'reversed', 'reversed', 'rejected']
        : ['reversed', 'reversed', 'rejected']
    );
    expect(closure.reverseOutboundGLEntries.mock.calls.map((call) => call[1])).toEqual(
      initial ? ['OUT-9', 'OUT-9-Sa', 'OUT-9-Sb'] : ['OUT-9-Sa', 'OUT-9-Sb']
    );
  }
);

test('public supplement reverse expands to its parent, never a single supplement', async () => {
  const testStore = store();
  wireReversalStore(testStore);
  await posting.reverse(2, actor, '撤销', testStore.connection);
  const event = JSON.parse(
    testStore.state.events.find((item) => item.event_type === 'reversal_requested').event_data
  );
  expect(event.outboundPostingGroup.approvedIds).toEqual([1, 2, 3]);
  expect(event.sourceId).toBe(9);
});

test.each(['stage', 'approve', 'resubmit'])(
  'blocks %s while a complete outbound reversal awaits approval',
  async (action) => {
    const { state, connection } = store();
    state.documents.push({
      ...doc(10, 'outbound', 'OUT-9-REV-1', 'pending'),
      posting_kind: 'reversal',
    });
    const request =
      action === 'stage'
        ? posting.stageMovement(
            connection,
            { sourceType: 'outbound_supplement', sourceId: 9, sourceNo: 'OUT-9-Snew' },
            [{ materialId: 7 }]
          )
        : action === 'approve'
          ? posting.approve(4, reviewer, connection)
          : groups.resubmit(connection, { outbound: state.outbound, actor });
    await expect(request).rejects.toThrow('正在反审核');
    expect(state.stock).toBe(92);
  }
);

test('rechecks all supplement reviewers and group membership before reversal posts any stock', async () => {
  const testStore = store();
  wireReversalStore(testStore);
  await groups.requestReversal(testStore.connection, { outbound: testStore.state.outbound, actor });
  testStore.state.documents.find((document) => document.id === 2).finance_approved_by = reviewer.id;
  await expect(posting.approve(10, reviewer, testStore.connection)).rejects.toThrow('必须分离');
  expect(posting._postLines).not.toHaveBeenCalled();
  testStore.state.documents.find((document) => document.id === 2).finance_approved_by = 2;
  testStore.state.documents.push(doc(5, 'outbound_supplement', 'OUT-9-Snew', 'pending'));
  await expect(posting.approve(10, reviewer, testStore.connection)).rejects.toThrow(
    '审批记录已变化'
  );
  expect(posting._postLines).not.toHaveBeenCalled();
});

test('resubmits only latest rejected parent and supplement snapshots without changing business quantities', async () => {
  const { state, connection } = store();
  state.documents[0].finance_status = 'rejected';
  state.documents[1].finance_status = 'rejected';
  const resubmit = jest
    .spyOn(require('../../src/services/business/InventoryPostingResubmissionService'), 'resubmit')
    .mockResolvedValue({ financeStatus: 'pending' });
  await groups.resubmit(connection, { outbound: state.outbound, actor });
  expect(resubmit.mock.calls.map((call) => [call[1].sourceType, call[1].sourceNo])).toEqual([
    ['outbound', 'OUT-9'],
    ['outbound_supplement', 'OUT-9-Sa'],
  ]);
  expect(state.stock).toBe(92);
  expect(state.outbound.status).toBe('partial_completed');
});

test('rolls back all inventory, pending releases and parent state if any supplement GL reversal fails', async () => {
  const testStore = store();
  wireReversalStore(testStore);
  await groups.requestReversal(testStore.connection, { outbound: testStore.state.outbound, actor });
  require('../../src/config/db').getConnection.mockResolvedValue(testStore.connection);
  closure.reverseOutboundGLEntries.mockImplementation(async (_conn, sourceNo) => {
    if (sourceNo === 'OUT-9-Sb') throw new Error('补发凭证尚未生成');
    return { reversedCount: 1 };
  });
  await expect(posting.approve(10, reviewer)).rejects.toThrow('补发凭证尚未生成');
  expect(testStore.connection.rollback).toHaveBeenCalledTimes(1);
  expect(testStore.connection.commit).not.toHaveBeenCalled();
  expect(testStore.state.stock).toBe(92);
  expect(testStore.state.outbound.status).toBe('partial_completed');
  expect(testStore.state.documents.map((document) => document.finance_status)).toEqual([
    'approved',
    'approved',
    'approved',
    'pending',
    'pending',
  ]);
});

test('reverses exact parent and per-line supplement cost vouchers without matching nearby source numbers', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const database = new DatabaseSync(':memory:');
  database.function('CONCAT', { varargs: true }, (...values) => values.join(''));
  database.function('LEFT', (value, length) => String(value).slice(0, Number(length)));
  database.exec(`
    CREATE TABLE inventory_posting_documents (id INTEGER, source_no TEXT, posting_kind TEXT);
    CREATE TABLE inventory_posting_lines (id INTEGER, posting_document_id INTEGER, material_id INTEGER);
    CREATE TABLE gl_entries (id INTEGER, document_number TEXT, is_posted INTEGER, is_reversed INTEGER, reversal_entry_id INTEGER);
    INSERT INTO inventory_posting_documents VALUES (1, 'OUT-9', 'movement'), (2, 'OUT-9-Sa', 'movement');
    INSERT INTO inventory_posting_lines VALUES (11, 1, 7), (12, 2, 7);
    INSERT INTO gl_entries VALUES (1, 'OUT-9', 1, 0, NULL), (2, 'OUT-9-M7-L11', 1, 0, NULL),
      (3, 'OUT-9-Sa-M7-L12', 1, 0, NULL), (4, 'OUT-9-Sa-OTHER', 1, 0, NULL), (5, 'OUT-90', 1, 0, NULL);
  `);
  const connection = {
    execute: async (sql, params) => [
      database.prepare(sql.replace(/FOR UPDATE/g, '').replace(/LEFT\(/g, '"LEFT"(')).all(...params),
    ],
  };
  const finance = require('../../src/models/finance');
  finance.reverseEntry.mockClear();
  try {
    expect(await closure.reverseOutboundGLEntries(connection, 'OUT-9', 'auditor')).toMatchObject({
      reversedCount: 2,
    });
    expect(await closure.reverseOutboundGLEntries(connection, 'OUT-9-Sa', 'auditor')).toMatchObject(
      { reversedCount: 1 }
    );
    expect(finance.reverseEntry.mock.calls.map((call) => call[0])).toEqual([1, 2, 3]);
  } finally {
    database.close();
  }
});

test.each(['approve', 'reject', 'reverse'])(
  '%s waits for the outbound parent before locking a posting, allowing a concurrent parent transaction to finish',
  async (action) => {
    const { connection } = store();
    const execute = connection.execute.getMockImplementation();
    let releaseParent;
    const parentAvailable = new Promise((resolve) => {
      releaseParent = resolve;
    });
    let parentRequested;
    const parentWasRequested = new Promise((resolve) => {
      parentRequested = resolve;
    });
    const locks = [];
    connection.execute.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM inventory_outbound')) {
        parentRequested();
        await parentAvailable;
        locks.push('parent');
      }
      if (sql.includes('SELECT * FROM inventory_posting_documents WHERE id = ? FOR UPDATE')) {
        locks.push('posting');
        throw new Error('stop after document lock');
      }
      return execute(sql, params);
    });
    const id = action === 'reverse' ? 2 : 4;
    const running =
      action === 'approve'
        ? posting.approve(id, reviewer, connection)
        : posting[action](id, reviewer, 'test', connection);
    const completion = expect(running).rejects.toThrow('stop after document lock');
    await parentWasRequested;
    expect(locks).toEqual([]);
    expect(
      connection.execute.mock.calls.some(
        ([sql]) => sql.includes('FROM inventory_posting_documents') && sql.includes('FOR UPDATE')
      )
    ).toBe(false);
    releaseParent();
    await completion;
    expect(locks).toEqual(['parent', 'posting']);
  }
);

test.each(['source_type', 'source_id', 'source_no'])(
  'aborts when immutable %s changes between metadata read and posting lock',
  async (field) => {
    const source = { source_type: 'outbound_supplement', source_id: 9, source_no: 'OUT-9-Sa' };
    const connection = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[source]])
        .mockResolvedValueOnce([[{ id: 9, outbound_no: 'OUT-9' }]])
        .mockResolvedValueOnce([
          [
            {
              ...doc(2, 'outbound_supplement', 'OUT-9-Sa', 'pending'),
              [field]: field === 'source_id' ? 10 : 'changed',
            },
          ],
        ]),
    };
    await expect(posting.approve(2, reviewer, connection)).rejects.toMatchObject({
      code: 'POSTING_SOURCE_CHANGED',
      statusCode: 409,
    });
    expect(connection.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
  }
);

test('does not acquire an outbound lock for an unrelated inbound posting', async () => {
  const source = { source_type: 'inbound', source_id: 9, source_no: 'IN-9' };
  const connection = {
    execute: jest
      .fn()
      .mockResolvedValueOnce([[source]])
      .mockResolvedValueOnce([[{ ...source, finance_status: 'approved' }]]),
  };
  await expect(posting.approve(1, reviewer, connection)).rejects.toMatchObject({
    code: 'INVALID_STATUS',
  });
  expect(connection.execute).toHaveBeenCalledTimes(2);
  expect(connection.execute.mock.calls.some(([sql]) => sql.includes('inventory_outbound'))).toBe(
    false
  );
});
