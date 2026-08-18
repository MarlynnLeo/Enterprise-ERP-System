<!--
/**
 * SalesReturns.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page outbound-container">
    <!-- 页面标题 -->
    <PageHeader title="销售退货管理" subtitle="管理销售退货与处理">
      <template #actions>
<el-button type="primary" :icon="Plus" @click="openCreateDialog" v-permission="'sales:returns:create'">增加退货单</el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :loading="loading"
      @search="handleSearch"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="物料名称">
          <el-input
            v-model="searchQuery"
            placeholder="物料名称"
            @keyup.enter="handleSearch"
            clearable ></el-input>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="退货状态">
          <el-select v-model="statusFilter" placeholder="退货状态" clearable @change="handleSearch" class="w-full">
            <el-option
              v-for="item in returnStatuses"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="日期范围">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            @change="handleSearch"
          />
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <!-- 统计卡片 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ returnStats.total }}</div>
        <div class="stat-label">全部退货</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ returnStats.pending }}</div>
        <div class="stat-label">待审批</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ returnStats.approved }}</div>
        <div class="stat-label">已审批</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ returnStats.completed }}</div>
        <div class="stat-label">已完成</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ returnStats.rejected }}</div>
        <div class="stat-label">已拒绝</div>
      </el-card>
    </div>

    <!-- 退货单表格 -->
    <el-card class="data-card">
      <el-table
        :data="returnRecords"
        border
        class="w-full"
        v-loading="loading"
        table-layout="fixed"
      >
        <el-table-column type="expand" width="50">
          <template #default="props">
            <div class="return-detail">
              <el-descriptions :column="3" border>
                <el-descriptions-item label="原订单号">{{ props.row.orderNo }}</el-descriptions-item>
                <el-descriptions-item label="客户名称">{{ props.row.customerName }}</el-descriptions-item>
                <el-descriptions-item label="退货日期">{{ formatDate(props.row.returnDate) }}</el-descriptions-item>
                <el-descriptions-item label="退款金额">{{ formatCurrency(props.row.returnAmount) }}</el-descriptions-item>
                <el-descriptions-item label="退货原因" :span="2">{{ props.row.reason || '无' }}</el-descriptions-item>
              </el-descriptions>

              <div class="products-title">退货物品</div>
              <el-table :data="props.row.items || []" border class="table-row-click w-full" table-layout="fixed"
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleView(row))">
                <el-table-column prop="productCode" label="产品编码" width="120" />
                <el-table-column prop="productName" label="产品名称" />
                <el-table-column prop="specification" label="规格" />
                <el-table-column prop="unitName" label="单位" width="80" />
                <el-table-column prop="quantity" label="数量" width="100" />
                <el-table-column prop="reason" label="明细原因" min-width="120" />
              </el-table>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="returnNo" label="退货单号" width="150" fixed />
        <el-table-column prop="orderNo" label="原订单号" width="150" />
        <el-table-column prop="customerName" label="客户名称" min-width="450" />
        <el-table-column prop="returnDate" label="退货日期" width="200">
          <template #default="scope">
            {{ formatDate(scope.row.returnDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="returnAmount" label="退款金额" width="120">
          <template #default="scope">
            {{ formatCurrency(scope.row.returnAmount) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getReturnStatusType(scope.row.status)">{{ getReturnStatusText(scope.row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="320" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="scope">

            <!-- 待审批状态：可以审批通过或拒绝 -->
            <template v-if="scope.row.status === 'pending'">
              <el-button
                size="small"
                type="success"
                @click="handleApprove(scope.row)"

              v-permission="'sales:returns:approve'">
                审批通过
              </el-button>
              <el-button
                size="small"
                type="danger"
                v-permission="'sales:returns:approve'"
                @click="handleReject(scope.row)"
              >
                拒绝
              </el-button>
            </template>

            <!-- 已审批状态：可以完成 -->
            <el-button
              v-if="scope.row.status === 'approved'"
              size="small"
              type="warning"
              @click="handleComplete(scope.row)"
            >
              完成
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="Math.max(total, 1)"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        >
        </el-pagination>
      </div>
    </el-card>

    <!-- 退货单详情对话框 -->
    <AppDialog
      v-model="detailsVisible"
      title="退货单详情"
      mode="view"
      content-width="wide"
      :detail-navigation="salesReturnViewNavigation"
    >
      <div v-if="currentReturn" v-loading="detailsLoading">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="退货单号">{{ currentReturn.returnNo || currentReturn.id }}</el-descriptions-item>
          <el-descriptions-item label="关联订单号">{{ currentReturn.orderNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="客户名称">{{ currentReturn.customerName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="退货日期">{{ formatDate(currentReturn.returnDate) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getReturnStatusType(currentReturn.status)">{{ getReturnStatusText(currentReturn.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDateTime(currentReturn.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="退货原因" :span="2">{{ currentReturn.returnReason || '-' }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2" v-if="currentReturn.remarks">{{ currentReturn.remarks }}</el-descriptions-item>
        </el-descriptions>

        <h3 class="mt-4">退货明细</h3>
        <el-table :data="currentReturn.items || []" class="w-full" border>
          <el-table-column type="index" width="50" label="#" />
          <el-table-column prop="materialCode" label="物料编码" width="120" />
          <el-table-column prop="materialName" label="物料名称" min-width="160" />
          <el-table-column prop="specification" label="规格" min-width="140" />
          <el-table-column prop="unitName" label="单位" width="80" />
          <el-table-column prop="quantity" label="退货数量" width="100" />
          <el-table-column prop="reason" label="明细原因" min-width="160" />
        </el-table>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="detailsVisible = false">关闭</el-button>
          <el-button type="primary" @click="handlePrintReturn" :loading="printLoading">打印</el-button>
        </span>
      </template>
    </AppDialog>
    <!-- 新增退货单对话框 -->
    <AppDialog
      v-model="createDialog.visible"
      title="新增退货单"
      mode="form"
      wide
    >
      <el-form :model="createForm" ref="createFormRef" label-width="100px">
        <el-form-item label="选择出库单" required>
          <div style="display:flex; gap:8px; align-items:center;">
            <el-input v-model="createForm.outbound.outboundNo" placeholder="请选择已完成的出库单" disabled />
            <el-button type="primary" @click="openOutboundDialog">选择出库单</el-button>
            <span v-if="createForm.outbound.customerName">客户：{{ createForm.outbound.customerName }}</span>
          </div>
        </el-form-item>
        <el-form-item label="退货日期" required>
          <el-date-picker v-model="createForm.return_date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
        </el-form-item>
        <el-form-item label="退货原因" required>
          <el-input v-model="createForm.return_reason" placeholder="请输入退货原因" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="createForm.remarks" type="textarea" :rows="2" placeholder="备注（可选）" />
        </el-form-item>

        <el-divider content-position="center">退货明细</el-divider>
        <el-table :data="createForm.items" border class="w-full">
          <el-table-column type="index" width="50" label="#" />
          <el-table-column prop="materialCode" label="产品编码" width="120" />
          <el-table-column prop="materialName" label="产品名称" min-width="140" />
          <el-table-column prop="specification" label="规格" min-width="140" />
          <el-table-column prop="unitName" label="单位" width="60" />
          <el-table-column label="可退数量" width="100">
            <template #default="{ row }">{{ row.quantity }}</template>
          </el-table-column>
          <el-table-column label="退货数量" width="100">
            <template #default="{ row }">
              <el-input
                v-model="row.returnQuantity"
                type="number"
                :min="0"
                :max="row.quantity"
                placeholder="请输入退货数量"
                @input="validateReturnQuantity(row)"
              />
            </template>
          </el-table-column>
          <el-table-column prop="reason" label="明细原因" min-width="120">
            <template #default="{ row }">
              <el-input v-model="row.reason" placeholder="原因" />
            </template>
          </el-table-column>
        </el-table>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="createDialog.visible = false">取消</el-button>
          <el-button v-permission="'sales:returns:create'" type="primary" @click="submitCreate">提交</el-button>
        </span>
      </template>
        </AppDialog>

    <!-- 选择出库单对话框 -->
    <AppDialog
      v-model="outboundDialog.visible"
      title="选择已完成的出库单"
      mode="form"
      wide
    >
      <div style="display:flex; gap:8px; margin-bottom:12px;">
        <el-input  v-model="outboundDialog.keyword" placeholder="按出库单号/客户名搜索" clearable @keyup.enter="loadOutbounds" />
        <el-button type="primary" @click="loadOutbounds">查询</el-button>
      </div>
      <el-table :data="outboundDialog.list" border height="380">
        <el-table-column prop="outboundNo" label="出库单号" width="140" />
        <el-table-column prop="orderNo" label="关联订单" width="120" />
        <el-table-column prop="customerName" label="客户" min-width="140" />
        <el-table-column prop="deliveryDate" label="出库日期" width="120" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getSalesStatusColor(row.status)">
              {{ getSalesStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="120" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="selectOutbound(row)">选择</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="outboundDialog.page"
          v-model:page-size="outboundDialog.pageSize"
          layout="total, sizes, prev, pager, next"
          :page-sizes="[20, 50, 100, 200]"
          :total="outboundDialog.total"
          @current-change="loadOutbounds"
          @size-change="onOutboundPageSize"
        />
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="outboundDialog.visible = false">关闭</el-button>
        </span>
      </template>
        </AppDialog>
  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { formatDate, formatDateTime } from '@/utils/helpers/dateUtils'
import { formatCurrency } from '@/utils/helpers/formatters'
import dayjs from 'dayjs'
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesApi } from '@/api'
import { Plus } from '@element-plus/icons-vue'
import printService from '@/services/printService'
// 退货单详情相关
const detailsVisible = ref(false)
const currentReturn = ref(null)
const detailsLoading = ref(false)

// 获取退货单状态类型（使用统一的销售状态颜色）
const getReturnStatusType = (status) => getSalesStatusColor(status)

// 获取退货单状态文本（使用统一的销售状态文本）
const getReturnStatusText = (status) => getSalesStatusText(status) || status

const createDialog = reactive({ visible: false })
const createFormRef = ref(null)
const createForm = reactive({
  outbound: { id: null, outbound_no: '', order_no: '', customer_name: '' },
  return_date: dayjs().format('YYYY-MM-DD'),
  return_reason: '',
  remarks: '',
  items: []
})

import { getSalesStatusText, getSalesStatusColor } from '@/constants/systemConstants'
import { parseResponseData } from '@/utils/responseParser'
import { useListDetailNavigation } from '@/composables/useListDetailNavigation'
const outboundDialog = reactive({
  visible: false,
  keyword: '',
  page: 1,
  pageSize: 50,
  total: 0,
  list: []
})

const loading = ref(false)
const returnRecords = ref([])
const {
  previousItem: previousViewReturn,
  nextItem: nextViewReturn,
  hasPrevious: hasPreviousViewReturn,
  hasNext: hasNextViewReturn,
  setCurrentItem: setCurrentViewReturn
} = useListDetailNavigation(returnRecords)
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const searchQuery = ref('')
const statusFilter = ref('')
const dateRange = ref([])
const isBlankAmount = (value) => value === null || value === undefined || value === ''

// 退货单统计数据
const returnStats = ref({
  total: 0,
  pending: 0,
  approved: 0,
  completed: 0,
  rejected: 0
})

// 状态映射 - 使用统一的销售状态
const returnStatuses = [
  { value: 'pending', label: '待审批' },
  { value: 'approved', label: '已审批' },
  { value: 'completed', label: '已完成' },
  { value: 'rejected', label: '已拒绝' }
]

// 删除未使用的状态映射函数，保留实际使用的退货单和订单状态映射

// 计算统计数据
const calculateReturnStats = () => {
  const stats = {
    total: returnRecords.value.length,
    pending: 0,
    approved: 0,
    completed: 0,
    rejected: 0
  }

  returnRecords.value.forEach(record => {
    if (record.status === 'pending') stats.pending++
    else if (record.status === 'approved') stats.approved++
    else if (record.status === 'completed') stats.completed++
    else if (record.status === 'rejected') stats.rejected++
  })

  returnStats.value = stats
}

// ========== 新增退货单相关 ==========
// 打开新增对话框
const openCreateDialog = () => {
  // 重置表单
  createForm.outbound = { id: null, outbound_no: '', order_no: '', customer_name: '' }
  createForm.return_date = dayjs().format('YYYY-MM-DD')
  createForm.return_reason = ''
  createForm.remarks = ''
  createForm.items = []
  createDialog.visible = true
}

// 选择出库单对话框
const openOutboundDialog = async () => {
  outboundDialog.visible = true
  outboundDialog.page = 1
  await loadOutbounds()
}

const onOutboundPageSize = async (size) => {
  outboundDialog.pageSize = size
  outboundDialog.page = 1
  await loadOutbounds()
}

// 验证退货数量
const validateReturnQuantity = (row) => {
  // 确保输入值是数字
  const value = parseFloat(row.returnQuantity)
  if (isNaN(value) || value < 0) {
    row.returnQuantity = 0
    return
  }

  // 确保不超过可退数量
  if (value > row.quantity) {
    row.returnQuantity = row.quantity
    ElMessage.warning(`退货数量不能超过可退数量 ${row.quantity}`)
    return
  }

  // 保留两位小数
  row.returnQuantity = Math.round(value * 100) / 100
}

const loadOutbounds = async () => {
  try {
    const params = {
      page: outboundDialog.page,
      pageSize: outboundDialog.pageSize,
      search: outboundDialog.keyword || undefined,
      status: 'completed' // 只获取已完成的出库单
    }
    const resp = await salesApi.getOutbounds(params)
    // 适配后端的 { list, total } 结构和其他常见数据结构
    const responseData = resp.data || resp;
    const data = responseData.list || responseData.items || responseData.data || responseData || [];
    outboundDialog.list = Array.isArray(data) ? data : [];
    outboundDialog.total = parseInt(responseData.total) || outboundDialog.list.length;
  } catch (error) {
    console.error('获取出库单列表失败:', error)
    ElMessage.error('获取出库单列表失败')
  }
}

const selectOutbound = async (row) => {
  try {
    // 获取出库单详情，拿到明细
    const resp = await salesApi.getOutbound(row.id)
    const outboundData = resp.data || resp

    // 设置出库单信息
    createForm.outbound = {
      id: outboundData.id,
      outbound_no: outboundData.outboundNo,
      order_no: outboundData.orderNo || '',
      customer_name: outboundData.customerName || ''
    }

    // 设置退货明细（基于出库明细）
    createForm.items = (outboundData.items || []).map(item => ({
      material_id: item.materialId || item.productId,
      material_code: item.materialCode || item.productCode,
      material_name: item.materialName || item.productName,
      specification: item.specification || '',
      unit_name: item.unitName || '个',
      quantity: item.returnableQuantity ?? item.quantity, // 可退数量（已扣减历史退货）
      return_quantity: 0, // 退货数量，用户可编辑
      reason: '' // 明细退货原因
    }))

    outboundDialog.visible = false
    ElMessage.success('出库单选择成功')
  } catch (error) {
    console.error('获取出库单详情失败:', error)
    ElMessage.error('获取出库单详情失败')
  }
}

// 提交创建
const submitCreate = async () => {
  try {
    if (!createForm.outbound.id) return ElMessage.warning('请选择出库单')
    if (!createForm.return_date) return ElMessage.warning('请选择退货日期')
    if (!createForm.return_reason) return ElMessage.warning('请输入退货原因')

    // 验证退货明细
    const validItems = createForm.items.filter(i => Number(i.return_quantity) > 0)
    if (validItems.length === 0) return ElMessage.warning('请至少填写1条退货数量')

    // 验证退货数量不能超过原数量
    for (const item of validItems) {
      const returnQty = Number(item.returnQuantity)
      const originalQty = Number(item.quantity)
      if (returnQty > originalQty) {
        ElMessage.error(`商品 ${item.materialName} 的退货数量不能超过原数量`)
        return
      }
      if (returnQty <= 0) {
        ElMessage.error(`商品 ${item.materialName} 的退货数量必须大于0`)
        return
      }
    }

    const payload = {
      outbound_id: createForm.outbound.id,
      outbound_no: createForm.outbound.outboundNo,
      order_no: createForm.outbound.orderNo,
      customer_name: createForm.outbound.customerName,
      return_date: createForm.return_date,
      return_reason: createForm.return_reason,
      remarks: createForm.remarks,
      items: validItems.map(i => ({
        product_id: i.materialId,
        quantity: Number(i.return_quantity),
        reason: i.reason || ''
      }))
    }

    await salesApi.createReturn(payload)
    ElMessage.success('创建退货单成功')
    createDialog.visible = false
    await fetchData()
  } catch (e) {
    console.error('创建退货单失败:', e)
    const errorMessage = e.response?.data?.error || e.response?.data?.message || '创建退货单失败'
    ElMessage.error(errorMessage)
  }
}
// 搜索方法
const handleSearch = () => {
  currentPage.value = 1
  fetchData()
}

// 重置搜索方法
const resetSearch = () => {
  searchQuery.value = ''
  statusFilter.value = ''
  dateRange.value = []
  fetchData()
}

// 获取退货单数据（从后端）
const fetchData = async () => {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      search: searchQuery.value || undefined,
      status: statusFilter.value || undefined,
      startDate: Array.isArray(dateRange.value) && dateRange.value[0] ? dateRange.value[0] : undefined,
      endDate: Array.isArray(dateRange.value) && dateRange.value[1] ? dateRange.value[1] : undefined
    }
    const resp = await salesApi.getReturns(params)
    const data = parseResponseData(resp, {})
    const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : [])

    // 适配后端数据到表格结构
    returnRecords.value = items.map((it, idx) => ({
      id: it.id || `RET_${idx}`, // 保持数字ID用于API调用
      returnNo: it.returnNo || it.id || `RET_${idx}`, // 显示用的退货单号
      orderNo: it.orderNo || it.orderId || '-',
      customerName: it.customerName || '-',
      returnDate: it.returnDate,
      returnAmount: isBlankAmount(it.totalAmount ?? it.return_amount) ? null : Number(it.totalAmount ?? it.return_amount),
      status: it.status || '待审批',
      reason: it.returnReason || '-', // 添加退货原因
      items: it.items || []
    }))

    total.value = Number(data.total ?? returnRecords.value.length)
    calculateReturnStats()
  } catch (error) {
    console.error('获取退货单数据失败:', error)
    ElMessage.error('获取退货单数据失败')
    returnRecords.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

// 在组件挂载时获取数据
onMounted(() => {
  fetchData()
})

// 查看详情
const handleView = async (row) => {
  if (detailsLoading.value) return

  detailsLoading.value = true
  try {
    // 如果行数据已包含明细，直接显示
    if (row.items && Array.isArray(row.items)) {
      currentReturn.value = row
      setCurrentViewReturn(row)
      detailsVisible.value = true
      return
    }

    // 否则从后端获取详情
    const resp = await salesApi.getReturnDetails(row.id)
    currentReturn.value = resp.data || row
    setCurrentViewReturn(row)
    detailsVisible.value = true
  } catch (error) {
    console.error('获取退货单详情失败:', error)
    ElMessage.error('获取退货单详情失败')
  } finally {
    detailsLoading.value = false
  }
}

const handleViewPrevious = () => {
  if (previousViewReturn.value) handleView(previousViewReturn.value)
}

const handleViewNext = () => {
  if (nextViewReturn.value) handleView(nextViewReturn.value)
}

const salesReturnViewNavigation = computed(() => ({
  hasPrevious: hasPreviousViewReturn.value,
  hasNext: hasNextViewReturn.value,
  loading: detailsLoading.value,
  previous: handleViewPrevious,
  next: handleViewNext
}))

// 通用状态更新函数
const updateReturnStatus = async (row, status, remarks = null) => {
  try {
    // 先获取完整的退货单数据
    const response = await salesApi.getReturn(row.id)
    const fullReturnData = response.data || response

    // 调用后端API更新状态，保留所有原有数据
    await salesApi.updateReturn(row.id, {
      return_date: fullReturnData.return_date,
      order_id: fullReturnData.orderId,
      return_reason: fullReturnData.return_reason,
      status: status,
      remarks: remarks !== null ? remarks : fullReturnData.remarks,
      items: fullReturnData.items || []
    })

    // 刷新数据以获取最新状态
    await fetchData()
  } catch (error) {
    console.error(`状态更新失败:`, error)
    throw error
  }
}

// 审批通过
const handleApprove = (row) => {
  ElMessageBox.confirm('确定要审批通过此退货单吗？', '审批通过', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'success'
  }).then(async () => {
    try {
      await updateReturnStatus(row, 'approved')
      ElMessage.success(`退货单 ${row.returnNo || row.id} 已审批通过`)
    } catch {
      ElMessage.error('审批失败，请重试')
    }
  }).catch(() => {})
}

// 拒绝审批
const handleReject = (row) => {
  ElMessageBox.prompt('请输入拒绝原因', '拒绝审批', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputPattern: /.+/,
    inputErrorMessage: '拒绝原因不能为空'
  }).then(async ({ value: rejectReason }) => {
    try {
      // 获取原有备注并添加拒绝原因
      const response = await salesApi.getReturn(row.id)
      const fullReturnData = response.data || response
      const newRemarks = (fullReturnData.remarks || '') + `\n拒绝原因：${rejectReason}`

      await updateReturnStatus(row, 'rejected', newRemarks)
      ElMessage.success(`退货单 ${row.returnNo || row.id} 已拒绝`)
    } catch {
      ElMessage.error('拒绝失败，请重试')
    }
  }).catch(() => {})
}

// 完成退货
const handleComplete = (row) => {
  ElMessageBox.confirm('确定要完成此退货单吗？完成后将无法修改。', '完成退货', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await updateReturnStatus(row, 'completed')
      ElMessage.success(`退货单 ${row.returnNo || row.id} 已完成`)
    } catch {
      ElMessage.error('完成失败，请重试')
    }
  }).catch(() => {})
}

// 处理每页显示数量变化
const handleSizeChange = (val) => {
  pageSize.value = val
  fetchData()
}

// 处理当前页码变化
const handleCurrentChange = (val) => {
  currentPage.value = val
  fetchData()
}
// ========== 打印功能 ==========
const printLoading = ref(false)
const handlePrintReturn = async () => {
  if (!currentReturn.value) return
  printLoading.value = true
  try {
    const ret = currentReturn.value
    const printData = {
      return_no: ret.returnNo || '',
      return_date: formatDate(ret.returnDate) || '',
      customer_name: ret.customerName || '',
      order_no: ret.orderNo || '',
      reason: ret.returnReason || '',
      operator: ret.created_by_name || '',
      items: (ret.items || []).map((item, idx) => ({
        index: idx + 1,
        material_code: item.materialCode || item.productCode || '',
        material_name: item.materialName || item.productName || '',
        specification: item.specification || '',
        quantity: parseFloat(item.quantity || item.returnQuantity || 0).toFixed(2),
        unit_name: item.unitName || '',
        remark: item.reason || item.remark || ''
      }))
    }
    const html = await printService.generateByDefaultTemplate('sales', 'sales_return', printData)
    printService.previewDocument(html)
  } catch (error) {
    console.error('打印退货单失败:', error)
    ElMessage.error('打印失败: ' + (error.message || '未知错误'))
  } finally {
    printLoading.value = false
  }
}
</script>

<style scoped>
.header-card {
  margin-bottom: 20px;
}

.title-section h2 {
  margin: 0 0 5px 0;
  font-size: 20px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.search-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-base);
}

.operation-group {
  display: flex;
  gap: 4px;
}

.return-detail {
  padding: 16px;
}


:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
