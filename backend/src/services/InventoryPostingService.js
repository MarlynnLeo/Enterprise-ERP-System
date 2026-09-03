'use strict';

const crypto = require('crypto');
const db = require('../config/db');
const Precision = require('../utils/precision');
const { INTERNAL_POSTING_TOKEN } = require('./inventoryPostingContext');
const { getRequestActorLabel } = require('../utils/userUtils');
const { parsePagination, appendPaginationSQL } = require('../utils/safePagination');

const STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REVERSED: 'reversed',
});

const POSTING_KIND = Object.freeze({ MOVEMENT: 'movement', REVERSAL: 'reversal' });

function hashSnapshot(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function actorFrom(input = {}) {
  const actorId = input.id ?? input.userId ?? input.user_id ?? null;
  const label = input.label ?? input.name ?? input.username ?? actorId ?? 'system';
  return { id: actorId ? Number(actorId) || null : null, label: String(label) };
}

function serviceError(message, statusCode = 400, code = 'VALIDATION_ERROR') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

class InventoryPostingService {
  static STATUS = STATUS;
  static POSTING_KIND = POSTING_KIND;

  static async _nextPostingNo(connection, sourceNo, kind = POSTING_KIND.MOVEMENT) {
    const prefix = kind === POSTING_KIND.REVERSAL ? 'IRV' : 'INV';
    const digest = crypto
      .createHash('sha256')
      .update(`${sourceNo}|${kind}|${Date.now()}|${Math.random()}`)
      .digest('hex')
      .slice(0, 24)
      .toUpperCase();
    return `${prefix}-${digest}`;
  }

  static async _getOrCreateDocument(connection, input) {
    const sourceType = String(
      input.sourceType || input.referenceType || input.transactionType || 'inventory'
    );
    const sourceNo = String(input.sourceNo || input.referenceNo || '').trim();
    if (!sourceNo) throw serviceError('库存过账缺少来源单号');
    const kind = input.postingKind || POSTING_KIND.MOVEMENT;
    const originalId = input.originalPostingDocumentId || null;

    let postingSequence = Number(input.postingSequence || 1);
    const [existing] = await connection.execute(
      `SELECT * FROM inventory_posting_documents
        WHERE source_type = ? AND source_no = ? AND posting_kind = ?
          AND posting_sequence = ?
        ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [sourceType, sourceNo, kind, postingSequence]
    );
    if (existing.length && existing[0].finance_status !== STATUS.REJECTED) return existing[0];
    if (existing.length && existing[0].finance_status === STATUS.REJECTED) {
      const [[sequenceRow]] = await connection.execute(
        `SELECT COALESCE(MAX(posting_sequence), 0) + 1 AS next_sequence
           FROM inventory_posting_documents
          WHERE source_type = ? AND source_no = ? AND posting_kind = ?
          FOR UPDATE`,
        [sourceType, sourceNo, kind]
      );
      postingSequence = Number(sequenceRow?.next_sequence || postingSequence + 1);
    }

    const postingNo = input.postingNo || (await this._nextPostingNo(connection, sourceNo, kind));
    const [result] = await connection.execute(
      `INSERT INTO inventory_posting_documents (
         posting_no, source_type, source_id, source_no, posting_sequence, posting_kind,
         original_posting_document_id, movement_direction, transaction_date, finance_status,
         business_approved_by_id, business_approved_by, business_approved_at,
         snapshot_version, locked, is_legacy, remark, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1, 0, 0, ?, NOW(), NOW())`,
      [
        postingNo,
        sourceType,
        input.sourceId || null,
        sourceNo,
        postingSequence,
        kind,
        originalId,
        input.movementDirection || 'mixed',
        input.transactionDate,
        input.financeStatus || STATUS.PENDING,
        input.businessApprovedById || null,
        input.businessApprovedBy || input.operator || 'system',
        input.remark || null,
      ]
    );
    const documentResult = await connection.execute(
      'SELECT * FROM inventory_posting_documents WHERE id = ? FOR UPDATE',
      [result.insertId]
    );
    const document = Array.isArray(documentResult?.[0])
      ? documentResult[0][0]
      : {
          id: result.insertId,
          posting_no: postingNo,
          source_type: sourceType,
          source_no: sourceNo,
          finance_status: input.financeStatus || STATUS.PENDING,
        };
    await connection.execute(
      `INSERT INTO inventory_posting_events
         (posting_document_id, event_type, from_status, to_status, actor_id, actor_label, remark, event_data)
       VALUES (?, 'business_approved', NULL, ?, ?, ?, ?, JSON_OBJECT('sourceType', ?, 'sourceNo', ?))`,
      [
        document.id,
        document.finance_status,
        input.businessApprovedById || null,
        input.businessApprovedBy || input.operator || 'system',
        input.remark || null,
        sourceType,
        sourceNo,
      ]
    );
    return document;
  }

  /**
   * Record a business-approved movement without touching the formal ledger.
   * InventoryService calls this for every legacy stock-producing entry point.
   */
  static async stageMovement(connection, input, lines) {
    if (!connection) throw new Error('stageMovement必须在数据库事务中调用');
    if (!Array.isArray(lines) || !lines.length) throw serviceError('库存过账没有可冻结的明细');

    const document = await this._getOrCreateDocument(connection, input);
    if (
      document.finance_status === STATUS.APPROVED ||
      document.finance_status === STATUS.REVERSED
    ) {
      throw serviceError(
        `过账单 ${document.posting_no} 已财务审核锁定，不能追加或修改明细`,
        409,
        'POSTING_LOCKED'
      );
    }
    if (document.finance_status === STATUS.REJECTED) {
      throw serviceError(
        `过账单 ${document.posting_no} 已驳回，请重新提交业务单据`,
        409,
        'POSTING_REJECTED'
      );
    }

    const sequenceResult = await connection.execute(
      'SELECT COALESCE(MAX(line_no), 0) AS max_line_no FROM inventory_posting_lines WHERE posting_document_id = ? FOR UPDATE',
      [document.id]
    );
    const sequenceRow = Array.isArray(sequenceResult?.[0]) ? sequenceResult[0][0] : null;
    let lineNo = Number(sequenceRow?.max_line_no || 0);
    const lineIds = [];
    let totalQuantity = 0;
    let totalValue = 0;

    for (const line of lines) {
      lineNo += 1;
      const payload = {
        materialId: line.materialId,
        locationId: line.locationId,
        transactionType: line.transactionType,
        referenceType: line.referenceType,
        referenceNo: line.referenceNo,
        signedQuantity: Number(line.signedQuantity),
        unitId: line.unitId || null,
        batchNumber: line.batchNumber || null,
        unitCost: line.unitCost == null ? null : Number(line.unitCost),
        totalValue: line.totalValue == null ? null : Number(line.totalValue),
        transactionDate: line.transactionDate,
        operator: line.operator,
        sourceLineKey: line.sourceLineKey || null,
        reversalOfLedgerId: line.reversalOfLedgerId || null,
      };
      const snapshotHash = hashSnapshot(payload);
      const sourceLineKey =
        line.sourceLineKey ||
        [
          payload.transactionType,
          payload.referenceType,
          payload.referenceNo,
          payload.materialId,
          payload.locationId,
          payload.batchNumber || 'EMPTY',
        ].join(':');
      const existingLineResult = await connection.execute(
        `SELECT id, snapshot_hash FROM inventory_posting_lines
          WHERE posting_document_id = ? AND source_line_key = ? FOR UPDATE`,
        [document.id, sourceLineKey]
      );
      const existingLine = Array.isArray(existingLineResult?.[0]) ? existingLineResult[0][0] : null;
      if (existingLine) {
        if (String(existingLine.snapshot_hash) !== snapshotHash) {
          throw serviceError(
            `冻结明细 ${sourceLineKey} 已改变，不能覆盖原快照`,
            409,
            'SNAPSHOT_IMMUTABLE'
          );
        }
        lineIds.push(existingLine.id);
        continue;
      }
      const [result] = await connection.execute(
        `INSERT INTO inventory_posting_lines (
           posting_document_id, line_no, source_line_key, material_id, location_id,
           transaction_type, reference_type, reference_no, signed_quantity, unit_id,
           batch_number, unit_cost, total_value, transaction_date, operator,
           payload_json, snapshot_hash, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          document.id,
          lineNo,
          sourceLineKey,
          payload.materialId,
          payload.locationId,
          payload.transactionType,
          payload.referenceType,
          payload.referenceNo,
          payload.signedQuantity,
          payload.unitId,
          payload.batchNumber,
          payload.unitCost,
          payload.totalValue,
          payload.transactionDate,
          payload.operator,
          JSON.stringify(payload),
          snapshotHash,
        ]
      );
      lineIds.push(result.insertId);
      totalQuantity = Precision.add(totalQuantity, Math.abs(payload.signedQuantity));
      totalValue = Precision.add(totalValue, Math.abs(payload.totalValue || 0));
    }

    await connection.execute(
      `UPDATE inventory_posting_documents
          SET total_quantity = total_quantity + ?,
              total_value = COALESCE(total_value, 0) + ?,
              snapshot_hash = SHA2(CONCAT(COALESCE(snapshot_hash, ''), ?, ?), 256),
              updated_at = NOW()
        WHERE id = ? AND finance_status = ?`,
      [totalQuantity, totalValue, document.id, lineIds.join(','), document.id, STATUS.PENDING]
    );

    return { documentId: document.id, postingNo: document.posting_no, lineIds, staged: true };
  }

  static async list(query = {}, connection = db.pool) {
    const pagination = parsePagination(query.page, query.pageSize, {
      defaultPageSize: 20,
      maxPageSize: 100,
    });
    const where = [];
    const params = [];
    if (query.financeStatus) {
      where.push('d.finance_status = ?');
      params.push(query.financeStatus);
    }
    if (query.sourceType) {
      where.push('d.source_type = ?');
      params.push(query.sourceType);
    }
    if (query.keyword) {
      where.push('(d.posting_no LIKE ? OR d.source_no LIKE ?)');
      params.push(`%${query.keyword}%`, `%${query.keyword}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[count]] = await connection.execute(
      `SELECT COUNT(*) AS total FROM inventory_posting_documents d ${whereSql}`,
      params
    );
    const listSql = appendPaginationSQL(
      `SELECT d.*,
              (SELECT COUNT(*) FROM inventory_posting_lines l WHERE l.posting_document_id = d.id) AS line_count
         FROM inventory_posting_documents d
        ${whereSql}
        ORDER BY d.created_at DESC, d.id DESC`,
      pagination.limit,
      pagination.offset
    );
    const [rows] = await connection.execute(listSql, params);
    return {
      list: rows,
      total: Number(count?.total || 0),
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  static async get(id, connection = db.pool) {
    const [[document]] = await connection.execute(
      'SELECT * FROM inventory_posting_documents WHERE id = ?',
      [id]
    );
    if (!document) throw serviceError('库存过账单不存在', 404, 'NOT_FOUND');
    const [lines] = await connection.execute(
      'SELECT * FROM inventory_posting_lines WHERE posting_document_id = ? ORDER BY line_no',
      [id]
    );
    const [events] = await connection.execute(
      'SELECT * FROM inventory_posting_events WHERE posting_document_id = ? ORDER BY id',
      [id]
    );
    return { ...document, lines, events };
  }

  static async findApprovedForTransaction(connection, transaction = {}) {
    if (!connection) throw new Error('查找库存过账单必须提供数据库连接');
    const postingDocumentId = transaction.posting_document_id || transaction.postingDocumentId;
    if (postingDocumentId) {
      const [[document]] = await connection.execute(
        `SELECT * FROM inventory_posting_documents
          WHERE id = ? AND finance_status = ? AND locked = 1`,
        [postingDocumentId, STATUS.APPROVED]
      );
      return document || null;
    }

    const referenceNo = String(transaction.reference_no || transaction.referenceNo || '').trim();
    if (!referenceNo) return null;
    const referenceType = String(
      transaction.reference_type || transaction.referenceType || ''
    ).trim();
    const transactionType = String(
      transaction.transaction_type || transaction.transactionType || ''
    ).trim();
    const [rows] = await connection.execute(
      `SELECT DISTINCT d.*
         FROM inventory_posting_documents d
         JOIN inventory_posting_lines l ON l.posting_document_id = d.id
        WHERE l.reference_no = ?
          AND d.finance_status = ?
          AND d.locked = 1
          AND d.posting_kind = 'movement'
          AND (
            ? = '' OR d.source_type = ? OR l.reference_type = ? OR l.transaction_type = ?
          )
        ORDER BY d.posting_sequence DESC, d.id DESC
        LIMIT 1`,
      [referenceNo, STATUS.APPROVED, referenceType, referenceType, referenceType, transactionType]
    );
    if (rows[0]) return rows[0];

    const [fallbackRows] = await connection.execute(
      `SELECT DISTINCT d.*
         FROM inventory_posting_documents d
         JOIN inventory_posting_lines l ON l.posting_document_id = d.id
        WHERE l.reference_no = ?
          AND d.finance_status = ?
          AND d.locked = 1
          AND d.posting_kind = 'movement'
        ORDER BY d.posting_sequence DESC, d.id DESC
        LIMIT 1`,
      [referenceNo, STATUS.APPROVED]
    );
    return fallbackRows[0] || null;
  }

  static async requireApprovedForTransaction(connection, transaction = {}) {
    const approved = await this.findApprovedForTransaction(connection, transaction);
    if (approved) return approved;

    const referenceNo = String(transaction.reference_no || transaction.referenceNo || '').trim();
    const [pendingRows] = referenceNo
      ? await connection.execute(
          `SELECT d.finance_status
             FROM inventory_posting_documents d
             JOIN inventory_posting_lines l ON l.posting_document_id = d.id
            WHERE l.reference_no = ?
            ORDER BY d.posting_sequence DESC, d.id DESC
            LIMIT 1`,
          [referenceNo]
        )
      : [[]];
    const status = pendingRows[0]?.finance_status;
    const error = new Error(
      status === STATUS.PENDING
        ? `库存来源单 ${referenceNo || '未知'} 尚未完成财务审核，暂不能生成库存成本凭证`
        : `库存来源单 ${referenceNo || '未知'} 没有已锁定的财务过账记录`
    );
    error.code =
      status === STATUS.PENDING ? 'INVENTORY_POSTING_PENDING' : 'INVENTORY_POSTING_REQUIRED';
    error.statusCode = 409;
    throw error;
  }

  /**
   * Reverse the approved posting that owns a business document.
   * All inventory reversal entry points use this helper so they cannot
   * bypass the finance gate by writing directly to inventory_ledger.
   */
  static async reverseBySource(
    connection,
    { sourceNo, sourceType = '', actor, remark = '', context = {} } = {}
  ) {
    const normalizedSourceNo = String(sourceNo || '').trim();
    if (!normalizedSourceNo) throw serviceError('库存冲销缺少来源单号');
    const posting = await this.findApprovedForTransaction(connection, {
      reference_no: normalizedSourceNo,
      reference_type: sourceType,
    });
    if (!posting) {
      const [rows] = await connection.execute(
        `SELECT d.finance_status
           FROM inventory_posting_documents d
          WHERE d.source_no = ?
          ORDER BY d.posting_sequence DESC, d.id DESC
          LIMIT 1`,
        [normalizedSourceNo]
      );
      const status = rows[0]?.finance_status;
      const error = serviceError(
        status === STATUS.PENDING
          ? `库存来源单 ${normalizedSourceNo} 尚未完成财务审核，不能反审核`
          : `库存来源单 ${normalizedSourceNo} 没有可反审核的财务过账记录`,
        409,
        status === STATUS.PENDING ? 'INVENTORY_POSTING_PENDING' : 'INVENTORY_POSTING_REQUIRED'
      );
      throw error;
    }
    return this.requestReversal(posting.id, actor, remark, context, connection);
  }

  static _assertActorCanApprove(document, actor) {
    const normalizedActor = actorFrom(actor);
    if (
      (normalizedActor.id &&
        document.business_approved_by_id &&
        normalizedActor.id === Number(document.business_approved_by_id)) ||
      String(document.business_approved_by || '').trim() === normalizedActor.label.trim()
    ) {
      throw serviceError('制单/业务审核人与财务审核人必须分离', 403, 'SEPARATION_OF_DUTIES');
    }
    return normalizedActor;
  }

  static _assertReversalActorCanApprove(reversal, original, actor) {
    const normalizedActor = actorFrom(actor);
    const forbiddenIds = [
      reversal.business_approved_by_id,
      original.business_approved_by_id,
      original.finance_approved_by,
    ]
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
    const forbiddenLabels = [
      reversal.business_approved_by,
      original.business_approved_by,
      original.finance_approved_label,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    if (
      (normalizedActor.id && forbiddenIds.includes(normalizedActor.id)) ||
      forbiddenLabels.includes(normalizedActor.label.trim())
    ) {
      throw serviceError('反审核申请人与原业务审核人/原财务审核人必须分离', 403, 'SEPARATION_OF_DUTIES');
    }
    return normalizedActor;
  }

  static async _postLines(connection, document, lines, actor) {
    const InventoryService = require('./InventoryService');
    const results = [];
    for (const line of lines) {
      let payload;
      try {
        payload =
          typeof line.payload_json === 'string'
            ? JSON.parse(line.payload_json)
            : line.payload_json || {};
      } catch {
        throw serviceError(`过账明细 ${line.id} 的快照格式无效`, 409, 'SNAPSHOT_INVALID');
      }
      const quantity = Number(line.signed_quantity);
      const result = await InventoryService.updateStock(
        {
          materialId: line.material_id,
          locationId: line.location_id,
          quantity,
          transactionType: line.transaction_type,
          referenceNo: line.reference_no,
          referenceType: line.reference_type,
          operator: line.operator || actor.label,
          unitId: line.unit_id,
          batchNumber: line.batch_number,
          unitCost: line.unit_cost,
          transactionDate: line.transaction_date,
          idempotencyKey: `posting-line:${line.id}`,
          postingDocumentId: document.id,
          postingLineId: line.id,
          reversalOfLedgerId: payload.reversalOfLedgerId || null,
          internalPostingToken: INTERNAL_POSTING_TOKEN,
          allowNegativeStock: false,
        },
        connection
      );
      await connection.execute(
        `UPDATE inventory_posting_lines
            SET posted_quantity = ?, posted_value = ?, updated_at = NOW()
          WHERE id = ? AND posted_quantity IS NULL`,
        [quantity, result.totalValue || line.total_value || 0, line.id]
      );
      results.push(result);
    }
    return results;
  }

  static async approve(id, actor, connection) {
    const ownsConnection = !connection;
    const conn = connection || (await db.getConnection());
    const normalizedActor = actorFrom(actor);
    try {
      if (ownsConnection) await conn.beginTransaction();
      const [[document]] = await conn.execute(
        'SELECT * FROM inventory_posting_documents WHERE id = ? FOR UPDATE',
        [id]
      );
      if (!document) throw serviceError('库存过账单不存在', 404, 'NOT_FOUND');
      if (document.finance_status !== STATUS.PENDING) {
        throw serviceError(
          `当前状态 ${document.finance_status} 不允许财务审核`,
          409,
          'INVALID_STATUS'
        );
      }
      let original = null;
      let reversalContext = {};
      if (document.posting_kind === POSTING_KIND.REVERSAL) {
        if (!document.original_posting_document_id) {
          throw serviceError('冲销过账单缺少原始过账单', 409, 'ORIGINAL_POSTING_REQUIRED');
        }
        const [[originalDocument]] = await conn.execute(
          'SELECT * FROM inventory_posting_documents WHERE id = ? FOR UPDATE',
          [document.original_posting_document_id]
        );
        if (!originalDocument) {
          throw serviceError('原始库存过账单不存在', 409, 'ORIGINAL_POSTING_NOT_FOUND');
        }
        if (
          originalDocument.finance_status !== STATUS.APPROVED ||
          !Number(originalDocument.locked)
        ) {
          throw serviceError('原始库存过账单未处于可冲销状态', 409, 'ORIGINAL_POSTING_INVALID');
        }
        original = originalDocument;
        this._assertReversalActorCanApprove(document, originalDocument, normalizedActor);
        const [requestEvents] = await conn.execute(
          `SELECT event_data
             FROM inventory_posting_events
            WHERE posting_document_id = ?
              AND event_type = 'reversal_requested'
            ORDER BY id DESC
            LIMIT 1`,
          [id]
        );
        if (requestEvents[0]?.event_data) {
          try {
            reversalContext =
              typeof requestEvents[0].event_data === 'string'
                ? JSON.parse(requestEvents[0].event_data)
                : requestEvents[0].event_data;
          } catch {
            reversalContext = {};
          }
        }
      } else {
        this._assertActorCanApprove(document, normalizedActor);
      }
      const [lines] = await conn.execute(
        'SELECT * FROM inventory_posting_lines WHERE posting_document_id = ? ORDER BY line_no FOR UPDATE',
        [id]
      );
      if (!lines.length) throw serviceError('库存过账单没有冻结明细');

      // Mark approved before writing ledger so the database insert guard can enforce the same contract.
      await conn.execute(
        `UPDATE inventory_posting_documents
            SET finance_status = ?, locked = 1, finance_approved_by = ?,
                finance_approved_label = ?, finance_approved_at = NOW(), updated_at = NOW()
          WHERE id = ? AND finance_status = ?`,
        [STATUS.APPROVED, normalizedActor.id, normalizedActor.label, id, STATUS.PENDING]
      );
      const results = await this._postLines(
        conn,
        { ...document, finance_status: STATUS.APPROVED },
        lines,
        normalizedActor
      );
      let approvalEventId = null;
      let DomainEventService = null;
      let closureResult = null;
      if (document.posting_kind === POSTING_KIND.REVERSAL) {
        const [originalUpdate] = await conn.execute(
          `UPDATE inventory_posting_documents
              SET finance_status = ?, reversed_by = ?, reversed_label = ?, reversed_at = NOW(), updated_at = NOW()
            WHERE id = ? AND finance_status = ? AND locked = 1`,
          [
            STATUS.REVERSED,
            normalizedActor.id,
            normalizedActor.label,
            original.id,
            STATUS.APPROVED,
          ]
        );
        if (!originalUpdate.affectedRows) {
          throw serviceError('原始库存过账单已被处理，无法完成反审核', 409, 'CONCURRENT_UPDATE');
        }

        const InventoryPostingReversalClosureService = require('./business/InventoryPostingReversalClosureService');
        closureResult = await InventoryPostingReversalClosureService.close(conn, {
          original: { ...original, finance_status: STATUS.REVERSED },
          reversal: { ...document, finance_status: STATUS.APPROVED },
          context: reversalContext,
          actor: normalizedActor,
        });

        await conn.execute(
          `INSERT INTO inventory_posting_events
             (posting_document_id, event_type, from_status, to_status, actor_id, actor_label, remark, event_data)
           VALUES (?, 'finance_approved', ?, ?, ?, ?, ?, ?)`,
          [
            id,
            STATUS.PENDING,
            STATUS.APPROVED,
            normalizedActor.id,
            normalizedActor.label,
            document.remark || '财务审核冲销申请并正式冲销库存',
            JSON.stringify({
              postingKind: POSTING_KIND.REVERSAL,
              originalPostingDocumentId: original.id,
              sourceType: original.source_type,
              sourceId: reversalContext.sourceId || original.source_id || null,
              sourceNo: original.source_no,
            }),
          ]
        );
        await conn.execute(
          `INSERT INTO inventory_posting_events
             (posting_document_id, event_type, from_status, to_status, actor_id, actor_label, remark, event_data)
           VALUES (?, 'finance_reversed', ?, ?, ?, ?, ?, ?)`,
          [
            original.id,
            STATUS.APPROVED,
            STATUS.REVERSED,
            normalizedActor.id,
            normalizedActor.label,
            document.remark || '财务审核通过，原库存过账已冲销',
            JSON.stringify({ reversalDocumentId: id }),
          ]
        );
      } else {
        await conn.execute(
          `INSERT INTO inventory_posting_events
             (posting_document_id, event_type, from_status, to_status, actor_id, actor_label, remark, event_data)
           VALUES (?, 'finance_approved', ?, ?, ?, ?, ?, ?)`,
          [
            id,
            STATUS.PENDING,
            STATUS.APPROVED,
            normalizedActor.id,
            normalizedActor.label,
            '财务审核通过并正式过账',
            JSON.stringify({
              postingKind: POSTING_KIND.MOVEMENT,
              originalPostingDocumentId: null,
              sourceType: document.source_type,
              sourceId: document.source_id,
              sourceNo: document.source_no,
            }),
          ]
        );
        DomainEventService = require('./business/DomainEventService');
        approvalEventId = await DomainEventService.enqueue(
          'INVENTORY_POSTING_APPROVED',
          {
            postingDocumentId: id,
            postingNo: document.posting_no,
            postingKind: POSTING_KIND.MOVEMENT,
            originalPostingDocumentId: null,
            sourceType: document.source_type,
            sourceId: document.source_id,
            sourceNo: document.source_no,
          },
          {
            connection: conn,
            aggregateType: 'inventory_posting_document',
            aggregateId: id,
            dedupKey: `INVENTORY_POSTING_APPROVED:${id}`,
          }
        );
      }
      if (ownsConnection) await conn.commit();
      if (approvalEventId && DomainEventService) DomainEventService.dispatchSoon(approvalEventId);
      return {
        documentId: id,
        financeStatus: STATUS.APPROVED,
        postedLines: results.length,
        postingKind: document.posting_kind,
        originalDocumentId: original?.id || null,
        originalFinanceStatus: original ? STATUS.REVERSED : null,
        closure: closureResult,
      };
    } catch (error) {
      if (ownsConnection) await conn.rollback();
      throw error;
    } finally {
      if (ownsConnection) conn.release();
    }
  }

  static async reject(id, actor, remark = '', connection) {
    const ownsConnection = !connection;
    const conn = connection || (await db.getConnection());
    const normalizedActor = actorFrom(actor);
    try {
      if (ownsConnection) await conn.beginTransaction();
      const [[document]] = await conn.execute(
        'SELECT * FROM inventory_posting_documents WHERE id = ? FOR UPDATE',
        [id]
      );
      if (!document) throw serviceError('库存过账单不存在', 404, 'NOT_FOUND');
      if (document.finance_status !== STATUS.PENDING)
        throw serviceError('当前状态不能驳回', 409, 'INVALID_STATUS');
      this._assertActorCanApprove(document, normalizedActor);
      await conn.execute(
        `UPDATE inventory_posting_documents
            SET finance_status = ?, rejected_by = ?, rejected_label = ?, rejected_at = NOW(),
                remark = CONCAT(COALESCE(remark, ''), ?), updated_at = NOW()
          WHERE id = ? AND finance_status = ?`,
        [
          STATUS.REJECTED,
          normalizedActor.id,
          normalizedActor.label,
          remark ? `\n${remark}` : '',
          id,
          STATUS.PENDING,
        ]
      );
      await conn.execute(
        `INSERT INTO inventory_posting_events
           (posting_document_id, event_type, from_status, to_status, actor_id, actor_label, remark)
         VALUES (?, 'finance_rejected', ?, ?, ?, ?, ?)`,
        [
          id,
          STATUS.PENDING,
          STATUS.REJECTED,
          normalizedActor.id,
          normalizedActor.label,
          remark || null,
        ]
      );
      if (ownsConnection) await conn.commit();
      return { documentId: id, financeStatus: STATUS.REJECTED };
    } catch (error) {
      if (ownsConnection) await conn.rollback();
      throw error;
    } finally {
      if (ownsConnection) conn.release();
    }
  }

  static _buildReversalSourceNo(sourceNo, originalId) {
    const suffix = `-REV-${originalId}`;
    const base = String(sourceNo || '').trim();
    return `${base.slice(0, Math.max(1, 100 - suffix.length))}${suffix}`;
  }

  /**
   * Create a pending reversal request. This method must never write inventory_ledger
   * or change the original business/posting status.
   */
  static async requestReversal(id, actor, remark = '', context = {}, connection) {
    // Backward-compatible call shape: requestReversal(id, actor, remark, connection).
    if (context && typeof context.execute === 'function' && !connection) {
      connection = context;
      context = {};
    }
    const ownsConnection = !connection;
    const conn = connection || (await db.getConnection());
    const normalizedActor = actorFrom(actor);
    const requestContext = context && typeof context === 'object' ? context : {};
    try {
      if (ownsConnection) await conn.beginTransaction();
      const [[original]] = await conn.execute(
        'SELECT * FROM inventory_posting_documents WHERE id = ? FOR UPDATE',
        [id]
      );
      if (!original) throw serviceError('库存过账单不存在', 404, 'NOT_FOUND');
      if (original.posting_kind !== POSTING_KIND.MOVEMENT) {
        throw serviceError('只能对正式库存过账单发起反审核申请', 409, 'INVALID_POSTING_KIND');
      }
      if (original.finance_status === STATUS.REVERSED) {
        throw serviceError('该库存过账单已经反审核', 409, 'ALREADY_REVERSED');
      }
      if (original.finance_status !== STATUS.APPROVED || !Number(original.locked)) {
        throw serviceError('只有已财务审核并正式过账的单据才能申请反审核', 409, 'INVALID_STATUS');
      }
      this._assertActorCanApprove(original, normalizedActor);

      const [[existing]] = await conn.execute(
        `SELECT id, posting_no, finance_status
           FROM inventory_posting_documents
          WHERE original_posting_document_id = ?
            AND posting_kind = ?
            AND finance_status <> ?
          ORDER BY id DESC
          LIMIT 1
          FOR UPDATE`,
        [id, POSTING_KIND.REVERSAL, STATUS.REJECTED]
      );
      if (existing) {
        throw serviceError('该单据已有待处理或已完成的反审核申请，禁止重复申请', 409, 'ALREADY_REVERSED');
      }

      const [sourceLines] = await conn.execute(
        `SELECT pl.*, il.id AS ledger_id
           FROM inventory_posting_lines pl
           JOIN inventory_ledger il ON il.posting_line_id = pl.id
          WHERE pl.posting_document_id = ?
          ORDER BY pl.line_no
          FOR UPDATE`,
        [id]
      );
      if (!sourceLines.length) {
        throw serviceError('找不到原过账台账，无法申请反审核', 409, 'LEDGER_NOT_FOUND');
      }

      const reversalSourceNo = this._buildReversalSourceNo(original.source_no, id);
      const reversal = await this._getOrCreateDocument(conn, {
        sourceType: original.source_type,
        sourceId: original.source_id || requestContext.sourceId || null,
        sourceNo: reversalSourceNo,
        postingKind: POSTING_KIND.REVERSAL,
        originalPostingDocumentId: id,
        movementDirection: 'reversal',
        transactionDate: new Date().toISOString().slice(0, 10),
        financeStatus: STATUS.PENDING,
        businessApprovedById: normalizedActor.id,
        businessApprovedBy: normalizedActor.label,
        operator: normalizedActor.label,
        remark: remark || `反审核 ${original.posting_no}`,
      });
      const reversalLines = sourceLines.map((line) => ({
        materialId: line.material_id,
        locationId: line.location_id,
        transactionType: `${line.transaction_type}_cancel`.slice(0, 50),
        referenceType: `${line.reference_type}_reversal`.slice(0, 64),
        referenceNo: original.source_no,
        signedQuantity: -Number(line.signed_quantity),
        unitId: line.unit_id,
        batchNumber: line.batch_number,
        unitCost: line.unit_cost,
        totalValue: line.total_value == null ? null : -Number(line.total_value),
        transactionDate: new Date().toISOString().slice(0, 10),
        operator: normalizedActor.label,
        reversalOfLedgerId: line.ledger_id,
        sourceLineKey: `reversal-of:${line.id}`,
      }));
      await this.stageMovement(
        conn,
        {
          sourceType: reversal.source_type,
          sourceId: reversal.source_id,
          sourceNo: reversal.source_no,
          postingKind: POSTING_KIND.REVERSAL,
          postingSequence: reversal.posting_sequence,
          postingNo: reversal.posting_no,
          movementDirection: 'reversal',
          transactionDate: reversal.transaction_date,
          financeStatus: STATUS.PENDING,
          businessApprovedById: normalizedActor.id,
          businessApprovedBy: normalizedActor.label,
          operator: normalizedActor.label,
          remark: remark || `反审核 ${original.posting_no}`,
        },
        reversalLines
      );

      await conn.execute(
        `INSERT INTO inventory_posting_events
           (posting_document_id, event_type, from_status, to_status, actor_id, actor_label, remark, event_data)
         VALUES (?, 'reversal_requested', NULL, ?, ?, ?, ?, ?)` ,
        [
          reversal.id,
          STATUS.PENDING,
          normalizedActor.id,
          normalizedActor.label,
          remark || null,
          JSON.stringify({
            ...requestContext,
            postingKind: POSTING_KIND.REVERSAL,
            originalPostingDocumentId: id,
            sourceType: original.source_type,
            sourceId: requestContext.sourceId || original.source_id || null,
            sourceNo: original.source_no,
            requestedById: normalizedActor.id,
            requestedBy: normalizedActor.label,
          }),
        ]
      );

      if (ownsConnection) await conn.commit();
      return {
        documentId: id,
        reversalDocumentId: reversal.id,
        reversalPostingNo: reversal.posting_no,
        financeStatus: STATUS.PENDING,
        originalFinanceStatus: original.finance_status,
      };
    } catch (error) {
      if (ownsConnection) await conn.rollback();
      throw error;
    } finally {
      if (ownsConnection) conn.release();
    }
  }

  // Keep the public legacy method, but make it an approval-gated request.
  static async reverse(id, actor, remark = '', connection) {
    return this.requestReversal(id, actor, remark, {}, connection);
  }

  static actorFromRequest(req) {
    return {
      id: req?.user?.id || null,
      label: getRequestActorLabel(req) || req?.user?.username || 'unknown',
    };
  }
}

module.exports = InventoryPostingService;
