import { describe, expect, test, vi } from 'vitest'
import {
  buildSalesOutboundStatusPayload,
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
      outbound_date: '2026-07-15',
      remark: 'mobile confirmation'
    }

    const result = await changeSalesOutboundStatus({
      outbound,
      status: 'completed',
      updateSalesOutbound
    })

    expect(result).toEqual({ changed: true })
    expect(updateSalesOutbound).toHaveBeenCalledWith(
      42,
      buildSalesOutboundStatusPayload(outbound, 'completed')
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
})
