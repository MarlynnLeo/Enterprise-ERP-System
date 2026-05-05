<template>
  <div class="stats-container">
    <!-- 顶部标题卡片 -->
    <div class="stats-header">
      <div class="stats-header-left">
        <div class="stats-icon-wrapper">
          <el-icon class="stats-icon"><DataAnalysis /></el-icon>
        </div>
        <div class="stats-title-group">
          <h2 class="stats-title">个人数据统计</h2>
          <p class="stats-subtitle">全面了解您的工作表现和活跃情况</p>
        </div>
      </div>
      <div class="stats-header-right">
        <el-tag type="success" effect="dark" size="large">
          <el-icon><Trophy /></el-icon>
          综合评分: {{ efficiencyScore }}分
        </el-tag>
      </div>
    </div>

    <!-- 核心指标卡片 -->
    <el-row :gutter="20" class="core-metrics">
      <el-col :xs="24" :sm="12" :md="8">
        <div class="metric-card metric-card-1">
          <div class="metric-bg-decoration"></div>
          <div class="metric-content">
            <div class="metric-icon-wrapper">
              <el-icon class="metric-icon"><TrendCharts /></el-icon>
            </div>
            <div class="metric-info">
              <div class="metric-label">效率评分</div>
              <div class="metric-value">{{ efficiencyScore }}<span class="metric-unit">分</span></div>
              <div class="metric-desc">
                <el-icon><InfoFilled /></el-icon>
                任务完成效率指标
              </div>
            </div>
          </div>
          <div class="metric-progress">
            <el-progress :percentage="efficiencyScore" :show-text="false" :stroke-width="4" />
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8">
        <div class="metric-card metric-card-2">
          <div class="metric-bg-decoration"></div>
          <div class="metric-content">
            <div class="metric-icon-wrapper">
              <el-icon class="metric-icon"><Timer /></el-icon>
            </div>
            <div class="metric-info">
              <div class="metric-label">平均响应</div>
              <div class="metric-value">{{ averageResponseTime }}</div>
              <div class="metric-desc">
                <el-icon><InfoFilled /></el-icon>
                处理任务平均用时
              </div>
            </div>
          </div>
          <div class="metric-trend">
            <el-icon color="#67C23A"><Promotion /></el-icon>
            <span>效率提升</span>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="8">
        <div class="metric-card metric-card-3">
          <div class="metric-bg-decoration"></div>
          <div class="metric-content">
            <div class="metric-icon-wrapper">
              <el-icon class="metric-icon"><Calendar /></el-icon>
            </div>
            <div class="metric-info">
              <div class="metric-label">活跃天数</div>
              <div class="metric-value">{{ daysActive }}<span class="metric-unit">天</span></div>
              <div class="metric-desc">
                <el-icon><InfoFilled /></el-icon>
                本月累计活跃
              </div>
            </div>
          </div>
          <div class="metric-badge">
            <el-icon><StarFilled /></el-icon>
            活跃用户
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 图表统计区 -->
    <el-row :gutter="20" class="stat-charts">
      <el-col :xs="24" :sm="24" :md="12">
        <div class="chart-card chart-card-1">
          <div class="chart-card-header">
            <div class="chart-title-group">
              <el-icon class="chart-icon"><CircleCheck /></el-icon>
              <div>
                <h3 class="chart-title">待办事项完成率</h3>
                <p class="chart-subtitle">任务执行情况统计</p>
              </div>
            </div>
            <el-tag :type="todoCompletionRate >= 80 ? 'success' : todoCompletionRate >= 60 ? 'warning' : 'danger'" effect="dark">
              {{ todoCompletionRate >= 80 ? '优秀' : todoCompletionRate >= 60 ? '良好' : '待提升' }}
            </el-tag>
          </div>
          <div class="chart-body">
            <div class="chart-progress-wrapper">
              <el-progress
                type="dashboard"
                :percentage="todoCompletionRate"
                :width="180"
                :stroke-width="15"
                :color="[
                  { color: 'var(--color-danger)', percentage: 40 },
                  { color: 'var(--color-warning)', percentage: 70 },
                  { color: 'var(--color-success)', percentage: 100 }
                ]"
              >
                <template #default="{ percentage }">
                  <div class="progress-content">
                    <span class="percentage-value">{{ percentage }}%</span>
                    <span class="percentage-label">完成度</span>
                  </div>
                </template>
              </el-progress>
            </div>
            <div class="chart-stats-grid">
              <div class="stat-grid-item">
                <div class="stat-grid-icon" style="background: linear-gradient(135deg, #67c23a 0%, #85ce61 100%)">
                  <el-icon><CircleCheck /></el-icon>
                </div>
                <div class="stat-grid-info">
                  <div class="stat-grid-label">已完成</div>
                  <div class="stat-grid-value">{{ completedTodos }}</div>
                </div>
              </div>
              <div class="stat-grid-item">
                <div class="stat-grid-icon" style="background: linear-gradient(135deg, #409eff 0%, #66b1ff 100%)">
                  <el-icon><Document /></el-icon>
                </div>
                <div class="stat-grid-info">
                  <div class="stat-grid-label">总计</div>
                  <div class="stat-grid-value">{{ totalTodos }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="24" :md="12">
        <div class="chart-card chart-card-2">
          <div class="chart-card-header">
            <div class="chart-title-group">
              <el-icon class="chart-icon"><Promotion /></el-icon>
              <div>
                <h3 class="chart-title">本月活跃度</h3>
                <p class="chart-subtitle">工作活跃情况分析</p>
              </div>
            </div>
            <el-tag :type="monthlyActivity >= 80 ? 'success' : monthlyActivity >= 60 ? 'warning' : 'info'" effect="dark">
              {{ monthlyActivity >= 80 ? '非常活跃' : monthlyActivity >= 60 ? '较活跃' : '一般' }}
            </el-tag>
          </div>
          <div class="chart-body">
            <div class="chart-progress-wrapper">
              <el-progress
                type="dashboard"
                :percentage="monthlyActivity"
                :width="180"
                :stroke-width="15"
                :color="[
                  { color: 'var(--color-text-secondary)', percentage: 40 },
                  { color: 'var(--color-warning)', percentage: 70 },
                  { color: 'var(--color-success)', percentage: 100 }
                ]"
              >
                <template #default="{ percentage }">
                  <div class="progress-content">
                    <span class="percentage-value">{{ percentage }}%</span>
                    <span class="percentage-label">活跃度</span>
                  </div>
                </template>
              </el-progress>
            </div>
            <div class="chart-stats-grid">
              <div class="stat-grid-item">
                <div class="stat-grid-icon" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%)">
                  <el-icon><User /></el-icon>
                </div>
                <div class="stat-grid-info">
                  <div class="stat-grid-label">登录次数</div>
                  <div class="stat-grid-value">{{ loginCount }}</div>
                </div>
              </div>
              <div class="stat-grid-item">
                <div class="stat-grid-icon" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)">
                  <el-icon><CircleCheck /></el-icon>
                </div>
                <div class="stat-grid-info">
                  <div class="stat-grid-label">完成任务</div>
                  <div class="stat-grid-value">{{ tasksCompleted }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  DataAnalysis, Trophy, TrendCharts, Timer, Calendar, InfoFilled,
  Promotion, StarFilled, CircleCheck, Document, User
} from '@element-plus/icons-vue'

const props = defineProps({
  efficiencyScore: {
    type: Number,
    default: 85
  },
  averageResponseTime: {
    type: String,
    default: '2.3小时'
  },
  daysActive: {
    type: Number,
    default: 0
  },
  completedTodos: {
    type: Number,
    default: 0
  },
  totalTodos: {
    type: Number,
    default: 0
  },
  loginCount: {
    type: Number,
    default: 0
  },
  tasksCompleted: {
    type: Number,
    default: 0
  }
})

const todoCompletionRate = computed(() => {
  if (props.totalTodos === 0) return 0
  return Math.round((props.completedTodos / props.totalTodos) * 100)
})

// 活跃度计算
const monthlyActivity = computed(() => {
  const baseScore = 60
  const loginScore = Math.min(props.loginCount * 2, 20)
  const taskScore = Math.min(props.tasksCompleted * 2, 20)
  return Math.min(baseScore + loginScore + taskScore, 100)
})
</script>

<style scoped>
.stats-container {
  padding: 10px;
}

.stats-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  background: var(--el-bg-color);
  padding: 20px;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
}

.stats-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stats-icon-wrapper {
  width: 48px;
  height: 48px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.stats-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 4px 0;
  color: var(--el-text-color-primary);
}

.stats-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

/* 核心指标卡片 */
.core-metrics {
  margin-bottom: 30px;
}

.metric-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 20px;
  border-radius: 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  transition: all 0.3s ease;
  min-height: 140px;
  position: relative;
  overflow: hidden;
  margin-bottom: 20px;
}

.metric-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.metric-bg-decoration {
  position: absolute;
  top: -50px;
  right: -50px;
  width: 150px;
  height: 150px;
  border-radius: 50%;
  opacity: 0.1;
  background: currentColor;
}

.metric-card-1 { color: var(--el-color-primary); }
.metric-card-2 { color: var(--el-color-success); }
.metric-card-3 { color: var(--el-color-warning); }

.metric-content {
  display: flex;
  gap: 16px;
  z-index: 1;
}

.metric-icon-wrapper {
  width: 50px;
  height: 50px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: var(--color-on-primary, #fff);
  background: currentColor;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.metric-info {
  flex: 1;
}

.metric-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.metric-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1.2;
}

.metric-unit {
  font-size: 14px;
  font-weight: 400;
  margin-left: 4px;
  color: var(--el-text-color-secondary);
}

.metric-desc {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  margin-top: 4px;
}

.metric-progress {
  margin-top: 16px;
}

.metric-trend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 16px;
  font-size: 13px;
  color: var(--el-color-success);
  font-weight: 500;
}

.metric-badge {
  position: absolute;
  bottom: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  padding: 4px 8px;
  border-radius: 4px;
}

/* 图表统计区 */
.stat-charts {
  margin-bottom: 30px;
}

.chart-card {
  background: var(--el-bg-color);
  border-radius: 16px;
  border: 1px solid var(--el-border-color-lighter);
  padding: 24px;
  height: 100%;
  margin-bottom: 20px;
}

.chart-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 30px;
}

.chart-title-group {
  display: flex;
  gap: 12px;
}

.chart-icon {
  font-size: 24px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  padding: 8px;
  border-radius: 8px;
  height: fit-content;
}

.chart-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.chart-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.chart-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 30px;
}

.chart-progress-wrapper {
  position: relative;
}

.progress-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.percentage-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.percentage-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.chart-stats-grid {
  display: flex;
  gap: 40px;
  width: 100%;
  justify-content: center;
}

.stat-grid-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-grid-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-on-primary, #fff);
  font-size: 18px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
}

.stat-grid-info {
  display: flex;
  flex-direction: column;
}

.stat-grid-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.stat-grid-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

/* 响应式调整 */
@media (max-width: 768px) {
  .chart-stats-grid {
    flex-direction: column;
    gap: 16px;
    align-items: center;
  }
}
</style>
