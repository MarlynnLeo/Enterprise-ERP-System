<!--
/**
 * PackingLists.vue
 * @description 装箱单管理前端界面组件文件
  * @date 2025-01-13
 * @version 1.0.0
 */
-->
<template>
  <div class="packing-lists-container">
    <!-- 页面标题 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>装箱单管理</h2>
          <p class="subtitle">管理装箱单与发货</p>
        </div>
        <el-button v-permission="'sales:packinglists:create'" type="primary" :icon="Plus" @click="handleAdd">新增装箱单</el-button>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" class="search-form">
        <el-form-item label="装箱单号/客户">
          <el-input
            v-model="searchQuery"
            placeholder="请输入装箱单号或客户名称"
            @keyup.enter="() => handleSearch(true)"
            @input="handleSearch"
            clearable
          ></el-input>
        </el-form-item>

        <el-form-item label="状态">
          <el-select  v-model="statusFilter" placeholder="状态" clearable @change="() => handleSearch(true)">
            <el-option
              v-for="item in packingStatuses"
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
            @change="() => handleSearch(true)"

          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="() => handleSearch(true)">
            <el-icon><Search /></el-icon> 查询
          </el-button>
          <el-button @click="resetSearch">
            <el-icon><Refresh /></el-icon> 重置
          </el-button>
          <el-dropdown style="margin-left: 8px;">
            <el-button type="primary">
              更多操作<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="handleImport">
                  <el-icon><Upload /></el-icon> 导入
                </el-dropdown-item>
                <el-dropdown-item @click="handleExport">
                  <el-icon><Download /></el-icon> 导出
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 统计卡片 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ packingStats.total }}</div>
        <div class="stat-label">全部装箱单</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ packingStats.draft }}</div>
        <div class="stat-label">草稿</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ packingStats.confirmed }}</div>
        <div class="stat-label">已确认</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ packingStats.packing }}</div>
        <div class="stat-label">装箱中</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ packingStats.completed }}</div>
        <div class="stat-label">已完成</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ packingStats.totalBoxes }}</div>
        <div class="stat-label">总箱数</div>
      </el-card>
    </div>

    <!-- 装箱单表格 -->
    <el-card class="data-card">
      <el-table
        :data="tableData"
        border
        style="width: 100%"
        v-loading="loading"
        table-layout="fixed"
        :default-sort="{prop: 'packing_list_no', order: 'descending'}"
        @sort-change="handleSortChange"
        @header-dragend="(newWidth, oldWidth, column) => {
          if (column.property) {
            saveColumnWidth(column.property, newWidth)
          }
        }"
      >
        <el-table-column type="expand" width="50">
          <template #default="props">
            <div class="packing-detail">
              <el-descriptions :column="3" border>
                <el-descriptions-item label="客户名称">{{ props.row.customer_name }}</el-descriptions-item>
                <el-descriptions-item label="销售订单号">{{ props.row.sales_order_no || '-' }}</el-descriptions-item>
                <el-descriptions-item label="装箱日期">{{ formatDate(props.row.packing_date) }}</el-descriptions-item>
                <el-descriptions-item label="总箱数">{{ props.row.total_boxes || 0 }}</el-descriptions-item>
                <el-descriptions-item label="总数量">{{ props.row.total_quantity || 0 }}</el-descriptions-item>
                <el-descriptions-item label="创建人">{{ props.row.created_by || '-' }}</el-descriptions-item>
                <el-descriptions-item label="备注" :span="3">{{ props.row.remark || '-' }}</el-descriptions-item>
              </el-descriptions>
              
              <div class="products-title">装箱明细</div>
              <el-table :data="props.row.details" border style="width: 100%" table-layout="fixed">
                <el-table-column prop="item_no" label="编号" width="120">
                  <template #default="{ row }">
                    {{ row.item_no || '-' }}
                  </template>
                </el-table-column>
                <el-table-column prop="product_code" label="产品编码" width="120">
                  <template #default="{ row }">
                    {{ row.product_code || row.code || '-' }}
                  </template>
                </el-table-column>
                <el-table-column prop="product_name" label="产品名称" />
                <el-table-column prop="product_specs" label="规格型号" />
                <el-table-column prop="quantity" label="数量" width="100" />
                <el-table-column prop="unit_name" label="单位" width="80" />
                <el-table-column prop="remark" label="备注" />
              </el-table>
            </div>
          </template>
        </el-table-column>

        <el-table-column 
          prop="packing_list_no" 
          :width="getColumnWidth('packing_list_no', 150)" 
          fixed
          sortable="custom"
          resizable>
          <template #header>
            <el-popover
              placement="bottom"
              title="装箱单号"
              :width="200"
              trigger="hover"
              content="装箱单号格式：PK年月日序号，如PK250113001表示2025年01月13日的第1个装箱单。"
            >
              <template #reference>
                <span>装箱单号 <el-icon><InfoFilled /></el-icon></span>
              </template>
            </el-popover>
          </template>
          <template #default="scope">
            <el-link type="primary" @click="handleView(scope.row)">
              {{ scope.row.packing_list_no || '未知' }}
            </el-link>
          </template>
        </el-table-column>

        <el-table-column 
          prop="customer_name" 
          :min-width="getColumnWidth('customer_name', 150)"
          resizable>
          <template #header>
            <el-popover
              placement="bottom"
              title="客户名称"
              :width="200"
              trigger="hover"
              content="这里显示装箱单对应的客户名称。"
            >
              <template #reference>
                <span>客户名称 <el-icon><InfoFilled /></el-icon></span>
              </template>
            </el-popover>
          </template>
        </el-table-column>

        <el-table-column 
          prop="sales_order_no" 
          label="销售订单号" 
          :width="getColumnWidth('sales_order_no', 150)"
          resizable>
          <template #default="scope">
            <el-link v-if="scope.row.sales_order_no" type="info" @click="handleViewSalesOrder(scope.row)">
              {{ scope.row.sales_order_no }}
            </el-link>
            <span v-else>-</span>
          </template>
        </el-table-column>

        <el-table-column 
          prop="packing_date" 
          label="装箱日期" 
          :width="getColumnWidth('packing_date', 120)"
          sortable="custom"
          resizable>
          <template #default="scope">
            {{ formatDate(scope.row.packing_date) }}
          </template>
        </el-table-column>

        <el-table-column
          prop="status"
          label="状态"
          :width="getColumnWidth('status', 100)"
          resizable>
          <template #default="scope">
            <el-tag :type="getPackingStatusColor(scope.row.status)">
              {{ getPackingStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column
          prop="total_boxes"
          label="总箱数"
          :width="getColumnWidth('total_boxes', 100)"
          align="center"
          resizable>
        </el-table-column>

        <el-table-column
          prop="total_quantity"
          label="总数量"
          :width="getColumnWidth('total_quantity', 100)"
          align="center"
          resizable>
        </el-table-column>

        <el-table-column
          prop="created_by"
          label="创建人"
          :width="getColumnWidth('created_by', 100)"
          resizable>
        </el-table-column>

        <el-table-column
          prop="created_at"
          label="创建时间"
          :width="getColumnWidth('created_at', 150)"
          align="center"
          sortable="custom"
          resizable>
          <template #default="scope">
            {{ formatDate(scope.row.created_at) }}
          </template>
        </el-table-column>

        <el-table-column
          label="操作"
          :width="getColumnWidth('operations', 260)"
          fixed="right"
          resizable>
          <template #default="scope">
            <el-button
              size="small"
              @click="handleView(scope.row)"
            >
                  查看
                </el-button>
            <el-button
              size="small"
              type="primary"
              @click="handleEdit(scope.row)"
              v-if="canUpdate && canEditByStatus(scope.row)"
            >
                  编辑
                </el-button>
            <el-button
              size="small"
              type="success"
              v-if="canUpdate && canConfirmByStatus(scope.row)"
              @click="handleConfirm(scope.row)"
            >
              确认
            </el-button>
            <el-button
              size="small"
              type="danger"
              v-if="canDelete && canDeleteByStatus(scope.row)"
              @click="handleDelete(scope.row)"
            >
                  删除
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

    <!-- 新增/编辑装箱单对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogType === 'add' ? '新增装箱单' : '编辑装箱单'"
      width="80%"
      destroy-on-close
    >
        <el-form :model="form" :rules="rules" ref="formRef" label-width="120px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="装箱单号" prop="packing_list_no">
              <el-input v-model="form.packing_list_no" placeholder="系统自动生成" readonly></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="客户编号" prop="customer_code">
              <el-input v-model="form.customer_code" placeholder="请输入客户编号" style="width: 100%" @blur="handleCustomerCodeBlur">
                <template #append>
                  <el-button @click="searchCustomerByCode">查询</el-button>
                </template>
              </el-input>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="销售订单号" prop="sales_order_no">
              <el-input v-model="form.sales_order_no" placeholder="请输入销售订单号" style="width: 100%" @blur="handleSalesOrderNoBlur">
                <template #append>
                  <el-button @click="searchSalesOrderByNo">查询</el-button>
                </template>
              </el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="装箱日期" prop="packing_date">
              <el-date-picker
                v-model="form.packing_date"
                type="date"
                placeholder="选择装箱日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                style="width: 100%">
              </el-date-picker>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="客户名称">
              <el-input v-model="form.customer_name" placeholder="客户名称" readonly style="width: 100%"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="订单金额">
              <el-input v-model="form.order_amount" placeholder="订单金额" readonly style="width: 100%"></el-input>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="请输入备注"></el-input>
        </el-form-item>

      <!-- 装箱明细 -->
        <el-form-item label="装箱明细">
          <div class="materials-table-container">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <h3>装箱明细</h3>
              <div>
                <el-button v-permission="'sales:packinglists:create'" type="primary" @click="addDetail">添加明细</el-button>
                <el-button type="success" @click="updateNumbers">
                  <el-icon><Position /></el-icon> 更新编号
                </el-button>
              </div>
            </div>

            <el-table
              :data="form.details"
              border
              style="width: 100%"
              table-layout="fixed"
              :header-cell-style="{ background: '#f5f7fa', color: '#606266' }"
              empty-text="请添加装箱明细"
            >
              <el-table-column label="序号" type="index" width="60"></el-table-column>
              <el-table-column label="编号" width="120" align="center">
                <template #default="scope">
                  <el-input 
                    v-model="scope.row.item_no" 
                    placeholder="自动生成" 
                    readonly 
                    style="width: 100%; text-align: center;"
                    class="item-no-input">
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column label="产品" width="220">
                <template #default="scope">
                  <el-select
                    v-model="scope.row.product_id"
                    placeholder="请输入或选择物料"
                    style="width: 100%"
                    filterable
                    remote
                    reserve-keyword
                    :remote-method="debouncedSearchMaterials"
                    :loading="loadingMaterials"
                    @focus="handleMaterialSelectFocus"
                    @change="(val) => handleProductChange(val, scope.$index)"
                  >
                    <el-option
                      v-for="item in productOptions"
                      :key="item.id"
                      :label="`${item.code} - ${item.name}`"
                      :value="item.id"
                    />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="产品名称" width="200">
                <template #default="scope">
                  <el-input v-model="scope.row.product_name" placeholder="产品名称" readonly style="width: 100%"></el-input>
                </template>
              </el-table-column>
              <el-table-column label="规格型号" width="150">
                <template #default="scope">
                  <el-input v-model="scope.row.product_specs" placeholder="规格型号" readonly style="width: 100%"></el-input>
                </template>
              </el-table-column>
              <el-table-column label="数量" width="100" align="center">
                <template #default="scope">
                  <el-input
                    v-model="scope.row.quantity"
                    placeholder="请输入数量"
                    type="number"
                    min="1"
                    style="width: 100%; text-align: center;"
                    @input="updateNumbers">
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column label="单位编号" width="100">
                <template #default="scope">
                  <el-input
                    v-model="scope.row.unit_code"
                    placeholder="请输入单位编号"
                    style="width: 100%"
                    @blur="handleUnitCodeBlur($event, scope.$index)">
                    <template #append>
                      <el-button @click="searchUnitByCode(scope.$index)">查询</el-button>
                    </template>
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column label="单位名称" width="100">
                <template #default="scope">
                  <el-input v-model="scope.row.unit_name" placeholder="单位名称" readonly style="width: 100%"></el-input>
                </template>
              </el-table-column>
              <el-table-column label="备注" width="150">
                <template #default="scope">
                  <el-input v-model="scope.row.remark" placeholder="备注"></el-input>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="80" fixed="right">
                <template #default="scope">
                  <el-button
                    size="small"
                    type="danger"
                    @click="removeDetail(scope.$index)"
                  >
                    <el-icon><Delete /></el-icon> 删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleSubmit">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 查看装箱单详情对话框 -->
    <el-dialog
      v-model="detailsVisible"
      title="装箱单详情"
      width="60%"
      destroy-on-close
    >
      <div v-if="currentPackingList" class="packing-details">
        <!-- 装箱单基本信息 -->
        <el-descriptions :column="3" border>
          <el-descriptions-item label="装箱单号">{{ currentPackingList.packing_list_no }}</el-descriptions-item>
          <el-descriptions-item label="客户名称">{{ currentPackingList.customer_name }}</el-descriptions-item>
          <el-descriptions-item label="销售订单号">{{ currentPackingList.sales_order_no || '-' }}</el-descriptions-item>
          <el-descriptions-item label="装箱日期">{{ formatDate(currentPackingList.packing_date) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getPackingStatusColor(currentPackingList.status)">
              {{ getPackingStatusText(currentPackingList.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="总箱数">{{ currentPackingList.total_boxes || 0 }}</el-descriptions-item>
          <el-descriptions-item label="总数量">{{ currentPackingList.total_quantity || 0 }}</el-descriptions-item>
          <el-descriptions-item label="创建人">{{ currentPackingList.created_by || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDate(currentPackingList.created_at) }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="3">{{ currentPackingList.remark || '-' }}</el-descriptions-item>
        </el-descriptions>
        
        <!-- 装箱明细列表 -->
        <div class="products-title">装箱明细</div>
        <el-table :data="currentPackingList.details" border style="width: 100%" table-layout="fixed">
          <el-table-column prop="item_no" label="编号" width="120">
            <template #default="{ row }">
              {{ row.item_no || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="product_code" label="产品编码" width="120">
            <template #default="{ row }">
              {{ row.product_code || row.code || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="product_name" label="产品名称" />
          <el-table-column prop="product_specs" label="规格型号" />
          <el-table-column prop="quantity" label="数量" width="100" />
          <el-table-column prop="unit_name" label="单位" width="80" />
          <el-table-column prop="remark" label="备注" />
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>

import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { baseDataApi, salesApi } from '@/services/api'
import { parseListData, parsePaginatedData } from '@/utils/responseParser'
import { SEARCH_CONFIG, mapMaterialData, searchMaterials as performSearchMaterials } from '@/utils/searchConfig'
import { useAuthStore } from '@/stores/auth'
import {
  Search,
  Plus,
  Upload,
  Download,
  ArrowDown,
  Delete,
  Position
} from '@element-plus/icons-vue'

// 权限store
const authStore = useAuthStore()

// 权限控制
const canUpdate = computed(() => authStore.hasPermission('sales:packinglists:update'))
const canDelete = computed(() => authStore.hasPermission('sales:packinglists:delete'))

// 常量定义
const SEARCH_DEBOUNCE_DELAY = 300; // 搜索防抖延迟
const DEFAULT_PAGE_SIZE = 20; // 默认分页大小

// 数据定义
const loading = ref(false)
const tableData = ref([])
const currentPage = ref(1)
const pageSize = ref(DEFAULT_PAGE_SIZE)
const total = ref(0)
const searchQuery = ref('')
const statusFilter = ref('')
const dateRange = ref([])
const detailsVisible = ref(false)
const currentPackingList = ref(null)
const dialogVisible = ref(false)
const dialogType = ref('add')
const formRef = ref(null)

// 表格列宽存储键
const TABLE_COLUMN_WIDTH_KEY = 'packingLists_column_widths'

// 存储列宽
const saveColumnWidth = (columnName, width) => {
  try {
    const widths = JSON.parse(localStorage.getItem(TABLE_COLUMN_WIDTH_KEY) || '{}')
    widths[columnName] = width
    localStorage.setItem(TABLE_COLUMN_WIDTH_KEY, JSON.stringify(widths))
  } catch (error) {
    // 静默处理列宽保存失败
  }
}

// 获取保存的列宽
const getColumnWidth = (columnName, defaultWidth) => {
  try {
    const widths = JSON.parse(localStorage.getItem(TABLE_COLUMN_WIDTH_KEY) || '{}')
    return widths[columnName] || defaultWidth
  } catch (error) {
    return defaultWidth
  }
}

// 装箱单状态选项
const packingStatuses = [
  { label: '草稿', value: 'draft' },
  { label: '已确认', value: 'confirmed' },
  { label: '装箱中', value: 'packing' },
  { label: '已完成', value: 'completed' },
  { label: '已取消', value: 'cancelled' }
]

// 下拉选项
const customerOptions = ref([])
const salesOrderOptions = ref([])
const productOptions = ref([])
const unitOptions = ref([])

// 装箱单统计数据
const packingStats = ref({
  total: 0,
  draft: 0,
  confirmed: 0,
  packing: 0,
  completed: 0,
  totalBoxes: 0
})

// 表单数据
const form = reactive({
  id: null,
  packing_list_no: '',
  customer_code: '',
  customer_id: '',
  customer_name: '',
  sales_order_no: '',
  sales_order_id: '',
  order_amount: '',
  packing_date: new Date().toISOString().split('T')[0],
  status: 'draft',
  remark: '',
  details: []
})

// 表单验证规则
const rules = {
  customer_code: [
    { required: true, message: '请输入客户编号', trigger: 'blur' }
  ],
  sales_order_no: [
    { required: true, message: '请输入销售订单号', trigger: 'blur' }
  ],
  packing_date: [
    { required: true, message: '请选择装箱日期', trigger: 'change' }
  ]
}

// 防抖搜索处理
let searchTimeout = null;

onMounted(async () => {
  try {
    // 只加载装箱单数据，其他数据按需加载
    await fetchData();

    // 延迟加载客户数据（用于搜索下拉框）
    setTimeout(() => {
      fetchCustomers();
    }, 200);

    // 物料数据只在需要时加载（打开新增/编辑对话框时）
  } catch (error) {
    // 静默处理组件挂载错误
  }
})

onUnmounted(() => {
  // 清理定时器
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }

  // 清理数据
  tableData.value = [];
  currentPackingList.value = null;
})

// 计算统计数据
const calculatePackingStats = () => {
  const stats = {
    total: tableData.value.length,
    draft: 0,
    confirmed: 0,
    packing: 0,
    completed: 0,
    totalBoxes: 0
  }

  tableData.value.forEach(packingList => {
    const status = packingList.status;
    if (status === 'draft') {
      stats.draft++
    } else if (status === 'confirmed') {
      stats.confirmed++
    } else if (status === 'packing') {
      stats.packing++
    } else if (status === 'completed') {
      stats.completed++
      }

    // 累计总箱数
    stats.totalBoxes += parseInt(packingList.total_boxes) || 0
  })

  packingStats.value = stats
}

// 重置搜索方法
const resetSearch = () => {
  searchQuery.value = '';
  statusFilter.value = '';
  dateRange.value = [];
  currentPage.value = 1;
  fetchData();
};

// 防抖搜索处理
const handleSearch = (immediate = false) => {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  if (immediate) {
    currentPage.value = 1;
  fetchData();
  } else {
    searchTimeout = setTimeout(() => {
      currentPage.value = 1;
      fetchData();
    }, SEARCH_DEBOUNCE_DELAY);
  }
};

// 获取装箱单数据
const fetchData = async () => {
  if (loading.value) return; // 防止重复请求

  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      search: searchQuery.value?.trim() || '', // 去除空格
      status: statusFilter.value,
      sort: 'packing_list_no',
      order: 'desc'
    };

    // 添加日期范围参数
    if (dateRange.value && dateRange.value.length === 2) {
      params.startDate = dayjs(dateRange.value[0]).format('YYYY-MM-DD');
      params.endDate = dayjs(dateRange.value[1]).format('YYYY-MM-DD');
    }

    const response = await salesApi.getPackingLists(params);
    const { list, total: totalCount } = parsePaginatedData(response);

    tableData.value = normalizePackingListsData(list);
    total.value = totalCount;

      // 计算统计数据
    calculatePackingStats();
  } catch (error) {
    console.error('获取装箱单数据失败:', error);
    ElMessage.error(`获取装箱单数据失败: ${error.message || '网络错误'}`);

    // 错误时设置默认值
    tableData.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};

// 数据规范化处理函数
const normalizePackingListsData = (packingLists) => {
  if (!Array.isArray(packingLists)) return [];

  return packingLists.map(packingList => ({
    ...packingList,
    packing_date: packingList.packing_date || packingList.packingDate,
    updated_at: packingList.updated_at || packingList.created_at || new Date().toISOString(),
    // 确保数值字段为数字类型
    total_boxes: parseInt(packingList.total_boxes) || 0,
    total_quantity: parseInt(packingList.total_quantity) || 0,
    // 确保明细项存在
    details: Array.isArray(packingList.details) ? packingList.details : []
  })).sort((a, b) => {
    // 按装箱单号降序排列
    const packingNoA = a.packing_list_no || '';
    const packingNoB = b.packing_list_no || '';
    return packingNoB.localeCompare(packingNoA);
  });
};

// 获取客户选项
const fetchCustomers = async () => {
  try {
    const response = await baseDataApi.getCustomers({ pageSize: 1000, status: 'active' }); // 只获取启用的客户
    const dataArray = parseListData(response, { enableLog: false });
    customerOptions.value = dataArray.filter(item =>
      item && item.id !== undefined && item.id !== null && item.name
    );
  } catch (error) {
    console.error('获取客户数据失败:', error);
    customerOptions.value = [];
  }
};

// 获取销售订单选项
const fetchSalesOrders = async () => {
  try {
    const response = await salesApi.getOrders({ pageSize: 1000 });
    const dataArray = parseListData(response, { enableLog: false });

    // 过滤掉无效的数据
    salesOrderOptions.value = dataArray.filter(item =>
      item && item.id !== undefined && item.id !== null && item.order_no
    );
  } catch (error) {
    console.error('获取销售订单数据失败:', error);
    salesOrderOptions.value = [];
  }
};

// ====== 物料搜索相关 (开始) ======
const loadingMaterials = ref(false);
let currentSearchId = 0;

// 防抖函数
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

const searchProducts = async (query) => {
  const searchId = ++currentSearchId;
  loadingMaterials.value = true;
  
  try {
    if (!query || query.trim().length === 0) {
      const defaultResults = await performSearchMaterials(baseDataApi, '', {
        pageSize: 20,
        includeAll: true
      });
      if (searchId === currentSearchId) {
        productOptions.value = mapMaterialData(defaultResults);
      }
      return;
    }
    
    const searchResults = await performSearchMaterials(baseDataApi, query.trim(), {
      pageSize: SEARCH_CONFIG.REMOTE_SEARCH_PAGE_SIZE,
      includeAll: true
    });
    
    if (searchId === currentSearchId) {
      productOptions.value = mapMaterialData(searchResults);
    }
  } catch (error) {
    if (searchId === currentSearchId) productOptions.value = [];
  } finally {
    if (searchId === currentSearchId) loadingMaterials.value = false;
  }
};

const debouncedSearchMaterials = debounce(searchProducts, SEARCH_CONFIG.SEARCH_DEBOUNCE_DELAY || 300);

const handleMaterialSelectFocus = () => {
  if (productOptions.value.length === 0) {
    debouncedSearchMaterials('');
  }
};

const fetchProducts = async () => {
  debouncedSearchMaterials('');
};
// ====== 物料搜索相关 (结束) ======

// 获取单位选项
const fetchUnits = async () => {
  try {
    const response = await baseDataApi.getUnits({ pageSize: 1000, status: 1 }); // 只获取启用的单位
    const dataArray = parseListData(response, { enableLog: false });
    unitOptions.value = dataArray.filter(item =>
      item && item.id !== undefined && item.id !== null && item.name
    );
  } catch (error) {
    console.error('获取单位数据失败:', error);
    unitOptions.value = [];
  }
};

// 生成临时ID
const generateTempId = () => {
  return 'temp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
};

// 根据VBA逻辑更新编号的核心函数
const updateNumbers = () => {
  let startNumber = 1; // 初始化起始编号为1

  // 遍历所有明细行
  for (let i = 0; i < form.details.length; i++) {
    const detail = form.details[i];
    const cellValue = detail.quantity;

    // 检查是否为数字并且大于0
    let n = 0;
    if (cellValue && !isNaN(cellValue) && Number(cellValue) > 0) {
      n = parseInt(cellValue); // 转换为整数
    }

    if (n > 0) {
      const endNumber = startNumber + n - 1;

      // 如果n=1，只显示单个编号；如果n>1，显示范围
      if (n === 1) {
        detail.item_no = `NO.${startNumber}`;
      } else {
        detail.item_no = `NO.${startNumber}-${endNumber}`;
      }

      // 更新起始编号为下一个编号
      startNumber = endNumber + 1;
    } else {
      // 如果数量小于或等于0，或非数字，留空
      detail.item_no = '';
    }
  }
};

// 状态相关函数
const getPackingStatusText = (status) => {
  const statusMap = {
    'draft': '草稿',
    'confirmed': '已确认',
    'packing': '装箱中',
    'completed': '已完成',
    'cancelled': '已取消'
  };
  return statusMap[status] || '未知';
};

const getPackingStatusColor = (status) => {
  const typeMap = {
    'draft': 'info',
    'confirmed': 'warning',
    'packing': 'primary',
    'completed': 'success',
    'cancelled': 'danger'
  };
  return typeMap[status] || 'info';
};

// 状态判断函数
const canEditByStatus = (row) => ['draft', 'confirmed'].includes(row.status)
const canConfirmByStatus = (row) => row.status === 'draft'
const canDeleteByStatus = (row) => ['draft'].includes(row.status)

// 分页处理
const handleSizeChange = (val) => {
  pageSize.value = Number(val) || DEFAULT_PAGE_SIZE;
  currentPage.value = 1;
  fetchData();
};

const handleCurrentChange = (val) => {
  currentPage.value = Number(val) || 1;
  fetchData();
};

// 表格排序事件处理函数
const handleSortChange = ({ prop, order }) => {
  // 根据不同列实现排序
  if (prop === 'packing_list_no') {
    const sortOrder = order === 'descending' ? 'desc' : 'asc';
    tableData.value.sort((a, b) => {
      const packingNoA = a.packing_list_no || '';
      const packingNoB = b.packing_list_no || '';
      
      const comparison = packingNoA.localeCompare(packingNoB);
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  } else if (prop === 'packing_date') {
    const sortOrder = order === 'descending' ? 'desc' : 'asc';
    tableData.value.sort((a, b) => {
      const packingDateA = a.packing_date;
      const packingDateB = b.packing_date;
      
      const comparison = packingDateA.localeCompare(packingDateB);
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  } else if (prop === 'created_at') {
    const sortOrder = order === 'descending' ? 'desc' : 'asc';
    tableData.value.sort((a, b) => {
      const createdAtA = a.created_at;
      const createdAtB = b.created_at;
      
      const comparison = createdAtA.localeCompare(createdAtB);
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }
}

// 新增装箱单
const handleAdd = async () => {
  dialogType.value = 'add'
  // 重置表单
  Object.keys(form).forEach(key => {
    if (key === 'details') {
      form[key] = [{
        id: generateTempId(),
        product_code: '',
        product_name: '',
        product_specs: '',
        quantity: 1,
        unit_code: '',
        unit_name: '',
        remark: '',
        item_no: ''
      }];
    } else if (key === 'packing_date') {
      form[key] = new Date().toISOString().split('T')[0];
    } else {
      form[key] = ''
    }
  })

  // 确保客户数据已加载
  if (customerOptions.value.length === 0) {
    await fetchCustomers();
  }

  // 确保销售订单数据已加载
  if (salesOrderOptions.value.length === 0) {
    await fetchSalesOrders();
  }

  // 确保产品数据已加载
  if (productOptions.value.length === 0) {
    await fetchProducts();
  }

  // 确保单位数据已加载
  if (unitOptions.value.length === 0) {
    await fetchUnits();
  }

  dialogVisible.value = true
}

// 编辑装箱单
const handleEdit = async (row) => {
  try {
    const response = await salesApi.getPackingList(row.id);
    const packingListData = response.data;

    dialogType.value = 'edit';
    
    // 先清空表单，避免数据混淆
    Object.keys(form).forEach(key => {
      if (key === 'details') {
        form[key] = []
      } else {
        form[key] = ''
      }
    })

    // 然后将行数据复制到表单中
    Object.assign(form, {
      id: packingListData.id,
      packing_list_no: packingListData.packing_list_no,
      customer_id: packingListData.customer_id,
      sales_order_id: packingListData.sales_order_id,
      packing_date: packingListData.packing_date,
      status: packingListData.status,
      remark: packingListData.remark,
      details: []
    });

    // 处理明细项
    if (Array.isArray(packingListData.details) && packingListData.details.length > 0) {
      form.details = packingListData.details.map(detail => ({
        ...detail,
        quantity: Number(detail.quantity) || 0,
        unit_code: detail.unit_code || '',
        unit_name: detail.unit_name || '',
        remark: detail.remark || ''
      }));
    }

    // 确保所有选项数据已加载
    if (customerOptions.value.length === 0) {
      await fetchCustomers();
    }
    if (salesOrderOptions.value.length === 0) {
      await fetchSalesOrders();
    }
    if (productOptions.value.length === 0) {
      await fetchProducts();
    }
    if (unitOptions.value.length === 0) {
      await fetchUnits();
    }

    dialogVisible.value = true;
  } catch (error) {
    console.error('获取装箱单详情失败:', error);
    ElMessage.error('获取装箱单详情失败');
  }
}

// 查看装箱单
const handleView = async (row) => {
  try {
    // 获取最新的装箱单详情
    const response = await salesApi.getPackingList(row.id)
    const packingListData = response.data
    
    currentPackingList.value = packingListData
    detailsVisible.value = true
  } catch (error) {
    console.error('获取装箱单详情失败:', error)
    ElMessage.error('获取装箱单详情失败: ' + (error.message || '未知错误'))
  }
}

// 查看销售订单
const handleViewSalesOrder = (row) => {
  // 这里可以跳转到销售订单详情页面
  ElMessage.info('跳转到销售订单详情页面');
}

// 删除装箱单
const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除装箱单 "${row.packing_list_no}" 吗？`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );

    await salesApi.deletePackingList(row.id);
    ElMessage.success('删除成功');
    fetchData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除装箱单失败:', error);
      ElMessage.error('删除装箱单失败');
    }
  }
}

// 确认装箱单
const handleConfirm = async (row) => {
  try {
    await ElMessageBox.confirm(
      '确定要确认该装箱单吗？',
      '提示',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    // 调用API更新装箱单状态
    await salesApi.updatePackingList(row.id, { status: 'confirmed' });

    ElMessage.success('装箱单已确认');
    await fetchData(); // 刷新列表
  } catch (error) {
    if (error !== 'cancel') {
      console.error('确认装箱单时出错:', error);
      ElMessage.error('确认装箱单失败: ' + (error.message || '未知错误'));
    }
  }
}

// 添加明细
const addDetail = () => {
  const newDetail = {
    id: generateTempId(),
    product_code: '',
    product_name: '',
    product_specs: '',
    quantity: 1,
    unit_code: '',
    unit_name: '',
    remark: '',
    item_no: ''
  };
  form.details.push(newDetail);
  // 添加后自动更新编号
  updateNumbers();
};

// 删除明细
const removeDetail = (index) => {
  form.details.splice(index, 1);
  // 删除后自动更新编号
  updateNumbers();
};

// 产品变更处理
const handleProductChange = (productId, index) => {
  const product = productOptions.value.find(item => item.id === productId);
  if (product) {
    form.details[index].product_code = product.code; // 设置产品编号
    form.details[index].product_name = product.name;
    form.details[index].product_specs = product.specs || product.specification || '';
    form.details[index].product_id = product.id; // 保存产品ID

    // 设置默认单位
    if (product.unit_id) {
      form.details[index].unit_id = product.unit_id;
    }
    if (product.unit_name) {
      form.details[index].unit_name = product.unit_name;
    }
  }
  // 产品变更后自动更新编号
  updateNumbers();
};

// 单位变更处理
const handleUnitCodeBlur = (event, index) => {
  const unitCode = event.target.value.trim();
  const unit = unitOptions.value.find(item => item.code === unitCode);
  if (unit) {
    form.details[index].unit_name = unit.name;
    form.details[index].unit_id = unit.id; // 保存单位ID
  } else {
    form.details[index].unit_name = '';
    form.details[index].unit_id = '';
    ElMessage.warning('未找到单位，请检查编号或添加该单位');
  }
  // 单位变更后自动更新编号
  updateNumbers();
};

// 单位编号搜索
const searchUnitByCode = async (index) => {
  const unitCode = form.details[index].unit_code.trim();
  if (!unitCode) {
    ElMessage.warning('请先输入单位编号');
    return;
  }
  try {
    const response = await baseDataApi.getUnits({
      search: unitCode,
      pageSize: 1000
    });
    const units = parseListData(response, { enableLog: false });
    const unit = units.find(u => u.code === unitCode);
    if (unit) {
      form.details[index].unit_name = unit.name;
      form.details[index].unit_id = unit.id; // 保存单位ID
      ElMessage.success(`找到单位: ${unit.name}`);
    } else {
      form.details[index].unit_name = '';
      form.details[index].unit_id = '';
      ElMessage.warning(`未找到单位 "${unitCode}"，请检查编号或添加该单位`);
    }
    updateNumbers();
  } catch (error) {
    console.error('搜索单位失败:', error);
    ElMessage.error('搜索单位失败');
  }
};

// 客户变更处理
const handleCustomerChange = (customerId) => {
  const selectedCustomer = customerOptions.value.find(c => c.id === customerId);
  if (selectedCustomer) {
    // 可以在这里添加客户变更后的逻辑
    form.customer_code = selectedCustomer.code;
    form.customer_name = selectedCustomer.name;
  }
};

// 销售订单变更处理
const handleSalesOrderChange = (salesOrderId) => {
  const selectedSalesOrder = salesOrderOptions.value.find(s => s.id === salesOrderId);
  if (selectedSalesOrder) {
    // 可以在这里添加销售订单变更后的逻辑
    form.sales_order_no = selectedSalesOrder.order_no;
    form.order_amount = selectedSalesOrder.total_amount || selectedSalesOrder.totalAmount || '0.00';
  }
};

// 重置表单
const resetForm = () => {
  Object.assign(form, {
    id: null,
    packing_list_no: '',
    customer_code: '',
    customer_id: '',
    customer_name: '',
    sales_order_no: '',
    sales_order_id: '',
    order_amount: '',
    packing_date: new Date().toISOString().split('T')[0],
    status: 'draft',
    remark: '',
    details: []
  });

  if (formRef.value) {
    formRef.value.clearValidate();
  }
};

// 提交表单
const handleSubmit = async () => {
  if (!formRef.value) return;

  try {
    await formRef.value.validate();

    const submitData = {
      ...form,
      packing_date: form.packing_date,
      details: form.details.map(detail => ({
        ...detail,
        quantity: Number(detail.quantity) || 0
      }))
    };

    if (form.id) {
      await salesApi.updatePackingList(form.id, submitData);
      ElMessage.success('更新成功');
    } else {
      await salesApi.createPackingList(submitData);
      ElMessage.success('创建成功');
    }

    dialogVisible.value = false;
    fetchData();
  } catch (error) {
    console.error('提交失败:', error);
    ElMessage.error('提交失败');
  }
};

// 导入功能
const handleImport = () => {
  // 创建文件输入元素
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.csv,.xlsx,.xls'

  input.onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    try {
      // 读取文件
      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const content = event.target.result
          // 这里可以解析CSV或Excel文件
          // 简单示例:解析CSV
          const lines = content.split('\n')
          const headers = lines[0].split(',')

          ElMessage.success(`成功读取文件,共${lines.length - 1}行数据`)
          
          // 实际项目中应该:
          // 1. 解析数据
          // 2. 验证数据格式
          // 3. 调用API批量创建装箱单
        } catch (error) {
          console.error('解析文件失败:', error)
          ElMessage.error('文件格式错误')
        }
      }
      reader.readAsText(file)
    } catch (error) {
      console.error('导入失败:', error)
      ElMessage.error('导入失败')
    }
  }

  input.click()
};

// 导出功能
const handleExport = () => {
  if (packingLists.value.length === 0) {
    ElMessage.warning('暂无数据可导出')
    return
  }

  try {
    // 准备导出数据
    const exportData = packingLists.value

    // 转换为CSV格式
    const headers = ['装箱单号', '客户名称', '发货日期', '总箱数', '总件数', '总重量(kg)', '总体积(m³)', '状态', '备注']
    const csvContent = [
      headers.join(','),
      ...exportData.map(row => [
        row.packing_no || '',
        row.customer_name || '',
        row.delivery_date || '',
        row.total_boxes || 0,
        row.total_quantity || 0,
        row.total_weight || 0,
        row.total_volume || 0,
        getStatusLabel(row.status),
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
    a.download = `装箱单列表_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`
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

// 获取状态标签
const getStatusLabel = (status) => {
  const item = packingStatuses.find(s => s.value === status)
  return item ? item.label : status
};

// 客户编号搜索
const searchCustomerByCode = async () => {
  const customerCode = form.customer_code.trim();
  if (!customerCode) {
    ElMessage.warning('请先输入客户编号');
    return;
  }
  try {
    const response = await baseDataApi.getCustomers({
      search: customerCode,
      pageSize: 1000
    });
    const customers = parseListData(response, { enableLog: false });
    const customer = customers.find(c => c.code === customerCode);
    if (customer) {
      form.customer_name = customer.name;
      form.customer_id = customer.id;
      ElMessage.success(`找到客户: ${customer.name}`);
    } else {
      form.customer_name = '';
      form.customer_id = '';
      ElMessage.warning(`未找到客户 "${customerCode}"，请检查编号或添加该客户`);
    }
  } catch (error) {
    console.error('搜索客户失败:', error);
    ElMessage.error('搜索客户失败');
  }
};

// 客户编号失焦处理
const handleCustomerCodeBlur = (event) => {
  const customerCode = event.target.value.trim();
  if (customerCode) {
    searchCustomerByCode();
  }
};

// 销售订单号搜索
const searchSalesOrderByNo = async () => {
  const salesOrderNo = form.sales_order_no.trim();
  if (!salesOrderNo) {
    ElMessage.warning('请先输入销售订单号');
    return;
  }
  try {
    const response = await salesApi.getOrders({
      search: salesOrderNo,
      pageSize: 1000
    });
    const salesOrders = parseListData(response, { enableLog: false });
    const salesOrder = salesOrders.find(s => s.order_no === salesOrderNo);
    if (salesOrder) {
      form.sales_order_id = salesOrder.id;
      form.order_amount = salesOrder.total_amount || salesOrder.totalAmount || '0.00';
      ElMessage.success(`找到销售订单: ${salesOrderNo}`);
    } else {
      form.sales_order_id = '';
      form.order_amount = '';
      ElMessage.warning(`未找到销售订单 "${salesOrderNo}"，请检查订单号`);
    }
  } catch (error) {
    console.error('搜索销售订单失败:', error);
    ElMessage.error('搜索销售订单失败');
  }
};

// 销售订单号失焦处理
const handleSalesOrderNoBlur = (event) => {
  const salesOrderNo = event.target.value.trim();
  if (salesOrderNo) {
    searchSalesOrderByNo();
  }
};
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

.search-buttons {
  display: flex;
  gap: 8px;
}

.more-actions {
  display: flex;
  justify-content: flex-start;
}

.packing-detail {
  padding: 10px;
}

.packing-details {
  padding: 10px;
}

.operation-group {
  display: flex;
  gap: 4px;
}

.operation-group:not(:last-child) {
  border-right: 1px solid var(--color-border-lighter);
  padding-right: 8px;
}

.materials-table-container {
  margin-bottom: var(--spacing-lg);
  overflow: visible;
}

/* 移除所有高度限制 */
.el-table-column,
.el-table__body,
.el-table__header,
.el-table__body-wrapper,
.el-table__header-wrapper {
  max-height: none !important;
  height: auto !important;
  overflow: visible !important;
}

/* 物料选择下拉样式 */
:deep(.material-select-dropdown) {
  max-height: 400px !important;
}

:deep(.material-select-dropdown .el-scrollbar__wrap) {
  max-height: 400px !important;
}

:deep(.el-select-dropdown__list) {
  max-height: none !important;
}

:deep(.el-select-dropdown__wrap) {
  max-height: 400px !important;
}

/* 对话框高度 - 页面特定，其他样式使用全局主题 */
:deep(.el-dialog__body) {
  max-height: 60vh;
  overflow-y: auto;
}

/* 隐藏数字输入框的加减按钮 */
:deep(.el-input__inner[type="number"]) {
  -moz-appearance: textfield;
  appearance: textfield;
}

:deep(.el-input__inner[type="number"]::-webkit-outer-spin-button),
:deep(.el-input__inner[type="number"]::-webkit-inner-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}

/* 编号输入框样式 */
.item-no-input :deep(.el-input__inner) {
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
  color: #495057;
  font-weight: 500;
  text-align: center;
}

.item-no-input :deep(.el-input__inner):focus {
  background-color: #ffffff;
  border-color: var(--color-primary);
}

/* 数量输入框样式 */
.el-table :deep(.el-input__inner[type="number"]) {
  text-align: center;
  font-weight: 500;
}

/* 只读输入框样式 */
.el-table :deep(.el-input__inner[readonly]) {
  background-color: #f8f9fa;
  border-color: #e9ecef;
  color: #495057;
  cursor: default;
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