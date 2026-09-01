<template>
  <div class="module-page scrap-records-container">
    <PageHeader title="报废记录" subtitle="报废登记与审核" />

    <FinanceQueryCard
      :model="searchForm"
      :loading="loading"
      @search="fetchData"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="物料名称">
          <el-input  v-model="searchForm.materialCode" placeholder="物料名称/编码" clearable @keyup.enter="fetchData" />
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="报废单号">
          <el-input  v-model="searchForm.scrapNo" placeholder="请输入报废单号" clearable @keyup.enter="fetchData" />
        </el-form-item>
        <el-form-item label="不合格品编号">
          <el-input  v-model="searchForm.ncpNo" placeholder="请输入不合格品编号" clearable @keyup.enter="fetchData" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option v-for="item in dictStore.getOptions('scrap_status')" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="创建日期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-label">总报废记录数</div>
            <div class="stat-value">{{ statistics.total || 0 }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card pending">
          <div class="stat-content">
            <div class="stat-label">待审批</div>
            <div class="stat-value">{{ statistics.pending || 0 }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card approved">
          <div class="stat-content">
            <div class="stat-label">已审批</div>
            <div class="stat-value">{{ statistics.approved || 0 }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card completed">
          <div class="stat-content">
            <div class="stat-label">已完成</div>
            <div class="stat-value">{{ statistics.completed || 0 }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 数据表格 -->
    <el-card class="table-card">
      <el-table class="table-row-click" :data="tableData" border stripe v-loading="loading"
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => viewDetail(row))">
        <el-table-column type="index" label="序号" width="60" />
        <el-table-column prop="scrapNo" label="报废单号" width="140" />
        <el-table-column prop="ncpNo" label="不合格品编号" width="140" />
        <el-table-column prop="materialCode" label="物料编码" width="120" />
        <el-table-column prop="materialName" label="物料名称" width="150" show-overflow-tooltip />
        <el-table-column label="报废数量" width="100">
          <template #default="{ row }">
            {{ row.quantity }}
          </template>
        </el-table-column>
        <el-table-column label="报废成本" width="120">
          <template #default="{ row }">
            {{ formatMoney(row.scrapCost) }}
          </template>
        </el-table-column>
        <el-table-column prop="scrapDate" label="报废日期" width="120" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="160" />
        <el-table-column label="操作" min-width="320" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="{ row }">
            <div class="table-actions">
              
              <el-button
                type="success"
                size="small"
                @click="approveScrap(row)"
                v-if="row.status === 'pending'"
                v-permission="'quality:scrap:approve'"
              >
                <el-icon><Check /></el-icon> 审批
              </el-button>
              <el-button
                type="warning"
                size="small"
                @click="completeScrap(row)"
                v-if="row.status === 'approved'"
                v-permission="'quality:scrap:update'"
              >
                <el-icon><Finished /></el-icon> 完成报废
              </el-button>
              <el-button
                type="info"
                size="small"
                @click="editRecord(row)"
                v-if="row.status === 'pending' || row.status === 'approved'"
                v-permission="'quality:scrap:update'"
              >
                <el-icon><Edit /></el-icon> 编辑
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.current"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="fetchData"
        @current-change="fetchData"
        class="pagination"
      />
    </el-card>

    <!-- 审批对话框 -->
    <AppDialog
      v-model="approveDialogVisible"
      title="审批报废"
      mode="form"
      width="500px"
    >
      <el-form :model="approveForm" label-width="120px">
        <el-form-item label="报废单号">
          <el-input v-model="currentRow.scrapNo" disabled />
        </el-form-item>
        <el-form-item label="物料名称">
          <el-input v-model="currentRow.materialName" disabled />
        </el-form-item>
        <el-form-item label="报废数量">
          <el-input v-model="currentRow.quantity" disabled />
        </el-form-item>
        <el-form-item label="审批结果" required>
          <el-radio-group v-model="approveForm.approved">
            <el-radio :value="true">通过</el-radio>
            <el-radio :value="false">拒绝</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="审批意见">
          <el-input v-model="approveForm.note" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="approveDialogVisible = false">取消</el-button>
        <el-button v-permission="'quality:scrap:update'" type="primary" @click="submitApprove">提交审批</el-button>
      </template>
        </AppDialog>

    <!-- 完成报废对话框 -->
    <AppDialog
      v-model="completeDialogVisible"
      title="完成报废"
      mode="form"
      width="500px"
    >
      <el-form :model="completeForm" label-width="120px">
        <el-form-item label="报废单号">
          <el-input v-model="currentRow.scrapNo" disabled />
        </el-form-item>
        <el-form-item label="物料名称">
          <el-input v-model="currentRow.materialName" disabled />
        </el-form-item>
        <el-form-item label="报废成本" required>
          <el-input-number
            v-model="completeForm.scrapCost"
            :min="0"
            :precision="2"
            class="w-full"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="completeForm.note" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="completeDialogVisible = false">取消</el-button>
        <el-button v-permission="'quality:scrap:update'" type="primary" @click="submitComplete">确认完成</el-button>
      </template>
        </AppDialog>

    <!-- 编辑对话框 -->
    <AppDialog
      v-model="editDialogVisible"
      title="编辑报废记录"
      mode="form"
      width="500px"
    >
      <el-form :model="editForm" label-width="120px">
        <el-form-item label="报废单号">
          <el-input v-model="currentRow.scrapNo" disabled />
        </el-form-item>
        <el-form-item label="报废日期">
          <el-date-picker
            v-model="editForm.scrapDate"
            type="date"
            placeholder="选择日期"
            value-format="YYYY-MM-DD"
            class="w-full"
          />
        </el-form-item>
        <el-form-item label="预计成本">
          <el-input-number
            v-model="editForm.scrapCost"
            :min="0"
            :precision="2"
            class="w-full"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button v-permission="'quality:scrap:update'" type="primary" @click="submitEdit">保存</el-button>
      </template>
        </AppDialog>

    <!-- 详情对话框 -->
    <AppDialog
      v-model="detailDialogVisible"
      title="报废记录详情"
      mode="view"
      content-width="wide"
    >
      <el-descriptions :column="2" border v-if="detailData">
        <el-descriptions-item label="报废单号">{{ detailData.scrapNo }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(detailData.status)">
            {{ getStatusLabel(detailData.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="不合格品编号">{{ detailData.ncpNo }}</el-descriptions-item>
        <el-descriptions-item label="检验单号">{{ detailData.inspectionNo }}</el-descriptions-item>
        <el-descriptions-item label="物料编码">{{ detailData.materialCode }}</el-descriptions-item>
        <el-descriptions-item label="物料名称">{{ detailData.materialName }}</el-descriptions-item>
        <el-descriptions-item label="报废数量">{{ detailData.quantity }}</el-descriptions-item>
        <el-descriptions-item label="报废成本">{{ formatMoney(detailData.scrapCost) }}</el-descriptions-item>
        <el-descriptions-item label="报废日期">{{ detailData.scrapDate }}</el-descriptions-item>
        <el-descriptions-item label="创建人">{{ detailData.createdBy }}</el-descriptions-item>
        <el-descriptions-item label="报废原因" :span="2">{{ detailData.scrapReason }}</el-descriptions-item>
        <el-descriptions-item label="缺陷描述" :span="2">{{ detailData.defectDescription }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ detailData.createdAt }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ detailData.updatedAt }}</el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="detailDialogVisible = false">关闭</el-button>
      </template>
    </AppDialog>
  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { useDictionaryStore } from '@/stores/dictionary'
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, Finished, Edit } from '@element-plus/icons-vue'
import { qualityApi } from '@/api/quality'
import { normalizePaginationData } from '@/utils/helpers/typeUtils'
import { parseResponseData } from '@/utils/responseParser'

const dictStore = useDictionaryStore()
const searchForm = reactive({
  scrapNo: '',
  ncpNo: '',
  materialCode: '',
  status: ''
})

const dateRange = ref([])
const loading = ref(false)
const tableData = ref([])
const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0
})

const formatMoney = (value) => {
  if (value === null || value === undefined || value === '') return '-'
  const amount = Number(value)
  if (Number.isNaN(amount)) return '-'
  return `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const statistics = ref({
  total: 0,
  pending: 0,
  approved: 0,
  completed: 0
})

const approveDialogVisible = ref(false)
const completeDialogVisible = ref(false)
const editDialogVisible = ref(false)
const detailDialogVisible = ref(false)

const currentRow = ref({})
const detailData = ref(null)

const approveForm = reactive({
  approved: true,
  note: ''
})

const completeForm = reactive({
  scrapCost: 0,
  note: ''
})

const editForm = reactive({
  scrapDate: '',
  scrapCost: 0
})

const fetchData = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.current,
      pageSize: pagination.pageSize,
      ...searchForm
    }

    if (dateRange.value && dateRange.value.length === 2) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }

    const response = await qualityApi.scrapRecords.getList(params)
    const pageData = normalizePaginationData(response)
    tableData.value = pageData.items
    pagination.total = pageData.total

    await fetchStatistics()
  } catch (error) {
    console.error('获取报废记录列表失败:', error)
    ElMessage.error('获取报废记录列表失败')
  } finally {
    loading.value = false
  }
}

const fetchStatistics = async () => {
  try {
    const params = {}
    if (dateRange.value && dateRange.value.length === 2) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }
    const response = await qualityApi.scrapRecords.getStatistics(params)
    // 后端 ResponseHandler 返回格式: { success, data, message }
    statistics.value = parseResponseData(response, {})
  } catch (error) {
    console.error('获取统计数据失败:', error)
  }
}

const resetSearch = () => {
  Object.keys(searchForm).forEach(key => {
    searchForm[key] = ''
  })
  dateRange.value = []
  pagination.current = 1
  fetchData()
}

const viewDetail = async (row) => {
  try {
    const response = await qualityApi.scrapRecords.getDetail(row.id)
    // 后端 ResponseHandler 返回格式: { success, data, message }
    detailData.value = parseResponseData(response)
    detailDialogVisible.value = true
  } catch (error) {
    console.error('获取报废记录详情失败:', error)
    ElMessage.error('获取报废记录详情失败')
  }
}

const approveScrap = (row) => {
  currentRow.value = row
  approveForm.approved = true
  approveForm.note = ''
  approveDialogVisible.value = true
}

const submitApprove = async () => {
  try {
    await qualityApi.scrapRecords.approve(currentRow.value.id, approveForm)
    ElMessage.success(approveForm.approved ? '审批通过' : '审批拒绝')
    approveDialogVisible.value = false
    fetchData()
  } catch (error) {
    console.error('审批失败:', error)
    ElMessage.error(error.response?.data?.message || '审批失败')
  }
}

const completeScrap = (row) => {
  currentRow.value = row
  completeForm.scrapCost = row.scrapCost ?? null
  completeForm.note = ''
  completeDialogVisible.value = true
}

const submitComplete = async () => {
  try {
    await qualityApi.scrapRecords.complete(currentRow.value.id, completeForm)
    ElMessage.success('报废完成')
    completeDialogVisible.value = false
    fetchData()
  } catch (error) {
    console.error('完成报废失败:', error)
    ElMessage.error(error.response?.data?.message || '完成报废失败')
  }
}

const editRecord = (row) => {
  currentRow.value = row
  editForm.scrapDate = row.scrapDate
  editForm.scrapCost = row.scrapCost
  editDialogVisible.value = true
}

const submitEdit = async () => {
  try {
    await qualityApi.scrapRecords.update(currentRow.value.id, editForm)
    ElMessage.success('更新成功')
    editDialogVisible.value = false
    fetchData()
  } catch (error) {
    console.error('更新失败:', error)
    ElMessage.error(error.response?.data?.message || '更新失败')
  }
}

import { getScrapStatusColor, getScrapStatusText } from '@/constants/systemConstants'

// 状态标签类型（统一调用配置中心）
const getStatusType = (status) => {
  return getScrapStatusColor(status)
}

// 状态标签文本（统一调用配置中心）
const getStatusLabel = (status) => {
  return getScrapStatusText(status)
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.scrap-records-container {
  padding: 20px;
}

.search-card {
  margin-bottom: 20px;
}

.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.stat-card:hover {
  transform: none;
  box-shadow: var(--shadow-sm);
  background: var(--color-bg-section);
}

.stat-card.pending {
  border-left: 4px solid var(--color-warning);
}

.stat-card.approved {
  border-left: 4px solid var(--color-primary);
}

.stat-card.completed {
  border-left: 4px solid var(--color-success);
}

.stat-content {
  text-align: center;
}

.stat-label {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 10px;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: var(--color-text-primary);
}

.table-card {
  margin-top: 20px;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
