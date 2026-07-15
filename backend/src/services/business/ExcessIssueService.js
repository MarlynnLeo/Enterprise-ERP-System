const db = require('../../config/db');
const { logger } = require('../../utils/logger');

class ExcessIssueService {
  async _getPlanMaterialColumnSet() {
    const { rows } = await db.query(
      `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'production_plan_materials'
      `
    );
    return new Set(rows.map((column) => column.COLUMN_NAME));
  }

  async _getTaskContext(productionTaskId) {
    const { rows } = await db.query(
      `
      SELECT
        pt.id,
        pt.product_id,
        pt.quantity,
        pt.plan_id,
        pp.quantity AS plan_quantity,
        pp.bom_id AS plan_bom_id
      FROM production_tasks pt
      LEFT JOIN production_plans pp
        ON pp.id = pt.plan_id
       AND pp.deleted_at IS NULL
      WHERE pt.id = ?
        AND pt.deleted_at IS NULL
      `,
      [productionTaskId]
    );

    return rows[0] || null;
  }

  async _getPlanIssueQuantity(task, materialId) {
    if (!task.plan_id) return null;

    const columnSet = await this._getPlanMaterialColumnSet();
    // 发料超额上限必须用「需求量」而不是 issue_quantity。
    // issue_quantity 在 MRP 里表示「按当时库存可从仓发」的数量：无库存时会被写成 0，
    // 但 required_quantity / gross_required_quantity 仍是 BOM 真实需求（如 1000）。
    // 若误用 COALESCE(issue_quantity, required...)，0 会被当成有效值，导致「非BOM计划物料」误报。
    let planQtyExpression = 'COALESCE(ppm.required_quantity, 0)';
    if (columnSet.has('gross_required_quantity') && columnSet.has('required_quantity')) {
      planQtyExpression =
        'COALESCE(NULLIF(ppm.required_quantity, 0), NULLIF(ppm.gross_required_quantity, 0), 0)';
    } else if (columnSet.has('gross_required_quantity')) {
      planQtyExpression = 'COALESCE(ppm.gross_required_quantity, 0)';
    }

    const { rows } = await db.query(
      `
      SELECT SUM(${planQtyExpression}) AS plan_issue_quantity
      FROM production_plan_materials ppm
      WHERE ppm.plan_id = ?
        AND ppm.material_id = ?
      `,
      [task.plan_id, materialId]
    );

    // 计划物料表中没有该物料 → null，交给 BOM 回退
    if (rows.length === 0 || rows[0].plan_issue_quantity === null) return null;

    const planIssueQuantity = parseFloat(rows[0].plan_issue_quantity) || 0;
    // 计划行存在但需求量为 0：也回退 BOM，避免脏数据/旧 MRP 字段把正常发料打成超额
    if (planIssueQuantity <= 0) return null;

    const planQuantity = parseFloat(task.plan_quantity) || 0;
    const taskQuantity = parseFloat(task.quantity) || 0;
    const scale = planQuantity > 0 ? taskQuantity / planQuantity : 1;

    return planIssueQuantity * scale;
  }

  async _getBomIssueQuantity(task, materialId) {
    let bomId = task.plan_bom_id || null;

    if (!bomId) {
      const { rows: boms } = await db.query(
        `
        SELECT id
        FROM bom_masters
        WHERE product_id = ?
          AND deleted_at IS NULL
          AND (status = 1 OR approved_by IS NOT NULL OR approved_at IS NOT NULL)
        ORDER BY
          CASE WHEN status = 1 THEN 0 ELSE 1 END,
          COALESCE(approved_at, created_at) DESC,
          id DESC
        LIMIT 1
        `,
        [task.product_id]
      );
      bomId = boms[0]?.id || null;
    }

    if (!bomId) return 0;

    const { rows } = await db.query(
      `
      SELECT SUM(quantity) AS unit_usage
      FROM bom_details
      WHERE bom_id = ?
        AND material_id = ?
      `,
      [bomId, materialId]
    );

    const unitUsage = parseFloat(rows[0]?.unit_usage || 0);
    return (parseFloat(task.quantity) || 0) * unitUsage;
  }

  async _getIssuedQuantity(productionTaskId, materialId) {
    const { rows } = await db.query(
      `
      SELECT SUM(COALESCE(ioi.actual_quantity, ioi.quantity, 0)) AS total
      FROM inventory_outbound io
      JOIN inventory_outbound_items ioi ON io.id = ioi.outbound_id
      WHERE (
          io.production_task_id = ?
          OR (io.reference_type = 'production_task' AND io.reference_id = ?)
        )
        AND ioi.material_id = ?
        AND io.status IN ('completed', 'confirmed', 'partial_completed')
        AND io.deleted_at IS NULL
      `,
      [productionTaskId, productionTaskId, materialId]
    );

    return parseFloat(rows[0]?.total || 0);
  }

  async checkExcessIssue(productionTaskId, materialId, requestQty) {
    try {
      const requestedQuantity = parseFloat(requestQty) || 0;
      const task = await this._getTaskContext(productionTaskId);

      if (!task) {
        return { isExcess: false, message: '找不到生产任务，跳过检查' };
      }

      const planIssueQuantity = await this._getPlanIssueQuantity(task, materialId);
      let planQty =
        planIssueQuantity !== null
          ? planIssueQuantity
          : await this._getBomIssueQuantity(task, materialId);

      // 双重兜底：计划量仍为 0 时再按 BOM 单位用量×任务数量
      if ((!planQty || planQty <= 0) && planIssueQuantity !== null) {
        const bomQty = await this._getBomIssueQuantity(task, materialId);
        if (bomQty > 0) planQty = bomQty;
      }

      const issuedQty = await this._getIssuedQuantity(productionTaskId, materialId);

      const totalProvided = issuedQty + requestedQuantity;
      const excessQty = totalProvided - planQty;
      const remainingQty = Math.max(0, planQty - issuedQty);

      if (planQty === 0 && requestedQuantity > 0) {
        return {
          isExcess: true,
          planQty: 0,
          issuedQty,
          remainingQty: 0,
          excessQty: requestedQuantity,
          message: `非BOM/计划物料（计划需求为0），本次申领 ${requestedQuantity} 将全部视为超额`,
        };
      }

      if (excessQty > 0) {
        return {
          isExcess: true,
          planQty: parseFloat(planQty.toFixed(4)),
          issuedQty: parseFloat(issuedQty.toFixed(4)),
          remainingQty: parseFloat(remainingQty.toFixed(4)),
          excessQty: parseFloat(excessQty.toFixed(4)),
          message: `计划 ${parseFloat(planQty.toFixed(2))}，已发 ${parseFloat(
            issuedQty.toFixed(2)
          )}，本次 ${requestedQuantity}，将超额 ${parseFloat(excessQty.toFixed(2))}`,
        };
      }

      return {
        isExcess: false,
        planQty: parseFloat(planQty.toFixed(4)),
        issuedQty: parseFloat(issuedQty.toFixed(4)),
        remainingQty: parseFloat(remainingQty.toFixed(4)),
        excessQty: 0,
        message: '在计划范围内',
      };
    } catch (error) {
      logger.error('超额领料检查失败', error);
      throw error;
    }
  }

  async checkBatchExcess(productionTaskId, items) {
    const results = [];
    for (const item of items) {
      const result = await this.checkExcessIssue(
        productionTaskId,
        item.materialId,
        item.quantity
      );
      if (result.isExcess) {
        results.push({
          materialId: item.materialId,
          ...result,
        });
      }
    }
    return results;
  }
}

module.exports = new ExcessIssueService();
