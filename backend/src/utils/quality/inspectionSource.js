'use strict';

/**
 * 质检单来源类型的统一定义与解析。
 *
 * 来料检验的 reference_id 可能指向采购订单，也可能指向委外入库单。
 * 仅依赖 inspection_type 会把两类单据混在一起，因此所有闭环入口都应
 * 使用这里的来源判定。
 */

const INSPECTION_SOURCE_TYPES = Object.freeze({
  PURCHASE_ORDER: 'purchase_order',
  OUTSOURCED_RECEIPT: 'outsourced_receipt',
});

const SOURCE_TYPE_VALUES = new Set(Object.values(INSPECTION_SOURCE_TYPES));

const normalizeRawSourceType = (sourceType) => {
  if (sourceType === null || sourceType === undefined) return '';
  return String(sourceType).trim().toLowerCase();
};

/**
 * 规范化来源类型。
 * - incoming 未传来源时兼容旧数据，默认采购订单；
 * - 非 incoming 保留空值，不强行套用来料来源；
 * - 显式传入未知值直接报校验错误，避免静默走错业务闭环。
 */
const normalizeInspectionSourceType = (inspectionType, sourceType) => {
  const normalized = normalizeRawSourceType(sourceType);

  if (!normalized) {
    return inspectionType === 'incoming' ? INSPECTION_SOURCE_TYPES.PURCHASE_ORDER : null;
  }

  if (inspectionType !== 'incoming') return normalized;

  if (!SOURCE_TYPE_VALUES.has(normalized)) {
    const error = new Error(`不支持的来料检验来源: ${sourceType}`);
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  return normalized;
};

const isOutsourcedIncomingInspection = (inspection) =>
  inspection?.inspection_type === 'incoming' &&
  normalizeRawSourceType(inspection?.source_type) === INSPECTION_SOURCE_TYPES.OUTSOURCED_RECEIPT;

const isMissingTableError = (error) =>
  ['ER_NO_SUCH_TABLE', 'ER_BAD_TABLE_ERROR', 'ER_BAD_FIELD_ERROR'].includes(error?.code);

/**
 * 仅在来源字段缺失时，通过委外入库单号（优先）或 ID 识别历史委外检验单。
 * 当 reference_no 有值但与委外单号不一致时，不仅凭可能碰撞的数字 ID 推断，
 * 以免把真实采购检验误判为委外检验。
 */
const matchesOutsourcedReceipt = async (connection, inspection) => {
  if (!connection || inspection?.inspection_type !== 'incoming') return false;

  const referenceNo = String(inspection.reference_no || '').trim();
  const referenceId = Number(inspection.reference_id || 0);

  try {
    if (referenceNo) {
      const [rows] = await connection.query(
        `SELECT id
           FROM outsourced_processing_receipts
          WHERE receipt_no = ?
          LIMIT 1`,
        [referenceNo]
      );
      return rows.length > 0 && (!referenceId || Number(rows[0].id) === referenceId);
    }

    if (referenceId > 0) {
      const [rows] = await connection.query(
        `SELECT id
           FROM outsourced_processing_receipts
          WHERE id = ?
          LIMIT 1`,
        [referenceId]
      );
      return rows.length > 0;
    }
  } catch (error) {
    // 旧部署可能尚未安装委外流程表；此时按采购来源兼容处理。
    if (isMissingTableError(error)) return false;
    throw error;
  }

  return false;
};

/**
 * 解析一个检验单最终应使用的来源类型。
 * @param {object} connection 事务连接
 * @param {object} inspection 检验单对象
 * @param {object} options
 * @param {boolean} options.persist 是否把推断结果回写 quality_inspections
 */
const resolveInspectionSourceType = async (connection, inspection, options = {}) => {
  const inspectionType = inspection?.inspection_type;
  const rawSourceType = normalizeRawSourceType(inspection?.source_type);

  if (inspectionType !== 'incoming') {
    return rawSourceType || null;
  }

  // 先校验显式值。显式 purchase_order/outsourced_receipt 不再猜测。
  if (rawSourceType) {
    const normalized = normalizeInspectionSourceType(inspectionType, rawSourceType);
    return normalized;
  }

  const resolved = (await matchesOutsourcedReceipt(connection, inspection))
    ? INSPECTION_SOURCE_TYPES.OUTSOURCED_RECEIPT
    : INSPECTION_SOURCE_TYPES.PURCHASE_ORDER;

  if (options.persist && inspection?.id) {
    await connection.query(
      `UPDATE quality_inspections
          SET source_type = ?
        WHERE id = ?
          AND deleted_at IS NULL
          AND (source_type IS NULL OR TRIM(source_type) = '')`,
      [resolved, inspection.id]
    );
  }

  return resolved;
};

module.exports = {
  INSPECTION_SOURCE_TYPES,
  normalizeInspectionSourceType,
  isOutsourcedIncomingInspection,
  matchesOutsourcedReceipt,
  resolveInspectionSourceType,
};
