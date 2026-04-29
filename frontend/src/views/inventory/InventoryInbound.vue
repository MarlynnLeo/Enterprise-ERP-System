<!--
/**
 * InventoryInbound.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="inventory-inbound-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>入库管理</h2>
          <p class="subtitle">管理入库单据与记录</p>
        </div>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="handleCreate">新建入库单</el-button>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="入库单号">
          <el-input  v-model="searchForm.inboundNo" placeholder="入库单号" clearable />
        </el-form-item>
        <el-form-item label="仓库">
          <el-select v-model="searchForm.locationId" placeholder="仓库" clearable>
            <el-option
              v-for="item in locations"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="日期范围">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
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
    
    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inboundStats.total || 0 }}</div>
        <div class="stat-label">入库单总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inboundStats.draftCount || 0 }}</div>
        <div class="stat-label">草稿状态</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inboundStats.confirmedCount || 0 }}</div>
        <div class="stat-label">已确认</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inboundStats.completedCount || 0 }}</div>
        <div class="stat-label">已完成</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inboundStats.cancelledCount || 0 }}</div>
        <div class="stat-label">已取消</div>
      </el-card>
    </div>
    
    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table
        :data="tableData"
        style="width: 100%"
        v-loading="loading"
        border
      >
        <template #empty>
          <el-empty description="暂无入库单数据" />
        </template>
        <el-table-column prop="inbound_no" label="入库单号" width="135" />
        <el-table-column prop="inbound_type" label="入库类型" width="110">
          <template #default="{ row }">
            <el-tag :type="getInboundTypeTagType(row.inbound_type)" size="small">
              {{ getInboundTypeText(row.inbound_type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="material_code" label="物料编码" width="120">
          <template #default="{ row }">
            <span v-if="row.material_code">{{ row.material_code }}</span>
            <span v-else-if="row.items_count > 1" style="color: var(--color-text-secondary);">多个物料</span>
            <span v-else style="color: var(--color-text-disabled);">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="material_name" label="物料名称" width="157" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.material_name">{{ row.material_name }}</span>
            <span v-else-if="row.items_count > 1" style="color: var(--color-text-secondary);">多个物料</span>
            <span v-else style="color: var(--color-text-disabled);">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="material_specs" label="型号规格" width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.material_specs">{{ row.material_specs }}</span>
            <span v-else style="color: var(--color-text-disabled);">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="first_item_quantity" label="数量" width="80" align="right">
          <template #default="{ row }">
            <span v-if="row.first_item_quantity">{{ row.first_item_quantity }}</span>
            <span v-else-if="row.total_quantity" style="color: var(--color-primary);" :title="`总数量：${row.total_quantity}`">{{ row.total_quantity }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="inbound_date" label="入库日期" width="100" />
        <el-table-column prop="location_name" label="仓库" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="operator_name" label="操作人" width="80">
          <template #default="scope">
            {{ scope.row.operator_name || scope.row.operator || '未知' }}
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" width="180" show-overflow-tooltip />
        <el-table-column label="操作" min-width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="handleView(row.id)">查看</el-button>
            <el-popconfirm
              v-if="row.status === 'draft'"
              title="确定要确认该入库单吗？"
              @confirm="handleUpdateStatus(row.id, 'confirmed')"
            >
              <template #reference>
                <el-button size="small" type="primary">确认</el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              v-if="row.status === 'confirmed'"
              title="确定要完成该入库单吗？"
              @confirm="handleUpdateStatus(row.id, 'completed')"
            >
              <template #reference>
                <el-button size="small" type="primary">完成</el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              v-if="row.status === 'draft'"
              title="确定要取消该入库单吗？"
              @confirm="handleUpdateStatus(row.id, 'cancelled')"
              confirm-button-type="danger"
            >
              <template #reference>
                <el-button size="small" type="danger">取消</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          :current-page="pagination.currentPage"
          :page-sizes="[10, 20, 50, 100]"
          :page-size="pagination.pageSize"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total"
        >
        </el-pagination>
      </div>
    </el-card>

    <!-- 新建/编辑入库单对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="getDialogTitle"
      width="60%"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="100px"
      >
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="入库类型" prop="inbound_type">
              <el-select
                v-model="form.inbound_type"
                placeholder="请选择入库类型"
                style="width: 100%"
                @change="handleInboundTypeChange"
              >
                <el-option
                  v-for="item in inboundTypeOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="入库日期" prop="inbound_date">
              <el-date-picker
                v-model="form.inbound_date"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="仓库" prop="location_id">
              <el-select
                v-model="form.location_id"
                placeholder="请选择仓库"
                style="width: 100%"
                @change="handleLocationChange"
              >
                <el-option
                  v-for="item in locations"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 生产退料时显示关联任务选择 -->
        <el-row :gutter="20" v-if="form.inbound_type === 'production_return'">
          <el-col :span="16">
            <el-form-item label="关联任务" prop="reference_no">
              <el-input
                v-model="form.reference_no"
                placeholder="点击选择生产任务"
                readonly
                @click="openTaskSelectDialog"
              >
                <template #append>
                  <el-button @click="openTaskSelectDialog">选择任务</el-button>
                </template>
              </el-input>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="任务产品" v-if="selectedTask">
              <span>{{ selectedTask.product_name }}</span>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="操作人" prop="operator">
              <el-input v-model="form.operator" placeholder="系统自动填充当前用户姓名" readonly />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="备注">
              <el-input
                v-model="form.remark"
                type="textarea"
                :rows="1"
                placeholder="请输入备注"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider>{{ form.inbound_type === 'production_return' ? '退料明细' : '入库明细' }}</el-divider>

        <el-table
          :data="form.items"
          border
          style="width: 100%"
          :header-cell-style="{ background: 'var(--color-bg-hover)', color: 'var(--color-text-regular)' }"
          empty-text="请添加入库物料"
        >
          <el-table-column label="物料编码" width="160">
            <template #default="{ row, $index }">
              <el-autocomplete
                :ref="(el) => setMaterialSelectRef(el, $index)"
                v-model="row.material_code"
                placeholder="输入编码/名称/规格"
                clearable
                :fetch-suggestions="(query, callback) => fetchMaterialSuggestions(query, callback, $index)"
                @select="(item) => handleMaterialSelect(item, $index)"
                @keydown.enter.prevent="handleMaterialEnter($index)"
                @clear="handleMaterialClear($index)"
                style="width: 100%"
                :trigger-on-focus="true"
                :debounce="300"
                :hide-loading="false"
                :popper-append-to-body="false"
                value-key="code"
              >
                <template #default="{ item }">
                  <div style="display: flex; align-items: center; padding: 4px 0; font-size: 13px;">
                    <span style="font-weight: bold; color: var(--color-text-primary); min-width: 80px;">
                      {{ item.code }}
                    </span>
                    <span style="color: var(--color-text-regular); margin: 0 8px; flex: 1;">
                      {{ item.name }}
                    </span>
                    <span style="color: var(--color-text-secondary); margin: 0 8px; min-width: 100px;">
                      {{ item.specs }}
                    </span>
                    <span style="color: var(--color-primary); font-weight: bold; min-width: 60px; text-align: right;">
                      库存: {{ item.stock_quantity || 0 }}
                    </span>
                  </div>
                </template>
              </el-autocomplete>
            </template>
          </el-table-column>

          <el-table-column label="物料名称" prop="material_name" width="140" show-overflow-tooltip />

          <el-table-column label="规格" prop="specification" width="140" show-overflow-tooltip />

          <el-table-column label="数量" width="120">
            <template #default="{ row, $index }">
              <el-input
                :ref="(el) => setQuantityInputRef(el, $index)"
                v-model="row.quantity"
                @input="(val) => { row.quantity = Number(val) || 0; }"
                @keydown.enter="handleQuantityEnter($index)"
                placeholder="数量"
                size="small"
              />
            </template>
          </el-table-column>

          <el-table-column label="单位" prop="unit_name" width="70" />

          <el-table-column label="批次号" width="150">
            <template #default="{ row }">
              <el-input
                v-model="row.batch_number"
                placeholder="请输入批次号"
                size="small"
              />
            </template>
          </el-table-column>

          <el-table-column label="备注" width="150">
            <template #default="{ row }">
              <el-input 
                v-model="row.remark"
                placeholder="请输入备注"
                size="small"
                maxlength="200"
                clearable />
            </template>
          </el-table-column>

          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ $index }">
              <el-button
                type="danger"
                size="small"
                @click="handleRemoveItem($index)"
                v-permission="'inventory:inbound:update'"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="add-material" style="margin-top: 10px;">
          <el-button type="primary" @click="handleAddItem">
            <el-icon><Plus /></el-icon>添加物料
          </el-button>
        </div>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleSubmit" :loading="submitLoading">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 查看入库单对话框 -->
    <el-dialog
      v-model="viewDialogVisible"
      title="入库单详情"
      width="50%"
    >
      <div v-loading="viewLoading">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="入库单号">{{ currentInbound.inbound_no }}</el-descriptions-item>
        <el-descriptions-item label="入库日期">{{ currentInbound.inbound_date }}</el-descriptions-item>
        <el-descriptions-item label="仓库">{{ currentInbound.location_name }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentInbound.status)">
            {{ getStatusText(currentInbound.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="操作人">{{ currentInbound.operator_name || currentInbound.operator || '未知' }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ currentInbound.remark }}</el-descriptions-item>
      </el-descriptions>

      <el-divider>入库明细</el-divider>

      <el-table :data="currentInbound.items" border style="width: 100%">
        <el-table-column prop="material_code" label="物料编码" width="120" />
        <el-table-column prop="material_name" label="物料名称" min-width="150" />
        <el-table-column prop="quantity" label="数量" width="100" />
        <el-table-column prop="unit_name" label="单位" width="80" />
        <el-table-column prop="batch_number" label="批次号" width="200" />
        <el-table-column prop="remark" label="备注" min-width="150" />
      </el-table>
      </div>
      <template #footer>
        <el-button @click="viewDialogVisible = false">关闭</el-button>
        <el-button type="primary" @click="handlePrintInbound" :loading="printLoading">打印</el-button>
      </template>
    </el-dialog>

    <!-- 物料选择对话框 -->
    <el-dialog
      v-model="materialDialogVisible"
      title="选择物料"
      width="40%"
    >
      <el-form :inline="true" class="search-form demo-form-inline" :model="materialSearchForm">
        <el-form-item label="物料编码">
          <el-input  v-model="materialSearchForm.code" placeholder="物料编码" clearable />
        </el-form-item>
        <el-form-item label="物料名称">
          <el-input  v-model="materialSearchForm.name" placeholder="物料名称" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleMaterialSearch">搜索</el-button>
        </el-form-item>
      </el-form>

      <el-table
        :data="materialTableData"
        style="width: 100%"
        v-loading="materialLoading"
        @selection-change="handleMaterialSelectionChange"
      >
        <el-table-column type="selection" width="55" />
        <el-table-column prop="code" label="物料编码" width="120" />
        <el-table-column prop="name" label="物料名称" width="180" />
        <el-table-column prop="specs" label="规格" width="220" />
        <el-table-column prop="unit_name" label="单位" width="80" />
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleAddSingleMaterial(row)">
              选择
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-container">
        <el-pagination
          v-model:current-page="materialCurrentPage"
          v-model:page-size="materialPageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="materialTotal"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleMaterialSizeChange"
          @current-change="handleMaterialCurrentChange"
        />
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="materialDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleMaterialConfirm">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 生产任务选择对话框 -->
    <el-dialog
      v-model="productionTaskDialogVisible"
      title="选择生产任务（生产退料）"
      width="70%"
    >
      <el-form :inline="true" class="search-form" :model="{ keyword: taskSearchKeyword }">
        <el-form-item label="任务编号/产品">
          <el-input 
            v-model="taskSearchKeyword"
            placeholder="输入任务编号或产品名称"
            clearable
            @keyup.enter="searchProductionTasks" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="searchProductionTasks">查询</el-button>
        </el-form-item>
      </el-form>

      <el-table
        :data="productionTasks"
        v-loading="taskLoading"
        border
        style="width: 100%"
        @row-click="handleTaskRowClick"
        highlight-current-row
      >
        <el-table-column prop="code" label="任务编号" width="150" />
        <el-table-column prop="product_code" label="产品编码" width="130" />
        <el-table-column prop="product_name" label="产品名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="quantity" label="生产数量" width="100" align="right" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getTaskStatusType(row.status)">{{ getTaskStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click.stop="selectTask(row)">选择</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 选中任务后显示领料记录 -->
      <template v-if="selectedTask">
        <el-divider>任务 {{ selectedTask.code }} 的领料记录</el-divider>
        <el-alert
          v-if="taskMaterialRecords.length === 0 && !taskMaterialLoading"
          title="该任务暂无领料记录"
          type="warning"
          :closable="false"
        />
        <el-table
          v-else
          :data="taskMaterialRecords"
          v-loading="taskMaterialLoading"
          border
          style="width: 100%"
          @selection-change="handleReturnMaterialSelection"
        >
          <el-table-column type="selection" width="55" :selectable="checkReturnSelectable" />
          <el-table-column prop="material_code" label="物料编码" width="130" />
          <el-table-column prop="material_name" label="物料名称" min-width="150" show-overflow-tooltip />
          <el-table-column prop="material_specs" label="规格" width="150" show-overflow-tooltip />
          <el-table-column prop="issued_quantity" label="领料数量" width="100" align="right" />
          <el-table-column prop="returned_quantity" label="已退数量" width="100" align="right">
            <template #default="{ row }">
              <span :style="{ color: row.returned_quantity > 0 ? '#E6A23C' : '' }">
                {{ row.returned_quantity || 0 }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="max_returnable_quantity" label="可退数量" width="100" align="right">
            <template #default="{ row }">
              <span :style="{ color: row.max_returnable_quantity > 0 ? '#67C23A' : '#909399' }">
                {{ row.max_returnable_quantity }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="default_location_name" label="退料仓库" width="120">
            <template #default="{ row }">
              <span>{{ row.default_location_name || '未设置' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="退料数量" width="120">
            <template #default="{ row }">
              <el-input-number
                v-model="row.return_quantity"
                :min="0"
                :max="row.max_returnable_quantity"
                :precision="2"
                size="small"
                :disabled="row.max_returnable_quantity <= 0"
              />
            </template>
          </el-table-column>
        </el-table>
      </template>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="productionTaskDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmTaskSelection" :disabled="!selectedTask">确认选择</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Search, Refresh } from '@element-plus/icons-vue'
import { inventoryApi, baseDataApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { getInboundOutboundStatusText, getInboundOutboundStatusColor } from '@/constants/systemConstants'
import { searchMaterials } from '@/utils/searchConfig'
import { parseListData, parsePaginatedData } from '@/utils/responseParser'
import printService, { parseTemplateResponse } from '@/services/printService'

const route = useRoute()

// 权限store
const authStore = useAuthStore()

// 权限计算属性
const canCreate = computed(() => authStore.hasPermission && authStore.hasPermission('inventory:inbound:create'));
// 搜索表单
const searchForm = reactive({
  inboundNo: '',
  locationId: '',
  dateRange: []
})

// 表格数据
const tableData = ref([])
const loading = ref(false)

// 添加响应式分页对象
const pagination = reactive({
  currentPage: 1,
  pageSize: 10,
  total: 0
})

// 对话框相关
const dialogVisible = ref(false)
const dialogType = ref('create')
const viewDialogVisible = ref(false)
const viewLoading = ref(false)
const submitLoading = ref(false)
const formRef = ref(null)
const form = reactive({
  inbound_date: '',
  location_id: '',
  operator: '',
  remark: '',
  status: 'draft',
  items: [],
  // 新增字段：入库类型和关联单据
  inbound_type: 'other',
  reference_type: null,
  reference_id: null,
  reference_no: null
})

// 入库类型选项
const inboundTypeOptions = [
  { value: 'other', label: '其他入库' },
  { value: 'purchase', label: '采购入库' },
  { value: 'production', label: '生产入库' },
  { value: 'production_return', label: '生产退料' },
  { value: 'defective_return', label: '不良退回' },
  { value: 'outsourced', label: '委外入库' },
  { value: 'sales_return', label: '销售退货入库' }
]

// 生产退料相关
const productionTaskDialogVisible = ref(false)
const productionTasks = ref([])
const taskSearchKeyword = ref('')
const taskLoading = ref(false)
const selectedTask = ref(null)
const taskMaterialRecords = ref([])
const taskMaterialLoading = ref(false)

// 当前查看的入库单
const currentInbound = reactive({
  inbound_no: '',
  inbound_date: '',
  location_name: '',
  status: '',
  operator: '',
  remark: '',
  items: []
})

// 基础数据
const locations = ref([])
const materials = ref([])
const units = ref([])

// 物料选择对话框相关
const materialDialogVisible = ref(false)
const materialSearchForm = reactive({
  code: '',
  name: ''
})
const materialTableData = ref([])
const materialLoading = ref(false)
const materialCurrentPage = ref(1)
const materialPageSize = ref(10)
const materialTotal = ref(0)
const selectedMaterials = ref([])

// 表单验证规则
const rules = {
  inbound_date: [
    { required: true, message: '请选择入库日期', trigger: 'change' }
  ],
  location_id: [
    { required: true, message: '请选择仓库', trigger: 'change' }
  ],
  operator: [
    { required: true, message: '请输入操作人', trigger: 'blur' }
  ]
}

// 入库单统计数据
const inboundStats = reactive({
  total: 0,
  draftCount: 0,
  confirmedCount: 0,
  completedCount: 0,
  cancelledCount: 0
});

// 获取状态类型
const getStatusType = (status) => {
  return getInboundOutboundStatusColor(status);
};

// 获取状态文本
const getStatusText = (status) => {
  return getInboundOutboundStatusText(status);
};

// 获取入库类型文本
const getInboundTypeText = (type) => {
  const map = {
    'purchase': '采购入库',
    'production': '生产入库',
    'production_return': '生产退料',
    'defective_return': '不良退回',
    'outsourced': '委外入库',
    'sales_return': '销售退货',
    'other': '其他入库'
  }
  return map[type] || type || '其他入库'
}

// 获取入库类型标签样式
const getInboundTypeTagType = (type) => {
  const map = {
    'purchase': 'primary',
    'production': 'success',
    'production_return': 'warning',
    'defective_return': 'danger',
    'outsourced': 'info',
    'sales_return': 'danger',
    'other': 'info'
  }
  return map[type] || 'info'
}

// 加载仓库列表
const loadLocations = async () => {
  try {
    const response = await baseDataApi.getLocations();
    locations.value = parseListData(response, { enableLog: false });

    if (locations.value.length === 0) {
      ElMessage.warning('未找到可用的仓库，请先在基础数据中添加仓库');
    }
  } catch (error) {
    console.error('加载仓库数据失败:', error);
    ElMessage.error('加载仓库数据失败: ' + (error.message || '未知错误'));
    locations.value = [];
  }
};

// 加载物料列表
const loadMaterials = async () => {
  try {
    materialLoading.value = true
    const params = {
      page: materialCurrentPage.value,
      pageSize: materialPageSize.value,
      name: materialSearchForm.name,
      code: materialSearchForm.code
    }
    const response = await baseDataApi.getMaterials(params)
    const { list, total } = parsePaginatedData(response)

    materialTableData.value = list
    materialTotal.value = total

  } catch (error) {
    console.error('加载物料数据失败:', error)
    ElMessage.error('加载物料数据失败')
  } finally {
    materialLoading.value = false
  }
}

// 加载单位数据
const loadUnits = async () => {
  try {
    const response = await baseDataApi.getUnits({ status: 1 }); // 只获取启用的单位
    units.value = parseListData(response, { enableLog: false });
    return units.value;
  } catch (error) {
    console.error('加载单位数据失败:', error);
    ElMessage.error('加载单位数据失败');
    return [];
  }
};

// 加载入库单列表
const loadInbounds = async () => {
  loading.value = true;
  try {
    const params = {
      page: pagination.currentPage,
      pageSize: pagination.pageSize,
      inboundNo: searchForm.inboundNo,
      locationId: searchForm.locationId,
      startDate: searchForm.dateRange && searchForm.dateRange[0] ? searchForm.dateRange[0] : '',
      endDate: searchForm.dateRange && searchForm.dateRange[1] ? searchForm.dateRange[1] : ''
    };

    const response = await inventoryApi.getInboundList(params);
    const { list, total } = parsePaginatedData(response);

    tableData.value = list;
    pagination.total = Math.max(total, 1);
    updateStats();
  } catch (error) {
    console.error('加载入库单失败:', error);
    ElMessage.error('加载入库单失败');
    tableData.value = [];
    pagination.total = 0;
  } finally {
    loading.value = false;
  }
};

// 搜索处理
const handleSearch = () => {
  pagination.currentPage = 1;
  loadInbounds();
};

// 新建入库单
const handleCreate = () => {
  dialogType.value = 'create'
  form.inbound_date = new Date().toISOString().split('T')[0]
  form.location_id = ''
  form.inbound_type = 'other'
  form.reference_type = null
  form.reference_id = null
  form.reference_no = null
  selectedTask.value = null

  // 设置当前用户为操作人（使用真实姓名）
  if (authStore.user && (authStore.user.real_name || authStore.user.name)) {
    form.operator = authStore.user.real_name || authStore.user.name
  } else {
    // 尝试从localStorage获取
    const localUser = JSON.parse(localStorage.getItem('user'))
    if (localUser && (localUser.real_name || localUser.name)) {
      form.operator = localUser.real_name || localUser.name
    } else {
      form.operator = ''
    }
  }
  
  form.remark = ''
  form.status = 'draft'
  form.items = []
  dialogVisible.value = true
}


// ========== 打印功能 ==========
const printLoading = ref(false)
const handlePrintInbound = async () => {
  printLoading.value = true
  try {
    const response = await printService.getPrintTemplateById(63)
    const template = parseTemplateResponse(response)
    if (!template || !template.content) {
      ElMessage.error('未找到入库单打印模板，请在系统管理-打印模板中配置')
      return
    }
    const printData = {
      inbound_no: currentInbound.inbound_no || '',
      inbound_date: currentInbound.inbound_date || '',
      inbound_type: getInboundTypeText(currentInbound.inbound_type) || '其他入库',
      supplier_name: currentInbound.supplier_name || '',
      location_name: currentInbound.location_name || '',
      remark: currentInbound.remark || '',
      operator: currentInbound.operator_name || currentInbound.operator || '',
      items: (currentInbound.items || []).map((item, idx) => ({
        index: idx + 1,
        material_code: item.material_code || '',
        material_name: item.material_name || '',
        specification: item.specification || item.material_specs || '',
        quantity: parseFloat(item.quantity || 0).toFixed(2),
        unit_name: item.unit_name || '',
        remark: item.remark || ''
      }))
    }
    const html = printService.generatePrintContent(template, printData)
    printService.previewDocument(html)
  } catch (error) {
    console.error('打印入库单失败:', error)
    ElMessage.error('打印失败: ' + (error.message || '未知错误'))
  } finally {
    printLoading.value = false
  }
}

// 查看入库单
const handleView = async (id) => {
  viewDialogVisible.value = true
  viewLoading.value = true
  try {
    const res = await inventoryApi.getInboundDetail(id)
    // 后端使用 ResponseHandler.success 返回，数据在 res.data.data 中
    const inboundData = res.data?.data || res.data
    Object.assign(currentInbound, inboundData)
  } catch (error) {
    console.error('获取入库单详情失败:', error)
    ElMessage.error('获取入库单详情失败')
  } finally {
    viewLoading.value = false
  }
}

// 更新入库单状态
const handleUpdateStatus = async (id, newStatus) => {
  try {
    // 确保使用正确的参数格式
    await inventoryApi.updateInboundStatus(id, { newStatus });

    // 追溯记录已改为由底层的 batch_relationships 统一管理，由于旧版单独的质量追溯API已在架构重构中全面废弃，此处不再重复发起 /api/quality/traceability/purchase 请求。

    ElMessage.success('状态更新成功');
    // 刷新数据
    handleSearch();
  } catch (error) {
    console.error('状态更新失败:', error);
    ElMessage.error(error.response?.data?.message || '状态更新失败');
  }
}

// 组件引用管理
const materialSelectRefs = ref({})
const quantityInputRefs = ref({})

// 设置物料选择框引用
const setMaterialSelectRef = (el, index) => {
  if (el) {
    materialSelectRefs.value[index] = el
  }
}

// 设置数量输入框引用
const setQuantityInputRef = (el, index) => {
  if (el) {
    quantityInputRefs.value[index] = el
  }
}

// 添加物料项
const handleAddItem = () => {
  form.items.push({
    material_id: '',
    material_code: '',
    material_name: '',
    specification: '',
    quantity: '',
    unit_name: '',
    unit_id: '',
    batch_number: '',
    remark: ''
  })

  // 聚焦到新添加行的物料输入框
  nextTick(() => {
    const newIndex = form.items.length - 1
    const materialInput = materialSelectRefs.value[newIndex]
    if (materialInput) {
      materialInput.focus()
    }
  })
}

// 删除物料项
const handleRemoveItem = (index) => {
  form.items.splice(index, 1)
}

// 获取物料建议列表
const fetchMaterialSuggestions = async (queryString, callback) => {
  // 如果查询字符串为空,返回空数组
  if (!queryString || queryString.trim().length === 0) {
    callback([])
    return
  }

  try {
    // 使用统一的搜索函数
    const searchResults = await searchMaterials(baseDataApi, queryString.trim(), {
      pageSize: 500,
      includeAll: true
    })

    // 映射搜索结果为自动完成需要的格式
    const suggestions = searchResults.map(item => ({
      value: item.code || '无编码', // value 用于显示在输入框中
      id: item.id,
      code: item.code || '无编码',
      name: item.name || '未命名',
      specs: item.specification || '',
      unit_name: item.unit_name || '个',
      unit_id: item.unit_id,
      stock_quantity: item.stock_quantity || 0
    }))

    callback(suggestions)
  } catch (error) {
    ElMessage.error('搜索物料失败')
    callback([])
  }
}

// 处理物料选择
const handleMaterialSelect = (item, index) => {
  const materialId = Number(item.id)
  if (!materialId || isNaN(materialId)) {
    console.error('物料ID无效:', item.id)
    ElMessage.error('物料ID无效，请重新选择')
    return
  }

  form.items[index].material_id = materialId
  form.items[index].material_code = item.code
  form.items[index].material_name = item.name
  form.items[index].specification = item.specs
  form.items[index].unit_name = item.unit_name
  form.items[index].unit_id = item.unit_id

  // 选择物料后，自动聚焦到数量输入框
  nextTick(() => {
    const quantityInput = quantityInputRefs.value[index]
    if (quantityInput) {
      quantityInput.focus()
    }
  })
}

// 处理物料输入框回车
const handleMaterialEnter = (index) => {
  // 如果已选择物料，跳转到数量输入框
  if (form.items[index].material_id) {
    const quantityInput = quantityInputRefs.value[index]
    if (quantityInput) {
      quantityInput.focus()
    }
  }
}

// 处理物料清除
const handleMaterialClear = (index) => {
  form.items[index].material_id = ''
  form.items[index].material_code = ''
  form.items[index].material_name = ''
  form.items[index].specification = ''
  form.items[index].unit_name = ''
  form.items[index].unit_id = ''
}

// 处理数量输入框回车
const handleQuantityEnter = (index) => {
  // 如果是最后一行，添加新行
  if (index === form.items.length - 1) {
    handleAddItem()
  } else {
    // 否则跳转到下一行的物料输入框
    const nextMaterialInput = materialSelectRefs.value[index + 1]
    if (nextMaterialInput) {
      nextMaterialInput.focus()
    }
  }
}

// 仓库选择变化
const handleLocationChange = () => {
  form.items = []
}

// 入库类型变化
const handleInboundTypeChange = () => {
  // 清空关联信息和明细
  form.reference_type = null
  form.reference_id = null
  form.reference_no = null
  form.items = []
  selectedTask.value = null
  taskMaterialRecords.value = []
}

// 计算对话框标题
const getDialogTitle = computed(() => {
  if (dialogType.value === 'create') {
    if (form.inbound_type === 'production_return') {
      return '新建退料单'
    }
    return '新建入库单'
  }
  return '编辑入库单'
})

// 打开生产任务选择对话框
const openTaskSelectDialog = async () => {
  productionTaskDialogVisible.value = true
  taskSearchKeyword.value = ''
  selectedTask.value = null
  taskMaterialRecords.value = []
  await searchProductionTasks()
}

// 搜索生产任务
const searchProductionTasks = async () => {
  try {
    taskLoading.value = true
    // 调用生产任务API
    const response = await fetch(`/api/production/tasks?keyword=${taskSearchKeyword.value}&status=in_progress,material_issued,completed&limit=50`)
    const result = await response.json()
    if (result.success) {
      productionTasks.value = result.data?.list || result.data || []
    } else {
      productionTasks.value = []
    }
  } catch (error) {
    console.error('查询生产任务失败:', error)
    productionTasks.value = []
  } finally {
    taskLoading.value = false
  }
}

// 点击任务行
const handleTaskRowClick = (row) => {
  selectTask(row)
}

// 选择任务
const selectTask = async (task) => {
  selectedTask.value = task
  await loadTaskMaterialRecords(task.id)
}

// 加载任务领料记录
const loadTaskMaterialRecords = async (taskId) => {
  try {
    taskMaterialLoading.value = true
    const response = await inventoryApi.getTaskMaterialIssueRecords(taskId)
    const data = response.data?.data || response.data
    taskMaterialRecords.value = (data?.records || []).map(r => ({
      ...r,
      return_quantity: r.max_returnable_quantity > 0 ? r.max_returnable_quantity : 0
    }))
  } catch (error) {
    console.error('获取领料记录失败:', error)
    taskMaterialRecords.value = []
  } finally {
    taskMaterialLoading.value = false
  }
}

// 检查是否可选择退料
const checkReturnSelectable = (row) => {
  return row.max_returnable_quantity > 0
}

// 处理退料物料选择
const selectedReturnMaterials = ref([])
const handleReturnMaterialSelection = (selection) => {
  selectedReturnMaterials.value = selection
}

// 确认任务选择
const confirmTaskSelection = () => {
  if (!selectedTask.value) {
    ElMessage.warning('请先选择一个生产任务')
    return
  }

  // 获取选中的退料物料
  const returnItems = taskMaterialRecords.value.filter(r => r.return_quantity > 0 && r.max_returnable_quantity > 0)

  if (returnItems.length === 0) {
    ElMessage.warning('请至少选择一个物料并设置退料数量')
    return
  }

  // 设置关联信息
  form.reference_type = 'production_task'
  form.reference_id = selectedTask.value.id
  form.reference_no = selectedTask.value.code

  // 自动设置表单仓库：优先使用有默认仓库的物料，否则使用仓库列表第一个
  const locationsWithDefault = returnItems.map(i => i.default_location_id).filter(Boolean)
  if (locationsWithDefault.length > 0) {
    form.location_id = locationsWithDefault[0]
  } else if (locations.value.length > 0) {
    form.location_id = locations.value[0].id
  }

  // 构建退料明细（使用物料的默认仓库，没有则使用表单仓库）
  form.items = returnItems.map(item => ({
    material_id: item.material_id,
    material_code: item.material_code,
    material_name: item.material_name,
    specification: item.material_specs,
    quantity: item.return_quantity,
    unit_name: item.unit_name,
    unit_id: item.unit_id || null,
    batch_number: item.batch_number || '',
    location_id: item.default_location_id || form.location_id,
    remark: `生产退料 - 任务${selectedTask.value.code}`
  }))

  productionTaskDialogVisible.value = false
  ElMessage.success(`已选择${returnItems.length}个物料进行退料`)
}

// 获取任务状态类型
const getTaskStatusType = (status) => {
  const map = {
    'pending': 'info',
    'allocated': 'info',
    'material_issued': 'warning',
    'in_progress': 'primary',
    'inspection': 'warning',
    'completed': 'success',
    'cancelled': 'danger'
  }
  return map[status] || 'info'
}

// 获取任务状态文字
const getTaskStatusText = (status) => {
  const map = {
    'pending': '待分配',
    'allocated': '已分配',
    'material_issued': '已发料',
    'in_progress': '生产中',
    'inspection': '待检验',
    'completed': '已完成',
    'cancelled': '已取消'
  }
  return map[status] || status
}

// 提交表单
const handleSubmit = async () => {
  if (!formRef.value) return
  
  try {
    await formRef.value.validate()
    
    if (form.items.length === 0) {
      ElMessage.warning('请至少添加一个物料项')
      return
    }
    
    submitLoading.value = true
    
    // 确保所有物料项有unit_id和unit_name
    for (const item of form.items) {
      if (!item.unit_id) {
        ElMessage.warning('存在物料没有指定单位，请检查')
        return
      }
      
      // 确保有unit_name
      if (!item.unit_name && item.unit_id) {
        const unit = units.value.find(u => u.id === item.unit_id)
        if (unit) {
          item.unit_name = unit.name
        }
      }
    }
    
    const submitData = {
      ...form,
      items: form.items.map(item => ({
        ...item,
        material_id: item.material_id,
        quantity: item.quantity,
        unit_id: item.unit_id,
        batch_number: item.batch_number,
        remark: item.remark
      }))
    };
    
    // 根据对话框类型决定是创建还是更新
    let response
    if (dialogType.value === 'create') {
      response = await inventoryApi.createInbound(submitData)
      ElMessage.success('入库单创建成功')
    } else {
      response = await inventoryApi.updateInbound(form.id, submitData)
      ElMessage.success('入库单更新成功')
    }

    // 拦截器已解包，response.data 就是业务数据
    // 创建成功后，记录追溯信息
    if (response.data?.id) {
      // 构建完整的入库数据
      const inboundData = {
        ...response.data,
        ...form,
        id: response.data.id,
        inbound_no: response.data.inbound_no || '',
      };
      
      // 记录追溯信息
      await recordTraceability(inboundData);
    }
    
    dialogVisible.value = false
    handleSearch()
  } catch (error) {
    console.error('提交失败:', error)
    ElMessage.error(error.response?.data?.message || '提交失败')
  } finally {
    submitLoading.value = false
  }
}

// 分页处理
const handleSizeChange = (val) => {
  pagination.pageSize = val;
  loadInbounds();
};

const handleCurrentChange = (val) => {
  pagination.currentPage = val;
  loadInbounds();
};

// 物料搜索
const handleMaterialSearch = () => {
  materialCurrentPage.value = 1
  loadMaterials()
}

// 物料选择变化
const handleMaterialSelectionChange = (selection) => {
  selectedMaterials.value = selection
}

// 确认选择物料
const handleMaterialConfirm = async () => {
  if (selectedMaterials.value.length === 0) {
    ElMessage.warning('请选择至少一个物料')
    return
  }
  
  // 确保已加载单位数据
  if (units.value.length === 0) {
    await loadUnits();
    }
  
  // 添加选中的物料到表单
  for (const material of selectedMaterials.value) {
    // 获取物料详细信息
    try {
      const materialDetail = await baseDataApi.getMaterial(material.id);
      const detailedMaterial = materialDetail.data;
      
      // 确保每个物料都有unit_id
      const unitId = detailedMaterial.unit_id || (units.value.length > 0 ? units.value[0].id : null);
      let unitName = '';
      
      // 查找单位名称
      if (unitId) {
        const unit = units.value.find(u => u.id === unitId);
        if (unit) {
          unitName = unit.name;
        }
      }
      
      form.items.push({
        material_id: detailedMaterial.id,
        material_code: detailedMaterial.code,
        material_name: detailedMaterial.name,
        specification: detailedMaterial.specs,
        quantity: 0,
        unit_id: unitId,
        unit_name: unitName,
        batch_number: '',
        remark: ''
      });
    } catch (error) {
      console.error(`获取物料${material.id}详情失败:`, error);
      
      // 使用列表中的简略信息
      const unitId = material.unit_id || (units.value.length > 0 ? units.value[0].id : null);
      let unitName = material.unit_name || '';
      
      // 查找单位名称
      if (unitId && !unitName) {
        const unit = units.value.find(u => u.id === unitId);
        if (unit) {
          unitName = unit.name;
        }
      }
      
      form.items.push({
        material_id: material.id,
        material_code: material.code,
        material_name: material.name,
        specification: material.specs,
        quantity: 0,
        unit_id: unitId,
        unit_name: unitName,
        batch_number: '',
        remark: ''
      });
    }
  }
  
  materialDialogVisible.value = false;
  selectedMaterials.value = [];
}

// 分页大小变化
const handleMaterialSizeChange = (val) => {
  materialPageSize.value = val
  loadMaterials()
}

// 页码变化
const handleMaterialCurrentChange = (val) => {
  materialCurrentPage.value = val
  loadMaterials()
}

// 直接添加单个物料
const handleAddSingleMaterial = async (material) => {
  try {
    // 获取物料详情
    const materialDetail = await baseDataApi.getMaterial(material.id);
    const detailedMaterial = materialDetail.data;
    
    // 确保已加载单位数据
    if (units.value.length === 0) {
      await loadUnits();
    }
    
    // 设置单位
    const unitId = detailedMaterial.unit_id || (units.value.length > 0 ? units.value[0].id : null);
    let unitName = '';
    
    if (unitId) {
      const unit = units.value.find(u => u.id === unitId);
      if (unit) {
        unitName = unit.name;
      }
    }
    
    // 添加到物料列表
    form.items.push({
      material_id: detailedMaterial.id,
      material_code: detailedMaterial.code,
      material_name: detailedMaterial.name,
      specification: detailedMaterial.specs,
      quantity: 0,
      unit_id: unitId,
      unit_name: unitName,
      batch_number: '',
      remark: ''
    });
    
    materialDialogVisible.value = false;
    ElMessage.success(`已添加物料: ${detailedMaterial.code} - ${detailedMaterial.name}`);
  } catch (error) {
    console.error('添加单个物料失败:', error);
    ElMessage.error('添加物料失败');
  }
}

// 重置搜索
const resetSearch = () => {
  searchForm.inboundNo = '';
  searchForm.locationId = '';
  searchForm.dateRange = [];
  pagination.currentPage = 1;
  loadInbounds();
};

// 更新统计数据 - 从服务端获取真实统计
const updateStats = async () => {
  try {
    // 请求所有入库单的状态统计（不带分页限制）
    const response = await inventoryApi.getInboundList({
      page: 1,
      pageSize: 9999  // 获取所有数据来统计
    });
    const { list, total } = parsePaginatedData(response);

    // 使用真实总数
    inboundStats.total = total;
    inboundStats.draftCount = list.filter(item => item.status === 'draft').length;
    inboundStats.confirmedCount = list.filter(item => item.status === 'confirmed').length;
    inboundStats.completedCount = list.filter(item => item.status === 'completed').length;
    inboundStats.cancelledCount = list.filter(item => item.status === 'cancelled').length;
  } catch (error) {
    console.error('获取统计数据失败:', error);
    // 失败时使用当前分页的数据作为fallback
    inboundStats.total = pagination.total;
  }
};

onMounted(async () => {
  // 确保分页参数有默认值
  pagination.currentPage = 1;
  pagination.pageSize = 10;
  pagination.total = 10; // 确保分页组件显示

  await loadLocations();
  loadMaterials();
  loadUnits();
  loadInbounds();

  // 检查是否从生产工序页面跳转过来（退料操作）
  if (route.query.action === 'return' && route.query.taskId) {
    await handleReturnFromProduction(route.query.taskId, route.query.taskCode)
  }
});

// 处理从生产工序页面跳转过来的退料
const handleReturnFromProduction = async (taskId, taskCode) => {
  // 打开新建对话框
  handleCreate()

  // 设置为生产退料类型
  form.inbound_type = 'production_return'
  form.reference_type = 'production_task'
  form.reference_id = parseInt(taskId)
  form.reference_no = taskCode

  // 加载任务领料记录
  await loadTaskMaterialRecords(taskId)

  // 如果有领料记录，自动添加到明细
  if (taskMaterialRecords.value.length > 0) {
    // 默认选择所有可退的物料（使用物料的默认仓库）
    const returnItems = taskMaterialRecords.value.filter(r => r.max_returnable_quantity > 0)

    // 自动设置表单仓库：优先使用有默认仓库的物料，否则使用仓库列表第一个
    const locationsWithDefault = returnItems.map(i => i.default_location_id).filter(Boolean)
    if (locationsWithDefault.length > 0) {
      // 使用第一个有默认仓库的物料的仓库
      form.location_id = locationsWithDefault[0]
    } else if (locations.value.length > 0) {
      // 没有任何物料有默认仓库，使用仓库列表第一个
      form.location_id = locations.value[0].id
    }

    form.items = returnItems.map(item => ({
      material_id: item.material_id,
      material_code: item.material_code,
      material_name: item.material_name,
      specification: item.material_specs,
      quantity: item.max_returnable_quantity,
      unit_name: item.unit_name,
      unit_id: item.unit_id || null,
      batch_number: item.batch_number || '',
      location_id: item.default_location_id || form.location_id,
      remark: `生产退料 - 任务${taskCode}`
    }))

    // 设置选中的任务
    selectedTask.value = {
      id: taskId,
      code: taskCode
    }

    ElMessage.success(`已自动加载任务 ${taskCode} 的可退物料`)
  } else {
    ElMessage.warning('该任务暂无可退的领料记录')
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

/* 使用全局 common-styles.css 中的 .statistics-row 和 .stat-card */

.table-toolbar {
  margin-bottom: 10px;
}

.material-info {
  margin-top: 4px;
  color: var(--color-text-regular);
  font-size: 12px;
}

/* 对话框高度 - 页面特定，其他样式使用全局主题 */
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