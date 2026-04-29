<!--
/**
 * PurchaseReturns.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="purchase-returns-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>采购退货管理</h2>
          <p class="subtitle">管理采购退货与处理</p>
        </div>
        <el-button type="primary" :icon="Plus" @click="showAddDialog" v-permission="'purchase:returns:create'">新建退货单</el-button>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="退货单号">
          <el-input  v-model="searchForm.returnNo" placeholder="请输入退货单号" clearable ></el-input>
        </el-form-item>
        <el-form-item label="收货单号">
          <el-input  v-model="searchForm.receiptNo" placeholder="请输入收货单号" clearable ></el-input>
        </el-form-item>
        <el-form-item label="退货日期">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          ></el-date-picker>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option label="草稿" value="draft"></el-option>
            <el-option label="已确认" value="confirmed"></el-option>
            <el-option label="已完成" value="completed"></el-option>
            <el-option label="已取消" value="cancelled"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="searchReturns" :loading="loading">
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
        <div class="stat-value">{{ returnStats.total || 0 }}</div>
        <div class="stat-label">退货单总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ returnStats.draftCount || 0 }}</div>
        <div class="stat-label">草稿状态</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ returnStats.confirmedCount || 0 }}</div>
        <div class="stat-label">已确认退货</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ returnStats.completedCount || 0 }}</div>
        <div class="stat-label">已完成退货</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(returnStats.totalAmount || 0) }}</div>
        <div class="stat-label">退货总金额</div>
      </el-card>
    </div>
    
    <!-- 退货单列表 -->
    <el-card class="data-card">
      <el-table
        v-loading="loading"
        :data="returnList"
        border
        style="width: 100%"
      >
        <template #empty>
          <el-empty description="暂无退货单数据" />
        </template>
        <el-table-column prop="returnNumber" label="退货单号" min-width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="returnDate" label="退货日期" min-width="110">
          <template #default="scope">
            {{ formatDate(scope.row.returnDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="receiptNumber" label="关联收货单" min-width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="supplierName" label="供应商" min-width="220" show-overflow-tooltip></el-table-column>
        <el-table-column prop="operatorName" label="经办人" min-width="100"></el-table-column>
        <el-table-column prop="warehouseName" label="出库仓库" min-width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="status" label="状态" min-width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">{{ getStatusText(scope.row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="240" fixed="right">
          <template #default="scope">
            <el-button
              size="small"
              @click="viewReturn(scope.row)"
            >
              查看
            </el-button>
            <el-button
              v-if="scope.row.status === 'draft'"
              size="small"
              type="primary"
              @click="editReturn(scope.row)"
              v-permission="'purchase:returns:update'"
            >
              编辑
            </el-button>
            <el-popconfirm
              v-if="scope.row.status === 'draft'"
              title="确定要删除该退货单吗？此操作无法恢复。"
              @confirm="handleCommand('delete', scope.row)"
              confirm-button-type="danger"
            >
              <template #reference>
                <el-button v-permission="'purchase:returns:update'" size="small" type="danger">删除</el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              v-if="scope.row.status === 'draft'"
              title="确定要确认该退货单吗？"
              @confirm="handleCommand('confirm', scope.row)"
            >
              <template #reference>
                <el-button size="small" type="success" v-permission="'purchase:returns:update'">确认</el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              v-if="['draft', 'confirmed'].includes(scope.row.status)"
              title="确定要取消该退货单吗？"
              @confirm="handleCommand('cancel', scope.row)"
              confirm-button-type="warning"
            >
              <template #reference>
                <el-button size="small" type="warning" v-permission="'purchase:returns:update'">取消</el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              v-if="scope.row.status === 'confirmed'"
              title="确定要完成该退货单吗？"
              @confirm="handleCommand('complete', scope.row)"
            >
              <template #reference>
                <el-button size="small" type="primary" v-permission="'purchase:returns:update'">完成退货</el-button>
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
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        ></el-pagination>
      </div>
    </el-card>
    
    <!-- 查看退货单详情对话框 -->
    <el-dialog
      title="退货单详情"
      v-model="viewDialog.show"
      width="800px"
      destroy-on-close
    >
      <div v-loading="viewDialog.loading">
        <el-descriptions border :column="2">
          <el-descriptions-item label="退货单号">{{ viewDialog.return.returnNumber }}</el-descriptions-item>
          <el-descriptions-item label="退货日期">{{ formatDate(viewDialog.return.returnDate) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(viewDialog.return.status)">{{ getStatusText(viewDialog.return.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="关联收货单">{{ viewDialog.return.receiptNumber }}</el-descriptions-item>
          <el-descriptions-item label="供应商">{{ viewDialog.return.supplierName }}</el-descriptions-item>
          <el-descriptions-item label="经办人">{{ viewDialog.return.operatorName || viewDialog.return.operator || '未知' }}</el-descriptions-item>
          <el-descriptions-item label="出库仓库">{{ viewDialog.return.warehouseName }}</el-descriptions-item>
          <el-descriptions-item label="退货原因" :span="2">{{ viewDialog.return.reason }}</el-descriptions-item>
        </el-descriptions>
        
        <el-divider content-position="center">退货物料</el-divider>
        <el-table :data="viewDialog.return.items || []" border style="width: 100%">
          <el-table-column type="index" label="序号" width="60" align="center"></el-table-column>
          <el-table-column label="物料名称" prop="materialName" min-width="150" show-overflow-tooltip></el-table-column>
          <el-table-column label="规格" prop="specification" min-width="150" show-overflow-tooltip></el-table-column>
          <el-table-column label="单位" prop="unitName" min-width="80" show-overflow-tooltip></el-table-column>
          <el-table-column label="收货数量" prop="receivedQuantity" min-width="100" align="center"></el-table-column>
          <el-table-column label="退货数量" prop="returnQuantity" min-width="100" align="center"></el-table-column>
          <el-table-column label="单价" min-width="100" align="center">
            <template #default="scope">
              ¥{{ parseFloat(scope.row.price || 0).toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column label="金额" min-width="100" align="center">
            <template #default="scope">
              ¥{{ (scope.row.returnQuantity * scope.row.price).toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column label="退货原因" prop="returnReason" min-width="150" show-overflow-tooltip></el-table-column>
        </el-table>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="viewDialog.show = false">关闭</el-button>
          <el-button v-permission="'purchase:returns:view'" type="primary" @click="printReturn" v-if="viewDialog.return.id">打印</el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 新建/编辑退货单对话框 -->
    <el-dialog
      :title="returnDialog.isEdit ? '编辑退货单' : '新建退货单'"
      v-model="returnDialog.show"
      width="1100px"
      destroy-on-close
    >
      <div v-loading="returnDialog.loading">
      <el-form ref="returnForm" :model="returnDialog.form" :rules="returnRules" label-width="100px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="关联收货单" prop="receiptId">
              <el-select
                v-model="returnDialog.form.receiptId"
                placeholder="请选择收货单"
                filterable
                style="width: 100%"
                @change="handleReceiptChange"
              >
                <el-option
                  v-for="item in receipts"
                  :key="item.id || ''"
                  :label="item.receiptNumber || '未知收货单'"
                  :value="item.id || ''"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="退货日期" prop="returnDate">
              <el-date-picker
                v-model="returnDialog.form.returnDate"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              ></el-date-picker>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="经办人">
              <el-input v-model="returnDialog.form.operator" disabled placeholder="自动获取当前用户"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="出库仓库">
              <el-input v-model="returnDialog.form.warehouseName" disabled placeholder="从收货单自动获取"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="退货原因" prop="reason">
              <el-input
                v-model="returnDialog.form.reason"
                type="textarea"
                :rows="2"
                placeholder="请输入退货原因"
              ></el-input>
            </el-form-item>
          </el-col>
        </el-row>
        
        <div class="mt-4">
          <div class="mb-2 font-weight-bold">物料清单</div>
          <el-table :data="returnDialog.form.items" border style="width: 100%">
            <el-table-column type="index" label="序号" width="50" align="center"></el-table-column>
            <el-table-column label="物料名称" prop="materialName" min-width="150"></el-table-column>
            <el-table-column label="规格" prop="specification" min-width="120"></el-table-column>
            <el-table-column label="单位" prop="unitName" min-width="80"></el-table-column>
            <el-table-column label="收货数量" min-width="100" align="center">
              <template #default="scope">
                {{ scope.row.receivedQuantity }}
              </template>
            </el-table-column>
            <el-table-column label="退货数量" min-width="120" align="center">
              <template #default="scope">
                <el-input-number
                  v-model="scope.row.returnQuantity"
                  :min="0"
                  :max="scope.row.receivedQuantity"
                  :precision="2"
                  :step="1"
                  controls-position="right"
                  size="small"

                ></el-input-number>
              </template>
            </el-table-column>
            <el-table-column label="单价" min-width="130" align="center">
              <template #default="scope">
                <el-input-number
                  v-model="scope.row.price"
                  :min="0"
                  :precision="2"
                  :step="0.01"
                  controls-position="right"
                  size="small"

                ></el-input-number>
              </template>
            </el-table-column>
            <el-table-column label="金额" min-width="100" align="center">
              <template #default="scope">
                ¥{{ ((scope.row.returnQuantity || 0) * (scope.row.price || 0)).toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column label="退货原因" min-width="180">
              <template #default="scope">
                <el-select 
                  v-model="scope.row.returnReason" 
                  placeholder="请选择" 
                  size="small"
                  style="width: 100%"
                  :disabled="!scope.row.returnQuantity"
                >
                  <el-option 
                    v-for="reason in returnReasons" 
                    :key="reason"
                    :label="reason" 
                    :value="reason"
                  ></el-option>
                </el-select>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-form>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="closeReturnDialog">取 消</el-button>
          <el-button type="primary" @click="submitReturn" :loading="submitLoading">确 定</el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 状态更新确认对话框 -->
    <el-dialog
      v-model="statusDialog.visible"
      :title="statusDialog.title"
      width="500px"
      destroy-on-close
    >
      <div v-loading="statusDialog.loading">
        <div>您确定要{{ statusDialog.description }}吗？</div>
      </div>
      <template #footer>
        <el-button @click="statusDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="updateStatus">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { parseListData, parsePaginatedData } from '@/utils/responseParser';

import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search, Refresh } from '@element-plus/icons-vue';
import { useSnackbar } from '@/composables/useSnackbar';
import { useAuthStore } from '@/stores/auth';
import { purchaseApi } from '@/services/api';
import { baseDataApi } from '@/services/api';
import { formatCurrency } from '@/utils/helpers/formatters';
import {
  PURCHASE_RETURN_STATUS_OPTIONS,
  getPurchaseReturnStatusText,
  getPurchaseReturnStatusColor
} from '@/constants/systemConstants';

const { showSnackbar } = useSnackbar();
const authStore = useAuthStore();

// 表格列定义
const headers = [
  { text: '退货单号', value: 'returnNumber', sortable: true },
  { text: '退货日期', value: 'returnDate', sortable: true },
  { text: '关联收货单', value: 'receiptNumber', sortable: true },
  { text: '供应商', value: 'supplierName', sortable: true },
  { text: '经办人', value: 'handler', sortable: true },
  { text: '出库仓库', value: 'warehouseName', sortable: true },
  { text: '状态', value: 'status', sortable: true },
  { text: '操作', value: 'actions', sortable: false, align: 'center' }
];

const itemHeaders = [
  { text: '物料名称', value: 'materialName' },
  { text: '规格', value: 'specification' },
  { text: '单位', value: 'unitName' },
  { text: '收货数量', value: 'receivedQuantity', align: 'center' },
  { text: '退货数量', value: 'returnQuantity', align: 'center' },
  { text: '退货原因', value: 'reason' }
];

const viewItemHeaders = [
  { text: '物料名称', value: 'materialName' },
  { text: '规格', value: 'specification' },
  { text: '单位', value: 'unitName' },
  { text: '收货数量', value: 'receivedQuantity', align: 'center' },
  { text: '退货数量', value: 'returnQuantity', align: 'center' },
  { text: '退货原因', value: 'returnReason' }
];

// 状态选项（使用统一常量）
const statusOptions = PURCHASE_RETURN_STATUS_OPTIONS.map(opt => ({ text: opt.label, value: opt.value }));

// 退货原因选项
const returnReasons = [
  '质量问题',
  '物料损坏',
  '规格错误',
  '数量不符',
  '交期延迟',
  '其他原因'
];

// 退货单数据
const returnList = ref([]);
const loading = ref(false);
const pagination = ref({ current: 1, size: 10, total: 0 });

// 供应商、收货单和仓库
const suppliers = ref([]);
const receipts = ref([]);
const warehouses = ref([]);

// 搜索表单
const searchForm = reactive({
  returnNo: '',
  receiptNo: '',
  dateRange: [],
  status: ''
});

// 新建/编辑退货单对话框
const returnDialog = reactive({
  show: false,
  isEdit: false,
  loading: false,
  valid: false,
  dateMenu: false,
  form: {
    id: null,
    receiptId: null,
    returnDate: new Date().toISOString().substr(0, 10),
    operator: '',
    warehouseId: null,
    warehouseName: '',
    reason: '',
    items: []
  }
});

// 查看退货单详情对话框
const viewDialog = reactive({
  show: false,
  loading: false,
  return: {}
});

// 状态更新对话框
const statusDialog = reactive({
  visible: false,
  loading: false,
  title: '',
  description: '',
  returnId: null,
  newStatus: ''
});

// 计算是否有需要退货的物料
const hasReturnItems = computed(() => {
  return returnDialog.form.items.some(item => item.returnQuantity > 0);
});

// 退货单统计数据
const returnStats = ref({
  total: 0,
  draftCount: 0,
  confirmedCount: 0,
  completedCount: 0,
  totalAmount: 0
});

// 提交状态
const submitLoading = ref(false);
const detailLoading = ref(false);
const updateStatusLoading = ref(false);

// 表单验证规则
const returnRules = {
  receiptId: [{ required: true, message: '请选择关联收货单', trigger: 'change' }],
  returnDate: [{ required: true, message: '请选择退货日期', trigger: 'change' }]
};


// 加载退货单统计数据
const loadReturnStats = async () => {
  try {
    const response = await purchaseApi.getReturnStats();
    const data = response.data;

    // 映射后端字段到前端期望的字段
    returnStats.value = {
      total: data.totalCount || data.total_count || 0,
      draftCount: data.pendingCount || data.pending_count || 0,
      confirmedCount: data.approvedCount || data.approved_count || 0,
      completedCount: data.completedCount || data.completed_count || 0,
      totalAmount: data.totalAmount || data.total_amount || 0
    };
  } catch (error) {
    console.error('获取退货单统计信息失败:', error);
    // 设置默认值
    returnStats.value = {
      total: 0,
      draftCount: 0,
      confirmedCount: 0,
      completedCount: 0,
      totalAmount: 0
    };
  }
};

// 生命周期钩子
onMounted(async () => {
  await Promise.all([
    loadReturns(),
    loadSuppliers(),
    loadCompletedReceipts(),
    loadWarehouses(),
    loadReturnStats()
  ]);
});

// 方法：加载退货单列表
async function loadReturns() {
  loading.value = true;
  try {
    const params = {
      page: pagination.value.current,
      pageSize: pagination.value.size,
      returnNo: searchForm.returnNo || undefined,
      receiptNo: searchForm.receiptNo || undefined,
      status: searchForm.status || undefined,
      startDate: searchForm.dateRange?.[0] || undefined,
      endDate: searchForm.dateRange?.[1] || undefined
    };
    
    const response = await purchaseApi.getReturns(params);
    const paginated = parsePaginatedData(response);
    
    let returnsData = paginated.list || [];
    let paginationData = { total: paginated.total };

    // 映射后端字段名到前端字段名
    returnList.value = returnsData.map(item => ({
      id: item.id,
      returnNumber: item.return_no,
      returnDate: item.return_date,
      receiptNumber: item.receipt_no,
      supplierName: item.supplier_name || '未知供应商',
      warehouseName: item.warehouse_name || '未知仓库',
      operatorName: item.operator_name || item.operator,
      status: item.status,
      reason: item.reason,
      totalAmount: item.total_amount,
      remarks: item.remarks,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      // 保留原始数据以备后用
      ...item
    }));

    pagination.value.total = parseInt(paginationData.total) || 0;
  } catch (error) {
    console.error('加载退货单失败:', error);
    showSnackbar('加载退货单失败: ' + (error.message || '未知错误'), 'error');
    // 出错时设置为空数组，避免类型错误
    returnList.value = [];
  } finally {
    loading.value = false;
  }
  
  await loadReturnStats();
}

// 方法：加载供应商列表
async function loadSuppliers() {
  try {
    const response = await baseDataApi.getSuppliers();
    // 兼容不同的数据结构
    if (Array.isArray(response.data)) {
    suppliers.value = response.data;
    } else if (Array.isArray(response)) {
      suppliers.value = response;
    } else {
      suppliers.value = [];
    }
    
    } catch (error) {
    console.error('加载供应商失败:', error);
    showSnackbar('加载供应商失败', 'error');
    suppliers.value = [];
  }
}

// 方法：加载已完成的收货单
async function loadCompletedReceipts() {
  try {
    const response = await purchaseApi.getReceipts({
      status: 'completed',
      limit: 100
    });

    // 使用统一解析器
    const receiptsData = parseListData(response, { enableLog: false });

    // 确保所有属性都有有效值并映射到组件需要的格式
    receipts.value = receiptsData
      .filter(item => item && item.id)
      .map(item => ({
        id: item.id,
        receiptNumber: item.receipt_no || '未知收货单号',
        orderNumber: item.order_no || '',
        receiptDate: item.receipt_date || '',
        supplierName: item.supplier_name || '',
        warehouseId: item.warehouse_id || null,
        warehouseName: item.warehouse_name || '',
        status: item.status || '',
        items: Array.isArray(item.items) ? item.items : []
      }));

    } catch (error) {
    console.error('加载收货单失败:', error);
    showSnackbar('加载收货单失败', 'error');
    receipts.value = []; // 出错时设置为空数组
  }
}

// 方法：加载仓库列表
async function loadWarehouses() {
  try {
    const response = await baseDataApi.getWarehouses();

    // 拦截器已解包，response.data 就是业务数据
    if (Array.isArray(response.data)) {
      warehouses.value = response.data;
    } else if (response.data?.list) {
      warehouses.value = response.data.list;
    } else if (Array.isArray(response)) {
      warehouses.value = response;
    } else {
      warehouses.value = [];
    }

    } catch (error) {
    console.error('加载仓库失败:', error);
    showSnackbar('加载仓库失败', 'error');
    warehouses.value = [];
  }
}

// 方法：重置搜索条件
function resetSearch() {
  searchForm.returnNo = '';
  searchForm.receiptNo = '';
  searchForm.dateRange = [];
  searchForm.status = '';
  pagination.value.current = 1;
  loadReturns();
}

// 方法：获取状态颜色类型
function getStatusType(status) {
  return getPurchaseReturnStatusColor(status);
}

// 方法：获取状态文本（使用统一常量）
function getStatusText(status) {
  return getPurchaseReturnStatusText(status);
}

// 方法：格式化日期
function formatDate(date) {
  if (!date) return '';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    return d.toISOString().split('T')[0];
  } catch {
    return date;
  }
}

// 方法：打开创建退货单对话框
function showAddDialog() {
  returnDialog.isEdit = false;

  returnDialog.form = {
    id: null,
    receiptId: null,
    returnDate: new Date().toISOString().substring(0, 10),
    operator: authStore.realName || authStore.username || '系统用户',  // 使用真实姓名或用户名
    warehouseId: null,
    warehouseName: '',
    reason: '',
    items: []
  };
  returnDialog.show = true;
}

// 方法：关闭退货单对话框
function closeReturnDialog() {
  returnDialog.show = false;
}

// 方法：查看退货单详情
async function viewReturn(returnItem) {
  viewDialog.show = true;
  viewDialog.loading = true;
  try {
    // 调用API获取完整的退货单详情（包括退货物料）
    const response = await purchaseApi.getReturn(returnItem.id);
    const returnData = response.data || response;

    // 设置详情数据
    viewDialog.return = {
      ...returnData,
      // 确保字段名映射正确
      returnNumber: returnData.return_no || returnData.returnNumber,
      returnDate: returnData.return_date || returnData.returnDate,
      receiptNumber: returnData.receipt_no || returnData.receiptNumber,
      supplierName: returnData.supplier_name || returnData.supplierName,
      warehouseName: returnData.warehouse_name || returnData.warehouseName,
      operatorName: returnData.operator_name || returnData.operator,
      reason: returnData.reason,
      status: returnData.status,
      // 映射退货物料字段
      items: (returnData.items || []).map(item => ({
        id: item.id,
        materialName: item.material_name,
        specification: item.specification || '',
        unitName: item.unit || '',
        receivedQuantity: item.quantity || 0,
        returnQuantity: item.return_quantity || 0,
        price: item.price || 0,
        returnReason: item.return_reason || ''
      }))
    };
  } catch (error) {
    console.error('获取退货单详情失败:', error);
    showSnackbar('获取退货单详情失败', 'error');
    viewDialog.show = false;
  } finally {
    viewDialog.loading = false;
  }
}

// 方法：编辑退货单
async function editReturn(returnItem) {
  returnDialog.isEdit = true;
  returnDialog.show = true;
  returnDialog.loading = true;
  try {
    // 获取完整的退货单详情
    const response = await purchaseApi.getReturn(returnItem.id);
    const returnData = response.data || response;

    returnDialog.form = {
      id: returnData.id,
      receiptId: returnData.receipt_id,  // 使用数据库字段名
      returnDate: returnData.return_date ? returnData.return_date.split('T')[0] : new Date().toISOString().substring(0, 10),
      operator: returnData.operator_name || returnData.operator,
      warehouseId: returnData.warehouse_id,  // 使用数据库字段名
      warehouseName: returnData.warehouse_name || '',
      reason: returnData.reason,
      items: [...(returnData.items || [])].map(item => ({
        id: item.id,
        materialId: item.material_id,
        materialCode: item.material_code || '',
        materialName: item.material_name,
        specification: item.specification || '',
        unitId: item.unit_id,
        unitName: item.unit || '',
        receivedQuantity: item.quantity || 0,
        returnQuantity: Number(item.return_quantity || 0),
        price: item.price || 0,
        returnReason: item.return_reason || ''
      }))
    };

    // 如果有收货单ID，触发收货单变更以加载相关数据
    if (returnDialog.form.receiptId) {
      await handleReceiptChange(returnDialog.form.receiptId);
    }
  } catch (error) {
    console.error('获取退货单详情失败:', error);
    showSnackbar('获取退货单详情失败', 'error');
    returnDialog.show = false;
  } finally {
    returnDialog.loading = false;
  }
}

// 方法：处理收货单选择变更
async function handleReceiptChange(receiptId) {
  if (!receiptId) {
    returnDialog.form.items = [];
    returnDialog.form.warehouseId = null;
    returnDialog.form.warehouseName = '';
    return;
  }

  try {
    // 获取收货单详情以获取物料信息
    const response = await purchaseApi.getReceipt(receiptId);
    // 兼容不同数据结构
    let receiptData = {};
    if (response.data) {
      receiptData = response.data;
    } else {
      receiptData = response || {};
    }

    // 确保物料项格式正确
    let items = [];
    if (Array.isArray(receiptData.items)) {
      items = receiptData.items;
    } else {
      items = [];
    }

    // 在编辑模式下，保留已有的退货数量和原因
    const existingItems = returnDialog.isEdit ? returnDialog.form.items : [];

    // 清空现有物料并添加收货单中的物料
    returnDialog.form.items = items.map(item => {
      // 在编辑模式下，查找是否已有该物料的退货信息
      const existingItem = existingItems.find(existing =>
        existing.materialId === item.material_id
      );

      return {
        materialId: item.material_id,
        materialCode: item.material_code || '',
        materialName: item.material_name || '',
        specification: item.specs || item.specification || '',
        unitId: item.unit_id,
        unitName: item.unit_name || '',
        receivedQuantity: Number(item.received_quantity || item.quantity || 0),
        returnQuantity: existingItem ? existingItem.returnQuantity : 0,
        price: Number(item.price || 0),
        returnReason: existingItem ? existingItem.returnReason : ''
      };
    });

    // ✅ 自动设置仓库信息(从收货单获取)
    returnDialog.form.warehouseId = receiptData.warehouse_id;
    returnDialog.form.warehouseName = receiptData.warehouse_name || '';
  } catch (error) {
    showSnackbar('获取收货单详情失败', 'error');
  }
}

// 方法：提交退货单
async function submitReturn() {
  // 检查是否有退货物料
  if (!hasReturnItems.value) {
    showSnackbar('请至少选择一种物料进行退货', 'warning');
    return;
  }

  // 验证退货数量
  for (const item of returnDialog.form.items) {
    if (item.returnQuantity < 0 || item.returnQuantity > item.receivedQuantity) {
      showSnackbar(`物料 ${item.materialName} 的退货数量必须在0至收货数量之间`, 'warning');
      return;
    }
    
    if (item.returnQuantity > 0 && !item.returnReason) {
      showSnackbar(`请为退货物料 ${item.materialName} 选择退货原因`, 'warning');
      return;
    }
  }

  try {
    submitLoading.value = true;
    
    // 筛选出退货数量大于0的物料
    const returnItems = returnDialog.form.items
      .filter(item => item.returnQuantity > 0)
      .map(item => ({
        materialId: item.materialId,
        materialCode: item.materialCode,
        materialName: item.materialName,
        specification: item.specification,
        unitId: item.unitId,
        unitName: item.unitName,
        quantity: Number(item.receivedQuantity),
        returnQuantity: Number(item.returnQuantity),
        price: Number(item.price),
        returnReason: item.returnReason
      }));

    // 计算总金额
    const totalAmount = returnItems.reduce((sum, item) => {
      return sum + (item.returnQuantity * item.price);
    }, 0);

    // ✅ 准备提交数据 - 使用operator字段而不是handler
    const returnData = {
      id: returnDialog.form.id,
      receiptId: returnDialog.form.receiptId,
      returnDate: returnDialog.form.returnDate,
      operator: returnDialog.form.operator || authStore.realName || authStore.username || '系统用户',  // ✅ 使用operator
      warehouseId: returnDialog.form.warehouseId,
      reason: returnDialog.form.reason || '',
      status: 'draft',
      totalAmount,
      items: returnItems
    };

    if (returnDialog.isEdit) {
      await purchaseApi.updateReturn(returnDialog.form.id, returnData);
      showSnackbar('退货单更新成功', 'success');
    } else {
      await purchaseApi.createReturn(returnData);
      showSnackbar('退货单创建成功', 'success');
    }

    returnDialog.show = false;
    loadReturns();
  } catch (error) {
    showSnackbar('提交退货单失败: ' + (error.message || '未知错误'), 'error');
  } finally {
    submitLoading.value = false;
  }
}

// 处理下拉菜单命令
const handleCommand = (command, row) => {
  switch (command) {
    case 'confirm':
      directUpdateStatus(row.id, 'confirmed');
      break;
    case 'complete':
      directUpdateStatus(row.id, 'completed');
      break;
    case 'cancel':
      directUpdateStatus(row.id, 'cancelled');
      break;
    case 'delete':
      handleDelete(row);
      break;
  }
};

// 显示状态更新对话框
const showStatusDialog = (id, newStatus, title, description) => {
  statusDialog.returnId = id;
  statusDialog.newStatus = newStatus;
  statusDialog.title = title;
  statusDialog.description = description;
  statusDialog.visible = true;
};

// 确认删除
// 确认删除（保留给可能未使用 popconfirm 的地方使用，如果有的话）
const confirmDelete = (row) => {
  ElMessageBox.confirm(
    `确定要删除退货单 ${row.returnNumber} 吗？`,
    '确认删除',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).then(async () => {
    await handleDelete(row);
  }).catch(() => {
    // 用户取消删除
  });
};

// 执行删除逻辑
const handleDelete = async (row) => {
    try {
      await purchaseApi.deleteReturn(row.id);
      ElMessage.success('删除成功');
      loadReturns();
    } catch (error) {
      console.error('删除退货单失败:', error);
      ElMessage.error('删除失败: ' + (error.response?.data?.error || error.message));
    }
}

// 直接更新状态（绕过对话框）
const directUpdateStatus = async (id, newStatus) => {
  try {
    statusDialog.loading = true;

    await purchaseApi.updateReturnStatus(
      id,
      { newStatus: newStatus }
    );

    ElMessage.success('状态更新成功');
    loadReturns();
  } catch (error) {
    console.error('更新状态失败:', error);
    ElMessage.error('更新状态失败: ' + (error.response?.data?.error || error.message));
  } finally {
    statusDialog.loading = false;
  }
};

// 更新状态 (保留给对话框使用，虽然目前可能不再使用)
const updateStatus = async () => {
    // 复用逻辑
  await directUpdateStatus(statusDialog.returnId, statusDialog.newStatus);
  statusDialog.visible = false;
};

// 方法：搜索退货单
function searchReturns() {
  pagination.value.current = 1;
  loadReturns();
}

// 方法：处理页面大小变化
function handleSizeChange(size) {
  pagination.value.size = size;
  loadReturns();
}

// 方法：处理页码变化
function handleCurrentChange(current) {
  pagination.value.current = current;
  loadReturns();
}

// 方法：打印退货单
function printReturn() {
  // 实现打印功能
  window.print();
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

.mt-4 {
  margin-top: var(--spacing-base);
}

.mb-2 {
  margin-bottom: 8px;
}

.font-weight-bold {
  font-weight: bold;
}

/* 操作按钮样式 - 与库存出库页面保持一致 */
.el-table .el-button + .el-button {
  margin-left: 8px;
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