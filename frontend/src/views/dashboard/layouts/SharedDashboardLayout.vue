<template>
  <div class="module-page dashboard-page dashboard-container dashboard--shared">
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
                <div class="day-cell" v-for="(day, index) in calendarDays" :key="index">
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
import { inject } from 'vue'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { DASHBOARD_CONTEXT } from '../dashboardContext'
import DashboardTodoList from '../components/DashboardTodoList.vue'
import OnlineTimeRanking from '../components/OnlineTimeRanking.vue'
import PersonalInfoCard from '../components/PersonalInfoCard.vue'
import PriceExchangePanel from '../components/PriceExchangePanel.vue'
import ProductionPlanTable from '../components/ProductionPlanTable.vue'

const {
  statCards, isLoadingStats, userProfile, weather, isLoadingProfile,
  activeTodoTasks, activeTodoTab, activeTodoCount, switchTodoTab, goToTodoPage, viewTodoDetail,
  onlineTimeRanking, rankingLoading, rankingDate, fetchOnlineTimeRanking,
  metalPriceCards, exchangeRateCards, exchangeRateLoading, metalPricesLoading, metalPrices, exchangeRates,
  setMiniChartRef, setMetalMiniChartRef, setExchangeRateChartRef, refreshAllPrices, onPricePanelTabChange,
  canViewProductionPlans, warningList, viewProductionPlan, changeMonth,
  currentMonthStr, currentYear, currentMonth, currentDay, calendarDays
} = inject(DASHBOARD_CONTEXT)
</script>
<style scoped>
.dashboard-container {
  padding: 20px;
  background-color: transparent;
  min-height: 100vh;
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
  .chart-container,
  .calendar-wrapper {
    height: auto !important;
    min-height: 300px;
  }
}
/* 统计卡片样式 - Dashboard特定布局（横向：图标+内容，水平居中） */
/* 覆盖全局的居中布局 */
.stat-card {
  position: relative;
  gap: 12px;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  text-align: left !important;
  padding: 15px !important;
  height: 90px !important;
  background: var(--color-bg-base) !important;
  border: 1px solid var(--color-border-lighter) !important;
  border-radius: 10px !important;
  box-shadow: 0 2px 12px 0 color-mix(in srgb, var(--ds-black) 5%, transparent);
  transition: border-color var(--transition-base) ease, background-color var(--transition-base) ease;
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
  inset: 0;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--ds-white) 30%, transparent), transparent);
}
/* 数字动画效果 */
.animated-number {
  display: inline-block;
  transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease, opacity 0.3s ease, transform 0.3s ease;
}
/* 数据就绪标记：静态显示，避免首页空闲时持续绘制。 */
.update-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--color-success);
  opacity: 0.65;
}
.stat-content {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  min-width: 0;
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
  white-space: nowrap;
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
