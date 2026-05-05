/**
 * MRPService.js
 * @description MRP 物料需求计划运算引擎
 * @date 2026-04-21
 *
 * 核心流程:
 *   1. 收集独立需求（销售订单/生产计划）
 *   2. BOM 展开计算相关需求
 *   3. 扣减现有库存 + 安全库存
 *   4. 扣减在途(已下单未入库)
 *   5. 计算净需求
 *   6. 生成采购/生产建议
 */

const { pool } = require('../../config/db');
const { logger } = require('../../utils/logger');
const CodeGeneratorService = require('./CodeGeneratorService');

class MRPService {

  /** 获取 MRP 运算列表 */
  async getRunList(params = {}) {
    const { status, page = 1, pageSize = 20 } = params;
    let where = 'WHERE deleted_at IS NULL';
    const values = [];
    if (status) { where += ' AND status = ?'; values.push(status); }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM mrp_runs ${where}`, values);
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
      `SELECT m.*, u.real_name AS created_by_name
       FROM mrp_runs m LEFT JOIN users u ON u.id = m.created_by
       ${where} ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
      [...values, Number(pageSize), offset]
    );
    return { list: rows, total, page: Number(page), pageSize: Number(pageSize) };
  }

  /** 获取 MRP 运算详情 */
  async getRunById(id) {
    const [[run]] = await pool.query(
      'SELECT m.*, u.real_name AS created_by_name FROM mrp_runs m LEFT JOIN users u ON u.id = m.created_by WHERE m.id = ? AND m.deleted_at IS NULL', [id]
    );
    if (!run) return null;

    const [results] = await pool.query(
      `SELECT * FROM mrp_results WHERE run_id = ? ORDER BY material_code, required_date`, [id]
    );
    run.results = results;

    // 统计
    run.summary = {
      total: results.length,
      purchase_suggestions: results.filter(r => r.suggestion_type === 'purchase').length,
      production_suggestions: results.filter(r => r.suggestion_type === 'production').length,
      confirmed: results.filter(r => r.suggestion_status === 'confirmed').length,
      converted: results.filter(r => r.suggestion_status === 'converted').length,
    };

    return run;
  }

  /** 创建并执行 MRP 运算 */
  async createAndRun(data, userId) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const runCode = await CodeGeneratorService.nextCode('mrp_run', conn);

      const [result] = await conn.query(
        `INSERT INTO mrp_runs (run_code, name, status, plan_start_date, plan_end_date, parameters, created_by, started_at)
         VALUES (?, ?, 'running', ?, ?, ?, ?, NOW())`,
        [runCode, data.name || `MRP运算 ${runCode}`, data.plan_start_date, data.plan_end_date,
         data.parameters ? JSON.stringify(data.parameters) : null, userId]
      );
      const runId = result.insertId;

      await conn.commit();

      // 异步执行运算（不阻塞请求）
      this._executeRun(runId, data).catch(err => {
        logger.error(`MRP运算失败 [${runId}]:`, err);
      });

      return { id: runId, run_code: runCode, status: 'running', message: 'MRP运算已启动' };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** 执行 MRP 运算核心逻辑 */
  async _executeRun(runId, params) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const startDate = params.plan_start_date;
      const endDate = params.plan_end_date;

      // ==================== 1. 收集独立需求 ====================
      // 未完成的销售订单明细
      // sales_order_items 无 delivered_quantity 列，通过销售出库明细汇总已发数量
      const [salesDemands] = await conn.query(
        `SELECT soi.material_id, m.code AS material_code, m.name AS material_name,
                soi.quantity - COALESCE(shipped.shipped_qty, 0) AS required_qty,
                COALESCE(so.delivery_date, ?) AS required_date,
                so.id AS source_id, 'sales_order' AS source_type
         FROM sales_order_items soi
         JOIN sales_orders so ON so.id = soi.order_id
         JOIN materials m ON m.id = soi.material_id
         LEFT JOIN (
           SELECT sod.product_id, COALESCE(sod.source_order_id, sob.order_id) AS order_id, SUM(sod.quantity) AS shipped_qty
           FROM sales_outbound_items sod
           JOIN sales_outbound sob ON sob.id = sod.outbound_id
           WHERE sob.status != 'cancelled'
           GROUP BY sod.product_id, COALESCE(sod.source_order_id, sob.order_id)
         ) shipped ON shipped.product_id = soi.material_id AND shipped.order_id = soi.order_id
         WHERE so.status IN ('confirmed','processing','in_production','partial_shipped')
           AND so.deleted_at IS NULL
           AND soi.quantity > COALESCE(shipped.shipped_qty, 0)`,
        [endDate]
      );

      // 未完成的生产计划
      // production_plans 表实际列: product_id, quantity, pushed_quantity, start_date, end_date
      const [prodDemands] = await conn.query(
        `SELECT pp.product_id AS material_id, m.code AS material_code, m.name AS material_name,
                pp.quantity - COALESCE(pp.pushed_quantity, 0) AS required_qty,
                COALESCE(pp.end_date, ?) AS required_date,
                pp.id AS source_id, 'production_plan' AS source_type
         FROM production_plans pp
         JOIN materials m ON m.id = pp.product_id
         WHERE pp.status IN ('draft','preparing','in_progress')
           AND pp.deleted_at IS NULL
           AND pp.quantity > COALESCE(pp.pushed_quantity, 0)`,
        [endDate]
      );

      const allDemands = [...salesDemands, ...prodDemands];

      // ==================== 2. 按物料汇总需求 ====================
      const materialDemands = {};
      for (const d of allDemands) {
        if (!d.material_id) continue;
        if (!materialDemands[d.material_id]) {
          materialDemands[d.material_id] = {
            material_id: d.material_id,
            material_code: d.material_code,
            material_name: d.material_name,
            demands: [],
            total_gross: 0,
          };
        }
        materialDemands[d.material_id].demands.push(d);
        materialDemands[d.material_id].total_gross += Number(d.required_qty || 0);
      }

      // ==================== 3. BOM 展开计算相关需求（批量查询消除 N+1） ====================
      const parentMatIds = Object.keys(materialDemands).map(Number);
      if (parentMatIds.length > 0) {
        const bomPh = parentMatIds.map(() => '?').join(',');
        const [allBomItems] = await conn.query(
          `SELECT bm.product_id AS parent_material_id,
                  bd.material_id AS child_material_id, bd.quantity AS unit_qty,
                  m.code AS material_code, m.name AS material_name
           FROM bom_details bd
           JOIN materials m ON m.id = bd.material_id
           JOIN bom_masters bm ON bm.id = bd.bom_id
           WHERE bm.product_id IN (${bomPh}) AND bm.status = 1 AND bm.approved_by IS NOT NULL AND bm.deleted_at IS NULL`,
          parentMatIds
        );
        // 按父物料分组
        const bomMap = new Map();
        for (const bi of allBomItems) {
          if (!bomMap.has(bi.parent_material_id)) bomMap.set(bi.parent_material_id, []);
          bomMap.get(bi.parent_material_id).push(bi);
        }
        for (const matId of parentMatIds) {
          const bomItems = bomMap.get(matId) || [];
          const parentGross = materialDemands[matId].total_gross;
          for (const bi of bomItems) {
            const childDemand = parentGross * Number(bi.unit_qty || 1);
            if (!materialDemands[bi.child_material_id]) {
              materialDemands[bi.child_material_id] = {
                material_id: bi.child_material_id,
                material_code: bi.material_code,
                material_name: bi.material_name,
                demands: [],
                total_gross: 0,
              };
            }
            materialDemands[bi.child_material_id].total_gross += childDemand;
            materialDemands[bi.child_material_id].demands.push({
              required_qty: childDemand,
              required_date: endDate,
              source_type: 'bom_explosion',
              source_id: matId,
              requirement_type: 'dependent',
            });
          }
        }
      }

      // ==================== 4. 计算净需求并生成建议（批量查询消除 N+1） ====================
      let totalSuggestions = 0;
      const allMatIds = Object.keys(materialDemands).map(Number);

      if (allMatIds.length > 0) {
        const ph = allMatIds.map(() => '?').join(',');

        // 批量获取现有库存
        const [stockRows] = await conn.query(
          `SELECT material_id, COALESCE(SUM(quantity), 0) AS on_hand
           FROM inventory_ledger WHERE material_id IN (${ph}) GROUP BY material_id`,
          allMatIds
        );
        const stockMap = new Map(stockRows.map(r => [r.material_id, Number(r.on_hand)]));

        // 批量获取安全库存和分类
        const [matInfoRows] = await conn.query(
          `SELECT m.id, m.safety_stock, mc.name AS category_name
           FROM materials m LEFT JOIN categories mc ON mc.id = m.category_id
           WHERE m.id IN (${ph})`,
          allMatIds
        );
        const matInfoMap = new Map(matInfoRows.map(r => [r.id, r]));

        // 批量获取在途采购
        const [scheduledRows] = await conn.query(
          `SELECT poi.material_id,
                  COALESCE(SUM(poi.quantity - COALESCE(rcv.received_qty, 0)), 0) AS scheduled
           FROM purchase_order_items poi
           JOIN purchase_orders po ON po.id = poi.order_id
           LEFT JOIN (
             SELECT pri.order_item_id, SUM(pri.received_quantity) AS received_qty
             FROM purchase_receipt_items pri
             JOIN purchase_receipts pr ON pr.id = pri.receipt_id
             WHERE pr.status != 'cancelled'
             GROUP BY pri.order_item_id
           ) rcv ON rcv.order_item_id = poi.id
           WHERE poi.material_id IN (${ph}) AND po.status IN ('confirmed','partial_received','approved')
             AND po.deleted_at IS NULL
             AND poi.quantity > COALESCE(rcv.received_qty, 0)
           GROUP BY poi.material_id`,
          allMatIds
        );
        const scheduledMap = new Map(scheduledRows.map(r => [r.material_id, Number(r.scheduled)]));

        // 批量获取待处理采购申请
        const [pendingReqRows] = await conn.query(
          `SELECT pri.material_id, COALESCE(SUM(pri.quantity), 0) AS pending_qty
           FROM purchase_requisition_items pri
           JOIN purchase_requisitions pr ON pr.id = pri.requisition_id
           WHERE pri.material_id IN (${ph}) AND pr.status IN ('draft','pending','approved')
           GROUP BY pri.material_id`,
          allMatIds
        );
        const pendingReqMap = new Map(pendingReqRows.map(r => [r.material_id, Number(r.pending_qty)]));

        // 批量获取待处理生产计划
        const [pendingProdRows] = await conn.query(
          `SELECT pp.product_id AS material_id,
                  COALESCE(SUM(pp.quantity - COALESCE(pp.pushed_quantity, 0)), 0) AS pending_qty
           FROM production_plans pp
           WHERE pp.product_id IN (${ph}) AND pp.status IN ('draft','preparing','in_progress')
             AND pp.deleted_at IS NULL AND pp.quantity > COALESCE(pp.pushed_quantity, 0)
           GROUP BY pp.product_id`,
          allMatIds
        );
        const pendingProdMap = new Map(pendingProdRows.map(r => [r.material_id, Number(r.pending_qty)]));

        // 在内存中计算净需求并插入建议
        for (const mat of Object.values(materialDemands)) {
          const onHand = stockMap.get(mat.material_id) || 0;
          const matInfo = matInfoMap.get(mat.material_id) || {};
          const safetyStock = Number(matInfo.safety_stock || 0);
          const scheduledReceipts = scheduledMap.get(mat.material_id) || 0;
          const pendingRequisitions = pendingReqMap.get(mat.material_id) || 0;
          const pendingProduction = pendingProdMap.get(mat.material_id) || 0;
          const grossRequirement = mat.total_gross;

          // 净需求 = 毛需求 - 现有库存 - 在途采购 - 已有采购申请 - 已有生产计划 + 安全库存
          const netRequirement = grossRequirement - onHand - scheduledReceipts - pendingRequisitions - pendingProduction + safetyStock;

          if (netRequirement <= 0) continue;

          const categoryName = (matInfo.category_name || '').toLowerCase();
          const isManufactured = ['成品', '半成品', '产成品', 'finished', 'semi'].some(k => categoryName.includes(k));
          const suggestionType = isManufactured ? 'production' : 'purchase';

          const leadTimeDays = 7;
          const latestDemand = mat.demands.reduce((latest, d) => {
            return d.required_date > latest ? d.required_date : latest;
          }, startDate);

          await conn.query(
            `INSERT INTO mrp_results (run_id, material_id, material_code, material_name,
             requirement_type, source_type, source_id, required_date,
             gross_requirement, on_hand_stock, safety_stock, scheduled_receipts,
             net_requirement, planned_order_quantity, planned_order_date, suggestion_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_SUB(?, INTERVAL ? DAY), ?)`,
            [runId, mat.material_id, mat.material_code, mat.material_name,
             mat.demands[0]?.requirement_type || 'independent',
             mat.demands[0]?.source_type || null, mat.demands[0]?.source_id || null,
             latestDemand,
             grossRequirement, onHand, safetyStock, scheduledReceipts,
             netRequirement, netRequirement, latestDemand, leadTimeDays,
             suggestionType]
          );
          totalSuggestions++;
        }
      }

      // ==================== 5. 更新运算状态 ====================
      await conn.query(
        `UPDATE mrp_runs SET status = 'completed', total_materials = ?, total_suggestions = ?, completed_at = NOW()
         WHERE id = ?`,
        [Object.keys(materialDemands).length, totalSuggestions, runId]
      );

      await conn.commit();
      logger.info(`MRP运算完成 [${runId}]: ${Object.keys(materialDemands).length}种物料, ${totalSuggestions}条建议`);
    } catch (err) {
      await conn.rollback();
      // 单独更新运算状态为失败（不在事务中）
      await pool.query(
        "UPDATE mrp_runs SET status = 'failed', error_message = ?, completed_at = NOW() WHERE id = ?",
        [err.message, runId]
      );
      throw err;
    } finally {
      conn.release();
    }
  }

  /** 确认/忽略建议 */
  async updateSuggestionStatus(resultId, status) {
    await pool.query(
      'UPDATE mrp_results SET suggestion_status = ? WHERE id = ?',
      [status, resultId]
    );
  }

  /** 批量确认建议 */
  async batchConfirm(resultIds) {
    if (!resultIds || resultIds.length === 0) return;
    await pool.query(
      "UPDATE mrp_results SET suggestion_status = 'confirmed' WHERE id IN (?) AND suggestion_status = 'pending'",
      [resultIds]
    );
  }

  /** 将已确认的建议转化为采购请购单/生产计划 */
  async convertSuggestions(resultIds) {
    if (!resultIds || resultIds.length === 0) throw new Error('请选择要转化的建议');

    const [rows] = await pool.query(
      "SELECT * FROM mrp_results WHERE id IN (?) AND suggestion_status = 'confirmed'",
      [resultIds]
    );
    if (!rows.length) throw new Error('没有可转化的已确认建议');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const purchaseItems = rows.filter(r => r.suggestion_type === 'purchase');
      const productionItems = rows.filter(r => r.suggestion_type === 'production');
      const result = { purchaseRequisitionId: null, productionPlanIds: [] };

      // ========== 采购建议 → 采购请购单 ==========
      if (purchaseItems.length > 0) {
        const { CodeGenerators } = require('../../utils/codeGenerator');
        const reqNo = await CodeGenerators.generatePurchaseRequisitionCode(conn);
        const [reqResult] = await conn.query(
          `INSERT INTO purchase_requisitions (requisition_number, requester, request_date, status, remarks, created_at)
           VALUES (?, ?, CURDATE(), 'draft', ?, NOW())`,
          [reqNo, `MRP系统`, `由MRP运算建议自动转化, 共${purchaseItems.length}项物料`]
        );
        const reqId = reqResult.insertId;
        result.purchaseRequisitionId = reqId;

        for (const item of purchaseItems) {
          await conn.query(
            `INSERT INTO purchase_requisition_items (requisition_id, material_id, material_code, material_name, quantity)
             VALUES (?, ?, ?, ?, ?)`,
            [reqId, item.material_id, item.material_code || '', item.material_name || '', item.planned_order_quantity]
          );
        }
        // 回写转化信息
        for (const item of purchaseItems) {
          await conn.query(
            "UPDATE mrp_results SET converted_to_type = 'purchase_requisition', converted_to_id = ? WHERE id = ?",
            [reqId, item.id]
          );
        }
        logger.info(`MRP转化: 生成采购请购单 ${reqNo}, ${purchaseItems.length}项`);
      }

      // ========== 生产建议 → 生产计划 ==========
      for (const item of productionItems) {
        const planCode = await CodeGeneratorService.nextCode('production_plan', conn);
        const startDate = item.planned_order_date || item.required_date;
        const endDate = item.required_date;
        const [planResult] = await conn.query(
          `INSERT INTO production_plans (code, name, product_id, quantity, status, start_date, end_date)
           VALUES (?, ?, ?, ?, 'draft', ?, ?)`,
          [planCode, `MRP自动-${item.material_name || item.material_code}`,
           item.material_id, item.planned_order_quantity, startDate, endDate]
        );
        const planId = planResult.insertId;
        result.productionPlanIds.push(planId);
        // 回写转化信息
        await conn.query(
          "UPDATE mrp_results SET converted_to_type = 'production_plan', converted_to_id = ? WHERE id = ?",
          [planId, item.id]
        );
        logger.info(`MRP转化: 生成生产计划 ${planCode}`);
      }

      // 更新建议状态为已转化
      await conn.query(
        "UPDATE mrp_results SET suggestion_status = 'converted' WHERE id IN (?)",
        [resultIds]
      );

      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}

module.exports = new MRPService();
