/**
 * PurchaseOrderService.js
 * @description 采购订单服务类 - 统一处理重复的业务逻辑
 * @date 2025-09-29
 * @version 1.0.0
 */

const { logger } = require('../utils/logger');
const { lineAmount, normalizeTaxRate, roundMoney, taxAmount, toNumber } = require('../utils/money');
const { resolveUnitPrice } = require('../utils/unitPriceFields');

function createBusinessError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = statusCode === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR';
  return error;
}

class PurchaseOrderService {
  /**
   * 获取物料信息
   * @param {Object} connection - 数据库连接
   * @param {number} materialId - 物料ID
   * @returns {Object|null} 物料信息
   */
  static async getMaterialInfo(connection, materialId) {
    try {
      const [rows] = await connection.query(
        'SELECT code, name, specs, unit_id FROM materials WHERE id = ? AND deleted_at IS NULL',
        [materialId]
      );
      return rows[0] || null;
    } catch (error) {
      logger.error(`查询物料信息失败，物料ID: ${materialId}`, error);
      throw error;
    }
  }

  /**
   * 获取供应商信息
   * @param {Object} connection - 数据库连接
   * @param {number} supplierId - 供应商ID
   * @returns {Object|null} 供应商信息
   */
  static async getSupplierInfo(connection, supplierId) {
    try {
      const [rows] = await connection.query('SELECT name FROM suppliers WHERE id = ? AND deleted_at IS NULL', [
        supplierId,
      ]);
      return rows[0] || null;
    } catch (error) {
      logger.error(`查询供应商信息失败，供应商ID: ${supplierId}`, error);
      throw error;
    }
  }

  /**
   * Recalculate requisition completion from active purchase orders.
   * A requisition is completed only when every requested material quantity has
   * been covered by non-cancelled, non-deleted purchase orders.
   * @param {Object} connection - 数据库连接
   * @param {number} requisitionId - 申请单ID
   */
  static async syncRequisitionStatusFromOrders(connection, requisitionId) {
    if (!requisitionId) return null;

    const [requisitionRows] = await connection.query(
      'SELECT id, status FROM purchase_requisitions WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [requisitionId]
    );
    if (requisitionRows.length === 0) {
      throw createBusinessError(`purchase requisition not found: ${requisitionId}`, 404);
    }
    const currentStatus = requisitionRows[0].status;
    if (!['approved', 'completed'].includes(currentStatus)) {
      throw createBusinessError(
        `purchase requisition ${requisitionId} status ${currentStatus} cannot be linked to purchase orders`
      );
    }

    const [requisitionItems] = await connection.query(
      `SELECT material_id, material_code, quantity
       FROM purchase_requisition_items
       WHERE requisition_id = ?`,
      [requisitionId]
    );
    if (requisitionItems.length === 0) {
      throw createBusinessError(`purchase requisition ${requisitionId} has no material items`);
    }

    const [orderedItems] = await connection.query(
      `SELECT poi.material_id, poi.material_code, SUM(COALESCE(poi.quantity, 0)) AS ordered_quantity
       FROM purchase_order_items poi
       JOIN purchase_orders po ON poi.order_id = po.id
       WHERE po.requisition_id = ?
         AND po.deleted_at IS NULL
         AND po.status <> 'cancelled'
       GROUP BY poi.material_id, poi.material_code`,
      [requisitionId]
    );

    const requiredQuantityByKey = new Map();
    requisitionItems.forEach((item) => {
      const key = this.getPrimaryMaterialMatchKey(item);
      if (!key) {
        throw createBusinessError('purchase requisition item is missing material identity');
      }
      requiredQuantityByKey.set(
        key,
        (requiredQuantityByKey.get(key) || 0) + (parseFloat(item.quantity) || 0)
      );
    });

    const orderedQuantityByKey = new Map();
    orderedItems.forEach((item) => {
      const key = this.getPrimaryMaterialMatchKey(item);
      if (!key) return;
      orderedQuantityByKey.set(
        key,
        (orderedQuantityByKey.get(key) || 0) + (parseFloat(item.ordered_quantity) || 0)
      );
    });

    let totalRequired = 0;
    let totalOrdered = 0;
    const allOrdered = [...requiredQuantityByKey.entries()].every(([key, requiredQuantity]) => {
      const orderedQuantity = orderedQuantityByKey.get(key) || 0;
      totalRequired += requiredQuantity;
      totalOrdered += Math.min(orderedQuantity, requiredQuantity);
      return orderedQuantity + 0.0001 >= requiredQuantity;
    });

    const nextStatus = allOrdered ? 'completed' : 'approved';
    if (nextStatus !== currentStatus) {
      const [updateResult] = await connection.query(
        `UPDATE purchase_requisitions
         SET status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND deleted_at IS NULL`,
        [nextStatus, requisitionId]
      );
      if (!updateResult || updateResult.affectedRows === 0) {
        throw createBusinessError(`failed to update purchase requisition status: ${requisitionId}`);
      }
    }

    logger.info(
      `Purchase requisition status synchronized: requisitionId=${requisitionId}, from=${currentStatus}, to=${nextStatus}, ordered=${totalOrdered}, required=${totalRequired}`
    );

    return {
      requisitionId,
      status: nextStatus,
      previousStatus: currentStatus,
      totalRequired,
      totalOrdered,
      completed: allOrdered,
    };
  }

  static getPrimaryMaterialMatchKey(item = {}) {
    const materialId = Number(item.material_id);
    const materialCode = String(item.material_code || '').trim();
    if (Number.isInteger(materialId) && materialId > 0) {
      return `id:${materialId}`;
    }
    if (materialCode) {
      return `code:${materialCode}`;
    }
    return null;
  }

  /**
   * Backward-compatible entry point. Completion is derived from quantities
   * instead of being written directly by callers.
   */
  static async updateRequisitionStatus(connection, requisitionId, status = 'completed') {
    if (status === 'completed') {
      return this.syncRequisitionStatusFromOrders(connection, requisitionId);
    }

    const [updateResult] = await connection.query(
      `UPDATE purchase_requisitions
       SET status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL`,
      [status, requisitionId]
    );
    if (!updateResult || updateResult.affectedRows === 0) {
      throw createBusinessError(`failed to update purchase requisition status: ${requisitionId}`);
    }
    return { requisitionId, status };
  }

  /**
   * 处理物料项目信息补充
   * @param {Object} connection - 数据库连接
   * @param {Object} item - 物料项目
   * @returns {Object} 处理后的物料项目
   */
  static async processOrderItem(connection, item) {
    const {
      material_id,
      material_code,
      material_name,
      specification,
      unit_id,
      price,
      unit_price,
      quantity,
      total_price: totalPrice,
    } = item;

    // 库列权威名为 price；入参兼容 unit_price / unitPrice
    const hasRaw =
      (price !== null && price !== undefined && price !== '') ||
      (unit_price !== null && unit_price !== undefined && unit_price !== '') ||
      (item.unitPrice !== null && item.unitPrice !== undefined && item.unitPrice !== '');
    if (!hasRaw) {
      throw new Error(`物料 ${material_code || material_id} 的单价缺失，请先维护采购价格`);
    }
    const itemPrice = resolveUnitPrice(item, { fallback: Number.NaN });
    const itemQuantity = toNumber(quantity, 0);
    const itemTaxRate = normalizeTaxRate(item.tax_rate ?? item.taxPercent ?? item.tax_percent, 0);
    const itemAmount = totalPrice !== undefined
      ? roundMoney(totalPrice)
      : lineAmount(itemQuantity, itemPrice);
    const itemTaxAmount = item.tax_amount !== undefined || item.taxAmount !== undefined
      ? roundMoney(item.tax_amount ?? item.taxAmount)
      : taxAmount(itemAmount, itemTaxRate);

    let itemCode = material_code;
    // 如果缺少物料代码或物料名称，从数据库中查询补全
    let itemName = material_name;
    let itemSpec = specification || '';
    let itemUnitId = unit_id;

    if (!itemCode || !itemName) {
      const materialInfo = await this.getMaterialInfo(connection, material_id);

      if (materialInfo) {
        itemCode = itemCode || materialInfo.code;
        itemName = itemName || materialInfo.name;
        itemSpec = itemSpec || materialInfo.specs || '';
        itemUnitId = itemUnitId || materialInfo.unit_id;
      }
    }

    // 检查必须字段
    if (!itemCode || !itemName) {
      throw new Error(`物料信息不完整，ID: ${material_id}, 编码: ${itemCode}, 名称: ${itemName}`);
    }

    // 数据完整性校验：价格和数量必须为非负数
    if (itemQuantity <= 0) {
      throw new Error(`物料 ${itemCode} 的数量必须大于0，当前值: ${quantity}`);
    }
    if (!Number.isFinite(itemPrice) || itemPrice < 0) {
      throw new Error(`物料 ${itemCode} 的单价不能为负数，当前值: ${itemPrice}`);
    }

    return {
      material_id,
      material_code: itemCode,
      material_name: itemName,
      specification: itemSpec,
      unit_id: itemUnitId,
      price: itemPrice, // 写入 purchase_order_items.price
      unit_price: itemPrice, // 内存双写，便于后续逻辑统一读取
      quantity: itemQuantity,
      tax_rate: itemTaxRate,
      tax_amount: itemTaxAmount,
      amount: itemAmount,
      metal_symbol: item.metal_symbol || null,
      metal_price: item.metal_price ?? null,
      metal_price_min: item.metal_price_min ?? null,
      metal_price_max: item.metal_price_max ?? null,
      metal_price_band_label: item.metal_price_band_label || null,
      price_source: item.price_source || null,
      metal_price_scheme_id: item.metal_price_scheme_id ?? null,
      metal_price_item_id: item.metal_price_item_id ?? null,
    };
  }

  /**
   * 批量处理订单物料项目
   * @param {Object} connection - 数据库连接
   * @param {Array} items - 物料项目数组
   * @returns {Array} 处理后的物料项目数组
   */
  static async processOrderItems(connection, items) {
    if (!items || items.length === 0) {
      return [];
    }

    const processedItems = [];
    for (const item of items) {
      const processedItem = await this.processOrderItem(connection, item);
      processedItems.push(processedItem);
    }

    return processedItems;
  }

  /**
   * 插入订单物料项目
   * @param {Object} connection - 数据库连接
   * @param {number} orderId - 订单ID
   * @param {Array} items - 物料项目数组
   */
  static async insertOrderItems(connection, orderId, items) {
    if (!items || items.length === 0) {
      return;
    }

    const processedItems = await this.processOrderItems(connection, items);

    if (processedItems.length === 0) {
      return;
    }

    const placeholders = processedItems.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const values = [];
    for (const item of processedItems) {
      values.push(
        orderId,
        item.material_id,
        item.material_code,
        item.material_name,
        item.specification,
        null, // unit字段设为null
        item.unit_id,
        item.price,
        item.quantity,
        item.amount,
        item.amount,
        item.tax_rate,
        item.tax_amount,
        item.metal_symbol || null,
        item.metal_price ?? null,
        item.metal_price_min ?? null,
        item.metal_price_max ?? null,
        item.metal_price_band_label || null,
        item.price_source || null,
        item.metal_price_scheme_id ?? null,
        item.metal_price_item_id ?? null
      );
    }

    await connection.query(
      `INSERT INTO purchase_order_items
      (order_id, material_id, material_code, material_name, specification, unit, unit_id, price, quantity, total, amount_excluding_tax, tax_rate, tax_amount, metal_symbol, metal_price, metal_price_min, metal_price_max, metal_price_band_label, price_source, metal_price_scheme_id, metal_price_item_id)
      VALUES ${placeholders}`,
      values
    );
  }

  /**
   * 验证供应商存在性
   * @param {Object} connection - 数据库连接
   * @param {number} supplierId - 供应商ID
   * @returns {string} 供应商名称
   * @throws {Error} 供应商不存在时抛出错误
   */
  static async validateSupplier(connection, supplierId) {
    const supplierInfo = await this.getSupplierInfo(connection, supplierId);

    if (!supplierInfo) {
      throw new Error('供应商不存在');
    }

    return supplierInfo.name;
  }

  /**
   * 验证订单状态是否可编辑
   * @param {Object} connection - 数据库连接
   * @param {number} orderId - 订单ID
   * @returns {Object} 订单信息
   * @throws {Error} 订单不存在或状态不可编辑时抛出错误
   */
  static async validateOrderEditable(connection, orderId) {
    const [checkRows] = await connection.query('SELECT status, requisition_id FROM purchase_orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [
      orderId,
    ]);

    if (checkRows.length === 0) {
      throw new Error('purchase order not found');
    }

    const currentStatus = checkRows[0].status;
    if (currentStatus !== 'pending' && currentStatus !== 'draft') {
      throw new Error('只能编辑待处理或草稿状态的采购订单');
    }

    return checkRows[0];
  }
}

module.exports = PurchaseOrderService;
