<!--
/**
 * SalesOutbound.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="outbound-container">
    <!-- 页面标题 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>销售出库管理</h2>
          <p class="subtitle">管理销售出库单据</p>
        </div>
        <el-button type="primary" :icon="Plus" @click="showCreateDialog">增加出库单</el-button>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" class="search-form">
        <el-form-item label="出库单号/客户">
          <el-input 
            v-model="searchQuery"
            placeholder="出库单号/订单号/客户名称"
            @keyup.enter="handleSearch"
            clearable ></el-input>
        </el-form-item>
        
        <el-form-item label="出库状态">
          <el-select v-model="statusFilter" placeholder="出库状态" clearable @change="handleSearch">
            <el-option
              v-for="item in outboundStatuses"
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
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon> 查询
          </el-button>
          <el-button @click="resetSearch">
            <el-icon><Refresh /></el-icon> 重置
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 统计卡片 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover" @click="resetStatusFilter">
        <div class="stat-value">{{ outboundStats.total }}</div>
        <div class="stat-label">全部出库单</div>
      </el-card>
      <el-card class="stat-card" shadow="hover" @click="setStatusFilter('draft')">
        <div class="stat-value">{{ outboundStats.draft }}</div>
        <div class="stat-label">草稿</div>
      </el-card>
      <el-card class="stat-card" shadow="hover" @click="setStatusFilter('processing')">
        <div class="stat-value">{{ outboundStats.processing }}</div>
        <div class="stat-label">处理中</div>
      </el-card>
      <el-card class="stat-card" shadow="hover" @click="setStatusFilter('completed')">
        <div class="stat-value">{{ outboundStats.completed }}</div>
        <div class="stat-label">已完成</div>
      </el-card>
      <el-card class="stat-card" shadow="hover" @click="setStatusFilter('cancelled')">
        <div class="stat-value">{{ outboundStats.cancelled }}</div>
        <div class="stat-label">已取消</div>
      </el-card>
    </div>

    <!-- 出库单表格 -->
    <el-card class="data-card">
      <el-table
        :data="outbounds"
        border
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="outbound_no" label="出库单号" width="150" fixed />
        <el-table-column label="关联订单" width="200">
          <template #default="scope">
            <!-- 判断是否为多订单：检查order_nos是否包含逗号，或者related_orders数组长度大于1 -->
            <div v-if="scope.row.is_multi_order || (scope.row.order_nos && scope.row.order_nos.includes(',')) || (Array.isArray(scope.row.related_orders) && scope.row.related_orders.length > 1)">
              <el-popover placement="top-start" width="280" trigger="click">
                <template #reference>
                  <el-tag size="small" type="success" style="cursor: pointer;">
                    多订单
                  </el-tag>
                </template>
                <div>
                  <div style="font-weight: bold; margin-bottom: 6px;">关联订单列表</div>
                  <!-- 优先显示 related_order_details 数组（包含完整订单信息） -->
                  <div v-if="Array.isArray(scope.row.related_order_details) && scope.row.related_order_details.length > 0">
                    <div v-for="(order, index) in scope.row.related_order_details" :key="index" style="margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      <strong>{{ order.order_no }}</strong>
                      <span v-if="order.customer_name" style="color: #666; margin-left: 8px;">{{ order.customer_name }}</span>
                    </div>
                  </div>
                  
                  <!-- 其次显示 order_nos 字符串拆分 -->
                  <div v-else-if="scope.row.order_nos && typeof scope.row.order_nos === 'string'">
                    <div v-for="(no, index) in scope.row.order_nos.split(',')" :key="index" style="margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      <strong>{{ no.trim() }}</strong>
                    </div>
                  </div>
                  
                  <!-- 显示单个 order_no -->
                  <div v-else-if="scope.row.order_no">
                    <div style="margin-bottom: 4px;">
                      <strong>{{ scope.row.order_no }}</strong>
                    </div>
                  </div>
                  
                  <!-- 如果都没有，显示提示信息 -->
                  <div v-else>
                    <div style="color: #999; font-size: 12px;">
                      暂无订单详情
                    </div>
                  </div>
                </div>
              </el-popover>
            </div>
            <div v-else-if="scope.row.order_no || scope.row.order_nos" class="text-blue-600" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              <i class="el-icon-document"></i>
              <span :title="scope.row.order_no || scope.row.order_nos">{{ scope.row.order_no || scope.row.order_nos }}</span>
            </div>
            <div v-else class="text-gray-500">
              无关联订单
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="customer_name" label="客户名称" min-width="200" />
        <el-table-column prop="contract_code" label="合同编码" width="450" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.contract_code || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="delivery_date" label="出库日期" width="120">
          <template #default="scope">
            {{ formatDate(scope.row.delivery_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">{{ getStatusText(scope.row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="280" fixed="right">
          <template #default="scope">
            <el-button size="small" @click="showDetails(scope.row)">
              查看
            </el-button>
            <el-button 
              v-if="scope.row.status === 'draft'" 
              size="small" 
              type="primary" 
              @click="showEditDialog(scope.row)"
            >
              编辑
            </el-button>
            <el-button 
              v-if="scope.row.status === 'draft'" 
              size="small" 
              type="danger" 
              @click="handleDelete(scope.row)"
            >
              删除
            </el-button>
            <el-button 
              v-if="scope.row.status === 'draft'" 
              size="small" 
              type="primary" 
              @click="handleStatusChange(scope.row, 'processing')"
            >
              开始处理
            </el-button>
            <el-button
              v-if="scope.row.status === 'processing'"
              size="small"
              type="primary"
              @click="handleStatusChange(scope.row, 'completed')"
            >
              完成
            </el-button>
            <el-button 
              v-if="scope.row.status === 'completed'" 
              size="small" 
              type="success" 
              @click="printOutbound(scope.row)"
            >
              打印
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="outboundPagination.page"
          v-model:page-size="outboundPagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="outboundPagination.total"
          @size-change="handleOutboundSizeChange"
          @current-change="handleOutboundPageChange"
        >
        </el-pagination>
      </div>
    </el-card>

    <!-- 出库单详情对话框 -->
    <el-dialog v-model="detailsVisible" title="出库单详情" width="50%">
      <div v-loading="detailsLoading" style="min-height: 100px;">
      <div v-if="currentOutbound" class="outbound-detail-content">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="出库单号">{{ currentOutbound.outbound_no }}</el-descriptions-item>
          <el-descriptions-item label="关联订单号">{{ currentOutbound.order_no }}</el-descriptions-item>
          <el-descriptions-item label="客户名称">{{ currentOutbound.customer_name }}</el-descriptions-item>
          <el-descriptions-item label="合同编码">{{ currentOutbound.contract_code || '-' }}</el-descriptions-item>
          <el-descriptions-item label="出库日期">{{ formatDate(currentOutbound.delivery_date) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(currentOutbound.status)">{{ getStatusText(currentOutbound.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间" :span="2">{{ formatDateTime(currentOutbound.created_at) }}</el-descriptions-item>
        </el-descriptions>

        <el-divider>出库明细</el-divider>
        
        <el-table :data="currentOutbound.items || []" style="width: 100%" border>
          <el-table-column prop="product_code" label="物料编码" width="120" />
          <el-table-column prop="product_name" label="物料名称" min-width="150" show-overflow-tooltip />
          <el-table-column prop="specification" label="规格" min-width="150" show-overflow-tooltip />
          <el-table-column prop="quantity" label="数量" width="100" align="center" />
          <el-table-column prop="unit" label="单位" width="80" align="center" />
        </el-table>
      </div>
      </div>
    </el-dialog>

    <!-- 创建/编辑出库单对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogType === 'create' ? '创建出库单' : '编辑出库单'"
      width="50%"
      destroy-on-close
    >
      <div v-loading="dialogLoading" style="min-height: 100px;">
      <el-form :model="outboundForm" ref="outboundFormRef" :rules="rules" label-width="100px">
        <el-form-item label="关联订单">
          <div class="multi-order-container">
            <el-select 
              v-model="selectedOrderId" 
              placeholder="选择订单后自动添加（支持搜索订单号/客户名称/合同编码）" 
              @change="handleAddOrder" 
              filterable
              style="width: 100%"
              clearable
            >
              <el-option
                v-for="order in availableOrders"
                :key="order.id"
                :label="`${order.order_no} - ${order.customer || ''} ${order.contract_code ? '- ' + order.contract_code : ''} (${getOrderStatusText(order.status)})`"
                :value="order.id"
              />
            </el-select>
          </div>
          <!-- 显示已关联的订单 -->
          <div v-if="outboundForm.relatedOrders.length > 0" style="margin-top: 10px; width: 100%;">
            <el-tag 
              v-for="order in outboundForm.relatedOrders" 
              :key="order.id" 
              type="primary"
              effect="plain"
              style="margin-right: 8px; margin-bottom: 5px;"
            >
              {{ order.order_no }}
              <span v-if="order.customer">({{ order.customer }})</span>
            </el-tag>
          </div>
        </el-form-item>

        <el-form-item label="客户信息" prop="customer_id">
          <div style="display: flex; gap: 10px;">
            <el-select
              v-model="outboundForm.customer_id"
              placeholder="请输入客户名称或编码进行搜索"
              filterable
              remote
              :remote-method="searchCustomers"
              :loading="customerLoading"
              style="flex: 1;"
              @change="handleCustomerChange"
              clearable
            >
              <el-option
                v-for="customer in customerOptions"
                :key="customer.id"
                :label="`${customer.name}${customer.code ? ' (' + customer.code + ')' : ''}`"
                :value="customer.id"
              >
                <span style="float: left">{{ customer.name }}</span>
                <span v-if="customer.code" style="float: right; color: #8492a6; font-size: 13px">{{ customer.code }}</span>
              </el-option>
            </el-select>
            <el-button type="primary" @click="openCustomerProductsDialog" :disabled="!outboundForm.customer_id">
              查询产品
            </el-button>
          </div>
        </el-form-item>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="联系人">
              <el-input v-model="outboundForm.contact" placeholder="联系人" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系电话">
              <el-input v-model="outboundForm.phone" placeholder="联系电话" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="收货地址">
          <el-input v-model="outboundForm.address" placeholder="收货地址" type="textarea" :rows="2" />
        </el-form-item>

        <el-form-item label="出库日期" prop="delivery_date">
          <el-date-picker
            v-model="outboundForm.delivery_date"
            type="date"
            placeholder="选择出库日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>

        
        <!-- 出库明细 -->
        <el-form-item label="出库明细">
          <div class="materials-table-container">
            
            <el-table 
              :data="outboundForm.items" 
              border 
              style="width: 100%" 
              table-layout="fixed"
              :header-cell-style="{ background: '#f5f7fa', color: '#606266' }"
              empty-text="该订单所有物料已完全发货，无需再次出库"
            >
              <el-table-column type="selection" width="55" />
              <el-table-column label="来源订单" width="130">
                <template #default="{ row }">
                  <div v-if="row.source_orders && row.source_orders.length > 1">
                    <el-popover placement="top" width="300" trigger="hover">
                      <template #reference>
                        <el-tag size="small" type="success">
                          {{ row.source_orders.length }}个订单
                        </el-tag>
                      </template>
                      <div>
                        <div v-for="source in row.source_orders" :key="source.id" style="margin-bottom: 4px;">
                          <strong>{{ source.order_no }}</strong>: {{ source.quantity }}个
                        </div>
                      </div>
                    </el-popover>
                  </div>
                  <div v-else>
                    {{ row.order_no }}
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="物料编码" prop="material_code" width="120" />
              <el-table-column label="物料名称" prop="product_name" width="160" show-overflow-tooltip />
              <el-table-column label="规格" prop="specification" width="140" show-overflow-tooltip />
              <el-table-column label="订单总量" width="90" align="center">
                <template #default="{ row }">
                  <div>
                    <span style="color: #409EFF; font-weight: bold;">{{ row.order_quantity || row.quantity }}</span>
                    <div v-if="row.source_orders && row.source_orders.length > 1" style="font-size: 10px; color: #909399;">
                      合并{{ row.source_orders.length }}单
                    </div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="已发货" width="80" align="center">
                <template #default="{ row }">
                  <span style="color: #E6A23C; font-weight: bold;">{{ row.shipped_quantity || 0 }}</span>
                </template>
              </el-table-column>
              <el-table-column label="剩余" width="80" align="center">
                <template #default="{ row }">
                  <span style="color: #F56C6C; font-weight: bold;">{{ row.remaining_quantity || row.quantity }}</span>
                </template>
              </el-table-column>
              <el-table-column label="发货数量" width="120">
                <template #default="{ row, $index }">
                  <el-input 
                    v-model="row.quantity" 
                    size="small"

                    @blur="validateQuantity(row, $index)"
                    @input="validateQuantity(row, $index)"
                    placeholder="数量"
                  />
                </template>
              </el-table-column>
              <el-table-column label="单位" prop="unit_name" width="60" align="center" />
              <el-table-column label="库存" width="80" align="center">
                <template #default="{ row }">
                  <span :style="{ color: (row.stock_quantity || 0) > 0 ? '#67c23a' : '#f56c6c' }">
                    {{ row.stock_quantity || 0 }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="100" fixed="right">
                <template #default="{ $index }">
                  <el-button
                    type="danger"
                    size="small"
                    @click="removeItem($index)"
                  >
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
            
          </div>
        </el-form-item>

        <el-form-item label="备注">
          <el-input type="textarea" v-model="outboundForm.remarks" />
        </el-form-item>
      </el-form>
      </div>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="submittingOutbound" @click="submitOutbound">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 客户产品查询对话框 -->
    <el-dialog
      v-model="customerProductsDialogVisible"
      title="客户产品查询"
      width="60%"
      destroy-on-close
    >
      <div v-if="currentCustomer">
        <el-alert
          :title="`正在查询客户：${currentCustomer.name} 的所有订单产品`"
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom: 15px;"
        />
        
        <!-- 搜索区域 -->
        <el-card class="search-card" style="margin-bottom: 15px;">
          <el-form :inline="true" class="search-form">
            <el-form-item label="搜索">
              <el-input
                v-model="productSearchQuery"
                placeholder="请输入合同编码、产品编码或产品规格进行搜索"
                @keyup.enter="searchCustomerProducts"
                @clear="searchCustomerProducts"
                clearable

              >
                <template #append>
                  <el-button @click="searchCustomerProducts" :loading="customerProductsLoading">
                    <el-icon><Search /></el-icon>
                  </el-button>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item>
              <el-button @click="resetProductSearch">
                <el-icon><Refresh /></el-icon> 重置
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>
        
        <el-table 
          :data="customerProducts" 
          border 
          style="width: 100%"
          v-loading="customerProductsLoading"
          :header-cell-style="{ background: '#f5f7fa', color: '#606266' }"
          @selection-change="handleProductSelectionChange"
        >
          <el-table-column type="selection" width="55" />
          <el-table-column label="订单号" width="130">
            <template #default="{ row }">
              <span :title="row.order_nos || row.order_no">
                {{ (row.order_nos || row.order_no || '').length > 12 ? 
                    (row.order_nos || row.order_no || '').substring(0, 12) + '...' : 
                    (row.order_nos || row.order_no || '') }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="合同编码" width="120">
            <template #default="{ row }">
              <span :title="row.contract_codes || ''">
                {{ (row.contract_codes || '').length > 10 ? 
                    (row.contract_codes || '').substring(0, 10) + '...' : 
                    (row.contract_codes || '') }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="material_code" label="物料编码" width="110" />
          <el-table-column prop="material_name" label="物料名称" min-width="140" />
          <el-table-column prop="specification" label="规格" width="110" />
          <el-table-column prop="remaining_quantity" label="剩余数量" width="100" align="center">
            <template #default="{ row }">
              <el-tag type="warning" v-if="row.remaining_quantity > 0">{{ row.remaining_quantity }}</el-tag>
              <el-tag type="success" v-else>已完成</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="stock_quantity" label="库存数量" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.stock_quantity >= row.remaining_quantity ? 'success' : 'danger'">
                {{ Number(row.stock_quantity || 0).toFixed(1) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="unit_name" label="单位" width="80" />
          <el-table-column label="发货数量" width="90">
            <template #default="{ row }">
              <el-input
                v-model="row.selected_quantity"
                size="small"
                @blur="validateSelectedQuantity(row)"
                @input="validateSelectedQuantity(row)"
                placeholder="0"
              />
            </template>
          </el-table-column>
        </el-table>
      </div>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="customerProductsDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="addSelectedProductsToOutbound" :disabled="selectedProducts.length === 0">
            添加选中产品 ({{ selectedProducts.length }})
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import apiAdapter from '@/utils/apiAdapter';
import { parseListData } from '@/utils/responseParser';
import { formatDate } from '@/utils/helpers/dateUtils'

import dayjs from 'dayjs'
import { ref, computed, onMounted, onActivated } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesApi, inventoryApi } from '@/api'
import { usePaginatedFetching, useFormSubmit } from '@/composables/useDataFetching'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { Search, Refresh, Plus } from '@element-plus/icons-vue'
import axios from 'axios'

// 权限store
const authStore = useAuthStore()

// 状态变量
const loading = ref(false)
const orders = ref([])

// 缓存相关
const dataLoaded = ref(false)
const lastLoadTime = ref(0)
const CACHE_DURATION = 30000 // 30秒缓存
const searchQuery = ref('')
const statusFilter = ref('')
const dateRange = ref([])
const dialogVisible = ref(false)
const dialogLoading = ref(false)
const detailsVisible = ref(false)
const detailsLoading = ref(false)
const dialogType = ref('create')
const outboundFormRef = ref(null)
const currentOutbound = ref(null)

// 客户产品查询相关
const customerProductsDialogVisible = ref(false)
const customerProductsLoading = ref(false)
const customerProducts = ref([])
const selectedProducts = ref([])
const currentCustomer = ref(null)
const productSearchQuery = ref('')

// 客户搜索相关
const customerOptions = ref([])
const customerLoading = ref(false)

// 表单数据
const outboundForm = ref({
  order_id: '', // 保留兼容性
  customer_id: '',
  customer_name: '',
  contact: '',
  phone: '',
  address: '',
  delivery_date: '',
  status: 'draft',
  items: [],
  remarks: '',
  relatedOrders: [] // 新增：关联的多个订单
})

// 多订单相关变量
const selectedOrderId = ref('')

// 表单验证规则
const rules = {
  customer_id: [
    { required: true, message: '请选择客户', trigger: 'change' }
  ],
  delivery_date: [
    { required: true, message: '请选择出库日期', trigger: 'change' }
  ]
}

// 出库单统计数据
const outboundStats = ref({
  total: 0,
  draft: 0,
  processing: 0,
  completed: 0,
  cancelled: 0
})

import { getSalesStatusText, getSalesStatusColor } from '@/constants/systemConstants'

// 状态映射

// 获取状态文本和颜色
const getStatusText = (status) => getSalesStatusText(status)
const getStatusType = (status) => getSalesStatusColor(status)

// 状态过滤选项（仅用于搜索过滤）
const outboundStatuses = [
  { value: 'draft', label: getSalesStatusText('draft') },
  { value: 'processing', label: getSalesStatusText('processing') },
  { value: 'completed', label: getSalesStatusText('completed') },
  { value: 'cancelled', label: getSalesStatusText('cancelled') }
]

// 已在上面使用统一常量定义了状态映射函数，删除重复定义

// 格式化日期
// formatDate: 使用公共实现

const calculateOutboundStats = (dataToCount) => {
  const stats = {
    total: dataToCount.length,
    draft: 0,
    processing: 0,
    completed: 0,
    cancelled: 0
  }
  
  dataToCount.forEach(outbound => {
    stats[outbound.status] = (stats[outbound.status] || 0) + 1
  })
  
  outboundStats.value = stats
}

// 获取全量出库单统计数据
const fetchStats = async () => {
  try {
    // 获取所有出库单数据用于统计
    const response = await salesApi.getOutbounds({ pageSize: 100000 });
    const allOutbounds = parseListData(response, { enableLog: false });
    calculateOutboundStats(allOutbounds);
  } catch (error) {
    console.error('获取出库单统计数据失败:', error);
  }
}

// 使用统一的分页数据获取Hook
const {
  loading: outboundsLoading,
  data: outbounds,
  pagination: outboundPagination,
  fetchData: fetchOutbounds,
  handlePageChange: handleOutboundPageChange,
  handleSizeChange: handleOutboundSizeChange
} = usePaginatedFetching(
  async (params) => {
    // 构建搜索参数
    const searchParams = {
      search: searchQuery.value,
      status: statusFilter.value
    }

    // 添加日期范围参数
    if (dateRange.value?.length === 2) {
      searchParams.startDate = dayjs(dateRange.value[0]).format('YYYY-MM-DD')
      searchParams.endDate = dayjs(dateRange.value[1]).format('YYYY-MM-DD')
    }

    const response = await salesApi.getOutbounds({ ...searchParams, ...params });

    // 使用统一解析器
    const data = parseListData(response, { enableLog: false });

    // 统计数据由 fetchStats 独立获取全量数据

    // 直接返回响应，让 usePaginatedFetching 处理数据结构
    return {
      ...response,
      data: {
        items: data,
        total: response.data?.total || data.length,
        statusStats: response.data?.statusStats
      }
    };
  },
  {
    pageSize: 10,
    immediate: true
  }
);

// 搜索方法
const handleSearch = () => {
  outboundPagination.page = 1
  fetchOutbounds()
}

// 重置搜索方法
const resetSearch = () => {
  searchQuery.value = ''
  statusFilter.value = ''
  dateRange.value = []
  outboundPagination.page = 1
  fetchOutbounds()
}

// 获取订单列表
const fetchOrders = async () => {
  try {
    // 获取可以发货的订单（包括已确认、生产中、可发货等状态）
    const response = await salesApi.getOrders({
      pageSize: 200 // 增加数量，支持更多订单选择
    })

    // 使用统一解析器
    const allOrders = parseListData(response, { enableLog: false })

    // 过滤出可发货的订单
    const shippableStatuses = ['confirmed', 'in_production', 'ready_to_ship', 'partial_shipped']
    const filteredOrders = allOrders.filter(order => 
      shippableStatuses.includes(order.status) || !order.status
    )
    
    orders.value = filteredOrders
  } catch (error) {
    console.error('获取订单列表失败:', error)
    orders.value = []
  }
}

// 在组件挂载时获取数据
onMounted(async () => {
  // 检查缓存是否有效
  const now = Date.now()
  if (dataLoaded.value && (now - lastLoadTime.value) < CACHE_DURATION) {
    return
  }

  loading.value = true

  try {
    // 并行加载数据，提高加载速度
    await Promise.allSettled([
      fetchOutbounds(),
      fetchOrders(),
      fetchStats()
    ])

    // 更新缓存状态
    dataLoaded.value = true
    lastLoadTime.value = now
  } catch (error) {
    console.error('页面初始化失败:', error)
  } finally {
    loading.value = false
  }
})

// 监听页面激活事件（用于 keep-alive 缓存时的自动刷新）
onActivated(async () => {
  // 强制刷新数据，确保用户切换回来时能看到最新创建的单据
  loading.value = true
  try {
    await Promise.allSettled([
      fetchOutbounds(),
      fetchOrders(),
      fetchStats()
    ])
  } finally {
    loading.value = false
  }
})

// 查看详情
const showDetails = async (row) => {
  detailsVisible.value = true
  detailsLoading.value = true
  currentOutbound.value = null
  
  try {
    const response = await salesApi.getOutbound(row.id)
    currentOutbound.value = response.data
    
    // 确保items存在
    if (!currentOutbound.value.items) {
      currentOutbound.value.items = []
    }
  } catch (error) {
    ElMessage.error('获取出库单详情失败')
    detailsVisible.value = false
  } finally {
    detailsLoading.value = false
  }
}

// 显示创建对话框
const showCreateDialog = () => {
  // 检查是否有可发货状态的订单
  if (orders.value.length === 0) {
    ElMessage.warning('当前没有可发货的订单，请先确认订单状态')
    return
  }
  
  dialogType.value = 'create'
  outboundForm.value = {
    order_id: '',
    customer_id: '',
    customer_name: '',
    contact: '',
    phone: '',
    address: '',
    delivery_date: new Date(),
    status: 'draft', // 默认为草稿状态，用户不可修改
    items: [],
    remarks: '',
    relatedOrders: []
  }
  
  // 重置多订单相关变量
  selectedOrderId.value = ''
  
  dialogVisible.value = true
}

// 显示编辑对话框
const showEditDialog = async (row) => {
  dialogType.value = 'edit'
  dialogVisible.value = true
  dialogLoading.value = true
  
  try {
    // 获取完整的出库单数据
    const response = await salesApi.getOutbound(row.id)
    const fullOutboundData = response.data
    
    // 确保表单数据完整
    // 确保表单数据完整
    
    // 1. 处理关联订单数据
    let formRelatedOrders = []
    // 尝试解析 related_orders 字段
    if (fullOutboundData.related_orders) {
      if (Array.isArray(fullOutboundData.related_orders)) {
        formRelatedOrders = fullOutboundData.related_orders
      } else if (typeof fullOutboundData.related_orders === 'string') {
        try {
          const parsed = JSON.parse(fullOutboundData.related_orders)
          // 如果解析出来的是ID数组，需要转换成对象数组
          if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] !== 'object') {
             // 这种情况比较少见，通常后端会返回详情对象
             // 如果这里无法恢复详情，可能需要额外请求。但通常后端getOutbound应该返回详情。
             // 检查 fullOutboundData.related_order_details
             if (fullOutboundData.related_order_details) {
               formRelatedOrders = fullOutboundData.related_order_details
             }
          } else {
             formRelatedOrders = parsed
          }
        } catch (e) {
          console.error('解析关联订单失败', e)
        }
      }
    }
    
    // 如果上述解析没结果，检查 related_order_details
    if (formRelatedOrders.length === 0 && fullOutboundData.related_order_details) {
        formRelatedOrders = fullOutboundData.related_order_details
    }
    
    // 如果还是空，尝试从单订单字段构造（兼容旧数据）
    if (formRelatedOrders.length === 0 && (fullOutboundData.order_id || row.order_id)) {
       formRelatedOrders.push({
         id: fullOutboundData.order_id || row.order_id,
         order_no: fullOutboundData.order_no || row.order_no,
         customer: fullOutboundData.customer_name || row.customer_name,
         customer_id: fullOutboundData.customer_id || row.customer_id
       })
    }

    // 2. 处理出库明细项映射
    const formItems = (fullOutboundData.items || []).map(item => {
       // 解析 source_orders JSON
       let sourceOrders = []
       if (item.source_orders) {
          if (Array.isArray(item.source_orders)) {
             sourceOrders = item.source_orders
          } else if (typeof item.source_orders === 'string') {
             try {
                sourceOrders = JSON.parse(item.source_orders)
             } catch(e) {}
          }
       }
       
       return {
         ...item,
         // 字段映射：后端 material_name -> 前端 product_name
         product_name: item.material_name || item.product_name,
         // 确保物料编码存在
         material_code: item.material_code || item.product_code || item.code,
         // 来源订单信息
         source_orders: sourceOrders,
         // 确保 order_no 存在：优先使用item里的，如果没有则使用主单的
         order_no: item.order_no || item.source_order_no || fullOutboundData.order_no || row.order_no,
         // 如果 order_quantity 缺失，尝试用 total_order_quantity 或 quantity
         order_quantity: item.order_quantity || item.total_order_quantity || item.quantity,
         // 确保数量是数字
         quantity: Number(item.quantity) || 0
       }
    })

    // 3. 预填充客户选项，确保回显
    const currentCustomerId = fullOutboundData.customer_id || row.customer_id;
    if (currentCustomerId) {
       customerOptions.value = [{
         id: Number(currentCustomerId), // 确保ID类型一致
         name: fullOutboundData.customer_name || row.customer_name,
         code: '' 
       }]
       
       // 设置当前客户状态，以便可以进行产品查询
       currentCustomer.value = {
         id: Number(currentCustomerId),
         name: fullOutboundData.customer_name || row.customer_name
       }
    }

    outboundForm.value = {
      id: row.id,
      order_id: fullOutboundData.order_id || row.order_id,
      customer_id: currentCustomerId ? Number(currentCustomerId) : '',
      customer_name: fullOutboundData.customer_name || row.customer_name,
      contact: fullOutboundData.contact_person || row.contact_name || fullOutboundData.contact || '',
      phone: fullOutboundData.contact_phone || row.contact_phone || fullOutboundData.phone || '',
      address: fullOutboundData.delivery_address || row.address || fullOutboundData.address || '',
      delivery_date: fullOutboundData.delivery_date || row.delivery_date,
      status: fullOutboundData.status || row.status,
      items: formItems,
      remarks: fullOutboundData.remarks || row.remarks || '',
      relatedOrders: formRelatedOrders
    }

  } catch (error) {
    console.error('获取出库单详情失败:', error)
    ElMessage.error('获取出库单详情失败')
    
    // 如果获取失败，使用行数据
    outboundForm.value = { ...row }
  } finally {
    dialogLoading.value = false
  }
}

// 移除明细项
const removeItem = (index) => {
  outboundForm.value.items.splice(index, 1)
}

// 使用统一的表单提交Hook
const { loading: submittingOutbound, submit: submitOutboundForm } = useFormSubmit(
  async (formData) => {
    if (dialogType.value === 'create') {
      return await salesApi.createOutbound(formData);
    } else {
      return await salesApi.updateOutbound(outboundForm.value.id, formData);
    }
  },
  {
    successMessage: dialogType.value === 'create' ? '出库单创建成功' : '出库单更新成功',
    onSuccess: () => {
      dialogVisible.value = false;
      fetchOutbounds();
    }
  }
);

// 提交出库单
const submitOutbound = async () => {
  if (!outboundFormRef.value) return;
  
  const valid = await new Promise((resolve) => {
    outboundFormRef.value.validate((valid) => resolve(valid));
  });
  
  if (!valid) return;

  // 过滤掉无效的物料项（数量为0或没有ID的项）
  const validItems = outboundForm.value.items.filter(item => 
    (item.material_id || item.product_id) && 
    item.quantity > 0 && 
    !isNaN(item.quantity)
  );
  
  if (validItems.length === 0) {
    ElMessage.warning('请至少添加一个有效的物料项（数量大于0）');
    return;
  }
  
  if (outboundForm.value.relatedOrders.length === 0) {
    ElMessage.warning('请至少添加一个关联订单');
    return;
  }
  
  // 验证发货数量不能超过订单数量
  const invalidQuantityItems = validItems.filter(item => item.quantity > item.order_quantity);
  if (invalidQuantityItems.length > 0) {
    ElMessage.warning(`以下物料发货数量超过订单数量：${invalidQuantityItems.map(item => item.material_code).join(', ')}`);
    return;
  }

  // 构建提交数据
  const submitData = {
    outbound_date: outboundForm.value.delivery_date,
    delivery_date: outboundForm.value.delivery_date,
    order_id: outboundForm.value.relatedOrders.length === 1 ? outboundForm.value.relatedOrders[0].id : null,
    related_orders: JSON.stringify(outboundForm.value.relatedOrders.map(order => order.id)),
    is_multi_order: outboundForm.value.relatedOrders.length > 1,
    status: outboundForm.value.status || 'draft',
    remarks: outboundForm.value.remarks || '',
    warehouse_id: outboundForm.value.warehouse_id || 1,
    items: validItems.map(item => ({
      material_id: item.material_id || item.product_id,
      product_id: item.material_id || item.product_id,
      unit_id: item.unit_id,
      quantity: item.quantity,
      price: item.unit_price || 0,
      remarks: item.remarks || '',
      source_order_id: item.order_id,
      source_order_no: item.order_no,
      source_orders: item.source_orders ? JSON.stringify(item.source_orders) : null,
      order_id: item.order_id === 'multiple' ? null : item.order_id,
      order_no: item.order_no
    }))
  };

  // 使用统一的表单提交Hook
  await submitOutboundForm(submitData, outboundFormRef.value);
};

// 处理删除
const handleDelete = (row) => {
  ElMessageBox.confirm('确定要删除该出库单吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await salesApi.deleteOutbound(row.id)
      ElMessage.success('删除成功')
      fetchOutbounds()
    } catch (error) {
      ElMessage.error('删除出库单失败')
    }
  }).catch(() => {})
}

// 验证发货数量
const validateQuantity = (row, index) => {
  // 确保数量是有效数字
  if (isNaN(row.quantity) || row.quantity < 0) {
    ElMessage.warning('发货数量必须是有效的正数')
    row.quantity = 0
    return
  }
  
  // 检查是否超过订单数量
  if (row.quantity > row.order_quantity) {
    ElMessage.warning(`发货数量不能超过订单数量 ${row.order_quantity}`)
    row.quantity = row.order_quantity
  }
  
  // 检查库存（只在有库存信息时提醒）
  if (row.stock_quantity !== undefined && row.stock_quantity >= 0 && row.quantity > row.stock_quantity) {
    ElMessage.warning(`${row.material_code} 库存不足，当前库存：${row.stock_quantity}，建议检查库存后再发货`)
  }
}

// 获取订单状态文本
const getOrderStatusText = (status) => {
  const statusMap = {
    'pending': '待处理',
    'confirmed': '已确认', 
    'in_production': '生产中',
    'ready_to_ship': '可发货',
    'partial_shipped': '部分发货',
    'completed': '已完成',
    'cancelled': '已取消'
  }
  return statusMap[status] || '未知状态'
}

// 多订单管理方法
const handleAddOrder = () => {
  // 选择订单后自动添加，提升操作便利性
  if (selectedOrderId.value) {
    addOrderToOutbound()
  }
}

const addOrderToOutbound = async () => {
  if (!selectedOrderId.value) {
    ElMessage.warning('请先选择要添加的订单')
    return
  }
  
  // 检查订单是否已经添加
  if (outboundForm.value.relatedOrders.find(order => order.id === selectedOrderId.value)) {
    ElMessage.warning('该订单已经添加过了')
    selectedOrderId.value = ''
    return
  }
  
  try {
    // 获取订单的未发货物料详情
    const response = await salesApi.getOrderUnshippedItems(selectedOrderId.value)
    // axios拦截器已自动解包ResponseHandler格式
    const orderDetails = response.data
    
    // 添加到关联订单列表
    outboundForm.value.relatedOrders.push({
      id: orderDetails.id,
      order_no: orderDetails.order_no,
      customer: orderDetails.customer_name || orderDetails.customer,
      customer_id: orderDetails.customer_id,
      contract_code: orderDetails.contract_code || '', // 添加合同编码
      contact: orderDetails.contact || orderDetails.contact_person,
      phone: orderDetails.phone || orderDetails.contact_phone,
      address: orderDetails.address || orderDetails.delivery_address
    })
    
    // 添加订单的物料项
    if (orderDetails.items?.length > 0) {
      // 使用专门的API获取物料库存信息
      let stockInfo = {}
      try {
        // 使用带库存的物料API，传入物料编码进行搜索
        const materialCodes = orderDetails.items
          .filter(item => item.material_id || item.product_id)
          .map(item => item.code || item.material_code)
          .filter(code => code) // 过滤掉空的编码

        if (materialCodes.length > 0) {
          // 为每个物料编码查询库存
          const stockPromises = materialCodes.map(async (code) => {
            try {
              const stockResponse = await inventoryApi.getMaterialsWithStock({
                keyword: code,
                include_stock: true
              })

              const stockData = stockResponse.data || []
              // 找到匹配的物料并返回库存信息
              const matchedMaterial = stockData.find(item =>
                item.code === code || item.material_code === code
              )

              return {
                code: code,
                materialId: matchedMaterial?.id || matchedMaterial?.material_id,
                stock: matchedMaterial?.stock_quantity || matchedMaterial?.quantity || 0
              }
            } catch (error) {
              return { code, materialId: null, stock: 0 }
            }
          })

          const stockResults = await Promise.all(stockPromises)

          // 将结果映射到物料ID
          stockResults.forEach(result => {
            if (result.materialId) {
              stockInfo[result.materialId] = result.stock
            }
            // 同时按编码存储，以备查找
            stockInfo[result.code] = result.stock
          })
        }
      } catch (error) {
        ElMessage.warning('获取库存信息失败，库存显示可能不准确')
      }
      
      const newItems = orderDetails.items
        .filter(item => item.material_id)
        .map(item => {
          const materialId = item.material_id
          const materialCode = item.material_code

          // 优先使用物料ID查找库存，其次使用编码
          let realStockQuantity = stockInfo[materialId] || stockInfo[materialCode] || item.stock_quantity || 0

          return {
            material_id: materialId,
            product_name: item.material_name,
            material_code: materialCode,
            specification: item.specification,
            order_quantity: item.ordered_quantity, // 原订单数量
            shipped_quantity: item.shipped_quantity, // 已发货数量
            remaining_quantity: item.remaining_quantity, // 剩余未发货数量
            quantity: item.remaining_quantity, // 默认出库数量为剩余数量
            unit_name: item.unit_name,
            unit_id: item.unit_id,
            unit_price: item.unit_price,
            stock_quantity: realStockQuantity, // 使用实时库存数据
            shipping_status: item.shipping_status, // 发货状态
            order_no: orderDetails.order_no, // 标记来源订单
            order_id: orderDetails.id
          }
        })
      
      // 智能合并相同物料
      newItems.forEach(newItem => {
        const existingItemIndex = outboundForm.value.items.findIndex(
          existingItem => existingItem.material_id === newItem.material_id
        )
        
                  if (existingItemIndex === -1) {
            // 没有重复物料，直接添加
            outboundForm.value.items.push({
              ...newItem,
              source_orders: [{ id: orderDetails.id, order_no: orderDetails.order_no, quantity: newItem.quantity }], // 记录来源订单
              total_order_quantity: newItem.quantity // 总订单数量
            })
        } else {
          // 有相同物料，合并数量和来源信息
          const existingItem = outboundForm.value.items[existingItemIndex]
          
          // 合并订单数量
          existingItem.order_quantity = (existingItem.order_quantity || 0) + newItem.quantity
          existingItem.quantity = (existingItem.quantity || 0) + newItem.quantity
          existingItem.total_order_quantity = existingItem.order_quantity
          
          // 记录多个来源订单
          if (!existingItem.source_orders) {
            existingItem.source_orders = [{ 
              id: existingItem.order_id, 
              order_no: existingItem.order_no, 
              quantity: existingItem.order_quantity - newItem.quantity 
            }]
          }
          existingItem.source_orders.push({ 
            id: orderDetails.id, 
            order_no: orderDetails.order_no, 
            quantity: newItem.quantity 
          })
          
          // 更新订单号显示（显示多个订单）
          const orderNos = existingItem.source_orders.map(order => order.order_no)
          existingItem.order_no = orderNos.join(', ')
          existingItem.order_id = 'multiple' // 标记为多订单物料
        }
      })
    }
    
    // 订单已添加，availableOrders 计算属性会自动更新
    
    const itemsCount = orderDetails.items?.length || 0
    const unshippedCount = orderDetails.unshipped_items_count || 0
    const partialCount = orderDetails.partial_shipped_items_count || 0
    
    if (itemsCount === 0) {
      ElMessage.warning(`订单 ${orderDetails.order_no} 的所有物料已完全发货，无需再次出库`)
    } else {
      let message = `已添加订单 ${orderDetails.order_no}，包含 ${itemsCount} 个待发货物料`
      if (unshippedCount > 0 && partialCount > 0) {
        message += `（${unshippedCount}个未发货，${partialCount}个部分发货）`
      } else if (unshippedCount > 0) {
        message += `（${unshippedCount}个未发货）`
      } else if (partialCount > 0) {
        message += `（${partialCount}个部分发货）`
      }
      ElMessage.success(message)
    }
    selectedOrderId.value = ''
    
  } catch (error) {
    console.error('添加订单失败:', error)
    ElMessage.error('添加订单失败: ' + (error.message || '未知错误'))
  }
}

// 计算属性：获取唯一客户数量
const uniqueCustomers = computed(() => {
  const customers = new Set()
  outboundForm.value.relatedOrders.forEach(order => {
    if (order.customer) {
      customers.add(order.customer)
    }
  })
  return Array.from(customers)
})

// 可用订单计算属性 - 实现同一客户过滤
const availableOrders = computed(() => {
  if (!orders.value || orders.value.length === 0) {
    return []
  }
  
  // 如果没有已选择的订单，显示所有订单
  if (outboundForm.value.relatedOrders.length === 0) {
    return orders.value
  }
  
  // 如果已经选择了订单，只显示同一客户的订单
  const selectedCustomerIds = [...new Set(outboundForm.value.relatedOrders.map(order => order.customer_id))]
  
  // 如果只有一个客户，过滤显示同一客户的订单
  if (selectedCustomerIds.length === 1) {
    const currentCustomerId = selectedCustomerIds[0]
    return orders.value.filter(order => 
      order.customer_id === currentCustomerId && 
      !outboundForm.value.relatedOrders.find(relatedOrder => relatedOrder.id === order.id)
    )
  }
  
  // 如果有多个客户，显示所有未选择的订单
  return orders.value.filter(order => 
    !outboundForm.value.relatedOrders.find(relatedOrder => relatedOrder.id === order.id)
  )
})

// 客户信息显示和过滤相关函数
const getCustomerDisplayText = () => {
  if (outboundForm.value.relatedOrders.length === 0) {
    return '请先添加订单'
  } else if (outboundForm.value.relatedOrders.length === 1) {
    return outboundForm.value.relatedOrders[0].customer
  } else {
    // 多订单情况，显示客户名称
    const uniqueCustomerNames = [...new Set(outboundForm.value.relatedOrders.map(order => order.customer))]
    if (uniqueCustomerNames.length === 1) {
      return `${uniqueCustomerNames[0]} (${outboundForm.value.relatedOrders.length}个订单)`
    } else {
      return `多客户发货 (${outboundForm.value.relatedOrders.length}个订单)`
    }
  }
}

const getCurrentCustomerId = () => {
  if (outboundForm.value.relatedOrders.length === 0) {
    return null
  }
  // 检查是否只有一个客户
  const uniqueCustomerIds = [...new Set(outboundForm.value.relatedOrders.map(order => order.customer_id))]
  return uniqueCustomerIds.length === 1 ? uniqueCustomerIds[0] : null
}

// 客户搜索相关函数
const searchCustomers = async (query) => {
  if (!query || query.trim().length < 1) {
    customerOptions.value = []
    return
  }
  
  customerLoading.value = true
  try {
    // 调用客户搜索API，支持客户编码和名称搜索
    const response = await salesApi.getCustomers({
      keyword: query.trim(),
      searchFields: ['name', 'code'], // 同时搜索名称和编码
      limit: 20
    })
    
    const customers = response.data?.data || response.data || []
    
    // 过滤结果，确保包含搜索关键词
    customerOptions.value = customers.filter(customer => {
      const searchTerm = query.trim().toLowerCase()
      const customerName = (customer.name || '').toLowerCase()
      const customerCode = (customer.code || '').toLowerCase()

      return customerName.includes(searchTerm) || customerCode.includes(searchTerm)
    })
  } catch (error) {
    ElMessage.error('搜索客户失败')
    customerOptions.value = []
  } finally {
    customerLoading.value = false
  }
}

const handleCustomerChange = async (customerId) => {
  if (!customerId) {
    outboundForm.value.customer_name = ''
    outboundForm.value.contact = ''
    outboundForm.value.phone = ''
    outboundForm.value.address = ''
    currentCustomer.value = null
    return
  }

  try {
    // 先从当前选项中查找
    let selectedCustomer = customerOptions.value.find(c => c.id === customerId)

    // 如果没找到，可能是编辑模式，需要重新获取客户详情
    if (!selectedCustomer) {
      const response = await salesApi.getCustomer(customerId)
      selectedCustomer = response.data?.data || response.data
    }

    if (selectedCustomer) {
      outboundForm.value.customer_name = selectedCustomer.name || ''

      // 自动读取联系人和联系电话
      outboundForm.value.contact = selectedCustomer.contact_person || selectedCustomer.contact || ''
      outboundForm.value.phone = selectedCustomer.contact_phone || selectedCustomer.phone || ''
      outboundForm.value.address = selectedCustomer.delivery_address || selectedCustomer.address || ''

      // 设置当前客户信息用于产品查询
      currentCustomer.value = {
        id: selectedCustomer.id,
        name: selectedCustomer.name,
        code: selectedCustomer.code || ''
      }
    }
  } catch (error) {
    ElMessage.error('获取客户详情失败')
  }
}

// 客户产品查询相关函数
const openCustomerProductsDialog = async () => {
  // 检查是否已选择客户
  if (!currentCustomer.value?.id) {
    ElMessage.error('请先选择客户')
    return
  }
  
  customerProductsDialogVisible.value = true
  await fetchCustomerProducts()
}

const fetchCustomerProducts = async (searchKeyword = '') => {
  if (!currentCustomer.value?.id) {
    ElMessage.error('客户信息不完整')
    return
  }

  customerProductsLoading.value = true
  try {
    // 调用后端API获取客户所有订单的产品明细，支持搜索
    const params = { search: searchKeyword.trim() }
    const response = await salesApi.getCustomerOrderProducts(currentCustomer.value.id, params)
    const products = response.data?.data || response.data || []
    
    // 为每个产品添加选择数量字段，默认为剩余发货数量
    customerProducts.value = products.map(product => ({
      ...product,
      selected_quantity: Number(product.remaining_quantity) || 0
    }))
    
    const searchText = searchKeyword ? `（搜索："${searchKeyword}"）` : ''
    ElMessage.success(`获取到 ${products.length} 个产品${searchText}`)
  } catch (error) {
    console.error('获取客户产品失败:', error)
    ElMessage.error('获取客户产品失败: ' + (error.message || '未知错误'))
    customerProducts.value = []
  } finally {
    customerProductsLoading.value = false
  }
}

const handleProductSelectionChange = (selection) => {
  selectedProducts.value = selection
}

// 搜索客户产品
const searchCustomerProducts = async () => {
  await fetchCustomerProducts(productSearchQuery.value)
}

// 重置产品搜索
const resetProductSearch = async () => {
  productSearchQuery.value = ''
  await fetchCustomerProducts()
}

const validateSelectedQuantity = (row) => {
  // 确保输入的是整数
  let selectedQty = parseInt(row.selected_quantity) || 0
  const remainingQty = Number(row.remaining_quantity) || 0
  const stockQty = Number(row.stock_quantity) || 0
  
  // 如果输入的不是整数，自动转换为整数
  if (row.selected_quantity !== selectedQty.toString()) {
    row.selected_quantity = selectedQty
  }
  
  // 检查是否为负数
  if (selectedQty < 0) {
    row.selected_quantity = 0
    ElMessage.warning('发货数量不能为负数')
    return
  }
  
  // 检查是否超过剩余数量
  if (selectedQty > remainingQty) {
    row.selected_quantity = Math.floor(remainingQty)
    ElMessage.warning(`发货数量不能超过剩余数量 ${Math.floor(remainingQty)}`)
    return
  }
  
  // 检查是否超过库存数量
  if (selectedQty > stockQty) {
    ElMessage.warning(`发货数量不能超过库存数量 ${stockQty}`)
  }
}
const addSelectedProductsToOutbound = async () => {
  const validProducts = selectedProducts.value.filter(product => product.selected_quantity > 0)
  
  if (validProducts.length === 0) {
    ElMessage.warning('请选择产品并设置发货数量')
    return
  }

  // 检查是否有重复产品
  const duplicateProducts = []
  const newProducts = []
  
  validProducts.forEach(product => {
    const existingItemIndex = outboundForm.value.items.findIndex(
      item => item.material_id === product.material_id
    )
    
    if (existingItemIndex === -1) {
      newProducts.push(product)
    } else {
      duplicateProducts.push({
        product,
        existingItem: outboundForm.value.items[existingItemIndex]
      })
    }
  })

  // 处理重复产品 - 改为智能合并模式
  if (duplicateProducts.length > 0) {
    const duplicateNames = duplicateProducts.map(item => item.product.material_name).join('、')
    
    try {
      await ElMessageBox.confirm(
        `以下物料已存在于出库单中：${duplicateNames}。选择处理方式：`,
        '物料重复',
        {
          confirmButtonText: '合并数量',
          cancelButtonText: '替换数量',
          distinguishCancelAndClose: true,
          type: 'warning',
        }
      )
      
      // 用户选择合并，累加数量
      duplicateProducts.forEach(({ product, existingItem }) => {
        existingItem.order_quantity = (existingItem.order_quantity || 0) + product.selected_quantity
        existingItem.quantity = (existingItem.quantity || 0) + product.selected_quantity
        
        // 更新来源订单信息
        if (!existingItem.source_orders) {
          existingItem.source_orders = []
        }
        
        // 添加新的来源订单信息
        if (product.order_ids && product.order_nos) {
          const orderIds = product.order_ids.split(',')
          const orderNos = product.order_nos.split(', ')
          
          orderIds.forEach((orderId, index) => {
            const orderIdNum = parseInt(orderId.trim())
            const orderNo = orderNos[index] ? orderNos[index].trim() : ''
            
            // 检查是否已存在该订单信息
            const existingSource = existingItem.source_orders.find(source => source.id === orderIdNum)
            if (!existingSource) {
              existingItem.source_orders.push({
                id: orderIdNum,
                order_no: orderNo,
                quantity: product.selected_quantity
              })
            } else {
              // 更新数量
              existingSource.quantity = (existingSource.quantity || 0) + product.selected_quantity
            }
          })
        }
      })
      
      ElMessage.success('已合并相同物料的数量')
    } catch (action) {
      if (action === 'cancel') {
        // 用户选择替换，更新重复产品的数量
        duplicateProducts.forEach(({ product, existingItem }) => {
          existingItem.order_quantity = product.selected_quantity
          existingItem.quantity = product.selected_quantity
          
          // 重置来源订单信息
          existingItem.source_orders = []
          if (product.order_ids && product.order_nos) {
            const orderIds = product.order_ids.split(',')
            const orderNos = product.order_nos.split(', ')
            
            orderIds.forEach((orderId, index) => {
              const orderIdNum = parseInt(orderId.trim())
              const orderNo = orderNos[index] ? orderNos[index].trim() : ''
              
              existingItem.source_orders.push({
                id: orderIdNum,
                order_no: orderNo,
                quantity: product.selected_quantity
              })
            })
          }
        })
        
        ElMessage.success('已替换为新的数量')
      } else {
        // 用户关闭对话框，取消操作
        ElMessage.info('已取消添加重复产品')
        return
      }
    }
  }

  // 添加新产品（处理多订单合并的情况）
  for (const product of newProducts) {
    // 确保订单被添加到关联订单列表中（处理多订单情况）
    if (product.order_ids && product.order_nos) {
      const orderIds = product.order_ids.split(',')
      const orderNos = product.order_nos.split(', ')
      
      // 为每个订单添加到关联订单列表
      orderIds.forEach((orderId, index) => {
        const orderIdNum = parseInt(orderId.trim())
        const orderNo = orderNos[index] ? orderNos[index].trim() : ''
        
        const existingOrder = outboundForm.value.relatedOrders.find(order => order.id === orderIdNum)
        if (!existingOrder) {
          outboundForm.value.relatedOrders.push({
            id: orderIdNum,
            order_no: orderNo,
            customer: currentCustomer.value.name,
            customer_id: currentCustomer.value.id,
            contract_code: product.contract_code || '',
            status: product.shipping_status || 'unshipped'
          })
        }
      })
      
      // 如果是多订单合并的产品，按订单拆分成多个明细项
      if (orderIds.length > 1 && product.order_details) {
        
        // 按订单拆分成多个明细项，确保每个订单的状态都能正确更新
        const totalRemaining = product.order_details.reduce((sum, order) => sum + parseFloat(order.remaining_quantity), 0)
        
        product.order_details.forEach(orderDetail => {
          if (parseFloat(orderDetail.remaining_quantity) > 0) {
            // 按比例分配数量
            const proportion = parseFloat(orderDetail.remaining_quantity) / totalRemaining
            const allocatedQuantity = Math.round(product.selected_quantity * proportion * 100) / 100
            
            outboundForm.value.items.push({
              material_id: product.material_id,
              product_name: product.material_name,
              material_code: product.material_code,
              specification: product.specification,
              order_quantity: allocatedQuantity,
              quantity: allocatedQuantity,
              unit_name: product.unit_name,
              unit_id: product.unit_id,
              unit_price: product.unit_price || 0,
              stock_quantity: product.stock_quantity,
              order_no: orderDetail.order_no,
              order_id: orderDetail.order_id,
              source_orders: [{ 
                id: orderDetail.order_id, 
                order_no: orderDetail.order_no, 
                quantity: allocatedQuantity 
              }]
            })
          }
        })
      } else {
        // 单订单产品，直接添加
        outboundForm.value.items.push({
          material_id: product.material_id,
          product_name: product.material_name,
          material_code: product.material_code,
          specification: product.specification,
          order_quantity: product.selected_quantity,
          quantity: product.selected_quantity,
          unit_name: product.unit_name,
          unit_id: product.unit_id,
          unit_price: product.unit_price || 0,
          stock_quantity: product.stock_quantity,
          order_no: product.order_nos || product.order_no || '',
          order_id: parseInt(product.order_ids) || product.order_id || ''
        })
      }
    } else {
      // 没有多订单信息，按原来的逻辑处理
      outboundForm.value.items.push({
        material_id: product.material_id,
        product_name: product.material_name,
        material_code: product.material_code,
        specification: product.specification,
        order_quantity: product.selected_quantity,
        quantity: product.selected_quantity,
        unit_name: product.unit_name,
        unit_id: product.unit_id,
        unit_price: product.unit_price || 0,
        stock_quantity: product.stock_quantity,
        order_no: product.order_no || '',
        order_id: product.order_id || ''
      })
    }
  }

  const totalAdded = newProducts.length + duplicateProducts.length
  ElMessage.success(`已处理 ${totalAdded} 个产品`)
  customerProductsDialogVisible.value = false
  
  // 清空选择
  selectedProducts.value = []
  customerProducts.value.forEach(product => {
    product.selected_quantity = Number(product.remaining_quantity) || 0
  })
}

// 在出库成功时记录追溯 (已移至后端由 InventoryTraceabilityService 自动接管)

// 修改出库单状态函数
const statusUpdating = ref(false)
const handleStatusChange = async (row, status) => {
  // 防止重复请求
  if (statusUpdating.value) {
    return
  }

  // 检查状态转换的合法性
  const validTransitions = {
    'draft': ['processing', 'cancelled'],
    'processing': ['completed', 'cancelled'],
    'completed': [],
    'cancelled': []
  };

  if (!validTransitions[row.status]?.includes(status)) {
    ElMessage.warning(`当前状态 "${row.status}" 不能转换为 "${status}"`)
    return
  }

  // 确认对话框
  if (status === 'completed' || status === 'cancelled') {
    const action = status === 'completed' ? '完成' : '取消'
    const message = status === 'completed'
      ? '确定要将出库单标记为已完成吗？此操作将减少库存并更新订单状态。'
      : '确定要取消此出库单吗？如果出库单之前已完成，此操作将恢复库存。'

    try {
      await ElMessageBox.confirm(message, '确认操作', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
    } catch {
      return // 用户取消操作
    }
  }

  statusUpdating.value = true
  try {
    // 构建更新数据 - 修复字段名匹配问题
    const updateData = {
      status: status,
      delivery_date: row.delivery_date,
      order_id: row.order_id,
      remarks: row.remarks || ''
    }
    
    const response = await salesApi.updateOutbound(row.id, updateData)
    
    // 如果状态为已完成，此时后端会自动接管新版的批次消耗追溯，前端无需再调旧版质量追溯接口
    // if (status === 'completed') {
    //   ...
    // }
    
    // 更新本地数据
    const index = outbounds.value.findIndex(item => item.id === row.id)
    if (index !== -1) {
      outbounds.value[index].status = status
      calculateOutboundStats()
    }
    
    ElMessage.success(`出库单状态已更新为${getStatusText(status)}`)
    
    await fetchOutbounds()
  } catch (error) {
    console.error('状态更新失败:', error)

    // 处理库存相关错误
    if (error.response?.status === 400) {
      const errorData = error.response.data
      const errorMsg = errorData?.error || '状态更新失败'

      // 检查是否是库存不足的错误
      if (errorMsg.includes('库存不足') || errorMsg.includes('没有库存记录')) {
        const materialCode = errorData?.material_code
        const materialName = errorData?.material_name
        const required = errorData?.required
        const available = errorData?.available

        let detailMsg = errorMsg
        if (materialCode && materialName && required !== undefined && available !== undefined) {
          detailMsg = `物料 ${materialCode}(${materialName}) 库存不足！需要数量：${required}，可用库存：${available}`
        } else if (materialCode && materialName && errorMsg.includes('没有库存记录')) {
          detailMsg = `物料 ${materialCode}(${materialName}) 在任何库位都没有库存记录，无法完成出库操作`
        }

        ElMessageBox.alert(detailMsg, '库存不足', {
          confirmButtonText: '确定',
          type: 'warning',
          dangerouslyUseHTMLString: false
        })
      } else {
        ElMessage.error(errorMsg)
      }
    } else {
      const errorMsg = error.response?.data?.error || error.message || '状态更新失败'
      ElMessage.error(errorMsg)
    }
  } finally {
    statusUpdating.value = false
  }
}

// 重置状态过滤器
const resetStatusFilter = () => {
  statusFilter.value = ''
  fetchOutbounds()
}

// 设置状态过滤器
const setStatusFilter = (status) => {
  statusFilter.value = status
  fetchOutbounds()
}

// 打印出库单
const printOutbound = async (row) => {
  try {
    // 打印不需要全局loading，避免表格闪烁
    
    // 获取完整的出库单数据
    const response = await salesApi.getOutbound(row.id)
    currentOutbound.value = response.data
    
    // 确保items存在
    if (!currentOutbound.value.items) {
      currentOutbound.value.items = []
    }
    
    // 使用getDefaultTemplateByType API获取销售出库单默认模板
    const templateResponse = await api.get('/print/templates/default', { 
      params: {
        module: 'sales',
        template_type: 'sales_outbound'
      }
    })
    
    // 适配多种响应格式
    let template = null
    if (templateResponse.data?.data) {
      template = templateResponse.data.data
    } else if (templateResponse.data?.content) {
      template = templateResponse.data
    }

    // 如果找到默认模板，使用模板进行打印
    if (template) {
      // 使用模板进行打印
      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        ElMessage.error('无法打开打印窗口，请检查浏览器是否阻止弹出窗口')
        return
      }

      // 替换模板中的变量
      let printContent = template.content

      // 解码 HTML 实体（如果模板内容被转义了）
      if (printContent.includes('&lt;') || printContent.includes('&gt;')) {
        const textarea = document.createElement('textarea')
        textarea.innerHTML = printContent
        printContent = textarea.value
      }
      
      // 替换基本变量
      printContent = printContent.replace(/{{outbound_no}}/g, currentOutbound.value.outbound_no || '')
      printContent = printContent.replace(/{{order_no}}/g, currentOutbound.value.order_no || '')
      printContent = printContent.replace(/{{customer_name}}/g, currentOutbound.value.customer_name || '')
      printContent = printContent.replace(/{{delivery_date}}/g, formatDate(currentOutbound.value.delivery_date) || '')
      printContent = printContent.replace(/{{contact}}/g, currentOutbound.value.contact || currentOutbound.value.contact_person || '')
      printContent = printContent.replace(/{{phone}}/g, currentOutbound.value.phone || currentOutbound.value.contact_phone || '')
      printContent = printContent.replace(/{{address}}/g, currentOutbound.value.address || currentOutbound.value.delivery_address || '')
      printContent = printContent.replace(/{{remarks}}/g, currentOutbound.value.remarks || '无')
      
      // 处理物料项列表
      if (printContent.includes('{{#each items}}')) {
        const itemStart = printContent.indexOf('{{#each items}}')
        const itemEnd = printContent.indexOf('{{/each}}', itemStart)
        
        if (itemStart !== -1 && itemEnd !== -1) {
          const itemTemplate = printContent.substring(itemStart + '{{#each items}}'.length, itemEnd)
          let itemsHtml = ''
          
          currentOutbound.value.items.forEach((item, index) => {
            let itemHtml = itemTemplate
            itemHtml = itemHtml.replace(/{{index}}/g, (index + 1).toString())
            itemHtml = itemHtml.replace(/{{product_code}}/g, item.product_code || item.material_code || '')
            itemHtml = itemHtml.replace(/{{product_name}}/g, item.product_name || item.material_name || '')
            itemHtml = itemHtml.replace(/{{specification}}/g, item.specification || item.specs || '-')
            itemHtml = itemHtml.replace(/{{quantity}}/g, item.quantity?.toString() || '0')
            itemHtml = itemHtml.replace(/{{unit_name}}/g, item.unit_name || item.unit || '')
            
            itemsHtml += itemHtml
          })
          
          printContent = printContent.substring(0, itemStart) + itemsHtml + printContent.substring(itemEnd + '{{/each}}'.length)
        }
      }
      
      printWindow.document.write(printContent)
      printWindow.document.close()
      
      // 等待图片加载完成后打印
      printWindow.onload = function() {
        setTimeout(() => {
          printWindow.print()
        }, 500)
      }
    } else {
      ElMessage.error('未找到销售出库单默认打印模板，请在系统设置中添加模板')
    }
  } catch (error) {
    ElMessage.error('打印失败: ' + (error.message || '未知错误'))
    console.error('打印出库单失败:', error)
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
  gap: var(--spacing-base);
}

.outbound-detail {
  padding: 16px;
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

.mt-4 {
  margin-top: var(--spacing-base);
}

/* 删除打印相关样式 */
@media print {
  .print-dialog {
    box-shadow: none;
    width: 100%;
  }
  
  .el-button,
  .el-dialog__header,
  .el-dialog__footer {
    display: none !important;
  }
  
  .el-dialog__body {
    padding: 0 !important;
  }
  
  .print-content {
    margin: 0;
    padding: 10px;
    box-shadow: none;
  }
}

/* 对话框高度 - 页面特定，其他样式使用全局主题 */
:deep(.el-dialog__body) {
  max-height: 60vh;
  overflow-y: auto;
}

/* 多订单样式 */
.multi-order-container {
  display: flex;
  align-items: center;
  width: 100%;
}

.related-orders {
  border: 1px dashed #dcdfe6;
  border-radius: var(--radius-sm);
  padding: 10px;
  background-color: var(--color-bg-hover);
}

.multi-customer-info {
  width: 100%;
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

/* 表格单元格不换行 */
:deep(.el-table__cell .cell) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 出库单详情对话框样式 */
.outbound-detail-content {
  padding: 10px 0;
}

.outbound-detail-content :deep(.el-descriptions) {
  background: #fafbfc;
  border-radius: 8px;
  padding: 12px;
}

.outbound-detail-content :deep(.el-descriptions__label) {
  font-weight: 500;
  color: #64748b;
  background: #f1f5f9;
}

.outbound-detail-content :deep(.el-descriptions__content) {
  color: #1e293b;
}

.outbound-detail-content :deep(.el-divider) {
  margin: 20px 0 16px 0;
}

.outbound-detail-content :deep(.el-table) {
  border-radius: 8px;
  overflow: hidden;
}

.outbound-detail-content :deep(.el-table th) {
  background: #f1f5f9 !important;
  color: #475569;
  font-weight: 600;
  font-size: 13px;
}

.outbound-detail-content :deep(.el-table td) {
  font-size: 13px;
  color: #334155;
}
</style>