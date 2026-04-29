<!--
/**
 * PurchaseReceipts.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="purchase-receipts-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>采购收货管理</h2>
          <p class="subtitle">管理采购收货与验收</p>
        </div>
        <el-button type="primary" :icon="Plus" @click="showAddDialog">新建收货单</el-button>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="收货单号">
          <el-input  v-model="searchForm.receiptNo" placeholder="请输入收货单号" clearable ></el-input>
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
        <el-form-item>
          <el-button type="primary" @click="searchReceipts" :loading="loading">
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
        <div class="stat-value">{{ receiptStats.total || 0 }}</div>
        <div class="stat-label">收货单总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ receiptStats.draftCount || 0 }}</div>
        <div class="stat-label">草稿状态</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ receiptStats.confirmedCount || 0 }}</div>
        <div class="stat-label">已确认收货</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ receiptStats.completedCount || 0 }}</div>
        <div class="stat-label">已完成入库</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ qualifiedInspections.length || 0 }}</div>
        <div class="stat-label">检验合格</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(receiptStats.totalAmount || 0) }}</div>
        <div class="stat-label">收货总金额</div>
      </el-card>
    </div>
    
    <!-- 收货单列表 -->
    <el-card class="data-card">
      <el-table
        v-loading="loading"
        :data="receipts"
        border
        style="width: 100%"
      >
        <template #empty>
          <el-empty description="暂无收货单数据" />
        </template>
        <el-table-column prop="receipt_no" label="收货单号" min-width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="receipt_date" label="收货日期" min-width="110">
          <template #default="scope">
            {{ formatDate(scope.row.receipt_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="order_no" label="关联订单" min-width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="supplier_name" label="供应商" min-width="300" show-overflow-tooltip></el-table-column>
        <el-table-column prop="receiver" label="收货人" min-width="100"></el-table-column>
        <el-table-column prop="warehouse_name" label="入库仓库" min-width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="status" label="状态" min-width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">{{ getStatusText(scope.row.status) }}</el-tag>
            <el-tag v-if="scope.row.inspectionId" type="success" size="small" style="margin-left: 5px;">已检验</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="250" fixed="right">
          <template #default="scope">
            <el-button
              size="small"
              @click="viewReceipt(scope.row)"
            >
              查看
            </el-button>
            <el-button
              v-if="scope.row.status === 'draft'"
              size="small"
              type="primary"
              @click="editReceipt(scope.row)"
              v-permission="'purchase:receipts:update'"
            >
              编辑
            </el-button>
            <el-popconfirm
              v-if="scope.row.status === 'draft'"
              title="确定要入库该收货单吗？"
              @confirm="directCompleteReceipt(scope.row)"
            >
              <template #reference>
                <el-button size="small" type="success">入库</el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              v-if="scope.row.status === 'draft'"
              title="确定要取消该收货单吗？"
              @confirm="cancelReceipt(scope.row)"
              confirm-button-type="warning"
            >
              <template #reference>
                <el-button size="small" type="warning">取消</el-button>
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
          :page-sizes="[10, 20, 50, 100]"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total"
        ></el-pagination>
      </div>
    </el-card>
    
    <!-- 查看收货单详情对话框 -->
    <el-dialog
      title="收货单详情"
      v-model="viewDialog.show"
      width="800px"
      destroy-on-close
    >
      <div v-loading="detailLoading">
        <el-descriptions border :column="2">
          <el-descriptions-item label="收货单号">{{ viewDialog.receipt.receipt_no }}</el-descriptions-item>
          <el-descriptions-item label="收货日期">{{ formatDate(viewDialog.receipt.receipt_date) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(viewDialog.receipt.status)">{{ getStatusText(viewDialog.receipt.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="关联订单">{{ viewDialog.receipt.order_no }}</el-descriptions-item>
          <el-descriptions-item label="供应商">{{ viewDialog.receipt.supplier_name }}</el-descriptions-item>
          <el-descriptions-item label="收货人">{{ viewDialog.receipt.receiver }}</el-descriptions-item>
          <el-descriptions-item label="入库仓库">{{ viewDialog.receipt.warehouse_name }}</el-descriptions-item>
          <el-descriptions-item v-if="viewDialog.receipt.inspectionId" label="检验状态" :span="2">
            <el-tag type="success">已通过来料检验</el-tag>
            <span v-if="viewDialog.receipt.inspectionNo" style="margin-left: 10px">检验单号: {{ viewDialog.receipt.inspectionNo }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ viewDialog.receipt.remarks }}</el-descriptions-item>
        </el-descriptions>
        
        <el-divider content-position="center">收货物料</el-divider>
        <template v-if="!viewDialog.receipt.items || viewDialog.receipt.items.length === 0">
          <div class="no-data-info">
            <el-empty description="暂无物料数据"></el-empty>
          </div>
        </template>
        <el-table v-else :data="viewDialog.receipt.items || []" border style="width: 100%">
          <el-table-column type="index" label="序号" width="60" align="center"></el-table-column>
          <el-table-column label="物料名称" prop="material_name" min-width="150">
            <template #default="scope">
              {{ scope.row.material_name || scope.row.materialName || '未知物料' }}
            </template>
          </el-table-column>
          <el-table-column label="编码" min-width="120">
            <template #default="scope">
              {{ scope.row.code || scope.row.material_code || '' }}
            </template>
          </el-table-column>
          <el-table-column label="规格型号" prop="specification" min-width="220">
            <template #default="scope">
              {{ scope.row.specification || scope.row.specs || scope.row.standard || scope.row.model || scope.row.spec || '未提供' }}
            </template>
          </el-table-column>
          <el-table-column label="单位" prop="unit_name" min-width="80">
            <template #default="scope">
              {{ scope.row.unit_name || scope.row.unit || '个' }}
            </template>
          </el-table-column>
          <el-table-column label="订单数量" prop="ordered_quantity" min-width="100" align="center">
            <template #default="scope">
              {{ Number(scope.row.ordered_quantity || scope.row.quantity || 0).toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column label="实收数量" prop="received_quantity" min-width="100" align="center">
            <template #default="scope">
              {{ Number(scope.row.received_quantity || 0).toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column label="合格数量" prop="qualified_quantity" min-width="100" align="center">
            <template #default="scope">
              {{ Number(scope.row.qualified_quantity || 0).toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column label="质检状态" min-width="100" align="center">
            <template #default="scope">
              <el-tag type="success" v-if="Number(scope.row.qualified_quantity || 0) >= Number(scope.row.received_quantity || 0)">合格</el-tag>
              <el-tag type="warning" v-else-if="Number(scope.row.qualified_quantity || 0) > 0">部分合格</el-tag>
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
    </el-dialog>
    
    <!-- 新建/编辑收货单对话框 -->
    <el-dialog
      :title="receiptDialog.isEdit ? '编辑收货单' : '新建收货单'"
      v-model="receiptDialog.show"
      width="900px"
      destroy-on-close
    >
      <el-form ref="receiptForm" :model="receiptDialog.form" :rules="receiptRules" label-width="100px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="关联订单" prop="orderId">
              <el-select
                v-model="receiptDialog.form.orderId"
                placeholder="请选择订单"
                filterable
                style="width: 100%"
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
            <el-form-item label="收货日期" prop="receiptDate">
              <el-date-picker
                v-model="receiptDialog.form.receiptDate"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              ></el-date-picker>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="供应商" prop="supplierId">
              <div v-if="selectedSupplierName" style="display: flex; align-items: center; margin-bottom: 10px;">
                <el-tag type="success" size="large" style="margin-right: 10px;">
                  <strong>{{ selectedSupplierName }}</strong>
                </el-tag>
                <el-button link @click="selectedSupplierName = null">
                  <el-icon><Close /></el-icon>
                </el-button>
              </div>
              <el-select
                v-model="receiptDialog.form.supplierId"
                placeholder="请选择供应商"
                filterable
                style="width: 100%"
                value-key="id"
                v-if="!selectedSupplierName"
              >
                <el-option
                  v-for="item in suppliers"
                  :key="item.id || item.supplier_id"
                  :label="item.name || item.supplier_name"
                  :value="Number(item.id || item.supplier_id)"
                >
                  <div style="display: flex; flex-direction: column;">
                    <span>{{ item.name || item.supplier_name }}</span>
                    <small style="color: #999">
                      {{ item.address || item.supplier_address || '' }}
                    </small>
                  </div>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="收货人" prop="receiver">
              <el-input v-model="receiptDialog.form.receiver" placeholder="请输入收货人"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="入库仓库" prop="warehouseId">
              <el-select
                v-model="receiptDialog.form.warehouseId"
                placeholder="请选择仓库"
                filterable
                style="width: 100%"
                @change="(val) => { 
                  // 确保ID是数字类型
                  if (val) {
                    receiptDialog.form.warehouseId = Number(val);
                    // 验证所选仓库是否有效
                    if (!validateWarehouseId(receiptDialog.form.warehouseId)) {
                      showSnackbar('警告：所选仓库ID不在系统中，请重新选择', 'warning');
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
                  <div style="display: flex; flex-direction: column;">
                    <span>{{ item.name }}</span>
                    <small style="color: #999">
                      ID: {{ Number(item.id) }} | 代码: {{ item.code || '无' }} | 类型: {{ item.type || '标准' }}
                    </small>
                  </div>
                </el-option>
              </el-select>
              <div v-if="warehouses.length === 0" style="color: var(--color-danger); font-size: 12px; margin-top: 5px;">
                警告：系统中未找到有效的仓库，请先创建仓库
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="来料检验单" prop="inspectionId">
              <el-select
                v-model="receiptDialog.form.inspectionId"
                placeholder="选择已检验合格的来料单"
                filterable
                clearable
                style="width: 100%"
                @change="handleInspectionChange"
              >
                <el-option
                  v-for="item in qualifiedInspections"
                  :key="item.id"
                  :label="`${item.inspection_no} - ${item.item_name}`"
                  :value="item.id"
                >
                  <div style="display: flex; justify-content: space-between; align-items: center">
                    <span>{{ item.inspection_no }}</span>
                    <el-tag size="small" type="success">已检验合格</el-tag>
                  </div>
                  <div style="font-size: 12px; color: #999">
                    {{ item.item_name }} - {{ item.supplier_name ? (item.supplier_name.includes('(') ? item.supplier_name.split('(')[0].trim() : item.supplier_name) : '' }} - 批次: {{ item.batch_no }}
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
              ></el-input>
            </el-form-item>
          </el-col>
        </el-row>
        
        <div class="mt-4">
          <div class="mb-2 font-weight-bold">物料清单</div>
          <el-table :data="receiptDialog.form.items" border style="width: 100%">
            <el-table-column type="index" label="序号" width="50" align="center"></el-table-column>
            <el-table-column label="物料名称" prop="materialName" min-width="150"></el-table-column>
            <el-table-column label="规格" prop="specification" min-width="120"></el-table-column>
            <el-table-column label="单位" prop="unitName" min-width="80"></el-table-column>
            <el-table-column label="订单数量" min-width="100" align="center">
              <template #default="scope">
                {{ scope.row.orderedQuantity }}
              </template>
            </el-table-column>
            <el-table-column label="实收数量" min-width="120" align="center">
              <template #default="scope">
                <el-input
                  v-model="scope.row.receivedQuantity"
                  type="text"
                  size="small"

                  @input="handleReceivedQuantityChange(scope.row)"
                ></el-input>
              </template>
            </el-table-column>
            <el-table-column label="合格数量" min-width="120" align="center">
              <template #default="scope">
                <el-input
                  v-model="scope.row.qualifiedQuantity"
                  type="text"
                  size="small"

                  @input="handleQualifiedQuantityChange(scope.row)"
                ></el-input>
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
          <el-button type="primary" @click="submitReceipt" :loading="submitLoading">确 定</el-button>
        </span>
      </template>
    </el-dialog>
    

  </div>
</template>

<script setup>
import { parsePaginatedData } from '@/utils/responseParser';

import { ref, reactive, computed, onMounted, nextTick, watch } from 'vue';
import { useSnackbar } from '@/composables/useSnackbar';
import { purchaseApi, qualityApi, baseDataApi } from '@/services/api';
import api from '@/services/api';
import { formatCurrency } from '@/utils/helpers/formatters';
import { ElMessage } from 'element-plus'
import axios from 'axios';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { Plus, Search, Refresh } from '@element-plus/icons-vue'
import {
  PURCHASE_RECEIPT_STATUS_OPTIONS,
  getPurchaseReceiptStatusText,
  getPurchaseReceiptStatusColor
} from '@/constants/systemConstants';

const { showSnackbar } = useSnackbar();

// 初始化认证存储
const authStore = useAuthStore();

const API_URL = import.meta.env.VITE_API_URL || '';

// 添加表单引用
const receiptForm = ref(null);

// 供应商选择状态
const selectedSupplierName = ref(null);

// 表单验证规则
const receiptRules = {
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
  ],
  inspectionId: [
    { required: true, message: '请选择来料检验单', trigger: 'change' }
  ]
};

// 收货单数据
const receipts = ref([]);
const loading = ref(false);
const submitLoading = ref(false);
const updateStatusLoading = ref(false);
const detailLoading = ref(false);
const totalReceipts = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);

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

// 来料检验合格的订单
const qualifiedInspections = ref([]);
const loadingQualifiedInspections = ref(false);

// 表格列定义
const headers = [
  { text: '收货单号', value: 'receiptNumber', sortable: true },
  { text: '收货日期', value: 'receiptDate', sortable: true },
  { text: '关联订单', value: 'orderNumber', sortable: true },
  { text: '供应商', value: 'supplierName', sortable: true },
  { text: '收货人', value: 'receiver', sortable: true },
  { text: '入库仓库', value: 'warehouseName', sortable: true },
  { text: '状态', value: 'status', sortable: true },
  { text: '操作', value: 'actions', sortable: false, align: 'center' }
];

const itemHeaders = [
  { text: '物料名称', value: 'materialName' },
  { text: '规格', value: 'specification' },
  { text: '单位', value: 'unitName' },
  { text: '订单数量', value: 'orderedQuantity', align: 'center' },
  { text: '实收数量', value: 'receivedQuantity', align: 'center' },
  { text: '合格数量', value: 'qualifiedQuantity', align: 'center' },
  { text: '备注', value: 'remarks' }
];

const viewItemHeaders = [
  { text: '物料名称', value: 'materialName' },
  { text: '规格', value: 'specification' },
  { text: '单位', value: 'unitName' },
  { text: '订单数量', value: 'orderedQuantity', align: 'center' },
  { text: '实收数量', value: 'receivedQuantity', align: 'center' },
  { text: '合格数量', value: 'qualifiedQuantity', align: 'center' },
  { text: '质检状态', value: 'qualityStatus', align: 'center' },
  { text: '备注', value: 'remarks' }
];

// 状态选项（使用统一常量）
const statusOptions = PURCHASE_RECEIPT_STATUS_OPTIONS.map(opt => ({ text: opt.label, value: opt.value }));

// 搜索表单
const searchForm = reactive({
  receiptNo: '',
  orderNo: '',
  dateRange: [],
  startDate: '',
  endDate: ''
});

// 新建/编辑收货单对话框
const receiptDialog = reactive({
  show: false,
  isEdit: false,
  valid: false,
  dateMenu: false,
  form: {
    id: null,
    orderId: null,
    supplierId: null,
    receiptDate: new Date().toISOString().substr(0, 10),
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
  confirmedCount: 0,
  completedCount: 0,
  totalAmount: 0
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
    loadReceiptStats(),
    loadQualifiedInspections()
  ]);
  
  // 检查URL中是否有检验单ID参数
  const inspectionId = route.query.inspectionId;
  
  if (inspectionId) {
    // 等待数据加载完成
    await nextTick();
    // 打开新建收货单对话框
    createReceiptDialog();
    // 选择检验单
    receiptDialog.form.inspectionId = Number(inspectionId);
    await handleInspectionChange(Number(inspectionId));
  }
});

// 方法：加载已检验合格的订单
const loadQualifiedInspections = async () => {
  loadingQualifiedInspections.value = true;
  try {
    const response = await qualityApi.getIncomingInspections({
      status: 'passed', // 只获取状态为合格的检验单
      page: 1,
      size: 100 // 获取较多数据以确保能找到需要的检验单
    });
    
    if (response && response.data) {
      // 处理不同的响应数据结构
      const responseData = response.data?.data || response.data;
      // 拦截器已解包，response.data 就是业务数据
      let inspectionData = [];
      if (Array.isArray(responseData)) {
        inspectionData = responseData;
      } else if (responseData.items && Array.isArray(responseData.items)) {
        inspectionData = responseData.items;
      } else if (responseData.list && Array.isArray(responseData.list)) {
        inspectionData = responseData.list;
      }
      
      qualifiedInspections.value = inspectionData.map(item => ({
        id: item.id,
        inspection_no: item.inspection_no || item.inspectionNo,
        item_name: item.item_name || item.itemName,
        supplier_name: item.supplier_name || item.supplierName,
        batch_no: item.batch_no || item.batchNo,
        status: item.status
      }));
    } else {
      console.warn('未获取到来料检验单数据');
      qualifiedInspections.value = [];
    }
  } catch (error) {
    console.error('加载合格来料检验单失败:', error);
    showSnackbar('加载合格来料检验单失败', 'error');
    qualifiedInspections.value = [];
  } finally {
    loadingQualifiedInspections.value = false;
  }
};

// 方法：加载收货单列表
async function loadReceipts() {
  loading.value = true;
  try {
    const params = {
      page: pagination.value.current,
      limit: pagination.value.size,
      receiptNumber: searchForm.receiptNo || undefined,
      orderNumber: searchForm.orderNo || undefined,
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
    
    await loadReceiptStats();
  } catch (error) {
    console.error('加载收货单失败:', error);
    showSnackbar('加载收货单失败: ' + (error.message || '未知错误'), 'error');
    receipts.value = []; // 确保在出错时receipts是一个数组
  } finally {
    loading.value = false;
  }
}

// 方法：加载供应商列表
const loadSuppliers = async () => {
  try {
    const params = { limit: 1000 };
    const response = await baseDataApi.getSuppliers(params);

    if (!response || !response.data) {
      console.error('供应商API返回无效数据:', response);
      suppliers.value = [];
      return;
    }

    const responseData = response.data?.data || response.data;
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
      id: supplier.id || supplier.supplier_id,
      code: supplier.code || supplier.supplier_code,
      name: supplier.name || supplier.supplier_name || supplier.company_name,
      contactPerson: supplier.contact_person || supplier.contactPerson,
      contactPhone: supplier.contact_phone || supplier.contactPhone,
      status: supplier.status || 1
    }));
    
    // 特别检查ID为11的供应商
    const supplier11 = suppliers.value.find(s => Number(s.id) === 11);
    if (!supplier11) {
      // 手动添加ID为11的供应商作为临时解决方案
      suppliers.value.push({
        id: 11,
        supplier_id: 11,
        name: '供应商11',  // 临时名称，后续会被实际名称覆盖
        code: 'S11'
      });
    }
  } catch (error) {
    console.error('加载供应商列表失败:', error);
    showSnackbar('加载供应商列表失败', 'error');
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
      limit: 1000 // 进一步增加查询数量限制
    });
    
    // 确保orders.value是数组
    const responseData = response.data?.data || response.data;
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
      console.warn('获取订单数据格式异常:', responseData);
      orders.value = [];
    }
    
    // 标准化所有订单号，统一大小写和格式，同时检查并纠正订单字段名
    if (Array.isArray(orders.value)) {
      orders.value.forEach(order => {
        // 检查多种可能的字段名称
        let orderNumber = 
          order.orderNumber || 
          order.order_number || 
          order.orderNo || 
          order.order_no || 
          order.number || 
          order.no || 
          '未知订单号';
        
        // 保存原始订单号
        order.originalOrderNumber = orderNumber;
        
        // 标准化订单号
        order.orderNumber = normalizeOrderNumber(orderNumber);
        
        // 确保所有可能的订单号字段都有值
        order.order_number = order.orderNumber;
        order.orderNo = order.orderNumber;
        order.order_no = order.orderNumber;
      });
    }
    
    // 如果仍然所有订单都是未知订单号，记录警告
    if (orders.value.length > 0 && orders.value.every(o => !o.orderNumber || o.orderNumber === '未知订单号')) {
      console.warn('警告：所有订单都没有有效的订单号');
    }
  } catch (error) {
    console.error('加载订单失败:', error);
    showSnackbar('加载订单失败', 'error');
    orders.value = []; // 确保在出错时orders是一个数组
  }
}

// 方法：加载仓库列表
async function loadWarehouses() {
  try {
    let hasData = false;
    
    // 第一种方法：从/inventory/locations接口获取数据
    try {
      const directResponse = await api.get('/inventory/locations', {
        params: {
          limit: 1000,
          active: true // 只获取活跃的仓库
        }
      });
      
      if (directResponse && directResponse.data) {
        // 处理 ResponseHandler 格式的响应
        let warehouseData = [];
        const data = directResponse.data?.data || directResponse.data;

        if (Array.isArray(data)) {
          warehouseData = data;
        } else if (data?.items && Array.isArray(data.items)) {
          warehouseData = data.items;
        } else if (data?.list && Array.isArray(data.list)) {
          warehouseData = data.list;
        } else if (typeof data === 'object' && data !== null && !data.success) {
          // 可能是单个仓库对象（排除 ResponseHandler 格式）
          warehouseData = [data];
        }

        if (warehouseData.length > 0) {
          // 规范化仓库数据
          warehouses.value = warehouseData.map(warehouse => ({
            id: Number(warehouse.id),
            name: warehouse.name || '未命名仓库',
            code: warehouse.code || '',
            type: warehouse.type || '标准',
            location_id: Number(warehouse.id),
            originalData: { ...warehouse }
          }));

          hasData = true;
        }
      }
    } catch (error) {
      console.warn('从inventory/locations获取数据失败:', error);
    }

    // 第二种方法：如果第一种方法失败，尝试从/baseData/locations获取数据
    if (!hasData) {
      try {
        const locationsResponse = await api.get('/baseData/locations', {
          params: { limit: 1000 }
        });

        if (locationsResponse && locationsResponse.data) {
          // 处理 ResponseHandler 格式的响应
          let locationsData = [];
          const data = locationsResponse.data?.data || locationsResponse.data;

          if (Array.isArray(data)) {
            locationsData = data;
          } else if (data?.items && Array.isArray(data.items)) {
            locationsData = data.items;
          } else if (data?.list && Array.isArray(data.list)) {
            locationsData = data.list;
          } else if (typeof data === 'object' && data !== null && !data.success) {
            // 可能是单个位置对象
            locationsData = [data];
          }

          if (locationsData.length > 0) {
            // 规范化仓库数据
            warehouses.value = locationsData.map(location => ({
              id: Number(location.id),
              name: location.name || '未命名仓库',
              code: location.code || '',
              type: location.type || '标准',
              location_id: Number(location.id),
              originalData: { ...location }
            }));

            hasData = true;
          }
        }
      } catch (error) {
        console.warn('从baseData/locations获取数据失败:', error);
      }
    }
    
    // 如果两种方法都失败，使用模拟数据
    if (!hasData || warehouses.value.length === 0) {
      warehouses.value = [
        { id: 1, name: '主仓库', code: 'WH001', type: 'main', location_id: 1 },
        { id: 2, name: '零部件仓库', code: 'WH002', type: 'component', location_id: 2 },
        { id: 3, name: '成品仓库', code: 'WH003', type: 'finished', location_id: 3 }
      ];
    }
    
    // 确保每个仓库都有warehouseId属性
    warehouses.value.forEach(warehouse => {
      warehouse.warehouseId = warehouse.id;
    });
  } catch (error) {
    console.error('加载仓库列表失败:', error);
    showSnackbar('加载仓库列表失败', 'error');
    // 设置默认仓库数据
    warehouses.value = [
      { id: 1, name: '主仓库', code: 'WH001', type: 'main', location_id: 1, warehouseId: 1 },
      { id: 2, name: '零部件仓库', code: 'WH002', type: 'component', location_id: 2, warehouseId: 2 },
      { id: 3, name: '成品仓库', code: 'WH003', type: 'finished', location_id: 3, warehouseId: 3 }
    ];
  }
}

// 方法：重置搜索条件
function resetSearch() {
  searchForm.receiptNo = '';
  searchForm.orderNo = '';
  searchForm.dateRange = [];
  searchForm.startDate = '';
  searchForm.endDate = '';
  pagination.value.current = 1;
  loadReceipts();
}

// 方法：处理页码变更
function handlePageChange(page) {
  pagination.value.current = page;
  loadReceipts();
}

// 方法：处理每页显示数量变更
function handleSizeChange(size) {
  pagination.value.size = size;
  pagination.value.current = 1;
  loadReceipts();
}

// 方法：获取状态文本（使用统一常量）
function getStatusText(status) {
  return getPurchaseReceiptStatusText(status);
}

// 方法：获取状态颜色（使用统一常量）
function getStatusColor(status) {
  return getPurchaseReceiptStatusColor(status);
}

// 方法：获取状态类型（使用统一常量）
function getStatusType(status) {
  return getStatusColor(status);
}

// 方法：格式化日期
function formatDate(date) {
  if (!date) return '-';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    return d.toISOString().split('T')[0];
  } catch {
    return date;
  }
}

// 方法：打开创建收货单对话框
function showAddDialog() {
  receiptDialog.isEdit = false;
  receiptDialog.form = {
    id: null,
    orderId: null,
    supplierId: null,
    receiptDate: new Date().toISOString().substr(0, 10),
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
      // 匹配形如 | [2025-04-23T07:15:34.913Z] 状态变更为 confirmed: 用户直接确认入库 的内容
      data.remarks = data.remarks.replace(/\s*\|\s*\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\]\s*状态变更为\s+[^|]+/g, '');
      // 清理可能残留的前后分隔符和空白
      data.remarks = data.remarks.replace(/^\s*\|\s*/, '').replace(/\s*\|\s*$/, '').trim();
    }
    
    // 确保items数组存在
    if (!data.items) {
      data.items = [];
      console.warn('收货单详情中items字段为空，初始化为空数组');
    } else {
      // 处理第一个物料项的规格字段
      if (data.items.length > 0) {
        const firstItem = data.items[0];
        
        // 如果规格字段为空，尝试从物料主数据获取
        if (!firstItem.specification && firstItem.material_id) {
          try {
            const materialResponse = await baseDataApi.getMaterial(firstItem.material_id);
            if (materialResponse.data) {
              firstItem.specification = materialResponse.data.specs || 
                                     materialResponse.data.specification || 
                                     materialResponse.data.standard;
            }
          } catch (materialError) {
            console.warn('获取物料主数据失败:', materialError);
          }
        }
      }
    }
    
    // 如果收货单items为空但收货单存在，尝试从订单获取物料项
    if (data.items.length === 0 && data.order_id) {
      try {
        const orderResponse = await purchaseApi.getOrder(data.order_id);
        
        if (orderResponse && orderResponse.data) {
          if (Array.isArray(orderResponse.data.items) && orderResponse.data.items.length > 0) {
            
            // 转换订单物料项到收货单物料项
            data.items = orderResponse.data.items.map(item => ({
              material_id: item.material_id,
              material_name: item.material_name,
              material_code: item.material_code || item.code,
              specification: item.specs || item.specification || item.standard || item.model || item.spec,
              unit: item.unit,
              unit_name: item.unit_name,
              ordered_quantity: Number(item.quantity || 0),
              received_quantity: Number(item.received_quantity || 0),
              qualified_quantity: Number(item.qualified_quantity || 0),
              remarks: item.remarks || ''
            }));
          }
        }
      } catch (extraError) {
        console.warn('尝试额外获取物料项数据失败:', extraError);
      }
    }
    
    viewDialog.receipt = data;
    viewDialog.show = true;
  } catch (error) {
    console.error('获取收货单详情失败:', error);
    showSnackbar('获取收货单详情失败: ' + (error.message || '未知错误'), 'error');
  } finally {
    detailLoading.value = false;
  }
}

// 方法：确保检验单在列表中可见
const ensureInspectionInList = async (inspectionId, inspectionNo) => {
  if (!inspectionId) return;

  // 检查检验单是否已在列表中
  const existingInspection = qualifiedInspections.value.find(item =>
    Number(item.id) === Number(inspectionId)
  );

  if (!existingInspection) {
    try {
      // 如果不在列表中，尝试获取检验单详情并添加到列表
      const response = await qualityApi.getIncomingInspection(inspectionId);
      if (response && response.data) {
        // axios拦截器已自动解包ResponseHandler格式
        const inspection = response.data;

        // 添加到检验单列表中
        const inspectionItem = {
          id: inspection.id,
          inspection_no: inspection.inspection_no || inspection.inspectionNo || inspectionNo,
          item_name: inspection.item_name || inspection.itemName || '未知物料',
          supplier_name: inspection.supplier_name || inspection.supplierName || '',
          batch_no: inspection.batch_no || inspection.batchNo || '',
          status: inspection.status || 'passed'
        };

        qualifiedInspections.value.unshift(inspectionItem);
      }
    } catch (error) {
      // 如果获取失败，创建一个基本的检验单项
      if (inspectionNo) {
        qualifiedInspections.value.unshift({
          id: inspectionId,
          inspection_no: inspectionNo,
          item_name: '未知物料',
          supplier_name: '',
          batch_no: '',
          status: 'passed'
        });
      }
    }
  }
};

// 方法：编辑收货单
async function editReceipt(receipt) {

  receiptDialog.isEdit = true;

  // 重置供应商显示状态
  selectedSupplierName.value = null;

  receiptDialog.form = {
    id: receipt.id,
    orderId: receipt.order_id,
    supplierId: receipt.supplier_id, // 添加供应商ID
    receiptDate: receipt.receipt_date,
    receiver: receipt.receiver,
    warehouseId: receipt.warehouse_id,
    inspectionId: receipt.inspection_id,
    remarks: receipt.remarks,
    items: [...(receipt.items || [])].map(item => {
      return {
        ...item,
        id: item.id || item.item_id, // 确保有ID字段
        materialId: item.material_id,
        materialName: item.material_name,
        unitId: item.unit_id,
        unitName: item.unit_name,
        receivedQuantity: Number(item.received_quantity),
        qualifiedQuantity: Number(item.qualified_quantity),
        orderedQuantity: Number(item.ordered_quantity)
      };
    })
  };

  // 设置供应商显示名称
  if (receipt.supplier_name) {
    selectedSupplierName.value = receipt.supplier_name;
  } else if (receipt.supplier_id) {
    // 如果没有供应商名称，从供应商列表中查找
    const supplier = suppliers.value.find(s =>
      Number(s.id) === Number(receipt.supplier_id) ||
      Number(s.supplier_id) === Number(receipt.supplier_id)
    );
    if (supplier) {
      selectedSupplierName.value = supplier.name || supplier.supplier_name;
    }
  }

  // 确保来料检验单在列表中可见
  if (receipt.inspection_id) {
    await ensureInspectionInList(receipt.inspection_id, receipt.inspection_no);
  }

  receiptDialog.show = true;
}

// 方法：处理订单选择变更
async function handleOrderChange(orderId) {
  if (!orderId) {
    receiptDialog.form.items = [];
    return;
  }
  
  try {
    const { data } = await purchaseApi.getOrder(orderId);
    if (!data) {
      showSnackbar('获取订单详情失败', 'error');
      return;
    }
    
    // 获取订单中的供应商ID
    // 兼容处理不同的字段命名方式
    const supplierId = data.supplierId || data.supplier_id;
    if (supplierId) {
      receiptDialog.form.supplierId = supplierId;
    }
    
    // 提取订单中每个物料项的仓库ID（如果存在）
    const uniqueWarehouseIds = new Set();
    
    // 处理订单物料项 - 兼容不同的数据结构
    const orderItems = Array.isArray(data.items) ? data.items : [];
    
    if (orderItems.length === 0) {
      console.warn('订单中没有物料项');
      showSnackbar('订单中无物料项，请手动添加', 'warning');
    }
    
    receiptDialog.form.items = orderItems.map(item => {
      // 规范化物料项字段，兼容不同命名方式
      const materialId = item.materialId || item.material_id;
      const materialCode = item.materialCode || item.material_code;
      const materialName = item.materialName || item.material_name;
      const specification = item.specification || item.specs;
      const unitId = item.unitId || item.unit_id;
      const unitName = item.unitName || item.unit_name;
      const quantity = item.quantity || item.ordered_quantity || 0;
      const price = item.price || item.unit_price || 0;
      // 获取仓库ID并直接转换为数字类型
      const originalWarehouseId = item.warehouseId || item.warehouse_id || null;
      const warehouseId = originalWarehouseId !== null ? Number(originalWarehouseId) : null;
      
      // 如果物料有仓库ID，添加到集合中 (使用转换后的数字类型)
      if (warehouseId !== null) {
        uniqueWarehouseIds.add(warehouseId);
      }
      
      return {
        materialId,
        materialCode,
        materialName,
        specification,
        unitId,
        unitName,
        orderedQuantity: Number(quantity),
        receivedQuantity: 0,
        qualifiedQuantity: 0,
        price: Number(price),
        warehouseId, // 使用转换后的数字类型ID
        warehouse_id: warehouseId, // 添加备用字段名
        location_id: warehouseId, // 添加与后端匹配的字段名
        remarks: ''
      };
    });
    
    // 根据物料项中的仓库ID设置收货单表单级的仓库ID
    if (uniqueWarehouseIds.size === 1) {
      // 如果所有物料都使用同一个仓库，则设置表单级的仓库ID
      const warehouseId = Array.from(uniqueWarehouseIds)[0];
      const numericWarehouseId = Number(warehouseId);
      receiptDialog.form.warehouseId = numericWarehouseId; // 使用转换后的数字类型
    } else if (uniqueWarehouseIds.size > 1) {
      // 如果物料使用不同仓库，清空表单级的仓库ID，将使用物料级的仓库ID
      receiptDialog.form.warehouseId = null;
    } else {
      // 如果没有在物料中找到仓库ID，则确保订单本身有仓库ID
      const orderWarehouseId = data.warehouseId || data.warehouse_id;
      if (orderWarehouseId) {
        const numericWarehouseId = Number(orderWarehouseId);
        receiptDialog.form.warehouseId = numericWarehouseId; // 使用转换后的数字类型
        
        // 设置所有物料项的仓库ID
        receiptDialog.form.items.forEach(item => {
          item.warehouseId = numericWarehouseId;
        });
      } else {
        // 如果订单本身也没有仓库ID，则保留表单级仓库ID为空，需要用户手动选择
        receiptDialog.form.warehouseId = null;
      }
    }
    
    // 设置订单编号，便于用户参考
    // 不影响实际提交的数据，只作为显示用
    receiptDialog.orderNumber = data.order_number || data.orderNumber || data.order_no || '';
  } catch (error) {
    console.error('获取订单详情失败:', error);
    showSnackbar('获取订单详情失败', 'error');
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
    console.warn(`仓库ID ${numericId} 不在可用的仓库列表中`);
    const availableIds = warehouses.value.map(w => `${w.id} (${w.name})`).join(', ');
    console.warn(`可用的仓库: ${availableIds}`);
  }
  return found;
}

// 方法：提交收货单
const submitReceipt = async () => {
  if (!receiptDialog.form.inspectionId) {
    showSnackbar('请选择合格的来料检验单', 'warning');
    return;
  }

  try {
    await receiptForm.value.validate();
    
    // 验证必要字段
    if (!receiptDialog.form.orderId) {
      showSnackbar('请选择关联订单', 'warning');
      return;
    }
    
    // 验证物料数量
    const invalidItems = receiptDialog.form.items.filter(item => 
      !item.receivedQuantity || item.receivedQuantity <= 0 || 
      !item.qualifiedQuantity || item.qualifiedQuantity <= 0 ||
      item.qualifiedQuantity > item.receivedQuantity
    );
    
    if (invalidItems.length > 0) {
      showSnackbar('请检查物料数量，确保实收数量和合格数量大于0，且合格数量不超过实收数量', 'warning');
      return;
    }

    submitLoading.value = true;
    
    // 尝试获取最新的用户信息，确保实时更新
    try {
      await authStore.fetchUserProfile();
    } catch (error) {
      console.warn('获取用户信息失败，将使用当前缓存的用户信息');
    }
    
    // 确保收货人字段使用真实姓名
    if (!receiptDialog.form.receiver && authStore.realName) {
      receiptDialog.form.receiver = authStore.realName;
    }
    
    // 准备提交数据
    const submitData = {
      order_id: receiptDialog.form.orderId, // 添加必要的orderId字段
      orderId: receiptDialog.form.orderId, // 添加驼峰命名格式
      inspection_id: receiptDialog.form.inspectionId,
      inspectionId: receiptDialog.form.inspectionId, // 添加驼峰命名格式
      receipt_date: receiptDialog.form.receiptDate,
      receiptDate: receiptDialog.form.receiptDate, // 添加驼峰命名格式
      supplier_id: receiptDialog.form.supplierId,
      supplierId: receiptDialog.form.supplierId, // 添加驼峰命名格式
      receiver: receiptDialog.form.receiver,
      warehouse_id: receiptDialog.form.warehouseId,
      warehouseId: receiptDialog.form.warehouseId, // 添加驼峰命名格式
      remarks: receiptDialog.form.remarks,
      items: receiptDialog.form.items.map(item => ({
        id: item.id, // 添加物料项ID，编辑时必需
        material_id: item.materialId,
        materialId: item.materialId, // 添加驼峰命名格式
        received_quantity: item.receivedQuantity,
        receivedQuantity: item.receivedQuantity, // 添加驼峰命名格式
        qualified_quantity: item.qualifiedQuantity,
        qualifiedQuantity: item.qualifiedQuantity, // 添加驼峰命名格式
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
      showSnackbar(message, 'success');
      closeReceiptDialog();
      loadReceipts(); // 修改为调用loadReceipts方法而不是fetchData
    }
  } catch (error) {
    console.error('提交收货单失败:', error);
    showSnackbar('提交收货单失败: ' + (error.response?.data?.message || error.message), 'error');
  } finally {
    submitLoading.value = false;
  }
};

// 直接取消收货单
const cancelReceipt = async (receipt) => {
  updateStatusLoading.value = true;
  try {
    const response = await purchaseApi.updateReceiptStatus(receipt.id, {
      status: 'cancelled',
      remarks: '用户手动取消'
    });

    // 拦截器已解包，如果业务失败会抛出错误
    ElMessage.success('收货单已取消');
    loadReceipts();
  } catch (error) {
    console.error('取消收货单失败:', error);
    ElMessage.error('取消收货单失败: ' + (error.message || '未知错误'));
  } finally {
    updateStatusLoading.value = false;
  }
};


// 加载收货单统计数据
const loadReceiptStats = async () => {
  try {
    // 检查purchaseApi是否存在且getReceiptStats是一个函数
    if (!purchaseApi) {
      console.error('purchaseApi对象未定义!');
      // 设置默认值
      receiptStats.value = {
        total: 0,
        draftCount: 0,
        confirmedCount: 0,
        completedCount: 0,
        totalAmount: 0
      };
      return;
    }
    
    if (typeof purchaseApi.getReceiptStats !== 'function') {
      console.error('purchaseApi.getReceiptStats不是一个函数！');
      
      // 尝试重新构建一个getReceiptStats函数
      const tempGetStats = async () => {
        try {
          const response = await axios.get(API_URL + '/api/purchase/receipts-statistics');
          return response;
        } catch (error) {
          console.error('手动调用收货单统计API失败:', error);
          return {
            data: {
              total: 0,
              draftCount: 0,
              confirmedCount: 0,
              completedCount: 0,
              totalAmount: 0
            }
          };
        }
      };
      
      // 使用临时函数获取数据
      const response = await tempGetStats();
      const statsData = response?.data?.data || response?.data;
      if (statsData) {
        receiptStats.value = statsData;
      } else {
        // 设置默认值
        receiptStats.value = {
          total: 0,
          draftCount: 0,
          confirmedCount: 0,
          completedCount: 0,
          totalAmount: 0
        };
      }
      return;
    }
    
    const response = await purchaseApi.getReceiptStats();
    
    const statsData = response?.data?.data || response?.data;
    if (statsData) {
      receiptStats.value = statsData;
    } else {
      console.error('获取收货单统计数据失败: 响应格式不正确', response);
      // 设置默认值
      receiptStats.value = {
        total: 0,
        draftCount: 0,
        confirmedCount: 0,
        completedCount: 0,
        totalAmount: 0
      };
    }
  } catch (error) {
    console.error('获取收货单统计数据失败:', error);
    // 设置默认值
    receiptStats.value = {
      total: 0,
      draftCount: 0,
      confirmedCount: 0,
      completedCount: 0,
      totalAmount: 0
    };
  }
};

// 方法：处理来料检验单选择变更
const handleInspectionChange = async (inspectionId) => {
  if (!inspectionId) {
    receiptDialog.form.items = [];
    return;
  }

  try {
    // 获取来料检验单详情
    const response = await qualityApi.getIncomingInspection(inspectionId);

    if (!response) {
      throw new Error('API响应为空');
    }

    if (!response.data) {
      throw new Error('API响应中没有data字段');
    }

    // 拦截器已解包，response.data 就是业务数据
    // 如果业务失败，拦截器会抛出错误
    const inspection = response.data;

    if (!inspection) {
      throw new Error('无法获取检验单数据');
    }
    
    // 变量定义
    let supplierId = null;
    let supplierName = null;
    let isSupplierFound = false;
    
    // 1. 首先尝试从检验单直接获取供应商信息
    supplierId = inspection.supplier_id || inspection.supplierId || inspection.supplier?.id;
    supplierName = inspection.supplier_name || inspection.supplierName || 
                  inspection.supplier?.name || inspection.supplier?.company_name;
    
    if (supplierId) {
      receiptDialog.form.supplierId = supplierId;
      isSupplierFound = true;
      
      // 如果没有供应商名称，从供应商列表中查找
      if (!supplierName) {
        const supplier = suppliers.value.find(s => Number(s.id) === Number(supplierId) || Number(s.supplier_id) === Number(supplierId));
        if (supplier) {
          supplierName = supplier.name || supplier.supplier_name;
        }
      }
    } else if (supplierName) {
      // 在供应商列表中查找匹配的供应商
      const matchedSupplier = suppliers.value.find(s => 
        s.name === supplierName || 
        s.supplier_name === supplierName || 
        s.companyName === supplierName
      );
      
      if (matchedSupplier) {
        receiptDialog.form.supplierId = matchedSupplier.id || matchedSupplier.supplier_id;
        isSupplierFound = true;
      }
    }
    
    // 2. 如果从检验单中未找到供应商信息，尝试通过reference_id(采购订单ID)获取
    if (!isSupplierFound && inspection.reference_id) {
      try {
        // 尝试获取订单详情
        const orderResponse = await purchaseApi.getOrder(inspection.reference_id);
        if (orderResponse && orderResponse.data) {
          // 支持 ResponseHandler 格式
          const orderData = orderResponse.data?.data || orderResponse.data;

          // 从订单中提取供应商ID和名称
          const orderSupplierId = orderData.supplier_id || orderData.supplierId;
          const orderSupplierName = orderData.supplier_name || orderData.supplierName;

          if (orderSupplierId) {
            receiptDialog.form.supplierId = Number(orderSupplierId);
            isSupplierFound = true;

            // 记录供应商名称
            if (orderSupplierName) {
              supplierName = orderSupplierName;
            }
          }
        }
      } catch (orderError) {
        console.error('获取参考订单信息失败:', orderError);
      }
    }

    // 3. 如果通过reference_no(采购单号)查找
    if (!isSupplierFound && inspection.reference_no) {
      try {
        // 在已加载的订单列表中查找匹配的订单
        const matchedOrder = orders.value.find(order =>
          order.orderNumber === inspection.reference_no ||
          order.order_number === inspection.reference_no ||
          order.no === inspection.reference_no
        );

        if (matchedOrder) {
          const orderSupplierId = matchedOrder.supplier_id || matchedOrder.supplierId;
          const orderSupplierName = matchedOrder.supplier_name || matchedOrder.supplierName;

          if (orderSupplierId) {
            receiptDialog.form.supplierId = Number(orderSupplierId);
            isSupplierFound = true;

            // 记录供应商名称
            if (orderSupplierName) {
              supplierName = orderSupplierName;
              }
          }
        } else {
          // 如果本地没有匹配的订单，尝试从API获取
          const ordersResponse = await purchaseApi.getOrders({
            orderNumber: inspection.reference_no,
            limit: 1
          });

          if (ordersResponse && ordersResponse.data) {
            // 支持 ResponseHandler 格式
            const respData = ordersResponse.data?.data || ordersResponse.data;
            let orderData;
            if (Array.isArray(respData) && respData.length > 0) {
              orderData = respData[0];
            } else if (respData?.items && respData.items.length > 0) {
              orderData = respData.items[0];
            } else if (respData?.list && respData.list.length > 0) {
              orderData = respData.list[0];
            }

            if (orderData) {
              const orderSupplierId = orderData.supplier_id || orderData.supplierId;
              const orderSupplierName = orderData.supplier_name || orderData.supplierName;

              if (orderSupplierId) {
                receiptDialog.form.supplierId = Number(orderSupplierId);
                isSupplierFound = true;
                
                // 记录供应商名称
                if (orderSupplierName) {
                  supplierName = orderSupplierName;
                  }
              }
            }
          }
        }
      } catch (error) {
        console.error('通过订单号查找供应商失败:', error);
      }
    }
    
    // 4. 根据获取到的供应商ID查找供应商对象
    if (isSupplierFound && receiptDialog.form.supplierId && !supplierName) {
      // 在供应商列表中查找匹配的供应商，以获取更多信息
      const supplier = suppliers.value.find(s => 
        Number(s.id) === Number(receiptDialog.form.supplierId) || 
        Number(s.supplier_id) === Number(receiptDialog.form.supplierId)
      );
      
      if (supplier) {
        supplierName = supplier.name || supplier.supplier_name;
      } else {
        console.warn('在供应商列表中未找到ID为', receiptDialog.form.supplierId, '的供应商');

        // 尝试从API获取供应商详情
        try {
          const supplierResponse = await baseDataApi.getSupplier(receiptDialog.form.supplierId);
          if (supplierResponse && supplierResponse.data) {
            // 支持 ResponseHandler 格式
            const supplierData = supplierResponse.data?.data || supplierResponse.data;
            supplierName = supplierData.name || supplierData.supplier_name || supplierData.company_name;
            // 关键修改：将获取到的供应商添加到供应商列表中，确保下拉框能正确显示
            if (!suppliers.value.some(s => Number(s.id) === Number(receiptDialog.form.supplierId))) {
              suppliers.value.push({
                id: receiptDialog.form.supplierId,
                supplier_id: receiptDialog.form.supplierId,
                name: supplierName,
                supplier_name: supplierName
              });
            }
          }
        } catch (suppError) {
          console.error('获取供应商详情失败:', suppError);
        }
      }
    }
    
    // 5. 如果仍未找到供应商，提示用户手动选择
    if (!isSupplierFound) {
      console.warn('无法自动确定供应商，需要手动选择');
      showSnackbar('未能自动识别供应商，请手动选择', 'warning');
    } else {
      // 显示找到的供应商名称
      if (supplierName) {
        // 保存找到的供应商名称到响应式变量
        selectedSupplierName.value = supplierName;
        // 强制更新表单，确保UI显示正确
        setTimeout(() => {
          // 这个小技巧可以强制刷新el-select的显示
          const tempId = receiptDialog.form.supplierId;
          receiptDialog.form.supplierId = null;
          setTimeout(() => {
            receiptDialog.form.supplierId = tempId;
          }, 10);
        }, 100);
      }
    }

    // 检查物料信息 - 从检验单根级别获取
    // 尝试从检验单获取关联订单信息
    if (inspection.reference_id) {
      // 如果检验单中包含reference_id（订单ID）
      const orderId = inspection.reference_id;
      receiptDialog.form.orderId = Number(orderId);
      
      // 在订单列表中查找匹配的订单
      const matchedOrder = orders.value.find(order => Number(order.id) === Number(orderId));
      if (matchedOrder) {
        } else {
        }
    } else if (inspection.reference_no) {
      // 如果检验单中包含reference_no（订单编号）
      const orderNo = inspection.reference_no;
      // 在订单列表中查找匹配的订单
      const matchedOrder = orders.value.find(order => 
        order.orderNumber === orderNo || 
        order.order_number === orderNo ||
        order.order_no === orderNo ||
        order.no === orderNo
      );
      
      if (matchedOrder) {
        receiptDialog.form.orderId = Number(matchedOrder.id);
      } else {
        // 尝试从服务器获取订单信息
        try {
          const ordersResponse = await purchaseApi.getOrders({
            orderNumber: orderNo,
            limit: 1
          });

          if (ordersResponse && ordersResponse.data) {
            // 支持 ResponseHandler 格式
            const respData = ordersResponse.data?.data || ordersResponse.data;
            let orderData;
            if (Array.isArray(respData) && respData.length > 0) {
              orderData = respData[0];
            } else if (respData?.items && respData.items.length > 0) {
              orderData = respData.items[0];
            } else if (respData?.list && respData.list.length > 0) {
              orderData = respData.list[0];
            }

            if (orderData) {
              receiptDialog.form.orderId = Number(orderData.id);
            }
          }
        } catch (orderError) {
          console.error('获取订单信息失败:', orderError);
        }
      }
    }

    // 创建单个物料项
    // ✅ 修复：使用检验单的合格数量，而不是检验数量
    const qualifiedQty = Number(inspection.qualified_quantity) || 0;
    const inspectionQty = Number(inspection.quantity) || 0;

    const materialItem = {
      materialId: inspection.material_id || '',
      materialCode: inspection.material_code || '',
      materialName: inspection.item_name || inspection.material_name || '未知物料',
      specification: inspection.specification || inspection.standard || '',
      unitName: inspection.unit || '个',
      orderedQuantity: inspectionQty,
      receivedQuantity: inspectionQty, // 实收数量等于检验数量
      qualifiedQuantity: qualifiedQty, // ✅ 使用检验单的合格数量
      remarks: inspection.note || ''
    };

    // 设置物料信息
    receiptDialog.form.items = [materialItem];
    
    // 强制更新视图
    receiptDialog.form = { ...receiptDialog.form };
    
    // 显示成功消息
    showSnackbar(`成功加载物料信息`, 'success');
  } catch (error) {
    console.error('获取来料检验单详情失败:', error);
    showSnackbar(`获取来料检验单详情失败: ${error.message || '未知错误'}`, 'error');
    receiptDialog.form.items = [];
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

// 方法：处理当前页面变更
function handleCurrentChange(page) {
  pagination.value.current = page;
  loadReceipts();
}

// 打印收货单 - 使用打印模板系统
async function printReceipt() {
  if (!viewDialog.receipt || !viewDialog.receipt.id) {
    showSnackbar('收货单数据不完整，无法打印', 'warning');
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
    
    // 获取打印模板
    let templateContent = '';
    try {
      const { api } = await import('@/services/api');
      const response = await api.get('/print/templates', {
        params: {
          template_type: 'inbound',
          is_default: 1,
          status: 1
        }
      });
      
      const templates = response.data?.list || response.data?.data || response.data || [];
      const template = Array.isArray(templates) ? templates[0] : null;
      
      if (template && template.content) {
        templateContent = template.content;
      }
    } catch (templateError) {
      console.error('获取打印模板失败:', templateError);
    }
    
    // 如果没有找到模板，提示用户配置
    if (!templateContent) {
      showSnackbar('未找到收货单打印模板，请在系统管理-打印管理中配置 inbound 类型模板', 'warning');
      return;
    }
    
    {
      // 替换模板变量
      const printData = {
        receipt_no: receipt.receipt_no || '-',
        receipt_date: formatDate(receipt.receipt_date) || '-',
        order_no: receipt.order_no || '-',
        supplier_name: receipt.supplier_name || '-',
        receiver: receipt.receiver || '-',
        warehouse_name: receipt.warehouse_name || '-',
        status: getStatusText(receipt.status),
        remarks: receipt.remarks || '-',
        print_date: new Date().toLocaleDateString(),
        print_time: new Date().toLocaleTimeString()
      };
      
      Object.keys(printData).forEach(key => {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
        templateContent = templateContent.replace(regex, printData[key]);
      });
      
      // 处理明细项列表
      if (templateContent.includes('{{#each items}}')) {
        const itemStart = templateContent.indexOf('{{#each items}}');
        const itemEnd = templateContent.indexOf('{{/each}}', itemStart);
        
        if (itemStart !== -1 && itemEnd !== -1) {
          const itemTemplate = templateContent.substring(itemStart + '{{#each items}}'.length, itemEnd);
          let itemsHtml = '';
          
          (receipt.items || []).forEach((item, index) => {
            let itemHtml = itemTemplate;
            itemHtml = itemHtml.replace(/{{index}}/g, (index + 1).toString());
            itemHtml = itemHtml.replace(/{{material_name}}/g, item.material_name || '-');
            itemHtml = itemHtml.replace(/{{specification}}/g, item.specification || '-');
            itemHtml = itemHtml.replace(/{{unit_name}}/g, item.unit_name || '-');
            itemHtml = itemHtml.replace(/{{ordered_quantity}}/g, item.ordered_quantity?.toString() || '0');
            itemHtml = itemHtml.replace(/{{received_quantity}}/g, item.received_quantity?.toString() || '0');
            itemHtml = itemHtml.replace(/{{qualified_quantity}}/g, item.qualified_quantity?.toString() || '0');
            itemHtml = itemHtml.replace(/{{remarks}}/g, item.remarks || '-');
            itemsHtml += itemHtml;
          });
          
          templateContent = templateContent.substring(0, itemStart) + itemsHtml + templateContent.substring(itemEnd + '{{/each}}'.length);
        }
      }
    }
    
    // 创建打印窗口
    const printWindow = window.open('', '_blank');
    printWindow.document.write(templateContent);
    printWindow.document.close();
    
    // 等待页面加载完成后打印
    printWindow.onload = function() {
      printWindow.print();
    };
  } catch (error) {
    console.error('打印失败:', error);
    showSnackbar('打印失败: ' + error.message, 'error');
  }
}

// 方法：获取当前选择的供应商名称
function getSelectedSupplierName(supplierId) {
  if (!supplierId) return '未选择供应商';
  
  // 如果已经有选定的供应商名称，直接返回
  if (selectedSupplierName.value) {
    return selectedSupplierName.value;
  }
  
  // 确保转换为数字类型进行比较
  const numericId = Number(supplierId);

  // 在供应商列表中查找
  const supplier = suppliers.value.find(s => {
    const sid = Number(s.id || s.supplier_id);
    return sid === numericId;
  });

  if (supplier) {
    return supplier.name || supplier.supplier_name;
  } else {
    // 手动遍历供应商列表查找最接近的匹配
    // 返回ID信息
    return `供应商(ID: ${numericId})`;
  }
}

// 方法：获取对象中所有的字符串字段
function getAllStringFields(item) {
  if (!item) return {};
  
  const result = {};
  for (const [key, value] of Object.entries(item)) {
    if (typeof value === 'string' && value.trim() !== '') {
      result[key] = value;
    }
  }
  return result;
}

// 方法：直接完成入库（将状态从草稿直接更新为已完成）
async function directCompleteReceipt(receipt) {
  updateStatusLoading.value = true;

  try {
    await purchaseApi.updateReceiptStatus(receipt.id, {
      status: 'completed',
      remarks: '用户直接确认完成入库'
    });

    showSnackbar('入库单已确认完成', 'success');
    loadReceipts();
  } catch (error) {
    console.error('确认入库失败:', error);
    let errorMessage = '确认入库失败';

    if (error.response && error.response.data) {
      if (typeof error.response.data === 'string') {
        errorMessage += ': ' + error.response.data;
      } else if (error.response.data.message) {
        errorMessage += ': ' + error.response.data.message;
      } else if (error.response.data.error) {
        errorMessage += ': ' + error.response.data.error;
      } else {
        errorMessage += ': ' + (error.message || '未知错误');
      }
    } else {
      errorMessage += ': ' + (error.message || '未知错误');
    }

    showSnackbar(errorMessage, 'error');
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

// 方法：处理合格数量变更
function handleQualifiedQuantityChange(item) {
  // 确保输入的是有效数字
  if (item.qualifiedQuantity) {
    // 移除非数字字符(保留数字和小数点)
    item.qualifiedQuantity = item.qualifiedQuantity.toString().replace(/[^\d.]/g, '');
    
    // 确保只有一个小数点
    const parts = item.qualifiedQuantity.split('.');
    if (parts.length > 2) {
      item.qualifiedQuantity = parts[0] + '.' + parts.slice(1).join('');
    }
    
    // 限制小数点后最多两位
    if (parts.length > 1 && parts[1].length > 2) {
      item.qualifiedQuantity = parts[0] + '.' + parts[1].substring(0, 2);
    }
    
    // 转换为数字类型
    item.qualifiedQuantity = parseFloat(item.qualifiedQuantity);
    
    // 确保合格数量不超过实收数量
    if (item.qualifiedQuantity > item.receivedQuantity) {
      item.qualifiedQuantity = item.receivedQuantity;
    }
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

.no-data-info {
  padding: 20px 0;
}

/* 操作按钮样式 - 与库存出库页面保持一致 */
.el-table .el-button + .el-button {
  margin-left: 8px;
}

/* 对话框高度 - 页面特定，其他样式使用全局主题 */
:deep(.el-dialog__body) {
  max-height: 60vh;
  overflow-y: auto;
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
  .statistics-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .stat-card {
    margin-bottom: 0;
  }
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
