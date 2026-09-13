import { formatQuantityNumber } from '@/utils/helpers/quantity'

const PRODUCT_QUANTITY_TYPES = new Set(['bom_issue', 'batch_issue'])

/** BOM/batch issues count products; other outbound documents count issued materials. */
export const formatOutboundQuantity = (row) => {
  const quantity = PRODUCT_QUANTITY_TYPES.has(row.outboundType) && row.productQuantity != null
    ? row.productQuantity
    : row.totalQuantity
  return formatQuantityNumber(quantity)
}
