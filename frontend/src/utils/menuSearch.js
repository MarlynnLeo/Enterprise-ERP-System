import { getIconComponent } from './menuIcons'

/**
 * Build search entries from the already-normalized menu tree.  This module is
 * loaded only by the authenticated layout; the permission store does not pull
 * the icon registry into the login/entry path.
 */
export const buildMenuSearchOptions = (nodes, parentBreadcrumbs = []) => {
  const options = []

  for (const item of nodes || []) {
    if (!item?.name) continue

    const currentBreadcrumbs = [...parentBreadcrumbs, item.name]
    const visibleChildren = item.children || []

    if (item.path && visibleChildren.length === 0) {
      options.push({
        path: item.path,
        title: item.name,
        breadcrumbs: currentBreadcrumbs,
        icon: getIconComponent(item.icon)
      })
    }

    if (visibleChildren.length > 0) {
      options.push(...buildMenuSearchOptions(visibleChildren, currentBreadcrumbs))
    }
  }

  return options
}

