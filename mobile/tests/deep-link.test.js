import { describe, it, expect, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { resolveMobileDeepLink, navigateMobileDeepLink } from '../src/utils/deepLink.js'

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

  it('translates the default PC task link even when the type is a notification rule', () => {
    expect(resolveMobileDeepLink('notification_rule:7', 41, { link: '/production/task' }).path)
      .toBe('/production/tasks/41')
    expect(resolveMobileDeepLink('notification_rule:7', null, {
      link: '/production/task?tab=all', linkParams: '{"id":42}'
    }).path).toBe('/production/tasks/42?tab=all')
  })

  it('navigates to a registered mobile record and explains unsupported PC paths', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/production/tasks/:id', component: {} },
      { path: '/:pathMatch(.*)*', name: 'NotFound', component: {} }
    ] })
    const push = vi.spyOn(router, 'push').mockResolvedValue()
    const toast = vi.fn()
    expect(navigateMobileDeepLink(router, toast, 'notification_rule:7', 41, { link: '/production/task' })).toBe(true)
    expect(push).toHaveBeenCalledWith('/production/tasks/41')
    expect(navigateMobileDeepLink(router, toast, 'notification_rule:7', 41, { link: '/system/pc-only' })).toBe(false)
    expect(push).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith('移动端暂无对应页面，请在 PC 端查看')
  })
})
