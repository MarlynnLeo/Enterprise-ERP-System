import { getMenuLabel } from './menuLabels'
import { normalizeRoutePath, resolveMenuNavigationState } from './menuTree'

export function getNavigationTabTitle(tab, { router, menuByPath, queryMenus, t }) {
  const route = router.resolve(tab.fullPath)
  const path = normalizeRoutePath(route.path)
  if (tab.pinned) return t('menu.dashboard')
  const withRecordId = (title) => route.params.id ? `${title} · ${route.params.id}` : title

  const matchingPath = resolveMenuNavigationState(queryMenus, tab.fullPath).activePath
  const queryMenu = menuByPath.get(matchingPath)
  if (queryMenu?.path.includes('?') && normalizeRoutePath(router.resolve(queryMenu.path).path) === path) {
    return withRecordId(getMenuLabel(queryMenu, t))
  }
  if (route.meta.titleKey) return withRecordId(t(route.meta.titleKey))

  const menu = menuByPath.get(path) || {
    path: route.params.id ? path.replace(/\/[^/]+$/, '') : path,
    permission: typeof route.meta.permission === 'string' ? route.meta.permission.replace(/:[^:]+$/, '') : '',
    name: String(route.name || path)
  }
  // An empty fallback lets us distinguish a known translation from a raw menu
  // name, even when the Chinese translation happens to equal the menu name.
  const translatedTitle = getMenuLabel({ path: menu.path, name: '' }, t)
  if (translatedTitle) return withRecordId(translatedTitle)

  // Routes without a menu translation can still supply a useful page title.
  if (route.meta.title) return withRecordId(route.meta.title)
  return withRecordId(getMenuLabel(menu, t))
}
