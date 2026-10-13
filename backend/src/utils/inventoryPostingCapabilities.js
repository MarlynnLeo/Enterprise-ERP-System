'use strict';

const REVERSAL_SOURCE_TYPES = new Set([
  'inbound',
  'purchase_inbound',
  'outbound',
  'outbound_supplement',
  'production_outbound',
  'sales_outbound',
  'transfer',
  'outsourced_processing_material',
  'outsourced_processing_receipt',
]);

function postingCapabilities(document) {
  const reversalSupported = REVERSAL_SOURCE_TYPES.has(document.source_type);
  return {
    reversalSupported,
    reversalUnavailableReason: reversalSupported ? null : '该来源尚不支持业务与财务联动冲销',
  };
}

module.exports = { postingCapabilities };
