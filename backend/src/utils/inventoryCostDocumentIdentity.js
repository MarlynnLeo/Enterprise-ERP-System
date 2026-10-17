const { createHash } = require('crypto');

function costDocumentValue(transaction, direction) {
  const reference = transaction.reference_no || transaction.id || direction;
  const materialId = transaction.material_id || transaction.materialId || 'NA';
  const lineId = transaction.posting_line_id || transaction.postingLineId;
  return `${reference}-M${materialId}${lineId ? `-L${lineId}` : ''}`;
}

function buildCostDocumentNumber(transaction, direction) {
  const value = costDocumentValue(transaction, direction);
  if (value.length <= 50) return value;
  // Keep the complete source/material/line identity even when the database's
  // 50-character document field cannot contain the readable form.
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 32);
  return `${value.slice(0, 15)}-H${digest}`;
}

module.exports = { buildCostDocumentNumber, costDocumentValue };
