'use strict';

const BudgetControlService = require('../business/BudgetControlService');
const { DOCUMENT_TYPE_MAPPING } = require('../../constants/financeConstants');
const { toLocalDateString } = require('../../utils/dateUtils');
const {
  buildCostDocumentNumber,
  costDocumentValue,
} = require('../../utils/inventoryCostDocumentIdentity');
const { roundMoney } = require('../../utils/money');

const ACTIVE_ENTRY = `ge.is_posted = 1 AND COALESCE(ge.is_reversed, 0) = 0
  AND ge.reversal_entry_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM gl_entries reversed_source WHERE reversed_source.reversal_entry_id = ge.id)`;

async function invoiceEntry(connection, invoice) {
  // Merged invoice vouchers intentionally have a different document number.
  // EXISTS retains one row for one voucher even if links were duplicated.
  const [entries] = await connection.execute(
    `SELECT ge.id, ge.entry_date FROM gl_entries ge
     WHERE ge.document_type = ? AND ${ACTIVE_ENTRY} AND (
       EXISTS (SELECT 1 FROM document_links dl WHERE dl.source_type = 'ap_invoice'
          AND dl.source_id = ? AND dl.target_type = 'finance_voucher' AND dl.target_id = ge.id)
       OR ge.document_number = ?) ORDER BY ge.id FOR SHARE`,
    [DOCUMENT_TYPE_MAPPING.PURCHASE_INVOICE, Number(invoice.id) || 0, invoice.invoice_number]
  );
  if (entries.length !== 1)
    throw new Error(`发票 ${invoice.invoice_number} 缺少唯一有效的已过账凭证，不能确认预算并付款`);
  return entries[0];
}

async function purchaseCostEntries(connection, invoice) {
  if (!['purchase_receipt', 'inbound'].includes(invoice.source_type)) return [];
  const [[receipt]] = await connection.execute(
    `SELECT id, receipt_no, supplier_id FROM purchase_receipts
     WHERE id = ? AND status = 'completed' AND deleted_at IS NULL FOR SHARE`,
    [invoice.source_id]
  );
  if (!receipt || Number(receipt.supplier_id) !== Number(invoice.supplier_id)) {
    throw new Error(`发票 ${invoice.invoice_number} 的采购收货来源无效，不能确认材料预算`);
  }
  const [lines] = await connection.execute(
    `SELECT pl.id AS posting_line_id, pl.material_id, pl.reference_no,
            pl.posted_quantity, pl.posted_value, pd.source_no
       FROM inventory_posting_documents pd
       JOIN inventory_posting_lines pl ON pl.posting_document_id = pd.id
      WHERE pd.source_no = ? AND (pd.source_id = ? OR pd.source_id IS NULL)
        AND pd.source_type IN ('inbound', 'purchase_inbound', 'purchase_receipt', 'batch_create')
        AND pd.posting_kind = 'movement' AND pd.finance_status = 'approved' AND pd.locked = 1
        AND pl.transaction_type IN ('purchase_inbound', 'purchase_receipt') AND pl.signed_quantity > 0
      ORDER BY pl.id FOR SHARE`,
    [receipt.receipt_no, receipt.id]
  );
  if (!lines.length)
    throw new Error(`采购收货 ${receipt.receipt_no} 缺少已审核材料过账明细，不能付款`);
  const entries = new Map();
  for (const line of lines) {
    if (!(Number(line.posted_quantity) > 0) || !(Number(line.posted_value) > 0)) {
      throw new Error(`采购收货 ${receipt.receipt_no} 的材料成本尚未正式过账，不能付款`);
    }
    const transaction = { ...line, reference_no: line.reference_no || line.source_no };
    const numbers = [buildCostDocumentNumber(transaction, 'IN')];
    // Legacy vouchers used receipt + material. Never accept a truncated name:
    // it is not a unique accounting source identity.
    const legacy = costDocumentValue({ ...transaction, posting_line_id: null }, 'IN');
    if (legacy.length <= 50 && !numbers.includes(legacy)) numbers.push(legacy);
    const [matches] = await connection.execute(
      `SELECT ge.id, ge.entry_date FROM gl_entries ge
       WHERE ge.document_type = ? AND ${ACTIVE_ENTRY}
         AND ge.document_number IN (${numbers.map(() => '?').join(',')}) ORDER BY ge.id FOR SHARE`,
      [DOCUMENT_TYPE_MAPPING.INVENTORY_INBOUND, ...numbers]
    );
    if (matches.length !== 1)
      throw new Error(`采购收货 ${receipt.receipt_no} 的材料成本缺少唯一有效凭证，不能付款`);
    const entry = entries.get(matches[0].id) || { ...matches[0], expectedCost: 0 };
    entry.expectedCost = roundMoney(entry.expectedCost + roundMoney(line.posted_value));
    entries.set(entry.id, entry);
  }
  return [...entries.values()];
}

async function entryDimensions(connection, entry) {
  const [dimensions] = await connection.execute(
    `SELECT gei.account_id, cc.department_id, SUM(gei.debit_amount) AS recognized_amount
     FROM gl_entry_items gei LEFT JOIN cost_centers cc ON cc.id = gei.cost_center_id
     WHERE gei.entry_id = ? AND gei.debit_amount > 0
     GROUP BY gei.account_id, cc.department_id ORDER BY gei.account_id, cc.department_id`,
    [entry.id]
  );
  if (!dimensions.length) throw new Error('成本凭证明细缺失，不能付款');
  if (
    entry.expectedCost !== undefined &&
    Math.abs(
      roundMoney(
        dimensions.reduce((sum, dimension) => sum + Number(dimension.recognized_amount), 0)
      ) - entry.expectedCost
    ) > 0.01
  ) {
    throw new Error('采购材料凭证金额与已过账收货成本不一致，不能付款');
  }
  return dimensions;
}

// Budgets already use posted GL debits (accrual basis). Payment is a gate on
// those recognized costs, never another reservation of the same invoice.
async function assertInvoiceWithinBudget(connection, invoice) {
  const confirmation = await invoiceEntry(connection, invoice);
  // AP clears GR/IR; receipt cost vouchers contain the actual material debit.
  const costs = await purchaseCostEntries(connection, invoice);
  const entries = new Map([confirmation, ...costs].map((entry) => [entry.id, entry]));
  const checked = new Set();
  for (const entry of entries.values()) {
    for (const dimension of await entryDimensions(connection, entry)) {
      const date = toLocalDateString(entry.entry_date);
      const key = `${dimension.account_id}:${dimension.department_id || ''}:${date}`;
      if (checked.has(key)) continue;
      checked.add(key);
      const result = await BudgetControlService.checkBudgetAvailability(
        dimension.account_id,
        dimension.department_id || null,
        0,
        date,
        connection,
        null,
        { allowZeroAmount: true }
      );
      // No new allocation is made for a shared voucher, partial payment, or a
      // second invoice: GL already counts each line once in actual usage.
      if (!result.available && result.budget)
        throw new Error(`发票 ${invoice.invoice_number}：${result.reason}`);
    }
  }
}

module.exports = { assertInvoiceWithinBudget };
