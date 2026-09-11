import { describe, expect, test } from 'vitest'
import { getOutboundDisplayStatus } from '../src/utils/inventory/outboundDisplayStatus.js'

const getBusinessStatusDisplay = (status) => ({
  draft: { text: '草稿', type: 'info' },
  confirmed: { text: '确认', type: 'warning' },
  reversed: { text: '已冲销', type: 'info' },
  completed: { text: '完成', type: 'success' },
}[status] || { text: status || '', type: 'info' })

describe('outbound display status', () => {
  test.each([
    [{ status: 'completed', financeStatus: 'pending' }, { text: '待财务审', type: 'warning' }],
    [{ status: 'partial_completed', financeStatus: 'pending' }, { text: '待财务审', type: 'warning' }],
    [{ status: 'completed', financeStatus: 'approved' }, { text: '财务已审', type: 'success' }],
    [{ status: 'completed', financeStatus: 'rejected' }, { text: '财务驳回', type: 'danger' }],
  ])('uses one finance status for completed outbound rows: %#', (row, expected) => {
    expect(getOutboundDisplayStatus(row, getBusinessStatusDisplay)).toEqual(expected)
  })

  test.each([
    [{ status: 'draft' }, { text: '草稿', type: 'info' }],
    [{ status: 'confirmed' }, { text: '确认', type: 'warning' }],
    [{ status: 'reversed' }, { text: '已冲销', type: 'info' }],
    [{ status: 'completed' }, { text: '完成', type: 'success' }],
  ])('keeps the business status when no finance status replaces it: %#', (row, expected) => {
    expect(getOutboundDisplayStatus(row, getBusinessStatusDisplay)).toEqual(expected)
  })
})
