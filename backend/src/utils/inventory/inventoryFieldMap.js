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
    const row = {
      id: body.id,
      material_id: body.materialId != null ? toNumber(body.materialId, body.materialId) : undefined,
      quantity: body.quantity != null ? toNumber(body.quantity, 0) : undefined,
      unit_id: body.unitId,
      batch_number: body.batchNo ?? body.batchNumber,
      location_id: body.locationId != null ? toNumber(body.locationId, body.locationId) : undefined,
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
    const row = {
      id: body.id,
      inbound_no: body.inboundNo,
      inbound_date: body.inboundDate != null ? formatDate(body.inboundDate) : undefined,
      inbound_type: body.inboundType,
      status: body.status,
      location_id: body.locationId != null ? toNumber(body.locationId, body.locationId) : undefined,
      warehouse_id:
        body.warehouseId != null ? toNumber(body.warehouseId, body.warehouseId) : undefined,
      operator: body.operator,
      remark: body.remarks ?? body.remark,
      reference_type: body.referenceType,
      reference_id:
        body.referenceId != null ? toNumber(body.referenceId, body.referenceId) : undefined,
      reference_no: body.referenceNo,
      created_by: body.createdBy,
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
    const row = {
      id: body.id,
      material_id: body.materialId != null ? toNumber(body.materialId, body.materialId) : undefined,
      quantity: body.quantity != null ? toNumber(body.quantity, 0) : undefined,
      unit_id: body.unitId,
      batch_number: body.batchNo ?? body.batchNumber,
      location_id: body.locationId != null ? toNumber(body.locationId, body.locationId) : undefined,
      remark: body.remarks ?? body.remark,
    };
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
};

const inventoryOutboundMap = {
  toApi(row) {
    if (row == null) return null;
    if (Array.isArray(row)) return row.map((r) => inventoryOutboundMap.toApi(r));
    const api = {
      id: row.id,
      outboundNo: row.outbound_no ?? null,
      outboundDate: formatDate(row.outbound_date),
      outboundType: row.outbound_type ?? null,
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
    const row = {
      id: body.id,
      outbound_no: body.outboundNo,
      outbound_date: body.outboundDate != null ? formatDate(body.outboundDate) : undefined,
      outbound_type: body.outboundType,
      status: body.status,
      location_id: body.locationId != null ? toNumber(body.locationId, body.locationId) : undefined,
      operator: body.operator,
      remark: body.remarks ?? body.remark,
      reference_type: body.referenceType,
      reference_id:
        body.referenceId != null ? toNumber(body.referenceId, body.referenceId) : undefined,
      reference_no: body.referenceNo,
      production_task_id:
        body.productionTaskId != null
          ? toNumber(body.productionTaskId, body.productionTaskId)
          : undefined,
      issue_reason: body.issueReason,
      is_excess: body.isExcess != null ? Boolean(body.isExcess) : undefined,
      allow_excess: body.allowExcess != null ? Boolean(body.allowExcess) : undefined,
      created_by: body.createdBy,
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
    if (query.productionPlanId || query.production_plan_id) {
      filters.production_plan_id = query.productionPlanId || query.production_plan_id;
    }
    if (query.productionGroupId || query.production_group_id) {
      filters.production_group_id = query.productionGroupId || query.production_group_id;
    }
    return filters;
  },
};

module.exports = {
  inventoryInboundMap,
  inventoryInboundItemMap,
  inventoryOutboundMap,
  inventoryOutboundItemMap,
};
