import { defineStore } from 'pinia'
import { systemApi } from '@/api/modules/system'

export const useDictionaryStore = defineStore('dictionary', {
  state: () => ({
    groups: {},
    isLoaded: false,
    isLoading: false
  }),

  actions: {
    async fetchDictionary(force = false) {
      if (this.isLoading || (this.isLoaded && !force)) return
      this.isLoading = true
      try {
        const response = await systemApi.getBusinessTypeDictionary()
        const items = Array.isArray(response.data) ? response.data : []
        const groups = {}
        for (const item of items) {
          if (!item.group_code) continue
          if (!groups[item.group_code]) groups[item.group_code] = []
          groups[item.group_code].push(item)
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
