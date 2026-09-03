const {
  qualityInspectionItemMap,
  MAX_QUALITY_MEASUREMENT_SAMPLES,
} = require('../../src/utils/quality/qualityFieldMap');

describe('quality measurement field contract', () => {
  test('preserves six dynamic measurement samples in both directions', () => {
    expect(MAX_QUALITY_MEASUREMENT_SAMPLES).toBe(6);

    const values = [1, 2, 3, 4, 5, 6];
    const apiRow = qualityInspectionItemMap.fromApi({ measurements: values });
    expect(apiRow.measurements).toHaveLength(6);
    expect(apiRow.measurements.map((item) => item.measured_value)).toEqual(values);

    const uiRow = qualityInspectionItemMap.toApi({
      measurements: values.map((value) => ({ measured_value: value })),
    });
    expect(uiRow.measurements).toHaveLength(6);
    expect(uiRow.measurements.map((item) => item.measured_value)).toEqual(values);
  });
});
