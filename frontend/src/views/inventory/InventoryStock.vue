<!--
/**
 * InventoryStock.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page inventory-stock-container">
    <PageHeader title="库存明细" subtitle="查看库存明细与变动记录">
      <template #actions>
<el-button v-if="canEdit" type="primary" :icon="Plus" @click="stockAddDialogVisible = true">{{ $t('common.adjust') }}</el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :expanded="showAdvancedFilter"
      :loading="loading"
      expand-label="高级筛选"
      @update:expanded="showAdvancedFilter = $event"
      @search="handleSearch"
      @reset="handleReset"
    >
      <template #basic>
        <el-form-item :label="$t('page.inventory.stock.materialName')">
          <el-input
            v-model="searchQuery"
            :placeholder="$t('page.inventory.stock.materialSearchPlaceholder')"
            clearable

            @input="handleSearchInput"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          />
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item :label="$t('page.inventory.stock.location')">
          <el-select
            v-model="locationFilter"
            :placeholder="$t('page.inventory.stock.location')"
            clearable
          >
            <el-option
              v-for="item in locations"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('page.baseData.materials.category')">
          <el-select
            v-model="categoryFilter"
            :placeholder="$t('page.baseData.materials.category')"
            clearable
          >
            <el-option
              v-for="item in categories"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="库存状态">
          <el-select
            v-model="stockStatusFilter"
            placeholder="全部"
            clearable
          >
            <el-option label="全部" value="" />
            <el-option label="正常" value="normal" />
            <el-option label="低库存" value="low" />
            <el-option label="零库存" value="zero" />
          </el-select>
        </el-form-item>
        <el-form-item label="库存数量">
          <div class="query-range-inputs">
              <el-input
                v-model="minQuantity"
                placeholder="最小值"
                clearable
                inputmode="decimal"
              />
              <span class="query-range-separator">-</span>
              <el-input
                v-model="maxQuantity"
                placeholder="最大值"
                clearable
                inputmode="decimal"
              />
          </div>
        </el-form-item>
        <el-form-item label="更新时间">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="-"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
      </template>
      <template #actions>
        <el-dropdown @command="handleExportCommand">
          <el-button type="warning">
            <el-icon><Download /></el-icon> {{ $t('common.export') }}
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="summary">导出库存汇总</el-dropdown-item>
              <el-dropdown-item command="detail">导出库存汇总+明细</el-dropdown-item>
              <el-dropdown-item command="selected" :disabled="selectedRows.length === 0">导出选中项</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </FinanceQueryCard>

    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.totalItems || 0 }}</div>
        <div class="stat-label">物料种类</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.totalLocations || 0 }}</div>
        <div class="stat-label">库位数量</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.lowStock || 0 }}</div>
        <div class="stat-label">低库存预警</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.outOfStock || 0 }}</div>
        <div class="stat-label">零库存物料</div>
      </el-card>
    </div>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table
        ref="tableRef"
        :data="tableData"
        border
        class="table-row-click w-full"
        v-loading="loading"
        @selection-change="handleSelectionChange"
        @sort-change="handleSortChange"
      
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleViewDetail(row))">
        <template #empty>
          <EmptyState description="暂无库存数据" />
        </template>
        <el-table-column type="selection" width="55" />
        <el-table-column prop="materialCode" label="物料编码" width="140" sortable="custom" />
        <el-table-column prop="materialName" label="物料名称" min-width="250" sortable="custom" />
        <el-table-column prop="specification" label="规格" width="340" />
        <el-table-column prop="locationName" label="仓库" width="130" sortable="custom" />
        <el-table-column prop="categoryName" label="类别" width="110" sortable="custom" />
        <el-table-column label="库存数量" width="110" sortable="custom" prop="quantity">
          <template #default="scope">
            <span :class="{ 'low-stock': isLowStock(scope.row), 'out-of-stock': isOutOfStock(scope.row) }">
              {{ formatQuantity(scope.row.quantity) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="unitName" label="单位" width="70" />
        <el-table-column prop="updatedAt" label="更新时间" width="150" sortable="custom">
          <template #default="scope">
            {{ formatDateTime(scope.row.updatedAt, 'YYYY-MM-DD HH:mm') }}
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="180" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="scope">
            <div class="table-actions">
              
              <el-button
                v-if="isLowStock(scope.row)"
                size="small"
                type="warning"
                @click="handleQuickPurchase(scope.row)"
              >
                <el-icon><ShoppingCart /></el-icon> 申购
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.currentPage"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        >
        </el-pagination>
      </div>
    </el-card>

    <!-- 明细对话框（查看：AppDialog mode=view 居中弹窗） -->
    <AppDialog
      v-model="detailDialogVisible"
      title="库存明细"
      mode="view"
      :loading="detailLoading"
      :detail-navigation="stockViewNavigation"
    >
      <div class="stock-detail-dialog">
      <el-descriptions :column="2" border class="stock-detail-meta">
        <el-descriptions-item label="物料编码">{{ currentDetail.materialCode }}</el-descriptions-item>
        <el-descriptions-item label="物料名称">
          <span :title="currentDetail.materialName">{{ currentDetail.materialName }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="规格">
          <span :title="currentDetail.specification">{{ currentDetail.specification }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="当前库存">{{ currentDetail.quantity }} {{ currentDetail.unitName }}</el-descriptions-item>
        <el-descriptions-item label="仓库">{{ currentDetail.locationName }}</el-descriptions-item>
        <el-descriptions-item label="类别">
          <span :title="currentDetail.categoryName">{{ currentDetail.categoryName }}</span>
        </el-descriptions-item>
      </el-descriptions>

      <el-tabs v-model="activeTab" class="mt-20">
        <!-- 批次库存标签页 -->
        <el-tab-pane label="批次库存" name="batch">
          <el-table
            :data="batchInventory"
            class="table-row-click"
            border
            v-loading="batchLoading"
            @row-click="(row, column, event) => handleTableRowView(row, column, event, () => showBatchTransactions(row.batchNumber))"
          >
            <el-table-column prop="batchNumber" label="批次号" width="200" show-overflow-tooltip>
              <template #default="{ row }">
                <el-tag type="primary" class="cursor-pointer" @click="goToTraceability(row.batchNumber, currentDetail.materialCode)" title="点击跳转至追溯页面">{{ row.batchNumber }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="currentQuantity" label="当前数量" width="88">
              <template #default="{ row }">
                <span class="text-primary font-weight-700">{{ formatQuantity(row.currentQuantity) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="unitName" label="单位" width="56" />
            <el-table-column prop="firstInDate" label="首次入库时间" width="180">
              <template #default="{ row }">
                {{ formatDateTime(row.firstInDate, 'YYYY-MM-DD HH:mm:ss') }}
              </template>
            </el-table-column>
            <el-table-column prop="lastTransactionDate" label="最后交易时间" min-width="180">
              <template #default="{ row }">
                {{ formatDateTime(row.lastTransactionDate, 'YYYY-MM-DD HH:mm:ss') }}
              </template>
            </el-table-column>

          </el-table>
        </el-tab-pane>

        <!-- 流水记录标签页 -->
        <el-tab-pane label="流水记录" name="transactions">
          <el-collapse v-model="expandedDocuments" accordion>
            <el-collapse-item
              v-for="group in filteredGroupedRecords.slice(0, recordsDisplayLimit)"
              :key="group.documentNo"
              :name="group.documentNo"
            >
              <!-- 折叠面板标题 -->
              <template #title>
                <div class="collapse-title-row">
                  <el-icon class="mr-8">
                    <Document />
                  </el-icon>
                  <div class="collapse-title-meta">
                    <span class="collapse-title-label">
                      {{ group.documentType }} {{ group.documentNo }}
                    </span>
                    <el-tag :type="getTypeTagType(group.transactionType, group.type)" size="small">
                      {{ group.type }}
                    </el-tag>
                    <span :class="group.totalQuantity > 0 ? 'qty-up' : 'qty-down'">
                      总数量: {{ group.totalQuantity > 0 ? '+' : '' }}{{ formatQuantity(group.totalQuantity) }}
                    </span>
                    <span class="text-muted text-md">
                      {{ formatDateTime(group.date, 'YYYY-MM-DD HH:mm:ss') }}
                    </span>
                    <span class="text-muted text-md">
                      操作人: {{ group.operator }}
                    </span>
                    <el-tag v-if="group.items.length > 1" type="info" size="small">
                      {{ group.items.length }}个批次
                    </el-tag>
                  </div>
                </div>
              </template>

              <!-- 折叠面板内容 - 批次明细 -->
              <div class="collapse-panel-body">
                <el-table :data="group.items" border size="small" class="mt-10">
                  <el-table-column prop="batchNumber" label="批次号" width="150" show-overflow-tooltip>
                    <template #default="{ row }">
                      <el-tag v-if="row.batchNumber" type="primary" size="small" class="cursor-pointer" @click="goToTraceability(row.batchNumber, currentDetail.materialCode)" title="点击跳转至追溯页面">{{ row.batchNumber }}</el-tag>
                      <span v-else class="text-muted">-</span>
                    </template>
                  </el-table-column>
                  <el-table-column prop="quantity" label="数量" width="80">
                    <template #default="{ row }">
                      <span class="qty-delta" :class="row.quantity > 0 ? 'text-success' : 'text-danger'">
                        {{ row.quantity > 0 ? '+' : '' }}{{ formatQuantity(row.quantity) }}
                      </span>
                    </template>
                  </el-table-column>
                  <el-table-column prop="beforeQuantity" label="变动前" width="80">
                    <template #default="{ row }">
                      {{ formatQuantity(row.beforeQuantity) }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="afterQuantity" label="变动后" width="80">
                    <template #default="{ row }">
                      {{ formatQuantity(row.afterQuantity) }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="remark" label="备注" min-width="200">
                    <template #default="{ row }">
                      <span class="text-regular">{{ row.remark || '-' }}</span>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </el-collapse-item>
          </el-collapse>
          <EmptyState v-if="filteredGroupedRecords && filteredGroupedRecords.length === 0" :description="currentBatchFilter ? '该批次暂无流水记录' : '暂无流水记录'" />
          <!-- F6: 批次过滤提示 -->
          <div v-if="currentBatchFilter" class="mt-10 text-center">
            <el-tag type="info" closable @close="currentBatchFilter = ''">当前筛选批次: {{ currentBatchFilter }}</el-tag>
          </div>
          <!-- F7: 加载更多 -->
          <div v-if="groupedRecords.length > recordsDisplayLimit" class="mt-10 text-center">
            <el-button @click="recordsDisplayLimit += 20" type="primary" link>加载更多 (已显示 {{ Math.min(recordsDisplayLimit, filteredGroupedRecords.length) }}/{{ filteredGroupedRecords.length }})</el-button>
          </div>
        </el-tab-pane>

        <!-- 采购历史标签页 -->
        <el-tab-pane label="采购历史" name="purchase" v-if="authStore.hasPermission('purchase:receipts:view')">
          <el-table :data="purchaseHistory" border v-loading="purchaseLoading">
            <el-table-column prop="receiptNo" label="入库单号" width="120" />
            <el-table-column prop="supplierName" label="供应商" width="230" />
            <el-table-column prop="quantity" label="数量" width="100">
              <template #default="{ row }">
                {{ formatQuantity(row.quantity) }}
              </template>
            </el-table-column>
            <el-table-column prop="unitPrice" label="单价" width="100">
              <template #default="{ row }">
                {{ formatMaskedPrice(row.unitPrice, canViewPrice, formatCurrency) }}
              </template>
            </el-table-column>
            <el-table-column prop="totalAmount" label="总金额" width="120">
              <template #default="{ row }">
                {{ formatMaskedPrice(row.totalAmount, canViewPrice, formatCurrency) }}
              </template>
            </el-table-column>
            <el-table-column prop="receiptDate" label="入库日期" width="110">
              <template #default="{ row }">
                {{ formatDateTime(row.receiptDate, 'YYYY-MM-DD') }}
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'completed' ? 'success' : 'info'">
                  {{ row.status === 'completed' ? '已完成' : row.status }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>

          <!-- F5: 采购历史分页 -->
          <div class="pagination-container" v-if="purchasePagination.total > 0">
            <el-pagination
              v-model:current-page="purchasePagination.currentPage"
              v-model:page-size="purchasePagination.pageSize"
              :page-sizes="[10, 20, 50]"
              :background="true"
              layout="total, sizes, prev, pager, next"
              :total="purchasePagination.total"
              @size-change="() => { purchasePagination.currentPage = 1; loadPurchaseHistory(currentDetail.materialId) }"
              @current-change="() => loadPurchaseHistory(currentDetail.materialId)"
            />
          </div>
        </el-tab-pane>

        <!-- 销售历史标签页 -->
        <el-tab-pane label="销售历史" name="sales" v-if="authStore.hasPermission('sales:outbound:view')">
          <el-table :data="salesHistory" border v-loading="salesLoading">
            <el-table-column prop="outboundNo" label="出库单号" width="130" />
            <el-table-column prop="customerName" label="客户" width="240" />
            <el-table-column prop="quantity" label="数量" width="77">
              <template #default="{ row }">
                {{ formatQuantity(row.quantity) }}
              </template>
            </el-table-column>
            <el-table-column prop="unitPrice" label="单价" width="90">
              <template #default="{ row }">
                {{ formatMaskedPrice(row.unitPrice, canViewPrice, formatCurrency) }}
              </template>
            </el-table-column>
            <el-table-column prop="totalAmount" label="总金额" width="110">
              <template #default="{ row }">
                {{ formatMaskedPrice(row.totalAmount, canViewPrice, formatCurrency) }}
              </template>
            </el-table-column>
            <el-table-column prop="outboundDate" label="出库日期" width="120">
              <template #default="{ row }">
                {{ formatDateTime(row.outboundDate, 'YYYY-MM-DD') }}
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'completed' ? 'success' : 'info'">
                  {{ row.status === 'completed' ? '已完成' : row.status }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>

          <!-- F5: 销售历史分页 -->
          <div class="pagination-container" v-if="salesPagination.total > 0">
            <el-pagination
              v-model:current-page="salesPagination.currentPage"
              v-model:page-size="salesPagination.pageSize"
              :page-sizes="[10, 20, 50]"
              :background="true"
              layout="total, sizes, prev, pager, next"
              :total="salesPagination.total"
              @size-change="() => { salesPagination.currentPage = 1; loadSalesHistory(currentDetail.materialId) }"
              @current-change="() => loadSalesHistory(currentDetail.materialId)"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
      </div>
    </AppDialog>

    <!-- 库存调整对话框 -->
    <InventoryStockAdd v-model="stockAddDialogVisible" @success="handleStockAddSuccess" />

    <!-- 浮动批量操作栏 -->
    <Transition name="slide-up">
      <div v-if="selectedRows.length > 0" class="floating-batch-bar">
        <div class="batch-info">
          <el-icon><Select /></el-icon>
          <span>已选中 <strong>{{ selectedRows.length }}</strong> 项</span>
        </div>
        <div class="batch-buttons">
          <el-button
            type="warning"
            @click="handleBatchExport"
            :loading="batchLoading"
          >
            <el-icon><Download /></el-icon> 批量导出
          </el-button>
          <el-button
            type="primary"
            @click="handleBatchPrint"
            :loading="batchLoading"
          >
            <el-icon><Printer /></el-icon> 批量打印
          </el-button>
          <el-button
            @click="handleClearSelection"
          >
            <el-icon><Close /></el-icon> 清空选择
          </el-button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { parseListData, parseResponseData } from '@/utils/responseParser';
import { ref, onMounted, reactive, computed } from 'vue'
import { Download, Plus, ArrowDown, Document, Close, Printer, Select, ShoppingCart } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { inventoryApi, baseDataApi } from '@/api'
import InventoryStockAdd from './InventoryStockAdd.vue'
import { useAuthStore } from '@/stores/auth'
import { getDocumentType as getDocTypeHelper } from '@/constants/documentTypes'
import { formatDateTime } from '@/utils/helpers/dateUtils'
import { formatCurrency, formatLocalDate } from '@/utils/format'
import { canViewMaterialPrices, formatMaskedPrice } from '@/utils/priceVisibility'
import { useRouter } from 'vue-router'
import { getInventoryTransactionTypeText, getInventoryTransactionTypeColor } from '@/constants/systemConstants'
import { debounce } from '@/utils/commonHelpers'
import printService from '@/services/printService'
import { useListDetailNavigation } from '@/composables/useListDetailNavigation'

// 权限store
const authStore = useAuthStore()
const canViewPrice = computed(() => canViewMaterialPrices((code) => authStore.hasPermission(code)))
const router = useRouter()

// 权限计算属性
const canEdit = computed(() => authStore.hasPermission && authStore.hasPermission('inventory:stock:edit'));


// 数据定义
const searchQuery = ref('')
const locationFilter = ref('')
const categoryFilter = ref('')
const stockStatusFilter = ref('') // 库存状态筛选
const showAdvancedFilter = ref(false) // 显示高级筛选
const minQuantity = ref('') // 最小库存数量
const maxQuantity = ref('') // 最大库存数量
const dateRange = ref([]) // 更新时间范围
const sortField = ref('updated_at') // 排序字段
const sortOrder = ref('DESC') // 排序方向
const locations = ref([])
const categories = ref([])
const tableData = ref([])
const {
  previousItem: previousViewStock,
  nextItem: nextViewStock,
  hasPrevious: hasPreviousViewStock,
  hasNext: hasNextViewStock,
  setCurrentItem: setCurrentViewStock
} = useListDetailNavigation(tableData, {
  getItemKey: (item) => `${item?.materialId}:${item?.locationId}`
})
const loading = ref(false)
const tableRef = ref(null) // 表格引用
const selectedRows = ref([]) // 选中的行
const batchLoading = ref(false) // 批量操作加载状态

// 统计数据
const statistics = reactive({
  totalItems: 0,
  totalLocations: 0,
  lowStock: 0,
  outOfStock: 0
})

// 明细相关
const detailDialogVisible = ref(false)
const detailLoading = ref(false)
const currentDetail = ref({})
const detailRecords = ref([])
const stockAddDialogVisible = ref(false)

// 批次库存相关
const activeTab = ref('batch') // 默认显示批次库存标签页
const batchInventory = ref([])
const expandedDocuments = ref([]) // 展开的单据列表

// 采购历史和销售历史
const purchaseHistory = ref([])
const salesHistory = ref([])
const purchaseLoading = ref(false)
const salesLoading = ref(false)
// F5: 采购/销售历史分页
const purchasePagination = reactive({ currentPage: 1, pageSize: 10, total: 0 })
const salesPagination = reactive({ currentPage: 1, pageSize: 10, total: 0 })
// F6: 批次过滤
const currentBatchFilter = ref('')
// F7: 流水显示数量限制
const recordsDisplayLimit = ref(20)

// 分组后的流水记录（按单据号分组）
const groupedRecords = computed(() => {
  if (!detailRecords.value || detailRecords.value.length === 0) {
    return []
  }

  // 按单据号分组
  const groups = {}
  detailRecords.value.forEach(record => {
    const docNo = record.referenceNo || '未知单据'
    if (!groups[docNo]) {
      groups[docNo] = {
        documentNo: docNo,
        documentType: getDocumentType(record.transactionType, docNo),
        transactionType: record.transactionType,
        type: record.type || getTypeText(record.transactionType),
        date: record.date,
        operator: record.operator || '—',
        totalQuantity: 0,
        items: []
      }
    }
    groups[docNo].totalQuantity += parseFloat(record.quantity || 0)
    groups[docNo].items.push(record)
  })

  // 转换为数组并按日期倒序排序
  return Object.values(groups).sort((a, b) => {
    return new Date(b.date) - new Date(a.date)
  })
})

// F6: 按批次过滤后的流水记录
const filteredGroupedRecords = computed(() => {
  if (!currentBatchFilter.value) return groupedRecords.value
  return groupedRecords.value.filter(group =>
    group.items.some(item => item.batchNumber === currentBatchFilter.value)
  )
})

// 根据交易类型和单据号获取单据类型名称（使用常量）
const getDocumentType = (transactionType, documentNo) => {
  return getDocTypeHelper(transactionType, documentNo)
}

// 添加响应式分页对象
const pagination = reactive({
  currentPage: 1,
  pageSize: 10,
  total: 0
})

const normalizeQuantityFilter = (value) => String(value ?? '').trim()

// 获取数据
const fetchData = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.currentPage,
      limit: pagination.pageSize,
      search: searchQuery.value,
      locationId: locationFilter.value,
      categoryId: categoryFilter.value,
      stockStatus: stockStatusFilter.value,
      minQuantity: normalizeQuantityFilter(minQuantity.value),
      maxQuantity: normalizeQuantityFilter(maxQuantity.value),
      startDate: dateRange.value && dateRange.value[0] ? dateRange.value[0] : '',
      endDate: dateRange.value && dateRange.value[1] ? dateRange.value[1] : '',
      sortField: sortField.value,
      sortOrder: sortOrder.value,
      showAll: true
    }

    const response = await inventoryApi.getStocks(params)
    // 后端使用 ResponseHandler.paginated 格式返回，数据在 data.data.list 中
    const responseData = parseResponseData(response, {})
    tableData.value = responseData.list || responseData.items || []
    pagination.total = Number(responseData.total) || 0

    // 更新统计数据
    updateStatistics()
  } catch (error) {
    console.error('获取库存数据失败:', error)
    const errorMessage = error.response?.data?.message || '获取库存数据失败'
    ElMessage.error(errorMessage)
    tableData.value = []
    pagination.total = 0
  } finally {
    loading.value = false
  }
}

// 更新统计数据
const updateStatistics = async () => {
  try {
    const { data } = await inventoryApi.getStockStatistics()
    Object.assign(statistics, {
      totalItems: data.totalItems || 0,
      totalLocations: data.totalLocations || 0,
      lowStock: data.lowStock || 0,
      outOfStock: data.outOfStock || 0
    })
  } catch (error) {
    console.error('获取统计数据失败', error)
    Object.assign(statistics, {
      totalItems: 0,
      totalLocations: 0,
      lowStock: 0,
      outOfStock: 0
    })
  }
}


// 获取基础数据
const fetchBaseData = async () => {
  try {
    const [locationsRes, categoriesRes] = await Promise.all([
      inventoryApi.getLocations({ limit: 50 }),
      baseDataApi.getCategories({ limit: 50 })
    ])

    // 使用统一解析器处理数据
    locations.value = parseListData(locationsRes, { enableLog: false })
    const categoryData = parseListData(categoriesRes, { enableLog: false })

    // 扁平化树形结构的分类数据（如果有children）
    const flattenCategories = (categories) => {
      const result = []
      const flatten = (items) => {
        items.forEach(item => {
          result.push({
            id: item.id,
            name: item.name,
            code: item.code,
            level: item.level,
            parent_id: item.parentId
          })
          if (item.children && item.children.length > 0) {
            flatten(item.children)
          }
        })
      }
      flatten(categories)
      return result
    }

    categories.value = flattenCategories(categoryData)

  } catch (error) {
    console.error('获取基础数据失败:', error)
    ElMessage.error('获取基础数据失败，部分功能可能受限')
    // 设置空数组避免组件报错
    locations.value = []
    categories.value = []
  }
}

// 搜索处理(自动搜索)
const handleSearchInput = debounce(() => {
  pagination.currentPage = 1 // 重置到第一页
  fetchData()
}, 500)

// 搜索按钮点击
const handleSearch = () => {
  pagination.currentPage = 1
  fetchData()
}

// 重置搜索条件
const handleReset = () => {
  searchQuery.value = ''
  handleResetAdvanced()
  fetchData()
}

// 重置高级筛选
const handleResetAdvanced = () => {
  locationFilter.value = ''
  categoryFilter.value = ''
  stockStatusFilter.value = ''
  minQuantity.value = ''
  maxQuantity.value = ''
  dateRange.value = []
}

// 排序变化处理
const handleSortChange = ({ prop, order }) => {
  if (!order) {
    sortField.value = 'updated_at'
    sortOrder.value = 'DESC'
  } else {
    sortField.value = prop
    sortOrder.value = order === 'ascending' ? 'ASC' : 'DESC'
  }
  fetchData()
}

// 选择变化处理
const handleSelectionChange = (selection) => {
  selectedRows.value = selection
}

// 清空选择
const handleClearSelection = () => {
  tableRef.value.clearSelection()
}

// 批量导出
const handleBatchExport = async () => {
  if (selectedRows.value.length === 0) {
    ElMessage.warning('请先选择要导出的记录')
    return
  }

  try {
    batchLoading.value = true
    const materialIds = selectedRows.value.map(row => row.materialId)

    ElMessage.info(`正在导出${materialIds.length}条记录，请稍候...`)

    const response = await inventoryApi.exportStock({
      material_ids: materialIds,
      includeDetails: true
    })

    const blob = response.data
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `批量库存明细_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)

    ElMessage.success(`成功导出${materialIds.length}条记录`)
  } catch (error) {
    console.error('批量导出失败:', error)
    const errorMessage = error.response?.data?.message || '批量导出生成底层 Excel 时出错'
    ElMessage.error(errorMessage)
  } finally {
    batchLoading.value = false
  }
}

// 批量打印 - 使用打印中心默认模板
const handleBatchPrint = async () => {
  if (selectedRows.value.length === 0) {
    ElMessage.warning('请先选择要打印的记录')
    return
  }

  try {
    batchLoading.value = true

    const printData = {
      stock_no: `STOCK-${formatLocalDate(new Date()).replace(/-/g, '')}`,
      stock_date: new Date().toLocaleDateString(),
      location_name: locationFilter.value || '全部仓库',
      filter_summary: searchQuery.value || categoryFilter.value || stockStatusFilter.value || '当前选择库存',
      print_time: new Date().toLocaleString(),
      total_count: selectedRows.value.length.toString(),
      items: selectedRows.value.map((row, index) => ({
        index: index + 1,
        material_code: row.materialCode || '',
        material_name: row.materialName || '',
        specification: row.specification || row.specs || row.model || '',
        quantity: formatQuantity(row.quantity),
        available_quantity: formatQuantity(row.availableQuantity ?? row.quantity),
        unit_name: row.unitName || row.unit || '',
        location_name: row.locationName || ''
      }))
    }

    const html = await printService.generateByDefaultTemplate('inventory', 'inventory_stock', printData)
    printService.previewDocument(html)
    ElMessage.success(`已准备打印${selectedRows.value.length}条记录`)
  } catch (error) {
    console.error('批量打印失败:', error)
    ElMessage.error('批量打印失败')
  } finally {
    batchLoading.value = false
  }
}

// 快速申购
const handleQuickPurchase = (row) => {
  // 跳转到采购申请页面,并预填物料信息
  router.push({
    path: '/purchase/requisitions',
    query: {
      source: 'quick_purchase',
      material_id: row.materialId,
      material_code: row.materialCode,
      material_name: row.materialName,
      current_stock: row.quantity,
      min_stock: row.minStock,
      unit: row.unit
    }
  })
}

// 查看明细
const handleViewDetail = async (row) => {
  const materialId = row.materialId
  const locationId = row.locationId
  currentDetail.value = {
    ...row,
    materialId,
    locationId,
    materialCode: row.materialCode,
    materialName: row.materialName,
    unitName: row.unitName,
    locationName: row.locationName,
    categoryName: row.categoryName,
  }
  detailRecords.value = [] // 先清空旧数据
  batchInventory.value = [] // 清空批次库存数据
  purchaseHistory.value = [] // 清空采购历史
  salesHistory.value = [] // 清空销售历史
  activeTab.value = 'batch' // 默认显示批次库存标签页
  setCurrentViewStock(row)

  detailDialogVisible.value = true
  detailLoading.value = true

  try {
    if (!materialId) {
      throw new Error('库存行缺少物料ID，请刷新列表后重试')
    }

    // 并行获取流水记录、批次库存、采购历史、销售历史
    const tasks = [
      inventoryApi.getMaterialRecords(materialId, { locationId }),
      loadBatchInventory(locationId)
    ]
    if (authStore.hasPermission('purchase:receipts:view')) {
      tasks.push(loadPurchaseHistory(materialId))
    }
    if (authStore.hasPermission('sales:outbound:view')) {
      tasks.push(loadSalesHistory(materialId))
    }
    const [recordsResponse] = await Promise.all(tasks)

    // 解析流水记录
    detailRecords.value = parseListData(recordsResponse, { enableLog: false })
  } catch (error) {
    console.error('获取明细失败:', error)
    ElMessage.error(`获取明细失败: ${error.response?.data?.message || error.message || '未知错误'}`)
    detailRecords.value = []
    batchInventory.value = []
    purchaseHistory.value = []
    salesHistory.value = []
  } finally {
    detailLoading.value = false
  }
}

const handleViewPrevious = () => {
  if (previousViewStock.value) handleViewDetail(previousViewStock.value)
}

const handleViewNext = () => {
  if (nextViewStock.value) handleViewDetail(nextViewStock.value)
}

const stockViewNavigation = computed(() => ({
  hasPrevious: hasPreviousViewStock.value,
  hasNext: hasNextViewStock.value,
  loading: detailLoading.value,
  previous: handleViewPrevious,
  next: handleViewNext
}))

// 加载采购历史
const loadPurchaseHistory = async (materialId) => {
  if (!authStore.hasPermission('purchase:receipts:view')) {
    purchaseHistory.value = []
    purchasePagination.total = 0
    return
  }
  try {
    purchaseLoading.value = true

    // 调用后端API获取采购历史
    const response = await inventoryApi.getPurchaseHistory(materialId, {
      page: purchasePagination.currentPage,
      pageSize: purchasePagination.pageSize,
      sortField: 'receiptDate',
      sortOrder: 'DESC'
    })

    const responseData = parseResponseData(response, {})
    purchaseHistory.value = responseData.list || responseData.items || parseListData(response, { enableLog: false })
    purchasePagination.total = Number(responseData.total) || purchaseHistory.value.length
  } catch (error) {
    console.error('获取采购历史失败:', error)
    if (error.response?.status === 404) {
    }
    purchaseHistory.value = []
    purchasePagination.total = 0
  } finally {
    purchaseLoading.value = false
  }
}

// 加载销售历史
const loadSalesHistory = async (materialId) => {
  if (!authStore.hasPermission('sales:outbound:view')) {
    salesHistory.value = []
    salesPagination.total = 0
    return
  }
  try {
    salesLoading.value = true

    // 调用后端API获取销售历史
    const response = await inventoryApi.getSalesHistory(materialId, {
      page: salesPagination.currentPage,
      pageSize: salesPagination.pageSize,
      sortField: 'outboundDate',
      sortOrder: 'DESC'
    })

    const responseData = parseResponseData(response, {})
    salesHistory.value = responseData.list || responseData.items || parseListData(response, { enableLog: false })
    salesPagination.total = Number(responseData.total) || salesHistory.value.length
  } catch (error) {
    console.error('获取销售历史失败:', error)
    if (error.response?.status === 404) {
    }
    salesHistory.value = []
    salesPagination.total = 0
  } finally {
    salesLoading.value = false
  }
}

// 加载批次库存
const loadBatchInventory = async (locationId) => {
  try {
    const response = await inventoryApi.getBatchInventory({
      materialId: currentDetail.value.materialId,
      locationId: locationId
    })
    batchInventory.value = parseListData(response, { enableLog: false })
  } catch (error) {
    console.error('获取批次库存失败:', error)
    ElMessage.error('获取批次库存失败')
    batchInventory.value = []
  }
}

// 查看批次流水
const showBatchTransactions = (batchNumber) => {
  // F6: 设置批次过滤条件并切换到流水记录标签页
  currentBatchFilter.value = batchNumber
  activeTab.value = 'transactions'
  recordsDisplayLimit.value = 20 // 重置显示数量
}

// 跳转到批次追溯
const goToTraceability = (batchNumber, materialCode) => {
  if (!batchNumber || batchNumber === '-') return
  detailDialogVisible.value = false
  router.push({
    path: '/quality/traceability',
    query: {
      materialCode: materialCode,
      batchNumber: batchNumber
    }
  })
}

// 导出命令处理
const handleExportCommand = (command) => {
  if (tableData.value.length === 0) {
    ElMessage.warning('暂无数据可导出')
    return
  }

  const includeDetails = command === 'detail'
  const exportType = includeDetails ? '库存汇总+明细' : '库存汇总'

  handleExport(includeDetails, exportType)
}

// 导出
const handleExport = async (includeDetails = false, exportType = '库存汇总') => {
  try {
    ElMessage.info(`正在导出${exportType}，请稍候...`)

    // 调用后端极速导出，彻底避免 N+1 限制
    const response = await inventoryApi.exportStock({
      search: searchQuery.value,
      location_id: locationFilter.value,
      category_id: categoryFilter.value,
      stock_status: stockStatusFilter.value,
      min_quantity: normalizeQuantityFilter(minQuantity.value),
      max_quantity: normalizeQuantityFilter(maxQuantity.value),
      start_date: dateRange.value && dateRange.value[0] ? dateRange.value[0] : '',
      end_date: dateRange.value && dateRange.value[1] ? dateRange.value[1] : '',
      includeDetails: includeDetails
    })

    const blob = response.data
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${exportType}_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
    ElMessage.success('报表下载成功')
  } catch (error) {
    console.error('全量库导表获取失败:', error)
    const errorMessage = error.response?.data?.message || '获取库存全量数据失败'
    ElMessage.error(errorMessage)
  }
}

// 分页处理
const handleSizeChange = () => {
  pagination.currentPage = 1 // 重置到第一页
  fetchData()
}

const handleCurrentChange = () => {
  fetchData()
}

// 库存调整成功后的处理
const handleStockAddSuccess = () => {
  ElMessage.success('库存调整成功')
  fetchData()
}

// 生命周期
onMounted(() => {
  fetchBaseData()
  fetchData()
})

// 获取类型显示文本
const getTypeText = (type) => {
  return getInventoryTransactionTypeText(type) || type;
}

// 获取类型标签颜色（使用统一常量）
// 对于自定义业务类型，根据代码或中文名称判断颜色
const getTypeTagType = (transactionType, typeName) => {
  // 先尝试从常量映射获取
  const color = getInventoryTransactionTypeColor(transactionType);
  if (color && color !== 'info') {
    return color;
  }

  // 对于未知类型，根据类型代码或中文名称判断
  // 入库类型使用绿色，出库类型使用红色
  const codeStr = String(transactionType || '').toLowerCase();
  const nameStr = String(typeName || '');

  // 检查是否为入库类型
  if (codeStr.includes('_in') || codeStr.includes('inbound') ||
      nameStr.includes('入库') || nameStr.includes('退料') || nameStr.includes('退货')) {
    return 'success';
  }

  // 检查是否为出库类型
  if (codeStr.includes('_out') || codeStr.includes('outbound') ||
      nameStr.includes('出库') || nameStr.includes('发料') || nameStr.includes('领料')) {
    return 'danger';
  }

  return 'info';
}

// 格式化数量显示
const formatQuantity = (quantity) => {
  if (quantity === null || quantity === undefined) return '0'
  const num = parseFloat(quantity)
  return isNaN(num) ? '0' : num.toString()
}

// 判断是否低库存
const isLowStock = (row) => {
  // 隔离区、不良品等专属区域不需要“安全库存预警”与“快速申购”
  const locName = String(row.locationName || '');
  if (locName.includes('隔离') || locName.includes('不良') || locName.includes('报废') || row.type === 'isolation' || row.type === 'defective') {
    return false;
  }

  const quantity = parseFloat(row.quantity || 0)
  const minStock = parseFloat(row.minStock || 0)
  return minStock > 0 && quantity > 0 && quantity <= minStock
}

// 判断是否缺货
const isOutOfStock = (row) => {
  const quantity = parseFloat(row.quantity || 0)
  return quantity === 0
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

/* 如需特殊样式，在此覆盖 */

/* 库存状态样式 */
.low-stock {
  color: var(--color-warning);
  font-weight: bold;
}

.out-of-stock {
  color: var(--color-danger);
  font-weight: bold;
}

/* 表格优化 */
.el-table .cell {
  padding: 0 8px;
}

/* 搜索表单优化 */
.search-form .el-form-item {
  margin-bottom: 10px;
}

.stock-detail-dialog {
  width: 760px;
  max-width: 100%;
}

.stock-detail-meta :deep(.el-descriptions__body),
.stock-detail-meta :deep(.el-descriptions__table) {
  width: 100% !important;
}

.stock-detail-meta :deep(.el-descriptions__table) {
  table-layout: fixed;
}

.stock-detail-meta :deep(.el-descriptions__label) {
  width: 88px;
}

.stock-detail-meta :deep(.el-descriptions__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 对话框头部 */
/* 操作按钮 */
.operation-btns {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* ====== 金额统计区域 ====== */
.amount-statistics-section {
  display: grid;
  grid-template-columns: 280px 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}

@media (max-width: 1200px) {
  .amount-statistics-section {
    grid-template-columns: 1fr 1fr;
  }
  .amount-total-card {
    grid-column: 1 / -1;
  }
}

@media (max-width: 768px) {
  .amount-statistics-section {
    grid-template-columns: 1fr;
  }
}

/* 总金额卡片 */
.amount-total-card {
  background: linear-gradient(
    135deg,
    var(--el-color-warning-light-9) 0%,
    var(--el-color-warning-light-8) 100%
  );
  border: 1px solid var(--el-color-warning-light-5);
  border-radius: 10px;
}

.amount-total-content {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 0;
}

.amount-icon-wrapper {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--color-warning) 12%, transparent);
  border-radius: 14px;
  flex-shrink: 0;
}

.amount-info {
  flex: 1;
}

.amount-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.amount-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-warning);
  line-height: 1.2;
  letter-spacing: -0.5px;
}

/* 明细卡片通用 */
.amount-detail-card {
  border-radius: 10px;
}

.amount-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.amount-detail-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* 分类金额列表 */
.category-value-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.category-value-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.category-value-label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 140px;
  flex-shrink: 0;
}

.category-rank {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-bg-base);
  background: var(--color-primary);
  flex-shrink: 0;
}

.category-value-item:nth-child(1) .category-rank { background: var(--color-warning); }
.category-value-item:nth-child(2) .category-rank { background: var(--color-text-secondary); }
.category-value-item:nth-child(3) .category-rank { background: var(--el-color-warning-dark-2, var(--color-warning)); }

.category-name {
  font-size: 13px;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 80px;
}

.category-count {
  font-size: 11px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.category-value-bar-wrapper {
  flex: 1;
  height: 8px;
  background: var(--color-fill-light, var(--el-fill-color-light));
  border-radius: 4px;
  overflow: hidden;
  min-width: 60px;
}

.category-value-bar {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary-light-3, var(--color-primary-light-3, var(--color-primary))) 100%);
  transition: width 0.6s ease;
  min-width: 4px;
}

.category-value-amount {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  min-width: 90px;
  text-align: right;
  flex-shrink: 0;
}

/* 仓库金额列表 */
.location-value-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.location-value-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--color-fill-lighter, var(--el-fill-color-blank));
  border-radius: 6px;
  transition: background 0.2s;
}

.location-value-item:hover {
  background: var(--color-fill-light, var(--el-fill-color-light));
}

.location-value-label {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.location-name {
  font-size: 13px;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.location-count {
  font-size: 11px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.location-value-amount {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  flex-shrink: 0;
}

.location-value-percent {
  font-size: 12px;
  color: var(--color-text-secondary);
  min-width: 45px;
  text-align: right;
  flex-shrink: 0;
}

.no-data-tip {
  font-size: 13px;
  color: var(--color-text-placeholder);
  text-align: center;
  padding: 12px 0;
}
</style>
