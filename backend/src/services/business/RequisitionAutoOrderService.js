/**
 * RequisitionAutoOrderService.js
 * @description 采购申请批准后自动生成采购订单的独立服务
 * @date 2026-04-22
 *
 * 从 purchaseRequisitionController.updateRequisitionStatus 中提取，
 * 供控制器直接调用和工作流回调共用。
 */

const { pool } = require('../../config/db');
const { logger } = require('../../utils/logger');
const { financeConfig } = require('../../config/financeConfig');
const PurchasePriceService = require('./PurchasePriceService');
const PurchaseOrderService = require('../PurchaseOrderService');
const {
  lineAmount,
  normalizeTaxRate,
  roundMoney,
  sumMoney,
  taxAmount: calculateTaxAmount,
  toNumber,
} = require('../../utils/money');
const { currentDateString } = require('../../utils/dateUtils');

/**
 * 采购申请批准后自动生成采购订单
 * @param {number} requisitionId - 采购申请ID
 * @param {object} conn - 数据库连接（可选，不传则自行获取）
 * @returns {Array} 生成的采购订单列表
 */
async function generateOrdersFromRequisition(requisitionId, conn) {
  const useOwnConn = !conn;
  if (useOwnConn) conn = await pool.getConnection();

  const generatedOrders = [];
  try {
    if (useOwnConn) await conn.beginTransaction();

    logger.info(`✅ 采购申请 ${requisitionId} 已批准，开始自动生成采购订单...`);

    // 获取采购申请的基本信息
    const [requisitionRows] = await conn.execute(
      `SELECT id, requisition_number, request_date, requester, contract_code,
              real_name, remarks, status, source_type, source_id, source_material_id,
              created_at, updated_at, deleted_at
       FROM purchase_requisitions WHERE id = ? FOR UPDATE`,
      [requisitionId]
    );
    if (requisitionRows.length === 0) {
      throw new Error('采购申请不存在');
    }
    const requisition = requisitionRows[0];

    // 获取采购申请的物料项，关联物料表获取供应商信息和价格
    const [itemsRows] = await conn.execute(
      `SELECT
        pri.id, pri.requisition_id, pri.material_id, pri.material_code,
        pri.material_name, pri.specification, pri.unit, pri.unit_id, pri.quantity,
        m.supplier_id,
        m.code as m_code,
        m.name as m_name,
        m.specs as material_specs,
        m.unit_id as m_unit_id,
        COALESCE(m.cost_price, 0) as material_price,
        u.name as unit_name,
        s.id as s_supplier_id,
        s.name as supplier_name,
        s.contact_person as supplier_contact_person,
        s.contact_phone as supplier_contact_phone
      FROM purchase_requisition_items pri
      LEFT JOIN materials m ON pri.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      LEFT JOIN suppliers s ON m.supplier_id = s.id
      WHERE pri.requisition_id = ?
      ORDER BY pri.id`,
      [requisitionId]
    );

    if (itemsRows.length === 0) {
      logger.warn(`⚠️ 采购申请 ${requisitionId} 没有物料项，跳过生成采购订单`);
      if (useOwnConn) await conn.commit();
      return generatedOrders;
    }

    // 按供应商分组物料（未维护供应商的物料使用特殊分组键，供应商留空后续补充）
    const NO_SUPPLIER_KEY = '__no_supplier__';
    const itemsBySupplier = {};

    for (const item of itemsRows) {
      const groupKey = item.supplier_id || NO_SUPPLIER_KEY;
      if (!itemsBySupplier[groupKey]) {
        itemsBySupplier[groupKey] = {
          supplier_id: item.supplier_id || null,
          supplier_name: item.supplier_name || null,
          contact_person: item.supplier_contact_person || null,
          contact_phone: item.supplier_contact_phone || null,
          items: [],
        };
      }
      itemsBySupplier[groupKey].items.push(item);
    }

    if (itemsBySupplier[NO_SUPPLIER_KEY]) {
      const missingMaterials = itemsBySupplier[NO_SUPPLIER_KEY].items
        .map(item => item.material_code || item.m_code || item.material_name || item.material_id)
        .join(', ');
      logger.warn(`⚠️ 采购申请 ${requisitionId} 存在未维护供应商的物料（将生成供应商为空的采购订单，后续可补充）: ${missingMaterials}`);
    }

    const purchaseModel = require('../../models/purchase');
    const defaultTaxRate = normalizeTaxRate(financeConfig.get('tax.defaultVATRate', 0), 0);
    const resolvedPrices = await PurchasePriceService.resolvePurchasePrices(
      conn,
      itemsRows.map((item) => ({
        materialId: item.material_id,
        materialCode: item.material_code || item.m_code,
        supplierId: item.supplier_id,
      }))
    );

    itemsRows.forEach((item, index) => {
      const priceInfo = resolvedPrices[index] || {};
      const resolvedTaxRate = normalizeTaxRate(priceInfo.tax_rate, defaultTaxRate);
      item.material_price = toNumber(priceInfo.price, 0);
      item.tax_rate = resolvedTaxRate > 0 ? resolvedTaxRate : defaultTaxRate;
      item.price_source = priceInfo.source || 'none';
    });

    // 为每个供应商生成采购订单
    for (const supplierId in itemsBySupplier) {
      const supplierData = itemsBySupplier[supplierId];
      const orderNo = await purchaseModel.generateOrderNo(conn);

      const calculatedItems = supplierData.items.map((item) => {
        const quantity = toNumber(item.quantity, 0);
        const price = toNumber(item.material_price, 0);
        const subtotal = lineAmount(quantity, price);
        const taxRate = normalizeTaxRate(item.tax_rate, defaultTaxRate);
        const itemTaxAmount = calculateTaxAmount(subtotal, taxRate);

        return {
          ...item,
          quantity,
          price,
          subtotal,
          tax_rate: taxRate,
          tax_amount: itemTaxAmount,
        };
      });
      const subtotal = sumMoney(calculatedItems.map((item) => item.subtotal));
      const taxAmountTotal = sumMoney(calculatedItems.map((item) => item.tax_amount));
      const totalAmount = roundMoney(subtotal + taxAmountTotal);

      const [orderResult] = await conn.execute(
        `INSERT INTO purchase_orders (
          order_no, order_date, supplier_id, supplier_name, contract_code,
          expected_delivery_date, contact_person, contact_phone,
          subtotal, tax_rate, tax_amount, total_amount, remarks, status, requisition_id, requisition_number
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderNo,
          currentDateString(),
          supplierData.supplier_id,
          supplierData.supplier_name || '待指定',
          requisition.contract_code || null,
          null,
          supplierData.contact_person,
          supplierData.contact_phone,
          subtotal,
          defaultTaxRate,
          taxAmountTotal,
          totalAmount,
          `由采购申请 ${requisition.requisition_number || requisitionId} 自动生成`,
          'draft',
          requisitionId,
          requisition.requisition_number,
        ]
      );
      const orderId = orderResult.insertId;

      // 通过统一 API 插入订单明细（PurchaseOrderService 负责字段映射和校验）
      const orderItems = calculatedItems.map((item) => ({
        material_id: item.material_id,
        material_code: item.material_code || item.m_code,
        material_name: item.material_name || item.m_name,
        specification: item.material_specs || item.specification,
        unit_id: item.unit_id || item.m_unit_id,
        price: item.price,
        quantity: item.quantity,
        tax_rate: item.tax_rate,
        tax_amount: item.tax_amount,
        total_price: item.subtotal,
      }));
      await PurchaseOrderService.insertOrderItems(conn, orderId, orderItems);

      generatedOrders.push({
        order_id: orderId,
        order_no: orderNo,
        supplier_name: supplierData.supplier_name,
        total_amount: totalAmount,
        items_count: supplierData.items.length,
      });

      // 自动创建单据关联
      try {
        const DocumentLinkService = require('./DocumentLinkService');
        await DocumentLinkService.tryAutoLink(
          'purchase_requisition', requisitionId, requisition.requisition_number,
          'purchase_order', orderId, orderNo, null, conn
        );
      } catch (linkErr) {
        logger.warn(`单据关联创建失败: ${linkErr.message}`);
      }

      logger.info(`✅ 成功生成采购订单 ${orderNo}，供应商: ${supplierData.supplier_name}，物料数量: ${supplierData.items.length}`);
    }

    logger.info(`✅ 采购申请 ${requisitionId} 共生成了 ${generatedOrders.length} 个采购订单`);

    if (useOwnConn) await conn.commit();
    return generatedOrders;
  } catch (err) {
    if (useOwnConn) await conn.rollback();
    logger.error(`采购申请 ${requisitionId} 自动生成采购订单失败:`, err);
    throw err;
  } finally {
    if (useOwnConn) conn.release();
  }
}

module.exports = { generateOrdersFromRequisition };
