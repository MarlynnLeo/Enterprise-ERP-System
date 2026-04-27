<!--
/**
 * DeliveryStats.vue
 * @description 发货统计页面组件
 * @date 2025-09-24
 * @version 1.0.0
 */
-->
<template>
  <div class="outbound-container">
    <!-- 页面标题 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>发货统计</h2>
          <p class="subtitle">统计发货数据与分析</p>
        </div>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" class="search-form">
        <el-form-item label="查询">
          <el-input
            v-model="searchForm.search"
            placeholder="订单号/客户/产品/合同"
            @keyup.enter="handleSearch"
            clearable

          />
        </el-form-item>

        <el-form-item label="发货状态">
          <el-select 
            v-model="searchForm.status" 
            placeholder="全部状态" 
            clearable 
            @change="handleSearch" 

          >
            <el-option v-for="item in $dict.getOptions('delivery_status')" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>

        <el-form-item label="日期范围">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            @change="handleSearch"

          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon> 查询
          </el-button>
          <el-button @click="handleReset">
            <el-icon><Refresh /></el-icon> 重置
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 统计卡片 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ deliveryStats.total }}</div>
        <div class="stat-label">总产品数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ deliveryStats.shipped }}</div>
        <div class="stat-label">已发货</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ deliveryStats.partial }}</div>
        <div class="stat-label">部分发货</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ deliveryStats.unshipped }}</div>
        <div class="stat-label">未发货</div>
      </el-card>
    </div>

    <!-- 数据表格 -->
    <el-card class="data-card" :class="{ 'has-floating-bar': selectedRows.length > 0 }">
      <el-table
        ref="deliveryTableRef"
        :data="tableData"
        border
        style="width: 100%"
        v-loading="loading"
        table-layout="fixed"
        @selection-change="handleSelectionChange"
      >
        <el-table-column
          type="selection"
          width="55"
          fixed
          :selectable="checkSelectable"
        />
        <el-table-column
          prop="order_no"
          label="订单编号"
          width="120"
          fixed
          resizable
        >
          <template #default="{ row }">
            <el-link type="primary" @click="viewOrderDetails(row.order_id)">
              {{ row.order_no }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column
          prop="customer_name"
          label="客户名称"
          min-width="200"
          resizable
        />
        <el-table-column
          prop="contract_code"
          label="合同编码"
          width="120"
          resizable
        >
          <template #default="{ row }">
            {{ row.contract_code || '-' }}
          </template>
        </el-table-column>
        <el-table-column
          prop="material_code"
          label="产品编码"
          width="120"
          resizable
        />
        <el-table-column
          prop="material_name"
          label="产品名称"
          min-width="150"
          resizable
          show-overflow-tooltip
        />
        <el-table-column
          prop="specification"
          label="规格"
          width="120"
          resizable
          show-overflow-tooltip
        />
        <el-table-column
          prop="ordered_quantity"
          label="订单数量"
          width="90"
          align="right"
          resizable
        >
          <template #default="{ row }">
            {{ row.ordered_quantity }} {{ row.unit_name }}
          </template>
        </el-table-column>
        <el-table-column
          prop="shipped_quantity"
          label="已发数量"
          width="100"
          align="right"
          resizable
        >
          <template #default="{ row }">
            {{ row.shipped_quantity }} {{ row.unit_name }}
          </template>
        </el-table-column>
        <el-table-column
          prop="unshipped_quantity"
          label="未发数量"
          width="100"
          align="right"
          resizable
        >
          <template #default="{ row }">
            <span :class="{ 'text-red': row.unshipped_quantity > 0 }">
              {{ row.unshipped_quantity }} {{ row.unit_name }}
            </span>
          </template>
        </el-table-column>
        <el-table-column
          prop="delivery_progress"
          label="发货进度"
          width="120"
          align="center"
          resizable
        >
          <template #default="{ row }">
            <el-progress
              :percentage="Math.min(100, Math.max(0, Number(row.delivery_progress) || 0))"
              :color="getProgressColor(Number(row.delivery_progress) || 0)"
              :stroke-width="8"
            />
          </template>
        </el-table-column>
        <el-table-column
          prop="stock_quantity"
          label="库存"
          width="100"
          align="right"
          resizable
        >
          <template #default="{ row }">
            <span :class="{ 
              'text-green': (row.stock_quantity || 0) >= (row.unshipped_quantity || 0),
              'text-red': (row.stock_quantity || 0) < (row.unshipped_quantity || 0)
            }">
              {{ row.stock_quantity || 0 }} {{ row.unit_name }}
            </span>
          </template>
        </el-table-column>
        <el-table-column
          prop="delivery_status"
          label="发货状态"
          width="100"
          align="center"
          resizable
        >
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.delivery_status)">
              {{ getStatusText(row.delivery_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="order_date"
          label="订单日期"
          width="120"
          resizable
        >
          <template #default="{ row }">
            {{ formatDate(row.order_date) }}
          </template>
        </el-table-column>
        <el-table-column
          prop="delivery_date"
          label="要求交期"
          width="120"
          resizable
        >
          <template #default="{ row }">
            {{ formatDate(row.delivery_date) }}
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="200"
          fixed="right"
          resizable
        >
          <template #default="{ row }">
            <el-button
              v-if="canShip(row)"
              type="success"
              size="small"
              @click="handleSingleShipping(row)"
            >
              <el-icon><Van /></el-icon> 发货
            </el-button>
            <el-button
              type="primary"
              size="small"
              @click="viewDeliveryDetails(row.order_id)"
            >
              查看明细
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
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <!-- 发货明细对话框 -->
    <el-dialog
      v-model="detailDialogVisible"
      title="发货明细"
      width="55%"
      destroy-on-close
    >
      <div v-if="orderDetails">
        <div class="order-info">
          <h4>订单信息</h4>
          <el-descriptions :column="3" border>
            <el-descriptions-item label="订单号">{{ orderDetails.orderInfo.order_no }}</el-descriptions-item>
            <el-descriptions-item label="客户名称">{{ orderDetails.orderInfo.customer_name }}</el-descriptions-item>
            <el-descriptions-item label="订单日期">{{ formatDate(orderDetails.orderInfo.order_date) }}</el-descriptions-item>
            <el-descriptions-item label="要求交期">{{ formatDate(orderDetails.orderInfo.delivery_date) }}</el-descriptions-item>
            <el-descriptions-item label="订单状态">
              <el-tag :type="getOrderStatusType(orderDetails.orderInfo.status)">
                {{ getOrderStatusText(orderDetails.orderInfo.status) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="合同编码">{{ orderDetails.orderInfo.contract_code || '-' }}</el-descriptions-item>
          </el-descriptions>
        </div>

        <div class="delivery-details" style="margin-top: 20px;">
          <h4>发货明细</h4>
          <el-table :data="orderDetails.details" border stripe>
            <el-table-column prop="material_code" label="产品编码" width="120" />
            <el-table-column prop="material_name" label="产品名称" width="160" show-overflow-tooltip />
            <el-table-column prop="specification" label="规格" width="150" show-overflow-tooltip />
            <el-table-column prop="ordered_quantity" label="订单数量" width="100" align="right">
              <template #default="{ row }">
                {{ row.ordered_quantity }} {{ row.unit_name }}
              </template>
            </el-table-column>
            <el-table-column prop="outbound_no" label="出库单号" width="150">
              <template #default="{ row }">
                {{ row.outbound_no || '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="shipped_quantity" label="发货数量" width="90" align="right">
              <template #default="{ row }">
                {{ row.shipped_quantity || 0 }} {{ row.unit_name }}
              </template>
            </el-table-column>
            <el-table-column prop="shipped_date" label="发货日期" width="100">
              <template #default="{ row }">
                {{ row.shipped_date ? formatDate(row.shipped_date) : '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="outbound_status" label="出库状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getOutboundStatusType(row.outbound_status, row.shipped_quantity)">
                  {{ getOutboundStatusText(row.outbound_status, row.shipped_quantity) }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </el-dialog>

    <!-- 发货对话框 -->
    <el-dialog
      v-model="shippingDialogVisible"
      :title="isBatchShipping ? '批量发货' : '创建出库单'"
      width="50%"
      destroy-on-close
    >
      <div v-if="shippingItems.length > 0">
        <el-alert
          title="提示"
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom: 16px"
        >
          <template v-if="isBatchShipping">
            已选择 {{ shippingItems.length }} 个订单项，请为每个项目填写发货数量
          </template>
          <template v-else>
            请填写发货数量，系统将自动创建销售出库单
          </template>
        </el-alert>

        <el-table :data="shippingItems" border max-height="400">
          <el-table-column prop="order_no" label="订单编号" width="120" header-align="center" show-overflow-tooltip />
          <el-table-column prop="material_code" label="产品编码" width="120" header-align="center" show-overflow-tooltip />
          <el-table-column prop="material_name" label="产品名称" min-width="100" header-align="center" show-overflow-tooltip />
          <el-table-column prop="specification" label="规格" width="150" header-align="center" show-overflow-tooltip />
          <el-table-column label="未发数量" width="100" header-align="center" align="right">
            <template #default="{ row }">
              {{ row.unshipped_quantity }} {{ row.unit_name }}
            </template>
          </el-table-column>
          <el-table-column label="库存" width="100" header-align="center" align="right">
            <template #default="{ row }">
              <span :class="{ 
                'text-green': (row.stock_quantity || 0) >= (row.unshipped_quantity || 0),
                'text-red': (row.stock_quantity || 0) < (row.unshipped_quantity || 0)
              }">
                {{ row.stock_quantity || 0 }} {{ row.unit_name }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="发货数量" width="100" header-align="center" align="right">
            <template #default="{ row }">
              <el-input
                v-model.number="row.shipping_quantity"
                type="number"
                :min="0"
                :max="Math.min(row.unshipped_quantity, row.stock_quantity || 0)"
                size="small"
                style="width: 100%"
                @input="handleShippingQuantityInput(row)"
              />
            </template>
          </el-table-column>
        </el-table>

        <div style="margin-top: 16px">
          <el-form :model="shippingForm" label-width="100px">
            <el-form-item label="出库日期">
              <el-date-picker
                v-model="shippingForm.outbound_date"
                type="date"
                placeholder="选择出库日期"

                :disabled-date="disabledDate"
              />
            </el-form-item>
            <el-form-item label="备注">
              <el-input
                v-model="shippingForm.remark"
                type="textarea"
                :rows="3"
                placeholder="请输入备注信息（选填）"
                maxlength="500"
                show-word-limit
              />
            </el-form-item>
          </el-form>
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="shippingDialogVisible = false">取消</el-button>
          <el-button 
            type="primary" 
            @click="confirmShipping"
            :loading="shippingLoading"
          >
            确认生成出库单
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 浮动批量操作栏 -->
    <Transition name="slide-up">
      <div v-if="selectedRows.length > 0" class="floating-batch-bar">
        <div class="batch-info">
          <el-icon><Select /></el-icon>
          <span>已选中 <strong>{{ selectedRows.length }}</strong> 个订单项</span>
        </div>
        <div class="batch-buttons">
          <el-button
            type="success"
            @click="handleBatchShipping"
            :loading="shippingLoading"
          >
            <el-icon><Van /></el-icon> 批量发货
          </el-button>
          <el-button
            @click="handleExport"
          >
            <el-icon><Download /></el-icon> 导出
          </el-button>
          <el-button
            @click="clearSelection"
          >
            <el-icon><Close /></el-icon> 清空选择
          </el-button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { parseListData } from '@/utils/responseParser'
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Download, Van, Select, Close } from '@element-plus/icons-vue'
import { salesApi } from '@/services/api'
import { useRoute } from 'vue-router'
import { formatDate } from '@/utils/helpers/dateUtils'

const route = useRoute()

// 常量定义
const DEFAULT_PAGE_SIZE = 10
const TABLE_HEIGHT = 'calc(100vh - 280px)' // 与销售出库页面保持一致

// 数据定义
const loading = ref(false)
const tableData = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(DEFAULT_PAGE_SIZE)

// 统计数据
const deliveryStats = ref({
  total: 0,
  shipped: 0,
  partial: 0,
  unshipped: 0
})

// 搜索表单
const searchForm = reactive({
  search: '',
  status: '',
  dateRange: null
})

// 发货明细对话框
const detailDialogVisible = ref(false)
const orderDetails = ref(null)

// 多选数据
const selectedRows = ref([])

// 发货对话框
const shippingDialogVisible = ref(false)
const isBatchShipping = ref(false)
const shippingItems = ref([])
const shippingLoading = ref(false)
const shippingForm = reactive({
  outbound_date: new Date(),
  remark: ''
})

// 正在处理的订单项集合（用于防止重复提交）
const processingItems = ref(new Set())

// 获取发货统计数据
const fetchDeliveryStats = async () => {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      search: searchForm.search?.trim() || '',
      status: searchForm.status || '',
      sort: 'created_at',
      order: 'desc'
    }

    // 处理日期范围
    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0]
      params.endDate = searchForm.dateRange[1]
    }

    // 如果URL中有orderId参数，添加到请求参数中
    if (route.query.orderId) {
      params.orderId = route.query.orderId
    }

    const response = await salesApi.getDeliveryStats(params)

    // 使用统一解析器
    tableData.value = parseListData(response, { enableLog: false })
    total.value = Number(response.data?.total) || tableData.value.length
    deliveryStats.value = response.data?.stats || {
      total: 0,
      shipped: 0,
      partial: 0,
      unshipped: 0
    }
  } catch (error) {
    console.error('获取发货统计数据失败:', error)
    ElMessage.error('获取数据失败: ' + (error.message || '网络错误'))
    // 设置默认值，避免页面出错
    tableData.value = []
    total.value = 0
    deliveryStats.value = {
      total: 0,
      shipped: 0,
      partial: 0,
      unshipped: 0
    }
  } finally {
    loading.value = false
  }
}

// 搜索处理
const handleSearch = () => {
  currentPage.value = 1
  fetchDeliveryStats()
}

// 重置搜索
const handleReset = () => {
  searchForm.search = ''
  searchForm.status = ''
  searchForm.dateRange = null
  currentPage.value = 1
  fetchDeliveryStats()
}

// 分页处理
const handleSizeChange = (size) => {
  pageSize.value = size
  currentPage.value = 1
  fetchDeliveryStats()
}

const handlePageChange = (page) => {
  currentPage.value = page
  fetchDeliveryStats()
}

// 查看订单详情
const viewOrderDetails = (orderId) => {
  // 跳转到订单详情页面
  window.open(`/sales/orders?orderId=${orderId}`, '_blank')
}

// 查看发货明细
const viewDeliveryDetails = async (orderId) => {
  try {
    const response = await salesApi.getOrderDeliveryDetails(orderId)
    // axios拦截器已自动解包ResponseHandler格式
    orderDetails.value = response.data
    detailDialogVisible.value = true
  } catch (error) {
    console.error('获取发货明细失败:', error)
    ElMessage.error('获取发货明细失败: ' + (error.message || '网络错误'))
  }
}

// 工具函数
// formatDate: 使用公共实现


const getStatusType = (status) => {
  const statusMap = {
    shipped: 'success',
    partial: 'warning',
    unshipped: 'danger'
  }
  return statusMap[status] || 'info'
}

const getStatusText = (status) => {
  const statusMap = {
    shipped: '已发货',
    partial: '部分发货',
    unshipped: '未发货'
  }
  return statusMap[status] || '未知'
}

const getProgressColor = (percentage) => {
  if (percentage === 100) return '#67c23a'
  if (percentage >= 50) return '#e6a23c'
  return '#f56c6c'
}

// 订单状态转换函数
const getOrderStatusType = (status) => {
  const statusMap = {
    draft: 'info',
    pending: 'warning',
    confirmed: 'primary',
    in_production: 'warning',
    ready_to_ship: 'success',
    shipped: 'success',
    partial_shipped: 'warning',
    completed: 'success',
    cancelled: 'danger'
  }
  return statusMap[status] || 'info'
}

const getOrderStatusText = (status) => {
  const statusMap = {
    draft: '草稿',
    pending: '待确认',
    confirmed: '已确认',
    in_production: '生产中',
    ready_to_ship: '可发货',
    shipped: '已发货',
    partial_shipped: '部分发货',
    completed: '已完成',
    cancelled: '已取消'
  }
  return statusMap[status] || status || '未知'
}

// 出库状态转换函数
const getOutboundStatusType = (status, shippedQuantity) => {
  // 如果没有发货数量，显示为未发货状态
  if (!shippedQuantity || shippedQuantity === 0) {
    return 'danger'
  }
  
  const statusMap = {
    completed: 'success',
    pending: 'warning',
    cancelled: 'danger',
    draft: 'info'
  }
  return statusMap[status] || 'info'
}

const getOutboundStatusText = (status, shippedQuantity) => {
  // 如果没有发货数量，显示为未发货
  if (!shippedQuantity || shippedQuantity === 0) {
    return '未发货'
  }
  
  const statusMap = {
    completed: '已完成',
    pending: '待出库',
    cancelled: '已取消',
    draft: '草稿'
  }
  return statusMap[status] || '已发货'
}

// 导出功能
const handleExport = () => {
  if (tableData.value.length === 0) {
    ElMessage.warning('暂无数据可导出')
    return
  }

  try {
    // 准备导出数据
    const exportData = selectedRows.value.length > 0 ? selectedRows.value : tableData.value

    // 转换为CSV格式
    const headers = ['订单号', '客户名称', '产品名称', '订单数量', '已发货数量', '未发货数量', '发货状态', '发货日期', '备注']
    const csvContent = [
      headers.join(','),
      ...exportData.map(row => [
        row.order_no || '',
        row.customer_name || '',
        row.product_name || '',
        row.order_quantity || 0,
        row.shipped_quantity || 0,
        row.unshipped_quantity || 0,
        getStatusText(row.status),
        row.delivery_date || '',
        (row.notes || '').replace(/,/g, '，') // 替换逗号避免CSV格式问题
      ].join(','))
    ].join('\n')

    // 添加BOM头以支持中文
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })

    // 创建下载链接
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `发货统计_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`
    document.body.appendChild(a)
    a.click()

    // 清理
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)

    ElMessage.success(`成功导出${exportData.length}条记录`)
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败')
  }
}

// 多选处理
const handleSelectionChange = (selection) => {
  selectedRows.value = selection
}

// 表格引用
const deliveryTableRef = ref(null)

// 清空选择
const clearSelection = () => {
  selectedRows.value = []
  deliveryTableRef.value?.clearSelection()
}

// 检查行是否可选择
const checkSelectable = (row) => {
  return canShip(row)
}

// 检查是否可以发货
const canShip = (row) => {
  // 如果有待处理的出库单（草稿状态），禁用按钮
  // 注意：has_pending_outbound 可能是数字 0/1 或布尔值 false/true
  const hasPending = Number(row.has_pending_outbound) === 1 || row.has_pending_outbound === true
  if (hasPending) {
    return false
  }

  // 如果正在处理中，禁用按钮
  const itemKey = `${row.order_id}_${row.material_id}`
  if (processingItems.value.has(itemKey)) {
    return false
  }

  // 未发数量大于0，且库存大于0（转换为数字比较）
  const unshippedQty = Number(row.unshipped_quantity) || 0
  const stockQty = Number(row.stock_quantity) || 0
  const canShipResult = unshippedQty > 0 && stockQty > 0

  return canShipResult
}

// 单个发货
const handleSingleShipping = (row) => {
  // 防止重复打开对话框
  if (shippingDialogVisible.value || shippingLoading.value) {
    ElMessage.warning('请先完成当前发货操作')
    return
  }
  
  isBatchShipping.value = false
  shippingItems.value = [{
    ...row,
    shipping_quantity: Math.min(row.unshipped_quantity, row.stock_quantity || 0)
  }]
  shippingForm.outbound_date = new Date()
  shippingForm.remark = ''
  shippingDialogVisible.value = true
}

// 批量发货
const handleBatchShipping = () => {
  // 防止重复打开对话框
  if (shippingDialogVisible.value || shippingLoading.value) {
    ElMessage.warning('请先完成当前发货操作')
    return
  }
  
  if (selectedRows.value.length === 0) {
    ElMessage.warning('请先选择要发货的订单项')
    return
  }
  
  isBatchShipping.value = true
  shippingItems.value = selectedRows.value.map(row => ({
    ...row,
    shipping_quantity: Math.min(row.unshipped_quantity, row.stock_quantity || 0)
  }))
  shippingForm.outbound_date = new Date()
  shippingForm.remark = ''
  shippingDialogVisible.value = true
}

// 处理发货数量输入
const handleShippingQuantityInput = (row) => {
  // 确保输入的是数字
  if (isNaN(row.shipping_quantity) || row.shipping_quantity === null || row.shipping_quantity === '') {
    row.shipping_quantity = 0
    return
  }
  
  // 转换为整数
  row.shipping_quantity = Math.floor(Number(row.shipping_quantity))
  
  // 限制最小值
  if (row.shipping_quantity < 0) {
    row.shipping_quantity = 0
  }
  
  // 限制最大值（不能超过未发数量和库存中的较小值）
  const maxQuantity = Math.min(row.unshipped_quantity, row.stock_quantity || 0)
  if (row.shipping_quantity > maxQuantity) {
    row.shipping_quantity = maxQuantity
  }
}

// 格式化日期为 YYYY-MM-DD（供数据库使用）
const formatDateForDB = (date) => {
  if (!date) return null
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 确认发货
const confirmShipping = async () => {
  // 🔒 第一层防护：防止重复提交（在确认对话框之前检查）
  if (shippingLoading.value) {
    ElMessage.warning('正在处理中，请勿重复操作')
    return
  }

  // 验证发货数量
  const validItems = shippingItems.value.filter(item => item.shipping_quantity > 0)
  if (validItems.length === 0) {
    ElMessage.warning('请至少输入一个发货数量')
    return
  }

  // 🔒 第二层防护：在显示确认对话框前立即设置 loading 状态
  // 这样可以防止用户在对话框显示期间多次点击按钮
  shippingLoading.value = true

  try {
    // 确认对话框
    await ElMessageBox.confirm(
      `确认为 ${validItems.length} 个订单项生成出库单？`,
      '确认发货',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    // 构建出库单数据（批量和单个使用统一结构）
    const orderIds = [...new Set(validItems.map(item => item.order_id))]
    const outboundData = {
      order_id: orderIds[0],
      related_orders: orderIds.length > 1 ? orderIds.slice(1) : undefined,
      is_multi_order: orderIds.length > 1,
      delivery_date: formatDateForDB(shippingForm.outbound_date),
      status: 'draft',
      remarks: shippingForm.remark,
      items: validItems.map(item => ({
        product_id: item.material_id,
        quantity: item.shipping_quantity
      }))
    }

    // 🔒 第三层防护：后端会进行幂等性检查（基于订单ID和时间窗口）
    // 调用销售出库API创建出库单
    await salesApi.createOutbound(outboundData)

    ElMessage.success(isBatchShipping.value ? '批量出库单创建成功' : '出库单创建成功')

    // 将订单项标记为正在处理（禁用发货按钮）
    validItems.forEach(item => {
      const itemKey = `${item.order_id}_${item.material_id}`
      processingItems.value.add(itemKey)
    })

    shippingDialogVisible.value = false
    selectedRows.value = []
    fetchDeliveryStats() // 刷新列表
  } catch (error) {
    // 用户取消操作
    if (error === 'cancel') {
      // 用户取消了确认对话框，重置 loading 状态
      shippingLoading.value = false
      return
    }

    console.error('创建出库单失败:', error)

    // 提取后端返回的错误信息
    const errorMsg = error.response?.data?.error ||
                     error.response?.data?.message ||
                     error.message ||
                     '网络错误'

    // 如果是重复提交错误（409状态码），显示警告而不是错误
    if (error.response?.status === 409) {
      ElMessage.warning(errorMsg)
    } else {
      ElMessage.error('创建出库单失败: ' + errorMsg)
    }
  } finally {
    // 只有在非取消的情况下才重置 loading 状态
    // 如果是取消，loading 已经在 catch 中重置了
    if (shippingLoading.value) {
      shippingLoading.value = false
    }
  }
}

// 禁用未来日期
const disabledDate = (time) => {
  return time.getTime() > Date.now()
}

// 页面加载时获取数据
onMounted(() => {
  // 如果URL中有订单号，自动填充到搜索框
  if (route.query.orderNo) {
    searchForm.search = route.query.orderNo
    ElMessage.info(`已自动筛选订单: ${route.query.orderNo}`)
  }
  fetchDeliveryStats()
})
</script>

<style scoped>
.header-card {
  margin-bottom: 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
  margin-bottom: 0;
}

/* 数据卡片底部留白（当有浮动栏时） */
.data-card.has-floating-bar {
  padding-bottom: 120px;
}

/* 浮动批量操作栏样式 */
.floating-batch-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
  z-index: 1000;
  min-width: 500px;
}

.floating-batch-bar .batch-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
  font-size: 14px;
}

.floating-batch-bar .batch-info .el-icon {
  font-size: 20px;
}

.floating-batch-bar .batch-info strong {
  color: #ffd700;
  font-size: 18px;
  margin: 0 2px;
}

.floating-batch-bar .batch-buttons {
  display: flex;
  gap: 12px;
}

.floating-batch-bar .batch-buttons .el-button {
  border: 1px solid rgba(255, 255, 255, 0.3);
  transition: all 0.3s ease;
}

.floating-batch-bar .batch-buttons .el-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* 浮动栏进入/离开动画 */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from {
  transform: translateX(-50%) translateY(100px);
  opacity: 0;
}

.slide-up-leave-to {
  transform: translateX(-50%) translateY(100px);
  opacity: 0;
}

.batch-buttons .el-button {
  border: 1px solid rgba(255, 255, 255, 0.3);
  transition: all var(--transition-base);
}

.batch-buttons .el-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.text-red {
  color: var(--color-danger);
  font-weight: bold;
}

.text-green {
  color: var(--color-success);
  font-weight: bold;
}

.order-info {
  margin-bottom: var(--spacing-lg);
}

.order-info h4,
.delivery-details h4 {
  margin: 0 0 16px 0;
  color: var(--color-text-primary);
  font-size: 16px;
  font-weight: 600;
}

:deep(.el-progress-bar__outer) {
  border-radius: var(--radius-sm);
}

:deep(.el-progress-bar__inner) {
  border-radius: var(--radius-sm);
}

:deep(.el-table .el-table__cell) {
  padding: 8px 0;
}

:deep(.el-card__body) {
  padding: 20px;
}

:deep(.el-form--inline .el-form-item) {
  margin-right: 16px;
  margin-bottom: var(--spacing-base);
}

/* 发货对话框样式 */
:deep(.el-dialog__body) {
  max-height: 60vh;
  overflow-y: auto;
}

/* 详情对话框长文本处理 - 自动添加 */
:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
