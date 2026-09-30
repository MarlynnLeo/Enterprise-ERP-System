/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/utils/codeGenerator', () => ({ CodeGenerators: {} }));
jest.mock('../../src/services/InventoryService', () => ({
  getBatchMaterialInfo: jest.fn(),
  getBatchStock: jest.fn(),
  getCurrentStock: jest.fn(),
  updateStock: jest.fn(),
}));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  denyUnlessAccess: jest.fn(),
  assertAccess: jest.fn(),
}));
jest.mock('../../src/controllers/business/inventory/inventoryConsistencyController', () => ({
  checkAndUpdateTaskStatus: jest.fn(),
  _syncProductionStatus: jest.fn(),
}));
jest.mock('../../src/controllers/business/inventory/outbound/outboundHelpers', () => ({
  ...jest.requireActual('../../src/controllers/business/inventory/outbound/outboundHelpers'),
  assertOutboundSourceAccess: jest.fn(),
  getMaterialInfoMap: jest.fn(),
}));
jest.mock('../../src/services/business/AsyncTaskService', () => ({
  createTraceabilityAsync: jest.fn(),
}));
jest.mock('../../src/services/business/DocumentChainService', () => ({
  afterInventoryOutboundCompleted: jest.fn(),
}));
jest.mock('../../src/services/business/ProductionProcessService', () => ({
  createProductionProcessIfNeeded: jest.fn(),
}));
jest.mock('../../src/services/business/TaskLifecycleService', () => ({
  promoteTaskStatus: jest.fn(),
}));

const db = require('../../src/config/db');
const InventoryService = require('../../src/services/InventoryService');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const {
  assertOutboundSourceAccess,
  getMaterialInfoMap,
} = require('../../src/controllers/business/inventory/outbound/outboundHelpers');
const {
  updateOutbound,
} = require('../../src/controllers/business/inventory/outbound/outboundCrudController');
const {
  updateOutboundStatus,
} = require('../../src/controllers/business/inventory/outbound/outboundStatusController');
const {
  supplementOutbound,
} = require('../../src/controllers/business/inventory/outbound/outboundBomController');

const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const request = (body) => ({ params: { id: '9' }, body, user: { id: 3, username: 'tester' } });

// Isolated transactional store: no connection to MySQL or real inventory. The
// transaction mutex models the parent-row FOR UPDATE lock used by both APIs.
function transactionStore(status = 'confirmed') {
  let state = {
    outbound: {
      id: 9,
      outbound_no: 'OUT-9',
      outbound_date: '2026-09-30',
      status,
      operator: 'tester',
      remark: 'original',
      reference_type: null,
      reference_id: null,
      production_task_id: null,
      outbound_type: 'manual',
    },
    items: [
      {
        id: 21,
        outbound_id: 9,
        material_id: 7,
        quantity: 10,
        planned_quantity: 10,
        actual_quantity: 0,
        shortage_quantity: 10,
        is_shortage: 1,
        unit_id: 1,
      },
    ],
    available: 30,
    movements: [],
  };
  let lock = Promise.resolve();
  const connections = [];
  const open = () => {
    let backup;
    let releaseLock;
    const connection = {
      beginTransaction: jest.fn(async () => {
        const prior = lock;
        lock = new Promise((resolve) => {
          releaseLock = resolve;
        });
        await prior;
        backup = structuredClone(state);
      }),
      commit: jest.fn(async () => {
        backup = null;
        releaseLock?.();
      }),
      rollback: jest.fn(async () => {
        if (backup) state = backup;
        backup = null;
        releaseLock?.();
      }),
      release: jest.fn(),
      execute: jest.fn(async (query, params = []) => {
        const sql = query.replace(/\s+/g, ' ').trim();
        if (sql.startsWith('SELECT')) {
          if (sql.includes('FROM production_tasks'))
            return [[{ status: 'material_partial_issued' }]];
          if (sql.includes('shortage_count'))
            return [
              [{ shortage_count: state.items.filter((item) => item.shortage_quantity > 0).length }],
            ];
          if (sql.includes('COUNT(*)')) return [[{ count: state.items.length }]];
          if (sql.includes('SUM(oi.actual_quantity')) return [[{ total: 0 }]];
          if (sql.includes('FROM inventory_outbound_items')) return [structuredClone(state.items)];
          if (sql.includes('FROM inventory_outbound')) return [[structuredClone(state.outbound)]];
          throw new Error(`Unexpected SELECT: ${sql}`);
        }
        if (sql.startsWith('DELETE FROM inventory_outbound_items')) {
          state.items = [];
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('INSERT INTO inventory_outbound_items')) {
          const columns = sql
            .match(/\(([^)]+)\)/)[1]
            .split(',')
            .map((column) => column.trim());
          const item = Object.fromEntries(columns.map((column, index) => [column, params[index]]));
          state.items.push({ id: 30 + state.items.length, ...item });
          return [{ insertId: state.items.at(-1).id }];
        }
        if (sql.startsWith('UPDATE inventory_outbound_items')) {
          if (!sql.includes('COALESCE(actual_quantity, 0) +'))
            throw new Error(`Unexpected item update: ${sql}`);
          const [quantity, , , itemId, , materialId, minimum] = params;
          const item = state.items.find(
            (row) => row.id === itemId && row.material_id === materialId
          );
          if (!item || item.shortage_quantity < minimum) return [{ affectedRows: 0 }];
          item.actual_quantity += quantity;
          item.shortage_quantity -= quantity;
          item.is_shortage = item.shortage_quantity > 0 ? 1 : 0;
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('UPDATE inventory_outbound SET outbound_date')) {
          const [
            date,
            nextStatus,
            operator,
            remark,
            taskId,
            referenceId,
            referenceType,
            outboundType,
          ] = params;
          Object.assign(state.outbound, {
            outbound_date: date,
            status: nextStatus,
            operator,
            remark,
            production_task_id: taskId,
            reference_id: referenceId,
            reference_type: referenceType,
            outbound_type: outboundType,
          });
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('UPDATE inventory_outbound SET status = ?')) {
          state.outbound.status = params[0];
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('UPDATE inventory_outbound SET remark')) return [{ affectedRows: 1 }];
        throw new Error(`Unexpected query: ${sql}`);
      }),
    };
    connections.push(connection);
    return connection;
  };
  db.pool.getConnection.mockImplementation(async () => open());
  InventoryService.getCurrentStock.mockImplementation(async () => state.available);
  InventoryService.getBatchStock.mockImplementation(async () => [
    { material_id: 7, location_id: 5, quantity: state.available },
  ]);
  InventoryService.updateStock.mockImplementation(async (movement) => {
    // Reserve the business movement as InventoryService does before finance
    // approval; this intentionally does not model a formal ledger write.
    state.available += movement.quantity;
    state.movements.push(movement);
    return { success: true, staged: true, afterQuantity: state.available };
  });
  return {
    get state() {
      return state;
    },
    connections,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  ScopeGuard.denyUnlessAccess.mockResolvedValue(true);
  ScopeGuard.assertAccess.mockResolvedValue(true);
  assertOutboundSourceAccess.mockResolvedValue(true);
  const materials = new Map([[7, { locationId: 5, unitId: 1, code: 'M7', name: 'Material 7' }]]);
  getMaterialInfoMap.mockResolvedValue(materials);
  InventoryService.getBatchMaterialInfo.mockResolvedValue(materials);
});

const editBody = (extra = {}) => ({
  outboundDate: '2026-09-30',
  status: 'confirmed',
  operator: 'tester',
  items: [{ materialId: 7, quantity: 6 }],
  ...extra,
});
const supplementBody = (quantity = 5) => ({
  remarks: '补发原因',
  items: [{ materialId: 7, outboundItemId: 21, quantity }],
});

describe('outbound edit → complete regression', () => {
  test.each(['draft', 'confirmed'])(
    'editing a %s then completing stages the actual stock movement',
    async (status) => {
      const store = transactionStore(status);
      const res = response();
      await updateOutbound(request(editBody({ status, remarks: 'new remark' })), res);
      expect(res.json.mock.calls.at(-1)[0].success).toBe(true);
      expect(store.state.items[0]).toMatchObject({
        planned_quantity: 6,
        actual_quantity: 6,
        shortage_quantity: 0,
        is_shortage: 0,
      });
      expect(InventoryService.updateStock).not.toHaveBeenCalled();
      if (status === 'draft')
        await updateOutboundStatus(request({ newStatus: 'confirmed' }), response());
      const complete = response();
      await updateOutboundStatus(request({ newStatus: 'completed' }), complete);
      expect(complete.json.mock.calls.at(-1)[0].success).toBe(true);
      expect(store.state.outbound).toMatchObject({ status: 'completed', remark: 'new remark' });
      expect(store.state.movements).toEqual([
        expect.objectContaining({ materialId: 7, quantity: -6, referenceNo: 'OUT-9' }),
      ]);
      expect(store.state.available).toBe(24);
    }
  );

  test.each([
    [6, undefined, 6, 4],
    [10, 0, 0, 10],
  ])(
    'keeps planned quantity and calculates remainder for quantity %s / actual %s',
    async (quantity, actualQuantity, expectedActual, shortage) => {
      const store = transactionStore();
      const res = response();
      await updateOutbound(
        request(
          editBody({
            items: [
              { materialId: 7, quantity, plannedQuantity: 10, actualQuantity, shortageQuantity: 0 },
            ],
          })
        ),
        res
      );
      expect(res.json.mock.calls.at(-1)[0].success).toBe(true);
      expect(store.state.items[0]).toMatchObject({
        planned_quantity: 10,
        actual_quantity: expectedActual,
        shortage_quantity: shortage,
        is_shortage: 1,
      });
    }
  );

  test('saves a new task, its source fields and remarks; explicit null clears the task', async () => {
    const store = transactionStore('draft');
    Object.assign(store.state.outbound, {
      production_task_id: 40,
      reference_id: 40,
      reference_type: 'production_task',
      outbound_type: 'bom_issue',
    });
    await updateOutbound(
      request(editBody({ status: 'draft', productionTaskId: 41, remarks: 'changed task' })),
      response()
    );
    expect(store.state.outbound).toMatchObject({
      production_task_id: 41,
      reference_id: 41,
      reference_type: 'production_task',
      remark: 'changed task',
    });
    expect(assertOutboundSourceAccess).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ reference_id: 41 })
    );
    await updateOutbound(
      request(editBody({ status: 'draft', productionTaskId: null, remarks: '' })),
      response()
    );
    expect(store.state.outbound).toMatchObject({
      production_task_id: null,
      reference_id: null,
      reference_type: null,
      outbound_type: 'manual',
      remark: '',
    });
  });

  test('omitted task and remarks retain existing values', async () => {
    const store = transactionStore('draft');
    Object.assign(store.state.outbound, {
      production_task_id: 40,
      reference_id: 40,
      reference_type: 'production_task',
    });
    await updateOutbound(request(editBody({ status: 'draft' })), response());
    expect(store.state.outbound).toMatchObject({
      production_task_id: 40,
      reference_id: 40,
      reference_type: 'production_task',
      remark: 'original',
    });
  });

  test('unauthorized replacement task is rejected before writes', async () => {
    const store = transactionStore();
    const before = structuredClone(store.state);
    assertOutboundSourceAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const res = response();
    await updateOutbound(request(editBody({ productionTaskId: 999 })), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(store.state).toEqual(before);
    expect(store.connections[0].commit).not.toHaveBeenCalled();
  });

  test('a null task in the shared editor retains another business source', async () => {
    const store = transactionStore();
    Object.assign(store.state.outbound, {
      reference_type: 'sales_order',
      reference_id: 22,
      outbound_type: 'sales',
    });
    await updateOutbound(request(editBody({ productionTaskId: null })), response());
    expect(store.state.outbound).toMatchObject({
      reference_type: 'sales_order',
      reference_id: 22,
      outbound_type: 'sales',
    });
  });

  test.each([[[]], [[{ materialId: 7, quantity: -1 }]]])(
    'invalid edits roll back header and details',
    async (items) => {
      const store = transactionStore();
      const before = structuredClone(store.state);
      const res = response();
      await updateOutbound(request(editBody({ items, remarks: 'must roll back' })), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(store.state).toEqual(before);
      expect(store.connections[0].commit).not.toHaveBeenCalled();
    }
  );
});

describe('atomic cumulative outbound supplements', () => {
  test.each(['production_task', 'production_plan', 'batch_production_tasks', null])(
    'production supplement %s uses the same costing transaction type as the initial issue',
    async (referenceType) => {
      const store = transactionStore('partial_completed');
      Object.assign(store.state.outbound, {
        reference_type: referenceType,
        reference_id: referenceType ? 40 : null,
        production_task_id: referenceType ? null : 40,
      });
      const res = response();
      await supplementOutbound(request(supplementBody()), res);
      expect(res.json.mock.calls.at(-1)[0].success).toBe(true);
      expect(store.state.movements[0]).toMatchObject({
        transactionType: 'production_outbound',
        referenceType: 'outbound_supplement',
        quantity: -5,
      });
    }
  );

  test('two equal camelCase supplements create distinct movements and frozen-line identities', async () => {
    const store = transactionStore('partial_completed');
    const first = response();
    const second = response();
    await supplementOutbound(request(supplementBody()), first);
    await supplementOutbound(request(supplementBody()), second);
    expect(first.json.mock.calls.at(-1)[0].success).toBe(true);
    expect(second.json.mock.calls.at(-1)[0].success).toBe(true);
    expect(store.state.items[0]).toMatchObject({
      actual_quantity: 10,
      shortage_quantity: 0,
      is_shortage: 0,
    });
    expect(store.state.available).toBe(20);
    expect(store.state.outbound.status).toBe('completed');
    expect(store.state.movements).toHaveLength(2);
    for (const key of ['idempotencyKey', 'sourceLineKey', 'referenceNo']) {
      expect(new Set(store.state.movements.map((movement) => movement[key])).size).toBe(2);
    }
    expect(store.state.movements[0]).toMatchObject({ remark: '补发: 补发原因', sourceId: 9 });
    for (const connection of store.connections) {
      expect(connection.execute.mock.calls[0][0]).toContain('FOR UPDATE');
      expect(connection.execute.mock.calls[1][0]).toContain('FOR UPDATE');
      expect(connection.commit).toHaveBeenCalledTimes(1);
    }
  });

  test('legacy snake_case supplement input remains accepted', async () => {
    const store = transactionStore('partial_completed');
    const res = response();
    await supplementOutbound(
      request({ items: [{ material_id: 7, outbound_item_id: 21, quantity: 5 }] }),
      res
    );
    expect(res.json.mock.calls.at(-1)[0].success).toBe(true);
    expect(store.state.items[0].actual_quantity).toBe(5);
  });

  test('concurrent supplements re-read the locked shortage and cannot over-issue', async () => {
    const store = transactionStore('partial_completed');
    store.state.items[0].shortage_quantity = 8;
    const results = [response(), response()];
    await Promise.all(results.map((res) => supplementOutbound(request(supplementBody()), res)));
    expect(results.map((res) => res.json.mock.calls.at(-1)[0].success).sort()).toEqual([
      false,
      true,
    ]);
    expect(store.state.items[0]).toMatchObject({ actual_quantity: 5, shortage_quantity: 3 });
    expect(store.state.movements).toHaveLength(1);
    expect(store.state.available).toBe(25);
  });

  test.each(['failure', 'idempotent'])(
    'stock %s does not commit advanced detail quantities',
    async (result) => {
      const store = transactionStore('partial_completed');
      const before = structuredClone(store.state);
      if (result === 'failure')
        InventoryService.updateStock.mockRejectedValueOnce(new Error('stock failed'));
      else InventoryService.updateStock.mockResolvedValueOnce({ idempotent: true });
      const res = response();
      await supplementOutbound(request(supplementBody()), res);
      expect(res.status).toHaveBeenCalledWith(result === 'failure' ? 500 : 409);
      expect(store.state).toEqual(before);
      expect(store.connections[0].commit).not.toHaveBeenCalled();
    }
  );

  test('stock check aggregates multiple lines for the same material', async () => {
    const store = transactionStore('partial_completed');
    store.state.available = 8;
    store.state.items.push({ ...store.state.items[0], id: 22 });
    const body = supplementBody();
    body.items.push({ materialId: 7, outboundItemId: 22, quantity: 5 });
    const res = response();
    await supplementOutbound(request(body), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(InventoryService.updateStock).not.toHaveBeenCalled();
    expect(store.state.items.map((item) => item.actual_quantity)).toEqual([0, 0]);
  });

  test('a duplicate detail id is rejected across camel and snake aliases', async () => {
    const store = transactionStore('partial_completed');
    const body = supplementBody();
    body.items.push({ material_id: 7, outbound_item_id: 21, quantity: 5 });
    const res = response();
    await supplementOutbound(request(body), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(store.state.movements).toHaveLength(0);
  });
});
