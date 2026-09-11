'use strict';

const { logger } = require('../../utils/logger');
const { currentDateString } = require('../../utils/dateUtils');
const { promoteTaskStatus, syncPlanStatus } = require('./TaskLifecycleService');

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

class InventoryPostingReversalClosureService {
  static async close(connection, { original, reversal, context = {}, actor = {} } = {}) {
    if (!connection) throw new Error('反审核业务收尾必须在数据库事务中执行');
    if (!original || !reversal) throw new Error('反审核收尾缺少原始或冲销过账单');

    const sourceType = String(context.sourceType || original.source_type || '').trim();
    const sourceNo = String(context.sourceNo || original.source_no || '').trim();
    const normalizedContext = {
      ...context,
      sourceType,
      sourceNo,
      sourceId: positiveId(context.sourceId) || positiveId(original.source_id),
    };

    if (sourceType === 'sales_outbound') {
      return this.closeSalesOutbound(connection, normalizedContext, actor);
    }
    if (sourceType === 'inbound' || sourceType === 'purchase_inbound') {
      return this.closeInbound(connection, normalizedContext, actor);
    }
    if (sourceType === 'outbound' || sourceType === 'production_outbound') {
      return this.closeOutbound(connection, normalizedContext, actor);
    }
    if (sourceType === 'transfer') {
      return this.closeTransfer(connection, normalizedContext);
    }
    if (sourceType === 'outsourced_processing_material') {
      return this.closeOutsourcedProcessing(connection, normalizedContext, actor);
    }
    if (sourceType === 'outsourced_processing_receipt') {
      return this.closeOutsourcedReceipt(connection, normalizedContext, actor);
    }
    if (sourceType === 'manual_transaction') {
      throw new Error('手工库存事务尚未实现业务与财务反审核闭环，已阻止反审核');
    }

    throw new Error(`库存来源类型 ${sourceType || '未知'} 尚未实现财务补偿，已阻止反审核`);
  }

  static async closeInbound(connection, context, actor) {
    const inbound = await this.findByIdOrNo(
      connection,
      context.sourceId,
      context.sourceNo,
      `SELECT id, inbound_no, inbound_type, reference_type, reference_id, inspection_id, status
         FROM inventory_inbound
        WHERE (id = ? OR inbound_no = ?)
          AND COALESCE(is_deleted, 0) = 0
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE`
    );
    if (!inbound) throw new Error(`入库单 ${context.sourceNo} 不存在，无法完成反审核收尾`);

    await connection.execute(
      `UPDATE inventory_inbound
          SET status = 'reversed', updated_at = NOW()
        WHERE id = ? AND COALESCE(is_deleted, 0) = 0 AND deleted_at IS NULL`,
      [inbound.id]
    );

    const warnings = [];
    if (inbound.inbound_type === 'production') {
      try {
        await this.rollbackProductionInbound(connection, inbound, context);
      } catch (error) {
        // Inventory and business status are already in the same transaction;
        // a task rollback failure must abort approval rather than silently drift.
        logger.error(`生产入库 ${inbound.inbound_no} 反审核收尾失败:`, error);
        throw error;
      }
    }

    const financeReversal = await this.reverseRelatedVouchers(connection, {
      sourceType: context.sourceType,
      sourceId: inbound.id,
      sourceNo: inbound.inbound_no,
      operator: actor.label || 'system',
      reason: `入库反审核 ${inbound.inbound_no}`,
    });

    return {
      sourceType: context.sourceType,
      sourceId: inbound.id,
      businessClosed: true,
      financeReversal,
      warnings,
      actor: actor.label || null,
    };
  }

  static async rollbackProductionInbound(connection, inbound, context) {
    let taskId = positiveId(context.productionTaskId);
    if (!taskId && ['production_task', 'production'].includes(inbound.reference_type)) {
      taskId = positiveId(inbound.reference_id);
    }
    if (!taskId && inbound.inspection_id) {
      const [rows] = await connection.execute(
        `SELECT reference_id
           FROM quality_inspections
          WHERE id = ? AND inspection_type = 'final' AND deleted_at IS NULL
          LIMIT 1`,
        [inbound.inspection_id]
      );
      taskId = positiveId(rows[0]?.reference_id);
    }
    if (!taskId) return;

    const [taskRows] = await connection.execute(
      `SELECT id, plan_id, status, code
         FROM production_tasks
        WHERE id = ? AND deleted_at IS NULL
        FOR UPDATE`,
      [taskId]
    );
    if (!taskRows.length) return;

    const task = taskRows[0];
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
      [inbound.inbound_no, taskId, taskId]
    );
    const remainQty = Number(remain[0]?.total_qty || 0);
    const targetStatus = remainQty > 0.0001 ? 'warehousing' : 'inspection';
    if (['completed', 'warehousing'].includes(task.status)) {
      await connection.execute(
        `UPDATE production_tasks
            SET status = ?, completed_at = NULL, updated_at = NOW()
          WHERE id = ? AND deleted_at IS NULL`,
        [targetStatus, taskId]
      );
      if (task.plan_id) await syncPlanStatus(task.plan_id, connection);
    }
  }

  static async closeOutbound(connection, context, actor) {
    const outbound = await this.findByIdOrNo(
      connection,
      context.sourceId,
      context.sourceNo,
      `SELECT id, outbound_no, status, reference_id, reference_type,
              production_task_id, source_task_ids, is_batch_outbound,
              outbound_type, created_by, operator
         FROM inventory_outbound
        WHERE (id = ? OR outbound_no = ?) AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE`
    );
    if (!outbound) throw new Error(`出库单 ${context.sourceNo} 不存在，无法完成反审核收尾`);

    if (!outbound.reference_id && outbound.production_task_id) {
      outbound.reference_id = outbound.production_task_id;
      outbound.reference_type = 'production_task';
    }
    // 申请与财务审核之间生产状态可能变化；在同一冲销事务中重新锁定并校验来源。
    const taskIds = await this.assertOutboundReversalAllowed(connection, outbound, context);

    await connection.execute(
      `UPDATE inventory_outbound
          SET status = 'reversed',
              remark = CONCAT(COALESCE(remark, ''), ?),
              updated_at = NOW()
        WHERE id = ? AND deleted_at IS NULL`,
      [` [财务反审核 ${actor.label || 'system'}]`, outbound.id]
    );

    await connection.execute(
      `UPDATE material_shortage_records
          SET status = 'cancelled', remaining_quantity = 0,
              remark = CONCAT(COALESCE(remark, ''), ?),
              updated_at = NOW(), completed_at = COALESCE(completed_at, NOW())
        WHERE outbound_id = ? AND status IN ('pending', 'partial_supplied')`,
      [`\nCancelled by outbound reversal ${outbound.outbound_no}`, outbound.id]
    );

    if (taskIds.length) {
      const placeholders = taskIds.map(() => '?').join(',');
      await connection.execute(
        `DELETE FROM production_processes
          WHERE task_id IN (${placeholders})
            AND status = 'pending'
            AND COALESCE(progress, 0) = 0
            AND (remarks LIKE '%自动创建%' OR remarks LIKE '%出库单%' OR description LIKE '%默认生产过程%')`,
        taskIds
      );

      for (const taskId of taskIds) {
        await promoteTaskStatus(connection, taskId, 'preparing', {
          onlyFrom: ['material_issued', 'material_partial_issued'],
        });
      }
      const taskPlaceholders = taskIds.map(() => '?').join(',');
      await connection.execute(
        `UPDATE production_plans pp
            JOIN production_tasks pt ON pt.plan_id = pp.id AND pt.deleted_at IS NULL
            SET pp.status = 'preparing', pp.updated_at = NOW()
          WHERE pt.id IN (${taskPlaceholders})
            AND pp.deleted_at IS NULL
            AND pp.status = 'material_issued'`,
        taskIds
      );
    }

    if (outbound.reference_type === 'production_plan' && outbound.reference_id) {
      await connection.execute(
        `UPDATE production_plans
            SET status = 'preparing', updated_at = NOW()
          WHERE id = ? AND deleted_at IS NULL AND status = 'material_issued'`,
        [outbound.reference_id]
      );
    }

    // 撤销操作仅冲销库存与回滚状态，不自动生成重发草稿
    const reissueOutbound = null;

    const financeReversal = await this.reverseOutboundGLEntries(
      connection,
      outbound.outbound_no,
      actor.label || 'system'
    );
    return {
      sourceType: context.sourceType,
      sourceId: outbound.id,
      businessClosed: true,
      reissueOutbound,
      financeReversal,
      warnings: [],
    };
  }

  static async assertOutboundReversalAllowed(connection, outbound, context = {}) {
    const fail = (message, code = 'VALIDATION_ERROR', statusCode = 400, details) => {
      throw Object.assign(new Error(message), {
        code,
        statusCode,
        ...(details ? { details } : {}),
      });
    };
    if (!['completed', 'partial_completed'].includes(outbound.status)) {
      fail('只能撤销已完成或部分完成的出库单');
    }

    // 当前业务单据是来源关系的依据，不能用旧申请中的来源覆盖当前记录。
    const taskIds = this.resolveTaskIds(outbound, {});
    if (outbound.reference_type === 'batch_production_tasks' && !taskIds.length) {
      fail('批量发料单缺少来源生产任务，无法安全撤销');
    }
    const sources = [];
    if (taskIds.length) {
      const [tasks] = await connection.execute(
        `SELECT id, status, code FROM production_tasks
          WHERE id IN (${taskIds.map(() => '?').join(',')}) AND deleted_at IS NULL
          ORDER BY id FOR UPDATE`,
        taskIds
      );
      if (tasks.length !== taskIds.length) fail('部分来源生产任务不存在，无法安全撤销');
      sources.push(...tasks);
    }
    if (outbound.reference_type === 'production_plan' && outbound.reference_id) {
      const [plans] = await connection.execute(
        'SELECT id, status, code FROM production_plans WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
        [outbound.reference_id]
      );
      if (!plans.length) fail('来源生产计划不存在，无法安全撤销');
      sources.push(...plans);
      // 计划状态可能落后于子任务，已投产或已入库的任务同样需要保护。
      const [planTasks] = await connection.execute(
        'SELECT id, status, code FROM production_tasks WHERE plan_id = ? AND deleted_at IS NULL ORDER BY id FOR UPDATE',
        [outbound.reference_id]
      );
      sources.push(...planTasks);
    }
    const prohibitedStatuses = [
      'inspection',
      'quality_passed',
      'warehousing',
      'completed',
      'warehoused',
    ];
    const blocked = sources.find((source) => prohibitedStatuses.includes(source.status));
    if (blocked) {
      fail(`无法撤销：来源生产单据 ${blocked.code} 已进入 ${blocked.status} 状态`);
    }
    const inProgress = sources.filter((source) => source.status === 'in_progress');
    if (inProgress.length && context.force !== true) {
      fail(
        '来源生产单据正在生产中，请核实已消耗物料和生产进度后重新提交强制撤销申请。',
        'NEED_CONFIRM',
        409,
        { needConfirm: true, tasks: inProgress }
      );
    }
    return taskIds;
  }

  static resolveTaskIds(outbound, context) {
    const ids = new Set();
    const direct = positiveId(context.productionTaskId || outbound.production_task_id);
    if (direct && outbound.reference_type === 'production_task') ids.add(direct);
    const sourceIds = parseJson(context.sourceTaskIds || outbound.source_task_ids, []);
    if (Array.isArray(sourceIds)) {
      sourceIds
        .map(positiveId)
        .filter(Boolean)
        .forEach((id) => ids.add(id));
    }
    if (outbound.reference_type === 'production_task' && outbound.reference_id) {
      const id = positiveId(outbound.reference_id);
      if (id) ids.add(id);
    }
    return [...ids];
  }

  static async reverseOutboundGLEntries(connection, outboundNo, operator) {
    const [entries] = await connection.execute(
      `SELECT id
         FROM gl_entries
        WHERE document_number = ?
          AND COALESCE(is_posted, 0) = 1
          AND COALESCE(is_reversed, 0) = 0
          AND NOT EXISTS (
            SELECT 1 FROM gl_entries reversal
             WHERE reversal.reversal_entry_id = gl_entries.id
          )
        ORDER BY id ASC
        FOR UPDATE`,
      [outboundNo]
    );
    if (!entries.length) {
      throw new Error(`出库单 ${outboundNo} 没有可冲销的有效财务凭证，已阻止反审核`);
    }
    const financeModel = require('../../models/finance');
    const today = currentDateString();
    for (const entry of entries) {
      await financeModel.reverseEntry(
        entry.id,
        {
          entry_date: today,
          posting_date: today,
          description: `出库反审核 ${outboundNo}`,
          created_by: operator,
        },
        connection
      );
    }
    return { reversedCount: entries.length, errors: [] };
  }

  static async closeTransfer(connection, context) {
    const transfer = await this.findByIdOrNo(
      connection,
      context.sourceId,
      context.sourceNo,
      `SELECT id, transfer_no, status
         FROM inventory_transfers
        WHERE (id = ? OR transfer_no = ?) AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE`
    );
    if (!transfer) throw new Error(`调拨单 ${context.sourceNo} 不存在，无法完成反审核收尾`);
    await connection.execute(
      `UPDATE inventory_transfers SET status = 'reversed', updated_at = NOW()
        WHERE id = ? AND deleted_at IS NULL`,
      [transfer.id]
    );
    const financeReversal = await this.reverseRelatedVouchers(connection, {
      sourceType: context.sourceType,
      sourceId: transfer.id,
      sourceNo: transfer.transfer_no,
      operator: 'system',
      reason: `库存调拨反审核 ${transfer.transfer_no}`,
    });
    return {
      sourceType: context.sourceType,
      sourceId: transfer.id,
      businessClosed: true,
      financeReversal,
      warnings: [],
    };
  }

  static async closeSalesOutbound(connection, context, actor) {
    const outbound = await this.findByIdOrNo(
      connection,
      context.sourceId,
      context.sourceNo,
      `SELECT id, outbound_no, order_id, status, related_orders
         FROM sales_outbound
        WHERE (id = ? OR outbound_no = ?) AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE`
    );
    if (!outbound) throw new Error(`销售出库单 ${context.sourceNo} 不存在，无法完成反审核收尾`);

    await connection.execute(
      `UPDATE sales_outbound SET status = 'reversed', updated_at = NOW()
        WHERE id = ? AND deleted_at IS NULL`,
      [outbound.id]
    );

    const SalesOutboundReversalService = require('./SalesOutboundReversalService');
    const financeCompensation = await SalesOutboundReversalService.compensateFinance(connection, {
      outboundNo: outbound.outbound_no,
      outboundId: outbound.id,
      orderId: outbound.order_id ? Number(outbound.order_id) : null,
      operator: actor.label || 'system',
    });

    const orderIds = new Set();
    if (outbound.order_id) orderIds.add(Number(outbound.order_id));
    const related = parseJson(outbound.related_orders, []);
    if (Array.isArray(related))
      related
        .map(Number)
        .filter((id) => id > 0)
        .forEach((id) => orderIds.add(id));
    const [sourceOrders] = await connection.execute(
      `SELECT DISTINCT source_order_id
         FROM sales_outbound_items
        WHERE outbound_id = ? AND source_order_id IS NOT NULL`,
      [outbound.id]
    );
    sourceOrders
      .map((row) => Number(row.source_order_id))
      .filter((id) => id > 0)
      .forEach((id) => orderIds.add(id));

    const SalesOrderStatusService = require('./SalesOrderStatusService');
    const warnings = [];
    for (const orderId of orderIds) {
      try {
        await SalesOrderStatusService.updateOrderStatus(orderId, connection);
      } catch (error) {
        warnings.push(`销售订单 ${orderId} 状态同步失败: ${error.message}`);
        logger.warn(warnings[warnings.length - 1]);
      }
    }

    try {
      const InventoryReservationService = require('../InventoryReservationService');
      for (const orderId of orderIds) {
        const [orders] = await connection.execute(
          `SELECT id, order_no, status FROM sales_orders
            WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
          [orderId]
        );
        if (!orders.length || ['cancelled', 'completed'].includes(String(orders[0].status)))
          continue;
        const [items] = await connection.execute(
          'SELECT material_id, quantity AS ordered_quantity FROM sales_order_items WHERE order_id = ?',
          [orderId]
        );
        const remaining = [];
        for (const item of items) {
          const [shipped] = await connection.execute(
            `SELECT COALESCE(SUM(sobi.quantity), 0) AS shipped_qty
               FROM sales_outbound_items sobi
               JOIN sales_outbound sob ON sob.id = sobi.outbound_id
              WHERE sob.deleted_at IS NULL
                AND sob.status IN ('processing', 'completed')
                AND sobi.product_id = ?
                AND (sob.order_id = ? OR sobi.source_order_id = ?)`,
            [item.material_id, orderId, orderId]
          );
          const remain = Math.max(
            0,
            Number(item.ordered_quantity || 0) - Number(shipped[0]?.shipped_qty || 0)
          );
          if (remain > 0.0001)
            remaining.push({
              material_id: item.material_id,
              quantity: remain,
              ordered_quantity: remain,
            });
        }
        if (remaining.length) {
          await InventoryReservationService.reserveInventoryForOrder(
            orderId,
            orders[0].order_no,
            remaining,
            actor.id || null,
            connection
          );
        }
      }
    } catch (error) {
      warnings.push(`销售订单库存重预留失败: ${error.message}`);
      logger.warn(warnings[warnings.length - 1]);
    }

    return {
      sourceType: context.sourceType,
      sourceId: outbound.id,
      businessClosed: true,
      financeCompensation,
      relatedOrderIds: [...orderIds],
      warnings,
    };
  }

  static async closeOutsourcedProcessing(connection, context, actor) {
    const processing = await this.findByIdOrNo(
      connection,
      context.sourceId,
      context.sourceNo,
      `SELECT id, processing_no, status
         FROM outsourced_processings
        WHERE (id = ? OR processing_no = ?)
        LIMIT 1
        FOR UPDATE`
    );
    if (!processing) throw new Error(`委外加工单 ${context.sourceNo} 不存在，无法完成反审核收尾`);
    await connection.execute(
      `UPDATE outsourced_processings SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
      [processing.id]
    );

    const VoucherReversalService = require('../finance/VoucherReversalService');
    const { DOCUMENT_LINK_TYPES: DocType } = require('../../constants/documentLinkTypes');
    await VoucherReversalService.reverseBusinessVouchers(connection, {
      sourceType: DocType.OUTSOURCED_PROCESSING,
      sourceId: processing.id,
      documentNumber: processing.processing_no,
      documentType: 'outsourced_issue',
      voidedBy: actor.id || actor.label || null,
      reason: `取消委外加工单 ${processing.processing_no}`,
    });
    return {
      sourceType: context.sourceType,
      sourceId: processing.id,
      businessClosed: true,
      warnings: [],
    };
  }

  static async closeOutsourcedReceipt(connection, context, actor) {
    const receipt = await this.findByIdOrNo(
      connection,
      context.sourceId,
      context.sourceNo,
      `SELECT id, receipt_no, processing_id, status
         FROM outsourced_processing_receipts
        WHERE (id = ? OR receipt_no = ?)
        LIMIT 1
        FOR UPDATE`
    );
    if (!receipt) throw new Error(`委外入库单 ${context.sourceNo} 不存在，无法完成反审核收尾`);

    await connection.execute(
      `UPDATE outsourced_processing_receipts
          SET status = 'cancelled', updated_at = NOW()
        WHERE id = ?`,
      [receipt.id]
    );

    const VoucherReversalService = require('../finance/VoucherReversalService');
    const { DOCUMENT_LINK_TYPES: DocType } = require('../../constants/documentLinkTypes');
    await VoucherReversalService.reverseBusinessVouchers(connection, {
      sourceType: DocType.OUTSOURCED_RECEIPT,
      sourceId: receipt.id,
      documentNumber: receipt.receipt_no,
      documentType: 'outsourced_receipt',
      voidedBy: actor.id || actor.label || null,
      reason: `取消委外入库单 ${receipt.receipt_no}`,
    });

    // 该入库可能是加工单自动完成的最后一批。冲销后重新按“有效完成入库”判断，
    // 防止加工单仍显示完成而库存已经被冲回。
    if (receipt.processing_id) {
      const [processingRows] = await connection.execute(
        `SELECT id, status
           FROM outsourced_processings
          WHERE id = ?
          FOR UPDATE`,
        [receipt.processing_id]
      );
      const processing = processingRows[0];
      if (processing?.status === 'completed') {
        const [incompleteRows] = await connection.execute(
          `SELECT COUNT(*) AS incomplete_count
             FROM (
               SELECT opp.product_id,
                      SUM(opp.quantity) AS ordered_quantity,
                      COALESCE(received.received_quantity, 0) AS received_quantity
                 FROM outsourced_processing_products opp
                 LEFT JOIN (
                   SELECT opri.product_id,
                          SUM(opri.actual_quantity) AS received_quantity
                     FROM outsourced_processing_receipt_items opri
                     INNER JOIN outsourced_processing_receipts opr
                       ON opr.id = opri.receipt_id
                    WHERE opr.processing_id = ?
                      AND opr.status = 'completed'
                    GROUP BY opri.product_id
                 ) received
                   ON received.product_id = opp.product_id
                WHERE opp.processing_id = ?
                GROUP BY opp.product_id, received.received_quantity
               HAVING COALESCE(received.received_quantity, 0) + 0.000001 < SUM(opp.quantity)
             ) incomplete_products`,
          [receipt.processing_id, receipt.processing_id]
        );
        if (Number(incompleteRows[0]?.incomplete_count || 0) > 0) {
          await connection.execute(
            `UPDATE outsourced_processings
                SET status = 'in_progress', updated_at = NOW()
              WHERE id = ? AND status = 'completed'`,
            [receipt.processing_id]
          );
        }
      }
    }

    return {
      sourceType: context.sourceType,
      sourceId: receipt.id,
      businessClosed: true,
      warnings: [],
    };
  }

  static async reverseRelatedVouchers(
    connection,
    { sourceType, sourceId, sourceNo, operator, reason }
  ) {
    const financeModel = require('../../models/finance');
    const [entries] = await connection.execute(
      `SELECT id
         FROM gl_entries
        WHERE COALESCE(is_posted, 0) = 1
          AND COALESCE(is_reversed, 0) = 0
          AND (document_number = ? OR document_number LIKE CONCAT(?, '-%'))
          AND NOT EXISTS (
            SELECT 1 FROM gl_entries reversal
             WHERE reversal.reversal_entry_id = gl_entries.id
          )
        ORDER BY id ASC
        FOR UPDATE`,
      [sourceNo, sourceNo]
    );
    if (!entries.length) {
      throw new Error(`来源单 ${sourceNo || sourceId} 没有可冲销的有效财务凭证，已阻止反审核`);
    }
    const results = [];
    for (const entry of entries) {
      const reversalEntryId = await financeModel.reverseEntry(
        entry.id,
        {
          entry_date: currentDateString(),
          posting_date: currentDateString(),
          description: reason,
          created_by: operator,
        },
        connection
      );
      results.push({ originalEntryId: entry.id, entryId: reversalEntryId });
    }
    return { sourceType, sourceId, reversedCount: results.length, entries: results };
  }

  static async findByIdOrNo(connection, sourceId, sourceNo, sql) {
    const [rows] = await connection.execute(sql, [sourceId || 0, sourceNo || '']);
    return rows[0] || null;
  }
}

module.exports = InventoryPostingReversalClosureService;
