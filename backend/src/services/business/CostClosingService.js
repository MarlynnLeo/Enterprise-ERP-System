const db = require('../../config/db');
const CostAccountingService = require('./CostAccountingService');

const CHECK_DEFINITIONS = [
  {
    key: 'purchaseAmount',
    title: '采购金额链路',
    severity: 'blocker',
    description: '采购订单、收货单价和收货金额必须一致。',
  },
  {
    key: 'inventoryCost',
    title: '库存成本链路',
    severity: 'blocker',
    description: '入库台账成本必须能追溯到收货价，台账金额必须等于数量乘单价。',
  },
  {
    key: 'standardCost',
    title: '标准成本有效性',
    severity: 'blocker',
    description: '生效标准成本不能为 0，启用标记必须和状态一致。',
  },
  {
    key: 'actualCost',
    title: '实际成本完整性',
    severity: 'blocker',
    description: '已完工任务必须有非负实际成本，且等于材料、人工、制造费用合计。',
  },
  {
    key: 'variance',
    title: '成本差异闭环',
    severity: 'blocker',
    description: '期间内已完工任务必须有成本差异记录，差异金额必须可复核。',
  },
  {
    key: 'wip',
    title: '在制品快照',
    severity: 'warning',
    description: '期间存在未完工生产任务时，应先生成 WIP 快照。',
  },
  {
    key: 'voucher',
    title: '成本凭证',
    severity: 'warning',
    description: '有 WIP 金额时，应生成或复用 WIP 月末结转凭证。',
  },
];

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function periodDateClause(column) {
  return `${column} BETWEEN ? AND ?`;
}

class CostClosingService {
  static async getPeriod(connection, periodId = null) {
    if (periodId) {
      const [rows] = await connection.execute(
        'SELECT id, period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year, created_at, updated_at, closed_by, closed_at, closing_date, reopened_by, reopened_at, status FROM gl_periods WHERE id = ?',
        [periodId]
      );
      if (rows.length === 0) {
        const error = new Error('Accounting period not found');
        error.statusCode = 404;
        throw error;
      }
      return rows[0];
    }

    const [rows] = await connection.execute(
      `SELECT id, period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year, created_at, updated_at, closed_by, closed_at, closing_date, reopened_by, reopened_at, status FROM gl_periods
        WHERE COALESCE(is_closed, 0) = 0
        ORDER BY start_date ASC, id ASC
        LIMIT 1`
    );
    if (rows.length === 0) {
      const error = new Error('No open accounting period found');
      error.statusCode = 404;
      throw error;
    }
    return rows[0];
  }

  static async countRows(connection, sql, params = []) {
    const [rows] = await connection.execute(sql, params);
    return rows.length;
  }

  static async sampleRows(connection, sql, params = [], limit = 10) {
    const [rows] = await connection.execute(`${sql}\nLIMIT ${limit}`, params);
    return rows;
  }

  static buildCheck(definition, count, sampleRows = []) {
    const passed = count === 0;
    return {
      ...definition,
      status: passed ? 'passed' : definition.severity,
      passed,
      count,
      sampleRows,
    };
  }

  static async collectChecks(connection, period) {
    const periodParams = [period.start_date, period.end_date];

    const purchaseIssueSql = `
      SELECT issue_type, id, source_no, amount
      FROM (
        SELECT 'order_item_amount' AS issue_type, poi.id, po.order_no AS source_no, poi.total AS amount
          FROM purchase_order_items poi
          JOIN purchase_orders po ON po.id = poi.order_id
         WHERE po.deleted_at IS NULL
           AND ${periodDateClause('po.order_date')}
           AND (
             (COALESCE(poi.quantity, 0) > 0 AND COALESCE(poi.price, 0) <= 0)
             OR
             ABS(COALESCE(poi.total, 0) - ROUND(COALESCE(poi.quantity, 0) * COALESCE(poi.price, 0), 2)) > 0.05
             OR ABS(COALESCE(poi.amount_excluding_tax, 0) - ROUND(COALESCE(poi.quantity, 0) * COALESCE(poi.price, 0), 2)) > 0.05
           )
        UNION ALL
        SELECT 'receipt_price' AS issue_type, pri.id, pr.receipt_no AS source_no, pri.total_amount AS amount
          FROM purchase_receipt_items pri
          JOIN purchase_receipts pr ON pr.id = pri.receipt_id
          JOIN purchase_order_items poi ON poi.id = pri.order_item_id
         WHERE pr.deleted_at IS NULL
           AND pr.status IN ('confirmed', 'completed')
           AND ${periodDateClause('pr.receipt_date')}
           AND (
             (COALESCE(pri.quantity, pri.received_quantity, 0) > 0 AND COALESCE(pri.price, 0) <= 0)
             OR ABS(COALESCE(pri.price, 0) - COALESCE(poi.price, 0)) > 0.05
           )
        UNION ALL
        SELECT 'receipt_amount' AS issue_type, pri.id, pr.receipt_no AS source_no, pri.total_amount AS amount
          FROM purchase_receipt_items pri
          JOIN purchase_receipts pr ON pr.id = pri.receipt_id
         WHERE pr.deleted_at IS NULL
           AND ${periodDateClause('pr.receipt_date')}
           AND (
             (COALESCE(pri.quantity, pri.received_quantity, 0) > 0 AND COALESCE(pri.price, 0) <= 0)
             OR
             ABS(COALESCE(pri.amount_excluding_tax, 0) - ROUND(COALESCE(pri.quantity, 0) * COALESCE(pri.price, 0), 2)) > 0.05
             OR ABS(COALESCE(pri.total_amount, 0) - ROUND(COALESCE(pri.amount_excluding_tax, 0) + COALESCE(pri.tax_amount, 0), 2)) > 0.05
           )
        UNION ALL
        SELECT 'receipt_order_link' AS issue_type, pri.id, pr.receipt_no AS source_no,
               pri.total_amount AS amount
          FROM purchase_receipt_items pri
          JOIN purchase_receipts pr ON pr.id = pri.receipt_id
          LEFT JOIN purchase_order_items poi ON poi.id = pri.order_item_id
         WHERE pr.deleted_at IS NULL
           AND pr.order_id IS NOT NULL
           AND ${periodDateClause('pr.receipt_date')}
           AND (
             pri.order_item_id IS NULL
             OR poi.id IS NULL
             OR poi.order_id <> pr.order_id
             OR poi.material_id <> pri.material_id
           )
        UNION ALL
        SELECT 'order_received_quantity' AS issue_type, poi.id, po.order_no AS source_no,
               poi.received_quantity AS amount
          FROM purchase_order_items poi
          JOIN purchase_orders po ON po.id = poi.order_id
          LEFT JOIN (
            SELECT pr.order_id, pri.material_id,
                   SUM(COALESCE(NULLIF(pri.received_quantity, 0), pri.quantity, pri.qualified_quantity, 0))
                     AS received_quantity
              FROM purchase_receipt_items pri
              JOIN purchase_receipts pr ON pr.id = pri.receipt_id
             WHERE pr.deleted_at IS NULL
               AND pr.status IN ('confirmed', 'completed')
             GROUP BY pr.order_id, pri.material_id
          ) receipts ON receipts.order_id = poi.order_id
                    AND receipts.material_id = poi.material_id
          LEFT JOIN (
            SELECT qi.reference_id AS order_id, qi.material_id,
                   SUM(COALESCE(NULLIF(qi.quantity, 0), qi.qualified_quantity, 0))
                     AS inspected_quantity
              FROM quality_inspections qi
             WHERE qi.inspection_type = 'incoming'
               AND qi.deleted_at IS NULL
               AND qi.status NOT IN ('cancelled', 'rejected')
             GROUP BY qi.reference_id, qi.material_id
          ) inspections ON inspections.order_id = poi.order_id
                       AND inspections.material_id = poi.material_id
         WHERE po.deleted_at IS NULL
           AND ${periodDateClause('po.order_date')}
           AND ABS(
             COALESCE(poi.received_quantity, 0)
             - GREATEST(
                 COALESCE(receipts.received_quantity, 0),
                 COALESCE(inspections.inspected_quantity, 0)
               )
           )
               > 0.000001
      ) issues`;
    const purchaseParams = [
      ...periodParams,
      ...periodParams,
      ...periodParams,
      ...periodParams,
      ...periodParams,
    ];

    const inventoryIssueSql = `
      SELECT issue_type, id, transaction_no, amount
      FROM (
        SELECT 'zero_cost_ledger' AS issue_type, il.id, il.transaction_no, il.total_value AS amount
          FROM inventory_ledger il
         WHERE ${periodDateClause('COALESCE(il.transaction_date, DATE(il.created_at))')}
           AND ABS(COALESCE(il.quantity, 0)) > 0
           AND (COALESCE(il.unit_cost, 0) <= 0 OR COALESCE(il.total_value, 0) <= 0)
        UNION ALL
        SELECT 'ledger_formula' AS issue_type, il.id, il.transaction_no, il.total_value AS amount
          FROM inventory_ledger il
         WHERE ${periodDateClause('COALESCE(il.transaction_date, DATE(il.created_at))')}
           AND il.unit_cost IS NOT NULL
           AND il.total_value IS NOT NULL
           AND ABS(ROUND(COALESCE(il.total_value, 0) - ABS(COALESCE(il.quantity, 0)) * COALESCE(il.unit_cost, 0), 2)) > 0.05
        UNION ALL
        SELECT 'receipt_ledger_price' AS issue_type, il.id, il.transaction_no, il.total_value AS amount
          FROM inventory_ledger il
          JOIN purchase_receipt_items pri ON pri.receipt_id = il.receipt_id AND pri.material_id = il.material_id
          JOIN purchase_receipts pr ON pr.id = pri.receipt_id
         WHERE ${periodDateClause('COALESCE(il.transaction_date, DATE(il.created_at))')}
           AND pr.status IN ('confirmed', 'completed')
           AND pr.deleted_at IS NULL
           AND ABS(COALESCE(il.unit_cost, 0) - COALESCE(pri.price, 0)) > 0.05
        UNION ALL
        SELECT 'outbound_batch_cost' AS issue_type, il.id, il.transaction_no, il.total_value AS amount
          FROM inventory_ledger il
         WHERE ${periodDateClause('COALESCE(il.transaction_date, DATE(il.created_at))')}
           AND il.quantity < 0
           AND il.batch_number IS NOT NULL
           AND il.batch_number <> ''
           AND EXISTS (
             SELECT 1 FROM inventory_ledger source
              WHERE source.material_id = il.material_id
                AND source.location_id = il.location_id
                AND source.batch_number = il.batch_number
                AND source.quantity > 0
                AND source.id < il.id
           )
           AND ABS(COALESCE(il.unit_cost, 0) - COALESCE((
             SELECT source.unit_cost
               FROM inventory_ledger source
              WHERE source.material_id = il.material_id
                AND source.location_id = il.location_id
                AND source.batch_number = il.batch_number
                AND source.quantity > 0
                AND source.id < il.id
              ORDER BY source.id DESC
              LIMIT 1
           ), 0)) > 0.000001
      ) issues`;
    const inventoryParams = [...periodParams, ...periodParams, ...periodParams, ...periodParams];

    const standardIssueSql = `
      SELECT id, material_id, product_id, cost_element, standard_price, status, is_active
        FROM standard_costs
       WHERE (is_active = 1 AND status = 'active' AND COALESCE(standard_price, 0) <= 0)
          OR (is_active = 1 AND status <> 'active')
          OR (status = 'active' AND COALESCE(is_active, 0) <> 1)`;

    const actualIssueSql = `
      SELECT id, code, actual_cost, material_cost, labor_cost, overhead_cost
        FROM production_tasks
       WHERE deleted_at IS NULL
         AND status IN ('completed', 'warehousing')
         AND ${periodDateClause('COALESCE(completed_at, actual_end_date, DATE(created_at))')}
         AND (
           actual_cost IS NULL
           OR COALESCE(actual_cost, 0) <= 0
           OR COALESCE(material_cost, 0) < 0
           OR COALESCE(labor_cost, 0) < 0
           OR COALESCE(overhead_cost, 0) < 0
           OR ABS(COALESCE(actual_cost, 0) - ROUND(COALESCE(material_cost, 0) + COALESCE(labor_cost, 0) + COALESCE(overhead_cost, 0), 2)) > 0.05
         )`;

    const varianceIssueSql = `
      SELECT id, task_id, product_id, total_variance
      FROM (
        SELECT cvr.id, cvr.task_id, cvr.product_id, cvr.total_variance
          FROM cost_variance_records cvr
         WHERE ${periodDateClause('DATE(COALESCE(cvr.recorded_at, cvr.created_at))')}
           AND (
             ABS(COALESCE(cvr.standard_total_cost, 0) - ROUND(COALESCE(cvr.standard_material_cost, 0) + COALESCE(cvr.standard_labor_cost, 0) + COALESCE(cvr.standard_overhead_cost, 0), 2)) > 0.05
             OR ABS(COALESCE(cvr.actual_total_cost, 0) - ROUND(COALESCE(cvr.actual_material_cost, 0) + COALESCE(cvr.actual_labor_cost, 0) + COALESCE(cvr.actual_overhead_cost, 0), 2)) > 0.05
             OR ABS(COALESCE(cvr.total_variance, 0) - ROUND(COALESCE(cvr.standard_total_cost, 0) - COALESCE(cvr.actual_total_cost, 0), 2)) > 0.05
           )
        UNION ALL
        SELECT NULL AS id, pt.id AS task_id, pt.product_id, NULL AS total_variance
          FROM production_tasks pt
          LEFT JOIN cost_variance_records cvr ON cvr.task_id = pt.id
         WHERE pt.deleted_at IS NULL
           AND pt.status IN ('completed', 'warehousing')
           AND ${periodDateClause('COALESCE(pt.completed_at, pt.actual_end_date, DATE(pt.created_at))')}
           AND cvr.id IS NULL
      ) issues`;
    const varianceParams = [...periodParams, ...periodParams];

    const openTaskSql = `
      SELECT id, code, status, progress
        FROM production_tasks
       WHERE deleted_at IS NULL
         AND status NOT IN ('completed', 'cancelled')
         AND COALESCE(actual_start_time, start_date, created_at) <= ?`;

    const [[wipSummary]] = await connection.execute(
      `SELECT COUNT(*) AS snapshot_count, COALESCE(SUM(wip_total_cost), 0) AS total_wip
         FROM wip_snapshots
        WHERE period_id = ?`,
      [period.id]
    );
    const openTaskCount = await this.countRows(connection, openTaskSql, [period.end_date]);
    const wipIssueCount = openTaskCount > 0 && toNumber(wipSummary.snapshot_count) === 0 ? openTaskCount : 0;

    const voucherIssueSql = `
      SELECT ws.period_id, SUM(ws.wip_total_cost) AS total_wip
        FROM wip_snapshots ws
       WHERE ws.period_id = ?
       GROUP BY ws.period_id
      HAVING SUM(ws.wip_total_cost) > 0
         AND NOT EXISTS (
           SELECT 1
             FROM gl_entries ge
            WHERE ge.period_id = ws.period_id
              AND ge.status IN ('posted', 'reversed')
              AND (
                ge.document_number = CONCAT('WIP-', ws.period_id)
                OR ge.transaction_id = ws.period_id
                OR ge.document_type LIKE '%WIP%'
                OR ge.transaction_type LIKE '%WIP%'
              )
         )`;

    const checks = [];
    const definitions = Object.fromEntries(CHECK_DEFINITIONS.map((definition) => [definition.key, definition]));

    checks.push(this.buildCheck(
      definitions.purchaseAmount,
      await this.countRows(connection, purchaseIssueSql, purchaseParams),
      await this.sampleRows(connection, purchaseIssueSql, purchaseParams)
    ));
    checks.push(this.buildCheck(
      definitions.inventoryCost,
      await this.countRows(connection, inventoryIssueSql, inventoryParams),
      await this.sampleRows(connection, inventoryIssueSql, inventoryParams)
    ));
    checks.push(this.buildCheck(
      definitions.standardCost,
      await this.countRows(connection, standardIssueSql),
      await this.sampleRows(connection, standardIssueSql)
    ));
    checks.push(this.buildCheck(
      definitions.actualCost,
      await this.countRows(connection, actualIssueSql, periodParams),
      await this.sampleRows(connection, actualIssueSql, periodParams)
    ));
    checks.push(this.buildCheck(
      definitions.variance,
      await this.countRows(connection, varianceIssueSql, varianceParams),
      await this.sampleRows(connection, varianceIssueSql, varianceParams)
    ));
    checks.push(this.buildCheck(
      definitions.wip,
      wipIssueCount,
      wipIssueCount > 0 ? await this.sampleRows(connection, openTaskSql, [period.end_date]) : []
    ));
    checks.push(this.buildCheck(
      definitions.voucher,
      await this.countRows(connection, voucherIssueSql, [period.id]),
      await this.sampleRows(connection, voucherIssueSql, [period.id])
    ));

    return checks;
  }

  static summarize(period, checks) {
    const blockers = checks.filter((check) => check.status === 'blocker');
    const warnings = checks.filter((check) => check.status === 'warning');
    const passed = checks.filter((check) => check.passed);
    return {
      period: {
        id: period.id,
        periodName: period.period_name,
        startDate: period.start_date,
        endDate: period.end_date,
        isClosed: Boolean(period.is_closed),
      },
      canExecute: !period.is_closed && blockers.length === 0,
      canClose: !period.is_closed && blockers.length === 0 && warnings.length === 0,
      status: period.is_closed
        ? 'closed'
        : blockers.length > 0
          ? 'blocked'
          : warnings.length > 0
            ? 'action_required'
            : 'ready',
      summary: {
        total: checks.length,
        passed: passed.length,
        blockers: blockers.length,
        warnings: warnings.length,
      },
      checks,
    };
  }

  static async getClosingStatus(periodId = null) {
    const connection = await db.pool.getConnection();
    try {
      const period = await this.getPeriod(connection, periodId);
      const checks = await this.collectChecks(connection, period);
      return this.summarize(period, checks);
    } finally {
      connection.release();
    }
  }

  static async executeClosing(periodId) {
    const before = await this.getClosingStatus(periodId);
    if (before.period.isClosed) {
      const error = new Error('Accounting period is already closed');
      error.statusCode = 400;
      throw error;
    }
    if (before.summary.blockers > 0) {
      const error = new Error('Cost closing has blocking issues');
      error.statusCode = 400;
      error.details = before.checks.filter((check) => check.status === 'blocker');
      throw error;
    }

    const results = {
      wip: await CostAccountingService.calculateWIPCost(before.period.id),
      wipVoucher: await CostAccountingService.generateWIPVoucher(before.period.id),
      variance: await CostAccountingService.allocateVariance(before.period.id),
    };
    const after = await this.getClosingStatus(before.period.id);
    return { before, results, after };
  }
}

module.exports = CostClosingService;
