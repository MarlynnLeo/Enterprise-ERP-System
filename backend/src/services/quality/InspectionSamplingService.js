'use strict';

const InspectionTemplateResolver = require('../business/InspectionTemplateResolverService');
const { validateSamplingCounts, isValidAqlLevel } = require('../../utils/quality/aqlValidation');

const enabled = (value) => value === true || value === 1 || value === '1';
const SAMPLING_INPUT_FIELDS = [
  'quantity',
  'is_aql',
  'is_full_inspection',
  'aql_standard_id',
  'aql_level',
];
const TERMINAL_STATUSES = new Set(['passed', 'failed', 'partial', 'completed']);
const validationError = (message) => InspectionTemplateResolver.createValidationError(message);

function normalizedInput(field, value) {
  if (field === 'is_aql' || field === 'is_full_inspection') return enabled(value);
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : String(value).trim();
}

class InspectionSamplingService {
  static assertExclusiveMode(inspection) {
    if (enabled(inspection.is_full_inspection) && enabled(inspection.is_aql)) {
      throw validationError('全检与 AQL 抽检不能同时启用，切换检验方式时请明确关闭原方式');
    }
  }

  static shouldRefresh(current, data) {
    const changed = SAMPLING_INPUT_FIELDS.some(
      (field) =>
        data[field] !== undefined &&
        normalizedInput(field, data[field]) !== normalizedInput(field, current[field])
    );
    if (TERMINAL_STATUSES.has(current.status)) {
      if (changed) {
        throw validationError('已完成检验的批量和抽样配置不能修改，请另建检验单记录新的抽样依据');
      }
      if (
        data.status !== undefined &&
        !TERMINAL_STATUSES.has(data.status) &&
        (enabled(current.is_aql) ||
          enabled(current.is_full_inspection) ||
          current.sample_quantity != null ||
          current.aql_standard_id != null)
      ) {
        throw validationError('已有抽样依据的已完成检验不能退回待检状态，请另建检验单');
      }
      return false;
    }

    this.assertExclusiveMode({ ...current, ...data });
    if (changed) return true;

    // An explicit selection may complete a pending legacy inspection. Merely saving
    // notes/results must never infer or refresh a historical sampling snapshot.
    return (
      current.sample_quantity == null &&
      ((data.aql_standard_id != null && data.aql_standard_id !== '') ||
        enabled(data.is_full_inspection))
    );
  }

  static assertReadyForCompletion(inspection, current = null) {
    if (!TERMINAL_STATUSES.has(inspection.status)) return;
    // Keep historical facts, including an explicitly missing snapshot, intact.
    if (current && current.status === inspection.status) return;
    this.assertExclusiveMode(inspection);

    const usesAql = enabled(inspection.is_aql);
    const fullInspection = enabled(inspection.is_full_inspection);
    if (!usesAql && !fullInspection) return;

    const sampleQuantity = Number(inspection.sample_quantity);
    const batchSize = Number(inspection.quantity);
    if (
      inspection.sample_quantity == null ||
      !Number.isFinite(sampleQuantity) ||
      sampleQuantity <= 0 ||
      !Number.isFinite(batchSize) ||
      batchSize <= 0 ||
      sampleQuantity > batchSize ||
      (usesAql && (!Number.isInteger(batchSize) || !Number.isInteger(sampleQuantity))) ||
      (fullInspection && sampleQuantity !== batchSize)
    ) {
      throw validationError('检验尚未记录有效抽样数，请确认抽样配置后再结束检验');
    }
    if (
      usesAql &&
      (!Number.isInteger(Number(inspection.aql_standard_id)) ||
        Number(inspection.aql_standard_id) <= 0 ||
        !Number.isFinite(Number(inspection.aql_level)) ||
        Number(inspection.aql_level) <= 0 ||
        inspection.accept_limit == null ||
        !Number.isInteger(Number(inspection.accept_limit)) ||
        Number(inspection.accept_limit) < 0 ||
        inspection.reject_limit == null ||
        !Number.isInteger(Number(inspection.reject_limit)) ||
        Number(inspection.reject_limit) <= Number(inspection.accept_limit))
    ) {
      throw validationError('AQL 抽样依据不完整，请重新选择抽样标准后再结束检验');
    }
  }

  static async resolve(connection, inspection) {
    this.assertExclusiveMode(inspection);
    const fullInspection = enabled(inspection.is_full_inspection);
    const usesAql = enabled(inspection.is_aql);
    const snapshot = {
      is_full_inspection: fullInspection ? 1 : 0,
      is_aql: usesAql ? 1 : 0,
      aql_standard_id: null,
      aql_level: usesAql ? inspection.aql_level || null : null,
      sample_quantity: null,
      sampling_plan: null,
      accept_limit: null,
      reject_limit: null,
    };
    if (!usesAql && !fullInspection) return snapshot;

    const batchSize = Number(inspection.quantity);
    if (!Number.isFinite(batchSize) || batchSize <= 0) {
      throw validationError('抽样批量必须大于 0');
    }
    if (fullInspection) return { ...snapshot, sample_quantity: batchSize };
    if (!Number.isInteger(batchSize)) throw validationError('计数抽样的批量必须为正整数');
    if (!isValidAqlLevel(inspection.aql_level)) {
      throw validationError('AQL 须为大于 0、小于 1000 且最多五位小数的数值');
    }

    // Auto-created inspections can await configuration; absence of a rule is not
    // evidence of full inspection and cannot supply a sample count.
    if (inspection.aql_standard_id == null || inspection.aql_standard_id === '') return snapshot;

    const standardId = Number(inspection.aql_standard_id);
    if (!Number.isInteger(standardId) || standardId <= 0) {
      throw validationError('请选择有效的 AQL 抽样标准');
    }
    const [rows] = await connection.query(
      `SELECT id, name, batch_min, batch_max, sample_size, aql_level, accept_limit, reject_limit
         FROM quality_aql_standards
        WHERE id = ? AND status = 'active'
        FOR UPDATE`,
      [standardId]
    );
    const rule = rows[0];
    if (!rule) throw validationError('所选 AQL 抽样标准不存在或已停用，请重新选择');

    const level = Number(inspection.aql_level);
    const batchMin = Number(rule.batch_min);
    const batchMax = Number(rule.batch_max);
    const isBelowMin = batchSize < batchMin && !(batchMin === 2 && batchSize === 1);
    if (
      !Number.isFinite(level) ||
      level <= 0 ||
      level !== Number(rule.aql_level) ||
      !Number.isFinite(batchMin) ||
      !Number.isFinite(batchMax) ||
      isBelowMin ||
      batchSize > batchMax
    ) {
      throw validationError('所选 AQL 抽样标准与当前批量或 AQL 等级不匹配，请重新匹配');
    }

    const sampleSize = Number(rule.sample_size);
    const acceptLimit = Number(rule.accept_limit);
    const rejectLimit = Number(rule.reject_limit);
    validateSamplingCounts(rule);

    return {
      ...snapshot,
      aql_standard_id: rule.id,
      aql_level: rule.aql_level,
      sample_quantity: Math.min(sampleSize, batchSize),
      sampling_plan: rule.name || null,
      accept_limit: acceptLimit,
      reject_limit: rejectLimit,
    };
  }
}

module.exports = InspectionSamplingService;
