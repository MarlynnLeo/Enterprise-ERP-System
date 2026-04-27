<!--
/**
 * InventoryStock.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="inventory-stock-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>库存明细</h2>
          <p class="subtitle">查看库存明细与变动记录</p>
        </div>
        <el-button v-if="canEdit" type="primary" :icon="Plus" @click="stockAddDialogVisible = true">{{ $t('common.adjust') }}</el-button>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" class="search-form">
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
        <el-form-item :label="$t('page.inventory.stock.location')">
          <el-select
            v-model="locationFilter"
            :placeholder="$t('page.inventory.stock.location')"
            clearable

            @change="handleSearch"
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

            @change="handleSearch"
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

            @change="handleSearch"
          >
            <el-option label="全部" value="" />
            <el-option label="正常" value="normal" />
            <el-option label="低库存" value="low" />
            <el-option label="零库存" value="zero" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch" :loading="loading">
            <el-icon v-if="!loading"><Search /></el-icon> {{ $t('common.search') }}
          </el-button>
          <el-button @click="handleReset" style="margin-left: 8px;" :loading="loading">
            <el-icon v-if="!loading"><Refresh /></el-icon> {{ $t('common.reset') }}
          </el-button>
          <el-button @click="showAdvancedFilter = !showAdvancedFilter" style="margin-left: 8px;">
            <el-icon><Filter /></el-icon> 高级筛选
          </el-button>
          <el-dropdown @command="handleExportCommand" style="margin-left: 8px;">
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
        </el-form-item>
      </el-form>

      <!-- 高级筛选区域 -->
      <el-collapse-transition>
        <div v-show="showAdvancedFilter" class="advanced-filter">
          <el-form :inline="true" class="search-form" >
            <el-form-item label="库存数量">
              <el-input-number
                v-model="minQuantity"
                :min="0"
                :precision="2"
                placeholder="最小值"

                controls-position="right"
              />
              <span style="margin: 0 8px;">-</span>
              <el-input-number
                v-model="maxQuantity"
                :min="0"
                :precision="2"
                placeholder="最大值"

                controls-position="right"
              />
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
            <el-form-item>
              <el-button type="primary" @click="handleSearch">应用筛选</el-button>
              <el-button @click="handleResetAdvanced">清空</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-collapse-transition>
    </el-card>

    
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
        style="width: 100%"
        v-loading="loading"
        @selection-change="handleSelectionChange"
        @sort-change="handleSortChange"
      >
        <template #empty>
          <el-empty description="暂无库存数据" />
        </template>
        <el-table-column type="selection" width="55" />
        <el-table-column
          prop="material_code"
          label="物料编码"
          width="140"
          sortable="custom"
        />
        <el-table-column
          prop="material_name"
          label="物料名称"
          min-width="250"
          sortable="custom"
        />
        <el-table-column prop="specification" label="规格" width="340" />
        <el-table-column
          prop="location_name"
          label="仓库"
          width="130"
          sortable="custom"
        />
        <el-table-column
          prop="category_name"
          label="类别"
          width="110"
          sortable="custom"
        />
        <el-table-column
          label="库存数量"
          width="110"
          align="right"
          sortable="custom"
          prop="quantity"
        >
          <template #default="scope">
            <span :class="{ 'low-stock': isLowStock(scope.row), 'out-of-stock': isOutOfStock(scope.row) }">
              {{ formatQuantity(scope.row.quantity) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="unit_name" label="单位" width="70" />
        <el-table-column
          prop="updated_at"
          label="更新时间"
          width="150"
          sortable="custom"
        >
          <template #default="scope">
            {{ formatDateTime(scope.row.updated_at, 'YYYY-MM-DD HH:mm') }}
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="180" fixed="right">
          <template #default="scope">
            <div class="operation-btns">
              <el-button size="small" @click="handleViewDetail(scope.row)" v-permission="'inventory:stock:view-detail'">查看明细</el-button>
              <el-button
                v-if="isLowStock(scope.row)"
                size="small"
                type="warning"
                @click="handleQuickPurchase(scope.row)"
              >
                快速申购
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

    <!-- 明细对话框 -->
    <el-dialog
      v-model="detailDialogVisible"
      title="库存明细"
      :width="dialogWidth"
      :fullscreen="isFullscreen"
    >
      <template #header>
        <div class="dialog-header">
          <span>库存明细</span>
          <el-button
            :icon="isFullscreen ? 'FullScreen' : 'FullScreen'"
            circle
            size="small"
            @click="isFullscreen = !isFullscreen"
          />
        </div>
      </template>
      <div v-loading="detailLoading">
      <el-descriptions :column="3" border>
        <el-descriptions-item label="物料编码">{{ currentDetail.material_code }}</el-descriptions-item>
        <el-descriptions-item label="物料名称">{{ currentDetail.material_name }}</el-descriptions-item>
        <el-descriptions-item label="规格">{{ currentDetail.specification }}</el-descriptions-item>
        <el-descriptions-item label="当前库存">{{ currentDetail.quantity }} {{ currentDetail.unit_name }}</el-descriptions-item>
        <el-descriptions-item label="仓库">{{ currentDetail.location_name }}</el-descriptions-item>
        <el-descriptions-item label="类别">{{ currentDetail.category_name }}</el-descriptions-item>
      </el-descriptions>

      <el-tabs v-model="activeTab" style="margin-top: 20px">
        <!-- 批次库存标签页 -->
        <el-tab-pane label="批次库存" name="batch">
          <el-table :data="batchInventory" border v-loading="batchLoading">
            <el-table-column prop="batch_number" label="批次号" width="210">
              <template #default="{ row }">
                <el-tag type="primary" style="cursor: pointer;" @click="goToTraceability(row.batch_number, currentDetail.material_code)" title="点击跳转至追溯页面">{{ row.batch_number }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="current_quantity" label="当前数量" width="120" align="right">
              <template #default="{ row }">
                <span style="font-weight: bold; color: #409EFF;">{{ formatQuantity(row.current_quantity) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="unit_name" label="单位" width="80" />
            <el-table-column prop="first_in_date" label="首次入库时间" width="180">
              <template #default="{ row }">
                {{ formatDateTime(row.first_in_date, 'YYYY-MM-DD HH:mm:ss') }}
              </template>
            </el-table-column>
            <el-table-column prop="last_transaction_date" label="最后交易时间" width="180">
              <template #default="{ row }">
                {{ formatDateTime(row.last_transaction_date, 'YYYY-MM-DD HH:mm:ss') }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button size="small" type="primary" link @click="showBatchTransactions(row.batch_number)">
                  查看流水
                </el-button>
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
                <div style="display: flex; align-items: center; width: 100%; padding: 8px 0;">
                  <el-icon style="margin-right: 8px; font-size: 16px;">
                    <Document />
                  </el-icon>
                  <div style="flex: 1; display: flex; align-items: center; gap: 16px;">
                    <span style="font-weight: bold; font-size: 14px;">
                      {{ group.documentType }} {{ group.documentNo }}
                    </span>
                    <el-tag :type="getTypeTagType(group.transactionType, group.type)" size="small">
                      {{ group.type }}
                    </el-tag>
                    <span :style="{
                      color: group.totalQuantity > 0 ? '#67C23A' : '#F56C6C',
                      fontWeight: 'bold',
                      fontSize: '14px'
                    }">
                      总数量: {{ group.totalQuantity > 0 ? '+' : '' }}{{ formatQuantity(group.totalQuantity) }}
                    </span>
                    <span style="color: #909399; font-size: 13px;">
                      {{ formatDateTime(group.date, 'YYYY-MM-DD HH:mm:ss') }}
                    </span>
                    <span style="color: #909399; font-size: 13px;">
                      操作人: {{ group.operator }}
                    </span>
                    <el-tag v-if="group.items.length > 1" type="info" size="small">
                      {{ group.items.length }}个批次
                    </el-tag>
                  </div>
                </div>
              </template>

              <!-- 折叠面板内容 - 批次明细 -->
              <div style="padding: 0 20px 10px 40px;">
                <el-table :data="group.items" border size="small" style="margin-top: 10px;">
                  <el-table-column prop="batch_number" label="批次号" width="200">
                    <template #default="{ row }">
                      <el-tag v-if="row.batch_number" type="primary" size="small" style="cursor: pointer;" @click="goToTraceability(row.batch_number, currentDetail.material_code)" title="点击跳转至追溯页面">{{ row.batch_number }}</el-tag>
                      <span v-else style="color: #999;">-</span>
                    </template>
                  </el-table-column>
                  <el-table-column prop="quantity" label="数量" width="80" align="right">
                    <template #default="{ row }">
                      <span :style="{
                        color: row.quantity > 0 ? '#67C23A' : '#F56C6C',
                        fontWeight: 'bold'
                      }">
                        {{ row.quantity > 0 ? '+' : '' }}{{ formatQuantity(row.quantity) }}
                      </span>
                    </template>
                  </el-table-column>
                  <el-table-column prop="before_quantity" label="变动前" width="80" align="right">
                    <template #default="{ row }">
                      {{ formatQuantity(row.before_quantity) }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="after_quantity" label="变动后" width="80" align="right">
                    <template #default="{ row }">
                      {{ formatQuantity(row.after_quantity) }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="remark" label="备注" min-width="200">
                    <template #default="{ row }">
                      <span style="color: #606266;">{{ row.remark || '-' }}</span>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </el-collapse-item>
          </el-collapse>
          <el-empty v-if="filteredGroupedRecords && filteredGroupedRecords.length === 0" :description="currentBatchFilter ? '该批次暂无流水记录' : '暂无流水记录'" />
          <!-- F6: 批次过滤提示 -->
          <div v-if="currentBatchFilter" style="margin-top: 10px; text-align: center;">
            <el-tag type="info" closable @close="currentBatchFilter = ''">当前筛选批次: {{ currentBatchFilter }}</el-tag>
          </div>
          <!-- F7: 加载更多 -->
          <div v-if="groupedRecords.length > recordsDisplayLimit" style="text-align: center; margin-top: 10px;">
            <el-button @click="recordsDisplayLimit += 20" type="primary" link>加载更多 (已显示 {{ Math.min(recordsDisplayLimit, filteredGroupedRecords.length) }}/{{ filteredGroupedRecords.length }})</el-button>
          </div>
        </el-tab-pane>

        <!-- 采购历史标签页 -->
        <el-tab-pane label="采购历史" name="purchase">
          <el-table :data="purchaseHistory" border v-loading="purchaseLoading">
            <el-table-column prop="receipt_no" label="入库单号" width="120" />
            <el-table-column prop="supplier_name" label="供应商" width="230" />
            <el-table-column prop="quantity" label="数量" width="100" align="right">
              <template #default="{ row }">
                {{ formatQuantity(row.quantity) }}
              </template>
            </el-table-column>
            <el-table-column prop="unit_price" label="单价" width="100" align="right">
              <template #default="{ row }">
                ¥{{ Number(row.unit_price || 0).toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column prop="total_amount" label="总金额" width="120" align="right">
              <template #default="{ row }">
                ¥{{ Number(row.total_amount || 0).toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column prop="receipt_date" label="入库日期" width="110">
              <template #default="{ row }">
                {{ formatDateTime(row.receipt_date, 'YYYY-MM-DD') }}
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
              @size-change="() => { purchasePagination.currentPage = 1; loadPurchaseHistory(currentDetail.material_id) }"
              @current-change="() => loadPurchaseHistory(currentDetail.material_id)"
            />
          </div>
        </el-tab-pane>

        <!-- 销售历史标签页 -->
        <el-tab-pane label="销售历史" name="sales">
          <el-table :data="salesHistory" border v-loading="salesLoading">
            <el-table-column prop="outbound_no" label="出库单号" width="130" />
            <el-table-column prop="customer_name" label="客户" width="240" />
            <el-table-column prop="quantity" label="数量" width="77" align="right">
              <template #default="{ row }">
                {{ formatQuantity(row.quantity) }}
              </template>
            </el-table-column>
            <el-table-column prop="unit_price" label="单价" width="90" align="right">
              <template #default="{ row }">
                ¥{{ Number(row.unit_price || 0).toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column prop="total_amount" label="总金额" width="110" align="right">
              <template #default="{ row }">
                ¥{{ Number(row.total_amount || 0).toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column prop="outbound_date" label="出库日期" width="120">
              <template #default="{ row }">
                {{ formatDateTime(row.outbound_date, 'YYYY-MM-DD') }}
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
              @size-change="() => { salesPagination.currentPage = 1; loadSalesHistory(currentDetail.material_id) }"
              @current-change="() => loadSalesHistory(currentDetail.material_id)"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
      </div>
    </el-dialog>

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
import { parseListData } from '@/utils/responseParser';
import { ref, onMounted, reactive, computed } from 'vue'
import { Search, Download, Plus, Refresh, ArrowDown, Document, Filter, Close, Printer, Select } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { inventoryApi, baseDataApi } from '@/services/api'
import InventoryStockAdd from './InventoryStockAdd.vue'
import { useAuthStore } from '@/stores/auth'
import { getDocumentType as getDocTypeHelper } from '@/constants/documentTypes'
import { formatDateTime } from '@/utils/helpers/dateUtils'
import { useRouter } from 'vue-router'
import { getInventoryTransactionTypeText, getInventoryTransactionTypeColor } from '@/constants/systemConstants'
import { debounce } from '@/utils/commonHelpers'

// 权限store
const authStore = useAuthStore()
const router = useRouter()

// 权限计算属性
const canEdit = computed(() => authStore.hasPermission && authStore.hasPermission('inventory:stock:edit'));



// 数据定义
const searchQuery = ref('')
const locationFilter = ref('')
const categoryFilter = ref('')
const stockStatusFilter = ref('') // 库存状态筛选
const showAdvancedFilter = ref(false) // 显示高级筛选
const minQuantity = ref(null) // 最小库存数量
const maxQuantity = ref(null) // 最大库存数量
const dateRange = ref([]) // 更新时间范围
const sortField = ref('updated_at') // 排序字段
const sortOrder = ref('DESC') // 排序方向
const locations = ref([])
const categories = ref([])
const tableData = ref([])
const loading = ref(false)
const tableRef = ref(null) // 表格引用
const selectedRows = ref([]) // 选中的行
const batchLoading = ref(false) // 批量操作加载状态

// 对话框相关
const isFullscreen = ref(false)
const dialogWidth = computed(() => {
  if (isFullscreen.value) return '100%'
  return window.innerWidth < 768 ? '95%' : '50%'
})

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
    const docNo = record.reference_no || '未知单据'
    if (!groups[docNo]) {
      groups[docNo] = {
        documentNo: docNo,
        documentType: getDocumentType(record.transaction_type, docNo),
        transactionType: record.transaction_type,
        type: record.type || getTypeText(record.transaction_type),
        date: record.date,
        operator: record.operator || 'system',
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
    group.items.some(item => item.batch_number === currentBatchFilter.value)
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

// 获取数据
const fetchData = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.currentPage,
      limit: pagination.pageSize,
      search: searchQuery.value,
      location_id: locationFilter.value,
      category_id: categoryFilter.value,
      stock_status: stockStatusFilter.value,
      min_quantity: minQuantity.value,
      max_quantity: maxQuantity.value,
      start_date: dateRange.value && dateRange.value[0] ? dateRange.value[0] : '',
      end_date: dateRange.value && dateRange.value[1] ? dateRange.value[1] : '',
      sort_field: sortField.value,
      sort_order: sortOrder.value,
      show_all: true
    }

    const response = await inventoryApi.getStocks(params)
    // 后端使用 ResponseHandler.paginated 格式返回，数据在 data.data.list 中
    const responseData = response.data?.data || response.data || {}
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
      inventoryApi.getLocations({ limit: 1000 }),
      baseDataApi.getCategories({ limit: 1000 })
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
            parent_id: item.parent_id
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
  locationFilter.value = ''
  categoryFilter.value = ''
  stockStatusFilter.value = ''
  handleResetAdvanced()
  fetchData()
}

// 重置高级筛选
const handleResetAdvanced = () => {
  minQuantity.value = null
  maxQuantity.value = null
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
    const materialIds = selectedRows.value.map(row => row.material_id)

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

// 批量打印 - 使用打印模板系统
const handleBatchPrint = async () => {
  if (selectedRows.value.length === 0) {
    ElMessage.warning('请先选择要打印的记录')
    return
  }

  try {
    batchLoading.value = true

    // 获取打印模板
    let templateContent = ''
    try {
      const response = await inventoryApi.get('/print/templates', {
        params: {
          template_type: 'inventory_stock',
          is_default: 1,
          status: 1
        }
      })
      
      const templates = response.data?.list || response.data?.data || response.data || []
      const template = Array.isArray(templates) ? templates[0] : null
      
      if (template && template.content) {
        templateContent = template.content
      }
    } catch (templateError) {
      console.error('获取打印模板失败:', templateError)
    }
    
    // 如果没有找到模板，提示用户配置
    if (!templateContent) {
      ElMessage.warning('未找到库存明细打印模板，请在系统管理-打印管理中配置 inventory_stock 类型模板')
      return
    }
    
    // 替换模板变量
    const currentDate = new Date().toLocaleDateString()
    const currentTime = new Date().toLocaleTimeString()
    const printData = {
      print_date: currentDate,
      print_time: currentTime,
      total_count: selectedRows.value.length.toString()
    }
    
    Object.keys(printData).forEach(key => {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g')
      templateContent = templateContent.replace(regex, printData[key])
    })
    
    // 处理明细项列表
    if (templateContent.includes('{{#each items}}')) {
      const itemStart = templateContent.indexOf('{{#each items}}')
      const itemEnd = templateContent.indexOf('{{/each}}', itemStart)
      
      if (itemStart !== -1 && itemEnd !== -1) {
        const itemTemplate = templateContent.substring(itemStart + '{{#each items}}'.length, itemEnd)
        let itemsHtml = ''
        
        selectedRows.value.forEach((row, index) => {
          let itemHtml = itemTemplate
          itemHtml = itemHtml.replace(/{{index}}/g, (index + 1).toString())
          itemHtml = itemHtml.replace(/{{material_code}}/g, row.material_code || '')
          itemHtml = itemHtml.replace(/{{material_name}}/g, row.material_name || '')
          itemHtml = itemHtml.replace(/{{category_name}}/g, row.category_name || '')
          itemHtml = itemHtml.replace(/{{location_name}}/g, row.location_name || '')
          itemHtml = itemHtml.replace(/{{quantity}}/g, formatQuantity(row.quantity))
          itemHtml = itemHtml.replace(/{{unit}}/g, row.unit || '')
          itemHtml = itemHtml.replace(/{{min_stock}}/g, (row.min_stock || 0).toString())
          itemHtml = itemHtml.replace(/{{max_stock}}/g, (row.max_stock || 0).toString())
          itemsHtml += itemHtml
        })
        
        templateContent = templateContent.substring(0, itemStart) + itemsHtml + templateContent.substring(itemEnd + '{{/each}}'.length)
      }
    }

    // 创建打印窗口
    const printWindow = window.open('', '_blank')
    printWindow.document.write(templateContent)
    printWindow.document.close()

    // 等待内容加载后打印
    printWindow.onload = () => {
      printWindow.print()
      printWindow.close()
    }

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
    path: '/purchase/requisition/create',
    query: {
      material_id: row.material_id,
      material_code: row.material_code,
      material_name: row.material_name,
      current_stock: row.quantity,
      min_stock: row.min_stock,
      unit: row.unit
    }
  })
}

// 查看明细
const handleViewDetail = async (row) => {
  currentDetail.value = row
  detailRecords.value = [] // 先清空旧数据
  batchInventory.value = [] // 清空批次库存数据
  purchaseHistory.value = [] // 清空采购历史
  salesHistory.value = [] // 清空销售历史
  activeTab.value = 'batch' // 默认显示批次库存标签页

  detailDialogVisible.value = true
  detailLoading.value = true

  try {
    const materialId = row.material_id

    // 并行获取流水记录、批次库存、采购历史、销售历史
    const [recordsResponse] = await Promise.all([
      inventoryApi.getMaterialRecords(materialId, { locationId: row.location_id }),
      loadBatchInventory(row.location_id),
      loadPurchaseHistory(materialId),
      loadSalesHistory(materialId)
    ])

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

// 加载采购历史
const loadPurchaseHistory = async (materialId) => {
  try {
    purchaseLoading.value = true

    // 调用后端API获取采购历史
    const response = await inventoryApi.getPurchaseHistory(materialId, {
      page: purchasePagination.currentPage,
      pageSize: purchasePagination.pageSize,
      sortField: 'receipt_date',
      sortOrder: 'DESC'
    })

    const responseData = response.data?.data || response.data || {}
    purchaseHistory.value = responseData.list || responseData.items || parseListData(response, { enableLog: false })
    purchasePagination.total = Number(responseData.total) || purchaseHistory.value.length
  } catch (error) {
    console.error('获取采购历史失败:', error)
    if (error.response?.status === 404) {
      console.warn('采购历史API暂未实现')
    }
    purchaseHistory.value = []
    purchasePagination.total = 0
  } finally {
    purchaseLoading.value = false
  }
}

// 加载销售历史
const loadSalesHistory = async (materialId) => {
  try {
    salesLoading.value = true

    // 调用后端API获取销售历史
    const response = await inventoryApi.getSalesHistory(materialId, {
      page: salesPagination.currentPage,
      pageSize: salesPagination.pageSize,
      sortField: 'outbound_date',
      sortOrder: 'DESC'
    })

    const responseData = response.data?.data || response.data || {}
    salesHistory.value = responseData.list || responseData.items || parseListData(response, { enableLog: false })
    salesPagination.total = Number(responseData.total) || salesHistory.value.length
  } catch (error) {
    console.error('获取销售历史失败:', error)
    if (error.response?.status === 404) {
      console.warn('销售历史API暂未实现')
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
    // 后端API使用 material_id 而不是 materialCode
    const response = await inventoryApi.getBatchInventory({
      material_id: currentDetail.value.material_id,
      location_id: locationId
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
      min_quantity: minQuantity.value,
      max_quantity: maxQuantity.value,
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
  const customMap = {
    'defective_return': '不良退回',
    'production_return': '生产退料',
    'purchase_return': '采购退货',
    'sales_return': '销售退货',
    'outsourced_outbound': '委外出库',
    'outsourced_inbound': '委外入库'
  };
  return customMap[type] || getInventoryTransactionTypeText(type) || type;
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
  const locName = String(row.location_name || '');
  if (locName.includes('隔离') || locName.includes('不良') || locName.includes('报废') || row.type === 'isolation' || row.type === 'defective') {
    return false;
  }

  const quantity = parseFloat(row.quantity || 0)
  const minStock = parseFloat(row.min_stock || 0)
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

/* 使用全局 common-styles.css 中的 .statistics-row 和 .stat-card */
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

/* 注意：对话框、descriptions等全局样式已在 themes/pc/default.css 中统一定义 */
/* 仅保留页面特定的样式 */

:deep(.el-dialog__body) {
  max-height: 60vh;  /* 仅设置最大高度，其他样式使用全局 */
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

/* 高级筛选区域 */
.advanced-filter {
  padding: 15px;
  background-color: var(--color-bg-hover);
  border-radius: 4px;
  margin-top: 15px;
}

.advanced-filter .el-form-item {
  margin-bottom: 0;
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
  box-shadow: 0 8px 32px rgba(102, 126, 234, 0.4), 0 4px 16px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  gap: 32px;
  min-width: 400px;
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

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 100%);
}

/* 对话框头部 */
.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding-right: 40px;
}

.dialog-header span {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* 操作按钮 */
.operation-btns {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>