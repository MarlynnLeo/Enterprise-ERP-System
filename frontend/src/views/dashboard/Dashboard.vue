<template>
  <DashboardLayout />
</template>
<script setup>
import { ref, onMounted, computed, onActivated, watch, onUnmounted, nextTick, provide } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { systemApi, documentApi } from '@/api'
// 权限store
const authStore = useAuthStore()
import {
  UserFilled,
  Bell,
  Warning,
  Document,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index'
// ========== 组合式函数导入 ==========
import { useWeather } from './composables/useWeather'
import { useExchangeRate } from './composables/useExchangeRate'
import { useMetalPrices } from './composables/useMetalPrices'
import { useTodos } from './composables/useTodos'
import { useOnlineRanking } from './composables/useOnlineRanking'
import { useProductionPlans } from './composables/useProductionPlans'
import { parseResponseData } from '@/utils/responseParser'
import logger from '@/utils/logger'
import DashboardLayout from './layouts/DashboardLayout.vue'
import { DASHBOARD_CONTEXT } from './dashboardContext'
// ========== 解构组合式函数 ==========
const { weather, fetchWeatherData } = useWeather()
const {
  exchangeRates,
  exchangeRateLoading,
  exchangeRateCards,
  exchangeRateChartRef,
  setMiniChartRef,
  fetchExchangeRates,
  ensureEcharts,
  initExchangeRateChart,
  updateMiniCharts,
  updateMiniChartsGeneric,
  disposeMiniChart,
  disposeCharts
} = useExchangeRate()
const setExchangeRateChartRef = (element) => {
  exchangeRateChartRef.value = element
}
const {
  metalPrices,
  metalPricesLoading,
  metalPriceCards,
  setMetalMiniChartRef,
  fetchMetalPrices,
  updateMetalMiniCharts,
  disposeMetalCharts
} = useMetalPrices(updateMiniChartsGeneric, disposeMiniChart)
const {
  pendingTasks,
  completedTasks,
  pendingTotal,
  completedTotal,
  activeTodoTab,
  currentDate,
  currentYear,
  currentMonth,
  currentDay,
  currentMonthStr,
  calendarDays,
  loadUserTodos,
  getTodoCount,
  goToTodoPage,
  switchTodoTab,
  viewTodoDetail,
  changeMonth,
  generateCalendarDays
} = useTodos()
const {
  onlineTimeRanking,
  rankingLoading,
  rankingDate,
  fetchOnlineTimeRanking
} = useOnlineRanking()
const {
  warningList,
  canViewProductionPlans,
  loadProductionPlans,
  viewProductionPlan
} = useProductionPlans()
// ========== 本地状态（不适合抽取的轻量数据） ==========
const refreshInterval = 60 * 1000 // 轻量数据每分钟刷新，降低老电脑后台压力
// 用户信息
const userProfile = ref(authStore.user || null)
const isLoadingProfile = ref(!authStore.user)
// 统计数据
const statistics = ref({
  managedUsers: 0,
  todoItems: 0,
  warningItems: 0,
  documentCount: 0
})
const isLoadingStats = ref(true)
const todayLabel = new Date().toLocaleDateString('zh-CN', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
})
const activeTodoTasks = computed(() => (
  activeTodoTab.value === 'pending' ? pendingTasks.value : completedTasks.value
))
const activeTodoCount = computed(() => (
  activeTodoTab.value === 'pending' ? pendingTotal.value : completedTotal.value
))
// 统计卡片配置（使用计算属性动态获取数据）
const statCards = computed(() => [
  {
    icon: UserFilled,
    colorClass: 'blue',
    value: statistics.value.managedUsers,
    label: '管理用户'
  },
  {
    icon: Bell,
    colorClass: 'red',
    value: statistics.value.todoItems,
    label: '待办事项'
  },
  {
    icon: Warning,
    colorClass: 'green',
    value: statistics.value.warningItems,
    label: '预警事项'
  },
  {
    icon: Document,
    colorClass: 'purple',
    value: statistics.value.documentCount,
    label: '文档数量'
  }
])
// 价格面板 Tab 切换后刷新对应图表
const onPricePanelTabChange = async (tab) => {
  await nextTick()
  if (disposed) return
  if (tab === 'metal') {
    await ensureEcharts()
    if (disposed) return
    updateMetalMiniCharts()
  } else {
    await initExchangeRateChart()
    if (disposed) return
    updateMiniCharts()
  }
}
// 定时器管理
let userDataTimer = null
let exchangeRateTimer = null
let dashboardRefreshPromise = null
let secondaryDashboardPromise = null
let idleInitHandle = null
let idleInitUsesIdleCallback = false
let disposed = false

const runWhenIdle = (callback, timeout = 400) => {
  if (disposed) return
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    idleInitUsesIdleCallback = true
    idleInitHandle = window.requestIdleCallback(() => {
      idleInitHandle = null
      if (!disposed) callback()
    }, { timeout })
    return
  }

  idleInitUsesIdleCallback = false
  idleInitHandle = window.setTimeout(() => {
    idleInitHandle = null
    if (!disposed) callback()
  }, timeout)
}

const cancelIdleInitialization = () => {
  if (idleInitHandle === null) return
  if (
    idleInitUsesIdleCallback &&
    typeof window !== 'undefined' &&
    typeof window.cancelIdleCallback === 'function'
  ) {
    window.cancelIdleCallback(idleInitHandle)
  } else {
    window.clearTimeout(idleInitHandle)
  }
  idleInitHandle = null
}

// === 全局状态常量映射字典（仅模板直接引用的保留在此） ===
// 加载用户数据
const loadUserProfile = async (force = false) => {
  try {
    // 路由守卫已经验证并缓存用户资料。普通仪表盘刷新直接复用缓存，
    // 只有资料更新事件等明确场景才强制重新请求约 113 KB 的 profile。
    if (!force && authStore.user) {
      userProfile.value = authStore.user
      return
    }
    isLoadingProfile.value = true
    await authStore.fetchUserProfile()
    userProfile.value = authStore.user
  } catch (error) {
    logger.error('获取用户信息失败:', error)
  } finally {
    isLoadingProfile.value = false
  }
}
// 更新预警统计数量
const updateWarningStats = (count) => {
  statistics.value.warningItems = count
}
// 更新任务统计数量
const updateTaskStats = () => {
  statistics.value.todoItems = getTodoCount()
}
const getTotalFromResponse = (response) => {
  const data = parseResponseData(response, {})
  return Number(data.total ?? data.totalCount ?? data.pagination?.total ?? data.meta?.total ?? (Array.isArray(data) ? data.length : 0)) || 0
}
const loadDashboardStats = async () => {
  const tasks = []
  if (authStore.hasPermission('system:users:view') || authStore.hasPermission('system:users')) {
    tasks.push(
      systemApi.getUsers({ page: 1, pageSize: 1 }).then((response) => {
        statistics.value.managedUsers = getTotalFromResponse(response)
      })
    )
  }
  if (authStore.hasPermission('system:documents:view') || authStore.hasPermission('system:documents')) {
    tasks.push(
      documentApi.getList({ page: 1, pageSize: 1 }).then((response) => {
        statistics.value.documentCount = getTotalFromResponse(response)
      })
    )
  }
  if (tasks.length) {
    await Promise.allSettled(tasks)
  }
}
// 刷新所有价格数据（金属+汇率）
const refreshAllPrices = async () => {
  try {
    const results = await Promise.all([fetchMetalPrices({ force: true }), fetchExchangeRates()])
    if (!disposed && results.every(Boolean)) ElMessage.success('数据已更新')
  } catch (error) {
    logger.error('刷新价格数据失败:', error)
    ElMessage.error('刷新数据失败，请稍后重试')
  }
}
// 刷新仪表盘核心数据，并同步顶部统计
const refreshDashboardData = async (forceProfile = false) => {
  if (dashboardRefreshPromise) {
    return dashboardRefreshPromise
  }

  dashboardRefreshPromise = (async () => {
    await Promise.allSettled([
      loadUserProfile(forceProfile),
      loadUserTodos()
    ])
    updateTaskStats()
  })()

  try {
    return await dashboardRefreshPromise
  } finally {
    dashboardRefreshPromise = null
  }
}

const refreshSecondaryDashboardData = async (force = false) => {
  if (secondaryDashboardPromise) {
    return secondaryDashboardPromise
  }

  secondaryDashboardPromise = (async () => {
    const [planResult] = await Promise.allSettled([
      loadProductionPlans(),
      fetchOnlineTimeRanking(force),
      loadDashboardStats()
    ])
    updateWarningStats(planResult.status === 'fulfilled' ? (planResult.value || 0) : 0)
  })()

  try {
    return await secondaryDashboardPromise
  } finally {
    secondaryDashboardPromise = null
  }
}

const handleUserProfileUpdated = async () => {
  await Promise.all([
    loadUserProfile(true),
    fetchOnlineTimeRanking(true)
  ])
}
// ========== 生命周期钩子 ==========
// 组件挂载时加载数据
onMounted(async () => {
  window.addEventListener('erp:user-profile-updated', handleUserProfileUpdated)

  // 初始化加载状态
  isLoadingStats.value = true

  // === 第一阶段：首屏快速渲染核心待办与顶部指标 ===
  await refreshDashboardData(false)
  if (disposed) return

  // 初始化轻量日历数据
  calendarDays.value = generateCalendarDays(currentDate.value)

  // === 第二阶段：把非核心数据拆到真正的空闲窗口，避免与菜单交互争抢主线程 ===
  runWhenIdle(() => {
    refreshSecondaryDashboardData(false).finally(() => {
      isLoadingStats.value = false
    })

    // Queue the independent network reads only after the first secondary
    // slice has yielded. This keeps the idle scheduler single-flight.
    runWhenIdle(() => {
      Promise.allSettled([
        fetchWeatherData(),
        fetchExchangeRates(),
        fetchMetalPrices()
      ]).then(async () => {
        if (disposed) return
        await ensureEcharts()
        if (disposed) return
        await initExchangeRateChart()
        if (disposed) return
        updateMiniCharts()
        updateMetalMiniCharts()
      }).catch((error) => {
        logger.error('加载仪表盘环境数据失败:', error)
      })
    }, 1200)
  }, 1600)

  // 设置定时刷新
  userDataTimer = setInterval(() => {
    refreshDashboardData()
    refreshSecondaryDashboardData()
  }, refreshInterval)

  // 汇率数据定时刷新（每5分钟，降低老电脑后台压力）
  exchangeRateTimer = setInterval(() => {
    fetchExchangeRates()
  }, 5 * 60 * 1000)
})
// 组件卸载时清除定时器和图表
onUnmounted(() => {
  disposed = true
  window.removeEventListener('erp:user-profile-updated', handleUserProfileUpdated)
  cancelIdleInitialization()
  if (userDataTimer) {
    clearInterval(userDataTimer)
    userDataTimer = null
  }
  if (exchangeRateTimer) {
    clearInterval(exchangeRateTimer)
    exchangeRateTimer = null
  }
  disposeCharts()
  disposeMetalCharts()
})
// 当页面被激活（如从其他页面返回）时重新加载用户数据
onActivated(() => {
  refreshDashboardData(false)
  // 智能刷新金属价格数据（如果超过30分钟没有更新）
  const now = new Date()
  const lastUpdate = metalPrices.value.lastUpdate
  if (!lastUpdate || (now - lastUpdate) > 30 * 60 * 1000) {
    fetchMetalPrices()
  }
  // 智能刷新汇率数据（如果超过5分钟没有更新）
  const lastExchangeUpdate = exchangeRates.value.lastUpdate
  if (!lastExchangeUpdate || (now - lastExchangeUpdate) > 5 * 60 * 1000) {
    fetchExchangeRates()
  }
})
// 监听用户数据变化
watch(() => authStore.user, (newValue) => {
  if (newValue) {
    userProfile.value = newValue
  }
}, { deep: true })
// 监听日期变化，更新日历
watch(() => currentDate.value, (newValue) => {
  calendarDays.value = generateCalendarDays(newValue)
})
// Layouts share data and timers; only their presentation changes with the theme.
const refreshDashboardCharts = async () => {
  await ensureEcharts()
  if (disposed) return
  await initExchangeRateChart()
  if (disposed) return
  updateMiniCharts()
  updateMetalMiniCharts()
}
provide(DASHBOARD_CONTEXT, {
  statCards, isLoadingStats, userProfile, weather, isLoadingProfile,
  activeTodoTasks, activeTodoTab, activeTodoCount, switchTodoTab, goToTodoPage, viewTodoDetail,
  onlineTimeRanking, rankingLoading, rankingDate, fetchOnlineTimeRanking,
  metalPriceCards, exchangeRateCards, exchangeRateLoading, metalPricesLoading, metalPrices, exchangeRates,
  setMiniChartRef, setMetalMiniChartRef, setExchangeRateChartRef, refreshAllPrices, onPricePanelTabChange,
  canViewProductionPlans, warningList, viewProductionPlan, changeMonth,
  currentMonthStr, currentYear, currentMonth, currentDay, calendarDays, todayLabel, refreshDashboardCharts
})
</script>
