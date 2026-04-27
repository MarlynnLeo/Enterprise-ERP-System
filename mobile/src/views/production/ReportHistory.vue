<!--
/**
 * ReportHistory.vue - 报工记录
 * @description 报工历史记录页面
 * @date 2026-04-15
 * @version 1.0.0
 */
-->
<template>
  <UniversalListPage
    title="报工记录"
    :show-add="false"
    :show-search="true"
    search-placeholder="搜索任务编号或产品名称"
    v-model:search-value="searchValue"
    :show-filter="true"
    :tags="dateTabs"
    v-model:active-tag="activeDate"
    @back="goBack"
    @filter="handleFilter"
  >
    <!-- 统计栏 -->
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
      <van-empty v-if="filteredReports.length === 0" description="暂无报工记录" />
    </div>
  </UniversalListPage>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import UniversalListPage from '@/components/common/UniversalListPage.vue'
import { showToast } from 'vant'
import { Empty as VanEmpty } from 'vant'
import dayjs from 'dayjs'

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
  { label: '总报工', value: 156 },
  { label: '今日报工', value: 12 },
  { label: '本周报工', value: 45 }
])

// 模拟报工记录数据
const reports = ref([
  {
    id: '1',
    taskCode: 'TASK-2025-001',
    productName: '产品A',
    completedQuantity: 100,
    qualifiedQuantity: 98,
    defectiveQuantity: 2,
    workHours: 8,
    unit: '件',
    operator: '张三',
    reportDate: dayjs().format('YYYY-MM-DD'),
    status: 'approved'
  },
  {
    id: '2',
    taskCode: 'TASK-2025-002',
    productName: '产品B',
    completedQuantity: 50,
    qualifiedQuantity: 50,
    defectiveQuantity: 0,
    workHours: 6,
    unit: '件',
    operator: '李四',
    reportDate: dayjs().subtract(1, 'day').format('YYYY-MM-DD'),
    status: 'pending'
  },
  {
    id: '3',
    taskCode: 'TASK-2025-003',
    productName: '产品C',
    completedQuantity: 80,
    qualifiedQuantity: 75,
    defectiveQuantity: 5,
    workHours: 10,
    unit: '件',
    operator: '王五',
    reportDate: dayjs().subtract(2, 'day').format('YYYY-MM-DD'),
    status: 'approved'
  }
])

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

const handleFilter = () => {
  showToast('筛选功能')
}

const viewReportDetail = (report) => {
  showToast(`查看报工详情: ${report.taskCode}`)
}

const getStatusClass = (status) => {
  const statusMap = {
    pending: 'status-pending',
    approved: 'status-approved',
    rejected: 'status-rejected'
  }
  return statusMap[status] || 'status-pending'
}

const getStatusText = (status) => {
  const statusMap = {
    pending: '待审核',
    approved: '已审核',
    rejected: '已拒绝'
  }
  return statusMap[status] || '未知'
}
</script>

<style lang="scss" scoped>
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
