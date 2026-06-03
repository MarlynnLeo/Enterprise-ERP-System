const db = require('../../config/db');
const { logger } = require('../../utils/logger');
const QualityInspection = require('../../models/qualityInspection');
const PurchaseOrderStatusService = require('./PurchaseOrderStatusService');
const InspectionClosureService = require('../quality/InspectionClosureService');

const createBusinessError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = statusCode === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR';
  return error;
};

const toNumber = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const todayString = () => new Date().toISOString().slice(0, 10);

class PurchaseReceiveInspectionService {
  static async receiveWithIncomingInspection(orderId, items) {
    const cleanOrderId = Number(orderId);
    if (!Number.isInteger(cleanOrderId) || cleanOrderId <= 0) {
      throw createBusinessError('采购订单ID无效');
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw createBusinessError('缺少物料收货信息');
    }

    const receivingItems = items
      .map((item) => ({
        ...item,
        material_id: Number(item.material_id || item.materialId || 0),
        receive_quantity: toNumber(
          item.receive_quantity ?? item.receiveQuantity ?? item.received_quantity ?? item.quantity
        ),
      }))
      .filter((item) => item.material_id > 0 && item.receive_quantity > 0);

    if (receivingItems.length === 0) {
      throw createBusinessError('没有有效的收货物料');
    }

    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();

      const order = await this.getOrderContext(connection, cleanOrderId);
      if (order.status === 'cancelled') {
        throw createBusinessError('已取消的采购订单不能收货');
      }
      if (order.status === 'completed') {
        throw createBusinessError('已完成的采购订单不能再次收货');
      }
      if (!order.supplier_code) {
        throw createBusinessError('供应商缺少编码，无法生成可追溯的来料批次号');
      }

      const inspections = [];

      for (const item of receivingItems) {
        await PurchaseOrderStatusService.updateOrderItemReceivedQuantity(
          cleanOrderId,
          item.material_id,
          item.receive_quantity,
          connection
        );

        const itemContext = await this.getOrderItemContext(
          connection,
          cleanOrderId,
          item.material_id
        );
        const batchNo =
          item.batch_no ||
          item.batchNo ||
          (await this.generateBatchNo(connection, order.supplier_code, order.supplier_id));

        const inspectionPayload = {
          inspection_type: 'incoming',
          material_id: item.material_id,
          material_code: item.material_code || item.materialCode || itemContext.material_code,
          material_name: item.material_name || item.materialName || itemContext.material_name,
          supplier_id: order.supplier_id,
          supplier_name: order.supplier_name,
          batch_no: batchNo,
          quantity: item.receive_quantity,
          reference_id: cleanOrderId,
          reference_no: order.order_no,
          unit: item.unit_name || item.unit || itemContext.unit_name || '个',
          unit_id: item.unit_id || item.unitId || itemContext.unit_id || null,
          planned_date: todayString(),
          actual_date: null,
          status: 'pending',
          template_id: item.template_id || item.templateId || null,
          note: `采购收货自动生成来料检验单 - 供应商: ${order.supplier_name}`,
        };

        const inspection = await QualityInspection.createInspection(
          inspectionPayload,
          connection
        );

        if (inspection.is_exempt) {
          await InspectionClosureService.closeIfTerminal(
            inspection,
            {
              id: inspection.id,
              status: 'passed',
              qualified_quantity: item.receive_quantity,
              unqualified_quantity: 0,
            },
            connection
          );
        }

        inspections.push({
          id: inspection.id,
          inspection_no: inspection.inspection_no,
          material_id: item.material_id,
          material_name: inspectionPayload.material_name,
          quantity: item.receive_quantity,
          batch_no: batchNo,
          is_exempt: Boolean(inspection.is_exempt),
        });
      }

      const orderStatus = await PurchaseOrderStatusService.updateOrderStatus(
        cleanOrderId,
        connection
      );

      await connection.commit();

      logger.info(
        `[PurchaseReceiveInspectionService] 订单${cleanOrderId}收货并生成${inspections.length}张来料检验单`
      );

      return {
        orderId: cleanOrderId,
        orderNo: order.order_no,
        successCount: inspections.length,
        failedCount: 0,
        skippedCount: 0,
        inspections,
        orderStatus: orderStatus?.status || order.status,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('[PurchaseReceiveInspectionService] 收货并生成来料检验失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getOrderContext(connection, orderId) {
    const [rows] = await connection.query(
      `SELECT
        po.id,
        po.order_no,
        po.supplier_id,
        COALESCE(po.supplier_name, s.name) AS supplier_name,
        po.status,
        s.code AS supplier_code
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      WHERE po.id = ? AND po.deleted_at IS NULL
      FOR UPDATE`,
      [orderId]
    );

    if (!rows || rows.length === 0) {
      throw createBusinessError('采购订单不存在', 404);
    }

    return rows[0];
  }

  static async getOrderItemContext(connection, orderId, materialId) {
    const [rows] = await connection.query(
      `SELECT
        poi.material_id,
        COALESCE(poi.material_code, m.code) AS material_code,
        COALESCE(poi.material_name, m.name) AS material_name,
        COALESCE(poi.specification, m.specs) AS specification,
        COALESCE(poi.unit_id, m.unit_id) AS unit_id,
        COALESCE(u1.name, u2.name, poi.unit) AS unit_name
      FROM purchase_order_items poi
      LEFT JOIN materials m ON poi.material_id = m.id
      LEFT JOIN units u1 ON poi.unit_id = u1.id
      LEFT JOIN units u2 ON m.unit_id = u2.id
      WHERE poi.order_id = ? AND poi.material_id = ?
      LIMIT 1`,
      [orderId, materialId]
    );

    if (!rows || rows.length === 0) {
      throw createBusinessError(`采购订单物料不存在: 物料ID=${materialId}`);
    }

    return rows[0];
  }

  static async generateBatchNo(connection, supplierCode, supplierId) {
    const date = new Date();
    const dateStr = `${String(date.getFullYear()).slice(-2)}${String(
      date.getMonth() + 1
    ).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;

    // 基于已生成批次号取序号数值最大值（而非检验单行数），避免软删除导致计数回退撞号、并发重号
    const likePrefix = `PUR-${supplierCode}-${dateStr}-`;
    const [rows] = await connection.query(
      `SELECT MAX(CAST(SUBSTRING(batch_no, ?) AS UNSIGNED)) AS max_seq
       FROM quality_inspections
       WHERE inspection_type = 'incoming' AND supplier_id = ? AND batch_no LIKE ?
       FOR UPDATE`,
      [likePrefix.length + 1, supplierId, `${likePrefix}%`]
    );

    const serialNo = String((rows[0]?.max_seq || 0) + 1).padStart(3, '0');
    return `${likePrefix}${serialNo}`;
  }
}

module.exports = PurchaseReceiveInspectionService;
