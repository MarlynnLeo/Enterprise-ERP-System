import { defineStore } from 'pinia'
import { watch } from 'vue'
import { systemApi } from '@/api/modules/system'
import { useAuthStore } from '@/stores/auth'

export const useDictionaryStore = defineStore('dictionary', {
  state: () => ({
    groups: {},
    isLoaded: false,
    isLoading: false
  }),

  actions: {
    async fetchDictionary(force = false) {
      const auth = useAuthStore()
      if (!auth.isAuthenticated || !auth.profileLoaded) return
      if (this.isLoading || (this.isLoaded && !force)) return
      this.isLoading = true
      try {
        const response = await systemApi.getBusinessTypeDictionary()
        const items = Array.isArray(response.data) ? response.data : []
        const groups = {}
        for (const item of items) {
          if (!item.groupCode) continue
          if (!groups[item.groupCode]) groups[item.groupCode] = []
          groups[item.groupCode].push(item)
        }
        this.groups = groups
        this.isLoaded = true
      } finally {
        this.isLoading = false
      }
    },

    getItem(groupCode, code) {
      return (this.groups[groupCode] || []).find((item) => item.code === code)
    }
  }
})

export const watchAuthenticatedDictionary = (pinia) => {
  const auth = useAuthStore(pinia)
  const dictionary = useDictionaryStore(pinia)
  return watch(
    () => auth.isAuthenticated && auth.profileLoaded,
    (authenticated) => {
      if (authenticated) dictionary.fetchDictionary(true).catch(() => {})
    },
    { immediate: true }
  )
}
