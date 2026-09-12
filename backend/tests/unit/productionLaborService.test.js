/* global describe, expect, jest, test */
jest.mock('../../src/utils/codeGenerator', () => ({
  CodeGenerators: { generateReportCode: jest.fn().mockResolvedValue('RPT-TEST-001') },
}));

const labor = require('../../src/services/business/ProductionLaborService');
const task = { id: 10, code: 'PT-10', product_id: 20, quantity: 16, manager: '主管' };
const connectionFor = (...results) => {
  const query = jest.fn();
  for (const result of results) query.mockResolvedValueOnce([result]);
  return { query };
};
const standard = { id: 1, process_name: '装配', standard_hours: 0.25, status: 'completed' };

describe('ProductionLaborService task hours', () => {
  test('uses the fixed standard per produced unit', async () => {
    const connection = connectionFor([task], [standard]);
    await expect(labor.resolveWorkHours(connection, 10, 8)).resolves.toMatchObject({
      workHours: 2, source: 'process_standard_hours',
    });
  });

  test('combines fixed standards with actual time only for zero-standard steps', async () => {
    const connection = connectionFor([task], [
      { ...standard, standard_hours: 0.5, actual_seconds: 9000 },
      { id: 2, standard_hours: 0, status: 'completed', actual_seconds: 1800 },
    ]);
    await expect(labor.resolveWorkHours(connection, 10, 8)).resolves.toMatchObject({
      workHours: 4.25, source: 'task_standard_and_actual_hours',
    });
  });

  test.each([
    [[{ ...standard, standard_hours: 0.000001 }], 0.000001],
    [[{ ...standard, standard_hours: 0, actual_seconds: 1 }], 0.000017],
  ])('retains small positive hours at six decimal places', async (processes, expected) => {
    const connection = connectionFor([task], processes);
    expect((await labor.resolveWorkHours(connection, 10, 1)).workHours).toBe(expected);
  });

  test.each([
    [],
    [{ ...standard, standard_hours: 0, actual_seconds: null }],
    [standard, { id: 2, standard_hours: 0, status: 'completed', actual_seconds: 0 }],
    [{ ...standard, standard_hours: 0, status: 'in_progress', actual_seconds: 1800 }],
  ])('blocks missing execution time without falling back to live master data', async (...args) => {
    const processes = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    const connection = connectionFor([task], processes);
    await expect(labor.resolveWorkHours(connection, 10)).rejects.toMatchObject({
      errorCode: 'PRODUCTION_LABOR_REQUIRED', httpStatus: 409,
    });
  });

  test.each([0, -1, 17, NaN])('rejects invalid produced quantity %s', async quantity => {
    await expect(labor.resolveWorkHours(connectionFor([task]), 10, quantity))
      .rejects.toMatchObject({ errorCode: 'INVALID_REPORT_QUANTITY' });
  });
});

describe('ProductionLaborService reports', () => {
  test('creates a positive report when no report exists', async () => {
    const connection = connectionFor([task], [], [standard], { insertId: 9 });
    await expect(labor.ensureTaskReport(connection, 10)).resolves.toMatchObject({
      created: true, repaired: false, workHours: 4, reportId: 9,
    });
    expect(connection.query.mock.calls[3][1].slice(6, 10)).toEqual([16, 16, 16, 4]);
  });

  test('preserves a full manual report even when no process hours are available', async () => {
    const connection = connectionFor([task], [{ id: 3, completed_quantity: 16, work_hours: 1.25 }]);
    await expect(labor.ensureTaskReport(connection, 10)).resolves.toMatchObject({
      created: false, repaired: false, workHours: 1.25, source: 'existing_report',
    });
    expect(connection.query).toHaveBeenCalledTimes(2);
  });

  test('repairs the historical full zero-hour report from elapsed time', async () => {
    const connection = connectionFor([task], [{ id: 3, completed_quantity: 16, work_hours: 0 }],
      [{ ...standard, standard_hours: 0, actual_seconds: 1768 }], { affectedRows: 1 });
    await expect(labor.ensureTaskReport(connection, 10)).resolves.toMatchObject({
      created: false, repaired: true, workHours: 0.491111, source: 'completed_process_duration',
    });
    expect(connection.query.mock.calls[3][1][0]).toBe(0.491111);
  });

  test('repairs every zero-hour batch in proportion to its quantity', async () => {
    const connection = connectionFor([task], [
      { id: 3, completed_quantity: 4, work_hours: 0 },
      { id: 4, completed_quantity: 12, work_hours: 0 },
    ], [standard], { affectedRows: 1 }, { affectedRows: 1 });
    await expect(labor.ensureTaskReport(connection, 10)).resolves.toMatchObject({
      created: false, repaired: true, workHours: 4,
    });
    expect(connection.query.mock.calls.slice(3).map(call => call[1][0])).toEqual([1, 3]);
  });

  test('preserves manual hours, repairs zero batches and adds only missing quantity', async () => {
    const connection = connectionFor([task], [
      { id: 3, completed_quantity: 4, work_hours: 2 },
      { id: 4, completed_quantity: 4, work_hours: 0 },
    ], [standard], { affectedRows: 1 }, { insertId: 9 });
    await expect(labor.ensureTaskReport(connection, 10)).resolves.toMatchObject({
      created: true, repaired: true, workHours: 5,
    });
    expect(connection.query.mock.calls[3][1][0]).toBe(1);
    expect(connection.query.mock.calls[4][1].slice(6, 10)).toEqual([8, 8, 8, 2]);
  });

  test('partial completion targets a cumulative quantity instead of duplicating prior batches', async () => {
    const connection = connectionFor([task], [{ id: 3, completed_quantity: 3, work_hours: 0.75 }],
      [standard], { insertId: 9 });
    await expect(labor.ensureTaskReport(connection, 10, { quantity: 7 })).resolves.toMatchObject({
      created: true, workHours: 1.75,
    });
    expect(connection.query.mock.calls[3][1].slice(6, 10)).toEqual([4, 4, 4, 1]);
  });

  test.each([0, 17])('does not guess how to repair inconsistent existing quantity %s', async quantity => {
    const connection = connectionFor([task], [{ id: 3, completed_quantity: quantity, work_hours: 0 }]);
    await expect(labor.ensureTaskReport(connection, 10)).rejects.toMatchObject({
      errorCode: 'REPORT_QUANTITY_CONFLICT', httpStatus: 409,
    });
  });
});
