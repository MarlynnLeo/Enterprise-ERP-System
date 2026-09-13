import { describe, expect, test, vi } from 'vitest'
import {
  getSalesOutboundErrorMessage,
  canChangeSalesOutboundStatus,
  changeSalesOutboundStatus
} from '@/utils/salesOutbound'

describe('mobile sales outbound workflow', () => {
  test('permits only backend-supported status transitions', () => {
    expect(canChangeSalesOutboundStatus('draft', 'processing')).toBe(true)
    expect(canChangeSalesOutboundStatus('draft', 'completed')).toBe(false)
    expect(canChangeSalesOutboundStatus('completed', 'cancelled')).toBe(false)
  })

  test('sends the selected outbound id and preserves the business date', async () => {
    const updateSalesOutbound = vi.fn().mockResolvedValue({})
    const outbound = {
      id: 42,
      status: 'processing',
      outboundDate: '2026-07-15',
      remarks: 'mobile confirmation'
    }

    const result = await changeSalesOutboundStatus({
      outbound,
      status: 'completed',
      updateSalesOutbound
    })

    expect(result).toEqual({ changed: true })
    expect(updateSalesOutbound).toHaveBeenCalledWith(
      42,
      { status: 'completed', deliveryDate: '2026-07-15', remarks: 'mobile confirmation' }
    )
  })

  test('does not call the API for an invalid transition', async () => {
    const updateSalesOutbound = vi.fn()
    const result = await changeSalesOutboundStatus({
      outbound: { id: 42, status: 'completed' },
      status: 'processing',
      updateSalesOutbound
    })

    expect(result).toEqual({ changed: false, reason: 'invalid_transition' })
    expect(updateSalesOutbound).not.toHaveBeenCalled()
  })

  test('renders stock details and handles structured API errors without throwing', () => {
    expect(getSalesOutboundErrorMessage({ response: { data: {
      message: '库存不足', materialCode: 'M-1', materialName: '原料', required: 5, available: 0
    } } })).toBe('物料 M-1(原料) 库存不足，需要数量：5，可用库存：0')
    expect(getSalesOutboundErrorMessage({ response: { data: { error: { message: '当前状态不能完成' } } } })).toBe('当前状态不能完成')
    expect(getSalesOutboundErrorMessage({ response: { data: { error: {} } } }, '完成失败')).toBe('完成失败')
  })
})
