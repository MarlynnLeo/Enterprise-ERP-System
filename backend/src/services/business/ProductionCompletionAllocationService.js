'use strict';

const { currentDateString } = require('../../utils/dateUtils');
const Precision = require('../../utils/precision');

class ProductionCompletionAllocationService {
  static async getActiveInboundQuantity(connection, taskId) {
    const [rows] = await connection.execute(
      `SELECT ib.id AS inbound_id, ib.inbound_no, d.id AS posting_id,
              d.finance_status, d.locked, l.id AS line_id, l.posted_quantity
         FROM inventory_inbound ib
         LEFT JOIN quality_inspections qi ON qi.id = ib.inspection_id
         LEFT JOIN inventory_posting_documents d ON d.id = (
           SELECT latest.id FROM inventory_posting_documents latest
            WHERE latest.source_type = 'inbound' AND latest.posting_kind = 'movement'
              AND (latest.source_id = ib.id OR (latest.source_id IS NULL
                AND latest.source_no COLLATE utf8mb4_unicode_ci = ib.inbound_no COLLATE utf8mb4_unicode_ci))
            ORDER BY latest.posting_sequence DESC, latest.id DESC LIMIT 1
         )
         LEFT JOIN inventory_posting_lines l ON l.posting_document_id = d.id
        WHERE ib.inbound_type = 'production'
          AND COALESCE(ib.is_deleted, 0) = 0 AND ib.deleted_at IS NULL
          AND ib.status IN ('confirmed', 'completed')
          AND ((ib.reference_type IN ('production_task', 'production') AND ib.reference_id = ?)
            OR (qi.inspection_type = 'final' AND (qi.reference_id = ? OR qi.task_id = ?)))
        ORDER BY ib.id, l.id FOR UPDATE`,
      [taskId, taskId, taskId]
    );
    let quantity = 0;
    for (const row of rows) {
      if (
        row.finance_status !== 'approved' ||
        Number(row.locked) !== 1 ||
        !row.line_id ||
        row.posted_quantity == null ||
        !(Number(row.posted_quantity) > 0)
      ) {
        throw Object.assign(
          new Error(`生产入库 ${row.inbound_no} 尚无完整已审核锁定过账，不能分摊或冲销完工成本`),
          { statusCode: 409, code: 'INVENTORY_POSTING_PENDING' }
        );
      }
      quantity = Precision.add(quantity, Number(row.posted_quantity));
    }
    return quantity;
  }

  static transferAmount(totalCost, producedQuantity, inboundQuantity) {
    if (
      ![totalCost, producedQuantity, inboundQuantity].every(Number.isFinite) ||
      totalCost < 0 ||
      !(producedQuantity > 0) ||
      inboundQuantity < 0 ||
      inboundQuantity > producedQuantity + 0.0001
    ) {
      throw new Error('生产入库数量与完工数量不一致，不能分摊完工成本');
    }
    return Precision.round(
      Precision.mul(totalCost, Precision.div(inboundQuantity, producedQuantity)),
      2
    );
  }

  // Reverse only FG/WIP completion transfer. Labor/material/overhead remain incurred WIP costs.
  static async reverseInbound(
    connection,
    { taskId, inbound, operator, originalPostingDocumentId }
  ) {
    const finance = require('../../models/finance');
    const GLService = require('../finance/GLService');
    const [entries] = await connection.execute(
      `SELECT id, document_type, document_number, created_by, voucher_word
         FROM gl_entries WHERE transaction_type = 'PRODUCTION_COMPLETE'
          AND transaction_id = ? AND COALESCE(is_posted, 0) = 1
          AND COALESCE(is_reversed, 0) = 0 FOR UPDATE`,
      [taskId]
    );
    if (entries.length !== 1) {
      throw new Error(`生产任务 ${taskId} 缺少唯一有效完工成本凭证，已阻止反审核`);
    }
    const entry = entries[0];
    const [items] = await connection.execute(
      'SELECT * FROM gl_entry_items WHERE entry_id = ? ORDER BY line_number, id FOR UPDATE',
      [entry.id]
    );
    if (
      items.length !== 2 ||
      !items.some((item) => Number(item.debit_amount) > 0) ||
      !items.some((item) => Number(item.credit_amount) > 0)
    ) {
      throw new Error('完工成本凭证不是标准库存商品/在制品分录，不能自动分摊冲销');
    }
    const [sourceRows] = await connection.execute(
      `SELECT l.posted_quantity FROM inventory_posting_documents d
         JOIN inventory_posting_lines l ON l.posting_document_id = d.id
        WHERE d.id = ? AND d.source_id = ? AND d.source_type = 'inbound'
          AND d.posting_kind = 'movement' AND d.finance_status = 'reversed' AND d.locked = 1
        ORDER BY l.id FOR UPDATE`,
      [originalPostingDocumentId, inbound.id]
    );
    if (
      !sourceRows.length ||
      sourceRows.some((row) => row.posted_quantity == null || !(Number(row.posted_quantity) > 0))
    ) {
      throw new Error('冲销入库单缺少已锁定的原始实物过账数量');
    }
    const reversedQuantity = sourceRows.reduce(
      (sum, row) => Precision.add(sum, Number(row.posted_quantity)),
      0
    );
    const remainingQuantity = await this.getActiveInboundQuantity(connection, taskId);
    const originalAmount = items.reduce(
      (sum, item) => Precision.add(sum, Number(item.debit_amount || 0)),
      0
    );
    const [taskRows] = await connection.execute(
      'SELECT actual_cost, completed_quantity, quantity FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [taskId]
    );
    const task = taskRows[0];
    const expectedAmount = this.transferAmount(
      Number(task?.actual_cost),
      Number(task?.completed_quantity || task?.quantity),
      remainingQuantity + reversedQuantity
    );
    if (Math.abs(originalAmount - expectedAmount) > 0.005) {
      throw Object.assign(new Error('原完工成本凭证与已过账入库数量不一致，不能自动分摊冲销'), {
        statusCode: 409,
        code: 'PRODUCTION_COST_ALLOCATION_MISMATCH',
      });
    }
    const retainedAmount = this.transferAmount(
      Number(task.actual_cost),
      Number(task.completed_quantity || task.quantity),
      remainingQuantity
    );
    const date = currentDateString();
    const reversalEntryId = await finance.reverseEntry(
      entry.id,
      {
        entry_date: date,
        posting_date: date,
        created_by: operator,
        description: `入库 ${inbound.inbound_no} 冲销 ${reversedQuantity}，保留 ${remainingQuantity} 件完工成本`,
      },
      connection
    );
    // Free the transaction identity for the replacement, retaining the audited original.
    await connection.execute(
      "UPDATE gl_entries SET transaction_type = 'PRODUCTION_COMPLETE_REVERSED', transaction_id = NULL WHERE id = ?",
      [entry.id]
    );
    let retainedEntryId = null;
    if (retainedAmount > 0) {
      retainedEntryId = await GLService.createEntry(
        {
          entry_date: date,
          posting_date: date,
          document_type: entry.document_type,
          document_number: entry.document_number,
          transaction_type: 'PRODUCTION_COMPLETE',
          transaction_id: taskId,
          created_by: entry.created_by,
          voucher_word: entry.voucher_word || '转',
          status: 'posted',
          is_posted: 1,
          description: `入库 ${inbound.inbound_no} 冲销后保留 ${remainingQuantity} 件完工成本`,
        },
        items.map((item) => ({
          account_id: item.account_id,
          cost_center_id: item.cost_center_id,
          project_id: item.project_id,
          currency_code: item.currency_code,
          exchange_rate: item.exchange_rate,
          debit_amount: Number(item.debit_amount) > 0 ? retainedAmount : 0,
          credit_amount: Number(item.credit_amount) > 0 ? retainedAmount : 0,
          description: `保留 ${remainingQuantity} 件库存成本`,
        })),
        connection
      );
    }
    return {
      reversedCount: 1,
      entries: [{ originalEntryId: entry.id, entryId: reversalEntryId }],
      retainedEntryId,
      remainingQuantity,
      reversedQuantity,
      retainedAmount,
    };
  }
}

module.exports = ProductionCompletionAllocationService;
