<template>
  <div class="salary-container">
    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>薪酬核算中心</span>
          <div>
            <el-date-picker 
              v-model="queryPeriod" 
              type="month" 
              placeholder="选择计薪月份" 
              value-format="YYYY-MM" 
              @change="fetchData"
              style="margin-right: 15px; width: 140px;"
              :clearable="false"
            />
            <el-button type="warning" @click="handleCalculate" :loading="calcLoading">
              <el-icon><Refresh /></el-icon>一键自动核算
            </el-button>
            <el-button type="primary" @click="handleBatchConfirm" :loading="confirmLoading">
              <el-icon><Check /></el-icon>全部确认
            </el-button>
            <el-button type="success" @click="handleExport" :loading="exportLoading">
              <el-icon><Download /></el-icon>导出Excel
            </el-button>
          </div>
        </div>
      </template>

      <!-- 主要工资明细表 -->
      <el-table :data="tableData" border v-loading="loading" style="width: 100%" height="calc(100vh - 250px)">
        <el-table-column type="index" label="序号" width="60" fixed />
        <el-table-column prop="employee_no" label="工号" width="100" fixed show-overflow-tooltip />
        <el-table-column prop="employee_name" label="姓名" width="100" fixed />
        
        <!-- 左侧: 薪酬明细 -->
        <el-table-column label="薪酬计算明细" align="center">
          <el-table-column prop="base_salary" label="基本工资" width="100" />
          <el-table-column prop="daily_wage" label="日工资" width="80" :formatter="fmt" />
          <el-table-column prop="overtime_pay" label="加班费" width="90" />
          <el-table-column prop="position_allowance" label="职位/外补" width="90" />
          <el-table-column prop="housing_allowance" label="房补/交补" width="90" />
          <el-table-column prop="meal_allowance" label="餐补" width="90" />
          <el-table-column prop="full_attendance_bonus" label="满勤奖" width="80" />
          <el-table-column prop="leave_deduction" label="缺勤扣款" width="90" />
          <el-table-column prop="gross_salary" label="应发项" width="100" class-name="gross-col" />
          <el-table-column prop="pension" label="扣社保" width="90" />
          <el-table-column prop="housing_fund" label="扣公积金" width="90" />
          <el-table-column prop="net_salary" label="纯实发" width="110" class-name="net-col" fixed="right"/>
        </el-table-column>

        <!-- 操作 -->
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-tag v-if="row.status==='approved'" type="success">已确认</el-tag>
            <el-button v-else size="small" type="primary" @click="handleConfirm(row)">确认</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { hrApi } from '@/api/hr'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Download, Check } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const queryPeriod = ref(dayjs().format('YYYY-MM'))
const tableData = ref([])
const loading = ref(false)
const calcLoading = ref(false)
const confirmLoading = ref(false)
const exportLoading = ref(false)

const fetchData = async () => {
  if (!queryPeriod.value) return;
  try {
    loading.value = true
    const res = await hrApi.getSalaryRecords(queryPeriod.value)
    tableData.value = res.data.data || res.data || []
  } catch (error) {
    ElMessage.error(error.message || '获取薪资数据失败')
  } finally {
    loading.value = false
  }
}

const handleCalculate = async () => {
  try {
    await ElMessageBox.confirm(
      `确定要核算 ${queryPeriod.value} 月份工资吗？(将覆盖该月所有草稿状态薪资单，已确认的不受影响)`,
      '提示',
      { type: 'warning' }
    )
    
    calcLoading.value = true
    const res = await hrApi.calculateSalary(queryPeriod.value)
    ElMessage.success(res.data.message || '核算成功')
    await fetchData()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.message || error.message || '核算失败')
    }
  } finally {
    calcLoading.value = false
  }
}

const handleConfirm = async (row) => {
  try {
    await hrApi.confirmSalary(row.id)
    ElMessage.success('账单已确认')
    row.status = 'approved'
  } catch {
    ElMessage.error('确认失败')
  }
}

// 批量确认当月所有草稿工资单
const handleBatchConfirm = async () => {
  try {
    const draftCount = tableData.value.filter(r => r.status !== 'approved').length
    if (draftCount === 0) return ElMessage.info('当前月份没有待确认的工资单')
    await ElMessageBox.confirm(
      `确定要批量确认 ${queryPeriod.value} 月的 ${draftCount} 条草稿工资单吗？确认后不可重新核算。`,
      '批量确认', { type: 'warning' }
    )
    confirmLoading.value = true
    const res = await hrApi.batchConfirmSalary(queryPeriod.value)
    ElMessage.success(res.data.message || '批量确认成功')
    await fetchData()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error.response?.data?.message || '批量确认失败')
  } finally {
    confirmLoading.value = false
  }
}

// 导出薪酬 Excel
const handleExport = async () => {
  try {
    if (tableData.value.length === 0) return ElMessage.warning('当前无数据可导出')
    exportLoading.value = true
    const res = await hrApi.exportSalary(queryPeriod.value)
    // 创建下载链接
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `薪酬表_${queryPeriod.value}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch {
    ElMessage.error('导出失败')
  } finally {
    exportLoading.value = false
  }
}

const fmt = (row, column, cellValue) => {
  return Number(cellValue).toFixed(2)
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.gross-col { background-color: #fdf6ec !important; font-weight: bold; }
.net-col { background-color: #f0f9eb !important; font-weight: bold; color: var(--color-success); }
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>