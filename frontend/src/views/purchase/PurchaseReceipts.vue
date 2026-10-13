<!--
/**
 * PurchaseReceipts.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page purchase-receipts-container">
    <PageHeader title="采购收货管理" subtitle="管理采购收货与验收">
      <template #actions>
<el-button type="primary" :icon="Plus" v-permission="'purchase:receipts:create'" @click="showAddDialog">新建收货单</el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :model="searchForm"
      :loading="loading"
      @search="searchReceipts"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="收货单号">
          <el-input  v-model="searchForm.receiptNo" placeholder="请输入收货单号" clearable ></el-input>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable>
            <el-option
              v-for="option in PURCHASE_RECEIPT_STATUS_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="订单编号">
          <el-input  v-model="searchForm.orderNo" placeholder="请输入订单编号" clearable ></el-input>
        </el-form-item>
        <el-form-item label="收货日期">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          ></el-date-picker>
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ receiptStats.total || 0 }}</div>
        <div class="stat-label">收货单总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ receiptStats.draftCount || 0 }}</div>
        <div class="stat-label">{{ getPurchaseReceiptStatusText('draft') }}</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ receiptStats.inspectedCount || 0 }}</div>
        <div class="stat-label">{{ getPurchaseReceiptStatusText('inspected') }}</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ receiptStats.completedCount || 0 }}</div>
        <div class="stat-label">{{ getPurchaseReceiptStatusText('completed') }}</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ receiptStats.cancelledCount || 0 }}</div>
        <div class="stat-label">{{ getPurchaseReceiptStatusText('cancelled') }}</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(receiptStats.totalAmount) }}</div>
        <div class="stat-label">收货总金额</div>
      </el-card>
    </div>

    <!-- 收货单列表 -->
    <el-card class="data-card">
      <el-table
        v-loading="loading"
        :data="receipts"
        border
        class="table-row-click w-full"
      
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => viewReceipt(row))">
        <template #empty>
          <EmptyState description="暂无收货单数据" />
        </template>
        <el-table-column prop="receiptNo" label="收货单号" min-width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="receiptDate" label="收货日期" min-width="110">
          <template #default="scope">
            {{ formatDate(scope.row.receiptDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="orderNo" label="关联订单" min-width="140" show-overflow-tooltip></el-table-column>
        <el-table-column prop="supplierName" label="供应商" min-width="300" show-overflow-tooltip></el-table-column>
        <el-table-column prop="receiver" label="收货人" min-width="100"></el-table-column>
        <el-table-column prop="warehouseName" label="入库仓库" min-width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="status" label="状态" min-width="70">
          <template #default="scope">
            <el-tag :type="getPurchaseReceiptStatusColor(scope.row.status)">{{ getPurchaseReceiptStatusText(scope.row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="320" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="scope">
            
            <el-button
              v-if="scope.row.status === 'draft'"
              size="small"
              type="primary"
              @click="editReceipt(scope.row)"
              v-permission="'purchase:receipts:update'"
            >
              编辑
            </el-button>
            <el-button
              v-if="scope.row.status === 'inspected' && Number(scope.row.qualifiedQuantity) > 0"
              size="small"
              type="success"
              :loading="updateStatusLoading"
              v-permission="'purchase:receipts:update'"
              @click="directCompleteReceipt(scope.row)"
            >入库</el-button>
            <el-popconfirm
              v-if="['draft', 'inspected'].includes(scope.row.status)"
              title="确定要取消该收货单吗？"
              @confirm="cancelReceipt(scope.row)"
              confirm-button-type="warning"
            >
              <template #reference>
                <el-button size="small" type="warning" :disabled="updateStatusLoading" v-permission="'purchase:receipts:update'">取消</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.current"
          v-model:page-size="pagination.size"
          :page-sizes="PAGE_SIZE_OPTIONS"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total"
        ></el-pagination>
      </div>
    </el-card>

    <!-- 查看收货单详情对话框 -->
    <AppDialog
      v-model="viewDialog.show"
      title="收货单详情"
      mode="view"
      width="850px"
      :detail-navigation="receiptViewNavigation"
    >
      <div v-loading="detailLoading" class="receipt-view">
        <el-descriptions border :column="2" class="purchase-view-desc">
          <el-descriptions-item label="收货单号">{{ viewDialog.receipt.receiptNo }}</el-descriptions-item>
          <el-descriptions-item label="收货日期">{{ formatDate(viewDialog.receipt.receiptDate) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getPurchaseReceiptStatusColor(viewDialog.receipt.status)">{{ getPurchaseReceiptStatusText(viewDialog.receipt.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="关联订单">{{ viewDialog.receipt.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="供应商">{{ viewDialog.receipt.supplierName }}</el-descriptions-item>
          <el-descriptions-item label="收货人">{{ viewDialog.receipt.receiver }}</el-descriptions-item>
          <el-descriptions-item label="入库仓库">{{ viewDialog.receipt.warehouseName }}</el-descriptions-item>
          <el-descriptions-item v-if="viewDialog.receipt.inspectionId" label="关联检验单" :span="2">
            <span>{{ viewDialog.receipt.inspectionNo || viewDialog.receipt.inspectionId }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ viewDialog.receipt.remarks }}</el-descriptions-item>
        </el-descriptions>

        <InventoryPostingStatusPanel
          v-if="viewDialog.receipt?.id || viewDialog.receipt?.receiptNo"
          source-type="inbound"
          :source-id="viewDialog.receipt.id"
          :source-no="viewDialog.receipt.receiptNo"
        />

        <el-divider content-position="center">收货物料</el-divider>
        <template v-if="!viewDialog.receipt.items || viewDialog.receipt.items.length === 0">
          <div class="no-data-info">
            <EmptyState description="暂无物料数据" />
          </div>
        </template>
        <el-table v-else :data="viewDialog.receipt.items || []" border class="w-full purchase-view-table">
          <el-table-column type="index" label="序号" width="60"></el-table-column>
          <el-table-column label="物料名称" prop="materialName" min-width="150">
            <template #default="scope">
              {{ scope.row.materialName || '未知物料' }}
            </template>
          </el-table-column>
          <el-table-column label="编码" min-width="120">
            <template #default="scope">
              {{ scope.row.code || scope.row.materialCode || '' }}
            </template>
          </el-table-column>
          <el-table-column label="规格型号" prop="specification" min-width="220">
            <template #default="scope">
              {{ formatSpecification(scope.row) }}
            </template>
          </el-table-column>
          <el-table-column label="单位" prop="unitName" min-width="80">
            <template #default="scope">
              {{ scope.row.unitName || scope.row.unit || '个' }}
            </template>
          </el-table-column>
          <el-table-column label="订单数量" prop="orderedQuantity" min-width="100">
            <template #default="scope">
              {{ Number(scope.row.orderedQuantity || scope.row.quantity || 0).toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column label="实收数量" prop="receivedQuantity" min-width="100">
            <template #default="scope">
              {{ Number(scope.row.receivedQuantity || 0).toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column label="合格数量" prop="qualifiedQuantity" min-width="100">
            <template #default="scope">
              {{ Number(scope.row.qualifiedQuantity || 0).toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column label="检验结果" min-width="100">
            <template #default="scope">
              <el-tag type="info" v-if="viewDialog.receipt.status === 'draft'">待检验</el-tag>
              <el-tag type="success" v-else-if="Number(scope.row.qualifiedQuantity || 0) >= Number(scope.row.receivedQuantity || 0)">合格</el-tag>
              <el-tag type="warning" v-else-if="Number(scope.row.qualifiedQuantity || 0) > 0">部分合格</el-tag>
              <el-tag type="danger" v-else>不合格</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="备注" prop="remarks" min-width="500">
            <template #default="scope">
              {{ scope.row.remarks || '-' }}
            </template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="viewDialog.show = false">关闭</el-button>
          <el-button v-permission="'purchase:receipts:view'" type="primary" @click="printReceipt" v-if="viewDialog.receipt.id">打印</el-button>
        </span>
      </template>
    </AppDialog>

    <!-- 新建/编辑收货单对话框 -->
    <AppDialog
      v-model="receiptDialog.show"
      :title="receiptDialog.isEdit ? '编辑收货单' : '新建收货单'"
      mode="form"
      width="850px"
    >
      <el-form ref="receiptForm" :model="receiptDialog.form" :rules="receiptRules" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="关联订单" prop="orderId">
              <el-select
                v-model="receiptDialog.form.orderId"
                :disabled="receiptDialog.isEdit || inspectionDetailLoading || loadingOrderItems"
                placeholder="请选择订单"
                filterable
                class="w-full"
                @change="handleOrderChange"
              >
                <el-option
                  v-for="item in orders"
                  :key="item.id"
                  :label="item.orderNumber"
                  :value="item.id"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="收货明细" prop="orderItemId">
              <el-select
                v-model="receiptDialog.form.orderItemId"
                placeholder="请选择本次收货的采购订单明细"
                :loading="loadingOrderItems"
                :disabled="receiptDialog.isEdit || loadingOrderItems || inspectionDetailLoading || Boolean(receiptDialog.form.inspectionId)"
                filterable
                class="w-full"
                @change="handleOrderItemChange"
              >
                <el-option
                  v-for="item in receiptOrderItems"
                  :key="item.orderItemId"
                  :value="item.orderItemId"
                  :label="`第${item.lineNumber}行 · ${item.materialName} · ${item.orderedQuantity}${item.unitName || ''}`"
                />
              </el-select>
              <div class="meta-secondary-sm">每张收货单对应一条采购订单明细及一个批次，不同明细或批次请分别建单。</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="收货日期" prop="receiptDate">
              <el-date-picker
                v-model="receiptDialog.form.receiptDate"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                class="w-full"
              ></el-date-picker>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="供应商" prop="supplierId">
              <div v-if="selectedSupplierName" class="flex-center-mb">
                <el-tag type="success" size="large" class="mr-10">
                  <strong>{{ selectedSupplierName }}</strong>
                </el-tag>
                <el-button v-if="!receiptDialog.isEdit && !receiptDialog.form.inspectionId" link @click="selectedSupplierName = null">
                  <el-icon><Close /></el-icon>
                </el-button>
              </div>
              <el-select
                v-model="receiptDialog.form.supplierId"
                :disabled="receiptDialog.isEdit || Boolean(receiptDialog.form.inspectionId)"
                placeholder="请选择供应商"
                filterable
                class="w-full"
                value-key="id"
                v-if="!selectedSupplierName"
              >
                <el-option
                  v-for="item in suppliers"
                  :key="item.id || item.supplierId"
                  :label="item.name || item.supplierName"
                  :value="Number(item.id || item.supplierId)"
                >
                  <div class="flex-col">
                    <span>{{ item.name || item.supplierName }}</span>
                    <small class="text-muted">
                      {{ item.address || item.supplierAddress || '' }}
                    </small>
                  </div>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="收货人" prop="receiver">
              <el-input v-model="receiptDialog.form.receiver" placeholder="请输入收货人" class="w-full"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="入库仓库" prop="warehouseId">
              <el-select
                v-model="receiptDialog.form.warehouseId"
                placeholder="请选择仓库"
                filterable
                class="w-full"
                @change="(val) => {
                  // 确保ID是数字类型
                  if (val) {
                    receiptDialog.form.warehouseId = Number(val);
                    // 验证所选仓库是否有效
                    if (!validateWarehouseId(receiptDialog.form.warehouseId)) {
                      ElMessage.warning('警告：所选仓库不存在或已停用，请重新选择');
                      receiptDialog.form.warehouseId = null;
                    }
                  }
                }"
              >
                <el-option
                  v-for="item in warehouses"
                  :key="item.id"
                  :label="`${item.name}${item.code ? ` (${item.code})` : ''}`"
                  :value="Number(item.id)"
                >
                  <div class="flex-col">
                    <span>{{ item.name }}</span>
                    <small class="text-muted">
                      代码: {{ item.code || '无' }} | 类型: {{ item.type || '标准' }}
                    </small>
                  </div>
                </el-option>
              </el-select>
              <div v-if="warehouses.length === 0" class="text-danger-hint">
                警告：系统中未找到有效的仓库，请先创建仓库
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="来料检验单" prop="inspectionId">
              <el-select
                v-model="receiptDialog.form.inspectionId"
                placeholder="可选择来料检验单，未关联时保存为草稿"
                :loading="loadingInspections"
                :disabled="inspectionDetailLoading || loadingOrderItems || Boolean(receiptDialog.originalInspectionId)"
                filterable
                clearable
                class="w-full"
                @change="handleInspectionChange"
              >
                <el-option
                  v-for="item in availableInspections"
                  :key="item.id"
                  :label="`${item.inspectionNo} - ${item.itemName}`"
                  :value="item.id"
                >
                  <div class="flex-between">
                    <span>{{ item.inspectionNo }}</span>
                    <el-tag size="small" :type="getQualityStatusColor(item.status)">
                      {{ getQualityStatusText(item.status) }}
                    </el-tag>
                  </div>
                  <div class="meta-secondary-sm">
                    {{ item.itemName }} - {{ item.supplierName ? (item.supplierName.includes('(') ? item.supplierName.split('(')[0].trim() : item.supplierName) : '' }} - 批次: {{ item.batchNo }}
                  </div>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注" prop="remarks">
              <el-input
                v-model="receiptDialog.form.remarks"
                type="textarea"
                :rows="2"
                placeholder="请输入备注信息"
                class="w-full"
              ></el-input>
            </el-form-item>
          </el-col>
        </el-row>

        <div class="mt-4">
          <div class="mb-2 font-weight-bold">物料清单</div>
          <el-table :data="receiptDialog.form.items" border class="w-full">
            <el-table-column type="index" label="序号" width="50"></el-table-column>
            <el-table-column label="物料名称" prop="materialName" min-width="150"></el-table-column>
            <el-table-column label="规格" prop="specification" min-width="120"></el-table-column>
            <el-table-column label="单位" prop="unitName" min-width="80"></el-table-column>
            <el-table-column label="订单数量" min-width="100">
              <template #default="scope">
                {{ scope.row.orderedQuantity }}
              </template>
            </el-table-column>
            <el-table-column label="实收数量" min-width="120">
              <template #default="scope">
                <el-input
                  v-model="scope.row.receivedQuantity"
                  :disabled="Boolean(receiptDialog.form.inspectionId)"
                  type="text"
                  size="small"
                  @input="handleReceivedQuantityChange(scope.row)"
                ></el-input>
              </template>
            </el-table-column>
            <el-table-column label="合格数量" min-width="120">
              <template #default="scope">
                {{ scope.row.qualifiedQuantity }}
              </template>
            </el-table-column>
            <el-table-column label="备注" min-width="150">
              <template #default="scope">
                <el-input v-model="scope.row.remarks" placeholder="备注" size="small"></el-input>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="closeReceiptDialog">取 消</el-button>
          <el-button type="primary" v-permission="receiptDialog.isEdit ? 'purchase:receipts:update' : 'purchase:receipts:create'" @click="submitReceipt" :loading="submitLoading || inspectionDetailLoading || loadingOrderItems">确 定</el-button>
        </span>
      </template>
        </AppDialog>

  </div>
</template>
<script setup>
import { useInventoryPostingSourceLink } from '@/composables/useInventoryPostingSourceLink'
import { PAGE_SIZE_OPTIONS } from '@/config/pagination'
import { handleTableRowView } from '@/utils/tableRowView'
import { formatLocalDate } from '@/utils/format';
const formatSpecification = (row) => row?.specification || row?.specs || row?.standard || row?.model || row?.spec || '未提供';
import { parsePaginatedData, parseResponseData } from '@/utils/responseParser';
import { loadLocationOptions } from '@/utils/optionLoaders';
import { ref, reactive, onMounted, nextTick, watch, computed } from 'vue';
import { useListDetailNavigation } from '@/composables/useListDetailNavigation';

import { purchaseApi, qualityApi, baseDataApi } from '@/api';

import { formatCurrency } from '@/utils/helpers/formatters';
import { ElMessage } from 'element-plus/es/components/message/index'
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { Plus, Close } from '@element-plus/icons-vue'
import printService from '@/services/printService'
import {
  PURCHASE_RECEIPT_STATUS_OPTIONS,
  getPurchaseReceiptStatusText,
  getPurchaseReceiptStatusColor,
  getQualityStatusText,
  getQualityStatusColor
} from '@/constants/systemConstants';
import InventoryPostingStatusPanel from '@/components/inventory/InventoryPostingStatusPanel.vue';
import { getApiErrorMessage } from '@/utils/errorHandler'

// 初始化认证存储
const authStore = useAuthStore();
// 添加表单引用
const receiptForm = ref(null);
// 供应商选择状态
const selectedSupplierName = ref(null);
// 表单验证规则
const receiptRules = computed(() => ({
  orderItemId: [{ required: true, message: '请选择本次收货的采购订单明细', trigger: 'change' }],
  orderId: [
    { required: true, message: '请选择关联订单', trigger: 'change' }
  ],
  receiptDate: [
    { required: true, message: '请选择收货日期', trigger: 'change' }
  ],
  supplierId: [
    { required: true, message: '请选择供应商', trigger: 'change' }
  ],
  receiver: [
    { required: true, message: '请输入收货人', trigger: 'blur' }
  ],
  warehouseId: [
    { required: true, message: '请选择入库仓库', trigger: 'change' }
  ]
}));
// 收货单数据
const receipts = ref([]);
const {
  previousItem: previousViewReceipt,
  nextItem: nextViewReceipt,
  hasPrevious: hasPreviousViewReceipt,
  hasNext: hasNextViewReceipt,
  setCurrentItem: setCurrentViewReceipt
} = useListDetailNavigation(receipts);
const loading = ref(false);
const submitLoading = ref(false);
const updateStatusLoading = ref(false);
const detailLoading = ref(false);
const totalReceipts = ref(0);
;
;
// 分页对象
const pagination = ref({
  current: 1,
  size: 10,
  total: 0
});
// 供应商、订单和仓库
const suppliers = ref([]);
const orders = ref([]);
const warehouses = ref([]);
const receiptOrderItems = ref([]);
const loadingOrderItems = ref(false);
// 可关联采购收货的来料检验单（待检、检验中、条件放行或已结案）
const availableInspections = ref([]);
const loadingInspections = ref(false);
const inspectionDetailLoading = ref(false);
const FINISHED_INSPECTION_STATUSES = ['passed', 'partial', 'failed', 'completed'];
const RECEIPTABLE_INSPECTION_STATUSES = ['pending', 'in_progress', 'conditional', ...FINISHED_INSPECTION_STATUSES];
const extractInspectionRows = (response) => {
  const responseData = parseResponseData(response, {});
  if (Array.isArray(responseData)) return responseData;
  if (Array.isArray(responseData.items)) return responseData.items;
  if (Array.isArray(responseData.list)) return responseData.list;
  if (Array.isArray(responseData.rows)) return responseData.rows;
  return [];
};
// 表格列定义
;

;

;
// 状态选项（使用统一常量）
;
// 搜索表单
const searchForm = reactive({
  receiptNo: '',
  orderNo: '',
  status: '',
  dateRange: [],
  startDate: '',
  endDate: ''
});
// 新建/编辑收货单对话框
const receiptDialog = reactive({
  show: false,
  isEdit: false,
  originalInspectionId: null,
  valid: false,
  dateMenu: false,
  form: {
    id: null,
    orderId: null,
    orderItemId: null,
    supplierId: null,
    receiptDate: formatLocalDate(new Date()),
    receiver: '',
    warehouseId: null,
    inspectionId: null,
    remarks: '',
    items: []
  }
});
// 查看收货单详情对话框
const viewDialog = reactive({
  show: false,
  receipt: {}
});
// 收货单统计数据
const receiptStats = ref({
  total: 0,
  draftCount: 0,
  inspectedCount: 0,
  completedCount: 0,
  cancelledCount: 0,
  totalAmount: null
});
// 获取路由对象
const route = useRoute();
// 监听分页参数变化
watch(
  () => [pagination.value.current, pagination.value.size],
  ([newPage, newSize], [oldPage, oldSize]) => {
    if (newPage !== oldPage || newSize !== oldSize) {
      loadReceipts();
    }
  }
);
// 生命周期钩子
onMounted(async () => {
  await Promise.all([
    loadReceipts(),
    loadSuppliers(),
    loadApprovedOrders(),
    loadWarehouses(),
    loadInspections()
  ]);

  // 检查URL中是否有检验单ID参数
  const inspectionId = route.query.inspectionId;

  if (inspectionId) {
    // 等待数据加载完成
    await nextTick();
    // 打开新建收货单对话框
    showAddDialog();
    // 选择检验单
    receiptDialog.form.inspectionId = Number(inspectionId);
    await handleInspectionChange(Number(inspectionId));
  }
});
// 方法：加载可关联的来料检验单
const loadInspections = async () => {
  loadingInspections.value = true;
  try {
    const responses = await Promise.all(
      RECEIPTABLE_INSPECTION_STATUSES.map(status =>
        qualityApi.getIncomingInspections({
          status,
          page: 1,
          limit: 50,
          include_supplier: 'true'
        })
      )
    );

    const inspectionData = responses.flatMap(extractInspectionRows);
    const uniqueInspections = new Map();

    inspectionData.forEach(item => {
      if (!item?.id || uniqueInspections.has(Number(item.id))) return;
      if (item.sourceType === 'outsourced_receipt') return;
      uniqueInspections.set(Number(item.id), {
        id: item.id,
        inspectionNo: item.inspectionNo,
        itemName: item.itemName,
        supplierName: item.supplierName,
        batchNo: item.batchNo,
        status: item.status
      });
    });

    availableInspections.value = Array.from(uniqueInspections.values());
  } catch (error) {
    console.error('加载来料检验单失败:', error);
    ElMessage.error('加载来料检验单失败');
    availableInspections.value = [];
  } finally {
    loadingInspections.value = false;
  }
};
// 方法：加载收货单列表
async function loadReceipts() {
  loading.value = true;
  try {
    const params = {
      page: pagination.value.current,
      pageSize: pagination.value.size,
      receiptNo: searchForm.receiptNo || undefined,
      orderNo: searchForm.orderNo || undefined,
      status: searchForm.status || undefined,
      startDate: searchForm.startDate || undefined,
      endDate: searchForm.endDate || undefined
    };

    const response = await purchaseApi.getReceipts(params);
    const paginated = parsePaginatedData(response);

    // 分页赋值
    pagination.value.total = paginated.total;
    totalReceipts.value = paginated.total;
    const receiptData = paginated.list;
    // 直接使用列表数据，不再逐条拉取详情（消除 N+1 性能问题）
    receipts.value = receiptData || [];

    receiptStats.value = paginated.statistics || {};
  } catch (error) {
    console.error('加载收货单失败:', error);
    ElMessage.error('加载收货单失败: ' + (getApiErrorMessage(error, '未知错误')));
    receipts.value = []; // 确保在出错时receipts是一个数组
    pagination.value.total = 0;
    receiptStats.value = {};
  } finally {
    loading.value = false;
  }
}
// 方法：加载供应商列表
const loadSuppliers = async () => {
  try {
    const params = { limit: 50 };
    const response = await baseDataApi.getSuppliers(params);
    if (!response || !response.data) {
      console.error('供应商API返回无效数据:', response);
      suppliers.value = [];
      return;
    }
    const responseData = parseResponseData(response);
    // 拦截器已解包，response.data 就是业务数据
    let supplierList = [];
    if (Array.isArray(responseData)) {
      supplierList = responseData;
    } else if (responseData.items && Array.isArray(responseData.items)) {
      supplierList = responseData.items;
    } else if (responseData.list && Array.isArray(responseData.list)) {
      supplierList = responseData.list;
    }
    // 标准化供应商数据
    suppliers.value = supplierList.map(supplier => ({
      id: supplier.id || supplier.supplierId,
      code: supplier.supplierCode,
      name: supplier.name || supplier.companyName,
      contactPerson: supplier.contactPerson,
      contactPhone: supplier.contactPhone,
      status: supplier.status || 1
    }));

  } catch (error) {
    console.error('加载供应商列表失败:', error);
    ElMessage.error('加载供应商列表失败');
    suppliers.value = [];
  }
};
// 方法：标准化订单号格式（去除空格、全部大写）
function normalizeOrderNumber(orderNo) {
  if (!orderNo) return '';
  return orderNo.toString().trim().toUpperCase();
}
// 方法：加载已批准的订单
async function loadApprovedOrders() {
  try {
    // 加载所有订单而不添加状态过滤
    const response = await purchaseApi.getOrders({
      limit: 50
    });

    // 确保orders.value是数组
    const responseData = parseResponseData(response);
    if (responseData && responseData.items) {
      // 如果responseData是带有items属性的对象
      orders.value = responseData.items;
    } else if (responseData && responseData.list) {
      // 新的统一格式
      orders.value = responseData.list;
    } else if (Array.isArray(responseData)) {
      // 如果responseData本身是数组
      orders.value = responseData;
    } else {
      // 其他情况设置为空数组
      orders.value = [];
    }

    // 标准化所有订单号，统一大小写和格式，同时检查并纠正订单字段名
    if (Array.isArray(orders.value)) {
      orders.value.forEach(order => {
        // 检查多种可能的字段名称
        const orderNumber =
          order.orderNumber ||
          order.orderNo ||
          order.number ||
          order.no ||
          '未知订单号';

        // 保存原始订单号
        order.originalOrderNumber = orderNumber;

        // 标准化订单号
        order.orderNumber = normalizeOrderNumber(orderNumber);

        // 确保所有可能的订单号字段都有值
        order.orderNumber = order.orderNumber;
        order.orderNo = order.orderNumber;
        order.orderNo = order.orderNumber;
      });
    }

    // 如果仍然所有订单都是未知订单号，记录警告
    if (orders.value.length > 0 && orders.value.every(o => !o.orderNumber || o.orderNumber === '未知订单号')) {
    }
  } catch (error) {
    console.error('加载订单失败:', error);
    ElMessage.error('加载订单失败');
    orders.value = []; // 确保在出错时orders是一个数组
  }
}
// 方法：加载仓库列表
async function loadWarehouses() {
  try {
    const locationsData = await loadLocationOptions({ pageSize: 50 });
    warehouses.value = locationsData.map(location => ({
      id: Number(location.id),
      name: location.name || '未命名仓库',
      code: location.code || '',
      type: location.type || '标准',
      location_id: Number(location.id),
      originalData: { ...location }
    }));

    // 确保每个仓库都有warehouseId属性
    warehouses.value.forEach(warehouse => {
      warehouse.warehouseId = warehouse.id;
    });
  } catch (error) {
    console.error('加载仓库列表失败:', error);
    ElMessage.error('加载仓库列表失败');
    warehouses.value = [];
  }
}
// 方法：重置搜索条件
function resetSearch() {
  searchForm.receiptNo = '';
  searchForm.orderNo = '';
  searchForm.status = '';
  searchForm.dateRange = [];
  searchForm.startDate = '';
  searchForm.endDate = '';
  pagination.value.current = 1;
  loadReceipts();
}
function _handlePageChange(page) {
  pagination.value.current = page;
  loadReceipts();
}
function _handleSizeChange(size) {
  pagination.value.size = size;
  pagination.value.current = 1;
  loadReceipts();
}
// 方法：格式化日期
function formatDate(date) {
  if (!date) return '-';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    return formatLocalDate(d);
  } catch {
    return date;
  }
}
// 方法：打开创建收货单对话框
function showAddDialog() {
  receiptDialog.isEdit = false;
  receiptDialog.originalInspectionId = null;
  selectedSupplierName.value = null;
  receiptOrderItems.value = [];
  receiptDialog.form = {
    id: null,
    orderId: null,
    orderItemId: null,
    supplierId: null,
    receiptDate: formatLocalDate(new Date()),
    receiver: authStore.realName || (authStore.user ? authStore.user.username : ''),
    warehouseId: null,
    inspectionId: null,
    remarks: '',
    items: []
  };
  receiptDialog.show = true;
}
// 方法：关闭收货单对话框
function closeReceiptDialog() {
  receiptDialog.show = false;
}
// 方法：查看收货单详情
async function viewReceipt(receipt) {
  detailLoading.value = true;

  try {
    // 从服务器获取详细的收货单数据
    const { data } = await purchaseApi.getReceipt(receipt.id);
    if (!data) {
      throw new Error('未能获取收货单详情');
    }

    // 过滤掉状态变更记录
    if (data.remarks) {
      // 使用正则表达式匹配状态变更的记录
      // 删除历史状态变更审计片段，保留用户填写的业务备注。
      data.remarks = data.remarks.replace(/\s*\|\s*\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\]\s*状态变更为\s+[^|]+/g, '');
      // 清理可能残留的前后分隔符和空白
      data.remarks = data.remarks.replace(/^\s*\|\s*/, '').replace(/\s*\|\s*$/, '').trim();
    }

    // 确保items数组存在
    if (!data.items) {
      data.items = [];
    } else {
      // 处理第一个物料项的规格字段
      if (data.items.length > 0) {
        const firstItem = data.items[0];

        // 如果规格字段为空，尝试从物料主数据获取
        if (!firstItem.specification && firstItem.materialId) {
          try {
            const materialResponse = await baseDataApi.getMaterial(firstItem.materialId);
            if (materialResponse.data) {
              firstItem.specification = materialResponse.data.specs ||
                                     materialResponse.data.specification ||
                                     materialResponse.data.standard;
            }
          } catch {
          }
        }
      }
    }

    // 如果收货单items为空但收货单存在，尝试从订单获取物料项
    if (data.items.length === 0 && data.orderId) {
      try {
        const orderResponse = await purchaseApi.getOrder(data.orderId);

        if (orderResponse && orderResponse.data) {
          if (Array.isArray(orderResponse.data.items) && orderResponse.data.items.length > 0) {

            // 转换订单物料项到收货单物料项
            data.items = orderResponse.data.items.map(item => ({
              material_id: item.materialId,
              material_name: item.materialName,
              material_code: item.materialCode || item.code,
              specification: item.specs || item.specification || item.standard || item.model || item.spec,
              unit: item.unit,
              unit_name: item.unitName,
              ordered_quantity: Number(item.quantity || 0),
              received_quantity: Number(item.receivedQuantity || 0),
              qualified_quantity: Number(item.qualifiedQuantity || 0),
              remarks: item.remarks || ''
            }));
          }
        }
      } catch {
      }
    }

    viewDialog.receipt = data;
    setCurrentViewReceipt(receipt);
    viewDialog.show = true;
  } catch (error) {
    console.error('获取收货单详情失败:', error);
    ElMessage.error('获取收货单详情失败: ' + (getApiErrorMessage(error, '未知错误')));
  } finally {
    detailLoading.value = false;
  }
}

const handleViewPrevious = () => {
  if (previousViewReceipt.value) viewReceipt(previousViewReceipt.value);
};

const handleViewNext = () => {
  if (nextViewReceipt.value) viewReceipt(nextViewReceipt.value);
};

const receiptViewNavigation = computed(() => ({
  hasPrevious: hasPreviousViewReceipt.value,
  hasNext: hasNextViewReceipt.value,
  loading: detailLoading.value,
  previous: handleViewPrevious,
  next: handleViewNext
}));
// 已有关联直接读取真实检验资料，不伪造检验结果。
const ensureInspectionInList = async (inspectionId) => {
  if (!inspectionId || availableInspections.value.some(item => Number(item.id) === Number(inspectionId))) return;
  const inspection = parseResponseData(await qualityApi.getIncomingInspection(inspectionId));
  if (!inspection?.id) throw new Error('来料检验单详情为空');
  availableInspections.value.unshift(inspection);
};
// 方法：编辑收货单
async function editReceipt(receipt) {
  try {
    const response = await purchaseApi.getReceipt(receipt.id);
    receipt = parseResponseData(response);
    if (!receipt?.id) throw new Error('收货单详情为空');
    if (receipt.status !== 'draft') throw new Error('只有草稿收货单可以编辑');
    if (receipt.inspectionId) await ensureInspectionInList(receipt.inspectionId);
  } catch (error) {
    ElMessage.error('加载收货单详情失败: ' + (getApiErrorMessage(error, '未知错误')));
    return;
  }
  if (!orders.value.some(order => Number(order.id) === Number(receipt.orderId))) {
    orders.value.unshift({ id: receipt.orderId, orderNo: receipt.orderNo, orderNumber: receipt.orderNo });
  }
  receiptDialog.isEdit = true;
  receiptDialog.originalInspectionId = receipt.inspectionId || null;
  receiptOrderItems.value = (receipt.items || []).map((item, index) => ({ ...item, lineNumber: index + 1 }));
  // 重置供应商显示状态
  selectedSupplierName.value = null;
  receiptDialog.form = {
    id: receipt.id,
    orderId: receipt.orderId,
    orderItemId: receipt.items?.[0]?.orderItemId || null,
    supplierId: receipt.supplierId, // 添加供应商ID
    receiptDate: receipt.receiptDate,
    receiver: receipt.receiver,
    warehouseId: receipt.warehouseId,
    inspectionId: receipt.inspectionId,
    remarks: receipt.remarks,
    items: [...(receipt.items || [])].map(item => {
      return {
        ...item,
        id: item.id || item.itemId, // 确保有ID字段
        materialId: item.materialId,
        materialName: item.materialName,
        unitId: item.unitId,
        unitName: item.unitName,
        receivedQuantity: Number(item.receivedQuantity),
        qualifiedQuantity: Number(item.qualifiedQuantity),
        orderedQuantity: Number(item.orderedQuantity)
      };
    })
  };
  // 设置供应商显示名称
  if (receipt.supplierName) {
    selectedSupplierName.value = receipt.supplierName;
  } else if (receipt.supplierId) {
    // 如果没有供应商名称，从供应商列表中查找
    const supplier = suppliers.value.find(s =>
      Number(s.id) === Number(receipt.supplierId) ||
      Number(s.supplierId) === Number(receipt.supplierId)
    );
    if (supplier) {
      selectedSupplierName.value = supplier.name || supplier.supplierName;
    }
  }
  receiptDialog.show = true;
}
const setReceiptOrderItems = (order) => {
  receiptOrderItems.value = (order.items || []).map((item, index) => ({
    orderItemId: item.id,
    lineNumber: index + 1,
    materialId: item.materialId,
    materialCode: item.materialCode,
    materialName: item.materialName,
    specification: item.specification || item.specs,
    unitId: item.unitId,
    unitName: item.unitName,
    orderedQuantity: Number(item.quantity ?? item.orderedQuantity ?? 0),
    receivedQuantity: 0,
    qualifiedQuantity: 0,
    warehouseId: item.warehouseId || order.warehouseId || null,
    remarks: '',
  }));
};

function handleOrderItemChange(orderItemId) {
  const item = receiptOrderItems.value.find(row => Number(row.orderItemId) === Number(orderItemId));
  receiptDialog.form.items = item ? [{ ...item }] : [];
  if (item?.warehouseId) receiptDialog.form.warehouseId = Number(item.warehouseId);
}

// 方法：处理订单选择变更
async function handleOrderChange(orderId) {
  receiptDialog.form.inspectionId = null;
  receiptDialog.form.orderItemId = null;
  receiptDialog.form.items = [];
  receiptOrderItems.value = [];
  selectedSupplierName.value = null;
  if (!orderId) return;

  loadingOrderItems.value = true;
  try {
    const data = parseResponseData(await purchaseApi.getOrder(orderId));
    if (!data?.id) throw new Error('采购订单详情为空');
    receiptDialog.form.supplierId = data.supplierId;
    selectedSupplierName.value = data.supplierName || null;
    receiptDialog.form.warehouseId = data.warehouseId || null;
    setReceiptOrderItems(data);
    if (!receiptOrderItems.value.length) ElMessage.warning('采购订单没有可收货的明细');
    if (receiptOrderItems.value.length === 1) {
      receiptDialog.form.orderItemId = receiptOrderItems.value[0].orderItemId;
      handleOrderItemChange(receiptDialog.form.orderItemId);
    }
    receiptDialog.orderNumber = data.orderNumber || data.orderNo || '';
  } catch (error) {
    console.error('获取订单详情失败:', error);
    ElMessage.error('获取订单详情失败');
  } finally {
    loadingOrderItems.value = false;
  }
}
// 方法：验证仓库ID是否存在于可用仓库列表中
function validateWarehouseId(warehouseId) {
  if (!warehouseId) return false;

  // 转换为数字类型进行比较
  const numericId = Number(warehouseId);
  if (isNaN(numericId)) {
    console.error(`无效的仓库ID格式: "${warehouseId}"，无法转换为数字`);
    return false;
  }

  // 检查ID是否在可用仓库列表中
  const found = warehouses.value.some(warehouse => Number(warehouse.id) === numericId);
  if (!found) {
  }
  return found;
}
// 方法：提交收货单
const submitReceipt = async () => {
  try {
    await receiptForm.value.validate();

    if (receiptDialog.form.items.length !== 1) {
      ElMessage.warning('请选择一条采购订单明细，不同明细请分别建单');
      return;
    }

    // 验证必要字段
    if (!receiptDialog.form.orderId) {
      ElMessage.warning('请选择关联订单');
      return;
    }

    // 验证物料数量
    const invalidItems = receiptDialog.form.items.filter(item =>
      !Number.isFinite(Number(item.receivedQuantity)) || Number(item.receivedQuantity) < 0 ||
      !Number.isFinite(Number(item.qualifiedQuantity)) || Number(item.qualifiedQuantity) < 0 ||
      item.qualifiedQuantity > item.receivedQuantity
    );

    if (invalidItems.length > 0) {
      ElMessage.warning('请检查物料数量，确保实收数量大于0，合格数量不小于0且不超过实收数量');
      return;
    }
    if (Number(receiptDialog.form.items[0].receivedQuantity) <= 0) {
      ElMessage.warning('请填写大于0的实收数量');
      return;
    }
    submitLoading.value = true;

    // 尝试获取最新的用户信息，确保实时更新
    try {
      await authStore.fetchUserProfile();
    } catch {
    }

    // 确保收货人字段使用真实姓名
    if (!receiptDialog.form.receiver && authStore.realName) {
      receiptDialog.form.receiver = authStore.realName;
    }

    // 准备提交数据
    const submitData = {
      orderId: receiptDialog.form.orderId,
      inspectionId: receiptDialog.form.inspectionId,
      receiptDate: receiptDialog.form.receiptDate,
      supplierId: receiptDialog.form.supplierId,
      receiver: receiptDialog.form.receiver,
      warehouseId: receiptDialog.form.warehouseId,
      remarks: receiptDialog.form.remarks,
      items: receiptDialog.form.items.map(item => ({
        orderItemId: item.orderItemId,
        id: item.id,
        materialId: item.materialId,
        unitId: item.unitId,
        receivedQuantity: item.receivedQuantity,
        qualifiedQuantity: item.qualifiedQuantity,
        batchNumber: item.batchNumber,
        remarks: item.remarks
      }))
    };

    // 提交数据 - 根据是否为编辑模式选择不同的API
    let response;
    if (receiptDialog.isEdit && receiptDialog.form.id) {
      // 编辑模式：更新现有收货单
      response = await purchaseApi.updateReceipt(receiptDialog.form.id, submitData);
    } else {
      // 新建模式：创建新收货单
      response = await purchaseApi.createReceipt(submitData);
    }

    if (response.data) {
      const message = receiptDialog.isEdit ? '收货单更新成功' : '收货单创建成功';
      ElMessage.success(message);
      closeReceiptDialog();
      loadReceipts(); // 修改为调用loadReceipts方法而不是fetchData
    }
  } catch (error) {
    console.error('提交收货单失败:', error);
    ElMessage.error('提交收货单失败: ' + (getApiErrorMessage(error, '未知错误')));
  } finally {
    submitLoading.value = false;
  }
};
// 直接取消收货单
const cancelReceipt = async (receipt) => {
  updateStatusLoading.value = true;
  try {
    await purchaseApi.updateReceiptStatus(receipt.id, {
      status: 'cancelled',
      remarks: '用户取消收货单'
    });
    ElMessage.success('收货单已取消');
    await loadReceipts();
  } catch (error) {
    console.error('取消收货单失败:', error);
    ElMessage.error('取消收货单失败: ' + (getApiErrorMessage(error, '未知错误')));
  } finally {
    updateStatusLoading.value = false;
  }
};
// 检验关联只使用来源单据 ID；数量和批次由检验记录提供。
const handleInspectionChange = async (inspectionId) => {
  if (!inspectionId) {
    receiptDialog.form.items.forEach(item => { item.qualifiedQuantity = 0; });
    return;
  }
  inspectionDetailLoading.value = true;
  try {
    const inspection = parseResponseData(await qualityApi.getIncomingInspection(inspectionId));
    if (!inspection?.id) throw new Error('来料检验单详情为空');
    if (inspection.sourceType !== 'purchase_order') throw new Error('请选择来源为采购订单的来料检验单');
    if (!RECEIPTABLE_INSPECTION_STATUSES.includes(inspection.status)) throw new Error('该检验单当前状态不能关联采购收货');
    const orderId = Number(inspection.referenceId);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) throw new Error('检验单缺少有效采购订单');
    if (receiptDialog.isEdit && orderId !== Number(receiptDialog.form.orderId)) throw new Error('检验单必须属于当前采购订单');

    const order = parseResponseData(await purchaseApi.getOrder(orderId));
    if (!order?.id) throw new Error('关联采购订单详情为空');
    const sourceItems = (order.items || []).filter(item =>
      inspection.purchaseOrderItemId
        ? Number(item.id) === Number(inspection.purchaseOrderItemId)
        : Number(item.materialId) === Number(inspection.materialId)
    );
    if (sourceItems.length !== 1) throw new Error('检验单无法唯一对应采购订单明细，请先完善检验单来源');
    const sourceItem = sourceItems[0];
    if (Number(sourceItem.materialId) !== Number(inspection.materialId)) throw new Error('检验物料与采购订单明细不一致');
    if (receiptDialog.isEdit && Number(receiptDialog.form.orderItemId) !== Number(sourceItem.id)) throw new Error('检验单必须属于当前收货的采购订单明细');
    const quantity = Number(inspection.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('检验数量必须大于0');
    if (FINISHED_INSPECTION_STATUSES.includes(inspection.status) &&
        (inspection.qualifiedQuantity == null || !Number.isFinite(Number(inspection.qualifiedQuantity)))) {
      throw new Error('终检记录缺少有效的合格数量');
    }
    const existingItem = receiptDialog.form.items.find(item => Number(item.orderItemId) === Number(sourceItem.id));

    if (!orders.value.some(item => Number(item.id) === orderId)) {
      orders.value.unshift({ id: orderId, orderNumber: order.orderNo });
    }
    receiptDialog.form.orderId = orderId;
    receiptDialog.form.orderItemId = sourceItem.id;
    setReceiptOrderItems(order);
    receiptDialog.form.supplierId = order.supplierId;
    selectedSupplierName.value = order.supplierName || null;
    if (!receiptDialog.form.warehouseId) receiptDialog.form.warehouseId = sourceItem.warehouseId || order.warehouseId || null;
    receiptDialog.form.items = [{
      id: existingItem?.id,
      orderItemId: sourceItem.id,
      materialId: sourceItem.materialId,
      materialCode: sourceItem.materialCode,
      materialName: sourceItem.materialName,
      specification: sourceItem.specification,
      unitId: sourceItem.unitId,
      unitName: sourceItem.unitName,
      orderedQuantity: Number(sourceItem.quantity),
      receivedQuantity: quantity,
      qualifiedQuantity: FINISHED_INSPECTION_STATUSES.includes(inspection.status) ? Number(inspection.qualifiedQuantity) : 0,
      batchNumber: inspection.batchNo,
      remarks: existingItem?.remarks || inspection.note || ''
    }];
  } catch (error) {
    receiptDialog.form.inspectionId = null;
    receiptDialog.form.items.forEach(item => { item.qualifiedQuantity = 0; });
    ElMessage.error(`关联来料检验单失败: ${getApiErrorMessage(error, '未知错误')}`);
  } finally {
    inspectionDetailLoading.value = false;
  }
};
// 方法：搜索收货单
function searchReceipts() {
  // 处理日期范围
  if (searchForm.dateRange && searchForm.dateRange.length === 2) {
    searchForm.startDate = searchForm.dateRange[0];
    searchForm.endDate = searchForm.dateRange[1];
  } else {
    searchForm.startDate = '';
    searchForm.endDate = '';
  }

  // 重置页码
  pagination.value.current = 1;

  // 加载数据
  loadReceipts();
}
function _handleCurrentChange(page) {
  pagination.value.current = page;
  loadReceipts();
}
async function printReceipt() {
  if (!viewDialog.receipt || !viewDialog.receipt.id) {
    ElMessage.warning('收货单数据不完整，无法打印');
    return;
  }

  try {
    // 获取收货单数据
    const receipt = { ...viewDialog.receipt };

    // 过滤掉状态变更记录
    if (receipt.remarks) {
      receipt.remarks = receipt.remarks.replace(/\s*\|\s*\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\]\s*状态变更为\s+[^|]+/g, '');
      receipt.remarks = receipt.remarks.replace(/^\s*\|\s*/, '').replace(/\s*\|\s*$/, '').trim();
    }

    const html = await printService.generateByDefaultTemplate('inventory', 'inbound', {
      inbound_no: receipt.receiptNo || receipt.inboundNo || '-',
      inbound_date: formatDate(receipt.receiptDate || receipt.inboundDate) || '-',
      inbound_type: '采购收货',
      supplier_name: receipt.supplierName || '-',
      location_name: receipt.warehouseName || receipt.locationName || '-',
      operator: receipt.receiver || '',
      status: getPurchaseReceiptStatusText(receipt.status),
      remark: receipt.remarks || '',
      print_time: new Date().toLocaleString(),
      items: (receipt.items || []).map((item, index) => ({
        index: index + 1,
        material_code: item.materialCode || '',
        material_name: item.materialName || '-',
        specification: item.specification || item.specs || '-',
        quantity: item.receivedQuantity ?? item.quantity ?? 0,
        unit_name: item.unitName || item.unit || '',
        remark: item.remarks || item.remark || ''
      }))
    });

    printService.previewDocument(html);
  } catch (error) {
    console.error('打印失败:', error);
    ElMessage.error(`打印失败：${getApiErrorMessage(error, '请稍后重试')}`);
  }
}
function _getSelectedSupplierName(supplierId) {
  if (!supplierId) return '未选择供应商';
  if (selectedSupplierName.value) {
    return selectedSupplierName.value;
  }
  const numericId = Number(supplierId);
  const supplier = suppliers.value.find(s => {
    const sid = Number(s.id || s.supplierId);
    return sid === numericId;
  });
  if (supplier) {
    return supplier.name || supplier.supplierName;
  }
  return '未命名供应商';
}
function _getAllStringFields(item) {
  if (!item) return {};
  const result = {};
  for (const [key, value] of Object.entries(item)) {
    if (typeof value === 'string' && value.trim() !== '') {
      result[key] = value;
    }
  }
  return result;
}
// 方法：完成已检验收货单入库（将状态更新为已完成）
async function directCompleteReceipt(receipt) {
  updateStatusLoading.value = true;
  try {
    await purchaseApi.updateReceiptStatus(receipt.id, {
      status: 'completed',
      remarks: '用户完成入库'
    });
    ElMessage.success('入库单已完成');
    await loadReceipts();
  } catch (error) {
    console.error('完成入库失败:', error);
    ElMessage.error(`完成入库失败: ${getApiErrorMessage(error, '请稍后重试')}`);
  } finally {
    updateStatusLoading.value = false;
  }
}
// 方法：处理实收数量变更
function handleReceivedQuantityChange(item) {
  // 确保输入的是有效数字
  if (item.receivedQuantity) {
    // 移除非数字字符(保留数字和小数点)
    item.receivedQuantity = item.receivedQuantity.toString().replace(/[^\d.]/g, '');

    // 确保只有一个小数点
    const parts = item.receivedQuantity.split('.');
    if (parts.length > 2) {
      item.receivedQuantity = parts[0] + '.' + parts.slice(1).join('');
    }

    // 限制小数点后最多两位
    if (parts.length > 1 && parts[1].length > 2) {
      item.receivedQuantity = parts[0] + '.' + parts[1].substring(0, 2);
    }

    // 转换为数字类型
    item.receivedQuantity = parseFloat(item.receivedQuantity);

    // 确保合格数量不超过实收数量
    if (item.qualifiedQuantity > item.receivedQuantity) {
      item.qualifiedQuantity = item.receivedQuantity;
    }
  }
}

useInventoryPostingSourceLink({
  path: '/purchase/receipts',
  sourceTypes: ["purchase_receipt"],
  open: ({ id }) => viewReceipt({ id }),
  setSearch: (sourceNo) => { searchForm.receiptNo = sourceNo },
})
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
.no-data-info {
  padding: 20px 0;
}
/* 操作按钮样式 - 与库存出库页面保持一致 */
.el-table .el-button + .el-button {
  margin-left: 8px;
}
/* 响应式布局 - 针对6个统计卡片的特殊处理 */
@media (max-width: 1400px) {
  .stat-card {
    min-width: 120px;
  }
}
@media (max-width: 1200px) {
  .stat-card {
    min-width: 110px;
  }
}
@media (max-width: 1000px) {
  .stat-card {
    min-width: 100px;
  }
}
@media (max-width: 900px) {
  .statistics-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--spacing-base);
  }
  .stat-card {
    min-width: auto;
  }
}
@media (max-width: 768px) {
  .statistics-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
}
@media (max-width: 480px) {
  .stat-card {
    margin-bottom: 0;
  }
}
.purchase-view-desc,
.purchase-view-desc :deep(.el-descriptions__body),
.purchase-view-desc :deep(.el-descriptions__table),
.purchase-view-table {
  width: 100%;
}
.purchase-view-desc :deep(.el-descriptions__label) {
  width: 112px;
  min-width: 112px;
  white-space: nowrap;
}
.purchase-view-desc :deep(.el-descriptions__content) {
  min-width: 0;
  white-space: normal;
  word-break: break-word;
}
:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
