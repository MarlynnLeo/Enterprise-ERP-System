import { ref } from 'vue'
import { userApi } from '@/api'
import { useAuthStore } from '@/stores/auth'

const RANKING_CACHE_DURATION = 60 * 1000

export function useOnlineRanking() {
  const authStore = useAuthStore()
  const onlineTimeRanking = ref([])
  const rankingLoading = ref(false)
  const rankingDate = ref('')
  const rankingCache = ref(null)
  const rankingCacheTime = ref(0)

  const canViewOnlineRanking = () => (
    authStore.hasPermission('dashboard')
    || authStore.hasPermission('system:monitor')
    || authStore.hasPermission('system:users:view')
    || authStore.hasPermission('system:users')
  )

  const fetchOnlineTimeRanking = async (forceRefresh = false) => {
    if (!canViewOnlineRanking()) {
      onlineTimeRanking.value = []
      rankingDate.value = ''
      return
    }

    const now = Date.now()

    if (!forceRefresh && rankingCache.value && now - rankingCacheTime.value < RANKING_CACHE_DURATION) {
      onlineTimeRanking.value = rankingCache.value.rankings
      rankingDate.value = rankingCache.value.date
      return
    }

    rankingLoading.value = true

    try {
      const response = await userApi.getOnlineTimeRanking()
      const payload = response?.data ?? response
      const rankings = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : payload?.rankings || payload?.data?.rankings || []
      const date = payload?.date || payload?.data?.date || new Date().toLocaleDateString('zh-CN')

      onlineTimeRanking.value = rankings
      rankingDate.value = date
      rankingCache.value = { rankings, date }
      rankingCacheTime.value = Date.now()
    } catch (error) {
      onlineTimeRanking.value = []
      rankingDate.value = ''
      if (error.response?.status !== 403) {
        console.error('获取在线时长排行榜失败', error)
      }
    } finally {
      rankingLoading.value = false
    }
  }

  return {
    onlineTimeRanking,
    rankingLoading,
    rankingDate,
    fetchOnlineTimeRanking
  }
}
