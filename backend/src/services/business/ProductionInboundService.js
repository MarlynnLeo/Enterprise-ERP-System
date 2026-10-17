/**
 * ProductionInboundService
 * 生产入库领域服务：终检 → 生产入库草稿（类型/引用/明细统一入口）
 */

const { logger } = require('../../utils/logger');
const { CodeGenerators } = require('../../utils/codeGenerator');
const InventoryService = require('../InventoryService');
const BusinessError = require('../../utils/BusinessError');
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
    if (
      inspection.reference_type &&
      inspection.reference_type !== DOCUMENT_REFERENCE_TYPES.PRODUCTION_TASK
    ) {
      throw new BusinessError(
        '成品终检必须关联生产任务，采购来料请通过采购收货单办理检验和完成入库',
        null,
        'VALIDATION_ERROR',
        400
      );
    }

    const [existing] = await connection.query(
      `SELECT id, inbound_no FROM inventory_inbound
       WHERE inspection_id = ?
         AND COALESCE(is_deleted, 0) = 0
         AND deleted_at IS NULL
         AND status NOT IN ('cancelled', 'reversed')
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

    await require('./FinalInspectionReleaseService').validate(
      connection,
      {
        inbound_type: 'production',
        inspection_id: inspection.id,
        reference_id: inspection.task_id || inspection.reference_id,
      },
      [
        {
          material_id: inspection.product_id || inspection.material_id,
          batch_number: inspection.batch_no,
          quantity: params.qualifiedQuantity ?? inspection.qualified_quantity,
        },
      ]
    );
    return this._createFinalDraft(connection, params);
  }

  /** Internal insertion shared by qualified stock and explicitly approved concessions. */
  static async _createFinalDraft(connection, params) {
    const inspection = params.inspection;
    const referenceId = Number(
      inspection.reference_id ||
        inspection.task_id ||
        resolveInboundFromInspection(inspection).referenceId ||
        0
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
      throw new BusinessError(
        `成品检验单 ${inspection.inspection_no || '当前检验单'} 未关联有效生产任务，不能创建生产入库单；采购来料请通过采购收货单办理`,
        null,
        'VALIDATION_ERROR',
        400
      );
    }
    const task = taskInfo[0];
    const taskId = task.id;

    let locationId = await this.resolveFinishedGoodsLocationId(
      connection,
      task.material_location_id
    );
    if (!locationId) {
      locationId = await InventoryService.getMaterialLocation(task.product_id, connection);
    }
    if (!locationId) {
      throw new Error(
        `产品“${task.product_code || task.product_name || '所选物料'}”未配置可用仓库，不能创建生产入库单`
      );
    }

    const batchNo = String(inspection.batch_no || '').trim();
    if (!batchNo) {
      throw new Error(
        `成品检验单 ${inspection.inspection_no || '当前检验单'} 未填写批次号，不能创建生产入库单`
      );
    }

    const inboundQuantity = Number(params.qualifiedQuantity ?? inspection.qualified_quantity ?? 0);
    if (!Number.isFinite(inboundQuantity) || inboundQuantity <= 0) {
      throw new Error(`成品检验单 ${inspection.inspection_no || '当前检验单'} 合格数量必须大于0`);
    }

    const unitId = task.material_unit_id || null;
    const inboundNo = await CodeGenerators.generateInboundCode(connection);
    const operator = params.operator || inspection.inspector_name || '系统';
    const remark = params.remark || `检验单 ${inspection.inspection_no} 合格品自动入库`;

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

  /**
   * Release an approved final-inspection concession without rewriting its 90/10 verdict.
   * An editable qualified draft receives the released stock; otherwise create a second
   * production inbound. Approval and this method must share the caller's transaction.
   */
  static async createDraftFromFinalConcession(connection, params = {}) {
    if (!connection) throw new Error('成品让步入库必须在事务中调用');
    const [[ncp]] = await connection.query(
      `SELECT * FROM nonconforming_products
        WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [params.ncpId]
    );
    if (
      !ncp ||
      ncp.concession_status !== 'approved' ||
      ncp.disposition !== 'use_as_is' ||
      ncp.status === 'cancelled'
    ) {
      throw new Error('成品让步入库必须关联已批准的特采处置单');
    }
    const [[inspection]] = await connection.query(
      `SELECT * FROM quality_inspections
        WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [ncp.inspection_id]
    );
    if (
      !inspection ||
      inspection.inspection_type !== QUALITY_INSPECTION_TYPES.FINAL ||
      (inspection.reference_type &&
        inspection.reference_type !== DOCUMENT_REFERENCE_TYPES.PRODUCTION_TASK) ||
      !['partial', 'failed', 'completed'].includes(inspection.status) ||
      Number(inspection.product_id || inspection.material_id) !== Number(ncp.material_id) ||
      !inspection.batch_no ||
      (ncp.batch_no && ncp.batch_no !== inspection.batch_no)
    ) {
      throw new Error('特采处置单与原成品检验的产品、批次或生产任务不匹配');
    }
    const {
      normalizeTerminalInspectionQuantities,
    } = require('../../utils/quality/inspectionQuantities');
    if (inspection.qualified_quantity == null || inspection.unqualified_quantity == null) {
      throw new Error('特采来源成品检验缺少明确的合格与不合格数量');
    }
    await require('./FinalInspectionReadinessService').validate(connection, inspection);
    const quantities = normalizeTerminalInspectionQuantities(inspection, inspection);
    const quantity = Number(params.quantity);
    const ncpQuantity = Number(ncp.quantity);
    const handledQuantity = Number(ncp.handled_quantity || 0);
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(ncpQuantity) ||
      ncpQuantity <= 0 ||
      !Number.isFinite(handledQuantity) ||
      handledQuantity < 0 ||
      ncpQuantity > quantities.unqualifiedQuantity + 0.0001
    ) {
      throw new Error('成品让步入库数量必须有效且不能超过原检验不合格数量');
    }

    // The generation link makes approval retries idempotent, including merged drafts.
    const [linked] = await connection.query(
      `SELECT ib.id, ib.inbound_no FROM document_links dl
         JOIN inventory_inbound ib ON ib.id = dl.target_id
        WHERE dl.source_type = 'nonconforming_product' AND dl.source_id = ?
          AND dl.target_type = 'inventory_inbound' AND dl.link_type = 'generate'
          AND COALESCE(ib.is_deleted, 0) = 0 AND ib.deleted_at IS NULL
          AND ib.status NOT IN ('cancelled', 'reversed') FOR UPDATE`,
      [ncp.id]
    );
    if (linked.length) return { ...linked[0], created: false, existed: true };
    if (quantity > ncpQuantity - handledQuantity + 0.0001) {
      throw new Error('成品让步入库数量超过该不合格品的剩余处置数量');
    }

    const [[otherReleases]] = await connection.query(
      `SELECT COALESCE(SUM(LEAST(quantity, COALESCE(handled_quantity, 0))), 0) AS quantity
         FROM nonconforming_products
        WHERE inspection_id = ? AND id <> ? AND deleted_at IS NULL
          AND disposition = 'use_as_is' AND concession_status = 'approved'
          AND status IN ('processing', 'completed', 'closed')`,
      [inspection.id, ncp.id]
    );
    const otherQuantity = Number(otherReleases?.quantity || 0);
    if (
      !Number.isFinite(otherQuantity) ||
      otherQuantity < 0 ||
      otherQuantity + handledQuantity + quantity > quantities.unqualifiedQuantity + 0.0001
    ) {
      throw new Error('累计让步放行数量超过原检验不合格数量');
    }
    const [inbounds] = await connection.query(
      `SELECT id, inbound_no, status, inbound_type, reference_type, reference_id, location_id
         FROM inventory_inbound
        WHERE inspection_id = ? AND COALESCE(is_deleted, 0) = 0 AND deleted_at IS NULL
          AND status NOT IN ('cancelled', 'reversed') ORDER BY id FOR UPDATE`,
      [inspection.id]
    );
    const [items] = inbounds.length
      ? await connection.query(
          `SELECT id, inbound_id, material_id, quantity, batch_number
             FROM inventory_inbound_items WHERE inbound_id IN (?) FOR UPDATE`,
          [inbounds.map((inbound) => inbound.id)]
        )
      : [[]];
    const allocatedQuantity = items.reduce((sum, item) => sum + Number(item.quantity), 0);
    const releaseLimit = quantities.qualifiedQuantity + otherQuantity + handledQuantity + quantity;
    if (
      items.some((item) => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) ||
      !Number.isFinite(allocatedQuantity) ||
      allocatedQuantity + quantity > releaseLimit + 0.0001
    ) {
      throw new Error('累计生产入库数量超过成品合格及批准让步放行数量');
    }
    const taskId = Number(inspection.reference_id || inspection.task_id);
    if (!taskId) throw new Error('成品让步入库缺少关联生产任务');
    const createdBy = params.createdBy || ncp.concession_approver_id || ncp.created_by;
    const remark = `检验单 ${inspection.inspection_no}，不合格品 ${ncp.ncp_no} 批准让步接收 ${quantity}`;
    // Add any unallocated qualified stock as well, allowing a single 100-unit draft
    // when the original inspection recorded 90 qualified and 10 accepted by concession.
    const inboundQuantity = Math.max(quantity, releaseLimit - allocatedQuantity);
    const draft = inbounds.find((inbound) => {
      const draftItems = items.filter((item) => Number(item.inbound_id) === Number(inbound.id));
      return (
        inbound.status === 'draft' &&
        inbound.inbound_type === INBOUND_TYPE_KEYS.PRODUCTION &&
        inbound.reference_type === DOCUMENT_REFERENCE_TYPES.PRODUCTION_TASK &&
        Number(inbound.reference_id) === taskId &&
        draftItems.length === 1 &&
        Number(draftItems[0].material_id) === Number(ncp.material_id) &&
        draftItems[0].batch_number === inspection.batch_no
      );
    });
    let result;
    if (draft) {
      const item = items.find((row) => Number(row.inbound_id) === Number(draft.id));
      await connection.execute(
        `UPDATE inventory_inbound_items SET quantity = quantity + ?,
                remark = CONCAT_WS('\n', NULLIF(remark, ''), ?) WHERE id = ?`,
        [inboundQuantity, remark, item.id]
      );
      await connection.execute(
        `UPDATE inventory_inbound SET remark = CONCAT_WS('\n', NULLIF(remark, ''), ?),
                updated_at = NOW() WHERE id = ? AND status = 'draft'`,
        [remark, draft.id]
      );
      result = {
        id: draft.id,
        inbound_no: draft.inbound_no,
        created: false,
        existed: false,
        merged: true,
      };
    } else {
      result = await this._createFinalDraft(connection, {
        inspection,
        qualifiedQuantity: inboundQuantity,
        operator: params.operator,
        createdBy,
        remark,
      });
    }
    const DocumentLinkService = require('./DocumentLinkService');
    await DocumentLinkService.createLink(
      {
        source_type: 'nonconforming_product',
        source_id: ncp.id,
        source_code: ncp.ncp_no,
        target_type: 'inventory_inbound',
        target_id: result.id,
        target_code: result.inbound_no,
        link_type: 'generate',
        remark,
        created_by: createdBy,
      },
      connection
    );
    return { ...result, task_id: taskId, released_quantity: quantity };
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
}

module.exports = ProductionInboundService;
