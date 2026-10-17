/* global beforeEach, describe, expect, jest, test */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn(), query: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
jest.mock('../../src/utils/responseHandler', () => ({
  ResponseHandler: { success: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/cache/CacheManager', () => ({ clear: jest.fn() }));
jest.mock('../../src/middleware/authEnhanced', () => ({
  authenticateToken: (req, res, next) => (req.headers.authorization ? next() : res.sendStatus(401)),
}));
jest.mock('../../src/middleware/requirePermission', () => ({
  requirePermission: (permission) => (req, res, next) =>
    req.headers['x-permission'] === permission ? next() : res.sendStatus(403),
}));

const { pool } = require('../../src/config/db');
const { ResponseHandler } = require('../../src/utils/responseHandler');
const controller = require('../../src/controllers/business/production/equipmentController');
const request = require('supertest');
const express = require('express');

describe('equipment record lifecycle without a database', () => {
  let connection;
  let maintenance;
  let failure;
  let equipment;
  let snapshot;
  let failAudit;
  const req = (body) => ({
    params: { id: '31', equipment_id: 8 },
    body,
    user: { id: 7, username: 'operator' },
    method: 'PUT',
  });
  const finishMaintenance = {
    status: 'completed',
    expectedStatus: 'in_progress',
    maintenancePerson: '张工',
    completedDate: '2026-10-01',
    remarks: '更换滤芯并试运行通过',
    cost: 20.5,
  };
  const finishFailure = {
    repairStatus: 'resolved',
    expectedStatus: 'repairing',
    resolvedBy: '李工',
    resolution: '更换电源后试运行通过',
    resolvedDate: '2026-10-01T13:00:00+08:00',
    downtimeHours: 2.5,
    repairCost: 100,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    failAudit = false;
    equipment = { id: 8, status: 'normal' };
    maintenance = {
      id: 31,
      equipment_id: 8,
      status: 'pending',
      maintenance_date: '2026-10-01',
      maintenance_staff: null,
    };
    failure = {
      id: 31,
      equipment_id: 8,
      repair_status: 'reported',
      failure_date: '2026-10-01T10:00:00+08:00',
    };
    connection = {
      beginTransaction: jest.fn(async () => {
        snapshot = { maintenance: { ...maintenance }, failure: { ...failure } };
      }),
      commit: jest.fn(),
      rollback: jest.fn(async () => {
        maintenance = snapshot.maintenance;
        failure = snapshot.failure;
      }),
      release: jest.fn(),
      query: jest.fn(async (sql, values) => {
        const record = sql.includes('equipment_maintenance') ? maintenance : failure;
        if (sql.startsWith('SELECT equipment_id')) return [[{ equipment_id: 8 }]];
        if (sql.startsWith('SELECT id')) return [equipment ? [equipment] : []];
        if (sql.startsWith('SELECT *')) return [[{ ...record }]];
        if (sql.startsWith('UPDATE equipment_')) {
          const fields = sql
            .match(/SET (.+), updated_at/s)[1]
            .split(', ')
            .map((part) => part.split(' = ')[0]);
          for (const [index, field] of fields.entries()) record[field] = values[index];
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('INSERT INTO audit_logs')) {
          if (failAudit) throw new Error('audit storage unavailable');
          return [{ insertId: 901 }];
        }
        if (sql.startsWith('INSERT INTO equipment_')) return [{ insertId: 31 }];
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };
    pool.getConnection.mockResolvedValue(connection);
  });

  test('starts and completes the same maintenance record with executor, results and transactional audit', async () => {
    await controller.updateMaintenanceRecord(
      req({ status: 'in_progress', expectedStatus: 'pending', maintenancePerson: '张工' }),
      {}
    );
    expect(maintenance.status).toBe('in_progress');
    await controller.updateMaintenanceRecord(req(finishMaintenance), {});
    expect(maintenance).toMatchObject({
      id: 31,
      status: 'completed',
      maintenance_staff: '张工',
      completed_date: '2026-10-01',
      cost: 20.5,
      remarks: finishMaintenance.remarks,
    });
    const audits = connection.query.mock.calls.filter(([sql]) =>
      sql.startsWith('INSERT INTO audit_logs')
    );
    expect(audits).toHaveLength(2);
    expect(audits[1][1].slice(0, 4)).toEqual([7, 'operator', 'production', 'update']);
    expect(JSON.parse(audits[1][1][8]).status).toBe('in_progress');
    expect(JSON.parse(audits[1][1][9]).status).toBe('completed');
    expect(connection.query.mock.calls[1][0]).toContain(
      'equipment WHERE id = ? AND deleted_at IS NULL FOR UPDATE'
    );
    expect(connection.query.mock.calls[2][0]).toContain('FOR UPDATE');
    expect(
      connection.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO equipment_'))
    ).toBe(false);
    expect(connection.commit).toHaveBeenCalledTimes(2);
    expect(connection.release).toHaveBeenCalledTimes(2);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test.each([
    ['pending', { status: 'completed', remarks: '试运行通过' }],
    ['completed', { status: 'completed', remarks: '覆盖第一次结果' }],
    ['completed', { status: 'in_progress' }],
    ['in_progress', { status: 'in_progress' }],
    ['in_progress', { ...finishMaintenance, expectedStatus: 'pending' }],
  ])('rejects invalid, stale or duplicate maintenance transition from %s', async (status, body) => {
    maintenance.status = status;
    await controller.updateMaintenanceRecord(req({ maintenancePerson: '张工', ...body }), {});
    expect(ResponseHandler.error).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      'CONFLICT',
      409,
      expect.anything()
    );
    expect(connection.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  test.each([
    { maintenancePerson: '   ' },
    { remarks: '' },
    { cost: -1 },
    { cost: 'Infinity' },
    { cost: '1.234' },
    { completedDate: '2026-02-30' },
    { completedDate: '2026-09-30' },
    { completedDate: '2999-01-01' },
    { nextMaintenanceDate: '2026-09-30' },
  ])('rejects incomplete or invalid maintenance evidence %j', async (invalid) => {
    maintenance.status = 'in_progress';
    await controller.updateMaintenanceRecord(req({ ...finishMaintenance, ...invalid }), {});
    expect(ResponseHandler.error.mock.calls[0].slice(2, 4)).toEqual(['VALIDATION_ERROR', 400]);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('can clear an obsolete next-maintenance date when finishing', async () => {
    maintenance.status = 'in_progress';
    maintenance.next_maintenance_date = '2026-09-01';
    await controller.updateMaintenanceRecord(
      req({ ...finishMaintenance, nextMaintenanceDate: null }),
      {}
    );
    expect(maintenance.next_maintenance_date).toBeNull();
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  test('failure diagnosing, repairing, unresolved retry and resolution keep one record and all repair facts', async () => {
    for (const status of ['diagnosing', 'repairing', 'unresolved', 'repairing']) {
      await controller.updateFailureRecord(
        req({ repairStatus: status, resolvedBy: '李工', resolution: '待备件后继续' }),
        {}
      );
      expect(failure.repair_status).toBe(status);
    }
    await controller.updateFailureRecord(req(finishFailure), {});
    expect(failure).toMatchObject({
      id: 31,
      repair_status: 'resolved',
      resolved_by: '李工',
      downtime_hours: 2.5,
      repair_cost: 100,
      resolution: finishFailure.resolution,
    });
    expect(failure.resolved_date).toEqual(new Date(finishFailure.resolvedDate));
    expect(connection.commit).toHaveBeenCalledTimes(5);
  });

  test.each([
    { resolvedBy: '' },
    { resolution: '' },
    { downtimeHours: -0.5 },
    { repairCost: null },
    { resolvedDate: '2026-10-01T09:00:00+08:00' },
    { resolvedDate: '2026-02-30T10:00:00' },
  ])('failure resolution requires real completion evidence %j', async (invalid) => {
    failure.repair_status = 'repairing';
    await controller.updateFailureRecord(req({ ...finishFailure, ...invalid }), {});
    expect(ResponseHandler.error.mock.calls[0].slice(2, 4)).toEqual(['VALIDATION_ERROR', 400]);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('cannot resolve an unstarted report or overwrite a resolved repair', async () => {
    await controller.updateFailureRecord(req(finishFailure), {});
    failure.repair_status = 'resolved';
    await controller.updateFailureRecord(req({ ...finishFailure, expectedStatus: 'resolved' }), {});
    expect(ResponseHandler.error.mock.calls.map((call) => call[3])).toEqual([409, 409]);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('audit failure rolls back changed state and does not report success', async () => {
    failAudit = true;
    await controller.updateMaintenanceRecord(
      req({ status: 'in_progress', maintenancePerson: '张工' }),
      {}
    );
    expect(maintenance.status).toBe('pending');
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(ResponseHandler.success).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test('missing equipment and scrapped equipment cannot start new work', async () => {
    equipment = null;
    await controller.updateMaintenanceRecord(
      req({ status: 'in_progress', maintenancePerson: '张工' }),
      {}
    );
    equipment = { id: 8, status: 'scrapped' };
    await controller.updateFailureRecord(
      req({ repairStatus: 'repairing', resolvedBy: '李工' }),
      {}
    );
    expect(ResponseHandler.error.mock.calls.map((call) => call[3])).toEqual([404, 409]);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test.each(['offline', 'scrapped', 'repair'])(
    'completing work never changes %s equipment master status',
    async (status) => {
      equipment.status = status;
      maintenance.status = 'in_progress';
      await controller.updateMaintenanceRecord(req(finishMaintenance), {});
      expect(connection.commit).toHaveBeenCalledTimes(1);
      expect(equipment.status).toBe(status);
      expect(connection.query.mock.calls.some(([sql]) => /^UPDATE equipment SET/.test(sql))).toBe(
        false
      );
    }
  );

  test('historical maintenance completion writes its existing completion column after shared validation', async () => {
    await controller.addMaintenanceRecord(
      req({ ...finishMaintenance, maintenanceType: 'routine', maintenanceDate: '2026-10-01' }),
      {}
    );
    const insert = connection.query.mock.calls.find(([sql]) =>
      sql.startsWith('INSERT INTO equipment_maintenance')
    );
    expect(insert[0]).toContain('completed_date');
    expect(insert[1]).toEqual([
      8,
      'routine',
      '2026-10-01',
      '张工',
      undefined,
      20.5,
      undefined,
      undefined,
      'completed',
      finishMaintenance.remarks,
      '2026-10-01',
    ]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  test('optional empty next-maintenance date from the mobile plan is stored as SQL null', async () => {
    await controller.addMaintenanceRecord(
      req({
        maintenanceType: 'routine',
        maintenanceDate: '2026-10-01',
        nextMaintenanceDate: '',
        status: 'pending',
      }),
      {}
    );
    const insert = connection.query.mock.calls.find(([sql]) =>
      sql.startsWith('INSERT INTO equipment_maintenance')
    );
    expect(insert[1][7]).toBeNull();
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  test('historical resolved repair persists repair details in one transaction', async () => {
    await controller.addFailureRecord(
      req({ ...finishFailure, failureDate: '2026-10-01T10:00:00+08:00', description: '电源异常' }),
      {}
    );
    const insert = connection.query.mock.calls.find(([sql]) =>
      sql.startsWith('INSERT INTO equipment_failure')
    );
    expect(insert[1].slice(5, 11)).toEqual([
      'resolved',
      finishFailure.resolution,
      new Date(finishFailure.resolvedDate),
      '李工',
      2.5,
      100,
    ]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  test.each(['maintenance', 'failure'])(
    'creation cannot bypass %s completion evidence',
    async (kind) => {
      if (kind === 'maintenance')
        await controller.addMaintenanceRecord(
          req({ maintenanceType: 'routine', maintenanceDate: '2026-10-01', status: 'completed' }),
          {}
        );
      else await controller.addFailureRecord(req({ repairStatus: 'resolved' }), {});
      expect(ResponseHandler.error.mock.calls[0].slice(2, 4)).toEqual(['VALIDATION_ERROR', 400]);
      expect(pool.getConnection).not.toHaveBeenCalled();
    }
  );

  test.each(['maintenance', 'failure'])(
    'historical %s completion requires an explicit completion date',
    async (kind) => {
      if (kind === 'maintenance') {
        await controller.addMaintenanceRecord(
          req({
            ...finishMaintenance,
            completedDate: undefined,
            maintenanceType: 'routine',
            maintenanceDate: '2026-10-01',
          }),
          {}
        );
      } else {
        await controller.addFailureRecord(
          req({
            ...finishFailure,
            resolvedDate: undefined,
            failureDate: '2026-10-01T10:00:00+08:00',
          }),
          {}
        );
      }
      expect(ResponseHandler.error.mock.calls[0].slice(2, 4)).toEqual(['VALIDATION_ERROR', 400]);
      expect(pool.getConnection).not.toHaveBeenCalled();
    }
  );

  test.each(['maintenance', 'failure'])(
    'creation cannot start %s work on scrapped equipment',
    async (kind) => {
      equipment.status = 'scrapped';
      if (kind === 'maintenance') {
        await controller.addMaintenanceRecord(
          req({
            status: 'in_progress',
            maintenancePerson: '张工',
            maintenanceType: 'routine',
            maintenanceDate: '2026-10-01',
          }),
          {}
        );
      } else {
        await controller.addFailureRecord(
          req({ repairStatus: 'repairing', resolvedBy: '李工' }),
          {}
        );
      }
      expect(ResponseHandler.error.mock.calls[0].slice(2, 4)).toEqual(['CONFLICT', 409]);
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledTimes(1);
    }
  );

  test.each(['/maintenance/31', '/failures/31'])(
    'record endpoint %s requires authentication and equipment update permission',
    async (path) => {
      const app = express();
      app.use('/equipment', require('../../src/routes/equipmentRoutes'));
      await request(app).put(`/equipment${path}`).expect(401);
      await request(app)
        .put(`/equipment${path}`)
        .set('Authorization', 'signed')
        .set('x-permission', 'production:equipment:view')
        .expect(403);
      expect(pool.getConnection).not.toHaveBeenCalled();
    }
  );
});
