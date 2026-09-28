import { watch } from 'vue'

/** Keep the shell menu tied to the currently authenticated permission set. */
export function useWorkspaceMenus({ auth, permissionStore, loadMenus, onError }) {
  return watch(
    () => [auth.user?.id ?? auth.user?.username, auth.isAuthenticated, auth.permissionsLoaded, auth.permissions],
    async (_current, _previous, onCleanup) => {
      let cancelled = false
      onCleanup(() => { cancelled = true })

      // Never leave a previous account's or permission set's menu on screen
      // while its replacement is loading.
      permissionStore.setMenuTree([])
      if (!auth.isAuthenticated || !auth.permissionsLoaded) return

      try {
        const menus = await loadMenus()
        if (cancelled) return
        if (!Array.isArray(menus)) throw new Error('Invalid workspace menu response')
        permissionStore.setMenuTree(menus)
      } catch (error) {
        if (!cancelled) onError(error)
      }
    },
    { immediate: true, deep: true }
  )
}
