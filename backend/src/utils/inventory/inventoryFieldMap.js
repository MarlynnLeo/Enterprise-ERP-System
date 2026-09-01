/**
 * 库存域字段契约（SSOT）
 * - 入库 inventory_inbound
 * - 出库 inventory_outbound
 */

const { formatDate, toNumber } = require('../fieldMap');

const inventoryInboundItemMap = {
  toApi(row) {
    if (row == null) return null;
    return {
      id: row.id ?? null,
      inboundId: row.inbound_id ?? null,
      materialId: row.material_id ?? null,
      materialCode: row.material_code ?? null,
      materialName: row.material_name ?? null,
      specification: row.specification ?? row.specs ?? null,
      quantity: toNumber(row.quantity, 0),
      stockQuantity: row.stock_quantity != null ? toNumber(row.stock_quantity, 0) : null,
      unitId: row.unit_id ?? null,
      unitName: row.unit_name ?? null,
      // DB 列 batch_number
      batchNo: row.batch_number ?? row.batch_no ?? null,
      locationId: row.location_id ?? null,
      locationName: row.location_name ?? null,
      remarks: row.remark ?? row.remarks ?? null,
    };
  },
  fromApi(body = {}) {
    const materialRaw = body.materialId ?? body.material_id;
    const locationRaw = body.locationId ?? body.location_id;
    const row = {
      id: body.id,
      material_id: materialRaw != null ? toNumber(materialRaw, materialRaw) : undefined,
      quantity: body.quantity != null ? toNumber(body.quantity, 0) : undefined,
      unit_id: body.unitId ?? body.unit_id,
      batch_number: body.batchNo ?? body.batchNumber ?? body.batch_number,
      location_id: locationRaw != null ? toNumber(locationRaw, locationRaw) : undefined,
      remark: body.remarks ?? body.remark,
    };
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
};

const inventoryInboundMap = {
  toApi(row) {
    if (row == null) return null;
    if (Array.isArray(row)) return row.map((r) => inventoryInboundMap.toApi(r));
    const api = {
      id: row.id,
      inboundNo: row.inbound_no ?? null,
      inboundDate: formatDate(row.inbound_date),
      inboundType: row.inbound_type ?? null,
      status: row.status ?? null,
      statusText: row.status_text ?? null,
      locationId: row.location_id ?? null,
      locationName: row.location_name ?? null,
      warehouseId: row.warehouse_id ?? null,
      warehouseName: row.warehouse_name ?? null,
      operator: row.operator ?? null,
      operatorName: row.operator_name ?? null,
      remarks: row.remark ?? row.remarks ?? null,
      referenceType: row.reference_type ?? null,
      referenceId: row.reference_id ?? null,
      referenceNo: row.reference_no ?? null,
      createdBy: row.created_by ?? null,
      createdAt: formatDate(row.created_at),
      updatedAt: formatDate(row.updated_at),
    };
    if (Array.isArray(row.items)) {
      api.items = row.items.map((it) => inventoryInboundItemMap.toApi(it));
    }
    return api;
  },
  fromApi(body = {}) {
    const inboundDateRaw = body.inboundDate ?? body.inbound_date;
    const locationRaw = body.locationId ?? body.location_id;
    const warehouseRaw = body.warehouseId ?? body.warehouse_id;
    const referenceIdRaw = body.referenceId ?? body.reference_id;
    const row = {
      id: body.id,
      inbound_no: body.inboundNo ?? body.inbound_no,
      inbound_date: inboundDateRaw != null ? formatDate(inboundDateRaw) : undefined,
      inbound_type: body.inboundType ?? body.inbound_type,
      status: body.status,
      location_id: locationRaw != null ? toNumber(locationRaw, locationRaw) : undefined,
      warehouse_id: warehouseRaw != null ? toNumber(warehouseRaw, warehouseRaw) : undefined,
      operator: body.operator,
      remark: body.remarks ?? body.remark,
      reference_type: body.referenceType ?? body.reference_type,
      reference_id: referenceIdRaw != null ? toNumber(referenceIdRaw, referenceIdRaw) : undefined,
      reference_no: body.referenceNo ?? body.reference_no,
      created_by: body.createdBy ?? body.created_by,
    };
    if (Array.isArray(body.items)) {
      row.items = body.items.map((it) => inventoryInboundItemMap.fromApi(it));
    }
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  fromListQuery(query = {}) {
    const filters = {};
    if (query.inboundNo) filters.inbound_no = query.inboundNo;
    if (query.startDate) filters.start_date = query.startDate;
    if (query.endDate) filters.end_date = query.endDate;
    if (query.locationId) filters.location_id = query.locationId;
    if (query.inboundType) filters.inbound_type = query.inboundType;
    if (query.materialName) filters.material_name = query.materialName;
    if (query.status) filters.status = query.status;
    return filters;
  },
};

const inventoryOutboundItemMap = {
  toApi(row) {
    if (row == null) return null;
    return {
      id: row.id ?? null,
      outboundId: row.outbound_id ?? null,
      materialId: row.material_id ?? null,
      materialCode: row.material_code ?? null,
      materialName: row.material_name ?? null,
      specification: row.specification ?? row.specs ?? null,
      quantity: toNumber(row.quantity, 0),
      plannedQuantity:
        row.planned_quantity != null ? toNumber(row.planned_quantity, 0) : null,
      actualQuantity: row.actual_quantity != null ? toNumber(row.actual_quantity, 0) : null,
      shortageQuantity:
        row.shortage_quantity != null ? toNumber(row.shortage_quantity, 0) : null,
      stockQuantity: row.stock_quantity != null ? toNumber(row.stock_quantity, 0) : null,
      unitId: row.unit_id ?? null,
      unitName: row.unit_name ?? null,
      batchNo: row.batch_number ?? row.batch_no ?? null,
      locationId: row.location_id ?? null,
      locationName: row.location_name ?? null,
      remarks: row.remark ?? row.remarks ?? null,
    };
  },
  fromApi(body = {}) {
    // Accept camel (HTTP preferred) and snake (UAT / legacy)
    const materialRaw = body.materialId ?? body.material_id;
    const unitRaw = body.unitId ?? body.unit_id;
    const locationRaw = body.locationId ?? body.location_id;
    const plannedRaw = body.plannedQuantity ?? body.planned_quantity;
    const actualRaw = body.actualQuantity ?? body.actual_quantity;
    const shortageRaw = body.shortageQuantity ?? body.shortage_quantity;
    const row = {
      id: body.id,
      material_id: materialRaw != null ? toNumber(materialRaw, materialRaw) : undefined,
      quantity: body.quantity != null ? toNumber(body.quantity, 0) : undefined,
      unit_id: unitRaw,
      batch_number: body.batchNo ?? body.batchNumber ?? body.batch_number,
      location_id: locationRaw != null ? toNumber(locationRaw, locationRaw) : undefined,
      planned_quantity: plannedRaw != null ? toNumber(plannedRaw, 0) : undefined,
      actual_quantity: actualRaw != null ? toNumber(actualRaw, 0) : undefined,
      shortage_quantity: shortageRaw != null ? toNumber(shortageRaw, 0) : undefined,
      remark: body.remarks ?? body.remark,
    };
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
};

const resolveOutboundType = (row) => {
  const type = row.outbound_type ?? row.outboundType;
  if (type && type !== 'manual' && type !== 'other') {
    return type;
  }
  if (row.production_task_id || row.productionTaskId || row.reference_type === 'production_task' || row.referenceType === 'production_task' || row.production_task_code || row.product_code || row.productCode) {
    return 'production';
  }
  if (row.sales_order_id || row.salesOrderId || row.reference_type === 'sales_order' || row.referenceType === 'sales_order' || row.customer_id || row.customerId) {
    return 'sales';
  }
  if (row.reference_type === 'outsourced' || row.referenceType === 'outsourced') {
    return 'outsourced';
  }
  return type || 'manual';
};

const inventoryOutboundMap = {
  toApi(row) {
    if (row == null) return null;
    if (Array.isArray(row)) return row.map((r) => inventoryOutboundMap.toApi(r));
    const api = {
      id: row.id,
      outboundNo: row.outbound_no ?? null,
      outboundDate: formatDate(row.outbound_date),
      outboundType: resolveOutboundType(row),
      status: row.status ?? null,
      statusText: row.status_text ?? null,
      locationId: row.location_id ?? null,
      locationName: row.location_name ?? null,
      operator: row.operator ?? null,
      operatorName: row.operator_name ?? null,
      remarks: row.remark ?? row.remarks ?? null,
      referenceType: row.reference_type ?? null,
      referenceId: row.reference_id ?? null,
      referenceNo: row.reference_no ?? null,
      productId: row.product_id ?? null,
      productCode: row.product_code ?? null,
      productName: row.product_name ?? row.production_task_product_name ?? null,
      productSpecs: row.product_specs ?? row.productSpecs ?? null,
      productionTaskId: row.production_task_id ?? null,
      productionTaskCode: row.production_task_code ?? null,
      productionTaskProductName: row.production_task_product_name ?? null,
      productionTaskQuantity:
        row.production_task_quantity != null ? toNumber(row.production_task_quantity, 0) : null,
      productionGroupId: row.production_group_id ?? null,
      productionGroupName: row.production_group_name ?? null,
      createdBy: row.created_by ?? null,
      createdAt: formatDate(row.created_at),
      updatedAt: formatDate(row.updated_at),
    };
    if (Array.isArray(row.items)) {
      api.items = row.items.map((it) => inventoryOutboundItemMap.toApi(it));
    }
    return api;
  },
  fromApi(body = {}) {
    const outboundDateRaw = body.outboundDate ?? body.outbound_date;
    const locationRaw = body.locationId ?? body.location_id;
    const referenceIdRaw = body.referenceId ?? body.reference_id;
    const productionTaskRaw = body.productionTaskId ?? body.production_task_id;
    const row = {
      id: body.id,
      outbound_no: body.outboundNo ?? body.outbound_no,
      outbound_date: outboundDateRaw != null ? formatDate(outboundDateRaw) : undefined,
      outbound_type: body.outboundType ?? body.outbound_type,
      status: body.status,
      location_id: locationRaw != null ? toNumber(locationRaw, locationRaw) : undefined,
      operator: body.operator,
      remark: body.remarks ?? body.remark,
      reference_type: body.referenceType ?? body.reference_type,
      reference_id: referenceIdRaw != null ? toNumber(referenceIdRaw, referenceIdRaw) : undefined,
      reference_no: body.referenceNo ?? body.reference_no,
      production_task_id:
        productionTaskRaw != null ? toNumber(productionTaskRaw, productionTaskRaw) : undefined,
      issue_reason: body.issueReason ?? body.issue_reason,
      is_excess:
        body.isExcess != null
          ? Boolean(body.isExcess)
          : body.is_excess != null
            ? Boolean(body.is_excess)
            : undefined,
      allow_excess:
        body.allowExcess != null
          ? Boolean(body.allowExcess)
          : body.allow_excess != null
            ? Boolean(body.allow_excess)
            : undefined,
      created_by: body.createdBy ?? body.created_by,
    };
    if (Array.isArray(body.items)) {
      row.items = body.items.map((it) => inventoryOutboundItemMap.fromApi(it));
    }
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  fromListQuery(query = {}) {
    const filters = {};
    if (query.search) filters.search = query.search;
    if (query.status) filters.status = query.status;
    if (query.startDate) filters.start_date = query.startDate;
    if (query.endDate) filters.end_date = query.endDate;
    if (query.productionPlanId) {
      filters.production_plan_id = query.productionPlanId;
    }
    if (query.productionGroupId) {
      filters.production_group_id = query.productionGroupId;
    }
    return filters;
  },
};

/**
 * 盘点 inventory_checks / inventory_check_items
 */
const inventoryCheckItemMap = {
  toApi(row) {
    if (row == null) return null;
    return {
      id: row.id ?? null,
      checkId: row.check_id ?? null,
      materialId: row.material_id ?? null,
      materialCode: row.material_code ?? null,
      materialName: row.material_name ?? null,
      specification: row.specification ?? row.specs ?? null,
      unitId: row.unit_id ?? null,
      unitName: row.unit_name ?? null,
      bookQuantity:
        row.system_quantity != null
          ? toNumber(row.system_quantity, 0)
          : row.book_qty != null
            ? toNumber(row.book_qty, 0)
            : null,
      actualQuantity:
        row.actual_quantity != null
          ? toNumber(row.actual_quantity, 0)
          : row.actual_qty != null
            ? toNumber(row.actual_qty, 0)
            : null,
      difference: row.difference != null ? toNumber(row.difference, 0) : null,
      remarks: row.remark ?? row.remarks ?? null,
    };
  },
  fromApi(body = {}) {
    const row = {
      id: body.id,
      material_id: body.materialId != null ? toNumber(body.materialId, body.materialId) : undefined,
      system_quantity:
        body.bookQuantity != null
          ? toNumber(body.bookQuantity, 0)
          : body.systemQuantity != null
            ? toNumber(body.systemQuantity, 0)
            : undefined,
      actual_quantity:
        body.actualQuantity != null ? toNumber(body.actualQuantity, 0) : undefined,
      unit_id: body.unitId,
      difference: body.difference != null ? toNumber(body.difference, 0) : undefined,
      remark: body.remarks ?? body.remark,
    };
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
};

const inventoryCheckMap = {
  toApi(row) {
    if (row == null) return null;
    if (Array.isArray(row)) return row.map((r) => inventoryCheckMap.toApi(r));
    const api = {
      id: row.id,
      checkNo: row.check_no ?? null,
      locationId: row.location_id ?? null,
      locationName: row.location_name ?? row.warehouse ?? null,
      warehouse: row.location_name ?? row.warehouse ?? null,
      checkType: row.check_type ?? null,
      checkDate: formatDate(row.check_date),
      status: row.status ?? null,
      remarks: row.remark ?? row.remarks ?? null,
      description: row.description ?? null,
      creatorName: row.creator_name ?? row.creator ?? null,
      creator: row.creator_name ?? row.creator ?? null,
      createdBy: row.created_by ?? null,
      createdAt: formatDate(row.created_at),
      updatedAt: formatDate(row.updated_at),
      itemCount: row.item_count != null ? toNumber(row.item_count, 0) : null,
    };
    if (Array.isArray(row.items)) {
      api.items = row.items.map((it) => inventoryCheckItemMap.toApi(it));
    }
    return api;
  },
  fromApi(body = {}) {
    const row = {
      id: body.id,
      check_no: body.checkNo,
      location_id:
        body.locationId != null
          ? toNumber(body.locationId, body.locationId)
          : body.warehouseId != null
            ? toNumber(body.warehouseId, body.warehouseId)
            : undefined,
      check_type: body.checkType,
      check_date: body.checkDate != null ? formatDate(body.checkDate) : undefined,
      status: body.status,
      remark: body.remarks ?? body.remark,
      description: body.description,
      created_by: body.createdBy,
    };
    if (Array.isArray(body.items)) {
      row.items = body.items.map((it) => inventoryCheckItemMap.fromApi(it));
    }
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  fromListQuery(query = {}) {
    const filters = {};
    if (query.search) filters.search = query.search;
    if (query.checkNo) filters.check_no = query.checkNo;
    if (query.status) filters.status = query.status;
    if (query.checkType) filters.check_type = query.checkType;
    if (query.startDate) filters.start_date = query.startDate;
    if (query.endDate) filters.end_date = query.endDate;
    if (query.materialName) filters.materialName = query.materialName;
    return filters;
  },
};

/**
 * 调拨 inventory_transfers / inventory_transfer_items
 */
const inventoryTransferItemMap = {
  toApi(row) {
    if (row == null) return null;
    return {
      id: row.id ?? null,
      transferId: row.transfer_id ?? null,
      materialId: row.material_id ?? null,
      materialCode: row.material_code ?? null,
      materialName: row.material_name ?? null,
      specification: row.specification ?? row.specs ?? null,
      quantity: toNumber(row.quantity, 0),
      unitId: row.unit_id ?? null,
      unitName: row.unit_name ?? null,
      remarks: row.remark ?? row.remarks ?? null,
    };
  },
  fromApi(body = {}) {
    const row = {
      id: body.id,
      material_id: body.materialId != null ? toNumber(body.materialId, body.materialId) : undefined,
      quantity: body.quantity != null ? toNumber(body.quantity, 0) : undefined,
      unit_id: body.unitId,
      remark: body.remarks ?? body.remark,
    };
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
};

const inventoryTransferMap = {
  toApi(row) {
    if (row == null) return null;
    if (Array.isArray(row)) return row.map((r) => inventoryTransferMap.toApi(r));
    const api = {
      id: row.id,
      transferNo: row.transfer_no ?? null,
      transferDate: formatDate(row.transfer_date),
      fromLocationId: row.from_location_id ?? null,
      toLocationId: row.to_location_id ?? null,
      fromLocationName: row.from_location ?? row.from_location_name ?? null,
      toLocationName: row.to_location ?? row.to_location_name ?? null,
      status: row.status ?? null,
      remarks: row.remark ?? row.remarks ?? null,
      creatorName: row.creator_name ?? row.creator ?? null,
      creator: row.creator_name ?? row.creator ?? null,
      createdBy: row.created_by ?? null,
      createdAt: formatDate(row.created_at),
      updatedAt: formatDate(row.updated_at),
      itemCount: row.item_count != null ? toNumber(row.item_count, 0) : null,
    };
    if (Array.isArray(row.items)) {
      api.items = row.items.map((it) => inventoryTransferItemMap.toApi(it));
    }
    return api;
  },
  fromApi(body = {}) {
    const fromId =
      body.fromLocationId != null
        ? toNumber(body.fromLocationId, body.fromLocationId)
        : body.outLocationId != null
          ? toNumber(body.outLocationId, body.outLocationId)
          : undefined;
    const toId =
      body.toLocationId != null
        ? toNumber(body.toLocationId, body.toLocationId)
        : body.inLocationId != null
          ? toNumber(body.inLocationId, body.inLocationId)
          : undefined;
    const row = {
      id: body.id,
      transfer_no: body.transferNo,
      transfer_date: body.transferDate != null ? formatDate(body.transferDate) : undefined,
      from_location_id: fromId,
      to_location_id: toId,
      status: body.status,
      remark: body.remarks ?? body.remark,
      created_by: body.createdBy,
    };
    if (Array.isArray(body.items)) {
      row.items = body.items.map((it) => inventoryTransferItemMap.fromApi(it));
    }
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  fromListQuery(query = {}) {
    const filters = {};
    if (query.search) filters.search = query.search;
    if (query.transferNo) filters.transfer_no = query.transferNo;
    if (query.status) filters.status = query.status;
    if (query.fromLocationId) filters.from_location_id = query.fromLocationId;
    if (query.toLocationId) filters.to_location_id = query.toLocationId;
    if (query.startDate) filters.start_date = query.startDate;
    if (query.endDate) filters.end_date = query.endDate;
    return filters;
  },
};

module.exports = {
  inventoryInboundMap,
  inventoryInboundItemMap,
  inventoryOutboundMap,
  inventoryOutboundItemMap,
  inventoryCheckMap,
  inventoryCheckItemMap,
  inventoryTransferMap,
  inventoryTransferItemMap,
};
