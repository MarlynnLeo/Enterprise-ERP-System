/**
 * 质量检验域字段契约（SSOT）
 * quality_inspections / quality_inspection_items
 */

const { formatDate, toNumber } = require('../fieldMap');

// The quality UI, fixed columns, and measurement child table all support six samples.
// Keep this boundary constant aligned with the public inspection contract.
const MAX_QUALITY_MEASUREMENT_SAMPLES = 6;

const qualityInspectionItemMap = {
  toApi(row) {
    if (row == null) return null;
    const measurements = Array.isArray(row.measurements)
      ? row.measurements.slice(0, MAX_QUALITY_MEASUREMENT_SAMPLES).map((m, index) => ({
        sample_no: m.sample_no ?? m.sampleNo ?? index + 1,
        measured_value: m.measured_value ?? m.measuredValue ?? m.value ?? null,
        measured_by: m.measured_by ?? m.measuredBy ?? null,
        is_qualified: m.is_qualified ?? m.isQualified ?? null,
        measured_at: formatDate(m.measured_at ?? m.measuredAt),
      }))
      : [];
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
      measurements,
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
      inspection_id: body.inspectionId ?? body.inspection_id,
      item_name: body.itemName ?? body.item_name,
      standard: body.standard,
      type: body.type,
      is_critical: body.isCritical ?? body.is_critical,
      dimension_value: body.dimensionValue ?? body.dimension_value,
      tolerance_upper: body.toleranceUpper ?? body.tolerance_upper,
      tolerance_lower: body.toleranceLower ?? body.tolerance_lower,
      actual_value: body.actualValue ?? body.actual_value,
      measure_1: body.measure1 ?? body.measure_1,
      measure_2: body.measure2 ?? body.measure_2,
      measure_3: body.measure3 ?? body.measure_3,
      measure_4: body.measure4 ?? body.measure_4,
      measure_5: body.measure5 ?? body.measure_5,
      measure_6: body.measure6 ?? body.measure_6,
      measurements: Array.isArray(body.measurements)
        ? body.measurements.slice(0, MAX_QUALITY_MEASUREMENT_SAMPLES).map((m, index) => ({
          sample_no: m?.sample_no ?? m?.sampleNo ?? index + 1,
          measured_value: m?.measured_value ?? m?.measuredValue ?? m?.value ?? m,
          measured_by: m?.measured_by ?? m?.measuredBy,
          is_qualified: m?.is_qualified ?? m?.isQualified,
          measured_at: m?.measured_at ?? m?.measuredAt,
        }))
        : undefined,
      method: body.method,
      result: body.result,
      is_qualified: body.isQualified ?? body.is_qualified,
      remark: body.remarks ?? body.remark ?? body.note,
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
      sourceType: row.source_type ?? null,
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
      aqlStandardId: row.aql_standard_id ?? null,
      aqlLevel: row.aql_level ?? null,
      acceptLimit: row.accept_limit ?? null,
      rejectLimit: row.reject_limit ?? null,
      standardType: row.standard_type ?? null,
      standardNo: row.standard_no ?? null,
      note: row.note ?? null,
      attachments: Array.isArray(row.attachments)
        ? row.attachments.map((attachment) => ({
          id: attachment.id ?? null,
          url: attachment.url ?? attachment.fileUrl ?? attachment.file_url ?? null,
          name: attachment.name ?? attachment.filename ?? attachment.originalName ?? '附件',
          size: attachment.size ?? null,
          type: attachment.type ?? attachment.mimetype ?? attachment.mimeType ?? null,
          createdAt: formatDate(attachment.created_at ?? attachment.createdAt),
        }))
        : [],
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
    const qualifiedQty = body.qualifiedQuantity ?? body.qualified_quantity;
    const unqualifiedQty = body.unqualifiedQuantity ?? body.unqualified_quantity;
    const qty = body.quantity;
    const plannedD = body.plannedDate ?? body.planned_date;
    const actualD = body.actualDate ?? body.actual_date;
    const matId = body.materialId ?? body.material_id;
    const prodId = body.productId ?? body.product_id;
    const refId = body.referenceId ?? body.reference_id;
    const procId = body.processId ?? body.process_id;
    const tId = body.taskId ?? body.task_id;
    const supId = body.supplierId ?? body.supplier_id;
    const tmplId = body.templateId ?? body.template_id;

    const row = {
      id: body.id,
      inspection_no: body.inspectionNo ?? body.inspection_no,
      inspection_type: body.inspectionType ?? body.inspection_type,
      source_type: body.sourceType ?? body.source_type,
      status: body.status,
      batch_no: body.batchNo ?? body.batch_no,
      quantity: qty != null ? toNumber(qty, 0) : undefined,
      qualified_quantity: qualifiedQty != null ? toNumber(qualifiedQty, 0) : undefined,
      unqualified_quantity: unqualifiedQty != null ? toNumber(unqualifiedQty, 0) : undefined,
      unit: body.unit,
      unit_id: body.unitId ?? body.unit_id,
      planned_date: plannedD != null ? formatDate(plannedD) : undefined,
      actual_date: actualD != null ? formatDate(actualD) : undefined,
      inspector_id: body.inspectorId ?? body.inspector_id,
      inspector_name: body.inspectorName ?? body.inspector_name,
      material_id: matId != null ? toNumber(matId, matId) : undefined,
      product_id: prodId != null ? toNumber(prodId, prodId) : undefined,
      product_name: body.productName ?? body.product_name,
      product_code: body.productCode ?? body.product_code,
      reference_id: refId != null ? toNumber(refId, refId) : undefined,
      reference_no: body.referenceNo ?? body.reference_no,
      process_id: procId != null ? toNumber(procId, procId) : undefined,
      process_name: body.processName ?? body.process_name,
      task_id: tId != null ? toNumber(tId, tId) : undefined,
      supplier_id: supId != null ? toNumber(supId, supId) : undefined,
      template_id: tmplId,
      aql_standard_id: body.aqlStandardId ?? body.aql_standard_id,
      aql_level: body.aqlLevel ?? body.aql_level,
      accept_limit: body.acceptLimit ?? body.accept_limit,
      reject_limit: body.rejectLimit ?? body.reject_limit,
      standard_type: body.standardType ?? body.standard_type,
      standard_no: body.standardNo ?? body.standard_no,
      note: body.note ?? body.remarks ?? body.remark,
      // 附件由 file_access_records 管理；保留显式数组供质量检验模型在
      // 同一事务内做授权记录差异回收，未传该字段时不改变现有附件。
      attachments: Array.isArray(body.attachments) ? body.attachments : undefined,
      is_first_article: body.isFirstArticle ?? body.is_first_article,
      is_aql: body.isAql ?? body.is_aql,
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
  MAX_QUALITY_MEASUREMENT_SAMPLES,
};
