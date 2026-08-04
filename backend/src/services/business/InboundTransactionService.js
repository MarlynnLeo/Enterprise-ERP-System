/**
 * InboundTransactionService.js
 * @description 入库核心事务服务，用于抽离Controller中庞大复杂的入库确认逻辑
 */

const { logger } = require('../../utils/logger');
const InventoryService = require('../InventoryService');
const { ENABLE_TRACEABILITY } = require('../../config/features');
const db = require('../../config/db');
const NonconformingProduct = require('../../models/nonconformingProduct');
const { validateTaskTransition } = require('./TaskLifecycleService');
const CostAccountingService = require('./CostAccountingService');

const DLQService = require('./DLQService');
const AsyncTaskService = require('./AsyncTaskService');
const { resolveActorLabel, resolveActorUserId } = require('../../utils/userUtils');
class InboundTransactionService {
  /**
   * 执行完整的入库确认逻辑
   * @param {Object} connection 数据库连接事务对象
   * @param {Number} inboundId 入库单ID
   * @param {String} operator 操作人
   * @param {Object} inboundData 入库主表数据
   */
  static async confirmInbound(connection, inboundId, operator, inboundData) {
    logger.info(`开始分离核心入库处理，入库单ID: ${inboundId}`);

    // 获取入库单信息
    const [inboundInfo] = await connection.execute(
      'SELECT id, inbound_no, inbound_date, inbound_type, reference_type, reference_id, reference_no, location_id, status, total_amount, total_amount_unit, operator, inspection_id, inspection_no, remark, created_at, updated_at, created_by, updated_by, is_deleted FROM inventory_inbound WHERE id = ? AND is_deleted = 0',
      [inboundId]
    );

    // 获取入库单明细
    const [inboundItems] = await connection.execute(
      `SELECT ii.*, m.code as material_code, m.name as material_name
       FROM inventory_inbound_items ii
       LEFT JOIN materials m ON ii.material_id = m.id
       WHERE ii.inbound_id = ?`,
      [inboundId]
    );

    const inspection_id = inboundInfo.length > 0 ? inboundInfo[0].inspection_id : null;

    if (inspection_id) {
      // 查询检验单，找到相关联的生产任务
      const [inspectionInfo] = await connection.execute(
        'SELECT reference_id, reference_no FROM quality_inspections WHERE id = ? AND deleted_at IS NULL',
        [inspection_id]
      );

      if (inspectionInfo.length > 0 && inspectionInfo[0].reference_id) {
        const taskId = inspectionInfo[0].reference_id;
        const [taskInfo] = await connection.execute(
          'SELECT plan_id FROM production_tasks WHERE id = ? AND deleted_at IS NULL',
          [taskId]
        );

        if (taskInfo.length > 0 && taskInfo[0].plan_id) {
          // 这里原有个巨大的坑，后来在Controller里被注释去掉了，此处同样留空保持原功能一致
        }
      }
    }

    // 查询明细补充项
    const [items] = await connection.execute(
      'SELECT id, material_id, quantity, unit_id, batch_number, location_id FROM inventory_inbound_items WHERE inbound_id = ?',
      [inboundId]
    );

    if (items.length === 0) {
      logger.error('入库单没有物料项, ID:', inboundId);
      throw new Error('入库单没有物料项');
    }

    // 根据入库类型确定库存交易类型
    const inboundType = inboundData.inbound_type || 'other';
    const transactionTypeMap = {
      purchase: 'purchase_inbound',
      production: 'production_inbound',
      production_return: 'production_return',
      outsourced: 'outsourced_inbound',
      sales_return: 'sales_return',
      defective_return: 'defective_return',
      other: 'inbound',
    };
    const transactionType = transactionTypeMap[inboundType] || 'inbound';

    let productionUnitCost = null;
    if (inboundType === 'production') {
      let taskId =
        inboundData.reference_type === 'production_task'
          ? Number(inboundData.reference_id)
          : null;
      if (!taskId && inspection_id) {
        const [taskRefs] = await connection.execute(
          `SELECT COALESCE(task_id, reference_id) AS task_id
             FROM quality_inspections
            WHERE id = ? AND deleted_at IS NULL
            LIMIT 1`,
          [inspection_id]
        );
        taskId = Number(taskRefs[0]?.task_id) || null;
      }
      if (!taskId) {
        throw new Error(`生产入库单 ${inboundData.inbound_no} 未关联生产任务，不能核算成品成本`);
      }

      const costResult = await CostAccountingService.calculateActualCost(taskId, connection);
      productionUnitCost = Number(costResult?.actualCost?.unitCost) || 0;
      if (productionUnitCost <= 0) {
        throw new Error(`生产任务 ${taskId} 实际单位成本无效，不能完成成品入库`);
      }
    }

    logger.info('入库交易类型:', { inbound_type: inboundType, transaction_type: transactionType });

    for (const item of items) {
      if (!item.material_id) {
        logger.error('物料ID为空');
        throw new Error('物料ID为空');
      }

      // 获取物料的基础信息单位和仓库
      const matInfo = await InventoryService.getMaterialInfo(item.material_id, connection);
      const unitId = item.unit_id || matInfo.unitId;
      const itemLocationId = item.location_id || inboundData.location_id || matInfo.locationId;

      if (!unitId) {
        logger.error(`物料 ${item.material_id} 没有单位`);
        throw new Error(`物料 ${item.material_id} 没有单位`);
      }

      const currentStock = await InventoryService.getCurrentStock(
        item.material_id,
        itemLocationId,
        connection,
        false,
        false
      );

      const beforeQuantity = currentStock;
      const afterQuantity = beforeQuantity + parseFloat(item.quantity);

      // 处理批次溯源：判断是否产线退料或不良退回，追溯原始批次
      let finalBatchNumber = item.batch_number;
      if (!finalBatchNumber) {
        if (
          ['defective_return', 'production_return'].includes(inboundType) &&
          inboundData.reference_id
        ) {
          try {
            // reference_id 可能是出库单ID或生产任务ID
            // 策略1: 按出库单ID查出单号，再从台账匹配批次
            const [outboundRows] = await connection.execute(
              `SELECT outbound_no FROM inventory_outbound WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
              [inboundData.reference_id]
            );

            if (outboundRows.length > 0) {
              const outboundNo = outboundRows[0].outbound_no;
              const [ledgerRows] = await connection.execute(
                `SELECT batch_number
                 FROM inventory_ledger
                 WHERE reference_no = ?
                   AND material_id = ?
                   AND quantity < 0
                   AND batch_number IS NOT NULL
                   AND batch_number != ''
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [outboundNo, item.material_id]
              );
              if (ledgerRows.length > 0) {
                finalBatchNumber = ledgerRows[0].batch_number;
                logger.info(
                  `Batch trace resolved from outbound ${outboundNo}: batchNumber=${finalBatchNumber}`
                );
              }
            }

            // 策略2: 如果策略1未命中，按生产任务ID查出所有关联出库单号
            if (!finalBatchNumber) {
              const [taskOutbounds] = await connection.execute(
                `SELECT outbound_no FROM inventory_outbound
                 WHERE production_task_id = ?
                    OR (reference_type = 'production_task' AND reference_id = ?)
                 LIMIT 10`,
                [inboundData.reference_id, inboundData.reference_id]
              );

              for (const ob of taskOutbounds) {
                const [ledgerRows] = await connection.execute(
                  `SELECT batch_number
                   FROM inventory_ledger
                   WHERE reference_no = ?
                     AND material_id = ?
                     AND quantity < 0
                     AND batch_number IS NOT NULL
                     AND batch_number != ''
                   ORDER BY created_at DESC
                   LIMIT 1`,
                  [ob.outbound_no, item.material_id]
                );
                if (ledgerRows.length > 0) {
                  finalBatchNumber = ledgerRows[0].batch_number;
                  logger.info(
                    `Batch trace resolved from production outbound ${ob.outbound_no}: batchNumber=${finalBatchNumber}`
                  );
                  break;
                }
              }
            }

            if (!finalBatchNumber) {
              logger.warn(
                `Batch trace not found: referenceId=${inboundData.reference_id}, materialId=${item.material_id}`
              );
            }
          } catch (traceErr) {
            logger.error('Batch trace resolution failed', traceErr);
            throw traceErr;
          }
        }

        if (!finalBatchNumber) {
          throw new Error(
            `入库明细缺少可追溯批次号: inbound_no=${inboundData.inbound_no}, material_id=${item.material_id}`
          );
        }

        // 回写明细
        await connection.execute(
          'UPDATE inventory_inbound_items SET batch_number = ? WHERE id = ?',
          [finalBatchNumber, item.id]
        );
      }

      const sideEffectItem = inboundItems.find((row) => row.id === item.id);
      if (sideEffectItem) {
        sideEffectItem.batch_number = finalBatchNumber;
      }

      logger.info('入库库存变动:', {
        material_id: item.material_id,
        location_id: itemLocationId,
        before: beforeQuantity,
        add: item.quantity,
        after: afterQuantity,
      });

      let resolvedUnitCost = inboundType === 'production'
        ? productionUnitCost
        : Number(matInfo.costPrice) || 0;
      if (['sales_return', 'production_return', 'defective_return'].includes(inboundType)) {
        const [sourceCosts] = await connection.execute(
          `SELECT unit_cost
             FROM inventory_ledger
            WHERE material_id = ?
              AND batch_number = ?
              AND quantity < 0
              AND COALESCE(unit_cost, 0) > 0
            ORDER BY id DESC
            LIMIT 1`,
          [item.material_id, finalBatchNumber]
        );
        resolvedUnitCost = Number(sourceCosts[0]?.unit_cost) || 0;
      }
      if (resolvedUnitCost <= 0) {
        throw new Error(
          `入库单 ${inboundData.inbound_no} 的物料 ${item.material_id} 缺少可证明的正数单位成本，不能入库`
        );
      }

      // 记录库存台账（幂等：同一入库明细只入一次）
      await InventoryService.updateStock(
        {
          materialId: item.material_id,
          locationId: itemLocationId,
          quantity: parseFloat(item.quantity),
          transactionType: transactionType,
          referenceNo: inboundData.inbound_no,
          referenceType: 'inbound',
          operator: operator,
          remark: inboundData.remark || '',
          unitId: unitId,
          batchNumber: finalBatchNumber,
          transactionDate: inboundData.inbound_date,
          unitCost: resolvedUnitCost,
          idempotencyKey: `inbound_confirm:${inboundData.inbound_no}:item:${item.id}`,
        },
        connection
      );

      // 根据入库类型确定追溯触发类型
      const traceTypeMap = {
        purchase: 'purchase',
        production: 'production',
        production_return: 'production_return',
        defective_return: 'defective_return',
        outsourced: 'purchase',
        sales_return: 'sales_return',
        other: 'inbound',
      };
      const traceTriggerType = traceTypeMap[inboundType] || 'inbound';

      // 追溯数据载荷
      const tracePayload = {
        inbound_no: inboundData.inbound_no,
        material_id: item.material_id,
        quantity: parseFloat(item.quantity),
        batch_no: finalBatchNumber,
        source_type: inboundType,
        reference_id: inboundData.reference_id || null,
        operator,
      };

      // 采用死信队列包裹器处理
      DLQService.runWithRetry(`CreateTraceability_${item.material_id}`, tracePayload, async () => {
        logger.info(
          `Traceability build scheduled: inboundNo=${inboundData.inbound_no}, type=${traceTriggerType}`
        );
        await AsyncTaskService.createTraceabilityAsync(traceTriggerType, tracePayload);
      });
    }

    await this.syncProductionCompletion(connection, inboundInfo[0], inboundItems, inspection_id);

    // 异步创建成品入库追溯记录及NCP生成（无阻塞副流）
    this._handleSideEffects(inboundId, inboundInfo[0], inboundItems, inspection_id, operator);
  }

  static async syncProductionCompletion(connection, inboundData, inboundItems, inspection_id) {
    if (inboundData.inbound_type !== 'production') return;

    // 解析任务 ID：优先检验单，其次入库 reference
    let taskId = null;
    if (inspection_id) {
      const [inspections] = await connection.query(
        `SELECT reference_id, COALESCE(qualified_quantity, 0) AS qualified_quantity
         FROM quality_inspections
         WHERE id = ? AND inspection_type = 'final' AND deleted_at IS NULL FOR UPDATE`,
        [inspection_id]
      );
      if (inspections.length === 0 || !inspections[0].reference_id) return;
      taskId = inspections[0].reference_id;
    } else if (
      inboundData.reference_type === 'production_task' ||
      inboundData.reference_type === 'production'
    ) {
      taskId = Number(inboundData.reference_id) || null;
    }
    if (!taskId) return;

    const [taskResult] = await connection.query(
      `SELECT id, plan_id, code, status, quantity, product_id
       FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [taskId]
    );
    if (taskResult.length === 0) {
      throw new Error(`成品入库关联的生产任务不存在: ${taskId}`);
    }

    const task = taskResult[0];
    const planQty = parseFloat(task.quantity) || 0;

    // 累计已确认生产入库数量（含本单，本单此时可能仍是 confirmed 流转中）
    const [warehousedRows] = await connection.query(
      `SELECT COALESCE(SUM(ii.quantity), 0) AS total_qty
       FROM inventory_inbound_items ii
       JOIN inventory_inbound ib ON ib.id = ii.inbound_id
       WHERE ib.inbound_type = 'production'
         AND COALESCE(ib.is_deleted, 0) = 0
         AND ib.status IN ('confirmed', 'completed')
         AND (
           ib.reference_id = ?
           OR ib.inspection_id IN (
             SELECT id FROM quality_inspections
             WHERE reference_id = ? AND inspection_type = 'final' AND deleted_at IS NULL
           )
         )
         AND (ii.material_id = ? OR ? IS NULL)`,
      [taskId, taskId, task.product_id, task.product_id]
    );
    const totalWarehoused = parseFloat(warehousedRows[0]?.total_qty) || 0;

    // 终检合格合计（若有）作为上限参考
    const [qualifiedRows] = await connection.query(
      `SELECT COALESCE(SUM(COALESCE(qualified_quantity, 0)), 0) AS q
       FROM quality_inspections
       WHERE reference_id = ?
         AND inspection_type = 'final'
         AND deleted_at IS NULL
         AND status IN ('passed', 'partial', 'completed')`,
      [taskId]
    );
    const totalQualified = parseFloat(qualifiedRows[0]?.q) || 0;
    const qtyCap =
      totalQualified > 0 ? Math.min(planQty || totalQualified, totalQualified) : planQty || totalWarehoused;

    // 本单数量不得把累计推过 cap（ε=0.0001）
    if (qtyCap > 0 && totalWarehoused > qtyCap + 0.0001) {
      throw new Error(
        `生产入库累计数量 ${totalWarehoused} 超过任务/终检上限 ${qtyCap}，禁止过账`
      );
    }

    const isFullComplete = qtyCap <= 0
      ? totalWarehoused > 0
      : totalWarehoused + 0.0001 >= qtyCap;

    let targetStatus = isFullComplete ? 'completed' : 'warehousing';
    // 若仍处于 inspection，至少推进到 warehousing
    if (!isFullComplete && ['inspection', 'in_progress', 'material_issued'].includes(task.status)) {
      targetStatus = 'warehousing';
    }

    if (task.status !== targetStatus && task.status !== 'completed') {
      const transition = validateTaskTransition(task.status, targetStatus);
      if (!transition.valid && targetStatus === 'completed') {
        // 允许 inspection/warehousing → completed 的中间态：先到 warehousing 再 completed
        const toWh = validateTaskTransition(task.status, 'warehousing');
        if (toWh.valid) {
          await connection.execute(
            `UPDATE production_tasks
             SET status = 'warehousing', updated_at = NOW()
             WHERE id = ? AND deleted_at IS NULL`,
            [taskId]
          );
          const t2 = validateTaskTransition('warehousing', 'completed');
          if (!t2.valid) {
            throw new Error(`生产入库无法完成任务 ${task.code}: ${t2.message}`);
          }
        } else if (!transition.valid) {
          throw new Error(`生产入库无法完成任务 ${task.code}: ${transition.message}`);
        }
      } else if (!transition.valid) {
        // warehousing 目标：用 promote 软路径
        const { promoteTaskToward } = require('./TaskLifecycleService');
        await promoteTaskToward(connection, taskId, targetStatus, {
          requireOpenInspectionClear: false,
        });
        targetStatus = null; // already promoted
      }

      if (targetStatus) {
        const sets = ['status = ?', 'updated_at = NOW()'];
        const params = [targetStatus];
        if (targetStatus === 'completed') {
          sets.push('completed_at = COALESCE(completed_at, NOW())');
          sets.push('actual_end_date = COALESCE(actual_end_date, CURDATE())');
        }
        params.push(taskId);
        await connection.execute(
          `UPDATE production_tasks SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
          params
        );
      }
    } else if (task.status === 'completed') {
      await connection.execute(
        `UPDATE production_tasks
         SET completed_at = COALESCE(completed_at, NOW()),
             actual_end_date = COALESCE(actual_end_date, CURDATE())
         WHERE id = ? AND deleted_at IS NULL`,
        [taskId]
      );
    }

    if (task.plan_id) {
      const { syncPlanStatus } = require('./TaskLifecycleService');
      await syncPlanStatus(task.plan_id, connection);
    }

    logger.info(
      `生产入库 ${inboundData.inbound_no} 同步任务 ${task.code || taskId}: warehoused=${totalWarehoused}/${qtyCap}, full=${isFullComplete}`
    );

    // 仅在完全完工时：同事务入队 DomainEvent（对齐销售/采购，可 DLQ 重放）
    if (isFullComplete || task.status === 'completed' || targetStatus === 'completed') {
      try {
        const DomainEventService = require('./DomainEventService');
        const eventId = await DomainEventService.enqueue(
          'PRODUCTION_TASK_COMPLETED',
          {
            taskId,
            taskCode: task.code || taskId,
            isFullComplete: true,
            inboundNo: inboundData.inbound_no,
          },
          {
            connection,
            aggregateType: 'production_task',
            aggregateId: taskId,
            dedupKey: `PRODUCTION_TASK_COMPLETED:${taskId}`,
          }
        );
        // 提交后由调用方 dispatch；此处登记到 connection 钩子不可用时用 setImmediate 安全派发
        setImmediate(() => {
          try {
            DomainEventService.dispatchSoon(eventId);
          } catch (e) {
            logger.warn(`生产完工事件派发失败: ${e.message}`);
          }
        });
      } catch (emitErr) {
        logger.warn(`生产入库后入队成本事件失败: ${emitErr.message}`);
      }
    }
  }

  /**
   * 冲销已完成入库：按原正向台账逐行回冲（幂等）
   * 锁序固定 material_id, location_id, ledger.id，降低与并发库存事务死锁概率
   */
  static async reverseInbound(connection, inboundId, operator, inboundData) {
    const inboundNo = inboundData.inbound_no;
    if (!inboundNo) {
      throw new Error('入库单号缺失，无法冲销');
    }

    const [already] = await connection.execute(
      `SELECT COUNT(*) AS count
       FROM inventory_ledger
       WHERE reference_no = ?
         AND transaction_type = 'inbound_cancel'
         AND quantity < 0`,
      [inboundNo]
    );
    if (Number(already[0]?.count || 0) > 0) {
      throw new Error('该入库单已有冲销流水，禁止重复冲销');
    }

    const [ledgerRows] = await connection.execute(
      `SELECT
         id,
         material_id,
         location_id,
         unit_id,
         batch_number,
         ABS(quantity) AS qty
       FROM inventory_ledger
       WHERE reference_no = ?
         AND quantity > 0
         AND (
           reference_type IN ('inbound', 'production_inbound', 'purchase_inbound')
           OR reference_type IS NULL
           OR reference_type = ''
         )
       ORDER BY material_id ASC, location_id ASC, id ASC`,
      [inboundNo]
    );

    // 兼容仅写 transaction_type 未写 reference_type 的历史数据
    let rows = ledgerRows;
    if (rows.length === 0) {
      const [fallback] = await connection.execute(
        `SELECT id, material_id, location_id, unit_id, batch_number, ABS(quantity) AS qty
         FROM inventory_ledger
         WHERE reference_no = ? AND quantity > 0
         ORDER BY material_id ASC, location_id ASC, id ASC`,
        [inboundNo]
      );
      rows = fallback;
    }

    if (rows.length === 0) {
      throw new Error('找不到该入库单的正向台账，无法安全冲销');
    }

    // 先按固定顺序预锁库位，再回冲
    const lockKeys = new Set();
    for (const ledger of rows) {
      if (!ledger.location_id || !ledger.material_id) continue;
      const key = `${ledger.material_id}:${ledger.location_id}`;
      if (lockKeys.has(key)) continue;
      lockKeys.add(key);
      await InventoryService.getCurrentStock(
        ledger.material_id,
        ledger.location_id,
        connection,
        true,
        false
      );
    }

    for (const ledger of rows) {
      const qty = parseFloat(ledger.qty) || 0;
      if (qty <= 0) continue;
      if (!ledger.location_id) {
        throw new Error(`台账 ${ledger.id} 缺少库位，无法冲销`);
      }

      await InventoryService.updateStock(
        {
          materialId: ledger.material_id,
          locationId: ledger.location_id,
          quantity: -qty,
          transactionType: 'inbound_cancel',
          referenceNo: inboundNo,
          referenceType: 'inbound_reversal',
          operator: await resolveActorLabel(null, operator),
          remark: `冲销入库单 ${inboundNo}，来源台账 ${ledger.id}`,
          unitId: ledger.unit_id,
          batchNumber: ledger.batch_number || `REV-IN-${inboundNo}-${ledger.id}`,
          idempotencyKey: `inbound_cancel:${inboundNo}:ledger:${ledger.id}`,
        },
        connection
      );
    }

    logger.info(
      `入库单 ${inboundNo} 冲销完成，回冲 ${rows.length} 条台账`
    );

    // 生产入库冲销：回退任务状态（completed/warehousing → warehousing 或 inspection）
    if (inboundData.inbound_type === 'production') {
      try {
        let taskId =
          inboundData.reference_type === 'production_task' ||
          inboundData.reference_type === 'production'
            ? Number(inboundData.reference_id)
            : null;
        if (!taskId && inboundData.inspection_id) {
          const [insp] = await connection.execute(
            `SELECT reference_id FROM quality_inspections
             WHERE id = ? AND inspection_type = 'final' AND deleted_at IS NULL LIMIT 1`,
            [inboundData.inspection_id]
          );
          taskId = Number(insp[0]?.reference_id) || null;
        }
        if (taskId) {
          const [taskRows] = await connection.execute(
            `SELECT id, plan_id, status, code FROM production_tasks
             WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
            [taskId]
          );
          if (taskRows.length) {
            const t = taskRows[0];
            // 统计冲销后剩余已入库量
            const [remain] = await connection.execute(
              `SELECT COALESCE(SUM(ii.quantity), 0) AS total_qty
               FROM inventory_inbound_items ii
               JOIN inventory_inbound ib ON ib.id = ii.inbound_id
               WHERE ib.inbound_type = 'production'
                 AND COALESCE(ib.is_deleted, 0) = 0
                 AND ib.status IN ('confirmed', 'completed')
                 AND ib.inbound_no <> ?
                 AND (
                   ib.reference_id = ?
                   OR ib.inspection_id IN (
                     SELECT id FROM quality_inspections
                     WHERE reference_id = ? AND inspection_type = 'final' AND deleted_at IS NULL
                   )
                 )`,
              [inboundNo, taskId, taskId]
            );
            const remainQty = parseFloat(remain[0]?.total_qty) || 0;
            const newStatus = remainQty > 0.0001 ? 'warehousing' : 'inspection';
            if (t.status === 'completed' || t.status === 'warehousing') {
              await connection.execute(
                `UPDATE production_tasks
                 SET status = ?,
                     completed_at = NULL,
                     updated_at = NOW()
                 WHERE id = ? AND deleted_at IS NULL`,
                [newStatus, taskId]
              );
              if (t.plan_id) {
                const { syncPlanStatus } = require('./TaskLifecycleService');
                await syncPlanStatus(t.plan_id, connection);
              }
              logger.info(
                `生产入库冲销后任务 ${t.code || taskId} 状态回退为 ${newStatus}（剩余入库 ${remainQty}）`
              );
            }
          }
        }
      } catch (demoteErr) {
        logger.warn(`生产入库冲销后任务回退失败: ${demoteErr.message}`);
      }
    }

    return { reversedCount: rows.length };
  }

  /**
   * 异步处理周边的副作用：如追溯链创建，及不良品NCP单自动生成
   */
  static _handleSideEffects(inboundId, inboundData, inboundItems, inspection_id, operator = null) {
    const shouldCreateTrace =
      ENABLE_TRACEABILITY &&
      inspection_id &&
      inboundItems.length > 0 &&
      inboundItems[0].material_id;

    if (shouldCreateTrace) {
      DLQService.runWithRetry(
        `产品入库追溯记录创建-${inboundData.inbound_no}`,
        { inboundId, inboundData, inspection_id },
        async () => {
          try {
            for (const item of inboundItems) {
              try {
                let productCode = item.material_code;
                let productName = item.material_name;

                if (!productCode || !productName) {
                  const conn = await db.pool.getConnection();
                  try {
                    const [materialInfo] = await conn.execute(
                      'SELECT code, name FROM materials WHERE id = ? AND deleted_at IS NULL',
                      [item.material_id]
                    );
                    if (materialInfo.length > 0) {
                      productCode = materialInfo[0].code;
                      productName = materialInfo[0].name;
                    } else {
                      continue;
                    }
                  } finally {
                    conn.release();
                  }
                }

                if (!item.batch_number) {
                  throw new Error(
                    `产品入库追溯缺少批次号: inbound_no=${inboundData.inbound_no}, material_id=${item.material_id}`
                  );
                }
                const batchNumber = item.batch_number;

                if (inspection_id) {
                  const conn = await db.pool.getConnection();
                  try {
                    await conn.execute(
                      'UPDATE quality_inspections SET traceability_batch = ? WHERE id = ? AND deleted_at IS NULL',
                      [batchNumber, inspection_id]
                    );
                  } finally {
                    conn.release();
                  }
                }
              } catch (itemTraceError) {
                logger.error(`为物料 ${item.material_id} 创建入库追溯记录失败:`, itemTraceError);
                throw itemTraceError;
              }
            }
          } catch (traceError) {
            logger.error('异步创建产品入库追溯记录失败:', traceError);
            throw traceError;
          }
        }
      );
    }

    // 建立原料→成品批次追溯关系；生产任务/计划状态已在主事务中同步完成
    if (inboundData.inbound_type === 'production' && inspection_id) {
      DLQService.runWithRetry(
        `生产入库批次关系-${inboundData.inbound_no}`,
        { inboundData, inspection_id },
        async () => {
          const connection = await db.pool.getConnection();
          try {
            // 查找绑定的成品质检单，获取关联的生产任务ID
            const [inspections] = await connection.query(
              "SELECT reference_id FROM quality_inspections WHERE id = ? AND inspection_type = 'final' AND deleted_at IS NULL",
              [inspection_id]
            );
            if (inspections.length > 0 && inspections[0].reference_id) {
              const taskId = inspections[0].reference_id;

              // 查找生产任务和计划
              const [taskResult] = await connection.query(
                'SELECT id, plan_id, code FROM production_tasks WHERE id = ? AND deleted_at IS NULL',
                [taskId]
              );

              if (taskResult.length > 0) {
                const taskCode = taskResult[0].code;

                // ✅ 建立原料 → 成品的 batch_relationships 追溯消耗关系
                // 思路：生产入库时成品已有批次号，从 inventory_ledger 查该生产任务
                //       对应的 production_outbound 台账，即可得到实际领用的原料批次
                try {
                  for (const inboundItem of inboundItems) {
                    const productBatchNo = inboundItem.batch_number;
                    if (!productBatchNo) continue;

                    // 查询该生产任务下实际领用的原料批次（来自对应的生产出库单领料）
                    // 1. 获取该生产任务对应的所有出库单号
                    const [outbounds] = await connection.query(
                      `SELECT outbound_no FROM inventory_outbound
                     WHERE production_task_id = ? OR (reference_type = 'production_task' AND reference_id = ?)`,
                      [taskId, taskId]
                    );

                    let consumedRows = [];
                    if (outbounds.length > 0) {
                      const outNos = outbounds.map((o) => o.outbound_no);
                      const placeholders = outNos.map(() => '?').join(',');

                      // 2. 查询这些出库单在台账中的扣减明细
                      const [ledgerRows] = await connection.query(
                        `SELECT
                         il.material_id,
                         il.batch_number    as raw_batch_number,
                         m.code             as raw_material_code,
                         ABS(SUM(il.quantity)) as consumed_quantity
                       FROM inventory_ledger il
                       JOIN materials m ON il.material_id = m.id
                       WHERE il.transaction_type IN ('production_outbound', 'outbound')
                         AND il.reference_no IN (${placeholders})
                         AND il.quantity < 0
                         AND il.batch_number IS NOT NULL
                         AND il.batch_number != ''
                       GROUP BY il.material_id, il.batch_number, m.code`,
                        outNos
                      );
                      consumedRows = ledgerRows;
                    }

                    const producedQty = parseFloat(inboundItem.quantity) || 1;

                    for (const raw of consumedRows) {
                      // 避免重复写入（幂等保护）
                      const [existing] = await connection.query(
                        `SELECT id FROM batch_relationships
                       WHERE parent_batch_number = ? AND child_batch_number = ?
                         AND parent_material_code = ? AND relationship_type = 'consume'
                       LIMIT 1`,
                        [raw.raw_batch_number, productBatchNo, raw.raw_material_code]
                      );
                      if (existing.length > 0) continue;

                      await connection.execute(
                        `INSERT INTO batch_relationships (
                         parent_batch_id, child_batch_id,
                         parent_material_code, child_material_code,
                         parent_batch_number,  child_batch_number,
                         relationship_type,    consumed_quantity, produced_quantity,
                         conversion_ratio,     process_type,
                         reference_type,       reference_id,  reference_no,
                         operator,             remarks,       created_at
                       ) VALUES (NULL, NULL, ?, ?, ?, ?, 'consume', ?, ?, ?, 'production',
                                 'production_task', ?, ?, ?, ?, NOW())`,
                        [
                          raw.raw_material_code,
                          inboundItem.material_code || '',
                          raw.raw_batch_number,
                          productBatchNo,
                          parseFloat(raw.consumed_quantity),
                          producedQty,
                          producedQty > 0 ? parseFloat(raw.consumed_quantity) / producedQty : 1,
                          taskId,
                          taskCode || inboundData.inbound_no,
                          await resolveActorLabel(null, inboundData.operator, operator),
                          `生产任务 ${taskCode || taskId} 原料消耗追溯`,
                        ]
                      );
                    }

                    if (consumedRows.length > 0) {
                      logger.info(
                        `[追溯] 成品批次 ${productBatchNo} 已建立 ${consumedRows.length} 条原料消耗关系`
                      );
                    } else {
                      throw new Error(
                        `生产任务 ${taskId}(${taskCode}) 未找到对应的原料领用台账，不能建立成品批次 ${productBatchNo} 的消耗追溯关系`
                      );
                    }
                  }
                } catch (traceErr) {
                  logger.error('建立生产批次消耗追溯关系失败:', traceErr);
                  throw traceErr;
                }
              }
            }
          } catch (err) {
            logger.error('异步建立生产入库批次关系失败:', err);
            throw err;
          } finally {
            connection.release();
          }
        }
      );
    }

    // 处理缺陷退货直接生成NCP
    if (inboundData.inbound_type === 'defective_return') {
      DLQService.runWithRetry(
        `生成退料不良NCP单-${inboundData.inbound_no}`,
        { inboundItems, inbound_no: inboundData.inbound_no },
        async () => {
          const connection = await db.pool.getConnection();
          try {
            await connection.beginTransaction();
            for (const item of inboundItems) {
              const ncpNo = await NonconformingProduct.generateNcpNo();
              let unitName = 'pcs';
              if (item.unit_id) {
                const [unitRows] = await connection.execute(
                  'SELECT name FROM units WHERE id = ? AND deleted_at IS NULL',
                  [item.unit_id]
                );
                if (unitRows.length > 0 && unitRows[0].name) unitName = unitRows[0].name;
              }

              let locationName = '隔离区';
              if (inboundData.location_id) {
                const [locRows] = await connection.execute(
                  'SELECT name FROM locations WHERE id = ? AND deleted_at IS NULL',
                  [inboundData.location_id]
                );
                if (locRows.length > 0) locationName = locRows[0].name;
              }

              let supplierId = null;
              let supplierName = null;
              try {
                const [supplierRows] = await connection.query(
                  `
                SELECT r.supplier_id, COALESCE(s.name, r.supplier_name) AS supplier_name
                FROM purchase_receipts r
                JOIN purchase_receipt_items ri ON r.id = ri.receipt_id
                LEFT JOIN suppliers s ON r.supplier_id = s.id
                WHERE ri.material_id = ?
                ORDER BY r.created_at DESC
                LIMIT 1
              `,
                  [item.material_id]
                );
                if (supplierRows.length > 0) {
                  supplierId = supplierRows[0].supplier_id;
                  supplierName = supplierRows[0].supplier_name;
                }
              } catch (err) {
                logger.error('查询供应商信息失败:', err);
                throw err;
              }

              await connection.query(
                `
              INSERT INTO nonconforming_products (
                ncp_no, inspection_id, inspection_no, material_id, material_code, material_name,
                batch_no, quantity, unit, defect_type, defect_description, severity,
                supplier_id, supplier_name, disposition, current_location, isolation_area,
                responsible_party, note, created_by, status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
                [
                  ncpNo,
                  null,
                  null,
                  item.material_id,
                  item.material_code || '',
                  item.material_name || '',
                  null,
                  item.quantity,
                  unitName,
                  'incoming_defect',
                  `【自动登记】产线退回来料不良。退库单 ${inboundData.inbound_no}，原始流: ${inboundData.reference_no || '无'}`,
                  'minor',
                  supplierId,
                  supplierName,
                  'pending',
                  locationName,
                  locationName,
                  supplierId ? 'supplier' : 'unknown',
                  `退料不良自动单-入库: ${inboundData.inbound_no}`,
                  await resolveActorLabel(null, inboundData.operator, operator),
                  'pending',
                ]
              );

              logger.info(
                `Nonconforming product record generated from return inbound: inboundNo=${inboundData.inbound_no}, ncpNo=${ncpNo}`
              );
            }
            await connection.commit();
          } catch (e) {
            await connection.rollback();
            logger.error(`退料入库单生成NCP失败:`, e);
            throw e;
          } finally {
            connection.release();
          }
        }
      );
    }

    // ✅ 统一入口：入库后检查所有 in_production/in_procurement 的销售订单
    // 如果库存已满足，自动预留并流转为 ready_to_ship。
    // 使用 DLQService.runWithRetry 确保在外层事务提交后通过独立连接可靠执行，
    // 自带重试机制（3次，间隔递增），从根本上消除 setImmediate 的 race condition。
    DLQService.runWithRetry(
      `销售订单库存满足检查-${inboundData.inbound_no}`,
      { inbound_no: inboundData.inbound_no },
      async () => {
        const SalesOrderStatusService = require('./SalesOrderStatusService');
        await SalesOrderStatusService.checkAndReleasePendingOrders();
      }
    );
  }
}

module.exports = InboundTransactionService;
