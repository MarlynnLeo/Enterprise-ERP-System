<!--
/**
 * Dashboard.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="dashboard-container">
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
              <el-skeleton-item v-else variant="h3" style="width: 40px; height: 32px;" />
              <div class="text">{{ stat.label }}</div>
            </div>
            <!-- 添加数据更新指示器 -->
            <div class="update-indicator" v-if="!isLoadingStats"></div>
          </div>
        </el-col>
        
        <!-- 个人信息与天气整合卡片 -->
        <el-col :xs="24" :md="8">
          <div class="combined-info-card">
            <div v-if="isLoadingProfile" class="loading-section">
              <el-skeleton animated style="width: 100%">
                <template #template>
                  <div style="display: flex; gap: 20px; align-items: center;">
                    <div style="flex: 1;">
                      <el-skeleton-item variant="text" style="width: 60%; margin-bottom: 8px;" />
                      <el-skeleton-item variant="text" style="width: 80%;" />
                    </div>
                    <el-skeleton-item variant="circle" style="width: 60px; height: 60px;" />
                    <div style="flex: 1;">
                      <el-skeleton-item variant="text" style="width: 60%; margin-bottom: 8px;" />
                      <el-skeleton-item variant="text" style="width: 80%;" />
                    </div>
                  </div>
                </template>
              </el-skeleton>
            </div>
            <div v-else class="combined-content">
              <!-- 左侧：个人信息 -->
              <div class="left-info">
                <div class="name">{{ userProfile?.real_name || $t('page.profile.realName') }}</div>
                <div class="role-item">
                  <el-icon><Avatar /></el-icon>
                  <span>{{ userProfile?.role_name || userProfile?.role || $t('page.profile.role') }}</span>
                </div>
                <div class="role-item">
                  <el-icon><Location /></el-icon>
                  <span>{{ userProfile?.department_name || '未设置' }}</span>
                </div>
              </div>

              <!-- 中间：头像 -->
              <div class="center-avatar">
                <div class="avatar-container">
                  <div class="avatar-glow"></div>
                  <div class="avatar-particles">
                    <span class="particle" v-for="i in 8" :key="i" :style="`--i: ${i}`"></span>
                  </div>
                  <img :src="userProfile?.avatar || '/default-avatar.webp'" class="avatar" />
                </div>
              </div>

              <!-- 右侧：天气信息 -->
              <div class="right-weather">
                <div class="weather-header-compact">
                  <el-icon><LocationFilled /></el-icon>
                  <span>{{ weather.city }}</span>
                  <span class="weather-time">{{ weather.updateTime }}</span>
                </div>
                <div class="weather-main-compact">
                  <div class="temp-large">{{ weather.temperature }}°C</div>
                  <div class="weather-icon-compact">
                    <el-icon v-if="weather.weatherCode === 'sunny'" style="font-size: 28px; color: #ffd54f;">
                      <Sunny />
                    </el-icon>
                    <el-icon v-else-if="weather.weatherCode === 'partly-cloudy'" style="font-size: 28px; color: #fff9c4;">
                      <PartlyCloudy />
                    </el-icon>
                    <el-icon v-else-if="weather.weatherCode === 'cloudy'" style="font-size: 28px; color: #e0e0e0;">
                      <Cloudy />
                    </el-icon>
                    <el-icon v-else-if="weather.weatherCode === 'rainy'" style="font-size: 28px; color: #90caf9;">
                      <Cloudy />
                    </el-icon>
                    <el-icon v-else style="font-size: 28px; color: #e0e0e0;">
                      <Cloudy />
                    </el-icon>
                  </div>
                </div>
                <div class="weather-desc-compact">{{ weather.description }}</div>
                <div class="weather-details-compact">
                  <span><el-icon style="font-size: 12px;"><WindPower /></el-icon> {{ weather.windSpeed }}km/h</span>
                  <span><el-icon style="font-size: 12px;"><Cold /></el-icon> {{ weather.humidity }}%</span>
                </div>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>

      <!-- 待办事项、我发起和统计图表在同一行 -->
      <el-row :gutter="20">
        <el-col :xs="24" :sm="24" :md="8">
          <div class="list-container">
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
            </div>
            <div class="list-content">
              <el-table
                :data="activeTodoTab === 'pending' ? pendingTasks : completedTasks"
                style="width: 100%"
                :show-header="true"
                height="300"
                :empty-text="activeTodoTab === 'pending' ? '暂无待办事项' : '暂无已完成事项'"
                class="dashboard-table"
              >
                <el-table-column :label="$t('common.type')" width="80">
                  <template #default="{ row }">
                    <span class="event-type" :class="getEventTypeClass(row.type)">{{ row.type }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="title" :label="$t('common.title')" min-width="100" show-overflow-tooltip />
                <el-table-column
                  prop="date"
                  :label="activeTodoTab === 'pending' ? $t('common.deadline') : $t('common.updateTime')"
                  width="90"
                />
                <el-table-column :label="$t('common.status')" width="80">
                  <template #default="{ row }">
                    <span :class="activeTodoTab === 'completed' ? 'status-completed' : getStatusClass(row.status)">
                      {{ row.status }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column :label="$t('common.action')" min-width="80" align="center">
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
            <div class="chart-header">
              <div class="tab-group">
                <div class="tab active">在线时长排行榜</div>
              </div>
            </div>
            <div class="chart-body">
              <div class="ranking-content">
                <!-- 排行榜显示 - 新设计 -->
                <div class="ranking-podium" v-if="!rankingLoading">
                  <div 
                    v-for="config in podiumCardConfigs" 
                    :key="config.rankClass"
                    class="podium-item" 
                    :class="[config.rankClass, { 'no-data': !onlineTimeRanking[config.dataIndex], 'flipped': flippedCards[config.dataIndex] }]" 
                    @click="toggleFlip(config.dataIndex)"
                  >
                    <div class="flipper">
                      <div class="front">
                        <template v-if="onlineTimeRanking[config.dataIndex]">
                          <div class="crown-icon" :class="{ champion: config.isChampion }"><el-icon><Trophy /></el-icon></div>
                          <!-- 头像+特效容器：固定尺寸的相对定位盒子 -->
                          <div :style="{
                            position: 'relative',
                            width: config.iconSize + 'px',
                            height: config.iconSize + 'px',
                            margin: '10px auto 8px'
                          }">
                            <!-- 特效层：绝对铺满 + flex 居中 -->
                            <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 2;">
                              <Vue3Lottie 
                                v-if="onlineTimeRanking[config.dataIndex].avatarFrame && getLottieAnimation(onlineTimeRanking[config.dataIndex].avatarFrame)"
                                :animationData="getLottieAnimation(onlineTimeRanking[config.dataIndex].avatarFrame)" 
                                :height="config.iconSize * 1.6" 
                                :width="config.iconSize * 1.6" 
                              />
                            </div>
                            <!-- 头像层：绝对铺满 + flex 居中（与特效层完全对称） -->
                            <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; z-index: 1;">
                              <div :style="{
                                width: config.iconSize + 'px',
                                height: config.iconSize + 'px',
                                borderRadius: '50%',
                                overflow: 'hidden',
                                border: config.isChampion ? '3px solid #fff' : '2px solid #fff',
                                boxShadow: config.isChampion ? '0 4px 12px rgba(255, 215, 0, 0.3)' : '0 3px 8px rgba(0, 0, 0, 0.15)',
                                flexShrink: '0'
                              }">
                                <img
                                  :src="onlineTimeRanking[config.dataIndex].avatar || '/default-avatar.webp'"
                                  alt="头像"
                                  style="width: 100%; height: 100%; object-fit: cover; display: block;"
                                  @error="e => e.target.src = '/default-avatar.webp'"
                                />
                              </div>
                            </div>
                          </div>
                          <div class="rank-badge">{{ config.badgeText }}</div>
                          <div class="user-name">{{ onlineTimeRanking[config.dataIndex].realName }}</div>
                          <div class="time-value">{{ onlineTimeRanking[config.dataIndex].displayTime }}</div>
                        </template>
                        <template v-else>
                          <div class="crown-icon" :class="{ champion: config.isChampion }" style="opacity: 0.2;"><el-icon><Trophy /></el-icon></div>
                          <!-- 暂无数据占位头像：同样用纯内联样式居中 -->
                          <div :style="{
                            position: 'relative',
                            width: config.iconSize + 'px',
                            height: config.iconSize + 'px',
                            margin: '10px auto 8px'
                          }">
                            <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; z-index: 1;">
                              <div :style="{
                                width: config.iconSize + 'px',
                                height: config.iconSize + 'px',
                                borderRadius: '50%',
                                overflow: 'hidden',
                                border: '2px solid #f0f0f0',
                                background: '#fafafa',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: '0'
                              }">
                                <el-icon :style="`font-size: ${config.isChampion ? 30 : 24}px; color: var(--color-border-base);`"><UserFilled /></el-icon>
                              </div>
                            </div>
                          </div>
                          <div class="rank-badge" style="opacity: 0.5;">{{ config.badgeText }}</div>
                          <div class="user-name" style="opacity: 0.4; color: var(--color-text-secondary);">暂无数据</div>
                          <div class="time-value" style="opacity: 0.4; color: var(--color-text-secondary);">--</div>
                        </template>
                      </div>
                      <div class="back">
                        <div class="bio-content">
                          <el-icon class="quote-icon"><ChatLineSquare /></el-icon>
                          <p class="bio-text">{{ onlineTimeRanking[config.dataIndex]?.bio || '暂无个性签名' }}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <!-- 加载状态 - 优化的骨架屏 -->
                <div v-if="rankingLoading" class="ranking-loading">
                  <div class="ranking-podium-skeleton">
                    <div v-for="config in podiumCardConfigs" :key="`skeleton-${config.rankClass}`" class="podium-item-skeleton" :class="config.rankClass">
                      <div class="skeleton-crown"></div>
                      <div class="skeleton-avatar"></div>
                      <div class="skeleton-badge"></div>
                      <div class="skeleton-name"></div>
                      <div class="skeleton-time"></div>
                    </div>
                  </div>
                </div>
                

                <div class="last-update" v-if="rankingDate">
                  统计日期: {{ rankingDate }}
                </div>
              </div>
            </div>
          </div>
        </el-col>
        
        <el-col :xs="24" :sm="24" :md="8">
          <div class="chart-container">
            <div class="chart-header">
              <div class="tab-group">
                <div class="tab active">实时价格与汇率</div>
                <el-tooltip content="手动刷新数据" placement="top">
                  <el-button
                    link
                    size="small"
                    @click="refreshAllPrices"
                    :loading="exchangeRateLoading || metalPricesLoading"
                    style="margin-left: auto; color: var(--color-primary);"
                  >
                    <i class="el-icon-refresh"></i>
                  </el-button>
                </el-tooltip>
              </div>
            </div>
            <div class="chart-body">
              <div class="scrollable-content" @scroll="handleScroll" ref="scrollContainer">
                <!-- 金属价格卡片显示 -->
                <div class="section-title">金属实时价格</div>
                <div class="metal-price-cards">
                  <div class="price-card" :class="`price-card-${key.toLowerCase()}`" v-for="(metal, key) in metalPriceCards" :key="key">
                    <div class="price-card-header">
                      <div class="metal-info">
                        <span class="metal-icon" :class="`metal-icon-${key.toLowerCase()}`"></span>
                        <span class="metal-name">{{ metal.name }}</span>
                      </div>
                      <span class="price-change" :class="getChangeClass(metal.changePercent)">
                        {{ formatChange(metal.changePercent) }}%
                      </span>
                    </div>
                    <div class="price-value">¥{{ formatPrice(metal.price) }}</div>
                    <div class="price-unit">{{ metal.unit }}</div>
                    <div class="price-trend">
                      <div class="mini-chart" :ref="el => setMetalMiniChartRef(key, el)"></div>
                    </div>
                  </div>
                </div>

                <div class="section-divider"></div>

                <!-- 汇率卡片显示 -->
                <div class="section-title">实时汇率走势</div>
                <div class="exchange-rate-cards">
                  <div class="rate-card" v-for="(rate, key) in exchangeRateCards" :key="key">
                    <div class="rate-card-header">
                      <span class="currency-pair">{{ rate.pair }}</span>
                      <span class="rate-change" :class="getChangeClass(rate.change)">
                        {{ formatChange(rate.change) }}
                      </span>
                    </div>
                    <div class="rate-value">{{ rate.value || '--' }}</div>
                    <div class="rate-trend">
                      <div class="mini-chart" :ref="el => setMiniChartRef(key, el)"></div>
                    </div>
                  </div>
                </div>

                <!-- 主要汇率走势图 -->
                <div class="exchange-rate-chart">
                  <div ref="exchangeRateChartRef" style="width: 100%; height: 160px;"></div>
                </div>

                <div class="last-update" v-if="exchangeRates.lastUpdate">
                  最后更新: {{ formatTime(exchangeRates.lastUpdate) }}
                  <span v-if="exchangeRates.dataSource" class="data-source">
                    | 数据源: {{ exchangeRates.dataSource }}
                  </span>
                </div>
              </div>

              <!-- 滚动提示 -->
              <div class="scroll-indicator" v-show="showScrollIndicator" @click="scrollToBottom">
                <i class="el-icon-arrow-down"></i>
                <span>向下滚动查看更多</span>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>

      <!-- 日历和预警并排在同一行 -->
      <el-row :gutter="20">
        <el-col :xs="24" :sm="24" :md="14">
          <div class="warning-container">
            <div class="list-header">
              <div class="tab-group">
                <div class="tab active">生产计划</div>
              </div>
            </div>
            <div class="table-wrapper">
              <el-table
                :data="warningList"
                style="width: 100%;"
                row-class-name="warning-row"
                :empty-text="'暂无生产计划'"
                class="dashboard-table production-table"
              >
                <el-table-column prop="studentId" label="计划编号" min-width="120" align="center" />
                <el-table-column prop="name" label="产品名称" min-width="120" align="left" />
                <el-table-column prop="studentType" label="产品规格" min-width="120" align="left" show-overflow-tooltip />
                <el-table-column prop="protectionId" label="计划数量" min-width="100" align="center" />
                <el-table-column label="状态" min-width="80" align="center">
                  <template #default="{ row }">
                    <el-tag :type="getWarningTagType(row.status)" size="small" effect="light">
                      {{ row.warningType }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="操作" min-width="80" align="center" fixed="right">
                  <template #default="{ row }">
                    <el-button type="primary" size="small" class="warning-action-btn" @click="viewProductionPlan(row.id)" :disabled="row.id === 0">查看</el-button>
                  </template>
                </el-table-column>
                <!-- 空状态插槽 -->
                <template #empty>
                  <div class="empty-state">
                    <el-icon class="empty-icon"><Document /></el-icon>
                    <p class="empty-text">暂无生产计划</p>
                    <p class="empty-desc">当前没有进行中的生产计划</p>
                  </div>
                </template>
              </el-table>
            </div>
          </div>
        </el-col>
        
        <el-col :xs="24" :sm="24" :md="10">
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
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { getLottieAnimation } from '../../assets/lottie'

// 权限store
const authStore = useAuthStore()

import * as echarts from 'echarts/core'
import {
  BarChart,
  LineChart
} from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import {
  UserFilled,
  Bell,
  Warning,
  Avatar,
  ArrowLeft,
  ArrowRight,
  Document,
  LocationFilled,
  Sunny,
  Cloudy,
  PartlyCloudy,
  ChatLineSquare
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

// 注册ECharts组件
echarts.use([
  BarChart,
  LineChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer
])

// ========== 组合式函数导入 ==========
import { useWeather } from './composables/useWeather'
import { useExchangeRate } from './composables/useExchangeRate'
import { useMetalPrices } from './composables/useMetalPrices'
import { useTodos } from './composables/useTodos'
import { useOnlineRanking } from './composables/useOnlineRanking'
import { useProductionPlans } from './composables/useProductionPlans'

const router = useRouter()

// ========== 解构组合式函数 ==========
const { weather, weatherLoading, fetchWeatherData } = useWeather()

const {
  exchangeRates,
  exchangeRateLoading,
  exchangeRateHistory,
  exchangeRateCards,
  exchangeRateChartRef,
  miniChartRefs,
  setMiniChartRef,
  fetchExchangeRates,
  initExchangeRateChart,
  updateMiniCharts,
  refreshExchangeRate,
  getMiniChartOption,
  initMiniChart,
  updateMiniChartsGeneric,
  disposeCharts
} = useExchangeRate()

const {
  metalPrices,
  metalPricesLoading,
  metalPriceHistory,
  metalPriceCards,
  metalMiniChartRefs,
  metalMiniCharts,
  setMetalMiniChartRef,
  fetchMetalPrices,
  refreshMetalPrices,
  updateMetalMiniCharts,
  disposeMetalCharts
} = useMetalPrices(updateMiniChartsGeneric)

const {
  pendingTasks,
  completedTasks,
  todos,
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
  flippedCards,
  toggleFlip,
  podiumCardConfigs,
  fetchOnlineTimeRanking
} = useOnlineRanking()

const {
  warningList,
  getWarningTypeClass,
  getWarningTagType,
  getStatusText,
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

// 滚动相关
const scrollContainer = ref(null)
const showScrollIndicator = ref(true)

// 定时器管理
let userDataTimer = null
let exchangeRateTimer = null

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

// ========== 本地方法 ==========

// 检查是否需要滚动指示器
const checkScrollIndicator = () => {
  nextTick(() => {
    if (scrollContainer.value) {
      const container = scrollContainer.value
      const scrollHeight = container.scrollHeight
      const clientHeight = container.clientHeight
      showScrollIndicator.value = scrollHeight > clientHeight
    }
  })
}

// 滚动到底部
const scrollToBottom = () => {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTo({
      top: scrollContainer.value.scrollHeight,
      behavior: 'smooth'
    })
  }
}

// 处理滚动事件
const handleScroll = (event) => {
  const container = event.target
  const scrollTop = container.scrollTop
  const scrollHeight = container.scrollHeight
  const clientHeight = container.clientHeight

  if (scrollHeight <= clientHeight) {
    showScrollIndicator.value = false
    return
  }

  const scrollProgress = scrollTop / (scrollHeight - clientHeight)
  if (scrollProgress >= 0.95) {
    showScrollIndicator.value = false
  } else if (scrollTop === 0) {
    showScrollIndicator.value = true
  }
}

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
    console.error('获取用户信息失败:', error)
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

// 格式化价格显示（添加千分位分隔符）
const formatPrice = (price) => {
  if (!price || price === '--') return '--'
  return Number(price).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

// 格式化变化值
const formatChange = (change) => {
  if (!change || change === 0) return '0.0000'
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toFixed(4)}`
}

// 获取变化样式类
const getChangeClass = (change) => {
  if (!change || change === 0) return 'neutral'
  return change > 0 ? 'positive' : 'negative'
}

// 格式化时间
const formatTime = (date) => {
  return new Date(date).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 刷新所有价格数据（金属+汇率）
const refreshAllPrices = async () => {
  try {
    await Promise.all([fetchMetalPrices(), fetchExchangeRates()])
    ElMessage.success('数据已更新')
  } catch (error) {
    console.error('刷新价格数据失败:', error)
    ElMessage.error('刷新数据失败，请稍后重试')
  }
}

// ========== 生命周期钩子 ==========

// 组件挂载时加载数据
onMounted(async () => {
  // 初始化加载状态
  isLoadingStats.value = true

  // === 第一阶段：核心业务数据并行加载 ===
  const [, , planCount] = await Promise.all([
    loadUserProfile(true),
    loadUserTodos(),
    loadProductionPlans(),
    fetchOnlineTimeRanking()
  ])
  
  // 核心数据加载完成后更新统计
  updateTaskStats()
  updateWarningStats(planCount || 0)
  isLoadingStats.value = false

  // 初始化汇率图表（依赖 DOM）
  await nextTick()
  initExchangeRateChart()

  // === 第二阶段：外部数据源并行加载（不阻塞核心渲染） ===
  Promise.all([
    fetchWeatherData(),
    fetchExchangeRates(),
    fetchMetalPrices()
  ]).then(() => {
    checkScrollIndicator()
  })

  // 设置定时刷新
  userDataTimer = setInterval(() => {
    loadUserProfile()
    loadUserTodos()
    loadProductionPlans()
    fetchOnlineTimeRanking()
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
  loadUserProfile(true)
  loadUserTodos() // 同时刷新待办事项

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
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05) !important;
  transition: all var(--transition-base) ease !important;
}

.stat-card:hover {
  box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.1) !important;
  border-color: var(--color-border-light) !important;
  transform: translateY(-2px) !important;
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
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
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
  transition: all 0.3s ease;
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
  background-color: #9254DE;
}

.icon-container {
  width: 35px;
  height: 35px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  position: relative;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.icon-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 50%;
  background: inherit;
  opacity: 0.3;
  transform: scale(1);
  transition: all 0.3s ease;
}

.stat-card:hover .icon-container::before {
  transform: scale(1.3);
  opacity: 0;
}

.stat-card:hover .icon-container {
  transform: rotate(10deg) scale(1.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.blue {
  background: linear-gradient(135deg, #4B9EFF 0%, #667eea 100%);
}

.red {
  background: linear-gradient(135deg, #FF5050 0%, #f5576c 100%);
}

.green {
  background: linear-gradient(135deg, #50DEFF 0%, #00f2fe 100%);
}

.purple {
  background: linear-gradient(135deg, #9254DE 0%, #764ba2 100%);
}

.icon-container .el-icon {
  font-size: 20px;
  color: var(--color-on-primary, #fff);
  position: relative;
  z-index: 1;
  transition: all 0.3s ease;
}

.stat-card:hover .icon-container .el-icon {
  transform: scale(1.1);
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

/* 个人信息样式 - 统一卡片风格 */
.personal-info-card {
  background: var(--color-bg-base);
  border-radius: 10px;
  padding: 15px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  margin-bottom: var(--spacing-lg);
  height: 90px;
  border: 1px solid var(--color-border-lighter);
  display: flex;
  align-items: center;
  transition: all var(--transition-base) ease;
}

.personal-info-card:hover {
  box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.1);
  border-color: var(--color-border-light);
  transform: translateY(-2px);
}

.profile-section {
  display: flex;
  align-items: center;
  width: 100%;
  height: 60px; /* 固定内容区域高度 */
}

.profile-section.loading-state {
  justify-content: center;
}

/* 整合的个人信息与天气卡片 - 统一卡片风格 */
.combined-info-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 10px;
  padding: 15px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  margin-bottom: var(--spacing-lg);
  height: 90px;
  position: relative;
  overflow: hidden;
  transition: all var(--transition-base) ease;
  border: 1px solid rgba(102, 126, 234, 0.3);
}

.combined-info-card::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
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
  transform: translateY(-2px);
  box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.1);
  border-color: rgba(102, 126, 234, 0.5);
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
  color: var(--color-on-primary, #fff);
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
  border: 2px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.3);
  z-index: 2;
  transition: all var(--transition-base) ease;
}

.center-avatar .avatar:hover {
  transform: scale(1.05);
  border-color: rgba(255, 255, 255, 0.8);
  box-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
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
  background: radial-gradient(circle, rgba(75, 158, 255, 0.3) 0%, transparent 70%);
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
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: linear-gradient(45deg, #4B9EFF, #50DEFF);
  box-shadow: 0 0 6px rgba(75, 158, 255, 0.8);
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
  border: 2px solid rgba(75, 158, 255, 0.3);
  box-shadow: 0 0 15px rgba(75, 158, 255, 0.4);
  z-index: 1;
  transition: all var(--transition-base) ease;
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
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  margin-bottom: var(--spacing-lg);
  overflow: hidden;
  border: 1px solid var(--color-border-lighter);
  height: 380px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  transition: all var(--transition-base) ease;
}

/* 卡片悬停效果 */
.list-container:hover,
.chart-container:hover,
.calendar-container:hover,
.calendar-wrapper:hover,
.warning-container:hover {
  box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.1);
  border-color: var(--color-border-light);
  transform: translateY(-2px);
}

.list-header {
  padding: 0;
  border-bottom: 1px solid var(--color-border-lighter);
  flex-shrink: 0;
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
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.tab:hover {
  color: var(--color-primary);
  background-color: rgba(75, 158, 255, 0.05);
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
  box-shadow: 0 2px 4px rgba(75, 158, 255, 0.3);
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
  overflow: auto;
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
}

.dashboard-table :deep(.el-table__empty-block) {
  min-height: 200px;
}

.dashboard-table :deep(.el-table__row) {
  transition: all 0.3s ease;
}

.dashboard-table :deep(.el-table__row:hover) {
  background-color: var(--color-bg-hover) !important;
  transform: scale(1.01);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
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
  padding: 2px 6px;
  font-size: 12px;
  height: 22px;
  min-width: 48px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
  background-color: rgba(255, 255, 255, 0.5);
  transform: translate(-50%, -50%);
  transition: width 0.6s, height 0.6s;
}

.action-btn:active::before {
  width: 200px;
  height: 200px;
}

.action-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.3);
}

/* 表格样式 */
:deep(.el-table) {
  --el-table-border-color: transparent;
  --el-table-header-bg-color: rgba(245, 247, 250, 0.5);
  --el-table-row-hover-bg-color: rgba(245, 247, 250, 0.5);
  background-color: transparent !important;
}

:deep(.el-table th) {
  background-color: rgba(245, 247, 250, 0.5);
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
  background-color: rgba(245, 247, 250, 0.5);
}

:deep(.el-table__inner-wrapper::before) {
  display: none;
}

/* 空头像样式 */
.empty-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e7ed 100%);
  border: 2px dashed #dcdfe6;
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
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
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
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  position: relative;
}

.day-number:hover {
  background-color: var(--color-primary-light-9);
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
}

.day-number.current {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: var(--color-on-primary, #fff);
  font-weight: bold;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  animation: currentDayPulse 2s ease-in-out infinite;
}

@keyframes currentDayPulse {
  0%, 100% {
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }
  50% {
    box-shadow: 0 4px 16px rgba(102, 126, 234, 0.6);
  }
}

.day-number.has-events {
  background: linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%);
  color: var(--color-on-primary, #fff);
  box-shadow: 0 2px 8px rgba(255, 107, 107, 0.3);
}

.day-number.has-events::after {
  content: '';
  position: absolute;
  bottom: 2px;
  width: 4px;
  height: 4px;
  background-color: var(--color-on-primary, #fff);
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

/* 加载状态样式已整合到 .profile-section.loading-state */

/* 金属价格卡片样式 - 一行两张布局 */
.metal-price-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 10px;
}

.price-card {
  border-radius: var(--radius-md);
  padding: 12px;
  transition: all var(--transition-base) ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  position: relative;
  overflow: hidden;
  animation: cardFadeIn 0.6s ease-out;
}

@keyframes cardFadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 黄金卡片 - 金色主题 */
.price-card-gold {
  background: linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%);
  border: 1px solid #ffc107;
  animation-delay: 0.1s;
}

.price-card-gold:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(255, 193, 7, 0.3);
  border-color: #ff8f00;
}

/* 白金卡片 - 银白色主题 */
.price-card-platinum {
  background: linear-gradient(135deg, #f5f5f5 0%, #e8eaf6 100%);
  border: 1px solid #9e9e9e;
  animation-delay: 0.2s;
}

.price-card-platinum:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(158, 158, 158, 0.3);
  border-color: var(--color-text-regular);
}

/* 铝卡片 - 蓝色主题 */
.price-card-aluminum {
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
  border: 1px solid #2196f3;
  animation-delay: 0.3s;
}

.price-card-aluminum:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
  border-color: #1976d2;
}

/* 铜卡片 - 橙红色主题 */
.price-card-copper {
  background: linear-gradient(135deg, #fff3e0 0%, #ffcc80 100%);
  border: 1px solid #ff9800;
  animation-delay: 0.4s;
}

.price-card-copper:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(255, 152, 0, 0.3);
  border-color: #f57c00;
}

.price-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.metal-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.metal-icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: inline-block;
  animation: iconPulse 2s ease-in-out infinite;
}

@keyframes iconPulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.8;
  }
}

/* 不同金属的图标颜色 */
.metal-icon-gold {
  background: linear-gradient(45deg, #ffd700, #ffb300);
  box-shadow: 0 2px 4px rgba(255, 215, 0, 0.3);
}

.metal-icon-platinum {
  background: linear-gradient(45deg, #c0c0c0, #808080);
  box-shadow: 0 2px 4px rgba(192, 192, 192, 0.3);
}

.metal-icon-aluminum {
  background: linear-gradient(45deg, #2196f3, #1976d2);
  box-shadow: 0 2px 4px rgba(33, 150, 243, 0.3);
}

.metal-icon-copper {
  background: linear-gradient(45deg, #ff9800, #f57c00);
  box-shadow: 0 2px 4px rgba(255, 152, 0, 0.3);
}

.metal-name {
  font-weight: 600;
  font-size: 14px;
}

/* 不同金属名称的颜色 */
.price-card-gold .metal-name {
  color: #ff8f00;
}

.price-card-platinum .metal-name {
  color: var(--color-text-regular);
}

.price-card-aluminum .metal-name {
  color: #1976d2;
}

.price-card-copper .metal-name {
  color: #f57c00;
}

.price-change {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.price-change.positive {
  color: var(--color-success);
  background-color: rgba(103, 194, 58, 0.1);
}

.price-change.negative {
  color: var(--color-danger);
  background-color: rgba(245, 108, 108, 0.1);
}

.price-change.neutral {
  color: var(--color-text-secondary);
  background-color: rgba(144, 147, 153, 0.1);
}

.price-value {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 4px;
  background: linear-gradient(135deg, currentColor 0%, currentColor 100%);
  -webkit-background-clip: text;
  background-clip: text;
  transition: all 0.3s ease;
}

/* 不同金属价格的颜色 */
.price-card-gold .price-value {
  color: #ff8f00;
  text-shadow: 0 2px 4px rgba(255, 143, 0, 0.2);
}

.price-card-platinum .price-value {
  color: var(--color-text-regular);
  text-shadow: 0 2px 4px rgba(97, 97, 97, 0.2);
}

.price-card-aluminum .price-value {
  color: #1976d2;
  text-shadow: 0 2px 4px rgba(25, 118, 210, 0.2);
}

.price-card-copper .price-value {
  color: #f57c00;
  text-shadow: 0 2px 4px rgba(245, 124, 0, 0.2);
}

.price-unit {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.price-trend {
  height: 40px;
}

.mini-chart {
  width: 100%;
  height: 100%;
}

.last-update {
  text-align: center;
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border-lighter);
}

/* 我发起表格特定样式 */
.list-container :deep(.el-table__body) {
  width: 100% !important;
}

.list-container :deep(.el-table__header) {
  width: 100% !important;
}

.list-container :deep(.el-table__body-wrapper) {
  overflow-x: hidden;
}

/* 滚动容器样式 */
.scrollable-content {
  max-height: 500px;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 8px;
  /* 确保滚动到底部 */
  scroll-behavior: smooth;
}

/* 汇率卡片样式 */
.exchange-rate-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: var(--spacing-lg);
}

.rate-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: var(--radius-lg);
  padding: 12px;
  color: var(--color-on-primary, #fff);
  position: relative;
  overflow: hidden;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  min-height: 120px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  animation: slideInUp 0.6s ease-out;
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.rate-card::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
  animation: rotate 15s linear infinite;
  pointer-events: none;
}

.rate-card:hover {
  transform: translateY(-5px) scale(1.02);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
}

.rate-card:nth-child(1) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.rate-card:nth-child(2) {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.rate-card:nth-child(3) {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}

.rate-card:nth-child(4) {
  background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
}

.rate-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.currency-pair {
  font-size: 14px;
  font-weight: 600;
  opacity: 0.9;
}

.rate-value {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 6px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  flex: 1;
  display: flex;
  align-items: center;
}

.rate-trend {
  height: 35px;
  margin-top: 4px;
}

.mini-chart {
  width: 100%;
  height: 100%;
}

.exchange-rate-chart {
  background: var(--color-bg-base);
  border-radius: var(--radius-lg);
  padding: 12px;
  margin-bottom: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.rate-change {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.rate-change.positive {
  color: var(--color-on-primary, #fff);
  background: rgba(76, 175, 80, 0.3);
  border-color: rgba(76, 175, 80, 0.5);
}

.rate-change.negative {
  color: var(--color-on-primary, #fff);
  background: rgba(244, 67, 54, 0.3);
  border-color: rgba(244, 67, 54, 0.5);
}

.rate-change.neutral {
  color: var(--color-on-primary, #fff);
  background: rgba(158, 158, 158, 0.3);
  border-color: rgba(158, 158, 158, 0.5);
}

.last-update {
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 10px;
  padding: 8px;
  background: var(--color-bg-section);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-primary);
}

/* 滚动指示器样式 */
.scroll-indicator {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(64, 158, 255, 0.9);
  color: var(--color-on-primary, #fff);
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  animation: bounce 2s infinite;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 10;
  cursor: pointer;
  transition: all var(--transition-base) ease;
  user-select: none;
}

.scroll-indicator:hover {
  background: rgba(64, 158, 255, 1);
  transform: translateX(-50%) scale(1.05);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
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

/* 确保chart-body有相对定位 */
.chart-body {
  position: relative;
}

/* 数据源样式 */
.data-source {
  font-size: 11px;
  color: var(--color-text-secondary);
  font-weight: normal;
}

/* 排行榜容器样式 - 新设计 */
.ranking-container {
  overflow: visible;
}

.ranking-content {
  padding: 10px 8px;
}

.ranking-podium {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  padding: 20px 0 10px;
}

.podium-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px 10px;
  border-radius: var(--radius-lg);
  position: relative;
  transition: all var(--transition-base) ease;
  cursor: pointer;
  animation: fadeInUp 0.6s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.podium-item:nth-child(1) {
  animation-delay: 0.1s;
}

.podium-item:nth-child(2) {
  animation-delay: 0s;
}

.podium-item:nth-child(3) {
  animation-delay: 0.2s;
}

.podium-item:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

/* 王冠图标 */
.crown-icon {
  font-size: 16px;
  margin-bottom: 6px;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
  animation: float 3s ease-in-out infinite;
}

.crown-icon.champion {
  font-size: 20px;
  margin-bottom: 8px;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

/* 头像容器 */
/* 头像包裹层 - 相对定位容器，供 Lottie 绝对定位叠加 */
.avatar-wrapper {
  position: relative;
  width: 70px;
  height: 70px;
  margin: 10px auto 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rank-1 .avatar-wrapper {
  width: 80px;
  height: 80px;
}

/* 旧版特效容器（兼容无数据时的占位） */
.effect-wrapper {
  position: relative;
  width: 70px;
  height: 70px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rank-1 .effect-wrapper {
  width: 80px;
  height: 80px;
}

/* Lottie 特效覆盖层 - 绝对铺满父级后 flex 居中 */
.lottie-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 2;
}

/* 头像层 - 与特效层完全对称的绝对铺满 + flex 居中 */
.avatar-layer {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

/* 头像容器 - 纯视觉容器，不参与定位计算 */
.avatar-container {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid #fff;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
  flex-shrink: 0;
}

.rank-1 .avatar-container {
  width: 60px;
  height: 60px;
  border-width: 3px;
  box-shadow: 0 4px 12px rgba(255, 215, 0, 0.3);
}

.user-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 头像特效已移至全局 avatar-effects.css */

/* 排名徽章 */
.rank-badge {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 4px;
  letter-spacing: 0.5px;
}

/* 3D弹出卡片特效 */
.podium-item {
  perspective: 1200px;
  cursor: pointer;
  padding: 0; 
  background: transparent !important;
  box-shadow: none !important;
  border: none !important;
  position: relative;
  z-index: 1;
  transition: z-index 0s 0.3s;
}

.podium-item.flipped {
  z-index: 100;
  transition: z-index 0s 0s;
}

.flipper {
  width: 100%;
  height: 100%;
  position: relative;
  transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  transform-style: preserve-3d;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 3D弹出效果：向前飞出 + 放大 + 轻微旋转 */
.podium-item.flipped .flipper {
  transform: translateZ(80px) scale(1.15) rotateX(-5deg);
}

.front, .back {
  width: 100%;
  height: 100%;
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 18px 8px 14px;
  box-sizing: border-box;
  transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.front {
  position: relative;
  z-index: 2;
  backface-visibility: visible;
}

/* 弹出时正面淡出 */
.podium-item.flipped .front {
  opacity: 0;
  transform: scale(0.8);
}

.back {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 15px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  box-shadow: 0 20px 60px rgba(102, 126, 234, 0.4),
              0 0 0 1px rgba(255, 255, 255, 0.2) inset;
  opacity: 0;
  transform: scale(0.8) translateZ(-20px);
  z-index: 1;
}

/* 弹出时背面飞入 */
.podium-item.flipped .back {
  opacity: 1;
  transform: scale(1) translateZ(0);
  z-index: 3;
}

/* 重写原来的样式以适应新的结构 */
.rank-1 .front {
  background: linear-gradient(135deg, #fff9e6 0%, #fffbf0 100%);
  box-shadow: 0 8px 24px rgba(255, 193, 7, 0.25);
  border: 2px solid #ffe58f;
}

.rank-2 .front {
  background: linear-gradient(135deg, #fff3f3 0%, #fff8f8 100%);
  box-shadow: 0 6px 18px rgba(255, 152, 152, 0.2);
  border: 2px solid #ffd4d4;
}

.rank-3 .front {
  background: linear-gradient(135deg, #fff8ed 0%, #fffbf5 100%);
  box-shadow: 0 6px 18px rgba(255, 193, 122, 0.2);
  border: 2px solid #ffe4c4;
}

/* 个性签名样式 */
.bio-content {
  text-align: center;
  width: 100%;
}

.quote-icon {
  font-size: 24px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
  opacity: 0.5;
}

.bio-text {
  font-size: 14px;
  color: var(--color-text-regular);
  line-height: 1.5;
  font-style: italic;
  word-break: break-all;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  /* autoprefixer: ignore next */
  -webkit-box-orient: vertical;
  line-clamp: 4;
}

/* 第一名背面特殊样式 - 金色主题 */
.rank-1 .back {
  background: linear-gradient(135deg, #f6d365 0%, #fda085 50%, #f6d365 100%);
  box-shadow: 0 25px 70px rgba(246, 211, 101, 0.5),
              0 0 0 1px rgba(255, 255, 255, 0.3) inset,
              0 0 40px rgba(253, 160, 133, 0.3);
}

.rank-1 .bio-text {
  color: var(--color-on-primary, #fff);
  font-weight: 600;
  text-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.rank-1 .quote-icon {
  color: rgba(255, 255, 255, 0.9);
  opacity: 1;
}

/* 第二名背面特殊样式 - 银色主题 */
.rank-2 .back {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: 0 20px 60px rgba(102, 126, 234, 0.4),
              0 0 0 1px rgba(255, 255, 255, 0.2) inset;
}

.rank-2 .bio-text {
  color: var(--color-on-primary, #fff);
  font-weight: 500;
  text-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.rank-2 .quote-icon {
  color: rgba(255, 255, 255, 0.85);
}

/* 第三名背面特殊样式 - 青铜主题 */
.rank-3 .back {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
  box-shadow: 0 20px 60px rgba(17, 153, 142, 0.4),
              0 0 0 1px rgba(255, 255, 255, 0.2) inset;
}

.rank-3 .bio-text {
  color: var(--color-on-primary, #fff);
  font-weight: 500;
  text-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.rank-3 .quote-icon {
  color: rgba(255, 255, 255, 0.85);
}

/* 用户名 */
.user-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 4px;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 时间值 */
.time-value {
  font-size: 11px;
  color: var(--color-text-regular);
  text-align: center;
}

/* 第一名特殊样式 - 领奖台最高位 */
.podium-item.rank-1 {
  background: linear-gradient(135deg, #fff9e6 0%, #fffbf0 100%);
  box-shadow: 0 8px 24px rgba(255, 193, 7, 0.25);
  border: 2px solid #ffe58f;
}

.rank-1 .rank-badge {
  color: #ff9800;
  text-shadow: 0 2px 4px rgba(255, 152, 0, 0.3);
}

/* 第二名特殊样式 - 领奖台较低 */
.podium-item.rank-2 {
  background: linear-gradient(135deg, #fff3f3 0%, #fff8f8 100%);
  box-shadow: 0 6px 18px rgba(255, 152, 152, 0.2);
  border: 2px solid #ffd4d4;
  margin-top: 20px;
}

.rank-2 .rank-badge {
  color: #ff6b6b;
  text-shadow: 0 2px 4px rgba(255, 107, 107, 0.3);
}

/* 第三名特殊样式 - 领奖台最低 */
.podium-item.rank-3 {
  background: linear-gradient(135deg, #fff8ed 0%, #fffbf5 100%);
  box-shadow: 0 6px 18px rgba(255, 193, 122, 0.2);
  border: 2px solid #ffe4c4;
  margin-top: 30px;
}

.rank-3 .rank-badge {
  color: #ffa940;
  text-shadow: 0 2px 4px rgba(255, 169, 64, 0.3);
}

/* 暂无数据状态样式 */
.podium-item.no-data {
  opacity: 0.15;
  cursor: default;
  background: transparent !important;
  box-shadow: none !important;
  border: 1px dashed var(--color-border-base) !important;
}

.podium-item.no-data:hover {
  transform: none;
}

/* 排行榜加载状态样式 */
.ranking-loading {
  padding: 20px 0;
}

/* 排行榜骨架屏样式 */
.ranking-podium-skeleton {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 5px;
  min-height: 220px;
}

.podium-item-skeleton {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  transition: all var(--transition-base) ease;
}

.podium-item-skeleton.rank-1 {
  order: 2;
  padding-bottom: 0;
}

.podium-item-skeleton.rank-2 {
  order: 1;
  padding-bottom: 15px;
}

.podium-item-skeleton.rank-3 {
  order: 3;
  padding-bottom: 20px;
}

/* 骨架屏动画 */
@keyframes skeletonLoading {
  0% {
    background-position: -200px 0;
  }
  100% {
    background-position: calc(200px + 100%) 0;
  }
}

.skeleton-crown,
.skeleton-avatar,
.skeleton-badge,
.skeleton-name,
.skeleton-time {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200px 100%;
  animation: skeletonLoading 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
}

.skeleton-crown {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  margin-bottom: 4px;
}

.podium-item-skeleton.rank-1 .skeleton-crown {
  width: 24px;
  height: 24px;
}

.skeleton-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  margin-bottom: 6px;
}

.podium-item-skeleton.rank-1 .skeleton-avatar {
  width: 60px;
  height: 60px;
}

.skeleton-badge {
  width: 45px;
  height: 20px;
  border-radius: 10px;
  margin-bottom: 4px;
}

.skeleton-name {
  width: 60px;
  height: 14px;
  border-radius: 7px;
  margin-bottom: 4px;
}

.skeleton-time {
  width: 70px;
  height: 12px;
  border-radius: var(--radius-base);
}

/* 排行榜内容淡入动画 */
.ranking-podium {
  animation: fadeInUp 0.5s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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
  background: linear-gradient(90deg, rgba(64, 158, 255, 0.2) 0%, rgba(64, 158, 255, 0) 100%);
  margin: 20px 0;
}

/* 详情对话框长文本处理 - 自动添加 */
:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>