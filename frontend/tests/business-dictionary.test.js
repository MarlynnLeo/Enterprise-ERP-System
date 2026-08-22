import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useDictionaryStore } from '@/stores/dictionary'

vi.mock('@/api/system', () => ({
  systemApi: {
    getBusinessTypeDictionary: vi.fn(),
  },
}))

import {
  getInboundOutboundStatusColor,
  getInboundOutboundStatusText,
  getInventoryInboundTypeColor,
  getInventoryInboundTypeText,
} from '@/constants/systemConstants'

describe('business type dictionary rendering', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useDictionaryStore()
    store.groups = {
      inventory_transaction: [
        { code: 'purchase_inbound', name: '采购收货入库', tagType: 'primary' },
      ],
      inbound_outbound_status: [
        { code: 'draft', name: '待确认草稿', tagType: 'warning' },
        { code: 'completed', name: '已入库', tagType: 'success' },
      ],
    }
    store.isLoaded = true
  })

  test('maps legacy inbound document codes to configured inventory transaction entries', () => {
    expect(getInventoryInboundTypeText('Purchase')).toBe('采购收货入库')
    expect(getInventoryInboundTypeColor('Purchase')).toBe('primary')
  })

  test('matches configured status codes without case sensitivity', () => {
    expect(getInboundOutboundStatusText('Draft')).toBe('待确认草稿')
    expect(getInboundOutboundStatusColor('Draft')).toBe('warning')
    expect(getInboundOutboundStatusText('Completed')).toBe('已入库')
    expect(getInboundOutboundStatusColor('Completed')).toBe('success')
  })

  test('uses Chinese fallback labels before the dictionary request finishes', () => {
    const store = useDictionaryStore()
    store.groups = {}
    store.isLoaded = false

    expect(getInboundOutboundStatusText('Draft')).toBe('草稿')
    expect(getInboundOutboundStatusColor('Cancelled')).toBe('danger')
  })
})
