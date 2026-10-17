jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/InventoryService', () => ({}));
jest.mock('../../src/services/business/CostAccountingService', () => ({}));
jest.mock('../../src/services/business/ProductionLaborService', () => ({}));
jest.mock('../../src/services/business/ProductionBatchTraceabilityService', () => ({}));
jest.mock('../../src/services/business/DLQService', () => ({ registerHandler: jest.fn() }));
jest.mock('../../src/services/business/AsyncTaskService', () => ({}));
jest.mock('../../src/services/business/TaskLifecycleService', () => ({
  validateTaskTransition: () => ({ valid: true }),
}));
jest.mock('../../src/services/business/DomainEventService', () => ({
  enqueue: jest.fn(async () => 1),
  dispatchSoon: jest.fn(),
}));

const service = require('../../src/services/business/InboundTransactionService');
const events = require('../../src/services/business/DomainEventService');

function fixture({ warehoused = 90, qualified = 90, concession = 0 } = {}) {
  const task = { id: 41, code: 'TASK-41', status: 'warehousing', quantity: 100, product_id: 9 };
  const connection = {
    query: jest.fn(async (sql) => {
      if (sql.includes('FROM production_tasks')) return [[task]];
      if (sql.includes('SUM(ii.quantity)')) return [[{ total_qty: warehoused }]];
      if (sql.includes('SUM(COALESCE(qualified_quantity'))
        return [[{ q: qualified, concession_quantity: concession }]];
      throw new Error(`Unexpected query: ${sql}`);
    }),
    execute: jest.fn(async (_sql, args) => {
      task.status = args[0];
      return [{ affectedRows: 1 }];
    }),
  };
  return { task, connection };
}

const inbound = {
  id: 1,
  inbound_no: 'IN-1',
  inbound_type: 'production',
  reference_type: 'production_task',
  reference_id: 41,
};

test('warehousing the first 90 qualified units of 100 leaves the task open for the defective ten', async () => {
  const f = fixture();
  await service.syncProductionCompletion(f.connection, inbound, [], null);
  expect(f.task.status).toBe('warehousing');
  expect(events.enqueue).not.toHaveBeenCalled();
});

test.each([
  ['repair and passed reinspection', 100, 0],
  ['approved concession preserving the original 90/10 verdict', 90, 10],
  ['approved concession on a wholly failed batch', 0, 100],
])('%s allows completion at 100 units', async (_description, qualified, concession) => {
  const f = fixture({ warehoused: 100, qualified, concession });
  await service.syncProductionCompletion(f.connection, inbound, [], null);
  expect(f.task.status).toBe('completed');
  expect(events.enqueue).toHaveBeenCalledWith(
    'PRODUCTION_TASK_COMPLETED',
    expect.objectContaining({ taskId: 41 }),
    expect.any(Object)
  );
});

test('an unapproved concession cannot release the rejected ten', async () => {
  const f = fixture({ warehoused: 100, qualified: 90, concession: 0 });
  await expect(service.syncProductionCompletion(f.connection, inbound, [], null)).rejects.toThrow(
    '超过任务/终检上限 90'
  );
  expect(f.connection.execute).not.toHaveBeenCalled();
  expect(events.enqueue).not.toHaveBeenCalled();
});

test('approved release cannot push total production inbound above the task quantity', async () => {
  const f = fixture({ warehoused: 101, qualified: 100, concession: 10 });
  await expect(service.syncProductionCompletion(f.connection, inbound, [], null)).rejects.toThrow(
    '超过任务/终检上限 100'
  );
  expect(f.connection.execute).not.toHaveBeenCalled();
});

test('concession allowance is derived from completed approved handling, not reported defects', async () => {
  const f = fixture();
  await service.syncProductionCompletion(f.connection, inbound, [], null);
  const [sql, args] = f.connection.query.mock.calls.find(([query]) =>
    query.includes('AS concession_quantity')
  );
  expect(sql).toContain("ncp.disposition = 'use_as_is' AND ncp.concession_status = 'approved'");
  expect(sql).toContain('LEAST(ncp.quantity, COALESCE(ncp.handled_quantity, 0))');
  expect(sql).toContain('source.deleted_at IS NULL AND ncp.deleted_at IS NULL');
  expect(args).toEqual([41, 41]);
});
