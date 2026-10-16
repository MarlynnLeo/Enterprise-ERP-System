'use strict';

const sourceError = (message) =>
  Object.assign(new Error(message), { statusCode: 409, code: 'POSTING_SOURCE_CHANGED' });

/** Sales business actions already hold the outbound row before touching its posting. */
class SalesOutboundPostingLockService {
  static async lockSource(connection, posting) {
    if (posting.source_type !== 'sales_outbound') return null;

    let source = posting;
    if (posting.posting_kind === 'reversal') {
      if (!posting.original_posting_document_id)
        throw sourceError('销售出库冲销缺少原始过账，无法锁定来源单据');
      const [[original]] = await connection.execute(
        `SELECT source_type, source_id, source_no, posting_kind
           FROM inventory_posting_documents WHERE id = ?`,
        [posting.original_posting_document_id]
      );
      if (original?.source_type !== 'sales_outbound' || original.posting_kind !== 'movement')
        throw sourceError('销售出库冲销的原始过账无效，无法锁定来源单据');
      // Reversal numbers contain a suffix; only the original movement identifies the source.
      source = original;
    }

    const sourceId = Number(source.source_id);
    const hasSourceId = Number.isSafeInteger(sourceId) && sourceId > 0;
    const sourceNo = String(source.source_no || '').trim();
    if (!hasSourceId && !sourceNo) throw sourceError('销售出库过账缺少来源单据标识');
    const [[outbound]] = await connection.execute(
      `SELECT id, outbound_no FROM sales_outbound
        WHERE ${hasSourceId ? 'id' : 'outbound_no'} = ? AND deleted_at IS NULL
        LIMIT 1 FOR UPDATE`,
      [hasSourceId ? sourceId : sourceNo]
    );
    if (!outbound || (sourceNo && outbound.outbound_no !== sourceNo))
      throw sourceError('销售出库过账与来源单据不一致');
    return outbound;
  }
}

module.exports = SalesOutboundPostingLockService;
