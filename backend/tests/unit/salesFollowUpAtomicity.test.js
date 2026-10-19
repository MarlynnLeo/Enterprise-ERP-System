/* global jest, describe, beforeEach, test, expect */
jest.mock('../../src/config/db', () => ({ query: jest.fn(), pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/services/InventoryReservationService', () => ({ getAvailableStock: jest.fn(), reserveInventoryForOrder: jest.fn() }));
jest.mock('../../src/services/business/PackingListService', () => ({}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({ createLink: jest.fn() }));
jest.mock('../../src/repositories/TaskRepository', () => ({ resolveProductionGroup: jest.fn(async () => ({ departmentId: 1 })) }));
jest.mock('../../src/utils/codeGenerator', () => ({ CodeGenerators: {
  generatePlanCode: jest.fn(), generatePurchaseRequisitionCode: jest.fn(),
} }));
jest.mock('../../src/services/business/SalesReturnEligibilityService', () => ({ validationError: message => new Error(message) }));
jest.mock('../../src/services/business/SalesOutboundValuationService', () => ({}));

const db = require('../../src/config/db');
const reservation = require('../../src/services/InventoryReservationService');
const links = require('../../src/services/business/DocumentLinkService');
const { CodeGenerators } = require('../../src/utils/codeGenerator');
const { generateProductionAndPurchasePlans } = require('../../src/controllers/business/sales/salesPackingController');
const { autoGenerateFollowUpDocuments } = require('../../src/controllers/business/sales/salesExchangeController');

const internal = id => ({ material_id: id, material_name: `产品${id}`, material_code: `P${id}`, source_type: 'internal', shortage: 5 });
const external = { material_id: 3, material_name: '外购', material_code: 'P3', source_type: 'external', shortage: 3 };
const actor = { id: 8, username: 'seller', real_name: 'Seller' };
const copy = value => JSON.parse(JSON.stringify(value));
let store;

function transactionStore() {
  let state = { orderMarker: 'saved', plans: [], requirements: [], requisitions: [], reqItems: [], links: [] };
  let committed = copy(state);
  const savepoints = new Map();
  const missingBom = new Set();
  let sequence = 0;
  const execute = jest.fn(async (sql, params = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('SAVEPOINT ')) { savepoints.set(normalized.slice(10), copy(state)); return [[]]; }
    if (normalized.startsWith('ROLLBACK TO SAVEPOINT ')) { state = copy(savepoints.get(normalized.slice(22))); return [[]]; }
    if (normalized.startsWith('RELEASE SAVEPOINT ')) { savepoints.delete(normalized.slice(18)); return [[]]; }
    if (normalized.startsWith('SELECT order_no')) return [[{ order_no: 'SO-42', contract_code: 'C42' }]];
    if (normalized.includes('FROM production_plans')) return [state.plans.filter(plan => plan.productId === params[0])];
    if (normalized.includes('FROM production_plan_materials')) return [state.requirements.filter(row => row.planId === params[0])];
    if (normalized.includes('FROM bom_masters')) return [missingBom.has(params[0]) ? [] : [{ id: params[0] + 100 }]];
    if (normalized.startsWith('SELECT code, name FROM materials')) return [[{ code: `P${params[0]}`, name: `产品${params[0]}` }]];
    if (normalized.includes('FROM bom_details')) return [[{ material_id: 99, quantity: 2, stock_quantity: 0 }]];
    if (normalized.includes('FROM purchase_requisition_items')) return [[]];
    if (normalized.startsWith('SELECT m.specs')) return [[{ specs: '', unit_id: 1, unit_name: '件' }]];
    if (normalized.startsWith('INSERT INTO production_plans')) {
      const id = ++sequence;
      state.plans.push({ id, code: params[0], productId: params[2], quantity: params[3], status: params[6] });
      return [{ insertId: id }];
    }
    if (normalized.startsWith('INSERT INTO production_plan_materials')) {
      state.requirements.push({ id: ++sequence, planId: params[0], materialId: params[1], quantity: params[2] });
      return [{ affectedRows: 1 }];
    }
    if (normalized.startsWith('INSERT INTO purchase_requisitions')) {
      const id = ++sequence; state.requisitions.push({ id, number: params[0] }); return [{ insertId: id }];
    }
    if (normalized.startsWith('INSERT INTO purchase_requisition_items')) {
      state.reqItems.push({ requisitionId: params[0], materialId: params[1], quantity: params[7] }); return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected query: ${normalized}`);
  });
  const connection = {
    execute, query: execute,
    beginTransaction: jest.fn(async () => { state = copy(committed); }),
    commit: jest.fn(async () => { committed = copy(state); }),
    rollback: jest.fn(async () => { state = copy(committed); }),
    release: jest.fn(),
  };
  return { connection, missingBom, get state() { return state; }, get committed() { return committed; },
    seed(value) { state = copy(value); committed = copy(value); } };
}

beforeEach(() => {
  jest.clearAllMocks();
  store = transactionStore();
  db.pool.getConnection.mockResolvedValue(store.connection);
  db.query.mockImplementation(async (sql, params) => sql.includes('FROM materials')
    ? { rows: [{ id: params[0], code: `P${params[0]}`, name: `产品${params[0]}`, source_type: params[0] === 3 ? 'external' : 'internal', location_id: 1 }] }
    : { rows: [{ current_stock: 0 }] });
  reservation.getAvailableStock.mockResolvedValue(0);
  CodeGenerators.generatePlanCode.mockImplementation(async () => `PP-${store.state.plans.length + 1}`);
  CodeGenerators.generatePurchaseRequisitionCode.mockResolvedValue('PR-1');
  links.createLink.mockImplementation(async link => { store.state.links.push(copy(link)); });
});

describe('sales shortage follow-up transaction', () => {
  test('a later missing BOM rolls back earlier plan, requirements and lineage while retaining the sales order', async () => {
    store.missingBom.add(2);
    const outcome = {};
    const status = await autoGenerateFollowUpDocuments(42, [{ material_id: 1, quantity: 5 }, { material_id: 2, quantity: 5 }], actor, outcome);
    expect(status).toBe('shortage');
    expect(outcome).toMatchObject({ status: 'failed', code: 'FOLLOW_UP_GENERATION_FAILED' });
    expect(outcome.message).toContain('BOM');
    expect(store.committed).toEqual({ orderMarker: 'saved', plans: [], requirements: [], requisitions: [], reqItems: [], links: [] });
    expect(store.connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(store.connection.rollback).toHaveBeenCalledTimes(1);
    expect(store.connection.commit).not.toHaveBeenCalled();
    expect(store.connection.release).toHaveBeenCalledTimes(1);
  });

  test('savepoint prevents callers that retain an order and commit from persisting partial follow-ups', async () => {
    await store.connection.beginTransaction();
    store.state.orderMarker = 'confirmed-by-caller';
    store.missingBom.add(2);
    await expect(generateProductionAndPurchasePlans(store.connection, 42, [internal(1), internal(2), external], actor)).rejects.toThrow('BOM');
    await store.connection.commit();
    expect(store.committed).toMatchObject({ orderMarker: 'confirmed-by-caller', plans: [], requirements: [], links: [] });
  });

  test('required source-link failure rolls back the generated document rather than reporting success', async () => {
    links.createLink.mockRejectedValueOnce(new Error('关联写入失败'));
    const outcome = {};
    expect(await autoGenerateFollowUpDocuments(42, [{ material_id: 1, quantity: 5 }], actor, outcome)).toBe('shortage');
    expect(outcome.message).toContain('关联写入失败');
    expect(store.committed.plans).toEqual([]);
  });

  test('successful mixed order commits production requirements, purchase lines and both source links together', async () => {
    const outcome = {};
    expect(await autoGenerateFollowUpDocuments(42, [{ material_id: 1, quantity: 5 }, { material_id: 3, quantity: 3 }], actor, outcome)).toBe('in_production');
    expect(outcome).toEqual({ status: 'completed' });
    expect(store.committed.plans).toHaveLength(1);
    expect(store.committed.requirements[0].quantity).toBe(10);
    expect(store.committed.reqItems[0].quantity).toBe(3);
    expect(store.committed.links.map(link => link.target_type).sort()).toEqual(['production_plan', 'purchase_requisition']);
    expect(store.connection.commit).toHaveBeenCalledTimes(1);
  });

  test('a late procurement failure also rolls back already-complete production documents', async () => {
    links.createLink.mockImplementation(async link => {
      if (link.target_type === 'purchase_requisition') throw new Error('采购来源链接写入失败');
      store.state.links.push(copy(link));
    });
    const outcome = {};
    expect(await autoGenerateFollowUpDocuments(42, [{ material_id: 1, quantity: 5 }, { material_id: 3, quantity: 3 }], actor, outcome)).toBe('shortage');
    expect(outcome.status).toBe('failed');
    expect(store.committed).toEqual({ orderMarker: 'saved', plans: [], requirements: [], requisitions: [], reqItems: [], links: [] });
  });

  test('retry repairs an old draft without requirements instead of silently skipping its broken chain', async () => {
    store.seed({ ...store.state, plans: [{ id: 80, code: 'PP-OLD', productId: 1, quantity: 4, status: 'draft' }] });
    const outcome = {};
    expect(await autoGenerateFollowUpDocuments(42, [{ material_id: 1, quantity: 5 }], actor, outcome)).toBe('in_production');
    expect(store.committed.plans).toHaveLength(1);
    expect(store.committed.requirements[0]).toMatchObject({ planId: 80, quantity: 8 });
    expect(store.committed.links[0]).toMatchObject({ target_id: 80, target_code: 'PP-OLD' });
  });

  test('failed inventory lookup cannot be misreported as sufficient stock', async () => {
    db.query.mockRejectedValueOnce(new Error('库存查询失败'));
    const outcome = {};
    expect(await autoGenerateFollowUpDocuments(42, [{ material_id: 1, quantity: 5 }], actor, outcome)).toBe('shortage');
    expect(outcome.status).toBe('failed');
    expect(reservation.reserveInventoryForOrder).not.toHaveBeenCalled();
    expect(db.pool.getConnection).not.toHaveBeenCalled();
  });
});
