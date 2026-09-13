<!--
/**
 * PackingLists.vue
 * @description 装箱单管理前端界面组件文件
  * @date 2025-01-13
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page packing-lists-container">
    <!-- 页面标题 -->
    <PageHeader title="装箱单管理" subtitle="管理装箱单与发货">
      <template #actions>
<el-button v-permission="'sales:packing:create'" type="primary" :icon="Plus" @click="handleAdd">新增装箱单</el-button>
      </template>
    </PageHeader>
    <!-- 搜索区域 -->
    <FinanceQueryCard
      @search="handleSearch(true)"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="物料名称">
          <el-input
            v-model="searchQuery"
            placeholder="物料名称"
            @keyup.enter="() => handleSearch(true)"
            @input="handleSearch"
            clearable
          ></el-input>
        </el-form-item>
      </template>
      <template #advanced>
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
      </template>
      <template #actions>
          <el-dropdown class="ml-sm">
            <el-button type="primary">
              更多操作<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="handleExport">
                  <el-icon><Download /></el-icon> 导出当前页
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
      </template>
    </FinanceQueryCard>
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
        class="w-full"
        v-loading="loading"
        table-layout="fixed"
        :default-sort="{prop: 'packingListNo', order: 'descending'}"
        @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleView(row))"
        @expand-change="loadExpandedDetails"
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
                <el-descriptions-item label="客户名称">{{ props.row.customerName }}</el-descriptions-item>
                <el-descriptions-item label="销售订单号">{{ props.row.salesOrderNo || '-' }}</el-descriptions-item>
                <el-descriptions-item label="装箱日期">{{ formatDate(props.row.packingDate) }}</el-descriptions-item>
                <el-descriptions-item label="总箱数">{{ props.row.totalBoxes || 0 }}</el-descriptions-item>
                <el-descriptions-item label="总数量">{{ props.row.totalQuantity || 0 }}</el-descriptions-item>
                <el-descriptions-item label="创建人">{{ props.row.createdBy || '-' }}</el-descriptions-item>
                <el-descriptions-item label="备注" :span="3">{{ props.row.remark || '-' }}</el-descriptions-item>
              </el-descriptions>

              <div class="products-title">装箱明细</div>
              <el-table :data="props.row.details || []" v-loading="props.row.detailsLoading" border class="w-full" table-layout="fixed">
                <el-table-column prop="itemNo" label="编号" width="120">
                  <template #default="{ row }">
                    {{ row.itemNo || '-' }}
                  </template>
                </el-table-column>
                <el-table-column prop="productCode" label="产品编码" width="120">
                  <template #default="{ row }">
                    {{ row.productCode || row.code || '-' }}
                  </template>
                </el-table-column>
                <el-table-column prop="productName" label="产品名称" />
                <el-table-column prop="productSpecs" label="规格型号" />
                <el-table-column prop="quantity" label="数量" width="100" />
                <el-table-column prop="unitName" label="单位" width="80" />
                <el-table-column prop="remark" label="备注" />
              </el-table>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="packingListNo" :width="getColumnWidth('packingListNo', 150)" fixed sortable="custom" resizable>
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
              {{ scope.row.packingListNo || '未知' }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column prop="customerName" :min-width="getColumnWidth('customer_name', 150)" resizable>
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
        <el-table-column prop="salesOrderNo" label="销售订单号" :width="getColumnWidth('sales_order_no', 150)" resizable>
          <template #default="scope">
            <el-link v-if="scope.row.salesOrderNo" type="info" @click="handleViewSalesOrder(scope.row)">
              {{ scope.row.salesOrderNo }}
            </el-link>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="packingDate" label="装箱日期" :width="getColumnWidth('packingDate', 120)" sortable="custom" resizable>
          <template #default="scope">
            {{ formatDate(scope.row.packingDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" :width="getColumnWidth('status', 100)" resizable>
          <template #default="scope">
            <el-tag :type="getPackingStatusColor(scope.row.status)">
              {{ getPackingStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="totalBoxes" label="总箱数" :width="getColumnWidth('totalBoxes', 100)" resizable>
        </el-table-column>
        <el-table-column prop="totalQuantity" label="总数量" :width="getColumnWidth('totalQuantity', 100)" resizable>
        </el-table-column>
        <el-table-column prop="createdBy" label="创建人" :width="getColumnWidth('createdBy', 100)" resizable>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" :width="getColumnWidth('createdAt', 150)" sortable="custom" resizable>
          <template #default="scope">
            {{ formatDate(scope.row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" :width="getColumnWidth('operations', 320)" min-width="320" fixed="right" resizable align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="scope">
            
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
              v-if="canUpdate && statusActions[scope.row.status]"
              :loading="statusActionId === scope.row.id"
              :disabled="statusActionId !== null"
              @click="handleChangeStatus(scope.row)"
            >
              {{ statusActions[scope.row.status]?.label }}
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
          :total="Math.max(total, 0)"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        >
        </el-pagination>
      </div>
    </el-card>
    <!-- 新增/编辑装箱单对话框 -->
    <AppDialog
      v-model="dialogVisible"
      :title="dialogType === 'add' ? '新增装箱单' : '编辑装箱单'"
      mode="form"
      wide
    >
        <el-form :model="form" :rules="rules" ref="formRef" label-width="120px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="装箱单号" prop="packingListNo">
              <el-input v-model="form.packingListNo" placeholder="系统自动生成" readonly></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="客户编号" prop="customerCode">
              <el-input v-model="form.customerCode" placeholder="请输入客户编号" class="w-full" @blur="handleCustomerCodeBlur">
                <template #append>
                  <el-button @click="searchCustomerByCode">查询</el-button>
                </template>
              </el-input>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="销售订单号" prop="salesOrderNo">
              <el-input v-model="form.salesOrderNo" placeholder="请输入销售订单号" class="w-full" @blur="handleSalesOrderNoBlur">
                <template #append>
                  <el-button @click="searchSalesOrderByNo">查询</el-button>
                </template>
              </el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="装箱日期" prop="packingDate">
              <el-date-picker
                v-model="form.packingDate"
                type="date"
                placeholder="选择装箱日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                class="w-full">
              </el-date-picker>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="客户名称">
              <el-input v-model="form.customerName" placeholder="客户名称" readonly class="w-full"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="订单金额">
              <el-input v-model="form.orderAmount" placeholder="订单金额" readonly class="w-full"></el-input>
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
                <el-button v-permission="dialogType === 'add' ? 'sales:packing:create' : 'sales:packing:update'" type="primary" @click="addDetail">添加明细</el-button>
                <el-button type="success" v-permission="dialogType === 'add' ? 'sales:packing:create' : 'sales:packing:update'" @click="updateNumbers">
                  <el-icon><Position /></el-icon> 更新编号
                </el-button>
              </div>
            </div>
            <el-table
              :data="form.details"
              border
              class="w-full"
              table-layout="fixed"
              :header-cell-style="{ background: 'var(--color-bg-hover)', color: 'var(--color-text-regular)' }"
              empty-text="请添加装箱明细"
            >
              <el-table-column label="序号" type="index" width="60"></el-table-column>
              <el-table-column label="编号" width="120">
                <template #default="scope">
                  <el-input
                    v-model="scope.row.itemNo"
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
                    v-model="scope.row.productId"
                    placeholder="请输入或选择物料"
                    class="w-full"
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
                  <el-input v-model="scope.row.productName" placeholder="产品名称" readonly class="w-full"></el-input>
                </template>
              </el-table-column>
              <el-table-column label="规格型号" width="150">
                <template #default="scope">
                  <el-input v-model="scope.row.productSpecs" placeholder="规格型号" readonly class="w-full"></el-input>
                </template>
              </el-table-column>
              <el-table-column label="数量" width="100">
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
                    v-model="scope.row.unitCode"
                    placeholder="请输入单位编号"
                    class="w-full"
                    @blur="handleUnitCodeBlur($event, scope.$index)">
                    <template #append>
                      <el-button @click="searchUnitByCode(scope.$index)">查询</el-button>
                    </template>
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column label="单位名称" width="100">
                <template #default="scope">
                  <el-input v-model="scope.row.unitName" placeholder="单位名称" readonly class="w-full"></el-input>
                </template>
              </el-table-column>
              <el-table-column label="备注" width="150">
                <template #default="scope">
                  <el-input v-model="scope.row.remark" placeholder="备注"></el-input>
                </template>
              </el-table-column>
              <el-table-column label="操作" min-width="80" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
                <template #default="scope">
                  <el-button
                    size="small"
                    type="danger"
                    v-permission="dialogType === 'add' ? 'sales:packing:create' : 'sales:packing:update'"
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
          <el-button type="primary" v-permission="dialogType === 'add' ? 'sales:packing:create' : 'sales:packing:update'" @click="handleSubmit" :loading="submitting">确定</el-button>
        </span>
      </template>
        </AppDialog>
    <!-- 查看装箱单详情对话框 -->
    <AppDialog
      v-model="detailsVisible"
      title="装箱单详情"
      mode="view"
      content-width="wide"
      :detail-navigation="packingListViewNavigation"
    >
      <div v-if="currentPackingList" class="packing-details">
        <!-- 装箱单基本信息 -->
        <el-descriptions :column="3" border>
          <el-descriptions-item label="装箱单号">{{ currentPackingList.packingListNo }}</el-descriptions-item>
          <el-descriptions-item label="客户名称">{{ currentPackingList.customerName }}</el-descriptions-item>
          <el-descriptions-item label="销售订单号">{{ currentPackingList.salesOrderNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="装箱日期">{{ formatDate(currentPackingList.packingDate) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getPackingStatusColor(currentPackingList.status)">
              {{ getPackingStatusText(currentPackingList.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="总箱数">{{ currentPackingList.totalBoxes || 0 }}</el-descriptions-item>
          <el-descriptions-item label="总数量">{{ currentPackingList.totalQuantity || 0 }}</el-descriptions-item>
          <el-descriptions-item label="创建人">{{ currentPackingList.createdBy || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDate(currentPackingList.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="3">{{ currentPackingList.remark || '-' }}</el-descriptions-item>
        </el-descriptions>

        <!-- 装箱明细列表 -->
        <div class="products-title">装箱明细</div>
        <el-table :data="currentPackingList.details" border class="w-full" table-layout="fixed">
          <el-table-column prop="itemNo" label="编号" width="120">
            <template #default="{ row }">
              {{ row.itemNo || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="productCode" label="产品编码" width="120">
            <template #default="{ row }">
              {{ row.productCode || row.code || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="productName" label="产品名称" />
          <el-table-column prop="productSpecs" label="规格型号" />
          <el-table-column prop="quantity" label="数量" width="100" />
          <el-table-column prop="unitName" label="单位" width="80" />
          <el-table-column prop="remark" label="备注" />
        </el-table>
      </div>
    </AppDialog>
  </div>
</template>
<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { formatLocalDate } from '@/utils/format';
//
import { ref, reactive, onMounted, onUnmounted, computed, toRefs } from 'vue'
import { useRouter } from 'vue-router'
import { usePaginatedFetching, useFormSubmit } from '@/composables/useDataFetching'
import { InfoFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import dayjs from 'dayjs'
import { formatDate } from '@/utils/helpers/dateUtils'
import { baseDataApi, salesApi } from '@/api'
import { parseListData } from '@/utils/responseParser'
import { useListDetailNavigation } from '@/composables/useListDetailNavigation'
import { getPackingStatusText, getPackingStatusColor, PACKING_STATUS_OPTIONS } from '@/constants/systemConstants'
import { SEARCH_CONFIG, mapMaterialData, searchMaterials as performSearchMaterials } from '@/utils/searchConfig'
import { useAuthStore } from '@/stores/auth'
import {
  Plus,
  Download,
  ArrowDown,
  Delete,
  Position
} from '@element-plus/icons-vue'
//
const authStore = useAuthStore()
const router = useRouter()
//
const canUpdate = computed(() => authStore.hasPermission('sales:packing:update'))
const canDelete = computed(() => authStore.hasPermission('sales:packing:delete'))
//
const SEARCH_DEBOUNCE_DELAY = 300; // 搜索防抖延迟
const DEFAULT_PAGE_SIZE = 20; // 默认分页大小
const searchQuery = ref('')
const statusFilter = ref('')
const dateRange = ref([])
const sort = ref({ sort: 'packingListNo', order: 'desc' })
const {
  loading, data: tableData, pagination, statistics,
  fetchData, handleSizeChange, handlePageChange: handleCurrentChange,
} = usePaginatedFetching(params => salesApi.getPackingLists({
  ...params, ...sort.value,
  search: searchQuery.value.trim(), status: statusFilter.value,
  ...(dateRange.value?.length === 2 ? {
    startDate: dayjs(dateRange.value[0]).format('YYYY-MM-DD'),
    endDate: dayjs(dateRange.value[1]).format('YYYY-MM-DD'),
  } : {}),
}), { pageSize: DEFAULT_PAGE_SIZE, errorMessage: '获取装箱单失败' })
const { current: currentPage, pageSize, total } = toRefs(pagination)
const {
  previousItem: previousViewPackingList, nextItem: nextViewPackingList,
  hasPrevious: hasPreviousViewPackingList, hasNext: hasNextViewPackingList,
  setCurrentItem: setCurrentViewPackingList,
} = useListDetailNavigation(tableData)
const detailsVisible = ref(false)
const currentPackingList = ref(null)
const detailsLoading = ref(false)
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
  } catch {
    // 静默处理列宽保存失败
  }
}
// 获取保存的列宽
const getColumnWidth = (columnName, defaultWidth) => {
  try {
    const widths = JSON.parse(localStorage.getItem(TABLE_COLUMN_WIDTH_KEY) || '{}')
    const savedWidth = Number(widths[columnName])
    if (columnName === 'operations') {
      return Math.max(Number.isFinite(savedWidth) ? savedWidth : 0, defaultWidth)
    }
    return savedWidth || defaultWidth
  } catch {
    return defaultWidth
  }
}
// 装箱单状态选项（动态绑定配置中心）
const packingStatuses = PACKING_STATUS_OPTIONS
// 下拉选项
const customerOptions = ref([])
const salesOrderOptions = ref([])
const productOptions = ref([])
const unitOptions = ref([])
// 装箱单统计数据
const packingStats = computed(() => ({
  total: Number(statistics.value?.totalLists || 0),
  draft: Number(statistics.value?.draftCount || 0),
  confirmed: Number(statistics.value?.confirmedCount || 0),
  packing: Number(statistics.value?.packingCount || 0),
  completed: Number(statistics.value?.completedCount || 0),
  totalBoxes: Number(statistics.value?.totalBoxes || 0),
}))
// 表单数据
const form = reactive({
  id: null,
  packingListNo: '',
  customerCode: '',
  customerId: '',
  customerName: '',
  salesOrderNo: '',
  salesOrderId: '',
  orderAmount: '',
  packingDate: formatLocalDate(new Date()),
  status: 'draft',
  remark: '',
  details: []
})
// 表单验证规则
const rules = {
  customerCode: [
    { required: true, message: '请输入客户编号', trigger: 'blur' }
  ],
  salesOrderNo: [
    { required: true, message: '请输入销售订单号', trigger: 'blur' }
  ],
  packingDate: [
    { required: true, message: '请选择装箱日期', trigger: 'change' }
  ]
}
// 防抖搜索处理
let searchTimeout = null;
onMounted(() => { void fetchData() })
onUnmounted(() => {
  if (searchTimeout) clearTimeout(searchTimeout)
})
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
  if (immediate === true) {
    currentPage.value = 1;
  fetchData();
  } else {
    searchTimeout = setTimeout(() => {
      currentPage.value = 1;
      fetchData();
    }, SEARCH_DEBOUNCE_DELAY);
  }
};
// 获取客户选项
const fetchCustomers = async () => {
  try {
    const response = await baseDataApi.getCustomers({ pageSize: 50, status: 'active' });
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
    const response = await salesApi.getOrders({ pageSize: 50 });
    const dataArray = parseListData(response, { enableLog: false });
    // 过滤掉无效的数据
    salesOrderOptions.value = dataArray.filter(item =>
      item && item.id !== undefined && item.id !== null && item.orderNo
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
  } catch {
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
    const response = await baseDataApi.getUnits({ pageSize: 50, status: 1 });
    const dataArray = parseListData(response, { enableLog: false });
    unitOptions.value = dataArray.filter(item =>
      item && item.id !== undefined && item.id !== null && item.name
    );
  } catch (error) {
    console.error('获取单位数据失败:', error);
    unitOptions.value = [];
  }
};
// 生成前端草稿行ID
const generateTempId = () => {
  return `temp_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${performance.now()}`}`;
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
        detail.itemNo = `NO.${startNumber}`;
      } else {
        detail.itemNo = `NO.${startNumber}-${endNumber}`;
      }
      // 更新起始编号为下一个编号
      startNumber = endNumber + 1;
    } else {
      // 如果数量小于或等于0，或非数字，留空
      detail.itemNo = '';
    }
  }
};
// 状态判断函数
const canEditByStatus = (row) => ['draft', 'confirmed'].includes(row.status)
const statusActionId = ref(null)
const statusActions = {
  draft: { status: 'confirmed', label: '确认' },
  confirmed: { status: 'packing', label: '开始装箱' },
  packing: { status: 'completed', label: '完成装箱' }
}
const canDeleteByStatus = (row) => ['draft'].includes(row.status)
const handleSortChange = ({ prop, order }) => {
  sort.value = { sort: prop || 'packingListNo', order: order === 'ascending' ? 'asc' : 'desc' }
  currentPage.value = 1
  return fetchData()
}
// 新增装箱单
const handleAdd = async () => {
  dialogType.value = 'add'
  // 重置表单
  Object.keys(form).forEach(key => {
    if (key === 'details') {
      form[key] = [{
        id: generateTempId(),
        productCode: '',
        productName: '',
        productSpecs: '',
        quantity: 1,
        unitCode: '',
        unitName: '',
        remark: '',
        itemNo: ''
      }];
    } else if (key === 'packingDate') {
      form[key] = formatLocalDate(new Date());
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
      packingListNo: packingListData.packingListNo,
      customerId: packingListData.customerId,
      customerCode: packingListData.customerCode,
      customerName: packingListData.customerName,
      salesOrderId: packingListData.salesOrderId,
      salesOrderNo: packingListData.salesOrderNo,
      orderAmount: packingListData.orderAmount,
      packingDate: packingListData.packingDate,
      status: packingListData.status,
      remark: packingListData.remark,
      details: []
    });
    // 处理明细项
    if (Array.isArray(packingListData.details) && packingListData.details.length > 0) {
      form.details = packingListData.details.map(detail => ({
        ...detail,
        quantity: Number(detail.quantity) || 0,
        unitCode: detail.unitCode || '',
        unitName: detail.unitName || '',
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
  if (detailsLoading.value) return

  detailsLoading.value = true
  try {
    // 获取最新的装箱单详情
    const response = await salesApi.getPackingList(row.id)
    const packingListData = response.data

    currentPackingList.value = packingListData
    setCurrentViewPackingList(row)
    detailsVisible.value = true
  } catch (error) {
    console.error('获取装箱单详情失败:', error)
    ElMessage.error('获取装箱单详情失败: ' + (error.message || '未知错误'))
  } finally {
    detailsLoading.value = false
  }
}

const handleViewPrevious = () => {
  if (previousViewPackingList.value) handleView(previousViewPackingList.value)
}

const handleViewNext = () => {
  if (nextViewPackingList.value) handleView(nextViewPackingList.value)
}

const packingListViewNavigation = computed(() => ({
  hasPrevious: hasPreviousViewPackingList.value,
  hasNext: hasNextViewPackingList.value,
  loading: detailsLoading.value,
  previous: handleViewPrevious,
  next: handleViewNext
}))
const loadExpandedDetails = async (row, expandedRows) => {
  if (!expandedRows.includes(row) || row.details || row.detailsLoading) return
  row.detailsLoading = true
  try { row.details = (await salesApi.getPackingList(row.id)).data.details || [] }
  catch (error) { ElMessage.error(error.message || '获取装箱明细失败') }
  finally { row.detailsLoading = false }
}
const handleViewSalesOrder = row => {
  if (row.salesOrderNo) return router.push({ name: 'salesOrders', query: { orderNo: row.salesOrderNo } })
}
// 删除装箱单
const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除装箱单 "${row.packingListNo}" 吗？`,
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
// All status transitions use the dedicated endpoint and one submission lock.
const handleChangeStatus = async (row) => {
  const action = statusActions[row.status]
  if (!action || statusActionId.value !== null) return
  statusActionId.value = row.id
  try {
    await ElMessageBox.confirm(
      `确定对装箱单 "${row.packingListNo}" 执行${action.label}吗？`,
      action.label,
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
    await salesApi.updatePackingListStatus(row.id, action.status)
    ElMessage.success(action.label + '成功')
    await fetchData()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(action.label + '失败: ' + (error.message || '未知错误'))
    }
  } finally {
    statusActionId.value = null
  }
}
// 添加明细
const addDetail = () => {
  const newDetail = {
    id: generateTempId(),
    productCode: '',
    productName: '',
    productSpecs: '',
    quantity: 1,
    unitCode: '',
    unitName: '',
    remark: '',
    itemNo: ''
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
    form.details[index].productCode = product.code; // 设置产品编号
    form.details[index].productName = product.name;
    form.details[index].productSpecs = product.specs || product.specification || '';
    form.details[index].productId = product.id; // 保存产品ID
    // 设置默认单位
    if (product.unitId) {
      form.details[index].unitId = product.unitId;
    }
    if (product.unitName) {
      form.details[index].unitName = product.unitName;
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
    form.details[index].unitName = unit.name;
    form.details[index].unitId = unit.id; // 保存单位ID
  } else {
    form.details[index].unitName = '';
    form.details[index].unitId = '';
    ElMessage.warning('未找到单位，请检查编号或添加该单位');
  }
  // 单位变更后自动更新编号
  updateNumbers();
};
// 单位编号搜索
const searchUnitByCode = async (index) => {
  const unitCode = form.details[index].unitCode.trim();
  if (!unitCode) {
    ElMessage.warning('请先输入单位编号');
    return;
  }
  try {
    const response = await baseDataApi.getUnits({
      search: unitCode,
      pageSize: 20
    });
    const units = parseListData(response, { enableLog: false });
    const unit = units.find(u => u.code === unitCode);
    if (unit) {
      form.details[index].unitName = unit.name;
      form.details[index].unitId = unit.id; // 保存单位ID
      ElMessage.success(`找到单位: ${unit.name}`);
    } else {
      form.details[index].unitName = '';
      form.details[index].unitId = '';
      ElMessage.warning(`未找到单位 "${unitCode}"，请检查编号或添加该单位`);
    }
    updateNumbers();
  } catch (error) {
    console.error('搜索单位失败:', error);
    ElMessage.error('搜索单位失败');
  }
};
const { loading: submitting, submit } = useFormSubmit(
  data => data.id ? salesApi.updatePackingList(data.id, data) : salesApi.createPackingList(data),
  {
    successMessage: '装箱单已保存',
    onSuccess: async () => { dialogVisible.value = false; await fetchData() },
  }
)
const handleSubmit = async () => {
  if (!formRef.value) return
  try { await submit(form, formRef.value) } catch { /* Error is reported by the shared submit handler. */ }
}
// 导出功能
const handleExport = () => {
  if (tableData.value.length === 0) {
    ElMessage.warning('暂无数据可导出')
    return
  }
  try {
    // 准备导出数据
    const exportData = tableData.value
    // 转换为CSV格式
    const headers = ['装箱单号', '客户名称', '装箱日期', '总箱数', '总数量', '状态', '备注']
    const csvCell = value => '"' + String(value ?? '').replace(/"/g, '""') + '"'
    const csvContent = [
      headers.join(','),
      ...exportData.map(row => [
        row.packingListNo || '',
        row.customerName || '',
        formatDate(row.packingDate),
        row.totalBoxes || 0,
        row.totalQuantity || 0,
        getStatusLabel(row.status),
        row.remark || ''
      ].map(csvCell).join(','))
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
  const customerCode = form.customerCode.trim();
  if (!customerCode) {
    ElMessage.warning('请先输入客户编号');
    return;
  }
  try {
    const response = await baseDataApi.getCustomers({
      search: customerCode,
      pageSize: 20
    });
    const customers = parseListData(response, { enableLog: false });
    const customer = customers.find(c => c.code === customerCode);
    if (customer) {
      form.customerName = customer.name;
      form.customerId = customer.id;
      ElMessage.success(`找到客户: ${customer.name}`);
    } else {
      form.customerName = '';
      form.customerId = '';
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
  const salesOrderNo = form.salesOrderNo.trim();
  if (!salesOrderNo) {
    ElMessage.warning('请先输入销售订单号');
    return;
  }
  try {
    const response = await salesApi.getOrders({
      search: salesOrderNo,
      pageSize: 20
    });
    const salesOrders = parseListData(response, { enableLog: false });
    const salesOrder = salesOrders.find(s => s.orderNo === salesOrderNo);
    if (salesOrder) {
      form.salesOrderId = salesOrder.id;
      form.orderAmount = salesOrder.totalAmount || '0.00';
      ElMessage.success(`找到销售订单: ${salesOrderNo}`);
    } else {
      form.salesOrderId = '';
      form.orderAmount = '';
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
  background-color: var(--color-bg-section);
  border: 1px solid var(--color-border-lighter);
  color: var(--color-text-regular);
  font-weight: 500;
  text-align: center;
}
.item-no-input :deep(.el-input__inner):focus {
  background-color: var(--color-bg-base);
  border-color: var(--color-primary);
}
/* 数量输入框样式 */
.el-table :deep(.el-input__inner[type="number"]) {
  text-align: center;
  font-weight: 500;
}
/* 只读输入框样式 */
.el-table :deep(.el-input__inner[readonly]) {
  background-color: var(--color-bg-section);
  border-color: var(--color-border-lighter);
  color: var(--color-text-regular);
  cursor: default;
}
:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
