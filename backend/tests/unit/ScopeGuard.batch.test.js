/* global describe, expect, jest, test */

jest.mock('../../src/services/DataScopeService', () => ({
  buildRequestOwnerScopeClause: jest.fn(),
  assertRecordAccess: jest.fn(),
}));

const DataScopeService = require('../../src/services/DataScopeService');
const ScopeGuard = require('../../src/authorization/ScopeGuard');

describe('ScopeGuard batch authorization', () => {
  test('requires every unique positive ID and fails closed on one denial', async () => {
    DataScopeService.assertRecordAccess
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(
      ScopeGuard.assertAllAccess({}, { user: { id: 1 } }, 'inventory_outbound', [3, 4])
    ).resolves.toBe(false);
    expect(DataScopeService.assertRecordAccess).toHaveBeenCalledTimes(2);
  });

  test('rejects duplicate or malformed IDs without querying the database', async () => {
    await expect(
      ScopeGuard.assertAllAccess({}, { user: { id: 1 } }, 'inventory_outbound', [3, 3])
    ).resolves.toBe(false);
    await expect(
      ScopeGuard.assertAllAccess({}, { user: { id: 1 } }, 'inventory_outbound', ['x'])
    ).resolves.toBe(false);
  });
});
