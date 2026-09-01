<template>
  <div class="module-page replacement-orders-container">
    <PageHeader title="换货单" subtitle="不合格换货业务处理" />

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
        <el-form-item label="换货单号">
          <el-input  v-model="searchForm.replacementNo" placeholder="请输入换货单号" clearable @keyup.enter="fetchData" />
        </el-form-item>
        <el-form-item label="不合格品编号">
          <el-input  v-model="searchForm.ncpNo" placeholder="请输入不合格品编号" clearable @keyup.enter="fetchData" />
        </el-form-item>
        <el-form-item label="供应商">
          <el-input  v-model="searchForm.supplierName" placeholder="请输入供应商名称" clearable @keyup.enter="fetchData" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option v-for="item in dictStore.getOptions('replacement_status')" :key="item.value" :label="item.label" :value="item.value" />
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
            <div class="stat-label">总换货单数</div>
            <div class="stat-value">{{ statistics.total || 0 }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card pending">
          <div class="stat-content">
            <div class="stat-label">待收货</div>
            <div class="stat-value">{{ statistics.pending || 0 }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card partial">
          <div class="stat-content">
            <div class="stat-label">部分收货</div>
            <div class="stat-value">{{ statistics.partial || 0 }}</div>
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
        <el-table-column prop="replacementNo" label="换货单号" width="140" />
        <el-table-column prop="ncpNo" label="不合格品编号" width="140" />
        <el-table-column prop="returnNo" label="退货单号" width="140" />
        <el-table-column prop="supplierName" label="供应商" width="150" show-overflow-tooltip />
        <el-table-column prop="materialCode" label="物料编码" width="120" />
        <el-table-column prop="materialName" label="物料名称" width="150" show-overflow-tooltip />
        <el-table-column label="换货数量" width="100">
          <template #default="{ row }">
            {{ row.quantity }}
          </template>
        </el-table-column>
        <el-table-column label="已收货数量" width="110">
          <template #default="{ row }">
            <span :class="{ 'text-success': row.receivedQuantity >= row.quantity }">
              {{ row.receivedQuantity || 0 }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="expectedDate" label="预计到货日期" width="120" />
        <el-table-column prop="actualDate" label="实际到货日期" width="120" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="160" />
        <el-table-column label="操作" min-width="300" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="{ row }">
            <div class="table-actions">
              
              <el-button
                type="success"
                size="small"
                @click="confirmReceipt(row)"
                v-if="row.status === 'pending' || row.status === 'partial'"
                v-permission="'quality:replacement:update'"
              >
                <el-icon><Check /></el-icon> 收货确认
              </el-button>
              <el-button
                type="warning"
                size="small"
                @click="editOrder(row)"
                v-if="row.status === 'pending' || row.status === 'partial'"
                v-permission="'quality:replacement:update'"
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

    <!-- 收货确认对话框 -->
    <AppDialog
      v-model="receiptDialogVisible"
      title="换货收货确认"
      mode="form"
      width="500px"
    >
      <el-form :model="receiptForm" label-width="120px">
        <el-form-item label="换货单号">
          <el-input v-model="currentRow.replacementNo" disabled />
        </el-form-item>
        <el-form-item label="物料名称">
          <el-input v-model="currentRow.materialName" disabled />
        </el-form-item>
        <el-form-item label="换货数量">
          <el-input v-model="currentRow.quantity" disabled />
        </el-form-item>
        <el-form-item label="已收货数量">
          <el-input v-model="currentRow.receivedQuantity" disabled />
        </el-form-item>
        <el-form-item label="本次收货数量" required>
          <el-input-number
            v-model="receiptForm.receivedQuantity"
            :min="0.01"
            :max="currentRow.quantity - (currentRow.receivedQuantity || 0)"
            :precision="2"
            class="w-full"
          />
        </el-form-item>
        <el-form-item label="实际到货日期">
          <el-date-picker
            v-model="receiptForm.actualDate"
            type="date"
            placeholder="选择日期"
            value-format="YYYY-MM-DD"
            class="w-full"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="receiptForm.note" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="receiptDialogVisible = false">取消</el-button>
        <el-button v-permission="'quality:replacement:update'" type="primary" @click="submitReceipt">确认收货</el-button>
      </template>
        </AppDialog>

    <!-- 编辑对话框 -->
    <AppDialog
      v-model="editDialogVisible"
      title="编辑换货单"
      mode="form"
      width="500px"
    >
      <el-form :model="editForm" label-width="120px">
        <el-form-item label="换货单号">
          <el-input v-model="currentRow.replacementNo" disabled />
        </el-form-item>
        <el-form-item label="预计到货日期">
          <el-date-picker
            v-model="editForm.expectedDate"
            type="date"
            placeholder="选择日期"
            value-format="YYYY-MM-DD"
            class="w-full"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="editForm.note" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button v-permission="'quality:replacement:update'" type="primary" @click="submitEdit">保存</el-button>
      </template>
        </AppDialog>

    <!-- 详情对话框 -->
    <AppDialog
      v-model="detailDialogVisible"
      title="换货单详情"
      mode="view"
      content-width="wide"
    >
      <el-descriptions :column="2" border v-if="detailData">
        <el-descriptions-item label="换货单号">{{ detailData.replacementNo }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(detailData.status)">
            {{ getStatusLabel(detailData.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="不合格品编号">{{ detailData.ncpNo }}</el-descriptions-item>
        <el-descriptions-item label="退货单号">{{ detailData.returnNo }}</el-descriptions-item>
        <el-descriptions-item label="采购订单号">{{ detailData.purchaseOrderNo }}</el-descriptions-item>
        <el-descriptions-item label="检验单号">{{ detailData.inspectionNo }}</el-descriptions-item>
        <el-descriptions-item label="供应商">{{ detailData.supplierName }}</el-descriptions-item>
        <el-descriptions-item label="物料编码">{{ detailData.materialCode }}</el-descriptions-item>
        <el-descriptions-item label="物料名称" :span="2">{{ detailData.materialName }}</el-descriptions-item>
        <el-descriptions-item label="换货数量">{{ detailData.quantity }}</el-descriptions-item>
        <el-descriptions-item label="已收货数量">{{ detailData.receivedQuantity || 0 }}</el-descriptions-item>
        <el-descriptions-item label="预计到货日期">{{ detailData.expectedDate }}</el-descriptions-item>
        <el-descriptions-item label="实际到货日期">{{ detailData.actualDate || '-' }}</el-descriptions-item>
        <el-descriptions-item label="换货原因" :span="2">{{ detailData.replacementReason }}</el-descriptions-item>
        <el-descriptions-item label="缺陷描述" :span="2">{{ detailData.defectDescription }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ detailData.note || '-' }}</el-descriptions-item>
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
import { formatLocalDate } from '@/utils/format';
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, Edit } from '@element-plus/icons-vue'
import { replacementOrderApi } from '@/api/afterSales'
import { normalizePaginationData } from '@/utils/helpers/typeUtils'
import { parseResponseData } from '@/utils/responseParser'

const dictStore = useDictionaryStore()
// 搜索表单
const searchForm = reactive({
  replacementNo: '',
  ncpNo: '',
  supplierName: '',
  materialCode: '',
  status: ''
})

const dateRange = ref([])
const loading = ref(false)
const tableData = ref([])
// 分页
const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0
})

// 统计数据
const statistics = ref({
  total: 0,
  pending: 0,
  partial: 0,
  completed: 0,
  cancelled: 0
})

// 对话框
const receiptDialogVisible = ref(false)
const editDialogVisible = ref(false)
const detailDialogVisible = ref(false)

// 当前行数据
const currentRow = ref({})
const detailData = ref(null)

// 收货表单
const receiptForm = reactive({
  receivedQuantity: 0,
  actualDate: '',
  note: ''
})

// 编辑表单
const editForm = reactive({
  expectedDate: '',
  note: ''
})

// 获取数据
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

    const response = await replacementOrderApi.getReplacementOrders(params)
    const pageData = normalizePaginationData(response)
    tableData.value = pageData.items
    pagination.total = pageData.total

    // 获取统计数据
    await fetchStatistics()
  } catch (error) {
    console.error('获取换货单列表失败:', error)
    ElMessage.error('获取换货单列表失败')
  } finally {
    loading.value = false
  }
}

// 获取统计数据
const fetchStatistics = async () => {
  try {
    const params = {}
    if (dateRange.value && dateRange.value.length === 2) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }
    const response = await replacementOrderApi.getStatistics(params)
    // 后端 ResponseHandler 返回格式: { success, data, message }
    statistics.value = parseResponseData(response, {})
  } catch (error) {
    console.error('获取统计数据失败:', error)
  }
}

// 重置搜索
const resetSearch = () => {
  Object.keys(searchForm).forEach(key => {
    searchForm[key] = ''
  })
  dateRange.value = []
  pagination.current = 1
  fetchData()
}

// 查看详情
const viewDetail = async (row) => {
  try {
    const response = await replacementOrderApi.getReplacementOrderById(row.id)
    // 后端 ResponseHandler 返回格式: { success, data, message }
    detailData.value = parseResponseData(response)
    detailDialogVisible.value = true
  } catch (error) {
    console.error('获取换货单详情失败:', error)
    ElMessage.error('获取换货单详情失败')
  }
}

// 收货确认
const confirmReceipt = (row) => {
  currentRow.value = row
  receiptForm.receivedQuantity = row.quantity - (row.receivedQuantity || 0)
  receiptForm.actualDate = formatLocalDate(new Date())
  receiptForm.note = ''
  receiptDialogVisible.value = true
}

// 提交收货
const submitReceipt = async () => {
  try {
    await replacementOrderApi.confirmReceipt(currentRow.value.id, receiptForm)
    ElMessage.success('收货确认成功')
    receiptDialogVisible.value = false
    fetchData()
  } catch (error) {
    console.error('收货确认失败:', error)
    ElMessage.error(error.response?.data?.message || '收货确认失败')
  }
}

// 编辑换货单
const editOrder = (row) => {
  currentRow.value = row
  editForm.expectedDate = row.expectedDate
  editForm.note = row.note
  editDialogVisible.value = true
}

// 提交编辑
const submitEdit = async () => {
  try {
    await replacementOrderApi.updateReplacementOrder(currentRow.value.id, editForm)
    ElMessage.success('更新成功')
    editDialogVisible.value = false
    fetchData()
  } catch (error) {
    console.error('更新失败:', error)
    ElMessage.error(error.response?.data?.message || '更新失败')
  }
}

import { getReplacementStatusColor, getReplacementStatusText } from '@/constants/systemConstants'

// 状态标签类型（统一调用配置中心）
const getStatusType = (status) => {
  return getReplacementStatusColor(status)
}

// 状态标签文本（统一调用配置中心）
const getStatusLabel = (status) => {
  return getReplacementStatusText(status)
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.replacement-orders-container {
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

.stat-card.partial {
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
