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
    const line = mapLineUnitPrice(
      { ...body, price: body.unitPrice ?? body.price },
      'price'
    );
    const row = {
      id: body.id,
      material_id:
        body.materialId != null ? toNumber(body.materialId, body.materialId) : body.material_id,
      quantity: line.quantity,
      qualified_quantity:
        body.qualifiedQuantity != null
          ? toNumber(body.qualifiedQuantity, line.quantity)
          : body.qualified_quantity,
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
      receiptId: row.receipt_id ?? null,
      materialId: row.material_id ?? null,
      materialCode: row.material_code ?? null,
      materialName: row.material_name ?? null,
      specification: row.specification ?? row.specs ?? null,
      quantity: toNumber(row.quantity, 0),
      qualifiedQuantity:
        row.qualified_quantity != null ? toNumber(row.qualified_quantity, 0) : null,
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
        (row.operator === 'system' ? '系统' : row.real_name || row.operator || null),
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

module.exports = {
  purchaseOrderMap,
  purchaseOrderItemMap,
  purchaseReceiptMap,
  purchaseReceiptItemMap,
  formatDate,
  toNumber,
  roundMoney,
};
