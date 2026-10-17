import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { resolveNotificationLocation } from '../src/utils/notificationNavigation'

describe('notification record navigation', () => {
  it.each([{ id: 41 }, '{"id":41}'])('opens the record from camelCase HTTP params %s', (linkParams) => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/system/technical-communication', component: {} }
    ] })
    const location = resolveNotificationLocation({ link: '/system/technical-communication?tab=all#detail', linkParams })
    const route = router.resolve(location)
    expect(route.query).toEqual({ tab: 'all', id: '41' })
    expect(route.hash).toBe('#detail')
  })
  it('supports persisted legacy snake fields and prefers HTTP camel fields', () => {
    expect(resolveNotificationLocation({ link: '/x', link_params: '{"id":7}' }).query.id).toBe('7')
    expect(resolveNotificationLocation({ link: '/x', link_params: { id: 7 }, linkParams: { id: 8 } }).query.id).toBe('8')
  })
  it('keeps the module link usable when optional params are malformed', () => {
    expect(resolveNotificationLocation({ link: '/x?tab=all', linkParams: 'bad' }).query).toEqual({ tab: 'all' })
    expect(resolveNotificationLocation({ link: '/x', linkParams: [41] }).query).toEqual({})
  })
  it.each(['https://example.com', '//example.com', '/\\example.com'])('rejects nonlocal links %s', (link) => {
    expect(resolveNotificationLocation({ link })).toBeNull()
  })
})
