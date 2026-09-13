import { formatDate } from './format'

export const SALES_OUTBOUND_STATUS_TRANSITIONS = {
  draft: ['processing', 'cancelled'],
  processing: ['completed', 'cancelled'],
  completed: [],
  cancelled: []
}

export const canChangeSalesOutboundStatus = (currentStatus, targetStatus) =>
  Boolean(SALES_OUTBOUND_STATUS_TRANSITIONS[currentStatus]?.includes(targetStatus))

export const buildSalesOutboundStatusPayload = (outbound = {}, status) => ({
  status,
  deliveryDate:
    outbound.deliveryDate ||
    outbound.outboundDate ||
    formatDate(new Date(), 'YYYY-MM-DD'),
  remarks: outbound.remarks ?? outbound.remark
})

export const getSalesOutboundErrorMessage = (error, fallback = '操作失败') => {
  const data = error?.response?.data || {}
  const message = [data.message, data.error?.message, data.error, error?.message]
    .find(value => typeof value === 'string' && value.trim()) || fallback
  const details = data.error?.details || data.details || data.data || data
  const { materialCode, materialName } = details

  if (
    (message.includes('库存不足') || message.includes('没有库存记录')) &&
    materialCode &&
    materialName
  ) {
    if (details.required !== undefined && details.available !== undefined) {
      return `物料 ${materialCode}(${materialName}) 库存不足，需要数量：${details.required}，可用库存：${details.available}`
    }

    return `物料 ${materialCode}(${materialName}) 没有库存记录，无法完成出库`
  }

  return message
}

export const changeSalesOutboundStatus = async ({
  outbound,
  status,
  updateSalesOutbound,
  id = outbound?.id
}) => {
  if (!canChangeSalesOutboundStatus(outbound?.status, status)) {
    return { changed: false, reason: 'invalid_transition' }
  }

  await updateSalesOutbound(id, buildSalesOutboundStatusPayload(outbound, status))
  return { changed: true }
}
