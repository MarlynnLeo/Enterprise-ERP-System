<template>
  <div class="module-page app-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>试算平衡</h2>
          <p class="subtitle">按会计期间核对总账科目的借贷发生额与余额</p>
        </div>
        <el-button v-permission="'finance:reports:view'" :disabled="!tableData.length" @click="exportData">
          <el-icon><Download /></el-icon>
          导出
        </el-button>
      </div>
    </el-card>

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
              :label="item.period_name"
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
          style="width: 100%"
          show-summary
          :summary-method="getSummaries"
          height="calc(100vh - 400px)"
        >
          <template #empty>
            <el-empty description="暂无数据" />
          </template>
          <el-table-column prop="account_code" label="科目编码" width="120" sortable />
          <el-table-column prop="account_name" label="科目名称" min-width="180" />
          <el-table-column prop="account_type" label="科目类型" width="100" />
          <el-table-column prop="is_debit" label="余额方向" width="100">
            <template #default="{ row }">
              <el-tag :type="row.is_debit ? 'success' : 'warning'" size="small">
                {{ row.is_debit ? '借' : '贷' }}
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column label="期初余额">
            <el-table-column prop="opening_debit_amount" label="借方" width="150">
              <template #default="{ row }">
                {{ formatAmountOrEmpty(row.opening_debit_amount) }}
              </template>
            </el-table-column>
            <el-table-column prop="opening_credit_amount" label="贷方" width="150">
              <template #default="{ row }">
                {{ formatAmountOrEmpty(row.opening_credit_amount) }}
              </template>
            </el-table-column>
          </el-table-column>

          <el-table-column label="本期发生额">
            <el-table-column prop="total_debit" label="借方" width="150">
              <template #default="{ row }">
                {{ formatMoney(row.total_debit) }}
              </template>
            </el-table-column>
            <el-table-column prop="total_credit" label="贷方" width="150">
              <template #default="{ row }">
                {{ formatMoney(row.total_credit) }}
              </template>
            </el-table-column>
          </el-table-column>

          <el-table-column label="期末余额">
            <el-table-column prop="debit_balance" label="借方" width="150">
              <template #default="{ row }">
                <span :class="{ 'text-muted': Number(row.debit_balance) === 0 }">
                  {{ formatMoney(row.debit_balance) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="credit_balance" label="贷方" width="150">
              <template #default="{ row }">
                <span :class="{ 'text-muted': Number(row.credit_balance) === 0 }">
                  {{ formatMoney(row.credit_balance) }}
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
    const openingBalance = toNumber(row.opening_balance)
    const openingDebit = row.is_debit ? openingBalance : -openingBalance

    return {
      ...row,
      opening_debit_amount: openingDebit > 0 ? openingDebit : 0,
      opening_credit_amount: openingDebit < 0 ? Math.abs(openingDebit) : 0,
      total_debit: toNumber(row.total_debit),
      total_credit: toNumber(row.total_credit),
      debit_balance: toNumber(row.debit_balance),
      credit_balance: toNumber(row.credit_balance)
    }
  })
  .filter(row => {
    const values = [
      row.opening_debit_amount,
      row.opening_credit_amount,
      row.total_debit,
      row.total_credit,
      row.debit_balance,
      row.credit_balance
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
        row.account_code,
        row.account_name,
        row.account_type,
        row.is_debit ? '借' : '贷',
        row.opening_debit_amount || '',
        row.opening_credit_amount || '',
        row.total_debit || '',
        row.total_credit || '',
        row.debit_balance || '',
        row.credit_balance || ''
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
.app-container {
  padding: 20px;
}

.header-card,
.search-card {
  margin-bottom: 20px;
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

.search-form .el-form-item {
  margin-bottom: 0;
}

.table-container {
  width: 100%;
}

.text-muted {
  color: var(--color-text-secondary);
}
</style>
