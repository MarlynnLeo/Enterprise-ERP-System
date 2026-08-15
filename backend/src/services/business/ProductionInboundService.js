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

    const referenceId = Number(
      inspection.reference_id || inspection.task_id || resolveInboundFromInspection(inspection).referenceId || 0
    );

    const [taskInfo] = referenceId
      ? await connection.query(
          `SELECT pt.id, pt.code, pt.product_id, pt.quantity,
                  m.code AS product_code, m.name AS product_name,
                  m.location_id AS material_location_id, m.unit_id AS material_unit_id
             FROM production_tasks pt
             LEFT JOIN materials m ON pt.product_id = m.id
            WHERE pt.id = ? AND pt.deleted_at IS NULL`,
          [referenceId]
        )
      : [[]];
    if (taskInfo.length === 0) {
      const odmDraft = await this.createDraftFromOdmPurchase(connection, {
        ...params,
        referenceId,
      });
      if (odmDraft) return odmDraft;
      throw new Error(
        `成品检验单 ${inspection.inspection_no || inspection.id} 未关联生产任务或采购单，不能创建入库`
      );
    }
    const task = taskInfo[0];
    const taskId = task.id;

    let locationId = await this.resolveFinishedGoodsLocationId(connection, task.material_location_id);
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

  static async resolveFinishedGoodsLocationId(connection, preferredId = null) {
    if (preferredId) {
      const [preferred] = await connection.query(
        `SELECT id FROM locations
          WHERE id = ? AND status = 1 AND deleted_at IS NULL
          LIMIT 1`,
        [preferredId]
      );
      if (preferred.length) return Number(preferred[0].id);
    }
    const [rows] = await connection.query(
      `SELECT id FROM locations
        WHERE status = 1 AND deleted_at IS NULL
          AND (type = 'finished_goods' OR name IN ('成品库', '成品仓库'))
        ORDER BY id ASC
        LIMIT 1`
    );
    return rows.length ? Number(rows[0].id) : null;
  }

  static async createDraftFromOdmPurchase(connection, params = {}) {
    const inspection = params.inspection;
    const referenceId = Number(params.referenceId || 0);
    if (!referenceId) return null;

    const [orders] = await connection.query(
      `SELECT id, order_no FROM purchase_orders
        WHERE id = ? AND deleted_at IS NULL
        LIMIT 1`,
      [referenceId]
    );
    if (!orders.length) return null;

    const order = orders[0];
    const materialId = Number(inspection.product_id || inspection.material_id || 0);
    if (!materialId) {
      throw new Error(
        `ODM成品检验单 ${inspection.inspection_no || inspection.id} 缺少产品，不能入库成品仓`
      );
    }

    const locationId = await this.resolveFinishedGoodsLocationId(connection);
    if (!locationId) {
      throw new Error('未配置成品库，不能创建 ODM 成品入库单');
    }

    const batchNo = String(inspection.batch_no || '').trim();
    if (!batchNo) {
      throw new Error(
        `成品检验单 ${inspection.inspection_no || inspection.id} 未填写批次号，不能创建入库单`
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

    const [materials] = await connection.query(
      'SELECT id, unit_id FROM materials WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [materialId]
    );
    const unitId = materials[0]?.unit_id || null;
    const inboundNo = await CodeGenerators.generateInboundCode(connection);
    const operator = params.operator || inspection.inspector_name || '系统';
    const remark =
      params.remark ||
      `ODM采购 ${order.order_no} 成品检验 ${inspection.inspection_no} 合格入库成品仓`;

    const [inboundResult] = await connection.execute(
      `INSERT INTO inventory_inbound (
         inbound_no, inbound_type, reference_type, reference_id,
         inspection_id, inspection_no, location_id,
         inbound_date, status, operator, remark, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
      [
        inboundNo,
        INBOUND_TYPE_KEYS.PURCHASE,
        DOCUMENT_REFERENCE_TYPES.PURCHASE_ORDER,
        order.id,
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
        materialId,
        inboundQuantity,
        unitId,
        locationId,
        batchNo,
        `采购单 ${order.order_no}`,
      ]
    );

    logger.info(
      `[ProductionInbound] ODM终检 ${inspection.id} → 成品仓入库草稿 ${inboundNo} (po=${order.order_no})`
    );

    return {
      created: true,
      existed: false,
      id: inboundId,
      inbound_no: inboundNo,
      purchase_order_id: order.id,
    };
  }

  static async resolveComponentLocationId(connection, preferredId = null) {
    if (preferredId) {
      const [preferred] = await connection.query(
        `SELECT id FROM locations
          WHERE id = ? AND status = 1 AND deleted_at IS NULL
          LIMIT 1`,
        [preferredId]
      );
      if (preferred.length) return Number(preferred[0].id);
    }
    const [rows] = await connection.query(
      `SELECT id FROM locations
        WHERE status = 1 AND deleted_at IS NULL
          AND (type IN ('component', 'material') OR name IN ('零部件库', '原材料库', '零部件仓库'))
        ORDER BY CASE WHEN type = 'component' OR name IN ('零部件库', '零部件仓库') THEN 0 ELSE 1 END, id ASC
        LIMIT 1`
    );
    return rows.length ? Number(rows[0].id) : null;
  }

  static async createDraftFromIncomingInspection(connection, params = {}) {
    if (!connection) {
      throw new Error('createDraftFromIncomingInspection 必须在事务中调用');
    }
    const inspection = params.inspection;
    if (!inspection?.id) {
      throw new Error('缺少质检单');
    }
    if (inspection.inspection_type !== QUALITY_INSPECTION_TYPES.INCOMING) {
      throw new Error('仅来料检验可自动生成采购入库单');
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

    const purchaseOrderId = Number(inspection.reference_id || 0);
    if (!purchaseOrderId) {
      throw new Error(
        `来料检验单 ${inspection.inspection_no || inspection.id} 未关联采购单，不能入库`
      );
    }
    const materialId = Number(inspection.material_id || inspection.product_id || 0);
    if (!materialId) {
      throw new Error(
        `来料检验单 ${inspection.inspection_no || inspection.id} 缺少物料，不能入库`
      );
    }

    const [materials] = await connection.query(
      'SELECT id, unit_id, location_id FROM materials WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [materialId]
    );
    const locationId = await this.resolveComponentLocationId(
      connection,
      materials[0]?.location_id || null
    );
    if (!locationId) {
      throw new Error('未配置零部件库/原材料库，不能创建来料入库单');
    }

    const batchNo = String(inspection.batch_no || '').trim();
    if (!batchNo) {
      throw new Error(
        `来料检验单 ${inspection.inspection_no || inspection.id} 未填写批次号，不能创建入库单`
      );
    }
    const inboundQuantity = Number(
      params.qualifiedQuantity ?? inspection.qualified_quantity ?? inspection.quantity ?? 0
    );
    if (!Number.isFinite(inboundQuantity) || inboundQuantity <= 0) {
      throw new Error(
        `来料检验单 ${inspection.inspection_no || inspection.id} 合格数量必须大于0`
      );
    }

    const inboundNo = await CodeGenerators.generateInboundCode(connection);
    const operator = params.operator || inspection.inspector_name || '系统';
    const remark =
      params.remark ||
      `来料检验 ${inspection.inspection_no} 合格入库零部件仓`;

    const [inboundResult] = await connection.execute(
      `INSERT INTO inventory_inbound (
         inbound_no, inbound_type, reference_type, reference_id,
         inspection_id, inspection_no, location_id,
         inbound_date, status, operator, remark, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
      [
        inboundNo,
        INBOUND_TYPE_KEYS.PURCHASE,
        DOCUMENT_REFERENCE_TYPES.PURCHASE_ORDER,
        purchaseOrderId,
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
        materialId,
        inboundQuantity,
        materials[0]?.unit_id || inspection.unit_id || null,
        locationId,
        batchNo,
        `采购单 ${inspection.reference_no || purchaseOrderId}`,
      ]
    );

    logger.info(
      `[ProductionInbound] 来料检验 ${inspection.id} → 零部件仓入库草稿 ${inboundNo}`
    );
    return {
      created: true,
      existed: false,
      id: inboundId,
      inbound_no: inboundNo,
      purchase_order_id: purchaseOrderId,
    };
  }
}

module.exports = ProductionInboundService;
