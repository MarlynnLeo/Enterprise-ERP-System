/* global beforeEach, describe, expect, jest, test */
jest.mock('../../src/config/db', () => ({
  pool: { query: jest.fn(), getConnection: jest.fn() },
  query: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/business/CodeGeneratorService', () => ({
  nextCode: jest.fn(async () => 'CAL-1'),
}));
const db = require('../../src/config/db');
const codes = require('../../src/services/business/CodeGeneratorService');
const gauge = require('../../src/controllers/business/quality/gaugeController');
const spc = require('../../src/controllers/business/quality/spcController');
const readiness = require('../../src/services/business/MaterialReadinessService');
const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
beforeEach(() => jest.clearAllMocks());

describe('MF-04 calibration history and transaction integrity', () => {
  function fixture(initial = {}, failUpdate = false) {
    const master = {
      id: 7,
      status: 'in_use',
      calibration_cycle_days: 365,
      last_calibration_date: '2026-10-10',
      next_calibration_date: '2027-10-10',
      ...initial,
    };
    const records = [];
    const connections = [];
    let previous = Promise.resolve();
    db.pool.getConnection.mockImplementation(async () => {
      let unlock;
      let snapshot;
      const connection = {
        beginTransaction: jest.fn(),
        commit: jest.fn(async () => {
          unlock?.();
        }),
        rollback: jest.fn(async () => {
          if (snapshot) {
            Object.assign(master, snapshot.master);
            records.splice(snapshot.count);
          }
          unlock?.();
        }),
        release: jest.fn(),
        query: jest.fn(async (sql, params) => {
          if (/FROM gauges/.test(sql)) {
            expect(sql).toContain('FOR UPDATE');
            const wait = previous;
            previous = new Promise((resolve) => {
              unlock = resolve;
            });
            await wait;
            snapshot = { master: { ...master }, count: records.length };
            return [[{ ...master }]];
          }
          if (/INSERT INTO gauge_calibration_records/.test(sql)) {
            records.push(params);
            return [{ insertId: records.length }];
          }
          if (/UPDATE gauges/.test(sql)) {
            if (failUpdate) throw new Error('simulated write failure');
            expect(sql).toMatch(/last_calibration_date IS NULL OR last_calibration_date <= \?/);
            if (!master.last_calibration_date || master.last_calibration_date <= params[5]) {
              master.last_calibration_date = params[0];
              master.next_calibration_date = params[1];
              if (['in_use', 'calibrating'].includes(master.status) && params[2] === 'unqualified')
                master.status = 'repaired';
              else if (master.status === 'calibrating' && params[3] === 'qualified')
                master.status = 'in_use';
            }
            return [{ affectedRows: 1 }];
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        }),
      };
      connections.push(connection);
      return connection;
    });
    const save = async (body = {}) => {
      const response = res();
      await gauge.createCalibrationRecord(
        { body: { gaugeId: 7, calibrationDate: '2026-10-15', result: 'qualified', ...body } },
        response
      );
      return response;
    };
    return { master, records, connections, save };
  }
  test.each(['in_use', 'scrapped', 'idle', 'repaired'])(
    'older calibration retains current dates and %s state',
    async (status) => {
      const f = fixture({ status });
      const response = await f.save({ calibrationDate: '2026-01-01' });
      expect(response.status).toHaveBeenCalledWith(201);
      expect(f.master).toMatchObject({
        status,
        last_calibration_date: '2026-10-10',
        next_calibration_date: '2027-10-10',
      });
      expect(f.records).toHaveLength(1);
      expect(codes.nextCode).toHaveBeenCalledWith('quality_calibration', f.connections[0]);
    }
  );
  test.each(['scrapped', 'idle', 'repaired'])(
    'a newer qualified record does not reactivate %s',
    async (status) => {
      const f = fixture({ status });
      await f.save();
      expect(f.master).toMatchObject({
        status,
        last_calibration_date: '2026-10-15',
        next_calibration_date: '2027-10-15',
      });
    }
  );
  test.each([
    ['qualified', 'in_use'],
    ['unqualified', 'repaired'],
    ['limited', 'calibrating'],
  ])('active calibration result %s transitions only to %s', async (result, status) => {
    const f = fixture({ status: 'calibrating' });
    await f.save({ result });
    expect(f.master.status).toBe(status);
  });
  test('same-day correction is saved and can update due date', async () => {
    const f = fixture();
    await f.save({ calibrationDate: '2026-10-10', nextDueDate: '2027-04-10' });
    expect(f.master.next_calibration_date).toBe('2027-04-10');
  });
  test('record creation and current calibration update roll back together', async () => {
    const f = fixture({}, true);
    const response = await f.save();
    expect(response.status).toHaveBeenCalledWith(500);
    expect(f.records).toHaveLength(0);
    expect(f.master.last_calibration_date).toBe('2026-10-10');
    expect(f.connections[0].rollback).toHaveBeenCalledTimes(1);
    expect(f.connections[0].release).toHaveBeenCalledTimes(1);
    expect(f.connections[0].commit).not.toHaveBeenCalled();
  });
  test('concurrent newer then older requests preserve the newest calibration', async () => {
    const f = fixture({ status: 'scrapped' });
    const [newer, older] = await Promise.all([
      f.save({ calibrationDate: '2026-12-01' }),
      f.save({ calibrationDate: '2026-11-01' }),
    ]);
    expect(newer.status).toHaveBeenCalledWith(201);
    expect(older.status).toHaveBeenCalledWith(201);
    expect(f.records).toHaveLength(2);
    expect(f.master).toMatchObject({
      status: 'scrapped',
      last_calibration_date: '2026-12-01',
      next_calibration_date: '2027-12-01',
    });
  });
  test.each([{ calibrationDate: '2026-02-30' }, { nextDueDate: '2026-01-01' }, { result: null }])(
    'invalid calibration input %j is rejected before opening a transaction',
    async (body) => {
      const f = fixture();
      const response = await f.save(body);
      expect(response.status).toHaveBeenCalledWith(400);
      expect(f.connections).toHaveLength(0);
    }
  );
});

describe('MF-05 stored subgroup identity', () => {
  test('Xbar and range data preserve noncontiguous subgroup IDs and values', async () => {
    const rows = [1, 6, 20].flatMap((subgroup_no, index) =>
      [1, 2, 3, 4, 5].map((sample_no) => ({
        subgroup_no,
        sample_no,
        measured_value: 10 + index + sample_no / 10,
      }))
    );
    db.query.mockImplementation(async (sql) => ({
      rows: /FROM spc_control_plans/.test(sql) ? [{ id: 7, usl: 15, lsl: 5 }] : rows,
    }));
    const response = res();
    await spc.getControlChart({ params: { id: 7 } }, response);
    const data = response.json.mock.calls[0][0].data;
    expect(data.chart.xbarChart.data.map((point) => point.subgroup)).toEqual([1, 6, 20]);
    expect(data.chart.rChart.data.map((point) => point.subgroup)).toEqual([1, 6, 20]);
    expect(data.chart.xbarChart.data.map((point) => point.value)).toEqual([10.3, 11.3, 12.3]);
    expect(data.chart.rChart.data.map((point) => point.value)).toEqual([0.4, 0.4, 0.4]);
  });
});

describe('MF-06 material totals and shared stock projection', () => {
  function fixture(
    details = [
      { bom_detail_id: 1, material_id: 7, unit_quantity: 1 },
      { bom_detail_id: 2, material_id: 7, unit_quantity: 1 },
    ],
    stock = 15,
    quantity = 10
  ) {
    db.pool.query.mockImplementation(async (sql, params) => {
      if (/FROM production_tasks/.test(sql))
        return [[{ id: params[0], code: `TASK-${params[0]}`, product_id: 3, quantity }]];
      if (/FROM bom_masters/.test(sql)) return [[{ id: 2 }]];
      if (/FROM bom_details/.test(sql)) return [details];
      if (/FROM inventory_stock_balances/.test(sql))
        return [[{ material_id: 7, available_qty: stock }]];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
  }
  test('two BOM rows requiring ten units each see the five-unit shortage in stock fifteen', async () => {
    fixture();
    const result = await readiness.checkByTask(42);
    expect(result).toMatchObject({ ready: false, totalItems: 1, readyItems: 0, shortageItems: 1 });
    expect(result.details).toEqual([
      expect.objectContaining({
        material_id: 7,
        bom_detail_ids: [1, 2],
        unit_quantity: 2,
        required_qty: 20,
        available_qty: 15,
        shortage_qty: 5,
      }),
    ]);
  });
  test('exact aggregate stock is sufficient even with decimal unit consumption', async () => {
    fixture(
      [
        { bom_detail_id: 1, material_id: 7, unit_quantity: 0.1 },
        { bom_detail_id: 2, material_id: 7, unit_quantity: 0.2 },
      ],
      0.3,
      1
    );
    const result = await readiness.checkByTask(42);
    expect(result.ready).toBe(true);
    expect(result.details[0]).toMatchObject({ required_qty: 0.3, shortage_qty: 0 });
  });
  test('different materials do not borrow each other stock', async () => {
    fixture([
      { bom_detail_id: 1, material_id: 7, unit_quantity: 1 },
      { bom_detail_id: 2, material_id: 8, unit_quantity: 1 },
    ]);
    const result = await readiness.checkByTask(42);
    expect(result).toMatchObject({ totalItems: 2, readyItems: 1, shortageItems: 1 });
    expect(result.details[1].shortage_qty).toBe(10);
  });
  test('batch projection allocates a shared stock only once in requested priority order', async () => {
    fixture([{ bom_detail_id: 1, material_id: 7, unit_quantity: 1 }]);
    const results = await readiness.checkBatch([42, 43, 42]);
    expect(results.map((row) => row.ready)).toEqual([true, false]);
    expect(results[1].details[0]).toMatchObject({
      available_qty: 5,
      required_qty: 10,
      shortage_qty: 5,
    });
    expect(db.pool.query.mock.calls.some(([sql]) => /UPDATE|INSERT/.test(sql))).toBe(false);
  });
});
