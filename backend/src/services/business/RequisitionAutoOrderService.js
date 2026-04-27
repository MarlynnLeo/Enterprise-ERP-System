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
      'SELECT * FROM purchase_requisitions WHERE id = ?',
      [requisitionId]
    );
    if (requisitionRows.length === 0) {
      throw new Error('采购申请不存在');
    }
    const requisition = requisitionRows[0];

    // 获取采购申请的物料项，关联物料表获取供应商信息和价格
    const [itemsRows] = await conn.execute(
      `SELECT 
        pri.*,
        m.supplier_id,
        m.code as material_code,
        m.name as material_name,
        m.specs as material_specs,
        m.unit_id,
        COALESCE(m.cost_price, m.price, 0) as material_price,
        u.name as unit_name,
        s.id as supplier_id,
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

    // 按供应商分组物料
    const itemsBySupplier = {};
    const itemsWithoutSupplier = [];

    for (const item of itemsRows) {
      if (item.supplier_id) {
        if (!itemsBySupplier[item.supplier_id]) {
          itemsBySupplier[item.supplier_id] = {
            supplier_id: item.supplier_id,
            supplier_name: item.supplier_name,
            contact_person: item.supplier_contact_person,
            contact_phone: item.supplier_contact_phone,
            items: [],
          };
        }
        itemsBySupplier[item.supplier_id].items.push(item);
      } else {
        itemsWithoutSupplier.push(item);
      }
    }

    const purchaseModel = require('../../models/purchase');

    // 为每个供应商生成采购订单
    for (const supplierId in itemsBySupplier) {
      const supplierData = itemsBySupplier[supplierId];
      const orderNo = await purchaseModel.generateOrderNo(conn);

      let totalAmount = 0;
      for (const item of supplierData.items) {
        totalAmount += (parseFloat(item.quantity) || 0) * (parseFloat(item.material_price) || 0);
      }

      const [orderResult] = await conn.execute(
        `INSERT INTO purchase_orders (
          order_no, order_date, supplier_id, supplier_name, contract_code,
          expected_delivery_date, contact_person, contact_phone,
          total_amount, remarks, status, requisition_id, requisition_number
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderNo,
          new Date().toISOString().split('T')[0],
          supplierData.supplier_id,
          supplierData.supplier_name,
          requisition.contract_code || null,
          null,
          supplierData.contact_person,
          supplierData.contact_phone,
          totalAmount,
          `由采购申请 ${requisition.requisition_number || requisitionId} 自动生成`,
          'draft',
          requisitionId,
          requisition.requisition_number,
        ]
      );
      const orderId = orderResult.insertId;

      for (const item of supplierData.items) {
        const quantity = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.material_price) || 0;
        const total = quantity * price;
        const taxRate = 0.13;
        const taxAmount = total * taxRate;

        await conn.execute(
          `INSERT INTO purchase_order_items (
            order_id, material_id, material_code, material_name,
            specification, quantity, price, total,
            unit, unit_id, tax_rate, tax_amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [orderId, item.material_id, item.material_code, item.material_name,
           item.material_specs, quantity, price, total,
           item.unit_name, item.unit_id, taxRate, taxAmount]
        );
      }

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

    // 没有供应商的物料也要生成采购订单
    if (itemsWithoutSupplier.length > 0) {
      logger.info(`📝 有 ${itemsWithoutSupplier.length} 个物料没有设置供应商，仍然生成采购订单（供应商待指定）`);

      const orderNo = await purchaseModel.generateOrderNo(conn);
      let totalAmount = 0;
      for (const item of itemsWithoutSupplier) {
        totalAmount += (parseFloat(item.quantity) || 0) * (parseFloat(item.material_price) || 0);
      }

      const [orderResult] = await conn.execute(
        `INSERT INTO purchase_orders (
          order_no, order_date, supplier_id, supplier_name, contract_code,
          expected_delivery_date, contact_person, contact_phone,
          total_amount, remarks, status, requisition_id, requisition_number
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderNo,
          new Date().toISOString().split('T')[0],
          null,
          '待指定供应商',
          requisition.contract_code || null,
          null, null, null,
          totalAmount,
          `由采购申请 ${requisition.requisition_number || requisitionId} 自动生成（供应商待指定）`,
          'draft',
          requisitionId,
          requisition.requisition_number,
        ]
      );
      const orderId = orderResult.insertId;

      for (const item of itemsWithoutSupplier) {
        const quantity = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.material_price) || 0;
        const total = quantity * price;
        const taxRate = 0.13;
        const taxAmount = total * taxRate;

        await conn.execute(
          `INSERT INTO purchase_order_items (
            order_id, material_id, material_code, material_name,
            specification, quantity, price, total,
            unit, unit_id, tax_rate, tax_amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [orderId, item.material_id, item.material_code, item.material_name,
           item.material_specs, quantity, price, total,
           item.unit_name, item.unit_id, taxRate, taxAmount]
        );
      }

      generatedOrders.push({
        order_id: orderId,
        order_no: orderNo,
        supplier_name: '待指定供应商',
        total_amount: totalAmount,
        items_count: itemsWithoutSupplier.length,
      });

      logger.info(`✅ 成功生成采购订单 ${orderNo}（供应商待指定），物料数量: ${itemsWithoutSupplier.length}`);
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
