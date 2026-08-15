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
          <div ref="todoContainerRef" class="list-container todo-container">
            <div class="list-header">
              <div class="tab-group">
                <div
                  :class="['tab', {'active': activeTodoTab === 'pending'}]"
                  @click="switchTodoTab('pending')"
                >{{ $t('page.dashboard.todoItems') }}</div>
                <div
                  :class="['tab', {'active': activeTodoTab === 'completed'}]"
                  @click="switchTodoTab('completed')"
                >{{ $t('common.completed') }}</div>
              </div>
              <el-button link class="todo-more-button" @click="goToTodoPage">
                查看全部 {{ activeTodoCount }}
              </el-button>
            </div>
            <div class="list-content">
              <el-table
                :data="activeTodoTasks"
                :show-header="true"
                :empty-text="activeTodoTab === 'pending' ? '暂无待办事项' : '暂无已完成事项'"
                class="dashboard-table"
              >
                <el-table-column :label="$t('common.type')" width="72">
                  <template #default="{ row }">
                    <span class="event-type" :class="getEventTypeClass(row.type)">{{ row.type }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="title" :label="$t('common.title')" min-width="100" show-overflow-tooltip />
                <el-table-column
                  v-if="showTodoDate"
                  prop="date"
                  :label="activeTodoTab === 'pending' ? $t('common.deadline') : $t('common.updateTime')"
                  width="108"
                />
                <el-table-column v-if="showTodoStatus" :label="$t('common.status')" width="76">
                  <template #default="{ row }">
                    <span :class="activeTodoTab === 'completed' ? 'status-completed' : getStatusClass(row.status)">
                      {{ row.status }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column :label="$t('common.action')" width="88" align="center">
                  <template #default="{ row }">
                    <el-button
                      :type="activeTodoTab === 'pending' ? 'primary' : 'info'"
                      size="small"
                      class="action-btn"
                      @click="activeTodoTab === 'pending' ? goToTodoPage() : viewTodoDetail(row.id)"
                    >
                      {{ activeTodoTab === 'pending' ? $t('common.handle') : $t('common.detail') }}
                    </el-button>
                  </template>
                </el-table-column>
                <!-- 空状态插槽 -->
                <template #empty>
                  <div class="empty-state">
                    <el-icon class="empty-icon"><DocumentRemove /></el-icon>
                    <p class="empty-text">{{ activeTodoTab === 'pending' ? '暂无待办事项' : '暂无已完成事项' }}</p>
                    <p class="empty-desc">{{ activeTodoTab === 'pending' ? '太棒了!你已经完成了所有任务' : '还没有完成任何任务' }}</p>
                  </div>
                </template>
              </el-table>
            </div>
          </div>
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
  DocumentRemove,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
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
  initExchangeRateChart,
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
// 上次加载时间
const lastLoadTime = ref(0)
const refreshInterval = 30000 // 30秒刷新间隔
// 用户信息
const userProfile = ref(null)
const isLoadingProfile = ref(true)
// 统计数据
const statistics = ref({
  managedUsers: 3,
  todoItems: 0,
  warningItems: 0,
  documentCount: 18
})
const isLoadingStats = ref(true)
const todoContainerRef = ref(null)
const todoContainerWidth = ref(0)
const activeTodoTasks = computed(() => (
  activeTodoTab.value === 'pending' ? pendingTasks.value : completedTasks.value
))
const activeTodoCount = computed(() => activeTodoTasks.value.length)
const showTodoDate = computed(() => todoContainerWidth.value >= 470)
const showTodoStatus = computed(() => todoContainerWidth.value >= 380)
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
    updateMetalMiniCharts()
  } else {
    initExchangeRateChart()
  }
}
// 定时器管理
let userDataTimer = null
let exchangeRateTimer = null
let dashboardRefreshPromise = null
let todoResizeObserver = null

const updateTodoContainerWidth = () => {
  todoContainerWidth.value = todoContainerRef.value?.getBoundingClientRect().width || 0
}
// === 全局状态常量映射字典（仅模板直接引用的保留在此） ===
const EVENT_TYPE_MAP = {
  '英语变更': 'event-english',
  '新生指导': 'event-guide',
  '报到注册': 'event-register',
  '护照变更': 'event-passport',
  '活动报名': 'event-activity',
  '活动': 'event-activity'
}
const TODO_STATUS_MAP = {
  '待确认': 'status-pending',
  '未读': 'status-unread',
  '已读': 'status-read',
  '进行中': 'status-processing',
  '关闭': 'status-closed'
}
const getEventTypeClass = (type) => EVENT_TYPE_MAP[type] || ''
const getStatusClass = (status) => TODO_STATUS_MAP[status] || ''
// 加载用户数据
const loadUserProfile = async (force = false) => {
  try {
    const now = Date.now()
    if (!force && (now - lastLoadTime.value < refreshInterval)) {
      return
    }
    isLoadingProfile.value = true
    await authStore.fetchUserProfile()
    userProfile.value = authStore.user
    lastLoadTime.value = now
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
    const [, , planCount] = await Promise.all([
      loadUserProfile(forceProfile),
      loadUserTodos(),
      loadProductionPlans(),
      fetchOnlineTimeRanking(forceProfile),
      loadDashboardStats()
    ])

    updateTaskStats()
    updateWarningStats(planCount || 0)
  })()

  try {
    return await dashboardRefreshPromise
  } finally {
    dashboardRefreshPromise = null
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
  await nextTick()
  updateTodoContainerWidth()
  if (typeof ResizeObserver !== 'undefined' && todoContainerRef.value) {
    todoResizeObserver = new ResizeObserver(updateTodoContainerWidth)
    todoResizeObserver.observe(todoContainerRef.value)
  }
  // 初始化加载状态
  isLoadingStats.value = true
  // === 第一阶段：核心业务数据并行加载 ===
  await refreshDashboardData(true)
  isLoadingStats.value = false
  // 初始化汇率图表（依赖 DOM）
  await nextTick()
  initExchangeRateChart()
  // === 第二阶段：外部数据源并行加载（不阻塞核心渲染） ===
  Promise.all([
    fetchWeatherData(),
    fetchExchangeRates(),
    fetchMetalPrices()
  ]).catch((error) => {
    logger.error('外部价格数据加载失败:', error)
  })
  // 设置定时刷新
  userDataTimer = setInterval(() => {
    refreshDashboardData()
  }, refreshInterval)
  // 汇率数据定时刷新（每2分钟）
  exchangeRateTimer = setInterval(() => {
    fetchExchangeRates()
  }, 2 * 60 * 1000)
  // 初始化日历
  calendarDays.value = generateCalendarDays(currentDate.value)
})
// 组件卸载时清除定时器和图表
onUnmounted(() => {
  window.removeEventListener('erp:user-profile-updated', handleUserProfileUpdated)
  todoResizeObserver?.disconnect()
  todoResizeObserver = null
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
  refreshDashboardData(true)
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
  .list-container,
  .chart-container,
  .calendar-container,
  .calendar-wrapper,
  .warning-container {
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
.list-container,
.chart-container,
.calendar-container,
.calendar-wrapper,
.warning-container {
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
.list-container:hover,
.chart-container:hover,
.calendar-container:hover,
.calendar-wrapper:hover,
.warning-container:hover {
  box-shadow: 0 4px 16px 0 color-mix(in srgb, var(--ds-black) 10%, transparent);
  border-color: var(--color-border-light);
}
.list-header {
  padding: 0;
  border-bottom: 1px solid var(--color-border-lighter);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  box-sizing: border-box; /* ✨ 统一box-sizing */
}
.tab-group {
  display: flex;
  height: 45px;
}
.tab {
  padding: 0 15px;
  height: 100%;
  display: flex;
  align-items: center;
  position: relative;
  cursor: pointer;
  color: var(--color-text-regular);
  font-size: 14px;
  transition: background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}
.tab:hover {
  color: var(--color-primary);
  background-color: color-mix(in srgb, var(--ds-blue) 5%, transparent);
}
.tab.active {
  color: var(--color-primary);
  font-weight: bold;
}
.tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary-dark-2) 100%);
  animation: slideIn 0.3s ease-out;
  box-shadow: 0 2px 4px color-mix(in srgb, var(--ds-blue) 30%, transparent);
}
@keyframes slideIn {
  from {
    width: 0;
    opacity: 0;
  }
  to {
    width: 100%;
    opacity: 1;
  }
}
.list-content {
  padding: 0;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.todo-container {
  height: auto;
  min-height: 380px;
  overflow: hidden;
}
.todo-container .list-content {
  flex: none;
  overflow: hidden;
}
.todo-container :deep(.el-table),
.todo-container :deep(.el-table__inner-wrapper),
.todo-container :deep(.el-table__header-wrapper),
.todo-container :deep(.el-table__body-wrapper),
.todo-container :deep(.el-scrollbar),
.todo-container :deep(.el-scrollbar__wrap),
.todo-container :deep(.el-scrollbar__view) {
  overflow: hidden !important;
  height: auto !important;
  max-height: none !important;
}
.todo-container :deep(.el-scrollbar__bar) {
  display: none !important;
}
.todo-container :deep(*) {
  scrollbar-width: none !important;
}
.todo-container :deep(*::-webkit-scrollbar) {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}
.todo-more-button {
  flex: 0 0 auto;
  margin-right: 10px;
  padding: 4px 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.todo-more-button:hover {
  color: var(--color-primary);
}
/* 表格空状态样式 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--color-text-secondary);
}
.empty-icon {
  font-size: 64px;
  color: var(--color-text-placeholder);
  margin-bottom: 16px;
  opacity: 0.6;
}
.empty-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text-regular);
  margin: 0 0 8px 0;
}
.empty-desc {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 0;
}
/* 表格样式优化 */
.dashboard-table {
  border-radius: 0;
  width: 100%;
}
.dashboard-table :deep(.el-table__empty-block) {
  min-height: 200px;
}
.dashboard-table :deep(.el-table__row) {
  transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease, opacity 0.3s ease, transform 0.3s ease;
}
.dashboard-table :deep(.el-table__row:hover) {
  background-color: var(--color-bg-hover) !important;
}
.production-table :deep(.el-table__row) {
  cursor: pointer;
}
.production-table :deep(.el-tag) {
  font-weight: 500;
  border-radius: 12px;
  padding: 0 10px;
}
/* 事件类型样式 */
.event-type {
  display: inline-block;
}
.event-english {
  color: var(--color-danger);
}
.event-guide {
  color: var(--color-primary);
}
.event-register {
  color: var(--color-success);
}
.event-passport {
  color: var(--color-warning);
}
.event-activity {
  color: var(--color-danger);
}
/* 状态样式 */
.status-pending {
  color: var(--color-warning);
}
.status-unread {
  color: var(--color-danger);
}
.status-read {
  color: var(--color-text-secondary);
}
.status-processing {
  color: var(--color-success);
}
.status-closed {
  color: var(--color-text-secondary);
}
.status-completed {
  color: var(--color-success);
}
.action-btn {
  padding: 2px 4px;
  font-size: 12px;
  height: 22px;
  min-width: 40px;
  transition: background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}
.action-btn::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background-color: color-mix(in srgb, var(--ds-white) 50%, transparent);
  transform: translate(-50%, -50%);
  transition: width 0.6s, height 0.6s;
}
.action-btn:active::before {
  width: 200px;
  height: 200px;
}
.action-btn:hover {
  box-shadow: none;
}
/* 表格样式 */
:deep(.el-table) {
  --el-table-border-color: transparent;
  --el-table-header-bg-color: color-mix(in srgb, var(--color-bg-hover) 50%, transparent);
  --el-table-row-hover-bg-color: color-mix(in srgb, var(--color-bg-hover) 50%, transparent);
  background-color: transparent !important;
}
:deep(.el-table th) {
  background-color: color-mix(in srgb, var(--color-bg-hover) 50%, transparent);
  font-weight: normal;
  color: var(--color-text-regular);
  font-size: 13px;
  padding: 8px 0;
  height: 40px;
}
:deep(.el-table td) {
  padding: 8px 0;
  font-size: 13px;
  height: 40px;
  background-color: transparent !important;
}
:deep(.el-table--enable-row-hover .el-table__body tr:hover > td) {
  background-color: color-mix(in srgb, var(--color-bg-hover) 50%, transparent);
}
:deep(.el-table__inner-wrapper::before) {
  display: none;
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
.calendar-container,
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
/* 预警样式（特殊配置） */
/* 删除重复的样式定义，已在公共容器样式中定义 */
.warning-notice {
  color: var(--color-text-secondary);
}
.warning-document {
  color: var(--color-danger);
}
.warning-course {
  color: var(--color-success);
}
.warning-activity {
  color: var(--color-warning);
}
.warning-accommodation {
  color: var(--color-primary);
}
.warning-completed {
  color: var(--color-success);
}
.warning-cancelled {
  color: var(--color-text-secondary);
  text-decoration: line-through;
}
.warning-action-btn {
  padding: 2px 10px;
  font-size: 12px;
  height: 24px;
  min-width: 50px;
  display: inline-flex;
  justify-content: center;
  align-items: center;
}
/* 预警表格特定样式 */
.table-wrapper {
  flex: 1; /* 占据剩余空间 */
  overflow: hidden;
  box-sizing: border-box; /* ✨ 确保box-sizing一致 */
}
.warning-container :deep(.el-table) {
  height: 100% !important; /* ✨ 改为100%自动填充 */
  width: 100% !important;
}
.warning-container :deep(.el-table__body) {
  width: 100% !important;
}
.warning-container :deep(.el-table__header) {
  width: 100% !important;
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

<style>
/* 待办表不滚动：盖过主题里 el-scrollbar 的 overflow:scroll（KACON 更明显） */
.dashboard-page .todo-container .el-scrollbar__wrap,
.dashboard-page .todo-container .el-table__body-wrapper,
.dashboard-page .todo-container .el-table__header-wrapper {
  overflow: hidden !important;
  max-height: none !important;
}
.dashboard-page .todo-container .el-scrollbar__bar {
  display: none !important;
}
</style>
