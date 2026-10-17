/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn(), getConnection: jest.fn() }, getConnection: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
jest.mock('../../src/utils/responseHandler', () => ({ ResponseHandler: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/services/cache/CacheManager', () => ({
  get: jest.fn(), set: jest.fn(), delete: jest.fn(), deleteByPrefix: jest.fn(), clear: jest.fn(),
}));

const { pool, getConnection } = require('../../src/config/db');
const { ResponseHandler } = require('../../src/utils/responseHandler');
const controller = require('../../src/controllers/business/production/equipmentController');
const MonitoringService = require('../../src/services/business/EquipmentMonitoringService');
const cache = require('../../src/services/cache/CacheManager');

describe('equipment API and canonical storage contract', () => {
  let connection;
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockImplementation(async (sql) => {
      if (/SELECT id(?:, status)? FROM equipment/.test(sql)) return [[{ id: 8 }]];
      if (/INSERT INTO/.test(sql)) return [{ insertId: 31 }];
      if (/COUNT\(\*\)/.test(sql)) return [[{ total: 1 }]];
      return [[]];
    });
    connection = {
      beginTransaction: jest.fn().mockResolvedValue(), commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(), release: jest.fn(), query: pool.query,
    };
    pool.getConnection.mockResolvedValue(connection);
  });

  test('maintenance input keeps mobile field names while writing canonical staff and state', async () => {
    await controller.addMaintenanceRecord({ params: { equipment_id: 8 }, body: {
      maintenanceType: '定期保养', maintenanceDate: '2026-09-18', maintenancePerson: '技术员',
      status: 'planned', nextMaintenanceDate: '2026-10-18', remarks: '复查',
    } }, {});
    const [sql, values] = pool.query.mock.calls.find(([query]) => /INSERT INTO equipment_maintenance/.test(query));
    expect(sql).toContain('maintenance_staff');
    expect(sql).not.toContain('maintenance_person');
    expect(values).toEqual([8, 'preventive', '2026-09-18', '技术员', undefined, undefined, undefined, '2026-10-18', 'pending', '复查', null]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
  });

  test.each([['normal', 'pass'], ['abnormal', 'fail'], ['conditional_pass', 'conditional_pass']])(
    'inspection result %s persists as %s', async (result, expected) => {
      await controller.addInspectionRecord({ params: { equipment_id: 8 }, body: {
        inspectionDate: '2026-09-18', inspector: '检查员', inspectionType: 'daily',
        result, inspectionItems: '紧固检查', abnormalItems: '松动',
      } }, {});
      const [sql, values] = pool.query.mock.calls.find(([query]) => /INSERT INTO equipment_inspection/.test(query));
      expect(sql).toContain('inspection_result');
      expect(values.slice(0, 7)).toEqual([8, '2026-09-18', '检查员', 'daily', '紧固检查', expected, '松动']);
      expect(connection.commit).toHaveBeenCalledTimes(1);
    }
  );

  test('invalid maintenance type never reaches a write', async () => {
    await controller.addMaintenanceRecord({ params: { equipment_id: 8 }, body: {
      maintenanceType: 'unknown', maintenanceDate: '2026-09-18',
    } }, {});
    expect(ResponseHandler.error.mock.calls[0]?.slice(2, 4)).toEqual(['VALIDATION_ERROR', 400]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('maintenance search queries the staff column and preserves its API alias', async () => {
    await controller.getMaintenanceRecords({ query: { search: '技术员', status: 'planned' } }, {});
    const list = pool.query.mock.calls.find(([sql]) => /SELECT em\./.test(sql));
    expect(list[0]).toContain('em.maintenance_staff AS maintenance_person');
    expect(list[0]).toContain('em.maintenance_staff LIKE ?');
    expect(list[1][0]).toBe('pending');
  });

  test('omitted failure date is captured when a mobile report is submitted', async () => {
    await controller.addFailureRecord({ params: { equipment_id: 8 }, body: { description: '停机' } }, {});
    const values = pool.query.mock.calls.find(([sql]) => /INSERT INTO equipment_failure/.test(sql))[1];
    expect(values[1]).toBeInstanceOf(Date);
  });

  test('inspection schedule failure rolls back its record and releases the same connection', async () => {
    connection.query.mockImplementation(async (sql) => {
      if (/SELECT id FROM equipment/.test(sql)) return [[{ id: 8 }]];
      if (/INSERT INTO equipment_inspection/.test(sql)) return [{ insertId: 31 }];
      throw new Error('schedule update failed');
    });
    await controller.addInspectionRecord({ params: { equipment_id: 8 }, body: {
      inspectionDate: '2026-09-18', inspector: '检查员', result: 'pass',
    } }, {});
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test('maintenance write failure rolls back without confirming creation', async () => {
    connection.query.mockResolvedValueOnce([[{ id: 8 }]]).mockRejectedValueOnce(new Error('write failed'));
    await controller.addMaintenanceRecord({ params: { equipment_id: 8 }, body: {
      maintenanceType: 'routine', maintenanceDate: '2026-09-18',
    } }, {});
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});

describe('equipment status monitoring transaction', () => {
  let connection;
  beforeEach(() => {
    jest.clearAllMocks();
    connection = {
      beginTransaction: jest.fn().mockResolvedValue(), commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(), release: jest.fn(),
      execute: jest.fn(async (sql) => /SELECT status/.test(sql) ? [[{ status: 'normal' }]] : [{ affectedRows: 1 }]),
    };
    getConnection.mockResolvedValue(connection);
  });

  test('normalizes legacy status and locks the active equipment before writing matching history', async () => {
    await MonitoringService.updateEquipmentStatus(8, 'fault', '故障', 7);
    expect(connection.execute.mock.calls[0][0]).toContain('deleted_at IS NULL FOR UPDATE');
    const history = connection.execute.mock.calls.find(([sql]) => /INSERT INTO equipment_status_history/.test(sql));
    expect(history[1]).toEqual([8, 'normal', 'repair', '故障', 7]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(cache.delete).toHaveBeenCalledWith('equipment_statistics');
  });

  test('deleted or missing equipment cannot acquire a new status history', async () => {
    connection.execute.mockResolvedValueOnce([[]]);
    await expect(MonitoringService.updateEquipmentStatus(8, 'normal')).rejects.toThrow('设备不存在');
    expect(connection.execute).toHaveBeenCalledTimes(1);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('invalid status is rejected before a database connection is acquired', async () => {
    await expect(MonitoringService.updateEquipmentStatus(8, 'unknown')).rejects.toThrow('无效的设备状态');
    expect(getConnection).not.toHaveBeenCalled();
  });
});
