<template>
  <div class="nonconforming-container">
    <!-- 统计卡片 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.total || 0 }}</div>
        <div class="stat-label">全部不合格品</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.pending_count || 0 }}</div>
        <div class="stat-label">待处理</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.processing_count || 0 }}</div>
        <div class="stat-label">处理中</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.completed_count || 0 }}</div>
        <div class="stat-label">已完成</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.closed_count || 0 }}</div>
        <div class="stat-label">已关闭</div>
      </el-card>
    </div>

    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>不合格品</span>
        </div>
      </template>

      <!-- 搜索表单 -->
      <div class="search-container">
        <el-form :inline="true" :model="searchForm" class="search-form">
          <el-form-item>
            <el-input 
              v-model="searchKeyword"
              placeholder="请输入不合格品编号/物料名称"
              @keyup.enter="fetchData"
              clearable >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="fetchData">
              <el-icon><Search /></el-icon>查询
            </el-button>
            <el-button @click="handleReset">
              <el-icon><Refresh /></el-icon>重置
            </el-button>
            <el-button class="advanced-search-btn" @click="showAdvancedSearch = !showAdvancedSearch">
              {{ showAdvancedSearch ? '收起筛选' : '高级搜索' }}
              <el-icon style="margin-left: 4px;"><ArrowUp v-if="showAdvancedSearch" /><ArrowDown v-else /></el-icon>
            </el-button>
            <el-button type="primary" @click="handleCreate">
              <el-icon><Plus /></el-icon>新增
            </el-button>
          </el-form-item>
        </el-form>
        <!-- 高级搜索区域 -->
        <el-form :inline="true" :model="searchForm" class="search-form" v-show="showAdvancedSearch" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #dcdfe6;">
          <el-form-item label="状态">
            <el-select v-model="searchForm.status" placeholder="状态" clearable>
              <el-option label="待处理" value="pending" />
              <el-option label="处理中" value="processing" />
              <el-option label="已完成" value="completed" />
              <el-option label="已关闭" value="closed" />
            </el-select>
          </el-form-item>
          <el-form-item label="处理方式">
            <el-select v-model="searchForm.disposition" placeholder="处理方式" clearable>
              <el-option label="退货" value="return" />
              <el-option label="换货" value="replacement" />
              <el-option label="返工" value="rework" />
              <el-option label="报废" value="scrap" />
              <el-option label="让步接收" value="use_as_is" />
              <el-option label="待定" value="pending" />
            </el-select>
          </el-form-item>
          <el-form-item label="严重程度">
            <el-select v-model="searchForm.severity" placeholder="严重程度" clearable>
              <el-option label="轻微" value="minor" />
              <el-option label="严重" value="major" />
              <el-option label="致命" value="critical" />
            </el-select>
          </el-form-item>
          <el-form-item label="创建日期">
            <el-date-picker
              v-model="dateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"

            />
          </el-form-item>
        </el-form>
      </div>

      <!-- 不合格品列表 -->
      <el-table
        :data="tableData"
        border
        style="width: 100%; margin-top: 16px;"
        v-loading="loading"
      >
        <el-table-column prop="ncp_no" label="不合格品编号" width="130" show-overflow-tooltip />
        <el-table-column prop="inspection_no" label="检验单号" width="130" show-overflow-tooltip />
        <el-table-column prop="material_name" label="物料名称" width="150" show-overflow-tooltip />
        <el-table-column prop="material_code" label="物料编码" width="120" show-overflow-tooltip />
        <el-table-column prop="batch_no" label="批次号" width="200" show-overflow-tooltip />
        <el-table-column prop="quantity" label="数量" width="80" align="center">
          <template #default="scope">
            <span style="color: #F56C6C; font-weight: bold;">
              {{ Math.floor(scope.row.quantity || 0) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="unqualified_rate" label="占比" width="100" align="center">
          <template #default="{ row }">
            <span v-if="row.unqualified_rate != null">{{ row.unqualified_rate }}%</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="disposition" label="处理方式" width="110">
          <template #default="{ row }">
            {{ getDispositionLabel(row.disposition) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="110">
          <template #default="scope">
            {{ formatDate(scope.row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="270" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="handleView(row)">查看</el-button>
            <el-button size="small" type="primary" @click="handleDispose(row)" v-if="row.status === 'pending'">
              处理决策
            </el-button>
            <!-- 特采申请按钮: 处理方式为让步接收/特采，但尚未进入待审状态 -->
            <el-button 
              size="small" 
              type="warning" 
              @click="handleApplyConcession(row)" 
              v-if="(row.status === 'pending' || row.status === 'processing') && row.concession_status !== 'pending' && row.concession_status !== 'approved'"
              v-permission="'quality:nonconforming:update'">
              申请特采
            </el-button>
            <!-- 特采审批按钮: 特采待审状态 -->
            <el-button 
              size="small" 
              type="primary" 
              @click="handleApproveConcession(row)" 
              v-if="row.concession_status === 'pending'"
              v-permission="'quality:nonconforming:update'">
              特采审批
            </el-button>

            <el-button size="small" type="success" @click="handleComplete(row)" v-if="row.status === 'processing' && row.concession_status !== 'pending'">
              完成处理
            </el-button>
            <el-button v-permission="'quality:nonconforming:delete'" size="small" type="danger" @click="handleDelete(row)" v-if="row.status !== 'completed'">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="fetchData"
        @current-change="fetchData"
        style="margin-top: 20px; text-align: right;"
      />
    </el-card>

    <!-- Details Dialog -->
    <el-dialog v-model="detailsDialogVisible" title="不合格品详情" width="800px">
      <el-descriptions :column="2" border v-if="currentNcp">
        <el-descriptions-item label="不合格品编号">{{ currentNcp.ncp_no }}</el-descriptions-item>
        <el-descriptions-item label="检验单号">{{ currentNcp.inspection_no }}</el-descriptions-item>
        <el-descriptions-item label="物料编码">{{ currentNcp.material_code }}</el-descriptions-item>
        <el-descriptions-item label="物料名称">{{ currentNcp.material_name }}</el-descriptions-item>
        <el-descriptions-item label="批次号">{{ currentNcp.batch_no }}</el-descriptions-item>
        <el-descriptions-item label="数量">{{ Math.floor(currentNcp.quantity || 0) }} {{ currentNcp.unit }}</el-descriptions-item>
        <el-descriptions-item label="占比">
             {{ currentNcp.unqualified_rate != null ? currentNcp.unqualified_rate + '%' : '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentNcp.status)">
            {{ getStatusLabel(currentNcp.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="缺陷类型" :span="2">{{ currentNcp.defect_type }}</el-descriptions-item>
        <el-descriptions-item label="缺陷描述" :span="2">{{ currentNcp.defect_description }}</el-descriptions-item>
        <el-descriptions-item label="供应商">
          <el-tag v-if="currentNcp.supplier_name" type="warning">{{ currentNcp.supplier_name }}</el-tag>
          <span v-else style="color: #999;">未关联</span>
        </el-descriptions-item>
        <el-descriptions-item label="责任方">
          <el-tag v-if="currentNcp.responsible_party === 'supplier'" type="danger">供应商</el-tag>
          <el-tag v-else-if="currentNcp.responsible_party === 'internal'" type="info">内部</el-tag>
          <span v-else>{{ currentNcp.responsible_party || '-' }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="处理方式">{{ getDispositionLabel(currentNcp.disposition) }}</el-descriptions-item>
        <el-descriptions-item label="处理人">{{ currentNcp.disposition_by }}</el-descriptions-item>
        <el-descriptions-item label="当前位置" :span="2">{{ currentNcp.current_location }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>

    <!-- 特采申请 Dialog -->
    <el-dialog v-model="applyConcessionDialogVisible" title="申请特采 (让步接收)" width="500px">
      <el-form :model="applyConcessionForm" label-width="100px">
        <el-form-item label="申请理由" required>
          <el-input v-model="applyConcessionForm.reason" type="textarea" :rows="4" placeholder="请详细说明特采申请理由..."></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="applyConcessionDialogVisible = false">取消</el-button>
        <el-button v-permission="'quality:nonconforming:create'" type="primary" :loading="submitLoading" @click="submitApplyConcession">提交申请</el-button>
      </template>
    </el-dialog>

    <!-- 特采审批 Dialog -->
    <el-dialog v-model="approveConcessionDialogVisible" title="特采审批" width="500px">
        <el-descriptions border :column="1" style="margin-bottom: 20px;">
          <el-descriptions-item label="申请理由">{{ currentNcp?.concession_reason || '-' }}</el-descriptions-item>
        </el-descriptions>
        <el-form :model="approveConcessionForm" label-width="100px">
          <el-form-item label="审批结果" required>
            <el-radio-group v-model="approveConcessionForm.status">
              <el-radio value="approved">同意特采</el-radio>
              <el-radio value="rejected">驳回申请</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="approveConcessionDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="submitLoading" @click="submitApproveConcession">确认提交</el-button>
        </template>
    </el-dialog>

    <!-- Disposition Dialog -->
    <el-dialog v-model="disposeDialogVisible" title="处理决策 - 不合格品处理" width="600px">
      <el-alert
        title="请选择不合格品的处理方式"
        type="info"
        :closable="false"
        style="margin-bottom: 20px;"
      >
        <template #default>
          <div v-if="currentNcp">
            <p><strong>不合格品编号:</strong> {{ currentNcp.ncp_no }}</p>
            <p><strong>物料名称:</strong> {{ currentNcp.material_name }}</p>
            <p><strong>不合格数量:</strong> <span style="color: #F56C6C; font-weight: bold;">{{ Math.floor(currentNcp.quantity || 0) }} {{ currentNcp.unit }}</span></p>
          </div>
        </template>
      </el-alert>
      <el-form :model="disposeForm" label-width="120px">
        <el-form-item label="处理方式" required>
          <el-select v-model="disposeForm.disposition" placeholder="请选择处理方式" style="width: 100%;">
            <el-option label="🔄 退货 - 退回供应商" value="return" />
            <el-option label="🔁 换货 - 供应商换货" value="replacement" />
            <el-option label="🔧 返工 - 返工处理" value="rework" />
            <el-option label="🗑️ 报废 - 报废处理" value="scrap" />
            <el-option label="✅ 让步接收 - 降级使用" value="use_as_is" />
          </el-select>
        </el-form-item>
        <el-form-item label="处理原因" required>
          <el-input
            v-model="disposeForm.disposition_reason"
            type="textarea"
            :rows="4"
            placeholder="请详细说明处理原因..."
          />
        </el-form-item>
        <el-form-item label="责任方" required>
          <el-select v-model="disposeForm.responsible_party" placeholder="请选择责任方" style="width: 100%;">
            <el-option label="供应商" value="supplier" />
            <el-option label="内部" value="internal" />
            <el-option label="未知" value="unknown" />
          </el-select>
        </el-form-item>
        <el-form-item label="归属供应商" required v-if="disposeForm.responsible_party === 'supplier' || disposeForm.disposition === 'return' || disposeForm.disposition === 'replacement'">
          <el-select v-model="disposeForm.supplier_id" placeholder="请强制指定产生不良的供应商(闭环需要)" style="width: 100%;" filterable>
            <el-option v-for="supplier in supplierList" :key="supplier.id" :label="supplier.name" :value="supplier.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="处理人">
          <el-input v-model="disposeForm.disposition_by" placeholder="请输入处理人姓名" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="disposeDialogVisible = false">取消</el-button>
        <el-button v-permission="'quality:nonconforming:create'" type="primary" @click="submitDisposition">提交处理决策</el-button>
      </template>
    </el-dialog>

    <!-- Complete Dialog -->
    <el-dialog v-model="completeDialogVisible" title="完成处理" width="600px">
      <el-form :model="completeForm" label-width="120px">
        <el-form-item label="已处理数量">
          <el-input-number v-model="completeForm.handled_quantity" :min="0" />
        </el-form-item>
        <el-form-item label="处理成本">
          <el-input-number v-model="completeForm.handling_cost" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="completeForm.note" type="textarea" :rows="4" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="completeDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitComplete">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute } from 'vue-router'
import { Search, Refresh, Plus, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import ncpApi from '@/api/nonconformingProductApi'
import request from '@/utils/request'
import dayjs from 'dayjs'
import { formatDate } from '@/utils/helpers/dateUtils'

const route = useRoute()

const loading = ref(false)
const tableData = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(10)
const searchKeyword = ref('')
const dateRange = ref([])
const showAdvancedSearch = ref(false)

const searchForm = reactive({
  status: '',
  disposition: '',
  severity: ''
})

const statistics = ref({})

const detailsDialogVisible = ref(false)
const disposeDialogVisible = ref(false)
const completeDialogVisible = ref(false)
const applyConcessionDialogVisible = ref(false)
const approveConcessionDialogVisible = ref(false)
const currentNcp = ref(null)
const submitLoading = ref(false)

const applyConcessionForm = reactive({ reason: '' })
const approveConcessionForm = reactive({ status: 'approved' })

const disposeForm = reactive({
  disposition: '',
  disposition_reason: '',
  disposition_by: '',
  responsible_party: 'unknown',
  supplier_id: null
})

const completeForm = reactive({
  handled_quantity: 0,
  handling_cost: 0,
  note: ''
})

// Fetch data
const fetchData = async () => {
  try {
    loading.value = true
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchKeyword.value,
      ...searchForm
    }

    // 添加日期范围
    if (dateRange.value && dateRange.value.length === 2) {
      params.start_date = dayjs(dateRange.value[0]).format('YYYY-MM-DD')
      params.end_date = dayjs(dateRange.value[1]).format('YYYY-MM-DD')
    }

    const response = await ncpApi.getList(params)
    // 拦截器已解包，response.data 就是业务数据
    const responseData = response?.data
    if (responseData && (responseData.items || responseData.list)) {
      tableData.value = responseData.items || responseData.list || []
      total.value = responseData.total || 0
    } else if (Array.isArray(responseData)) {
      tableData.value = responseData
      total.value = responseData.length
    } else {
      console.warn('⚠️ Unexpected response structure:', response)
      tableData.value = []
      total.value = 0
    }
  } catch (error) {
    console.error('❌ Failed to fetch NCP list:', error)
    ElMessage.error('获取不合格品列表失败: ' + (error.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

// Fetch statistics
const fetchStatistics = async () => {
  try {
    const response = await ncpApi.getStatistics()

    // 响应拦截器返回的是 response.data,即 { success, message, data }
    if (response && response.data) {
      statistics.value = response.data
    } else if (response && typeof response === 'object') {
      // 兼容直接返回统计数据的情况
      statistics.value = response
    }
  } catch (error) {
    console.error('❌ Failed to fetch statistics:', error)
  }
}

// Handle reset
const handleReset = () => {
  searchKeyword.value = ''
  searchForm.status = ''
  searchForm.disposition = ''
  searchForm.severity = ''
  dateRange.value = []
  currentPage.value = 1
  fetchData()
}

// 格式化日期
// formatDate 已统一引用公共实现

// Handle create
const handleCreate = () => {
  ElMessage.info('请从检验单页面创建不合格品记录')
}

// Handle view
const handleView = async (row) => {
  try {
    const response = await ncpApi.getDetails(row.id)
    if (response && response.data) {
      currentNcp.value = response.data
      detailsDialogVisible.value = true
    } else if (response) {
      currentNcp.value = response
      detailsDialogVisible.value = true
    }
  } catch (error) {
    console.error('Failed to fetch NCP details:', error)
    ElMessage.error('获取详情失败')
  }
}

// Handle dispose
const handleDispose = (row) => {
  currentNcp.value = row
  // 如果已绑定供应商，可以直接带出，否则置空
  disposeForm.disposition = ''
  disposeForm.disposition_reason = ''
  disposeForm.disposition_by = ''
  disposeForm.responsible_party = row.supplier_id ? 'supplier' : 'unknown'
  disposeForm.supplier_id = row.supplier_id || null
  disposeDialogVisible.value = true
}

// Submit disposition
const submitDisposition = async () => {
  if (!disposeForm.disposition || !disposeForm.disposition_reason) {
    ElMessage.warning('请填写处理方式和处理原因')
    return
  }

  if (!disposeForm.responsible_party) {
    ElMessage.warning('请选择责任方')
    return
  }

  if ((disposeForm.responsible_party === 'supplier' || disposeForm.disposition === 'return' || disposeForm.disposition === 'replacement') && !disposeForm.supplier_id) {
    ElMessage.warning('为了后续采购对账及实物退换货的闭环，必须指定该不良品的归属供应商！')
    return
  }

  const payload = { ...disposeForm }
  if (disposeForm.supplier_id) {
    const matchedSupplier = supplierList.value.find(s => s.id === disposeForm.supplier_id)
    if (matchedSupplier) {
      payload.supplier_name = matchedSupplier.name
    }
  }

  try {
    await ncpApi.updateDisposition(currentNcp.value.id, payload)
    ElMessage.success('处理成功')
    disposeDialogVisible.value = false
    fetchData()
  } catch (error) {
    console.error('Failed to update disposition:', error)
    ElMessage.error('处理失败')
  }
}

// Handle complete
const handleComplete = (row) => {
  currentNcp.value = row
  completeForm.handled_quantity = Number(row.quantity) || 0
  completeForm.handling_cost = 0
  completeForm.note = ''
  completeDialogVisible.value = true
}

// Submit complete
const submitComplete = async () => {
  try {
    await ncpApi.completeHandling(currentNcp.value.id, completeForm)
    ElMessage.success('完成处理成功')
    completeDialogVisible.value = false
    fetchData()
  } catch (error) {
    console.error('Failed to complete handling:', error)
    ElMessage.error('完成处理失败')
  }
}

// Concession application 
const handleApplyConcession = (row) => {
  currentNcp.value = row;
  applyConcessionForm.reason = '';
  applyConcessionDialogVisible.value = true;
};

const submitApplyConcession = async () => {
  if (!applyConcessionForm.reason) {
    ElMessage.warning('请填写申请理由');
    return;
  }
  submitLoading.value = true;
  try {
    await request.post(`/quality/ncp/${currentNcp.value.id}/concession/apply`, { reason: applyConcessionForm.reason });
    ElMessage.success('特采申请提交成功');
    applyConcessionDialogVisible.value = false;
    fetchData();
  } catch(error) {
    ElMessage.error('申请失败');
  } finally {
    submitLoading.value = false;
  }
};

const handleApproveConcession = (row) => {
  currentNcp.value = row;
  approveConcessionForm.status = 'approved';
  approveConcessionDialogVisible.value = true;
};

const submitApproveConcession = async () => {
  submitLoading.value = true;
  try {
    await request.post(`/quality/ncp/${currentNcp.value.id}/concession/approve`, { status: approveConcessionForm.status });
    ElMessage.success('审批完成');
    approveConcessionDialogVisible.value = false;
    fetchData();
  } catch(error) {
    ElMessage.error('审批失败');
  } finally {
    submitLoading.value = false;
  }
};

// Handle delete
const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除这条不合格品记录吗?', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })

    await ncpApi.deleteNcp(row.id)
    ElMessage.success('删除成功')
    fetchData()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to delete NCP:', error)
      ElMessage.error('删除失败')
    }
  }
}

// Helper functions
const getSeverityType = (severity) => {
  const types = {
    minor: 'info',
    major: 'warning',
    critical: 'danger'
  }
  return types[severity] || 'info'
}

const getSeverityLabel = (severity) => {
  const labels = {
    minor: '轻微',
    major: '严重',
    critical: '致命'
  }
  return labels[severity] || severity
}

const getDispositionLabel = (disposition) => {
  const labels = {
    return: '退货',
    replacement: '换货',
    rework: '返工',
    scrap: '报废',
    use_as_is: '让步接收',
    pending: '待定'
  }
  return labels[disposition] || disposition
}

const getStatusType = (status) => {
  const types = {
    pending: 'warning',
    processing: 'primary',
    completed: 'success',
    closed: 'info'
  }
  return types[status] || 'info'
}

const getStatusLabel = (status) => {
  const labels = {
    pending: '待处理',
    processing: '处理中',
    completed: '已完成',
    closed: '已关闭'
  }
  return labels[status] || status
}

const supplierList = ref([])
const fetchSuppliers = async () => {
  try {
    const res = await request.get('/baseData/suppliers', { params: { page: 1, pageSize: 3000 } })
    supplierList.value = res.data?.items || res.data?.list || res.data || []
  } catch(error) {
    console.error('Failed to fetch suppliers:', error)
  }
}

onMounted(() => {
  // 如果URL中有inspection_id参数,则自动筛选
  if (route.query.inspection_id) {
    fetchNcpByInspection(route.query.inspection_id)
  } else {
    fetchData()
  }
  fetchStatistics()
  fetchSuppliers()
})

// 根据检验单ID获取不合格品
const fetchNcpByInspection = async (inspectionId) => {
  try {
    loading.value = true
    const response = await ncpApi.getByInspectionId(inspectionId)
    if (response && response.data) {
      const data = response.data
      tableData.value = Array.isArray(data) ? data : [data]
      total.value = tableData.value.length
      ElMessage.success(`找到 ${tableData.value.length} 条不合格品记录`)
    } else if (response) {
      tableData.value = Array.isArray(response) ? response : [response]
      total.value = tableData.value.length
      ElMessage.success(`找到 ${tableData.value.length} 条不合格品记录`)
    }
  } catch (error) {
    console.error('Failed to fetch NCP by inspection:', error)
    ElMessage.error('获取不合格品记录失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.search-container {
  margin-bottom: var(--spacing-base);
}

.search-buttons {
  display: flex;
  gap: 8px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* 使用全局样式 common-styles.css 中的 .statistics-row 和 .stat-card */

/* 表格样式优化 */
:deep(.el-table) {
  font-size: 14px;
}

:deep(.el-table th) {
  background-color: var(--color-bg-hover);
  color: var(--color-text-regular);
  font-weight: 600;
}

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 分页样式 */
.el-pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

/* 对话框样式 */
:deep(.el-dialog__header) {
  background-color: var(--color-bg-hover);
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border-light);
}

:deep(.el-dialog__title) {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

:deep(.el-descriptions) {
  margin-top: 10px;
}

:deep(.el-descriptions__label) {
  font-weight: 600;
  background-color: var(--color-bg-light);
}

:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 表单样式 */
:deep(.el-form-item__label) {
  font-weight: 500;
}

/* 按钮组样式 */
.el-button + .el-button {
  margin-left: 8px;
}

/* 响应式设计 */
@media screen and (max-width: 768px) {
  .search-container .el-col {
    margin-bottom: 10px;
  }
}
</style>

