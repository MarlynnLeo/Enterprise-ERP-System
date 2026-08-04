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
      order_no: body.orderNo,
      customer_id: body.customerId != null ? toNumber(body.customerId, body.customerId) : undefined,
      quotation_id: body.quotationId != null ? toNumber(body.quotationId, body.quotationId) : undefined,
      contract_code: body.contractCode,
      total_amount: body.totalAmount != null ? toNumber(body.totalAmount, 0) : undefined,
      subtotal: body.subtotal != null ? toNumber(body.subtotal, 0) : undefined,
      tax_amount: body.taxAmount != null ? toNumber(body.taxAmount, 0) : undefined,
      tax_rate: body.taxRate,
      payment_terms: body.paymentTerms,
      delivery_date: body.deliveryDate != null ? formatDate(body.deliveryDate) : undefined,
      status: body.status,
      remarks: body.remarks ?? body.remark,
      created_by: body.createdBy,
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
    return {
      id: row.id ?? null,
      outboundId: row.outbound_id ?? null,
      productId,
      materialId: productId,
      quantity: toNumber(row.quantity, 0),
      unitPrice: toNumber(row.price ?? row.unitPrice ?? row.unit_price, 0),
      amount: toNumber(row.amount, 0),
      sourceOrderId: row.source_order_id ?? null,
      sourceOrderNo: row.source_order_no ?? null,
      remarks: row.remarks ?? null,
      unitId: row.unit_id ?? null,
      unitName: row.unit_name ?? null,
      materialName: row.material_name ?? null,
      materialCode: row.material_code ?? null,
      specification: row.specification ?? row.specs ?? null,
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

module.exports = {
  salesOrderMap,
  salesOrderItemMap,
  salesOutboundMap,
  salesOutboundItemMap,
  formatDate,
  toNumber,
  roundMoney,
};
