/**
 * Pure menu-tree operations.
 *
 * This module deliberately has no icon or Element Plus imports.  It is used by
 * the permission store and the router, so keeping it dependency-free prevents
 * the authenticated menu icon registry from entering the application entry
 * chunk.
 */

const isFlagEnabled = (value) => value === undefined || value === null || Number(value) !== 0

export const isMenuDisplayable = (menu) => {
  return Boolean(menu) && Number(menu.type) !== 2 && isFlagEnabled(menu.visible) && isFlagEnabled(menu.status)
}

/**
 * Normalize the permission response once.  The result is a stable, render-
 * friendly tree: invisible/action-only nodes are removed and every branch has
 * a deterministic menuIndex.
 */
export const prepareMenuTree = (nodes) => {
  if (!Array.isArray(nodes) || nodes.length === 0) return []

  const usedIndexes = new Set()
  const createMenuIndex = (item, parentIndex, position, hasChildren) => {
    const rawId = item.id
    const hasId = rawId !== undefined && rawId !== null && rawId !== ''
    const base = !hasChildren && item.path
      ? item.path
      : hasId
        ? `menu-${rawId}`
        : item.path
          ? `path-${item.path}`
          : `group-${parentIndex || 'root'}-${position}`

    let index = base
    let suffix = 1
    while (usedIndexes.has(index)) {
      suffix += 1
      index = `${base}-${suffix}`
    }
    usedIndexes.add(index)
    return index
  }

  const prepare = (items, parentIndex = '', parentPath = '') => {
    const result = []
    for (const [position, item] of items.entries()) {
      if (!item || typeof item !== 'object') continue

      const normalizedPath = item.path || ''
      const children = Array.isArray(item.children)
        ? prepare(item.children, item.menuIndex || parentIndex, normalizedPath || parentPath)
        : []
      const prepared = {
        ...item,
        path: normalizedPath,
        icon: item.icon || '',
        children,
        hasChildren: children.length > 0
      }
      prepared.menuIndex = createMenuIndex(prepared, parentIndex, position, prepared.hasChildren)

      if (isMenuDisplayable(prepared) && (Boolean(prepared.path) || prepared.hasChildren)) {
        result.push(prepared)
      }
    }
    return result
  }

  return prepare(nodes)
}

export const isRouteMatch = (menuPath, currentPath) => {
  if (!menuPath || menuPath === '/') return currentPath === menuPath
  return currentPath === menuPath || currentPath.startsWith(`${menuPath}/`)
}

/**
 * Resolve the deepest route match in one tree walk.  No reactive state is
 * touched here, so callers can safely cache the result in a computed value.
 */
export const resolveMenuNavigationState = (nodes, currentPath, ancestors = []) => {
  let best = { activePath: currentPath, openeds: [], score: -1 }

  for (const menu of nodes || []) {
    const menuHasChildren = menu.hasChildren
    const nextAncestors = menuHasChildren ? [...ancestors, menu.menuIndex] : ancestors

    if (menu.path && isRouteMatch(menu.path, currentPath)) {
      const score = menu.path.length
      if (score > best.score) {
        best = {
          activePath: menu.path,
          openeds: ancestors,
          score
        }
      }
    }

    if (menuHasChildren) {
      const childState = resolveMenuNavigationState(menu.children, currentPath, nextAncestors)
      if (childState.score > best.score) best = childState
    }
  }

  return best
}
