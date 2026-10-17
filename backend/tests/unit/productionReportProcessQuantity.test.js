/* global jest, beforeEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn(), query: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../src/utils/responseHandler', () => ({
  ResponseHandler: { success: jest.fn(), error: jest.fn(), forbidden: jest.fn() },
}));
jest.mock('../../src/utils/codeGenerator', () => ({
  CodeGenerators: { generateReportCode: jest.fn(async () => 'RP-TEST') },
}));
jest.mock('../../src/utils/userHelper', () => ({
  getCurrentUserName: jest.fn(async () => 'operator'),
}));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  denyUnlessAccess: jest.fn(async () => true),
  assertAccess: jest.fn(async () => true),
}));
jest.mock('../../src/services/business/TaskLifecycleService', () => ({
  promoteTaskToInspection: jest.fn(),
  promoteTaskToInProgress: jest.fn(),
}));
jest.mock('../../src/services/business/ProductionQualityInspectionService', () => ({
  ensureTaskQualityInspections: jest.fn(async () => ({})),
}));
jest.mock('../../src/services/business/FinalInspectionService', () => ({
  ensureForTask: jest.fn(async () => ({ created: false })),
}));
const db = require('../../src/config/db');
const { ResponseHandler } = require('../../src/utils/responseHandler');
const lifecycle = require('../../src/services/business/TaskLifecycleService');
const controller = require('../../src/controllers/business/production/reportController');
const labor = require('../../src/services/business/ProductionLaborService');
let task, processes, reports, connection, nextId;
beforeEach(() => {
  jest.clearAllMocks();
  nextId = 1;
  task = { id: 42, status: 'in_progress', quantity: 100, completed_quantity: 0, progress: 0 };
  processes = [1, 2].map((id) => ({
    id,
    task_id: 42,
    sequence: id,
    process_name: `工序${id}`,
    quantity: 100,
    status: 'pending',
    standard_hours: 0.1,
    progress: 0,
  }));
  reports = [];
  const total = (rows) => rows.reduce((sum, row) => sum + Number(row.completed_quantity), 0);
  connection = {
    beginTransaction: jest.fn(),
    rollback: jest.fn(),
    commit: jest.fn(),
    release: jest.fn(),
    query: jest.fn(async (sql, values = []) => {
      if (/FROM production_tasks/.test(sql)) return [[{ ...task }]];
      if (/FROM quality_inspections/.test(sql)) return [[]];
      if (/^\s*SELECT[\s\S]*FROM production_reports/.test(sql)) {
        let rows = reports;
        if (/WHERE id =/.test(sql)) rows = rows.filter((row) => row.id === Number(values[0]));
        if (/AND id !=/.test(sql)) rows = rows.filter((row) => row.id !== Number(values[1]));
        if (/WHERE process_id =/.test(sql))
          rows = rows.filter((row) => row.process_id === Number(values[0]));
        if (/AND process_id =/.test(sql))
          rows = rows.filter((row) => row.process_id === Number(values[1]));
        if (/GROUP BY process_id/.test(sql)) {
          const ids = [...new Set(rows.map((row) => row.process_id))];
          return [
            ids.map((id) => {
              const subset = rows.filter((row) => row.process_id === id);
              return {
                process_id: id,
                total_reported: total(subset),
                qualified_quantity: total(subset),
                defective_quantity: 0,
                total_work_hours: subset.reduce((sum, row) => sum + row.work_hours, 0),
                report_count: subset.length,
              };
            }),
          ];
        }
        if (/SUM\(completed_quantity\)/.test(sql))
          return [[{ total_proc_reported: total(rows), total_reported: total(rows) }]];
        return [rows.map((row) => ({ ...row, old_process_id: row.process_id }))];
      }
      if (/FROM production_processes/.test(sql)) {
        if (/sequence </.test(sql))
          return [
            processes
              .filter(
                (row) =>
                  row.sequence < values[1] && !['completed', 'cancelled'].includes(row.status)
              )
              .map((row) => ({ id: row.id })),
          ];
        let rows = /WHERE id =/.test(sql)
          ? processes.filter((row) => row.id === Number(values[0]))
          : processes;
        if (/status <> 'cancelled'/.test(sql))
          rows = rows.filter((row) => row.status !== 'cancelled');
        if (/AND id =/.test(sql)) rows = rows.filter((row) => row.id === Number(values[1]));
        return [rows.map((row) => ({ ...row, actual_seconds: row.actual_seconds ?? 3600 }))];
      }
      if (/INSERT INTO production_reports/.test(sql)) {
        const id = nextId++;
        const manual = sql.includes('VALUES (?, ?, ?, ?, ?, ?, ?, ?,');
        reports.push({
          id,
          task_id: 42,
          process_id: values[2] == null ? null : Number(values[2]),
          completed_quantity: Number(values[manual ? 8 : 7]),
          work_hours: Number(values[manual ? 12 : 9]),
        });
        return [{ insertId: id }];
      }
      if (/UPDATE production_reports/.test(sql)) {
        if (/SET process_id/.test(sql))
          Object.assign(
            reports.find((row) => row.id === Number(values[10])),
            {
              process_id: values[0] == null ? null : Number(values[0]),
              completed_quantity: values[4],
              work_hours: values[8],
            }
          );
        else reports.find((row) => row.id === Number(values[4])).work_hours = values[0];
        return [{ affectedRows: 1 }];
      }
      if (/DELETE FROM production_reports/.test(sql)) {
        reports = reports.filter((row) => row.id !== Number(values[0]));
        return [{ affectedRows: 1 }];
      }
      if (/UPDATE production_processes SET \?/.test(sql)) {
        Object.assign(
          processes.find((row) => row.id === Number(values[1])),
          values[0]
        );
        return [{ affectedRows: 1 }];
      }
      if (/UPDATE production_processes SET progress/.test(sql)) {
        const row = processes.find((row) => row.id === Number(values[1]));
        if (!['completed', 'cancelled'].includes(row.status)) row.progress = values[0];
        return [{ affectedRows: 1 }];
      }
      if (/UPDATE production_tasks SET completed_quantity/.test(sql)) {
        task.completed_quantity = values[0];
        task.progress = values[1];
        return [{ affectedRows: 1 }];
      }
      if (/UPDATE production_tasks SET progress = 100/.test(sql)) {
        task.progress = 100;
        return [{ affectedRows: 1 }];
      }
      if (/UPDATE production_tasks SET progress/.test(sql)) {
        task.progress = values[0];
        return [{ affectedRows: 1 }];
      }
      if (/UPDATE production_tasks SET actual_start_time/.test(sql)) return [{ affectedRows: 1 }];
      throw new Error('Unexpected SQL: ' + sql);
    }),
  };
  db.pool.getConnection.mockResolvedValue(connection);
  db.pool.query.mockImplementation((...args) => connection.query(...args));
  lifecycle.promoteTaskToInProgress.mockImplementation(async () => ({ status: task.status }));
  lifecycle.promoteTaskToInspection.mockImplementation(async () => {
    task.status = 'inspection';
    task.completed_quantity = 100;
    return { promoted: true, status: 'inspection' };
  });
});
const request = (processId, quantity, id) => ({
  params: { id },
  user: { id: 7 },
  body: {
    taskId: 42,
    processId,
    completedQuantity: quantity,
    qualifiedQuantity: quantity,
    workHours: 2,
  },
});
const create = async (processId, quantity) =>
  controller.createReport(request(processId, quantity), {});
test('100 pieces can pass through both processes without double-counting finished products', async () => {
  await create(1, 100);
  expect(ResponseHandler.error).not.toHaveBeenCalled();
  expect(task).toMatchObject({ completed_quantity: 0, progress: 50, status: 'in_progress' });
  await create(2, 100);
  expect(ResponseHandler.error).not.toHaveBeenCalled();
  expect(task).toMatchObject({ completed_quantity: 100, progress: 100, status: 'inspection' });
  expect(reports.map((row) => row.completed_quantity)).toEqual([100, 100]);
  expect(processes.map((row) => row.status)).toEqual(['completed', 'completed']);
});
test('edits and deletes of unfinished final-process reports recompute product output', async () => {
  await create(1, 100);
  await create(2, 40);
  expect(task.completed_quantity).toBe(40);
  await controller.updateReport(request(2, 20, 2), {});
  expect(ResponseHandler.error).not.toHaveBeenCalled();
  expect(task).toMatchObject({ completed_quantity: 20, progress: 60 });
  await controller.deleteReport({ params: { id: 2 }, user: { id: 7 } }, {});
  expect(ResponseHandler.error).not.toHaveBeenCalled();
  expect(task).toMatchObject({ completed_quantity: 0, progress: 50 });
  expect(processes[1].progress).toBe(0);
});
test('editing a report checks its own process ceiling, excluding the edited row', async () => {
  await create(1, 100);
  await create(2, 30);
  await create(2, 20);
  await controller.updateReport(request(2, 90, 2), {});
  expect(ResponseHandler.error).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.stringContaining('剩余可报工 80'),
    'VALIDATION_ERROR',
    400,
    expect.anything()
  );
  expect(reports[1].completed_quantity).toBe(30);
});
test.each(['edit', 'delete'])(
  'cannot %s completed upstream output while keeping its downstream completion basis',
  async (operation) => {
    await create(1, 100);
    if (operation === 'edit') await controller.updateReport(request(1, 50, 1), {});
    else await controller.deleteReport({ params: { id: 1 }, user: { id: 7 } }, {});
    expect(ResponseHandler.error.mock.calls.at(-1)[1]).toContain('已完成工序');
    expect(reports[0].completed_quantity).toBe(100);
  }
);
test.each([
  [1, null],
  [null, 1],
])('rejects mixing %s report mode with %s', async (first, second) => {
  await create(first, 10);
  await create(second, 10);
  expect(ResponseHandler.error.mock.calls.at(-1)[1]).toContain('不能混用');
  expect(reports).toHaveLength(1);
});
test('no-process task reporting still supports edits and deletion', async () => {
  processes = [];
  await create(null, 40);
  await controller.updateReport(request(null, 20, 1), {});
  expect(task.completed_quantity).toBe(20);
  await controller.deleteReport({ params: { id: 1 }, user: { id: 7 } }, {});
  expect(ResponseHandler.error).not.toHaveBeenCalled();
  expect(task.completed_quantity).toBe(0);
});
test('process statistics show remaining capacity for that process and output statistics use the last step', async () => {
  await create(1, 100);
  await create(2, 30);
  await controller.getTaskReportStats(
    { params: { taskId: 42 }, query: { processId: 2 }, user: { id: 7 } },
    {}
  );
  expect(ResponseHandler.success.mock.calls.at(-1)[1]).toMatchObject({
    reported_quantity: 30,
    remaining_quantity: 70,
    reporting_mode: 'process',
  });
  await controller.getTaskReportStats({ params: { taskId: 42 }, query: {}, user: { id: 7 } }, {});
  expect(ResponseHandler.success.mock.calls.at(-1)[1]).toMatchObject({
    reported_quantity: 30,
    remaining_quantity: 70,
  });
});
test('automatic completion fills missing process reports and labor once per process', async () => {
  processes.forEach((row) => {
    row.status = 'completed';
  });
  reports = [{ id: 1, task_id: 42, process_id: 1, completed_quantity: 100, work_hours: 2 }];
  nextId = 2;
  const result = await labor.ensureTaskReport(connection, 42);
  expect(result).toMatchObject({ created: true, workHours: 12 });
  expect(reports).toHaveLength(2);
  expect(reports[1]).toMatchObject({ process_id: 2, completed_quantity: 100, work_hours: 10 });
  await labor.ensureTaskReport(connection, 42);
  expect(reports).toHaveLength(2);
});

test('actual duration uses the selected process quantity instead of the task product quantity', async () => {
  Object.assign(processes[0], {
    quantity: 50,
    standard_hours: 0,
    status: 'completed',
    actual_seconds: 36000,
  });
  await expect(labor.resolveWorkHours(connection, 42, 50, task, 1)).resolves.toMatchObject({
    workHours: 10,
    hoursPerUnit: 0.2,
  });
  await expect(labor.resolveWorkHours(connection, 42, 20, task, 1)).resolves.toMatchObject({
    workHours: 4,
  });
  await expect(labor.resolveWorkHours(connection, 42, 60, task, 1)).rejects.toMatchObject({
    errorCode: 'INVALID_REPORT_QUANTITY',
  });
});

test.each([
  [20, 0, [4, 6], 10],
  [20, 5, [5, 6], 11],
  [50, 0, [10], 10],
])(
  'process duration repairs or fills only its own remaining quantity (%s pieces, %s manual hours)',
  async (quantity, hours, expectedHours, totalHours) => {
    processes = [
      {
        ...processes[0],
        quantity: 50,
        standard_hours: 0,
        status: 'completed',
        actual_seconds: 36000,
      },
    ];
    reports = [
      { id: 1, task_id: 42, process_id: 1, completed_quantity: quantity, work_hours: hours },
    ];
    nextId = 2;
    const first = await labor.ensureTaskReport(connection, 42);
    expect(first.workHours).toBe(totalHours);
    expect(reports.map((row) => row.work_hours)).toEqual(expectedHours);
    expect(reports.reduce((sum, row) => sum + row.completed_quantity, 0)).toBe(50);
    const writes = connection.query.mock.calls.filter(([sql]) =>
      /^\s*(INSERT|UPDATE)/.test(sql)
    ).length;
    const second = await labor.ensureTaskReport(connection, 42);
    expect(second).toMatchObject({ created: false, repaired: false, workHours: totalHours });
    expect(
      connection.query.mock.calls.filter(([sql]) => /^\s*(INSERT|UPDATE)/.test(sql))
    ).toHaveLength(writes);
  }
);

test.each([50, 150])(
  'full completion covers a missing %s-piece process once at its full actual duration',
  async (quantity) => {
    Object.assign(processes[0], {
      quantity,
      standard_hours: 0,
      status: 'completed',
      actual_seconds: 36000,
    });
    processes[1].status = 'completed';
    reports = [{ id: 1, task_id: 42, process_id: 2, completed_quantity: 100, work_hours: 2 }];
    nextId = 2;
    const first = await labor.ensureTaskReport(connection, 42);
    expect(first).toMatchObject({ created: true, workHours: 12 });
    expect(reports[1]).toMatchObject({
      process_id: 1,
      completed_quantity: quantity,
      work_hours: 10,
    });
    await labor.ensureTaskReport(connection, 42);
    expect(reports).toHaveLength(2);
  }
);

test('overreported process quantity is rejected even while below the task quantity', async () => {
  processes = [{ ...processes[0], quantity: 50, status: 'completed' }];
  reports = [{ id: 1, task_id: 42, process_id: 1, completed_quantity: 60, work_hours: 2 }];
  await expect(labor.ensureTaskReport(connection, 42)).rejects.toMatchObject({
    errorCode: 'REPORT_QUANTITY_CONFLICT',
  });
  expect(connection.query.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE)/.test(sql))).toBe(false);
});
