'use strict';

const { INCOMING_INSPECTION_COUNTED_STATUSES } = require('../../constants/qualityReceipt');

const TERMINAL_STATUSES = new Set(INCOMING_INSPECTION_COUNTED_STATUSES);
const EPSILON = 0.0001;
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const validationError = (message) =>
  Object.assign(new Error(message), { statusCode: 400, code: 'VALIDATION_ERROR' });

function inspectionNumber(value) {
  if (value === undefined || value === null) return 0;
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') {
    throw validationError('检验数量必须为有效数字');
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw validationError('检验数量必须为有效数字');
  return number;
}

const isTerminalInspectionStatus = (status) => TERMINAL_STATUSES.has(status);

function normalizeTerminalInspectionQuantities(inspection, updateData = {}) {
  const { status } = inspection;
  if (!isTerminalInspectionStatus(status)) throw validationError('检验尚未完成');
  const inspectionQuantity = inspectionNumber(inspection.quantity);
  let qualifiedQuantity = inspectionNumber(inspection.qualified_quantity);
  let unqualifiedQuantity = inspectionNumber(inspection.unqualified_quantity);
  const hasExplicitQuantity =
    hasOwn(updateData, 'qualified_quantity') || hasOwn(updateData, 'unqualified_quantity');

  if (inspectionQuantity <= 0) throw validationError('检验数量必须大于0，不能关闭检验单');
  if (qualifiedQuantity < 0 || unqualifiedQuantity < 0) {
    throw validationError('合格数量和不合格数量不能为负数');
  }

  // passed/failed carry a complete disposition. completed only records that judging ended.
  if (!hasExplicitQuantity && qualifiedQuantity === 0 && unqualifiedQuantity === 0) {
    if (status === 'passed') qualifiedQuantity = inspectionQuantity;
    if (status === 'failed') unqualifiedQuantity = inspectionQuantity;
  }
  if (Math.abs(qualifiedQuantity + unqualifiedQuantity - inspectionQuantity) > EPSILON) {
    throw validationError(
      `检验数量不一致: 检验数量=${inspectionQuantity}, 合格=${qualifiedQuantity}, 不合格=${unqualifiedQuantity}`
    );
  }
  if (status === 'passed' && unqualifiedQuantity > EPSILON) {
    throw validationError('检验通过时不合格数量必须为0；如有不合格请使用部分合格或不合格状态');
  }
  if (status === 'failed' && qualifiedQuantity > EPSILON) {
    throw validationError('检验不合格时合格数量必须为0；如有合格数量请使用部分合格状态');
  }
  if (status === 'partial' && (qualifiedQuantity <= 0 || unqualifiedQuantity <= 0)) {
    throw validationError('部分合格必须同时包含合格数量和不合格数量');
  }
  return { inspectionQuantity, qualifiedQuantity, unqualifiedQuantity };
}

module.exports = { isTerminalInspectionStatus, normalizeTerminalInspectionQuantities };
