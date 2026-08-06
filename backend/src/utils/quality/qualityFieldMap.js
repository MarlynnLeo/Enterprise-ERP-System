/**
 * 质量检验域字段契约（SSOT）
 * quality_inspections / quality_inspection_items
 */

const { formatDate, toNumber } = require('../fieldMap');

const qualityInspectionItemMap = {
  toApi(row) {
    if (row == null) return null;
    return {
      id: row.id ?? null,
      inspectionId: row.inspection_id ?? null,
      itemName: row.item_name ?? null,
      standard: row.standard ?? null,
      type: row.type ?? null,
      isCritical: row.is_critical != null ? Boolean(row.is_critical) : null,
      dimensionValue: row.dimension_value ?? null,
      toleranceUpper: row.tolerance_upper ?? null,
      toleranceLower: row.tolerance_lower ?? null,
      actualValue: row.actual_value ?? null,
      measure1: row.measure_1 ?? null,
      measure2: row.measure_2 ?? null,
      measure3: row.measure_3 ?? null,
      measure4: row.measure_4 ?? null,
      measure5: row.measure_5 ?? null,
      measure6: row.measure_6 ?? null,
      method: row.method ?? null,
      result: row.result ?? null,
      isQualified: row.is_qualified != null ? Boolean(row.is_qualified) : null,
      remarks: row.remark ?? row.remarks ?? null,
      createdAt: formatDate(row.created_at),
      updatedAt: formatDate(row.updated_at),
    };
  },
  fromApi(body = {}) {
    const row = {
      id: body.id,
      item_name: body.itemName,
      standard: body.standard,
      type: body.type,
      is_critical: body.isCritical,
      dimension_value: body.dimensionValue,
      tolerance_upper: body.toleranceUpper,
      tolerance_lower: body.toleranceLower,
      actual_value: body.actualValue,
      measure_1: body.measure1,
      measure_2: body.measure2,
      measure_3: body.measure3,
      measure_4: body.measure4,
      measure_5: body.measure5,
      measure_6: body.measure6,
      method: body.method,
      result: body.result,
      is_qualified: body.isQualified,
      remark: body.remarks ?? body.remark,
    };
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
};

const qualityInspectionMap = {
  toApi(row) {
    if (row == null) return null;
    if (Array.isArray(row)) return row.map((r) => qualityInspectionMap.toApi(r));
    const api = {
      id: row.id,
      inspectionNo: row.inspection_no ?? null,
      inspectionType: row.inspection_type ?? null,
      status: row.status ?? null,
      batchNo: row.batch_no ?? null,
      quantity: row.quantity != null ? toNumber(row.quantity, 0) : null,
      qualifiedQuantity:
        row.qualified_quantity != null ? toNumber(row.qualified_quantity, 0) : null,
      unqualifiedQuantity:
        row.unqualified_quantity != null ? toNumber(row.unqualified_quantity, 0) : null,
      unit: row.unit ?? null,
      unitId: row.unit_id ?? null,
      plannedDate: formatDate(row.planned_date),
      actualDate: formatDate(row.actual_date),
      inspectorId: row.inspector_id ?? null,
      inspectorName: row.inspector_name ?? null,
      materialId: row.material_id ?? null,
      productId: row.product_id ?? null,
      productName: row.product_name ?? null,
      productCode: row.product_code ?? null,
      itemName: row.item_name ?? null,
      itemCode: row.item_code ?? null,
      itemSpecs: row.item_specs ?? null,
      referenceId: row.reference_id ?? null,
      referenceNo: row.reference_no ?? null,
      processId: row.process_id ?? null,
      processName: row.process_name ?? null,
      taskId: row.task_id ?? null,
      supplierId: row.supplier_id ?? null,
      supplierName: row.supplier_name ?? null,
      supplierContact: row.supplier_contact ?? null,
      templateId: row.template_id ?? null,
      templateCode: row.template_code ?? null,
      templateName: row.template_name ?? null,
      standardType: row.standard_type ?? null,
      standardNo: row.standard_no ?? null,
      note: row.note ?? null,
      punchCount: row.punch_count != null ? toNumber(row.punch_count, 0) : null,
      taskStatus: row.task_status ?? null,
      isFirstArticle: row.is_first_article != null ? Boolean(row.is_first_article) : null,
      isAql: row.is_aql != null ? Boolean(row.is_aql) : null,
      createdAt: formatDate(row.created_at),
      updatedAt: formatDate(row.updated_at),
    };
    if (Array.isArray(row.items)) {
      api.items = row.items.map((it) => qualityInspectionItemMap.toApi(it));
    }
    return api;
  },
  fromApi(body = {}) {
    const row = {
      id: body.id,
      inspection_no: body.inspectionNo,
      inspection_type: body.inspectionType,
      status: body.status,
      batch_no: body.batchNo,
      quantity: body.quantity != null ? toNumber(body.quantity, 0) : undefined,
      qualified_quantity:
        body.qualifiedQuantity != null ? toNumber(body.qualifiedQuantity, 0) : undefined,
      unqualified_quantity:
        body.unqualifiedQuantity != null ? toNumber(body.unqualifiedQuantity, 0) : undefined,
      unit: body.unit,
      unit_id: body.unitId,
      planned_date: body.plannedDate != null ? formatDate(body.plannedDate) : undefined,
      actual_date: body.actualDate != null ? formatDate(body.actualDate) : undefined,
      inspector_id: body.inspectorId,
      inspector_name: body.inspectorName,
      material_id: body.materialId != null ? toNumber(body.materialId, body.materialId) : undefined,
      product_id: body.productId != null ? toNumber(body.productId, body.productId) : undefined,
      product_name: body.productName,
      product_code: body.productCode,
      reference_id:
        body.referenceId != null ? toNumber(body.referenceId, body.referenceId) : undefined,
      reference_no: body.referenceNo,
      process_id: body.processId != null ? toNumber(body.processId, body.processId) : undefined,
      process_name: body.processName,
      task_id: body.taskId != null ? toNumber(body.taskId, body.taskId) : undefined,
      supplier_id: body.supplierId != null ? toNumber(body.supplierId, body.supplierId) : undefined,
      template_id: body.templateId,
      standard_type: body.standardType,
      standard_no: body.standardNo,
      note: body.note ?? body.remarks,
      is_first_article: body.isFirstArticle,
      is_aql: body.isAql,
    };
    if (Array.isArray(body.items)) {
      row.items = body.items.map((it) => qualityInspectionItemMap.fromApi(it));
    }
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  fromListQuery(query = {}) {
    const filters = {};
    if (query.keyword) filters.keyword = query.keyword;
    if (query.status) filters.status = query.status;
    if (query.startDate) filters.startDate = query.startDate;
    if (query.endDate) filters.endDate = query.endDate;
    return filters;
  },
};

module.exports = {
  qualityInspectionMap,
  qualityInspectionItemMap,
};
