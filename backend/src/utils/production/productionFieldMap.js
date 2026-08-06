/**
 * 生产域字段契约（SSOT）
 * - 生产任务 production_tasks
 */

const { formatDate, toNumber } = require('../fieldMap');

const productionTaskMap = {
  toApi(row) {
    if (row == null) return null;
    if (Array.isArray(row)) return row.map((r) => productionTaskMap.toApi(r));
    return {
      id: row.id,
      code: row.code ?? row.task_code ?? null,
      taskCode: row.task_code ?? row.code ?? null,
      status: row.status ?? null,
      planId: row.plan_id ?? null,
      planName: row.planName ?? row.plan_name ?? null,
      planCode: row.plan_code ?? null,
      contractCode: row.contract_code ?? null,
      productId: row.product_id ?? null,
      productName: row.productName ?? row.product_name ?? null,
      productCode: row.productCode ?? row.product_code ?? null,
      specification: row.specification ?? row.specs ?? null,
      unit: row.unit ?? null,
      quantity: row.quantity != null ? toNumber(row.quantity, 0) : null,
      completedQuantity:
        row.completed_quantity != null ? toNumber(row.completed_quantity, 0) : null,
      progress: row.progress != null ? toNumber(row.progress, 0) : null,
      manager: row.manager ?? row.operator_name ?? null,
      operatorName: row.operator_name ?? row.manager ?? null,
      startDate: formatDate(row.start_date ?? row.plan_start_time),
      expectedEndDate: formatDate(row.expected_end_date ?? row.plan_end_time),
      actualStartTime: row.actual_start_time ?? row.actual_start_time ?? null,
      actualEndDate: formatDate(row.actual_end_date ?? row.actual_end_time),
      costCenterId: row.cost_center_id ?? null,
      remarks: row.remarks ?? null,
      hasOutboundDocument:
        row.has_outbound_document != null ? Boolean(row.has_outbound_document) : null,
      createdAt: formatDate(row.created_at),
      updatedAt: formatDate(row.updated_at),
      processes: Array.isArray(row.processes)
        ? row.processes.map((p) => ({
            id: p.id,
            taskId: p.task_id ?? null,
            processName: p.process_name ?? p.name ?? null,
            sequence: p.sequence ?? p.sort_order ?? null,
            status: p.status ?? null,
            plannedQuantity:
              p.planned_quantity != null ? toNumber(p.planned_quantity, 0) : null,
            completedQuantity:
              p.completed_quantity != null ? toNumber(p.completed_quantity, 0) : null,
          }))
        : row.processes ?? undefined,
    };
  },
  fromApi(body = {}) {
    // Accept camel (preferred HTTP) and snake (legacy UAT / internal callers)
    const planRaw = body.planId ?? body.plan_id;
    const productRaw = body.productId ?? body.product_id;
    const startRaw = body.startDate ?? body.start_date;
    const endRaw = body.expectedEndDate ?? body.expected_end_date;
    const processTplRaw = body.processTemplateId ?? body.process_template_id;
    const completedRaw = body.completedQuantity ?? body.completed_quantity;
    const row = {
      id: body.id,
      plan_id: planRaw != null ? toNumber(planRaw, planRaw) : undefined,
      product_id: productRaw != null ? toNumber(productRaw, productRaw) : undefined,
      quantity: body.quantity != null ? toNumber(body.quantity, 0) : undefined,
      start_date: startRaw != null ? formatDate(startRaw) : undefined,
      expected_end_date: endRaw != null ? formatDate(endRaw) : undefined,
      manager: body.manager,
      remarks: body.remarks,
      process_template_id: processTplRaw,
      status: body.status,
      progress: body.progress,
      completed_quantity: completedRaw != null ? toNumber(completedRaw, 0) : undefined,
    };
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  },
  fromListQuery(query = {}) {
    const filters = { ...query };
    // 列表 repository 仍读若干 snake/query 原键；此处规范化 camel 别名
    if (query.planId && !query.plan_id) filters.plan_id = query.planId;
    if (query.productId && !query.product_id) filters.product_id = query.productId;
    if (query.startDate && !query.start_date) filters.start_date = query.startDate;
    if (query.endDate && !query.end_date) filters.end_date = query.endDate;
    return filters;
  },
};

module.exports = {
  productionTaskMap,
};
