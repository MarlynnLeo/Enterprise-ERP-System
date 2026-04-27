/**
 * PurchaseReceiptService.js
 * @description 采购入库单服务 — 处理来料检验合格后的自动入库单创建
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
const businessConfig = require('../../config/businessConfig');

class PurchaseReceiptService {
  /**
   * 免检来料自动创建采购入库单
   * 模拟前端"检验合格 → 创建入库单"的逻辑，在后端直接用SQL完成
   *
   * @param {object} inspectionResult - createInspection 返回的结果（含 id, inspection_no, reference_id, material_id 等）
   * @param {object} originalInspection - 原始请求体
   * @returns {Promise<{receiptId: number, receiptNo: string}>}
   */
  static async autoCreateFromInspection(inspectionResult, originalInspection) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 提取基本参数
      const orderId = inspectionResult.reference_id || originalInspection.reference_id;
      const materialId = inspectionResult.material_id || originalInspection.material_id;
      const qty = parseFloat(inspectionResult.quantity || originalInspection.quantity || 0);
      const inspectionId = inspectionResult.id;
      const inspectionNo = inspectionResult.inspection_no;
      const batchNo = inspectionResult.batch_no || originalInspection.batch_no || '';

      if (!orderId) {
        throw new Error('缺少采购订单引用ID，无法创建入库单');
      }

      // 1. 一次 JOIN 查询获取完整订单上下文（订单、供应商、物料、采购价格）
      const context = await this._getOrderContext(connection, orderId, materialId);

      // 2. 安全仓库路由
      const { warehouseId, warehouseName } = await this._resolveWarehouse(
        connection,
        context.materialLocationId
      );

      // 3. 生成入库单号
      const purchaseModel = require('../../models/purchase');
      const receiptNo = await purchaseModel.generateReceiptNo();

      // 4. 插入采购入库单主表
      const [receiptResult] = await connection.query(
        `INSERT INTO purchase_receipts (
          receipt_no, order_id, order_no, supplier_id, supplier_name,
          warehouse_id, warehouse_name, receipt_date, operator, remarks, status,
          from_inspection, inspection_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          receiptNo,
          orderId,
          context.orderNo,
          context.supplierId,
          context.supplierName,
          warehouseId,
          warehouseName,
          new Date(),
          '系统(自动免检)',
          `免检来料自动生成 - 检验单 ${inspectionNo}`,
          'draft',
          1,
          inspectionId,
        ]
      );

      const receiptId = receiptResult.insertId;

      // 5. 插入采购入库单明细
      await connection.query(
        `INSERT INTO purchase_receipt_items (
          receipt_id, material_id, material_code, material_name,
          specification, unit_id, ordered_quantity, quantity,
          received_quantity, qualified_quantity, batch_number, price,
          remarks, from_inspection
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          receiptId,
          materialId,
          context.materialCode,
          context.materialName,
          context.materialSpecs || '',
          context.unitId,
          qty,
          qty,
          qty,
          qty,
          batchNo,
          context.price,
          `免检自动入库 - ${inspectionNo}`,
          1,
        ]
      );

      await connection.commit();
      logger.info(
        `📦 自动创建采购入库单 ${receiptNo} (ID: ${receiptId})，来源检验单 ${inspectionNo}`
      );

      return { receiptId, receiptNo };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
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
  static async _getOrderContext(connection, orderId, materialId) {
    const [rows] = await connection.query(
      `SELECT
        po.id        AS order_id,
        po.order_no  AS order_no,
        po.supplier_id,
        s.name       AS supplier_name,
        m.code       AS material_code,
        m.name       AS material_name,
        m.specs      AS material_specs,
        m.location_id AS material_location_id,
        m.unit_id,
        poi.price
      FROM purchase_orders po
        LEFT JOIN suppliers s       ON po.supplier_id = s.id
        LEFT JOIN materials m       ON m.id = ?
        LEFT JOIN purchase_order_items poi
          ON poi.order_id = po.id AND poi.material_id = ?
      WHERE po.id = ?
      LIMIT 1`,
      [materialId, materialId, orderId]
    );

    if (!rows || rows.length === 0) {
      throw new Error(`采购订单 ${orderId} 不存在`);
    }

    const row = rows[0];
    return {
      orderNo: row.order_no || '',
      supplierId: row.supplier_id,
      supplierName: row.supplier_name || '',
      materialCode: row.material_code || '',
      materialName: row.material_name || '',
      materialSpecs: row.material_specs || '',
      materialLocationId: row.material_location_id,
      unitId: row.unit_id,
      price: parseFloat(row.price) || 0,
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
      logger.warn(
        `⚠️ 物料默认仓库 ${materialLocationId} 不存在或已禁用，尝试使用系统默认仓库`
      );
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
      logger.warn(
        `⚠️ 系统默认仓库 ${defaultId} 不存在或已禁用`
      );
    }

    // 策略3: 无可用仓库，抛出明确错误
    throw new Error(
      '找不到可用仓库，无法自动创建入库单。请检查物料的默认仓库设置或系统默认仓库配置(环境变量 DEFAULT_WAREHOUSE_ID)'
    );
  }
}

module.exports = PurchaseReceiptService;
