jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const { bindInspectionItems } = require('../../src/utils/quality/inspectionSnapshot');
const { assertMeasurementVerdict } = require('../../src/utils/quality/inspectionEvidence');
const readiness = require('../../src/services/business/FinalInspectionReadinessService');
const release = require('../../src/services/business/FinalInspectionReleaseService');
const QualityInspection = require('../../src/models/qualityInspection');
const item = { id: 2, item_name: '尺寸', dimension_value: 10, tolerance_upper: 0.1, tolerance_lower: -0.1, is_critical: 1, result: 'passed', measure_1: 10 };

test.each([{}, { actual_value: '' }, { actual_value: 'abc' }, { measure_1: 'NaN' }, { measurements: [{ measured_value: '' }] }])('numeric completion requires real evidence %j', evidence => {
  expect(() => assertMeasurementVerdict({ ...item, measure_1: null, ...evidence }, false)).toThrow();
});
test.each(['>=10 N', '10±0.1 mm', '9.9~10.1 mm'])('text numeric standards require evidence: %s', standard => {
  expect(() => assertMeasurementVerdict({ standard, result: 'passed' }, false)).toThrow('实测');
});
test('text lower bound is not treated as equality', () => {
  expect(() => assertMeasurementVerdict({ standard: '≥10N', actual_value: 11 }, false)).not.toThrow();
  expect(() => assertMeasurementVerdict({ standard: '≥10N', actual_value: 9 }, false)).toThrow('超差');
});
test('qualitative standard is not forced to have numeric measurements', () => {
  expect(() => assertMeasurementVerdict({ standard: '无破损', result: 'passed' }, false)).not.toThrow();
});
test.each([{ dimension_value: 20 }, { dimension_value: null }, { tolerance_upper: 100 }, { is_critical: false }, { standard: '合格' }, { type: 'visual' }])('cannot tamper with approved snapshot %j', change => {
  expect(() => bindInspectionItems([item], [{ id: 2, ...change }])).toThrow('不能修改');
});
test.each([[], [{ id: 3 }], [{ id: 2 }, { id: 2 }]].map(submitted => ({ submitted })))('cannot omit or replace projects %j', ({ submitted }) => {
  expect(() => bindInspectionItems([item], submitted)).toThrow();
});
test('omitted standards are preserved and still enforce tolerance', () => {
  const bound = bindInspectionItems([item], [{ id: 2, actual_value: 20, result: 'passed' }]);
  expect(bound[0]).toMatchObject({ id: 2, dimension_value: 10, is_critical: 1 });
  expect(() => QualityInspection._validateTerminalStatusAgainstItems({}, 'passed', bound)).toThrow('超差');
});
test('legacy no-ID clients require unique names, never index matching', () => {
  expect(bindInspectionItems([item], [{ item_name: '尺寸', actual_value: 10 }])[0].id).toBe(2);
  expect(() => bindInspectionItems([item, { ...item, id: 3 }], [{ item_name: '尺寸' }, { item_name: '尺寸' }])).toThrow();
});
const inspection = { inspection_type: 'final', task_id: 8, product_id: 3, quantity: 100 };
function connection({ task = {}, unfinished = [], open = [] } = {}) {
  return { query: jest.fn(async sql => {
    if (sql.includes('FROM production_tasks')) return [[{ id: 8, status: 'in_progress', product_id: 3, completed_quantity: 100, ...task }]];
    if (sql.includes('FROM production_processes')) return [unfinished];
    if (sql.includes('FROM quality_inspections')) return [open];
    throw new Error(sql);
  }) };
}
test.each([{ task: { completed_quantity: 0 } }, { unfinished: [{ id: 1 }] }, { open: [{ id: 2 }] }, { task: { status: 'cancelled' } }])('blocks premature final inspection %j', state => {
  return expect(readiness.validate(connection(state), inspection)).rejects.toThrow();
});
test.each(['in_progress', 'inspection', 'warehousing', 'completed'])('allows real production completion and historical reinspection: %s', status => {
  return expect(readiness.validate(connection({ task: { status } }), inspection)).resolves.toBeUndefined();
});
test('production inbound cannot omit inspection even when task and product match', async () => {
  const conn = connection();
  await expect(release.validate(conn, { inbound_type: 'production', reference_id: 8 }, [{ material_id: 3, quantity: 90, batch_number: 'B' }])).rejects.toThrow('终检放行依据');
  expect(conn.query).not.toHaveBeenCalled();
});

test('finance posting rechecks legacy production inbounds against inspection release', async () => {
  const conn = { execute: jest.fn(async () => [[{ id: 4, inbound_type: 'production', status: 'completed' }]]) };
  await expect(release.validatePosting(conn, { source_type: 'inbound', source_id: 4, source_no: 'IN-4', posting_kind: 'movement' },
    [{ material_id: 3, batch_number: 'B', signed_quantity: 90 }])).rejects.toThrow('终检放行依据');
});

test.each(['frontend', 'mobile'])('numeric standard parsing stays aligned with %s', client => {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const source = fs.readFileSync(path.join(__dirname, '../../../', client, 'src/utils/inspectionMeasurement.js'), 'utf8').replace(/export /g, '');
  const parse = vm.runInNewContext(source + '\nparseInspectionStandard');
  const server = require('../../src/utils/quality/inspectionMeasurement').parseInspectionStandard;
  for (const standard of ['≥0.9N.m', '10±0.1mm', '1.5N.m以上', '9.9~10.1mm', '无破损', 'GB/T 2828 抽10只']) {
    const keys = ['mode', 'operator', 'lowerBound', 'upperBound'];
    expect(keys.map(key => server({ standard })[key])).toEqual(keys.map(key => parse({ standard })[key]));
  }
});
