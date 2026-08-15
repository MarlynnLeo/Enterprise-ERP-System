<template>
  <div class="module-page nonconforming-container">
    <PageHeader title="不合格品" subtitle="不合格品登记、处置与闭环" />

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
    <el-card class="data-card">

      <!-- 搜索表单 -->
      <div class="search-container">
        <FinanceQueryCard
          :model="searchForm"
          :loading="loading"
          @search="fetchData"
          @reset="handleReset"
        >
          <template #basic>
          <el-form-item label="物料名称">
            <el-input
              v-model="searchKeyword"
              placeholder="物料名称"
              @keyup.enter="fetchData"
              clearable
            />
          </el-form-item>
          </template>
          <template #advanced>
          <el-form-item label="不合格品编号">
            <el-input v-model="searchForm.ncpNo" placeholder="不合格品编号" clearable @keyup.enter="fetchData" />
          </el-form-item>
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
          </template>
          <template #actions>
            <el-button v-permission="'quality:nonconforming:create'" type="primary" @click="handleCreate">
              <el-icon><Plus /></el-icon>新增
            </el-button>
          </template>
        </FinanceQueryCard>
      </div>
      <!-- 不合格品列表 -->
      <el-table
        :data="tableData"
        border
        class="table-row-click w-full mt-md"
        v-loading="loading"
      
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleView(row))">
        <el-table-column prop="ncpNo" label="不合格品编号" width="130" show-overflow-tooltip />
        <el-table-column prop="inspectionNo" label="检验单号" width="130" show-overflow-tooltip />
        <el-table-column prop="materialName" label="物料名称" width="150" show-overflow-tooltip />
        <el-table-column prop="materialCode" label="物料编码" width="120" show-overflow-tooltip />
        <el-table-column prop="batchNo" label="批次号" width="200" show-overflow-tooltip />
        <el-table-column prop="quantity" label="数量" width="80">
          <template #default="scope">
            <span class="text-danger font-weight-700">
              {{ Math.floor(scope.row.quantity || 0) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="unqualifiedRate" label="占比" width="100">
          <template #default="{ row }">
            <span v-if="row.unqualifiedRate != null">{{ row.unqualifiedRate }}%</span>
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
        <el-table-column prop="createdAt" label="创建时间" width="110">
          <template #default="scope">
            {{ formatDate(scope.row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="360" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="{ row }">
            
            <el-button v-permission="'quality:nonconforming:update'" size="small" type="primary" @click="handleDispose(row)" v-if="row.status === 'pending'">
              处理决策
            </el-button>
            <!-- 特采申请按钮: 处理方式为让步接收/特采，但尚未进入待审状态 -->
            <el-button
              size="small"
              type="warning"
              @click="handleApplyConcession(row)"
              v-if="(row.status === 'pending' || row.status === 'processing') && row.concessionStatus !== 'pending' && row.concessionStatus !== 'approved'"
              v-permission="'quality:nonconforming:update'">
              申请特采
            </el-button>
            <!-- 特采审批按钮: 特采待审状态 -->
            <el-button
              size="small"
              type="primary"
              @click="handleApproveConcession(row)"
              v-if="row.concessionStatus === 'pending'"
              v-permission="'quality:nonconforming:approve'">
              特采审批
            </el-button>
            <el-button v-permission="'quality:nonconforming:update'" size="small" type="success" @click="handleComplete(row)" v-if="row.status === 'processing' && row.concessionStatus !== 'pending'">
              完成处理
            </el-button>
            <el-button v-permission="'quality:nonconforming:delete'" size="small" type="danger" @click="handleDelete(row)" v-if="row.status === 'pending'">删除</el-button>
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
        class="mt-20 text-right"
      />
    </el-card>
    <!-- Details Dialog -->
    <AppDialog
      v-model="detailsDialogVisible"
      title="不合格品详情"
      mode="view"
      content-width="wide"
    >
      <el-descriptions :column="2" border v-if="currentNcp">
        <el-descriptions-item label="不合格品编号">{{ currentNcp.ncpNo }}</el-descriptions-item>
        <el-descriptions-item label="检验单号">{{ currentNcp.inspectionNo }}</el-descriptions-item>
        <el-descriptions-item label="物料编码">{{ currentNcp.materialCode }}</el-descriptions-item>
        <el-descriptions-item label="物料名称">{{ currentNcp.materialName }}</el-descriptions-item>
        <el-descriptions-item label="批次号">{{ currentNcp.batchNo }}</el-descriptions-item>
        <el-descriptions-item label="数量">{{ Math.floor(currentNcp.quantity || 0) }} {{ currentNcp.unit }}</el-descriptions-item>
        <el-descriptions-item label="占比">
             {{ currentNcp.unqualified_rate != null ? currentNcp.unqualified_rate + '%' : '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentNcp.status)">
            {{ getStatusLabel(currentNcp.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="缺陷类型" :span="2">{{ currentNcp.defectType }}</el-descriptions-item>
        <el-descriptions-item label="缺陷描述" :span="2">{{ currentNcp.defectDescription }}</el-descriptions-item>
        <el-descriptions-item label="供应商">
          <el-tag v-if="currentNcp.supplierName" type="warning">{{ currentNcp.supplierName }}</el-tag>
          <span v-else class="text-muted">未关联</span>
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
    </AppDialog>
    <!-- 特采申请 Dialog -->
    <AppDialog
      v-model="applyConcessionDialogVisible"
      title="申请特采 (让步接收)"
      mode="form"
      width="500px"
    >
      <el-form :model="applyConcessionForm" label-width="100px">
        <el-form-item label="申请理由" required>
          <el-input v-model="applyConcessionForm.reason" type="textarea" :rows="4" placeholder="请详细说明特采申请理由..."></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="applyConcessionDialogVisible = false">取消</el-button>
        <el-button v-permission="'quality:nonconforming:update'" type="primary" :loading="submitLoading" @click="submitApplyConcession">提交申请</el-button>
      </template>
        </AppDialog>
    <!-- 特采审批 Dialog -->
    <AppDialog
      v-model="approveConcessionDialogVisible"
      title="特采审批"
      mode="form"
      width="500px"
    >
        <el-descriptions border :column="1" class="mb-20">
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
          <el-button v-permission="'quality:nonconforming:approve'" type="primary" :loading="submitLoading" @click="submitApproveConcession">确认提交</el-button>
        </template>
        </AppDialog>
    <!-- Disposition Dialog -->
    <AppDialog
      v-model="disposeDialogVisible"
      title="处理决策 - 不合格品处理"
      mode="form"
      width="600px"
    >
      <el-alert
        title="请选择不合格品的处理方式"
        type="info"
        :closable="false"
        class="mb-20"
      >
        <template #default>
          <div v-if="currentNcp">
            <p><strong>不合格品编号:</strong> {{ currentNcp.ncpNo }}</p>
            <p><strong>物料名称:</strong> {{ currentNcp.materialName }}</p>
            <p><strong>不合格数量:</strong> <span class="text-danger font-weight-700">{{ Math.floor(currentNcp.quantity || 0) }} {{ currentNcp.unit }}</span></p>
          </div>
        </template>
      </el-alert>
      <el-form :model="disposeForm" label-width="120px">
        <el-form-item label="处理方式" required>
          <el-select v-model="disposeForm.disposition" placeholder="请选择处理方式" class="w-full">
            <el-option label="退货 - 退回供应商" value="return" />
            <el-option label="换货 - 供应商换货" value="replacement" />
            <el-option label="返工 - 返工处理" value="rework" />
            <el-option label="报废 - 报废处理" value="scrap" />
            <el-option label="让步接收 - 降级使用" value="use_as_is" />
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
          <el-select v-model="disposeForm.responsible_party" placeholder="请选择责任方" class="w-full">
            <el-option label="供应商" value="supplier" />
            <el-option label="内部" value="internal" />
            <el-option label="未知" value="unknown" />
          </el-select>
        </el-form-item>
        <el-form-item label="归属供应商" required v-if="disposeForm.responsible_party === 'supplier' || disposeForm.disposition === 'return' || disposeForm.disposition === 'replacement'">
          <el-select
            v-model="disposeForm.supplierId"
            placeholder="请搜索并选择产生不良的供应商"
            class="w-full"
            filterable
            remote
            reserve-keyword
            :remote-method="fetchSuppliers"
            :loading="supplierLoading"
            @visible-change="visible => visible && fetchSuppliers()"
          >
            <el-option v-for="supplier in supplierList" :key="supplier.id" :label="supplier.name" :value="supplier.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="处理人">
          <el-input v-model="disposeForm.disposition_by" placeholder="请输入处理人姓名" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="disposeDialogVisible = false">取消</el-button>
        <el-button v-permission="'quality:nonconforming:update'" type="primary" @click="submitDisposition">提交处理决策</el-button>
      </template>
        </AppDialog>
    <!-- Complete Dialog -->
    <AppDialog
      v-model="completeDialogVisible"
      title="完成处理"
      mode="form"
      width="600px"
    >
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
        <el-button v-permission="'quality:nonconforming:update'" type="primary" @click="submitComplete">确定</el-button>
      </template>
        </AppDialog>
  </div>
</template>
<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute } from 'vue-router'
import { Plus } from '@element-plus/icons-vue'
import ncpApi from '@/api/nonconformingProductApi'
import { searchSupplierOptions } from '@/utils/optionLoaders'
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
const searchForm = reactive({
  ncpNo: '',
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
      params.startDate = dayjs(dateRange.value[0]).format('YYYY-MM-DD')
      params.endDate = dayjs(dateRange.value[1]).format('YYYY-MM-DD')
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
  searchForm.ncpNo = ''
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
  disposeForm.responsible_party = row.supplierId ? 'supplier' : 'unknown'
  disposeForm.supplierId = row.supplierId || null
  if (row.supplierId && !supplierList.value.some(s => Number(s.id) === Number(row.supplierId))) {
    supplierList.value.unshift({
      id: row.supplierId,
      name: row.supplierName || row.supplier || `供应商-${row.supplierId}`
    })
  }
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
  if ((disposeForm.responsible_party === 'supplier' || disposeForm.disposition === 'return' || disposeForm.disposition === 'replacement') && !disposeForm.supplierId) {
    ElMessage.warning('为了后续采购对账及实物退换货的闭环，必须指定该不良品的归属供应商！')
    return
  }
  const payload = { ...disposeForm }
  if (disposeForm.supplierId) {
    const matchedSupplier = supplierList.value.find(s => s.id === disposeForm.supplierId)
    if (matchedSupplier) {
      payload.supplierName = matchedSupplier.name
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
    await ncpApi.applyConcession(currentNcp.value.id, { reason: applyConcessionForm.reason });
    ElMessage.success('特采申请提交成功');
    applyConcessionDialogVisible.value = false;
    fetchData();
  } catch {
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
    await ncpApi.approveConcession(currentNcp.value.id, { status: approveConcessionForm.status });
    ElMessage.success('审批完成');
    approveConcessionDialogVisible.value = false;
    fetchData();
  } catch {
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
const _getSeverityType = (severity) => {
  const types = {
    minor: 'info',
    major: 'warning',
    critical: 'danger'
  }
  return types[severity] || 'info'
}
const _getSeverityLabel = (severity) => {
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
const supplierLoading = ref(false)
let supplierSearchId = 0
const mergeSuppliers = (items = []) => {
  items.forEach(item => {
    if (item?.id && !supplierList.value.some(existing => Number(existing.id) === Number(item.id))) {
      supplierList.value.push(item)
    }
  })
}
const fetchSuppliers = async (query = '') => {
  const searchId = ++supplierSearchId
  supplierLoading.value = true
  try {
    const suppliers = await searchSupplierOptions(query, { pageSize: 50 })
    if (searchId === supplierSearchId) {
      if (query) {
        supplierList.value = suppliers
      } else {
        mergeSuppliers(suppliers)
      }
    }
  } catch(error) {
    console.error('Failed to fetch suppliers:', error)
  } finally {
    if (searchId === supplierSearchId) {
      supplierLoading.value = false
    }
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
:deep(.el-descriptions) {
  margin-top: 10px;
}
:deep(.el-descriptions__label) {
  font-weight: 600;
  background-color: var(--color-bg-light);
}
:deep(.el-descriptions__content) {
  min-width: 0;
  white-space: normal;
  word-break: break-word;
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
