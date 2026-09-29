jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/services/InventoryService', () => ({}));
jest.mock('../../src/services/business/CostAccountingService', () => ({}));
jest.mock('../../src/services/business/ProductionLaborService', () => ({}));
jest.mock('../../src/services/business/ProductionBatchTraceabilityService', () => ({}));
jest.mock('../../src/services/business/DLQService', () => ({ registerHandler: jest.fn() }));
jest.mock('../../src/services/business/AsyncTaskService', () => ({}));
jest.mock('../../src/services/business/TaskLifecycleService', () => ({ validateTaskTransition: () => ({ valid: true }) }));
jest.mock('../../src/services/business/DomainEventService', () => ({ enqueue: jest.fn(async () => 1), dispatchSoon: jest.fn() }));
const service = require('../../src/services/business/InboundTransactionService');
const events = require('../../src/services/business/DomainEventService');

test.each([
  ['confirmed', 5, 'warehousing', false],
  ['completed', 5, 'completed', true],
  ['confirmed', 100, 'warehousing', false],
])('counts only completed documents and the current one: other %s %i', async (otherStatus, otherQuantity, expectedStatus, completed) => {
  const task = { id: 41, code: 'TASK-41', status: 'warehousing', quantity: 10, product_id: 9 };
  const rows = [{ id: 1, status: 'confirmed', quantity: 5 }, { id: 2, status: otherStatus, quantity: otherQuantity }];
  const connection = {
    query: jest.fn(async (sql, params) => {
      if (sql.includes('FROM production_tasks')) return [[task]];
      if (sql.includes('SUM(ii.quantity)')) {
        expect(sql).toContain("(ib.status = 'completed' OR ib.id = ?)");
        expect(sql).toContain('FOR UPDATE');
        const total = rows.filter(row => row.status === 'completed' || row.id === params[0]).reduce((sum, row) => sum + row.quantity, 0);
        return [[{ total_qty: total }]];
      }
      if (sql.includes('SUM(COALESCE(qualified_quantity')) return [[{ q: 10 }]];
      throw new Error('Unexpected query: ' + sql);
    }),
    execute: jest.fn(async (_sql, params) => { task.status = params[0]; return [{ affectedRows: 1 }]; }),
  };
  await service.syncProductionCompletion(connection, { id: 1, inbound_no: 'IN-1', inbound_type: 'production', reference_type: 'production_task', reference_id: 41 }, [], null);
  expect(task.status).toBe(expectedStatus);
  expect(events.enqueue).toHaveBeenCalledTimes(completed ? 1 : 0);
});
