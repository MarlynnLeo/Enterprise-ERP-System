import { computed, ref, watch } from 'vue'
import { normalizeRoutePath } from '../utils/menuTree'

// A tab represents a page, while its last fullPath retains deep links such as
// an opened purchase order or a selected profile section.
export function useNavigationTabs({ router, auth }) {
  const openedTabs = ref([])
  const pendingClose = ref(false)
  let owner = ''
  let generation = 0

  const sessionOwner = () => auth.user?.id ?? auth.user?.username ?? ''
  const isWorkspaceRoute = (route) => route.matched.length > 1 && route.matched[0].path === '/'
  const canAccess = (route) => {
    if (!auth.isAuthenticated || !auth.permissionsLoaded || !isWorkspaceRoute(route)) return false
    const permission = route.meta.permission
    return !permission || auth.hasPermission(permission) || auth.hasChildPermission(permission)
  }
  const resolveAccessible = (fullPath) => {
    const route = router.resolve(fullPath)
    return canAccess(route) ? route : null
  }
  const remember = (route) => {
    const path = normalizeRoutePath(route.path)
    const previous = openedTabs.value.find((tab) => tab.path === path)
    if (previous) {
      previous.fullPath = route.fullPath
    } else {
      openedTabs.value.push({ path, fullPath: route.fullPath, pinned: path === '/' })
    }
  }
  const reconcile = () => {
    const nextOwner = sessionOwner()
    if (nextOwner !== owner || !auth.isAuthenticated || !auth.permissionsLoaded) {
      generation++
      pendingClose.value = false
      openedTabs.value = []
      owner = nextOwner
    }
    if (!auth.isAuthenticated || !auth.permissionsLoaded) return

    openedTabs.value = openedTabs.value.filter((tab) => resolveAccessible(tab.fullPath))
    const home = resolveAccessible('/')
    if (home && !openedTabs.value.some((tab) => tab.path === '/')) {
      openedTabs.value.unshift({ path: '/', fullPath: '/', pinned: true })
    }
    const current = router.currentRoute.value
    if (canAccess(current)) {
      remember(current)
    } else if (isWorkspaceRoute(current)) {
      // A permission refresh can invalidate the page without a navigation.
      // Re-enter the existing router guards before displaying another page.
      const fallback = home || resolveAccessible('/profile')
      if (fallback && fallback.path !== current.path) router.replace(fallback.fullPath).catch(() => {})
    }
  }

  watch(
    () => [router.currentRoute.value.fullPath, sessionOwner(), auth.isAuthenticated, auth.permissionsLoaded, auth.permissions],
    reconcile,
    { immediate: true, deep: true }
  )

  const activePath = computed(() => normalizeRoutePath(router.currentRoute.value.path))
  const tabs = computed(() => openedTabs.value)
  const canClose = (tab) => !tab.pinned && (
    tab.path !== '/profile' || openedTabs.value.some((item) => item.path !== tab.path)
  )
  const navigate = async (tab) => {
    if (!resolveAccessible(tab.fullPath)) return false
    try {
      const failure = await router.push(tab.fullPath)
      return !failure
    } catch {
      // The shared router error handler reports failed lazy imports.
      return false
    }
  }
  const closeTab = async (path) => {
    const tab = openedTabs.value.find((item) => item.path === path)
    if (!tab || !canClose(tab) || pendingClose.value) return false
    if (path !== activePath.value) {
      openedTabs.value = openedTabs.value.filter((item) => item.path !== path)
      return true
    }

    const index = openedTabs.value.indexOf(tab)
    const candidates = [
      ...openedTabs.value.slice(0, index).reverse(),
      ...openedTabs.value.slice(index + 1)
    ]
    const destination = candidates.find((item) => resolveAccessible(item.fullPath))
      || resolveAccessible('/profile')
    if (!destination || destination.path === path) return false

    pendingClose.value = true
    const startedGeneration = generation
    try {
      const navigated = await navigate(destination)
      if (!navigated || startedGeneration !== generation || activePath.value === path) return false
      openedTabs.value = openedTabs.value.filter((item) => item.path !== path)
      return true
    } finally {
      if (startedGeneration === generation) pendingClose.value = false
    }
  }
  const closeOtherTabs = () => {
    if (pendingClose.value) return
    openedTabs.value = openedTabs.value.filter((tab) => tab.pinned || tab.path === activePath.value)
  }

  return { tabs, activePath, pendingClose, canClose, navigate, closeTab, closeOtherTabs }
}
