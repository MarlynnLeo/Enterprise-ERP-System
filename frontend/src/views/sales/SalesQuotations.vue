<!--
/**
 * SalesQuotations.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page quotation-container">
    <!-- 页面标题 -->
    <PageHeader title="销售报价管理" subtitle="管理销售报价与询价">
      <template #actions>
<el-button v-permission="'sales:quotations:create'" type="primary" :icon="Plus" @click="showCreateDialog">新增报价单</el-button>
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
        <el-form-item label="报价状态">
          <el-select v-model="statusFilter" placeholder="报价状态" clearable @change="handleSearch">
              <el-option
                v-for="item in quotationStatuses"
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
            value-format="YYYY-MM-DD"
            />
        </el-form-item>
      </template>
    </FinanceQueryCard>
    <!-- 统计卡片 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover" @click="resetStatusFilter">
        <div class="stat-value">{{ quotationStats.total }}</div>
        <div class="stat-label">全部报价</div>
      </el-card>
      <el-card class="stat-card" shadow="hover" @click="setStatusFilter('draft')">
        <div class="stat-value">{{ quotationStats.pending }}</div>
        <div class="stat-label">待确认</div>
      </el-card>
      <el-card class="stat-card" shadow="hover" @click="setStatusFilter('accepted')">
        <div class="stat-value">{{ quotationStats.confirmed }}</div>
        <div class="stat-label">已确认</div>
      </el-card>
      <el-card class="stat-card" shadow="hover" @click="setStatusFilter('converted')">
        <div class="stat-value">{{ quotationStats.converted }}</div>
        <div class="stat-label">已转订单</div>
      </el-card>
      <el-card class="stat-card" shadow="hover" @click="setStatusFilter('expired')">
        <div class="stat-value">{{ quotationStats.expired }}</div>
        <div class="stat-label">已过期</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ conversionRate }}%</div>
        <div class="stat-label">转化率</div>
      </el-card>
      </div>
    <!-- 报价单表格 -->
    <el-card class="data-card">
      <el-table
        :data="quotations"
        border
        class="w-full"
        v-loading="loading"
        table-layout="fixed"
      >
        <template #empty>
          <EmptyState description="暂无报价单数据" />
        </template>
        <el-table-column prop="quotationNo" label="报价单号" width="150" />
        <el-table-column label="客户名称" min-width="150">
          <template #default="scope">
            {{ getCustomerName(scope.row.customerId) }}
          </template>
        </el-table-column>
        <el-table-column prop="totalAmount" label="总金额" width="120">
          <template #default="scope">
            {{ formatCurrency(scope.row.totalAmount) }}
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建日期" width="120">
          <template #default="scope">
            {{ formatDate(scope.row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column prop="validityDate" label="有效期至" width="120">
          <template #default="scope">
            {{ formatDate(scope.row.validityDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">{{ getStatusLabel(scope.row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="350" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="scope">
            <div class="table-actions">
              <el-button class="btn-op-view" type="primary" size="small" @click="handleView(scope.row)">
                <el-icon><View /></el-icon> 查看
              </el-button>
              <el-button
                v-if="scope.row.status === 'draft'"
                size="small"
                @click="handleEdit(scope.row)"
                v-permission="'sales:quotations:update'"
              >
                <el-icon><Edit /></el-icon> 编辑
              </el-button>
              <el-popconfirm
                v-if="scope.row.status === 'draft'"
                title="确定要删除该报价单吗？此操作无法恢复。"
                @confirm="handleDelete(scope.row)"
                confirm-button-type="danger"
              >
                <template #reference>
                  <el-button v-permission="'sales:quotations:delete'" size="small" type="danger">
                    <el-icon><Delete /></el-icon> 删除
                  </el-button>
                </template>
              </el-popconfirm>
              <el-popconfirm
                v-if="scope.row.status === 'draft'"
                title="确定要确认该报价单吗？确认后将无法再编辑。"
                @confirm="handleConfirm(scope.row)"
              >
                <template #reference>
                  <el-button size="small" type="success" v-permission="'sales:quotations:update'">
                    <el-icon><Check /></el-icon> 确认
                  </el-button>
                </template>
              </el-popconfirm>
              <el-button
                v-if="scope.row.status === 'accepted' && !scope.row.orderId"
                size="small"
                type="success"
                v-permission="'sales:quotations:update'"
                @click="handleConvert(scope.row)"
              >
                <el-icon><Right /></el-icon> 转订单
              </el-button>
            </div>
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
          @size-change="fetchData"
          @current-change="fetchData"
        />
      </div>
    </el-card>

    <!-- 创建/编辑报价单对话框 -->
    <AppDialog
      v-model="dialogVisible"
      :title="dialogType === 'create' ? '创建报价单' : '编辑报价单'"
      mode="form"
      wide
    >
      <div v-loading="dialogLoading">
      <el-form :model="quotationForm" ref="quotationFormRef" :rules="rules" label-width="100px">
        <el-form-item label="客户" prop="customerId">
          <el-select
            v-model="quotationForm.customerId"
            placeholder="请选择客户"
            filterable
            remote
            clearable
            :remote-method="searchCustomers"
            :loading="customerLoading"
            class="w-full"
          >
            <el-option
              v-for="customer in customers"
              :key="customer.id"
              :label="customer.name"
              :value="customer.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="有效期至" prop="validityDate">
          <el-date-picker
            v-model="quotationForm.validity_date"
            type="date"
            placeholder="选择有效期"
            :disabled="dialogType === 'view'"
            class="w-full"
          />
        </el-form-item>

        <!-- 添加BOM查看字段 -->
        <el-form-item label="选择BOM">
          <div class="flex-gap">
            <el-select
              v-model="selectedProductId"
              placeholder="选择产品BOM"
              filterable
              remote
              clearable
              :remote-method="searchProducts"
              :loading="productLoading"
              :disabled="dialogType === 'view'"
              @change="handleProductBomChange"
              class="w-full"
            >
              <el-option
                v-for="product in products"
                :key="product.id"
                :label="product.name"
                :value="product.id"
              >
                <div class="flex-between-center">
                  <span class="font-weight-700">{{ product.code || product.id }}</span>
                  <span class="text-muted text-md">{{ product.name }}</span>
                </div>
              </el-option>
            </el-select>
            <el-button
              type="primary"
              @click="loadBomDetails"
              :disabled="!selectedProductId || dialogType === 'view'"
            >
              加载BOM
            </el-button>
          </div>
        </el-form-item>

        <!-- 报价单明细 -->
        <el-form-item label="报价明细">
          <div class="materials-table-container">
              <el-table
                :data="quotationForm.items"
                border
              class="w-full"
              table-layout="fixed"
              :header-cell-style="{ background: 'var(--color-bg-hover)', color: 'var(--color-text-regular)' }"
              empty-text="请添加报价物料"
              >
                <el-table-column label="产品" min-width="200">
                  <template #default="{ row, $index }">
                    <el-select
                      v-model="row.productId"
                      placeholder="选择产品"
                      filterable
                      remote
                      clearable
                      :remote-method="searchProducts"
                      :loading="productLoading"
                      :disabled="dialogType === 'view'"
                      @change="() => handleProductChange($index)"
                      class="w-full"
                    >
                      <el-option
                        v-for="product in products"
                        :key="product.id"
                        :label="product.name"
                        :value="product.id"
                      >
                        <div class="flex-between-center">
                          <span class="font-weight-700">{{ product.code || product.id }}</span>
                          <span class="text-muted text-md">{{ product.name }}</span>
                        </div>
                      </el-option>
                    </el-select>
                  </template>
                </el-table-column>

              <el-table-column label="规格" min-width="180">
                  <template #default="{ row }">
                    <el-input v-model="row.specification" disabled placeholder="规格" />
                  </template>
                </el-table-column>

              <el-table-column label="数量" width="120">
                  <template #default="{ row, $index }">
                  <el-input
                      v-model="row.quantity"
                    placeholder="输入数量"
                      :disabled="dialogType === 'view'"
                    @input="() => calculateItemAmount($index)"
                    type="number"
                    min="1"
                    />
                  </template>
                </el-table-column>

              <el-table-column label="单价" width="120">
                  <template #default="{ row, $index }">
                  <el-input
                      v-model="row.unitPrice"
                    placeholder="输入单价"
                      :disabled="dialogType === 'view'"
                    @input="() => calculateItemAmount($index)"
                    type="number"
                    min="0"
                    step="0.01"
                    />
                  </template>
                </el-table-column>

              <el-table-column label="金额" width="120">
                  <template #default="{ row }">
                    {{ formatQuotationLineAmount(row) }}
                  </template>
                </el-table-column>

              <el-table-column label="操作" min-width="120" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
                  <template #default="{ $index }">
                    <el-button
                      type="danger"
                      size="small"
                      @click="removeItem($index)"
                      v-if="dialogType !== 'view'"

              v-permission="dialogType === 'create' ? 'sales:quotations:create' : 'sales:quotations:update'">
                    删除
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>

            <div class="add-material mt-10 flex-between-center">
              <el-button type="primary" v-permission="dialogType === 'create' ? 'sales:quotations:create' : 'sales:quotations:update'" @click="addItem" v-if="dialogType !== 'view'">
                <el-icon><Plus /></el-icon> 添加产品
              </el-button>

              <div class="text-lg-bold" v-if="quotationForm.items.length > 0">
                总计金额：
                <span class="text-amount-lg">
                  {{ formatCurrency(calculateTotalAmount()) }}
                </span>
              </div>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            type="textarea"
            v-model="quotationForm.remarks"
            :disabled="dialogType === 'view'"
          />
        </el-form-item>
      </el-form>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button v-permission="dialogType === 'create' ? 'sales:quotations:create' : 'sales:quotations:update'" type="primary" @click="submitQuotation" :loading="dialogLoading">保存</el-button>
        </span>
      </template>
        </AppDialog>
    <!-- 查看报价单对话框 -->
    <AppDialog
      v-model="viewDialogVisible"
      title="报价单详情"
      mode="view"
      content-width="wide"
    >
      <div v-loading="viewDialogLoading">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="报价单号">{{ currentQuotation.quotation_no || '-' }}</el-descriptions-item>
        <el-descriptions-item label="客户名称">{{ currentQuotation.customerName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="有效期至">{{ formatDate(currentQuotation.validity_date) }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentQuotation.status)">
            {{ getStatusText(currentQuotation.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="总金额">{{ formatCurrency(currentQuotation.totalAmount) }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDateTime(currentQuotation.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ currentQuotation.remarks || '无' }}</el-descriptions-item>
      </el-descriptions>
      <el-divider>报价明细</el-divider>
      <el-table :data="currentQuotation.items" border class="w-full">
        <el-table-column prop="productName" label="产品名称" min-width="150" />
        <el-table-column prop="specification" label="规格" min-width="120" />
        <el-table-column prop="quantity" label="数量" width="100" />
      </el-table>
      <!-- 合计行 -->
      <div class="summary-box-right">
        <span class="text-lg-bold text-regular">
          合计：{{ formatCurrency(currentQuotation.totalAmount) }}
        </span>
      </div>
      </div>
    </AppDialog>
  </div>
</template>
<script setup>
import { formatLocalDate } from '@/utils/format';
import { parseListData } from '@/utils/responseParser';
import { formatDate, formatDateTime } from '@/utils/helpers/dateUtils'
import { formatCurrency } from '@/utils/helpers/formatters'
import dayjs from 'dayjs'
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { baseDataApi, salesApi } from '@/api'
import { Plus, View, Edit, Delete, Check, Right } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import {
  loadCustomerOptions,
  loadMaterialOptions,
  searchCustomerOptions,
  searchMaterialOptions,
} from '@/utils/optionLoaders'
// 销售报价功能 - 完善版
// 支持报价单的创建、编辑、查看、删除和转为订单功能
// 实现了与后端的真实API交互
const router = useRouter()
const loading = ref(false)
const quotations = ref([])
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const searchQuery = ref('')
const statusFilter = ref('')
const dateRange = ref([])
// 报价单统计数据
const quotationStats = ref({
  total: 0,
  pending: 0,
  confirmed: 0,
  converted: 0,
  expired: 0
})
const monthlyQuotations = ref(0)
const monthlyAmount = ref(0)
const conversionRate = ref(0)
const customers = ref([])
const customerLoading = ref(false)
const dialogVisible = ref(false)
const dialogLoading = ref(false)
const dialogType = ref('create')
const quotationFormRef = ref(null)
// 查看对话框控制
const viewDialogVisible = ref(false)
const viewDialogLoading = ref(false)
const currentQuotation = ref({
  quotation_no: '',
  customer_name: '',
  validity_date: '',
  status: '',
  total_amount: null,
  created_at: '',
  items: []
})
const isBlankAmount = (value) => value === null || value === undefined || value === ''
const toMoneyNumber = (value) => {
  if (isBlankAmount(value)) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
const formatQuotationLineAmount = (row) => {
  const quantity = toMoneyNumber(row?.quantity)
  const unitPrice = toMoneyNumber(row?.unitPrice)
  if (quantity === null || unitPrice === null) return '-'
  return formatCurrency(quantity * unitPrice)
}
// 产品列表
const products = ref([])
const productLoading = ref(false)
// BOM相关数据
const selectedProductId = ref('') // 选中的产品ID
const loadingBom = ref(false) // BOM加载状态
// 表单数据
const quotationForm = ref({
  customer_id: '',
  validity_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 默认30天有效期
  items: [
    {
      product_id: '',
      specification: '',
      quantity: 1,
      unit_price: 0,
      amount: 0
    }
  ],
  remarks: ''
})
// 表单验证规则
const rules = {
  customer_id: [
    { required: true, message: '请选择客户', trigger: 'change' }
  ],
  validity_date: [
    { required: true, message: '请选择有效期', trigger: 'change' }
  ]
}
// 状态映射
const quotationStatuses = [
  { value: 'draft', label: '待确认' },
  { value: 'sent', label: '已发送' },
  { value: 'accepted', label: '已确认' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'expired', label: '已过期' }
]
import { getSalesQuotationStatusText, getSalesQuotationStatusColor } from '@/constants/systemConstants'
// 获取状态类型（使用统一常量）
const getStatusType = (status) => {
  return getSalesQuotationStatusColor(status)
}
// 获取状态文本（使用统一常量）
const getStatusText = (status) => {
  return getSalesQuotationStatusText(status)
}
// 获取状态显示文本
const getStatusLabel = (status) => {
  const statusItem = quotationStatuses.find(item => item.value === status)
  return statusItem ? statusItem.label : status
}
// 格式化日期
// formatDate 已统一引用公共实现
// 格式化日期时间
// formatDateTime 已统一引用公共实现
// 计算统计数据
const calculateQuotationStats = () => {
  const stats = {
    total: quotations.value.length,
    pending: 0,
    confirmed: 0,
    converted: 0,
    expired: 0
  }

  quotations.value.forEach(quotation => {
    if (quotation.status === 'draft') stats.pending++
    else if (quotation.status === 'accepted') stats.confirmed++
    else if (quotation.status === 'sent' && quotation.orderId) stats.converted++
    else if (quotation.status === 'expired') stats.expired++
  })

  quotationStats.value = stats
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
// 重置状态过滤器
const resetStatusFilter = () => {
  statusFilter.value = ''
  fetchData()
}
// 设置状态过滤器
const setStatusFilter = (status) => {
  statusFilter.value = status
  fetchData()
}
// 获取报价单数据
const fetchData = async () => {
  loading.value = true
  try {
    // 构建查询参数
    const params = {}
    if (searchQuery.value) params.search = searchQuery.value
    if (statusFilter.value) params.status = statusFilter.value
    if (dateRange.value && dateRange.value.length === 2) {
      params.startDate = dayjs(dateRange.value[0]).format('YYYY-MM-DD')
      params.endDate = dayjs(dateRange.value[1]).format('YYYY-MM-DD')
    }
    params.page = currentPage.value
    params.pageSize = pageSize.value
    // 调用API获取数据
    const response = await salesApi.getQuotations(params)
    if (response && response.data) {
      // 使用统一解析器
      quotations.value = parseListData(response, { enableLog: false })
      total.value = Number(response.data?.total) || quotations.value.length
      calculateQuotationStats()
    }
    loading.value = false

    // 获取统计数据
    fetchQuotationStats()
  } catch (error) {
    console.error('获取报价单数据失败:', error)
    ElMessage.error('获取报价单数据失败')
    loading.value = false
  }
}
// 获取报价单统计数据
const fetchQuotationStats = async () => {
  try {
    const response = await salesApi.getQuotationStatistics()
    if (response && response.data) {
      // 更新统计数据
      monthlyQuotations.value = response.data.monthlyCount || 0
      monthlyAmount.value = response.data.monthlyAmount || 0
      conversionRate.value = response.data.conversionRate ?
        (response.data.conversionRate * 100).toFixed(2) : 0
    }
  } catch (error) {
    console.error('获取报价单统计数据失败:', error)
  }
}
const normalizeCustomerOption = (customer) => ({
  ...customer,
  id: customer.id,
  name: customer.name || customer.customerName || '',
  code: customer.customerCode || '',
})

const normalizeProductOption = (product) => ({
  ...product,
  id: product.id,
  code: product.code || product.materialCode || '',
  name: product.name || product.materialName || '',
  specs: product.specs || product.specification || '',
  unit_name: product.unitName || product.unit || '',
  price: product.price ?? product.sale_price ?? null,
  sale_price: product.sale_price ?? product.price ?? null,
})

// 获取客户数据
const fetchCustomers = async () => {
  customerLoading.value = true
  try {
    customers.value = (await loadCustomerOptions()).map(normalizeCustomerOption)
  } catch (error) {
    console.error('获取客户数据失败:', error)
    ElMessage.error('获取客户数据失败')
    customers.value = []
  } finally {
    customerLoading.value = false
  }
}

const searchCustomers = async (query) => {
  const keyword = String(query || '').trim()
  customerLoading.value = true
  try {
    const list = keyword ? await searchCustomerOptions(keyword) : await loadCustomerOptions()
    customers.value = list.map(normalizeCustomerOption)
  } catch (error) {
    console.error('搜索客户失败:', error)
    customers.value = []
  } finally {
    customerLoading.value = false
  }
}

// 获取产品列表
const fetchProducts = async () => {
  productLoading.value = true
  try {
    products.value = (await loadMaterialOptions()).map(normalizeProductOption)
  } catch (error) {
    console.error('获取产品列表失败:', error)
    products.value = []
  } finally {
    productLoading.value = false
  }
}

const searchProducts = async (query) => {
  const keyword = String(query || '').trim()
  productLoading.value = true
  try {
    const list = keyword ? await searchMaterialOptions(keyword) : await loadMaterialOptions()
    products.value = list.map(normalizeProductOption)
  } catch (error) {
    console.error('搜索产品失败:', error)
    products.value = []
  } finally {
    productLoading.value = false
  }
}
// 根据产品ID获取产品信息
const getProductById = (productId) => {
  return products.value.find(p => p.id === productId)
}
// 产品选择变更处理
const handleProductChange = (index) => {
  const item = quotationForm.value.items[index]
  if (item.productId) {
    const product = getProductById(item.productId)
    if (product) {
      item.specification = product.specs || ''
      item.unitPrice = isBlankAmount(product.sale_price ?? product.price) ? null : (product.sale_price ?? product.price)
      calculateItemAmount(index)
    }
  }
}
// 在组件挂载时获取数据
onMounted(() => {
  fetchData()
  fetchCustomers()
  fetchProducts()
})
// 添加明细项
const addItem = () => {
  quotationForm.value.items.push({
    product_id: '',
    specification: '',
    quantity: 1,
    unit_price: 0,
    amount: 0
  })
}
// 移除明细项
const removeItem = (index) => {
  quotationForm.value.items.splice(index, 1)
}
// 计算明细项金额
const calculateItemAmount = (index) => {
  const item = quotationForm.value.items[index]
  if (item) {
    const quantity = toMoneyNumber(item.quantity)
    const unitPrice = toMoneyNumber(item.unitPrice)
    item.amount = quantity === null || unitPrice === null ? null : quantity * unitPrice
  }
}
// 计算总金额
const calculateTotalAmount = () => {
  return quotationForm.value.items.reduce((sum, item) => {
    const quantity = toMoneyNumber(item.quantity)
    const unitPrice = toMoneyNumber(item.unitPrice)
    return sum + (quantity === null || unitPrice === null ? 0 : quantity * unitPrice)
  }, 0)
}
// 显示创建对话框
const showCreateDialog = () => {
  dialogType.value = 'create'
  selectedProductId.value = '' // 重置选中的产品ID
  quotationForm.value = {
    customer_id: '',
    validity_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 默认30天有效期
    items: [
      {
        product_id: '',
        specification: '',
        quantity: 1,
        unit_price: 0,
        amount: 0
      }
    ],
    remarks: ''
  }
  dialogVisible.value = true
}
// 提交报价单
const submitQuotation = async () => {
  if (!quotationFormRef.value) return

  await quotationFormRef.value.validate(async (valid) => {
    if (valid) {
      try {
        dialogLoading.value = true

        const invalidPriceItem = quotationForm.value.items.find(item => toMoneyNumber(item.quantity) > 0 && toMoneyNumber(item.unitPrice) === null)
        if (invalidPriceItem) {
          ElMessage.error(`产品 ${invalidPriceItem.productName || invalidPriceItem.productId || ''} 缺少有效单价，无法保存报价`)
          dialogLoading.value = false
          return
        }

        // 计算总金额
        const totalAmount = quotationForm.value.items.reduce((sum, item) => {
          return sum + ((toMoneyNumber(item.quantity) || 0) * (toMoneyNumber(item.unitPrice) || 0))
        }, 0)

        // 构建提交数据
        const quotationData = {
          quotation: {
            customer_id: quotationForm.value.customerId,
            remarks: quotationForm.value.remarks,
            total_amount: totalAmount,
            validity_date: quotationForm.value.validity_date,
            status: 'draft'
          },
          items: quotationForm.value.items.map(item => ({
            product_id: item.productId,
            quantity: toMoneyNumber(item.quantity) || 0,
            unit_price: toMoneyNumber(item.unitPrice),
            total_price: (toMoneyNumber(item.quantity) || 0) * (toMoneyNumber(item.unitPrice) || 0)
          }))
        }

        if (dialogType.value === 'create') {
          await salesApi.createQuotation(quotationData)
          ElMessage.success('报价单创建成功')
        } else {
          await salesApi.updateQuotation(quotationForm.value.id, quotationData)
          ElMessage.success('报价单更新成功')
        }

        dialogVisible.value = false
        fetchData() // 刷新数据
      } catch (error) {
        console.error('保存报价单失败:', error)
        ElMessage.error('保存报价单失败')
      } finally {
        dialogLoading.value = false
      }
    }
  })
}
// 删除报价单
const handleDelete = async (row) => {
  try {
    await salesApi.deleteQuotation(row.id)
    ElMessage.success('报价单删除成功')
    fetchData()
  } catch (error) {
    console.error('删除报价单失败:', error)
    ElMessage.error('删除报价单失败')
  }
}
// 确认报价单
const handleConfirm = async (row) => {
  ElMessageBox.confirm('确定要确认该报价单吗？', '确认操作', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      // 首先获取完整的报价单数据
      const response = await salesApi.getQuotation(row.id)
      if (!response || !response.data) {
        throw new Error('获取报价单数据失败')
      }

      const currentQuotation = response.data

      // 构建更新数据，保留所有原始字段，仅更新状态
      const updateData = {
        quotation: {
          customer_id: currentQuotation.customerId,
          total_amount: currentQuotation.totalAmount,
          validity_date: currentQuotation.validity_date,
          remarks: currentQuotation.remarks || '',
          status: 'accepted'
        },
        items: currentQuotation.items || []
      }

      // 调用API确认报价单
      await salesApi.updateQuotation(row.id, updateData)
      ElMessage.success('报价单已确认')
      fetchData()
    } catch (error) {
      console.error('确认报价单失败:', error)
      ElMessage.error('确认报价单失败: ' + (error.message || '未知错误'))
    }
  }).catch(() => {
    // 用户取消操作
  })
}
// 刷新数据
const _refreshData = () => {
  fetchData()
}
// 查看报价单详情
const handleView = async (row) => {
  viewDialogVisible.value = true
  viewDialogLoading.value = true
  try {
    // 获取报价单详情
    const response = await salesApi.getQuotation(row.id)
    if (response && response.data) {
      const quotation = response.data
      // 设置查看数据
      currentQuotation.value = {
        quotation_no: quotation.quotation_no || '-',
        customer_name: quotation.customerName || '-',
        validity_date: quotation.validity_date || '',
        status: quotation.status || 'draft',
        total_amount: isBlankAmount(quotation.totalAmount) ? null : quotation.totalAmount,
        created_at: quotation.createdTime || new Date().toISOString(),
        remarks: quotation.remarks || '',
        items: quotation.items || []
      }
    }
  } catch (error) {
    console.error('获取报价单详情失败:', error)
    ElMessage.error('获取报价单详情失败')
  } finally {
    viewDialogLoading.value = false
  }
}
// 编辑报价单
const handleEdit = async (row) => {
  dialogType.value = 'edit'
  dialogVisible.value = true
  dialogLoading.value = true
  selectedProductId.value = ''

  try {
    const response = await salesApi.getQuotation(row.id)
    if (response && response.data) {
      const quotationData = response.data
      quotationForm.value = {
        id: quotationData.id,
        customer_id: quotationData.customerId,
        validity_date: quotationData.validity_date ? new Date(quotationData.validity_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        items: quotationData.items && quotationData.items.length > 0 ? [...quotationData.items] : [
          {
            product_id: '',
            specification: '',
            quantity: 1,
            unit_price: 0,
            amount: 0
          }
        ],
        remarks: quotationData.remarks || ''
      }
    }
  } catch (error) {
    console.error('获取报价单数据失败:', error)
    ElMessage.error('获取报价单数据失败')
    dialogVisible.value = false
  } finally {
    dialogLoading.value = false
  }
}
// 转为销售订单
const handleConvert = (row) => {
  ElMessageBox.confirm('确定将此报价单转为销售订单？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      // 首先获取完整的报价单数据
      const quotationResponse = await salesApi.getQuotation(row.id)
      if (!quotationResponse || !quotationResponse.data) {
        throw new Error('获取报价单数据失败')
      }

      const quotationData = quotationResponse.data
      const hasMaskedAmount = isBlankAmount(quotationData.totalAmount) ||
        (quotationData.items || []).some(item => isBlankAmount(item.unitPrice))
      if (hasMaskedAmount) {
        throw new Error('报价金额或单价不可见，不能转换为销售订单')
      }

      // 构建销售订单数据
      const orderData = {
        customer_id: quotationData.customerId,
        delivery_address: quotationData.address || '',
        contact_person: quotationData.contact || '',
        contact_phone: quotationData.phone || '',
        delivery_date: formatDateToISOString(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // 默认7天后交货
        order_date: formatDateToISOString(new Date()),
        status: 'pending',
        remarks: `由报价单 ${quotationData.quotation_no || row.quotationNo} 转换`,
        total_amount: quotationData.totalAmount,
        items: (quotationData.items || []).map(item => ({
          material_id: item.productId,
          quantity: toMoneyNumber(item.quantity) || 0,
          unit_price: toMoneyNumber(item.unitPrice),
          specification: item.specification || '',
          notes: ''
        }))
      }

      // 日期格式化辅助函数
      function formatDateToISOString(date) {
        return formatLocalDate(date);
      }

      // 创建销售订单
      const orderResponse = await salesApi.createOrder(orderData)

      if (!orderResponse || !orderResponse.data) {
        throw new Error('创建销售订单失败')
      }

      // 更新报价单状态为已转订单
      await salesApi.convertQuotationToOrder(row.id)

        ElMessage.success(`报价单 ${row.quotationNo} 已成功转为销售订单`)

      // 跳转到新创建的订单详情页
      if (orderResponse.data.id) {
        router.push(`/sales/orders?id=${orderResponse.data.id}`)
      } else {
        // 刷新报价单列表
        fetchData()
      }
    } catch (error) {
      console.error('转换报价单失败:', error)
      ElMessage.error('转换报价单失败: ' + (error.message || '未知错误'))
    }
  }).catch(() => {})
}
// 获取客户名称
const getCustomerName = (customerId) => {
  const customer = customers.value.find(c => c.id === customerId)
  return customer ? customer.name : customerId || '未指定客户'
}
// 处理产品BOM选择变化
const handleProductBomChange = (_productId) => {
  // 当产品选择变化时，可以在这里做一些额外处理
}
// 加载BOM详情
const loadBomDetails = async () => {
  if (!selectedProductId.value) {
    ElMessage.warning('请先选择产品')
    return
  }

  try {
    loadingBom.value = true
    // 移除加载提示

    // 调用API获取产品的BOM详情 - 使用getBoms而不是getBom
    const response = await baseDataApi.getBoms({
      product_id: selectedProductId.value,
      status: 1 // 获取状态为活跃的BOM
    })
    const bomList = parseListData(response)
    if (bomList.length === 0) {
      ElMessage.warning('未找到该产品的BOM信息')
      return
    }
    // 获取第一个BOM的详情
    const bom = bomList[0]
    if (!bom.details || !Array.isArray(bom.details) || bom.details.length === 0) {
      ElMessage.warning('该产品的BOM不包含任何零部件')
      return
    }

    const bomDetails = bom.details

    // 将BOM零部件添加到报价明细中
    const newItems = bomDetails.map(detail => {
      // 尝试从产品列表中查找对应产品的价格信息
      const product = products.value.find(p => p.id === detail.materialId);
      const unitPrice = product ? (product.salePrice || 0) : 0;

      return {
        product_id: detail.materialId,
        material_id: detail.materialId,
        specification: detail.materialCode ? `${detail.materialCode} - ${detail.materialName}` : detail.materialName,
        quantity: parseFloat(detail.quantity) || 1,
        unit_price: unitPrice, // 使用找到的产品价格
        amount: (parseFloat(detail.quantity) || 1) * unitPrice, // 计算金额
        // 添加额外信息
        material_code: detail.materialCode,
        material_name: detail.materialName,
        unit_id: detail.unitId,
        unit_name: detail.unitName
      }
    })

    // 如果当前报价单只有一个空项，则替换；否则追加
    if (quotationForm.value.items.length === 1 && !quotationForm.value.items[0].productId) {
      quotationForm.value.items = newItems
    } else {
      // 过滤掉已存在的产品，避免重复添加
      const existingProductIds = quotationForm.value.items.map(item => item.productId)
      const filteredNewItems = newItems.filter(item => !existingProductIds.includes(item.productId))

      if (filteredNewItems.length === 0) {
        ElMessage.info('所有BOM零部件已经存在于报价明细中')
        return
      }

      quotationForm.value.items.push(...filteredNewItems)
    }

    ElMessage.success(`成功添加 ${newItems.length} 个BOM零部件到报价明细`)

  } catch (error) {
    console.error('加载BOM详情失败:', error)
    // 如果用户取消操作，不显示错误信息
    if (error !== 'cancel' && error.message !== 'cancel') {
      ElMessage.error('加载BOM详情失败: ' + (error.message || '未知错误'))
    }
  } finally {
    loadingBom.value = false
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
}
.materials-table-container {
  margin-bottom: var(--spacing-base);
  width: 100%;
  overflow-x: auto;
}
.add-material {
  margin-top: 10px;
  text-align: right;
}
/* 覆盖Element Plus的默认样式 */
:deep(.el-table .el-table__header-wrapper th) {
  background-color: var(--color-bg-hover);
  color: var(--color-text-regular);
  font-weight: bold;
}
:deep(.el-input-number) {
  width: 100%;
}
:deep(.el-input-number .el-input__wrapper) {
  padding-left: 8px;
  padding-right: 30px;
}
/* 对话框限高由 dialog-system / AppDialog 统一管理 */
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
