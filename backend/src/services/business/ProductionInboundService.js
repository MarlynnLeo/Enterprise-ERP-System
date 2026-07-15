/**
 * ProductionInboundService
 * 生产入库领域服务：终检 → 生产入库草稿（类型/引用/明细统一入口）
 */

const { logger } = require('../../utils/logger');
const { CodeGenerators } = require('../../utils/codeGenerator');
const InventoryService = require('../InventoryService');
const {
  INBOUND_TYPE_KEYS,
  DOCUMENT_REFERENCE_TYPES,
  QUALITY_INSPECTION_TYPES,
  resolveInboundFromInspection,
} = require('../../constants/documentReferences');

class ProductionInboundService {
  /**
   * 终检合格后创建生产入库草稿（幂等：同 inspection_id 已存在则返回已有单）
   * @param {object} connection
   * @param {object} params
   * @param {object} params.inspection - 质检单行
   * @param {number} [params.qualifiedQuantity]
   * @param {string} [params.operator]
   * @param {number|null} [params.createdBy]
   * @param {string} [params.remark]
   */
  static async createDraftFromFinalInspection(connection, params = {}) {
    if (!connection) {
      throw new Error('createDraftFromFinalInspection 必须在事务中调用');
    }

    const inspection = params.inspection;
    if (!inspection?.id) {
      throw new Error('缺少质检单');
    }
    if (inspection.inspection_type !== QUALITY_INSPECTION_TYPES.FINAL) {
      throw new Error('仅成品终检可自动生成生产入库单');
    }

    const meta = resolveInboundFromInspection(inspection);
    if (meta.inboundType !== INBOUND_TYPE_KEYS.PRODUCTION || !meta.referenceId) {
      throw new Error(
        `终检单 ${inspection.inspection_no || inspection.id} 未关联生产任务，不能创建生产入库`
      );
    }

    const [existing] = await connection.query(
      `SELECT id, inbound_no FROM inventory_inbound
       WHERE inspection_id = ?
         AND COALESCE(is_deleted, 0) = 0
         AND status <> 'cancelled'
       LIMIT 1`,
      [inspection.id]
    );
    if (existing.length > 0) {
      return {
        created: false,
        existed: true,
        id: existing[0].id,
        inbound_no: existing[0].inbound_no,
      };
    }

    const taskId = meta.referenceId;
    const [taskInfo] = await connection.query(
      `SELECT pt.id, pt.code, pt.product_id, pt.quantity,
              m.code AS product_code, m.name AS product_name,
              m.location_id AS material_location_id, m.unit_id AS material_unit_id
       FROM production_tasks pt
       LEFT JOIN materials m ON pt.product_id = m.id
       WHERE pt.id = ? AND pt.deleted_at IS NULL`,
      [taskId]
    );
    if (taskInfo.length === 0) {
      throw new Error(`成品检验单关联的生产任务不存在: ${taskId}`);
    }
    const task = taskInfo[0];

    let locationId = task.material_location_id;
    if (!locationId) {
      locationId = await InventoryService.getMaterialLocation(task.product_id, connection);
    }
    if (!locationId) {
      throw new Error(`产品 ${task.product_id} 未配置可用仓库，不能创建生产入库单`);
    }

    const batchNo = String(inspection.batch_no || '').trim();
    if (!batchNo) {
      throw new Error(
        `成品检验单 ${inspection.inspection_no || inspection.id} 未填写批次号，不能创建生产入库单`
      );
    }

    const inboundQuantity = Number(
      params.qualifiedQuantity ?? inspection.qualified_quantity ?? 0
    );
    if (!Number.isFinite(inboundQuantity) || inboundQuantity <= 0) {
      throw new Error(
        `成品检验单 ${inspection.inspection_no || inspection.id} 合格数量必须大于0`
      );
    }

    const unitId = task.material_unit_id || null;
    const inboundNo = await CodeGenerators.generateInboundCode(connection);
    const operator = params.operator || inspection.inspector_name || '系统';
    const remark =
      params.remark ||
      `检验单 ${inspection.inspection_no} 通过后自动创建`;

    const [inboundResult] = await connection.execute(
      `INSERT INTO inventory_inbound (
         inbound_no, inbound_type, reference_type, reference_id,
         inspection_id, inspection_no, location_id,
         inbound_date, status, operator, remark, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
      [
        inboundNo,
        INBOUND_TYPE_KEYS.PRODUCTION,
        DOCUMENT_REFERENCE_TYPES.PRODUCTION_TASK,
        taskId,
        inspection.id,
        inspection.inspection_no || null,
        locationId,
        new Date(),
        operator,
        remark,
        params.createdBy || inspection.inspector_id || null,
      ]
    );

    const inboundId = inboundResult.insertId;
    await connection.execute(
      `INSERT INTO inventory_inbound_items (
         inbound_id, material_id, quantity, unit_id, location_id, batch_number, remark
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        inboundId,
        task.product_id,
        inboundQuantity,
        unitId,
        locationId,
        batchNo,
        `生产任务 ${task.code}`,
      ]
    );

    logger.info(
      `[ProductionInbound] 终检 ${inspection.id} → 入库草稿 ${inboundNo} (task=${task.code})`
    );

    return {
      created: true,
      existed: false,
      id: inboundId,
      inbound_no: inboundNo,
      task_id: taskId,
    };
  }
}

module.exports = ProductionInboundService;
