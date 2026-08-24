import { describe, expect, test } from 'vitest'
import {
  buildMenuSearchOptions,
  prepareMenuTree,
  resolveMenuNavigationState
} from '@/utils/menuNavigation'

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
})
