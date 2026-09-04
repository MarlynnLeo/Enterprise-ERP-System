<template>
  <div class="module-page period-closing-page">
    <PageHeader title="期末结转" subtitle="执行损益结转、关账前校验和结转历史追踪" />

    <!-- 结转向导 -->
    <el-card class="data-card wizard-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>结转向导</span>
          <el-tag v-if="selectedPeriodLabel" size="small" type="info" effect="plain">
            {{ selectedPeriodLabel }}
          </el-tag>
        </div>
      </template>

      <el-steps :active="activeStep" finish-status="success" simple class="closing-steps">
        <el-step title="选择期间" />
        <el-step title="结转预览" />
        <el-step title="执行结转" />
      </el-steps>

      <!-- Step 0: 选择期间 -->
      <div v-if="activeStep === 0" class="step-content">
        <el-form :inline="true" class="search-form step-form">
          <el-form-item label="待结转期间">
            <el-select
              v-model="selectedPeriodId"
              placeholder="选择会计期间"
              filterable
              class="form-control-240"
            >
              <el-option
                v-for="period in openPeriods"
                :key="period.id"
                :label="periodLabel(period)"
                :value="period.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary"
              :disabled="!selectedPeriodId"
              :loading="previewLoading"
              @click="fetchPreview"
            >
              下一步
            </el-button>
          </el-form-item>
        </el-form>

        <el-alert
          title="结转说明"
          type="info"
          :closable="false"
          show-icon
          description="系统会先校验未过账凭证、前序期间、试算平衡与本年利润科目配置；校验通过后才允许生成损益结转凭证并关闭当前会计期间。"
        />
      </div>

      <!-- Step 1: 预览 -->
      <div v-if="activeStep === 1" class="step-content">
        <template v-if="previewData">
          <el-alert
            v-if="!previewData.canClose"
            title="无法关账：预检查未通过"
            type="error"
            :closable="false"
            show-icon
            class="step-block"
          >
            请先处理未通过的检查项，再重新预览。
          </el-alert>

          <el-alert
            v-if="previewData.hasExistingClosing"
            title="该期间已存在损益结转凭证"
            type="warning"
            :closable="false"
            show-icon
            class="step-block"
            description="为避免重复结转，系统会阻止重复生成结转凭证。请先核对历史凭证或重新打开期间后处理。"
          />

          <div v-if="previewData.checks?.length" class="step-block">
            <div class="section-title">关账前检查</div>
            <el-table :data="previewData.checks" border class="w-full">
              <el-table-column label="检查项" prop="name" width="220" />
              <el-table-column label="状态" width="100">
                <template #default="{ row }">
                  <el-tag :type="row.passed ? 'success' : 'danger'" size="small">
                    {{ row.passed ? '通过' : '未通过' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="说明" min-width="200">
                <template #default="{ row }">
                  {{ row.message || '正常' }}
                </template>
              </el-table-column>
              <el-table-column
                label="处理"
                min-width="140"
                align="left"
                header-align="left"
                class-name="operation-column"
                header-class-name="operation-column-header"
              >
                <template #default="{ row }">
                  <div class="table-actions">
                    <el-button
                      v-if="row.key === 'unposted_entries' && !row.passed"
                      v-permission="'finance:entries:view'"
                      size="small"
                      type="primary"
                      @click="openUnpostedDialog"
                    >
                      查看并过账
                    </el-button>
                    <el-button
                      v-if="row.key === 'bank_reconciliation_closed' && !row.passed"
                      v-permission="'finance:cash:reconcile'"
                      size="small"
                      type="primary"
                      @click="openReconciliationDialog"
                    >
                      查看并对账
                    </el-button>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div class="step-block">
            <div class="section-title">结转摘要</div>
            <el-descriptions :column="3" border>
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
                <span
                  :class="
                    toNumber(previewData.summary?.netProfit) >= 0 ? 'text-success' : 'text-danger'
                  "
                >
                  {{ formatMoney(previewData.summary?.netProfit) }}
                </span>
              </el-descriptions-item>
            </el-descriptions>
          </div>

          <div class="step-block">
            <div class="section-title">结转明细</div>
            <el-table :data="previewData.closingItems || []" border class="w-full" max-height="400">
              <el-table-column prop="accountCode" label="科目编码" width="120" />
              <el-table-column prop="accountName" label="科目名称" min-width="200" />
              <el-table-column prop="accountType" label="类型" width="100" />
              <el-table-column prop="totalDebit" label="借方发生" width="130" align="right">
                <template #default="{ row }">
                  {{ formatMoney(row.totalDebit) }}
                </template>
              </el-table-column>
              <el-table-column prop="totalCredit" label="贷方发生" width="130" align="right">
                <template #default="{ row }">
                  {{ formatMoney(row.totalCredit) }}
                </template>
              </el-table-column>
              <el-table-column prop="closingAmount" label="结转金额" width="130" align="right">
                <template #default="{ row }">
                  {{ formatMoney(row.closingAmount) }}
                </template>
              </el-table-column>
              <el-table-column prop="closingDirection" label="结转方向" width="100">
                <template #default="{ row }">
                  <el-tag
                    :type="row.closingDirection === '借方' ? 'success' : 'warning'"
                    size="small"
                  >
                    {{ row.closingDirection || '-' }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div class="actions-row">
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

      <!-- Step 2+: 完成 -->
      <div v-if="activeStep >= 2" class="step-content step-result">
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

    <!-- 结转历史 -->
    <el-card ref="historyCardRef" class="data-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>结转历史记录</span>
          <el-select
            v-model="historyPeriodId"
            placeholder="选择会计期间"
            clearable
            filterable
            class="form-control-240"
            @change="fetchHistory"
          >
            <el-option
              v-for="item in periods"
              :key="item.id"
              :label="item.periodName"
              :value="item.id"
            />
          </el-select>
        </div>
      </template>
      <el-table :data="historyList" border class="w-full">
        <template #empty>
          <EmptyState description="暂无结转历史" />
        </template>
        <el-table-column prop="entryNumber" label="凭证编号" width="180" />
        <el-table-column prop="entryDate" label="结转日期" width="120">
          <template #default="{ row }">
            {{ formatDate(row.entryDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="description" label="摘要" min-width="200" />
        <el-table-column prop="operatorName" label="操作人" width="120" />
        <el-table-column prop="createdAt" label="操作时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <AppDialog
      v-model="reconciliationDialogVisible"
      title="本期未对账银行流水"
      mode="form"
      wide
      custom-class="dialog-max-vw"
    >
      <div class="dialog-toolbar">
        <span class="text-secondary">
          共 {{ unreconciledTransactions.length }} 笔未对账流水<template v-if="manualReconciledTransactions.length > 0">，{{ manualReconciledTransactions.length }} 笔缺少匹配证据</template>。
        </span>
        <el-button
          v-permission="'finance:cash:reconcile'"
          type="primary"
          @click="goToBankReconciliation"
        >
          前往银行对账
        </el-button>
      </div>

      <el-table
        v-loading="reconciliationLoading"
        :data="allUnreconciledTransactions"
        border
        height="460"
        class="w-full"
      >
        <template #empty>
          <EmptyState description="暂无未对账银行流水" />
        </template>
        <el-table-column prop="transactionDate" label="交易日期" width="110">
          <template #default="{ row }">
            {{ formatDate(row.transactionDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="accountName" label="银行账户" width="140" show-overflow-tooltip />
        <el-table-column prop="transactionType" label="类型" width="80" />
        <el-table-column prop="amount" label="金额" width="120" align="right">
          <template #default="{ row }">
            {{ formatMoney(row.amount) }}
          </template>
        </el-table-column>
        <el-table-column prop="relatedParty" label="交易对方" min-width="120" show-overflow-tooltip />
        <el-table-column prop="description" label="描述" min-width="160" show-overflow-tooltip />
        <el-table-column prop="referenceNumber" label="参考号" width="120" show-overflow-tooltip />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag v-if="row._type === 'unreconciled'" type="warning">未对账</el-tag>
            <el-tag v-else type="info">缺少匹配</el-tag>
          </template>
        </el-table-column>
      </el-table>
        </AppDialog>

    <AppDialog
      v-model="unpostedDialogVisible"
      title="本期未过账凭证"
      mode="form"
      wide
      custom-class="dialog-max-vw"
    >
      <div class="dialog-toolbar">
        <span class="text-secondary">
          共 {{ unpostedEntries.length }} 张未过账凭证。批量过账前请确认凭证借贷平衡、日期和期间无误。
        </span>
        <el-button
          v-permission="'finance:entries:approve'"
          type="primary"
          :disabled="unpostedEntries.length === 0"
          :loading="batchPosting"
          @click="postAllUnpostedEntries"
        >
          一键过账
        </el-button>
      </div>

      <el-table
        v-loading="unpostedLoading"
        :data="unpostedEntries"
        border
        height="460"
        class="w-full"
      >
        <template #empty>
          <EmptyState description="暂无未过账凭证" />
        </template>
        <el-table-column prop="entryNumber" label="凭证编号" width="170" show-overflow-tooltip />
        <el-table-column prop="entryDate" label="凭证日期" width="110">
          <template #default="{ row }">
            {{ formatDate(row.entryDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="documentType" label="单据类型" width="120" show-overflow-tooltip>
          <template #default="{ row }">
            {{ formatDocumentType(row.documentType) }}
          </template>
        </el-table-column>
        <el-table-column prop="documentNumber" label="单据编号" min-width="150" show-overflow-tooltip />
        <el-table-column prop="description" label="摘要" min-width="180" show-overflow-tooltip />
        <el-table-column prop="totalDebit" label="借方金额" width="120" align="right">
          <template #default="{ row }">
            {{ formatMoney(row.totalDebit) }}
          </template>
        </el-table-column>
        <el-table-column prop="totalCredit" label="贷方金额" width="120" align="right">
          <template #default="{ row }">
            {{ formatMoney(row.totalCredit) }}
          </template>
        </el-table-column>
        <el-table-column label="过账状态" width="180">
          <template #default="{ row }">
            <el-tooltip
              v-if="!row.postingReady"
              :content="row.postingIssue || '凭证暂不满足过账条件'"
              placement="top"
            >
              <el-tag :type="row.dateValid ? 'danger' : 'warning'">
                {{ row.dateValid ? '需处理凭证' : '需修正日期' }}
              </el-tag>
            </el-tooltip>
            <el-tag v-else type="success">正常</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="230" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button size="small" @click="openEntryDetail(row)">明细</el-button>
              <el-button
                v-if="!row.dateValid"
                v-permission="'finance:entries:update'"
                size="small"
                type="warning"
                @click="openDateFixDialog(row)"
              >
                修正日期
              </el-button>
              <el-button
                v-permission="'finance:entries:approve'"
                size="small"
                type="success"
                :loading="postingEntryId === row.id"
                @click="postSingleEntry(row)"
              >
                过账
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
        </AppDialog>

    <AppDialog
      v-model="dateFixDialogVisible"
      :title="dateFixEntry ? `修正日期：${dateFixEntry.entry_number}` : '修正日期'"
      mode="form"
      width="520px"
      custom-class="dialog-max-vw"
    >
      <el-alert
        v-if="dateFixEntry"
        type="warning"
        :closable="false"
        class="mb-4"
        :title="`所属期间：${dateFixEntry.period_name || '-'}（${formatDate(dateFixEntry.period_start_date)} 至 ${formatDate(dateFixEntry.period_end_date)}）`"
        description="凭证日期和过账日期都必须落在所属会计期间内，否则不能过账，也不能关账。"
      />
      <el-form label-width="96px">
        <el-form-item label="凭证日期">
          <el-date-picker
            v-model="dateFixForm.entry_date"
            type="date"
            value-format="YYYY-MM-DD"
            class="w-full"
          />
        </el-form-item>
        <el-form-item label="过账日期">
          <el-date-picker
            v-model="dateFixForm.posting_date"
            type="date"
            value-format="YYYY-MM-DD"
            class="w-full"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dateFixDialogVisible = false">取消</el-button>
        <el-button @click="fillPeriodEndDate">使用期间末日</el-button>
        <el-button @click="syncPostingDate">同步凭证日期</el-button>
        <el-button
          type="primary"
          :loading="dateFixSaving"
          @click="saveEntryDates"
        >
          {{ dateFixPrimaryText }}
        </el-button>
      </template>
        </AppDialog>

    <AppDialog
      v-model="entryDetailVisible"
      :title="currentEntry ? `凭证明细：${currentEntry.entry_number}` : '凭证明细'"
      mode="view"
      content-width="wide"
    >
      <el-table :data="currentEntryItems" border class="w-full">
        <el-table-column prop="accountCode" label="科目编码" width="120" />
        <el-table-column prop="accountName" label="科目名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="description" label="摘要" min-width="180" show-overflow-tooltip />
        <el-table-column prop="accountIssue" label="状态" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.accountIssue" type="danger">{{ row.accountIssue }}</el-tag>
            <el-tag v-else type="success">正常</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="debitAmount" label="借方" width="120" align="right">
          <template #default="{ row }">
            {{ formatMoney(row.debitAmount) }}
          </template>
        </el-table-column>
        <el-table-column prop="creditAmount" label="贷方" width="120" align="right">
          <template #default="{ row }">
            {{ formatMoney(row.creditAmount) }}
          </template>
        </el-table-column>
      </el-table>
    </AppDialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import { financeApi } from '@/api'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format'
import { periodLabel, selectDefaultOpenPeriod } from '@/utils/helpers/periodUtils'
import { parseDataObject } from '@/utils/responseParser'
import { useRoute, useRouter } from 'vue-router'

// 英文 document_type -> 中文显示标签
const DOCUMENT_TYPE_LABELS = {
  receipt: '收据', invoice: '发票', payment: '付款单', collection: '收款单',
  transfer: '转账单', adjustment: '调整单', profit_loss_transfer: '损益结转',
  year_end_transfer: '年度结转', sales_outbound: '销售出库',
  production_cost_transfer: '生产成本结转', inventory_reclass: '库存重分类',
}
const formatDocumentType = (type) => DOCUMENT_TYPE_LABELS[type] || type

const activeStep = ref(0)
const periods = ref([])
const selectedPeriodId = ref('')
const previewData = ref(null)
const previewLoading = ref(false)
const closingLoading = ref(false)
const historyList = ref([])
const historyPeriodId = ref('')
const historyCardRef = ref(null)
const unpostedDialogVisible = ref(false)
const unpostedLoading = ref(false)
const unpostedEntries = ref([])
const batchPosting = ref(false)
const postingEntryId = ref(null)
const entryDetailVisible = ref(false)
const currentEntry = ref(null)
const currentEntryItems = ref([])
const dateFixDialogVisible = ref(false)
const dateFixSaving = ref(false)
const dateFixEntry = ref(null)
const dateFixAfterSaveAction = ref(null)
const dateFixForm = ref({
  entry_date: '',
  posting_date: ''
})
const reconciliationDialogVisible = ref(false)
const reconciliationLoading = ref(false)
const unreconciledTransactions = ref([])
const manualReconciledTransactions = ref([])
const route = useRoute()
const router = useRouter()

const openPeriods = computed(() => periods.value.filter((period) => !period.is_closed))
const selectedPeriodLabel = computed(() => {
  const period =
    openPeriods.value.find((p) => p.id === selectedPeriodId.value) ||
    periods.value.find((p) => p.id === selectedPeriodId.value)
  return periodLabel(period)
})
const dateFixPrimaryText = computed(() => {
  if (dateFixAfterSaveAction.value === 'post') return '修正并过账'
  if (dateFixAfterSaveAction.value === 'batch') return '修正并继续一键过账'
  return '保存修正'
})
const toNumber = (value) => Number.parseFloat(value) || 0
const formatMoney = (value) => formatCurrency(value, '¥')

const fetchPeriods = async () => {
  try {
    const res = await financeApi.periods.getList()
    const data = parseDataObject(res, { enableLog: false }) || {}
    periods.value = data.periods || data.list || []

    const requestedPeriodId = Number.parseInt(route.query.periodId, 10)
    const requestedPeriod = periods.value.find(period => Number(period.id) === requestedPeriodId)
    const defaultPeriod = requestedPeriod || selectDefaultOpenPeriod(periods.value)
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
    const res = await financeApi.glClosing.preview(selectedPeriodId.value)
    previewData.value = parseDataObject(res, { enableLog: false }) || {}
    activeStep.value = 1
  } catch (error) {
    console.error('获取结转预览失败:', error)
    ElMessage.error(error.message || '获取结转预览失败')
  } finally {
    previewLoading.value = false
  }
}

const normalizeEntryItem = item => ({
  id: item.id,
  accountCode: item.accountCode,
  accountName: item.accountName || '-',
  accountIssue: item.accountIssue || null,
  description: item.description || '-',
  debitAmount: item.debitAmount ?? item.debitAmount ?? 0,
  creditAmount: item.creditAmount ?? item.creditAmount ?? 0
})

const fetchUnpostedEntries = async () => {
  if (!selectedPeriodId.value) return

  unpostedLoading.value = true
  try {
    const res = await financeApi.glClosing.getUnpostedEntries(selectedPeriodId.value)
    const data = parseDataObject(res, { enableLog: false }) || {}
    unpostedEntries.value = data.entries || data.list || []
  } catch (error) {
    console.error('获取未过账凭证明细失败:', error)
    ElMessage.error(error.message || '获取未过账凭证明细失败')
  } finally {
    unpostedLoading.value = false
  }
}

const openUnpostedDialog = async () => {
  unpostedDialogVisible.value = true
  await fetchUnpostedEntries()
}

const allUnreconciledTransactions = computed(() => [
  ...unreconciledTransactions.value.map(t => ({ ...t, _type: 'unreconciled' })),
  ...manualReconciledTransactions.value.map(t => ({ ...t, _type: 'manual' }))
])

const fetchUnreconciledTransactions = async () => {
  if (!selectedPeriodId.value) return
  reconciliationLoading.value = true
  try {
    const res = await financeApi.glClosing.getUnreconciledTransactions(selectedPeriodId.value)
    const data = parseDataObject(res)
    unreconciledTransactions.value = data.unreconciledTransactions || []
    manualReconciledTransactions.value = data.manualReconciledTransactions || []
  } catch {
    ElMessage.error('获取未对账银行流水失败')
  } finally {
    reconciliationLoading.value = false
  }
}

const openReconciliationDialog = async () => {
  reconciliationDialogVisible.value = true
  await fetchUnreconciledTransactions()
}

const goToBankReconciliation = () => {
  router.push({
    path: '/finance/cash/reconciliation',
    query: selectedPeriodId.value ? { periodId: selectedPeriodId.value } : undefined
  })
}

const refreshAfterPosting = async () => {
  await fetchUnpostedEntries()
  await fetchPreview()
  if (unpostedEntries.value.length === 0) {
    unpostedDialogVisible.value = false
  }
}

const postSingleEntry = async (row) => {
  if (!row.dateValid) {
    ElMessage.warning('该凭证日期不在所属期间内，请先修正日期')
    openDateFixDialog(row, 'post')
    return
  }

  if (!row.postingReady) {
    ElMessage.warning(row.postingIssue || '该凭证暂不满足过账条件，请先处理凭证明细')
    await openEntryDetail(row)
    return
  }

  try {
    await ElMessageBox.confirm(
      `确认过账凭证 ${row.entryNumber}？过账后将不能直接修改或删除。`,
      '确认过账',
      {
        confirmButtonText: '确认过账',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    postingEntryId.value = row.id
    await financeApi.postEntry(row.id)
    ElMessage.success('过账成功')
    await refreshAfterPosting()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('过账凭证失败:', error)
      ElMessage.error(error.message || '过账凭证失败')
    }
  } finally {
    postingEntryId.value = null
  }
}

const postAllUnpostedEntries = async () => {
  if (unpostedEntries.value.length === 0) return

  const invalidEntry = unpostedEntries.value.find(entry => !entry.posting_ready)
  if (invalidEntry && !invalidEntry.date_valid) {
    ElMessage.warning('存在日期异常凭证，请先修正日期')
    openDateFixDialog(invalidEntry, 'batch')
    return
  }
  if (invalidEntry) {
    ElMessage.warning(invalidEntry.posting_issue || '存在暂不满足过账条件的凭证，请先处理')
    await openEntryDetail(invalidEntry)
    return
  }

  try {
    await ElMessageBox.confirm(
      `确认一键过账当前 ${unpostedEntries.value.length} 张未过账凭证？系统会逐张校验，失败时停止并保留错误提示。`,
      '确认批量过账',
      {
        confirmButtonText: '确认过账',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    batchPosting.value = true
    let successCount = 0
    for (const entry of unpostedEntries.value) {
      postingEntryId.value = entry.id
      await financeApi.postEntry(entry.id)
      successCount += 1
    }

    ElMessage.success(`已过账 ${successCount} 张凭证`)
    await refreshAfterPosting()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('批量过账失败:', error)
      ElMessage.error(error.message || '批量过账失败，请处理失败凭证后重试')
      await fetchUnpostedEntries()
      await fetchPreview()
    }
  } finally {
    batchPosting.value = false
    postingEntryId.value = null
  }
}

const openEntryDetail = async (row) => {
  try {
    currentEntry.value = row
    const res = await financeApi.getEntryItems(row.id)
    currentEntryItems.value = Array.isArray(res.data)
      ? res.data.map(normalizeEntryItem)
      : []
    entryDetailVisible.value = true
  } catch (error) {
    console.error('获取凭证明细失败:', error)
    ElMessage.error(error.message || '获取凭证明细失败')
  }
}

const openDateFixDialog = (row, afterSaveAction = null) => {
  dateFixEntry.value = row
  dateFixAfterSaveAction.value = afterSaveAction
  dateFixForm.value = {
    entry_date: row.entryDate || row.periodStartDate || '',
    posting_date: row.postingDate || row.entryDate || row.periodStartDate || ''
  }
  dateFixDialogVisible.value = true
}

const syncPostingDate = () => {
  dateFixForm.value.posting_date = dateFixForm.value.entry_date
}

const fillPeriodEndDate = () => {
  const endDate = dateFixEntry.value?.period_end_date
  if (!endDate) return
  dateFixForm.value.entry_date = endDate
  dateFixForm.value.posting_date = endDate
}

const saveEntryDates = async () => {
  if (!dateFixEntry.value) return
  if (!dateFixForm.value.entry_date || !dateFixForm.value.posting_date) {
    ElMessage.warning('请填写凭证日期和过账日期')
    return
  }

  dateFixSaving.value = true
  const fixedEntryId = dateFixEntry.value.id
  const afterSaveAction = dateFixAfterSaveAction.value
  try {
    await financeApi.glClosing.updateUnpostedEntryDates(fixedEntryId, {
      entry_date: dateFixForm.value.entry_date,
      posting_date: dateFixForm.value.posting_date,
      period_id: selectedPeriodId.value || dateFixEntry.value.effective_period_id || dateFixEntry.value.period_id
    })
    ElMessage.success('凭证日期已修正')
    dateFixDialogVisible.value = false
    dateFixAfterSaveAction.value = null

    if (afterSaveAction === 'post') {
      postingEntryId.value = fixedEntryId
      await financeApi.postEntry(fixedEntryId)
      ElMessage.success('过账成功')
      await refreshAfterPosting()
      return
    }

    await fetchUnpostedEntries()
    await fetchPreview()

    if (afterSaveAction === 'batch') {
      await postAllUnpostedEntries()
    }
  } catch (error) {
    console.error('修正凭证日期失败:', error)
    ElMessage.error(error.message || '修正凭证日期失败')
  } finally {
    dateFixSaving.value = false
    postingEntryId.value = null
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
    const res = await financeApi.glClosing.execute(selectedPeriodId.value)
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
    const res = await financeApi.glClosing.history(historyPeriodId.value)
    const data = parseDataObject(res, { enableLog: false }) || {}
    historyList.value = data.entries || data.list || []
  } catch (error) {
    console.error('获取结转历史失败:', error)
  }
}

const resetWizard = () => {
  activeStep.value = 0
  previewData.value = null
  selectedPeriodId.value = selectDefaultOpenPeriod(periods.value)?.id || ''
}

const scrollToHistory = () => {
  historyCardRef.value?.$el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(() => {
  fetchPeriods()
})
</script>

<style scoped>
/* 根节点交给 .module-page（padding:0 + data-card 间距 20px），勿再套 app-container 内边距 */

.period-closing-page :deep(.wizard-card > .el-card__header),
.period-closing-page :deep(.data-card > .el-card__header) {
  padding: 14px 16px;
}

.period-closing-page :deep(.wizard-card > .el-card__body),
.period-closing-page :deep(.data-card > .el-card__body) {
  padding: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-weight: 600;
  color: var(--color-text-primary, var(--el-text-color-primary));
}

.closing-steps {
  margin-bottom: 20px;
}

.step-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.step-form {
  margin: 0;
}

.step-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary, var(--el-text-color-primary));
  line-height: 1.4;
}

.step-result {
  padding: 24px 0 8px;
}

.actions-row {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  padding-top: 4px;
  border-top: 1px solid var(--color-border-lighter, var(--el-border-color-lighter));
  margin-top: 4px;
}

.dialog-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.text-secondary {
  color: var(--color-text-secondary, var(--el-text-color-secondary));
}

.text-danger {
  color: var(--color-danger, var(--el-color-danger));
  font-weight: 600;
}

.text-success {
  color: var(--color-success, var(--el-color-success));
  font-weight: 600;
}

.table-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
