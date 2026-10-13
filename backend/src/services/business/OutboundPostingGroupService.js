'use strict';

const failure = (message, code = 'OUTBOUND_POSTING_CONFLICT') =>
  Object.assign(new Error(message), { statusCode: 409, code });

/** A business outbound and its independently approved supplements form one reversal unit. */
class OutboundPostingGroupService {
  static scopeSql(alias = 'd') {
    if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error('Invalid posting alias');
    return `((${alias}.source_type = 'outbound' AND (${alias}.source_id = ? OR (${alias}.source_id IS NULL AND ${alias}.source_no = ?)))
      OR (${alias}.source_type = 'outbound_supplement' AND (${alias}.source_id = ? OR (${alias}.source_id IS NULL AND ${alias}.source_no = CONCAT(?, '-补发')))))`;
  }

  static scopeParams(outbound) {
    return [Number(outbound.id), outbound.outbound_no, Number(outbound.id), outbound.outbound_no];
  }

  static latestMovements(documents) {
    const latest = new Map();
    for (const document of documents) {
      if (document.posting_kind !== 'movement') continue;
      const key = `${document.source_type}:${document.source_no}`;
      const previous = latest.get(key);
      if (
        !previous ||
        Number(document.posting_sequence) > Number(previous.posting_sequence) ||
        (Number(document.posting_sequence || 1) === Number(previous.posting_sequence || 1) &&
          Number(document.id) > Number(previous.id))
      )
        latest.set(key, document);
    }
    return [...latest.values()].sort((a, b) => Number(a.id) - Number(b.id));
  }

  static selectCurrent(documents) {
    const latest = this.latestMovements(documents);
    return (
      latest.find((document) => document.finance_status === 'pending') ||
      [...latest].reverse().find((document) => document.finance_status === 'rejected') ||
      latest.find(
        (document) => document.source_type === 'outbound' && document.finance_status === 'approved'
      ) ||
      [...latest].reverse().find((document) => document.finance_status === 'approved') ||
      latest.at(-1) ||
      null
    );
  }

  static async load(connection, outbound) {
    const [documents] = await connection.execute(
      `SELECT d.* FROM inventory_posting_documents d WHERE ${this.scopeSql()} ORDER BY d.id FOR UPDATE`,
      this.scopeParams(outbound)
    );
    return documents;
  }

  static async lockSource(connection, input) {
    const type = input.source_type || input.sourceType;
    if (!['outbound', 'outbound_supplement'].includes(type)) return null;
    const sourceId = Number(input.source_id || input.sourceId) || 0;
    let sourceNo = input.source_no || input.sourceNo || '';
    if (type === 'outbound_supplement')
      sourceNo = sourceNo.endsWith('-补发') ? sourceNo.slice(0, -3) : '';
    const [[outbound]] = await connection.execute(
      `SELECT id, outbound_no, status, reference_type, reference_id, production_task_id, source_task_ids,
              outbound_type, is_batch_outbound, operator
         FROM inventory_outbound WHERE (id = ? OR outbound_no = ?) AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
      [sourceId, sourceNo]
    );
    if (!outbound) throw failure('补发关联的出库单不存在，无法处理库存过账');
    return outbound;
  }

  static async assertWritable(connection, input) {
    const outbound = await this.lockSource(connection, input);
    if (!outbound) return null;
    if (['cancelled', 'reversed'].includes(outbound.status))
      throw failure('出库单已取消或冲销，不能继续补发或审核');
    const [pending] = await connection.execute(
      `SELECT d.id FROM inventory_posting_documents d WHERE ${this.scopeSql()}
         AND d.posting_kind = 'reversal' AND d.finance_status = 'pending' LIMIT 1 FOR UPDATE`,
      this.scopeParams(outbound)
    );
    if (pending.length) throw failure('该出库单正在反审核，暂不能补发、重提或审核库存');
    return outbound;
  }

  static async resubmit(connection, { outbound, actor }) {
    await this.assertWritable(connection, {
      sourceType: 'outbound',
      sourceId: outbound.id,
      sourceNo: outbound.outbound_no,
    });
    const rejected = this.latestMovements(await this.load(connection, outbound)).filter(
      (document) => document.finance_status === 'rejected'
    );
    const service = require('./InventoryPostingResubmissionService');
    const results = [];
    for (const document of rejected) {
      const result = await service.resubmit(connection, {
        sourceType: document.source_type,
        sourceId: outbound.id,
        sourceNo: document.source_no,
        actor,
      });
      if (result) results.push(result);
    }
    return results;
  }

  static fingerprint(documents) {
    return JSON.stringify(
      this.latestMovements(documents).map((document) => [
        Number(document.id),
        document.finance_status,
      ])
    );
  }

  static async prepareReversal(connection, original, actor, context, postingService) {
    if (!['outbound', 'outbound_supplement'].includes(original.source_type)) return null;
    if (original.source_type === 'outbound_supplement' && !context.outboundGroupRequest) {
      throw failure('补发必须随原出库单整单撤销，请从原出库单申请撤销');
    }
    const outbound = await this.assertWritable(connection, original);
    await require('./InventoryPostingReversalClosureService').assertOutboundReversalAllowed(
      connection,
      outbound,
      context
    );
    const documents = await this.load(connection, outbound);
    const movements = this.latestMovements(documents);
    const approved = movements.filter((document) => document.finance_status === 'approved');
    for (const document of approved) postingService._assertActorCanApprove(document, actor);
    if (!approved.some((document) => Number(document.id) === Number(original.id)))
      throw failure('出库审核记录已改变，请刷新后重新申请');
    return {
      sourceId: Number(outbound.id),
      sourceNo: outbound.outbound_no,
      approvedIds: approved.map((document) => Number(document.id)),
      unpostedIds: movements
        .filter((document) => ['pending', 'rejected'].includes(document.finance_status))
        .map((document) => Number(document.id)),
      sourceNos: approved.map((document) => document.source_no),
      fingerprint: this.fingerprint(documents),
    };
  }

  static async validateReversal(connection, group, reversal, actor, postingService) {
    const outbound = await this.lockSource(connection, {
      sourceType: 'outbound',
      sourceId: group.sourceId,
      sourceNo: group.sourceNo,
    });
    const documents = await this.load(connection, outbound);
    if (this.fingerprint(documents) !== group.fingerprint)
      throw failure('出库单或补发的审批记录已变化，请驳回本次撤销后重新申请');
    const approved = documents.filter((document) =>
      group.approvedIds.includes(Number(document.id))
    );
    if (approved.length !== group.approvedIds.length) throw failure('整单撤销缺少原库存过账记录');
    for (const document of approved)
      postingService._assertReversalActorCanApprove(reversal, document, actor);
  }

  static async finishReversal(connection, group, anchorId, actor, reversalId) {
    for (const id of group.approvedIds.filter((id) => id !== Number(anchorId))) {
      const [result] = await connection.execute(
        `UPDATE inventory_posting_documents SET finance_status = 'reversed', reversed_by = ?, reversed_label = ?,
           reversed_at = NOW(), updated_at = NOW() WHERE id = ? AND finance_status = 'approved' AND locked = 1`,
        [actor.id, actor.label, id]
      );
      if (result.affectedRows !== 1) throw failure('补发过账状态已变化，整单撤销已回滚');
      await this.recordClosure(
        connection,
        id,
        'finance_reversed',
        'approved',
        'reversed',
        actor,
        reversalId
      );
    }
    for (const id of group.unpostedIds) {
      await connection.execute(
        `UPDATE inventory_posting_documents SET finance_status = 'rejected', rejected_by = ?, rejected_label = ?,
           rejected_at = NOW(), updated_at = NOW() WHERE id = ? AND finance_status IN ('pending', 'rejected')`,
        [actor.id, actor.label, id]
      );
      await this.recordClosure(
        connection,
        id,
        'finance_rejected',
        null,
        'rejected',
        actor,
        reversalId
      );
    }
  }

  static async recordClosure(connection, id, eventType, previous, next, actor, reversalId) {
    await connection.execute(
      `INSERT INTO inventory_posting_events (posting_document_id, event_type, from_status, to_status, actor_id, actor_label, remark, event_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        eventType,
        previous,
        next,
        actor.id,
        actor.label,
        '原出库单整单反审核',
        JSON.stringify({ reversalDocumentId: reversalId }),
      ]
    );
  }

  static async requestReversal(connection, { outbound, actor, remark, context = {} }) {
    await this.lockSource(connection, {
      sourceType: 'outbound',
      sourceId: outbound.id,
      sourceNo: outbound.outbound_no,
    });
    const documents = await this.load(connection, outbound);
    const approved = this.latestMovements(documents).filter(
      (document) => document.finance_status === 'approved'
    );
    const anchor = approved.find((document) => document.source_type === 'outbound') || approved[0];
    if (!anchor) throw failure('该出库单及补发没有已审核库存，请先完成或处理财务审核');
    return require('../InventoryPostingService').requestReversal(
      anchor.id,
      actor,
      remark,
      { ...context, outboundGroupRequest: true },
      connection
    );
  }
}

module.exports = OutboundPostingGroupService;
