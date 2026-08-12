import { describe, it, expect } from 'vitest'
import { resolveMobileDeepLink } from '../src/utils/deepLink.js'

describe('resolveMobileDeepLink', () => {
  it('resolves core master data and docs', () => {
    expect(resolveMobileDeepLink('material', 12).path).toBe('/basedata/materials/12')
    expect(resolveMobileDeepLink('sales_order', 3).path).toBe('/sales/orders/3')
    expect(resolveMobileDeepLink('order', 3).path).toBe('/sales/orders/3')
    expect(resolveMobileDeepLink('purchase_order', 9).path).toBe('/purchase/orders/9')
    expect(resolveMobileDeepLink('task', 1).path).toBe('/production/tasks/1')
    expect(resolveMobileDeepLink('production_task', 1).path).toBe('/production/tasks/1')
    expect(resolveMobileDeepLink('bom', 5).path).toBe('/basedata/boms/5')
  })

  it('resolves quality / finance / inventory aliases', () => {
    expect(resolveMobileDeepLink('incoming_inspection', 2).path).toBe('/quality/incoming/2')
    expect(resolveMobileDeepLink('inventory_inbound', 4).path).toBe('/inventory/inbound/4')
    expect(resolveMobileDeepLink('ar_invoice', 7).path).toBe('/finance/ar/invoices/7')
    expect(resolveMobileDeepLink('equipment', 8).path).toBe('/equipment/detail/8')
  })

  it('prefers safe in-app link from backend', () => {
    expect(resolveMobileDeepLink(null, null, { link: '/workflow/approvals' }).path).toBe(
      '/workflow/approvals'
    )
    expect(resolveMobileDeepLink('x', 1, { link: 'https://evil.com' }).path).toBe(null)
  })

  it('maps event-style type names', () => {
    expect(resolveMobileDeepLink('PRODUCTION_TASK_COMPLETED', 11).path).toBe(
      '/production/tasks/11'
    )
  })

  it('falls back for approval without id', () => {
    expect(resolveMobileDeepLink('approval', null).path).toBe('/workflow/approvals')
    expect(resolveMobileDeepLink('unknown_thing', 1).path).toBe(null)
  })
})
