<template>
  <div class="module-page dashboard-page dashboard-container dashboard--classic">
    <div class="main-layout">
      <header class="dashboard-heading">
        <div class="dashboard-heading-copy">
          <h1>工作概览</h1>
          <p>掌握今日待办、团队动态与市场行情</p>
        </div>
        <div class="dashboard-date"><el-icon><Calendar /></el-icon>{{ todayLabel }}</div>
      </header>
      <!-- 工作概览和个人信息 -->
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
      <div class="dashboard-content">
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
                  <el-button text circle class="month-arrow" aria-label="上个月" @click="changeMonth(-1)"><el-icon><ArrowLeft /></el-icon></el-button>
                  <span>{{ currentMonthStr }}</span>
                  <el-button text circle class="month-arrow" aria-label="下个月" @click="changeMonth(1)"><el-icon><ArrowRight /></el-icon></el-button>
                </div>
                <el-button link class="more-btn" @click="goToTodoPage">查看待办</el-button>
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
  --classic-primary-width: 1150px;
  --classic-secondary-width: 500px;
  --classic-calendar-height: 284px;
  --classic-card-gap: 10px;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: auto;
  background: transparent;
}
.main-layout {
  /* 保持桌面卡片尺寸，窄窗口通过页面滚动查看。 */
  width: calc(var(--classic-primary-width) + var(--classic-secondary-width) + var(--classic-card-gap));
  flex: none;
  display: grid;
  grid-template-rows: repeat(3, auto);
  align-content: start;
  gap: 10px;
}
.dashboard-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 2px 0;
}
.dashboard-heading h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.5px;
  color: var(--color-text-primary);
}
.dashboard-heading-copy {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.dashboard-heading p {
  margin: 2px 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}
.dashboard-date {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.overview-grid {
  display: grid;
  grid-template-columns: var(--classic-primary-width) var(--classic-secondary-width);
  height: 72px;
  gap: 10px;
}
.overview-metrics {
  display: grid;
  height: 72px;
  box-sizing: border-box;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: center;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-base);
  border-radius: var(--radius-sm);
}
.overview-stat + .overview-stat {
  border-left: 1px solid var(--color-border-light);
}
.overview-stat,
.overview-profile,
.dashboard-panel {
  min-width: 0;
}
.overview-profile :deep(.combined-info-card) {
  margin: 0;
  border-radius: var(--radius-sm);
}
.dashboard-container .dashboard-stat {
  position: relative;
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  min-width: 0;
  min-height: 52px;
  padding: 8px 14px;
  margin: 0;
  box-sizing: border-box;
  text-align: left;
  background: transparent;
}
.dashboard-stat-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.dashboard-stat-icon {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--metric-color) 10%, var(--color-bg-base));
  color: var(--metric-color);
}
.blue { --metric-color: var(--color-primary); }
.red { --metric-color: var(--color-danger); }
.green { --metric-color: var(--color-warning); }
.purple { --metric-color: var(--ds-purple); }
.dashboard-stat-icon .el-icon { font-size: 17px; }
.dashboard-stat-value {
  color: var(--color-text-primary);
  font-size: 21px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.6px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.dashboard-stat-label {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 13px;
}
.dashboard-content {
  display: grid;
  grid-template-columns: var(--classic-primary-width) var(--classic-secondary-width);
  align-items: start;
  gap: 10px;
}
.dashboard-primary,
.dashboard-secondary {
  display: grid;
  align-content: start;
  gap: 10px;
  min-width: 0;
}
.dashboard-panel > :deep(*) {
  margin-bottom: 0;
}
.dashboard-todos { height: 394px; }
.ranking-container { height: 202px; }
.dashboard-market { height: 244px; }
.dashboard-plans {
  /* 补齐左右上方卡片的 62px 高差，使生产计划底边与日历对齐。 */
  height: calc(var(--classic-calendar-height) + 62px);
}
.dashboard-calendar { height: var(--classic-calendar-height); }
.calendar-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid var(--color-border-base);
  border-radius: var(--radius-sm);
  background: var(--color-bg-base);
}
.calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}
.month-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 600;
}
.month-arrow { color: var(--color-text-secondary); }
.more-btn { font-size: 12px; }
.calendar-alert {
  background: var(--color-primary-light-9);
  color: var(--color-primary);
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
  text-align: center;
  font-size: 13px;
}
.calendar-content {
  display: flex;
  flex-direction: column;
}
.weekdays-header,
.days-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}
.weekdays-header {
  margin-bottom: 8px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 12px;
}
.day-cell {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 24px;
  font-size: 13px;
}
.day-number {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  border-radius: var(--radius-sm);
  color: var(--color-text-regular);
  font-variant-numeric: tabular-nums;
}
.day-number.has-events {
  color: var(--color-primary);
  background: var(--color-primary-light-9);
}
.day-number.has-events::after {
  content: '';
  position: absolute;
  bottom: 2px;
  width: 3px;
  height: 3px;
  background: currentColor;
  border-radius: 50%;
}
.day-number.current {
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-weight: 600;
}
.day-number.other-month { color: var(--color-text-placeholder); }
</style>
