<!--
/**
 * ReportHistory.vue - 报工记录
 * @description 报工历史记录页面
 * @date 2026-04-15
 * @version 1.0.0
 */
-->
<template>
  <div class="report-history-page">
    <NavBar title="报工记录" left-arrow @click-left="goBack" />
    <div class="search-section">
      <Search v-model="searchValue" placeholder="搜索任务编号或产品名称" />
    </div>
    <div class="filter-scroll">
      <button
        v-for="tab in dateTabs"
        :key="tab.value"
        type="button"
        class="filter-chip"
        :class="{ active: activeDate === tab.value }"
        @click="activeDate = tab.value"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="stats-row" v-if="statsData">
      <div v-for="stat in statsData" :key="stat.label" class="stat-item">
        <div class="stat-value">{{ stat.value }}</div>
        <div class="stat-label">{{ stat.label }}</div>
      </div>
    </div>

    <!-- 报工记录列表 -->
    <div class="report-list">
      <div
        v-for="report in filteredReports"
        :key="report.id"
        class="list-card"
        @click="viewReportDetail(report)"
      >
        <!-- 报工头部 -->
        <div class="list-card-header">
          <div class="list-card-title">{{ report.taskCode }} - {{ report.productName }}</div>
          <span class="report-status" :class="getStatusClass(report.status)">
            {{ getStatusText(report.status) }}
          </span>
        </div>

        <!-- 报工详情 -->
        <div class="list-card-body">
          <div class="info-row">
            <span class="info-label">完成数量</span>
            <span class="info-value">{{ report.completedQuantity }} {{ report.unit }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">合格数量</span>
            <span class="info-value success">{{ report.qualifiedQuantity }} {{ report.unit }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">不良数量</span>
            <span class="info-value error">{{ report.defectiveQuantity }} {{ report.unit }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">工时</span>
            <span class="info-value">{{ report.workHours }} 小时</span>
          </div>
        </div>

        <!-- 底部信息 -->
        <div class="list-card-footer">
          <span class="footer-left">{{ report.reportDate }}</span>
          <span class="footer-right">操作人: {{ report.operator }}</span>
        </div>
      </div>

      <!-- 空状态 -->
      <VanEmpty v-if="filteredReports.length === 0" description="暂无报工记录" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, Empty as VanEmpty, NavBar, Search } from 'vant'
import dayjs from 'dayjs'
import { productionApi } from '@/services/api'

const router = useRouter()

// 搜索和筛选
const searchValue = ref('')
const activeDate = ref('all')

// 日期标签
const dateTabs = ref([
  { label: '全部', value: 'all' },
  { label: '今天', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' }
])

// 统计数据
const statsData = ref([
  { label: '总报工', value: 0 },
  { label: '今日报工', value: 0 },
  { label: '本周报工', value: 0 }
])

const reports = ref([])

// 过滤后的报工记录
const filteredReports = computed(() => {
  let result = reports.value

  // 按日期筛选
  if (activeDate.value !== 'all') {
    const today = dayjs()
    result = result.filter(report => {
      const reportDate = dayjs(report.reportDate)
      if (activeDate.value === 'today') {
        return reportDate.isSame(today, 'day')
      } else if (activeDate.value === 'week') {
        return reportDate.isSame(today, 'week')
      } else if (activeDate.value === 'month') {
        return reportDate.isSame(today, 'month')
      }
      return true
    })
  }

  // 按搜索关键词筛选
  if (searchValue.value) {
    const keyword = searchValue.value.toLowerCase()
    result = result.filter(report =>
      report.taskCode.toLowerCase().includes(keyword) ||
      report.productName.toLowerCase().includes(keyword)
    )
  }

  return result
})

// 方法
const goBack = () => {
  router.back()
}

const viewReportDetail = (report) => {
  showToast(`查看报工详情: ${report.taskCode}`)
}

const normalizeReport = (row) => ({
  id: row.id,
  taskCode: row.task_code || row.taskCode || '',
  productName: row.product_name || row.productName || '',
  completedQuantity: Number(row.completed_quantity || row.report_quantity || 0),
  qualifiedQuantity: Number(row.qualified_quantity || 0),
  defectiveQuantity: Number(row.defective_quantity || 0),
  workHours: Number(row.work_hours || 0),
  unit: row.unit || '',
  operator: row.operator_name || row.operator || '',
  reportDate: row.report_time ? dayjs(row.report_time).format('YYYY-MM-DD') : '',
  status: row.status || 'completed'
})

const loadReports = async () => {
  try {
    const params = { page: 1, pageSize: 200 }
    const today = dayjs()
    if (activeDate.value === 'today') {
      params.startDate = today.format('YYYY-MM-DD')
      params.endDate = today.format('YYYY-MM-DD')
    } else if (activeDate.value === 'week') {
      params.startDate = today.startOf('week').format('YYYY-MM-DD')
      params.endDate = today.endOf('week').format('YYYY-MM-DD')
    } else if (activeDate.value === 'month') {
      params.startDate = today.startOf('month').format('YYYY-MM-DD')
      params.endDate = today.endOf('month').format('YYYY-MM-DD')
    }

    const response = await productionApi.getProductionReportDetail(params)
    const payload = response.data || {}
    const rows = payload.items || payload.list || []
    reports.value = rows.map(normalizeReport)

    const todayCount = reports.value.filter((report) => dayjs(report.reportDate).isSame(today, 'day')).length
    const weekCount = reports.value.filter((report) => dayjs(report.reportDate).isSame(today, 'week')).length
    statsData.value = [
      { label: '总报工', value: Number(payload.total || reports.value.length) },
      { label: '今日报工', value: todayCount },
      { label: '本周报工', value: weekCount }
    ]
  } catch (error) {
    console.error('加载报工记录失败:', error)
    reports.value = []
    showToast('加载报工记录失败')
  }
}

const getStatusClass = (status) => {
  const statusMap = {
    pending: 'status-pending',
    approved: 'status-approved',
    completed: 'status-approved',
    rejected: 'status-rejected'
  }
  return statusMap[status] || 'status-pending'
}

const getStatusText = (status) => {
  const statusMap = {
    pending: '待审核',
    approved: '已审核',
    completed: '已完成',
    rejected: '已拒绝'
  }
  return statusMap[status] || '未知'
}

watch(activeDate, loadReports)
onMounted(loadReports)
</script>

<style lang="scss" scoped>
.report-history-page {
  min-height: 100vh;
  background: var(--bg-primary);
}

.search-section {
  padding: 10px 16px 6px;
}

.filter-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 16px 10px;
}

.filter-chip {
  flex: 0 0 auto;
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  padding: 6px 14px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 0.8125rem;

  &.active {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
}

.stats-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
  background-color: var(--van-background);
  margin-bottom: 12px;
}
.stat-item {
  text-align: center;
  flex: 1;
}
.stat-value {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--van-text-color);
  margin-bottom: 4px;
}
.stat-label {
  font-size: 0.75rem;
  color: var(--van-text-color-2);
}

.report-list {
  padding: 0 16px 16px;
}

.report-status {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-pending {
  background: var(--module-orange-light);
  color: var(--module-orange);
}

.status-approved {
  background: var(--module-green-light);
  color: var(--module-green);
}

.status-rejected {
  background: var(--module-red-light);
  color: var(--module-red);
}

.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 0.875rem;
}
.info-label {
  color: var(--van-text-color-2);
}
.info-value.success {
  color: var(--module-green);
  font-weight: 600;
}
.info-value.error {
  color: var(--module-red);
  font-weight: 600;
}

.list-card-footer {
  display: flex;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid var(--van-border-color);
  font-size: 0.75rem;
  color: var(--van-text-color-2);
}
</style>
