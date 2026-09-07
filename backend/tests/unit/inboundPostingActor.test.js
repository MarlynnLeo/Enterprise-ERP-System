jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn(), execute: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/utils/codeGenerator', () => ({ CodeGenerators: {} }));
jest.mock('../../src/services/InventoryService', () => ({
  getMaterialInfo: jest.fn(), getCurrentStock: jest.fn(), updateStock: jest.fn(),
}));
jest.mock('../../src/models/nonconformingProduct', () => ({}));
jest.mock('../../src/services/business/CostAccountingService', () => ({}));
jest.mock('../../src/services/business/TaskLifecycleService', () => ({ validateTaskTransition: jest.fn() }));
jest.mock('../../src/services/business/DLQService', () => ({ runWithRetry: jest.fn() }));
jest.mock('../../src/services/business/AsyncTaskService', () => ({}));
jest.mock('../../src/services/business/DocumentChainService', () => ({ afterInventoryInboundConfirmed: jest.fn() }));
jest.mock('../../src/authorization/ScopeGuard', () => ({ denyUnlessAccess: jest.fn() }));

const db = require('../../src/config/db');
const InventoryService = require('../../src/services/InventoryService');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const DocumentChainService = require('../../src/services/business/DocumentChainService');
const { updateInboundStatus } = require('../../src/controllers/business/inventory/inventoryInboundController');

describe('inbound finance posting business actor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ScopeGuard.denyUnlessAccess.mockResolvedValue(true);
    InventoryService.getMaterialInfo.mockResolvedValue({ unitId: 1, locationId: 2, costPrice: 5 });
    InventoryService.getCurrentStock.mockResolvedValue(0);
    InventoryService.updateStock.mockResolvedValue({});
  });

  it.each(['系统', 'unrelated-draft-creator', 'forged-client-label'])(
    'attributes posting to the authenticated completion actor instead of draft operator %s',
    async (draftOperator) => {
      const inbound = {
        id: 10, inbound_no: 'IN-ACTOR', inbound_date: '2026-09-06', inbound_type: 'other',
        status: 'confirmed', operator: draftOperator, created_by: 7, location_id: 2,
      };
      const item = { id: 20, material_id: 3, unit_id: 1, quantity: 2, batch_number: 'ACTOR-BATCH' };
      const connection = {
        beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
        execute: jest.fn(async (sql) => {
          if (/FROM inventory_inbound_items/i.test(sql)) return [[item]];
          if (/FROM inventory_inbound\b/i.test(sql)) return [[inbound]];
          if (/UPDATE inventory_inbound SET status/i.test(sql)) return [{ affectedRows: 1 }];
          throw new Error(`Unexpected SQL: ${sql}`);
        }),
      };
      db.pool.getConnection.mockResolvedValue(connection);
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
      const req = {
        params: { id: '10' },
        body: { newStatus: 'completed', operator: 'request-forgery', businessApprovedById: 99 },
        user: { id: 42, username: 'warehouse-approver', real_name: '库管审核员' },
      };

      await updateInboundStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(InventoryService.updateStock).toHaveBeenCalledWith(expect.objectContaining({
        referenceNo: 'IN-ACTOR', quantity: 2, unitCost: 5,
        operator: '库管审核员', businessApprovedById: 42, businessApprovedBy: '库管审核员',
      }), connection);
      expect(DocumentChainService.afterInventoryInboundConfirmed).toHaveBeenCalledWith(
        expect.objectContaining({ id: '10' }), 42, connection
      );
      expect(connection.execute).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE inventory_inbound SET status = \?, updated_by = \?/),
        ['completed', 42, '10', 'confirmed']
      );
      expect(connection.commit).toHaveBeenCalledTimes(1);
      expect(connection.rollback).not.toHaveBeenCalled();
    }
  );
});
