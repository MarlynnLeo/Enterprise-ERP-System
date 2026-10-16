<template>
  <div class="module-page dashboard-page dashboard-container dashboard--classic">
    <div class="main-layout">
      <!-- 头部欢迎栏与日期 -->
      <header class="dashboard-heading">
        <div class="dashboard-heading-copy">
          <div class="heading-title-row">
            <h1>工作概览</h1>
            <span class="heading-badge">实时动态</span>
          </div>
          <p>掌握今日待办、团队协作与工业行情</p>
        </div>
        <div class="dashboard-date">
          <el-icon class="date-icon"><Calendar /></el-icon>
          <span>{{ todayLabel }}</span>
        </div>
      </header>

      <!-- 核心指标统计与个人信息 -->
      <section class="overview-grid" aria-label="工作统计与个人信息">
        <div class="overview-metrics">
          <div
            v-for="(stat, index) in statCards"
            :key="index"
            class="overview-stat"
          >
            <div class="dashboard-stat" :class="{ 'dashboard-stat-loading': isLoadingStats }">
              <div class="dashboard-stat-icon" :class="stat.colorClass">
                <el-icon><component :is="stat.icon" /></el-icon>
              </div>
              <div class="dashboard-stat-content">
                <div class="dashboard-stat-value" v-if="!isLoadingStats">
                  <span class="dashboard-stat-number" :data-value="stat.value">{{ stat.value }}</span>
                </div>
                <el-skeleton-item v-else variant="h3" class="skel-icon" />
                <div class="dashboard-stat-label">{{ stat.label }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 个人信息与天气整合卡片 -->
        <div class="overview-profile">
          <PersonalInfoCard
            :userProfile="userProfile"
            :weather="weather"
            :loading="isLoadingProfile"
          />
        </div>
      </section>

      <!-- 主工作区内容：双栏弹性响应式排版 -->
      <div class="dashboard-content">
        <!-- 左侧核心主栏：待办事项与生产计划 -->
        <section class="dashboard-primary" aria-label="待办事项与生产计划">
          <div class="dashboard-panel dashboard-todos">
            <DashboardTodoList
              :tasks="activeTodoTasks"
              :tab="activeTodoTab"
              :count="activeTodoCount"
              @switch-tab="switchTodoTab"
              @go-to-all="goToTodoPage"
              @view="viewTodoDetail"
            />
          </div>
          <div v-if="canViewProductionPlans" class="dashboard-panel dashboard-plans">
            <ProductionPlanTable
              :warningList="warningList"
              @view="viewProductionPlan"
            />
          </div>
        </section>

        <!-- 右侧辅助侧栏：团队排行、市场行情与日历 -->
        <section class="dashboard-secondary" aria-label="团队动态、市场行情与日历">
          <div class="dashboard-panel ranking-container">
            <OnlineTimeRanking
              :rankings="onlineTimeRanking"
              :loading="rankingLoading"
              :date="rankingDate"
              @refresh="fetchOnlineTimeRanking(true)"
            />
          </div>
          <div class="dashboard-panel dashboard-market">
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
          </div>
          <div class="dashboard-panel dashboard-calendar">
            <div class="calendar-wrapper">
              <div class="calendar-header">
                <div class="month-selector">
                  <button type="button" class="month-arrow-btn" aria-label="上个月" @click="changeMonth(-1)">
                    <el-icon><ArrowLeft /></el-icon>
                  </button>
                  <span class="month-title">{{ currentMonthStr }}</span>
                  <button type="button" class="month-arrow-btn" aria-label="下个月" @click="changeMonth(1)">
                    <el-icon><ArrowRight /></el-icon>
                  </button>
                </div>
                <button type="button" class="calendar-today-btn" @click="goToTodoPage">
                  <span>查看待办</span>
                </button>
              </div>
              <div class="calendar-alert">
                <span class="calendar-alert-dot"></span>
                <span>今日：{{ currentYear }}年{{ currentMonth }}月{{ currentDay }}日</span>
              </div>
              <div class="calendar-content">
                <div class="weekdays-header">
                  <div class="weekday weekend">日</div>
                  <div class="weekday">一</div>
                  <div class="weekday">二</div>
                  <div class="weekday">三</div>
                  <div class="weekday">四</div>
                  <div class="weekday">五</div>
                  <div class="weekday weekend">六</div>
                </div>
                <div class="days-grid">
                  <div class="day-cell" v-for="(day, index) in calendarDays" :key="index">
                    <div
                      :class="[
                        'day-number',
                        {
                          'has-events': day.hasEvents,
                          'current': day.isCurrentDay,
                          'other-month': !day.isCurrentMonth
                        }
                      ]"
                    >
                      <span class="date-text">{{ day.date }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { inject } from 'vue'
import { ArrowLeft, ArrowRight, Calendar } from '@element-plus/icons-vue'
import { DASHBOARD_CONTEXT } from '../dashboardContext'
import DashboardTodoList from '../components/classic/DashboardTodoList.vue'
import OnlineTimeRanking from '../components/classic/OnlineTimeRanking.vue'
import PersonalInfoCard from '../components/classic/PersonalInfoCard.vue'
import PriceExchangePanel from '../components/classic/PriceExchangePanel.vue'
import ProductionPlanTable from '../components/classic/ProductionPlanTable.vue'
import '@/assets/classic-price-panel.css'

const {
  statCards, isLoadingStats, userProfile, weather, isLoadingProfile,
  activeTodoTasks, activeTodoTab, activeTodoCount, switchTodoTab, goToTodoPage, viewTodoDetail,
  onlineTimeRanking, rankingLoading, rankingDate, fetchOnlineTimeRanking,
  metalPriceCards, exchangeRateCards, exchangeRateLoading, metalPricesLoading, metalPrices, exchangeRates,
  setMiniChartRef, setMetalMiniChartRef, setExchangeRateChartRef, refreshAllPrices, onPricePanelTabChange,
  canViewProductionPlans, warningList, viewProductionPlan, changeMonth,
  currentMonthStr, currentYear, currentMonth, currentDay, calendarDays, todayLabel
} = inject(DASHBOARD_CONTEXT)
</script>

<style scoped>
.dashboard-container {
  --classic-sidebar-width: clamp(380px, 28vw, 440px);
  --classic-gap: 14px;
  --classic-card-radius: 4px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
  overflow-x: hidden;
}

.main-layout {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--classic-gap);
}

/* 顶部标题栏 */
.dashboard-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 4px 2px 2px;
}

.dashboard-heading-copy {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.heading-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dashboard-heading h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-text-primary);
  line-height: 1.2;
}

.heading-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
  border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
}

.dashboard-heading p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.dashboard-date {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: var(--classic-card-radius);
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-base);
  box-shadow: none;
  color: var(--color-text-regular);
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.date-icon {
  color: var(--color-primary);
  font-size: 14px;
}

/* 统计卡片与个人信息栅格 */
.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--classic-sidebar-width);
  gap: var(--classic-gap);
  min-width: 0;
}

.overview-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: stretch;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-base);
  border-radius: var(--classic-card-radius);
  box-shadow: none;
  box-sizing: border-box;
  min-height: 82px;
  overflow: hidden;
}

.overview-stat {
  display: flex;
  min-width: 0;
}

.overview-stat + .overview-stat {
  border-left: 1px solid var(--color-border-lighter);
}

.dashboard-container .dashboard-stat {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  box-sizing: border-box;
  background: transparent;
  transition: background-color var(--transition-fast) ease;
}

.dashboard-container .dashboard-stat:hover {
  background: color-mix(in srgb, var(--color-primary) 3%, transparent);
}

.dashboard-stat-icon {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--metric-color) 12%, var(--color-bg-base));
  color: var(--metric-color);
  border: 1px solid color-mix(in srgb, var(--metric-color) 18%, transparent);
  box-shadow: none;
  transition: transform var(--transition-fast) ease;
}

.dashboard-stat:hover .dashboard-stat-icon {
  transform: scale(1.05);
}

.dashboard-stat-icon .el-icon {
  font-size: 22px;
}

.blue { --metric-color: var(--color-primary); }
.red { --metric-color: var(--color-danger); }
.green { --metric-color: var(--color-success); }
.purple { --metric-color: #8B5CF6; }

.dashboard-stat-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  justify-content: center;
}

.dashboard-stat-value {
  color: var(--color-text-primary);
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.dashboard-stat-label {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.overview-profile {
  min-width: 0;
}

/* 主内容两栏 */
.dashboard-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--classic-sidebar-width);
  gap: var(--classic-gap);
  align-items: start;
  min-width: 0;
}

.dashboard-primary,
.dashboard-secondary {
  display: flex;
  flex-direction: column;
  gap: var(--classic-gap);
  min-width: 0;
}

.dashboard-todos {
  min-height: 410px;
}

.dashboard-plans {
  min-height: 340px;
}

.ranking-container {
  min-height: 220px;
}

.dashboard-market {
  min-height: 250px;
}

.dashboard-calendar {
  min-height: 280px;
}

/* 日历组件视觉精修 */
.calendar-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border: 1px solid var(--color-border-base);
  border-radius: var(--classic-card-radius);
  background: var(--color-bg-base);
  box-shadow: none;
}

.calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.month-selector {
  display: flex;
  align-items: center;
  gap: 6px;
}

.month-arrow-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid var(--color-border-light);
  background: var(--color-bg-base);
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 0;
  transition: all var(--transition-fast) ease;
}

.month-arrow-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
}

.month-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-primary);
  min-width: 72px;
  text-align: center;
}

.calendar-today-btn {
  border: 0;
  background: transparent;
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background var(--transition-fast) ease;
}

.calendar-today-btn:hover {
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.calendar-alert {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: color-mix(in srgb, var(--color-primary) 7%, var(--color-bg-base));
  color: var(--color-primary);
  border: 1px solid color-mix(in srgb, var(--color-primary) 16%, transparent);
  padding: 5px 10px;
  border-radius: 6px;
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 600;
}

.calendar-alert-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-primary);
}

.calendar-content {
  display: flex;
  flex-direction: column;
}

.weekdays-header,
.days-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 3px;
}

.weekdays-header {
  margin-bottom: 6px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.weekday.weekend {
  color: var(--color-warning);
}

.day-cell {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 28px;
}

.day-number {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  border-radius: 6px;
  color: var(--color-text-regular);
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  cursor: default;
  transition: all var(--transition-fast) ease;
}

.day-number:hover:not(.current) {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.day-number.has-events {
  color: var(--color-primary);
  font-weight: 700;
}

.day-number.has-events::after {
  content: '';
  position: absolute;
  bottom: 2px;
  width: 4px;
  height: 4px;
  background: var(--color-primary);
  border-radius: 50%;
}

.day-number.current {
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-weight: 700;
  box-shadow: none;
}

.day-number.current::after {
  background: var(--color-on-primary);
}

.day-number.other-month {
  color: var(--color-text-placeholder);
  opacity: 0.5;
}

/* 响应式断点适配 */
@media (max-width: 1200px) {
  .overview-grid,
  .dashboard-content {
    grid-template-columns: minmax(0, 1fr);
  }

  .overview-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .overview-stat:nth-child(2) {
    border-right: none;
  }

  .overview-stat:nth-child(3),
  .overview-stat:nth-child(4) {
    border-top: 1px solid var(--color-border-lighter);
  }

  .overview-stat:nth-child(3) {
    border-left: none;
  }
}

@media (max-width: 640px) {
  .overview-metrics {
    grid-template-columns: minmax(0, 1fr);
  }

  .overview-stat + .overview-stat {
    border-left: none;
    border-top: 1px solid var(--color-border-lighter);
  }
}
</style>
