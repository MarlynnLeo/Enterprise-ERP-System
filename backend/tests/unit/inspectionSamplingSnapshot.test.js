jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/business/InspectionTemplateResolverService', () => ({
  getInspectionMaterialId: jest.fn(() => null),
  findMatchingTemplate: jest.fn(async () => null),
  createValidationError: (message) =>
    Object.assign(new Error(message), { statusCode: 400, code: 'VALIDATION_ERROR' }),
}));
jest.mock('../../src/services/quality/InspectionLockService', () => ({
  lockPurchaseOrder: jest.fn(async () => null),
  getForUpdate: jest.fn(),
}));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  denyUnlessAccess: jest.fn(async () => true),
}));

const QualityInspection = require('../../src/models/qualityInspection');
const InspectionSamplingService = require('../../src/services/quality/InspectionSamplingService');
const InspectionLockService = require('../../src/services/quality/InspectionLockService');
const InspectionService = require('../../src/services/quality/inspectionService');
const InspectionClosureService = require('../../src/services/quality/InspectionClosureService');
const InspectionTemplateResolver = require('../../src/services/business/InspectionTemplateResolverService');
const { qualityInspectionMap } = require('../../src/utils/quality/qualityFieldMap');
const db = require('../../src/config/db');

const rule = (overrides = {}) => ({
  id: 12,
  name: 'GB/T 2828.1 (II) AQL1.0 - 501~1200',
  batch_min: 501,
  batch_max: 1200,
  sample_size: 80,
  aql_level: '1.0',
  accept_limit: 2,
  reject_limit: 3,
  ...overrides,
});
const inspection = (overrides = {}) => ({
  id: 7,
  inspection_no: 'QI-SAMPLING-7',
  inspection_type: 'process',
  batch_no: 'BATCH-7',
  quantity: 1000,
  unit: '个',
  planned_date: '2026-09-27',
  inspector_id: 8,
  status: 'pending',
  is_aql: 1,
  is_full_inspection: 0,
  aql_standard_id: 12,
  aql_level: '1.0',
  sample_quantity: 80,
  sampling_plan: 'GB/T 2828.1 (II) AQL1.0 - 501~1200',
  accept_limit: 2,
  reject_limit: 3,
  items: [{ item_name: '外观', standard: '无缺陷', type: 'visual', result: 'passed' }],
  ...overrides,
});

function connectionFor(selectedRule = rule()) {
  return {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    query: jest.fn(async (sql) => {
      if (sql.includes('FROM nonconforming_products') || sql.includes('FROM inventory_inbound')) return [[]];
      if (sql.includes('FROM quality_aql_standards')) return [selectedRule ? [selectedRule] : []];
      if (sql.includes('INSERT INTO quality_inspections')) return [{ insertId: 7 }];
      if (sql.includes('INSERT INTO quality_inspection_items')) return [{ insertId: 70 }];
      if (sql.includes('FROM quality_inspection_items')) return [inspection().items];
      if (sql.includes('UPDATE quality_inspections')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query: ${sql}`);
    }),
    execute: jest.fn(async () => [{ affectedRows: 1 }]),
  };
}

function samplingWrites(connection) {
  return [...connection.query.mock.calls, ...connection.execute.mock.calls]
    .filter(([sql]) => sql.includes('UPDATE quality_inspections'))
    .map(([sql, values]) => {
      const fields = sql.match(/SET\s+([\s\S]+?)\s+WHERE/)[1].split(',');
      return Object.fromEntries(
        fields.map((field, index) => [field.split('=')[0].trim(), values[index]])
      );
    });
}

describe('inspection sampling snapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    InspectionLockService.getForUpdate.mockResolvedValue(inspection());
  });

  test('stores the selected server rule and keeps batch quantity at 1000 on creation', async () => {
    const connection = connectionFor();
    db.pool.getConnection.mockResolvedValue(connection);
    const result = await QualityInspection.createInspection(
      inspection({ sample_quantity: 1000, accept_limit: 999, reject_limit: 1000 })
    );

    expect(result).toMatchObject({
      quantity: 1000,
      sample_quantity: 80,
      sampling_plan: rule().name,
      accept_limit: 2,
      reject_limit: 3,
    });
    expect(samplingWrites(connection)).toContainEqual(
      expect.objectContaining({
        aql_standard_id: 12,
        sample_quantity: 80,
        sampling_plan: rule().name,
        accept_limit: 2,
        reject_limit: 3,
      })
    );
    const insert = connection.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO quality_inspections')
    );
    expect(insert[1][15]).toBe(1000);
    expect(connection.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'active'"),
      [12]
    );
    expect(
      connection.query.mock.calls.find(([sql]) => sql.includes('quality_aql_standards'))[0]
    ).toContain('FOR UPDATE');
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  test('revalidates a changed selection and ignores client sample/Ac/Re on update', async () => {
    const connection = connectionFor(rule({ id: 13, sample_size: 125, aql_level: '0.65' }));
    const result = await QualityInspection.updateInspection(
      7,
      {
        aql_standard_id: 13,
        aql_level: '0.65',
        sample_quantity: 1000,
        sampling_plan: '客户端伪造方案',
        accept_limit: 999,
        reject_limit: 1000,
      },
      connection
    );
    expect(result).toMatchObject({
      sample_quantity: 125,
      sampling_plan: rule().name,
      accept_limit: 2,
      reject_limit: 3,
    });
    expect(samplingWrites(connection)[0]).toMatchObject({
      sample_quantity: 125,
      aql_standard_id: 13,
    });
    expect(db.pool.getConnection).not.toHaveBeenCalled();
  });

  test.each([
    ['missing or inactive rule', null, {}],
    ['batch outside the selected range', rule(), { quantity: 1500 }],
    ['different AQL level', rule(), { aql_level: '0.65' }],
    ['invalid sample size', rule({ sample_size: 0 }), {}],
    ['invalid rejection threshold', rule({ reject_limit: 2 }), {}],
  ])('rejects %s and rolls back creation', async (_label, selectedRule, values) => {
    const connection = connectionFor(selectedRule);
    db.pool.getConnection.mockResolvedValue(connection);
    await expect(QualityInspection.createInspection(inspection(values))).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('caps a configured sample at batch size', async () => {
    const connection = connectionFor(rule({ batch_min: 1, sample_size: 80 }));
    await expect(
      InspectionSamplingService.resolve(connection, inspection({ quantity: 5 }))
    ).resolves.toMatchObject({ sample_quantity: 5 });
  });

  test('only explicit full inspection records the whole quantity, including fractional units', async () => {
    const connection = connectionFor();
    await expect(
      InspectionSamplingService.resolve(connection, inspection({ is_aql: 0 }))
    ).resolves.toMatchObject({
      sample_quantity: null,
      aql_standard_id: null,
      aql_level: null,
      accept_limit: null,
      reject_limit: null,
    });
    await expect(
      InspectionSamplingService.resolve(
        connection,
        inspection({ is_full_inspection: true, is_aql: 0, quantity: 12.25 })
      )
    ).resolves.toMatchObject({
      sample_quantity: 12.25,
      is_aql: 0,
      aql_standard_id: null,
      aql_level: null,
    });
    expect(connection.query).not.toHaveBeenCalled();
  });

  test('clears sampling evidence when AQL is disabled without marking full inspection', async () => {
    const connection = connectionFor();
    await QualityInspection.updateInspection(7, { is_aql: false }, connection);
    expect(samplingWrites(connection)[0]).toMatchObject({
      is_aql: 0,
      is_full_inspection: 0,
      sample_quantity: null,
      sampling_plan: null,
      aql_standard_id: null,
      aql_level: null,
      accept_limit: null,
      reject_limit: null,
    });
    expect(connection.query).not.toHaveBeenCalled();
  });

  test('keeps an auto-created inspection without a selected rule unrecorded', async () => {
    const connection = connectionFor();
    const result = await QualityInspection.createInspection(
      inspection({ aql_standard_id: null }),
      connection
    );
    expect(result).toMatchObject({
      is_aql: 1,
      sample_quantity: null,
      accept_limit: null,
      reject_limit: null,
    });
    expect(
      connection.query.mock.calls.some(([sql]) => sql.includes('FROM quality_aql_standards'))
    ).toBe(false);
  });

  test.each(['passed', 'failed', 'partial', 'completed'])(
    'rejects creation in %s without an AQL selection and rolls back',
    async (status) => {
      const connection = connectionFor();
      db.pool.getConnection.mockResolvedValue(connection);
      await expect(
        QualityInspection.createInspection(inspection({ status, aql_standard_id: null }))
      ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledTimes(1);
    }
  );

  test.each([
    ['missing selection', { aql_standard_id: null }],
    ['missing sample', { sample_quantity: null }],
    ['sample greater than batch', { sample_quantity: 1001 }],
    ['missing Ac', { accept_limit: null }],
    ['invalid Re', { reject_limit: 2 }],
  ])('blocks a new completed result with %s before writing or closing', async (_label, values) => {
    InspectionLockService.getForUpdate.mockResolvedValue(inspection(values));
    const connection = connectionFor();
    const close = jest.spyOn(InspectionClosureService, 'closeIfTerminal');
    await expect(
      QualityInspection.updateInspection(7, { status: 'completed' }, connection)
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(connection.execute).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  test.each(['incoming', 'process', 'final', 'first_article'])(
    'the status endpoint blocks %s completion without a recorded sample',
    async (inspection_type) => {
      InspectionLockService.getForUpdate.mockResolvedValue(
        inspection({ inspection_type, source_type: 'outsourced_receipt', sample_quantity: null })
      );
      const connection = connectionFor();
      db.pool.getConnection.mockResolvedValue(connection);
      const close = jest.spyOn(InspectionClosureService, 'closeIfTerminal');
      await expect(
        InspectionService.updateInspectionStatusAndTrace(7, { status: 'passed' })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledTimes(1);
      expect(connection.execute).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
    }
  );

  test.each([
    { quantity: 1200 },
    { is_aql: false },
    { is_full_inspection: true, is_aql: false },
    { aql_standard_id: 13 },
    { aql_level: '0.65' },
  ])('locks historical sampling inputs against %p', async (values) => {
    InspectionLockService.getForUpdate.mockResolvedValue(inspection({ status: 'passed' }));
    const connection = connectionFor();
    await expect(QualityInspection.updateInspection(7, values, connection)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(connection.query).not.toHaveBeenCalled();
    expect(connection.execute).not.toHaveBeenCalled();
  });

  test('cannot reopen a completed sampled inspection to replace its historical rule', async () => {
    InspectionLockService.getForUpdate.mockResolvedValue(inspection({ status: 'passed' }));
    const connection = connectionFor();
    await expect(
      QualityInspection.updateInspection(7, { status: 'in_progress' }, connection)
    ).rejects.toThrow('已有抽样依据的已完成检验不能退回待检状态');
    expect(connection.execute).not.toHaveBeenCalled();
  });

  test('rejects conflicting modes instead of silently changing the sample to the whole batch', async () => {
    const connection = connectionFor();
    await expect(
      InspectionSamplingService.resolve(connection, inspection({ is_full_inspection: true }))
    ).rejects.toThrow('全检与 AQL 抽检不能同时启用');
    await expect(
      QualityInspection.updateInspection(7, { is_full_inspection: true }, connection)
    ).rejects.toThrow('全检与 AQL 抽检不能同时启用');
    expect(connection.execute).not.toHaveBeenCalled();
  });

  test('records an explicit switch from AQL to full inspection', async () => {
    const connection = connectionFor();
    await QualityInspection.updateInspection(
      7,
      { is_full_inspection: true, is_aql: false },
      connection
    );
    expect(samplingWrites(connection)[0]).toMatchObject({
      is_full_inspection: 1,
      is_aql: 0,
      sample_quantity: 1000,
      sampling_plan: null,
      aql_standard_id: null,
      accept_limit: null,
      reject_limit: null,
    });
  });

  test('an AQL template does not override an explicitly selected full inspection', async () => {
    InspectionTemplateResolver.findMatchingTemplate.mockResolvedValueOnce({
      id: 3,
      is_aql: 1,
      aql_level: '1.0',
    });
    const connection = connectionFor();
    await expect(
      QualityInspection.createInspection(
        inspection({ is_full_inspection: true, is_aql: false }),
        connection
      )
    ).resolves.toMatchObject({ is_aql: 0, is_full_inspection: 1, sample_quantity: 1000 });
  });

  test('can record an explicitly reselected rule for a pending inspection with no snapshot', async () => {
    InspectionLockService.getForUpdate.mockResolvedValue(inspection({ sample_quantity: null }));
    const connection = connectionFor();
    await QualityInspection.updateInspection(7, { aql_standard_id: 12 }, connection);
    expect(samplingWrites(connection)[0]).toMatchObject({ sample_quantity: 80 });
  });

  test('the status-and-trace endpoint ignores forged client Ac/Re when deciding status', async () => {
    const connection = connectionFor();
    db.pool.getConnection.mockResolvedValue(connection);
    const result = await InspectionService.updateInspectionStatusAndTrace(7, {
      status: 'passed',
      is_aql: true,
      qualified_quantity: 1000,
      unqualified_quantity: 0,
      accept_limit: -1,
      reject_limit: 0,
    });
    expect(result.updatedData.status).toBe('passed');
    expect(samplingWrites(connection)[0]).not.toHaveProperty('accept_limit');
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  test.each([0, 5])(
    'the status endpoint keeps AQL work in progress with %p unqualified units',
    async (unqualified_quantity) => {
      const connection = connectionFor();
      db.pool.getConnection.mockResolvedValue(connection);
      const close = jest.spyOn(InspectionClosureService, 'closeIfTerminal');
      const result = await InspectionService.updateInspectionStatusAndTrace(7, {
        status: 'in_progress',
        is_aql: true,
        unqualified_quantity,
      });
      expect(result.updatedData.status).toBe('in_progress');
      expect(samplingWrites(connection)[0]).toMatchObject({ status: 'in_progress' });
      expect(close).not.toHaveBeenCalled();
      expect(connection.commit).toHaveBeenCalledTimes(1);
    }
  );

  test('the status endpoint accepts an explicit switch to full inspection while still in progress', async () => {
    const connection = connectionFor();
    db.pool.getConnection.mockResolvedValue(connection);
    const result = await InspectionService.updateInspectionStatusAndTrace(7, {
      status: 'in_progress',
      is_aql: false,
      is_full_inspection: true,
    });
    expect(result.updatedData).toMatchObject({
      status: 'in_progress',
      is_aql: 0,
      is_full_inspection: 1,
      sample_quantity: 1000,
    });
  });

  test('the HTTP status controller forwards the selected inspection mode', async () => {
    const controller = require('../../src/controllers/business/quality/inspectionController');
    const connection = connectionFor();
    db.pool.getConnection.mockResolvedValue(connection);
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    await controller.updateInspectionStatusAndTrace(
      {
        params: { id: 7 },
        body: { status: 'in_progress', isAql: false, isFullInspection: true },
      },
      response
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(samplingWrites(connection)[0]).toMatchObject({
      is_aql: 0,
      is_full_inspection: 1,
      sample_quantity: 1000,
    });
  });

  test('the status endpoint resolves a changed sampling rule only once', async () => {
    const connection = connectionFor(rule({ id: 13 }));
    db.pool.getConnection.mockResolvedValue(connection);
    await InspectionService.updateInspectionStatusAndTrace(7, {
      status: 'in_progress',
      aql_standard_id: 13,
    });
    expect(
      connection.query.mock.calls.filter(([sql]) => sql.includes('FROM quality_aql_standards'))
    ).toHaveLength(1);
  });

  test.each([80, null])(
    'preserves a historical snapshot of %p during notes or unchanged form saves',
    async (sample_quantity) => {
      InspectionLockService.getForUpdate.mockResolvedValue(
        inspection({ status: 'passed', sample_quantity, sampling_plan: null })
      );
      const connection = connectionFor(rule({ sample_size: 125 }));
      await QualityInspection.updateInspection(
        7,
        {
          note: '补充备注',
          quantity: '1000',
          is_aql: true,
          aql_standard_id: 12,
          aql_level: 1,
          sample_quantity: 1000,
          sampling_plan: '客户端伪造方案',
          accept_limit: 999,
          reject_limit: 1000,
        },
        connection
      );
      expect(
        connection.query.mock.calls.some(([sql]) => sql.includes('FROM quality_aql_standards'))
      ).toBe(false);
      expect(samplingWrites(connection)[0]).not.toHaveProperty('sample_quantity');
      expect(samplingWrites(connection)[0]).not.toHaveProperty('sampling_plan');
      expect(samplingWrites(connection)[0]).not.toHaveProperty('accept_limit');
    }
  );

  test('maps independent sample quantity and template description, ignoring client sample input', () => {
    expect(
      qualityInspectionMap.toApi({
        quantity: '1000',
        sample_quantity: '80.0000',
        sampling_plan: rule().name,
        template_description: 'CR=0 MAJ=1.0',
        aql_standard_name: 'GB/T 2828.1 (II) AQL1.0 - 501~1200',
        inspector_name: '检验员姓名',
        inspector_signature_code: 'C',
      })
    ).toMatchObject({
      quantity: 1000,
      sampleQuantity: 80,
      samplingPlan: rule().name,
      templateDescription: 'CR=0 MAJ=1.0',
      aqlStandardName: 'GB/T 2828.1 (II) AQL1.0 - 501~1200',
      inspectorName: '检验员姓名',
      inspectorSignatureCode: 'C',
    });
    expect(qualityInspectionMap.toApi({ quantity: 1000 })).toMatchObject({ sampleQuantity: null });
    expect(
      qualityInspectionMap.fromApi({ quantity: 1000, sampleQuantity: 1000, sample_quantity: 1000 })
    ).not.toHaveProperty('sample_quantity');
    expect(
      qualityInspectionMap.fromApi({ samplingPlan: '客户端方案', sampling_plan: '客户端方案' })
    ).not.toHaveProperty('sampling_plan');
    expect(qualityInspectionMap.toApi({ aql_standard_name: '标准的新名称' })).toMatchObject({
      samplingPlan: null,
    });
  });
});
/* global beforeEach, describe, expect, jest, test */
