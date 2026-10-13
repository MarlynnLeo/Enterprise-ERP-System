'use strict';

const db = require('../config/db');
const Precision = require('../utils/precision');
const { INTERNAL_POSTING_TOKEN } = require('./inventoryPostingContext');
const { getRequestActorLabel } = require('../utils/userUtils');
const { parsePagination, appendPaginationSQL } = require('../utils/safePagination');
const { hashSnapshot, readPostingSnapshot } = require('../utils/inventoryPostingSnapshot');
const { postingCapabilities } = require('../utils/inventoryPostingCapabilities');
const { currentDateString } = require('../utils/dateUtils');
const OutboundPostingGroupService = require('./business/OutboundPostingGroupService');
const SalesOutboundPostingLockService = require('./business/SalesOutboundPostingLockService');

const dayjs = require('dayjs');
const codeGeneratorService = require('./business/CodeGeneratorService');

const STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REVERSED: 'reversed',
});

const POSTING_KIND = Object.freeze({ MOVEMENT: 'movement', REVERSAL: 'reversal' });

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

const DOCUMENT_SELECT_COLUMNS = [
  'id',
  'posting_no',
  'source_type',
  'source_id',
  'source_no',
  'posting_sequence',
  'posting_kind',
  'original_posting_document_id',
  'movement_direction',
  'transaction_date',
  'finance_status',
  'business_approved_by_id',
  'business_approved_by',
  'business_approved_at',
  'finance_approved_by',
  'finance_approved_label',
  'finance_approved_at',
  'rejected_by',
  'rejected_label',
  'rejected_at',
  'reversed_by',
  'reversed_label',
  'reversed_at',
  'snapshot_hash',
  'snapshot_version',
  'locked',
  'is_legacy',
  'total_quantity',
  'total_value',
  'remark',
  'created_at',
  'updated_at',
].join(', ');

const DOCUMENT_TABLE_COLUMNS = DOCUMENT_SELECT_COLUMNS.split(', ')
  .map((col) => `d.${col}`)
  .join(', ');

const LINE_SELECT_COLUMNS = [
  'id',
  'posting_document_id',
  'line_no',
  'source_line_key',
  'material_id',
  'location_id',
  'transaction_type',
  'reference_type',
  'reference_no',
  'signed_quantity',
  'unit_id',
  'batch_number',
  'unit_cost',
  'total_value',
  'transaction_date',
  'operator',
  'payload_json',
  'snapshot_hash',
  'posted_quantity',
  'posted_value',
  'created_at',
  'updated_at',
].join(', ');

const LINE_TABLE_COLUMNS = LINE_SELECT_COLUMNS.split(', ')
  .map((col) => `l.${col}`)
  .join(', ');

class InventoryPostingService {
  static STATUS = STATUS;
  static POSTING_KIND = POSTING_KIND;

  static async _lockDocumentForAction(connection, id) {
    // Business actions lock the source before the posting. Use the same order
    // here, then re-read the posting under lock before trusting its state.
    const [[identity]] = await connection.execute(
      `SELECT id, source_type, source_id, source_no, posting_kind, original_posting_document_id
         FROM inventory_posting_documents WHERE id = ?`,
      [id]
    );
    if (!identity) return null;
    await SalesOutboundPostingLockService.lockSource(connection, identity);
    if (['outbound', 'outbound_supplement'].includes(identity.source_type)) {
      let source = identity;
      if (identity.posting_kind === POSTING_KIND.REVERSAL) {
        const [[original]] = await connection.execute(
          `SELECT source_type, source_id, source_no, posting_kind
             FROM inventory_posting_documents WHERE id = ?`,
          [identity.original_posting_document_id]
        );
        if (!original || original.posting_kind !== POSTING_KIND.MOVEMENT) {
          throw serviceError('冲销过账缺少有效原始来源', 409, 'POSTING_SOURCE_CHANGED');
        }
        source = original;
      }
      await OutboundPostingGroupService.lockSource(connection, source);
    }
    const [[locked]] = await connection.execute(
      `SELECT ${DOCUMENT_SELECT_COLUMNS} FROM inventory_posting_documents WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (!locked) return null;
    for (const key of [
      'source_type',
      'source_id',
      'source_no',
      'posting_kind',
      'original_posting_document_id',
    ]) {
      if (String(locked[key] ?? '') !== String(identity[key] ?? '')) {
        throw serviceError('库存过账来源已改变，请刷新后重试', 409, 'POSTING_SOURCE_CHANGED');
      }
    }
    return locked;
  }

  static async _nextPostingNo(connection, sourceNo, kind = POSTING_KIND.MOVEMENT) {
    const businessType =
      kind === POSTING_KIND.REVERSAL ? 'inventory_posting_reversal' : 'inventory_posting';
    try {
      return await codeGeneratorService.nextCode(businessType, connection);
    } catch {
      // 容错兜底：若编码规则尚未配置或查询异常，按 ERP 规范生成标准短编码，杜绝 24 位 hash 乱码
      const prefix = kind === POSTING_KIND.REVERSAL ? 'RPST' : 'PST';
      const dateStr = dayjs().format('YYYYMMDD');
      const randomSuffix = String(Math.floor(1000 + Math.random() * 9000));
      return `${prefix}-${dateStr}-${randomSuffix}`;
    }
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
      `SELECT ${DOCUMENT_SELECT_COLUMNS} FROM inventory_posting_documents
        WHERE source_type = ? AND source_no = ? AND posting_kind = ?
        ORDER BY posting_sequence DESC, id DESC LIMIT 1 FOR UPDATE`,
      [sourceType, sourceNo, kind]
    );
    if (existing.length && existing[0].finance_status !== STATUS.REJECTED) return existing[0];
    if (existing.length && existing[0].finance_status === STATUS.REJECTED) {
      postingSequence = Number(existing[0].posting_sequence || postingSequence) + 1;
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
      `SELECT ${DOCUMENT_SELECT_COLUMNS} FROM inventory_posting_documents WHERE id = ? FOR UPDATE`,
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

    if ((input.postingKind || POSTING_KIND.MOVEMENT) === POSTING_KIND.MOVEMENT) {
      await OutboundPostingGroupService.assertWritable(connection, input);
    }

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
    const insertedLineIds = [];
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
        supplierId: line.supplierId || null,
        supplierName: line.supplierName || null,
        productionDate: line.productionDate || null,
        expiryDate: line.expiryDate || null,
        warehouseName: line.warehouseName || null,
        purchaseOrderId: line.purchaseOrderId || null,
        purchaseOrderNo: line.purchaseOrderNo || null,
        receiptId: line.receiptId || null,
        receiptNo: line.receiptNo || null,
        remark: line.remark || '',
        allowEmptyBatch: line.allowEmptyBatch === true,
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
      insertedLineIds.push(result.insertId);
      totalQuantity = Precision.add(totalQuantity, Math.abs(payload.signedQuantity));
      totalValue = Precision.add(totalValue, Math.abs(payload.totalValue || 0));
    }

    if (insertedLineIds.length)
      await connection.execute(
        `UPDATE inventory_posting_documents
          SET total_quantity = total_quantity + ?,
              total_value = COALESCE(total_value, 0) + ?,
              snapshot_hash = SHA2(CONCAT(COALESCE(snapshot_hash, ''), ?, ?), 256),
              updated_at = NOW()
        WHERE id = ? AND finance_status = ?`,
        [
          totalQuantity,
          totalValue,
          document.id,
          insertedLineIds.join(','),
          document.id,
          STATUS.PENDING,
        ]
      );

    return { documentId: document.id, postingNo: document.posting_no, lineIds, staged: true };
  }

  static async list(query = {}, connection = db.pool) {
    const pagination = parsePagination(query.page, query.pageSize, {
      defaultPageSize: 20,
      maxPageSize: 100,
    });
    const baseWhere = [];
    const baseParams = [];
    if (query.sourceType) {
      baseWhere.push('d.source_type = ?');
      baseParams.push(query.sourceType);
    }
    if (query.keyword) {
      baseWhere.push('(d.posting_no LIKE ? OR d.source_no LIKE ?)');
      baseParams.push(`%${query.keyword}%`, `%${query.keyword}%`);
    }
    const baseWhereSql = baseWhere.length ? `WHERE ${baseWhere.join(' AND ')}` : '';

    const [[statsRow]] = await connection.execute(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(d.finance_status = 'pending'), 0) AS pending,
              COALESCE(SUM(d.finance_status = 'approved'), 0) AS approved,
              COALESCE(SUM(d.finance_status = 'rejected'), 0) AS rejected,
              COALESCE(SUM(d.finance_status = 'reversed'), 0) AS reversed
         FROM inventory_posting_documents d
         ${baseWhereSql}`,
      baseParams
    );

    const statistics = {
      total: Number(statsRow?.total || 0),
      pending: Number(statsRow?.pending || 0),
      approved: Number(statsRow?.approved || 0),
      rejected: Number(statsRow?.rejected || 0),
      reversed: Number(statsRow?.reversed || 0),
    };

    const where = [];
    const params = [];
    if (query.financeStatus) {
      where.push('d.finance_status = ?');
      params.push(query.financeStatus);
    }
    where.push(...baseWhere);
    params.push(...baseParams);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = query.financeStatus
      ? Number(statistics[query.financeStatus] ?? 0)
      : statistics.total;

    const listSql = appendPaginationSQL(
      `SELECT ${DOCUMENT_TABLE_COLUMNS},
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
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      statistics,
    };
  }

  static async get(id, connection = db.pool) {
    const [[document]] = await connection.execute(
      `SELECT ${DOCUMENT_SELECT_COLUMNS}
         FROM inventory_posting_documents
        WHERE id = ?`,
      [id]
    );
    if (!document) throw serviceError('库存过账单不存在', 404, 'NOT_FOUND');
    const [lines] = await connection.execute(
      `SELECT ${LINE_TABLE_COLUMNS},
              m.code AS material_code,
              m.name AS material_name,
              m.specs AS material_specs,
              u.name AS unit_name,
              loc.name AS location_name
         FROM inventory_posting_lines l
         LEFT JOIN materials m ON l.material_id = m.id
         LEFT JOIN units u ON COALESCE(l.unit_id, m.unit_id) = u.id
         LEFT JOIN locations loc ON l.location_id = loc.id
        WHERE l.posting_document_id = ?
        ORDER BY l.line_no ASC`,
      [id]
    );
    const [events] = await connection.execute(
      `SELECT id, posting_document_id, event_type, from_status, to_status,
              actor_id, actor_label, remark, event_data, created_at
         FROM inventory_posting_events
        WHERE posting_document_id = ?
        ORDER BY id ASC`,
      [id]
    );
    return { ...document, lines, events };
  }

  /**
   * Read the approval trail from the business document page.
   * This intentionally returns posting metadata/events only; callers that need
   * cost and frozen-line details must use the finance-scoped get() endpoint.
   */
  static async getApprovalBySource({ sourceType, sourceId, sourceNo } = {}, connection = db.pool) {
    const normalizedType = String(sourceType || '').trim();
    const normalizedId = Number(sourceId);
    const normalizedNo = String(sourceNo || '').trim();
    if (!normalizedType || (!Number.isInteger(normalizedId) && !normalizedNo)) {
      throw serviceError('审批来源单据参数无效', 400, 'INVALID_SOURCE');
    }

    const sourceTypeCondition =
      normalizedType === 'inbound'
        ? `(d.source_type = ? OR (
             d.source_type = 'batch_create'
             AND EXISTS (
               SELECT 1
                 FROM inventory_posting_lines legacy_purchase_line
                WHERE legacy_purchase_line.posting_document_id = d.id
                  AND legacy_purchase_line.transaction_type = 'purchase_inbound'
             )
           ))`
        : 'd.source_type = ?';
    const conditions = [sourceTypeCondition];
    const params = [normalizedType];
    if (Number.isInteger(normalizedId) && normalizedId > 0) {
      if (normalizedNo) {
        conditions.push('(d.source_id = ? OR (d.source_id IS NULL AND d.source_no = ?))');
        params.push(normalizedId, normalizedNo);
      } else {
        conditions.push('d.source_id = ?');
        params.push(normalizedId);
      }
    } else {
      conditions.push('d.source_no = ?');
      params.push(normalizedNo);
    }

    if (normalizedType === 'outbound') {
      conditions.splice(0, conditions.length, OutboundPostingGroupService.scopeSql());
      params.splice(
        0,
        params.length,
        ...OutboundPostingGroupService.scopeParams({
          id: normalizedId > 0 ? normalizedId : 0,
          outbound_no: normalizedNo,
        })
      );
    }

    const [documents] = await connection.execute(
      `SELECT id, posting_no, source_type, source_id, source_no,
              posting_sequence, posting_kind, finance_status,
              business_approved_by_id, business_approved_by, business_approved_at,
              finance_approved_by, finance_approved_label, finance_approved_at,
              rejected_by, rejected_label, rejected_at,
              reversed_by, reversed_label, reversed_at,
              locked, is_legacy, total_quantity, total_value, remark,
              created_at, updated_at
         FROM inventory_posting_documents d
        WHERE ${conditions.join(' AND ')}
        ORDER BY d.posting_kind = 'movement' DESC, d.posting_sequence DESC, d.id DESC`,
      params
    );

    if (!documents.length) {
      return { current: null, movement: null, reversal: null, postings: [], events: [] };
    }

    const documentIds = documents.map((document) => document.id);
    const placeholders = documentIds.map(() => '?').join(',');
    const [events] = await connection.execute(
      `SELECT posting_document_id, event_type, from_status, to_status,
              actor_id, actor_label, remark, event_data, created_at
         FROM inventory_posting_events
        WHERE posting_document_id IN (${placeholders})
        ORDER BY created_at ASC, id ASC`,
      documentIds
    );

    const movement =
      normalizedType === 'outbound'
        ? OutboundPostingGroupService.selectCurrent(documents)
        : documents.find((document) => document.posting_kind === POSTING_KIND.MOVEMENT) || null;
    const reversal =
      documents.find((document) => document.posting_kind === POSTING_KIND.REVERSAL) || null;
    const current =
      reversal?.finance_status === STATUS.PENDING || reversal?.finance_status === STATUS.APPROVED
        ? reversal
        : movement;

    return {
      current,
      movement,
      reversal,
      postings: documents,
      events,
    };
  }

  static async findApprovedForTransaction(connection, transaction = {}) {
    if (!connection) throw new Error('查找库存过账单必须提供数据库连接');
    const postingDocumentId = transaction.posting_document_id || transaction.postingDocumentId;
    if (postingDocumentId) {
      const [[document]] = await connection.execute(
        `SELECT ${DOCUMENT_SELECT_COLUMNS} FROM inventory_posting_documents
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
      `SELECT DISTINCT ${DOCUMENT_TABLE_COLUMNS}
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
      `SELECT DISTINCT ${DOCUMENT_TABLE_COLUMNS}
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
    if (approved) {
      const locked = await this._lockDocumentForAction(connection, approved.id);
      if (
        locked?.finance_status === STATUS.APPROVED &&
        Number(locked.locked) === 1 &&
        locked.posting_kind === POSTING_KIND.MOVEMENT
      )
        return locked;
    }

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
    const businessApproverId = Number(document.business_approved_by_id || 0);
    if (normalizedActor.id && businessApproverId && normalizedActor.id === businessApproverId) {
      throw serviceError('制单/业务审核人与财务审核人必须分离', 403, 'SEPARATION_OF_DUTIES');
    }
    if (
      String(document.business_approved_by || '').trim() &&
      String(document.business_approved_by).trim() === normalizedActor.label.trim()
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
      throw serviceError(
        '反审核申请人与原业务审核人/原财务审核人必须分离',
        403,
        'SEPARATION_OF_DUTIES'
      );
    }
    return normalizedActor;
  }

  static async _postLines(connection, document, lines, actor) {
    const InventoryService = require('./InventoryService');
    const results = [];
    const snapshots = lines.map((line) => readPostingSnapshot(line));
    for (const [index, line] of lines.entries()) {
      const payload = snapshots[index];
      if (line.posted_quantity != null) {
        const [ledger] = await connection.execute(
          `SELECT material_id, location_id, quantity, total_value, batch_number
             FROM inventory_ledger WHERE posting_document_id = ? AND posting_line_id = ?
             ORDER BY id FOR UPDATE`,
          [document.id, line.id]
        );
        const quantity = ledger.reduce((sum, row) => Precision.add(sum, Number(row.quantity)), 0);
        const value = ledger.reduce((sum, row) => Precision.add(sum, Number(row.total_value)), 0);
        if (
          !ledger.length ||
          ledger.some(
            (row) =>
              Number(row.material_id) !== Number(line.material_id) ||
              Number(row.location_id) !== Number(line.location_id) ||
              String(row.batch_number ?? '') !== String(line.batch_number ?? '')
          ) ||
          quantity !== Number(line.posted_quantity) ||
          quantity !== Number(line.signed_quantity) ||
          Math.abs(value) !== Math.abs(Number(line.posted_value))
        ) {
          throw serviceError(
            `过账明细 ${line.id} 的已入账标记与台账不一致`,
            409,
            'LEDGER_MISMATCH'
          );
        }
        results.push({
          lineId: line.id,
          alreadyPosted: true,
          quantity: Number(line.posted_quantity),
          totalValue: Number(line.posted_value),
        });
        continue;
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
          supplierId: payload.supplierId || null,
          supplierName: payload.supplierName || null,
          productionDate: payload.productionDate || null,
          expiryDate: payload.expiryDate || null,
          warehouseName: payload.warehouseName || null,
          purchaseOrderId: payload.purchaseOrderId || null,
          purchaseOrderNo: payload.purchaseOrderNo || null,
          receiptId: payload.receiptId || null,
          receiptNo: payload.receiptNo || null,
          remark: payload.remark || '',
          allowEmptyBatch: payload.allowEmptyBatch === true,
          internalPostingToken: INTERNAL_POSTING_TOKEN,
          allowNegativeStock: false,
        },
        connection
      );
      await connection.execute(
        `UPDATE inventory_posting_lines
            SET posted_quantity = ?, posted_value = ?, updated_at = NOW()
          WHERE id = ? AND posted_quantity IS NULL`,
        [quantity, result.totalValue ?? line.total_value ?? 0, line.id]
      );
      results.push(result);
    }
    return results;
  }

  static async batchApprove(ids, actor) {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) {
      throw serviceError('批量审核ID列表无效或超过上限', 400, 'INVALID_INPUT');
    }
    const isValidId = (id) => {
      if (typeof id === 'number') return Number.isSafeInteger(id) && id > 0;
      if (typeof id === 'string')
        return /^\d+$/.test(id.trim()) && Number.isSafeInteger(Number(id)) && Number(id) > 0;
      return false;
    };
    if (!ids.every(isValidId)) {
      throw serviceError('批量审核ID列表中包含无效ID', 400, 'INVALID_INPUT');
    }
    const uniqueIds = [...new Set(ids.map((id) => Number(id)))];
    const results = [];
    let successCount = 0;
    let failureCount = 0;
    for (const id of uniqueIds) {
      try {
        const res = await this.approve(id, actor);
        successCount += 1;
        results.push({ id, success: true, result: res });
      } catch (err) {
        failureCount += 1;
        results.push({
          id,
          success: false,
          error: err.message || '审核失败',
          code: err.code || 'APPROVE_FAILED',
        });
      }
    }
    return {
      totalCount: uniqueIds.length,
      successCount,
      failureCount,
      results,
    };
  }

  static async approve(id, actor, connection) {
    const ownsConnection = !connection;
    const conn = connection || (await db.getConnection());
    const normalizedActor = actorFrom(actor);
    try {
      if (ownsConnection) await conn.beginTransaction();
      const document = await this._lockDocumentForAction(conn, id);
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
          `SELECT ${DOCUMENT_SELECT_COLUMNS} FROM inventory_posting_documents WHERE id = ? FOR UPDATE`,
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
        if (reversalContext.outboundPostingGroup) {
          await OutboundPostingGroupService.validateReversal(
            conn,
            reversalContext.outboundPostingGroup,
            document,
            normalizedActor,
            this
          );
        }
      } else {
        await OutboundPostingGroupService.assertWritable(conn, document);
        this._assertActorCanApprove(document, normalizedActor);
      }
      const [lines] = await conn.execute(
        `SELECT ${LINE_SELECT_COLUMNS} FROM inventory_posting_lines WHERE posting_document_id = ? ORDER BY line_no ASC FOR UPDATE`,
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
          [STATUS.REVERSED, normalizedActor.id, normalizedActor.label, original.id, STATUS.APPROVED]
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
        if (reversalContext.outboundPostingGroup) {
          await OutboundPostingGroupService.finishReversal(
            conn,
            reversalContext.outboundPostingGroup,
            original.id,
            normalizedActor,
            id
          );
        }

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
        if (!approvalEventId) {
          throw serviceError(
            '财务集成事件未能持久化，库存审核已回滚',
            503,
            'FINANCE_EVENT_REQUIRED'
          );
        }
      }
      if (ownsConnection) await conn.commit();
      if (ownsConnection && approvalEventId && DomainEventService)
        DomainEventService.dispatchSoon(approvalEventId);
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
    if (typeof remark !== 'string' || !remark.trim() || remark.trim().length > 1000) {
      throw serviceError('请填写 1 至 1000 字的驳回原因', 400, 'INVALID_REMARK');
    }
    remark = remark.trim();
    const ownsConnection = !connection;
    const conn = connection || (await db.getConnection());
    const normalizedActor = actorFrom(actor);
    try {
      if (ownsConnection) await conn.beginTransaction();
      const document = await this._lockDocumentForAction(conn, id);
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
      const original = await this._lockDocumentForAction(conn, id);
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
      if (!postingCapabilities(original).reversalSupported) {
        throw serviceError('该来源尚不支持业务与财务联动冲销', 409, 'REVERSAL_NOT_SUPPORTED');
      }
      if (original.source_type === 'outbound_supplement' && !requestContext.outboundGroupRequest) {
        const outbound = await OutboundPostingGroupService.lockSource(conn, original);
        const result = await OutboundPostingGroupService.requestReversal(conn, {
          outbound,
          actor: normalizedActor,
          remark,
          context: requestContext,
        });
        if (ownsConnection) await conn.commit();
        return result;
      }
      this._assertActorCanApprove(original, normalizedActor);
      const outboundPostingGroup = await OutboundPostingGroupService.prepareReversal(
        conn,
        original,
        normalizedActor,
        requestContext,
        this
      );
      const sourceDocumentIds = outboundPostingGroup?.approvedIds || [Number(id)];

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
        throw serviceError(
          '该单据已有待处理或已完成的反审核申请，禁止重复申请',
          409,
          'ALREADY_REVERSED'
        );
      }

      const [sourceLines] = await conn.execute(
        `SELECT ${LINE_SELECT_COLUMNS.split(', ')
          .map((column) => `pl.${column}`)
          .join(', ')},
                il.id AS ledger_id, il.quantity AS ledger_quantity,
                il.unit_cost AS ledger_unit_cost, il.total_value AS ledger_value
           FROM inventory_posting_lines pl
           LEFT JOIN inventory_ledger il ON il.posting_line_id = pl.id
          WHERE pl.posting_document_id IN (${sourceDocumentIds.map(() => '?').join(', ')})
          ORDER BY pl.posting_document_id, pl.line_no ASC
          FOR UPDATE`,
        sourceDocumentIds
      );
      if (
        !sourceLines.length ||
        sourceLines.some(
          (line) =>
            !line.ledger_id ||
            !Number.isFinite(Number(line.ledger_quantity)) ||
            !Number(line.ledger_quantity) ||
            !(Number(line.ledger_unit_cost) > 0) ||
            !Number.isFinite(Number(line.ledger_value))
        )
      ) {
        throw serviceError('找不到原过账台账，无法申请反审核', 409, 'LEDGER_NOT_FOUND');
      }

      const reversalSourceNo = this._buildReversalSourceNo(original.source_no, id);
      const reversal = await this._getOrCreateDocument(conn, {
        sourceType: outboundPostingGroup ? 'outbound' : original.source_type,
        sourceId:
          outboundPostingGroup?.sourceId || original.source_id || requestContext.sourceId || null,
        sourceNo: reversalSourceNo,
        postingKind: POSTING_KIND.REVERSAL,
        originalPostingDocumentId: id,
        movementDirection: 'reversal',
        transactionDate: currentDateString(),
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
        referenceNo: line.reference_no || original.source_no,
        signedQuantity: -Number(line.ledger_quantity),
        unitId: line.unit_id,
        batchNumber: line.batch_number,
        unitCost: line.ledger_unit_cost,
        totalValue: -Math.sign(Number(line.ledger_quantity)) * Math.abs(Number(line.ledger_value)),
        transactionDate: currentDateString(),
        operator: normalizedActor.label,
        reversalOfLedgerId: line.ledger_id,
        sourceLineKey: `reversal-of-ledger:${line.ledger_id}`,
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
         VALUES (?, 'reversal_requested', NULL, ?, ?, ?, ?, ?)`,
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
            sourceType: outboundPostingGroup ? 'outbound' : original.source_type,
            sourceId:
              outboundPostingGroup?.sourceId ||
              original.source_id ||
              requestContext.sourceId ||
              null,
            sourceNo: outboundPostingGroup?.sourceNo || original.source_no,
            ...(outboundPostingGroup ? { outboundPostingGroup } : {}),
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
