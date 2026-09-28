/**
 * Pure menu-tree operations.
 *
 * This module deliberately has no icon or Element Plus imports.  It is used by
 * the permission store and the router, so keeping it dependency-free prevents
 * the authenticated menu icon registry from entering the application entry
 * chunk.
 */

const isFlagEnabled = (value) => value === undefined || value === null || Number(value) !== 0

// Vue Router's non-strict routes accept an optional trailing slash. Use one
// page identity for both spellings while retaining fullPath for navigation.
export const normalizeRoutePath = (path) => path.replace(/\/+$/, '') || '/'

export const isMenuDisplayable = (menu) => {
  return Boolean(menu) && menu.path !== '/production/process-routes' && Number(menu.type) !== 2 && isFlagEnabled(menu.visible) && isFlagEnabled(menu.status)
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

  const prepare = (items, parentIndex = '') => {
    const result = []
    for (const [position, item] of items.entries()) {
      if (!item || typeof item !== 'object') continue

      const normalizedPath = item.path || ''
      const children = Array.isArray(item.children)
        ? prepare(item.children, item.menuIndex || parentIndex)
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

const splitRouteLocation = (fullPath) => {
  const hashIndex = fullPath.indexOf('#')
  const withoutHash = hashIndex < 0 ? fullPath : fullPath.slice(0, hashIndex)
  const queryIndex = withoutHash.indexOf('?')
  return {
    path: normalizeRoutePath(queryIndex < 0 ? withoutHash : withoutHash.slice(0, queryIndex)),
    query: new URLSearchParams(queryIndex < 0 ? '' : withoutHash.slice(queryIndex + 1)),
    hash: hashIndex < 0 ? '' : fullPath.slice(hashIndex)
  }
}

const routeMatchScore = (menuPath, currentPath) => {
  if (!menuPath || !currentPath) return -1
  const menu = splitRouteLocation(menuPath)
  const current = splitRouteLocation(currentPath)
  const pathMatches = current.path === menu.path || (
    menu.path !== '/' && current.path.startsWith(`${menu.path}/`)
  )
  if (!pathMatches || (menu.hash && menu.hash !== current.hash)) return -1

  // A menu may select a page section while the route also carries filters.
  // Match the required query pairs independently of order, including repeated
  // values, rather than comparing the entire query string.
  const remainingQuery = [...current.query]
  let specificity = menu.hash ? 1 : 0
  for (const [key, value] of menu.query) {
    const index = remainingQuery.findIndex(([currentKey, currentValue]) => currentKey === key && currentValue === value)
    if (index < 0) return -1
    remainingQuery.splice(index, 1)
    specificity++
  }
  // A deeper pathname always wins. At the same pathname, more explicit query
  // or hash conditions win without letting a long query outweigh a child page.
  return menu.path.length + specificity / (specificity + 1)
}

export const isRouteMatch = (menuPath, currentPath) => {
  if (!menuPath) return currentPath === menuPath
  return routeMatchScore(menuPath, currentPath) >= 0
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

    if (menu.path) {
      const score = routeMatchScore(menu.path, currentPath)
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
