<template>
  <div class="scrap-records-container">
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="报废单号">
          <el-input  v-model="searchForm.scrapNo" placeholder="请输入报废单号" clearable @keyup.enter="fetchData" />
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
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option v-for="item in $dict.getOptions('scrap_status')" :key="item.value" :label="item.label" :value="item.value" />
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
      <el-table :data="tableData" border stripe v-loading="loading">
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column prop="scrap_no" label="报废单号" width="140" />
        <el-table-column prop="ncp_no" label="不合格品编号" width="140" />
        <el-table-column prop="material_code" label="物料编码" width="120" />
        <el-table-column prop="material_name" label="物料名称" width="150" show-overflow-tooltip />
        <el-table-column label="报废数量" width="100" align="right">
          <template #default="{ row }">
            {{ row.quantity }}
          </template>
        </el-table-column>
        <el-table-column label="报废成本" width="120" align="right">
          <template #default="{ row }">
            {{ row.scrap_cost ? `¥${row.scrap_cost}` : '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="scrap_date" label="报废日期" width="120" />
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
              @click="approveScrap(row)"
              v-if="row.status === 'pending'"
            
              v-permission="'quality:scrap:update'">
              审批
            </el-button>
            <el-button 
              link 
              type="warning" 
              size="small" 
              @click="completeScrap(row)"
              v-if="row.status === 'approved'"
            
              v-permission="'quality:scrap:update'">
              完成报废
            </el-button>
            <el-button 
              link 
              type="info" 
              size="small" 
              @click="editRecord(row)"
              v-if="row.status === 'pending' || row.status === 'approved'"
              v-permission="'quality:scrap:update'"
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

    <!-- 审批对话框 -->
    <el-dialog v-model="approveDialogVisible" title="审批报废" width="500px">
      <el-form :model="approveForm" label-width="120px">
        <el-form-item label="报废单号">
          <el-input v-model="currentRow.scrap_no" disabled />
        </el-form-item>
        <el-form-item label="物料名称">
          <el-input v-model="currentRow.material_name" disabled />
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
        <el-button type="primary" @click="submitApprove">提交审批</el-button>
      </template>
    </el-dialog>

    <!-- 完成报废对话框 -->
    <el-dialog v-model="completeDialogVisible" title="完成报废" width="500px">
      <el-form :model="completeForm" label-width="120px">
        <el-form-item label="报废单号">
          <el-input v-model="currentRow.scrap_no" disabled />
        </el-form-item>
        <el-form-item label="物料名称">
          <el-input v-model="currentRow.material_name" disabled />
        </el-form-item>
        <el-form-item label="报废成本" required>
          <el-input-number
            v-model="completeForm.scrap_cost"
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
    <el-dialog v-model="editDialogVisible" title="编辑报废记录" width="500px">
      <el-form :model="editForm" label-width="120px">
        <el-form-item label="报废单号">
          <el-input v-model="currentRow.scrap_no" disabled />
        </el-form-item>
        <el-form-item label="报废日期">
          <el-date-picker
            v-model="editForm.scrap_date"
            type="date"
            placeholder="选择日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="预计成本">
          <el-input-number
            v-model="editForm.scrap_cost"
            :min="0"
            :precision="2"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button v-permission="'quality:scrap:update'" type="primary" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 详情对话框 -->
    <el-dialog v-model="detailDialogVisible" title="报废记录详情" width="700px">
      <el-descriptions :column="2" border v-if="detailData">
        <el-descriptions-item label="报废单号">{{ detailData.scrap_no }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(detailData.status)">
            {{ getStatusLabel(detailData.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="不合格品编号">{{ detailData.ncp_no }}</el-descriptions-item>
        <el-descriptions-item label="检验单号">{{ detailData.inspection_no }}</el-descriptions-item>
        <el-descriptions-item label="物料编码">{{ detailData.material_code }}</el-descriptions-item>
        <el-descriptions-item label="物料名称">{{ detailData.material_name }}</el-descriptions-item>
        <el-descriptions-item label="报废数量">{{ detailData.quantity }}</el-descriptions-item>
        <el-descriptions-item label="报废成本">{{ detailData.scrap_cost ? `¥${detailData.scrap_cost}` : '-' }}</el-descriptions-item>
        <el-descriptions-item label="报废日期">{{ detailData.scrap_date }}</el-descriptions-item>
        <el-descriptions-item label="创建人">{{ detailData.created_by }}</el-descriptions-item>
        <el-descriptions-item label="报废原因" :span="2">{{ detailData.scrap_reason }}</el-descriptions-item>
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
const searchForm = reactive({
  scrapNo: '',
  ncpNo: '',
  materialCode: '',
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
  scrap_cost: 0,
  note: ''
})

const editForm = reactive({
  scrap_date: '',
  scrap_cost: 0
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

    const response = await api.get('/scrap-records', { params })
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
    const response = await api.get('/scrap-records/statistics', { params })
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
    const response = await api.get(`/scrap-records/${row.id}`)
    // 后端 ResponseHandler 返回格式: { success, data, message }
    detailData.value = response.data?.data || response.data
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
    await api.post(`/scrap-records/${currentRow.value.id}/approve`, approveForm)
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
  completeForm.scrap_cost = row.scrap_cost || 0
  completeForm.note = ''
  completeDialogVisible.value = true
}

const submitComplete = async () => {
  try {
    await api.post(`/scrap-records/${currentRow.value.id}/complete`, completeForm)
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
  editForm.scrap_date = row.scrap_date
  editForm.scrap_cost = row.scrap_cost
  editDialogVisible.value = true
}

const submitEdit = async () => {
  try {
    await api.put(`/scrap-records/${currentRow.value.id}`, editForm)
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
    approved: 'primary',
    completed: 'success'
  }
  return typeMap[status] || 'info'
}

const getStatusLabel = (status) => {
  const labelMap = {
    pending: '待审批',
    approved: '已审批',
    completed: '已完成'
  }
  return labelMap[status] || status
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
  transition: all 0.3s;
}

.stat-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.stat-card.pending {
  border-left: 4px solid #e6a23c;
}

.stat-card.approved {
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
</style>

