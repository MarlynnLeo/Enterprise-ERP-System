'use strict';

const BusinessError = require('../BusinessError');
const invalid = (message) =>
  Object.assign(new BusinessError(message, null, 'VALIDATION_ERROR', 400), {
    statusCode: 400,
    code: 'VALIDATION_ERROR',
  });
const standardFields = [
  'item_name',
  'standard',
  'method',
  'type',
  'is_critical',
  'dimension_value',
  'tolerance_upper',
  'tolerance_lower',
];
const evidenceFields = [
  'result',
  'actual_value',
  'remark',
  'remarks',
  'measurements',
  ...Array.from({ length: 6 }, (_, i) => `measure_${i + 1}`),
];
function comparable(field, value) {
  if (field === 'is_critical') return [true, 1, '1'].includes(value);
  if (value == null || value === '') return null;
  return ['dimension_value', 'tolerance_upper', 'tolerance_lower'].includes(field)
    ? Number(value)
    : String(value);
}

/** Result submissions may only change evidence, never the approved item snapshot. */
function bindInspectionItems(stored, submitted) {
  if (!Array.isArray(submitted) || submitted.length !== stored.length || !stored.length) {
    throw invalid('检验项目不可新增或删除，请重新读取检验单');
  }
  const used = new Set();
  return submitted.map((input) => {
    // Old clients omit IDs. Only an unambiguous, unchanged name may identify an item.
    const candidates = stored.filter((item) =>
      input.id != null ? Number(item.id) === Number(input.id) : item.item_name === input.item_name
    );
    if (candidates.length !== 1 || used.has(candidates[0].id))
      throw invalid('检验项目标识无效或重复，请重新读取检验单');
    const item = candidates[0];
    used.add(item.id);
    for (const field of standardFields) {
      if (
        input[field] !== undefined &&
        comparable(field, input[field]) !== comparable(field, item[field])
      ) {
        throw invalid('检验结果不能修改标准、公差、关键性或项目定义');
      }
    }
    const measurements =
      input.measurements !== undefined
        ? input.measurements
        : (item.measurements || []).map((measurement) => {
            const field = `measure_${measurement.sample_no}`;
            return input[field] !== undefined
              ? { ...measurement, measured_value: input[field] }
              : measurement;
          });
    return {
      ...item,
      measurements,
      ...Object.fromEntries(
        evidenceFields
          .filter((field) => input[field] !== undefined)
          .map((field) => [field, input[field]])
      ),
    };
  });
}

module.exports = { bindInspectionItems };
