/**
 * DocumentChainService
 * 业务单据链路写入的唯一业务入口：
 * - 使用 documentLinkTypes SSOT，禁止硬编码类型字符串
 * - 在领域事务内调用，失败进入 DocumentLinkService/DLQ 补偿路径
 * - 不承载 UI 查询（查询仍走 DocumentLinkService.getLinks/getFullChain）
 */

const DocumentLinkService = require('./DocumentLinkService');
const {
  DOCUMENT_LINK_TYPES: T,
  resolveInventoryReferenceLinkType,
} = require('../../constants/documentLinkTypes');

function toPositiveId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function actorId(userId) {
  if (userId === null || userId === undefined || userId === '') return null;
  const n = Number(userId);
  return Number.isFinite(n) ? n : userId;
}

class DocumentChainService {
  /**
   * 通用 generate 边
   * @param {{ type: string, id: number, code?: string }} source
   * @param {{ type: string, id: number, code?: string }} target
   */
  static async linkGenerate(source, target, userId, connection) {
    const sourceId = toPositiveId(source?.id);
    const targetId = toPositiveId(target?.id);
    if (!source?.type || !target?.type || !sourceId || !targetId) return false;

    await DocumentLinkService.tryAutoLink(
      source.type,
      sourceId,
      source.code || null,
      target.type,
      targetId,
      target.code || null,
      actorId(userId),
      connection
    );
    return true;
  }

  /** 采购订单 → 采购收货 */
  static async linkPurchaseOrderToReceipt(
    { orderId, orderNo, receiptId, receiptNo },
    userId,
    connection
  ) {
    return this.linkGenerate(
      { type: T.PURCHASE_ORDER, id: orderId, code: orderNo },
      { type: T.PURCHASE_RECEIPT, id: receiptId, code: receiptNo },
      userId,
      connection
    );
  }

  /** 质检单 → 采购收货（来料检验转收货） */
  static async linkQualityInspectionToReceipt(
    { inspectionId, inspectionNo, receiptId, receiptNo },
    userId,
    connection
  ) {
    return this.linkGenerate(
      { type: T.QUALITY_INSPECTION, id: inspectionId, code: inspectionNo },
      { type: T.PURCHASE_RECEIPT, id: receiptId, code: receiptNo },
      userId,
      connection
    );
  }

  /** 收货创建后的标准链路集合 */
  static async afterPurchaseReceiptCreated(payload, userId, connection) {
    const {
      orderId,
      orderNo,
      receiptId,
      receiptNo,
      inspectionId,
      inspectionNo,
    } = payload || {};

    if (orderId) {
      await this.linkPurchaseOrderToReceipt(
        { orderId, orderNo, receiptId, receiptNo },
        userId,
        connection
      );
    }
    if (inspectionId) {
      await this.linkQualityInspectionToReceipt(
        { inspectionId, inspectionNo, receiptId, receiptNo },
        userId,
        connection
      );
    }
  }

  /** 销售订单 → 销售出库 */
  static async linkSalesOrderToOutbound(
    { orderId, orderNo, outboundId, outboundNo },
    userId,
    connection
  ) {
    return this.linkGenerate(
      { type: T.SALES_ORDER, id: orderId, code: orderNo },
      { type: T.SALES_OUTBOUND, id: outboundId, code: outboundNo },
      userId,
      connection
    );
  }

  /** 生产计划 → 生产任务 */
  static async linkProductionPlanToTask(
    { planId, planCode, taskId, taskCode },
    userId,
    connection
  ) {
    return this.linkGenerate(
      { type: T.PRODUCTION_PLAN, id: planId, code: planCode },
      { type: T.PRODUCTION_TASK, id: taskId, code: taskCode },
      userId,
      connection
    );
  }

  /**
   * 库存出库完成：关联生产任务/计划或 reference 业务单
   */
  static async afterInventoryOutboundCompleted(outbound, userId, connection) {
    if (!outbound) return;

    const outboundId = toPositiveId(outbound.id);
    const outboundNo = outbound.outbound_no || outbound.outboundNo || null;
    if (!outboundId) return;

    const taskId = toPositiveId(outbound.production_task_id);
    if (taskId) {
      await this.linkGenerate(
        { type: T.PRODUCTION_TASK, id: taskId, code: null },
        { type: T.INVENTORY_OUTBOUND, id: outboundId, code: outboundNo },
        userId,
        connection
      );
    }

    const refType = resolveInventoryReferenceLinkType(outbound.reference_type);
    const refId = toPositiveId(outbound.reference_id);
    if (refType && refId && !(taskId && refType === T.PRODUCTION_TASK && refId === taskId)) {
      await this.linkGenerate(
        { type: refType, id: refId, code: outbound.reference_no || null },
        { type: T.INVENTORY_OUTBOUND, id: outboundId, code: outboundNo },
        userId,
        connection
      );
    }
  }

  /**
   * 库存入库确认：关联质检与 reference 业务单
   */
  static async afterInventoryInboundConfirmed(inbound, userId, connection) {
    if (!inbound) return;

    const inboundId = toPositiveId(inbound.id);
    const inboundNo = inbound.inbound_no || inbound.inboundNo || null;
    if (!inboundId) return;

    const inspectionId = toPositiveId(inbound.inspection_id);
    if (inspectionId) {
      await this.linkGenerate(
        {
          type: T.QUALITY_INSPECTION,
          id: inspectionId,
          code: inbound.inspection_no || null,
        },
        { type: T.INVENTORY_INBOUND, id: inboundId, code: inboundNo },
        userId,
        connection
      );
    }

    const refType = resolveInventoryReferenceLinkType(inbound.reference_type);
    const refId = toPositiveId(inbound.reference_id);
    if (refType && refId) {
      await this.linkGenerate(
        { type: refType, id: refId, code: inbound.reference_no || null },
        { type: T.INVENTORY_INBOUND, id: inboundId, code: inboundNo },
        userId,
        connection
      );
    }
  }
}

module.exports = DocumentChainService;
