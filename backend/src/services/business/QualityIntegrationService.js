const { logger } = require('../../utils/logger');
const purchaseModel = require('../../models/purchase');
const InventoryService = require('../InventoryService');
const InventoryTraceabilityService = require('./InventoryTraceabilityService');
const DocumentLinkService = require('./DocumentLinkService');

class QualityIntegrationService {
  static toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  static toDateOnly(value) {
    if (value) return String(value).slice(0, 10);
    return new Date().toISOString().slice(0, 10);
  }

  static createdById(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  }

  static actorName(user, fallback = 'system') {
    return user?.real_name || user?.username || fallback || 'system';
  }

  static async getMaterialContext(materialId, connection) {
    const infoMap = await InventoryService.getBatchMaterialInfo([materialId], connection);
    const material = infoMap.get(materialId);
    if (!material) {
      throw new Error(`Material ${materialId} does not exist`);
    }

    const [warehouseRows] = await connection.query(
      'SELECT id, name FROM locations WHERE id = ? AND deleted_at IS NULL',
      [material.locationId]
    );
    if (warehouseRows.length === 0) {
      throw new Error(`Material ${material.code || materialId} default warehouse does not exist`);
    }

    let unitName = null;
    if (material.unitId) {
      const [unitRows] = await connection.query(
        'SELECT name FROM units WHERE id = ? AND deleted_at IS NULL',
        [material.unitId]
      );
      unitName = unitRows[0]?.name || null;
    }

    return {
      ...material,
      warehouseId: material.locationId,
      warehouseName: warehouseRows[0].name,
      unitName,
    };
  }

  static async getPurchaseOrderContext(replacementOrder, connection) {
    if (!replacementOrder.purchase_order_no) {
      return {};
    }

    const [rows] = await connection.query(
      `SELECT
         po.id AS order_id,
         po.order_no,
         poi.id AS order_item_id,
         poi.price,
         poi.tax_rate,
         poi.specification,
         poi.unit_id,
         poi.unit
       FROM purchase_orders po
       LEFT JOIN purchase_order_items poi
         ON poi.order_id = po.id AND poi.material_id = ?
       WHERE po.order_no = ?
       LIMIT 1`,
      [replacementOrder.material_id, replacementOrder.purchase_order_no]
    );

    return rows[0] || {};
  }

  static async getNcpContext(replacementOrder, connection) {
    if (!replacementOrder.ncp_id) return null;

    const [rows] = await connection.query(
      `SELECT id, ncp_no, inspection_id, inspection_no, created_by
       FROM nonconforming_products
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [replacementOrder.ncp_id]
    );
    return rows[0] || null;
  }

  static async getPurchaseReturnContext(returnNo, connection) {
    if (!returnNo) return null;

    const [rows] = await connection.query(
      'SELECT id, return_no FROM purchase_returns WHERE return_no = ? LIMIT 1',
      [returnNo]
    );
    return rows[0] || null;
  }

  static async nextReplacementReceiptSequence(replacementOrderId, connection) {
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS count
       FROM document_links
       WHERE source_type = 'replacement_order'
         AND source_id = ?
         AND target_type = 'purchase_receipt'`,
      [replacementOrderId]
    );
    return Number(rows[0]?.count || 0) + 1;
  }

  static async buildReplacementBatchNumber(replacementOrder, receiptDate, sequence, connection) {
    const { CodeGenerators } = require('../../utils/codeGenerator');
    return await CodeGenerators.generateReplacementOrderCode(connection);
  }

  static async createReplacementReceipt(
    { replacementOrder, receivedQuantity, actualDate, note, user },
    connection
  ) {
    const receiveQty = this.toNumber(receivedQuantity);
    if (receiveQty <= 0) {
      throw new Error('Replacement receipt quantity must be greater than zero');
    }
    if (!replacementOrder?.id) {
      throw new Error('Replacement order is required');
    }
    if (!replacementOrder.material_id) {
      throw new Error(`Replacement order ${replacementOrder.replacement_no} has no material`);
    }
    if (!replacementOrder.supplier_id || !replacementOrder.supplier_name) {
      throw new Error(`Replacement order ${replacementOrder.replacement_no} has no supplier`);
    }

    const receiptDate = this.toDateOnly(actualDate);
    const operator = this.actorName(user, replacementOrder.created_by);
    const createdBy = this.createdById(user?.id);
    const material = await this.getMaterialContext(replacementOrder.material_id, connection);
    const orderContext = await this.getPurchaseOrderContext(replacementOrder, connection);
    const ncp = await this.getNcpContext(replacementOrder, connection);
    const purchaseReturn = await this.getPurchaseReturnContext(replacementOrder.return_no, connection);
    const receiptNo = await purchaseModel.generateReceiptNo(connection);
    const sequence = await this.nextReplacementReceiptSequence(replacementOrder.id, connection);
    const batchNumber = await this.buildReplacementBatchNumber(replacementOrder, receiptDate, sequence, connection);

    const unitPrice =
      this.toNumber(orderContext.price, 0) ||
      this.toNumber(material.costPrice, 0) ||
      this.toNumber(material.price, 0);
    const taxRate = this.toNumber(orderContext.tax_rate, 13);
    const amountExcludingTax = receiveQty * unitPrice;
    const taxAmount = amountExcludingTax * (taxRate / 100);
    const totalAmount = amountExcludingTax + taxAmount;
    const remarks = [
      `Replacement receipt ${replacementOrder.replacement_no}`,
      replacementOrder.ncp_no ? `NCP ${replacementOrder.ncp_no}` : null,
      replacementOrder.return_no ? `Return ${replacementOrder.return_no}` : null,
      note || null,
    ]
      .filter(Boolean)
      .join(' | ');

    const [receiptResult] = await connection.query(
      `INSERT INTO purchase_receipts (
         receipt_no, order_id, order_no, supplier_id, supplier_name,
         warehouse_id, warehouse_name, receipt_date, operator, remarks,
         total_amount, total_tax_amount, from_inspection, inspection_id, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        receiptNo,
        orderContext.order_id || null,
        orderContext.order_no || replacementOrder.purchase_order_no || replacementOrder.replacement_no,
        replacementOrder.supplier_id,
        replacementOrder.supplier_name,
        material.warehouseId,
        material.warehouseName,
        receiptDate,
        operator,
        remarks,
        totalAmount,
        taxAmount,
        0,
        ncp?.inspection_id || null,
        'completed',
      ]
    );

    const receiptId = receiptResult.insertId;
    await connection.query(
      `INSERT INTO purchase_receipt_items (
         receipt_id, order_item_id, material_id, material_code, material_name,
         specification, unit, unit_id, ordered_quantity, quantity, received_quantity,
         qualified_quantity, batch_number, price, tax_rate, amount_excluding_tax,
         tax_amount, total_amount, remarks, from_inspection
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        receiptId,
        orderContext.order_item_id || null,
        replacementOrder.material_id,
        replacementOrder.material_code || material.code,
        replacementOrder.material_name || material.name,
        orderContext.specification || '',
        orderContext.unit || material.unitName || null,
        orderContext.unit_id || material.unitId || null,
        this.toNumber(replacementOrder.quantity, receiveQty),
        receiveQty,
        receiveQty,
        receiveQty,
        batchNumber,
        unitPrice,
        taxRate,
        amountExcludingTax,
        taxAmount,
        totalAmount,
        `Replacement receipt ${replacementOrder.replacement_no}`,
        0,
      ]
    );

    await InventoryTraceabilityService.handlePurchaseReceipt(
      {
        receipt_id: receiptId,
        receipt_no: receiptNo,
        supplier_id: replacementOrder.supplier_id,
        supplier_name: replacementOrder.supplier_name,
        receipt_date: receiptDate,
        operator,
        items: [
          {
            material_id: replacementOrder.material_id,
            material_code: replacementOrder.material_code || material.code,
            material_name: replacementOrder.material_name || material.name,
            batch_number: batchNumber,
            quantity: receiveQty,
            unit: orderContext.unit || material.unitName || null,
            warehouse_id: material.warehouseId,
            warehouse_name: material.warehouseName,
            receipt_date: receiptDate,
            unit_cost: unitPrice,
            purchase_order_id: orderContext.order_id || null,
            purchase_order_no: orderContext.order_no || replacementOrder.purchase_order_no || null,
            receipt_id: receiptId,
            receipt_no: receiptNo,
            inspection_id: ncp?.inspection_id || null,
          },
        ],
      },
      connection
    );

    await this.linkReplacementReceipt({
      replacementOrder,
      purchaseReturn,
      ncp,
      receiptId,
      receiptNo,
      orderContext,
      createdBy,
      connection,
    });

    if (replacementOrder.ncp_id) {
      await connection.query(
        `INSERT INTO nonconforming_product_actions (ncp_id, action_type, action_description, action_by)
         VALUES (?, 'auto_receipt', ?, ?)`,
        [
          replacementOrder.ncp_id,
          `Replacement receipt ${receiptNo} posted for ${replacementOrder.replacement_no}`,
          operator,
        ]
      );
    }

    logger.info(
      `Replacement receipt posted: replacement=${replacementOrder.replacement_no}, receipt=${receiptNo}, qty=${receiveQty}, batch=${batchNumber}`
    );

    return {
      receipt_id: receiptId,
      receipt_no: receiptNo,
      batch_number: batchNumber,
      warehouse_id: material.warehouseId,
      warehouse_name: material.warehouseName,
      received_quantity: receiveQty,
    };
  }

  static async linkReplacementReceipt({
    replacementOrder,
    purchaseReturn,
    ncp,
    receiptId,
    receiptNo,
    orderContext,
    createdBy,
    connection,
  }) {
    if (ncp?.inspection_id) {
      await DocumentLinkService.tryAutoLink(
        'quality_inspection',
        ncp.inspection_id,
        ncp.inspection_no,
        'nonconforming_product',
        ncp.id,
        ncp.ncp_no,
        createdBy,
        connection
      );
    }

    if (ncp?.id) {
      await DocumentLinkService.tryAutoLink(
        'nonconforming_product',
        ncp.id,
        ncp.ncp_no,
        'replacement_order',
        replacementOrder.id,
        replacementOrder.replacement_no,
        createdBy,
        connection
      );
      await DocumentLinkService.tryAutoLink(
        'nonconforming_product',
        ncp.id,
        ncp.ncp_no,
        'purchase_receipt',
        receiptId,
        receiptNo,
        createdBy,
        connection
      );
    }

    if (purchaseReturn?.id) {
      await DocumentLinkService.tryAutoLink(
        'purchase_return',
        purchaseReturn.id,
        purchaseReturn.return_no,
        'replacement_order',
        replacementOrder.id,
        replacementOrder.replacement_no,
        createdBy,
        connection
      );
    }

    if (orderContext?.order_id) {
      await DocumentLinkService.tryAutoLink(
        'purchase_order',
        orderContext.order_id,
        orderContext.order_no,
        'purchase_receipt',
        receiptId,
        receiptNo,
        createdBy,
        connection
      );
    }

    await DocumentLinkService.tryAutoLink(
      'replacement_order',
      replacementOrder.id,
      replacementOrder.replacement_no,
      'purchase_receipt',
      receiptId,
      receiptNo,
      createdBy,
      connection
    );
  }

  static async linkQualityInspectionToNcp(ncp, connection, createdBy = null) {
    if (!ncp?.inspection_id || !ncp?.id) return;

    await DocumentLinkService.tryAutoLink(
      'quality_inspection',
      ncp.inspection_id,
      ncp.inspection_no,
      'nonconforming_product',
      ncp.id,
      ncp.ncp_no,
      this.createdById(createdBy),
      connection
    );
  }

  static async linkNcpToDocument(ncp, targetType, targetId, targetCode, connection, createdBy = null) {
    if (!ncp?.id || !targetType || !targetId) return;

    await DocumentLinkService.tryAutoLink(
      'nonconforming_product',
      ncp.id,
      ncp.ncp_no,
      targetType,
      targetId,
      targetCode,
      this.createdById(createdBy),
      connection
    );
  }

  static async linkDocumentToDocument(source, target, connection, createdBy = null) {
    if (!source?.type || !source?.id || !target?.type || !target?.id) return;

    await DocumentLinkService.tryAutoLink(
      source.type,
      source.id,
      source.code,
      target.type,
      target.id,
      target.code,
      this.createdById(createdBy),
      connection
    );
  }

  static emitPurchaseReceiptCompleted(receiptId, currentUserId = null) {
    if (!receiptId) return;

    setImmediate(() => {
      try {
        const EventBus = require('../../events/EventBus');
        EventBus.emit('PURCHASE_RECEIPT_COMPLETED', {
          receiptId,
          currentUserId,
        });
      } catch (error) {
        logger.error('Failed to emit PURCHASE_RECEIPT_COMPLETED:', error);
      }
    });
  }

  static async handleScrapInventory(scrapRecord, connection) {
    try {
      logger.info(
        `Handle scrap inventory: scrap=${scrapRecord.scrap_no}, material=${scrapRecord.material_code}, qty=${scrapRecord.quantity}`
      );

      const [materials] = await connection.query(
        'SELECT id, location_id, unit_id FROM materials WHERE code = ? AND deleted_at IS NULL',
        [scrapRecord.material_code]
      );

      if (materials.length === 0) {
        throw new Error(`Material does not exist for scrap inventory: ${scrapRecord.material_code}`);
      }

      const material = materials[0];
      const locationId = await InventoryService.getMaterialLocation(material.id, connection);

      await InventoryService.updateStock(
        {
          materialId: material.id,
          locationId,
          quantity: -scrapRecord.quantity,
          transactionType: 'scrap',
          referenceNo: scrapRecord.scrap_no,
          referenceType: 'scrap_record',
          operator: scrapRecord.created_by || 'system',
          remark: `Scrap inventory deduction - ${scrapRecord.scrap_reason || ''}`,
          unitId: material.unit_id || null,
        },
        connection
      );

      logger.info(`Scrap inventory deducted: ${scrapRecord.scrap_no}`);
    } catch (error) {
      logger.error('Failed to deduct scrap inventory:', error);
      throw error;
    }
  }

  static async recordQualityCost(params, connection) {
    try {
      const { costType, referenceNo, materialCode, quantity, cost, operator } = params;

      logger.info(`Record quality cost: type=${costType}, ref=${referenceNo}, cost=${cost}`);

      await connection.query(
        `INSERT INTO quality_costs (
          cost_type, reference_no, material_code, quantity, cost, operator, cost_date
        ) VALUES (?, ?, ?, ?, ?, ?, CURDATE())`,
        [costType, referenceNo, materialCode, quantity, cost, operator]
      );

      logger.info(`Quality cost recorded: ${referenceNo}`);
    } catch (error) {
      logger.error('Failed to record quality cost:', error);
      throw error;
    }
  }
}

module.exports = QualityIntegrationService;
