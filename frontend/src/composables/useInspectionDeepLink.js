import { onMounted, onActivated, onDeactivated, watch } from 'vue'

// Cached inspection pages must reopen a newly requested document without treating
// another quality page's query as their own. Mount + initial activation open once.
export function useInspectionDeepLink(router, pagePath, openInspection) {
  let lastId = null
  let active = true
  const openCurrent = () => {
    const route = router.currentRoute?.value
    if (!active || route?.path !== pagePath) { lastId = null; return }
    const id = Number(route.query?.inspectionId)
    if (!Number.isSafeInteger(id) || id <= 0) { lastId = null; return }
    if (lastId === id) return
    lastId = id
    void openInspection({ id })
  }
  watch(() => [router.currentRoute?.value?.path, router.currentRoute?.value?.query?.inspectionId], openCurrent)
  onMounted(openCurrent)
  onActivated(() => { active = true; openCurrent() })
  onDeactivated(() => { active = false; lastId = null })
}
