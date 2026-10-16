const DocumentLinkService = require('../business/DocumentLinkService');
const { DOCUMENT_LINK_TYPES: DocType } = require('../../constants/documentLinkTypes');
const { toCents, fromCents } = require('../../utils/finance/settlementMath');

// These journals share the settlement voucher. They must be reversed from the
// settlement so invoice balances, cash and the general ledger change together.
const SETTLEMENT_CATEGORIES = new Set(['ar_settlement', 'ap_settlement']);

class SettlementCashService {
  static isSettlementJournal(transaction) {
    return SETTLEMENT_CATEGORIES.has(transaction.category);
  }

  static async create(connection, data) {
    const cents = toCents(data.amount);
    if (cents === 0) return null;
    if (!['ar', 'ap'].includes(data.kind) || !data.entryId) {
      throw new Error('现金结算缺少有效业务类型或会计凭证');
    }
    const isIncome = data.kind === 'ar' ? cents > 0 : cents < 0;
    const [result] = await connection.execute(
      `INSERT INTO cash_transactions
       (transaction_number, transaction_type, transaction_date, amount, category,
        counterparty, description, reference_number, status, gl_entry_id,
        created_by, updated_by, approved_by, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, NOW())`,
      [
        data.number,
        isIncome ? 'income' : 'expense',
        data.date,
        fromCents(Math.abs(cents)),
        `${data.kind}_settlement`,
        data.counterparty || '',
        data.description || `现金结算 ${data.number}`,
        data.referenceNumber || data.number,
        data.entryId,
        data.userId || null,
        data.userId || null,
        data.userId || null,
      ]
    );
    const id = result.insertId;
    for (const link of [
      {
        source_type: data.kind === 'ar' ? DocType.AR_RECEIPT : DocType.AP_PAYMENT,
        source_id: data.settlementId,
        source_code: data.settlementNumber || data.number,
        target_type: DocType.CASH_TRANSACTION,
        target_id: id,
        target_code: data.number,
      },
      {
        source_type: DocType.CASH_TRANSACTION,
        source_id: id,
        source_code: data.number,
        target_type: DocType.FINANCE_VOUCHER,
        target_id: data.entryId,
        target_code: data.entryNumber,
      },
    ]) {
      await DocumentLinkService.createLink(
        {
          ...link,
          link_type: 'generate',
          created_by: data.userId || null,
        },
        connection
      );
    }
    return id;
  }

  static async reverse(connection, data) {
    if (toCents(data.amount) === 0) return null;
    const [rows] = await connection.execute(
      `SELECT id, transaction_number, amount, transaction_type, category, status,
              counterparty, gl_entry_id
         FROM cash_transactions WHERE transaction_number = ? FOR UPDATE`,
      [data.number]
    );
    const original = rows[0];
    const expectedType = (data.kind === 'ar' ? data.amount > 0 : data.amount < 0)
      ? 'income'
      : 'expense';
    if (
      !original ||
      original.category !== `${data.kind}_settlement` ||
      original.status !== 'approved' ||
      original.transaction_type !== expectedType ||
      toCents(original.amount) !== Math.abs(toCents(data.amount))
    ) {
      throw new Error('现金结算流水缺失或与原单不一致，请先修复后再作废');
    }
    const reversal = data.reversalEntries.find(
      (entry) => Number(entry.originalEntryId) === Number(original.gl_entry_id)
    );
    if (!reversal) throw new Error('现金结算缺少对应的冲销凭证');
    const number = `${data.number}-VOID`;
    const id = await this.create(connection, {
      ...data,
      amount: -Number(data.amount),
      number,
      settlementNumber: data.number,
      referenceNumber: data.number,
      counterparty: original.counterparty,
      entryId: reversal.entryId,
      entryNumber: reversal.entryNumber,
      description: `冲销现金结算 ${data.number}：${data.reason || ''}`,
    });
    await DocumentLinkService.createLink(
      {
        source_type: DocType.CASH_TRANSACTION,
        source_id: original.id,
        source_code: original.transaction_number,
        target_type: DocType.CASH_TRANSACTION,
        target_id: id,
        target_code: number,
        link_type: 'related',
        remark: '现金结算作废冲销',
        created_by: data.userId || null,
      },
      connection
    );
    return id;
  }
}

module.exports = SettlementCashService;
