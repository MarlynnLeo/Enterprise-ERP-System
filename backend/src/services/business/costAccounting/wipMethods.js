/**
 * CostAccountingService — wip methods (mixin)
 * Attached via Object.assign so `this` resolves to CostAccountingService.
 * @module services/business/costAccounting/wipMethods
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
     * 计算期末在制品(WIP)成本
     * @param {string} period - 会计期间 (YYYY-MM)
     * @returns {Object} WIP成本汇总
     */
    async calculatePeriodWIP(period) {
      const connection = await db.pool.getConnection();
      try {
        // 1. 获取该期间内尚未完工的任务，或者在该期间结束时尚未完工的历史任务
        // 逻辑：任务创建早于等于期间结束日，且 (未完工 OR 完工日期晚于期间结束日)
  
        const endDateStr = period
          ? this.parsePeriodRange(period).endDate
          : currentDateString();
  
        const [wipTasks] = await connection.execute(
          `
          SELECT pt.id, pt.code, pt.product_id, pt.quantity, pt.quantity AS planned_quantity,
                 pt.cost_center_id, pt.created_at,
                 m.name as product_name, m.code as product_code, m.material_type,
                 c.code as category_code, c.name as category_name,
                 pc.code as product_category_code, pc.name as product_category_name
          FROM production_tasks pt
          LEFT JOIN materials m ON pt.product_id = m.id
          LEFT JOIN categories c ON m.category_id = c.id
          LEFT JOIN categories pc ON m.product_category_id = pc.id
          WHERE pt.created_at <= ?
            AND (pt.status NOT IN ('completed', 'cancelled') OR pt.actual_end_date > ?)
        `,
          [`${endDateStr} 23:59:59`, endDateStr]
        );
  
        let totalWIPCost = 0;
        let semiFinishedWIPCost = 0;
        let finishedWIPCost = 0; // 成品
  
        const semiFinishedDetails = [];
        const finishedDetails = [];
  
        if (wipTasks.length > 0) {
          const taskIds = wipTasks.map((t) => t.id);
          const taskPh = taskIds.map(() => '?').join(',');
  
          const materialMovements = await this.collectTaskMaterialMovements(connection, taskIds, {
            cutoffDate: endDateStr,
          });
          const matCostMap = this.sumMaterialMovementsByTask(materialMovements);
  
          // 批量获取所有任务的工时数据（消除 N+1）
          const [allLaborData] = await connection.execute(
            `SELECT task_id, COALESCE(SUM(work_hours), 0) as total_hours
             FROM production_reports
             WHERE task_id IN (${taskPh}) AND report_time <= ?
             GROUP BY task_id`,
            [...taskIds, `${endDateStr} 23:59:59`]
          );
          const laborMap = new Map(
            allLaborData.map((r) => [r.task_id, parseFloat(r.total_hours) || 0])
          );
  
          // 获取成本配置（只查一次，移到循环外）
          const settings = await this.getCostSettings();
          const OverheadAllocationService = require('./OverheadAllocationService');
  
          for (const task of wipTasks) {
            const taskMaterialCost = matCostMap.get(task.id) || 0;
            const totalHours = laborMap.get(task.id) || 0;
            const taskLaborCost = Precision.round2(Precision.mul(totalHours, settings.laborRate));
  
            // 制造费用：统一通过分摊规则引擎计算
            const ohResult = await OverheadAllocationService.calculateOverhead({
              productId: task.product_id,
              costCenterId: task.cost_center_id,
              laborCost: taskLaborCost,
              laborHours: totalHours,
              quantity: task.planned_quantity,
              materialCost: taskMaterialCost,
              date: endDateStr,
            });
            const taskOverheadCost = Precision.round2(ohResult.overhead);
  
            const taskTotalCost = taskMaterialCost + taskLaborCost + taskOverheadCost;
  
            if (taskTotalCost > 0) {
              const detail = {
                taskId: task.id,
                taskCode: task.code,
                productCode: task.product_code,
                productName: task.product_name,
                materialCost: taskMaterialCost,
                laborCost: taskLaborCost,
                overheadCost: taskOverheadCost,
                totalCost: taskTotalCost,
              };
  
              const productClassification = this.classifyWIPProduct(task);
              detail.productClassification = productClassification.type;
              detail.classificationSource = productClassification.source;
  
              if (productClassification.isSemiFinished) {
                semiFinishedWIPCost += taskTotalCost;
                semiFinishedDetails.push(detail);
              } else {
                finishedWIPCost += taskTotalCost;
                finishedDetails.push(detail);
              }
  
              totalWIPCost += taskTotalCost;
            }
          }
        }
  
        return {
          period,
          endDate: endDateStr,
          totalWIPCost,
          taskCount: semiFinishedDetails.length + finishedDetails.length,
          summary: {
            semiFinished: {
              cost: semiFinishedWIPCost,
              count: semiFinishedDetails.length,
            },
            finished: {
              cost: finishedWIPCost,
              count: finishedDetails.length,
            },
          },
          details: {
            semiFinished: semiFinishedDetails,
            finished: finishedDetails,
          },
        };
      } catch (error) {
        logger.error('计算WIP成本失败:', error);
        throw error;
      } finally {
        connection.release();
      }
    },

  /**
     * 计算委外在途成本（已发料但未入库）
     * @param {string} period - 会计期间 (YYYY-MM)
     * @returns {Object} 委外在途成本汇总
     */
    async calculateOutsourcedWIP(period) {
      const connection = await db.pool.getConnection();
      try {
        const endDateStr = period
          ? this.parsePeriodRange(period).endDate
          : currentDateString();
  
        // 查询已确认但未完成的委外加工单
        const [wipOrders] = await connection.execute(
          `
          SELECT
            op.id,
            op.processing_no,
            op.supplier_id,
            COALESCE(op.supplier_name, s.name) as supplier_name,
            op.created_at,
            op.confirmed_at
          FROM outsourced_processings op
          LEFT JOIN suppliers s ON op.supplier_id = s.id
          WHERE op.status = 'confirmed'
          AND COALESCE(op.confirmed_at, op.created_at) <= ?
          ORDER BY op.supplier_id, op.processing_no
        `,
          [`${endDateStr} 23:59:59`]
        );
  
        let totalWIPCost = 0;
        const details = [];
        const supplierSummary = {};
  
        if (wipOrders.length > 0) {
          const orderIds = wipOrders.map((o) => o.id);
          const orderPh = orderIds.map(() => '?').join(',');
  
          // 批量获取所有订单的发料成本（消除 N+1）
          const [allMaterials] = await connection.execute(
            `SELECT opm.processing_id,
                    SUM(opm.quantity * COALESCE(m.cost_price, 0)) as material_cost
             FROM outsourced_processing_materials opm
             LEFT JOIN materials m ON opm.material_id = m.id
             WHERE opm.processing_id IN (${orderPh})
             GROUP BY opm.processing_id`,
            orderIds
          );
          const matCostMap = new Map(
            allMaterials.map((r) => [r.processing_id, parseFloat(r.material_cost) || 0])
          );
  
          // 批量获取所有订单的预计加工费（消除 N+1）
          const [allProducts] = await connection.execute(
            `SELECT processing_id, SUM(quantity * unit_price) as estimated_fee
             FROM outsourced_processing_products
             WHERE processing_id IN (${orderPh})
             GROUP BY processing_id`,
            orderIds
          );
          const feeMap = new Map(
            allProducts.map((r) => [r.processing_id, parseFloat(r.estimated_fee) || 0])
          );
  
          // 批量获取所有订单的已入库价值（消除 N+1）
          const [allReceipts] = await connection.execute(
            `SELECT opr.processing_id,
                    COALESCE(SUM(ori.actual_quantity * ori.unit_price), 0) as received_value
             FROM outsourced_processing_receipts opr
             LEFT JOIN outsourced_processing_receipt_items ori ON opr.id = ori.receipt_id
             WHERE opr.processing_id IN (${orderPh}) AND opr.status = 'confirmed'
             GROUP BY opr.processing_id`,
            orderIds
          );
          const receiptMap = new Map(
            allReceipts.map((r) => [r.processing_id, parseFloat(r.received_value) || 0])
          );
  
          for (const order of wipOrders) {
            const orderMaterialCost = matCostMap.get(order.id) || 0;
            const estimatedFee = feeMap.get(order.id) || 0;
            const receivedValue = receiptMap.get(order.id) || 0;
  
            // 在途成本 = 发料成本 - 已入库价值
            const wipCost = orderMaterialCost - receivedValue;
  
            if (wipCost > 0) {
              totalWIPCost += wipCost;
  
              details.push({
                processingId: order.id,
                processingNo: order.processing_no,
                supplierId: order.supplier_id,
                supplierName: order.supplier_name,
                materialCost: orderMaterialCost,
                receivedValue: receivedValue,
                wipCost: wipCost,
                estimatedFee: estimatedFee,
                confirmedDate: order.confirmed_at || order.created_at,
              });
  
              // 按供应商汇总
              if (!supplierSummary[order.supplier_id]) {
                supplierSummary[order.supplier_id] = {
                  supplierId: order.supplier_id,
                  supplierName: order.supplier_name,
                  orderCount: 0,
                  totalWIPCost: 0,
                };
              }
              supplierSummary[order.supplier_id].orderCount++;
              supplierSummary[order.supplier_id].totalWIPCost += wipCost;
            }
          }
        }
  
        return {
          period,
          endDate: endDateStr,
          totalWIPCost,
          orderCount: details.length,
          supplierSummary: Object.values(supplierSummary),
          details,
        };
      } catch (error) {
        logger.error('计算委外在途成本失败:', error);
        throw error;
      } finally {
        connection.release();
      }
    },

  /**
     * 计算期末在制品成本
     * 使用约当产量法：WIP成本 = 已投入成本 × 完工率权重
     *
     * @param {number} periodId 会计期间ID（可选，默认当前期间）
     * @param {string} snapshotDate 快照日期（可选，默认今天）
     * @returns {Promise<Object>} WIP 成本汇总
     */
    async calculateWIPCost(periodId = null, snapshotDate = null) {
      const connection = await db.pool.getConnection();
      try {
        await connection.beginTransaction();
  
        // 确定快照日期
        let snapDate = this.toDateOnly(snapshotDate || new Date());
  
        // 获取会计期间
        let actualPeriodId = periodId;
        if (!actualPeriodId) {
          actualPeriodId = await GLService.getPeriodIdByDate(snapDate);
        }
        await this.assertOpenPeriod(connection, actualPeriodId);
  
        const [periodRows] = await connection.execute(
          "SELECT DATE_FORMAT(start_date, '%Y-%m-%d') as start_date, DATE_FORMAT(end_date, '%Y-%m-%d') as end_date FROM gl_periods WHERE id = ?",
          [actualPeriodId]
        );
        if (periodRows.length === 0) {
          throw new Error('会计期间不存在');
        }
        const periodStartDate = this.toDateOnly(periodRows[0].start_date);
        const periodEndDate = this.toDateOnly(periodRows[0].end_date);
        if (periodId && !snapshotDate) {
          snapDate = periodEndDate;
        }
        if (snapDate < periodStartDate || snapDate > periodEndDate) {
          throw new Error(`WIP快照日期 ${snapDate} 不在会计期间 ${periodStartDate} 至 ${periodEndDate} 内`);
        }
  
        // 查询快照日仍在制的任务：快照日之前已创建，且未取消/未入库，或完工日期晚于快照日。
        const [wipTasks] = await connection.execute(
          `
          SELECT
            pt.id as task_id,
            pt.code as task_code,
            pt.product_id,
            pt.cost_center_id,
            m.name as product_name,
            pt.quantity as planned_quantity,
            pt.completed_quantity,
            pt.status,
            pt.created_at
          FROM production_tasks pt
          LEFT JOIN materials m ON pt.product_id = m.id
          WHERE DATE(pt.created_at) <= ?
            AND pt.status <> 'cancelled'
            AND (
              pt.status NOT IN ('completed', 'warehoused')
              OR COALESCE(pt.completed_at, pt.actual_end_date) > ?
            )
          ORDER BY pt.id
        `,
          [snapDate, `${snapDate} 23:59:59`]
        );
  
        const wipDetails = [];
        let totalWIPMaterial = 0;
        let totalWIPLabor = 0;
        let totalWIPOverhead = 0;
  
        if (wipTasks.length > 0) {
          const taskIds = wipTasks.map((t) => t.task_id);
          const taskPh = taskIds.map(() => '?').join(',');
  
          const materialMovements = await this.collectTaskMaterialMovements(connection, taskIds, {
            cutoffDate: snapDate,
          });
          const matCostMap = this.sumMaterialMovementsByTask(materialMovements);
  
          // 批量获取所有任务的工序进度（消除 N+1）
          const [allProgress] = await connection.execute(
            `SELECT task_id,
                    COUNT(*) as total_processes,
                    SUM(
                      CASE
                        WHEN status = 'completed'
                         AND DATE(COALESCE(actual_end_time, updated_at, created_at)) <= ?
                        THEN 1
                        ELSE 0
                      END
                    ) as completed_processes
             FROM production_processes
             WHERE task_id IN (${taskPh})
             GROUP BY task_id`,
            [snapDate, ...taskIds]
          );
          const progressMap = new Map(allProgress.map((r) => [r.task_id, r]));
  
          // 批量获取所有任务的实际工时（消除 N+1）
          const [allLaborData] = await connection.execute(
            `SELECT pr.task_id, COALESCE(SUM(pr.work_hours), 0) as actual_hours
             FROM production_reports pr
             WHERE pr.task_id IN (${taskPh})
               AND pr.report_time <= ?
             GROUP BY pr.task_id`,
            [...taskIds, `${snapDate} 23:59:59`]
          );
          const laborMap = new Map(
            allLaborData.map((r) => [r.task_id, parseFloat(r.actual_hours) || 0])
          );
  
          // 获取成本配置（只查一次，移到循环外）
          const settings = await this.getCostSettings();
          const OverheadAllocationService = require('./OverheadAllocationService');
  
          for (const task of wipTasks) {
            const materialCost = matCostMap.get(task.task_id) || 0;
  
            // 从批量结果计算完工率
            let completionRate = 0;
            const progress = progressMap.get(task.task_id);
            if (progress && progress.total_processes > 0) {
              completionRate = Precision.round2(
                (progress.completed_processes / progress.total_processes) * 100
              );
            } else {
              if (task.planned_quantity > 0) {
                completionRate = Precision.round2(
                  ((task.completed_quantity || 0) / task.planned_quantity) * 100
                );
              }
            }
  
            // 从批量结果获取工时
            const actualHours = laborMap.get(task.task_id) || 0;
            const laborCost = Precision.round2(Precision.mul(actualHours, settings.laborRate));
  
            // 制造费用：统一通过分摊规则引擎计算
            const ohResult = await OverheadAllocationService.calculateOverhead({
              productId: task.product_id,
              costCenterId: task.cost_center_id,
              laborCost: laborCost,
              laborHours: actualHours,
              quantity: task.planned_quantity,
              materialCost: materialCost,
              date: snapDate,
            });
            const overheadCost = Precision.round2(ohResult.overhead);
  
            const totalCost = Precision.sumRound2(materialCost, laborCost, overheadCost);
  
            // 计算约当产量
            const equivalentUnits = Precision.round2(
              Precision.mul(task.planned_quantity || 0, completionRate / 100)
            );
  
            // 计算 WIP 成本（约当产量法）
            const wipFactor = 1 - completionRate / 100;
            const wipMaterialCost = Precision.round2(Precision.mul(materialCost, wipFactor));
            const wipLaborCost = Precision.round2(Precision.mul(laborCost, wipFactor));
            const wipOverheadCost = Precision.round2(Precision.mul(overheadCost, wipFactor));
            const wipTotalCost = Precision.sumRound2(wipMaterialCost, wipLaborCost, wipOverheadCost);
  
            totalWIPMaterial = Precision.add(totalWIPMaterial, wipMaterialCost);
            totalWIPLabor = Precision.add(totalWIPLabor, wipLaborCost);
            totalWIPOverhead = Precision.add(totalWIPOverhead, wipOverheadCost);
  
            // 保存 WIP 快照
            await connection.execute(
              `
              INSERT INTO wip_snapshots (
                period_id, snapshot_date, task_id, task_code, product_id, product_name,
                cost_center_id, planned_quantity, completed_quantity, material_cost, labor_cost, overhead_cost, total_cost,
                completion_rate, equivalent_units, wip_material_cost, wip_labor_cost, wip_overhead_cost, wip_total_cost
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                cost_center_id = VALUES(cost_center_id),
                material_cost = VALUES(material_cost),
                labor_cost = VALUES(labor_cost),
                overhead_cost = VALUES(overhead_cost),
                total_cost = VALUES(total_cost),
                completion_rate = VALUES(completion_rate),
                equivalent_units = VALUES(equivalent_units),
                wip_material_cost = VALUES(wip_material_cost),
                wip_labor_cost = VALUES(wip_labor_cost),
                wip_overhead_cost = VALUES(wip_overhead_cost),
                wip_total_cost = VALUES(wip_total_cost)
            `,
              [
                actualPeriodId,
                snapDate,
                task.task_id,
                task.task_code,
                task.product_id,
                task.product_name,
                task.cost_center_id || null,
                task.planned_quantity,
                task.completed_quantity || 0,
                materialCost,
                laborCost,
                overheadCost,
                totalCost,
                completionRate,
                equivalentUnits,
                wipMaterialCost,
                wipLaborCost,
                wipOverheadCost,
                wipTotalCost,
              ]
            );
  
            wipDetails.push({
              taskId: task.task_id,
              taskCode: task.task_code,
              productId: task.product_id,
              productName: task.product_name,
              plannedQuantity: task.planned_quantity,
              completedQuantity: task.completed_quantity || 0,
              completionRate,
              equivalentUnits,
              investedCost: { materialCost, laborCost, overheadCost, totalCost },
              wipCost: {
                materialCost: wipMaterialCost,
                laborCost: wipLaborCost,
                overheadCost: wipOverheadCost,
                totalCost: wipTotalCost,
              },
            });
          }
        }
  
        await connection.commit();
  
        const totalWIPCost = Precision.sumRound2(totalWIPMaterial, totalWIPLabor, totalWIPOverhead);
  
        logger.info(
          `[WIP] 期末在制品成本计算完成: 期间=${actualPeriodId}, 任务数=${wipDetails.length}, WIP总成本=${totalWIPCost}`
        );
  
        return {
          periodId: actualPeriodId,
          snapshotDate: snapDate,
          taskCount: wipDetails.length,
          summary: {
            totalWIPMaterial,
            totalWIPLabor,
            totalWIPOverhead,
            totalWIPCost,
          },
          details: wipDetails,
        };
      } catch (error) {
        await connection.rollback();
        logger.error('[WIP] 计算在制品成本失败:', error);
        throw error;
      } finally {
        connection.release();
      }
    },

  /**
     * 生成在制品凭证（月末结转）
     * 借: 期末在制品
     * 贷: 生产成本-本期投入
     *
     * @param {number} periodId 会计期间ID
     * @returns {Promise<Object>} 凭证信息
     */
    async generateWIPVoucher(periodId) {
      const connection = await db.pool.getConnection();
      try {
        await connection.beginTransaction();
        await this.assertOpenPeriod(connection, periodId);
  
        // 获取该期间的 WIP 汇总
        const [wipSummary] = await connection.execute(
          `
          SELECT
            SUM(wip_material_cost) as total_material,
            SUM(wip_labor_cost) as total_labor,
            SUM(wip_overhead_cost) as total_overhead,
            SUM(wip_total_cost) as total_cost
          FROM wip_snapshots
          WHERE period_id = ?
        `,
          [periodId]
        );
  
        const totalWIP = Precision.round2(parseFloat(wipSummary[0]?.total_cost) || 0);
  
        // 获取科目
        const { accountingConfig } = require('../../config/accountingConfig');
        await accountingConfig.loadFromDatabase(db);
  
        const productionCostCode = accountingConfig.getAccountCode('PRODUCTION_COST');
        const wipCode =
          accountingConfig.getAccountCode('WORK_IN_PROCESS') || accountingConfig.getAccountCode('WIP');
        const productionCostAccountId = await this.getAccountIdByCode(connection, productionCostCode);
        const wipAccountId = await this.getAccountIdByCode(connection, wipCode);
  
        if (!productionCostAccountId || !wipAccountId) {
          throw new Error(
            `科目配置缺失: 期末在制品(${wipCode})=${wipAccountId}, 生产成本(${productionCostCode})=${productionCostAccountId}`
          );
        }
  
        if (wipAccountId === productionCostAccountId) {
          throw new Error('期末在制品科目不能与生产成本科目相同，请检查 WORK_IN_PROCESS/WIP 科目配置');
        }
  
        // 获取会计期间信息
        const [periodInfo] = await connection.execute(
          "SELECT DATE_FORMAT(end_date, '%Y-%m-%d') as end_date FROM gl_periods WHERE id = ?",
          [periodId]
        );
        const entryDate = toLocalDateString(periodInfo[0]?.end_date || currentDateString());
  
        const existingWIPVoucherResult = await this.releaseExistingWIPVoucherIfNeeded(
          connection,
          periodId,
          entryDate,
          totalWIP,
          wipAccountId,
          productionCostAccountId
        );
  
        if (existingWIPVoucherResult?.reused) {
          await connection.commit();
          return {
            success: true,
            reused: true,
            entryId: existingWIPVoucherResult.entryId,
            entryNumber: existingWIPVoucherResult.entryNumber,
            totalWIPCost: totalWIP,
            debitAccountCode: wipCode,
            creditAccountCode: productionCostCode,
          };
        }
  
        if (totalWIP <= 0) {
          logger.info(`[WIPVoucher] 期间 ${periodId} 无在制品成本，无需生成凭证`);
          await connection.commit();
          return {
            skipped: true,
            reason: '无在制品成本',
            repair: existingWIPVoucherResult || null,
          };
        }
  
        // 构建分录（期末 WIP 结转）
        const entryItems = [
          {
            account_id: wipAccountId,
            debit_amount: totalWIP,
            credit_amount: 0,
            description: '期末在制品结转',
          },
          {
            account_id: productionCostAccountId,
            debit_amount: 0,
            credit_amount: totalWIP,
            description: '冲销本期生产成本投入',
          },
        ];
  
        const entryData = {
          entry_date: entryDate,
          posting_date: entryDate, // 过账日期
          period_id: periodId,
          document_type: '期末WIP结转',
          document_number: `WIP-${periodId}`,
          description: '期末在制品成本结转',
          transaction_type: '期末WIP结转', // 业务类型：在制品结转
          transaction_id: periodId, // 关联的会计期间ID
          created_by: await resolveActorUserId(connection),
          status: 'posted',
          is_posted: 1,
        };
  
        const entryId = await GLService.createEntry(entryData, entryItems, connection);
  
        await connection.commit();
  
        logger.info(
          `[WIPVoucher] 期间 ${periodId} WIP凭证生成成功: 分录ID=${entryId}, 金额=${totalWIP}`
        );
  
        return {
          success: true,
          entryId,
          totalWIPCost: totalWIP,
          debitAccountCode: wipCode,
          creditAccountCode: productionCostCode,
          repair: existingWIPVoucherResult || null,
        };
      } catch (error) {
        await connection.rollback();
        // 重复条目错误用WARN级别，其他用ERROR
        if (error.code === 'ER_DUP_ENTRY') {
          logger.warn('[WIPVoucher] 凭证已存在，跳过生成');
        } else {
          logger.error('[WIPVoucher] 生成WIP凭证失败:', error);
        }
        throw error;
      } finally {
        connection.release();
      }
    },
};
