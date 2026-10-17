'use strict';

const { readPostingSnapshot } = require('../../utils/inventoryPostingSnapshot');
const crypto = require('crypto');
const Precision = require('../../utils/precision');
const LEGACY_TYPES = new Set(['inbound', 'purchase_inbound', 'batch_create']);
const invalid = () =>
  Object.assign(new Error('采购收货过账与原始收货单标识不一致'), {
    statusCode: 409,
    code: 'POSTING_SOURCE_CHANGED',
  });
const positiveId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const equalNumber = (a, b) =>
  a != null &&
  b != null &&
  Number.isFinite(Number(a)) &&
  Number.isFinite(Number(b)) &&
  Math.abs(Number(a) - Number(b)) <= 0.000001;
const parsePayload = (line) => {
  try {
    return typeof line.payload_json === 'string'
      ? JSON.parse(line.payload_json)
      : line.payload_json;
  } catch {
    return null;
  }
};

class PurchaseReceiptPostingSourceService {
  static async resolve(connection, posting) {
    if (!posting) return null;
    if (posting.source_type === 'purchase_receipt') {
      if (
        !(Number.isSafeInteger(Number(posting.source_id)) && Number(posting.source_id) > 0) ||
        !posting.source_no
      )
        throw invalid();
      return { receiptId: Number(posting.source_id), receiptNo: posting.source_no };
    }
    if (!LEGACY_TYPES.has(posting.source_type)) return null;
    const [lines] = await connection.execute(
      'SELECT * FROM inventory_posting_lines WHERE posting_document_id = ? ORDER BY line_no',
      [posting.id]
    );
    const payloads = lines.map(parsePayload);
    if (
      !lines.some((line) => line.transaction_type === 'purchase_inbound') &&
      !payloads.some((payload) => payload?.receiptId != null)
    )
      return null;
    if (
      !lines.length ||
      lines.some(
        (line) =>
          line.transaction_type !== 'purchase_inbound' ||
          line.reference_type !== posting.source_type ||
          line.reference_no !== posting.source_no ||
          !(Number(line.signed_quantity) > 0)
      )
    )
      throw invalid();
    if (payloads.some((payload) => payload?.legacyLedgerId != null)) {
      return this.resolveArchivedLedger(connection, posting, lines, payloads);
    }
    let receiptId = null;
    let missingReceiptId = false;
    for (const line of lines) {
      const payload = readPostingSnapshot(line);
      if (
        payload.referenceNo !== posting.source_no ||
        (payload.receiptNo && payload.receiptNo !== posting.source_no)
      )
        throw invalid();
      if (payload.receiptId == null) {
        missingReceiptId = true;
        continue;
      }
      const id = Number(payload.receiptId);
      if (
        !positiveId(id) ||
        (receiptId !== null && receiptId !== id) ||
        (posting.source_id != null && Number(posting.source_id) !== id)
      )
        throw invalid();
      receiptId = id;
    }
    if (missingReceiptId) {
      return this.proveReceiptLines(connection, posting, lines, receiptId);
    }
    if (!receiptId) throw invalid();
    return { receiptId, receiptNo: posting.source_no };
  }

  /** A missing historical receiptId can only be recovered from the entire source document. */
  static async proveReceiptLines(connection, posting, lines, expectedReceiptId = null) {
    const [receipts] = await connection.execute(
      `SELECT id, receipt_no, warehouse_id, status FROM purchase_receipts
        WHERE receipt_no = ? AND deleted_at IS NULL`,
      [posting.source_no]
    );
    if (receipts.length !== 1) throw invalid();
    const receipt = receipts[0];
    if (
      !positiveId(receipt.id) ||
      !positiveId(receipt.warehouse_id) ||
      receipt.status !== 'completed' ||
      receipt.receipt_no !== posting.source_no ||
      (expectedReceiptId != null && Number(receipt.id) !== Number(expectedReceiptId)) ||
      (posting.source_id != null && Number(posting.source_id) !== Number(receipt.id))
    )
      throw invalid();
    const [items] = await connection.execute(
      `SELECT id, material_id, qualified_quantity, batch_number, price, unit_id
         FROM purchase_receipt_items WHERE receipt_id = ? ORDER BY id`,
      [receipt.id]
    );
    const grouped = (rows) => {
      const groups = new Map();
      for (const row of rows) {
        if (
          !positiveId(row.materialId) ||
          !positiveId(row.locationId) ||
          !String(row.batch || '').trim() ||
          !(Number(row.quantity) > 0) ||
          !Number.isFinite(Number(row.quantity)) ||
          !(Number(row.cost) > 0) ||
          !Number.isFinite(Number(row.cost)) ||
          !(Number(row.value) > 0) ||
          !Number.isFinite(Number(row.value))
        )
          throw invalid();
        const key = JSON.stringify([
          Number(row.materialId),
          Number(row.locationId),
          row.batch,
          Precision.round(Number(row.cost), 6),
        ]);
        const previous = groups.get(key) || { quantity: 0, value: 0 };
        groups.set(key, {
          quantity: Precision.add(previous.quantity, Number(row.quantity)),
          value: Precision.add(previous.value, Number(row.value)),
        });
      }
      return groups;
    };
    if (!items.length) throw invalid();
    const expected = grouped(
      items.map((item) => ({
        materialId: item.material_id,
        locationId: receipt.warehouse_id,
        batch: item.batch_number,
        quantity: item.qualified_quantity,
        cost: item.price,
        value: Precision.mul(Number(item.qualified_quantity), Number(item.price)),
      }))
    );
    const actual = grouped(
      lines.map((line) => ({
        materialId: line.material_id,
        locationId: line.location_id,
        batch: line.batch_number,
        quantity: line.signed_quantity,
        cost: line.unit_cost,
        value: line.total_value,
      }))
    );
    if (expected.size !== actual.size) throw invalid();
    for (const [key, value] of expected) {
      const frozen = actual.get(key);
      if (
        !frozen ||
        !equalNumber(value.quantity, frozen.quantity) ||
        !equalNumber(value.value, frozen.value)
      )
        throw invalid();
    }
    return { receiptId: Number(receipt.id), receiptNo: receipt.receipt_no };
  }

  /** Migrated approved rows are evidence for display only, never replacement approval snapshots. */
  static async resolveArchivedLedger(connection, posting, lines, payloads) {
    if (
      Number(posting.is_legacy) !== 1 ||
      Number(posting.locked) !== 1 ||
      !['approved', 'reversed'].includes(posting.finance_status)
    )
      throw invalid();
    const ids = payloads.map((payload) => payload?.legacyLedgerId);
    if (ids.some((id) => !positiveId(id)) || new Set(ids.map(Number)).size !== lines.length)
      throw invalid();
    const [ledgers] = await connection.execute(
      `SELECT id, posting_document_id, posting_line_id, reversal_of_ledger_id,
              material_id, location_id, transaction_type, reference_type, reference_no,
              quantity, unit_id, batch_number, unit_cost, total_value, receipt_id, receipt_no
         FROM inventory_ledger WHERE id IN (${ids.map(() => '?').join(', ')}) ORDER BY id`,
      ids.map(Number)
    );
    if (ledgers.length !== lines.length) throw invalid();
    let receiptId = null;
    for (const [index, line] of lines.entries()) {
      const ledgerId = Number(ids[index]);
      const ledger = ledgers.find((row) => Number(row.id) === ledgerId);
      const key = `legacy-ledger-${ledgerId}`;
      const expectedHash = crypto.createHash('sha256').update(key).digest('hex');
      if (
        !ledger ||
        line.source_line_key !== key ||
        line.snapshot_hash !== expectedHash ||
        Number(ledger.posting_document_id) !== Number(posting.id) ||
        Number(ledger.posting_line_id) !== Number(line.id) ||
        ledger.reversal_of_ledger_id != null ||
        ledger.reference_no !== posting.source_no ||
        ledger.reference_type !== posting.source_type ||
        ledger.transaction_type !== 'purchase_inbound' ||
        (ledger.receipt_no && ledger.receipt_no !== posting.source_no)
      )
        throw invalid();
      for (const [lineKey, ledgerKey] of [
        ['material_id', 'material_id'],
        ['location_id', 'location_id'],
        ['signed_quantity', 'quantity'],
        ['unit_cost', 'unit_cost'],
        ['total_value', 'total_value'],
        ['posted_quantity', 'quantity'],
        ['posted_value', 'total_value'],
      ]) {
        if (!equalNumber(line[lineKey], ledger[ledgerKey])) throw invalid();
      }
      if (
        String(line.batch_number || '') !== String(ledger.batch_number || '') ||
        String(line.unit_id ?? '') !== String(ledger.unit_id ?? '')
      )
        throw invalid();
      if (ledger.receipt_id != null) {
        if (
          !positiveId(ledger.receipt_id) ||
          (receiptId != null && Number(ledger.receipt_id) !== receiptId)
        )
          throw invalid();
        receiptId = Number(ledger.receipt_id);
      }
    }
    const receipt = await this.proveReceiptLines(connection, posting, lines, receiptId);
    return { ...receipt, readOnly: true };
  }
}

module.exports = PurchaseReceiptPostingSourceService;
