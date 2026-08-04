<!--
  应收/应付结算明细看板（可嵌入或独立页）
  - 顶部数量+金额卡片（可点击筛选）
  - 筛选条件 + 明细表
-->
<template>
  <div class="settlement-dashboard" :class="{ 'is-standalone': standalone }" v-loading="loading">
    <div v-if="!standalone" class="dashboard-header">
      <div class="dashboard-title">
        <span class="title-text">{{ title }}</span>
        <span class="title-sub" v-if="asOf">截至 {{ asOf }}</span>
      </div>
      <div class="dashboard-actions">
        <el-button size="small" :icon="Refresh" @click="reload" :loading="loading">刷新</el-button>
      </div>
    </div>

    <el-row :gutter="12" class="stats-row">
      <el-col :xs="12" :sm="8" :md="4" v-for="card in cards" :key="card.key">
        <el-card
          class="stat-card"
          shadow="hover"
          :class="{ active: settlementKey === card.key }"
          @click="selectKey(card.key)"
        >
          <div class="stat-content">
            <div class="stat-info">
              <div class="stat-label">{{ card.label }}</div>
              <div class="stat-value" :class="card.tone">{{ card.count }}</div>
              <div class="stat-amount">{{ formatCurrency(card.amount) }}</div>
              <div class="stat-hint">{{ card.hint }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <FinanceQueryCard
      v-if="standalone"
      :model="localFilters"
      :loading="loading"
      @search="handleSearch"
      @reset="handleReset"
    >
      <template #basic>
        <el-form-item :label="partyLabel">
          <el-input
            v-model="localFilters.partyName"
            :placeholder="`输入${partyLabel}名称`"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="开票日期">
          <el-date-picker
            v-model="localFilters.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <el-card class="data-card detail-card" shadow="never">
      <template #header>
        <div class="detail-header">
          <div class="detail-header-left">
            <span>{{ detailTitle }}</span>
            <span v-if="asOf" class="title-sub as-of">截至 {{ asOf }}</span>
          </div>
          <div class="detail-header-right">
            <el-tag size="small" type="info">共 {{ details.length }} 条（最多 {{ detailLimit }}）</el-tag>
            <el-button size="small" :icon="Refresh" @click="reload" :loading="loading">刷新</el-button>
          </div>
        </div>
      </template>

      <el-table
        :data="details"
        border
        stripe
        class="w-full"
        :max-height="standalone ? undefined : 360"
      >
        <template #empty>
          <el-empty description="当前筛选下暂无明细" :image-size="64" />
        </template>
        <el-table-column prop="invoiceNumber" label="发票编号" min-width="150" fixed="left" />
        <el-table-column
          v-if="side === 'ap'"
          prop="supplierInvoiceNumber"
          label="供应商票号"
          min-width="130"
          show-overflow-tooltip
        />
        <el-table-column prop="partyName" :label="partyLabel" min-width="160" show-overflow-tooltip />
        <el-table-column prop="invoiceDate" label="开票日期" width="110" />
        <el-table-column prop="dueDate" label="到期日期" width="110" />
        <el-table-column prop="totalAmount" label="发票金额" width="120" align="right">
          <template #default="{ row }">{{ formatCurrency(row.totalAmount) }}</template>
        </el-table-column>
        <el-table-column prop="paidAmount" :label="paidLabel" width="120" align="right">
          <template #default="{ row }">{{ formatCurrency(row.paidAmount) }}</template>
        </el-table-column>
        <el-table-column prop="balanceAmount" :label="balanceLabel" width="120" align="right">
          <template #default="{ row }">
            <span :class="{ 'text-danger': row.balanceAmount > 0 }">
              {{ formatCurrency(row.balanceAmount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="结算状态" width="100">
          <template #default="{ row }">
            <el-tag :type="bucketTagType(row.settlementBucket)" size="small">
              {{ bucketLabel(row.settlementBucket) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="单据状态" width="100" />
        <el-table-column label="逾期天数" width="100" align="center">
          <template #default="{ row }">
            <span v-if="row.overdueDays != null && row.overdueDays > 0" class="text-danger">
              {{ row.overdueDays }}
            </span>
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch, onMounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { formatCurrency } from '@/utils/format'
import { financeApi } from '@/api/finance'

const props = defineProps({
  /** ar | ap */
  side: {
    type: String,
    required: true,
    validator: (v) => ['ar', 'ap'].includes(v),
  },
  /** 与列表搜索联动的可选过滤（嵌入模式） */
  filters: {
    type: Object,
    default: () => ({}),
  },
  /** 独立页面模式：自带筛选、更大明细表 */
  standalone: {
    type: Boolean,
    default: false,
  },
  /** 默认结算维度 */
  defaultKey: {
    type: String,
    default: 'open',
  },
  /** 明细条数上限 */
  limit: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits(['filter-status'])

const loading = ref(false)
const asOf = ref('')
const settlementKey = ref(props.defaultKey || 'open')
const summary = ref({
  totalCount: 0,
  totalAmount: 0,
  paidAmount: 0,
  balanceAmount: 0,
  paidCount: 0,
  paidTotalAmount: 0,
  partialCount: 0,
  partialBalance: 0,
  unpaidCount: 0,
  unpaidBalance: 0,
  overdueCount: 0,
  overdueBalance: 0,
  openCount: 0,
  openBalance: 0,
})
const details = ref([])

const localFilters = reactive({
  partyName: '',
  dateRange: [],
})

const isAR = computed(() => props.side === 'ar')
const title = computed(() => (isAR.value ? '收款结算看板' : '付款结算看板'))
const partyLabel = computed(() => (isAR.value ? '客户' : '供应商'))
const paidLabel = computed(() => (isAR.value ? '已收金额' : '已付金额'))
const balanceLabel = computed(() => (isAR.value ? '未收金额' : '未付金额'))
const detailLimit = computed(() => {
  if (props.limit > 0) return props.limit
  return props.standalone ? 200 : 50
})

const cards = computed(() => {
  const s = summary.value
  const unpaidVerb = isAR.value ? '未收款' : '未付款'
  const partialVerb = isAR.value ? '部分收款' : '部分付款'
  const paidVerb = isAR.value ? '已收清' : '已付清'
  return [
    {
      key: 'open',
      label: '待结算',
      count: s.openCount,
      amount: s.openBalance,
      hint: '余额>0 合计',
      tone: 'warning',
    },
    {
      key: 'unpaid',
      label: unpaidVerb,
      count: s.unpaidCount,
      amount: s.unpaidBalance,
      hint: '尚未收/付',
      tone: 'danger',
    },
    {
      key: 'partial',
      label: partialVerb,
      count: s.partialCount,
      amount: s.partialBalance,
      hint: '部分核销',
      tone: 'warning',
    },
    {
      key: 'overdue',
      label: '已逾期',
      count: s.overdueCount,
      amount: s.overdueBalance,
      hint: '过期未结清',
      tone: 'danger',
    },
    {
      key: 'paid',
      label: paidVerb,
      count: s.paidCount,
      amount: s.paidTotalAmount,
      hint: '已结清张数',
      tone: 'success',
    },
    {
      key: 'all',
      label: '全部有效',
      count: s.totalCount,
      amount: s.totalAmount,
      hint: '不含草稿/取消',
      tone: '',
    },
  ]
})

const detailTitle = computed(() => {
  const map = {
    open: '待结算明细',
    unpaid: isAR.value ? '未收款明细' : '未付款明细',
    partial: isAR.value ? '部分收款明细' : '部分付款明细',
    overdue: '逾期明细',
    paid: isAR.value ? '已收清明细' : '已付清明细',
    all: '全部有效发票',
  }
  return map[settlementKey.value] || '明细'
})

function bucketLabel(bucket) {
  const map = {
    paid: isAR.value ? '已收清' : '已付清',
    partial: isAR.value ? '部分收' : '部分付',
    unpaid: isAR.value ? '未收款' : '未付款',
    overdue: '已逾期',
  }
  return map[bucket] || bucket || '—'
}

function bucketTagType(bucket) {
  const map = {
    paid: 'success',
    partial: 'warning',
    unpaid: 'info',
    overdue: 'danger',
  }
  return map[bucket] || 'info'
}

function selectKey(key) {
  if (settlementKey.value === key) return
  settlementKey.value = key
  const statusMap = {
    unpaid: '已确认',
    partial: '部分付款',
    paid: '已付款',
    overdue: '已逾期',
  }
  if (statusMap[key]) {
    emit('filter-status', statusMap[key])
  }
  load()
}

function resolveFilterParams() {
  if (props.standalone) {
    return {
      partyName: localFilters.partyName || '',
      startDate: localFilters.dateRange?.[0] || '',
      endDate: localFilters.dateRange?.[1] || '',
    }
  }
  return {
    partyName: props.filters?.customerName || props.filters?.supplierName || props.filters?.partyName || '',
    startDate: props.filters?.startDate || '',
    endDate: props.filters?.endDate || '',
  }
}

async function load() {
  loading.value = true
  try {
    const f = resolveFilterParams()
    const params = {
      settlementKey: settlementKey.value,
      limit: detailLimit.value,
      startDate: f.startDate || undefined,
      endDate: f.endDate || undefined,
    }
    if (isAR.value && f.partyName) params.customerName = f.partyName
    if (!isAR.value && f.partyName) params.supplierName = f.partyName

    const api = isAR.value
      ? financeApi.getARSettlementDashboard
      : financeApi.getAPSettlementDashboard
    const res = await api(params)
    const data = res?.data || res || {}
    asOf.value = data.asOf || ''
    summary.value = { ...summary.value, ...(data.summary || {}) }
    details.value = Array.isArray(data.details) ? data.details : []
  } catch (error) {
    ElMessage.error(error?.message || '加载结算看板失败')
    details.value = []
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  load()
}

function handleReset() {
  localFilters.partyName = ''
  localFilters.dateRange = []
  load()
}

function reload() {
  load()
}

defineExpose({ reload, load })

watch(
  () => props.filters,
  () => {
    if (!props.standalone) load()
  },
  { deep: true }
)

onMounted(() => {
  load()
})
</script>

<style scoped>
.settlement-dashboard {
  margin-bottom: 16px;
}

.settlement-dashboard.is-standalone {
  margin-bottom: 0;
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.dashboard-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.title-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.title-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.as-of {
  margin-left: 8px;
  font-weight: 400;
}

.stats-row {
  margin-bottom: 12px;
}

.stat-card {
  cursor: pointer;
  margin-bottom: 12px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  border: 1px solid transparent;
}

.stat-card:hover {
  border-color: var(--el-color-primary-light-5);
}

.stat-card.active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary-light-7);
}

.stat-content {
  min-height: 72px;
}

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--el-text-color-primary);
}

.stat-value.success {
  color: var(--el-color-success);
}

.stat-value.warning {
  color: var(--el-color-warning);
}

.stat-value.danger {
  color: var(--el-color-danger);
}

.stat-amount {
  margin-top: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.stat-hint {
  margin-top: 2px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.detail-card :deep(.el-card__header) {
  padding: 10px 16px;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-weight: 600;
}

.detail-header-left,
.detail-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.text-danger {
  color: var(--el-color-danger);
  font-weight: 600;
}

.text-muted {
  color: var(--el-text-color-placeholder);
}
</style>
