<!--
/**
 * Dashboard.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page dashboard-page dashboard-container">
    <div class="main-layout">
      <!-- 工作概览和个人信息 -->
      <el-row :gutter="20">
        <el-col
          v-for="(stat, index) in statCards"
          :key="index"
          :xs="24"
          :sm="6"
          :md="4"
        >
          <div class="stat-card" :class="{ 'stat-card-loading': isLoadingStats }">
            <div class="icon-container" :class="stat.colorClass">
              <el-icon><component :is="stat.icon" /></el-icon>
            </div>
            <div class="stat-content">
              <div class="number" v-if="!isLoadingStats">
                <span class="animated-number" :data-value="stat.value">{{ stat.value }}</span>
              </div>
              <el-skeleton-item v-else variant="h3" class="skel-icon" />
              <div class="text">{{ stat.label }}</div>
            </div>
            <!-- 添加数据更新指示器 -->
            <div class="update-indicator" v-if="!isLoadingStats"></div>
          </div>
        </el-col>

        <!-- 个人信息与天气整合卡片 -->
        <el-col :xs="24" :md="8">
          <PersonalInfoCard
            :userProfile="userProfile"
            :weather="weather"
            :loading="isLoadingProfile"
          />
        </el-col>
      </el-row>
      <!-- 待办事项、我发起和统计图表在同一行 -->
      <el-row :gutter="20">
        <el-col :xs="24" :sm="24" :md="8">
          <DashboardTodoList
            :tasks="activeTodoTasks"
            :tab="activeTodoTab"
            :count="activeTodoCount"
            @switch-tab="switchTodoTab"
            @go-to-all="goToTodoPage"
            @view="viewTodoDetail"
          />
        </el-col>

        <el-col :xs="24" :sm="24" :md="8">
          <div class="chart-container ranking-container">
            <OnlineTimeRanking
              :rankings="onlineTimeRanking"
              :loading="rankingLoading"
              :date="rankingDate"
              @refresh="fetchOnlineTimeRanking(true)"
            />
          </div>
        </el-col>

        <el-col :xs="24" :sm="24" :md="8">
          <PriceExchangePanel
            :metal-price-cards="metalPriceCards"
            :exchange-rate-cards="exchangeRateCards"
            :exchange-rate-loading="exchangeRateLoading"
            :metal-prices-loading="metalPricesLoading"
            :metal-last-update="metalPrices.lastUpdate"
            :exchange-last-update="exchangeRates.lastUpdate"
            :data-source="exchangeRates.dataSource || ''"
            :metal-data-source="metalPrices.dataSource || ''"
            :set-mini-chart-ref="setMiniChartRef"
            :set-metal-mini-chart-ref="setMetalMiniChartRef"
            :set-exchange-rate-chart-ref="setExchangeRateChartRef"
            @refresh="refreshAllPrices"
            @tab-change="onPricePanelTabChange"
          />
        </el-col>
      </el-row>
      <!-- 日历和预警并排在同一行 -->
      <el-row :gutter="20">
        <el-col v-if="canViewProductionPlans" :xs="24" :sm="24" :md="14">
          <ProductionPlanTable
            :warningList="warningList"
            @view="viewProductionPlan"
          />
        </el-col>

        <el-col :xs="24" :sm="24" :md="canViewProductionPlans ? 10 : 24">
          <div class="calendar-wrapper">
            <div class="calendar-header">
              <div class="month-selector">
                <el-icon class="month-arrow" @click="changeMonth(-1)"><ArrowLeft /></el-icon>
                <span>{{ currentMonthStr }}</span>
                <el-icon class="month-arrow" @click="changeMonth(1)"><ArrowRight /></el-icon>
              </div>
              <el-button link class="more-btn">更多</el-button>
            </div>
            <div class="calendar-alert">{{ currentYear }}年{{ currentMonth }}月{{ currentDay }}日</div>
            <div class="calendar-content">
              <div class="weekdays-header">
                <div class="weekday">日</div>
                <div class="weekday">一</div>
                <div class="weekday">二</div>
                <div class="weekday">三</div>
                <div class="weekday">四</div>
                <div class="weekday">五</div>
                <div class="weekday">六</div>
              </div>
              <div class="days-grid">
                <div class="day-cell" v-for="day in calendarDays" :key="day.date">
                  <div :class="['day-number', {'has-events': day.hasEvents, 'current': day.isCurrentDay, 'other-month': !day.isCurrentMonth}]">
                    {{ day.date }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted, computed, onActivated, watch, onUnmounted, nextTick } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { systemApi, documentApi } from '@/api'
// 权限store
const authStore = useAuthStore()
import {
  UserFilled,
  Bell,
  Warning,
  ArrowLeft,
  ArrowRight,
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
import OnlineTimeRanking from './components/OnlineTimeRanking.vue'
import PersonalInfoCard from './components/PersonalInfoCard.vue'
import ProductionPlanTable from './components/ProductionPlanTable.vue'
import PriceExchangePanel from './components/PriceExchangePanel.vue'
import DashboardTodoList from './components/DashboardTodoList.vue'
import { parseResponseData } from '@/utils/responseParser'
import logger from '@/utils/logger'
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
} = useMetalPrices(updateMiniChartsGeneric)
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
  if (tab === 'metal') {
    await ensureEcharts()
    updateMetalMiniCharts()
  } else {
    await initExchangeRateChart()
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

const runWhenIdle = (callback, timeout = 400) => {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    idleInitUsesIdleCallback = true
    idleInitHandle = window.requestIdleCallback(() => {
      idleInitHandle = null
      callback()
    }, { timeout })
    return
  }

  idleInitUsesIdleCallback = false
  idleInitHandle = window.setTimeout(() => {
    idleInitHandle = null
    callback()
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
    await Promise.all([fetchMetalPrices({ force: true }), fetchExchangeRates()])
    ElMessage.success('数据已更新')
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
      ]).catch((error) => {
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
</script>
<style scoped>
.dashboard-container {
  padding: 20px;
  background-color: transparent;
  min-height: 100vh;
  animation: fadeIn 0.5s ease-in-out;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.main-layout {
  max-width: 1600px;
  margin: 0 auto;
}
/* 响应式优化 */
@media (max-width: 768px) {
  .dashboard-container {
    padding: 10px;
  }
  .stat-card {
    height: 80px !important;
    padding: 12px !important;
  }
  .number {
    font-size: 20px !important;
  }
  .text {
    font-size: 12px !important;
  }
  .combined-info-card {
    height: auto !important;
    min-height: 90px;
  }
  .chart-container,
  .calendar-wrapper {
    height: auto !important;
    min-height: 300px;
  }
}
/* 统计卡片样式 - Dashboard特定布局（横向：图标+内容，水平居中） */
/* 覆盖全局的居中布局 */
.stat-card {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  text-align: left !important;
  padding: 15px !important;
  height: 90px !important;
  background: var(--color-bg-base) !important;
  border: 1px solid var(--color-border-lighter) !important;
  border-radius: 10px !important;
  box-shadow: 0 2px 12px 0 color-mix(in srgb, var(--ds-black) 5%, transparent) !important;
  transition: border-color var(--transition-base) ease, background-color var(--transition-base) ease !important;
}
.stat-card:hover {
  border-color: var(--color-border-light) !important;
  background: var(--color-bg-section) !important;
}
/* 统计卡片加载状态 */
.stat-card-loading {
  position: relative;
  overflow: hidden;
}
.stat-card-loading::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--ds-white) 30%, transparent), transparent);
  animation: shimmer 1.5s infinite;
}
@keyframes shimmer {
  0% {
    left: -100%;
  }
  100% {
    left: 100%;
  }
}
/* 数字动画效果 */
.animated-number {
  display: inline-block;
  transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease, opacity 0.3s ease, transform 0.3s ease;
}
/* 更新指示器 */
.update-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--color-success);
  opacity: 0;
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% {
    opacity: 0;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}
.stat-content {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  margin-left: 12px;
}
.purple {
  background-color: var(--color-info);
}
.icon-container {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  position: relative;
}
.blue {
  background: var(--ds-blue);
}
.red {
  background: var(--ds-red);
}
.green {
  background: var(--color-success);
}
.purple {
  background: var(--color-info);
}
.icon-container .el-icon {
  font-size: 20px;
  color: var(--color-on-primary);
  position: relative;
  z-index: 1;
}
.number {
  font-size: 24px;
  font-weight: bold;
  color: var(--color-text-primary);
  margin-bottom: 5px;
}
.text {
  color: var(--color-text-regular);
  font-size: 14px;
}
/* 整合的个人信息与天气卡片 - 统一卡片风格 */
.combined-info-card {
  background: var(--theme-feature-card-bg);
  border-radius: 10px;
  padding: 15px;
  box-shadow: var(--theme-feature-card-shadow);
  margin-bottom: var(--spacing-lg);
  height: 90px;
  position: relative;
  overflow: hidden;
  transition: border-color var(--transition-base) ease, box-shadow var(--transition-base) ease, background-color var(--transition-base) ease;
  border: 1px solid var(--theme-feature-card-border);
}
.combined-info-card::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -50%;
  width: 200%;
  height: 200%;
  background: var(--theme-feature-card-decor);
  animation: rotate 20s linear infinite;
}
@keyframes rotate {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
.combined-info-card:hover {
  transform: none;
  box-shadow: var(--theme-feature-card-hover-shadow);
  border-color: var(--theme-feature-card-border);
}
.loading-section {
  height: 100%;
  display: flex;
  align-items: center;
}
.combined-content {
  position: relative;
  z-index: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  color: var(--theme-feature-card-color);
}
/* 左侧个人信息 */
.left-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  justify-content: center;
}
.left-info .name {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.left-info .role-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  opacity: 0.9;
}
.left-info .role-item .el-icon {
  font-size: 12px;
}
.left-info .role-item span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 中间头像 */
.center-avatar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 100%;
  align-self: center;
}
.center-avatar .avatar-container {
  position: relative;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.center-avatar .avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid color-mix(in srgb, var(--ds-white) 50%, transparent);
  box-shadow: 0 0 15px color-mix(in srgb, var(--ds-white) 30%, transparent);
  z-index: 2;
  transition: background-color var(--transition-base) ease, border-color var(--transition-base) ease, color var(--transition-base) ease, box-shadow var(--transition-base) ease, opacity var(--transition-base) ease, transform var(--transition-base) ease;
}
.center-avatar .avatar:hover {
  border-color: color-mix(in srgb, var(--ds-white) 80%, transparent);
  box-shadow: 0 0 20px color-mix(in srgb, var(--ds-white) 50%, transparent);
}
/* 右侧天气信息 */
.right-weather {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  justify-content: center;
  text-align: right;
  padding-left: 15px;
}
.weather-header-compact {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  font-size: 13px;
  opacity: 0.95;
}
.weather-time {
  font-size: 10px;
  opacity: 0.8;
}
.weather-main-compact {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.temp-large {
  font-size: 20px;
  font-weight: bold;
  line-height: 1;
}
.weather-icon-compact {
  display: flex;
  align-items: center;
}
.weather-icon {
  font-size: 28px;
}
.weather-icon-sunny {
  color: var(--ds-yellow-strong);
}
.weather-icon-partly-cloudy {
  color: var(--ds-yellow-bg);
}
.weather-icon-cloudy {
  color: var(--color-border-lighter);
}
.weather-icon-rainy {
  color: var(--ds-blue-strong);
}
.weather-desc-compact {
  font-size: 12px;
  opacity: 0.9;
  font-weight: 500;
}
.weather-details-compact {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  font-size: 11px;
  opacity: 0.85;
}
.weather-detail-icon {
  font-size: 12px;
}
/* 头像容器和光环特效 */
.avatar-container {
  position: relative;
  width: 50px;
  height: 50px;
  margin-right: 15px;
  flex-shrink: 0;
}
/* 头像光环效果 */
.avatar-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--ds-blue) 30%, transparent) 0%, transparent 70%);
  animation: glowPulse 3s ease-in-out infinite;
  z-index: 0;
}
@keyframes glowPulse {
  0%, 100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.5;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.1);
    opacity: 0.8;
  }
}
/* 粒子容器 */
.avatar-particles {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 80px;
  height: 80px;
  transform: translate(-50%, -50%);
  z-index: 0;
}
/* 粒子特效 */
.particle {
  --i: 0;
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: linear-gradient(45deg, var(--ds-blue), var(--ds-cyan-strong));
  box-shadow: 0 0 6px color-mix(in srgb, var(--ds-blue) 80%, transparent);
  top: 50%;
  left: 50%;
  animation: particleOrbit 4s linear infinite;
  animation-delay: calc(var(--i) * -0.5s);
  opacity: 0;
}
@keyframes particleOrbit {
  0% {
    transform: translate(-50%, -50%) rotate(calc(var(--i) * 45deg)) translateX(40px) scale(0);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) rotate(calc(var(--i) * 45deg + 360deg)) translateX(40px) scale(1);
    opacity: 0;
  }
}
/* 通用头像样式（用于排行榜等其他地方） */
.avatar {
  position: relative;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid color-mix(in srgb, var(--ds-blue) 30%, transparent);
  box-shadow: 0 0 15px color-mix(in srgb, var(--ds-blue) 40%, transparent);
  z-index: 1;
  transition: background-color var(--transition-base) ease, border-color var(--transition-base) ease, color var(--transition-base) ease, box-shadow var(--transition-base) ease, opacity var(--transition-base) ease, transform var(--transition-base) ease;
}
/* 注意：整合卡片的头像悬停效果由 .center-avatar .avatar:hover 控制 */
.info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 50px; /* 确保与头像高度一致 */
}
.info .name {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 5px;
  color: var(--color-text-primary);
}
.role-item {
  margin-bottom: 4px;
}
.icon-text {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: var(--color-text-regular);
}
.icon-text .el-icon {
  margin-right: 5px;
  font-size: 14px;
  color: var(--color-text-secondary);
}
/* 公共容器基础样式 - 统一卡片风格 */
.chart-container,
.calendar-wrapper {
  background: var(--color-bg-base);
  border-radius: 10px;
  box-shadow: 0 2px 12px 0 color-mix(in srgb, var(--ds-black) 5%, transparent);
  margin-bottom: var(--spacing-lg);
  overflow: hidden;
  border: 1px solid var(--color-border-lighter);
  height: 380px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  transition: background-color var(--transition-base) ease, border-color var(--transition-base) ease, color var(--transition-base) ease, box-shadow var(--transition-base) ease, opacity var(--transition-base) ease, transform var(--transition-base) ease;
}
/* 卡片悬停效果 */
.chart-container:hover,
.calendar-wrapper:hover {
  box-shadow: 0 4px 16px 0 color-mix(in srgb, var(--ds-black) 10%, transparent);
  border-color: var(--color-border-light);
}
/* 空头像样式 */
.empty-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-bg-hover) 0%, var(--color-border-light) 100%);
  border: 2px dashed var(--color-border-base);
}
/* 图表样式（特殊配置已在公共样式中） */
.chart-header {
  padding: 0;
  border-bottom: 1px solid var(--color-border-lighter);
  flex-shrink: 0;
}
.chart-body {
  flex: 1;
  padding: 15px;
  position: relative;
}
/* 日历样式（特殊配置） */
.calendar-wrapper {
  padding: 15px;
}
.calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  flex-shrink: 0;
  box-sizing: border-box; /* ✨ 统一box-sizing */
}
.month-selector {
  display: flex;
  align-items: center;
  color: var(--color-text-primary);
  font-weight: bold;
  font-size: 14px;
}
.month-arrow {
  margin: 0 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text-secondary);
}
.more-btn {
  color: var(--color-primary);
  font-size: 12px;
}
.calendar-alert {
  background-color: var(--color-bg-hover);
  color: var(--color-text-primary);
  padding: 8px;
  border-radius: var(--radius-sm);
  text-align: center;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: bold;
  box-shadow: 0 2px 6px color-mix(in srgb, var(--ds-black) 5%, transparent);
  box-sizing: border-box; /* ✨ 统一box-sizing */
}
.calendar-content {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  box-sizing: border-box; /* ✨ 统一box-sizing */
}
.weekdays-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  color: var(--color-text-regular);
  margin-bottom: 10px;
  font-size: 13px;
  flex-shrink: 0;
}
.days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 5px;
  flex: 1;
}
.day-cell {
  aspect-ratio: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 13px;
}
.day-number {
  width: 28px;
  height: 28px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  transition: background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  position: relative;
}
.day-number:hover {
  background-color: var(--color-primary-light-9);
  box-shadow: none;
}
.day-number.current {
  background: var(--theme-feature-card-bg);
  color: var(--theme-feature-card-color);
  font-weight: bold;
  box-shadow: var(--theme-feature-card-shadow);
  animation: currentDayPulse 2s ease-in-out infinite;
}
@keyframes currentDayPulse {
  0%, 100% {
    box-shadow: var(--theme-feature-card-shadow);
  }
  50% {
    box-shadow: var(--theme-feature-card-hover-shadow);
  }
}
.day-number.has-events {
  background: linear-gradient(135deg, var(--module-red) 0%, var(--ds-orange-strong) 100%);
  color: var(--color-on-primary);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--module-red) 30%, transparent);
}
.day-number.has-events::after {
  content: '';
  position: absolute;
  bottom: 2px;
  width: 4px;
  height: 4px;
  background-color: var(--color-on-primary);
  border-radius: 50%;
}
.day-number.other-month {
  color: var(--color-text-placeholder);
  background-color: transparent;
  opacity: 0.5;
}
.day-number.other-month:hover {
  opacity: 0.8;
}
@media (max-width: 768px) {
  .combined-info-card {
    height: auto;
    padding: 15px;
  }
  .combined-content {
    flex-direction: column;
    gap: 15px;
    text-align: center;
  }
  .left-info,
  .right-weather {
    width: 100%;
  }
  .center-avatar {
    order: -1;
  }
  .weather-header-compact {
    justify-content: center;
  }
  .weather-main-compact {
    justify-content: center;
  }
  .weather-details-compact {
    justify-content: center;
  }
}
/* 价格面板样式见 assets/price-panel.css */
/* 滚动指示器样式 */
.scroll-indicator {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  background: color-mix(in srgb, var(--color-primary) 90%, transparent);
  color: var(--color-on-primary);
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  animation: bounce 2s infinite;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--ds-black) 15%, transparent);
  z-index: 10;
  cursor: pointer;
  transition: background-color var(--transition-base) ease, border-color var(--transition-base) ease, color var(--transition-base) ease, box-shadow var(--transition-base) ease, opacity var(--transition-base) ease, transform var(--transition-base) ease;
  user-select: none;
}
.scroll-indicator:hover {
  background: color-mix(in srgb, var(--color-primary) 100%, transparent);
  transform: translateX(-50%);
  box-shadow: 0 6px 16px color-mix(in srgb, var(--ds-black) 20%, transparent);
}
.scroll-indicator i {
  font-size: 14px;
}
@keyframes bounce {
  0%, 20%, 50%, 80%, 100% {
    transform: translateX(-50%) translateY(0);
  }
  40% {
    transform: translateX(-50%) translateY(-5px);
  }
  60% {
    transform: translateX(-50%) translateY(-3px);
  }
}
/* 数据源样式 */
.data-source {
  font-size: 11px;
  color: var(--color-text-secondary);
  font-weight: normal;
}
.ranking-container {
  overflow: hidden;
}
/* 分节标题样式 */
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-regular);
  margin-bottom: 12px;
  padding-left: 10px;
  border-left: 3px solid var(--color-primary);
}
/* 分节分隔线 */
.section-divider {
  height: 1px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--color-primary) 20%, transparent) 0%, transparent 100%);
  margin: 20px 0;
}
</style>
