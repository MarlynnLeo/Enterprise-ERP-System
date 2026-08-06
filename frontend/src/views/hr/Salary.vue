<template>
  <div class="module-page salary-container">
    <PageHeader title="薪酬核算中心" subtitle="按月核算、确认与导出薪资">
      <template #actions>
        <el-date-picker
          v-model="queryPeriod"
          type="month"
          placeholder="选择计薪月份"
          value-format="YYYY-MM"
          @change="fetchData"
          class="form-control-140-mr"
          :clearable="false"
        />
        <el-button type="warning" v-permission="'hr:salary:update'" @click="handleCalculate" :loading="calcLoading">
          <el-icon><Refresh /></el-icon>一键自动核算
        </el-button>
        <el-button type="primary" v-permission="'hr:salary:update'" @click="handleBatchConfirm" :loading="confirmLoading">
          <el-icon><Check /></el-icon>全部确认
        </el-button>
        <el-button type="success" v-permission="'hr:salary:view'" @click="handleExport" :loading="exportLoading">
          <el-icon><Download /></el-icon>导出Excel
        </el-button>
      </template>
    </PageHeader>

    <el-card class="data-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>工资明细</span>
        </div>
      </template>

      <!-- 主要工资明细表 -->
      <el-table :data="tableData" border v-loading="loading" class="w-full" height="calc(100vh - 250px)">
        <el-table-column type="index" label="序号" width="60" fixed />
        <el-table-column prop="employeeNo" label="工号" width="100" fixed show-overflow-tooltip />
        <el-table-column prop="employeeName" label="姓名" width="100" fixed />

        <!-- 左侧: 薪酬明细 -->
        <el-table-column label="薪酬计算明细">
          <el-table-column prop="baseSalary" label="基本工资" width="100" />
          <el-table-column prop="dailyWage" label="日工资" width="80" :formatter="fmt" />
          <el-table-column prop="overtimePay" label="加班费" width="90" />
          <el-table-column prop="positionAllowance" label="职位/外补" width="90" />
          <el-table-column prop="housingAllowance" label="房补/交补" width="90" />
          <el-table-column prop="mealAllowance" label="餐补" width="90" />
          <el-table-column prop="fullAttendanceBonus" label="满勤奖" width="80" />
          <el-table-column prop="leaveDeduction" label="缺勤扣款" width="90" />
          <el-table-column prop="grossSalary" label="应发项" width="100" class-name="gross-col" />
          <el-table-column prop="pension" label="扣社保" width="90" />
          <el-table-column prop="housingFund" label="扣公积金" width="90" />
          <el-table-column prop="netSalary" label="纯实发" width="110" class-name="net-col" fixed="right"/>
        </el-table-column>

        <!-- 操作 -->
        <el-table-column label="操作" min-width="100" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <el-tag v-if="row.status==='approved'" type="success">已确认</el-tag>
            <el-button v-else size="small" type="primary" v-permission="'hr:salary:update'" @click="handleConfirm(row)">确认</el-button>
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
import { parseResponseData } from '@/utils/responseParser'

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
    tableData.value = parseResponseData(res, [])
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
.gross-col { background-color: var(--ds-yellow-bg) !important; font-weight: bold; }
.net-col { background-color: var(--ds-green-bg) !important; font-weight: bold; color: var(--color-success); }
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
