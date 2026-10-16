/* global jest, test, expect */
jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/services/business/periodEnd/runtime', () => ({
  CostClosingService: { collectChecks: jest.fn(async () => []) },
  TAX_RELATED_DOCUMENT_TYPES: {}, taxRelatedDocumentTypeMatchList: () => "'unused'",
}));
const controls = require('../../src/services/business/periodEnd/controlsMethods');
test('unresolved durable finance events block closing even without any DLQ rows', async () => {
  const connection = { execute: jest.fn(async sql => {
    if (sql.includes('FROM sys_failed_jobs')) return [[{ count: 0 }]];
    if (sql.includes('FROM domain_events')) return [[{ count: 1 }]];
    throw new Error('Must stop before other closing work');
  }) };
  await expect(controls.assertCoreClosingControls(connection, { id: 1 })).rejects.toThrow('未完成的财务领域事件');
  expect(connection.execute).toHaveBeenCalledTimes(2);
});
