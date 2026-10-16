<!--
/**
 * PurchaseRequisitions.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page purchase-requisitions-container">
    <PageHeader title="采购申请管理" subtitle="提交采购申请后自动生成采购订单">
      <template #actions>
<el-button type="primary" :icon="Plus" v-permission="'purchase:requisitions:create'" @click="showCreateDialog">新建采购申请</el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :model="searchForm"
      :loading="loading"
      @search="loadRequisitions(1)"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="关键字">
          <el-input
            v-model="searchForm.keyword"
            placeholder="申请单号、合同编码或物料"
            clearable
            @clear="loadRequisitions(1)"
            @keyup.enter="loadRequisitions(1)"
          ></el-input>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="状态">
          <el-select
            v-model="searchForm.status"
            placeholder="请选择状态"
            clearable
            @change="loadRequisitions(1)"
          >
            <el-option label="草稿" value="draft"></el-option>
            <el-option label="待提交" value="submitted"></el-option>
            <el-option label="已生成订单" value="completed"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="申请人">
          <el-select
            v-model="searchForm.requester"
            placeholder="请选择申请人"
            clearable
            filterable
            @change="loadRequisitions(1)"
          >
            <el-option
              v-for="item in operators"
              :key="item.username"
              :label="item.realName || item.username"
              :value="item.username"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="申请日期">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            @change="loadRequisitions(1)"
          ></el-date-picker>
        </el-form-item>
      </template>
    </FinanceQueryCard>
    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ requisitionStats.total || 0 }}</div>
        <div class="stat-label">申请单总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ requisitionStats.draftCount || 0 }}</div>
        <div class="stat-label">草稿状态</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ requisitionStats.submittedCount || 0 }}</div>
        <div class="stat-label">待提交</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ requisitionStats.completedCount || 0 }}</div>
        <div class="stat-label">已生成订单</div>
      </el-card>
    </div>
    <!-- 采购申请列表 -->
    <el-card class="data-card">
      <el-table
        ref="requisitionTableRef"
        v-loading="loading"
        :data="requisitions"
        border
        class="table-row-click w-full"
        @selection-change="handleSelectionChange"
      
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => viewRequisition(row))">
        <el-table-column type="selection" width="55" fixed="left"></el-table-column>
        <el-table-column prop="requisitionNumber" label="申请单号" min-width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="contractCode" label="合同编码" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.contractCode || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="requestDate" label="申请日期" min-width="110" show-overflow-tooltip>
          <template #default="{ row }">
            {{ formatDate(row.requestDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="requester" label="申请人" min-width="100" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.realName || row.requester || '未知' }}
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="100" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag v-if="row.isFullyOrdered" type="success">已生成订单</el-tag>
            <el-tag v-else-if="row.isPartiallyOrdered" type="warning">部分生成订单</el-tag>
            <el-tag v-else :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remarks" label="备注" min-width="350" show-overflow-tooltip></el-table-column>
        <el-table-column label="创建时间" min-width="140" prop="createdAt" show-overflow-tooltip>
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="360" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="{ row }">
            
            <el-button
              v-if="canEditRequisition(row)"
              size="small"
              type="primary"
              v-permission="'purchase:requisitions:update'"
              @click="editRequisition(row)"
            >
              编辑
            </el-button>
            <el-button
              v-if="row.status === 'draft'"
              size="small"
              type="danger"
              v-permission="'purchase:requisitions:delete'"
              @click="confirmDelete(row)"
            >
              删除
            </el-button>
            <el-button
              v-if="canSubmitRequisition(row)"
              size="small"
              type="success"
              v-permission="'purchase:requisitions:update'"
              :loading="submittingIds.includes(row.id)"
              :disabled="batchLoading"
              @click="submitRequisition(row)"
            >
              {{ row.isPartiallyOrdered ? '生成剩余订单' : '提交' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="PAGE_SIZE_OPTIONS"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        ></el-pagination>
      </div>
    </el-card>
    <!-- 创建/编辑申请对话框 -->
    <AppDialog
      v-model="requisitionDialog.visible"
      :title="requisitionDialog.isEdit ? '编辑采购申请' : '新建采购申请'"
      mode="form"
      width="850px"
    >
      <div v-loading="requisitionDialog.loading">
        <el-form
          ref="requisitionFormRef"
          :model="requisitionForm"
          :rules="requisitionRules"
          label-width="100px"
        >
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="申请日期" prop="requestDate">
              <el-date-picker
                v-model="requisitionForm.requestDate"
                type="date"
                placeholder="选择日期"
                class="w-full"
                value-format="YYYY-MM-DD"
              ></el-date-picker>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="合同编码">
              <el-input
                v-model="requisitionForm.contractCode"
                placeholder="请输入关联的销售订单合同编码（选填）"
                clearable
                class="w-full"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注" prop="remarks">
          <el-input
            v-model="requisitionForm.remarks"
            type="textarea"
            :rows="2"
            placeholder="请输入备注"
            class="w-full"
          ></el-input>
        </el-form-item>
        <el-divider content-position="center">申请物料</el-divider>
        <div class="materials-list">
          <el-table :data="requisitionForm.materials" border class="w-full">
            <el-table-column label="序号" type="index" width="55"></el-table-column>
            <el-table-column label="物料编码" width="150" show-overflow-tooltip>
              <template #default="{ row, $index }">
                <el-autocomplete
                  :ref="(el) => setMaterialSelectRef(el, $index)"
                  v-model="row.materialCode"
                  placeholder="输入物料编码"
                  clearable
                  :fetch-suggestions="(query, callback) => fetchMaterialSuggestions(query, callback, $index)"
                  @select="(item) => handleMaterialSelect(item, $index)"
                  @keydown.enter="handleMaterialEnter($index)"
                  class="w-full"
                  :trigger-on-focus="false"
                  :debounce="300"
                >
                  <template #default="{ item }">
                    <div class="flex-row gap-12 py-4">
                      <span class="option-code-fixed">{{ item.code }}</span>
                      <span class="text-regular text-md flex-1">{{ item.name }}</span>
                      <span v-if="item.specs" class="text-muted text-sm">{{ item.specs }}</span>
                    </div>
                  </template>
                </el-autocomplete>
              </template>
            </el-table-column>
            <el-table-column label="物料名称" width="130" show-overflow-tooltip>
              <template #default="scope">
                {{ scope.row.materialName || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="规格" width="180" show-overflow-tooltip>
              <template #default="scope">
                {{ scope.row.specification || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="单位" min-width="55" show-overflow-tooltip>
              <template #default="scope">
                {{ scope.row.unit || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="数量" width="120" show-overflow-tooltip>
              <template #default="{ row, $index }">
                <el-input
                  :ref="(el) => setQuantityInputRef(el, $index)"
                  v-model="row.quantity"
                  placeholder="数量"
                  @keydown.enter="handleQuantityEnter($index)"
                ></el-input>
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="60" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
              <template #default="{ $index }">
                <el-button
                  type="danger"
                  size="small"
                  @click="removeMaterial($index)"
                  v-permission="requisitionDialog.isEdit ? 'purchase:requisitions:update' : 'purchase:requisitions:create'"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="add-material mt-10">
            <el-button type="primary" v-permission="requisitionDialog.isEdit ? 'purchase:requisitions:update' : 'purchase:requisitions:create'" @click="addMaterialRow">
              <el-icon><Plus /></el-icon>添加物料
            </el-button>
          </div>
        </div>
      </el-form>
      </div>
      <template #footer>
        <el-button @click="requisitionDialog.visible = false" :disabled="requisitionDialog.loading">取消</el-button>
        <el-button v-permission="requisitionDialog.isEdit ? 'purchase:requisitions:update' : 'purchase:requisitions:create'" @click="submitForm(false)" :disabled="requisitionDialog.loading">保存草稿</el-button>
        <el-button v-if="authStore.hasPermission('purchase:requisitions:update')" v-permission="requisitionDialog.isEdit ? 'purchase:requisitions:update' : 'purchase:requisitions:create'" type="primary" @click="submitForm(true)" :loading="requisitionDialog.loading">提交并生成采购订单</el-button>
      </template>
        </AppDialog>
    <!-- 采购申请详情对话框 -->
    <AppDialog
      v-model="viewDialog.visible"
      title="采购申请详情"
      mode="view"
      width="850px"
      :detail-navigation="requisitionViewNavigation"
    >
      <div v-loading="viewDialog.loading" class="requisition-view">
        <el-descriptions border :column="2" class="requisition-view-desc">
        <el-descriptions-item label="申请单号">{{ viewData.requisitionNumber || '未知' }}</el-descriptions-item>
        <el-descriptions-item label="申请日期">{{ formatDate(viewData.requestDate) }}</el-descriptions-item>
        <el-descriptions-item label="申请人">
          {{ viewData.realName || viewData.requester || '未知' }}
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(viewData.status || 'draft')">{{ getStatusText(viewData.status || 'draft') }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDate(viewData.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ formatDate(viewData.updatedAt) }}</el-descriptions-item>
        <el-descriptions-item label="合同编码">{{ viewData.contractCode || '无' }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ viewData.remarks || '无' }}</el-descriptions-item>
      </el-descriptions>
      <el-divider content-position="center">申请物料</el-divider>
      <el-table :data="viewData.materials || []" border class="w-full requisition-view-table">
        <el-table-column label="物料编码" prop="materialCode" min-width="110" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.materialCode || '未知' }}
          </template>
        </el-table-column>
        <el-table-column label="物料名称" prop="materialName" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.materialName || '未知' }}
          </template>
        </el-table-column>
        <el-table-column label="规格" prop="specification" min-width="150" show-overflow-tooltip></el-table-column>
        <el-table-column label="单位" prop="unit" min-width="60" show-overflow-tooltip></el-table-column>
        <el-table-column label="供应商" prop="supplierName" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.supplierName && row.supplierName !== '暂无设置供应商' ? row.supplierName : (row.supplierName || '暂无设置供应商') }}
          </template>
        </el-table-column>
        <el-table-column label="数量" min-width="100" show-overflow-tooltip>
          <template #default="{ row }">
            {{ parseFloat(row.quantity || 0).toFixed(2) }}
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!viewData.materials || viewData.materials.length === 0" class="no-data-message">
        暂无物料数据
      </div>
      </div>
      <template #footer>
        <el-button @click="viewDialog.visible = false">关闭</el-button>
        <el-button type="primary" @click="handlePrintRequisition" :loading="printLoading">打印</el-button>
      </template>
    </AppDialog>
    <!-- 浮动批量操作栏 -->
    <Transition name="slide-up">
      <div v-if="selectedRequisitions.length > 0" class="floating-batch-bar">
        <div class="batch-info">
          <el-icon><Select /></el-icon>
          <span>已选中 <strong>{{ selectedRequisitions.length }}</strong> 个申请单</span>
        </div>
        <div class="batch-buttons">
          <el-button
            v-if="canBatchSubmit"
            v-permission="'purchase:requisitions:update'"
            type="success"
            @click="handleBatchSubmit"
            :loading="batchLoading"
          >
            <el-icon><Promotion /></el-icon> 批量提交
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
import { PAGE_SIZE_OPTIONS } from '@/config/pagination'
import { getThemeDefaultPageSize } from '@/utils/themePageSize'
import { handleTableRowView } from '@/utils/tableRowView'
import { formatLocalDate } from '@/utils/format';
import { ref, reactive, onMounted, onActivated, nextTick, computed } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index';
import { purchaseApi, baseDataApi } from '@/api';
import { Plus, Select, Promotion, Close } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import { searchMaterials } from '@/utils/searchConfig';
import { parseDataObject, parsePaginatedData } from '@/utils/responseParser';
import { useListDetailNavigation } from '@/composables/useListDetailNavigation';
import { loadUserListOptions } from '@/utils/optionLoaders';
import { formatDate } from '@/utils/helpers/dateUtils'
import { getApiErrorMessage } from '@/utils/errorHandler'
import printService from '@/services/printService'
// 初始化 authStore

const authStore = useAuthStore();
const route = useRoute();
// 搜索表单

const searchForm = reactive({
  keyword: '',  // 申请单号或合同编码关键字
  status: '',
  requester: '',  // 申请人
  dateRange: null
});
// 分页设置

const pagination = reactive({
  page: 1,
  pageSize: getThemeDefaultPageSize(10),
  total: 0
});
// 申请单列表

const requisitions = ref([]);
const {
  previousItem: previousViewRequisition,
  nextItem: nextViewRequisition,
  hasPrevious: hasPreviousViewRequisition,
  hasNext: hasNextViewRequisition,
  setCurrentItem: setCurrentViewRequisition
} = useListDetailNavigation(requisitions);
const loading = ref(false);
const operators = ref([]);  // 操作人列表
// 批量操作相关

const requisitionTableRef = ref(null);
const selectedRequisitions = ref([]);
const batchLoading = ref(false);
const submittingIds = ref([]);
// 申请单对话框

const requisitionDialog = reactive({
  visible: false,
  isEdit: false,
  loading: false
});
// 申请单表单

const requisitionFormRef = ref(null);
const requisitionForm = reactive({
  id: null,
  requestDate: formatLocalDate(new Date()),
  contractCode: '',  // 合同编码（选填）
  remarks: '',
  materials: []
});
// 申请单表单验证规则

const requisitionRules = {
  requestDate: [{ required: true, message: '请选择申请日期', trigger: 'change' }],
  materials: [
    {
      type: 'array',
      required: true,
      message: '请至少选择一个物料',
      trigger: 'change',
      validator: (rule, value) => value.length > 0
    }
  ]
};
// 查看详情对话框

const viewDialog = reactive({
  visible: false,
  loading: false
});
// 查看详情数据

const viewData = reactive({
  requisition_number: '',
  request_date: '',
  requester: '',
  status: '',
  remarks: '',
  created_at: '',
  updated_at: '',
  materials: []
});
// 申请单统计数据

const requisitionStats = ref({
  total: 0,
  draftCount: 0,
  submittedCount: 0,
  completedCount: 0
});
// 加载申请单列表

const loadRequisitions = async (page = pagination.page) => {
  loading.value = true;
  try {
    const params = {
      page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,  // 申请单号或合同编码关键字
      status: searchForm.status || undefined,
      requester: searchForm.requester || undefined  // 申请人
    };
    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0];
      params.endDate = searchForm.dateRange[1];
    }
    const response = await purchaseApi.getRequisitions(params);
    const pageData = parsePaginatedData(response, { enableLog: false });

    requisitions.value = pageData.list;
    pagination.total = Number(pageData.total ?? 0);
    pagination.page = Number(pageData.page ?? 1);
    pagination.pageSize = Number(pageData.pageSize ?? pagination.pageSize);

    requisitionStats.value = pageData.statistics || {};
  } catch (error) {
    console.error('加载采购申请列表失败:', error);
    if (error.response) {
      console.error('错误响应状态:', error.response.status);
      console.error('错误响应数据:', error.response.data);
    }
    ElMessage.error(`加载采购申请列表失败：${getApiErrorMessage(error, '请稍后重试')}`);

    // 加载失败时设置空数据
    requisitions.value = [];
    pagination.total = 0;
    requisitionStats.value = {};
  } finally {
    loading.value = false;
  }
};
// 搜索重置

const resetSearch = () => {
  searchForm.keyword = '';
  searchForm.status = '';
  searchForm.requester = '';
  searchForm.dateRange = null;
  loadRequisitions(1);
};
// 加载操作人列表

const loadOperators = async () => {
  try {
    operators.value = await loadUserListOptions();
  } catch (error) {
    console.error('加载操作人列表失败:', error);
    operators.value = [];
  }
};
// 分页大小变更处理

const handleSizeChange = (newSize) => {
  pagination.pageSize = newSize;
  loadRequisitions(1);
};
// 页码变更处理

const handleCurrentChange = (newPage) => {
  loadRequisitions(newPage);
};
// 获取状态文本

const getStatusText = (status) => ({
  draft: '草稿',
  submitted: '待提交',
  pending: '待提交',
  approved: '待提交',
  rejected: '待提交',
  completed: '已生成订单',
  cancelled: '已取消'
}[status] || status);
// 获取状态类型（用于标签样式）

const getStatusType = (status) => status === 'completed' ? 'success' : status === 'draft' || status === 'cancelled' ? 'info' : 'warning';

const canSubmitRequisition = (row) => !row.isFullyOrdered && ['draft', 'submitted', 'pending', 'approved', 'rejected', 'completed'].includes(row.status);
const canEditRequisition = (row) => !row.isFullyOrdered && !row.isPartiallyOrdered && ['draft', 'submitted', 'pending', 'approved', 'rejected'].includes(row.status);

const notifyOrdersGenerated = (response) => {
  const result = parseDataObject(response, { enableLog: false }) || {};
  const orders = result.generatedOrders || [];
  ElMessage.success(orders.length
    ? `提交成功，已自动生成 ${orders.length} 个采购订单：${orders.map(order => order.orderNo).join('、')}`
    : '提交成功，采购订单已生成');
};

const getRequisitionErrorMessage = (error, fallback) => {
  const message = getApiErrorMessage(error, fallback)
  const invalidMaterial = message.match(/请购物料不存在或已停用[：:]\s*(.+)$/)
  if (invalidMaterial) {
    return `申请单中的物料编码“${invalidMaterial[1]}”已不存在或已停用，请编辑申请单后重新选择有效物料。`
  }
  return message
}
// 显示创建对话框

const showCreateDialog = () => {
  requisitionDialog.isEdit = false;
  requisitionForm.id = null;
  requisitionForm.requestDate = formatLocalDate(new Date());
  requisitionForm.contractCode = '';
  requisitionForm.remarks = '';
  requisitionForm.materials = [];
  // 自动添加一行空的物料
  addMaterialRow();
  requisitionDialog.visible = true;
};

const firstQueryValue = (value) => Array.isArray(value) ? value[0] : value;

const openQuickPurchaseDialogFromQuery = () => {
  if (firstQueryValue(route.query.source) !== 'quick_purchase') return;

  const materialId = firstQueryValue(route.query.materialId);
  const materialCode = firstQueryValue(route.query.materialCode);
  const materialName = firstQueryValue(route.query.materialName);
  if (!materialId && !materialCode && !materialName) return;

  const currentStock = Number(firstQueryValue(route.query.current_stock));
  const minStock = Number(firstQueryValue(route.query.minStock));
  const shortageQty = Number.isFinite(currentStock) && Number.isFinite(minStock)
    ? Math.max(minStock - currentStock, 1)
    : 1;

  showCreateDialog();
  requisitionForm.remarks = '库存快速申购';
  Object.assign(requisitionForm.materials[0], {
    materialId: materialId ? Number(materialId) : null,
    materialCode: materialCode || '',
    materialName: materialName || '',
    unit: firstQueryValue(route.query.unit) || '',
    quantity: Number(shortageQty.toFixed(2))
  });
};
// 编辑申请单

const editRequisition = async (row) => {
  requisitionDialog.isEdit = true;
  requisitionDialog.visible = true;
  requisitionDialog.loading = true;
  try {
    const response = await purchaseApi.getRequisition(row.id);
    const detail = parseDataObject(response, { enableLog: false }) || {};

    requisitionForm.id = detail.id;
    requisitionForm.requestDate = detail.requestDate;
    requisitionForm.contractCode = detail.contractCode || '';
    requisitionForm.remarks = detail.remarks;

    // 转换材料格式
    requisitionForm.materials = (detail.materials || []).map(item => ({
      materialId: item.materialId,
      materialCode: item.materialCode,
      materialName: item.materialName,
      specification: item.specification,
      unit: item.unit,
      unitId: item.unitId,
      quantity: Number(item.quantity)
    }));

    requisitionDialog.isEdit = true;
  } catch (error) {
    console.error('获取采购申请详情失败:', error);
    ElMessage.error(`获取采购申请详情失败：${getApiErrorMessage(error, '请稍后重试')}`);
    requisitionDialog.visible = false;
  } finally {
    requisitionDialog.loading = false;
  }
};
// 提交表单

const submitForm = async (submitImmediately = false) => {
  if (!requisitionFormRef.value || requisitionDialog.loading) return;
  if (submitImmediately && !authStore.hasPermission('purchase:requisitions:update')) return;

  requisitionDialog.loading = true;
  let savedDraft = false;
  try {
    const valid = await requisitionFormRef.value.validate().catch(() => false);
    if (!valid) return;

    // 先尝试获取最新的用户信息
    try {
      await authStore.fetchUserProfile();
    } catch {
    }

    const processedMaterials = requisitionForm.materials.map(material => ({
      materialId: material.materialId || null,
      materialCode: material.materialCode || '',
      materialName: material.materialName || '',
      specification: material.specification || '',
      unit: material.unit || '',
      unitId: material.unitId || null,
      quantity: material.quantity || 0
    }));

    const formData = {
      requestDate: requisitionForm.requestDate,
      contractCode: requisitionForm.contractCode || null,
      remarks: requisitionForm.remarks,
      materials: processedMaterials,
      requester: authStore.user?.realName || authStore.realName || '',
      real_name: authStore.user?.realName || ''
    };

    if (requisitionDialog.isEdit) {
      await purchaseApi.updateRequisition(requisitionForm.id, formData);
    } else {
      const response = await purchaseApi.createRequisition(formData);
      const created = parseDataObject(response, { enableLog: false }) || {};
      requisitionForm.id = created.id;
      requisitionDialog.isEdit = true;
    }
    savedDraft = true;

    if (submitImmediately) {
      const response = await purchaseApi.submitRequisition(requisitionForm.id);
      notifyOrdersGenerated(response);
    } else {
      ElMessage.success('采购申请草稿已保存');
    }

    requisitionDialog.visible = false;
    await loadRequisitions();
  } catch (error) {
    const action = submitImmediately && savedDraft ? '提交失败，草稿已保存' : '保存采购申请失败';
    ElMessage.error(`${action}：${getRequisitionErrorMessage(error, '请检查申请内容后重试')}`);
    if (savedDraft) {
      await loadRequisitions();
    }
  } finally {
    requisitionDialog.loading = false;
  }
};
// 移除物料

const removeMaterial = (index) => {
  requisitionForm.materials.splice(index, 1);
};
// 添加物料行

const addMaterialRow = () => {
  requisitionForm.materials.push({
    materialId: null,
    materialCode: '',
    materialName: '',
    specification: '',
    unit: '',
    unitId: null,
    quantity: ''
  });
};
// 过滤物料

const _materialsLoading = ref(false);
const filteredProducts = ref([]);
// 组件引用管理

const materialSelectRefs = ref({});
const quantityInputRefs = ref({});
// 设置物料选择框引用

const setMaterialSelectRef = (el, index) => {
  if (el) {
    materialSelectRefs.value[index] = el;
  }
};
// 设置数量输入框引用

const setQuantityInputRef = (el, index) => {
  if (el) {
    quantityInputRefs.value[index] = el;
  }
};
// 获取物料建议 - 使用统一搜索函数

const fetchMaterialSuggestions = async (query, callback) => {
  if (!query || query.length < 1) {
    callback([]);
    return;
  }
  try {
    // 使用统一的搜索函数

    const searchResults = await searchMaterials(baseDataApi, query.trim(), {
      includeAll: true
    });
    // 格式化数据供自动完成使用

    const suggestions = searchResults.map(item => ({
      value: item.code || '无编码',
      code: item.code || '无编码',
      name: item.name || '未命名',
      specs: item.specification || item.specs || '',
      stockQuantity: item.stockQuantity || 0,
      id: item.id,
      unitName: item.unitName || '个',
      unitId: item.unitId
    }));
    // 保存到全局变量供Enter键使用
    filteredProducts.value = suggestions;
    callback(suggestions);
  } catch (error) {
    ElMessage.error(`搜索物料失败：${getApiErrorMessage(error, '请稍后重试')}`);
    callback([]);
  }
};
// 处理自动完成选择

const handleMaterialSelect = (item, index) => {
  requisitionForm.materials[index].materialId = item.id;
  requisitionForm.materials[index].materialCode = item.code;
  requisitionForm.materials[index].materialName = item.name;
  requisitionForm.materials[index].specification = item.specs;
  requisitionForm.materials[index].unit = item.unitName;
  requisitionForm.materials[index].unitId = item.unitId;

  // 选择物料后，自动聚焦到数量输入框
  nextTick(() => {
    const quantityInput = quantityInputRefs.value[index];
    if (quantityInput) {
      quantityInput.focus();
    }
  });
};
// 处理物料选择（保留兼容性）

const _handleMaterialChange = (materialCode, index) => {
  if (!materialCode) {
    // 清空物料信息
    requisitionForm.materials[index].materialId = null;
    requisitionForm.materials[index].materialName = '';
    requisitionForm.materials[index].specification = '';
    requisitionForm.materials[index].unit = '';
    requisitionForm.materials[index].unitId = null;
    return;
  }

  // 从过滤结果中找到选中的物料

  const selectedMaterial = filteredProducts.value.find(m =>
    m.code === materialCode
  );
  if (selectedMaterial) {
    handleMaterialSelect(selectedMaterial, index);
  }
};
// 处理物料编码Enter键

const handleMaterialEnter = (index) => {
  // 如果有搜索结果，自动选择第一个
  if (filteredProducts.value.length > 0) {
    const firstMaterial = filteredProducts.value[0];
    handleMaterialSelect(firstMaterial, index);
  }
};
// 处理数量Enter键

const handleQuantityEnter = (_index) => {
  // 添加新的物料行
  addMaterialRow();

  // 聚焦到新行的物料选择框
  nextTick(() => {
    const newIndex = requisitionForm.materials.length - 1;
    const materialSelect = materialSelectRefs.value[newIndex];
    if (materialSelect) {
      materialSelect.focus();
    }
  });
};
// 查看采购申请详情

const viewRequisition = async (row) => {
  viewDialog.visible = true;
  viewDialog.loading = true;
  try {
    let response;
    try {
      response = await purchaseApi.getRequisition(row.id);
    } catch (err) {
      console.error('获取申请详情失败:', err);
      // 使用行数据作为备用
      response = {
        ...row,
        materials: []
      };
    }

    // 清空之前的数据
    Object.keys(viewData).forEach(key => {
      if (typeof viewData[key] === 'object' && !Array.isArray(viewData[key])) {
        viewData[key] = {};
      } else if (Array.isArray(viewData[key])) {
        viewData[key] = [];
      } else {
        viewData[key] = '';
      }
    });

    // 填充新数据

    const detail = parseDataObject(response, { enableLog: false }) || {};
    Object.assign(viewData, detail);
    setCurrentViewRequisition(row);

  } catch (error) {
    console.error('获取采购申请详情失败:', error);
    ElMessage.error(`获取采购申请详情失败：${getApiErrorMessage(error, '请稍后重试')}`);
    viewDialog.visible = false;
  } finally {
    viewDialog.loading = false;
  }
};

const handleViewPrevious = () => {
  if (previousViewRequisition.value) viewRequisition(previousViewRequisition.value);
};

const handleViewNext = () => {
  if (nextViewRequisition.value) viewRequisition(nextViewRequisition.value);
};

const requisitionViewNavigation = computed(() => ({
  hasPrevious: hasPreviousViewRequisition.value,
  hasNext: hasNextViewRequisition.value,
  loading: viewDialog.loading,
  previous: handleViewPrevious,
  next: handleViewNext
}));
// 批量操作相关计算属性

const canBatchSubmit = computed(() => {
  if (selectedRequisitions.value.length === 0) return false;
  return selectedRequisitions.value.every(canSubmitRequisition);
});
// 批量操作方法

const handleSelectionChange = (selection) => {
  selectedRequisitions.value = selection;
};
const clearSelection = () => {
  if (requisitionTableRef.value) {
    requisitionTableRef.value.clearSelection();
  }
  selectedRequisitions.value = [];
};
const handleBatchSubmit = async () => {
  if (!authStore.hasPermission('purchase:requisitions:update') || batchLoading.value || submittingIds.value.length > 0 || !canBatchSubmit.value) return;
  batchLoading.value = true;
  try {
    await ElMessageBox.confirm(
      `确定要提交选中的 ${selectedRequisitions.value.length} 个申请单并自动生成采购订单吗？`,
      '批量提交并生成采购订单',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );
    let successCount = 0;
    let failCount = 0;
    let firstFailureMessage = '';
    for (const req of selectedRequisitions.value) {
      try {
        await purchaseApi.submitRequisition(req.id);
        successCount++;
      } catch (error) {
        console.error(`申请单 ${req.requisitionNumber} 提交失败:`, error);
        failCount++;
        if (!firstFailureMessage) {
          firstFailureMessage = getRequisitionErrorMessage(error, '请检查申请内容后重试');
        }
      }
    }
    if (successCount > 0) {
      if (failCount > 0) {
        ElMessage.warning(
          `已为 ${successCount} 个申请单生成采购订单，${failCount} 个失败：${firstFailureMessage}`
        );
      } else {
        ElMessage.success(`已为 ${successCount} 个申请单生成采购订单`);
      }
      clearSelection();
      await loadRequisitions();
    } else {
      ElMessage.error(`批量提交失败：${firstFailureMessage || '请检查申请内容后重试'}`);
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('批量提交失败:', error);
    }
  } finally {
    batchLoading.value = false;
  }
};
const submitRequisition = async (row) => {
  if (!authStore.hasPermission('purchase:requisitions:update') || batchLoading.value || submittingIds.value.includes(row.id) || !canSubmitRequisition(row)) return;
  submittingIds.value.push(row.id);
  try {
    const response = await purchaseApi.submitRequisition(row.id);
    notifyOrdersGenerated(response);
    await loadRequisitions();
  } catch (error) {
    ElMessage.error(`提交失败：${getRequisitionErrorMessage(error, '请检查申请内容后重试')}`);
  } finally {
    submittingIds.value = submittingIds.value.filter(id => id !== row.id);
  }
};
// 确认删除

const confirmDelete = (row) => {
  ElMessageBox.confirm(
    '确定要删除此采购申请吗？此操作无法撤销。',
    '删除确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  )
    .then(async () => {
      try {
        await purchaseApi.deleteRequisition(row.id);
        ElMessage.success('删除成功');
        loadRequisitions();
      } catch (error) {
        console.error('删除失败:', error);
        ElMessage.error(`删除失败：${getApiErrorMessage(error, '请稍后重试')}`);
      }
    })
    .catch(() => {});
};
// 格式化日期
// formatDate: 使用公共实现
// 页面加载时获取数据
onMounted(async () => {
  // 立即显示加载状态
  loading.value = true;
  // 并行加载数据，提高加载速度
  try {
    await Promise.allSettled([
      loadRequisitions(1),
      loadOperators(),
      authStore.fetchUserProfile(false) // 不获取权限信息，提高速度
    ]);
    openQuickPurchaseDialogFromQuery();
  } catch (error) {
    console.error('页面初始化失败:', error);
  } finally {
    loading.value = false;
  }
});
// 页面激活时刷新数据（从其他页面返回时）
onActivated(async () => {
  // 刷新申请单列表和统计数据
  try {
    await loadRequisitions();
  } catch (error) {
    console.error('页面激活刷新失败:', error);
  }
});
// ========== 打印功能 ==========

const printLoading = ref(false)
const handlePrintRequisition = async () => {
  printLoading.value = true
  try {
    const printData = {
      requisition_number: viewData.requisitionNumber || '',
      request_date: formatDate(viewData.requestDate) || '',
      requester: viewData.realName || viewData.requester || '',
      status: getStatusText(viewData.status || 'draft'),
      remarks: viewData.remarks || '',
      items: (viewData.materials || []).map((item, idx) => ({
        index: idx + 1,
        material_code: item.materialCode || '',
        material_name: item.materialName || '',
        specification: item.specification || '',
        quantity: parseFloat(item.quantity || 0).toFixed(2),
        unit_name: item.unit || item.unitName || '',
        remark: item.remark || ''
      }))
    }
    const html = await printService.generateByDefaultTemplate('purchase', 'purchase_requisition', printData)
    printService.previewDocument(html)
  } catch (error) {
    console.error('打印采购申请单失败:', error)
    ElMessage.error('打印失败: ' + (getApiErrorMessage(error, '未知错误')))
  } finally {
    printLoading.value = false
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
.materials-list {
  margin-top: var(--spacing-base);
}
.materials-header {
  margin-bottom: var(--spacing-base);
  display: flex;
  justify-content: flex-start;
}
/* 物料搜索对话框 */
.material-search {
  margin-bottom: var(--spacing-base);
}
.material-search .el-input {
  width: 300px;
}
/* 操作列样式 - 与库存出库页面保持一致 */
.el-table .el-button + .el-button {
  margin-left: 8px;
}
.requisition-view-desc,
.requisition-view-desc :deep(.el-descriptions__body),
.requisition-view-desc :deep(.el-descriptions__table),
.requisition-view-table {
  width: 100%;
}
.requisition-view-desc :deep(.el-descriptions__label) {
  width: 112px;
  min-width: 112px;
  white-space: nowrap;
}
.requisition-view-desc :deep(.el-descriptions__content) {
  min-width: 0;
  white-space: normal;
  word-break: break-word;
}
:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
