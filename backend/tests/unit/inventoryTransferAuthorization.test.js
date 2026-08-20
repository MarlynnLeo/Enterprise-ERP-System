/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: { getConnection: jest.fn(), execute: jest.fn() },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/utils/codeGenerator', () => ({ CodeGenerators: {} }));
jest.mock('../../src/utils/softDelete', () => ({
  softDelete: jest.fn(),
  softDeleteBatch: jest.fn(),
}));
jest.mock('../../src/services/InventoryService', () => ({}));
jest.mock('../../src/utils/userHelper', () => ({ getCurrentUserName: jest.fn() }));
jest.mock('../../src/utils/userUtils', () => ({ getRequestActorLabel: jest.fn() }));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  assertAllAccess: jest.fn(),
  applyListScope: jest.fn(),
  assertAccess: jest.fn(),
}));
jest.mock('../../src/services/DataScopeService', () => ({
  canAccessLocation: jest.fn(),
}));

const db = require('../../src/config/db');
const { softDeleteBatch } = require('../../src/utils/softDelete');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const { batchDeleteTransfers } = require('../../src/controllers/business/inventory/inventoryTransferController');

function responseDouble() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('inventory transfer batch authorization', () => {
  let connection;

  beforeEach(() => {
    jest.clearAllMocks();
    connection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
      execute: jest.fn(),
    };
    db.pool.getConnection.mockResolvedValue(connection);
  });

  test('批量删除混入越权调拨单时整批回滚且不删除任何记录', async () => {
    ScopeGuard.assertAllAccess.mockResolvedValue(false);
    const res = responseDouble();

    await batchDeleteTransfers(
      { body: { ids: [1, 2] }, user: { id: 3 } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.execute).not.toHaveBeenCalled();
    expect(softDeleteBatch).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
  });
});
