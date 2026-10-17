/**
 * MaterialReadinessService.js
 * @description 物料齐套检查 — 检查生产任务所需 BOM 物料库存是否充足
 */

const { pool } = require('../../config/db');
const Precision = require('../../utils/precision');

class MaterialReadinessService {
  /**
   * 检查指定生产任务的物料齐套情况
   * @param {number} taskId - 生产任务ID
   * @returns {Object} { ready, totalItems, readyItems, shortageItems, details }
   */
  static async checkByTask(taskId, stockBudget = null) {
    // 1. 获取任务信息
    const [tasks] = await pool.query(
      'SELECT id, code, product_id, quantity FROM production_tasks WHERE id = ? AND deleted_at IS NULL',
      [taskId]
    );
    if (tasks.length === 0) {
      throw new Error('生产任务不存在');
    }
    const task = tasks[0];

    // 2. 获取产品的 BOM
    const [bomMasters] = await pool.query(
      'SELECT id FROM bom_masters WHERE product_id = ? ORDER BY id DESC LIMIT 1',
      [task.product_id]
    );
    if (bomMasters.length === 0) {
      // 无 BOM 不能判定齐套：避免假齐套放行发料/开工
      return {
        ready: false,
        totalItems: 0,
        readyItems: 0,
        shortageItems: 0,
        details: [],
        taskCode: task.code,
        taskQuantity: task.quantity,
        message: '该产品无 BOM 定义，无法判定齐套',
      };
    }

    // 3. 获取 BOM 明细
    const [bomDetails] = await pool.query(
      `SELECT bd.id AS bom_detail_id, bd.material_id, bd.quantity AS unit_quantity,
              m.code AS material_code, m.name AS material_name,
              u.name AS unit
       FROM bom_details bd
       LEFT JOIN materials m ON bd.material_id = m.id
       LEFT JOIN units u ON m.unit_id = u.id
       WHERE bd.bom_id = ? ORDER BY bd.id`,
      [bomMasters[0].id]
    );

    if (bomDetails.length === 0) {
      return {
        ready: false,
        totalItems: 0,
        readyItems: 0,
        shortageItems: 0,
        details: [],
        taskCode: task.code,
        taskQuantity: task.quantity,
        message: 'BOM 无物料明细，无法判定齐套',
      };
    }

    // 4. 计算每种物料的需求量（BOM 单位用量 × 任务数量）
    const requirements = new Map();
    for (const item of bomDetails) {
      const key = String(item.material_id);
      const existing = requirements.get(key);
      if (existing) {
        existing.unit_quantity = Precision.add(existing.unit_quantity, item.unit_quantity);
        existing.bom_detail_ids.push(item.bom_detail_id);
      } else {
        requirements.set(key, {
          ...item,
          unit_quantity: Number(item.unit_quantity),
          bom_detail_ids: [item.bom_detail_id],
        });
      }
    }
    const materialIds = [...requirements.values()].map((item) => item.material_id);
    const [stockRows] = await pool.query(
      `SELECT material_id, SUM(quantity) AS available_qty
       FROM inventory_stock_balances
       WHERE material_id IN (${materialIds.map(() => '?').join(',')})
       GROUP BY material_id`,
      materialIds
    );

    const stockMap = {};
    stockRows.forEach((s) => {
      stockMap[s.material_id] = Math.max(0, Number(s.available_qty) || 0);
    });

    // 5. 汇总结果
    const details = [...requirements.values()].map((item) => {
      const requiredQty = Precision.mul(item.unit_quantity, task.quantity);
      const key = String(item.material_id);
      if (stockBudget && !stockBudget.has(key)) stockBudget.set(key, stockMap[key] || 0);
      const availableQty = stockBudget ? stockBudget.get(key) : stockMap[key] || 0;
      const shortageQty = Math.max(0, Precision.sub(requiredQty, availableQty));
      if (stockBudget) stockBudget.set(key, Math.max(0, Precision.sub(availableQty, requiredQty)));
      return {
        bom_detail_id: item.bom_detail_id,
        bom_detail_ids: item.bom_detail_ids,
        material_id: item.material_id,
        material_code: item.material_code,
        material_name: item.material_name,
        unit: item.unit,
        unit_quantity: Number(item.unit_quantity),
        required_qty: requiredQty,
        available_qty: availableQty,
        shortage_qty: shortageQty,
        is_ready: shortageQty === 0,
      };
    });

    const readyItems = details.filter((d) => d.is_ready).length;
    const shortageItems = details.length - readyItems;

    return {
      ready: shortageItems === 0,
      totalItems: details.length,
      readyItems,
      shortageItems,
      taskCode: task.code,
      taskQuantity: task.quantity,
      details,
    };
  }

  /**
   * 批量检查多个任务的齐套情况
   * @param {number[]} taskIds
   */
  static async checkBatch(taskIds) {
    const results = [];
    // Read-only allocation by input priority; this is a projection, not a stock reservation.
    let stockBudget = new Map();
    const seenTasks = new Set();
    for (const taskId of taskIds) {
      if (seenTasks.has(String(taskId))) continue;
      seenTasks.add(String(taskId));
      try {
        const taskBudget = new Map(stockBudget);
        const result = await this.checkByTask(taskId, taskBudget);
        stockBudget = taskBudget;
        results.push({ taskId, ...result });
      } catch {
        results.push({ taskId, ready: false, error: '生产任务齐套检查失败，请稍后重试' });
      }
    }
    return results;
  }
}

module.exports = MaterialReadinessService;
