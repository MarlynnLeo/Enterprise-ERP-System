<!--
/**
 * SalesQuotations.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="quotation-container">
    <!-- 页面标题 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>销售报价管理</h2>
          <p class="subtitle">管理销售报价与询价</p>
        </div>
        <el-button v-permission="'sales:quotations:create'" type="primary" :icon="Plus" @click="showCreateDialog">新增报价单</el-button>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" class="search-form">
        <el-form-item label="报价单号/客户">
            <el-input 
              v-model="searchQuery"
              placeholder="报价单号/客户名称"
              @keyup.enter="handleSearch"
              clearable ></el-input>
        </el-form-item>
          
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
          
        <el-form-item>
              <el-button type="primary" @click="handleSearch" :loading="loading">
            <el-icon v-if="!loading"><Search /></el-icon> 查询
              </el-button>
              <el-button @click="resetSearch" :loading="loading">
            <el-icon v-if="!loading"><Refresh /></el-icon> 重置
              </el-button>
        </el-form-item>
      </el-form>
    </el-card>

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
        style="width: 100%" 
        v-loading="loading"
        table-layout="fixed"
      >
        <template #empty>
          <el-empty description="暂无报价单数据" />
        </template>
        <el-table-column prop="quotation_no" label="报价单号" width="150" />
        <el-table-column label="客户名称" min-width="150">
          <template #default="scope">
            {{ getCustomerName(scope.row.customer_id) }}
          </template>
        </el-table-column>
        <el-table-column prop="total_amount" label="总金额" width="120">
          <template #default="scope">
            ¥{{ Number(scope.row.total_amount).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建日期" width="120">
          <template #default="scope">
            {{ formatDate(scope.row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column prop="validity_date" label="有效期至" width="120">
          <template #default="scope">
            {{ formatDate(scope.row.validity_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">{{ getStatusLabel(scope.row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="350" fixed="right">
          <template #default="scope">
            <el-button size="small" @click="handleView(scope.row)">
              查看
            </el-button>
            <el-button 
              v-if="scope.row.status === 'draft'" 
              size="small" 
              type="primary" 
              @click="handleEdit(scope.row)"
            
              v-permission="'sales:quotations'">
              编辑
            </el-button>
            <el-popconfirm 
              v-if="scope.row.status === 'draft'" 
              title="确定要删除该报价单吗？此操作无法恢复。"
              @confirm="handleDelete(scope.row)"
              confirm-button-type="danger"
            >
              <template #reference>
                <el-button v-permission="'sales:quotations:delete'" size="small" type="danger">删除</el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm 
              v-if="scope.row.status === 'draft'" 
              title="确定要确认该报价单吗？确认后将无法再编辑。"
              @confirm="handleConfirm(scope.row)"
            >
              <template #reference>
                <el-button size="small" type="success">确认</el-button>
              </template>
            </el-popconfirm>
            <el-button 
              v-if="scope.row.status === 'accepted' && !scope.row.order_id" 
              size="small" 
              type="success" 
              @click="handleConvert(scope.row)"
            >
              转订单
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
          @size-change="fetchData"
          @current-change="fetchData"
        />
      </div>
    </el-card>
    
    <!-- 创建/编辑报价单对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogType === 'create' ? '创建报价单' : '编辑报价单'"
      width="1000px"
      destroy-on-close
      v-if="dialogType !== 'view'"
    >
      <div v-loading="dialogLoading">
      <el-form :model="quotationForm" ref="quotationFormRef" :rules="rules" label-width="100px">
        <el-form-item label="客户" prop="customer_id">
          <el-select v-model="quotationForm.customer_id" placeholder="请选择客户" style="width: 100%">
            <el-option
              v-for="customer in customers"
              :key="customer.id"
              :label="customer.name"
              :value="customer.id"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="有效期至" prop="validity_date">
          <el-date-picker
            v-model="quotationForm.validity_date"
            type="date"
            placeholder="选择有效期"
            :disabled="dialogType === 'view'"
            style="width: 100%"
          />
        </el-form-item>
        
        <!-- 添加BOM查看字段 -->
        <el-form-item label="选择BOM">
          <div style="display: flex; gap: 10px; align-items: center;">
            <el-select 
              v-model="selectedProductId"
              placeholder="选择产品BOM"
              filterable
              clearable
              :disabled="dialogType === 'view'"
              @change="handleProductBomChange"
              style="width: 100%"
            >
              <el-option
                v-for="product in products"
                :key="product.id"
                :label="product.name"
                :value="product.id"
              >
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%">
                  <span style="font-weight: bold">{{ product.code || product.id }}</span>
                  <span style="color: #8492a6; font-size: 13px">{{ product.name }}</span>
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
              style="width: 100%" 
              table-layout="fixed"
              :header-cell-style="{ background: '#f5f7fa', color: '#606266' }"
              empty-text="请添加报价物料"
              >
                <el-table-column label="产品" min-width="200">
                  <template #default="{ row, $index }">
                    <el-select  
                      v-model="row.product_id" 
                      placeholder="选择产品"
                      filterable
                      clearable
                      :disabled="dialogType === 'view'"
                      @change="() => handleProductChange($index)"
                      style="width: 100%"
                    >
                      <el-option
                        v-for="product in products"
                        :key="product.id"
                        :label="product.name"
                        :value="product.id"
                      >
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%">
                          <span style="font-weight: bold">{{ product.code || product.id }}</span>
                          <span style="color: #8492a6; font-size: 13px">{{ product.name }}</span>
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
                      v-model="row.unit_price"
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
                    ¥{{ ((row.quantity || 0) * (row.unit_price || 0)).toFixed(2) }}
                  </template>
                </el-table-column>
                
              <el-table-column label="操作" width="120" fixed="right">
                  <template #default="{ $index }">
                    <el-button
                      type="danger"
                      size="small"
                      @click="removeItem($index)"
                      v-if="dialogType !== 'view'"
                    
              v-permission="'sales:quotations'">
                    删除
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            
            <div class="add-material" style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
              <el-button type="primary" @click="addItem" v-if="dialogType !== 'view'">
                <el-icon><Plus /></el-icon> 添加产品
              </el-button>
              
              <div style="font-size: 16px; font-weight: bold;" v-if="quotationForm.items.length > 0">
                总计金额：
                <span style="color: #f56c6c; font-size: 18px; margin-left: 5px;">
                  ¥{{ calculateTotalAmount().toFixed(2) }}
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
          <el-button v-permission="'sales:quotations:update'" type="primary" @click="submitQuotation" :loading="dialogLoading">保存</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 查看报价单对话框 -->
    <el-dialog
      v-model="viewDialogVisible"
      title="报价单详情"
      width="50%"
    >
      <div v-loading="viewDialogLoading">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="报价单号">{{ currentQuotation.quotation_no || '-' }}</el-descriptions-item>
        <el-descriptions-item label="客户名称">{{ currentQuotation.customer_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="有效期至">{{ formatDate(currentQuotation.validity_date) }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentQuotation.status)">
            {{ getStatusText(currentQuotation.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="总金额">¥{{ (currentQuotation.total_amount || 0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDateTime(currentQuotation.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ currentQuotation.remarks || '无' }}</el-descriptions-item>
      </el-descriptions>

      <el-divider>报价明细</el-divider>

      <el-table :data="currentQuotation.items" border style="width: 100%">
        <el-table-column prop="product_name" label="产品名称" min-width="150" />
        <el-table-column prop="specification" label="规格" min-width="120" />
        <el-table-column prop="quantity" label="数量" width="100" />
      </el-table>

      <!-- 合计行 -->
      <div style="margin-top: 16px; text-align: right; padding: 12px; background-color: #f5f7fa; border: 1px solid #dcdfe6; border-radius: 4px;">
        <span style="font-size: 16px; font-weight: bold; color: #303133;">
          合计：¥{{ (currentQuotation.total_amount || 0).toFixed(2) }}
        </span>
      </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { parseListData } from '@/utils/responseParser';
import { formatDate, formatDateTime } from '@/utils/helpers/dateUtils'

import dayjs from 'dayjs'
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesApi } from '@/services/api'
import { Search, Refresh, Plus } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
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
  total_amount: 0,
  created_at: '',
  items: []
})

// 产品列表
const products = ref([])

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
    else if (quotation.status === 'sent' && quotation.order_id) stats.converted++
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
      monthlyQuotations.value = response.data.monthly_count || 0
      monthlyAmount.value = response.data.monthly_amount || 0
      conversionRate.value = response.data.conversion_rate ? 
        (response.data.conversion_rate * 100).toFixed(2) : 0
    }
  } catch (error) {
    console.error('获取报价单统计数据失败:', error)
  }
}

// 获取客户数据
const fetchCustomers = async () => {
  try {
    const response = await salesApi.getCustomers()
    if (response && response.data) {
      customers.value = response.data
    }
  } catch (error) {
    console.error('获取客户数据失败:', error)
    ElMessage.error('获取客户数据失败')
  }
}

// 获取产品列表
const fetchProducts = async () => {
  try {
    const response = await salesApi.getProductsList()
    if (response && response.data) {
      products.value = response.data
    } else {
      console.error('产品列表API返回格式异常:', response)
      products.value = []
    }
  } catch (error) {
    console.error('获取产品列表失败:', error)
    products.value = []
  }
}

// 根据产品ID获取产品信息
const getProductById = (productId) => {
  return products.value.find(p => p.id === productId)
}

// 产品选择变更处理
const handleProductChange = (index) => {
  const item = quotationForm.value.items[index]
  if (item.product_id) {
    const product = getProductById(item.product_id)
    if (product) {
      item.specification = product.specs || ''
      item.unit_price = product.sale_price || product.price || 0
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
    const quantity = parseFloat(item.quantity) || 0
    const unitPrice = parseFloat(item.unit_price) || 0
    item.amount = quantity * unitPrice
  }
}

// 计算总金额
const calculateTotalAmount = () => {
  return quotationForm.value.items.reduce((sum, item) => {
    return sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0))
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
        
        // 计算总金额
        const totalAmount = quotationForm.value.items.reduce((sum, item) => {
          return sum + (parseFloat(item.quantity) * parseFloat(item.unit_price))
        }, 0)
        
        // 构建提交数据
        const quotationData = {
          quotation: {
            customer_id: quotationForm.value.customer_id,
            remarks: quotationForm.value.remarks,
            total_amount: totalAmount,
            validity_date: quotationForm.value.validity_date,
            status: 'draft'
          },
          items: quotationForm.value.items.map(item => ({
            product_id: item.product_id,
            quantity: parseFloat(item.quantity) || 0,
            unit_price: parseFloat(item.unit_price) || 0,
            total_price: (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)
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
          customer_id: currentQuotation.customer_id,
          total_amount: currentQuotation.total_amount || 0,
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
const refreshData = () => {
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
        customer_name: quotation.customer_name || '-',
        validity_date: quotation.validity_date || '',
        status: quotation.status || 'draft',
        total_amount: Number(quotation.total_amount) || 0,
        created_at: quotation.created_at || quotation.created_time || new Date().toISOString(),
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
        customer_id: quotationData.customer_id,
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
      
      // 构建销售订单数据
      const orderData = {
        customer_id: quotationData.customer_id,
        delivery_address: quotationData.address || '',
        contact_person: quotationData.contact || '',
        contact_phone: quotationData.phone || '',
        delivery_date: formatDateToISOString(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // 默认7天后交货
        order_date: formatDateToISOString(new Date()),
        status: 'pending',
        remarks: `由报价单 ${quotationData.quotation_no || row.quotation_no} 转换`,
        total_amount: quotationData.total_amount || 0,
        items: (quotationData.items || []).map(item => ({
          material_id: item.product_id,
          quantity: parseFloat(item.quantity) || 0,
          unit_price: parseFloat(item.unit_price) || 0,
          specification: item.specification || '',
          notes: ''
        }))
      }
      
      // 日期格式化辅助函数
      function formatDateToISOString(date) {
        return date.toISOString().split('T')[0];
      }
      
      // 创建销售订单
      const orderResponse = await salesApi.createOrder(orderData)
      
      if (!orderResponse || !orderResponse.data) {
        throw new Error('创建销售订单失败')
      }
      
      // 更新报价单状态为已转订单
      await salesApi.convertQuotationToOrder(row.id)
      
        ElMessage.success(`报价单 ${row.quotation_no} 已成功转为销售订单`)
      
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
const handleProductBomChange = (productId) => {
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

    // 拦截器已解包，response.data 就是业务数据
    if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
      ElMessage.warning('未找到该产品的BOM信息')
      return
    }

    // 获取第一个BOM的详情
    const bom = response.data[0]

    if (!bom.details || !Array.isArray(bom.details) || bom.details.length === 0) {
      ElMessage.warning('该产品的BOM不包含任何零部件')
      return
    }
    
    const bomDetails = bom.details
    
    // 将BOM零部件添加到报价明细中
    const newItems = bomDetails.map(detail => {
      // 尝试从产品列表中查找对应产品的价格信息
      const product = products.value.find(p => p.id === detail.material_id);
      const unitPrice = product ? (product.sale_price || product.price || 0) : 0;
      
      return {
        product_id: detail.material_id,
        material_id: detail.material_id,
        specification: detail.material_code ? `${detail.material_code} - ${detail.material_name}` : detail.material_name,
        quantity: parseFloat(detail.quantity) || 1,
        unit_price: unitPrice, // 使用找到的产品价格
        amount: (parseFloat(detail.quantity) || 1) * unitPrice, // 计算金额
        // 添加额外信息
        material_code: detail.material_code,
        material_name: detail.material_name,
        unit_id: detail.unit_id,
        unit_name: detail.unit_name
      }
    })
    
    // 如果当前报价单只有一个空项，则替换；否则追加
    if (quotationForm.value.items.length === 1 && !quotationForm.value.items[0].product_id) {
      quotationForm.value.items = newItems
    } else {
      // 过滤掉已存在的产品，避免重复添加
      const existingProductIds = quotationForm.value.items.map(item => item.product_id)
      const filteredNewItems = newItems.filter(item => !existingProductIds.includes(item.product_id))
      
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

/* 注意：对话框基础样式已在全局主题中定义 */
:deep(.el-dialog__body) {
  max-height: calc(80vh - 120px);  /* 页面特定：限制对话框高度 */
  overflow-y: auto;
  /* padding、header、footer 样式使用全局主题定义 */
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