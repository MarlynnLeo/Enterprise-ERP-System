<!--
/**
 * InventoryInbound.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page inventory-inbound-container">
    <PageHeader title="入库管理" subtitle="管理入库单据与记录">
      <template #actions>
<el-button v-if="canCreate" type="primary" :icon="Plus" @click="handleCreate">新建入库单</el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :model="searchForm"
      :loading="loading"
      @search="handleSearch"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="物料名称">
          <el-input v-model="searchForm.materialName" placeholder="物料名称" clearable @keyup.enter="handleSearch" />
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="入库单号">
          <el-input v-model="searchForm.inboundNo" placeholder="入库单号" clearable />
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
      </template>
    </FinanceQueryCard>

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
        class="w-full"
        v-loading="loading"
        border
      >
        <template #empty>
          <EmptyState description="暂无入库单数据" />
        </template>
        <el-table-column prop="inboundNo" label="入库单号" width="135" />
        <el-table-column prop="inboundType" label="入库类型" width="110">
          <template #default="{ row }">
            <el-tag :type="getInboundTypeTagType(row.inboundType)" size="small">
              {{ getInboundTypeText(row.inboundType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="materialCode" label="物料编码" width="120">
          <template #default="{ row }">
            <span v-if="row.materialCode">{{ row.materialCode }}</span>
            <span v-else-if="row.itemsCount > 1" class="text-muted">多个物料</span>
            <span v-else class="text-disabled">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="materialName" label="物料名称" width="157" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.materialName">{{ row.materialName }}</span>
            <span v-else-if="row.itemsCount > 1" class="text-muted">多个物料</span>
            <span v-else class="text-disabled">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="materialSpecs" label="型号规格" width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.materialSpecs || row.specification">{{ row.materialSpecs || row.specification }}</span>
            <span v-else class="text-disabled">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="firstItemQuantity" label="数量" width="80">
          <template #default="{ row }">
            <span v-if="row.firstItemQuantity">{{ row.firstItemQuantity }}</span>
            <span v-else-if="row.totalQuantity" class="text-primary" :title="`总数量：${row.totalQuantity}`">{{ row.totalQuantity }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="inboundDate" label="入库日期" width="100" />
        <el-table-column prop="locationName" label="仓库" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="operatorName" label="操作人" width="80">
          <template #default="scope">
            {{ scope.row.operatorName || scope.row.operator || '未知' }}
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" width="180" show-overflow-tooltip />
        <el-table-column label="操作" min-width="320" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button class="btn-op-view" type="primary"
                size="small"
                v-permission="'inventory:inbound:view'"
                @click="handleView(row.id)"
              >
                <el-icon><View /></el-icon> 查看
              </el-button>
              <el-popconfirm
                v-if="row.status === 'draft'"
                title="确定要确认该入库单吗？"
                @confirm="handleUpdateStatus(row.id, 'confirmed')"
              >
                <template #reference>
                  <el-button
                    size="small"
                    type="success"
                    v-permission="'inventory:inbound:update'"
                  >
                    <el-icon><Check /></el-icon> 确认
                  </el-button>
                </template>
              </el-popconfirm>
              <el-popconfirm
                v-if="row.status === 'confirmed'"
                title="确定要完成该入库单吗？"
                @confirm="handleUpdateStatus(row.id, 'completed')"
              >
                <template #reference>
                  <el-button
                    size="small"
                    type="primary"
                    v-permission="'inventory:inbound:update'"
                  >
                    <el-icon><Finished /></el-icon> 完成
                  </el-button>
                </template>
              </el-popconfirm>
              <el-popconfirm
                v-if="['draft', 'confirmed'].includes(row.status)"
                title="确定要取消该入库单吗？"
                @confirm="handleUpdateStatus(row.id, 'cancelled')"
                confirm-button-type="danger"
              >
                <template #reference>
                  <el-button
                    size="small"
                    type="danger"
                    v-permission="'inventory:inbound:update'"
                  >
                    <el-icon><Close /></el-icon> 取消
                  </el-button>
                </template>
              </el-popconfirm>
            </div>
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
    <AppDialog
      v-model="dialogVisible"
      :title="getDialogTitle"
      mode="form"
      wide
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="100px"
      >
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="入库类型" prop="inboundType">
              <el-select
                v-model="form.inboundType"
                placeholder="请选择入库类型"
                class="w-full"
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
            <el-form-item label="入库日期" prop="inboundDate">
              <el-date-picker
                v-model="form.inboundDate"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                class="w-full"
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="仓库" prop="locationId">
              <el-select
                v-model="form.locationId"
                placeholder="请选择仓库"
                class="w-full"
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
        <el-row :gutter="20" v-if="form.inboundType === 'production_return'">
          <el-col :span="16">
            <el-form-item label="关联任务" prop="referenceNo">
              <el-input
                v-model="form.referenceNo"
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
              <span>{{ selectedTask.productName }}</span>
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
                v-model="form.remarks"
                type="textarea"
                :rows="1"
                placeholder="请输入备注"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider>{{ form.inboundType === 'production_return' ? '退料明细' : '入库明细' }}</el-divider>
        <el-table
          :data="form.items"
          border
          class="w-full"
          :header-cell-style="{ background: 'var(--color-bg-hover)', color: 'var(--color-text-regular)' }"
          empty-text="请添加入库物料"
        >
          <el-table-column label="物料编码" width="160">
            <template #default="{ row, $index }">
              <el-autocomplete
                :ref="(el) => setMaterialSelectRef(el, $index)"
                v-model="row.materialCode"
                placeholder="输入编码/名称/规格"
                clearable
                :fetch-suggestions="(query, callback) => fetchMaterialSuggestions(query, callback, $index)"
                @select="(item) => handleMaterialSelect(item, $index)"
                @keydown.enter.prevent="handleMaterialEnter($index)"
                @clear="handleMaterialClear($index)"
                class="w-full"
                :trigger-on-focus="true"
                :debounce="300"
                :hide-loading="false"
                :popper-append-to-body="false"
                value-key="code"
              >
                <template #default="{ item }">
                  <div class="option-row">
                    <span class="option-row__code">
                      {{ item.code }}
                    </span>
                    <span class="option-row__name">
                      {{ item.name }}
                    </span>
                    <span class="option-row__meta">
                      {{ item.specs }}
                    </span>
                    <span class="option-row__stock">
                      库存: {{ item.stockQuantity || 0 }}
                    </span>
                  </div>
                </template>
              </el-autocomplete>
            </template>
          </el-table-column>
          <el-table-column label="物料名称" prop="materialName" width="140" show-overflow-tooltip />
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
          <el-table-column label="单位" prop="unitName" width="70" />
          <el-table-column label="批次号" width="150">
            <template #default="{ row }">
              <el-input
                v-model="row.batchNo"
                placeholder="请输入批次号"
                size="small"
              />
            </template>
          </el-table-column>
          <el-table-column label="备注" width="150">
            <template #default="{ row }">
              <el-input
                v-model="row.remarks"
                placeholder="请输入备注"
                size="small"
                maxlength="200"
                clearable />
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="80" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
            <template #default="{ $index }">
              <el-button
                type="danger"
                size="small"
                @click="handleRemoveItem($index)"
                v-permission="dialogType === 'create' ? 'inventory:inbound:create' : 'inventory:inbound:update'"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="add-material mt-10">
          <el-button
            type="primary"
            v-permission="dialogType === 'create' ? 'inventory:inbound:create' : 'inventory:inbound:update'"
            @click="handleAddItem"
          >
            <el-icon><Plus /></el-icon>添加物料
          </el-button>
        </div>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button
            type="primary"
            v-permission="dialogType === 'create' ? 'inventory:inbound:create' : 'inventory:inbound:update'"
            @click="handleSubmit"
            :loading="submitLoading"
          >
            确定
          </el-button>
        </span>
      </template>
        </AppDialog>
    <!-- 查看入库单对话框 -->
    <AppDialog
      v-model="viewDialogVisible"
      title="入库单详情"
      mode="view"
      content-width="wide"
    >
      <div v-loading="viewLoading">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="入库单号">{{ currentInbound.inboundNo }}</el-descriptions-item>
        <el-descriptions-item label="入库日期">{{ currentInbound.inboundDate }}</el-descriptions-item>
        <el-descriptions-item label="仓库">{{ currentInbound.locationName }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentInbound.status)">
            {{ getStatusText(currentInbound.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="操作人">{{ currentInbound.operatorName || currentInbound.operator || '未知' }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ currentInbound.remarks }}</el-descriptions-item>
      </el-descriptions>
      <el-divider>入库明细</el-divider>
      <el-table :data="currentInbound.items" border class="w-full">
        <el-table-column prop="materialCode" label="物料编码" width="120" />
        <el-table-column prop="materialName" label="物料名称" min-width="150" />
        <el-table-column prop="quantity" label="数量" width="100" />
        <el-table-column prop="unitName" label="单位" width="80" />
        <el-table-column prop="batchNo" label="批次号" width="200" />
        <el-table-column prop="remarks" label="备注" min-width="150" />
      </el-table>
      </div>
      <template #footer>
        <el-button @click="viewDialogVisible = false">关闭</el-button>
        <el-button type="primary" @click="handlePrintInbound" :loading="printLoading">打印</el-button>
      </template>
    </AppDialog>
    <!-- 物料选择对话框 -->
    <AppDialog
      v-model="materialDialogVisible"
      title="选择物料"
      mode="form"
      wide
    >
      <el-form :inline="true" class="search-form material-search-form" :model="materialSearchForm">
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
        class="w-full"
        v-loading="materialLoading"
        @selection-change="handleMaterialSelectionChange"
      >
        <el-table-column type="selection" width="55" />
        <el-table-column prop="code" label="物料编码" width="120" />
        <el-table-column prop="name" label="物料名称" width="180" />
        <el-table-column prop="specs" label="规格" width="220" />
        <el-table-column prop="unitName" label="单位" width="80" />
        <el-table-column label="操作" min-width="100" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="handleAddSingleMaterial(row)">
              <el-icon><Check /></el-icon> 选择
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
        </AppDialog>
    <!-- 生产任务选择对话框 -->
    <AppDialog
      v-model="productionTaskDialogVisible"
      title="选择生产任务（生产退料）"
      mode="form"
      wide
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
        class="w-full"
        @row-click="handleTaskRowClick"
        highlight-current-row
      >
        <el-table-column prop="code" label="任务编号" width="150" />
        <el-table-column prop="productCode" label="产品编码" width="130" />
        <el-table-column prop="productName" label="产品名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="quantity" label="生产数量" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getTaskStatusType(row.status)">{{ getTaskStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="100" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
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
          class="w-full"
          @selection-change="handleReturnMaterialSelection"
        >
          <el-table-column type="selection" width="55" :selectable="checkReturnSelectable" />
          <el-table-column prop="materialCode" label="物料编码" width="130" />
          <el-table-column prop="materialName" label="物料名称" min-width="150" show-overflow-tooltip />
          <el-table-column prop="materialSpecs" label="规格" width="150" show-overflow-tooltip />
          <el-table-column prop="issuedQuantity" label="领料数量" width="100" />
          <el-table-column prop="returnedQuantity" label="已退数量" width="100">
            <template #default="{ row }">
              <span :class="row.returnedQuantity > 0 ? 'text-warning' : ''">
                {{ row.returnedQuantity || 0 }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="maxReturnableQuantity" label="可退数量" width="100">
            <template #default="{ row }">
              <span :class="row.maxReturnableQuantity > 0 ? 'text-success' : 'text-muted'">
                {{ row.maxReturnableQuantity }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="defaultLocationName" label="退料仓库" width="120">
            <template #default="{ row }">
              <span>{{ row.defaultLocationName || '未设置' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="退料数量" width="120">
            <template #default="{ row }">
              <el-input-number
                v-model="row.returnQuantity"
                :min="0"
                :max="row.maxReturnableQuantity"
                :precision="2"
                size="small"
                :disabled="row.maxReturnableQuantity <= 0"
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
        </AppDialog>
  </div>
</template>
<script setup>
import { formatLocalDate } from '@/utils/format';
import { ref, reactive, onMounted, computed, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Check, View, Finished, Close } from '@element-plus/icons-vue'
import { inventoryApi, baseDataApi, productionApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { tokenManager } from '@/utils/unifiedStorage'
import { getInboundOutboundStatusText, getInboundOutboundStatusColor } from '@/constants/systemConstants'
import { searchMaterials } from '@/utils/searchConfig'
import { parseListData, parsePaginatedData, parseResponseData } from '@/utils/responseParser'
import { loadLocationOptions } from '@/utils/optionLoaders'
import printService from '@/services/printService'
const route = useRoute()
// 权限store
const authStore = useAuthStore()
const getCurrentUserDisplayName = () => {
  const currentUser = authStore.user || tokenManager.getUser()
  return currentUser?.realName || currentUser?.realName || currentUser?.name || currentUser?.username || ''
}
// 权限计算属性
const canCreate = computed(() => authStore.hasPermission && authStore.hasPermission('inventory:inbound:create'));
// 搜索表单
const searchForm = reactive({
  materialName: '',
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
  inboundDate: '',
  locationId: '',
  operator: '',
  remarks: '',
  status: 'draft',
  items: [],
  // 新增字段：入库类型和关联单据
  inboundType: 'other',
  referenceType: null,
  referenceId: null,
  referenceNo: null
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
  inboundNo: '',
  inboundDate: '',
  locationName: '',
  status: '',
  operator: '',
  operatorName: '',
  remarks: '',
  items: []
})
// 基础数据
const locations = ref([])
const _materials = ref([])
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
  inboundDate: [
    { required: true, message: '请选择入库日期', trigger: 'change' }
  ],
  locationId: [
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
    locations.value = await loadLocationOptions();
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
      materialName: searchForm.materialName,
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
  form.inboundDate = formatLocalDate(new Date())
  form.locationId = ''
  form.inboundType = 'other'
  form.referenceType = null
  form.referenceId = null
  form.referenceNo = null
  selectedTask.value = null
  // 设置当前用户为操作人（使用真实姓名）
  form.operator = getCurrentUserDisplayName()

  form.remarks = ''
  form.status = 'draft'
  form.items = []
  dialogVisible.value = true
}
// ========== 打印功能 ==========
const printLoading = ref(false)
const handlePrintInbound = async () => {
  printLoading.value = true
  try {
    // 业务侧只传 camel；printService 展开 snake 模板占位
    const printData = {
      inboundNo: currentInbound.inboundNo || '',
      inboundDate: currentInbound.inboundDate || '',
      inboundType: getInboundTypeText(currentInbound.inboundType) || '其他入库',
      supplierName: currentInbound.supplierName || '',
      locationName: currentInbound.locationName || '',
      remarks: currentInbound.remarks || '',
      remark: currentInbound.remarks || '',
      operator: currentInbound.operatorName || currentInbound.operator || '',
      items: (currentInbound.items || []).map((item, idx) => ({
        index: idx + 1,
        materialCode: item.materialCode || '',
        materialName: item.materialName || '',
        specification: item.specification || '',
        quantity: parseFloat(item.quantity || 0).toFixed(2),
        unitName: item.unitName || '',
        remarks: item.remarks || '',
        remark: item.remarks || ''
      }))
    }
    const html = await printService.generateByDefaultTemplate('inventory', 'inbound', printData)
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
    // 后端使用 ResponseHandler.success 返回，统一由 parser 解包
    const inboundData = parseResponseData(res)
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
    // 追溯记录由底层 batch_relationships 统一管理，此处只更新入库状态。
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
    materialId: '',
    materialCode: '',
    materialName: '',
    specification: '',
    quantity: '',
    unitName: '',
    unitId: '',
    batchNo: '',
    remarks: ''
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
      includeAll: true
    })
    // 映射搜索结果为自动完成需要的格式
    const suggestions = searchResults.map(item => ({
      value: item.code || '无编码', // value 用于显示在输入框中
      id: item.id,
      code: item.code || '无编码',
      name: item.name || '未命名',
      specs: item.specification || item.specs || '',
      unitName: item.unitName || '个',
      unitId: item.unitId,
      stockQuantity: item.stockQuantity ?? item.stockQuantity ?? 0
    }))
    callback(suggestions)
  } catch {
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
  form.items[index].materialId = materialId
  form.items[index].materialCode = item.code
  form.items[index].materialName = item.name
  form.items[index].specification = item.specs
  form.items[index].unitName = item.unitName
  form.items[index].unitId = item.unitId
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
  if (form.items[index].materialId) {
    const quantityInput = quantityInputRefs.value[index]
    if (quantityInput) {
      quantityInput.focus()
    }
  }
}
// 处理物料清除
const handleMaterialClear = (index) => {
  form.items[index].materialId = ''
  form.items[index].materialCode = ''
  form.items[index].materialName = ''
  form.items[index].specification = ''
  form.items[index].unitName = ''
  form.items[index].unitId = ''
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
  form.referenceType = null
  form.referenceId = null
  form.referenceNo = null
  form.items = []
  selectedTask.value = null
  taskMaterialRecords.value = []
}
// 计算对话框标题
const getDialogTitle = computed(() => {
  if (dialogType.value === 'create') {
    if (form.inboundType === 'production_return') {
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
    const response = await productionApi.getProductionTasks({
      keyword: taskSearchKeyword.value,
      status: 'in_progress,material_issued,completed',
      limit: 50
    })
    productionTasks.value = response.data?.list || response.data || []
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
    const data = parseResponseData(response)
    taskMaterialRecords.value = (data?.records || []).map(r => ({
      ...r,
      materialId: r.materialId ?? r.materialId,
      materialCode: r.materialCode ?? r.materialCode,
      materialName: r.materialName ?? r.materialName,
      materialSpecs: r.materialSpecs ?? r.materialSpecs,
      unitName: r.unitName ?? r.unitName,
      unitId: r.unitId ?? r.unitId,
      batchNo: r.batchNo ?? r.batchNumber,
      issuedQuantity: r.issuedQuantity ?? r.issuedQuantity ?? 0,
      returnedQuantity: r.returnedQuantity ?? r.returnedQuantity ?? 0,
      maxReturnableQuantity: r.maxReturnableQuantity ?? r.maxReturnableQuantity ?? 0,
      defaultLocationId: r.defaultLocationId ?? r.defaultLocationId,
      defaultLocationName: r.defaultLocationName ?? r.defaultLocationName,
      returnQuantity: (r.maxReturnableQuantity ?? r.maxReturnableQuantity ?? 0) > 0
        ? (r.maxReturnableQuantity ?? r.maxReturnableQuantity)
        : 0
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
  return (row.maxReturnableQuantity || 0) > 0
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
  const returnItems = taskMaterialRecords.value.filter(r => r.returnQuantity > 0 && r.maxReturnableQuantity > 0)
  if (returnItems.length === 0) {
    ElMessage.warning('请至少选择一个物料并设置退料数量')
    return
  }
  // 设置关联信息
  form.referenceType = 'production_task'
  form.referenceId = selectedTask.value.id
  form.referenceNo = selectedTask.value.code
  // 自动设置表单仓库：优先使用有默认仓库的物料，否则使用仓库列表第一个
  const locationsWithDefault = returnItems.map(i => i.defaultLocationId).filter(Boolean)
  if (locationsWithDefault.length > 0) {
    form.locationId = locationsWithDefault[0]
  } else if (locations.value.length > 0) {
    form.locationId = locations.value[0].id
  }
  // 构建退料明细（使用物料的默认仓库，没有则使用表单仓库）
  form.items = returnItems.map(item => ({
    materialId: item.materialId,
    materialCode: item.materialCode,
    materialName: item.materialName,
    specification: item.materialSpecs,
    quantity: item.returnQuantity,
    unitName: item.unitName,
    unitId: item.unitId || null,
    batchNo: item.batchNo || '',
    locationId: item.defaultLocationId || form.locationId,
    remarks: `生产退料 - 任务${selectedTask.value.code}`
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

    // 确保所有物料项有 unitId / unitName
    for (const item of form.items) {
      if (!item.unitId) {
        ElMessage.warning('存在物料没有指定单位，请检查')
        return
      }

      // 确保有 unitName
      if (!item.unitName && item.unitId) {
        const unit = units.value.find(u => u.id === item.unitId)
        if (unit) {
          item.unitName = unit.name
        }
      }
    }

    // 纯 camel 提交（后端 inventoryInboundMap.fromApi）
    const submitData = {
      inboundDate: form.inboundDate,
      locationId: form.locationId,
      operator: form.operator,
      remarks: form.remarks,
      status: form.status,
      inboundType: form.inboundType,
      referenceType: form.referenceType,
      referenceId: form.referenceId,
      referenceNo: form.referenceNo,
      items: form.items.map(item => ({
        materialId: item.materialId,
        quantity: item.quantity,
        unitId: item.unitId,
        batchNo: item.batchNo,
        locationId: item.locationId || form.locationId,
        remarks: item.remarks
      }))
    };

    // 根据对话框类型决定是创建还是更新
    if (dialogType.value === 'create') {
      await inventoryApi.createInbound(submitData)
      ElMessage.success('入库单创建成功')
    } else {
      await inventoryApi.updateInbound(form.id, submitData)
      ElMessage.success('入库单更新成功')
    }
    // 追溯关系由后端入库流程统一写入 batch_relationships，前端不再重复发起旧追溯接口。

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

      // 确保每个物料都有 unitId
      const unitId = detailedMaterial.unitId || (units.value.length > 0 ? units.value[0].id : null);
      let unitName = '';

      // 查找单位名称
      if (unitId) {
        const unit = units.value.find(u => u.id === unitId);
        if (unit) {
          unitName = unit.name;
        }
      }

      form.items.push({
        materialId: detailedMaterial.id,
        materialCode: detailedMaterial.code,
        materialName: detailedMaterial.name,
        specification: detailedMaterial.specs,
        quantity: 0,
        unitId: unitId,
        unitName: unitName,
        batchNo: '',
        remarks: ''
      });
    } catch (error) {
      console.error(`获取物料${material.id}详情失败:`, error);

      // 使用列表中的简略信息
      const unitId = material.unitId || (units.value.length > 0 ? units.value[0].id : null);
      let unitName = material.unitName || '';

      // 查找单位名称
      if (unitId && !unitName) {
        const unit = units.value.find(u => u.id === unitId);
        if (unit) {
          unitName = unit.name;
        }
      }

      form.items.push({
        materialId: material.id,
        materialCode: material.code,
        materialName: material.name,
        specification: material.specs,
        quantity: 0,
        unitId: unitId,
        unitName: unitName,
        batchNo: '',
        remarks: ''
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
    const unitId = detailedMaterial.unitId || (units.value.length > 0 ? units.value[0].id : null);
    let unitName = '';

    if (unitId) {
      const unit = units.value.find(u => u.id === unitId);
      if (unit) {
        unitName = unit.name;
      }
    }

    // 添加到物料列表
    form.items.push({
      materialId: detailedMaterial.id,
      materialCode: detailedMaterial.code,
      materialName: detailedMaterial.name,
      specification: detailedMaterial.specs,
      quantity: 0,
      unitId: unitId,
      unitName: unitName,
      batchNo: '',
      remarks: ''
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
  searchForm.materialName = '';
  searchForm.inboundNo = '';
  searchForm.locationId = '';
  searchForm.dateRange = [];
  pagination.currentPage = 1;
  loadInbounds();
};
// 更新统计数据 - 从服务端获取真实统计
const updateStats = async () => {
  try {
    const params = {
      materialName: searchForm.materialName || undefined,
      inboundNo: searchForm.inboundNo || undefined,
      locationId: searchForm.locationId || undefined
    };
    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0];
      params.endDate = searchForm.dateRange[1];
    }
    const response = await inventoryApi.getInboundStatistics(params);
    const stats = parseResponseData(response, {});
    inboundStats.total = Number(stats.total) || 0;
    inboundStats.draftCount = Number(stats.draftCount) || 0;
    inboundStats.confirmedCount = Number(stats.confirmedCount) || 0;
    inboundStats.completedCount = Number(stats.completedCount) || 0;
    inboundStats.cancelledCount = Number(stats.cancelledCount) || 0;
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
  form.inboundType = 'production_return'
  form.referenceType = 'production_task'
  form.referenceId = parseInt(taskId)
  form.referenceNo = taskCode
  // 加载任务领料记录
  await loadTaskMaterialRecords(taskId)
  // 如果有领料记录，自动添加到明细
  if (taskMaterialRecords.value.length > 0) {
    // 默认选择所有可退的物料（使用物料的默认仓库）
    const returnItems = taskMaterialRecords.value.filter(r => r.maxReturnableQuantity > 0)
    // 自动设置表单仓库：优先使用有默认仓库的物料，否则使用仓库列表第一个
    const locationsWithDefault = returnItems.map(i => i.defaultLocationId).filter(Boolean)
    if (locationsWithDefault.length > 0) {
      // 使用第一个有默认仓库的物料的仓库
      form.locationId = locationsWithDefault[0]
    } else if (locations.value.length > 0) {
      // 没有任何物料有默认仓库，使用仓库列表第一个
      form.locationId = locations.value[0].id
    }
    form.items = returnItems.map(item => ({
      materialId: item.materialId,
      materialCode: item.materialCode,
      materialName: item.materialName,
      specification: item.materialSpecs,
      quantity: item.maxReturnableQuantity,
      unitName: item.unitName,
      unitId: item.unitId || null,
      batchNo: item.batchNo || '',
      locationId: item.defaultLocationId || form.locationId,
      remarks: `生产退料 - 任务${taskCode}`
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
.table-toolbar {
  margin-bottom: 10px;
}
.material-info {
  margin-top: 4px;
  color: var(--color-text-regular);
  font-size: 12px;
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
