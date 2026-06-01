import { ref } from 'vue'
import { userApi } from '@/api'

const RANKING_CACHE_DURATION = 10 * 1000
const MIN_LOADING_DURATION = 250

export function useOnlineRanking() {
  const onlineTimeRanking = ref([])
  const rankingLoading = ref(false)
  const rankingDate = ref('')
  const rankingCache = ref(null)
  const rankingCacheTime = ref(0)

  const fetchOnlineTimeRanking = async (forceRefresh = false) => {
    const now = Date.now()

    if (!forceRefresh && rankingCache.value && now - rankingCacheTime.value < RANKING_CACHE_DURATION) {
      onlineTimeRanking.value = rankingCache.value.rankings
      rankingDate.value = rankingCache.value.date
      return
    }

    rankingLoading.value = true
    const startTime = Date.now()

    try {
      const response = await userApi.getOnlineTimeRanking()
      const payload = response?.data ?? response
      const rankings = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : payload?.rankings || payload?.data?.rankings || []
      const date = payload?.date || payload?.data?.date || new Date().toLocaleDateString('zh-CN')

      const elapsedTime = Date.now() - startTime
      if (elapsedTime < MIN_LOADING_DURATION) {
        await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DURATION - elapsedTime))
      }

      onlineTimeRanking.value = rankings
      rankingDate.value = date
      rankingCache.value = { rankings, date }
      rankingCacheTime.value = Date.now()
    } catch (error) {
      console.error('获取在线时长排行榜失�?', error)
      onlineTimeRanking.value = []
      rankingDate.value = ''
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
