/**
 * 采购域字段契约（SSOT）
 * - 采购订单 purchase_order
 * - 采购入库 purchase_receipt
 */

const { formatDate, toNumber, roundMoney, mapLineUnitPrice } = require('../fieldMap');

const purchaseOrderItemMap = {
  fromApi(body = {}) {
    const line = mapLineUnitPrice(
      { ...body, price: body.unitPrice ?? body.price, unit_price: body.unitPrice },
      'price'
    );
    const row = {
      id: body.id,
      material_id:
        body.materialId != null ? toNumber(body.materialId, body.materialId) : body.material_id,
      quantity: line.quantity,
      price: line.price,
      amount: line.amount,
      tax_rate: body.taxRate ?? body.tax_rate,
      remarks: body.remarks ?? null,
    };
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  toApi(row) {
    if (row == null) return null;
    return {
      id: row.id ?? null,
      materialId: row.material_id ?? null,
      materialCode: row.material_code ?? null,
      materialName: row.material_name ?? null,
      specification: row.specification ?? row.specs ?? null,
      quantity: toNumber(row.quantity, 0),
      unitPrice: toNumber(row.price ?? row.unit_price ?? row.unitPrice, 0),
      amount: toNumber(row.amount, 0),
      taxRate: row.tax_rate != null ? toNumber(row.tax_rate, 0) : null,
      remarks: row.remarks ?? null,
    };
  },
};

const purchaseOrderMap = {
  fromApi(body = {}) {
    const row = {
      id: body.id,
      order_no: body.orderNo,
      order_date: body.orderDate != null ? formatDate(body.orderDate) : undefined,
      supplier_id:
        body.supplierId != null ? toNumber(body.supplierId, body.supplierId) : undefined,
      supplier_name: body.supplierName,
      contract_code: body.contractCode,
      expected_delivery_date:
        body.expectedDeliveryDate != null ? formatDate(body.expectedDeliveryDate) : undefined,
      contact_person: body.contactPerson,
      contact_phone: body.contactPhone,
      total_amount: body.totalAmount != null ? toNumber(body.totalAmount, 0) : undefined,
      subtotal: body.subtotal != null ? toNumber(body.subtotal, 0) : undefined,
      tax_amount: body.taxAmount != null ? toNumber(body.taxAmount, 0) : undefined,
      tax_rate: body.taxRate,
      payment_term_days:
        body.paymentTermDays != null
          ? toNumber(body.paymentTermDays, body.paymentTermDays)
          : undefined,
      remarks: body.remarks ?? body.remark,
      status: body.status,
      created_by: body.createdBy,
    };
    if (Array.isArray(body.items)) {
      row.items = body.items.map((it) => purchaseOrderItemMap.fromApi(it));
    }
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  toApi(row) {
    if (row == null) return null;
    if (Array.isArray(row)) return row.map((r) => purchaseOrderMap.toApi(r));
    const api = {
      id: row.id,
      orderNo: row.order_no ?? null,
      orderDate: formatDate(row.order_date),
      supplierId: row.supplier_id ?? null,
      supplierName: row.supplier_name ?? null,
      contractCode: row.contract_code ?? null,
      expectedDeliveryDate: formatDate(row.expected_delivery_date),
      contactPerson: row.contact_person ?? null,
      contactPhone: row.contact_phone ?? null,
      totalAmount: row.total_amount != null ? toNumber(row.total_amount, 0) : null,
      subtotal: row.subtotal != null ? toNumber(row.subtotal, 0) : null,
      taxAmount: row.tax_amount != null ? toNumber(row.tax_amount, 0) : null,
      taxRate: row.tax_rate != null ? toNumber(row.tax_rate, 0) : null,
      paymentTermDays: row.payment_term_days ?? null,
      remarks: row.remarks ?? null,
      status: row.status ?? null,
      requisitionId: row.requisition_id ?? null,
      requisitionNumber: row.requisition_number ?? null,
      createdBy: row.created_by ?? null,
      createdAt: formatDate(row.created_at),
      updatedAt: formatDate(row.updated_at),
      completionPercentage:
        row.completion_percentage != null ? toNumber(row.completion_percentage, 0) : null,
    };
    if (Array.isArray(row.items)) {
      api.items = row.items.map((it) => purchaseOrderItemMap.toApi(it));
    }
    return api;
  },
  fromListQuery(query = {}) {
    const filters = {};
    if (query.orderNo) filters.order_no = query.orderNo;
    if (query.contractCode) filters.contract_code = query.contractCode;
    if (query.keyword) filters.keyword = query.keyword;
    if (query.supplierId) filters.supplier_id = query.supplierId;
    if (query.status) filters.status = query.status;
    if (query.startDate) filters.start_date = query.startDate;
    if (query.endDate) filters.end_date = query.endDate;
    return filters;
  },
};

const purchaseReceiptItemMap = {
  fromApi(body = {}) {
    // quantity may be omitted when clients only send receivedQuantity (UAT / mobile)
    const explicitQty =
      body.quantity != null
        ? toNumber(body.quantity, 0)
        : body.receivedQuantity != null
          ? toNumber(body.receivedQuantity, 0)
          : body.actualQuantity != null
            ? toNumber(body.actualQuantity, 0)
            : 0;
    const line = mapLineUnitPrice(
      { ...body, quantity: explicitQty, price: body.unitPrice ?? body.price },
      'price'
    );
    const received =
      body.receivedQuantity != null
        ? toNumber(body.receivedQuantity, line.quantity)
        : body.actualQuantity != null
          ? toNumber(body.actualQuantity, line.quantity)
          : line.quantity;
    // Prefer positive explicit quantity; never leave quantity=0 when received>0
    const quantity =
      line.quantity > 0 ? line.quantity : received > 0 ? received : line.quantity;
    const amount =
      line.amount > 0
        ? line.amount
        : roundMoney(quantity * toNumber(line.price, 0));
    const row = {
      id: body.id,
      order_item_id:
        body.orderItemId != null ? toNumber(body.orderItemId, body.orderItemId) : undefined,
      material_id:
        body.materialId != null ? toNumber(body.materialId, body.materialId) : undefined,
      material_code: body.materialCode,
      material_name: body.materialName,
      specification: body.specification ?? body.specs,
      unit_id: body.unitId != null ? toNumber(body.unitId, body.unitId) : undefined,
      ordered_quantity:
        body.orderedQuantity != null ? toNumber(body.orderedQuantity, 0) : undefined,
      quantity,
      received_quantity: received > 0 ? received : quantity,
      qualified_quantity:
        body.qualifiedQuantity != null
          ? toNumber(body.qualifiedQuantity, received > 0 ? received : quantity)
          : undefined,
      batch_number: body.batchNumber ?? body.batchNo ?? undefined,
      price: line.price,
      amount,
      tax_rate: body.taxRate,
      remarks: body.remarks ?? body.remark ?? null,
    };
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  toApi(row) {
    if (row == null) return null;
    return {
      id: row.id ?? null,
      receiptId: row.receipt_id ?? null,
      orderItemId: row.order_item_id ?? null,
      materialId: row.material_id ?? null,
      materialCode: row.material_code ?? null,
      materialName: row.material_name ?? null,
      specification: row.specification ?? row.specs ?? null,
      unitId: row.unit_id ?? null,
      orderedQuantity:
        row.ordered_quantity != null ? toNumber(row.ordered_quantity, 0) : null,
      quantity: toNumber(row.quantity, 0),
      receivedQuantity:
        row.received_quantity != null ? toNumber(row.received_quantity, 0) : null,
      qualifiedQuantity:
        row.qualified_quantity != null ? toNumber(row.qualified_quantity, 0) : null,
      batchNumber: row.batch_number ?? null,
      unitPrice: toNumber(row.price ?? row.unit_price ?? row.unitPrice, 0),
      amount: toNumber(row.amount, 0),
      taxRate: row.tax_rate != null ? toNumber(row.tax_rate, 0) : null,
      remarks: row.remarks ?? null,
    };
  },
};

const purchaseReceiptMap = {
  fromApi(body = {}) {
    const row = {
      id: body.id,
      receipt_no: body.receiptNo,
      order_id: body.orderId != null ? toNumber(body.orderId, body.orderId) : undefined,
      order_no: body.orderNo,
      supplier_id:
        body.supplierId != null ? toNumber(body.supplierId, body.supplierId) : undefined,
      supplier_name: body.supplierName,
      warehouse_id:
        body.warehouseId != null ? toNumber(body.warehouseId, body.warehouseId) : undefined,
      warehouse_name: body.warehouseName,
      receipt_date: body.receiptDate != null ? formatDate(body.receiptDate) : undefined,
      operator: body.operator,
      remarks: body.remarks ?? body.remark,
      total_amount: body.totalAmount != null ? toNumber(body.totalAmount, 0) : undefined,
      total_tax_amount:
        body.totalTaxAmount != null ? toNumber(body.totalTaxAmount, 0) : undefined,
      status: body.status,
      created_by: body.createdBy,
      idempotency_key: body.idempotencyKey,
    };
    if (Array.isArray(body.items)) {
      row.items = body.items.map((it) => purchaseReceiptItemMap.fromApi(it));
    }
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  toApi(row) {
    if (row == null) return null;
    if (Array.isArray(row)) return row.map((r) => purchaseReceiptMap.toApi(r));
    const api = {
      id: row.id,
      receiptNo: row.receipt_no ?? null,
      orderId: row.order_id ?? null,
      orderNo: row.order_no ?? row.joined_order_no ?? null,
      supplierId: row.supplier_id ?? null,
      supplierName: row.supplier_name ?? row.joined_supplier_name ?? null,
      warehouseId: row.warehouse_id ?? null,
      warehouseName: row.warehouse_name ?? row.joined_warehouse_name ?? null,
      receiptDate: formatDate(row.receipt_date),
      operator: row.operator ?? null,
      receiver:
        row.receiver ??
        (row.operator === 'system' ? '系统' : row.realName || row.operator || null),
      remarks: row.remarks ?? null,
      totalAmount: row.total_amount != null ? toNumber(row.total_amount, 0) : null,
      totalTaxAmount: row.total_tax_amount != null ? toNumber(row.total_tax_amount, 0) : null,
      status: row.status ?? null,
      invoiceStatus: row.invoice_status ?? null,
      createdBy: row.created_by ?? null,
      createdAt: formatDate(row.created_at),
      updatedAt: formatDate(row.updated_at),
    };
    if (Array.isArray(row.items)) {
      api.items = row.items.map((it) => purchaseReceiptItemMap.toApi(it));
    }
    return api;
  },
  fromListQuery(query = {}) {
    const filters = {};
    if (query.receiptNo) filters.receipt_no = query.receiptNo;
    if (query.orderNo) filters.order_no = query.orderNo;
    if (query.supplierId) filters.supplier_id = query.supplierId;
    if (query.status) filters.status = query.status;
    if (query.startDate) filters.start_date = query.startDate;
    if (query.endDate) filters.end_date = query.endDate;
    return filters;
  },
};

/** 采购申请明细 */
const purchaseRequisitionItemMap = {
  fromApi(body = {}) {
    const row = {
      id: body.id,
      material_id:
        body.materialId != null ? toNumber(body.materialId, body.materialId) : undefined,
      material_code: body.materialCode,
      material_name: body.materialName,
      specification: body.specification ?? body.specs,
      unit: body.unit,
      unit_id: body.unitId != null ? toNumber(body.unitId, body.unitId) : undefined,
      quantity: body.quantity != null ? toNumber(body.quantity, 0) : undefined,
      estimated_price:
        body.estimatedPrice != null ? toNumber(body.estimatedPrice, 0) : undefined,
      remarks: body.remarks ?? null,
    };
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  toApi(row) {
    if (row == null) return null;
    return {
      id: row.id ?? null,
      materialId: row.material_id ?? null,
      materialCode: row.material_code ?? null,
      materialName: row.material_name ?? null,
      specification: row.specification ?? row.material_specs ?? row.specs ?? null,
      unit: row.unit ?? row.unit_name ?? null,
      unitId: row.unit_id ?? null,
      quantity: toNumber(row.quantity, 0),
      orderedQuantity:
        row.ordered_quantity != null ? toNumber(row.ordered_quantity, 0) : null,
      estimatedPrice:
        row.estimated_price != null ? toNumber(row.estimated_price, 0) : null,
      supplierId: row.supplier_id ?? null,
      supplierName: row.supplier_name ?? null,
      remarks: row.remarks ?? null,
    };
  },
};

const purchaseRequisitionMap = {
  fromApi(body = {}) {
    const row = {
      id: body.id,
      requisition_no: body.requisitionNo,
      request_date: body.requestDate != null ? formatDate(body.requestDate) : undefined,
      requester: body.requester,
      real_name: body.realName,
      department: body.department,
      contract_code: body.contractCode,
      status: body.status,
      remarks: body.remarks ?? body.remark,
      source_type: body.sourceType,
      source_id: body.sourceId != null ? toNumber(body.sourceId, body.sourceId) : undefined,
      source_material_id:
        body.sourceMaterialId != null
          ? toNumber(body.sourceMaterialId, body.sourceMaterialId)
          : undefined,
      created_by: body.createdBy,
    };
    if (Array.isArray(body.items || body.materials)) {
      row.items = (body.items || body.materials).map((it) =>
        purchaseRequisitionItemMap.fromApi(it)
      );
    }
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  toApi(row) {
    if (row == null) return null;
    if (Array.isArray(row)) return row.map((r) => purchaseRequisitionMap.toApi(r));
    const materials = Array.isArray(row.materials)
      ? row.materials
      : Array.isArray(row.items)
        ? row.items
        : null;
    const api = {
      id: row.id,
      // 库列历史名为 requisition_number
      requisitionNo: row.requisition_no ?? row.requisition_number ?? null,
      requisitionNumber: row.requisition_number ?? row.requisition_no ?? null,
      requestDate: formatDate(row.request_date),
      requester: row.requester ?? null,
      realName: row.real_name ?? row.user_real_name ?? null,
      department: row.department ?? null,
      contractCode: row.contract_code ?? null,
      status: row.status ?? null,
      remarks: row.remarks ?? null,
      sourceType: row.source_type ?? null,
      sourceId: row.source_id ?? null,
      sourceMaterialId: row.source_material_id ?? null,
      materialsCount:
        row.materials_count != null
          ? toNumber(row.materials_count, 0)
          : materials
            ? materials.length
            : null,
      totalAmount: row.total_amount != null ? toNumber(row.total_amount, 0) : null,
      isFullyOrdered: row.is_fully_ordered != null ? Boolean(row.is_fully_ordered) : null,
      isPartiallyOrdered:
        row.is_partially_ordered != null ? Boolean(row.is_partially_ordered) : null,
      createdBy: row.created_by ?? null,
      createdAt: formatDate(row.created_at),
      updatedAt: formatDate(row.updated_at),
    };
    if (materials) {
      api.items = materials.map((it) => purchaseRequisitionItemMap.toApi(it));
      // 兼容前端 materials 别名（仍为 camel 明细）
      api.materials = api.items;
    }
    return api;
  },
  fromListQuery(query = {}) {
    const filters = {};
    if (query.requisitionNo) filters.requisition_no = query.requisitionNo;
    if (query.status) filters.status = query.status;
    if (query.startDate) filters.start_date = query.startDate;
    if (query.endDate) filters.end_date = query.endDate;
    if (query.keyword) filters.keyword = query.keyword;
    return filters;
  },
};

/** 采购退货明细 */
const purchaseReturnItemMap = {
  fromApi(body = {}) {
    const row = {
      id: body.id,
      receipt_item_id:
        body.receiptItemId != null
          ? toNumber(body.receiptItemId, body.receiptItemId)
          : undefined,
      return_quantity:
        body.returnQuantity != null ? toNumber(body.returnQuantity, 0) : undefined,
      remarks: body.remarks ?? null,
    };
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  toApi(row) {
    if (row == null) return null;
    return {
      id: row.id ?? null,
      receiptItemId: row.receipt_item_id ?? null,
      materialId: row.material_id ?? null,
      materialCode: row.material_code ?? null,
      materialName: row.material_name ?? null,
      specification: row.specification ?? null,
      unit: row.unit ?? null,
      unitId: row.unit_id ?? null,
      returnQuantity: toNumber(row.return_quantity ?? row.quantity, 0),
      price: toNumber(row.price, 0),
      amount: toNumber(row.amount, 0),
      remarks: row.remarks ?? null,
    };
  },
};

const purchaseReturnMap = {
  fromApi(body = {}) {
    const row = {
      id: body.id,
      return_no: body.returnNo,
      receipt_id: body.receiptId != null ? toNumber(body.receiptId, body.receiptId) : undefined,
      return_date: body.returnDate != null ? formatDate(body.returnDate) : undefined,
      return_reason: body.returnReason,
      status: body.status,
      remarks: body.remarks ?? body.remark,
      operator: body.operator,
      created_by: body.createdBy,
    };
    if (Array.isArray(body.items)) {
      row.items = body.items.map((it) => purchaseReturnItemMap.fromApi(it));
    }
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  toApi(row) {
    if (row == null) return null;
    if (Array.isArray(row)) return row.map((r) => purchaseReturnMap.toApi(r));
    const api = {
      id: row.id,
      returnNo: row.return_no ?? null,
      receiptId: row.receipt_id ?? null,
      receiptNo: row.receipt_no ?? null,
      returnDate: formatDate(row.return_date),
      returnReason: row.return_reason ?? null,
      status: row.status ?? null,
      remarks: row.remarks ?? null,
      operator: row.operator ?? null,
      operatorName: row.operator_name ?? row.real_name ?? row.operator ?? null,
      totalAmount: row.total_amount != null ? toNumber(row.total_amount, 0) : null,
      createdBy: row.created_by ?? null,
      createdAt: formatDate(row.created_at),
      updatedAt: formatDate(row.updated_at),
    };
    if (Array.isArray(row.items)) {
      api.items = row.items.map((it) => purchaseReturnItemMap.toApi(it));
    }
    return api;
  },
  fromListQuery(query = {}) {
    const filters = {};
    if (query.returnNo) filters.return_no = query.returnNo;
    if (query.status) filters.status = query.status;
    if (query.startDate) filters.start_date = query.startDate;
    if (query.endDate) filters.end_date = query.endDate;
    return filters;
  },
};

module.exports = {
  purchaseOrderMap,
  purchaseOrderItemMap,
  purchaseReceiptMap,
  purchaseReceiptItemMap,
  purchaseRequisitionMap,
  purchaseRequisitionItemMap,
  purchaseReturnMap,
  purchaseReturnItemMap,
  formatDate,
  toNumber,
  roundMoney,
};
