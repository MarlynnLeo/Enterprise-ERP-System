/**
 * PurchaseReceiptService.js
 * @description 采购入库单服务 — 处理来料检验结案后的自动收货单创建与同步
 * @date 2026-04-03
 * @version 1.0.0
 *
 * 职责：
 * - 免检来料自动创建采购入库单
 * - 仓库路由（物料默认仓库 → 系统配置默认仓库 → 报错）
 * - 订单上下文聚合查询（一次 JOIN 替代多次顺序查询）
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');
const crypto = require('crypto');
const businessConfig = require('../../config/businessConfig');
const {
  lineAmount,
  normalizeTaxRate,
  roundMoney,
  taxAmount: calculateTaxAmount,
} = require('../../utils/money');
const { financeConfig } = require('../../config/financeConfig');
const { firstValidUserId } = require('../../utils/userUtils');
const { RECEIPT_STATUS } = require('../../constants/purchaseConstants');
const {
  normalizeTerminalInspectionQuantities,
} = require('../../utils/quality/inspectionQuantities');
const { purchaseValidationError } = require('../../utils/purchase/purchaseValidation');
const { resolveInspectionSourceType } = require('../../utils/quality/inspectionSource');
const InspectionLockService = require('./InspectionLockService');

class PurchaseReceiptService {
  static payloadHash(value) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(value || {}))
      .digest('hex');
  }

  /**
   * 检验闭环：推进明确关联的采购收货单，或为合格数量创建已检验收货单。
   * 采购订单不是到货批次的唯一标识，不按订单/物料猜测收货单关联。
   *
   * @param {object} inspectionResult - createInspection 返回的结果（含 id, inspection_no, reference_id, material_id 等）
   * @param {object} originalInspection - 原始请求体
   * @returns {Promise<{receiptId: number, receiptNo: string}>}
   */
  static async autoCreateFromInspection(
    inspectionResult,
    originalInspection,
    externalConnection = null
  ) {
    const connection = externalConnection || (await db.pool.getConnection());
    const useOwnConnection = !externalConnection;
    try {
      if (useOwnConnection) {
        await connection.beginTransaction();
      }

      const inspectionId = inspectionResult?.id;
      if (!inspectionId) throw purchaseValidationError('缺少检验单，不能创建采购收货单');
      const inspection = await InspectionLockService.getForUpdate(connection, inspectionId);
      const sourceType = await resolveInspectionSourceType(connection, inspection, {
        persist: true,
      });
      if (inspection.inspection_type !== 'incoming' || sourceType !== 'purchase_order') {
        throw purchaseValidationError('只有采购来料检验可以生成采购收货单');
      }
      const { inspectionQuantity, qualifiedQuantity: qty } = normalizeTerminalInspectionQuantities(
        inspection,
        inspection
      );
      const orderId = inspection.reference_id;
      const materialId = inspection.material_id || inspection.product_id;
      const inspectionNo = inspection.inspection_no;
      const idempotencyKey = `purchase_receipt:inspection:${inspectionId}`;
      const batchNo = String(inspection.batch_no || '').trim();
      const isExempt = Boolean(inspectionResult.is_exempt || originalInspection?.is_exempt);
      const operator = isExempt ? '系统(自动免检)' : inspection.inspector_name || '系统(检验放行)';
      const sourceRemark = isExempt ? '免检来料自动生成' : '来料检验结案自动生成';

      if (!orderId || !materialId || !batchNo) {
        throw purchaseValidationError('检验单缺少采购订单、物料或可追溯批次，不能创建收货单');
      }
      const [existingReceipts] = await connection.query(
        `SELECT id, receipt_no, order_id, status FROM purchase_receipts
          WHERE inspection_id = ? AND deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM document_links dl
                JOIN nonconforming_products ncp ON ncp.id = dl.source_id
               WHERE dl.source_type = 'nonconforming_product'
                 AND dl.target_type = 'purchase_receipt'
                 AND dl.link_type = 'generate'
                 AND dl.target_id = purchase_receipts.id
                 AND ncp.inspection_id = purchase_receipts.inspection_id
            )
          ORDER BY id FOR UPDATE`,
        [inspectionId]
      );
      const activeReceipts = existingReceipts.filter(
        (receipt) => receipt.status !== RECEIPT_STATUS.CANCELLED
      );
      if (activeReceipts.length > 1) {
        throw purchaseValidationError('同一检验单存在多张有效收货单，必须先核对来源关系');
      }
      const existingReceipt = activeReceipts[0] || existingReceipts[0];
      if (existingReceipt?.status === RECEIPT_STATUS.CANCELLED || (!existingReceipt && qty === 0)) {
        if (useOwnConnection) await connection.commit();
        return null;
      }

      // 1. 一次 JOIN 查询获取完整订单上下文（订单、供应商、物料、采购价格）
      const context = await this._getOrderContext(
        connection,
        orderId,
        materialId,
        inspection.purchase_order_item_id || null
      );
      const createdBy = firstValidUserId(inspection.inspector_id, context.orderCreatedBy);
      if (!createdBy) {
        throw new Error('检验单和采购订单均缺少责任人，不能自动创建采购入库单');
      }
      const taxRate = normalizeTaxRate(
        context.taxRate,
        financeConfig.get('tax.defaultVATRate', 0.13)
      );
      const amountExcludingTax = lineAmount(qty, context.price);
      const taxAmount = calculateTaxAmount(amountExcludingTax, taxRate);
      const totalAmount = roundMoney(amountExcludingTax + taxAmount);

      if (existingReceipt) {
        await this._synchronizeReceipt(connection, existingReceipt, {
          orderId,
          materialId,
          inspectionId,
          inspectionQuantity,
          qty,
          batchNo,
          context,
        });
        if (useOwnConnection) await connection.commit();
        return {
          receiptId: existingReceipt.id,
          receiptNo: existingReceipt.receipt_no,
          existed: true,
        };
      }

      // 2. 安全仓库路由
      const { warehouseId, warehouseName } = await this._resolveWarehouse(
        connection,
        context.materialLocationId
      );

      // 3. 生成入库单号
      const purchaseModel = require('../../models/purchase');
      const receiptNo = await purchaseModel.generateReceiptNo(connection);

      // 4. 插入采购入库单主表
      const [receiptResult] = await connection.query(
        `INSERT INTO purchase_receipts (
          receipt_no, order_id, order_no, supplier_id, supplier_name,
          warehouse_id, warehouse_name, receipt_date, operator, remarks, status,
          total_amount, total_tax_amount, from_inspection, inspection_id,
          idempotency_key, idempotency_hash, active_inspection_key, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          receiptNo,
          orderId,
          context.orderNo,
          context.supplierId,
          context.supplierName,
          warehouseId,
          warehouseName,
          new Date(),
          operator,
          `${sourceRemark} - 检验单 ${inspectionNo}`,
          RECEIPT_STATUS.INSPECTED,
          totalAmount,
          taxAmount,
          1,
          inspectionId,
          idempotencyKey,
          this.payloadHash({ orderId, materialId, qty, inspectionId, batchNo }),
          inspectionId ? `INSPECTION:${inspectionId}` : null,
          createdBy,
        ]
      );

      const receiptId = receiptResult.insertId;

      // 5. 插入采购入库单明细
      await connection.query(
        `INSERT INTO purchase_receipt_items (
          receipt_id, order_item_id, material_id, material_code, material_name,
          specification, unit_id, ordered_quantity, quantity,
          received_quantity, qualified_quantity, batch_number, price,
          tax_rate, amount_excluding_tax, tax_amount, total_amount,
          remarks, from_inspection
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          receiptId,
          context.orderItemId,
          materialId,
          context.materialCode,
          context.materialName,
          context.materialSpecs || '',
          context.unitId,
          context.orderedQuantity,
          inspectionQuantity,
          inspectionQuantity,
          qty,
          batchNo,
          context.price,
          taxRate,
          amountExcludingTax,
          taxAmount,
          totalAmount,
          `${sourceRemark} - ${inspectionNo}`,
          1,
        ]
      );

      if (useOwnConnection) {
        await connection.commit();
      }
      logger.info(
        `📦 自动创建采购入库单 ${receiptNo} (ID: ${receiptId})，来源检验单 ${inspectionNo}`
      );

      return { receiptId, receiptNo };
    } catch (error) {
      if (useOwnConnection) {
        await connection.rollback();
      }
      throw error;
    } finally {
      if (useOwnConnection) {
        connection.release();
      }
    }
  }

  static async _synchronizeReceipt(connection, receipt, evidence) {
    const { orderId, materialId, inspectionId, inspectionQuantity, qty, batchNo, context } =
      evidence;
    if (Number(receipt.order_id) !== Number(orderId)) {
      throw purchaseValidationError('收货单与检验单的采购订单不一致');
    }
    const [items] = await connection.query(
      `SELECT id, order_item_id, material_id, received_quantity, qualified_quantity,
              batch_number, price, tax_rate FROM purchase_receipt_items
        WHERE receipt_id = ? ORDER BY id FOR UPDATE`,
      [receipt.id]
    );
    if (
      items.length !== 1 ||
      Number(items[0].material_id) !== Number(materialId) ||
      (items[0].order_item_id && Number(items[0].order_item_id) !== Number(context.orderItemId))
    ) {
      throw purchaseValidationError('检验单必须明确对应收货单的唯一采购明细');
    }
    const item = items[0];
    if (item.batch_number && item.batch_number !== batchNo) {
      throw purchaseValidationError('收货单与检验单的批次不一致');
    }
    if (receipt.status === RECEIPT_STATUS.COMPLETED) {
      if (
        Math.abs(Number(item.qualified_quantity) - qty) > 0.0001 ||
        Math.abs(Number(item.received_quantity) - inspectionQuantity) > 0.0001
      ) {
        throw purchaseValidationError('收货单已经入库，不能修改对应检验数量');
      }
      return;
    }
    if (![RECEIPT_STATUS.DRAFT, RECEIPT_STATUS.INSPECTED].includes(receipt.status)) {
      throw purchaseValidationError('收货单状态无效，不能接收检验结果');
    }
    const price = Number(item.price);
    if (!Number.isFinite(price) || price < 0) throw purchaseValidationError('收货单价无效');
    const taxRate = normalizeTaxRate(item.tax_rate, financeConfig.get('tax.defaultVATRate', 0.13));
    const amount = lineAmount(qty, price);
    const tax = calculateTaxAmount(amount, taxRate);
    const total = roundMoney(amount + tax);
    await connection.query(
      `UPDATE purchase_receipt_items SET order_item_id = ?, quantity = ?, received_quantity = ?,
              qualified_quantity = ?, batch_number = ?, tax_rate = ?, amount_excluding_tax = ?,
              tax_amount = ?, total_amount = ?, from_inspection = 1 WHERE id = ?`,
      [
        context.orderItemId,
        inspectionQuantity,
        inspectionQuantity,
        qty,
        batchNo,
        taxRate,
        amount,
        tax,
        total,
        item.id,
      ]
    );
    await connection.query(
      `UPDATE purchase_receipts SET status = ?, total_amount = ?, total_tax_amount = ?,
              from_inspection = 1, active_inspection_key = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND deleted_at IS NULL`,
      [RECEIPT_STATUS.INSPECTED, total, tax, `INSPECTION:${inspectionId}`, receipt.id]
    );
  }

  /**
   * [内部] 一次 JOIN 查询获取完整订单上下文
   * 替代原来的 5 次顺序查询（订单 → 供应商 → 物料 → 仓库名 → 价格）
   *
   * @param {object} connection - 数据库连接
   * @param {number} orderId - 采购订单ID
   * @param {number} materialId - 物料ID
   * @returns {Promise<object>} 订单上下文
   */
  static async _getOrderContext(connection, orderId, materialId, orderItemId = null) {
    const [rows] = await connection.query(
      `SELECT
        po.id        AS order_id,
        po.order_no  AS order_no,
        po.created_by AS order_created_by,
        po.supplier_id,
        s.name       AS supplier_name,
        m.code       AS material_code,
        m.name       AS material_name,
        m.specs      AS material_specs,
        m.location_id AS material_location_id,
        m.unit_id,
        poi.id       AS order_item_id,
        poi.quantity AS ordered_quantity,
        poi.price,
        poi.tax_rate
      FROM purchase_orders po
        LEFT JOIN suppliers s       ON po.supplier_id = s.id
        LEFT JOIN materials m       ON m.id = ?
        LEFT JOIN purchase_order_items poi
          ON poi.order_id = po.id AND poi.material_id = ?
      WHERE po.id = ? AND po.deleted_at IS NULL AND m.deleted_at IS NULL
        AND (? IS NULL OR poi.id = ?)`,
      [materialId, materialId, orderId, orderItemId, orderItemId]
    );

    if (!rows || rows.length === 0) {
      throw new Error('采购订单不存在或已被删除');
    }

    if (rows.length > 1)
      throw Object.assign(new Error('同物料存在多条采购明细，检验单必须关联具体订单行'), {
        statusCode: 400,
      });
    const row = rows[0];
    if (!row.order_item_id) {
      throw new Error('采购订单中不存在所选物料，无法创建入库单');
    }
    if (!row.material_code || !row.material_name) {
      throw new Error('所选物料基础资料不完整，无法创建入库单');
    }

    return {
      orderItemId: row.order_item_id,
      orderedQuantity: Number(row.ordered_quantity),
      orderNo: row.order_no || '',
      orderCreatedBy: row.order_created_by,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name || '',
      materialCode: row.material_code || '',
      materialName: row.material_name || '',
      materialSpecs: row.material_specs || '',
      materialLocationId: row.material_location_id,
      unitId: row.unit_id,
      price: parseFloat(row.price) || 0,
      taxRate: row.tax_rate,
    };
  }

  /**
   * [内部] 安全仓库路由
   * 优先级：物料默认仓库 → 系统配置默认仓库 → 报错
   *
   * 修复原来的 ORDER BY id LIMIT 1 危险逻辑
   *
   * @param {object} connection - 数据库连接
   * @param {number|null} materialLocationId - 物料表中的默认仓库ID
   * @returns {Promise<{warehouseId: number, warehouseName: string}>}
   */
  static async _resolveWarehouse(connection, materialLocationId) {
    // 策略1: 使用物料默认仓库
    if (materialLocationId) {
      const [locRows] = await connection.query(
        'SELECT id, name FROM locations WHERE id = ? AND status = 1 AND deleted_at IS NULL',
        [materialLocationId]
      );
      if (locRows && locRows.length > 0) {
        return {
          warehouseId: locRows[0].id,
          warehouseName: locRows[0].name || '',
        };
      }
      logger.warn(`⚠️ 物料默认仓库 ${materialLocationId} 不存在或已禁用，尝试使用系统默认仓库`);
    }

    // 策略2: 使用系统配置默认仓库ID
    const defaultId = businessConfig.warehouse.defaultWarehouseId;
    if (defaultId) {
      const [defaultRows] = await connection.query(
        'SELECT id, name FROM locations WHERE id = ? AND status = 1 AND deleted_at IS NULL',
        [defaultId]
      );
      if (defaultRows && defaultRows.length > 0) {
        return {
          warehouseId: defaultRows[0].id,
          warehouseName: defaultRows[0].name || '',
        };
      }
      logger.warn(`⚠️ 系统默认仓库 ${defaultId} 不存在或已禁用`);
    }

    // 策略3: 无可用仓库，抛出明确错误
    throw new Error(
      '找不到可用仓库，无法自动创建入库单。请检查物料的默认仓库设置或系统默认仓库配置(环境变量 DEFAULT_WAREHOUSE_ID)'
    );
  }
}

module.exports = PurchaseReceiptService;
