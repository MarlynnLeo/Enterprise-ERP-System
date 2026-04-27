<template>
  <div class="replacement-orders-container">
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="换货单号">
          <el-input  v-model="searchForm.replacementNo" placeholder="请输入换货单号" clearable @keyup.enter="fetchData" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchData">查询</el-button>
          <el-button @click="resetSearch">重置</el-button>
          <el-button class="advanced-search-btn" @click="showAdvancedSearch = !showAdvancedSearch">
            {{ showAdvancedSearch ? '收起筛选' : '高级搜索' }}
            <el-icon style="margin-left: 4px;"><ArrowUp v-if="showAdvancedSearch" /><ArrowDown v-else /></el-icon>
          </el-button>
        </el-form-item>
      </el-form>
      <!-- 高级搜索区域 -->
      <el-form :inline="true" :model="searchForm" class="search-form" v-show="showAdvancedSearch" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #dcdfe6;">
        <el-form-item label="不合格品编号">
          <el-input  v-model="searchForm.ncpNo" placeholder="请输入不合格品编号" clearable @keyup.enter="fetchData" />
        </el-form-item>
        <el-form-item label="供应商">
          <el-input  v-model="searchForm.supplierName" placeholder="请输入供应商名称" clearable @keyup.enter="fetchData" />
        </el-form-item>
        <el-form-item label="物料编码">
          <el-input  v-model="searchForm.materialCode" placeholder="请输入物料编码" clearable @keyup.enter="fetchData" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option v-for="item in $dict.getOptions('replacement_status')" :key="item.value" :label="item.label" :value="item.value" />
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
      </el-form>
    </el-card>

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
      <el-table :data="tableData" border stripe v-loading="loading">
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column prop="replacement_no" label="换货单号" width="140" />
        <el-table-column prop="ncp_no" label="不合格品编号" width="140" />
        <el-table-column prop="return_no" label="退货单号" width="140" />
        <el-table-column prop="supplier_name" label="供应商" width="150" show-overflow-tooltip />
        <el-table-column prop="material_code" label="物料编码" width="120" />
        <el-table-column prop="material_name" label="物料名称" width="150" show-overflow-tooltip />
        <el-table-column label="换货数量" width="100" align="right">
          <template #default="{ row }">
            {{ row.quantity }}
          </template>
        </el-table-column>
        <el-table-column label="已收货数量" width="110" align="right">
          <template #default="{ row }">
            <span :class="{ 'text-success': row.received_quantity >= row.quantity }">
              {{ row.received_quantity || 0 }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="expected_date" label="预计到货日期" width="120" />
        <el-table-column prop="actual_date" label="实际到货日期" width="120" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160" />
        <el-table-column label="操作" min-width="200" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewDetail(row)">详情</el-button>
            <el-button 
              link 
              type="success" 
              size="small" 
              @click="confirmReceipt(row)"
              v-if="row.status === 'pending' || row.status === 'partial'"
            >
              收货确认
            </el-button>
            <el-button 
              link 
              type="warning" 
              size="small" 
              @click="editOrder(row)"
              v-if="row.status === 'pending' || row.status === 'partial'"
              v-permission="'quality:replacement:update'"
            >
              编辑
            </el-button>
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
    <el-dialog v-model="receiptDialogVisible" title="换货收货确认" width="500px">
      <el-form :model="receiptForm" label-width="120px">
        <el-form-item label="换货单号">
          <el-input v-model="currentRow.replacement_no" disabled />
        </el-form-item>
        <el-form-item label="物料名称">
          <el-input v-model="currentRow.material_name" disabled />
        </el-form-item>
        <el-form-item label="换货数量">
          <el-input v-model="currentRow.quantity" disabled />
        </el-form-item>
        <el-form-item label="已收货数量">
          <el-input v-model="currentRow.received_quantity" disabled />
        </el-form-item>
        <el-form-item label="本次收货数量" required>
          <el-input-number
            v-model="receiptForm.received_quantity"
            :min="0.01"
            :max="currentRow.quantity - (currentRow.received_quantity || 0)"
            :precision="2"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="实际到货日期">
          <el-date-picker
            v-model="receiptForm.actual_date"
            type="date"
            placeholder="选择日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="receiptForm.note" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="receiptDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitReceipt">确认收货</el-button>
      </template>
    </el-dialog>

    <!-- 编辑对话框 -->
    <el-dialog v-model="editDialogVisible" title="编辑换货单" width="500px">
      <el-form :model="editForm" label-width="120px">
        <el-form-item label="换货单号">
          <el-input v-model="currentRow.replacement_no" disabled />
        </el-form-item>
        <el-form-item label="预计到货日期">
          <el-date-picker
            v-model="editForm.expected_date"
            type="date"
            placeholder="选择日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
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
    </el-dialog>

    <!-- 详情对话框 -->
    <el-dialog v-model="detailDialogVisible" title="换货单详情" width="700px">
      <el-descriptions :column="2" border v-if="detailData">
        <el-descriptions-item label="换货单号">{{ detailData.replacement_no }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(detailData.status)">
            {{ getStatusLabel(detailData.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="不合格品编号">{{ detailData.ncp_no }}</el-descriptions-item>
        <el-descriptions-item label="退货单号">{{ detailData.return_no }}</el-descriptions-item>
        <el-descriptions-item label="采购订单号">{{ detailData.purchase_order_no }}</el-descriptions-item>
        <el-descriptions-item label="检验单号">{{ detailData.inspection_no }}</el-descriptions-item>
        <el-descriptions-item label="供应商">{{ detailData.supplier_name }}</el-descriptions-item>
        <el-descriptions-item label="物料编码">{{ detailData.material_code }}</el-descriptions-item>
        <el-descriptions-item label="物料名称" :span="2">{{ detailData.material_name }}</el-descriptions-item>
        <el-descriptions-item label="换货数量">{{ detailData.quantity }}</el-descriptions-item>
        <el-descriptions-item label="已收货数量">{{ detailData.received_quantity || 0 }}</el-descriptions-item>
        <el-descriptions-item label="预计到货日期">{{ detailData.expected_date }}</el-descriptions-item>
        <el-descriptions-item label="实际到货日期">{{ detailData.actual_date || '-' }}</el-descriptions-item>
        <el-descriptions-item label="换货原因" :span="2">{{ detailData.replacement_reason }}</el-descriptions-item>
        <el-descriptions-item label="缺陷描述" :span="2">{{ detailData.defect_description }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ detailData.note || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ detailData.created_at }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ detailData.updated_at }}</el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="detailDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import api from '@/services/api'
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
const showAdvancedSearch = ref(false)

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
  received_quantity: 0,
  actual_date: '',
  note: ''
})

// 编辑表单
const editForm = reactive({
  expected_date: '',
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

    const response = await api.get('/replacement-orders', { params })
    // 后端 ResponseHandler 返回格式: { success, data, message }
    // data 可能是数组(直接列表)或对象(含list+total的分页结构)
    const resData = response.data?.data || response.data || {}
    if (Array.isArray(resData)) {
      tableData.value = resData
      pagination.total = resData.length
    } else {
      tableData.value = resData.list || (Array.isArray(resData) ? resData : [])
      pagination.total = Number(resData.total || resData.pagination?.total || 0)
    }

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
    const response = await api.get('/replacement-orders/statistics', { params })
    // 后端 ResponseHandler 返回格式: { success, data, message }
    statistics.value = response.data?.data || response.data || {}
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
    const response = await api.get(`/replacement-orders/${row.id}`)
    // 后端 ResponseHandler 返回格式: { success, data, message }
    detailData.value = response.data?.data || response.data
    detailDialogVisible.value = true
  } catch (error) {
    console.error('获取换货单详情失败:', error)
    ElMessage.error('获取换货单详情失败')
  }
}

// 收货确认
const confirmReceipt = (row) => {
  currentRow.value = row
  receiptForm.received_quantity = row.quantity - (row.received_quantity || 0)
  receiptForm.actual_date = new Date().toISOString().slice(0, 10)
  receiptForm.note = ''
  receiptDialogVisible.value = true
}

// 提交收货
const submitReceipt = async () => {
  try {
    await api.post(`/replacement-orders/${currentRow.value.id}/confirm-receipt`, receiptForm)
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
  editForm.expected_date = row.expected_date
  editForm.note = row.note
  editDialogVisible.value = true
}

// 提交编辑
const submitEdit = async () => {
  try {
    await api.put(`/replacement-orders/${currentRow.value.id}`, editForm)
    ElMessage.success('更新成功')
    editDialogVisible.value = false
    fetchData()
  } catch (error) {
    console.error('更新失败:', error)
    ElMessage.error(error.response?.data?.message || '更新失败')
  }
}

// 状态标签类型
const getStatusType = (status) => {
  const typeMap = {
    pending: 'warning',
    partial: 'primary',
    completed: 'success',
    cancelled: 'info'
  }
  return typeMap[status] || 'info'
}

// 状态标签文本
const getStatusLabel = (status) => {
  const labelMap = {
    pending: '待收货',
    partial: '部分收货',
    completed: '已完成',
    cancelled: '已取消'
  }
  return labelMap[status] || status
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
  transition: all 0.3s;
}

.stat-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.stat-card.pending {
  border-left: 4px solid #e6a23c;
}

.stat-card.partial {
  border-left: 4px solid #409eff;
}

.stat-card.completed {
  border-left: 4px solid #67c23a;
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

.text-success {
  color: var(--color-success);
  font-weight: bold;
}
</style>

