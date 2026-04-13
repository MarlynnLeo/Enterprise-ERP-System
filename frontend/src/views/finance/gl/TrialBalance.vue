<template>
  <div class="app-container">
    <!-- 头部区域 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>试算平衡表</h2>
          <p class="subtitle">总账科目借贷分录与余额试算</p>
        </div>
        <div>
          <!-- 这里可以放置顶部操作按钮，如导出 -->
        </div>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="filters" class="search-form">
        <el-form-item label="会计期间">
          <el-select v-model="filters.period_id" placeholder="选择会计期间" clearable @change="fetchData">
            <el-option
              v-for="item in periods"
              :key="item.id"
              :label="item.period_name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchData">
             <el-icon><Search /></el-icon> 查询
          </el-button>
          <el-button @click="exportData">
             <el-icon><Download /></el-icon> 导出
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 数据区域 -->
    <el-card class="data-card">
      <!-- 平衡状态提示 -->
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
          <el-table-column prop="is_debit" label="余额方向" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.is_debit ? 'success' : 'warning'" size="small">
                {{ row.is_debit ? '借' : '贷' }}
              </el-tag>
            </template>
          </el-table-column>
          
          <el-table-column label="期初余额" align="center">
        <el-table-column label="借方" width="150" align="right">
          <template #default="{ row }">
            {{ formatOpeningDebit(row) }}
          </template>
        </el-table-column>
        <el-table-column label="贷方" width="150" align="right">
          <template #default="{ row }">
            {{ formatOpeningCredit(row) }}
          </template>
        </el-table-column>
      </el-table-column>
      
      <el-table-column label="本期发生额" align="center">
        <el-table-column prop="total_debit" label="借方" width="150" align="right">
          <template #default="{ row }">
            {{ formatCurrency(row.total_debit) }}
          </template>
        </el-table-column>
        <el-table-column prop="total_credit" label="贷方" width="150" align="right">
          <template #default="{ row }">
            {{ formatCurrency(row.total_credit) }}
          </template>
        </el-table-column>
      </el-table-column>

      <el-table-column label="期末余额" align="center">
        <el-table-column prop="debit_balance" label="借方" width="150" align="right">
          <template #default="{ row }">
            <span :class="{ 'text-gray-400': row.debit_balance === 0 }">
              {{ formatCurrency(row.debit_balance) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="credit_balance" label="贷方" width="150" align="right">
          <template #default="{ row }">
            <span :class="{ 'text-gray-400': row.credit_balance === 0 }">
              {{ formatCurrency(row.credit_balance) }}
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
import { ref, onMounted } from 'vue'
import request from '@/utils/request'
import { formatCurrency } from '@/utils/format'
import { Search, Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import ExcelJS from 'exceljs'

const loading = ref(false)
const tableData = ref([])
const periods = ref([])
const filters = ref({
  period_id: ''
})
const summary = ref(null)

// 获取会计期间列表
const fetchPeriods = async () => {
  try {
    const res = await request.get('/finance/periods')
    periods.value = res.data.periods

    // 智能默认期间：优先匹配当前系统月份对应的期间
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const currentPeriodKeyword = `${currentYear}年${currentMonth}月`

    // 1. 优先找当前月份且未关闭的期间
    let bestPeriod = periods.value.find(
      p => !p.is_closed && p.period_name && p.period_name.includes(currentPeriodKeyword)
    )

    // 2. 若当前月份已关闭，则取下一个未关闭的月度期间
    if (!bestPeriod) {
      bestPeriod = periods.value
        .filter(p => !p.is_closed && p.period_name && /年\d+月$/.test(p.period_name))
        .sort((a, b) => a.id - b.id)[0]
    }

    // 3. 最终 fallback：取任一未关闭期间或列表中第一项
    if (!bestPeriod) {
      bestPeriod = periods.value.find(p => !p.is_closed) || periods.value[0]
    }

    if (bestPeriod) {
      filters.value.period_id = bestPeriod.id
      fetchData()
    }
  } catch (error) {
    console.error('获取会计期间失败', error)
  }
}

// 获取试算平衡表数据
const fetchData = async () => {
  if (!filters.value.period_id) return
  
  loading.value = true
  try {
    const res = await request.get('/finance/gl/trial-balance', {
      params: filters.value
    })
    
    // 过滤掉所有金额均为0的科目（期初0，本期发生0）
    // 只要有一项不为0就保留
    tableData.value = res.data.trialBalance.filter(row => {
      const hasOpening = Math.abs(row.opening_balance || 0) > 0.001
      const hasPeriod = (Math.abs(row.total_debit || 0) > 0.001) || (Math.abs(row.total_credit || 0) > 0.001)
      return hasOpening || hasPeriod
    })
    
    summary.value = {
      ...res.data.summary,
      isBalanced: res.data.isBalanced
    }
  } catch (error) {
    console.error('获取试算平衡表失败', error)
    ElMessage.error('获取数据失败')
  } finally {
    loading.value = false
  }
}

// 自定义合计行逻辑
const getSummaries = (param) => {
  const { columns, data } = param
  const sums = []
  
  if (!summary.value) return sums

  // 计算期初汇总（前端计算，因为后端没有返回汇总）
  let totalOpeningDebit = 0
  let totalOpeningCredit = 0
  
  data.forEach(row => {
    const net = row.is_debit ? row.opening_balance : -row.opening_balance
    if (net > 0) totalOpeningDebit += net
    if (net < 0) totalOpeningCredit += Math.abs(net)
  })

  columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = '合计'
      return
    }
    
    // 对应列的汇总值
    // 注意：列索引可能因为新增列而改变，建议不依赖硬编码索引，但 Element Plus getSummaries 基于列顺序
    // 我们这里根据 column.label 或 property 来判断更安全，但 property 对于自定义模板列可能为空
    
    // 简单起见，根据 current column logic
    // 期初借方：第4列 (index 3? depends on visible columns)
    // No, getSummaries iterates columns.
    
    // 我们无法直接通过 property 匹配 opening columns 因为它们没有 prop
    // 但可以通过 label 判断 (虽然有点脆弱)
    
    if (column.label === '借方' && column.parent?.label === '期初余额') {
      sums[index] = formatCurrency(totalOpeningDebit)
    } else if (column.label === '贷方' && column.parent?.label === '期初余额') {
      sums[index] = formatCurrency(totalOpeningCredit)
    } else {
      switch (column.property) {
        case 'total_debit':
          sums[index] = formatCurrency(summary.value.total_debit)
          break
        case 'total_credit':
          sums[index] = formatCurrency(summary.value.total_credit)
          break
        case 'debit_balance':
          sums[index] = formatCurrency(summary.value.total_debit_balance)
          break
        case 'credit_balance':
          sums[index] = formatCurrency(summary.value.total_credit_balance)
          break
        default:
          sums[index] = ''
      }
    }
  })

  return sums
}

const formatOpeningDebit = (row) => {
  const net = row.is_debit ? row.opening_balance : -row.opening_balance
  return net > 0 ? formatCurrency(net) : ''
}

const formatOpeningCredit = (row) => {
  const net = row.is_debit ? row.opening_balance : -row.opening_balance
  return net < 0 ? formatCurrency(Math.abs(net)) : ''
}

const exportData = async () => {
  if (tableData.value.length === 0) {
    ElMessage.warning('暂无数据可导出')
    return
  }

  try {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('试算平衡表')

    // 获取当前期间名称
    const currentPeriod = periods.value.find(p => p.id === filters.value.period_id)
    const periodName = currentPeriod ? currentPeriod.period_name : '未指定期间'

    // 添加标题行
    worksheet.mergeCells('A1:J1')
    const titleCell = worksheet.getCell('A1')
    titleCell.value = `试算平衡表 (${periodName})`
    titleCell.font = { size: 16, bold: true }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }

    // 添加双层表头第一层
    worksheet.mergeCells('A2:A3')
    worksheet.getCell('A2').value = '科目编码'
    worksheet.mergeCells('B2:B3')
    worksheet.getCell('B2').value = '科目名称'
    worksheet.mergeCells('C2:C3')
    worksheet.getCell('C2').value = '科目类型'
    worksheet.mergeCells('D2:D3')
    worksheet.getCell('D2').value = '余额方向'
    
    worksheet.mergeCells('E2:F2')
    worksheet.getCell('E2').value = '期初余额'
    worksheet.mergeCells('G2:H2')
    worksheet.getCell('G2').value = '本期发生额'
    worksheet.mergeCells('I2:J2')
    worksheet.getCell('I2').value = '期末余额'

    // 添加双层表头第二层
    worksheet.getCell('E3').value = '借方'
    worksheet.getCell('F3').value = '贷方'
    worksheet.getCell('G3').value = '借方'
    worksheet.getCell('H3').value = '贷方'
    worksheet.getCell('I3').value = '借方'
    worksheet.getCell('J3').value = '贷方'

    // 表头样式设定
    const headerRows = [worksheet.getRow(2), worksheet.getRow(3)]
    headerRows.forEach(row => {
      row.eachCell(cell => {
        cell.font = { bold: true }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } }
        cell.border = {
          top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'}
        }
      })
    })

    // 提取数字格式的辅助函数
    const extractNumericOpeningDebit = (row) => {
      const net = row.is_debit ? row.opening_balance : -row.opening_balance
      return net > 0 ? net : null
    }
    const extractNumericOpeningCredit = (row) => {
      const net = row.is_debit ? row.opening_balance : -row.opening_balance
      return net < 0 ? Math.abs(net) : null
    }

    let totalOpeningDebit = 0
    let totalOpeningCredit = 0

    // 填充数据行
    tableData.value.forEach(row => {
      const opDebit = extractNumericOpeningDebit(row)
      const opCredit = extractNumericOpeningCredit(row)

      if (opDebit) totalOpeningDebit += opDebit
      if (opCredit) totalOpeningCredit += opCredit

      const excelRow = worksheet.addRow([
        row.account_code,
        row.account_name,
        row.account_type,
        row.is_debit ? '借' : '贷',
        opDebit || '',
        opCredit || '',
        row.total_debit || '',
        row.total_credit || '',
        row.debit_balance || '',
        row.credit_balance || ''
      ])

      // 数据行边框设定
      excelRow.eachCell(cell => {
        cell.border = {
          top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'}
        }
      })
      // 设置部分列为居中和数字格式
      excelRow.getCell(4).alignment = { horizontal: 'center' }
      for(let i=5; i<=10; i++){
        if(excelRow.getCell(i).value !== '') {
           excelRow.getCell(i).numFmt = '#,##0.00'
        }
      }
    })

    // 添加合计行
    if (summary.value) {
      const summaryRow = worksheet.addRow([
        '合计', '', '', '',
        totalOpeningDebit || '',
        totalOpeningCredit || '',
        summary.value.total_debit || '',
        summary.value.total_credit || '',
        summary.value.total_debit_balance || '',
        summary.value.total_credit_balance || ''
      ])

      // 合并合计行前四列
      worksheet.mergeCells(`A${summaryRow.number}:D${summaryRow.number}`)
      summaryRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
      summaryRow.getCell(1).font = { bold: true }
      
      summaryRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = {
          top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'}
        }
        if(colNumber >= 5 && cell.value !== '') {
          cell.font = { bold: true }
          cell.numFmt = '#,##0.00'
        }
      })
    }

    // 调整列宽
    worksheet.columns.forEach((col, idx) => {
      if (idx === 0) col.width = 12
      else if (idx === 1) col.width = 25
      else if (idx === 2) col.width = 10
      else if (idx === 3) col.width = 10
      else col.width = 15
    })

    // 导出文件
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `试算平衡表_${periodName}_${new Date().toISOString().slice(0, 10)}.xlsx`
    link.click()
    window.URL.revokeObjectURL(url)

    ElMessage.success('导出成功')
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败: ' + error.message)
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

.header-card {
  margin-bottom: 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-section h2 {
  margin: 0 0 5px 0;
  font-size: 20px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.search-card {
  margin-bottom: 20px;
}

.search-form .el-form-item {
  margin-bottom: 0;
}

.data-card {
  margin-bottom: 20px;
}

.table-container {
  width: 100%;
}

.mb-4 {
  margin-bottom: 16px;
}

.text-gray-400 {
  color: #9ca3af;
}
</style>
