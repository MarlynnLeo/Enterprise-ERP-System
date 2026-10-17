<template>
  <div class="module-page ledger-report-page">
    <PageHeader :title="title" subtitle="按会计期间查询账簿，核对发生额与结余">
      <template #actions>
        <el-button :icon="Download" :disabled="!canOutput" :loading="outputMode === 'excel'" @click="outputReport('excel')">导出 Excel</el-button>
        <el-button :icon="Printer" :disabled="!canOutput" :loading="outputMode === 'print'" @click="outputReport('print')">打印报表</el-button>
      </template>
    </PageHeader>

    <FinanceQueryCard :model="filters" :loading="loading" search-label="生成报表" @search="search" @reset="reset">
      <template #basic>
        <el-form-item label="起始期间">
          <el-date-picker v-model="filters.startMonth" type="month" value-format="YYYY-MM" placeholder="选择月份" :clearable="false" class="month-picker" />
        </el-form-item>
        <el-form-item label="结束期间">
          <el-date-picker v-model="filters.endMonth" type="month" value-format="YYYY-MM" placeholder="选择月份" :clearable="false" class="month-picker" />
        </el-form-item>
        <el-form-item v-if="type !== 'quantity'" label="会计科目">
          <el-select v-model="filters.accountId" clearable filterable remote :remote-method="searchAccounts" placeholder="全部适用科目，可输入搜索" class="ledger-selector" :loading="optionsLoading">
            <el-option v-for="option in options.accountOptions" :key="option.id" :label="optionLabel(option)" :value="option.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="type === 'payable'" label="供应商">
          <el-select v-model="filters.supplierId" clearable filterable remote :remote-method="searchSuppliers" placeholder="输入供应商名称搜索" class="ledger-selector" :loading="optionsLoading">
            <el-option v-for="option in options.supplierOptions" :key="option.id" :label="optionLabel(option)" :value="option.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="type === 'quantity'" label="物料">
          <el-select v-model="filters.materialId" clearable filterable remote :remote-method="searchMaterials" placeholder="输入物料编码或名称搜索" class="ledger-selector" :loading="optionsLoading">
            <el-option v-for="option in options.materialOptions" :key="option.id" :label="optionLabel(option)" :value="option.id" />
          </el-select>
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <el-alert v-if="optionsError" :title="optionsError" type="warning" show-icon :closable="false">
      <el-button link type="primary" @click="loadOptions('')">重新加载筛选项</el-button>
    </el-alert>
    <el-card class="data-card ledger-card" v-loading="loading">
      <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon :closable="false" />
      <template v-else-if="report">
        <div class="ledger-heading">
          <h2>{{ report.title || title }}</h2>
          <div class="ledger-meta">
            <span v-if="report.organizationName">编制单位：{{ report.organizationName }}</span>
            <span>期间：{{ report.filters.startMonth }} 至 {{ report.filters.endMonth }}</span>
            <span v-if="filterCaption">{{ filterCaption }}</span>
            <span>{{ type === 'quantity' ? '存货数量与金额' : '已记账凭证' }} · 金额单位：元</span>
          </div>
        </div>
        <el-alert v-for="(warning, index) in report.warnings || []" :key="index" :title="warning" type="warning" :closable="false" show-icon class="ledger-warning" />
        <div class="ledger-table-wrap">
          <el-table :data="report.rows" border :row-class-name="rowClassName" empty-text="所选期间暂无符合条件的账簿记录" max-height="620" class="ledger-table">
            <template v-for="column in report.columns" :key="column.key || column.label">
              <el-table-column v-if="column.children?.length" :label="column.label" align="center">
                <el-table-column v-for="child in column.children" :key="child.key" :prop="child.key" :label="child.label" :min-width="child.width || 120" :align="child.decimals !== undefined ? 'right' : 'left'" header-align="center">
                  <template #default="{ row }">{{ formatLedgerCell(row, child) }}</template>
                </el-table-column>
              </el-table-column>
              <el-table-column v-else :prop="column.key" :label="column.label" :min-width="column.width || 120" :align="column.decimals !== undefined ? 'right' : 'left'" header-align="center">
                <template #default="{ row }">
                  <el-button v-if="column.key === 'voucherNumber' && row.entryId && canViewEntries" link type="primary" @click="openVoucher(row)">{{ row.voucherNumber }}</el-button>
                  <span v-else>{{ formatLedgerCell(row, column) }}</span>
                </template>
              </el-table-column>
            </template>
          </el-table>
        </div>
        <div class="ledger-footer">
          <span>共 {{ report.pagination?.total || 0 }} 行（含期初、合计及累计），导出与打印包含全部查询结果。</span>
          <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[50, 100, 200]" :total="report.pagination?.total || 0" layout="total, sizes, prev, pager, next" @current-change="fetchPage" @size-change="changePageSize" />
        </div>
      </template>
      <el-empty v-else-if="!loading" :description="type === 'quantity' ? '选择物料及期间后生成报表；物料留空可查询全部库存' : '选择期间并生成报表'" />
    </el-card>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Download, Printer } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { financeApi } from '@/api/finance'
import { useAuthStore } from '@/stores/auth'
import { formatLocalDate } from '@/utils/format'
import { parseDataObject } from '@/utils/responseParser'
import { getApiErrorMessage } from '@/utils/errorHandler'
import { loadExcelJS } from '@/utils/lazyVendors'
import printService from '@/services/printService'
import { LEDGER_TITLES, formatLedgerCell, ledgerFilterCaption, buildLedgerPrintHtml, populateLedgerWorksheet } from './ledgerPresentation'

const props = defineProps({ type: { type: String, required: true } })
const router = useRouter()
const authStore = useAuthStore()
const title = computed(() => LEDGER_TITLES[props.type] || '会计账簿')
const defaultFilters = () => {
  const month = formatLocalDate(new Date()).slice(0, 7)
  return { startMonth: `${month.slice(0, 4)}-01`, endMonth: month, accountId: '', supplierId: '', materialId: '' }
}
const filters = reactive(defaultFilters())
const options = ref({ accountOptions: [], supplierOptions: [], materialOptions: [] })
const optionsLoading = ref(false)
const optionsError = ref('')
const report = ref(null)
const appliedFilters = ref(null)
const loading = ref(false)
const errorMessage = ref('')
const page = ref(1)
const pageSize = ref(50)
const outputMode = ref('')
let requestSequence = 0
let optionsSequence = 0
let lifecycle = 0
const canOutput = computed(() => !!report.value?.rows?.length && !loading.value && !outputMode.value)
const canViewEntries = computed(() => authStore.hasPermission('finance:entries:view'))
const filterCaption = computed(() => ledgerFilterCaption(report.value?.filters))
const optionLabel = option => [option.code, option.name].filter(Boolean).join(' · ')
const rowClassName = ({ row }) => row.rowType === 'entry' ? '' : 'ledger-summary-row'
const openVoucher = row => router.push({ path: '/finance/gl/entries', query: { entryId: row.entryId } })
const searchAccounts = keyword => loadOptions(keyword, 'accountOptions')
const searchSuppliers = keyword => loadOptions(keyword, 'supplierOptions')
const searchMaterials = keyword => loadOptions(keyword, 'materialOptions')

async function loadOptions(keyword = '', target = 'all') {
  const sequence = ++optionsSequence
  optionsLoading.value = true
  optionsError.value = ''
  try {
    const result = parseDataObject(await financeApi.reports.getLedgerOptions({ type: props.type, keyword }))
    if (sequence !== optionsSequence) return
    const keys = target === 'all' ? ['accountOptions', 'supplierOptions', 'materialOptions'] : [target]
    for (const key of keys) {
      const selectedId = filters[{ accountOptions: 'accountId', supplierOptions: 'supplierId', materialOptions: 'materialId' }[key]]
      const selected = options.value[key].find(option => option.id === selectedId)
      const list = result?.[key] || []
      // Preserve the chosen label while searching for other suppliers/materials.
      options.value[key] = selected && !list.some(option => option.id === selectedId) ? [selected, ...list] : list
    }
  } catch (error) {
    if (sequence === optionsSequence) optionsError.value = getApiErrorMessage(error, '筛选项加载失败，请重试')
  } finally {
    if (sequence === optionsSequence) optionsLoading.value = false
  }
}

function queryParams() {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '' && value != null))
}

async function fetchPage() {
  if (!appliedFilters.value) return
  const sequence = ++requestSequence
  loading.value = true
  errorMessage.value = ''
  report.value = null
  try {
    const result = parseDataObject(await financeApi.reports.getLedger(props.type, { ...appliedFilters.value, page: page.value, pageSize: pageSize.value }))
    if (sequence !== requestSequence) return
    if (!Array.isArray(result?.rows) || !Array.isArray(result?.columns)) throw new Error('报表数据格式不完整，请重新查询')
    report.value = { ...result, filters: { ...appliedFilters.value, ...result.filters } }
  } catch (error) {
    if (sequence === requestSequence) errorMessage.value = getApiErrorMessage(error, '报表生成失败，请重试')
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

function search() {
  if (!filters.startMonth || !filters.endMonth || filters.startMonth > filters.endMonth) {
    ElMessage.warning('请选择有效的起止期间，起始期间不能晚于结束期间')
    return
  }
  appliedFilters.value = queryParams()
  page.value = 1
  fetchPage()
}

function changePageSize() {
  page.value = 1
  fetchPage()
}

function reset() {
  requestSequence++
  report.value = null
  appliedFilters.value = null
  errorMessage.value = ''
  loading.value = false
  Object.assign(filters, defaultFilters())
  loadOptions('')
  // Inventory has many materials; allow narrowing the scope before loading.
  if (props.type !== 'quantity') search()
}

async function outputReport(mode) {
  if (!canOutput.value) return
  const currentLifecycle = lifecycle
  const reportType = props.type
  const query = { ...appliedFilters.value, export: true }
  outputMode.value = mode
  try {
    const result = parseDataObject(await financeApi.reports.getLedger(reportType, query))
    if (currentLifecycle !== lifecycle) return
    if (!Array.isArray(result?.rows) || !Array.isArray(result?.columns)) throw new Error('报表数据格式不完整，请重新查询')
    if (Number(result.pagination?.total || 0) > result.rows.length) throw new Error('报表结果未完整返回，请缩小查询范围后重试')
    const fullReport = { ...result, title: result.title || LEDGER_TITLES[reportType], filters: { ...query, ...result.filters } }
    if (mode === 'print') {
      await printService.printDocument(buildLedgerPrintHtml(fullReport))
    } else {
      const ExcelJS = await loadExcelJS()
      if (currentLifecycle !== lifecycle) return
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet(fullReport.title)
      populateLedgerWorksheet(sheet, fullReport)
      const buffer = await workbook.xlsx.writeBuffer()
      if (currentLifecycle !== lifecycle) return
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `${fullReport.title}_${fullReport.filters.startMonth}_${fullReport.filters.endMonth}.xlsx`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      ElMessage.success('报表已导出')
    }
  } catch (error) {
    if (currentLifecycle === lifecycle) ElMessage.error(getApiErrorMessage(error, mode === 'print' ? '打印失败，请重试' : '导出失败，请重试'))
  } finally {
    if (currentLifecycle === lifecycle) outputMode.value = ''
  }
}

watch(() => props.type, () => {
  lifecycle++
  requestSequence++
  optionsSequence++
  report.value = null
  options.value = { accountOptions: [], supplierOptions: [], materialOptions: [] }
  outputMode.value = ''
  reset()
}, { immediate: true })

onBeforeUnmount(() => { lifecycle++; requestSequence++; optionsSequence++ })
</script>

<style scoped>
.ledger-report-page { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.ledger-report-page :deep(.month-picker) { width: 150px; }
.ledger-selector { width: 240px; }
.ledger-card { min-width: 0; }
.ledger-heading { margin-bottom: 18px; }
.ledger-heading h2 { margin: 0 0 14px; text-align: center; font-size: 22px; color: var(--el-text-color-primary); }
.ledger-meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 20px; color: var(--el-text-color-secondary); font-size: 13px; }
.ledger-warning { margin-bottom: 12px; }
.ledger-table-wrap { min-width: 0; width: 100%; }
.ledger-table { width: 100%; font-variant-numeric: tabular-nums; }
.ledger-table :deep(.cell) { white-space: normal; word-break: normal; overflow-wrap: anywhere; }
.ledger-table :deep(.el-table__body .is-right .cell) { white-space: nowrap; }
.ledger-table :deep(.el-table__header .cell) { white-space: normal; line-height: 1.5; }
.ledger-table :deep(.ledger-summary-row) { --el-table-tr-bg-color: var(--el-fill-color-light); font-weight: 600; }
.ledger-footer { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 14px; padding-top: 16px; }
.ledger-footer > span { font-size: 12px; color: var(--el-text-color-secondary); }
@media (max-width: 768px) { .ledger-selector { width: 200px; } .ledger-meta { flex-direction: column; } .ledger-footer { overflow-x: auto; } }
</style>
