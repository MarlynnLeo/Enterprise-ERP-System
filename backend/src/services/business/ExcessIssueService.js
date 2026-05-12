const db = require('../../config/db');
const logger = require('../../utils/logger');

/**
 * 超额领料检查服务
 */
class ExcessIssueService {
  /**
   * 检查是否超额领料
   * @param {number} productionTaskId - 生产任务ID
   * @param {number} materialId - 物料ID
   * @param {number} requestQty - 本次申请数量
   * @returns {Promise<Object>} - { isExcess, planQty, issuedQty, excessQty, message }
   */
  async checkExcessIssue(productionTaskId, materialId, requestQty) {
    try {
      requestQty = parseFloat(requestQty) || 0;

      // 1. 获取生产任务信息
      const { rows: tasks } = await db.query(
        'SELECT product_id, quantity FROM production_tasks WHERE id = ?',
        [productionTaskId]
      );

      if (tasks.length === 0) {
        return { isExcess: false, message: '找不到生产任务，跳过检查' };
      }

      const task = tasks[0];
      const taskQuantity = parseFloat(task.quantity || 0);
      const productId = task.product_id;

      // 2. 获取BOM定额
      // 查找该物料在BOM中的用量 (可能有多个BOM版本，这里取最新审核通过的)
      // 先找到BOM ID
      const { rows: boms } = await db.query(
        `SELECT id FROM bom_masters
                 WHERE product_id = ? AND approved_by IS NOT NULL
                 ORDER BY created_at DESC LIMIT 1`,
        [productId]
      );

      let unitUsage = 0;
      if (boms.length > 0) {
        const bomId = boms[0].id;
        const { rows: bomDetails } = await db.query(
          `SELECT quantity FROM bom_details
                     WHERE bom_id = ? AND material_id = ?`,
          [bomId, materialId]
        );
        if (bomDetails.length > 0) {
          unitUsage = parseFloat(bomDetails[0].quantity || 0);
        }
      }

      // 计划总用量
      const planQty = taskQuantity * unitUsage;

      // 3. 获取累计已发数量
      // 通过 inventory_outbound 和 items 关联查询
      // 仅统计 'completed' 或 'confirmed' 状态的出库单 (视业务规则而定，这里包括confirmed以免并发超发)
      // 以及排除已取消的
      const { rows: issuedResult } = await db.query(
        `SELECT SUM(ioi.actual_quantity) as total
                 FROM inventory_outbound io
                 JOIN inventory_outbound_items ioi ON io.id = ioi.outbound_id
                 WHERE io.production_task_id = ?
                   AND ioi.material_id = ?
                   AND io.status IN ('completed', 'confirmed', 'partial_completed')`,
        [productionTaskId, materialId]
      );

      let issuedQty = 0;
      if (issuedResult.length > 0 && issuedResult[0].total) {
        issuedQty = parseFloat(issuedResult[0].total);
      }

      // 4. 计算差异
      const totalProvided = issuedQty + requestQty;
      const excessQty = totalProvided - planQty;
      const remainingQty = Math.max(0, planQty - issuedQty);

      // 如果 BOM 中没有该物料 (unitUsage === 0)，则全部视为超额 (或者是非计划领料)
      // 这里我们视为超额，除非 planQty > 0
      if (planQty === 0 && requestQty > 0) {
        return {
          isExcess: true,
          planQty: 0,
          issuedQty: issuedQty,
          remainingQty: 0,
          excessQty: requestQty,
          message: `非BOM计划物料，本次申领 ${requestQty} 将全部视为超额`,
        };
      }

      if (excessQty > 0) {
        return {
          isExcess: true,
          planQty: parseFloat(planQty.toFixed(4)),
          issuedQty: parseFloat(issuedQty.toFixed(4)),
          remainingQty: parseFloat(remainingQty.toFixed(4)),
          excessQty: parseFloat(excessQty.toFixed(4)),
          message: `计划 ${parseFloat(planQty.toFixed(2))}，已发 ${parseFloat(issuedQty.toFixed(2))}，本次 ${requestQty}，将超额 ${parseFloat(excessQty.toFixed(2))}`,
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
      logger.error('超额检查失败:', error);
      // 降级处理：如果不确定，也可以返回 false (放行)，或者 throw 阻断
      // 这里选择 throw，让上层决定是否忽略
      throw error;
    }
  }

  /**
   * 批量检查
   * @param {number} productionTaskId
   * @param {Array} items - [{ materialId, quantity }]
   */
  async checkBatchExcess(productionTaskId, items) {
    const results = [];
    for (const item of items) {
      const result = await this.checkExcessIssue(productionTaskId, item.materialId, item.quantity);
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
