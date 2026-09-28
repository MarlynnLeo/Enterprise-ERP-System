import { describe, expect, test } from 'vitest'
import {
  isRouteMatch,
  prepareMenuTree,
  resolveMenuNavigationState
} from '@/utils/menuTree'
import { buildMenuSearchOptions } from '@/utils/menuSearch'

describe('menu navigation tree', () => {
  const rawTree = [
    {
      id: 1,
      name: 'Production',
      children: [
        { id: 11, name: 'Tasks', path: '/production/tasks' },
        { id: 12, name: 'Action permission', type: 2, path: '/production/action' },
        { id: 13, name: 'Hidden', visible: 0, path: '/production/hidden' }
      ]
    },
    { id: 2, name: 'Empty group', children: [{ id: 21, name: 'Hidden', status: 0, path: '/hidden' }] },
    { id: 3, name: 'Standalone', path: '/standalone' }
  ]

  test('normalizes once and removes non-displayable nodes and empty groups', () => {
    const tree = prepareMenuTree(rawTree)

    expect(tree.map(item => item.name)).toEqual(['Production', 'Standalone'])
    expect(tree[0]).toMatchObject({ menuIndex: 'menu-1', hasChildren: true })
    expect(tree[0].children.map(item => item.name)).toEqual(['Tasks'])
    expect(tree[0].children[0]).toMatchObject({ menuIndex: '/production/tasks', hasChildren: false })
  })

  test('resolves the deepest matching route and opens every prepared ancestor', () => {
    const tree = prepareMenuTree([
      {
        id: 1,
        name: 'Production',
        children: [{
          id: 11,
          name: 'Planning',
          children: [{ id: 111, name: 'Tasks', path: '/production/tasks' }]
        }]
      }
    ])

    expect(resolveMenuNavigationState(tree, '/production/tasks')).toMatchObject({
      activePath: '/production/tasks',
      openeds: ['menu-1', 'menu-11']
    })
  })

  test('builds search options from visible leaf nodes only', () => {
    const tree = prepareMenuTree(rawTree)
    const options = buildMenuSearchOptions(tree)

    expect(options).toHaveLength(2)
    expect(options.map(option => option.path)).toEqual(['/production/tasks', '/standalone'])
    expect(options[0].breadcrumbs).toEqual(['Production', 'Tasks'])
  })

  test('matches query subsets while preserving queryless parent and home matches', () => {
    expect(isRouteMatch('/finance/settings?tab=automation', '/finance/settings?page=2&tab=automation#rules')).toBe(true)
    expect(isRouteMatch('/finance/settings?tab=automation', '/finance/settings?tab=general')).toBe(false)
    expect(isRouteMatch('/finance/settings?tab=automation', '/finance/settings#tab=automation')).toBe(false)
    expect(isRouteMatch('/finance/settings', '/finance/settings/exchange-rates?currency=CNY')).toBe(true)
    expect(isRouteMatch('/finance/settings', '/finance/settings-extra?tab=automation')).toBe(false)
    expect(isRouteMatch('/', '/?period=month#chart')).toBe(true)
    expect(isRouteMatch('/', '/finance/settings?period=month')).toBe(false)
    expect(isRouteMatch('/finance/settings/', '/finance/settings')).toBe(true)
    expect(isRouteMatch('/finance/settings/?tab=automation', '/finance/settings?tab=automation')).toBe(true)
  })

  test('compares decoded query values and requires each repeated query value', () => {
    expect(isRouteMatch('/settings?tab=auto%20rules', '/settings?tab=auto+rules&filter=all')).toBe(true)
    expect(isRouteMatch('/settings?tag=a&tag=b', '/settings?tag=b&tag=c&tag=a')).toBe(true)
    expect(isRouteMatch('/settings?tag=a&tag=a', '/settings?tag=a')).toBe(false)
  })

  test('prefers more specific query menus and keeps deeper pathname precedence', () => {
    const tree = prepareMenuTree([{ id: 1, name: 'Finance', children: [
      { id: 2, name: 'Settings', path: '/finance/settings' },
      { id: 3, name: 'Automation', path: '/finance/settings?tab=automation' },
      { id: 4, name: 'Approval rules', path: '/finance/settings?tab=automation&section=approval' },
      { id: 5, name: 'Exchange rates', path: '/finance/settings/exchange-rates' }
    ] }])
    expect(resolveMenuNavigationState(tree, '/finance/settings?page=2&section=approval&tab=automation#rules')).toMatchObject({
      activePath: '/finance/settings?tab=automation&section=approval', openeds: ['menu-1']
    })
    expect(resolveMenuNavigationState(tree, '/finance/settings?tab=general')).toMatchObject({ activePath: '/finance/settings' })
    expect(resolveMenuNavigationState(tree, '/finance/settings/exchange-rates?tab=automation&section=approval')).toMatchObject({
      activePath: '/finance/settings/exchange-rates'
    })
  })
})
