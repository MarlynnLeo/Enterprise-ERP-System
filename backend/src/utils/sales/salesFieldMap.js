/**
 * 销售域字段契约（SSOT）
 * - 销售订单 sales_order
 * - 销售出库 sales_outbound
 */

const { formatDate, toNumber, roundMoney, mapLineUnitPrice } = require('../fieldMap');

const salesOrderItemMap = {
  fromApi(body = {}) {
    const line = mapLineUnitPrice(body, 'unit_price');
    const row = {
      id: body.id,
      material_id: body.materialId != null ? toNumber(body.materialId, body.materialId) : body.material_id,
      quantity: line.quantity,
      unit_price: line.unit_price,
      amount: line.amount,
      tax_percent: body.taxRate != null ? body.taxRate : body.tax_percent,
      remarks: body.remarks ?? null,
    };
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  toApi(row) {
    if (row == null) return null;
    const materialCode = row.material_code ?? row.materialCode ?? null;
    const materialName = row.material_name ?? row.materialName ?? null;
    const unitPrice = toNumber(row.unit_price ?? row.unitPrice, 0);
    const amount = toNumber(row.amount, 0);
    return {
      id: row.id ?? null,
      materialId: row.material_id ?? row.materialId ?? null,
      materialCode,
      // 列表展开常用别名（仍为 camel，非 snake）
      code: materialCode,
      materialName,
      name: materialName,
      specification: row.specification ?? row.specs ?? null,
      productCode: row.product_code ?? row.productCode ?? null,
      productSpecs: row.product_specs ?? row.productSpecs ?? null,
      quantity: toNumber(row.quantity, 0),
      stockQuantity: row.stock_quantity != null ? toNumber(row.stock_quantity, 0) : null,
      unitName: row.unit_name ?? row.unitName ?? null,
      unitPrice,
      amount,
      totalPrice: row.total_price != null ? toNumber(row.total_price, 0) : amount,
      taxRate: row.tax_percent != null ? toNumber(row.tax_percent, 0) : row.taxRate ?? null,
      remarks: row.remarks ?? row.remark ?? null,
    };
  },
};

const salesOrderMap = {
  fromApi(body = {}) {
    const row = {
      id: body.id,
      order_no: body.orderNo ?? body.order_no,
      customer_id: (body.customerId ?? body.customer_id) != null ? toNumber(body.customerId ?? body.customer_id, body.customerId ?? body.customer_id) : undefined,
      quotation_id: (body.quotationId ?? body.quotation_id) != null ? toNumber(body.quotationId ?? body.quotation_id, body.quotationId ?? body.quotation_id) : undefined,
      contract_code: body.contractCode ?? body.contract_code,
      total_amount: (body.totalAmount ?? body.total_amount) != null ? toNumber(body.totalAmount ?? body.total_amount, 0) : undefined,
      subtotal: (body.subtotal) != null ? toNumber(body.subtotal, 0) : undefined,
      tax_amount: (body.taxAmount ?? body.tax_amount) != null ? toNumber(body.taxAmount ?? body.tax_amount, 0) : undefined,
      tax_rate: body.taxRate ?? body.tax_rate,
      payment_terms: body.paymentTerms ?? body.payment_terms,
      delivery_date: (body.deliveryDate ?? body.delivery_date) != null ? formatDate(body.deliveryDate ?? body.delivery_date) : undefined,
      status: body.status,
      remarks: body.remarks ?? body.remark ?? body.notes,
      created_by: body.createdBy ?? body.created_by,
    };
    if (Array.isArray(body.items)) {
      row.items = body.items.map((it) => salesOrderItemMap.fromApi(it));
    }
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  toApi(row) {
    if (row == null) return null;
    if (Array.isArray(row)) return row.map((r) => salesOrderMap.toApi(r));
    const customerName = row.customer_name ?? row.customerName ?? null;
    const api = {
      id: row.id,
      orderNo: row.order_no ?? null,
      customerId: row.customer_id ?? null,
      customerName,
      // 列表页历史列名 customer（仍 camel，等于 customerName）
      customer: customerName,
      quotationId: row.quotation_id ?? null,
      contractCode: row.contract_code ?? null,
      totalAmount: row.total_amount != null ? toNumber(row.total_amount, 0) : null,
      subtotal: row.subtotal != null ? toNumber(row.subtotal, 0) : null,
      taxAmount: row.tax_amount != null ? toNumber(row.tax_amount, 0) : null,
      taxRate: row.tax_rate != null ? toNumber(row.tax_rate, 0) : null,
      paymentTerms: row.payment_terms ?? null,
      orderDate: formatDate(row.order_date ?? row.created_at),
      deliveryDate: formatDate(row.delivery_date),
      status: row.status ?? null,
      invoiceStatus: row.invoice_status ?? null,
      remarks: row.remarks ?? null,
      address: row.delivery_address ?? row.address ?? null,
      contactPerson: row.contact_person ?? null,
      contactPhone: row.contact_phone ?? null,
      // 表单常用短名
      contact: row.contact_person ?? null,
      phone: row.contact_phone ?? null,
      createdBy: row.created_by ?? null,
      createdByName: row.created_by_name ?? null,
      createdByRealName: row.created_by_real_name ?? null,
      createdAt: formatDate(row.created_at),
      updatedAt: formatDate(row.updated_at),
      isLocked: row.is_locked != null ? Boolean(row.is_locked) : null,
      lockedAt: row.locked_at ? formatDate(row.locked_at) : row.locked_at ?? null,
      lockedBy: row.locked_by ?? null,
      lockReason: row.lock_reason ?? null,
      lockedByName: row.locked_by_name ?? null,
      hasDraftOutbound: row.has_draft_outbound != null ? Boolean(row.has_draft_outbound) : null,
    };
    if (Array.isArray(row.items)) {
      api.items = row.items.map((it) => salesOrderItemMap.toApi(it));
    }
    return api;
  },
  fromListQuery(query = {}) {
    const filters = {};
    if (query.orderNo) filters.order_no = query.orderNo;
    if (query.customerId) filters.customer_id = query.customerId;
    if (query.customerName) filters.customer_name = query.customerName;
    if (query.status) filters.status = query.status;
    if (query.startDate) filters.start_date = query.startDate;
    if (query.endDate) filters.end_date = query.endDate;
    if (query.keyword || query.search) filters.keyword = query.keyword || query.search;
    return filters;
  },
};

const salesOutboundItemMap = {
  fromApi(body = {}) {
    const line = mapLineUnitPrice(
      {
        ...body,
        unit_price: body.unitPrice ?? body.unit_price,
        price: body.price ?? body.unitPrice,
      },
      'price'
    );
    const mid = body.productId ?? body.materialId ?? body.product_id ?? body.material_id;
    const row = {
      id: body.id,
      product_id: mid != null ? toNumber(mid, mid) : undefined,
      quantity: line.quantity,
      price: line.price,
      amount: line.amount,
      source_order_id:
        body.sourceOrderId != null
          ? toNumber(body.sourceOrderId, body.sourceOrderId)
          : body.source_order_id,
      source_order_no: body.sourceOrderNo ?? body.source_order_no,
      remarks: body.remarks ?? null,
      unit_id: body.unitId ?? body.unit_id,
    };
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  toApi(row) {
    if (row == null) return null;
    const productId = row.product_id ?? row.productId ?? null;
    const materialCode = row.material_code ?? row.materialCode ?? row.product_code ?? row.productCode ?? row.code ?? null;
    const materialName = row.material_name ?? row.materialName ?? row.product_name ?? row.productName ?? row.name ?? null;
    const specification = row.specification ?? row.specs ?? row.product_specs ?? null;
    const unitName = row.unit_name ?? row.unitName ?? row.unit ?? null;
    return {
      id: row.id ?? null,
      outboundId: row.outbound_id ?? row.outboundId ?? null,
      productId,
      materialId: productId,
      productCode: materialCode,
      materialCode,
      code: materialCode,
      productName: materialName,
      materialName,
      name: materialName,
      specification,
      specs: specification,
      productSpecs: specification,
      quantity: toNumber(row.quantity, 0),
      unitPrice: toNumber(row.price ?? row.unitPrice ?? row.unit_price, 0),
      amount: toNumber(row.amount, 0),
      sourceOrderId: row.source_order_id ?? row.sourceOrderId ?? null,
      sourceOrderNo: row.source_order_no ?? row.sourceOrderNo ?? null,
      remarks: row.remarks ?? null,
      unitId: row.unit_id ?? row.unitId ?? null,
      unitName,
      unit: unitName,
      returnedQuantity:
        row.returned_quantity != null ? toNumber(row.returned_quantity, 0) : null,
      returnableQuantity:
        row.returnable_quantity != null ? toNumber(row.returnable_quantity, 0) : null,
    };
  },
};

const salesOutboundMap = {
  fromApi(body = {}) {
    const row = {
      id: body.id,
      outbound_no: body.outboundNo,
      order_id: body.orderId != null ? toNumber(body.orderId, body.orderId) : undefined,
      delivery_date: body.deliveryDate != null ? formatDate(body.deliveryDate) : undefined,
      status: body.status,
      remarks: body.remarks ?? body.remark,
      total_amount: body.totalAmount != null ? toNumber(body.totalAmount, 0) : undefined,
      is_multi_order: body.isMultiOrder != null ? Boolean(body.isMultiOrder) : undefined,
      related_orders: body.relatedOrders,
      created_by: body.createdBy,
    };
    if (Array.isArray(body.items)) {
      row.items = body.items.map((it) => salesOutboundItemMap.fromApi(it));
    }
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  toApi(row) {
    if (row == null) return null;
    if (Array.isArray(row)) return row.map((r) => salesOutboundMap.toApi(r));

    let relatedOrders = row.related_orders ?? row.relatedOrders ?? null;
    if (typeof relatedOrders === 'string') {
      try {
        relatedOrders = JSON.parse(relatedOrders);
      } catch {
        /* keep */
      }
    }

    const api = {
      id: row.id,
      outboundNo: row.outbound_no ?? null,
      orderId: row.order_id ?? null,
      orderNo: row.order_no ?? null,
      orderNos: row.order_nos ?? null,
      customerId: row.customer_id ?? null,
      customerName: row.customer_name ?? null,
      contractCode: row.contract_code ?? null,
      deliveryDate: formatDate(row.delivery_date ?? row.deliveryDate),
      status: row.status ?? null,
      remarks: row.remarks ?? null,
      totalAmount: row.total_amount != null ? toNumber(row.total_amount, 0) : null,
      isMultiOrder: Boolean(row.is_multi_order),
      relatedOrders,
      relatedOrderDetails: Array.isArray(row.related_order_details)
        ? row.related_order_details.map((o) => ({
            id: o.id,
            orderNo: o.order_no ?? o.orderNo ?? null,
            customerName: o.customer_name ?? o.customerName ?? null,
          }))
        : row.related_order_details ?? null,
      createdBy: row.created_by ?? null,
      createdAt: formatDate(row.created_at),
      updatedAt: formatDate(row.updated_at),
      contactPerson: row.contact_person ?? null,
      contactPhone: row.contact_phone ?? null,
    };

    if (Array.isArray(row.items)) {
      api.items = row.items.map((it) => salesOutboundItemMap.toApi(it));
    }
    return api;
  },
  fromListQuery(query = {}) {
    const filters = {};
    if (query.search) filters.search = query.search;
    if (query.status) filters.status = query.status;
    if (query.startDate) filters.start_date = query.startDate;
    if (query.endDate) filters.end_date = query.endDate;
    if (query.orderId) filters.order_id = query.orderId;
    if (query.customerId) filters.customer_id = query.customerId;
    if (query.outboundNo) filters.outbound_no = query.outboundNo;
    return filters;
  },
};

/** 销售退货明细 */
const salesReturnItemMap = {
  fromApi(body = {}) {
    const mid = body.productId ?? body.materialId;
    const row = {
      id: body.id,
      product_id: mid != null ? toNumber(mid, mid) : undefined,
      quantity: body.quantity != null ? toNumber(body.quantity, 0) : undefined,
      reason: body.reason ?? null,
    };
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  toApi(row) {
    if (row == null) return null;
    return {
      id: row.id ?? null,
      productId: row.product_id ?? null,
      materialId: row.product_id ?? null,
      materialCode: row.material_code ?? row.product_code ?? null,
      materialName: row.material_name ?? row.product_name ?? null,
      quantity: toNumber(row.quantity, 0),
      reason: row.reason ?? null,
      unitPrice: row.unit_price != null ? toNumber(row.unit_price, 0) : null,
    };
  },
};

const salesReturnMap = {
  fromApi(body = {}) {
    const row = {
      id: body.id,
      return_no: body.returnNo,
      return_date: body.returnDate != null ? formatDate(body.returnDate) : undefined,
      order_id: body.orderId != null ? toNumber(body.orderId, body.orderId) : undefined,
      outbound_id:
        body.outboundId != null ? toNumber(body.outboundId, body.outboundId) : undefined,
      return_reason: body.returnReason,
      status: body.status,
      remarks: body.remarks ?? body.remark,
      created_by: body.createdBy,
    };
    if (Array.isArray(body.items)) {
      row.items = body.items.map((it) => salesReturnItemMap.fromApi(it));
    }
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  toApi(row) {
    if (row == null) return null;
    if (Array.isArray(row)) return row.map((r) => salesReturnMap.toApi(r));
    const api = {
      id: row.id,
      returnNo: row.return_no ?? null,
      returnDate: formatDate(row.return_date),
      orderId: row.order_id ?? null,
      orderNo: row.order_no ?? null,
      outboundId: row.outbound_id ?? null,
      outboundNo: row.outbound_no ?? null,
      customerName: row.customer_name ?? null,
      returnReason: row.return_reason ?? null,
      status: row.status ?? null,
      remarks: row.remarks ?? null,
      createdBy: row.created_by ?? null,
      createdAt: formatDate(row.created_at),
      updatedAt: formatDate(row.updated_at),
    };
    if (Array.isArray(row.items)) {
      api.items = row.items.map((it) => salesReturnItemMap.toApi(it));
    }
    return api;
  },
  fromListQuery(query = {}) {
    const filters = {};
    if (query.returnNo) filters.return_no = query.returnNo;
    if (query.status) filters.status = query.status;
    if (query.startDate) filters.start_date = query.startDate;
    if (query.endDate) filters.end_date = query.endDate;
    if (query.search) filters.search = query.search;
    return filters;
  },
};

/** 销售换货明细 */
const salesExchangeItemMap = {
  fromApi(body = {}) {
    const row = {
      id: body.id,
      item_type: body.itemType,
      product_code: body.productCode,
      product_name: body.productName,
      specification: body.specification,
      original_quantity:
        body.originalQuantity != null ? toNumber(body.originalQuantity, 0) : undefined,
      quantity:
        body.quantity != null
          ? toNumber(body.quantity, 0)
          : body.exchangeQuantity != null
            ? toNumber(body.exchangeQuantity, 0)
            : undefined,
      reason: body.reason ?? body.exchangeReason ?? null,
      unit_name: body.unitName,
    };
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  toApi(row) {
    if (row == null) return null;
    return {
      id: row.id ?? null,
      itemType: row.item_type ?? null,
      productCode: row.product_code ?? null,
      productName: row.product_name ?? null,
      specification: row.specification ?? null,
      originalQuantity:
        row.original_quantity != null ? toNumber(row.original_quantity, 0) : null,
      quantity: toNumber(row.quantity, 0),
      unitPrice: row.unit_price != null ? toNumber(row.unit_price, 0) : null,
      amount: row.amount != null ? toNumber(row.amount, 0) : null,
      reason: row.reason ?? null,
      unitName: row.unit_name ?? null,
    };
  },
};

const salesExchangeMap = {
  fromApi(body = {}) {
    const row = {
      id: body.id,
      exchange_no: body.exchangeNo,
      exchange_date: body.exchangeDate != null ? formatDate(body.exchangeDate) : undefined,
      order_no: body.orderNo,
      customer_name: body.customerName,
      status: body.status,
      remarks: body.remarks ?? body.remark,
      created_by: body.createdBy,
    };
    if (Array.isArray(body.items)) {
      row.items = body.items.map((it) => salesExchangeItemMap.fromApi(it));
    }
    if (Array.isArray(body.returnItems)) {
      row.return_items = body.returnItems.map((it) =>
        salesExchangeItemMap.fromApi({ ...it, itemType: it.itemType || 'return' })
      );
    }
    if (Array.isArray(body.newItems)) {
      row.new_items = body.newItems.map((it) =>
        salesExchangeItemMap.fromApi({ ...it, itemType: it.itemType || 'new' })
      );
    }
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  toApi(row) {
    if (row == null) return null;
    if (Array.isArray(row)) return row.map((r) => salesExchangeMap.toApi(r));
    const api = {
      id: row.id,
      exchangeNo: row.exchange_no ?? null,
      exchangeDate: formatDate(row.exchange_date),
      orderNo: row.order_no ?? null,
      customerName: row.customer_name ?? null,
      status: row.status ?? null,
      remarks: row.remarks ?? null,
      returnAmount: row.return_amount != null ? toNumber(row.return_amount, 0) : null,
      newAmount: row.new_amount != null ? toNumber(row.new_amount, 0) : null,
      differenceAmount:
        row.difference_amount != null ? toNumber(row.difference_amount, 0) : null,
      createdBy: row.created_by ?? null,
      createdAt: formatDate(row.created_at),
      updatedAt: formatDate(row.updated_at),
    };
    if (Array.isArray(row.items)) {
      api.items = row.items.map((it) => salesExchangeItemMap.toApi(it));
    }
    if (Array.isArray(row.return_items)) {
      api.returnItems = row.return_items.map((it) => salesExchangeItemMap.toApi(it));
    }
    if (Array.isArray(row.new_items)) {
      api.newItems = row.new_items.map((it) => salesExchangeItemMap.toApi(it));
    }
    return api;
  },
  fromListQuery(query = {}) {
    const filters = {};
    if (query.search) filters.search = query.search;
    if (query.status) filters.status = query.status;
    if (query.startDate) filters.start_date = query.startDate;
    if (query.endDate) filters.end_date = query.endDate;
    return filters;
  },
};

module.exports = {
  salesOrderMap,
  salesOrderItemMap,
  salesOutboundMap,
  salesOutboundItemMap,
  salesReturnMap,
  salesReturnItemMap,
  salesExchangeMap,
  salesExchangeItemMap,
  formatDate,
  toNumber,
  roundMoney,
};
