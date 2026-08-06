<template>
  <div class="module-page trial-balance-page">
    <PageHeader title="试算平衡" subtitle="按会计期间核对总账科目的借贷发生额与余额">
      <template #actions>
<el-button v-permission="'finance:reports:view'" :disabled="!tableData.length" @click="exportData">
          <el-icon><Download /></el-icon>
          导出
        </el-button>
      </template>
    </PageHeader>

    <FinanceQueryCard
      :model="filters"
      :loading="loading"
      @search="fetchData"
      @reset="resetFilters"
    >
      <template #basic>
        <el-form-item label="会计期间">
          <el-select
            v-model="filters.period_id"
            placeholder="选择会计期间"
            clearable
            filterable
            style="width: 220px"
          >
            <el-option
              v-for="item in periods"
              :key="item.id"
              :label="item.periodName"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <el-card class="data-card">
      <el-alert
        v-if="summary"
        :title="summary.isBalanced ? '试算平衡：借贷平衡' : '试算不平衡：请检查凭证数据'"
        :type="summary.isBalanced ? 'success' : 'error'"
        :closable="false"
        show-icon
        class="mb-4"
      />

      <div class="table-container">
        <el-table
          v-loading="loading"
          :data="tableData"
          border
          class="w-full"
          show-summary
          :summary-method="getSummaries"
          height="calc(100vh - 400px)"
        >
          <template #empty>
            <EmptyState description="暂无数据" />
          </template>
          <el-table-column prop="accountCode" label="科目编码" width="120" sortable />
          <el-table-column prop="accountName" label="科目名称" min-width="180" />
          <el-table-column prop="accountType" label="科目类型" width="100" />
          <el-table-column prop="isDebit" label="余额方向" width="100">
            <template #default="{ row }">
              <el-tag :type="row.isDebit ? 'success' : 'warning'" size="small">
                {{ row.isDebit ? '借' : '贷' }}
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column label="期初余额">
            <el-table-column prop="openingDebitAmount" label="借方" width="150">
              <template #default="{ row }">
                {{ formatAmountOrEmpty(row.openingDebitAmount) }}
              </template>
            </el-table-column>
            <el-table-column prop="openingCreditAmount" label="贷方" width="150">
              <template #default="{ row }">
                {{ formatAmountOrEmpty(row.openingCreditAmount) }}
              </template>
            </el-table-column>
          </el-table-column>

          <el-table-column label="本期发生额">
            <el-table-column prop="totalDebit" label="借方" width="150">
              <template #default="{ row }">
                {{ formatMoney(row.totalDebit) }}
              </template>
            </el-table-column>
            <el-table-column prop="totalCredit" label="贷方" width="150">
              <template #default="{ row }">
                {{ formatMoney(row.totalCredit) }}
              </template>
            </el-table-column>
          </el-table-column>

          <el-table-column label="期末余额">
            <el-table-column prop="debitBalance" label="借方" width="150">
              <template #default="{ row }">
                <span :class="{ 'text-muted': Number(row.debitBalance) === 0 }">
                  {{ formatMoney(row.debitBalance) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="creditBalance" label="贷方" width="150">
              <template #default="{ row }">
                <span :class="{ 'text-muted': Number(row.creditBalance) === 0 }">
                  {{ formatMoney(row.creditBalance) }}
                </span>
              </template>
            </el-table-column>
          </el-table-column>
        </el-table>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { financeApi } from '@/api'
import { formatCurrency, formatLocalDate } from '@/utils/format'
import { loadExcelJS } from '@/utils/lazyVendors'
import { parseDataObject } from '@/utils/responseParser'

const loading = ref(false)
const tableData = ref([])
const periods = ref([])
const filters = ref({ period_id: '' })
const summary = ref(null)

const toNumber = value => Number.parseFloat(value) || 0
const formatMoney = value => formatCurrency(value, '¥')
const formatAmountOrEmpty = value => (Math.abs(toNumber(value)) > 0.001 ? formatMoney(value) : '')

const normalizeTrialBalanceRows = rows => rows
  .map(row => {
    const openingBalance = toNumber(row.openingBalance)
    const openingDebit = row.isDebit ? openingBalance : -openingBalance

    return {
      ...row,
      opening_debit_amount: openingDebit > 0 ? openingDebit : 0,
      opening_credit_amount: openingDebit < 0 ? Math.abs(openingDebit) : 0,
      total_debit: toNumber(row.totalDebit),
      total_credit: toNumber(row.totalCredit),
      debit_balance: toNumber(row.debitBalance),
      credit_balance: toNumber(row.creditBalance)
    }
  })
  .filter(row => {
    const values = [
      row.openingDebitAmount,
      row.openingCreditAmount,
      row.totalDebit,
      row.totalCredit,
      row.debitBalance,
      row.creditBalance
    ]
    return values.some(value => Math.abs(value) > 0.001)
  })

const selectDefaultPeriod = () => {
  const now = new Date()
  const currentPeriodKeyword = `${now.getFullYear()}年${now.getMonth() + 1}月`

  return periods.value.find(period => !period.is_closed && period.period_name?.includes(currentPeriodKeyword))
    || periods.value.find(period => !period.is_closed)
    || periods.value[0]
}

const fetchPeriods = async () => {
  try {
    const res = await financeApi.periods.getList()
    const data = parseDataObject(res, { enableLog: false }) || {}
    periods.value = data.periods || data.list || []

    const defaultPeriod = selectDefaultPeriod()
    if (defaultPeriod) {
      filters.value.period_id = defaultPeriod.id
      await fetchData()
    }
  } catch (error) {
    console.error('获取会计期间失败:', error)
    ElMessage.error(error.message || '获取会计期间失败')
  }
}

const fetchData = async () => {
  if (!filters.value.period_id) return

  loading.value = true
  try {
    const res = await financeApi.reports.getTrialBalance(filters.value)
    const data = parseDataObject(res, { enableLog: false }) || {}

    tableData.value = normalizeTrialBalanceRows(data.trialBalance || data.list || [])
    summary.value = {
      ...(data.summary || {}),
      isBalanced: Boolean(data.isBalanced)
    }
  } catch (error) {
    console.error('获取试算平衡失败:', error)
    ElMessage.error(error.message || '获取数据失败')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  filters.value.period_id = ''
  tableData.value = []
  summary.value = null
}

const sumBy = (data, property) => data.reduce((total, row) => total + toNumber(row[property]), 0)

const getSummaries = ({ columns, data }) => {
  const sums = []

  columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = '合计'
      return
    }

    const totalFields = [
      'opening_debit_amount',
      'opening_credit_amount',
      'total_debit',
      'total_credit',
      'debit_balance',
      'credit_balance'
    ]

    sums[index] = totalFields.includes(column.property) ? formatMoney(sumBy(data, column.property)) : ''
  })

  return sums
}

const exportData = async () => {
  if (!tableData.value.length) {
    ElMessage.warning('暂无数据可导出')
    return
  }

  try {
    const ExcelJS = await loadExcelJS()
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('试算平衡')
    const currentPeriod = periods.value.find(period => period.id === filters.value.period_id)
    const periodName = currentPeriod?.period_name || '未指定期间'

    worksheet.mergeCells('A1:J1')
    const titleCell = worksheet.getCell('A1')
    titleCell.value = `试算平衡（${periodName}）`
    titleCell.font = { size: 16, bold: true }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }

    worksheet.addRow([
      '科目编码',
      '科目名称',
      '科目类型',
      '余额方向',
      '期初借方',
      '期初贷方',
      '本期借方',
      '本期贷方',
      '期末借方',
      '期末贷方'
    ])

    tableData.value.forEach(row => {
      worksheet.addRow([
        row.accountCode,
        row.accountName,
        row.accountType,
        row.isDebit ? '借' : '贷',
        row.openingDebitAmount || '',
        row.openingCreditAmount || '',
        row.totalDebit || '',
        row.totalCredit || '',
        row.debitBalance || '',
        row.creditBalance || ''
      ])
    })

    worksheet.addRow([
      '合计',
      '',
      '',
      '',
      sumBy(tableData.value, 'opening_debit_amount'),
      sumBy(tableData.value, 'opening_credit_amount'),
      sumBy(tableData.value, 'total_debit'),
      sumBy(tableData.value, 'total_credit'),
      sumBy(tableData.value, 'debit_balance'),
      sumBy(tableData.value, 'credit_balance')
    ])

    worksheet.columns.forEach((column, index) => {
      column.width = index === 1 ? 24 : 14
    })
    worksheet.eachRow(row => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        }
      })
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `试算平衡_${periodName}_${formatLocalDate(new Date())}.xlsx`
    link.click()
    window.URL.revokeObjectURL(url)

    ElMessage.success('导出成功')
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败: ' + (error.message || '未知错误'))
  }
}

onMounted(() => {
  fetchPeriods()
})
</script>

<style scoped>
/* 根节点交给 .module-page（padding:0 + data-card 间距），勿再套 app-container */
.table-container {
  width: 100%;
}

.text-muted {
  color: var(--color-text-secondary);
}
</style>
