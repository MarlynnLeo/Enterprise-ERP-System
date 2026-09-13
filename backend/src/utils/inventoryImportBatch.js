'use strict';

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');

dayjs.extend(utc);

/** Use the import time in the ERP's UTC+8 business timezone, not the stock period. */
function createImportBatchNumber({ importedAt = new Date(), materialId, locationId }) {
  const timestamp = dayjs(importedAt);
  if (!timestamp.isValid()) throw new Error('库存导入时间无效，无法生成批次号');
  if (!materialId || !locationId) throw new Error('生成导入批次号需要物料和库位');

  return `IMP-${timestamp.utcOffset(8).format('YYYYMMDDHHmmssSSS')}-${materialId}-${locationId}`;
}

module.exports = { createImportBatchNumber };
