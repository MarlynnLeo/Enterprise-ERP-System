/* global describe, test, expect */
// Deny-by-default module loader: these regressions never import database or Redis configuration.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const logger = { info() {}, error() {}, warn() {}, debug() {} };
const ResponseHandler = {
  success(res, data, message, status = 200) { Object.assign(res, { status, data, message }); },
  error(res, message, code, status = 500, error) { Object.assign(res, { status, message, code, detail: error?.message }); },
  forbidden(res, message) { Object.assign(res, { status: 403, message }); },
};
function load(file, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    module, exports: module.exports,
    require(id) {
      if (!Object.hasOwn(dependencies, id)) throw new Error(`Unmocked dependency: ${id}`);
      return dependencies[id];
    },
  }, { filename: file });
  return module.exports;
}
const fieldMap = {
  mapKeysToSnake: (v) => v, formatDate: (v) => v,
  toNumber: (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback,
};
const inventoryMaps = load('src/utils/inventory/inventoryFieldMap.js', { '../fieldMap': fieldMap });
const { INVENTORY_CHECK_TRANSITIONS } = load('src/constants/statusRegistry.js', {
  './purchaseConstants': load('src/constants/purchaseConstants.js', {}),
  './systemConstants': load('src/constants/systemConstants.js', {}),
});

function inventoryFixture({ actual = 8, status = 'in_progress', extraItems = [], pendingMaterialId = null } = {}) {
  let state = {
    check: { id: 9, check_no: 'TEST-9', status, location_id: 1, check_date: '2026-10-01' },
    items: [{ id: 90, material_id: 3, system_quantity: 10, actual_quantity: actual, remark: 'counted', unit_id: 1 }, ...extraItems],
  };
  let snapshot;
  const events = [];
  const ledger = [];
  const connection = {
    async beginTransaction() { snapshot = structuredClone(state); },
    async commit() { events.push('commit'); },
    async rollback() { state = structuredClone(snapshot); events.push('rollback'); },
    release() {},
    async execute(sql, args) {
      sql = sql.replace(/\s+/g, ' ').trim();
      if (/^SELECT.+FROM inventory_checks/s.test(sql)) return [[state.check]];
      if (/^SELECT.+FROM inventory_check_items/s.test(sql)) return [state.items];
      if (/^SELECT.+FROM inventory_ledger/s.test(sql)) return [[{ quantity: 10 }]];
      if (/^SELECT.+FROM inventory_posting_lines/s.test(sql)) {
        expect(sql).toContain('FOR UPDATE');
        expect(events).toContain(`lock:${args[0]}:${args[1]}`);
        return [args[0] === pendingMaterialId ? [{ id: 1 }] : []];
      }
      if (/UPDATE inventory_check_items/.test(sql)) {
        const target = state.items.find((row) => row.id === args[3]);
        Object.assign(target, { actual_quantity: args[0], difference: args[1], remark: args[2] });
        events.push('item-write');
        return [{ affectedRows: 1 }];
      }
      if (/UPDATE inventory_checks SET status/.test(sql)) state.check.status = args[0];
      else if (/UPDATE inventory_checks SET check_date/.test(sql)) {
        if (args[0]) state.check.check_date = args[0];
        state.check.remark = args[1];
      } else if (!/UPDATE inventory_checks SET/.test(sql)) throw new Error(`Unhandled inventory SQL: ${sql}`);
      return [{ affectedRows: 1 }];
    },
  };
  const controller = load('src/controllers/business/inventory/inventoryCheckController.js', {
    '../../../config/businessConfig': {}, '../../../utils/responseHandler': { ResponseHandler },
    '../../../utils/fieldMap': fieldMap, '../../../utils/logger': { logger },
    '../../../constants/statusRegistry': { INVENTORY_CHECK_TRANSITIONS }, '../../../utils/safePagination': {},
    '../../../config/db': { pool: { getConnection: async () => connection } },
    '../../../services/InventoryService': { _lockStockLocation: async (materialId, locationId) => events.push(`lock:${materialId}:${locationId}`) },
    '../../../utils/softDelete': {}, '../../../utils/codeGenerator': {},
    '../../../utils/userHelper': { getCurrentUserName: async () => 'Counter' },
    '../../../utils/authContext': { getAuthenticatedUserId: (req) => req.user.id },
    './inventoryLedgerController': { _insertInventoryLedgerLocal: async (_conn, movement) => ledger.push(movement) },
    '../../../utils/inventory/inventoryFieldMap': inventoryMaps,
    '../../../authorization/ScopeGuard': { assertAccess: async () => true },
  });
  async function call(action, body) {
    const response = {};
    await controller[action]({ params: { id: 9 }, user: { id: 7 }, body }, response);
    return response;
  }
  return { call, events, ledger, get state() { return state; } };
}

describe('SC-01 inventory counts', () => {
  test('pending financial movement blocks count adjustment without writing a second movement', async () => {
    const fixture = inventoryFixture({ actual: 12, status: 'pending', pendingMaterialId: 3 });
    expect(await fixture.call('adjustInventory', {})).toMatchObject({ status: 409, code: 'PENDING_INVENTORY_APPROVAL' });
    expect(fixture.state.check.status).toBe('pending');
    expect(fixture.ledger).toEqual([]);
    expect(fixture.events).not.toContain('commit');
  });

  test('locks all scopes in order and checks pending approvals before staging any adjustment', async () => {
    const fixture = inventoryFixture({ status: 'pending', pendingMaterialId: 5, extraItems: [
      { id: 92, material_id: 5, actual_quantity: 12 },
      { id: 91, material_id: 1, actual_quantity: 8 },
    ] });
    expect(await fixture.call('adjustInventory', {})).toMatchObject({ status: 409 });
    expect(fixture.events.filter(event => event.startsWith('lock:'))).toEqual(['lock:1:1', 'lock:3:1', 'lock:5:1']);
    expect(fixture.ledger).toEqual([]);
  });

  test('camelCase completion preserves 8, ignores client book quantity and requests adjustment -2', async () => {
    const fixture = inventoryFixture();
    const submitted = await fixture.call('submitCheckResult', {
      items: [{ id: 90, actualQuantity: 8, bookQuantity: 0, remarks: 'verified' }],
    });
    expect(submitted.status).toBe(200);
    expect(fixture.state.items[0]).toMatchObject({ actual_quantity: 8, difference: -2, remark: 'verified' });
    expect(await fixture.call('adjustInventory', {})).toMatchObject({ status: 200 });
    expect(fixture.ledger[0].quantity).toBe(-2);
  });

  test.each([undefined, null, '', ' ', 'eight', '8x', -1, Infinity, false, [], {}])(
    'rejects invalid actual %j without changing quantity or state', async (actualQuantity) => {
      const fixture = inventoryFixture();
      const result = await fixture.call('submitCheckResult', { items: [{ id: 90, actualQuantity }] });
      expect(result.status).toBe(400);
      expect(fixture.state.items[0].actual_quantity).toBe(8);
      expect(fixture.state.check.status).toBe('in_progress');
      expect(fixture.events).not.toContain('item-write');
      expect(fixture.events).not.toContain('commit');
    }
  );

  test('zero is valid and legacy snake input uses stored book quantity', async () => {
    const fixture = inventoryFixture();
    expect((await fixture.call('submitCheckResult', {
      items: [{ id: 90, actual_quantity: 0, system_quantity: 0 }],
    })).status).toBe(200);
    expect(fixture.state.items[0]).toMatchObject({ actual_quantity: 0, difference: -10 });
  });

  test.each([
    [[]], [[{ id: 999, actualQuantity: 1 }]], [[{ id: 90, actualQuantity: 8 }, { id: 90, actualQuantity: 9 }]],
  ])('rejects missing, foreign and duplicate result rows %j', async (items) => {
    const fixture = inventoryFixture();
    expect((await fixture.call('submitCheckResult', { items })).status).toBe(400);
    expect(fixture.events).not.toContain('commit');
  });

  test('stored incomplete results cannot use generic status or no-payload submission', async () => {
    const fixture = inventoryFixture({ actual: null });
    expect((await fixture.call('updateCheckStatus', { status: 'pending' })).status).toBe(400);
    expect((await fixture.call('submitCheckResult', {})).status).toBe(400);
  });

  test('generic completion rejects offsetting differences but accepts complete equal quantities', async () => {
    const fixture = inventoryFixture({ status: 'pending', extraItems: [
      { id: 91, system_quantity: 10, actual_quantity: 12 },
    ] });
    expect((await fixture.call('updateCheckStatus', { status: 'completed' })).status).toBe(400);
    const equal = inventoryFixture({ actual: 10, status: 'pending' });
    expect((await equal.call('updateCheckStatus', { status: 'completed' })).status).toBe(200);
  });

  test('draft save validates raw values before the field mapper and preserves database book quantity', async () => {
    const fixture = inventoryFixture({ status: 'draft' });
    expect((await fixture.call('updateCheck', { items: [{ id: 90, actualQuantity: 'bad' }] })).status).toBe(400);
    expect(fixture.state.items[0].actual_quantity).toBe(8);
    expect((await fixture.call('updateCheck', { items: [{ id: 90, actualQuantity: 7, bookQuantity: 0 }] })).status).toBe(200);
    expect(fixture.state.items[0].difference).toBe(-3);
  });

  test('in-progress entry changes only counts and remarks, and rejects a concurrently reviewed record', async () => {
    const fixture = inventoryFixture();
    const body = { checkDate: '2026-10-15', remarks: 'counted today', items: [{ id: 90, actualQuantity: 9 }] };
    expect((await fixture.call('updateCheck', body)).status).toBe(200);
    expect(fixture.state.check).toMatchObject({ status: 'in_progress', check_date: '2026-10-01', remark: 'counted today' });
    expect(fixture.state.items[0].actual_quantity).toBe(9);
    fixture.state.check.status = 'pending';
    expect((await fixture.call('updateCheck', { ...body, items: [{ id: 90, actualQuantity: 0 }] })).status).toBe(400);
    expect(fixture.state.items[0].actual_quantity).toBe(9);
  });
});

const change = (field = 'quantity', value = '5', extras = {}) => ({
  id: 1, change_type: 'bom_modify', bom_id: 10, material_id: 1,
  field_name: field, old_value: '', new_value: value, ...extras,
});

function ecnFixture(items = [change()], options = {}) {
  let state = {
    order: { id: 1, code: 'ECN-TEST', title: 'test change', reason: 'verification', status: 'approved' },
    boms: [
      { id: 10, product_id: 100, version: 'V1.0', approved_by: 1 },
      { id: 20, product_id: 200, version: 'V1.0', approved_by: 1 },
      { id: 30, product_id: 300, version: 'V1.0', approved_by: 1 },
      { id: 99, product_id: 999, version: 'V1.0', approved_by: 1 },
    ],
    details: [
      { id: 101, bom_id: 10, material_id: 1, quantity: 2, unit_id: 1, parent_id: 0, level: 1, material_code: 'RAW' },
      { id: 201, bom_id: 20, material_id: 100, quantity: 3, unit_id: 1, parent_id: 0, level: 1, has_sub_bom: 1, ref_bom_id: 10, material_code: 'CHILD' },
      { id: 301, bom_id: 30, material_id: 200, quantity: 4, unit_id: 1, parent_id: 0, level: 1, has_sub_bom: 1, ref_bom_id: 20, material_code: 'PARENT' },
      { id: 901, bom_id: 99, material_id: 9, quantity: 6, unit_id: 1, parent_id: 0, level: 1, material_code: 'OTHER' },
    ],
    cache: [],
  };
  let snapshot;
  let inTransaction = false;
  const events = [];
  const conn = {
    async beginTransaction() { snapshot = structuredClone(state); inTransaction = true; },
    async commit() { events.push('commit'); inTransaction = false; },
    async rollback() { state = structuredClone(snapshot); events.push('rollback'); inTransaction = false; },
    release() {},
    async query(sql, args = []) {
      if (/^SELECT.+FROM ecn_orders/s.test(sql)) return [[state.order]];
      if (/^SELECT.+FROM ecn_order_items/s.test(sql)) return [items];
      if (/^SELECT.+FROM materials/s.test(sql)) return [[{ id: args[0], code: 'RAW', unit_id: 1 }]];
      if (/^SELECT.+FROM units/s.test(sql)) return [args[0] === 1 || args[0] === 2 ? [{ id: args[0] }] : []];
      if (/^SELECT.+FROM production_plans/s.test(sql)) return [[{ count: options.planned ? 1 : 0 }]];
      if (/^SELECT.+FROM bom_explosion_cache/s.test(sql.trim())) return [structuredClone(state.cache.filter((row) => row.bom_id === Number(args[0])))];
      if (/^SELECT.+FROM bom_masters/s.test(sql.trim())) {
        return [state.boms.filter((bom) =>
          (!/deleted_at IS NULL/.test(sql) || !bom.deleted_at) &&
          (!/approved_by IS NOT NULL/.test(sql) || bom.approved_by) &&
          (/product_id IN/.test(sql) ? args[0].includes(bom.product_id)
          : /product_id =/.test(sql) ? bom.product_id === Number(args[0])
          : /id IN/.test(sql) ? args[0].includes(bom.id) : bom.id === Number(args[0])))];
      }
      if (/SELECT (?:DISTINCT )?bd.bom_id/.test(sql)) {
        return [state.details.filter((row) => row.material_id === args[0] && row.has_sub_bom).map((row) => ({ bom_id: row.bom_id }))];
      }
      if (/^SELECT.+FROM bom_details/s.test(sql.trim())) {
        return [state.details.filter((row) => row.bom_id === Number(args[0]) && (!/AND material_id =/.test(sql) || row.material_id === Number(args[1])))];
      }
      if (/UPDATE bom_details SET/.test(sql)) {
        if (/SET has_sub_bom/.test(sql)) {
          state.details.filter((row) => row.material_id === args[2]).forEach((row) => {
            row.has_sub_bom = args[0]; row.ref_bom_id = args[1];
          });
          return [{ affectedRows: 1 }];
        }
        const field = sql.match(/SET (\w+)/)[1];
        state.details.find((row) => row.id === args[1])[field] = args[0];
        return [{ affectedRows: 1 }];
      }
      if (/INSERT INTO bom_details/.test(sql)) {
        state.details.push({ id: 102, bom_id: args[0], material_id: args[1], quantity: args[2], unit_id: args[3], parent_id: 0, level: 1, material_code: 'NEW' });
        return [{ insertId: 102 }];
      }
      if (/DELETE FROM bom_details/.test(sql)) {
        state.details = state.details.filter((row) => (/WHERE bom_id/.test(sql) ? row.bom_id : row.id) !== args[0]);
        return [{}];
      }
      if (/UPDATE bom_masters SET version/.test(sql)) { state.boms.find((bom) => bom.id === Number(args[1])).version = args[0]; return [{}]; }
      if (/UPDATE ecn_orders SET status/.test(sql)) { state.order.status = args[0]; return [{}]; }
      if (/DELETE FROM document_links/.test(sql)) return [{}];
      if (/DELETE FROM bom_explosion_cache/.test(sql)) {
        events.push(`invalidate:${args[0]}`);
        if (options.failCacheAt === Number(args[0])) throw new Error('cache deletion unavailable');
        state.cache = state.cache.filter((row) => row.bom_id !== Number(args[0]));
        return [{}];
      }
      if (/INSERT INTO bom_explosion_cache/.test(sql)) {
        state.cache.push(...args[0].map((values, id) => Object.fromEntries([
          ['id', id + 1], ...['product_id', 'bom_id', 'bom_version', 'material_id', 'material_code', 'material_name', 'level', 'quantity_per', 'parent_material_id', 'bom_path', 'source_bom_id', 'unit_id', 'unit_name'].map((key, i) => [key, values[i]]),
        ])));
        return [{}];
      }
      throw new Error(`Unhandled ECN SQL: ${sql}`);
    },
  };
  const pool = { getConnection: async () => conn, query: async (...args) => {
    if (inTransaction) throw new Error('Pool query escaped the active transaction');
    return conn.query(...args);
  } };
  const service = load('src/services/BomExplosionService.js', { '../config/db': { pool }, '../utils/logger': { logger } });
  const bomService = load('src/services/bomService.js', {
    '../config/db': { pool }, '../utils/logger': { logger }, './business/DLQService': {},
    './BomExplosionService': service,
    '../utils/softDelete': { softDelete: async (executor, _table, _key, id) => {
      if (executor !== conn) throw new Error('BOM delete escaped its transaction');
      if (options.failSoftDelete) throw new Error('soft delete unavailable');
      state.boms.find((bom) => bom.id === id).deleted_at = '2026-10-15';
      events.push('soft-delete');
    } },
  });
  const controller = load('src/controllers/business/enhancedModulesController.js', {
    '../../services/business/CodeGeneratorService': {},
    '../../services/business/DocumentLinkService': { createLink: async () => {} },
    '../../constants/documentLinkTypes': { DOCUMENT_LINK_TYPES: {} }, '../../services/FileAccessService': {},
    '../../config/db': { pool }, '../../utils/softDelete': {}, '../../utils/responseHandler': { ResponseHandler },
    '../../utils/logger': { logger }, '../../utils/safePagination': {}, '../../utils/fieldMap': fieldMap,
    '../../services/business/ExchangeRateService': {}, '../../services/BomExplosionService': service,
  });
  async function implement() {
    const response = {};
    await controller.ecn.updateStatus({ params: { id: 1 }, body: { status: 'implementing' }, user: { id: 7 } }, response);
    return response;
  }
  return { implement, service, events, deleteBom: () => bomService.deleteBom(10), get state() { return state; } };
}

describe('SC-02 ECN BOM validation', () => {
  test.each([-5, 0, '0', 'NaN', 'Infinity', '2parts', null, '', ' ', true, [], {}, 0.0001, 1e12, 1.234])(
    'rejects non-positive/non-numeric quantity %j and keeps approved BOM untouched', async (value) => {
      const fixture = ecnFixture([change('quantity', value)]);
      expect((await fixture.implement()).status).toBe(400);
      expect(fixture.state.order.status).toBe('approved');
      expect(fixture.state.details[0].quantity).toBe(2);
      expect(fixture.state.boms[0].version).toBe('V1.0');
      expect(fixture.events).not.toContain('commit');
    }
  );

  test.each([['unit_id', 0], ['unit_id', 1.2], ['unit_id', 99], ['level', 0], ['level', 1.5], ['level', 2], ['parent_id', -1], ['parent_id', 101], ['parent_id', 201], ['remark', {}]])(
    'rejects invalid type or reference %s=%j', async (field, value) => {
      const fixture = ecnFixture([change(field, value)]);
      expect((await fixture.implement()).status).toBe(400);
      expect(fixture.state.order.status).toBe('approved');
    }
  );

  test('accepts a valid unit and validates hierarchy after all related rows are changed', async () => {
    const fixture = ecnFixture([
      change('unit_id', '2'),
      change('parent_id', '102'),
      change('level', '2'),
    ]);
    fixture.state.details.push({ id: 102, bom_id: 10, material_id: 2, quantity: 1, unit_id: 1, parent_id: 0, level: 1 });
    expect((await fixture.implement()).status).toBe(200);
    expect(fixture.state.details[0]).toMatchObject({ unit_id: 2, parent_id: 102, level: 2 });
  });

  test('detects an indirect parent cycle and rolls back every earlier change', async () => {
    const fixture = ecnFixture([change(), change('parent_id', 102)]);
    fixture.state.details.push({ id: 102, bom_id: 10, material_id: 2, quantity: 1, unit_id: 1, parent_id: 101, level: 2 });
    expect((await fixture.implement()).status).toBe(400);
    expect(fixture.state.details[0].quantity).toBe(2);
  });
});

describe('SC-03 ECN cache lifecycle', () => {
  test('prewarmed child and ancestors are invalidated atomically and actual expansion sees new leaf usage', async () => {
    const fixture = ecnFixture();
    const before = await fixture.service.explodeBom(300, 30, 1, true);
    expect(before.find((row) => row.material_id === 1).required_quantity).toBe(24);
    await fixture.service.explodeBom(100, 10, 1, true);
    await fixture.service.explodeBom(200, 20, 1, true);
    await fixture.service.explodeBom(999, 99, 1, true);
    fixture.events.length = 0;
    expect((await fixture.implement()).status).toBe(200);
    expect(fixture.events).toEqual(['invalidate:10', 'invalidate:20', 'invalidate:30', 'commit']);
    expect([...new Set(fixture.state.cache.map((row) => row.bom_id))]).toEqual([99]);
    const after = await fixture.service.explodeBom(300, 30, 1, true);
    expect(after.find((row) => row.material_id === 1).required_quantity).toBe(60);
  });

  test.each(['bom_add', 'bom_remove'])('also cascades cache invalidation for %s', async (change_type) => {
    const fixture = ecnFixture([change('quantity', '3', { change_type, material_id: change_type === 'bom_add' ? 2 : 1 })]);
    expect((await fixture.implement()).status).toBe(200);
    expect(fixture.events).toEqual(['invalidate:10', 'invalidate:20', 'invalidate:30', 'commit']);
  });

  test('cache failure rolls back BOM values, version, ECN status and already deleted caches', async () => {
    const fixture = ecnFixture([change()], { failCacheAt: 20 });
    fixture.state.cache.push({ bom_id: 10, quantity_per: 2 }, { bom_id: 20, quantity_per: 6 });
    const before = structuredClone(fixture.state);
    expect((await fixture.implement()).status).toBe(500);
    expect(fixture.state).toEqual(before);
    expect(fixture.events).toEqual(['invalidate:10', 'invalidate:20', 'rollback']);
  });

  test('an expansion started before ECN commit cannot repopulate ancestors with obsolete quantities', async () => {
    const fixture = ecnFixture();
    const recursiveExplode = fixture.service.recursiveExplode.bind(fixture.service);
    let resume;
    let ready;
    const pause = new Promise((resolve) => { resume = resolve; });
    const reachedSave = new Promise((resolve) => { ready = resolve; });
    let suspended = false;
    fixture.service.recursiveExplode = async (...args) => {
      const result = await recursiveExplode(...args);
      if (args[0] === 30 && !suspended) {
        suspended = true;
        ready();
        await pause;
      }
      return result;
    };
    const oldExpansion = fixture.service.explodeBom(300, 30, 1, true);
    await reachedSave;
    expect((await fixture.implement()).status).toBe(200);
    resume();
    expect((await oldExpansion).find((row) => row.material_id === 1).required_quantity).toBe(24);
    expect(fixture.state.cache).toEqual([]);
    const fresh = await fixture.service.explodeBom(300, 30, 1, true);
    expect(fresh.find((row) => row.material_id === 1).required_quantity).toBe(60);
  });
});

describe('SC-03 BOM deletion and cache consistency', () => {
  test('an expansion from before deletion cannot refill the deleted BOM or its ancestors', async () => {
    const fixture = ecnFixture();
    fixture.state.boms[0].approved_by = null;
    const recursiveExplode = fixture.service.recursiveExplode.bind(fixture.service);
    let resume;
    let ready;
    const pause = new Promise((resolve) => { resume = resolve; });
    const reachedSave = new Promise((resolve) => { ready = resolve; });
    let suspended = false;
    fixture.service.recursiveExplode = async (...args) => {
      const result = await recursiveExplode(...args);
      if (args[0] === 30 && !suspended) {
        suspended = true; ready(); await pause;
      }
      return result;
    };
    const oldExpansion = fixture.service.explodeBom(300, 30, 1, true);
    await reachedSave;
    expect(await fixture.deleteBom()).toBe(true);
    expect(fixture.events).toEqual(['invalidate:10', 'invalidate:20', 'invalidate:30', 'soft-delete', 'commit']);
    resume();
    expect((await oldExpansion).find((row) => row.material_id === 1).required_quantity).toBe(24);
    expect(fixture.state.cache).toEqual([]);
    expect(fixture.state.boms[0].deleted_at).toBeTruthy();
    expect(fixture.state.details.find((row) => row.id === 201)).toMatchObject({ has_sub_bom: 0, ref_bom_id: null });
    const fresh = await fixture.service.explodeBom(300, 30, 1, true);
    expect(fresh.some((row) => row.material_id === 1)).toBe(false);
  });

  test.each([{ failCacheAt: 20 }, { failSoftDelete: true }])('a deletion failure restores all details, references and caches: %j', async (options) => {
    const fixture = ecnFixture([], options);
    fixture.state.boms[0].approved_by = null;
    fixture.state.cache.push({ bom_id: 10, quantity_per: 2 }, { bom_id: 20, quantity_per: 6 });
    const before = structuredClone(fixture.state);
    await expect(fixture.deleteBom()).rejects.toThrow();
    expect(fixture.state).toEqual(before);
    expect(fixture.events).not.toContain('commit');
  });

  test('deletion keeps the approved and referenced BOM restrictions', async () => {
    const approved = ecnFixture();
    await expect(approved.deleteBom()).rejects.toThrow('已审核的BOM不能删除');
    const planned = ecnFixture([], { planned: true });
    planned.state.boms[0].approved_by = null;
    await expect(planned.deleteBom()).rejects.toThrow('生产计划引用');
    expect([...approved.events, ...planned.events].some((event) => event.startsWith('invalidate:'))).toBe(false);
  });
});
