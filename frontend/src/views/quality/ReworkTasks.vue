<template>
  <div class="rework-tasks-container">
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="返工单号">
          <el-input  v-model="searchForm.reworkNo" placeholder="请输入返工单号" clearable @keyup.enter="fetchData" />
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
        <el-form-item label="物料编码">
          <el-input  v-model="searchForm.materialCode" placeholder="请输入物料编码" clearable @keyup.enter="fetchData" />
        </el-form-item>
        <el-form-item label="负责人">
          <el-input  v-model="searchForm.assignedTo" placeholder="请输入负责人" clearable @keyup.enter="fetchData" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option v-for="item in $dict.getOptions('rework_status')" :key="item.value" :label="item.label" :value="item.value" />
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
            <div class="stat-label">总返工任务数</div>
            <div class="stat-value">{{ statistics.total || 0 }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card pending">
          <div class="stat-content">
            <div class="stat-label">待处理</div>
            <div class="stat-value">{{ statistics.pending || 0 }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card in-progress">
          <div class="stat-content">
            <div class="stat-label">进行中</div>
            <div class="stat-value">{{ statistics.in_progress || 0 }}</div>
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
        <el-table-column prop="rework_no" label="返工单号" width="140" />
        <el-table-column prop="ncp_no" label="不合格品编号" width="140" />
        <el-table-column prop="material_code" label="物料编码" width="120" />
        <el-table-column prop="material_name" label="物料名称" width="150" show-overflow-tooltip />
        <el-table-column label="返工数量" width="100" align="right">
          <template #default="{ row }">
            {{ row.quantity }}
          </template>
        </el-table-column>
        <el-table-column prop="assigned_to" label="负责人" width="100" />
        <el-table-column prop="planned_date" label="计划完成日期" width="120" />
        <el-table-column prop="actual_date" label="实际完成日期" width="120" />
        <el-table-column label="返工成本" width="100" align="right">
          <template #default="{ row }">
            {{ row.rework_cost ? `¥${row.rework_cost}` : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160" />
        <el-table-column label="操作" min-width="250" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewDetail(row)">详情</el-button>
            <el-button 
              link 
              type="success" 
              size="small" 
              @click="assignTask(row)"
              v-if="row.status === 'pending'"
            >
              分配任务
            </el-button>
            <el-button 
              link 
              type="warning" 
              size="small" 
              @click="completeTask(row)"
              v-if="row.status === 'in_progress'"
            >
              完成返工
            </el-button>
            <el-button 
              link 
              type="info" 
              size="small" 
              @click="editTask(row)"
              v-if="row.status === 'pending' || row.status === 'in_progress'"
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

    <!-- 分配任务对话框 -->
    <el-dialog v-model="assignDialogVisible" title="分配返工任务" width="500px">
      <el-form :model="assignForm" label-width="120px">
        <el-form-item label="返工单号">
          <el-input v-model="currentRow.rework_no" disabled />
        </el-form-item>
        <el-form-item label="物料名称">
          <el-input v-model="currentRow.material_name" disabled />
        </el-form-item>
        <el-form-item label="返工数量">
          <el-input v-model="currentRow.quantity" disabled />
        </el-form-item>
        <el-form-item label="负责人" required>
          <el-input v-model="assignForm.assigned_to" placeholder="请输入负责人姓名" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitAssign">确认分配</el-button>
      </template>
    </el-dialog>

    <!-- 完成返工对话框 -->
    <el-dialog v-model="completeDialogVisible" title="完成返工任务" width="500px">
      <el-form :model="completeForm" label-width="120px">
        <el-form-item label="返工单号">
          <el-input v-model="currentRow.rework_no" disabled />
        </el-form-item>
        <el-form-item label="物料名称">
          <el-input v-model="currentRow.material_name" disabled />
        </el-form-item>
        <el-form-item label="实际完成日期">
          <el-date-picker
            v-model="completeForm.actual_date"
            type="date"
            placeholder="选择日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="返工成本">
          <el-input-number
            v-model="completeForm.rework_cost"
            :min="0"
            :precision="2"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="completeForm.note" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="completeDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitComplete">确认完成</el-button>
      </template>
    </el-dialog>

    <!-- 编辑对话框 -->
    <el-dialog v-model="editDialogVisible" title="编辑返工任务" width="500px">
      <el-form :model="editForm" label-width="120px">
        <el-form-item label="返工单号">
          <el-input v-model="currentRow.rework_no" disabled />
        </el-form-item>
        <el-form-item label="返工说明">
          <el-input v-model="editForm.rework_instructions" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="计划完成日期">
          <el-date-picker
            v-model="editForm.planned_date"
            type="date"
            placeholder="选择日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="预计成本">
          <el-input-number
            v-model="editForm.rework_cost"
            :min="0"
            :precision="2"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button v-permission="'quality:reworktasks:update'" type="primary" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 详情对话框 -->
    <el-dialog v-model="detailDialogVisible" title="返工任务详情" width="700px">
      <el-descriptions :column="2" border v-if="detailData">
        <el-descriptions-item label="返工单号">{{ detailData.rework_no }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(detailData.status)">
            {{ getStatusLabel(detailData.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="不合格品编号">{{ detailData.ncp_no }}</el-descriptions-item>
        <el-descriptions-item label="检验单号">{{ detailData.inspection_no }}</el-descriptions-item>
        <el-descriptions-item label="物料编码">{{ detailData.material_code }}</el-descriptions-item>
        <el-descriptions-item label="物料名称">{{ detailData.material_name }}</el-descriptions-item>
        <el-descriptions-item label="返工数量">{{ detailData.quantity }}</el-descriptions-item>
        <el-descriptions-item label="负责人">{{ detailData.assigned_to || '-' }}</el-descriptions-item>
        <el-descriptions-item label="计划完成日期">{{ detailData.planned_date }}</el-descriptions-item>
        <el-descriptions-item label="实际完成日期">{{ detailData.actual_date || '-' }}</el-descriptions-item>
        <el-descriptions-item label="返工成本">{{ detailData.rework_cost ? `¥${detailData.rework_cost}` : '-' }}</el-descriptions-item>
        <el-descriptions-item label="返工原因" :span="2">{{ detailData.rework_reason }}</el-descriptions-item>
        <el-descriptions-item label="返工说明" :span="2">{{ detailData.rework_instructions || '-' }}</el-descriptions-item>
        <el-descriptions-item label="缺陷描述" :span="2">{{ detailData.defect_description }}</el-descriptions-item>
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
import { useAuthStore } from '@/stores/auth'

// 权限store
const authStore = useAuthStore()

const searchForm = reactive({
  reworkNo: '',
  ncpNo: '',
  materialCode: '',
  assignedTo: '',
  status: ''
})

const dateRange = ref([])
const loading = ref(false)
const tableData = ref([])
const showAdvancedSearch = ref(false)

const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0
})

const statistics = ref({
  total: 0,
  pending: 0,
  in_progress: 0,
  completed: 0,
  cancelled: 0
})

const assignDialogVisible = ref(false)
const completeDialogVisible = ref(false)
const editDialogVisible = ref(false)
const detailDialogVisible = ref(false)

const currentRow = ref({})
const detailData = ref(null)

const assignForm = reactive({
  assigned_to: ''
})

const completeForm = reactive({
  actual_date: '',
  rework_cost: 0,
  note: ''
})

const editForm = reactive({
  rework_instructions: '',
  planned_date: '',
  rework_cost: 0
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

    const response = await api.get('/rework-tasks', { params })
    // 后端 ResponseHandler 返回格式: { success, data, message }
    const resData = response.data?.data || response.data || {}
    if (Array.isArray(resData)) {
      tableData.value = resData
      pagination.total = resData.length
    } else {
      tableData.value = resData.list || (Array.isArray(resData) ? resData : [])
      pagination.total = Number(resData.total || resData.pagination?.total || 0)
    }

    await fetchStatistics()
  } catch (error) {
    console.error('获取返工任务列表失败:', error)
    ElMessage.error('获取返工任务列表失败')
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
    const response = await api.get('/rework-tasks/statistics', { params })
    // 后端 ResponseHandler 返回格式: { success, data, message }
    statistics.value = response.data?.data || response.data || {}
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
    const response = await api.get(`/rework-tasks/${row.id}`)
    // 后端 ResponseHandler 返回格式: { success, data, message }
    detailData.value = response.data?.data || response.data
    detailDialogVisible.value = true
  } catch (error) {
    console.error('获取返工任务详情失败:', error)
    ElMessage.error('获取返工任务详情失败')
  }
}

const assignTask = (row) => {
  currentRow.value = row
  assignForm.assigned_to = ''
  assignDialogVisible.value = true
}

const submitAssign = async () => {
  if (!assignForm.assigned_to) {
    ElMessage.warning('请输入负责人')
    return
  }
  try {
    await api.post(`/rework-tasks/${currentRow.value.id}/assign`, assignForm)
    ElMessage.success('任务分配成功')
    assignDialogVisible.value = false
    fetchData()
  } catch (error) {
    console.error('任务分配失败:', error)
    ElMessage.error(error.response?.data?.message || '任务分配失败')
  }
}

const completeTask = (row) => {
  currentRow.value = row
  completeForm.actual_date = new Date().toISOString().slice(0, 10)
  completeForm.rework_cost = row.rework_cost || 0
  completeForm.note = ''
  completeDialogVisible.value = true
}

const submitComplete = async () => {
  try {
    await api.post(`/rework-tasks/${currentRow.value.id}/complete`, completeForm)
    ElMessage.success('返工任务完成')
    completeDialogVisible.value = false
    fetchData()
  } catch (error) {
    console.error('完成返工任务失败:', error)
    ElMessage.error(error.response?.data?.message || '完成返工任务失败')
  }
}

const editTask = (row) => {
  currentRow.value = row
  editForm.rework_instructions = row.rework_instructions
  editForm.planned_date = row.planned_date
  editForm.rework_cost = row.rework_cost
  editDialogVisible.value = true
}

const submitEdit = async () => {
  try {
    await api.put(`/rework-tasks/${currentRow.value.id}`, editForm)
    ElMessage.success('更新成功')
    editDialogVisible.value = false
    fetchData()
  } catch (error) {
    console.error('更新失败:', error)
    ElMessage.error(error.response?.data?.message || '更新失败')
  }
}

const getStatusType = (status) => {
  const typeMap = {
    pending: 'warning',
    in_progress: 'primary',
    completed: 'success',
    cancelled: 'info'
  }
  return typeMap[status] || 'info'
}

const getStatusLabel = (status) => {
  const labelMap = {
    pending: '待处理',
    in_progress: '进行中',
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
.rework-tasks-container {
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

.stat-card.in-progress {
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
  color: #909399;
  margin-bottom: 10px;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
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

