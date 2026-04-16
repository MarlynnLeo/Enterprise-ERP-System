<!--
/**
 * ReportHistory.vue - 报工记录
 * @description 报工历史记录页面 - Glassmorphism 风格
 * @date 2025-12-29
 * @version 1.0.0
 */
-->
<template>
  <GlassListPage
    title="报工记录"
    :show-back="true"
    :show-add="false"
    :show-search="true"
    search-placeholder="搜索任务编号或产品名称"
    v-model:search-value="searchValue"
    :show-filter="true"
    :tags="dateTabs"
    v-model:active-tag="activeDate"
    :stats="statsData"
    @back="goBack"
    @filter="handleFilter"
  >
    <!-- 报工记录列表 -->
    <div class="report-list">
      <p class="list-title">报工记录</p>
      
      <!-- 列表项 -->
      <div
        v-for="report in filteredReports"
        :key="report.id"
        class="report-item"
        @click="viewReportDetail(report)"
      >
        <GlassCard clickable>
          <!-- 报工头部 -->
          <div class="report-header">
            <span class="report-date">{{ report.reportDate }}</span>
            <span class="report-status" :class="getStatusClass(report.status)">
              {{ getStatusText(report.status) }}
            </span>
          </div>

          <!-- 任务信息 -->
          <h3 class="report-title">{{ report.taskCode }} - {{ report.productName }}</h3>

          <!-- 报工详情 -->
          <div class="report-details">
            <div class="detail-item">
              <span class="detail-label">完成数量</span>
              <span class="detail-value">{{ report.completedQuantity }} {{ report.unit }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">合格数量</span>
              <span class="detail-value success">{{ report.qualifiedQuantity }} {{ report.unit }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">不良数量</span>
              <span class="detail-value error">{{ report.defectiveQuantity }} {{ report.unit }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">工时</span>
              <span class="detail-value">{{ report.workHours }} 小时</span>
            </div>
          </div>

          <!-- 操作人员 -->
          <div class="report-footer">
            <span class="operator">操作人: {{ report.operator }}</span>
          </div>
        </GlassCard>
      </div>

      <!-- 空状态 -->
      <div v-if="filteredReports.length === 0" class="empty-state">
        <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p class="empty-text">暂无报工记录</p>
      </div>
    </div>
  </GlassListPage>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import GlassListPage from '@/components/glass/GlassListPage.vue'
import GlassCard from '@/components/glass/GlassCard.vue'
import { showToast } from 'vant'
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
  { label: '总报工', value: 156, icon: 'document-text', iconClass: 'bg-blue' },
  { label: '今日报工', value: 12, icon: 'document-text', iconClass: 'bg-green' },
  { label: '本周报工', value: 45, icon: 'document-text', iconClass: 'bg-purple' }
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
.report-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.list-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: white;
  margin-bottom: 0.5rem;
}

.report-item {
  cursor: pointer;
}

.report-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.report-date {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.report-status {
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-weight: 600;
}

.status-pending {
  background: rgba(234, 179, 8, 0.2);
  color: rgb(253, 224, 71);
}

.status-approved {
  background: rgba(34, 197, 94, 0.2);
  color: rgb(134, 239, 172);
}

.status-rejected {
  background: rgba(239, 68, 68, 0.2);
  color: rgb(252, 165, 165);
}

.report-title {
  font-size: 1rem;
  font-weight: 600;
  color: white;
  margin-bottom: 0.75rem;
}

.report-details {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.detail-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.detail-value {
  font-size: 0.875rem;
  font-weight: 600;
  color: white;
}

.detail-value.success {
  color: rgb(134, 239, 172);
}

.detail-value.error {
  color: rgb(252, 165, 165);
}

.report-footer {
  padding-top: 0.75rem;
  border-top: 1px solid var(--van-border-color);
}

.operator {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
}

.empty-icon {
  width: 6rem;
  height: 6rem;
  color: rgb(100, 116, 139);
  margin-bottom: 1rem;
}

.empty-text {
  font-size: 0.875rem;
  color: var(--text-secondary);
}
</style>

