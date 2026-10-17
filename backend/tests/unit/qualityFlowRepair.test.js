jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));
const QualityInspection = require('../../src/models/qualityInspection');
const {
  fixedMeasurements,
  assertMeasurementVerdict,
} = require('../../src/utils/quality/inspectionEvidence');
const dimension = {
  item_name: '尺寸',
  dimension_value: 10,
  tolerance_upper: 0.1,
  tolerance_lower: -0.1,
  result: 'passed',
};
test('AQL rejected lot cannot partially release inventory', () => {
  expect(() =>
    QualityInspection._validateTerminalStatusAgainstItems(
      { is_aql: 1, reject_limit: 2, unqualified_quantity: 2 },
      'partial',
      [{ result: 'failed' }]
    )
  ).toThrow('AQL');
});
test('AQL rejected lot may close as failed without release', () => {
  expect(() =>
    QualityInspection._validateTerminalStatusAgainstItems(
      { is_aql: 1, reject_limit: 2, unqualified_quantity: 100 },
      'failed',
      [{ result: 'failed' }]
    )
  ).not.toThrow();
});
test.each([0, 9.8, 10.2])('out of tolerance sample %s cannot be passed', (value) => {
  expect(() =>
    QualityInspection._validateTerminalStatusAgainstItems({}, 'passed', [
      { ...dimension, measure_3: value },
    ])
  ).toThrow('超差');
});
test('dynamic measurements receive the same tolerance check', () => {
  expect(() =>
    assertMeasurementVerdict({ ...dimension, measurements: [{ measured_value: 12 }] }, false)
  ).toThrow('超差');
});
test('boundary dimensions pass and negative lower tolerance is supported', () => {
  expect(() =>
    assertMeasurementVerdict({ ...dimension, measure_1: 9.9, measure_2: 10.1 }, false)
  ).not.toThrow();
});
test('failed dimension retains actual out of tolerance evidence', () => {
  expect(() => assertMeasurementVerdict({ ...dimension, measure_1: 12 }, true)).not.toThrow();
});
test('empty qualitative fixed columns become SQL NULL and zero is preserved', () => {
  expect(fixedMeasurements({ measure1: '', measure2: ' ', measure3: 0, measure4: '10' })).toEqual([
    null,
    null,
    0,
    10,
    null,
    null,
  ]);
});
