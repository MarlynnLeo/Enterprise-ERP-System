/**
 * CostAccountingService — actualCost methods (mixin)
 * Attached via Object.assign so `this` resolves to CostAccountingService.
 * @module services/business/costAccounting/actualCostMethods
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
     * 计算产品实际成本
     * @param {number} productionOrderId 生产订单ID
     * @returns {Object} 实际成本信息
     */
    async calculateActualCost(productionOrderId, externalConn = null) {
      const isExternalConn = !!externalConn;
      const connection = externalConn || (await db.pool.getConnection());
      try {
        if (!isExternalConn) await connection.beginTransaction();
  
        // 获取生产任务信息
        const [orderInfo] = await connection.execute('SELECT id, code, plan_id, product_id, quantity, completed_quantity, start_date, expected_end_date, actual_start_time, actual_end_date, manager, status, remarks, created_at, updated_at, batch_number, actual_cost, material_cost, labor_cost, overhead_cost, pause_reason, pause_time, completed_at, cost_center_id, progress, deleted_at FROM production_tasks WHERE id = ? AND deleted_at IS NULL', [
          productionOrderId,
        ]);
  
        if (orderInfo.length === 0) {
          throw new Error('生产任务不存在');
        }
  
        const order = orderInfo[0];
  
        // 终态门禁：禁止对未入库完成的任务写实际成本/改材料成本价/过账
        const allowedCostStatuses = new Set(['completed', 'warehousing']);
        if (!allowedCostStatuses.has(order.status)) {
          throw new Error(
            `生产任务 ${order.code || productionOrderId} 状态为「${order.status}」，仅入库中/已完成任务可核算实际成本`
          );
        }
        const planQty = Number(order.quantity) || 0;
        const doneQty = Number(order.completed_quantity) || 0;
        if (planQty > 0 && doneQty + 1e-9 < planQty && order.status !== 'completed') {
          throw new Error(
            `生产任务 ${order.code || productionOrderId} 完工数量 ${doneQty}/${planQty} 未满产，且未完成入库，不能核算实际成本`
          );
        }
  
        const completionDate = this.toDateOnly(order.completed_at || currentDateString()); // 使用完工日期作为记账日期
  
        // 检查期间是否开启 (GL Check) - 修正错误的调法
        const periodId = await GLService.getPeriodIdByDate(completionDate);
        if (!periodId) {
          throw new Error('未找到该完工日期对应的开放会计期间');
        }
  
        // 计算实际材料成本
        const materialCost = await this.calculateActualMaterialCost(connection, productionOrderId);
  
        // 计算实际人工成本
        const laborCost = await this.calculateActualLaborCost(connection, productionOrderId);
  
        // 计算实际制造费用
        const overheadCost = await this.calculateActualOverheadCost(
          connection,
          productionOrderId,
          laborCost.totalCost,
          materialCost.totalCost,
          order.quantity
        );
  
        const totalActualCost = materialCost.totalCost + laborCost.totalCost + overheadCost.totalCost;
  
        if (!Number.isFinite(totalActualCost) || totalActualCost <= 0) {
          throw new Error(
            `生产任务 ${order.code || productionOrderId} 实际成本为0或无效，不能完成成本核算和成品入库`
          );
        }
  
        // 保存实际成本记录
  
        // ===== 回写成本到 production_tasks 表 =====
        await connection.execute(
          `INSERT INTO actual_costs (
             production_order_id, product_id, quantity,
             material_cost, labor_cost, overhead_cost, total_cost,
             calculated_at, calculated_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)
           ON DUPLICATE KEY UPDATE
             product_id = VALUES(product_id),
             quantity = VALUES(quantity),
             material_cost = VALUES(material_cost),
             labor_cost = VALUES(labor_cost),
             overhead_cost = VALUES(overhead_cost),
             total_cost = VALUES(total_cost),
             calculated_at = VALUES(calculated_at),
             calculated_by = VALUES(calculated_by)`,
          [
            productionOrderId,
            order.product_id,
            order.quantity,
            materialCost.totalCost,
            laborCost.totalCost,
            overheadCost.totalCost,
            totalActualCost,
            await resolveActorUserId(connection),
          ]
        );
  
        await connection.execute(
          `UPDATE production_tasks
           SET actual_cost = ?, material_cost = ?, labor_cost = ?, overhead_cost = ?
           WHERE id = ? AND deleted_at IS NULL`,
          [
            totalActualCost,
            materialCost.totalCost,
            laborCost.totalCost,
            overheadCost.totalCost,
            productionOrderId,
          ]
        );
        const producedQuantity = parseFloat(order.completed_quantity || order.quantity || 0);
        const finishedGoodsUnitCost =
          producedQuantity > 0 ? Precision.round(Precision.div(totalActualCost, producedQuantity), 4) : 0;
        if (finishedGoodsUnitCost > 0 && order.product_id) {
          await connection.execute('UPDATE materials SET cost_price = ? WHERE id = ? AND deleted_at IS NULL', [
            finishedGoodsUnitCost,
            order.product_id,
          ]);
  
          await connection.execute(
            `UPDATE inventory_ledger il
             JOIN (
               SELECT DISTINCT
                      iii.material_id,
                      iii.batch_number COLLATE utf8mb4_0900_ai_ci AS batch_number
               FROM inventory_inbound ii
               JOIN inventory_inbound_items iii ON iii.inbound_id = ii.id
               LEFT JOIN quality_inspections qi ON qi.id = ii.inspection_id
               WHERE iii.material_id = ?
                 AND iii.batch_number IS NOT NULL
                 AND iii.batch_number != ''
                 AND (
                   (ii.reference_type = 'production_task' AND ii.reference_id = ?)
                   OR qi.task_id = ?
                 )
               UNION
               SELECT DISTINCT
                      product_id AS material_id,
                      batch_no COLLATE utf8mb4_0900_ai_ci AS batch_number
               FROM quality_inspections
               WHERE task_id = ?
                 AND product_id = ?
                 AND batch_no IS NOT NULL
                 AND batch_no != ''
               UNION
               SELECT
                      product_id AS material_id,
                      batch_number COLLATE utf8mb4_0900_ai_ci AS batch_number
               FROM production_tasks
               WHERE id = ?
                 AND product_id = ?
                 AND batch_number IS NOT NULL
                 AND batch_number != ''
             ) task_batches
               ON task_batches.material_id = il.material_id
              AND task_batches.batch_number COLLATE utf8mb4_0900_ai_ci =
                  il.batch_number COLLATE utf8mb4_0900_ai_ci
             SET il.unit_cost = ?,
                 il.total_value = ROUND(ABS(il.quantity) * ?, 2)
             WHERE il.transaction_type IN ('production_inbound', 'sales_outbound')
               AND il.material_id = ?`,
            [
              order.product_id,
              productionOrderId,
              productionOrderId,
              productionOrderId,
              order.product_id,
              productionOrderId,
              order.product_id,
              finishedGoodsUnitCost,
              finishedGoodsUnitCost,
              order.product_id,
            ]
          );
  
          await connection.execute(
            `UPDATE inventory_inbound ii
             JOIN (
               SELECT ii.id AS inbound_id, ROUND(SUM(ABS(iii.quantity) * ?), 2) AS total_amount
               FROM inventory_inbound ii
               JOIN inventory_inbound_items iii ON iii.inbound_id = ii.id
               LEFT JOIN quality_inspections qi ON qi.id = ii.inspection_id
               WHERE iii.material_id = ?
                 AND (
                   (ii.reference_type = 'production_task' AND ii.reference_id = ?)
                   OR qi.task_id = ?
                 )
               GROUP BY ii.id
             ) inbound_cost ON inbound_cost.inbound_id = ii.id
             SET ii.total_amount = inbound_cost.total_amount`,
            [finishedGoodsUnitCost, order.product_id, productionOrderId, productionOrderId]
          );
          await InventoryService.rebuildStockBalancesForMaterial(order.product_id, connection);
        }
  
        logger.info(
          `生产任务 ${productionOrderId} 成本已回写: 总计=${totalActualCost}, 材料=${materialCost.totalCost}, 人工=${laborCost.totalCost}, 制造费用=${overheadCost.totalCost}`
        );
  
        // ========== 计算并保存成本差异 (Cost Variance) ==========
        try {
          const stdCostResult = await this.ensureStandardCost(order.product_id, order.quantity);
          if (stdCostResult && stdCostResult.totalCost > 0) {
            const standardMaterialCost = stdCostResult.materialCost || 0;
            const standardLaborCost = stdCostResult.laborCost || 0;
            const standardOverheadCost = stdCostResult.overheadCost || 0;
            const standardTotalCost = stdCostResult.totalCost || 0;
  
            const materialVariance = standardMaterialCost - materialCost.totalCost;
            const laborVariance = standardLaborCost - laborCost.totalCost;
            const overheadVariance = standardOverheadCost - overheadCost.totalCost;
            const totalVariance = standardTotalCost - totalActualCost;
            const varianceRate =
              standardTotalCost > 0 ? (totalVariance / standardTotalCost) * 100 : 0;
            const isFavorable = totalVariance >= 0 ? 1 : 0;
  
            await connection.execute(
              `INSERT INTO cost_variance_records (
                task_id, product_id, quantity,
                standard_material_cost, standard_labor_cost, standard_overhead_cost, standard_total_cost,
                actual_material_cost, actual_labor_cost, actual_overhead_cost, actual_total_cost,
                material_variance, labor_variance, overhead_variance, total_variance,
                variance_rate, is_favorable, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
              ON DUPLICATE KEY UPDATE
                standard_material_cost = VALUES(standard_material_cost),
                standard_labor_cost = VALUES(standard_labor_cost),
                standard_overhead_cost = VALUES(standard_overhead_cost),
                standard_total_cost = VALUES(standard_total_cost),
                actual_material_cost = VALUES(actual_material_cost),
                actual_labor_cost = VALUES(actual_labor_cost),
                actual_overhead_cost = VALUES(actual_overhead_cost),
                actual_total_cost = VALUES(actual_total_cost),
                material_variance = VALUES(material_variance),
                labor_variance = VALUES(labor_variance),
                overhead_variance = VALUES(overhead_variance),
                total_variance = VALUES(total_variance),
                variance_rate = VALUES(variance_rate),
                is_favorable = VALUES(is_favorable)`,
              [
                productionOrderId,
                order.product_id,
                order.quantity,
                standardMaterialCost,
                standardLaborCost,
                standardOverheadCost,
                standardTotalCost,
                materialCost.totalCost,
                laborCost.totalCost,
                overheadCost.totalCost,
                totalActualCost,
                materialVariance,
                laborVariance,
                overheadVariance,
                totalVariance,
                varianceRate,
                isFavorable,
              ]
            );
            logger.info(
              `生产任务 ${productionOrderId} 成本差异记录已保存: 标准=${standardTotalCost}, 实际=${totalActualCost}, 差异=${totalVariance}`
            );
          }
        } catch (varianceErr) {
          logger.warn(`生产任务 ${productionOrderId} 计算/保存成本差异失败: ${varianceErr.message}`);
          // 差异保存失败不应该阻断主核算流程
        }
  
        // ========== GL Integration (生成凭证) ==========
  
        // 1. 获取所有需要的科目映射 (纯净的 SSOT 节点提取，杜绝防呆字面量)
        const config = globalConfigManager.getConfig();
        const accountCodes = [
          config.accounting.accounts.INVENTORY_GOODS, // 库存商品 (借)
          config.accounting.accounts.PRODUCTION_COST, // 生产成本/在制品 (借/贷)
          config.accounting.accounts.RAW_MATERIALS, // 原材料 (贷)
          config.accounting.accounts.EMPLOYEE_PAYABLE, // 应付职工薪酬 (贷)
          config.accounting.accounts.MANUFACTURING_EXPENSE, // 制造费用-转出 (贷)
        ];
  
        const accounts = await GLService.getAccountIds(accountCodes);
        const accFG = accounts[config.accounting.accounts.INVENTORY_GOODS];
        const accWIP = accounts[config.accounting.accounts.PRODUCTION_COST];
        const accRaw = accounts[config.accounting.accounts.RAW_MATERIALS];
        const accWages = accounts[config.accounting.accounts.EMPLOYEE_PAYABLE];
        const accOverhead = accounts[config.accounting.accounts.MANUFACTURING_EXPENSE];
  
        // 检查关键科目 (WIP和FG是必须的)
        if (accFG && accWIP) {
          try {
            const baseEntryData = {
              period_id: periodId,
              entry_date: completionDate,
              document_type: DOCUMENT_TYPES.PRODUCTION_COST_TRANSFER,
              document_number: order.code,
              transaction_id: productionOrderId,
              created_by: await resolveActorUserId(connection),
              voucher_word: '转',
              status: 'posted',
              is_posted: 1,
            };
  
            const createProductionEntry = async (transactionType, entryData, items) => {
              const typedDocumentNumber = `${String(order.code).slice(0, 30)}-${transactionType.replace('PRODUCTION_', '')}`;
              const itemsWithCostCenter = items.map((item) => ({
                ...item,
                cost_center_id: item.cost_center_id ?? order.cost_center_id ?? null,
              }));
              const [existing] = await connection.execute(
                `SELECT id, entry_number, is_posted
                 FROM gl_entries
                 WHERE transaction_type = ?
                   AND (transaction_id = ? OR document_number IN (?, ?))
                   AND COALESCE(is_reversed, 0) = 0
                 LIMIT 1
                 FOR UPDATE`,
                [transactionType, productionOrderId, order.code, typedDocumentNumber]
              );
  
              if (existing.length > 0) {
                const existingEntry = existing[0];
                const [existingItems] = await connection.execute(
                  'SELECT id, entry_id, line_number, account_id, debit_amount, credit_amount, description, cost_center_id, project_id, created_at, updated_at, currency_code, exchange_rate, customer_id, supplier_id, employee_id FROM gl_entry_items WHERE entry_id = ? ORDER BY line_number, id FOR UPDATE',
                  [existingEntry.id]
                );
  
                if (this.areGLItemsExpected(existingItems, itemsWithCostCenter)) {
                  logger.info(
                    `Production cost entry skipped: type=${transactionType}, task=${productionOrderId}`
                  );
                  return existingEntry.id;
                }
  
                if (Number(existingEntry.is_posted) === 1 || existingEntry.is_posted === true) {
                  const reversalEntryId = await GLService.createEntry(
                    {
                      ...baseEntryData,
                      ...entryData,
                      document_type: `${entryData.document_type || baseEntryData.document_type || transactionType}冲销`,
                      document_number: `R-${typedDocumentNumber}-${existingEntry.id}`.slice(0, 50),
                      description: `自动冲销失配生产成本凭证 ${existingEntry.entry_number || existingEntry.id}`,
                      transaction_type: `${transactionType}_REVERSAL`,
                      transaction_id: existingEntry.id,
                    },
                    existingItems.map((item) => ({
                      account_id: item.account_id,
                      debit_amount: item.credit_amount,
                      credit_amount: item.debit_amount,
                      currency_code: item.currency_code || financeConfig.get('invoice.defaultCurrency', 'CNY'),
                      exchange_rate: item.exchange_rate || 1,
                      cost_center_id: item.cost_center_id || order.cost_center_id || null,
                      description: `自动冲销失配生产成本凭证明细: ${item.description || ''}`,
                    })),
                    connection
                  );
  
                  await connection.execute(
                    `UPDATE gl_entries
                        SET is_reversed = 1,
                            reversal_entry_id = ?,
                            status = 'reversed',
                            transaction_type = ?,
                            transaction_id = NULL
                      WHERE id = ?`,
                    [reversalEntryId, `${transactionType}_REVERSED`, existingEntry.id]
                  );
                } else {
                  await connection.execute('DELETE FROM gl_entry_items WHERE entry_id = ?', [
                    existingEntry.id,
                  ]);
                  await connection.execute('DELETE FROM gl_entries WHERE id = ?', [existingEntry.id]);
                }
              }
  
              return GLService.createEntry(
                {
                  ...baseEntryData,
                  ...entryData,
                  document_number: typedDocumentNumber,
                  transaction_type: transactionType,
                },
                itemsWithCostCenter,
                connection
              );
            };
  
            // --- 凭证 1: 生产领料 (借: 生产成本 / 贷: 原材料) ---
            if (accRaw && materialCost.totalCost > 0) {
              await createProductionEntry(
                'PRODUCTION_MATERIAL',
                {
                  ...baseEntryData,
                  description: `生产领料结转: ${order.code}`,
                  transaction_type: 'PRODUCTION_MATERIAL',
                },
                [
                  {
                    account_id: accWIP,
                    debit_amount: materialCost.totalCost,
                    credit_amount: 0,
                    description: `生产领料: ${order.code}`,
                  },
                  {
                    account_id: accRaw,
                    debit_amount: 0,
                    credit_amount: materialCost.totalCost,
                    description: `生产领料出库: ${order.code}`,
                  },
                ],
                connection
              );
            }
  
            // --- 凭证 2: 直接人工 (借: 生产成本 / 贷: 应付职工薪酬) ---
            if (accWages && laborCost.totalCost > 0) {
              await createProductionEntry(
                'PRODUCTION_LABOR',
                {
                  ...baseEntryData,
                  description: `分配生产人工: ${order.code}`,
                  transaction_type: 'PRODUCTION_LABOR',
                },
                [
                  {
                    account_id: accWIP,
                    debit_amount: laborCost.totalCost,
                    credit_amount: 0,
                    description: `分配生产人工: ${order.code}`,
                  },
                  {
                    account_id: accWages,
                    debit_amount: 0,
                    credit_amount: laborCost.totalCost,
                    description: `计提生产人工: ${order.code}`,
                  },
                ],
                connection
              );
            }
  
            // --- 凭证 3: 制造费用 (借: 生产成本 / 贷: 制造费用转出) ---
            if (accOverhead && overheadCost.totalCost > 0) {
              await createProductionEntry(
                'PRODUCTION_OVERHEAD',
                {
                  ...baseEntryData,
                  description: `分配制造费用: ${order.code}`,
                  transaction_type: 'PRODUCTION_OVERHEAD',
                },
                [
                  {
                    account_id: accWIP,
                    debit_amount: overheadCost.totalCost,
                    credit_amount: 0,
                    description: `分配制造费用: ${order.code}`,
                  },
                  {
                    account_id: accOverhead,
                    debit_amount: 0,
                    credit_amount: overheadCost.totalCost,
                    description: `制造费用结转: ${order.code}`,
                  },
                ],
                connection
              );
            }
  
            // --- 凭证 4: 完工入库 (借: 库存商品 / 贷: 生产成本) ---
            if (totalActualCost > 0) {
              await createProductionEntry(
                'PRODUCTION_COMPLETE',
                {
                  ...baseEntryData,
                  description: `生产完工入库: ${order.code}`,
                  transaction_type: 'PRODUCTION_COMPLETE',
                },
                [
                  {
                    account_id: accFG,
                    debit_amount: totalActualCost,
                    credit_amount: 0,
                    description: `生产完工入库: ${order.code}`,
                  },
                  {
                    account_id: accWIP,
                    debit_amount: 0,
                    credit_amount: totalActualCost,
                    description: `结转生产成本: ${order.code}`,
                  },
                ],
                connection
              );
            }
          } catch (glError) {
            logger.error(`GL Entry Creation Failed for Order ${productionOrderId}:`, glError);
            // 财务合规要求一致性: 必须回滚
            throw glError;
          }
        } else {
          logger.warn(
            `未配置GL标准化科目映射 (4001 或 1405 缺失)，不能生成凭证: Order ${productionOrderId}`
          );
          throw new Error(`未配置生产成本总账科目映射，不能完成成本结转: Order ${productionOrderId}`);
        }
  
        if (!isExternalConn) await connection.commit();
  
        return {
          productionOrderId,
          productId: order.product_id,
          quantity: order.quantity,
          actualCost: {
            materialCost: materialCost.totalCost,
            laborCost: laborCost.totalCost,
            overheadCost: overheadCost.totalCost,
            totalCost: totalActualCost,
            unitCost: totalActualCost / order.quantity,
          },
          details: {
            materials: materialCost.details,
            labor: laborCost.details,
            overhead: overheadCost.details,
          },
        };
      } catch (error) {
        if (connection && !isExternalConn) {
          try {
            await connection.rollback();
          } catch (rbErr) {
            logger.error('Rollback failed:', rbErr);
          }
        }
        logger.error('计算实际成本产生全局异常:', error);
        throw error;
      } finally {
        if (connection && !isExternalConn) connection.release();
      }
    },

  /**
     * 计算实际材料成本
     * @param {Object} connection 数据库连接
     * @param {number} productionOrderId 生产订单ID
     * @param {string} method 成本计算方法
     * @returns {Object} 材料成本信息
     */
    async calculateActualMaterialCost(
      connection,
      productionOrderId,
      method = this.COSTING_METHOD.WEIGHTED_AVERAGE
    ) {
      const materialIssues = (
        await this.collectTaskMaterialMovements(connection, [productionOrderId])
      ).map((issue) => ({
        ...issue,
        material_id: issue.material_id ?? issue.materialId,
        material_code: issue.material_code ?? issue.materialCode,
        material_name: issue.material_name ?? issue.materialName,
        unit_cost: issue.unit_cost ?? issue.unitCost,
        issue_date: issue.issue_date ?? issue.movementDate,
        batch_number: issue.batch_number ?? issue.batchNumber,
      }));
  
      let totalCost = 0;
      const details = [];
      const costVariances = [];
  
      // ✅ 性能优化: 批量预取所有物料的标准成本，消除 N+1 查询
      const uniqueMaterialIds = [
        ...new Set(materialIssues.map((i) => i.material_id).filter(Boolean)),
      ];
      const standardCostMap = await this.getBatchStandardMaterialCosts(connection, uniqueMaterialIds);
  
      for (const issue of materialIssues) {
        // 根据成本计算方法获取更准确的单位成本
        const issueQuantity = parseFloat(issue.quantity) || 0;
        let actualUnitCost = parseFloat(issue.unit_cost) || 0;
  
        if ((method === this.COSTING_METHOD.STANDARD || actualUnitCost <= 0) && issue.material_id) {
          try {
            actualUnitCost = await this.getMaterialUnitCost(
              connection,
              issue.material_id,
              method,
              issue.issue_date
            );
          } catch (error) {
            logger.warn(
              `获取物料 ${issue.material_id} 的实际成本失败，回溯至标准成本:`,
              error.message
            );
            // ✅ 使用预取的标准成本映射，不再单独查询
            const stdCost = standardCostMap[issue.material_id];
            if (stdCost === undefined) {
              throw new BusinessError(
                `物料 ${issue.material_code} 的出库计价获取失败：既无实际成本记录也未维护标准成本。请先前往物料库完善基础财务定价，确保出库账务精准无误。`,
                { route: '/basedata/materials', buttonText: '前往物料字典修复' }
              );
            }
            actualUnitCost = stdCost;
          }
        }
  
        if (Math.abs(issueQuantity) > 0 && actualUnitCost <= 0) {
          throw new BusinessError(
            `物料 ${issue.material_code || issue.material_id} 缺少有效出库成本，不能生成生产实际成本。请先维护物料标准成本或库存成本价。`,
            { route: '/finance/cost/settings', buttonText: '维护成本价格' }
          );
        }
  
        const itemCost = issueQuantity * actualUnitCost;
        totalCost += itemCost;
  
        // ✅ 使用预取的标准成本映射，不再单独查询
        const standardUnitCost = standardCostMap[issue.material_id] || 0;
        const costVariance = (actualUnitCost - standardUnitCost) * issueQuantity;
  
        if (Math.abs(costVariance) > 0.01) {
          // 差异超过0.01元才记录
          costVariances.push({
            materialId: issue.material_id,
            materialCode: issue.material_code,
            materialName: issue.material_name,
            quantity: issueQuantity,
            standardUnitCost,
            actualUnitCost,
            variance: costVariance,
            variancePercent:
              standardUnitCost > 0 && issueQuantity > 0
                ? (costVariance / (standardUnitCost * issueQuantity)) * 100
                : 0,
          });
        }
  
        details.push({
          materialId: issue.material_id,
          materialName: issue.material_name,
          materialCode: issue.material_code,
          category: issue.category,
          quantity: issueQuantity,
          unitCost: actualUnitCost,
          standardUnitCost,
          totalCost: itemCost,
          issueDate: issue.issue_date,
          batchNumber: issue.batch_number,
          costMethod: method,
          variance: costVariance,
        });
      }
  
      return {
        totalCost,
        details,
        costVariances,
        method,
        calculationDate: new Date(),
        totalVariance: costVariances.reduce((sum, v) => sum + v.variance, 0),
      };
    },

  /**
     * 计算实际人工成本
     * @param {Object} connection 数据库连接
     * @param {number} productionOrderId 生产订单ID
     * @returns {Object} 人工成本信息
     */
    async calculateActualLaborCost(connection, productionOrderId) {
      // 获取报工记录中的工时，代替废弃的 labor_records
      const [laborRecords] = await connection.execute(
        `SELECT pr.id, pr.operator_name as employee_name, pr.process_name as workstation_name,
                pr.work_hours as hours_worked, pr.report_time as work_date
         FROM production_reports pr
         WHERE pr.task_id = ?`,
        [productionOrderId]
      );
  
      const totalRecordedHours = laborRecords.reduce(
        (sum, record) => sum + (parseFloat(record.hours_worked) || 0),
        0
      );
  
      // SSOT 强校验：如果未找到该生产任务的报工工时记录，拒绝使用 0 元人工费进行妥协记账，直接抛异常倒逼前端补充报工。
      if (laborRecords.length === 0 || totalRecordedHours <= 0) {
        throw new BusinessError(
          `无法核算人工成本：生产订单 ${productionOrderId} 缺少必须的报工及工时耗用记录，请先执行流转定额报工。`,
          { route: '/production/tasks', buttonText: '返回单据查勘报工' } // 或指向特定的报工维护页
        );
      }
  
      // 严格从全局 SSOT 获取费率，去除防御性补偿代码
      await globalConfigManager.init();
      const defaultHourlyRate = globalConfigManager.getConfig().cost.laborRate;
  
      let totalCost = 0;
      const details = [];
  
      for (const record of laborRecords) {
        const hoursWorked = parseFloat(record.hours_worked) || 0;
        // 报工记录中没有费率，使用默认配置的人工作业费率
        const recordCost = hoursWorked * defaultHourlyRate;
        totalCost += recordCost;
  
        details.push({
          employeeId: record.id, // 用报工ID代替
          employeeName: record.employee_name,
          workstationName: record.workstation_name || '未指定工序',
          hoursWorked: hoursWorked,
          hourlyRate: defaultHourlyRate,
          totalCost: recordCost,
          workDate: record.work_date,
        });
      }
  
      return {
        totalCost,
        details,
      };
    },

  /**
     * 计算实际制造费用（支持多分摊基础）
     * @param {Object} connection 数据库连接
     * @param {number} productionOrderId 生产订单ID
     * @param {number} laborCost 人工成本
     * @param {number} materialCost 材料成本
     * @param {number} quantity 数量
     * @param {Object} options 额外选项
     * @param {number} options.costCenterId 成本中心ID
     * @param {number} options.laborHours 人工工时
     * @param {number} options.machineHours 机器工时
     * @param {string} options.productCategory 产品类别
     * @returns {Object} 制造费用信息
     */
    async calculateActualOverheadCost(
      connection,
      productionOrderId,
      laborCost,
      materialCost = 0,
      quantity = 0,
      options = {}
    ) {
      try {
        const OverheadAllocationService = require('./OverheadAllocationService');
  
        // 获取任务的成本中心和产品ID
        let costCenterId = options.costCenterId;
        let productId = options.productId;
        let laborHours = options.laborHours || 0;
  
        if (productionOrderId) {
          const [taskInfo] = await connection.execute(
            'SELECT cost_center_id, product_id FROM production_tasks WHERE id = ? AND deleted_at IS NULL',
            [productionOrderId]
          );
          if (taskInfo.length > 0) {
            if (!costCenterId && taskInfo[0].cost_center_id) {
              costCenterId = taskInfo[0].cost_center_id;
            }
            if (!productId && taskInfo[0].product_id) {
              productId = taskInfo[0].product_id;
            }
          }
        }
  
        // 获取工时信息：从报工表 production_reports 抓取实际工时
        if (!laborHours && productionOrderId) {
          const [hoursInfo] = await connection.execute(
            'SELECT COALESCE(SUM(work_hours), 0) as total_hours FROM production_reports WHERE task_id = ?',
            [productionOrderId]
          );
          if (hoursInfo.length > 0) {
            laborHours = parseFloat(hoursInfo[0].total_hours) || 0;
          }
        }
  
        // 使用新的分摊服务计算制造费用
        const result = await OverheadAllocationService.calculateOverhead({
          costCenterId,
          productId,
          laborCost,
          laborHours,
          machineHours: options.machineHours || 0,
          quantity,
          materialCost,
          productCategory: options.productCategory,
          date: currentDateString(),
        });
  
        return {
          totalCost: result.overhead,
          details: {
            allocation_base: result.allocation_base,
            rate: result.rate,
            config_name: result.config_name,
            calculatedCost: result.overhead,
            rules: [
              {
                name: result.config_name,
                cost: result.overhead,
                base: result.allocation_base,
                ruleValue: result.rate,
              },
            ],
          },
        };
      } catch (error) {
        // SSOT 原则：严禁通过魔法数字对缺陷主数据进行补偿估算
        logger.error('[CostAccounting] 制造费用分摊服务调用异常，抛出错误交还上层处理', error);
        throw new BusinessError(
          `制造费用核算阻断: ${error.message}，请进入财务管理配置适用的分摊参数`,
          { route: '/finance/cost/settings', buttonText: '去配置制造费分摊' }
        );
      }
    },

  /**
     * 计算生产任务的实际成本 (统一入口)
     * 整合了材料实际出库、工时实际记录等逻辑
     * @param {number} taskId 生产任务ID
     * @param {Object} options 选项 { quantity: number }
     */
    async calculateTaskActualCost(taskId, options = {}) {
      const connection = await db.pool.getConnection();
      try {
        const quantity = options.quantity || 1;
  
        // 1. 获取配置
        const settings = await this.getCostSettings();
  
        // 2. 计算材料成本 (优先基于实际出库)
        let materialCost = 0;
        let useActualOutbound = false;
  
        try {
          const [outboundCosts] = await connection.execute(
            `SELECT SUM(
                (CASE WHEN ioi.actual_quantity IS NULL THEN ioi.quantity ELSE ioi.actual_quantity END)
                * COALESCE(NULLIF(ioi.price, 0), NULLIF(m.cost_price, 0), 0)
              ) as total_material_cost
              FROM inventory_outbound io
              JOIN inventory_outbound_items ioi ON io.id = ioi.outbound_id
              JOIN materials m ON ioi.material_id = m.id
              LEFT JOIN cost_supplement_configs csc ON io.issue_reason = csc.reason_name
              WHERE io.production_task_id = ?
                AND io.status IN ('completed', 'confirmed')
                AND (csc.is_included_in_cost IS NULL OR csc.is_included_in_cost = 1)`,
            [taskId]
          );
  
          if (outboundCosts.length > 0 && outboundCosts[0].total_material_cost) {
            materialCost = parseFloat(outboundCosts[0].total_material_cost) || 0;
            if (materialCost > 0) useActualOutbound = true;
          }
        } catch (e) {
          logger.warn(`[CostService] 查询实际出库成本失败: ${e.message}`);
        }
  
        // 3. 计算人工成本 (基于实际工序时间)
        let laborCost = 0;
        let actualHours = 0;
        let useActualLabor = false;
  
        try {
          const [procs] = await connection.query(
            'SELECT actual_start_time, actual_end_time FROM production_processes WHERE task_id = ? AND status = "completed"',
            [taskId]
          );
  
          if (procs.length > 0) {
            for (const proc of procs) {
              if (proc.actual_start_time && proc.actual_end_time) {
                const start = new Date(proc.actual_start_time);
                const end = new Date(proc.actual_end_time);
                const hours = (end - start) / (1000 * 60 * 60);
                if (hours > 0) actualHours += hours;
              }
            }
  
            if (actualHours > 0 || settings.wagePaymentMethod === 'piece') {
              if (settings.wagePaymentMethod === 'piece') {
                // 计件模式：按生产数量计算（使用精确计算）
                const quantityNum = Number(quantity) || 0;
                const pieceRateNum = Number(settings.pieceRate) || 0;
                laborCost = Precision.mul(quantityNum, pieceRateNum);
                logger.info(
                  `[Cost] 计件模式: 数量=${quantityNum}, 件薪=${pieceRateNum}, 人工=${laborCost}`
                );
              } else {
                // 计时模式：按实际工时计算（使用精确计算）
                laborCost = Precision.mul(actualHours, settings.laborRate);
                logger.info(
                  `[Cost] 计时模式: 工时=${actualHours.toFixed(2)}, 时薪=${settings.laborRate}, 人工=${laborCost}`
                );
              }
              useActualLabor = true;
            }
          }
        } catch (e) {
          logger.warn(`[CostService] 获取工序时间失败: ${e.message}`);
        }
  
        // 4. 如果没有实际数据，回退到标准成本
        let overheadCost = 0;
        let calculationMethod = 'standard';
  
        // 获取任务对应的产品ID以便查询标准成本
        const [taskInfo] = await connection.execute(
          'SELECT product_id FROM production_tasks WHERE id = ? AND deleted_at IS NULL',
          [taskId]
        );
        const productId = taskInfo.length > 0 ? taskInfo[0].product_id : null;
  
        if (productId) {
          const stdCost = await this.ensureStandardCost(productId, quantity);
  
          // 如果没有实际材料成本，使用标准
          if (!useActualOutbound) {
            materialCost = stdCost.materialCost;
          } else {
            calculationMethod = 'actual_material';
          }
  
          // 如果没有实际人工成本，使用标准
          if (!useActualLabor) {
            laborCost = stdCost.laborCost;
          } else {
            calculationMethod = useActualOutbound ? 'actual_combined' : 'actual_labor';
          }
  
          // 制造费用：统一通过分摊规则引擎计算
          const OverheadAllocationService = require('./OverheadAllocationService');
          const ohResult = await OverheadAllocationService.calculateOverhead({
            productId,
            laborCost,
            laborHours: actualHours,
            quantity,
            materialCost,
            date: currentDateString(),
          });
          overheadCost = ohResult.overhead;
        }
  
        // 使用精确加法计算总成本，确保借贷平衡
        // 例如：952.00 + 0.06 + 0.03 = 952.09（而非 952.10）
        const totalCost = Precision.sumRound2(materialCost, laborCost, overheadCost);
  
        // 四舍五入各项成本到分
        const roundedMaterialCost = Precision.round2(materialCost);
        const roundedLaborCost = Precision.round2(laborCost);
        const roundedOverheadCost = Precision.round2(overheadCost);
  
        // 确保分项之和等于总成本（尾差调整）
        const costItems = [
          { name: 'material', amount: roundedMaterialCost },
          { name: 'labor', amount: roundedLaborCost },
          { name: 'overhead', amount: roundedOverheadCost },
        ];
        Precision.adjustTail(costItems, totalCost, 'amount');
  
        return {
          materialCost: costItems[0].amount,
          laborCost: costItems[1].amount,
          overheadCost: costItems[2].amount,
          totalCost,
          currency: financeConfig.get('invoice.defaultCurrency', 'CNY'),
          calculationMethod,
          details: {
            actualHours,
            laborRate: settings.laborRate,
            overheadRate: settings.overheadRate,
            useActualOutbound,
            useActualLabor,
          },
        };
      } catch (error) {
        logger.error(`[CostService] 计算实际成本失败 (Task ${taskId}):`, error);
        throw error;
      } finally {
        connection.release();
      }
    },
};
