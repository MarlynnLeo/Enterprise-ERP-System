'use strict';

const crypto = require('crypto');
const Precision = require('./precision');
const { toLocalDateString } = require('./dateUtils');

// Persisted field order is part of snapshot version 1. MySQL JSON reorders keys.
const SNAPSHOT_KEYS = Object.freeze([
  'materialId',
  'locationId',
  'transactionType',
  'referenceType',
  'referenceNo',
  'signedQuantity',
  'unitId',
  'batchNumber',
  'unitCost',
  'totalValue',
  'transactionDate',
  'operator',
  'supplierId',
  'supplierName',
  'productionDate',
  'expiryDate',
  'warehouseName',
  'purchaseOrderId',
  'purchaseOrderNo',
  'receiptId',
  'receiptNo',
  'remark',
  'allowEmptyBatch',
  'sourceLineKey',
  'reversalOfLedgerId',
]);

function hashSnapshot(payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(Object.fromEntries(SNAPSHOT_KEYS.map((key) => [key, payload[key]]))))
    .digest('hex');
}

function readPostingSnapshot(line) {
  const invalid = () =>
    Object.assign(new Error(`过账明细 ${line.id || ''} 的冻结快照与明细不一致`), {
      statusCode: 409,
      code: 'SNAPSHOT_INVALID',
    });
  let payload;
  try {
    payload =
      typeof line.payload_json === 'string' ? JSON.parse(line.payload_json) : line.payload_json;
  } catch {
    throw invalid();
  }
  if (
    !payload ||
    Array.isArray(payload) ||
    typeof payload !== 'object' ||
    hashSnapshot(payload) !== line.snapshot_hash
  )
    throw invalid();

  const numericFields = {
    materialId: 'material_id',
    locationId: 'location_id',
    signedQuantity: 'signed_quantity',
    unitId: 'unit_id',
    unitCost: 'unit_cost',
    totalValue: 'total_value',
  };
  for (const [key, column] of Object.entries(numericFields)) {
    if (payload[key] == null && line[column] == null) continue;
    if (
      payload[key] == null ||
      line[column] == null ||
      !Number.isFinite(Number(payload[key])) ||
      !Number.isFinite(Number(line[column])) ||
      Precision.round(Number(payload[key]), 6) !== Precision.round(Number(line[column]), 6)
    ) {
      throw invalid();
    }
  }
  const stringFields = {
    transactionType: 'transaction_type',
    referenceType: 'reference_type',
    referenceNo: 'reference_no',
    batchNumber: 'batch_number',
    operator: 'operator',
  };
  for (const [key, column] of Object.entries(stringFields)) {
    if (String(payload[key] ?? '') !== String(line[column] ?? '')) throw invalid();
  }
  if (payload.sourceLineKey && payload.sourceLineKey !== line.source_line_key) throw invalid();
  if (payload.transactionDate || line.transaction_date) {
    try {
      if (
        !payload.transactionDate ||
        !line.transaction_date ||
        toLocalDateString(payload.transactionDate) !== toLocalDateString(line.transaction_date)
      ) {
        throw invalid();
      }
    } catch {
      throw invalid();
    }
  }
  if (!(Number(payload.unitCost) > 0) || !Number(payload.signedQuantity)) throw invalid();
  return payload;
}

module.exports = { hashSnapshot, readPostingSnapshot };
