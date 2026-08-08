/**
 * CostAccountingService — variance methods (mixin)
 * Attached via Object.assign so `this` resolves to CostAccountingService.
 * @module services/business/costAccounting/varianceMethods
 */

const {
  logger,
  db,
  BusinessError,
  globalConfigManager,
  businessConfig,
  currentDateString,
  toLocalDateString,
  resolveActorUserId,
  GLService,
  InventoryService,
  Precision,
  financeConfig,
  DOCUMENT_TYPES,
} = require('./runtime');

module.exports = {
  /**
     * 成本差异分析
     * @param {number} productionOrderId 生产订单ID
     * @returns {Object} 差异分析结果
     */
    async analyzeCostVariance(productionOrderId) {
      try {
        // 获取生产任务信息
        const [orderInfo] = await db.pool.execute('SELECT id, code, plan_id, product_id, quantity, completed_quantity, start_date, expected_end_date, actual_start_time, actual_end_date, manager, status, remarks, created_at, updated_at, batch_number, actual_cost, material_cost, labor_cost, overhead_cost, pause_reason, pause_time, completed_at, cost_center_id, progress, deleted_at FROM production_tasks WHERE id = ? AND deleted_at IS NULL', [
          productionOrderId,
        ]);
  
        if (orderInfo.length === 0) {
          throw new Error('生产任务不存在');
        }
  
        const order = orderInfo[0];
  
        // 计算标准成本
        const standardCost = await this.calculateStandardCost(order.product_id, order.quantity);
  
        // 获取实际成本
        const [actualCostRecord] = await db.pool.execute(
          'SELECT id, production_order_id, product_id, quantity, material_cost, labor_cost, overhead_cost, total_cost, calculated_at, calculated_by FROM actual_costs WHERE production_order_id = ?',
          [productionOrderId]
        );
  
        let actualCost;
        if (actualCostRecord.length === 0) {
          // 如果没有实际成本记录，先计算
          actualCost = await this.calculateActualCost(productionOrderId);
        } else {
          const record = actualCostRecord[0];
          actualCost = {
            actualCost: {
              materialCost: record.material_cost,
              laborCost: record.labor_cost,
              overheadCost: record.overhead_cost,
              totalCost: record.total_cost,
              unitCost: record.total_cost / record.quantity,
            },
          };
        }
  
        // 计算差异
        const materialVariance =
          actualCost.actualCost.materialCost - standardCost.standardCost.materialCost;
        const laborVariance = actualCost.actualCost.laborCost - standardCost.standardCost.laborCost;
        const overheadVariance =
          actualCost.actualCost.overheadCost - standardCost.standardCost.overheadCost;
        const totalVariance = actualCost.actualCost.totalCost - standardCost.standardCost.totalCost;
  
        // 计算差异率
        const materialVarianceRate =
          standardCost.standardCost.materialCost > 0
            ? (materialVariance / standardCost.standardCost.materialCost) * 100
            : 0;
        const laborVarianceRate =
          standardCost.standardCost.laborCost > 0
            ? (laborVariance / standardCost.standardCost.laborCost) * 100
            : 0;
        const overheadVarianceRate =
          standardCost.standardCost.overheadCost > 0
            ? (overheadVariance / standardCost.standardCost.overheadCost) * 100
            : 0;
        const totalVarianceRate =
          standardCost.standardCost.totalCost > 0
            ? (totalVariance / standardCost.standardCost.totalCost) * 100
            : 0;
  
        return {
          productionOrderId,
          productId: order.product_id,
          quantity: order.quantity,
          standardCost: standardCost.standardCost,
          actualCost: actualCost.actualCost,
          variance: {
            material: {
              amount: materialVariance,
              rate: materialVarianceRate,
              favorable: materialVariance <= 0,
            },
            labor: {
              amount: laborVariance,
              rate: laborVarianceRate,
              favorable: laborVariance <= 0,
            },
            overhead: {
              amount: overheadVariance,
              rate: overheadVarianceRate,
              favorable: overheadVariance <= 0,
            },
            total: {
              amount: totalVariance,
              rate: totalVarianceRate,
              favorable: totalVariance <= 0,
            },
          },
        };
      } catch (error) {
        logger.error('成本差异分析失败:', error);
        throw error;
      }
    },

  /**
     * 计算效率差异（标准工时 vs 实际工时）
     * @param {number} taskId 生产任务ID
     * @returns {Promise<Object>} 效率差异分析结果
     */
    async calculateEfficiencyVariance(taskId) {
      const connection = await db.pool.getConnection();
      try {
        // 获取任务的工序信息
        const [processes] = await connection.execute(
          `
          SELECT
            pp.id,
            pp.process_name,
            pp.standard_hours,
            TIMESTAMPDIFF(SECOND, pp.actual_start_time, pp.actual_end_time) / 3600 as actual_hours,
            pp.efficiency_rate,
            pp.status
          FROM production_processes pp
          WHERE pp.task_id = ?
          ORDER BY pp.id
        `,
          [taskId]
        );
  
        if (processes.length === 0) {
          return {
            taskId,
            hasData: false,
            message: '未找到工序记录',
          };
        }
  
        // 计算汇总数据
        let totalStandardHours = 0;
        let totalActualHours = 0;
        const processDetails = [];
  
        for (const proc of processes) {
          const standardHours = parseFloat(proc.standard_hours) || 0;
          const actualHours = parseFloat(proc.actual_hours) || 0;
          const hoursVariance = actualHours - standardHours;
          const efficiencyRate = standardHours > 0 ? actualHours / standardHours : 0;
  
          totalStandardHours += standardHours;
          totalActualHours += actualHours;
  
          processDetails.push({
            processId: proc.id,
            processName: proc.process_name,
            standardHours,
            actualHours,
            hoursVariance,
            efficiencyRate: Math.round(efficiencyRate * 100) / 100,
            favorable: hoursVariance <= 0,
            status: proc.status,
          });
  
          // 更新工序的效率率
          if (standardHours > 0) {
            await connection.execute(
              'UPDATE production_processes SET efficiency_rate = ? WHERE id = ?',
              [Math.round(efficiencyRate * 100) / 100, proc.id]
            );
          }
        }
  
        // 从全局配置统一读取人工费率，严禁硬编码
        const costConfig = globalConfigManager.getConfig().cost;
        const laborRate = costConfig.laborRate;
  
        // 计算效率差异金额
        const hoursVariance = totalActualHours - totalStandardHours;
        const efficiencyVarianceAmount = hoursVariance * laborRate;
        const overallEfficiencyRate =
          totalStandardHours > 0 ? totalActualHours / totalStandardHours : 0;
  
        return {
          taskId,
          hasData: true,
          summary: {
            totalStandardHours: Math.round(totalStandardHours * 100) / 100,
            totalActualHours: Math.round(totalActualHours * 100) / 100,
            hoursVariance: Math.round(hoursVariance * 100) / 100,
            efficiencyRate: Math.round(overallEfficiencyRate * 100) / 100,
            efficiencyVarianceAmount: Math.round(efficiencyVarianceAmount * 100) / 100,
            laborRate,
            favorable: hoursVariance <= 0,
          },
          processDetails,
        };
      } catch (error) {
        logger.error('[CostAccounting] 效率差异分析失败:', error);
        throw error;
      } finally {
        connection.release();
      }
    },

  /**
     * 按产品分摊成本差异
     * 差异分摊率 = 产品产量 / 总产量
     *
     * @param {number} periodId 会计期间ID
     * @returns {Promise<Object>} 分摊结果
     */
    async allocateVariance(periodId) {
      const connection = await db.pool.getConnection();
      try {
        await connection.beginTransaction();
        await this.assertOpenPeriod(connection, periodId);
  
        // 获取本期完工产品及其成本
        const [completedProducts] = await connection.execute(
          `
          SELECT
            pt.product_id,
            m.name as product_name,
            SUM(pt.quantity) as total_quantity,
            SUM(ac.material_cost) as actual_material,
            SUM(ac.labor_cost) as actual_labor,
            SUM(ac.overhead_cost) as actual_overhead,
            SUM(ac.total_cost) as actual_total
          FROM production_tasks pt
          JOIN actual_costs ac ON pt.id = ac.production_order_id
          JOIN materials m ON pt.product_id = m.id
          WHERE pt.status = 'completed'
            AND EXISTS (
              SELECT 1 FROM gl_periods gp
              WHERE gp.id = ?
              AND pt.completed_at BETWEEN gp.start_date AND gp.end_date
            )
          GROUP BY pt.product_id, m.name
        `,
          [periodId]
        );
  
        if (completedProducts.length === 0) {
          logger.info(`[Variance] 期间 ${periodId} 无完工产品，跳过差异分摊`);
          await connection.commit();
          return { skipped: true, reason: '无完工产品' };
        }
  
        // 计算总产量
        const totalQuantity = completedProducts.reduce(
          (sum, p) => Precision.add(sum, p.total_quantity || 0),
          0
        );
  
        // 计算各产品的标准成本
        const allocationDetails = [];
        let totalMaterialVariance = 0;
        let totalLaborVariance = 0;
        let totalOverheadVariance = 0;
  
        for (const product of completedProducts) {
          // 获取标准成本
          const stdCost = await this.calculateStandardCost(
            product.product_id,
            product.total_quantity
          );
  
          // 计算差异
          const materialVariance = Precision.sub(
            product.actual_material,
            stdCost.standardCost.materialCost
          );
          const laborVariance = Precision.sub(product.actual_labor, stdCost.standardCost.laborCost);
          const overheadVariance = Precision.sub(
            product.actual_overhead,
            stdCost.standardCost.overheadCost
          );
          const totalVariance = Precision.sumRound2(
            materialVariance,
            laborVariance,
            overheadVariance
          );
  
          // 计算分摊比例
          const allocationRate =
            totalQuantity > 0
              ? Precision.round(Precision.div(product.total_quantity, totalQuantity), 4)
              : 0;
  
          totalMaterialVariance = Precision.add(totalMaterialVariance, materialVariance);
          totalLaborVariance = Precision.add(totalLaborVariance, laborVariance);
          totalOverheadVariance = Precision.add(totalOverheadVariance, overheadVariance);
  
          allocationDetails.push({
            productId: product.product_id,
            productName: product.product_name,
            quantity: product.total_quantity,
            allocationRate,
            standardCost: stdCost.standardCost,
            actualCost: {
              materialCost: product.actual_material,
              laborCost: product.actual_labor,
              overheadCost: product.actual_overhead,
              totalCost: product.actual_total,
            },
            variance: {
              material: materialVariance,
              labor: laborVariance,
              overhead: overheadVariance,
              total: totalVariance,
            },
          });
        }
  
        const totalVarianceAmount = Precision.sumRound2(
          totalMaterialVariance,
          totalLaborVariance,
          totalOverheadVariance
        );
  
        await connection.commit();
  
        logger.info(
          `[Variance] 期间 ${periodId} 差异分摊完成: 产品数=${allocationDetails.length}, 总差异=${totalVarianceAmount}`
        );
  
        return {
          periodId,
          productCount: allocationDetails.length,
          totalQuantity,
          summary: {
            materialVariance: totalMaterialVariance,
            laborVariance: totalLaborVariance,
            overheadVariance: totalOverheadVariance,
            totalVariance: totalVarianceAmount,
          },
          details: allocationDetails,
        };
      } catch (error) {
        await connection.rollback();
        logger.error('[Variance] 成本差异分摊失败:', error);
        throw error;
      } finally {
        connection.release();
      }
    },
};
