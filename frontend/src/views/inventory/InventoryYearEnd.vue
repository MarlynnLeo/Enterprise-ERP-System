<template>
  <div class="year-end-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>年度库存结存</h2>
          <p class="subtitle">执行年度库存结存、冻结和查看明细</p>
        </div>
      </div>
    </el-card>

    <!-- 操作区域 -->
    <el-card class="action-card">
      <el-form :inline="true" class="search-form action-form">
        <el-form-item label="会计年度">
          <el-date-picker
            v-model="selectedYear"
            type="year"
            placeholder="选择年度"
            format="YYYY"
            value-format="YYYY"

            @change="handleYearChange"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchStatus" :loading="statusLoading">
            查询状态
          </el-button>
          <el-button type="success" @click="handleExecute" :disabled="statusInfo.isFrozen" :loading="executeLoading">
            执行结存
          </el-button>
          <el-button type="warning" @click="handleFreeze" :disabled="!statusInfo.hasRecords || statusInfo.isFrozen" :loading="freezeLoading">
            冻结结存
          </el-button>
          <el-button type="info" @click="handleExport" :disabled="!statusInfo.hasRecords">
            导出报表
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 结存状态 -->
    <div class="statistics-row" v-if="statusInfo.hasRecords">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statusInfo.totalRecords }}</div>
        <div class="stat-label">结存记录数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">
          <el-tag :type="statusInfo.isFrozen ? 'danger' : 'success'" size="large">
            {{ statusInfo.isFrozen ? '已冻结' : '未冻结' }}
          </el-tag>
        </div>
        <div class="stat-label">冻结状态</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatNumber(statusInfo.summary?.openingQuantity) }}</div>
        <div class="stat-label">期初总数量</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatNumber(statusInfo.summary?.inboundQuantity) }}</div>
        <div class="stat-label">入库总数量</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatNumber(statusInfo.summary?.outboundQuantity) }}</div>
        <div class="stat-label">出库总数量</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatNumber(statusInfo.summary?.closingQuantity) }}</div>
        <div class="stat-label">期末总数量</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(statusInfo.summary?.closingValue) }}</div>
        <div class="stat-label">期末总金额</div>
      </el-card>
    </div>

    <!-- 无记录提示 -->
    <el-card v-if="statusLoaded && !statusInfo.hasRecords" class="empty-card">
      <el-empty description="该年度尚未执行库存结存">
        <el-button type="primary" @click="handleExecute">立即执行结存</el-button>
      </el-empty>
    </el-card>

    <!-- 结存明细表格 -->
    <el-card class="data-card" v-if="statusInfo.hasRecords">
      <h3 class="card-title">{{ selectedYear }}年度结存明细</h3>
      <el-table
        :data="balanceList"
        border
        style="width: 100%"
        v-loading="listLoading"
        show-summary
        :summary-method="getYearEndSummary"
      >
        <el-table-column prop="material_code" label="物料编码" width="140" />
        <el-table-column prop="material_name" label="物料名称" width="200" />
        <el-table-column prop="specification" label="规格" width="200" />
        <el-table-column prop="unit_name" label="单位" width="60" />
        <el-table-column prop="location_name" label="仓库" width="100" />
        <el-table-column label="期初" align="center">
          <el-table-column prop="opening_quantity" label="数量" width="100">
            <template #default="scope">
              {{ formatNumber(scope.row.opening_quantity) }}
            </template>
          </el-table-column>
          <el-table-column prop="opening_value" label="金额" width="120">
            <template #default="scope">
              {{ formatCurrency(scope.row.opening_value) }}
            </template>
          </el-table-column>
        </el-table-column>
        <el-table-column label="入库" align="center">
          <el-table-column prop="inbound_quantity" label="数量" width="100">
            <template #default="scope">
              {{ formatNumber(scope.row.inbound_quantity) }}
            </template>
          </el-table-column>
          <el-table-column prop="inbound_value" label="金额" width="120">
            <template #default="scope">
              {{ formatCurrency(scope.row.inbound_value) }}
            </template>
          </el-table-column>
        </el-table-column>
        <el-table-column label="出库" align="center">
          <el-table-column prop="outbound_quantity" label="数量" width="100">
            <template #default="scope">
              {{ formatNumber(scope.row.outbound_quantity) }}
            </template>
          </el-table-column>
          <el-table-column prop="outbound_value" label="金额" width="120">
            <template #default="scope">
              {{ formatCurrency(scope.row.outbound_value) }}
            </template>
          </el-table-column>
        </el-table-column>
        <el-table-column label="期末" align="center">
          <el-table-column prop="closing_quantity" label="数量" width="100">
            <template #default="scope">
              {{ formatNumber(scope.row.closing_quantity) }}
            </template>
          </el-table-column>
          <el-table-column prop="closing_value" label="金额" width="120">
            <template #default="scope">
              {{ formatCurrency(scope.row.closing_value) }}
            </template>
          </el-table-column>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="scope">
            <el-tag :type="scope.row.is_frozen ? 'danger' : 'success'" size="small">
              {{ scope.row.is_frozen ? '冻结' : '正常' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container" v-if="pagination.total > 0">
        <el-pagination
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          :current-page="pagination.currentPage"
          :page-sizes="[20, 50, 100]"
          :page-size="pagination.pageSize"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { api as axios } from '@/services/api'
import { formatCurrency, formatNumber } from '@/utils/format'

// 页面状态
const selectedYear = ref(dayjs().format('YYYY'))
const statusLoading = ref(false)
const statusLoaded = ref(false)
const executeLoading = ref(false)
const freezeLoading = ref(false)
const listLoading = ref(false)

// 结存状态信息
const statusInfo = ref({
  hasRecords: false,
  totalRecords: 0,
  isFrozen: false,
  summary: {}
})

// 明细列表
const balanceList = ref([])
const pagination = reactive({
  currentPage: 1,
  pageSize: 20,
  total: 0
})

// 格式化函数
// formatNumber 已统一引用公共实现

// formatCurrency 已统一引用公共实现

// 查询年度结存状态
const fetchStatus = async () => {
  if (!selectedYear.value) {
    ElMessage.warning('请选择会计年度')
    return
  }
  statusLoading.value = true
  try {
    const response = await axios.get(`/inventory/year-end/status/${selectedYear.value}`)
    statusInfo.value = response.data?.data || response.data || {}
    statusLoaded.value = true

    // 如果有记录，加载明细
    if (statusInfo.value.hasRecords) {
      await fetchBalanceList()
    }
  } catch (error) {
    console.error('获取结存状态失败:', error)
    ElMessage.error('获取结存状态失败')
  } finally {
    statusLoading.value = false
  }
}

// 获取结存明细列表
const fetchBalanceList = async () => {
  listLoading.value = true
  try {
    const response = await axios.get('/inventory/year-end/list', {
      params: {
        year: selectedYear.value,
        page: pagination.currentPage,
        pageSize: pagination.pageSize
      }
    })
    const data = response.data?.data || response.data || {}
    balanceList.value = data.list || []
    pagination.total = data.total || 0
  } catch (error) {
    console.error('获取结存明细失败:', error)
    ElMessage.error('获取结存明细失败')
  } finally {
    listLoading.value = false
  }
}

// 执行年度结存
const handleExecute = async () => {
  if (!selectedYear.value) {
    ElMessage.warning('请选择会计年度')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要执行 ${selectedYear.value} 年度的库存结存吗？这将根据当年的出入库记录计算各物料的期初、收发、期末数据。`,
      '执行年度结存',
      { type: 'warning', confirmButtonText: '确认执行', cancelButtonText: '取消' }
    )

    executeLoading.value = true
    const response = await axios.post('/inventory/year-end/execute', {
      year: parseInt(selectedYear.value)
    })
    const result = response.data?.data || response.data || {}
    ElMessage.success(result.message || '年度结存执行成功')

    // 刷新状态
    await fetchStatus()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('执行年度结存失败:', error)
      ElMessage.error(error.response?.data?.message || error.message || '执行年度结存失败')
    }
  } finally {
    executeLoading.value = false
  }
}

// 冻结年度结存
const handleFreeze = async () => {
  try {
    await ElMessageBox.confirm(
      `确定要冻结 ${selectedYear.value} 年度的库存结存吗？冻结后将无法修改或重新执行。`,
      '冻结年度结存',
      { type: 'warning', confirmButtonText: '确认冻结', cancelButtonText: '取消' }
    )

    freezeLoading.value = true
    const response = await axios.post('/inventory/year-end/freeze', {
      year: parseInt(selectedYear.value)
    })
    const result = response.data?.data || response.data || {}
    ElMessage.success(result.message || '年度结存已冻结')

    // 刷新状态
    await fetchStatus()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('冻结年度结存失败:', error)
      ElMessage.error(error.response?.data?.message || error.message || '冻结年度结存失败')
    }
  } finally {
    freezeLoading.value = false
  }
}

// 导出报表
const handleExport = async () => {
  try {
    const response = await axios.get(`/inventory/year-end/export/${selectedYear.value}`)
    const data = response.data?.data || response.data || []

    if (!data || data.length === 0) {
      ElMessage.warning('没有可导出的数据')
      return
    }

    // 将数据转为 CSV 并下载
    const headers = Object.keys(data[0])
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => `"${row[h] ?? ''}"`).join(','))
    ].join('\n')

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedYear.value}年度库存结存报表.csv`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)

    ElMessage.success('导出成功')
  } catch (error) {
    console.error('导出报表失败:', error)
    ElMessage.error('导出报表失败')
  }
}

// 年度变更
const handleYearChange = () => {
  statusLoaded.value = false
  statusInfo.value = { hasRecords: false, totalRecords: 0, isFrozen: false, summary: {} }
  balanceList.value = []
  pagination.currentPage = 1
  pagination.total = 0
  if (selectedYear.value) {
    fetchStatus()
  }
}

// 分页
const handleSizeChange = (val) => {
  pagination.pageSize = val
  pagination.currentPage = 1
  fetchBalanceList()
}

const handleCurrentChange = (val) => {
  pagination.currentPage = val
  fetchBalanceList()
}

// 合计行
const getYearEndSummary = ({ columns, data }) => {
  const sums = []
  columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = '合计'
      return
    }
    const prop = column.property
    if (['opening_quantity', 'opening_value', 'inbound_quantity', 'inbound_value',
         'outbound_quantity', 'outbound_value', 'closing_quantity', 'closing_value'].includes(prop)) {
      const total = data.reduce((sum, item) => sum + (parseFloat(item[prop]) || 0), 0)
      if (prop.includes('value')) {
        sums[index] = formatCurrency(total)
      } else {
        sums[index] = formatNumber(total)
      }
    } else {
      sums[index] = ''
    }
  })
  return sums
}

// 初始化
onMounted(() => {
  fetchStatus()
})
</script>

<style scoped>
.year-end-container {
  padding: 20px;
}

.header-card {
  margin-bottom: 16px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-section h2 {
  margin: 0;
  font-size: 20px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.action-card {
  margin-bottom: 16px;
}

.statistics-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.stat-card {
  flex: 1;
  min-width: 130px;
  text-align: center;
}

.stat-value {
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.empty-card {
  margin-bottom: 16px;
}

.data-card {
  margin-bottom: 16px;
}

.card-title {
  margin: 0 0 16px;
  font-size: 16px;
  color: var(--color-text-primary);
}

.pagination-container {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
