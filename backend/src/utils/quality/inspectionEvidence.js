'use strict';

const decimalOrNull = (value) => {
  if (value == null || String(value).trim() === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    const error = new Error('检验测量值必须是有效数字');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  return number;
};

function fixedMeasurements(item) {
  return Array.from({ length: 6 }, (_, index) =>
    decimalOrNull(item[`measure_${index + 1}`] ?? item[`measure${index + 1}`])
  );
}

function assertMeasurementVerdict(item, fail) {
  const {
    parseInspectionStandard,
    compareInspectionMeasurement,
  } = require('./inspectionMeasurement');
  const rule = parseInspectionStandard(item);
  if (rule.mode !== 'numeric') return;
  const values = [
    ...fixedMeasurements(item),
    ...(item.measurements || []).map((m) =>
      decimalOrNull(m.measured_value ?? m.measuredValue ?? m.value)
    ),
  ].filter((value) => value != null);
  const actual = item.actual_value ?? item.actualValue;
  if (actual != null && String(actual).trim() !== '') values.push(decimalOrNull(actual));
  if (!values.length) {
    const error = new Error('数值检验项目必须填写有效实测值后才能结案');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  if (
    values.some((value) => compareInspectionMeasurement(item, value).qualified === false) &&
    !fail
  ) {
    const error = new Error(
      `检验项目“${item.item_name || item.itemName || ''}”实测值超差，不能判定合格`
    );
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
}

module.exports = { decimalOrNull, fixedMeasurements, assertMeasurementVerdict };
