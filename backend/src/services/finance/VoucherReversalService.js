/**
 * VoucherReversalService
 * 业务单据作废时，按单据链路冲销关联总账凭证
 */

const { logger } = require('../../utils/logger');
const { currentDateString } = require('../../utils/dateUtils');

class VoucherReversalService {
  /**
   * 查找业务单据关联、且仍有效的总账凭证 ID
   * 优先 document_links，再按「业务单号 + 规范 document_type」定位
   */
  static async findActiveVoucherIds(
    connection,
    { sourceType, sourceId, documentNumber, documentType }
  ) {
    const candidateIds = new Set();

    if (sourceType && sourceId) {
      const [links] = await connection.execute(
        `SELECT target_id
         FROM document_links
         WHERE source_type = ?
           AND source_id = ?
           AND target_type = 'finance_voucher'`,
        [sourceType, sourceId]
      );
      for (const link of links) {
        const id = Number(link.target_id);
        if (Number.isInteger(id) && id > 0) {
          candidateIds.add(id);
        }
      }
    }

    if (documentNumber && documentType) {
      const [entries] = await connection.execute(
        `SELECT id
         FROM gl_entries
         WHERE document_number = ?
           AND document_type = ?
           AND COALESCE(is_reversed, 0) = 0
         FOR UPDATE`,
        [documentNumber, documentType]
      );
      for (const entry of entries) {
        candidateIds.add(Number(entry.id));
      }
    }

    if (candidateIds.size === 0) {
      return [];
    }

    const ids = [...candidateIds];
    const placeholders = ids.map(() => '?').join(',');
    const [activeEntries] = await connection.execute(
      `SELECT id
       FROM gl_entries
       WHERE id IN (${placeholders})
         AND COALESCE(is_posted, 0) = 1
         AND COALESCE(is_reversed, 0) = 0
       FOR UPDATE`,
      ids
    );

    return activeEntries.map((row) => Number(row.id));
  }

  /**
   * 冲销业务单据关联的全部有效凭证（在调用方事务内执行）
   * @returns {Promise<Array<{ originalEntryId: number, entryId: number, entryNumber: string|null }>>}
   */
  static async reverseBusinessVouchers(
    connection,
    {
      sourceType,
      sourceId,
      documentNumber,
      documentType,
      voidedBy,
      reason,
      entryDate = currentDateString(),
    }
  ) {
    const financeModel = require('../../models/finance');
    const voucherIds = await this.findActiveVoucherIds(connection, {
      sourceType,
      sourceId,
      documentNumber,
      documentType,
    });

    if (voucherIds.length === 0) {
      throw new Error(
        `未找到单据 ${documentNumber || sourceId} 对应的未冲销会计凭证，无法完成作废`
      );
    }

    const results = [];
    for (const originalEntryId of voucherIds) {
      const reversalEntryId = await financeModel.reverseEntry(
        originalEntryId,
        {
          entry_date: entryDate,
          posting_date: entryDate,
          description: reason,
          created_by: voidedBy,
        },
        connection
      );

      const [rows] = await connection.execute(
        'SELECT entry_number FROM gl_entries WHERE id = ?',
        [reversalEntryId]
      );

      results.push({
        originalEntryId,
        entryId: reversalEntryId,
        entryNumber: rows[0]?.entry_number || null,
      });

      logger.info(
        `[VoucherReversal] ${sourceType}#${sourceId} entry ${originalEntryId} -> ${reversalEntryId}`
      );
    }

    return results;
  }
}

module.exports = VoucherReversalService;
