<template>
  <div class="app-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>期末结转</h2>
          <p class="subtitle">执行损益结转、关账前校验和结转历史追踪</p>
        </div>
      </div>
    </el-card>

    <el-card class="box-card mb-4">
      <el-steps :active="activeStep" finish-status="success" simple class="closing-steps">
        <el-step title="选择期间" />
        <el-step title="结转预览" />
        <el-step title="执行结转" />
      </el-steps>

      <div v-if="activeStep === 0" class="step-content">
        <el-form :inline="true" class="search-form">
          <el-form-item label="待结转期间">
            <el-select v-model="selectedPeriodId" placeholder="选择会计期间" filterable style="width: 240px">
              <el-option
                v-for="period in openPeriods"
                :key="period.id"
                :label="period.period_name"
                :value="period.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :disabled="!selectedPeriodId" :loading="previewLoading" @click="fetchPreview">
              下一步
            </el-button>
          </el-form-item>
        </el-form>

        <el-alert
          title="结转说明"
          type="info"
          :closable="false"
          class="mt-4"
          description="系统会先校验未过账凭证、前序期间、试算平衡与本年利润科目配置；校验通过后才允许生成损益结转凭证并关闭当前会计期间。"
        />
      </div>

      <div v-if="activeStep === 1" class="step-content">
        <template v-if="previewData">
          <el-alert
            v-if="!previewData.canClose"
            title="无法关账：预检查未通过"
            type="error"
            :closable="false"
            show-icon
            class="mb-4"
          >
            请先处理未通过的检查项，再重新预览。
          </el-alert>

          <el-alert
            v-if="previewData.hasExistingClosing"
            title="该期间已存在损益结转凭证"
            type="warning"
            :closable="false"
            show-icon
            class="mb-4"
            description="为避免重复结转，系统会阻止重复生成结转凭证。请先核对历史凭证或重新打开期间后处理。"
          />

          <el-table v-if="previewData.checks?.length" :data="previewData.checks" border class="mb-4">
            <el-table-column label="检查项" prop="name" width="220" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.passed ? 'success' : 'danger'">
                  {{ row.passed ? '通过' : '未通过' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="说明">
              <template #default="{ row }">
                {{ row.message || '正常' }}
              </template>
            </el-table-column>
          </el-table>

          <el-descriptions title="结转摘要" :column="3" border class="mb-4">
            <el-descriptions-item label="会计期间">
              {{ previewData.period?.period_name || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="总收入">
              {{ formatMoney(previewData.summary?.totalIncome) }}
            </el-descriptions-item>
            <el-descriptions-item label="总费用">
              {{ formatMoney(previewData.summary?.totalExpense) }}
            </el-descriptions-item>
            <el-descriptions-item label="本期净利润">
              <span :class="toNumber(previewData.summary?.netProfit) >= 0 ? 'text-success' : 'text-danger'">
                {{ formatMoney(previewData.summary?.netProfit) }}
              </span>
            </el-descriptions-item>
          </el-descriptions>

          <el-table :data="previewData.closingItems || []" border style="width: 100%" height="400">
            <el-table-column prop="account_code" label="科目编码" width="120" />
            <el-table-column prop="account_name" label="科目名称" min-width="200" />
            <el-table-column prop="account_type" label="类型" width="100" />
            <el-table-column prop="total_debit" label="借方发生">
              <template #default="{ row }">
                {{ formatMoney(row.total_debit) }}
              </template>
            </el-table-column>
            <el-table-column prop="total_credit" label="贷方发生">
              <template #default="{ row }">
                {{ formatMoney(row.total_credit) }}
              </template>
            </el-table-column>
            <el-table-column prop="closing_amount" label="结转金额">
              <template #default="{ row }">
                {{ formatMoney(row.closing_amount) }}
              </template>
            </el-table-column>
            <el-table-column prop="closing_direction" label="结转方向" width="100">
              <template #default="{ row }">
                <el-tag :type="row.closing_direction === '借方' ? 'success' : 'warning'">
                  {{ row.closing_direction || '-' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>

          <div class="mt-4 actions-row">
            <el-button @click="activeStep = 0">上一步</el-button>
            <el-button
              v-permission="'finance:closing:execute'"
              type="primary"
              :disabled="!previewData.canClose"
              :loading="closingLoading"
              @click="executeClosing"
            >
              确认并执行结转
            </el-button>
          </div>
        </template>
      </div>

      <div v-if="activeStep >= 2" class="step-content text-center py-8">
        <el-result
          icon="success"
          title="期末结转完成"
          sub-title="损益科目已结转至本年利润，会计期间已关闭"
        >
          <template #extra>
            <el-button type="primary" @click="resetWizard">返回</el-button>
            <el-button @click="scrollToHistory">查看历史记录</el-button>
          </template>
        </el-result>
      </div>
    </el-card>

    <el-card ref="historyCardRef" class="box-card">
      <template #header>
        <div class="card-header">
          <span>结转历史记录</span>
        </div>
      </template>
      <div class="filter-container mb-4">
        <el-select
          v-model="historyPeriodId"
          placeholder="选择会计期间"
          clearable
          filterable
          style="width: 240px"
          @change="fetchHistory"
        >
          <el-option
            v-for="item in periods"
            :key="item.id"
            :label="item.period_name"
            :value="item.id"
          />
        </el-select>
      </div>
      <el-table :data="historyList" border style="width: 100%">
        <template #empty>
          <el-empty description="暂无结转历史" />
        </template>
        <el-table-column prop="entry_number" label="凭证编号" width="180" />
        <el-table-column prop="entry_date" label="结转日期" width="120">
          <template #default="{ row }">
            {{ formatDate(row.entry_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="description" label="摘要" />
        <el-table-column prop="operator_name" label="操作人" width="120" />
        <el-table-column prop="created_at" label="操作时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.created_at) }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/services/axiosInstance'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format'
import { parseDataObject } from '@/utils/responseParser'
import { useRoute } from 'vue-router'

const activeStep = ref(0)
const periods = ref([])
const selectedPeriodId = ref('')
const previewData = ref(null)
const previewLoading = ref(false)
const closingLoading = ref(false)
const historyList = ref([])
const historyPeriodId = ref('')
const historyCardRef = ref(null)
const route = useRoute()

const openPeriods = computed(() => periods.value.filter(period => !period.is_closed))
const toNumber = value => Number.parseFloat(value) || 0
const formatMoney = value => formatCurrency(value, '¥')

const selectDefaultOpenPeriod = () => {
  const now = new Date()
  const currentPeriodKeyword = `${now.getFullYear()}年${now.getMonth() + 1}月`

  return openPeriods.value.find(period => period.period_name?.includes(currentPeriodKeyword))
    || openPeriods.value[0]
}

const fetchPeriods = async () => {
  try {
    const res = await api.get('/finance/periods')
    const data = parseDataObject(res, { enableLog: false }) || {}
    periods.value = data.periods || data.list || []

    const requestedPeriodId = Number.parseInt(route.query.periodId, 10)
    const requestedPeriod = periods.value.find(period => Number(period.id) === requestedPeriodId)
    const defaultPeriod = requestedPeriod || selectDefaultOpenPeriod()
    selectedPeriodId.value = defaultPeriod?.id || ''

    if (periods.value.length > 0) {
      historyPeriodId.value = selectedPeriodId.value || periods.value[0].id
      await fetchHistory()
    }

    if (requestedPeriod && !requestedPeriod.is_closed) {
      await fetchPreview()
    }
  } catch (error) {
    console.error('获取会计期间失败:', error)
    ElMessage.error(error.message || '获取会计期间失败')
  }
}

const fetchPreview = async () => {
  if (!selectedPeriodId.value) return

  previewLoading.value = true
  try {
    const res = await api.get(`/finance/gl/closing/preview/${selectedPeriodId.value}`)
    previewData.value = parseDataObject(res, { enableLog: false }) || {}
    activeStep.value = 1
  } catch (error) {
    console.error('获取结转预览失败:', error)
    ElMessage.error(error.message || '获取结转预览失败')
  } finally {
    previewLoading.value = false
  }
}

const executeClosing = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要执行期末结转吗？该操作会生成结转凭证并关闭当前会计期间。',
      '确认结转',
      {
        confirmButtonText: '确定执行',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    closingLoading.value = true
    const res = await api.post(`/finance/gl/closing/execute/${selectedPeriodId.value}`)
    ElMessage.success(res._message || '期末结转执行成功')
    activeStep.value = 3

    await fetchPeriods()
    await fetchHistory()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('结转失败:', error)
      ElMessage.error(error.message || '结转失败')
    }
  } finally {
    closingLoading.value = false
  }
}

const fetchHistory = async () => {
  if (!historyPeriodId.value) {
    historyList.value = []
    return
  }

  try {
    const res = await api.get(`/finance/gl/closing/history/${historyPeriodId.value}`)
    const data = parseDataObject(res, { enableLog: false }) || {}
    historyList.value = data.entries || data.list || []
  } catch (error) {
    console.error('获取结转历史失败:', error)
  }
}

const resetWizard = () => {
  activeStep.value = 0
  previewData.value = null
  selectedPeriodId.value = selectDefaultOpenPeriod()?.id || ''
}

const scrollToHistory = () => {
  historyCardRef.value?.$el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(() => {
  fetchPeriods()
})
</script>

<style scoped>
.app-container {
  padding: 20px;
}

.header-card,
.mb-4 {
  margin-bottom: 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-section h2 {
  margin: 0 0 5px;
  font-size: 20px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.closing-steps {
  margin-bottom: 20px;
}

.mt-4 {
  margin-top: 16px;
}

.py-8 {
  padding-top: 2rem;
  padding-bottom: 2rem;
}

.text-center {
  text-align: center;
}

.actions-row {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.text-success {
  color: var(--color-success);
}

.text-danger {
  color: var(--color-danger);
}
</style>
