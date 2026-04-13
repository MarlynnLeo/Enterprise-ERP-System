/**
 * useOnlineRanking.js
 * @description 在线时长排行榜数据的组合式函数（从 Dashboard.vue 抽取）
 */
import { ref } from 'vue'
import { userApi } from '../../../services/api'

export function useOnlineRanking() {
  // 在线时长排行榜
  const onlineTimeRanking = ref([])
  const rankingLoading = ref(false)
  const rankingDate = ref('')
  const rankingCache = ref(null) // 缓存排行榜数据
  const rankingCacheTime = ref(null) // 缓存时间
  const RANKING_CACHE_DURATION = 1000 // 缓存1秒，保证头像特效及时更新

  // 翻转卡片状态
  const flippedCards = ref({
    0: false,
    1: false,
    2: false
  })

  const toggleFlip = (index) => {
    if (onlineTimeRanking.value[index]) {
      flippedCards.value[index] = !flippedCards.value[index]
    }
  }

  // 排行榜展示配置（固定顺序：第二、第一、第三）
  const podiumCardConfigs = [
    { dataIndex: 1, rankClass: 'rank-2', badgeText: 'NO.2', isChampion: false, iconSize: 40 },
    { dataIndex: 0, rankClass: 'rank-1', badgeText: 'NO.1', isChampion: true, iconSize: 50 },
    { dataIndex: 2, rankClass: 'rank-3', badgeText: 'NO.3', isChampion: false, iconSize: 35 }
  ]

  // 获取在线时长排行榜（带缓存）
  const fetchOnlineTimeRanking = async (forceRefresh = false) => {
    // 检查缓存是否有效
    const now = Date.now()
    if (!forceRefresh && rankingCache.value && rankingCacheTime.value) {
      const cacheAge = now - rankingCacheTime.value
      if (cacheAge < RANKING_CACHE_DURATION) {
        // 使用缓存数据（无需加载动画）
        onlineTimeRanking.value = rankingCache.value.rankings || []
        rankingDate.value = rankingCache.value.date || ''
        return
      }
    }

    rankingLoading.value = true
    const startTime = Date.now()

    try {
      const response = await userApi.getOnlineTimeRanking()
      // axios拦截器已自动解包，response.data 直接就是数据
      // 兼容解包后和未解包的格式
      const data = response.data || response
      const rankings = data?.rankings || data?.data?.rankings || []
      const date = data?.date || data?.data?.date || ''

      // 计算已花费的时间
      const elapsedTime = Date.now() - startTime
      const minDisplayTime = 300 // 最小显示300ms的骨架屏，避免闪烁

      // 如果请求太快，延迟一下让用户看到骨架屏
      if (elapsedTime < minDisplayTime) {
        await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsedTime))
      }

      onlineTimeRanking.value = rankings
      rankingDate.value = date

      // 缓存数据
      rankingCache.value = {
        rankings: rankings,
        date: date
      }
      rankingCacheTime.value = now
    } catch (error) {
      console.error('获取在线时长排行榜失败:', error)
      onlineTimeRanking.value = []
    } finally {
      rankingLoading.value = false
    }
  }

  return {
    onlineTimeRanking,
    rankingLoading,
    rankingDate,
    flippedCards,
    toggleFlip,
    podiumCardConfigs,
    fetchOnlineTimeRanking
  }
}
